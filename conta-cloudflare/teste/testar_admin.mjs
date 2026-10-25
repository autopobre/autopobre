// The admin panel's data (src/admin.js) and the events behind it (src/eventos.js), on a clock the test moves: who may
// see it (signed out, a pilot, an admin), every kind of event and what it carries, at most LOGGED_REFUSALS refusals
// written per ticket, the summary's numbers, the accounts without their Google id, events by kind and page by page,
// the last records, an account's events gone with it (and a nameless "conta_apagada" left), the old ones forgotten,
// and the player's own events in their data.
import assert from 'node:assert/strict';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {CHUNK_EVERY} from '../src/recordes.js';
import {EVENT_DAYS} from '../src/eventos.js';
import {startLocal} from './local.mjs';

const realNow=Date.now;let now=Date.parse('2026-10-26T12:00:00Z');Date.now=()=>now;
const local=await startLocal({port:0,adminSecret:' 400000000000000000009 ,outro'}),ORIGIN=`http://127.0.0.1:${local.port}`;
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});
const sql=(text,...args)=>local.DB.sqlite.prepare(text).all(...args);

function browser(){
 const jar=new Map();
 const go=async(url,init={})=>{
  const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(new URL(url,ORIGIN),{...init,headers,redirect:'manual'});
  for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');c.includes('Max-Age=0')?jar.delete(pair.slice(0,i)):jar.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 };
 const post=async(path,body)=>{const r=await go(path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json().catch(()=>({}))};};
 const get=async path=>{const r=await go(path);return {status:r.status,...await r.json().catch(()=>({}))};};
 return {go,post,get};
}
async function signIn(b,sub){
 local.google.next.sub=sub;
 const start=await b.go('/api/conta/entrar'),fromGoogle=await b.go(start.headers.get('Location'));await b.go(fromGoogle.headers.get('Location'));
}
async function pilot(sub,nickname){const b=browser();await signIn(b,sub);if(nickname)assert.equal((await b.post('/api/conta/apelido',{apelido:nickname})).status,200);return b;}
const ghost=(circuit,time)=>{
 const L=CIRCUITS[circuit].length,R=L/(2*Math.PI),rate=20,n=Math.ceil(time*rate)+1,values=new Float64Array(n*7);
 for(let k=0;k<n;k++){const t=Math.min(k/rate,time),u=t/time,i=k*7;values[i]=R*Math.cos(2*Math.PI*u);values[i+2]=R*Math.sin(2*Math.PI*u);values[i+6]=L*u;}
 return encodeGhost({time,rate,values,brakes:[]});
};
// A clean lap of `time` seconds at Interlagos, a ticket of its own.
async function cleanLap(b,time){
 let ticket=(await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'painel'})).bilhete;
 const send=async body=>{const r=await b.post('/api/recordes/pedaco',{bilhete:ticket,...body});ticket=r.bilhete??ticket;return r;};
 await send({relogio:0,cruzou:true});
 for(let t=CHUNK_EVERY;t<time;t+=CHUNK_EVERY){now+=CHUNK_EVERY*1000;await send({relogio:t});}
 now+=Math.round((time-Math.floor((time-1e-9)/CHUNK_EVERY)*CHUNK_EVERY)*1000);
 return (await send({relogio:time,cruzou:true,volta:{fantasma:ghost('interlagos',time)}})).volta;
}
const ROUTES=['/api/admin/resumo','/api/admin/usuarios','/api/admin/eventos','/api/admin/recordes'];

const boss=await pilot('400000000000000000001','Chefe Pista');
sql("UPDATE usuarios SET admin=1 WHERE google_sub='400000000000000000001'");
const ana=await pilot('400000000000000000002','Ana Volta');

await check('who may see the panel',async()=>{
 for(const path of ROUTES){
  assert.equal((await browser().get(path)).status,401,path);
  const pilotSees=await ana.get(path);assert.equal(pilotSees.status,403,path);assert.match(pilotSees.erro,/administradores/);
  assert.equal((await boss.get(path)).status,200,path);
 }
 assert.equal((await boss.get('/api/conta/eu')).conta.admin,true);
 assert.equal((await ana.get('/api/conta/eu')).conta.admin,undefined,'a pilot is not told about the panel');
});

await check('the events: accounts, sign-ins, nicknames, sign-outs, imports, laps',async()=>{
 now+=60000;await signIn(ana,'400000000000000000002');          // Ana again: "entrou"
 assert.equal((await ana.post('/api/recordes/importar',{recordes:[{circuito:'cascavel',modo:'normal',volta_ms:80000}]})).importados,1);
 const lap=await cleanLap(ana,121);assert.equal(lap.conferida,true);
 // A run whose laps all break (no clean stretch): every lap refused, at most 5 of them written.
 let ticket=(await ana.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'painel'})).bilhete;
 for(let i=0;i<7;i++){now+=60000;const r=await ana.post('/api/recordes/pedaco',{bilhete:ticket,relogio:i*120,cruzou:true,volta:{fantasma:ghost('interlagos',120)}});ticket=r.bilhete;if(i)assert.match(r.volta.recusada,/pausa/);}
 const someone=browser();await signIn(someone,'400000000000000000003');assert.equal((await someone.post('/api/conta/sair',{})).status,200);
 const kinds=sql("SELECT e.tipo,u.apelido,e.detalhe FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id ORDER BY e.id").map(e=>[e.tipo,e.apelido,e.detalhe&&JSON.parse(e.detalhe)]);
 assert.deepEqual(kinds.map(k=>k[0]),['conta_criada','apelido','conta_criada','apelido','entrou','importou','conferida','recusada','recusada','recusada','recusada','recusada','conta_criada','saiu']);
 assert.deepEqual(kinds[3][2],{apelido:'Ana Volta'});assert.deepEqual(kinds[5][2],{recordes:1});
 assert.deepEqual(kinds[6][2],{circuito:'interlagos',modo:'normal',volta_ms:121000});
 assert.match(kinds[8][2].motivo,/pausa/);
 assert.ok(!sql('SELECT detalhe FROM eventos').some(e=>/\d{15,}/.test(e.detalhe??'')),'no Google id in any event');
});

