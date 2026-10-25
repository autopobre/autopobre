// Accounts for Auto-Pobre Racing: sign in with Google, so the records say who drove them (recordes.js).
// The Worker answers <site>/api/* on the game's own origin (the pages stay on GitHub Pages), so the
// session is a plain first-party cookie and the game needs no CORS.
//
// What it keeps, and nothing else (LGPD: the least that makes an account): the Google account's
// subject id (`sub`: the scope is openid alone, so no name, picture or e-mail ever arrives), the public
// nickname the player picks, when the account was made and last signed in, its sessions and its online
// records. Each account can download all of it (/meus-dados) and delete it for good (/apagar).
//
// Sign-in is the authorization code flow, run here (the page loads no Google script): state, nonce and
// the PKCE verifier travel in a short-lived encrypted cookie, so nothing is written before Google has
// answered; the code is exchanged with the client secret, and the ID token's issuer, audience, expiry
// and nonce are checked (it comes straight from Google's token endpoint over TLS, which OpenID Connect
// Core 3.1.3.7 accepts in place of its signature). A session is a random value in a __Host- cookie
// (HttpOnly, Secure, SameSite=Lax); the database holds only its SHA-256. Every write needs the exact
// Origin and a JSON body: dev and the main link are the same site to a browser, so SameSite alone
// would let a page of one post to the other.
import {SESSION_COOKIE,LOGIN_COOKIE,b64url,fromB64url,random,sha256,hashed,sameText,readCookies,setCookie,json,redirect,seal,unseal,session,signedOut,signedIn,notSignedIn,readPost} from './base.js';
import {RECORDS_GETS,RECORDS_POSTS,RECORDS_BODY} from './recordes.js';

const SESSION_DAYS=30;        // a session's life; signing in again makes a new one
const MAX_SESSIONS=10;        // per account (browsers, phones): the oldest go first
const LOGIN_MINUTES=10;       // to come back from Google
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth',GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const ISSUERS=new Set(['https://accounts.google.com','accounts.google.com']);
const SUB=/^[\x21-\x7e]{1,255}$/;
// A nickname: 3 to 20 Latin letters or digits, with single spaces, dots, dashes or underscores
// between them. Latin only, so nobody passes for another with look-alike letters; its key (no
// accents, no case) is unique, so "João" and "joao" are one pilot.
const NICKNAME=/^[\p{Script=Latin}0-9](?:[\p{Script=Latin}0-9 ._-]{1,18})[\p{Script=Latin}0-9]$/u;
export function cleanNickname(value){
 const nick=String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
 return NICKNAME.test(nick)&&!/[ ._-]{2}/.test(nick)?nick:null;
}
export const nicknameKey=nick=>nick.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const NICKNAME_RULE='Use de 3 a 20 letras ou números (espaço, ponto, traço ou sublinhado só entre eles).';
// Where to land after Google: a path on this site, never another site ("//host" or a backslash).
export const safeReturn=value=>typeof value==='string'&&value.length<=512&&/^\/(?![/\\])[^\s\\]*$/.test(value)?value:'/';

// Google's addresses. Only a local test (an http://127.0.0.1 origin) may point them at a stand-in.
function google(env,which){
 const local=String(env.ORIGEM).startsWith('http://127.0.0.1:');
 return which==='auth'?(local&&env.GOOGLE_AUTH_URL)||GOOGLE_AUTH:(local&&env.GOOGLE_TOKEN_URL)||GOOGLE_TOKEN;
}
const redirectUri=env=>env.ORIGEM+'/api/conta/google';

const account=row=>({apelido:row.apelido??null,desde:new Date(row.criado_em).toISOString()});

async function me(request,env){
 const s=await session(request,env);
 if(!s||s.gone)return json({conta:null},200,{cookies:s?.gone?[signedOut()]:[]});
 return json({conta:account(s)});
}

