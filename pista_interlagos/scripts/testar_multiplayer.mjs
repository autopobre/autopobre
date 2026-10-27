// Multiplayer test version (teste/multiplayer.js): the room protocol, message checks, remote-car
// prediction under network delay, and RaceField's remote and ghost cars.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room,roomParams,roomName,roomLabel,roomAddress,roomIn,HIDDEN,playerName,validMessage,validExtra,SEATS,chatText,chatLink,CHAT_LENGTH,keepInvite,savedInvite,dropInvite} from '../teste/net-room.js';
import {fieldRoster} from '../teste/race-roster.js';
import {RemoteCar,packCar,readCar,CAR_FIELDS} from '../teste/net-cars.js';
import {RaceField,TOW_ARRIVE,FAINTED,faintedInput,inTheWay,pitRoute} from '../teste/race-field.js';
import {Multiplayer} from '../teste/multiplayer.js';
import {AutomaticAIRecords,readAIRecords} from '../teste/ai-records.js';
import {ROOM_SERVER,ServerLink,CLOSED} from '../teste/net-link.js';
import {TestCar,recognitionInput,wrap} from '../teste/physics.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const wait=(ms=15)=>new Promise(resolve=>setTimeout(resolve,ms));
const report={};

// --- The address: #desafio=NOME and its options.
{
 const p=roomParams('#desafio=Teste Óla&carro=73&auto=1&lag=150&perda=5');
 assert.deepEqual(p,{room:'testeola',address:'TesteOla',label:'testeola',car:'73',auto:true,ghosts:false,local:false,server:null,lag:150,loss:.05});
 assert.equal(roomParams('#desafio=a&local=1').local,true);assert.equal(roomParams('#desafio=a&servidor=local').server,'local');assert.equal(roomParams('#desafio=a&servidor=outro').server,null);
 assert.equal(roomParams('#desafio=a&fantasmas=1').ghosts,true,'humans pass through each other only when asked');
 assert.equal(roomParams('#carro=73'),null,'no room without desafio');
 assert.equal(roomParams('#desafio=%20%20'),null);
 assert.equal(roomParams('#desafio=a&carro=99').car,'99','a guest may ask for the 99 too');
 assert.equal(roomParams('#desafio=a&carro=1234').car,null);
 assert.equal(roomParams('#desafio=a&lag=-50').lag,0);assert.equal(roomParams('#desafio=a&lag=1e9').lag,1000);assert.equal(roomParams('#desafio=a&perda=90').loss,.5);
 assert.equal(roomName('x'.repeat(40)).length,24);
 assert.equal(playerName('  Bia‮​ <b>oi</b>\n\t  '),'Bia <b>oi</b>','control and format characters go, text stays text');
 assert.equal(playerName('a'.repeat(80)).length,24);
 assert.equal(SEATS.length,15);assert.equal(SEATS[0],'99');
}

