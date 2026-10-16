// Passeio pela cidade (pedido da equipe, 15/10/2026: "tem muita cidade e o jogo nao deixa o carro sair da pista; precisa de
// uns pontos onde da para sair e passear; e quando saí o carro as vezes voou"). No Autodromo Floripa os muros se abrem em
// algumas ruas (meta.roam, gerar_cidade_floripa.py PASSEIO) para zonas da cidade (physics.js RoamWorld). Confere, so com
// os dados (sem os modulos do navegador):
// - cada abertura: os muros param nela (meta.rails), com a ponta reta (sem o alargamento das pontas soltas);
// - em cada zona o carro sai pela abertura, anda ~100 m pelas ruas dela sem bater, sempre com as rodas no chao desenhado
//   (o chao ajustado, track-clearance.js fitGround, a poucos cm), no asfalto (pavimentado), e volta pela abertura a volta;
// - bater numa fachada a 36 km/h para o carro (um acidente), encostar devagar nao; o mar (Aterro) e um bloqueio da borda
//   seguram o carro na zona; o muro por tras nao deixa o carro voltar para a pista atravessando-o; o R (recover) o poe
//   de novo na volta;
// - perto das cabeceiras das pontes (meta.decks) e longe da volta com uma estacao de tabuleiro como a mais proxima, o chao
//   fora dos muros e o terreno (antes: o plano do tabuleiro esticado, o carro lancado); andando ali nada pula;
// - os outros circuitos nao tem zonas (roamWorld null: a fisica deles e a de sempre).
// Uso: node scripts/testar_passeio_cidade.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestCar,roamWorld,guardrailClearance,guardrailSections,onDeck,CG_HEIGHT} from '../teste/physics.js';
import {fitGround,groundHeight} from '../teste/track-clearance.js';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';

const load=id=>{const d=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));d.meta.id=id;return d;};
const data=load('floripa'),a=data.samples,L=data.meta.reconstructed_xy_m,w=roamWorld(data),report={zones:{}};
const station=s=>{const i=a.findIndex(p=>p[0]>=((s%L)+L)%L);return i<0?0:i;},wrapA=x=>Math.atan2(Math.sin(x),Math.cos(x));
const fit=fitGround(data),drawn=(x,y)=>groundHeight(data.terrain,fit.heights,x,y);
// (The player's car stands on the ground as drawn, as main.js gives it: car.heights.)
TestCar.prototype.heights=fit.heights;
const idle={left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0};

// --- The zones and their gaps.
assert(w&&w.zones.length>=2&&w.zones.length<=4,'Floripa: two to four zones of the city open to roam');
for(const z of w.zones)for(const g of z.gaps){
 assert(g.s1-g.s0>8&&g.s1-g.s0<40,`${z.name}: a gap the width of a street (${g.s0}-${g.s1})`);
 const secs=guardrailSections(data,g.side);
 assert(secs.some(([f,t])=>Math.abs(t-g.s0)<1e-6)&&secs.some(([f,t])=>Math.abs(f-g.s1)<1e-6)&&!secs.some(([f,t])=>f<g.s1-1e-6&&t>g.s0+1e-6),`${z.name}: the walls stop at the gap`);
 // Square ends: at the wall's last metre the gap from the asphalt is the station's own (no 5 m flare).
 for(const s of [g.s0-.5,g.s1+.5]){const p=a[station(s)],k=g.side<0?15:16;assert(Math.abs(guardrailClearance(data,s,g.side)-p[k])<.3,`${z.name}: the wall's end at ${s} stays square`);}
}

