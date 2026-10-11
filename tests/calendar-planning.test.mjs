import assert from 'node:assert/strict';
import {chooseRange,quickRange,describeRange,validDay,rangeSelection,addDays,monthIndex} from '../date-range-picker.js';
import {votingCalendar,selectCalendarDate,monthDays} from '../voting-calendar.js';
assert.equal(validDay('2027-02-29'),false);
assert.equal(validDay('2028-02-29'),true);
assert.equal(validDay('2027-13-01'),false);
assert.equal(addDays('2027-12-31',1),'2028-01-01');
assert.equal(addDays('2027-03-27',1),'2027-03-28','DST must not skip a day');
assert.deepEqual(chooseRange('','','2027-09-02'),{start:'2027-09-02',end:''});
assert.deepEqual(chooseRange('2027-09-02','','2027-09-05'),{start:'2027-09-02',end:'2027-09-05'});
assert.deepEqual(chooseRange('2027-09-05','','2027-09-02'),{start:'2027-09-02',end:'2027-09-05'},'Reverse selection keeps both clicked dates');
assert.deepEqual(chooseRange('2027-09-02','','2027-09-02'),{start:'2027-09-02',end:'2027-09-02'});
assert.deepEqual(chooseRange('2027-09-02','2027-09-05','2027-09-09'),{start:'2027-09-09',end:''});
assert.deepEqual(quickRange(monthIndex('2027-09-01'),4,3,'2026-10-11'),{start:'2027-09-02',end:'2027-09-05'});
assert.deepEqual(quickRange(monthIndex('2027-09-01'),4,3,'2027-09-03'),{start:'2027-09-09',end:'2027-09-12'},'Quick selection never starts in the past');
assert.deepEqual(quickRange(monthIndex('2027-12-01'),4,3,'2026-10-11','2027-12-30'),{start:'2027-12-30',end:'2028-01-02'});
assert.match(describeRange('2027-09-02','2027-09-05'),/Do.*So.*4 Tage \/ 3 Nächte/);
assert.match(describeRange('2027-09-02','2027-09-02'),/1 Tag$/);
assert.match(describeRange('2027-03-27','2027-03-29'),/3 Tage \/ 2 Nächte/);
assert.equal(rangeSelection('2026-10-01','2026-10-12','2026-10-11').valid,false);
assert.equal(rangeSelection('2027-09-05','2027-09-02','2026-10-11').valid,false);
assert.equal(rangeSelection('2027-09-02','2027-09-05','2026-10-11',[{start_date:'2027-09-02',end_date:'2027-09-05'}]).duplicate,true);
assert.equal(rangeSelection('2027-09-02','2027-09-05','2026-10-11',[{start_date:'2027-09-02',end_date:'2027-09-06'}]).duplicate,false);
const event={id:'calendar-test',status:'planning'},options=[
{id:'expired',event_id:event.id,start_date:'2026-01-01',end_date:'2026-01-04'},
{id:'answered',event_id:event.id,start_date:'2027-09-02',end_date:'2027-09-05'},
{id:'pending',event_id:event.id,start_date:'2027-11-04',end_date:'2027-11-07'},
{id:'overlap',event_id:event.id,start_date:'2027-11-05',end_date:'2027-11-07'},
{id:'crossing',event_id:event.id,start_date:'2027-12-30',end_date:'2028-01-02'}
];
const votes=[{option_id:'answered',member_key:'self',choice:'yes'},{option_id:'answered',member_key:'self',choice:'maybe'}];
const people=[{member_key:'self'},{member_key:'other'}];
const render=()=>votingCalendar(event,options,votes,'self',people,id=>'<article data-selected="'+id+'"></article>','2026-10-11');
let html=render();
assert(html.includes('data-selected="pending"'),'Start with the first unanswered range');
assert(!html.includes('expired'));
assert(!html.includes('Oktober 2027'),'Navigation skips months with no proposals');
assert(html.includes('November 2027'));assert(html.includes('Mehrere Vorschläge'));assert(html.includes('2×'));
selectCalendarDate(event.id,'crossing','2027-12-30');html=render();
assert(html.includes('Jänner 2028'));assert(html.includes('data-selected="crossing"'));
selectCalendarDate(event.id,'answered','2027-09-02');html=render();
assert(html.includes('0 passt · 1 vielleicht · 0 geht nicht · 1 offen'),'Votes counted once per member');
assert.equal(monthDays(monthIndex('2028-02-01')).filter(d=>d.inMonth).length,29);
assert.equal(votingCalendar(event,options.filter(o=>o.id==='expired'),[],null,[],()=>'', '2026-10-11').includes('data-calendar-event'),false);
console.log('PASS: day and range selection, leap years, DST, year changes, weekend shortcuts, duplicate rejection, pending-first voting, skipped empty months, overlapping ranges, and deduplicated counts');
