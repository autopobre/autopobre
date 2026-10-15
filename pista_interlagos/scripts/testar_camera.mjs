// Follow cameras (camera-rig.js): framing per view, car and screen; the lens at speed with its dolly; the
// Hor+ ceiling on wide phones; springs that settle without overshoot; no vibration with the motion off.
import assert from 'node:assert/strict';
import {CAMERA_FRAMES,FOLLOW_FRAMES,MAX_HFOV,MAX_SPEED_HFOV,LENS_FLOOR,baseFov,horizontalFov,verticalFov,speedFov,easeLens,lensScale,speedEase,dolly,frameFor,topSpeed,carPoints,screenBox,horizonY,framePose,spring,CameraRig,vibration,MAX_LAG,CATCH_RATE,KERB_JOLT,PHONE_SPEED_HFOV,speedHfovCap} from '../teste/camera-rig.js';
import {CAMERA_MODES} from '../teste/player-preferences.js';
import {OPALA_BODY,FUSCA_BODY} from '../teste/physics.js';
import {SPEED_SMEAR,ROAD_SMEAR,SMEAR_CARS,smearStrength} from '../teste/cinematic.js';

const WIDE=16/9,PHONE=20/9,car={p:[0,0,0],forward:[1,0,0],right:[0,0,1]};
const framed=(mode,{body=OPALA_BODY,aspect=WIDE,speed=0,motion=1}={})=>{
 const top=topSpeed(body.mechanics),base=baseFov(mode,aspect),fov=speedFov(mode,aspect,{speed,top,motion}),keep=dolly(base,fov),pose=framePose(mode,{body,aspect,keep});
 return {base,fov,keep,box:screenBox({...pose,fov,aspect},car,carPoints(body)),horizon:horizonY({...pose,fov})};
};

// The follow views are in the C cycle, the old high chase kept as 'far' right after the two low ones.
assert.deepEqual(FOLLOW_FRAMES,['chase','close','far']);
assert.deepEqual(CAMERA_MODES.slice(0,3),['chase','close','far']);
// Chase and close sit low (just over the roof) and close in; far is the old Perseguição, high and far back.
assert.ok(CAMERA_FRAMES.chase.up<2&&CAMERA_FRAMES.close.up<1.8&&CAMERA_FRAMES.close.up<CAMERA_FRAMES.chase.up&&CAMERA_FRAMES.far.up>3.5);
assert.ok(CAMERA_FRAMES.close.back<CAMERA_FRAMES.chase.back&&CAMERA_FRAMES.chase.back<CAMERA_FRAMES.far.back);

// The Opala's share of a 16:9 screen at rest: chase about a quarter of the width, close over a third, far an
// eighth (the old chase); every view keeps the whole car on screen with road below it.
const rest={chase:framed('chase').box,close:framed('close').box,far:framed('far').box};
assert.ok(rest.chase.width>.2&&rest.chase.width<.3,`chase ${rest.chase.width}`);
assert.ok(rest.close.width>.32&&rest.close.width<.45,`close ${rest.close.width}`);
assert.ok(rest.far.width>.1&&rest.far.width<.16,`far ${rest.far.width}`);
for(const [mode,b] of Object.entries(rest))assert.ok(b.x0>.05&&b.x1<.95&&b.y0>.35&&b.y1<.95,`${mode} on screen ${JSON.stringify(b)}`);
// A car ahead shows over ours: the roof sits at least 6% of the screen's height under the horizon at rest, on a
// monitor and on a 20:9 phone, for both cars (close at roof height hid a car 10-60 m ahead completely); with the
// lens open at top speed (the eye comes in and a little down) at least 5%.
for(const mode of ['chase','close'])for(const body of [OPALA_BODY,FUSCA_BODY])for(const aspect of [WIDE,PHONE]){
 const still=framed(mode,{body,aspect}),fast=framed(mode,{body,aspect,speed:topSpeed(body.mechanics)*.95});
 assert.ok(still.box.y0-still.horizon>=.06,`${mode} ${body.name} ${aspect.toFixed(2)} roof under the horizon ${(still.box.y0-still.horizon).toFixed(3)}`);
 assert.ok(fast.box.y0-fast.horizon>=.05,`${mode} ${body.name} ${aspect.toFixed(2)} roof under the horizon at speed ${(fast.box.y0-fast.horizon).toFixed(3)}`);
}

