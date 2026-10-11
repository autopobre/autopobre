// Modelo de jogo: corpo rigido sobre quatro suspensoes que leem o relevo medido,
// pneus por eixo com limite de atrito e contato da carroceria com o chao.
// Nao e simulacao homologada de pneus/suspensao do Old Stock.
import {GRID_START_BACK} from './race-roster.js';
import {pitLane,pitGeometry,locatePit,pitLimit,wallContact} from './pit-lane.js';
import {cliffEdge} from './cliff-edge.js';
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const MAX_STEER=.72;
export const WHEELBASE=2.667;
// Dry grass grips less than asphalt but is far from ice.
const G=9.81,ROAD_GRIP=1.24,GRASS_GRIP=.78,GRASS_ROLLING=.7;
// Pit lane speed limit tolerance, as in racing: 2 km/h over.
const PIT_TOLERANCE=2/3.6;
// Road-wheel lock follows the grip limit: full input reaches the limit at any
// speed and partial input turns proportionally, instead of saturating above ~70 km/h.
// grip: the car's tyres against the Opala's (its mechanics' grip).
export function steerLimit(speed,grip=1){
 const kinematic=MAX_STEER/(1+speed/28),v2=speed*speed;
 return v2<1?kinematic:Math.min(kinematic,Math.atan(WHEELBASE*ROAD_GRIP*grip*G*.94/v2)*1.3);
}
// Old Stock Opala 4.1 six, prepared: gameplay estimate, not a dyno sheet.
// Engine rpm per km/h in each gear (final drive included); 5th tops out near 218 km/h.
export const GEAR_RPM_PER_KMH=[0,110,72,52,40,32.2];
export const IDLE_RPM=950,REDLINE_RPM=7000;
const TORQUE_CURVE=[[0,190],[1000,215],[2500,300],[4000,360],[5000,352],[5500,338],[6500,280],[7000,240],[7400,0]];
export const SHIFT_UP_RPM=6650,SHIFT_DOWN_RPM=3100;
const SHIFT_TIME=.16;
// Newton-metres at the crank to m/s2 at the car: gear ratio, 90% driveline, 0.316 m tyre, 1250 kg.
const TORQUE_TO_ACCEL=.1191*.9/.316/1250;
// Opala CdA of about 0.9 m2 at sea-level air density, over 1250 kg.
const AERO_DRAG=.5*1.2*.9/1250;
// A car's mechanics (its body's, OPALA_BODY or FUSCA_BODY): engine, gearbox, drag and tyres. The Opala's are the
// numbers above, as every car always had them. The rigid body (mass and inertia for contacts, suspension, wheel
// places, centre of mass) stays the Opala's for both; the Fusca's lightness is in its numbers per kilogram.
// gears: engine rpm per km/h (1st to 5th); torque: [rpm, N m] at the crank; torqueToAccel: N m times rpm/(km/h)
// to m/s2 (driveline 90%, over the car's mass: the tyre's size cancels out); drag: CdA times half the air's
// density, over the mass; grip: the tyres against the Opala's (road grip, the steering's limit, the AI's corners
// and brakes); rearGrip: the rear axle's extra margin; rearShare: the rear axle's share of the weight, for
// traction; powerSlide: how much of the rear's side grip the throttle takes on a corner's exit; tyre: the tyre's
// radius (the wheels' spin).
export const OPALA_MECHANICS=Object.freeze({name:'opala',gears:GEAR_RPM_PER_KMH,torque:TORQUE_CURVE,torqueToAccel:TORQUE_TO_ACCEL,drag:AERO_DRAG,grip:1,rearGrip:1,rearShare:.47,powerSlide:.3,tyre:.31595});
// A Copa Fusca's (the pilots: better than the Opalas in the corners, worse on the straights, about 170 km/h at
// most and 2:10 a lap at Interlagos, no spins on the throttle): a prepared 1600 air-cooled flat four of about
// 93 hp (69 kW at 6200 rpm), 820 kg with its driver, a Fusca's CdA (0.9 m2 with the engine lid open): 167 km/h
// alone, the limiter at 172 km/h in a tow; stickier tyres for its weight, the engine's weight on the driven rear
// wheels and a calmer tail under power. Gameplay estimates, not a dyno sheet (testar_mecanica_fusca.mjs).
const FUSCA_MASS=820;
export const FUSCA_MECHANICS=Object.freeze({name:'fusca',gears:Object.freeze([0,118,82,62,49,40.8]),
 torque:Object.freeze([[0,80],[1000,89],[2500,105],[4000,117],[4500,120],[5500,116],[6200,107],[7000,89],[7400,0]]),
 torqueToAccel:.9/2.6526/FUSCA_MASS,drag:.5*1.2*.9/FUSCA_MASS,grip:1.05,rearGrip:1.04,rearShare:.58,powerSlide:.1,tyre:.27});
// --- Rigid body. The origin is the centre of mass, 0.52 m above the ground,
// 1.55 m behind the front axle and 1.117 m ahead of the rear axle.
export const CG_HEIGHT=.52;
const MASS=1250,REAR_AXLE=1.117,FRONT_AXLE=WHEELBASE-REAR_AXLE,HALF_TRACK=.804;
// Yaw inertia m*a*b makes each axle the other's centre of percussion, so the
// front and rear tyre constraints can be solved independently.
const YAW_INERTIA=MASS*FRONT_AXLE*REAR_AXLE,PITCH_INERTIA=2350,ROLL_INERTIA=540;
const FRONT_WEIGHT=REAR_AXLE/WHEELBASE,REAR_WEIGHT=FRONT_AXLE/WHEELBASE;
// Suspension: 7 cm static sag (about 1.9 Hz in heave), 9 cm more to the bump stops.
const SAG=.07,BUMP_TRAVEL=.09,DROOP=.11,ANTI_ROLL=26000,BUMP_STIFFNESS=320000,BUMP_DAMPING=9000,IMPACT_SCRUB=.6,TYRE_RELAXATION=.08;
// Physics frame: +x forward, +y left. Order matches SkidMarks: FL, FR, RL, RR.
export const SUSPENSION_WHEELS=Object.freeze([[FRONT_AXLE,HALF_TRACK],[FRONT_AXLE,-HALF_TRACK],[-REAR_AXLE,HALF_TRACK],[-REAR_AXLE,-HALF_TRACK]].map(([x,y])=>{
 const load=MASS*G*(x>0?FRONT_WEIGHT:REAR_WEIGHT)/2,stiffness=load/SAG;
 return Object.freeze({x,y,front:x>0,load,stiffness,damping:.85*Math.sqrt(stiffness*load/G)});
}));
// Body shell measured on the Opala model, relative to the centre of mass. The
// first nine can meet the ground in ordinary driving: the lowest points of the
// front and rear overhangs (about 19 and 15 degrees of approach and departure),
// the sills and the floor, whose lowest point is the exhaust. Nose, tail,
// shoulders, beltline and roof touch only when the car is upset.
export const HULL=[[2.25,.75,-.28],[2.25,-.75,-.28],[-2.05,.8,-.27],[-2.05,-.8,-.27],[.2,.93,-.34],[.2,-.93,-.34],[1,0,-.36],[0,0,-.36],[-1.4,0,-.41],
 [2.42,.7,0],[2.42,-.7,0],[-2.35,.8,-.1],[-2.35,-.8,-.1],[2.3,.85,.28],[2.3,-.85,.28],[-2.3,.85,.28],[-2.3,-.85,.28],[.2,.95,.4],[.2,-.95,.4],[.35,.66,.86],[.35,-.66,.86],[-1.05,.66,.86],[-1.05,-.66,.86]];
// The Fusca's shell (fusca.js, modelo_3d/fusca_v2: a race Fusca, its body 19 cm lower than the street car's, no
// bumpers nor running boards), measured on its game model as HULL on the Opala's, in the same order: the low nine
// (the aprons' corners front and rear, the sills, the floor and the exhaust's tips, 7 to 13 cm off the ground),
// then the nose and the tail, the fenders' tops by the lamps, the beltline, the roof's edges and the top of its dome.
export const FUSCA_HULL=[[1.95,.45,-.41],[1.95,-.45,-.41],[-1.67,.45,-.39],[-1.67,-.45,-.39],[.1,.65,-.45],[.1,-.65,-.45],[1,0,-.45],[0,0,-.45],[-1.74,0,-.43],
 [2,.3,-.24],[2,-.3,-.24],[-1.72,.4,-.29],[-1.72,-.4,-.29],[1.85,.55,.045],[1.85,-.55,.045],[-1.5,.58,-.045],[-1.5,-.58,-.045],[.2,.65,.19],[.2,-.65,.19],[.45,.5,.66],[.45,-.5,.66],[-.75,.5,.655],[-.75,-.5,.655],[-.1,0,.825]];
