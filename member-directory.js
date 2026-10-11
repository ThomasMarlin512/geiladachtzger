const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createMemberDirectory({client,onIdentity,onSaved}) {
 const $=id=>document.getElementById(id);
 if(!$('group-member-list'))return null;
 let members=[],canManage=false,managing=false,loading=false,saving=false,editing=null;
 const setStatus=(message,id='members-status')=>{$(id).textContent=message;};
 function render(){
  const term=$('member-search').value.trim().toLocaleLowerCase('de');
  const filtered=members.filter(p=>(p.full_name+' '+p.nickname).toLocaleLowerCase('de').includes(term));
  $('group-member-count').textContent='· '+members.length;
  $('manage-members').hidden=!canManage;
  $('manage-members').textContent=managing?'Verwaltung schließen':'Mitglieder verwalten';
  $('manage-members').setAttribute('aria-pressed',String(managing));
  $('group-member-list').innerHTML=filtered.map(p=>'<li class="group-member-card"><div class="member-avatar" aria-hidden="true">'+esc(p.full_name.split(/\s+/).filter(Boolean).map(n=>Array.from(n)[0]).slice(0,2).join(''))+'</div><div class="member-details"><h3>'+esc(p.full_name)+(p.is_self?' <span class="tag">Du</span>':'')+'</h3>'+(p.nickname&&![p.full_name,p.full_name.split(/\s+/)[0]].some(name=>name.toLocaleLowerCase('de')===p.nickname.toLocaleLowerCase('de'))?'<p>'+esc(p.nickname)+'</p>':'')+'<small>'+(p.is_admin?'Gruppenadmin':p.registered?'Profil eingerichtet':'Profil noch offen')+'</small></div>'+(managing&&canManage?'<button type="button" class="secondary" data-edit-member="'+esc(p.id)+'" aria-label="'+esc(p.full_name)+' bearbeiten">Bearbeiten</button>':p.is_self?'<a class="member-settings-link" href="einstellungen.html">Meine Einstellungen →</a>':'')+'</li>').join('')||'<li class="empty">Keine Mitglieder gefunden.</li>';
  $('group-member-list').querySelectorAll('[data-edit-member]').forEach(button=>button.addEventListener('click',()=>openEditor(button.dataset.editMember)));
  if(managing&&canManage&&window.GroupLoginSecurity)for(const person of filtered.filter(p=>p.registered&&!p.is_admin)){
   const card=[...$('group-member-list').querySelectorAll('[data-edit-member]')].find(b=>b.dataset.editMember===person.id)?.closest('li');
   if(!card)continue;const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent='Anmeldecode erneuern';button.addEventListener('click',()=>window.GroupLoginSecurity.showCode(client(),person.member_key||person.roster_key,'Anmeldecode für '+person.full_name));card.append(button);
  }
 }
 async function load(){
  if(loading)return;loading=true;$('reload-members').disabled=true;
  try{
   const result=await client().rpc('get_group_member_directory');if(result.error)throw result.error;
   members=result.data?.members||[];canManage=result.data?.can_manage===true;
   if(!canManage)managing=false;
   const self=members.find(p=>p.is_self);if(self)onIdentity?.(self.nickname);
   render();setStatus(managing?'Du kannst hier Namen und Nicknames für die Gruppe bearbeiten.':'');
  }catch(error){setStatus('Mitglieder konnten nicht geladen werden: '+error.message);}
  finally{loading=false;$('reload-members').disabled=false;}
 }
 function openEditor(id){
  if(!canManage||saving)return;
  const person=members.find(p=>p.id===id);if(!person)return;
  editing={...person};$('member-full-name').value=person.full_name;
  $('member-nickname').value=person.nickname;$('member-nickname').disabled=!person.registered;
  $('member-nickname').required=person.registered;
  $('member-nickname-help').textContent=person.registered?'Der Nickname muss innerhalb der Gruppe eindeutig sein.':'Den Nickname legt das Mitglied bei der Anmeldung selbst fest.';
  setStatus('','member-edit-status');$('member-dialog').showModal();$('member-full-name').focus();
 }
 $('member-search').addEventListener('input',render);
 $('manage-members').addEventListener('click',()=>{managing=!managing;render();setStatus(managing?'Du kannst hier Namen und Nicknames für die Gruppe bearbeiten.':'');});
 $('reload-members').addEventListener('click',load);
 $('close-member-dialog').addEventListener('click',()=>{if(!saving)$('member-dialog').close();});
 $('member-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
 $('member-edit-form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||!editing||!canManage)return;
  if(!$('member-edit-form').reportValidity())return;
  saving=true;$('save-member').disabled=true;$('close-member-dialog').disabled=true;
  setStatus('Wird gespeichert …','member-edit-status');
  try{
   const result=await client().rpc('update_group_member',{
    p_person_id:editing.id,p_full_name:$('member-full-name').value.trim(),
    p_nickname:editing.registered?$('member-nickname').value.trim():'',
    p_expected_full_name:editing.full_name,p_expected_nickname:editing.nickname
   });if(result.error)throw result.error;
   $('member-dialog').close();await load();await onSaved?.();
   setStatus('Mitglied aktualisiert. Stimmen und Teilnahmen bleiben erhalten.');
  }catch(error){setStatus('Nicht gespeichert: '+error.message,'member-edit-status');}
  finally{saving=false;$('save-member').disabled=false;$('close-member-dialog').disabled=false;}
 });
 return {load,render};
}
