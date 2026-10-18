import {TestCar,onDeck,inTunnel,guardrailClearance} from './physics.js';
import {pitGeometry,locatePit,wallsNear} from './pit-lane.js';
import {cliffEdge} from './cliff-edge.js';
import {branchLayouts,branchBands,branchRoadZ,stationZ,branchKerbSegment} from './branch-layout.js';

// What has to stay clear on the surveyed circuit: the ground below everything
// paved or built, and the scenery off the roads, garages and grandstands.
// Plain data, shared by the game and the Node checks.

// The ground stays this far below the road plane; asphalt is drawn 3.5-4 cm above it.
export const GROUND_CLEARANCE=.07;
// Garage block and canopy behind the working lane of the pits.
const GARAGE_DEPTH=21.5,GARAGE_CANOPY=23;
const steps=(a,b,d)=>{const n=Math.max(1,Math.ceil((b-a)/d-1e-9)),out=[];for(let k=0;k<=n;k++)out.push(a+(b-a)*k/n);return out;};
const columns=table=>Object.fromEntries(table.columns.map((k,i)=>[k,i]));

function station(data,s){
 const a=data.samples,L=data.meta.reconstructed_xy_m;s=((s%L)+L)%L;
 let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}
 const p=a[lo],q=a[(lo+1)%a.length],u=Math.min(1,(s-p[0])/((lo===a.length-1?L:q[0])-p[0])),m=k=>p[k]+(q[k]-p[k])*u;
 const tl=Math.hypot(m(7),m(8));
 return {s,i:lo,x:m(1),y:m(2),z:m(3),width:m(4),bank:m(5),tx:m(7)/tl,ty:m(8)/tl,lx:-m(8)/tl,ly:m(7)/tl};
}
function pitStation(pit,s){
 const c=columns(pit),a=pit.samples;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][c.s]<=s)lo=m;else hi=m-1;}
 const i=Math.min(a.length-2,lo),p=a[i],q=a[i+1],u=Math.max(0,Math.min(1,(s-p[c.s])/(q[c.s]-p[c.s]))),m=k=>p[k]+(q[k]-p[k])*u;
 return {x:m(c.x),y:m(c.y),z:m(c.z),bank:m(c.bank),lx:m(c.lx),ly:m(c.ly),lo:m(c.lo),hi:m(c.hi)};
}

