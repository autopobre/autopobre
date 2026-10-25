// Online records: each pilot's best lap per circuit, mode and car, with its badge (selo).
//
// conferido: checked by the server while the lap was driven. Driving with an account, the game takes a ticket
// when it goes on track (/bilhete: circuit, mode, car, the game's build), then sends a chunk every
// CHUNK_EVERY seconds of its physics clock and one at every crossing of the line (/pedaco). The ticket is
// sealed and travels back and forth with every chunk, so nothing is written while laps go by.
// - Between two chunks the game's clock must have run as the server's did: no slow motion, nothing ahead,
//   within the network's say, and no silence over CHUNK_GAP. A pause breaks the clean stretch, so a lap
//   with a pause in it is not checked.
// - A lap is its two crossings: its game time against the real time between them, and no quicker than the
//   driving line itself allows (FLOOR of its lap time, pisos.js).
// - Its ghost (the game's own recording, ghost-lap.js) must match: recorded at the game's rates, as long as
//   the lap, from the line around the whole track (circuits.js), the car covering it, never faster than an
//   Opala goes, never pushed or turned harder than one can be, never gaining track it did not drive.
// - The ticket is the account's as it was then (its Google account, sealed in it): a lap for an account deleted
//   since, or for a new one that took its number, is refused.
// Only a pilot's best goes in, with its ghost ("ver a volta", later).
//
// nao_verificado: an old record of a browser, from before the account (/importar), once per account (the
// server keeps when), until IMPORT_UNTIL, and the board shows them flagged ⚠️. A pilot with a checked lap
// shows by it.
//
// What this cannot tell: a lap driven by a program, a ghost made up to look driven (a smooth ring as long as
// the track passes until the server knows each track's shape), the physics changed in the pilot's browser, or a
// second of slow motion inside one chunk. That is the next badge's work (homologado: the server re-running the
// lap from the pilot's inputs with the game's own physics).
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {LINE_TIMES} from './pisos.js';
import {json,seal,unseal,signedIn,notSignedIn} from './base.js';
import {event} from './eventos.js';

const TICKET='bilhete-v1';
export const CHUNK_EVERY=10;  // seconds of the game's clock between chunks (the game keeps this pace)
const CHUNK_GAP=25000;        // ms: a longer silence breaks the stretch (a pause, the line down)
const JITTER=750;             // ms: the network's say in one chunk's timing
const SLOWEST=.85;            // the slowest a chunk's game clock may run against the real one
const STEADY=.97;             // the same over the whole stretch since it began
const LAP_SLACK=1000;         // ms (plus 1% of the lap): a lap's real time against its game time
const RUN_HOURS=8;            // a ticket's life
// The Opala only, as the game's own boards (lap-records.js keeps no Fusca lap). Should the Fusca get records one day,
// they are a table of their own: an Opala does 217 km/h and a Fusca 165, so their times never compare. It will need
// its own floor (the driving line with FUSCA_MECHANICS in gerar_pisos.mjs), its own top speed in ghostProblem, and a
// car picker on the records dialog.
const MODES=['normal','immersive'],CARS=['opala'];
const VERSION=/^[\w.-]{1,40}$/;
// The old records come up until the end of 30/11/2026 in Brasília (the owner's deadline), and none is dated
// before the game was online.
export const IMPORT_UNTIL=Date.parse('2026-12-01T03:00:00Z');
const GAME_START=Date.parse('2026-09-01T00:00:00Z');
// The quickest a lap may be: this share of the driving line's own time, or, on a circuit the table does not know
// yet, an average no Opala keeps. The line is a model, not a wall: the first checked laps (10-25) beat it by 3.5%
// (Interlagos 1:49.2 against its 1:53.3), so the floor leaves a good pilot room and stops only the absurd.
const FLOOR=.85;
const fastest=circuit=>Math.ceil(1000*(LINE_TIMES[circuit]?LINE_TIMES[circuit]*FLOOR:CIRCUITS[circuit].length/70));
const GHOST_BYTES=120000;     // a lap's ghost as the game encodes it (3600 samples at most: ~70 kB)
const LOGGED_REFUSALS=5;      // refused laps a ticket writes to the panel's events (the rest only answer: no writes to spend)
export const RECORDS_BODY={'/api/recordes/pedaco':GHOST_BYTES+4096,'/api/recordes/importar':16384};
const known=(c,m,k)=>typeof c==='string'&&Object.hasOwn(CIRCUITS,c)&&MODES.includes(m)&&CARS.includes(k);
const UPSERT=`INSERT INTO recordes (usuario_id,circuito,modo,carro,selo,volta_ms,versao,feito_em,enviado_em,fantasma) VALUES (?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(usuario_id,circuito,modo,carro,selo) DO UPDATE SET volta_ms=excluded.volta_ms,versao=excluded.versao,feito_em=excluded.feito_em,
 enviado_em=excluded.enviado_em,fantasma=excluded.fantasma WHERE excluded.volta_ms<recordes.volta_ms`;

