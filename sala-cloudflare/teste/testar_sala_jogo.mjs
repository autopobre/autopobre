// The game's own room code (pista_interlagos/teste/net-room.js, net-link.js) through the room
// server in wrangler dev: the account's pass, the passwords, the doorman, a race announced and started,
// cars both ways, the chat, a kick, and the host's reload. Run from sala-cloudflare: node teste/testar_sala_jogo.mjs
import assert from 'node:assert/strict';
import {startWrangler} from './wrangler-dev.mjs';
import {Room} from '../../pista_interlagos/teste/net-room.js';
import {ServerLink} from '../../pista_interlagos/teste/net-link.js';
import {packCar} from '../../pista_interlagos/teste/net-cars.js';
import {makePass,accountKey} from '../src/passe.js';
const PORT=8798,SECRET='passe-de-teste-do-jogo-wrangler',KEY='anfitriao-de-teste-local',PILOT='pilotos-de-teste-local',ORIGIN='http://teste.local',wait=(ms=50)=>new Promise(r=>setTimeout(r,ms));
const stop=await startWrangler({port:PORT,vars:{SALA_PASSE:SECRET,SENHA_ANFITRIAO:KEY,SENHA_PILOTOS:PILOT,ORIGENS:ORIGIN,HOST_GRACE_MS:800}});
// A browser tab: its sessionStorage (the server's token for a reload), its password and its account
// (the pass as the accounts server would give it: the nickname is the name; signedIn false: none).
const tab=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};};
const rooms=[];
function player(room,name,{key=KEY,storage=tab(),want=null,signedIn=true}={}){
 const pass=async r=>signedIn?{passe:await makePass(SECRET,{account:await accountKey(SECRET,'g-'+name),name,room:r}),validade:300000}:{problema:'conta'};
 const link=new ServerLink({url:`ws://127.0.0.1:${PORT}`,room,key:()=>key,pass,storage,socket:url=>new WebSocket(url,{headers:{Origin:ORIGIN}})});
 const r=new Room({room,name,want,link,storage});r.events={};r.storage=storage;rooms.push(r);r.start();return r;
}
// Every room ticks as a frame would (beacons, pings, hellos).
const ticker=setInterval(()=>{for(const r of rooms)try{r.tick();}catch{}},50);
const until=async(check,ms=5000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=check();if(v)return v;await wait(20);}throw new Error('timeout: '+check);};
const car={x:10,y:20,z:1,heading:.5,pitch:0,roll:0,vx:30,vy:0,vz:0,yaw:0,pitchRate:0,rollRate:0,steer:0,spin:0,rearSpin:0,rpm:4000,gear:3,latAccel:0,longAccel:0,rearSlipSpeed:0,laps:0,best:null,surface:{z:1}};
const name='jogo-'+Math.random().toString(36).slice(2,8),report={};

// A wrong password: the card asks for it; none typed: asked at once; not signed in: the card says so.
const intruder=player(name+'x','Intruso',{key:'errada'});await until(()=>intruder.problem==='chave');intruder.leave();
const blank=player(name+'y','Branco',{key:''});await until(()=>blank.problem==='chave');assert.equal(blank.link.ws,null,'no connection without a password');blank.leave();
const stranger=player(name+'z','Estranho',{signedIn:false});await until(()=>stranger.problem==='conta');stranger.leave();

