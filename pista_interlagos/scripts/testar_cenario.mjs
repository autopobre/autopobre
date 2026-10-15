// Cenario de Interlagos: nada do chao atravessa asfalto, zebras, pit lane, garagens
// ou arquibancada; arvores e placas fora das ruas; torcida sentada, virada para a
// pista e na sombra da cobertura.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {TestCar,guardrailClearance,guardrailSections} from '../teste/physics.js';
import {fitGround,groundHeight,standLayout,standPoint,roofHeight,sceneryBands,bandClearance,STAND} from '../teste/track-clearance.js';
import {billboardSpots,BOARD_CLEARANCE} from '../teste/track-surface.js';
import {buildTrackField,createCrowd,crowdNear} from '../teste/landscape.js';
import {VIEW_DISTANCES} from '../teste/graphics-settings.js';
import {weatherProfile} from '../teste/weather.js';
import {createGrandstands} from '../teste/interlagos-stands.js';
import {SUN_DIRECTION} from '../teste/sky.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
const A=data.samples,N=A.length,t=data.terrain,pit=data.pit,c=Object.fromEntries(pit.columns.map((k,i)=>[k,i])),P=pit.samples;
const fit=fitGround(data),ground=(x,y)=>groundHeight(t,fit.heights,x,y),probe=new TestCar(data);
assert(fit.stats.residual<=.002&&fit.stats.passes<80,'ground fit converges: '+JSON.stringify(fit.stats));
const worst={};
const check=(name,x,y,top,gap)=>{const g=ground(x,y);if(g===null)return;const e=g-(top-gap);if(!(worst[name]?.e>=e))worst[name]={e,x,y};};
// Between the points the fit used: the track ribbon (+4 cm) and the kerbs (+2 cm at their edges).
for(let i=0;i<N;i++){
 const p=A[i],q=A[(i+1)%N];
 for(const u of [.25,.75]){
  const m=k=>p[k]+(q[k]-p[k])*u,hw=m(4)/2;
  for(let d=-hw+.25;d<hw;d+=.5)check('asfalto',m(1)+m(9)*d,m(2)+m(10)*d,m(3)+m(5)*d+.04,.09);
 }
 for(const [side,flag] of [[-1,13],[1,14]]){
  if(!(p[flag]&&q[flag]))continue;
  const kerb=(r,k,w)=>{const x=r[1]+r[9]*side*(r[4]/2+w),y=r[2]+r[10]*side*(r[4]/2+w);probe.index=k;return [x,y,probe.sample(x,y).z];};
  for(const w of [.24,.76,1.05]){const [x1,y1,z1]=kerb(p,i,w),[x2,y2,z2]=kerb(q,(i+1)%N,w);check('zebras',(x1+x2)/2,(y1+y2)/2,(z1+z2)/2+.02,.06);}
 }
}
// Pit lane asphalt (+3.5 cm), the garage floors and Box 99, whose floor follows the lane plane.
const [g0,g1]=pit.garages,b99=pit.box99;
for(let i=0;i+1<P.length;i++){
 const p=P[i],q=P[i+1];
 for(const u of [.25,.75]){
  const m=k=>p[k]+(q[k]-p[k])*u,at=d=>[m(c.x)+m(c.lx)*d,m(c.y)+m(c.ly)*d],plane=d=>m(c.z)+m(c.bank)*d;
  for(let d=m(c.lo)+.25;d<m(c.hi);d+=.5)check('pit_lane',...at(d),plane(d)+.035,.09);
  const s=m(c.s);
  if(s>g0&&s<g1)for(let d=m(c.hi)+.5;d<m(c.hi)+21;d+=1)check('garagens',...at(d),plane(m(c.hi)),.1);
  if(s>b99.cafe_s-b99.bay/2&&s<b99.s+b99.bay/2)for(let d=b99.front+.5;d<b99.front+16;d+=.5)check('box99',...at(d),plane(d)+.05,.1);
 }
}
for(const wall of pit.walls)for(const [x,y,z] of wall.points)check('muros',x,y,z+wall.height,.2);
// Grandstands: every row and the apron in front of it.
const stands=standLayout(data);
assert.equal(stands.length,STAND.blocks,'grandstand blocks along the main straight');
for(const b of stands)for(let a=-b.length/2+.2;a<b.length/2;a+=.8){
 for(let l=b.apron+.25;l<b.front;l+=.5)check('arquibancada',...standPoint(b,a,l),b.base,.04);
 for(const row of b.rows)for(const l of [row.from+.1,(row.from+row.to)/2,row.to-.1])check('arquibancada',...standPoint(b,a,l),row.top,.08);
}
for(const [name,w] of Object.entries(worst))assert(w.e<=.002,`ground clears ${name}: rises ${w.e.toFixed(3)} m too high at (${w.x.toFixed(1)}, ${w.y.toFixed(1)})`);
assert.deepEqual(Object.keys(worst).sort(),['arquibancada','asfalto','box99','garagens','muros','pit_lane','zebras']);

