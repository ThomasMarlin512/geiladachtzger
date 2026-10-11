import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {programCards,canEditProgram} from '../trip-program.js';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function openDeleteProgram('),source.indexOf('async function addProgram('));
const own={id:'owned',event_id:'trip',title:'Own <activity>',created_by_key:'stable-owner'},other={id:'other',event_id:'trip',title:'Other activity',created_by_key:'someone'};
for(const [key,admin,allowed] of [['stable-owner',false,true],['someone',false,false],['admin',true,true],[null,false,false]]){
 const html=programCards([own],[],[],{},key,()=>'',3,admin);
 assert.equal(html.includes('data-program-delete="owned"'),allowed);
 assert(!html.includes('Own <activity>'));
}
function setup({key='stable-owner',admin=false,error=null}={}){
 const nodes=new Map(),messages=[],calls=[],filters=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{open:false,disabled:false,focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll(){return [get('cancel-program-delete'),get('delete-submit')];}});return nodes.get(id);};
 const query={delete(){calls.push('delete');return this;},eq(k,v){filters.push([k,v]);return this;},select(){return this;},async single(){return error?{error}:{data:{id:filters.find(([k])=>k==='id')[1]}};}};
 const context={programItems:[{...own},{...other}],programVotes:[{item_id:'owned'},{item_id:'other'}],programLinks:[{item_id:'owned'},{item_id:'other'}],memberKey:key,canManageTexts:admin,canEditProgram,writeBusy:false,previewBusy:false,deletingProgram:null,removedProgramIds:new Set(),$:get,status:(message,id)=>messages.push([id,message]),renderEvent(){calls.push('render');},sb:{from(name){assert.equal(name,'group_program_items');return query;}}};
 vm.createContext(context);vm.runInContext(functions,context);return {context,get,messages,calls,filters};
}
const event={preventDefault(){}};
let t=setup({key:'someone'});t.context.openDeleteProgram('owned');assert.equal(t.get('program-delete-dialog').open,false);await t.context.deleteProgram(event);assert.equal(t.calls.length,0);
t=setup();t.context.openDeleteProgram('owned');assert.equal(t.calls.length,0,'Opening confirmation does not delete');assert.equal(t.get('program-delete-dialog').open,true);assert.equal(t.get('cancel-program-delete').focused,true);
// Cancel leaves everything intact.
t.get('program-delete-dialog').close();assert.equal(t.context.programItems.length,2);
t.context.openDeleteProgram('owned');await t.context.deleteProgram(event);assert.deepEqual(t.filters,[['id','owned'],['event_id','trip'],['title','Own <activity>']]);assert.equal(t.context.programItems.map(i=>i.id).join(','),'other');assert.equal(t.context.programVotes[0].item_id,'other');assert.equal(t.context.programLinks[0].item_id,'other');assert(t.context.removedProgramIds.has('owned'));assert.equal(t.get('program-delete-dialog').open,false);assert.equal(t.context.writeBusy,false);
t=setup({error:{message:'denied'}});t.context.openDeleteProgram('owned');await t.context.deleteProgram(event);assert.equal(t.context.programItems.length,2);assert.equal(t.get('program-delete-dialog').open,true);assert(t.messages.at(-1)[1].includes('denied'));assert.equal(t.get('delete-submit').disabled,false);
t=setup({key:'admin',admin:true});t.context.openDeleteProgram('owned');await t.context.deleteProgram(event);assert.equal(t.context.programItems.length,1);
t=setup();t.context.openDeleteProgram('owned');t.context.programItems[0].title='Changed';await t.context.deleteProgram(event);assert.equal(t.calls.length,0,'Changed item needs fresh confirmation');
t=setup();t.context.openDeleteProgram('owned');t.context.memberKey='someone';await t.context.deleteProgram(event);assert.equal(t.calls.length,0,'Permission rechecked on confirmation');
console.log('PASS: deletion controls, confirmation/cancel, scoped delete, own/admin access, stale/denied requests and local cleanup');
