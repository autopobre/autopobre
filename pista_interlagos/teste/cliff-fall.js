// A car that goes over a plateau circuit's rim (cliff-edge.js; the Chapada dos Sonhos has no guardrail
// anywhere) falls to the foot of the wall for real: past the line physics.js gives it the abyss's ground.
// A few seconds later it is back on the track, at rest a few metres short of the station it left from,
// its clock having run all the while: the time lost is the fall's own. The lap still counts in the race
// (the car took no shortcut) but never as a best lap, a record or a ghost (physics.js lapFell).
// trackFall runs for every car (race-field.js after each rival's step, main.js once a frame for the
// player); FallView takes the player's camera to the rim while the car goes down.
export const FALL=Object.freeze({
 drop:3,      // metres under the road of the last station on the track: it is falling, not at the lip
 boom:3.2,    // seconds watched after it hits the ground below (and goes up: explosion.js)
 longest:9,   // seconds from the lip at most (a car caught on the talus)
 back:4,      // stations (about 8 m) short of where it left the track
 fade:.35,    // the picture's fade to black and back (FallView)
 slow:.3,     // the film's slow motion at the impact (FallView.timeScale), for SLOW_FOR seconds
 slowFor:.9
});
// Called with the time since the last call. 'fall' when the car has just gone over, 'hit' when it meets the ground
// below (the moment it goes up), 'back' when it was put back on the track, null otherwise.
export function trackFall(car,dt){
 if(!car.cliff)return null;
 const p=car.surface;if(!p)return null;
 if(!car.fall){
  if(!p.abyss){if(p.onRoad&&!p.pit)car.safeIndex=p.i;return null;}
  const from=car.safeIndex??p.i;
  if(car.z>car.a[from][3]-FALL.drop)return null;
  const rim=car.cliff.query(car.x,car.y);
  const [x,y]=rim.i>=0?car.cliff.point(rim.i,rim.u):[car.x,car.y];
  car.fall={t:0,from,hit:null,rim:{x,y,z:rim.i>=0?rim.top:car.a[from][3],nx:rim.nx,ny:rim.ny}};car.falls=(car.falls??0)+1;
  return 'fall';
 }
 const f=car.fall;f.t+=dt;
 if(!f.hit&&f.t>.25&&(car.wheelsDown>0||car.hullContact)){f.hit={t:f.t,x:car.x,y:car.y,z:car.z,drop:f.rim.z-car.z};return 'hit';}
 if(f.t<FALL.longest&&!(f.hit&&f.t-f.hit.t>=FALL.boom))return null;
 // The fall is over before the car is seated: falling, it would take the abyss's ground under the track.
 car.fall=null;const n=car.n;car.recover((f.from-FALL.back+n)%n);
 car.excursion=null;car.lapFell=true;car.safeIndex=car.index;car.backAt=car.clock;
 return 'back';
}
// Seconds until trackFall puts the car back (the fade starts before).
export function fallLeft(car){
 const f=car.fall;if(!f)return Infinity;
 return Math.min(FALL.longest-f.t,f.hit?FALL.boom-(f.t-f.hit.t):Infinity);
}
// What stands between a camera and its subject below the wall: the ground (the abyss's past the line, the plateau's
// before it) and the tree crowns on it (data.scenery.cover: woods up to ~17 m, scrub ~7 m).
const CROWN={'1':17,'2':7};
function canopy(car,x,y){
 const c=car.cliff,cover=car.data.scenery?.cover,side=c.query(x,y,canopy.hit).d>0;
 let z=car.terrain(x,y,side?c.abyssZ:c.plateauZ);
 if(cover){const i=Math.floor((x-cover.x0)/cover.step+.5),j=Math.floor((y-cover.y0)/cover.step+.5);if(i>=0&&j>=0&&i<cover.nx&&j<cover.ny)z+=CROWN[cover.classes[j*cover.nx+i]]??0;}
 return z;
}
canopy.hit={};
// The least height of the sight line from a over the ground and crowns, leaving out its last `near` metres (the
// trees in the fireball itself). Negative: something hides the subject.
function sightMargin(car,ax,ay,az,bx,by,bz,near=0){
 const len=Math.hypot(bx-ax,by-ay),steps=Math.max(2,Math.ceil(len/3));let least=Infinity;
 for(let k=1;k<steps;k++){const u=k/steps;if(len*(1-u)<near)break;least=Math.min(least,az+(bz-az)*u-canopy(car,ax+(bx-ax)*u,ay+(by-ay)*u));}
 return least;
}
// The player's camera while the car falls: a drone out over the abyss, ahead of where the car went over and off
// the wall, filming it go down the face (it sinks with the car to keep the wall in the picture, rises over a ridge
// or the crowns that would hide it). At the impact the film's moment: slow motion (timeScale, for main.js's clock
// of the world), a flash, a cut to a still shot of the fireball picked round it so that nothing hides it (low if it
// can, the wall behind it), shaken; then the picture fades to black, the car is put back, and it fades in on the
// usual camera. update takes real seconds; true while it holds the camera.
export class FallView{
 constructor(fade,flash=null){this.fade=fade;this.flash=flash;this.active=false;this.dark=0;this.glare=0;this.fov=null;this.z=null;this.timeScale=1;this.since=Infinity;this.shake=0;this.lift=0;this.shot=null;}
 // A still shot of the fireball at (x, y, z): round it, 55-95 m off, as low as the sight line allows.
 pickShot(car,boom,from){
  const tz=boom.z+9,wall=car.cliff.query(boom.x,boom.y).d;let best=null;
  for(let a=0;a<16;a++)for(const dist of [55,75,95]){
   const ang=a/16*Math.PI*2,x=boom.x+Math.cos(ang)*dist,y=boom.y+Math.sin(ang)*dist,q=car.cliff.query(x,y);
   if(q.d<6)continue;
   for(const h of [6,12,20,32,50,75]){
    const z=Math.max(canopy(car,x,y)+3,boom.z+h);
    if(sightMargin(car,x,y,z,boom.x,boom.y,tz,14)<1.5)continue;
    // Low, facing the wall (further out than the fire), not far from where the drone was.
    const score=h+(q.d>wall+15?0:18)+.04*Math.hypot(x-from[0],y-from[1]);
    if(!best||score<best.score)best={x,y,z,score};
    break;
   }
  }
  // Nothing low enough sees it: from high above, off to the open side.
  return best??{x:boom.x+(boom.x-from[0])*.2,y:boom.y+(boom.y-from[1])*.2,z:boom.z+90,score:Infinity};
 }
 update(dt,camera,car,{slowMotion=true}={}){
  const f=car.fall;
  if(f){
   const r=f.rim,tx=r.ny,ty=-r.nx,along=(car.x-r.x)*tx+(car.y-r.y)*ty;
   if(!this.active){
    this.active=true;this.fov=camera.fov;this.z=r.z+6;this.hit=null;this.shot=null;this.since=Infinity;this.lift=0;
    // Ahead of the car along the wall, looking back at it with the wall behind; it keeps ahead as the car carries on.
    this.side=Math.sign(car.vx*tx+car.vy*ty)||1;this.along=along+this.side*45;this.out=26;
   }
   if(f.hit&&this.hit!==f.hit){
    this.hit=f.hit;this.since=0;this.shake=1;this.glare=.75;
    this.shot=this.pickShot(car,f.hit,[camera.position.x,-camera.position.z]);this.recheck=.3;
   }
   this.since+=dt;
   let x,y,focusX,focusY,focusZ;
   if(this.shot){
    // The still shot, pushing in a little; picked again if the fire climbs out of sight of it or the car rolls on.
    const b=this.hit,s=this.shot;focusX=b.x;focusY=b.y;focusZ=b.z+9;
    this.recheck-=dt;if(this.recheck<=0){this.recheck=.3;if(sightMargin(car,s.x,s.y,s.z,focusX,focusY,focusZ,14)<0)this.shot=this.pickShot(car,b,[s.x,s.y]);}
    const push=Math.min(.12,this.since*.04);x=this.shot.x+(focusX-this.shot.x)*push;y=this.shot.y+(focusY-this.shot.y)*push;this.z=this.shot.z+(focusZ-this.shot.z)*push;
   }else{
    focusX=car.x;focusY=car.y;focusZ=car.z;
    this.along+=(along+this.side*45-this.along)*Math.min(1,dt*1.5);
    // Out from the wall where it really runs there (it bends), and always further out than the car.
    const q=car.cliff.query(r.x+tx*this.along,r.y+ty*this.along),qc=car.cliff.query(focusX,focusY);
    this.out+=(Math.max(26,(qc.near?qc.d:30)+20)-this.out)*Math.min(1,dt*2);
    x=r.x+tx*this.along+r.nx*this.out;y=r.y+ty*this.along+r.ny*this.out;
    if(q.near){const [ex,ey]=car.cliff.point(q.i,q.u);x=ex+q.nx*this.out;y=ey+q.ny*this.out;}
    // Up while a ridge or the crowns hide the car, back down once they no longer do.
    const hidden=sightMargin(car,x,y,this.z,focusX,focusY,focusZ,3)<1;
    this.lift=hidden?Math.min(90,this.lift+dt*60):Math.max(0,this.lift-dt*10);
    const want=car.z+8+.12*Math.max(0,r.z-car.z)+this.lift;
    this.z=Math.max(canopy(car,x,y)+4,this.z+(want-this.z)*Math.min(1,dt*2.5));
   }
   this.shake*=Math.exp(-dt*3.2);const j=this.shake*1.1,n=()=>(Math.random()-.5)*2*j;
   camera.position.set(x+n(),this.z+n(),-y+n());
   camera.lookAt(focusX,focusZ,-focusY);
   const far=Math.hypot(focusX-x,focusY-y,focusZ-this.z),near=this.shot?70:45;
   camera.fov=Math.max(30,Math.min(this.fov,this.fov*near/Math.max(near,far)));camera.updateProjectionMatrix();
   this.dark=Math.max(0,Math.min(1,1-fallLeft(car)/FALL.fade));
  }else if(this.active){
   this.active=false;camera.fov=this.fov;camera.updateProjectionMatrix();this.dark=1;this.hit=null;this.shot=null;
  }else this.dark=Math.max(0,this.dark-dt/(FALL.fade*1.5));
  // Slow motion from the impact, easing back to full speed.
  const s=this.since;this.timeScale=!slowMotion||!f||!(s<FALL.slowFor+.5)?1:s<FALL.slowFor?FALL.slow:FALL.slow+(1-FALL.slow)*(s-FALL.slowFor)/.5;
  this.glare=Math.max(0,this.glare-dt*2.6);
  if(this.fade){this.fade.style.opacity=String(this.dark);this.fade.hidden=this.dark<=0;}
  if(this.flash){this.flash.style.opacity=String(this.glare);this.flash.hidden=this.glare<=0;}
  return !!f;
 }
 stop(camera){if(this.active&&camera){camera.fov=this.fov;camera.updateProjectionMatrix();}this.active=false;this.dark=0;this.glare=0;this.timeScale=1;this.since=Infinity;this.shot=null;for(const e of [this.fade,this.flash])if(e){e.style.opacity='0';e.hidden=true;}}
}
// For the checks: is the subject of the fall camera in sight from where it is? (the player's car, or its fireball)
export function fallInSight(view,car,camera){
 if(!car.fall||!car.cliff)return null;const b=view.hit;
 return sightMargin(car,camera.position.x,-camera.position.z,camera.position.y,b?b.x:car.x,b?b.y:car.y,b?b.z+9:car.z,b?14:3);
}
