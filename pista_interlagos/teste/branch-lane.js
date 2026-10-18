// Branch roads (data.branches; gerar_pampulha.py ramal_da_avenida): a second road that leaves the lap on one side and
// rejoins it further on. Both ways are the lap: a car on a branch keeps counting the lap's distance through main_s, the
// lap's s each branch station stands for (the projection where the two roads run together, linear where they part).
// A block carries its stations (s along it, x, y, z, width, bank to the left, grade, unit tangent, left normal, main_s,
// kerbs, the clearance from the asphalt to each wall), its wall faces (x, y, z, thickness; the noses between the two
// roads included), the gaps it opens in the lap's wall on its side (main_gaps, square ends) and its rails in branch s.
// Same bucketed grid as the pit lane (pit-lane.js), one geometry per block; wallContact (pit-lane.js) works on it.
const CELL=20,cache=new WeakMap();
const key=(ix,iy)=>ix*65536+iy;
function bucket(grid,x0,y0,x1,y1,value){
 for(let ix=Math.floor(x0/CELL);ix<=Math.floor(x1/CELL);ix++)for(let iy=Math.floor(y0/CELL);iy<=Math.floor(y1/CELL);iy++){
  const k=key(ix,iy);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(value);
 }
}
// Street walls: Jersey barrier with the fence on top, as the lap's (street-walls.js).
const WALL_HEIGHT=1,WALL_FENCE=1;
function geometry(data,B,index){
 const c=Object.fromEntries(B.columns.map((name,i)=>[name,i])),a=B.samples,grid=new Map();
 for(let i=0;i+1<a.length;i++){
  const p=a[i],q=a[i+1],reach=Math.max(p[c.width],q[c.width])/2+Math.max(p[c.wall_left_m],p[c.wall_right_m],q[c.wall_left_m],q[c.wall_right_m])+6;
  bucket(grid,Math.min(p[c.x],q[c.x])-reach,Math.min(p[c.y],q[c.y])-reach,Math.max(p[c.x],q[c.x])+reach,Math.max(p[c.y],q[c.y])+reach,i);
 }
 const walls=[],wallGrid=new Map();
 for(const wall of B.walls??[])for(let i=0;i+1<wall.points.length;i++){
  const [x1,y1,z1,t1]=wall.points[i],[x2,y2,z2,t2]=wall.points[i+1],height=wall.height??WALL_HEIGHT,half=(t1+t2)/4;
  const segment={x1,y1,x2,y2,half,name:wall.name,top:Math.max(z1,z2)+height,low:height<=1.15&&!(wall.fence??WALL_FENCE)};
  walls.push(segment);bucket(wallGrid,Math.min(x1,x2)-4-half,Math.min(y1,y2)-4-half,Math.max(x1,x2)+4+half,Math.max(y1,y2)+4+half,segment);
 }
 return {index,id:B.id,name:B.name,label:B.label,side:B.side,block:B,c,a,grid,walls,wallGrid,length:B.length_m,lapLength:data.meta.reconstructed_xy_m,
  entryMainS:B.entry_main_s,exitMainS:B.exit_main_s,split:B.split_main_s,mainGaps:B.main_gaps??[],rails:B.rails??{},noses:B.noses??[]};
}
// Every branch of a track (an empty list on tracks without one).
export function branchGeometries(data){
 if(cache.has(data))return cache.get(data);
 const list=(data.branches??[]).map((B,i)=>geometry(data,B,i));
 cache.set(data,list);return list;
}
// Nearest station of one branch to (x, y), or null away from it or beyond its ends. d is positive to the branch's left;
// z is the centre line's height at the foot (as locatePit: the road plane under (x, y) is z + bank * d); mainS the
// lap's s there.
export function locateBranch(geo,x,y){
 const list=geo.grid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)));if(!list)return null;
 const {a,c}=geo;let best=Infinity,hit=-1,hu=0;
 for(const i of list){
  const p=a[i],q=a[i+1],dx=q[c.x]-p[c.x],dy=q[c.y]-p[c.y],len2=dx*dx+dy*dy||1e-9;
  let u=((x-p[c.x])*dx+(y-p[c.y])*dy)/len2;u=u<0?0:u>1?1:u;
  const ex=x-p[c.x]-u*dx,ey=y-p[c.y]-u*dy,d2=ex*ex+ey*ey;
  if(d2<best){best=d2;hit=i;hu=u;}
 }
 if(hit<0)return null;
 const p=a[hit],q=a[hit+1],mix=k=>p[k]+(q[k]-p[k])*hu;
 const tx=mix(c.tx),ty=mix(c.ty),n=Math.hypot(tx,ty),ux=tx/n,uy=ty/n,lx=-uy,ly=ux;
 const px=mix(c.x),py=mix(c.y),along=(x-px)*ux+(y-py)*uy,d=(x-px)*lx+(y-py)*ly,s=mix(c.s)+along;
 if(s<0||s>geo.length)return null;
 const grade=mix(c.grade),bank=mix(c.bank),L=geo.lapLength;
 return {branch:geo.index,i:hit,u:hu,s,d,width:mix(c.width),z:mix(c.z)+grade*along,bank,grade,tx:ux,ty:uy,lx,ly,
  mainS:((mix(c.main_s)+along*(q[c.main_s]-p[c.main_s])/Math.max(1e-6,q[c.s]-p[c.s]))%L+L)%L,
  wallLeft:mix(c.wall_left_m),wallRight:mix(c.wall_right_m),kerbLeft:mix(c.kerb_left),kerbRight:mix(c.kerb_right)};
}
// The branch station at branch distance s (clamped to the ends), offset d to the left: data coordinates x, y, z (road
// plane), the heading and the lap's s; its bank, grade and kerb flags too.
export function branchPoint(geo,s,d=0){
 const {a,c}=geo;let lo=0,hi=a.length-2;s=Math.max(0,Math.min(geo.length,s));
 while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][c.s]<=s)lo=m;else hi=m-1;}
 const p=a[lo],q=a[lo+1],u=Math.max(0,Math.min(1,(s-p[c.s])/(q[c.s]-p[c.s]))),mix=k=>p[k]+(q[k]-p[k])*u;
 return {x:mix(c.x)+mix(c.lx)*d,y:mix(c.y)+mix(c.ly)*d,z:mix(c.z)+mix(c.bank)*d,heading:Math.atan2(mix(c.ty),mix(c.tx)),
  width:mix(c.width),mainS:mix(c.main_s),tx:mix(c.tx),ty:mix(c.ty),lx:mix(c.lx),ly:mix(c.ly),bank:mix(c.bank),grade:mix(c.grade),
  kerbRight:p[c.kerb_right]&&q[c.kerb_right]?1:0,kerbLeft:p[c.kerb_left]&&q[c.kerb_left]?1:0};
}
// The stretch of the lap where a branch is a road of its own (lap s, [from, to]): from the first gap it opens in the
// lap's wall to the last. Before and after it the two roads are one (the branch's first and last stations are the lap's).
export function branchSpan(geo){const g=geo.mainGaps;return g.length?[Math.min(...g.map(r=>r[0])),Math.max(...g.map(r=>r[1]))]:[geo.entryMainS,geo.exitMainS];}
// Branch distance for a lap s inside the branch's span (main_s grows along the stations), or null outside it.
export function branchS(geo,mainS){
 const {a,c}=geo,L=geo.lapLength;let m=mainS;const m0=a[0][c.main_s],m1=a[a.length-1][c.main_s];
 if(m<m0-L/2)m+=L;else if(m>m1+L/2)m-=L;if(m<m0||m>m1)return null;
 let lo=0,hi=a.length-2;while(lo<hi){const k=(lo+hi+1)>>1;if(a[k][c.main_s]<=m)lo=k;else hi=k-1;}
 const p=a[lo],q=a[lo+1],u=(m-p[c.main_s])/Math.max(1e-6,q[c.main_s]-p[c.main_s]);
 return p[c.s]+(q[c.s]-p[c.s])*Math.max(0,Math.min(1,u));
}
// The branch's walls as the cars meet them (physics.js barrierHit): each side wall's polyline is the foot of its face, so
// its segments stand back from it by their half thickness and reach (how far past the foot the body's plan may go:
// physics.js WALL_REACH); a side wall ending within JOIN of an end of the lap's wall on that side (ends: [{side, x, y}],
// the feet of the lap's faces there) runs on to it, as street-walls.js draws the two joined; the noses (side 0) as they
// are. Segments {x1, y1, x2, y2, half, name, free1, free2 (that end of the wall stands free), ox, oy (a side wall's
// outward unit vector: it holds cars on its road's side only, behind it the lap's own wall does; 0 for a nose, met from
// either side)}; {walls, wallGrid}, cached per geometry; barrierNear lists those round a point.
const JOIN=6,JUNCTION=1.5,barriers=new WeakMap();
export function branchBarrier(geo,reach=0,ends=[]){
 if(barriers.has(geo))return barriers.get(geo);
 const walls=[],wallGrid=new Map();
 const add=(x1,y1,x2,y2,half,name,free1=false,free2=false,ox=0,oy=0)=>{const segment={x1,y1,x2,y2,half,name,free1,free2,ox,oy};walls.push(segment);bucket(wallGrid,Math.min(x1,x2)-4-half,Math.min(y1,y2)-4-half,Math.max(x1,x2)+4+half,Math.max(y1,y2)+4+half,segment);};
 for(const wall of geo.block.walls??[]){
  const P=wall.points,side=Math.sign(wall.side??0);
  if(!side){for(let i=0;i+1<P.length;i++)add(P[i][0],P[i][1],P[i+1][0],P[i+1][1],(P[i][3]+P[i+1][3])/4,wall.name);continue;}
  // Outward (away from the road): the side's way across the polyline, which runs along the branch.
  const seg=[];for(let i=0;i+1<P.length;i++){const dx=P[i+1][0]-P[i][0],dy=P[i+1][1]-P[i][1],l=Math.hypot(dx,dy);if(l>1e-6)seg.push({x1:P[i][0],y1:P[i][1],x2:P[i+1][0],y2:P[i+1][1],ox:-dy/l*side,oy:dx/l*side,half:(P[i][3]+P[i+1][3])/4});}
  if(!seg.length)continue;
  // (An end meeting an end of the lap's wall, of either side, is a junction, not a free end: the right wall's ends at the
  // tips of the V where it crosses the lap's left wall.)
  const free=[true,true];
  for(const first of [true,false]){
   const e=first?seg[0]:seg.at(-1),x=first?e.x1:e.x2,y=first?e.y1:e.y2;let best=null,bd=JOIN;
   if(ends.some(end=>Math.hypot(end.x-x,end.y-y)<JUNCTION))free[first?0:1]=false;
   for(const end of ends){if(end.side!==side)continue;const d=Math.hypot(end.x-x,end.y-y);if(d>.05&&d<bd){bd=d;best=end;}}
   if(!best)continue;const join={...e,x1:first?best.x:x,y1:first?best.y:y,x2:first?x:best.x,y2:first?y:best.y};
   if(first)seg.unshift(join);else seg.push(join);free[first?0:1]=false;
  }
  seg.forEach((g,i)=>{const o=g.half+reach;add(g.x1+g.ox*o,g.y1+g.oy*o,g.x2+g.ox*o,g.y2+g.oy*o,g.half,wall.name,i===0&&free[0],i===seg.length-1&&free[1],g.ox,g.oy);});
 }
 const out={walls,wallGrid};barriers.set(geo,out);return out;
}
// The barrier's segments that may reach within 4 m of (x, y).
export function barrierNear(barrier,x,y){return barrier.wallGrid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)))??[];}
// Is lap s inside a gap a branch opens in the lap's wall on this side (1 left, -1 right)? Those ends are square: the
// branch's asphalt runs on past them.
export function inBranchGap(data,s,side){
 for(const g of branchGeometries(data))if(g.side===side)for(const [a,b] of g.mainGaps)if(s>=a&&s<=b)return true;
 return false;
}
// Distance from lap s to the nearest end of a branch gap on this side (Infinity without one; side 1 left, -1 right).
export function branchGapEnd(data,s,side){
 let best=Infinity;
 for(const g of branchGeometries(data))if(g.side===side)for(const [a,b] of g.mainGaps)best=Math.min(best,Math.abs(s-a),Math.abs(s-b));
 return best;
}