// Off the asphalt the visible ground is the one the car drives on; it only dips
// below it next to the roads where a steep bank had to be cut back.
const others=sceneryBands(data).filter(b=>b.name!=='pista');let verge=0,dipped=0,deepest=0;
for(let j=0;j<t.ny;j++)for(let k=0;k<t.nx;k++){
 const x=t.x0+k*t.step,y=t.y0+j*t.step,q=probe.nearest(x,y,true),a=A[q.i],dist=Math.hypot(q.ex,q.ey)-a[4]/2;
 if(dist<0||dist>6||bandClearance(others,x,y).distance<3)continue;
 const s=probe.sample(x,y,q.i);if(s.onRoad)continue;
 const dip=s.z-.055-fit.heights[j*t.nx+k];verge++;if(dip>.3)dipped++;deepest=Math.max(deepest,dip);
 assert(dip>-1e-6,'the fit only lowers the ground');
}
assert(verge>2500&&dipped/verge<.02&&deepest<1.2,`verge ground follows the driven ground: ${dipped}/${verge} dip >0.3 m, deepest ${deepest.toFixed(2)} m`);

// Guardrail posts reach 1 m into the ground: they meet it even where a bank was cut back.
let floating=0;
for(const side of [-1,1])for(const [from,to] of guardrailSections(data,side))for(const p of A){
 if(p[0]<from||p[0]>Math.min(to,data.meta.reconstructed_xy_m))continue;
 const offset=side*(p[4]/2+guardrailClearance(data,p[0],side)),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;probe.index=A.indexOf(p);
 if(probe.sample(x,y).z-.95-ground(x,y)>0)floating++;
}
assert.equal(floating,0,'guardrail posts reach the ground');

// Trees need 9 m (and half their crown + 2 m) from every band: pit lane, garages and stands included.
const field=buildTrackField(data),edgeAt=(x,y)=>field.edge[field.cell(x,y)];
for(let i=0;i<P.length;i+=3){const p=P[i];for(const d of [p[c.lo]+.5,(p[c.lo]+p[c.hi])/2,p[c.hi]-.5])assert(edgeAt(p[c.x]+p[c.lx]*d,p[c.y]+p[c.ly]*d)<2,'no trees on the pit lane or its exit road');}
for(const p of P.filter(p=>p[c.s]>g0&&p[c.s]<g1))for(const d of [5,12,20])assert(edgeAt(p[c.x]+p[c.lx]*(p[c.hi]+d),p[c.y]+p[c.ly]*(p[c.hi]+d))<2,'no trees on the garages');
for(const b of stands)for(const a of [-13,0,13])for(const l of [b.apron+1,b.front+5,b.back])assert(edgeAt(...standPoint(b,a,l))<2,'no trees on the grandstands');
{const main=sceneryBands(data).filter(b=>b.name==='pista'),p=P.find(p=>p[c.s]>g1+60&&bandClearance(main,p[c.x],p[c.y]).distance>25),d=p[c.hi]+6;
 assert(Math.abs(edgeAt(p[c.x]+p[c.lx]*d,p[c.y]+p[c.ly]*d)-6)<1.5,'field measures metres from the pit exit road');}

// Billboards: off every road and garage, and never in front of the crowd.
const bands=sceneryBands(data),spots=billboardSpots(data);
assert.equal(spots.length,16);
for(const [i,spot] of spots.entries()){
 assert(spot.clearance>BOARD_CLEARANCE,`billboard ${i} clear of roads and stands (${spot.clearance.toFixed(1)} m)`);
 for(const b of stands){
  const dx=spot.x-b.x,dy=spot.y-b.y,a=dx*b.tx+dy*b.ty,l=dx*b.rx+dy*b.ry;
  assert(!(Math.abs(a)<b.length/2+10&&l>0&&l<b.roof.to),`billboard ${i} is not in front of the grandstand`);
 }
}

// The roof covers every row with room to stand up, and shades the crowd from the game's sun.
const sun=SUN_DIRECTION.clone();let shaded=0,seats=0;
const span=stands.map(b=>stands[0].tx*(b.x-stands[0].x)+stands[0].ty*(b.y-stands[0].y)),from=Math.min(...span)-STAND.length/2-.15,to=Math.max(...span)+STAND.length/2+.15;
for(const b of stands){
 assert(b.front>b.apron&&b.apron>data.samples[0][4]/2+guardrailClearance(data,b.s,-1),'stands behind the guardrail');
 for(const row of b.rows){
  assert(b.roof.from<row.from-1&&b.roof.to>row.to,'roof over every row');
  assert(roofHeight(b,row.to)-row.top>2.9,'fans can stand up under the roof');
  // Ray from a seated head toward the sun, in the block frame (a along, l away from the track).
  const sa=sun.x*b.tx-sun.z*b.ty,sl=sun.x*b.rx-sun.z*b.ry,su=sun.y;
  for(let a=-b.length/2+1;a<b.length/2;a+=2){
   const l0=(row.from+row.to)/2,h0=row.top+1.2,k=(roofHeight(b,l0)-h0)/(su+b.roof.slope*sl),l=l0+sl*k,along=a+sa*k+b.tx*(b.x-stands[0].x)+b.ty*(b.y-stands[0].y);
   seats++;if(l>b.roof.from&&l<b.roof.to&&along>from&&along<to)shaded++;
  }
 }
}
assert(shaded/seats>.85,`grandstand roof shades the seats: ${(100*shaded/seats).toFixed(0)}%`);

