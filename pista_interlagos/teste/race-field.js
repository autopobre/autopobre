import {TestCar,clamp,wrap,steerLimit,WHEELBASE,OPALA_BODY,sameLevel} from './physics.js';
import {RIVAL_ROSTER,ACE_NUMBER,AI_LEVELS,gridSlot,playerGridSlot} from './race-roster.js';
import {pitGeometry,wallContact,pitLane,curveloPitFrame,CURVELO_PIT,garageBays,teamBoxes} from './pit-lane.js';
import {tankFor,burnRate,fuelScale,lapFuel,recommendedFuel} from './fuel.js';
import {circuitId} from './circuits.js';
import {trackFall} from './cliff-fall.js';
import {branchGeometries,locateBranch,branchPoint,branchSpan} from './branch-lane.js';
import {branchLayouts} from './branch-layout.js';
// Contacts between cars: each car's plan is its body's box (physics.js OPALA_BODY, FUSCA_BODY; a remote
// car without one is an Opala). Mass and inertia are the Opala's for every body; engine and tyres are the body's
// (physics.js OPALA_MECHANICS, FUSCA_MECHANICS): the drivers plan their corners and brakes on the car's grip.
const MASS=1250,INERTIA=MASS*(4.76**2+1.86**2)/12;
const plan=c=>c.body??OPALA_BODY;
const axes=c=>[[Math.cos(c.heading),Math.sin(c.heading)],[-Math.sin(c.heading),Math.cos(c.heading)]];
const center=c=>{const ahead=plan(c).ahead;return [c.x+ahead*Math.cos(c.heading),c.y+ahead*Math.sin(c.heading)];};
const reach=p=>Math.hypot(p.halfLength,p.halfWidth);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
// Sectors per lap of the split times behind an estimated finish (classification).
const SPLITS=64;
// Stable personalities: braking envelopes, corner pace, how much road they use (lineUse),
// apex timing in 2 m samples (apex > 0 is later), gap they sit at before a move (followTime),
// appetite to attack, to cover the inside, and lap-to-lap consistency.
export const DRIVER_STYLES=Object.freeze([
 {name:'Freia tarde',maxSpeed:53,cornerGrip:7.6,braking:8.5,brakeResponse:.95,throttleResponse:.65,lookAhead:.53,engineScale:1.08,passDistance:37,passSide:-1,laneRate:1.9,passCooldown:2.4,lineUse:.94,apex:1,followTime:.3,aggression:.85,defend:.5,consistency:.55},
 {name:'Rei das curvas',maxSpeed:51,cornerGrip:8.3,braking:7.2,brakeResponse:.7,throttleResponse:.8,lookAhead:.49,engineScale:1.05,passDistance:33,passSide:1,laneRate:1.6,passCooldown:3.3,lineUse:1,apex:2,followTime:.36,aggression:.55,defend:.4,consistency:.8},
 {name:'Constante',maxSpeed:52,cornerGrip:7.5,braking:6.9,brakeResponse:.48,throttleResponse:.42,lookAhead:.65,engineScale:1.07,passDistance:43,passSide:1,laneRate:1.1,passCooldown:4.8,lineUse:.96,apex:0,followTime:.45,aggression:.35,defend:.3,consistency:.95},
 {name:'Atacante',maxSpeed:54,cornerGrip:8,braking:8,brakeResponse:.82,throttleResponse:.9,lookAhead:.54,engineScale:1.1,passDistance:40,passSide:-1,laneRate:2.2,passCooldown:1.9,lineUse:.97,apex:1,followTime:.24,aggression:1,defend:.85,consistency:.6},
 {name:'Foguete de reta',maxSpeed:56,cornerGrip:7.2,braking:7.5,brakeResponse:.75,throttleResponse:.72,lookAhead:.61,engineScale:1.14,passDistance:46,passSide:1,laneRate:1.4,passCooldown:3.7,lineUse:.9,apex:-1,followTime:.34,aggression:.65,defend:.7,consistency:.75},
].map(Object.freeze));
// The ace (the race option "Koyzinho Indestrutível", race-roster.js): drives the car at its limit instead of a style's
// comfort zone, the way racing-game AI keeps its best drivers at 98-99% of the real grip. Corner
// grip and brakes just under what the tyres give; braking on a friction ellipse (trail braking:
// full brakes in a straight line, easing off as the wheel goes in); the pedal a blink ahead (react).
// No unforced errors, no off days, and contacts barely move him (heavy: mass factor in contacts).
// Racecraft follows the overlap rules instead of courtesy braking (see decide()).
// clean: the racecraft in decide() that levels above Fácil share with him.
export const ACE_STYLE=Object.freeze({name:'Ás',maxSpeed:57,cornerGrip:11.2,braking:10.4,brakeResponse:1,throttleResponse:1.2,lookAhead:.5,engineScale:1.13,passDistance:52,passSide:-1,laneRate:2.4,passCooldown:1,lineUse:1,apex:1,followTime:.18,aggression:1,defend:.9,consistency:1,ellipse:true,react:.04,heavy:2,ace:true,clean:true});
// Fácil (the original field): pace from the standings rating.
export function styleForDriver(entry){
 const base=DRIVER_STYLES[entry.styleIndex],r=entry.rating;
 // On the racing line these grip levels leave a well-driven player car (about 1:53 at
 // Interlagos) some seconds in hand over the fastest rivals.
 return {...base,maxSpeed:base.maxSpeed*(.96+.06*r),cornerGrip:base.cornerGrip*(.89+.1*r),braking:base.braking*(.93+.06*r),engineScale:1+(base.engineScale-1)*(.7+.5*r),passCooldown:base.passCooldown+(1-r)*.5};
}
// Levels above Fácil (race-roster.js AI_LEVELS): each driver's pace comes from the pilots' table,
// skill 5 to 10 spread between the level's [slowest, fastest] grip, braking and engine share; the
// personality keeps a lean (the late braker brakes a little later, the cornering king corners a
// little faster). Everyone drives clean, the ace's way: brakes on the friction ellipse, overlap
// rules instead of courtesy braking, no lifting for a car pulling away, the throttle and not the
// brakes to hold a gap on a straight. Mistakes per braking zone: the table's chance times the
// level's. At Impossível skill 10 is Koyzinho Indestrutível's pace (ACE_STYLE caps it).
export const PRO_LEVELS=Object.freeze({
 medio:Object.freeze({grip:[8.2,9.4],braking:[7.8,9],engine:[.8,1],sharp:.4,errors:.006}),
 alto:Object.freeze({grip:[8.9,10.3],braking:[8.4,9.7],engine:[.85,1.05],sharp:.7,errors:.0045}),
 impossivel:Object.freeze({grip:[9.6,11.2],braking:[9,10.4],engine:[.9,1.1],sharp:1,errors:.003}),
});
const MEAN_GRIP=7.72,MEAN_BRAKING=7.62;
// The rating (0-1) a level ranks drivers by: qualifying, wander, rhythm, reactions.
export const levelRating=(entry,level)=>PRO_LEVELS[level]?(entry.skill-3)/7:entry.rating;
export function styleForLevel(entry,level='facil'){
 const L=PRO_LEVELS[level];if(!L)return styleForDriver(entry);
 const base=DRIVER_STYLES[entry.styleIndex],q=clamp((entry.skill-5)/5,0,1),mix=([lo,hi])=>lo+(hi-lo)*q,sharp=(v,top)=>v+(top-v)*L.sharp;
 return {...base,level,maxSpeed:Math.max(base.maxSpeed,ACE_STYLE.maxSpeed),
  cornerGrip:Math.min(ACE_STYLE.cornerGrip,mix(L.grip)+.5*(base.cornerGrip-MEAN_GRIP)),
  braking:Math.min(ACE_STYLE.braking,mix(L.braking)+.5*(base.braking-MEAN_BRAKING)),
  engineScale:1+(base.engineScale-1)*mix(L.engine),
  brakeResponse:sharp(base.brakeResponse,ACE_STYLE.brakeResponse),throttleResponse:sharp(base.throttleResponse,ACE_STYLE.throttleResponse),
  passCooldown:base.passCooldown+(1-levelRating(entry,level))*.5,
  ellipse:true,react:ACE_STYLE.react,clean:true,errors:entry.errors*L.errors};
}
// The Opala 99 driven in the recon lap with the rivals' racecraft: about 1:54 alone at Interlagos,
// and from the back of the grid usually into the top six in three laps. The player's car has no
// engine scale, so its time comes from the corners, the brakes and decisive passing.
export const HERO_STYLE=Object.freeze({name:'Herói',maxSpeed:56,cornerGrip:10,braking:9.8,brakeResponse:.85,throttleResponse:.85,lookAhead:.54,passDistance:48,passSide:1,laneRate:2.4,passCooldown:1.2,lineUse:.98,apex:1,followTime:.2,aggression:1,defend:.6,consistency:.85});
export const HERO_RATING=.92;
// Four separating axes describe the full, rotated body, including side contacts.
export function bodyContact(a,b){
 const pa=plan(a),pb=plan(b),aa=axes(a),bb=axes(b),ac=center(a),bc=center(b),delta=[bc[0]-ac[0],bc[1]-ac[1]];
 if(Math.hypot(...delta)>reach(pa)+reach(pb)+.09)return null;
 let depth=Infinity,normal;
 for(const axis of [...aa,...bb]){
  const radius=(p,x)=>p.halfLength*Math.abs(dot(axis,x[0]))+p.halfWidth*Math.abs(dot(axis,x[1]));
  const overlap=radius(pa,aa)+radius(pb,bb)-Math.abs(dot(delta,axis));if(overlap<=0)return null;
  if(overlap<depth){depth=overlap;const sign=dot(delta,axis)>=0?1:-1;normal=axis.map(v=>v*sign);}
 }
 // Average clipped corners gives a stable face contact, or a corner for glancing blows.
 const corners=(p,c,ax)=>[-1,1].flatMap(l=>[-1,1].map(w=>c.map((v,i)=>v+l*p.halfLength*ax[0][i]+w*p.halfWidth*ax[1][i])));
 const inside=(q,p,c,ax)=>Math.abs(dot([q[0]-c[0],q[1]-c[1]],ax[0]))<=p.halfLength+.001&&Math.abs(dot([q[0]-c[0],q[1]-c[1]],ax[1]))<=p.halfWidth+.001;
 const points=[...corners(pa,ac,aa).filter(q=>inside(q,pb,bc,bb)),...corners(pb,bc,bb).filter(q=>inside(q,pa,ac,aa))];
 const point=points.length?[0,1].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length):ac.map((v,i)=>(v+bc[i])/2);
 return {depth,normal,point};
}
// A car drawn from the network (remote) is a guess of where its owner is, some tenths of a second old: it pushes a car of
// this window only so hard, REMOTE_PUSH m/s a contact and REMOTE_SHOVE metres a resolution, so a guess corrected into it
// never launches it (iRacing's and ACC's lesson: the netcode study of 10-07, step 6).
const REMOTE_PUSH=4,REMOTE_SHOVE=.008;
export function resolveContact(a,b){
 const hit=bodyContact(a,b);if(!hit)return null;
 const own=a.remote===b.remote?null:a.remote?b:a,before=own&&[own.vx,own.vy,own.yaw,own.x,own.y];
 const {normal:n,point:p}=hit,ra=[p[0]-a.x,p[1]-a.y],rb=[p[0]-b.x,p[1]-b.y];
 // A car's contactMass (the ace's) scales its mass and inertia in the contact only.
 const ma=MASS*(a.contactMass??1),mb=MASS*(b.contactMass??1),ia=INERTIA*(a.contactMass??1),ib=INERTIA*(b.contactMass??1);
 const velocity=(c,r)=>[c.vx-c.yaw*r[1],c.vy+c.yaw*r[0]];
 const va=velocity(a,ra),vb=velocity(b,rb),rv=vb.map((v,i)=>v-va[i]),closing=-dot(rv,n);
 const impulse=(j,axis)=>{a.vx-=axis[0]*j/ma;a.vy-=axis[1]*j/ma;b.vx+=axis[0]*j/mb;b.vy+=axis[1]*j/mb;a.yaw=clamp(a.yaw-cross(ra,axis)*j/ia,-3,3);b.yaw=clamp(b.yaw+cross(rb,axis)*j/ib,-3,3);};
 if(closing>0){const j=1.12*closing/(1/ma+1/mb+cross(ra,n)**2/ia+cross(rb,n)**2/ib);impulse(j,n);const tangent=[-n[1],n[0]],friction=clamp(-dot(rv,tangent)/(1/ma+1/mb+cross(ra,tangent)**2/ia+cross(rb,tangent)**2/ib),-j*.3,j*.3);impulse(friction,tangent);}
 const share=mb/(ma+mb),correction=hit.depth+.002;a.x-=n[0]*correction*share;a.y-=n[1]*correction*share;b.x+=n[0]*correction*(1-share);b.y+=n[1]*correction*(1-share);
 if(own){
  const dvx=own.vx-before[0],dvy=own.vy-before[1],dv=Math.hypot(dvx,dvy);if(dv>REMOTE_PUSH){const k=REMOTE_PUSH/dv;own.vx=before[0]+dvx*k;own.vy=before[1]+dvy*k;own.yaw=before[2]+(own.yaw-before[2])*k;}
  const dx=own.x-before[3],dy=own.y-before[4],d=Math.hypot(dx,dy);if(d>REMOTE_SHOVE){const k=REMOTE_SHOVE/d;own.x=before[3]+dx*k;own.y=before[4]+dy*k;}
 }
 return {...hit,speed:Math.max(0,closing)};
}
// --- Racing line: centreline offsets that minimise curvature inside the asphalt (the
// classic outside-inside-outside), its bends, and the corners along it. Once per circuit.
// A clean driver's lap pace runs from LAP_PEAK (his best possible lap) down by LAP_SPREAD or a little more.
const LAP_PEAK=1.015,LAP_SPREAD=.07;
// Central #21 (Stevan's racecraft, the levels above Fácil only). About WEIGH seconds before the next corner (the corner
// map, known from the start of the straight: the speed plan sees a braking zone only some 1.5 s before it) a clean driver
// within WEIGH_GAP metres of the car ahead weighs the move once (commitChance): skill from the pilots' table (the player
// counts as PLAYER_SKILL); close in level it is a fair fight, a stronger attacker goes more often, a weaker one now and
// then, and the dice keep the upsets. Committed, he keeps his foot in, close in the tow (no corner margin, no lifting to
// hold a gap; the last-moment brake only for a car really about to be hit), and pulls out once the run has brought him
// within PULL_GAP metres of the car, or within POUNCE seconds of the braking point from up to POUNCE_GAP, still at speed, and brakes later on the move (PASS_BRAKE: the inside is tighter) to get
// alongside;
// otherwise he follows. Earlier only on a straight past a car much slower (BIG_CLOSING m/s; not one braking or
// cornering ahead of him) or past a stopped one. A driver just passed comes back
// at the man who did it (REVENGE seconds, the stronger the keener); the best (skill 8 up) press the player harder.
// The cover against another rival weighs skill too (defendChance); against the player it stays the style's (#21.2).
const WEIGH=3.2,WEIGH_GAP=16,POUNCE=1.6,POUNCE_GAP=12,PULL_GAP=7,BIG_CLOSING=4,PLAYER_SKILL=7,REVENGE=30,PASS_BRAKE=.04;
// A clean driver following a car that accelerates (out of a corner) reads it FOLLOW_LEAD seconds ahead: holding his gap to
// its speed of the moment he stayed on part throttle while it pulled away, some 7 m down every straight, tow or not.
const FOLLOW_LEAD=.8;
// Pressed by a stronger rival a clean driver errs more: the pressure's 1.7 grows by PRESSURE_SKILL a point of skill he
// gives away (the player's pressure stays as it was, #21.2).
const PRESSURE_SKILL=.25;
// A title on the line (RaceField stakes, main.js titleStakes: 0-1 for a rival who can still win the championship, all of it
// in its last round): he gives it all, his laps nearer his best (TITLE_PACE of the swing gone) and his moves bolder
// (TITLE_PUSH on commitChance).
const TITLE_PACE=.35,TITLE_PUSH=.2;
export const commitChance=(mine,theirs,aggression,boost=0)=>clamp(.5+.09*(mine-theirs)+.25*(aggression-.6)+boost,.12,.95);
export const defendChance=(style,mine,theirs)=>clamp(style+.1*(mine-theirs),.1,.95);
const G=9.81,BRAKE_FULL=11,LINE_MARGIN=1.3,KERB_ROOM=.45,LANE_MARGIN=1.1,CAR_GAP=2.45,CORNER_CURVE=1/260;
const lines=new WeakMap();
export function racingLine(data){
 if(lines.has(data))return lines.get(data);
 const a=data.samples,n=a.length,off=new Float64Array(n),lo=new Float64Array(n),hi=new Float64Array(n),laneLo=new Float64Array(n),laneHi=new Float64Array(n),geo=pitGeometry(data);
 for(let i=0;i<n;i++){
  const p=a[i],heading=Math.atan2(p[8],p[7]),half=p[4]/2;
  // Where the pit wall runs beside the asphalt, the whole car body keeps 40 cm off it.
  const clear=side=>{let d=half+1;while(d>0&&geo&&wallContact(geo,p[1]+p[9]*side*(d+.4),p[2]+p[10]*side*(d+.4),heading))d-=.25;return d;};
  const left=clear(1),right=clear(-1);
  laneLo[i]=-Math.min(half-LANE_MARGIN,right);laneHi[i]=Math.min(half-LANE_MARGIN,left);
  // A wheel may ride a surveyed kerb (13 right, 14 left), so the line gets a little more room there.
  lo[i]=-Math.min(half-LINE_MARGIN+(p[13]?KERB_ROOM:0),right);hi[i]=Math.min(half-LINE_MARGIN+(p[14]?KERB_ROOM:0),left);
 }
 relaxLine(a,off,lo,hi,0,n);
 const line={off,lo,hi,laneLo,laneHi,...lineShape(a,off,data.meta.reconstructed_xy_m/n)};lines.set(data,line);return line;
}
// Each point (the stations from..to-1, round the lap) slides along its normal to where its bend matches its neighbours'
// (biharmonic relaxation), from 48 m stencils down to 6 m, clamped to the road.
function relaxLine(a,off,lo,hi,from,to){
 const n=a.length,X=i=>a[i][1]+a[i][9]*off[i],Y=i=>a[i][2]+a[i][10]*off[i];
 for(const [k,passes] of [[24,150],[12,150],[6,120],[3,100]])for(let pass=0;pass<passes;pass++)for(let t=from;t<to;t++){
  const i=t%n,m1=(i-k+n)%n,p1=(i+k)%n,m2=(i-2*k+2*n)%n,p2=(i+2*k)%n;
  const ex=(4*(X(m1)+X(p1))-X(m2)-X(p2))/6-X(i),ey=(4*(Y(m1)+Y(p1))-Y(m2)-Y(p2))/6-Y(i);
  off[i]=clamp(off[i]+.6*(ex*a[i][9]+ey*a[i][10]),lo[i],hi[i]);
 }
}
// The bends of a line (offsets off from the stations a, ds metres apart) and of the centre line, and the corners along it.
function lineShape(a,off,ds){
 const n=a.length,X=i=>a[i][1]+a[i][9]*off[i],Y=i=>a[i][2]+a[i][10]*off[i];
 // Signed curvature (left positive) over 20 m chords, lightly averaged against survey noise.
 const curvature=(px,py)=>{
  const raw=new Float64Array(n),out=new Float64Array(n);
  for(let i=0;i<n;i++){const m=(i-5+n)%n,p=(i+5)%n,ax=px(i)-px(m),ay=py(i)-py(m),bx=px(p)-px(i),by=py(p)-py(i);raw[i]=2*(ax*by-ay*bx)/(Math.hypot(ax,ay)*Math.hypot(bx,by)*Math.hypot(px(p)-px(m),py(p)-py(m)));}
  for(let i=0;i<n;i++){let sum=0;for(let j=-3;j<=3;j++)sum+=raw[(i+j+n)%n];out[i]=sum/7;}
  return out;
 };
 const curve=curvature(X,Y),centre=curvature(i=>a[i][1],i=>a[i][2]);
 // The bend a lane beside the centre line follows (laneCentre, the clean drivers'): the centre's, except where the road
 // only widens or narrows (a pit exit merging, Interlagos' after the Sol): there one edge runs straight while the centre
 // swings across, and a car out of its line felt a corner nobody drives (braking beside a rival onto the reta oposta,
 // Central #21). In a real corner both edges bend with the centre (even a hairpin's outer edge keeps over half its bend).
 const edge=side=>curvature(i=>a[i][1]+a[i][9]*side*a[i][4]/2,i=>a[i][2]+a[i][10]*side*a[i][4]/2),left=edge(1),right=edge(-1);
 const laneCentre=centre.map((k,i)=>{const l=left[i],r=right[i];return Math.abs(l)<.5*Math.abs(k)||Math.abs(r)<.5*Math.abs(k)?(Math.abs(l)<Math.abs(r)?l:r):k;});
 // Corners are runs of real bend on the line; each sample knows the corner it is in,
 // or the next one, and how far away its turn-in is.
 const bend=i=>Math.abs(curve[(i+n)%n])>CORNER_CURVE,corners=[],owner=new Int32Array(n).fill(-1);
 let start=0;while(start<n&&bend(start))start++;
 for(let t=1;t<=n;t++){
  const i=(start+t)%n;if(!bend(i))continue;
  // A short straighter gap (under 24 m) inside one bend does not start a new corner.
  const prev=corners.at(-1),gap=prev?(i-prev.end+n)%n:n;
  if(!prev||gap>12||Math.sign(curve[i])!==prev.dir)corners.push({start:i,apex:i,dir:Math.sign(curve[i]),end:i});
  const c=corners.at(-1);c.end=i;owner[i]=corners.length-1;if(Math.abs(curve[i])>Math.abs(curve[c.apex])){c.apex=i;c.dir=Math.sign(curve[i]);}
 }
 const cornerAt=new Int32Array(n).fill(-1),cornerDist=new Float64Array(n);
 for(let t=2*n-1,id=-1,run=0;t>=0;t--){const i=t%n;if(owner[i]>=0){id=owner[i];run=0;}else run++;if(t<n){cornerAt[i]=id;cornerDist[i]=run*ds;}}
 return {curve,centre,laneCentre,corners,cornerAt,cornerDist,ds};
}
// --- Branch roads (data.branches, branch-lane.js: Pampulha's avenue past the Igrejinha): a second way past a stretch of
// the lap, both valid. Each rival takes one way past each fork for the whole race (RaceField reset). The way by a branch
// is driven on a lap of its own (forkRoutes): the lap with the stretch from the branch's entry to its exit replaced by the
// branch's stations (resampled about 2 m apart), on which the racing line is relaxed again round the fork (FORK_WINDOW
// stations either side; the lap's line and its bounds kept beyond), so the speed plan sees the branch's corners before the
// split and after the merge the car is on the lap's own line without a seam. A station's bounds there are the road a car
// may use (forkBounds): the lap's asphalt where the two run together and the branch's own beyond the lap's edge on its
// side where it is a road of its own (physics.js forkAt), the part of the branch past the lap's far wall left out.
// A car's place on such a lap (RaceField forkFrame): by the branch's stations through the fork's stretch, by the lap's
// elsewhere (shifted past it by what the branch saves).
const FORK_WINDOW=200,FORK_ROOM=2.5,FORK_SHARE=.5,CREST_GRIP=.8,SAG_LOAD=1.5,TIP_ROOM=.6,forkCache=new WeakMap();
export function forkRoutes(data){
 if(!data.branches?.length)return null;
 if(forkCache.has(data))return forkCache.get(data);
 const main=racingLine(data),a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,layouts=branchLayouts(data);
 const routes=branchGeometries(data).map(geo=>{
  const kA=a.findIndex(p=>p[0]>=geo.entryMainS),kB=a.findIndex(p=>p[0]>=geo.exitMainS);
  if(!(kA>0&&kB>kA))throw Error(`branch ${geo.id}: its stretch must not cross the line`);
  const bStart=a[kA][0]-geo.entryMainS,total=geo.length+(a[kB][0]-geo.exitMainS)-bStart,m=Math.max(1,Math.round(total/main.ds)),h=total/m,shift=m-(kB-kA);
  const [from,to]=branchSpan(geo),lap=layouts[geo.index].lap,rows=[],dlo=[],dhi=[];
  for(let j=0;j<m;j++){
   const b=bStart+j*h,p=branchPoint(geo,b),tl=Math.hypot(p.tx,p.ty)||1,nl=Math.hypot(p.lx,p.ly)||1,lx=p.lx/nl,ly=p.ly/nl;
   rows.push([a[kA][0]+j*h,p.x,p.y,p.z,p.width,p.bank,p.grade,p.tx/tl,p.ty/tl,lx,ly,0,0,p.kerbRight,p.kerbLeft]);
   const [lo,hi]=forkBounds(lap,p,lx,ly,geo.side,p.mainS>=from&&p.mainS<=to);dlo.push(lo);dhi.push(hi);
  }
  const va=[...a.slice(0,kA),...rows,...a.slice(kB)],nv=va.length,lapK=k=>k<kA?k:k-shift,inFork=k=>k>=kA&&k<kA+m;
  const off=new Float64Array(nv),lo=new Float64Array(nv),hi=new Float64Array(nv),laneLo=new Float64Array(nv),laneHi=new Float64Array(nv),sv=new Float64Array(nv),delta=a[kB][0]-a[kA][0]-m*h;
  for(let k=0;k<nv;k++){
   if(inFork(k)){const j=k-kA;lo[k]=dlo[j]+LINE_MARGIN;hi[k]=dhi[j]-LINE_MARGIN;laneLo[k]=dlo[j]+LANE_MARGIN;laneHi[k]=dhi[j]-LANE_MARGIN;sv[k]=a[kA][0]+j*h;continue;}
   const i=lapK(k);off[k]=main.off[i];lo[k]=main.lo[i];hi[k]=main.hi[i];laneLo[k]=main.laneLo[i];laneHi[k]=main.laneHi[i];sv[k]=k<kA?a[i][0]:a[i][0]-delta;
  }
  relaxLine(va,off,lo,hi,Math.max(0,kA-FORK_WINDOW),Math.min(nv,kA+m+FORK_WINDOW));
  // Over a crest of the branch's profile (it climbs from the lap's height to the avenue's own) a car lighter than its
  // weight takes off: the speed the road's fall over a 4 m chord leaves CREST_GRIP of g on the wheels; into a sharp sag
  // (a kink up, the suspension slammed onto its stops and thrown off them at the crest after it) no more than SAG_LOAD
  // of g pressing it down. Infinity elsewhere.
  const crest=new Float64Array(nv).fill(Infinity);
  for(let j=2;j+2<m;j++){const z=k=>rows[k][3],bend=(z(j+2)-2*z(j)+z(j-2))/(4*h*h);crest[kA+j]=Math.sqrt(G*(bend<0?CREST_GRIP:SAG_LOAD)/Math.max(Math.abs(bend),1e-9));}
  const line=forkLanes({off,lo,hi,laneLo,laneHi,...lineShape(va,off,main.ds),crest},kA-FORK_LEAD,kA+m+10);
  return {index:geo.index,geo,kA,kB,m,h,bStart,shift,delta,a:va,n:nv,sv,L:L-delta,line,lapK,inFork};
 });
 // The lap's own way (RaceField main view): its line kept TIP_ROOM further off the branch's side near the tips of the V
 // where the branch's right wall meets the lap's (out of the lap's kink at the split the line rode the kerb into the
 // tip), relaxed again round each fork, and its lanes narrowed as the forks'.
 const off=Float64Array.from(main.off),lo=Float64Array.from(main.lo),hi=Float64Array.from(main.hi),laneLo=Float64Array.from(main.laneLo),laneHi=Float64Array.from(main.laneHi);
 for(const R of routes){
  const g=[...R.geo.mainGaps].sort((p,q)=>p[0]-q[0]),side=R.geo.side,near=s=>s>=g[0][1]-40&&s<=g[0][1]+5||s>=g.at(-1)[0]-30&&s<=g.at(-1)[0]+10;
  for(let k=R.kA;k<R.kB;k++){if(!near(a[k][0]))continue;const half=a[k][4]/2;
   if(side>0){hi[k]=Math.min(hi[k],half-LINE_MARGIN-TIP_ROOM);laneHi[k]=Math.min(laneHi[k],half-LANE_MARGIN-TIP_ROOM);}
   else{lo[k]=Math.max(lo[k],-half+LINE_MARGIN+TIP_ROOM);laneLo[k]=Math.max(laneLo[k],-half+LANE_MARGIN+TIP_ROOM);}}
  relaxLine(a,off,lo,hi,Math.max(0,R.kA-FORK_WINDOW),Math.min(n,R.kB+FORK_WINDOW));
 }
 routes.mainLine=routes.reduce((line,R)=>forkLanes(line,R.kA-FORK_LEAD,R.kB+10),{off,lo,hi,laneLo,laneHi,...lineShape(a,off,main.ds)});
 forkCache.set(data,routes);return routes;
}
// Round a fork the lanes a car moves over to (laneLo, laneHi: passing, room, defence) are the narrowest of the next
// FORK_AHEAD stations': where the two roads part one of them narrows within a few dozen metres, and a car out in a lane
// as wide as the road had been ran on into the other road (a pass round the outside of the lap's kink at the Igrejinha
// carried on down the avenue). From station from to to-1.
const FORK_AHEAD=40,FORK_LEAD=120;
function forkLanes(line,from,to){
 const n=line.laneLo.length,lo=Float64Array.from(line.laneLo),hi=Float64Array.from(line.laneHi);
 for(let t=from;t<to;t++){
  const k=(t%n+n)%n;for(let j=1;j<=FORK_AHEAD;j++){const q=(k+j)%n;lo[k]=Math.max(lo[k],line.laneLo[q]);hi[k]=Math.min(hi[k],line.laneHi[q]);}
  if(lo[k]>hi[k]-.5){const m=(lo[k]+hi[k])/2;lo[k]=m-.25;hi[k]=m+.25;}
 }
 return {...line,laneLo:lo,laneHi:hi};
}
// The road a car may use across a branch station p (unit left normal lx, ly), as offsets from the branch's centre line
// [lo, hi]: the stretch round the centre line where the point is on the lap's asphalt (lap: branch-layout.js lapNear) or,
// where the branch is a road of its own (own), on the branch's asphalt past the lap's edge on its side.
function forkBounds(lap,p,lx,ly,side,own){
 const ok=d=>{const e=lap(p.x+lx*d,p.y+ly*d);return Math.abs(e.d)<=e.width/2||own&&e.d*side>0&&Math.abs(d)<=p.width/2;};
 let c=0;if(!ok(0))for(let d=.25;d<p.width;d+=.25){if(ok(d)){c=d;break;}if(ok(-d)){c=-d;break;}}
 let lo=c,hi=c;while(lo>c-30&&ok(lo-.25))lo-=.25;while(hi<c+30&&ok(hi+.25))hi+=.25;
 return [lo,hi];
}
// Each rival's way past a fork (true: by the branch), on dice of its own: the race's seed, its number and the fork, so
// the host and its guests agree and the race's other dice stay as they were.
function forkCoin(seed,number,index){let h=0x811C9DC5;for(const ch of String(number))h=Math.imul(h^ch.charCodeAt(0),0x01000193);return random((seed^h^Math.imul(index+1,0x9E3779B1))>>>0)();}
// --- In-lap: after the flag a rival runs one more lap, takes the pit lane and parks on the
// working lane. Cars line up in the order they arrive, the first furthest down the garage row,
// so nobody pulls over beside a parked car; Box 99, the café bay and the way out stay clear.
// --- Breakdowns (the race option "Abandonos"): the Old Stock is Brazil's race with the most
// mechanical failures, and a race nobody retires from never happened. smoke: seconds of engine smoke.
export const BREAKDOWNS=Object.freeze([{kind:'motor',smoke:14},{kind:'câmbio',smoke:0},{kind:'embreagem',smoke:0},{kind:'suspensão',smoke:0},{kind:'superaquecimento',smoke:10},{kind:'pane elétrica',smoke:0}].map(Object.freeze));
const PARK_OFF=3.2;
// A car whose driver is gone (multiplayer: a guest's line dropped; r.stop, stopInput): rolling on, once
// it is down to TOW_SLOW (m/s) for a moment it is stopped where it is (a gentle slope kept one rolling
// at walking pace down the middle of the road for minutes, under the yellow flag, and the truck never
// came). On the road the tow truck comes: it drives in along the side of the track, passes the car and
// hooks it, TOW_ARRIVE seconds in all; then it pulls the car along its way (towPath) at TOW_PACE (m/s),
// TOW_TURN_PACE off the road onto the first clear grass within TOW_REACH metres (PARK_OFF past the edge).
// While such a car is on the road the rivals take the yellow flag: no faster than CAUTION_PACE (m/s) right
// behind it, a little more the further back, through the CAUTION_REACH metres before it.
export const TOW_ARRIVE=7;
const TOW_SLOW=3,TOW_PACE=5,TOW_TURN_PACE=2.5,TOW_REACH=800,TOW_EDGE=-1.3,CAUTION_PACE=20,CAUTION_REACH=250;
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
// Nobody at the pedals or the wheel (stopInput; multiplayer.js gives the same to a guest's own car).
export const FAINTED=Object.freeze({left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0});
const GRASS_DRAG=Object.freeze({...FAINTED,brake:.45}),HELD=Object.freeze({...FAINTED,brake:1});
// What a car with nobody at the wheel gets this step: free on the asphalt; off it the grass and gravel
// hold it (rolling free there, one crossed 300 m of infield); at a standstill it stays put.
export const faintedInput=c=>Math.hypot(c.vx,c.vy)<=.4?HELD:c.surface.onRoad||c.surface.pit?FAINTED:GRASS_DRAG;
// A car without its driver (stop: r.stop, or the host's word in multiplayer.js) in the race's way:
// still on the road, rolling, standing or on the strap; not off it, nor in the pit lane. The rivals
// ease off for it (cautions) and every window shows the yellow flag for it (multiplayer.js).
export const inTheWay=(stop,c)=>!!stop&&stop.stage!=='fora'&&!c.surface.pit;
const NO_CAUTIONS=Object.freeze([]);
const COOL_PACE=24,PIT_PACE=22,PIT_LIMIT=15.5,INLAP_MERGE=220,SLOT_GAP=6.6,routes=new WeakMap();
// --- Refuelling stops (user, 10-24): in a race longer than the tank holds (fuel.js: Stevan's table, the 15 L tank) each
// rival burns as the player does and stops once at its team's garage (teamBoxes: never Box 99 nor the Tia's café), on a
// lap drawn from those one stop works for, so the field comes in spread over the laps. Short of fuel it comes in at
// once; dry, it is out (pane seca). The crew fills what is left to run, plus FUEL_RESERVE, in REFUEL_TIME + REFUEL_RATE
// a litre (the Box 99's own pace). Races the tank covers keep the tank that never ends, as before.
export const FUEL_RESERVE=.6,REFUEL_TIME=2,REFUEL_RATE=1.5;
// Into its spot from the fast lane over SERVICE_OVER m (shorter than the in-lap's 12: the next garage is 13 m on), out
// again over SERVICE_OUT m; the way out waits for a car coming down the fast lane within SERVICE_WAIT m.
const SERVICE_OVER=7,SERVICE_OUT=8,SERVICE_WAIT=28;
export function pitRoute(data){
 if(routes.has(data))return routes.get(data);
 const L=data.meta.reconstructed_xy_m,a=data.samples,curvelo=!data.pit&&data.meta.id==='curvelo',frame=data.pit??(curvelo?curveloPitFrame(data):null);
 if(!frame){routes.set(data,null);return null;}
 const track=s=>{s=((s%L)+L)%L;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}const p=a[lo],q=a[(lo+1)%a.length],u=(s-p[0])/((lo===a.length-1?L:q[0])-p[0]);return p.map((v,k)=>v+(q[k]-v)*u);};
 // Stations along the lane (u from its entry): centre, direction, and the centres of the fast
 // lane and of the working lane on the garage side (d to the lane's left).
 let st,entryS,u0,limit;const rev=!!frame.reversed,len=frame.length_m??0,U=s=>rev?len-s:s;
 if(curvelo){
  // Curvelo's service lane is an offset of the main straight, 300 m from its entry (pitLane).
  entryS=L-150;u0=150;limit={from:60,to:300};st=[];
  for(let u=0;u<=300;u+=2){const p=track(u-150),lane=pitLane(data,u-150),blend=lane.offset/CURVELO_PIT.offset;st.push({u,x:p[1]+p[9]*lane.offset,y:p[2]+p[10]*lane.offset,fast:-lane.halfWidth/2*blend,work:lane.halfWidth/2});}
  st.forEach((q,i)=>{const p=st[Math.max(0,i-1)],r=st[Math.min(st.length-1,i+1)],len=Math.hypot(r.x-p.x,r.y-p.y);q.tx=(r.x-p.x)/len;q.ty=(r.y-p.y)/len;});
 }else{
  const c=Object.fromEntries(frame.columns.map((k,i)=>[k,i]));entryS=frame.entry_main_s;u0=0;
  // A block written against the cars (pit-lane.js, Brasília): its stations in reverse, u from the
  // entry, the direction turned round and the offsets to the cars' left negated.
  const k=rev?-1:1,lim=frame.limit;limit=rev&&lim?{...lim,from:len-lim.to,to:len-lim.from}:lim;
  st=(rev?[...frame.samples].reverse():frame.samples).map(p=>{const n=Math.hypot(p[c.tx],p[c.ty]);return {u:rev?len-p[c.s]:p[c.s],x:p[c.x],y:p[c.y],tx:k*p[c.tx]/n,ty:k*p[c.ty]/n,fast:k*(p[c.lane_lo]+p[c.fast_hi])/2,work:k*(p[c.fast_hi]+p[c.lane_hi])/2};});
 }
 // Corner speed of each station over 12 m chords, gentle (4.5 m/s² sideways).
 st.forEach((q,i)=>{const p=st[Math.max(0,i-3)],r=st[Math.min(st.length-1,i+3)],turn=Math.abs(wrap(Math.atan2(r.ty,r.tx)-Math.atan2(p.ty,p.tx)))/Math.max(1,r.u-p.u);q.v=Math.min(PIT_PACE,Math.sqrt(4.5/Math.max(turn,1e-4)));});
 const at=u=>{let lo=0,hi=st.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(st[m].u<=u)lo=m;else hi=m-1;}const p=st[lo],q=st[lo+1],t=clamp((u-p.u)/(q.u-p.u),0,1),mix=k=>p[k]+(q[k]-p[k])*t,n=Math.hypot(mix('tx'),mix('ty'));return {x:mix('x'),y:mix('y'),tx:mix('tx')/n,ty:mix('ty')/n,fast:mix('fast'),work:mix('work')};};
 const e=track(entryS),s0=at(0),entryD=(s0.x-s0.ty*s0.fast-e[1])*e[9]+(s0.y+s0.tx*s0.fast-e[2])*e[10];
 // Parking slots, first taken first: from the end of the garage row back to Box 99's way out,
 // then from before the café back to where the working lane begins. A slot stays clear of the
 // walls a metre either way along the lane (the lane narrows where the garage row ends).
 // In the cars' order (U): the garage row, and Box 99 with the café, kept clear from 6.4 m before
 // the first of them to 8.5 m past the other (the café comes first where the garages are on the left).
 const b=frame.box99,half=b.bay/2,g0=Math.min(U(frame.garages[0]),U(frame.garages[1])),g1=Math.max(U(frame.garages[0]),U(frame.garages[1]));
 const first=(curvelo?80-u0:g0)+2.9,slots=[],geo=pitGeometry(data),boxFrom=Math.min(U(b.s),U(b.cafe_s))-half,boxTo=Math.max(U(b.s),U(b.cafe_s))+half;
 const clear=u=>[-1.2,-.6,0,.6,1.2].every(du=>{const p=at(u+du);return !wallContact(geo,p.x-p.ty*p.work,p.y+p.tx*p.work,Math.atan2(p.ty,p.tx));});
 const take=(from,to)=>{for(let u=from+u0;u>=to+u0;u-=.2)if(clear(u)&&!(slots.at(-1)-u<SLOT_GAP))slots.push(u);};
 take(g1-2.9,boxTo+8.5);take(boxFrom-6.4,first);
 // The teams' garages for a refuelling stop (teamBoxes): a spot on the working lane at the garage's middle, or two a car
 // length apart where teams share it (takeSpot takes the one further down the lane first). A spot is one object for all
 // the teams of its garage, so they see each other there.
 const {bay}=garageBays(frame,RIVAL_ROSTER.length),spots=new Map();
 const boxes=teamBoxes(frame,RIVAL_ROSTER.length).map(({bay:b,share})=>{
  if(!spots.has(b)){const u=U(frame.garages[0]+(b+.5)*bay)+u0;spots.set(b,(share>1?[u+3.25,u-3.25]:[u]).map(v=>({u:v,d:at(v).work,bay:b})));}
  return {bay:b,share,spots:spots.get(b)};
 });
 const route={stations:st,at,entryS,entryD,limit,slots:slots.map(u=>({u,d:at(u).work})),boxes,end:st.at(-1).u};
 routes.set(data,route);return route;
}
// Seeded (mulberry32) so a check or a reference run can replay one race exactly.
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// The way from s0 to s1 along a lap of L, the short way round (negative backwards): a car's travel
// between two steps, across the line too.
export const lapTravel=(s0,s1,L)=>{let d=s1-s0;if(d>L/2)d-=L;if(d<-L/2)d+=L;return d;};
const trackGap=(from,to,L)=>lapTravel(from.surface.s,to.surface.s,L);
// Multiplayer (multiplayer.js): a remote car is placed from its owner's messages, so two of them
// never push each other here; in a room raced with ghosts the humans' cars pass through one another.
// (netGhost: a car whose line is unsteady, or left without its pilot, in a multiplayer room: it goes through every car,
// multiplayer.js linkGhosts)
const apart=(a,b)=>a.remote&&b.remote||a.ghost&&b.ghost||!!a.netGhost||!!b.netGhost;
export class RaceField {
 // ace: Koyzinho drives as the ace from the next reset (the race option, main.js); level: the rivals'
 // level (AI_LEVELS), also taken at the next reset; retirements: one to four cars break down (the
 // race option "Abandonos", on in the game, off by default here so seeded checks race full fields).
 // body: the rivals' body (physics.js OPALA_BODY, FUSCA_BODY in a Fusca race), taken at the next reset.
 // forkChoice (checks, reference runs): (entry, fork index) => true to send that rival by the branch, instead of the dice.
 // stakes: {number: 0-1} the championship's title stakes (TITLE_PACE), set by main.js before a round, taken at the next reset.
 constructor(data,{onStep,onReset,seed,ace=false,level='facil',retirements=false,roster=RIVAL_ROSTER,body=OPALA_BODY,weatherGrip=1,forkChoice=null}={}){this.data=data;this.weatherGrip=weatherGrip;this.body=body;this.onStep=onStep;this.onReset=onReset;this.seed=seed;this.ace=ace;this.level=level;this.stakes=null;this.retirements=retirements;this.roster=roster;this.line=racingLine(data);this.route=pitRoute(data);this.forkChoice=forkChoice;this.views();this.time=0;this.collisions=0;this.cooldowns=new Map();this.reset();}
 // The ways a car is driven by (decide's view): plain, the lap as ever (a track without a branch road, and the last
 // resort); main, the lap on a track with branch roads (a car on a branch's own road away from the lap is not on it:
 // mainFrame null); one per branch, the lap with that branch in it (forkRoutes, forkFrame). a, line, L: the stations,
 // the racing line and the length driven by; F: a car's place there (station i, distance s, offset d to the left, the
 // unit tangent and left normal, onRoad, pit), or null where the car is not on that way's road.
 views(){
  const data=this.data,L=data.meta.reconstructed_xy_m;
  this.plain={key:'plain',plain:true,a:data.samples,line:this.line,L,F:o=>o.surface,fork:null};
  this.forks=forkRoutes(data);if(!this.forks)return;
  this.frames=new WeakMap();
  this.main={key:'main',a:data.samples,line:this.forks.mainLine,L,F:o=>this.mainFrame(o),fork:null};
  this.forkViews=this.forks.map(R=>({key:'fork'+R.index,a:R.a,line:R.line,L:R.L,F:o=>this.forkFrame(o,R),fork:R}));
 }
 // A car's place on the lap (main view): its surface on the lap; on a branch road where it runs beside the lap, the
 // lap's nearest segment (within FORK_ROOM of the lap's asphalt), else null.
 mainFrame(o){
  const S=o.surface;if(S.branch==null)return S;
  const e=this.frameOf(S);if(e.main!==undefined)return e.main;
  const a=this.data.samples,n=a.length,L=this.data.meta.reconstructed_xy_m,q=o.nearest(o.x,o.y,false,null),p=a[q.i],r=a[(q.i+1)%n],l=Math.hypot(p[7],p[8])||1,tx=p[7]/l,ty=p[8]/l,d=-q.ex*ty+q.ey*tx;
  return e.main=Math.abs(d)>p[4]/2+FORK_ROOM?null:{i:q.i,s:(p[0]+q.u*Math.hypot(r[1]-p[1],r[2]-p[2]))%L,d,width:p[4],tx,ty,lx:-ty,ly:tx,onRoad:S.onRoad,pit:S.pit};
 }
 // A car's place on a fork's way (forkRoutes): off the fork's stretch the lap's own (past it, shifted); through it by the
 // branch's stations, while the car is on that way's road (within FORK_ROOM of its bounds), else null.
 forkFrame(o,R){
  const S=o.surface,i=S.i;if(i<R.kA)return S;
  const e=this.frameOf(S),key='f'+R.index;if(e[key]!==undefined)return e[key];
  if(i>=R.kB)return e[key]={i:i+R.shift,s:S.s-R.delta,d:S.d,width:S.width,tx:S.tx,ty:S.ty,lx:S.lx,ly:S.ly,onRoad:S.onRoad,pit:S.pit};
  const b=locateBranch(R.geo,o.x,o.y);if(!b)return e[key]=null;
  const j=(b.s-R.bStart)/R.h,k=j<0?R.kA-1:R.kA+Math.min(R.m-1,Math.floor(j));
  if(b.d<R.line.laneLo[k]-LANE_MARGIN-FORK_ROOM||b.d>R.line.laneHi[k]+LANE_MARGIN+FORK_ROOM)return e[key]=null;
  return e[key]={i:k,s:R.sv[R.kA]+b.s-R.bStart,d:b.d,width:b.width,tx:b.tx,ty:b.ty,lx:b.lx,ly:b.ly,onRoad:S.onRoad,pit:S.pit};
 }
 frameOf(S){let e=this.frames.get(S);if(!e)this.frames.set(S,e={});return e;}
 // The way a driver drives by this step: its own way past each fork while it is on that way's road; else the lap; else
 // (pushed off it, or past a nose the wrong side) the way whose road it is on. Switching ways mid-move, it drops the
 // move and holds its place across the road (the offsets were the other way's).
 view(r){
  if(!this.forks)return this.plain;
  const c=r.car;let V=null;
  for(const W of this.forkViews)if(r.routes?.[W.fork.index]&&W.F(c)){V=W;break;}
  if(!V)V=this.mainFrame(c)?this.main:this.forkViews.find(W=>W.F(c))??this.plain;
  if(r.viewKey!==undefined&&r.viewKey!==V.key)Object.assign(r,{mode:'line',rival:null,roomFor:null,blendTarget:0,lane:V.F(c).d});
  r.viewKey=V.key;return V;
 }
 // The way a tow follows from where the car stands: the lap's, or a branch's on that branch's own road.
 towView(c){
  if(!this.forks||c.surface.branch==null&&this.mainFrame(c))return this.plain;
  return this.forkViews.find(W=>W.F(c))??this.plain;
 }
 // entrants: the roster numbers that race (null: all of them; [] a solo practice, [number] a 1x1). A
 // short field closes up to the front of the grid, the player in the next slot (playerGridSlot).
 // roster (taken here too): the drivers, RIVAL_ROSTER or, when the player races another team's car,
 // race-roster.js fieldRoster with the Opala 99 in that car's seat.
 reset(startS=0,{grid=false,seed=this.seed,entrants=null}={}){
  this.time=0;this.collisions=0;this.cooldowns.clear();this.nextSlot=0;this.hero=null;this.cautions=[];
  // The player's race distance and split times, measured here too: a reference pace (classification).
  this.playerRun={progress:0,lastS:null,splits:[]};
  // A fresh seed per start: the same grid never races the same way twice.
  this.raceSeed=seed??Math.floor(Math.random()*4294967296);const rand=this.random=random(this.raceSeed),pick=(lo,hi)=>lo+(hi-lo)*rand();
  this.gridLeadIn=grid?(this.data.meta.reconstructed_xy_m-startS)%this.data.meta.reconstructed_xy_m:0;
  // Qualifying on the day: the grid follows the drivers' level, shuffled by a good or bad session.
  // The ace starts from the last rival slot, just ahead of the player.
  const ace=entry=>this.ace&&entry.number===ACE_NUMBER,level=AI_LEVELS.includes(this.level)?this.level:'facil';
  const field=this.roster,roster=entrants?field.filter(entry=>entrants.includes(entry.number)):field,playerBack=playerGridSlot(roster.length).back;this.entrants=entrants;
  const slots=[];roster.map((entry,i)=>({i,time:-levelRating(entry,level)+pick(-.18,.18)+(ace(entry)?1e3:0)})).sort((a,b)=>a.time-b.time).forEach((q,slot)=>slots[q.i]=slot);
  // rosterIndex: the car's place in the roster (and among the visuals' cars), whatever the field.
  this.rivals=roster.map((entry,i)=>{
   const slot=slots[i],style=ace(entry)?ACE_STYLE:styleForLevel(entry,level),progress=playerBack-gridSlot(slot).back;
   const L=this.data.meta.reconstructed_xy_m,s=((startS+progress)%L+L)%L;let index=this.data.samples.findIndex(p=>p[0]>=s);if(index<0)index=0;
   const car=new TestCar(this.data).setBody(this.body);car.reset(index);car.awaitingStart=grid;car.engineScale=style.engineScale;car.weatherGrip=this.weatherGrip;if(style.heavy)car.contactMass=style.heavy;
   const lane=gridSlot(slot).lane;car.x+=car.surface.lx*lane;car.y+=car.surface.ly*lane;car.surface=car.sample(car.x,car.y);
   const rating=levelRating(entry,level);
   const rival={car,entry,rosterIndex:field.indexOf(entry),style,level,stake:style.clean?clamp(+(this.stakes?.[entry.number]??0)||0,0,1):0,progress,start:progress,splits:[],lastS:car.surface.s,finished:false,finishTime:null,stun:0,
    // Personal line: share of the road used, apex timing and a slow wander of a few decimetres.
    lineUse:clamp(style.lineUse*pick(.95,1.04),.8,1),apex:style.apex+Math.round(pick(-1.4,1.4)),
    wander:{amp:pick(.08,.3)*(1.4-rating),rate:pick(.06,.14)*2*Math.PI,phase:pick(0,2*Math.PI)},
    // Rhythm: grip and braking breathe a little around the day's form.
    rhythm:{amp:.01+.035*(1-style.consistency)*(1.4-rating),rates:[pick(.04,.09),pick(.11,.23)].map(f=>f*2*Math.PI),phases:[pick(0,2*Math.PI),pick(0,2*Math.PI)]},
    // Lights out: reaction time, then a few seconds side by side before settling onto the line.
    reaction:grid?.15+pick(0,.4)*(1.3-rating):0,merge:pick(1.2,3.5),form:1,lap:-1,slot,
    // Race-day form: some days a driver simply has more pace than the standings suggest.
    day:1+pick(-.012,.012),
    lane,blend:1,blendTarget:1,mode:'line',rival:null,passSide:0,modeTime:0,cooldown:pick(1,3),defended:-1,rolled:-1,mistake:null,brakePedal:0,mistakes:0,passes:0,stuck:0,pit:null,yieldSide:0,yieldTime:0};
   // The ace: the whole line every lap, no off days, a sharp start (the dice are still drawn,
   // so the other drivers' races stay as they were).
   if(style.ace)Object.assign(rival,{lineUse:1,apex:style.apex,wander:{...rival.wander,amp:0},rhythm:{...rival.rhythm,amp:0},reaction:grid?.13:0,day:1});
   return rival;
  });
  // Branch roads (data.branches): each rival's way past each fork for the whole race, about half by the branch
  // (forkCoin: dice of its own; forkChoice in checks and reference runs).
  if(this.forks)for(const r of this.rivals)r.routes=this.forks.map(R=>this.forkChoice?!!this.forkChoice(r.entry,R.index):forkCoin(this.raceSeed,r.entry.number,R.index)<FORK_SHARE);
  // One to four cars break down somewhere between 6% and 96% of the race, on dice of their own so
  // the race's other dice stay as they were. The ace never breaks: he is indestructible.
  if(this.retirements){
   const dice=random((this.raceSeed^0xAB0)>>>0),roll=dice(),count=roll<.3?1:roll<.65?2:roll<.87?3:4,pool=this.rivals.filter(r=>!r.style.ace);
   for(let k=0;k<count&&pool.length;k++){const r=pool.splice(Math.floor(dice()*pool.length),1)[0];r.breakdown={at:.06+.9*dice(),...BREAKDOWNS[Math.floor(dice()*BREAKDOWNS.length)]};}
  }
  // Fuel: planned at the race's first step, when its laps are known (planFuel).
  this.refuel=null;this.fuelFor=undefined;this.spotCars=new Map();this.crewReady??=null;
  this.onReset?.();
 }
 // A race longer than the tank holds (refuel: the tank, litres a metre at the table's pace, the burn's scale) starts
 // every rival on a full tank; each driver brings dice of its own for the lap it comes in, so the race's other dice
 // stay as they were. A shorter race (or practice) leaves the tank endless.
 planFuel(laps){
  this.fuelFor=laps;this.spotCars.clear();const id=circuitId(this.data.meta.id),tank=tankFor(id),L=this.data.meta.reconstructed_xy_m;
  this.refuel=this.route?.boxes.length&&Number.isFinite(laps)&&laps>0&&recommendedFuel(id,laps)>tank?{tank,perMetre:lapFuel(id)/L,scale:fuelScale(id,L)}:null;
  for(const r of this.rivals)Object.assign(r,{fuel:this.refuel?tank:undefined,fuelPass:null,service:false,stops:0,fuelDice:random((this.raceSeed^0xF0E1^Math.imul(r.rosterIndex+1,0x9E3779B1))>>>0)});
 }
 // The burn as the player's (fuel.js burnRate at the circuit's scale); dry on the track, the car is out.
 burn(r,input,dt){
  const c=r.car;r.fuel=Math.max(0,r.fuel-dt*burnRate(Math.hypot(c.vx,c.vy),input.throttle||0,c.rearSlipSpeed||0)*this.refuel.scale);
  if(!r.fuel&&!r.broken&&!r.pit)r.broken={kind:'pane seca',time:this.time,side:0,smokeLeft:0};
 }
 // At the pit entry, once a lap: in now? Not while what is left reaches the flag; at once when it would not last
 // another lap; otherwise on a lap the dice draw evenly among those left where one tank then reaches the flag.
 wantStop(r,toEntry,laps){
  const R=this.refuel,L=this.data.meta.reconstructed_xy_m,q=R.perMetre,D=Math.max(0,L*laps+this.gridLeadIn-r.progress-toEntry),F=r.fuel-q*toEntry;
  if(F-FUEL_RESERVE>=q*D)return false;
  const more=Math.max(0,Math.floor((F-FUEL_RESERVE)/(q*L)));
  if(!more)return true;
  if(q*D+FUEL_RESERVE>R.tank)return false;
  return r.fuelDice()<1/(more+1);
 }
 // A spot at the team's garage (pitRoute boxes): a free one, the one further down the lane only with the other free too
 // (going in there it would cross a car stopped below it); none free, the nearest free one at another team's garage.
 takeSpot(r){
  const boxes=this.route.boxes,own=boxes[r.rosterIndex]??boxes[0],taken=sp=>this.spotCars.has(sp);
  const pick=spots=>spots.find((sp,i)=>!taken(sp)&&!(i===0&&spots[1]&&taken(spots[1])));
  let spot=pick(own.spots);
  if(!spot){const u=own.spots[0].u;spot=[...new Set(boxes.map(b=>b.spots))].sort((a,b)=>Math.abs(a[0].u-u)-Math.abs(b[0].u-u)).map(pick).find(Boolean)??own.spots.at(-1);}
  this.spotCars.set(spot,r);return spot;
 }
 // The way out of a garage spot: a car coming down the lane close behind, or one standing right ahead in the working
 // lane (a shared garage's other spot), holds it in.
 laneTraffic(c,bodies){
  const fx=Math.cos(c.heading),fy=Math.sin(c.heading);
  for(const o of bodies){
   if(o===c||!o.surface?.pit)continue;const dx=o.x-c.x,dy=o.y-c.y,f=dx*fx+dy*fy,side=dy*fx-dx*fy;
   if(f<2&&f>-SERVICE_WAIT&&o.vx*fx+o.vy*fy>1&&Math.abs(side)<7||f>0&&f<10.5&&Math.abs(side)<2)return true;
  }
  return false;
 }
 // The refuelling stops under way (the garages, their crews and the checks): phase 'chegando', 'abastecendo', 'saindo';
 // pose: where the car stands at its spot (data x, y, heading); side: the garage's, 1 to the cars' left.
 pitStops(){
  return this.rivals.filter(r=>r.pit?.service).map(r=>{const P=r.pit,S=P.service,sp=P.slot,q=this.route.at(sp.u);
   return {number:r.entry.number,rosterIndex:r.rosterIndex,color:r.entry.color,car:r.car,spot:sp,bay:sp.bay,pose:{x:q.x-q.ty*sp.d,y:q.y+q.tx*sp.d,heading:Math.atan2(q.ty,q.tx)},side:Math.sign(sp.d-q.fast)||1,
    phase:S.leaving?'saindo':P.parked?'abastecendo':'chegando',wait:S.wait??null,time:S.time??null,litres:S.litres??null};});
 }
 step(player,dt,totalLaps=0){
  if(this.fuelFor!==totalLaps)this.planFuel(totalLaps);
  this.time+=dt;const impacts=[],commands=[],L=this.data.meta.reconstructed_xy_m,a=this.data.samples,n=a.length,line=this.line,ds=line.ds,t=this.time;
  const bodies=[player,...this.rivals.map(r=>r.car)],driverOf=new Map(this.rivals.map(r=>[r.car,r]));this.stepCars={bodies,driverOf,player};
  // Slipstream: in another car's wake the air resistance drops (physics reads car.draft). Not under a car on a
  // viaduct overhead, nor over one on the street below (physics.js sameLevel).
  for(const c of bodies){
   c.draft=0;const fx=Math.cos(c.heading),fy=Math.sin(c.heading);if(c.vx*fx+c.vy*fy<15)continue;
   for(const o of bodies){if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y,f=dx*fx+dy*fy,side=Math.abs(dy*fx-dx*fy);if(f>4&&f<35&&side<1.9&&sameLevel(c,o))c.draft=Math.max(c.draft,.38*(1-f/35)*(1-side/3.8));}
  }
  // One physics step for a rival, then its race distance and the flag. A car with nobody at the
  // wheel that gets there has run its race without its driver: AB for good (reclaim).
  const drive=(r,input)=>{const c=r.car;r.tow=c.draft;c.step(input,dt);commands.push(input);if(r.fuel!==undefined&&!r.finished)this.burn(r,input,dt);if(c.cliff&&trackFall(c,dt)==='back'){r.recover=0;r.blocked=0;}r.progress+=lapTravel(r.lastS,c.surface.s,L);r.lastS=c.surface.s;if(totalLaps&&!r.finished&&r.progress>=L*totalLaps+this.gridLeadIn){if(!r.retired){r.finished=true;r.finishTime=this.time;}else if(r.stop)r.stop.flagged=true;}};
  // A seat raced over the network (r.puppet, multiplayer.js) is placed, not driven: it returns the
  // pedals. The driverless cars on the road (caution) as they stand before the step (almost always
  // none: no list built then).
  this.cautions=this.rivals.some(r=>r.stop)?this.rivals.filter(r=>inTheWay(r.stop,r.car)):NO_CAUTIONS;
  for(const r of this.rivals){if(r.puppet){commands.push(r.puppet(r,dt));continue;}drive(r,r.car.fall?{...FAINTED}:r.stop?this.stopInput(r,dt):r.pit?this.pitInput(r,bodies,dt):this.decide(r,bodies,driverOf,player,dt,totalLaps));}
  // Split times: when each car first reached each of the race's sectors (classification).
  const me=this.playerRun;me.lastS??=player.surface.s;me.progress+=lapTravel(me.lastS,player.surface.s,L);me.lastS=player.surface.s;
  if(totalLaps&&Number.isFinite(totalLaps)){const split=L/SPLITS,last=totalLaps*SPLITS;for(const r of [me,...this.rivals]){const k=Math.min(last,Math.floor((r.progress-this.gridLeadIn)/split));while(r.splits.length<=k)r.splits.push(t);}}
  for(let iteration=0;iteration<4;iteration++)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   if(Math.abs((bodies[i].z??bodies[i].surface.z)-(bodies[j].z??bodies[j].surface.z))>1.6||apart(bodies[i],bodies[j]))continue;
   const hit=resolveContact(bodies[i],bodies[j]);if(!hit)continue;
   if(hit.speed>1.6&&this.time-(this.cooldowns.get(`${i}:${j}`)??-10)>.35){this.cooldowns.set(`${i}:${j}`,this.time);this.collisions++;impacts.push({...hit,player:i===0});for(const k of [i,j])if(k>0&&!this.rivals[k-1].style.ace)this.rivals[k-1].stun=Math.min(1.5,hit.speed*.06);}
  }
  for(const c of bodies){c.surface=c.sample(c.x,c.y);c.index=c.surface.i;}
  if(this.onStep)this.rivals.forEach((r,i)=>this.onStep(r,i,commands[i],dt));
  return impacts;
 }
 // The recon lap's driver for the player's car: the same racecraft as the rivals, a hero's style
 // and dice of its own. Call once per physics step, before step().
 heroInput(car,dt,style=HERO_STYLE){
  if(this.hero?.car!==car||this.hero.style!==style){
   const rand=random((this.raceSeed^0x99)>>>0),pick=(lo,hi)=>lo+(hi-lo)*rand(),rating=HERO_RATING;
   this.hero={car,entry:{number:'99',rating},style,random:rand,progress:0,lastS:car.surface.s,finished:false,stun:0,
    lineUse:clamp(style.lineUse*pick(.97,1.02),.8,1),apex:style.apex,
    wander:{amp:pick(.08,.3)*(1.4-rating),rate:pick(.06,.14)*2*Math.PI,phase:pick(0,2*Math.PI)},
    rhythm:{amp:.01+.035*(1-style.consistency)*(1.4-rating),rates:[pick(.04,.09),pick(.11,.23)].map(f=>f*2*Math.PI),phases:[pick(0,2*Math.PI),pick(0,2*Math.PI)]},
    reaction:.15+pick(0,.4)*(1.3-rating),merge:pick(1.2,2.5),form:1,lap:-1,day:1,
    lane:car.surface.d,blend:1,blendTarget:1,mode:'line',rival:null,passSide:0,modeTime:0,cooldown:1,defended:-1,rolled:-1,mistake:null,brakePedal:0,mistakes:0,passes:0,stuck:0,pit:null,yieldSide:0,yieldTime:0};
  }
  return this.decide(this.hero,[car,...this.rivals.map(r=>r.car)],new Map(this.rivals.map(r=>[r.car,r])),car,dt,0);
 }
 // One driver's steering and pedals for this step: speed plan, racecraft, mistakes and recovery.
 // A driver may bring its own seeded dice (r.random) so it leaves the field's race untouched.
 decide(r,bodies,driverOf,player,dt,totalLaps){
  // The way it drives by (view: the lap, or on a track with branch roads the lap with the branch it takes in it): the
  // stations, the line and everyone's place on it (F; null for a car on another road of a fork: not in its way).
  // (crest: on a branch's own stations, the speed it can take over the crests of its profile without taking off.)
  const V=this.view(r),F=V.F,L=this.data.meta.reconstructed_xy_m,a=V.a,n=a.length,line=V.line,crest=line.crest,ds=line.ds,t=this.time,rand=r.random??this.random;
   const c=r.car,st=r.style,here=F(c),i=V.plain?c.index:here.i,d=here.d,speed=Math.hypot(c.vx,c.vy),along=c.vx*here.tx+c.vy*here.ty,fx=Math.cos(c.heading),fy=Math.sin(c.heading);
   const lap=Math.floor(Math.max(0,r.progress-this.gridLeadIn)/L),VL=V.L;
   // Past its breakdown point (reset, retirements) the car is out of the race: off to the grass (once off a branch
   // road: there it is walled in, and the grass is the lap's).
   const walled=!V.plain&&(c.surface.branch!=null||!!V.fork?.inFork(i));
   if(r.breakdown&&!r.broken&&!r.finished&&totalLaps&&r.progress-this.gridLeadIn>=r.breakdown.at*totalLaps*L&&!walled)r.broken={...r.breakdown,time:t,side:0,smokeLeft:r.breakdown.smoke};
   if(r.broken)return this.brokenInput(r,dt);
   // A clean driver's lap (the ace, levels above Fácil): the best he can do only now and then, most
   // laps a few tenths to two seconds off it (the pilots: "1:51, 1:52, 1:53, then 1:51 again"). The
   // lap's pace scales his braking and how much of the engine's edge he uses, and on a slower lap his grip
   // (never above his style's: at the ace's grip the car is at its limit).
   if(lap!==r.lap){r.lap=lap;const u=rand();if(st.clean){r.pace=LAP_PEAK-(LAP_SPREAD+.04*(1-st.consistency))*u*(1-TITLE_PACE*(r.stake??0));r.form=r.day*Math.min(1,r.pace);c.engineScale=1+(st.engineScale-1)*r.pace**8;}else r.form=r.day*(1+(u-.5)*.03*(1.4-st.consistency));}
   r.cooldown=Math.max(0,r.cooldown-dt);r.modeTime+=dt;
   // The ace keeps his move lanes 60 cm further off the edges: at the limit a car can overshoot.
   const wander=r.wander.amp*Math.sin(t*r.wander.rate+r.wander.phase),edge=st.clean?.6:0,fit=(v,k)=>clamp(v,line.laneLo[k]+edge,line.laneHi[k]-edge);
   // Planned offset at sample k: the personal racing line, blended toward a chosen lane.
   const own=k=>clamp(r.lineUse*line.off[(k-r.apex+n)%n]+wander,line.lo[k],line.hi[k]);
   const plan=k=>{const base=own(k);return base+(fit(r.lane,k)-base)*r.blend;};
   // Who is around, with gaps along the track: ahead in our path, behind, alongside.
   let ahead=null,behind=null,emergency=0;const beside=[];
   for(const o of bodies){
    if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y;if(Math.abs(dx)+Math.abs(dy)>150)continue;
    const f=F(o);if(!f)continue;
    const gap=lapTravel(here.s,f.s,VL),od=f.d,ov=o.vx*f.tx+o.vy*f.ty;
    if(Math.abs(gap)<5.4&&Math.abs(od-d)<4)beside.push({o,gap,od,v:ov});
    // The ace also reads where a car ahead is heading: one crossing toward his path by the time he
    // gets there (turning in for its apex) is already in it. The car he is passing is the move's own
    // business (the pass checks below).
    let path=Math.abs(od-plan(f.i));
    if(st.clean&&gap>4.4&&path>=2.1&&!(r.mode==='pass'&&o===r.rival)&&along>ov+.5){const drift=(o.vx*f.lx+o.vy*f.ly)*Math.min(1.2,(gap-4.4)/(along-ov)),p=plan(f.i),lo=Math.min(od,od+drift),hi=Math.max(od,od+drift);path=p<lo?lo-p:p>hi?p-hi:0;}
    // Until he is out from behind a car (moving over to pass it, say), it is still in his way.
    if(st.clean&&gap<25)path=Math.min(path,Math.abs(od-d));
    if(gap>4.4&&gap<120&&path<2.1&&(!ahead||gap<ahead.gap))ahead={o,gap,od,v:ov};
    if(gap<-4.4&&gap>-40&&(!behind||gap>behind.gap))behind={o,gap,od,v:ov};
    // Last-moment braking for a slower body right in front; contacts handle the rest.
    const forward=dx*fx+dy*fy,side=dy*fx-dx*fy,relative=speed-(o.vx*fx+o.vy*fy);
    // (The ace only for a car he is closing on: one pulling away is no reason to lift. Nor for one on another
    // level where the lap passes over itself: physics.js sameLevel.)
    const bumper=st.clean&&r.go&&r.weighed===lap*1000+line.cornerAt[i]?4.5+Math.max(0,relative)*.7:6+Math.max(0,relative)*.8;
    if(forward>0&&forward<bumper&&Math.abs(side)<2&&!(st.clean&&relative<.5)&&sameLevel(c,o))emergency=Math.max(emergency,clamp((7+relative-forward)/7,.2,1));
   }
   const corner=line.cornerAt[i],bend=line.corners[corner],toCorner=line.cornerDist[i];
   const attack=!!ahead&&ahead.gap<Math.max(12,along*1.1),pressured=!!behind&&behind.gap>-Math.max(8,along*.5);
   if(r.mistake&&r.mistake.corner!==corner)r.mistake=null;
   // Once per braking zone a driver may misjudge it, more so under pressure or on the attack:
   // brakes too late or carries too much speed, and runs wide.
   if(bend&&corner!==r.rolled&&toCorner<140&&toCorner>40&&speed>22&&!r.finished&&!st.ace){
    const hunter=pressured&&st.clean?driverOf.get(behind.o):null,gives=hunter?Math.max(0,hunter.entry.skill-(r.entry.skill??PLAYER_SKILL)):0;
    r.rolled=corner;const chance=(st.errors??(.006+.03*(1-r.entry.rating)))*(pressured?1.7*(1+PRESSURE_SKILL*gives):1)*(attack?1+.6*st.aggression:1);
    if(rand()<chance){
     // Either a hesitant corner (early braking, lost time) or an overcooked one that runs wide.
     // A clean driver's hesitation is a smaller lift.
     const over=rand()<.55?(st.clean?-.2:-.35):.35+.45*rand();r.mistake={corner,grip:st.cornerGrip+(12.2-st.cornerGrip)*over,brake:st.braking+(12.5-st.braking)*over};r.mistakes++;
    }
   }
   // Speed plan: every bend ahead on the planned path caps the speed through the braking curve.
   // On the attack a driver pushes a little; alongside in a move they brake later still.
   const m=r.mistake,rh=r.rhythm,wobble=rh.amp*(.6*Math.sin(t*rh.rates[0]+rh.phases[0])+.4*Math.sin(t*rh.rates[1]+rh.phases[1])),push=(attack?st.aggression:0)+(r.mode==='pass'?1+st.aggression:0);
   // The ace is already at the limit: a move asks only a little more of him, and a move round the
   // outside of the corner ahead leaves him a margin instead (the car drifts out as it gets there).
   const outside=st.clean&&r.mode==='pass'&&!!bend&&r.passSide===-bend.dir,pushGrip=st.clean?(outside?0:.006):.02,pushBrake=st.clean?(r.mode==='pass'?PASS_BRAKE:.025):.05;
   // The style's grip and braking are an Opala's: a car with stickier tyres (physics.js mechanics) corners and brakes harder.
   const tyres=(c.mechanics?.grip??1)*(c.weatherGrip??1),grip=(m?m.grip:st.cornerGrip*r.form*(1+wobble)*(1+pushGrip*push)*(outside?.97:1))*tyres,braking=(m?m.brake:st.braking*(1+1.5*wobble)*(1+pushBrake*push)*(st.clean?r.pace:1))*tyres;
   // Bend of the planned path at sample k. A parallel lane bends tighter on the inside
   // (curvature / (1 - curvature * offset)); banking helps.
   // (laneCentre: a clean driver reads a lane's bend off the edges where the road only changes width; Fácil keeps the centre's.)
   const cen=st.clean?line.laneCentre:line.centre,bendAt=k=>{const cl=cen[k],mine=r.lineUse*line.curve[(k-r.apex+n)%n]+(1-r.lineUse)*cl;return mine+(cl/Math.max(.5,1-cl*fit(r.lane,k))-mine)*r.blend;};
   // maxSpeed is a style target, not a limiter: engine, drag and the tow decide the straights.
   let target=st.maxSpeed*r.form*1.12,bindV=target,bindDist=0,planNeed=0,slow=null;
   if(st.ellipse){
    // Friction ellipse, walked back from the far end of the view: each metre of braking shares the
    // tyres with the cornering there, so the brakes ease off as the wheel goes in (trail braking)
    // and a straight braking zone gets the full pedal right up to the turn-in. Slopes count, and so
    // does the path's own length (shorter on the inside of a bend). planNeed is the deceleration
    // the plan asks for a blink ahead (react), for the pedal; slow is the slowest point in view.
    const count=Math.min(n-3,Math.ceil((speed*speed/(2*braking)+40)/ds)),lead=Math.min(count-2,Math.round(speed*st.react/ds));let v=Infinity,next=Infinity,slowV=Infinity,slowJ=0;
    for(let j=count;j>=0;j--){
     // Where the plan lies further across than the car can move by then (about 0.15 m per metre),
     // the car is still on a lane nearer its own: that lane's bend counts if it is tighter.
     const k=(i+j)%n,want=plan(k),room=.3+.15*j*ds,on=clamp(d,line.laneLo[i],line.laneHi[i]),off=clamp(want,on-room,on+room);let kap=bendAt(k);
     if(Math.abs(off-want)>.4){const cl=cen[k],lane=cl/Math.max(.5,1-cl*off);if(Math.abs(lane)>Math.abs(kap))kap=lane;}
     const lateral=Math.max(2,grip-G*Math.sign(kap)*a[k][5]),length=ds*Math.max(.5,1-line.centre[k]*want),vc=crest?Math.min(crest[k],Math.sqrt(lateral/Math.max(Math.abs(kap),1e-4))):Math.sqrt(lateral/Math.max(Math.abs(kap),1e-4));
     if(v<Infinity){const use=Math.min(1,v*v*Math.abs(kap)/lateral);v=Math.sqrt(Math.max(0,v*v+2*length*(braking*Math.sqrt(1-use*use)+G*a[k][6])));}
     v=Math.min(v,vc);if(vc<slowV){slowV=vc;slowJ=j;}
     if(j===lead+2)next=v;
     if(j===lead)planNeed=Math.max(0,(v*v-next*next)/(4*ds));
    }
    target=Math.min(target,v);
    const spot=(i+slowJ)%n;slow={v:slowV,dist:slowJ*ds,dir:Math.sign(line.curve[spot])||1,corner:line.cornerAt[spot]};
   }
   else for(let j=0,reach=speed*speed/(2*braking)+30;j*ds<reach&&j<n;j+=2){
    const k=(i+j)%n,kap=bendAt(k),lateral=Math.max(2,grip-G*Math.sign(kap)*a[k][5]);
    const vc=crest?Math.min(crest[k],Math.sqrt(lateral/Math.max(Math.abs(kap),1e-4))):Math.sqrt(lateral/Math.max(Math.abs(kap),1e-4)),dist=Math.max(0,j*ds-speed*.12),limit=Math.sqrt(vc*vc+2*braking*dist);
    if(limit<target){target=limit;bindV=vc;bindDist=dist;}
   }
   const free=target;
   // For the ace: a real braking zone in view (his plan sheds more than about 10 km/h there).
   const zone=!!st.clean&&slow.v<speed-3;
   // (Central #21) The braking point ahead and the move weighed for it, once (WEIGH): against a man he was just passed by
   // keener, the more so the stronger he is; at the player keener for the best.
   const brakePoint=zone?slow.dist-Math.max(0,speed*speed-slow.v*slow.v)/(2*braking):Infinity,weigh=lap*1000+corner;
   if(st.clean&&ahead&&ahead.gap<WEIGH_GAP&&toCorner>20&&toCorner<Math.max(80,along*WEIGH)&&r.mode==='line'&&r.weighed!==weigh){
    const foe=driverOf.get(ahead.o),theirs=foe?foe.entry.skill:PLAYER_SKILL,mine=r.entry.skill??PLAYER_SKILL,back=r.revenge?.on===ahead.o&&t<r.revenge.until;
    r.weighed=weigh;r.go=rand()<commitChance(mine,theirs,st.aggression,(back?.25+.05*(mine-theirs):0)+(ahead.o===player&&mine>=8?.2:0)+TITLE_PUSH*(r.stake??0));
   }
   const committed=st.clean&&!!r.go&&r.weighed===weigh;
   // On a straight they tuck into the tow; into corners they leave their own margin (not a clean driver set on a move).
   const g0=committed&&r.mode!=='pass'?4.5+Math.max(0,along)*.04:4.9+Math.max(0,along)*st.followTime*(r.mode==='pass'?.4:bend&&toCorner<150?1:st.clean?.3:.5),closing=ahead?along-ahead.v:0;
   // Held up: close behind a car slower than this driver would go here.
   r.stuck=ahead&&ahead.gap<g0+4&&free>ahead.v+1?(r.stuck??0)+dt:Math.max(0,(r.stuck??0)-2*dt);
   // A refuelling stop (planFuel): looked at once a lap as the pit entry comes into view (wantStop), then over to the
   // pit side and down to the lane's pace by the entry, where pitInput takes the car to its garage.
   const R0=this.route,toPit=r.fuel!==undefined&&!r.finished&&R0?((R0.entryS-c.surface.s)%L+L)%L:Infinity;
   if(toPit<INLAP_MERGE){const pass=Math.round((r.progress+toPit)/L);if(r.fuelPass!==pass){r.fuelPass=pass;r.service=this.wantStop(r,toPit,totalLaps);}}
   if(r.finished&&totalLaps){
    // Past the flag the driver eases off (about 2.5 m/s²) rather than braking in front of the pack.
    if(r.mode!=='line')Object.assign(r,{mode:'line',rival:null});target=Math.min(target,COOL_PACE+Math.max(0,32-2.5*(t-r.finishTime)));
    const R=this.route,toEntry=R?((R.entryS-c.surface.s)%L+L)%L:Infinity;
    // In-lap: over to the pit side before the entry, then down the lane (pitInput).
    if(toEntry<INLAP_MERGE){r.lane=R.entryD;r.blendTarget=1;if(toEntry<6+speed*.3)r.pit={k:0,u:-toEntry,slot:R.slots[Math.min(this.nextSlot++,R.slots.length-1)],parked:false};}
    else{
     // Blue flag: with a car still racing close behind, keep to the side of the road away
     // from the racing line ahead until it has gone by.
     let chased=false;for(const o of bodies){if(o===c||driverOf.get(o)?.finished)continue;const f=F(o);if(!f)continue;const gap=lapTravel(here.s,f.s,VL);if(gap<-3&&gap>-70&&Math.abs(f.d-d)<12)chased=true;}
     if(chased&&!r.yieldSide){let sum=0;for(let j=0;j<40;j++)sum+=line.off[(i+j)%n];r.yieldSide=Math.abs(sum)>24?-Math.sign(sum):Math.sign(d)||1;}
     r.yieldTime=chased?2.5:Math.max(0,r.yieldTime-dt);if(!r.yieldTime)r.yieldSide=0;
     // A metre inside the lane limit on that side: on the main straight the pit wall and its
     // ends stand right at the edge, and a car easing over at an angle would clip them.
     let limit=Infinity;if(r.yieldSide)for(let j=0;j<30;j++){const q=(i+j)%n;limit=Math.min(limit,r.yieldSide>0?line.laneHi[q]:-line.laneLo[q]);}
     r.lane=r.yieldSide?r.yieldSide*Math.max(0,limit-1):0;r.blendTarget=r.yieldSide?1:0;
    }
   }
   else if(r.service&&toPit<INLAP_MERGE){
    Object.assign(r,{mode:'line',rival:null,lane:R0.entryD,blendTarget:1});target=Math.min(target,Math.sqrt(PIT_PACE*PIT_PACE+2*6*Math.max(0,toPit-15)));
    if(toPit<6+speed*.3){r.service=false;r.stops++;r.pit={k:0,u:-toPit,slot:this.takeSpot(r),parked:false,service:{laps:totalLaps}};}
   }
   else{
    if(r.mode==='line')r.blendTarget=t<r.merge?1:0;
    // Attack when closing (a tow, a better exit) or after being held up for a while. Near a corner
    // only the inside works, and it must start before the braking zone; either side on a straight.
    // Take a lane with room for a whole car and hold it.
    // A stopped or crawling car is an obstacle: go round it on whichever side is free.
    const obstacle=!!ahead&&ahead.v<6&&ahead.gap<35,near=bend&&toCorner<150&&!obstacle,late=near&&toCorner<40&&!(ahead&&ahead.gap<6);
    // The ace reads his moves off his own plan instead of the corner map (in the infield one bend
    // runs into the next, and "near a corner" never ends). Into a braking zone he dives for the
    // inside while he can still get alongside before the turn-in: at the closing speed plus what
    // braking later gains (about 3 m/s), before the last 15 m to the slow point. With no braking
    // close ahead, either side out of the tow. Only the car he is passing and those just beyond
    // it can close the lane.
    const inTime=!zone||!ahead||ahead.gap-2<(Math.max(0,closing)+3)*(slow.dist-15)/Math.max(along,1);
    const want=!!ahead&&(ahead.gap<g0+6&&(closing>(st.clean?.3:.8)||r.stuck>1.3*(1.4-st.aggression))||ahead.gap<st.passDistance&&closing>(st.clean?3:4)||obstacle);
    // (Central #21: the tow first, then the move as weighed, see WEIGH.)
    const rush=obstacle||closing>BIG_CLOSING&&!zone&&!near&&!!ahead&&ahead.gap<WEIGH_GAP,pounce=!!ahead&&(rush?want:committed&&toCorner>15&&brakePoint>8&&(ahead.gap<PULL_GAP||ahead.gap<POUNCE_GAP&&brakePoint<Math.max(45,along*POUNCE)));
    if(r.mode!=='pass'&&r.mode!=='room'&&r.cooldown===0&&(st.clean?pounce&&inTime:want&&!late)){
     const view=st.clean?clamp(Math.round(Math.min(slow.dist,90)/ds),8,44):44;
     let low=-Infinity,high=Infinity;for(let j=0;j<view;j+=4){const q=(i+j)%n;low=Math.max(low,line.laneLo[q]);high=Math.min(high,line.laneHi[q]);}
     // Near a bend only the inside will do. For the ace that is a braking zone, or a corner within
     // 80 m; round the outside of a fast one (no braking) only from where he already is, never
     // across the road mid-corner.
     const heavy=zone&&slow.dist<90,inside=st.clean?(obstacle?0:heavy?slow.dir:bend&&toCorner<80?bend.dir:0):near?bend.dir:0,pref=inside||(Math.abs(ahead.od)>.8?-Math.sign(ahead.od):st.passSide);
     for(const side of inside&&!(st.clean&&!heavy)?[pref]:[pref,-pref]){
      const lane=clamp(ahead.od+side*2.8,low,high);if(Math.abs(lane-ahead.od)<2.3||st.clean&&inside&&side!==inside&&Math.abs(lane-d)>3)continue;
      if(bodies.some(o=>{if(o===c||o===ahead.o)return false;const f=F(o);if(!f)return false;const gap=lapTravel(here.s,f.s,VL);return gap>(obstacle?0:-8)&&gap<ahead.gap+(st.clean?8:20)&&Math.abs(f.d-lane)<2.2;}))continue;
      Object.assign(r,{mode:'pass',rival:ahead.o,passSide:side,lane,blendTarget:1,modeTime:0});r.attacks=(r.attacks??0)+1;break;
     }
     if(r.mode!=='pass')r.cooldown=.5;
    }
    if(r.mode==='pass'){
     // Keep the chosen lane; only move further over if the rival drifts toward us. (A rival gone off onto another road
     // of a fork is lost.)
     const o=r.rival,f=F(o);
     if(!f)Object.assign(r,{mode:'line',rival:null,blendTarget:0,cooldown:st.passCooldown,stuck:0});
     else{
      const gap=lapTravel(here.s,f.s,VL),ov=o.vx*f.tx+o.vy*f.ty,clearOf=f.d+r.passSide*2.6;
      r.lane+=clamp(fit(r.passSide>0?Math.max(r.lane,clearOf):Math.min(r.lane,clearOf),i)-r.lane,-st.laneRate*1.5*dt,st.laneRate*1.5*dt);
      const done=gap<-5.5,shut=gap>4.2&&Math.abs(r.lane-f.d)<2.1,fading=gap>10&&along<ov-1.5,lost=gap>st.passDistance+15||r.modeTime>12;
      if(done||shut||fading||lost){if(done)r.passes++;const why=done?'done':shut?'shut':fading?'fading':'lost';(r.ended??={})[why]=(r.ended[why]??0)+1;
       const victim=driverOf.get(o);if(done&&victim?.style.clean&&!victim.style.ace)Object.assign(victim,{revenge:{on:c,until:t+REVENGE},cooldown:0});if(st.clean)r.go=false;Object.assign(r,{mode:'line',rival:null,blendTarget:0,cooldown:done?1:st.passCooldown,stuck:0});}
     }
    }
    // Leaving room (the ace, below): keep a car's width outside the attacker until one of them is clear.
    if(r.mode==='room'){const o=r.roomFor,f=F(o),gap=f?lapTravel(here.s,f.s,VL):Infinity;if(f)r.lane=f.d-r.passSide*(CAR_GAP+.4);if(Math.abs(gap)>6||r.modeTime>5)Object.assign(r,{mode:'line',roomFor:null,blendTarget:0});}
    // Defence: with a car close behind before a braking zone, cover the inside, once per corner.
    // The ace covers only a real braking zone, from a car close and quick enough to try, half-way.
    if(st.clean){
     if(r.mode==='line'&&behind&&zone&&slow.dist>30&&slow.dist<150&&slow.corner!==r.defended&&behind.gap>-9&&behind.v>along-.5){
      const foe=behind.o===player?null:driverOf.get(behind.o),cover=foe?defendChance(st.defend,r.entry.skill??PLAYER_SKILL,foe.entry.skill??PLAYER_SKILL):st.defend;
      r.defended=slow.corner;if(rand()<cover)Object.assign(r,{mode:'defend',lane:.6*(slow.dir>0?line.laneHi[i]:line.laneLo[i]),blendTarget:.5,modeTime:0});
     }
     if(r.mode==='defend'&&(!zone||slow.dist<10||slow.corner!==r.defended||r.modeTime>6))Object.assign(r,{mode:'line',blendTarget:0});
    }
    else{
     if(r.mode==='line'&&behind&&bend&&toCorner>30&&toCorner<150&&corner!==r.defended&&behind.gap>-15&&behind.v>along-2){
      r.defended=corner;if(rand()<st.defend)Object.assign(r,{mode:'defend',lane:.6*(bend.dir>0?line.laneHi[i]:line.laneLo[i]),blendTarget:.35+.5*st.defend,modeTime:0});
     }
     if(r.mode==='defend'&&(corner!==r.defended||toCorner<8||r.modeTime>6))Object.assign(r,{mode:'line',blendTarget:0});
    }
   }
   const spread=Math.max(1.2,Math.abs(fit(r.lane,i)-own(i))),rate=st.laneRate*(r.mode==='pass'?1.6:1)/spread;
   r.blend+=clamp(r.blendTarget-r.blend,-rate*dt,rate*dt);
   // A car we cannot pass yet: close up no faster than we could brake to its speed, then sit at
   // the driver's own following distance, in the tow.
   const follow=ahead?ahead.v+(st.clean?Math.max(0,ahead.o.longAccel??0)*FOLLOW_LEAD:0)+Math.sqrt(2*.6*braking*Math.max(0,ahead.gap-g0))-Math.max(0,g0-ahead.gap):Infinity;if(ahead)target=Math.min(target,follow);
   // A clean driver watches the brake lights too: behind a car in his path that is really braking
   // (more than lifting off or cornering takes) he keeps the distance to slow a metre off its bumper,
   // taking it to brake hard (a car on the brakes soon brakes hard). Behind another clean driver, down
   // to 80% of the slowest speed in his own view: the corner it brakes for, or one just past his view
   // (assuming a stop had Médio's field braking on the straights behind every braking car). Behind a
   // car that may brake early by mistake (Fácil's drivers, the player): to a little under the corner
   // ahead, or to a stop with no corner in view (the 80% rule doubled the ace's contacts among them).
   const seen=st.clean&&ahead?-(ahead.o.longAccel??0):0,hard=Math.max(seen,8),until=!st.clean?0:driverOf.get(ahead?.o)?.style.clean?.8*slow.v:zone?.85*slow.v:0;
   if(st.clean&&ahead&&seen>4)target=Math.min(target,Math.sqrt(until*until+2*.9*braking*(Math.max(0,ahead.gap-5.8)+Math.max(0,ahead.v*ahead.v-until*until)/(2*hard))));
   // Steering: pure pursuit of the planned path, never into a car alongside.
   const look=7+speed*st.lookAhead*.6,k=(i+Math.round(look/ds))%n,low=line.laneLo[k]-.3,high=line.laneHi[k]+.3;let aim=plan(k);
   for(const b of beside){
    const side=Math.sign(b.od-d)||1,limit=b.od-side*CAR_GAP;if(side>0?aim>limit:aim<limit)aim=limit;
    // Squeezed against the edge by a car that is ahead: back out of it (the car behind yields).
    // (The ace backs out only for a car at least half a length ahead.)
    if(aim<low||aim>high){aim=clamp(aim,low,high);if(b.gap>(st.clean?2:.5)&&speed>4)target=Math.min(target,Math.max(b.v-1.5,b.v*.9));}
    // Racing etiquette: a car alongside on the inside of the corner, with its nose level or
    // ahead of our middle, has the corner. The player earns the same room as an attacking rival.
    const attacker=b.o===player||driverOf.get(b.o)?.rival===c;
    if(!st.clean&&attacker&&bend&&toCorner<60&&side===bend.dir&&b.gap>-2.5&&speed>8)target=Math.min(target,b.v-.8);
    // The ace gives room, not the corner: an attacker who has earned the inside (front axle up to
    // his mirror, about a metre behind his centre) gets a car's width, and the ace races on round
    // the outside at the speed that lane allows, instead of braking below the attacker's pace.
    if(st.clean&&attacker&&zone&&slow.dist<70&&side===slow.dir&&b.gap>-1&&r.mode!=='room'&&speed>8)Object.assign(r,{mode:'room',rival:null,roomFor:b.o,passSide:side,lane:b.od-side*(CAR_GAP+.4),blendTarget:1,modeTime:0});
   }
   // Rejoin a distant line at a shallow angle (about 7 degrees), never with a swerve.
   const reach=1+.12*look;aim=clamp(aim,d-reach,d+reach);
   const p=a[k],dx=p[1]+p[9]*aim-c.x,dy=p[2]+p[10]*aim-c.y,alpha=wrap(Math.atan2(dy,dx)-c.heading),away=Math.abs(alpha)>Math.PI/2;
   // After a spin the path can lie behind: turn round on full lock, slowly.
   const turn=away?Math.sign(alpha):clamp(Math.atan2(2*WHEELBASE*Math.sin(alpha),Math.hypot(dx,dy))/steerLimit(speed,(c.mechanics?.grip??1)*(c.weatherGrip??1)),-1,1);
   if(away)target=Math.min(target,6);
   // Off the asphalt the ace eases off until the tyres are back on it.
   if(st.clean&&!here.onRoad&&!here.pit)target=Math.min(target,Math.max(12,speed-1));
   // Yellow flag: a car without its driver still on the road ahead (stopInput).
   target=Math.min(target,this.caution(c,V));
   // Pedals: proportional to the speed error, plus the deceleration the braking curve asks for.
   const slide=along>3?Math.abs(Math.atan2(-c.vx*fy+c.vy*fx-1.117*c.yaw,c.vx*fx+c.vy*fy)):0,need=bindDist>1&&speed>bindV?(speed*speed-bindV*bindV)/(2*bindDist):0;
   let throttle=clamp((target-speed)*st.throttleResponse,0,1)*clamp(1-(slide-.06)*8,0,1);
   // The ace's pedal gives the plan's deceleration less what drag, rolling and the engine already take.
   const feed=st.ellipse?(target===free&&planNeed>1&&speed>target-1?(planNeed-.6-.00043*speed*speed)/BRAKE_FULL:0):target===free&&need>2&&speed>target-1?(need-1.5)/BRAKE_FULL:0;
   let brake=clamp((speed-target)*st.brakeResponse+feed,0,1);
   // A clean driver held up on a straight (no braking zone in view) lifts instead of braking: the
   // brake lights stay off, and a pass or the last-moment brake (emergency) deal with a closing car.
   if(st.clean&&!zone&&ahead&&target===follow)brake=0;
   // A released pedal is exactly zero: at rest any brake holds the car (physics hold).
   r.brakePedal+=(brake-r.brakePedal)*(1-Math.exp(-dt*(5+st.brakeResponse*10)));if(r.brakePedal<.005)r.brakePedal=0;
   const input={left:Math.max(0,turn),right:Math.max(0,-turn),throttle,brake:r.brakePedal,reverse:0,handbrake:0};
   if(input.brake>.08)input.throttle=0;
   if(emergency){input.throttle=0;input.brake=Math.max(input.brake,emergency);}
   r.stun=Math.max(0,r.stun-dt);if(r.stun>0){input.throttle=0;input.brake=Math.max(input.brake,.2);}
   // Lights out: each driver reacts in their own time; until then the car is held on the brake.
   if(t<r.reaction){input.throttle=0;input.brake=1;}
   // Wedged against a wall or a car while wanting to go: back out with the wheels turned so the
   // nose swings toward the line, then drive on.
   r.blocked=speed<1.5&&target>4&&t>r.reaction+1?(r.blocked??0)+dt:0;
   if(r.blocked>2.5){r.recover=1.2+rand();r.blocked=0;}
   if(r.recover>0){r.recover-=dt;Object.assign(input,{reverse:1,throttle:0,brake:0,left:alpha<0?1:0,right:alpha>0?1:0});}
   return input;
 }
 // A broken car: no more drive (or none worth racing on). It eases over to the edge on the side with
 // grass and no wall (the nearer one), slows along it (gently: the cars behind need room to react),
 // and below about 80 km/h turns onto the grass where the next 30 m past the edge are clear, rolling on
 // along the edge until they are; it stops a few metres past the edge for the rest of the race.
 // Leaving the road faster, it slid 20 m into the infield; picking the spot too early, into a wall.
 brokenInput(r,dt){
  const c=r.car,b=r.broken,here=c.surface,i=c.index,speed=Math.hypot(c.vx,c.vy);
  r.retired=true;Object.assign(r,{mode:'line',rival:null});
  if(!b.side){b.side=this.parkSide(c,[15,30,45,60,75]);b.from=r.progress;}
  const fast=speed>22;
  if(!b.exit&&!fast&&(r.progress-b.from>800||[8,18,28].every(j=>this.grassAt(c,i,b.side,j))))b.exit=true;
  const look=6+speed*.5,turn=this.pursuit(c,look,p=>b.side*(b.exit?p[4]/2+PARK_OFF:p[4]/2-1.2),1+.15*look);
  const off=!here.onRoad&&!here.pit&&Math.abs(here.d)>here.width/2,parked=off&&Math.abs(here.d)>here.width/2+PARK_OFF-1;
  b.smokeLeft=Math.max(0,b.smokeLeft-(parked&&speed<.5?dt:0));
  if(parked&&speed<.5)return HELD;
  // Along the edge it limps at walking pace or a little more until a clear spot comes.
  return {left:Math.max(0,turn),right:Math.max(0,-turn),throttle:!off&&speed<(b.exit?5:9)?.3:0,brake:parked?.8:off?.5:fast?.3:!b.exit&&speed>12?.12:0,reverse:0,handbrake:0};
 }
 // A car nobody drives any more (r.stop, set by multiplayer.js when a guest's line drops; no bot takes
 // it): 'parado', as if its driver had fainted (the players' idea): off the throttle, no brake, the wheel
 // let go, it rolls on. Down to a crawl (TOW_SLOW) it is stopped: clear of the road (the next bend often
 // takes it into the grass) it is left there ('fora'), and in the pit lane too (out of the race's way
 // already, and walled: no grass to pull it to); on the road the tow truck comes ('reboque'), passes it
 // and hooks it (TOW_ARRIVE), then pulls it along its way (towPath) onto the grass.
 stopInput(r,dt){
  const c=r.car,S=r.stop,here=c.surface,speed=Math.hypot(c.vx,c.vy);
  S.time=(S.time??0)+dt;
  if(S.stage==='parado'){
   S.still=speed<TOW_SLOW?(S.still??0)+dt:0;
   if(S.still<1.5)return faintedInput(c);
   const off=!here.onRoad&&!here.pit&&Math.abs(here.d)>here.width/2+1;
   if(off||here.pit)Object.assign(S,{stage:'fora',time:0});else Object.assign(S,{stage:'reboque',time:0,side:this.towPath(c).side});
   return HELD;
  }
  if(S.stage!=='reboque'||S.time<TOW_ARRIVE)return HELD;
  // On the strap: the car goes where the truck has it on its way (its way worked out again from where
  // the car came to rest), at the truck's pace, laid on the ground (settle); a car hooked by its tail
  // turns round as the strap takes it. At the end of the way, on the grass, it is let go; at the edge
  // (no grass in reach) it stays the tow's.
  if(!S.path)Object.assign(S,{path:this.towPath(c,S.side),u:0});
  const P=S.path,pace=Math.min(S.u>=P.end-14?TOW_TURN_PACE:TOW_PACE,(S.time-TOW_ARRIVE)*1.5);S.u=Math.min(P.end,S.u+pace*dt);
  const p=P.at(S.u),heading=P.h0+wrap((P.flip?p.heading+Math.PI:p.heading)-P.h0)*smooth(S.u/6),moving=S.u<P.end;
  Object.assign(c,{x:p.x,y:p.y,heading,vx:moving?Math.cos(p.heading)*pace:0,vy:moving?Math.sin(p.heading)*pace:0,yaw:0});c.settle();
  if(moving)return FAINTED;
  if(P.park)Object.assign(S,{stage:'fora',time:0});
  return HELD;
 }
 // The tow's way from where the car stands (stopInput; multiplayer.js draws its truck on it, each window
 // working it out from the car as it shows it): down the track to the first clear stretch of grass past
 // the edge within TOW_REACH (grassAt), on the side given or else the nearer of the two, over to that
 // edge first (TOW_EDGE: just inside it, out of the race's way) and onto the grass at the end, PARK_OFF
 // past the edge. No grass in reach: it ends at the edge, on the asphalt (park false). at(u): the point
 // u metres down the way, with its heading; lane(u,d): the point d metres from the centre line u metres
 // down (the truck's own way in); flip: the car faces back the way it came (hooked by its tail).
 // V: the way it follows (towView): on a branch road, along the branch and on past the merge (its grass is the lap's).
 // along(car): how far down the way a car is, there (multiplayer.js draws the truck by it; the lap's s elsewhere).
 towPath(c,side=null,V=this.towView(c)){
  const f=V.plain?null:V.F(c),a=V.a,n=a.length,ds=V.line.ds,L=V.L,k0=f?f.i:c.index,s0=f?f.s:c.surface.s,d0=f?f.d:c.surface.d,h0=c.heading;
  const station=u=>{const f=(((s0+u)%L+L)%L)/ds,i=Math.floor(f),t=f-i,p=a[i%n],q=a[(i+1)%n],m=k=>p[k]+(q[k]-p[k])*t;return {k:i%n,x:m(1),y:m(2),nx:m(9),ny:m(10),half:m(4)/2};};
  // (both sides looked at together, two metres at a time: the first clear stretch ends the search; on
  // each side not before 2.2 times the way across, so the way never turns sharply)
  const sides=side?[side]:[Math.sign(d0)||1,-(Math.sign(d0)||1)],from=s=>Math.max(10,Math.abs(s*(station(0).half+PARK_OFF)-d0)*2.2);let found=Infinity;side=sides[0];
  for(let u=10;u<=TOW_REACH&&found===Infinity;u+=2)for(const s of sides)if(u>=from(s)&&[0,6,12].every(j=>this.grassAt(c,k0,s,u+j,V))){side=s;found=u+6;break;}
  const park=Number.isFinite(found),end=park?found:24;
  const lane=(u,d)=>{const st=station(u);return {x:st.x+st.nx*d,y:st.y+st.ny*d,k:st.k};};
  // Over to the edge within B metres; off it through the last T.
  const B=Math.min(end,clamp(Math.abs(side*(station(0).half+TOW_EDGE)-d0)*3,8,30)),T=Math.min(14,end);
  const dAt=u=>d0+(side*(station(u).half+(park?TOW_EDGE+(PARK_OFF-TOW_EDGE)*smooth((u-end+T)/T):TOW_EDGE))-d0)*smooth(u/B);
  const at=u=>{const p=lane(u,dAt(u)),q=lane(u+.5,dAt(u+.5));return {...p,heading:Math.atan2(q.y-p.y,q.x-p.x)};};
  const path={s0,side,end,park,h0,flip:Math.abs(wrap(h0-Math.atan2(a[k0][8],a[k0][7])))>Math.PI/2,at,lane,station,dAt};
  if(f)path.along=o=>{const g=V.F(o);return g?((g.s-s0)%L+L*1.5)%L-L/2:0;};
  return path;
 }
 // The side to park a car on (1 left, -1 right): the one with grass at more of these distances ahead
 // (grassAt), the nearer side on a tie (brokenInput).
 parkSide(c,reach){
  const score=side=>reach.filter(j=>this.grassAt(c,c.index,side,j)).length,near=Math.sign(c.surface.d)||1;
  return score(-near)>score(near)?-near:near;
 }
 // The wheel (-1 right .. 1 left) toward a point look metres ahead, aim(p) metres from the centre line
 // of the station p there but no more than reach from where the car is: pure pursuit (brokenInput).
 pursuit(c,look,aim,reach){
  const a=this.data.samples,here=c.surface,p=a[(c.index+Math.round(look/this.line.ds))%a.length],to=clamp(aim(p),here.d-reach,here.d+reach);
  const dx=p[1]+p[9]*to-c.x,dy=p[2]+p[10]*to-c.y,alpha=wrap(Math.atan2(dy,dx)-c.heading);
  return clamp(Math.atan2(2*WHEELBASE*Math.sin(alpha),Math.hypot(dx,dy))/steerLimit(Math.hypot(c.vx,c.vy),(c.mechanics?.grip??1)*(c.weatherGrip??1)),-1,1);
 }
 // Multiplayer (multiplayer.js, the host's field): the driver of a car raced over the network is gone
 // mid-race and no bot takes the wheel: nobody drives it (stopInput), and at the flag it is AB (why:
 // the breakdown's name). A car past the flag keeps its result: a bot brings it in (the cool-down lap,
 // the pit lane). Gone again before taking the car back, it waits where it is.
 strand(r,why){
  Object.assign(r,{puppet:null,lastS:r.car.surface.s,breakdown:null});
  if(!r.finished){r.stop??={stage:'parado'};Object.assign(r,{retired:true,broken:{kind:why,smokeLeft:0}});}
 }
 // Its driver back at the wheel: the tow, the yellow flag and the AB it was heading for are over (a
 // result it already has stands). Not a car that reached the flag meanwhile: its AB stands (false),
 // unless its pilot says it finished (finished: the pilot's own finish, made at the wheel before this
 // window heard it, as its window never finishes a car nobody drives: multiplayer.js stepFree).
 reclaim(r,finished=false){if(r.stop?.flagged&&!finished)return false;if(r.stop)Object.assign(r,{stop:null,broken:null,retired:false});return true;}
 // The yellow flag's speed for a car at c: with a driverless car still on the road ahead (rolling,
 // stopped, or on the tow; not in the pit lane), slower the closer it is, never below that car's own
 // speed; Infinity with none. (Those cars are listed once a step, step: almost always none.)
 // V (decide's view): along the way the car drives by; a car on another road of a fork is not ahead on it.
 caution(c,V=this.plain){
  const L=this.data.meta.reconstructed_xy_m;let v=Infinity;
  for(const o of this.cautions??[]){
   if(o.car===c)continue;let gap;
   if(V.plain)gap=trackGap(c,o.car,L);else{const h=V.F(c),f=V.F(o.car);if(!h||!f)continue;gap=lapTravel(h.s,f.s,V.L);}
   if(gap>-15&&gap<CAUTION_REACH)v=Math.min(v,Math.max(Math.hypot(o.car.vx,o.car.vy),CAUTION_PACE+Math.max(0,gap-60)*.1));
  }
  return v;
 }
 // A place to park j metres ahead on one side, a few metres past the edge: grass of this stretch (not
 // another road, as beside ECPA's twin straights, nor the pit lane) with no wall on the way. (Far
 // ahead, towPath, the nearest stretch is looked for along the whole track: the car's own few dozen
 // metres of it would not reach there.)
 // V (towPath): stations i and j of that way; along a branch road (walled) there is none.
 grassAt(c,i,side,j,V=this.plain){
  const a=V.a,n=a.length,geo=this.geo??=pitGeometry(this.data),k=(i+Math.round(j/V.line.ds))%n,p=a[k],heading=Math.atan2(p[8],p[7]),at=o=>[p[1]+p[9]*side*o,p[2]+p[10]*side*o];
  if(V.fork?.inFork(k))return false;
  const lapK=V.fork?V.fork.lapK(k):k,m=this.data.samples.length;
  const [x,y]=at(p[4]/2+PARK_OFF),q=j>60?c.sample(x,y,c.nearest(x,y,true).i):c.sample(x,y),apart=Math.abs(q.i-lapK),same=Math.min(apart,m-apart)<25;
  // Never at a plateau's rim (cliff-edge.js): the spot keeps 6 m of ground before the lip.
  if(c.cliff&&c.cliff.query(x,y).d>-6)return false;
  return !q.onRoad&&!q.pit&&same&&![p[4]/2+.5,p[4]/2+PARK_OFF/2,p[4]/2+PARK_OFF].some(o=>wallContact(geo,...at(o),heading));
 }
 // Pit lane after the flag: pure pursuit along the fast lane, over to the working lane for the
 // last 12 m before the slot, 56 km/h in the limit zone and a car length behind the car in front.
 // A refuelling stop (service) goes over for the last SERVICE_OVER m to its garage's spot, waits there for the crew
 // (REFUEL_TIME, REFUEL_RATE a litre) and a clear way out, then back over to the fast lane and down it to the lane's end,
 // where the racing takes over again (endStop).
 pitInput(r,bodies,dt){
  const c=r.car,R=this.route,st=R.stations,P=r.pit,slot=P.slot,S=P.service,speed=Math.hypot(c.vx,c.vy),fx=Math.cos(c.heading),fy=Math.sin(c.heading),hold={left:0,right:0,throttle:0,brake:1,reverse:0,handbrake:0};
  if(P.parked&&!S)return hold;
  if(P.parked&&!S.leaving){
   if(S.wait===undefined){const L=this.data.meta.reconstructed_xy_m,D=Math.max(0,L*S.laps+this.gridLeadIn-r.progress);S.litres=clamp(this.refuel.perMetre*D+FUEL_RESERVE+.4-r.fuel,1,Math.max(1,this.refuel.tank-r.fuel));S.wait=S.time=REFUEL_TIME+S.litres*REFUEL_RATE;}
   // The time counts once the crew's nozzle is in (crewReady, pit-building.js: the visible crew's fuel man in place).
   if(S.wait>0&&this.crewReady&&!this.crewReady(r.entry.number))return hold;
   S.wait=Math.max(0,S.wait-dt);if(S.wait>0)return hold;
   if(!S.filled){S.filled=true;r.fuel=Math.min(this.refuel.tank,r.fuel+S.litres);}
   if(this.laneTraffic(c,bodies))return hold;
   Object.assign(S,{leaving:true,from:P.u});P.parked=false;
  }
  let best=Infinity;for(let k=Math.max(0,P.k-3);k<Math.min(st.length,P.k+12);k++){const q=st[k],dd=(c.x-q.x)**2+(c.y-q.y)**2;if(dd<best){best=dd;P.k=k;}}
  const q=st[P.k],u=P.u=q.u+(c.x-q.x)*q.tx+(c.y-q.y)*q.ty,leaving=!!S?.leaving,left=leaving?Infinity:slot.u-u;
  if(leaving&&u>S.from+5&&this.spotCars.get(slot)===r)this.spotCars.delete(slot);
  if(leaving&&u>=R.end-4)return this.endStop(r);
  // Speed: bends and the limit zone ahead through a gentle braking curve, then the stop.
  let target=leaving?PIT_PACE:Math.sqrt(2*2.2*Math.max(0,left-.3));
  for(let k=P.k;k<Math.min(st.length,P.k+60);k++){const s=st[k],v=R.limit&&s.u>=R.limit.from-2&&s.u<=R.limit.to?Math.min(s.v,PIT_LIMIT):s.v;target=Math.min(target,Math.sqrt(v*v+2*3.5*Math.max(0,s.u-u-speed*.1)));}
  for(const o of bodies){if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y,forward=dx*fx+dy*fy,side=dy*fx-dx*fy;if(forward>0&&forward<40&&Math.abs(side)<2.3&&sameLevel(c,o))target=Math.min(target,Math.max(0,o.vx*fx+o.vy*fy)+Math.sqrt(2*3*Math.max(0,forward-6.3)));}
  if(!leaving&&speed<.5&&(left<1.5||target<.3)){P.parked=left<1.5;return hold;}
  const over=S?SERVICE_OVER:12,look=u+4+speed*.3,p=R.at(look),t=leaving?1-smooth((look-S.from)/SERVICE_OUT):clamp((look-slot.u+over)/(over-2),0,1),lane=p.fast+(p.work-p.fast)*t*t*(3-2*t),tx=p.x-p.ty*lane,ty=p.y+p.tx*lane,alpha=wrap(Math.atan2(ty-c.y,tx-c.x)-c.heading);
  const turn=clamp(Math.atan2(2*WHEELBASE*Math.sin(alpha),Math.hypot(tx-c.x,ty-c.y))/steerLimit(speed,(c.mechanics?.grip??1)*(c.weatherGrip??1)),-1,1);
  const input={left:Math.max(0,turn),right:Math.max(0,-turn),throttle:clamp((target-speed)*.6,0,1),brake:clamp((speed-target)*.7,0,1),reverse:0,handbrake:0};
  // Wedged against a wall: back out with the wheels turned, then go on.
  r.blocked=speed<1.2&&target>3?(r.blocked??0)+dt:0;if(r.blocked>2.5){r.recover=1.2;r.blocked=0;}
  if(r.recover>0){r.recover-=dt;Object.assign(input,{reverse:1,throttle:0,brake:0,left:alpha<0?1:0,right:alpha>0?1:0});}
  return input;
 }
 // A spot for a car taken off the track (multiplayer.js: a human past the flag, parked at once): the parking row's
 // index-th from its far end (the in-lap's cars take the row from the other end, first come first served); null
 // without a pit lane.
 parkingSpot(index=0){
  const R=this.route,slots=R?.slots;if(!slots?.length)return null;
  const slot=slots[Math.max(0,slots.length-1-index)],p=R.at(slot.u);
  return {x:p.x-p.ty*slot.d,y:p.y+p.tx*slot.d,heading:Math.atan2(p.ty,p.tx)};
 }
 // Back on the track at the lane's end: racing again from where the car is, easing over to its line.
 endStop(r){
  const c=r.car,f=this.view(r).F(c);if(this.spotCars.get(r.pit.slot)===r)this.spotCars.delete(r.pit.slot);
  Object.assign(r,{pit:null,mode:'line',rival:null,lane:f?.d??0,blend:1,blendTarget:0,cooldown:2,stuck:0,blocked:0});
  const {bodies,driverOf,player}=this.stepCars;return this.decide(r,bodies,driverOf,player,0,this.fuelFor);
 }
 // The rivals in result order (race-results.js resultRows): who crossed the line, by time, then
 // the cars still racing in running order, retirements last. A car still on the track gets the
 // total time it would take to the flag (estimated: true): the rest of this lap as long as the
 // same stretch took it on the lap before (the run to the line is the fast part of a lap), plus
 // its last lap for each lap it is down. On its first lap there is no lap before: the rest as
 // long as it took a car already in (the slowest, the player included), scaled by how much
 // longer this car took to get where it is; with nobody in yet, its average pace so far.
 // Never ahead of the car in front, nor of after (the player's own finish time).
 classification(totalLaps,after=-Infinity){
  const L=this.data.meta.reconstructed_xy_m,goal=L*totalLaps+this.gridLeadIn,t=this.time,S=SPLITS,split=L/S,G=totalLaps*S;let ahead=after??-Infinity;
  const ref=Number.isFinite(G)?[this.playerRun,...this.rivals].filter(q=>q?.splits?.length>G).sort((a,b)=>b.splits[G]-a.splits[G])[0]:null;
  return [...this.rivals].sort((a,b)=>(a.finishTime??Infinity)-(b.finishTime??Infinity)||!!a.retired-!!b.retired||b.progress-a.progress).map(r=>{
   const row={...r.entry,bestLap:r.car.best,totalTime:r.finished?r.finishTime:null,finished:r.finished,laps:r.car.laps,...(r.retired?{dnf:true,breakdown:r.broken?.kind}:{})};
   if(r.finished||r.retired||!Number.isFinite(goal)||t<=0)return row;
   const at=Math.max(0,(r.progress-this.gridLeadIn)/split),k=Math.floor(at),lap=Math.floor(k/S),p=r.splits??[];let left;
   if(lap>=1&&lap<totalLaps&&p.length>lap*S){const lapTime=p[lap*S]-p[(lap-1)*S];left=p[lap*S]-p[k-S]-(at-k)*(p[k-S+1]-p[k-S])+(totalLaps-lap-1)*lapTime;}
   else if(ref&&ref.splits[k]+(at-k)*(ref.splits[k+1]-ref.splits[k])>0){const q=ref.splits,refAt=q[k]+(at-k)*(q[k+1]-q[k]);left=t/refAt*(q[G]-refAt);}
   else left=Math.max(0,goal-r.progress)/clamp((r.progress-(r.start??0))/t,8,90);
   ahead=Math.max(t+Math.max(0,left),ahead+.2);
   return {...row,totalTime:ahead,estimated:true};
  });
 }
 info(){return {collisions:this.collisions,rivals:this.rivals.map(r=>({number:r.entry.number,name:r.entry.name,level:r.entry.level,style:r.style.name,x:r.car.x,y:r.car.y,heading:r.car.heading,speed:Math.hypot(r.car.vx,r.car.vy),progress:r.progress,finished:r.finished,pit:r.pit?(r.pit.parked?'parked':'lane'):null,retired:!!r.retired,breakdown:r.broken?.kind??null,mode:r.mode,blend:r.blend,draft:r.tow,mistakes:r.mistakes,passes:r.passes,...(r.routes?{routes:[...r.routes]}:{})}))};}
}
