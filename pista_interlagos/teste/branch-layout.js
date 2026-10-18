import {branchGeometries,locateBranch,branchPoint} from './branch-lane.js';

// What a branch road (data.branches, branch-lane.js) occupies beside the lap, shared by everything drawn or kept clear
// for it: plain data (no three.js), so the Node checks and track-clearance.js read it too.
// - Its asphalt outside the lap's. Where the two roads run together (the branch's first and last stretches) the lap's
//   own asphalt is drawn; the branch adds only what lies beyond the lap's left edge (or right: its side), cut along that
//   edge (the seam) a few centimetres into the lap's asphalt, and past the noses its whole width. Along the seam the
//   two roads' planes do not agree (Pampulha: the avenue climbs while the square's street falls, up to 0.8 m apart at
//   the noses), so the branch's surface is welded to the lap's edge: at the seam it takes the lap's height, the
//   difference fading out over WELD metres across the branch (branchRoadZ, the height everything drawn on it stands on).
// - The stretches of the lap's edge line beside that asphalt (the mouths: the line is dashed there, branch-scenery.js).
// - Its driving space for the landmark modules' keep-out grids (branchSpace: asphalt, walls and their backs).
// One station per branch sample (2 m); per branch, cached on the track data.
const WELD=10,SEAM_INTO_LAP=.04,MIN_STRIP=.02,WALL_BACK=.75,CELL=8,NOSE_FADE=8;
const smooth=u=>{u=u<0?0:u>1?1:u;return u*u*(3-2*u);};
const cache=new WeakMap();

// The lap's samples round the branch's span (lap s from entry - 150 to exit + 150): nearest segment in plan, the lap's
// lateral offset there (positive to its left), its width and its road plane under the point.
function lapNear(data,geo){
 const a=data.samples,L=data.meta.reconstructed_xy_m,from=geo.entryMainS-150,span=geo.exitMainS-geo.entryMainS+300,idx=[];
 for(let i=0;i<a.length;i++)if(((a[i][0]-from)%L+L)%L<=span)idx.push(i);
 const has=new Set(idx),seg=idx.filter(i=>has.has((i+1)%a.length)),wr=data.columns?.indexOf('wall_right_m')??-1,wl=data.columns?.indexOf('wall_left_m')??-1;
 return (x,y)=>{
  let best=Infinity,hit=null;
  for(const i of seg){
   const p=a[i],q=a[(i+1)%a.length],dx=q[1]-p[1],dy=q[2]-p[2],len2=dx*dx+dy*dy||1e-9;let u=((x-p[1])*dx+(y-p[2])*dy)/len2;u=u<0?0:u>1?1:u;
   const ex=x-p[1]-u*dx,ey=y-p[2]-u*dy,d2=ex*ex+ey*ey;if(d2<best){best=d2;hit={i,u,ex,ey,p,q};}
  }
  const {u,ex,ey,p,q}=hit,m=k=>p[k]+(q[k]-p[k])*u,ll=Math.hypot(m(9),m(10))||1,d=(ex*m(9)+ey*m(10))/ll,width=m(4);
  // (wall: the lap's own gap from the asphalt to its wall's face on that side, without the flare at a wall's end.)
  return {s:(p[0]+u*Math.hypot(q[1]-p[1],q[2]-p[2]))%L,d,width,out:d*geo.side-width/2,plane:m(3)+m(5)*d,wall:(d<0?wr:wl)>=0?m(d<0?wr:wl):.6};
 };
}

