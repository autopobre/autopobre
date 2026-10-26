// Room messages through the room server (sala-cloudflare), for players on different machines: one
// WebSocket per window. The account's pass (signed in, under which nickname: conta.js roomPass) and the
// room's password go first; the server answers with this tab's identity and role (the host's password
// opens a room, the pilots' only enters one), stamps every relayed message with its sender, and decides
// who hosts. The tab keeps the server's token (sessionStorage) so a reload comes back as the same
// player. Room (net-room.js) speaks the same messages over this link as over the BroadcastChannel of the
// same-machine test. The server's address is also in the page's content policy (scripts/publicacao.py
// ROOM_SERVER).
export const ROOM_SERVER='wss://sala.autopobre.com.br';
// wrangler dev on this machine (&servidor=local), for the checks.
export const LOCAL_SERVER='ws://127.0.0.1:8787';
// Why the server closed the connection (sala-cloudflare/src/index.js CLOSE): the game says so. Its
// 4012 (the key came too late: a slow connection) is not here: a line that dropped, tried again.
export const CLOSED=Object.freeze({4001:'chave',4002:'cheia',4003:'recusado',4004:'expulso',4008:'excesso',4009:'ocupada',4010:'outra-aba',4011:'origem',4014:'passe',4016:'convite',4017:'fechada'});
const MAX_BYTES=65536,RETRIES=[1000,2000,4000,8000,15000];
// The rooms switched off (no SALA_PASSE on a server: the accounts server says 503, the room server closes
// 4015): asked again this often (ms), not as a dropped line.
const OFF_RETRY=60000;
// A pass is used again for a new connection (a dropped line) while it has this long left (ms).
const PASS_SPARE=60000;
const TOKEN=/^[0-9a-f]{32}$/;
const session=()=>{try{return globalThis.sessionStorage??null;}catch{return null;}};
export class ServerLink {
 // key: a function, read at each connection (the password may be typed after a refusal); invite(): the
 // host's invitation to this room kept in this browser (instead of the password), forgetInvite() when the
 // server took it for nothing (it ran out). pass(room):
 // the account's pass for this room, {passe, validade} or {problema: 'conta' (not signed in),
 // 'apelido' (no nickname yet), 'salas' (the rooms are switched off) or 'contas' (the accounts server did
 // not answer)}.
 // socket: how to open the WebSocket (the Node checks add the Origin a browser sends).
 constructor({url,room,key,pass,invite=()=>null,forgetInvite=()=>{},storage=session(),socket=url=>new WebSocket(url),now=()=>Date.now()}){
  Object.assign(this,{url,room,key,pass,invite,forgetInvite,storage,socket,now});this.ws=null;this.tries=0;this.closing=false;this.onmessage=null;this.onclose=null;this.onopen=null;
  // ws: the newest connection; live: the one the room hears (the old one, while a new one made by
  // reconnect has not been welcomed yet).
  this.live=null;
  // The last pass and until when it is good; asking: one being fetched (no second connection meanwhile).
  this.ticket=null;this.asking=false;
 }
 get tokenKey(){return 'autopobre-sala-token-'+this.room;}
 // This tab came in by an invitation (kept as its token is): once the invitation is gone (its room closed, or it ran
 // out) the tab is out of the room, never asked for a password it was never given (the team's wish, 10-26: who was
 // invited need not know there is one; who came with the link and the password is asked as before).
 get invitedKey(){return 'autopobre-sala-convidado-'+this.room;}
 get invited(){try{return this.storage?.getItem(this.invitedKey)==='1';}catch{return false;}}
 get token(){try{const t=this.storage?.getItem(this.tokenKey);return TOKEN.test(t??'')?t:null;}catch{return null;}}
 saveToken(token){if(!TOKEN.test(token??''))return;try{this.storage?.setItem(this.tokenKey,token);}catch{}}
 // The pass for this room: the last one while fresh, else a new one.
 get fresh(){return !!this.ticket&&this.ticket.until-this.now()>PASS_SPARE;}
 async passFor(){
  if(this.fresh)return this.ticket;
  let r;try{r=await this.pass(this.room);}catch{r=null;}
  if(typeof r?.passe==='string'&&r.passe){const life=Number(r.validade);this.ticket={passe:r.passe,until:this.now()+(life>0?Math.min(life,3600000):0)};return this.ticket;}
  return {problema:['conta','apelido','salas'].includes(r?.problema)?r.problema:'contas'};
 }
 // A fresh pass connects at once; otherwise a new one is asked for first.
 open(){
  this.closing=false;clearTimeout(this.retry);
  if(this.asking)return;
  if(this.fresh){this.go(this.ticket);return;}
  this.asking=true;
  this.passFor().then(pass=>{this.asking=false;if(!this.closing)this.go(pass);});
 }
 go(pass){
  // Not signed in, or no nickname: the player sees why (and signs in); the accounts server out of
  // reach: tried again, as a dropped line.
  if(pass.problema==='contas'){this.lost('contas');return;}
  if(pass.problema==='salas'){this.off();return;}
  if(pass.problema){this.shutAll();this.onclose?.(pass.problema);return;}
  // No password typed yet, nor an invitation: asked for at once (the server would only say it is wrong).
  const key=String(this.key()??''),invite=this.invite()||null;if(!key&&!invite){this.onclose?.(this.invited?'fechada':'chave');return;}
  this.connect(pass.passe,key,invite);
 }
 connect(passe,key,invite){
  if(invite)try{this.storage?.setItem(this.invitedKey,'1');}catch{}
  let ws;try{ws=this.ws=this.socket(`${this.url}/sala/${encodeURIComponent(this.room)}`);}catch{this.ws=null;this.lost();return;}
  ws.onopen=()=>{ws.send(JSON.stringify({t:'auth',key,passe,token:this.token,...(invite&&{convite:invite})}));this.onopen?.();};
  // The room hears the live connection only: a new one from its welcome on, the old one until then.
  ws.onmessage=e=>{
   if(ws!==this.ws&&ws!==this.live||typeof e.data!=='string'||e.data.length>MAX_BYTES)return;
   let m;try{m=JSON.parse(e.data);}catch{return;}
   if(!m||typeof m!=='object'||Array.isArray(m))return;
   if(m.t==='welcome'){this.saveToken(m.token);this.tries=0;this.live=ws;}else if(ws!==this.live)return;
   this.onmessage?.(m);
  };
  ws.onclose=e=>{
   // An old connection replaced by a new one: nothing to tell (the new one is on its way).
   if(ws!==this.ws){if(this.live===ws)this.live=null;return;}
   this.ws=null;if(this.live===ws)this.live=null;
   // (a pass the server did not take is never offered again)
   if(e.code===4014)this.ticket=null;
   if(e.code===4015){this.off();return;}
   // (an invitation the server did not take, or one its host cancelled (4016), or its room closed (4017): out,
   // the password asked for instead)
   if((e.code===4001||e.code===4016||e.code===4017)&&invite)this.forgetInvite();
   const reason=CLOSED[e.code];if(reason||this.closing){this.onclose?.(reason??'saiu');return;}
   // A new connection that failed while the old one still works (the alarm was false): that one goes on.
   if(this.live?.readyState===1){this.ws=this.live;return;}
   this.lost();
  };
  ws.onerror=()=>{};
 }
 // The connection dropped (network, a server restart, the day's limit), or the accounts server did not
 // answer (why: 'contas'): try again, soon at first, then every RETRIES' last delay for as long as the
 // page stays ('fora' once the quick tries ran out). Only a welcome starts the tries over: a server that
 // lets the connection in and closes it at once (an error, a key too late) waits longer each time too.
 lost(why='reconectando'){
  if(this.closing)return;const delay=RETRIES[Math.min(this.tries++,RETRIES.length-1)];
  this.onclose?.(why==='reconectando'&&this.tries>RETRIES.length?'fora':why);clearTimeout(this.retry);this.retry=setTimeout(()=>this.open(),delay);
 }
 // The rooms switched off on a server: the player hears so, and the room is asked again in OFF_RETRY.
 off(){if(this.closing)return;this.onclose?.('salas');clearTimeout(this.retry);this.retry=setTimeout(()=>this.open(),OFF_RETRY);}
 // The room went quiet (net-room.js): this connection may be dead though the browser has not noticed
 // (it may take it a minute). A new one takes its place at once; the old one is left open, for the
 // server to close once the new one is in (the same token: no goodbye reaches the room, so a false
 // alarm costs nothing), or to die on its own. Not while a new one is still connecting.
 reconnect(){if(this.closing||!this.ws||this.ws.readyState===0||this.asking)return;this.open();}
 // For the checks (multiplayer.js dropLine): the line drops as a network drops it, no goodbye (a new
 // connection on its way too); slow: the next try only after the longest wait.
 drop(slow=false){if(!this.ws)return;if(slow)this.tries=RETRIES.length-1;for(const ws of new Set([this.ws,this.live]))try{ws?.close(4000);}catch{}}
 // (through the live connection: a new one is not the room's until its welcome)
 send(m){const ws=this.live?.readyState===1?this.live:this.ws;if(ws?.readyState===1)try{ws.send(JSON.stringify(m));}catch{}}
 close(){this.closing=true;clearTimeout(this.retry);this.shutAll();}
 // (forgotten first: their closing says nothing to the room)
 shutAll(){const all=new Set([this.ws,this.live]);this.ws=this.live=null;for(const ws of all)try{ws?.close(1000);}catch{}}
}
