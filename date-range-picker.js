// The picker only prepares dates. The existing form owns validation and saving.
const DAY=86400000;
const date=value=>new Date(value+'T12:00:00Z');
const iso=value=>value.toISOString().slice(0,10);
export const monthIndex=value=>Number(value.slice(0,4))*12+Number(value.slice(5,7))-1;
export const monthStart=month=>iso(new Date(Date.UTC(Math.floor(month/12),month%12,1,12)));
export const addDays=(value,count)=>iso(new Date(date(value).getTime()+count*DAY));
export const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(date(value).getTime())&&iso(date(value))===value;
export function describeRange(start,end){
 if(!validDay(start)||!validDay(end)||end<start)return '';
 const fmt=new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
 const nights=Math.round((date(end)-date(start))/DAY);
 return fmt.format(date(start))+(start===end?'': ' – '+fmt.format(date(end)))+' · '+(nights===0?'1 Tag':(nights+1)+' Tage / '+nights+' '+(nights===1?'Nacht':'Nächte'));
}
export function chooseRange(start,end,day){
 if(!validDay(day))throw Error('Ungültiger Kalendertag.');
 if(!start||end)return {start:day,end:''};
 return day<start?{start:day,end:start}:{start,end:day};
}
export function quickRange(month,weekday,nights,today,selected=''){
 let start=selected&&monthIndex(selected)===month&&selected>=today?selected:monthStart(month);
 if(start<today)start=today;
 start=addDays(start,(weekday-date(start).getUTCDay()+7)%7);
 return {start,end:addDays(start,nights)};
}
export function rangeSelection(start,end,today,options=[]){
 const valid=validDay(start)&&validDay(end)&&start>=today&&end>=start;
 return {start,end,valid,duplicate:valid&&options.some(o=>o.start_date===start&&o.end_date===end)};
}
export function mountDateRangePicker(root,{startInput,endInput,today,getOptions=()=>[],onChange=()=>{}}){
 if(!root||!startInput||!endInput)return null;
 let month=monthIndex(today()),touched=false,focusDay='',busy=false;
 const labels=['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
 root.classList.add('range-picker');
 function state(){return rangeSelection(startInput.value,endInput.value,today(),getOptions());}
 function setRange(range){startInput.value=range.start;endInput.value=range.end;month=monthIndex(range.start);focusDay=range.end||range.start;touched=true;render();}
 function render(){
  const active=root.contains(document.activeElement)?document.activeElement:null;
  const focusKey=active&&['data-rp-day','data-rp-month','data-rp-weekday','data-rp-single','data-rp-clear','data-rp-select-month','data-rp-select-year'].find(key=>active.hasAttribute(key));
  const restore=focusKey?'['+focusKey+(active.getAttribute(focusKey)?'="'+active.getAttribute(focusKey)+'"':'')+']':null;
  const s=state(),min=today(),existing=getOptions();
  startInput.min=min;endInput.min=s.start||min;
  if(!touched&&!s.start){const next=existing.filter(o=>o.end_date>=min).sort((a,b)=>a.start_date.localeCompare(b.start_date))[0];if(next)month=monthIndex(next.start_date<min?min:next.start_date);}
  const year=Math.floor(month/12),monthNum=month%12;
  const first=monthStart(month),offset=(date(first).getUTCDay()+6)%7;
  const days=Array.from({length:42},(_,i)=>addDays(first,i-offset));
  const minYear=Number(min.slice(0,4)),years=Array.from({length:Math.max(minYear+10,year)-minYear+1},(_,i)=>minYear+i);
  const focus=days.includes(focusDay)&&focusDay>=min?focusDay:days.includes(s.start)&&s.start>=min?s.start:days.find(d=>d>=min&&monthIndex(d)===month);
  const monthLabel=labels[monthNum]+' '+year;
  const message=s.duplicate?'Diesen Zeitraum gibt es bereits.':s.valid?describeRange(s.start,s.end):s.start?'Jetzt das Ende auswählen. Für einen Tag denselben Tag nochmals wählen.':'Wähle zuerst den Beginn, dann das Ende.';
  root.innerHTML='<div class="rp-heading"><strong>Zeitraum auswählen</strong><button type="button" class="rp-clear" data-rp-clear '+(!s.start&&!s.end?'disabled':'')+'>Zurücksetzen</button></div><div class="rp-shortcuts" role="group" aria-label="Zeitraum schnell auswählen"><span>Ab Auswahl / Monatsbeginn:</span>'+[[4,3,'Do–So'],[5,2,'Fr–So'],[6,1,'Sa–So']].map(([day,nights,text])=>'<button type="button" data-rp-weekday="'+day+'" data-rp-nights="'+nights+'">'+text+'</button>').join('')+'<button type="button" data-rp-single>1 Tag</button></div><div class="rp-month-nav"><button type="button" data-rp-month="'+(month-1)+'" aria-label="Vorheriger Monat" '+(month<=monthIndex(min)?'disabled':'')+'>‹</button><div class="rp-month-select"><select aria-label="Monat" data-rp-select-month>'+labels.map((label,i)=>'<option value="'+i+'" '+(i===monthNum?'selected':'')+'>'+label+'</option>').join('')+'</select><select aria-label="Jahr" data-rp-select-year>'+years.map(y=>'<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>').join('')+'</select></div><button type="button" data-rp-month="'+(month+1)+'" aria-label="Nächster Monat">›</button></div><div class="rp-weekdays" aria-hidden="true">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="rp-days" role="group" aria-label="'+monthLabel+'">'+days.map(day=>{
   const selected=day===s.start||day===s.end,between=s.start&&s.end&&day>s.start&&day<s.end,weekend=[0,6].includes(date(day).getUTCDay()),hasOption=existing.some(o=>o.start_date<=day&&o.end_date>=day);
   const label=new Intl.DateTimeFormat('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date(day));
   return '<button type="button" class="rp-day'+(monthIndex(day)!==month?' rp-outside':'')+(weekend?' rp-weekend':'')+(between?' rp-between':'')+(selected?' rp-selected':'')+(hasOption?' rp-existing':'')+'" data-rp-day="'+day+'" tabindex="'+(day===focus?'0':'-1')+'" aria-label="'+label+(day===s.start?' · Beginn':'')+(day===s.end?' · Ende':'')+(hasOption?' · Bereits vorgeschlagener Zeitraum':'')+'" aria-pressed="'+selected+'" '+(day===min?'aria-current="date" ':'')+(day<min?'disabled':'')+'>'+Number(day.slice(8))+'</button>';
  }).join('')+'</div><p class="rp-selection'+(s.duplicate?' rp-duplicate':'')+'" role="status" aria-live="polite">'+message+'</p>'+(existing.length?'<p class="rp-legend"><span aria-hidden="true">•</span> Punkt = bereits vorgeschlagener Zeitraum</p>':'');
  startInput.disabled=busy;endInput.disabled=busy;root.setAttribute('aria-busy',String(busy));
  if(busy)root.querySelectorAll('button,select').forEach(control=>control.disabled=true);
  onChange({...s,busy});
  if(restore&&!busy)(root.querySelector(restore)||root.querySelector('[data-rp-select-month]'))?.focus({preventScroll:true});
 }
 function focus(selector){root.querySelector(selector)?.focus({preventScroll:true});}
 root.addEventListener('click',e=>{
  const button=e.target.closest('button');if(busy||!button||!root.contains(button)||button.disabled)return;
  if(button.hasAttribute('data-rp-day')){const day=button.dataset.rpDay;setRange(chooseRange(startInput.value,endInput.value,day));month=monthIndex(day);render();focus('[data-rp-day="'+day+'"]');}
  else if(button.hasAttribute('data-rp-month')){month=Number(button.dataset.rpMonth);touched=true;render();focus('[data-rp-select-month]');}
  else if(button.hasAttribute('data-rp-weekday')){const day=button.dataset.rpWeekday;setRange(quickRange(month,Number(day),Number(button.dataset.rpNights),today(),startInput.value));focus('[data-rp-weekday="'+day+'"]');}
  else if(button.hasAttribute('data-rp-single')){const start=startInput.value||(monthStart(month)<today()?today():monthStart(month));setRange({start,end:start});focus('[data-rp-single]');}
  else if(button.hasAttribute('data-rp-clear')){startInput.value='';endInput.value='';render();focus('[data-rp-select-month]');}
 });
 root.addEventListener('change',e=>{
  if(busy||!e.target.matches('[data-rp-select-month],[data-rp-select-year]'))return;
  const selector=e.target.hasAttribute('data-rp-select-year')?'[data-rp-select-year]':'[data-rp-select-month]';
  month=Math.max(monthIndex(today()),Number(root.querySelector('[data-rp-select-year]').value)*12+Number(root.querySelector('[data-rp-select-month]').value));touched=true;render();focus(selector);
 });
 root.addEventListener('keydown',e=>{
  const day=e.target.dataset?.rpDay;if(busy||!day)return;
  const weekday=(date(day).getUTCDay()+6)%7,deltas={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday};
  if(!(e.key in deltas))return;e.preventDefault();
  focusDay=addDays(day,deltas[e.key]);if(focusDay<today())focusDay=today();month=monthIndex(focusDay);touched=true;render();focus('[data-rp-day="'+focusDay+'"]');
 });
 function inputChanged(which){
  touched=true;const start=startInput.value,end=endInput.value;
  if(which==='start'&&start&&end&&end<start)endInput.value='';
  const value=which==='start'?start:end;if(validDay(value))month=Math.max(monthIndex(today()),monthIndex(value));render();
 }
 startInput.addEventListener('change',()=>inputChanged('start'));endInput.addEventListener('change',()=>inputChanged('end'));
 render();
 return {refresh:render,getRange:state,setBusy(value){busy=value;render();},clear(){startInput.value='';endInput.value='';render();},reset(){touched=false;month=monthIndex(today());startInput.value='';endInput.value='';render();}};
}
