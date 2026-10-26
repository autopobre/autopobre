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
// - The records dialog's Online tab reads the board (lap-records.js addOnline).
// - The old records of the pilot that signs in go up once per account (then this browser is marked), flagged
//   ⚠️ unchecked, until IMPORT_UNTIL: this address's, and the main link's. A browser keeps records per address,
//   so the main link's come through its bridge (pista_interlagos/ponte/levar-recordes.html): the page hops there
//   once and comes back with them in the link's "#" part. The server turns the hop on (/api/conta/eu says where
//   the bridge is) once the bridge is published. The way back carries a random key this tab keeps: records in a
//   link someone else made (a key this tab never took) are not this pilot's, and do not go up.
import {CIRCUITS} from './circuits.js';
import {encodeGhost} from './ghost-lap.js';
import {LapInputs} from './comandos-volta.js';
import {readRecords} from './lap-records.js';
import {formatTime} from './race-results.js';

const API='/api/recordes',CARS=Object.freeze(['opala','fusca']);
// Per account (its creation date): this browser sent its old records. Never again after that. (v3: with the main
// link's, through the bridge. v2 went out before the bridge was on, so the accounts that sent this address's alone
// then send once more; the server's own mark was cleared with it, and it keeps the best.)
const IMPORTED='autopobre-recordes-importados-v3';
// The bridge's records in the link back, the key the way back carries, and the hop under way in this tab (its key;
// a bridge that did not answer is not asked again: this address's records go up alone).
const BRIDGE_PARAM='recordes-do-principal',BRIDGE_KEY='chave-da-ponte',HOPPING='autopobre-ponte-recordes';
const newKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const BRIDGES=/^(?:https:\/\/autopobre\.com\.br|http:\/\/127\.0\.0\.1:\d{2,5})$/;
const IMPORT_UNTIL=Date.parse('2026-12-01T03:00:00Z');
// The build (preparar_publicacao.py versions every module); 'local' in the preview.
const VERSION=new URL(import.meta.url).searchParams.get('v')||'local';
const RETRY=60000;            // ms before asking again for a ticket the server refused or did not answer

function storage(){try{return globalThis.localStorage;}catch{return null;}}
function session(){try{return globalThis.sessionStorage;}catch{return null;}}
// The main link's records from the bridge's packing (levar-recordes.js packRecords), checked again here:
// [{circuit, mode, name, bestLap, date}] and the pilot chosen there.
export function unpackBridge(text){
 try{
  const raw=atob(String(text).replace(/-/g,'+').replace(/_/g,'/')),data=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
  if(data?.v!==1||!Array.isArray(data.r))return null;
  const records=data.r.filter(x=>Array.isArray(x)&&Object.hasOwn(CIRCUITS,x[0])&&['normal','immersive'].includes(x[1])&&typeof x[2]==='string'&&x[2].trim()&&Number.isFinite(x[3])&&x[3]>0&&x[3]<86400)
   .slice(0,400).map(x=>({circuit:x[0],mode:x[1],name:x[2].trim().slice(0,32),bestLap:x[3],date:typeof x[4]==='string'?x[4]:''}));
  return {records,pilot:typeof data.p==='string'?data.p.trim().slice(0,32):''};
 }catch{return null;}
}
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
  this.toast=document.createElement('div');this.toast.id='recordeOnline';this.toast.setAttribute('role','status');this.toast.hidden=true;document.body.append(this.toast);
 }
 // The signed-in account; laps go online only with a nickname.
 setAccount(account){this.account=account?.apelido?account:null;if(!this.account){this.run=null;this.queue=[];this.pending=null;}}
 // Each frame. s: {circuit, mode, car, clock, lapStart, driving}. driving: the pilot at the wheel of
 // a race the records count (no autopilot, no room race).
 frame(s){
  // The Opala's and the Fusca's, each car its own board (conta-cloudflare/src/recordes.js CARS).
  if(!this.account||!s?.driving||!CARS.includes(s.car)||!Object.hasOwn(CIRCUITS,s.circuit))return;
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
   this.send({relogio:s.lapStart,cruzou:true,...(lap&&{volta:{fantasma:lap.ghost,...(lap.inputs&&{comandos:lap.inputs})}})},lap);
   return;
  }
  if(now-r.sentAt>=r.every*1000){r.sentAt=now;this.send({relogio:s.clock});}
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
 // The old records of the person signing in, once per account: this browser's, and the main link's through the bridge
 // when the server names one (bridge). Address by address, a browser may hold several pilots (a family's computer):
 // the one named as the account's nickname is the person when there is one (the owner's rule), else the pilot that
 // address's menu had last (names[1] here; the bridge brings the main link's). The browser is marked even when there
 // were none, and never sends again. place: the page's address (a check passes its own).
 async importOld(account,names,bridge=null,place=globalThis.location){
  const store=storage();
  if(this.importing||!store||!account?.apelido||Date.now()>=IMPORT_UNTIL)return;
  let done;try{done=JSON.parse(store.getItem(IMPORTED)||'{}')||{};}catch{done={};}
  if(done[account.desde])return;
  // Back from the bridge with this tab's key: its records (none, when it could not read them), and the link cleaned
  // of them. Records under another key, or none: a link that only looks like the way back, left out. Not yet there:
  // the hop, once per tab.
  const hash=new URLSearchParams(place?.hash?.slice(1)??''),packed=hash.get(BRIDGE_PARAM),key=hash.get(BRIDGE_KEY),hops=session(),waiting=hops?.getItem(HOPPING);
  let main=null,own=place?.hash??'';
  if(packed!==null||key!==null){
   if(packed!==null&&/^[0-9a-f]{32}$/.test(waiting??'')&&key===waiting){main=unpackBridge(packed)??{records:[],pilot:''};hops.removeItem(HOPPING);}
   hash.delete(BRIDGE_PARAM);hash.delete(BRIDGE_KEY);
   const rest=hash.toString();own=rest?'#'+rest:'';globalThis.history?.replaceState(null,'',place.pathname+place.search+own);
  }
  if(!main&&typeof bridge==='string'&&BRIDGES.test(bridge)&&hops&&!waiting){
   const fresh=newKey();hops.setItem(HOPPING,fresh);
   const local=bridge.startsWith('http://127.0.0.1:')?`&porta=${encodeURIComponent(place.port)}`:'';
   const back=place.pathname+place.search+(own.length>1?own+'&':'#')+BRIDGE_KEY+'='+fresh;
   place.assign(`${bridge}/levar-recordes.html#volta=${encodeURIComponent(back)}${local}`);
   return;
  }
  this.importing=true;
  try{
   const nick=fold(account.apelido);
   const whose=(records,last)=>{const named=records.filter(r=>fold(r.name)===nick);return named.length?named:last?records.filter(r=>fold(r.name)===fold(last)):[];};
   const all=[...whose(readRecords(store),names[1]),...whose(main?.records??[],main?.pilot)];
   // The person's best on each circuit and mode, of both addresses.
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
