// The admin panel's data (src/admin.js) and the events behind it (src/eventos.js), on a clock the test moves: who may
// see it (signed out, a pilot, an admin), every kind of event and what it carries, at most LOGGED_REFUSALS refusals
// written per ticket, the summary's numbers, the accounts without their Google id, events by kind and page by page,
// the last records, an account's events gone with it (and a nameless "conta_apagada" left), the old ones forgotten,
// and the player's own events in their data.
import assert from 'node:assert/strict';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {packSteps,packKeys} from '../../pista_interlagos/teste/comandos-volta.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {CHUNK_EVERY} from '../src/recordes.js';
import {EVENT_DAYS} from '../src/eventos.js';
import {startLocal} from './local.mjs';
import {isTrusted} from '../src/base.js';
import {aiLaps,lapAt} from './voltas_ia.mjs';

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
// The AI's flying lap of the circuit on a clock of `time` seconds (voltas_ia.mjs), as the game encodes it.
const ghost=(circuit,time)=>encodeGhost(lapAt(aiLaps(circuit)[1].lap,time));
// A clean lap of `time` seconds at Interlagos, a ticket of its own (without its controls, or with the throttle never on
// ('idle'): refused, and reviewable when it would have been the pilot's best).
async function cleanLap(b,time,{controls=true}={}){
 let ticket=(await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'painel'})).bilhete;
 const send=async body=>{const r=await b.post('/api/recordes/pedaco',{bilhete:ticket,...body});ticket=r.bilhete??ticket;return r;};
 await send({relogio:0,cruzou:true});
 for(let t=CHUNK_EVERY;t<time;t+=CHUNK_EVERY){now+=CHUNK_EVERY*1000;await send({relogio:t});}
 now+=Math.round((time-Math.floor((time-1e-9)/CHUNK_EVERY)*CHUNK_EVERY)*1000);
 const steps=Math.round(time*120),comandos={v:1,n:steps,s:1,data:packSteps([[0,[controls==='idle'?0:100,0,0,0,-2,0]]],steps),keys:packKeys([]),r:0,dev:[steps,0,0,0,0]};
 return (await send({relogio:time,cruzou:true,volta:{fantasma:ghost('interlagos',time),...(controls&&{comandos})}})).volta;
}
const ROUTES=['/api/admin/resumo','/api/admin/usuarios','/api/admin/eventos','/api/admin/recordes','/api/admin/voltas'];

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
 for(let i=0;i<7;i++){now+=60000;const r=await ana.post('/api/recordes/pedaco',{bilhete:ticket,relogio:i*120,cruzou:true,volta:{fantasma:ghost('interlagos',120)}});ticket=r.bilhete;assert.match(r.volta.recusada,i?/60 s sem falar com o servidor/:/começou antes/);}
 const someone=browser();await signIn(someone,'400000000000000000003');assert.equal((await someone.post('/api/conta/sair',{})).status,200);
 const kinds=sql("SELECT e.tipo,u.apelido,e.detalhe FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id ORDER BY e.id").map(e=>[e.tipo,e.apelido,e.detalhe&&JSON.parse(e.detalhe)]);
 assert.deepEqual(kinds.map(k=>k[0]),['conta_criada','apelido','conta_criada','apelido','entrou','importou','conferida','recusada','recusada','recusada','recusada','recusada','conta_criada','saiu']);
 assert.deepEqual(kinds[3][2],{apelido:'Ana Volta'});assert.deepEqual(kinds[5][2],{recordes:1,site:'dev'});
 assert.deepEqual(kinds[6][2],{circuito:'interlagos',modo:'normal',volta_ms:121000});
 assert.match(kinds[8][2].motivo,/sem falar com o servidor/);
 assert.ok(!sql('SELECT detalhe FROM eventos').some(e=>/\d{15,}/.test(e.detalhe??'')),'no Google id in any event');
});

