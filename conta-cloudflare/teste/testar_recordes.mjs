// The online records end to end on this machine (teste/local.mjs), on a clock the test moves: the ticket,
// a clean lap (checked, kept as the pilot's best, on the board), and every lap the server must refuse
// (pause, slow motion, a clock running ahead, a lap too quick for the track, ghosts that are not the lap),
// tampered and outdated tickets, the old records' one-way import and its deadline, the board, the
// circuits' bests, the records in the player's data and gone with the account, a ticket without its account's
// session, and a ticket sent again (no write it has not earned).
import assert from 'node:assert/strict';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {packSteps,packKeys} from '../../pista_interlagos/teste/comandos-volta.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {readGhost,ghostProblem,IMPORT_UNTIL,CHUNK_EVERY} from '../src/recordes.js';
import {LINE_TIMES} from '../src/pisos.js';
import {startLocal} from './local.mjs';
import {aiLaps,lapAt} from './voltas_ia.mjs';

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
// A lap's ghost as the game would record it: at Interlagos, the AI's flying lap on a clock of `time` seconds (voltas_ia.mjs).
// spoil changes one thing about it, on a ring as long as the track at even speed (which the checks before the track's
// shape and the Opala's physics already refuse): its length, a jump, a cut, standing still, the rate, its own time.
function ghost(circuit,time,spoil={}){
 const real=aiLaps('interlagos')[1].lap;   // (a lap quicker than it, refused for its time first, stays a ring)
 if(circuit==='interlagos'&&!Object.keys(spoil).length&&time>=real.time)return encodeGhost(lapAt(real,time));
 const L=(spoil.length??1)*CIRCUITS[circuit].length,R=L/(2*Math.PI),rate=spoil.rate??20,n=Math.floor(time*rate)+1+(time*rate%1?1:0),values=new Float64Array(n*7);
 for(let k=0;k<n;k++){const t=k===n-1?time:k/rate,u=t/time,i=k*7;values[i]=spoil.parked?0:R*Math.cos(2*Math.PI*u);values[i+2]=spoil.parked?0:R*Math.sin(2*Math.PI*u);values[i+6]=L*u;}
 if(spoil.jump){const i=Math.floor(n/2)*7;values[i]+=200;}   // 200 m in a twentieth of a second (more than 327 m does not fit the game's format at all)
 if(spoil.cut){for(let k=Math.floor(n/2);k<n;k++)values[k*7+6]+=300;}
 return encodeGhost({time:spoil.time??time,rate,values,brakes:[]});
}
// A lap's controls as the game sends them (comandos-volta.js): the throttle held from the keyboard the whole lap (the
// ring's even speed needs no more), `steps` of them.
function keyboard(time,steps=Math.round(time*120)){return {v:1,n:steps,s:1,data:packSteps([[0,[100,0,0,0,-2,0]]],steps),keys:packKeys([]),r:0,dev:[steps,0,0,0,0]};}
// A run: a ticket, then the game's chunks. lap() drives one lap of `time` seconds from the current
// clock: a crossing to begin, a chunk every CHUNK_EVERY seconds, a crossing with the ghost and the controls to end.
// pace: real seconds per game second (1: honest); gap: a silence of that many real seconds in the middle.
async function run(b,{circuit='interlagos',mode='normal'}={}){
 const t=await b.post('/api/recordes/bilhete',{circuito:circuit,modo:mode,carro:'opala',versao:'teste1'});
 assert.equal(t.status,200,JSON.stringify(t));
 let ticket=t.bilhete,clock=0;
 const send=async body=>{const r=await b.post('/api/recordes/pedaco',{bilhete:ticket,...body});if(r.bilhete)ticket=r.bilhete;return r;};
 return {
  best:t.melhor,send,
  get ticket(){return ticket;},set ticket(v){ticket=v;},
  async lap(time,{pace=1,gap=0,fantasma=ghost(circuit,time),comandos=keyboard(time),first=clock===0}={}){
   if(first)await send({relogio:clock,cruzou:true});
   const end=clock+time;
   for(let t=clock+CHUNK_EVERY;t<end;t+=CHUNK_EVERY){
    now+=Math.round(CHUNK_EVERY*pace*1000);if(gap&&t>clock+time/2&&t<=clock+time/2+CHUNK_EVERY)now+=gap*1000;
    await send({relogio:t});
   }
   now+=Math.round((end-Math.floor((time-1e-9)/CHUNK_EVERY)*CHUNK_EVERY-clock)*pace*1000);clock=end;
   return (await send({relogio:end,cruzou:true,volta:{fantasma,...(comandos&&{comandos})}})).volta;
  },
 };
}

