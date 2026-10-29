// Online records (conta-cloudflare/src/recordes.js), for a pilot signed in with a nickname. Only the
// build with accounts carries this (conta.js loads it).
// - A run: on track, the game takes a ticket and sends a chunk of its physics clock every few seconds and
//   one at every crossing of the line. The server times them against its own clock: a pause, slow motion
//   or a lost line leave the lap unchecked. Nothing is sent while the clock stands (pause, 3-2-1), so a
//   pause shows as the silence it is.
// - Every lap that counts goes with the crossing that ends it, with its ghost (ghost-lap.js, the same recording
//   the game keeps) and the pilot's controls on it (comandos-volta.js, fed by main.js each physics step): the
//   server keeps the best, and logs every lap with what its controls look like. The verdict shows on screen for
//   a lap that would be the pilot's best: a checked record, or why it was not checked.
// - The pilot's history: the ticket says what race it is (its kind, the rivals' level, the cars, the laps), and the race's
//   end goes once, after the chunk of its last crossing (result: the place at the flag, or towed in).
// - The records dialog's Online tab reads the board (lap-records.js addOnline).
// - The old records of the pilot that signs in go up once per account and address (then this browser is marked),
//   flagged ⚠️ unchecked, until IMPORT_UNTIL. A browser keeps records per address, and both addresses have the
//   accounts (dev.autopobre.com.br and autopobre.com.br, one database): each sends its own, and the server keeps a
//   mark per site.
import {CIRCUITS} from './circuits.js';
import {encodeGhost} from './ghost-lap.js';
import {LapInputs} from './comandos-volta.js';
import {readRecords} from './lap-records.js';
import {formatTime} from './race-results.js';

const API='/api/recordes',CARS=Object.freeze(['opala','fusca']);
// Per account (its creation date): this browser sent its old records. Never again after that. (v3 since the main
// link's came to the test version through a bridge, retired on 10-28 when the main link got the accounts.)
const IMPORTED='autopobre-recordes-importados-v3';
// conta-cloudflare/src/recordes.js IMPORT_UNTIL: the end of 31/12/2026 in Brasília.
const IMPORT_UNTIL=Date.parse('2027-01-01T03:00:00Z');
// The build (preparar_publicacao.py versions every module); 'local' in the preview.
const VERSION=new URL(import.meta.url).searchParams.get('v')||'local';
const RETRY=60000;            // ms before asking again for a ticket the server refused or did not answer

