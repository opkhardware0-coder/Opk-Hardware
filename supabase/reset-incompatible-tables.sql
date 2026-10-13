-- DESTRUCTIVE RESET: permanently deletes data in these existing tables.
-- Run this only if you intend to replace the current schema.
-- Then run schema.sql to recreate the tables, triggers, grants, and RLS policies.

drop table if exists public.sales cascade;
drop table if exists public.customers cascade;
drop table if exists public.products cascade;
drop table if exists public.profiles cascade;
