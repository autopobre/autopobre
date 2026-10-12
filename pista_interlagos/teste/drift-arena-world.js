// Arena de Drift, what the car meets on the floor (drift-arena.js has the shapes): the stadium's wall at the floor's
// edge, the solid items (concrete blocks, tyre walls, the islands' posts, the start gate's posts), the light ones it
// knocks about (cones, tyre stacks), the planters' grass and kerbs under the wheels, and where the painted zones and
// clips are for the score (drift-score.js). Plan frame (x east, y north). No three.js here: Node tests drive it.
import {ARENA,floorEdge,ITEM_KINDS,MEIA_LUA,ILHA,ZONE_WIDTH,CLIP_REACH,GATE_WIDTH} from './drift-arena.js';
import {SUSPENSION_WHEELS} from './physics.js';

const CAR_MASS=1250,G=9.81;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// The body's plan tried against the wall: points along its sides and ends (as physics.js BODY_POINTS).
const BODY_POINTS=[-1,-.75,-.5,-.25,0,.25,.5,.75,1].flatMap(u=>[[u,-1],[u,1]]).concat([-.5,0,.5].flatMap(w=>[[1,w],[-1,w]]));
// Contacts: how much of the speed into a thing comes back (restitution), and how hard it scrapes along it.
const WALL={bounce:.22,scrape:.3},SOLID={bounce:.3,scrape:.35};
// A kerb's ridges: 4 cm up, ridges every 0.4 m.
const KERB_LIFT=.03,KERB_RIDGE=.015,RIDGE=.4;
const REAR=SUSPENSION_WHEELS.filter(w=>!w.front);

// One item's parts in the world: solids (circles {x,y,r}), surfaces (grass, kerbs), rear-wheel zones and clips.
function itemParts(item,index){
 const {kind,x,y,a}=item,c=Math.cos(a),s=Math.sin(a),size=item.size??ITEM_KINDS[kind].size,parts={solids:[],surfaces:[],zones:[],clips:[],gate:null,prop:null};
 // A straight barrier as a row of overlapping circles (a capsule): exact enough for a car's corner.
 const row=(length,radius)=>{const n=Math.max(2,Math.ceil(length/(radius*1.2)));for(let k=0;k<=n;k++){const u=-length/2+length*k/n;parts.solids.push({x:x+c*u,y:y+s*u,r:radius,item:index});}};
 if(kind==='cone'||kind==='pneus')parts.prop={item:index,kind,x,y,a,r:ITEM_KINDS[kind].radius,mass:ITEM_KINDS[kind].mass};
 else if(kind==='muro')row(size,.45);
 else if(kind==='bloco')row(size,.33);
 else if(kind==='ilha'){
  parts.surfaces.push({type:'disc',x,y,grass:size,kerb:size+ILHA.kerb,item:index});
  parts.solids.push({x,y,r:ILHA.post,item:index});
 }else if(kind==='meia_lua'){
  // The arc's centre is `size` ahead of the item's point (the middle of its inner edge).
  const cx=x+c*size,cy=y+s*size,mid=a+Math.PI,R=size,K=MEIA_LUA.kerb;
  parts.surfaces.push({type:'arc',x:cx,y:cy,mid,span:MEIA_LUA.span,kerbIn:[R,R+K],grass:[R+K,R+K+MEIA_LUA.grass],kerbOut:[R+K+MEIA_LUA.grass,R+2*K+MEIA_LUA.grass],item:index});
  parts.zones.push({type:'arc',x:cx,y:cy,mid,span:MEIA_LUA.span,r0:R-MEIA_LUA.band,r1:R,length:R*MEIA_LUA.span,item:index,kind});
 }else if(kind==='zona')parts.zones.push({type:'band',x,y,c,s,half:size/2,width:ZONE_WIDTH,length:size,item:index,kind});
 else if(kind==='clip')parts.clips.push({x,y,item:index});
 else if(kind==='largada'){
  const lx=-s,ly=c,h=GATE_WIDTH/2+.6;
  parts.gate={x,y,c,s,half:GATE_WIDTH/2,item:index};
  for(const side of [-1,1])parts.solids.push({x:x+lx*h*side,y:y+ly*h*side,r:.3,item:index});
 }
 return parts;
}