function build(data,geo){
 const {a,c}=geo,lap=lapNear(data,geo),side=geo.side,stations=[];
 // f(d): how far the branch's point at d lies past the lap's edge on the branch's side (negative on the lap's asphalt).
 for(const p of a){
  const s=p[c.s],x=p[c.x],y=p[c.y],w=p[c.width],lx=p[c.lx],ly=p[c.ly],at=d=>lap(x+lx*d,y+ly*d);
  // The branch's outer edge (away from the lap) and inner edge, as d.
  const outer=side*w/2,inner=-side*w/2,fo=at(outer).out,fi=at(inner).out;
  const st={s,x,y,z:p[c.z],bank:p[c.bank],grade:p[c.grade],w,lx,ly,tx:p[c.tx],ty:p[c.ty],mainS:p[c.main_s],kerbRight:p[c.kerb_right],kerbLeft:p[c.kerb_left],
   wallRight:p[c.wall_right_m],wallLeft:p[c.wall_left_m],strip:null,seam:null,outerGap:fo,innerGap:fi};
  if(fo>MIN_STRIP){
   if(fi>=0)st.strip=[-w/2,w/2];
   else{
    // The seam: where the lap's edge crosses this station (bisection between the inner edge, on the lap, and the outer).
    let lo=inner,hi=outer;for(let k=0;k<32;k++){const m=(lo+hi)/2;if(at(m).out<0)lo=m;else hi=m;}
    const d0=(lo+hi)/2,e=at(d0),into=d0-side*SEAM_INTO_LAP;
    st.seam={d:d0,lapS:e.s,dz:e.plane-(st.z+st.bank*d0)};
    st.strip=side>0?[into,w/2]:[-w/2,into];
   }
  }
  stations.push(st);
 }
 // Past a nose's seam the strip is the branch's whole width (no seam across the station) while the lap's asphalt still
 // runs diagonally beside its inner edge: the weld goes on from that edge (weld, read by stationZ), fading out as the
 // lap's edge falls away from it (NOSE_FADE metres), so the surface has no kink where the seam ends. (Cut off at the
 // last seam, the exit nose's 0.54 m weld left a 0.26 m ramp in 2 m across the branch's inner half and the merge's a
 // 0.28 m drop: cars there were launched, and rolled; physics.js stands on this surface.)
 for(const st of stations)if(!st.seam&&st.strip&&st.innerGap<NOSE_FADE){
  const inner=-side*st.w/2,e=lap(st.x+st.lx*inner,st.y+st.ly*inner);
  st.weld={d:inner,dz:(e.plane-(st.z+st.bank*inner))*(1-smooth(st.innerGap/NOSE_FADE))};
 }
 // Runs of stations with a strip, and the mouths: the lap s where the branch's asphalt lies beside the lap's edge.
 const mouths=[];let run=null;
 for(const st of stations){if(st.seam&&Math.abs(st.strip[1]-st.strip[0])>.5){if(!run)mouths.push(run=[st.seam.lapS,st.seam.lapS]);run[1]=st.seam.lapS;}else run=null;}
 return {geo,stations,lap,mouths};
}
export function branchLayouts(data){
 if(cache.has(data))return cache.get(data);
 const list=branchGeometries(data).map(geo=>build(data,geo));
 cache.set(data,list);return list;
}
export const hasBranches=data=>(data.branches?.length??0)>0;
// The s the branch's asphalt and kerbs carry into their shaders (track-surface.js roadData, the kerbs' blocks): the
// branch's own, past the lap's length and its margins, so the lap's braking, slab and launch zones (keyed on its s)
// never paint on it.
export const branchRoadOffset=data=>Math.ceil(data.meta.reconstructed_xy_m/1000)*1000+2000;

