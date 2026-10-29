// Each pilot's history (migration 0011; src/recordes.js ticket, judge, result; src/admin.js pilots, pilotSheet), on a
// clock the test moves: a ticket declares its race (kind, level, cars, laps) and a wrong one is refused; a race run to
// the flag takes its result once, into the totals; a result that cannot be (laps not crossed, too quick, other cars, a
// practice, an older game's ticket, another account's) is refused; towed in, no place; the panel's pilots and a pilot's
// sheet; the player's data; what an older Worker writes adds up once; the totals outlive the logs' 90 days and go with
// the account; and the migration starts the totals from the logs it finds.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {packSteps,packKeys} from '../../pista_interlagos/teste/comandos-volta.js';
import {CHUNK_EVERY} from '../src/recordes.js';
import {EVENT_DAYS} from '../src/eventos.js';
import {startLocal} from './local.mjs';
import {aiLaps,lapAt} from './voltas_ia.mjs';

const realNow=Date.now;let now=Date.parse('2026-10-28T18:00:00Z');Date.now=()=>now;
const BOSS='700000000000000000001';
const local=await startLocal({port:0,admins:[BOSS]}),ORIGIN=`http://127.0.0.1:${local.port}`;
const sql=(text,...args)=>local.DB.sqlite.prepare(text).all(...args).map(r=>({...r}));
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});

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
async function pilot(sub,nickname){const b=browser();await signIn(b,sub);assert.equal((await b.post('/api/conta/apelido',{apelido:nickname})).status,200);return b;}
const idOf=nickname=>sql('SELECT id FROM usuarios WHERE apelido=?',nickname)[0].id;

// A race at Interlagos on a ticket declaring `race`: the lights at clock 0 (a crossing), then `laps` laps of `time`
// seconds each, the AI's flying lap as the game encodes it with the throttle held from the keyboard, a chunk every
// CHUNK_EVERY seconds, the real clock running with the game's. The ticket as it stands, and each lap's verdict.
async function race(b,race,{laps=race.voltas??2,time=121}={}){
 const r=await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:race.tipo==='historia'?'immersive':'normal',carro:'opala',versao:'historico',...race});
 assert.equal(r.status,200,JSON.stringify(r));
 let ticket=r.bilhete;const start=now,verdicts=[];
 const send=async(clock,body={})=>{now=start+Math.round(clock*1000);const a=await b.post('/api/recordes/pedaco',{bilhete:ticket,relogio:clock,...body});ticket=a.bilhete??ticket;return a;};
 const steps=Math.round(time*120),comandos={v:1,n:steps,s:1,data:packSteps([[0,[100,0,0,0,-2,0]]],steps),keys:packKeys([]),r:0,dev:[steps,0,0,0,0]};
 const fantasma=encodeGhost(lapAt(aiLaps('interlagos')[1].lap,time));
 await send(0,{cruzou:true});
 for(let k=1;k<=laps;k++){
  for(let t=(k-1)*time+CHUNK_EVERY;t<k*time;t+=CHUNK_EVERY)await send(t);
  verdicts.push((await send(k*time,{cruzou:true,volta:{fantasma,comandos}})).volta);
 }
 return {ticket:()=>ticket,verdicts,send};
}
const GRID={tipo:'corrida',nivel:'alto',carros:15,voltas:2};
const result=(b,run,body)=>b.post('/api/recordes/resultado',{bilhete:run.ticket(),...body});
const totals=id=>sql('SELECT circuito,carro,tipo,nivel,corridas,voltas,conferidas,resultados,terminadas,vitorias,podios,soma_posicoes FROM totais WHERE usuario_id=? ORDER BY tipo,nivel',id);

const boss=await pilot(BOSS,'Chefe Historico');
const ana=await pilot('700000000000000000002','Ana Historia');