function storage(){try{return globalThis.localStorage;}catch{return null;}}
async function call(base,path,body){
 try{
  const r=await fetch(base+path,body===undefined?{cache:'no-store',credentials:'same-origin'}:{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=(r.headers.get('Content-Type')??'').startsWith('application/json')?await r.json().catch(()=>null):null;
  return {ok:r.ok&&!!data,status:r.status,data:data??{}};
 }catch{return {ok:false,status:0,data:{}};}
}
// A pilot's name as a person reads it: no case, no accents ("João" is "joao").
const fold=name=>String(name).normalize('NFD').replace(/\p{M}/gu,'').trim().toLocaleLowerCase('pt-BR');

export class OnlineRecords {
 // base: the server's address (a check on this machine passes its own); now(): the page's clock in ms.
 constructor({base=API,now=()=>performance.now()}={}){
  this.base=base;this.now=now;this.account=null;this.run=null;this.pending=null;this.queue=[];this.busy=false;this.importing=false;
  this.inputs=new LapInputs();this.finished=null;
  // The window or the tab left: the game pauses (main.js hold) and draws no more frames, so the pause's start goes now.
  globalThis.document?.addEventListener?.('visibilitychange',()=>{if(document.hidden)this.halt('aba');});
  globalThis.addEventListener?.('blur',()=>this.halt('janela'));
  this.toast=document.createElement('div');this.toast.id='recordeOnline';this.toast.setAttribute('role','status');this.toast.hidden=true;document.body.append(this.toast);
 }
 // The signed-in account; laps go online only with a nickname.
 setAccount(account){this.account=account?.apelido?account:null;if(!this.account){this.run=null;this.queue=[];this.pending=null;}}
 // Each frame. s: {circuit, mode, car, clock, lapStart, driving, race, raceId}. driving: the pilot at the wheel of
 // a race the records count (no autopilot, no room race). race: what race it is, for its ticket ({tipo, nivel, carros,
 // voltas}: conta-cloudflare/src/recordes.js raceOf; no laps for a practice). raceId: the race's number, another for
 // each race begun (its clock going back says so too).
 frame(s){
  // The Opala's and the Fusca's, each car its own board (conta-cloudflare/src/recordes.js CARS).
  if(!this.account||!s?.driving||!CARS.includes(s.car)||!Object.hasOwn(CIRCUITS,s.circuit))return;
  const key=`${s.circuit}|${s.mode}|${s.car}`,r=this.run;
  if(!r||r.key!==key||r.raceId!==s.raceId||s.clock<r.clock-1e-6||(r.failed&&this.now()-r.failed>RETRY)){this.begin(key,s);return;}
  if(!r.ticket)return;
  const running=s.clock>r.clock,before=r.clock,now=this.now();r.clock=s.clock;
  if(!running){
   // The clock stands: a pause (s.parado: P or a menu, the window or the tab left). Its start goes to the server with
   // the clock as it stood (a tenth of a second on: a fast screen draws a frame or two with no physics step between).
   if(s.parado&&r.lapStart!==undefined&&!r.halted&&now-(r.movedAt??now)>=100)this.halt(s.parado);
   return;
  }
  r.movedAt=now;
  // And its end, the clock still where it stood, before anything else: the server leaves the pause out of the lap's time.
  if(r.halted){r.halted=false;r.sentAt=now;this.send({relogio:before,pausa:'fim'});}
  if(r.lapStart===undefined){
   // The first chunk: a crossing when the lap has only just begun (the lights out, the line), else plain.
   r.lapStart=s.lapStart;r.sentAt=now;
   this.send(s.clock-s.lapStart<.25?{relogio:s.lapStart,cruzou:true}:{relogio:s.clock});
   return;
  }
  if(s.lapStart!==r.lapStart){
   r.lapStart=s.lapStart;r.sentAt=now;
   const lap=this.pending?.key===key&&Math.abs(this.pending.end-s.lapStart)<1e-6?this.pending:null;this.pending=null;
   this.send({relogio:s.lapStart,cruzou:true,...(lap&&{volta:{fantasma:lap.ghost,...(lap.inputs&&{comandos:lap.inputs})}})},lap);
   return;
  }
  if(now-r.sentAt>=r.every*1000){r.sentAt=now;this.send({relogio:s.clock});}
 }
 // A pause starts (why: pausa, janela or aba), on a run under way: once, until the clock moves again (frame says so).
 halt(why){
  const r=this.run;if(!this.account||!r?.ticket||r.lapStart===undefined||r.halted)return;
  r.halted=true;this.send({relogio:r.clock,pausa:'inicio',motivo:why});
 }
 // Each physics step (main.js recordGhost, before the ghost's): the controls, and those of the lap the step finished.
 step(car,command,sources){
  const done=this.inputs.step(car,command,sources);
  if(done)this.finished={end:car.lapStart,inputs:done};
 }
 // A lap that counts, just completed (main.js recordGhost): kept, with its controls, for the crossing that ends it.
 // end: the clock at the line. record: it would be the pilot's best online (the verdict goes on screen).
 lapDone({circuit,mode,car,lap,end}){
  const key=`${circuit}|${mode}|${car}`,r=this.run,inputs=this.finished?.end===end?this.finished.inputs:null;this.finished=null;
  if(!this.account||!r||r.key!==key||!r.ticket)return;
  const ghost=encodeGhost(lap);
  if(ghost)this.pending={key,end,time:lap.time,ghost,inputs,record:r.best===null||lap.time*1000<r.best};
 }
 // How the race ended (main.js, each frame once it is final: the flag, or Modo História's podium): its place among the
 // cars its ticket said, or towed in (finished false, no place). Once a run, after the chunks before it; none for a race
 // with no flag (practice) or no laps said.
 result({position,finished}){
  const r=this.run;if(!this.account||!r?.ticket||r.resultSent||!r.race?.voltas||!r.race.carros||r.race.tipo==='treino')return;
  r.resultSent=true;
  this.send({carros:r.race.carros,terminou:!!finished,...(finished&&{posicao:position})},null,'/resultado');
 }
 async begin(key,s){
  const [circuito,modo,carro]=key.split('|');
  const r=this.run={key,raceId:s.raceId,clock:s.clock,lapStart:undefined,ticket:null,every:5,sentAt:0,best:null,failed:0,race:s.race??null,resultSent:false};this.queue=[];this.pending=null;
  const t=await call(this.base,'/bilhete',{circuito,modo,carro,versao:VERSION,...r.race});
  if(this.run!==r)return;
  if(!t.ok){r.failed=this.now();return;}
  r.ticket=t.data.bilhete;r.every=t.data.intervalo||5;r.best=t.data.melhor??null;
 }
 // Chunks go one after another: each carries the ticket the last one brought back. path: another of the ticket's
 // requests in the same line (the race's result), whose answer changes nothing here.
 send(body,lap=null,path=null){this.queue.push({body,lap,path});this.pump();}
 async pump(){
  if(this.busy)return;this.busy=true;
  try{
   while(this.queue.length&&this.run?.ticket){
    const r=this.run,{body,lap,path}=this.queue.shift(),answer=await call(this.base,path??'/pedaco',{bilhete:r.ticket,...body});
    if(this.run!==r||path)continue;
    if(answer.data.bilhete)r.ticket=answer.data.bilhete;
    // An outdated ticket, a clock that went back or a session that ended: a new ticket on the next frame.
    else if(answer.status===409||answer.status===401){this.run=null;this.queue=[];break;}
    if(answer.data.volta&&lap)this.verdict(answer.data.volta,r,lap);
   }
  }finally{this.busy=false;}
 }
 // The lap's own time on screen (a lap refused for its timing comes back without one); a refusal only for a lap
 // that would have been the pilot's best (the others go to the log quietly). Such a lap is still this browser's
 // record (lap-records.js keeps every best lap, whatever the server says), and the server kept its ghost: it stays
 // here as the review the records dialog offers (review: the log's id, where, the time, why; status once asked).
 verdict(v,r,lap){
  const time=formatTime(lap.time);
  // (A trusted pilot's lap the checks would have refused goes in all the same: caso says why, for them to see.)
  if(v.conferida&&v.recorde){r.best=v.tempo_ms;this.say(v.caso?`✓ Recorde online: ${time} · caso para estudar: ${v.caso}`:`✓ Recorde online conferido: ${time}`);}
  else if(!v.conferida&&lap.record){
   const [circuit,,car]=lap.key.split('|');
   if(Number.isSafeInteger(v.revisao))this.review={id:v.revisao,circuit,car,time:lap.time,reason:v.recusada,status:null};
   this.say(`Volta de ${time} salva no seu recorde deste navegador, mas não conferida online: ${v.recusada}.${this.review?.id===v.revisao?' Em Recordes você pode pedir uma revisão.':''}`,true);
  }
 }
 // Asks the admin to look at the lap under review (POST /api/recordes/revisao); its status comes back.
 async askReview(){
  const review=this.review;if(!review||review.status)return;
  const r=await call(this.base,'/revisao',{volta:review.id});
  if(!r.ok)throw new Error(r.data.erro||'Não foi possível pedir a revisão agora. Tente de novo daqui a pouco.');
  review.status=r.data.revisao;
 }
 say(text,warning=false){
  this.toast.textContent=text;this.toast.classList.toggle('aviso',warning);this.toast.hidden=false;
  clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{this.toast.hidden=true;},warning?7000:5000);
 }
 // The records dialog's Online tab: a circuit's board in a car (one for both modes), and each circuit's best.
 async board(circuit,car='opala'){
  const r=await call(this.base,`?circuito=${encodeURIComponent(circuit)}&carro=${encodeURIComponent(car)}`);
  if(!r.ok)throw new Error('Não foi possível carregar os recordes online.');
  return r.data.recordes.map(x=>({name:x.apelido,bestLap:x.volta_ms/1000,badge:x.selo,mine:!!x.meu}));
 }
 async bests(car='opala'){const r=await call(this.base,`/melhores?carro=${encodeURIComponent(car)}`);return r.ok?r.data.melhores:{};}
 // The old records of the person signing in, once per account: this browser's, on this address. A browser may hold
 // several pilots (a family's computer): the one named as the account's nickname is the person when there is one (the
 // owner's rule), else the pilot the menu had last (names[1]). The browser is marked even when there were none, and
 // never sends again.
 async importOld(account,names){
  const store=storage();
  if(this.importing||!store||!account?.apelido||Date.now()>=IMPORT_UNTIL)return;
  let done;try{done=JSON.parse(store.getItem(IMPORTED)||'{}')||{};}catch{done={};}
  if(done[account.desde])return;
  this.importing=true;
  try{
   const nick=fold(account.apelido),records=readRecords(store),last=names[1];
   const named=records.filter(r=>fold(r.name)===nick),all=named.length?named:last?records.filter(r=>fold(r.name)===fold(last)):[];
   // The person's best on each circuit and mode.
   const best=new Map();
   for(const r of all){const k=r.circuit+'|'+r.mode,o=best.get(k);if(!o||r.bestLap<o.bestLap)best.set(k,r);}
   const mine=[...best.values()].map(r=>({circuito:r.circuit,modo:r.mode,volta_ms:Math.round(r.bestLap*1000),data:r.date||null}));
   // 410: the deadline passed; 409: this account's went up already (from another browser). Either way, done here.
   if(mine.length){const r=await call(this.base,'/importar',{recordes:mine.slice(0,64)});if(!r.ok&&r.status!==410&&r.status!==409)return;}
   done[account.desde]=new Date().toISOString();
   try{store.setItem(IMPORTED,JSON.stringify(done));}catch{}
  }finally{this.importing=false;}
 }
}
