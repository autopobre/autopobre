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
//   the lap, from the line around the whole track (circuits.js), the car covering it with no jump (ghostProblem);
//   on that circuit's road, its track distance where the car was, no cut (trajeto.js, pistas.js); and what an Opala
//   can do along it: its engine, brakes, tyres and top speed, a few contacts aside (dinamica.js, envelope.js).
// - Its controls (the game's comandos-volta.js) must explain it: the whole lap's steps, and no speed gained with
//   nothing pushing (comandos.js). What they look like (a person's hands or a program's) goes to the lap log.
// - The ticket is the account's as it was then (its Google account, sealed in it), and every chunk comes with that
//   account's session: signed out, deleted, or another account in the browser (one that took a deleted account's
//   number too), the ticket ends.
// Only a pilot's best goes in, with its ghost ("ver a volta", later); every lap goes to the lap log. The ticket keeps
// no count the server trusts: sent again, an old one would write again, so what an account may write (records, laps,
// refusals in the panel's events) is counted per hour in the database.
//
// nao_verificado: an old record of a browser, from before the account (/importar), once per account (the
// server keeps when), until IMPORT_UNTIL, and the board shows them flagged ⚠️. A pilot with a checked lap
// shows by it.
//
// What this cannot tell: a ghost and controls made up together with the game's own physics (a program driving the
// real game leaves signals for the admin to see, not a refusal), the physics changed by less than the margins (about
// 2% of lap time), or a second of slow motion inside one chunk. That is the next badge's work (homologado: the server
// re-running the lap from the pilot's controls with the game's own physics).
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {LINE_TIMES} from './pisos.js';
import {json,seal,unseal,signedIn,notSignedIn,isTrusted} from './base.js';
import {event,recent,HOUR} from './eventos.js';
import {readInputs,inputsProblem,inputSignals,INPUT_CHARS} from './comandos.js';
import {dynamicsProblem} from './dinamica.js';
import {trackProblem} from './trajeto.js';

