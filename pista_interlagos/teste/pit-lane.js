const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Fictional service lane on the inside of Curvelo's main straight, with the garage row
// behind it where it runs at its full offset: Box 99 at s = 20, the Lanchonete da Tia
// in the bay before it. Box 99 is open, so its floor carries the lane to the back wall.
export const CURVELO_PIT=Object.freeze({offset:20,halfWidth:3.3,box:20,bay:13,bays:9,index:5,depth:16,block:16.8});
export function pitLane(data,s){
 if(data.meta.id!=='curvelo')return null;
 const u=(s+150)%1250;if(u>300)return null;
 const P=CURVELO_PIT,blend=smooth(u/80)*(1-smooth((u-220)/80)),offset=P.offset*blend,garage=Math.abs(u-150-P.box)<=P.bay/2-.45;
 return {offset,halfWidth:P.halfWidth,reach:offset+P.halfWidth+(garage?P.depth:0),u,entry:u<80,exit:u>220};
}
// Service box painted on the working lane (the half of the lane next to the garages).
export function inPitBox(surface){const P=CURVELO_PIT;return !!surface.pit&&Math.abs(surface.s-P.box)<2.2&&Math.abs(surface.d-P.offset-P.halfWidth/2)<1;}
// Curvelo's service lane written like the surveyed Interlagos pit block (columns and
// stations along the lane centre, d from it), so its garages and Box 99 are built the
// same way; its walls close the garage fronts, Box 99 and the ends of the row to cars.
export function curveloPitFrame(data){
 const P=CURVELO_PIT,a=data.samples,L=data.meta.reconstructed_xy_m,F=P.halfWidth,s99=P.box,B=P.bay/2,cafe=s99-P.bay,g0=s99-B-P.index*P.bay,g1=g0+P.bays*P.bay;
 const track=s=>{s=((s%L)+L)%L;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}const p=a[lo],q=a[(lo+1)%a.length],u=(s-p[0])/((lo===a.length-1?L:q[0])-p[0]);return p.map((v,k)=>v+(q[k]-v)*u);};
 const point=(s,d)=>{const p=track(s),n=Math.hypot(p[7],p[8]),tx=p[7]/n,ty=p[8]/n;return [p[1]-ty*(P.offset+d),p[2]+tx*(P.offset+d),3.03,tx,ty];};
 const samples=[];for(let s=-72;s<=72;s+=2){const [x,y,z,tx,ty]=point(s,0);samples.push([s,x,y,z,-F,F,0,0,tx,ty,-ty,tx,-F,F,0]);}
 const line=(s0,s1,d,thickness)=>{const n=Math.max(1,Math.ceil(Math.abs(s1-s0)/2)),pts=[];for(let i=0;i<=n;i++){const [x,y,z]=point(s0+(s1-s0)*i/n,d);pts.push([x,y,z,thickness]);}return pts;};
 const at=(s,d,t)=>[...point(s,d).slice(0,3),t],back=F+.35+P.block;
 const walls=[
  {name:'Muro_externo_boxes',points:line(g0,s99-B,F+.35,.4),height:1,fence:0},{name:'Muro_externo_boxes',points:line(s99+B,g1,F+.35,.4),height:1,fence:0},
  {name:'Box99_paredes',points:[at(s99+B,F+.2,.3),at(s99+B,F+P.depth+.3,.3),at(cafe-B,F+P.depth+.3,.3),at(cafe-B,F+.2,.3),at(s99-B,F+.2,.3)],height:5.2,fence:0},
  {name:'Box99_divisoria',points:[at(s99-B,F+.6,.12),at(s99-B,F+4.3,.12)],height:1.1,fence:0},{name:'Box99_divisoria',points:[at(s99-B,F+5.7,.12),at(s99-B,F+P.depth,.12)],height:1.1,fence:0},
  {name:'Box_extremidades',points:[at(g0,F+.15,.4),at(g0,back,.4)],height:8.2,fence:0},{name:'Box_extremidades',points:[at(g1,F+.15,.4),at(g1,back,.4)],height:8.2,fence:0},
 ];
 return {columns:['s','x','y','z','lo','hi','bank','grade','tx','ty','lx','ly','lane_lo','lane_hi','fast_hi'],samples,length_m:144,garages:[g0,g1],walls,
  box99:{index:P.index,s:s99,bay:P.bay,cafe_s:cafe,front:F,depth:P.depth},
  // Garage block depth (the infield guardrail runs just behind it), how far it sinks into
  // the falling infield, and the team stand on the grass between the track and the lane.
  block:P.block,sink:1.6,stand:{d:-7.6,thickness:3.2,top:.42}};
}

