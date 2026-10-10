import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const code=fs.readFileSync(new URL('profile.js',root),'utf8');
const html=fs.readFileSync(new URL('einstellungen.html',root),'utf8');
async function profilePage(search,session){
 const elements=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,{hidden:true,value:'',textContent:'',reportValidity:()=>true}]));
 const calls=[];
 const stored={full_name:'Test Member',nickname:'Test Nick',email:'private@example.test',login_email:'',login_email_confirmed:false};
 const sb={auth:{getSession:async()=>({data:{session}}),updateUser:async(...args)=>{calls.push(['email',...args]);return {data:{}};}},rpc:async(name,args)=>{
  calls.push([name,args]);if(name==='save_kufstein_profile')Object.assign(stored,{full_name:args.p_full_name,nickname:args.p_nickname,email:args.p_email});return {data:{...stored}};
 }};
 const context=vm.createContext({URLSearchParams,document:{getElementById:id=>{assert.ok(elements[id],'Unknown profile element '+id);return elements[id];}},window:{supabase:{createClient:()=>sb}},location:{search,origin:'https://thomasmarlin512.github.io'},localStorage:{getItem:()=>null,setItem:()=>{}}});
 vm.runInContext(code,context);await new Promise(resolve=>setImmediate(resolve));
 return {elements,calls,context};
}
let page=await profilePage('?event=kufstein-2026',null);
assert.equal(page.elements['profile-event-back'].href,'/kufstein-2026/');
assert.equal(page.elements['login-link'].href,'index.html?return=profil&event=kufstein-2026');
assert.equal(page.elements['login-help'].hidden,false);assert.equal(page.calls.length,0);
page=await profilePage('?event=https%3A%2F%2Fexample.test%2F',null);
assert.ok(page.elements['profile-event-back'].href.startsWith('event.html?id='),'Return must stay within event template');
page=await profilePage('',{user:{id:'self'}});
assert.equal(page.elements['full-name'].value,'Test Member');assert.equal(page.elements.content.hidden,false);
page.elements['full-name'].value='Updated Name';page.elements.nickname.value='New Nick';
await page.elements['profile-form'].onsubmit({preventDefault(){}});
assert.equal(page.calls.at(-1)[1].p_nickname,'New Nick');assert.equal(page.elements['full-name'].value,'Updated Name');
assert.equal(page.elements['save-profile'].disabled,false);
// This stub checks the existing confirmation target; no email is sent.
await page.elements['link-email'].onclick();
assert.equal(page.calls.at(-1)[2].emailRedirectTo,'https://thomasmarlin512.github.io/kufstein-2026/einstellungen.html');
console.log('PASS: settings load/save, login return, event return stays local, existing email callback target retained');
