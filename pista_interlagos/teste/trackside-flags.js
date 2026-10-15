import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,guardrailClearance,guardrailPresent} from './physics.js';
import {sceneryBands,bandClearance,standLayout,standPoint,roofHeight,gantryPosts} from './track-clearance.js';
import {pitGeometry,pitLane,wallsNear} from './pit-lane.js';
import {billboardSpots,billboardFormat} from './track-surface.js';
import {marshalSpots,towerSpots,trackPoint,bend} from './trackside.js';
import {canvasTexture} from './pit-textures.js';
import {circuitSponsors} from './sponsors.js';

// Race-day air round the track: flags that fly in the breeze and whip round when a car blasts past,
// flexible marker rods at the corners that a car can flatten, and 300/200/100 boards before the big
// stops. Cars only stir them (no physics, no camera obstacles). Placement is plain data from the
// track, shared with the Node check (testar_bandeiras.mjs); every pole, rod and cloth is one draw.

// Sensação de velocidade (graphics-settings.js speedEffects): flags flown up to this tier and at most
// this many, the finer cloth, how far they are drawn and their shadows. off keeps today's still
// marshal flags; the brake boards stand at every level.
export const FLAG_LEVELS=Object.freeze({
 off:{tier:0,cap:40,fine:false,reach:140,detail:0,shadow:true,still:true},
 leve:{tier:1,cap:48,fine:false,reach:170,detail:1,shadow:true},
 media:{tier:2,cap:72,fine:false,reach:140,detail:0,shadow:false},
 completa:{tier:3,cap:340,fine:true,reach:320,detail:1,shadow:true}
});
// Tiers: 0 the marshals' flags, 1 the start gantry, 2 the main straight's poles, half the roof flags
// and the corner-exit rods, 3 everything else.
const TIER_NAMES=['off','leve','media','completa'];
// Only cloth lower than this (metres above the road) casts a shadow: the pennants, rods and marshals'
// flags by the cars. Roof, billboard and gantry flags fly too high for their thin poles to leave one, by
// kind whatever their height (a low board's corner flags flew at 5.4 m on Curvelo).
export const FLAG_SHADOW_UP=6,HIGH_FLAGS=Object.freeze(['roof','billboard','start']);
export const flagShadowless=t=>t.up>FLAG_SHADOW_UP||HIGH_FLAGS.includes(t.kind);
// The breeze in three.js xz, the same one that moves the lakes and the verge grass (landscape.js).
export const FLAG_WIND=Object.freeze([.82,.57]);
const PATTERN={plain:0,chequer:1,brasil:2,stripes:3,diagonal:4,pennant:5,halves:6};
// The circuit's sponsors' colours (sponsors.js, the same as its rail banners), as cloth: [field, accent].
const sponsorCloth=data=>circuitSponsors(data.meta?.id,data.meta?.name).map(s=>[parseInt(s.bg.slice(1),16),parseInt(s.accent.slice(1),16)]);
const KIND={flag:0,rod:1};
// Corners: stations turning tighter than this (rad/m, about a 170 m radius).
const CORNER_K=1/170;
// Edge poles: metres between poles on one side (each gap drawn from .7 to 1.3 of it, the other side
// starts half a gap on), and how far they keep from the rail line, billboards, TV towers, marshal
// posts and the low TV cameras.
const POLE_GAP=21,POLE_BEHIND=.5,POLE_CLEAR=20;
const wrapS=(s,L)=>((s%L)+L)%L;
const rel=(a,b,L)=>{let d=a-b;if(d>L/2)d-=L;else if(d<=-L/2)d+=L;return d;};
// Van der Corput order: any prefix of a tier is spread round the lap.
const spread=k=>{let v=0,f=.5;for(;k;k>>=1,f/=2)if(k&1)v+=f;return v;};

// TvCamera's low verge cameras (tv-camera.js): nothing tall stands in their shot.
export function lowCameraSpots(data,towers=towerSpots(data),boards=billboardSpots(data),bands=sceneryBands(data)){
 const L=data.meta.reconstructed_xy_m,a=data.samples,out=[],hash=n=>{const v=Math.sin(n*127.1)*43758.5453;return v-Math.floor(v);};
 for(let s=60,k=0;s<L;s+=190,k++){
  if(towers.some(c=>{const d=Math.abs(c.s-s);return Math.min(d,L-d)<90;}))continue;
  const p=a[Math.max(0,a.findIndex(q=>q[0]>=s))];
  for(const side of k%2?[1,-1]:[-1,1]){
   const off=side*(p[4]/2+13+hash(k)*6),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
   if(bandClearance(bands,x,y).distance<3||boards.some(b=>Math.hypot(b.x-x,b.y-y)<20))continue;
   out.push({s,x,y});break;
  }
 }
 return out;
}

// Corners from the lap's own bend, stations every 2 m: runs turning one way tighter than CORNER_K,
// with entry, tightest point, exit, sign (+ left) and the angle turned. from/to may pass L.
export function cornerRuns(data){
 const L=data.meta.reconstructed_xy_m,n=Math.floor(L/2),k=Array.from({length:n},(_,i)=>bend(data,i*2));
 // Read from the straightest station on, so no run wraps the list.
 let start=0;for(let i=1;i<n;i++)if(Math.abs(k[i])<Math.abs(k[start]))start=i;
 const runs=[];let cur=null;
 for(let j=0;j<=n;j++){
  const v=j<n?k[(start+j)%n]:0,inside=Math.abs(v)>CORNER_K,s=(start+j)*2;
  if(cur&&(!inside||Math.sign(v)!==cur.sign)){runs.push(cur);cur=null;}
  if(!inside)continue;
  if(!cur)cur={from:s,to:s,sign:Math.sign(v),peak:0,apex:s,turn:0};
  cur.to=s;cur.turn+=Math.abs(v)*2;if(Math.abs(v)>cur.peak){cur.peak=Math.abs(v);cur.apex=s;}
 }
 return runs.filter(r=>r.turn>.3);
}

// Brake boards: 300, 200 and 100 m before the turn-in of the corners reached at speed (a long
// approach, a real stop), on the outside of the approach, off every road, pit wall and lane, clear
// of billboards and TV cameras. A board that would stand in the corner before is left out.
export function brakeBoardSpots(data,{runs=cornerRuns(data),bands=sceneryBands(data).map(b=>({...b,margin:0})),avoid=[]}={}){
 const L=data.meta.reconstructed_xy_m,geo=pitGeometry(data),out=[];
 // Corners less than 60 m apart are one stop (esses, chicanes): the boards count to the first.
 const groups=[];for(const r of runs){const g=groups.at(-1);if(g&&r.from-g.to<60){g.to=r.to;g.peak=Math.max(g.peak,r.peak);g.turn+=r.turn;}else groups.push({...r});}
 if(groups.length>1&&groups[0].from+L-groups.at(-1).to<60){const last=groups.pop();groups[0]={...groups[0],from:last.from-L,peak:Math.max(last.peak,groups[0].peak),sign:last.sign};}
 groups.forEach((g,i)=>{
  const before=groups[(i+groups.length-1)%groups.length],approach=groups.length>1?wrapS(g.from-before.to,L):L-(g.to-g.from);
  if(g.peak<1/110||approach<140)return;
  // One side for a whole countdown: the outside, unless the inside has room for more of its boards.
  const fit=side=>[100,200,300].filter(metres=>metres+40<=approach).map(metres=>{
   for(const shift of [0,-4,4,-8,8,-12,12]){
    const s=wrapS(g.from-metres+shift,L),{p}=trackPoint(data,s),off=side*(p[4]/2+2.6),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
    if(bandClearance(bands,x,y).distance<1.8||geo&&wallsNear(geo,x,y,1.5).length||pitBlocked(data,s,off)||avoid.some(q=>Math.hypot(q.x-x,q.y-y)<q.r))continue;
    return {s,d:off,x,y,side,metres,corner:wrapS(g.from,L),p};
   }
   return null;
  });
  const outside=fit(-g.sign),inside=outside.includes(null)?fit(g.sign):[],count=list=>list.filter(Boolean).length;
  // A countdown always ends at 100: boards past a gap in it are left out.
  const chosen=count(inside)>count(outside)?inside:outside,gap=chosen.indexOf(null);
  out.push(...(gap<0?chosen:chosen.slice(0,gap)));
 });
 return out.sort((a,b)=>a.s-b.s);
}
// Curvelo's service lane and garages (pit-lane.js) on the infield side of its main straight.
function pitBlocked(data,s,off){const lane=pitLane(data,s);return !!lane&&off>0&&off<lane.reach+4;}

