(() => {
 async function signIn(client,name,code){
  let current=await client.auth.getSession();if(current.error)throw current.error;
  if(!current.data.session){const anonymous=await client.auth.signInAnonymously();if(anonymous.error)throw anonymous.error;}
  const result=await client.functions.invoke('member-code-login',{body:{name:name.trim(),code:code.trim()}});
  if(result.error){
   let message='Die Anmeldung konnte nicht geprüft werden. Bitte erneut versuchen.';
   try{const body=await result.error.context?.json();if(body?.error)message=body.error;}catch{}
   throw Error(message);
  }
  if(!result.data?.ok)throw Error('Anmeldung fehlgeschlagen.');
  if(result.data.token_hash){
   const verified=await client.auth.verifyOtp({token_hash:result.data.token_hash,type:'email'});
   if(verified.error)throw Error('Die Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.');
  }
  current=await client.auth.getSession();if(current.error)throw current.error;
  if(!current.data.session?.user)throw Error('Die Anmeldung konnte nicht gespeichert werden.');
  return current.data.session.user;
 }
 window.GroupMemberLogin={signIn};
})();