// --- Grandstands on the outside of the main straight, before the finish line.
// The 2017 LiDAR shows the stand there as an ~8.5 m bank: 19 rows climb to its
// top under a cantilever roof. l runs away from the track, a along it.
export const STAND=Object.freeze({blocks:6,length:28,firstS:204,rows:19,tread:.85,rise:.42,first:.55,parapet:1.1,wall:.3,gap:12,apron:5.5,roofClear:3.9,roofSlope:.07,overhang:1.8});
// Circuits built from open data list their own stands (data.scenery.stands): how far
// before the finish line the first block starts, how many blocks, the side (-1 right,
// 1 left) and the gap from the road edge. Interlagos keeps its surveyed stand.
function standSpecs(data){
 if(data.scenery)return data.scenery.stands??[];
 if(data.meta?.id==='curvelo'||!data.pit)return [];
 return [{first_s:STAND.firstS,blocks:STAND.blocks,side:-1,gap:STAND.gap}];
}
export function standLayout(data){
 const L=data.meta.reconstructed_xy_m,blocks=[],t=data.terrain;
 const lidar=(x,y)=>{const fx=Math.max(0,Math.min(t.nx-1.001,(x-t.x0)/t.step)),fy=Math.max(0,Math.min(t.ny-1.001,(y-t.y0)/t.step)),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,k=j*t.nx+i;return (t.z[k]*(1-u)+t.z[k+1]*u)*(1-v)+(t.z[k+t.nx]*(1-u)+t.z[k+t.nx+1]*u)*v;};
 for(const spec of standSpecs(data))for(let k=0;k<spec.blocks;k++){
  const side=spec.side<0?-1:1,p=station(data,L-spec.first_s+k*STAND.length),hw=p.width/2,front=hw+(spec.gap??STAND.gap),rows=[];
  // Away from the track on that side; on the left the block runs against the lap so its frame stays right-handed.
  const rx=side*p.lx,ry=side*p.ly,tx=-side*p.tx,ty=-side*p.ty;
  // Each block stands on the highest ground just behind the guardrail (never below the
  // road edge), so levelling its apron never digs under the rail.
  const apron=[];for(let a=-STAND.length/2;a<=STAND.length/2;a+=2)apron.push(lidar(p.x+tx*a+rx*(hw+STAND.apron+.5),p.y+ty*a+ry*(hw+STAND.apron+.5)));
  const base=Math.max(p.z+side*p.bank*hw+.3,...apron.map(z=>z+.05));
  for(let r=0;r<STAND.rows;r++){const from=front+STAND.wall+r*STAND.tread;rows.push({from,to:from+STAND.tread,top:base+STAND.first+r*STAND.rise});}
  const back=rows.at(-1).to,top=rows.at(-1).top;
  blocks.push({s:p.s,x:p.x,y:p.y,tx,ty,rx,ry,length:STAND.length,base,front,back,top,apron:hw+STAND.apron,rows,
   roof:{from:front-STAND.overhang,to:back+STAND.wall+.3,backZ:top+STAND.roofClear,slope:STAND.roofSlope}});
 }
 return blocks;
}
export const standPoint=(b,a,l)=>[b.x+b.tx*a+b.rx*l,b.y+b.ty*a+b.ry*l];
// Height of what people walk on at distance l: apron, front parapet, rows, back wall.
export function standSurface(b,l){
 if(l<b.front)return b.base;
 if(l<b.front+STAND.wall)return b.base+STAND.parapet;
 if(l>=b.back)return b.top+STAND.parapet;
 return b.rows[Math.min(b.rows.length-1,Math.floor((l-b.front-STAND.wall)/STAND.tread))].top;
}
export const roofHeight=(b,l)=>b.roof.backZ+(b.roof.to-l)*b.roof.slope;