await check('a ticket declares its race; a wrong kind, level, cars or laps is refused, and an older game says none',async()=>{
 for(const wrong of [{tipo:'arrancada'},{nivel:'dificil'},{carros:0},{carros:41},{voltas:1.5},{voltas:'3'},{tipo:3}]){
  const r=await ana.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'historico',...wrong});
  assert.equal(r.status,400,JSON.stringify(wrong));assert.match(r.erro,/inválidos/);
 }
 assert.equal((await ana.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'velha'})).status,200,'an older game');
 assert.equal((await ana.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'historico',...GRID})).status,200);
 const logged=sql('SELECT tipo,nivel,carros,voltas,posicao,terminou,resultado_em FROM corridas WHERE usuario_id=? ORDER BY id',idOf('Ana Historia'));
 assert.deepEqual(logged,[{tipo:null,nivel:null,carros:null,voltas:null,posicao:null,terminou:null,resultado_em:null},{...GRID,posicao:null,terminou:null,resultado_em:null}]);
 assert.deepEqual(totals(idOf('Ana Historia')).map(t=>[t.tipo,t.nivel,t.corridas]),[['','',1],['corrida','alto',1]],'each into its own totals');
});

await check('a race run to the flag takes its result once, into the totals',async()=>{
 const id=idOf('Ana Historia'),before=totals(id).find(t=>t.tipo==='corrida');
 const run=await race(ana,GRID);
 assert.deepEqual(run.verdicts.map(v=>v.conferida),[true,true],JSON.stringify(run.verdicts));
 assert.deepEqual(await result(ana,run,{carros:15,terminou:true,posicao:1}),{status:200,resultado:{posicao:1,carros:15}});
 const again=await result(ana,run,{carros:15,terminou:true,posicao:1});assert.equal(again.status,409);assert.match(again.erro,/já foi registrado/);
 const row=sql('SELECT posicao,terminou,resultado_em FROM corridas WHERE usuario_id=? ORDER BY id DESC LIMIT 1',id)[0];
 assert.deepEqual([row.posicao,row.terminou,row.resultado_em],[1,1,now]);
 const t=totals(id).find(x=>x.tipo==='corrida');
 assert.deepEqual({...t,corridas:t.corridas-before.corridas},{circuito:'interlagos',carro:'opala',tipo:'corrida',nivel:'alto',corridas:1,voltas:2,conferidas:2,resultados:1,terminadas:1,vitorias:1,podios:1,soma_posicoes:1});
 // A third place on the next one: a podium, no win.
 const next=await race(ana,GRID);assert.equal((await result(ana,next,{carros:15,terminou:true,posicao:3})).status,200);
 assert.deepEqual(totals(id).filter(x=>x.tipo==='corrida').map(x=>[x.resultados,x.vitorias,x.podios,x.soma_posicoes]),[[2,1,2,4]]);
});

