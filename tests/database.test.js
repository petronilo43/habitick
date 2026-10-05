// Tests for the database itself: the tables, the access rules and the functions in
// supabase/schema.sql. They load that file into a Postgres that runs in memory
// (PGlite), so they need no Supabase project and no internet connection.

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PricingRule } from '../src/lib/pricing'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

let db
let aoife // a client
let sean // a pro
let niamh // another pro
let plan // the Pro plan's numbers, as the database reports them

// Option ids used below (see the end of schema.sql).
const CLEANING_3_BEDROOMS = 12 // 3 hours at €14.50
const LAWN_MOWING = 21 // €29.00, fixed
const DOG_WALK_1_HOUR = 42 // 1 hour at €15.00

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

async function asRole(role, work) {
  await db.exec(`set role ${role}`)
  try {
    return await work()
  } finally {
    await db.exec('reset role')
  }
}
const asVisitor = (work) => asRole('anon', work) // someone who is not logged in
const asServer = (work) => asRole('service_role', work) // the payment function, with the secret key

const rows = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await rows(sql, params))[0]

async function signUp(email, metadata = {}) {
  const user = await one('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [
    email,
    JSON.stringify(metadata),
  ])
  return user.id
}

// A visitor who pressed "Try the demo": a login with no email.
async function guest() {
  return (await one('insert into auth.users (is_anonymous) values (true) returning id')).id
}

const inDays = async (n) => (await one(`select (public.today() + $1::int)::text as d`, [n])).d

// Someone books. By default the request is made to look an hour old, so it is past
// the Pro early-access window and every pro can see it; `fresh: true` keeps it new.
async function book({ by = aoife, option = DOG_WALK_1_HOUR, details = '', eircode = 'V94 T9PX', days = 0, fresh = false } = {}) {
  const date = await inDays(days)
  const booking = await as(by, () => one('select * from public.create_booking($1, $2, $3, $4)', [option, details, eircode, date]))
  if (!fresh) await db.query(`update public.bookings set created_at = now() - interval '1 hour' where id = $1`, [booking.id])
  return booking
}

const accept = (pro, booking) => as(pro, () => one('select * from public.accept_booking($1)', [booking.id]))
const complete = (pro, booking) => as(pro, () => one('select * from public.complete_booking($1)', [booking.id]))
const openJobs = (pro) => as(pro, () => rows('select * from public.open_jobs()'))

// A booking that has been accepted and finished by Seán.
async function finishedBooking(options) {
  const booking = await book(options)
  await accept(sean, booking)
  await complete(sean, booking)
  return booking
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(read('./helpers/supabase-stub.sql'))
  await db.exec(read('../supabase/schema.sql'))
  await db.exec(read('../supabase/schema.sql')) // running it twice must be harmless
  aoife = await signUp('aoife@example.com', { full_name: 'Aoife Byrne', role: 'client' })
  sean = await signUp('sean@example.com', { full_name: 'Seán Kelly', role: 'pro' })
  niamh = await signUp('niamh@example.com', { role: 'pro' })
  plan = (await one('select public.pro_plan() as plan')).plan
})

beforeEach(async () => {
  await db.exec(`
    delete from public.payments;
    delete from public.bookings;
    delete from public.pro_services;
    delete from public.pro_areas;
    delete from auth.users where is_anonymous;
    update public.profiles set pro_until = null, trial_used = false;
  `)
})

