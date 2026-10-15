import * as THREE from 'three';
import {sceneryBands,bandClearance} from './track-clearance.js';
import {canvasTexture} from './pit-textures.js';
import {Shape,cityCarTemplate,CITY_CAR_SIZE,carPaint,rimColor,random,lin,FINISH,GLOW,ROLE} from './city-cars.js';
import {raceTrafficBlocks} from './city-race.js';
import {roamZoneAt} from './physics.js';

// The city keeps moving round the race (Floripa, data.scenery.city): a real city closed for a race weekend still has its
// traffic on the streets that stay open, and that is what makes it read as alive. The streets of the data (OpenStreetMap
// ways, gerar_cidade_floripa.py) are cut where the race closes them: near the walls' corridor, at the closures and along
// the queues street-closures.js holds behind them; the rest becomes lanes (the real curbs from the city map, the parking
// strips along them kept free, one-way streets in their way's order, everyone on the right), joined where streets meet or
// cross, with short curves for the turns. Pieces that lead nowhere are pruned, so nobody drives into a closed street: a
// car heading for one turns off at the last corner before it. And above all the Ponte Pedro Ivo Campos, the twin of the
// Colombo Salles the race runs on: four lanes continent -> island at deck height (one way, as in reality), fed by the Via
// Expressa, so the player crossing the bay sees the normal traffic rolling the other way on the next bridge.
// Each vehicle (city-cars.js models: hatches, SUVs, sedans, pickups, vans, buses, motoboys) keeps its distance from the one
// ahead (an intelligent-driver model), slows for bends, turns, merges and crossings (who is on the bigger street goes
// first; the lights blink amber for the event, so everyone slows there and some stop for a moment), buses stop at the bus
// stops; brake lamps light when they slow, headlamps and tail lamps at night, some cars with their daytime lamps on.
// A car that leaves the map, or gets stuck, comes back somewhere out of the camera's sight (far, or behind it).
// Drawing: the poses go to a float texture every frame; one merged geometry holds a pool of full models (assigned to the
// nearest vehicles of each type) and the boats, one the box versions of every vehicle, both placed by the vertex shader;
// after dark a point of light for each lamp pair. A few boats cross the bay on long loops with their wakes (sea-water.js
// has the anchored ones). Four draw calls at most for the whole traffic, whatever the camera sees.

// Street classes: [desired speed m/s, rank (who has the way)]; others (service lanes, footways) carry no traffic.
const ROADS={motorway:[22,7],motorway_link:[15,6.5],trunk:[19,6],trunk_link:[13,5.5],primary:[14,5],primary_link:[11,4.5],secondary:[12.5,4],secondary_link:[10,3.5],
 tertiary:[11,3],tertiary_link:[9,2.5],residential:[8.5,2],living_street:[5,1],busway:[12,2]};
const D_CORR=7,JOIN=5,STEP=2,LANE_W=2.8,PARK_W=2.35,CURB=.35;
// Driving: acceleration, comfortable and hard braking, lateral acceleration in bends (m/s²); distance kept standing (m) and
// time gap (s) to the car ahead.
const A_MAX=1.7,B_COMF=2.4,B_MAX=7,LAT=2.3,GAP0=2.3,HEADWAY=1.25;
// What drives on a Brazilian street (the moto a delivery motoboy); buses apart.
const MIX=[['hatch',.23],['suv',.18],['sedan',.15],['small',.11],['compact',.07],['pickup',.07],['van',.05],['moto',.14]];
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
const smooth=t=>t*t*(3-2*t);

