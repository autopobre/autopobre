// The same Worker in Cloudflare's own runtime (wrangler dev, local D1 with the migrations applied),
// signing in through the stand-in Google of local.mjs: the SQL (RETURNING, numbered parameters, batch)
// and the WebCrypto calls as Cloudflare runs them. Run `.\wrangler d1 migrations apply
// conta-autopobre-dev --local` once before. The page's origin is another port, as with servidor.py
// passing /api/ on: wrangler dev rewrites an Origin that names its own address into the route's host.
import assert from 'node:assert/strict';
import {spawn,execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startLocal,CLIENT_ID,CLIENT_SECRET} from './local.mjs';

const PORT=8790,API=`http://127.0.0.1:${PORT}`,ORIGIN='http://127.0.0.1:8799',google=await startLocal({port:0}),G=`http://127.0.0.1:${google.port}/falso-google`;
const vars={ORIGEM:ORIGIN,GOOGLE_CLIENT_ID:CLIENT_ID,GOOGLE_CLIENT_SECRET:CLIENT_SECRET,GOOGLE_AUTH_URL:G+'/auth',GOOGLE_TOKEN_URL:G+'/token'};
const args=[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'dev','--ip','127.0.0.1','--port',String(PORT),'--show-interactive-dev-session=false'];
for(const [k,v] of Object.entries(vars))args.push('--var',`${k}:${v}`);
const dev=spawn(process.execPath,args,{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
let log='';dev.stdout.on('data',d=>log+=d);dev.stderr.on('data',d=>log+=d);
const stop=()=>{try{process.platform==='win32'?execSync(`taskkill /pid ${dev.pid} /T /F`,{stdio:'ignore'}):dev.kill();}catch{}};
process.on('exit',stop);
try{
 const end=Date.now()+90000;
 while(!/Ready on/.test(log)){if(Date.now()>end||dev.exitCode!==null)throw new Error('wrangler dev did not start: '+log);await new Promise(r=>setTimeout(r,200));}
 const jar=new Map();
 const go=async(url,init={})=>{
  const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(new URL(String(url).replace(ORIGIN,API),API),{...init,headers,redirect:'manual'});
  for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');c.includes('Max-Age=0')?jar.delete(pair.slice(0,i)):jar.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 };
 const post=(path,body)=>go(path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});
 google.google.next.sub=String(Date.now());
 const start=await go('/api/conta/entrar?volta=/x');assert.equal(start.status,303);
 const fromGoogle=await go(start.headers.get('Location'));const back=await go(fromGoogle.headers.get('Location'));
 assert.equal(back.headers.get('Location'),ORIGIN+'/x');assert.ok(jar.has('__Host-ap_sessao'),'signed in');
 const nick='Teste '+String(Date.now()).slice(-6);
 assert.equal((await post('/api/conta/apelido',{apelido:nick})).status,200);
 assert.equal((await (await go('/api/conta/eu')).json()).conta.apelido,nick);
 assert.equal((await go('/api/conta/meus-dados')).status,200);
 // The records: the game's circuits.js inside the bundle, the ticket sealed and opened, the board's SQL.
 const ticket=await (await post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'wrangler'})).json();
 assert.ok(ticket.bilhete&&ticket.intervalo===5,JSON.stringify(ticket));
 const chunk=await (await post('/api/recordes/pedaco',{bilhete:ticket.bilhete,relogio:0,cruzou:true})).json();assert.ok(chunk.bilhete);
 assert.equal((await post('/api/recordes/importar',{recordes:[{circuito:'cascavel',modo:'normal',volta_ms:95000}]})).status,200);
 const board=await (await go('/api/recordes?circuito=cascavel&modo=normal')).json();
 assert.deepEqual(board.recordes.map(r=>[r.apelido,r.selo,r.volta_ms,r.meu]),[[nick,'nao_verificado',95000,true]]);
 assert.equal((await (await go('/api/recordes/melhores?modo=normal')).json()).melhores.cascavel,95000);
 assert.equal((await post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 assert.deepEqual(await (await go('/api/conta/eu')).json(),{conta:null});
 console.log('ok: entrar, apelido, meus dados, bilhete, recordes e apagar no runtime do Cloudflare (wrangler dev)');
}finally{stop();await google.close();}