// --- Where a flag's cloth can go. The cloth as the vertex shader moves it (VERTEX_HEAD flagCloth), in the pole's
// frame: u out from the pole, v down from its top, dir the unit way it flies (x, z); [x, y, z] from the pole's top.
export function clothPoint(u,v,dir,lift,droop,amp,wave,w,h,taper){
 const a0=lift*Math.PI/2,k=Math.max(a0*droop,1e-3);
 const along=w*(Math.cos(a0*(1-droop*u))-Math.cos(a0))/k,down=w*(Math.sin(a0)-Math.sin(a0*(1-droop*u)))/k;
 const ripple=amp*w*u**1.15*(Math.sin(7*u-wave+v*1.4)+.35*Math.sin(17*u-wave*1.8-v*2.3));
 return [dir[0]*along-dir[1]*ripple,-h*(.5+(v-.5)*(1-taper*u))-down+.25*ripple*Math.sin(3*u+wave*.3),dir[1]*along+dir[0]*ripple];
}
// Every state the shader can put the cloth in (lift from the calmest hang to flying straight out, light or heavy
// cloth, the biggest ripple a gust can add at that lift, any heading): pairs of how far out from the pole and how
// low under its top (m), the lowest first at each reach. A rod (folded under a car) can lay its pole flat: its reach
// takes the pole's length and its lowest is the ground.
export function flagSweep(t){
 const taper=t.pattern===PATTERN.pennant?.92:0,pairs=[];
 for(let lift=.1;lift<=1.0001;lift+=.05)for(const heavy of [0,.5,1]){
  const droop=(1-lift)*(.3+.4*heavy)+.02,g=lift>.999?1.3:Math.max(0,(lift-.1)/1.1),amp=((.05+.07*lift)+.2*g)*1.15;
  for(let u=0;u<=1.0001;u+=.05)for(const v of [0,1]){
   const c=clothPoint(u,v,[1,0],lift,droop,0,0,t.w,t.h,taper),wobble=amp*t.w*u**1.15*1.35;
   pairs.push([Math.hypot(c[0],wobble),c[1]-.25*wobble,c[1]+.25*wobble]);
  }
 }
 const lean=Math.hypot(...(t.tilt??[0,0]))*t.pole,rod=t.kind==='rod';
 return {reach:Math.max(...pairs.map(p=>p[0]))+lean+(rod?t.pole:0),lean:lean+(rod?t.pole:0),rod,pairs};
}
// Whether the cloth (or the pole) can enter a box: {x, y (track data), ax, ay: its unit width axis, hu: half width,
// v0..v1: across it (along the axis turned left), z0..z1: its heights}, or a post {x, y, r, z0, z1}. t at its spot.
export function sweepHits(t,sweep,box){
 let d;
 if(box.r!==undefined)d=Math.max(0,Math.hypot(t.x-box.x,t.y-box.y)-box.r);
 else{const dx=t.x-box.x,dy=t.y-box.y,u=dx*box.ax+dy*box.ay,v=-dx*box.ay+dy*box.ax;d=Math.hypot(Math.max(0,Math.abs(u)-box.hu),Math.max(0,box.v0-v,v-box.v1));}
 if(d>sweep.reach)return false;
 const top=t.z+t.pole,base=sweep.rod?t.z:t.z;
 // The pole (a rod folds along the ground).
 if(d<=(t.radius??0)+sweep.lean+.02&&Math.min(top,box.z1)>Math.max(base,box.z0)+.01)return true;
 // The cloth: any state reaching the box's distance that dips under its top and still rises over its bottom.
 const near=Math.max(0,d-sweep.lean);
 for(const [r,low,high] of sweep.pairs)if(r>=near&&(sweep.rod?t.z:top+low)<box.z1&&top+high>box.z0)return true;
 return false;
}
// The boards a flag must never sweep through: each billboard's backing, its legs, catwalk and lamps (track-surface.js
// builds them from billboardFormat) and the 300/200/100 brake boards (here, posts and all, as a round post).
export function boardBoxes(data,billboards=billboardSpots(data),brake=[]){
 const probe=new TestCar(data),out=[];
 for(const b of billboards){
  const {p,side}=b,f=billboardFormat(data,b);probe.index=b.index;const ground=probe.sample(b.x,b.y).z,ry=Math.atan2(-p[7]*.8+p[8]*side*.6,p[8]*.8+p[7]*side*.6)+f.turn,ax=Math.cos(ry),ay=Math.sin(ry);
  // (the face's front, local +z of the board's build, is the axis turned right in the track's x/y: v < 0)
  const box=(hu,v0,v1,z0,z1,part)=>out.push({x:b.x,y:b.y,ax,ay,hu,v0,v1,z0:ground+z0,z1:ground+z1,part,slot:b.slot});
  const legTop=f.centre-(f.h+.4)/2+.05;
  box((f.w+.4)/2,-.11,.11,legTop-.05,f.top,'backing');
  box(Math.max(...f.legs.map(Math.abs))+.25,-.25,.25,-.6,legTop,'legs');
  if(f.lamps){box(f.w*.45,-.78,-.06,f.centre-f.h/2-.3,f.centre-f.h/2-.22,'catwalk');box(f.w/2-f.w/(2*f.lamps)+.26,-1.2,0,f.top,f.top+.45,'lamps');}
 }
 for(const b of brake){probe.index=trackPoint(data,b.s).i;const z=probe.sample(b.x,b.y).z;out.push({x:b.x,y:b.y,r:.75,z0:z-.05,z1:z+1.7,part:'brake'});}
 return out;
}

// Every flag, rod and board of a circuit, found once per track data: items in instance order (tier,
// then spread round the lap), the instance count per level, the boards and the crossing targets.
const plans=new WeakMap();
export function flagPlan(data){
 if(!plans.has(data))plans.set(data,buildPlan(data));
 return plans.get(data);
}
// The flags and rods flown at one level, by lap distance.
export function flagSpots(data,{level='completa'}={}){
 const plan=flagPlan(data);return plan.items.slice(0,plan.counts[level]??0).sort((a,b)=>a.s-b.s);
}

