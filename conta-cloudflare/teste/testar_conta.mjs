// The accounts Worker end to end on this machine (teste/local.mjs: Node + SQLite + a stand-in Google):
// sign-in, the cookies' attributes, what the database keeps, nicknames, the write guards, sign-out, the
// player's data and deleting the account, and every way a sign-in must fail.
import assert from 'node:assert/strict';
import worker,{cleanNickname,safeReturn} from '../src/index.js';
import {startLocal,localD1,CLIENT_ID,CLIENT_SECRET} from './local.mjs';

const local=await startLocal({port:0}),ORIGIN=`http://127.0.0.1:${local.port}`;
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});

// A browser of its own: cookies by name, redirects by hand.
function browser(){
 const jar=new Map();
 const take=r=>{for(const c of r.headers.getSetCookie()){const [pair,...attrs]=c.split('; '),i=pair.indexOf('='),name=pair.slice(0,i),age=attrs.find(a=>a.startsWith('Max-Age='));
  if(age==='Max-Age=0')jar.delete(name);else jar.set(name,pair.slice(i+1));}};
 const go=async(url,init={})=>{
  const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(new URL(url,ORIGIN),{...init,headers,redirect:'manual'});take(r);return r;
 };
 const post=(path,body,headers={})=>go(path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 // The whole round: the game's link, Google, back here. Returns the last redirect (to the game).
 const signIn=async(volta='/')=>{
  const start=await go('/api/conta/entrar?volta='+encodeURIComponent(volta));
  const fromGoogle=await go(start.headers.get('Location'));
  return {start,fromGoogle,back:await go(fromGoogle.headers.get('Location'))};
 };
 const me=async()=>(await (await go('/api/conta/eu')).json()).conta;
 return {jar,go,post,signIn,me};
}
const rows=sql=>local.DB.sqlite.prepare(sql).all();

await check('nobody signed in',async()=>{
 const b=browser(),r=await b.go('/api/conta/eu');
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{conta:null});
});