// Surveyed pit lane (Interlagos): its own centre line, paved band, profile and walls. Its
// stations always keep the garages on their left (d > 0). With the garages on the cars' right
// (Brasília, clockwise, boxes inside the main straight) the block runs from the lane's exit to
// its entry and says `reversed: true`: turned half round, never mirrored, so the garage row,
// Box 99 and the walls are built the same way; pitRoute (race-field.js) and the lane paint
// (interlagos-pit.js) follow the cars instead.
// Segments are bucketed in a coarse grid so every surface query stays cheap.
const CELL=20,cache=new WeakMap();
const key=(ix,iy)=>ix*65536+iy;
function bucket(grid,x0,y0,x1,y1,value){
 for(let ix=Math.floor(x0/CELL);ix<=Math.floor(x1/CELL);ix++)for(let iy=Math.floor(y0/CELL);iy<=Math.floor(y1/CELL);iy++){
  const k=key(ix,iy);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(value);
 }
}
export function pitGeometry(data){
 if(cache.has(data))return cache.get(data);
 // Curvelo has no surveyed lane (see pitLane), only the walls of its garage row.
 const P=data.pit??(data.meta?.id==='curvelo'?{...curveloPitFrame(data),samples:[],limit:null}:null);if(!P)return null;
 const c=Object.fromEntries(P.columns.map((name,i)=>[name,i])),a=P.samples,grid=new Map(),L=data.meta.reconstructed_xy_m;
 for(let i=0;i+1<a.length;i++){
  const p=a[i],q=a[i+1],reach=Math.max(-p[c.lo],p[c.hi],-q[c.lo],q[c.hi])+6;
  bucket(grid,Math.min(p[c.x],q[c.x])-reach,Math.min(p[c.y],q[c.y])-reach,Math.max(p[c.x],q[c.x])+reach,Math.max(p[c.y],q[c.y])+reach,i);
 }
 // The walls' segments also as physics.js barrierHit meets them (branch-lane.js's fields): each wall's two ends free,
 // met from either side (ox, oy 0).
 const walls=[],wallGrid=new Map();
 for(const wall of P.walls)for(let i=0,last=wall.points.length-2;i<=last;i++){
  const [x1,y1,z1,t1]=wall.points[i],[x2,y2,z2,t2]=wall.points[i+1],half=(t1+t2)/4,segment={x1,y1,x2,y2,half,name:wall.name,top:Math.max(z1,z2)+wall.height,low:wall.height<=1.15&&!wall.fence,free1:i===0,free2:i===last,ox:0,oy:0};
  walls.push(segment);bucket(wallGrid,Math.min(x1,x2)-4-half,Math.min(y1,y2)-4-half,Math.max(x1,x2)+4+half,Math.max(y1,y2)+4+half,segment);
 }
 const geo={c,a,grid,walls,wallGrid,length:P.length_m,limit:P.limit,lapLength:L,entryMainS:P.entry_main_s,exitMainS:P.exit_main_s};
 cache.set(data,geo);return geo;
}
// Nearest pit-lane station, or null away from it. d is positive to the lane's left.
export function locatePit(geo,x,y){
 const list=geo.grid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)));if(!list)return null;
 const {a,c}=geo;let best=Infinity,hit=-1,hu=0;
 for(const i of list){
  const p=a[i],q=a[i+1],dx=q[c.x]-p[c.x],dy=q[c.y]-p[c.y],len2=dx*dx+dy*dy;
  let u=((x-p[c.x])*dx+(y-p[c.y])*dy)/len2;u=u<0?0:u>1?1:u;
  const ex=x-p[c.x]-u*dx,ey=y-p[c.y]-u*dy,d2=ex*ex+ey*ey;
  if(d2<best){best=d2;hit=i;hu=u;}
 }
 if(hit<0)return null;
 const p=a[hit],q=a[hit+1],mix=k=>p[k]+(q[k]-p[k])*hu;
 const tx=mix(c.tx),ty=mix(c.ty),n=Math.hypot(tx,ty),ux=tx/n,uy=ty/n,lx=-uy,ly=ux;
 const px=mix(c.x),py=mix(c.y),along=(x-px)*ux+(y-py)*uy,d=(x-px)*lx+(y-py)*ly,s=mix(c.s)+along;
 // Beyond the first or last station the lane has ended.
 if(s<0||s>geo.length)return null;
 // main_s grows along the stations, or shrinks on a block written against the cars (data.pit.reversed).
 let m0=p[c.main_s],m1=q[c.main_s];const L=geo.lapLength;if(m1-m0<-L/2)m1+=L;else if(m1-m0>L/2)m1-=L;
 const grade=mix(c.grade),bank=mix(c.bank);
 return {i:hit,u:hu,s,d,lo:mix(c.lo),hi:mix(c.hi),laneLo:mix(c.lane_lo),laneHi:mix(c.lane_hi),z:mix(c.z)+grade*along,bank,grade,tx:ux,ty:uy,lx,ly,mainS:((m0+(m1-m0)*hu)%L+L)%L};
}
// Box 99 service spot: painted on the working lane in front of the team garage.
// During the race the car stops here, along the lane; the garage behind stays open.
export function serviceSpot(pit){
 const b=pit?.box99;if(!b)return null;
 const c=Object.fromEntries(pit.columns.map((name,i)=>[name,i])),a=pit.samples;let k=0;while(k<a.length-2&&a[k+1][c.s]<=b.s)k++;
 const p=a[k],q=a[k+1],u=(b.s-p[c.s])/(q[c.s]-p[c.s]),mix=j=>p[j]+(q[j]-p[j])*u;
 return {s:b.s,d:(mix(c.fast_hi)+mix(c.lane_hi))/2,length:7.2,width:3.8,heading:Math.atan2(mix(c.ty),mix(c.tx))};
}
// Garage bays along a pit block and the rival teams in them: teams take the closed
// garages nearest Box 99 (Box 99 and the café beside it stay open), in roster order.
export function garageBays(pit,teams){
 const bays=Math.max(1,Math.round((pit.garages[1]-pit.garages[0])/13)),bay=(pit.garages[1]-pit.garages[0])/bays,b99=pit.box99,index=b99?.index??0;
 const open=new Set(b99?[b99.index,b99.index-1]:[]),closed=[...Array(bays).keys()].filter(i=>!open.has(i)).sort((i,j)=>Math.abs(i-index)-Math.abs(j-index)||i-j);
 return {bays,bay,open,team:new Map(closed.slice(0,teams).map((b,k)=>[b,k]))};
}
// Point of a pit block at lane distance s and offset d: world x, y (lane plane), z,
// the lane heading and the paved edge on the garage side.
export function pitPoint(pit,s,d=0){
 const c=Object.fromEntries(pit.columns.map((name,i)=>[name,i])),a=pit.samples;let lo=0,hi=a.length-2;
 while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][c.s]<=s)lo=m;else hi=m-1;}
 const p=a[lo],q=a[lo+1],u=Math.max(0,Math.min(1,(s-p[c.s])/(q[c.s]-p[c.s]))),mix=k=>p[k]+(q[k]-p[k])*u;
 return {x:mix(c.x)+mix(c.lx)*d,y:mix(c.z)+mix(c.bank)*d,z:-(mix(c.y)+mix(c.ly)*d),heading:Math.atan2(mix(c.ty),mix(c.tx)),hi:mix(c.hi),lo:mix(c.lane_lo)};
}
// Car centre inside the painted box (the box is longer and wider than the Opala).
export function inServiceSpot(spot,surface){return !!spot&&!!surface.pit&&surface.pitS!==null&&Math.abs(surface.pitS-spot.s)<2.2&&Math.abs(surface.pitD-spot.d)<1;}
export function pitLimit(geo,surface){
 const lim=geo?.limit;return lim&&surface.pit&&surface.pitS>=lim.from&&surface.pitS<=lim.to?lim.kmh/3.6:null;
}
// Pit walls within r of a person at (x, y): data coordinates, for walking on foot.
export function wallsNear(geo,x,y,r){
 const list=geo.wallGrid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)));if(!list)return [];
 return list.filter(w=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,len2=dx*dx+dy*dy||1e-9;let u=((x-w.x1)*dx+(y-w.y1)*dy)/len2;u=u<0?0:u>1?1:u;return Math.hypot(x-w.x1-u*dx,y-w.y1-u*dy)<w.half+r;});
}
// Lane station nearest to (x, y) on a pit block (surveyed or Curvelo's): s along it,
// d across it and the garage front line there. Works on the block's own samples, so
// it also serves Curvelo, whose pit geometry has no lane.
const columnCache=new WeakMap();
export function pitFrameAt(pit,x,y){
 let c=columnCache.get(pit);if(!c){c=Object.fromEntries(pit.columns.map((name,i)=>[name,i]));columnCache.set(pit,c);}
 const a=pit.samples;let best=Infinity,hit=-1,hu=0;
 for(let i=0;i+1<a.length;i++){
  const p=a[i],q=a[i+1],dx=q[c.x]-p[c.x],dy=q[c.y]-p[c.y],len2=dx*dx+dy*dy||1e-9;let u=((x-p[c.x])*dx+(y-p[c.y])*dy)/len2;u=u<0?0:u>1?1:u;
  const ex=x-p[c.x]-u*dx,ey=y-p[c.y]-u*dy,d2=ex*ex+ey*ey;if(d2<best){best=d2;hit=i;hu=u;}
 }
 if(hit<0)return null;
 const p=a[hit],q=a[hit+1],mix=k=>p[k]+(q[k]-p[k])*hu,n=Math.hypot(mix(c.tx),mix(c.ty)),tx=mix(c.tx)/n,ty=mix(c.ty)/n,ex=x-mix(c.x),ey=y-mix(c.y);
 return {s:mix(c.s)+ex*tx+ey*ty,d:-ex*ty+ey*tx,front:mix(c.hi)+.35};
}
// Deepest overlap between the car footprint and the pit walls, if any.
// body: the car's plan (physics.js OPALA_BODY, FUSCA_BODY): its box, halfLength by halfWidth, sits wallAhead
// forward of (x, y); the default is the Opala's.
const OPALA_PLAN={halfLength:2.38,halfWidth:.93,wallAhead:0};
export function wallContact(geo,x,y,heading,body=OPALA_PLAN){
 const fx=Math.cos(heading),fy=Math.sin(heading);x+=fx*body.wallAhead;y+=fy*body.wallAhead;
 const list=geo.wallGrid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)));if(!list)return null;let best=null;
 for(const w of list){
  const dx=w.x2-w.x1,dy=w.y2-w.y1,len2=dx*dx+dy*dy||1e-9;let u=((x-w.x1)*dx+(y-w.y1)*dy)/len2;u=u<0?0:u>1?1:u;
  const cx=w.x1+u*dx,cy=w.y1+u*dy;let nx=x-cx,ny=y-cy;const dist=Math.hypot(nx,ny);if(dist>3.5+w.half)continue;
  if(dist<1e-6){nx=-dy;ny=dx;}const nl=Math.hypot(nx,ny);nx/=nl;ny/=nl;
  // Footprint half-extent of the car's box along the contact normal.
  const extent=body.halfLength*Math.abs(nx*fx+ny*fy)+body.halfWidth*Math.abs(-nx*fy+ny*fx),depth=extent+w.half-dist;
  if(depth>0&&(!best||depth>best.depth))best={depth,nx,ny,name:w.name};
 }
 return best;
}
