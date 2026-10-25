// Online records (conta-cloudflare/src/recordes.js), for a pilot signed in with a nickname. Only the
// build with accounts carries this (conta.js loads it).
// - A run: on track, the game takes a ticket and sends a chunk of its physics clock every few seconds and
//   one at every crossing of the line. The server times them against its own clock: a pause, slow motion
//   or a lost line leave the lap unchecked. Nothing is sent while the clock stands (pause, 3-2-1), so a
//   pause shows as the silence it is.
// - A lap that would be the pilot's best online goes with the crossing that ends it, with its ghost
//   (ghost-lap.js, the same recording the game keeps). The verdict shows on screen: a checked record, or
//   why the lap was not checked.
// - The records dialog's Online tab reads the board (lap-records.js addOnline).
// - The old records of this browser, of the pilot that signs in, go up once per account (then this browser
//   is marked), flagged ⚠️ unchecked, until IMPORT_UNTIL.
import {CIRCUITS} from './circuits.js';
import {encodeGhost} from './ghost-lap.js';
import {readRecords} from './lap-records.js';
import {formatTime} from './race-results.js';

const API='/api/recordes';
// Per account (its creation date): this browser sent its old records. Never again after that.
const IMPORTED='autopobre-recordes-importados-v1';
const IMPORT_UNTIL=Date.parse('2026-12-01T03:00:00Z');
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
const same=(a,b)=>a.toLocaleLowerCase('pt-BR')===b.toLocaleLowerCase('pt-BR');

