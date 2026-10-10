import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {extractImages,loadPage,publicUrl} from './preview-core.mjs';
const cors={'Access-Control-Allow-Origin':'https://thomasmarlin512.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const limits=new Map<string,{count:number,until:number}>();
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST erforderlich.'},405);
 try {
  const token=req.headers.get('Authorization')||'';
  const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
  const {data,error}=await sb.auth.getUser(token.replace(/^Bearer\s+/i,''));
  if(error||!data.user)return reply({error:'Bitte anmelden.'},401);
  const membership=await sb.rpc('is_group_member');
  if(membership.error||membership.data!==true)return reply({error:'Nur für Gruppenmitglieder.'},403);
  const now=Date.now(),old=limits.get(data.user.id),limit=old&&old.until>now?old:{count:0,until:now+60000};
  if(++limit.count>15)return reply({error:'Bitte eine Minute warten.'},429);
  limits.set(data.user.id,limit);
  for(const [key,value] of limits)if(value.until<now)limits.delete(key);
  const body=await req.text();if(body.length>4096)return reply({error:'Link zu lang.'},400);
  const input=JSON.parse(body),url=publicUrl(input.url).href;
  const page=await loadPage(url);
  return reply(extractImages(page.html,page.url));
 }catch(error){return reply({error:error instanceof Error?error.message:'Keine Vorschau verfügbar.'},400);}
});
