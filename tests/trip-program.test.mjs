import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {summarizeDates,formatPeriod} from '../planning-overview.js';
import {eventUrl,activeView,eventCover,travelCards,albumCard,travelTimeline,detailFields} from '../event-layout.js';
const moduleSource=readFileSync(new URL('../trip-program.js',import.meta.url),'utf8');
const {httpsUrl,dayLabel,programCards,programTimeline,scheduleLabel,sortProgram,programPhoto}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
assert.equal(httpsUrl('javascript:alert(1)'), '');
assert.equal(httpsUrl('https://name:secret@example.com'), '');
assert.equal(httpsUrl('https://example.com/info'),'https://example.com/info');
const item={id:'a',title:'<img onerror=alert(1)>',description:'<script>bad</script>',category:'activity',day_number:2,time_label:'Vormittags',created_by_key:'member'};
assert.equal(dayLabel(item,{}),'Tag 2');
assert.match(dayLabel(item,{start_date:'2027-09-02'}),/03\.09/);
const html=programCards([item],[{item_id:'a',member_key:'member',choice:'yes'}],[{item_id:'a',url:'https://example.com/',label:'Info <b>'}],{},'member',()=>'<Person>',13);
assert.ok(!html.includes('<script>bad'));
assert.ok(html.includes('&lt;Person&gt;'));
assert.ok(html.includes('12 offen'));
assert.ok(html.includes('aria-pressed="true"'));
assert.ok(html.includes('Link ergänzen'));
assert.ok(html.includes('rel="noopener noreferrer"'));
assert.match(programTimeline([item],{}),/Tag 2/);
// Exercise the actual page renderer across planning -> confirmed, without an authenticated browser.
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const renderSource=source.slice(source.indexOf('function renderEvent()'),source.indexOf('function renderPeople('));
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',innerHTML:'',replaceChildren(){this.innerHTML='';}});return nodes.get(id);};
const event={id:'trip',status:'planning',title:'Test',location:'Test',created_by_key:'someone',description:'Test',website_url:''};
const context={fieldEditor:null,$:get,summarizeDates,formatPeriod,dateLabels:{yes:'✓ Passt',maybe:'? Vielleicht',no:'✕ Geht nicht'},nameFor:key=>key,events:[event],currentEventId:'trip',document:{activeElement:null,querySelectorAll:()=>[]},memberKey:'member',programItems:[],programPhoto,httpsUrl,eventUrl,activeView,eventCover,travelCards,albumCard,travelTimeline,detailFields,wireEventImages:()=>{},esc:String,safeUrl:()=>'',past:()=>false,dateRange:()=>'',people:[],stateLabels:{planning:'In Planung',confirmed:'Termin steht'},options:[],votes:[],votingCalendar:()=>'<calendar/>',dateCards:()=>'',wireVotes:()=>{},renderProgram:()=>{},renderPeople:()=>{},todayVienna:()=> '2026-10-10',location:{hash:'',search:'?id=trip&view=termine'}};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function dateCards('),source.indexOf('function wireVotes(')),context);vm.runInContext(renderSource,context);context.renderEvent();
assert.equal(get('event-dates-section').hidden,false);
assert.equal(get('organizer-section').hidden,true);
assert.equal(get('event-dates').innerHTML,'<calendar/>');
event.status='confirmed';context.renderEvent();
assert.equal(get('event-dates-section').hidden,true);
assert.equal(get('date-nav').hidden,true);
assert.equal(get('event-dates').innerHTML,'');assert.equal(get('date-comparison').innerHTML,'');
assert.ok(get('trip-information').innerHTML.includes('Test'));
assert.equal(get('event-overview').hidden,false);
event.status='saved';context.renderEvent();assert.equal(get('date-nav').hidden,true);
assert.match(get('event-plan-notice').innerHTML,/Für später/);
event.status='planning';context.location.search='?id=trip';context.renderEvent();
assert.equal(get('event-dates-section').hidden,true);assert.equal(get('event-dates').innerHTML,'');
context.location.search='?id=trip&view=programm';context.renderEvent();assert.equal(get('event-program').hidden,false);
context.location.search='?id=trip&view=fotos';context.renderEvent();assert.equal(get('event-photos').hidden,false);
context.events=[];context.renderEvent();assert.equal(get('event-content').hidden,true);
console.log('PASS: safe links, escaping, vote counts, relative itinerary dates and calendar removal after confirmation');

assert.equal(scheduleLabel({start_time:'18:00:00',end_time:'01:00:00',ends_next_day:true}),'18:00–01:00 (+1 Tag)');
assert.deepEqual(sortProgram([{id:'b',day_number:1,start_time:'18:00'},{id:'a',day_number:1,start_time:'09:00'}]).map(x=>x.id),['a','b']);
assert.equal(programPhoto({image_url:'javascript:bad',image_source_url:'https://example.com'}),null);
assert.equal(programPhoto({image_url:'https://example.com/p.jpg',image_source_url:'https://example.com',image_credit:'Hotel'}).credit,'Hotel');
assert.equal(programPhoto({image_url:'',image_source_url:''}),null);
console.log('PASS: times across midnight, schedule order, stored photos and photo removal');
const {programConflicts}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
const itineraryItems=[
{id:'late',title:'Abend',description:'<script>unsafe</script>',day_number:1,start_time:'18:00',end_time:'19:00'},
{id:'early',title:'Früh',description:'Treffpunkt am Hotel',day_number:1,start_time:'09:00',end_time:'10:30'},
{id:'overlap',title:'Alternative',description:'Andere Idee',day_number:1,start_time:'10:00',end_time:'11:00'},
{id:'open',title:'Offen',description:'',day_number:null}
];
const itinerary=programTimeline(itineraryItems,{start_date:'2027-09-02'});
assert.ok(itinerary.indexOf('>Früh</a>')<itinerary.indexOf('>Abend</a>'));
assert.ok(itinerary.includes('Treffpunkt am Hotel'));
assert.ok(itinerary.includes('09:00–10:30'));
assert.ok(itinerary.includes('Uhrzeit noch offen'));
assert.ok(!itinerary.includes('<script>unsafe</script>'));
assert.ok(itinerary.includes('data-program-media="early"'));
assert.deepEqual([...programConflicts(itineraryItems)].sort(),['early','overlap']);
assert.equal(programConflicts([{id:'a',day_number:1,start_time:'09:00',end_time:'10:00'},{id:'b',day_number:1,start_time:'10:00',end_time:'11:00'}]).size,0);
assert.equal(programConflicts([{id:'a',day_number:1,start_time:'23:00',end_time:'01:00',ends_next_day:true},{id:'b',day_number:2,start_time:'00:30',end_time:'02:00'}]).size,2);
console.log('PASS: automatic itinerary sorts, includes descriptions and edit actions, keeps open times and flags real overlaps');
