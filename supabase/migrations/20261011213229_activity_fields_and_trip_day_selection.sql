-- Full activity forms use one permission-checked, optimistic save.
CREATE OR REPLACE FUNCTION group_private.save_event_content_fields(p_kind text, p_id text, p_patch jsonb, p_expected jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table text;v_id_type text;v_allowed text[];v_old jsonb;v_new jsonb;v_key text;v_set text;v_value text;
begin
 if auth.uid() is null or not public.is_group_member() then raise exception 'Gruppenanmeldung erforderlich'; end if;
 if p_kind='event' then
  if not group_private.is_admin() then raise exception 'Nur die Gruppenverwaltung darf Veranstaltungsfelder bearbeiten'; end if;
  v_table:='group_events';v_id_type:='text';
  v_allowed:=array['title','description','location','website_url','outbound_time','outbound_details','outbound_url','return_time','return_details','return_url','hotel_name','hotel_status','hotel_details','hotel_url','album_label','album_url'];
 elsif p_kind='program' then
  v_table:='group_program_items';v_id_type:='uuid';
  v_allowed:=array['plan_status','title','category','description','cost_label','website_url','day_number','start_time','end_time','ends_next_day','time_label','image_url','image_source_url','image_credit'];
 else raise exception 'Unbekannter Inhalt'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Ungültige Felder'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if not v_key=any(v_allowed) then raise exception 'Dieses Feld darf hier nicht bearbeitet werden'; end if;
  if not p_expected ? v_key then raise exception 'Ausgangswert fehlt'; end if;
  v_value:=p_patch->>v_key;
  if right(v_key,4)='_url' and v_value<>'' and (char_length(v_value)>2048 or v_value !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$') then raise exception 'Bitte gültige https://-Links ohne Zugangsdaten eingeben'; end if;
 end loop;
 execute format('select to_jsonb(t) from public.%I t where id=$1::%s for update',v_table,v_id_type) into v_old using p_id;
 if v_old is null then raise exception 'Inhalt nicht gefunden'; end if;
 if p_kind='program' and not group_private.can_edit_program(v_old->>'created_by_key') then raise exception 'Nur der Ersteller und die Gruppenverwaltung dürfen diesen Programmpunkt bearbeiten'; end if;
 if (p_kind='event' and p_id='kufstein-2026') or (p_kind='program' and v_old->>'event_id'='kufstein-2026') then raise exception 'Bitte die eigene Kufstein-Seite verwenden'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if (v_old->v_key) is distinct from (p_expected->v_key) then raise exception 'Der Inhalt wurde inzwischen geändert. Kopiere deinen Entwurf und lade die Seite neu.'; end if;
 end loop;
 select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,v_table,k),',') into v_set from jsonb_object_keys(p_patch) k;
 execute format('update public.%I t set %s where id=$2::%s returning to_jsonb(t)',v_table,v_set,v_id_type) into v_new using p_patch,p_id;
 return v_new;
end $function$;

create function group_private.validate_program_trip_day()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_days integer;v_start date;v_end date;
begin
 select start_date,end_date into v_start,v_end from public.group_events where id=new.event_id;
 if v_start is not null and v_end is not null then v_days:=v_end-v_start+1;
 else select max(end_date-start_date+1) into v_days from public.group_event_dates where event_id=new.event_id; end if;
 if new.day_number is not null and (new.day_number<1 or v_days is null or new.day_number>least(v_days,31)) then raise exception 'Bitte einen Tag aus dem Reisezeitraum auswählen'; end if;
 if new.end_time is not null and new.start_time is null then raise exception 'Bitte auch eine Beginnzeit eingeben'; end if;
 if new.ends_next_day and (new.start_time is null or new.end_time is null) then raise exception 'Für ein Ende am nächsten Tag bitte Von und Bis ausfüllen'; end if;
 if new.ends_next_day and new.day_number is not null and new.day_number>=v_days then raise exception 'Das Ende liegt außerhalb des Reisezeitraums'; end if;
 return new;
end $$;
revoke all on function group_private.validate_program_trip_day() from public,anon,authenticated;
create trigger validate_program_trip_day before insert or update of event_id,day_number,start_time,end_time,ends_next_day on public.group_program_items
for each row execute function group_private.validate_program_trip_day();