// Speed: the lens opens by the frame's kick near the top speed (6°, no wider than MAX_SPEED_HFOV side to side), the eye
// comes in, the car shrinks by 8% at most.
for(const mode of FOLLOW_FRAMES){
 const top=topSpeed(OPALA_BODY.mechanics),fast=framed(mode,{speed:top*.95}),f=CAMERA_FRAMES[mode];
 assert.equal(f.kick,6,`${mode} kick`);
 assert.ok(Math.abs(fast.fov-Math.min(f.fov+f.kick,verticalFov(MAX_SPEED_HFOV,WIDE)))<.01,`${mode} kick ${fast.fov}`);
 // (far, already 85° wide at rest, opens only to the 92° ceiling: too little to need the eye brought in)
 assert.ok((mode==='far'?fast.keep<=1:fast.keep<1)&&fast.box.width>rest[mode].width*.9,`${mode} dolly ${fast.keep} ${fast.box.width}/${rest[mode].width}`);
 assert.ok(framed(mode,{speed:top*.95,motion:0}).fov===baseFov(mode,WIDE),'no kick with the camera motion off');
}
// The ceiling applies after the kick: no follow view nor the bonnet opens past MAX_SPEED_HFOV side to side at top
// speed, near miss and upshift included, on a monitor or a phone (they reached 96° and 102°); the cockpit, wider
// than MAX_HFOV at rest, keeps its own widening. A 20:9 phone, 90° wide at rest, keeps the old 95° (PHONE_SPEED_HFOV).
assert.ok(speedHfovCap(WIDE)===MAX_SPEED_HFOV&&Math.abs(speedHfovCap(PHONE)-PHONE_SPEED_HFOV)<1e-9&&speedHfovCap(4/3)===MAX_SPEED_HFOV);
for(const mode of [...FOLLOW_FRAMES,'hood'])for(const aspect of [WIDE,PHONE]){
 const fov=speedFov(mode,aspect,{speed:60,top:60,motion:1,surge:1,punch:1});
 // (far, 85° wide at rest on a monitor, has only about 2.4° left under the ceiling)
 assert.ok(horizontalFov(fov,aspect)<=speedHfovCap(aspect)+1e-6&&fov>baseFov(mode,aspect)+(mode==='far'&&aspect===WIDE?2.2:3),`${mode} ${aspect.toFixed(2)} lens ${fov} (${horizontalFov(fov,aspect).toFixed(1)}° wide)`);
}
assert.ok(Math.abs(speedFov('cockpit',WIDE,{speed:60,top:60,motion:1})-79)<.01,'the cockpit keeps its 5°');
// The bonnet: about 83° side to side at rest and 89° at speed (at 58° it was 89° to 95°, the road ahead small).
{const rest=horizontalFov(baseFov('hood',WIDE),WIDE),fast=horizontalFov(speedFov('hood',WIDE,{speed:60,top:60,motion:1}),WIDE);
 assert.ok(rest>81&&rest<85&&fast>87&&fast<90&&fast<=MAX_SPEED_HFOV,`the bonnet ${rest.toFixed(1)}° to ${fast.toFixed(1)}°`);}
