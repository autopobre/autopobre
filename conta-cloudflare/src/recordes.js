// Online records: each pilot's best lap per circuit, mode and car, with its badge (selo).
//
// conferido: checked by the server while the lap was driven. Driving with an account, the game takes a
// ticket when it goes on track (/bilhete: circuit, mode, car, the game's build), then sends a chunk every
// CHUNK_EVERY seconds of its physics clock and one at every crossing of the line (/pedaco). The ticket is
// sealed and travels back and forth with every chunk, so nothing is written while laps go by.
// - Between two chunks the game's clock must have run as the server's did: no slow motion, nothing ahead,
//   within the network's say, and no silence over CHUNK_GAP. A pause breaks the clean stretch, so a lap
//   with a pause in it is not checked.
// - A lap is its two crossings: its game time against the real time between them.
// - Its ghost (the game's own recording, ghost-lap.js) must match: as long as the lap, from the line
//   around the whole track (the circuit's length, circuits.js), never faster than an Opala can go,
//   never gaining track it did not drive.
// Only a pilot's best goes in, with its ghost ("ver a volta", later).
//
// nao_verificado: an old record of a browser, from before the account (/importar). The game sends them
// once per browser and account, until IMPORT_UNTIL, and the board shows them flagged ⚠️.
//
// What this cannot tell: a lap driven by a program, or slowed for a second inside one chunk. That is the
// next badge's work (homologado: the server re-running the lap from the pilot's inputs).
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {json,seal,unseal,signedIn,notSignedIn} from './base.js';

const TICKET='bilhete-v1';
export const CHUNK_EVERY=5;   // seconds of the game's clock between chunks (the game keeps this pace)
const CHUNK_GAP=15000;        // ms: a longer silence breaks the stretch (a pause, the line down)
const JITTER=750;             // ms: the network's say in one chunk's timing
const SLOWEST=.85;            // the slowest a chunk's game clock may run against the real one
const STEADY=.97;             // the same over the whole stretch since it began
const LAP_SLACK=1000;         // ms (plus 1% of the lap): a lap's real time against its game time
const RUN_HOURS=8;            // a ticket's life
const MODES=['normal','immersive'],CARS=['opala'];
const VERSION=/^[\w.-]{1,40}$/;
// The old records come up until the end of 30/11/2026 in Brasília (the owner's deadline: then the game
// has its players' records, and only checked laps go in).
export const IMPORT_UNTIL=Date.parse('2026-12-01T03:00:00Z');
const MAX_SPEED=95;           // m/s between two ghost samples (an Opala tops out near 60)
const FASTEST=70;             // m/s over a whole lap: anything quicker is no lap
const GHOST_BYTES=120000;     // a lap's ghost as the game encodes it (3600 samples at most: ~70 kB)
export const RECORDS_BODY={'/api/recordes/pedaco':GHOST_BYTES+4096,'/api/recordes/importar':16384};
const fastest=circuit=>Math.ceil(CIRCUITS[circuit].length/FASTEST*1000);
const UPSERT=`INSERT INTO recordes (usuario_id,circuito,modo,carro,selo,volta_ms,versao,feito_em,enviado_em,fantasma) VALUES (?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(usuario_id,circuito,modo,carro,selo) DO UPDATE SET volta_ms=excluded.volta_ms,versao=excluded.versao,feito_em=excluded.feito_em,
 enviado_em=excluded.enviado_em,fantasma=excluded.fantasma WHERE excluded.volta_ms<recordes.volta_ms`;