await check('a result that cannot be is refused: laps not crossed, too quick, other cars, a place out of the field, practice, an older game, another account',async()=>{
 const id=idOf('Ana Historia'),count=()=>sql('SELECT SUM(resultados) AS n FROM totais WHERE usuario_id=?',id)[0].n;
 const had=count();
 const early=await race(ana,{...GRID,voltas:3},{laps:2});
 const notSeen=await result(ana,early,{carros:15,terminou:true,posicao:1});assert.equal(notSeen.status,409);assert.match(notSeen.erro,/não viu esta corrida chegar ao fim/,'two laps of three crossed');
 // Three crossings in 30 s of game clock: the laps crossed, but quicker than the circuit allows.
 const quick=await ana.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'historico',...GRID});
 let ticket=quick.bilhete;const t0=now;
 for(const clock of [0,10,20]){now=t0+clock*1000;ticket=(await ana.post('/api/recordes/pedaco',{bilhete:ticket,relogio:clock,cruzou:true})).bilhete;}
 assert.match((await ana.post('/api/recordes/resultado',{bilhete:ticket,carros:15,terminou:true,posicao:1})).erro,/não viu/);
 const run=await race(ana,GRID);
 for(const [body,why] of [[{carros:14,terminou:true,posicao:1},'other cars than the ticket\'s'],[{carros:15,terminou:true,posicao:16},'a place out of the field'],
  [{carros:15,terminou:true,posicao:0},'no place 0'],[{carros:15,terminou:'sim',posicao:1},'finished is yes or no'],[{carros:15,terminou:true},'finished needs a place']])
  assert.equal((await result(ana,run,body)).status,400,why);
 const other=await pilot('700000000000000000003','Bia Outra');
 assert.match((await result(other,run,{carros:15,terminou:true,posicao:1})).erro,/outra conta/);
 assert.equal((await result(ana,run,{carros:15,terminou:true,posicao:2})).status,200,'the right one, at last');
 const practice=await race(ana,{tipo:'treino',nivel:'alto',carros:1},{laps:1});
 assert.match((await result(ana,practice,{carros:1,terminou:true,posicao:1})).erro,/não tem resultado/);
 const old=await race(ana,{},{laps:2});
 assert.match((await result(ana,old,{carros:15,terminou:true,posicao:1})).erro,/não tem resultado/,'an older game\'s ticket said no cars or laps');
 assert.equal((await ana.post('/api/recordes/resultado',{bilhete:'nada',carros:15,terminou:true,posicao:1})).status,409);
 assert.equal(count(),had+1,'only the right one added a result');
});

await check('towed in (Modo História): a result with no place and no laps to see',async()=>{
 const id=idOf('Ana Historia');
 const story=await race(ana,{tipo:'historia',nivel:'medio',carros:15,voltas:8},{laps:1});
 assert.equal((await result(ana,story,{carros:15,terminou:true,posicao:1})).status,409,'one lap of eight: not at the flag');
 assert.deepEqual(await result(ana,story,{carros:15,terminou:false,posicao:4}),{status:200,resultado:{terminou:false}},'a place sent with it is left out');
 assert.deepEqual(sql('SELECT posicao,terminou FROM corridas WHERE usuario_id=? ORDER BY id DESC LIMIT 1',id)[0],{posicao:null,terminou:0});
 assert.deepEqual(totals(id).filter(t=>t.tipo==='historia').map(t=>[t.nivel,t.corridas,t.voltas,t.resultados,t.terminadas,t.vitorias,t.podios]),[['medio',1,1,1,0,0,0]]);
});

await check('the panel: the pilots with their wins and podiums since always, and a pilot\'s sheet',async()=>{
 const id=idOf('Ana Historia');
 const a=(await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.apelido==='Ana Historia');
 const sum=k=>totals(id).reduce((s,t)=>s+t[k],0);
 assert.deepEqual([a.corridas,a.voltas,a.resultados,a.vitorias,a.podios],[sum('corridas'),sum('voltas'),4,1,3]);
 assert.deepEqual(a.pistas.map(p=>[p.circuito,p.vitorias,p.podios]),[['interlagos',1,3]]);
 assert.equal((await ana.get('/api/admin/piloto?id='+id)).status,403,'admins only');
 assert.equal((await browser().get('/api/admin/piloto?id='+id)).status,401);
 for(const [q,status] of [['x',400],['0',400],['999999',404]])assert.equal((await boss.get('/api/admin/piloto?id='+q)).status,status,q);
 const sheet=await boss.get('/api/admin/piloto?id='+id);
 assert.deepEqual(Object.keys(sheet.piloto).sort(),['apelido','criado_em','id','ultimo_login'],'no Google id');
 assert.equal(sheet.corridas_por,EVENT_DAYS);
 assert.deepEqual(sheet.totais.map(t=>t.tipo).sort(),['','corrida','historia','treino'],'an older game\'s races together, the rest by kind');
 assert.deepEqual(sheet.recordes.map(r=>[r.modo,r.selo,r.volta_ms]).sort(),[['immersive','conferido',121000],['normal','conferido',121000]],'a race\'s and the story\'s');
 assert.ok(sheet.recordes.every(r=>r.ritmo>1&&r.ritmo<1.1),'her pace over the driving line');
 assert.deepEqual(sheet.corridas[0],{...sheet.corridas[0],tipo:'historia',posicao:null,terminou:0},'the last race first');
 assert.deepEqual(sheet.corridas.filter(r=>r.resultado_em).map(r=>[r.tipo,r.posicao]),[['historia',null],['corrida',2],['corrida',3],['corrida',1]]);
});

