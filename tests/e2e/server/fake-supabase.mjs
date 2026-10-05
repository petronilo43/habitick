// A stand-in for a Supabase project, for the browser tests.
//
// The tests must not depend on (or write to) a real Supabase project, so this small
// server pretends to be one on http://localhost:54321. It is not a mock of the app's
// logic: it loads the REAL supabase/schema.sql into a Postgres that runs in memory
// and runs the REAL payment function from supabase/functions/payments. What it fakes
// is only the plumbing around them:
//
//   /auth/v1/...        sign-up, login, guests, password changes (no emails are sent)
//   /rest/v1/...        reading tables and views, calling database functions
//   /functions/v1/...   the payment function
//   /stripe/...         a pretend Stripe: creates checkouts and shows a "Pay" page
//   /__test/...         helpers for the tests: reset everything, run SQL
//
// It understands only the requests this app makes. Start it with:
//   node tests/e2e/server/fake-supabase.mjs

import http from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const PORT = 54321
const BASE = `http://localhost:${PORT}`
const SERVICE_KEY = 'e2e-secret-key'
const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

// ---- the database: the real schema, in memory -----------------------------------

// Real Supabase sends a date column as plain text ("2026-10-12"), so do the same.
const db = new PGlite({ parsers: { 1082: (value) => value } })
await db.exec(read('tests/helpers/supabase-stub.sql'))
await db.exec(read('supabase/schema.sql'))

// ---- the payment function: the real code, given this server's addresses ------------

// The function is plain JavaScript in a .ts file, so it is loaded from its text.
const paymentsSource = read('supabase/functions/payments/index.ts')
const { handleRequest: payments } = await import(`data:text/javascript;base64,${Buffer.from(paymentsSource).toString('base64')}`)

const FUNCTION_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_e2e',
  STRIPE_API_URL: `${BASE}/stripe`,
  SUPABASE_URL: BASE,
  SUPABASE_ANON_KEY: 'e2e-publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
}

// ---- what a login service remembers -----------------------------------------------

const passwords = new Map() // email -> password
const refreshTokens = new Map() // refresh token -> user id
const checkouts = new Map() // pretend Stripe checkout id -> its details

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

async function userById(id) {
  const { rows } = await db.query('select id, email, raw_user_meta_data, is_anonymous, created_at from auth.users where id = $1', [id])
  const user = rows[0]
  if (!user) return null
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email ?? undefined,
    is_anonymous: user.is_anonymous,
    app_metadata: {},
    user_metadata: user.raw_user_meta_data,
    created_at: user.created_at,
  }
}

// A session, shaped like the real thing. The token is not signed: this is a test server.
async function sessionFor(id) {
  const user = await userById(id)
  const expires_at = Math.floor(Date.now() / 1000) + 3600
  const access_token = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: id, exp: expires_at, role: 'authenticated' }), 'e2e'].join('.')
  const refresh_token = randomUUID()
  refreshTokens.set(refresh_token, id)
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at, refresh_token, user }
}

function bearer(request) {
  return (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
}

// The id of the logged-in person, read from their token. Null for anyone else.
function userIdOf(request) {
  const parts = bearer(request).split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).sub ?? null
  } catch {
    return null
  }
}

// Runs SQL the way Supabase would for this request: as the server (secret key), as a
// logged-in person, or as a visitor. The schema's access rules do the rest.
async function asCaller(request, work) {
  const user = userIdOf(request)
  const role = user ? 'authenticated' : request.headers.apikey === SERVICE_KEY ? 'service_role' : 'anon'
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ''])
    return work(tx)
  })
}

// ---- answering -------------------------------------------------------------------

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...CORS, ...headers })
  response.end(body === undefined ? '' : JSON.stringify(body))
}

function sendHtml(response, html) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(html)
}

// A database error, in the shape the Supabase client expects.
function sendDatabaseError(response, error) {
  const forbidden = error.code === '42501'
  send(response, forbidden ? 403 : 400, { code: error.code ?? 'XX000', message: error.message, details: null, hint: null })
}

const NAME = /^[a-z_][a-z0-9_]*$/

// ?id=eq.123&order=sort_order.asc  ->  the WHERE and ORDER BY parts of a query
function filters(url) {
  const where = []
  const values = []
  let order = ''
  for (const [key, value] of url.searchParams) {
    if (key === 'select') continue
    if (key === 'order') {
      const [column, direction = 'asc'] = value.split('.')
      if (!NAME.test(column) || !['asc', 'desc'].includes(direction)) throw new Error(`cannot order by ${value}`)
      order = ` order by ${column} ${direction}`
    } else {
      if (!NAME.test(key) || !value.startsWith('eq.')) throw new Error(`this test server only knows "eq" filters, not ${key}=${value}`)
      values.push(value.slice(3))
      where.push(`${key} = $${values.length}`)
    }
  }
  return { where: where.length ? ` where ${where.join(' and ')}` : '', values, order }
}

