// Tests for the database itself: the tables, the access rules and the functions in
// supabase/schema.sql. They load that file into a Postgres that runs in memory
// (PGlite), so they need no Supabase project and no internet connection.

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

let db
let aoife // a client
let sean // a pro
let niamh // another pro

// Runs `work` the way Supabase runs a request from a logged-in person: as the
// "authenticated" role, with that person's id available to auth.uid().
async function as(user, work) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try {
    return await work()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

async function asVisitor(work) {
  await db.exec('set role anon')
  try {
    return await work()
  } finally {
    await db.exec('reset role')
  }
}

const rows = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await rows(sql, params))[0]

async function signUp(email, metadata = {}) {
  const user = await one('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [
    email,
    JSON.stringify(metadata),
  ])
  return user.id
}

const DOG_WALKING = 4
const inDays = async (n) => (await one(`select (public.today() + $1::int)::text as d`, [n])).d

// Aoife books a dog walk. Returns the booking.
async function book({ option = '1 Hour', details = '', eircode = 'V94 T9PX', days = 0, service = DOG_WALKING } = {}) {
  const date = await inDays(days)
  return as(aoife, () => one('select * from public.create_booking($1, $2, $3, $4, $5)', [service, option, details, eircode, date]))
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(read('./helpers/supabase-stub.sql'))
  await db.exec(read('../supabase/schema.sql'))
  await db.exec(read('../supabase/schema.sql')) // running it twice must be harmless
  aoife = await signUp('aoife@example.com', { full_name: 'Aoife Byrne', role: 'client' })
  sean = await signUp('sean@example.com', { full_name: 'Seán Kelly', role: 'pro' })
  niamh = await signUp('niamh@example.com', { role: 'pro' })
})

beforeEach(async () => {
  await db.exec('delete from public.bookings')
})

describe('signing up', () => {
  it('creates a profile from the sign-up form', async () => {
    expect(await one('select full_name, role from public.profiles where id = $1', [aoife])).toEqual({
      full_name: 'Aoife Byrne',
      role: 'client',
    })
    expect((await one('select role from public.profiles where id = $1', [sean])).role).toBe('pro')
  })

  it('falls back to the start of the email when no name is given', async () => {
    expect((await one('select full_name from public.profiles where id = $1', [niamh])).full_name).toBe('niamh')
  })

  it('does not accept a made-up role', async () => {
    const id = await signUp('admin@example.com', { role: 'admin' })
    expect((await one('select role from public.profiles where id = $1', [id])).role).toBe('client')
  })
})

describe('the services', () => {
  it('can be read by visitors who are not logged in', async () => {
    const list = await asVisitor(() => rows('select name from public.services order by sort_order'))
    expect(list).toHaveLength(9)
    expect(list[0].name).toBe('Home Cleaning')
  })

  it('cannot be changed from the app', async () => {
    await expect(as(aoife, () => db.exec(`update public.services set price_cents = 1`))).rejects.toThrow(/permission denied/)
  })

  it('are the only thing a visitor can read', async () => {
    await expect(asVisitor(() => rows('select * from public.bookings'))).rejects.toThrow(/permission denied/)
    await expect(asVisitor(() => rows('select * from public.profiles'))).rejects.toThrow(/permission denied/)
    await expect(asVisitor(() => rows('select * from public.open_jobs()'))).rejects.toThrow(/permission denied/)
  })
})

