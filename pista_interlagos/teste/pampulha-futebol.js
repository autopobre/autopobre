import * as THREE from 'three';
import {addRoamSolids} from './physics.js';
import {mineiraoField,PITCH_LIFT} from './pampulha-estadios.js';
import {canvasTexture} from './pit-textures.js';

// Football on the Mineirão's floor, Rocket League style (user, 2026-10-19: "colocar uma bola gigante e fazer aquilo virar
// algo estilo rocket league... chutar a bola com o carro e marcar gol!! E coloca uma bola pequena humana, que se a pessoa
// sair do carro também consegue jogar com o boneco e chutar"). Two balls on the pitch: a giant one (3.4 m, 250 kg of
// rubber) for the car and an ordinary one (22 cm, 430 g) for the pilot on foot (free-walk.js: walking into it dribbles,
// E or the click kicks it, harder on the run, a pass crouched), and two giant goals in the real ones' place, blue and
// orange, 22 × 8 m with their nets. A ball wholly over a goal line between the posts is a goal for the other colour:
// the stadium's two screens and the panel at the top say so, the confetti flies, and a few seconds later it is back on
// the centre spot. One that leaves the bowl (down the drive-in tunnel, over the roof) is whistled out and comes back too.
// The balls' own physics (the race's, physics.js, is untouched; the car only takes the impulses a ball gives it, as from
// any contact): gravity, the air's drag and the Magnus lift of a spinning ball, bounces and Coulomb friction with spin
// on every contact (grass, the concrete of the stands, the roof's membrane, the posts, the nets), rolling resistance on
// the ground; the stands, the roof and the wall round the floor from the bowl's own section (pampulha-estadios.js
// mineiraoField): a ball goes up the lower tier and rolls back, lands on the membrane and runs off its edge. Against the
// car: its body as two boxes (the body to the beltline, the cabin) on its own pitch and roll, the impulse shared by both
// masses and the car's turning inertia (a giant ball hit square takes a quarter of a 1250 kg car's speed). The pilot on
// foot pushes the giant ball with a person's strength (450 N) and is thrown by it when it comes at him fast.
// Physics frame as physics.js: x, y on the ground, z up (the scene's x, z, -y).

const G=9.81,RHO=1.2,CAR_MASS=1250,FOOT_MASS=3,HERO_MASS=80,HERO_RADIUS=.3,HERO_HEIGHT=1.8,DRIBBLE_RADIUS=.2,PUSH_FORCE=450,KNOCK_SPEED=2.6;
// Each ball: radius, mass, drag coefficient, the shell's inertia factor (I = k m r², a hollow ball 2/3), the Magnus lift
// (times ½ρA r ω×v), how fast the air slows its spin, restitution and rolling resistance by what it meets, friction;
// on grass also the blades it pushes through, a resistance growing with its speed (grassDrag, per second: user,
// 2026-10-19, a short pass from the centre circle rolled into the goal). The small ball then rolls as on a match pitch:
// from 3 m/s about 5 m (FIFA's ball-roll test asks 4 to 10), a short pass (6.6 m/s) about 14 m, a hard one (18 m/s) 40.
export const BALL_SPECS=Object.freeze({
 gigante:Object.freeze({label:'bola gigante',r:1.7,m:250,cd:.3,shell:2/3,lift:.35,spin:.04,grip:.55,
  bounce:Object.freeze({grama:.55,concreto:.62,lona:.4,rede:.12,trave:.55,carro:.5,pessoa:.25,bola:.6}),roll:Object.freeze({grama:.022,concreto:.01,lona:.006,rede:.2})}),
 bolinha:Object.freeze({label:'bolinha',r:.11,m:.43,cd:.25,shell:2/3,lift:.6,spin:.08,grip:.55,grassDrag:.25,
  bounce:Object.freeze({grama:.62,concreto:.75,lona:.45,rede:.1,trave:.7,carro:.55,pessoa:.35,bola:.6}),roll:Object.freeze({grama:.042,concreto:.02,lona:.012,rede:.3})})
});
// The goals: the mouth W × H (inside the posts and under the bar), D deep behind the pitch's goal line (52.5 m from the
// centre), the front frame POST thick and the box behind it FRAME.
export const GOAL=Object.freeze({line:52.5,width:22,height:8,depth:6,post:.3,frame:.12});
// The goal at -U (team 0) is blue's, the one at +U orange's: a ball in a team's goal is the other team's.
export const TEAMS=Object.freeze([Object.freeze({id:'azul',name:'AZUL',color:0x1f63e8,glow:0x2f86ff,css:'#2f7dff'}),Object.freeze({id:'laranja',name:'LARANJA',color:0xf06a12,glow:0xff7d24,css:'#ff7a1f'})]);
// Kicks by how long the button was held (power 0..1, full after KICK_FULL seconds; user, 2026-10-19: "um botão de
// chutar que quanto mais tempo segura mais forte, e outro de chute rasteiro que seria passar a bola"): the foot's speed
// (m/s) and the ball's rise (degrees), from the lightest to the hardest. A shot (chute) rises more the harder it is, a
// volley (in the air) less; a pass (passe) stays on the grass, rolling from the start, toward a team mate when one is
// near the aim (mates; alone, where he aims). On the run the foot comes RUN_BONUS faster. The foot is 3 kg of leg: the
// small ball leaves at 1.3 times its speed, the giant one hardly moves.
export const KICKS=Object.freeze({chute:Object.freeze({foot:[8,20],loft:[5,20]}),passe:Object.freeze({foot:[4.5,14],loft:[.5,.5]})});
export const KICK_FULL=1,RUN_BONUS=1.5;
// The leg reaches a ball whose surface is KICK_REACH from his middle (AIM_REACH: the buttons kick, the panel says so),
// within KICK_CONE of the aim; the strike comes KICK_STRIKE into the kick, which lasts KICK_TIME.
export const KICK_REACH=.95,AIM_REACH=1.25,KICK_CONE=100*Math.PI/180,KICK_STRIKE=.13,KICK_TIME=.36;
// Dribbling (user, 2026-10-19: "quando o player pega a bola, ele conduz a bola, não só empurra ela... é meio automático"):
// as in the football games, the small ball within TAKE metres of his middle, low and coming at most FIRST_TOUCH m/s at
// him, is his; from then on each touch (every period: shorter the faster he goes) sends it to where it should be when
// the next one comes: lead metres ahead of his feet the way he walks (longer on the run, short while he winds up a
// kick, at his feet standing), a soft touch changing its speed by at most TOUCH m/s; between touches it rolls on its
// own; one running away from his pace (a turn, a stop) is touched back at once. Past KEEP metres, in the air or hit away,
// it is loose again.
export const DRIBBLE=Object.freeze({take:.95,keep:2.1,firstTouch:9,touch:8.5,stand:.42,lead:.5,leadPerSpeed:.11,windUp:.38,period:[.46,.035,.24]});
// A goal's celebration, then the ball back on its spot; one out of the bowl waits OUT_TIME, hidden after OUT_HIDE.
const GOAL_TIME=3.2,OUT_TIME=2.2,OUT_HIDE=.9,DROP=4;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

// The point of the ellipse x²/a² + y²/b² = 1 (a ≥ b, axis-aligned) nearest (x, y) (D. Eberly, "Distance from a point to
// an ellipse"): the point, its outward normal, the distance (negative inside) and its angle t (x = a cos t, y = b sin t).
function nearestOnEllipse(a,b,x,y,out){
 const y0=Math.abs(x),y1=Math.abs(y);let x0,x1;
 if(y1>1e-9){
  if(y0>1e-9){
   const z0=y0/a,z1=y1/b,g=z0*z0+z1*z1-1;
   if(Math.abs(g)>1e-12){
    const r0=(a/b)**2,n0=r0*z0;let s0=z1-1,s1=g<0?0:Math.hypot(n0,z1)-1,s=0;
    for(let i=0;i<64;i++){s=(s0+s1)/2;if(s===s0||s===s1)break;const p=n0/(s+r0),q=z1/(s+1),h=p*p+q*q-1;if(h>0)s0=s;else if(h<0)s1=s;else break;}
    x0=r0*y0/(s+r0);x1=y1/(s+1);
   }else{x0=y0;x1=y1;}
  }else{x0=0;x1=b;}
 }else{const numer=a*y0,denom=a*a-b*b;if(numer<denom){const xd=numer/denom;x0=a*xd;x1=b*Math.sqrt(Math.max(0,1-xd*xd));}else{x0=a;x1=0;}}
 const px=x<0?-x0:x0,py=y<0?-x1:x1;let nx=px/(a*a),ny=py/(b*b);const nl=Math.hypot(nx,ny)||1;nx/=nl;ny/=nl;
 out.px=px;out.py=py;out.nx=nx;out.ny=ny;out.dist=Math.hypot(x-px,y-py)*((x/a)**2+(y/b)**2<1?-1:1);out.t=Math.atan2(py/b,px/a);return out;
}
// The nearest point of segment a-b to p (3D) and of a box in its own frame.
function segmentPoint(a,b,p){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l2=dx*dx+dy*dy+dz*dz||1e-12,u=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/l2,0,1);return [a[0]+dx*u,a[1]+dy*u,a[2]+dz*u];}

