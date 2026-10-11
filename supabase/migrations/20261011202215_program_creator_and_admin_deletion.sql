-- Deletion uses the same stable owner/admin check as editing. Existing foreign
-- keys remove votes and links atomically; there is no client-side cascade.
grant delete on public.group_program_items to authenticated;
create policy "Creators and admins delete program items"
 on public.group_program_items for delete to authenticated
 using (group_private.can_edit_program(created_by_key));

-- Kufstein's built-in cards are not group_program_items. Persist their removal
-- without changing booked/static travel information or editable text keys.
create table public.trip_activity_removals (
 site_id text not null check(site_id='kufstein-2026'),
 activity_id text not null check(activity_id in ('festung','stadtpark','auracher','braeu','stollen','pure','walk')),
 removed_by uuid references auth.users(id) on delete set null,
 removed_at timestamptz not null default now(),
 primary key(site_id,activity_id)
);
alter table public.trip_activity_removals enable row level security;
revoke all on public.trip_activity_removals from public,anon,authenticated;
grant select,insert on public.trip_activity_removals to authenticated;
create policy "Members see removed trip activities"
 on public.trip_activity_removals for select to authenticated
 using (public.is_group_member());
create policy "Admins remove built-in trip activities"
 on public.trip_activity_removals for insert to authenticated
 with check (group_private.can_edit_program(null::text) and removed_by=(select auth.uid()));

-- A stale client must not vote on a removed built-in activity.
create policy "Removed trip activities hide their votes"
 on public.votes as restrictive for select to authenticated
 using (not exists(select 1 from public.trip_activity_removals r where r.site_id='kufstein-2026' and r.activity_id=votes.activity_id));
create policy "Removed trip activities reject new votes"
 on public.votes as restrictive for insert to authenticated
 with check (not exists(select 1 from public.trip_activity_removals r where r.site_id='kufstein-2026' and r.activity_id=votes.activity_id));
create policy "Removed trip activities reject vote updates"
 on public.votes as restrictive for update to authenticated
 using (not exists(select 1 from public.trip_activity_removals r where r.site_id='kufstein-2026' and r.activity_id=votes.activity_id))
 with check (not exists(select 1 from public.trip_activity_removals r where r.site_id='kufstein-2026' and r.activity_id=votes.activity_id));
