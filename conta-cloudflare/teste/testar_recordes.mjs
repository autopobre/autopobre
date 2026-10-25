// The online records end to end on this machine (teste/local.mjs), on a clock the test moves: the ticket,
// a clean lap (checked, kept as the pilot's best, on the board), and every lap the server must refuse
// (pause, slow motion, a clock running ahead, a lap too quick for the track, ghosts that are not the lap),
// tampered and outdated tickets, the old records' one-way import and its deadline, the board, the
// circuits' bests, and the records in the player's data and gone with the account.
import assert from 'node:assert/strict';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {readGhost,ghostProblem,IMPORT_UNTIL,CHUNK_EVERY} from '../src/recordes.js';
import {startLocal} from './local.mjs';

const realNow=Date.now;let now=Date.parse('2026-10-25T12:00:00Z');Date.now=()=>now;
const local=await startLocal({port:0}),ORIGIN=`http://127.0.0.1:${local.port}`;
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});
const rows=sql=>local.DB.sqlite.prepare(sql).all();

function browser(){
 const jar=new Map();
 const go=async(url,init={})=>{
  const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(new URL(url,ORIGIN),{...init,headers,redirect:'manual'});
  for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');c.includes('Max-Age=0')?jar.delete(pair.slice(0,i)):jar.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 };
 const post=async(path,body)=>{const r=await go(path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json().catch(()=>({}))};};
 return {jar,go,post};
}
// A pilot signed in (the stand-in Google hands back `sub`), with a nickname when given one.
async function pilot(sub,nickname){
 const b=browser();local.google.next.sub=sub;
 const start=await b.go('/api/conta/entrar'),fromGoogle=await b.go(start.headers.get('Location'));await b.go(fromGoogle.headers.get('Location'));
 if(nickname)assert.equal((await b.post('/api/conta/apelido',{apelido:nickname})).status,200);
 return b;
}
// A lap's ghost as the game would record it: once around a ring as long as the track, at even speed.
// spoil changes one thing about it.
function ghost(circuit,time,spoil={}){
 const L=(spoil.length??1)*CIRCUITS[circuit].length,R=L/(2*Math.PI),rate=20,n=Math.floor(time*rate)+1+(time*rate%1?1:0),values=new Float64Array(n*7);
 for(let k=0;k<n;k++){const t=k===n-1?time:k/rate,u=t/time,i=k*7;values[i]=R*Math.cos(2*Math.PI*u);values[i+2]=R*Math.sin(2*Math.PI*u);values[i+6]=L*u;}
 if(spoil.jump){const i=Math.floor(n/2)*7;values[i]+=200;}   // 200 m in a twentieth of a second (more than 327 m does not fit the game's format at all)
 if(spoil.cut){for(let k=Math.floor(n/2);k<n;k++)values[k*7+6]+=300;}
 return encodeGhost({time:spoil.time??time,rate,values,brakes:[]});
}
// A run: a ticket, then the game's chunks. lap() drives one lap of `time` seconds from the current
// clock: a crossing to begin, a chunk every CHUNK_EVERY seconds, a crossing with the ghost to end. pace:
// real seconds per game second (1: honest); gap: a silence of that many real seconds in the middle.
async function run(b,{circuit='interlagos',mode='normal'}={}){
 const t=await b.post('/api/recordes/bilhete',{circuito:circuit,modo:mode,carro:'opala',versao:'teste1'});
 assert.equal(t.status,200,JSON.stringify(t));
 let ticket=t.bilhete,clock=0;
 const send=async body=>{const r=await b.post('/api/recordes/pedaco',{bilhete:ticket,...body});if(r.bilhete)ticket=r.bilhete;return r;};
 return {
  best:t.melhor,send,
  get ticket(){return ticket;},set ticket(v){ticket=v;},
  async lap(time,{pace=1,gap=0,fantasma=ghost(circuit,time),first=clock===0}={}){
   if(first)await send({relogio:clock,cruzou:true});
   const end=clock+time;
   for(let t=clock+CHUNK_EVERY;t<end;t+=CHUNK_EVERY){
    now+=Math.round(CHUNK_EVERY*pace*1000);if(gap&&t>clock+time/2&&t<=clock+time/2+CHUNK_EVERY)now+=gap*1000;
    await send({relogio:t});
   }
   now+=Math.round((end-Math.floor((time-1e-9)/CHUNK_EVERY)*CHUNK_EVERY-clock)*pace*1000);clock=end;
   return (await send({relogio:end,cruzou:true,volta:{fantasma}})).volta;
  },
 };
}

await check('a ticket needs an account with a nickname, a known circuit, mode, car and build',async()=>{
 assert.equal((await browser().post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'x'})).status,401);
 const nameless=await pilot('200000000000000000001');
 assert.equal((await nameless.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'x'})).status,409);
 const b=await pilot('200000000000000000002','Ana Curva');
 for(const bad of [{circuito:'nada'},{modo:'drift'},{carro:'fusca'},{versao:'../x'},{circuito:'arena'}])
  assert.equal((await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'v1',...bad})).status,400,JSON.stringify(bad));
 const ok=await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'v1'});
 assert.equal(ok.status,200);assert.equal(ok.intervalo,CHUNK_EVERY);assert.equal(ok.melhor,null);
});

