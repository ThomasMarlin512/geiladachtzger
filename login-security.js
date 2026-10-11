(() => {
 const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
 async function state(client){const r=await client.rpc('get_my_login_security');if(r.error)throw r.error;return r.data;}
 async function showNotice(client,container,href='/geiladachtzger/einstellungen.html'){
  try{
   const s=await state(client);document.getElementById('login-security-notice')?.remove();
   if(!s.is_initial)return;
   const notice=el('p');notice.id='login-security-notice';notice.className='login-security-notice';
   notice.append(document.createTextNode('Du verwendest noch den gemeinsamen Startcode. '));
   const a=el('a','Eigenen Code festlegen →');a.href=href;notice.append(a);container?.prepend(notice);
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
   const s=await state(client);panel.replaceChildren(el('h2','Mein Anmeldecode'));
   panel.append(el('p','Melde dich mit Nickname, vollständigem Namen oder deiner gespeicherten E-Mail und deinem Code an. Eine Änderung gilt nur für dein Konto, auf allen Veranstaltungsseiten.'));
   const initialHint=el('p','Du verwendest noch den gemeinsamen Startcode. Hier kannst du einen eigenen Code festlegen.');initialHint.hidden=!s.is_initial;panel.append(initialHint);
   const form=el('form'),fields={};
   for(const [key,label,autocomplete] of [['current','Aktueller Code','current-password'],['next','Neuer Code','new-password'],['repeat','Neuen Code wiederholen','new-password']]){
    const input=el('input'),caption=el('label',label);input.id='my-code-'+key;caption.htmlFor=input.id;
    input.type='password';input.autocomplete=autocomplete;input.required=true;input.minLength=4;input.maxLength=64;
    input.autocapitalize='off';input.spellcheck=false;fields[key]=input;form.append(caption,input);
   }
   form.append(el('small','4 bis 64 Zeichen. Wähle einen Code, den nur du kennst.'));
   const button=el('button','Code speichern');button.type='submit';
   const message=el('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
   form.append(button,message);panel.append(form);let saving=false;
   form.onsubmit=async event=>{
    event.preventDefault();if(saving||!form.reportValidity())return;
    if(fields.next.value.trim()!==fields.repeat.value.trim()){message.textContent='Die neuen Codes stimmen nicht überein.';return;}
    saving=true;button.disabled=true;message.textContent='Code wird gespeichert …';
    try{
     const result=await client.rpc('change_my_login_code',{p_current_code:fields.current.value,p_new_code:fields.next.value});
     if(result.error)throw result.error;
     for(const input of Object.values(fields))input.value='';
     document.getElementById('login-security-notice')?.remove();initialHint.hidden=true;
     message.textContent='Dein Code wurde geändert. Ab jetzt gilt für dich nur noch der neue Code. Bestehende Anmeldungen bleiben erhalten.';
    }catch(e){message.textContent='Nicht gespeichert: '+e.message;}
    finally{saving=false;button.disabled=false;}
   };
  }catch(e){panel.replaceChildren(el('p','Anmeldeeinstellungen konnten nicht geladen werden: '+e.message));}
 }
 window.GroupLoginSecurity={showNotice,mountProfile,showCode};
})();