// The body a car meets the world with, and its mechanics (OPALA_MECHANICS, FUSCA_MECHANICS). Its plan, round the centre of mass: halfLength, halfWidth and `ahead` (the plan's centre ahead of the
// centre of mass) between cars (race-field.js); the same box with `wallAhead` against the guardrails and the
// pit walls; front, rear and halfWidth against tree trunks and people. Its shell (hull) meets the ground and
// the water. The Opala's numbers are the ones its contacts always used: between cars the box sat 8 cm ahead,
// against the walls round the centre of mass, and trunks and people met its measured ends. The Fusca's plan
// runs from the foot of its open engine lid to the nose (-1.793 to 2.021 m; it races without bumpers) and across its
// fenders (0.77 m).
export const OPALA_BODY=Object.freeze({name:'opala',halfLength:2.38,halfWidth:.93,ahead:.08,wallAhead:0,front:2.42,rear:2.35,hull:HULL,mechanics:OPALA_MECHANICS});
export const FUSCA_BODY=Object.freeze({name:'fusca',halfLength:1.907,halfWidth:.77,ahead:.114,wallAhead:.114,front:2.021,rear:1.793,hull:FUSCA_HULL,mechanics:FUSCA_MECHANICS});
// The underbody skids over grass and soil; bodywork and roof scrape harder.
const LOW_HULL=9,UNDERBODY_FRICTION=.3,HULL_FRICTION=.5;
// Handling balance: the front reaches the limit first; the rear keeps a reserve
// until braking, power, the handbrake or a slide takes it away.
// Off the asphalt the rear keeps a wider margin, so grass pushes wide instead of spinning.
const FRONT_BALANCE=.96,REAR_BALANCE=1.07,LOOSE_REAR_BALANCE=1.18,BRAKE_FRONT=.62;
// Rear slide angle widens the usable lock for counter-steer, and castor pulls the wheels toward it.
const COUNTER_RANGE=.9,CASTER_ALIGN=.3;
// Marshals turn an overturned car back onto its wheels after it comes to rest.
export const RIGHTING_DELAY=3;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
// Past the peak slip angle a tyre slides and grips less: what turns a drift into a spin.
const slideGrip=(slip,along,drop)=>1-drop*smooth((Math.atan2(Math.abs(slip),Math.max(Math.abs(along),2))-.1)/.35);
// Soil piles up against a tyre sliding sideways across it: a moderate slide
// ploughs to a stop sooner, and a fast one can trip the car over.
const trip=slip=>1+.3*smooth((Math.abs(slip)-2)/6)+1.15*smooth((Math.abs(slip)-10)/12);
export function engineTorque(rpm,curve=TORQUE_CURVE){
 for(let i=1;i<curve.length;i++)if(rpm<=curve[i][0]){const [r0,t0]=curve[i-1],[r1,t1]=curve[i];return t0+(t1-t0)*(rpm-r0)/(r1-r0);}
 return 0;
}
export const GUARDRAIL_CLEARANCE=5;
// Game-art selection from the GeoSampa overview, not a surveyed barrier inventory.
// Open the run-offs and infield; retain selected straight and boundary sections.
// On the left, the pit wall takes over from the pit entry after the Cafe
// until the pit exit rejoins on the back straight.
const INTERLAGOS_RAILS={
 '-1':[[0,160],[700,1300],[1780,1980],[2260,2420],[2610,2780],[3310,Infinity]],
 '1':[[885,1200],[1950,2180],[3490,3900]]
};
const FULL_RAIL=[[0,Infinity]];
// Circuits built from open data carry their own sections (meta.rails, by side).
export function guardrailSections(data,side){const key=side<0?'-1':'1';return data.meta.rails?.[key]??(data.meta.id==='curvelo'?FULL_RAIL:INTERLAGOS_RAILS[key]);}
export function guardrailPresent(data,s,side){const L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L;return guardrailSections(data,side).some(([from,to])=>t>=from&&t<=to);}
// A street circuit (Floripa) gives each station its own gap from the asphalt to the face of its concrete walls
// (columns wall_right_m, wall_left_m): a few decimetres on the bridges, a sidewalk's width in the city.
const wallColumns=new WeakMap();
function wallGap(data,s,side){
 if(!wallColumns.has(data))wallColumns.set(data,data.columns?.includes('wall_right_m')?{r:data.columns.indexOf('wall_right_m'),l:data.columns.indexOf('wall_left_m')}:null);
 const cols=wallColumns.get(data);if(!cols)return null;
 const a=data.samples,L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L,k=side<0?cols.r:cols.l;let lo=0,hi=a.length-1;
 while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=t)lo=m;else hi=m-1;}
 const p=a[lo],q=a[(lo+1)%a.length],span=(lo===a.length-1?L:q[0])-p[0],u=span>0?clamp((t-p[0])/span,0,1):0;
 return p[k]+(q[k]-p[k])*u;
}
// Stretches over a structure (meta.decks, [from, to] by lap distance, a bridge across the sea): the road plane
// reaches out to the walls there, it never blends down into the terrain grid far below.
export function onDeck(data,s){const d=data.meta.decks;if(!d)return false;const L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L;return d.some(([from,to])=>from<=to?t>=from&&t<=to:t>=from||t<=to);}
// Stretches below the ground around them (meta.tunnels, [from, to] by lap distance like the decks: a trench and the
// covered tunnel under a plaza). The terrain grid is cut down to the road only in a narrow corridor over it, so there
// too the road plane reaches out to the walls instead of blending up into the plaza beside them.
export function inTunnel(data,s){const d=data.meta.tunnels;if(!d)return false;const L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L;return d.some(([from,to])=>from<=to?t>=from&&t<=to:t>=from||t<=to);}
// Where the lap passes over itself (a viaduct over a street) two cars can be at one spot in plan on two roads.
// Same level: the ground under the other car (on its own stretch) against this car's road at that spot, sampled from
// this car's own stretch (its window never reaches the other level). A car up the road ahead, over a crest or round
// a kink of a steep street, is on the same road and the two agree to the centimetre; a car on the street under a
// viaduct is LEVEL_GAP and more off the deck's road. (Not the plane under this car: Floripa's streets bend 5 m away
// from it within 40 m.) For a short look ahead (a few dozen metres): the cheap checks come first.
export const LEVEL_GAP=2.5;
export function sameLevel(c,o){return Math.abs(c.sample(o.x,o.y).z-o.surface.z)<LEVEL_GAP;}
// The level choice in TestCar.nearest: stretches whose asphalt comes within LEVEL_REACH of the point compete; one
// whose road is more than LEVEL_SPLIT above or below another is on another level.
const LEVEL_REACH=8,LEVEL_SPLIT=3;
export function guardrailClearance(data,s,side){
 if(data.meta.id!=='curvelo'){
  const L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L,section=guardrailSections(data,side).find(([from,to])=>t>=from&&t<=to),gap=wallGap(data,t,side),base=gap??GUARDRAIL_CLEARANCE;
  if(!section)return base;
  // Flare exposed ends away from the driving line; the timing-line seam stays joined.
  const edge=Math.min(section[0]<=0?Infinity:t-section[0],section[1]>=L-1e-6?Infinity:section[1]-t),u=clamp(edge/24,0,1);
  return base+5*(1-u*u*(3-2*u));
 }
 if(side>=0){const lane=pitLane(data,s);return lane?Math.max(5,lane.offset*1.8+lane.halfWidth+2-7):5;}
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 return 5+30*smooth((s-770)/100)*(1-smooth((s-1110)/95));
}
// Body axes in the world (x, y horizontal, z up) for a heading, pitch and roll:
// forward, left, up, and the pitch axis.
function bodyAxes(heading,pitch,roll,axes){
 const {f,l,u,j}=axes,ch=Math.cos(heading),sh=Math.sin(heading),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
 f[0]=ch*cp;f[1]=sh*cp;f[2]=-sp;
 l[0]=ch*sr*sp-sh*cr;l[1]=sh*sr*sp+ch*cr;l[2]=sr*cp;
 u[0]=ch*cr*sp+sh*sr;u[1]=sh*cr*sp-ch*sr;u[2]=cr*cp;
 j[0]=-sh;j[1]=ch;j[2]=0;
 return axes;
}
const renderAxes={f:[1,0,0],l:[0,1,0],u:[0,0,1],j:[0,1,0]};
export class TestCar {
 constructor(data){this.data=data;this.a=data.samples;this.n=this.a.length;this.pitGeo=pitGeometry(data);this.cliff=cliffEdge(data);this.decks=!!data.meta?.decks?.length;this.tunnels=!!data.meta?.tunnels?.length;this.edgeHit={};this.axes={f:[1,0,0],l:[0,1,0],u:[0,0,1],j:[0,1,0]};this.body=OPALA_BODY;this.weatherGrip=1;this.reset();}
 // The body it meets the world with (OPALA_BODY, FUSCA_BODY), with its mechanics; the next reset or settle seats
 // it on its own shell.
 setBody(body){if(body!==this.body){this.body=body;this.shell=null;}return this;}
 get mechanics(){return this.body.mechanics??OPALA_MECHANICS;}
 // The grid spot: back metres before the line, lane metres across (race-roster.js playerGridSlot).
 resetGrid({back=GRID_START_BACK,lane=0}={}){const target=this.data.meta.reconstructed_xy_m-back;this.reset(Math.max(0,this.a.findIndex(p=>p[0]>=target)));if(lane){this.x+=this.surface.lx*lane;this.y+=this.surface.ly*lane;this.settle();}this.awaitingStart=true;}
 reset(index=0){this.awaitingStart=false;this.distance=0;this.clock=0;this.lapStart=0;this.laps=0;this.best=null;this.lastLap=null;this.checkpoints=new Set();this.nextCheckpoint=1;this.lapValid=true;this.lastLapValid=null;this.excursion=null;this.lineBack=false;this.spin=0;this.rearSpin=0;this.shifts=0;this.rightings=0;this.rightedAt=null;this.invalidReason=null;this.lastInvalidReason=null;this.pitPenalty=null;this.beforeCross=null;this.lapFell=false;this.lastLapFell=false;this.fall=null;this.falls=0;this.backAt=null;this.recover(index);}
 // Put the car back at rest on the centre line, keeping its clock, laps and race progress.
 recover(index=this.index){const p=this.a[index%this.n];this.x=p[1];this.y=p[2];this.heading=Math.atan2(p[8],p[7]);this.vx=0;this.vy=0;this.yaw=0;this.steer=0;this.index=index;this.burnout=0;this.rearSlipSpeed=0;this.rearWheelSpeed=undefined;this.steerInput=0;this.steerVisual=0;this.gear=1;this.manualGear=false;this.rpm=IDLE_RPM;this.shiftTimer=0;this.longAccel=0;this.latAccel=0;this.crashImpactSpeed=0;this.settle();}
 // Seat the body on its wheels at the current position and heading: level with
 // the ground under the four tyres, and clear of any bank under the body.
 settle(){
  const p=this.sample(this.x,this.y),c=Math.cos(this.heading),s=Math.sin(this.heading),gx=p.gx??0,gy=p.gy??0;
  this.surface=p;if(Number.isInteger(p.i))this.index=p.i;
  const at=(fx,ly)=>this.sample(this.x+c*fx-s*ly,this.y+s*fx+c*ly,this.index).z;
  const fl=at(FRONT_AXLE,HALF_TRACK),fr=at(FRONT_AXLE,-HALF_TRACK),rl=at(-REAR_AXLE,HALF_TRACK),rr=at(-REAR_AXLE,-HALF_TRACK);
  const along=(fl+fr-rl-rr)/(2*WHEELBASE),across=(fl+rl-fr-rr)/(4*HALF_TRACK);
  this.pitch=-Math.atan(along);this.roll=Math.atan(across);
  this.z=(fl+fr+rl+rr)/4-along*(FRONT_AXLE-REAR_AXLE)/2+CG_HEIGHT*Math.sqrt(1+along*along+across*across);
  const {f,l,u}=this.updateAxes();let lift=0;
  for(const [px,py,pz] of [...SUSPENSION_WHEELS.map(w=>[w.x,w.y,-CG_HEIGHT]),...this.body.hull.slice(0,LOW_HULL)]){
   const rx=f[0]*px+l[0]*py+u[0]*pz,ry=f[1]*px+l[1]*py+u[1]*pz,rz=f[2]*px+l[2]*py+u[2]*pz;
   lift=Math.max(lift,this.sample(this.x+rx,this.y+ry,this.index).z-this.z-rz);
  }
  this.z+=lift;this.vz=this.vx*gx+this.vy*gy;this.pitchRate=this.rollRate=0;
  // No previous strut length: the first step starts without a damper kick.
  this.extension=[NaN,NaN,NaN,NaN];this.wheelLoad=SUSPENSION_WHEELS.map(w=>w.load);this.wheelTravel=[0,0,0,0];
  this.frontLoad=this.rearLoad=1;this.gripFront=MASS*G*FRONT_WEIGHT;this.gripRear=MASS*G*REAR_WEIGHT;this.wheelsDown=4;this.airTime=0;this.hullContact=false;this.overturned=0;this.upright=Math.cos(this.pitch)*Math.cos(this.roll);
  this.stepX=this.x;this.stepY=this.y;
 }
 // z (a global search only, optional): the height the point is at. Where the lap passes over itself (a viaduct
 // over a street) the nearest stretch in plan can be the other level, and a car seated there drops or is launched
 // 6 m: see levelNearest. The window's own fall-back (a car placed more than 100 m from its stretch) takes the
 // car's height.
 nearest(x,y,global=false,hint=null,z=NaN){
  let best=Infinity,out;
  // Contact probes stay within a few metres of the car: a short window around it suffices.
  const count=global?this.n:hint===null?81:9,start=global?0:hint===null?this.index-40:hint-4;
  for(let k=0;k<count;k++){
   const i=(start+k+this.n)%this.n,a=this.a[i],b=this.a[(i+1)%this.n];
   const dx=b[1]-a[1],dy=b[2]-a[2],u=clamp(((x-a[1])*dx+(y-a[2])*dy)/(dx*dx+dy*dy),0,1);
   const ex=x-a[1]-u*dx,ey=y-a[2]-u*dy,d2=ex*ex+ey*ey;
   if(d2<best){best=d2;out={i,u,ex,ey};}
  }
  if(best>10000&&!global&&hint===null)return this.nearest(x,y,true,null,this.z);
  return global&&Number.isFinite(z)?this.levelNearest(x,y,z,out):out;
 }
 // The level at height z: among the stretches whose asphalt comes within LEVEL_REACH of (x, y), the road nearest z
 // picks the level, and on that level the nearest stretch in plan. A hard choice and not a weight on the height
 // (distance² + K·Δz²): a stale or meaningless z (a probe, a car moved without its height) never trades plan
 // distance for height on a hill, and the answer is out, the nearest in plan, whenever the stretches near the point
 // lie within LEVEL_SPLIT of one height (every single-level circuit) or the point is off every road.
 levelNearest(x,y,z,out){
  const a=this.a,n=this.n,o0=a[out.i],o1=a[(out.i+1)%n],near=[];
  if(Math.hypot(out.ex,out.ey)-(o0[4]+out.u*(o1[4]-o0[4]))/2>LEVEL_REACH)return out;
  for(let i=0;i<n;i++){
   const p=a[i],q=a[(i+1)%n],dx=q[1]-p[1],dy=q[2]-p[2],u=clamp(((x-p[1])*dx+(y-p[2])*dy)/(dx*dx+dy*dy),0,1);
   const ex=x-p[1]-u*dx,ey=y-p[2]-u*dy,d2=ex*ex+ey*ey,r=(p[4]+u*(q[4]-p[4]))/2+LEVEL_REACH;
   if(d2<=r*r)near.push({i,u,ex,ey,d2,z:p[3]+u*(q[3]-p[3])});
  }
  let level=null;for(const c of near)if(!level||Math.abs(c.z-z)<Math.abs(level.z-z))level=c;
  if(!level||Math.abs(level.z-(o0[3]+out.u*(o1[3]-o0[3])))<=LEVEL_SPLIT)return out;
  let pick=level;for(const c of near)if(Math.abs(c.z-level.z)<=LEVEL_SPLIT&&c.d2<pick.d2)pick=c;
  return {i:pick.i,u:pick.u,ex:pick.ex,ey:pick.ey};
 }
 // A car put down at (x, y) by a script, a menu or the network (a teleport): on the stretch at height z there
 // where the lap passes over itself (levelNearest), then seated on its wheels. Without z: the nearest in plan.
 relocate(x,y,z=NaN,heading=this.heading){this.x=x;this.y=y;this.heading=heading;this.index=this.nearest(x,y,true,null,z).i;this.settle();return this;}
 // ground: the heights to read (a plateau circuit's two copies, cliff-edge.js); the track file's grid by default.
 terrain(x,y,ground=this.data.terrain.z){const t=this.data.terrain,z=ground,fx=clamp((x-t.x0)/t.step,0,t.nx-1.001),fy=clamp((y-t.y0)/t.step,0,t.ny-1.001),ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,k=iy*t.nx+ix;
  return (z[k]*(1-u)+z[k+1]*u)*(1-v)+(z[k+t.nx]*(1-u)+z[k+t.nx+1]*u)*v;
 }
 sample(x,y,hint=null){
  // Fraction along the segment from the stations' normal lines (0 on a's, 1 on b's). The foot
  // of the perpendicular stalls on the inside of a bend and then jumps a whole station at the
  // next segment, so each station's rise came as a ledge under the wheels (0.37 m at ECPA's
  // tight Anel Externo corner). On a straight this is the same as the foot.
  const q=this.nearest(x,y,false,hint),a=this.a[q.i],b=this.a[(q.i+1)%this.n];
  const fa=(x-a[1])*a[7]+(y-a[2])*a[8],fb=(x-b[1])*b[7]+(y-b[2])*b[8],w=fa<=0?0:fb>=0?1:fa/(fa-fb),mix=k=>a[k]+(b[k]-a[k])*w;
  const tx=mix(7),ty=mix(8),lx=-ty,ly=tx,d=q.ex*lx+q.ey*ly,width=mix(4),L=this.data.meta.reconstructed_xy_m;
  let bank=mix(5),grade=mix(6),gx=tx*grade+lx*bank,gy=ty*grade+ly*bank,roadz=mix(3)+bank*d,outside=Math.abs(d)-width/2;
  let s=(a[0]+w*Math.hypot(b[1]-a[1],b[2]-a[2]))%L,pit=false,pitS=null,pitD=null;
  // Past a plateau circuit's rim (cliff-edge.js) the ground is the foot of the wall: no road blends into it.
  const edge=this.cliff?.query(x,y,this.edgeHit),abyss=!!edge&&(edge.d>0||!!this.fall&&edge.d>-12),ground=edge?(abyss?this.cliff.abyssZ:this.cliff.plateauZ):undefined;
  // The surveyed pit lane has its own profile; off both roads the nearer one blends into the terrain.
  const lane=this.pitGeo&&!abyss?locatePit(this.pitGeo,x,y):null;
  if(lane){
   // Where the lanes overlap (entry, final merge) the painted pit lane is the pit's;
   // both profiles are joined there, so the switch has no step.
   const out=Math.max(lane.lo-lane.d,lane.d-lane.hi),inLane=lane.d>=lane.laneLo&&lane.d<=lane.laneHi;
   if(out<outside&&outside>0||inLane){
    pit=out<=0;outside=out;bank=lane.bank;grade=lane.grade;roadz=lane.z+bank*lane.d;
    gx=lane.tx*grade+lane.lx*bank;gy=lane.ty*grade+lane.ly*bank;pitS=lane.s;pitD=lane.d;
    // Lap distance keeps counting along the track while the car runs through the pits.
    if(pit)s=lane.mainS;
   }
  }
  // On a bridge deck the road plane runs out to the parapet: the sea is 30 m below. In a tunnel or its trench it
  // runs out to the walls: the plaza beside them is 6 m above.
  const blend=abyss?1:this.decks&&onDeck(this.data,s)||this.tunnels&&inTunnel(this.data,s)?0:clamp(outside/3,0,1);
  // Off the asphalt the car sits on the LiDAR terrain, so it must also lean and roll with it.
  if(blend>0){const e=1.5,tx2=(this.terrain(x+e,y,ground)-this.terrain(x-e,y,ground))/(2*e),ty2=(this.terrain(x,y+e,ground)-this.terrain(x,y-e,ground))/(2*e);gx+=(tx2-gx)*blend;gy+=(ty2-gy)*blend;}
  const service=abyss?null:pitLane(this.data,s);
  if(service&&d>=service.offset-service.halfWidth&&d<=service.reach&&d>width/2){pit=true;bank=grade=gx=gy=0;}
  const z=service&&pit?3.055:roadz*(1-blend)+this.terrain(x,y,ground)*blend+.055;
  return {i:q.i,u:w,s:s>L-.01?0:s,d,z,width,bank,grade,gx,gy,tx,ty,lx,ly,pit,pitS,pitD,abyss,onRoad:!abyss&&(pit||Math.abs(d)<width/2)};
 }
 // Ground height and slope under one contact point near the car.
 ground(x,y){return this.sample(x,y,this.index);}
 updateAxes(){bodyAxes(this.heading,this.pitch,this.roll,this.axes);this.upright=this.axes.u[2];return this.axes;}
 // Rendering pose: the model origin sits on the ground below the centre of mass.
 // ahead is the time since the last fixed step. A frame falls between steps, and a car
 // drawn where the last step left it moves in uneven jumps (one step, then two), which a
 // fixed camera panning with it shows as shaking; the step's own velocities carry it on.
 pose(ahead=0){
  let {f,l,u}=this.updateAxes();
  if(ahead)({f,l,u}=bodyAxes(this.heading+this.yaw*ahead,this.pitch+this.pitchRate*ahead,this.roll+this.rollRate*ahead,renderAxes));
  const x=this.x+this.vx*ahead,y=this.y+this.vy*ahead,z=this.z+this.vz*ahead;
  return {x:x-u[0]*CG_HEIGHT,y:y-u[1]*CG_HEIGHT,z:z-u[2]*CG_HEIGHT,forward:[...f],left:[...l],up:[...u]};
 }
 // Velocity of a body point at offset r from the centre of mass.
 pointVelocity(r,out){
  const {f,j}=this.axes,wx=this.rollRate*f[0]+this.pitchRate*j[0],wy=this.rollRate*f[1]+this.pitchRate*j[1],wz=this.rollRate*f[2]+this.yaw;
  out[0]=this.vx+wy*r[2]-wz*r[1];out[1]=this.vy+wz*r[0]-wx*r[2];out[2]=this.vz+wx*r[1]-wy*r[0];return out;
 }
 // Impulse per unit mass (a velocity change) at offset r. Yaw is optional so the
 // axle solver, which already set yaw, can add only the roll and pitch it causes.
 impulse(r,px,py,pz,linear=true,yaw=true){
  if(linear){this.vx+=px;this.vy+=py;this.vz+=pz;}
  const {f,j}=this.axes,tx=r[1]*pz-r[2]*py,ty=r[2]*px-r[0]*pz,tz=r[0]*py-r[1]*px;
  if(yaw)this.yaw+=tz*MASS/YAW_INERTIA;
  this.pitchRate+=(tx*j[0]+ty*j[1])*MASS/PITCH_INERTIA;
  this.rollRate+=(tx*f[0]+ty*f[1]+tz*f[2])*MASS/ROLL_INERTIA;
 }
 // Inverse effective mass (relative to the car's mass) for an impulse along n at r.
 inverseMass(r,nx,ny,nz){
  const {f,j}=this.axes,tx=r[1]*nz-r[2]*ny,ty=r[2]*nx-r[0]*nz,tz=r[0]*ny-r[1]*nx,pitch=tx*j[0]+ty*j[1],roll=tx*f[0]+ty*f[1]+tz*f[2];
  return 1+MASS*(tz*tz/YAW_INERTIA+pitch*pitch/PITCH_INERTIA+roll*roll/ROLL_INERTIA);
 }
 step(input,dt){
  this.wallImpactSpeed=0;this.crashImpactSpeed=0;
  // Scripts and other systems may place the car directly: seat it on the ground there.
  if(!(Math.hypot(this.x-this.stepX,this.y-this.stepY)<.5))this.settle();
  // Going down a plateau's wall (cliff-fall.js), the car stays out of the rock: the face pushes it back out.
  if(this.fall&&this.cliff){const q=this.cliff.query(this.x,this.y,this.edgeHit);if(q.near&&q.d<.6){const push=.6-q.d,vn=this.vx*q.nx+this.vy*q.ny;this.x+=q.nx*push;this.y+=q.ny*push;this.stepX=this.x;this.stepY=this.y;if(vn<0){this.vx-=1.3*vn*q.nx;this.vy-=1.3*vn*q.ny;}}}
  const p=this.surface,oldX=this.x,oldY=this.y;
  const c=Math.cos(this.heading),s=Math.sin(this.heading),v=this.vx*c+this.vy*s,lat=-this.vx*s+this.vy*c,speed=Math.hypot(this.vx,this.vy);
  const condition=this.condition?.factors,grounded=this.wheelsDown>0,m=this.mechanics;
  const loose=!p.onRoad,mu=(p.onRoad?(input.handbrake?.99:ROAD_GRIP*m.grip):GRASS_GRIP)*(condition?.grip??1)*this.weatherGrip;
  // Smooth the driver's input, then scale it to the lock available at this speed. A racing wheel
  // (input.wheel) is already where the driver's hands put it: it turns the wheels at once.
  const command=clamp(input.left-input.right,-1,1),inputResponse=command*(this.steerInput??0)<0?20:12;
  this.steerInput=input.wheel?command:(this.steerInput??0)+(command-(this.steerInput??0))*(1-Math.exp(-dt*inputResponse));
  // With the tail out, steering against the slide gets extra lock up to the
  // slide angle, and castor already turns the wheels part of the way.
  const drift=v>3?Math.atan2(lat-REAR_AXLE*this.yaw,v):0,baseSteer=this.steerInput*steerLimit(speed,m.grip*this.weatherGrip)*(condition?.steering??1);
  const counterSteer=this.steerInput*drift>0?this.steerInput*Math.abs(drift)*COUNTER_RANGE:0;
  this.steer=clamp(baseSteer+counterSteer+drift*CASTER_ALIGN,-MAX_STEER,MAX_STEER);
  // Cockpit wheel keeps the familiar hand travel: road-wheel angle is small at speed.
  this.steerVisual=this.steerInput*MAX_STEER*(condition?.steering??1)/(1+speed/28)+this.steer-baseSteer;
  // Deliberate low-speed stunt assist: hold + throttle spins the driven rear
  // tyres; steering allows a tight powered circle. Ordinary driving is unchanged.
  // The player's own gear (Câmbio manual: -1 reverse, 0 neutral, 1-5); without it the gearbox is automatic.
  const manual=Number.isInteger(input.gear)&&input.gear>=-1&&input.gear<=5;this.manualGear=manual;
  const burning=!!(input.handbrake&&input.throttle&&!input.reverse&&!(manual&&input.gear<1)&&p.onRoad&&speed<12&&this.wheelsDown===4);
  this.burnout=(this.burnout??0)+((burning?input.throttle:0)-(this.burnout??0))*(1-Math.exp(-dt*(burning?3:input.throttle?2:7)));
  const turn=clamp(this.steerInput/(1+speed/28),-1,1);
  // --- Engine and five-speed gearbox (automatic, or the player's), with a short torque cut per shift.
  // Q (input.reverse) backs up in either; a manual gear is engaged as soon as it is asked for (an H
  // lever thrown too low over-revs: the engine brakes hard but takes no harm).
  const kmh=Math.abs(v)*3.6,power=(this.engineScale??1)*(condition?.power??1);
  this.shiftTimer=Math.max(0,(this.shiftTimer??0)-dt);
  if(input.reverse)this.gear=-1;
  else if(manual){
   if(input.gear!==this.gear){if(this.gear>0&&input.gear>0)this.shiftTimer=SHIFT_TIME*(input.gear>this.gear?1:.6);this.gear=input.gear;this.shifts=(this.shifts??0)+1;}
  }
  else{
   if(!(this.gear>0))this.gear=1;
   if(this.shiftTimer===0){
    if(this.gear<5&&kmh*m.gears[this.gear]>SHIFT_UP_RPM){this.gear++;this.shiftTimer=SHIFT_TIME;this.shifts=(this.shifts??0)+1;}
    else if(this.gear>1&&kmh*m.gears[this.gear]<SHIFT_DOWN_RPM+(input.brake>.3?700:0)&&kmh*m.gears[this.gear-1]<SHIFT_UP_RPM-400){this.gear--;this.shiftTimer=SHIFT_TIME*.6;this.shifts=(this.shifts??0)+1;}
   }
  }
  const ratio=m.gears[Math.max(1,this.gear)],wheelRpm=kmh*ratio;
  // The clutch slips at launch, so the engine can sit in its torque band from rest.
  const engineRpm=Math.max(wheelRpm,this.gear===1?IDLE_RPM+input.throttle*2600:IDLE_RPM);
  // A wheel's clutch pedal (manual only): the drive fades out from a quarter of its travel to 85%;
  // neutral drives nothing. The automatic is always engaged.
  const engaged=!manual||input.reverse?1:this.gear===0?0:clamp((.85-(input.clutch||0))/.6,0,1);
  let drive=0;
  if(this.gear>0){
   drive=input.throttle*engineTorque(Math.min(engineRpm,REDLINE_RPM),m.torque)*ratio*m.torqueToAccel*power;
   if(wheelRpm>=REDLINE_RPM)drive=0;
   if(this.shiftTimer>0)drive*=.12;
   drive*=engaged;
  }
  // Pit lane: no limiter. Beyond the painted limit the driver answers for it:
  // speeding there costs the lap, like cutting the track.
  const limit=pitLimit(this.pitGeo,p);this.limiter=limit!==null;
  if(limit!==null&&speed>limit+PIT_TOLERANCE){if(this.lapValid)this.pitPenalty={kmh:speed*3.6,clock:this.clock};this.lapValid=false;this.invalidReason='pit';}
  // Reverse: Q backs up at once, the brake held at rest (brake-reverse.js) as far as it is pressed; the
  // manual's R gear backs up with the throttle.
  const back=input.reverse?Math.min(1,input.reverse):manual&&this.gear<0?input.throttle*engaged:0;
  if(back)drive-=3*back*(condition?.power??1);
  // Rear-wheel drive: acceleration moves load onto the rear axle, and a
  // traction limiter keeps the driven tyres just past the peak of grip.
  // Unloaded rear tyres (a crest, a jump) have nothing to push against; climbing
  // a slope loads them and they push harder. The squat under power is in rearShare.
  const rearGrip=clamp(this.rearLoad/(1+.034*Math.max(0,drive)),0,1.35),rearShare=m.rearShare+clamp(drive,0,8)*.5/(G*WHEELBASE),traction=mu*G*rearShare*1.04*rearGrip;
  let wheelspin=0;
  // Loose ground still takes some push from spinning tyres.
  if(!burning&&drive>traction){wheelspin=drive-traction;drive=traction+(p.onRoad?0:wheelspin*.55*rearGrip);}
  this.rearSlipSpeed=Math.max(this.burnout*20,p.onRoad&&speed<30&&grounded?clamp(wheelspin*1.4,0,7):0,grounded?0:input.throttle*(this.gear>0)*engaged*9);
  this.rpm=this.gear<0?IDLE_RPM+Math.abs(v)*3.6*110+back*400:clamp(engineRpm+this.rearSlipSpeed*3.6*ratio*.6+(burning?input.throttle*3500:0),IDLE_RPM,REDLINE_RPM+80);
  // Declutched or in neutral the engine revs free, up to its limiter.
  if(engaged<1)this.rpm=this.rpm*engaged+(IDLE_RPM+input.throttle*(REDLINE_RPM-IDLE_RPM))*(1-engaged);
  // --- Longitudinal forces.
  // Turf rolls harder than asphalt; beyond that, grip, bumps and slopes slow a car on grass.
  const rolling=p.onRoad?.16:GRASS_ROLLING;
  const engineBrake=this.gear>0&&input.throttle<.05&&this.shiftTimer===0&&Math.abs(v)>1?(.18+.5*clamp(wheelRpm/REDLINE_RPM,0,1))*engaged:0;
  // Brakes cannot exceed the tyres: on grass the car simply cannot stop as hard.
  const brakeDecel=Math.min(Math.max(input.brake*11*(condition?.brakes??1),input.handbrake&&!burning?7:0),mu*G*1.02);
  // --- Combined grip: longitudinal work leaves less of each axle's tyres for
  // cornering. Front-biased brakes make hard braking in a turn push wide, not spin.
  const braking=Math.abs(v)>2&&!(input.handbrake&&!input.brake)?brakeDecel:0;
  const frontUse=clamp(braking*BRAKE_FRONT/(mu*G*FRONT_WEIGHT*1.5),0,.9),rearUse=clamp((braking*(1-BRAKE_FRONT)+Math.max(0,drive)*(loose?.35:.7))/(mu*G*REAR_WEIGHT*1.5),0,.9);
  // A rear axle busy putting power down lets the tail step out on corner
  // exit; spinning tyres, a locked handbrake or a tired rear suspension hold even less.
  // In soil a driven tyre digs its tread in and keeps most of its side bite.
  const powerSlide=p.onRoad&&!input.handbrake&&traction>0?clamp((drive/traction-.86)/.14,0,1)*clamp((speed-4)/6,0,1):0;
  const grip={front:mu*Math.sqrt(1-frontUse*frontUse)*FRONT_BALANCE,
   rear:mu*Math.sqrt(1-rearUse*rearUse)*(loose?LOOSE_REAR_BALANCE:REAR_BALANCE*m.rearGrip)*(input.handbrake&&!burning?.45:1)*(1-m.powerSlide*powerSlide)*(1-(loose?.15:.45)*clamp(wheelspin/4,0,1))*(.8+.2*(condition?.stability??1)),loose};
  if(burning){
   // The stunt assist steers the rotation directly, as a sliding pivot on the front tyres.
   const targetYaw=input.brake?0:turn*1.35*this.burnout;
   this.yaw+=(targetYaw-this.yaw)*(1-Math.exp(-dt*6));
  }
  // --- Rigid-body integration: finer sub-steps while the body is upset or airborne.
  const wild=this.wheelsDown<4||this.hullContact||this.upright<.9,count=dt>0?Math.max(1,Math.ceil(dt*(wild?360:120)-1e-6)):0,h=dt/count;
  // Slipstream: RaceField sets car.draft (0-0.5) for one step when this car runs in a wake.
  const forces={dt,drive,rolling,engineBrake,brakeDecel,burning,grip,drag:m.drag*(1-clamp(this.draft||0,0,.5)),
   // Bracing at rest, then a tight powered circle that fits the asphalt width.
   crawl:input.brake?0:Math.abs(turn)*2*this.burnout,swing:!input.brake,braced:Math.abs(turn)<.02&&speed<.8,
   hold:grounded&&speed<.3&&!!(input.brake||input.handbrake&&!burning)};
  this.longAccel=this.latAccel=0;this.draft=0;
  for(let k=0;k<count;k++)this.integrate(h,forces);
  // Forces felt by the chassis, for suspension and camera motion.
  if(count){this.longAccel/=dt;this.latAccel/=dt;}
  this.surface=this.sample(this.x,this.y);this.index=this.surface.i;
  // Visible sections and collision share the same openings and shoulder clearance.
  const r=this.surface,side=Math.sign(r.d),angle=wrap(this.heading-Math.atan2(r.ty,r.tx));
  // How far the body's plan reaches toward the rail beside the centre of mass (its box sits wallAhead forward).
  const b=this.body,extent=b.halfWidth*Math.abs(Math.cos(angle))+b.halfLength*Math.abs(Math.sin(angle))+side*b.wallAhead*Math.sin(angle);
  const wall=r.width/2+guardrailClearance(this.data,r.s,side)-.12-extent;
  const crossed=Math.abs(p.d)<=p.width/2+guardrailClearance(this.data,p.s,side)-.12-extent;
  if(guardrailPresent(this.data,r.s,side)&&Math.abs(r.d)>wall&&(crossed||Math.abs(r.d)<wall+5)){
   const correction=r.d-side*wall;this.x-=r.lx*correction;this.y-=r.ly*correction;
   const outward=(this.vx*r.lx+this.vy*r.ly)*side,tangent=this.vx*r.tx+this.vy*r.ty;
   if(outward>0){
    this.wallImpactSpeed=outward;
    const rebound=-outward*.22,slide=tangent*(1-Math.min(.18,outward*.006));
    this.vx=r.tx*slide+r.lx*side*rebound;this.vy=r.ty*slide+r.ly*side*rebound;
    this.yaw*=.65;
   }
   this.surface=this.sample(this.x,this.y);
  }
  // Pit wall, garage fronts and the walls along the pit exit.
  for(let pass=0;this.pitGeo&&pass<2;pass++){
   const hit=wallContact(this.pitGeo,this.x,this.y,this.heading,this.body);if(!hit)break;
   this.x+=hit.nx*hit.depth;this.y+=hit.ny*hit.depth;
   const into=-(this.vx*hit.nx+this.vy*hit.ny);
   if(into>0){
    this.wallImpactSpeed=Math.max(this.wallImpactSpeed,into);
    const keep=1-Math.min(.18,into*.006),tx=(this.vx+into*hit.nx)*keep,ty=(this.vy+into*hit.ny)*keep;
    this.vx=tx+hit.nx*into*.22;this.vy=ty+hit.ny*into*.22;this.yaw*=.65;
   }
   this.surface=this.sample(this.x,this.y);
  }
  // Tree trunks (tree-contact.js; main.js gives them to the player's car).
  if(this.posts){const hit=this.posts.collide(this);if(hit)this.wallImpactSpeed=Math.max(this.wallImpactSpeed,hit);}
  this.distance+=speed*dt;this.clock+=dt;this.spin+=v*dt/m.tyre;
  // The rear tyres' surface speed: none while the handbrake locks them (contact-shadows.js blurs the wheels by it).
  this.rearWheelSpeed=input.handbrake&&!burning?0:v+this.rearSlipSpeed;this.rearSpin=(this.rearSpin??0)+this.rearWheelSpeed*dt/m.tyre;
  // Upside down or on its side and at rest: after a pause the marshals right it.
  const resting=speed<1.5&&Math.abs(this.vz)<1.5&&Math.abs(this.yaw)+Math.abs(this.rollRate)+Math.abs(this.pitchRate)<1.2;
  if(this.upright<.45&&resting)this.overturned+=dt;else if(this.upright>.8)this.overturned=0;
  if(this.overturned>RIGHTING_DELAY){this.vx=this.vy=this.yaw=0;this.settle();this.rightings++;this.rightedAt=this.clock;}
  this.stepX=this.x;this.stepY=this.y;
  this.trackLap(p,this.surface,Math.hypot(this.x-oldX,this.y-oldY),speed);
 }
 integrate(h,f){
  const {f:F,l:L,u:U}=this.updateAxes(),ch=Math.cos(this.heading),sh=Math.sin(this.heading);
  // --- Suspension: each wheel reads the ground under its own contact patch.
  const loads=this.wheelLoad,patches=this.patches??=SUSPENSION_WHEELS.map(()=>[0,0,0]),normals=this.normals??=SUSPENSION_WHEELS.map(()=>[0,0,1]),scrub=this.scrub??=[0,0,0,0];
  for(let i=0;i<4;i++){
   const w=SUSPENSION_WHEELS[i],r=patches[i],n=normals[i];
   r[0]=F[0]*w.x+L[0]*w.y-U[0]*CG_HEIGHT;r[1]=F[1]*w.x+L[1]*w.y-U[1]*CG_HEIGHT;r[2]=F[2]*w.x+L[2]*w.y-U[2]*CG_HEIGHT;
   const g=this.ground(this.x+r[0],this.y+r[1]),gx=g.gx??0,gy=g.gy??0,nz=1/Math.sqrt(1+gx*gx+gy*gy);
   n[0]=-gx*nz;n[1]=-gy*nz;n[2]=nz;
   // Strut length beyond its static position needed to reach the ground.
   const align=U[0]*n[0]+U[1]*n[1]+U[2]*n[2],extension=align>.3?(this.z+r[2]-g.z)*nz/align:Infinity;
   const previous=this.extension[i],rate=Number.isFinite(previous)&&Number.isFinite(extension)?(extension-previous)/h:0;
   this.extension[i]=extension;
   let force=0;scrub[i]=0;
   if(extension<SAG){
    force=w.stiffness*(SAG-extension)-w.damping*rate;
    // Bump stops: a hard landing bottoms the suspension out. Deeper than that
    // the wheel is buried in a bank or a step, and the body shell takes over.
    if(extension<-BUMP_TRAVEL){const bump=BUMP_STIFFNESS*Math.min(.12,-BUMP_TRAVEL-extension)-BUMP_DAMPING*Math.min(0,rate);force+=bump;scrub[i]=bump;this.crashImpactSpeed=Math.max(this.crashImpactSpeed,Math.min(25,-rate*.8));}
    force=Math.min(force,w.load*12);
    // Contact patch, where the strut meets the ground.
    r[0]-=U[0]*extension;r[1]-=U[1]*extension;r[2]-=U[2]*extension;
   }
   loads[i]=Math.max(0,force);
  }
  // Anti-roll bars share load across each axle while both of its tyres are down.
  for(const [a,b] of [[0,1],[2,3]])if(loads[a]>0&&loads[b]>0){const bar=ANTI_ROLL*(this.extension[b]-this.extension[a]);loads[a]=Math.max(0,loads[a]+bar);loads[b]=Math.max(0,loads[b]-bar);}
  let front=0,rear=0,down=0;
  for(let i=0;i<4;i++){
   const w=SUSPENSION_WHEELS[i],r=patches[i],n=normals[i],travel=loads[i]>0?clamp(-this.extension[i],-DROOP,BUMP_TRAVEL):-DROOP;
   this.wheelTravel[i]+=(travel-this.wheelTravel[i])*(1-Math.exp(-h*40));
   if(!(loads[i]>0))continue;
   down++;if(w.front)front+=loads[i];else rear+=loads[i];
   // The stunt assist holds its circle on the road's crossfall, as the tyres did before.
   const k=loads[i]/MASS*h,flat=f.burning?0:1;this.impulse(r,n[0]*k*flat,n[1]*k*flat,n[2]*k);
   // A wheel slammed into its bump stop by a bank or a hard landing scrubs speed:
   // tyre, suspension and soil soak up part of the hit, and the nose digs in.
   const speed=Math.hypot(this.vx,this.vy),loss=Math.min(IMPACT_SCRUB*scrub[i]/MASS*h,speed*.5);
   if(loss>0)this.impulse(r,-this.vx/speed*loss,-this.vy/speed*loss,0);
  }
  this.vz-=G*h;
  this.wheelsDown=down;this.airTime=down?0:this.airTime+h;
  this.frontLoad=front/(2*SUSPENSION_WHEELS[0].load);this.rearLoad=rear/(2*SUSPENSION_WHEELS[2].load);
  // Tyre capacity follows the suspension, with part of the pitch load transfer.
  const total=front+rear,support=Math.min(1,total/(MASS*G));
  let frontN=front,rearN=rear;
  if(front>0&&rear>0){frontN=total*FRONT_WEIGHT+.4*(front-total*FRONT_WEIGHT);rearN=total-frontN;}
  // A tyre needs some rolling to feel a load change: a quick bump no longer
  // robs it of grip for an instant, while a real jump still lets go.
  const relax=1-Math.exp(-h/TYRE_RELAXATION);this.gripFront+=(frontN-this.gripFront)*relax;this.gripRear+=(rearN-this.gripRear)*relax;
  frontN=this.gripFront;rearN=this.gripRear;
  const patch=(a,b,out)=>{const sum=loads[a]+loads[b];for(let k=0;k<3;k++)out[k]=sum>0?(patches[a][k]*loads[a]+patches[b][k]*loads[b])/sum:-U[k]*CG_HEIGHT;return out;};
  const frontPatch=patch(0,1,this.frontPatch??=[0,0,0]),rearPatch=patch(2,3,this.rearPatch??=[0,0,0]);
  // --- Longitudinal tyre forces at the contact patches: dive and squat.
  if(total>0){
   const u=this.vx*ch+this.vy*sh;
   const drag=Math.sign(u)*Math.min((f.rolling+f.engineBrake)*support,Math.abs(u)/h);
   const braking=f.brakeDecel*support*Math.min(1,Math.abs(u)/Math.max(f.dt*11,.001))*Math.sign(u);
   const along=((rear>0?f.drive:0)-drag-braking)*h;
   // In a burnout the spinning rear and the braked front cancel out: no squat.
   if(f.burning){this.vx+=along*ch;this.vy+=along*sh;}
   else this.impulse(rear>0&&f.drive>0?rearPatch:frontPatch,along*ch,along*sh,0,true,false);
   this.longAccel+=along;
  }
  {const u=this.vx*ch+this.vy*sh,drag=f.drag*u*Math.abs(u)*h;this.vx-=drag*ch;this.vy-=drag*sh;this.longAccel-=drag;}
  // --- Lateral tyre forces: each axle cancels its sideways slip up to its grip.
  // A saturated rear lets the front keep turning the car: oversteer, then a spin.
  if(!f.burning&&total>0){
   const u=this.vx*ch+this.vy*sh,w=-this.vx*sh+this.vy*ch,yaw=this.yaw,cd=Math.cos(this.steer),sd=Math.sin(this.steer);
   const sf=-u*sd+(w+FRONT_AXLE*yaw)*cd,sr=w-REAR_AXLE*yaw;
   // On asphalt a sliding tyre loses grip; on soil it ploughs in instead.
   const muF=f.grip.front*(f.grip.loose?trip(sf):slideGrip(sf,u*cd+(w+FRONT_AXLE*yaw)*sd,.15));
   const muR=f.grip.rear*(f.grip.loose?trip(sr):slideGrip(sr,u,.25));
   const capF=muF*frontN/MASS*h,capR=muR*rearN/MASS*h;
   const pf=clamp(-sf/(1+FRONT_AXLE/REAR_AXLE*cd*cd),-capF,capF),pr=clamp(-sr/(1+REAR_AXLE/FRONT_AXLE),-capR,capR);
   const du=-pf*sd,dw=pf*cd+pr;
   this.vx+=du*ch-dw*sh;this.vy+=du*sh+dw*ch;
   this.yaw+=(FRONT_AXLE*pf*cd-REAR_AXLE*pr)/(FRONT_AXLE*REAR_AXLE);
   // The same forces act at ground level, below the centre of mass: body roll, and trips.
   this.impulse(frontPatch,(-sd*ch-cd*sh)*pf,(-sd*sh+cd*ch)*pf,0,false,false);
   this.impulse(rearPatch,-sh*pr,ch*pr,0,false,false);
   this.longAccel+=du;this.latAccel+=dw;
  }
  if(f.burning){
   // Let the rear swing outward around the gripping front end.
   const side=f.swing?-this.yaw*1.1:0,blend=1-Math.exp(-h*8);
   this.vx+=(f.crawl*ch-side*sh-this.vx)*blend;this.vy+=(f.crawl*sh+side*ch-this.vy)*blend;
   if(f.braced)this.vx=this.vy=0;
  }
  if(f.hold)this.vx=this.vy=0;
  // --- Body shell against the ground: scraping, digging in and rolling over.
  this.contactShell(h,F,L,U);
  this.x+=this.vx*h;this.y+=this.vy*h;this.z+=this.vz*h;
  this.heading=wrap(this.heading+this.yaw*h);this.pitch=wrap(this.pitch+this.pitchRate*h);this.roll=wrap(this.roll+this.rollRate*h);
  // Structural and aerodynamic damping of pitch and roll.
  const damping=Math.exp(-h*.4);this.pitchRate*=damping;this.rollRate*=damping;
 }
 contactShell(h,F,L,U){
  const hull=this.body.hull,count=this.wheelsDown<4||U[2]<.9||this.hullContact?hull.length:LOW_HULL,contacts=this.shell??=hull.map(()=>({r:[0,0,0],n:[0,0,1],depth:0,normal:0,friction:0}));
  const v=[0,0,0];let any=false;
  for(let k=0;k<count;k++){
   const [px,py,pz]=hull[k],q=contacts[k],r=q.r;
   r[0]=F[0]*px+L[0]*py+U[0]*pz;r[1]=F[1]*px+L[1]*py+U[1]*pz;r[2]=F[2]*px+L[2]*py+U[2]*pz;
   const g=this.ground(this.x+r[0],this.y+r[1]),gx=g.gx??0,gy=g.gy??0,nz=1/Math.sqrt(1+gx*gx+gy*gy);
   q.n[0]=-gx*nz;q.n[1]=-gy*nz;q.n[2]=nz;q.depth=(g.z-this.z-r[2])*nz;q.normal=q.friction=0;
   if(q.depth>0){any=true;this.pointVelocity(r,v);q.approach=v[0]*q.n[0]+v[1]*q.n[1]+v[2]*q.n[2];this.crashImpactSpeed=Math.max(this.crashImpactSpeed,-q.approach);}
  }
  this.hullContact=any;if(!any)return;
  // Sequential impulses: inelastic contact with a little bounce, Coulomb friction.
  for(let iteration=0;iteration<4;iteration++)for(let k=0;k<count;k++){
   const q=contacts[k];if(q.depth<=0)continue;
   const {r,n}=q;this.pointVelocity(r,v);
   const vn=v[0]*n[0]+v[1]*n[1]+v[2]*n[2],target=Math.max(Math.min(2,Math.max(0,q.depth-.015)*20),q.approach<-3?-q.approach*.12:0);
   const total=Math.max(0,q.normal+(target-vn)/this.inverseMass(r,n[0],n[1],n[2])),normal=total-q.normal;q.normal=total;
   this.impulse(r,n[0]*normal,n[1]*normal,n[2]*normal);
   this.pointVelocity(r,v);
   const along=v[0]*n[0]+v[1]*n[1]+v[2]*n[2],tx=v[0]-along*n[0],ty=v[1]-along*n[1],tz=v[2]-along*n[2],slip=Math.hypot(tx,ty,tz);
   if(slip<1e-6)continue;
   const dx=tx/slip,dy=ty/slip,dz=tz/slip,friction=Math.min(slip/this.inverseMass(r,dx,dy,dz),Math.max(0,(k<LOW_HULL?UNDERBODY_FRICTION:HULL_FRICTION)*q.normal-q.friction));
   q.friction+=friction;this.impulse(r,-dx*friction,-dy*friction,-dz*friction);
  }
 }
 // speed: the car's speed over the ground. The line counts a car moving across it in the race
 // direction whichever way its nose points (sideways or backwards in a handbrake turn, as net-verify.js
 // has it on the host). Slipped back over it, the next time across is the same passage, not a new lap.
 trackLap(previous,current,distance,speed){
  const L=this.data.meta.reconstructed_xy_m;
  let advance=current.s-previous.s;if(advance<-L/2)advance+=L;if(advance>L/2)advance-=L;
  if(previous.s<16&&current.s>L-16&&advance<0)this.lineBack=true;
  let finish=previous.s>L-16&&current.s<16&&advance>0&&speed>1;
  if(finish&&this.lineBack){this.lineBack=false;finish=false;}
  if(this.awaitingStart){if(finish)this.crossLine();return;}
  const outside=p=>!p.pit&&Math.abs(p.d)>p.width/2+1;
  if(!this.excursion&&(outside(previous)||outside(current)))this.excursion={advance:0,distance:0};
  if(this.excursion){this.excursion.advance+=advance;this.excursion.distance+=distance;}
  // A runoff alone is allowed. Reject only a meaningful gain from cutting the route.
  if(this.excursion&&(!outside(current)||finish)){
   if(this.excursion.advance>40&&this.excursion.advance-this.excursion.distance>18){if(this.lapValid)this.invalidReason='cut';this.lapValid=false;}
   this.excursion=null;
  }
  const checkpoint=Math.floor(current.s/L*20);
  this.checkpoints.add(checkpoint);
  if(advance>0&&checkpoint===this.nextCheckpoint)this.nextCheckpoint++;
  if(finish)this.crossLine();
 }
 // Over the finish line: from the grid, the first lap begins; else a lap ends (valid with every
 // checkpoint passed and no cut) and the next begins. (syncLaps also crosses it for a car that crossed
 // it in the host's window while its pilot's line was down, and takes back one crossed only in this
 // window: uncrossLine.) The lap books as they stood before, with the clock then.
 crossLine(){
  this.beforeCross={...this.lapBooks(),at:this.clock};
  if(this.awaitingStart){this.awaitingStart=false;this.checkpoints=new Set([0]);this.nextCheckpoint=1;this.excursion=null;return;}
  this.lastLapValid=this.lapValid&&this.nextCheckpoint===20;
  this.lastLap=this.clock-this.lapStart;
  // A lap with a fall into the abyss (cliff-fall.js) counts in the race but never as the best lap.
  this.lastLapFell=!!this.lapFell;this.lapFell=false;
  if(this.lastLapValid){this.laps++;if(!this.lastLapFell&&(this.best===null||this.lastLap<this.best))this.best=this.lastLap;}
  this.lastInvalidReason=this.lastLapValid?null:this.invalidReason??'cut';
  this.lapStart=this.clock;this.lapValid=true;this.invalidReason=null;this.checkpoints=new Set([0]);this.nextCheckpoint=1;
 }
 // Everything crossLine changes: the laps that count, the lap under way and the one before, the best.
 lapBooks(){return {awaitingStart:this.awaitingStart,laps:this.laps,lapStart:this.lapStart,lapValid:this.lapValid,invalidReason:this.invalidReason,best:this.best,lastLap:this.lastLap,
  lastLapValid:this.lastLapValid,lastInvalidReason:this.lastInvalidReason,lapFell:this.lapFell,lastLapFell:this.lastLapFell,checkpoints:new Set(this.checkpoints),nextCheckpoint:this.nextCheckpoint,lineBack:!!this.lineBack};}
 // The last crossing taken back, as if the car had never reached the line: its lap goes on, timed
 // from where it began. Only one: false when there is none to take back.
 uncrossLine(){
  const b=this.beforeCross;if(!b)return false;this.beforeCross=null;
  const {at,...books}=b;Object.assign(this,books,{checkpoints:new Set(books.checkpoints)});return true;
 }
 // multiplayer.js, a guest back after its line dropped (since: this car's clock then): the laps
 // follow the host's count for this car (there: laps that count, -1 still short of the line from the
 // grid). A line crossed here since the drop is taken back first (the host's car may not have got
 // there); then a lap that counts there and not here is a line crossed only there (crossed here too:
 // the checkpoints on the way passed there), and one that counts here and not there, a crossing here
 // that never reached the host (taken back). Laps that count on both sides, never the distance
 // driven: an invalid lap adds none to the race distance a guest sends.
 syncLaps(there,since){
  if(this.beforeCross&&this.beforeCross.at>=since)this.uncrossLine();
  const here=()=>this.awaitingStart?-1:this.laps,counted=()=>!!this.beforeCross&&(this.beforeCross.awaitingStart||this.beforeCross.laps<this.laps);
  if(here()>there){if(counted())this.uncrossLine();if(here()>there)this.laps=Math.max(0,there);}
  else if(here()<there){if(!this.awaitingStart){this.nextCheckpoint=20;this.checkpoints=new Set(Array.from({length:20},(_,k)=>k));}this.crossLine();}
 }
 telemetry(){return {x:this.x,y:this.y,z:this.surface.z,speed:Math.hypot(this.vx,this.vy)*3.6,index:this.index,s:this.surface.s,grade:this.surface.grade*100,bank:this.surface.bank*100,onRoad:this.surface.onRoad,laps:this.laps,best:this.best,clock:this.clock,
  height:this.z-CG_HEIGHT,airborne:this.wheelsDown===0&&!this.hullContact,wheelsDown:this.wheelsDown,upright:this.upright,roll:this.roll,pitch:this.pitch,overturned:this.overturned,rightings:this.rightings};}
}
export function recognitionInput(car,{maxSpeed=33,cornerGrip=3.3,braking=3.5,throttleResponse=.5,brakeResponse=.6}={}){
 const data=car.data,speed=Math.hypot(car.vx,car.vy),la=9+speed*.6,target=data.samples[(car.index+Math.round(la/2))%car.n],dx=target[1]-car.x,dy=target[2]-car.y;
 const alpha=wrap(Math.atan2(dy,dx)-car.heading),steer=Math.atan2(2*2.667*Math.sin(alpha),Math.hypot(dx,dy));
 // After a spin the target can lie behind the car: turn round on full lock, slowly.
 const facingAway=Math.abs(alpha)>Math.PI/2,command=facingAway?Math.sign(alpha):clamp(steer/steerLimit(speed),-1,1);
 let desiredSpeed=facingAway?6:maxSpeed;
 for(let j=0;j<(maxSpeed>35?85:40);j+=5){const a=data.samples[(car.index+j+car.n-3)%car.n],b=data.samples[(car.index+j+3)%car.n];const curvature=Math.abs(wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7])))/12;const corner=Math.sqrt(cornerGrip/Math.max(curvature,.0001));desiredSpeed=Math.min(desiredSpeed,Math.sqrt(corner*corner+2*braking*j*2));}
 // Like a driver feeling the tail step out, ease off the throttle in a slide.
 const c=Math.cos(car.heading),s=Math.sin(car.heading),forward=car.vx*c+car.vy*s,slide=forward>3?Math.abs(Math.atan2(-car.vx*s+car.vy*c-1.117*car.yaw,forward)):0;
 return {left:Math.max(0,command),right:Math.max(0,-command),throttle:clamp((desiredSpeed-speed)*throttleResponse,0,1)*clamp(1-(slide-.06)*8,0,1),brake:clamp((speed-desiredSpeed)*brakeResponse,0,1),reverse:0,handbrake:0};
}