const TICKET='bilhete-v1';
export const CHUNK_EVERY=10;  // seconds of the game's clock between chunks (the game keeps this pace)
const CHUNK_GAP=25000;        // ms: a longer silence breaks the stretch (a pause, the line down)
const JITTER=750;             // ms: the network's say in one chunk's timing
const SLOWEST=.85;            // the slowest a chunk's game clock may run against the real one
const STEADY=.97;             // the same over the whole stretch since it began
const LAP_SLACK=1000;         // ms (plus 1% of the lap): a lap's real time against its game time
const RUN_HOURS=8;            // a ticket's life
// Each car a board of its own (an Opala does 217 km/h and a Fusca 170: their times never compare), each with its own
// floor (pisos.js) and physics (envelope.js). A circuit's record is one, whichever mode drove it (a race, the story):
// the mode is kept with each lap, and the boards and the pilot's best look past it.
const MODES=['normal','immersive'],CARS=['opala','fusca'];
const VERSION=/^[\w.-]{1,40}$/;
// The old records come up until the end of 30/11/2026 in Brasília (the owner's deadline), and none is dated
// before the game was online.
export const IMPORT_UNTIL=Date.parse('2026-12-01T03:00:00Z');
const GAME_START=Date.parse('2026-09-01T00:00:00Z');
// The quickest a lap may be: this share of the car's driving line's own time, or, on a circuit the table does not know
// yet, an average no Opala keeps. The line is a model, not a wall: the first checked laps (10-25) beat it by 3.5%
// (Interlagos 1:49.2 against its 1:53.3), so the floor leaves a good pilot room and stops only the absurd.
const FLOOR=.85;
const fastest=(circuit,car)=>{const line=LINE_TIMES[car]?.[circuit];return Math.ceil(1000*(line?line*FLOOR:CIRCUITS[circuit].length/70));};
const GHOST_BYTES=120000;     // a lap's ghost as the game encodes it (3600 samples at most: ~70 kB)
const LOGGED_REFUSALS=5;      // refused laps an account writes to the panel's events in an hour (the rest only answer)
const SAVED_LAPS=120;         // records an account may write in an hour: more than a pilot sets, even at Curvelo's 32 s
const LOGGED_LAPS=150;        // laps an account writes to the lap log in an hour (Curvelo's 32 s laps make 112)
const PREVIOUS_LAPS=10;       // earlier laps a lap's brakes are compared with (inputSignals: a replay brakes where they did)
const RACES_PER_HOUR=30;      // races (tickets) an account writes to the races' log in an hour
export const RECORDS_BODY={'/api/recordes/pedaco':GHOST_BYTES+INPUT_CHARS+4096,'/api/recordes/importar':16384};
const known=(c,m,k)=>typeof c==='string'&&Object.hasOwn(CIRCUITS,c)&&MODES.includes(m)&&CARS.includes(k);
const UPSERT=`INSERT INTO recordes (usuario_id,circuito,modo,carro,selo,volta_ms,versao,feito_em,enviado_em,fantasma,sinais) VALUES (?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(usuario_id,circuito,modo,carro,selo) DO UPDATE SET volta_ms=excluded.volta_ms,versao=excluded.versao,feito_em=excluded.feito_em,
 enviado_em=excluded.enviado_em,fantasma=excluded.fantasma,sinais=excluded.sinais WHERE excluded.volta_ms<recordes.volta_ms`;

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
const MAX_SPEED=70;          // m/s between two samples: no jump (the Opala's real top speed is dinamica.js's to check)
// Track gained against ground covered between two samples: the inside of a hairpin gains up to 2.5 times what it drives,
// a pit lane's own track distance (Velocitta) 6 times; 3 times and GAIN_SLACK m per second of sample spacing over it
// leave those, and stop a jump along the road (where a cut is, trajeto.js knows).
const GAIN=3,GAIN_SLACK=60;
const DRIVEN=.85;            // of the track's length the car must cover (the racing line cuts inside the bends)
// A lap starts on the line, or, the race's first, on the grid behind it (the back of the field is 76 m back:
// race-roster.js GRID_START_BACK); either way it ends on the line one lap on.
const GRID_BACK=120;
// Why a ghost cannot be this lap, or null when it can: read, recorded by the game, the lap's time, from the line (or
// the grid) round the whole track, no jump, and the ground covered. What the car can do along it is dinamica.js's
// (contacts and spins pull and turn far past a car for a moment, and buy no time), where the road is trajeto.js's.
export function ghostProblem(ghost,time,circuit){
 if(!ghost)return 'o fantasma da volta não pôde ser lido';
 if(!RATES.has(ghost.rate))return 'o fantasma não foi gravado pelo jogo';
 if(Math.abs(ghost.time-time)>.005)return 'o fantasma não tem o tempo da volta';
 const v=ghost.values,n=ghost.n,L=CIRCUITS[circuit].length,at=k=>k>=n-1?ghost.time:k/ghost.rate;
 const first=v[6],last=v[(n-1)*FIELDS+6];
 if(first>30||first<-GRID_BACK)return 'a volta não começa na linha nem no grid';
 if(Math.abs(last-L)>L*.03+30)return 'a volta não percorre a pista inteira';
 let covered=0;
 for(let k=1;k<n;k++){
  const a=(k-1)*FIELDS,b=k*FIELDS,dt=at(k)-at(k-1);
  if(!(dt>0))return 'o fantasma tem o tempo fora de ordem';
  const moved=Math.hypot(v[b]-v[a],v[b+1]-v[a+1],v[b+2]-v[a+2]),gained=v[b+6]-v[a+6];
  if(moved>MAX_SPEED*dt+.05)return 'o carro andou mais rápido do que um Opala anda';
  if(gained<-5||gained>moved*GAIN+GAIN_SLACK*dt)return 'o carro ganhou pista sem andar por ela';
  covered+=moved;
 }
 if(covered<DRIVEN*L)return 'o carro não percorreu a pista';
 return null;
}

// The pilot's checked best on a circuit in a car (ms), whichever mode drove it, or null.
const bestOf=(env,user,circuit,car)=>env.DB.prepare("SELECT MIN(volta_ms) AS ms FROM recordes WHERE usuario_id=? AND circuito=? AND carro=? AND selo='conferido'").bind(user,circuit,car).first('ms');

