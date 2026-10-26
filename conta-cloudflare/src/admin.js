// The admin panel's data (the page: pista_interlagos/teste/admin.html, in the dev build only), for an administrator
// (base.js isAdmin: the Worker's ADMINS secret, or the database's mark): the server checks it on every request,
// whatever the page says. It shows the nicknames, the dates, the counts, the events and the laps with their signals;
// never the Google account's id. Two things it changes, each told to the pilot in their events: a record taken off the
// boards (a player's report of a time that cannot be), and a review decided (a refused lap the pilot asked about:
// approved, it becomes their checked record).
import {json,signedIn,notSignedIn,isAdmin} from './base.js';
import {EVENT_DAYS,event} from './eventos.js';
import {UPSERT} from './recordes.js';
import {cleanNickname,nicknameKey,NICKNAME_RULE} from './apelidos.js';
import {LINE_TIMES} from './pisos.js';

const DAY=86400000;
async function admin(request,env){
 const s=await signedIn(request,env);
 if(!s)return {refused:notSignedIn()};
 if(!isAdmin(env,s))return {refused:json({erro:'Acesso só para administradores.'},403)};
 return {s};
}
const rows=async statement=>(await statement.all()).results;

// The numbers at the top: accounts, sign-ins, sessions, records, and the refused laps by reason.
async function summary(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const now=Date.now(),week=now-7*DAY,day=now-DAY;
 const totals=await env.DB.prepare(`SELECT
  (SELECT COUNT(*) FROM usuarios) AS contas,
  (SELECT COUNT(*) FROM usuarios WHERE apelido IS NOT NULL) AS com_apelido,
  (SELECT COUNT(*) FROM usuarios WHERE criado_em>?1) AS novas_7d,
  (SELECT COUNT(*) FROM eventos WHERE tipo IN ('entrou','conta_criada') AND quando>?2) AS entradas_24h,
  (SELECT COUNT(*) FROM eventos WHERE tipo IN ('entrou','conta_criada') AND quando>?1) AS entradas_7d,
  (SELECT COUNT(DISTINCT usuario_id) FROM sessoes WHERE expira_em>?3) AS com_sessao,
  (SELECT COUNT(*) FROM recordes WHERE selo='conferido') AS conferidos,
  (SELECT COUNT(*) FROM recordes WHERE selo='nao_verificado') AS antigos,
  (SELECT COUNT(*) FROM eventos WHERE tipo='recusada' AND quando>?1) AS recusadas_7d,
  (SELECT COUNT(*) FROM voltas WHERE quando>?1) AS voltas_7d,
  (SELECT COUNT(*) FROM voltas WHERE quando>?1 AND sinais LIKE '%"sinais":["%') AS sinalizadas_7d,
  (SELECT COUNT(*) FROM voltas WHERE revisao='pedida') AS revisoes,
  (SELECT COUNT(*) FROM voltas WHERE caso IS NOT NULL) AS casos`).bind(week,day,now).first();
 const reasons=await rows(env.DB.prepare("SELECT json_extract(detalhe,'$.motivo') AS motivo,COUNT(*) AS n FROM eventos WHERE tipo='recusada' AND quando>? GROUP BY motivo ORDER BY n DESC").bind(week));
 return json({...totals,recusas_por_motivo:reasons,eventos_por:EVENT_DAYS});
}