// ---------- The network: lanes (tracks), their junctions (exits through short connector curves) and conflict zones ----------
export function buildTrafficNetwork(data,{map=null,ground}){
 const city=data.scenery.city,a=data.samples,N=a.length,roam=!!data.meta.roam?.zones?.length,stats={ways:0,runs:0,tracks:0,connectors:0,zones:0,signalZones:0,laneKm:0,dead:0,busStops:0,twinLanes:0};
 const roadD=map?(x,y)=>map.distance('road',x,y):null;
 // The walls' corridor (asphalt, wall gap, block and a metre), as street-closures.js measures it.
 const CELL=24,grid=new Map(),cellKey=(x,y,c)=>Math.floor(x/c)+','+Math.floor(y/c);
 a.forEach((p,i)=>{const k=cellKey(p[1],p[2],CELL);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
 const corridor=(x,y)=>{let best=Infinity;const cx=Math.floor(x/CELL),cy=Math.floor(y/CELL);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const k of grid.get((cx+i)+','+(cy+j))??[]){
   const p=a[k],q=a[(k+1)%N],dx=q[1]-p[1],dy=q[2]-p[2],l2=dx*dx+dy*dy||1e-9;let u=((x-p[1])*dx+(y-p[2])*dy)/l2;u=u<0?0:u>1?1:u;
   const px=p[1]+dx*u,py=p[2]+dy*u,lat=(x-px)*p[9]+(y-py)*p[10],half=(p[4]+(q[4]-p[4])*u)/2+(lat>0?p[16]:p[15])+1.75;best=Math.min(best,Math.hypot(x-px,y-py)-half);}
  return best;};
 const lapPts=a.filter((p,i)=>i%4===0),lapDistance=(x,y)=>{let b=Infinity;for(const p of lapPts)b=Math.min(b,(p[1]-x)**2+(p[2]-y)**2);return Math.sqrt(b);};
 const bands=sceneryBands(data).filter(b=>['pit_lane','boxes','arquibancada'].includes(b.name));
 // ---- What the race closes: a disc round each closure line, and a band along the queue behind it (the queue follows its
 // street out from the line, up to eight cars a lane: street-closures.js streetPath); a lane running into the band stops
 // short of it ----
 const blocks=[],BC=16,bgrid=new Map();
 const qgrid=new Map(),block=(ax,ay,bx,by,r,queue=false)=>{const s={ax,ay,bx,by,r,queue};blocks.push(s);const grid=queue?qgrid:bgrid;
  for(let gx=Math.floor((Math.min(ax,bx)-r)/BC);gx<=Math.floor((Math.max(ax,bx)+r)/BC);gx++)for(let gy=Math.floor((Math.min(ay,by)-r)/BC);gy<=Math.floor((Math.max(ay,by)+r)/BC);gy++){const k=gx+','+gy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(s);}};
 const segDist=(s,x,y)=>{const dx=s.bx-s.ax,dy=s.by-s.ay,l2=dx*dx+dy*dy;let u=l2?((x-s.ax)*dx+(y-s.ay)*dy)/l2:0;u=u<0?0:u>1?1:u;return Math.hypot(x-s.ax-dx*u,y-s.ay-dy*u);};
 const blocked=(x,y,m=0,grid=bgrid)=>{for(const s of grid.get(cellKey(x,y,BC))??[])if(segDist(s,x,y)<s.r+m)return true;return false;};
 const streets=city.streets??[];
 // What the race weekend puts on a street (city-race.js: stands on closed lanes, the TV trucks in a car park) is closed too.
 for(const b of raceTrafficBlocks(data,map))block(b.x,b.y,b.x,b.y,b.r);
 for(const c of city.closures??[]){
  block(c.x,c.y,c.x,c.y,c.width/2+9);
  const hx=Math.cos(c.heading),hy=Math.sin(c.heading);let best=null;
  // The queue's own street (c.street, its OSM way, as street-closures.js follows it); the nearest one along it otherwise.
  const own=c.street!=null&&streets.some(s=>s.id===c.street);
  streets.forEach((s,si)=>{if(own&&s.id!==c.street)return;const Q=s.points;for(let i=0;i<Q.length-1;i++){const dx=Q[i+1][0]-Q[i][0],dy=Q[i+1][1]-Q[i][1],l=Math.hypot(dx,dy);if(l<1e-6)continue;
   let u=((c.x-Q[i][0])*dx+(c.y-Q[i][1])*dy)/(l*l);u=Math.max(0,Math.min(1,u));const d=Math.hypot(c.x-Q[i][0]-dx*u,c.y-Q[i][1]-dy*u);if(d>7)continue;
   const al=(dx*hx+dy*hy)/l;if(Math.abs(al)<.7)continue;const score=d+(s.name===c.name?0:4);if(!best||score<best.score)best={score,si,i,u,dir:al>0?1:-1};}});
  const pts=[[c.x,c.y]];
  if(best){const Q=streets[best.si].points,{i,u,dir}=best;pts.push([Q[i][0]+(Q[i+1][0]-Q[i][0])*u,Q[i][1]+(Q[i+1][1]-Q[i][1])*u]);if(dir>0)for(let k=i+1;k<Q.length;k++)pts.push(Q[k]);else for(let k=i;k>=0;k--)pts.push(Q[k]);}
  else pts.push([c.x+hx*10,c.y+hy*10]);
  // (No queue on a one-way street whose traffic runs away from the line, c.flow -1; at most eight cars a lane, about 60 m.)
  if(c.flow===-1||(c.room??60)<10)continue;
  let left=Math.min(c.room??60,62)+6;
  for(let k=0;k<pts.length-1&&left>0;k++){const [ax,ay]=pts[k],[bx,by]=pts[k+1],l=Math.hypot(bx-ax,by-ay),f=Math.min(1,left/(l||1));block(ax,ay,ax+(bx-ax)*f,ay+(by-ay)*f,c.width/2+.4,true);left-=l;}
 }

 // ---- Ways: the data's streets that carry traffic, and the twin bridge (its own deck heights) ----
 const ways=[];
 const makeWay=(P,o)=>{const n=P.length,X=new Float64Array(n),Y=new Float64Array(n),W=new Float64Array(n),S=new Float64Array(n),TX=new Float64Array(n),TY=new Float64Array(n);
  for(let k=0;k<n;k++){X[k]=P[k][0];Y[k]=P[k][1];W[k]=P[k][2];if(k)S[k]=S[k-1]+Math.hypot(X[k]-X[k-1],Y[k]-Y[k-1]);}
  for(let k=0;k<n;k++){const k0=Math.max(0,k-1),k1=Math.min(n-1,k+1),dx=X[k1]-X[k0],dy=Y[k1]-Y[k0],l=Math.hypot(dx,dy)||1;TX[k]=dx/l;TY[k]=dy/l;}
  const [v0,rank]=ROADS[o.kind];return {...o,n,X,Y,W,S,TX,TY,v0,rank,id:ways.length};};
 // OpenStreetMap splits a street wherever a tag changes (a bridge, a lane count, a name): pieces carrying straight on with
 // the same lanes and way are joined back into one, so its lanes run through (a two-way piece may be drawn either way).
 {const parts=streets.filter(s=>ROADS[s.kind]&&s.points?.length>=2).map(s=>({kind:s.kind,name:s.name,lanes:Math.max(1,s.lanes|0),oneway:!!s.oneway,pts:s.points.map(p=>[...p]),gone:false}));
  const dir=(P,end)=>{const a=end?P.at(-2):P[1],b=end?P.at(-1):P[0],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l];};
  for(let merged=true;merged;){merged=false;
   for(const A of parts){if(A.gone)continue;const e=A.pts.at(-1),de=dir(A.pts,true);let best=null,bc=Math.cos(.6);
    for(const B of parts){if(B===A||B.gone||B.oneway!==A.oneway||B.lanes!==A.lanes)continue;
     for(const rev of A.oneway?[false]:[false,true]){const P=rev?B.pts.slice().reverse():B.pts,q=P[0];if(Math.hypot(q[0]-e[0],q[1]-e[1])>4)continue;
      const d=dir(P,false),c=-(de[0]*d[0]+de[1]*d[1]);if(c>bc){bc=c;best={B,P};}}}
    if(best){A.pts.push(...best.P.slice(1));if(ROADS[best.B.kind][1]>ROADS[A.kind][1])A.kind=best.B.kind;A.name||=best.B.name;best.B.gone=true;merged=true;}}}
  for(const q of parts)if(!q.gone&&q.pts.length>=2)ways.push(makeWay(q.pts,{kind:q.kind,name:q.name,lanes:q.lanes,oneway:q.oneway}));}
 const twin=(data.scenery.bridges??[]).find(b=>b.kind==='colombo_salles')?.twin;
 if(twin?.points?.length>2)ways.push(makeWay(twin.points.map(p=>[p[0],p[1],14.4]),{kind:'trunk',name:twin.name,lanes:4,oneway:true,deck:twin.points.map(p=>p[2]),twin:true}));
 stats.ways=ways.length;
 // Parking strips: the parked cars (city.parked) matched to their street's side, the gaps between them filled (empty bays).
 const PC=8,pgrid=new Map();
 ways.forEach(w=>{if(w.deck)return;w.parkL=new Uint8Array(w.n);w.parkR=new Uint8Array(w.n);for(let k=0;k<w.n;k++){const key=cellKey(w.X[k],w.Y[k],PC);if(!pgrid.has(key))pgrid.set(key,[]);pgrid.get(key).push(w,k);}});
 {const pk=city.parked,cols=Object.fromEntries((pk?.columns??[]).map((k,i)=>[k,i]));
  for(const it of pk?.items??[]){const x=it[cols.x],y=it[cols.y],h=it[cols.heading];let best=null,bd=1e9;
   for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const l=pgrid.get((Math.floor(x/PC)+i)+','+(Math.floor(y/PC)+j));if(!l)continue;
    for(let q=0;q<l.length;q+=2){const w=l[q],k=l[q+1];if(Math.abs(Math.cos(h)*w.TX[k]+Math.sin(h)*w.TY[k])<.8)continue;const dx=x-w.X[k],dy=y-w.Y[k],al=Math.abs(dx*w.TX[k]+dy*w.TY[k]),lat=-dx*w.TY[k]+dy*w.TX[k];
     if(al>3||Math.abs(lat)>w.W[k]/2+1.5)continue;const d=al+Math.abs(Math.abs(lat)-w.W[k]/2);if(d<bd){bd=d;best=[w,k,lat];}}}
   if(best){const [w,k,lat]=best,arr=lat>0?w.parkL:w.parkR;for(let q=Math.max(0,k-1);q<=Math.min(w.n-1,k+1);q++)arr[q]=1;}}
  for(const w of ways)if(w.parkL)for(const arr of [w.parkL,w.parkR]){let last=-99;for(let k=0;k<w.n;k++)if(arr[k]){if(k-last>1&&k-last<=6)for(let q=last+1;q<k;q++)arr[q]=1;last=k;}}}

 // ---- Each way: the carriageway at every point (the curbs from the city map), what is open, the runs of open points ----
 const runs=[];
 for(const w of ways){
  const n=w.n,eL=new Float64Array(n),eR=new Float64Array(n),open=new Uint8Array(n);
  for(let k=0;k<n;k++){
   const x=w.X[k],y=w.Y[k],nx=-w.TY[k],ny=w.TX[k],half=w.W[k]/2;
   if(w.deck){eL[k]=eR[k]=7.2;open[k]=1;continue;}
   // The curb each side: where the road's signed distance turns positive (bisection), none at a junction's mouth.
   const edge=sg=>{if(!roadD)return half;const d=o=>roadD(x+nx*sg*o,y+ny*sg*o),reach=half+3;if(d(0)>-.25||d(reach)<=-.25)return NaN;let lo=0,hi=reach;for(let i=0;i<9;i++){const m=(lo+hi)/2;if(d(m)>-.25)hi=m;else lo=m;}return lo+.25;};
   eL[k]=edge(1);eR[k]=edge(-1);
   const cx=x+nx*((eL[k]||half)-(eR[k]||half))/2,cy=y+ny*((eL[k]||half)-(eR[k]||half))/2;
   // (Not in a zone of the city open to roam, meta.roam: the player drives about there, the city's cars keep out.)
   open[k]=ground(x,y)!=null&&(!roadD||roadD(cx,cy)<-.4)&&corridor(x,y)-half>=D_CORR&&!blocked(x,y,1)&&bandClearance(bands,x,y).distance>half+3&&!(roam&&roamZoneAt(data,x,y))?1:0;
  }
  // Curbs not found (junction mouths): the nearest found ones along the way, else the data's width.
  for(const e of [eL,eR]){let last=NaN;const fill=new Float64Array(n);for(let k=0;k<n;k++){if(Number.isFinite(e[k]))last=e[k];fill[k]=last;}last=NaN;
   for(let k=n-1;k>=0;k--){if(Number.isFinite(e[k]))last=e[k];if(!Number.isFinite(e[k]))e[k]=Number.isFinite(fill[k])&&Number.isFinite(last)?Math.min(fill[k],last):Number.isFinite(fill[k])?fill[k]:Number.isFinite(last)?last:w.W[k]/2;}}
  w.eL=eL;w.eR=eR;
  for(let k=0;k<n;){if(!open[k]){k++;continue;}let e=k;while(e+1<n&&open[e+1])e++;if(w.S[e]-w.S[k]>=6)runs.push({w,k0:k,k1:e,id:runs.length});k=e+1;}
 }
 stats.runs=runs.length;

 // ---- Lanes: per run and direction, offsets inside the usable width (curb to curb, less the parking strips) ----
 const tracks=[];
 const sampleTrack=(pts,o)=>{
  // pts: [[x, y, z|null, wayS]] along the travel; resampled every STEP metres.
  const X=[],Y=[],Z=[],WS=[];let need=0;
  for(let k=0;k<pts.length-1;k++){const [x0,y0,z0,s0]=pts[k],[x1,y1,z1,s1]=pts[k+1],l=Math.hypot(x1-x0,y1-y0);if(l<1e-6)continue;let t=need;
   while(t<=l){const u=t/l;X.push(x0+(x1-x0)*u);Y.push(y0+(y1-y0)*u);Z.push(z0==null?null:z0+(z1-z0)*u);WS.push(s0+(s1-s0)*u);t+=STEP;}need=t-l;}
  const last=pts.at(-1);if(need>STEP*.3){X.push(last[0]);Y.push(last[1]);Z.push(last[2]);WS.push(last[3]);}
  const n=X.length;if(n<3)return null;
  const T={...o,n,X:Float32Array.from(X),Y:Float32Array.from(Y),Z:new Float32Array(n),C:new Float32Array(n),HX:new Float32Array(n),HY:new Float32Array(n),VL:new Float32Array(n),WS:Float32Array.from(WS),
   exits:[],zones:[],stops:[],vehicles:[],id:tracks.length};
  for(let k=0;k<n;k++){const z=Z[k]??ground(X[k],Y[k]);T.Z[k]=z??0;if(k)T.C[k]=T.C[k-1]+Math.hypot(X[k]-X[k-1],Y[k]-Y[k-1]);}
  for(let k=0;k<n;k++){const k0=Math.max(0,k-1),k1=Math.min(n-1,k+1),dx=X[k1]-X[k0],dy=Y[k1]-Y[k0],l=Math.hypot(dx,dy)||1;T.HX[k]=dx/l;T.HY[k]=dy/l;}
  T.len=T.C[n-1];
  // Bends: the speed the lateral acceleration allows (heading change over ±2 samples), then braking ahead of them.
  for(let k=0;k<n;k++){const k0=Math.max(0,k-2),k1=Math.min(n-1,k+2),dh=Math.abs(wrapA(Math.atan2(T.HY[k1],T.HX[k1])-Math.atan2(T.HY[k0],T.HX[k0]))),ds=T.C[k1]-T.C[k0]||1;
   T.VL[k]=Math.min(o.v0,Math.sqrt(LAT/Math.max(dh/ds,1e-4)));}
  for(let k=n-2;k>=0;k--)T.VL[k]=Math.min(T.VL[k],Math.sqrt(T.VL[k+1]**2+2*B_COMF*(T.C[k+1]-T.C[k])));
  return T;
 };
 for(const r of runs){
  const w=r.w,{k0,k1}=r,m=k1-k0+1,lo=new Float64Array(m),hi=new Float64Array(m);
  for(let i=0;i<m;i++){const k=k0+i;
   if(w.deck){lo[i]=-7.2;hi[i]=7.2;continue;}
   lo[i]=-w.eR[k]+(w.parkR[k]?PARK_W:CURB);hi[i]=w.eL[k]-(w.parkL[k]?PARK_W:CURB);}
  // Kept clear of the parked cars a point either side; a run too narrow anywhere for one car is dropped.
  const L=Float64Array.from(lo,(v,i)=>Math.max(v,lo[Math.max(0,i-1)],lo[Math.min(m-1,i+1)])),H=Float64Array.from(hi,(v,i)=>Math.min(v,hi[Math.max(0,i-1)],hi[Math.min(m-1,i+1)]));
  const widths=Array.from(L,(v,i)=>H[i]-v).sort((p,q)=>p-q),wMed=widths[m>>1],wMin=widths[Math.floor(m*.08)];
  if(wMin<2.3&&!w.deck){stats.dead++;continue;}
  // Two ways when both halves take a car; else (a narrow street between parked cars) only the way's own order.
  const two=!w.oneway&&wMed/2>=2.45;
  const dirs=two?[1,-1]:[1];
  for(const dir of dirs){
   const span=two?wMed/2:wMed,want=two?Math.max(1,Math.round(w.lanes/2)):w.lanes,nl=w.deck?4:Math.max(1,Math.min(want,Math.floor(span/LANE_W)));
   for(let lane=0;lane<nl;lane++){
    // Offset (left of the way +) at each point; lane 0 the rightmost of the travel.
    const off=new Float64Array(m);
    for(let i=0;i<m;i++){const l0=L[i],h0=H[i],c=(l0+h0)/2;off[i]=w.deck?(dir>0?-5.4+3.6*lane:5.4-3.6*lane):!two?l0+(lane+.5)*(h0-l0)/nl:dir>0?l0+(lane+.5)*(c-l0)/nl:h0-(lane+.5)*(h0-c)/nl;}
    const sm=Float64Array.from(off,(v,i)=>{let s=0,c=0;for(let j=Math.max(0,i-2);j<=Math.min(m-1,i+2);j++){s+=off[j];c++;}return s/c;});
    const pts=[];for(let i=0;i<m;i++){const k=k0+i,o=sm[i];pts.push([w.X[k]-w.TY[k]*o,w.Y[k]+w.TX[k]*o,w.deck?w.deck[k]:null,w.S[k]]);}
    if(dir<0)pts.reverse();
    // Inside a tight bend an offset line can fold back on itself: such points go.
    const clean=[pts[0]];for(let i=1;i<pts.length;i++){const p=clean.at(-1),q=pts[i],k=k0+(dir>0?i:m-1-i),dx=q[0]-p[0],dy=q[1]-p[1];if((dx*w.TX[k]+dy*w.TY[k])*dir>.4)clean.push(q);}
    // A lane running into a queue held at a closure (the queue follows its own street, which may join this one) stops
    // short of it; what is left after it is a lane of its own.
    const pieces=[[]];for(const q of clean){if(!w.deck&&blocked(q[0],q[1],1.2,qgrid)){if(pieces.at(-1).length)pieces.push([]);}else pieces.at(-1).push(q);}
    for(const piece of pieces){if(piece.length<2||Math.abs(piece.at(-1)[3]-piece[0][3])<6)continue;
     const T=sampleTrack(piece,{run:r,way:w,dir,lane,nl,kind:w.kind,rank:w.rank,v0:w.v0,bus:w.kind==='busway',deck:!!w.deck,twin:!!w.twin,stream:w.id*2+(dir>0?0:1)});
     if(T){tracks.push(T);if(w.twin)stats.twinLanes++;}}
   }
  }
 }
 // A track's sample nearest to a way position (WS runs up or down the way); null off its stretch.
 const atWay=(T,ws)=>{let best=0,bd=Infinity;for(let k=0;k<T.n;k++){const d=Math.abs(T.WS[k]-ws);if(d<bd){bd=d;best=k;}}return bd>4?null:T.C[best];};
 const sample=(T,s)=>{s=Math.max(0,Math.min(T.len,s));let lo=0,hi=T.n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(T.C[m]<=s)lo=m;else hi=m;}const u=(s-T.C[lo])/((T.C[hi]-T.C[lo])||1);
  return {x:T.X[lo]+(T.X[hi]-T.X[lo])*u,y:T.Y[lo]+(T.Y[hi]-T.Y[lo])*u,z:T.Z[lo]+(T.Z[hi]-T.Z[lo])*u,hx:T.HX[lo]+(T.HX[hi]-T.HX[lo])*u,hy:T.HY[lo]+(T.HY[hi]-T.HY[lo])*u};};
 const byRun=new Map();for(const T of tracks){if(!byRun.has(T.run))byRun.set(T.run,[]);byRun.get(T.run).push(T);}

 // ---- Junctions: where one run's centreline meets another's: a way's end on another way (an OSM node they share), or two
 // ways crossing (OSM shares the node without splitting them). A crossing between an expressway and a minor street is
 // taken for a bridge over it (no turning there: its ramps meet it at their ends) ----
 const JC=12,jgrid=new Map();
 for(const r of runs){if(!byRun.has(r))continue;const w=r.w;for(let k=r.k0;k<r.k1;k++){const ax=w.X[k],ay=w.Y[k],bx=w.X[k+1],by=w.Y[k+1];
  for(let gx=Math.floor((Math.min(ax,bx)-JOIN)/JC);gx<=Math.floor((Math.max(ax,bx)+JOIN)/JC);gx++)for(let gy=Math.floor((Math.min(ay,by)-JOIN)/JC);gy<=Math.floor((Math.max(ay,by)+JOIN)/JC);gy++){const key=gx+','+gy;if(!jgrid.has(key))jgrid.set(key,[]);jgrid.get(key).push(r,k);}}}
 // The runs whose centreline passes within JOIN of (x, y): [run, way position].
 const onRuns=(x,y,self)=>{const out=[],l=jgrid.get(cellKey(x,y,JC));if(!l)return out;
  for(let q=0;q<l.length;q+=2){const r=l[q],k=l[q+1];if(r===self)continue;const w=r.w,dx=w.X[k+1]-w.X[k],dy=w.Y[k+1]-w.Y[k],l2=dx*dx+dy*dy||1e-9;let u=((x-w.X[k])*dx+(y-w.Y[k])*dy)/l2;u=u<0?0:u>1?1:u;
   const d=Math.hypot(x-w.X[k]-dx*u,y-w.Y[k]-dy*u);if(d>JOIN)continue;const ws=w.S[k]+(w.S[k+1]-w.S[k])*u,prev=out.find(o=>o.r===r);if(prev){if(d<prev.d)Object.assign(prev,{d,ws});}else out.push({r,ws,d});}
  return out;};
 const junctions=[],jkey=new Set();
 // (A bridge deck meets the streets only at its two ends: what passes under it is no junction.)
 const deckEnd=(r,ws)=>!r.w.deck||ws<8||ws>r.w.S[r.w.n-1]-8;
 const junction=(A,wa,B,wb,cross)=>{if(A===B||(A.w.deck||B.w.deck)&&(cross||!deckEnd(A,wa)||!deckEnd(B,wb)))return;
  if(cross&&Math.max(A.w.rank,B.w.rank)>=6&&!/_link/.test(A.w.kind+B.w.kind)&&Math.min(A.w.rank,B.w.rank)<4.5)return;
  const k=Math.min(A.id,B.id)+':'+Math.max(A.id,B.id)+':'+Math.round((A.id<B.id?wa:wb)/6);if(jkey.has(k))return;jkey.add(k);junctions.push([A,wa,B,wb]);};
 for(const r of runs){if(!byRun.has(r))continue;const w=r.w;for(const k of [r.k0,r.k1])for(const o of onRuns(w.X[k],w.Y[k],r))junction(r,w.S[k],o.r,o.ws,false);}
 for(const l of jgrid.values())for(let p=0;p<l.length;p+=2)for(let q=p+2;q<l.length;q+=2){
  const A=l[p],ka=l[p+1],B=l[q],kb=l[q+1];if(A===B)continue;const wa=A.w,wb=B.w;
  const ax=wa.X[ka],ay=wa.Y[ka],adx=wa.X[ka+1]-ax,ady=wa.Y[ka+1]-ay,bx=wb.X[kb],by=wb.Y[kb],bdx=wb.X[kb+1]-bx,bdy=wb.Y[kb+1]-by,den=adx*bdy-ady*bdx;if(Math.abs(den)<1e-9)continue;
  const u=((bx-ax)*bdy-(by-ay)*bdx)/den,v=((bx-ax)*ady-(by-ay)*adx)/den;if(u<0||u>1||v<0||v>1)continue;
  junction(A,wa.S[ka]+(wa.S[ka+1]-wa.S[ka])*u,B,wb.S[kb]+(wb.S[kb+1]-wb.S[kb])*v,true);
 }
 const exitKeys=new Set(),pending=[];
 // From track F at s (its heading there) into track T at entry e: allowed turns and lanes (right turns from the rightmost
 // lane into the rightmost, left turns from the leftmost into the leftmost, straight on lane for lane).
 const link=(F,sF,T,e,shift=false)=>{
  if(sF==null||e==null||F===T||F.run===T.run||e>T.len-Math.min(12,T.len*.5)||sF<Math.min(3,F.len*.3))return null;const key=F.id+'>'+T.id;if(exitKeys.has(key))return null;
  const pf=sample(F,sF),pt=sample(T,e),d=wrapA(Math.atan2(pt.hy,pt.hx)-Math.atan2(pf.hy,pf.hx));if(Math.abs(d)>2.1)return null;
  const turn=d<-.55?'right':d>.55?'left':'straight';
  if(turn==='right'&&(F.lane!==0||T.lane!==0))return null;if(turn==='left'&&(F.lane!==F.nl-1||T.lane!==T.nl-1))return null;
  // (straight on: lane for lane, the extra ones merging into the last; one lane over only to save a lane leading nowhere)
  if(turn==='straight'&&Math.abs(T.lane-Math.min(F.lane,T.nl-1))>(shift?1:0)&&!(F.lane===F.nl-1&&T.lane>F.lane))return null;
  exitKeys.add(key);const x={F,sF,T,e,turn};pending.push(x);return x;};
 for(const [A,wa,B,wb] of junctions)for(const [R1,w1,R2,w2] of [[A,wa,B,wb],[B,wb,A,wa]])
  for(const F of byRun.get(R1)??[])for(const T of byRun.get(R2)??[])link(F,atWay(F,w1),T,atWay(T,w2));
 stats.junctions=junctions.length;
 // Connectors: a cubic curve from a few metres before the exit to a few metres into the lane it joins.
 const conns=[];
 const connect=x=>{
  const {F,sF,T,e}=x,k1=Math.min(x.turn==='straight'?5:7,sF-1),k2=Math.min(x.turn==='straight'?5:7,T.len-e-2),s0=sF-k1,s1=e+k2;
  const p0=sample(F,s0),p3=sample(T,s1),dist=Math.hypot(p3.x-p0.x,p3.y-p0.y),hl=dist*.4;
  const h0=Math.hypot(p0.hx,p0.hy)||1,h3=Math.hypot(p3.hx,p3.hy)||1,c1=[p0.x+p0.hx/h0*hl,p0.y+p0.hy/h0*hl],c2=[p3.x-p3.hx/h3*hl,p3.y-p3.hy/h3*hl];
  const n=Math.max(4,Math.ceil(dist/1.2)),pts=[],raised=F.deck||T.deck;
  for(let i=0;i<=n;i++){const u=i/n,v=1-u,bx=v*v*v*p0.x+3*v*v*u*c1[0]+3*v*u*u*c2[0]+u*u*u*p3.x,by=v*v*v*p0.y+3*v*v*u*c1[1]+3*v*u*u*c2[1]+u*u*u*p3.y;
   pts.push([bx,by,raised?p0.z+(p3.z-p0.z)*smooth(u):null,0]);}
  const C=sampleTrack(pts,{run:null,way:F.way,dir:F.dir,lane:F.lane,nl:F.nl,kind:F.kind,rank:Math.min(F.rank,T.rank)-(x.turn==='straight'?0:.5),v0:Math.min(F.v0,T.v0),bus:F.bus&&T.bus,deck:raised,stream:1e6+conns.length,connector:true,turn:x.turn,from:F});
  if(!C)return;
  C.exits.push({s0:C.len,conn:null,to:T,entry:s1,turn:'straight',group:0});
  (F.allExits??=[]).push({s0,conn:C,to:T,entry:s1,turn:x.turn,from:F});conns.push(C);
 };
 for(const x of pending)connect(x);
 // ---- What leads somewhere: a track whose end is far from the race (the map's edge) is a way out; the others must leave
 // by an exit into a track that carries on (out of the map, or round the blocks for ever). An exit is no use into a dead
 // lane or past the last way out of the lane it joins: dropped until nothing changes ----
 for(const T of tracks){const n=T.n-1,x=T.X[n],y=T.Y[n],hx=T.HX[n],hy=T.HY[n];T.sink=lapDistance(x,y)>330||ground(x+hx*16,y+hy*16)==null;}
 const prune=()=>{
  for(const T of tracks){T.alive=true;T.lastExit=Infinity;T.exits=[...(T.allExits??[])];}
  for(let changed=true;changed;){changed=false;
   for(const T of tracks){if(!T.alive)continue;const keep=T.exits.filter(x=>x.to.alive&&x.entry<x.to.lastExit-6);if(keep.length!==T.exits.length){T.exits=keep;changed=true;}
    const le=T.sink?Infinity:keep.length?Math.max(...keep.map(x=>x.s0)):-Infinity;if(le!==T.lastExit){T.lastExit=le;changed=true;}
    if(!T.sink&&!keep.length){T.alive=false;changed=true;}}
  }
 };
 prune();
 // A lane whose own way on leads nowhere (the next street's lane is cut further on) may still change to the lane beside it
 // at the junction: those connectors only, then pruned again.
 for(let round=0;round<2;round++){let added=0;
  for(const x of [...pending])if(!x.F.alive&&x.turn==='straight'&&!x.T.alive)for(const T2 of byRun.get(x.T.run)??[]){if(!T2.alive)continue;const y=link(x.F,x.sF,T2,atWay(T2,x.T.WS[Math.min(x.T.n-1,Math.round(x.e/STEP))]),true);if(y){connect(y);added++;}}
  if(!added)break;prune();
 }
 stats.dead+=tracks.filter(T=>!T.alive).length;stats.rawTracks=tracks.length;stats.links=pending.length;
 const alive=tracks.filter(T=>T.alive),connectors=[];
 for(const T of alive){T.exits.sort((p,q)=>p.s0-q.s0);let g=0,last=-1e9;for(const x of T.exits){if(x.s0-last>1.5)g++;x.group=g;last=x.s0;connectors.push(x.conn);}}
 for(const C of connectors)C.lastExit=C.len;
 stats.tracks=alive.length;stats.connectors=connectors.length;stats.laneKm=+(alive.reduce((s,T)=>s+T.len,0)/1000).toFixed(1);
 alive.forEach((T,i)=>T.id=i);connectors.forEach((C,i)=>C.id=alive.length+i);

 // ---- Conflict zones: where lanes of different streams cross or merge (crossings, turns across the other way, a lane
 // joining another), at the same level. Each track keeps its zones in order: [zone, s in, s out] ----
 const all=[...alive,...connectors],ZC=8,zgrid=new Map(),zones=[];
 for(const T of all)for(let k=0;k+1<T.n;k++){const ax=T.X[k],ay=T.Y[k],bx=T.X[k+1],by=T.Y[k+1];
  for(let gx=Math.floor(Math.min(ax,bx)/ZC);gx<=Math.floor(Math.max(ax,bx)/ZC);gx++)for(let gy=Math.floor(Math.min(ay,by)/ZC);gy<=Math.floor(Math.max(ay,by)/ZC);gy++){const key=gx+','+gy;if(!zgrid.has(key))zgrid.set(key,[]);zgrid.get(key).push(T,k);}}
 const zfind=new Map();
 const zoneAt=(x,y)=>{const gx=Math.floor(x/10),gy=Math.floor(y/10);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const z of zfind.get((gx+i)+','+(gy+j))??[])if(Math.hypot(z.x-x,z.y-y)<8)return z;
  const z={x,y,id:zones.length,members:new Map(),signal:false,holder:-1,holdUntil:0,holdRank:0,force:-1,forceUntil:0};zones.push(z);const k=gx+','+gy;if(!zfind.has(k))zfind.set(k,[]);zfind.get(k).push(z);return z;};
 const seen=new Set();
 for(const l of zgrid.values())for(let p=0;p<l.length;p+=2)for(let q=p+2;q<l.length;q+=2){
  const A=l[p],ka=l[p+1],B=l[q],kb=l[q+1];if(A===B||A.stream===B.stream)continue;
  // (a connector and the lane it leaves, or two leaving the same lane, part where they start: no crossing)
  if(A.from===B||B.from===A||A.from&&A.from===B.from)continue;
  // (a lane carrying on from its connector at its start is no crossing)
  if(A.connector&&A.exits[0].to===B&&A.exits[0].entry<12||B.connector&&B.exits[0].to===A&&B.exits[0].entry<12)continue;
  const ax=A.X[ka],ay=A.Y[ka],adx=A.X[ka+1]-ax,ady=A.Y[ka+1]-ay,bx=B.X[kb],by=B.Y[kb],bdx=B.X[kb+1]-bx,bdy=B.Y[kb+1]-by,den=adx*bdy-ady*bdx;if(Math.abs(den)<1e-9)continue;
  const u=((bx-ax)*bdy-(by-ay)*bdx)/den,v=((bx-ax)*ady-(by-ay)*adx)/den;if(u<0||u>1||v<0||v>1)continue;
  const key=A.id+':'+ka+':'+B.id+':'+kb;if(seen.has(key))continue;seen.add(key);
  const za=A.Z[ka]+(A.Z[ka+1]-A.Z[ka])*u,zb=B.Z[kb]+(B.Z[kb+1]-B.Z[kb])*v;if(Math.abs(za-zb)>2.5)continue;
  const x=ax+adx*u,y=ay+ady*u,z=zoneAt(x,y),sa=A.C[ka]+(A.C[ka+1]-A.C[ka])*u,sb=B.C[kb]+(B.C[kb+1]-B.C[kb])*v;
  for(const [T,s] of [[A,sa],[B,sb]]){const m=z.members.get(T);if(m){m.sIn=Math.min(m.sIn,s-3.2);m.sOut=Math.max(m.sOut,s+3.2);}else z.members.set(T,{sIn:s-3.2,sOut:s+3.2});}
 }
 const SG=city.signals?.items??[];
 for(const z of zones){
  z.signal=SG.some(([x,y])=>Math.hypot(x-z.x,y-z.y)<24);if(z.signal)stats.signalZones++;
  let top=0;for(const T of z.members.keys())top=Math.max(top,T.rank);z.top=top;
  for(const [T,m] of z.members)T.zones.push({zone:z,sIn:Math.max(0,m.sIn),sOut:Math.min(T.len,m.sOut),major:T.rank>=top-.25});
 }
 for(const T of all)T.zones.sort((p,q)=>p.sIn-q.sIn);
 stats.zones=zones.length;
 // ---- Bus stops on the rightmost lane passing them ----
 for(const [x,y,h] of city.stops?.items??[])for(const T of alive){
  if(T.lane!==0||T.rank>5.5)continue;for(let k=0;k<T.n;k+=2){const dx=x-T.X[k],dy=y-T.Y[k];if(dx*dx+dy*dy>64)continue;if(Math.abs(Math.cos(h)*T.HX[k]+Math.sin(h)*T.HY[k])<.7)continue;
   const s=T.C[k]-3;if(s>12&&s<T.lastExit-8&&!T.stops.some(q=>Math.abs(q-s)<20)){T.stops.push(s);stats.busStops++;}break;}}
 for(const T of alive)T.stops.sort((p,q)=>p-q);
 for(const T of all){T.lapD=lapDistance(T.X[T.n>>1],T.Y[T.n>>1]);}
 return {tracks:alive,connectors,zones,stats,sample};
}

