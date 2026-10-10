alter table public.group_program_items
 add column start_time time,
 add column end_time time,
 add column ends_next_day boolean not null default false,
 add column image_url text not null default '' check(image_url='' or (image_url ~ '^https://[^[:space:]]+$' and char_length(image_url)<=2048)),
 add column image_source_url text not null default '' check(image_source_url='' or (image_source_url ~ '^https://[^[:space:]]+$' and char_length(image_source_url)<=2048)),
 add column image_credit text not null default '' check(char_length(image_credit)<=160),
 add constraint program_time_range check(end_time is null or (start_time is not null and (ends_next_day or end_time>=start_time))),
 add constraint program_image_source check(image_url='' or image_source_url<>'');
grant update(day_number,time_label,start_time,end_time,ends_next_day,image_url,image_source_url,image_credit) on public.group_program_items to authenticated;
create policy "Members add program times and photos" on public.group_program_items for update to authenticated
 using(public.is_group_member()) with check(public.is_group_member());