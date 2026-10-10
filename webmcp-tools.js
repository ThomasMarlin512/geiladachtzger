import {choiceSchema,idSchema,schema,fail,rows,requireMember,installTools,savedResult} from './webmcp-core.js';

export function installHubTools(app) {
 const eventFields='id,title,kind,description,location,status,start_date,end_date,website_url,default_participation,created_by_key,outbound_time,outbound_details,outbound_url,return_time,return_details,return_url,hotel_name,hotel_url,hotel_details,hotel_status,album_url,album_label,cover_image_url,cover_source_url,cover_credit';
 async function member() {
  const client=app.client();
  const current=await requireMember(client,app.userId(),app.ready());
  const own=await rows(client.from('trip_attendance').select('roster_key').eq('user_id',current.id).single());
  if(!own?.roster_key) fail('LOGIN_REQUIRED','Bitte die Gruppenanmeldung erneuern.');
  return {...current,key:own.roster_key,client};
 }
 async function snapshot(current) {
  const c=current.client;
  const data=await Promise.all([
   rows(c.from('group_events').select(eventFields).order('created_at')),
   rows(c.from('group_event_dates').select('id,event_id,start_date,end_date').order('start_date')),
   rows(c.from('group_date_votes').select('option_id,member_key,choice')),
   rows(c.from('group_event_attendance').select('event_id,member_key,status')),
   rows(c.from('group_people').select('id,member_key,full_name').order('full_name')),
   rows(c.from('trip_attendance').select('roster_key,nickname'))
  ]);
  app.apply(data);
  return data;
 }
 function publicEvent(event) {
  return {id:event.id,title:event.title,kind:event.kind,description:event.description,location:event.location,status:event.status,
   start_date:event.start_date,end_date:event.end_date,url:app.eventUrl(event)};
 }
 async function write(action) {
  if(app.busy()) fail('BUSY','Auf der Website läuft bereits eine Änderung.');
  app.setBusy(true);
  try {const current=await member();return await action(current);}
  finally {app.setBusy(false);}
 }
 const tools=[
  {name:'geiladachtzger_list_events',title:'Veranstaltungen lesen',description:'Liest die aktuellen Gruppenveranstaltungen mit Terminen und Links. Gruppenanmeldung erforderlich.',inputSchema:schema(),
   async run(){const current=await member();const [events]=await snapshot(current);return {events:events.map(publicEvent)};}},
  {name:'geiladachtzger_get_event',title:'Teilnahme und Terminabstimmung lesen',description:'Liest eine Veranstaltung mit Teilnehmern und Terminabstimmungen. Kennzeichnet voreingestellte Teilnahme ohne persönliche Rückmeldung.',inputSchema:schema({event_id:idSchema},['event_id']),
   async run({event_id}) {
    const current=await member();const [events,dates,votes,attendance,people,directory]=await snapshot(current);
    const event=events.find(e=>e.id===event_id);if(!event)fail('NOT_FOUND','Veranstaltung nicht gefunden.');
    const name=key=>people.find(p=>p.member_key===key)?.full_name || directory.find(p=>p.roster_key===key)?.nickname || 'Gruppenmitglied';
    return {event:publicEvent(event),participants:people.map(person=>{
     const own=attendance.find(a=>a.event_id===event_id&&a.member_key===person.member_key);
     return {name:person.full_name,status:own?.status||event.default_participation,source:own?'recorded':'default',is_me:person.member_key===current.key};
    }),dates:dates.filter(d=>d.event_id===event_id).map(d=>({id:d.id,start_date:d.start_date,end_date:d.end_date,
     votes:votes.filter(v=>v.option_id===d.id).map(v=>({name:name(v.member_key),choice:v.choice,is_me:v.member_key===current.key}))}))};
   }},
  {name:'geiladachtzger_set_my_attendance',title:'Eigene Teilnahme speichern',description:'Speichert ausschließlich die Teilnahme des angemeldeten Gruppenmitglieds an einer Veranstaltung: yes, maybe oder no.',write:true,inputSchema:schema({event_id:idSchema,status:choiceSchema},['event_id','status']),
   run({event_id,status}) {return write(async current=>{
    const event=await rows(current.client.from('group_events').select('id').eq('id',event_id).maybeSingle());
    if(!event)fail('NOT_FOUND','Veranstaltung nicht gefunden.');
    const saved=await rows(current.client.from('group_event_attendance').upsert({event_id,member_key:current.key,status},{onConflict:'event_id,member_key'}).select('status').single());
    if(saved?.status!==status)fail('SAVE_NOT_CONFIRMED','Speicherung nicht bestätigt. Bitte den aktuellen Stand prüfen.');
    return savedResult({event_id,attendance:status},()=>snapshot(current));
   });}},
  {name:'geiladachtzger_vote_date',title:'Eigene Terminstimme speichern',description:'Speichert die eigene Stimme für einen offenen, nicht vergangenen Terminvorschlag. yes = passt, maybe = vielleicht, no = geht nicht.',write:true,inputSchema:schema({option_id:idSchema,choice:choiceSchema},['option_id','choice']),
   run({option_id,choice}) {return write(async current=>{
    const option=await rows(current.client.from('group_event_dates').select('event_id,end_date').eq('id',option_id).maybeSingle());
    if(!option)fail('NOT_FOUND','Terminvorschlag nicht gefunden.');
    const event=await rows(current.client.from('group_events').select('status').eq('id',option.event_id).maybeSingle());
    if(event?.status!=='planning'||option.end_date<app.today())fail('VOTING_CLOSED','Diese Terminabstimmung ist geschlossen.');
    const saved=await rows(current.client.from('group_date_votes').upsert({option_id,member_key:current.key,choice},{onConflict:'option_id,member_key'}).select('choice').single());
    if(saved?.choice!==choice)fail('SAVE_NOT_CONFIRMED','Speicherung nicht bestätigt. Bitte den aktuellen Stand prüfen.');
    return savedResult({option_id,choice},()=>snapshot(current));
   });}}
 ];
 if(app.prepare) tools.push({name:'geiladachtzger_prepare_event',title:'Veranstaltung als Formular vorbereiten',description:'Öffnet und füllt das Veranstaltungsformular. Speichert keine Veranstaltung. Der Nutzer kann den Entwurf prüfen und über Vorschlag speichern anlegen.',write:true,
  inputSchema:schema({title:{type:'string',minLength:2,maxLength:100},kind:{type:'string',enum:['trip','event']},location:{type:'string',maxLength:120},description:{type:'string',maxLength:2000},dates:{type:'array',minItems:1,maxItems:8,items:schema({start_date:{type:'string',minLength:10,maxLength:10},end_date:{type:'string',minLength:10,maxLength:10}},['start_date','end_date'])}},['title','kind','dates']),
  async run(input) {
   await member();
   if(app.busy())fail('BUSY','Auf der Website läuft bereits eine Änderung.');
   for(const date of input.dates) {
    for(const value of [date.start_date,date.end_date]) {
     const parsed=new Date(value+'T12:00:00Z');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value)fail('INVALID_INPUT','Ungültiges Datum.');
    }
    if(date.end_date<date.start_date || date.start_date<app.today())fail('INVALID_INPUT','Bitte zukünftige Termine mit gültiger Reihenfolge wählen.');
   }
   app.prepare(input);return {status:'prepared',saved:false,message:'Formular vorbereitet. Zum Anlegen Vorschlag speichern wählen.'};
  }});
 installTools(tools);
}

