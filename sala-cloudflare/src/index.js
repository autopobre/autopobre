// Room server for Auto-Pobre Racing's multiplayer (teste/net-room.js, net-link.js). One Durable
// Object per room relays the room's messages over WebSockets, so the players' browsers only ever talk
// to Cloudflare: nobody sees another player's IP.
//
// What the server enforces, whatever a client sends:
// - the account: a pass from the accounts server (passe.js, secret SALA_PASSE) says the pilot is
//   signed in and under which nickname; without one nobody even tries a password. That nickname is the
//   pilot's name in the room (the knock, the host's list, the grid), whatever the game writes;
// - the passwords (secrets SENHA_ANFITRIAO and SENHA_PILOTOS): only the host's opens a room (hosts
//   it, or takes it over); the pilots' only enters a room someone opened. Without either, nobody gets in;
// - the page's origin (ORIGENS): other sites cannot use it with their visitors' browsers;
// - who is who: every relayed message carries the sender's id as the server knows it (from);
// - roles: only the host sends the room's word (lobby, go, snap, pong) and it reaches the admitted
//   guests; guests' messages (hello, ready, state, ping, bye) reach the host only;
// - the doorman: a guest waits outside until the host admits it; the host can refuse or kick (the
//   account kicked stays out of that room, from any tab);
// - invitations: the host sees who is online (the Saguão: every page of a signed-in pilot keeps a line
//   to it) and invites one; the invitation, signed by the room for that account, takes the place of the
//   password and of the door, while the room still has it: the host may cancel it until it is taken;
// - the line check: an echo the server answers itself, so a player's game can tell a dead connection;
// - limits: message size, messages and bytes per second per connection, players per room, guests
//   waiting at the door (per IP and per account too), nothing but the key before the key, failed
//   passwords per IP across every room (Porteiro: a new room name gives no fresh tries; never a
//   room-wide lockout).
// A tab keeps its token (sessionStorage): back within HOST_GRACE after a reload, a host hosts again
// and a guest keeps its id and its admission (the same account and the same kind of password; another
// is someone new); a host that does not come back hands the room to the admitted guest with the host's
// password that has been there longest, else to one with it at the door, else the room waits without a
// host for one to come (a guest with only the pilots' password never hosts). During a race (the
// host's lobby says so) a host whose line dropped (no goodbye: a reload or a closed tab says one, and
// its race is gone with its page) keeps its place
// for RACE_GRACE instead: its guests' game stands the race still until it is back (players' wish: a
// race on the host's machine, a championship's round, must never pass to another for a dropped line).
const MAX_PEERS=19;          // 15 seats and a few watching
const MAX_BYTES=16384;       // one message
const RATE_MESSAGES=90;      // per connection, per second
const RATE_BYTES=320000;     // per connection, per second
const OVER_LIMIT_CLOSE=3;    // seconds over the limit before the connection is closed
const AUTH_WAIT=10000;       // ms to present the pass and the password
const FAILS_PER_MINUTE=20;   // wrong passwords per IP, in a room and in all of them, before that IP waits a minute
const MAX_AUTH_SOURCES=1024,MAX_PENDING=64,MAX_PENDING_PER_IP=MAX_PEERS+2;
const MAX_GATE_SOURCES=4096; // IPs the Porteiro remembers at once
const MAX_DOOR=10,MAX_DOOR_PER_IP=4; // guests waiting at the door at once, and from one IP
const TOKEN_TTL=24*60*60*1000,MAX_TOKENS=256; // bounded reconnect history (and kicked accounts); active identities are kept
const HOST_GRACE=15000;      // ms a host that left may take to come back (env HOST_GRACE_MS in tests)
const RACE_GRACE=600000;     // the same during a race (env RACE_GRACE_MS in tests)
// The room's chat (anyone let in, the host too): chat-text.js CHAT_LENGTH characters at most, CHAT_BURST messages
// per CHAT_WINDOW ms per connection (more are dropped), relayed to everyone else let in, under the
// sender's id and name.
const CHAT_BURST=4,CHAT_WINDOW=8000;
// Invitations: who is online, asked no more than once per ONLINE_EVERY ms; INVITES_PER_MINUTE a room,
// each pilot again only after INVITE_AGAIN ms. The lobby: LOBBY_MAX lines at once, LOBBY_PER_IP from one
// IP, LOBBY_TABS pages of one account (the oldest goes).
// The invitations a room keeps (one per account, the last), at most MAX_INVITES.
const ONLINE_EVERY=2000,ONLINE_MAX=50,INVITES_PER_MINUTE=10,INVITE_AGAIN=20000,MAX_INVITES=200,LOBBY_MAX=400,LOBBY_PER_IP=8,LOBBY_TABS=4;
const HOST_TYPES=new Set(['lobby','go','snap','pong','admit','deny','kick','config','bye','online','convidar','desconvidar']);
const GUEST_TYPES=new Set(['hello','ready','state','ping','bye']);
const ROOM=/^[a-z0-9-]{1,24}$/,ID=/^[0-9a-f]{8}$/,TOKEN=/^[0-9a-f]{32}$/;
// Close codes the game explains to the player (net-link.js); late (no key within AUTH_WAIT: a slow
// connection, not a wrong key) and door (the door is full: room is made as the host lets guests in)
// it just tries again, as it does a socket that sent something else before its key (1008). account:
// no pass, or not a sound one for this room (the key is the password; the pass comes with it). off: this
// server has no SALA_PASSE, or one too short to be a secret (passe.js SECRET_MIN): the rooms are switched
// off, and the game says so instead of taking every pilot's account for a bad one. uninvited: an
// invitation this room no longer has (its host cancelled it, or the room started anew) and no password.
export const CLOSE={key:4001,full:4002,denied:4003,kicked:4004,flood:4008,busy:4009,elsewhere:4010,origin:4011,late:4012,door:4013,account:4014,off:4015,uninvited:4016};
import {readPass,readInvite,makeInvite,secretReady,LOBBY,ACCOUNT,INVITE_ID,INVITE_LIFE} from './passe.js';
import {chatText,chatLink} from '../../pista_interlagos/teste/chat-text.js';
const hex=bytes=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
// The chat's text rules are the game's own file (chat-text.js): cleaned the same way on both sides, and a
// line with a link never relayed. The game refuses it before sending; one that comes anyway is dropped.
export {chatText,chatLink};
// Same length and every byte compared: the time taken says nothing about the key.
function sameKey(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=new TextEncoder().encode(String(a??'')),y=new TextEncoder().encode(String(b??''));
 let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);
 return diff===0&&y.length>0;
}
const origins=env=>String(env.ORIGENS??'').split(',').map(s=>s.trim()).filter(Boolean);
// The Porteiro's word on an IP (entrada: a socket on its way to a room), or news for it (erro: that
// socket's key was wrong; saida: it is past its key, or gone). Unreachable, it says livre: the rooms'
// own limits still hold.
async function porteiro(env,what,ip){
 if(!env.PORTEIRO)return 'livre';
 try{const r=await env.PORTEIRO.get(env.PORTEIRO.idFromName('porteiro'),{locationHint:'sam'}).fetch(`https://porteiro/${what}?ip=${encodeURIComponent(ip)}`);return r.ok?await r.text():'livre';}catch{return 'livre';}
}

