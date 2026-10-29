// The e-mail of a pilot who joined the palpites (palpites.js), to tell them if they make the podium. The game's own
// sign-in asks Google for nothing but `openid`; only a sign-in from the palpites page asks for `email` too (index.js
// signIn ?email=1), and only a verified address is kept. It is stored sealed (AES-GCM), under a key derived from
// EMAIL_KEY, a secret both Workers share (the database is one; SEAL_KEY is each Worker's own). Shown whole only to its
// owner (their data) and to who runs the palpites (their panel); elsewhere masked (b•••@gmail.com). Without EMAIL_KEY
// nothing is kept and the palpites stay shut.
import {b64url,fromB64url,random} from './base.js';

export const EMAIL_KEY_MIN=16;
export const emailReady=env=>String(env.EMAIL_KEY??'').length>=EMAIL_KEY_MIN;
const SHAPE=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
// What Google said about the account, as an address worth keeping, or null.
export const verifiedEmail=claims=>typeof claims?.email==='string'&&(claims.email_verified===true||claims.email_verified==='true')&&SHAPE.test(claims.email)?claims.email.toLowerCase():null;

const keys=new Map();
async function key(env){
 const secret=String(env.EMAIL_KEY);
 if(!keys.has(secret)){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'HKDF',false,['deriveKey']);
  keys.set(secret,await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('autopobre-conta'),info:new TextEncoder().encode('email-v1')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 }
 return keys.get(secret);
}
export async function sealEmail(env,email){
 const iv=random(12),sealed=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),new TextEncoder().encode(email)));
 const out=new Uint8Array(12+sealed.length);out.set(iv);out.set(sealed,12);
 return 'v1.'+b64url(out);
}
// The address, or null (none kept, no key, or one sealed under another key).
export async function openEmail(env,text){
 if(!emailReady(env)||typeof text!=='string'||!text.startsWith('v1.'))return null;
 try{
  const bytes=fromB64url(text.slice(3));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await key(env),bytes.slice(12)));
 }catch{return null;}
}
// A Google account as the palpites remember it after the account is gone (palpites.js deletedGuess): an HMAC of its id
// under a key from EMAIL_KEY too (both Workers must tell it the same), never the id itself.
const marks=new Map();
export async function accountMark(env,sub){
 const secret=String(env.EMAIL_KEY);
 if(!marks.has(secret)){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'HKDF',false,['deriveKey']);
  marks.set(secret,await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('autopobre-conta'),info:new TextEncoder().encode('palpite-apagado-v1')},base,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']));
 }
 return b64url(await crypto.subtle.sign('HMAC',marks.get(secret),new TextEncoder().encode(sub)));
}
// The address as others may see it: its first letter and its domain.
export const maskEmail=email=>{
 if(typeof email!=='string'||!email.includes('@'))return null;
 const at=email.lastIndexOf('@');
 return email[0]+'•••'+email.slice(at);
};
