// The admin panel's data (the page: pista_interlagos/teste/admin.html, in the dev build only). Read only, for an
// administrator (base.js isAdmin: the Worker's ADMINS secret, or the database's mark): the server checks it on
// every request, whatever the page says. It shows the nicknames, the dates, the counts and the events; never the
// Google account's id.
import {json,signedIn,notSignedIn,isAdmin} from './base.js';
import {EVENT_DAYS} from './eventos.js';

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
  (SELECT COUNT(*) FROM eventos WHERE tipo='recusada' AND quando>?1) AS recusadas_7d`).bind(week,day,now).first();
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
  (SELECT COUNT(*) FROM eventos e WHERE e.usuario_id=u.id AND e.tipo='recusada' AND e.quando>?2) AS recusadas_7d
  FROM usuarios u ORDER BY u.ultimo_login DESC LIMIT 500`).bind(now,now-7*DAY));
 const listed=new Set(String(env.ADMINS??'').split(',').map(x=>x.trim()).filter(Boolean));
 const subs=new Map((await rows(env.DB.prepare('SELECT id,google_sub FROM usuarios'))).map(u=>[u.id,u.google_sub]));
 return json({usuarios:list.map(u=>({...u,admin:!!u.admin||listed.has(subs.get(u.id))}))});
}

// What happened, newest first, 100 at a time (antes: the oldest id already shown), of one kind or all.
const KINDS=new Set(['conta_criada','entrou','saiu','apelido','importou','conferida','recusada','conta_apagada']);
async function events(request,env,url){
 const {refused}=await admin(request,env);if(refused)return refused;
 const kind=url.searchParams.get('tipo'),before=Number(url.searchParams.get('antes'));
 const list=await rows(env.DB.prepare(`SELECT e.id,e.quando,e.tipo,e.detalhe,u.apelido FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
  WHERE (?1 IS NULL OR e.tipo=?1) AND (?2 IS NULL OR e.id<?2) ORDER BY e.id DESC LIMIT 100`)
  .bind(KINDS.has(kind)?kind:null,Number.isSafeInteger(before)&&before>0?before:null));
 const detail=text=>{try{return text?JSON.parse(text):null;}catch{return null;}};
 return json({eventos:list.map(e=>({...e,detalhe:detail(e.detalhe)}))});
}

// The records that came in last.
async function lastRecords(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 return json({recordes:await rows(env.DB.prepare('SELECT r.circuito,r.modo,r.carro,r.selo,r.volta_ms,r.versao,r.enviado_em,u.apelido FROM recordes r JOIN usuarios u ON u.id=r.usuario_id ORDER BY r.enviado_em DESC LIMIT 50'))});
}

export const ADMIN_GETS={'/api/admin/resumo':summary,'/api/admin/usuarios':users,'/api/admin/eventos':events,'/api/admin/recordes':lastRecords};