// Every account: when it came and last signed in, its open sessions, its records, its refused laps of the week.
async function users(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const now=Date.now();
 const list=await rows(env.DB.prepare(`SELECT u.id,u.apelido,u.criado_em,u.ultimo_login,u.importou_em,u.admin,
  (SELECT COUNT(*) FROM sessoes s WHERE s.usuario_id=u.id AND s.expira_em>?1) AS sessoes,
  (SELECT COUNT(*) FROM recordes r WHERE r.usuario_id=u.id AND r.selo='conferido') AS conferidos,
  (SELECT COUNT(*) FROM recordes r WHERE r.usuario_id=u.id AND r.selo='nao_verificado') AS antigos,
  (SELECT COUNT(*) FROM eventos e WHERE e.usuario_id=u.id AND e.tipo='recusada' AND e.quando>?2) AS recusadas_7d,
  (SELECT COUNT(*) FROM voltas v WHERE v.usuario_id=u.id AND v.quando>?2 AND v.sinais LIKE '%"sinais":["%') AS sinalizadas_7d
  FROM usuarios u ORDER BY u.ultimo_login DESC LIMIT 500`).bind(now,now-7*DAY));
 const listed=new Set(String(env.ADMINS??'').split(',').map(x=>x.trim()).filter(Boolean));
 const subs=new Map((await rows(env.DB.prepare('SELECT id,google_sub FROM usuarios'))).map(u=>[u.id,u.google_sub]));
 const driving=await pilots(env);
 return json({usuarios:list.map(u=>({...u,admin:!!u.admin||listed.has(subs.get(u.id)),...(driving.get(u.id)??NOT_DRIVEN)}))});
}
// How much each pilot drives, to tell the good ones from who only signed in (the last EVENT_DAYS: races and laps go with
// them): races (each time on track), laps, the days they drove, and per circuit (most raced first) the races, the laps,
// the checked best per car and its pace: that best over the car's driving line (pisos.js; 0.964: 3.6% quicker than the
// line). ritmo: the pilot's best pace on any circuit, and where.
const NOT_DRIVEN=Object.freeze({corridas:0,voltas:0,conferidas:0,dias:0,pistas:[],ritmo:null});
async function pilots(env){
 const [races,laps,bests,days]=await Promise.all([
  rows(env.DB.prepare('SELECT usuario_id AS u,circuito AS c,COUNT(*) AS n FROM corridas GROUP BY u,c')),
  rows(env.DB.prepare("SELECT usuario_id AS u,circuito AS c,COUNT(*) AS n,SUM(resultado IN ('recorde','conferida')) AS ok FROM voltas GROUP BY u,c")),
  rows(env.DB.prepare("SELECT usuario_id AS u,circuito AS c,carro AS k,MIN(volta_ms) AS ms FROM recordes WHERE selo='conferido' GROUP BY u,c,k")),
  // Days in Brasília's clock (UTC-3), on track or with a lap.
  rows(env.DB.prepare('SELECT u,COUNT(DISTINCT d) AS n FROM (SELECT usuario_id AS u,(quando-10800000)/86400000 AS d FROM corridas UNION SELECT usuario_id,(quando-10800000)/86400000 FROM voltas) GROUP BY u'))]);
 const out=new Map(),pilot=u=>{if(!out.has(u))out.set(u,{corridas:0,voltas:0,conferidas:0,dias:0,pistas:new Map(),ritmo:null});return out.get(u);};
 const track=(u,c)=>{const p=pilot(u).pistas;if(!p.has(c))p.set(c,{circuito:c,corridas:0,voltas:0,melhor:{}});return p.get(c);};
 for(const r of races){pilot(r.u).corridas+=r.n;track(r.u,r.c).corridas=r.n;}
 for(const r of laps){const p=pilot(r.u);p.voltas+=r.n;p.conferidas+=r.ok??0;track(r.u,r.c).voltas=r.n;}
 for(const r of bests){
  const line=LINE_TIMES[r.k]?.[r.c],pace=line?Math.round(r.ms/line)/1000:null,p=pilot(r.u);
  track(r.u,r.c).melhor[r.k]={ms:r.ms,ritmo:pace};
  if(pace!==null&&(p.ritmo===null||pace<p.ritmo.valor))p.ritmo={valor:pace,circuito:r.c,carro:r.k};
 }
 for(const r of days)pilot(r.u).dias=r.n;
 for(const p of out.values())p.pistas=[...p.pistas.values()].sort((a,b)=>b.corridas-a.corridas||b.voltas-a.voltas);
 return out;
}

// What happened, newest first, 100 at a time (antes: the oldest id already shown), of one kind or all.
const KINDS=new Set(['conta_criada','entrou','saiu','apelido','importou','conferida','recusada','removido','revisao_pedida','revisao','conta_apagada']);
async function events(request,env,url){
 const {refused}=await admin(request,env);if(refused)return refused;
 const kind=url.searchParams.get('tipo'),before=Number(url.searchParams.get('antes'));
 const list=await rows(env.DB.prepare(`SELECT e.id,e.quando,e.tipo,e.detalhe,u.apelido FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
  WHERE (?1 IS NULL OR e.tipo=?1) AND (?2 IS NULL OR e.id<?2) ORDER BY e.id DESC LIMIT 100`)
  .bind(KINDS.has(kind)?kind:null,Number.isSafeInteger(before)&&before>0?before:null));
 const detail=text=>{try{return text?JSON.parse(text):null;}catch{return null;}};
 return json({eventos:list.map(e=>({...e,detalhe:detail(e.detalhe)}))});
}