await check('a ticket needs an account with a nickname, a known circuit, mode, car and build',async()=>{
 assert.equal((await browser().post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'x'})).status,401);
 const nameless=await pilot('200000000000000000001');
 assert.equal((await nameless.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'x'})).status,409);
 const b=await pilot('200000000000000000002','Ana Curva');
 for(const bad of [{circuito:'nada'},{modo:'drift'},{carro:'kombi'},{versao:'../x'},{circuito:'arena'}])
  assert.equal((await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'v1',...bad})).status,400,JSON.stringify(bad));
 const ok=await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'opala',versao:'v1'});
 assert.equal(ok.status,200);assert.equal(ok.intervalo,CHUNK_EVERY);assert.equal(ok.melhor,null);
});

await check('a clean lap is checked, kept as the best, and on the board',async()=>{
 const b=await pilot('200000000000000000003','Bia Ventania'),r=await run(b);
 const lap=await r.lap(120);assert.deepEqual(lap,{tempo_ms:120000,conferida:true,recorde:true});
 const slower=await r.lap(123);assert.deepEqual(slower,{tempo_ms:123000,conferida:true,recorde:false},'a slower lap keeps the best');
 const quicker=await r.lap(119.5);assert.equal(quicker.recorde,true);
 assert.equal((await run(b)).best,119500,'the next ticket knows the best');
 const log=rows("SELECT tempo_ms,resultado,aparelho,sinais FROM voltas v JOIN usuarios u ON u.id=v.usuario_id WHERE u.apelido='Bia Ventania' ORDER BY v.id");
 assert.deepEqual(log.map(v=>[v.tempo_ms,v.resultado,v.aparelho]),[[120000,'recorde','teclado'],[123000,'conferida','teclado'],[119500,'recorde','teclado']],'every lap in the log');
 assert.deepEqual(JSON.parse(log[0].sinais).sinais,[],'a keyboard\'s lap with nothing odd');
 const kept=rows("SELECT selo,volta_ms,versao,length(fantasma) AS g FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Bia Ventania'");
 assert.equal(kept.length,1);assert.equal(kept[0].selo,'conferido');assert.equal(kept[0].volta_ms,119500);assert.equal(kept[0].versao,'teste1');assert.ok(kept[0].g>10000,'its ghost is kept');
 const board=await (await b.go('/api/recordes?circuito=interlagos&modo=normal')).json();
 const mine=board.recordes.find(x=>x.apelido==='Bia Ventania');assert.equal(mine.selo,'conferido');assert.equal(mine.volta_ms,119500);assert.equal(mine.meu,true);
 assert.match(mine.feito_em,/^\d{4}-\d\d-\d\d$/,'the day only, not the time of day');
 assert.equal((await (await browser().go('/api/recordes?circuito=interlagos&modo=normal')).json()).recordes.find(x=>x.apelido==='Bia Ventania').meu,false,'public, and nobody\'s own when signed out');
});