-- Dedicated Kufstein content: preserve its legacy activity IDs and votes.
create table public.trip_activity_details (
 site_id text not null default 'kufstein-2026' references public.group_events(id),
 activity_id text not null,
 title text not null check(char_length(title) between 2 and 100),
 description text not null default '' check(char_length(description)<=1500),
 website_url text not null default '' check(website_url='' or (char_length(website_url)<=2048 and website_url ~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$')),
 day_number smallint check(day_number between 1 and 31),
 start_time time,end_time time,ends_next_day boolean not null default false,
 time_label text not null default '' check(char_length(time_label)<=1000),
 revision integer not null default 0,updated_at timestamptz not null default now(),
 primary key(site_id,activity_id),check(site_id='kufstein-2026'),
 check(end_time is null or start_time is not null),
 check(start_time is null or end_time is null or end_time>=start_time or ends_next_day),
 check(not ends_next_day or (start_time is not null and end_time is not null))
);
alter table public.trip_activity_details enable row level security;
revoke all on public.trip_activity_details from public,anon,authenticated;
grant select on public.trip_activity_details to anon,authenticated;
create policy "Published activity content is readable" on public.trip_activity_details for select to anon,authenticated using(true);

insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','festung','Weihnachtszauber Festung','Adventmarkt, historisches Handwerk und Glühwein. Geöffnet 11–19 Uhr; letzter Einlass 18 Uhr.','https://www.festung.kufstein.at/de/weihnachtszauber-auf-der-festung-kufstein-2-1-1-1.html','1','13:00','14:20','');
insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','stadtpark','Weihnachtsmarkt Stadtpark','Glühwein, Essen und Live-Musik. Samstag 13–20 Uhr geöffnet.','https://www.kufstein.com/de/kultur/events-tirol/advent-im-kufsteinerland.html','1','14:40','16:40','2 Stunden');
insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','auracher','Abendessen Auracher Löchl','Unser gemeinsames Abendessen. Details zur bestätigten Reservierung stehen im Abschnitt Reservierung.','https://www.auracher-loechl.at/','1','18:00','20:15','Reserviert');
insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','braeu','Abendessen Bräustüberl','Zusätzliche Restaurantidee; für diesen Ausflug nicht eingeplant.','https://www.google.com/maps/search/?api=1&query=Br%C3%A4ust%C3%BCberl+Kufstein',null,null,null,'Option · nicht im Tagesplan');
insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','stollen','Stollen 1930 – Gin-Bar','Speakeasy-Bar im Festungsberg, täglich 18–02 Uhr, Eintritt ab 21 Jahren. Gruppenbereich anfragen.','https://www.auracher-loechl.at/stollen1930','1','21:00',null,'');
insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','pure','PURE Lounge','Cocktails und Party; Samstagsöffnung laut Eintrag bis 02 Uhr. Programm am 28.11. noch nicht bestätigt.','https://www.purelounge-club.at/','1','21:00',null,'Alternative');
insert into public.trip_activity_details(site_id,activity_id,title,description,website_url,day_number,start_time,end_time,time_label) values ('kufstein-2026','walk','Sonntag Altstadt & Kaffee','Gemütlicher Ausklang vor der Heimfahrt.','https://www.kufstein.com/','2','11:00','12:30','');
-- Preserve any published description or manually changed legacy time text.
update public.trip_activity_details a set description=t.content from public.trip_text_content t
where t.site_id=a.site_id and t.content_key='activity-'||a.activity_id||'-description' and t.content is not null;
update public.trip_activity_details a set time_label=t.content,day_number=null,start_time=null,end_time=null from public.trip_text_content t
where t.site_id=a.site_id and t.content_key='activity-'||a.activity_id||'-time' and t.content is not null;

create function group_private.save_kufstein_activity(p_activity_id text,p_patch jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old public.trip_activity_details%rowtype;v_new public.trip_activity_details%rowtype;v_key text;v_start date;v_end date;v_time text;
begin
 if auth.uid() is null or not public.is_group_member() or not group_private.is_admin() then raise exception 'Nur die Gruppenverwaltung darf diese Aktivität bearbeiten'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Ungültige Aktivitätsfelder'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if not v_key=any(array['title','description','website_url','day_number','start_time','end_time','ends_next_day','time_label']) then raise exception 'Dieses Feld darf nicht bearbeitet werden'; end if;
 end loop;
 select * into v_old from public.trip_activity_details where site_id='kufstein-2026' and activity_id=p_activity_id for update;
 if not found then raise exception 'Aktivität nicht gefunden'; end if;
 if v_old.revision is distinct from p_revision then raise exception 'Diese Aktivität wurde inzwischen geändert. Kopiere deinen Entwurf und lade die Seite neu.'; end if;
 if exists(select 1 from public.trip_activity_removals where site_id='kufstein-2026' and activity_id=p_activity_id) then raise exception 'Diese Aktivität wurde bereits entfernt'; end if;
 v_new:=jsonb_populate_record(v_old,p_patch);
 select start_date,end_date into v_start,v_end from public.group_events where id='kufstein-2026' for share;
 if v_new.day_number is not null and (v_start is null or v_end is null or v_new.day_number<1 or v_new.day_number>v_end-v_start+1) then raise exception 'Bitte einen Tag aus dem Reisezeitraum auswählen'; end if;
 if v_new.ends_next_day and v_new.day_number is not null and v_new.day_number>=v_end-v_start+1 then raise exception 'Das Ende liegt außerhalb des Reisezeitraums'; end if;
 update public.trip_activity_details set title=trim(v_new.title),description=v_new.description,website_url=v_new.website_url,day_number=v_new.day_number,
 start_time=v_new.start_time,end_time=v_new.end_time,ends_next_day=v_new.ends_next_day,time_label=v_new.time_label,revision=revision+1,updated_at=now()
 where site_id='kufstein-2026' and activity_id=p_activity_id returning * into v_new;
 -- Old open tabs still see the same updated description and schedule.
 v_time:=concat_ws(' · ',case when v_new.day_number is not null then to_char(v_start+v_new.day_number-1,'DD.MM.YYYY') end,
 case when v_new.start_time is not null then to_char(v_new.start_time,'HH24:MI')||case when v_new.end_time is not null then '–'||to_char(v_new.end_time,'HH24:MI') else '' end||case when v_new.ends_next_day then ' (+1 Tag)' else '' end end,nullif(v_new.time_label,''));
 update public.trip_text_content set content=v_new.description,revision=revision+1,updated_at=now() where site_id='kufstein-2026' and content_key='activity-'||p_activity_id||'-description';
 update public.trip_text_content set content=v_time,revision=revision+1,updated_at=now() where site_id='kufstein-2026' and content_key='activity-'||p_activity_id||'-time';
 return to_jsonb(v_new);
end $$;
create function public.save_kufstein_activity(p_activity_id text,p_patch jsonb,p_revision integer)
returns jsonb language sql security invoker set search_path='' as $$ select group_private.save_kufstein_activity(p_activity_id,p_patch,p_revision) $$;
revoke all on function group_private.save_kufstein_activity(text,jsonb,integer),public.save_kufstein_activity(text,jsonb,integer) from public,anon,authenticated;
grant execute on function group_private.save_kufstein_activity(text,jsonb,integer),public.save_kufstein_activity(text,jsonb,integer) to authenticated;

create or replace function group_private.save_trip_text(p_site_id text,p_content_key text,p_content text,p_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row public.trip_text_content%rowtype;
begin
 if auth.uid() is null or not group_private.is_admin() then raise exception 'Nur die Gruppenverwaltung darf Texte bearbeiten'; end if;
 if exists(select 1 from public.trip_activity_details a where a.site_id=p_site_id and p_content_key in ('activity-'||a.activity_id||'-time','activity-'||a.activity_id||'-description')) then raise exception 'Bitte die Seite neu laden und Aktivität bearbeiten verwenden'; end if;
 if p_content is not null and char_length(p_content)>12000 then raise exception 'Text ist zu lang (maximal 12000 Zeichen)'; end if;
 select * into v_row from public.trip_text_content where site_id=p_site_id and content_key=p_content_key for update;
 if not found then raise exception 'Textfeld nicht gefunden'; end if;
 if v_row.revision is distinct from p_revision then raise exception 'Dieser Text wurde inzwischen geändert. Kopiere deinen Entwurf und lade die Seite neu.'; end if;
 update public.trip_text_content set content=p_content,revision=revision+1,updated_at=now()
 where site_id=p_site_id and content_key=p_content_key returning * into v_row;
 return jsonb_build_object('content_key',v_row.content_key,'content',v_row.content,'revision',v_row.revision);
end $$;
