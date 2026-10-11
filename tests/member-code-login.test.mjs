import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLoginHandler} from '../supabase/functions/member-code-login/login-core.mjs';

let mode='email',valid=true,generated=0,seen;
const admin={auth:{getUser:async token=>token==='caller-token'?{data:{user:{id:'caller'}}}:{error:true},admin:{generateLink:async args=>{
 generated++;assert.equal(args.type,'magiclink');return {data:{user:{id:'target'},properties:{hashed_token:'one-use-token'}}};
}}},rpc:async(name,args)=>{
 assert.equal(name,'login_with_member_code');seen=args;
 return {data:valid?{ok:true,mode,user_id:'target',email:'private@example.invalid'}:{ok:false,error:'Ungültig',limited:true}};
}};
const handler=createLoginHandler(admin);
const request=(body={},token='caller-token')=>new Request('https://example.test/login',{
 method:'POST',headers:{authorization:'Bearer '+token,origin:'https://thomasmarlin512.github.io','content-type':'application/json'},
 body:JSON.stringify({name:'Nickname',code:'test-code',...body})
});
let response=await handler(request({p_requester:'forged-user'}));
assert.equal(response.status,200);let body=await response.json();
assert.deepEqual(body,{ok:true,token_hash:'one-use-token'});assert.equal(seen.p_requester,'caller');assert.equal(generated,1);
assert(!JSON.stringify(body).includes('private@example.invalid'),'Email is not returned to the browser');
mode='member';response=await handler(request());assert.deepEqual(await response.json(),{ok:true});assert.equal(generated,1);
valid=false;response=await handler(request());assert.equal(response.status,429);assert.equal(generated,1);
response=await handler(request({},'invalid'));assert.equal(response.status,401);
response=await handler(request({name:'x'.repeat(5000)}));assert.equal(response.status,400);
response=await handler(new Request('https://example.test/login',{method:'OPTIONS',headers:{origin:'https://other.test'}}));assert.equal(response.status,403);

// Confirm the client adopts the canonical native account, while ordinary members
// retain the existing session used by the server-side member recovery.
const source=readFileSync(new URL('../member-login.js',import.meta.url),'utf8');
let user=null,verified=0,anonymous=0,edge={ok:true,token_hash:'one-use-token'};
const client={auth:{getSession:async()=>({data:{session:user?{user}:null}}),signInAnonymously:async()=>{anonymous++;user={id:'anonymous'};return {data:{user}};},verifyOtp:async args=>{assert.equal(args.type,'email');assert.equal(args.token_hash,'one-use-token');verified++;user={id:'canonical'};return {data:{user}};}},functions:{invoke:async()=>({data:edge})}};
const context={window:{}};vm.runInNewContext(source,context);
assert.equal((await context.window.GroupMemberLogin.signIn(client,'Name','code')).id,'canonical');
assert.equal(anonymous,1);assert.equal(verified,1);
edge={ok:true};assert.equal((await context.window.GroupMemberLogin.signIn(client,'Name','code')).id,'canonical');assert.equal(verified,1);
assert(!source.includes('localStorage'));assert(!source.includes('console.'));
console.log('PASS: caller identity verified, code failures blocked, private email omitted, native Auth session preserved, and no code storage');