export class ArenaWorld{
 constructor(layout={items:[]}){this.setLayout(layout);}
 setLayout(layout){
  this.layout=layout;this.solids=[];this.surfaces=[];this.zones=[];this.clips=[];this.props=[];this.gate=null;
  layout.items.forEach((item,i)=>{const p=itemParts(item,i);this.solids.push(...p.solids);this.surfaces.push(...p.surfaces);this.zones.push(...p.zones);this.clips.push(...p.clips);if(p.gate)this.gate=p.gate;if(p.prop)this.props.push(p.prop);});
  this.version=(this.version??0)+1;this.resetProps();this.hits=0;this.wallHits=0;
  return this;
 }
 // Every cone and tyre stack back where it was put, standing.
 resetProps(){for(const p of this.props){const item=this.layout.items[p.item];Object.assign(p,{x:item.x,y:item.y,a:item.a,z:0,vx:0,vy:0,vz:0,spin:0,tilt:0,tiltRate:0,down:false,hit:false,moved:0});}this.knocked=0;}
 // Under a wheel at (x, y): null on the asphalt; {loose} on a planter's grass; {lift} on a kerb.
 surface(x,y){
  for(const q of this.surfaces){
   const dx=x-q.x,dy=y-q.y,r=Math.hypot(dx,dy);
   if(q.type==='disc'){if(r>q.kerb)continue;if(r<q.grass)return {loose:true};return {lift:kerbLift(Math.atan2(dy,dx)*r)};}
   if(r<q.kerbIn[0]||r>q.kerbOut[1]||Math.abs(wrap(Math.atan2(dy,dx)-q.mid))>q.span/2)continue;
   if(r>=q.grass[0]&&r<=q.grass[1])return {loose:true};
   return {lift:kerbLift(Math.atan2(dy,dx)*r)};
  }
  return null;
 }
 // The car against the wall, the solids and the props after its step: pushed out, its speed into them taken away
 // (an impulse at the point that touched, so a corner clipped spins it). Returns the hardest impact (m/s).
 collide(car){
  const b=car.body;let impact=0;
  for(let pass=0;pass<2;pass++){
   const ch=Math.cos(car.heading),sh=Math.sin(car.heading);let hit=null;
   for(const [u,w] of BODY_POINTS){
    const fx=b.wallAhead+u*b.halfLength,fy=w*b.halfWidth,px=car.x+ch*fx-sh*fy,py=car.y+sh*fx+ch*fy,e=floorEdge(px,py);
    if(e.d>0&&!(hit?.depth>=e.d))hit={depth:e.d,nx:e.nx,ny:e.ny,rx:px-car.x,ry:py-car.y};
   }
   if(!hit)break;
   car.x-=hit.nx*hit.depth;car.y-=hit.ny*hit.depth;
   const v=this.contact(car,hit,WALL);if(v>0){impact=Math.max(impact,v);this.wallHits++;}
  }
  for(const q of this.solids){const hit=this.touch(car,q.x,q.y,q.r);if(!hit)continue;car.x-=hit.nx*hit.depth;car.y-=hit.ny*hit.depth;impact=Math.max(impact,this.contact(car,hit,SOLID));}
  for(const p of this.props){
   const hit=this.touch(car,p.x,p.y,p.r);if(!hit)continue;
   // Light against the car: the prop takes nearly all of the push. Its speed after is the car's point's along
   // the normal (and some more: it bounces off), the car loses its share of the momentum.
   const pv=pointVelocity(car,hit.rx,hit.ry),into=(pv[0]-p.vx)*hit.nx+(pv[1]-p.vy)*hit.ny;
   p.x+=hit.nx*hit.depth;p.y+=hit.ny*hit.depth;
   if(into<=0)continue;
   const k=car.inverseMass([hit.rx,hit.ry,0],hit.nx,hit.ny,0)/CAR_MASS,j=1.5*into/(1/p.mass+k);
   p.vx+=hit.nx*j/p.mass+pv[0]*.25;p.vy+=hit.ny*j/p.mass+pv[1]*.25;
   car.impulse([hit.rx,hit.ry,0],-hit.nx*j/CAR_MASS,-hit.ny*j/CAR_MASS,0);
   // Hit hard enough, it is thrown up and over; a tyre stack falls only to a real knock.
   const fast=Math.hypot(p.vx,p.vy);
   if(p.kind==='cone'&&fast>2||p.kind==='pneus'&&fast>7){p.vz=Math.max(p.vz,Math.min(5,fast*.28));p.tiltRate=(Math.random()<.5?-1:1)*(4+fast*.6);p.down=true;}
   p.spin+=(Math.random()-.5)*fast*1.6;
   if(!p.hit){p.hit=true;this.knocked++;}
   this.hits++;impact=Math.max(impact,p.kind==='pneus'?into*.25:0);
  }
  return impact;
 }
 // The point of the car's plan (its box, as the walls see it) nearest a circle, if inside it.
 touch(car,cx,cy,r){
  const b=car.body,ch=Math.cos(car.heading),sh=Math.sin(car.heading),dx=cx-car.x,dy=cy-car.y;
  // Quick reject: farther than the box's half diagonal plus the radius.
  if(dx*dx+dy*dy>(b.halfLength+Math.abs(b.wallAhead)+b.halfWidth+r)**2)return null;
  const lx=dx*ch+dy*sh-b.wallAhead,ly=-dx*sh+dy*ch,qx=clamp(lx,-b.halfLength,b.halfLength),qy=clamp(ly,-b.halfWidth,b.halfWidth);
  let nx,ny,depth;
  if(qx===lx&&qy===ly){
   // The centre inside the box: out through the nearest side.
   const ex=b.halfLength-Math.abs(lx),ey=b.halfWidth-Math.abs(ly);
   if(ex<ey){nx=Math.sign(lx)||1;ny=0;depth=ex+r;}else{nx=0;ny=Math.sign(ly)||1;depth=ey+r;}
  }else{
   const ox=lx-qx,oy=ly-qy,d=Math.hypot(ox,oy);if(d>=r)return null;
   nx=ox/d;ny=oy/d;depth=r-d;
  }
  // Back to the world: the normal points from the car to the circle; the touching point on the car's plan.
  const wx=nx*ch-ny*sh,wy=nx*sh+ny*ch,px=qx+b.wallAhead,py=qy;
  return {depth,nx:wx,ny:wy,rx:px*ch-py*sh,ry:px*sh+py*ch};
 }
 // A car point (rx, ry from its centre of mass) moving into a fixed thing along n: the impulse that stops it
 // there, bounce and scraping friction included. Returns the speed it came in with.
 contact(car,hit,{bounce,scrape}){
  const r=[hit.rx,hit.ry,0],pv=pointVelocity(car,hit.rx,hit.ry),into=pv[0]*hit.nx+pv[1]*hit.ny;
  if(into<=0)return 0;
  const j=(1+bounce)*into/car.inverseMass(r,hit.nx,hit.ny,0);
  car.impulse(r,-hit.nx*j,-hit.ny*j,0);
  // Friction along the face, at most what stops the sliding.
  const after=pointVelocity(car,hit.rx,hit.ry),tx=-hit.ny,ty=hit.nx,slide=after[0]*tx+after[1]*ty,f=Math.min(Math.abs(slide)/car.inverseMass(r,tx,ty,0),scrape*j)*Math.sign(slide);
  car.impulse(r,-tx*f,-ty*f,0);
  return into;
 }
 // The props fly, tumble and slide to rest; the wall stops them.
 step(dt){
  for(const p of this.props){
   if(!(p.vx||p.vy||p.vz||p.z>0||p.tiltRate))continue;
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.a+=p.spin*dt;p.tilt+=p.tiltRate*dt;
   if(p.z>0)p.vz-=G*dt;
   if(p.z<=0){
    p.z=0;if(p.vz<-1.5)p.vz*=-.3;else p.vz=0;
    // On the ground: a fallen cone lies on its side, sliding and rolling to a stop.
    const speed=Math.hypot(p.vx,p.vy),stop=(p.down?4.5:6)*dt;
    if(speed<=stop){p.vx=p.vy=0;}else{p.vx-=p.vx/speed*stop;p.vy-=p.vy/speed*stop;}
    p.spin*=Math.exp(-dt*3);
    if(p.down){const lie=Math.PI/2*(Math.sign(p.tilt)||1);p.tilt+=(lie-p.tilt)*(1-Math.exp(-dt*12));p.tiltRate*=Math.exp(-dt*10);if(Math.abs(p.tiltRate)<.05)p.tiltRate=0;}
    if(Math.abs(p.spin)<.02)p.spin=0;
   }
   const e=floorEdge(p.x,p.y);if(e.d>-p.r){p.x-=e.nx*(e.d+p.r);p.y-=e.ny*(e.d+p.r);const vn=p.vx*e.nx+p.vy*e.ny;if(vn>0){p.vx-=1.4*vn*e.nx;p.vy-=1.4*vn*e.ny;}}
   const item=this.layout.items[p.item];p.moved=Math.hypot(p.x-item.x,p.y-item.y);
  }
 }
 // Where the rear wheels are: the zone each is in (or null), and the front bumper's nearest clip.
 rearWheels(car,out=[[0,0],[0,0]]){
  const ch=Math.cos(car.heading),sh=Math.sin(car.heading);
  REAR.forEach((w,i)=>{out[i][0]=car.x+ch*w.x-sh*w.y;out[i][1]=car.y+sh*w.x+ch*w.y;});return out;
 }
 // A point in a zone: {zone, along (0..1 down its length)} or null.
 zoneAt(x,y){
  for(const z of this.zones){
   if(z.type==='band'){const dx=x-z.x,dy=y-z.y,u=dx*z.c+dy*z.s,v=-dx*z.s+dy*z.c;if(Math.abs(u)<=z.half&&Math.abs(v)<=z.width/2)return {zone:z,along:(u+z.half)/z.length};}
   else{const dx=x-z.x,dy=y-z.y,r=Math.hypot(dx,dy),t=wrap(Math.atan2(dy,dx)-z.mid);if(r>=z.r0&&r<=z.r1&&Math.abs(t)<=z.span/2)return {zone:z,along:t/z.span+.5};}
  }
  return null;
 }
 nearestClip(x,y){let best=null;for(const c of this.clips){const d=Math.hypot(x-c.x,y-c.y);if(!best||d<best.distance)best={clip:c,distance:d};}return best&&best.distance<=CLIP_REACH*3?best:null;}
 // A car moving across the start gate's line this step, the way it points, between its posts.
 crossedGate(x0,y0,x1,y1){
  const g=this.gate;if(!g)return false;
  const a=(x0-g.x)*g.c+(y0-g.y)*g.s,b=(x1-g.x)*g.c+(y1-g.y)*g.s;if(!(a<0&&b>=0))return false;
  const t=a/(a-b),across=-((x0+(x1-x0)*t)-g.x)*g.s+((y0+(y1-y0)*t)-g.y)*g.c;
  return Math.abs(across)<=g.half;
 }
 info(){return {items:this.layout.items.length,solids:this.solids.length,surfaces:this.surfaces.length,zones:this.zones.length,clips:this.clips.length,props:this.props.length,knocked:this.knocked,hits:this.hits,wallHits:this.wallHits,gate:!!this.gate};}
}
const kerbLift=along=>KERB_LIFT+KERB_RIDGE*Math.cos(along/RIDGE*Math.PI);
// The velocity of a point of the car (offset rx, ry from its centre of mass) in the plane.
function pointVelocity(car,rx,ry){return [car.vx-car.yaw*ry,car.vy+car.yaw*rx];}
export {ARENA};