// ---------- Boats: hulls lofted through sections, cabins, people at the helm, sails; navigation lamps lit at night ----------
// Template frame: x forward (bow), y left, z up from the waterline.
function boatShape(kind){
 const sh=new Shape(),P=FINISH,white=[1,1,1],C={deck:lin(0xd9d4c4),teak:lin(0x8a6a44),glass:lin(0x121a20),black:lin(0x141516),grey:lin(0x8c9196),skin:lin(0xb07a55),red:lin(0xd01818),green:lin(0x18c040),lamp:lin(0xf4f0e0),sail:lin(0xf2efe6),rope:lin(0x6e6a60)};
 const spec={lancha:{L:7,B:2.5,fb:.8,draft:.45,bow:.28},baleeira:{L:8.5,B:2.6,fb:1.0,draft:.7,bow:.55},veleiro:{L:9,B:2.9,fb:1.05,draft:.6,bow:.25}}[kind];
 const {L,B,fb,draft,bow}=spec,xs=[];for(let i=0;i<=12;i++)xs.push(-L/2+L*i/12);
 // Half breadth along the hull (a fine bow, a full stern), the sheer rising to the bow.
 const half=x=>{const t=(x+L/2)/L;return B/2*(t<.62?1-.12*Math.pow((.62-t)/.62,2)*(kind==='lancha'?.3:1):Math.sqrt(Math.max(0,1-Math.pow((t-.62)/.38,1.8))));};
 const sheer=x=>{const t=(x+L/2)/L;return fb+bow*Math.pow(Math.max(0,t-.5)/.5,2)+(kind==='baleeira'?.18*Math.pow(Math.max(0,.25-t)/.25,2):0);};
 const sec=x=>{const b=Math.max(.02,half(x)),zt=sheer(x),zk=-draft*(.6+.4*Math.min(1,b/(B/2)));return [[0,zk],[b*.55,zk*.5],[b*.97,-.05],[b,zt*.55],[b*.96,zt]];};
 const S=xs.map(x=>sec(x));
 for(let i=0;i<xs.length-1;i++)for(const sg of [-1,1])for(let k=0;k<4;k++){
  const A=S[i],Bq=S[i+1],p=(s,j)=>[xs[s===A?i:i+1],sg*s[j][0],s[j][1]],top=k===3;
  sh.quad(p(A,k),p(Bq,k),p(Bq,k+1),p(A,k+1),top&&kind!=='veleiro'?white:white,P.paint,{out:[0,sg,k===0?-1:0],role:top?ROLE.accent:ROLE.paint});
 }
 // Transom, deck (a polygon round the sheer line), a dark boot-top line at the waterline.
 sh.poly(S[0].map(([y,z])=>[xs[0],y,z]).concat(S[0].slice().reverse().map(([y,z])=>[xs[0],-y,z])),white,P.paint,[-1,0,0],{role:ROLE.paint});
 {const ring=[];for(let i=0;i<xs.length;i++)ring.push([xs[i],S[i][4][0],S[i][4][1]-.02]);for(let i=xs.length-1;i>=0;i--)ring.push([xs[i],-S[i][4][0],S[i][4][1]-.02]);
  for(let i=0;i<xs.length-1;i++)sh.quad([xs[i],-S[i][4][0],S[i][4][1]-.02],[xs[i+1],-S[i+1][4][0],S[i+1][4][1]-.02],[xs[i+1],S[i+1][4][0],S[i+1][4][1]-.02],[xs[i],S[i][4][0],S[i][4][1]-.02],kind==='lancha'?C.deck:kind==='veleiro'?C.teak:C.deck,P.solid,{out:[0,0,1]});}
 for(let i=0;i<xs.length-1;i++)for(const sg of [-1,1]){const a=S[i],b=S[i+1];sh.quad([xs[i],sg*(a[2][0]+.006),-.05],[xs[i+1],sg*(b[2][0]+.006),-.05],[xs[i+1],sg*(b[2][0]+.006),.06],[xs[i],sg*(a[2][0]+.006),.06],C.black,P.paint,{out:[0,sg,0]});}
 const deckZ=x=>sheer(x)-.02;
 // Navigation lamps (lamp 2: lit at night): red to port (left), green to starboard, white at the stern / masthead.
 const xl=L*.18;sh.box(xl-.08,xl+.08,half(xl)-.02,half(xl)+.04,deckZ(xl)+.05,deckZ(xl)+.16,C.red,P.lens,{glow:GLOW.head});sh.box(xl-.08,xl+.08,-half(xl)-.04,-half(xl)+.02,deckZ(xl)+.05,deckZ(xl)+.16,C.green,P.lens,{glow:GLOW.head});
 const person=(x,y,z,shirt)=>{sh.post([x,y,z],[x,y,z+.62],.17,.15,6,shirt,P.cloth,{top:true,role:ROLE.rim});sh.post([x+.02,y,z+.66],[x+.03,y,z+.9],.11,.1,6,C.skin,P.solid,{top:true});};
 if(kind==='lancha'){
  // Console with its windscreen amidships, the driver and a passenger, a bimini (the second colour), the outboard.
  const x0=-.4;sh.box(x0-.35,x0+.45,-.45,.45,deckZ(x0),deckZ(x0)+.95,white,P.paint,{role:ROLE.paint});
  sh.quad([x0+.45,-.5,deckZ(x0)+.95],[x0+.45,.5,deckZ(x0)+.95],[x0+.2,.5,deckZ(x0)+1.35],[x0+.2,-.5,deckZ(x0)+1.35],C.glass,P.glass,{out:[1,0,.6]});
  person(x0-.75,.25,deckZ(x0),C.grey);person(x0-.8,-.5,deckZ(x0),white);
  for(const sx of [-1.7,-.75])for(const sg of [-1,1])sh.post([sx,sg*.95,deckZ(sx)],[sx+.15,sg*.9,deckZ(sx)+1.85],.025,.025,4,C.grey,P.chrome);
  sh.box(-1.85,-.6,-1.05,1.05,deckZ(-1)+1.85,deckZ(-1)+1.92,white,P.cloth,{role:ROLE.accent,skip:''});
  sh.box(-L/2-.45,-L/2-.05,-.22,.22,-.35,.55,C.black,P.plastic,{skip:''});sh.box(-L/2-.5,-L/2-.1,-.25,.25,.4,.85,C.black,P.plastic);
  sh.box(-L/2+.1,-L/2+.25,-.07,.07,deckZ(-L/2)+.2,deckZ(-L/2)+.95,C.grey,P.chrome,{skip:''});sh.box(-L/2+.08,-L/2+.27,-.08,.08,deckZ(-L/2)+.95,deckZ(-L/2)+1.05,C.lamp,P.lens,{glow:GLOW.head});
 }else if(kind==='baleeira'){
  // The island's painted fishing boat: a wheelhouse aft with its windows, a short mast with a lamp, the fisherman.
  const x0=-L/2+1.2,z0=deckZ(x0);sh.box(x0-.75,x0+.75,-.8,.8,z0,z0+1.6,white,P.paint,{role:ROLE.accent});sh.box(x0-.85,x0+.85,-.9,.9,z0+1.6,z0+1.7,C.black,P.paint);
  sh.quad([x0+.76,-.6,z0+1.0],[x0+.76,.6,z0+1.0],[x0+.76,.6,z0+1.45],[x0+.76,-.6,z0+1.45],C.glass,P.glass,{out:[1,0,0]});
  for(const sg of [-1,1])sh.quad([x0-.5,sg*.81,z0+1.0],[x0+.5,sg*.81,z0+1.0],[x0+.5,sg*.81,z0+1.4],[x0-.5,sg*.81,z0+1.4],C.glass,P.glass,{out:[0,sg,0]});
  const xm=L*.15;sh.post([xm,0,deckZ(xm)],[xm,0,deckZ(xm)+3.4],.05,.04,5,C.grey,P.paint,{top:true});sh.box(xm-.07,xm+.07,-.07,.07,deckZ(xm)+3.4,deckZ(xm)+3.55,C.lamp,P.lens,{glow:GLOW.head});
  person(.6,.4,deckZ(.6),C.red);sh.box(.9,1.5,-.6,.2,deckZ(1.2),deckZ(1.2)+.35,C.rope,P.cloth);
 }else{
  // Sailing yacht: a low coachroof with its portlights, the mast, the main on its boom and the jib, both drawn on each side.
  const x0=-.6,z0=deckZ(x0);sh.box(x0-1.6,x0+1.4,-1.0,1.0,z0,z0+.55,white,P.paint,{role:ROLE.paint});
  for(const sg of [-1,1])sh.quad([x0-1.2,sg*1.005,z0+.25],[x0+1.0,sg*1.005,z0+.25],[x0+1.0,sg*1.005,z0+.42],[x0-1.2,sg*1.005,z0+.42],C.glass,P.glass,{out:[0,sg,0]});
  const xm=.6,zm=deckZ(xm);sh.post([xm,0,zm],[xm,0,zm+11.5],.07,.05,6,C.grey,P.alloy,{top:true});sh.box(xm-.06,xm+.06,-.06,.06,zm+11.5,zm+11.62,C.lamp,P.lens,{glow:GLOW.head});
  sh.post([xm,0,zm+1.1],[-L/2+.6,0,zm+1.25],.05,.05,5,C.grey,P.alloy);
  const sail=(a,b,c)=>{sh.tri(a,b,c,C.sail,P.cloth,{role:ROLE.accent});sh.tri(a,c,b,C.sail,P.cloth,{role:ROLE.accent});};
  sail([xm-.05,.03,zm+1.2],[xm-.05,.03,zm+11.2],[-L/2+.7,.25,zm+1.3]);sail([xm+.1,.04,zm+10.6],[L/2-.2,0,deckZ(L/2-.2)+.15],[xm+.15,.35,zm+1.1]);
  person(-L/2+1.1,.3,deckZ(-L/2+1.1),C.grey);
 }
 return sh.template(.7);
}