// ---------- The bowl as a ball meets it: the floor, the wall round it, the stands' section, the drive-in tunnel's cutting,
// the goals and the screens. Contacts: {n (unit, away from what was met), depth, kind}.
export class MineiraoBowl{
 constructor(field,ground=null){
  this.F=field;this.groundFn=ground;const F=field;
  this.U=F.U;this.V=F.V;this.cx=F.cx;this.cy=F.cy;this.tc=Math.cos(F.tunnel.heading);this.ts=Math.sin(F.tunnel.heading);this.HW=F.tunnel.width/2;
  this.e1={};this.e2={};
  // Along each normal of the roof's edge, how far in the floor's ellipse is (the wall round the floor): a table on the
  // edge's angle.
  const [RA,RB]=F.roof,[LA,LB]=F.floor,N=this.N=1440;this.dFl=new Float64Array(N+1);
  for(let k=0;k<=N;k++){const t=k/N*2*Math.PI,px=RA*Math.cos(t),py=RB*Math.sin(t),l=Math.hypot(RB*Math.cos(t),RA*Math.sin(t)),nx=RB*Math.cos(t)/l,ny=RA*Math.sin(t)/l;let lo=0,hi=110;
   for(let i=0;i<44;i++){const d=(lo+hi)/2,x=px-nx*d,y=py-ny*d;if((x/LA)**2+(y/LB)**2>1)lo=d;else hi=d;}this.dFl[k]=(lo+hi)/2;}
  this.pitchZ=F.pitch;this.prims=[];
 }
 local(x,y){const dx=x-this.cx,dy=y-this.cy;return [dx*this.U[0]+dy*this.U[1],dx*this.V[0]+dy*this.V[1]];}
 world(u,v){return [this.cx+this.U[0]*u+this.V[0]*v,this.cy+this.U[1]*u+this.V[1]*v];}
 // What a ball rests on there: the grass as drawn, PITCH_LIFT over the ground the car drives on (the pad under the bowl
 // is level). On the ground itself a ball sat 3 cm into the grass (user, 2026-10-19).
 floorAt(x,y){const g=this.groundFn?.(x,y);return (Number.isFinite(g)?g:this.pitchZ)+PITCH_LIFT;}
 dFlAt(t){const k=((t/(2*Math.PI))%1+1)%1*this.N,i=Math.floor(k),u=k-i;return this.dFl[i]*(1-u)+this.dFl[Math.min(this.N,i+1)]*u;}
 // In the tunnel's frame: a out from the centre toward the portal, b across.
 tunnelFrame(x,y){const dx=x-this.cx,dy=y-this.cy;return [dx*this.tc+dy*this.ts,-dx*this.ts+dy*this.tc];}
 // Where (x, y) stands: {h: metres inside the floor's wall (negative outside it), d: metres in from the roof's edge,
 // cut: in the drive-in cutting's corridor, ta: along it}.
 where(x,y){
  const [u,v]=this.local(x,y),F=this.F,fl=nearestOnEllipse(F.floor[0],F.floor[1],u,v,this.e1),rf=nearestOnEllipse(F.roof[0],F.roof[1],u,v,this.e2),[ta,tb]=this.tunnelFrame(x,y);
  return {u,v,h:-fl.dist,d:-rf.dist,t:rf.t,cut:ta>0&&Math.abs(tb)<this.HW+.6,ta,tb};
 }
 collide(p,r,out){
  out.length=0;const F=this.F,[x,y,z]=p,g=this.floorAt(x,y),[u,v]=this.local(x,y),U=this.U,V=this.V;
  const fl=nearestOnEllipse(F.floor[0],F.floor[1],u,v,this.e1),h=-fl.dist,[ta,tb]=this.tunnelFrame(x,y),cut=ta>0&&Math.abs(tb)<this.HW+.6,inCut=cut&&ta>F.tunnel.floor-1;
  // The floor: grass in the bowl, the cutting's asphalt.
  if((h>-r||cut)&&z-g<r)out.push({n:[0,0,1],depth:r-(z-g),kind:inCut&&h<0?'concreto':'grama'});
  // The wall round the floor (1.2 m: its top is the lower tier's first row), open across the cutting.
  if(!cut&&h>-(r+.6)&&h<r){
   const inx=-(fl.nx*U[0]+fl.ny*V[0]),iny=-(fl.nx*U[1]+fl.ny*V[1]),top=g+F.wall,dz=z-clamp(z,g,top);
   if(h<0&&dz<=0)out.push({n:[inx,iny,0],depth:r-h,kind:'concreto'});
   else{const d=Math.hypot(h,dz);if(d<r&&d>1e-9)out.push({n:[inx*h/d,iny*h/d,dz/d],depth:r-d,kind:'concreto'});}
  }
  // The cutting's walls (a slab each side from the floor's line out), their ends on the floor's line.
  if(ta>F.tunnel.floor-r-1&&Math.abs(tb)<this.HW+.6+r){
   for(const s of [-1,1]){
    const a0=F.tunnel.floor,a1=a0+40,b0=s<0?-this.HW-.6:this.HW,b1=s<0?-this.HW:this.HW+.6,qa=clamp(ta,a0,a1),qb=clamp(tb,b0,b1),qz=clamp(z,g-1,g+7),da=ta-qa,db=tb-qb,dz=z-qz,d=Math.hypot(da,db,dz);
    if(d<r&&d>1e-9){const wx=this.tc*da-this.ts*db,wy=this.ts*da+this.tc*db;out.push({n:[wx/d,wy/d,dz/d],depth:r-d,kind:'concreto'});}
   }
  }
  // The stands, the roof and the membrane: the bowl's section along the roof edge's normal (mineiraoField stands), from
  // the wall's top outward; free space on the right going along it. Not over the cutting (its own walls).
  if(!inCut&&h<r+5)this.stands(x,y,z-this.pitchZ,u,v,r,out);
  // What stands on the floor: the goals' frames and nets, the screens.
  for(const q of this.prims){
   if(Math.abs(x-q.cx)>q.reach+r||Math.abs(y-q.cy)>q.reach+r)continue;
   if(q.type==='tube'){const c=segmentPoint(q.a,q.b,p),dx=x-c[0],dy=y-c[1],dz=z-c[2],d=Math.hypot(dx,dy,dz),R=q.r+r;if(d<R&&d>1e-9)out.push({n:[dx/d,dy/d,dz/d],depth:R-d,kind:q.kind});}
   else{
    const ox=x-q.o[0],oy=y-q.o[1],oz=z-q.o[2],s1=clamp(ox*q.e1[0]+oy*q.e1[1]+oz*q.e1[2],-q.h1,q.h1),s2=clamp(ox*q.e2[0]+oy*q.e2[1]+oz*q.e2[2],-q.h2,q.h2);
    const cx=q.o[0]+q.e1[0]*s1+q.e2[0]*s2,cy=q.o[1]+q.e1[1]*s1+q.e2[1]*s2,cz=q.o[2]+q.e1[2]*s1+q.e2[2]*s2,dx=x-cx,dy=y-cy,dz=z-cz,d=Math.hypot(dx,dy,dz);
    if(d<r){if(d>1e-6)out.push({n:[dx/d,dy/d,dz/d],depth:r-d,kind:q.kind});else{const k=Math.sign(ox*q.n[0]+oy*q.n[1]+oz*q.n[2])||1;out.push({n:q.n.map(c=>c*k),depth:r,kind:q.kind});}}
   }
  }
  return out;
 }
 // (x, y) at zr over the pitch against the section at its angle on the roof's edge.
 stands(x,y,zr,u,v,r,out){
  const F=this.F,rf=nearestOnEllipse(F.roof[0],F.roof[1],u,v,this.e2),d=-rf.dist,U=this.U,V=this.V;
  const inx=-(rf.nx*U[0]+rf.ny*V[0]),iny=-(rf.nx*U[1]+rf.ny*V[1]),P=this.section??=[[0,0],...F.stands];P[0]=[this.dFlAt(rf.t),F.wall];
  const deep=Math.min(r,.9),push=(nd,nz,depth,kind)=>out.push({n:[inx*nd,iny*nd,nz],depth,kind});
  let prev=null;
  for(let i=0;i+1<P.length;i++){
   const a=P[i],b=P[i+1],td=b[0]-a[0],tz=b[1]-a[1],l=Math.hypot(td,tz);if(l<1e-6)continue;
   const ud=td/l,uz=tz/l,nd=uz,nz=-ud,qd=d-a[0],qz=zr-a[1],along=(qd*ud+qz*uz)/l,sd=qd*nd+qz*nz,kind=i>=8&&i<=10?'lona':'concreto';
   if(along>=0&&along<=1&&sd<r&&sd>-deep)push(nd,nz,r-sd,kind);
   // A convex corner (the section turning away from the free side) beyond both its sides' ends.
   if(prev&&along<0&&prev.along>1&&prev.ud*uz-prev.uz*ud>0){const dd=d-a[0],dz=zr-a[1],dist=Math.hypot(dd,dz);if(dist<r&&dist>1e-9)push(dd/dist,dz/dist,r-dist,kind);}
   prev={along,ud,uz};
  }
 }
}

// ---------- A ball
class Ball{
 constructor(kind,home,homeZ){const s=this.spec=BALL_SPECS[kind];this.kind=kind;this.r=s.r;this.m=s.m;this.I=s.shell*s.m*s.r*s.r;this.home=home;this.homeZ=homeZ;this.p=[0,0,0];this.v=[0,0,0];this.w=[0,0,0];this.q=[0,0,0,1];this.contacts=[];this.normals=[];this.reset();}
 reset(drop=0,at=this.home){this.p[0]=at[0];this.p[1]=at[1];this.p[2]=this.homeZ+this.r+drop;this.v.fill(0);this.w.fill(0);this.state='play';this.timer=0;this.touch=null;this.still=0;this.asleep=drop===0;this.roof=0;this.spawn=drop>0?0:1;this.bounced=0;}
 get speed(){return Math.hypot(this.v[0],this.v[1],this.v[2]);}
}