// A ghost as ghost-lap.js packs it (v1: the first sample whole, then 16-bit steps; x, y, z and the track
// distance in centimetres, the three angles in 1e-4 rad), read with its sizes checked first. Only its own
// fields come out (b: the brake's switches, hundredths of a second into the lap, never going back).
const FIELDS=7,SCALE=[100,100,100,1e4,1e4,1e4,100];
export function readGhost(entry){
 try{
  const {v,time,rate,n,start,data,b}=entry??{};
  if(v!==1||!Number.isInteger(rate)||rate<1||rate>120||!Number.isInteger(n)||n<2||n>4000||!(time>0&&time<=3600))return null;
  if((n-2)/rate>=time+1e-6||time>(n-1)/rate+1e-6)return null;
  if(!Array.isArray(start)||start.length!==FIELDS||!start.every(Number.isSafeInteger)||typeof data!=='string')return null;
  if(b!==undefined&&(!Array.isArray(b)||b.length>4000||!b.every((x,j)=>Number.isSafeInteger(x)&&x>=0&&x<=time*100+1&&(!j||x>=b[j-1]))))return null;
  const size=(n-1)*FIELDS*2;if(data.length!==4*Math.ceil(size/3))return null;
  const raw=atob(data);if(raw.length!==size)return null;
  const q=[...start],values=new Float64Array(n*FIELDS);
  for(let i=0;i<n*FIELDS;i++){
   const f=i%FIELDS;
   if(i>=FIELDS){const j=(i-FIELDS)*2;let d=raw.charCodeAt(j)|raw.charCodeAt(j+1)<<8;if(d>32767)d-=65536;q[f]+=d;}
   values[i]=q[f]/SCALE[f];
  }
  return {time,rate,n,values,stored:{v,time,rate,n,start,data,...(b!==undefined&&{b})}};
 }catch{return null;}
}
const RATES=new Set([20,10,5,4]);   // the game records 20 samples a second and thins a long lap to 10, 5 or 4
const MAX_SPEED=70;          // m/s between two samples (an Opala tops out near 60: a long downhill and a tow)
const MAX_PUSH=15;           // m/s² of speed gained over half a second (its engine gives a third of that; a shove more)
const MAX_TURN=25;           // m/s² across its way over half a second (its tyres hold about 11)
const SPIKES=3;              // half-seconds past those (a wall, a rival) a lap may have
const DRIVEN=.85;            // of the track's length the car must cover (the racing line cuts inside the bends)
// Why a ghost cannot be this lap, or null when it can.
export function ghostProblem(ghost,time,circuit){
 if(!ghost)return 'o fantasma da volta não pôde ser lido';
 if(!RATES.has(ghost.rate))return 'o fantasma não foi gravado pelo jogo';
 if(Math.abs(ghost.time-time)>.005)return 'o fantasma não tem o tempo da volta';
 const v=ghost.values,n=ghost.n,L=CIRCUITS[circuit].length,at=k=>k>=n-1?ghost.time:k/ghost.rate;
 const first=v[6],last=v[(n-1)*FIELDS+6];
 if(Math.abs(first)>30)return 'a volta não começa na linha';
 if(Math.abs(last-first-L)>L*.03+30)return 'a volta não percorre a pista inteira';
 const vel=[null];let covered=0;
 for(let k=1;k<n;k++){
  const a=(k-1)*FIELDS,b=k*FIELDS,dt=at(k)-at(k-1);
  if(!(dt>0))return 'o fantasma tem o tempo fora de ordem';
  const d=[v[b]-v[a],v[b+1]-v[a+1],v[b+2]-v[a+2]],moved=Math.hypot(...d),gained=v[b+6]-v[a+6];
  if(moved>MAX_SPEED*dt+.05)return 'o carro andou mais rápido do que um Opala anda';
  // Track gained against ground covered: the inside of a hairpin gains more than it drives, a cut gains it all.
  if(gained<-5||gained>moved*1.8+MAX_SPEED*dt*.1)return 'o carro ganhou pista sem andar por ela';
  covered+=moved;vel.push(d.map(x=>x/dt));
 }
 if(covered<DRIVEN*L)return 'o carro não percorreu a pista';
 // Over each half second: speed gained along the way and the push across it (whatever way is up).
 const w=Math.max(1,Math.round(ghost.rate/2));let spikes=0;
 for(let k=1;k+w<n;k++){
  const p=vel[k],q=vel[k+w],dt=at(k+w)-at(k),speed=Math.hypot(...p);
  const acc=q.map((x,i)=>(x-p[i])/dt),along=speed>1?acc.reduce((s,x,i)=>s+x*p[i],0)/speed:0;
  const across=speed>1?Math.sqrt(Math.max(0,acc.reduce((s,x)=>s+x*x,0)-along*along)):0;
  if((along>MAX_PUSH||across>MAX_TURN)&&++spikes>SPIKES)return 'o carro acelerou ou virou mais do que um Opala consegue';
 }
 return null;
}

