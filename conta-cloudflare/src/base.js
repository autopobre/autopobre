// What the accounts (index.js) and the online records (recordes.js) share: bytes and hashes, the
// cookies, JSON answers, sealed tokens, the session, and the guard on writes.
export const SESSION_COOKIE='__Host-ap_sessao',LOGIN_COOKIE='__Host-ap_login';
export const MAX_BODY=4096;   // bytes of a POST (a lap with its ghost has its own limit)

export const b64url=bytes=>{let text='';const all=new Uint8Array(bytes);for(let i=0;i<all.length;i+=0x8000)text+=String.fromCharCode(...all.subarray(i,i+0x8000));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
export const fromB64url=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const random=bytes=>crypto.getRandomValues(new Uint8Array(bytes));
export const sha256=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
export const hashed=async value=>b64url(await sha256(value));
export function sameText(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
export function readCookies(request){
 const out={};
 for(const part of (request.headers.get('Cookie')??'').split(';')){const i=part.indexOf('=');if(i>0){const k=part.slice(0,i).trim();if(!(k in out))out[k]=part.slice(i+1).trim();}}
 return out;
}
export const setCookie=(name,value,seconds)=>`${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
const BASE_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export function json(data,status=200,{cookies=[],headers={}}={}){
 const h=new Headers({...BASE_HEADERS,'Content-Type':'application/json; charset=utf-8',...headers});
 for(const c of cookies)h.append('Set-Cookie',c);
 return new Response(JSON.stringify(data),{status,headers:h});
}
export function redirect(location,cookies=[]){
 const h=new Headers({...BASE_HEADERS,Location:location});
 for(const c of cookies)h.append('Set-Cookie',c);
 return new Response(null,{status:303,headers:h});
}

// Sealed tokens (AES-GCM): the sign-in cookie, the records' run tickets. Each purpose has its own key,
// derived from the client secret (one secret to keep; a new one voids only what is under way).
const keys=new Map();
async function sealKey(env,purpose){
 const secret=String(env.GOOGLE_CLIENT_SECRET??'');
 if(!secret)throw new Error('GOOGLE_CLIENT_SECRET is not set');
 const id=purpose+'\n'+secret;
 if(!keys.has(id)){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'HKDF',false,['deriveKey']);
  keys.set(id,await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('autopobre-conta'),info:new TextEncoder().encode(purpose)},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 }
 return keys.get(id);
}
export async function seal(env,purpose,data){
 const iv=random(12),sealed=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await sealKey(env,purpose),new TextEncoder().encode(JSON.stringify(data))));
 const out=new Uint8Array(12+sealed.length);out.set(iv);out.set(sealed,12);
 return b64url(out);
}
export async function unseal(env,purpose,text){
 try{
  const bytes=fromB64url(String(text));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await sealKey(env,purpose),bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
 }catch{return null;}
}

// The account behind this browser's session cookie; {gone:true} for a cookie the server no longer knows.
export async function session(request,env){
 const value=readCookies(request)[SESSION_COOKIE];
 if(!value)return null;
 const row=await env.DB.prepare('SELECT s.id AS sid,u.id,u.google_sub,u.apelido,u.criado_em,u.ultimo_login FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.id=? AND s.expira_em>?').bind(await hashed(value),Date.now()).first();
 return row??{gone:true};
}
export const signedOut=()=>setCookie(SESSION_COOKIE,'',0);
export async function signedIn(request,env){
 const s=await session(request,env);
 return s&&!s.gone?s:null;
}
export const notSignedIn=()=>json({erro:'Entre com a sua conta primeiro.'},401,{cookies:[signedOut()]});

// A write: this site's exact origin, JSON, within `limit` bytes.
export async function readPost(request,env,limit=MAX_BODY){
 if(request.headers.get('Origin')!==env.ORIGEM)return json({erro:'Origem não permitida.'},403);
 if(!/^application\/json\b/i.test(request.headers.get('Content-Type')??''))return json({erro:'Esperava JSON.'},415);
 if(Number(request.headers.get('Content-Length')??0)>limit)return json({erro:'Pedido grande demais.'},413);
 const text=await request.text();
 if(text.length>limit)return json({erro:'Pedido grande demais.'},413);
 let body;try{body=JSON.parse(text||'{}');}catch{return json({erro:'JSON inválido.'},400);}
 return body&&typeof body==='object'&&!Array.isArray(body)?body:json({erro:'JSON inválido.'},400);
}