await check('the summary, the accounts, the events page by page, the last records',async()=>{
 const s=await boss.get('/api/admin/resumo');
 assert.deepEqual({contas:s.contas,com_apelido:s.com_apelido,novas_7d:s.novas_7d,entradas_24h:s.entradas_24h,com_sessao:s.com_sessao,conferidos:s.conferidos,antigos:s.antigos,recusadas_7d:s.recusadas_7d},
  {contas:3,com_apelido:2,novas_7d:3,entradas_24h:4,com_sessao:2,conferidos:1,antigos:1,recusadas_7d:5});
 assert.equal(s.recusas_por_motivo[0].n,4);assert.match(s.recusas_por_motivo[0].motivo,/60 s sem falar/);assert.equal(s.eventos_por,EVENT_DAYS);
 const users=(await boss.get('/api/admin/usuarios')).usuarios;
 assert.deepEqual(Object.keys(users[0]).sort(),['admin','antigos','apelido','conferidas','conferidos','corridas','criado_em','dias','gerente_palpites','id','importou_em','importou_principal_em','pistas','recusadas_7d','ritmo','sessoes','sinalizadas_7d','ultimo_login','voltas'],'no Google id');
 const a=users.find(u=>u.apelido==='Ana Volta');assert.deepEqual([a.conferidos,a.antigos,a.recusadas_7d,a.sessoes,a.admin],[1,1,5,1,false],'one session: her second sign-in ended the first, same browser');
 assert.equal(users.find(u=>u.apelido==='Chefe Pista').admin,true);
 const refusals=(await boss.get('/api/admin/eventos?tipo=recusada')).eventos;assert.equal(refusals.length,5);assert.equal(refusals[0].apelido,'Ana Volta');
 assert.equal((await boss.get('/api/admin/eventos?tipo=nada')).eventos.length,14,'an unknown kind: all of them');
 const page=(await boss.get('/api/admin/eventos')).eventos,older=(await boss.get(`/api/admin/eventos?antes=${page[3].id}`)).eventos;
 assert.equal(older[0].id,page[4].id,'the next page begins after the last shown');
 const records=(await boss.get('/api/admin/recordes')).recordes;
 assert.deepEqual(records.map(r=>[r.apelido,r.selo,r.volta_ms]).sort(),[['Ana Volta','conferido',121000],['Ana Volta','nao_verificado',80000]]);
});

await check('the laps with their signals, and a record taken off the boards',async()=>{
 const laps=(await boss.get('/api/admin/voltas')).voltas;
 assert.equal(laps.length,8);const clean=laps.find(v=>v.resultado==='recorde');
 assert.deepEqual([clean.apelido,clean.tempo_ms,clean.aparelho,clean.sinais.sinais],['Ana Volta',121000,'teclado',[]]);assert.ok(!('freios' in clean),'brake points stay out');
 assert.match(laps.find(v=>v.resultado!=='recorde').resultado,/sem falar com o servidor/);
 assert.equal((await boss.get('/api/admin/voltas?sinalizadas=1')).voltas.length,0,'none flagged');
 assert.equal((await boss.get('/api/admin/recordes')).recordes.find(r=>r.selo==='conferido').sinais.aparelho,'teclado','a record keeps its lap\'s signals');
 const old=(await boss.get('/api/admin/recordes')).recordes.find(r=>r.selo==='nao_verificado');
 assert.equal((await ana.post('/api/admin/remover',{recorde:old.id})).status,403,'a pilot cannot');
 assert.equal((await browser().post('/api/admin/remover',{recorde:old.id})).status,401);
 assert.equal((await boss.post('/api/admin/remover',{recorde:'x'})).status,400);
 assert.equal((await boss.post('/api/admin/remover',{recorde:old.id})).removido,true);
 assert.equal((await boss.post('/api/admin/remover',{recorde:old.id})).status,404,'gone already');
 assert.ok(!(await boss.get('/api/admin/recordes')).recordes.some(r=>r.id===old.id));
 const told=(await boss.get('/api/admin/eventos?tipo=removido')).eventos[0];
 assert.equal(told.apelido,'Ana Volta');assert.deepEqual(told.detalhe,{circuito:'cascavel',modo:'normal',selo:'nao_verificado',volta_ms:80000});
});