function buildPlan(data){
 const L=data.meta.reconstructed_xy_m,a=data.samples,bands=sceneryBands(data),open=bands.map(b=>({...b,margin:0})),geo=pitGeometry(data);
 const probe=new TestCar(data),locate=(x,y,s)=>{probe.index=trackPoint(data,s).i;const q=probe.sample(x,y);probe.index=q.i;return q;};
 const marshals=marshalSpots(data),towers=towerSpots(data),billboards=billboardSpots(data),cams=lowCameraSpots(data,towers,billboards,bands);
 const runs=cornerRuns(data),items=[],targets=[],TEAMS=sponsorCloth(data);
 let seed=7;const rand=()=>(seed=seed*16807%2147483647)/2147483647;
 // o.s only says where to look for the spot's own lap distance and offset. No two alike: a pole
 // leans up to o.lean rad in its own direction, the cloth is sun-faded by wear (0 new, 1 old).
 const add=(kind,tier,x,y,z,o)=>{const q=locate(x,y,o.s??0),lean=(o.lean??0)*Math.sqrt(rand()),turn=rand()*6.283;
  const t={kind,tier,x,y,z:z??q.z-.04,pole:0,radius:0,w:0,h:0,pattern:PATTERN.plain,c1:0xffffff,c2:0xffffff,rest:Math.atan2(FLAG_WIND[1],FLAG_WIND[0]),phase:rand()*6.283,wear:rand(),...o,tilt:[Math.cos(turn)*lean,Math.sin(turn)*lean],s:q.s,d:q.d};
  // Height of the cloth above the road there: the roof flags fly far above the cars' wake.
  t.up=t.z+t.pole-t.h/2-trackPoint(data,t.s).p[3];items.push(t);return t;};

 // 0: the marshals' yellow flags, held out over the track where trackside.js stands its posts.
 for(const m of marshals){
  const {i}=trackPoint(data,m.s);probe.index=i;const z=probe.sample(m.x,m.y).z,yaw=Math.atan2(-m.side*m.p[7],m.side*m.p[8]),c=Math.cos(yaw),sn=Math.sin(yaw);
  add('marshal',0,m.x+.28*c-.28*sn,m.y+.28*sn+.28*c,z+1.95,{s:m.s,w:.46,h:.32,c1:0xf2c318,c2:0xf2c318,rest:Math.atan2(-c,-sn),wear:rand()*.4});
 }
 // 1: four flags along the start gantry's beam, from post to post (open-circuit.js, curvelo-scene.js,
 // the Interlagos GLB's Portico 10 m either side of the line): chequered at the ends.
 const p0=a[0],gantry=data.scenery?gantryPosts(data).map(g=>({x:g.x,y:g.y,top:p0[3]+7.99})):[-10,10].map(d=>({x:p0[1]+p0[9]*d,y:p0[2]+p0[10]*d,top:p0[3]+(data.meta.id==='curvelo'?6.35:7.1)}));
 [[0,PATTERN.chequer,0x111111,0xf2f2f2],[1/3,PATTERN.brasil],[2/3,PATTERN.diagonal,0xb3161d,0xf0c419],[1,PATTERN.chequer,0x111111,0xf2f2f2]].forEach(([f,pattern,c1=0xffffff,c2=c1])=>{
  const [g,h]=gantry;add('start',1,g.x+(h.x-g.x)*f,g.y+(h.y-g.y)*f,g.top+(h.top-g.top)*f,{s:0,pole:2.8+.4*rand(),radius:.045,w:2.1,h:1.4,pattern,c1,c2,lean:.02,wear:rand()*.25});
 });
 for(const g of gantry){const q=locate(g.x,g.y,0);targets.push({s:q.s,d:q.d,kind:'post',index:-1,up:0});}

 // Edge poles on the straights and corner exits, behind the rail line; every other one on the
 // main straight (the one through the line) flies from Médio up.
 const inCorner=s=>runs.some(r=>rel(s,r.from,L)>=-4&&rel(s,r.to,L)<=4);
 const exiting=(s,side)=>runs.some(r=>{const after=rel(s,r.to,L);return after>4&&after<80&&side===-r.sign;});
 const firstRun=runs.length?runs.reduce((b,r)=>wrapS(r.from,L)<wrapS(b.from,L)?r:b):null,lastRun=runs.length?runs.reduce((b,r)=>wrapS(r.to,L)>wrapS(b.to,L)?r:b):null;
 const mainStraight=s=>!runs.length||!inCorner(s)&&(wrapS(s,L)<wrapS(firstRun.from,L)||wrapS(s,L)>wrapS(lastRun.to,L));
 const far=(x,y,list,r)=>list.every(q=>Math.hypot(q.x-x,q.y-y)>=r),straight=s=>[-15,0,15].every(o=>Math.abs(bend(data,s+o))<1/300);
 const boards=brakeBoardSpots(data,{runs,bands:open,avoid:[...billboards.map(b=>({x:b.x,y:b.y,r:14})),...cams.map(c=>({...c,r:8})),...towers.map(t=>({x:t.x,y:t.y,r:10})),...marshals.map(m=>({x:m.x,y:m.y,r:6}))]});
 const poles=[],roamGaps=(data.meta.roam?.zones??[]).flatMap(z=>z.gaps);
 for(const side of [-1,1]){
  let last=-Infinity,k=0,gap=POLE_GAP;
  for(let s=side<0?2:2+POLE_GAP/2;s<L-2;s+=2){
   // Corner exits only behind a rail: an open run-off is where a car runs wide.
   if(s-last<gap||inCorner(s)||!(straight(s)||exiting(s,side)&&guardrailPresent(data,s,side)))continue;
   // Nor in the mouth of a side street opened to roam the city (meta.roam's gaps in the walls).
   if(roamGaps.some(g=>g.side===side&&s>g.s0-6&&s<g.s1+6))continue;
   // Behind a street circuit's concrete wall the poles stand back on the sidewalk, clear of the catch fence.
   const {p}=trackPoint(data,s),off=side*(p[4]/2+guardrailClearance(data,s,side)+(data.meta.barrier==='street'?2.2:POLE_BEHIND)+rand()*.6),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
   if(bandClearance(bands,x,y).distance<2.5||geo&&wallsNear(geo,x,y,1.5).length||pitBlocked(data,s,off))continue;
   if(!far(x,y,billboards,POLE_CLEAR)||!far(x,y,towers,POLE_CLEAR)||!far(x,y,marshals,POLE_CLEAR)||!far(x,y,cams,POLE_CLEAR)||!far(x,y,gantry,12)||!far(x,y,boards,8)||!far(x,y,poles,12))continue;
   last=s;gap=POLE_GAP*(.7+.6*rand());const main=mainStraight(s),n=k++,team=TEAMS[Math.floor(rand()*TEAMS.length)],roll=rand(),size=.85+.3*rand();
   // Mostly triangular pennants in the sponsors' colours; now and then Brazil's flag, a chequered,
   // striped or two-colour one. Poles of different heights, a little out of plumb.
   const pattern=roll<.09?PATTERN.brasil:roll<.16?PATTERN.chequer:roll<.23?PATTERN.stripes:roll<.29?PATTERN.halves:PATTERN.pennant,square=pattern!==PATTERN.pennant;
   poles.push(add('pennant',main&&n%2===0?2:3,x,y,null,{s,pole:3.9+1.2*rand(),radius:.034+.014*rand(),w:(square?1.6:1.95)*size,h:(square?1.05:.95)*size*(.9+.2*rand()),pattern,lean:.04,c1:pattern===PATTERN.chequer?0x111111:team[0],c2:pattern===PATTERN.chequer?0xf2f2f2:team[1]}));
  }
 }

 // Roof flags along the grandstands' front fascia (interlagos-stands.js), as many as it has columns
 // (interlagos-stands.js) but not one per column: a third of them bare, some poles in twos and
 // threes, one or two big Brazil flags, pennants and sponsors' flags on poles of every height.
 const blocks=standLayout(data),columns=[];
 blocks.forEach((b,j)=>{for(const a of j===blocks.length-1?[-13.4,-6.7,0,6.7,13.4]:[-13.4,-6.7,0,6.7])columns.push({b,a});});
 const roof=[];
 for(const c of columns){
  const r=rand();if(r<.36)continue;
  const n=r<.8?1:r<.93?2:3,step=1.2+.7*rand();
  for(let i=0;i<n;i++)roof.push({b:c.b,a:Math.max(-13.8,Math.min(13.8,c.a+(i-(n-1)/2)*step+(rand()-.5)*.9)),group:n});
 }
 // The same instance budget: extra poles come off at random, missing ones go up between columns.
 while(roof.length>columns.length)roof.splice(Math.floor(rand()*roof.length),1);
 while(roof.length<columns.length){const c=columns[Math.floor(rand()*columns.length)];roof.push({b:c.b,a:Math.max(-13.8,Math.min(13.8,c.a+(rand()<.5?-1:1)*(2.6+1.6*rand()))),group:1});}
 // The big flags fly from the loneliest poles, well spread along the row.
 const big=new Set(),order=[...roof].sort((u,v)=>u.b.s-v.b.s||u.a-v.a),lonely=t=>{const k=order.indexOf(t),gap=q=>q&&q.b===t.b?Math.abs(q.a-t.a):9;return Math.min(gap(order[k-1]),gap(order[k+1]));};
 const halves=blocks.length>=5?2:blocks.length?1:0;
 for(let k=0;k<halves;k++){const part=order.slice(Math.floor(k*order.length/halves),Math.floor((k+1)*order.length/halves)).filter(t=>t.group===1);if(part.length)big.add(part.reduce((u,v)=>lonely(v)>lonely(u)?v:u));}
 // Their neighbours make room for the big cloth.
 for(const g of big)for(const t of roof)if(t!==g&&t.b===g.b&&Math.abs(t.a-g.a)<2.8)t.a=Math.max(-13.8,Math.min(13.8,g.a+(t.a<g.a?-2.8:2.8)));
 roof.forEach((t,k)=>{
  const [x,y]=standPoint(t.b,t.a,t.b.roof.from+.06),team=TEAMS[Math.floor(rand()*TEAMS.length)],roll=rand(),size=.82+.36*rand(),tall=1+.4*(2*rand()-1);
  const o=big.has(t)?{pole:5.6+.8*rand(),radius:.065,w:3.3+.4*rand(),h:2.25+.2*rand(),pattern:PATTERN.brasil,lean:.012}
   // In a bunch they are smaller, triangular more often than not.
   :roll<(t.group>1?.5:.24)?{pole:3.25*tall,radius:.035,w:1.5*size,h:.78*size,pattern:PATTERN.pennant}
   :{pole:3.25*tall,radius:.04,w:1.55*size,h:1.02*size*(.92+.16*rand()),pattern:roll<.4?PATTERN.brasil:roll<.56?PATTERN.stripes:roll<.7?PATTERN.halves:roll<.84?PATTERN.diagonal:roll<.92?PATTERN.chequer:PATTERN.plain};
  // Médio flies about half of them, the big ones always.
  add('roof',big.has(t)||rand()<.5?2:3,x,y,roofHeight(t.b,t.b.roof.from)+.15,{s:t.b.s,lean:.03,c1:o.pattern===PATTERN.chequer?0x111111:team[0],c2:o.pattern===PATTERN.chequer?0xf2f2f2:team[1],...o});
 });
 // Small flags on the billboards' top corners (track-surface.js builds each board its own size), in
 // sponsors' colours, cut one of three ways. The pole is tall enough that the cloth hanging slack in a calm
 // (its own length straight down under its height) still clears the board's top.
 for(const b of billboards){
  const {p,side}=b,f=billboardFormat(data,b);probe.index=b.index;const ground=probe.sample(b.x,b.y).z,ry=Math.atan2(-p[7]*.8+p[8]*side*.6,p[8]*.8+p[7]*side*.6)+f.turn;
  for(const lx of [-(f.w/2+.1),f.w/2+.1]){const roll=rand(),team=TEAMS[Math.floor(rand()*TEAMS.length)],w=.9+.2*rand(),h=.62+.1*rand(),pole=h+1.05*w+.2+.35*rand();
   add('billboard',3,b.x+Math.cos(ry)*lx,b.y+Math.sin(ry)*lx,ground+f.top,{s:p[0],pole,radius:.03,w,h,pattern:roll<.45?PATTERN.halves:roll<.8?PATTERN.diagonal:PATTERN.stripes,c1:team[0],c2:team[1],lean:.03});}
 }
 // Flexible white-and-orange rods just past the kerb: at each corner's exit on the outside (Médio
 // up), and at its apex inside and turn-in outside.
 for(const r of runs.filter(r=>r.turn>.5))for(const [at,side,tier] of [[r.to+5,-r.sign,2],[r.apex,r.sign,3],[r.from-6,-r.sign,3]]){
  const s=wrapS(at,L),{p}=trackPoint(data,s),off=side*(p[4]/2+1.45),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
  if(bandClearance(open,x,y).distance<1.2||geo&&wallsNear(geo,x,y,1).length||pitBlocked(data,s,off)||!far(x,y,items.filter(t=>t.kind==='rod'),4))continue;
  // A hand-sized orange pennant on top makes the thin rod readable from the chase cameras.
  add('rod',tier,x,y,null,{s,pole:1.08+.25*rand(),radius:.028+.008*rand(),w:.34+.1*rand(),h:.2+.06*rand(),pattern:PATTERN.pennant,c1:0xff5a0a,c2:0xf4f4f0,lean:.06});
 }

 // No cloth and no pole ever sweeps through a board (billboards where they finally stand, the brake boards): a flag
 // whose every reachable state (flagSweep) could enter one is left out.
 // (only flags within a cloth's length of a box are swept: the rest of the lap costs nothing at load)
 const boxes=boardBoxes(data,billboards,boards),close=t=>boxes.filter(b=>Math.hypot(t.x-b.x,t.y-b.y)<(b.r??b.hu+Math.max(-b.v0,b.v1))+t.w*1.6+t.pole+.5);
 const swept=items.filter(t=>{const near=close(t);if(!near.length)return true;const sweep=flagSweep(t);return !near.some(b=>sweepHits(t,sweep,b));}),rejected=items.length-swept.length;
 // Instance order: by tier, each tier spread round the lap so a capped count still covers it.
 const ordered=[];
 for(let tier=0;tier<=3;tier++)ordered.push(...swept.filter(t=>t.tier===tier).sort((u,v)=>u.s-v.s).map((t,k)=>[spread(k),t]).sort((u,v)=>u[0]-v[0]).map(([,t])=>t));
 const counts={};
 for(const level of TIER_NAMES){const q=FLAG_LEVELS[level];counts[level]=Math.min(q.cap,ordered.filter(t=>t.tier<=q.tier).length);}
 ordered.forEach((t,index)=>{t.index=index;targets.push({s:t.s,d:t.d,kind:t.kind,index,up:t.up});});
 for(const b of boards)targets.push({s:b.s,d:b.d,kind:'board',index:-1,up:0});
 return {length:L,items:ordered,counts,boards,targets:targets.sort((u,v)=>u.s-v.s),runs,boxes,rejected};
}

