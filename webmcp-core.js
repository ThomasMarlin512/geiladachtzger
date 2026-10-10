// Shared by the group hub and Kufstein. No credentials or new database privileges.
export const choiceSchema = {type:'string', enum:['yes','maybe','no']};
export const idSchema = {type:'string', minLength:1, maxLength:100};
export const schema = (properties={}, required=[]) => ({type:'object', properties, required, additionalProperties:false});
export function fail(code, message) {
 const error = new Error(message); error.toolCode = code; throw error;
}
export async function rows(query) {
 const result = await query;
 if(result.error) fail('DATABASE_ERROR','Daten konnten nicht geladen oder gespeichert werden. Bitte Verbindung und Anmeldung prüfen.');
 return result.data;
}
function validate(value, rule) {
 if(rule.type==='object') {
  if(!value || typeof value!=='object' || Array.isArray(value)) fail('INVALID_INPUT','Ein Objekt wird erwartet.');
  for(const key of Object.keys(value)) if(!Object.hasOwn(rule.properties,key)) fail('INVALID_INPUT','Unbekanntes Eingabefeld.');
  for(const key of rule.required||[]) if(!Object.hasOwn(value,key)) fail('INVALID_INPUT','Ein Pflichtfeld fehlt.');
  for(const [key,item] of Object.entries(value)) validate(item,rule.properties[key]);
 } else if(rule.type==='array') {
  if(!Array.isArray(value) || value.length<(rule.minItems||0) || value.length>rule.maxItems) fail('INVALID_INPUT','Ungültige Anzahl von Einträgen.');
  value.forEach(item=>validate(item,rule.items));
 } else if(typeof value!==rule.type || (rule.type==='string' && (value.trim().length<(rule.minLength||0) || value.length>(rule.maxLength??Infinity)))) {
  fail('INVALID_INPUT','Ungültiger Wert oder Textlänge.');
 }
 if(rule.enum && !rule.enum.includes(value)) fail('INVALID_INPUT','Dieser Wert ist nicht erlaubt.');
}
export async function requireMember(client, expectedUserId, ready) {
 if(!client || !expectedUserId || !ready) fail('LOGIN_REQUIRED','Bitte zuerst auf dieser Website mit deiner Gruppenanmeldung anmelden.');
 const {data,error} = await client.auth.getSession();
 if(error || data.session?.user?.id!==expectedUserId) fail('LOGIN_REQUIRED','Die Anmeldung hat sich geändert. Bitte die Seite neu laden und anmelden.');
 // Server-side membership and RLS remain authoritative; a local session alone is insufficient.
 const member = await rows(client.from('group_members').select('display_name').eq('user_id',expectedUserId).maybeSingle());
 if(!member) fail('LOGIN_REQUIRED','Für diese Anmeldung ist kein Gruppenbeitritt bestätigt.');
 return {id:expectedUserId,name:member.display_name};
}
export function installTools(tools) {
 let lifecycle;
 let pending=false;
 function register() {
  const context=document.modelContext || globalThis.navigator?.modelContext;
  if(!context?.registerTool || (lifecycle && !lifecycle.signal.aborted)) return;
  lifecycle=new AbortController();
  for(const tool of tools) {
   const definition={
    name:tool.name, title:tool.title, description:tool.description,
    inputSchema:tool.inputSchema,
    annotations:{readOnlyHint:!tool.write,untrustedContentHint:true},
    async execute(input) {
     try {
      validate(input,tool.inputSchema);
      if(pending) fail('BUSY','Eine andere Aktion läuft noch. Bitte danach erneut versuchen.');
      pending=true;
      try { return {ok:true,...await tool.run(input)}; }
      finally { pending=false; }
     } catch(error) {
      return {ok:false,error:{code:error.toolCode||'UNAVAILABLE',message:error.toolCode?error.message:'Die Aktion konnte nicht abgeschlossen werden. Bitte den Stand auf der Website prüfen.'}};
     }
    }
   };
   try { Promise.resolve(context.registerTool(definition,{signal:lifecycle.signal})).catch(()=>console.warn('WebMCP-Werkzeug nicht verfügbar:',tool.name)); }
   catch { console.warn('WebMCP-Werkzeug nicht verfügbar:',tool.name); }
  }
 }
 addEventListener('pagehide',()=>lifecycle?.abort());
 addEventListener('pageshow',register);
 register();
}
export async function savedResult(result, updateView) {
 try { await updateView(); return {status:'saved',...result,ui_updated:true}; }
 catch { return {status:'saved',...result,ui_updated:false,message:'Gespeichert. Die Anzeige konnte nicht aktualisiert werden; bitte Seite neu laden.'}; }
}
