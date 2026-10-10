export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function httpsUrl(value) {
 try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export const categories={activity:['✦','Aktivität'],food:['🍽','Essen & Trinken'],hotel:['⌂','Unterkunft'],travel:['➜','Anreise'],other:['☀','Weitere Idee']};
const choices={yes:'👍 Ja',maybe:'🤔 Vielleicht',no:'👎 Nein'};
export const activityPhotos={"https://www.hellbrunn.at/wasserspiele": {"image": "https://www.hellbrunn.at/fileadmin/_processed_/d/8/csm_Schloss_Hellbrunn_Wasser_2542550e6a.jpg", "credit": "Schloss Hellbrunn"}, "https://www.salzburg.info/de/sehenswertes/top10/festung-hohensalzburg": {"image": "https://www.salzburg.info/deskline/infrastruktur/objekte/Festung%20Hohensalzburg_7955/1265536/image-thumb__1265536__slider-main/blick-auf-die-festung_38594544.3053673d.jpg", "credit": "Salzburg Tourismus"}, "https://www.salzburg.info/de/sehenswertes/top10/schloss-mirabell": {"image": "https://www.salzburg.info/deskline/infrastruktur/objekte/Schloss%20Mirabell%20%26%20Mirabellgarten_11350/1166493/image-thumb__1166493__slider-main/schloss-mirabell-und-mirabellgarten_25482110.b3014129.jpg", "credit": "Salzburg Tourismus"}, "https://www.chiemsee-chiemgau.info/herreninsel": {"image": "https://www.chiemsee-chiemgau.info/images/Et_aqQFPAOo/rs:fill:2500:0/cb:/g:ce/aHR0cHM6Ly9pbXhwbGF0Zm9ybS1jdXN0LWN0LmZzbjEueW91ci1vYmplY3RzdG9yYWdlLmNvbS9tZWRpYS9zY2hsb3NzLWhlcnJlbmNoaWVtc2VlLmpwZw", "credit": "Chiemgau Tourismus"}, "https://www.chiemsee-chiemgau.info/fraueninsel": {"image": "https://www.chiemsee-chiemgau.info/images/6212ON1tRFE/rs:fill:2500:0/cb:/g:ce/aHR0cHM6Ly9pbXhwbGF0Zm9ybS1jdXN0LWN0LmZzbjEueW91ci1vYmplY3RzdG9yYWdlLmNvbS9tZWRpYS9pbWFnZXMva3VsdHVyX3RrXzIwMTVfMi01LmpwZw", "credit": "Chiemgau Tourismus"}};
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
  const url=httpsUrl(item.website_url),photo=activityPhotos[url];
  const resources=links.filter(l=>l.item_id===item.id);
  const results=Object.entries(choices).map(([choice,label])=>{
   const picked=rows.filter(v=>v.choice===choice),percent=Math.round(100*picked.length/Math.max(totalMembers,rows.length,1));
   return '<div class="program-result '+choice+'"><b>'+label+' <span>'+picked.length+'</span></b><div class="program-track"><span style="width:'+percent+'%"></span></div><p>'+ (picked.map(v=>esc(nameFor(v.member_key))).join(', ')||'Noch niemand')+'</p></div>';
  }).join('');
  return '<article class="program-card" id="program-'+esc(item.id)+'">'+(photo?'<img class="program-photo" src="'+esc(photo.image)+'" alt="'+esc(item.title)+'" loading="lazy">':'<div class="program-cover '+esc(item.category)+'" aria-hidden="true">'+icon+'</div>')+'<div class="program-content"><span class="program-pill">'+esc(dayLabel(item,event)+(item.time_label?' · '+item.time_label:''))+'</span><h3>'+esc(item.title)+'</h3><p class="program-cost">'+esc(item.cost_label||'Kosten noch offen')+'</p><p class="program-description">'+esc(item.description)+'</p><p class="program-meta">'+esc(category)+' · Vorschlag von '+esc(nameFor(item.created_by_key))+'</p><div class="program-links">'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Weitere Infos ↗</a>':'')+resources.map(l=>'<a href="'+esc(httpsUrl(l.url))+'" target="_blank" rel="noopener noreferrer">'+esc(l.label)+' ↗</a>').join('')+'</div><div class="program-vote" role="group" aria-label="Abstimmung: '+esc(item.title)+'">'+Object.entries(choices).map(([c,label])=>'<button type="button" data-program-vote="'+esc(item.id)+'" data-program-choice="'+c+'" class="'+c+(own===c?' selected':'')+'" aria-pressed="'+(own===c)+'">'+label+'</button>').join('')+'</div><p class="program-own">'+(own?'Deine Stimme: '+choices[own]:'Noch nicht abgestimmt')+' · '+Math.max(0,totalMembers-rows.length)+' offen</p><details class="program-results" data-program-detail="'+esc(item.id)+'"><summary>Abstimmung ansehen · '+rows.length+' Stimmen</summary>'+results+'</details><button type="button" class="quiet program-add-link" data-program-link="'+esc(item.id)+'">＋ Link ergänzen</button>'+(photo?'<small class="program-credit">Bildquelle: <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(photo.credit)+'</a></small>':'')+'</div></article>';
 }).join('')||'<div class="empty">Noch keine Ideen. Schlag als Erstes einen Programmpunkt vor.</div>';
}
export function programTimeline(items,event) {
 if(!items.length)return '<p class="subtle">Eure Vorschläge erscheinen hier nach Reisetagen sortiert.</p>';
 const groups=new Map();
 for(const item of items){const day=dayLabel(item,event);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(item);}
 return [...groups].map(([day,rows])=>'<div class="program-day"><h3>'+escapeHtml(day)+'</h3>'+rows.map(item=>'<p><a href="#program-'+escapeHtml(item.id)+'">'+escapeHtml(item.title)+'</a>'+(item.time_label?'<small>'+escapeHtml(item.time_label)+'</small>':'')+'</p>').join('')+'</div>').join('');
}
