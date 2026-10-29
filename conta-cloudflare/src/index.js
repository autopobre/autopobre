// Accounts for Auto-Pobre Racing: sign in with Google, so the records say who drove them (recordes.js),
// and the multiplayer rooms who races in them (sala.js).
// The Worker answers <site>/api/* on the game's own origin (the pages stay on GitHub Pages), so the
// session is a plain first-party cookie and the game needs no CORS.
//
// What it keeps, and nothing else (LGPD: the least that makes an account): the Google account's
// subject id (`sub`: the game's scope is openid alone, so no name, picture or e-mail arrives), the public
// nickname the player picks, when the account was made and last signed in, its sessions, its online records,
// what it did (eventos.js, 90 days, for the admin panel) and how much it raced (recordes.js: the totals, kept as long as
// the account). A pilot who joins the palpites (palpites.js) signs in from that page with the scope email too: their
// verified e-mail is kept sealed (email.js), to tell the podium.
// Each account can download all of it (/meus-dados) and delete it for good (/apagar).
//
// Sign-in is the authorization code flow, run here (the page loads no Google script): state, nonce and
// the PKCE verifier travel in a short-lived encrypted cookie, so nothing is written before Google has
// answered; the code is exchanged with the client secret, and the ID token's issuer, audience, expiry
// and nonce are checked (it comes straight from Google's token endpoint over TLS, which OpenID Connect
// Core 3.1.3.7 accepts in place of its signature). A session is a random value in a __Host- cookie
// (HttpOnly, Secure, SameSite=Lax); the database holds only its SHA-256. Every write needs the exact
// Origin and a JSON body: dev and the main link are the same site to a browser, so SameSite alone
// would let a page of one post to the other.
import {SESSION_COOKIE,LOGIN_COOKIE,b64url,fromB64url,random,sha256,hashed,sameText,readCookies,setCookie,json,redirect,seal,unseal,session,signedOut,signedIn,notSignedIn,readPost,isAdmin,runsGuesses,siteOf} from './base.js';
import {RECORDS_GETS,RECORDS_POSTS,RECORDS_BODY} from './recordes.js';
import {ADMIN_GETS,ADMIN_POSTS} from './admin.js';
import {ROOM_POSTS} from './sala.js';
import {event,forgetOld,recent,HOUR} from './eventos.js';
import {cleanNickname,nicknameKey,RESERVED,NICKNAME_RULE} from './apelidos.js';
import {PALPITES_GETS,PALPITES_POSTS} from './palpites.js';
import {emailReady,verifiedEmail,sealEmail,openEmail} from './email.js';

const SESSION_DAYS=30;        // a session's life; signing in again makes a new one
const MAX_SESSIONS=10;        // per account (browsers, phones): the oldest go first
const LOGIN_MINUTES=10;       // to come back from Google
const NICKNAME_CHANGES=10;    // per account and hour: each one is a write
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth',GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const ISSUERS=new Set(['https://accounts.google.com','accounts.google.com']);
const SUB=/^[\x21-\x7e]{1,255}$/;
// The nickname's rules: apelidos.js (the admin panel gives names too).
export {cleanNickname,nicknameKey} from './apelidos.js';
// Where to land after Google: a path on this site, never another site ("//host" or a backslash).
export const safeReturn=value=>typeof value==='string'&&value.length<=512&&/^\/(?![/\\])[^\s\\]*$/.test(value)?value:'/';

// Google's addresses. Only a local test (an http://127.0.0.1 origin) may point them at a stand-in.
function google(env,which){
 const local=String(env.ORIGEM).startsWith('http://127.0.0.1:');
 return which==='auth'?(local&&env.GOOGLE_AUTH_URL)||GOOGLE_AUTH:(local&&env.GOOGLE_TOKEN_URL)||GOOGLE_TOKEN;
}
const redirectUri=env=>env.ORIGEM+'/api/conta/google';

// The account as its own page sees it (admin: the panel's link shows; palpites: the palpites' panel's link).
const account=(row,env)=>({apelido:row.apelido??null,desde:new Date(row.criado_em).toISOString(),...(isAdmin(env,row)&&{admin:true}),...(runsGuesses(env,row)&&{palpites:true})});

// The account signed in on this site.
async function me(request,env){
 const s=await session(request,env);
 if(!s||s.gone)return json({conta:null},200,{cookies:s?.gone?[signedOut()]:[]});
 return json({conta:account(s,env)});
}

