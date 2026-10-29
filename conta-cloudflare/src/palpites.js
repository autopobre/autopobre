// Palpites do Opala 99: free guesses, signed in with Google, of where the real Opala 99 finishes a race weekend's
// qualifying and two races, for the podium (the page: pista_interlagos/teste/palpites.html; the weekend: a row of
// boloes, migration 0010). One guess an account, final once sent (deleting the account does not make room for a second:
// migration 0012), before the guesses close (qualifying starts). A pilot
// needs a nickname (the podium shows it) and an e-mail Google confirmed (email.js: how the podium is told).
// After the last race the admin sets the official result; the server works out the podium, whatever the page says:
// the first to guess all three takes 1st place; of the rest, the first with two or more 2nd; then the first with one or
// more 3rd. A tie goes to who guessed first. Nobody takes two places, and a guess the admin took out never does.
// Beside the guess, an optional consent (ofertas): the sponsors' offers by e-mail, given and taken back on the page.
import {json,signedIn,notSignedIn,runsGuesses} from './base.js';
import {event,recent,HOUR} from './eventos.js';
import {emailReady,openEmail,maskEmail,accountMark} from './email.js';

// The Old Stock field: positions 1..GRID, and 0 for no valid time (qualifying) or did not finish (a race).
export const GRID=13;
export const STAGES=Object.freeze(['treino','corrida1','corrida2']);
// The hits each place on the podium needs, 1st place first.
export const PLACES=Object.freeze([3,2,1]);
const position=v=>Number.isInteger(v)&&v>=0&&v<=GRID?v:null;
// The three positions of a body, or null when one is missing or out of range.
export function positions(body){
 const out={};
 for(const stage of STAGES){const p=position(body?.[stage]);if(p===null)return null;out[stage]=p;}
 return out;
}
export const hits=(guess,result)=>STAGES.reduce((n,stage)=>n+(guess[stage]===result[stage]),0);
// The podium of a list in the order guessed (quando, then id).
export function podium(list,result){
 const out=[],won=new Set();
 PLACES.forEach((need,i)=>{
  const w=list.find(p=>!p.desclassificado&&!won.has(p.id)&&hits(p,result)>=need);
  if(w){won.add(w.id);out.push({lugar:i+1,palpite:w,acertos:hits(w,result)});}
 });
 return out;
}
// How many guessed each position, per stage (index = position; shown once the guesses close).
function tally(list){
 const out=Object.fromEntries(STAGES.map(stage=>[stage,Array(GRID+1).fill(0)]));
 for(const p of list)if(!p.desclassificado)for(const stage of STAGES)out[stage][p[stage]]++;
 return out;
}
const parsed=text=>{try{return text?JSON.parse(text):null;}catch{return null;}};
const iso=ms=>new Date(ms).toISOString();
// The weekend open now, or the last one.
const current=env=>env.DB.prepare('SELECT id,titulo,fecha_em,resultado,resultado_em FROM boloes ORDER BY criado_em DESC LIMIT 1').first();
const guesses=async(env,bolao)=>(await env.DB.prepare(`SELECT p.id,p.usuario_id,p.quando,p.treino,p.corrida1,p.corrida2,p.desclassificado,u.apelido
 FROM palpites p JOIN usuarios u ON u.id=p.usuario_id WHERE p.bolao=? ORDER BY p.quando,p.id`).bind(bolao).all()).results;
const emailOf=async(env,usuario)=>openEmail(env,await env.DB.prepare('SELECT email FROM usuarios WHERE id=?').bind(usuario).first('email'));
const OFFERS_CHANGES=20;   // per account and hour: each one is a write

// An account deleted with a guess on a weekend still open (index.js deleteAccount, before the guess goes): the mark of its
// Google account (migration 0012), so that account cannot come back and guess again before the close.
export async function deletedGuess(env,s){
 if(!emailReady(env))return [];
 return [env.DB.prepare('INSERT OR IGNORE INTO palpites_apagados (bolao,conta) SELECT p.bolao,? FROM palpites p JOIN boloes b ON b.id=p.bolao WHERE p.usuario_id=? AND b.fecha_em>?')
  .bind(await accountMark(env,s.google_sub),s.id,Date.now())];
}
// The marks of the weekends already closed, which nobody can guess on any more (run on each sign-in, beside eventos.js forgetOld).
export const forgetDeletedGuesses=env=>env.DB.prepare('DELETE FROM palpites_apagados WHERE bolao IN (SELECT id FROM boloes WHERE fecha_em<=?)').bind(Date.now());