// Height of the drawn branch surface at station st, offset d (the road plane, welded to the lap's edge near the seam).
export function stationZ(st,d){
 const plane=st.z+st.bank*d,w=st.seam??st.weld;if(!w)return plane;
 return plane+w.dz*(1-smooth(Math.abs(d-w.d)/WELD));
}
// Between two stations at fraction u (station-wise interpolation of the surface).
function mixZ(p,q,u,d){return stationZ(p,d)*(1-u)+stationZ(q,d)*u;}
// The drawn branch surface under (x, y) (its plane carried on past the edge, as the lap's in physics.js sample), or null
// further than `reach` metres off every branch's asphalt or where a branch has none of its own (it is the lap there):
// {z, d, s, mainS, out (metres past the asphalt's edge), branch, inStrip (on the asphalt drawn for the branch)}.
export function branchRoadZ(data,x,y,reach=0){
 let best=null;
 for(const B of branchLayouts(data)){
  const hit=locateBranch(B.geo,x,y);if(!hit)continue;
  const out=Math.abs(hit.d)-hit.width/2;if(out>reach||best&&out>=best.out)continue;
  const p=B.stations[hit.i],q=B.stations[Math.min(B.stations.length-1,hit.i+1)];
  // Only where the branch draws asphalt of its own (outside the lap's), or beside it.
  const strip=p.strip??q.strip;if(!strip)continue;
  best={z:mixZ(p,q,hit.u,hit.d),d:hit.d,s:hit.s,mainS:hit.mainS,out,branch:B.geo.index,inStrip:hit.d>=Math.min(...strip)-.01&&hit.d<=Math.max(...strip)+.01};
 }
 return best;
}

// Whether the branch draws a kerb (track-surface.js) from station i to i+1 on side k (1 left, -1 right): flagged at both
// (kerb_left / kerb_right) and clear of the lap's asphalt (the lap's own kerbs where the two run together; on the side
// facing the lap, the whole kerb's width).
export function branchKerbSegment(B,i,k){
 const st=B.stations,p=st[i],q=st[i+1];if(!p||!q)return false;
 const outer=k===B.geo.side,ok=r=>(k>0?r.kerbLeft:r.kerbRight)&&(outer?r.outerGap>.3:r.innerGap>1.3);
 return !!(ok(p)&&ok(q));
}
// The same at branch distance s (the station before it), for the kerbs as the wheels feel them (kerb-contact.js).
export function branchKerbAt(data,branch,s,k){
 const B=branchLayouts(data)[branch];if(!B)return false;
 const st=B.stations;let lo=0,hi=st.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(st[m].s<=s)lo=m;else hi=m-1;}
 return branchKerbSegment(B,lo,k);
}
// The scenery band of each branch (track-clearance.js sceneryBands: [x, y, left x, left y, lo, hi]): its asphalt.
export function branchBands(data){
 return branchLayouts(data).map(B=>({name:'ramal',margin:0,points:B.stations.map(st=>[st.x,st.y,st.lx,st.ly,-st.w/2,st.w/2])}));
}

// Whether the branch has a wall on that side (1 left, -1 right) at branch s.
export function branchWallAt(geo,s,side){return (geo.rails[side<0?'-1':'1']??[]).some(([a,b])=>s>=a&&s<=b);}

// The driving space of the branches for the landmark modules (pampulha-*.js lapSpace): at(x, y) gives, for every branch
// segment beside the point, {s (the lap's s), lat (offset, + left), road (surface height), back (from the centre line to
// the back of the wall on that side, or to the asphalt's edge plus its clearance without one), branch}, as the lap's own
// at() does, so "inside" stays |lat| < back + margin; any(x, y, r) whether any of its cells lies within r.
const spaceCache=new WeakMap();
export function branchSpace(data){
 if(spaceCache.has(data))return spaceCache.get(data);
 const segs=[],cells=new Map(),key=(i,j)=>i*131071+j;
 for(const B of branchLayouts(data)){
  const st=B.stations,geo=B.geo;
  for(let i=0;i+1<st.length;i++){
   const p=st[i],q=st[i+1];
   // Where the branch is the lap (no asphalt of its own on either station), the lap's space is the one.
   if(!p.strip&&!q.strip)continue;
   const back=(r,sd)=>r.w/2+(sd>0?r.wallLeft:r.wallRight)+(branchWallAt(geo,r.s,sd)?WALL_BACK:0);
   const seg={p,q,geo,back:[[back(p,-1),back(q,-1)],[back(p,1),back(q,1)]]},k=segs.push(seg)-1,r=Math.max(...seg.back.flat())+4;
   for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const h=key(ci,cj);let l=cells.get(h);if(!l)cells.set(h,l=[]);l.push(k);}
  }
 }
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const k of list){
   const {p,q,geo,back}=segs[k],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=u<0?0:u>1?1:u;
   const nx=p.lx+(q.lx-p.lx)*u,ny=p.ly+(q.ly-p.ly)*u,nl=Math.hypot(nx,ny)||1,lat=((x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny)/nl,b=back[lat>=0?1:0];
   out.push({s:p.mainS+(q.mainS-p.mainS)*u,lat,road:mixZ(p,q,u,lat),back:b[0]+(b[1]-b[0])*u,branch:geo.index});
  }
  return out;
 }
 const any=(x,y,r)=>{for(let ci=Math.floor((x-r)/CELL);ci<=Math.floor((x+r)/CELL);ci++)for(let cj=Math.floor((y-r)/CELL);cj<=Math.floor((y+r)/CELL);cj++)if(cells.has(key(ci,cj)))return true;return false;};
 const space={at,any,segments:segs.length};spaceCache.set(data,space);return space;
}