// --- Bands the scenery keeps off: polylines of [x,y,lx,ly,lo,hi], lo..hi measured
// along the left vector. Trees keep their usual distance from all of them;
// billboards keep `margin` extra metres (the stands need their view of the track).
export function sceneryBands(data){
 const bands=[{name:'pista',closed:true,margin:0,points:data.samples.map(p=>[p[1],p[2],p[9],p[10],-p[4]/2,p[4]/2])}];
 const pit=data.pit;
 if(pit){
  const c=columns(pit),[g0,g1]=pit.garages;
  bands.push({name:'pit_lane',margin:0,points:pit.samples.map(p=>[p[c.x],p[c.y],p[c.lx],p[c.ly],p[c.lo],p[c.hi]])});
  bands.push({name:'boxes',margin:0,points:pit.samples.filter(p=>p[c.s]>=g0-3&&p[c.s]<=g1+3).map(p=>[p[c.x],p[c.y],p[c.lx],p[c.ly],p[c.hi],p[c.hi]+GARAGE_CANOPY])});
 }
 // A branch road (data.branches, branch-layout.js): its asphalt, as the lap's.
 bands.push(...branchBands(data));
 for(const b of standLayout(data))
  bands.push({name:'arquibancada',margin:12,points:[-b.length/2,b.length/2].map(a=>[...standPoint(b,a,0),-b.rx,-b.ry,-b.roof.to,-b.apron])});
 // Bridge decks (meta.decks, Floripa): nothing stands beside them, over the water or on the shore far below: no trees,
 // posts, towers, flags or boards. One band per deck, its stations in lap order (the Hercílio Luz runs across the line).
 // Where the deck runs low over the shore (the abutments) only its own footprint is kept clear. A viaduct through a
 // city (the Minhocão, its parapets a few metres from the buildings) gives its own band instead (meta.deck_band_m,
 // metres past each edge of the asphalt, the same all along).
 const under=(x,y)=>{const g=data.terrain,fx=Math.max(0,Math.min(g.nx-1.001,(x-g.x0)/g.step)),fy=Math.max(0,Math.min(g.ny-1.001,(y-g.y0)/g.step)),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,k=j*g.nx+i;return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;};
 const band=Number.isFinite(data.meta.deck_band_m)?data.meta.deck_band_m:null;
 for(const run of deckRuns(data))bands.push({name:'ponte',margin:0,points:run.map(p=>{const side=band??(p[3]-under(p[1],p[2])>DECK_HIGH?DECK_SIDE:4);return [p[1],p[2],p[9],p[10],-p[4]/2-side,p[4]/2+side];})});
 // A tunnel and its open trench (meta.tunnels, the Minhocão's dive under Praça Roosevelt): nothing stands in it nor on the
 // strip over its walls (a post, a flag, a board or a tree there would hang inside the trench or poke through the roof).
 for(const run of stationRuns(data,p=>inTunnel(data,p[0])))bands.push({name:'tunel',margin:0,points:run.map(p=>[p[1],p[2],p[9],p[10],-p[4]/2-TUNNEL_BAND,p[4]/2+TUNNEL_BAND])});
 // A plateau's rim (cliff-edge.js): nothing stands past it nor within RIM_KEEP of the lip. No points: the track field
 // (landscape.js) has no use for it, and the trees down the slope stay.
 const rim=cliffEdge(data);if(rim)bands.push({name:'abismo',margin:0,points:[],rim});
 return bands;
}
export const RIM_KEEP=3;
// A station on a bridge deck standing more than 3 m over the surveyed ground (the sea bed, the shore far below): not
// the deck's ends, which land on the shore at the ground's height.
export function highDeck(data,probe,i){const p=data.samples[i];return onDeck(data,p[0])&&p[3]-probe.terrain(p[1],p[2])>3;}
// How far beside a bridge deck the scenery keeps away (m past each edge of the asphalt).
const DECK_SIDE=36,DECK_HIGH=6;
// How far beside a tunnel's asphalt the scenery keeps away: its walls and their coping (the plaza above it keeps its
// trees and benches).
const TUNNEL_BAND=3;
function deckRuns(data){return stationRuns(data,p=>onDeck(data,p[0]));}
// The lap's stations where test(p) holds, as runs in lap order (a run may go across the line).
function stationRuns(data,test){
 const a=data.samples,n=a.length,on=a.map(test),runs=[];if(!on.some(Boolean))return runs;
 const start=on.findIndex((v,i)=>v&&!on[(i-1+n)%n]);if(start<0)return [a];
 let run=null;for(let k=0;k<n;k++){const i=(start+k)%n;if(on[i]){(run??=[]).push(a[i]);}else if(run){runs.push(run);run=null;}}
 if(run)runs.push(run);return runs;
}
// Distance from (x,y) to the nearest band, less that band's margin (negative inside).
export function bandClearance(bands,x,y){
 let best=Infinity,name=null;
 for(const band of bands){
  if(band.rim){const e=-band.rim.query(x,y).d-RIM_KEEP-band.margin;if(e<best){best=e;name=band.name;}continue;}
  const a=band.points,n=a.length,last=band.closed?n:n-1;
  for(let i=0;i<last;i++){
   const p=a[i],q=a[(i+1)%n],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,dx=q[0]+q[2]*qc-ax,dy=q[1]+q[3]*qc-ay;
   let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;
   const e=Math.hypot(x-ax-u*dx,y-ay-u*dy)-((p[5]-p[4])+((q[5]-q[4])-(p[5]-p[4]))*u)/2-band.margin;
   if(e<best){best=e;name=band.name;}
  }
 }
 return {distance:best,band:name};
}
// --- Start gantry posts on the open-data circuits (open-circuit.js): 2.2 m off the
// asphalt at the timing line, moved further out while the spot is on paving, in a stand
// or against a pit wall. ECPA's pit lane is still opening at the line, so that post
// stands behind the lane's outer wall and the beam reaches over the lane. Where nothing is
// clear out to 40 m (Chapecó's line faces the middle of the garages: wall, lane, garages)
// the post is mounted on the pit wall's platform, centred on it.
export const POST_CLEARANCE=1;
// A wall wide enough to carry a post (the 3.4 m platform of the open-data circuits) whose
// centre line passes under (x, y), with the 35 cm post inside its top.
export function wallUnderPost(geo,x,y){
 if(!geo)return null;
 for(const w of wallsNear(geo,x,y,0)){if(w.half<.6)continue;const dx=w.x2-w.x1,dy=w.y2-w.y1,len2=dx*dx+dy*dy||1e-9;let u=((x-w.x1)*dx+(y-w.y1)*dy)/len2;u=u<0?0:u>1?1:u;if(Math.hypot(x-w.x1-u*dx,y-w.y1-u*dy)<w.half-.3)return w;}
 return null;
}
export function gantryPosts(data){
 const p=data.samples[0];
 // On a bridge deck (Floripa's line on the Hercílio Luz) the posts stand on the concrete walls by the asphalt.
 if(onDeck(data,p[0]))return [1,-1].map(side=>{const d=p[4]/2+guardrailClearance(data,p[0],side)+.38;return {side,d,x:p[1]+p[9]*side*d,y:p[2]+p[10]*side*d,onWall:false,deck:true};});
 const base=p[4]/2+2.2,bands=sceneryBands(data).map(b=>({...b,margin:0})),geo=pitGeometry(data);
 return [1,-1].map(side=>{
  const at=d=>[p[1]+p[9]*side*d,p[2]+p[10]*side*d];
  const blocked=d=>{const [x,y]=at(d);return bandClearance(bands,x,y).distance<POST_CLEARANCE||!!geo&&wallsNear(geo,x,y,POST_CLEARANCE).length>0;};
  let d=base;while(blocked(d)&&d<base+40)d+=.25;
  if(blocked(d)){
   // On the widest stretch of pit wall top within 10 m of the asphalt: the middle of it.
   const on=[];for(let e=p[4]/2+.2;e<p[4]/2+10;e+=.05)if(wallUnderPost(geo,...at(e)))on.push(e);
   d=on.length?(on[0]+on.at(-1))/2:base;
  }
  const [x,y]=at(d);return {side,d,x,y,onWall:!!wallUnderPost(geo,x,y)};
 });
}