assert.ok(MAX_SPEED_HFOV<=92,'the speed lens stops at 92° side to side');
// The lens kick is not the shake: Reduzido (Baixo, Médio, phones; motion .35) keeps most of it, about 5°;
// Desligado and the system's reduced motion (motion 0) none.
assert.equal(lensScale(0),0);assert.equal(lensScale(1),1);assert.equal(lensScale(.35),LENS_FLOOR);
for(const mode of ['chase','close']){
 const top=topSpeed(OPALA_BODY.mechanics),reduced=framed(mode,{speed:top*.95,motion:.35}).fov-CAMERA_FRAMES[mode].fov;
 assert.ok(reduced>=Math.min(5,verticalFov(MAX_SPEED_HFOV,WIDE)-CAMERA_FRAMES[mode].fov)-1e-9&&reduced<=6,`${mode} Reduzido kick ${reduced}`);
}
// The quick pulses (near miss, upshift) are not the steady kick: Reduzido keeps them at its own 35%, not the floor.
for(const mode of ['chase','close']){
 const pulse=motion=>speedFov(mode,WIDE,{speed:0,top:60,motion,surge:1,punch:1})-speedFov(mode,WIDE,{speed:0,top:60,motion});
 const ratio=pulse(.35)/pulse(1);assert.ok(Math.abs(ratio-.35)<.03,`${mode} Reduzido pulse ${ratio.toFixed(3)} of Completo`);
}
// Fast to open, slow to let go (about 0.6 s): braking from the top speed the lens closes over a second, not in a
// breath, and it never overshoots either way.
{
 let fov=55;for(let i=0;i<12;i++)fov=easeLens(fov,61,1/60);const opened=(fov-55)/6;
 fov=61;for(let i=0;i<12;i++)fov=easeLens(fov,55,1/60);const released=(61-fov)/6;
 assert.ok(opened>.6&&released<.35&&released>.2,`open ${opened} release ${released}`);
 fov=61;for(let i=0;i<36;i++)fov=easeLens(fov,55,1/60);assert.ok((61-fov)/6>.6&&(61-fov)/6<.7,`about two thirds let go in 0.6 s ${fov}`);
 for(let i=0;i<120;i++)fov=easeLens(fov,55,1/60);assert.ok(fov>55&&fov<55.2,`closed after 2.6 s ${fov}`);
 assert.equal(easeLens(58,61,0),58,'paused: held');
}
// Speed smear (cinematic.js): by the camera's own speed against the followed car's top speed, nothing at a crawl,
// full near the top; it starts close to the lens (the asphalt under the bottom of the frame), and far away
// (the crowd) it is capped well under the near cap, so faces and flags stay legible.
{
 const top=topSpeed(OPALA_BODY.mechanics);let last=-1;
 for(let v=0;v<=top;v+=.5){const s=smearStrength(v,top);assert.ok(s>=last-1e-12&&s>=0&&s<=1);last=s;}
 assert.equal(smearStrength(top*.15,top),0);assert.equal(smearStrength(top,top),1);
 assert.ok(Math.abs(smearStrength(155/3.6,topSpeed(FUSCA_BODY.mechanics))-smearStrength(196/3.6,top))<.03,'the Fusca feels it as the Opala does');
 // Most of a lap is under 150 km/h: the mid-speed corners stream too (130 km/h about .7, 80 a third), full by 165.
 const at=kmh=>smearStrength(kmh/3.6,top);
 assert.ok(at(130)>.64&&at(130)<.76&&at(80)>.2&&at(80)<.4&&at(165)===1&&at(35)===0,`smear by speed ${[35,80,130,165].map(at).map(v=>v.toFixed(2))}`);
 assert.ok(SPEED_SMEAR.near<=1.5&&SPEED_SMEAR.farCap<=SPEED_SMEAR.cap*.3&&SPEED_SMEAR.ease>=.1&&SPEED_SMEAR.ease<=.2&&SPEED_SMEAR.shutter<=1/300,JSON.stringify(SPEED_SMEAR));
 // (a lap-one pack: the followed car and the seven nearest stay sharp; with four the rest ghosted at 30-60 m)
 assert.equal(SMEAR_CARS,8);
 // The phones' road smear: half the taps or fewer, colour only, a shorter streak and nothing on the far scenery.
 assert.ok(ROAD_SMEAR.taps<=3&&ROAD_SMEAR.cap<SPEED_SMEAR.cap&&ROAD_SMEAR.farCap===0,JSON.stringify(ROAD_SMEAR));
}
// Chase stays under 72° even with a near miss punching the lens at top speed.
assert.ok(speedFov('chase',WIDE,{speed:60,top:60,motion:1,surge:1,punch:1})<72);
// The widening follows the share of each car's top speed: the Fusca at its 155 km/h opens like the Opala at 196.
assert.ok(Math.abs(topSpeed(OPALA_BODY.mechanics)*3.6-217.4)<1&&Math.abs(topSpeed(FUSCA_BODY.mechanics)*3.6-171.6)<1);
assert.ok(Math.abs(speedEase(155/3.6,topSpeed(FUSCA_BODY.mechanics))-speedEase(196/3.6,topSpeed(OPALA_BODY.mechanics)))<.02);
assert.equal(speedEase(5,60),0);assert.equal(speedEase(60,60),1);

