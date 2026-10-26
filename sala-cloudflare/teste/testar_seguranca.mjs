// Security regressions against the actual room classes; sockets and time are local test fixtures. The
// passes and invitations are signed with a fixture secret here, as the accounts server signs them.
import assert from 'node:assert/strict';
import {Sala,Porteiro,Saguao,CLOSE,chatText,chatLink} from '../src/index.js';
import {makePass,accountKey,makeInvite,LOBBY} from '../src/passe.js';
const SECRET='segredo-de-teste-das-salas',HOST='anfitriao-fixture',PILOT='pilotos-fixture',IP='192.0.2.1',ROOM='teste';
const ENV={SALA_PASSE:SECRET,SENHA_ANFITRIAO:HOST,SENHA_PILOTOS:PILOT};
const rooms=[];
const make=(env={})=>{const r=new Sala({}, {...ENV,...env});r.name=ROOM;rooms.push(r);return r;};
// A pilot's pass (sub: the Google account; name: the nickname), for a room.
const pass=async(sub='g-ana',name='Ana',room=ROOM,now)=>makePass(SECRET,{account:await accountKey(SECRET,sub),name,room,now});
// gate: the Porteiro's word the Worker would have put on this socket (none: the room's own limits only).
function socketFor(ip,gate){const messages=[],closed=[];return {messages,closed,peer:{ip,gate,id:null,token:null,authed:false,window:{since:Date.now(),messages:0,bytes:0,over:0},socket:{send:data=>messages.push(JSON.parse(data)),close:code=>closed.push(code)}}};}
// A connection: the pass of `sub` (or the one given), its password, its token; resolved once the room answered.
async function connect(room,{ip=IP,key=HOST,token=null,sub,name,passe,convite,gate=null}={}){
 const c=socketFor(ip,gate);
 sub??=name?'g-'+name:'g-'+Math.random().toString(36).slice(2);name??='Piloto';
 await room.message(c.peer,JSON.stringify({t:'auth',key,token,passe:passe===undefined?await pass(sub,name):passe,...(convite&&{convite})}));
 return c;
}
const send=(room,c,m)=>room.message(c.peer,JSON.stringify(m));
const originalNow=Date.now;
try{
 // The account first: no pass, a forged one, another room's, an expired one, the lobby's: shut out
 // before any password is tried (and none of it counts as a wrong password).
 {
  const room=make();
  assert.equal((await connect(room,{passe:null})).closed[0],CLOSE.account,'no pass');
  const sound=await pass();
  assert.equal((await connect(room,{passe:sound.slice(0,-2)+(sound.endsWith('AA')?'BB':'AA')})).closed[0],CLOSE.account,'a signature changed');
  const [data,mac]=sound.split('.'),other=JSON.parse(Buffer.from(data,'base64url'));other.n='Outro';
  assert.equal((await connect(room,{passe:Buffer.from(JSON.stringify(other)).toString('base64url')+'.'+mac})).closed[0],CLOSE.account,'its words changed');
  assert.equal((await connect(room,{passe:await pass('g-ana','Ana','outra-sala')})).closed[0],CLOSE.account,'another room\'s');
  assert.equal((await connect(room,{passe:await pass('g-ana','Ana',ROOM,originalNow()-6*60000)})).closed[0],CLOSE.account,'expired');
  assert.equal((await connect(room,{passe:await pass('g-ana','Ana',LOBBY)})).closed[0],CLOSE.account,'the lobby\'s pass opens no room');
  assert.equal((await connect(room,{passe:await makePass('outro-segredo-qualquer',{account:await accountKey(SECRET,'g-x'),name:'X',room:ROOM})})).closed[0],CLOSE.account,'another secret');
  assert.equal(room.attempts.size,0,'no wrong password counted');
  assert.equal((await connect(make({SALA_PASSE:undefined}))).closed[0],CLOSE.account,'a server without the secret lets nobody in');
 }
 // The passwords: only the host's opens a room; the pilots' enters one someone opened (at the door,
 // knocking under the account's nickname); a room nobody opened keeps them at the door, and the first
 // with the host's password to come hosts it and hears their knocks. Wrong, or none set: shut out.
 {
  const room=make();
  const bia=await connect(room,{key:PILOT,name:'Bia'});
  assert.equal(bia.messages[0].role,'guest');assert.equal(bia.messages[0].host,null,'nobody hosts yet');assert.equal(bia.messages[0].pending,true);
  assert.equal(room.hostId,null,'the pilots\' password opens no room');
  const ana=await connect(room,{key:HOST,name:'Ana'});
  assert.equal(ana.messages[0].role,'host');
  assert.deepEqual(ana.messages.filter(m=>m.t==='knock').map(m=>m.name),['Bia'],'the new host hears who waits');
  assert(bia.messages.some(m=>m.t==='host'&&m.id===ana.peer.id),'those at the door hear who hosts now');
  send(room,ana,{t:'admit',to:bia.peer.id});assert.deepEqual(bia.messages.at(-1),{t:'admitted',host:ana.peer.id},'let in, with whose room it is');
  assert.equal((await connect(room,{key:'errada'})).closed[0],CLOSE.key);
  assert.equal((await connect(room,{key:''})).closed[0],CLOSE.key);
  assert.equal((await connect(make({SENHA_ANFITRIAO:undefined,SENHA_PILOTOS:undefined}),{key:''})).closed[0],CLOSE.key,'no passwords set: nobody gets in');
  // The same tab with the other kind of password is someone new.
  const again=await connect(room,{key:HOST,name:'Bia',token:bia.peer.token});assert.notEqual(again.peer.id,bia.peer.id);assert.equal(again.messages[0].pending,true);
 }
 // Names are the accounts': the knock, a guest's hello, the host's lobby (its own name, its list, its
 // race's seats) and its start, whatever the games write.
 {
  const room=make(),ana=await connect(room,{name:'Ana'}),bia=await connect(room,{key:PILOT,name:'Bia‮​'});
  assert.equal(ana.messages.find(m=>m.t==='knock').name,'Bia','cleaned');
  send(room,ana,{t:'admit',to:bia.peer.id});
  send(room,bia,{t:'hello',name:'Ana',want:null});assert.equal(ana.messages.at(-1).name,'Bia','a guest cannot say it is another');
  send(room,ana,{t:'lobby',name:'Rei',age:1,players:[{id:ana.peer.id,name:'Rei'},{id:bia.peer.id,name:'Boba'}],race:{state:'waiting',seats:[{id:bia.peer.id,name:'Boba',number:'64'}]}});
  const lobby=bia.messages.at(-1);assert.equal(lobby.name,'Ana');assert.deepEqual(lobby.players.map(p=>p.name),['Ana','Bia']);assert.equal(lobby.race.seats[0].name,'Bia');
  send(room,ana,{t:'go',race:'00000001',seats:[{id:bia.peer.id,name:'Boba',number:'64'}]});assert.equal(bia.messages.at(-1).seats[0].name,'Bia');
 }
 // A kick keeps the account out of the room, from any tab (a new tab too); not the host's own account
 // (a second tab of its own goes alone).
 {
  const room=make(),ana=await connect(room,{sub:'g-ana',name:'Ana'});
  const caio=await connect(room,{key:PILOT,sub:'g-caio',name:'Caio'}),caio2=await connect(room,{key:PILOT,sub:'g-caio',name:'Caio'});
  send(room,ana,{t:'kick',to:caio.peer.id});
  assert.equal(caio.closed[0],CLOSE.kicked);assert.equal(caio2.closed[0],CLOSE.kicked,'its other tab goes too');
  assert.equal((await connect(room,{key:PILOT,sub:'g-caio',name:'Caio'})).closed[0],CLOSE.kicked,'and a new one stays out');
  assert((await connect(room,{key:PILOT,sub:'g-dora',name:'Dora'})).peer.authed,'another account still knocks');
  const twin=await connect(room,{key:HOST,sub:'g-ana',name:'Ana'});send(room,ana,{t:'kick',to:twin.peer.id});
  assert.equal(twin.closed[0],CLOSE.kicked);assert(!ana.closed.length,'the host stays');
  assert((await connect(room,{key:HOST,sub:'g-ana',name:'Ana',token:ana.peer.token})).peer.authed,'and its account is not kept out');
 }
 // The handover: only someone with the host's password takes the room, a guest let in first, else one
 // at the door; nobody: the room waits without a host and everyone in it hears so.
 {
  const room=make({HOST_GRACE_MS:5}),ana=await connect(room,{name:'Ana'});
  const bia=await connect(room,{key:PILOT,name:'Bia'}),caio=await connect(room,{key:HOST,name:'Caio'});
  send(room,ana,{t:'admit',to:bia.peer.id});
  room.gone(ana.peer);await new Promise(r=>setTimeout(r,30));
  assert.equal(room.hostId,caio.peer.id,'one at the door with the host\'s password takes a room nobody let in could');
  assert(caio.messages.some(m=>m.t==='role'));assert(bia.messages.some(m=>m.t==='host'&&m.id===caio.peer.id));
  room.gone(caio.peer);await new Promise(r=>setTimeout(r,30));
  assert.equal(room.hostId,null,'only the pilots\' password left: no host');assert(bia.messages.some(m=>m.t==='host'&&m.id===null));
 }
 // The chat: only those let in; cleaned; no links; its own pace; to everyone else let in, under the
 // account's name and the server's id.
 {
  const room=make(),ana=await connect(room,{name:'Ana'}),bia=await connect(room,{key:PILOT,name:'Bia'}),door=await connect(room,{key:PILOT,name:'Dora'});
  send(room,ana,{t:'admit',to:bia.peer.id});
  const heard=c=>c.messages.filter(m=>m.t==='chat');
  send(room,door,{t:'chat',text:'oi da porta'});assert.equal(heard(ana).length,0,'not from the door');
  send(room,bia,{t:'chat',text:' oi‮​  galera\n',name:'Ana',from:ana.peer.id});
  assert.deepEqual(heard(ana)[0],{t:'chat',from:bia.peer.id,name:'Bia',text:'oi galera'});assert.equal(heard(bia).length,0,'not back to the sender');assert.equal(heard(door).length,0,'nor to the door');
  for(const text of ['entra em site.com','http://x','www ponto'])send(room,bia,{t:'chat',text});
  assert.equal(heard(ana).length,1,'no links');
  for(let i=0;i<6;i++)send(room,ana,{t:'chat',text:'linha '+i});
  assert.equal(heard(bia).length,4,'four lines per window of time; more are dropped');
  send(room,ana,{t:'chat',text:'x'.repeat(500)});assert.equal(heard(bia).length,4);
  room.message(ana.peer,JSON.stringify({t:'chat',text:{toString:null}}));
  assert.equal(chatText('a'.repeat(300)).length,80);assert.equal([...chatText('😀'.repeat(90))].length,80);assert.equal(chatText('ㅤ⠀'),'');
  assert(chatLink('ｓｉｔｅ．ｃｏｍ')&&chatLink('sïte.cóm')&&!chatLink('Bom. Com certeza'));
 }
 // Invitations: the host asks who is online (through the lobby; not those in its room, nor the kicked)
 // and invites one; the invitation, this room's for that account, lets it in without a password and
 // without the door. Another account's, another room's, an expired one: worth nothing.
 {
  const delivered=[],lobbyList=[];
  const lobby={idFromName:n=>n,get:()=>({fetch:async(url,init)=>{const path=new URL(url).pathname;if(path==='/interno/online')return Response.json(lobbyList);delivered.push(JSON.parse(init.body));return Response.json({entregue:1});}})};
  const room=make({SAGUAO:lobby}),ana=await connect(room,{sub:'g-ana',name:'Ana'}),eva=await accountKey(SECRET,'g-eva'),kicked=await connect(room,{key:PILOT,sub:'g-kim',name:'Kim'});
  send(room,ana,{t:'kick',to:kicked.peer.id});
  lobbyList.push({conta:await accountKey(SECRET,'g-ana'),nome:'Ana'},{conta:eva,nome:'Eva'},{conta:await accountKey(SECRET,'g-kim'),nome:'Kim'});
  await send(room,ana,{t:'online'});
  assert.deepEqual(ana.messages.find(m=>m.t==='online').pilotos.map(p=>p.nome),['Eva'],'not the host itself, nor the kicked');
  await send(room,ana,{t:'online'});assert.equal(ana.messages.filter(m=>m.t==='online').length,1,'asked again too soon: nothing');
  await send(room,ana,{t:'convidar',conta:eva,endereco:'outra_sala'});assert.equal(delivered.length,0,'only to this room');
  await send(room,ana,{t:'convidar',conta:eva,endereco:'Te_ste'});
  assert.equal(delivered.length,1);assert.deepEqual(ana.messages.at(-1),{t:'convidado',conta:eva,entregue:true});
  assert.equal(delivered[0].sala,'Te_ste');assert.equal(delivered[0].de,'Ana');
  await send(room,ana,{t:'convidar',conta:eva,endereco:ROOM});assert.equal(delivered.length,1,'the same pilot again only after a while');
  const bia=await connect(room,{key:PILOT,sub:'g-bia'});send(room,ana,{t:'admit',to:bia.peer.id});
  await send(room,bia,{t:'convidar',conta:await accountKey(SECRET,'g-fil'),endereco:ROOM});await send(room,bia,{t:'online'});
  assert.equal(delivered.length,1,'a guest invites nobody');assert.equal(bia.messages.filter(m=>m.t==='online').length,0,'nor sees who is online');
  const invite=delivered[0].convite;
  const evaIn=await connect(room,{key:'',sub:'g-eva',name:'Eva',convite:invite});
  assert.equal(evaIn.messages[0].pending,false,'invited: in, no password, no door');assert.equal(evaIn.messages[0].role,'guest');
  assert.equal((await connect(room,{key:'',sub:'g-zeca',convite:invite})).closed[0],CLOSE.key,'another account\'s invitation is nothing');
  const elsewhere=make();elsewhere.name='outra';
  assert.equal((await connect(elsewhere,{key:'',passe:await pass('g-eva','Eva','outra'),convite:invite})).closed[0],CLOSE.key,'nor in another room');
  const old=await makeInvite(SECRET,{account:eva,room:ROOM,host:'Ana',now:originalNow()-13*3600000});
  assert.equal((await connect(room,{key:'',sub:'g-eva',convite:old})).closed[0],CLOSE.key,'nor once it ran out');
  const kim=await makeInvite(SECRET,{account:await accountKey(SECRET,'g-kim'),room:ROOM,host:'Ana'});
  assert.equal((await connect(room,{key:'',sub:'g-kim',convite:kim})).closed[0],CLOSE.kicked,'a kicked account stays out, invited or not');
 }
 // The lobby (Saguão): its lines show their pass for LOBBY first; who is online once per account; an
 // invitation reaches every page of that account; bounded per IP and per account.
 {
  const sockets=[];
  const state={acceptWebSocket:s=>sockets.push(s),getWebSockets:()=>sockets.filter(s=>!s.closed),setWebSocketAutoResponse(){}};
  globalThis.WebSocketPair??=class{constructor(){const mk=()=>{const s={sent:[],attachment:null,closed:null,send:d=>s.sent.push(JSON.parse(d)),close:code=>{s.closed=code;},serializeAttachment:a=>{s.attachment=structuredClone(a);},deserializeAttachment:()=>s.attachment};return s;};this[0]=mk();this[1]=mk();}};
  const lobby=new Saguao(state,{SALA_PASSE:SECRET});
  const open=async(ip='198.51.100.9')=>{const r=await lobby.fetch(new Request('https://saguao/saguao',{headers:{Upgrade:'websocket','CF-Connecting-IP':ip}}));return r.status===503?null:sockets.at(-1);};
  // (status 101 cannot be built in plain Node: the room's own Response is what matters there)
  const line=async(sub,name,ip)=>{let s;try{s=await open(ip);}catch{s=sockets.at(-1);}await lobby.webSocketMessage(s,JSON.stringify({t:'auth',passe:await pass(sub,name,LOBBY)}));return s;};
  const a=await line('g-ana','Ana'),a2=await line('g-ana','Ana'),b=await line('g-bia','Bia');
  assert.deepEqual(a.sent,[{t:'welcome'}]);
  assert.deepEqual(lobby.online().map(p=>p.nome),['Ana','Bia'],'once per account');
  const roomPass=await line('g-caio','Caio');
  let s;try{s=await open();}catch{s=sockets.at(-1);}await lobby.webSocketMessage(s,JSON.stringify({t:'auth',passe:await pass('g-caio','Caio',ROOM)}));
  assert.equal(s.closed,CLOSE.account,'a room\'s pass is not the lobby\'s');
  try{s=await open();}catch{s=sockets.at(-1);}await lobby.webSocketMessage(s,JSON.stringify({t:'chat',text:'oi'}));assert.equal(s.closed,1008,'nothing before the pass');
  const ana=await accountKey(SECRET,'g-ana');
  assert.equal(lobby.deliver({conta:ana,de:'Bia',sala:'teste',convite:'x.y'}),2,'every page of that account');
  assert.equal(a2.sent.at(-1).t,'convite');assert.equal(b.sent.length,1,'nobody else');
  assert.equal(lobby.deliver({conta:'nada',de:'x',sala:'y',convite:'z'}),0);
  for(let i=0;i<4;i++)await line('g-zeca','Zeca','203.0.113.1');
  assert.equal(sockets.filter(x=>!x.closed&&x.attachment?.account===(sockets.at(-1).attachment.account)).length,4,'four pages of one account at most');
  await line('g-zeca','Zeca','203.0.113.1');assert(sockets.filter(x=>x.closed===CLOSE.elsewhere).length>=1,'the oldest gives way');
  void roomPass;
 }

 // Wrong passwords throttle only their source. A known identity can still reconnect from a
 // shared IP, with its token, its pass and a right password; the token alone is never enough.
 {
  const room=make(),host=await connect(room,{sub:'g-host'});
  for(let i=0;i<20;i++)assert.equal((await connect(room,{key:'wrong'})).closed[0],CLOSE.key);
  assert.equal((await connect(room,{key:'wrong'})).closed[0],CLOSE.busy);
  assert.equal((await connect(room)).closed[0],CLOSE.busy,'a new identity on the offending IP waits');
  assert((await connect(room,{ip:'192.0.2.2'})).peer.authed,'another IP still enters');
  assert.equal((await connect(room,{token:host.peer.token,sub:'g-host',key:'wrong'})).closed[0],CLOSE.busy);
  assert.equal((await connect(room,{token:host.peer.token,sub:'g-outro'})).closed[0],CLOSE.busy,'another account\'s pass with the token: no');
  assert((await connect(room,{token:host.peer.token,sub:'g-host'})).peer.authed,'valid identity reconnects even on shared IP');
  const t=originalNow();Date.now=()=>t+61000;
  assert((await connect(room)).peer.authed,'cooldown expires');Date.now=originalNow;
 }
 // An inactive token consumes capacity, just like a new guest. A live replacement does not.
 {
  const room=make(),host=await connect(room,{sub:'g-host'}),tokens=[];
  // (each let in by the host: the door's own limit is checked below)
  for(let i=0;i<24;i++){const g=await connect(room,{sub:'g-p'+i});room.fromHost(host.peer,{t:'admit',to:g.peer.id});tokens.push(g.peer.token);room.gone(g.peer);}
  const guests=[];for(const [i,token] of tokens.entries())guests.push(await connect(room,{token,sub:'g-p'+i}));
  assert.equal(room.peers.size,19);
  assert.equal(guests.filter(g=>g.peer.authed).length,18);
  assert(guests.slice(18).every(g=>g.closed[0]===CLOSE.full));
  const replacement=await connect(room,{token:host.peer.token,sub:'g-host'});
  assert(replacement.peer.authed);assert.equal(room.peers.size,19);
  assert.equal(host.closed[0],CLOSE.elsewhere);
  room.message(host.peer,JSON.stringify({t:'config',porteiro:false}));
  assert.equal(room.porteiro,true,'replaced socket cannot keep acting as host');
  room.gone(replacement.peer);
  assert.equal((await connect(room,{token:tokens[23],sub:'g-p23'})).closed[0],CLOSE.full,'host place reserved in grace');
  const back=await connect(room,{token:replacement.peer.token,sub:'g-host'});
  assert(back.peer.authed);assert.equal(back.messages[0].role,'host');assert.equal(room.peers.size,19);
 }
 // History is bounded even when a password holder repeatedly comes and goes (or gets kicked).
 {
  const room=make(),host=await connect(room,{sub:'g-host'});
  for(let i=0;i<300;i++){
   const guest=await connect(room,{sub:'g-k'+i});assert(guest.peer.authed);
   room.fromHost(host.peer,{t:'kick',to:guest.peer.id});
  }
  assert.equal(room.tokens.size,256);assert(room.banned.size<=255);assert(room.bannedAccounts.size<=256);
  const last=[...room.banned].at(-1);
  assert.equal((await connect(room,{token:last,sub:'g-k299'})).closed[0],CLOSE.kicked);
  const t=originalNow();Date.now=()=>t+24*60*60*1000+1;
  const fresh=await connect(room,{token:last,sub:'g-k299',passe:await pass('g-k299','Piloto',ROOM,t+24*60*60*1000+1)});
  assert(fresh.peer.authed);assert.equal(fresh.messages[0].pending,true,'expired identity asks admission again');
  assert.equal(room.tokens.size,2);assert.equal(room.banned.size,0);Date.now=originalNow;
 }
 // Malformed key/pass objects never invoke attacker-supplied coercion or crash authentication.
 {
  const room=make();
  assert.equal((await connect(room,{key:{toString:null}})).closed[0],CLOSE.key);
  assert.equal((await connect(room,{passe:{toString:null}})).closed[0],CLOSE.account);
  assert.equal((await connect(room,{convite:{toString:null},key:''})).closed[0],CLOSE.key);
  const host=await connect(room);
  room.message(host.peer,JSON.stringify({t:'eco',text:'é'.repeat(9000)}));
  assert.equal(host.closed[0],CLOSE.flood,'the size limit counts UTF-8 bytes, not string characters');
 }
 // While its pass is being checked a socket says nothing more (an echo on its way is dropped, not
 // taken for the key); a second auth meanwhile is dropped too.
 {
  const room=make(),c=socketFor(IP,null),p=await pass('g-lia','Lia');
  const authing=room.message(c.peer,JSON.stringify({t:'auth',key:HOST,passe:p}));
  room.message(c.peer,JSON.stringify({t:'eco'}));room.message(c.peer,JSON.stringify({t:'auth',key:'wrong',passe:p}));
  await authing;assert(c.peer.authed);assert.equal(c.closed.length,0);assert.equal(room.attempts.size,0);
 }
 // Per-source failures cannot grow an unbounded in-memory map.
 {
  const room=make();
  for(let i=0;i<1100;i++)await connect(room,{ip:`fixture-${i}`,key:'wrong'});
  assert.equal(room.attempts.size,1024);
 }

 // Wrong passwords count across every room (Porteiro): a new room name gives no fresh tries. Another
 // IP still enters; the minute passes; sockets waiting for their key are bounded per IP; memory too.
 {
  const gate=new Porteiro(),t=originalNow(),A='198.51.100.1',B='198.51.100.2';
  for(let i=0;i<20;i++){assert.equal(gate.answer('entrada',A,t),'livre');gate.answer('erro',A,t);}
  assert.equal(gate.answer('entrada',A,t),'bloqueado','20 wrong passwords, in whatever rooms: the IP waits');
  assert.equal(gate.answer('entrada',B,t),'livre','another IP still enters');
  assert.equal(gate.answer('entrada',A,t+60001),'livre','the minute passes');
  const C='198.51.100.3';for(let i=0;i<21;i++)assert.equal(gate.answer('entrada',C,t),'livre');
  assert.equal(gate.answer('entrada',C,t),'cheio','21 sockets of one IP waiting for their key: the next tries again');
  gate.answer('saida',C,t);assert.equal(gate.answer('entrada',C,t),'livre','one past its key makes room');
  assert.equal(gate.answer('entrada',C,t+15001),'livre','a socket never heard of again stops counting');
  for(let i=0;i<5000;i++)gate.answer('entrada',`fixture-${i}`,t+20000);
  assert(gate.sources.size<=4096,'bounded memory');
  // The room takes its word: a new identity waits, a known one with its token and the password returns,
  // and a blocked IP learns nothing of its password (busy either way).
  const room=make(),host=await connect(room,{sub:'g-host'});
  assert.equal((await connect(room,{gate:'bloqueado'})).closed[0],CLOSE.busy);
  assert.equal((await connect(room,{gate:'bloqueado',key:'wrong'})).closed[0],CLOSE.busy,'no word on the password while blocked');
  assert.equal((await connect(room,{gate:'bloqueado',token:host.peer.token,sub:'g-host',key:'wrong'})).closed[0],CLOSE.busy);
  assert((await connect(room,{gate:'bloqueado',token:host.peer.token,sub:'g-host'})).peer.authed,'a known identity returns');
  // The room tells the Porteiro about each socket it counted, once: wrong, past its key, or gone.
  const told=[],env={PORTEIRO:{idFromName:n=>n,get:()=>({fetch:async url=>{told.push(new URL(url).pathname.slice(1));return new Response('ok');}})}};
  const counted=make(env),ana=await connect(counted,{gate:'livre'});
  await connect(counted,{gate:'livre',key:'wrong'});await connect(counted,{gate:'bloqueado'});await connect(counted,{gate:'cheio'});
  const idle=socketFor(IP,'livre');counted.gone(idle.peer);counted.gone(ana.peer);
  await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(told,['saida','erro','saida'],'livre sockets only, once each');
 }
 // Before the key, nothing but the key: anything else closes the socket.
 {
  const room=make();
  for(const data of [JSON.stringify({t:'eco'}),'not json',JSON.stringify([{t:'auth'}]),JSON.stringify({t:'hello',name:'x'})]){
   const c=socketFor(IP,null);await room.message(c.peer,data);assert.equal(c.closed[0],1008,data);assert.equal(c.peer.authed,false);
  }
 }
 // The door: MAX_DOOR guests waiting at once, MAX_DOOR_PER_IP from one IP or one account; one more
 // tries again. Those let in do not count; without the doorman nobody waits.
 {
  const room=make(),host=await connect(room),door=[];
  for(let i=0;i<4;i++)door.push(await connect(room));
  assert(door.every(c=>c.peer.authed&&c.messages[0].pending));
  assert.equal((await connect(room)).closed[0],CLOSE.door,'a fifth knock from the same IP waits');
  for(let i=0;i<6;i++)door.push(await connect(room,{ip:`203.0.113.${i}`}));
  assert.equal((await connect(room,{ip:'203.0.113.99'})).closed[0],CLOSE.door,'ten at the door: the next tries again');
  room.fromHost(host.peer,{t:'admit',to:door[0].peer.id});
  assert((await connect(room,{ip:'203.0.113.99'})).peer.authed,'one let in makes room at the door');
  const same=await connect(room,{token:door[1].peer.token,passe:null});assert.equal(same.closed[0],CLOSE.account);
  const hall=make(),owner=await connect(hall);
  for(let i=0;i<4;i++)await connect(hall,{ip:`198.18.0.${i}`,sub:'g-mesma'});
  assert.equal((await connect(hall,{ip:'198.18.0.9',sub:'g-mesma'})).closed[0],CLOSE.door,'one account knocking from many IPs: the fifth tries again');
  void owner;
  const open=make(),boss=await connect(open);open.fromHost(boss.peer,{t:'config',porteiro:false});
  for(let i=0;i<12;i++)assert((await connect(open)).peer.authed,'without the doorman nobody waits at the door');
 }
 console.log('testar_seguranca: ok (the account\'s pass, the two passwords, names from the accounts, kicks per account, the handover, the chat and its links, invitations, the lobby, IP throttling here and in every room, reconnect capacity, reserved host, bounded sessions, malformed auth, the key first, the door)');
}finally{Date.now=originalNow;for(const room of rooms)clearTimeout(room.hostAwayTimer);}
