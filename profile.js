const PROFILE_URL='https://rzzipqdozabuxrmoxhlw.supabase.co';
const PROFILE_KEY='sb_publishable_4MsQNsSWj2VXmONSNim-zg__T2QeLV0';
const $=id=>document.getElementById(id);
let profileSb=null,currentProfile=null,profileBusy=false,loadingProfile=false;
function status(id,msg,error=false){$(id).textContent=msg;$(id).className='status '+(error?'err':'ok')}
function cacheNickname(nickname){
 try{const cache=JSON.parse(localStorage.getItem('kufstein_votes_v3')||'{}');cache.name=nickname;localStorage.setItem('kufstein_votes_v3',JSON.stringify(cache))}catch(e){/* The server profile is already saved. */}
}
function fillProfile(profile){
 currentProfile=profile;
 $('full-name').value=profile.full_name||'';
 $('nickname').value=profile.nickname||'';
 $('email').value=profile.email||'';
 $('content').hidden=false;
 $('login-help').hidden=true;
 status('page-status','Angemeldet als '+profile.nickname);
 const sameEmail=profile.email&&profile.login_email&&profile.email.toLowerCase()===profile.login_email.toLowerCase();
 $('link-email').disabled=!profile.email||!!(sameEmail&&profile.login_email_confirmed);
 if(sameEmail&&profile.login_email_confirmed)status('email-login-state','E-Mail-Anmeldung aktiv für '+profile.login_email);
 else if(profile.login_email&&profile.login_email_confirmed)status('email-login-state','Aktuelle bestätigte Anmeldeadresse: '+profile.login_email+'. Eine andere Profiladresse kannst du unten zusätzlich bestätigen.');
 else status('email-login-state','Du kannst dich mit Nickname oder vollständigem Namen und Gruppencode anmelden. Die E-Mail-Anmeldung ist optional und benötigt eine Bestätigung.');
 cacheNickname(profile.nickname);
}
async function loadProfile(){
 if(loadingProfile||profileBusy)return;
 loadingProfile=true;$('retry-load').hidden=true;status('page-status','Dein Profil wird geladen …');
 try{
  if(!window.supabase?.createClient)throw Error('Die Verbindung konnte nicht geladen werden. Bitte erneut versuchen.');
  if(!profileSb)profileSb=window.supabase.createClient(PROFILE_URL,PROFILE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session},error}=await profileSb.auth.getSession();
  if(error)throw error;
  if(!session){$('content').hidden=true;$('login-help').hidden=false;status('page-status','Bitte zuerst mit deinem Nickname oder vollständigem Namen und Gruppencode anmelden.',true);return}
  const result=await profileSb.rpc('get_my_kufstein_profile');
  if(result.error){$('login-help').hidden=false;throw result.error;}
  if(!result.data)throw Error('Dein Profil konnte nicht geladen werden.');
  fillProfile(result.data);
 }catch(e){status('page-status','Profil konnte nicht geladen werden: '+(e.message||String(e)),true);$('retry-load').hidden=false}
 finally{loadingProfile=false}
}
async function saveProfile(event){
 event.preventDefault();
 if(profileBusy||!currentProfile)return;
 if(!$('profile-form').reportValidity())return;
 const fullName=$('full-name').value.trim(),nickname=$('nickname').value.trim(),email=$('email').value.trim();
 if(fullName.length<2||nickname.length<2){status('profile-status','Bitte vollständigen Namen und Nickname mit mindestens zwei Zeichen eingeben.',true);return}
 profileBusy=true;$('save-profile').disabled=true;$('link-email').disabled=true;status('profile-status','Wird gespeichert …');
 try{
  const result=await profileSb.rpc('save_kufstein_profile',{p_full_name:fullName,p_nickname:nickname,p_email:email});
  if(result.error)throw result.error;
  fillProfile(result.data);
  status('profile-status','Gespeichert. Dein Name ist in der Mitgliederliste aktualisiert. Nickname: '+result.data.nickname);
 }catch(e){status('profile-status','Nicht gespeichert: '+(e.message||String(e)),true)}
 finally{profileBusy=false;$('save-profile').disabled=false;
  const p=currentProfile;$('link-email').disabled=!p?.email||!!(p.login_email_confirmed&&p.login_email?.toLowerCase()===p.email.toLowerCase());
 }
}
async function linkProfileEmail(){
 if(profileBusy||!currentProfile?.email)return;
 if($('email').value.trim()!==currentProfile.email){status('email-status','Bitte deine geänderte E-Mail-Adresse zuerst mit „Persönliche Daten speichern“ speichern.',true);return}
 profileBusy=true;$('link-email').disabled=true;$('save-profile').disabled=true;
 status('email-status','Bestätigung wird angefordert …');
 try{
  const result=await profileSb.auth.updateUser({email:currentProfile.email},{emailRedirectTo:location.origin+'/kufstein-2026/einstellungen.html'});
  if(result.error)throw result.error;
  status('email-status','Bestätigung angefordert. Bitte den Link in deinem E-Mail-Postfach öffnen. Dein Profil ist bereits gespeichert.');
 }catch(e){
  const message=e.message||String(e);
  status('email-status',/already been registered|already registered|already exists|email_exists/i.test(message)?'Deine Profiladresse ist gespeichert. Für diese E-Mail besteht bereits ein anderes Anmeldekonto. Nutze vorerst deinen Nickname oder vollständigen Namen und den Gruppencode.':'Die E-Mail-Bestätigung konnte nicht angefordert werden: '+message,true);
 }finally{profileBusy=false;$('link-email').disabled=false;$('save-profile').disabled=false}
}
$('profile-form').onsubmit=saveProfile;
$('link-email').onclick=linkProfileEmail;
$('retry-load').onclick=loadProfile;
const eventId=new URLSearchParams(location.search).get('event');
if(eventId){
 const back=$('profile-event-back');
 back.href=eventId==='kufstein-2026'?'/kufstein-2026/':'event.html?'+new URLSearchParams({id:eventId});
 back.hidden=false;
}
$('login-link').href='index.html?'+new URLSearchParams({return:'profil',...(eventId?{event:eventId}:{})});
loadProfile();

