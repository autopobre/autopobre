// The road of every circuit for the online records' check of a lap's way (src/trajeto.js): where a car can be while the
// game still counts its lap, and the lap distance it has there. Read from the game's own track files and code, as its
// physics meets them (physics.js). Run after a circuit is added or a track file changes: node gerar_pistas.mjs (writes
// src/pistas.js; teste/testar_trajeto.mjs says when it is out of date).
// - The centre line evenly every STEP m or so, with its half width and on each side how far from it a car can be (reach):
//   the barrier's line (guardrailClearance: a rail, a street's walls, Curvelo's inside wall round its service lane) and
//   WALL_SLACK on a side no car gets behind, else OPEN past the asphalt; never farther past a plateau's rim (cliff-edge.js)
//   than the plateau runs, with CLIFF_SLACK. Each the widest of the game's stations within a station of it.
// - The lanes: the pit lane (its own stations, the paved band either side and the lap distance each stands for, as
//   locatePit reads them), Curvelo's service lane as pitLane lays it, and a branch road (data.branches: Pampulha's
//   avenue, its walls; both ways are the lap).
// - The zones of a city open to roam (meta.roam: Floripa's streets and squares, the Mineirão) as cells of ZONE_CELL m,
//   set where the zone's ground comes within ZONE_PAD m of the cell, and their gaps in the lap's walls.
// Lengths in decimetres, written as zigzag varint steps from one station to the next, in base64.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {CIRCUITS} from '../pista_interlagos/teste/circuits.js';
import {createCurveloData} from '../pista_interlagos/teste/curvelo-data.js';
import {guardrailPresent,guardrailClearance,roamZoneAt} from '../pista_interlagos/teste/physics.js';
import {pitLane} from '../pista_interlagos/teste/pit-lane.js';
import {cliffEdge} from '../pista_interlagos/teste/cliff-edge.js';

const STEP=5,LANE_STEP=4,ZONE_CELL=8,ZONE_PAD=4;
const OPEN=250,WALL_SLACK=2,CLIFF_SLACK=4;
export const load=id=>{const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../pista_interlagos/dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;return data;};

const dm=v=>Math.round(v*10);
// Rows of whole numbers as steps from the row before (the first from zero), zigzag varints, base64.
function pack(rows){
 const out=[],prev=rows[0].map(()=>0);
 for(const r of rows)r.forEach((x,c)=>{let v=x-prev[c];prev[c]=x;v=v<0?-2*v-1:2*v;while(v>127){out.push(v%128+128);v=Math.floor(v/128);}out.push(v);});
 return Buffer.from(out).toString('base64');
}
// A row of a block of stations at distance t along it (column `at` its distance), linear between two; loop: L closes it.
function rowAt(a,at,t,L=null){
 if(L!==null)t=((t%L)+L)%L;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][at]<=t)lo=m;else hi=m-1;}
 const p=a[lo],q=L!==null?a[(lo+1)%a.length]:a[Math.min(lo+1,a.length-1)],span=(L!==null&&lo===a.length-1?L:q[at])-p[at],u=span>0?Math.max(0,Math.min(1,(t-p[at])/span)):0;
 return p.map((v,k)=>v+(q[k]-v)*u);
}