const parsed=text=>{try{return text?JSON.parse(text):null;}catch{return null;}};
// The records that came in last, with the signals of the lap that set each.
async function lastRecords(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const list=await rows(env.DB.prepare('SELECT r.id,r.circuito,r.modo,r.carro,r.selo,r.volta_ms,r.versao,r.enviado_em,r.sinais,u.apelido FROM recordes r JOIN usuarios u ON u.id=r.usuario_id ORDER BY r.enviado_em DESC LIMIT 50'));
 return json({recordes:list.map(r=>({...r,sinais:parsed(r.sinais)}))});
}

// The laps that came in, newest first, 100 at a time (antes: the oldest id already shown); only the flagged ones with
// sinalizadas=1. Their brake points stay out (they are for comparing laps, not for reading).
async function laps(request,env,url){
 const {refused}=await admin(request,env);if(refused)return refused;
 const before=Number(url.searchParams.get('antes')),flagged=url.searchParams.get('sinalizadas')==='1';
 const list=await rows(env.DB.prepare(`SELECT v.id,v.quando,v.circuito,v.modo,v.tempo_ms,v.resultado,v.aparelho,v.sinais,u.apelido FROM voltas v LEFT JOIN usuarios u ON u.id=v.usuario_id
  WHERE (?1 IS NULL OR v.id<?1) AND (?2=0 OR v.sinais LIKE '%"sinais":["%') ORDER BY v.id DESC LIMIT 100`).bind(Number.isSafeInteger(before)&&before>0?before:null,flagged?1:0));
 return json({voltas:list.map(v=>({...v,sinais:parsed(v.sinais)}))});
}

// A record off the boards (POST {recorde: its id}): gone for good, and its pilot's events say which and when.
async function removeRecord(request,env,body){
 const {refused}=await admin(request,env);if(refused)return refused;
 const id=body.recorde;if(!Number.isSafeInteger(id)||id<1)return json({erro:'Recorde inválido.'},400);
 const r=await env.DB.prepare('SELECT usuario_id,circuito,modo,selo,volta_ms FROM recordes WHERE id=?').bind(id).first();
 if(!r)return json({erro:'Esse recorde não existe mais.'},404);
 await env.DB.batch([env.DB.prepare('DELETE FROM recordes WHERE id=?').bind(id),event(env,'removido',r.usuario_id,{circuito:r.circuito,modo:r.modo,selo:r.selo,volta_ms:r.volta_ms})]);
 return json({removido:true});
}

// A pilot's nickname given by the admin (POST {usuario: the account's id, apelido}): the rules and the uniqueness as
// ever, but a reserved name may be given (the real Stevan's "Stevan"). The pilot's events say the admin gave it.
async function giveNickname(request,env,body){
 const {refused}=await admin(request,env);if(refused)return refused;
 const id=body.usuario;if(!Number.isSafeInteger(id)||id<1)return json({erro:'Conta inválida.'},400);
 const nick=cleanNickname(body.apelido);if(!nick)return json({erro:NICKNAME_RULE},400);
 const key=nicknameKey(nick);
 if(!await env.DB.prepare('SELECT 1 FROM usuarios WHERE id=?').bind(id).first())return json({erro:'Essa conta não existe.'},404);
 if(await env.DB.prepare('SELECT 1 FROM usuarios WHERE apelido_chave=? AND id<>?').bind(key,id).first())return json({erro:'Esse apelido já é de outro piloto.'},409);
 try{await env.DB.batch([env.DB.prepare('UPDATE usuarios SET apelido=?,apelido_chave=? WHERE id=?').bind(nick,key,id),event(env,'apelido',id,{apelido:nick,pela_administracao:true})]);}
 catch(error){if(/UNIQUE/i.test(String(error?.message)))return json({erro:'Esse apelido já é de outro piloto.'},409);throw error;}
 return json({usuario:{id,apelido:nick}});
}

