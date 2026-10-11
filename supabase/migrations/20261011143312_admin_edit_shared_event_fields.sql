-- Only the existing group administrator may use the additional field pencils.
-- Keep all existing creator/member table policies and privileges unchanged.
create function group_private.save_event_content_fields(p_kind text,p_id text,p_patch jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_table text;v_id_type text;v_allowed text[];v_old jsonb;v_new jsonb;v_key text;v_set text;v_value text;
begin
 if auth.uid() is null or not group_private.is_admin() then raise exception 'Nur die Gruppenverwaltung darf diese Felder bearbeiten'; end if;
 if p_kind='event' then
  v_table:='group_events';v_id_type:='text';
  v_allowed:=array['title','description','location','website_url','outbound_time','outbound_details','outbound_url','return_time','return_details','return_url','hotel_name','hotel_status','hotel_details','hotel_url','album_label','album_url'];
 elsif p_kind='program' then
  v_table:='group_program_items';v_id_type:='uuid';
  v_allowed:=array['title','description','cost_label','website_url','day_number','start_time','end_time','ends_next_day','time_label'];
 else raise exception 'Unbekannter Inhalt'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Ungültige Felder'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if not v_key=any(v_allowed) then raise exception 'Dieses Feld darf hier nicht bearbeitet werden'; end if;
  if not p_expected ? v_key then raise exception 'Ausgangswert fehlt'; end if;
  v_value:=p_patch->>v_key;
  if v_key like '%\_url' escape '\' and v_value<>'' and (char_length(v_value)>2048 or v_value !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$') then raise exception 'Bitte gültige https://-Links ohne Zugangsdaten eingeben'; end if;
 end loop;
 execute format('select to_jsonb(t) from public.%I t where id=$1::%s for update',v_table,v_id_type) into v_old using p_id;
 if v_old is null then raise exception 'Inhalt nicht gefunden'; end if;
 if (p_kind='event' and p_id='kufstein-2026') or (p_kind='program' and v_old->>'event_id'='kufstein-2026') then raise exception 'Bitte die eigene Kufstein-Seite verwenden'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if (v_old->v_key) is distinct from (p_expected->v_key) then raise exception 'Der Inhalt wurde inzwischen geändert. Kopiere deinen Entwurf und lade die Seite neu.'; end if;
 end loop;
 select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,v_table,k),',') into v_set from jsonb_object_keys(p_patch) k;
 execute format('update public.%I t set %s where id=$2::%s returning to_jsonb(t)',v_table,v_set,v_id_type) into v_new using p_patch,p_id;
 return v_new;
end $$;
create function public.save_event_content_fields(p_kind text,p_id text,p_patch jsonb,p_expected jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select group_private.save_event_content_fields(p_kind,p_id,p_patch,p_expected) $$;
revoke all on function group_private.save_event_content_fields(text,text,jsonb,jsonb),public.save_event_content_fields(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function group_private.save_event_content_fields(text,text,jsonb,jsonb),public.save_event_content_fields(text,text,jsonb,jsonb) to authenticated;