// ---- the routes -------------------------------------------------------------------

async function auth(request, response, url, body) {
  if (url.pathname === '/auth/v1/signup') {
    // No email means a guest ("anonymous sign-in").
    if (!body.email) {
      const { rows } = await db.query(`insert into auth.users (is_anonymous) values (true) returning id`)
      return send(response, 200, await sessionFor(rows[0].id))
    }
    const taken = await db.query('select 1 from auth.users where email = $1', [body.email])
    if (taken.rows.length) return send(response, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
    const { rows } = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [
      body.email,
      JSON.stringify(body.data ?? {}),
    ])
    passwords.set(body.email, body.password)
    // Addresses at confirm.test behave like a project with "Confirm email" switched on.
    if (body.email.endsWith('@confirm.test')) return send(response, 200, await userById(rows[0].id))
    return send(response, 200, await sessionFor(rows[0].id))
  }

  if (url.pathname === '/auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const id = refreshTokens.get(body.refresh_token)
      if (!id || !(await userById(id))) return send(response, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
      return send(response, 200, await sessionFor(id))
    }
    // The account has to still exist: deleting it removes the row but not the remembered password.
    const { rows } = await db.query('select id from auth.users where email = $1', [body.email])
    if (!rows[0] || passwords.get(body.email) !== body.password) {
      return send(response, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }
    return send(response, 200, await sessionFor(rows[0].id))
  }

  if (url.pathname === '/auth/v1/user') {
    const user = await userById(userIdOf(request))
    if (!user) return send(response, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid token' })
    if (request.method === 'PUT' && body.password) passwords.set(user.email, body.password)
    return send(response, 200, user)
  }

  if (url.pathname === '/auth/v1/logout') return send(response, 204)
  if (url.pathname === '/auth/v1/recover') return send(response, 200, {}) // a real project would send the email here

  send(response, 404, { msg: `the test server has no ${url.pathname}` })
}

async function rest(request, response, url, body) {
  // Calling a database function: POST /rest/v1/rpc/<name> with its arguments as JSON.
  const functionName = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1]
  if (functionName) {
    const names = Object.keys(body)
    if (!names.every((name) => NAME.test(name))) throw new Error('bad argument name')
    const { rows: about } = await db.query(
      `select p.proretset as many, t.typtype = 'c' as is_row, t.typname as type
         from pg_proc p join pg_type t on t.oid = p.prorettype
        where p.proname = $1 and p.pronamespace = 'public'::regnamespace`,
      [functionName],
    )
    if (!about[0]) return send(response, 404, { code: 'PGRST202', message: `Could not find the function public.${functionName}` })

    const call = `select * from public.${functionName}(${names.map((name, i) => `${name} => $${i + 1}`).join(', ')})`
    const { rows } = await asCaller(request, (tx) => tx.query(call, names.map((name) => body[name])))
    if (about[0].many) return send(response, 200, rows) // a list of rows
    if (about[0].is_row) return send(response, 200, rows[0]) // one row
    if (about[0].type === 'void') return send(response, 204)
    return send(response, 200, rows[0][functionName]) // a single value
  }

  // Reading or updating a table or view.
  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1]
  if (!table) return send(response, 404, { message: `the test server has no ${url.pathname}` })
  const { where, values, order } = filters(url)

  let rows
  if (request.method === 'GET') {
    rows = (await asCaller(request, (tx) => tx.query(`select * from public.${table}${where}${order}`, values))).rows
  } else if (request.method === 'PATCH') {
    const columns = Object.keys(body)
    if (!columns.every((column) => NAME.test(column))) throw new Error('bad column name')
    const changes = columns.map((column, i) => `${column} = $${values.length + i + 1}`).join(', ')
    const sql = `update public.${table} set ${changes}${where} returning *`
    rows = (await asCaller(request, (tx) => tx.query(sql, [...values, ...columns.map((column) => body[column])]))).rows
  } else {
    return send(response, 405, { message: 'the test server only reads and updates tables' })
  }

  // .single() in the Supabase client asks for exactly one row as an object.
  if ((request.headers.accept ?? '').includes('vnd.pgrst.object')) {
    if (rows.length === 1) return send(response, 200, rows[0])
    return send(response, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null })
  }
  send(response, 200, rows)
}

// The real payment function, wrapped so it can be called by this plain Node server.
async function functions(request, response, url, rawBody) {
  if (url.pathname !== '/functions/v1/payments') return send(response, 404, { message: 'Function not found' })
  const webRequest = new Request(`${BASE}${url.pathname}`, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? undefined : rawBody,
  })
  const answer = await payments(webRequest, FUNCTION_ENV)
  response.writeHead(answer.status, Object.fromEntries(answer.headers))
  response.end(await answer.text())
}