describe('signing up', () => {
  it('creates a profile from the sign-up form', async () => {
    expect(await one('select full_name, role, user_id from public.profiles where id = $1', [aoife])).toEqual({
      full_name: 'Aoife Byrne',
      role: 'client',
      user_id: aoife,
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
  it('can be read by visitors who are not logged in, with every option priced', async () => {
    const list = await asVisitor(() => rows('select * from public.service_catalogue order by sort_order'))
    expect(list).toHaveLength(9)
    expect(list[0].name).toBe('Home Cleaning')
    expect(list[0].from_cents).toBe(2900) // 2 hours at €14.50
    expect(list[0].options.map((o) => o.total_cents)).toEqual([2900, 4350, 7250])
    expect(list[1].options[0]).toMatchObject({ label: 'Lawn mowing', price_cents: 2900, total_cents: 2900 })
  })

  it('are priced the same by the website and by the database', async () => {
    // The price is worked out twice: by the classes in src/lib/pricing.js (to show it)
    // and by option_total() in SQL (to charge it). This keeps the two honest.
    const list = await rows('select * from public.service_catalogue')
    for (const service of list) {
      for (const option of service.options) {
        expect(PricingRule.for(service, option).totalCents, `${service.name}: ${option.label}`).toBe(option.total_cents)
      }
    }
  })

  it('cannot be changed from the app', async () => {
    await expect(as(aoife, () => db.exec(`update public.services set hourly_rate_cents = 1`))).rejects.toThrow(/permission denied/)
    await expect(as(aoife, () => db.exec(`update public.service_options set price_cents = 1`))).rejects.toThrow(/permission denied/)
  })

  it('are the only thing a visitor can read', async () => {
    for (const source of ['bookings', 'profiles', 'reviews', 'payments', 'pro_services', 'open_jobs()']) {
      await expect(asVisitor(() => rows(`select * from public.${source}`)), source).rejects.toThrow(/permission denied/)
    }
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

  it('works out the price itself and keeps it on the booking', async () => {
    expect(await book({ option: CLEANING_3_BEDROOMS })).toMatchObject({ option: '2-3 bedrooms', total_cents: 4350 })
    expect(await book({ option: LAWN_MOWING })).toMatchObject({ option: 'Lawn mowing', total_cents: 2900 })

    // A later price change does not touch what was already agreed.
    await db.exec(`update public.services set hourly_rate_cents = 2000 where id = 1`)
    try {
      expect((await one(`select total_cents from public.bookings where option_id = $1`, [CLEANING_3_BEDROOMS])).total_cents).toBe(4350)
      expect((await book({ option: CLEANING_3_BEDROOMS })).total_cents).toBe(6000)
    } finally {
      await db.exec(`update public.services set hourly_rate_cents = 1450 where id = 1`)
    }
  })

  it('refuses visitors who are not logged in', async () => {
    await expect(asVisitor(() => db.query(`select public.create_booking(42, '', 'V94 T9PX', public.today())`))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('checks every field', async () => {
    await expect(book({ option: 999 })).rejects.toThrow(/choose one of the options/)
    await expect(book({ eircode: 'Limerick' })).rejects.toThrow(/Eircode/)
    await expect(book({ days: -1 })).rejects.toThrow(/today or a later date/)
    await expect(book({ days: 91 })).rejects.toThrow(/90 days/)
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
          `insert into public.bookings (client_id, service_id, option, total_cents, eircode, scheduled_date, status)
           values ($1, 4, '1 hour', 1, 'V94 T9PX', public.today(), 'completed')`,
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

  it('offers it to pros with the price, but without the address or the name', async () => {
    await book({ eircode: 'V94 T9PX' })
    const jobs = await openJobs(sean)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ area: 'V94', service_name: 'Dog Walking', total_cents: 1500 })
    expect(Object.keys(jobs[0])).not.toContain('eircode')
    expect(Object.keys(jobs[0])).not.toContain('client_id')
    expect(Object.keys(jobs[0])).not.toContain('client_name')
  })

  it('does not offer people their own requests', async () => {
    await book()
    expect(await openJobs(aoife)).toHaveLength(0)
  })

  it('keeps profiles private until two people share a booking', async () => {
    const booking = await book()
    expect(await as(sean, () => rows('select id from public.profiles'))).toHaveLength(1) // only his own
    await accept(sean, booking)
    const visible = await as(sean, () => rows('select full_name from public.profiles order by full_name'))
    expect(visible.map((p) => p.full_name)).toEqual(['Aoife Byrne', 'Seán Kelly'])
    expect(await as(niamh, () => rows('select id from public.profiles'))).toHaveLength(1) // still only her own
  })
})

describe('accepting a job', () => {
  it('gives the job to the pro and reveals the details to both sides', async () => {
    const booking = await book()
    const accepted = await accept(sean, booking)
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
    await accept(sean, booking)
    await expect(accept(niamh, booking)).rejects.toThrow(/no longer available/)
    expect(await openJobs(niamh)).toHaveLength(0)
  })

  it('is not allowed on your own request', async () => {
    await expect(accept(aoife, await book())).rejects.toThrow(/no longer available/)
  })
})

describe('finishing, giving back and cancelling', () => {
  it('lets the pro mark today’s job as done', async () => {
    const booking = await book({ days: 0 })
    await accept(sean, booking)
    expect((await complete(sean, booking)).status).toBe('completed')
  })

  it('does not let a job be marked as done before its day', async () => {
    const booking = await book({ days: 3 })
    await accept(sean, booking)
    await expect(complete(sean, booking)).rejects.toThrow(/on the day/)
  })

  it('does not let anyone else mark it as done', async () => {
    const booking = await book()
    await accept(sean, booking)
    await expect(complete(niamh, booking)).rejects.toThrow(/cannot be marked as done/)
    await expect(complete(aoife, booking)).rejects.toThrow(/cannot be marked as done/)
  })

  it('lets the pro give a job back so another pro can take it', async () => {
    const booking = await book()
    await accept(sean, booking)
    const released = await as(sean, () => one('select * from public.release_booking($1)', [booking.id]))
    expect(released.status).toBe('requested')
    expect(released.pro_id).toBeNull()
    expect((await accept(niamh, booking)).pro_id).toBe(niamh)
  })

  it('lets the client cancel before the job is done, and not after', async () => {
    const first = await book()
    expect((await as(aoife, () => one('select * from public.cancel_booking($1)', [first.id]))).status).toBe('cancelled')
    await expect(as(aoife, () => db.query('select public.cancel_booking($1)', [first.id]))).rejects.toThrow(/no longer be cancelled/)

    const second = await finishedBooking()
    await expect(as(aoife, () => db.query('select public.cancel_booking($1)', [second.id]))).rejects.toThrow(/no longer be cancelled/)
  })

  it('does not let a pro cancel someone’s booking', async () => {
    const booking = await book()
    await accept(sean, booking)
    await expect(as(sean, () => db.query('select public.cancel_booking($1)', [booking.id]))).rejects.toThrow(/no longer be cancelled/)
  })

  it('does not allow the status to be edited directly', async () => {
    const booking = await book()
    await expect(
      as(aoife, () => db.query(`update public.bookings set status = 'completed' where id = $1`, [booking.id])),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('reviews', () => {
  const review = (who, booking, rating = 5, comment = 'Lovely walk') =>
    as(who, () => one('select * from public.review_booking($1, $2, $3)', [booking.id, rating, comment]))

  it('lets the client rate a finished job, once', async () => {
    const booking = await finishedBooking()
    expect(await review(aoife, booking, 4, '  Good job  ')).toMatchObject({ rating: 4, comment: 'Good job', pro_id: sean })
    await expect(review(aoife, booking)).rejects.toThrow(/already reviewed/)
  })

  it('waits until the job is done', async () => {
    const booking = await book()
    await expect(review(aoife, booking)).rejects.toThrow(/once the job is done/)
    await accept(sean, booking)
    await expect(review(aoife, booking)).rejects.toThrow(/once the job is done/)
  })

  it('only takes 1 to 5 stars, and only from the client', async () => {
    const booking = await finishedBooking()
    await expect(review(aoife, booking, 0)).rejects.toThrow(/between 1 and 5/)
    await expect(review(aoife, booking, 6)).rejects.toThrow(/between 1 and 5/)
    await expect(review(sean, booking)).rejects.toThrow(/once the job is done/) // the pro cannot review himself
    await expect(review(niamh, booking)).rejects.toThrow(/once the job is done/)
    await expect(
      as(aoife, () => db.query(`insert into public.reviews (booking_id, client_id, pro_id, rating) values ($1, $2, $3, 5)`, [booking.id, aoife, sean])),
    ).rejects.toThrow(/permission denied/)
  })

  it('is shown to both people on the booking and to nobody else', async () => {
    const booking = await finishedBooking()
    await review(aoife, booking, 5, 'Lovely walk')
    for (const person of [aoife, sean]) {
      expect(await as(person, () => one('select review_rating, review_comment from public.booking_details'))).toEqual({
        review_rating: 5,
        review_comment: 'Lovely walk',
      })
    }
    expect(await as(niamh, () => rows('select * from public.reviews'))).toHaveLength(0)
  })

  it('adds up to a reputation the next client can see', async () => {
    await review(aoife, await finishedBooking(), 5)
    await review(aoife, await finishedBooking(), 4)

    // Cian is a new client. He sees Seán's average once Seán takes his booking, not the reviews themselves.
    const cian = await signUp('cian@example.com', { full_name: 'Cian Doyle' })
    const booking = await book({ by: cian })
    await accept(sean, booking)
    const seen = await as(cian, () => one('select pro_name, pro_rating, pro_reviews from public.booking_details'))
    expect(seen).toMatchObject({ pro_name: 'Seán Kelly', pro_reviews: 2 })
    expect(Number(seen.pro_rating)).toBe(4.5)
    expect(await as(cian, () => rows('select * from public.reviews'))).toHaveLength(0)
  })
})

describe('what a pro offers and where', () => {
  const setPreferences = (pro, services, areas) =>
    as(pro, () => db.query('select public.set_pro_preferences($1, $2)', [services, areas]))

  it('offers every request until the pro narrows it down', async () => {
    await book({ option: DOG_WALK_1_HOUR, eircode: 'V94 T9PX' })
    await book({ option: LAWN_MOWING, eircode: 'T12 X70A' })
    expect(await openJobs(sean)).toHaveLength(2)

    await setPreferences(sean, [2], []) // gardening only
    expect((await openJobs(sean)).map((job) => job.service_name)).toEqual(['Gardening & Lawn'])

    await setPreferences(sean, [], ['v94 ', 'D6W']) // any service, two areas (tidied up when saved)
    expect((await openJobs(sean)).map((job) => job.area)).toEqual(['V94'])
    expect(await as(sean, () => rows('select routing_key from public.pro_areas order by 1'))).toEqual([{ routing_key: 'D6W' }, { routing_key: 'V94' }])

    await setPreferences(sean, [2], ['V94']) // gardening in V94: neither request matches
    expect(await openJobs(sean)).toHaveLength(0)

    expect(await openJobs(niamh)).toHaveLength(2) // someone else's choices change nothing for her
  })

  it('cannot be used to take a job outside those choices', async () => {
    const booking = await book({ option: DOG_WALK_1_HOUR })
    await setPreferences(sean, [2], [])
    await expect(accept(sean, booking)).rejects.toThrow(/no longer available/)
  })

  it('checks what is saved, and keeps it private', async () => {
    await expect(setPreferences(sean, [99], [])).rejects.toThrow(/does not exist/)
    await expect(setPreferences(sean, [], ['Limerick'])).rejects.toThrow(/first 3 characters of an Eircode/)
    await setPreferences(sean, [1, 2], ['V94'])
    expect(await as(niamh, () => rows('select * from public.pro_services'))).toHaveLength(0)
    await expect(as(sean, () => db.query(`insert into public.pro_areas values ($1, 'T12')`, [sean]))).rejects.toThrow(/permission denied/)
  })
})

describe('the Pro plan', () => {
  const startTrial = (pro) => as(pro, () => one('select * from public.start_pro_trial()'))
  const lockedJobs = (pro) => as(pro, () => one('select * from public.locked_jobs()'))

  it('publishes its numbers, so the website and the database agree', async () => {
    expect(await asVisitor(() => one('select public.pro_plan() as plan'))).toEqual({
      plan: { price_cents: 700, days: 30, trial_days: 14, early_access_minutes: 5, free_active_jobs: 3, member_active_jobs: 10 },
    })
  })

  it('shows new requests to members first', async () => {
    await startTrial(niamh)
    const booking = await book({ fresh: true })

    // Seán is on the free plan: he is told one request is waiting, and nothing else about it.
    expect(await openJobs(sean)).toHaveLength(0)
    const locked = await lockedJobs(sean)
    expect(locked.jobs).toBe(1)
    expect(new Date(locked.next_opens_at).getTime()).toBeGreaterThan(Date.now())
    await expect(accept(sean, booking)).rejects.toThrow(/early access for Pro members/)

    // Niamh is a member: she sees it straight away, marked as early access.
    expect(await openJobs(niamh)).toMatchObject([{ id: booking.id, early_access: true }])
    expect((await lockedJobs(niamh)).jobs).toBe(0)

    // Once the window has passed it is open to everyone.
    await db.query(`update public.bookings set created_at = now() - make_interval(mins => $1) where id = $2`, [
      plan.early_access_minutes + 1,
      booking.id,
    ])
    expect(await openJobs(sean)).toMatchObject([{ id: booking.id, early_access: false }])
    expect((await lockedJobs(sean)).jobs).toBe(0)
  })

  it('lets members hold more jobs at once', async () => {
    const cian = await signUp('cian2@example.com')
    const requests = []
    for (const client of [aoife, cian]) for (let i = 0; i < 3; i++) requests.push(await book({ by: client, days: 5 }))

    for (const request of requests.slice(0, plan.free_active_jobs)) await accept(sean, request)
    await expect(accept(sean, requests[3])).rejects.toThrow(/the most the free plan allows/)

    await startTrial(sean)
    expect((await accept(sean, requests[3])).pro_id).toBe(sean)
  })

  it('gives one free trial per account', async () => {
    const profile = await startTrial(sean)
    expect(profile.trial_used).toBe(true)
    const days = (new Date(profile.pro_until) - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(plan.trial_days)

    await expect(startTrial(sean)).rejects.toThrow(/already a Pro member/)
    await db.query(`update public.profiles set pro_until = now() - interval '1 day' where id = $1`, [sean])
    await expect(startTrial(sean)).rejects.toThrow(/already used your free trial/)
  })

  it('shows the client a member badge', async () => {
    await startTrial(sean)
    const booking = await book()
    await accept(sean, booking)
    expect((await as(aoife, () => one('select pro_is_member from public.booking_details'))).pro_is_member).toBe(true)
  })

  it('cannot be switched on by editing your own profile', async () => {
    await expect(
      as(sean, () => db.query(`update public.profiles set pro_until = now() + interval '10 years' where id = $1`, [sean])),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('payments', () => {
  const markPaid = (role, booking, ref = 'cs_test_1', amount = booking.total_cents) =>
    role(() => one('select * from public.mark_booking_paid($1, $2, $3)', [booking.id, ref, amount]))
  const activate = (role, user, ref = 'cs_test_plan', amount = plan.price_cents) =>
    role(() => one('select * from public.activate_pro_plan($1, $2, $3)', [user, ref, amount]))

  it('can only be recorded by the server', async () => {
    const booking = await finishedBooking()
    await expect(markPaid((work) => as(aoife, work), booking)).rejects.toThrow(/permission denied/)
    await expect(markPaid(asVisitor, booking)).rejects.toThrow(/permission denied/)
    await expect(activate((work) => as(sean, work), sean)).rejects.toThrow(/permission denied/)
    await expect(
      as(aoife, () => db.query(`update public.bookings set paid_at = now() where id = $1`, [booking.id])),
    ).rejects.toThrow(/permission denied/)
  })

  it('marks a finished job as paid, for exactly its price', async () => {
    const booking = await finishedBooking({ option: CLEANING_3_BEDROOMS })
    await expect(markPaid(asServer, booking, 'cs_test_1', 100)).rejects.toThrow(/does not match the booking/)

    const paid = await markPaid(asServer, booking)
    expect(paid.paid_at).not.toBeNull()
    expect(await one('select kind, amount_cents, user_id, provider_ref from public.payments')).toEqual({
      kind: 'booking',
      amount_cents: 4350,
      user_id: aoife,
      provider_ref: 'cs_test_1',
    })
  })

  it('counts the same payment only once', async () => {
    const booking = await finishedBooking()
    await markPaid(asServer, booking, 'cs_test_same')
    await markPaid(asServer, booking, 'cs_test_same') // Stripe may report a payment more than once
    expect(await rows('select id from public.payments')).toHaveLength(1)
    await expect(markPaid(asServer, booking, 'cs_test_other')).rejects.toThrow(/already paid/)
  })

  it('waits until the job is done', async () => {
    const booking = await book()
    await expect(markPaid(asServer, booking)).rejects.toThrow(/once the job is done/)
    await accept(sean, booking)
    await expect(markPaid(asServer, booking)).rejects.toThrow(/once the job is done/)
  })

  it('shows a payment to the person who made it, and the result to both', async () => {
    const booking = await finishedBooking()
    await markPaid(asServer, booking)
    expect(await as(aoife, () => rows('select id from public.payments'))).toHaveLength(1)
    expect(await as(sean, () => rows('select id from public.payments'))).toHaveLength(0)
    expect((await as(sean, () => one('select paid_at from public.booking_details'))).paid_at).not.toBeNull()
  })

  it('adds a period of Pro for the right amount, on top of what is left', async () => {
    await expect(activate(asServer, sean, 'cs_test_cheap', 1)).rejects.toThrow(/does not match the price/)

    const first = await activate(asServer, sean, 'cs_test_a')
    const daysLeft = (profile) => Math.round((new Date(profile.pro_until) - Date.now()) / 86_400_000)
    expect(daysLeft(first)).toBe(plan.days)

    expect(daysLeft(await activate(asServer, sean, 'cs_test_a'))).toBe(plan.days) // the same payment again
    expect(daysLeft(await activate(asServer, sean, 'cs_test_b'))).toBe(plan.days * 2) // a second payment
  })
})

describe('deleting an account', () => {
  const deleteAccount = (user) => as(user, () => db.query('select public.delete_my_account()'))

  it('removes the person and what they booked', async () => {
    const cian = await signUp('cian3@example.com', { full_name: 'Cian Doyle' })
    await book({ by: cian })
    await deleteAccount(cian)
    expect(await rows('select id from auth.users where id = $1', [cian])).toHaveLength(0)
    expect(await rows('select id from public.profiles where id = $1', [cian])).toHaveLength(0)
    expect(await rows('select id from public.bookings where client_id = $1', [cian])).toHaveLength(0)
  })

  it('puts a pro’s accepted jobs back on offer and keeps the clients’ history', async () => {
    const oisin = await signUp('oisin@example.com', { full_name: 'Oisín Walsh', role: 'pro' })
    const waiting = await book({ days: 2 })
    const done = await book()
    await accept(oisin, waiting)
    await accept(oisin, done)
    await complete(oisin, done)

    await deleteAccount(oisin)

    expect(await one('select status, pro_id from public.bookings where id = $1', [waiting.id])).toEqual({ status: 'requested', pro_id: null })
    expect(await one('select status, pro_id from public.bookings where id = $1', [done.id])).toEqual({ status: 'completed', pro_id: null })
    expect((await openJobs(sean)).map((job) => job.id)).toEqual([waiting.id])
  })

  it('needs a login', async () => {
    await expect(asVisitor(() => db.query('select public.delete_my_account()'))).rejects.toThrow(/permission denied/)
  })
})

describe('the demo sandbox', () => {
  const startDemo = (who, role = 'client') => as(who, () => db.query('select public.start_demo($1)', [role]))
  const advance = (who, booking) => as(who, () => one('select * from public.demo_advance($1)', [booking.id]))
  const mine = (who, where) => as(who, () => rows(`select * from public.booking_details where ${where} order by created_at`))

  it('is only for guests', async () => {
    await expect(startDemo(aoife)).rejects.toThrow(/guest session/)
    expect((await one('select sandbox from public.profiles where id = $1', [aoife])).sandbox).toBeNull()
  })

  it('gives a guest bookings in every state, as a client and as a pro', async () => {
    const visitor = await guest()
    await startDemo(visitor, 'pro')
    expect(await one('select full_name, role, sandbox from public.profiles where id = $1', [visitor])).toEqual({
      full_name: 'Guest',
      role: 'pro',
      sandbox: visitor,
    })

    const asClient = await mine(visitor, `client_id = '${visitor}'`)
    expect(asClient.map((b) => b.status).sort()).toEqual(['accepted', 'completed', 'completed', 'requested'])
    expect(asClient.find((b) => b.status === 'accepted')).toMatchObject({ pro_name: 'Seán Kelly', pro_is_member: true, pro_reviews: 3 })
    expect(asClient.filter((b) => b.status === 'completed').map((b) => Boolean(b.paid_at)).sort()).toEqual([false, true])

    const asPro = await mine(visitor, `pro_id = '${visitor}'`)
    expect(asPro.map((b) => b.status).sort()).toEqual(['accepted', 'completed'])
    expect(asPro.find((b) => b.status === 'completed')).toMatchObject({ client_name: 'Aoife Byrne', review_rating: 5 })

    // Two requests are open to the guest; a third is new and waits behind early access.
    expect(await openJobs(visitor)).toHaveLength(2)
    expect((await as(visitor, () => one('select * from public.locked_jobs()'))).jobs).toBe(1)
    await as(visitor, () => db.query('select public.start_pro_trial()'))
    expect(await openJobs(visitor)).toHaveLength(3)
  })

  it('does nothing the second time', async () => {
    const visitor = await guest()
    await startDemo(visitor)
    const before = await rows('select id from public.bookings')
    await startDemo(visitor, 'pro')
    expect(await rows('select id from public.bookings')).toHaveLength(before.length)
    expect((await one('select role from public.profiles where id = $1', [visitor])).role).toBe('pro')
  })

  it('keeps demo data and real data apart', async () => {
    const visitor = await guest()
    await startDemo(visitor)
    const real = await book() // a real request from Aoife

    expect((await openJobs(sean)).map((job) => job.id)).toEqual([real.id]) // a real pro sees no demo requests
    expect((await openJobs(visitor)).map((job) => job.id)).not.toContain(real.id) // and the guest sees no real ones
    await expect(accept(visitor, real)).rejects.toThrow(/no longer available/)

    const other = await guest() // a second visitor has a sandbox of their own
    await startDemo(other)
    const theirs = (await openJobs(other)).map((job) => job.id)
    expect(theirs).toHaveLength(2)
    for (const id of theirs) await expect(accept(visitor, { id })).rejects.toThrow(/no longer available/)
  })

  it('fences a guest in from the first moment, even if the demo was never started', async () => {
    const visitor = await guest() // signed in as a guest, and then nothing else
    expect((await one('select sandbox from public.profiles where id = $1', [visitor])).sandbox).toBe(visitor)

    const real = await book() // a real request from Aoife
    expect(await openJobs(visitor)).toHaveLength(0)
    await expect(accept(visitor, real)).rejects.toThrow(/no longer available/)

    // What the guest books is invisible to real pros, too.
    await book({ by: visitor })
    expect((await openJobs(sean)).map((job) => job.id)).toEqual([real.id])

    // Starting the demo afterwards still fills the sandbox, once.
    await startDemo(visitor)
    expect(await rows('select id from public.profiles where sandbox = $1', [visitor])).toHaveLength(3)
  })

  it('never plays a part on a booking that involves a real person', async () => {
    const visitor = await guest()
    await startDemo(visitor)

    // This cannot come about through the app. It is forced here, straight into the
    // table, to check that the demo button would still refuse it.
    const real = await book()
    await db.query(`update public.bookings set pro_id = $1, status = 'completed' where id = $2`, [visitor, real.id])

    await expect(advance(visitor, real)).rejects.toThrow(/demo’s own bookings|demo's own bookings/)
    expect(await one('select paid_at from public.bookings where id = $1', [real.id])).toEqual({ paid_at: null })
    expect(await rows('select booking_id from public.reviews where booking_id = $1', [real.id])).toHaveLength(0)
  })

  it('plays the other person’s part, so a guest is never left waiting', async () => {
    const visitor = await guest()
    await startDemo(visitor)

    // As a client: book, then let "Seán" accept and finish.
    const booking = await book({ by: visitor, days: 4, fresh: true })
    expect(await advance(visitor, booking)).toMatchObject({ status: 'accepted' })
    expect(await advance(visitor, booking)).toMatchObject({ status: 'completed' })
    await expect(advance(visitor, booking)).rejects.toThrow(/nothing left to play/)
    expect((await as(visitor, () => one('select pro_name from public.booking_details where id = $1', [booking.id]))).pro_name).toBe('Seán Kelly')

    // As a pro: finish today's job, then let "Aoife" pay and review.
    const [job] = await mine(visitor, `pro_id = '${visitor}' and status = 'accepted'`)
    await complete(visitor, job)
    const paid = await advance(visitor, job)
    expect(paid.paid_at).not.toBeNull()
    expect((await as(visitor, () => one('select review_rating from public.booking_details where id = $1', [job.id]))).review_rating).toBe(5)

    await expect(advance(aoife, await book())).rejects.toThrow(/only works in the demo/)
  })

  it('is cleared away after a few days, and when the guest ends it', async () => {
    const old = await guest()
    await startDemo(old)
    await db.query(`update auth.users set created_at = now() - interval '4 days' where id = $1`, [old])

    const visitor = await guest()
    await startDemo(visitor) // starting a demo tidies up the old ones
    expect(await rows('select id from public.profiles where sandbox = $1', [old])).toHaveLength(0)
    expect(await rows('select id from public.profiles where sandbox = $1', [visitor])).toHaveLength(3) // the guest and two pretend people

    await as(visitor, () => db.query('select public.delete_my_account()'))
    expect(await rows('select id from public.profiles where sandbox is not null')).toHaveLength(0)
    expect(await rows('select id from public.bookings')).toHaveLength(0)
    expect(await rows('select booking_id from public.reviews')).toHaveLength(0)
    expect(await rows('select id from public.payments')).toHaveLength(0) // demo money is pretend: no payment records
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
    for (const change of [`created_at = now()`, `sandbox = id`, `trial_used = false`, `user_id = null`]) {
      await expect(as(niamh, () => db.query(`update public.profiles set ${change} where id = $1`, [niamh])), change).rejects.toThrow(
        /permission denied/,
      )
    }

    // Someone else's row is invisible to the update, so nothing changes.
    await as(niamh, () => db.query(`update public.profiles set full_name = 'Hacked' where id = $1`, [aoife]))
    expect((await one('select full_name from public.profiles where id = $1', [aoife])).full_name).toBe('Aoife Byrne')

    await db.query(`update public.profiles set full_name = 'niamh', role = 'pro' where id = $1`, [niamh])
  })
})