async function ticket(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(!s.apelido)return json({erro:'Escolha um apelido primeiro.'},409);
 const {circuito:c,modo:m,carro:k}=body,v=typeof body.versao==='string'?body.versao:'';
 if(!known(c,m,k)||!VERSION.test(v))return json({erro:'Pista, modo, carro ou versão inválidos.'},400);
 const best=await bestOf(env,s.id,c,k);
 // A ticket is the pilot going on track: one race (or practice, or story race) for the admin panel's pilots, up to
 // RACES_PER_HOUR an hour (a ticket writes nothing else; past that, it is answered all the same).
 try{
  if(await env.DB.prepare('SELECT COUNT(*) AS n FROM corridas WHERE usuario_id=? AND quando>?').bind(s.id,Date.now()-HOUR).first('n')<RACES_PER_HOUR)
   await env.DB.prepare('INSERT INTO corridas (usuario_id,quando,circuito,modo,carro) VALUES (?,?,?,?,?)').bind(s.id,Date.now(),c,m,k).run();
 }catch{}
 // u/sb: the account and its Google account (a lap goes only to that same one); s0: issued; sl/gl: the last
 // chunk (server ms, game s); ss/gs: the clean stretch's start; xs/xg: the last crossing within it.
 const t={u:s.id,sb:s.google_sub,c,m,k,v,s0:Date.now(),sl:null,gl:null,ss:null,gs:null,xs:null,xg:null,n:0};
 return json({bilhete:await seal(env,TICKET,t),intervalo:CHUNK_EVERY,melhor:best??null});
}

async function chunk(request,env,body){
 const t=await unseal(env,TICKET,body.bilhete),now=Date.now(),g=body.relogio;
 if(!t||now-t.s0>RUN_HOURS*3600000)return json({erro:'Bilhete vencido ou inválido: peça outro.'},409);
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(s.id!==t.u||s.google_sub!==t.sb)return json({erro:'Bilhete de outra conta: peça outro.'},409);
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
  if(body.volta!==undefined)out.volta=await judge(env,t,g,now,from,body.volta,isTrusted(env,s));
  t.xg=g;t.xs=now;
 }
 t.gl=g;t.sl=now;t.n++;
 out.bilhete=await seal(env,TICKET,t);
 return json(out);
}

