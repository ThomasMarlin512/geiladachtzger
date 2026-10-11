import assert from 'node:assert/strict';
import fs from 'node:fs';
// Security behavior is tested with rolled-back SQL fixtures; these checks keep
// all public entry points on the personal-code flow and preserve the email path.
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const name of ['index.html','event.html']){
 const html=read(name);
 assert.match(html,/<label for="login-code">Anmeldecode/);
 assert.match(html,/id="email-login-form"/);
 assert.match(html,/<label for="join-code">Gruppencode/);
 assert.match(html,/login-security.js\?v=/);
}
const script=read('login-security.js');
assert.ok(!script.includes('localStorage'),'Personal secrets must not be saved in browser storage');
assert.ok(!script.includes('console.'),'Do not log personal secrets');
assert.match(script,/change_my_login_code/);
assert.match(script,/result.replaceChildren\(\);dialog.remove\(\)/,'Discard displayed code on close');
assert.match(read('app.js'),/shouldCreateUser:false/,'Email login must not create extra accounts');
assert.match(read('member-directory.js'),/person.member_key/);
console.log('PASS: personal-code forms, email fallback, explicit code issuance and no secret persistence');
