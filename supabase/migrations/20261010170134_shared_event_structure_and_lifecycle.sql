alter table public.group_events drop constraint group_events_status_check;
alter table public.group_events add constraint group_events_status_check check (status in ('planning','confirmed','saved'));
alter table public.group_events
 add column outbound_time time,
 add column outbound_details text not null default '' check (char_length(outbound_details)<=1000),
 add column outbound_url text not null default '' check (char_length(outbound_url)<=2048 and (outbound_url='' or outbound_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
 add column return_time time,
 add column return_details text not null default '' check (char_length(return_details)<=1000),
 add column return_url text not null default '' check (char_length(return_url)<=2048 and (return_url='' or return_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
 add column hotel_name text not null default '' check (char_length(hotel_name)<=160),
 add column hotel_url text not null default '' check (char_length(hotel_url)<=2048 and (hotel_url='' or hotel_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
 add column hotel_details text not null default '' check (char_length(hotel_details)<=1000),
 add column hotel_status text not null default 'open' check (hotel_status in ('open','proposed','booked')),
 add column album_url text not null default '' check (char_length(album_url)<=2048 and (album_url='' or album_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
 add column album_label text not null default '' check (char_length(album_label)<=120),
 add column cover_image_url text not null default '' check (char_length(cover_image_url)<=2048 and (cover_image_url='' or cover_image_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
 add column cover_source_url text not null default '' check (char_length(cover_source_url)<=2048 and (cover_source_url='' or cover_source_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
 add column cover_credit text not null default '' check (char_length(cover_credit)<=160),
 add constraint group_events_cover_requires_source check (cover_image_url='' or cover_source_url<>'');
-- Existing organizer UPDATE policy controls metadata and save/resume transitions.
-- This DELETE policy is restricted to the creator; the dedicated Kufstein trip stays protected.
grant delete on public.group_events to authenticated;
create policy "Organizers delete their shared events" on public.group_events for delete to authenticated
 using (id<>'kufstein-2026' and public.is_group_member() and exists (
  select 1 from public.trip_attendance p where p.roster_key=group_events.created_by_key and p.user_id=(select auth.uid())
 ));

