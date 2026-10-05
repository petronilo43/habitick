-- ============================================================================
-- Habitick database
--
-- How to use: open the Supabase dashboard, go to SQL Editor, paste this whole
-- file and press Run. It is safe to run more than once, and it also brings a
-- database made with an earlier version of this file up to date.
--
-- The design in one paragraph:
--   * profiles (people), services and service_options (what can be booked and
--     what it costs), bookings (who booked what, and who is doing the job),
--     reviews, payments, and what each professional offers and where.
--   * Row Level Security decides what each person can READ: everyone can see
--     the services, and you can only see bookings you are part of.
--   * Nobody can write to these tables directly, apart from their own name
--     and which dashboard opens first. Every other change goes through one of
--     the functions below, and each function checks the rules first. That way
--     the rules can't be skipped from the browser.
--
-- Sections:
--    1. Tables                    7. Professionals: preferences and the Pro plan
--    2. Bringing older databases  8. Payments
--       up to date                9. Deleting an account
--    3. Helpers                  10. The demo sandbox
--    4. Who can read what        11. Permissions
--    5. Views                    12. Live updates
--    6. The life of a booking    13. The services and their prices
-- ============================================================================


-- 1. TABLES ------------------------------------------------------------------

-- One row per person. Supabase keeps emails and passwords in its own auth.users
-- table; this table holds what the app itself needs to know.
--
-- For someone with a login, id and user_id are both the id of their auth user.
-- The only profiles without a login are the two pretend people created for a
-- visitor who tries the demo (section 10); those belong to that visitor's sandbox.
create table if not exists public.profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'client' check (role in ('client', 'pro')),
  pro_until  timestamptz,                       -- Pro member until this moment; empty = free plan
  trial_used boolean not null default false,    -- the free Pro trial can be taken once
  sandbox    uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profiles_login_matches_id check (user_id is null or user_id = id),
  constraint profiles_login_or_sandbox check (user_id is not null or sandbox is not null),
  constraint profiles_name_length      check (char_length(full_name) <= 80)
);

-- The catalogue. Money is stored in cents so there is no rounding trouble.
-- A service is priced either by the hour (hourly_rate_cents is set, and each
-- option says how many hours it takes) or per job (each option has its own price).
create table if not exists public.services (
  id                smallint primary key,
  slug              text not null unique,
  name              text not null,
  description       text not null,
  icon              text not null,
  price_unit        text not null check (price_unit in ('hour', 'fixed')),
  hourly_rate_cents integer check (hourly_rate_cents > 0),
  option_label      text not null,          -- the question asked when booking, e.g. "Property size"
  sort_order        smallint not null default 0,
  constraint services_rate_matches_unit check ((price_unit = 'hour') = (hourly_rate_cents is not null))
);

-- The answers to that question. Each one leads to an exact price.
create table if not exists public.service_options (
  id          smallint primary key,
  service_id  smallint not null references public.services (id) on delete cascade,
  label       text not null,
  hours       numeric(4, 1) check (hours > 0),      -- for services priced by the hour
  price_cents integer check (price_cents > 0),      -- for services priced per job
  sort_order  smallint not null default 0,
  unique (service_id, label),
  constraint service_options_one_kind_of_price check ((hours is null) <> (price_cents is null))
);

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles (id) on delete cascade,
  pro_id         uuid references public.profiles (id) on delete set null,
  service_id     smallint not null references public.services (id),
  option_id      smallint references public.service_options (id) on delete set null,
  option         text not null,                               -- the option's label when it was booked
  total_cents    integer not null check (total_cents > 0),    -- the price when it was booked
  details        text not null default '' check (char_length(details) <= 500),
  eircode        text not null check (eircode ~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W) [0-9AC-FHKNPRTV-Y]{4}$'),
  scheduled_date date not null,
  status         text not null default 'requested'
                 check (status in ('requested', 'accepted', 'completed', 'cancelled')),
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bookings_paid_only_when_done check (paid_at is null or status = 'completed')
);

create index if not exists bookings_client_idx on public.bookings (client_id);
create index if not exists bookings_pro_idx    on public.bookings (pro_id);
create index if not exists bookings_open_idx   on public.bookings (scheduled_date) where status = 'requested';