export class OnlineRecords {
 // base: the server's address (a check on this machine passes its own); now(): the page's clock in ms.
 constructor({base=API,now=()=>performance.now()}={}){
  this.base=base;this.now=now;this.account=null;this.run=null;this.pending=null;this.queue=[];this.busy=false;this.importing=false;
  this.toast=document.createElement('div');this.toast.id='recordeOnline';this.toast.setAttribute('role','status');this.toast.hidden=true;document.body.append(this.toast);
 }
 // The signed-in account; laps go online only with a nickname.
 setAccount(account){this.account=account?.apelido?account:null;if(!this.account){this.run=null;this.queue=[];this.pending=null;}}
 // Each frame. s: {circuit, mode, car, clock, lapStart, driving}. driving: the pilot at the wheel of
 // a race the records count (no autopilot, no room race).
 frame(s){
  if(!this.account||!s?.driving||s.car!=='opala'||!Object.hasOwn(CIRCUITS,s.circuit))return;
  const key=`${s.circuit}|${s.mode}|${s.car}`,r=this.run;
  if(!r||r.key!==key||s.clock<r.clock-1e-6||(r.failed&&this.now()-r.failed>RETRY)){this.begin(key,s);return;}
  if(!r.ticket)return;
  const running=s.clock>r.clock;r.clock=s.clock;
  if(!running)return;
  const now=this.now();
  if(r.lapStart===undefined){
   // The first chunk: a crossing when the lap has only just begun (the lights out, the line), else plain.
   r.lapStart=s.lapStart;r.sentAt=now;
   this.send(s.clock-s.lapStart<.25?{relogio:s.lapStart,cruzou:true}:{relogio:s.clock});
   return;
  }
  if(s.lapStart!==r.lapStart){
   r.lapStart=s.lapStart;r.sentAt=now;
   const lap=this.pending?.key===key&&Math.abs(this.pending.end-s.lapStart)<1e-6?this.pending:null;this.pending=null;
   this.send({relogio:s.lapStart,cruzou:true,...(lap&&{volta:{fantasma:lap.ghost}})},lap);
   return;
  }
  if(now-r.sentAt>=r.every*1000){r.sentAt=now;this.send({relogio:s.clock});}
 }
 // A lap that counts, just completed (main.js recordGhost): kept for the crossing that ends it when it
 // would be the pilot's best online. end: the clock at the line.
 lapDone({circuit,mode,car,lap,end}){
  const key=`${circuit}|${mode}|${car}`,r=this.run;
  if(!this.account||!r||r.key!==key||!r.ticket||r.best!==null&&lap.time*1000>=r.best)return;
  const ghost=encodeGhost(lap);
  if(ghost)this.pending={key,end,time:lap.time,ghost};
 }
 async begin(key,s){
  const [circuito,modo,carro]=key.split('|');
  const r=this.run={key,clock:s.clock,lapStart:undefined,ticket:null,every:5,sentAt:0,best:null,failed:0};this.queue=[];this.pending=null;
  const t=await call(this.base,'/bilhete',{circuito,modo,carro,versao:VERSION});
  if(this.run!==r)return;
  if(!t.ok){r.failed=this.now();return;}
  r.ticket=t.data.bilhete;r.every=t.data.intervalo||5;r.best=t.data.melhor??null;
 }
 // Chunks go one after another: each carries the ticket the last one brought back.
 send(body,lap=null){this.queue.push({body,lap});this.pump();}
 async pump(){
  if(this.busy)return;this.busy=true;
  try{
   while(this.queue.length&&this.run?.ticket){
    const r=this.run,{body,lap}=this.queue.shift(),answer=await call(this.base,'/pedaco',{bilhete:r.ticket,...body});
    if(this.run!==r)continue;
    if(answer.data.bilhete)r.ticket=answer.data.bilhete;
    // An outdated ticket or a clock that went back: a new ticket on the next frame.
    else if(answer.status===409){this.run=null;this.queue=[];break;}
    if(answer.data.volta&&lap)this.verdict(answer.data.volta,r,lap);
   }
  }finally{this.busy=false;}
 }
 // The lap's own time on screen (a lap refused for its timing comes back without one).
 verdict(v,r,lap){
  const time=formatTime(lap.time);
  if(v.conferida&&v.recorde){r.best=v.tempo_ms;this.say(`✓ Recorde online conferido: ${time}`);}
  else if(!v.conferida)this.say(`Volta de ${time} não conferida: ${v.recusada}.`,true);
 }
 say(text,warning=false){
  this.toast.textContent=text;this.toast.classList.toggle('aviso',warning);this.toast.hidden=false;
  clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{this.toast.hidden=true;},warning?7000:5000);
 }
 // The records dialog's Online tab.
 async board(circuit,mode){
  const r=await call(this.base,`?circuito=${encodeURIComponent(circuit)}&modo=${encodeURIComponent(mode)}`);
  if(!r.ok)throw new Error('Não foi possível carregar os recordes online.');
  return r.data.recordes.map(x=>({name:x.apelido,bestLap:x.volta_ms/1000,badge:x.selo,mine:!!x.meu}));
 }
 async bests(mode){const r=await call(this.base,`/melhores?modo=${encodeURIComponent(mode)}`);return r.ok?r.data.melhores:{};}
 // This browser's records of the pilots in `names` (the nickname, and the pilot the menu had before the
 // account), once per account: the browser is marked even when it had none, and never sends again.
 async importOld(account,names){
  const store=storage();
  if(this.importing||!store||!account?.apelido||Date.now()>=IMPORT_UNTIL)return;
  let done;try{done=JSON.parse(store.getItem(IMPORTED)||'{}')||{};}catch{done={};}
  if(done[account.desde])return;
  this.importing=true;
  try{
   const pilots=names.filter(Boolean);
   const mine=readRecords(store).filter(r=>pilots.some(p=>same(p,r.name))).map(r=>({circuito:r.circuit,modo:r.mode,volta_ms:Math.round(r.bestLap*1000),data:r.date||null}));
   if(mine.length){const r=await call(this.base,'/importar',{recordes:mine.slice(0,64)});if(!r.ok&&r.status!==410)return;}
   done[account.desde]=new Date().toISOString();
   try{store.setItem(IMPORTED,JSON.stringify(done));}catch{}
  }finally{this.importing=false;}
 }
}