await check('the player\'s data carries the totals and how each race ended',async()=>{
 const mine=await (await ana.go('/api/conta/meus-dados')).json();
 const won=mine.corridas.find(r=>r.posicao===1);
 assert.deepEqual(Object.keys(won).sort(),['carro','carros','circuito','modo','nivel','posicao','quando','resultado_em','terminou','tipo','voltas']);
 assert.equal(won.terminou,true);
 assert.deepEqual(Object.keys(mine.corridas[0]).sort(),['carro','circuito','modo','quando'],'an older game\'s race: what it had');
 const t=mine.totais.find(x=>x.tipo==='corrida');
 assert.deepEqual([t.corridas>=3,t.vitorias,t.podios,t.resultados],[true,1,3,3]);
 assert.equal(mine.totais.find(x=>x.tipo===null).nivel,null,'"" is said as nothing');
});

await check('a race or lap an older Worker wrote (no mark) adds up once: as the panel reads the pilots, or at a sign-in before it is forgotten',async()=>{
 const id=idOf('Ana Historia'),sum=k=>totals(id).reduce((s,t)=>s+t[k],0),before={corridas:sum('corridas'),voltas:sum('voltas'),conferidas:sum('conferidas')};
 assert.equal(sql('SELECT COUNT(*) AS n FROM corridas WHERE somada IS NULL')[0].n+sql('SELECT COUNT(*) AS n FROM voltas WHERE somada IS NULL')[0].n,0,'this Worker marks what it adds');
 // The main link's Worker before this one: a race and two laps, no kind, no mark.
 const old=(when,circuito='interlagos')=>{
  local.DB.sqlite.prepare("INSERT INTO corridas (usuario_id,quando,circuito,modo,carro) VALUES (?,?,?,'normal','opala')").run(id,when,circuito);
  for(const resultado of ['conferida','o carro saiu do traçado da pista'])local.DB.sqlite.prepare("INSERT INTO voltas (usuario_id,quando,circuito,modo,carro,tempo_ms,resultado) VALUES (?,?,?,'normal','opala',121000,?)").run(id,when,circuito,resultado);
 };
 old(now-60000);
 for(let i=0;i<2;i++)assert.equal((await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.apelido==='Ana Historia').corridas,before.corridas+1,'added once, read twice');
 assert.deepEqual({corridas:sum('corridas'),voltas:sum('voltas'),conferidas:sum('conferidas')},{corridas:before.corridas+1,voltas:before.voltas+2,conferidas:before.conferidas+1});
 // One written long ago (past the logs' days) that no panel read: added at the next sign-in, then forgotten.
 old(now-(EVENT_DAYS+5)*86400000,'cascavel');
 await signIn(boss,BOSS);
 assert.equal(sql("SELECT COUNT(*) AS n FROM corridas WHERE circuito='cascavel' AND usuario_id=?",id)[0].n+sql("SELECT COUNT(*) AS n FROM voltas WHERE circuito='cascavel' AND usuario_id=?",id)[0].n,0,'forgotten');
 assert.deepEqual(totals(id).filter(t=>t.circuito==='cascavel'&&t.tipo==='').map(t=>[t.corridas,t.voltas,t.conferidas]),[[1,2,1]],'but added first');
});

