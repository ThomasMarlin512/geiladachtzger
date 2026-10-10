// Calendar presentation only. Votes are saved by the existing authenticated app.
const viewState = new Map();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols = {yes:'✓', maybe:'?', no:'×', pending:'•'};
const answers = {yes:'Passt', maybe:'Vielleicht', no:'Geht nicht', pending:'Noch offen'};
const isoDay = date => date.toISOString().slice(0,10);
const monthNumber = value => Number(value.slice(0,4))*12 + Number(value.slice(5,7))-1;
const monthDate = number => new Date(Date.UTC(Math.floor(number/12),number%12,1));
const monthTitle = number => new Intl.DateTimeFormat('de-AT',{month:'long',year:'numeric',timeZone:'UTC'}).format(monthDate(number));
const shortDate = value => value.slice(8,10)+'.'+value.slice(5,7)+'.';

export function monthDays(month) {
 const first = monthDate(month);
 const offset = (first.getUTCDay()+6)%7;
 const days = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+days)/7)*7},(_,index)=>{
  const date = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),index-offset+1));
  return {iso:isoDay(date),number:date.getUTCDate(),inMonth:index>=offset&&index<offset+days};
 });
}

export function votingCalendar(event, allOptions, allVotes, memberKey, people, renderCard) {
 const dates = allOptions.filter(d=>d.event_id===event.id).sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.end_date.localeCompare(b.end_date));
 if(!dates.length)return '<div class="empty">Noch keine Terminvorschläge.</div>';
 const firstMonth = monthNumber(dates[0].start_date);
 const lastMonth = Math.max(...dates.map(d=>monthNumber(d.end_date)));
 let state = viewState.get(event.id);
 if(!state){state={month:firstMonth,selected:dates[0].id,openVotes:false};viewState.set(event.id,state);}
 state.month = Math.min(lastMonth,Math.max(firstMonth,state.month));
 if(!dates.some(d=>d.id===state.selected))state.selected=dates[0].id;
 const monthStart = isoDay(monthDate(state.month));
 const monthEnd = isoDay(new Date(Date.UTC(Math.floor((state.month+1)/12),(state.month+1)%12,0)));
 const visibleDates = dates.filter(d=>d.start_date<=monthEnd&&d.end_date>=monthStart);
 let selected = visibleDates.find(d=>d.id===state.selected)||visibleDates[0];
 if(selected)state.selected=selected.id;
 const voteRows = option => allVotes.filter(v=>v.option_id===option.id);
 const ownChoice = option => voteRows(option).find(v=>v.member_key===memberKey)?.choice || 'pending';
 const counts = option => {
  const rows=voteRows(option),keys=new Set([...people.map((p,i)=>p.member_key||'pending:'+(p.id||i)),...rows.map(r=>r.member_key)]);
  const result={yes:0,maybe:0,no:0,pending:0,total:keys.size};
  for(const row of rows)if(row.choice in answers && row.choice!=='pending')result[row.choice]++;
  result.pending=Math.max(0,result.total-rows.length);
  return result;
 };
 const dayCells=monthDays(state.month).map(day=>{
  const matches=dates.filter(d=>d.start_date<=day.iso&&d.end_date>=day.iso);
  const option=matches.find(d=>d.id===selected?.id)||matches[0];
  if(!day.inMonth||!option)return '<span class="vc-day '+(!day.inMonth?'vc-outside':'vc-unavailable')+'" aria-hidden="true">'+day.number+'</span>';
  const choice=ownChoice(option),active=option.id===selected?.id;
  const label=new Intl.DateTimeFormat('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day.iso+'T12:00:00Z'));
  const range=shortDate(option.start_date)+'–'+shortDate(option.end_date);
  return '<button type="button" class="vc-day vc-proposed vc-'+choice+(active?' vc-active':'')+'" data-cal-option="'+escapeHtml(option.id)+'" data-cal-start="'+option.start_date+'" data-cal-day="'+day.iso+'" aria-pressed="'+active+'" aria-label="'+escapeHtml(label+' · Reise '+range+' · Deine Antwort: '+answers[choice]+(matches.length>1?' · Mehrere Vorschläge an diesem Tag; alle Zeiträume stehen unter dem Kalender.':''))+'"><span>'+day.number+'</span><small aria-hidden="true">'+symbols[choice]+'</small></button>';
 }).join('');
 let panel='<div class="empty">In diesem Monat gibt es keine Terminvorschläge. Wähle einen anderen Monat oder einen Zeitraum unten.</div>';
 if(selected){
  const count=counts(selected),choice=ownChoice(selected);
  const segments=['yes','maybe','no','pending'].filter(key=>count[key]>0).map(key=>'<span class="vc-bar-'+key+'" style="width:'+(100*count[key]/(count.total||1))+'%"></span>').join('');
  const summary=count.yes+' passt · '+count.maybe+' vielleicht · '+count.no+' geht nicht · '+count.pending+' offen';
  const card=renderCard(selected.id).replace('<details class="vote-people">','<details class="vote-people"'+(state.openVotes?' open':'')+'>');
  panel='<section class="vc-vote-panel" aria-label="Abstimmung für den ausgewählten Reisezeitraum"><p class="eyebrow">AUSGEWÄHLTER REISEZEITRAUM</p>'+card+'<div class="vc-group-result"><p>Stand der Gruppe</p><div class="vc-bar" role="img" aria-label="'+summary+'">'+segments+'</div><div class="vc-counts"><span class="vc-text-yes">✓ '+count.yes+' passt</span><span class="vc-text-maybe">? '+count.maybe+' vielleicht</span><span class="vc-text-no">× '+count.no+' geht nicht</span><span>'+count.pending+' offen</span></div><p class="vc-own-answer">Deine Antwort: <strong>'+answers[choice]+'</strong></p></div></section>';
 }
 const choices=dates.map(option=>{
  const count=counts(option),choice=ownChoice(option),active=option.id===selected?.id;
  return '<button type="button" class="vc-option '+(active?'vc-option-active':'')+'" data-cal-option="'+escapeHtml(option.id)+'" data-cal-start="'+option.start_date+'" aria-pressed="'+active+'"><span class="vc-option-date">'+shortDate(option.start_date)+'–'+shortDate(option.end_date)+(option.start_date.slice(0,4)!==option.end_date.slice(0,4)?' '+option.start_date.slice(0,4)+'/'+option.end_date.slice(0,4):' '+option.start_date.slice(0,4))+'</span><span class="vc-option-count">✓ '+count.yes+' · ? '+count.maybe+' · × '+count.no+' · '+count.pending+' offen</span><span class="vc-option-own vc-text-'+choice+'">'+symbols[choice]+' '+answers[choice]+'</span></button>';
 }).join('');
 return '<div class="vote-calendar" data-calendar-event="'+escapeHtml(event.id)+'"><p class="vc-intro">Markierten Zeitraum auswählen, dann abstimmen. Deine Antwort gilt für die gesamte Reise.</p><div class="vc-layout"><div class="vc-month"><div class="vc-month-header"><button type="button" class="vc-nav" data-cal-month="'+(state.month-1)+'" aria-label="Vorheriger Monat" '+(state.month===firstMonth?'disabled':'')+'>‹</button><h4 tabindex="-1">'+monthTitle(state.month)+'</h4><button type="button" class="vc-nav" data-cal-month="'+(state.month+1)+'" aria-label="Nächster Monat" '+(state.month===lastMonth?'disabled':'')+'>›</button></div><div class="vc-weekdays" aria-hidden="true">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="vc-days" role="group" aria-label="'+monthTitle(state.month)+' – Reisezeiträume auswählen">'+dayCells+'</div><div class="vc-legend"><span>Deine Antwort:</span><span class="vc-text-yes">✓ Passt</span><span class="vc-text-maybe">? Vielleicht</span><span class="vc-text-no">× Geht nicht</span><span>• Offen</span></div></div>'+panel+'</div><p class="vc-options-label">Alle Terminvorschläge</p><div class="vc-options" role="group" aria-label="Alle Terminvorschläge">'+choices+'</div></div>';
}

