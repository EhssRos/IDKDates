-- IDKDates: shared lists and timeline for couples.
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again: it only creates what doesn’t exist yet and replaces the functions.

-- ─── Couple spaces ───────────────────────────────────────────────────────────
-- A space is what two partners share. Everyone starts in their own space; the partner joins it
-- with the invite code.

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists space_members_user on public.space_members(user_id);

-- ─── Everything the app syncs ────────────────────────────────────────────────
-- One table for all synced things, so syncing stays simple:
--   kind 'list'   id = list id                 data = { name, created }
--   kind 'place'  id = '<list id>|<place id>'  data = the saved place
--   kind 'visit'  id = visit id                data = the timeline entry
--   kind 'rating' id = '<visit id>|<user id>'  data = { visit, stars }   (one per person)
-- Nothing is ever hard-deleted by the app: deleted = true marks it, so the other phone learns about it.

create table if not exists public.items (
  space_id uuid not null references public.spaces(id) on delete cascade,
  kind text not null check (kind in ('list', 'place', 'visit', 'rating')),
  id text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  owner uuid default auth.uid(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (space_id, kind, id)
);
create index if not exists items_changes on public.items(space_id, updated_at);

-- The server sets the time of every change, so both phones agree on the order.
create or replace function public.touch_item() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.touch_item();

-- ─── Who may see and change what ─────────────────────────────────────────────

create or replace function public.is_member(s uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from space_members where space_id = s and user_id = auth.uid());
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.items enable row level security;

drop policy if exists "members see their space" on public.spaces;
create policy "members see their space" on public.spaces for select using (public.is_member(id));

drop policy if exists "members see each other" on public.space_members;
create policy "members see each other" on public.space_members for select using (public.is_member(space_id));

drop policy if exists "members read items" on public.items;
create policy "members read items" on public.items for select using (public.is_member(space_id));

-- Anyone in the space can add and change lists, places and visits; ratings only by their owner.
drop policy if exists "members add items" on public.items;
create policy "members add items" on public.items for insert
  with check (public.is_member(space_id) and (kind <> 'rating' or owner = auth.uid()));

drop policy if exists "members change items" on public.items;
create policy "members change items" on public.items for update
  using (public.is_member(space_id) and (kind <> 'rating' or owner = auth.uid()))
  with check (public.is_member(space_id) and (kind <> 'rating' or owner = auth.uid()));

-- ─── Actions the app calls ───────────────────────────────────────────────────

-- Your space, with its members, or null.
create or replace function public.my_space() returns json
  language sql security definer stable set search_path = public as $$
  select json_build_object(
    'space_id', s.id,
    'invite_code', s.invite_code,
    'members', (select json_agg(json_build_object('user_id', m.user_id, 'display_name', m.display_name) order by m.joined_at)
                from space_members m where m.space_id = s.id))
  from spaces s join space_members me on me.space_id = s.id and me.user_id = auth.uid()
  order by me.joined_at desc limit 1;
$$;

-- Your space; creates one if you don’t have one yet.
create or replace function public.create_space(display_name text) returns json
  language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select space_id into sid from space_members where user_id = auth.uid() limit 1;
  if sid is null then
    insert into spaces default values returning id into sid;
    insert into space_members (space_id, user_id, display_name) values (sid, auth.uid(), coalesce(display_name, ''));
  end if;
  return public.my_space();
end $$;

-- Joins your partner’s space with their invite code, leaving your previous one.
create or replace function public.join_space(code text, display_name text) returns json
  language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select id into sid from spaces where invite_code = upper(trim(code));
  if sid is null then raise exception 'invite_not_found'; end if;
  if not exists (select 1 from space_members where space_id = sid and user_id = auth.uid()) then
    if (select count(*) from space_members where space_id = sid) >= 2 then raise exception 'space_full'; end if;
    delete from space_members where user_id = auth.uid();
    delete from spaces s where not exists (select 1 from space_members m where m.space_id = s.id);
    insert into space_members (space_id, user_id, display_name) values (sid, auth.uid(), coalesce(display_name, ''));
  end if;
  return public.my_space();
end $$;

-- Leaves the shared space. The app keeps a copy of everything on the phone.
create or replace function public.leave_space() returns void
  language plpgsql security definer set search_path = public as $$
begin
  delete from space_members where user_id = auth.uid();
  delete from spaces s where not exists (select 1 from space_members m where m.space_id = s.id);
end $$;

create or replace function public.set_display_name(display_name text) returns void
  language sql security definer set search_path = public as $$
  update space_members set display_name = coalesce($1, '') where user_id = auth.uid();
$$;

-- Deletes your account and your ratings. Shared lists and visits stay with your partner.
create or replace function public.delete_account() returns void
  language plpgsql security definer set search_path = public, auth as $$
begin
  delete from public.items where kind = 'rating' and owner = auth.uid();
  delete from public.space_members where user_id = auth.uid();
  delete from public.spaces s where not exists (select 1 from public.space_members m where m.space_id = s.id);
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.my_space(), public.create_space(text), public.join_space(text, text),
  public.leave_space(), public.set_display_name(text), public.delete_account() from public, anon;
grant execute on function public.my_space(), public.create_space(text), public.join_space(text, text),
  public.leave_space(), public.set_display_name(text), public.delete_account() to authenticated;