// The cars' wake on the cloth: when a car (player or rival, from its TestCar surface.s/.d) goes by a
// flag close enough, the flag's pass slot gets [time, strength, direction x, z] and its wave phase
// is carried over so the cloth never jumps. A rod the car runs over is flattened along its path.
// Time only moves with dt (paused: frozen); laps wrap; a jump over 40 m (reset, teleport) is skipped.
// Rods stay flat under the car ROD_HOLD s, then whip back and wobble at ROD_FREQ rad/s.
const GUST_DECAY=1.1,GUST_RISE=18,ROD_HOLD=.2,ROD_DECAY=2,ROD_FREQ=7,GUST_WAVE=22,glsl=x=>Number.isInteger(x)?x+'.0':String(x);
export const flagGust=age=>age<0||age>6?0:(1-Math.exp(-age*GUST_RISE))*Math.exp(-age*GUST_DECAY);
const gustPhase=age=>age<=0?0:(1-Math.exp(-GUST_DECAY*age))/GUST_DECAY-(1-Math.exp(-(GUST_DECAY+GUST_RISE)*age))/(GUST_DECAY+GUST_RISE);
export class FlagGusts{
 constructor(length,targets,pass,phase){
  this.length=length;this.all=targets;this.pass=pass;this.phase=phase;this.time=0;this.seen=new WeakMap();this.changed=[];this.events=[];
  this.stats={passes:0,playerPasses:0,knocks:0,whooshes:0,skipped:0,last:null,time:0};this.whoosh=true;this.setCount(Infinity);
 }
 // Only the instances drawn at this level take gusts; boards and gantry posts always whoosh.
 setCount(count){this.list=this.all.filter(t=>t.index<count).sort((a,b)=>a.s-b.s);this.ss=Float64Array.from(this.list,t=>t.s);}
 // eye {x, y} (track data metres) and range: rivals farther than that from the camera only stir flags
 // past their reach, which fly still there, so they are not even looked up (the player always is).
 step(dt,player,rivals=[],eye=null,range=Infinity){
  this.time+=dt;this.changed.length=0;this.events.length=0;
  if(dt>0){this.car(player,true);for(const r of rivals){const c=r?.car??r;this.car(c,false,!!eye&&Number.isFinite(c?.x)&&(c.x-eye.x)**2+(c.y-eye.y)**2>range*range);}}
  return this.changed;
 }
 car(c,player,far=false){
  const surface=c?.surface;if(!surface||!Number.isFinite(surface.s))return;
  const seen=this.seen.get(c);if(!seen){this.seen.set(c,{s:surface.s});return;}
  const L=this.length,was=seen.s,now=surface.s,ds=rel(now,was,L);seen.s=now;
  if(far){this.stats.skipped++;return;}
  if(!ds||Math.abs(ds)>40)return;
  const speed=Math.hypot(c.vx,c.vy);if(!(speed>3))return;
  const sign=Math.sign(ds),lead=Math.min(14,speed*.22),lo=sign>0?was-1:now-16,span=Math.abs(ds)+17;
  const crossed=(t,ahead)=>sign*rel(t.s,was,L)>ahead&&sign*rel(t.s,now,L)<=ahead;
  const n=this.list.length;if(!n)return;
  let i=this.lower(wrapS(lo,L));
  for(let k=0;k<n;k++,i=(i+1)%n){
   const t=this.list[i];if(wrapS(t.s-lo,L)>span)break;
   const lateral=Math.abs(surface.d-t.d);
   if(t.kind==='rod'){
    // The front bumper reaches it 2.2 m ahead of the car's centre; a near miss only shakes it.
    if(crossed(t,2.2)){if(lateral<1.3)this.write(t,c,1+Math.min(.4,speed/60),speed,player,true);else if(lateral<4.5&&speed>12)this.write(t,c,.3*Math.min(1,speed/45)*(1-(lateral-1.3)/3.2),speed,player);}
   }else if(t.index>=0&&crossed(t,lead)){
    // The air pushed ahead of the car reaches the flag a moment before it does. Game feel over
    // physics: a pole behind the rail still whips when a car flies by; high cloth stays in the breeze.
    const dist=Math.hypot(lateral,Math.max(0,t.up-1.5)*2.5),near=Math.max(0,Math.min(1,1-(dist-4)/22));
    this.write(t,c,Math.min(1.3,Math.max(0,(speed-6)/40))*near**1.3,speed,player,false,(Math.sign(t.d-surface.d)||1)*sign);
   }
   // Something tall flicking past the driver's window.
   if(player&&this.whoosh&&lateral<6.5&&speed>25&&crossed(t,speed*.03)){
    this.stats.whooshes++;this.events.push({pan:-sign*Math.max(-1,Math.min(1,(t.d-surface.d)/3))*.85,strength:Math.max(.3,Math.min(1.2,(speed-18)/35))*(1-lateral/9),kind:t.kind});
   }
  }
 }
 // side: +1 when the flag stands on the car's left (of its own heading), -1 on its right; 0 for rods.
 write(t,c,strength,speed,player,knock=false,side=0){
  const i=t.index*4,p=this.pass,age=this.time-p[i],rod=t.kind==='rod';
  const now=p[i+1]*(rod?(age<0||age>5?0:Math.exp(-Math.max(0,age-ROD_HOLD)*ROD_DECAY)):flagGust(age));
  if(strength<.04||!knock&&strength<now*.8)return false;
  // Wrapped by 20π, a whole period of every wave the shader runs (wave, .3 and 1.8 times it).
  if(this.phase)this.phase[t.index*4+3]=(this.phase[t.index*4+3]+GUST_WAVE*p[i+1]*gustPhase(age))%(20*Math.PI);
  // three.js xz. A rod folds along the car's path; cloth is thrown out from the path and along it,
  // so the cameras behind the car see it broadside.
  const fx=c.vx/speed,fz=-c.vy/speed,along=side?.6:1,out=side*.8;
  p[i]=this.time;p[i+1]=strength;p[i+2]=fx*along+fz*out;p[i+3]=fz*along-fx*out;this.changed.push(t.index);
  this.stats.passes++;if(player)this.stats.playerPasses++;if(knock)this.stats.knocks++;
  this.stats.last={kind:t.kind,index:t.index,strength:+strength.toFixed(3),player,time:+this.time.toFixed(3)};return true;
 }
 lower(s){const a=this.ss;let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<s)lo=m+1;else hi=m;}return lo%a.length;}
}