// ---------- The game: the balls, the goals, the score
export class FootballGame{
 // field: pampulha-estadios.js mineiraoField; ground(x, y): the ground the car drives on. The goals' frames and nets
 // become the car's solids in the Mineirão's roam zone (physics.js addRoamSolids) when roam is set.
 constructor(data,{ground=null,field=mineiraoField(data,{ground}),roam=true}={}){
  this.data=data;this.field=field;const bowl=this.bowl=new MineiraoBowl(field,ground);
  this.goals=[-1,1].map((s,team)=>buildGoal(bowl,s,team));for(const goal of this.goals)bowl.prims.push(...goal.prims);
  this.screens=[-1,1].map(s=>screenPlace(bowl,s));for(const sc of this.screens)bowl.prims.push(sc.prim);
  const home=(u,v)=>{const p=bowl.world(u,v);return [p,bowl.floorAt(p[0],p[1])];};
  this.balls=[new Ball('gigante',...home(0,0)),new Ball('bolinha',...home(0,9.15))];
  this.solids=this.goals.flatMap(goal=>goal.solids);this.roamSolids=roam?addRoamSolids(data,this.solids):0;
  this.score=[0,0];this.events=[];this.time=0;this.hero=null;this.onKnock=null;this.control=null;this.mates=[];this.goalsScored=0;this.outs=0;this.lastHit=0;this.scratch=[];
 }
 get giant(){return this.balls[0];}
 get small(){return this.balls[1];}
 // A new race (main.js newRace): a new game, both balls on their spots.
 reset(){this.score=[0,0];this.events.length=0;this.goalsScored=0;this.control=null;for(const b of this.balls)b.reset();}
 emit(e){if(this.events.length<64)this.events.push(e);}
 takeEvents(){return this.events.splice(0);}
 // One physics step (main.js, after the car's): car is the player's TestCar; the pilot on foot comes from hero() (his
 // feet, his velocity and the walk he asks for: free-walk.js footInfo) when he is out.
 step(car,dt,hero=this.hero?.()??null){
  this.time+=dt;
  for(const b of this.balls){
   // Out: it flies on until it is put away, then back on its spot.
   if(b.state==='out'){b.timer+=dt;if(b.timer>=OUT_TIME)this.respawn(b,car);else if(b.timer<OUT_HIDE){this.integrate(b,dt);this.world(b,dt);}continue;}
   if(b.state==='goal'){b.timer+=dt;if(b.timer>=GOAL_TIME){this.respawn(b,car);continue;}}
   b.spawn=Math.min(1,b.spawn+dt/.4);
   if(b.asleep&&!this.wakes(b,car,hero))continue;b.asleep=false;b.normals.length=0;
   // The small ball fast: in steps no longer than most of its radius.
   const n=Math.min(10,Math.max(1,Math.ceil(b.speed*dt/(.7*b.r))));
   for(let k=0;k<n;k++){if(k)b.normals.length=0;this.integrate(b,dt/n);this.world(b,dt/n);}
   if(car)this.carContact(b,car);
   // The small ball at his feet is his to dribble (DRIBBLE); in the car, or thrown, it is loose.
   if(hero&&!hero.tumbling)this.heroContact(b,hero,dt,b===this.small&&this.dribble(b,hero,dt));else if(b===this.small)this.control=null;
  }
  this.ballContact(this.giant,this.small);
  // Pushed back out of the bowl where the car or the pilot put it, then (held there) the car out of it.
  for(const b of this.balls)if((b.state==='play'||b.state==='goal')&&!b.asleep){this.world(b,0);if(car)this.carContact(b,car);this.rules(b,dt);this.rest(b,dt);}
 }
 wakes(b,car,hero){
  const near=(x,y,z,reach)=>Math.hypot(b.p[0]-x,b.p[1]-y,b.p[2]-z)<b.r+reach;
  if(car&&near(car.x,car.y,car.z,4))return true;if(hero&&near(hero.x,hero.y,hero.z+.9,1.6))return true;
  for(const o of this.balls)if(o!==b&&!o.asleep&&near(o.p[0],o.p[1],o.p[2],o.r+.5))return true;
  return false;
 }
 // Gravity, the air's drag and the Magnus lift; the spin slows in the air; the ball's turn for the picture.
 integrate(b,dt){
  const s=b.spec,v=b.v,w=b.w,sp=b.speed,A=Math.PI*b.r*b.r,drag=.5*RHO*s.cd*A*sp/b.m,lift=.5*RHO*A*b.r*s.lift/b.m;
  const mx=w[1]*v[2]-w[2]*v[1],my=w[2]*v[0]-w[0]*v[2],mz=w[0]*v[1]-w[1]*v[0];
  v[0]+=(-drag*v[0]+lift*mx)*dt;v[1]+=(-drag*v[1]+lift*my)*dt;v[2]+=(-G-drag*v[2]+lift*mz)*dt;
  const k=Math.exp(-s.spin*dt);w[0]*=k;w[1]*=k;w[2]*=k;
  b.p[0]+=v[0]*dt;b.p[1]+=v[1]*dt;b.p[2]+=v[2]*dt;
  const q=b.q,ax=w[0]*dt*.5,ay=w[1]*dt*.5,az=w[2]*dt*.5,[qx,qy,qz,qw]=q;
  q[0]+=ax*qw+ay*qz-az*qy;q[1]+=ay*qw+az*qx-ax*qz;q[2]+=az*qw+ax*qy-ay*qx;q[3]+=-ax*qx-ay*qy-az*qz;const ql=Math.hypot(...q)||1;for(let i=0;i<4;i++)q[i]/=ql;
 }
 // What the ball meets in the bowl, each contact in turn: out of it, a bounce, friction turning its spin, rolling
 // resistance on a floor. dt 0: only pushed out (after the car and the pilot moved it).
 world(b,dt){for(const c of this.bowl.collide(b.p,b.r,b.contacts)){this.contact(b,c.n,c.depth,c.kind,dt);b.normals.push(c.n);}}
 contact(b,n,depth,kind,dt){
  const s=b.spec,v=b.v,w=b.w,[nx,ny,nz]=n;b.p[0]+=nx*depth;b.p[1]+=ny*depth;b.p[2]+=nz*depth;
  const vn=v[0]*nx+v[1]*ny+v[2]*nz;let jn=0;
  if(vn<0){
   // Slow contacts do not bounce (a ball at rest stays at rest); a hard landing is heard.
   const e=(s.bounce[kind]??.5)*smooth((-vn-.25)/.9);jn=-(1+e)*vn*b.m;v[0]+=nx*jn/b.m;v[1]+=ny*jn/b.m;v[2]+=nz*jn/b.m;
   if(-vn>b.bounced)b.bounced=-vn;
   if(kind==='rede'){const k=.55;const t=[v[0]-nx*(v[0]*nx+v[1]*ny+v[2]*nz),v[1]-ny*(v[0]*nx+v[1]*ny+v[2]*nz),v[2]-nz*(v[0]*nx+v[1]*ny+v[2]*nz)];v[0]-=t[0]*k;v[1]-=t[1]*k;v[2]-=t[2]*k;}
  }
  if(dt>0||jn>0)this.friction(b,n,jn,s.grip,kind==='rede'?.5:1);
  // Rolling resistance and the spin about the normal, on a floor.
  if(dt>0&&nz>.5){
   const vn2=v[0]*nx+v[1]*ny+v[2]*nz,tx=v[0]-nx*vn2,ty=v[1]-ny*vn2,tz=v[2]-nz*vn2,ts=Math.hypot(tx,ty,tz),roll=((s.roll[kind]??.02)*G*nz+(kind==='grama'?s.grassDrag??0:0)*ts)*dt,f=ts>1e-9?Math.max(0,1-roll/ts):0;
   v[0]-=tx*(1-f);v[1]-=ty*(1-f);v[2]-=tz*(1-f);const wn=w[0]*nx+w[1]*ny+w[2]*nz,k=Math.min(1,dt*2);
   for(let i=0;i<3;i++)w[i]=(w[i]-n[i]*wn)*(ts>1e-9?f:.9)+n[i]*wn*(1-k);
  }
 }
 // Coulomb friction at the contact point (−r n from the centre) against something at rest: the slip there taken away up
 // to grip times the normal impulse (or a step's weight on a floor), the ball's spin turned by it.
 friction(b,n,jn,grip,scale=1){
  const v=b.v,w=b.w,r=b.r,[nx,ny,nz]=n,cx=-r*nx,cy=-r*ny,cz=-r*nz;
  let ux=v[0]+w[1]*cz-w[2]*cy,uy=v[1]+w[2]*cx-w[0]*cz,uz=v[2]+w[0]*cy-w[1]*cx;const un=ux*nx+uy*ny+uz*nz;ux-=un*nx;uy-=un*ny;uz-=un*nz;
  const ut=Math.hypot(ux,uy,uz);if(ut<1e-7)return;
  const k=1/b.m+r*r/b.I,cap=grip*Math.max(jn,0)*scale,jt=Math.min(ut/k,cap);if(jt<=0)return;
  const fx=-ux/ut*jt,fy=-uy/ut*jt,fz=-uz/ut*jt;v[0]+=fx/b.m;v[1]+=fy/b.m;v[2]+=fz/b.m;
  w[0]+=(cy*fz-cz*fy)/b.I;w[1]+=(cz*fx-cx*fz)/b.I;w[2]+=(cx*fy-cy*fx)/b.I;
 }
 // ---- The car: its body (to the beltline) and its cabin, boxes on its pitch and roll round its centre of mass, from its
 // shell (car.body.hull: the sills' height, the beltline, the roof's corners).
 carBoxes(body){
  const cache=this.boxCache??=new WeakMap();let boxes=cache.get(body);if(boxes)return boxes;
  const hull=body.hull,roof=hull.slice(19),belt=hull[17]?.[2]??.4,xs=roof.map(p=>p[0]);
  boxes=[{x0:-(body.rear??body.halfLength),x1:body.front??body.halfLength,y:body.halfWidth,z0:hull[4]?.[2]??-.34,z1:belt},
   {x0:Math.min(...xs)-.3,x1:Math.max(...xs)+.35,y:Math.max(...roof.map(p=>Math.abs(p[1]))),z0:belt,z1:Math.max(...roof.map(p=>p[2]))}];
  cache.set(body,boxes);return boxes;
 }
 carContact(b,car){
  const dx=b.p[0]-car.x,dy=b.p[1]-car.y,dz=b.p[2]-car.z;if(dx*dx+dy*dy>(b.r+3.2)**2||Math.abs(dz)>b.r+2)return;
  const ax=car.updateAxes(),f=ax.f,l=ax.l,u=ax.u,lx=dx*f[0]+dy*f[1]+dz*f[2],ly=dx*l[0]+dy*l[1]+dz*l[2],lz=dx*u[0]+dy*u[1]+dz*u[2];
  let best=null;
  for(const B of this.carBoxes(car.body)){
   const qx=clamp(lx,B.x0,B.x1),qy=clamp(ly,-B.y,B.y),qz=clamp(lz,B.z0,B.z1),ex=lx-qx,ey=ly-qy,ez=lz-qz,d=Math.hypot(ex,ey,ez);
   let n,depth;
   if(d>1e-6){if(d>=b.r)continue;n=[ex/d,ey/d,ez/d];depth=b.r-d;}
   else{const pen=[[lx-B.x0,-1,0,0],[B.x1-lx,1,0,0],[ly+B.y,0,-1,0],[B.y-ly,0,1,0],[lz-B.z0,0,0,-1],[B.z1-lz,0,0,1]].sort((p,q)=>p[0]-q[0])[0];n=pen.slice(1);depth=pen[0]+b.r;}
   if(!best||depth>best.depth)best={n,depth,q:[qx,qy,qz]};
  }
  if(!best)return;
  let [nx,ny,nz]=best.n;const q=best.q;
  // Under the car on the ground (the small ball under the sills): squeezed out sideways, not into the grass.
  if(nz<-.5&&b.normals.some(m=>m[2]>.7)){const B=this.carBoxes(car.body)[0],out=[[B.x1-lx,1,0],[lx-B.x0,-1,0],[B.y-ly,0,1],[ly+B.y,0,-1]].sort((p,q)=>p[0]-q[0])[0];nx=out[1];ny=out[2];nz=0;best.depth=Math.min(.3,out[0]+b.r);}
  // World: the normal from the car to the ball, the contact point from the car's centre of mass.
  const n=[f[0]*nx+l[0]*ny+u[0]*nz,f[1]*nx+l[1]*ny+u[1]*nz,f[2]*nx+l[2]*ny+u[2]*nz],nl=Math.hypot(...n)||1;n[0]/=nl;n[1]/=nl;n[2]/=nl;
  const rc=[f[0]*q[0]+l[0]*q[1]+u[0]*q[2],f[1]*q[0]+l[1]*q[1]+u[1]*q[2],f[2]*q[0]+l[2]*q[1]+u[2]*q[2]];
  // Held against the bowl from the other side (the wall, a post, the ground under a car on top of it), the ball stands
  // like a wall for the car.
  const pinned=b.normals.some(m=>m[0]*n[0]+m[1]*n[1]+m[2]*n[2]<-.4),wb=pinned?0:1/b.m,wc=car.inverseMass(rc,n[0],n[1],n[2])/CAR_MASS;
  // Out of the body: the ball moves (or the car, from a held ball: on the ground, at most 20 cm a step).
  const share=wb/(wb+1/CAR_MASS);b.p[0]+=n[0]*best.depth*share;b.p[1]+=n[1]*best.depth*share;b.p[2]+=n[2]*best.depth*share;
  const h=Math.hypot(n[0],n[1]);if(share<.999&&h>.5){const back=Math.min(.2,best.depth*(1-share));car.x-=n[0]/h*back;car.y-=n[1]/h*back;car.surface=car.sample(car.x,car.y);}
  const vc=car.pointVelocity(rc,[0,0,0]),v=b.v,rel=[v[0]-vc[0],v[1]-vc[1],v[2]-vc[2]],vn=rel[0]*n[0]+rel[1]*n[1]+rel[2]*n[2];
  if(vn>=0)return;
  const e=b.spec.bounce.carro*smooth((-vn-.3)/1.2),jn=-(1+e)*vn/(wb+wc);
  v[0]+=n[0]*jn*wb;v[1]+=n[1]*jn*wb;v[2]+=n[2]*jn*wb;car.impulse(rc,-n[0]*jn/CAR_MASS,-n[1]*jn/CAR_MASS,-n[2]*jn/CAR_MASS);
  // Friction between the paint and the rubber: the ball's spin from the car's sweep across it.
  if(wb>0){
   const w=b.w,r=b.r,cx=-r*n[0],cy=-r*n[1],cz=-r*n[2],vc2=car.pointVelocity(rc,[0,0,0]);
   let ux=v[0]+w[1]*cz-w[2]*cy-vc2[0],uy=v[1]+w[2]*cx-w[0]*cz-vc2[1],uz=v[2]+w[0]*cy-w[1]*cx-vc2[2];const un=ux*n[0]+uy*n[1]+uz*n[2];ux-=un*n[0];uy-=un*n[1];uz-=un*n[2];
   const ut=Math.hypot(ux,uy,uz);
   if(ut>1e-6){const tx=ux/ut,ty=uy/ut,tz=uz/ut,k=wb*(1+r*r*b.m/b.I)+car.inverseMass(rc,tx,ty,tz)/CAR_MASS,jt=Math.min(ut/k,.35*jn),fx=-tx*jt,fy=-ty*jt,fz=-tz*jt;
    v[0]+=fx*wb;v[1]+=fy*wb;v[2]+=fz*wb;w[0]+=(cy*fz-cz*fy)/b.I;w[1]+=(cz*fx-cx*fz)/b.I;w[2]+=(cx*fy-cy*fx)/b.I;car.impulse(rc,-fx/CAR_MASS,-fy/CAR_MASS,-fz/CAR_MASS);}
  }
  b.touch='carro';b.asleep=false;
  const dv=jn*(wb||1/b.m);if(dv>.6)this.emit({type:'hit',ball:b.kind,by:'carro',strength:clamp(dv/(b.kind==='gigante'?7:16),.25,1.4),p:[...b.p]});
 }
 // ---- The pilot on foot: a capsule from his feet to his head (narrower at the feet for the small ball, which he
 // dribbles: held, only kept out of him); he pushes the giant one with his strength and is thrown by it when it comes fast.
 heroContact(b,hero,dt,held=false){
  const giant=b.kind==='gigante',R=giant?HERO_RADIUS:DRIBBLE_RADIUS,a=[hero.x,hero.y,hero.z+.1],c=[hero.x,hero.y,hero.z+HERO_HEIGHT-.25],q=segmentPoint(a,c,b.p);
  const dx=b.p[0]-q[0],dy=b.p[1]-q[1],dz=b.p[2]-q[2],d=Math.hypot(dx,dy,dz),reach=b.r+R;if(d>=reach+.08||d<1e-6)return;
  const n=[dx/d,dy/d,dz/d],v=b.v,hv=[hero.vx??0,hero.vy??0,0],vn=(v[0]-hv[0])*n[0]+(v[1]-hv[1])*n[1]+(v[2]-hv[2])*n[2];
  if(d<reach){const depth=reach-d;b.p[0]+=n[0]*depth;b.p[1]+=n[1]*depth;b.p[2]+=n[2]*depth;}
  if(held)return;
  // The giant ball rolling into him fast: he goes flying, and the ball gives up some of its speed to him.
  if(giant&&-vn>KNOCK_SPEED&&this.onKnock){
   const side=Math.sign(-v[0]*n[1]+v[1]*n[0])||1;
   if(this.onKnock({x:b.p[0],y:b.p[1],z:hero.z+.52,vx:v[0],vy:v[1],heading:Math.atan2(v[1],v[0])},side,'A bola gigante te atropelou! Ela pesa 250 kg…')){
    const j=-(1+b.spec.bounce.pessoa)*vn/(1/b.m+1/HERO_MASS);v[0]+=n[0]*j/b.m;v[1]+=n[1]*j/b.m;v[2]+=n[2]*j/b.m;this.emit({type:'knock',ball:b.kind,p:[...b.p]});return;
   }
  }
  if(vn<0&&d<reach+.02){const e=b.spec.bounce.pessoa*smooth((-vn-.2)/.8),j=-(1+e)*vn/(1/b.m+1/HERO_MASS);v[0]+=n[0]*j/b.m;v[1]+=n[1]*j/b.m;v[2]+=n[2]*j/b.m;b.touch='pe';b.asleep=false;
   // Too fast to take, it bounces off his legs and is loose a moment.
   if(b===this.small&&-vn>DRIBBLE.firstTouch)this.looseUntil=this.time+.6;}
  // Leaning on the giant ball and walking into it: a push of at most a person's strength, up to his walking speed.
  if(giant){
   const hx=n[0],hy=n[1],hl=Math.hypot(hx,hy);if(hl<.3)return;const ux=hx/hl,uy=hy/hl,want=(hero.ix??0)*ux+(hero.iy??0)*uy;
   if(want>.2){const now=v[0]*ux+v[1]*uy,dv=Math.min(want-now,PUSH_FORCE*dt/b.m);if(dv>0){v[0]+=ux*dv;v[1]+=uy*dv;b.touch='pe';b.asleep=false;b.pushed=true;}}
  }
 }
 // Dribbling the small ball (DRIBBLE): whether it is his now; at each touch its new roll along the grass.
 dribble(b,hero,dt){
  const D=DRIBBLE;
  if(b.state!=='play'&&b.state!=='goal'||(hero.lift??0)>.15){this.control=null;return false;}
  const ix=hero.ix??0,iy=hero.iy??0,is=Math.hypot(ix,iy),moving=is>.3,yaw=hero.facing??hero.yaw??0,fx=moving?ix/is:Math.cos(yaw),fy=moving?iy/is:Math.sin(yaw);
  const dx=b.p[0]-hero.x,dy=b.p[1]-hero.y,dist=Math.hypot(dx,dy),low=b.p[2]-b.r-hero.z<.3&&b.v[2]<2.5,rel=Math.hypot(b.v[0]-(hero.vx??0),b.v[1]-(hero.vy??0));
  if(!this.control){
   // Taking it: at his feet, low, in front of him (or barely moving), not coming too fast (the first touch kills what it brings).
   if(!(dist<D.take&&low&&rel<D.firstTouch&&(dx*fx+dy*fy>-.3*dist||rel<2))||this.time<(this.looseUntil??-9))return false;
   this.control={t:Infinity,since:this.time};this.emit({type:'touch',ball:b.kind,first:true,strength:clamp(rel/8,.3,1),p:[...b.p]});
  }else if(dist>D.keep||!low&&b.p[2]-b.r-hero.z>.6){this.control=null;return false;}
  const C=this.control;C.t+=dt;if(hero.kicking)return true;
  const lead=hero.charging?D.windUp:moving?D.lead+D.leadPerSpeed*is:D.stand,T=moving?clamp(D.period[0]-D.period[1]*is,D.period[2],D.period[0]):.3;
  const tx=hero.x+fx*lead,ty=hero.y+fy*lead,off=Math.hypot(b.p[0]-tx,b.p[1]-ty),along=dx*fx+dy*fy;
  const away=Math.hypot(b.v[0]-ix,b.v[1]-iy);
  if(!(C.t>=T||(along<lead-.3||off>.5||away>2.5)&&C.t>.12))return true;
  // The touch: where it should be when the next one comes (he walks on meanwhile); standing, still at his feet once there.
  let vx=(tx+ix*T-b.p[0])/T,vy=(ty+iy*T-b.p[1])/T;if(!moving&&off<.08)vx=vy=0;
  const dvx=vx-b.v[0],dvy=vy-b.v[1],dv=Math.hypot(dvx,dvy),max=moving?D.touch:4;if(dv>max){vx=b.v[0]+dvx/dv*max;vy=b.v[1]+dvy/dv*max;}
  if(Math.hypot(vx-b.v[0],vy-b.v[1])>.3)this.emit({type:'touch',ball:b.kind,strength:clamp(Math.hypot(vx,vy)/8,.2,.7),p:[...b.p]});
  b.v[0]=vx;b.v[1]=vy;if(b.v[2]>0)b.v[2]*=.3;b.w[0]=-vy/b.r;b.w[1]=vx/b.r;b.w[2]*=.5;
  C.t=0;b.touch='pe';b.asleep=false;b.pushed=true;this.touches=(this.touches??0)+1;return true;
 }
 get dribbling(){return !!this.control;}
 // The two balls against each other.
 ballContact(A,B){
  if(A.state!=='play'&&A.state!=='goal'||B.state!=='play'&&B.state!=='goal')return;
  const dx=B.p[0]-A.p[0],dy=B.p[1]-A.p[1],dz=B.p[2]-A.p[2],d=Math.hypot(dx,dy,dz),R=A.r+B.r;if(d>=R||d<1e-6)return;
  const n=[dx/d,dy/d,dz/d],wa=1/A.m,wb=1/B.m,depth=R-d;
  for(let i=0;i<3;i++){A.p[i]-=n[i]*depth*wa/(wa+wb);B.p[i]+=n[i]*depth*wb/(wa+wb);}
  const vn=(B.v[0]-A.v[0])*n[0]+(B.v[1]-A.v[1])*n[1]+(B.v[2]-A.v[2])*n[2];if(vn>=0)return;
  const j=-(1+A.spec.bounce.bola*smooth((-vn-.2)/.8))*vn/(wa+wb);for(let i=0;i<3;i++){A.v[i]-=n[i]*j*wa;B.v[i]+=n[i]*j*wb;}A.asleep=B.asleep=false;
 }
 // Goals and the ball out of the bowl.
 rules(b,dt){
  const bowl=this.bowl,[u,v]=bowl.local(b.p[0],b.p[1]),g=bowl.floorAt(b.p[0],b.p[1]);
  if(b.state==='play'){
   // Wholly over the line, between the posts, under the bar (not lying on the goal's roof).
   for(const goal of this.goals){if(goal.s*u>GOAL.line+b.r&&Math.abs(v)<GOAL.width/2&&b.p[2]-g<GOAL.height&&goal.s*u<GOAL.line+GOAL.depth+1){this.goal(b,goal);return;}}
  }
  if(b.state!=='play')return;
  const w=bowl.where(b.p[0],b.p[1]),zr=b.p[2]-bowl.pitchZ;let out=null;
  if(w.d<-.5)out='fora do estádio';else if(w.cut&&w.ta>this.field.tunnel.floor+2&&Math.abs(w.tb)<bowl.HW)out='no túnel';else if(b.p[2]<g-5||!Number.isFinite(b.p[2]))out='fora';
  // Up on the roof's flat deck (the membrane's slope sends it back in): out after a moment.
  if(!out&&zr>this.field.roofHeight-.5&&w.d<this.field.deck-.5){b.roof+=dt;if(b.roof>1.2)out='no telhado';}else b.roof=0;
  if(out)this.out(b,out);
 }
 out(b,where){b.state='out';b.timer=0;b.where=where;b.asleep=false;this.outs++;this.emit({type:'out',ball:b.kind,where,p:[...b.p]});}
 goal(b,goal){
  const team=1-goal.team;this.score[team]++;this.goalsScored++;b.state='goal';b.timer=0;
  this.emit({type:'goal',ball:b.kind,team,goal:goal.team,by:b.touch,score:[...this.score],p:[...b.p]});
 }
 // At rest for half a second: asleep until something comes near; at rest anywhere off the floor (on a walkway of the
 // stands, in a fold of the membrane), out.
 rest(b,dt){
  if(b.bounced>1.5&&b.kind==='gigante')this.emit({type:'bounce',ball:b.kind,strength:clamp(b.bounced/7,.25,1.2),p:[...b.p]});b.bounced=0;
  const slow=b.speed<.04&&Math.hypot(...b.w)*b.r<.04;
  b.still=b.normals.length&&slow&&!b.pushed?b.still+dt:0;b.pushed=false;if(b.still<=.5||b.state!=='play')return;
  const w=this.bowl.where(b.p[0],b.p[1]);
  if(w.h<-b.r*.5&&!w.cut){this.out(b,b.p[2]-this.bowl.pitchZ>this.field.roofHeight-2?'no telhado':'na arquibancada');return;}
  b.asleep=true;b.v.fill(0);b.w.fill(0);
 }
 // Back on its spot, dropped from a few metres (away from a car parked on it).
 respawn(b,car){
  let at=b.home;
  if(car&&Math.hypot(car.x-at[0],car.y-at[1])<b.r+3.5){const [u,v]=this.bowl.local(car.x,car.y),k=v>0?-1:1;at=this.bowl.world(0,(b.kind==='gigante'?0:9.15)+k*8);}
  b.reset(DROP,at);b.asleep=false;this.emit({type:'respawn',ball:b.kind});
 }
 // ---- Free-walk.js's side (play)
 // The giant ball in his way at (x, y) with his feet at z (he cannot walk into it).
 blocks(x,y,z){
  const b=this.giant;if(b.state!=='play'&&b.state!=='goal')return false;
  const rel=b.p[2]-z,dz=rel-clamp(rel,0,HERO_HEIGHT),across=b.r*b.r-dz*dz;if(across<=0)return false;
  return Math.hypot(b.p[0]-x,b.p[1]-y)<HERO_RADIUS+Math.sqrt(across)-.02;
 }
 // How far a ball's surface is from his middle at the height his foot reaches (between the ankle and the knee), or
 // Infinity when it is out of his foot's way (above the knee).
 footGap(b,hero){
  const dx=b.p[0]-hero.x,dy=b.p[1]-hero.y,dh=Math.hypot(dx,dy);let best=Infinity;
  for(const k of [.12,.3,.5,.7]){const dz=b.p[2]-(hero.z+k),across=b.r*b.r-dz*dz;if(across>0)best=Math.min(best,dh-Math.sqrt(across));}
  return best;
 }
 // The ball the buttons kick from where he stands (within AIM_REACH), and the leg: +1 his right (the ball on his
 // right of the aim yaw), -1 his left.
 aim(hero,yaw=hero.yaw){
  let best=null;
  for(const b of this.balls){if(b.state!=='play'&&b.state!=='goal')continue;const gap=this.footGap(b,hero);if(gap<AIM_REACH&&(!best||gap<best.gap))best={ball:b,gap};}
  if(!best)return null;const b=best.ball,dx=b.p[0]-hero.x,dy=b.p[1]-hero.y;
  return {ball:b.kind,gap:best.gap,side:Math.cos(yaw)*dy-Math.sin(yaw)*dx>0?-1:1};
 }
 // The ball his foot reaches now for a kick along yaw (within KICK_REACH and KICK_CONE), or null.
 reach(hero,yaw=hero.yaw){
  const ch=Math.cos(yaw),sh=Math.sin(yaw);let best=null;
  for(const b of this.balls){if(b.state!=='play'&&b.state!=='goal')continue;const gap=this.footGap(b,hero),dx=b.p[0]-hero.x,dy=b.p[1]-hero.y,dh=Math.hypot(dx,dy)||1;
   if(gap<KICK_REACH&&(dx*ch+dy*sh)/dh>Math.cos(KICK_CONE)&&(!best||gap<best.gap))best={b,gap,side:ch*dy-sh*dx>0?-1:1};}
  return best;
 }
 // A pass goes to the team mate nearest the aim (within 35°, 50 m), led by where he runs to; alone, along the aim.
 passYaw(hero,yaw,speed){
  let best=null;
  for(const m of this.mates){const dx=m.x-hero.x,dy=m.y-hero.y,d=Math.hypot(dx,dy);if(d<2||d>50)continue;const off=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-yaw),Math.cos(Math.atan2(dy,dx)-yaw)));if(off<35*Math.PI/180&&(!best||off<best.off))best={m,d,off};}
  if(!best)return yaw;const t=best.d/Math.max(4,speed),m=best.m;return Math.atan2(m.y+(m.vy??0)*t-hero.y,m.x+(m.vx??0)*t-hero.x);
 }
 // The strike (kind 'chute' or 'passe', power 0..1): the impulse of a 3 kg foot at the kick's speed along the aim,
 // rising by its loft; a shot with backspin as from under the ball and a touch of curl, a pass rolling. Returns
 // {ball, speed} or null (a kick at the air).
 kick(hero,{yaw=hero.yaw,kind='chute',power=.5}={}){
  const best=this.reach(hero,yaw);if(!best)return null;
  const K=KICKS[kind]??KICKS.chute,pw=clamp(power,0,1),mix=([a,b])=>a+(b-a)*pw,foot=mix(K.foot)+(hero.running?RUN_BONUS:0);
  if(kind==='passe')yaw=this.passYaw(hero,yaw,foot*1.3);
  const b=best.b,ch=Math.cos(yaw),sh=Math.sin(yaw),loft=mix(K.loft)*((hero.lift??0)>.05&&kind==='chute'?.4:1)*Math.PI/180,d=[ch*Math.cos(loft),sh*Math.cos(loft),Math.sin(loft)],v=b.v,closing=foot-(v[0]*d[0]+v[1]*d[1]+v[2]*d[2]);if(closing<=0)return null;
  const j=1.5*closing/(1/b.m+1/FOOT_MASS);for(let i=0;i<3;i++)v[i]+=d[i]*j/b.m;
  if(kind==='passe'){b.w[0]=-v[1]/b.r;b.w[1]=v[0]/b.r;b.w[2]=0;}
  // Backspin about the horizontal across the aim (more on a lofted kick), a touch of curl about the vertical.
  else{const spin=j/b.m/b.r*(.05+loft*.45),side=(Math.sin(this.time*12.9898)*.5)*j/b.m/b.r*.06;b.w[0]+=sh*spin;b.w[1]+=-ch*spin;b.w[2]+=side;}
  b.touch='pe';b.asleep=false;if(b===this.small){this.control=null;this.looseUntil=this.time+.6;}const speed=b.speed;
  this.emit({type:'kick',ball:b.kind,kind,power:pw,strength:clamp(speed/(b.kind==='gigante'?2:22),.3,1.3),p:[...b.p]});
  return {ball:b.kind,speed,kind,power:pw};
 }
 info(){return {score:[...this.score],goals:this.goalsScored,outs:this.outs,roamSolids:this.roamSolids,dribbling:!!this.control,touches:this.touches??0,balls:this.balls.map(b=>({kind:b.kind,p:b.p.map(x=>+x.toFixed(3)),v:b.v.map(x=>+x.toFixed(3)),speed:+b.speed.toFixed(3),spin:+Math.hypot(...b.w).toFixed(3),state:b.state,asleep:b.asleep,touch:b.touch,where:b.where??null}))};}
}