await check('a review: the pilot asks, the admin approves it into a record or refuses it',async()=>{
 const asked=[];
 for(const time of [119,118]){const lap=await cleanLap(ana,time,{controls:false});assert.ok(lap.revisao,JSON.stringify(lap));assert.equal((await ana.post('/api/recordes/revisao',{volta:lap.revisao})).revisao,'pedida');asked.push(lap.revisao);}
 assert.equal((await boss.get('/api/admin/resumo')).revisoes,2);
 const waiting=(await boss.get('/api/admin/revisoes')).revisoes;
 assert.deepEqual(waiting.map(v=>[v.apelido,v.tempo_ms,v.carro,v.revisao]),[['Ana Volta',119000,'opala','pedida'],['Ana Volta',118000,'opala','pedida']]);
 assert.match(waiting[0].resultado,/sem os comandos/);assert.ok(!('fantasma' in waiting[0]),'the ghost stays on the server');
 assert.equal((await ana.post('/api/admin/revisar',{volta:asked[0],aprovar:true})).status,403,'a pilot cannot');
 assert.equal((await boss.post('/api/admin/revisar',{volta:asked[0],aprovar:'sim'})).status,400);
 assert.equal((await boss.post('/api/admin/revisar',{volta:asked[1],aprovar:false})).revisao,'recusada');
 assert.equal((await boss.post('/api/admin/revisar',{volta:asked[0],aprovar:true})).revisao,'aprovada');
 assert.equal((await boss.post('/api/admin/revisar',{volta:asked[0],aprovar:true})).status,404,'decided already');
 const rec=(await boss.get('/api/admin/recordes')).recordes.find(r=>r.apelido==='Ana Volta'&&r.selo==='conferido');
 assert.deepEqual([rec.volta_ms,rec.sinais.revisada,rec.sinais.aparelho],[119000,true,null],'the approved lap is her checked record, marked reviewed');
 assert.ok(sql('SELECT fantasma FROM recordes WHERE volta_ms=119000')[0]?.fantasma?.includes('"v":1'),'with its ghost');
 assert.deepEqual((await boss.get('/api/admin/revisoes')).revisoes.map(v=>v.revisao),['aprovada','recusada'],'nothing waits; the decided ones listed, by their laps');
 const told=(await boss.get('/api/admin/eventos?tipo=revisao')).eventos.map(e=>e.detalhe.aprovada);assert.deepEqual(told.sort(),[false,true]);
});

await check('a trusted pilot\'s lap the checks would refuse goes in all the same, as a case to study',async()=>{
 // The boss is an admin, so trusted: a lap with the throttle never on (the checks refuse it) is checked all the same.
 const lap=await cleanLap(boss,124,{controls:'idle'});
 assert.deepEqual([lap.conferida,lap.recorde],[true,true],JSON.stringify(lap));assert.match(lap.caso,/sem acelerar/);
 const list=(await boss.get('/api/admin/casos')).casos;
 assert.deepEqual(list.map(c=>[c.apelido,c.tempo_ms,c.carro]),[['Chefe Pista',124000,'opala']]);assert.match(list[0].caso,/sem acelerar/);
 assert.equal((await boss.get('/api/admin/resumo')).casos,1);
 const r=await boss.go('/api/admin/caso?volta='+list[0].id),file=await r.json();
 assert.match(r.headers.get('content-disposition'),/attachment; filename="caso-\d+-interlagos.json"/);
 assert.deepEqual([file.fantasma.v,file.comandos.v,file.comandos.n],[1,1,124*120],'the whole lap: its ghost and its controls');
 assert.equal((await ana.get('/api/admin/caso?volta='+list[0].id)).status,403,'admins only');
 assert.equal((await boss.get('/api/admin/caso?volta=999999')).status,404);
 const rec=(await boss.get('/api/admin/recordes')).recordes.find(x=>x.apelido==='Chefe Pista');
 assert.deepEqual([rec.selo,rec.sinais.confiavel],['conferido',true]);assert.match(rec.sinais.caso,/sem acelerar/);
 // Not trusted: the same lap is refused (Ana's, the throttle never on).
 assert.ok((await cleanLap(ana,125,{controls:'idle'})).recusada);
 // Trusted by the Worker's CONFIAVEIS secret too, without being an admin; on the test version only (SITE dev).
 const dev={SITE:'dev'};
 assert.equal(isTrusted({...dev,CONFIAVEIS:' 1 ,22'},{google_sub:'22',admin:0}),true);assert.equal(isTrusted({...dev,CONFIAVEIS:'1'},{google_sub:'22',admin:0}),false);
 assert.equal(isTrusted(dev,{google_sub:'22',admin:1}),true,'an admin');assert.equal(isTrusted({...dev,CONFIAVEIS:'22'},{gone:true}),false);
 for(const env of [{SITE:'principal',CONFIAVEIS:'22'},{CONFIAVEIS:'22'}])
  assert.equal(isTrusted(env,{google_sub:'22',admin:1}),false,'the main link (or a Worker without SITE) checks every lap');
});