// How far from the centre line a car can be at each of the game's stations, on its left (side 1) and right (-1). A barrier
// holds a car only from the road's side: one that goes round an end of it drives on behind it (physics.js step: a point
// of the body deep past the line is pushed back only when the car crossed it that step; a city's walls, RoamWorld, even
// hold it out there). The game's own driver, pushed off, went 100 m behind Interlagos' rails, 90 m behind Chapecó's and
// 800 m behind Pampulha's walls from the pit lane's opening. So a side keeps its barrier only when it runs the whole lap
// round, broken at most by the gaps into a city's zones open to roam (their own edges hold a car in them; a metre more
// either side for the walls' ends); else OPEN past the asphalt (runoffs, grass, the infield: the absurd only; how much of
// a lap goes far off is trajeto.js's). Past a plateau's rim the car falls, and a lap with a fall is never a record: no
// farther than the plateau runs along the normal.
function reach(data){
 const a=data.samples,cliff=cliffEdge(data),hit={},gaps=(data.meta.roam?.zones??[]).flatMap(z=>z.gaps);
 return [1,-1].map(side=>{
  const gap=s=>gaps.some(g=>Math.sign(g.side)===side&&s>=g.s0-1&&s<=g.s1+1),present=a.map(p=>guardrailPresent(data,p[0],side)),whole=a.every((p,j)=>present[j]||gap(p[0]));
  return a.map((p,j)=>{
   const hw=p[4]/2;let b=whole&&present[j]?hw+guardrailClearance(data,p[0],side)+WALL_SLACK:hw+OPEN;
   if(cliff){const t=Math.hypot(p[7],p[8])||1,lx=-p[8]/t*side,ly=p[7]/t*side;let ground=hw;for(let e=hw;e<=b;e+=1)if(!(cliff.query(p[1]+lx*e,p[2]+ly*e,hit).d>0))ground=e;b=Math.min(b,ground+CLIFF_SLACK);}
   return b;
  });
 });
}

// The lap's centre line, evenly every STEP m or so: x, y, half width, and how far a car can be to its left and right.
function lapLine(data){
 const a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,count=Math.max(3,Math.round(L/STEP)),h=L/count,[left,right]=reach(data);
 const bl=new Float64Array(count),br=new Float64Array(count);
 // Each reach the widest of the game's stations within a station of it (round the line too).
 for(let j=0;j<n;j++){
  const s=a[j][0];for(let k=Math.floor(s/h)-1;k<=Math.ceil(s/h)+1;k++){
   const i=((k%count)+count)%count,along=((s-i*h)%L+L)%L;if(Math.min(along,L-along)>h)continue;
   bl[i]=Math.max(bl[i],left[j]);br[i]=Math.max(br[i],right[j]);
  }
 }
 const rows=[];for(let i=0;i<count;i++){const p=rowAt(a,0,i*h,L);rows.push([dm(p[1]),dm(p[2]),dm(p[4]/2),dm(bl[i]),dm(br[i])]);}
 return {n:count,data:pack(rows)};
}

// A lane's stations every LANE_STEP m or so (evenly) from its stations' rows: x, y, the lap distance it stands for (unwrapped), the paved
// band to its right and left (lo < 0 < hi), its half width; each band the widest within a station.
function lane(kind,src,length,L){
 const count=Math.max(2,Math.round(length/LANE_STEP)+1),h=length/(count-1),rows=[];let last=null;
 for(let i=0;i<count;i++){
  const t=i*h,near=src.filter(r=>Math.abs(r.t-t)<=h),p=rowAt(src.map(r=>[r.t,r.x,r.y,r.m]),0,t);
  let m=p[3];if(last!==null)m+=Math.round((last-m)/L)*L;last=m;
  rows.push([dm(p[1]),dm(p[2]),dm(m),dm(Math.min(...near.map(r=>r.lo))),dm(Math.max(...near.map(r=>r.hi))),dm(Math.max(...near.map(r=>r.hw)))]);
 }
 return {kind,n:count,data:pack(rows)};
}
function lanes(data){
 const L=data.meta.reconstructed_xy_m,out=[];
 if(data.pit){
  const P=data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i]));let last=null;
  const src=P.samples.map(p=>{let m=p[c.main_s];if(last!==null)m+=Math.round((last-m)/L)*L;last=m;return {t:p[c.s],x:p[c.x],y:p[c.y],m,lo:p[c.lo],hi:p[c.hi],hw:Math.max(-p[c.lo],p[c.hi])};});
  out.push(lane('pit',src,P.length_m,L));
 }else if(data.meta.id==='curvelo'){
  // Its service lane: an offset of the main straight 150 m either side of the line, the garages behind it (pitLane).
  const src=[];
  for(let s=-150;s<=150;s+=1){const q=pitLane(data,s),p=rowAt(data.samples,0,s,L),t=Math.hypot(p[7],p[8])||1;src.push({t:s+150,x:p[1]-p[8]/t*q.offset,y:p[2]+p[7]/t*q.offset,m:s,lo:-q.halfWidth,hi:q.reach-q.offset,hw:q.reach-q.offset});}
  out.push(lane('pit',src,300,L));
 }
 for(const B of data.branches??[]){
  const c=Object.fromEntries(B.columns.map((k,i)=>[k,i]));
  const src=B.samples.map(p=>({t:p[c.s],x:p[c.x],y:p[c.y],m:p[c.main_s],lo:-(p[c.width]/2+p[c.wall_right_m]),hi:p[c.width]/2+p[c.wall_left_m],hw:p[c.width]/2}));
  out.push(lane('ramal',src,B.length_m,L));
 }
 return out;
}