async function ticket(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(!s.apelido)return json({erro:'Escolha um apelido primeiro.'},409);
 const {circuito:c,modo:m,carro:k}=body,v=typeof body.versao==='string'?body.versao:'';
 if(!known(c,m,k)||!VERSION.test(v))return json({erro:'Pista, modo, carro ou versão inválidos.'},400);
 const best=await env.DB.prepare("SELECT volta_ms FROM recordes WHERE usuario_id=? AND circuito=? AND modo=? AND carro=? AND selo='conferido'").bind(s.id,c,m,k).first('volta_ms');
 // u/sb: the account and its Google account (a lap goes only to that same one); s0: issued; sl/gl: the last
 // chunk (server ms, game s); ss/gs: the clean stretch's start; xs/xg: the last crossing within it.
 const t={u:s.id,sb:s.google_sub,c,m,k,v,s0:Date.now(),sl:null,gl:null,ss:null,gs:null,xs:null,xg:null,n:0};
 return json({bilhete:await seal(env,TICKET,t),intervalo:CHUNK_EVERY,melhor:best??null});
}

async function chunk(request,env,body){
 const t=await unseal(env,TICKET,body.bilhete),now=Date.now(),g=body.relogio;
 if(!t||now-t.s0>RUN_HOURS*3600000)return json({erro:'Bilhete vencido ou inválido: peça outro.'},409);
 if(typeof g!=='number'||!Number.isFinite(g)||g<0||g>86400)return json({erro:'Relógio inválido.'},400);
 if(t.gl!==null&&g<t.gl-1e-6)return json({erro:'O relógio voltou: peça outro bilhete.'},409);
 let clean=false;
 if(t.gl!==null){
  const dS=now-t.sl,dG=(g-t.gl)*1000,cS=now-t.ss,cG=(g-t.gs)*1000;
  clean=dS<=CHUNK_GAP&&dG<=dS+JITTER&&dG>=dS*SLOWEST-JITTER&&cG<=cS+2*JITTER&&cG>=cS*STEADY-2*JITTER;
 }
 // The lap ending here, when the stretch has been clean since it began (a crossing is forgotten when it breaks).
 const from=clean&&t.xg!==null?{g:t.xg,s:t.xs}:null,out={};
 if(!clean){t.gs=g;t.ss=now;t.xg=t.xs=null;}
 if(body.cruzou===true){
  if(body.volta!==undefined)out.volta=await judge(env,t,g,now,from,body.volta);
  t.xg=g;t.xs=now;
 }
 t.gl=g;t.sl=now;t.n++;
 out.bilhete=await seal(env,TICKET,t);
 return json(out);
}

// The lap that ends at game time g: checked, and kept when it is the pilot's best. Its verdict goes to the panel's
// events too (a refusal with its reason, up to LOGGED_REFUSALS a ticket).
async function judge(env,t,g,now,from,lap){
 const verdict=await check(env,t,g,now,from,lap);
 if(!verdict.conferida&&(t.rf=(t.rf??0)+1)<=LOGGED_REFUSALS)
  await event(env,'recusada',t.u,{circuito:t.c,modo:t.m,volta_ms:verdict.tempo_ms??null,motivo:verdict.recusada}).run().catch(()=>{});
 return verdict;
}
async function check(env,t,g,now,from,lap){
 if(!from)return {recusada:'a volta teve pausa, ficou sem sinal ou o jogo rodou mais devagar que o relógio'};
 const time=g-from.g,ms=Math.round(time*1000),real=now-from.s;
 if(Math.abs(real-ms)>LAP_SLACK+ms*.01)return {tempo_ms:ms,recusada:'o tempo da volta não bate com o relógio do servidor'};
 if(ms<fastest(t.c))return {tempo_ms:ms,recusada:'a volta foi rápida demais para esta pista'};
 const ghost=readGhost(lap?.fantasma),why=ghostProblem(ghost,time,t.c);
 if(why)return {tempo_ms:ms,recusada:why};
 if(!await env.DB.prepare('SELECT 1 FROM usuarios WHERE id=? AND google_sub=?').bind(t.u,t.sb).first())return {tempo_ms:ms,recusada:'a conta não existe mais'};
 const [r]=await env.DB.batch([env.DB.prepare(UPSERT).bind(t.u,t.c,t.m,t.k,'conferido',ms,t.v,now,now,JSON.stringify(ghost.stored)),
  event(env,'conferida',t.u,{circuito:t.c,modo:t.m,volta_ms:ms})]);
 return {tempo_ms:ms,conferida:true,recorde:r.meta.changes>0};
}