await check('how much each pilot drives: races (each ticket), laps, days, the circuits, the pace against the driving line',async()=>{
 const anaId=sql("SELECT id FROM usuarios WHERE apelido='Ana Volta'")[0].id,count=(table,id)=>sql(`SELECT COUNT(*) AS n FROM ${table} WHERE usuario_id=?`,id)[0].n;
 const list=(await boss.get('/api/admin/usuarios')).usuarios,a=list.find(u=>u.apelido==='Ana Volta');
 assert.ok(a.corridas>=4,`a race each time on track (${a.corridas})`);assert.equal(a.corridas,count('corridas',anaId));assert.equal(a.voltas,count('voltas',anaId));
 assert.equal(a.dias,1);assert.deepEqual(a.pistas.map(p=>[p.circuito,p.corridas,p.voltas]),[['interlagos',a.corridas,a.voltas]]);
 // Her checked best (119 s, the reviewed lap) over the Opala's driving line at Interlagos (113.362 s): 105.0%.
 assert.deepEqual(a.ritmo,{valor:1.05,circuito:'interlagos',carro:'opala'});assert.deepEqual(a.pistas[0].melhor.opala,{ms:119000,ritmo:1.05});
 await pilot('400000000000000000014','So Login');const idle=(await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.apelido==='So Login');
 assert.deepEqual([idle.corridas,idle.voltas,idle.dias,idle.pistas,idle.ritmo],[0,0,0,[],null],'signed in, never on track');
 // Up to 30 races an hour are written; more tickets are answered all the same.
 const busy=await pilot('400000000000000000013','Muitas Largadas'),busyId=sql("SELECT id FROM usuarios WHERE apelido='Muitas Largadas'")[0].id;
 for(let i=0;i<32;i++)assert.equal((await busy.post('/api/recordes/bilhete',{circuito:'curvelo',modo:'normal',carro:'fusca',versao:'painel'})).status,200);
 assert.equal(count('corridas',busyId),30);
 const b=(await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.apelido==='Muitas Largadas');
 assert.deepEqual([b.corridas,b.voltas,b.ritmo,b.pistas[0].circuito],[30,0,null,'curvelo']);
});

await check('the player\'s own events in their data, and gone with the account',async()=>{
 const mine=await (await ana.go('/api/conta/meus-dados')).json();
 assert.deepEqual(mine.eventos.map(e=>e.tipo),['conta_criada','apelido','entrou','importou','conferida','recusada','recusada','recusada','recusada','recusada','removido','revisao_pedida','revisao_pedida','revisao','revisao']);
 assert.equal(mine.voltas.length,11,'her laps: the clean one, the seven broken, the two reviewed and the idle one');assert.equal(mine.voltas.filter(v=>v.fantasma).length,9,'the laps that would have been her best keep their ghosts (the seven broken ones too)');
 assert.equal(mine.corridas.length,sql("SELECT COUNT(*) AS n FROM corridas c JOIN usuarios u ON u.id=c.usuario_id WHERE u.apelido='Ana Volta'")[0].n,'her races in her data');assert.deepEqual(Object.keys(mine.corridas[0]).sort(),['carro','circuito','modo','quando']);
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

await check('the admin gives a reserved nickname to whoever it belongs to (the real Stevan), and nobody else takes it',async()=>{
 const stevan=await pilot('400000000000000000011','Stevisson'),id=sql("SELECT id FROM usuarios WHERE apelido='Stevisson'")[0].id;
 const self=await stevan.post('/api/conta/apelido',{apelido:'Stevan'});assert.equal(self.status,409);assert.match(self.erro,/reservado/,'a pilot cannot take it');
 assert.equal((await stevan.post('/api/admin/apelido',{usuario:id,apelido:'Stevan'})).status,403,'nor give it to themselves');
 assert.deepEqual(await boss.post('/api/admin/apelido',{usuario:id,apelido:'Stevan'}),{status:200,usuario:{id,apelido:'Stevan'}});
 assert.equal((await stevan.get('/api/conta/eu')).conta.apelido,'Stevan');
 assert.equal((await stevan.post('/api/conta/apelido',{apelido:'STEVAN'})).status,200,'his own name, its case changed');
 const other=await pilot('400000000000000000012','Outro Stevan');
 assert.equal((await other.post('/api/conta/apelido',{apelido:'stevan'})).status,409,'reserved for anyone else');
 assert.equal((await boss.post('/api/admin/apelido',{usuario:sql("SELECT id FROM usuarios WHERE apelido='Outro Stevan'")[0].id,apelido:'Stevan'})).status,409,'taken: one pilot per name');
 for(const [body,status] of [[{usuario:id,apelido:'x'},400],[{usuario:'x',apelido:'Stevan'},400],[{usuario:999999,apelido:'Novo Nome'},404]])assert.equal((await boss.post('/api/admin/apelido',body)).status,status,JSON.stringify(body));
 const given=(await boss.get('/api/admin/eventos?tipo=apelido')).eventos.find(e=>e.detalhe?.pela_administracao);
 assert.deepEqual(given.detalhe,{apelido:'Stevan',pela_administracao:true},'his events say the admin gave it');
});

await local.close();Date.now=realNow;
console.log(`${passed} grupos de verificações do painel passaram.`);