// --- Drawing. One instance = a pole (or rod) and its cloth: the cloth a grid (u out from the pole,
// v down from its top), the pole a six-sided tube, both moved in the vertex shader. Instances sit
// at their pole's base (a marshal's flag at its stand's top) with no turn or scale.
function flagGeometry(sx,sy,shared){
 const pos=[],part=[],index=[];
 for(let j=0;j<=sy;j++)for(let i=0;i<=sx;i++){pos.push(i/sx,j/sy,0);part.push(0);}
 for(let j=0;j<sy;j++)for(let i=0;i<sx;i++){const a=j*(sx+1)+i,b=a+1,c=a+sx+1,d=c+1;index.push(a,c,b,b,c,d);}
 const base=pos.length/3,SIDES=6,RINGS=6;
 for(let r=0;r<=RINGS;r++)for(let k=0;k<SIDES;k++){const a=k/SIDES*Math.PI*2;pos.push(Math.cos(a),r/RINGS,Math.sin(a));part.push(1);}
 for(let r=0;r<RINGS;r++)for(let k=0;k<SIDES;k++){const a=base+r*SIDES+k,b=base+r*SIDES+(k+1)%SIDES,c=a+SIDES,d=b+SIDES;index.push(a,c,b,b,c,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((v,i)=>i%3===1?1:0),3));
 g.setAttribute('aPart',new THREE.Float32BufferAttribute(part,1));g.setIndex(index);
 for(const [name,attribute] of Object.entries(shared))g.setAttribute(name,attribute);
 g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e5);return g;
}