// Fans sit on the benches, above the ground and under the roof, facing the track.
const built=createGrandstands(data,{concrete:null},ground),crowd=createCrowd(built.rows);
assert.equal(built.stats.rows,STAND.blocks*STAND.rows*4);
assert(crowd.count>2000,'the main grandstand is full: '+crowd.count);
const m=new THREE.Matrix4(),pos=new THREE.Vector3(),rot=new THREE.Quaternion(),scale=new THREE.Vector3();let fans=0;
// (Each block's far figures, landscape.js fanGeometry far, are the same fans again: counted once.)
crowd.root.traverse(o=>{if(!o.isInstancedMesh||o.userData.farCrowd)return;for(let i=0;i<o.count;i++){
 o.getMatrixAt(i,m);m.decompose(pos,rot,scale);const x=pos.x,y=-pos.z,look=new THREE.Vector3(0,0,1).applyQuaternion(rot);
 const b=stands.reduce((best,s)=>Math.hypot(s.x-x,s.y-y)<Math.hypot(best.x-x,best.y-y)?s:best),l=(x-b.x)*b.rx+(y-b.y)*b.ry;
 assert(look.x*-b.rx+(-look.z)*-b.ry>.99,'fan faces the track');
 assert(pos.y>ground(x,y)+.3&&pos.y<roofHeight(b,l)-2,'fan seated above the ground, under the roof');fans++;
}});
assert.equal(fans,crowd.count);
// Near or far figure by how big a block looks (crowdNear): through the chase lens near at 45 m, far at 60; the broadcast
// camera's 4.5° lens sees a block 500 m off near; a few metres of give, per camera, so a block on the line holds.
{
 const [a,b]=crowd.root.children,n=a.count,c=a.boundingSphere.center,r=a.boundingSphere.radius;
 const draw=(cam,d)=>{cam.position.set(c.x+r+d,c.y,c.z);cam.updateMatrixWorld();a.onBeforeRender(null,null,cam);b.onBeforeRender(null,null,cam);return [a.count,b.count];};
 const chase=new THREE.PerspectiveCamera(58,16/9,.1,2000),tv=new THREE.PerspectiveCamera(4.5,16/9,.1,9000);
 assert.deepEqual(draw(chase,40),[n,0],'near');assert.deepEqual(draw(chase,52),[n,0],'near holds a little past the line');assert.deepEqual(draw(chase,56),[0,n],'far');
 assert.deepEqual(draw(chase,48),[0,n],'far holds a little inside it');assert.deepEqual(draw(chase,44),[n,0],'near again');
 assert.deepEqual(draw(tv,500),[n,0],'the broadcast camera\'s long lens');
 assert(crowdNear(45,chase)&&!crowdNear(60,chase)&&crowdNear(600,tv)&&!crowdNear(45,new THREE.PerspectiveCamera(120,1,.1,100)),'by the lens');
}
// The skyline's towers keep some tone through the haze only where the weather's fog reaches far (a clear Média day and
// beyond: never on Curta, in a drizzle on Média or in the rain), and are wholly fog before the camera's far plane.
{
 const src=fs.readFileSync(new URL('../teste/landscape.js',import.meta.url),'utf8');
 assert(src.includes('mix(1.0,.45,smoothstep(6.0,55.0,up)*smoothstep(1850.0,2300.0,fogReach))')&&src.includes('fogFactor=max(fogFactor,smoothstep(skylineFar*.8,skylineFar*.97,vFogDepth));'),'tower fog');
 const cap=(view,time,rain)=>{const end=VIEW_DISTANCES[view].fog[1]*weatherProfile(time,rain).fog.reach,t=Math.min(1,Math.max(0,(end-1850)/450));return t*t*(3-2*t);};
 for(const time of ['dia','fim_de_tarde','noite']){assert.equal(cap('curta',time,'seco'),0,`Curta ${time}`);for(const view of Object.keys(VIEW_DISTANCES))assert.equal(cap(view,time,'chuva'),0,`${view} ${time} rain`);assert.equal(cap('media',time,'garoa'),0);}
 assert(cap('media','dia','seco')>.99&&cap('media','fim_de_tarde','seco')>.9&&cap('longa','dia','seco')===1,'a clear day from Média up');
}
built.root.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();assert(Number.isFinite(o.geometry.boundingBox.min.y),o.name);}});
console.log(JSON.stringify({ground:fit.stats,worst:Object.fromEntries(Object.entries(worst).map(([k,v])=>[k,+v.e.toFixed(3)])),verge:{vertices:verge,dipped,deepest:+deepest.toFixed(2)},shade:+(shaded/seats).toFixed(3),fans:crowd.count,billboards:spots.map(s=>Math.round(s.p[0]))}));
console.log('testar_cenario: OK');
