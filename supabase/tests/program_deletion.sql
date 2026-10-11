begin;
do $test$
declare
 owner_id uuid:=gen_random_uuid(); recovered_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); stranger_id uuid:=gen_random_uuid();
 owner_key text:=owner_id::text; event_key text:='delete-test-'||gen_random_uuid();
 owner_item uuid:=gen_random_uuid(); admin_item uuid:=gen_random_uuid(); other_item uuid:=gen_random_uuid();
 changed integer; blocked boolean; chosen_activity text;
begin
 -- All identities and content are synthetic and this transaction always rolls back.
 insert into auth.users(id,aud,role,is_anonymous) values(owner_id,'authenticated','authenticated',true),(recovered_id,'authenticated','authenticated',true),(other_id,'authenticated','authenticated',true),(stranger_id,'authenticated','authenticated',true);
 insert into auth.users(id,aud,role,is_anonymous,email,email_confirmed_at) values(admin_id,'authenticated','authenticated',false,admin_id::text||'@example.invalid',now());
 insert into public.group_members(user_id,display_name) values(owner_id,'DeleteOwner-'||owner_id),(other_id,'DeleteOther-'||other_id),(admin_id,'DeleteAdmin-'||admin_id);
 -- A recovered identity must still own rows created under its stable roster key.
 update public.trip_attendance set user_id=recovered_id where user_id=owner_id;
 insert into public.group_members(user_id,display_name) values(recovered_id,'Recovered-'||recovered_id);
 insert into group_private.admins(member_key) values(admin_id::text);
 insert into public.group_events(id,title,created_by_key) values(event_key,'Deletion test',owner_key);
 insert into public.group_program_items(id,event_id,title,created_by_key) values(owner_item,event_key,'Owner activity',owner_key),(admin_item,event_key,'Admin removes this',owner_key),(other_item,event_key,'Other member activity',other_id::text);
 insert into public.group_program_votes(item_id,member_key,choice) values(owner_item,other_id::text,'yes');
 insert into public.group_program_links(item_id,label,url,created_by_key) values(owner_item,'Test','https://example.invalid/',other_id::text);
 perform set_config('request.jwt.claim.sub',other_id::text,true);perform set_config('role','authenticated',true);
 delete from public.group_program_items where id=owner_item;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Other member deleted owner activity';end if;
 perform set_config('request.jwt.claim.sub',stranger_id::text,true);
 delete from public.group_program_items where id=owner_item;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Non-member deleted activity';end if;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('role','anon',true);
 blocked:=false;begin delete from public.group_program_items where id=owner_item;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anon unexpectedly has DELETE privilege';end if;
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',recovered_id::text,true);
 delete from public.group_program_items where id=other_item;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Creator deleted someone else activity';end if;
 delete from public.group_program_items where id=owner_item;get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Creator could not delete using recovered roster identity';end if;
 if exists(select 1 from public.group_program_votes where item_id=owner_item) or exists(select 1 from public.group_program_links where item_id=owner_item) then raise exception 'Child votes or links survived deletion';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 delete from public.group_program_items where id=admin_item;get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Administrator could not delete another member activity';end if;
 if not exists(select 1 from public.group_program_items where id=other_item) then raise exception 'Unrelated activity removed';end if;

 -- Only an admin may remove a legacy card. Do not touch any real members' votes.
 select x into chosen_activity from unnest(array['festung','stadtpark','auracher','braeu','stollen','pure','walk']) x where not exists(select 1 from public.trip_activity_removals where activity_id=x) limit 1;
 if chosen_activity is not null then
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  insert into public.votes(user_id,activity_id,choice) values(other_id,chosen_activity,'yes');
  blocked:=false;begin insert into public.trip_activity_removals(site_id,activity_id,removed_by) values('kufstein-2026',chosen_activity,other_id);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Member removed built-in activity';end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  insert into public.trip_activity_removals(site_id,activity_id,removed_by) values('kufstein-2026',chosen_activity,admin_id);
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  if exists(select 1 from public.votes where user_id=other_id and activity_id=chosen_activity) then raise exception 'Removed activity votes still visible';end if;
  update public.votes set choice='no' where user_id=other_id and activity_id=chosen_activity;get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Removed activity accepted vote update';end if;
  perform set_config('request.jwt.claim.sub',recovered_id::text,true);
  blocked:=false;begin insert into public.votes(user_id,activity_id,choice) values(recovered_id,chosen_activity,'yes');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Removed activity accepted new vote';end if;
 end if;
 perform set_config('role','postgres',true);
end $test$;
select 'PASS: creator/admin deletion; other member, anon and non-member denied; recovered identity works; child rows cascade; unrelated activity preserved; legacy removals admin-only and voting disabled' as verification;
rollback;