const VERTEX_HEAD=`
uniform float flagTime,flagReach,flagStill,flagBreeze,flagPixel;
uniform vec2 flagWind;
uniform vec3 flagEye;
attribute vec4 aShape,aLook,aPass;
attribute vec3 aTint,aTint2;
attribute float aPart;
varying vec2 vFlagUv;
varying vec3 vFlagKind,vFlagTint,vFlagTint2;
varying vec2 vFlagMat;
float flagGust(float age){return age<0.0||age>6.0?0.0:(1.0-exp(-age*${glsl(GUST_RISE)}))*exp(-age*${glsl(GUST_DECAY)});}
// A flexible rod lies flat under the car for a moment, then springs back and wobbles.
float rodBend(float age){if(age<0.0||age>5.0)return 0.0;float t=max(age-${glsl(ROD_HOLD)},0.0);return exp(-t*${glsl(ROD_DECAY)})*cos(t*${glsl(ROD_FREQ)});}
// The point t (0 base, 1 tip) of a rod of length H bent over along D as a curve of constant bend, theta at the tip.
vec3 rodCurve(vec3 D,float H,float theta,float t){return abs(theta)<1e-3?vec3(0.0,H*t,0.0):D*(H*(1.0-cos(theta*t))/theta)+vec3(0.0,H*sin(theta*t)/theta,0.0);}
vec2 flagTurn(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
// Cloth point, u out from the pole and v down from the top. lift 0 hangs, 1 flies straight out; in
// a light breeze the free end droops; a wave runs out along it, faster in a car's wake.
vec3 flagCloth(float u,float v,vec2 dir,float lift,float droop,float amp,float wave,vec2 size,float taper){
 float a0=lift*1.5707963,k=max(a0*droop,1e-3);
 float along=size.x*(cos(a0*(1.0-droop*u))-cos(a0))/k,down=size.x*(sin(a0)-sin(a0*(1.0-droop*u)))/k;
 float ripple=amp*size.x*pow(u,1.15)*(sin(7.0*u-wave+v*1.4)+.35*sin(17.0*u-wave*1.8-v*2.3));
 float y=-size.y*(.5+(v-.5)*(1.0-taper*u))-down+.25*ripple*sin(3.0*u+wave*.3);
 return vec3(dir.x*along,y,dir.y*along)+vec3(-dir.y,0.0,dir.x)*ripple;
}`;
const vertexBody=normals=>`
 float flagAge=flagTime-aPass.x;
 vec3 flagRoot=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
 float flagDist=length(flagRoot-flagEye);
 vec3 flagP=vec3(0.0),flagN=vec3(0.0,1.0,0.0);
 // aLook: rest heading (still flags), the flag's own phase, kind*8+pattern, wave phase (kept by FlagGusts).
 float flagKind=floor(aLook.z/8.0),flagPattern=aLook.z-flagKind*8.0;
 bool flagRod=flagKind>.5;
 // Past its reach a flag stops rippling and its thin pole thins away, the cloth keeping its size (a
 // still flag reads the same that far off); only when it is two pixels wide does it shrink away
 // (flagPixel: the angle of a screen pixel, so a phone's coarser pixels let them go sooner).
 float flagFar=flagReach*clamp(.45+.6*max(aShape.x,aShape.z*.25),.55,1.7),flagCalm=1.0-smoothstep(flagFar*.75,flagFar,flagDist);
 float flagSpan=max(aShape.x,aShape.z*.35),flagSize=1.0-smoothstep(flagSpan/(flagPixel*2.0),flagSpan/(flagPixel*1.2),flagDist);
 // Outside this pass's view (main, mirror, reflection, shadow) the instance is skipped whole: its
 // pole's middle, with the cloth's reach round it, against the frustum in clip space.
 vec4 flagClip=projectionMatrix*viewMatrix*vec4(flagRoot+vec3(0.0,aShape.z*.5,0.0),1.0);
 float flagBall=aShape.z*.5+aShape.x+.3,flagSlope=abs(projectionMatrix[2][3]);
 bool flagShown=flagSize>0.0&&flagClip.w>-flagBall&&abs(flagClip.x)-flagClip.w<flagBall*(length(vec2(projectionMatrix[0][0],projectionMatrix[2][0]))+flagSlope)
  &&abs(flagClip.y)-flagClip.w<flagBall*(length(vec2(projectionMatrix[1][1],projectionMatrix[2][1]))+flagSlope);
 ${normals?'':`// High flags (roof, billboards, gantry: radius stored negative) cast no shadow: under a real sun a
 // thin pole that far up leaves none, a sharp shadow map only a razor bar across the road.
 if(aShape.w<0.0)flagShown=false;`}
 if(!flagShown){}
 else if(aPart<.5){
  float g=(flagRod?min(aPass.y,1.0)*.7:aPass.y)*flagGust(flagAge)*flagCalm,still=flagStill,t=flagTime,gA=max(flagAge,0.0);
  // Lighter cloth (per flag) flutters faster and wider; heavier cloth, and big flags, hang lower.
  float light=fract(aLook.y*1.618),heavy=fract(aLook.y*2.731+.37);
  vec2 wind=flagTurn(flagWind,.32*sin(t*.41+aLook.y)+.12*sin(t*1.7+aLook.y*3.1));
  vec2 dir=mix(wind,aPass.zw,clamp(g*1.3,0.0,.92));dir=dot(dir,dir)>1e-4?normalize(dir):aPass.zw;
  // The wake's whip: the cloth swings past the car's line and back, dying out within a second or two.
  float whip=flagRod||flagAge<0.0||flagAge>6.0?0.0:aPass.y*.6*exp(-gA*1.7)*sin(gA*8.5+aLook.y)*flagCalm;
  dir=normalize(mix(flagTurn(dir,whip),vec2(cos(aLook.x),sin(aLook.x)),still));
  // Gusts sweep along a row of flags, and each flag answers them its own way.
  float breeze=.2*sin(dot(flagRoot.xz,flagWind)*.05-t*.9)+.12*sin(t*(1.1+.7*light)+aLook.y*2.3)+.06*sin(t*2.9+aLook.y*5.1);
  float lift=mix(clamp(flagBreeze*(.8+breeze)*mix(1.3,.55,heavy)*clamp(1.32-.2*aShape.x,.62,1.15)+g*1.1,.1,1.0),1.0,still);
  float droop=(1.0-lift)*mix(.3,.7,heavy)*(1.0-still)+.02;
  float amp=((.05+.07*lift)+.2*g)*(.85+.3*light)*(1.0-still)*(1.0-.45*smoothstep(30.0,140.0,flagDist))*flagCalm;
  float G=aPass.y*((1.0-exp(-${glsl(GUST_DECAY)}*gA))/${glsl(GUST_DECAY)}-(1.0-exp(-${glsl(GUST_DECAY+GUST_RISE)}*gA))/${glsl(GUST_DECAY+GUST_RISE)});
  float wave=(6.3+1.6/max(aShape.x,.3)+1.5*light)*t+aLook.w+${glsl(GUST_WAVE)}*G;
  float taper=abs(flagPattern-5.0)<.5?.92:0.0;
  // A rod's little flag rides its tip as the rod folds under a car and springs back.
  vec3 top=flagRod?rodCurve(vec3(aPass.z,0.0,aPass.w),aShape.z,clamp(aPass.y*rodBend(flagAge)*flagCalm,-1.1,1.1)*1.4,1.0):vec3(0.0,aShape.z,0.0);
  vec3 c0=flagCloth(position.x,position.y,dir,lift,droop,amp,wave,aShape.xy,taper);
  flagP=top+c0;
  ${normals?`vec3 cu=flagCloth(position.x+.04,position.y,dir,lift,droop,amp,wave,aShape.xy,taper),cv=flagCloth(position.x,position.y+.04,dir,lift,droop,amp,wave,aShape.xy,taper),fn=cross(cu-c0,c0-cv);
  flagN=dot(fn,fn)>1e-12?normalize(fn):vec3(0.0,1.0,0.0);`:''}
 }else{
  // The pole, or a rod bent over along the car's path as a curve of constant bend.
  float t=position.y,H=aShape.z,theta=flagRod?clamp(aPass.y*rodBend(flagAge)*flagCalm,-1.1,1.1)*1.4:0.0;
  vec3 D=vec3(aPass.z,0.0,aPass.w),o=vec3(position.x,0.0,position.z),up=vec3(0.0,1.0,0.0),c=rodCurve(D,H,theta,t);
  float od=dot(o,D);vec3 ring=o-D*od+(D*cos(theta*t)-up*sin(theta*t))*od;
  flagP=c+ring*abs(aShape.w)*(flagRod?1.0-.45*t:1.0)*(1.0-smoothstep(flagFar*.8,flagFar,flagDist));flagN=ring;${normals?'':`
  // A pole 4-5 cm thick leaves only a faint penumbra on the road, never the hard bar a shadow map draws:
  // the cloth casts, the pole does not (a rod, short and by the kerb, does).
  if(!flagRod)flagP=vec3(0.0);`}
 }
 flagP*=flagSize;
 vFlagUv=aPart<.5?position.xy:vec2(-1.0,position.y);vFlagKind=vec3(aPart,flagPattern,flagKind);vFlagTint=aTint;vFlagTint2=aTint2;
 vFlagMat=aPart<.5?vec2(.82,0.0):flagRod?vec2(.45,0.0):vec2(.36,.55);`;