await check('a clean lap is checked, kept as the best, and on the board',async()=>{
 const b=await pilot('200000000000000000003','Bia Ventania'),r=await run(b);
 const lap=await r.lap(100);assert.deepEqual(lap,{tempo_ms:100000,conferida:true,recorde:true});
 const slower=await r.lap(103);assert.deepEqual(slower,{tempo_ms:103000,conferida:true,recorde:false},'a slower lap keeps the best');
 const quicker=await r.lap(99.5);assert.equal(quicker.recorde,true);
 assert.equal((await run(b)).best,99500,'the next ticket knows the best');
 const kept=rows("SELECT selo,volta_ms,versao,length(fantasma) AS g FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Bia Ventania'");
 assert.equal(kept.length,1);assert.equal(kept[0].selo,'conferido');assert.equal(kept[0].volta_ms,99500);assert.equal(kept[0].versao,'teste1');assert.ok(kept[0].g>10000,'its ghost is kept');
 const board=await (await b.go('/api/recordes?circuito=interlagos&modo=normal')).json();
 const mine=board.recordes.find(x=>x.apelido==='Bia Ventania');assert.equal(mine.selo,'conferido');assert.equal(mine.volta_ms,99500);assert.equal(mine.meu,true);
 assert.equal((await (await browser().go('/api/recordes?circuito=interlagos&modo=normal')).json()).recordes.find(x=>x.apelido==='Bia Ventania').meu,false,'public, and nobody\'s own when signed out');
});

await check('laps the server refuses',async()=>{
 const b=await pilot('200000000000000000004','Caio Freio');
 const refused=async(options,why,time=100)=>{const r=await run(b),lap=await r.lap(time,options);assert.equal(lap.conferida,undefined,why);assert.match(lap.recusada,why);};
 await refused({gap:20},/pausa|sem sinal/);                          // a pause in the middle
 await refused({pace:1.25},/pausa|devagar/);                        // slow motion: more real time than game time
 await refused({pace:.7},/pausa|devagar/);                          // a clock running ahead
 await refused({},/rápida demais/,40);                              // 40 s around Interlagos
 await refused({fantasma:ghost('interlagos',98)},/fantasma não tem o tempo/);                // another lap's ghost
 await refused({fantasma:ghost('interlagos',100,{time:98})},/não pôde ser lido/);   // a ghost longer than its own time
 await refused({fantasma:ghost('interlagos',100,{length:.6})},/pista inteira/);
 await refused({fantasma:ghost('interlagos',100,{jump:true})},/mais rápido/);
 await refused({fantasma:ghost('interlagos',100,{cut:true})},/ganhou pista|pista inteira/);
 await refused({fantasma:{v:1,time:100,rate:20,n:3,start:[0,0,0,0,0,0,0],data:'AAAA'}},/não pôde ser lido/);
 assert.equal(rows("SELECT COUNT(*) AS n FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Caio Freio'")[0].n,0);
 // A lap begun before the ticket (no crossing seen) is not checked either.
 const late=await run(b);await late.send({relogio:30});now+=5000;await late.send({relogio:35});
 now+=65000;const lap=(await late.send({relogio:100,cruzou:true,volta:{fantasma:ghost('interlagos',100)}})).volta;
 assert.match(lap.recusada,/pausa|sem sinal|devagar/);
});

await check('tickets: sealed, one way in time, with a life',async()=>{
 const b=await pilot('200000000000000000005','Duda Reta'),r=await run(b);
 await r.send({relogio:0,cruzou:true});
 const forged=r.ticket.slice(0,-6)+'AAAAAA';
 assert.equal((await b.post('/api/recordes/pedaco',{bilhete:forged,relogio:5})).status,409);
 now+=5000;assert.equal((await r.send({relogio:5})).status,200);
 assert.equal((await r.send({relogio:2})).status,409,'the clock went back');
 now+=9*3600000;assert.equal((await r.send({relogio:9})).status,409,'a ticket of yesterday');
 assert.equal((await b.post('/api/recordes/pedaco',{bilhete:r.ticket,relogio:-1})).status,409);
 const big='x'.repeat(130000);
 assert.equal((await b.post('/api/recordes/pedaco',{bilhete:r.ticket,relogio:1,cruzou:true,volta:{fantasma:big}})).status,413);
});