export default {
 async fetch(request,env){
  const url=new URL(request.url),room=url.pathname.match(/^\/sala\/([^/]+)$/)?.[1];
  if(url.pathname==='/')return new Response('Auto-Pobre Racing · servidor das salas',{headers:{'content-type':'text/plain; charset=utf-8'}});
  // The lobby (who is online, for the invitations): one for everybody. Only its sockets come from
  // outside; what the rooms ask it never passes through here.
  if(url.pathname==='/saguao'){
   if(request.headers.get('Upgrade')!=='websocket')return new Response('Esperava WebSocket',{status:426});
   if(!origins(env).includes(request.headers.get('Origin')??''))return new Response('Origem não permitida',{status:403});
   return env.SAGUAO.get(env.SAGUAO.idFromName('saguao'),{locationHint:'sam'}).fetch(new Request(new URL('/saguao',request.url),request));
  }
  if(!room||!ROOM.test(room))return new Response('Sala inválida',{status:404});
  if(request.headers.get('Upgrade')!=='websocket')return new Response('Esperava WebSocket',{status:426});
  if(!origins(env).includes(request.headers.get('Origin')??''))return new Response('Origem não permitida',{status:403});
  // The room hears the Porteiro's word in a header this Worker always sets (a client's own is
  // replaced; the rooms are reached only through here).
  const headers=new Headers(request.headers);headers.set('X-Porteiro',await porteiro(env,'entrada',request.headers.get('CF-Connecting-IP')||'local'));
  // South America: the room lives near the players.
  return env.SALAS.get(env.SALAS.idFromName(room),{locationHint:'sam'}).fetch(new Request(request,{headers}));
 }
};