await check('laps the server refuses',async()=>{
 const b=await pilot('200000000000000000004','Caio Freio');
 const refused=async(options,why,time=120)=>{const r=await run(b),lap=await r.lap(time,options);assert.equal(lap.conferida,undefined,why);assert.match(lap.recusada,why);};
 await refused({gap:30},/40 s sem falar com o servidor/);           // a silence in the middle, the clock running
 await refused({pace:1.25},/rodou 20% mais devagar que o relógio/); // slow motion: more real time than game time
 await refused({pace:.7},/relógio do jogo andou mais rápido/);       // a clock running ahead
 await refused({},/rápida demais/,Math.floor(LINE_TIMES.opala.interlagos*.84)); // far quicker than the driving line
 await refused({fantasma:ghost('interlagos',118)},/fantasma não tem o tempo/);                // another lap's ghost
 await refused({fantasma:ghost('interlagos',120,{time:118})},/não pôde ser lido/);   // a ghost longer than its own time
 await refused({fantasma:ghost('interlagos',120,{length:.6})},/pista inteira/);
 await refused({fantasma:ghost('interlagos',120,{jump:true})},/mais rápido/);
 await refused({fantasma:ghost('interlagos',120,{cut:true})},/ganhou pista|pista inteira/);
 await refused({fantasma:ghost('interlagos',120,{parked:true})},/ganhou pista|não percorreu/);   // standing still, the track distance counting
 await refused({fantasma:ghost('interlagos',120,{rate:60})},/não foi gravado pelo jogo/);       // samples the game never takes
 await refused({fantasma:{v:1,time:120,rate:20,n:3,start:[0,0,0,0,0,0,0],data:'AAAA'}},/não pôde ser lido/);
 await refused({comandos:null},/sem os comandos/);                                            // the controls never came
 await refused({comandos:keyboard(120,120*120-60)},/não cobrem a volta/);                      // half a second of them missing
 await refused({comandos:{...keyboard(120),data:'////'}},/sem os comandos/);                    // unreadable
 assert.equal(rows("SELECT COUNT(*) AS n FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Caio Freio'")[0].n,0);
 // A lap begun before the ticket (no crossing seen) is not checked either.
 const late=await run(b);await late.send({relogio:30});
 for(let g=40;g<=110;g+=10){now+=10000;await late.send({relogio:g});}
 now+=10000;const lap=(await late.send({relogio:120,cruzou:true,volta:{fantasma:ghost('interlagos',120)}})).volta;
 assert.match(lap.recusada,/a volta começou antes de o servidor acompanhar/);
});

await check('a pause the game declares is left out of the lap and kept in its log; one whose clock moved, one undeclared, or too many, are not',async()=>{
 const b=await pilot('200000000000000000040','Pausa Leal');
 // A lap of 120 s from the line, a chunk every CHUNK_EVERY seconds, with pauses as [the game's second, real seconds,
 // why]: the start, then the end with the clock as it stood (fim: the clock it says instead; declared false: no start).
 const lapWith=async(pauses,{fim=g=>g,declared=true}={})=>{
  const r=await run(b),todo=[...pauses];let g=0;
  await r.send({relogio:0,cruzou:true});
  while(g<120){
   const next=Math.min((Math.floor(g/CHUNK_EVERY)+1)*CHUNK_EVERY,120),p=todo[0];
   if(p&&p[0]>g&&p[0]<next){
    todo.shift();now+=(p[0]-g)*1000;g=p[0];
    if(declared)await r.send({relogio:g,pausa:'inicio',motivo:p[2]});
    now+=p[1]*1000;await r.send({relogio:fim(g),pausa:'fim'});
    continue;
   }
   now+=(next-g)*1000;g=next;if(g<120)await r.send({relogio:g});
  }
  return (await r.send({relogio:120,cruzou:true,volta:{fantasma:ghost('interlagos',120),comandos:keyboard(120)}})).volta;
 };
 const ok=await lapWith([[43,60,'janela'],[77,5,'pausa']]);
 assert.deepEqual(ok,{tempo_ms:120000,conferida:true,recorde:true},'a minute away and a P: the lap\'s own time, checked');
 const logged=JSON.parse(rows("SELECT sinais FROM voltas v JOIN usuarios u ON u.id=v.usuario_id WHERE u.apelido='Pausa Leal' ORDER BY v.id DESC")[0].sinais);
 assert.deepEqual(logged.pausas,{n:2,s:65,motivos:{janela:1,pausa:1}},'how many, how long and why');
 assert.match((await lapWith([[43,60,'pausa']],{fim:g=>g+1})).recusada,/60 s sem falar com o servidor/,'the clock moved in it: no pause');
 assert.match((await lapWith([[43,60,'pausa']],{declared:false})).recusada,/63 s sem falar com o servidor/,'an end with no start');
 assert.match((await lapWith(Array.from({length:11},(_,i)=>[5+10*i,2,'aba']))).recusada,/a volta teve 11 pausas/);
 assert.equal((await lapWith(Array.from({length:10},(_,i)=>[5+10*i,2,'aba']))).conferida,true,'ten count');
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
 // A lap's ghost goes in with its own fields only (anything else it carries stays out).
 const extra=await run(b);await extra.lap(150,{fantasma:{...ghost('interlagos',150),nota:'<img src=x onerror=alert(1)>'}});
 assert.ok(!rows("SELECT fantasma FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Duda Reta'")[0].fantasma.includes('onerror'));
 const big='x'.repeat(210000);   // past the ghost and the controls together
 assert.equal((await b.post('/api/recordes/pedaco',{bilhete:r.ticket,relogio:1,cruzou:true,volta:{fantasma:big}})).status,413);
});