async function signIn(request,env,url){
 const state=b64url(random(32)),nonce=b64url(random(32)),verifier=b64url(random(32));
 const pending=await seal(env,'cookie-login-v1',{e:state,n:nonce,v:verifier,r:safeReturn(url.searchParams.get('volta')),t:Date.now()});
 const auth=new URL(google(env,'auth'));
 auth.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri(env),response_type:'code',scope:'openid',
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
 const user=await env.DB.prepare('INSERT INTO usuarios (google_sub,criado_em,ultimo_login) VALUES (?1,?2,?2) ON CONFLICT(google_sub) DO UPDATE SET ultimo_login=?2 RETURNING id').bind(claims.sub,now).first();
 const value=b64url(random(32)),steps=[
  env.DB.prepare('INSERT INTO sessoes (id,usuario_id,criada_em,expira_em) VALUES (?,?,?,?)').bind(await hashed(value),user.id,now,now+SESSION_DAYS*86400000),
  env.DB.prepare('DELETE FROM sessoes WHERE expira_em<=?').bind(now),
  env.DB.prepare('DELETE FROM sessoes WHERE usuario_id=?1 AND id NOT IN (SELECT id FROM sessoes WHERE usuario_id=?1 ORDER BY criada_em DESC LIMIT ?2)').bind(user.id,MAX_SESSIONS)];
 // A session this browser had before (another account, or the same) ends here: one per browser.
 if(cookies[SESSION_COOKIE])steps.push(env.DB.prepare('DELETE FROM sessoes WHERE id=?').bind(await hashed(cookies[SESSION_COOKIE])));
 await env.DB.batch(steps);
 return redirect(back,[clear,setCookie(SESSION_COOKIE,value,SESSION_DAYS*86400)]);
}

async function setNickname(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 const nick=cleanNickname(body.apelido);if(!nick)return json({erro:NICKNAME_RULE},400);
 const key=nicknameKey(nick),taken=()=>json({erro:'Esse apelido já é de outro piloto.'},409);
 if(await env.DB.prepare('SELECT id FROM usuarios WHERE apelido_chave=? AND id<>?').bind(key,s.id).first())return taken();
 try{await env.DB.prepare('UPDATE usuarios SET apelido=?,apelido_chave=? WHERE id=?').bind(nick,key,s.id).run();}
 catch(error){if(/UNIQUE/i.test(String(error?.message)))return taken();throw error;}
 return json({conta:account({...s,apelido:nick})});
}

async function signOut(request,env){
 const value=readCookies(request)[SESSION_COOKIE];
 if(value)await env.DB.prepare('DELETE FROM sessoes WHERE id=?').bind(await hashed(value)).run();
 return json({conta:null},200,{cookies:[signedOut()]});
}

async function deleteAccount(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 if(body.confirmar!=='APAGAR')return json({erro:'Confirme para apagar a conta.'},400);
 await env.DB.batch(['recordes','sessoes'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE usuario_id=?`).bind(s.id)).concat(env.DB.prepare('DELETE FROM usuarios WHERE id=?').bind(s.id)));
 return json({conta:null,apagada:true},200,{cookies:[signedOut()]});
}

// Everything kept about the account, as a file (LGPD art. 18: the player's copy of their data).
async function myData(request,env){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 const sessions=(await env.DB.prepare('SELECT criada_em,expira_em FROM sessoes WHERE usuario_id=? ORDER BY criada_em').bind(s.id).all()).results;
 const records=(await env.DB.prepare('SELECT circuito,modo,carro,selo,volta_ms,versao,feito_em,enviado_em,length(fantasma) AS fantasma FROM recordes WHERE usuario_id=? ORDER BY circuito,modo,selo').bind(s.id).all()).results;
 const when=ms=>new Date(ms).toISOString();
 return json({
  sobre:'Tudo o que o Auto-Pobre Racing guarda da sua conta.',
  gerado_em:when(Date.now()),
  conta:{identificador_google:s.google_sub,apelido:s.apelido??null,criada_em:when(s.criado_em),ultimo_login:when(s.ultimo_login)},
  sessoes:sessions.map(r=>({aberta_em:when(r.criada_em),expira_em:when(r.expira_em)})),
  recordes:records.map(r=>({circuito:r.circuito,modo:r.modo,carro:r.carro,selo:r.selo,volta_ms:r.volta_ms,versao_do_jogo:r.versao,feito_em:when(r.feito_em),enviado_em:when(r.enviado_em),fantasma_bytes:r.fantasma??0})),
 },200,{headers:{'Content-Disposition':'attachment; filename="autopobre-meus-dados.json"'}});
}

const GETS={'/api/conta/eu':me,'/api/conta/entrar':signIn,'/api/conta/google':googleBack,'/api/conta/meus-dados':myData,...RECORDS_GETS};
const POSTS={'/api/conta/apelido':setNickname,'/api/conta/sair':signOut,'/api/conta/apagar':deleteAccount,...RECORDS_POSTS};

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