// One for every room, per IP: the wrong keys of the last minute and the sockets still to present
// their key. FAILS_PER_MINUTE wrong keys anywhere and that IP waits a minute in every room (bloqueado:
// the room lets in only an identity it knows, with its token and the key); MAX_PENDING_PER_IP sockets
// waiting at once and the next tries again (cheio). In memory, bounded: a restart forgets it all.
export class Porteiro {
 constructor(){this.sources=new Map();this.swept=0;}
 async fetch(request){const url=new URL(request.url);return new Response(this.answer(url.pathname.slice(1),url.searchParams.get('ip')||'local',Date.now()));}
 answer(what,ip,now){
  if(now-this.swept>=10000){this.swept=now;for(const [k,s] of this.sources){this.fresh(s,now);if(!s.waiting.length&&now>=s.until&&now-s.since>=60000)this.sources.delete(k);}}
  let s=this.sources.get(ip);
  if(!s){
   if(what!=='entrada')return 'ok';
   if(this.sources.size>=MAX_GATE_SOURCES)this.sources.delete(this.sources.keys().next().value);
   s={since:now,count:0,until:0,waiting:[]};this.sources.set(ip,s);
  }
  this.fresh(s,now);
  if(what==='entrada'){
   if(now<s.until)return 'bloqueado';
   if(s.waiting.length>=MAX_PENDING_PER_IP)return 'cheio';
   s.waiting.push(now);return 'livre';
  }
  s.waiting.shift();
  if(what==='erro'){if(now-s.since>=60000){s.since=now;s.count=0;}if(++s.count>=FAILS_PER_MINUTE)s.until=now+60000;}
  return 'ok';
 }
 // A socket never heard of again (its room restarted) stops counting once its key would be late.
 fresh(s,now){while(s.waiting.length&&now-s.waiting[0]>AUTH_WAIT+5000)s.waiting.shift();}
}