-- One review per booking, written by the client once the job is done.
create table if not exists public.reviews (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  client_id  uuid not null references public.profiles (id) on delete cascade,
  pro_id     uuid not null references public.profiles (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists reviews_pro_idx on public.reviews (pro_id);

-- A record of every payment taken through Stripe. provider_ref is the id Stripe
-- gave the checkout; because it is unique, the same payment can never be counted
-- twice. The record stays, without the name, if the person later deletes their account.
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  kind         text not null check (kind in ('booking', 'pro_plan')),
  booking_id   uuid references public.bookings (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  provider_ref text not null unique,
  created_at   timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id);

-- What a professional offers, and where. A pro with no rows in a table has not
-- narrowed that down, and is offered every service / requests from anywhere.
create table if not exists public.pro_services (
  pro_id     uuid not null references public.profiles (id) on delete cascade,
  service_id smallint not null references public.services (id) on delete cascade,
  primary key (pro_id, service_id)
);

create table if not exists public.pro_areas (
  pro_id      uuid not null references public.profiles (id) on delete cascade,
  routing_key text not null check (routing_key ~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W)$'),   -- the first half of an Eircode
  primary key (pro_id, routing_key)
);


-- 2. BRINGING OLDER DATABASES UP TO DATE ----------------------------------------
-- "create table if not exists" leaves a table alone when it is already there, so
-- columns and rules added since the first version are added here. On a new
-- database every statement in this section finds nothing to do.

alter table public.profiles add column if not exists user_id    uuid;
alter table public.profiles add column if not exists pro_until  timestamptz;
alter table public.profiles add column if not exists trial_used boolean not null default false;
alter table public.profiles add column if not exists sandbox    uuid;
alter table public.profiles alter column id set default gen_random_uuid();

-- In the first version the link to the login was on the id column itself.
update public.profiles set user_id = id where user_id is null and sandbox is null;
alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.bookings add column if not exists option_id   smallint;
alter table public.bookings add column if not exists total_cents integer;
alter table public.bookings add column if not exists paid_at     timestamptz;

-- The first version kept one "from" price on the service and the options as a
-- plain list of names. Bookings made back then get that price as their total.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'services' and column_name = 'price_cents') then
    execute 'update public.bookings b set total_cents = s.price_cents
               from public.services s
              where s.id = b.service_id and b.total_cents is null';
    alter table public.services rename column price_cents to hourly_rate_cents;
    alter table public.services rename constraint services_price_cents_check to services_hourly_rate_cents_check;
    alter table public.services alter column hourly_rate_cents drop not null;
    update public.services set hourly_rate_cents = null where price_unit = 'fixed';
  end if;
end $$;

alter table public.services drop column if exists options;
alter table public.bookings alter column total_cents set not null;

-- Names were not limited in length before; shorten any that would break the new rule.
update public.profiles set full_name = left(full_name, 80) where char_length(full_name) > 80;

-- Rules ("constraints") that a table from an older version does not have yet.
do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('profiles', 'profiles_user_id_key',         'unique (user_id)'),
      ('profiles', 'profiles_user_id_fkey',        'foreign key (user_id) references auth.users (id) on delete cascade'),
      ('profiles', 'profiles_sandbox_fkey',        'foreign key (sandbox) references public.profiles (id) on delete cascade'),
      ('profiles', 'profiles_login_matches_id',    'check (user_id is null or user_id = id)'),
      ('profiles', 'profiles_login_or_sandbox',    'check (user_id is not null or sandbox is not null)'),
      ('profiles', 'profiles_name_length',         'check (char_length(full_name) <= 80)'),
      ('services', 'services_rate_matches_unit',   'check ((price_unit = ''hour'') = (hourly_rate_cents is not null))'),
      ('bookings', 'bookings_option_id_fkey',      'foreign key (option_id) references public.service_options (id) on delete set null'),
      ('bookings', 'bookings_total_cents_check',   'check (total_cents > 0)'),
      ('bookings', 'bookings_paid_only_when_done', 'check (paid_at is null or status = ''completed'')')
    ) as t (table_name, name, definition)
  loop
    if not exists (select 1 from pg_constraint
                   where conname = rule.name and conrelid = ('public.' || rule.table_name)::regclass) then
      execute format('alter table public.%I add constraint %I %s', rule.table_name, rule.name, rule.definition);
    end if;
  end loop;
end $$;

comment on column public.profiles.role is
  'Which dashboard opens first. Anyone can switch between booking and providing.';
comment on column public.profiles.sandbox is
  'Empty for real accounts. For a demo visitor it is their own id, and the pretend people made for them carry the same value. People only ever deal with others in the same sandbox, so demo data and real data never mix.';

-- Functions whose inputs or outputs changed have to be removed before they can
-- be made again. The view is removed first because it uses one of them.
drop view if exists public.booking_details;
drop view if exists public.service_catalogue;
drop function if exists public.create_booking(integer, text, text, text, date);
drop function if exists public.open_jobs();


-- 3. HELPERS -----------------------------------------------------------------

-- "Today" in Ireland, whatever time zone the database server is in.
create or replace function public.today()
returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Dublin')::date
$$;

-- The numbers behind the Pro plan, in one place. The website reads them from
-- here too, so what it says can never differ from what the database enforces.
create or replace function public.pro_plan()
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'price_cents',          700,   -- what one period of Pro costs
    'days',                 30,    -- how long one period lasts
    'trial_days',           14,    -- the free trial, once per account
    'early_access_minutes', 5,     -- how long a new request is shown to Pro members only
    'free_active_jobs',     3,     -- jobs a pro can hold at once on the free plan
    'member_active_jobs',   10     -- and as a Pro member
  )
$$;

create or replace function public.early_access_window()
returns interval
language sql immutable
set search_path = ''
as $$
  select make_interval(mins => (public.pro_plan() ->> 'early_access_minutes')::integer)
$$;

-- The price of one option: its own price, or the hourly rate times its hours.
create or replace function public.option_total(p_hourly_rate_cents integer, p_hours numeric, p_price_cents integer)
returns integer
language sql immutable
set search_path = ''
as $$
  select coalesce(p_price_cents, round(p_hourly_rate_cents * p_hours)::integer)
$$;

-- When someone signs up, give them a profile. The name and the role come from
-- the sign-up form (Supabase stores them as "user metadata"). Visitors trying
-- the demo have no email, so they start out as "Guest".
--
-- A guest is put in a sandbox of their own from this first moment (section 10),
-- so a guest session can never see or touch a real person's bookings, whether
-- or not the demo's sample data was ever added to it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, user_id, full_name, role, sandbox)
  values (
    new.id,
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'Guest'), 80),
    case when new.raw_user_meta_data ->> 'role' = 'pro' then 'pro' else 'client' end,
    case when new.is_anonymous then new.id end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this file was run get a profile too.
insert into public.profiles (id, user_id, full_name, role, sandbox)
select
  u.id,
  u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1), 'Guest'), 80),
  case when u.raw_user_meta_data ->> 'role' = 'pro' then 'pro' else 'client' end,
  case when u.is_anonymous then u.id end
from auth.users u
on conflict (id) do nothing;

