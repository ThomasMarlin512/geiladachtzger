import {escapeHtml as esc,httpsUrl,programPhoto} from './trip-program.js?v=20261010-3';

export const eventViews=['uebersicht','programm','termine','fotos'];
export const detailFields=['outbound_time','outbound_details','outbound_url','return_time','return_details','return_url','hotel_name','hotel_url','hotel_details','hotel_status','album_url','album_label','cover_image_url','cover_source_url','cover_credit'];
export const eventUrl=(event,view='uebersicht')=>'event.html?id='+encodeURIComponent(event.id)+(view==='uebersicht'?'':'&view='+view);
export const photoPageUrl=event=>event.id==='kufstein-2026'?'/kufstein-2026/fotos.html':eventUrl(event,'fotos');
export function activeView(search,hash,event){
 const requested=new URLSearchParams(search).get('view');
 const legacy=['#programm','#aktivitaeten'].includes(hash)?'programm':['#date-suggestion','#event-dates-section'].includes(hash)?'termine':'uebersicht';
 const view=eventViews.includes(requested)?requested:legacy;
 return view==='termine'&&event.status!=='planning'?'uebersicht':view;
}
export function eventCover(event,items=[]){
 const image=httpsUrl(event.cover_image_url),source=httpsUrl(event.cover_source_url);
 if(image&&source)return {image,source,credit:event.cover_credit||new URL(source).hostname};
 return items.filter(i=>i.event_id===event.id).map(programPhoto).find(Boolean)||null;
}
const external=(url,label)=>httpsUrl(url)?'<a class="text-link" href="'+esc(httpsUrl(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';
const time=value=>value?.slice(0,5)||'';
const date=value=>value?new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'';
export function travelCards(event){
 const travel=(prefix,title,day)=>'<article class="panel travel-card"><p class="eyebrow">'+title.toUpperCase()+'</p><h3>'+esc([date(day),time(event[prefix+'_time'])].filter(Boolean).join(' · ')||'Noch offen')+'</h3><p class="preserve-lines">'+esc(event[prefix+'_details']||'Treffpunkt, Verkehrsmittel und Uhrzeit ergänzen.')+'</p>'+external(event[prefix+'_url'],'Route / Verbindung öffnen')+'</article>';
 const hotelLabels={open:'Noch offen',proposed:'Vorgeschlagen',booked:'Gebucht'};
 return travel('outbound','Anreise',event.start_date)+travel('return','Abreise',event.end_date)+'<article class="panel travel-card"><p class="eyebrow">HOTEL / UNTERKUNFT</p><h3>'+esc(event.hotel_name||'Unterkunft noch offen')+'</h3><span class="tag '+(event.hotel_status==='booked'?'confirmed':'')+'">'+(hotelLabels[event.hotel_status]||hotelLabels.open)+'</span><p class="preserve-lines">'+esc(event.hotel_details||'Adresse, Check-in und weitere Hinweise können ergänzt werden.')+'</p>'+external(event.hotel_url,'Hotelwebseite öffnen')+'</article>';
}
export function albumCard(event,organizer){
 const url=httpsUrl(event.album_url);
 const link=url?'<a class="button photo-button" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Fotoalbum öffnen ↗</a>':'';
 return '<div class="panel album-panel"><span class="album-symbol" aria-hidden="true">📷</span><p class="eyebrow">FOTOS & ERINNERUNGEN</p><h2>'+esc(event.album_label||'Gemeinsames Fotoalbum')+'</h2><p>'+ (link?'Unser Album liegt beim verlinkten Anbieter. Dort könnt ihr die Bilder ansehen und – wenn im Album erlaubt – eigene Fotos ergänzen.':'Hier könnt ihr ein geteiltes Album verlinken, zum Beispiel von iCloud, Google Fotos oder OneDrive.')+'</p>'+link+(organizer?'<button type="button" class="secondary" data-edit-event="album">'+(link?'Albumlink bearbeiten':'＋ Fotoalbum verlinken')+'</button>':'')+'</div>';
}
export function travelTimeline(event){
 return ['outbound','return'].filter(p=>event[p+'_time']||event[p+'_details']).map(p=>'<div class="travel-marker"><strong>'+ (p==='outbound'?'Anreise':'Abreise')+'</strong><span>'+esc([date(event[p==='outbound'?'start_date':'end_date']),time(event[p+'_time'])].filter(Boolean).join(' · ')||'Zeit noch offen')+'</span><p>'+esc(event[p+'_details']||'')+'</p>'+external(event[p+'_url'],'Route / Verbindung')+'</div>').join('');
}
