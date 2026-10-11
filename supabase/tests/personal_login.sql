begin;

do $test$
declare owner_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); k text; secret text; replacement text; blocked boolean; result integer;
begin
 insert into auth.users(id,aud,role,is_anonymous) values(owner_id,'authenticated','authenticated',true),(new_id,'authenticated','authenticated',true),(other_id,'authenticated','authenticated',true);
 insert into auth.users(id,aud,role,is_anonymous,email,email_confirmed_at) values(admin_id,'authenticated','authenticated',false,admin_id::text||'@example.invalid',now());
 insert into public.group_members(user_id,display_name) values(owner_id,'AuditOwner-'||owner_id::text),(other_id,'AuditOther-'||other_id::text),(admin_id,'AuditAdmin-'||admin_id::text);
 select roster_key into k from public.trip_attendance where user_id=owner_id;
 insert into group_private.admins(member_key) select roster_key from public.trip_attendance where user_id=admin_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('role','authenticated',true);
 secret:=public.issue_member_login_code(null)->>'code';
 if length(secret)<>32 then raise exception 'Bad secret generation'; end if;
 if not (public.get_my_login_security()->>'has_personal_code')::boolean then raise exception 'Code state missing'; end if;
 blocked:=false;begin perform public.issue_member_login_code(other_id::text);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Cross-member issue allowed'; end if;
 perform set_config('request.jwt.claim.sub',new_id::text,true);
 blocked:=false;begin perform public.recover_kufstein_member('shared-group-code','AuditOwner-'||owner_id::text);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Shared code accepted'; end if;
 result:=public.recover_kufstein_member(secret,'AuditOwner-'||owner_id::text);
 if not exists(select 1 from public.trip_attendance where user_id=new_id and roster_key=k) then raise exception 'Roster changed'; end if;
 replacement:=public.issue_member_login_code(null)->>'code';
 if replacement=secret then raise exception 'Rotation reused secret'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 blocked:=false;begin perform public.recover_kufstein_member(secret,'AuditOwner-'||owner_id::text);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Old code still accepted'; end if;
 blocked:=false;begin perform public.recover_kufstein_member(replacement,'AuditAdmin-'||admin_id::text);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Admin recovery by code allowed'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not (public.get_group_member_directory()->>'can_manage')::boolean then raise exception 'Confirmed admin lost access'; end if;
 perform public.issue_member_login_code(k);
 blocked:=false;begin perform public.issue_member_login_code(null);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Admin code issuance allowed'; end if;
 perform set_config('role','anon',true);
 blocked:=false;begin perform public.get_my_login_security();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Unauthenticated access allowed'; end if;
 perform set_config('role','postgres',true);
end $test$;
select 'PASS: personal recovery, rotation, stable ownership, admin email boundary, role restrictions' as verification;

rollback;