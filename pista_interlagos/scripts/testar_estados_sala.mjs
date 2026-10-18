// Host-side race integrity checks. No browser, real server, credentials or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room,validMessage} from '../teste/net-room.js';
import {GuestRaceState} from '../teste/net-verify.js';
import {Multiplayer} from '../teste/multiplayer.js';
import {packCar,readCar} from '../teste/net-cars.js';
import {TestCar,recognitionInput} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {createCurveloData} from '../teste/curvelo-data.js';

const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const L=data.meta.reconstructed_xy_m;
function setup(laps=2){
 const player=new TestCar(data);player.resetGrid();
 const field=new RaceField(data,{seed:11});field.reset(player.surface.s,{grid:true});
 const rival=field.rivals[0],guest='0000000b';
 const room=new Room({room:'local-check',clock:()=>field.time,storage:null,link:{send(){},open(){},close(){}}});
 room.id='0000000a';room.role='host';
 const race=room.race={id:'000000aa',car:'99',laps,seats:[{id:room.id,name:'Host',number:'99'},{id:guest,name:'Guest',number:rival.entry.number}]};
 room.players.set(guest,{id:guest,number:rival.entry.number,seen:0});
 const mp=Object.assign(Object.create(Multiplayer.prototype),{phase:'waiting',race,room,remotes:new Map(),immersive:{field,freeCountdown:3},pause:null});
 mp.remote(rival,rival.entry.number,true);
 room.on('state',(id,m)=>mp.heardCar(id,m));
 let seq=0;
 const send=(car,extra={},time=field.time)=>{
  field.time=time;
  const m={t:'state',from:guest,race:race.id,seq:++seq,lat:0,car:packCar(car,extra)};
  assert(validMessage(m));room.receive(m);return m;
 };
 const drive=()=>rival.puppet?.(rival,1/120);
 const start=()=>{mp.phase='racing';mp.immersive.freeCountdown=0;};
 return {field,rival,mp,room,race,guest,send,drive,start,remote:mp.remotes.get(rival.entry.number)};
}

// The original reproduction: teleport, fabricated laps, best lap and a 0.1 s finish.
{
 const q=setup(),car=q.rival.car,position={x:car.x,y:car.y};q.start();
 q.send({...car,x:car.x+10000,laps:3,best:.1},{progress:1e7,finished:true,finishTime:.1},.1);
 assert.equal(q.remote.seq,-1,'teleport rejected before it reaches the remote car');
 q.send({...car,laps:3,best:.1},{progress:1e7,finished:true,finishTime:.1},.2);q.drive();
 assert.equal(q.rival.finished,false);assert.equal(q.rival.car.laps,0);assert.equal(q.rival.car.best,null);
 assert(q.rival.progress<L);assert.equal(readCar(q.remote.raw).finished,false,'relayed bytes are sanitized too');
 assert.deepEqual({x:car.x,y:car.y},{x:Math.round(position.x*1000)/1000,y:Math.round(position.y*1000)/1000});
 const accepted=q.remote.seq;
 q.send({...car,vx:200},{},.3);assert.equal(q.remote.seq,accepted,'impossible velocity rejected');
 q.send(car,{},.4);assert(q.remote.seq>accepted,'one rejected packet does not lock out later valid ones');
 const highLatency={t:'state',from:q.guest,race:q.race.id,seq:q.remote.seq+1,lat:5,car:packCar({...car,x:car.x+1000})};
 q.room.receive(highLatency);assert.equal(q.remote.seq,highLatency.seq-1,'claimed latency does not authorize travel');
}

// Before lights out and while the host pauses: poses cannot race or create time/finish credit.
{
 const q=setup(),car=q.rival.car;
 q.send({...car,x:car.x+10,vx:20},{finished:true,finishTime:.1},0);assert.equal(q.remote.seq,-1);
 q.send({...car,laps:20,best:.01},{finished:true,finishTime:.01},0);assert.equal(q.remote.state.laps,0);
 q.start();q.mp.pause={why:'linha'};const seq=q.remote.seq;
 q.send({...car,x:car.x+10,vx:20},{},0);assert.equal(q.remote.seq,seq);
 q.send(car,{},0);assert.equal(q.remote.state.finishTime,null);
}