// The destination displays of the buses: amber LEDs on black (real neighbourhoods are public signage).
const DESTS=['CENTRO','TICEN','ESTREITO','CAPOEIRAS','TRINDADE','SACO DOS LIMÕES','COQUEIROS'];
function destinationAtlas(){
 return canvasTexture((ctx,W,H)=>{ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);const rowH=H/8;
  DESTS.forEach((t,k)=>{const y=(k+1)*rowH;ctx.fillStyle='#050505';ctx.fillRect(0,y,W,rowH);ctx.font=`400 ${rowH*.72}px Impact,"Arial Narrow","Arial Black",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffb21e';ctx.fillText(t,W/2,y+rowH/2+1,W*.9);
   ctx.fillStyle='rgba(0,0,0,.55)';for(let x=0;x<W;x+=4)ctx.fillRect(x,y,1,rowH);for(let yy=y;yy<y+rowH;yy+=4)ctx.fillRect(0,yy,W,1);});},512,256);
}

// The material of the moving vehicles: city-cars.js's look (each vertex its roughness, metalness and lamp), each copy placed
// by the vertex shader from its row of the pose texture: [x, y, z, heading], [pitch, roll, flags, sign], paint, rims,
// second colour. flags: 1 shown, 2 braking, 4 daytime lamps. Rows not shown collapse out of view. The depth version casts
// the same shapes into the sun's shadow map.
const TEX_W=8;
const POSE_GLSL=`attribute float slot;uniform highp sampler2D trafficData;
vec4 tfP,tfQ;vec3 tfF,tfL,tfU;
void tfSetup(){int r=int(slot+.5);tfP=texelFetch(trafficData,ivec2(0,r),0);tfQ=texelFetch(trafficData,ivec2(1,r),0);
 float ch=cos(tfP.w),sh=sin(tfP.w),cp=cos(tfQ.x),sp=sin(tfQ.x),cr=cos(tfQ.y),sr=sin(tfQ.y);
 tfF=vec3(ch*cp,sh*cp,sp);vec3 l0=vec3(-sh*cr,ch*cr,sr);tfU=normalize(cross(tfF,l0));tfL=cross(tfU,tfF);}
vec3 tfPoint(vec3 p){vec3 t=tfP.xyz+p.x*tfF+p.y*tfL+p.z*tfU;return vec3(t.x,t.z,-t.y);}
vec3 tfDir(vec3 d){vec3 t=d.x*tfF+d.y*tfL+d.z*tfU;return vec3(t.x,t.z,-t.y);}`;
function trafficMaterial(dataTex,atlas,uniforms,depth=false){
 const m=depth?new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}):new THREE.MeshStandardMaterial({name:'Transito_veiculos',vertexColors:true,map:atlas,roughness:1,metalness:0});
 m.onBeforeCompile=shader=>{
  shader.uniforms.trafficData={value:dataTex};Object.assign(shader.uniforms,uniforms);
  let vs=shader.vertexShader.replace('#include <common>','#include <common>\n'+POSE_GLSL+(depth?'':'\nattribute vec4 surf;attribute float role;varying vec4 vSurf;varying float vFlags;'))
   .replace('#include <begin_vertex>','#include <begin_vertex>\ntfSetup();transformed=tfPoint(position);')
   .replace('#include <project_vertex>','#include <project_vertex>\nif(mod(tfQ.z,2.)<.5)gl_Position=vec4(0.,0.,-2.,1.);');
  if(!depth){
   vs=vs.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\ntfSetup();objectNormal=tfDir(normal);')
    .replace('#include <color_vertex>',`#include <color_vertex>
{tfSetup();int r=int(slot+.5);vec3 tint=vec3(1.);float rl=floor(role+.5);
 if(rl==1.)tint=texelFetch(trafficData,ivec2(2,r),0).rgb;else if(rl==4.)tint=texelFetch(trafficData,ivec2(3,r),0).rgb;else if(rl==5.)tint=texelFetch(trafficData,ivec2(4,r),0).rgb;
 float lit=step(.5/255.,surf.z);vColor.rgb*=tint*mix(texelFetch(trafficData,ivec2(2,r),0).a,1.,lit);vSurf=surf;vFlags=tfQ.z;}`)
    .replace('#include <uv_vertex>',`#include <uv_vertex>
{tfSetup();float rl=floor(role+.5);vMapUv=rl==2.?vec2(uv.x,1.-(floor(tfQ.w+.5)+2.-uv.y)/8.):vec2(.5,.97);}`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 vSurf;varying float vFlags;uniform float cityNight;')
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vSurf.x;')
    .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=vSurf.y;')
    .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{float kind=floor(vSurf.z*255.+.5),brk=mod(floor(vFlags/2.+.01),2.),drl=mod(floor(vFlags/4.+.01),2.),glow=0.;
if(kind==2.)glow=cityNight*5.5+drl*(1.-cityNight)*1.4;
else if(kind==3.)glow=1.5+1.8*cityNight;
else if(kind==4.)glow=cityNight*2.2+brk*(2.6+2.*cityNight);
totalEmissiveRadiance+=vColor.rgb*glow;
// A bus's destination: its LEDs (the texel) lit, the black between them not.
if(kind==5.)totalEmissiveRadiance+=diffuseColor.rgb*(1.4+1.6*cityNight);}`);
  }
  shader.vertexShader=vs;
 };
 m.customProgramCacheKey=()=>'city-traffic-v1'+(depth?'-depth':'');
 return m;
}