// ?email=1: the palpites page, which needs the e-mail (only with EMAIL_KEY set: without it, none could be kept).
async function signIn(request,env,url){
 const state=b64url(random(32)),nonce=b64url(random(32)),verifier=b64url(random(32));
 const scope=url.searchParams.get('email')==='1'&&emailReady(env)?'openid email':'openid';
 const pending=await seal(env,'cookie-login-v1',{e:state,n:nonce,v:verifier,r:safeReturn(url.searchParams.get('volta')),t:Date.now()});
 const auth=new URL(google(env,'auth'));
 auth.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri(env),response_type:'code',scope,
  state,nonce,code_challenge:b64url(await sha256(verifier)),code_challenge_method:'S256',prompt:'select_account'}).toString();
 return redirect(auth.href,[setCookie(LOGIN_COOKIE,pending,LOGIN_MINUTES*60)]);
}

// The ID token's claims after the code exchange, or null when anything is off.
async function exchange(env,code,verifier){
 const r=await fetch(google(env,'token'),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
  code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri(env),grant_type:'authorization_code',code_verifier:verifier})});
 if(!r.ok)return null;
 const token=(await r.json().catch(()=>null))?.id_token;
 if(typeof token!=='string')return null;
 let claims;try{claims=JSON.parse(new TextDecoder().decode(fromB64url(token.split('.')[1]??'')));}catch{return null;}
 const id=env.GOOGLE_CLIENT_ID,aud=claims?.aud;
 const ours=aud===id||Array.isArray(aud)&&aud.includes(id)&&claims.azp===id;
 if(!ours||!ISSUERS.has(claims.iss)||!(claims.exp>Date.now()/1000-60)||typeof claims.sub!=='string'||!SUB.test(claims.sub))return null;
 return claims;
}

async function googleBack(request,env,url){
 const cookies=readCookies(request),pending=await unseal(env,'cookie-login-v1',cookies[LOGIN_COOKIE]??'');
 const clear=setCookie(LOGIN_COOKIE,'',0),back=env.ORIGEM+safeReturn(pending?.r);
 // Cancelled, expired, or not this browser's sign-in: back to the game, which asks /eu and tells the player.
 const code=url.searchParams.get('code');
 if(!pending||Date.now()-pending.t>LOGIN_MINUTES*60000||url.searchParams.has('error')||!code||!sameText(url.searchParams.get('state'),pending.e))return redirect(back,[clear]);
 const claims=await exchange(env,code,pending.v);
 if(!claims||!sameText(claims.nonce,pending.n))return redirect(back,[clear]);
 const now=Date.now();
 const user=await env.DB.prepare('INSERT INTO usuarios (google_sub,criado_em,ultimo_login) VALUES (?1,?2,?2) ON CONFLICT(google_sub) DO UPDATE SET ultimo_login=?2 RETURNING id,criado_em').bind(claims.sub,now).first();
 const value=b64url(random(32)),steps=[
  event(env,user.criado_em===now?'conta_criada':'entrou',user.id,{site:siteOf(env)}),...forgetOld(env),
  env.DB.prepare('INSERT INTO sessoes (id,usuario_id,criada_em,expira_em,site) VALUES (?,?,?,?,?)').bind(await hashed(value),user.id,now,now+SESSION_DAYS*86400000,siteOf(env)),
  env.DB.prepare('DELETE FROM sessoes WHERE expira_em<=?').bind(now),
  env.DB.prepare('DELETE FROM sessoes WHERE usuario_id=?1 AND id NOT IN (SELECT id FROM sessoes WHERE usuario_id=?1 ORDER BY criada_em DESC LIMIT ?2)').bind(user.id,MAX_SESSIONS)];
 // The e-mail, when the palpites asked for it and Google confirmed it (a sign-in without it keeps the one there).
 const email=emailReady(env)&&verifiedEmail(claims);
 if(email)steps.push(env.DB.prepare('UPDATE usuarios SET email=?,email_em=? WHERE id=?').bind(await sealEmail(env,email),now,user.id));
 // A session this browser had before (another account, or the same) ends here: one per browser.
 if(cookies[SESSION_COOKIE])steps.push(env.DB.prepare('DELETE FROM sessoes WHERE id=?').bind(await hashed(cookies[SESSION_COOKIE])));
 await env.DB.batch(steps);
 return redirect(back,[clear,setCookie(SESSION_COOKIE,value,SESSION_DAYS*86400)]);
}

