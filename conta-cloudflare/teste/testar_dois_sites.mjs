// Two sites, one database, as on Cloudflare (wrangler.jsonc: conta-autopobre-dev on dev.autopobre.com.br, SITE dev;
// conta-autopobre on autopobre.com.br, SITE principal): two local Workers over one SQLite. A Google account is one
// pilot on both, signed in on each site by its own session (a dev session never opens the main link's account); a
// lap checked on either is on both boards; the trusted pilots' shortcut works on the test version only; the old
// records come up once per site; signing out is per site, deleting the account ends it on both; the panel reads the
// same data on both.
import assert from 'node:assert/strict';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {packSteps,packKeys} from '../../pista_interlagos/teste/comandos-volta.js';
import {CHUNK_EVERY} from '../src/recordes.js';
import {startLocal} from './local.mjs';
import {aiLaps,lapAt} from './voltas_ia.mjs';

const realNow=Date.now;let now=Date.parse('2026-10-28T15:00:00Z');Date.now=()=>now;
const BOSS='600000000000000000001';
const dev=await startLocal({port:0,site:'dev',admins:[BOSS]});
const main=await startLocal({port:0,site:'principal',DB:dev.DB});
const rows=sql=>dev.DB.sqlite.prepare(sql).all();
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});

// A browser on one site: its cookies are that site's alone (host-only, as __Host- cookies are).
function browser(site){
 const origin=`http://127.0.0.1:${site.port}`,jar=new Map();
 const go=async(url,init={})=>{
  const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(new URL(url,origin),{...init,headers,redirect:'manual'});
  for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');c.includes('Max-Age=0')?jar.delete(pair.slice(0,i)):jar.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 };
 const post=async(path,body)=>{const r=await go(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json().catch(()=>({}))};};
 const get=async path=>{const r=await go(path);return {status:r.status,...await r.json().catch(()=>({}))};};
 return {jar,go,post,get};
}
async function signIn(site,sub,nickname){
 const b=browser(site);site.google.next.sub=sub;
 const start=await b.go('/api/conta/entrar'),fromGoogle=await b.go(start.headers.get('Location'));await b.go(fromGoogle.headers.get('Location'));
 if(nickname)assert.equal((await b.post('/api/conta/apelido',{apelido:nickname})).status,200);
 return b;
}
// A lap of `time` seconds at Interlagos on a ticket of its own: the AI's flying lap as the game encodes it, with the
// throttle held from the keyboard (controls false: none sent, which the checks refuse).
async function lap(b,time,{controls=true}={}){
 let ticket=(await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'dois-sites'})).bilhete;
 const send=async body=>{const r=await b.post('/api/recordes/pedaco',{bilhete:ticket,...body});ticket=r.bilhete??ticket;return r;};
 await send({relogio:0,cruzou:true});
 for(let t=CHUNK_EVERY;t<time;t+=CHUNK_EVERY){now+=CHUNK_EVERY*1000;await send({relogio:t});}
 now+=Math.round((time-Math.floor((time-1e-9)/CHUNK_EVERY)*CHUNK_EVERY)*1000);
 const steps=Math.round(time*120),comandos={v:1,n:steps,s:1,data:packSteps([[0,[100,0,0,0,-2,0]]],steps),keys:packKeys([]),r:0,dev:[steps,0,0,0,0]};
 return (await send({relogio:time,cruzou:true,volta:{fantasma:encodeGhost(lapAt(aiLaps('interlagos')[1].lap,time)),...(controls&&{comandos})}})).volta;
}
const board=async b=>(await b.get('/api/recordes?circuito=interlagos&carro=opala')).recordes.map(r=>[r.apelido,r.volta_ms,r.selo]);

const anaDev=await signIn(dev,'600000000000000000002','Ana Dois');
let anaMain;

await check('one Google account is one pilot on both sites, each signed in by a session of its own',async()=>{
 anaMain=await signIn(main,'600000000000000000002');
 assert.equal((await anaMain.get('/api/conta/eu')).conta.apelido,'Ana Dois','the nickname chosen on the test version');
 assert.equal(rows("SELECT COUNT(*) AS n FROM usuarios WHERE google_sub='600000000000000000002'")[0].n,1);
 assert.deepEqual(rows("SELECT site FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE u.apelido='Ana Dois' ORDER BY site").map(r=>r.site),['dev','principal']);
 assert.deepEqual(Object.keys(await anaMain.get('/api/conta/eu')).sort(),['conta','status'],'no bridge any more');
 // The dev's cookie value carried over to the main link by hand (a browser never sends it there) opens nothing.
 const carried=browser(main);carried.jar.set('__Host-ap_sessao',anaDev.jar.get('__Host-ap_sessao'));
 assert.equal((await carried.get('/api/conta/eu')).conta,null);assert.equal(carried.jar.size,0,'and is cleared');
 assert.equal((await anaDev.get('/api/conta/eu')).conta.apelido,'Ana Dois','the dev session still stands');
 // A session from before the two sites (no site) is the test version's.
 rows("UPDATE sessoes SET site=NULL WHERE site='dev'");
 assert.equal((await anaDev.get('/api/conta/eu')).conta.apelido,'Ana Dois');
});

