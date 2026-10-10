// No live database writes. Run: node --experimental-vm-modules tests/webmcp.test.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const adapter=await fs.readFile(new URL('webmcp-tools.js',root),'utf8');
const hub=adapter.includes('export function installHubTools');
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
async function environment({supported=true,page=true,registrationFails=false}={}) {
 const db={
  group_members:[{user_id:'u1',display_name:'Mein Name',email:'never-output@example.com'},{user_id:'u2',display_name:'Andere Person'}],
  trip_attendance:[{user_id:'u1',roster_key:'m1',nickname:'Mein Name',status:'maybe'},{user_id:'u2',roster_key:'m2',nickname:'Andere Person',status:'yes'}],
  group_people:[{id:'p1',member_key:'m1',full_name:'Mein Vollname'},{id:'p2',member_key:'m2',full_name:'Anderer Vollname'},{id:'p3',member_key:null,full_name:'Noch ohne Konto'}],
  group_events:[{id:'trip',title:'Testreise',status:'planning',default_participation:'maybe',created_by_key:'m1'}],
  group_event_dates:[{id:'date1',event_id:'trip',start_date:'2026-12-01',end_date:'2026-12-02'}],
  group_date_votes:[],group_event_attendance:[],votes:[],
  organization_tasks:[{id:'task1',label:'Hotel klären',completed:false}]
 };
 const state={session:'u1',ready:true,failTable:null,failWrite:false,uiFail:false,busy:false,writes:[],rendered:0,prepared:null};
 const client={auth:{getSession:async()=>({data:{session:state.session?{user:{id:state.session}}:null},error:null})},
  from(table) {
   let filter=[],operation='read',value,conflict,fields='*',one=false;
   const query={
    select(s='*'){fields=s;return this;},order(){return this;},eq(k,v){filter.push([k,v]);return this;},
    single(){one=true;return this;},maybeSingle(){one=true;return this;},
    upsert(v,o){operation='upsert';value=v;conflict=o.onConflict.split(',');return this;},
    update(v){operation='update';value=v;return this;},
    then(resolve,reject){return Promise.resolve().then(()=>{
     if(state.failTable===table||(operation!=='read'&&state.failWrite))return {data:null,error:{message:'secret database error'}};
     let selected=db[table].filter(row=>filter.every(([k,v])=>row[k]===v));
     if(operation==='upsert'){
      let row=db[table].find(row=>conflict.every(k=>row[k]===value[k]));
      if(row)Object.assign(row,value);else{row={...value};db[table].push(row);}selected=[row];
     } else if(operation==='update')selected.forEach(row=>Object.assign(row,value));
     if(operation!=='read')state.writes.push({table,value:{...value},filter});
     const result=selected.map(row=>fields==='*'?{...row}:Object.fromEntries(fields.split(',').map(k=>[k,row[k]])));
     return {data:one?(result[0]||null):result,error:null};
    }).then(resolve,reject);}
   };return query;
  },
  async rpc(name,input){
   if(state.failWrite)return {data:null,error:{message:'private error'}};
   db.organization_tasks.find(t=>t.id===input.p_id).completed=input.p_completed;
   state.writes.push({rpc:name,input});return {data:null,error:null};
  }
 };
 const registered=new Map(),listeners={};
 const modelContext={registerTool(tool,{signal}){
  if(registrationFails)throw Error('unsupported implementation');
  if(registered.has(tool.name))throw Error('duplicate registration');
  registered.set(tool.name,tool);signal.addEventListener('abort',()=>registered.delete(tool.name));
 }};
 function render(){if(state.uiFail)throw Error('view failed');state.rendered++;}
 const context=vm.createContext({console:{warn(){}},AbortController,URL,Date,
  document:{modelContext:supported?modelContext:undefined,getElementById:id=>page&&['programm','task-list','hotel','anreise','restaurantstatus'].includes(id)?{querySelectorAll:()=>[{textContent:'Bestehender Reiseplan'}]}:null},
  addEventListener:(name,callback)=>(listeners[name]||=[]).push(callback),
  location:{href:'https://example.test/kufstein-2026/index.html'},sb:client,authUser:{id:'u1'},groupJoined:true,
  events:[{id:'festung',title:'Festung',time:'Sa 13:00',cost:'6,50 €'}],members:{},namedVotes:{},liveCounts:{},state:{},
  render,save(){},renderTasks:render,taskBusy:false,taskRows:[],attendanceBusy:false,
  renderParticipantList:page?render:undefined,tripRoster:[]
 });
 const cache=new Map();
 async function module(name){
  if(cache.has(name))return cache.get(name);
  const source=await fs.readFile(new URL(name,root),'utf8');
  const result=new vm.SourceTextModule(source,{context,identifier:name});cache.set(name,result);
  await result.link(spec=>module(spec.replace('./','')));return result;
 }
 const mod=await module('webmcp-tools.js');await mod.evaluate();
 if(hub)mod.namespace.installHubTools({client:()=>client,userId:()=>context.authUser?.id,ready:()=>state.ready,
  busy:()=>state.busy,setBusy:value=>{state.busy=value;},today:()=> '2026-10-10',eventUrl:e=>'https://example.test/event.html?id='+e.id,
  apply:render,prepare:page?input=>{state.prepared=input;}:null});
 return {db,state,registered,context,listeners,call:(name,input={})=>{
  const tool=registered.get(name);assert.ok(tool,'tool registered: '+name);return tool.execute(input);
 }};
}
const prefix=hub?'geiladachtzger':'kufstein';
const read=hub?'geiladachtzger_list_events':'kufstein_get_activities';
const e=await environment();
check(e.registered.size===(hub?5:7),'all page tools registered');
check((await environment({supported:false})).registered.size===0,'unsupported browsers unaffected');
check((await environment({registrationFails:true})).registered.size===0,'registration failures isolated');
check((await environment({page:false})).registered.size===4,'secondary page tool surface');
const before=e.registered.size;e.listeners.pageshow[0]();check(e.registered.size===before,'no duplicate registration');
e.listeners.pagehide[0]();check(e.registered.size===0,'unregister on pagehide');
e.listeners.pageshow[0]();check(e.registered.size===before,'restore on bfcache pageshow');
check((await e.call(read,null)).error.code==='INVALID_INPUT','invalid object rejected');
check((await e.call(read,{user_id:'u2'})).error.code==='INVALID_INPUT','unknown identity field rejected');
e.state.session=null;check((await e.call(read)).error.code==='LOGIN_REQUIRED','signed out denied');
e.state.session='u2';check((await e.call(read)).error.code==='LOGIN_REQUIRED','session change denied');
e.state.session='u1';const member=e.db.group_members.shift();check((await e.call(read)).error.code==='LOGIN_REQUIRED','nonmember denied');e.db.group_members.unshift(member);
const result=await e.call(read);check(result.ok&&e.state.rendered>0,'fresh read updates view');
check(!JSON.stringify(result).includes('never-output'),'no private fields exposed');
const vote=hub?'geiladachtzger_vote_date':'kufstein_vote_activity';
const args=hub?{option_id:'date1',choice:'yes'}:{activity_id:'festung',choice:'yes'};
check((await e.call(vote,{...args,choice:'bogus'})).error.code==='INVALID_INPUT','choice validated');
check((await e.call(vote,{...args,member_key:'m2'})).error.code==='INVALID_INPUT','cannot vote as another member');
e.state.failWrite=true;const failed=await e.call(vote,args);check(!failed.ok&&!JSON.stringify(failed).includes('secret'),'write failure not reported as saved');e.state.failWrite=false;
const saved=await e.call(vote,args);check(saved.ok&&saved.status==='saved'&&saved.ui_updated,'confirmed write and UI');
check((hub?e.state.writes.at(-1).value.member_key:e.state.writes.at(-1).value.user_id)===(hub?'m1':'u1'),'write uses current account');
await e.call(vote,{...args,choice:'no'});check(e.db[hub?'group_date_votes':'votes'].length===1,'repeat vote updates existing row');
e.state.uiFail=true;const partial=await e.call(vote,args);check(partial.ok&&partial.status==='saved'&&!partial.ui_updated,'saved state distinguished from UI failure');e.state.uiFail=false;
const attendance=await e.call(prefix+'_set_my_attendance',hub?{event_id:'trip',status:'no'}:{status:'no'});
check(attendance.ok&&attendance.attendance==='no','own attendance persisted');
check(e.db.trip_attendance.find(p=>p.user_id==='u2').status==='yes','other attendance unchanged');
if(hub){
 e.db.group_events[0].status='confirmed';check((await e.call(vote,args)).error.code==='VOTING_CLOSED','closed voting blocked');e.db.group_events[0].status='planning';
 e.db.group_event_dates[0].end_date='2026-01-01';check((await e.call(vote,args)).error.code==='VOTING_CLOSED','past voting blocked');
 const draft={title:'Neue Reise',kind:'trip',dates:[{start_date:'2026-12-01',end_date:'2026-12-02'}]};
 const writes=e.state.writes.length;check((await e.call('geiladachtzger_prepare_event',draft)).status==='prepared','draft prepared');
 check(e.state.writes.length===writes,'preparation does not write database');
 check(!(await e.call('geiladachtzger_prepare_event',{...draft,dates:[{start_date:'2026-02-30',end_date:'2026-12-02'}]})).ok,'impossible calendar date rejected');
 const detail=await e.call('geiladachtzger_get_event',{event_id:'trip'});check(detail.participants.some(p=>p.source==='default'),'default attendance identified');
}else{
 const people=await e.call('kufstein_get_participants');check(people.participants.length===3&&people.participants.some(p=>p.source==='default'),'participants matched without double counting');
 check(!JSON.stringify(people).includes('user_id')&&!JSON.stringify(people).includes('roster_key'),'internal member identifiers omitted');
 const task=await e.call('kufstein_set_task_completed',{task_id:'task1',completed:true});check(task.ok&&task.completed,'task RPC verified');
 check((await e.call('kufstein_set_task_completed',{task_id:'missing',completed:true})).error.code==='NOT_FOUND','unknown task blocked');
 check((await e.call('kufstein_get_trip_plan')).sections.programm[0]==='Bestehender Reiseplan','plan uses page content');
}
console.log(`${prefix}: ${checks} checks passed`);
