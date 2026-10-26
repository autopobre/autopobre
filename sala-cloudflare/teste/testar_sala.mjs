// The room server (src/index.js) in Cloudflare's local runtime (wrangler dev, as in development):
// the account's pass, the two passwords, the origin, who is who, the roles, the doorman, the chat, the
// lobby and the invitations, the limits, a host's reload and its handover. Run: npm test (from
// sala-cloudflare). The fixture secret, passwords and origin below override local configuration; these
// checks never require a production credential. The passes are signed here as the accounts server signs them.
import assert from 'node:assert/strict';
import http from 'node:http';
import {startWrangler} from './wrangler-dev.mjs';
import {makePass,accountKey,LOBBY} from '../src/passe.js';
const PORT=8797,SECRET='passe-de-teste-da-sala-wrangler',KEY='anfitriao-de-teste-local',PILOT='pilotos-de-teste-local',ORIGIN='http://teste.local',GRACE=600,RACE_GRACE=2500,AUTH_WAIT=1500;
const wait=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const stop=await startWrangler({port:PORT,vars:{SALA_PASSE:SECRET,SENHA_ANFITRIAO:KEY,SENHA_PILOTOS:PILOT,ORIGENS:ORIGIN,HOST_GRACE_MS:GRACE,RACE_GRACE_MS:RACE_GRACE,AUTH_WAIT_MS:AUTH_WAIT}});
// A pilot's pass for a room (or the lobby): its account from its Google id (sub), its nickname.
const pass=async(room,name,sub='g-'+name)=>makePass(SECRET,{account:await accountKey(SECRET,sub),name,room});
let rooms=0;const fresh=()=>'sala-'+(++rooms)+'-'+Math.random().toString(36).slice(2,6);
// The HTTP status of a WebSocket request that is turned away before the upgrade.
const refused=(path,origin)=>new Promise(done=>{const req=http.request({host:'127.0.0.1',port:PORT,path,headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==',...(origin?{Origin:origin}:{})}});
 req.on('response',res=>{res.resume();done(res.statusCode);});req.on('upgrade',(res,socket)=>{socket.destroy();done(101);});req.on('error',()=>done(0));req.end();});
// A client: its messages, its close, and helpers to wait for them.
// (a pilot named is the same account each time; one unnamed is someone new)
async function open(room,{origin=ORIGIN,key=KEY,token=null,name,sub,passe,convite,auth=true,ip='192.0.2.1',headers={}}={}){
 sub??=name?'g-'+name:'g-'+Math.random().toString(36).slice(2);name??='Piloto';
 const ws=new WebSocket(`ws://127.0.0.1:${PORT}/sala/${room}`,{headers:{...headers,Origin:origin,'CF-Connecting-IP':ip}}),c={ws,got:[],closed:null};
 ws.onmessage=e=>c.got.push(JSON.parse(e.data));ws.onclose=e=>{c.closed={code:e.code,reason:e.reason};};ws.onerror=()=>{};
 await new Promise(r=>{ws.onopen=r;const t=setInterval(()=>{if(c.closed){clearInterval(t);r();}},20);});
 c.send=m=>{try{ws.send(typeof m==='string'?m:JSON.stringify(m));}catch{}};
 c.of=t=>c.got.filter(m=>m.t===t);
 c.until=async(check,ms=3000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=check();if(v)return v;await wait(10);}throw new Error('timeout: '+check);};
 if(auth&&!c.closed){c.send({t:'auth',key,token,passe:passe===undefined?await pass(room,name,sub):passe,...(convite&&{convite})});await c.until(()=>c.of('welcome')[0]||c.closed);c.me=c.of('welcome')[0];}
 return c;
}
const report={};

// The door itself: the page's origin, the room's name, the account, the password.
{
 const nopass=await open(fresh(),{passe:null});assert.equal(nopass.closed?.code,4014,'no account, no room');
 const lobbyPass=await open(fresh(),{passe:await pass(LOBBY,'Ana')});assert.equal(lobbyPass.closed?.code,4014,'the lobby\'s pass opens no room');
 assert.equal(await refused('/sala/abc','https://outro-site.com'),403,'another site cannot open a room');
 assert.equal(await refused('/sala/abc',null),403,'nor a page that says nothing');
 assert.equal(await refused('/sala/Nome%20Ruim',ORIGIN),404);
 assert.equal(await refused('/sala/abc',ORIGIN),101,'the game page gets in');
 const wrong=await open(fresh(),{key:'errada'});assert.equal(wrong.closed?.code,4001,'a wrong key is shut out');
 const none=await open(fresh(),{key:''});assert.equal(none.closed?.code,4001);
 // No key at all in time (a slow connection): its own code, which the game tries again instead of
 // asking for the key.
 const slow=await open(fresh(),{auth:false});await slow.until(()=>slow.closed,AUTH_WAIT+3000);assert.equal(slow.closed.code,4012,'late, not a wrong key');
 // Before the key nothing but the key: anything else closes the socket at once.
 const chatty=await open(fresh(),{auth:false});chatty.send({t:'eco'});await chatty.until(()=>chatty.closed);assert.equal(chatty.closed.code,1008,'something else before the key');
}

// Roles, the doorman, and who is who.
{
 const room=fresh(),host=await open(room,{name:'Ana'});
 assert.equal(host.me.role,'host');assert.match(host.me.id,/^[0-9a-f]{8}$/);assert.match(host.me.token,/^[0-9a-f]{32}$/);
 const bia=await open(room,{name:'Bia‮​'});
 assert.equal(bia.me.role,'guest');assert.equal(bia.me.pending,true,'a guest waits at the door');assert.equal(bia.me.host,host.me.id);
 const knock=await host.until(()=>host.of('knock')[0]);assert.equal(knock.id,bia.me.id);assert.equal(knock.name,'Bia','names are cleaned on the server too');
 // Outside the door nothing gets through, either way; a name typed changes nothing (the account's).
 bia.send({t:'hello',name:'Bia Souza​',want:null});host.send({t:'lobby',name:'Ana',age:1,players:[],race:null});
 await wait(150);assert.deepEqual(host.of('knock').map(k=>k.name),['Bia']);
 assert.equal(host.of('hello').length,0);assert.equal(bia.of('lobby').length,0);
 // The line check: the server echoes it itself, to the one who asked only (a guest at the door too).
 bia.send({t:'eco'});await bia.until(()=>bia.of('eco')[0]);host.send({t:'eco'});await host.until(()=>host.of('eco')[0]);await wait(40);
 assert.equal(bia.of('eco').length,1);assert.equal(host.of('eco').length,1,'an echo reaches only the one who asked');
 host.send({t:'admit',to:bia.me.id});await bia.until(()=>bia.of('admitted')[0]);
 // Whatever a guest claims to be, the host hears the id the server gave it.
 bia.send({t:'hello',name:'Bia',want:'64',from:host.me.id});const hello=await host.until(()=>host.of('hello')[0]);assert.equal(hello.from,bia.me.id,'from is the server\'s word');
 // Guests cannot speak for the host, and do not hear each other.
 host.send({t:'config',porteiro:false});await wait(40);
 const caio=await open(room,{name:'Caio'});assert.equal(caio.me.pending,false,'without the doorman a guest comes straight in');
 bia.send({t:'lobby',name:'x',age:1,players:[],race:null});bia.send({t:'go',race:'00000000',seats:[]});bia.send({t:'snap',race:'00000000',seq:1,cars:[]});bia.send({t:'state',race:'00000000',seq:1,lat:0,car:[]});
 await wait(100);assert.equal(caio.of('lobby').length+caio.of('go').length+caio.of('snap').length+caio.of('state').length,0,'a guest reaches no other guest');
 assert.equal(host.of('lobby').length,0,'host-only messages from a guest are dropped');assert.equal(host.of('state').length,1,'its own kind reaches the host');
 // The host's word reaches every guest; a pong only the one it answers.
 host.send({t:'lobby',name:'Ana',age:1,players:[],race:null});host.send({t:'pong',to:caio.me.id,n:3});
 await bia.until(()=>bia.of('lobby')[0]);await caio.until(()=>caio.of('pong')[0]);await wait(40);assert.equal(bia.of('pong').length,0);
 // Refused at the door, and kicked (the kicked tab cannot come back).
 host.send({t:'config',porteiro:true});await wait(30);
 const dora=await open(room,{name:'Dora'});await host.until(()=>host.of('knock').some(k=>k.id===dora.me.id));
 host.send({t:'deny',to:dora.me.id});await dora.until(()=>dora.closed);assert.equal(dora.closed.code,4003);
 host.send({t:'kick',to:caio.me.id});await caio.until(()=>caio.closed);assert.equal(caio.closed.code,4004);
 const back=await open(room,{token:caio.me.token,name:'Caio'});assert.equal(back.closed?.code,4004,'a kicked tab stays out');
 await host.until(()=>host.of('bye').some(m=>m.from===caio.me.id));
 report.roles='ok';
 // A message too big closes the connection; a flood is cut at 90 a second.
 const big=await open(room,{name:'Big'});host.send({t:'admit',to:big.me.id});await big.until(()=>big.of('admitted')[0]);
 big.send({t:'state',x:'y'.repeat(20000)});await big.until(()=>big.closed);assert.equal(big.closed.code,4008);
 const before=host.of('ping').length;for(let i=0;i<300;i++)bia.send({t:'ping',n:i});await wait(300);
 const through=host.of('ping').length-before;assert(through>0&&through<=90,`flood cut: ${through}`);report.flood=through;
 for(const c of [host,bia])c.ws.close();
}

// F5 on the host: its tab's token takes the room back within the grace; the guests hear it went and
// came back. A duplicated tab (same token) takes the identity over from the old one.
{
 const room=fresh(),host=await open(room,{name:'Ana'});host.send({t:'config',porteiro:false});await wait(30);
 const bia=await open(room,{name:'Bia'});
 host.ws.close();await bia.until(()=>bia.of('host-away')[0]);
 const again=await open(room,{token:host.me.token,name:'Ana'});
 assert.equal(again.me.role,'host');assert.equal(again.me.id,host.me.id,'same identity after the reload');
 await bia.until(()=>bia.of('host').some(m=>m.id===host.me.id));
 const twin=await open(room,{token:again.me.token,name:'Ana'});assert.equal(twin.me.id,host.me.id);assert.equal(twin.me.role,'host');
 await again.until(()=>again.closed);assert.equal(again.closed.code,4010,'the older tab is told the room opened elsewhere');
 // The host goes for good: after the grace the guest that came first hosts, the others follow it.
 const caio=await open(room,{name:'Caio'});await wait(30);
 twin.ws.close();await bia.until(()=>bia.of('host-away').length>=2);
 await bia.until(()=>bia.of('role')[0],GRACE+2000);assert.equal(bia.of('role')[0].role,'host','the longest-standing guest hosts');
 await caio.until(()=>caio.of('host').some(m=>m.id===bia.me.id));
 for(const c of [bia,caio])c.ws.close();
 report.reload='ok';
}

// The door holds through a handover: one still knocking never takes the room, however long it has
// waited (refused, it knocks again as someone new), and with nobody let in the room has no host until
// someone comes in; the host back hosts again and hears the knock.
{
 const room=fresh(),host=await open(room,{name:'Ana'});
 const eva=await open(room,{name:'Eva',key:PILOT});await host.until(()=>host.of('knock').some(k=>k.id===eva.me.id));
 host.send({t:'deny',to:eva.me.id});await eva.until(()=>eva.closed);
 const knocking=await open(room,{token:eva.me.token,name:'Eva',key:PILOT});
 assert.equal(knocking.me.pending,true);assert.notEqual(knocking.me.id,eva.me.id,'refused: it knocks again as someone new');
 const bia=await open(room,{name:'Bia'});await host.until(()=>host.of('knock').some(k=>k.id===bia.me.id));
 host.send({t:'admit',to:bia.me.id});await bia.until(()=>bia.of('admitted')[0]);
 // Eva came first, but only Bia was let in.
 host.send({t:'bye'});await bia.until(()=>bia.of('role')[0],GRACE+2000);
 assert.equal(knocking.of('role').length,0,'one at the door with the pilots\' password never hosts');
 await bia.until(()=>bia.of('knock').some(k=>k.id===knocking.me.id));
 // Nobody let in is left: no host, until the old host is back.
 bia.send({t:'bye'});await wait(GRACE+700);
 assert.equal(knocking.of('role').length,0,'not even when it is alone');assert.equal(knocking.closed,null);
 await knocking.until(()=>knocking.of('host').some(m=>m.id===null),GRACE+2000);
 const back=await open(room,{token:host.me.token,name:'Ana'});assert.equal(back.me.role,'host','the room hosts the first to come in');
 await back.until(()=>back.of('knock').some(k=>k.id===knocking.me.id));
 for(const c of [back,knocking])c.ws.close();
 report.handoverDoor='ok';
}

// A host whose line drops in the middle of its race (its lobby says the race is under way) keeps its
// place much longer (RACE_GRACE): its guests' game stands the race still until it is back (players'
// wish: a championship's round on the host's machine must not pass to another), and back it is still the
// host. Gone for good, the room goes on with a guest as its host. One that said goodbye (a reload, a
// closed tab: its race went with its page) has the usual grace.
{
 const racing={t:'lobby',name:'Ana',age:1,players:[],race:{state:'racing'}};
 const room=fresh(),host=await open(room,{name:'Ana'});host.send({t:'config',porteiro:false});await wait(30);
 const bia=await open(room,{name:'Bia'});host.send(racing);await bia.until(()=>bia.of('lobby')[0]);
 host.ws.close();await bia.until(()=>bia.of('host-away')[0]);await wait(GRACE+700);
 assert.equal(bia.of('role').length,0,'past the usual grace: still the host\'s place');
 const back=await open(room,{token:host.me.token,name:'Ana'});assert.equal(back.me.role,'host','back: still the host');await bia.until(()=>bia.of('host').some(m=>m.id===host.me.id));
 const t0=Date.now();back.ws.close();await bia.until(()=>bia.of('host-away').length>=2);await bia.until(()=>bia.of('role')[0],RACE_GRACE+3000);
 assert(Date.now()-t0>=RACE_GRACE-100,'the race\'s grace ran out first');
 const room2=fresh(),ana=await open(room2,{name:'Ana'});ana.send({t:'config',porteiro:false});await wait(30);
 const caio=await open(room2,{name:'Caio'});ana.send(racing);await caio.until(()=>caio.of('lobby')[0]);
 const t1=Date.now();ana.send({t:'bye'});await caio.until(()=>caio.of('role')[0],GRACE+3000);assert(Date.now()-t1<RACE_GRACE,'a goodbye: the usual grace');
 for(const c of [bia,caio])c.ws.close();
 report.raceGrace='ok';
}

// Capacity includes inactive tokens. Authentication failures affect only their IP, and a known
// identity with the current key can reconnect even behind that same shared IP.
{
 const room=fresh(),host=await open(room);host.send({t:'config',porteiro:false});await wait(30);
 const others=[];for(let i=0;i<18;i++)others.push(await open(room,{name:'P'+i}));
 assert(others.every(o=>o.me?.role==='guest'));
 const late=await open(room);assert.equal(late.closed?.code,4002,'19 in the room: the 20th is turned away');
 for(const c of [host,...others])c.ws.close();
 const BAD='192.0.2.7',locked=fresh(),owner=await open(locked,{ip:BAD,name:'Dono'});
 for(let i=0;i<20;i++)await open(locked,{key:'errada',ip:BAD});
 const right=await open(locked,{ip:'192.0.2.2'});assert(right.me,'another IP can still enter');
 const blocked=await open(locked,{key:'errada',ip:BAD});assert.equal(blocked.closed?.code,4009,'only the offending IP waits');
 const back=await open(locked,{token:owner.me.token,ip:BAD,name:'Dono'});assert.equal(back.me?.role,'host','known host resumes on the same IP');
 // The Porteiro counts the wrong keys of every room: a new room name gives no fresh tries, and a
 // header the client sets itself changes nothing.
 await wait(200);
 const elsewhere=await open(fresh(),{ip:BAD});assert.equal(elsewhere.closed?.code,4009,'another room: the IP still waits');
 const forged=await open(fresh(),{ip:BAD,headers:{'X-Porteiro':'livre'}});assert.equal(forged.closed?.code,4009,'the client cannot speak for the Porteiro');
 const neighbour=await open(fresh(),{ip:'192.0.2.2'});assert.equal(neighbour.me?.role,'host','another IP opens a new room');
 for(const c of [owner,right,back,neighbour])c.ws.close();
 // (with the doorman off: the door's own limit is checked below)
 const retained=fresh(),keeper=await open(retained),tokens=[];keeper.send({t:'config',porteiro:false});await wait(30);
 for(let i=0;i<20;i++){
  const guest=await open(retained,{name:'G'+i});tokens.push(guest.me.token);guest.ws.close();await guest.until(()=>guest.closed);
  await keeper.until(()=>keeper.of('bye').some(m=>m.from===guest.me.id));
 }
 const rejoined=[];
 for(const [i,token] of tokens.entries())rejoined.push(await open(retained,{token,name:'G'+i}));
 assert.equal(rejoined.filter(c=>c.me).length,18,'old tokens cannot exceed the 19 slots');
 assert(rejoined.slice(18).every(c=>c.closed?.code===4002));
 for(const c of [keeper,...rejoined])c.ws.close();
 // An unauthenticated source also has a bounded number of sockets awaiting its key.
 const pending=fresh(),idle=[];
 for(let i=0;i<21;i++)idle.push(await open(pending,{auth:false}));
 const extra=await open(pending,{auth:false});await extra.until(()=>extra.closed);
 assert.equal(extra.closed.code,4012,'pending capacity retries instead of permanently stopping the game');
 const other=await open(pending,{ip:'192.0.2.2'});assert(other.me,'another source can authenticate');
 for(const c of [...idle,other])c.ws.close();
 // The door: four knocks from one IP wait together, a fifth tries again (4013, not a refusal);
 // another IP still knocks, and one let in makes room.
 const hall=fresh(),warden=await open(hall,{ip:'192.0.2.3'}),knocks=[];
 for(let i=0;i<4;i++)knocks.push(await open(hall,{ip:'192.0.2.4'}));
 assert(knocks.every(k=>k.me?.pending),'four at the door');
 const fifth=await open(hall,{ip:'192.0.2.4'});assert.equal(fifth.closed?.code,4013,'a fifth from that IP tries again');
 const stranger=await open(hall,{ip:'192.0.2.5'});assert(stranger.me?.pending,'another IP knocks');
 warden.send({t:'admit',to:knocks[0].me.id});await knocks[0].until(()=>knocks[0].of('admitted')[0]);
 const sixth=await open(hall,{ip:'192.0.2.4'});assert(sixth.me?.pending,'one let in makes room at the door');
 for(const c of [warden,...knocks,stranger,sixth])c.ws.close();
 report.limits='ok';
}
// The pilots' password: no room opens with it; its pilot waits at the door of a room nobody opened,
// and knocks for the first to come with the host's password.
{
 const room=fresh(),bia=await open(room,{name:'Bia',key:PILOT});
 assert.equal(bia.me.role,'guest');assert.equal(bia.me.host,null);assert.equal(bia.me.pending,true);
 const ana=await open(room,{name:'Ana'});assert.equal(ana.me.role,'host');
 await ana.until(()=>ana.of('knock').some(k=>k.id===bia.me.id&&k.name==='Bia'));await bia.until(()=>bia.of('host').some(m=>m.id===ana.me.id));
 ana.send({t:'admit',to:bia.me.id});const admitted=await bia.until(()=>bia.of('admitted')[0]);assert.equal(admitted.host,ana.me.id);
 // The chat: cleaned, under the account's name, to the others let in; a link never relayed.
 bia.send({t:'chat',text:'boa  corrida\u202E!',name:'Ana'});const line=await ana.until(()=>ana.of('chat')[0]);
 assert.deepEqual({name:line.name,text:line.text,from:line.from},{name:'Bia',text:'boa corrida!',from:bia.me.id});
 ana.send({t:'chat',text:'olha autopobre.com.br'});ana.send({t:'chat',text:'valeu'});await bia.until(()=>bia.of('chat')[0]);
 assert.deepEqual(bia.of('chat').map(m=>m.text),['valeu'],'no link reaches anyone');
 for(const c of [ana,bia])c.ws.close();
 report.passwords='ok';
}
// The lobby and the invitations: pages online keep a line (the runtime answers their echo), the host
// sees who is online and invites one, whose pages all get it; with it the pilot comes straight in, no
// password, no door.
{
 const line=async name=>{
  const ws=new WebSocket(`ws://127.0.0.1:${PORT}/saguao`,{headers:{Origin:ORIGIN}}),c={ws,got:[],closed:null};
  ws.onmessage=e=>c.got.push(JSON.parse(e.data));ws.onclose=e=>{c.closed=e.code;};ws.onerror=()=>{};
  await new Promise(r=>{ws.onopen=r;});ws.send(JSON.stringify({t:'auth',passe:await pass(LOBBY,name)}));
  const end=Date.now()+3000;while(!c.got.some(m=>m.t==='welcome')&&Date.now()<end)await wait(20);
  return c;
 };
 assert.equal(await refused('/saguao','https://outro-site.com'),403,'the lobby takes the game\'s origin only');
 const eva=await line('Eva'),eva2=await line('Eva'),gil=await line('Gil');
 assert(eva.got.some(m=>m.t==='welcome'));
 eva.ws.send('{"t":"eco"}');const end=Date.now()+3000;while(!eva.got.some(m=>m.t==='eco')&&Date.now()<end)await wait(20);assert(eva.got.some(m=>m.t==='eco'),'the echo, answered by the runtime');
 const room=fresh(),ana=await open(room,{name:'Ana',key:KEY});
 ana.send({t:'online'});const online=await ana.until(()=>ana.of('online')[0]);
 const names=online.pilotos.map(p=>p.nome).sort();assert(names.includes('Eva')&&names.includes('Gil'),'who is online: '+names);
 const evaAccount=online.pilotos.find(p=>p.nome==='Eva').conta;
 ana.send({t:'convidar',conta:evaAccount,endereco:room});const sent=await ana.until(()=>ana.of('convidado')[0]);assert.equal(sent.entregue,true);
 const end2=Date.now()+3000;while(!(eva.got.some(m=>m.t==='convite')&&eva2.got.some(m=>m.t==='convite'))&&Date.now()<end2)await wait(20);
 const offer=eva.got.find(m=>m.t==='convite');assert(offer&&eva2.got.some(m=>m.t==='convite'),'every page of hers');assert(!gil.got.some(m=>m.t==='convite'),'nobody else');
 assert.equal(offer.de,'Ana');assert.equal(offer.sala,room);
 assert.match(offer.id,/^[0-9a-f]{16}$/);
 // Gil invited by mistake: the host cancels before he takes it; his page hears so, and it lets nobody in.
 const gilAccount=online.pilotos.find(p=>p.nome==='Gil').conta;
 ana.send({t:'convidar',conta:gilAccount,endereco:room});await ana.until(()=>ana.of('convidado').some(m=>m.conta===gilAccount));
 const gilOffer=await (async()=>{const end=Date.now()+3000;while(!gil.got.some(m=>m.t==='convite')&&Date.now()<end)await wait(20);return gil.got.find(m=>m.t==='convite');})();
 ana.send({t:'desconvidar',conta:gilAccount});const undone=await ana.until(()=>ana.of('desconvidado')[0]);assert.deepEqual({conta:undone.conta,ok:undone.ok},{conta:gilAccount,ok:true});
 {const end=Date.now()+3000;while(!gil.got.some(m=>m.t==='convite-cancelado')&&Date.now()<end)await wait(20);}
 assert.deepEqual(gil.got.find(m=>m.t==='convite-cancelado'),{t:'convite-cancelado',id:gilOffer.id},'his pages put the notice away');
 const gilIn=await open(room,{name:'Gil',key:'',convite:gilOffer.convite});assert.equal(gilIn.closed?.code,4016,'a cancelled invitation lets nobody in');
 const evaIn=await open(room,{name:'Eva',key:'',convite:offer.convite});assert.equal(evaIn.me?.pending,false,'invited: straight in, no password');
 const zeca=await open(room,{name:'Zeca',key:'',convite:offer.convite});assert.equal(zeca.closed?.code,4016,'her invitation is hers only');
 for(const c of [ana,evaIn,eva,eva2,gil])c.ws.close();
 report.invitations='ok';
}
stop();
console.log(JSON.stringify(report));
console.log('testar_sala: ok');