async function setNickname(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 const nick=cleanNickname(body.apelido);if(!nick)return json({erro:NICKNAME_RULE},400);
 const key=nicknameKey(nick),taken=()=>json({erro:'Esse apelido já é de outro piloto.'},409);
 // A reserved name only for whoever the admin gave it to (its case or accents changed, it is still theirs).
 if(RESERVED.has(key)&&!(s.apelido&&nicknameKey(s.apelido)===key))return json({erro:'Esse apelido é reservado. Escolha outro.'},409);
 if(nick===s.apelido)return json({conta:account(s,env)});   // the same again: nothing to write
 if(await recent(env,s.id,['apelido'],HOUR)>=NICKNAME_CHANGES)return json({erro:'Muitas trocas de apelido seguidas. Tente de novo daqui a uma hora.'},429);
 if(await env.DB.prepare('SELECT id FROM usuarios WHERE apelido_chave=? AND id<>?').bind(key,s.id).first())return taken();
 try{await env.DB.batch([env.DB.prepare('UPDATE usuarios SET apelido=?,apelido_chave=? WHERE id=?').bind(nick,key,s.id),event(env,'apelido',s.id,{apelido:nick})]);}
 catch(error){if(/UNIQUE/i.test(String(error?.message)))return taken();throw error;}
 return json({conta:account({...s,apelido:nick},env)});
}

async function signOut(request,env){
 const value=readCookies(request)[SESSION_COOKIE];
 if(value){
  const id=await hashed(value),who=await env.DB.prepare('SELECT usuario_id FROM sessoes WHERE id=?').bind(id).first('usuario_id');
  await env.DB.batch([env.DB.prepare('DELETE FROM sessoes WHERE id=?').bind(id),...(who?[event(env,'saiu',who)]:[])]);
 }
 return json({conta:null},200,{cookies:[signedOut()]});
}