// Many individually small jumps in one host tick cannot multiply the network jitter allowance.
{
 const q=setup();q.start();const car=q.rival.car,x=car.x,y=car.y;
 for(let i=1;i<=100;i++)q.send({...car,x:x+i*2},{progress:1e7,finished:true,finishTime:.1},0);
 assert(Math.hypot(q.remote.state.x-x,q.remote.state.y-y)<=45.01);
 assert.equal(q.remote.state.finished,false);
 const vertical=setup();vertical.start();const base=vertical.rival.car;
 for(let i=1;i<=100;i++)vertical.send({...base,z:base.z+i*2},{},0);
 assert(vertical.remote.state.z-base.z<=45.01,'the same movement budget covers vertical teleports');
}

// The actual car physics over two laps, 30 Hz state packets delayed 150 ms, repeated short losses,
// and a 1.2 s delivery gap across the start/finish line. The host must still see the honest finish.
{
 const q=setup(),car=new TestCar(data),initial=q.rival.car;
 car.reset(initial.index);Object.assign(car,{x:initial.x,y:initial.y,heading:initial.heading,awaitingStart:true});car.settle();
 q.start();const pending=[];let t=0,seq=0,sent=0,accepted=0,finishedAt=null;
 const dt=1/120;
 for(let step=0;step<120*420;step++){
  car.step(recognitionInput(car,{maxSpeed:48,cornerGrip:9,braking:9}),dt);t+=dt;q.field.time=t;
  if(step%4===0){
   const state=packCar(car,{progress:1e7,finished:car.laps>=2,finishTime:.1});
   // Short packet loss and a burst near the first lap's flag.
   const gap=car.laps===0&&!car.awaitingStart&&car.surface.s>L-45;
   if(step%28!==0&&!gap){pending.push({at:t+.15+(step%3)*.01,m:{t:'state',from:q.guest,race:q.race.id,seq:++seq,lat:.15,car:state}});sent++;}
  }
  while(pending.length&&pending[0].at<=t){const {m}=pending.shift(),last=q.remote.seq;q.room.receive(m);if(q.remote.seq>last)accepted++;}
  q.drive();
  if(car.laps>=2)finishedAt??=t;
  if(finishedAt!==null&&t-finishedAt>.4)break;
 }
 assert.equal(car.laps,2,'the real car completed the test');
 assert.equal(q.remote.state.laps,2,'host observed both laps despite delayed/lost states');
 assert.equal(q.rival.finished,true);assert(q.rival.finishTime>200&&q.rival.finishTime<420);
 assert(q.rival.car.best>L/120&&q.rival.car.best<220);
 assert.equal(accepted,sent-pending.length,'all delivered legitimate states accepted');
 assert.equal(readCar(q.remote.raw).finishTime,q.remote.state.finishTime);
 const finish=q.remote.state.finishTime;
 q.send({...car,laps:0,best:.01},{finished:false,finishTime:0},t+.1);q.drive();
 assert.equal(q.remote.state.finishTime,finish,'result cannot be rewritten after the observed finish');
 assert.equal(q.remote.state.finished,true);
 console.log(JSON.stringify({physicalLaps:car.laps,hostLaps:q.remote.state.laps,finishTime:q.rival.finishTime,best:q.rival.car.best,accepted}));
}

// The same checkpoint/clock logic must work with every circuit's elevation, banking and sample
// spacing. Run the real car over one lap of the other six tracks, delivering poses at 30 Hz.
{
 const circuits=[['curvelo',createCurveloData()],...['cascavel','piracicaba','chapeco','brasilia','goiania','chapada','floripa','minhocao','pampulha'].map(name=>[name,JSON.parse(fs.readFileSync(new URL(`../dados/pista_${name}.json`,import.meta.url)))])];
 const results=[];
 for(const [name,track] of circuits){
  const car=new TestCar(track);car.resetGrid();
  const guard=new GuestRaceState({car,finished:false,finishTime:null},{laps:1,lead:track.meta.reconstructed_xy_m-car.surface.s});
  let accepted=0,state=null;
  // (Pampulha's 20 km lap takes over ten minutes at this pace.)
  for(let step=0;step<120*Math.max(300,(track.meta.reconstructed_xy_m??0)/20);step++){
   car.step(recognitionInput(car,{maxSpeed:42,cornerGrip:7,braking:7}),1/120);
   if(step%4===0){const checked=guard.receive(readCar(packCar(car)),car.clock);assert(checked,`${name}: honest motion rejected`);state=checked.state;accepted++;}
   if(car.laps>=1&&state?.finished)break;
  }
  assert.equal(car.laps,1,`${name}: physical lap completed`);assert.equal(state?.laps,1,`${name}: host lap completed`);
  assert.equal(state.finished,true,`${name}: observed finish`);results.push({circuit:name,time:state.finishTime,accepted});
 }
 console.log(JSON.stringify({circuits:results}));
}

