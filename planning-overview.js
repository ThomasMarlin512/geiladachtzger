import {escapeHtml as esc,httpsUrl} from './trip-program.js?v=unified-20261011-2';
import {eventUrl,eventCover,coverImage,photoPageUrl} from './event-layout.js?v=compact-20261011-1';
export function formatPeriod(start,end){
 const format=value=>new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 return format(start)+(start!==end?' – '+format(end):'');
}
export function summarizeDates(options,votes,memberKey,people=[],today=''){
 const active=options.filter(d=>!today||d.end_date>=today);
 const rows=active.map(option=>{
  const unique=new Map(votes.filter(v=>v.option_id===option.id&&['yes','maybe','no'].includes(v.choice)).map(v=>[v.member_key,v]));
  const keys=new Set(people.map((p,i)=>p.member_key||'pending:'+(p.id||i)));
  for(const key of unique.keys())keys.add(key);
  const values=[...unique.values()];
  return {...option,yes:values.filter(v=>v.choice==='yes').length,maybe:values.filter(v=>v.choice==='maybe').length,no:values.filter(v=>v.choice==='no').length,pending:Math.max(0,keys.size-values.length),total:keys.size,own:unique.get(memberKey)?.choice||null};
 });
 const ranked=[...rows].sort((a,b)=>b.yes-a.yes||a.no-b.no||b.maybe-a.maybe);
 const top=ranked[0];
 const best=top?.yes>0?ranked.filter(r=>r.yes===top.yes&&r.no===top.no&&r.maybe===top.maybe):[];
 return {rows,answered:rows.filter(r=>r.own).length,pending:rows.filter(r=>!r.own).length,best};
}
export function planningCards(events,options,votes,memberKey,people,today,items=[]){
 const planning=events.filter(e=>e.status==='planning');
 if(!planning.length)return '<p class="subtle">Aktuell ist keine Terminabstimmung offen. Bei einem neuen Vorschlag könnt ihr wieder gemeinsam abstimmen.</p>';
 return planning.map(event=>{
  const s=summarizeDates(options.filter(o=>o.event_id===event.id),votes,memberKey,people,today);
  const progress=s.rows.length?s.answered+' von '+s.rows.length+' Zeiträumen beantwortet':'Noch kein offener Terminvorschlag';
  const leading=s.best.length===1?'Bisher passendster Termin: '+formatPeriod(s.best[0].start_date,s.best[0].end_date)+' · '+s.best[0].yes+' Zusagen':s.best.length>1?s.best.length+' Termine liegen gleichauf.':'Noch kein Termin mit Zusagen.';
  const cover=eventCover(event,items);
  return '<article class="planning-summary'+(cover?' planning-photo-card':'')+'">'+coverImage(cover,'event-card-photo')+'<div class="planning-summary-content"><div><span class="tag '+(s.pending?'':'confirmed')+'">'+(s.pending?s.pending+' Antworten von dir offen':s.rows.length?'Du hast abgestimmt':'Termin vorschlagen')+'</span><h3>'+esc(event.title)+'</h3><p>'+progress+'</p><p class="subtle">'+esc(leading)+'</p></div><a class="button '+(s.pending?'':'secondary')+'" href="'+esc(eventUrl(event,'termine'))+'">'+(s.rows.length?(s.pending?'Jetzt abstimmen':'Abstimmung ansehen'):'Termin vorschlagen')+' →</a><a class="text-link planning-event-link" href="'+esc(eventUrl(event))+'">Programm & Reiseinfos →</a>'+(cover?'<small class="cover-credit"><a href="'+esc(cover.source)+'" target="_blank" rel="noopener noreferrer">Foto: '+esc(cover.credit)+'</a></small>':'')+'</div></article>';
 }).join('');
}
export function photoCards(events,items=[]){
 const albums=events.filter(e=>e.id==='kufstein-2026'||httpsUrl(e.album_url));
 return albums.map(event=>{
  const cover=eventCover(event,items);
  return '<article class="hub-album-card">'+coverImage(cover,'album-destination-cover')+'<div class="hub-album-content"><p class="eyebrow">GEMEINSAMES FOTOALBUM</p><h3>'+esc(event.title)+'</h3><a class="button photo-button" href="'+esc(photoPageUrl(event))+'">Fotos ansehen →</a>'+(cover?'<small class="cover-credit"><a href="'+esc(cover.source)+'" target="_blank" rel="noopener noreferrer">Titelbild: '+esc(cover.credit)+'</a></small>':'')+'</div></article>';
 }).join('')||'<p class="subtle">Noch kein Album verlinkt. Auf der jeweiligen Veranstaltungsseite kann der Ersteller unter „Fotos“ einen Albumlink ergänzen.</p>';
}
