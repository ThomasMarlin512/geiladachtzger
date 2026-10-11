const siteOrigin='https://thomasmarlin512.github.io';
const headers={
 'Access-Control-Allow-Origin':siteOrigin,
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Content-Type':'application/json',
 'Cache-Control':'no-store',
 'Vary':'Origin'
};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
async function readBody(req){
 const reader=req.body?.getReader();if(!reader)throw Error('body');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>4096){await reader.cancel();throw Error('body');}chunks.push(value);
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function createLoginHandler(admin){
 return async req=>{
  const origin=req.headers.get('origin');
  if(origin&&origin!==siteOrigin)return reply({error:'Diese Herkunft ist nicht erlaubt.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'POST erforderlich.'},405);
  try{
   const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
   if(!token)return reply({error:'Bitte die Seite neu laden.'},401);
   const user=await admin.auth.getUser(token);
   if(user.error||!user.data?.user?.id)return reply({error:'Bitte die Seite neu laden.'},401);
   let body;try{body=await readBody(req);}catch{return reply({error:'Ungültige Eingabe.'},400);}
   const name=typeof body.name==='string'?body.name.trim():'',code=typeof body.code==='string'?body.code.trim():'';
   if(name.length<2||name.length>254||code.length<4||code.length>64||new TextEncoder().encode(code).length>72)
    return reply({error:'Bitte Name, Nickname oder E-Mail und einen Code mit 4 bis 64 Zeichen eingeben.'},400);
   const network=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||user.data.user.id;
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(network));
   const clientKey=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   const result=await admin.rpc('login_with_member_code',{
    p_name:name,p_code:code,p_requester:user.data.user.id,p_client_key:clientKey
   });
   if(result.error)return reply({error:'Die Anmeldung ist gerade nicht verfügbar. Bitte erneut versuchen.'},503);
   if(!result.data?.ok)return reply({error:result.data?.error||'Anmeldung fehlgeschlagen.'},result.data?.limited?429:400);
   if(result.data.mode==='email'){
    const link=await admin.auth.admin.generateLink({type:'magiclink',email:result.data.email});
    if(link.error||link.data?.user?.id!==result.data.user_id||!link.data?.properties?.hashed_token)
     return reply({error:'Die Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.'},503);
    // generateLink sends no email. The browser exchanges this one-use token for
    // the same account's session, preserving verified email and administrator rights.
    return reply({ok:true,token_hash:link.data.properties.hashed_token});
   }
   if(result.data.mode!=='member')return reply({error:'Anmeldung fehlgeschlagen.'},503);
   return reply({ok:true});
  }catch{return reply({error:'Die Anmeldung ist gerade nicht verfügbar. Bitte erneut versuchen.'},503);}
 };
}
