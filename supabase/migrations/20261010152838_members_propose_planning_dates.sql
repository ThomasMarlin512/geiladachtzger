alter policy "Organizers add date options" on public.group_event_dates
rename to "Members add planning date options";
alter policy "Members add planning date options" on public.group_event_dates
with check (
  public.is_group_member()
  and start_date >= (now() at time zone 'Europe/Vienna')::date
  and end_date >= start_date
  and exists (
    select 1 from public.group_events e
    where e.id = group_event_dates.event_id and e.status = 'planning'
  )
);