// Hor+ with a ceiling: 16:9 keeps each view's lens; a 20:9 phone sees at most MAX_HFOV side to side in the
// follow views (not today's 100°), so the car keeps its share of the width; a 4:3 screen keeps the 16:9 lens.
for(const mode of FOLLOW_FRAMES){
 assert.equal(baseFov(mode,WIDE),CAMERA_FRAMES[mode].fov);
 assert.ok(horizontalFov(baseFov(mode,PHONE),PHONE)<=Math.max(MAX_HFOV,horizontalFov(CAMERA_FRAMES[mode].fov,WIDE))+1e-6);
 assert.equal(baseFov(mode,4/3),CAMERA_FRAMES[mode].fov);
 const phone=framed(mode,{aspect:PHONE}).box;
 assert.ok(phone.width>rest[mode].width*.85,`${mode} phone ${phone.width}`);
 assert.ok(phone.y1<.95,`${mode} phone bumper on screen ${phone.y1}`);
}
assert.equal(baseFov('cockpit',WIDE),74);assert.equal(baseFov('hood',WIDE),53);
assert.ok(baseFov('cockpit',PHONE)<74&&horizontalFov(baseFov('cockpit',PHONE),PHONE)<=horizontalFov(74,WIDE)+1e-6);

// The Fusca is framed for its size: closer than the Opala, nearly as tall on screen, never smaller than 3/4 of
// the Opala's width share (it is narrower) nor cut off.
for(const mode of ['chase','close']){
 const f=frameFor(mode,{body:FUSCA_BODY}),o=frameFor(mode,{body:OPALA_BODY}),b=framed(mode,{body:FUSCA_BODY}).box;
 assert.ok(f.back<o.back&&f.up<=o.up&&f.up>o.up*.9);
 assert.ok(b.width>rest[mode].width*.55&&b.height>rest[mode].height*.95&&b.y1<.95,`${mode} fusca ${JSON.stringify(b)}`);
}

// Critically damped spring: it settles from a step without passing the target.
{const s={x:1,v:0};let min=1;for(let i=0;i<600;i++){spring(s,0,6,1/120);min=Math.min(min,s.x);}assert.ok(min>=-1e-9&&Math.abs(s.x)<1e-3,`spring ${min} ${s.x}`);}
// The same at any frame rate (exact steps): 30 fps and 144 fps land within a millimetre after half a second.
{const a={x:1,v:0},b={x:1,v:0};for(let i=0;i<15;i++)spring(a,0,6,1/30);for(let i=0;i<72;i++)spring(b,0,6,1/144);assert.ok(Math.abs(a.x-b.x)<1e-3);}