// The page's state: the weekend, how many guessed, and for a signed-in pilot their nickname, their masked e-mail and
// their guess (with its place in line). Once closed, how the guesses spread; with the result, the podium by nickname.
async function overview(request,env){
 const b=await current(env);
 if(!b)return json({bolao:null});
 const s=await signedIn(request,env),now=Date.now(),open=now<b.fecha_em,result=parsed(b.resultado);
 const list=open?null:await guesses(env,b.id);
 const out={bolao:{id:b.id,titulo:b.titulo,fecha_em:iso(b.fecha_em),aberto:open,pronto:emailReady(env),resultado:open?null:result},agora:iso(now),
  total:list?list.filter(p=>!p.desclassificado).length:await env.DB.prepare('SELECT COUNT(*) AS n FROM palpites WHERE bolao=? AND desclassificado=0').bind(b.id).first('n')};
 if(s){
  const offers=await env.DB.prepare('SELECT ofertas_em FROM usuarios WHERE id=?').bind(s.id).first('ofertas_em');
  out.conta={apelido:s.apelido??null,email:maskEmail(await emailOf(env,s.id)),ofertas:!!offers};
  const mine=await env.DB.prepare('SELECT id,quando,treino,corrida1,corrida2,desclassificado FROM palpites WHERE bolao=? AND usuario_id=?').bind(b.id,s.id).first();
  if(mine){
   const ordem=await env.DB.prepare('SELECT COUNT(*) AS n FROM palpites WHERE bolao=?1 AND (quando<?2 OR quando=?2 AND id<=?3)').bind(b.id,mine.quando,mine.id).first('n');
   out.palpite={treino:mine.treino,corrida1:mine.corrida1,corrida2:mine.corrida2,quando:iso(mine.quando),ordem,...(mine.desclassificado&&{desclassificado:true})};
  }
 }
 if(list){
  out.galera=tally(list);
  if(out.bolao.resultado){
   const won=podium(list,result);
   out.podio=won.map(w=>({lugar:w.lugar,apelido:w.palpite.apelido??'(sem apelido)',acertos:w.acertos}));
   if(out.palpite){out.palpite.acertos=hits(out.palpite,result);const me=won.find(w=>w.palpite.usuario_id===s.id);if(me)out.palpite.lugar=me.lugar;}
  }
 }
 return json(out);
}

// A guess (POST {treino, corrida1, corrida2, ofertas}): once, before the close, with a nickname and a confirmed e-mail.
// ofertas true: the pilot ticked the sponsors' offers (left alone when false: one given before stays until undone).
async function guess(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 const b=await current(env);
 if(!b||!emailReady(env))return json({erro:'Os palpites ainda não abriram.'},503);
 if(Date.now()>=b.fecha_em)return json({erro:'Os palpites já fecharam.'},403);
 const p=positions(body);if(!p)return json({erro:'Escolha uma posição para o treino e para cada corrida.'},400);
 if(await env.DB.prepare('SELECT 1 FROM palpites_apagados WHERE bolao=? AND conta=?').bind(b.id,await accountMark(env,s.google_sub)).first())
  return json({erro:'Esta conta Google já palpitou neste fim de semana: o palpite saiu com a conta apagada e não volta.'},409);
 if(!s.apelido)return json({erro:'Escolha seu apelido antes de palpitar.',falta:'apelido'},409);
 if(!await emailOf(env,s.id))return json({erro:'Confirme seu e-mail com o Google: é por ele que avisamos quem ganhar.',falta:'email'},409);
 const r=await env.DB.prepare('INSERT INTO palpites (bolao,usuario_id,quando,treino,corrida1,corrida2) VALUES (?,?,?,?,?,?) ON CONFLICT(bolao,usuario_id) DO NOTHING')
  .bind(b.id,s.id,Date.now(),p.treino,p.corrida1,p.corrida2).run();
 if(!r.meta?.changes)return json({erro:'Você já palpitou. O palpite é definitivo.'},409);
 await env.DB.batch([event(env,'palpite',s.id,{bolao:b.id,...p}),
  ...(body.ofertas===true?[env.DB.prepare('UPDATE usuarios SET ofertas_em=COALESCE(ofertas_em,?) WHERE id=?').bind(Date.now(),s.id),event(env,'ofertas',s.id,{aceito:true})]:[])]);
 return overview(request,env);
}

