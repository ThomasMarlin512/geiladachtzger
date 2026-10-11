const DAY=86400000;
const date=value=>new Date(value+'T12:00:00Z');
const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(date(value).getTime())&&date(value).toISOString().slice(0,10)===value;
export function tripDays(event={},proposals=[]){
 const fixed=valid(event.start_date)&&valid(event.end_date)&&event.end_date>=event.start_date;
 const length=(start,end)=>Math.round((date(end)-date(start))/DAY)+1;
 const count=fixed?length(event.start_date,event.end_date):Math.max(0,...proposals.filter(p=>p.event_id===event.id&&valid(p.start_date)&&valid(p.end_date)&&p.end_date>=p.start_date).map(p=>length(p.start_date,p.end_date)));
 const format=new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
 return {fixed,days:Array.from({length:Math.min(31,count)},(_,index)=>({value:index+1,label:fixed?format.format(new Date(date(event.start_date).getTime()+index*DAY)):(index+1)+'. Reisetag · Datum noch offen'}))};
}
export function fillTripDaySelect(select,event,proposals=[],value=null){
 const {fixed,days}=tripDays(event,proposals);select.replaceChildren();
 const add=(value,label,disabled=false)=>{const option=document.createElement('option');option.value=String(value);option.textContent=label;option.disabled=disabled;select.append(option);};
 add('','Tag noch offen');for(const day of days)add(day.value,day.label);
 if(value&&!days.some(d=>d.value===Number(value)))add(value,'Bisher: Tag '+value+' · außerhalb des Reisezeitraums',true);
 select.value=value??'';
 return fixed?'Die Tage entsprechen eurem festgelegten Reisetermin.':days.length?'Bis der Termin feststeht, planst du mit relativen Reisetagen.':'Ergänzt zuerst einen Terminvorschlag, um Reisetage auszuwählen.';
}
export function validateActivitySchedule(value,event,proposals=[]){
 const day=value.day_number===''||value.day_number==null?null:Number(value.day_number);
 const start=value.start_time?.slice(0,5)||null,end=value.end_time?.slice(0,5)||null,next=!!value.ends_next_day;
 const {days}=tripDays(event,proposals);
 if(day!==null&&(!Number.isInteger(day)||!days.some(d=>d.value===day)))throw Error('Bitte einen Tag aus dem Reisezeitraum auswählen oder „Tag noch offen“ wählen.');
 for(const time of [start,end])if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Bitte eine gültige Uhrzeit eingeben.');
 if(end&&!start)throw Error('Bitte auch eine Beginnzeit eingeben.');
 if(next&&(!start||!end))throw Error('Für ein Ende am nächsten Tag bitte Von und Bis ausfüllen.');
 if(start&&end&&end<start&&!next)throw Error('Ende liegt vor Beginn. Bei einem Termin über Mitternacht „Ende am nächsten Tag“ wählen.');
 if(day&&next&&day>=days.length)throw Error('Das Ende am nächsten Tag liegt außerhalb eures Reisezeitraums.');
 return {day_number:day,start_time:start,end_time:end,ends_next_day:next};
}
