import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {wireImageFallbacks} from '../image-fallback.js';
import {coverImage} from '../event-layout.js';

class TestImage extends EventTarget{
 constructor(fallback,complete=false){
  super();this.attrs=new Map(Object.entries({src:'https://example.test/optimized.webp',srcset:'https://example.test/optimized.webp 960w',sizes:'100vw'}));
  if(fallback)this.attrs.set('data-image-fallback',fallback);
  this.ownerDocument={baseURI:'https://example.test/trip/'};
  this.complete=complete;this.naturalWidth=0;this.hidden=false;
 }
 getAttribute(key){return this.attrs.get(key)||null;}
 removeAttribute(key){this.attrs.delete(key);}
 get src(){return this.getAttribute('src');}
 set src(value){this.attrs.set('src',value);}
 fail(){this.dispatchEvent(new Event('error'));}
}
const root=image=>({querySelectorAll:()=>[image]});
let image=new TestImage('/original.jpg');
wireImageFallbacks(root(image));wireImageFallbacks(root(image));
image.fail();assert.equal(image.src,'https://example.test/original.jpg');
assert.equal(image.hidden,false,'Retry must remain visible');
assert.equal(image.getAttribute('srcset'),null,'Responsive selection must not request the failing file again');
assert.equal(image.getAttribute('sizes'),null);assert.equal(image.getAttribute('data-image-fallback'),null);
image.fail();assert.equal(image.hidden,true,'A second failure ends the retry');
image=new TestImage('/cached-original.jpg',true);wireImageFallbacks(root(image));
assert.equal(image.src,'https://example.test/cached-original.jpg','Catch errors that happened before the module loaded');
for(const fallback of [null,'javascript:alert(1)','http://example.test/image.jpg','https://user:secret@example.test/image.jpg','https://example.test/optimized.webp']){
 image=new TestImage(fallback);wireImageFallbacks(root(image));image.fail();
 assert.equal(image.src,'https://example.test/optimized.webp');assert.equal(image.hidden,true);
}
const original='https://thomasmarlin512.github.io/geiladachtzger/assets/covers/chiemsee.jpg';
assert.ok(coverImage({image:original},'cover').includes('data-image-fallback="'+original+'"'));

// Exercise the actual asynchronous vote handler with two distinct rendered areas.
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function voteDate('),app.indexOf('function renderEvent('));
for(const area of ['date-comparison','event-dates']){
 const focused=[],button={disabled:false,isConnected:false,closest:selector=>area==='event-dates'&&selector==='#event-dates'?{}:null};
 const containers=Object.fromEntries(['date-comparison','event-dates'].map(id=>[id,{querySelectorAll:()=>[{dataset:{option:'option-a',choice:'yes'},focus:options=>focused.push({id,options})}]}]));
 let saved,refreshed=false;
 const context={writeBusy:false,memberKey:'self',status:()=>{},$:id=>containers[id],refresh:async()=>{refreshed=true;},sb:{from:name=>{
  assert.equal(name,'group_date_votes');return {upsert:row=>{saved=row;return {select:()=>({single:async()=>({data:row})})};}};
 }}};
 vm.createContext(context);vm.runInContext(source,context);
 await context.voteDate('option-a','yes',button);
 assert.equal(saved.member_key,'self');assert.equal(saved.choice,'yes');assert.ok(refreshed);
 assert.equal(focused.length,1);assert.equal(focused[0].id,area);assert.equal(focused[0].options.preventScroll,true);
 assert.equal(context.writeBusy,false);
}
console.log('PASS: single image retry, cached failures, unsafe URLs rejected, and vote focus remains in its original area');
