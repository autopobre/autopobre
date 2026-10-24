// Pit lane de Interlagos: dados, superficie, emendas, muros, limite de velocidade e cronometro.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,recognitionInput,steerLimit,clamp,wrap} from '../teste/physics.js';
import {pitGeometry,locatePit,serviceSpot,inServiceSpot} from '../teste/pit-lane.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),L=data.meta.reconstructed_xy_m;
data.meta.id='interlagos';
const pit=data.pit,c=Object.fromEntries(pit.columns.map((k,i)=>[k,i])),P=pit.samples;
// Official layout: in after the Cafe (T14), out on the back straight after the Curva do Sol (T3).
assert(pit.entry_main_s>3850&&pit.entry_main_s<3950,'pit entry sits between the Cafe and T15: '+pit.entry_main_s);
assert(pit.exit_main_s>750&&pit.exit_main_s<950,'pit exit rejoins on the back straight: '+pit.exit_main_s);
assert(pit.length_m>1100&&pit.length_m<1300,'long pit lane running beside the S do Senna');
assert(pit.walls.find(w=>w.name==='Muro_boxes').points.length>100);
assert(pit.limit.from<pit.garages[0]&&pit.limit.to>pit.garages[1],'speed-limit zone covers every garage');
const geo=pitGeometry(data),probe=new TestCar(data);
// Every station of the pit lane is paved, continuous and mapped to lap distance.
let previousZ=null,previousS=null,maxStep=0;
for(const p of P){
 const x=p[c.x]+p[c.lx]*(p[c.lane_lo]+p[c.lane_hi])/2,y=p[c.y]+p[c.ly]*(p[c.lane_lo]+p[c.lane_hi])/2;
 probe.index=probe.nearest(x,y,true).i;const q=probe.sample(x,y);
 assert(q.onRoad,`pit lane paved at ${p[c.s].toFixed(0)} m`);
 if(previousZ!==null)maxStep=Math.max(maxStep,Math.abs(q.z-previousZ));
 if(previousS!==null){let advance=q.s-previousS;if(advance<-L/2)advance+=L;assert(advance>-.5&&advance<12,`lap distance advances in the pits (${previousS.toFixed(1)} -> ${q.s.toFixed(1)})`);}
 previousZ=q.z;previousS=q.s;
}
assert(maxStep<.35,'no steps along the pit lane: '+maxStep.toFixed(3));
// Crossing from the track onto the pit lane at the entry and at the merge: no kerb-like step.
for(const s of [15,35,pit.length_m-40,pit.length_m-15]){
 const k=P.findIndex(p=>p[c.s]>=s),p=P[k];let last=null,worst=0;
 for(let d=p[c.lo]-6;d<=p[c.hi];d+=.2){const x=p[c.x]+p[c.lx]*d,y=p[c.y]+p[c.ly]*d;probe.index=probe.nearest(x,y,true).i;const z=probe.sample(x,y).z;if(last!==null)worst=Math.max(worst,Math.abs(z-last));last=z;}
 assert(worst<.06,`smooth seam between track and pit lane at ${s.toFixed(0)} m: ${worst.toFixed(3)}`);
}
assert.equal(locatePit(geo,P[0][c.x]-200,P[0][c.y]),null,'far from the pits there is no pit surface');
// Follow the pit lane centre (pure pursuit), as a driver entering the boxes would.
function follow(car,path,index,speed){
 const v=Math.hypot(car.vx,car.vy),ahead=4+v*.3;let k=index;
 while(k+1<path.length&&Math.hypot(path[k][0]-car.x,path[k][1]-car.y)<ahead)k++;
 const [tx,ty]=path[k],alpha=wrap(Math.atan2(ty-car.y,tx-car.x)-car.heading),steer=Math.atan2(2*2.667*Math.sin(alpha),Math.hypot(tx-car.x,ty-car.y));
 const command=clamp(steer/steerLimit(v),-1,1);
 return {input:{left:Math.max(0,command),right:Math.max(0,-command),throttle:clamp((speed-v)*.5,0,1),brake:clamp((v-speed)*.6,0,1),reverse:0,handbrake:0},k};
}
const path=P.map(p=>[p[c.x]+p[c.lx]*(p[c.lane_lo]+p[c.fast_hi])/2,p[c.y]+p[c.ly]*(p[c.lane_lo]+p[c.fast_hi])/2]);
const car=new TestCar(data);
car.reset(Math.max(0,data.samples.findIndex(p=>p[0]>=pit.entry_main_s-120)));
let k=0,steps=0,inPit=0,limited=0,fastest=0,impacts=0,offRoad=0;
// Main track until the entry, then the pit lane to its end, flat out wherever the lane allows: the limiter
// (user, 10-24) holds the car at 60 km/h through the zone, so the lap stays good.
while(steps<120*400){
 const surface=car.surface;let command;
 if(k===0&&Math.hypot(path[0][0]-car.x,path[0][1]-car.y)>25)command=recognitionInput(car,{maxSpeed:30});
 else{const r=follow(car,path,k,30);k=r.k;command=r.input;command.throttle=1;command.brake=0;
  // Brake for the chicane, the tight exit curve and down to the limit before its line;
  // inside the zone the throttle stays flat and only the limiter holds the car back.
  // Sharpest bend within the next 40 m, measured over 12 m chords.
  let turn=0;const h=j=>Math.atan2(P[Math.min(P.length-1,j)][c.ty],P[Math.min(P.length-1,j)][c.tx]);
  for(let j=Math.max(0,k-4);j<k+20;j++)turn=Math.max(turn,Math.abs(wrap(h(j+6)-h(j))));
  const ps=car.surface.pitS??-1,approach=ps>pit.limit.from-90&&ps<pit.limit.from+2;
  const bend=clamp(26-turn*60,9,26),target=Math.min(bend,approach?15.8:99),v=Math.hypot(car.vx,car.vy);
  // In the zone it only brakes for the bends; on the straights it is flat out.
  if(v>target&&!(car.limiter&&ps>pit.limit.from+2&&v<=bend)){command.throttle=0;command.brake=clamp((v-target)*.8,0,1);}
 }
 car.step(command,1/120);steps++;
 if(car.wallImpactSpeed>2)impacts++;
 if(car.surface.pit){inPit++;if(car.limiter){limited++;if(car.surface.pitS>pit.limit.from+30)fastest=Math.max(fastest,Math.hypot(car.vx,car.vy)*3.6);}}
 else if(k>0&&!car.surface.onRoad)offRoad++;
 if(k>=path.length-2)break;
}
assert(k>=path.length-2,'drove the whole pit lane');
assert(inPit>120*30,'spent time on the pit lane surface');
assert(limited>120*10,'speed-limit zone reached');
assert(fastest>57&&fastest<pit.limit.kmh+2,'the limiter holds the car at the limit, flat out: '+fastest.toFixed(1));
assert(car.lapValid&&!car.pitPenalty,'held by the limiter, the lap stays good');
// Into the zone at 108 km/h, flat out: the limiter brakes the car down to the limit within a couple of seconds, but
// the speeding over the line still costs the lap.
{const fast=new TestCar(data),j0=P.findIndex(q=>q[c.s]>=pit.limit.from+40),q=P[j0],h=Math.atan2(q[c.ty],q[c.tx]);let m=j0,held=0,top=0;
 fast.x=path[j0][0];fast.y=path[j0][1];fast.heading=h;fast.vx=Math.cos(h)*30;fast.vy=Math.sin(h)*30;fast.surface=fast.sample(fast.x,fast.y);fast.index=fast.surface.i;fast.settle?.();
 for(let i=0;i<120*6;i++){const r=follow(fast,path,m,30);m=r.k;r.input.throttle=1;r.input.brake=0;fast.step(r.input,1/120);const v=Math.hypot(fast.vx,fast.vy)*3.6;if(i>120*3.5)top=Math.max(top,v);if(fast.limiter)held++;}
 assert(held>120*5&&top<pit.limit.kmh+1.5,'the limiter brakes a fast car down to the limit: '+top.toFixed(1));
 assert(!fast.lapValid&&fast.invalidReason==='pit','over the limit past the line still costs the lap');}