// A ghost as ghost-lap.js packs it (v1: the first sample whole, then 16-bit steps; x, y, z and the track
// distance in centimetres, the three angles in 1e-4 rad), read with its sizes checked first.
const FIELDS=7,SCALE=[100,100,100,1e4,1e4,1e4,100];
export function readGhost(entry){
 try{
  const {v,time,rate,n,start,data}=entry??{};
  if(v!==1||!Number.isInteger(rate)||rate<1||rate>120||!Number.isInteger(n)||n<2||n>4000||!(time>0&&time<=3600))return null;
  if((n-2)/rate>=time+1e-6||time>(n-1)/rate+1e-6)return null;
  if(!Array.isArray(start)||start.length!==FIELDS||!start.every(Number.isSafeInteger)||typeof data!=='string')return null;
  const size=(n-1)*FIELDS*2;if(data.length!==4*Math.ceil(size/3))return null;
  const raw=atob(data);if(raw.length!==size)return null;
  const q=[...start],values=new Float64Array(n*FIELDS);
  for(let i=0;i<n*FIELDS;i++){
   const f=i%FIELDS;
   if(i>=FIELDS){const j=(i-FIELDS)*2;let d=raw.charCodeAt(j)|raw.charCodeAt(j+1)<<8;if(d>32767)d-=65536;q[f]+=d;}
   values[i]=q[f]/SCALE[f];
  }
  return {time,rate,n,values};
 }catch{return null;}
}
// Why a ghost cannot be this lap, or null when it can.
export function ghostProblem(ghost,time,circuit){
 if(!ghost)return 'o fantasma da volta não pôde ser lido';
 if(Math.abs(ghost.time-time)>.005)return 'o fantasma não tem o tempo da volta';
 const v=ghost.values,L=CIRCUITS[circuit].length,at=k=>k>=ghost.n-1?ghost.time:k/ghost.rate;
 const first=v[6],last=v[(ghost.n-1)*FIELDS+6];
 if(Math.abs(first)>30)return 'a volta não começa na linha';
 if(Math.abs(last-first-L)>L*.03+30)return 'a volta não percorre a pista inteira';
 for(let k=1;k<ghost.n;k++){
  const a=(k-1)*FIELDS,b=k*FIELDS,dt=at(k)-at(k-1);
  const moved=Math.hypot(v[b]-v[a],v[b+1]-v[a+1],v[b+2]-v[a+2]),gained=v[b+6]-v[a+6];
  if(!(dt>0))return 'o fantasma tem o tempo fora de ordem';
  if(moved>MAX_SPEED*dt+1)return 'o carro andou mais rápido do que um Opala anda';
  // Track gained against ground covered: the inside of a hairpin gains more than it drives, a cut gains it all.
  if(gained<-5||gained>moved*1.8+3)return 'o carro ganhou pista sem andar por ela';
 }
 return null;
}