// The sponsors' offers, given or taken back (POST {aceito: true or false}), any time, guess or not.
async function offers(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(typeof body.aceito!=='boolean')return json({erro:'Escolha sim ou não.'},400);
 const now=await env.DB.prepare('SELECT ofertas_em FROM usuarios WHERE id=?').bind(s.id).first('ofertas_em');
 if(!!now!==body.aceito){
  if(await recent(env,s.id,['ofertas'],HOUR)>=OFFERS_CHANGES)return json({erro:'Muitas trocas seguidas. Tente de novo daqui a uma hora.'},429);
  await env.DB.batch([env.DB.prepare('UPDATE usuarios SET ofertas_em=? WHERE id=?').bind(body.aceito?Date.now():null,s.id),event(env,'ofertas',s.id,{aceito:body.aceito})]);
 }
 return json({ofertas:body.aceito});
}

// The palpites' panel (painel-palpites.html): for who runs them (base.js runsGuesses: an administrator, or the database's
// mark), checked on every request whatever the page says.
async function admin(request,env){
 const s=await signedIn(request,env);
 if(!s)return {refused:notSignedIn()};
 if(!runsGuesses(env,s))return {refused:json({erro:'Acesso só para quem cuida dos palpites.'},403)};
 return {s};
}
// The panel's view: the weekend, every guess in line with who sent it (nickname and whole e-mail: the owner's call, to
// see who took part; when its account was made: several made on the spot one after another may be one person), the hits
// once there is a result, and the podium.
async function adminView(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const b=await current(env);
 if(!b)return json({bolao:null});
 const list=await guesses(env,b.id),result=parsed(b.resultado);
 const accounts=(await env.DB.prepare('SELECT u.id,u.email,u.ofertas_em,u.criado_em FROM usuarios u JOIN palpites p ON p.usuario_id=u.id WHERE p.bolao=?').bind(b.id).all()).results;
 const sealed=new Map(accounts.map(u=>[u.id,u.email])),offered=new Set(accounts.filter(u=>u.ofertas_em).map(u=>u.id)),made=new Map(accounts.map(u=>[u.id,u.criado_em]));
 const email=usuario=>openEmail(env,sealed.get(usuario));
 return json({
  bolao:{id:b.id,titulo:b.titulo,fecha_em:iso(b.fecha_em),aberto:Date.now()<b.fecha_em,resultado:result,resultado_em:b.resultado_em?iso(b.resultado_em):null},pronto:emailReady(env),
  ofertas:await env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE ofertas_em IS NOT NULL AND email IS NOT NULL').first('n'),
  podio:result?await Promise.all(podium(list,result).map(async w=>({lugar:w.lugar,acertos:w.acertos,palpite:w.palpite.id,apelido:w.palpite.apelido,quando:iso(w.palpite.quando),email:await email(w.palpite.usuario_id)}))):[],
  palpites:await Promise.all(list.map(async(p,i)=>({id:p.id,ordem:i+1,apelido:p.apelido,email:await email(p.usuario_id),quando:iso(p.quando),conta_em:iso(made.get(p.usuario_id)),
   treino:p.treino,corrida1:p.corrida1,corrida2:p.corrida2,desclassificado:!!p.desclassificado,ofertas:offered.has(p.usuario_id),...(result&&{acertos:hits(p,result)})}))),
  galera:tally(list),
 });
}
// The weekend changed (POST {fecha_em: an ISO time, resultado: {treino, corrida1, corrida2} or null}): the closing time
// if the schedule moves (only while the guesses are open: once closed they never open again, or a guess could come from
// who saw the qualifying), the official result after the last race (only once the guesses have closed).
async function setContest(request,env,body){
 const {s,refused}=await admin(request,env);if(refused)return refused;
 const b=await current(env);if(!b)return json({erro:'Nenhum fim de semana de palpites.'},404);
 const sets=[],values=[],detail={};let closes=b.fecha_em;
 if('fecha_em' in body){
  if(Date.now()>=b.fecha_em)return json({erro:'Os palpites já fecharam: o horário de fechamento não muda mais.'},409);
  const ms=typeof body.fecha_em==='string'?Date.parse(body.fecha_em):NaN;
  if(!Number.isFinite(ms))return json({erro:'Data de fechamento inválida.'},400);
  sets.push('fecha_em=?');values.push(ms);detail.fecha_em=iso(ms);closes=ms;
 }
 if('resultado' in body){
  if(body.resultado===null){sets.push('resultado=NULL','resultado_em=NULL');detail.resultado=null;}
  else{
   const r=positions(body.resultado);if(!r)return json({erro:'Resultado inválido.'},400);
   if(Date.now()<closes)return json({erro:'Os palpites ainda estão abertos: o resultado só depois que fecharem.'},409);
   sets.push('resultado=?','resultado_em=?');values.push(JSON.stringify(r),Date.now());detail.resultado=r;
  }
 }
 if(!sets.length)return json({erro:'Nada para mudar.'},400);
 await env.DB.batch([env.DB.prepare(`UPDATE boloes SET ${sets.join(',')} WHERE id=?`).bind(...values,b.id),event(env,'bolao',s.id,{bolao:b.id,...detail})]);
 return adminView(request,env);
}
// A guess taken out, or put back (POST {palpite: its id, desclassificar: true or false}); its pilot's events say so, and by
// whom (two people run the palpites).
async function disqualify(request,env,body){
 const {s,refused}=await admin(request,env);if(refused)return refused;
 const id=body.palpite,out=body.desclassificar;
 if(!Number.isSafeInteger(id)||id<1||typeof out!=='boolean')return json({erro:'Palpite inválido.'},400);
 const p=await env.DB.prepare('SELECT usuario_id,bolao FROM palpites WHERE id=?').bind(id).first();
 if(!p)return json({erro:'Esse palpite não existe.'},404);
 await env.DB.batch([env.DB.prepare('UPDATE palpites SET desclassificado=? WHERE id=?').bind(out?1:0,id),event(env,'desclassificado',p.usuario_id,{bolao:p.bolao,desclassificado:out,por:s.apelido??`conta ${s.id}`})]);
 return adminView(request,env);
}

