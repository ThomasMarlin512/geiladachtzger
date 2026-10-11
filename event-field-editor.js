const text=(label,max=1000)=>({label,max,type:'textarea'});
const link=label=>({label,max:2048,type:'url'});
export const eventFieldSpecs={
 title:{label:'Veranstaltungstitel',type:'text',max:100,min:2},location:{label:'Ort',type:'text',max:120},description:text('Beschreibung der Reise',2000),website_url:link('Weitere Reiseinfos'),
 outbound_time:{label:'Abfahrtszeit · Anreise',type:'time'},outbound_details:text('Anreise · Treffpunkt und Hinweise'),outbound_url:link('Anreise · Route / Verbindung'),
 return_time:{label:'Abfahrtszeit · Rückreise',type:'time'},return_details:text('Rückreise · Treffpunkt und Hinweise'),return_url:link('Rückreise · Route / Verbindung'),
 hotel_name:{label:'Hotel / Unterkunft',type:'text',max:160},hotel_status:{label:'Stand der Unterkunft',type:'select',options:{open:'Noch offen',proposed:'Vorgeschlagen',booked:'Gebucht'}},hotel_details:text('Hotel · Adresse, Check-in und Hinweise'),hotel_url:link('Hotelwebseite'),
 album_label:{label:'Bezeichnung des Fotoalbums',type:'text',max:120},album_url:link('Freigabelink zum Fotoalbum')
};
export const programFieldSpecs={plan_status:{label:"Planungsstand",type:"select",options:{idea:"Idee",alternative:"Alternative",planned:"Eingeplant",booked:"Gebucht"}},category:{label:'Kategorie',type:'select',options:{activity:'Aktivität',food:'Essen & Trinken',hotel:'Unterkunft',travel:'Anreise',other:'Weitere Idee'}},title:{label:'Programmpunkt',type:'text',min:2,max:100},description:text('Beschreibung',1500),cost_label:{label:'Kosten / Hinweis',type:'text',max:120},website_url:link('Weitere Infos'),time_label:{label:'Hinweis zur Zeit',type:'text',max:80},schedule:{label:'Tag und Uhrzeit',type:'schedule'}};
const scheduleFields=['day_number','start_time','end_time','ends_next_day','time_label'];
export function fieldPatch(kind,field,values){
 const spec=(kind==='event'?eventFieldSpecs:programFieldSpecs)[field];
 if(!spec)throw Error('Unbekanntes Textfeld.');
 const fields=field==='schedule'?scheduleFields:[field],patch={};
 for(const key of fields){
  const type=key==='day_number'?'number':key==='ends_next_day'?'checkbox':key.endsWith('_time')?'time':field==='schedule'?'text':spec.type;
  let value=values[key];
  if(type==='checkbox')value=!!value;
  else if(type==='number'){value=value===''?null:Number(value);if(value!==null&&(!Number.isInteger(value)||value<1||value>31))throw Error('Reisetag muss zwischen 1 und 31 liegen.');}
  else {value=String(value??'').trim();if(type==='time')value=value||null;}
  if(type==='url'&&value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error();value=u.href;}catch{throw Error('Bitte einen gültigen https://-Link ohne Zugangsdaten eingeben.');}}
  if(field!=='schedule'&&typeof value==='string'&&((spec.min&&value.length<spec.min)||(spec.max&&value.length>spec.max)))throw Error('Bitte die erlaubte Textlänge beachten.');
  if(type==='select'&&!Object.hasOwn(spec.options,value))throw Error('Bitte einen gültigen Stand wählen.');
  patch[key]=value;
 }
 if(field==='schedule'){
  if(patch.time_label.length>80)throw Error('Der Hinweis darf maximal 80 Zeichen haben.');
  if(patch.end_time&&!patch.start_time)throw Error('Bitte auch die Startzeit eingeben.');
  if(patch.end_time&&patch.end_time<patch.start_time&&!patch.ends_next_day)throw Error('Das Ende liegt vor dem Beginn. Falls passend, „Ende am nächsten Tag“ aktivieren.');
 }
 return patch;
}
const pencil='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function createEventFieldEditor({client,canEdit,event,items,onSaved,onBusy,canEnterEditMode}){
 const dialog=document.createElement('dialog');dialog.className='event-field-dialog';dialog.setAttribute('aria-labelledby','field-editor-heading');
 dialog.innerHTML='<form><h2 id="field-editor-heading">Text bearbeiten</h2><div class="field-editor-inputs"></div><p class="field-editor-error" role="alert"></p><div class="field-editor-actions"><button type="submit">Speichern</button><button type="button" class="secondary" data-cancel>Abbrechen</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),inputs=dialog.querySelector('.field-editor-inputs'),error=dialog.querySelector('[role=alert]');
 let active=null,saving=false,editing=false;
 const toggle=document.getElementById('edit-mode-toggle'),bar=document.getElementById('edit-mode-bar');
 function syncMode(){
  const allowed=!!event()&&(canEnterEditMode?canEnterEditMode():canEdit('event',event().id)||items().some(item=>canEdit('program',item.id)));
  if(!allowed){editing=false;if(dialog.open&&!saving)dialog.close();}
  if(bar)bar.hidden=!allowed;
  if(toggle){toggle.hidden=!allowed;toggle.setAttribute('aria-pressed',String(editing));toggle.textContent=editing?'Bearbeitung beenden':'Bearbeitungsmodus';}
  document.body.classList.toggle('is-editing',editing);
 }
 toggle?.addEventListener('click',()=>{if(saving||dialog.open)return;editing=!editing;mount();});
 function control(key,spec,value){
  const wrapper=document.createElement('div'),label=document.createElement('label');label.htmlFor='field-'+key;label.textContent=spec.label;
  const input=document.createElement(spec.type==='textarea'?'textarea':spec.type==='select'?'select':'input');input.id=label.htmlFor;input.name=key;
  if(spec.type==='select')for(const [value,text]of Object.entries(spec.options)){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
  else if(spec.type==='textarea')input.rows=5;else input.type=spec.type;
  if(spec.max)input.maxLength=spec.max;if(spec.min){input.minLength=spec.min;input.required=true;}
  if(spec.type==='number'){input.min=1;input.max=31;input.step=1;}
  if(spec.type==='checkbox')input.checked=!!value;else input.value=spec.type==='time'?(value?.slice(0,5)||''):(value??'');
  wrapper.append(label,input);inputs.append(wrapper);
 }
 function open(kind,field,id){
  if(!editing||!canEdit(kind,id)||saving)return;
  const row=kind==='event'?event():items().find(i=>i.id===id),spec=(kind==='event'?eventFieldSpecs:programFieldSpecs)[field];if(!row||!spec)return;
  const fields=field==='schedule'?scheduleFields:[field];
  active={kind,field,id:row.id,expected:Object.fromEntries(fields.map(key=>[key,row[key]??null]))};
  inputs.replaceChildren();error.textContent='';dialog.querySelector('h2').textContent=spec.label+' bearbeiten';
  if(field==='schedule'){
   control('day_number',{label:'Reisetag (optional)',type:'number'},row.day_number);
   control('start_time',{label:'Von',type:'time'},row.start_time);control('end_time',{label:'Bis',type:'time'},row.end_time);
   control('ends_next_day',{label:'Ende am nächsten Tag',type:'checkbox'},row.ends_next_day);
   control('time_label',{label:'Hinweis zur Zeit',type:'text',max:80},row.time_label);
  }else control(field,spec,row[field]);
  dialog.showModal();inputs.querySelector('input,textarea,select')?.focus();
 }
 function mount(){
  syncMode();
  document.querySelectorAll('[data-event-field],[data-program-field]').forEach(node=>{
   node.querySelectorAll('.field-pencil,.field-empty-hint').forEach(b=>b.remove());node.classList.remove('has-field-pencil');
   const kind=node.dataset.eventField?'event':'program',field=node.dataset.eventField||node.dataset.programField;
   const spec=(kind==='event'?eventFieldSpecs:programFieldSpecs)[field];if(!spec)return;
   const id=kind==='event'?event()?.id:node.closest('[data-program-id]')?.dataset.programId;if(!editing||!id||!canEdit(kind,id))return;
   if(!node.textContent.trim()){const hint=document.createElement('span');hint.className='field-empty-hint';hint.textContent=spec.label+' ergänzen';node.append(hint);}
   node.classList.add('has-field-pencil');const button=document.createElement('button');button.type='button';button.className='field-pencil';button.innerHTML=pencil;button.title=spec.label+' bearbeiten';button.setAttribute('aria-label',button.title);button.addEventListener('click',()=>open(kind,field,id));node.append(button);
  });
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!active||saving||!canEdit(active.kind,active.id))return;saving=true;onBusy(true);error.textContent='';
  const buttons=dialog.querySelectorAll('button,input,textarea,select');buttons.forEach(b=>b.disabled=true);
  try{
   const values={};inputs.querySelectorAll('input,textarea,select').forEach(input=>{values[input.name]=input.type==='checkbox'?input.checked:input.value;});
   const patch=fieldPatch(active.kind,active.field,values);
   const result=await client().rpc('save_event_content_fields',{p_kind:active.kind,p_id:active.id,p_patch:patch,p_expected:active.expected});
   if(result.error)throw result.error;
   await onSaved(active.kind,result.data);dialog.close();
  }catch(e){error.textContent='Nicht gespeichert: '+(e.message||String(e));}
  finally{saving=false;onBusy(false);buttons.forEach(b=>b.disabled=false);}
 });
 dialog.querySelector('[data-cancel]').addEventListener('click',()=>{if(!saving)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 dialog.addEventListener('close',()=>{
  if(!active)return;
  [...document.querySelectorAll('[data-event-field],[data-program-field]')].find(node=>active.kind==='event'?node.dataset.eventField===active.field:node.dataset.programField===active.field&&node.closest('[data-program-id]')?.dataset.programId===active.id)?.querySelector('.field-pencil')?.focus();
 });
 return {mount};
}