// Merged copies of templates, each copy a row of the pose texture (its `slot`), in its own frame (the shader places it).
function slotGeometry(list){
 let V=0,I=0;for(const [t] of list){V+=t.count;I+=t.index.length;}
 const P=new Float32Array(V*3),Nn=new Float32Array(V*3),Cl=new Float32Array(V*3),S=new Uint8Array(V*4),Ro=new Float32Array(V),U=new Float32Array(V*2),Sl=new Float32Array(V),Ix=V>65535?new Uint32Array(I):new Uint16Array(I);
 let v=0,k=0;
 for(const [t,slot] of list){P.set(t.pos,v*3);Nn.set(t.nor,v*3);Cl.set(t.col,v*3);S.set(t.surf,v*4);Ro.set(t.role,v);U.set(t.uv,v*2);Sl.fill(slot,v,v+t.count);for(let i=0;i<t.index.length;i++)Ix[k++]=t.index[i]+v;v+=t.count;}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(Nn,3));g.setAttribute('color',new THREE.BufferAttribute(Cl,3));
 g.setAttribute('surf',new THREE.BufferAttribute(S,4,true));g.setAttribute('role',new THREE.BufferAttribute(Ro,1));g.setAttribute('uv',new THREE.BufferAttribute(U,2));g.setAttribute('slot',new THREE.BufferAttribute(Sl,1));
 g.setIndex(new THREE.BufferAttribute(Ix,1));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
 return {geometry:g,triangles:I/3,vertices:V};
}

