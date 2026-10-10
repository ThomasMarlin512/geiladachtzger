begin;
do $$
declare owner_id uuid; owner_key text; other_id uuid;
begin
 select p.user_id,p.roster_key into owner_id,owner_key
 from public.group_events e join public.trip_attendance p on p.roster_key=e.created_by_key
 join public.group_members m on m.user_id=p.user_id
 where e.id='salzburg-september-2027-ed899e55';
 select p.user_id into other_id from public.trip_attendance p join public.group_members m on m.user_id=p.user_id where p.user_id<>owner_id limit 1;
 if owner_id is null or other_id is null then raise exception 'Two existing member identities required'; end if;
 perform set_config('test.owner',owner_id::text,true);
 perform set_config('test.owner_key',owner_key,true);
 perform set_config('test.other',other_id::text,true);
 perform set_config('test.event','test-structure-'||substr(gen_random_uuid()::text,1,8),true);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare event_key text:=current_setting('test.event'); date_id uuid; item_id uuid; affected integer;
begin
 insert into public.group_events(id,title,created_by_key) values(event_key,'Temporary structure verification',current_setting('test.owner_key'));
 insert into public.group_event_dates(event_id,start_date,end_date) values(event_key,current_date+30,current_date+33) returning id into date_id;
 insert into public.group_program_items(event_id,title,created_by_key) values(event_key,'Temporary program item',current_setting('test.owner_key')) returning id into item_id;
 insert into public.group_program_links(item_id,label,url,created_by_key) values(item_id,'Info','https://example.test/info',current_setting('test.owner_key'));
 insert into public.group_program_votes(item_id,member_key,choice) values(item_id,current_setting('test.owner_key'),'yes');
 insert into public.group_date_votes(option_id,member_key,choice) values(date_id,current_setting('test.owner_key'),'yes');
 insert into public.group_event_attendance(event_id,member_key,status) values(event_key,current_setting('test.owner_key'),'maybe');
 perform set_config('test.item',item_id::text,true);perform set_config('test.date',date_id::text,true);
 update public.group_events set status='saved',outbound_time='08:00',outbound_details='Meeting point',return_time='16:00',return_url='https://example.test/route',hotel_name='Test hotel',hotel_status='proposed',hotel_url='https://example.test/hotel',album_url='https://example.test/album',cover_image_url='https://example.test/photo.jpg',cover_source_url='https://example.test/photos' where id=event_key;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Owner update failed';end if;
 if (select count(*) from public.group_date_votes where option_id=date_id)<>1 or (select count(*) from public.group_program_items where event_id=event_key)<>1 then raise exception 'Save for later lost data';end if;
 begin
  update public.group_date_votes set choice='no' where option_id=date_id and member_key=current_setting('test.owner_key');
  raise exception 'Saved event incorrectly permits date voting';
 exception when insufficient_privilege then null;end;
 update public.group_events set status='planning' where id=event_key;
 if (select outbound_time from public.group_events where id=event_key)<>'08:00'::time then raise exception 'Travel fields not retained';end if;
end $$;
reset role;
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('test.other'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.other'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare affected integer;begin
 update public.group_events set hotel_name='Not allowed' where id=current_setting('test.event');
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Non-owner can edit';end if;
 delete from public.group_events where id=current_setting('test.event');
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Non-owner can delete';end if;
end $$;
reset role;
do $$ declare outsider uuid:=gen_random_uuid();begin
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare affected integer;begin
 if exists(select 1 from public.group_events where id=current_setting('test.event')) then raise exception 'Nonmember can read';end if;
 delete from public.group_events where id=current_setting('test.event');
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Nonmember can delete';end if;
end $$;
reset role;
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare affected integer;begin
 update public.group_events set status='confirmed',start_date=current_date+30,end_date=current_date+33 where id=current_setting('test.event');
 update public.group_events set status='saved' where id=current_setting('test.event');
 update public.group_events set status='confirmed' where id=current_setting('test.event');
 if (select start_date from public.group_events where id=current_setting('test.event'))<>current_date+30 then raise exception 'Saved confirmed date lost';end if;
 delete from public.group_events where id=current_setting('test.event');
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Owner deletion failed';end if;
 if exists(select 1 from public.group_program_items where id=current_setting('test.item')::uuid)
 or exists(select 1 from public.group_program_links where item_id=current_setting('test.item')::uuid)
 or exists(select 1 from public.group_program_votes where item_id=current_setting('test.item')::uuid)
 or exists(select 1 from public.group_date_votes where option_id=current_setting('test.date')::uuid)
 or exists(select 1 from public.group_event_dates where id=current_setting('test.date')::uuid)
 or exists(select 1 from public.group_event_attendance where event_id=current_setting('test.event'))
 then raise exception 'Cascaded records remain';end if;
end $$;
reset role;
rollback;
select 'PASS: owner metadata, save/resume with retained votes and dates, paused date voting, non-owner and nonmember restrictions, confirmed event delete with complete cascade; all test changes rolled back' as result;