await check('sign-in: the request to Google and the cookies',async()=>{
 const b=browser(),{start,fromGoogle,back}=await b.signIn('/#desafio=teste');
 assert.equal(start.status,303);
 const auth=new URL(start.headers.get('Location')),p=auth.searchParams;
 assert.equal(p.get('scope'),'openid','openid only: no name, picture or e-mail');
 assert.equal(p.get('client_id'),CLIENT_ID);assert.equal(p.get('redirect_uri'),ORIGIN+'/api/conta/google');
 assert.equal(p.get('code_challenge_method'),'S256');assert.match(p.get('code_challenge'),/^[\w-]{43}$/);
 assert.match(p.get('state'),/^[\w-]{43}$/);assert.match(p.get('nonce'),/^[\w-]{43}$/);
 const login=start.headers.getSetCookie()[0];
 assert.match(login,/^__Host-ap_login=[\w-]+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
 assert.ok(!login.includes(p.get('state'))&&!login.includes(p.get('nonce')),'the sign-in cookie is encrypted');
 assert.equal(fromGoogle.status,302);
 assert.equal(back.status,303);assert.equal(back.headers.get('Location'),ORIGIN+'/#desafio=teste');
 const set=back.headers.getSetCookie();
 assert.ok(set.some(c=>/^__Host-ap_login=; Path=\/; Max-Age=0;/.test(c)),'the sign-in cookie is cleared');
 const sess=set.find(c=>c.startsWith('__Host-ap_sessao='));
 assert.match(sess,/^__Host-ap_sessao=[\w-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
 const me=await b.me();assert.equal(me.apelido,null);assert.ok(Date.parse(me.desde)>Date.now()-60000);
 // The database has the subject and the session's hash, never the cookie's value.
 const value=b.jar.get('__Host-ap_sessao');
 assert.ok(rows('SELECT id FROM sessoes').every(r=>r.id!==value));
 assert.deepEqual(Object.keys(rows('SELECT * FROM usuarios')[0]).sort(),['admin','apelido','apelido_chave','criado_em','google_sub','id','importou_em','ultimo_login']);
});

await check('the same Google account comes back to the same account',async()=>{
 local.google.next.sub='100000000000000000002';
 const a=browser();await a.signIn();assert.equal((await a.post('/api/conta/apelido',{apelido:'Bia Ventania'})).status,200);
 const b=browser();await b.signIn();assert.equal((await b.me()).apelido,'Bia Ventania');
 assert.equal(rows("SELECT COUNT(*) AS n FROM usuarios WHERE google_sub='100000000000000000002'")[0].n,1);
});

await check('nicknames: rules, uniqueness without accents or case',async()=>{
 for(const bad of ['ab','a'.repeat(21),'Jоão','-Bia','Bia_','😀 Piloto','Bia​X','.. ..','<b>x</b>','ᴋʟᴇʙᴇʀ','Steνan','Ana×Bia'])assert.equal(cleanNickname(bad),null,bad);
 assert.equal(cleanNickname('  João   da  Silva  '),'João da Silva');assert.equal(cleanNickname('ＡＢＣ'),'ABC');assert.equal(cleanNickname('Zé_99'),'Zé_99');
 local.google.next.sub='100000000000000000003';
 const b=browser();await b.signIn();
 const r=await b.post('/api/conta/apelido',{apelido:'x'});assert.equal(r.status,400);assert.match((await r.json()).erro,/3 a 20/);
 assert.equal((await b.post('/api/conta/apelido',{apelido:'joão da silva'})).status,200);
 local.google.next.sub='100000000000000000004';
 const c=browser();await c.signIn();
 const taken=await c.post('/api/conta/apelido',{apelido:'JOAO DA SILVA'});assert.equal(taken.status,409);
 assert.equal((await b.post('/api/conta/apelido',{apelido:'João da Silva'})).status,200,'the owner may change its own case');
 assert.equal((await c.post('/api/conta/apelido',{apelido:'J.O.A.O da Silva'})).status,409,'separators do not make another name');
 assert.equal((await c.post('/api/conta/apelido',{apelido:'Joa0 da SiIva'})).status,409,'0 for O and I for l neither');
 for(const reserved of ['Stevan','KIeber','Kléber','stevan_gaipo','Admin','Auto Pobre']){
  const r=await c.post('/api/conta/apelido',{apelido:reserved});assert.equal(r.status,409,reserved);assert.match((await r.json()).erro,/reservado/,reserved);}
});

await check('nicknames: the same again writes nothing, and at most 10 changes an hour',async()=>{
 local.google.next.sub='100000000000000000012';
 const b=browser();await b.signIn();
 const id=rows("SELECT id FROM usuarios WHERE google_sub='100000000000000000012'")[0].id,changes=()=>rows(`SELECT COUNT(*) AS n FROM eventos WHERE usuario_id=${id} AND tipo='apelido'`)[0].n;
 for(let i=0;i<10;i++)assert.equal((await b.post('/api/conta/apelido',{apelido:'Troca '+i})).status,200);
 assert.equal((await b.post('/api/conta/apelido',{apelido:'Troca 9'})).status,200,'the same again');
 const r=await b.post('/api/conta/apelido',{apelido:'Troca 10'});assert.equal(r.status,429);assert.match((await r.json()).erro,/daqui a uma hora/);
 assert.equal(changes(),10,'the same again was not written');assert.equal((await b.me()).apelido,'Troca 9');
 local.DB.sqlite.prepare('UPDATE eventos SET quando=quando-3600001 WHERE usuario_id=?').run(id);
 assert.equal((await b.post('/api/conta/apelido',{apelido:'Troca 10'})).status,200,'an hour later');
});

await check('writes need the exact origin, JSON and a session',async()=>{
 local.google.next.sub='100000000000000000005';
 const b=browser();await b.signIn();
 assert.equal((await b.post('/api/conta/apelido',{apelido:'Piloto Um'},{Origin:'https://autopobre.com.br'})).status,403,'a sibling site');
 assert.equal((await b.go('/api/conta/apelido',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"apelido":"Piloto Um"}'})).status,403,'no Origin');
 assert.equal((await b.post('/api/conta/apelido',{apelido:'Piloto Um'},{'Content-Type':'text/plain'})).status,415,'a form post');
 assert.equal((await b.post('/api/conta/apelido',{apelido:'x'.repeat(5000)})).status,413);
 assert.equal((await b.go('/api/conta/apelido')).status,405);
 assert.equal((await b.go('/api/nada')).status,404);
 assert.equal((await browser().post('/api/conta/apelido',{apelido:'Piloto Um'})).status,401);
 assert.equal(rows("SELECT COUNT(*) AS n FROM usuarios WHERE apelido='Piloto Um'")[0].n,0);
});

await check('failed sign-ins leave no session',async()=>{
 const before=rows('SELECT COUNT(*) AS n FROM sessoes')[0].n;
 for(const spoil of ['cancel','state','nonce','aud','iss','exp']){
  local.google.next.spoil=spoil;
  const b=browser(),{back}=await b.signIn('/volta');
  assert.equal(back.status,303,spoil);assert.equal(back.headers.get('Location'),ORIGIN+'/volta',spoil);
  assert.ok(!b.jar.has('__Host-ap_sessao'),spoil);assert.equal(await b.me(),null,spoil);
 }
 assert.equal(local.google.next.spoil,null);
 // No sign-in cookie (another browser's code), a forged one, an old one.
 const a=browser(),start=await a.go('/api/conta/entrar'),fromGoogle=await a.go(start.headers.get('Location')),callback=fromGoogle.headers.get('Location');
 const stranger=browser();await stranger.go(callback);assert.ok(!stranger.jar.has('__Host-ap_sessao'),'a code without its cookie');
 const forged=browser();forged.jar.set('__Host-ap_login',a.jar.get('__Host-ap_login').slice(0,-4)+'AAAA');await forged.go(callback);
 assert.ok(!forged.jar.has('__Host-ap_sessao'),'a forged cookie');
 await a.go(callback);assert.ok(a.jar.has('__Host-ap_sessao'),'the real one still works');
 assert.equal(rows('SELECT COUNT(*) AS n FROM sessoes')[0].n,before+1);
});

await check('only a path on this site after Google',async()=>{
 for(const [given,kept] of [['//evil.example','/'],['/\\evil','/'],['https://evil.example','/'],['/ok?a=1#desafio=x','/ok?a=1#desafio=x'],['/a b','/'],[undefined,'/']])assert.equal(safeReturn(given),kept,String(given));
 local.google.next.sub='100000000000000000006';
 const {back}=await browser().signIn('//evil.example/x');assert.equal(back.headers.get('Location'),ORIGIN+'/');
});

await check('sessions: one per browser, ten per account, expiry',async()=>{
 local.google.next.sub='100000000000000000007';
 const b=browser();await b.signIn();const first=b.jar.get('__Host-ap_sessao');await b.signIn();
 assert.notEqual(b.jar.get('__Host-ap_sessao'),first);
 const id=rows("SELECT id FROM usuarios WHERE google_sub='100000000000000000007'")[0].id,count=()=>rows(`SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id=${id}`)[0].n;
 assert.equal(count(),1,'signing in again ends the browser\'s old session');
 for(let i=0;i<12;i++)await browser().signIn();
 assert.equal(count(),10);
 local.DB.sqlite.prepare(`UPDATE sessoes SET expira_em=1 WHERE usuario_id=${id}`).run();
 const r=await b.go('/api/conta/eu');assert.deepEqual(await r.json(),{conta:null});
 assert.ok(r.headers.getSetCookie().some(c=>c.startsWith('__Host-ap_sessao=; ')),'an expired cookie is cleared');
});

await check('a session cookie sent twice (a sibling site planted one) is nobody\'s',async()=>{
 local.google.next.sub='100000000000000000010';
 const b=browser();await b.signIn();const value=b.jar.get('__Host-ap_sessao');
 const twice=await fetch(ORIGIN+'/api/conta/eu',{headers:{Cookie:`__Host-ap_sessao=${value}; __Host-ap_sessao=outro`}});
 assert.deepEqual(await twice.json(),{conta:null});
 const spaced=await fetch(ORIGIN+'/api/conta/eu',{headers:{Cookie:`\u00a0__Host-ap_sessao=x; __Host-ap_sessao=${value}`}});
 assert.notEqual((await spaced.json()).conta,null,'a name with another space is another cookie');
});

await check('a body sent in chunks is read only up to the limit',async()=>{
 local.google.next.sub='100000000000000000011';
 const b=browser();await b.signIn();
 const big=new ReadableStream({start(c){for(let i=0;i<64;i++)c.enqueue(new TextEncoder().encode('x'.repeat(4096)));c.close();}});
 const r=await fetch(ORIGIN+'/api/conta/apelido',{method:'POST',duplex:'half',body:big,headers:{Origin:ORIGIN,'Content-Type':'application/json',Cookie:'__Host-ap_sessao='+b.jar.get('__Host-ap_sessao')}});
 assert.equal(r.status,413);
});

await check('sign-out',async()=>{
 local.google.next.sub='100000000000000000008';
 const b=browser();await b.signIn();const value=b.jar.get('__Host-ap_sessao');
 const r=await b.post('/api/conta/sair',{});assert.equal(r.status,200);assert.ok(!b.jar.has('__Host-ap_sessao'));
 const replay=browser();replay.jar.set('__Host-ap_sessao',value);assert.equal(await replay.me(),null,'the old cookie is dead on the server too');
});

await check('my data and deleting the account',async()=>{
 local.google.next.sub='100000000000000000009';
 const b=browser();await b.signIn();await b.post('/api/conta/apelido',{apelido:'Some Daqui'});
 const r=await b.go('/api/conta/meus-dados');
 assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment; filename="autopobre-meus-dados.json"/);
 const data=await r.json();assert.equal(data.conta.identificador_google,'100000000000000000009');assert.equal(data.conta.apelido,'Some Daqui');assert.equal(data.sessoes.length,1);
 assert.equal((await browser().go('/api/conta/meus-dados')).status,401);
 assert.equal((await b.post('/api/conta/apagar',{})).status,400,'needs the confirmation');
 const gone=await b.post('/api/conta/apagar',{confirmar:'APAGAR'});assert.equal(gone.status,200);assert.ok(!b.jar.has('__Host-ap_sessao'));
 assert.equal(rows("SELECT COUNT(*) AS n FROM usuarios WHERE google_sub='100000000000000000009'")[0].n,0);
 assert.equal(rows("SELECT COUNT(*) AS n FROM sessoes s LEFT JOIN usuarios u ON u.id=s.usuario_id WHERE u.id IS NULL")[0].n,0);
 const back=browser();await back.signIn();assert.equal((await back.me()).apelido,null,'a new account, from nothing');
});

await check('a real origin never uses the stand-in Google',async()=>{
 const env={DB:localD1(),ORIGEM:'https://dev.autopobre.com.br',GOOGLE_CLIENT_ID:CLIENT_ID,GOOGLE_CLIENT_SECRET:CLIENT_SECRET,GOOGLE_AUTH_URL:'http://127.0.0.1:1/auth',GOOGLE_TOKEN_URL:'http://127.0.0.1:1/token'};
 const r=await worker.fetch(new Request('https://dev.autopobre.com.br/api/conta/entrar'),env),to=new URL(r.headers.get('Location'));
 assert.equal(to.origin+to.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
 assert.equal(to.searchParams.get('redirect_uri'),'https://dev.autopobre.com.br/api/conta/google');
 const failed=await worker.fetch(new Request('https://dev.autopobre.com.br/api/conta/entrar'),{...env,GOOGLE_CLIENT_SECRET:''});
 assert.equal(failed.status,500,'no secret, no sign-in');
});

await local.close();
console.log(`${passed} grupos de verificações das contas passaram.`);