// --- Free cells of a zone (its open ground, 2.6 m from its edges) and the way through them from the gap's mouth.
function plan(z,length){
 const S=2,nx=Math.ceil((z.x1-z.x0)/S),ny=Math.ceil((z.y1-z.y0)/S),free=new Uint8Array(nx*ny),xy=k=>[z.x0+(k%nx+.5)*S,z.y0+(Math.floor(k/nx)+.5)*S];
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=z.x0+(i+.5)*S,y=z.y0+(j+.5)*S;if(w.inside(z,x,y)&&!w.edge(x,y,2.6,z,w.query(x,y,2.6)))free[j*nx+i]=1;}
 const g=z.gaps[0],sm=(g.s0+g.s1)/2,p=a[station(sm)],face=p[4]/2+guardrailClearance(data,sm,g.side),out=[p[1]+p[9]*g.side*(face+5),p[2]+p[10]*g.side*(face+5)];
 let k0=-1,best=1e9;free.forEach((f,k)=>{if(!f)return;const [x,y]=xy(k),d=Math.hypot(x-out[0],y-out[1]);if(d<best){best=d;k0=k;}});
 const dist=new Int32Array(free.length).fill(-1),prev=new Int32Array(free.length).fill(-1),q=[k0];dist[k0]=0;
 for(let h=0;h<q.length;h++){const k=q[h],i=k%nx,j=Math.floor(k/nx);for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const u=i+di,v=j+dj;if(u<0||v<0||u>=nx||v>=ny)continue;const m=v*nx+u;if(!free[m]||dist[m]>=0)continue;dist[m]=dist[k]+1;prev[m]=k;q.push(m);}}
 let end=k0;dist.forEach((d,k)=>{if(d<0)return;const r=Math.hypot(xy(k)[0]-out[0],xy(k)[1]-out[1]),e=Math.hypot(xy(end)[0]-out[0],xy(end)[1]-out[1]);if(Math.abs(r-length)<Math.abs(e-length))end=k;});
 const path=[];for(let k=end;k>=0;k=prev[k])path.unshift(xy(k));
 return {g,sm,p,face,out,path,reachable:dist.filter(d=>d>=0).length*S*S};
}
// Follows a path (aims 6 m ahead), slows for turns and to stop at its end; turns round in reverse when the way lies behind.
function drive(c,path,v,{stop=true,limit=120*90,log=null}={}){
 let k=0,steps=0,turning=false;const out={impact:0,impacts:0,maxDz:0,air:0,offDrawn:0,unpaved:0,zoneSteps:0,steps:0};let lastZ=c.z;
 while(steps<limit){
  let [tx,ty]=path[k];while(k<path.length-1&&Math.hypot(tx-c.x,ty-c.y)<6){k++;[tx,ty]=path[k];}
  const sp=Math.hypot(c.vx,c.vy),al=wrapA(Math.atan2(ty-c.y,tx-c.x)-c.heading),left=Math.hypot(tx-c.x,ty-c.y)+(path.length-1-k)*2;
  if(Math.abs(al)>2)turning=true;else if(Math.abs(al)<1)turning=false;
  const vt=Math.min(v,Math.abs(al)>.6?4:v,stop?Math.sqrt(2*2.5*Math.max(0,left-2)):99),st=Math.max(-1,Math.min(1,al*2.2));
  const cmd=turning?{...idle,left:al<0?1:0,right:al>0?1:0,reverse:sp<3?1:0,brake:sp>=3?1:0}:{...idle,left:Math.max(0,st),right:Math.max(0,-st),throttle:sp<vt?Math.min(1,(vt-sp)*.4):0,brake:sp>vt+.5?1:0};
  c.step(cmd,1/120);steps++;
  out.maxDz=Math.max(out.maxDz,Math.abs(c.z-lastZ));lastZ=c.z;if(c.wallImpactSpeed>0){out.impacts++;out.impact=Math.max(out.impact,c.wallImpactSpeed);}
  if(c.roamZone){out.zoneSteps++;if(c.wheelsDown<3)out.air++;if(!c.surface.onRoad)out.unpaved++;
   // The wheels on the ground the screen draws: the physics' ground under each contact patch against the fitted grid.
   for(let i=0;i<4;i++){const r=c.patches?.[i];if(!r)continue;const x=c.x+r[0],y=c.y+r[1],gz=drawn(x,y);if(gz!=null&&Math.abs(c.ground(x,y).z-.055-gz)>.06)out.offDrawn++;}}
  log?.(c);
  if(stop&&k===path.length-1&&left<2.5&&sp<.3)break;
  if(!stop&&k===path.length-1&&left<4)break;
 }
 out.steps=steps;return out;
}
const car=new TestCar(data);
for(const z of w.zones){
 const P=plan(z,100),r={reachable_m2:P.reachable,path_m:P.path.length*2};
 assert(P.reachable>2500,`${z.name}: a few thousand m² of city reachable from the gap (${P.reachable})`);
 // Out through the gap and ~100 m into the zone.
 car.reset(station(P.sm-45));car.awaitingStart=false;
 const t0=performance.now(),go=drive(car,[[P.p[1],P.p[2]],P.out,...P.path],9),ms=(performance.now()-t0)/go.steps;
 assert.equal(car.roamZone?.name,z.name,`${z.name}: the car is in the zone`);
 assert(go.impacts===0,`${z.name}: out and through the streets without a hit (${go.impacts} steps, ${go.impact.toFixed(2)} m/s)`);
 // (The city's hills, the Estreito's: over a crest now and then a wheel goes light.)
 assert(go.maxDz<.3&&go.air<go.zoneSteps*.03,`${z.name}: on the ground all the way (|Δz| ${go.maxDz.toFixed(3)} m a step, ${go.air} steps with a wheel up)`);
 assert(go.offDrawn<go.zoneSteps*4*.02,`${z.name}: the wheels on the drawn ground (${go.offDrawn} patches more than 6 cm off)`);
 r.out={steps:go.steps,zoneSteps:go.zoneSteps,maxDz:+go.maxDz.toFixed(3),unpaved:go.unpaved,offDrawn:go.offDrawn,msPerStep:+ms.toFixed(3)};
 // Slowly into its nearest edge (a facade, a closure, a fence): stops, no crash.
 // (From a cell of the way in: square to its nearest edge where that edge runs straight for a few metres, the nose a metre
 // and a half short of it, with 12 m of open ground behind to take a run at it; the city open to roam is all edges.)
 const near=(x,y,r)=>w.edge(x,y,r,z,w.query(x,y,r)),clear=(x,y)=>w.inside(z,x,y)&&!near(x,y,1.6);
 const start=(()=>{for(let k=P.path.length-1;k>=0;k--){const [x,y]=P.path[k];let e=null;for(let rr=4;rr<30&&!e;rr+=2)e=near(x,y,rr);if(!e)continue;
  const ux=(e.qx-x)/e.d,uy=(e.qy-y)/e.d,back=car.body.front+1.5,px=e.qx-ux*back,py=e.qy-uy*back;
  const straight=[-2.5,2.5].every(t=>{const q=near(e.qx-uy*t-ux*1.5,e.qy+ux*t-uy*1.5,2.2);return q&&Math.abs(q.d-1.5)<.25;});
  if(straight&&clear(px,py)&&[3,6,9,12].every(b=>clear(px-ux*b,py-uy*b)))return {x:px,y:py,h:Math.atan2(uy,ux)};}return null;})();
 assert(start,`${z.name}: a place to drive into its edge from`);
 const into=(v,steps)=>{const h=start.h;car.relocate(start.x-Math.cos(h)*(v>5?10:0),start.y-Math.sin(h)*(v>5?10:0),NaN,h);car.vx=Math.cos(h)*v;car.vy=Math.sin(h)*v;car.stepX=car.x;car.stepY=car.y;
  let impact=0,top=0;for(let k=0;k<steps;k++){car.step({...idle,throttle:Math.hypot(car.vx,car.vy)<v?.6:0},1/120);impact=Math.max(impact,car.wallImpactSpeed);top=Math.max(top,car.z-CG_HEIGHT-(drawn(car.x,car.y)??car.z));}
  return {impact,speed:Math.hypot(car.vx,car.vy),inside:w.inside(z,car.x,car.y),top};};
 const slow=into(2,360);
 assert(slow.impact>0&&slow.impact<4&&slow.inside,`${z.name}: nudged into its edge at 7 km/h: stopped there, no crash (${slow.impact.toFixed(2)} m/s)`);
 const fast=into(10,180);
 assert(fast.impact>4&&fast.speed<3&&fast.inside&&fast.top<.6,`${z.name}: into its edge at 36 km/h: a crash, stopped, still in the zone, not thrown up (${fast.impact.toFixed(1)} m/s, ${fast.speed.toFixed(1)} m/s after, ${fast.top.toFixed(2)} m up)`);
 r.edge={slow:+slow.impact.toFixed(2),fast:+fast.impact.toFixed(2)};
 // Back to the gap and onto the lap.
 car.relocate(...P.path.at(-1),NaN,car.heading);car.vx=car.vy=0;
 const back=drive(car,[...P.path.slice().reverse(),P.out,[P.p[1],P.p[2]],[a[station(P.sm+30)][1],a[station(P.sm+30)][2]]],8,{stop:false});
 assert(!car.roamZone&&Math.abs(car.surface.d)<car.surface.width/2&&Number.isFinite(car.laps)&&typeof car.lapValid==='boolean',`${z.name}: back on the lap through the gap (d ${car.surface.d.toFixed(1)})`);
 r.back={steps:back.steps,impacts:back.impacts};
 // R from deep in the zone: on the lap again.
 car.relocate(...P.path.at(-1),NaN,0);car.step(idle,1/120);assert.equal(car.roamZone?.name,z.name);
 car.recover();car.step(idle,1/120);
 assert(!car.roamZone&&Math.abs(car.surface.d)<car.surface.width/2,`${z.name}: R puts the car back on the lap`);
 report.zones[z.name]=r;
}