const state=(over={})=>({dt:1/60,mode:'chase',aspect:WIDE,body:OPALA_BODY,heading:0,pitch:0,travel:0,speed:40,yawRate:0,longAccel:0,heave:0,tumbling:false,motion:1,gear:4,keep:1,...over});
// Yaw: in a steady corner the view turns after the car, by less than MAX_LAG, and catches up on the straight
// without swinging past the nose; the aim looks into the corner (left turn: aim to the left, -right).
{
 const rig=new CameraRig();rig.update(state());let heading=0,lag=0;
 for(let i=0;i<120;i++){heading+=.5/60;const o=rig.update(state({heading,travel:heading,yawRate:.5}));lag=o.lag;}
 assert.ok(lag<-.05&&lag>=-MAX_LAG-1e-9,`corner lag ${lag}`);assert.ok(rig.out.side>.3,`look into the corner ${rig.out.side}`);
 let over=0;for(let i=0;i<180;i++){const o=rig.update(state({heading,travel:heading}));over=Math.max(over,o.lag);}
 assert.ok(over<1e-6&&Math.abs(rig.out.lag)<1e-3,`no overshoot ${over} ${rig.out.lag}`);
}
// Sliding: the view aims between the nose and the travel, so the car's flank shows.
{const rig=new CameraRig();rig.update(state());let o;for(let i=0;i<120;i++)o=rig.update(state({heading:0,travel:-.5}));assert.ok(o.yaw<-.15&&o.yaw>-.3,`drift aim ${o.yaw}`);}
// Reversing or spinning (slip past about 70°) it stays behind the nose instead of swinging round.
{const rig=new CameraRig();rig.update(state());let o;for(let i=0;i<120;i++)o=rig.update(state({heading:0,travel:Math.PI-.2}));assert.ok(Math.abs(o.yaw)<1e-6,`reverse aim ${o.yaw}`);}
// Sliding to a halt at about 1 rad of slip (spinning off, a donut): the slip's share fades with speed, so the view
// never turns more than a couple of degrees in one frame beyond the nose's own turn (it popped 27° at 5 m/s).
{
 const rig=new CameraRig();let heading=0,speed=8,worst=0;rig.update(state({heading,travel:heading-1,speed}));let prev=rig.out.yaw;
 for(let i=0;i<180;i++){speed=Math.max(0,speed-5/60);heading+=.3/60;const o=rig.update(state({heading,travel:heading-1,speed,yawRate:.3}));worst=Math.max(worst,Math.abs(o.yaw-prev)-.3/60);prev=o.yaw;}
 assert.ok(worst<.035,`slowing slide step ${worst}`);
 // Rolling over flips at speed: eased in and out, not a jump.
 const roll=new CameraRig();for(let i=0;i<60;i++)roll.update(state({travel:-.8,speed:20}));prev=roll.out.yaw;worst=0;
 for(let i=0;i<90;i++){const o=roll.update(state({travel:-.8,speed:20,tumbling:i<45}));worst=Math.max(worst,Math.abs(o.yaw-prev));prev=o.yaw;}
 assert.ok(worst<.035,`tumbling step ${worst}`);
 // Should the aim itself ever jump (here the travel flipped across the nose), the view closes it at CATCH_RATE.
 const jump=new CameraRig();for(let i=0;i<60;i++)jump.update(state({travel:-.9,speed:20}));prev=jump.out.yaw;worst=0;
 for(let i=0;i<60;i++){const o=jump.update(state({travel:.9,speed:20}));worst=Math.max(worst,Math.abs(o.yaw-prev));prev=o.yaw;}
 assert.ok(worst<=CATCH_RATE/60+.012&&Math.abs(jump.out.yaw-.405)<.02,`aim jump step ${worst} ${jump.out.yaw}`);
}
// Pulling away the camera falls back, braking hard it closes in; nothing of it with the motion off.
{
 const rig=new CameraRig();rig.update(state());let o;for(let i=0;i<120;i++)o=rig.update(state({longAccel:6}));assert.ok(o.pull>.2&&o.back>CAMERA_FRAMES.chase.back);
 for(let i=0;i<120;i++)o=rig.update(state({longAccel:-11}));assert.ok(o.pull<-.25&&o.pull>=-.32-1e-9);
 const calm=new CameraRig();calm.update(state({motion:0}));for(let i=0;i<120;i++)o=calm.update(state({longAccel:-11,motion:0}));assert.equal(o.pull,0);
}
// A bump lifts the car before the camera follows; the slope of the road (heave 0) never offsets it.
{const rig=new CameraRig();rig.update(state());let o=rig.update(state({heave:.2}));assert.ok(o.lift<-.15);for(let i=0;i<120;i++)o=rig.update(state({heave:.2}));assert.ok(Math.abs(o.lift)<.005);}
// A full-throttle upshift punches the lens; a reset starts the next view in place.
{const rig=new CameraRig();rig.update(state({gear:3}));rig.update(state({gear:4,longAccel:3}));assert.ok(rig.punch>.9);rig.reset();rig.update(state({heading:1,travel:1}));assert.equal(rig.out.yaw,1);assert.equal(rig.punch,0);}