describe('booking a service', () => {
  it('saves the booking for the person who is logged in', async () => {
    const booking = await book({ eircode: 'v94t9px' })
    expect(booking.client_id).toBe(aoife)
    expect(booking.status).toBe('requested')
    expect(booking.pro_id).toBeNull()
    expect(booking.eircode).toBe('V94 T9PX') // tidied up before it is stored
  })

  it('refuses visitors who are not logged in', async () => {
    await expect(asVisitor(() => db.query(`select public.create_booking(4, '1 Hour', '', 'V94 T9PX', public.today())`))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('checks every field', async () => {
    await expect(book({ option: '4+ Bedrooms' })).rejects.toThrow(/choose one of the options/)
    await expect(book({ option: 'Other', details: '   ' })).rejects.toThrow(/describe what you need/)
    await expect(book({ eircode: 'Limerick' })).rejects.toThrow(/Eircode/)
    await expect(book({ days: -1 })).rejects.toThrow(/today or a later date/)
    await expect(book({ days: 91 })).rejects.toThrow(/90 days/)
    await expect(book({ service: 99 })).rejects.toThrow(/does not exist/)
    await expect(book({ details: 'x'.repeat(501) })).rejects.toThrow(/500 characters/)
  })

  it('stops at five open bookings', async () => {
    for (let i = 0; i < 5; i++) await book()
    await expect(book()).rejects.toThrow(/already have 5 open bookings/)
  })

  it('cannot be done by writing to the table directly', async () => {
    await expect(
      as(aoife, () =>
        db.query(
          `insert into public.bookings (client_id, service_id, option, eircode, scheduled_date, status)
           values ($1, 4, '1 Hour', 'V94 T9PX', public.today(), 'completed')`,
          [aoife],
        ),
      ),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('who can see a booking', () => {
  it('shows it to the client, and to nobody else until a pro takes it', async () => {
    await book()
    expect(await as(aoife, () => rows('select id from public.booking_details'))).toHaveLength(1)
    expect(await as(sean, () => rows('select id from public.booking_details'))).toHaveLength(0)
    expect(await as(sean, () => rows('select id from public.bookings'))).toHaveLength(0)
  })

  it('offers it to pros without the address or the name', async () => {
    await book({ eircode: 'V94 T9PX' })
    const jobs = await as(sean, () => rows('select * from public.open_jobs()'))
    expect(jobs).toHaveLength(1)
    expect(jobs[0].area).toBe('V94')
    expect(jobs[0].service_name).toBe('Dog Walking')
    expect(Object.keys(jobs[0])).not.toContain('eircode')
    expect(Object.keys(jobs[0])).not.toContain('client_id')
    expect(Object.keys(jobs[0])).not.toContain('client_name')
  })

  it('does not offer people their own requests', async () => {
    await book()
    expect(await as(aoife, () => rows('select * from public.open_jobs()'))).toHaveLength(0)
  })

  it('keeps profiles private until two people share a booking', async () => {
    const booking = await book()
    expect(await as(sean, () => rows('select id from public.profiles'))).toHaveLength(1) // only his own
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    const visible = await as(sean, () => rows('select full_name from public.profiles order by full_name'))
    expect(visible.map((p) => p.full_name)).toEqual(['Aoife Byrne', 'Seán Kelly'])
    expect(await as(niamh, () => rows('select id from public.profiles'))).toHaveLength(1) // still only her own
  })
})

describe('accepting a job', () => {
  it('gives the job to the pro and reveals the details to both sides', async () => {
    const booking = await book()
    const accepted = await as(sean, () => one('select * from public.accept_booking($1)', [booking.id]))
    expect(accepted.status).toBe('accepted')
    expect(accepted.pro_id).toBe(sean)

    const forPro = await as(sean, () => one('select * from public.booking_details'))
    expect(forPro.eircode).toBe('V94 T9PX')
    expect(forPro.client_name).toBe('Aoife Byrne')

    const forClient = await as(aoife, () => one('select * from public.booking_details'))
    expect(forClient.pro_name).toBe('Seán Kelly')
  })

  it('can only happen once', async () => {
    const booking = await book()
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    await expect(as(niamh, () => db.query('select public.accept_booking($1)', [booking.id]))).rejects.toThrow(/no longer available/)
    expect(await as(niamh, () => rows('select * from public.open_jobs()'))).toHaveLength(0)
  })

  it('is not allowed on your own request', async () => {
    const booking = await book()
    await expect(as(aoife, () => db.query('select public.accept_booking($1)', [booking.id]))).rejects.toThrow(/no longer available/)
  })
})

describe('finishing, giving back and cancelling', () => {
  it('lets the pro mark today’s job as done', async () => {
    const booking = await book({ days: 0 })
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    const done = await as(sean, () => one('select * from public.complete_booking($1)', [booking.id]))
    expect(done.status).toBe('completed')
  })

  it('does not let a job be marked as done before its day', async () => {
    const booking = await book({ days: 3 })
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    await expect(as(sean, () => db.query('select public.complete_booking($1)', [booking.id]))).rejects.toThrow(/on the day/)
  })

  it('does not let anyone else mark it as done', async () => {
    const booking = await book()
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    await expect(as(niamh, () => db.query('select public.complete_booking($1)', [booking.id]))).rejects.toThrow(/cannot be marked as done/)
    await expect(as(aoife, () => db.query('select public.complete_booking($1)', [booking.id]))).rejects.toThrow(/cannot be marked as done/)
  })

  it('lets the pro give a job back so another pro can take it', async () => {
    const booking = await book()
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    const released = await as(sean, () => one('select * from public.release_booking($1)', [booking.id]))
    expect(released.status).toBe('requested')
    expect(released.pro_id).toBeNull()
    const taken = await as(niamh, () => one('select * from public.accept_booking($1)', [booking.id]))
    expect(taken.pro_id).toBe(niamh)
  })

  it('lets the client cancel before the job is done, and not after', async () => {
    const first = await book()
    expect((await as(aoife, () => one('select * from public.cancel_booking($1)', [first.id]))).status).toBe('cancelled')
    await expect(as(aoife, () => db.query('select public.cancel_booking($1)', [first.id]))).rejects.toThrow(/no longer be cancelled/)

    const second = await book()
    await as(sean, () => db.query('select public.accept_booking($1)', [second.id]))
    await as(sean, () => db.query('select public.complete_booking($1)', [second.id]))
    await expect(as(aoife, () => db.query('select public.cancel_booking($1)', [second.id]))).rejects.toThrow(/no longer be cancelled/)
  })

  it('does not let a pro cancel someone’s booking', async () => {
    const booking = await book()
    await as(sean, () => db.query('select public.accept_booking($1)', [booking.id]))
    await expect(as(sean, () => db.query('select public.cancel_booking($1)', [booking.id]))).rejects.toThrow(/no longer be cancelled/)
  })

  it('does not allow the status to be edited directly', async () => {
    const booking = await book()
    await expect(
      as(aoife, () => db.query(`update public.bookings set status = 'completed' where id = $1`, [booking.id])),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('profiles', () => {
  it('lets people change their own name and default mode, and nothing else', async () => {
    await as(niamh, () => db.query(`update public.profiles set full_name = 'Niamh Walsh', role = 'client' where id = $1`, [niamh]))
    expect(await one('select full_name, role from public.profiles where id = $1', [niamh])).toEqual({
      full_name: 'Niamh Walsh',
      role: 'client',
    })

    // Other columns are off limits, even on your own row.
    await expect(as(niamh, () => db.query(`update public.profiles set created_at = now() where id = $1`, [niamh]))).rejects.toThrow(
      /permission denied/,
    )

    // Someone else's row is invisible to the update, so nothing changes.
    await as(niamh, () => db.query(`update public.profiles set full_name = 'Hacked' where id = $1`, [aoife]))
    expect((await one('select full_name from public.profiles where id = $1', [aoife])).full_name).toBe('Aoife Byrne')
  })
})