// --- A secret in the room's name (lives): what follows "_" is never on screen, the room is the whole name.
{
 const store=new Map(),local={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 assert.equal(roomLabel('Amigos_Segredo7'),'amigos_***');assert.equal(roomLabel('amigos'),'amigos');
 assert.equal(roomLabel('amigos_'),'amigos','nothing after the "_": nothing hidden');assert.equal(roomLabel('_xyz'),'_***');
 assert.equal(roomLabel(`amigos_${HIDDEN}`),'amigos_***');
 const p=roomParams('#desafio=Amigos_Segredo7&carro=73');assert.equal(p.room,'amigossegredo7','the same room as before ("_" not kept)');assert.equal(p.label,'amigos_***');assert.equal(p.address,'Amigos_Segredo7','the address as written, for an invitation');
 // Opened whole: read whole, shown hidden (the other options kept), the secret kept in this browser.
 const whole=roomAddress('#desafio=Amigos_Segredo7&carro=73&servidor=local',local);
 assert.equal(whole.lost,false);assert.equal(roomParams(whole.hash).room,'amigossegredo7');assert.equal(roomParams(whole.hash).server,'local');
 assert.equal(whole.shown,`#desafio=Amigos_${HIDDEN}&carro=73&servidor=local`);assert.ok(!whole.shown.toLowerCase().includes('segredo'),whole.shown);
 // F5 (or another tab here) with the hidden address: the same room.
 const again=roomAddress(whole.shown,local);assert.equal(again.lost,false);assert.equal(roomParams(again.hash).room,'amigossegredo7');assert.equal(again.shown,whole.shown);
 assert.equal(roomParams(roomAddress(`#desafio=amigos_${HIDDEN}`,local).hash).room,'amigossegredo7','case and accents of the shown part do not matter');
 // The hidden address copied off a stream, on another browser: no room.
 const viewer=roomAddress(whole.shown,{getItem:()=>null,setItem(){}});assert.equal(viewer.lost,true);
 assert.equal(roomAddress(whole.shown,null).lost,true);assert.equal(roomAddress(whole.shown,{getItem(){throw new Error('blocked');}}).lost,true);
 // No secret: the address stays as it is.
 for(const h of ['#desafio=amigos&carro=73','#desafio=amigos_','#carro=73','']){const a=roomAddress(h,local);assert.equal(a.lost,false);assert.equal(a.hash,h);assert.equal(a.shown,h);}
 report.segredo={sala:p.room,mostra:p.label,endereco:whole.shown};
}

// --- The old links, #sala= and #corrida=, open no room: no fallback to them, on purpose.
{
 const store=new Map(),local={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 for(const old of ['sala','corrida']){
  assert.equal(roomParams(`#${old}=amigos&carro=73&local=1`),null,`#${old}= is not a room`);assert.equal(roomIn(`#${old}=amigos`),null);
  const a=roomAddress(`#${old}=Amigos_Segredo7&local=1`,local);assert.equal(a.lost,false);assert.equal(a.shown,a.hash,'an old link is left alone');assert.equal(roomParams(a.hash),null);
 }
 assert.equal(roomParams('#sala=velha&desafio=nova').room,'nova');assert.equal(roomIn('#carro=73&desafio=Amigos'),'Amigos');
 // A secret kept from an old #sala= link does not open the hidden #desafio= address.
 store.set('autopobre-sala-segredo-amigos','Amigos_Segredo7');
 assert.equal(roomAddress(`#desafio=Amigos_${HIDDEN}`,local).lost,true);
 report.linksAntigos='#sala= e #corrida= não abrem sala';
}

// --- A car on the wire: packed, read back, anything malformed refused.
{
 const car=new TestCar(data);car.reset(300);car.vx=30;car.spin=1234.5;car.heading=9;
 const packed=packCar(car,{progress:812.3456,finished:true,finishTime:95.5,brake:.4,throttle:1});
 assert.equal(packed.length,CAR_FIELDS.length);
 const s=readCar(packed);assert(s);assert.equal(s.vx,30);assert.equal(s.progress,812.346);assert.equal(s.finished,true);assert.equal(s.retired,false);assert.equal(s.finishTime,95.5);
 const out=readCar(packCar(car,{retired:true}));assert(out.retired&&!out.finished,'a retired bot never counts as finished');
 assert(Math.abs(s.heading)<=Math.PI&&s.spin>=0&&s.spin<2*Math.PI,'angles wrapped');
 assert.equal(readCar(packCar(car)).finishTime,null);
 assert.equal(packCar(car,{still:true})[CAR_FIELDS.indexOf('vx')],0,'a held car is sent at rest');
 for(const bad of [null,'x',[],packed.slice(1),[...packed,0],packed.map((v,i)=>i===0?NaN:v),packed.map((v,i)=>i===1?Infinity:v),packed.map((v,i)=>i===2?'1':v),packed.map((v,i)=>i===6?1e6:v)])assert.equal(readCar(bad),null);
}

// --- Prediction: a remote car 100 ms behind its owner, 30 states a second, on Interlagos.
{
 // Each physics step drives the remote car to the end of that step, as RaceField does, and
 // compares it with the owner's car there; "as sent" shows the last state where it was sent.
 const stats=list=>{list.sort((a,b)=>a-b);return {mean:+(list.reduce((a,b)=>a+b,0)/list.length).toFixed(3),p95:+list[Math.floor(list.length*.95)].toFixed(3),max:+list.at(-1).toFixed(3)};};
 const run=latency=>{
  const truth=new TestCar(data),shadow=new TestCar(data);truth.reset(40);shadow.reset(40);const remote=new RemoteCar(truth);
  const dt=1/120,queue=[],errors=[],asSent=[];let t=0,seq=0,last=null,top=0;
  for(let step=0;step<120*40;step++){
   while(queue.length&&queue[0].at<=t+1e-9){last=queue.shift();remote.receive(last.state,{age:t-last.sent,seq:last.seq});}
   remote.drive(shadow,dt);truth.step(recognitionInput(truth,{maxSpeed:48,cornerGrip:9,braking:9}),dt);t+=dt;top=Math.max(top,Math.hypot(truth.vx,truth.vy));
   if(step%4===0)queue.push({sent:t,at:t+latency,seq:++seq,state:readCar(packCar(truth))});
   if(t>4&&last){errors.push(Math.hypot(shadow.x-truth.x,shadow.y-truth.y));asSent.push(Math.hypot(last.state.x-truth.x,last.state.y-truth.y));}
  }
  return {predicted:stats(errors),asSent:stats(asSent),topSpeedKmh:Math.round(top*3.6)};
 };
 const near=run(.03),far=run(.1);
 report.prediction={lag30ms:near,lag100ms:far};
 assert(near.predicted.mean<.15&&near.predicted.p95<.3,`30 ms: ${JSON.stringify(near)}`);
 assert(far.predicted.mean<.4&&far.predicted.p95<.8,`100 ms: ${JSON.stringify(far)}`);
 assert(far.asSent.mean>far.predicted.mean*3,'carrying the state on beats showing it where it was sent');
}

// --- The room: two windows (two Room objects on one BroadcastChannel name), a fake clock.
{
 // Time moves in frame-sized ticks: a long gap between two ticks is a frozen window (net-room.js).
 let now=0;const clock=()=>now,name='verif-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const events=[],A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia‮',want:'19',wait:true,clock});
 A.on('race',()=>events.push('A race'));B.on('race',race=>{events.push('B race '+race.circuit);return true;}).on('go',race=>events.push('B go '+race.seats.length));
 A.on('state',(id,m)=>events.push(`A state ${id===B.id} ${m.seq}`)).on('leave',p=>events.push('A leave '+p.number));B.on('snap',m=>events.push(`B snap ${m.cars.length}`));
 A.start();await wait();advance([A],1);assert.equal(A.role,'host','alone in the room: hosts it');assert.equal(A.number,'99','asking for no car: the 99');
 B.start();await wait();await wait();
 assert.equal(B.role,'guest');assert.equal(B.hostId,A.id);assert.equal(B.number,'19','the car asked for');assert.equal(B.name,'Bia');
 assert.deepEqual(A.members.map(m=>m.number),['99','19']);
 const race=A.planRace({circuit:'interlagos',laps:2,ace:true,level:'medio'});
 assert.deepEqual(race.seats.map(s=>s.number),['99','19']);assert(Number.isInteger(race.seed));assert.equal(race.car,'99',"the host's car starts at the back");
 A.openRace(race);await wait();
 assert.equal(race.state,'waiting','the start waits for the guest');assert.deepEqual(events,['B race interlagos']);assert.equal(B.race.id,race.id);assert.equal(B.race.level,'medio');assert.equal(B.race.car,'99');
 B.sendReady();await wait();await wait();
 assert.equal(race.state,'waiting','ready is not the start: the host gives it');assert(A.ready.has(B.id));
 // A third window arrives while the start waits: it is seated and gets the race too.
 const C=new Room({room:name,name:'Caio',wait:true,clock}),late=[];let seatsA=0,seatsB=0;
 A.on('seats',()=>seatsA++);B.on('seats',()=>seatsB++);C.on('race',race=>{late.push('race '+race.id);return true;}).on('go',race=>late.push('go '+race.seats.length));
 C.start();await wait();await wait();await wait();
 assert.deepEqual(race.seats.map(s=>s.number),['99','19','73']);assert(seatsA>0&&seatsB>0,'host and guests hear the new seat');
 assert.deepEqual(late,['race '+race.id]);assert.deepEqual(B.race.seats.map(s=>s.number),['99','19','73']);
 // Lights out before Caio has the track loaded: he races the next one; Bia and the host go.
 A.lightsOut();await wait();await wait();
 assert.equal(race.state,'racing');assert(events.includes('B go 2'));assert.deepEqual(race.seats.map(s=>s.number),['99','19']);
 assert.deepEqual(late,['race '+race.id,'go 2'],'Caio hears the start without a seat in it');
 const car=new TestCar(data);car.reset(10);
 B.sendState(packCar(car),1);A.sendSnapshot([['99',0,packCar(car)],['19',.05,packCar(car)]],1);await wait();
 assert(events.includes('A state true 1')&&events.includes('B snap 2'));
 // A forged or broken message changes nothing and reaches no one.
 const raw=new BroadcastChannel('autopobre-sala-'+name),before=events.length;
 raw.postMessage({t:'state',from:B.id,race:race.id,seq:2,lat:0,car:packCar(car).map((v,i)=>i?v:NaN)});
 raw.postMessage({t:'state',from:B.id,race:race.id,seq:3,lat:0,car:[1,2,3]});
 raw.postMessage({t:'lobby',from:'00000000',name:'x',players:Array.from({length:99},()=>({id:'00000001',name:'x',number:'73'})),race:null});
 raw.postMessage({t:'snap',from:A.id,race:race.id,seq:9,cars:[['666',0,packCar(car)]]});
 raw.postMessage({t:'go',from:'zz',race:race.id,seats:[]});
 raw.postMessage({t:'eval',from:A.id,code:'alert(1)'});
 await wait(30);assert.equal(events.length,before,'forged messages are dropped');assert.equal(B.hostId,A.id);
 // A flood of valid states is cut at 240 messages a second per sender.
 const valid=packCar(car);let seen=0;A.on('state',()=>seen++);
 for(let i=0;i<400;i++)raw.postMessage({t:'state',from:B.id,race:race.id,seq:100+i,lat:0,car:valid});
 await wait(60);assert(seen>0&&seen<=240,`rate limit: ${seen}`);raw.close();
 assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42'}),true);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'999'}),false);
 assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',pick:7}),true);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',pick:-1}),false);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',pick:'7'}),false);
 const lobby=r=>({t:'lobby',from:A.id,name:'x',age:1,players:[],race:r});
 assert.equal(validMessage(lobby({...A.race,seats:[]})),true);assert.equal(validMessage(lobby({...A.race,seats:[],car:'999'})),false,"the host's car must be one of the grid");assert.equal(validMessage(lobby({...A.race,seats:[],car:undefined})),false);
 // A frozen host (a track loading) holds nobody's silence against them...
 now=3.5;A.tick();assert.equal(A.members.length,3,'a freeze is not silence');
 // ...but a guest silent for longer than 3 s is let go (before the start its car becomes a bot in the
 // game; during the race it is left without a driver).
 advance([A],7);assert(events.includes('A leave 19'));assert.equal(A.members.length,1);assert.deepEqual(race.seats.map(s=>s.number),['99']);
 // The host leaves: the guest finds no host and hosts the room itself.
 // The host says goodbye: the guest waits for it (a reload says goodbye too), then elects.
 A.leave();C.leave();await wait();B.tick();assert(B.hostAway&&B.role==='guest','host gone: the guest waits for it first');
 const heard=B.hostSeen;advance([B],heard+10.5);assert.equal(B.role,null,'10 s after the goodbye: a new election');advance([B],heard+11.5);assert.equal(B.role,'host','nobody came back: the guest hosts');B.leave();
 report.room=events.slice(0,6);
}
// The car screen in a room: the host races the car it chose (its race's car, at the back); a guest
// gets the car it asks for when nobody has it, otherwise the first free one; a new choice is granted
// at once, refused for a car already taken, and waits while that guest races; F5 keeps every car.
{
 let now=0;const clock=()=>now,name='carros-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const settle=async(rooms,n=3)=>{for(let i=0;i<n;i++){await wait();advance(rooms,now+.2);}};
 const tab=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};},hostTab=tab(),guestTab=tab();
 const A=new Room({room:name,name:'Ana',want:'73',clock,storage:hostTab}),B=new Room({room:name,name:'Bia',want:'73',wait:true,clock,storage:guestTab}),C=new Room({room:name,name:'Caio',want:'99',wait:true,clock});
 B.on('race',()=>true);C.on('race',()=>true);
 A.start();advance([A],1);assert.equal(A.number,'73','the host races its choice');
 B.start();await settle([A,B]);C.start();await settle([A,B,C],4);
 assert.equal(B.number,'99',"the 73 is the host's: the first free car");assert.equal(C.number,'00','the 99 went to Bia first: the next free one');
 assert(B.settled&&C.settled);assert.equal(B.hostNumber,'73');
 // A choice on the car screen: free, granted; taken, refused (the guest keeps its car).
 C.choose('99');assert.equal(C.settled,false);await settle([A,B,C]);
 assert(C.settled,'the host answered');assert.equal(C.number,'00',"the 99 is Bia's");
 B.choose('19');await settle([A,B,C]);
 assert(B.settled);assert.equal(B.number,'19');
 C.choose('99');await settle([A,B,C]);
 assert.equal(C.number,'99','the 99 is free now');
 // The host's own choice is its at once, if free; its race's car is the one at the back.
 A.choose('19');assert.equal(A.number,'73',"the 19 is Bia's");A.choose('7');assert.equal(A.number,'7');
 await settle([A,B,C]);
 assert.equal(B.hostNumber,'7');assert.deepEqual(A.members.map(m=>m.number).sort(),['19','7','99']);
 const race=A.planRace({circuit:'interlagos',laps:1});assert.equal(race.car,'7');A.openRace(race);
 await settle([A,B,C]);
 assert.equal(B.race.car,'7');
 // Every window builds the same field: the host's car out of it, the 99 in its seat (a human here).
 const roster=fieldRoster(B.race.car);assert.equal(roster.findIndex(e=>e.number==='99'),fieldRoster().findIndex(e=>e.number==='7'));
 assert(roster.some(e=>e.number==='19')&&!roster.some(e=>e.number==='7'));
 // While the start waits a guest may still change car: its seat in the race follows.
 let seats=0;A.on('seats',()=>seats++);
 B.choose('64');await settle([A,B,C]);
 assert.equal(B.number,'64');assert.equal(race.seats.find(s=>s.id===B.id).number,'64');assert(seats>0,'the host re-seats the humans');
 // Racing: a new choice waits until that race ends; the host's car too.
 B.sendReady();C.sendReady();await settle([A,B,C],2);A.lightsOut();await settle([A,B,C],2);
 assert.equal(race.state,'racing');assert.equal(race.seats.length,3);
 B.choose('2');A.choose('42');await settle([A,B,C]);
 assert.equal(B.number,'64','racing: the car stays');assert.equal(B.settled,false,'the answer waits');assert.equal(race.seats.find(s=>s.id===B.id).number,'64');
 assert.equal(A.number,'7');
 A.closeRace();await settle([A,B,C]);
 assert.equal(B.number,'2','granted once the race is over');assert(B.settled);assert.equal(A.number,'42');
 // F5 on the host and on a guest: both keep their cars.
 A.leave();await wait();const A2=new Room({room:name,name:'Ana',want:'73',clock,storage:hostTab});A2.start();
 await settle([A2,B,C],8);
 assert.equal(A2.number,'42','the host back from F5 keeps its car');assert.equal(B.number,'2');assert.equal(C.number,'99');
 B.leave();await wait();const B2=new Room({room:name,name:'Bia',want:'73',wait:true,clock,storage:guestTab});B2.start();
 await settle([A2,B2,C],8);
 assert.equal(B2.number,'2','a guest back from F5 keeps its car, not its old choice');assert(B2.settled);
 // F5 in the middle of a race, the tab gone without a word: its choice still waits at the host, and
 // the tab back has nothing to wait for (pick 0 is no new choice).
 const race2=A2.planRace({circuit:'interlagos',laps:1});A2.openRace(race2);await settle([A2,B2,C]);B2.sendReady();C.sendReady();await settle([A2,B2,C],2);A2.lightsOut();await settle([A2,B2,C],2);
 B2.choose('51');await settle([A2,B2,C]);assert.equal(B2.settled,false,'racing: the answer waits');
 B2.channel.close();const B3=new Room({room:name,name:'Bia',want:'73',wait:true,clock,storage:guestTab});B3.on('race',()=>true);B3.start();
 await settle([A2,B3,C],4);
 assert.equal(B3.number,'2','back from F5 mid-race: the same car');assert(B3.settled,'nothing asked since the reload');
 A2.closeRace();await settle([A2,B3,C]);assert.equal(B3.number,'51','the choice made before F5 is granted after the race');
 // A guest's choice still waiting when its host leaves: the guest hosts the room in the car it asked for.
 const race3=A2.planRace({circuit:'interlagos',laps:1});A2.openRace(race3);await settle([A2,B3,C]);B3.sendReady();C.sendReady();await settle([A2,B3,C],2);A2.lightsOut();await settle([A2,B3,C],2);
 B3.choose('88');await settle([A2,B3,C]);assert.equal(B3.number,'51');assert.equal(B3.settled,false);
 C.leave();A2.leave();await wait();B3.tick();const left=now;advance([B3],left+12);
 assert.equal(B3.role,'host','the guest hosts');assert.equal(B3.number,'88','in the car it had asked for');assert(B3.settled);
 B3.leave();
 report.cars={host:A2.number,guests:[B2.number,C.number],reloaded:B3.number};
}
// The way into a race: a guest let in picks its car and only then waits for the start ("Aguardar
// início da corrida"). The host seats the waiting guests in the race it holds on the grid, whoever
// says so before the start too; a guest that takes it back gives its seat up; after the start, the
// next race.
{
 let now=0;const clock=()=>now,name='espera-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const settle=async(rooms,n=3)=>{for(let i=0;i<n;i++){await wait();advance(rooms,now+.2);}};
 const A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia',want:'19',clock});
 const got={B:[],C:[]};B.on('race',race=>{got.B.push(race.id);return true;});
 A.start();advance([A],1);B.start();await settle([A,B]);
 assert.equal(B.number,'19','let in: a car, not a seat in a race yet');assert.equal(B.waiting,false);
 assert.deepEqual(A.members.map(m=>[m.number,m.wait]),[['99',true],['19',false]],'the room knows who is still picking');
 assert.deepEqual(B.members.map(m=>m.wait),[true,false],'the guests too');
 // The host holds a race on the grid: the guest still picking has no seat in it and loads nothing.
 const race=A.planRace({circuit:'interlagos',laps:1});A.openRace(race);await settle([A,B]);
 assert.deepEqual(race.seats.map(s=>s.number),['99']);assert.deepEqual(got.B,[]);assert.equal(B.race,null);
 // "Aguardar início da corrida": seated at once in the race that waits, and it loads it.
 B.setWaiting(true);await settle([A,B]);
 assert.deepEqual(race.seats.map(s=>s.number),['99','19']);assert.deepEqual(got.B,[race.id]);assert.equal(B.race.id,race.id);
 B.sendReady();await settle([A,B]);assert(A.ready.has(B.id));
 // Taken back (the guest left the grid for the car screen): no seat, not ready; waiting again, seated again.
 B.setWaiting(false);assert.equal(B.race,null);await settle([A,B]);
 assert.deepEqual(race.seats.map(s=>s.number),['99']);assert(!A.ready.has(B.id),'no longer counted as ready');assert.deepEqual(got.B,[race.id]);
 B.setWaiting(true);await settle([A,B]);assert.deepEqual(got.B,[race.id,race.id],'it loads the race again');B.sendReady();await settle([A,B]);
 // Someone arrives while the grid waits: let in, picking a car, then waiting: seated before the start.
 const C=new Room({room:name,name:'Caio',want:'64',clock});C.on('race',race=>{got.C.push(race.id);return true;});C.start();await settle([A,B,C]);assert.equal(C.number,'64');assert.deepEqual(race.seats.length,2);
 C.setWaiting(true);await settle([A,B,C]);assert.deepEqual(race.seats.map(s=>s.number),['99','19','64']);assert.deepEqual(got.C,[race.id]);
 C.sendReady();await settle([A,B,C]);A.lightsOut();await settle([A,B,C]);
 assert.equal(race.state,'racing');assert.equal(race.seats.length,3);
 // After the start nobody else gets in: a waiting guest that arrives now races the next one.
 const D=new Room({room:name,name:'Duda',wait:true,clock});let dRaces=0;D.on('race',()=>{dRaces++;return true;});D.start();await settle([A,B,C,D]);
 assert.equal(race.seats.length,3);assert.equal(dRaces,0);assert(A.members.some(m=>m.id===D.id&&m.wait));
 A.closeRace();const next=A.planRace({circuit:'interlagos',laps:1});A.openRace(next);await settle([A,B,C,D]);
 assert.equal(next.seats.length,4,'everyone still waiting races the next one');assert.equal(dRaces,1);
 assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',wait:true}),true);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',wait:'1'}),false);
 A.leave();B.leave();C.leave();D.leave();
 report.waiting={seats:next.seats.map(s=>s.number)};
}
// A guest's line drops in the middle of a race (players' report: "um player caiu e o carro virou
// iA"): its car waits for it with nobody at the wheel (multiplayer.js strand), the host tells everyone
// where it stands (stops), and back in the room the pilot gets the car again, as the same player, in
// the same seat. A reloaded page (it no longer waits for that race) and a race that ended do not; a
// guest that leaves the race by the menu leaves its car, for good.
{
 let now=0;const clock=()=>now,name='queda-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const settle=async(rooms,n=3)=>{for(let i=0;i<n;i++){await wait();advance(rooms,now+.2);}};
 // Seconds of racing, the windows that tick hearing each other meanwhile.
 const run=async(rooms,secs)=>{const end=now+secs;while(now<end-1e-9){advance(rooms,Math.min(end,now+.5));await wait();}};
 // A window whose line is dead: it hears nothing (and, not ticking, says nothing).
 const deaf=room=>{const on=room.channel.onmessage;room.channel.onmessage=null;return ()=>room.channel.onmessage=on;};
 const tab=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};},guestTab=tab();
 const A=new Room({room:name,name:'Ana',want:'73',clock}),B=new Room({room:name,name:'Bia',want:'64',wait:true,clock,storage:guestTab}),C=new Room({room:name,name:'Caio',want:'19',wait:true,clock});
 const log=[];A.on('leave',p=>log.push('leave '+p.number)).on('seats',r=>log.push('seats '+r.seats.map(s=>s.number).join()));
 let cSeats=null;B.on('race',()=>true);C.on('race',()=>true).on('seats',r=>cSeats=r.seats.map(s=>s.number).join());
 A.start();advance([A],1);B.start();C.start();await settle([A,B,C],4);
 const race=A.planRace({circuit:'interlagos',laps:3});A.openRace(race);await settle([A,B,C]);B.sendReady();C.sendReady();await settle([A,B,C],2);A.lightsOut();await settle([A,B,C],2);
 assert.deepEqual(race.seats.map(s=>s.number),['73','64','19']);assert.equal(B.race.state,'racing');
 // Bia's line goes dead (she hears nothing, says nothing): after the silence the host lets her go,
 // her car stands without her (the host's game says how: stops), and her seat waits for her.
 const id=B.id,hear=deaf(B);await run([A,C],4);
 assert(log.includes('leave 64'));assert.deepEqual(race.seats.map(s=>s.number),['73','19']);assert.deepEqual(A.info().away,[{id,name:'Bia',number:'64'}]);
 assert.equal(cSeats,'73,19','the other guest hears she is out of her seat');
 // Her car is not free meanwhile: someone in the room but out of the race neither gets it on arriving
 // nor by picking it on the car screen (answered all the same).
 const D=new Room({room:name,name:'Duda',want:'64',clock});D.start();await settle([A,C,D],4);
 assert.notEqual(D.number,'64','a car whose pilot is away is taken');D.choose('64');await settle([A,C,D]);assert.notEqual(D.number,'64');assert.equal(D.settled,true,'the choice is answered');
 D.leave();await settle([A,C]);
 A.setStops([{number:'64',stage:'parado',back:true}]);await settle([A,C]);assert.deepEqual(C.lobby.stops,[{number:'64',stage:'parado',back:true}],'and where her car stands');
 A.setStops([{number:'64',stage:'reboque',back:true}]);await settle([A,C]);assert.deepEqual(C.info().stops,[{number:'64',stage:'reboque',back:true}]);
 // The side the tow takes it to (each window draws the truck on that way) is news too.
 A.setStops([{number:'64',stage:'reboque',back:true,side:-1}]);await settle([A,C]);assert.deepEqual(C.info().stops,[{number:'64',stage:'reboque',back:true,side:-1}]);
 A.setStops([{number:'64',stage:'reboque',back:true}]);await settle([A,C]);assert.equal(A.lineQuiet(),false,'the same-machine room has no line of its own');
 // The same list every frame is no news (no lobby sent for it); whether her pilot may come back is.
 let beacons=0;const beacon=A.beacon.bind(A);A.beacon=(...args)=>{beacons++;return beacon(...args);};
 A.setStops([{number:'64',stage:'reboque',back:true}]);A.setStops([{number:'64',stage:'reboque'}]);assert.equal(beacons,0,'no news');
 A.setStops([{number:'64',stage:'reboque',back:false}]);assert.equal(beacons,1);A.setStops([{number:'64',stage:'reboque',back:true}]);A.beacon=beacon;
 const lobby=stops=>({t:'lobby',from:A.id,name:'x',age:1,players:[],race:null,stops});
 assert.equal(validMessage(lobby([{number:'64',stage:'fora'}])),true,'a host that does not say back');assert.equal(validMessage(lobby([{number:'64',stage:'fora',back:false}])),true);assert.equal(validMessage(lobby(undefined)),true,'a host without stops');
 assert.equal(validMessage(lobby([{number:'64',stage:'reboque',side:1}])),true);
 for(const bad of [[{number:'64',stage:'voando'}],[{number:'666',stage:'fora'}],[{number:'64',stage:'fora',back:'sim'}],[{number:'64',stage:'reboque',side:2}],[{number:'64',stage:'reboque',side:'esquerda'}],'64',[null],Array.from({length:16},()=>({number:'64',stage:'fora'}))])assert.equal(validMessage(lobby(bad)),false);
 // Her line is back (still in that race, waiting for nothing else): the same seat, the same car.
 hear();log.length=0;await settle([A,B,C],4);A.setStops([]);await settle([A,B,C]);assert.deepEqual(C.lobby.stops,[]);
 assert.deepEqual(race.seats.map(s=>[s.id,s.number]),[[A.id,'73'],[C.id,'19'],[id,'64']],'back in her seat');assert(log.includes('seats 73,19,64'),'the host game hears it (multiplayer.js seatHumans)');
 assert.deepEqual(A.info().away,[]);assert.equal(B.number,'64');assert(B.race.seats.some(s=>s.id===id));assert.equal(cSeats,'73,19,64');
 assert(A.trail.some(t=>t.endsWith('voltou '+id)));
 report.drop={back:race.seats.map(s=>s.number),trail:A.trail.filter(t=>/saiu|voltou/.test(t)).length};
 // Silent again, then the page reloaded (F5): the new page no longer races that race (it waits for
 // nothing yet): not seated; the car stays without a driver.
 deaf(B);await run([A,C],4);assert.deepEqual(race.seats.map(s=>s.number),['73','19']);
 B.channel.close();const B2=new Room({room:name,name:'Bia',want:'64',clock,storage:guestTab});B2.start();await settle([A,B2,C],4);
 assert.equal(B2.id,id);assert.equal(B2.number,'64','the reloaded tab keeps its car');assert.deepEqual(race.seats.map(s=>s.number),['73','19'],'a reload is out of the race');
 // Caio drops and the race ends before he is back: no seat waits any more, no car stands.
 deaf(C);await run([A,B2],4);assert.deepEqual(A.info().away.map(s=>s.number),['19']);A.setStops([{number:'19',stage:'fora'}]);
 A.closeRace();assert.deepEqual(A.info().away,[]);assert.deepEqual(A.info().stops,[]);
 // Another race: Bia waits again, races, and leaves it by the menu (no longer waiting): out of her
 // seat, her car left ('leave'), and no seat waits for her.
 B2.on('race',()=>true);B2.setWaiting(true);const race2=A.planRace({circuit:'interlagos',laps:3});A.openRace(race2);await settle([A,B2]);B2.sendReady();await settle([A,B2],2);A.lightsOut();await settle([A,B2],2);
 assert.deepEqual(race2.seats.map(s=>s.number),['73','64']);log.length=0;
 B2.setWaiting(false);await settle([A,B2]);
 assert(log.includes('leave 64'),'her car is left');assert.deepEqual(race2.seats.map(s=>s.number),['73']);assert.deepEqual(A.info().away,[],'nobody waits for a pilot who left');assert(A.members.some(m=>m.id===id),'she is still in the room');
 A.leave();B2.leave();C.leave();
}
// Same machine: in a race under way a guest waits a long while (RACE_HOST_WAIT) for a host gone quiet,
// the race standing still meanwhile (multiplayer.js pause), instead of electing another host after
// SILENT and leaving that race behind.
{
 let now=0;const clock=()=>now,name='espera-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const settle=async(rooms,n=3)=>{for(let i=0;i<n;i++){await wait();advance(rooms,now+.2);}};
 const A=new Room({room:name,name:'Ana',want:'73',clock}),B=new Room({room:name,name:'Bia',want:'64',wait:true,clock});B.on('race',()=>true);
 A.start();advance([A],1);B.start();await settle([A,B],4);
 const race=A.planRace({circuit:'interlagos',laps:3});A.openRace(race);await settle([A,B]);B.sendReady();await settle([A,B],2);A.lightsOut();await settle([A,B],2);
 assert.equal(B.race.state,'racing');A.channel.onmessage=null;
 advance([B],now+60);await wait();assert.equal(B.role,'guest','a minute without its host: still its guest');
 advance([B],now+600);assert.notEqual(B.role,'guest','ten minutes: the room goes on without it');
 A.leave();B.leave();
}
// Online, the line itself: the tab asks the room server for an echo every second (the server answers
// it, whatever the host is doing); no echo for a few seconds is a dead connection the browser has not
// noticed yet: it connects again. A stalled host is no reason, nor is a server without the echo. A
// link that dropped keeps trying, and a tab back with the same id keeps its race.
{
 let now=0;const clock=()=>now,calls=[],sent=[];
 const link={open:()=>calls.push('open'),send:m=>sent.push(m.t),close:()=>calls.push('close'),reconnect:()=>calls.push('reconnect')};
 const G=new Room({room:'linha',name:'Gil',wait:true,link,clock}),host='0000000b',me='0000000a';G.on('race',()=>true);
 const tick=to=>{while(now<to-1e-9){now=Math.min(to,now+.1);G.tick();}};
 G.start();G.receive({t:'welcome',id:me,token:'0'.repeat(32),role:'guest',host,pending:false});
 const seats=[{id:host,name:'Ana',number:'99'},{id:me,name:'Gil',number:'73'}],players=seats.map(s=>({...s,pick:0,wait:true}));
 const lobby=state=>G.receive({t:'lobby',from:host,name:'Ana',age:5,players,race:{id:'00000abc',circuit:'interlagos',laps:1,seed:1,car:'99',ace:false,retirements:true,ghosts:false,level:null,seats,state}});
 lobby('waiting');assert.equal(G.race?.id,'00000abc');lobby('racing');assert.equal(G.race.state,'racing');
 // A server without the echo (one not updated yet): asked, never answered, never checked.
 tick(10);assert.deepEqual(calls,['open']);assert(sent.filter(t=>t==='eco').length>=9,'an echo asked every second');
 // The server echoes: the line is alive, even with the host silent (stalled: no pongs, no snapshots).
 for(let t=11;t<=20;t++){tick(t);G.receive({t:'eco'});}
 assert.deepEqual(calls,['open']);
 // An echo a little late is the line down already (lineQuiet: multiplayer.js stands a host's race still).
 assert.equal(G.lineQuiet(),false);tick(22);assert.equal(G.lineQuiet(),false,'2 s: not yet');tick(23);assert.equal(G.lineQuiet(),true,'3 s without an echo');
 // No echo: one reconnect after LINK_QUIET (10 s), not one per frame.
 tick(29);assert.deepEqual(calls,['open']);tick(30.6);assert.deepEqual(calls,['open','reconnect']);tick(32);assert.deepEqual(calls,['open','reconnect']);
 // A frozen window (its own long frame) is not the line's silence.
 G.receive({t:'eco'});now+=7;G.tick();assert.deepEqual(calls,['open','reconnect']);
 // The line down: nothing to check until it is open again; then the new connection has LINK_QUIET to echo.
 G.closed('reconectando');assert.equal(G.lineQuiet(),true);tick(now+10);assert.deepEqual(calls,['open','reconnect']);
 link.onopen();tick(now+9.5);assert.deepEqual(calls,['open','reconnect']);tick(now+1);assert.deepEqual(calls,['open','reconnect','reconnect']);
 link.onopen();G.receive({t:'eco'});
 // The quick tries ran out ('fora'): the tab is still who it was, and back with the same id it is
 // still in its race.
 G.closed('fora');assert.equal(G.role,'guest');assert.equal(G.race?.id,'00000abc');
 G.receive({t:'welcome',id:me,token:'0'.repeat(32),role:'guest',host,pending:false});assert.equal(G.race?.id,'00000abc','same id: same race');assert.equal(G.problem,null);
 // Its seat in that race is from before the drop until the host's next lobby (multiplayer.js checkCut
 // takes its car back only then).
 assert.equal(G.outdated,true,'what it knows is from before the drop');lobby('racing');assert.equal(G.outdated,false,'the host has spoken since');
 // The key asked for again mid-race (refused twice: the role is gone) and typed: the welcome of that
 // new connection forgets the race; the host's next lobby, seating this window still, gives it back
 // (else the host's snapshots never reached it again, and multiplayer.js checkCut waited for ever).
 let seatsHeard=0;G.on('seats',()=>seatsHeard++);
 G.closed('chave');assert.equal(G.role,null);G.start();G.receive({t:'welcome',id:me,token:'0'.repeat(32),role:'guest',host,pending:false});
 assert.equal(G.race,null,'the welcome forgot the race');lobby('racing');assert.equal(G.race?.id,'00000abc','seated in it: the race under way again');assert.equal(seatsHeard,1);
 let snaps=0;G.on('snap',()=>snaps++);G.receive({t:'snap',from:host,race:'00000abc',seq:1,cars:[]});assert.equal(snaps,1,'the host\'s snapshots reach it again');
 // A host whose line drops forgets who knocked (they may have gone meanwhile); welcomed back as the
 // host, it hears every knock still at the door again (the server knocks them again).
 const H=new Room({room:'porta',name:'Ana',link:{open(){},send(){},close(){},reconnect(){}},clock}),hostId='0000000e',hostWelcome={t:'welcome',id:hostId,token:'2'.repeat(32),role:'host',host:hostId,pending:false};
 H.start();H.receive(hostWelcome);H.receive({t:'knock',id:'0000000d',name:'Duda'});assert.deepEqual(H.info().knocks.map(k=>k.name),['Duda']);
 H.closed('fora');assert.equal(H.role,'host','still the host, trying again');assert.deepEqual(H.info().knocks,[],'nobody shown at the door meanwhile');
 H.receive(hostWelcome);H.receive({t:'knock',id:'0000000f',name:'Edu'});assert.deepEqual(H.info().knocks.map(k=>k.name),['Edu']);
 // The server lost the room (a restart): a new id is a new player, out of that race.
 G.receive({t:'welcome',id:'0000000c',token:'1'.repeat(32),role:'guest',host,pending:true});assert.equal(G.race,null);assert.equal(G.id,'0000000c');
 // net-link.js: after the quick tries it goes on trying, every 15 s.
 const reasons=[],sockets=[],fake=()=>{const ws={readyState:0,send(){},close(code){ws.closed=code;}};sockets.push(ws);return ws;};
 const server=new ServerLink({url:'ws://x',room:'linha',key:()=>'k',pass:()=>({passe:'p',validade:3600000}),storage:null,socket:fake});server.onclose=r=>reasons.push(r);
 // (the account's pass first: kept, it lets every later connection go at once)
 await server.passFor();
 server.open();sockets[0].readyState=1;sockets[0].onopen();
 // A reconnect opens a new socket at once and leaves the old one to the server (no goodbye: a false
 // alarm costs nothing); the old one closing later says nothing. None while the new one connects.
 server.reconnect();assert.equal(sockets.length,2);assert.equal(sockets[0].closed,undefined,'the old one is not closed here');assert.deepEqual(reasons,[]);
 server.reconnect();assert.equal(sockets.length,2,'not while the new one is connecting');
 sockets[1].readyState=1;sockets[1].onopen();sockets[0].onclose({code:4010});assert.deepEqual(reasons,[],'the server closing the old one says nothing');
 for(let i=0;i<6;i++)server.lost();assert.deepEqual(reasons,['reconectando','reconectando','reconectando','reconectando','reconectando','fora']);assert(server.retry,'still trying');
 // Only a welcome starts the tries over: a server that lets each connection in and closes it at once
 // (an error, 1011) goes on waiting the longest (before, each open started over at 1 s, for ever).
 const welcome=ws=>ws.onmessage({data:JSON.stringify({t:'welcome',id:'0000000a',token:'0'.repeat(32),role:'guest',host:'0000000b',pending:false})});
 reasons.length=0;for(let i=0;i<3;i++){server.open();const s=sockets.at(-1);s.readyState=1;s.onopen();s.onclose({code:1011});}
 assert.deepEqual(reasons,['fora','fora','fora']);assert.equal(server.tries,9);
 // The server's time for the key ran out (a slow connection: 4012, sala-cloudflare CLOSE.late): a line
 // that dropped, tried again, the first connection as any other; a wrong key (4001): the card asks for it.
 reasons.length=0;server.open();const s1=sockets.at(-1);s1.readyState=1;s1.onopen();welcome(s1);assert.equal(server.tries,0,'welcomed: the tries start over');
 s1.onclose({code:4012});assert.deepEqual(reasons,['reconectando']);
 server.open();const s2=sockets.at(-1);s2.readyState=1;s2.onopen();welcome(s2);
 s2.onclose({code:4012});assert.deepEqual(reasons,['reconectando','reconectando']);server.open();sockets.at(-1).onclose({code:4001});assert.deepEqual(reasons,['reconectando','reconectando','chave'],'a wrong key is asked for at once');
 // The door full (4013, CLOSE.door: room is made as the host lets guests in) and something sent before
 // the key (1008): tried again as well, never a refusal the player has to answer.
 reasons.length=0;for(const code of [4013,1008]){server.open();const s=sockets.at(-1);s.readyState=1;s.onopen();welcome(s);s.onclose({code});}
 assert.deepEqual(reasons,['reconectando','reconectando']);assert.equal(CLOSED[4013],undefined);
 server.close();
 // Which connection the room hears after a reconnect: the old one until the new one's welcome, then the
 // new one only (before, both fed the room, and a new one that failed left it "reconectando" while the
 // old one still talked); sent the same way. A new one that fails while the old one still works (a
 // false alarm) leaves the old one on, without a word.
 {
  const heard=[],socks=[],said=[],mk=()=>{const ws={readyState:0,sent:[],send(d){ws.sent.push(JSON.parse(d).t);},close(code){ws.closed=code;}};socks.push(ws);return ws;};
  const line=new ServerLink({url:'ws://x',room:'linha',key:()=>'k',pass:()=>({passe:'p',validade:3600000}),storage:null,socket:mk});line.onmessage=m=>heard.push(m.t);line.onclose=r=>said.push(r);await line.passFor();
  const msg=(ws,t)=>t==='welcome'?welcome(ws):ws.onmessage({data:JSON.stringify({t})});
  line.open();const [old]=socks;old.readyState=1;old.onopen();msg(old,'welcome');msg(old,'lobby');
  line.reconnect();const neu=socks[1];msg(old,'snap');line.send({t:'eco'});assert.deepEqual(old.sent,['auth','eco'],'sent through the old one meanwhile');
  neu.readyState=1;neu.onopen();msg(neu,'welcome');msg(old,'snap');msg(neu,'snap');
  assert.deepEqual(heard,['welcome','lobby','snap','welcome','snap'],'the old one is not heard once the new one is in');
  line.send({t:'eco'});assert.deepEqual(neu.sent,['auth','eco']);
  line.reconnect();socks[2].onclose({code:1006});assert.deepEqual(said,[],'a false alarm says nothing');assert.equal(line.ws,neu);msg(neu,'lobby');assert.equal(heard.at(-1),'lobby');
  line.close();assert.equal(neu.closed,1000);
 }
}
// The account and the password (net-link.js): the pass first, kept for new connections while fresh; not
// signed in, no nickname: the card says so and nothing connects; the accounts server out of reach: tried
// again; no password and no invitation: asked at once; an invitation stands for the password, and one the
// server refused goes; a pass the server refused is never offered again.
{
 let problem={problema:'conta'},key='',invite=null,forgot=0,asked=0;const reasons=[],sockets=[];
 const fake=()=>{const ws={readyState:0,sent:[],send(d){ws.sent.push(JSON.parse(d));},close(code){ws.closed=code;}};sockets.push(ws);return ws;};
 const link=new ServerLink({url:'ws://x',room:'conta',key:()=>key,pass:async()=>{asked++;return problem;},invite:()=>invite,forgetInvite:()=>{forgot++;invite=null;},storage:null,socket:fake});
 link.onclose=r=>reasons.push(r);
 link.open();await wait();assert.deepEqual(reasons,['conta']);assert.equal(sockets.length,0,'not signed in: no connection');
 problem={problema:'apelido'};link.open();await wait();assert.equal(reasons.at(-1),'apelido');
 problem=null;link.open();await wait();assert.equal(reasons.at(-1),'contas','the accounts server out of reach');assert(link.retry,'tried again');clearTimeout(link.retry);
 problem={passe:'p1',validade:300000};link.open();await wait();assert.equal(reasons.at(-1),'chave','no password: asked at once');assert.equal(sockets.length,0);
 invite='convite-x';link.open();assert.equal(sockets.length,1,'the pass kept: at once');sockets[0].readyState=1;sockets[0].onopen();
 assert.deepEqual(sockets[0].sent[0],{t:'auth',key:'',passe:'p1',token:null,convite:'convite-x'},'the invitation instead of the password');
 sockets[0].onclose({code:4001});assert.equal(forgot,1,'refused: the invitation goes');assert.equal(reasons.at(-1),'chave');
 key='senha';const before=asked;link.open();assert.equal(sockets.length,2);assert.equal(asked,before);
 sockets[1].readyState=1;sockets[1].onopen();assert.equal(sockets[1].sent[0].key,'senha');assert.equal(sockets[1].sent[0].convite,undefined);
 sockets[1].onclose({code:4014});assert.equal(reasons.at(-1),'passe');link.open();await wait();assert.equal(asked,before+1,'a refused pass is asked for anew');
 // An invitation its host cancelled (4016): said as such, and gone from this browser.
 key='';invite='convite-y';const n=sockets.length;link.open();await wait();const s3=sockets[n];s3.readyState=1;s3.onopen();assert.equal(s3.sent[0].convite,'convite-y');
 s3.onclose({code:4016});assert.equal(reasons.at(-1),'convite');assert.equal(forgot,2);assert.equal(invite,null);
 // The rooms switched off (the accounts server's 503, the room server's 4015): said as such, asked again in a
 // minute, never as a dropped line tried every 15 s.
 link.close();
 {
  let problem={problema:'salas'};const said=[],socks=[];
  const off=new ServerLink({url:'ws://x',room:'desligada',key:()=>'k',pass:async()=>problem,storage:null,socket:()=>{const ws={readyState:0,send(){},close(){}};socks.push(ws);return ws;}});
  off.onclose=r=>said.push(r);off.open();await wait();
  assert.deepEqual(said,['salas']);assert.equal(socks.length,0);assert(off.retry,'asked again later');assert.equal(off.tries,0,'not counted as a dropped line');clearTimeout(off.retry);
  problem={passe:'p',validade:300000};off.open();await wait();socks[0].readyState=1;socks[0].onopen();socks[0].onclose({code:4015});
  assert.deepEqual(said,['salas','salas']);assert(off.retry);off.close();
  assert.equal(CLOSED[4015],undefined,'not a refusal the player answers');
 }
}
// The chat (net-room.js say, chat-text.js): cleaned, no links, one line every CHAT_GAP, not from the door;
// a line from the room is cleaned on arrival too. A room nobody opened: a guest waits at the door without a
// host; let in, it learns whose room it is; a room left without a host says so (host: null). The host's
// invitations: who is online and what became of each, checked as they come; a guest asks for neither.
{
 let now=0;const sent=[],link={open(){},send(m){sent.push(m);},close(){},reconnect(){}},clock=()=>now;
 const G=new Room({room:'conversa',name:'Gil',link,clock});G.start();
 G.receive({t:'welcome',id:'0000000a',token:'0'.repeat(32),role:'guest',host:null,pending:true});
 assert.equal(G.hostId,null);assert.equal(G.say('oi'),false,'not from the door');
 G.receive({t:'host',id:'0000000b'});assert.equal(G.hostId,'0000000b');
 G.receive({t:'admitted',host:'0000000c'});assert.equal(G.hostId,'0000000c','let in: whose room it is');assert.equal(G.pending,false);
 const heard=[];G.on('chat',l=>heard.push(l));
 assert.equal(G.say('  oi‮  galera '),true);assert.deepEqual(sent.at(-1),{t:'chat',name:'Gil',text:'oi galera',from:'0000000a'});
 assert.equal(G.say('de novo'),false,'too soon');now+=2.1;assert.equal(G.say('www.x.com'),false,'no links');assert.equal(G.say('   '),false);
 G.receive({t:'chat',from:'0000000c',name:'Ana​',text:'boa‮ sorte'});G.receive({t:'chat',from:'0000000c',name:'Ana',text:'site.com'});
 assert.deepEqual(heard.map(l=>[l.name,l.text,!!l.mine]),[['Gil','oi galera',true],['Ana','boa sorte',false]]);
 G.receive({t:'host',id:null});assert.equal(G.hostId,null,'the host gone for good, nobody to take over');
 const H=new Room({room:'convites',name:'Ana',link,clock});H.start();H.receive({t:'welcome',id:'0000000d',token:'1'.repeat(32),role:'host',host:'0000000d',pending:false});
 const lists=[],answers=[];H.on('online',l=>lists.push(l)).on('invited',(a,d)=>answers.push([a,d]));
 const conta='A'.repeat(22);H.askOnline();assert.deepEqual(sent.at(-1),{t:'online',from:'0000000d'});
 H.receive({t:'online',pilotos:[{conta,nome:'Eva‮',convidado:true}]});assert.deepEqual(lists,[[{conta,nome:'Eva',convidado:true}]]);
 H.receive({t:'online',pilotos:[{conta:'curta',nome:'X'}]});assert.equal(lists.length,1,'checked as it comes');
 H.invite(conta,'Convites_x');assert.deepEqual(sent.at(-1),{t:'convidar',conta,endereco:'Convites_x',from:'0000000d'});
 H.receive({t:'convidado',conta,entregue:true});assert.deepEqual(answers,[[conta,true]]);
 // An invitation cancelled before it is taken (the wrong pilot): asked, and the answer heard.
 const undone=[];H.on('uninvited',(a,ok)=>undone.push([a,ok]));H.uninvite(conta);assert.deepEqual(sent.at(-1),{t:'desconvidar',conta,from:'0000000d'});
 H.receive({t:'desconvidado',conta,ok:true});H.receive({t:'desconvidado',conta:'x',ok:true});assert.deepEqual(undone,[[conta,true]],'checked as it comes');
 const early=[];H.on('invited',(a,d,e)=>early.push(e));H.receive({t:'convidado',conta,entregue:false,cedo:true});assert.deepEqual(early,[true],'too soon: said so');
 const count=sent.length;G.askOnline();G.invite(conta,'x');G.uninvite(conta);assert.equal(sent.length,count,'a guest asks for none of it');
 assert.equal(CLOSED[4016],'convite','a cancelled invitation is told as such');
 assert.ok(chatLink('acesse meusite . com')&&chatLink('http://x')&&!chatLink('Bom. Com certeza')&&!chatLink('1:23.456'));
 assert.equal(chatText('ㅤ'),'');assert.equal([...chatText('é'.repeat(200))].length,CHAT_LENGTH);
 // The invitation a pilot took is kept for that room only, and goes when refused.
 const store=new Map(),fakeStore={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 keepInvite(fakeStore,'convites','tok');keepInvite(fakeStore,'Outra Sala','x');assert.equal(savedInvite(fakeStore,'convites'),'tok');assert.equal(store.size,1,'a room\'s name only');
 dropInvite(fakeStore,'convites');assert.equal(savedInvite(fakeStore,'convites'),null);
 report.chat='ok';
}
// What a car carries beside its motion (net-room.js validExtra): its pilot on foot and its parts held open, in a
// guest's state and in each car of the host's snapshot; ranges checked. The pilots' looks (pilot-look.js) in hello
// and in the host's list, taken through normalizeLook (an unknown choice becomes the default).
{
 const walk=[10.5,-20.25,3.1,1.57,1,0.5,0];
 assert(validExtra({pe:walk})&&validExtra({ab:5})&&validExtra({pe:walk,ab:127})&&validExtra({}));
 for(const bad of [{pe:[1,2,3]},{pe:[1e6,0,0,0,0,0,0]},{pe:[0,0,0,0,2,0,0]},{pe:[0,0,0,0,0,1.5,0]},{pe:[0,0,0,0,0,0,99]},{ab:128},{ab:-1},{ab:1.5},null,[],'x'])assert(!validExtra(bad),JSON.stringify(bad));
 const base={t:'state',from:'0000000a',race:'0000000b',seq:1,lat:0,car:packCar({x:0,y:0,z:0,heading:0,pitch:0,roll:0,vx:0,vy:0,vz:0,yaw:0,pitchRate:0,rollRate:0,steer:0,spin:0,rearSpin:0,rpm:900,gear:1,latAccel:0,longAccel:0,rearSlipSpeed:0,laps:0,best:null,surface:{z:0}})};
 assert(validMessage({...base,pe:walk,ab:3}));assert(!validMessage({...base,pe:[0]}));assert(!validMessage({...base,ab:999}));
 const snap=c=>validMessage({t:'snap',from:'0000000a',race:'0000000b',seq:1,cars:[c]});
 assert(snap(['64',0,base.car])&&snap(['64',0,base.car,{pe:walk}])&&snap(['64',0,base.car,{ab:1}]));
 assert(!snap(['64',0,base.car,{pe:[0]}])&&!snap(['64',0,base.car,'x'])&&!snap(['64',0,base.car,{},1]));
 // Looks: a guest's hello carries its own; the host's list hands each one on; an unknown choice becomes the default.
 let now=0;const sent=[],link={open(){},send(m){sent.push(m);},close(){},reconnect(){}},clock=()=>now;
 const G=new Room({room:'visual',name:'Gil',link,clock});G.start();G.receive({t:'welcome',id:'0000000a',token:'0'.repeat(32),role:'guest',host:'0000000b',pending:false});
 const look={gender:'mulher',suit:'azul',gloves:'branca',hair:'rabo',hairColor:'ruivo',beard:'barba',helmet:'topo',helmetColor:'prata',helmetDetail:'azul',visor:'dourada'};
 G.setLook(look);const hello=sent.filter(m=>m.t==='hello').at(-1);assert.equal(hello.look.suit,'azul');assert.equal(hello.look.beard,'sem','a woman wears no beard');
 const n=sent.length;G.setLook({...look});assert.equal(sent.length,n,'the same look again: nothing said');
 assert(!validMessage({...hello,look:{suit:{x:1}}})&&!validMessage({...hello,look:{nada:'x'}})&&validMessage({...hello,look:null}));
 const H=new Room({room:'visual',name:'Ana',link,clock});H.start();H.receive({t:'welcome',id:'0000000b',token:'1'.repeat(32),role:'host',host:'0000000b',pending:false});
 H.setLook({suit:'verde'});H.receive({...hello,from:'0000000a',look:{...look,suit:'arco-iris'}});
 const lobby=sent.filter(m=>m.t==='lobby').at(-1);assert.equal(lobby.players.find(p=>p.id==='0000000b').look.suit,'verde');
 assert.equal(lobby.players.find(p=>p.id==='0000000a').look.suit,'vermelho','an unknown suit: the default');
 G.receive(lobby);assert.equal(G.members.find(m=>m.id==='0000000b').look.suit,'verde','the guest knows the host\'s look');
 // A guest's state carries its extras; the host hears them with it.
 G.race={id:'0000000c',state:'racing',seats:[]};G.sendState(base.car,2,{pe:walk,ab:8});const st=sent.at(-1);assert.deepEqual([st.pe,st.ab],[walk,8]);
 G.sendState(base.car,3,null);assert(!('pe' in sent.at(-1))&&!('ab' in sent.at(-1)),'none: nothing extra');
 report.extras='ok';
}
// Two windows opened at once: both host for a moment, then the smaller id keeps the room.
{
 let now=0;const clock=()=>now,name='dupla-'+Math.random().toString(36).slice(2,8),C=new Room({room:name,name:'C',clock}),D=new Room({room:name,name:'D',clock});
 C.start();D.start();now=1;C.tick();D.tick();await wait();await wait();
 assert.deepEqual([C.role,D.role].sort(),['guest','host']);
 const host=C.role==='host'?C:D;assert(host.id<(host===C?D:C).id);assert.equal(host.members.length,2);
 C.leave();D.leave();
}
// A second window that elects itself before hearing the first (a busy host): the older host keeps
// the room, whatever the ids.
for(let trial=0;trial<6;trial++){
 let now=0;const clock=()=>now,name='tarde-'+Math.random().toString(36).slice(2,8),G=new Room({room:name,name:'G',clock}),H=new Room({room:name,name:'H',clock});
 G.start();now=1;G.tick();assert.equal(G.role,'host');
 H.start();now=3;H.tick();assert.equal(H.role,'host','H elected before hearing anyone');
 await wait();await wait();await wait();
 assert.equal(G.role,'host',`the first host keeps the room (trial ${trial})`);assert.equal(H.role,'guest');assert.equal(H.hostId,G.id);
 G.leave();H.leave();
}
// A lying host: names with bidi overrides and zero-width characters reach a guest cleaned all the same.
{
 let now=0;const clock=()=>now,name='nomes-'+Math.random().toString(36).slice(2,8),H=new Room({room:name,name:'H',clock}),G=new Room({room:name,name:'G',wait:true,clock});
 G.on('race',()=>true);H.start();now=1;H.tick();G.start();await wait();await wait();assert.equal(G.role,'guest');
 const raw=new BroadcastChannel('autopobre-sala-'+name),dirty='A​na‮ ',seats=[{id:H.id,name:dirty,number:'99'},{id:G.id,name:'G⁦',number:'73'}];
 raw.postMessage({t:'lobby',from:H.id,name:'Ho‮st',age:9,players:seats,race:{id:'0000abcd',circuit:'interlagos',laps:1,seed:1,car:'99',ace:false,retirements:true,ghosts:false,level:null,seats,state:'waiting'}});
 await wait(30);
 assert.equal(G.lobby.name,'Host');assert.deepEqual(G.lobby.players.map(p=>p.name),['Ana','G']);assert.deepEqual(G.race.seats.map(s=>s.name),['Ana','G']);
 raw.postMessage({t:'go',from:H.id,race:'0000abcd',seats});await wait(30);assert.deepEqual(G.race.seats.map(s=>s.name),['Ana','G']);
 raw.close();H.leave();G.leave();
}
// F5 on the host: its tab keeps the identity, it takes the room back at once and the guest keeps its car.
// A duplicated tab (sessionStorage copied) notices the live twin and takes an identity of its own.
{
 let now=0;const clock=()=>now,name='f5-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const tab=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),copy(){const t=tab();for(const [k,v] of store)t.setItem(k,v);return t;}};};
 const hostTab=tab(),A=new Room({room:name,name:'Ana',clock,storage:hostTab}),B=new Room({room:name,name:'Bia',want:'19',clock,storage:tab()});
 A.start();advance([A],1);B.start();await wait();await wait();assert.equal(B.number,'19');
 advance([A,B],5);const id=A.id,epoch=A.hostEpoch;
 A.leave();await wait();B.tick();assert(B.hostAway);
 const A2=new Room({room:name,name:'Ana',clock,storage:hostTab});A2.start();
 assert.equal(A2.id,id,'the reloaded tab is the same host');assert.equal(A2.role,'host','it hosts again without an election');
 for(let i=0;i<8;i++){await wait();advance([A2,B],now+.25);}
 assert.equal(B.role,'guest');assert.equal(B.hostId,id);assert(!B.hostAway);assert.equal(B.number,'19','the guest keeps its car');
 assert.equal(A2.hostEpoch,epoch,'the room is as old as before the reload (its age decides a clash of hosts)');
 advance([A2,B],now+4);
 const T=new Room({room:name,name:'Tia',clock,storage:hostTab.copy()});T.start();assert.equal(T.id,id);
 for(let i=0;i<6;i++){await wait();advance([A2,B,T],now+.3);}
 assert.notEqual(T.id,id,'the copy took a new identity');assert.equal(T.role,'guest');assert.equal(A2.role,'host');assert.equal(A2.id,id);assert.equal(B.hostId,id);
 A2.leave();B.leave();T.leave();
}
// A simulated delay only postpones delivery.
{
 const name='lag-'+Math.random().toString(36).slice(2,8),E=new Room({room:name,name:'E',lag:40}),F=new Room({room:name,name:'F'});
 let got=0;E.on('change',()=>got++);F.becomeHost(performance.now()/1000);await wait(10);assert.equal(E.role,null,'not yet');await wait(80);assert.equal(E.role,'guest');assert(got>0);E.leave();F.leave();
}

// A car with nobody at the wheel (RaceField stopInput, multiplayer.js strand): as if its driver had
// fainted it rolls on, the grass holding it once off the asphalt; stopped on the road, the tow truck
// comes and pulls it onto the grass; off the road it is left there. Meanwhile the rivals take the
// yellow flag. Seeded: a drop at 25 s rolls off at the next bend; one just after the start stops on the road.
{
 assert.deepEqual(FAINTED,{left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0});
 const dt=1/120,L=data.meta.reconstructed_xy_m;
 // noGrass: nowhere to park it (walls, or no grass on either side, all the way).
 const drop=(seed,who,at,noGrass=false)=>{
  const player=new TestCar(data);player.resetGrid();const field=new RaceField(data,{seed});field.reset(player.surface.s,{grid:true});player.x=player.y=-9999;if(noGrass)field.grassAt=()=>false;
  for(let k=0;k<at*120;k++)field.step(player,dt,5);
  const r=field.rivals[who],c=r.car,stages=[],when={},out={speed:Math.hypot(c.vx,c.vy),stages,when,yellowTop:0};r.stop={stage:'parado'};r.retired=true;
  for(let t=0;t<80&&!(r.stop.stage==='fora'&&t-when.fora>2);t+=dt){
   const input=field.stopInput.call(field,r,0)??null;
   if(r.stop.stage==='parado'&&Math.hypot(c.vx,c.vy)>.4)assert.deepEqual({...input,brake:0},FAINTED,'nobody steers or presses a pedal (the grass may hold it)');
   field.step(player,dt,5);if(stages.at(-1)!==r.stop.stage){stages.push(r.stop.stage);when[r.stop.stage]=t;}
   // Yellow flag: a rival close behind it (60 m) while it is on the road goes no faster than the cap.
   if(r.stop.stage!=='fora')for(const o of field.rivals){if(o===r)continue;const gap=((c.surface.s-o.car.surface.s)%L+L)%L;if(gap>30&&gap<60&&Math.abs(o.car.surface.d-c.surface.d)<4)out.yellowTop=Math.max(out.yellowTop,Math.hypot(o.car.vx,o.car.vy)-Math.hypot(c.vx,c.vy));}
  }
  Object.assign(out,{d:Math.abs(c.surface.d),edge:c.surface.width/2,onRoad:c.surface.onRoad,still:Math.hypot(c.vx,c.vy)});return out;
 };
 const rolled=drop(3,4,25),towed=drop(3,4,4);
 assert.deepEqual(rolled.stages,['parado','fora'],JSON.stringify(rolled));assert(!rolled.onRoad&&rolled.d>rolled.edge+1&&rolled.d<rolled.edge+80,'rolled off and held by the grass: '+JSON.stringify(rolled));
 assert.deepEqual(towed.stages,['parado','reboque','fora'],JSON.stringify(towed));assert(!towed.onRoad&&towed.d>towed.edge+1.5&&towed.still<.5,'pulled onto the grass: '+JSON.stringify(towed));
 assert(towed.when.fora-towed.when.reboque>TOW_ARRIVE,'the truck takes its time to come: '+JSON.stringify(towed.when));
 assert(rolled.yellowTop<25&&towed.yellowTop<25,'the rivals ease off behind it: '+JSON.stringify([rolled.yellowTop,towed.yellowTop]));
 // A pull that never finds a place to park gives up, but a car still on the asphalt stays the tow's:
 // the yellow flag stays with it (it is not "fora").
 const stuck=drop(3,4,4,true);
 assert.deepEqual(stuck.stages,['parado','reboque'],JSON.stringify(stuck));assert(stuck.onRoad&&stuck.still<.5,'held on the road: '+JSON.stringify(stuck));
 // Stopped in the pit lane (a drop at its box, or driving through) it is out of the race's way already,
 // and walled in: left there ('fora', no tow that would steer it into the pit wall), and no yellow
 // flag for the straight beside it, rolling or not. (Before, the tow gave up there and the yellow
 // flag stayed on the main straight until the end.)
 {
  const player=new TestCar(data);player.resetGrid();const field=new RaceField(data,{seed:3});field.reset(player.surface.s,{grid:true});player.x=player.y=-9999;
  const r=field.rivals[4],c=r.car,p=pitRoute(data).at(150);
  Object.assign(c,{x:p.x-p.ty*p.fast,y:p.y+p.tx*p.fast,heading:Math.atan2(p.ty,p.tx),vx:3,vy:0,yaw:0});c.index=c.nearest(c.x,c.y,true).i;c.settle();assert(c.surface.pit,'in the pit lane');
  r.stop={stage:'parado'};r.retired=true;field.step(player,dt,5);assert.deepEqual(field.cautions,[],'rolling in the pit lane: no yellow flag');
  // (the same test the windows' yellow flag uses, multiplayer.js: on the road it is in the way)
  assert.equal(inTheWay(r.stop,c),false);assert.equal(inTheWay(r.stop,field.rivals[0].car),true);assert.equal(inTheWay({stage:'fora'},field.rivals[0].car),false);assert.equal(inTheWay(null,field.rivals[0].car),false);
  for(let k=0;k<20*120&&r.stop.stage==='parado';k++)field.step(player,dt,5);
  assert.equal(r.stop.stage,'fora');assert(c.surface.pit);assert.deepEqual(field.cautions,[]);assert.equal(field.caution(field.rivals[0].car),Infinity);
 }
 // Off the asphalt the grass holds a car nobody drives; at a standstill it stays put.
 const c=new TestCar(data);c.reset(300);c.vx=30;assert.equal(faintedInput(c).brake,0);c.surface={...c.surface,onRoad:false,pit:false};assert(faintedInput(c).brake>0);c.vx=c.vy=0;assert.equal(faintedInput(c).brake,1);
 report.driverless={rolled:{metresOff:Math.round(rolled.d-rolled.edge)},towed:{metresOff:Math.round(towed.d-towed.edge),seconds:Math.round(towed.when.fora)}};
 // The players' case (a car left in the middle of the road, the yellow flag to the end, and no truck):
 // a gentle slope kept a car nobody drives rolling at walking pace down the road for minutes, never
 // stopped, so the truck never came (Chapecó, seed 358632, #10 left 3.9 s in: still 2 m/s 40 s later).
 // Down to a crawl it is stopped: the truck comes, and the car is on the grass soon, pulled along (no
 // jump from one step to the next).
 {
  const chapeco=JSON.parse(fs.readFileSync(new URL('../dados/pista_chapeco.json',import.meta.url)));
  const player=new TestCar(chapeco);player.resetGrid();const field=new RaceField(chapeco,{seed:358632});field.reset(player.surface.s,{grid:true});player.x=player.y=-9999;
  for(let k=0;k<3.9*120;k++)field.step(player,dt,5);
  const r=field.rivals[10],c=r.car,stages=[];let jump=0,last=null,t=0;field.strand(r,'conexão caiu');
  for(;t<60&&r.stop.stage!=='fora';t+=dt){field.step(player,dt,5);if(stages.at(-1)!==r.stop.stage)stages.push(r.stop.stage);if(r.stop.stage==='reboque'&&last)jump=Math.max(jump,Math.hypot(c.x-last[0],c.y-last[1]));last=[c.x,c.y];}
  // (it coasts down from 66 km/h for some 35 s first, then the truck takes 14 s)
  assert.deepEqual(stages,['parado','reboque','fora'],'towed: '+JSON.stringify({t,stages}));assert(t<55,'on the grass in '+t.toFixed(1)+' s');
  assert(!c.surface.onRoad&&Math.abs(c.surface.d)>c.surface.width/2+1.5,'parked past the edge');assert(jump<.1,'pulled, not jumped: '+jump);
  report.driverless.slope={seconds:Math.round(t)};
 }
 // The tow's way (RaceField towPath): from the car, over to the edge, onto the grass, with no sharp
 // turn; a car facing back the way it came is hooked by its tail; a side given is kept.
 {
  const field=new RaceField(data,{seed:3}),c=new TestCar(data);c.reset(300);c.vx=c.vy=0;
  const P=field.towPath(c),start=P.at(0),end=P.at(P.end),q=c.sample(end.x,end.y);
  assert(Math.hypot(start.x-c.x,start.y-c.y)<.6,'it starts at the car');assert(P.park);
  assert(!q.onRoad&&Math.abs(q.d)>q.width/2+2.5,'it ends on the grass: '+JSON.stringify({d:q.d,width:q.width}));
  let turn=0;for(let u=0;u<P.end;u+=.5)turn=Math.max(turn,Math.abs(wrap(P.at(u+.5).heading-P.at(u).heading)));assert(turn<.12,'no sharp turn: '+turn);
  assert.equal(P.flip,false);c.heading+=Math.PI;assert.equal(field.towPath(c).flip,true);assert.equal(field.towPath(c,-P.side).side,-P.side);
 }
}
// The host's field when a pilot is gone mid-race (RaceField strand, multiplayer.js left): a car past
// its flag keeps its result (no tow, no AB: a bot brings it in); one still racing waits with nobody at
// the wheel and is AB at the flag; gone again before taking it back, it waits where it already was;
// its pilot back (reclaim), the wait is over.
{
 const player=new TestCar(data);player.resetGrid();const field=new RaceField(data,{seed:3});field.reset(player.surface.s,{grid:true});
 const done=field.rivals[0],racing=field.rivals[1],placed=()=>FAINTED;
 Object.assign(done,{puppet:placed,finished:true,finishTime:300});field.strand(done,'conexão caiu');
 assert(!done.stop&&!done.retired&&!done.broken&&done.finished&&done.finishTime===300&&done.puppet===null,'a finished car keeps its result');
 racing.puppet=placed;field.strand(racing,'conexão caiu');
 assert.deepEqual([racing.stop,racing.retired,racing.broken.kind,racing.puppet],[{stage:'parado'},true,'conexão caiu',null]);
 racing.stop.stage='reboque';field.strand(racing,'conexão caiu');assert.equal(racing.stop.stage,'reboque','still on the strap');
 field.reclaim(racing);assert.deepEqual([racing.stop,racing.retired,racing.broken],[null,false,null]);
 field.reclaim(done);assert(done.finished&&done.finishTime===300,'the pilot back keeps the result too');
 // Nobody at the wheel all the way to the flag: AB for good. Its pilot back finds it out of the race
 // (reclaim refuses: multiplayer.js handOver leaves it so), and the classification says AB.
 const laps=2,goal=data.meta.reconstructed_xy_m*laps+field.gridLeadIn;
 field.strand(racing,'conexão caiu');racing.progress=goal;field.step(player,1/120,laps);
 assert.equal(racing.stop.flagged,true);assert.equal(racing.finished,false);assert.equal(field.reclaim(racing),false,'its AB stands');
 assert(racing.retired&&racing.stop,'still without its pilot');assert.equal(field.classification(laps).find(r=>r.number===racing.entry.number).dnf,true);
 // Unless its pilot says it finished: the line crossed at the wheel before the host heard it (its
 // window never finishes a car nobody drives).
 assert.equal(field.reclaim(racing,true),true);assert(!racing.stop&&!racing.retired);
 // The car a pilot takes back mid-race stands where it is, not stopped, as far as the race goes.
 const back=new RemoteCar(done.car,{progress:done.progress,finished:true,finishTime:300});assert.equal(back.state.finished,true);assert.equal(back.state.finishTime,300);
}
// A finish line crossed in the host's window while this guest's line was down is crossed here too
// (multiplayer.js resume, TestCar crossLine): from the grid the first lap begins; then a lap closes.
{
 const c=new TestCar(data);c.resetGrid();c.crossLine();assert.deepEqual([c.awaitingStart,c.laps],[false,0]);
 c.clock=100;c.nextCheckpoint=20;c.crossLine();assert.deepEqual([c.laps,c.lastLap,c.lapStart,c.lastLapValid],[1,100,100,true]);
 c.clock=150;c.crossLine();assert.deepEqual([c.laps,c.lastLapValid],[1,false],'a lap short of its checkpoints does not count');
}
// Back in the car after a cut (multiplayer.js resume, TestCar syncLaps): the laps follow the host's
// count of laps that count (as the guest sends its race distance). An invalid lap earlier in the race
// is no lap to take back (the review's case: one lap lost, the lap timer wrong); a line crossed only
// here since the drop is taken back with its lap time and best; one crossed only there is crossed here.
{
 // A car on its third lap: the first cut short (invalid), the second clean in 100 s (best).
 const racing=()=>{const c=new TestCar(data);c.resetGrid();c.crossLine();c.clock=110;c.lapValid=false;c.crossLine();c.clock=210;c.nextCheckpoint=20;c.crossLine();c.clock=300;return c;};
 const books=c=>[c.laps,c.lapStart,c.lapValid,c.best,c.lastLap,c.lastLapValid];
 let c=racing();const before=books(c);assert.deepEqual(before,[1,210,true,100,100,true]);
 c.syncLaps(1,300);assert.deepEqual(books(c),before,'an invalid lap earlier changes nothing');
 // During the cut her car rolled over the line here (in 80 s, a new best), the host's never got there.
 c=racing();c.nextCheckpoint=20;c.clock=290;c.crossLine();c.clock=330;assert.deepEqual([c.laps,c.best],[2,80]);
 c.syncLaps(1,280);assert.deepEqual(books(c),before,'taken back, the lap time and the best with it');
 // An invalid lap closed here during the cut: taken back too (else it closed twice).
 c=racing();c.lapValid=false;c.clock=290;c.crossLine();c.syncLaps(1,280);assert.deepEqual([c.laps,c.lapStart,c.lapValid],[1,210,false]);
 // Crossed there and not here: crossed here (the checkpoints passed there).
 c=racing();c.syncLaps(2,280);assert.deepEqual([c.laps,c.lastLapValid,c.lapStart],[2,true,300]);
 // Crossed on both sides: the lap here is taken back and closed again, once.
 c=racing();c.nextCheckpoint=20;c.clock=290;c.crossLine();c.clock=320;c.syncLaps(2,280);assert.deepEqual([c.laps,c.lastLap,c.lapStart],[2,110,320]);
 // Crossed here before the cut began, never heard by the host (a dead line noticed late): taken back.
 c=racing();c.nextCheckpoint=20;c.clock=270;c.crossLine();c.clock=300;c.syncLaps(1,290);assert.deepEqual(books(c),before);
 // From the grid: the start crossed only here waits again; crossed only there, the first lap begins.
 c=new TestCar(data);c.resetGrid();c.clock=5;c.crossLine();c.syncLaps(-1,4);assert.equal(c.awaitingStart,true);
 c=new TestCar(data);c.resetGrid();c.syncLaps(0,4);assert.deepEqual([c.awaitingStart,c.laps],[false,0]);
}
// multiplayer.js itself during a race, without a page (a Multiplayer with only the parts each check
// reads): the host's own line down is no silence of its guests; a guest's car nobody drives does not
// finish, and one the host had reach the flag without its pilot stays AB; a connection made anew waits
// for the race to come back; the host's word on the cars waiting; the card's words.
{
 const note=()=>{},mp=fields=>Object.assign(Object.create(Multiplayer.prototype),{remotes:new Map(),stopped:new Map(),trucks:new Map(),flags:new Map(),phase:'racing',cut:null,lost:false,pause:null,finishedAt:null},fields);
 const heard=(car,extra={},age=0)=>{const r=new RemoteCar(null);r.receive({...readCar(packCar(car)),...extra},{seq:1});r.age=age;return r;};
 // (a room's line: down while it has a problem, or its echo is late)
 const lineQuiet=function(){return this.problem!==null||!!this.echoLate;};
 // Host: no state from a guest for 10 s while the host's own line is down (closed, or no echo while the
 // browser still has it open), nor just after it is back: its car stays its pilot's; still nothing
 // STRANDED seconds after the line is back: left without a driver. A bot's seat is no guest's.
 {
  const race={id:'0000abcd',car:'99',seats:[{id:'0000000b',name:'Ana',number:'99'},{id:'0000000a',name:'Bia',number:'64'}]};
  const stranded=[],r={puppet:()=>FAINTED,seat:'64'},bot={puppet:()=>FAINTED,seat:'19'},remote=heard(new TestCar(data),{},10);
  const room={id:'0000000b',problem:'fora',lineQuiet,note},m=mp({room,race,immersive:{field:{rivals:[r,bot],strand:car=>stranded.push(car)}}});m.remotes.set('64',remote).set('19',heard(new TestCar(data),{},10));
  m.checkSilence();assert.deepEqual(stranded,[],'the host\'s own line down');
  room.problem=null;m.checkSilence();assert.deepEqual(stranded,[],'just back: its guests\' states take a moment');
  m.lineDown-=6;room.echoLate=true;m.checkSilence();assert.deepEqual(stranded,[],'no echo: the host\'s own line still');
  room.echoLate=false;m.lineDown-=6;m.checkSilence();assert.deepEqual(stranded,[r],'the line back for a while and still nothing: the guest\'s silence');assert.equal(remote.waiting,r);
  // A window the room made its host during someone else's race (every car there a puppet: the old
  // host's and the bots): nobody in it is this window's guest, nobody is left without a driver.
  stranded.length=0;remote.waiting=null;room.id='0000000a';m.checkSilence();assert.deepEqual(stranded,[],'not this window\'s race');
 }
 // The race stands still while its host is out of reach (players' wish: "se o anfitrião cair, pausa
 // todo mundo… e espera ele voltar"): the host's own line down (with other pilots in its race), a
 // guest's host gone from the room or silent; not a guest whose own line is the one down (its car goes
 // on without a driver: checkCut), nor a race the room has lost. The result's wait is put off by as
 // long, and holds meanwhile.
 {
  const t=()=>performance.now()/1000,race={id:'0000abcd',car:'99',seats:[{id:'0000000b',name:'Ana',number:'99'},{id:'0000000a',name:'Bia',number:'64'}]};
  const host=mp({room:{role:'host',id:'0000000b',problem:'fora',away:new Map(),lineQuiet,note},race,immersive:{}});
  host.updatePause();assert.equal(host.pause?.why,'linha');assert.equal(host.frozen(),true);assert.match(host.statusText({}),/^Sua conexão caiu · corrida pausada para todos/);
  host.finishedAt=t()-10;host.pause.since-=4;host.room.problem=null;host.updatePause();assert.equal(host.frozen(),false);assert(Math.abs(t()-host.finishedAt-6)<.5,'the result\'s wait put off');
  const solo=mp({room:{role:'host',id:'0000000b',problem:'fora',away:new Map(),lineQuiet,note},race:{...race,seats:race.seats.slice(0,1)},immersive:{}});solo.updatePause();assert.equal(solo.pause,null,'alone in its race: nothing to stand still for');
  const room={role:'guest',id:'0000000a',problem:null,hostAway:false,hostSeen:t(),lineQuiet,note},guest=mp({room,race,immersive:{}});
  guest.updatePause();assert.equal(guest.pause,null,'the host heard');
  room.hostSeen=t()-3;guest.updatePause();assert.equal(guest.pause?.why,'silencio');assert.match(guest.statusText({}),/^Sem sinal do anfitrião há 3 s · corrida pausada/);
  room.hostAway=true;guest.updatePause();assert.equal(guest.pause.why,'saiu');assert.match(guest.statusText({}),/^O anfitrião caiu/);
  room.hostAway=false;room.hostSeen=t();guest.updatePause();assert.equal(guest.pause,null,'heard again: on it goes');
  // Its own echo late with the host silent too (a stalled server: every echo is late, the host's as
  // well): it stands still with the rest. Its own line closed: its car goes on without a driver (cut).
  room.hostSeen=t()-3;room.echoLate=true;guest.updatePause();assert.equal(guest.pause?.why,'silencio','a stalled server: still with the rest');
  room.echoLate=false;room.problem='reconectando';guest.cut={mine:null,seatedAt:null,clock:0};guest.updatePause();assert.equal(guest.pause,null,'its own line down: its car without a driver');
  room.problem=null;guest.cut=null;guest.lost=true;guest.updatePause();assert.equal(guest.pause,null,'a race the room has lost');
  guest.lost=false;guest.updatePause();guest.immersive={freeFinished:true,finishing:false};assert.equal(guest.holdResults(),true,'the result waits');
 }
 // Guest: its line down, its car with nobody at the wheel; back in its seat, the host's word on it decides.
 {
  const race={id:'0000abcd',car:'99',seats:[{id:'0000000b',name:'Ana',number:'99'},{id:'0000000a',name:'Gil',number:'64'}]};
  const room={role:'guest',id:'0000000a',problem:'fora',outdated:true,race,lobby:{race},note},L=data.meta.reconstructed_xy_m,lead=10,resumed=[];
  const car={laps:2,clock:50,uncrossLine(){this.laps--;return true;}};
  const immersive={car,freeFinished:false,freeTotalLaps:3,data:{meta:{reconstructed_xy_m:L}},field:{gridLeadIn:lead},resetField(){},beginCountdown(){},step:()=>false,stepFree(){immersive.stepped=(immersive.stepped??0)+1;}};
  const m=mp({room,race,seatId:'0000000a',resume:s=>resumed.push(s)});m.attach(immersive);
  m.checkCut();assert(m.cut&&!m.cut.over,'its line down: nobody at the wheel');
  // Meanwhile it rolls over the line ending its last lap: no finish here.
  car.laps=3;immersive.stepFree(1/120,{});assert.equal(car.laps,2,'the line taken back');assert.equal(immersive.stepped,1);
  // A refused key took the role (the card asks for it): still cut.
  room.role=null;room.problem='chave';m.checkCut();assert(m.cut,'still nobody at the wheel');
  // Typed and welcomed anew: the room has forgotten the race until the host's lobby gives it back.
  Object.assign(room,{role:'guest',problem:null,outdated:false,race:null});m.checkCut();assert(m.cut&&m.cut.seatedAt===null,'waiting for the race to come back');assert.equal(m.lost,false);
  room.race=race;m.checkCut();assert.notEqual(m.cut.seatedAt,null,'back in its seat');
  // The host's snapshot of its car: AB, past the flag with nobody at the wheel: it stays without its pilot.
  m.cut.mine={state:{retired:true,progress:L*3+lead},at:m.cut.seatedAt+1};m.checkCut();
  assert.equal(m.cut.over,true);assert.deepEqual(resumed,[]);m.checkCut();assert.equal(m.cut.over,true,'for good');
  assert.match(m.trouble(),/passou a bandeirada sem piloto: abandono \(DNF\)/);
  // Out to the menu, it still waits for the host's next race (its race is over, not left).
  const waits=[];m.wait=on=>waits.push(on);m.leaving();assert.deepEqual(waits,[]);m.cut.over=false;m.leaving();assert.deepEqual(waits,[false]);
  // Back before the flag: the car where the host has it, this window's again.
  m.cut={mine:null,seatedAt:null,clock:0};m.checkCut();m.cut.mine={state:{retired:true,progress:L*2+lead},at:m.cut.seatedAt+1};m.checkCut();
  assert.equal(resumed.length,1);assert.equal(m.cut,null);
  // The host's own car is never cut, even when a refused key took its role.
  const h=mp({room:{role:null,id:'0000000b',problem:'chave',outdated:true,race,lobby:{race},note},race,seatId:'0000000b',immersive});h.checkCut();assert.equal(h.cut,null);
 }
 // The host's word on the cars waiting: where each stands and whether its pilot may come back for it
 // (seated still, or away: its line dropped); not one who left by the menu, nor for a car AB past the
 // flag. None waiting: nothing built, nothing drawn.
 {
  const rivals=[{seat:'64',stop:{stage:'fora'}},{seat:'19',stop:{stage:'parado',flagged:true}},{seat:'73',stop:{stage:'reboque',side:-1}},{seat:'11',stop:null}],told=[];let drawn=0;
  const h=mp({room:{role:'host',id:'0000000b',race:{seats:[{number:'99'},{number:'19'}]},away:new Map([['0000000a',{number:'64'}]]),setStops:list=>told.push(list),note},immersive:{field:{rivals}},drawStops:()=>drawn++});
  assert.deepEqual(h.stopList(),[{number:'64',stage:'fora',back:true},{number:'19',stage:'parado',back:false},{number:'73',stage:'reboque',back:false,side:-1}]);
  for(const r of rivals)r.stop=null;h.syncStops();assert.deepEqual(told,[[]]);assert.equal(drawn,0,'nothing waiting: nothing drawn');
 }
 // The card: a car in the pit lane is no yellow flag (as for the rivals); a guest already left without
 // a driver, or past its flag, is not "sem sinal"; the grass waits only for a pilot who may come back.
 // The result waits for the humans still racing, not for a car the host has AB.
 {
  const road=new TestCar(data);road.reset(300);const player=new TestCar(data);player.reset(100);
  const pit=new TestCar(data),p=pitRoute(data).at(150);Object.assign(pit,{x:p.x-p.ty*p.fast,y:p.y+p.tx*p.fast,heading:Math.atan2(p.ty,p.tx)});pit.index=pit.nearest(pit.x,pit.y,true).i;pit.settle();assert(pit.surface.pit);
  const rivals=[{seat:'64',entry:{number:'64',shortName:'Bia'},car:pit},{seat:'19',entry:{number:'19',shortName:'Caio'},car:road}];
  const race={id:'0000abcd',car:'99',seats:[{id:'0000000b',name:'Ana',number:'99'},{id:'0000000a',name:'Bia',number:'64'},{id:'0000000c',name:'Caio',number:'19'}]};
  const m=mp({room:{role:'host',id:'0000000b',note},race,immersive:{car:player,data,field:{rivals}}});
  m.stopped.set('64',{stage:'parado',since:0,back:true});assert.equal(m.yellow(),false,'rolling in the pit lane: no yellow flag');assert.equal(m.yellowText(),null);
  m.stopped.set('19',{stage:'parado',since:0,back:true});assert.equal(m.yellow(),true);assert.match(m.yellowText(),/^BANDEIRA AMARELA · #19 Caio sem piloto/);m.stopped.clear();
  const bia=heard(road,{},4),caio=heard(road,{finished:true},4);bia.waiting=rivals[0];m.remotes.set('64',bia).set('19',caio);
  assert.equal(m.trouble(),null,'neither is "sem sinal"');bia.waiting=null;assert.equal(m.trouble(),'Sem sinal de Bia (4 s)');bia.waiting=rivals[0];
  m.stopped.set('64',{stage:'fora',since:0,back:true});assert.equal(m.trouble(),'#64 Bia fora da pista · esperando o piloto voltar');
  m.stopped.set('64',{stage:'fora',since:0,back:false});assert.equal(m.trouble(),null,'her pilot left: nobody to wait for');
  assert.equal(m.stillRacing(),1,'Caio past his flag, Bia still racing');
  // Her car left without its pilot (retired at once): she may yet come back and finish, so the result
  // waits; not once it is AB for good. Out of her seat for a moment (her line dropped: away), still
  // waited for; gone by the menu, not.
  Object.assign(m.room,{race,away:new Map()});Object.assign(rivals[0],{retired:true,stop:{stage:'fora'}});assert.equal(m.stillRacing(),1,'Bia without a driver, still hers');
  rivals[0].stop.flagged=true;assert.equal(m.stillRacing(),0,'Bia AB for good: no wait');
  rivals[0].stop.flagged=false;race.seats=race.seats.filter(s=>s.number!=='64');m.room.away.set('0000000a',{number:'64'});assert.equal(m.stillRacing(),1,'away for a moment');
  m.room.away.clear();assert.equal(m.stillRacing(),0,'she left the race');
 }
}
// --- RaceField: the same seed builds the same grid in every window; remote cars are placed, not
// driven; two remote cars never touch, and neither do two humans (ghost), but a human hits a bot.
{
 const grid=seed=>{const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed});field.ace=true;field.reset(car.surface.s,{grid:true});return {car,field};};
 const a=grid(11),b=grid(11),c=grid(12);
 const pose=f=>f.rivals.map(r=>[r.entry.number,r.car.x,r.car.y,r.car.heading,r.progress]);
 assert.deepEqual(pose(a.field),pose(b.field),'same seed and ace: the same grid');assert.notDeepEqual(pose(a.field),pose(c.field));
 const {car:player,field}=a,r=field.rivals[3],remote=new RemoteCar(r.car,{progress:r.progress});
 let calls=0;r.puppet=(rival,dt)=>{calls++;return remote.drive(rival.car,dt);};r.car.remote=true;
 // Its owner says it rolls forward at 20 m/s: it goes exactly there, not where a bot would steer.
 const s=readCar(packCar(r.car,{progress:r.progress}));s.vx=Math.cos(s.heading)*20;s.vy=Math.sin(s.heading)*20;remote.receive(s,{seq:1});
 const x0=r.car.x,y0=r.car.y;for(let i=0;i<12;i++)field.step(player,1/120);
 assert.equal(calls,12);assert(Math.abs(Math.hypot(r.car.x-x0,r.car.y-y0)-2)<.05,'placed along its own velocity');
 // The player's car runs into the back of another at 8 m/s: a human (ghost) through a remote
 // human car, no contact; into a remote bot or a host's bot, a hit.
 const ram=target=>{const h=target.car.heading;player.x=target.car.x-Math.cos(h)*3.9;player.y=target.car.y-Math.sin(h)*3.9;player.heading=h;player.settle();player.vx=Math.cos(h)*8;player.vy=Math.sin(h)*8;player.yaw=0;};
 remote.receive({...s,vx:0,vy:0},{seq:2});player.ghost=true;r.car.ghost=true;ram(r);
 let hits=field.step(player,1/120).filter(h=>h.player);assert.equal(hits.length,0,'humans pass through each other');
 r.car.ghost=false;ram(r);hits=field.step(player,1/120).filter(h=>h.player);assert(hits.length>0,'a human hits a car driven over the network');
 const bot=field.rivals[5];ram(bot);const speed=Math.hypot(bot.car.vx,bot.car.vy);hits=field.step(player,1/120).filter(h=>h.player);
 assert(hits.length>0&&Math.hypot(bot.car.vx,bot.car.vy)>speed,'a bot is pushed');
 // Two remote cars laid over each other stay exactly where their owners put them.
 player.resetGrid();
 const q=field.rivals[4],other=new RemoteCar(q.car),X=r.car.x+.3;q.puppet=(rival,dt)=>other.drive(rival.car,dt);q.car.remote=true;other.receive({...s,vx:0,vy:0,x:X,y:r.car.y},{seq:1});
 field.step(player,1/120);assert(Math.abs(q.car.x-X)<1e-9,'no contact between two remote cars');
 report.field={collisions:field.collisions};
}
// The AI records (ai-records.js) never take a lap from a car driven over the network: a human in a
// rival's seat, or times relayed by the host. A car this window drives still counts.
{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 const records=new AutomaticAIRecords(storage),reference=n=>readAIRecords(storage).find(r=>r.circuit==='interlagos'&&r.mode==='normal'&&r.number===n).bestLap;
 const before73=reference('73'),before00=reference('00');
 const rival=(number,best,remote)=>({entry:{number},car:{best,remote},finished:false,style:{}});
 records.update({data:{meta:{id:'interlagos'}},active:false,freeTotalLaps:3,fullGrid:true,rivals:[rival('73',60,true),rival('00',61,false)]});
 assert.equal(reference('73'),before73,'a remote car is no AI record');assert.equal(reference('00'),61,'a bot this window drives is');assert(before00>61);
}
// The host closes the room (Fechar sala): every window out with 'fechada' at once, none hosting it again on its own
// nor hearing anything more; a guest cannot close it. Online the server's 4017 says the same, and drops the invitation.
{
 let now=0;const clock=()=>now,name='fechar-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia',want:'19',clock});
 A.start();await wait();advance([A],1);B.start();await wait();await wait();assert.equal(B.role,'guest');
 assert.equal(B.closeRoom(),false,'a guest cannot close it');await wait();assert.equal(A.role,'host');
 assert.equal(A.closeRoom(),true);assert.equal(A.problem,'fechada');assert.equal(A.role,null);
 await wait();assert.equal(B.problem,'fechada');assert.equal(B.role,null);
 advance([A,B],30);assert.equal(A.role,null,'nobody hosts it again');assert.equal(B.role,null);
 A.channel.close();B.channel.close();
 assert.equal(CLOSED[4017],'fechada');
 // An invited tab (its invitation kept in this browser): the room closed, the invitation forgotten, and opened again
 // (a reload, the browser restoring the tab) it is out again, never asked for the password it was never given; a tab
 // that came with the link alone is asked for it.
 const tab=new Map(),storage={getItem:k=>tab.get(k)??null,setItem:(k,v)=>tab.set(k,String(v)),removeItem:k=>tab.delete(k)};
 let forgot=0,saved='convite';const link=new ServerLink({url:'wss://sala.invalid',room:'x',key:()=>'',invite:()=>saved,forgetInvite:()=>{forgot++;saved=null;},storage,pass:async()=>({passe:'p'}),socket:()=>{const ws={send(){},close(){}};queueMicrotask(()=>ws.onclose?.({code:4017}));return ws;}});
 const heard=[];link.onclose=reason=>heard.push(reason);assert.equal(link.invited,false);link.open();await wait();await wait();
 assert.deepEqual(heard,['fechada']);assert.equal(forgot,1,'the invitation to a closed room is forgotten');assert.equal(link.invited,true,'this tab came in invited');
 link.open();await wait();await wait();assert.deepEqual(heard,['fechada','fechada'],'opened again: out, no password asked');
 const room=new Room({room:'x',name:'Bia',link:{open(){},close(){},send(){},invited:true}});assert.equal(room.invited,true);
 const plain=new ServerLink({url:'wss://sala.invalid',room:'x',key:()=>'',pass:async()=>({passe:'p'}),storage:{getItem:()=>null,setItem(){}},socket:()=>{throw new Error('no connection without a password');}});
 const asked=[];plain.onclose=reason=>asked.push(reason);plain.open();await wait();await wait();assert.deepEqual(asked,['chave'],'with the link alone: the password asked for');
 link.closing=true;clearTimeout(link.retry);
}
// The host ends its race for everyone (multiplayer.js raceEnd): its lobby says the race is finished and every guest
// hears it once ('end'); not before the start, and never from a guest.
{
 let now=0;const clock=()=>now,name='fim-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia',want:'19',wait:true,clock}),ends=[];
 B.on('race',()=>true).on('end',race=>ends.push(race.id));
 A.start();await wait();advance([A],1);B.start();await wait();await wait();
 const race=A.planRace({circuit:'interlagos',laps:1});A.openRace(race);await wait();await wait();
 assert.equal(A.endRace(),false,'not before the start');
 B.sendReady();await wait();await wait();A.lightsOut();await wait();await wait();assert.equal(B.race.state,'racing');
 assert.equal(B.endRace(),false,'a guest ends nothing');
 assert.equal(A.endRace(),true);await wait();await wait();
 assert.equal(A.race.state,'finished');assert.equal(B.race.state,'finished');assert.deepEqual(ends,[race.id]);
 A.beacon();await wait();await wait();assert.deepEqual(ends,[race.id],'heard once');
 A.channel.close();B.channel.close();
}
// A host who only watches (Só assistir): its race says so (assiste), its guests hear it, a race without it says nothing.
{
 let now=0;const clock=()=>now,name='assiste-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia',want:'19',wait:true,clock});B.on('race',()=>true);
 A.start();await wait();advance([A],1);B.start();await wait();await wait();
 assert.equal(A.planRace({circuit:'interlagos',laps:1}).assiste,undefined);
 const race=A.planRace({circuit:'interlagos',laps:1,watch:true});assert.equal(race.assiste,true);A.openRace(race);await wait();await wait();
 assert.equal(B.race?.assiste,true,'the guest hears the host only watches');
 B.sendReady();await wait();await wait();A.lightsOut();await wait();await wait();assert.equal(B.race.state,'racing');assert.equal(B.race.assiste,true,'and still at the start');
 A.channel.close();B.channel.close();
}
// The room server's address is the one the page's content policy allows (scripts/publicacao.py).
{
 const policy=fs.readFileSync(new URL('./publicacao.py',import.meta.url),'utf8').match(/^ROOM_SERVER = '([^']+)'/m)?.[1];
 assert.equal(policy,ROOM_SERVER,'net-link.js and publicacao.py name the same room server');assert.match(ROOM_SERVER,/^wss:\/\//);
}
console.log(JSON.stringify(report,null,1));
console.log('testar_multiplayer: ok');