await check('old records come up flagged, checked for sense, until the deadline',async()=>{
 const b=await pilot('200000000000000000006','Edu Vaquinha');
 const r=await b.post('/api/recordes/importar',{recordes:[
  {circuito:'interlagos',modo:'normal',volta_ms:98000,data:'2026-09-20T10:00:00Z'},
  {circuito:'interlagos',modo:'normal',volta_ms:97000,data:'2026-09-21T10:00:00Z'},
  {circuito:'cascavel',modo:'immersive',volta_ms:90000,data:'nada'},
  {circuito:'interlagos',modo:'normal',volta_ms:20000},                 // quicker than a lap can be
  {circuito:'arena',modo:'normal',volta_ms:90000},{circuito:'interlagos',modo:'drift',volta_ms:90000},{nada:1},null]});
 assert.equal(r.status,200);assert.equal(r.importados,3);
 const kept=rows("SELECT circuito,selo,volta_ms,versao,feito_em FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Edu Vaquinha' ORDER BY circuito");
 assert.deepEqual(kept.map(k=>[k.circuito,k.selo,k.volta_ms,k.versao]),[['cascavel','nao_verificado',90000,'local'],['interlagos','nao_verificado',97000,'local']]);
 assert.equal(kept[1].feito_em,Date.parse('2026-09-21T10:00:00Z'));assert.equal(kept[0].feito_em,now,'no date: when it came up');
 // The board: the pilot once, at the best of both badges, with its badge.
 const board=await (await b.go('/api/recordes?circuito=interlagos&modo=normal')).json();
 const edu=board.recordes.filter(x=>x.apelido==='Edu Vaquinha');assert.equal(edu.length,1);assert.equal(edu[0].selo,'nao_verificado');
 assert.equal(board.recordes[0].apelido,'Edu Vaquinha','97 s leads the 99.5 s checked lap');
 const r2=await run(b);await r2.lap(96);
 const after=(await (await b.go('/api/recordes?circuito=interlagos&modo=normal')).json()).recordes.filter(x=>x.apelido==='Edu Vaquinha');
 assert.deepEqual(after.map(x=>[x.selo,x.volta_ms]),[['conferido',96000]],'a quicker checked lap takes the row');
 assert.equal((await b.post('/api/recordes/importar',{recordes:Array(65).fill({})})).status,400);
 assert.equal((await (await pilot('200000000000000000007')).post('/api/recordes/importar',{recordes:[]})).status,409,'no nickname');
 const saved=now;now=IMPORT_UNTIL;
 assert.equal((await b.post('/api/recordes/importar',{recordes:[]})).status,410,'after 30/11/2026');
 now=saved;
});

await check('circuit bests and pilots without a nickname',async()=>{
 const best=await (await browser().go('/api/recordes/melhores?modo=normal')).json();
 assert.equal(best.melhores.interlagos,96000);assert.equal(best.melhores.cascavel,undefined,'cascavel only in the story');
 assert.equal((await (await browser().go('/api/recordes/melhores?modo=immersive')).json()).melhores.cascavel,90000);
 assert.equal((await browser().go('/api/recordes?circuito=nada&modo=normal')).status,400);
 assert.equal((await browser().go('/api/recordes/melhores?modo=x')).status,400);
});

await check('the records are in the player\'s data and go with the account',async()=>{
 const b=await pilot('200000000000000000003');
 const data=await (await b.go('/api/conta/meus-dados')).json();
 assert.equal(data.recordes.length,1);assert.equal(data.recordes[0].volta_ms,99500);assert.ok(data.recordes[0].fantasma_bytes>10000);
 assert.equal((await b.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 assert.equal(rows("SELECT COUNT(*) AS n FROM recordes r LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE u.id IS NULL")[0].n,0);
 assert.ok(!(await (await browser().go('/api/recordes?circuito=interlagos&modo=normal')).json()).recordes.some(x=>x.apelido==='Bia Ventania'));
});

await check('the ghost reader matches the game\'s encoder',async()=>{
 const encoded=ghost('cascavel',80),read=readGhost(encoded);
 assert.equal(read.n,encoded.n);assert.equal(ghostProblem(read,80,'cascavel'),null);
 assert.ok(Math.abs(read.values[(read.n-1)*7+6]-CIRCUITS.cascavel.length)<.01);
 assert.equal(readGhost({...encoded,data:encoded.data.slice(4)}),null);assert.equal(readGhost({...encoded,v:2}),null);assert.equal(readGhost(null),null);
});

await local.close();Date.now=realNow;
console.log(`${passed} grupos de verificações dos recordes passaram.`);
