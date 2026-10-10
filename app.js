import {installHubTools} from './webmcp-tools.js';
import {fail} from './webmcp-core.js';
import {votingCalendar,wireVotingCalendars,selectCalendarDate} from './voting-calendar.js?v=20261010-2';
import {programCards,programTimeline,httpsUrl,activityPhotos} from './trip-program.js?v=20261010-1';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const URL = 'https://rzzipqdozabuxrmoxhlw.supabase.co';
const KEY = 'sb_publishable_4MsQNsSWj2VXmONSNim-zg__T2QeLV0';
let sb, user, member, memberKey, busy = false, refreshBusy = false, timer;
let events = [], options = [], votes = [], attendance = [], people = [], directory = [];
let programItems=[],programVotes=[],programLinks=[],linkItemId=null;
let createdDraftId = null, writeBusy = false;
const currentEventId = new URLSearchParams(location.search).get('id');
const labels = {yes:'✓ Dabei', maybe:'? Unsicher', no:'✕ Nicht dabei'};
const dateLabels = {yes:'✓ Passt', maybe:'? Vielleicht', no:'✕ Geht nicht'};
const stateLabels = {planning:'In Planung',confirmed:'Termin steht'};
function todayVienna() {
 const parts = new Intl.DateTimeFormat('en',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get = type => parts.find(p=>p.type===type).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
function displayDate(value) { return new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Vienna'}).format(new Date(value+'T12:00:00Z')); }
function dateRange(start,end) { return start ? displayDate(start)+(end!==start?' – '+displayDate(end):'') : 'Termin noch offen'; }
function safeUrl(value) { try { const u=new globalThis.URL(value);return u.protocol==='https:'?u.href:''; } catch { return ''; } }
function detailUrl(event) { return 'event.html?id='+encodeURIComponent(event.id); }
function eventWebsiteUrl(event) { return event.id==='kufstein-2026' ? '/kufstein-2026/' : detailUrl(event); }
function past(event) { return event.status==='confirmed' && event.end_date < todayVienna(); }
function nameFor(key) { return people.find(p=>p.member_key===key)?.full_name || directory.find(p=>p.roster_key===key)?.nickname || 'Gruppenmitglied'; }
function status(message,id='page-status') { if($(id)) $(id).textContent=message; }
async function init() {
 if(document.body.dataset.page==='event' && currentEventId==='kufstein-2026'){location.replace('/kufstein-2026/');return;}
 if(document.body.dataset.page==='home' && !document.querySelector('.hero-logo')){const fresh=new globalThis.URL(location.href);if(fresh.searchParams.get('v')!=='20261009-2315'){fresh.searchParams.set('v','20261009-2315');location.replace(fresh.href);return;}}
 try {
  if(!window.supabase?.createClient) throw Error('Die Verbindung konnte nicht geladen werden. Bitte Seite neu laden.');
  sb=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  try { $('login-name').value=JSON.parse(localStorage.getItem('kufstein_votes_v3')||'{}').name||''; } catch {}
  $('login-form').addEventListener('submit',e=>{e.preventDefault();authenticate(false);});
  $('join-form').addEventListener('submit',e=>{e.preventDefault();authenticate(true);});
  wireForms();
  const {data,error}=await sb.auth.getSession();if(error)throw error;
  if(data.session) { user=data.session.user;await enter(); }
 } catch(e) { status(e.message,'auth-status'); }
}
async function authenticate(join) {
 if(busy)return;
 busy=true;
 const form=$(join?'join-form':'login-form');
 const submit=form.querySelector('button');submit.disabled=true;
 status('Anmeldung wird geprüft …','auth-status');
 try {
  const name=$(join?'join-name':'login-name').value.trim(), code=$(join?'join-code':'login-code').value;
  const {data:{session},error}=await sb.auth.getSession();if(error)throw error;
  user=session?.user;
  if(!user){const result=await sb.auth.signInAnonymously();if(result.error)throw result.error;user=result.data.user;}
  const result=await sb.rpc(join?'join_kufstein_group':'recover_kufstein_member',{p_name:name,p_code:code});
  if(result.error)throw result.error;
  await enter();
  status('','auth-status');
 } catch(e) { status(e.message||'Anmeldung fehlgeschlagen.','auth-status'); }
 finally {busy=false;submit.disabled=false;}
}
async function enter() {
 const m=await sb.from('group_members').select('display_name').eq('user_id',user.id).maybeSingle();
 if(m.error)throw m.error;
 if(!m.data)throw Error('Bitte mit Nickname und Gruppencode anmelden.');
 const key=await sb.from('trip_attendance').select('roster_key').eq('user_id',user.id).single();
 if(key.error)throw key.error;
 member=m.data;memberKey=key.data.roster_key;
 $('auth').hidden=true;$('app').hidden=false;$('member-name').textContent=member.display_name;
 await refresh();
 if(!timer)timer=setInterval(()=>{if(!document.hidden&&!writeBusy&&!document.activeElement?.closest('form')&&document.activeElement?.tagName!=='SELECT')refresh();},15000);
}
async function refresh() {
 if(refreshBusy||!memberKey)return;
 refreshBusy=true;
 try {
  const results=await Promise.all([
   sb.from('group_events').select('*').order('created_at'),
   sb.from('group_event_dates').select('*').order('start_date'),
   sb.from('group_date_votes').select('*'),
   sb.from('group_event_attendance').select('*'),
   sb.from('group_people').select('id,member_key,full_name').order('full_name'),
   sb.from('trip_attendance').select('user_id,roster_key,nickname'),
   currentEventId?sb.from('group_program_items').select('*').eq('event_id',currentEventId).order('day_number',{nullsFirst:false}).order('created_at'):Promise.resolve({data:[]}),
   currentEventId?sb.from('group_program_votes').select('*'):Promise.resolve({data:[]}),
   currentEventId?sb.from('group_program_links').select('*').order('created_at'):Promise.resolve({data:[]})
  ]);
  const bad=results.find(r=>r.error);if(bad)throw bad.error;
  [events,options,votes,attendance,people,directory,programItems,programVotes,programLinks]=results.map(r=>r.data||[]);
  status('');
  if(document.body.dataset.page==='home')renderHome();else renderEvent();
 } catch(e) {status('Aktualisierung fehlgeschlagen: '+(e.message||String(e)));}
 finally {refreshBusy=false;}
}
function eventCard(event,isPast=false) {
 return '<article class="event-card"><div class="category" aria-hidden="true">'+(event.kind==='trip'?'⛰':'✦')+'</div><span class="tag '+(isPast?'past':event.status)+'">'+(isPast?'Rückblick':stateLabels[event.status])+'</span><h3>'+esc(event.title)+'</h3><div class="date-line">'+esc(dateRange(event.start_date,event.end_date))+'</div><p>'+esc(event.location||'Ort noch offen')+'</p><a class="button secondary" href="'+esc(eventWebsiteUrl(event))+'">'+(isPast?'Rückblick ansehen':'Veranstaltung ansehen')+' →</a></article>';
}
function renderHome() {
 const coming=events.filter(e=>!past(e)).sort((a,b)=>(a.start_date||'9999').localeCompare(b.start_date||'9999'));
 const previous=events.filter(past).sort((a,b)=>b.start_date.localeCompare(a.start_date));
 const next=coming.find(e=>e.status==='confirmed');
 $('event-list').innerHTML=coming.map(e=>eventCard(e)).join('')||'<div class="empty">Noch keine Veranstaltungen geplant.</div>';
 $('past-list').innerHTML=previous.map(e=>eventCard(e,true)).join('')||'<div class="empty">Nach unseren Veranstaltungen findet ihr hier die Rückblicke.</div>';
 $('next-event').innerHTML=next?'<div class="next-event"><div><p class="eyebrow">ALS NÄCHSTES</p><h2>'+esc(next.title)+'</h2><p>'+esc(dateRange(next.start_date,next.end_date))+' · '+esc(next.location)+'</p></div><a class="button" href="'+esc(eventWebsiteUrl(next))+'">Zum Ausflug →</a></div>':'';
 const planning=coming.filter(e=>e.status==='planning');
 $('planning-list').innerHTML=planning.map(event=>'<article class="planning-event"><h3><a href="'+detailUrl(event)+'">'+esc(event.title)+' →</a></h3>'+votingCalendar(event,options,votes,memberKey,people,id=>dateCards(event,false,id))+'<a class="button secondary date-suggestion-link" href="'+detailUrl(event)+'#date-suggestion">＋ Eigenen Termin vorschlagen</a></article>').join('')||'<div class="empty">Noch keine offenen Terminabstimmungen. Schlagt eure nächste Reise oder ein Treffen vor.</div>';
 wireVotes($('planning-list'));
}
function dateCards(event,organizer,selectedId=null) {
 const dates=options.filter(o=>o.event_id===event.id&&(!selectedId||o.id===selectedId));
 if(!dates.length)return '<div class="empty">Noch keine Terminvorschläge.</div>';
 return dates.map(option=>{
  const rows=votes.filter(v=>v.option_id===option.id);
  const own=rows.find(v=>v.member_key===memberKey)?.choice;
  const count=choice=>rows.filter(v=>v.choice===choice).length;
  const closed=event.status!=='planning'||option.end_date<todayVienna();
  return '<div class="date-card"><div class="date-info"><strong>'+esc(dateRange(option.start_date,option.end_date))+'</strong><small>'+count('yes')+' passt · '+count('maybe')+' vielleicht · '+count('no')+' geht nicht</small></div><div class="date-actions">'+Object.entries(dateLabels).map(([choice,label])=>'<button type="button" data-option="'+esc(option.id)+'" data-choice="'+choice+'" class="'+(own===choice?'selected '+choice:'')+'" '+(closed?'disabled':'')+' aria-pressed="'+(own===choice)+'">'+label+'</button>').join('')+(organizer&&event.status==='planning'?'<button type="button" class="finalize" data-finalize="'+esc(option.id)+'">Termin festlegen</button>':'')+'</div><details class="vote-people"><summary>Wer hat abgestimmt?</summary>'+Object.entries(dateLabels).map(([choice,label])=>'<p><b>'+label+':</b> '+(rows.filter(v=>v.choice===choice).map(v=>esc(nameFor(v.member_key))).join(', ')||'Noch niemand')+'</p>').join('')+'</details></div>';
 }).join('');
}
function wireVotes(container) {
 wireVotingCalendars(container,()=>{if(document.body.dataset.page==='home')renderHome();else renderEvent();},()=>writeBusy);
 container.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>voteDate(button.dataset.option,button.dataset.choice,button)));
 container.querySelectorAll('[data-finalize]').forEach(button=>button.addEventListener('click',()=>finalize(button.dataset.finalize,button)));
}
async function voteDate(optionId,choice,button) {
 if(writeBusy)return;writeBusy=true;button.disabled=true;
 try {
  const r=await sb.from('group_date_votes').upsert({option_id:optionId,member_key:memberKey,choice},{onConflict:'option_id,member_key'}).select().single();
  if(r.error)throw r.error;await refresh();
 } catch(e){status('Stimme nicht gespeichert: '+e.message);}
 finally{writeBusy=false;if(button.isConnected)button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
function renderEvent() {
 const event=events.find(e=>e.id===currentEventId);
 if(!event){$('event-detail').innerHTML='<div class="empty">Diese Veranstaltung wurde nicht gefunden.</div>';$('event-dates-section').hidden=true;$('organizer-section').hidden=true;return;}
 document.title=event.title+' · Geiladachtzger';
 const organizer=event.created_by_key===memberKey;
 const url=safeUrl(event.website_url);
 const heroPhoto=programItems.map(item=>activityPhotos[httpsUrl(item.website_url)]).find(Boolean);
 $('event-detail').innerHTML='<header class="trip-hero">'+(heroPhoto?'<img class="trip-hero-photo" src="'+esc(heroPhoto.image)+'" alt="" aria-hidden="true">':'')+'<div class="trip-hero-content"><img class="trip-wordmark" src="assets/geiladachtzger-logo.webp" alt="Geiladachtzger"><p class="eyebrow">GUTE FREUNDE · SCHÖNE ERLEBNISSE</p><span class="tag '+event.status+'">'+(past(event)?'Rückblick':stateLabels[event.status])+'</span><h1 class="event-title">'+esc(event.title)+'</h1><p>'+esc(dateRange(event.start_date,event.end_date))+' · '+esc(event.location||'Ort noch offen')+'</p></div></header><div class="trip-feature-strip"><span>✦ Gemeinsam unterwegs</span><span>▦ '+programItems.length+' Programmideen</span><span>♧ '+people.length+' Gruppenmitglieder</span></div>';
 $('trip-information').innerHTML='<h3>'+esc(event.location||'Ort noch offen')+'</h3>'+(event.description?'<p class="event-description">'+esc(event.description)+'</p>':'<p>Weitere Informationen zu Unterkunft und Anreise können als Programmpunkte vorgeschlagen werden.</p>')+(url?'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Weitere Reiseinfos ↗</a></p>':'');
 $('event-dates-section').hidden=event.status!=='planning';
 $('date-nav').hidden=event.status!=='planning';
 if(event.status==='planning'){
  $('event-dates').innerHTML=votingCalendar(event,options,votes,memberKey,people,id=>dateCards(event,organizer,id));wireVotes($('event-dates'));
 }else $('event-dates').replaceChildren();
 renderProgram(event);
 renderPeople(event);
 $('organizer-section').hidden=!organizer;
 $('extra-start').min=todayVienna();
 $('extra-end').min=$('extra-start').value||todayVienna();
 if(location.hash==='#date-suggestion')$('date-suggestion').open=true;
 if(organizer&&!document.activeElement?.closest('#organizer-section')){
  $('edit-title').value=event.title;$('edit-location').value=event.location;
  $('edit-description').value=event.description;$('edit-url').value=event.website_url;

 }
}
function renderPeople(event) {
 const rows=attendance.filter(a=>a.event_id===event.id);
 const totals={yes:0,maybe:0,no:0};
 $('event-people').innerHTML=people.map(person=>{
  const choice=rows.find(a=>a.member_key===person.member_key)?.status||event.default_participation;
  totals[choice]++;
  const nickname=directory.find(p=>p.roster_key===person.member_key)?.nickname;
  const own=person.member_key===memberKey;
  return '<li class="'+choice+'"><div><strong>'+esc(person.full_name)+'</strong>'+(nickname&&nickname!==person.full_name?'<small>'+esc(nickname)+(own?' · Du':'')+'</small>':own?'<small>Du</small>':'')+'</div>'+(own?'<select id="own-attendance" aria-label="Meine Teilnahme" '+(writeBusy?'disabled':'')+'>'+Object.entries(labels).map(([value,label])=>'<option value="'+value+'" '+(choice===value?'selected':'')+'>'+label+'</option>').join('')+'</select>':'<span class="status-label">'+labels[choice]+'</span>')+'</li>';
 }).join('');
 $('attendance-count').textContent=totals.yes+' dabei · '+totals.maybe+' unsicher · '+totals.no+' nicht dabei';
 $('own-attendance')?.addEventListener('change',e=>setAttendance(event.id,e.target.value));
}
async function setAttendance(eventId,choice) {
 if(writeBusy)return;writeBusy=true;
 $('own-attendance').disabled=true;status('Wird gespeichert …','attendance-status');
 try {
  const r=await sb.from('group_event_attendance').upsert({event_id:eventId,member_key:memberKey,status:choice},{onConflict:'event_id,member_key'}).select().single();
  if(r.error)throw r.error;await refresh();status('','attendance-status');
 }catch(e){renderPeople(events.find(x=>x.id===eventId));status('Teilnahme nicht gespeichert: '+e.message,'attendance-status');}
 finally{writeBusy=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
function addDateRow(start='',end='') {
 const div=document.createElement('div');div.className='date-option';
 div.innerHTML='<div><label>Von<input class="option-start" type="date" required></label></div><div><label>Bis<input class="option-end" type="date" required></label></div><button class="quiet" type="button" aria-label="Terminvorschlag entfernen">✕</button>';
 div.querySelector('.option-start').value=start;div.querySelector('.option-end').value=end;
 div.querySelector('.option-start').addEventListener('change',e=>{const input=div.querySelector('.option-end');input.min=e.target.value;if(!input.value||input.value<e.target.value)input.value=e.target.value;});
 div.querySelector('button').addEventListener('click',()=>{if($('new-date-options').children.length>1)div.remove();});
 $('new-date-options').append(div);
}
function readDates() {
 const dates=[...$('new-date-options').children].map(row=>({start_date:row.querySelector('.option-start').value,end_date:row.querySelector('.option-end').value}));
 if(dates.some(d=>!d.start_date||!d.end_date||d.end_date<d.start_date))throw Error('Bitte gültige Termine auswählen.');
 return dates.filter((d,i)=>dates.findIndex(x=>x.start_date===d.start_date&&x.end_date===d.end_date)===i);
}
function wireForms() {
 $('new-event-button')?.addEventListener('click',()=>{
  if(!createdDraftId){$('new-event-form').reset();$('new-date-options').innerHTML='';addDateRow();status('','create-status');}
  $('event-dialog').showModal();
 });
 $('close-dialog')?.addEventListener('click',()=>$('event-dialog').close());
 $('add-date-option')?.addEventListener('click',()=>{if($('new-date-options').children.length<8)addDateRow();});
 $('new-event-form')?.addEventListener('submit',createEvent);
 $('edit-event-form')?.addEventListener('submit',editEvent);
 $('add-option-form')?.addEventListener('submit',addOption);
 $('propose-program')?.addEventListener('click',()=>{if(writeBusy)return;$('program-form').reset();status('','program-form-status');$('program-dialog').showModal();$('program-title').focus();});
 $('close-program')?.addEventListener('click',()=>$('program-dialog').close());
 $('close-program-link')?.addEventListener('click',()=>$('program-link-dialog').close());
 $('program-form')?.addEventListener('submit',addProgram);
 $('program-link-form')?.addEventListener('submit',addProgramLink);
 $('extra-start')?.addEventListener('change',()=>{const start=$('extra-start').value;$('extra-end').min=start||todayVienna();if(start&&(!$('extra-end').value||$('extra-end').value<start))$('extra-end').value=start;});
}
async function createEvent(e) {
 e.preventDefault();if(writeBusy)return;writeBusy=true;$('create-event').disabled=true;status('Wird gespeichert …','create-status');
 try {
  const dates=readDates();
  if(!createdDraftId){
   const title=$('event-title').value.trim();
   const slug=(title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,58)||'veranstaltung')+'-'+crypto.randomUUID().slice(0,8);
   const r=await sb.from('group_events').insert({id:slug,title,kind:$('event-kind').value,location:$('event-location').value.trim(),description:$('event-description').value.trim(),created_by_key:memberKey}).select().single();
   if(r.error)throw r.error;createdDraftId=r.data.id;
  }
  const existing=await sb.from('group_event_dates').select('start_date,end_date').eq('event_id',createdDraftId);
  if(existing.error)throw existing.error;
  const missing=dates.filter(d=>!existing.data.some(x=>x.start_date===d.start_date&&x.end_date===d.end_date));
  if(missing.length){const r=await sb.from('group_event_dates').insert(missing.map(d=>({...d,event_id:createdDraftId})));if(r.error)throw r.error;}
  const savedId=createdDraftId;createdDraftId=null;$('event-dialog').close();location.href='event.html?id='+encodeURIComponent(savedId);
 }catch(error){status((createdDraftId?'Veranstaltung gespeichert, Termine noch offen. Bitte erneut speichern. ':'')+(error.message||String(error)),'create-status');}
 finally{writeBusy=false;$('create-event').disabled=false;}
}
async function finalize(optionId,button) {
 if(writeBusy)return;
 const option=options.find(d=>d.id===optionId);if(!option)return;
 if(!confirm('Diesen Termin festlegen: '+dateRange(option.start_date,option.end_date)+'?'))return;
 writeBusy=true;button.disabled=true;
 try {
  const r=await sb.from('group_events').update({status:'confirmed',start_date:option.start_date,end_date:option.end_date}).eq('id',option.event_id).select().single();
  if(r.error)throw r.error;await refresh();
 }catch(e){status('Termin konnte nicht festgelegt werden: '+e.message);}
 finally{writeBusy=false;if(button.isConnected)button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
async function editEvent(e) {
 e.preventDefault();if(writeBusy)return;writeBusy=true;
 const button=e.target.querySelector('button');button.disabled=true;
 try {
  const raw=$('edit-url').value.trim();if(raw&&!safeUrl(raw))throw Error('Bitte eine https://-Adresse eingeben.');
  const r=await sb.from('group_events').update({title:$('edit-title').value.trim(),location:$('edit-location').value.trim(),description:$('edit-description').value.trim(),website_url:raw}).eq('id',currentEventId).select().single();
  if(r.error)throw r.error;await refresh();status('Gespeichert.','edit-status');
 }catch(e){status('Nicht gespeichert: '+e.message,'edit-status');}
 finally{writeBusy=false;button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
async function addOption(e) {
 e.preventDefault();if(writeBusy)return;writeBusy=true;
 const button=e.target.querySelector('button');button.disabled=true;
 try {
  const start=$('extra-start').value,end=$('extra-end').value;
  if(!start||!end||end<start)throw Error('Bitte gültige Termine auswählen.');
  if(start<todayVienna())throw Error('Bitte einen heutigen oder zukünftigen Zeitraum wählen.');
  if(events.find(event=>event.id===currentEventId)?.status!=='planning')throw Error('Die Terminplanung ist bereits abgeschlossen.');
  if(options.some(option=>option.event_id===currentEventId&&option.start_date===start&&option.end_date===end))throw Error('Dieser Zeitraum steht bereits zur Abstimmung.');
  const r=await sb.from('group_event_dates').insert({event_id:currentEventId,start_date:start,end_date:end}).select().single();
  if(r.error){if(r.error.code==='23505')throw Error('Dieser Zeitraum steht bereits zur Abstimmung.');throw r.error;}
  selectCalendarDate(currentEventId,r.data.id,start);
  e.target.reset();await refresh();status('Termin hinzugefügt. Alle können jetzt darüber abstimmen.','extra-status');
 }catch(e){status('Nicht gespeichert: '+e.message,'extra-status');}
 finally{writeBusy=false;button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}

function renderProgram(event) {
 const container=$('program-list');
 const opened=new Set([...container.querySelectorAll('details[open]')].map(el=>el.dataset.programDetail));
 container.innerHTML=programCards(programItems,programVotes,programLinks,event,memberKey,nameFor,people.length);
 container.querySelectorAll('[data-program-detail]').forEach(el=>{el.open=opened.has(el.dataset.programDetail);});
 $('program-timeline').innerHTML=programTimeline(programItems,event);
 container.querySelectorAll('[data-program-vote]').forEach(button=>button.addEventListener('click',()=>voteProgram(button)));
 container.querySelectorAll('[data-program-link]').forEach(button=>button.addEventListener('click',()=>{
  if(writeBusy)return;
  linkItemId=button.dataset.programLink;
  $('program-link-form').reset();$('program-link-item').textContent=programItems.find(item=>item.id===linkItemId)?.title||'';
  status('','program-link-status');$('program-link-dialog').showModal();$('program-link-label').focus();
 }));
}
async function addProgram(e) {
 e.preventDefault();if(writeBusy)return;writeBusy=true;
 const button=e.target.querySelector('button');button.disabled=true;
 try {
  const raw=$('program-url').value.trim(),url=raw?httpsUrl(raw):'';
  if(raw&&!url)throw Error('Bitte eine gültige https://-Adresse ohne Zugangsdaten eingeben.');
  const day=$('program-day').value?Number($('program-day').value):null;
  const result=await sb.from('group_program_items').insert({event_id:currentEventId,title:$('program-title').value.trim(),description:$('program-description').value.trim(),category:$('program-category').value,day_number:day,time_label:$('program-time').value.trim(),cost_label:$('program-cost').value.trim(),website_url:url,created_by_key:memberKey}).select().single();
  if(result.error)throw result.error;
  $('program-dialog').close();await refresh();status('Programmvorschlag gespeichert. Alle können abstimmen.','program-status');
  document.getElementById('program-'+result.data.id)?.scrollIntoView({behavior:'smooth',block:'center'});
 }catch(error){status('Nicht gespeichert: '+error.message,'program-form-status');}
 finally{writeBusy=false;button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
async function voteProgram(button) {
 if(writeBusy)return;writeBusy=true;button.disabled=true;
 const item_id=button.dataset.programVote,choice=button.dataset.programChoice;
 try {
  const own=programVotes.some(v=>v.item_id===item_id&&v.member_key===memberKey);
  let result=own?await sb.from('group_program_votes').update({choice}).eq('item_id',item_id).eq('member_key',memberKey).select().single():await sb.from('group_program_votes').insert({item_id,member_key:memberKey,choice}).select().single();
  if(result.error?.code==='23505')result=await sb.from('group_program_votes').update({choice}).eq('item_id',item_id).eq('member_key',memberKey).select().single();
  if(result.error)throw result.error;
  await refresh();status('Stimme gespeichert.','program-status');
 }catch(error){status('Stimme nicht gespeichert: '+error.message,'program-status');}
 finally{writeBusy=false;if(button.isConnected)button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
async function addProgramLink(e) {
 e.preventDefault();if(writeBusy)return;writeBusy=true;
 const button=e.target.querySelector('button');button.disabled=true;
 try {
  const url=httpsUrl($('program-link-url').value.trim());
  if(!url)throw Error('Bitte eine gültige https://-Adresse ohne Zugangsdaten eingeben.');
  if(programLinks.some(l=>l.item_id===linkItemId&&l.url===url)||programItems.some(i=>i.id===linkItemId&&httpsUrl(i.website_url)===url))throw Error('Dieser Link ist bereits vorhanden.');
  const result=await sb.from('group_program_links').insert({item_id:linkItemId,label:$('program-link-label').value.trim(),url,created_by_key:memberKey}).select().single();
  if(result.error){if(result.error.code==='23505')throw Error('Dieser Link ist bereits vorhanden.');throw result.error;}
  $('program-link-dialog').close();await refresh();status('Link ergänzt.','program-status');
 }catch(error){status('Nicht gespeichert: '+error.message,'program-link-status');}
 finally{writeBusy=false;button.disabled=false;if($('own-attendance'))$('own-attendance').disabled=false;}
}
installHubTools({
 client:()=>sb,userId:()=>user?.id,ready:()=>Boolean(memberKey && !$('app').hidden),
 busy:()=>writeBusy||busy||refreshBusy,setBusy:value=>{writeBusy=value;if(!value&&$('own-attendance'))$('own-attendance').disabled=false;},today:todayVienna,
 eventUrl:event=>new globalThis.URL(eventWebsiteUrl(event),location.href).href,
 apply:data=>{
  [events,options,votes,attendance,people,directory]=data;
  if(document.body.dataset.page==='home')renderHome();else renderEvent();
 },
 prepare:document.body.dataset.page==='home'?input=>{
  if(createdDraftId || $('event-dialog').open)fail('DRAFT_OPEN','Ein Veranstaltungsentwurf ist bereits offen. Bitte zuerst speichern oder schließen.');
  $('new-event-form').reset();$('new-date-options').innerHTML='';
  $('event-title').value=input.title.trim();$('event-kind').value=input.kind;
  $('event-location').value=input.location||'';$('event-description').value=input.description||'';
  input.dates.forEach(d=>addDateRow(d.start_date,d.end_date));
  status('Entwurf vorbereitet – noch nicht gespeichert.','create-status');
  $('event-dialog').showModal();$('event-title').focus();
 }:null
});
init();