export class Sala {
 constructor(state,env){
  this.state=state;this.env=env;
  this.peers=new Map();        // id -> peer (authenticated connections)
  // token -> {id, token, admitted, since, account, name, host}: who has been in this room (host: came
  // with the host's password)
  this.tokens=new Map();
  this.banned=new Set();       // kicked tokens, retained with their bounded token history
  this.bannedAccounts=new Map(); // kicked accounts -> when: kept as long as a token's history
  this.issued=new Map();       // account -> {id, at, used}: the invitation this room gave it (its last)
  this.pending=new Set();      // sockets that have not authenticated yet
  this.hostId=null;this.hostToken=null;this.hostAwayTimer=null;this.porteiro=true;this.racing=false;
  // The room's own name (its address): a pass is good for one room only.
  this.name=null;
  this.attempts=new Map();this.grace=Number(env.HOST_GRACE_MS)||HOST_GRACE;this.raceGrace=Number(env.RACE_GRACE_MS)||RACE_GRACE;this.authWait=Number(env.AUTH_WAIT_MS)||AUTH_WAIT;
 }
 async fetch(request){
  this.name??=new URL(request.url).pathname.match(/^\/sala\/([^/]+)$/)?.[1]??null;
  // Cloudflare supplies this header at the edge. Do not trust X-Forwarded-For supplied by a client.
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  const [client,socket]=Object.values(new WebSocketPair());
  socket.accept();
  // gate: the Porteiro's word on this IP (the Worker's header; none in the in-memory checks).
  const peer={socket,ip,gate:request.headers.get('X-Porteiro'),id:null,token:null,authed:false,window:{since:Date.now(),messages:0,bytes:0,over:0}};
  if(peer.gate==='cheio'||this.pending.size>=MAX_PENDING||[...this.pending].filter(p=>p.ip===ip).length>=MAX_PENDING_PER_IP){
   this.shut(peer,CLOSE.late,'Muitas conexões aguardando chave');return new Response(null,{status:101,webSocket:client});
  }
  this.pending.add(peer);
  peer.authTimer=setTimeout(()=>{if(!peer.authed)this.shut(peer,CLOSE.late,'Sem chave a tempo');},this.authWait);
  socket.addEventListener('message',e=>this.message(peer,e.data));
  socket.addEventListener('close',()=>this.gone(peer));
  // An error ends the connection for good: closed here too, so the player's browser notices and
  // connects again (left open, it would wait on a line the room no longer serves).
  socket.addEventListener('error',()=>this.shut(peer,1011,'Erro na conexão'));
  return new Response(null,{status:101,webSocket:client});
 }
 // Once per connection: closing a broken socket may raise its error again.
 shut(peer,code,reason){if(peer.shut)return;peer.shut=true;try{peer.socket.close(code,reason);}catch{}this.gone(peer);}
 send(peer,m){try{peer.socket.send(JSON.stringify(m));}catch{}}
 // Messages and bytes per second per connection: over the limit a message is dropped, and a
 // connection that stays over it for OVER_LIMIT_CLOSE seconds is closed.
 allow(peer,size){
  const w=peer.window,now=Date.now();
  if(now-w.since>=1000){w.over=w.messages>RATE_MESSAGES||w.bytes>RATE_BYTES?w.over+1:0;w.since=now;w.messages=0;w.bytes=0;if(w.over>=OVER_LIMIT_CLOSE){this.shut(peer,CLOSE.flood,'Mensagens demais');return false;}}
  w.messages++;w.bytes+=size;return w.messages<=RATE_MESSAGES&&w.bytes<=RATE_BYTES;
 }
 message(peer,data){
  if(peer.shut||peer.authed&&this.peers.get(peer.id)!==peer)return;
  if(typeof data!=='string'||data.length>MAX_BYTES){this.shut(peer,CLOSE.flood,'Mensagem grande demais');return;}
  const size=new TextEncoder().encode(data).byteLength;
  if(size>MAX_BYTES){this.shut(peer,CLOSE.flood,'Mensagem grande demais');return;}
  if(!this.allow(peer,size))return;
  let m;try{m=JSON.parse(data);}catch{m=null;}
  const valid=!!m&&typeof m==='object'&&!Array.isArray(m)&&typeof m.t==='string';
  // Before the key, nothing but the key (with the pass): the game sends it first, so anything else is
  // not the game (and a socket without the key costs the room one message, not a stream of them).
  // While the pass is being checked, anything else is dropped: the game says nothing more until its
  // welcome, but a tab connecting again may already have an echo or a hello on its way.
  if(!peer.authed){if(peer.authing)return;if(valid&&m.t==='auth')return this.auth(peer,m);this.shut(peer,1008,'Esperava a chave');return;}
  if(!valid)return;
  // The line check (net-room.js): answered here, whatever the host is doing; no answer for a few
  // seconds tells the player's game its connection is dead before the browser notices.
  if(m.t==='eco'){this.send(peer,{t:'eco'});return;}
  if(m.t==='chat'){this.chat(peer,m);return;}
  const host=peer.id===this.hostId;
  if(!(host?HOST_TYPES:GUEST_TYPES).has(m.t))return;
  m.from=peer.id;
  if(host)return this.fromHost(peer,m);
  else{
   const entry=this.tokens.get(peer.token);
   if(m.t==='bye'){this.shut(peer,1000,'Saiu');return;}
   // A guest outside the door is only heard by the host through its knock. Its name is its
   // account's, whatever its hello says.
   if(entry?.admitted){if(m.t==='hello')m.name=peer.name;this.toHost(m);}
  }
 }
 // Which password this is: the host's opens a room (and enters one), the pilots' only enters. Both
 // are compared every time, byte by byte.
 grade(key){const host=sameKey(key,this.env.SENHA_ANFITRIAO),pilot=sameKey(key,this.env.SENHA_PILOTOS);return host?'host':pilot?'pilot':null;}
 async auth(peer,m){
  // The account first: without a sound pass for this room (passe.js) nobody even tries a password.
  if(!secretReady(this.env.SALA_PASSE)){this.shut(peer,CLOSE.off,'Salas desligadas');return;}
  peer.authing=true;
  const who=await readPass(this.env.SALA_PASSE,m.passe,{room:this.name});
  peer.authing=false;
  if(peer.shut)return;
  if(!who){this.shut(peer,CLOSE.account,'Entre com a sua conta');return;}
  // An invitation of this room for this account stands for the pilots' password, and for the door, while
  // the room still has it (issued: not cancelled; a room started anew has none).
  const inviteId=!this.grade(m.key)&&m.convite!==undefined?await readInvite(this.env.SALA_PASSE,m.convite,{room:this.name,account:who.account}):null;
  if(peer.shut)return;
  const now=Date.now(),offer=inviteId?this.issued.get(who.account):null;
  const invited=!!offer&&offer.id===inviteId&&now-offer.at<INVITE_LIFE;
  this.pruneTokens(now);
  const token=typeof m.token==='string'&&TOKEN.test(m.token)?m.token:null;
  const grade=this.grade(m.key)??(invited?'pilot':null),canHost=grade==='host';
  // A token is the same player only for the same account, and with the same kind of password: with
  // the other one it is someone new (a pilot who has the host's password now, say).
  let entry=token?this.tokens.get(token):null;
  if(entry&&(entry.account!==who.account||grade&&entry.host!==canHost))entry=null;
  const ip=peer.ip||'local';
  for(const [source,a] of this.attempts)if(now-a.since>=60000&&now>=a.until)this.attempts.delete(source);
  const attempt=this.attempts.get(ip);
  // An already authenticated identity may reconnect even behind the same NAT as a mistyping
  // player, but only with its unguessable token, its own account's pass and a right password. The IP
  // waits for its wrong passwords here or, the Porteiro says, in any room.
  if((peer.gate==='bloqueado'||attempt&&now<attempt.until)&&!(entry&&!this.banned.has(token)&&grade)){
   this.shut(peer,CLOSE.busy,'Tente de novo em um minuto');return;
  }
  if(!grade){
   const a=attempt&&now-attempt.since<60000?attempt:{since:now,count:0,until:0};
   if(++a.count>=FAILS_PER_MINUTE)a.until=now+60000;
   if(!this.attempts.has(ip)&&this.attempts.size>=MAX_AUTH_SOURCES)this.attempts.delete(this.attempts.keys().next().value);
   this.attempts.set(ip,a);
   // (an invitation brought in its place: one the room no longer has, which the game says as such)
   this.settle(peer,true);if(m.convite!==undefined)this.shut(peer,CLOSE.uninvited,'Convite cancelado');else this.shut(peer,CLOSE.key,'Senha errada');return;
  }
  if(token&&this.banned.has(token)||this.bannedAccounts.has(who.account)){this.shut(peer,CLOSE.kicked,'Removido pelo anfitrião');return;}
  const old=entry?this.peers.get(entry.id):null;
  // The absent host's place remains reserved throughout its grace. Reusing an inactive token
  // consumes a place too; only replacing the same live identity leaves occupancy unchanged.
  const reserved=this.hostAwayTimer&&!this.peers.has(this.hostId)?1:0;
  const returningHost=reserved&&entry?.token===this.hostToken;
  if(!old&&this.peers.size+reserved>=MAX_PEERS&&!returningHost){this.shut(peer,CLOSE.full,'Sala cheia');return;}
  // Who hosts: only the host's password, in a room without a host (or whose host is gone for good),
  // or its own host back within the grace.
  const hosts=canHost&&(!this.hostId||entry?.token===this.hostToken||!this.peers.has(this.hostId)&&!this.hostAwayTimer);
  // The door holds MAX_DOOR guests at once, MAX_DOOR_PER_IP of them from one IP or one account: one
  // pilot cannot fill the room with knocks. One more tries again (CLOSE.door) until the host lets some in.
  if(!hosts&&this.porteiro&&!entry?.admitted&&!invited){
   const door=[...this.peers.values()].filter(p=>p!==old&&p.id!==this.hostId&&!this.tokens.get(p.token)?.admitted);
   if(door.length>=MAX_DOOR||door.filter(p=>p.ip===ip).length>=MAX_DOOR_PER_IP||door.filter(p=>p.account===who.account).length>=MAX_DOOR_PER_IP){this.shut(peer,CLOSE.door,'Porta cheia');return;}
  }
  // The same tab again (a reload, or a duplicated tab): the newer connection keeps the identity.
  if(old&&old!==peer){this.peers.delete(entry.id);this.shut(old,CLOSE.elsewhere,'Aberta em outra aba');}
  if(!entry){this.pruneTokens(now,true);entry={id:this.newId(),token:hex(16),admitted:false,since:now,account:who.account,host:canHost};this.tokens.set(entry.token,entry);}
  entry.lastSeen=now;entry.name=who.name;if(invited){entry.admitted=true;offer.used=true;}
  peer.token=entry.token;peer.id=entry.id;peer.name=who.name;peer.account=who.account;peer.canHost=canHost;peer.authed=true;clearTimeout(peer.authTimer);
  this.pending.delete(peer);this.settle(peer);
  this.peers.set(peer.id,peer);
  // The host's password opens an empty room; its host back within the grace takes it again.
  const hostBack=this.hostToken===peer.token;
  if(hosts){
   if(!hostBack&&this.hostId&&this.hostId!==peer.id)this.hostToken=null;
   this.makeHost(peer);
  }
  const role=peer.id===this.hostId?'host':'guest';
  if(role==='host')entry.admitted=true;else if(!this.porteiro)entry.admitted=true;
  // (host: null, a room nobody with the host's password has opened yet, or whose host is gone: its
  // guests wait for one)
  this.send(peer,{t:'welcome',id:peer.id,token:peer.token,role,host:this.hostId,pending:!entry.admitted});
  // Everyone else hears who hosts now (those at the door too: they knock for that host).
  if(hosts)this.toOthers(peer,{t:'host',id:peer.id});
  if(role==='host')this.knocks();else if(!entry.admitted)this.toHost({t:'knock',id:peer.id,name:peer.name});
 }
 // Expire disconnected sessions and evict the oldest disconnected identity when the history is
 // full. A live peer or a host in its grace is never evicted. Kicks share this bounded lifetime;
 // an expired identity must ask the doorman again, just as after a room/server restart.
 pruneTokens(now,space=false){
  const inactive=[];
  for(const [account,since] of this.bannedAccounts)if(now-since>=TOKEN_TTL)this.bannedAccounts.delete(account);
  for(const [token,e] of this.tokens){
   if(this.peers.has(e.id)||this.hostAwayTimer&&token===this.hostToken)continue;
   if(now-e.lastSeen>=TOKEN_TTL){this.tokens.delete(token);this.banned.delete(token);}
   else inactive.push(e);
  }
  if(space){
   inactive.sort((a,b)=>a.lastSeen-b.lastSeen);
   for(const e of inactive){if(this.tokens.size<MAX_TOKENS)break;this.tokens.delete(e.token);this.banned.delete(e.token);}
  }
 }
 // Everyone still waiting at the door knocks again for a host that has just (re)taken the room.
 knocks(){for(const p of this.peers.values())if(p.id!==this.hostId&&!this.tokens.get(p.token)?.admitted)this.toHost({t:'knock',id:p.id,name:p.name});}
 newId(){let id;do id=hex(4);while([...this.tokens.values()].some(e=>e.id===id));return id;}
 makeHost(peer){
  clearTimeout(this.hostAwayTimer);this.hostAwayTimer=null;
  this.hostId=peer.id;this.hostToken=peer.token;const entry=this.tokens.get(peer.token);if(entry)entry.admitted=true;
 }
 fromHost(peer,m){
  const to=typeof m.to==='string'&&ID.test(m.to)?this.peers.get(m.to):null;
  switch(m.t){
   case 'config':this.porteiro=m.porteiro!==false;return;
   // (with the host's id: one let in after waiting in a room without a host learns whose it is now)
   case 'admit':{if(!to)return;const e=this.tokens.get(to.token);if(e&&!e.admitted){e.admitted=true;this.send(to,{t:'admitted',host:this.hostId});}return;}
   // Refused: the room forgets that tab, so knocking again it is someone new (not one that has
   // waited since its first knock).
   case 'deny':if(to&&!this.tokens.get(to.token)?.admitted){this.tokens.delete(to.token);this.shut(to,CLOSE.denied,'Entrada recusada');}return;
   // Kicked: that tab, and that account from any tab, as long as the room remembers it (not the
   // host's own account: a second tab of its own goes alone).
   case 'kick':{
    if(!to||to===peer)return;
    const account=to.account!==peer.account?to.account:null;
    // (its invitation too, if it had one: kicked is out, invited or not)
    if(account){this.bannedAccounts.delete(account);this.bannedAccounts.set(account,Date.now());if(this.bannedAccounts.size>MAX_TOKENS)this.bannedAccounts.delete(this.bannedAccounts.keys().next().value);this.issued.delete(account);}
    for(const p of [...this.peers.values()])if(p===to||account&&p.account===account&&p!==peer){this.banned.add(p.token);this.shut(p,CLOSE.kicked,'Removido pelo anfitrião');}
    return;
   }
   case 'pong':if(to)this.send(to,m);return;
   case 'bye':peer.bye=true;this.shut(peer,1000,'Saiu');return;
   // (the room's answer comes later: the lobby is asked first; the checks wait for it)
   case 'online':return this.online(peer);
   case 'convidar':return this.invite(peer,m);
   case 'desconvidar':return this.uninvite(peer,m);
   // (the host's lobby says whether its race is under way: how long its place waits, gone)
   case 'lobby':this.racing=m.race?.state==='racing';this.toGuests(this.named(m));return;
   case 'go':this.toGuests(this.named(m));return;
   default:this.toGuests(m);
  }
 }
 // The pilots' names in the host's word are their accounts' (a host's game cannot race anyone under
 // another name): its own, its list's, its race's seats.
 named(m){
  const names=new Map([...this.tokens.values()].map(e=>[e.id,e.name]));
  const fix=list=>Array.isArray(list)?list.map(p=>p&&typeof p==='object'&&names.get(p.id)?{...p,name:names.get(p.id)}:p):list;
  if(m.t==='lobby'){m.name=names.get(m.from)??m.name;m.players=fix(m.players);if(m.race&&typeof m.race==='object')m.race={...m.race,seats:fix(m.race.seats)};}
  else m.seats=fix(m.seats);
  return m;
 }
 // The chat: from anyone let in (the host too), cleaned (chatText), no links, no more than CHAT_BURST lines per
 // CHAT_WINDOW (more are dropped), to everyone else let in, under the sender's id and account name.
 chat(peer,m){
  if(!this.tokens.get(peer.token)?.admitted)return;
  const now=Date.now(),pace=peer.chat??={since:now,count:0};
  if(now-pace.since>=CHAT_WINDOW){pace.since=now;pace.count=0;}
  if(++pace.count>CHAT_BURST)return;
  const text=chatText(m.text);if(!text||chatLink(text))return;
  const data=JSON.stringify({t:'chat',from:peer.id,name:peer.name,text});
  for(const p of this.peers.values())if(p!==peer&&this.tokens.get(p.token)?.admitted){try{p.socket.send(data);}catch{}}
 }
 // What the lobby says (path: /interno/…; body: JSON); null when it does not answer.
 async lobby(path,body){
  try{const r=await this.env.SAGUAO.get(this.env.SAGUAO.idFromName('saguao'),{locationHint:'sam'}).fetch('https://saguao'+path,body?{method:'POST',body:JSON.stringify(body)}:{});return r.ok?await r.json():null;}catch{return null;}
 }
 // The host asks who is online (for its invitations): pilots signed in with the game open, but not those
 // already in this room nor those kicked from it.
 async online(peer){
  const now=Date.now();if(now-(this.onlineAt??-Infinity)<ONLINE_EVERY)return;this.onlineAt=now;
  const list=await this.lobby('/interno/online');
  if(this.peers.get(this.hostId)!==peer||!Array.isArray(list))return;
  const here=new Set([...this.peers.values()].map(p=>p.account));
  // (convidado: one with an invitation it has not taken yet, which the host may still cancel)
  const pending=account=>{const o=this.issued.get(account);return !!o&&!o.used&&now-o.at<INVITE_LIFE;};
  this.send(peer,{t:'online',pilotos:list.filter(p=>!here.has(p.conta)&&!this.bannedAccounts.has(p.conta)).slice(0,ONLINE_MAX).map(p=>({conta:p.conta,nome:p.nome,...(pending(p.conta)&&{convidado:true})}))});
 }
 // The host invites a pilot (conta: as the lobby listed it) to this room, by the address it opened
 // (endereco: the room's name as written, its secret too: the room is the same once read as a name). The
 // invitation goes to every page of that account; the host hears whether one got it.
 async invite(peer,m){
  const account=typeof m.conta==='string'&&ACCOUNT.test(m.conta)?m.conta:null,address=typeof m.endereco==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(m.endereco)?m.endereco:null;
  if(!account||!address||address.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24)!==this.name||this.bannedAccounts.has(account))return;
  const now=Date.now();
  this.invited=(this.invited??[]).filter(x=>now-x.at<60000);
  // (too soon: the host hears so, its button is given back)
  if(this.invited.length>=INVITES_PER_MINUTE||this.invited.some(x=>x.account===account&&now-x.at<INVITE_AGAIN)){this.send(peer,{t:'convidado',conta:account,entregue:false,cedo:true});return;}
  this.invited.push({account,at:now});
  // (a new one takes the place of that pilot's last; the oldest go past MAX_INVITES)
  const id=hex(8);this.issued.delete(account);this.issued.set(account,{id,at:now,used:false});
  while(this.issued.size>MAX_INVITES)this.issued.delete(this.issued.keys().next().value);
  const convite=await makeInvite(this.env.SALA_PASSE,{account,room:this.name,host:peer.name,id});
  const r=await this.lobby('/interno/convite',{conta:account,de:peer.name,sala:address,convite,id});
  this.send(peer,{t:'convidado',conta:account,entregue:(r?.entregue??0)>0});
 }
 // The host cancels an invitation not taken yet (a wrong pilot invited): the room forgets it, so it lets
 // nobody in, and that pilot's pages hear so (the notice goes). One already taken is not cancelled: that
 // pilot is in the room (the host may kick).
 async uninvite(peer,m){
  const account=typeof m.conta==='string'&&ACCOUNT.test(m.conta)?m.conta:null,offer=account?this.issued.get(account):null;
  if(!account)return;
  const ok=!!offer&&!offer.used;
  if(ok){this.issued.delete(account);await this.lobby('/interno/cancelado',{conta:account,id:offer.id});}
  if(this.peers.get(this.hostId)===peer)this.send(peer,{t:'desconvidado',conta:account,ok});
 }
 toHost(m){const host=this.peers.get(this.hostId);if(host)this.send(host,m);}
 toGuests(m){const data=JSON.stringify(m);for(const p of this.peers.values())if(p.id!==this.hostId&&this.tokens.get(p.token)?.admitted){try{p.socket.send(data);}catch{}}}
 // Everyone in the room but one, those at the door too.
 toOthers(but,m){const data=JSON.stringify(m);for(const p of this.peers.values())if(p!==but){try{p.socket.send(data);}catch{}}}
 // Once per socket the Porteiro counted (its word was livre): past its key, wrong (failed), or gone
 // before it. Not waited for: the room goes on whatever the Porteiro is doing.
 settle(peer,failed=false){if(peer.gate!=='livre'||peer.settled)return;peer.settled=true;porteiro(this.env,failed?'erro':'saida',peer.ip);}
 gone(peer){
  clearTimeout(peer.authTimer);
  this.pending.delete(peer);this.settle(peer);
  if(!peer.id||this.peers.get(peer.id)!==peer)return;
  this.peers.delete(peer.id);
  const entry=this.tokens.get(peer.token);if(entry)entry.lastSeen=Date.now();
  if(peer.id!==this.hostId){this.toHost({t:'bye',from:peer.id});return;}
  // The host left (a reload, or its line dropped): its guests wait for it before one of them hosts,
  // a long while when its line dropped in the middle of its race.
  this.toGuests({t:'host-away'});
  clearTimeout(this.hostAwayTimer);
  this.hostAwayTimer=setTimeout(()=>{
   this.hostAwayTimer=null;if(this.peers.has(this.hostId))return;
   // Only someone with the host's password takes its place: a guest the host let in, the one there
   // longest, else one at the door (it could open the room by itself anyway). With nobody like that,
   // the room waits without a host until one comes (the host back, too), and everyone in it hears so;
   // those at the door knock again for the new host.
   const since=p=>this.tokens.get(p.token)?.since??0,able=[...this.peers.values()].filter(p=>p.canHost).sort((a,b)=>since(a)-since(b));
   const next=able.find(p=>this.tokens.get(p.token)?.admitted)??able[0];
   this.hostId=null;this.hostToken=null;this.racing=false;
   if(!next){this.toOthers(null,{t:'host',id:null});return;}
   this.makeHost(next);this.send(next,{t:'role',role:'host'});this.toOthers(next,{t:'host',id:next.id});this.knocks();
  },this.racing&&!peer.bye?this.raceGrace:this.grace);
 }
}