// A browser's records from before the account, once per account (the server keeps when: whatever browsers say),
// the pilot's best of each circuit and mode, flagged unchecked.
async function importOld(request,env,body){
 if(Date.now()>=IMPORT_UNTIL)return json({erro:'A subida dos recordes antigos terminou em 30/11/2026.'},410);
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(!s.apelido)return json({erro:'Escolha um apelido primeiro.'},409);
 if(s.importou_em)return json({erro:'Os recordes antigos desta conta já subiram.'},409);
 const list=body.recordes;
 if(!Array.isArray(list)||list.length>64)return json({erro:'Lista de recordes inválida.'},400);
 const now=Date.now(),best=new Map();
 for(const r of list){
  const {circuito:c,modo:m,volta_ms:ms}=r??{};
  if(!known(c,m,'opala')||!Number.isInteger(ms)||ms<fastest(c)||ms>3600000)continue;
  const key=c+'|'+m;if(!best.has(key)||ms<best.get(key).ms)best.set(key,{c,m,ms,when:Date.parse(r.data)});
 }
 // Once: the mark goes first, and only the request that set it writes.
 if(!(await env.DB.prepare('UPDATE usuarios SET importou_em=? WHERE id=? AND importou_em IS NULL').bind(now,s.id).run()).meta.changes)
  return json({erro:'Os recordes antigos desta conta já subiram.'},409);
 const made=when=>Number.isFinite(when)&&when>=GAME_START&&when<=now?when:now;
 const steps=[...best.values()].map(r=>env.DB.prepare(UPSERT).bind(s.id,r.c,r.m,'opala','nao_verificado',r.ms,'local',made(r.when),now,null));
 await env.DB.batch([...steps,event(env,'importou',s.id,{recordes:steps.length})]);
 return json({importados:steps.length});
}

const view=(url)=>{
 const c=url.searchParams.get('circuito'),m=url.searchParams.get('modo'),k=url.searchParams.get('carro')||'opala';
 return (c===null||Object.hasOwn(CIRCUITS,c))&&MODES.includes(m)&&CARS.includes(k)?{c,m,k}:null;
};
// A circuit's board: each pilot once, by their best checked lap (their best old one when they have none), with
// its badge and the day (public: no account needed, and no time of day).
async function board(request,env,url){
 const q=view(url);if(!q?.c)return json({erro:'Pista ou modo inválido.'},400);
 const me=await signedIn(request,env);
 const rows=(await env.DB.prepare('SELECT r.usuario_id AS u,u.apelido,r.selo,r.volta_ms,r.feito_em FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.circuito=? AND r.modo=? AND r.carro=? AND u.apelido IS NOT NULL ORDER BY r.volta_ms,r.feito_em LIMIT 400').bind(q.c,q.m,q.k).all()).results;
 const pilots=new Map();
 for(const r of rows){const had=pilots.get(r.u);if(!had||had.selo!=='conferido'&&r.selo==='conferido')pilots.set(r.u,r);}
 const out=[...pilots.values()].sort((a,b)=>a.volta_ms-b.volta_ms||a.feito_em-b.feito_em).slice(0,100)
  .map(r=>({apelido:r.apelido,selo:r.selo,volta_ms:r.volta_ms,feito_em:new Date(r.feito_em).toISOString().slice(0,10),meu:me?.id===r.u}));
 return json({recordes:out});
}
// The best checked lap on each circuit, for the circuit list.
async function bests(request,env,url){
 const q=view(url);if(!q)return json({erro:'Modo inválido.'},400);
 const rows=(await env.DB.prepare("SELECT r.circuito,MIN(r.volta_ms) AS volta_ms FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.modo=? AND r.carro=? AND r.selo='conferido' AND u.apelido IS NOT NULL GROUP BY r.circuito").bind(q.m,q.k).all()).results;
 return json({melhores:Object.fromEntries(rows.filter(r=>Object.hasOwn(CIRCUITS,r.circuito)).map(r=>[r.circuito,r.volta_ms]))});
}

export const RECORDS_GETS={'/api/recordes':board,'/api/recordes/melhores':bests};
export const RECORDS_POSTS={'/api/recordes/bilhete':ticket,'/api/recordes/pedaco':chunk,'/api/recordes/importar':importOld};