// Who accepted the sponsors' offers, as a file for the admin (CSV: nickname, e-mail, since when): only those who ticked it
// and whose e-mail this Worker can open.
async function offersList(request,env){
 const {refused}=await admin(request,env);if(refused)return refused;
 const list=(await env.DB.prepare('SELECT apelido,email,ofertas_em FROM usuarios WHERE ofertas_em IS NOT NULL AND email IS NOT NULL ORDER BY ofertas_em').all()).results;
 // A cell a spreadsheet would take for a formula (=, +, -, @, a tab or a return first) goes in as text, after a quote.
 const cell=v=>{const text=String(v??'');return `"${(/^[=+\-@\t\r]/.test(text)?"'"+text:text).replace(/"/g,'""')}"`;};
 const lines=['apelido,email,aceitou_em'];
 for(const u of list){const email=await openEmail(env,u.email);if(email)lines.push([u.apelido,email,iso(u.ofertas_em)].map(cell).join(','));}
 return new Response(lines.join('\r\n')+'\r\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ofertas-patrocinadores.csv"',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}

export const PALPITES_GETS={'/api/palpites':overview,'/api/admin/palpites':adminView,'/api/admin/ofertas':offersList};
export const PALPITES_POSTS={'/api/palpites':guess,'/api/palpites/ofertas':offers,'/api/admin/bolao':setContest,'/api/admin/palpite':disqualify};