assert.equal(impacts,0,'clean run through the pits touches no wall');
assert(offRoad<120*.5,'stays on the paved pit lane: '+offRoad);
assert(car.surface.s>pit.exit_main_s-120&&car.surface.s<pit.exit_main_s+60,'back on the back straight: '+car.surface.s.toFixed(1));
// The pit wall stops a car turning into it from the start-finish straight.
const hit=new TestCar(data),i0=data.samples.findIndex(p=>p[0]>=40);hit.reset(i0);
const s0=data.samples[i0];hit.heading=Math.atan2(s0[8],s0[7])+.5;hit.vx=Math.cos(hit.heading)*30;hit.vy=Math.sin(hit.heading)*30;
let impact=0;for(let i=0;i<240;i++){hit.step({left:0,right:0,throttle:1,brake:0,reverse:0,handbrake:0},1/120);impact=Math.max(impact,hit.wallImpactSpeed);}
assert(impact>5,'pit wall collision registered: '+impact.toFixed(1));
assert(!hit.surface.pit,'the car did not pass through the pit wall');
// A full lap through the pits counts: timing follows the pit lane past the control line.
const lap=new TestCar(data);lap.resetGrid();let j=0,pitted=false;
for(let i=0;i<120*600&&lap.laps<2;i++){
 let command;
 const nearEntry=lap.laps===1&&!pitted&&j===0&&Math.hypot(path[0][0]-lap.x,path[0][1]-lap.y)<25;
 // Down to 56 km/h before the painted line and through the zone, as the rule asks.
 const ps=lap.surface.pitS??-1,slow=ps>pit.limit.from-70&&ps<pit.limit.to;
 if(lap.laps===1&&(nearEntry||j>0)&&j<path.length-2){const r=follow(lap,path,j,slow?15.5:20);j=r.k;command=r.input;pitted=true;}
 else command=recognitionInput(lap);
 lap.step(command,1/120);
}
assert(pitted,'second lap went through the pits');
assert.equal(lap.laps,2,'lap through the pit lane is counted');
assert.equal(lap.lastLapValid,true,'using the pit lane within the limit is not a cut');
// Where the pit lane joins the track, the track's centre line stays smooth (no false S the AI brakes for).
const heading=data.samples.map(p=>Math.atan2(p[8],p[7])),turn=(i,j)=>Math.abs(wrap(heading[j]-heading[i]));
for(const s of [pit.entry_main_s,pit.exit_main_s]){const k=data.samples.findIndex(p=>p[0]>=s-30);
 for(let i=k;i<k+30;i++){const n=data.samples.length,a=i%n,b=(i+1)%n,c2=(i+2)%n;assert(Math.abs(wrap(heading[c2]-2*heading[b]+heading[a]))<.035,`centre line smooth near the pit junction at ${data.samples[b][0].toFixed(0)} m`);assert(Math.abs(data.samples[b][4]-data.samples[a][4])<.5,'track width changes gradually at the pit junction');}}