// A pretend Stripe: just enough of its checkout to be paid, or not, in a test.
async function stripe(request, response, url, rawBody) {
  if (url.pathname === '/stripe/v1/checkout/sessions' && request.method === 'POST') {
    if (bearer(request) !== FUNCTION_ENV.STRIPE_SECRET_KEY) return send(response, 401, { error: { message: 'Invalid API Key provided' } })
    const fields = Object.fromEntries(new URLSearchParams(rawBody))
    const id = `cs_test_${checkouts.size + 1}`
    const metadata = {}
    for (const [key, value] of Object.entries(fields)) {
      const name = key.match(/^metadata\[(.+)\]$/)?.[1]
      if (name) metadata[name] = value
    }
    checkouts.set(id, {
      id,
      payment_status: 'unpaid',
      amount_total: Number(fields['line_items[0][price_data][unit_amount]']),
      name: fields['line_items[0][price_data][product_data][name]'],
      metadata,
      success_url: fields.success_url,
      cancel_url: fields.cancel_url,
    })
    return send(response, 200, { id, url: `${BASE}/stripe/pay/${id}` })
  }

  const id = url.pathname.split('/').pop()
  const checkout = checkouts.get(id)
  if (!checkout) return send(response, 404, { error: { message: `No such checkout.session: ${id}` } })

  if (url.pathname.startsWith('/stripe/v1/checkout/sessions/')) {
    const { payment_status, amount_total, metadata } = checkout
    return send(response, 200, { id, payment_status, amount_total, metadata })
  }

  // The page a person lands on to pay. The real one is Stripe's; this one has two buttons.
  if (request.method === 'GET') {
    return sendHtml(
      response,
      `<!doctype html><title>Test checkout</title>
       <body style="font-family: system-ui; max-width: 28rem; margin: 4rem auto; padding: 0 1rem">
         <p>Pretend payment page (test server)</p>
         <h1>${checkout.name}</h1>
         <p style="font-size: 2rem; font-weight: 800">€${(checkout.amount_total / 100).toFixed(2)}</p>
         <form method="post"><button style="font-size: 1.1rem; padding: .7rem 1.4rem">Pay</button></form>
         <p><a href="${checkout.cancel_url}">Cancel and go back</a></p>
       </body>`,
    )
  }
  checkout.payment_status = 'paid'
  response.writeHead(303, { location: checkout.success_url.replace('{CHECKOUT_SESSION_ID}', id) })
  response.end()
}

// Helpers for the tests themselves.
async function testHelpers(request, response, url, body) {
  if (url.pathname === '/__test/health') return send(response, 200, { ok: true })
  if (url.pathname === '/__test/reset') {
    // Removing the logins removes everything that belongs to them.
    await db.exec('delete from public.payments; delete from auth.users;')
    passwords.clear()
    refreshTokens.clear()
    checkouts.clear()
    return send(response, 200, { ok: true })
  }
  if (url.pathname === '/__test/sql') return send(response, 200, (await db.query(body.sql, body.values ?? [])).rows)
  // What the link in a password-reset email would log the person in with.
  if (url.pathname === '/__test/recovery-session') {
    const { rows } = await db.query('select id from auth.users where email = $1', [body.email])
    if (!rows[0]) return send(response, 404, { msg: `nobody has the email ${body.email}` })
    return send(response, 200, await sessionFor(rows[0].id))
  }
  send(response, 404, {})
}

// ---- the server -------------------------------------------------------------------

http
  .createServer(async (request, response) => {
    const url = new URL(request.url, BASE)
    if (request.method === 'OPTIONS' && !url.pathname.startsWith('/functions/')) return send(response, 204)

    let rawBody = ''
    for await (const chunk of request) rawBody += chunk
    let body = {}
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      // not JSON (the pretend Stripe receives form data); handlers that need it use rawBody
    }

    try {
      if (url.pathname.startsWith('/auth/v1/')) return await auth(request, response, url, body)
      if (url.pathname.startsWith('/rest/v1/')) return await rest(request, response, url, body)
      if (url.pathname.startsWith('/functions/v1/')) return await functions(request, response, url, rawBody)
      if (url.pathname.startsWith('/stripe/')) return await stripe(request, response, url, rawBody)
      if (url.pathname.startsWith('/__test/')) return await testHelpers(request, response, url, body)
      send(response, 404, { message: `the test server has no ${url.pathname}` })
    } catch (error) {
      sendDatabaseError(response, error)
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Stand-in Supabase ready on ${BASE}`))
