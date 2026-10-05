-- A stand-in for the parts of Supabase that supabase/schema.sql relies on, so the
-- schema can be loaded into a plain Postgres for testing:
--   * the auth.users table (only the columns the schema reads)
--   * the two roles requests run as: "anon" (logged out) and "authenticated"
--   * auth.uid(), which tells the database who is asking

create schema if not exists auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  raw_user_meta_data jsonb not null default '{}'
);

create role anon nologin;
create role authenticated nologin;

grant usage on schema public, auth to anon, authenticated;

-- Supabase lets both roles do anything to new tables and functions unless told
-- otherwise. Copying that here means the tests check that schema.sql really does
-- lock things down, instead of passing because nothing was open to begin with.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Supabase puts the logged-in user's id in a request setting; the tests do the same.
create function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