async function deleteAccount(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(body.confirmar!=='APAGAR')return json({erro:'Confirme para apagar a conta.'},400);
 // Its records, laps, races, totals, guesses, sessions and events go with it (its e-mail with the account's row); the
 // panel keeps only that an account was deleted, by nobody.
 await env.DB.batch(['recordes','voltas','corridas','totais','palpites','sessoes','eventos'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE usuario_id=?`).bind(s.id))
  .concat(env.DB.prepare('DELETE FROM usuarios WHERE id=?').bind(s.id),event(env,'conta_apagada')));
 return json({conta:null,apagada:true},200,{cookies:[signedOut()]});
}

// What the game said of a race (migration 0011: its kind, level, cars, laps) and how it ended, the parts it has.
function raceSaid(r){
 const out={};
 for(const k of ['tipo','nivel','carros','voltas','posicao'])if(r[k]!==null&&r[k]!==undefined)out[k]=r[k];
 if(r.resultado_em)Object.assign(out,{terminou:!!r.terminou,resultado_em:new Date(r.resultado_em).toISOString()});
 return out;
}
// Everything kept about the account, as a file (LGPD art. 18: the player's copy of their data).
async function myData(request,env){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 const sessions=(await env.DB.prepare("SELECT criada_em,expira_em,COALESCE(site,'dev') AS site FROM sessoes WHERE usuario_id=? ORDER BY criada_em").bind(s.id).all()).results;
 const records=(await env.DB.prepare('SELECT circuito,modo,carro,selo,volta_ms,versao,feito_em,enviado_em,fantasma FROM recordes WHERE usuario_id=? ORDER BY circuito,modo,selo').bind(s.id).all()).results;
 const events=(await env.DB.prepare('SELECT quando,tipo,detalhe FROM eventos WHERE usuario_id=? ORDER BY quando').bind(s.id).all()).results;
 const laps=(await env.DB.prepare('SELECT quando,circuito,modo,carro,tempo_ms,resultado,aparelho,sinais,freios,fantasma,comandos,revisao,revisado_em,caso FROM voltas WHERE usuario_id=? ORDER BY quando').bind(s.id).all()).results;
 const races=(await env.DB.prepare('SELECT quando,circuito,modo,carro,tipo,nivel,carros,voltas,posicao,terminou,resultado_em FROM corridas WHERE usuario_id=? ORDER BY quando').bind(s.id).all()).results;
 const totals=(await env.DB.prepare('SELECT circuito,carro,tipo,nivel,corridas,voltas,conferidas,resultados,terminadas,vitorias,podios,soma_posicoes,primeira_em,ultima_em FROM totais WHERE usuario_id=? ORDER BY circuito,carro,tipo,nivel').bind(s.id).all()).results;
 const guesses=(await env.DB.prepare('SELECT bolao,quando,treino,corrida1,corrida2,desclassificado FROM palpites WHERE usuario_id=? ORDER BY quando').bind(s.id).all()).results;
 const email=await env.DB.prepare('SELECT email,email_em,ofertas_em FROM usuarios WHERE id=?').bind(s.id).first();
 const ghost=text=>{try{return text?JSON.parse(text):null;}catch{return null;}};
 const when=ms=>new Date(ms).toISOString();
 return json({
  sobre:'Tudo o que o Auto-Pobre Racing guarda da sua conta.',
  gerado_em:when(Date.now()),
  conta:{identificador_google:s.google_sub,apelido:s.apelido??null,criada_em:when(s.criado_em),ultimo_login:when(s.ultimo_login),
   ...(email?.email&&{email:await openEmail(env,email.email)??'(guardado com uma chave que este servidor não tem)',email_desde:when(email.email_em)}),
   ...(email?.ofertas_em&&{aceitou_ofertas_dos_patrocinadores_em:when(email.ofertas_em)})},
  sessoes:sessions.map(r=>({aberta_em:when(r.criada_em),expira_em:when(r.expira_em),site:r.site})),
  recordes:records.map(r=>({circuito:r.circuito,modo:r.modo,carro:r.carro,selo:r.selo,volta_ms:r.volta_ms,versao_do_jogo:r.versao,feito_em:when(r.feito_em),enviado_em:when(r.enviado_em),fantasma:ghost(r.fantasma)})),
  subida_dos_recordes_antigos:{dev:s.importou_em?when(s.importou_em):null,principal:s.importou_principal_em?when(s.importou_principal_em):null},
  eventos:events.map(e=>({quando:when(e.quando),tipo:e.tipo,detalhe:ghost(e.detalhe)})),
  corridas:races.map(r=>({quando:when(r.quando),circuito:r.circuito,modo:r.modo,carro:r.carro,...raceSaid(r)})),
  totais:totals.map(r=>({circuito:r.circuito,carro:r.carro,tipo:r.tipo||null,nivel:r.nivel||null,corridas:r.corridas,voltas:r.voltas,voltas_conferidas:r.conferidas,
   resultados:r.resultados,terminadas:r.terminadas,vitorias:r.vitorias,podios:r.podios,soma_das_posicoes:r.soma_posicoes,primeira_vez:when(r.primeira_em),ultima_vez:when(r.ultima_em)})),
  palpites:guesses.map(p=>({fim_de_semana:p.bolao,quando:when(p.quando),treino:p.treino,corrida1:p.corrida1,corrida2:p.corrida2,...(p.desclassificado&&{desclassificado:true})})),
  voltas:laps.map(v=>({quando:when(v.quando),circuito:v.circuito,modo:v.modo,carro:v.carro,tempo_ms:v.tempo_ms,resultado:v.resultado,aparelho:v.aparelho,sinais:ghost(v.sinais),freios:ghost(v.freios),
   ...(v.fantasma&&{fantasma:ghost(v.fantasma)}),...(v.comandos&&{comandos:ghost(v.comandos)}),...(v.caso&&{caso:v.caso}),...(v.revisao&&{revisao:v.revisao,revisada_em:v.revisado_em?when(v.revisado_em):null})})),
 },200,{headers:{'Content-Disposition':'attachment; filename="autopobre-meus-dados.json"'}});
}

const GETS={'/api/conta/eu':me,'/api/conta/entrar':signIn,'/api/conta/google':googleBack,'/api/conta/meus-dados':myData,...RECORDS_GETS,...ADMIN_GETS,...PALPITES_GETS};
const POSTS={'/api/conta/apelido':setNickname,'/api/conta/sair':signOut,'/api/conta/apagar':deleteAccount,...RECORDS_POSTS,...ADMIN_POSTS,...ROOM_POSTS,...PALPITES_POSTS};

export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  try{
   if(request.method==='GET'&&GETS[path])return await GETS[path](request,env,url);
   if(request.method==='POST'&&POSTS[path]){const body=await readPost(request,env,RECORDS_BODY[path]);return body instanceof Response?body:await POSTS[path](request,env,body);}
   if(GETS[path]||POSTS[path])return json({erro:'Método não permitido.'},405);
   return json({erro:'Endereço desconhecido.'},404);
  }catch(error){
   console.error(error);
   return json({erro:'O servidor de contas falhou. Tente de novo.'},500);
  }
 },
};