async function ticket(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(!s.apelido)return json({erro:'Escolha um apelido primeiro.'},409);
 const {circuito:c,modo:m,carro:k}=body,v=String(body.versao??'');
 if(!Object.hasOwn(CIRCUITS,c)||!MODES.includes(m)||!CARS.includes(k)||!VERSION.test(v))return json({erro:'Pista, modo, carro ou versão inválidos.'},400);
 const best=await env.DB.prepare("SELECT volta_ms FROM recordes WHERE usuario_id=? AND circuito=? AND modo=? AND carro=? AND selo='conferido'").bind(s.id,c,m,k).first('volta_ms');
 // u: the account; s0: issued; sl/gl: the last chunk (server ms, game s); ss/gs: the clean stretch's start;
 // xs/xg: the last crossing within it.
 const t={u:s.id,c,m,k,v,s0:Date.now(),sl:null,gl:null,ss:null,gs:null,xs:null,xg:null,n:0};
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

// The lap that ends at game time g: checked, and kept when it is the pilot's best.
async function judge(env,t,g,now,from,lap){
 if(!from)return {recusada:'a volta teve pausa, ficou sem sinal ou o jogo rodou mais devagar que o relógio'};
 const time=g-from.g,ms=Math.round(time*1000),real=now-from.s;
 if(Math.abs(real-ms)>LAP_SLACK+ms*.01)return {tempo_ms:ms,recusada:'o tempo da volta não bate com o relógio do servidor'};
 if(ms<fastest(t.c))return {tempo_ms:ms,recusada:'a volta foi rápida demais para esta pista'};
 const why=ghostProblem(readGhost(lap?.fantasma),time,t.c);
 if(why)return {tempo_ms:ms,recusada:why};
 try{
  const r=await env.DB.prepare(UPSERT).bind(t.u,t.c,t.m,t.k,'conferido',ms,t.v,now,now,JSON.stringify(lap.fantasma)).run();
  return {tempo_ms:ms,conferida:true,recorde:r.meta.changes>0};
 }catch(error){
  if(/FOREIGN KEY/i.test(String(error?.message)))return {tempo_ms:ms,recusada:'a conta não existe mais'};
  throw error;
 }
}

// This browser's records from before the account, once (the game marks the browser), flagged unchecked.
async function importOld(request,env,body){
 if(Date.now()>=IMPORT_UNTIL)return json({erro:'A subida dos recordes antigos terminou em 30/11/2026.'},410);
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(!s.apelido)return json({erro:'Escolha um apelido primeiro.'},409);
 const list=body.recordes;
 if(!Array.isArray(list)||list.length>64)return json({erro:'Lista de recordes inválida.'},400);
 const now=Date.now(),steps=[];
 for(const r of list){
  const {circuito:c,modo:m,volta_ms:ms}=r??{};
  if(!Object.hasOwn(CIRCUITS,c)||!MODES.includes(m)||!Number.isInteger(ms)||ms<fastest(c)||ms>3600000)continue;
  const when=Date.parse(r.data),made=Number.isFinite(when)&&when<=now?when:now;
  steps.push(env.DB.prepare(UPSERT).bind(s.id,c,m,'opala','nao_verificado',ms,'local',made,now,null));
 }
 if(steps.length)await env.DB.batch(steps);
 return json({importados:steps.length});
}

const view=(url)=>{
 const c=url.searchParams.get('circuito'),m=url.searchParams.get('modo'),k=url.searchParams.get('carro')||'opala';
 return (c===null||Object.hasOwn(CIRCUITS,c))&&MODES.includes(m)&&CARS.includes(k)?{c,m,k}:null;
};
// A circuit's board: each pilot once, at their best lap, with its badge (public: no account needed).
async function board(request,env,url){
 const q=view(url);if(!q?.c)return json({erro:'Pista ou modo inválido.'},400);
 const me=await signedIn(request,env);
 const rows=(await env.DB.prepare('SELECT r.usuario_id AS u,u.apelido,r.selo,r.volta_ms,r.feito_em FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.circuito=? AND r.modo=? AND r.carro=? AND u.apelido IS NOT NULL ORDER BY r.volta_ms,r.feito_em LIMIT 400').bind(q.c,q.m,q.k).all()).results;
 const seen=new Set(),out=[];
 for(const r of rows){
  if(seen.has(r.u))continue;seen.add(r.u);
  out.push({apelido:r.apelido,selo:r.selo,volta_ms:r.volta_ms,feito_em:new Date(r.feito_em).toISOString(),meu:me?.id===r.u});
  if(out.length>=100)break;
 }
 return json({recordes:out});
}
// The best lap on each circuit, for the circuit list.
async function bests(request,env,url){
 const q=view(url);if(!q)return json({erro:'Modo inválido.'},400);
 const rows=(await env.DB.prepare('SELECT r.circuito,MIN(r.volta_ms) AS volta_ms FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.modo=? AND r.carro=? AND u.apelido IS NOT NULL GROUP BY r.circuito').bind(q.m,q.k).all()).results;
 return json({melhores:Object.fromEntries(rows.filter(r=>Object.hasOwn(CIRCUITS,r.circuito)).map(r=>[r.circuito,r.volta_ms]))});
}

export const RECORDS_GETS={'/api/recordes':board,'/api/recordes/melhores':bests};
export const RECORDS_POSTS={'/api/recordes/bilhete':ticket,'/api/recordes/pedaco':chunk,'/api/recordes/importar':importOld};