// The reviews pilots asked for: those waiting first, oldest first, then the last decided.
async function reviews(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const list=await rows(env.DB.prepare(`SELECT v.id,v.quando,v.circuito,v.modo,v.carro,v.tempo_ms,v.resultado,v.aparelho,v.sinais,v.revisao,v.revisado_em,u.apelido
  FROM voltas v LEFT JOIN usuarios u ON u.id=v.usuario_id WHERE v.revisao IS NOT NULL ORDER BY v.revisao<>'pedida',v.quando LIMIT 100`));
 return json({revisoes:list.map(v=>({...v,sinais:parsed(v.sinais)}))});
}
// A review decided (POST {volta, aprovar: true or false}). Approved, the lap is written as the pilot's checked record
// when it beats their best, its signals saying it was reviewed and why it had been refused.
async function decideReview(request,env,body){
 const {refused}=await admin(request,env);if(refused)return refused;
 const id=body.volta,ok=body.aprovar;if(!Number.isSafeInteger(id)||id<1||typeof ok!=='boolean')return json({erro:'Revisão inválida.'},400);
 const v=await env.DB.prepare("SELECT usuario_id,quando,circuito,modo,carro,versao,tempo_ms,resultado,aparelho,sinais,fantasma FROM voltas WHERE id=? AND revisao='pedida'").bind(id).first();
 if(!v)return json({erro:'Essa revisão não está esperando.'},404);
 const now=Date.now(),car=v.carro??'opala';
 const steps=[env.DB.prepare('UPDATE voltas SET revisao=?,revisado_em=? WHERE id=?').bind(ok?'aprovada':'recusada',now,id),
  event(env,'revisao',v.usuario_id,{circuito:v.circuito,carro:car,volta_ms:v.tempo_ms,aprovada:ok})];
 if(ok)steps.unshift(env.DB.prepare(UPSERT).bind(v.usuario_id,v.circuito,v.modo,car,'conferido',v.tempo_ms,v.versao??'revisada',v.quando,now,v.fantasma,
  JSON.stringify({aparelho:v.aparelho,...parsed(v.sinais),revisada:true,motivo:v.resultado})));
 await env.DB.batch(steps);
 return json({revisao:ok?'aprovada':'recusada'});
}

// The cases: laps of trusted pilots (base.js isTrusted) the checks would have refused, newest first, with why.
async function cases(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const list=await rows(env.DB.prepare(`SELECT v.id,v.quando,v.circuito,v.modo,v.carro,v.versao,v.tempo_ms,v.caso,v.aparelho,v.sinais,u.apelido FROM voltas v LEFT JOIN usuarios u ON u.id=v.usuario_id
  WHERE v.caso IS NOT NULL ORDER BY v.id DESC LIMIT 100`));
 return json({casos:list.map(v=>({...v,sinais:parsed(v.sinais)}))});
}
// One case whole, as a file (?volta=id): the lap, why the checks would have refused it, its ghost and its controls.
async function caseFile(request,env,url){
 const {refused}=await admin(request,env);if(refused)return refused;
 const id=Number(url.searchParams.get('volta'));if(!Number.isSafeInteger(id)||id<1)return json({erro:'Caso inválido.'},400);
 const v=await env.DB.prepare('SELECT id,quando,circuito,modo,carro,versao,tempo_ms,caso,aparelho,sinais,freios,fantasma,comandos FROM voltas WHERE id=? AND caso IS NOT NULL').bind(id).first();
 if(!v)return json({erro:'Esse caso não existe.'},404);
 return json({...v,quando:new Date(v.quando).toISOString(),sinais:parsed(v.sinais),freios:parsed(v.freios),fantasma:parsed(v.fantasma),comandos:parsed(v.comandos)},200,
  {headers:{'Content-Disposition':`attachment; filename="caso-${v.id}-${v.circuito}.json"`}});
}

export const ADMIN_GETS={'/api/admin/resumo':summary,'/api/admin/usuarios':users,'/api/admin/eventos':events,'/api/admin/recordes':lastRecords,'/api/admin/voltas':laps,'/api/admin/revisoes':reviews,'/api/admin/casos':cases,'/api/admin/caso':caseFile};
export const ADMIN_POSTS={'/api/admin/remover':removeRecord,'/api/admin/revisar':decideReview,'/api/admin/apelido':giveNickname};
