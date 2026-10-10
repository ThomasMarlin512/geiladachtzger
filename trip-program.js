export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function httpsUrl(value) {
 try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export const categories={activity:['✦','Aktivität'],food:['🍽','Essen & Trinken'],hotel:['⌂','Unterkunft'],travel:['➜','Anreise'],other:['☀','Weitere Idee']};
const choices={yes:'👍 Ja',maybe:'🤔 Vielleicht',no:'👎 Nein'};
export function scheduleLabel(item) {
 const start=item.start_time?.slice(0,5),end=item.end_time?.slice(0,5);
 return [start?(start+(end?'–'+end:'')+(end&&item.ends_next_day?' (+1 Tag)':'')):'',item.time_label].filter(Boolean).join(' · ');
}
export function programPhoto(item) {
 const image=httpsUrl(item.image_url),source=httpsUrl(item.image_source_url);
 return image&&source?{image,source,credit:item.image_credit||new URL(source).hostname}:null;
}
export function sortProgram(items) {
 return [...items].sort((a,b)=>(a.day_number??99)-(b.day_number??99)||(a.start_time||'99').localeCompare(b.start_time||'99')||(a.created_at||'').localeCompare(b.created_at||''));
}
export function dayLabel(item,event) {
 if(!item.day_number)return 'Tag noch offen';
 if(!event.start_date)return 'Tag '+item.day_number;
 const day=new Date(event.start_date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+item.day_number-1);
 return new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(day);
}
export function programCards(items,votes,links,event,memberKey,nameFor,totalMembers) {
 const esc=escapeHtml;
 return items.map(item=>{
  const rows=votes.filter(v=>v.item_id===item.id),own=rows.find(v=>v.member_key===memberKey)?.choice;
  const [icon,category]=categories[item.category]||categories.other;
  const url=httpsUrl(item.website_url),photo=programPhoto(item);
  const resources=links.filter(l=>l.item_id===item.id);
  const results=Object.entries(choices).map(([choice,label])=>{
   const picked=rows.filter(v=>v.choice===choice),percent=Math.round(100*picked.length/Math.max(totalMembers,rows.length,1));
   return '<div class="program-result '+choice+'"><b>'+label+' <span>'+picked.length+'</span></b><div class="program-track"><span style="width:'+percent+'%"></span></div><p>'+ (picked.map(v=>esc(nameFor(v.member_key))).join(', ')||'Noch niemand')+'</p></div>';
  }).join('');
  return '<article class="program-card" id="program-'+esc(item.id)+'">'+(photo?'<img class="program-photo" src="'+esc(photo.image)+'" alt="'+esc(item.title)+'" loading="lazy">':'<div class="program-cover '+esc(item.category)+'" aria-hidden="true">'+icon+'</div>')+'<div class="program-content"><span class="program-pill">'+esc(dayLabel(item,event)+(scheduleLabel(item)?' · '+scheduleLabel(item):''))+'</span><h3>'+esc(item.title)+'</h3><p class="program-cost">'+esc(item.cost_label||'Kosten noch offen')+'</p><p class="program-description">'+esc(item.description)+'</p><p class="program-meta">'+esc(category)+' · Vorschlag von '+esc(nameFor(item.created_by_key))+'</p><div class="program-links">'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Weitere Infos ↗</a>':'')+resources.map(l=>'<a href="'+esc(httpsUrl(l.url))+'" target="_blank" rel="noopener noreferrer">'+esc(l.label)+' ↗</a>').join('')+'</div><div class="program-vote" role="group" aria-label="Abstimmung: '+esc(item.title)+'">'+Object.entries(choices).map(([c,label])=>'<button type="button" data-program-vote="'+esc(item.id)+'" data-program-choice="'+c+'" class="'+c+(own===c?' selected':'')+'" aria-pressed="'+(own===c)+'">'+label+'</button>').join('')+'</div><p class="program-own">'+(own?'Deine Stimme: '+choices[own]:'Noch nicht abgestimmt')+' · '+Math.max(0,totalMembers-rows.length)+' offen</p><details class="program-results" data-program-detail="'+esc(item.id)+'"><summary>Abstimmung ansehen · '+rows.length+' Stimmen</summary>'+results+'</details><button type="button" class="quiet program-add-link" data-program-link="'+esc(item.id)+'">＋ Link ergänzen</button><button type="button" class="secondary program-edit-media" data-program-media="'+esc(item.id)+'">◷ Uhrzeit & Foto</button>'+(photo?'<small class="program-credit">Bildquelle: <a href="'+esc(photo.source)+'" target="_blank" rel="noopener noreferrer">'+esc(photo.credit)+'</a></small>':'')+'</div></article>';
 }).join('')||'<div class="empty">Noch keine Ideen. Schlag als Erstes einen Programmpunkt vor.</div>';
}
export function programTimeline(items,event) {
 if(!items.length)return '<p class="subtle">Eure Vorschläge erscheinen hier nach Reisetagen sortiert.</p>';
 const groups=new Map();
 for(const item of items){const day=dayLabel(item,event);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(item);}
 return [...groups].map(([day,rows])=>'<div class="program-day"><h3>'+escapeHtml(day)+'</h3>'+rows.map(item=>'<p><a href="#program-'+escapeHtml(item.id)+'">'+escapeHtml(item.title)+'</a>'+(scheduleLabel(item)?'<small>'+escapeHtml(scheduleLabel(item))+'</small>':'')+'</p>').join('')+'</div>').join('');
}
