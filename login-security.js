(() => {
 const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
 async function state(client){const r=await client.rpc('get_my_login_security');if(r.error)throw r.error;return r.data;}
 async function showNotice(client,container,href='/geiladachtzger/einstellungen.html'){
  try{
   const s=await state(client);document.getElementById('login-security-notice')?.remove();
   if(s.email_login||s.has_personal_code)return;
   const notice=el('p');notice.id='login-security-notice';notice.className='login-security-notice';
   notice.append(document.createTextNode('Sichere deine Anmeldung für weitere Geräte. '));
   const a=el('a','Persönlichen Anmeldecode erstellen →');a.href=href;notice.append(a);container?.prepend(notice);
  }catch{/* Existing member sessions remain usable during a connection failure. */}
 }
 async function showCode(client,memberKey,label){
  const dialog=el('dialog');dialog.className='login-code-dialog';dialog.setAttribute('aria-labelledby','login-code-title');
  const title=el('h2',label||'Dein persönlicher Anmeldecode');title.id='login-code-title';
  const intro=el('p','Der neue Code ersetzt einen bisherigen Code. Bestehende Anmeldungen bleiben erhalten. Gib diesen Code nur dem zugehörigen Mitglied.');
  const result=el('div'),status=el('p');status.setAttribute('role','status');
  const create=el('button','Neuen Code erstellen'),close=el('button','Schließen');close.className='secondary';
  create.type=close.type='button';let busy=false;
  dialog.append(title,intro,result,status,create,close);document.body.append(dialog);dialog.showModal();
  close.onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{result.replaceChildren();dialog.remove();});
  create.onclick=async()=>{
   if(busy)return;busy=true;create.disabled=close.disabled=true;status.textContent='Code wird erstellt …';
   try{
    const r=await client.rpc('issue_member_login_code',{p_member_key:memberKey||null});if(r.error)throw r.error;
    const label=el('label','Persönlicher Anmeldecode'),input=el('input');input.id='issued-login-code';label.htmlFor=input.id;
    input.value=r.data.code;input.readOnly=true;input.autocomplete='off';input.spellcheck=false;
    const copy=el('button','Code kopieren');copy.type='button';copy.className='secondary';
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);status.textContent='Code kopiert. Bitte sicher aufbewahren.';}catch{input.focus();input.select();status.textContent='Bitte den markierten Code kopieren.';}};
    result.replaceChildren(label,input,copy);create.hidden=true;intro.textContent='Speichere den Code sicher, zum Beispiel in deiner Passwortverwaltung. Er wird nach dem Schließen nicht erneut angezeigt.';
    status.textContent='Code erstellt. Der bisherige Code ist ungültig.';
   }catch(e){status.textContent='Nicht erstellt: '+e.message;}
   finally{busy=false;create.disabled=close.disabled=false;}
  };
 }
 async function mountProfile(client){
  const panel=document.getElementById('login-security-panel');if(!panel)return;
  try{
   const s=await state(client);panel.replaceChildren(el('h2','Anmeldung auf weiteren Geräten'));
   if(s.email_login){panel.append(el('p',s.is_admin?'Dein Adminzugang verwendet deine bestätigte E-Mail. Melde dich auf einem neuen Gerät über „Mit E-Mail anmelden“ an.':'Deine bestätigte E-Mail ist für die Anmeldung eingerichtet. Verwende auf neuen Geräten den E-Mail-Anmeldelink.'));return;}
   panel.append(el('p',s.has_personal_code?'Melde dich mit deinem Namen oder Nickname und deinem persönlichen Anmeldecode an.':'Erstelle deinen persönlichen Anmeldecode, bevor du dieses Gerät abmeldest. Der Gruppencode dient nur noch dem Beitritt neuer Mitglieder.'));
   const button=el('button',s.has_personal_code?'Persönlichen Code erneuern':'Persönlichen Code erstellen');button.type='button';button.onclick=()=>showCode(client,null,'Dein persönlicher Anmeldecode');panel.append(button);
  }catch(e){panel.replaceChildren(el('p','Anmeldeeinstellungen konnten nicht geladen werden: '+e.message));}
 }
 window.GroupLoginSecurity={showNotice,mountProfile,showCode};
})();