await check('old records come up flagged, checked for sense, until the deadline',async()=>{
 const b=await pilot('200000000000000000006','Edu Vaquinha');
 const r=await b.post('/api/recordes/importar',{recordes:[
  {circuito:'interlagos',modo:'normal',volta_ms:118000,data:'2026-09-20T10:00:00Z'},
  {circuito:'interlagos',modo:'normal',volta_ms:117000,data:'2026-09-21T10:00:00Z'},
  {circuito:'cascavel',modo:'immersive',volta_ms:90000,data:'nada'},
  {circuito:'interlagos',modo:'normal',volta_ms:90000},                 // quicker than the driving line allows
  {circuito:['interlagos'],modo:'normal',volta_ms:118000},{circuito:'arena',modo:'normal',volta_ms:90000},{circuito:'interlagos',modo:'drift',volta_ms:90000},{nada:1},null]});
 assert.equal(r.status,200);assert.equal(r.importados,2,'the best of each circuit and mode, written once each');
 const kept=rows("SELECT circuito,selo,volta_ms,versao,feito_em FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Edu Vaquinha' ORDER BY circuito");
 assert.deepEqual(kept.map(k=>[k.circuito,k.selo,k.volta_ms,k.versao]),[['cascavel','nao_verificado',90000,'local'],['interlagos','nao_verificado',117000,'local']]);
 assert.equal(kept[1].feito_em,Date.parse('2026-09-21T10:00:00Z'));assert.equal(kept[0].feito_em,now,'no date: when it came up');
 assert.equal((await b.post('/api/recordes/importar',{recordes:[{circuito:'chapeco',modo:'normal',volta_ms:110000}]})).status,409,'once per account, whatever the browser');
 // The board: the pilot once, at the best of both badges, with its badge.
 const board=await (await b.go('/api/recordes?circuito=interlagos&modo=normal')).json();
 const edu=board.recordes.filter(x=>x.apelido==='Edu Vaquinha');assert.equal(edu.length,1);assert.equal(edu[0].selo,'nao_verificado');
 assert.equal(board.recordes[0].apelido,'Edu Vaquinha','117 s leads the 119.5 s checked lap');
 const r2=await run(b);await r2.lap(121);
 const after=(await (await b.go('/api/recordes?circuito=interlagos&modo=normal')).json()).recordes.filter(x=>x.apelido==='Edu Vaquinha');
 assert.deepEqual(after.map(x=>[x.selo,x.volta_ms]),[['conferido',121000]],'a pilot with a checked lap shows by it, even slower than their old one');
 const fresh=await pilot('200000000000000000008','Fabi Retao');
 assert.equal((await fresh.post('/api/recordes/importar',{recordes:Array(65).fill({})})).status,400);
 const same=await fresh.post('/api/recordes/importar',{recordes:Array.from({length:64},(_,i)=>({circuito:'goiania',modo:'normal',volta_ms:130000-i,data:'1970-01-01'}))});
 assert.equal(same.importados,1);assert.deepEqual(rows("SELECT volta_ms,feito_em FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Fabi Retao'").map(r=>[r.volta_ms,r.feito_em]),[[129937,now]],'one write, and no date from before the game');
 assert.equal((await (await pilot('200000000000000000007')).post('/api/recordes/importar',{recordes:[]})).status,409,'no nickname');
 const saved=now;now=IMPORT_UNTIL;
 assert.equal((await (await pilot('200000000000000000009','Gil Largada')).post('/api/recordes/importar',{recordes:[]})).status,410,'after 30/11/2026');
 now=saved;
});