await check('a lap checked on either site is on both boards',async()=>{
 const onDev=await lap(anaDev,121);assert.deepEqual(onDev,{tempo_ms:121000,conferida:true,recorde:true});
 assert.deepEqual(await board(browser(main)),[['Ana Dois',121000,'conferido']],'raced on the test version, on the main link\'s board');
 const bia=await signIn(main,'600000000000000000003','Bia Principal');
 assert.equal((await lap(bia,122)).conferida,true);
 assert.deepEqual(await board(browser(dev)),[['Ana Dois',121000,'conferido'],['Bia Principal',122000,'conferido']]);
 assert.equal((await lap(anaMain,120.8)).recorde,true,'the main link knows her best from the test version and beats it');
 assert.equal(rows("SELECT volta_ms FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Ana Dois'")[0].volta_ms,120800);
});

await check('the trusted pilots\' shortcut works on the test version only',async()=>{
 const bossDev=await signIn(dev,BOSS,'Chefe Dois'),bossMain=await signIn(main,BOSS);
 const shortcut=await lap(bossDev,123,{controls:false});
 assert.equal(shortcut.conferida,true);assert.match(shortcut.caso,/comandos/,'a case to study, on dev');
 const strict=await lap(bossMain,122.5,{controls:false});
 assert.equal(strict.conferida,undefined);assert.match(strict.recusada,/comandos/,'refused on the main link, admin or not');
 assert.equal((await bossMain.get('/api/admin/resumo')).status,200,'still the admin there');
});

await check('the old records come up once per site',async()=>{
 const old=[{circuito:'cascavel',modo:'normal',volta_ms:80000}];
 assert.equal((await anaDev.post('/api/recordes/importar',{recordes:old})).importados,1);
 assert.equal((await anaDev.post('/api/recordes/importar',{recordes:old})).status,409,'once on the test version');
 assert.equal((await anaMain.post('/api/recordes/importar',{recordes:[{circuito:'cascavel',modo:'normal',volta_ms:79000}]})).importados,1,'and once on the main link');
 assert.equal((await anaMain.post('/api/recordes/importar',{recordes:old})).status,409);
 assert.equal(rows("SELECT volta_ms FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Ana Dois' AND r.selo='nao_verificado'")[0].volta_ms,79000,'the better of the two');
 const marks=rows("SELECT importou_em,importou_principal_em FROM usuarios WHERE apelido='Ana Dois'")[0];
 assert.ok(marks.importou_em&&marks.importou_principal_em);
 assert.deepEqual(rows("SELECT detalhe FROM eventos e JOIN usuarios u ON u.id=e.usuario_id WHERE u.apelido='Ana Dois' AND e.tipo='importou' ORDER BY e.id").map(e=>JSON.parse(e.detalhe).site),['dev','principal']);
 const mine=await (await anaMain.go('/api/conta/meus-dados')).json();
 assert.ok(mine.subida_dos_recordes_antigos.dev&&mine.subida_dos_recordes_antigos.principal);
 assert.deepEqual(mine.sessoes.map(s=>s.site).sort(),['dev','principal']);
});

await check('signing out is per site; deleting the account ends it on both',async()=>{
 assert.equal((await anaMain.post('/api/conta/sair',{})).status,200);
 assert.equal((await anaMain.get('/api/conta/eu')).conta,null);
 assert.equal((await anaDev.get('/api/conta/eu')).conta.apelido,'Ana Dois','the test version keeps its session');
 const again=await signIn(main,'600000000000000000002');
 assert.equal((await anaDev.post('/api/conta/apagar',{confirmar:'APAGAR'})).apagada,true);
 assert.equal((await again.get('/api/conta/eu')).conta,null,'gone on the main link too');
 assert.equal(rows("SELECT COUNT(*) AS n FROM usuarios WHERE google_sub='600000000000000000002'")[0].n,0);
 assert.deepEqual(await board(browser(main)),[['Bia Principal',122000,'conferido'],['Chefe Dois',123000,'conferido']].sort((a,b)=>a[1]-b[1]));
});

await check('the panel reads the same data on both sites',async()=>{
 const bossMain=await signIn(main,BOSS),bossDev=await signIn(dev,BOSS);
 const names=async b=>(await b.get('/api/admin/usuarios')).usuarios.map(u=>u.apelido).sort();
 assert.deepEqual(await names(bossMain),await names(bossDev));
 assert.deepEqual(await names(bossMain),['Bia Principal','Chefe Dois']);
});

await dev.close();await main.close();Date.now=realNow;
console.log(`${passed} grupos de verificações dos dois sites num banco só passaram.`);