export function wireVotingCalendars(container, rerender, isBusy=()=>false) {
 container.querySelectorAll('[data-calendar-event]').forEach(calendar=>{
  const eventId=calendar.dataset.calendarEvent;
  calendar.querySelectorAll('[data-cal-option],[data-cal-month]').forEach(button=>button.addEventListener('click',()=>{
   if(isBusy())return;
   const state=viewState.get(eventId);
   if(!state)return;
   const optionId=button.dataset.calOption, day=button.dataset.calDay;
   if(optionId){
    if(state.selected!==optionId)state.openVotes=false;
    state.selected=optionId;
    // Keep the month for a day click on a range that spans two months.
    if(!day)state.month=monthNumber(button.dataset.calStart);
   }else state.month=Number(button.dataset.calMonth);
   rerender();
   const next=[...container.querySelectorAll('[data-calendar-event]')].find(el=>el.dataset.calendarEvent===eventId);
   const focus=optionId?[...next.querySelectorAll('[data-cal-option]')].find(el=>day?el.dataset.calDay===day:el.classList.contains('vc-option')&&el.dataset.calOption===optionId):next?.querySelector('h4');
   focus?.focus({preventScroll:true});
  }));
  calendar.querySelector('.vote-people')?.addEventListener('toggle',e=>{const state=viewState.get(eventId);if(state)state.openVotes=e.target.open;});
 });
}

export function selectCalendarDate(eventId,id,start) {
 viewState.set(eventId,{month:monthNumber(start),selected:id,openVotes:false});
}
