// Security regressions against the actual room class; sockets and time are local test fixtures.
import assert from 'node:assert/strict';
import {Sala,Porteiro,CLOSE} from '../src/index.js';
const KEY='fixture-only',IP='192.0.2.1';
const rooms=[];
const make=(env={})=>{const r=new Sala({}, {CHAVE_GRUPO:KEY,...env});rooms.push(r);return r;};
// gate: the Porteiro's word the Worker would have put on this socket (none: the room's own limits only).
function socketFor(ip,gate){const messages=[],closed=[];return {messages,closed,peer:{ip,gate,id:null,token:null,authed:false,window:{since:Date.now(),messages:0,bytes:0,over:0},socket:{send:data=>messages.push(JSON.parse(data)),close:code=>closed.push(code)}}};}
function connect(room,{ip=IP,key=KEY,token=null,name='Piloto',gate=null}={}){
 const c=socketFor(ip,gate);
 room.message(c.peer,JSON.stringify({t:'auth',key,token,name}));
 return c;
}
const originalNow=Date.now;
try{
 // Wrong credentials throttle only their source. A known identity can still reconnect from a
 // shared IP, with both its token and the right key; the token alone is never enough.
 {
  const room=make(),host=connect(room);
  for(let i=0;i<20;i++)assert.equal(connect(room,{key:'wrong'}).closed[0],CLOSE.key);
  assert.equal(connect(room,{key:'wrong'}).closed[0],CLOSE.busy);
  assert.equal(connect(room).closed[0],CLOSE.busy,'a new identity on the offending IP waits');
  assert(connect(room,{ip:'192.0.2.2'}).peer.authed,'another IP still enters');
  assert.equal(connect(room,{token:host.peer.token,key:'wrong'}).closed[0],CLOSE.busy);
  assert(connect(room,{token:host.peer.token}).peer.authed,'valid identity reconnects even on shared IP');
  const t=originalNow();Date.now=()=>t+61000;
  assert(connect(room).peer.authed,'cooldown expires');Date.now=originalNow;
 }
 // An inactive token consumes capacity, just like a new guest. A live replacement does not.
 {
  const room=make(),host=connect(room),tokens=[];
  // (each let in by the host: the door's own limit is checked below)
  for(let i=0;i<24;i++){const g=connect(room);room.fromHost(host.peer,{t:'admit',to:g.peer.id});tokens.push(g.peer.token);room.gone(g.peer);}
  const guests=tokens.map(token=>connect(room,{token}));
  assert.equal(room.peers.size,19);
  assert.equal(guests.filter(g=>g.peer.authed).length,18);
  assert(guests.slice(18).every(g=>g.closed[0]===CLOSE.full));
  const replacement=connect(room,{token:host.peer.token});
  assert(replacement.peer.authed);assert.equal(room.peers.size,19);
  assert.equal(host.closed[0],CLOSE.elsewhere);
  room.message(host.peer,JSON.stringify({t:'config',porteiro:false}));
  assert.equal(room.porteiro,true,'replaced socket cannot keep acting as host');
  room.gone(replacement.peer);
  assert.equal(connect(room,{token:tokens[23]}).closed[0],CLOSE.full,'host place reserved in grace');
  const back=connect(room,{token:replacement.peer.token});
  assert(back.peer.authed);assert.equal(back.messages[0].role,'host');assert.equal(room.peers.size,19);
 }
 // History is bounded even when a key holder repeatedly comes and goes (or gets kicked).
 {
  const room=make(),host=connect(room);
  for(let i=0;i<300;i++){
   const guest=connect(room);assert(guest.peer.authed);
   room.fromHost(host.peer,{t:'kick',to:guest.peer.id});
  }
  assert.equal(room.tokens.size,256);assert(room.banned.size<=255);
  const last=[...room.banned].at(-1);
  assert.equal(connect(room,{token:last}).closed[0],CLOSE.kicked);
  const t=originalNow();Date.now=()=>t+24*60*60*1000+1;
  const fresh=connect(room,{token:last});
  assert(fresh.peer.authed);assert.equal(fresh.messages[0].pending,true,'expired identity asks admission again');
  assert.equal(room.tokens.size,2);assert.equal(room.banned.size,0);Date.now=originalNow;
 }
 // Malformed key/name objects never invoke attacker-supplied coercion or crash authentication.
 {
  const room=make();
  assert.equal(connect(room,{key:{toString:null}}).closed[0],CLOSE.key);
  const host=connect(room,{name:{toString:null}});assert.equal(host.peer.name,'Piloto');
  room.message(host.peer,JSON.stringify({t:'eco',text:'é'.repeat(9000)}));
  assert.equal(host.closed[0],CLOSE.flood,'the size limit counts UTF-8 bytes, not string characters');
 }
 // Per-source failures cannot grow an unbounded in-memory map.
 {
  const room=make();
  for(let i=0;i<1100;i++)connect(room,{ip:`fixture-${i}`,key:'wrong'});
  assert.equal(room.attempts.size,1024);
 }

 // Wrong keys count across every room (Porteiro): a new room name gives no fresh tries. Another IP
 // still enters; the minute passes; sockets waiting for their key are bounded per IP; memory too.
 {
  const gate=new Porteiro(),t=originalNow(),A='198.51.100.1',B='198.51.100.2';
  for(let i=0;i<20;i++){assert.equal(gate.answer('entrada',A,t),'livre');gate.answer('erro',A,t);}
  assert.equal(gate.answer('entrada',A,t),'bloqueado','20 wrong keys, in whatever rooms: the IP waits');
  assert.equal(gate.answer('entrada',B,t),'livre','another IP still enters');
  assert.equal(gate.answer('entrada',A,t+60001),'livre','the minute passes');
  const C='198.51.100.3';for(let i=0;i<21;i++)assert.equal(gate.answer('entrada',C,t),'livre');
  assert.equal(gate.answer('entrada',C,t),'cheio','21 sockets of one IP waiting for their key: the next tries again');
  gate.answer('saida',C,t);assert.equal(gate.answer('entrada',C,t),'livre','one past its key makes room');
  assert.equal(gate.answer('entrada',C,t+15001),'livre','a socket never heard of again stops counting');
  for(let i=0;i<5000;i++)gate.answer('entrada',`fixture-${i}`,t+20000);
  assert(gate.sources.size<=4096,'bounded memory');
  // The room takes its word: a new identity waits, a known one with its token and the key returns,
  // and a blocked IP learns nothing of its key (busy either way).
  const room=make(),host=connect(room);
  assert.equal(connect(room,{gate:'bloqueado'}).closed[0],CLOSE.busy);
  assert.equal(connect(room,{gate:'bloqueado',key:'wrong'}).closed[0],CLOSE.busy,'no word on the key while blocked');
  assert.equal(connect(room,{gate:'bloqueado',token:host.peer.token,key:'wrong'}).closed[0],CLOSE.busy);
  assert(connect(room,{gate:'bloqueado',token:host.peer.token}).peer.authed,'a known identity returns');
  // The room tells the Porteiro about each socket it counted, once: wrong, past its key, or gone.
  const told=[],env={PORTEIRO:{idFromName:n=>n,get:()=>({fetch:async url=>{told.push(new URL(url).pathname.slice(1));return new Response('ok');}})}};
  const counted=make(env),ana=connect(counted,{gate:'livre'});
  connect(counted,{gate:'livre',key:'wrong'});connect(counted,{gate:'bloqueado'});connect(counted,{gate:'cheio'});
  const idle=socketFor(IP,'livre');counted.gone(idle.peer);counted.gone(ana.peer);
  await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(told,['saida','erro','saida'],'livre sockets only, once each');
 }
 // Before the key, nothing but the key: anything else closes the socket.
 {
  const room=make();
  for(const data of [JSON.stringify({t:'eco'}),'not json',JSON.stringify([{t:'auth'}]),JSON.stringify({t:'hello',name:'x'})]){
   const c=socketFor(IP,null);room.message(c.peer,data);assert.equal(c.closed[0],1008,data);assert.equal(c.peer.authed,false);
  }
 }
 // The door: MAX_DOOR guests waiting at once, MAX_DOOR_PER_IP from one IP; one more tries again.
 // Those let in do not count; without the doorman nobody waits.
 {
  const room=make(),host=connect(room),door=[];
  for(let i=0;i<4;i++)door.push(connect(room));
  assert(door.every(c=>c.peer.authed&&c.messages[0].pending));
  assert.equal(connect(room).closed[0],CLOSE.door,'a fifth knock from the same IP waits');
  for(let i=0;i<6;i++)door.push(connect(room,{ip:`203.0.113.${i}`}));
  assert.equal(connect(room,{ip:'203.0.113.99'}).closed[0],CLOSE.door,'ten at the door: the next tries again');
  room.fromHost(host.peer,{t:'admit',to:door[0].peer.id});
  assert(connect(room,{ip:'203.0.113.99'}).peer.authed,'one let in makes room at the door');
  const same=connect(room,{token:door[1].peer.token});assert(same.peer.authed,'the same tab again keeps its place at the door');
  const open=make(),owner=connect(open);open.fromHost(owner.peer,{t:'config',porteiro:false});
  for(let i=0;i<12;i++)assert(connect(open).peer.authed,'without the doorman nobody waits at the door');
 }
 console.log('testar_seguranca: ok (IP throttling here and in every room, reconnect capacity, reserved host, bounded sessions, malformed auth, the key first, the door)');
}finally{Date.now=originalNow;for(const room of rooms)clearTimeout(room.hostAwayTimer);}