await check('circuit bests and pilots without a nickname',async()=>{
 const best=await (await browser().go('/api/recordes/melhores?modo=normal')).json();
 assert.equal(best.melhores.interlagos,119500,'checked laps only: the 117 s old record does not count');assert.equal(best.melhores.goiania,undefined);
 assert.equal((await (await browser().go('/api/recordes/melhores?modo=immersive')).json()).melhores.cascavel,undefined);
 assert.equal((await browser().go('/api/recordes?circuito=nada&modo=normal')).status,400);
 assert.equal((await browser().go('/api/recordes/melhores?carro=x')).status,400);
 assert.equal((await browser().go('/api/recordes?circuito=interlagos&carro=kombi')).status,400);
});

await check('the records are in the player\'s data and go with the account',async()=>{
 const b=await pilot('200000000000000000003');
 const data=await (await b.go('/api/conta/meus-dados')).json();
 assert.equal(data.recordes.length,1);assert.equal(data.recordes[0].volta_ms,119500);assert.equal(data.recordes[0].fantasma.v,1,'the lap\'s ghost comes too');
 assert.deepEqual(data.voltas.map(v=>[v.tempo_ms,v.resultado,v.aparelho]),[[120000,'recorde','teclado'],[123000,'conferida','teclado'],[119500,'recorde','teclado']],'and the lap log');
 assert.ok(Array.isArray(data.voltas[0].freios)&&data.voltas[0].sinais.medidas,'with what was kept of each');
 assert.equal((await b.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 assert.equal(rows("SELECT COUNT(*) AS n FROM recordes r LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE u.id IS NULL")[0].n,0);
 assert.equal(rows("SELECT COUNT(*) AS n FROM voltas v LEFT JOIN usuarios u ON u.id=v.usuario_id WHERE u.id IS NULL")[0].n,0,'the laps go too');
 assert.ok(!(await (await browser().go('/api/recordes?circuito=interlagos&modo=normal')).json()).recordes.some(x=>x.apelido==='Bia Ventania'));
});

await check('a ticket goes with its account\'s session: signed out, another account, or one that took a deleted account\'s number, it ends',async()=>{
 const b=await pilot('200000000000000000022','Saiu Cedo'),r=await run(b);await r.send({relogio:0,cruzou:true});
 const other=await pilot('200000000000000000023','Outra Pessoa');now+=CHUNK_EVERY*1000;
 assert.equal((await other.post('/api/recordes/pedaco',{bilhete:r.ticket,relogio:CHUNK_EVERY})).status,409,'another account\'s session');
 assert.equal((await b.post('/api/conta/sair',{})).status,200);
 assert.equal((await b.post('/api/recordes/pedaco',{bilhete:r.ticket,relogio:CHUNK_EVERY,cruzou:true,volta:{}})).status,401,'signed out');
 // The newest account takes a ticket and is deleted; the next to arrive gets its number (SQLite reuses the highest).
 const gone=await pilot('200000000000000000020','Sumido'),g=await run(gone);await g.send({relogio:0,cruzou:true});
 const goneId=rows("SELECT id FROM usuarios WHERE apelido='Sumido'")[0].id;
 assert.equal((await gone.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 const victim=await pilot('200000000000000000021','Vitima'),id=rows("SELECT id FROM usuarios WHERE apelido='Vitima'")[0].id;
 assert.equal(id,goneId,'the number came back');
 for(let t=CHUNK_EVERY;t<120;t+=CHUNK_EVERY){now+=CHUNK_EVERY*1000;assert.equal((await victim.post('/api/recordes/pedaco',{bilhete:g.ticket,relogio:t})).status,409);}
 now+=1000*(120-Math.floor(119.999/CHUNK_EVERY)*CHUNK_EVERY);
 assert.equal((await victim.post('/api/recordes/pedaco',{bilhete:g.ticket,relogio:120,cruzou:true,volta:{fantasma:ghost('interlagos',120)}})).status,409);
 assert.equal(rows(`SELECT COUNT(*) AS n FROM recordes WHERE usuario_id=${id}`)[0].n,0);
 assert.deepEqual(rows(`SELECT tipo FROM eventos WHERE usuario_id=${id} ORDER BY id`).map(e=>e.tipo),['conta_criada','apelido'],'nothing of the old ticket on her account');
});

await check('a ticket sent again spends no writes: a record once, refusals and records counted per account and hour',async()=>{
 const b=await pilot('200000000000000000024','Repete Muito'),id=rows("SELECT id FROM usuarios WHERE apelido='Repete Muito'")[0].id;
 const count=tipo=>rows(`SELECT COUNT(*) AS n FROM eventos WHERE usuario_id=${id} AND tipo='${tipo}'`)[0].n;
 // A fresh ticket's first chunk sent with a lap again and again, and fresh tickets too: refused each time, 5 written.
 const fresh=(await run(b)).ticket;
 for(let i=0;i<8;i++)assert.match((await b.post('/api/recordes/pedaco',{bilhete:fresh,relogio:0,cruzou:true,volta:{}})).volta.recusada,/começou antes/);
 for(let i=0;i<3;i++)await b.post('/api/recordes/pedaco',{bilhete:(await run(b)).ticket,relogio:0,cruzou:true,volta:{}});
 assert.equal(count('recusada'),5);
 now+=3600001;await b.post('/api/recordes/pedaco',{bilhete:fresh,relogio:0,cruzou:true,volta:{}});
 assert.equal(count('recusada'),6,'an hour later, one more');
 // A clean lap's last crossing sent ten times: checked each time, written once.
 const r=await run(b);await r.send({relogio:0,cruzou:true});
 for(let t=CHUNK_EVERY;t<120;t+=CHUNK_EVERY){now+=CHUNK_EVERY*1000;await r.send({relogio:t});}
 now+=1000*(120-Math.floor(119.999/CHUNK_EVERY)*CHUNK_EVERY);
 const before=r.ticket,fantasma=ghost('interlagos',120),comandos=keyboard(120),verdicts=[];
 for(let i=0;i<10;i++)verdicts.push((await b.post('/api/recordes/pedaco',{bilhete:before,relogio:120,cruzou:true,volta:{fantasma,comandos}})).volta);
 assert.deepEqual(verdicts.map(v=>[v.conferida,v.recorde]),[[true,true],...Array(9).fill([true,false])]);
 assert.equal(count('conferida'),1);
 // 120 records in the hour: the next lap is checked but not written.
 const insert=local.DB.sqlite.prepare("INSERT INTO eventos (quando,tipo,usuario_id) VALUES (?,'conferida',?)");for(let i=1;i<120;i++)insert.run(now,id);
 assert.match((await (await run(b)).lap(118)).recusada,/muitos recordes/);
 assert.equal(rows(`SELECT volta_ms FROM recordes WHERE usuario_id=${id}`)[0].volta_ms,120000);
 // 150 laps in the log in the hour: the next is answered, not logged.
 const laps=()=>rows(`SELECT COUNT(*) AS n FROM voltas WHERE usuario_id=${id}`)[0].n;
 const lapRow=local.DB.sqlite.prepare("INSERT INTO voltas (usuario_id,quando,circuito,modo,resultado) VALUES (?,?,'interlagos','normal','conferida')");for(let i=0;i<150;i++)lapRow.run(id,now);
 const full=laps();await (await run(b)).lap(125);assert.equal(laps(),full);
});

await check('one record a circuit whichever mode drove it; the race\'s first lap, from the grid, counts; the Fusca\'s board is another',async()=>{
 const b=await pilot('200000000000000000030','Gina Grid');
 // The first lap from the grid: it starts behind the line, and is checked.
 const grid=aiLaps('interlagos')[0].lap,r=await run(b);
 assert.ok(grid.values[6]<-30,'the grid is behind the line');
 const first=await r.lap(grid.time,{fantasma:encodeGhost(grid),comandos:keyboard(grid.time)});
 assert.equal(first.conferida,true,JSON.stringify(first));
 // A quicker story lap is the same record: a race's ticket knows it, the board shows the pilot once.
 const story=await run(b,{mode:'immersive'});assert.equal(story.best,first.tempo_ms);
 assert.equal((await story.lap(118)).recorde,true);
 assert.equal((await run(b)).best,118000,'a race\'s ticket knows the story\'s best');
 const board=(await (await b.go('/api/recordes?circuito=interlagos')).json()).recordes.filter(x=>x.apelido==='Gina Grid');
 assert.deepEqual(board.map(x=>x.volta_ms),[118000]);
 assert.ok(!(await (await b.go('/api/recordes?circuito=interlagos&carro=fusca')).json()).recordes.some(x=>x.apelido==='Gina Grid'),'the Fusca\'s board is another');
 assert.equal((await b.post('/api/recordes/bilhete',{circuito:'interlagos',modo:'normal',carro:'fusca',versao:'v1'})).status,200,'a Fusca\'s ticket');
});

await check('a refused lap that would have been the pilot\'s best keeps its ghost, and its pilot may ask for a review',async()=>{
 const b=await pilot('200000000000000000031','Rui Revisao'),other=await pilot('200000000000000000032','Outro Rui');
 const r=await run(b),refused=await r.lap(120,{comandos:null});
 assert.match(refused.recusada,/sem os comandos/);assert.ok(Number.isSafeInteger(refused.revisao),'reviewable');
 assert.deepEqual({...rows(`SELECT fantasma IS NOT NULL AS g,revisao,carro FROM voltas WHERE id=${refused.revisao}`)[0]},{g:1,revisao:null,carro:'opala'});
 assert.equal((await other.post('/api/recordes/revisao',{volta:refused.revisao})).status,404,'only the pilot\'s own lap');
 assert.equal((await browser().post('/api/recordes/revisao',{volta:refused.revisao})).status,401);
 assert.equal((await b.post('/api/recordes/revisao',{volta:'x'})).status,400);
 assert.deepEqual(await b.post('/api/recordes/revisao',{volta:refused.revisao}),{status:200,revisao:'pedida'});
 assert.deepEqual(await b.post('/api/recordes/revisao',{volta:refused.revisao}),{status:200,revisao:'pedida'},'asked once');
 // Once the pilot has a quicker checked lap, a slower refused one keeps no ghost: nothing to review.
 assert.equal((await r.lap(119)).conferida,true);
 const slow=await r.lap(125,{comandos:null});assert.ok(slow.recusada);assert.equal(slow.revisao,undefined);
 assert.equal(rows("SELECT COUNT(*) AS n FROM voltas v JOIN usuarios u ON u.id=v.usuario_id WHERE u.apelido='Rui Revisao' AND fantasma IS NOT NULL")[0].n,1);
 assert.deepEqual(rows("SELECT tipo FROM eventos e JOIN usuarios u ON u.id=e.usuario_id WHERE u.apelido='Rui Revisao' AND tipo LIKE 'revis%'").map(e=>e.tipo),['revisao_pedida']);
});

await check('the ghost reader matches the game\'s encoder',async()=>{
 const encoded=ghost('cascavel',80),read=readGhost(encoded);
 assert.equal(read.n,encoded.n);assert.equal(ghostProblem(read,80,'cascavel'),null);
 assert.equal(readGhost({...encoded,b:[5,3]}),null,'brakes going back in time');
 assert.ok(Math.abs(read.values[(read.n-1)*7+6]-CIRCUITS.cascavel.length)<.01);
 assert.equal(readGhost({...encoded,data:encoded.data.slice(4)}),null);assert.equal(readGhost({...encoded,v:2}),null);assert.equal(readGhost(null),null);
});

await local.close();Date.now=realNow;
console.log(`${passed} grupos de verificações dos recordes passaram.`);