// A goal at end s (−1 blue's, +1 orange's) in the bowl's frame: its frame's tubes and its nets for the balls, its solids
// for the car (the posts, the sides and the back as thin boxes), and the pieces to draw.
function buildGoal(bowl,s,team){
 const U=bowl.U,V=bowl.V,P=(u,v,z)=>{const [x,y]=bowl.world(u,v);return [x,y,z];},u0=s*GOAL.line,uB=u0+s*GOAL.depth,W=GOAL.width/2+GOAL.post,c=bowl.world(u0+s*GOAL.depth/2,0),g=bowl.floorAt(c[0],c[1]);
 const H=GOAL.height+GOAL.post,HB=GOAL.height+GOAL.frame,F=GOAL.frame,reach=W+GOAL.depth+2,prims=[],tubes=[];
 const tube=(a,b,r,front)=>{prims.push({type:'tube',a,b,r,kind:'trave',cx:c[0],cy:c[1],reach});tubes.push({a,b,r,front});};
 for(const v of [-W,W]){tube(P(u0,v,g-.2),P(u0,v,g+H),GOAL.post,true);tube(P(uB,v,g),P(uB,v,g+HB),F,false);tube(P(u0,v,g+HB),P(uB,v,g+HB),F,false);tube(P(u0,v,g+F),P(uB,v,g+F),F*.8,false);}
 tube(P(u0,-W,g+H),P(u0,W,g+H),GOAL.post,true);tube(P(uB,-W,g+HB),P(uB,W,g+HB),F,false);tube(P(uB,-W,g+F),P(uB,W,g+F),F*.8,false);
 const sV=[V[0],V[1],0],sU=[U[0]*s,U[1]*s,0],Z=[0,0,1],rect=(o,e1,h1,e2,h2,n)=>({type:'rect',o,e1,h1,e2,h2,n,kind:'rede',cx:c[0],cy:c[1],reach});
 const nets=[rect(P(uB,0,g+HB/2),sV,W,Z,HB/2,sU),rect(P((u0+uB)/2,-W,g+HB/2),sU,GOAL.depth/2,Z,HB/2,[-V[0],-V[1],0]),rect(P((u0+uB)/2,W,g+HB/2),sU,GOAL.depth/2,Z,HB/2,[V[0],V[1],0]),rect(P((u0+uB)/2,0,g+HB),sU,GOAL.depth/2,sV,W,Z)];
 prims.push(...nets);
 const hU=Math.atan2(U[1],U[0]),hV=Math.atan2(V[1],V[0]),solids=[];
 for(const v of [-W,W]){const p=bowl.world(u0,v);solids.push({x:p[0],y:p[1],r:GOAL.post+.05});const q=bowl.world((u0+uB)/2,v);solids.push({x:q[0],y:q[1],h:hU,hu:GOAL.depth/2+.12,hv:.14});}
 {const p=bowl.world(uB,0);solids.push({x:p[0],y:p[1],h:hV,hu:W+.14,hv:.14});}
 return {s,team,u0,uB,W,H,HB,g,prims,tubes,nets,solids,centre:c};
}
// The screen over each end, on the upper tier's parapet behind the goal, facing the pitch: 21 × 7 m.
function screenPlace(bowl,s){
 const F=bowl.F,u=s*(F.roof[0]-25.8),[x,y]=bowl.world(u,0),z=bowl.pitchZ+19,n=[-bowl.U[0]*s,-bowl.U[1]*s,0];
 return {s,x,y,z,n,w:21,h:7,prim:{type:'rect',o:[x,y,z],e1:[bowl.V[0],bowl.V[1],0],h1:10.5,e2:[0,0,1],h2:3.5,n,kind:'concreto',cx:x,cy:y,reach:12}};
}