-- And any guest that already has a profile without a sandbox gets one now.
update public.profiles p
   set sandbox = p.id
  from auth.users u
 where u.id = p.id and u.is_anonymous and p.sandbox is null;

-- When a professional's profile is removed (they deleted their account, or it
-- was removed in the dashboard), the jobs they had accepted go back on offer,
-- so no client is left waiting for someone who is gone.
create or replace function public.release_jobs_of_deleted_pro()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.bookings
     set pro_id = null, status = 'requested', updated_at = now()
   where pro_id = old.id and status = 'accepted';
  return old;
end;
$$;

drop trigger if exists on_profile_deleted on public.profiles;
create trigger on_profile_deleted
  before delete on public.profiles
  for each row execute function public.release_jobs_of_deleted_pro();


-- 4. WHO CAN READ WHAT (Row Level Security) ----------------------------------

alter table public.profiles        enable row level security;
alter table public.services        enable row level security;
alter table public.service_options enable row level security;
alter table public.bookings        enable row level security;
alter table public.reviews         enable row level security;
alter table public.payments        enable row level security;
alter table public.pro_services    enable row level security;
alter table public.pro_areas       enable row level security;

-- Services and their options: public, read-only.
drop policy if exists "Anyone can see the services" on public.services;
create policy "Anyone can see the services"
  on public.services for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can see the options" on public.service_options;
create policy "Anyone can see the options"
  on public.service_options for select
  to anon, authenticated
  using (true);

-- Bookings: only the client who made it and the pro who took it.
drop policy if exists "People see the bookings they are part of" on public.bookings;
create policy "People see the bookings they are part of"
  on public.bookings for select
  to authenticated
  using (client_id = (select auth.uid()) or pro_id = (select auth.uid()));

-- Profiles: your own, plus the person on the other side of one of your bookings
-- (so a client can see who is coming, and a pro can see who they work for).
drop policy if exists "People see their own profile and their booking partners" on public.profiles;
create policy "People see their own profile and their booking partners"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.bookings b
      where (b.client_id = (select auth.uid()) and b.pro_id = profiles.id)
         or (b.pro_id = (select auth.uid()) and b.client_id = profiles.id)
    )
  );

drop policy if exists "People update their own profile" on public.profiles;
create policy "People update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Reviews: the client who wrote it and the pro it is about.
drop policy if exists "People see the reviews they wrote or received" on public.reviews;
create policy "People see the reviews they wrote or received"
  on public.reviews for select
  to authenticated
  using (client_id = (select auth.uid()) or pro_id = (select auth.uid()));

-- Payments and a pro's own preferences: private.
drop policy if exists "People see their own payments" on public.payments;
create policy "People see their own payments"
  on public.payments for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Pros see the services they offer" on public.pro_services;
create policy "Pros see the services they offer"
  on public.pro_services for select
  to authenticated
  using (pro_id = (select auth.uid()));

drop policy if exists "Pros see the areas they cover" on public.pro_areas;
create policy "Pros see the areas they cover"
  on public.pro_areas for select
  to authenticated
  using (pro_id = (select auth.uid()));


-- 5. VIEWS ---------------------------------------------------------------------

-- A professional's reputation: the average of their reviews, how many there are,
-- and how many jobs they have finished. Reviews themselves stay private to the
-- two people involved; this summary is what a client is shown.
create or replace function public.pro_reputation(p_pro_id uuid)
returns table (rating numeric, reviews integer, jobs_done integer)
language sql stable security definer
set search_path = ''
as $$
  select
    (select round(avg(r.rating), 1) from public.reviews r where r.pro_id = p_pro_id),
    (select count(*)::integer from public.reviews r where r.pro_id = p_pro_id),
    (select count(*)::integer from public.bookings b where b.pro_id = p_pro_id and b.status = 'completed')
$$;

-- Each service with its options and their exact prices, ready for the website.
-- "security_invoker" means the rules from section 4 still apply to whoever asks.
create view public.service_catalogue
with (security_invoker = true)
as
select
  s.id,
  s.slug,
  s.name,
  s.description,
  s.icon,
  s.price_unit,
  s.hourly_rate_cents,
  s.option_label,
  s.sort_order,
  (select min(public.option_total(s.hourly_rate_cents, o.hours, o.price_cents))
     from public.service_options o
    where o.service_id = s.id) as from_cents,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'id',          o.id,
            'label',       o.label,
            'hours',       o.hours,
            'price_cents', o.price_cents,
            'total_cents', public.option_total(s.hourly_rate_cents, o.hours, o.price_cents)
          ) order by o.sort_order), '[]'::jsonb)
     from public.service_options o
    where o.service_id = s.id) as options
from public.services s;

-- A booking with the service, both names, the pro's reputation and the review
-- already joined in. This is what the dashboards read.
create view public.booking_details
with (security_invoker = true)
as
select
  b.id,
  b.client_id,
  b.pro_id,
  b.status,
  b.option,
  b.details,
  b.eircode,
  b.scheduled_date,
  b.total_cents,
  b.paid_at,
  b.created_at,
  b.updated_at,
  s.name         as service_name,
  s.icon         as service_icon,
  s.slug         as service_slug,
  c.full_name    as client_name,
  p.full_name    as pro_name,
  coalesce(p.pro_until > now(), false) as pro_is_member,
  rep.rating     as pro_rating,
  rep.reviews    as pro_reviews,
  r.rating       as review_rating,
  r.comment      as review_comment
from public.bookings b
join public.services s on s.id = b.service_id
join public.profiles c on c.id = b.client_id
left join public.profiles p on p.id = b.pro_id
left join public.reviews r on r.booking_id = b.id
left join lateral public.pro_reputation(b.pro_id) rep on b.pro_id is not null;