const FRAGMENT_HEAD=`
uniform float flagDetail;
varying vec2 vFlagUv;
varying vec3 vFlagKind,vFlagTint,vFlagTint2;
varying vec2 vFlagMat;
// The cloth's design from its uv (u out from the pole, v down): sponsors' fields, chequers, Brazil.
vec3 flagPaint(vec2 uv,float pattern,vec3 a,vec3 b){
 if(pattern<.5)return a;
 if(pattern<1.5){vec2 q=uv*mix(vec2(3.0,2.0),vec2(6.0,4.0),flagDetail);float c=mod(floor(q.x)+floor(q.y),2.0),blur=clamp(max(fwidth(q.x),fwidth(q.y))*1.4-.4,0.0,1.0);return mix(mix(a,b,c),(a+b)*.5,blur);}
 if(pattern<2.5){vec2 p=uv-.5;if(dot(p/vec2(.175,.25),p/vec2(.175,.25))<1.0)return vec3(.003,.02,.18);return abs(p.x)/.415+abs(p.y)/.38<1.0?vec3(1.0,.74,0.0):vec3(0.0,.33,.045);}
 if(pattern<3.5)return abs(uv.y-.5)<.17?b:a;
 if(pattern<4.5)return uv.x+uv.y<1.0?a:b;
 if(pattern<5.5)return uv.x<.16?b:a;
 return uv.x<.5?a:b;
}`;
// Rods and poles have their own key so the depth copy below shares the deformation.
function clothMaterial(uniforms){
 const material=new THREE.MeshStandardMaterial({name:'Bandeiras_e_varetas',roughness:.82,metalness:0,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>'+VERTEX_HEAD)
   .replace('#include <beginnormal_vertex>',vertexBody(true)+'\n vec3 objectNormal=flagN;\n#ifdef USE_TANGENT\n vec3 objectTangent=vec3(1.0,0.0,0.0);\n#endif')
   .replace('#include <begin_vertex>','vec3 transformed=flagP;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>'+FRAGMENT_HEAD)
   .replace('#include <color_fragment>',`#include <color_fragment>
 diffuseColor.rgb=vFlagKind.x<.5?flagPaint(vFlagUv,vFlagKind.y,vFlagTint,vFlagTint2):vFlagKind.z>.5?(mod(floor(vFlagUv.y*6.0),2.0)<.5?vFlagTint:vFlagTint2):vec3(.55,.56,.57);`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=vFlagMat.x;')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=vFlagMat.y;')
   // Thin cloth: sun on its far side shows through, and looking toward the sun through it the weave glows in its own
   // colour (forward scatter, whatever way the cloth faces): a backlit flag is a lit colour, not a black rag. The
   // sun's light is the weather's (dim at dusk, the moon's at night), so it never glows in the dark.
   .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
 if(vFlagKind.x<.5){vec3 flagSun=directionalLights[0].color,flagTo=directionalLights[0].direction;float flagInto=max(dot(-geometryViewDir,flagTo),0.0);
  reflectedLight.directDiffuse+=diffuseColor.rgb*flagSun*(max(-dot(normal,flagTo),0.0)*.3+.35*flagInto*flagInto*flagInto);}
#endif`);
 };
 material.customProgramCacheKey=()=>'trackside-flags-v3';return material;
}
function depthMaterial(uniforms){
 const material=new THREE.MeshDepthMaterial({side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>'+VERTEX_HEAD).replace('#include <begin_vertex>',vertexBody(false)+'\n vec3 transformed=flagP;');
 };
 material.customProgramCacheKey=()=>'trackside-flags-depth-v2';return material;
}

// The brake boards: white boards with black numbers on two legs, facing the approaching cars and
// turned a little toward the track; one merged mesh and a small canvas atlas. Each has stood there a
// different while: a few degrees out of true, its white gone grey or dusty by its own amount.
function brakeBoardMesh(boards){
 const cells=['300','200','100'],atlas=canvasTexture((ctx,w,h)=>{
  const cw=w/2,ch=h/2;
  cells.forEach((text,k)=>{const x=(k%2)*cw,y=Math.floor(k/2)*ch;ctx.fillStyle='#111';ctx.fillRect(x,y,cw,ch);ctx.fillStyle='#f4f4f0';ctx.fillRect(x+cw*.05,y+ch*.07,cw*.9,ch*.86);
   ctx.fillStyle='#101010';ctx.font=`900 ${Math.round(ch*.62)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x+cw/2,y+ch*.53,cw*.84);});
  ctx.fillStyle='#5d6266';ctx.fillRect(cw,ch,cw,ch);
 },768,512);
 const cell=k=>[(k%2)/2,1-(Math.floor(k/2)+1)/2],parts=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0),one=new THREE.Vector3(1,1,1);
 const box=(w,h,d,x,y,face,z=0)=>{const g=new THREE.BoxGeometry(w,h,d).translate(x,y,z),uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){const [u0,v0]=cell(i>=16&&i<20?face:3),[u,v]=[uv.getX(i),uv.getY(i)];uv.setXY(i,u0+.004+u*.492,v0+.004+v*.492);}return g;};
 let seed=97;const rand=()=>(seed=seed*16807%2147483647)/2147483647,dust=new THREE.Color(0xc9b896),tint=new THREE.Color(),euler=new THREE.Euler(0,0,0,'YXZ');
 for(const b of boards){
  const {p,side}=b,tx=p[7],tz=-p[8],lx=p[9],lz=-p[10],fx=-tx*.966-side*lx*.259,fz=-tz*.966-side*lz*.259;
  m.compose(new THREE.Vector3(b.x,b.z,-b.y),q.setFromEuler(euler.set((rand()-.5)*.06,Math.atan2(fx,fz)+(rand()-.5)*.1,(rand()-.5)*.05)),one);
  const face=cells.indexOf(String(b.metres)),wear=rand();tint.setRGB(1,1,1).lerp(dust,wear*.35).multiplyScalar(1-wear*.14);
  // The posts stand behind the board (centred in it, thicker than the board, they came through the number).
  for(const g of [box(1.3,.92,.06,0,1.2,face),box(.07,1.55,.07,-.45,.775,3,-.07),box(.07,1.55,.07,.45,.775,3,-.07)]){
   const n=g.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++)rgb.set([tint.r,tint.g,tint.b],i*3);
   g.setAttribute('color',new THREE.BufferAttribute(rgb,3));parts.push(g.applyMatrix4(m));
  }
 }
 const geometry=parts.length?mergeGeometries(parts,false):new THREE.BufferGeometry();parts.forEach(g=>g.dispose());
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({name:'Placas_frenagem',map:atlas,roughness:.55,vertexColors:true}));
 mesh.name='Placas_de_frenagem';mesh.castShadow=mesh.receiveShadow=true;mesh.visible=boards.length>0;return mesh;
}

// The field of the circuit loaded last, for the checks (verificar_bandeiras.py) and the F3 overlay.
let live=null;
export const liveFlagField=()=>live;
// The flags, rods and boards of a circuit. update(dt, camera, player, rivals) each frame (dt 0 when
// paused); setQuality(speedEffects level) live: instance count, cloth detail, reach and shadows,
// never a new program. onWhoosh({pan, strength}) when the player (the car heard) passes something tall at
// speed; never with Sensação de velocidade off.
export function createFlagField(data,{level='completa',onWhoosh=null}={}){
 const plan=flagPlan(data),items=plan.items,n=Math.max(1,items.length),root=new THREE.Group();root.name='Bandeiras_varetas_e_placas';
 const attribute=size=>new THREE.InstancedBufferAttribute(new Float32Array(n*size),size);
 const shape=attribute(4),look=attribute(4),tint=attribute(3),tint2=attribute(3),pass=attribute(4),color=new THREE.Color(),faded=new THREE.Color(0xd9d0bc);
 look.setUsage(THREE.DynamicDrawUsage);pass.setUsage(THREE.DynamicDrawUsage);
 // Sun and rain bleach the cloth toward a dusty cream and dull it, each flag by its own wear.
 const cloth=(hex,wear)=>color.setHex(hex).lerp(faded,wear*.24).multiplyScalar(1-wear*.12);
 items.forEach((t,i)=>{
  shape.setXYZW(i,t.w,t.h,t.pole,flagShadowless(t)?-t.radius:t.radius);look.setXYZW(i,t.rest,t.phase,KIND[t.kind==='rod'?'rod':'flag']*8+t.pattern,t.phase);
  cloth(t.c1,t.wear);tint.setXYZ(i,color.r,color.g,color.b);cloth(t.c2,t.wear);tint2.setXYZ(i,color.r,color.g,color.b);pass.setXYZW(i,-100,0,1,0);
 });
 const shared={aShape:shape,aLook:look,aTint:tint,aTint2:tint2,aPass:pass},coarse=flagGeometry(6,2,shared),fine=flagGeometry(12,4,shared);
 const uniforms={flagTime:{value:0},flagReach:{value:200},flagStill:{value:0},flagDetail:{value:1},flagBreeze:{value:.55},flagWind:{value:new THREE.Vector2(...FLAG_WIND).normalize()},flagEye:{value:new THREE.Vector3()},flagPixel:{value:.0011}};
 const mesh=new THREE.InstancedMesh(coarse,clothMaterial(uniforms),n);mesh.name='Bandeiras_tremulantes';mesh.frustumCulled=false;mesh.customDepthMaterial=depthMaterial(uniforms);
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),at=new THREE.Vector3(),one=new THREE.Vector3(1,1,1);
 items.forEach((t,i)=>mesh.setMatrixAt(i,m.compose(at.set(t.x,t.z,-t.y),q.setFromEuler(e.set(t.tilt[0],0,t.tilt[1])),one)));root.add(mesh);
 // Never drawn: they hand the shadow program to the load-time compile (main.js), so turning shadows
 // or Completa on later does not stall a frame building it, and keep both cloths in the scene for
 // clearCircuit to free.
 for(const g of [coarse,fine]){const keep=new THREE.InstancedMesh(g,mesh.customDepthMaterial,1);keep.visible=false;keep.name='Bandeiras_sombra_compilar';root.add(keep);}
 const probe=new TestCar(data),boards=plan.boards.map(b=>{probe.index=trackPoint(data,b.s).i;return {...b,z:probe.sample(b.x,b.y).z-.04};});
 root.add(brakeBoardMesh(boards));
 const gusts=new FlagGusts(plan.length,plan.targets,pass.array,look.array);
 const count=kind=>items.filter(t=>t.kind===kind).length;
 const stats=Object.assign(gusts.stats,{level:null,drawn:0,rods:0,boards:boards.length,perLevel:{...plan.counts},
  kinds:{marshal:count('marshal'),start:count('start'),pennant:count('pennant'),roof:count('roof'),billboard:count('billboard'),rod:count('rod')},shadowless:items.filter(flagShadowless).length});
 const field={root,mesh,stats,uniforms,gusts,
  // Trees and verge grass give way to the poles, rods and boards standing on the ground: those drawn at the
  // level the circuit loads with (a level raised later may stand a pole in thin grass; the next load clears it).
  clearings:[...items.slice(0,plan.counts[FLAG_LEVELS[level]?level:'completa']).filter(t=>['pennant','rod'].includes(t.kind)).map(t=>({x:t.x,y:t.y,r:t.kind==='rod'?.6:1.2})),...boards.map(b=>({x:b.x,y:b.y,r:1.6}))],
  setQuality(value){
   const q=FLAG_LEVELS[value]?value:'completa',profile=FLAG_LEVELS[q],drawn=plan.counts[q];
   mesh.count=drawn;mesh.visible=drawn>0;mesh.geometry=profile.fine?fine:coarse;mesh.castShadow=profile.shadow;
   Object.assign(uniforms.flagReach,{value:profile.reach});uniforms.flagStill.value=profile.still?1:0;uniforms.flagDetail.value=profile.detail;
   gusts.setCount(profile.still?0:drawn);gusts.whoosh=!profile.still;range=profile.reach*1.3+40;
   Object.assign(stats,{level:q,drawn,rods:items.slice(0,drawn).filter(t=>t.kind==='rod').length});
  },
  update(dt,camera,player,rivals){
   if(camera){uniforms.flagEye.value.copy(camera.position);eye.x=camera.position.x;eye.y=-camera.position.z;
    if(camera.isPerspectiveCamera)uniforms.flagPixel.value=2*Math.tan(camera.fov*Math.PI/360)/Math.max(240,globalThis.innerHeight??1080);}
   if(!mesh.visible)return;
   const t0=performance.now(),changed=gusts.step(dt,player,rivals,camera?eye:null,range);uniforms.flagTime.value=stats.time=gusts.time;
   // Many slots in one frame (a pack through the flags) go up as one range.
   if(changed.length>6){const lo=Math.min(...changed),hi=Math.max(...changed);pass.addUpdateRange(lo*4,(hi-lo+1)*4);look.addUpdateRange(lo*4,(hi-lo+1)*4);pass.needsUpdate=look.needsUpdate=true;}
   else if(changed.length){for(const i of changed){pass.addUpdateRange(i*4,4);look.addUpdateRange(i*4,4);}pass.needsUpdate=look.needsUpdate=true;}
   if(onWhoosh)for(const e of gusts.events)onWhoosh(e);
   // CPU spent here, smoothed (verificar_bandeiras, the F3 overlay's budget).
   stats.cpuMs=stats.cpuMs*.95+(performance.now()-t0)*.05;
  }};
 let range=Infinity;const eye={x:0,y:0};stats.cpuMs=0;
 field.setQuality(level);live=field;
 return field;
}