// The host, then a guest at the door; the host lets it in, the guest takes a seat.
const ana=player(name,'Ana');await until(()=>ana.role==='host');
const bia=player(name,'Bia',{want:'64',key:PILOT});await until(()=>bia.role==='guest'&&bia.pending);
await until(()=>ana.knocks.has(bia.id));assert.equal(ana.members.length,1,'a guest at the door is not in the room yet');
ana.admit(bia.id);await until(()=>!bia.pending&&bia.number==='64');
assert.deepEqual(ana.members.map(m=>m.number),['99','64']);assert.equal(bia.hostId,ana.id);
// Let in, she picks her car and waits for the start ("Aguardar início da corrida").
bia.setWaiting(true);await until(()=>ana.members.find(m=>m.id===bia.id)?.wait);
// A race: announced, loaded, started by the host.
const got=[];bia.on('race',race=>{got.push('race');return true;}).on('go',race=>got.push('go '+race.seats.length)).on('snap',m=>got.push('snap '+m.cars.length));
ana.on('state',(id,m)=>got.push('state '+(id===bia.id)));
const race=ana.planRace({circuit:'interlagos',laps:1});ana.openRace(race);await until(()=>got.includes('race'));
bia.sendReady();await until(()=>ana.ready.has(bia.id));assert.equal(race.state,'waiting');
ana.lightsOut();await until(()=>got.includes('go 2'));
bia.sendState(packCar(car),1);ana.sendSnapshot([['99',0,packCar(car)],['64',.02,packCar(car)]],1);
await until(()=>got.includes('state true')&&got.includes('snap 2'));
// Pings through the server give the guest its latency.
await until(()=>bia.latency>0);report.latencyMs=Math.round(bia.latency*1000);
// Mid-race the guest's line drops (her socket closes, no goodbye): the server tells the host, her seat
// waits for her (away) and her car goes on with nobody at the wheel; she connects again by herself, as
// the same player, and the host seats her again.
const seated=()=>race.seats.some(s=>s.id===bia.id),biaId=bia.id;ana.on('leave',p=>got.push('leave '+p.number));
bia.link.ws.close(4000);await until(()=>got.includes('leave 64'));assert(!seated(),'out of the seats: her car without a driver');
await until(()=>seated()&&bia.problem===null&&bia.race.seats.some(s=>s.id===biaId),10000);assert.equal(bia.id,biaId);
// A line dead one way (open, but nothing reaches her): no echo from the server for 10 seconds,
// she connects again and keeps her seat.
const deaf=bia.link.ws,leaves=got.filter(x=>x==='leave 64').length;deaf.onmessage=null;
await until(()=>bia.link.ws&&bia.link.ws!==deaf&&bia.problem===null&&seated()&&bia.race.seats.some(s=>s.id===biaId),30000);
assert(bia.trail.some(t=>t.includes('sem sinal')));assert.equal(got.filter(x=>x==='leave 64').length,leaves,'the new connection takes over: the host never hears her go');report.drop='ok';
// The chat, both ways: the line under the account's name, shown at once in the sender's own window.
const lines=[];ana.on('chat',l=>lines.push(['ana',l.name,l.text,!!l.mine]));bia.on('chat',l=>lines.push(['bia',l.name,l.text,!!l.mine]));
assert.equal(bia.say('boa corrida!'),true);assert.equal(bia.say('outra já'),false,'one line every two seconds');assert.equal(ana.say('vem pro site.com'),false,'no links');
await until(()=>lines.some(l=>l[0]==='ana'));assert.deepEqual(lines,[['bia','Bia','boa corrida!',true],['ana','Bia','boa corrida!',false]]);report.chat='ok';
// A kick: out of the room, and out for good.
const caio=player(name,'Caio',{key:PILOT});await until(()=>ana.knocks.has(caio.id));ana.admit(caio.id);await until(()=>caio.number);
ana.kick(caio.id);await until(()=>caio.problem==='expulso');await until(()=>!ana.members.some(m=>m.id===caio.id));
// F5 on the host: the same tab (token) hosts again, in the car it had (kept by the tab, whatever its
// car screen asks for now); the guest sees it go and come back.
ana.closeRace();ana.choose('73');await until(()=>ana.number==='73'&&bia.hostNumber==='73');
const hostTab=ana.storage,id=ana.id;ana.leave();await until(()=>bia.hostAway);
const ana2=player(name,'Ana',{storage:hostTab});await until(()=>ana2.role==='host');
assert.equal(ana2.id,id,'the reloaded host is the same player');assert.equal(ana2.number,'73','and races the car it had');await until(()=>!bia.hostAway&&bia.number==='64');
report.flow='ok';
clearInterval(ticker);for(const r of rooms)try{r.leave();}catch{}
await wait(200);stop();
console.log(JSON.stringify(report));
console.log('testar_sala_jogo: ok');