// The lap that ends at game time g: checked, and kept when it is the pilot's best. Every lap goes to the lap log with
// what its controls look like (comandos.js inputSignals, against the pilot's last laps here), up to LOGGED_LAPS an hour.
// A refused lap that would have been the pilot's best keeps its ghost there, and the answer says so (revisao: the log's
// id): the pilot may ask for a review (/revisao), and the admin approves it into a record (admin.js) or not.
// A trusted pilot's lap (base.js isTrusted) goes in as checked even when the checks would refuse it: the log keeps why
// they would have (caso), its ghost and its controls, as a case for the admin panel.
// A record goes to the panel's events, and so does a refusal with its reason, up to LOGGED_REFUSALS an hour.
async function judge(env,t,g,now,from,lap,trusted=false){
 const ghost=readGhost(lap?.fantasma),inputs=readInputs(lap?.comandos);
 let signals=null;
 if(ghost&&inputs)try{
  const before=(await env.DB.prepare('SELECT freios FROM voltas WHERE usuario_id=? AND circuito=? AND carro=? AND freios IS NOT NULL ORDER BY quando DESC LIMIT ?').bind(t.u,t.c,t.k,PREVIOUS_LAPS).all()).results;
  signals=inputSignals(inputs,ghost,before.map(r=>JSON.parse(r.freios)).filter(Array.isArray));
 }catch{}
 const verdict=await check(env,t,g,now,from,ghost,inputs,signals,trusted);
 try{
  if((await env.DB.prepare('SELECT COUNT(*) AS n FROM voltas WHERE usuario_id=? AND quando>?').bind(t.u,now-HOUR).first('n'))<LOGGED_LAPS){
   const ms=verdict.tempo_ms??(ghost?Math.round(ghost.time*1000):null),best=!verdict.conferida&&ghost&&ms?await bestOf(env,t.u,t.c,t.k):null;
   const reviewable=!verdict.conferida&&!!ghost&&!!ms&&(best===null||ms<best),kept=reviewable||!!verdict.caso;
   const r=await env.DB.prepare('INSERT INTO voltas (usuario_id,quando,circuito,modo,carro,versao,tempo_ms,resultado,aparelho,sinais,freios,fantasma,comandos,caso) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(t.u,now,t.c,t.m,t.k,t.v,ms,verdict.recorde?'recorde':verdict.conferida?'conferida':verdict.recusada,
     signals?.aparelho??null,signals?JSON.stringify({sinais:signals.sinais,medidas:signals.medidas}):null,signals?JSON.stringify(signals.freios):null,
     kept&&ghost?JSON.stringify(ghost.stored):null,verdict.caso&&lap?.comandos?JSON.stringify(lap.comandos):null,verdict.caso??null).run();
   if(reviewable&&r.meta.last_row_id)verdict.revisao=r.meta.last_row_id;
  }
 }catch{}
 if(!verdict.conferida)try{
  if(await recent(env,t.u,['recusada'],HOUR)<LOGGED_REFUSALS)
   await event(env,'recusada',t.u,{circuito:t.c,modo:t.m,volta_ms:verdict.tempo_ms??null,motivo:verdict.recusada}).run();
 }catch{}
 return verdict;
}
// The verdict: refused with the first reason (the clock, the floor, the ghost, the road, the car's physics, the controls),
// or checked. A trusted pilot's lap with a readable ghost goes in whatever the reason (a pause: its ghost's own time),
// the reason kept as its case (caso).
async function check(env,t,g,now,from,ghost,inputs,signals,trusted=false){
 let why=null,time=null;
 if(!from){why='a volta teve pausa, ficou sem sinal ou o jogo rodou mais devagar que o relógio';time=ghost?.time??null;}
 else{
  time=g-from.g;const real=now-from.s,lap=Math.round(time*1000);
  if(Math.abs(real-lap)>LAP_SLACK+lap*.01)why='o tempo da volta não bate com o relógio do servidor';
  else if(lap<fastest(t.c,t.k))why='a volta foi rápida demais para esta pista';
 }
 const ms=time===null?null:Math.round(time*1000);
 why??=ghostProblem(ghost,time,t.c)??trackProblem(ghost,t.c)??dynamicsProblem(ghost,t.c,t.k)??inputsProblem(inputs,ghost);
 if(why&&!(trusted&&ghost&&ms))return from?{tempo_ms:ms,recusada:why}:{recusada:why};
 // Written only when it beats the pilot's best (the same crossing sent again changes nothing), with its signals.
 if(await recent(env,t.u,['conferida'],HOUR)>=SAVED_LAPS)return {tempo_ms:ms,recusada:'muitos recordes gravados nesta hora: tente de novo mais tarde'};
 const kept=JSON.stringify({aparelho:signals?.aparelho??null,sinais:signals?.sinais??[],medidas:signals?.medidas??{},...(why&&{confiavel:true,caso:why})});
 const r=await env.DB.prepare(UPSERT).bind(t.u,t.c,t.m,t.k,'conferido',ms,t.v,now,now,JSON.stringify(ghost.stored),kept).run(),record=r.meta.changes>0;
 if(record)await event(env,'conferida',t.u,{circuito:t.c,modo:t.m,volta_ms:ms}).run().catch(()=>{});
 return {tempo_ms:ms,conferida:true,recorde:record,...(why&&{caso:why})};
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
  if(!known(c,m,'opala')||!Number.isInteger(ms)||ms<fastest(c,'opala')||ms>3600000)continue;
  const key=c+'|'+m;if(!best.has(key)||ms<best.get(key).ms)best.set(key,{c,m,ms,when:Date.parse(r.data)});
 }
 // Once: the mark goes first, and only the request that set it writes.
 if(!(await env.DB.prepare('UPDATE usuarios SET importou_em=? WHERE id=? AND importou_em IS NULL').bind(now,s.id).run()).meta.changes)
  return json({erro:'Os recordes antigos desta conta já subiram.'},409);
 const made=when=>Number.isFinite(when)&&when>=GAME_START&&when<=now?when:now;
 const steps=[...best.values()].map(r=>env.DB.prepare(UPSERT).bind(s.id,r.c,r.m,'opala','nao_verificado',r.ms,'local',made(r.when),now,null,null));
 await env.DB.batch([...steps,event(env,'importou',s.id,{recordes:steps.length})]);
 return json({importados:steps.length});
}