// --- Ceilings for the ground: where the terrain must stay below z. Each paved or
// built patch is a quad with its ceiling given at the corners (linear over the two
// triangles split along its first diagonal). Terrain and ceiling are both piecewise
// linear, so the terrain rises furthest above the ceiling at a quad corner, where a
// quad edge crosses a terrain edge, or at a terrain vertex inside: those are the points.
export function groundLimits(data){
 const t=data.terrain,xs=[],ys=[],zs=[],add=(x,y,z)=>{xs.push(x);ys.push(y);zs.push(z);};
 const gx=x=>(x-t.x0)/t.step,gy=y=>(y-t.y0)/t.step;
 // Terrain edges are the grid columns, rows and the (i,j)-(i+1,j+1) diagonals.
 const edge=(p,q)=>{
  add(...p);const ax=gx(p[0]),ay=gy(p[1]),bx=gx(q[0]),by=gy(q[1]);
  for(const [a,b] of [[ax,bx],[ay,by],[ay-ax,by-bx]])for(let n=Math.ceil(Math.min(a,b));n<=Math.floor(Math.max(a,b));n++){
   const u=(n-a)/(b-a);if(u>0&&u<1)add(p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u,p[2]+(q[2]-p[2])*u);
  }
 };
 const inside=(p,q,r,x,y)=>{
  const d=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);if(Math.abs(d)<1e-12)return null;
  const a=((q[1]-r[1])*(x-r[0])+(r[0]-q[0])*(y-r[1]))/d,b=((r[1]-p[1])*(x-r[0])+(p[0]-r[0])*(y-r[1]))/d,c=1-a-b;
  return a>=-1e-9&&b>=-1e-9&&c>=-1e-9?a*p[2]+b*q[2]+c*r[2]:null;
 };
 const quad=(a,b,c,d)=>{
  edge(a,b);edge(b,c);edge(c,d);edge(d,a);edge(a,c);
  const fx=[a,b,c,d].map(p=>gx(p[0])),fy=[a,b,c,d].map(p=>gy(p[1]));
  for(let j=Math.ceil(Math.min(...fy));j<=Math.floor(Math.max(...fy));j++)for(let i=Math.ceil(Math.min(...fx));i<=Math.floor(Math.max(...fx));i++){
   const x=t.x0+i*t.step,y=t.y0+j*t.step,z=inside(a,b,c,x,y)??inside(a,c,d,x,y);if(z!==null)add(x,y,z);
  }
 };
 const A=data.samples,N=A.length,probe=new TestCar(data),C=GROUND_CLEARANCE;
 // Track asphalt, and the painted kerbs laid on the ground beside it (13 right, 14 left).
 for(let i=0;i<N;i++){
  // Under a bridge deck (meta.decks) the ground keeps clear of its girders, 2.5 m below the road, out to the parapets;
  // at its ends, where it lands on the shore, the ground meets the road as anywhere else.
  const deck=highDeck(data,probe,i),drop=deck?2.5:C,reach=deck?1.5:0;
  const p=A[i],q=A[(i+1)%N],j=(i+1)%N,at=(r,d)=>[r[1]+r[9]*d,r[2]+r[10]*d,r[3]+r[5]*d-drop];
  quad(at(p,-p[4]/2-reach),at(q,-q[4]/2-reach),at(q,q[4]/2+reach),at(p,p[4]/2+reach));
  for(const [side,flag] of [[-1,13],[1,14]]){
   if(!(p.length>flag&&p[flag]&&q[flag]))continue;
   const kerb=(r,k,w)=>{const d=side*(r[4]/2+w),x=r[1]+r[9]*d,y=r[2]+r[10]*d;probe.index=k;return [x,y,Math.min(r[3]+r[5]*d,probe.sample(x,y,k).z-.055)-C];};
   quad(kerb(p,i,0),kerb(q,j,0),kerb(q,j,1.05),kerb(p,i,1.05));
  }
 }
 const pit=data.pit;
 if(pit){
  const c=columns(pit),P=pit.samples,[g0,g1]=pit.garages,at=(r,d,z)=>[r[c.x]+r[c.lx]*d,r[c.y]+r[c.ly]*d,z];
  for(let i=0;i+1<P.length;i++){
   const p=P[i],q=P[i+1],plane=(r,d)=>r[c.z]+r[c.bank]*d-C;
   quad(at(p,p[c.lo],plane(p,p[c.lo])),at(q,q[c.lo],plane(q,q[c.lo])),at(q,q[c.hi],plane(q,q[c.hi])),at(p,p[c.hi],plane(p,p[c.hi])));
   // Garage floors, level with the working lane.
   if(q[c.s]>=g0-1&&p[c.s]<=g1+1){
    const floor=r=>r[c.z]+r[c.bank]*r[c.hi]-.15;
    quad(at(p,p[c.hi],floor(p)),at(q,q[c.hi],floor(q)),at(q,q[c.hi]+GARAGE_DEPTH,floor(q)),at(p,p[c.hi]+GARAGE_DEPTH,floor(p)));
   }
  }
  // Epoxy floor of Box 99 and the café beside it: it follows the pit-lane plane
  // (older builds kept it level at mid-depth; stay below both).
  const b=pit.box99;
  if(b){
   const mid=pitStation(pit,b.s),level=mid.z+mid.bank*(b.front+b.depth/2),stations=steps(b.cafe_s-b.bay/2,b.s+b.bay/2,1).map(s=>pitStation(pit,s));
   const at99=(r,d)=>[r.x+r.lx*d,r.y+r.ly*d,Math.min(level,r.z+r.bank*d)-.05-C],d0=b.front,d1=b.front+.35+b.depth;
   for(let k=0;k+1<stations.length;k++){const r=stations[k],s=stations[k+1];quad(at99(r,d0),at99(s,d0),at99(s,d1),at99(r,d1));}
  }
  // Walls keep their tops above ground.
  for(const wall of pit.walls)for(let i=0;i+1<wall.points.length;i++){
   const [x1,y1,z1]=wall.points[i],[x2,y2,z2]=wall.points[i+1],top=wall.height-.3;
   edge([x1,y1,z1+top],[x2,y2,z2+top]);if(i+2===wall.points.length)add(x2,y2,z2+top);
  }
 }
 // A branch road's asphalt where it is its own (outside the lap's: branch-layout.js, welded to the lap's edge at the
 // seam) and its kerbs.
 for(const B of branchLayouts(data)){
  const st=B.stations,at=(r,d,lift=0)=>[r.x+r.lx*d,r.y+r.ly*d,stationZ(r,d)+lift-C];
  for(let i=0;i+1<st.length;i++){
   const p=st[i],q=st[i+1];if(!p.strip||!q.strip)continue;
   quad(at(p,p.strip[0]),at(q,q.strip[0]),at(q,q.strip[1]),at(p,p.strip[1]));
   for(const k of [-1,1]){
    if(!branchKerbSegment(B,i,k))continue;
    const e=r=>k*r.w/2,f=r=>k*(r.w/2+1.05);quad(at(p,e(p)),at(q,e(q)),at(q,f(q)),at(p,f(p)));
   }
  }
 }
 // Grandstands: the apron in front, the parapet, every row and the back wall.
 for(const b of standLayout(data)){
  const a0=-b.length/2-.3,a1=b.length/2+.3,strip=(l0,l1,z)=>quad([...standPoint(b,a0,l0),z],[...standPoint(b,a1,l0),z],[...standPoint(b,a1,l1),z],[...standPoint(b,a0,l1),z]);
  strip(b.apron,b.front,b.base-.05);strip(b.front,b.front+STAND.wall,b.base+STAND.parapet-.1);
  for(const row of b.rows)strip(row.from,row.to,row.top-.1);
  strip(b.back,b.back+STAND.wall,b.top+STAND.parapet-.1);
 }
 return {x:Float64Array.from(xs),y:Float64Array.from(ys),z:Float64Array.from(zs),count:xs.length};
}