// The wall lines of the branches for street-walls.js: each `walls` polyline of a side (1 left, -1 right; the noses,
// side 0, are branch-scenery.js's), resampled every metre, each station {s, x, y, z, ox, oy}: the foot of the wall's
// face (the polyline), the drawn surface there (the wall's ground) and the outward unit vector (away from the road).
// s runs along the branch from WALL_S (block paint, joints and the fence's mesh read it; kept apart from the lap's).
export const WALL_S=50000;
export function branchWallLines(data){
 const lines=[];
 for(const B of branchLayouts(data))for(const wall of B.geo.block.walls??[]){
  if(!wall.side)continue;
  const pts=wall.points,run=[0];for(let i=1;i<pts.length;i++)run.push(run[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const total=run.at(-1),n=Math.max(2,Math.ceil(total)),stations=[];
  let k=0;
  for(let j=0;j<=n;j++){
   const t=total*j/n;while(k<pts.length-2&&run[k+1]<t)k++;
   const u=Math.max(0,Math.min(1,(t-run[k])/((run[k+1]-run[k])||1))),x=pts[k][0]+(pts[k+1][0]-pts[k][0])*u,y=pts[k][1]+(pts[k+1][1]-pts[k][1])*u;
   const hit=locateBranch(B.geo,x,y);if(!hit)continue;
   const p=B.stations[hit.i],q=B.stations[Math.min(B.stations.length-1,hit.i+1)];
   stations.push({s:WALL_S+B.geo.index*5000+hit.s,x,y,z:mixZ(p,q,hit.u,hit.d)+.055,ox:hit.lx*wall.side,oy:hit.ly*wall.side,branchS:hit.s});
  }
  if(stations.length>1)lines.push({branch:B.geo.index,name:wall.name,side:wall.side,from:stations[0].s,to:stations.at(-1).s,stations,turn:s=>branchTurn(B.geo,s-WALL_S-B.geo.index*5000)});
 }
 return lines;
}
// How much the branch bends at branch s: turn of the tangent over 20 m, radians per metre (street-walls.js corner paint).
export function branchTurn(geo,s){
 const p=branchPoint(geo,s-10),q=branchPoint(geo,s+10);let d=q.heading-p.heading;d=(d+Math.PI*3)%(Math.PI*2)-Math.PI;return Math.abs(d)/20;
}
// The lap's edge line runs dashed through the mouths: the lap s ranges (whole 2 m lap segments) where open-circuit.js
// leaves its solid line out on the branch's side, the side, and the segments themselves.
export function lapLineCuts(data){
 const a=data.samples,out=[];
 for(const B of branchLayouts(data))for(const [m0,m1] of B.mouths){
  let i0=a.findIndex(p=>p[0]>m0);i0=Math.max(0,i0-1);let i1=a.findIndex(p=>p[0]>=m1);if(i1<0)i1=a.length-1;
  out.push({side:B.geo.side,from:a[i0][0],to:a[i1][0],i0,i1});
 }
 return out;
}