// The board asked for: a circuit (none: the circuit list) and a car (the Opala when none is named). A mode (the old
// game asked per mode) is read past: a circuit's record is one.
const view=(url)=>{
 const c=url.searchParams.get('circuito'),k=url.searchParams.get('carro')||'opala';
 return (c===null||Object.hasOwn(CIRCUITS,c))&&CARS.includes(k)?{c,k}:null;
};
// A circuit's board: each pilot once, by their best checked lap (their best old one when they have none), whichever
// mode drove it, with its badge and the day (public: no account needed, and no time of day).
async function board(request,env,url){
 const q=view(url);if(!q?.c)return json({erro:'Pista ou carro inválido.'},400);
 const me=await signedIn(request,env);
 const rows=(await env.DB.prepare('SELECT r.usuario_id AS u,u.apelido,r.selo,r.volta_ms,r.feito_em FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.circuito=? AND r.carro=? AND u.apelido IS NOT NULL ORDER BY r.volta_ms,r.feito_em LIMIT 400').bind(q.c,q.k).all()).results;
 const pilots=new Map();
 for(const r of rows){const had=pilots.get(r.u);if(!had||had.selo!=='conferido'&&r.selo==='conferido')pilots.set(r.u,r);}
 const out=[...pilots.values()].sort((a,b)=>a.volta_ms-b.volta_ms||a.feito_em-b.feito_em).slice(0,100)
  .map(r=>({apelido:r.apelido,selo:r.selo,volta_ms:r.volta_ms,feito_em:new Date(r.feito_em).toISOString().slice(0,10),meu:me?.id===r.u}));
 return json({recordes:out});
}
// The best checked lap on each circuit in a car, for the circuit list.
async function bests(request,env,url){
 const q=view(url);if(!q)return json({erro:'Carro inválido.'},400);
 const rows=(await env.DB.prepare("SELECT r.circuito,MIN(r.volta_ms) AS volta_ms FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.carro=? AND r.selo='conferido' AND u.apelido IS NOT NULL GROUP BY r.circuito").bind(q.k).all()).results;
 return json({melhores:Object.fromEntries(rows.filter(r=>Object.hasOwn(CIRCUITS,r.circuito)).map(r=>[r.circuito,r.volta_ms]))});
}

// A review asked for (POST {volta: the id a refused lap's answer gave}): the pilot's own lap, one that kept its ghost
// (it would have been their best), asked once; the admin panel lists it (admin.js). At most PENDING_REVIEWS open at once.
const PENDING_REVIEWS=10;
async function askReview(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 const id=body.volta;if(!Number.isSafeInteger(id)||id<1)return json({erro:'Volta inválida.'},400);
 const lap=await env.DB.prepare('SELECT circuito,carro,tempo_ms,resultado,revisao FROM voltas WHERE id=? AND usuario_id=? AND fantasma IS NOT NULL').bind(id,s.id).first();
 if(!lap)return json({erro:'Essa volta não pode ser revista (ela fica guardada por 90 dias).'},404);
 if(lap.revisao)return json({revisao:lap.revisao});
 if(await env.DB.prepare("SELECT COUNT(*) AS n FROM voltas WHERE usuario_id=? AND revisao='pedida'").bind(s.id).first('n')>=PENDING_REVIEWS)
  return json({erro:'Você já tem revisões esperando. Aguarde a resposta delas.'},429);
 await env.DB.batch([env.DB.prepare("UPDATE voltas SET revisao='pedida' WHERE id=? AND revisao IS NULL").bind(id),
  event(env,'revisao_pedida',s.id,{circuito:lap.circuito,carro:lap.carro,volta_ms:lap.tempo_ms,motivo:lap.resultado})]);
 return json({revisao:'pedida'});
}

export const RECORDS_GETS={'/api/recordes':board,'/api/recordes/melhores':bests};
export const RECORDS_POSTS={'/api/recordes/bilhete':ticket,'/api/recordes/pedaco':chunk,'/api/recordes/importar':importOld,'/api/recordes/revisao':askReview};
// For the admin's approval (admin.js): a reviewed lap written as the pilot's checked record when it beats it.
export {UPSERT};