// A city's zones open to roam as cells: every cell within ZONE_PAD of the zone's outline (its rings, the buildings' holes
// too), and every cell whose middle is on its open ground (physics.js roamZoneAt). A cell with any of the zone in it is one
// of the two.
function zones(data){
 return (data.meta.roam?.zones??[]).map(z=>{
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const r of z.ring)for(let k=0;k<r.length;k+=2){x0=Math.min(x0,r[k]);x1=Math.max(x1,r[k]);y0=Math.min(y0,r[k+1]);y1=Math.max(y1,r[k+1]);}
  const C=ZONE_CELL,P=ZONE_PAD,ox=Math.floor((x0-P)/C)*C,oy=Math.floor((y0-P)/C)*C,nx=Math.ceil((x1+P-ox)/C),ny=Math.ceil((y1+P-oy)/C),bits=new Uint8Array(Math.ceil(nx*ny/8));
  const set=(i,j)=>{if(i>=0&&j>=0&&i<nx&&j<ny){const k=j*nx+i;bits[k>>3]|=128>>(k&7);}};
  for(const r of z.ring)for(let k=0;k<r.length;k+=2){
   const ax=r[k],ay=r[k+1],bx=r[(k+2)%r.length],by=r[(k+3)%r.length],count=Math.ceil(Math.hypot(bx-ax,by-ay)/2);
   for(let t=0;t<=count;t++){const x=ax+(bx-ax)*t/(count||1),y=ay+(by-ay)*t/(count||1);for(let i=Math.floor((x-P-ox)/C);i<=Math.floor((x+P-ox)/C);i++)for(let j=Math.floor((y-P-oy)/C);j<=Math.floor((y+P-oy)/C);j++)set(i,j);}
  }
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(roamZoneAt(data,ox+(i+.5)*C,oy+(j+.5)*C)?.name===z.name)set(i,j);
  // Its gaps in the lap's walls (lap distance from, to): the only ways in and out.
  return {x0:ox,y0:oy,nx,ny,cell:C,bits:Buffer.from(bits).toString('base64'),gaps:z.gaps.map(g=>[Math.round(g.s0*10)/10,Math.round(g.s1*10)/10])};
 });
}

// slack: WALL_SLACK, how far past a barrier's line the reach goes where it holds (the line itself is the reach less it).
export function buildCircuit(id){const data=load(id);return {L:Math.round(data.meta.reconstructed_xy_m*1000)/1000,slack:WALL_SLACK,line:lapLine(data),lanes:lanes(data),zones:zones(data)};}
export function buildAll(){return Object.fromEntries(Object.keys(CIRCUITS).map(id=>[id,buildCircuit(id)]));}
export const HEADER="// Written by gerar_pistas.mjs: each circuit's road for the check of a lap's way (trajeto.js), from the game's track files.";
export const source=all=>`${HEADER}\nexport const PISTAS=${JSON.stringify(all)};\n`;

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const all={};
 for(const id of Object.keys(CIRCUITS)){const started=Date.now();all[id]=buildCircuit(id);console.log(id.padEnd(12),`${(JSON.stringify(all[id]).length/1000).toFixed(1)} kB`,`(${Date.now()-started} ms)`);}
 const text=source(all);fs.writeFileSync(new URL('./src/pistas.js',import.meta.url),text);
 console.log(`src/pistas.js: ${(text.length/1000).toFixed(1)} kB`);
}