export async function createCityTraffic(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Transito_cidade';root.userData.noReflection=true;
 const t0=performance.now(),city=data.scenery?.city;map=await map;
 // (The checks' window on the traffic: where the vehicles are; none on a circuit without a city.)
 if(typeof window!=='undefined')window.interlagosTransito=null;
 const stats={vehicles:0,cars:0,buses:0,motos:0,onTwin:0,near:0,far:0,boats:0,wakes:0,drawCalls:0,triangles:0,trianglesNear:0,trianglesFar:0,respawns:0,waiting:0,braking:0,updateMs:0};
 if(!city?.streets?.length||!ground)return {root,stats};
 const net=buildTrafficNetwork(data,{map,ground});Object.assign(stats,{network:net.stats});
 const {tracks,zones}=net;if(!tracks.length)return {root,stats};
 const rand=random(7741),light=mobile||lean;

 // ---- The vehicles: their types fixed (each keeps its box copy), looks drawn again whenever they come back ----
 const COUNT=mobile?80:lean?150:260,vehicles=[];
 const carTracks=tracks.filter(T=>!T.bus),busTracks=tracks.filter(T=>T.bus||T.rank>=3);
 // Where vehicles come back: lanes by length, more near the race (that is where they are seen); the twin bridge less (its
 // traffic comes over from the Via Expressa, and it leaves by the one lane the closures leave free at its island end).
 const table=list=>{const w=list.map(T=>T.len*(T.twin?.6:T.lapD<250?1:T.lapD<500?.6:.3)),cum=new Float64Array(list.length);let s=0;w.forEach((v,i)=>{s+=v;cum[i]=s;});return {list,cum,total:s};};
 const carTable=table(carTracks),busTable=table(busTracks.length?busTracks:carTracks);
 const pickTrack=(tb,r)=>{const x=r*tb.total;let lo=0,hi=tb.cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(tb.cum[m]<x)lo=m+1;else hi=m;}return tb.list[lo];};
 const nBus=Math.max(2,Math.round(COUNT*(mobile?.05:.06)));
 for(let i=0;i<COUNT;i++){
  let type='bus';if(i>=nBus){let r=rand();type='hatch';for(const [t,w] of MIX){if(r<w){type=t;break;}r-=w;}}
  const size=CITY_CAR_SIZE[type];
  vehicles.push({id:i,type,L:size.L,W:size.W,bus:type==='bus',moto:type==='moto',track:null,s:0,v:0,acc:0,v0k:1,T:HEADWAY,ei:0,zi:0,si:0,plan:null,group:-1,
   wait:0,stuck:0,stopUntil:0,stopZone:null,drawn:null,busStop:-1,dwell:0,brake:false,drl:false,sign:0,active:false,near:-1,
   paint:[1,1,1],rim:[1,1,1],accent:[1,1,1],shade:1,x:0,y:0,z:0,h:0,pitch:0,roll:0,kappa:0,dCam:0,why:"",whyZone:null});
 }
 stats.vehicles=COUNT;stats.buses=nBus;stats.motos=vehicles.filter(v=>v.moto).length;stats.cars=COUNT-nBus-stats.motos;

 // ---- The pose texture and the two merged geometries ----
 const near=mobile?{hatch:5,suv:4,sedan:4,small:3,compact:2,pickup:2,van:2,bus:2,moto:3}:lean?{hatch:8,suv:7,sedan:6,small:5,compact:3,pickup:3,van:3,bus:3,moto:5}:{hatch:14,suv:12,sedan:10,small:8,compact:5,pickup:5,van:5,bus:4,moto:9};
 const pool=[];for(const [type,n] of Object.entries(near))for(let k=0;k<n;k++)pool.push({type,row:0,vehicle:null});
 const BOATS=mobile?3:lean?4:7,rows=COUNT+pool.length+BOATS;
 const tex=new Float32Array(TEX_W*rows*4),dataTex=new THREE.DataTexture(tex,TEX_W,rows,THREE.RGBAFormat,THREE.FloatType);
 dataTex.minFilter=dataTex.magFilter=THREE.NearestFilter;dataTex.generateMipmaps=false;dataTex.needsUpdate=true;
 pool.forEach((p,k)=>p.row=COUNT+k);
 const uniforms={cityNight:{value:0}},atlas=destinationAtlas();
 const material=trafficMaterial(dataTex,atlas,uniforms),depthMaterial=trafficMaterial(dataTex,null,uniforms,true);
 const boatKinds=['lancha','baleeira','lancha','veleiro','baleeira','lancha','veleiro'].slice(0,BOATS);
 const nearList=[...pool.map(p=>[cityCarTemplate(p.type),p.row]),...boatKinds.map((k,b)=>[boatShape(k),COUNT+pool.length+b])];
 const farList=vehicles.map(v=>[cityCarTemplate(v.type,true),v.id]);
 const nearG=slotGeometry(nearList),farG=slotGeometry(farList);
 const mesh=(g,name,shadow)=>{const m=new THREE.Mesh(g.geometry,material);m.name=name;m.frustumCulled=false;m.castShadow=shadow;m.receiveShadow=true;m.matrixAutoUpdate=false;if(shadow)m.customDepthMaterial=depthMaterial;root.add(m);return m;};
 let lampPoints=null;
 mesh(nearG,'Transito_perto',!light);mesh(farG,'Transito_longe',false);
 // After dark, a moving street reads as its lamps: a point of light for each vehicle's headlamps (seen from ahead) and
 // tail lamps (from behind, brighter when braking), a few pixels wide however far, faded out near the camera (where the
 // model's own lamps show). Every vehicle drawn (row flag 8), one draw call, nothing by day.
 {const n=COUNT*2,P=new Float32Array(n*3),Sl=new Float32Array(n),Lp=new Float32Array(n);
  vehicles.forEach((v,i)=>{const z=v.bus?.95:v.moto?.95:v.type==='van'||v.type==='pickup'?.9:.72;for(const k of [0,1]){const j=i*2+k;P.set([k?-v.L/2:v.L/2,0,z],j*3);Sl[j]=v.id;Lp[j]=k?2:1;}});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('slot',new THREE.BufferAttribute(Sl,1));g.setAttribute('lamp',new THREE.BufferAttribute(Lp,1));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
  const m=new THREE.PointsMaterial({name:'Transito_farois',size:1,sizeAttenuation:false,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  m.onBeforeCompile=shader=>{
   shader.uniforms.trafficData={value:dataTex};Object.assign(shader.uniforms,uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+POSE_GLSL+'\nattribute float lamp;uniform float cityNight;varying float vLampK;varying vec3 vLampC;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\ntfSetup();transformed=tfPoint(position);')
    .replace('#include <fog_vertex>',`#include <fog_vertex>
{float f=tfQ.z,stage=floor(f/8.+.01),brk=mod(floor(f/2.+.01),2.);
 vec3 wp=(modelMatrix*vec4(transformed,1.)).xyz,fw=tfDir(vec3(1.,0.,0.));float facing=dot(fw,normalize(cameraPosition-wp))*(lamp<1.5?1.:-1.),dist=-mvPosition.z;
 float k=stage*cityNight*smoothstep(-.15,.45,facing)*smoothstep(30.,65.,dist);
 vLampK=k;vLampC=lamp<1.5?vec3(1.,.92,.76):vec3(1.,.07,.04)*(1.+brk*1.6);
 gl_PointSize=clamp(1400./dist,1.8,5.5);if(k<=.001)gl_Position=vec4(0.,0.,-2.,1.);}`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vLampK;varying vec3 vLampC;')
    .replace('#include <color_fragment>','#include <color_fragment>\n{float r=length(gl_PointCoord-.5);diffuseColor.rgb=vLampC*2.5;diffuseColor.a=vLampK*smoothstep(.5,.12,r);}');
  };
  m.customProgramCacheKey=()=>'city-traffic-lamps-v1';
  const pts=new THREE.Points(g,m);pts.name='Transito_farois';pts.frustumCulled=false;pts.matrixAutoUpdate=false;pts.renderOrder=2;pts.visible=false;root.add(pts);lampPoints=pts;}
 stats.trianglesNear=nearG.triangles;stats.trianglesFar=farG.triangles;stats.nearSlots=pool.length;

 const put=(row,i,a,b,c,d)=>{const o=(row*TEX_W+i)*4;tex[o]=a;tex[o+1]=b;tex[o+2]=c;tex[o+3]=d;};
 const look=(v,row)=>{put(row,2,v.paint[0],v.paint[1],v.paint[2],v.shade);put(row,3,v.rim[0],v.rim[1],v.rim[2],1);put(row,4,v.accent[0],v.accent[1],v.accent[2],1);};
 const JACKETS=[0x1d1f24,0x2b3346,0x50555a,0xa8c43a,0x7a1d22,0xc8541a,0x2a5aa8],BOXES=[0xc81d25,0xf4f1ea,0x1d1f22,0xe07a1a,0xd8b21a];
 const dress=v=>{
  const r=random((v.id+1)*7919+stats.respawns*31);
  if(v.bus){const k=r();v.paint=k<.6?lin(0xf2f2ee):k<.85?lin(0xe8e2d0):lin(0xd8dde2);v.rim=lin(0x9a9da0);v.accent=lin([0x1f5fb0,0x2f8a3c,0xe06a14,0xc8202a,0x6b3fa0][Math.floor(r()*5)]);v.sign=Math.floor(r()*DESTS.length);v.drl=true;}
  else if(v.moto){v.paint=lin([0xf2f2ef,0xc81d25,0x1d1f22,0xd8b21a,0x2a5aa8][Math.floor(r()*5)]);v.rim=lin(JACKETS[Math.floor(r()*JACKETS.length)]);v.accent=lin(BOXES[Math.floor(r()*BOXES.length)]);v.drl=true;}
  else{v.paint=carPaint(r);v.rim=rimColor(r);v.accent=lin(0x2a2a2a);v.drl=r()<.35;}
  v.shade=.9+r()*.12;v.v0k=(v.moto?1.08:v.bus?.85:1)*(.86+r()*.26);v.T=HEADWAY*(.8+r()*.5)*(v.moto?.8:1);look(v,v.id);};

 // ---- Camera: distance (through the lens, as street-closures.js does) and the view frustum ----
 const eye=new THREE.Vector3(),frustum=new THREE.Frustum(),viewProj=new THREE.Matrix4(),sphere=new THREE.Sphere();
 let haveCam=false,zoom=1;
 const LENS_REF=Math.tan(29*Math.PI/180),NEAR=mobile?80:lean?110:140,FAR=mobile?650:lean?850:1150;
 const visibleAt=(x,y,z,r)=>{if(!haveCam)return false;sphere.center.set(x,z+1,-y);sphere.radius=r;return frustum.intersectsSphere(sphere);};
 const camDist=(x,y,z)=>haveCam?Math.hypot(x-eye.x,z-eye.y,-y-eye.z):1e9;
 // Somewhere nobody is looking: far from the eye, or out of the view and not too near.
 const hidden=(x,y,z)=>{if(!haveCam)return true;const d=camDist(x,y,z);return d>280||(d>90&&!visibleAt(x,y,z,16));};

 // ---- Tracks: vehicles in order of s; moving between them keeps the order ----
 const insert=(T,v)=>{const l=T.vehicles;let i=l.length;l.push(v);while(i>0&&l[i-1].s>v.s){l[i]=l[i-1];i--;}l[i]=v;};
 const remove=(T,v)=>{const l=T.vehicles,i=l.indexOf(v);if(i<0)return;for(let k=i;k<l.length-1;k++)l[k]=l[k+1];l.length--;};
 const firstExit=(T,s)=>{let i=0;while(i<T.exits.length&&T.exits[i].s0<=s)i++;return i;};
 const firstZone=(T,s)=>{let i=0;while(i<T.zones.length&&T.zones[i].sOut<s)i++;return i;};
 const enter=(v,T,s)=>{v.track=T;v.s=s;insert(T,v);v.ei=firstExit(T,s);v.zi=firstZone(T,s-v.L/2);v.plan=null;v.group=-1;v.si=0;v.busStop=-1;
  if(v.bus){let k=0;while(k<T.stops.length&&T.stops[k]<s+5)k++;v.busStop=k<T.stops.length?k:-1;}};
 const free=(T,s,gap)=>{for(const o of T.vehicles)if(Math.abs(o.s-s)<gap)return false;for(const z of T.zones)if(s>z.sIn-8&&s<z.sOut+8)return false;return true;};
 function spawn(v,init=false){
  for(let tries=0;tries<(init?40:10);tries++){
   const T=pickTrack(v.bus?busTable:carTable,rand()),lim=Math.min(T.len,T.lastExit)-8;if(lim<12)continue;
   const s=6+rand()*(lim-6),p=net.sample(T,s);if(!init&&!hidden(p.x,p.y,p.z))continue;if(!free(T,s,v.L+14))continue;
   if(v.track)remove(v.track,v);dress(v);enter(v,T,s);v.v=Math.min(T.VL[Math.min(T.n-1,Math.round(s/STEP))],T.v0*v.v0k)*(init?.4+rand()*.5:.8);v.wait=v.stuck=0;v.stopUntil=0;v.dwell=0;v.active=true;
   if(!init)stats.respawns++;return true;
  }
  return false;
 }
 for(const v of vehicles)spawn(v,true);

 // ---- Driving ----
 let time=0;
 // The intelligent-driver model's braking term for something gap metres ahead moving at vo.
 const idm=(v,gap,vo)=>{const dv=v.v-vo,ss=GAP0+Math.max(0,v.v*v.T+v.v*dv/(2*Math.sqrt(A_MAX*B_COMF)));return -A_MAX*(ss/Math.max(gap,.1))**2;};
 // Allowed now to be at speed vc within dist metres: braking toward it at the comfortable rate.
 const capAcc=(v,dist,vc)=>{if(v.v<=vc)return 9;const d=Math.max(dist,.3);return (vc*vc-v.v*v.v)/(2*d);};
 // Vehicles ahead on the way the car will take: the rest of its track, the connector it chose and the lane after it.
 const LG={gap:1e9,v:0},gapIs=(g,vo)=>{LG.gap=g;LG.v=vo;return LG;};
 function leaderGap(v){
  const T=v.track,l=T.vehicles,i=l.indexOf(v),front=v.s+v.L/2;
  if(i+1<l.length){const o=l[i+1];return gapIs(o.s-o.L/2-front,o.v);}
  let base=0,S=null,from=0;
  if(v.plan){base=v.plan.s0-v.s;S=v.plan.conn;from=0;}else if(T.connector){const x=T.exits[0];base=T.len-v.s;S=x.to;from=x.entry;}
  if(!S||base>90)return gapIs(1e9,0);
  for(let hop=0;hop<2&&S;hop++){
   let best=null;for(const o of S.vehicles)if(o.s>=from-o.L/2&&(!best||o.s<best.s))best=o;
   if(best)return gapIs(base+best.s-from-best.L/2-v.L/2,best.v);
   if(S.connector){base+=S.len-from;const x=S.exits[0];S=x.to;from=x.entry;}else break;
  }
  return gapIs(1e9,0);
 }
 function decide(v){
  // The next group of exits: choose one of them (or carry on) a little before it.
  const T=v.track;if(T.connector||v.plan||v.ei>=T.exits.length)return;const g=T.exits[v.ei].group,s0=T.exits[v.ei].s0;
  if(s0-v.s>Math.max(30,v.v*4))return;
  const opts=[];for(let k=v.ei;k<T.exits.length&&T.exits[k].group===g;k++){const x=T.exits[k];if(x.to.bus&&!v.bus)continue;opts.push(x);}
  const atEnd=s0>=T.len-8,forced=atEnd||s0>=T.lastExit-1;
  let choice=null;
  if(opts.length&&(forced||rand()<.28)){let total=0;for(const x of opts)total+=x.turn==='straight'?3:1;let r=rand()*total;for(const x of opts){r-=x.turn==='straight'?3:1;if(r<=0){choice=x;break;}}choice??=opts[0];}
  if(choice)v.plan=choice;else{while(v.ei<T.exits.length&&T.exits[v.ei].group===g)v.ei++;}
 }
 const ZR={acc:0,hold:Infinity},ZQ=Array.from({length:24},()=>({z:null,dIn:0,stream:0,rank:0,major:false})),zq={n:0};
 // The zones of lane T ahead of the car (base: metres from its front to the lane's s = 0; own: the lane it is on, where it
 // holds the zones it is inside): the caution there (blinking amber: every car slows, some stop a moment; a minor approach
 // slows) and the ones near enough to claim, gathered for zoneTurn.
 function zonesOn(v,T,start,base,own){
  for(let j=start;j<T.zones.length;j++){
   const e=T.zones[j],z=e.zone,dIn=base+e.sIn;if(dIn>70)break;if(base+e.sOut+v.L<0)continue;
   if(dIn<=0){if(own){z.holder=T.stream;z.holdUntil=time+.35;z.holdRank=T.rank;}continue;}
   const cap=z.signal?4.6:e.major?99:6;if(cap<99)ZR.acc=Math.min(ZR.acc,capAcc(v,dIn,cap));
   if(z.signal&&v.stopZone!==z){v.stopZone=z;v.stopUntil=rand()<.3?-(.6+rand()*1.2):0;}
   if(z.signal&&v.stopZone===z&&v.stopUntil<0&&dIn<6){if(v.v<.3)v.stopUntil=time-v.stopUntil;else ZR.hold=Math.min(ZR.hold,dIn-1);}
   if(z.signal&&v.stopZone===z&&v.stopUntil>time)ZR.hold=Math.min(ZR.hold,dIn-1);
   if(dIn>(e.major?v.v*3.5+8:v.v*v.v/(2*B_COMF)+4)||zq.n>=ZQ.length)continue;
   const q=ZQ[zq.n++];q.z=z;q.dIn=dIn;q.stream=T.stream;q.rank=T.rank;q.major=e.major;
  }
 }
 // Who goes: the zones ahead are taken all at once or not at all (a car never holds one while waiting for the next, so two
 // never wait for each other); one held by another stream (a minor one gives way to the bigger street's cars still coming)
 // stops the car before the first of them, unless it can no longer stop; after six seconds waiting it takes its turn.
 function zoneTurn(v,dt){
  if(!zq.n)return;let busy=null,first=Infinity;const stopDist=v.v*v.v/(2*B_MAX)+.5;
  for(let i=0;i<zq.n;i++){const q=ZQ[i],z=q.z;first=Math.min(first,q.dIn);
   const held=z.holder>=0&&z.holder!==q.stream&&z.holdUntil>time&&!(q.major&&z.holdRank<q.rank-.25&&z.holdUntil-time<.3),forced=z.force>=0&&z.force!==q.stream&&z.forceUntil>time;
   if((held||forced)&&!busy)busy=q;}
  if(busy&&first>stopDist){ZR.hold=Math.min(ZR.hold,first-1.2);v.why=busy.z.signal?'zona-sinal':'zona';v.whyZone=busy.z;if(v.v<.5&&first<8&&(v.wait+=dt)>6){busy.z.force=busy.stream;busy.z.forceUntil=time+3;}return;}
  for(let i=0;i<zq.n;i++){const q=ZQ[i],z=q.z;z.holder=q.stream;z.holdUntil=time+Math.max(.35,Math.min(3,q.dIn/Math.max(v.v,2)+.5));z.holdRank=q.rank;}
 }
 function accelerate(v,dt){
  const T=v.track,front=v.s+v.L/2,v0=Math.min(T.v0*v.v0k,30);
  let acc=A_MAX*(1-(v.v/Math.max(v0,.5))**4);
  // The bends here and ahead (the profile already brakes for them), and the connector's start if it turns.
  const k=Math.min(T.n-1,Math.max(0,Math.round(v.s/STEP)));acc=Math.min(acc,capAcc(v,1,T.VL[k]));
  if(v.plan){const C=v.plan.conn;acc=Math.min(acc,capAcc(v,v.plan.s0-v.s,C.VL[0]),capAcc(v,v.plan.s0-v.s+C.len*.5,C.VL[C.n>>1]));}
  v.why='';const lg=leaderGap(v);if(lg.gap<8)v.why='fila';if(lg.gap<200)acc=Math.min(acc,A_MAX*(1-(v.v/Math.max(v0,.5))**4)+idm(v,lg.gap,lg.v));
  // The end of a lane with no way out chosen (should not happen) or a way out of the map: stop there.
  if(!v.plan&&!T.connector&&!T.sink)acc=Math.min(acc,A_MAX+idm(v,T.len-front,0));
  // A bus stop on its lane: stop, wait, go on.
  if(v.bus&&v.busStop>=0){const sb=T.stops[v.busStop];if(sb-v.s<60){if(v.dwell>0)acc=Math.min(acc,-B_MAX);else acc=Math.min(acc,A_MAX+idm(v,sb-v.s+GAP0,0));}}
  // Conflict zones ahead, on its lane and on the way it chose (the connector, the lane after it): who goes first, and the
  // caution there.
  ZR.acc=acc;ZR.hold=Infinity;zq.n=0;zonesOn(v,T,v.zi,-front,true);
  if(v.plan)zonesOn(v,v.plan.conn,0,v.plan.s0-front,false);
  else if(T.connector){const x=T.exits[0];zonesOn(v,x.to,firstZone(x.to,x.entry),T.len-front-x.entry,false);}
  zoneTurn(v,dt);acc=ZR.acc;const holdAt=ZR.hold;
  if(holdAt<Infinity)acc=Math.min(acc,A_MAX+idm(v,holdAt+GAP0,0));else v.wait=0;
  return Math.max(-B_MAX,Math.min(A_MAX,acc));
 }
 function advance(v,dt){
  const T=v.track;let s=v.s+v.v*dt;
  // Never into the car ahead on the same lane.
  const l=T.vehicles,i=l.indexOf(v);if(i+1<l.length){const o=l[i+1],lim=o.s-o.L/2-v.L/2-.4;if(s>lim){s=Math.max(v.s,lim);v.v=Math.min(v.v,o.v);}}
  v.s=s;
  while(v.zi<T.zones.length&&T.zones[v.zi].sOut<v.s-v.L/2)v.zi++;
  if(v.bus&&v.busStop>=0){const sb=T.stops[v.busStop];if(v.dwell>0){v.dwell-=dt;if(v.dwell<=0){v.dwell=0;v.busStop=v.busStop+1<T.stops.length?v.busStop+1:-1;}}else if(v.s>sb-1&&v.v<.4)v.dwell=7+rand()*10;else if(v.s>sb+4)v.busStop=v.busStop+1<T.stops.length?v.busStop+1:-1;}
  if(v.plan&&v.s>=v.plan.s0){const x=v.plan,over=v.s-x.s0;remove(T,v);enter(v,x.conn,over);return;}
  if(T.connector&&v.s>=T.len){const x=T.exits[0],over=v.s-T.len;remove(T,v);enter(v,x.to,x.entry+over);return;}
  if(!v.plan&&v.ei<T.exits.length&&v.s>T.exits[v.ei].s0)v.ei++;
  if(v.s>=T.len){if(hidden(v.x,v.y,v.z))spawn(v)||(v.active=false,remove(T,v),v.track=null);else{v.s=T.len;v.v=0;}}
 }
 // Pose on the lane: position, heading, pitch from the slope (and the nose dipping under braking), roll in the bends.
 function pose(v){
  const T=v.track,s=Math.max(0,Math.min(T.len,v.s));let k=Math.min(Math.max(0,Math.floor(s/STEP)),T.n-2);
  while(k>0&&T.C[k]>s)k--;while(k<T.n-2&&T.C[k+1]<s)k++;const u=Math.max(0,Math.min(1,(s-T.C[k])/((T.C[k+1]-T.C[k])||1)));
  v.x=T.X[k]+(T.X[k+1]-T.X[k])*u;v.y=T.Y[k]+(T.Y[k+1]-T.Y[k])*u;v.z=T.Z[k]+(T.Z[k+1]-T.Z[k])*u;
  const hx=T.HX[k]+(T.HX[k+1]-T.HX[k])*u,hy=T.HY[k]+(T.HY[k+1]-T.HY[k])*u,h=Math.atan2(hy,hx);
  const k0=Math.max(0,k-1),k1=Math.min(T.n-1,k+2),dh=wrapA(Math.atan2(T.HY[k1],T.HX[k1])-Math.atan2(T.HY[k0],T.HX[k0]));v.kappa=dh/((T.C[k1]-T.C[k0])||1);
  const wb=v.L*.3,za=T.Z[Math.min(T.n-1,k+Math.max(1,Math.round(wb/STEP)))],zb=T.Z[Math.max(0,k-Math.max(1,Math.round(wb/STEP))+1)],da=T.C[Math.min(T.n-1,k+Math.max(1,Math.round(wb/STEP)))]-T.C[Math.max(0,k-Math.max(1,Math.round(wb/STEP))+1)];
  v.h=h;v.pitch=Math.atan2(za-zb,da||1)+Math.max(-.025,Math.min(.025,v.acc*.0045));v.roll=v.moto?-Math.max(-.5,Math.min(.5,Math.atan(v.v*v.v*v.kappa/9.8))):Math.max(-.035,Math.min(.035,v.v*v.v*v.kappa*.006));
 }

 // ---- Boats: long loops on open water, clear of the decks, the shore and the anchored boats (sea-water.js) ----
 const boats=[],level=data.meta.sea_level_m??0,tg=data.terrain;
 {const depth=(x,y)=>{const fx=(x-tg.x0)/tg.step,fy=(y-tg.y0)/tg.step;if(fx<1||fy<1||fx>tg.nx-2||fy>tg.ny-2)return -1;return level-tg.z[Math.round(fy)*tg.nx+Math.round(fx)];};
  const deckPts=data.samples.filter((p,i)=>i%5===0&&p[3]-(level-depth(p[1],p[2]))>8).map(p=>[p[1],p[2]]);
  for(const p of twinPoints(data))deckPts.push(p);
  const anchored=seaWaterBoats(data,level,mobile);
  const open=(x,y)=>depth(x,y)>3&&[[22,0],[-22,0],[0,22],[0,-22]].every(([dx,dy])=>depth(x+dx,y+dy)>1.5)&&deckPts.every(([px,py])=>(px-x)**2+(py-y)**2>85*85)&&anchored.every(([px,py])=>(px-x)**2+(py-y)**2>30*30);
  const br=random(3301),x1=tg.x0+(tg.nx-1)*tg.step,y1=tg.y0+(tg.ny-1)*tg.step;
  for(let b=0;b<BOATS;b++){
   const kind=boatKinds[b],sail=kind==='veleiro';
   for(let t=0;t<1500;t++){
    const cx=tg.x0+br()*(x1-tg.x0),cy=tg.y0+br()*(y1-tg.y0);if(!open(cx,cy))continue;
    const big=1-t/1900,ra=(80+br()*220)*big,rb=(40+br()*100)*big,rot=br()*Math.PI,wob=br()*6,n=72,pts=[];let ok=true;
    for(let k=0;k<n&&ok;k++){const t2=k/n*Math.PI*2,m=1+.12*Math.sin(t2*2+wob)+.06*Math.sin(t2*3+wob*2),ex=Math.cos(t2)*ra*m,ey=Math.sin(t2)*rb*m,x=cx+ex*Math.cos(rot)-ey*Math.sin(rot),y=cy+ex*Math.sin(rot)+ey*Math.cos(rot);ok=open(x,y);pts.push([x,y]);}
    if(!ok||boats.some(o=>Math.hypot(o.cx-cx,o.cy-cy)<ra+60))continue;
    const C=[0];for(let k=1;k<=n;k++){const p=pts[k-1],q=pts[k%n];C.push(C[k-1]+Math.hypot(q[0]-p[0],q[1]-p[1]));}
    const r=random(b*977+13),hull=kind==='baleeira'?lin([0x1a5ac0,0xc8201a,0xf0c018,0x1a8c50,0x2a9ad0,0xe8e4d8][Math.floor(r()*6)]):kind==='lancha'?lin(r()<.7?0xf4f4f0:0x1c2a44):lin(r()<.75?0xf4f4f0:0x1c2a44);
    boats.push({kind,row:COUNT+pool.length+b,pts,C,len:C[n],cx,cy,u:br()*C[n],dir:br()<.5?1:-1,speed:sail?1.3+br()*.8:kind==='baleeira'?2.6+br()*1.4:4.5+br()*3.5,
     beam:kind==='veleiro'?2.9:2.5,L:kind==='baleeira'?8.5:kind==='veleiro'?9:7,phase:br()*10,
     paint:hull,accent:kind==='veleiro'?lin(0xf2efe6):kind==='baleeira'?lin([0xf4f2ea,0xd8402a,0x2a4a8a][Math.floor(r()*3)]):lin([0x1c3a6e,0xe8e2d4,0x2a6a8a][Math.floor(r()*3)]),rim:lin([0x2a3346,0xc0392b,0xe8e4da,0x3d7a4a][Math.floor(r()*4)]),
     x:0,y:0,h:0,trail:new Float32Array(2*30),trailN:0,trailAt:0,heel:sail?(br()<.5?1:-1)*(.08+br()*.06):0});
    break;
   }
  }
  for(const b of boats){put(b.row,2,b.paint[0],b.paint[1],b.paint[2],1);put(b.row,3,b.rim[0],b.rim[1],b.rim[2],1);put(b.row,4,b.accent[0],b.accent[1],b.accent[2],1);}
  stats.boats=boats.length;
 }
 // Hide the rows of boats that found no water to sail.
 for(let b=boats.length;b<BOATS;b++)put(COUNT+pool.length+b,1,0,0,0,0);
 const BP={x:0,y:0},boatAt=(b,u)=>{const n=b.pts.length;u=((u%b.len)+b.len)%b.len;let k=0;while(k<n-1&&b.C[k+1]<u)k++;const p=b.pts[k],q=b.pts[(k+1)%n],f=(u-b.C[k])/((b.C[k+1]-b.C[k])||1);BP.x=p[0]+(q[0]-p[0])*f;BP.y=p[1]+(q[1]-p[1])*f;return BP;};
 // Wakes: a churned trail behind the stern widening with distance, and the two arms of the V (Kelvin's 19.5°) spreading out.
 const TRAIL=30,wakeV=boats.length*TRAIL*6,wakePos=new Float32Array(wakeV*3),wakeCol=new Float32Array(wakeV*4),wakeIdx=[];
 for(let b=0;b<boats.length;b++)for(let j=0;j<TRAIL-1;j++)for(let s=0;s<3;s++){const a0=(b*TRAIL+j)*6+s*2,a1=a0+6;wakeIdx.push(a0,a0+1,a1,a0+1,a1+1,a1);}
 const wakeG=new THREE.BufferGeometry();wakeG.setAttribute('position',new THREE.BufferAttribute(wakePos,3).setUsage(THREE.DynamicDrawUsage));wakeG.setAttribute('color',new THREE.BufferAttribute(wakeCol,4).setUsage(THREE.DynamicDrawUsage));
 wakeG.setIndex(wakeIdx);wakeG.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
 const wakeMat=new THREE.MeshStandardMaterial({name:'Esteira_barcos',color:0xffffff,vertexColors:true,transparent:true,depthWrite:false,roughness:.85,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
 wakeMat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWake;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWake=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vWake;float wHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wHash(i),wHash(i+vec2(1,0)),f.x),mix(wHash(i+vec2(0,1)),wHash(i+vec2(1,1)),f.x),f.y);}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
// Foam in streaks and blobs: the alpha broken by noise at two sizes.
// (the colour's red channel carries the place across the strip: 0 one edge, 1 the other, for soft edges)
{vec2 p=vec2(vWake.x,-vWake.z);float n=wNoise(p*1.3)*.55+wNoise(p*4.1)*.3+wNoise(p*11.)*.15,a=diffuseColor.a,u=vColor.r;
diffuseColor.a=a*pow(sin(3.14159*clamp(u,0.,1.)),.8)*smoothstep(.35-.25*a,.75-.25*a,n);diffuseColor.rgb=vec3(.92);}`);
 };
 wakeMat.customProgramCacheKey=()=>'city-traffic-wake-v1';
 const wake=new THREE.Mesh(wakeG,wakeMat);wake.name='Esteira_barcos';wake.frustumCulled=false;wake.renderOrder=1;wake.receiveShadow=false;
 if(boats.length){root.add(wake);stats.wakes=boats.length;}

 function moveBoats(dt){
  for(let b=0;b<boats.length;b++){
   const B=boats[b];
   // Slowing when another boat is close ahead.
   let k=1;for(const o of boats)if(o!==B){const dx=o.x-B.x,dy=o.y-B.y,d=Math.hypot(dx,dy);if(d<40&&dx*Math.cos(B.h)+dy*Math.sin(B.h)>0)k=Math.min(k,Math.max(.2,(d-15)/25));}
   B.u+=B.dir*B.speed*k*dt;const q0=boatAt(B,B.u),x=q0.x,y=q0.y,q1=boatAt(B,B.u+B.dir*4);B.x=x;B.y=y;B.h=Math.atan2(q1.y-y,q1.x-x);
   const w=time*(B.kind==='lancha'?.9:.6)+B.phase,heave=Math.sin(w)*.06+Math.sin(w*1.7+1)*.03,pitch=Math.sin(w*1.21)*.025+(B.kind==='lancha'?.05:B.kind==='baleeira'?.02:0),roll=Math.sin(w*.83+1.3)*.035+B.heel;
   put(B.row,0,x,y,level+heave+(B.kind==='lancha'?.08:0),B.h);put(B.row,1,pitch,roll,1,0);
   // Trail: a point every 2.5 m travelled.
   const tr=B.trail;if(!B.trailN||Math.hypot(x-tr[0],y-tr[1])>2.5){for(let j=Math.min(B.trailN,TRAIL-1);j>0;j--){tr[j*2]=tr[j*2-2];tr[j*2+1]=tr[j*2-1];}tr[0]=x;tr[1]=y;B.trailN=Math.min(TRAIL,B.trailN+1);}
   const sx=x-Math.cos(B.h)*B.L*.45,sy=y-Math.sin(B.h)*B.L*.45,fast=Math.min(1,B.speed*k/5);
   for(let j=0;j<TRAIL;j++){
    const has=j<B.trailN,px=j?tr[j*2]:sx,py=j?tr[j*2+1]:sy,qx=has?tr[Math.max(0,j-1)*2]:px,qy=has?tr[Math.max(0,j-1)*2+1]:py,j2=Math.min(B.trailN-1,j+1);
    let tx=j?qx-tr[j2*2]:Math.cos(B.h),ty=j?qy-tr[j2*2+1]:Math.sin(B.h);const tl=Math.hypot(tx,ty)||1;tx/=tl;ty/=tl;
    const d=j*2.5,age=d/(TRAIL*2.5),fade=has?Math.pow(1-age,1.8)*Math.min(1,(B.trailN-1-j)/4):0,nx=-ty,ny=tx;
    // Three strips: the churned trail (centre) and the arms of the V either side.
    for(let s=0;s<3;s++){const arm=B.beam*.45+d*.34,o=s===0?0:s===1?arm:-arm,hw=s?.22+d*.012:B.beam*.3+d*.05,al=s?.3*fade*fast:.55*fade*(.25+.75*fast);for(let e=0;e<2;e++){const q=((b*TRAIL+j)*6+s*2+e),off=o+(e?hw:-hw);wakePos[q*3]=px+nx*off;wakePos[q*3+1]=level+.03;wakePos[q*3+2]=-(py+ny*off);wakeCol[q*4]=e;wakeCol[q*4+1]=wakeCol[q*4+2]=1;wakeCol[q*4+3]=al;}}
   }
  }
  wakeG.attributes.position.needsUpdate=true;wakeG.attributes.color.needsUpdate=true;
 }

 // ---- Per frame: drive, pick who is drawn near (full model) and far (box), write the rows ----
 const cand=[];
 function update(dt,camera){
  const t1=performance.now();time+=dt;
  if(camera){eye.setFromMatrixPosition(camera.matrixWorld);viewProj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProj);haveCam=true;
   zoom=camera.isPerspectiveCamera?Math.min(1,Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1)/LENS_REF):1;}
  if(dt>0){
   const h=Math.min(dt,.1);
   for(const v of vehicles)if(v.active){decide(v);v.acc=accelerate(v,h);}
   for(const v of vehicles)if(v.active){v.v=Math.max(0,v.v+v.acc*h);advance(v,h);if(v.v<.2&&v.dwell<=0)v.stuck+=h;else v.stuck=0;if(v.stuck>40&&hidden(v.x,v.y,v.z))spawn(v);}
   for(const v of vehicles)if(!v.active)spawn(v);
   moveBoats(h);
  }
  // Drawn: in view and within reach; the nearest of each type get the full models.
  let nf=0,braking=0,waiting=0,twin=0;cand.length=0;
  for(const v of vehicles){
   if(!v.active||!v.track){put(v.id,1,0,0,0,0);continue;}
   pose(v);v.brake=v.acc<-1.1||v.v<.3;if(v.brake)braking++;if(v.v<.3)waiting++;if(v.track.twin)twin++;
   put(v.id,0,v.x,v.y,v.z,v.h);
   const d=camDist(v.x,v.y,v.z)*zoom,show=d<FAR&&visibleAt(v.x,v.y,v.z,v.L/2+1.5);v.dCam=d;
   if(show&&d<NEAR)cand.push(v);
   const flags=(show?9:0)+(v.brake?2:0)+(v.drl?4:0);put(v.id,1,v.pitch,v.roll,flags,v.sign);if(show)nf++;
  }
  // (insertion sort by distance: a few dozen at most, no allocation)
  for(let i=1;i<cand.length;i++){const c=cand[i];let j=i-1;while(j>=0&&cand[j].dCam>c.dCam){cand[j+1]=cand[j];j--;}cand[j+1]=c;}
  for(const p of pool)p.next=null;
  let nn=0;
  for(const v of cand){let slot=null;for(const p of pool)if(p.type===v.type&&!p.next&&(p.vehicle===v||!slot))slot=p.vehicle===v?p:slot??p;
   if(!slot)continue;slot.next=v;nn++;const flags=1+(v.brake?2:0)+(v.drl?4:0);put(v.id,1,v.pitch,v.roll,8+(v.brake?2:0)+(v.drl?4:0),v.sign);nf--;
   put(slot.row,0,v.x,v.y,v.z,v.h);put(slot.row,1,v.pitch,v.roll,flags,v.sign);}
  for(const p of pool){if(p.next&&p.next!==p.vehicle)look(p.next,p.row);if(!p.next)put(p.row,1,0,0,0,0);p.vehicle=p.next;}
  if(dt>0||camera)dataTex.needsUpdate=true;
  stats.near=nn;stats.far=nf;stats.onTwin=twin;stats.braking=braking;stats.waiting=waiting;
  stats.drawCalls=(nn||boats.length?1:0)+(nf?1:0)+(boats.length?1:0)+(lampPoints?.visible?1:0);
  stats.updateMs=Math.round((stats.updateMs*.95+(performance.now()-t1)*.05)*1000)/1000;stats.triangles=stats.trianglesNear+(nf?stats.trianglesFar:0);
 }
 update(0,null);
 stats.buildMs=Math.round(performance.now()-t0);
 if(typeof window!=='undefined')window.interlagosTransito={stats:()=>stats,road:(x,y)=>map?map.distance('road',x,y):-1,
  vehicles:()=>vehicles.filter(v=>v.active&&v.track).map(v=>({why:v.why,zone:v.why.startsWith('zona')?v.whyZone.id:-1,x:+v.x.toFixed(2),y:+v.y.toFixed(2),z:+v.z.toFixed(2),h:+v.h.toFixed(3),v:+v.v.toFixed(2),L:v.L,W:v.W,type:v.type,twin:!!v.track.twin,deck:!!v.track.deck,conn:!!v.track.connector,kind:v.track.kind,brake:v.brake})),
  boats:()=>boats.map(b=>({x:+b.x.toFixed(1),y:+b.y.toFixed(1),h:+b.h.toFixed(3),kind:b.kind})),
  network:()=>({tracks:tracks.map(T=>({twin:T.twin,kind:T.kind,pts:Array.from({length:Math.ceil(T.n/3)},(_,i)=>{const k=Math.min(T.n-1,i*3);return [+T.X[k].toFixed(1),+T.Y[k].toFixed(1)];})})),zones:zones.map(z=>[+z.x.toFixed(1),+z.y.toFixed(1),z.signal?1:0])})};
 return {root,stats,update,setNight(level){uniforms.cityNight.value=level;if(lampPoints)lampPoints.visible=level>0;}};
}

// The twin bridge's axis (track frame), for keeping the boats clear of its piers.
function twinPoints(data){const tw=(data.scenery?.bridges??[]).find(b=>b.kind==='colombo_salles')?.twin;return (tw?.points??[]).filter((p,i)=>i%3===0).map(p=>[p[0],p[1]]);}
// The boats of sea-water.js (its own seeded draw, repeated here to keep the moving ones clear of them): the anchored ones'
// spots and the lines the three under way run back and forth on, as points every 10 m.
function seaWaterBoats(data,level,mobile){
 const t=data.terrain,rand=random(4801),out=[],items=[];
 const depth=(x,y)=>{const fx=(x-t.x0)/t.step,fy=(y-t.y0)/t.step;if(fx<1||fy<1||fx>t.nx-2||fy>t.ny-2)return -1;const i=Math.round(fx),j=Math.round(fy);return level-t.z[j*t.nx+i];};
 const deckPts=data.samples.filter((p,i)=>i%5===0&&p[3]-(level-depth(p[1],p[2]))>8).map(p=>[p[1],p[2]]);
 const open=(x,y)=>depth(x,y)>2.5&&[[18,0],[-18,0],[0,18],[0,-18]].every(([dx,dy])=>depth(x+dx,y+dy)>1.5)&&deckPts.every(([px,py])=>Math.hypot(px-x,py-y)>70);
 const count=mobile?14:34,x1=t.x0+(t.nx-1)*t.step,y1=t.y0+(t.ny-1)*t.step,W=[.42,.38,.2];
 for(let tries=0;items.length<count&&tries<20000;tries++){
  const x=t.x0+rand()*(x1-t.x0),y=t.y0+rand()*(y1-t.y0);if(!open(x,y)||items.some(b=>Math.hypot(b[0]-x,b[1]-y)<35))continue;
  let r=rand(),k=0;while(k<W.length-1&&r>W[k]){r-=W[k];k++;}
  for(let n=0;n<6;n++)rand();if(k===0)rand();items.push([x,y]);
 }
 out.push(...items);
 let moving=0;
 for(const b of items){if(moving>=3)break;
  for(let tries=0;tries<40;tries++){const a=rand()*Math.PI*2,len=260+rand()*300,ex=b[0]+Math.cos(a)*len,ey=b[1]+Math.sin(a)*len;let ok=true;for(let u=0;u<=1;u+=.05)if(!open(b[0]+(ex-b[0])*u,b[1]+(ey-b[1])*u)){ok=false;break;}
   if(ok){rand();rand();for(let d=0;d<=len;d+=10)out.push([b[0]+Math.cos(a)*d,b[1]+Math.sin(a)*d]);moving++;break;}}
 }
 return out;
}
