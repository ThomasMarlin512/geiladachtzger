create table public.group_program_items (
 id uuid primary key default gen_random_uuid(),
 event_id text not null references public.group_events(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 2 and 100),
 description text not null default '' check(char_length(description)<=1500),
 category text not null default 'activity' check(category in ('activity','food','hotel','travel','other')),
 day_number integer check(day_number between 1 and 31),
 time_label text not null default '' check(char_length(time_label)<=80),
 cost_label text not null default '' check(char_length(cost_label)<=120),
 website_url text not null default '' check(website_url='' or (website_url ~ '^https://[^[:space:]]+$' and char_length(website_url)<=2048)),
 created_by_key text not null references public.trip_attendance(roster_key),
 created_at timestamptz not null default now()
);
create index group_program_items_event_idx on public.group_program_items(event_id);
create index group_program_items_author_idx on public.group_program_items(created_by_key);
create table public.group_program_votes (
 item_id uuid not null references public.group_program_items(id) on delete cascade,
 member_key text not null references public.trip_attendance(roster_key),
 choice text not null check(choice in ('yes','maybe','no')),
 primary key(item_id,member_key)
);
create index group_program_votes_member_idx on public.group_program_votes(member_key);
create table public.group_program_links (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.group_program_items(id) on delete cascade,
 label text not null check(char_length(btrim(label)) between 2 and 100),
 url text not null check(url ~ '^https://[^[:space:]]+$' and char_length(url)<=2048),
 created_by_key text not null references public.trip_attendance(roster_key),
 created_at timestamptz not null default now(),
 unique(item_id,url)
);
create index group_program_links_author_idx on public.group_program_links(created_by_key);
alter table public.group_program_items enable row level security;
alter table public.group_program_votes enable row level security;
alter table public.group_program_links enable row level security;
revoke all on public.group_program_items,public.group_program_votes,public.group_program_links from anon,authenticated;
grant select,insert on public.group_program_items,public.group_program_links to authenticated;
grant select,insert on public.group_program_votes to authenticated;
grant update(choice) on public.group_program_votes to authenticated;
create policy "Members read program" on public.group_program_items for select to authenticated using(public.is_group_member());
create policy "Members propose program" on public.group_program_items for insert to authenticated with check(
 public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=created_by_key and p.user_id=(select auth.uid())));
create policy "Members read program votes" on public.group_program_votes for select to authenticated using(public.is_group_member());
create policy "Members insert own program vote" on public.group_program_votes for insert to authenticated with check(
 public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())));
create policy "Members update own program vote" on public.group_program_votes for update to authenticated using(
 public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())))
 with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())));
create policy "Members read program links" on public.group_program_links for select to authenticated using(public.is_group_member());
create policy "Members add program links" on public.group_program_links for insert to authenticated with check(
 public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=created_by_key and p.user_id=(select auth.uid())));