// --- The walls from behind: along the Centro's avenue at the wall, 30° into it at 43 km/h: the car stays in the zone.
{const z=w.zones.find(q=>q.name==='centro');if(z){const g=z.gaps[0],s=g.s1+25,p=a[station(s)],face=p[4]/2+guardrailClearance(data,s,g.side),t=Math.atan2(p[8],p[7]);
 car.relocate(p[1]+p[9]*g.side*(face+3.5),p[2]+p[10]*g.side*(face+3.5),NaN,t-g.side*.5);const h=car.heading;car.vx=Math.cos(h)*12;car.vy=Math.sin(h)*12;car.stepX=car.x;car.stepY=car.y;
 let minD=Infinity,impact=0;for(let k=0;k<240;k++){car.step(idle,1/120);minD=Math.min(minD,Math.abs(car.surface.d)-car.surface.width/2-guardrailClearance(data,car.surface.s,g.side));impact=Math.max(impact,car.wallImpactSpeed);}
 assert(impact>0&&minD>.5&&car.roamZone?.name==='centro',`Centro: the wall's back holds a car hitting it from the avenue (${minD.toFixed(2)} m behind its face at the closest)`);
 report.wallBehind={impact:+impact.toFixed(2),closest:+minD.toFixed(2)};}}

// --- The sea (Aterro): at 54 km/h into the shore: stopped on land.
{const z=w.zones.find(q=>q.name==='aterro');if(z){let shore=null;
 for(let y=z.y0;y<z.y1&&!shore;y+=3)for(let x=z.x0;x<z.x1&&!shore;x+=3){if(!w.inside(z,x,y)||w.edge(x,y,3,z,w.query(x,y,3)))continue;const e=w.edge(x,y,9,z,w.query(x,y,9));if(!e)continue;const ux=(e.qx-x)/e.d,uy=(e.qy-y)/e.d;if(car.terrain(e.qx+ux*5,e.qy+uy*5)<0&&e.d>6)shore={x,y,h:Math.atan2(uy,ux)};}
 assert(shore,'Aterro: a stretch of its edge on the shore');
 car.relocate(shore.x,shore.y,NaN,shore.h);car.vx=Math.cos(shore.h)*15;car.vy=Math.sin(shore.h)*15;car.stepX=car.x;car.stepY=car.y;
 let low=Infinity;for(let k=0;k<360;k++){car.step(idle,1/120);low=Math.min(low,car.terrain(car.x,car.y));}
 assert(low>.25&&w.inside(z,car.x,car.y)&&Math.hypot(car.vx,car.vy)<3,`Aterro: the shore stops the car on land (ground ${low.toFixed(2)} m at the lowest)`);
 report.sea={ground:+low.toFixed(2)};}}

