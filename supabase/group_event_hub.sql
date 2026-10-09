begin;
create table public.group_people (
 id uuid primary key default gen_random_uuid(),
 member_key text unique references public.trip_attendance(roster_key),
 full_name text not null check(char_length(full_name) between 2 and 100)
);
insert into public.group_people(member_key,full_name)
select roster_key,case nickname
 when 'Büsel' then 'Thomas Marlin' when 'Manu' then 'Manuela Fleisch'
 when 'Christian' then 'Christian Vonbank' when 'Carmen' then 'Carmen Vonbank'
 when 'Thomas' then 'Thomas Schrottenbaum' when 'Sabine' then 'Sabine Wehinger'
 when 'Simon' then 'Simon Wehinger' when 'Dani' then 'Daniela Marlin'
 when 'Bäby' then 'Thomas Wüstner' when 'Jan Populorum' then 'Jan Populorum'
 when 'Bibi' then 'Bianca Populorum' when 'Mäki' then 'Markus Ebster'
 else nickname end from public.trip_attendance;
insert into public.group_people(full_name) values('Christina Weinbergmair-Ebster');
alter table public.group_people enable row level security;
grant select on public.group_people to authenticated;
revoke all on public.group_people from anon;
create policy "Members see group people" on public.group_people for select to authenticated using(public.is_group_member());

create table public.group_events (
 id text primary key check(id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
 title text not null check(char_length(title) between 2 and 100),
 kind text not null default 'trip' check(kind in('trip','event')),
 description text not null default '' check(char_length(description)<=2000),
 location text not null default '' check(char_length(location)<=120),
 status text not null default 'planning' check(status in('planning','confirmed')),
 start_date date,
 end_date date,
 website_url text not null default '' check(website_url='' or website_url ~ '^https://[^[:space:]]+$'),
 default_participation text not null default 'maybe' check(default_participation in('yes','maybe','no')),
 created_by_key text references public.trip_attendance(roster_key),
 created_at timestamptz not null default now(),
 check((start_date is null and end_date is null) or (start_date is not null and end_date is not null and end_date>=start_date)),
 check(status<>'confirmed' or start_date is not null)
);
create table public.group_event_dates (
 id uuid primary key default gen_random_uuid(),
 event_id text not null references public.group_events(id) on delete cascade,
 start_date date not null,
 end_date date not null,
 created_at timestamptz not null default now(),
 check(end_date>=start_date),
 unique(event_id,start_date,end_date)
);
create table public.group_date_votes (
 option_id uuid not null references public.group_event_dates(id) on delete cascade,
 member_key text not null references public.trip_attendance(roster_key),
 choice text not null check(choice in('yes','maybe','no')),
 primary key(option_id,member_key)
);
create table public.group_event_attendance (
 event_id text not null references public.group_events(id) on delete cascade,
 member_key text not null references public.trip_attendance(roster_key),
 status text not null check(status in('yes','maybe','no')),
 primary key(event_id,member_key)
);
insert into public.group_events(id,title,kind,description,location,status,start_date,end_date,website_url,default_participation,created_by_key)
select 'kufstein-2026','Kufstein 2026','trip','Advent, Essen und Party. Hotel Stadt Kufstein und Abendessen im Auracher Löchl.','Kufstein','confirmed','2026-11-28','2026-11-29','https://thomasmarlin512.github.io/kufstein-2026/','yes',roster_key from public.trip_attendance where nickname='Büsel';
insert into public.group_event_attendance(event_id,member_key,status) select 'kufstein-2026',roster_key,status from public.trip_attendance;
alter table public.group_events enable row level security;
alter table public.group_event_dates enable row level security;
alter table public.group_date_votes enable row level security;
alter table public.group_event_attendance enable row level security;
grant select,insert,update on public.group_events,public.group_event_dates,public.group_date_votes,public.group_event_attendance to authenticated;
revoke all on public.group_events,public.group_event_dates,public.group_date_votes,public.group_event_attendance from anon;
create policy "Group reads events" on public.group_events for select to authenticated using(public.is_group_member());
create policy "Members propose events" on public.group_events for insert to authenticated with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=created_by_key and p.user_id=(select auth.uid())));
create policy "Organizers update their events" on public.group_events for update to authenticated using(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=created_by_key and p.user_id=(select auth.uid()))) with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=created_by_key and p.user_id=(select auth.uid())));
create policy "Group reads date options" on public.group_event_dates for select to authenticated using(public.is_group_member());
create policy "Organizers add date options" on public.group_event_dates for insert to authenticated with check(exists(select 1 from public.group_events e join public.trip_attendance p on p.roster_key=e.created_by_key where e.id=event_id and p.user_id=(select auth.uid()) and public.is_group_member()));
revoke update on public.group_event_dates from authenticated;
create policy "Group reads date votes" on public.group_date_votes for select to authenticated using(public.is_group_member());
create policy "Members insert own date vote" on public.group_date_votes for insert to authenticated with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())) and exists(select 1 from public.group_event_dates d join public.group_events e on e.id=d.event_id where d.id=option_id and e.status='planning'));
create policy "Members update own date vote" on public.group_date_votes for update to authenticated using(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid()))) with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())) and exists(select 1 from public.group_event_dates d join public.group_events e on e.id=d.event_id where d.id=option_id and e.status='planning'));
create policy "Group reads event attendance" on public.group_event_attendance for select to authenticated using(public.is_group_member());
create policy "Members insert own event attendance" on public.group_event_attendance for insert to authenticated with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())));
create policy "Members update own event attendance" on public.group_event_attendance for update to authenticated using(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid()))) with check(public.is_group_member() and exists(select 1 from public.trip_attendance p where p.roster_key=member_key and p.user_id=(select auth.uid())));

create function public.sync_group_people() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $fn$
begin
 update public.group_people set member_key=new.roster_key where member_key is null and lower(split_part(full_name,' ',1))=lower(btrim(new.nickname));
 if not found then
  insert into public.group_people(member_key,full_name) values(new.roster_key,new.nickname) on conflict(member_key) do nothing;
 end if;
 return new;
end;
$fn$;
revoke all on function public.sync_group_people() from public,anon,authenticated;
create trigger sync_group_people_insert after insert on public.trip_attendance for each row execute function public.sync_group_people();

create function public.sync_kufstein_attendance_to_events() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $fn$
begin
 insert into public.group_event_attendance(event_id,member_key,status) values('kufstein-2026',new.roster_key,new.status)
 on conflict(event_id,member_key) do update set status=excluded.status where public.group_event_attendance.status is distinct from excluded.status;
 return new;
end;
$fn$;
revoke all on function public.sync_kufstein_attendance_to_events() from public,anon,authenticated;
create trigger sync_kufstein_attendance_to_events after insert or update of status on public.trip_attendance for each row execute function public.sync_kufstein_attendance_to_events();

create function public.sync_event_attendance_to_kufstein() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $fn$
begin
 if new.event_id='kufstein-2026' then
  update public.trip_attendance set status=new.status where roster_key=new.member_key and status is distinct from new.status;
 end if;
 return new;
end;
$fn$;
revoke all on function public.sync_event_attendance_to_kufstein() from public,anon,authenticated;
create trigger sync_event_attendance_to_kufstein after insert or update of status on public.group_event_attendance for each row execute function public.sync_event_attendance_to_kufstein();
create index group_events_creator_idx on public.group_events(created_by_key);
create index group_date_votes_member_idx on public.group_date_votes(member_key);
create index group_event_attendance_member_idx on public.group_event_attendance(member_key);
commit;