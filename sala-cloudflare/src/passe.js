// The room pass: the accounts server's word (conta-cloudflare, POST /api/conta/passe-sala) that a pilot
// is signed in, under which nickname, for one room and a few minutes. The room server (index.js) lets
// nobody in without one. Both sides read this file, so the format is written once.
//
// A pass is two base64url parts, "data.signature": data is {v, c, n, s, e} (c: the account, as the rooms
// know it: an HMAC of its Google id, so the room server never learns that id; n: the nickname; s: the
// room; e: when it expires, ms), the signature an HMAC-SHA256 of "sala-passe-v1." + data with the secret
// SALA_PASSE, which both Workers keep (a secret, never in the code). Whoever could forge a pass would
// still need a room's password; only the accounts server, which checks the session, gives them out.
//
// An invitation (makeInvite) is the same kind of token, signed by a room for one account: its host asked
// for it (index.js), and it lets that pilot in without a password and without waiting at the door, for
// INVITE_LIFE. The lobby's pass (LOBBY: no room's name can be it) says who is online, for the invitations.
export const PASS_LIFE=5*60*1000;   // ms; the game reuses a pass for reconnections while it is fresh
export const INVITE_LIFE=12*60*60*1000;
export const LOBBY='@saguao';
export const ACCOUNT=/^[A-Za-z0-9_-]{22}$/;
const PURPOSE='sala-passe-v1.',INVITE='sala-convite-v1.',ROOM=/^[a-z0-9-]{1,24}$/;
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encode=text=>new TextEncoder().encode(text);
// A nickname as a room shows it (the accounts server's rules are stricter; this only keeps a pass sane).
const cleanName=value=>(typeof value==='string'?value:'').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,24);
const keys=new Map();
function hmacKey(secret){
 if(typeof secret!=='string'||secret.length<16)throw new Error('SALA_PASSE is not set');
 if(!keys.has(secret))keys.set(secret,crypto.subtle.importKey('raw',encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']));
 return keys.get(secret);
}
const sign=async(secret,text)=>new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(secret),encode(text)));
// The account as the rooms know it: the same for every pass of that Google id, nothing to learn the id from.
export async function accountKey(secret,sub){return b64url((await sign(secret,'conta\n'+sub)).slice(0,16));}
async function make(secret,purpose,fields){const data=b64url(encode(JSON.stringify({v:1,...fields})));return data+'.'+b64url(await sign(secret,purpose+data));}
// The token's fields when it is sound (signed for that purpose, well formed); null otherwise.
async function read(secret,purpose,text){
 if(typeof text!=='string'||text.length>1024)return null;
 const [data,mac,extra]=text.split('.');if(!data||!mac||extra!==undefined)return null;
 if(!await crypto.subtle.verify('HMAC',await hmacKey(secret),fromB64url(mac),encode(purpose+data)))return null;
 const p=JSON.parse(new TextDecoder().decode(fromB64url(data)));
 return p?.v===1&&ACCOUNT.test(p.c??'')?p:null;
}
// (room: a room's name, or LOBBY)
export const makePass=(secret,{account,name,room,now=Date.now()})=>make(secret,PURPOSE,{c:account,n:name,s:room,e:now+PASS_LIFE});
// {account, name} of a sound pass for this room, still fresh; null for anything else (forged, another
// room's, expired, malformed, or no secret here).
export async function readPass(secret,text,{room,now=Date.now()}){
 try{
  const p=await read(secret,PURPOSE,text);
  if(!p||p.s!==room||!(ROOM.test(p.s)||p.s===LOBBY)||!(p.e>now)||p.e>now+PASS_LIFE+60000)return null;
  const name=cleanName(p.n);return name?{account:p.c,name}:null;
 }catch{return null;}
}
// A room's invitation for one account (host: who invited, as shown to the pilot).
export const makeInvite=(secret,{account,room,host,now=Date.now()})=>make(secret,INVITE,{c:account,s:room,h:cleanName(host),e:now+INVITE_LIFE});
// Whether this is a sound invitation of this room for this account, still good.
export async function readInvite(secret,text,{room,account,now=Date.now()}){
 try{const p=await read(secret,INVITE,text);return !!p&&p.s===room&&ROOM.test(p.s)&&p.c===account&&p.e>now&&p.e<=now+INVITE_LIFE+60000;}catch{return false;}
}