// --- A closure on a zone's edge, at 11 km/h: the car stops at its barriers.
{const c=data.scenery.city.closures.find(q=>q.zone&&q.kind!=='service'),z=w.zones.find(q=>q.name===c.zone),h=c.heading;
 car.relocate(c.x-Math.cos(h)*10,c.y-Math.sin(h)*10,NaN,h);car.vx=Math.cos(h)*3;car.vy=Math.sin(h)*3;car.stepX=car.x;car.stepY=car.y;
 for(let k=0;k<600;k++)car.step({...idle,throttle:Math.hypot(car.vx,car.vy)<3?.5:0},1/120);
 const nose=(c.x-car.x)*Math.cos(h)+(c.y-car.y)*Math.sin(h)-car.body.front;
 assert(nose>-.2&&nose<1.2&&w.inside(z,car.x,car.y),`${c.name||c.kind}: stopped at the closure's barriers (${nose.toFixed(2)} m from its line)`);
 report.closure={name:c.name,nose:+nose.toFixed(2)};}

// --- Off the lap by the bridges' heads (meta.decks) and far away: the ground is the terrain, nothing is thrown up.
{const t=data.terrain,probe=new TestCar(data);let checked=0,worst=0;
 const ends=data.meta.decks.flat();
 for(const s0 of ends)for(let ds=-60;ds<=60;ds+=6)for(const side of [-1,1])for(const off of [3,8,20,45]){
  const i=station(s0+ds),p=a[i],d=p[4]/2+guardrailClearance(data,p[0],side)+1+off,x=p[1]+p[9]*side*d,y=p[2]+p[10]*side*d;
  if(probe.terrain(x,y)<.3)continue;probe.index=i;const q=probe.sample(x,y);if(Math.abs(q.d)<q.width/2+guardrailClearance(data,q.s,side)+1+3.01)continue;
  worst=Math.max(worst,Math.abs(q.z-.055-probe.terrain(x,y)));checked++;}
 assert(checked>100&&worst<.01,`beside the decks' ends, off the walls: the terrain (${checked} points, ${worst.toFixed(3)} m off at most)`);
 // Far from the lap with a deck station the nearest: never the deck's plane drawn on.
 let far=0,farWorst=0;
 for(let y=t.y0+30;y<t.y0+(t.ny-1)*t.step-30;y+=37)for(let x=t.x0+30;x<t.x0+(t.nx-1)*t.step-30;x+=37){
  if(probe.terrain(x,y)<.3)continue;const q=probe.nearest(x,y,true),s=a[q.i][0];if(!onDeck(data,s)||Math.hypot(q.ex,q.ey)<60)continue;
  probe.index=q.i;const r=probe.sample(x,y);farWorst=Math.max(farWorst,Math.abs(r.z-.055-probe.terrain(x,y)));far++;}
 assert(far>50&&farWorst<.01,`far off the lap by the bridges: the terrain (${far} points, ${farWorst.toFixed(3)} m off at most)`);
 // Driving there: put down on land 25-60 m off the walls by every deck end, rolling at 12 m/s (over the ground's own crests
 // a wheel may leave it for a moment; never a jump to a deck's height).
 let jumps=0,maxUp=0,runs=0;
 for(const s0 of ends)for(const side of [-1,1])for(const off of [25,60]){
  const i=station(s0+(side>0?-30:30)),p=a[i],d=p[4]/2+guardrailClearance(data,p[0],side)+off,x=p[1]+p[9]*side*d,y=p[2]+p[10]*side*d;
  // (Put down on the ground, not where a deck passes overhead: a car only gets under one by driving there, below.)
  if(probe.terrain(x,y)<.5)continue;probe.index=i;const q=probe.sample(x,y);if(Math.abs(q.z-.055-probe.terrain(x,y))>.01)continue;
  const c=new TestCar(data);c.relocate(x,y,NaN,Math.atan2(p[8],p[7]));c.vx=Math.cos(c.heading)*12;c.vy=Math.sin(c.heading)*12;c.stepX=c.x;c.stepY=c.y;runs++;
  for(let k=0;k<240;k++){const z0=c.z;c.step(idle,1/120);if(c.terrain(c.x,c.y)<.3)break;const up=c.z-CG_HEIGHT-c.terrain(c.x,c.y);maxUp=Math.max(maxUp,up);if(Math.abs(c.z-z0)>.3)jumps++;}
 }
 assert(runs>=6&&jumps===0&&maxUp<1.5,`rolling off the lap by the bridges' heads: no jumps (${runs} runs, ${maxUp.toFixed(2)} m above the ground at most)`);
 // Under the Hercílio Luz's island approach (its deck 15 m and more overhead): the car rolls across on the ground below.
 let under=0,underUp=0,crossed=false;
 for(let i=station(260);a[i][0]<330;i+=3){const p=a[i];if(p[3]-probe.terrain(p[1],p[2])<12)continue;
  for(const side of [-1,1]){const d=p[4]/2+guardrailClearance(data,p[0],side)+14,x=p[1]+p[9]*side*d,y=p[2]+p[10]*side*d;if(probe.terrain(x,y)<1)continue;probe.index=i;if(Math.abs(probe.sample(x,y).z-.055-probe.terrain(x,y))>.01)continue;
   const c=new TestCar(data),h=Math.atan2(-p[10]*side,-p[9]*side);c.relocate(x,y,NaN,h);c.vx=Math.cos(h)*10;c.vy=Math.sin(h)*10;c.stepX=c.x;c.stepY=c.y;under++;
   for(let k=0;k<360;k++){c.step(idle,1/120);if(c.terrain(c.x,c.y)<.3)break;underUp=Math.max(underUp,c.z-CG_HEIGHT-c.terrain(c.x,c.y));if(c.underDeck)crossed=true;}}
  if(under>=4)break;}
 assert(under>=2&&crossed&&underUp<.6,`under the bridge's approach: rolled across on the ground (${under} runs, ${underUp.toFixed(2)} m above it at most)`);
 report.underDeck={runs:under,maxUp:+underUp.toFixed(2)};
 report.bridges={beside:checked,far,runs,maxUp:+maxUp.toFixed(2)};}

// --- Every other circuit: no zones, the physics as always.
for(const id of Object.keys(CIRCUITS)){if(id==='floripa')continue;const d=load(id);assert(!d.meta.roam&&roamWorld(d)===null&&new TestCar(d).roam===null,`${id}: no zones of a city to roam`);}
console.log(JSON.stringify({passed:true,report},null,1));
