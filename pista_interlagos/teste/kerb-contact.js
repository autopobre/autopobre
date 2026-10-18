import {SUSPENSION_WHEELS} from './physics.js';
import {pitLane} from './pit-lane.js';
import {inBranchGap} from './branch-lane.js';
import {branchKerbAt} from './branch-layout.js';

// Kerbs (track-surface.js createCurbs) run from the road edge to KERB_WIDTH past it, ridged every
// RIDGE_SPACING metres. The physics counts a wheel there as off the road (grass grip: the AI lap
// references depend on it), so the kerb's feel lives here instead: which wheels ride it, a smoothed
// car.kerbRide for the cameras, the rumble loop and the pad; no dirt cloud and no gravel noise.
export const KERB_WIDTH=1.05,RIDGE_SPACING=.4;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// The same strips createCurbs draws: a station pair carries a kerb on a side when both stations flag
// it (column 13 right, 14 left). Circuits without the columns (Curvelo) have kerbs all round, except
// on the left where its pit lane leaves and rejoins the track.
export function kerbSegment(data,i,side){
 const a=data.samples,n=a.length,p=a[((i%n)+n)%n],q=a[(((i+1)%n)+n)%n],flag=side<0?13:14;
 if(side>0){const lane=pitLane(data,p[0]);if(lane&&(lane.entry||lane.exit))return false;}
 // Not across a branch road's mouth (createCurbs leaves it out: the branch's asphalt runs on there).
 if(inBranchGap(data,p[0],side))return false;
 return p.length>flag?!!(p[flag]&&q[flag]):true;
}
// What one contact point runs on, from a TestCar.sample: 'road' (asphalt, pit lane), 'kerb' or 'dirt'.
export function surfaceKind(data,p){
 if(p.onRoad||p.pit)return 'road';
 const outside=Math.abs(p.d)-p.width/2;
 // On a branch road (physics.js sample: branch, branchS; d and width its own) its own kerbs (track-surface.js Zebra_ramal).
 const side=p.d<0?-1:1;
 return data&&outside>=0&&outside<=KERB_WIDTH&&(p.branch!=null?branchKerbAt(data,p.branch,p.branchS,side):kerbSegment(data,p.i,side))?'kerb':'dirt';
}
// Once per frame for one car (main.js updateCar), from its four contact points:
//  kerbRide 0..1  how hard it rides the ridges (two wheels at 70 km/h or more = 1), for the camera's
//                 vibration; kerbTilt -1..1 the side lifted by the kerb's crown (+ left);
//  kerbPan        where the rumble is heard (- left); kerbHz the ridge rate under the tyres;
//  kerbDirt       share of wheels on grass or run-off; kerbCentre the body's own sample on a kerb.
// dt>=1 (a reset or a reposition) starts from rest; dt 0 (paused) keeps everything.
export function rideKerbs(car,dt){
 if(car.kerbRide===undefined)Object.assign(car,{kerbRide:0,kerbTilt:0,kerbPan:0,kerbHz:0,kerbDirt:0,kerbCentre:false,kerbWheels:0});
 if(!car.data||dt<=0)return car;
 const speed=Math.hypot(car.vx,car.vy),c=Math.cos(car.heading),s=Math.sin(car.heading);
 let kerb=0,left=0,dirt=0;
 SUSPENSION_WHEELS.forEach((w,k)=>{
  // A wheel in the air feels nothing.
  if(car.wheelLoad&&!(car.wheelLoad[k]>0))return;
  const kind=surfaceKind(car.data,car.sample(car.x+c*w.x-s*w.y,car.y+s*w.x+c*w.y,car.index));
  if(kind==='kerb'){kerb++;if(w.y>0)left++;}else if(kind==='dirt')dirt++;
 });
 const ride=Math.min(1,kerb/2)*clamp((speed-1)/18,0,1),tilt=(left-(kerb-left))/2;
 if(dt>=1){car.kerbRide=0;car.kerbTilt=tilt;}
 else{
  // The ridges bite at once and die away a little slower, so a quick kerb hop still reads.
  car.kerbRide+=(ride-car.kerbRide)*(1-Math.exp(-dt*(ride>car.kerbRide?16:7)));
  car.kerbTilt+=(tilt-car.kerbTilt)*(1-Math.exp(-dt*12));
 }
 car.kerbPan=kerb?clamp(((kerb-left)-left)/kerb,-1,1)*.75:car.kerbPan;car.kerbHz=speed/RIDGE_SPACING;car.kerbDirt=dirt/4;car.kerbWheels=kerb;
 car.kerbCentre=!!car.surface&&surfaceKind(car.data,car.surface)==='kerb';
 return car;
}
// The rumble loop's settings for sound-effects.js (null: nothing to hear). The ridge rate goes up to
// a growl; the dirt share lets the gravel loop play only for wheels really off the kerb.
export function kerbSound(car){
 if(car.kerbRide===undefined)return null;
 return {level:car.kerbRide,pan:car.kerbPan,hz:clamp(car.kerbHz,22,150),dirt:car.kerbDirt,centre:car.kerbCentre};
}