// Vibration: turns only, growing with speed and on grass, kerbs and hits; none with the motion off or at rest.
{
 const peak=input=>{let m=0;for(let t=0;t<2;t+=1/240){const v=vibration(t,input);m=Math.max(m,Math.abs(v.pitch),Math.abs(v.yaw),Math.abs(v.roll));}return m;};
 assert.equal(peak({u:0,motion:1}),0);assert.equal(peak({u:1,motion:0,rough:1,kerb:1,impact:1}),0);
 const fast=peak({u:.95,motion:1}),reduced=peak({u:.95,motion:.35});
 assert.ok(fast>.001&&fast<.006,`fast ${fast}`);assert.ok(reduced<fast*.4);
 assert.ok(peak({u:.3,motion:1,kerb:1})>peak({u:.3,motion:1}));assert.ok(peak({u:.3,motion:1,impact:1})>.01);
}
// The kerb's jolt through the mount (the eye, metres): 1-2 cm at 13-18 Hz, a harder knock the moment the wheels climb
// on that dies away, held while paused, none off the kerb nor with Movimento da câmera off.
{
 assert.ok(KERB_JOLT.hz.every(f=>f>=12&&f<=18)&&KERB_JOLT.ride+KERB_JOLT.hit<=.021&&KERB_JOLT.ride>=.006,JSON.stringify(KERB_JOLT));
 const run=(motion,kerbs,dt=1/120)=>{const rig=new CameraRig();rig.update(state({motion}));const out=[];for(const k of kerbs){rig.update(state({motion,kerb:k,dt}));out.push(rig.out.jolt);}return out;};
 const on=Array.from({length:240},(_,i)=>i<12?i/12:1),onset=run(1,on),peakOf=a=>Math.max(...a.map(Math.abs));
 assert.ok(peakOf(onset.slice(0,40))>.012&&peakOf(onset.slice(0,40))<=.021,`onset ${peakOf(onset.slice(0,40))}`);
 assert.ok(peakOf(onset.slice(160))>.005&&peakOf(onset.slice(160))<.0095,`riding ${peakOf(onset.slice(160))}`);
 assert.equal(peakOf(run(1,new Array(120).fill(0))),0,'off the kerb: still');assert.equal(peakOf(run(0,on)),0,'Desligado: still');
 assert.ok(peakOf(run(.35,on))<peakOf(onset)*.4,'Reduzido: a third');
 // Its own clock: paused (dt 0) it holds; crossing zero 26-36 times a second at the mount's rate.
 const rig=new CameraRig();rig.update(state());for(let i=0;i<60;i++)rig.update(state({kerb:1}));const held=rig.out.jolt;rig.update(state({kerb:1,dt:0}));assert.equal(rig.out.jolt,held,'paused: held');
 const ride=run(1,new Array(1200).fill(1),1/600).slice(300);let crossings=0;for(let i=1;i<ride.length;i++)if(Math.sign(ride[i])!==Math.sign(ride[i-1]))crossings++;
 assert.ok(crossings/1.5>=26&&crossings/1.5<=38,`${(crossings/1.5).toFixed(1)} crossings a second`);
}
console.log('Camera rig passed: chase/close/far framing, Hor+ ceiling on 20:9, dolly at speed, per-car framing, springs, vibration.');