// Ground heights on the terrain grid (row-major, data.terrain), triangulated along
// the (i,j)-(i+1,j+1) diagonal. Near the roads it is the ground the car drives on
// (the road profile blending into the LiDAR over 3 m); it is then lowered, as little
// as possible, until no triangle rises through asphalt, kerbs, floors or stands.
export function groundTriangle(t,x,y){
 const fx=(x-t.x0)/t.step,fy=(y-t.y0)/t.step,i=Math.floor(fx),j=Math.floor(fy);
 if(i<0||j<0||i>=t.nx-1||j>=t.ny-1)return null;
 const u=fx-i,v=fy-j,a=j*t.nx+i;
 return u>=v?{k:[a,a+1,a+t.nx+1],w:[1-u,u-v,v]}:{k:[a,a+t.nx+1,a+t.nx],w:[1-v,u,v-u]};
}
export function groundHeight(t,heights,x,y){const q=groundTriangle(t,x,y);return q?q.w[0]*heights[q.k[0]]+q.w[1]*heights[q.k[1]]+q.w[2]*heights[q.k[2]]:null;}
// A street that passes under a viaduct of the same lap (meta.decks): its stations further apart along the lap than
// this from the deck's, its road more than DECK_OVER lower. Beside a tunnel (meta.tunnels) the grid is the road's
// only out to its walls (wall_right_m / wall_left_m, WALL_GAP without them) and TUNNEL_SIDE beyond.
const CROSSING_APART=60,DECK_OVER=3,WALL_GAP=.6,TUNNEL_SIDE=1.5;
export function fitGround(data,limits=groundLimits(data)){
 const t=data.terrain,{nx,ny,step,x0,y0}=t,h=Float64Array.from(t.z),A=data.samples,N=A.length,probe=new TestCar(data),reach=16,L=data.meta.reconstructed_xy_m;
 const hint=new Int32Array(nx*ny).fill(-1),best=new Float64Array(nx*ny).fill(Infinity),high=A.map((p,i)=>highDeck(data,probe,i));
 // Off the high decks too (only on a circuit that has them): the street under a viaduct.
 const low=high.some(Boolean)?new Int32Array(nx*ny).fill(-1):null,lowBest=low?new Float64Array(nx*ny).fill(Infinity):null;
 for(let i=0;i<N;i++){
  const p=A[i],q=A[(i+1)%N],r=Math.max(p[4],q[4])/2+reach,dx=q[1]-p[1],dy=q[2]-p[2],len2=dx*dx+dy*dy||1e-9;
  const i0=Math.max(0,Math.floor((Math.min(p[1],q[1])-r-x0)/step)),i1=Math.min(nx-1,Math.ceil((Math.max(p[1],q[1])+r-x0)/step));
  const j0=Math.max(0,Math.floor((Math.min(p[2],q[2])-r-y0)/step)),j1=Math.min(ny-1,Math.ceil((Math.max(p[2],q[2])+r-y0)/step));
  for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){
   const x=x0+k*step,y=y0+j*step;let u=((x-p[1])*dx+(y-p[2])*dy)/len2;u=u<0?0:u>1?1:u;
   const ex=x-p[1]-u*dx,ey=y-p[2]-u*dy,d2=ex*ex+ey*ey,g=j*nx+k;if(d2<best[g]){best[g]=d2;hint[g]=i;}
   if(low&&!high[i]&&d2<lowBest[g]){lowBest[g]=d2;low[g]=i;}
  }
 }
 // A tunnel's stations, and the gap from the asphalt to its walls on each side.
 const tunnel=data.meta.tunnels?.length?A.map(p=>inTunnel(data,p[0])):null,wr=data.columns?.indexOf('wall_right_m')??-1,wl=data.columns?.indexOf('wall_left_m')??-1;
 const lock=tunnel?new Uint8Array(nx*ny):null;
 const geo=pitGeometry(data),branched=branchLayouts(data).length>0;let driven=0,locked=0;
 for(let j=0;j<ny;j++)for(let k=0;k<nx;k++){
  const g=j*nx+k,x=x0+k*step,y=y0+j*step;let i=hint[g],d2=best[g];
  // Under a viaduct where the lap crosses itself the nearest station in plan is often the deck's: the ground there is
  // the street's below it, so it is fitted to the lower stretch whenever that one is within reach. Not "the lowest of
  // the stations about as near": at a 90° crossing the deck can be metres nearer in plan over the whole street. A
  // deck's own approaches (the same stretch, under CROSSING_APART along the lap) keep the old rule, so a bridge's
  // shores stay as surveyed.
  if(low&&i>=0&&high[i]&&low[g]>=0){
   const m=low[g],apart=Math.abs(A[m][0]-A[i][0]);
   if(Math.sqrt(lowBest[g])-A[m][4]/2<reach&&Math.min(apart,L-apart)>CROSSING_APART&&A[m][3]<A[i][3]-DECK_OVER){i=m;d2=lowBest[g];}
  }
  // Beside a tunnel or its trench: the corridor cut down to the road is fitted; past it the plaza or the street
  // above stays as surveyed, never driven nor lowered (lock).
  if(tunnel&&i>=0&&tunnel[i]){
   const p=A[i],q=A[(i+1)%N],dx=q[1]-p[1],dy=q[2]-p[2];let u=((x-p[1])*dx+(y-p[2])*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;
   const side=(x-p[1]-u*dx)*p[9]+(y-p[2]-u*dy)*p[10],gap=(side<0?p[wr]:p[wl])??WALL_GAP;
   if(Math.sqrt(d2)>p[4]/2+(Number.isFinite(gap)?gap:WALL_GAP)+TUNNEL_SIDE){lock[g]=1;locked++;continue;}
  }
  // Beside and under a bridge deck the ground stays where the survey has it (the sea, the shore far below).
  const nearMain=i>=0&&Math.sqrt(d2)-A[i][4]/2<reach&&!high[i];
  // Nearer a branch road's own asphalt than the lap's (and off the lap's): its drawn surface, carried on and blended into
  // the survey over 3 m past its edge as the lap's is (physics.js sample).
  if(branched){
   const lapOut=nearMain?Math.sqrt(d2)-A[i][4]/2:Infinity,b=lapOut>0?branchRoadZ(data,x,y,reach):null;
   if(b&&b.out<lapOut){const blend=Math.max(0,Math.min(1,b.out/3));h[g]=b.z*(1-blend)+t.z[g]*blend;driven++;continue;}
  }
  const lane=!nearMain&&geo?locatePit(geo,x,y):null;
  if(!nearMain&&!(lane&&Math.max(lane.lo-lane.d,lane.d-lane.hi)<reach))continue;
  h[g]=probe.sample(x,y,nearMain?i:probe.nearest(x,y,true).i).z-.055;driven++;
 }
 const start=Float64Array.from(h);
 // Each limit point lowers its triangle along the barycentric weights (least change); a locked node keeps its
 // height and the others take the whole change.
 let passes=0,residual=0;
 for(passes=1;passes<=80;passes++){
  residual=0;
  for(let n=0;n<limits.count;n++){
   const q=groundTriangle(t,limits.x[n],limits.y[n]);if(!q)continue;
   const [a,b,c]=q.k,[wa,wb,wc]=q.w,e=wa*h[a]+wb*h[b]+wc*h[c]-limits.z[n];if(e<=5e-4)continue;
   residual=Math.max(residual,e);
   const ua=lock?.[a]?0:wa,ub=lock?.[b]?0:wb,uc=lock?.[c]?0:wc,w2=ua*ua+ub*ub+uc*uc;if(!w2)continue;
   const k=e/w2;h[a]-=k*ua;h[b]-=k*ub;h[c]-=k*uc;
  }
  if(residual<=2e-3)break;
 }
 let lowered=0,maxLowered=0;for(let g=0;g<h.length;g++){const d=start[g]-h[g];if(d>.01)lowered++;maxLowered=Math.max(maxLowered,d);}
 return {heights:h,start,lock,stats:{limits:limits.count,driven,lowered,maxLowered,passes,residual,...(lock?{locked}:{})}};
}