// A large lateral return with R is allowed only at the host-observed current track station.
{
 const q=setup(),car=q.rival.car;car.x+=car.surface.lx*90;car.y+=car.surface.ly*90;car.settle();
 const guard=new GuestRaceState(q.rival,{laps:2,lead:q.field.gridLeadIn});
 const position={x:car.x,y:car.y},laps=car.laps;car.recover();
 assert(Math.hypot(car.x-position.x,car.y-position.y)>45);
 const accepted=guard.receive(readCar(packCar(car)),.1);assert(accepted,'legitimate recovery allowed');
 assert.equal(accepted.state.laps,laps);assert.equal(accepted.state.finished,false);
 assert.equal(guard.receive(readCar(packCar({...car,x:car.x+1000})),.2),null,'arbitrary recovery target denied');
}

// On reconnect the only new anchor is where the host has kept/towed the car. A forged finish cannot
// resurrect a car which crossed the flag without a pilot. Unflagged cars can be taken back normally.
{
 const q=setup();q.start();q.send(q.rival.car,{},.1);q.drive();
 const stale={...q.rival.car};q.field.strand(q.rival,'conexão caiu');
 q.rival.car.recover(300);q.remote.waiting=q.rival;q.field.time=30;
 q.send(stale,{},30);assert(q.remote.waiting,'old pose is not an authorized reconnect baseline');
 q.send(q.rival.car,{},30);assert.equal(q.remote.waiting,null);assert.equal(q.rival.retired,false);
 q.field.strand(q.rival,'conexão caiu');q.rival.stop.flagged=true;q.remote.waiting=q.rival;
 q.send({...q.rival.car,laps:2},{finished:true,finishTime:.1},31);
 assert(q.remote.waiting,'host-confirmed abandonment remains abandoned');assert.equal(q.remote.state.finished,false);
}

// Lost outbound car states with a live socket: the host strands the car, the guest sees its own
// stop in the lobby, and a subsequent snapshot returns it to the host's pose before it sends again.
// This must also recover a gap larger than the guard's jitter allowance, without a correction loop.
{
 const q=setup();q.start();q.send(q.rival.car,{},0);q.drive();
 const car=new TestCar(data),initial=q.rival.car;
 car.reset(initial.index);Object.assign(car,{x:initial.x,y:initial.y,heading:initial.heading,awaitingStart:true});car.settle();
 for(let i=0;i<8*120;i++)car.step(recognitionInput(car,{maxSpeed:42}),1/120);
 assert(Math.hypot(car.x-q.rival.car.x,car.y-q.rival.car.y)>45);
 q.field.time=8;q.remote.age=8;q.mp.checkSilence();assert(q.remote.waiting);
 q.send(car,{},8);assert(q.remote.waiting,'the unacknowledged far-away pose is rejected');
 const room={role:'guest',id:q.guest,problem:null,outdated:false,race:q.race,lobby:{race:q.race,stops:q.mp.stopList()},note(){}};
 const field=new RaceField(data,{seed:11});field.gridLeadIn=q.field.gridLeadIn;
 const guest=Object.assign(Object.create(Multiplayer.prototype),{room,race:q.race,phase:'racing',seatId:q.guest,cut:null,lost:false,reclaiming:null,
  immersive:{car,data,field,freeFinished:false,freeTotalLaps:2}});
 guest.checkCut();assert(guest.cut,'the host stop triggers a handover even though the socket is alive');
 guest.checkCut();assert.notEqual(guest.cut.seatedAt,null);
 guest.cut.seatedAt=performance.now()/1000-.01;
 guest.heardField({race:q.race.id,seq:10,cars:[[q.rival.seat,0,packCar(q.rival.car,{progress:q.rival.progress,retired:true})]]});
 guest.checkCut();assert.equal(guest.cut,null);assert.notEqual(guest.reclaiming,null);
 assert(Math.hypot(car.x-q.rival.car.x,car.y-q.rival.car.y)<.001);
 guest.checkCut();assert.equal(guest.cut,null,'the unacknowledged old stop does not loop the correction');
 q.send(car,{},8);assert.equal(q.remote.waiting,null,'corrected pose hands the car back');
 assert.equal(q.rival.retired,false);
 room.lobby.stops=q.mp.stopList();guest.checkCut();assert.equal(guest.reclaiming,null,'host acknowledgement ends the handover');
}

console.log('testar_estados_sala: ok');
