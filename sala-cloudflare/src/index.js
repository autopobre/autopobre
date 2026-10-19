// Room server for Auto-Pobre Racing's multiplayer (teste/net-room.js, net-link.js). One Durable
// Object per room relays the room's messages over WebSockets, so the players' browsers only ever talk
// to Cloudflare: nobody sees another player's IP.
//
// What the server enforces, whatever a client sends:
// - the group key (secret CHAVE_GRUPO): without it nobody opens or enters a room;
// - the page's origin (ORIGENS): other sites cannot use it with their visitors' browsers;
// - who is who: every relayed message carries the sender's id as the server knows it (from);
// - roles: only the host sends the room's word (lobby, go, snap, pong) and it reaches the admitted
//   guests; guests' messages (hello, ready, state, ping, bye) reach the host only;
// - the doorman: a guest waits outside until the host admits it; the host can refuse or kick;
// - the line check: an echo the server answers itself, so a player's game can tell a dead connection;
// - limits: message size, messages and bytes per second per connection, players per room, guests
//   waiting at the door, nothing but the key before the key, failed keys per IP across every room
//   (Porteiro: a new room name gives no fresh tries; never a room-wide lockout).
// A tab keeps its token (sessionStorage): back within HOST_GRACE after a reload, a host hosts again
// and a guest keeps its id and its admission; a host that does not come back hands the room to the
// admitted guest that has been there longest (one still at the door never hosts). During a race (the
// host's lobby says so) a host whose line dropped (no goodbye: a reload or a closed tab says one, and
// its race is gone with its page) keeps its place
// for RACE_GRACE instead: its guests' game stands the race still until it is back (players' wish: a
// race on the host's machine, a championship's round, must never pass to another for a dropped line).
const MAX_PEERS=19;          // 15 seats and a few watching
const MAX_BYTES=16384;       // one message
const RATE_MESSAGES=90;      // per connection, per second
const RATE_BYTES=320000;     // per connection, per second
const OVER_LIMIT_CLOSE=3;    // seconds over the limit before the connection is closed
const AUTH_WAIT=10000;       // ms to present the key
const FAILS_PER_MINUTE=20;   // wrong keys per IP, in a room and in all of them, before that IP waits a minute
const MAX_AUTH_SOURCES=1024,MAX_PENDING=64,MAX_PENDING_PER_IP=MAX_PEERS+2;
const MAX_GATE_SOURCES=4096; // IPs the Porteiro remembers at once
const MAX_DOOR=10,MAX_DOOR_PER_IP=4; // guests waiting at the door at once, and from one IP
const TOKEN_TTL=24*60*60*1000,MAX_TOKENS=256; // bounded reconnect history; active identities are kept
const HOST_GRACE=15000;      // ms a host that left may take to come back (env HOST_GRACE_MS in tests)
const RACE_GRACE=600000;     // the same during a race (env RACE_GRACE_MS in tests)
const HOST_TYPES=new Set(['lobby','go','snap','pong','admit','deny','kick','config','bye']);
const GUEST_TYPES=new Set(['hello','ready','state','ping','bye']);
const ROOM=/^[a-z0-9-]{1,24}$/,ID=/^[0-9a-f]{8}$/,TOKEN=/^[0-9a-f]{32}$/;
// Close codes the game explains to the player (net-link.js); late (no key within AUTH_WAIT: a slow
// connection, not a wrong key) and door (the door is full: room is made as the host lets guests in)
// it just tries again, as it does a socket that sent something else before its key (1008).
export const CLOSE={key:4001,full:4002,denied:4003,kicked:4004,flood:4008,busy:4009,elsewhere:4010,origin:4011,late:4012,door:4013};
const hex=bytes=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const cleanName=value=>(typeof value==='string'?value:'').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,24)||'Piloto';
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
  this.tokens=new Map();       // token -> {id, token, admitted, since}: who has been in this room
  this.banned=new Set();       // kicked tokens, retained with their bounded token history
  this.pending=new Set();      // sockets that have not authenticated yet
  this.hostId=null;this.hostToken=null;this.hostAwayTimer=null;this.porteiro=true;this.racing=false;
  this.attempts=new Map();this.grace=Number(env.HOST_GRACE_MS)||HOST_GRACE;this.raceGrace=Number(env.RACE_GRACE_MS)||RACE_GRACE;this.authWait=Number(env.AUTH_WAIT_MS)||AUTH_WAIT;
 }
 async fetch(request){
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
  // Before the key, nothing but the key: the game sends it first, so anything else is not the game
  // (and a socket without the key costs the room one message, not a stream of them).
  if(!peer.authed){if(valid&&m.t==='auth')this.auth(peer,m);else this.shut(peer,1008,'Esperava a chave');return;}
  if(!valid)return;
  // The line check (net-room.js): answered here, whatever the host is doing; no answer for a few
  // seconds tells the player's game its connection is dead before the browser notices.
  if(m.t==='eco'){this.send(peer,{t:'eco'});return;}
  const host=peer.id===this.hostId;
  if(!(host?HOST_TYPES:GUEST_TYPES).has(m.t))return;
  m.from=peer.id;
  if(host)this.fromHost(peer,m);
  else{
   const entry=this.tokens.get(peer.token);
   if(m.t==='bye'){this.shut(peer,1000,'Saiu');return;}
   // A guest outside the door is only heard by the host through its knock (again, with the name it
   // typed while waiting).
   if(entry?.admitted)this.toHost(m);
   else if(m.t==='hello'){const name=cleanName(m.name);if(name!==peer.name){peer.name=name;this.toHost({t:'knock',id:peer.id,name});}}
  }
 }
 auth(peer,m){
  const now=Date.now();
  this.pruneTokens(now);
  const token=typeof m.token==='string'&&TOKEN.test(m.token)?m.token:null;
  let entry=token?this.tokens.get(token):null;
  const ip=peer.ip||'local';
  for(const [source,a] of this.attempts)if(now-a.since>=60000&&now>=a.until)this.attempts.delete(source);
  const attempt=this.attempts.get(ip);
  // An already authenticated identity may reconnect even behind the same NAT as a mistyping
  // player, but only with both its unguessable token and the current group key. The IP waits for
  // its wrong keys here or, the Porteiro says, in any room.
  if((peer.gate==='bloqueado'||attempt&&now<attempt.until)&&!(entry&&!this.banned.has(token)&&sameKey(m.key,this.env.CHAVE_GRUPO))){
   this.shut(peer,CLOSE.busy,'Tente de novo em um minuto');return;
  }
  if(!this.env.CHAVE_GRUPO||!sameKey(m.key,this.env.CHAVE_GRUPO)){
   const a=attempt&&now-attempt.since<60000?attempt:{since:now,count:0,until:0};
   if(++a.count>=FAILS_PER_MINUTE)a.until=now+60000;
   if(!this.attempts.has(ip)&&this.attempts.size>=MAX_AUTH_SOURCES)this.attempts.delete(this.attempts.keys().next().value);
   this.attempts.set(ip,a);
   this.settle(peer,true);this.shut(peer,CLOSE.key,'Chave errada');return;
  }
  if(token&&this.banned.has(token)){this.shut(peer,CLOSE.kicked,'Removido pelo anfitrião');return;}
  const old=entry?this.peers.get(entry.id):null;
  // The absent host's place remains reserved throughout its grace. Reusing an inactive token
  // consumes a place too; only replacing the same live identity leaves occupancy unchanged.
  const reserved=this.hostAwayTimer&&!this.peers.has(this.hostId)?1:0;
  const returningHost=reserved&&entry?.token===this.hostToken;
  if(!old&&this.peers.size+reserved>=MAX_PEERS&&!returningHost){this.shut(peer,CLOSE.full,'Sala cheia');return;}
  // The door holds MAX_DOOR guests at once, MAX_DOOR_PER_IP of them from one IP: one key holder
  // cannot fill the room with knocks. One more tries again (CLOSE.door) until the host lets some in.
  const hosts=!this.hostId||entry?.token===this.hostToken||!this.peers.has(this.hostId)&&!this.hostAwayTimer;
  if(!hosts&&this.porteiro&&!entry?.admitted){
   const door=[...this.peers.values()].filter(p=>p!==old&&p.id!==this.hostId&&!this.tokens.get(p.token)?.admitted);
   if(door.length>=MAX_DOOR||door.filter(p=>p.ip===ip).length>=MAX_DOOR_PER_IP){this.shut(peer,CLOSE.door,'Porta cheia');return;}
  }
  // The same tab again (a reload, or a duplicated tab): the newer connection keeps the identity.
  if(old&&old!==peer){this.peers.delete(entry.id);this.shut(old,CLOSE.elsewhere,'Aberta em outra aba');}
  if(!entry){this.pruneTokens(now,true);entry={id:this.newId(),token:hex(16),admitted:false,since:now};this.tokens.set(entry.token,entry);}
  entry.lastSeen=now;
  peer.token=entry.token;peer.id=entry.id;peer.name=cleanName(m.name);peer.authed=true;clearTimeout(peer.authTimer);
  this.pending.delete(peer);this.settle(peer);
  this.peers.set(peer.id,peer);
  // The first in an empty room hosts it; a host back within the grace takes it again.
  const hostBack=this.hostToken===peer.token;
  if(!this.hostId||hostBack||!this.peers.has(this.hostId)&&!this.hostAwayTimer){
   if(!hostBack&&this.hostId&&this.hostId!==peer.id)this.hostToken=null;
   this.makeHost(peer);
  }
  const role=peer.id===this.hostId?'host':'guest';
  if(role==='host')entry.admitted=true;else if(!this.porteiro)entry.admitted=true;
  this.send(peer,{t:'welcome',id:peer.id,token:peer.token,role,host:this.hostId,pending:!entry.admitted});
  if(hostBack)this.toGuests({t:'host',id:peer.id});
  if(role==='host')this.knocks();else if(!entry.admitted)this.toHost({t:'knock',id:peer.id,name:peer.name});
 }
 // Expire disconnected sessions and evict the oldest disconnected identity when the history is
 // full. A live peer or a host in its grace is never evicted. Kicks share this bounded lifetime;
 // an expired identity must ask the doorman again, just as after a room/server restart.
 pruneTokens(now,space=false){
  const inactive=[];
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
   case 'admit':{if(!to)return;const e=this.tokens.get(to.token);if(e&&!e.admitted){e.admitted=true;this.send(to,{t:'admitted'});}return;}
   // Refused: the room forgets that tab, so knocking again it is someone new (not one that has
   // waited since its first knock).
   case 'deny':if(to&&!this.tokens.get(to.token)?.admitted){this.tokens.delete(to.token);this.shut(to,CLOSE.denied,'Entrada recusada');}return;
   case 'kick':if(to&&to!==peer){this.banned.add(to.token);this.shut(to,CLOSE.kicked,'Removido pelo anfitrião');}return;
   case 'pong':if(to)this.send(to,m);return;
   case 'bye':peer.bye=true;this.shut(peer,1000,'Saiu');return;
   // (the host's lobby says whether its race is under way: how long its place waits, gone)
   case 'lobby':this.racing=m.race?.state==='racing';this.toGuests(m);return;
   default:this.toGuests(m);
  }
 }
 toHost(m){const host=this.peers.get(this.hostId);if(host)this.send(host,m);}
 toGuests(m){const data=JSON.stringify(m);for(const p of this.peers.values())if(p.id!==this.hostId&&this.tokens.get(p.token)?.admitted){try{p.socket.send(data);}catch{}}}
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
   // Only a guest the host let in takes its place: one at the door, however long it waited, would
   // get the room it was never let into. With nobody let in, the room has no host until someone
   // comes in (the host back, too); those at the door knock again for it.
   const next=[...this.peers.values()].filter(p=>this.tokens.get(p.token)?.admitted).sort((a,b)=>this.tokens.get(a.token).since-this.tokens.get(b.token).since)[0];
   this.hostId=null;this.hostToken=null;this.racing=false;if(!next)return;
   this.makeHost(next);this.send(next,{t:'role',role:'host'});this.toGuests({t:'host',id:next.id});this.knocks();
  },this.racing&&!peer.bye?this.raceGrace:this.grace);
 }
}
