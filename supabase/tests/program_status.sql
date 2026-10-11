begin;

do $test$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); event_id text:='audit-status-'||gen_random_uuid()::text; blocked boolean; changed integer;
begin
 insert into auth.users(id,aud,role,is_anonymous) values(owner_id,'authenticated','authenticated',true),(other_id,'authenticated','authenticated',true);
 insert into auth.users(id,aud,role,is_anonymous,email,email_confirmed_at) values(admin_id,'authenticated','authenticated',false,admin_id::text||'@example.invalid',now());
 insert into public.group_members(user_id,display_name) values(owner_id,'StatusOwner-'||owner_id::text),(other_id,'StatusOther-'||other_id::text),(admin_id,'StatusAdmin-'||admin_id::text);
 insert into group_private.admins(member_key) values(admin_id::text);
 insert into public.group_events(id,title,created_by_key) values(event_id,'Status test',owner_id::text);
 insert into public.group_program_items(id,event_id,title,category,created_by_key) values(item_id,event_id,'Test activity','activity',owner_id::text);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('role','authenticated',true);
 perform public.save_event_content_fields('program',item_id::text,'{"plan_status":"planned"}','{"plan_status":"idea"}');
 blocked:=false;begin perform public.save_event_content_fields('program',item_id::text,'{"plan_status":"booked"}','{"plan_status":"idea"}');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Stale status accepted'; end if;
 blocked:=false;begin update public.group_program_items set plan_status='invalid' where id=item_id;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Invalid status accepted'; end if;
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 update public.group_program_items set plan_status='booked' where id=item_id;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Other member edited status'; end if;
 blocked:=false;begin perform public.save_event_content_fields('program',item_id::text,'{"plan_status":"booked"}','{"plan_status":"planned"}');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Other member used status RPC'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.save_event_content_fields('program',item_id::text,'{"plan_status":"booked"}','{"plan_status":"planned"}');
 if not exists(select 1 from public.group_program_items where id=item_id and plan_status='booked') then raise exception 'Admin edit failed'; end if;
 perform set_config('role','postgres',true);
end $test$;
select 'PASS: status constraints, creator/admin permissions and stale-write protection' as verification;

rollback;