// No pit wall stands on the track's asphalt.
const probeWall=new TestCar(data);
for(const wall of pit.walls)for(const [x,y,,t] of wall.points){const q=probeWall.nearest(x,y,true),p=data.samples[q.i],d=q.ex*-p[8]+q.ey*p[7];assert(Math.abs(d)-p[4]/2-t/2>.3,`${wall.name} clear of the track asphalt at ${p[0].toFixed(0)} m`);}
// Room to drive: at least 6.5 m of asphalt everywhere, walls clear of the lane outside the garages.
const widths=P.map(p=>p[c.hi]-p[c.lo]);assert(Math.min(...widths)>6.5,'pit lane wide enough to drive: '+Math.min(...widths).toFixed(2));
for(const wall of pit.walls.filter(w=>w.name.startsWith('Muro')))for(const [x,y] of wall.points){
 const lane=locatePit(geo,x,y);if(!lane||lane.s>pit.garages[0]-15&&lane.s<pit.garages[1]+10)continue;
 assert(lane.d<lane.lo-.35||lane.d>lane.hi+.35,`${wall.name} stands off the paved lane at ${lane.s.toFixed(0)} m`);
}
// Box 99: in the race the car stops on the painted service box, on the working lane
// in front of the garage and along the lane, coming in from the fast lane.
const b99=pit.box99,spot=serviceSpot(pit),station=(sv,d)=>{const k=Math.min(P.length-2,P.findIndex(p=>p[c.s]>=sv)),p=P[k];return [p[c.x]+p[c.lx]*d+p[c.tx]*(sv-p[c.s]),p[c.y]+p[c.ly]*d+p[c.ty]*(sv-p[c.s])];};
const at99=P.find(p=>p[c.s]>=b99.s),fastD=sv=>{const p=P.find(q=>q[c.s]>=sv);return (p[c.lane_lo]+p[c.fast_hi])/2;};
assert(Math.abs(spot.s-b99.s)<.01&&spot.d-spot.width/2>=at99[c.fast_hi]&&spot.d+spot.width/2<=b99.front+.01,'service box painted on the working lane in front of Box 99');
const stop=new TestCar(data);{const [x,y]=station(b99.s-45,fastD(b99.s-45)),p=P.find(q=>q[c.s]>=b99.s-45);stop.x=x;stop.y=y;stop.heading=Math.atan2(p[c.ty],p[c.tx]);stop.index=stop.nearest(x,y,true).i;stop.surface=stop.sample(x,y);stop.settle?.();}
const toSpot=[...[-40,-32,-24,-16].map(ds=>station(b99.s+ds,fastD(b99.s+ds))),...[-9,-4,0,6,12].map(ds=>station(b99.s+ds,spot.d))];
let toBox=0,stopHits=0;
for(let i=0;i<120*40;i++){
 const r=follow(stop,toSpot,toBox,4);toBox=r.k;const q=stop.surface;
 if(q.pitS!==null&&q.pitS>spot.s-.6){r.input.throttle=0;r.input.brake=1;}
 stop.step(r.input,1/120);if(stop.wallImpactSpeed>1)stopHits++;
 if(q.pitS>spot.s-1.5&&Math.hypot(stop.vx,stop.vy)<.03)break;
}
assert.equal(stopHits,0,'pulls into the service box without touching a wall');
assert(inServiceSpot(spot,stop.surface),'stopped in the painted box: '+JSON.stringify({ds:stop.surface.pitS-spot.s,dd:stop.surface.pitD-spot.d}));
assert(Math.abs(wrap(stop.heading-spot.heading))<.35,'parked along the lane, not nose into the garage');
// The garage behind stays open and driveable, but the pit stop does not open inside it.
const inGarage=q=>q.pit&&Math.abs(q.pitS-b99.s)<b99.bay/2-1.3&&q.pitD>b99.front+2&&q.pitD<b99.front+b99.depth-1;
const garage=new TestCar(data),lane0=P.find(p=>p[c.s]>=b99.s-30);
garage.x=lane0[c.x]+lane0[c.lx]*(lane0[c.lane_lo]+lane0[c.fast_hi])/2;garage.y=lane0[c.y]+lane0[c.ly]*(lane0[c.lane_lo]+lane0[c.fast_hi])/2;garage.heading=Math.atan2(lane0[c.ty],lane0[c.tx]);
garage.index=garage.nearest(garage.x,garage.y,true).i;garage.surface=garage.sample(garage.x,garage.y);garage.settle?.();
const route=[...[-30,-24,-18,-13,-9].map(ds=>station(b99.s+ds,b99.front-4.5)),station(b99.s-5,b99.front-3.5),station(b99.s-2.5,b99.front-1.5),station(b99.s-.5,b99.front+1),station(b99.s,b99.front+3),station(b99.s,b99.front+6),station(b99.s,b99.front+8)];
let g=0,garageHits=0;
for(let i=0;i<120*40;i++){
 const r=follow(garage,route,g,3.2);g=r.k;const q=garage.surface,depth=q.pitD??0;
 if(g>=route.length-2&&depth>b99.front+5.6){r.input.throttle=0;r.input.brake=1;}
 garage.step(r.input,1/120);if(garage.wallImpactSpeed>1.5)garageHits++;
 if(g>=route.length-2&&Math.hypot(garage.vx,garage.vy)<.05&&depth>b99.front+4)break;
}
assert.equal(garageHits,0,'drives into Box 99 without touching the walls');
assert(inGarage(garage.surface),'parked inside Box 99: '+JSON.stringify({s:garage.surface.pitS,d:garage.surface.pitD}));
assert(!inServiceSpot(spot,garage.surface),'inside the garage is not the service box');
// The rail keeps the car out of the café; a closed garage stays closed.
const push=(car,heading,frames)=>{car.heading=heading;car.vx=Math.cos(heading)*4;car.vy=Math.sin(heading)*4;let hit=0;for(let i=0;i<frames;i++){car.step({left:0,right:0,throttle:.35,brake:0,reverse:0,handbrake:0},1/120);hit=Math.max(hit,car.wallImpactSpeed);}return hit;};
const toCafe=push(garage,Math.atan2(lane0[c.ty],lane0[c.tx])+Math.PI,240);
assert(toCafe>1&&garage.surface.pitS>b99.s-b99.bay/2-.5,'the rail stops the car before the café');
const closed=new TestCar(data),bay5=b99.s-5*b99.bay,front5=station(bay5,b99.front-2);closed.x=front5[0];closed.y=front5[1];closed.index=closed.nearest(closed.x,closed.y,true).i;closed.surface=closed.sample(closed.x,closed.y);closed.settle?.();
const into=Math.atan2(lane0[c.ly],lane0[c.lx]);assert(push(closed,into,240)>1,'other garages are closed by their doors');
console.log(JSON.stringify({pitLength:pit.length_m,entryMainS:pit.entry_main_s,exitMainS:pit.exit_main_s,maxStep,zoneTopKmh:fastest,pitSeconds:inPit/120,laps:lap.laps,bestLap:lap.best}));