await check('the summary, the accounts, the events page by page, the last records',async()=>{
 const s=await boss.get('/api/admin/resumo');
 assert.deepEqual({contas:s.contas,com_apelido:s.com_apelido,novas_7d:s.novas_7d,entradas_24h:s.entradas_24h,com_sessao:s.com_sessao,conferidos:s.conferidos,antigos:s.antigos,recusadas_7d:s.recusadas_7d},
  {contas:3,com_apelido:2,novas_7d:3,entradas_24h:4,com_sessao:2,conferidos:1,antigos:1,recusadas_7d:5});
 assert.equal(s.recusas_por_motivo[0].n,5);assert.match(s.recusas_por_motivo[0].motivo,/pausa/);assert.equal(s.eventos_por,EVENT_DAYS);
 const users=(await boss.get('/api/admin/usuarios')).usuarios;
 assert.deepEqual(Object.keys(users[0]).sort(),['admin','antigos','apelido','conferidos','criado_em','id','importou_em','recusadas_7d','sessoes','ultimo_login'],'no Google id');
 const a=users.find(u=>u.apelido==='Ana Volta');assert.deepEqual([a.conferidos,a.antigos,a.recusadas_7d,a.sessoes,a.admin],[1,1,5,1,false],'one session: her second sign-in ended the first, same browser');
 assert.equal(users.find(u=>u.apelido==='Chefe Pista').admin,true);
 const refusals=(await boss.get('/api/admin/eventos?tipo=recusada')).eventos;assert.equal(refusals.length,5);assert.equal(refusals[0].apelido,'Ana Volta');
 assert.equal((await boss.get('/api/admin/eventos?tipo=nada')).eventos.length,14,'an unknown kind: all of them');
 const page=(await boss.get('/api/admin/eventos')).eventos,older=(await boss.get(`/api/admin/eventos?antes=${page[3].id}`)).eventos;
 assert.equal(older[0].id,page[4].id,'the next page begins after the last shown');
 const records=(await boss.get('/api/admin/recordes')).recordes;
 assert.deepEqual(records.map(r=>[r.apelido,r.selo,r.volta_ms]).sort(),[['Ana Volta','conferido',121000],['Ana Volta','nao_verificado',80000]]);
});

await check('the player\'s own events in their data, and gone with the account',async()=>{
 const mine=await (await ana.go('/api/conta/meus-dados')).json();
 assert.deepEqual(mine.eventos.map(e=>e.tipo),['conta_criada','apelido','entrou','importou','conferida','recusada','recusada','recusada','recusada','recusada']);
 assert.equal((await ana.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 const left=sql("SELECT tipo,usuario_id FROM eventos WHERE tipo='conta_apagada'");assert.deepEqual(left.map(e=>({...e})),[{tipo:'conta_apagada',usuario_id:null}]);
 assert.equal(sql("SELECT COUNT(*) AS n FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.usuario_id IS NOT NULL AND u.id IS NULL")[0].n,0,'none of hers left');
 assert.equal((await boss.get('/api/admin/eventos?tipo=conta_apagada')).eventos[0].apelido,null);
});

await check(`events older than ${EVENT_DAYS} days are forgotten at the next sign-in`,async()=>{
 local.DB.sqlite.prepare("INSERT INTO eventos (quando,tipo) VALUES (?,'entrou')").run(now-(EVENT_DAYS+1)*86400000);
 const before=sql('SELECT COUNT(*) AS n FROM eventos')[0].n;
 now+=1000;await signIn(boss,'400000000000000000001');
 assert.equal(sql('SELECT COUNT(*) AS n FROM eventos')[0].n,before,'one old gone, one sign-in in');
 assert.equal(sql('SELECT COUNT(*) AS n FROM eventos WHERE quando<?',now-EVENT_DAYS*86400000)[0].n,0);
});

await check("the Worker's ADMINS secret makes an admin by Google id, without the database's mark",async()=>{
 const listed=await pilot('400000000000000000009','Listado Admin');
 for(const path of ROUTES)assert.equal((await listed.get(path)).status,200,path);
 assert.equal((await listed.get('/api/conta/eu')).conta.admin,true);
 assert.equal((await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.apelido==='Listado Admin').admin,true);
 assert.equal(sql("SELECT admin FROM usuarios WHERE google_sub='400000000000000000009'")[0].admin,0,'no mark in the database');
 const other=await pilot('400000000000000000010','Nao Listado');assert.equal((await other.get('/api/admin/resumo')).status,403,'an id not in the list');
});

await local.close();Date.now=realNow;
console.log(`${passed} grupos de verificações do painel passaram.`);