// The lobby: who is online, for the hosts' invitations. Every page of a pilot signed in with a
// nickname keeps one line here (its pass for LOBBY first, else it is closed). Hibernating (the WebSocket
// Hibernation API): an idle line costs nothing, its echo is answered by the runtime itself, and what a
// line is (its account, its name, its IP) lives in its attachment, so it outlives a hibernation. Only the
// rooms ask it anything (a room's host, through its room: Sala online, invite): who is online, and to hand
// an invitation to every page of one account. A page says nothing here but its pass and its echo.
export class Saguao {
 constructor(state,env){
  this.state=state;this.env=env;
  try{state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"eco"}','{"t":"eco"}'));}catch{}
 }
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/interno/online')return Response.json(this.online());
  if(url.pathname==='/interno/convite')return Response.json({entregue:this.deliver(await request.json().catch(()=>null))});
  if(url.pathname==='/interno/cancelado')return Response.json({entregue:this.cancelled(await request.json().catch(()=>null))});
  if(request.headers.get('Upgrade')!=='websocket')return new Response('Esperava WebSocket',{status:426});
  const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'local';this.sweep(now);
  const lines=this.state.getWebSockets();
  if(lines.length>=LOBBY_MAX||lines.filter(s=>this.of(s).ip===ip).length>=LOBBY_PER_IP)return new Response('Saguão cheio',{status:503});
  const [client,socket]=Object.values(new WebSocketPair());
  this.state.acceptWebSocket(socket);socket.serializeAttachment({since:now,ip});
  return new Response(null,{status:101,webSocket:client});
 }
 of(s){try{return s.deserializeAttachment()??{};}catch{return {};}}
 async webSocketMessage(ws,data){
  const a=this.of(ws);
  if(typeof data!=='string'||data.length>2048){this.close(ws,CLOSE.flood,'Mensagem grande demais');return;}
  if(a.account||a.authing)return;
  let m;try{m=JSON.parse(data);}catch{m=null;}
  if(m?.t!=='auth'){this.close(ws,1008,'Esperava a conta');return;}
  if(!secretReady(this.env.SALA_PASSE)){this.close(ws,CLOSE.off,'Salas desligadas');return;}
  ws.serializeAttachment({...a,authing:true});
  const who=await readPass(this.env.SALA_PASSE,m.passe,{room:LOBBY});
  if(!who){this.close(ws,CLOSE.account,'Entre com a sua conta');return;}
  const mine=this.state.getWebSockets().filter(s=>s!==ws&&this.of(s).account===who.account).sort((x,y)=>this.of(x).since-this.of(y).since);
  while(mine.length>=LOBBY_TABS)this.close(mine.shift(),CLOSE.elsewhere,'Aberto em outra aba');
  ws.serializeAttachment({since:a.since,ip:a.ip,account:who.account,name:who.name});
  try{ws.send(JSON.stringify({t:'welcome'}));}catch{}
 }
 webSocketClose(ws){this.close(ws,1000,'Saiu');}
 webSocketError(ws){this.close(ws,1011,'Erro na conexão');}
 close(ws,code,reason){try{ws.close(code,reason);}catch{}}
 // Lines that never showed their pass in time go (looked at whenever another one comes).
 sweep(now){for(const s of this.state.getWebSockets()){const a=this.of(s);if(!a.account&&now-(a.since??0)>AUTH_WAIT)this.close(s,CLOSE.late,'Sem conta a tempo');}}
 // Each account online once: {conta, nome}.
 online(){const seen=new Map();for(const s of this.state.getWebSockets()){const a=this.of(s);if(a.account&&!seen.has(a.account))seen.set(a.account,{conta:a.account,nome:a.name});}return [...seen.values()];}
 // An invitation to every page of that account; how many got it.
 deliver(m){
  if(!m||typeof m.conta!=='string'||!ACCOUNT.test(m.conta)||typeof m.convite!=='string'||typeof m.sala!=='string'||typeof m.de!=='string'||!INVITE_ID.test(m.id??''))return 0;
  return this.toAccount(m.conta,{t:'convite',de:m.de,sala:m.sala,convite:m.convite,id:m.id});
 }
 // An invitation cancelled by its host: that account's pages put its notice away.
 cancelled(m){return m&&typeof m.conta==='string'&&ACCOUNT.test(m.conta)&&INVITE_ID.test(m.id??'')?this.toAccount(m.conta,{t:'convite-cancelado',id:m.id}):0;}
 toAccount(account,m){const data=JSON.stringify(m);let n=0;for(const s of this.state.getWebSockets())if(this.of(s).account===account){try{s.send(data);n++;}catch{}}return n;}
}