-- 6. THE LIFE OF A BOOKING ---------------------------------------------------------
-- A booking moves through these states:
--
--   requested --accept--> accepted --complete--> completed --> paid, reviewed
--       |                    |  ^
--       |                    |  +--release (the pro gives the job back)
--       +------cancel--------+--> cancelled
--
-- Each function below is one arrow. "security definer" lets the function write
-- to the table even though people cannot; the checks inside are what keep it safe.

-- A client asks for a service by choosing one of its options.
create or replace function public.create_booking(
  p_option_id integer,
  p_details   text,
  p_eircode   text,
  p_date      date
)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_option  public.service_options;
  v_service public.services;
  v_eircode text := upper(regexp_replace(coalesce(p_eircode, ''), '\s', '', 'g'));
  v_details text := trim(coalesce(p_details, ''));
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'Please log in to book a service.';
  end if;

  select * into v_option from public.service_options where id = p_option_id;
  if not found then
    raise exception 'Please choose one of the options.';
  end if;
  select * into v_service from public.services where id = v_option.service_id;

  if char_length(v_details) > 500 then
    raise exception 'Please keep the notes under 500 characters.';
  end if;

  -- Store Eircodes in one shape: "V94 T9PX".
  if v_eircode !~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$' then
    raise exception 'That does not look like an Eircode. Example: V94 T9PX.';
  end if;
  v_eircode := left(v_eircode, 3) || ' ' || right(v_eircode, 4);

  if p_date is null or p_date < public.today() then
    raise exception 'Please choose today or a later date.';
  end if;

  if p_date > public.today() + 90 then
    raise exception 'Bookings can be made up to 90 days ahead.';
  end if;

  -- Holding their own profile row makes this person's bookings arrive one at a
  -- time, so two sent at the same moment cannot both slip under the limit.
  perform 1 from public.profiles where id = v_user for update;

  if (select count(*) from public.bookings
      where client_id = v_user and status in ('requested', 'accepted')) >= 5 then
    raise exception 'You already have 5 open bookings. Cancel one, or wait until one is done.';
  end if;

  -- The price is worked out here, never taken from the browser, and kept on the
  -- booking so a later price change does not alter what was agreed.
  insert into public.bookings (client_id, service_id, option_id, option, total_cents, details, eircode, scheduled_date)
  values (
    v_user, v_service.id, v_option.id, v_option.label,
    public.option_total(v_service.hourly_rate_cents, v_option.hours, v_option.price_cents),
    v_details, v_eircode, p_date
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- The client changes their mind (before the job is done).
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_booking public.bookings;
begin
  update public.bookings
     set status = 'cancelled', updated_at = now()
   where id = p_booking_id
     and client_id = v_user
     and status in ('requested', 'accepted')
  returning * into v_booking;

  if not found then
    raise exception 'This booking can no longer be cancelled.';
  end if;
  return v_booking;
end;
$$;

-- May this professional take this request? One answer, used everywhere:
--   'no'     it is not for them (taken, their own, in the past, another sandbox,
--            or outside the services and areas they chose)
--   'early'  yes, but it is new enough that only Pro members may take it yet
--   'open'   yes
create or replace function public.job_access(p_booking public.bookings, p_pro public.profiles)
returns text
language sql stable
set search_path = ''
as $$
  select case
    when p_booking.status <> 'requested' then 'no'
    when p_booking.client_id = p_pro.id then 'no'
    when p_booking.scheduled_date < public.today() then 'no'
    when (select c.sandbox from public.profiles c where c.id = p_booking.client_id)
         is distinct from p_pro.sandbox then 'no'
    when exists (select 1 from public.pro_services ps where ps.pro_id = p_pro.id)
         and not exists (select 1 from public.pro_services ps
                         where ps.pro_id = p_pro.id and ps.service_id = p_booking.service_id) then 'no'
    when exists (select 1 from public.pro_areas pa where pa.pro_id = p_pro.id)
         and not exists (select 1 from public.pro_areas pa
                         where pa.pro_id = p_pro.id and pa.routing_key = split_part(p_booking.eircode, ' ', 1)) then 'no'
    when p_booking.created_at > now() - public.early_access_window() then 'early'
    else 'open'
  end
$$;

-- What a pro sees before taking a job: the service, the date, the price and the
-- area (the first half of the Eircode). The full Eircode points to one exact
-- address, so it stays hidden, with the client's name, until the job is accepted.
create function public.open_jobs()
returns table (
  id             uuid,
  service_name   text,
  service_icon   text,
  option         text,
  details        text,
  area           text,
  scheduled_date date,
  total_cents    integer,
  created_at     timestamptz,
  early_access   boolean       -- true while only Pro members can see it
)
language sql stable security definer
set search_path = ''
as $$
  select
    b.id, s.name, s.icon, b.option, b.details, split_part(b.eircode, ' ', 1),
    b.scheduled_date, b.total_cents, b.created_at, public.job_access(b, me) = 'early'
  from public.profiles me
  join public.bookings b on public.job_access(b, me) in ('open', 'early')
  join public.services s on s.id = b.service_id
  where me.id = auth.uid()
    and (public.job_access(b, me) = 'open' or coalesce(me.pro_until > now(), false))
  order by b.scheduled_date, b.created_at
$$;

-- For pros on the free plan: how many requests are waiting behind early access,
-- and when the next one opens to everyone. This is all they learn about them.
create or replace function public.locked_jobs()
returns table (jobs integer, next_opens_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select count(b.id)::integer, min(b.created_at) + public.early_access_window()
  from public.profiles me
  left join public.bookings b
         on public.job_access(b, me) = 'early' and not coalesce(me.pro_until > now(), false)
  where me.id = auth.uid()
$$;

-- A pro takes a job. Two rows are locked while this runs:
--   * the pro's own profile, so one pro's accepts happen one at a time and the
--     limit on jobs held at once cannot be beaten by sending several together;
--   * the booking, so if two pros press the button at the same moment the second
--     waits for the first, then finds the job taken.
create or replace function public.accept_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_me      public.profiles;
  v_member  boolean;
  v_limit   integer;
  v_access  text;
  v_booking public.bookings;
begin
  select * into v_me from public.profiles where id = v_user for update;
  if not found then
    raise exception 'Please log in to accept jobs.';
  end if;
  v_member := coalesce(v_me.pro_until > now(), false);

  select * into v_booking from public.bookings where id = p_booking_id for update;
  v_access := case when found then public.job_access(v_booking, v_me) else 'no' end;

  if v_access = 'no' then
    raise exception 'This job is no longer available.';
  end if;
  if v_access = 'early' and not v_member then
    raise exception 'This request is in early access for Pro members. It opens to everyone in a few minutes.';
  end if;

  v_limit := (public.pro_plan() ->> case when v_member then 'member_active_jobs' else 'free_active_jobs' end)::integer;
  if (select count(*) from public.bookings where pro_id = v_user and status = 'accepted') >= v_limit then
    if v_member then
      raise exception 'You already have % jobs to do. Finish one before taking another.', v_limit;
    end if;
    raise exception 'You already have % jobs to do, the most the free plan allows. Finish one first, or go Pro to hold up to %.',
      v_limit, public.pro_plan() ->> 'member_active_jobs';
  end if;

  update public.bookings
     set pro_id = v_user, status = 'accepted', updated_at = now()
   where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- The pro gives a job back, so another pro can take it.
create or replace function public.release_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_booking public.bookings;
begin
  update public.bookings
     set pro_id = null, status = 'requested', updated_at = now()
   where id = p_booking_id
     and pro_id = v_user
     and status = 'accepted'
  returning * into v_booking;

  if not found then
    raise exception 'This job cannot be given back.';
  end if;
  return v_booking;
end;
$$;

-- The pro marks the job as done. Not before the day it was booked for.
create or replace function public.complete_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_booking public.bookings;
begin
  select * into v_booking
    from public.bookings
   where id = p_booking_id and pro_id = v_user and status = 'accepted'
     for update;

  if not found then
    raise exception 'This job cannot be marked as done.';
  end if;

  if v_booking.scheduled_date > public.today() then
    raise exception 'You can mark this job as done on the day it is booked for.';
  end if;

  update public.bookings
     set status = 'completed', updated_at = now()
   where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- The client rates the job, once, after it is done.
create or replace function public.review_booking(p_booking_id uuid, p_rating integer, p_comment text)
returns public.reviews
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_comment text := trim(coalesce(p_comment, ''));
  v_booking public.bookings;
  v_review  public.reviews;
begin
  select * into v_booking from public.bookings where id = p_booking_id and client_id = v_user;

  if not found or v_booking.status <> 'completed' then
    raise exception 'You can review a booking once the job is done.';
  end if;
  if v_booking.pro_id is null then
    raise exception 'The professional for this booking no longer has an account.';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Please choose between 1 and 5 stars.';
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'Please keep the comment under 500 characters.';
  end if;
  if exists (select 1 from public.reviews where booking_id = p_booking_id) then
    raise exception 'You have already reviewed this booking.';
  end if;

  insert into public.reviews (booking_id, client_id, pro_id, rating, comment)
  values (p_booking_id, v_user, v_booking.pro_id, p_rating, v_comment)
  returning * into v_review;

  return v_review;
end;
$$;


-- 7. PROFESSIONALS: PREFERENCES AND THE PRO PLAN ------------------------------------

-- A pro says which services they offer and which areas they cover. An empty
-- list means "all of them". Areas are Eircode routing keys such as V94 or D6W.
create or replace function public.set_pro_preferences(p_service_ids integer[], p_areas text[])
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_services integer[] := array(select distinct s from unnest(coalesce(p_service_ids, '{}')) s where s is not null);
  v_areas    text[]    := array(select distinct upper(trim(a)) from unnest(coalesce(p_areas, '{}')) a where trim(a) <> '');
begin
  if v_user is null then
    raise exception 'Please log in first.';
  end if;
  if exists (select 1 from unnest(v_services) s where s not in (select id from public.services)) then
    raise exception 'One of those services does not exist.';
  end if;
  if exists (select 1 from unnest(v_areas) a where a !~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W)$') then
    raise exception 'Areas are the first 3 characters of an Eircode, for example V94 or D6W.';
  end if;
  if coalesce(array_length(v_areas, 1), 0) > 30 then
    raise exception 'Please choose up to 30 areas.';
  end if;

  delete from public.pro_services where pro_id = v_user;
  insert into public.pro_services (pro_id, service_id) select v_user, s from unnest(v_services) s;

  delete from public.pro_areas where pro_id = v_user;
  insert into public.pro_areas (pro_id, routing_key) select v_user, a from unnest(v_areas) a;
end;
$$;

-- The free trial of the Pro plan: once per account.
create or replace function public.start_pro_trial()
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then
    raise exception 'Please log in first.';
  end if;
  if v_profile.pro_until > now() then
    raise exception 'You are already a Pro member.';
  end if;
  if v_profile.trial_used then
    raise exception 'You have already used your free trial.';
  end if;

  update public.profiles
     set trial_used = true,
         pro_until  = now() + make_interval(days => (public.pro_plan() ->> 'trial_days')::integer)
   where id = v_user
  returning * into v_profile;

  return v_profile;
end;
$$;


-- 8. PAYMENTS ----------------------------------------------------------------------
-- These two functions are the only way a payment gets recorded, and only the
-- server-side payment function (supabase/functions/payments) may call them, after
-- it has checked with Stripe that the money really arrived. Section 11 makes sure
-- nobody else can.

-- A client's payment for a finished job.
create or replace function public.mark_booking_paid(p_booking_id uuid, p_ref text, p_amount_cents integer)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.';
  end if;

  -- Being told about the same payment twice changes nothing.
  if exists (select 1 from public.payments where provider_ref = p_ref) then
    return v_booking;
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'A booking is paid once the job is done.';
  end if;
  if v_booking.paid_at is not null then
    raise exception 'This booking is already paid.';
  end if;
  if p_amount_cents is distinct from v_booking.total_cents then
    raise exception 'The amount paid does not match the booking.';
  end if;

  insert into public.payments (user_id, kind, booking_id, amount_cents, provider_ref)
  values (v_booking.client_id, 'booking', v_booking.id, p_amount_cents, p_ref);

  update public.bookings
     set paid_at = now(), updated_at = now()
   where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- A professional's payment for one period of the Pro plan. Time is added to the
-- end of what they already have, so buying early loses nothing.
create or replace function public.activate_pro_plan(p_user_id uuid, p_ref text, p_amount_cents integer)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Account not found.';
  end if;

  if exists (select 1 from public.payments where provider_ref = p_ref) then
    return v_profile;
  end if;

  if p_amount_cents is distinct from (public.pro_plan() ->> 'price_cents')::integer then
    raise exception 'The amount paid does not match the price of the Pro plan.';
  end if;

  insert into public.payments (user_id, kind, amount_cents, provider_ref)
  values (p_user_id, 'pro_plan', p_amount_cents, p_ref);

  update public.profiles
     set pro_until = greatest(coalesce(pro_until, now()), now())
                     + make_interval(days => (public.pro_plan() ->> 'days')::integer)
   where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;


-- 9. DELETING AN ACCOUNT -----------------------------------------------------------

-- Removes the login. Everything that belongs to the person goes with it: their
-- profile, the bookings they made, their reviews and preferences. Jobs they had
-- accepted as a pro go back on offer (see the trigger in section 3).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Please log in first.';
  end if;
  delete from auth.users where id = v_user;
end;
$$;


-- 10. THE DEMO SANDBOX --------------------------------------------------------------
-- A visitor can try the site without registering. The website signs them in as a
-- guest (a Supabase "anonymous" user) and calls start_demo, which gives them a
-- private sandbox: two pretend people and bookings in every state, so both
-- dashboards have something to show. Nobody outside the sandbox ever sees it.

-- Adds one booking to a sandbox, in whatever state the demo needs.
create or replace function public.demo_booking(
  p_client  uuid,
  p_pro     uuid,                    -- null while nobody has taken it
  p_option  integer,
  p_status  text,
  p_days    integer,                 -- booked for today plus this many days
  p_age     interval,                -- how long ago it was requested
  p_eircode text,
  p_details text    default '',
  p_paid    boolean default false,
  p_rating  integer default null,
  p_comment text    default ''
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.bookings
    (client_id, pro_id, service_id, option_id, option, total_cents, details, eircode,
     scheduled_date, status, paid_at, created_at, updated_at)
  select
    p_client, p_pro, s.id, o.id, o.label,
    public.option_total(s.hourly_rate_cents, o.hours, o.price_cents),
    p_details, p_eircode, public.today() + p_days, p_status,
    case when p_paid then now() - interval '1 day' end,
    now() - p_age, now() - p_age
  from public.service_options o
  join public.services s on s.id = o.service_id
  where o.id = p_option
  returning id into v_id;

  if p_rating is not null then
    insert into public.reviews (booking_id, client_id, pro_id, rating, comment)
    values (v_id, p_client, p_pro, p_rating, p_comment);
  end if;

  return v_id;
end;
$$;

create or replace function public.start_demo(p_role text default 'client')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_role   text := case when p_role = 'pro' then 'pro' else 'client' end;
  v_client uuid;   -- the pretend client, Aoife
  v_pro    uuid;   -- the pretend professional, Seán
begin
  if not coalesce((select u.is_anonymous from auth.users u where u.id = v_user), false) then
    raise exception 'The demo runs in a guest session. Your own account is not changed.';
  end if;

  -- One at a time for the same guest, so a double click cannot add the samples twice.
  perform 1 from public.profiles where id = v_user for update;

  -- Housekeeping: guests from more than 3 days ago are removed, and their
  -- sandboxes go with them.
  delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '3 days';

  -- Asked twice? The sample data is already there; only the starting dashboard changes.
  if exists (select 1 from public.profiles where sandbox = v_user and user_id is null) then
    update public.profiles set role = v_role where id = v_user;
    return;
  end if;

  update public.profiles
     set full_name = 'Guest', role = v_role, sandbox = v_user
   where id = v_user;

  insert into public.profiles (full_name, role, sandbox)
  values ('Aoife Byrne', 'client', v_user)
  returning id into v_client;

  insert into public.profiles (full_name, role, sandbox, pro_until)
  values ('Seán Kelly', 'pro', v_user, now() + interval '30 days')
  returning id into v_pro;

  -- The visitor as a client: one booking in each state.
  perform public.demo_booking(v_user, null,  42, 'requested',  3, '2 hours', 'V94 K2X7', 'Two small dogs, both friendly.');
  perform public.demo_booking(v_user, v_pro, 12, 'accepted',   1, '1 day',   'V94 K2X7');
  perform public.demo_booking(v_user, v_pro, 22, 'completed', -2, '6 days',  'V94 K2X7', 'Side gate is open.');
  perform public.demo_booking(v_user, v_pro, 82, 'completed', -9, '12 days', 'V94 K2X7', '', true,
                              5, 'On time and tidy. The TV is perfectly level.');

  -- Seán's reputation, from jobs he did for Aoife.
  perform public.demo_booking(v_client, v_pro, 13, 'completed', -20, '25 days', 'T12 R5CP', '', true, 5, 'Spotless. Thank you!');
  perform public.demo_booking(v_client, v_pro, 31, 'completed', -34, '40 days', 'T12 R5CP', '', true, 4, 'Good job, arrived a little late.');

  -- The visitor as a professional: requests to accept (the last one is new, so it
  -- is in Pro early access), a job to do today, and one already done and reviewed.
  perform public.demo_booking(v_client, null,   11, 'requested',  2, '3 hours', 'T12 R5CP', 'Top-floor apartment, no lift.');
  perform public.demo_booking(v_client, null,   33, 'requested',  4, '1 hour',  'T12 R5CP');
  perform public.demo_booking(v_client, null,   41, 'requested',  1, '0 minutes', 'T12 R5CP');
  perform public.demo_booking(v_client, v_user, 62, 'accepted',   0, '2 days',  'T12 R5CP', 'An armchair, from the city centre.');
  perform public.demo_booking(v_client, v_user, 71, 'completed', -5, '8 days',  'T12 R5CP', '', true,
                              5, 'Careful work and clean edges. Would book again.');
end;
$$;

-- "Play the other person's next step", so a demo visitor is never left waiting
-- for someone who does not exist.
--   as the client:  a waiting booking is accepted by Seán, an accepted one is done
--   as the pro:     a finished job is paid for and reviewed by Aoife
create or replace function public.demo_advance(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_booking public.bookings;
begin
  if not exists (select 1 from public.profiles where id = v_user and sandbox = v_user) then
    raise exception 'This only works in the demo.';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id and (client_id = v_user or pro_id = v_user)
     for update;
  if not found then
    raise exception 'Booking not found.';
  end if;

  -- The person on the other side has to be one of this sandbox's pretend people.
  -- Guests cannot reach anyone else's bookings anyway; this makes sure of it here.
  if exists (select 1 from public.profiles other
              where other.id in (v_booking.client_id, v_booking.pro_id)
                and other.id <> v_user
                and not (other.sandbox = v_user and other.user_id is null)) then
    raise exception 'This only works on the demo''s own bookings.';
  end if;

  if v_booking.client_id = v_user and v_booking.status = 'requested' then
    update public.bookings
       set status = 'accepted', updated_at = now(),
           pro_id = (select id from public.profiles where sandbox = v_user and user_id is null and role = 'pro' limit 1)
     where id = p_booking_id;

  elsif v_booking.client_id = v_user and v_booking.status = 'accepted' then
    update public.bookings
       set status = 'completed', updated_at = now(), scheduled_date = least(scheduled_date, public.today())
     where id = p_booking_id;

  elsif v_booking.pro_id = v_user and v_booking.status = 'completed' and v_booking.paid_at is null then
    update public.bookings set paid_at = now(), updated_at = now() where id = p_booking_id;   -- pretend money: no payment record
    insert into public.reviews (booking_id, client_id, pro_id, rating, comment)
    values (v_booking.id, v_booking.client_id, v_user, 5, 'Great job, thank you!')
    on conflict (booking_id) do nothing;

  else
    raise exception 'There is nothing left to play for this booking.';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  return v_booking;
end;
$$;


-- 11. PERMISSIONS ---------------------------------------------------------------
-- Supabase gives the two request roles ("anon" = logged out, "authenticated" =
-- logged in) broad rights on new tables and functions. Here those are taken away
-- and only what the app needs is given back. Row Level Security (section 4) then
-- narrows the remaining rights down to the right rows.

revoke all on
  public.profiles, public.services, public.service_options, public.bookings, public.reviews,
  public.payments, public.pro_services, public.pro_areas,
  public.service_catalogue, public.booking_details
from anon, authenticated;

grant select on public.services, public.service_options, public.service_catalogue to anon, authenticated;
grant select on
  public.profiles, public.bookings, public.booking_details, public.reviews,
  public.payments, public.pro_services, public.pro_areas
to authenticated;
grant update (full_name, role) on public.profiles to authenticated;   -- these two columns only

revoke execute on function
  public.today(),
  public.pro_plan(),
  public.early_access_window(),
  public.option_total(integer, numeric, integer),
  public.handle_new_user(),
  public.release_jobs_of_deleted_pro(),
  public.pro_reputation(uuid),
  public.create_booking(integer, text, text, date),
  public.cancel_booking(uuid),
  public.job_access(public.bookings, public.profiles),
  public.open_jobs(),
  public.locked_jobs(),
  public.accept_booking(uuid),
  public.release_booking(uuid),
  public.complete_booking(uuid),
  public.review_booking(uuid, integer, text),
  public.set_pro_preferences(integer[], text[]),
  public.start_pro_trial(),
  public.mark_booking_paid(uuid, text, integer),
  public.activate_pro_plan(uuid, text, integer),
  public.delete_my_account(),
  public.demo_booking(uuid, uuid, integer, text, integer, interval, text, text, boolean, integer, text),
  public.start_demo(text),
  public.demo_advance(uuid)
from public, anon, authenticated;

-- Anyone, logged in or not: what the public pages need.
grant execute on function
  public.pro_plan(),
  public.option_total(integer, numeric, integer)
to anon, authenticated;

-- Logged-in people: the actions.
grant execute on function
  public.pro_reputation(uuid),
  public.create_booking(integer, text, text, date),
  public.cancel_booking(uuid),
  public.open_jobs(),
  public.locked_jobs(),
  public.accept_booking(uuid),
  public.release_booking(uuid),
  public.complete_booking(uuid),
  public.review_booking(uuid, integer, text),
  public.set_pro_preferences(integer[], text[]),
  public.start_pro_trial(),
  public.delete_my_account(),
  public.start_demo(text),
  public.demo_advance(uuid)
to authenticated;

-- The server only (it uses the project's secret key, which never reaches a browser).
grant execute on function
  public.pro_plan(),
  public.mark_booking_paid(uuid, text, integer),
  public.activate_pro_plan(uuid, text, integer)
to service_role;


-- 12. LIVE UPDATES ---------------------------------------------------------------
-- Lets the website be told the moment one of a person's bookings changes
-- (Supabase Realtime). People still only hear about bookings they may read.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;


-- 13. THE SERVICES AND THEIR PRICES ------------------------------------------------
-- To change a price or add a service or an option, edit these lists and run the
-- file again. Option ids are the service id followed by a digit.

insert into public.services
  (id, slug, name, description, icon, price_unit, hourly_rate_cents, option_label, sort_order)
values
  (1, 'home-cleaning',   'Home Cleaning',      'Regular or deep cleaning for houses and apartments.',
   '🧹', 'hour',  1450, 'Property size', 1),
  (2, 'gardening',       'Gardening & Lawn',   'Lawn mowing, hedge trimming, weeding and general garden clean-ups.',
   '🏡', 'fixed', null, 'What needs doing', 2),
  (3, 'car-valeting',    'Eco Car Valeting',   'A waterless exterior wash and an interior vacuum, done in your driveway.',
   '🚗', 'fixed', null, 'Vehicle size', 3),
  (4, 'dog-walking',     'Dog Walking',        'A local walker to exercise your dog around your neighbourhood.',
   '🐕', 'hour',  1500, 'Walk duration', 4),
  (5, 'massage',         'Massage Therapy',    'Relaxation, deep tissue and sports massage in your own home.',
   '💆‍♂️', 'fixed', null, 'Massage type', 5),
  (6, 'item-transport',  'Item Transport',     'Boxes or furniture to move, or something to collect? Local transport on demand.',
   '📦', 'fixed', null, 'Item size', 6),
  (7, 'house-painting',  'House Painting',     'Interior walls, doors and skirting boards, and exterior touch-ups.',
   '🎨', 'hour',  1850, 'Scope of work', 7),
  (8, 'handyman',        'Handyman / Repairs', 'Furniture assembly, TV mounting, small plumbing fixes and general repairs.',
   '🔨', 'hour',  2500, 'Task', 8),
  (9, 'mobile-mechanic', 'Mobile Mechanic',    'Battery jumps, tyre changes, diagnostics and small fixes, wherever your car is.',
   '🔧', 'fixed', null, 'What the car needs', 9)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  price_unit = excluded.price_unit,
  hourly_rate_cents = excluded.hourly_rate_cents,
  option_label = excluded.option_label,
  sort_order = excluded.sort_order;

insert into public.service_options (id, service_id, label, hours, price_cents, sort_order)
values
  -- Home Cleaning, €14.50 an hour
  (11, 1, 'Studio or 1 bedroom',           2,    null, 1),
  (12, 1, '2-3 bedrooms',                  3,    null, 2),
  (13, 1, '4 or more bedrooms',            5,    null, 3),
  -- Gardening & Lawn
  (21, 2, 'Lawn mowing',                   null, 2900, 1),
  (22, 2, 'Lawn mowing and hedge trimming', null, 4900, 2),
  (23, 2, 'Overgrown garden clean-up',     null, 8900, 3),
  (24, 2, 'Green waste removal',           null, 3900, 4),
  -- Eco Car Valeting
  (31, 3, 'Hatchback or small car',        null, 3500, 1),
  (32, 3, 'Saloon',                        null, 4000, 2),
  (33, 3, 'SUV, 7-seater or van',          null, 5000, 3),
  -- Dog Walking, €15 an hour
  (41, 4, '30 minutes',                    0.5,  null, 1),
  (42, 4, '1 hour',                        1,    null, 2),
  (43, 4, '2 hours',                       2,    null, 3),
  -- Massage Therapy
  (51, 5, 'Relaxation, 50 minutes',        null, 5500, 1),
  (52, 5, 'Deep tissue, 50 minutes',       null, 6000, 2),
  (53, 5, 'Sports recovery, 50 minutes',   null, 6500, 3),
  -- Item Transport
  (61, 6, 'Small bags or boxes',           null, 2000, 1),
  (62, 6, 'Medium furniture, such as a chair', null, 3500, 2),
  (63, 6, 'Large items, such as a sofa or bed', null, 6000, 3),
  -- House Painting, €18.50 an hour
  (71, 7, 'One room or a feature wall',    4,    null, 1),
  (72, 7, '2-3 rooms',                     10,   null, 2),
  (73, 7, 'Whole house interior',          24,   null, 3),
  (74, 7, 'Exterior walls or fences',      8,    null, 4),
  -- Handyman / Repairs, €25 an hour
  (81, 8, 'Furniture assembly',            2,    null, 1),
  (82, 8, 'TV wall mounting',              1,    null, 2),
  (83, 8, 'Small plumbing fix',            1.5,  null, 3),
  (84, 8, 'Hanging pictures or shelves',   1,    null, 4),
  -- Mobile Mechanic
  (91, 9, 'Battery jump start',            null, 4000, 1),
  (92, 9, 'Flat tyre change',              null, 4500, 2),
  (93, 9, 'Diagnostics scan',              null, 5500, 3),
  (94, 9, 'Brakes inspection',             null, 5000, 4)
on conflict (id) do update set
  service_id = excluded.service_id,
  label = excluded.label,
  hours = excluded.hours,
  price_cents = excluded.price_cents,
  sort_order = excluded.sort_order;