await check(`the totals outlive the logs' ${EVENT_DAYS} days, and go with the account`,async()=>{
 const id=idOf('Ana Historia'),kept=totals(id);
 now+=(EVENT_DAYS+1)*86400000;await signIn(boss,BOSS);
 assert.equal(sql('SELECT COUNT(*) AS n FROM corridas WHERE usuario_id=?',id)[0].n,0,'her races forgotten');
 assert.equal(sql('SELECT COUNT(*) AS n FROM voltas WHERE usuario_id=?',id)[0].n,0,'and her laps');
 assert.deepEqual(totals(id),kept,'her totals stay');
 const a=(await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.apelido==='Ana Historia');
 assert.deepEqual([a.corridas,a.vitorias,a.podios,a.dias],[kept.reduce((s,t)=>s+t.corridas,0),1,3,0],'the panel counts since always, the days only within the logs');
 assert.deepEqual((await boss.get('/api/admin/piloto?id='+id)).corridas,[]);
 await signIn(ana,'700000000000000000002');
 assert.equal((await ana.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 assert.equal(sql('SELECT COUNT(*) AS n FROM totais WHERE usuario_id=?',id)[0].n,0,'gone with the account');
});

await check('the migration starts the totals from the races and laps it finds',async()=>{
 const db=new DatabaseSync(':memory:'),dir=fileURLToPath(new URL('../migracoes/',import.meta.url));
 const names=readdirSync(dir).filter(n=>n.endsWith('.sql')).sort(),at=names.indexOf('0011_historico.sql');assert.ok(at>0);
 for(const name of names.slice(0,at))db.exec(readFileSync(dir+name,'utf8'));
 db.exec("INSERT INTO usuarios (id,google_sub,criado_em,ultimo_login) VALUES (1,'a',0,0),(2,'b',0,0)");
 const race=db.prepare('INSERT INTO corridas (usuario_id,quando,circuito,modo,carro) VALUES (?,?,?,?,?)'),lap=db.prepare('INSERT INTO voltas (usuario_id,quando,circuito,modo,carro,tempo_ms,resultado) VALUES (?,?,?,?,?,?,?)');
 race.run(1,100,'interlagos','normal','opala');race.run(1,300,'interlagos','immersive','opala');race.run(1,200,'curvelo','normal','fusca');race.run(2,50,'interlagos','normal','opala');
 lap.run(1,150,'interlagos','normal','opala',121000,'recorde');lap.run(1,160,'interlagos','normal','opala',122000,'conferida');lap.run(1,170,'interlagos','normal',null,90000,'a volta foi rápida demais');
 lap.run(2,40,'brasilia','normal','opala',100000,'conferida');
 for(const name of names.slice(at))db.exec(readFileSync(dir+name,'utf8'));
 const got=db.prepare('SELECT usuario_id AS u,circuito AS c,carro AS k,tipo,nivel,corridas,voltas,conferidas,primeira_em,ultima_em FROM totais ORDER BY u,c,k').all().map(r=>({...r}));
 assert.deepEqual(got,[
  {u:1,c:'curvelo',k:'fusca',tipo:'',nivel:'',corridas:1,voltas:0,conferidas:0,primeira_em:200,ultima_em:200},
  {u:1,c:'interlagos',k:'opala',tipo:'',nivel:'',corridas:2,voltas:3,conferidas:2,primeira_em:100,ultima_em:300},
  {u:2,c:'brasilia',k:'opala',tipo:'',nivel:'',corridas:0,voltas:1,conferidas:1,primeira_em:40,ultima_em:40},
  {u:2,c:'interlagos',k:'opala',tipo:'',nivel:'',corridas:1,voltas:0,conferidas:0,primeira_em:50,ultima_em:50}]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM corridas WHERE somada IS NULL').get().n+db.prepare('SELECT COUNT(*) AS n FROM voltas WHERE somada IS NULL').get().n,0,'all marked: never added twice');
});

await local.close();Date.now=realNow;
console.log(`${passed} grupos de verificações do histórico dos pilotos passaram.`);