// Writes fitted heights into the GLB terrain (same grid) and re-triangulates it
// along the fitted diagonal. Returns false when the mesh is not that grid.
export function applyGroundHeights(geometry,data,heights){
 const t=data.terrain,pos=geometry.attributes.position,index=geometry.index?.array,grid=new Int32Array(t.nx*t.ny).fill(-1);
 if(pos.count!==t.nx*t.ny||!index||index.length!==(t.nx-1)*(t.ny-1)*6)return false;
 for(let v=0;v<pos.count;v++){
  const fx=(pos.getX(v)-t.x0)/t.step,fy=(-pos.getZ(v)-t.y0)/t.step,k=Math.round(fx),j=Math.round(fy);
  if(Math.abs(fx-k)>.01||Math.abs(fy-j)>.01||k<0||j<0||k>=t.nx||j>=t.ny)return false;grid[j*t.nx+k]=v;
 }
 if(grid.includes(-1))return false;
 for(let g=0;g<grid.length;g++)pos.setY(grid[g],heights[g]);
 let n=0;
 for(let j=0;j<t.ny-1;j++)for(let k=0;k<t.nx-1;k++){
  const a=grid[j*t.nx+k],b=grid[j*t.nx+k+1],c=grid[(j+1)*t.nx+k+1],d=grid[(j+1)*t.nx+k];
  index[n++]=a;index[n++]=b;index[n++]=c;index[n++]=a;index[n++]=c;index[n++]=d;
 }
 geometry.index.needsUpdate=pos.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 return true;
}