// ---------- The picture
const T3=(p,out=new THREE.Vector3())=>out.set(p[0],p[2],-p[1]);
const PHI=(1+Math.sqrt(5))/2;
// The 32 panels of the classic ball (a truncated icosahedron blown up into a sphere): their directions, the 12
// pentagons first (an icosahedron's corners, the cyclic (0, ±1, ±φ)), then the 20 hexagons (its faces' centres: the
// dual dodecahedron's corners, (±1, ±1, ±1) and the cyclic (0, ±φ, ±1/φ); the other cyclic family is a dodecahedron
// turned 90°, whose corners are not over this icosahedron's faces).
export const BALL_PANELS=(()=>{const out=[],add=(x,y,z)=>{const l=Math.hypot(x,y,z);out.push(new THREE.Vector3(x/l,y/l,z/l));};
 for(const a of [-1,1])for(const b of [-1,1]){add(0,a,b*PHI);add(a,b*PHI,0);add(b*PHI,0,a);}
 for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])add(a,b,c);
 for(const a of [-1,1])for(const b of [-1,1]){add(0,a*PHI,b/PHI);add(b/PHI,0,a*PHI);add(a*PHI,b/PHI,0);}
 return out;})();
// The panels drawn on the sphere: a point belongs to the face its ray meets first (largest n·f/d: the hexagons' faces
// stand nearer the centre, d6/d5 = 2.2673/2.3274), the seams where two faces tie, grime and grass from the ball's own
// surface (no two spots alike).
function ballMaterial({hex,penta,seam,width,grime,seed}){
 const m=new THREE.MeshStandardMaterial({name:'Bola_gomos',roughness:.42,metalness:0});
 const uniforms={uFaces:{value:BALL_PANELS},uHex:{value:new THREE.Color(hex)},uPenta:{value:new THREE.Color(penta)},uSeamCol:{value:new THREE.Color(seam)},uSeam:{value:width},uGrime:{value:grime},uSeed:{value:seed}};
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBolaN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBolaN=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vBolaN;uniform vec3 uFaces[32];uniform vec3 uHex,uPenta,uSeamCol;uniform float uSeam,uGrime,uSeed;
float bolaH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float bolaN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(bolaH(i),bolaH(i+vec3(1,0,0)),f.x),mix(bolaH(i+vec3(0,1,0)),bolaH(i+vec3(1,1,0)),f.x),f.y),mix(mix(bolaH(i+vec3(0,0,1)),bolaH(i+vec3(1,0,1)),f.x),mix(bolaH(i+vec3(0,1,1)),bolaH(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
vec3 bolaD=normalize(vBolaN);float bolaB1=-9.,bolaB2=-9.,bolaP=0.;
for(int i=0;i<32;i++){float s=dot(bolaD,uFaces[i])*(i<12?1.:1.02651);if(s>bolaB1){bolaB2=bolaB1;bolaB1=s;bolaP=i<12?1.:0.;}else if(s>bolaB2)bolaB2=s;}
float bolaGap=bolaB1-bolaB2,bolaAA=fwidth(bolaGap)*1.2+1e-5,bolaSeam=1.-smoothstep(uSeam-bolaAA,uSeam+bolaAA,bolaGap);
vec3 bolaQ=bolaD*6.+uSeed;float bolaDirt=bolaN(bolaQ)*.6+bolaN(bolaQ*3.1)*.4;
vec3 bolaCol=mix(uHex,uPenta,bolaP)*(1.-uGrime*smoothstep(.5,.95,bolaDirt));bolaCol=mix(bolaCol,bolaCol*vec3(.78,.9,.62),uGrime*smoothstep(.62,.9,bolaN(bolaQ*1.7+3.)));
diffuseColor.rgb*=mix(bolaCol,uSeamCol,bolaSeam);`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.85,bolaSeam);');
 };
 m.customProgramCacheKey=()=>'bola-gomos-v1';
 return m;
}
// Tubes (the goals' frames) as one mesh: an n-sided tube a-b of radius r each, capped, in the scene's axes.
function tubesGeometry(list,sides){
 const pos=[],nor=[],P=new THREE.Vector3(),Q=new THREE.Vector3(),D=new THREE.Vector3(),E1=new THREE.Vector3(),E2=new THREE.Vector3(),N=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0);
 const push=(v,n)=>{pos.push(v.x,v.y,v.z);nor.push(n.x,n.y,n.z);};
 for(const t of list){
  T3(t.a,P);T3(t.b,Q);D.subVectors(Q,P).normalize();E1.crossVectors(D,Math.abs(D.y)>.99?X:UP).normalize();E2.crossVectors(D,E1).normalize();
  const ring=(c,k)=>{const a=k/sides*2*Math.PI;N.copy(E1).multiplyScalar(Math.cos(a)).addScaledVector(E2,Math.sin(a));return [c.clone().addScaledVector(N,t.r),N.clone()];};
  for(let k=0;k<sides;k++){const [a0,n0]=ring(P,k),[a1,n1]=ring(P,k+1),[b0]=ring(Q,k),[b1]=ring(Q,k+1);
   // (wound so the outside faces out)
   push(a0,n0);push(b1,n1);push(b0,n0);push(a0,n0);push(a1,n1);push(b1,n1);
   const nd=D.clone().negate();push(P,nd);push(a1,nd);push(a0,nd);push(Q,D);push(b0,D);push(b1,D);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
 // Make sure of the winding: flip any triangle whose face turns against its normals.
 const p=g.attributes.position.array,nn=g.attributes.normal.array,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),f=new THREE.Vector3();
 for(let i=0;i<p.length;i+=9){a.fromArray(p,i);b.fromArray(p,i+3);c.fromArray(p,i+6);f.subVectors(b,a).cross(c.clone().sub(a));const m=nn[i]+nn[i+3]+nn[i+6],my=nn[i+1]+nn[i+4]+nn[i+7],mz=nn[i+2]+nn[i+5]+nn[i+8];
  if(f.x*m+f.y*my+f.z*mz<0)for(let k=0;k<3;k++){const t=p[i+3+k];p[i+3+k]=p[i+6+k];p[i+6+k]=t;const u=nn[i+3+k];nn[i+3+k]=nn[i+6+k];nn[i+6+k]=u;}}
 g.computeBoundingSphere();return g;
}
// The nets: a knotted mesh of 25 cm cells (two to the texture's 0.5 m), see-through between the cords.
function netTexture(){
 const t=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(246,246,240,.95)';ctx.lineWidth=5;
  for(const k of [0,.5,1]){ctx.beginPath();ctx.moveTo(k*w,0);ctx.lineTo(k*w,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,k*h);ctx.lineTo(w,k*h);ctx.stroke();}
  ctx.fillStyle='rgba(255,255,250,1)';for(const x of [0,.5,1])for(const y of [0,.5,1]){ctx.beginPath();ctx.arc(x*w,y*h,5,0,2*Math.PI);ctx.fill();}},128,128,true);
 return t;
}
function netGeometry(goal){
 const pos=[],uv=[],add=(o,e1,h1,e2,h2)=>{const c=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[o[0]+e1[0]*h1*i+e2[0]*h2*j,o[1]+e1[1]*h1*i+e2[1]*h2*j,o[2]+e1[2]*h1*i+e2[2]*h2*j]),t=[[0,0],[2*h1,0],[2*h1,2*h2],[0,2*h2]];
  for(const k of [0,1,2,0,2,3]){const v=T3(c[k]);pos.push(v.x,v.y,v.z);uv.push(t[k][0]/.5,t[k][1]/.5);}};
 for(const n of goal.nets)add(n.o,n.e1,n.h1,n.e2,n.h2);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
// A flat piece on the grass: centre (u, v) in the bowl's frame, lu × lv metres, a little over the ground.
function groundPiece(bowl,u,v,lu,lv,lift){
 const pos=[],P=(du,dv)=>{const [x,y]=bowl.world(u+du,v+dv);return T3([x,y,bowl.floorAt(x,y)+lift]);};
 const c=[P(-lu/2,-lv/2),P(lu/2,-lv/2),P(lu/2,lv/2),P(-lu/2,lv/2)];for(const k of [0,2,1,0,3,2])pos.push(c[k].x,c[k].y,c[k].z);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();if(g.attributes.normal.getY(0)<0){const p=g.attributes.position.array;for(let i=0;i<p.length;i+=9)for(let k=0;k<3;k++){const t=p[i+3+k];p[i+3+k]=p[i+6+k];p[i+6+k]=t;}g.computeVertexNormals();}
 g.computeBoundingSphere();return g;
}
// The screens' picture: the score in the teams' colours, the stadium's name; after a goal, GOL! and who scored.
function drawScoreboard(ctx,w,h,{score,flash=null,tick=0}){
 const B='"Arial Black","Arial Bold",Arial,sans-serif';ctx.fillStyle='#05070b';ctx.fillRect(0,0,w,h);
 // LED dots: a faint grid over everything.
 const text=(s,x,y,size,fill,align='center',max=w)=>{ctx.font=`${size}px ${B}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=fill;ctx.fillText(s,x,y,max);};
 if(flash&&Math.floor(tick*3)%2===0){
  const t=TEAMS[flash.team];ctx.fillStyle=t.css;ctx.fillRect(0,0,w,h);text('GOOOL!',w/2,h*.42,190,'#ffffff');text(`${t.name}${flash.by==='carro'?' · DE CARRO':flash.by==='pe'?' · A PÉ':''}`,w/2,h*.82,52,'#fff6d8');
 }else{
  for(const [k,x0] of [[0,0],[1,w*.58]]){const t=TEAMS[k];ctx.fillStyle=t.css;ctx.fillRect(x0,h*.2,w*.42,h*.62);text(t.name,x0+w*.21,h*.34,54,'#ffffff');text(String(score[k]),x0+w*.21,h*.62,150,'#ffffff');}
  text('×',w/2,h*.52,110,'#f2f2ee');text('MINEIRÃO · AUTO-POBRE RACING',w/2,h*.1,34,'#e8d48a');text('EMPURRE A BOLA PARA O GOL',w/2,h*.92,30,'#c8d0d8');
 }
 ctx.fillStyle='rgba(0,0,0,.28)';for(let y=0;y<h;y+=4)ctx.fillRect(0,y,w,1);for(let x=0;x<w;x+=4)ctx.fillRect(x,0,1,h);
}

// ---------- The panel at the top (score, the hint the first time on the floor) and the big GOL! banner.
function buildHud(){
 const hud=document.createElement('aside');hud.id='futebolHud';hud.hidden=true;hud.setAttribute('role','status');
 hud.innerHTML='<div><b class="azul">AZUL <i id="golsAzul">0</i></b><span>×</span><b class="laranja"><i id="golsLaranja">0</i> LARANJA</b></div><small id="futebolDica"></small>';
 const banner=document.createElement('section');banner.id='golBanner';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 banner.innerHTML='<strong>GOOOL!</strong><span id="golTime"></span><em id="golPlacar"></em>';
 document.body.append(hud,banner);return {hud,banner,$:id=>document.getElementById(id)};
}

export const hasPampulhaFutebol=data=>(data.scenery?.landmarks??[]).some(m=>m.kind==='mineirao');

// The football on the Mineirão's floor (main.js: one per circuit load, among the circuit's extras, drawn even with the
// camera down on the floor: enclosed). sound(name, options): an effect (car-audio.js); hud: the panels (none in Node).
export function createPampulhaFutebol(data,{ground=null,mobile=false,sound=()=>{},hud=typeof document!=='undefined'}={}){
 const root=new THREE.Group();root.name='Futebol_Mineirao';
 const game=new FootballGame(data,{ground}),bowl=game.bowl,stats={roamSolids:game.roamSolids,drawCalls:0,triangles:0};
 // The balls: the giant one classic black and white, the small one white with green and yellow panels.
 const looks={gigante:{hex:0xf3f1ea,penta:0x141416,seam:0x2b2926,width:.011,grime:.22,seed:3.1},bolinha:{hex:0xf6f6f2,penta:0x1b8f3a,seam:0x3a3a36,width:.013,grime:.12,seed:8.7}};
 const meshes=game.balls.map(b=>{const seg=b.kind==='gigante'?(mobile?40:72):(mobile?16:24),m=new THREE.Mesh(new THREE.SphereGeometry(1,seg,Math.round(seg*.66)),ballMaterial(looks[b.kind]));m.name='Bola_'+b.kind;m.castShadow=true;m.receiveShadow=true;root.add(m);return m;});
 // The goals: the front frame in the team's colour with its glow, the box behind white, the nets, the goal line lit on
 // the grass and the goal's floor tinted.
 const netMat=new THREE.MeshStandardMaterial({name:'Gol_rede',map:netTexture(),transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:.9,metalness:0});
 const whiteMat=new THREE.MeshStandardMaterial({name:'Gol_quadro',color:0xf1f1ec,roughness:.4,metalness:.2});
 const frameMats=TEAMS.map(t=>new THREE.MeshStandardMaterial({name:'Gol_trave_'+t.id,color:t.color,emissive:t.glow,emissiveIntensity:.5,roughness:.32,metalness:.25}));
 const lineMats=TEAMS.map(t=>new THREE.MeshBasicMaterial({name:'Gol_linha_'+t.id,color:t.glow,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6}));
 const boxMats=TEAMS.map(t=>new THREE.MeshBasicMaterial({name:'Gol_area_'+t.id,color:t.color,transparent:true,opacity:.2,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));
 for(const goal of game.goals){
  const front=new THREE.Mesh(tubesGeometry(goal.tubes.filter(t=>t.front),mobile?10:16),frameMats[goal.team]),back=new THREE.Mesh(tubesGeometry(goal.tubes.filter(t=>!t.front),mobile?6:10),whiteMat),net=new THREE.Mesh(netGeometry(goal),netMat);
  front.name='Gol_trave_'+TEAMS[goal.team].id;back.name='Gol_quadro_'+TEAMS[goal.team].id;net.name='Gol_rede_'+TEAMS[goal.team].id;net.renderOrder=2;
  for(const o of [front,back]){o.castShadow=true;o.receiveShadow=true;}
  const line=new THREE.Mesh(groundPiece(bowl,goal.u0,0,.35,GOAL.width+2*GOAL.post,.05),lineMats[goal.team]),box=new THREE.Mesh(groundPiece(bowl,(goal.u0+goal.uB)/2,0,GOAL.depth,GOAL.width,.04),boxMats[goal.team]);
  line.name='Gol_linha';box.name='Gol_area';line.renderOrder=box.renderOrder=1;
  root.add(front,back,net,line,box);
 }
 // The screens: one picture for both, redrawn when the score or the flash changes.
 const board={canvas:null,ctx:null,texture:null,flash:null,flashTime:0,key:''};
 const screenTex=canvasTexture((ctx,w,h)=>{board.ctx=ctx;board.w=w;board.h=h;drawScoreboard(ctx,w,h,{score:[0,0]});},1024,342,false);board.texture=screenTex;
 const screenMat=new THREE.MeshStandardMaterial({name:'Telao',map:screenTex,emissiveMap:screenTex,emissive:0xffffff,emissiveIntensity:1.1,roughness:.65,metalness:0});
 const caseMat=new THREE.MeshStandardMaterial({name:'Telao_caixa',color:0x16181b,roughness:.6,metalness:.4});
 for(const sc of game.screens){
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(sc.w,sc.h),screenMat),c=T3([sc.x,sc.y,sc.z]),look=T3([sc.x+sc.n[0],sc.y+sc.n[1],sc.z]);plane.position.copy(c);plane.lookAt(look);plane.name='Telao';
  const box=new THREE.Mesh(new THREE.BoxGeometry(sc.w+.8,sc.h+.8,.9),caseMat);box.position.copy(c).addScaledVector(look.clone().sub(c),-.5);box.quaternion.copy(plane.quaternion);box.name='Telao_caixa';box.castShadow=true;
  root.add(plane,box);
 }
 // Confetti from the scorers' goal: paper in the team's colour and white, fluttering down for a few seconds.
 const CONFETTI=mobile?160:360,confettiMat=new THREE.MeshStandardMaterial({name:'Confete',side:THREE.DoubleSide,roughness:.7,metalness:0});
 const confetti=new THREE.InstancedMesh(new THREE.PlaneGeometry(.34,.2),confettiMat,CONFETTI);confetti.name='Confete';confetti.frustumCulled=false;confetti.count=0;confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 const bits=Array.from({length:CONFETTI},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),axis:new THREE.Vector3(1,0,0),spin:0,angle:0,age:9,life:6,phase:0}));confetti.visible=false;root.add(confetti);
 const tmp=new THREE.Object3D(),col=new THREE.Color();
 function burst(goal,team){
  const t=TEAMS[team];let k=0;confetti.visible=true;confetti.count=CONFETTI;
  for(const v of [-goal.W,goal.W]){
   const [x,y]=bowl.world(goal.u0,v),from=T3([x,y,goal.g+goal.H+.6]);
   for(let i=0;i<CONFETTI/2;i++,k++){const b=bits[k],a=Math.random()*Math.PI*2,up=13+Math.random()*9,out=2+Math.random()*5,inward=-Math.sign(v);
    b.p.copy(from);const dirU=[-bowl.U[0]*goal.s,-bowl.U[1]*goal.s],dirV=[bowl.V[0]*inward,bowl.V[1]*inward];
    b.v.set((dirU[0]*.6+dirV[0]*.5)*out+Math.cos(a)*1.5,up,-((dirU[1]*.6+dirV[1]*.5)*out+Math.sin(a)*1.5));b.axis.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();b.spin=6+Math.random()*10;b.angle=Math.random()*6;b.age=0;b.life=5+Math.random()*2.5;b.phase=Math.random()*6;
    confetti.setColorAt(k,col.set(i%3===2?0xffffff:i%3===1?t.glow:t.color));}
  }
  confetti.instanceColor.needsUpdate=true;
 }
 function updateConfetti(dt){
  if(!confetti.visible)return;let alive=0;
  for(let k=0;k<CONFETTI;k++){const b=bits[k];if(b.age>=b.life){tmp.position.set(0,-1e4,0);tmp.scale.setScalar(0);tmp.updateMatrix();confetti.setMatrixAt(k,tmp.matrix);continue;}alive++;
   b.age+=dt;const drag=b.age<.5?.9:3.2;b.v.y-=G*dt;b.v.multiplyScalar(Math.exp(-drag*dt));b.v.y=Math.max(b.v.y,-1.6);b.p.addScaledVector(b.v,dt);b.p.x+=Math.sin(b.age*3+b.phase)*.6*dt;b.p.z+=Math.cos(b.age*2.3+b.phase)*.6*dt;
   const floor=bowl.floorAt(b.p.x,-b.p.z)+.02;if(b.p.y<floor){b.p.y=floor;b.v.set(0,0,0);b.spin=0;}
   b.angle+=b.spin*dt;tmp.position.copy(b.p);tmp.quaternion.setFromAxisAngle(b.axis,b.angle);tmp.scale.setScalar(Math.min(1,(b.life-b.age)/.8));tmp.updateMatrix();confetti.setMatrixAt(k,tmp.matrix);}
  confetti.instanceMatrix.needsUpdate=true;if(!alive){confetti.visible=false;confetti.count=0;}
 }
 root.traverse(o=>{if(o.isMesh){stats.drawCalls++;const g=o.geometry;stats.triangles+=(g.index?g.index.count:g.attributes.position.count)/3;}});stats.triangles=Math.round(stats.triangles);
 // The panels.
 const ui=hud?buildHud():null,shown={},set=(id,key,value)=>{if(!ui)return;if(shown[id+key]!==value){shown[id+key]=value;ui.$(id)[key]=value;}};
 let hint=0,hintGiven=false,bannerTime=0,lastCar=null,walker=null;
 const listener=new THREE.Vector3(),right=new THREE.Vector3(),dir=new THREE.Vector3(),centre=T3([bowl.cx,bowl.cy,bowl.pitchZ]);
 // Heard from the camera: fainter with distance, on its side.
 function heard(name,p,strength=1,camera){
  if(!camera)return sound(name,{strength});listener.setFromMatrixPosition(camera.matrixWorld);T3(p,dir).sub(listener);const far=dir.length();const k=clamp(1.25-far/150,0,1.25);if(k<.12)return;
  right.setFromMatrixColumn(camera.matrixWorld,0);sound(name,{strength:strength*k,pan:clamp(right.dot(dir)/(far||1),-.8,.8)});
 }
 function showGoal(e){
  const t=TEAMS[e.team];board.flash={team:e.team,by:e.by};board.flashTime=4;burst(game.goals[e.goal],e.team);
  if(ui){ui.banner.hidden=true;void ui.banner.offsetWidth;ui.banner.hidden=false;ui.banner.dataset.team=t.id;ui.$('golTime').textContent=`do ${t.name}${e.by==='carro'?' · de carro':e.by==='pe'?' · a pé':''}${e.ball==='bolinha'?' · bolinha':''}`;ui.$('golPlacar').textContent=`AZUL ${e.score[0]} × ${e.score[1]} LARANJA`;bannerTime=4.2;}
 }
 const view={ahead:0,shown:true};
 const extra={root,enclosed:true,stats,game,view,
  // The pilot on foot (free-walk.js): the game reads his feet and throws him.
  attach(w){walker=w;game.hero=()=>w?.active?w.footInfo():null;game.onKnock=(from,side,text)=>w?.knock(from,side,text)??false;},
  step(car,dt){lastCar=car;game.step(car,dt);},
  newRace(){game.reset();board.flash=null;board.key='';if(ui){ui.banner.hidden=true;bannerTime=0;}},
  update(dt,camera){
   // The balls where they are now (and a frame's worth on), turning; a ball just back grows in from nothing.
   meshes.forEach((m,i)=>{const b=game.balls[i],ahead=b.state==='play'||b.state==='goal'?view.ahead:0,hide=b.state==='out'&&b.timer>OUT_HIDE;m.visible=!hide;
    m.position.set(b.p[0]+b.v[0]*ahead,b.p[2]+b.v[2]*ahead,-(b.p[1]+b.v[1]*ahead));m.quaternion.set(b.q[0],b.q[2],-b.q[1],b.q[3]);m.scale.setScalar(b.r*Math.max(.02,smooth(b.spawn)));});
   for(const e of game.takeEvents()){
    if(e.type==='goal'){showGoal(e);sound('gol',{strength:1.2});}
    else if(e.type==='out'){heard('apito',e.p,1,camera);}
    else if(e.type==='hit')heard(e.ball==='gigante'?'bolaGigante':'chute',e.p,e.strength,camera);
    else if(e.type==='kick')heard('chute',e.p,e.strength,camera);
    else if(e.type==='touch')heard('toque',e.p,e.strength,camera);
    else if(e.type==='bounce')heard('quique',e.p,e.strength,camera);
    else if(e.type==='knock')heard('bolaGigante',e.p,1,camera);
   }
   updateConfetti(dt);
   // The screens: the score, flashing GOL! for a few seconds after one.
   if(board.flashTime>0){board.flashTime-=dt;if(board.flashTime<=0)board.flash=null;}
   const key=game.score.join(':')+(board.flash?':'+Math.floor(board.flashTime*3)%2:'');if(key!==board.key&&board.ctx){board.key=key;drawScoreboard(board.ctx,board.w,board.h,{score:game.score,flash:board.flash,tick:board.flashTime});board.texture.needsUpdate=true;}
   // Far off, nothing of it is drawn.
   if(camera){listener.setFromMatrixPosition(camera.matrixWorld);root.visible=listener.distanceTo(centre)<1400;}
   if(!ui)return;
   // On the floor (the pilot or his car): the score at the top; the first time, what to do.
   const who=walker?.active?walker.footInfo():lastCar,where=who?bowl.where(who.x,who.y):null,inside=!!where&&where.h>-3&&!where.cut,near=!!where&&where.d>-8;
   if(inside&&!hintGiven&&view.shown){hintGiven=true;hint=9;}hint=Math.max(0,hint-dt);
   const on=view.shown&&(near||bannerTime>0);if(ui.hud.hidden===on)ui.hud.hidden=!on;
   set('golsAzul','textContent',String(game.score[0]));set('golsLaranja','textContent',String(game.score[1]));
   set('futebolDica','textContent',hint>0?(walker?.active?'Encoste na bolinha e ela é sua: ele conduz sozinho · E (ou clique) chuta, R (ou botão direito) passa: segure para mais forte':'Bola gigante em campo! Empurre com o carro para o gol do outro time · a pé (F) dá pra jogar com a bolinha'):'');
   if(bannerTime>0){bannerTime-=dt;if(bannerTime<=0||!view.shown)ui.banner.hidden=true;}
  },
  setNight(level){for(const m of frameMats)m.emissiveIntensity=.5+level*.12;screenMat.emissiveIntensity=1.1+level*.3;for(const m of lineMats)m.opacity=.85;},
  info(){return {...game.info(),stats,hud:ui?{shown:!ui.hud.hidden,banner:!ui.banner.hidden}:null,confetti:confetti.visible?confetti.count:0};},
  dispose(){ui?.hud.remove();ui?.banner.remove();}
 };
 return extra;
}
