// The multiplayer rooms' pass (src/sala.js) on this machine (teste/local.mjs): only a pilot signed in,
// with a nickname, gets one, for the room asked (or the lobby), under that nickname, readable by the room
// server (sala-cloudflare/src/passe.js) with the shared secret and nothing else; the account is an HMAC,
// never the Google id; a foreign page cannot ask for one.
import assert from 'node:assert/strict';
import {startLocal,ROOM_PASS_SECRET} from './local.mjs';
import {readPass,LOBBY,accountKey} from '../../sala-cloudflare/src/passe.js';

const local=await startLocal({port:0}),ORIGIN=`http://127.0.0.1:${local.port}`;
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});
function browser(){
 const jar=new Map();
 const take=r=>{for(const c of r.headers.getSetCookie()){const [pair,...attrs]=c.split('; '),i=pair.indexOf('=');if(attrs.includes('Max-Age=0'))jar.delete(pair.slice(0,i));else jar.set(pair.slice(0,i),pair.slice(i+1));}};
 const go=async(url,init={})=>{const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));const r=await fetch(new URL(url,ORIGIN),{...init,headers,redirect:'manual'});take(r);return r;};
 const post=(path,body,headers={})=>go(path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const signIn=async sub=>{local.google.next.sub=sub;const start=await go('/api/conta/entrar?volta=/');const fromGoogle=await go(start.headers.get('Location'));await go(fromGoogle.headers.get('Location'));};
 return {go,post,signIn};
}
const ask=(b,sala)=>b.post('/api/conta/passe-sala',{sala});

await check('nobody signed in gets no pass',async()=>{
 const r=await ask(browser(),'amigos');assert.equal(r.status,401);
});
await check('a nickname first: it is the name in the room',async()=>{
 const b=browser();await b.signIn('100000000000000000077');
 const r=await ask(b,'amigos');assert.equal(r.status,409);assert.match((await r.json()).erro,/apelido/);
});
await check('the pass: that room, that nickname, the account as an HMAC',async()=>{
 const b=browser();await b.signIn('100000000000000000078');
 assert.equal((await b.post('/api/conta/apelido',{apelido:'Rubinho'})).status,200);
 const r=await ask(b,'amigos'),{passe,validade}=await r.json();
 assert.equal(r.status,200);assert.equal(validade,5*60*1000);
 const who=await readPass(ROOM_PASS_SECRET,passe,{room:'amigos'});
 assert.equal(who.name,'Rubinho');assert.equal(who.account,await accountKey(ROOM_PASS_SECRET,'100000000000000000078'));
 assert.ok(!passe.includes('100000000000000000078')&&!Buffer.from(passe.split('.')[0],'base64url').toString().includes('100000000000000000078'),'the Google id never leaves');
 assert.equal(await readPass(ROOM_PASS_SECRET,passe,{room:'outra'}),null,'one room only');
 assert.equal(await readPass('outro-segredo-qualquer-coisa',passe,{room:'amigos'}),null,'only with the shared secret');
 const lobby=await (await ask(b,LOBBY)).json();assert.equal((await readPass(ROOM_PASS_SECRET,lobby.passe,{room:LOBBY})).name,'Rubinho','the lobby\'s');
 for(const bad of ['Amigos','a b','x'.repeat(25),'',null,7,'@outro'])assert.equal((await ask(b,bad)).status,400,String(bad));
 // Another site (the main link is the same site to a browser) cannot ask for one with the player's cookie.
 assert.equal((await b.post('/api/conta/passe-sala',{sala:'amigos'},{Origin:'https://autopobre.com.br'})).status,403);
 assert.equal((await b.go('/api/conta/passe-sala?sala=amigos')).status,405,'a write only');
});
// Without the rooms' secret, or with one too short to be one (passe.js SECRET_MIN): the rooms are off, a 503 the
// game shows as such (never a 500, which it would take for this server down and ask again for ever).
await check('the rooms switched off: no secret, or a short one',async()=>{
 for(const salaPasse of [null,'curto','x'.repeat(15)]){
  const off=await startLocal({port:0,salaPasse}),base=`http://127.0.0.1:${off.port}`,jar=new Map();
  const go=async(url,init={})=>{const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));const r=await fetch(new URL(url,base),{...init,headers,redirect:'manual'});for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}return r;};
  const post=(path,body)=>go(path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  off.google.next.sub='100000000000000000079';
  const start=await go('/api/conta/entrar?volta=/');const fromGoogle=await go(start.headers.get('Location'));await go(fromGoogle.headers.get('Location'));
  assert.equal((await post('/api/conta/apelido',{apelido:'Desligado'})).status,200);
  const r=await post('/api/conta/passe-sala',{sala:'amigos'});
  assert.equal(r.status,503,String(salaPasse));assert.match((await r.json()).erro,/não estão ligadas/);
  await off.close();
 }
});
await local.close();
console.log(`${passed} grupos de verificações do passe das salas passaram.`);
