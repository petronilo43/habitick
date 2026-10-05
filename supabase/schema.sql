-- ============================================================================
-- Habitick database
--
-- How to use: open the Supabase dashboard, go to SQL Editor, paste this whole
-- file and press Run. It is safe to run more than once.
--
-- The design in one paragraph:
--   * Three tables: profiles (people), services (what can be booked) and
--     bookings (who booked what, and who is doing the job).
--   * Row Level Security decides what each person can READ: everyone can see
--     the services, and you can only see bookings you are part of.
--   * Nobody can write to bookings directly. Every change goes through one of
--     the functions in section 5, and each function checks the rules first.
--     That way the rules can't be skipped from the browser.
-- ============================================================================


-- 1. TABLES ------------------------------------------------------------------

-- One row per account. Supabase keeps emails and passwords in its own
-- auth.users table; this table holds what the app itself needs to know.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'client' check (role in ('client', 'pro')),
  created_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'Which dashboard opens first. Anyone can switch between booking and providing.';

-- The catalogue. Prices are stored in cents so there is no rounding trouble.
create table if not exists public.services (
  id           smallint primary key,
  slug         text not null unique,
  name         text not null,
  description  text not null,
  icon         text not null,
  price_cents  integer not null check (price_cents > 0),
  price_unit   text not null check (price_unit in ('hour', 'fixed')),
  option_label text not null,          -- the question asked when booking, e.g. "Property Size"
  options      text[] not null,        -- the answers to choose from
  sort_order   smallint not null default 0
);

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles (id) on delete cascade,
  pro_id         uuid references public.profiles (id) on delete set null,
  service_id     smallint not null references public.services (id),
  option         text not null,
  details        text not null default '' check (char_length(details) <= 500),
  eircode        text not null check (eircode ~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W) [0-9AC-FHKNPRTV-Y]{4}$'),
  scheduled_date date not null,
  status         text not null default 'requested'
                 check (status in ('requested', 'accepted', 'completed', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bookings_client_idx on public.bookings (client_id);
create index if not exists bookings_pro_idx    on public.bookings (pro_id);
create index if not exists bookings_open_idx   on public.bookings (scheduled_date) where status = 'requested';


-- 2. HELPERS -----------------------------------------------------------------

-- "Today" in Ireland, whatever time zone the database server is in.
create or replace function public.today()
returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Dublin')::date
$$;

-- When someone signs up, give them a profile. The name and the role come from
-- the sign-up form (Supabase stores them as "user metadata").
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'role' = 'pro' then 'pro' else 'client' end
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
insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
  case when u.raw_user_meta_data ->> 'role' = 'pro' then 'pro' else 'client' end
from auth.users u
on conflict (id) do nothing;


-- 3. WHO CAN READ WHAT (Row Level Security) ----------------------------------

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;

-- Services: public, read-only.
drop policy if exists "Anyone can see the services" on public.services;
create policy "Anyone can see the services"
  on public.services for select
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


-- 4. A READY-MADE VIEW FOR THE DASHBOARDS -------------------------------------

-- A booking with the service and both names already joined in.
-- "security_invoker" means the rules from section 3 still apply to whoever asks.
drop view if exists public.booking_details;
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
  b.created_at,
  b.updated_at,
  s.name        as service_name,
  s.icon        as service_icon,
  s.price_cents as price_cents,
  s.price_unit  as price_unit,
  c.full_name   as client_name,
  p.full_name   as pro_name
from public.bookings b
join public.services s on s.id = b.service_id
join public.profiles c on c.id = b.client_id
left join public.profiles p on p.id = b.pro_id;


-- 5. THE ACTIONS ---------------------------------------------------------------
-- A booking moves through these states:
--
--   requested --accept--> accepted --complete--> completed
--       |                    |  ^
--       |                    |  +--release (the pro gives the job back)
--       +------cancel--------+--> cancelled
--
-- Each function below is one arrow. "security definer" lets the function write
-- to the table even though people cannot; the checks inside are what keep it safe.

-- A client asks for a service.
create or replace function public.create_booking(
  p_service_id integer,
  p_option     text,
  p_details    text,
  p_eircode    text,
  p_date       date
)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_service public.services;
  v_eircode text := upper(regexp_replace(coalesce(p_eircode, ''), '\s', '', 'g'));
  v_details text := trim(coalesce(p_details, ''));
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'Please log in to book a service.';
  end if;

  select * into v_service from public.services where id = p_service_id;
  if not found then
    raise exception 'That service does not exist.';
  end if;

  if p_option is null or not (p_option = any (v_service.options)) then
    raise exception 'Please choose one of the options for %.', v_service.name;
  end if;

  if p_option = 'Other' and v_details = '' then
    raise exception 'Please describe what you need.';
  end if;

  if char_length(v_details) > 500 then
    raise exception 'Please keep the description under 500 characters.';
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

  if (select count(*) from public.bookings
      where client_id = v_user and status in ('requested', 'accepted')) >= 5 then
    raise exception 'You already have 5 open bookings. Cancel one, or wait until one is done.';
  end if;

  insert into public.bookings (client_id, service_id, option, details, eircode, scheduled_date)
  values (v_user, v_service.id, p_option, v_details, v_eircode, p_date)
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

-- What a pro sees before taking a job: the service, the date and the area
-- (the first half of the Eircode). The full Eircode points to one exact
-- address, so it stays hidden, with the client's name, until the job is accepted.
create or replace function public.open_jobs()
returns table (
  id             uuid,
  service_name   text,
  service_icon   text,
  price_cents    integer,
  price_unit     text,
  option         text,
  details        text,
  area           text,
  scheduled_date date,
  created_at     timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select
    b.id, s.name, s.icon, s.price_cents, s.price_unit,
    b.option, b.details, split_part(b.eircode, ' ', 1), b.scheduled_date, b.created_at
  from public.bookings b
  join public.services s on s.id = b.service_id
  where b.status = 'requested'
    and b.client_id <> auth.uid()            -- not your own requests
    and b.scheduled_date >= public.today()   -- not ones whose day has passed
  order by b.scheduled_date, b.created_at
$$;

-- A pro takes a job. If two pros press the button at the same moment, the
-- database lets only one UPDATE match; the other gets the "no longer available" message.
create or replace function public.accept_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'Please log in to accept jobs.';
  end if;

  update public.bookings
     set pro_id = v_user, status = 'accepted', updated_at = now()
   where id = p_booking_id
     and status = 'requested'
     and client_id <> v_user
  returning * into v_booking;

  if not found then
    raise exception 'This job is no longer available.';
  end if;
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


-- 6. PERMISSIONS ---------------------------------------------------------------
-- Supabase gives the two request roles ("anon" = logged out, "authenticated" =
-- logged in) broad rights on new tables. Here those are taken away and only what
-- the app needs is given back. Row Level Security (section 3) then narrows the
-- remaining rights down to the right rows.

revoke all on public.services, public.profiles, public.bookings, public.booking_details
  from anon, authenticated;

grant select on public.services to anon, authenticated;
grant select on public.profiles, public.bookings, public.booking_details to authenticated;
grant update (full_name, role) on public.profiles to authenticated;   -- these two columns only

revoke execute on function
  public.create_booking(integer, text, text, text, date),
  public.cancel_booking(uuid),
  public.open_jobs(),
  public.accept_booking(uuid),
  public.release_booking(uuid),
  public.complete_booking(uuid)
from public, anon;

grant execute on function
  public.create_booking(integer, text, text, text, date),
  public.cancel_booking(uuid),
  public.open_jobs(),
  public.accept_booking(uuid),
  public.release_booking(uuid),
  public.complete_booking(uuid)
to authenticated;


-- 7. THE SERVICES ----------------------------------------------------------------
-- To change a price or add a service, edit this list and run the file again.

insert into public.services
  (id, slug, name, description, icon, price_cents, price_unit, option_label, options, sort_order)
values
  (1, 'home-cleaning', 'Home Cleaning',
   'Deep or regular cleaning for houses and apartments nationwide.',
   '🧹', 1450, 'hour', 'Property Size',
   array['1 Bedroom / Studio', '2-3 Bedrooms', '4+ Bedrooms', 'Other'], 1),
  (2, 'gardening', 'Gardening & Lawn',
   'Lawn mowing, hedge trimming, weeding, and general garden cleanups.',
   '🏡', 2900, 'fixed', 'Garden Condition',
   array['Regular Maintenance', 'Overgrown / Needs deep clean', 'Green Waste Removal', 'Other'], 2),
  (3, 'car-valeting', 'Eco Car Valeting',
   'Premium waterless exterior car wash and interior vacuuming right at your driveway.',
   '🚗', 3500, 'fixed', 'Vehicle Size',
   array['Hatchback / Small', 'Saloon / Sedan', 'SUV / 7-Seater / Van', 'Other'], 3),
  (4, 'dog-walking', 'Dog Walking',
   'Reliable, fully insured local walkers to exercise your dog in your neighborhood.',
   '🐕', 1500, 'hour', 'Walk Duration',
   array['30 Minutes', '1 Hour', '2 Hours', 'Other'], 4),
  (5, 'massage', 'Massage Therapy',
   'Leisure, therapeutic, and relaxation massages conducted by certified professionals at your home.',
   '💆‍♂️', 5500, 'fixed', 'Massage Type',
   array['Relaxation (50 min)', 'Deep Tissue (50 min)', 'Sports Recovery', 'Other'], 5),
  (6, 'item-transport', 'Item Transport',
   'Need to move boxes, furniture, or fetch an item? Quick courier and local transport on demand.',
   '📦', 2000, 'fixed', 'Item Size',
   array['Small Bags/Boxes', 'Medium Furniture (e.g. Chair)', 'Large Items (e.g. Sofa, Bed)', 'Other'], 6),
  (7, 'house-painting', 'House Painting',
   'Professional interior wall painting, door skirting, and exterior detailing.',
   '🎨', 1850, 'hour', 'Scope of Work',
   array['1 Room or Feature Wall', '2-3 Rooms', 'Whole House Interior', 'Exterior / Fences', 'Other'], 7),
  (8, 'handyman', 'Handyman / Repairs',
   'Small home construction works, furniture assembly, TV wall mounting, and general property maintenance.',
   '🔨', 2500, 'hour', 'Required Task',
   array['Furniture Assembly (IKEA etc)', 'TV Wall Mounting', 'Plumbing (Leaking Taps, etc)', 'Hanging Pictures / Shelves', 'Other'], 8),
  (9, 'mobile-mechanic', 'Mobile Mechanic',
   'On-demand car diagnostics, battery jumps, roadside tyre changes, and minor mechanical fixes.',
   '🔧', 4000, 'fixed', 'Vehicle Issue',
   array['Dead Battery Jump Start', 'Flat Tyre Change', 'Computer Diagnostics Scan', 'Brakes Inspection', 'Other'], 9)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  price_cents = excluded.price_cents,
  price_unit = excluded.price_unit,
  option_label = excluded.option_label,
  options = excluded.options,
  sort_order = excluded.sort_order;
