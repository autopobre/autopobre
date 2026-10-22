import fs from 'node:fs';
import assert from 'node:assert/strict';
// Racing wheels (teste/wheel-controls.js), Câmbio manual (teste/manual-gearbox.js and physics.js) with
// a fake Gamepad API: what the setup learns from a wheel, pedals (resting at 1, -1 or 0, sharing an
// axis, read as 0 until touched), buttons and D-pads; the wheel in a race; the gears the player puts in.
const listeners={};globalThis.addEventListener=(type,fn)=>{(listeners[type]??=[]).push(fn);};
globalThis.document={hidden:false};
globalThis.KeyboardEvent=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
let pads=[];
Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>pads},configurable:true});
const {WheelControls,ControlLearner,ROLES,GUIDED,REQUIRED,H_ROLES,WHEEL_KEY,WHEEL_LOCK_DEFAULT,normalizeWheelMap,pedalValue,steeringDegrees,steeringCommand,wheelRange,deviceName}=await import('../teste/wheel-controls.js');
const {ManualGearbox,AutoShift,AUTO_HOLD}=await import('../teste/manual-gearbox.js');
const {GamepadControls}=await import('../teste/gamepad-controls.js');
const {TestCar,REDLINE_RPM,IDLE_RPM}=await import('../teste/physics.js');
const {CarAudio}=await import('../teste/car-audio.js');
const {DriverControls}=await import('../teste/driver-controls.js');
const G29='Logitech G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)',PEDALS='Fanatec CSL Pedals (Vendor: 0eb7 Product: 6204)';
function device({id=G29,index=0,mapping='',axes=Array(10).fill(0),buttons={}}={}){
 return {id,index,mapping,connected:true,axes:[...axes],buttons:Array.from({length:26},(_,i)=>{const v=buttons[i]??0;return {pressed:v>.5,value:v};})};
}
const axes=(values,n=10)=>Array.from({length:n},(_,i)=>values[i]??0);

// --- Readings.
assert.equal(deviceName(G29),'Logitech G29 Driving Force Racing Wheel');
assert.equal(deviceName('046d-c24f-Logitech G29 Driving Force Racing Wheel'),'Logitech G29 Driving Force Racing Wheel');
// A pedal resting at 1 and floored at -1, one resting at -1, a trigger-like button and a shared axis.
const down={rest:1,full:-1},up={rest:-1,full:1},shared={rest:0,full:-1};
assert.equal(pedalValue(1,down),0);assert.equal(pedalValue(-1,down),1);assert.ok(Math.abs(pedalValue(0,down)-.5)<.02);
assert.equal(pedalValue(1.02,down),0,'tiny overshoot at rest is no throttle');assert.equal(pedalValue(.97,down),0,'a pedal a hair off its rest gives nothing');
assert.equal(pedalValue(1,up),1);assert.equal(pedalValue(undefined,down),0);assert.equal(pedalValue(NaN,down),0);
assert.equal(pedalValue(.6,shared),0,'the other pedal of a shared axis is not this one');assert.ok(pedalValue(-.6,shared)>.55);
// A 900° wheel (a quarter turn reads .2), one wired the other way, and a 180° wheel that ends at 90°.
const g29={id:G29,axis:0,center:0,per90:.2},flipped={id:G29,axis:0,center:0,per90:-.2},small={id:G29,axis:0,center:0,per90:1};
assert.equal(wheelRange(g29),450);assert.equal(wheelRange(flipped),450);assert.equal(wheelRange(small),90);
assert.equal(steeringDegrees(.2,g29),90);assert.equal(steeringDegrees(-.1,g29),-45);assert.equal(steeringDegrees(.2,flipped),-90);
assert.ok(steeringCommand(.3,g29,270)>1-1e-9,'135° is full lock at 270°');assert.equal(steeringCommand(.35,g29,270),1);assert.ok(Math.abs(steeringCommand(.15,g29,270)-.5)<1e-9);
assert.ok(Math.abs(steeringCommand(-.15,g29,540)+.25)<1e-9);assert.equal(steeringCommand(.0005,g29,270),0,'a hair off centre is straight');
assert.equal(steeringCommand(.99,small,270),1,'a wheel that cannot reach the lock gets full lock at its own stop');
assert.equal(WHEEL_LOCK_DEFAULT,270);
for(const role of REQUIRED)assert.ok(GUIDED.includes(role));
for(const role of Object.keys(ROLES))assert.ok(ROLES[role].label,role);
for(const [role,{keys}] of Object.entries(ROLES))for(const code of keys??[])assert.match(code,/^(Key[A-Z]|Space)$/,role);

// --- Saved maps: anything not shaped like a binding is dropped.
assert.deepEqual(normalizeWheelMap({steer:{id:G29,axis:0,center:0,per90:.2},throttle:{id:G29,axis:2,rest:1,full:-1},camera:{id:G29,button:5},look:{id:G29,button:1},
 brake:{id:G29,axis:3,rest:1,full:.95},clutch:{id:'',axis:1,rest:1,full:-1},up:{id:G29,button:-1},menu:{id:G29,axis:9,value:-1},handbrake:{id:G29,button:2.5},ghost:'x'}),
 {steer:{id:G29,axis:0,center:0,per90:.2},throttle:{id:G29,axis:2,rest:1,full:-1},camera:{id:G29,button:5},menu:{id:G29,axis:9,value:-1}});
for(const junk of [null,'[]',[],42,{steer:{id:G29,button:0,center:0,per90:.2}}])assert.deepEqual(normalizeWheelMap(junk),{});

// --- Learning: the wheel turned a quarter right and held.
const T=t=>t*1000;
{
 // Two pedals read 0 until first touched (Chrome); one is nudged meanwhile, which must not win.
 let l=new ControlLearner('steer',[device()],0);
 assert.equal(l.feed([device({axes:axes([.05])})],T(.1)),null);
 assert.equal(l.feed([device({axes:axes([.2,0,.99])})],T(.3)),null);
 assert.equal(l.feed([device({axes:axes([.2,0,1])})],T(.8)),null,'not held long enough yet');
 assert.ok(l.progress>.5&&l.progress<1);
 const b=l.feed([device({axes:axes([.201,0,1])})],T(1.2));
 assert.deepEqual(b,{id:G29,axis:0,center:0,per90:.201});
 // Turned left by mistake: the wheel then steers the other way round (the meters show it).
 l=new ControlLearner('steer',[device()],0);l.feed([device({axes:axes([-.2])})],T(.1));
 assert.equal(l.feed([device({axes:axes([-.2])})],T(1)).per90,-.2);
 // Two axes moving as much: no guess.
 l=new ControlLearner('steer',[device()],0);l.feed([device({axes:axes([.2,.18])})],T(.1));
 assert.equal(l.feed([device({axes:axes([.2,.18])})],T(2)),null);
}
// --- Learning pedals: pressed to the floor and let go.
function learnPedal(frames,{exclude=[],buttons=false}={}){
 const l=new ControlLearner('pedal',[device(frames[0])],0,{exclude});let b=null;
 frames.forEach((f,i)=>{b??=l.feed([device(f)],T(i*.15));});
 for(let t=0;t<5&&!b;t++)b=l.feed([device(frames.at(-1))],T(frames.length*.15+t*.15));
 return b;
}
const at=(axis,value,rest={})=>({axes:axes({...rest,[axis]:value})});
// Resting at 1 (Logitech), floored at -1.
assert.deepEqual(learnPedal([at(2,1),at(2,.3),at(2,-1),at(2,-1),at(2,.2),at(2,1)]),{id:G29,axis:2,rest:1,full:-1});
// Read as 0 until touched, then its rest, the floor and back.
assert.deepEqual(learnPedal([at(2,0),at(2,0),at(2,.98),at(2,-1),at(2,1)]),{id:G29,axis:2,rest:1,full:-1});
// Still held at the floor: not learnt (it would come out upside down), however long.
assert.equal(learnPedal([at(2,1),at(2,-1),at(2,-1),at(2,-1),at(2,-1),at(2,-1),at(2,-1)]),null);
assert.equal(learnPedal([at(2,0),at(2,.99),at(2,-1),at(2,-1),at(2,-1),at(2,-1),at(2,-1)]),null);
// Resting at -1 (some Thrustmaster pedals), and a pedal set sharing one axis (each side a pedal).
assert.deepEqual(learnPedal([at(5,-1),at(5,1),at(5,-1)]),{id:G29,axis:5,rest:-1,full:1});
assert.deepEqual(learnPedal([at(1,0),at(1,-.01),at(1,-1),at(1,0)]),{id:G29,axis:1,rest:0,full:-1});
// An analog button (a pedal some browsers map as a trigger).
assert.deepEqual(learnPedal([{buttons:{7:0}},{buttons:{7:.5}},{buttons:{7:1}},{buttons:{7:0}}]),{id:G29,button:7,rest:0,full:1});
// The wheel bumped meanwhile is left out once it is the wheel.
assert.deepEqual(learnPedal([at(2,1),{axes:axes({0:.6,2:-1})},{axes:axes({0:-.6,2:1})},at(2,1)],{exclude:[g29]}),{id:G29,axis:2,rest:1,full:-1});
// --- Learning buttons, a D-pad read as one axis (Chrome: resting at 1.2857) or two (Firefox: 0 to ±1).
{
 let l=new ControlLearner('button',[device()],0);
 assert.equal(l.feed([device()],1),null);assert.deepEqual(l.feed([device({buttons:{5:1}})],2),{id:G29,button:5});
 // Held when the step began: counts once let go and pressed again.
 l=new ControlLearner('button',[device({buttons:{12:1}})],0);
 assert.equal(l.feed([device({buttons:{12:1}})],1),null);assert.equal(l.feed([device()],2),null);assert.deepEqual(l.feed([device({buttons:{12:1}})],3),{id:G29,button:12});
 l=new ControlLearner('button',[device({axes:axes({9:1.2857})})],0);
 assert.deepEqual(l.feed([device({axes:axes({9:-1})})],1),{id:G29,axis:9,value:-1});
 l=new ControlLearner('button',[device()],0);
 assert.deepEqual(l.feed([device({axes:axes({6:1})})],1),{id:G29,axis:6,value:1});
 // The wheel and pedals are never a button.
 l=new ControlLearner('button',[device()],0,{exclude:[g29]});
 assert.equal(l.feed([device({axes:axes({0:1})})],1),null);
}

// --- In a race: a G29 on its own, the pedals on another USB port.
const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
const events=[],target={hidden:false,dispatchEvent:e=>events.push(`${e.type}:${e.code}`)};
let menus=0,changes=0;const shifts=[];
const wheel=new WheelControls({target,storage,onMenu:()=>menus++,onShift:s=>shifts.push(s),onChange:()=>changes++});
assert.equal(wheel.configured,false);assert.equal(wheel.connected,false);
const wheelAt=(steer=0,buttons={},extra={})=>device({axes:axes({0:steer,9:1.2857,...extra}),buttons});
const pedalsAt=(throttle=1,brake=1,clutch=1)=>device({id:PEDALS,index:1,axes:axes({0:throttle,1:brake,2:clutch},3)});
for(const [role,b] of Object.entries({steer:g29,throttle:{id:PEDALS,axis:0,rest:1,full:-1},brake:{id:PEDALS,axis:1,rest:1,full:-1},clutch:{id:PEDALS,axis:2,rest:1,full:-1},
 up:{id:G29,button:4},down:{id:G29,button:5},g1:{id:G29,button:12},g2:{id:G29,button:13},gR:{id:G29,button:18},menu:{id:G29,button:9},camera:{id:G29,axis:9,value:-1},handbrake:{id:G29,button:0}}))assert.deepEqual(wheel.set(role,b),{ok:true},role);
assert.equal(wheel.configured,true);assert.deepEqual(wheel.devices,[G29,PEDALS]);
assert.deepEqual(JSON.parse(data.get(WHEEL_KEY)).throttle,{id:PEDALS,axis:0,rest:1,full:-1},'the map is saved');
// A pedal cannot take an axis direction another has; the other side of a shared axis it can.
assert.deepEqual(wheel.set('clutch',{id:PEDALS,axis:0,rest:1,full:-1}),{taken:'throttle'});
assert.deepEqual(wheel.set('steer',{id:PEDALS,axis:1,center:0,per90:.2}),{taken:'brake'});
// A button given to another role leaves the first.
assert.deepEqual(wheel.set('ghost',{id:G29,button:0}),{ok:true});assert.equal(wheel.map.handbrake,undefined);
assert.deepEqual(wheel.set('handbrake',{id:G29,button:0}),{ok:true});assert.equal(wheel.map.ghost,undefined);
// Plugged in: the pedals read 0 until touched, which is resting, not half pressed.
pads=[wheelAt(),pedalsAt(0,0,0)];wheel.poll(1/60);
assert.equal(wheel.connected,true);assert.deepEqual([wheel.throttle,wheel.brake,wheel.clutch],[0,0,0]);assert.equal(wheel.driving,false);
pads=[wheelAt(),pedalsAt(1,1,1)];wheel.poll(1/60);assert.deepEqual([wheel.throttle,wheel.brake,wheel.clutch],[0,0,0]);
pads=[wheelAt(),pedalsAt(0,1,1)];wheel.poll(1/60);assert.ok(Math.abs(wheel.throttle-.5)<.02,'touched once, 0 is half way');assert.equal(wheel.driving,true);
pads=[wheelAt(.15),pedalsAt(1,-1,1)];wheel.poll(1/60);
assert.equal(wheel.brake,1);assert.equal(wheel.throttle,0);assert.ok(Math.abs(wheel.degrees-67.5)<1e-9);assert.ok(Math.abs(wheel.steering-.5)<1e-9,'67.5° is half of 270°');
wheel.setLock(540);wheel.poll(1/60);assert.ok(Math.abs(wheel.steering-.25)<1e-9);wheel.setLock(123);assert.equal(wheel.lock,270);
// H lever: the slot it is in, neutral between them; paddles shift; Menu and the buttons' keys.
pads=[wheelAt(0,{13:1}),pedalsAt()];wheel.poll(1/60);assert.equal(wheel.lever,2);
pads=[wheelAt(0,{18:1}),pedalsAt()];wheel.poll(1/60);assert.equal(wheel.lever,-1);
pads=[wheelAt(),pedalsAt()];wheel.poll(1/60);assert.equal(wheel.lever,null);
events.length=0;
pads=[wheelAt(0,{4:1}),pedalsAt()];wheel.poll(1/60);wheel.poll(1/60);pads=[wheelAt(0,{5:1}),pedalsAt()];wheel.poll(1/60);
assert.deepEqual(shifts,[1,-1],'one shift per pull');
pads=[wheelAt(0,{9:1}),pedalsAt()];wheel.poll(1/60);wheel.poll(1/60);assert.equal(menus,1);
pads=[wheelAt(0,{0:1},{9:-1}),pedalsAt()];wheel.poll(1/60);
assert.deepEqual(events,['keydown:Space','keydown:KeyC']);assert.equal(wheel.holds('KeyC'),true);assert.equal(wheel.holds('KeyQ'),false);
pads=[wheelAt(),pedalsAt()];wheel.poll(1/60);assert.deepEqual(events.slice(2).sort(),['keyup:KeyC','keyup:Space']);
// Right after a setup step a button still held is no press (the one just learnt may be the Menu).
pads=[wheelAt(0,{9:1}),pedalsAt()];wheel.set('menu',{id:G29,button:9});wheel.poll(1/60);assert.equal(menus,1);
pads=[wheelAt(),pedalsAt()];wheel.poll(1/60);pads=[wheelAt(0,{9:1}),pedalsAt()];wheel.poll(1/60);assert.equal(menus,2);
// While a setup step listens, nothing drives; a hidden page reads nothing.
pads=[wheelAt(.3),pedalsAt(-1)];wheel.learn('ghost',()=>{});wheel.poll(1/60);
assert.equal(wheel.learning,true);assert.deepEqual([wheel.throttle,wheel.steering],[0,0]);wheel.stopLearning();
wheel.poll(1/60);assert.equal(wheel.throttle,1);
target.hidden=true;wheel.poll(1/60);assert.equal(wheel.throttle,0);target.hidden=false;
// Pedals unplugged: the wheel still steers; all unplugged, nothing is held.
pads=[wheelAt(.1)];wheel.poll(1/60);assert.equal(wheel.throttle,0);assert.ok(wheel.steering>0);assert.deepEqual(wheel.missing,[PEDALS]);
pads=[];wheel.poll(1/60);assert.equal(wheel.connected,false);assert.equal(wheel.steering,0);assert.equal(wheel.lever,undefined);
// Coming back, a never-touched pedal rests again until touched.
pads=[wheelAt(),pedalsAt(0,0,0)];wheel.poll(1/60);assert.equal(wheel.throttle,0);
// The map survives a reload; forget clears it.
const again=new WheelControls({target,storage});assert.deepEqual(again.map,wheel.map);
again.forget();assert.deepEqual(new WheelControls({target,storage}).map,{});
// A learnt binding through the WheelControls: a quarter turn read by the next frames.
{
 const w=new WheelControls({target,storage:null});let learnt=null;
 pads=[wheelAt()];w.learn('steer',b=>learnt=b);
 pads=[wheelAt(.2)];w.poll(0,0);w.poll(0,500);assert.equal(learnt,null);w.poll(0,900);
 assert.deepEqual(learnt,{id:G29,axis:0,center:0,per90:.2});assert.equal(w.learning,false);
}
// The Xbox controller leaves a device the wheel uses alone (a wheel may call itself a standard pad);
// at the wheel its X and A press the keyboard's X and Z (main.js shifts up and down).
{
 const sent=[];const pad=new GamepadControls({target:{dispatchEvent(e){if(e.type==='keydown')sent.push(e.code);}},ignore:p=>p.id===G29});
 pads=[device({mapping:'standard',buttons:{7:1}})];pad.poll(1/60);assert.equal(pad.connected,false);assert.equal(pad.unsupported,null);
 pads=[device({id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',mapping:'standard',buttons:{2:1}})];pad.poll(1/60);pad.poll(1/60);
 pads=[device({id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',mapping:'standard',buttons:{0:1}})];pad.poll(1/60);
 assert.deepEqual(sent,['KeyX','KeyZ']);
 pad.suspended=true;pad.poll(1/60);assert.equal(pad.connected,false);
}

// --- The gearbox the player shifts.
{
 const box=new ManualGearbox(),car={vx:0,vy:0,gear:1};
 box.sync(car);assert.equal(box.gear,1);
 assert.equal(box.up(),2);box.up();box.up();box.up();assert.equal(box.up(),5,'5th is the top');
 car.vx=170/3.6;assert.equal(box.down(car),4);assert.equal(box.down(car),4,'no downshift that over-revs the engine (170 km/h in 3rd)');car.vx=200/3.6;box.gear=5;assert.equal(box.down(car),5,'nor 200 km/h in 4th');
 car.vx=60/3.6;box.gear=2;assert.equal(box.down(car),1);assert.equal(box.down(car),1,'no reverse while rolling');
 car.vx=1/3.6;assert.equal(box.down(car),-1);assert.equal(box.down(car),-1);assert.equal(box.up(),1,'up from reverse is 1st');
 box.gear=0;assert.equal(box.up(),1,'up from neutral is 1st');
 // The H lever: moving it engages its gear; left where it is, the paddles still shift.
 box.setLever(3);assert.equal(box.gear,3);box.up();assert.equal(box.gear,4);box.setLever(3);assert.equal(box.gear,4);
 box.setLever(null);assert.equal(box.gear,0);box.setLever(undefined);assert.equal(box.gear,0,'unplugged leaves the gear');
 box.sync({gear:4},null);assert.equal(box.gear,0,'taken over with the lever in neutral');box.sync({gear:3},undefined);assert.equal(box.gear,3);
 box.sync({gear:'x'});assert.equal(box.gear,1);
}

// --- Physics: the gear the player puts in, neutral, reverse, the clutch, and a wheel's steering.
const track=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
function flatCar(kmh=0){
 const c=new TestCar(track);
 c.sample=()=>({i:0,u:0,s:500,d:0,z:.055,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});
 c.reset();c.x=c.y=c.heading=0;c.vx=kmh/3.6;c.surface=c.sample();return c;
}
const run=(c,command,seconds)=>{for(let i=0;i<Math.round(seconds*120);i++)c.step({...idle,...command},1/120);return Math.hypot(c.vx,c.vy)*3.6;};
{
 // Held in 1st: it never changes up and stops at the limiter (7000 rpm is about 64 km/h in 1st).
 const c=flatCar(),kmh=run(c,{throttle:1,gear:1},12);
 assert.equal(c.gear,1);assert.equal(c.manualGear,true);assert.equal(c.shifts,0);
 assert.ok(kmh>58&&kmh<66,`1st tops out at the limiter: ${kmh}`);assert.ok(c.rpm>6700,`at the limiter ${c.rpm}`);
 // Up to 3rd it pulls on.
 const third=run(c,{throttle:1,gear:3},6);assert.ok(third>kmh+20,`3rd pulls on: ${third}`);assert.equal(c.shifts,1,'one change counted: 1st straight to 3rd');
 // Neutral: no drive, no engine braking (it rolls further than in gear), the engine revs free.
 const a=flatCar(100),b=flatCar(100);run(a,{gear:0},4);run(b,{gear:2},4);
 assert.ok(Math.hypot(a.vx,a.vy)>Math.hypot(b.vx,b.vy)+1,'neutral coasts further than in gear');
 run(a,{gear:0,throttle:1},.5);assert.ok(a.rpm>REDLINE_RPM-100,`free revs ${a.rpm}`);
 const before=Math.hypot(a.vx,a.vy);run(a,{gear:0,throttle:1},1);assert.ok(Math.hypot(a.vx,a.vy)<before,'neutral never accelerates');
 // The clutch pedal: floored, nothing reaches the wheels; let out, the car goes.
 const d=flatCar();assert.ok(run(d,{throttle:1,gear:1,clutch:1},3)<1,'declutched, no drive');assert.ok(d.rpm>REDLINE_RPM-100);
 assert.ok(run(d,{throttle:1,gear:1,clutch:.2},3)>20,'clutch let out, it drives');
 const half=flatCar(),full=flatCar();run(half,{throttle:1,gear:1,clutch:.55},2);run(full,{throttle:1,gear:1},2);
 assert.ok(half.vx>.5&&half.vx<full.vx*.8,'a slipping clutch drives less');
 // R: the throttle backs up, nothing without it; Q still backs up in manual.
 const r=flatCar();run(r,{gear:-1},1);assert.ok(Math.abs(r.vx)<.05,'R alone does not move');
 run(r,{gear:-1,throttle:1},2);assert.ok(r.vx<-2,`R and throttle back up ${r.vx}`);assert.equal(r.gear,-1);
 const q=flatCar();run(q,{gear:3,reverse:1},2);assert.ok(q.vx<-2&&q.gear===-1,'Q backs up');run(q,{gear:3},.1);assert.equal(q.gear,3,'Q let go: the gear asked for again');
 // An H lever thrown into 1st at 150 km/h: the engine screams and brakes hard, nothing breaks.
 const h=flatCar(150),soft=flatCar(150);run(h,{gear:1},1);run(soft,{gear:4},1);
 assert.ok(Number.isFinite(h.vx)&&h.rpm<=REDLINE_RPM+80&&h.vx<soft.vx,'over-rev: hard engine braking, rpm capped');
 // No burnout stunt in neutral.
 const n=flatCar();run(n,{gear:0,throttle:1,handbrake:1},1);assert.ok(n.burnout<.01);
 // Without a gear asked for the gearbox is automatic as ever; a reset hands it back.
 const auto=flatCar();run(auto,{throttle:1},12);assert.ok(auto.gear>=3&&auto.manualGear===false,`automatic ${auto.gear}`);
 c.recover();assert.equal(c.manualGear,false);assert.equal(c.gear,1);
 // A racing wheel turns the road wheels at once; the keyboard's input is smoothed as before.
 const w=flatCar(50),k=flatCar(50);w.step({...idle,right:.4,wheel:true},1/120);k.step({...idle,right:.4},1/120);
 assert.equal(w.steerInput,-.4);assert.ok(k.steerInput>-.1&&k.steerInput<0);
}
// Câmbio automático with the player's say (AutoShift, the team's pedido of 10-22): a gear up goes in and stays (alone
// the automatic would drop it at once), the automatic carries on after AUTO_HOLD; held, it still shifts up at its own
// point, never to the limiter; down never over-revs, never below 1st; Q lets go.
{
 const drive=(c,shift,command,seconds)=>{for(let i=0;i<Math.round(seconds*120);i++){const gear=shift.hold(c,1/120,command.reverse);c.step({...idle,...command,...(gear===undefined?{}:{gear})},1/120);}};
 const c=flatCar(60),shift=new AutoShift();c.gear=2;
 assert.equal(shift.ask(c,1),3);assert.equal(shift.ask(c,1),4,'two presses, two gears');
 drive(c,shift,{throttle:.2},1);assert.equal(c.gear,4,'held in 4th');assert.equal(shift.holding,true);
 const alone=flatCar(60);alone.gear=4;run(alone,{throttle:.2},.5);assert.ok(alone.gear<4,`alone the automatic drops back: ${alone.gear}`);
 drive(c,shift,{throttle:.2},AUTO_HOLD);assert.equal(shift.holding,false);assert.equal(c.manualGear,false);assert.ok(c.gear<4,`then the automatic carries on: ${c.gear}`);
 // Down at 90 km/h in 3rd: 2nd, then floored it goes back up at the automatic's point, short of the limiter.
 const d=flatCar(90),down=new AutoShift();d.gear=3;
 assert.equal(down.ask(d,-1),2);let top=0;
 for(let i=0;i<240;i++){const gear=down.hold(d,1/120,0);d.step({...idle,throttle:1,gear},1/120);top=Math.max(top,d.rpm);}
 assert.equal(d.gear,3,'up again while held');assert.ok(top<REDLINE_RPM,`never to the limiter: ${top}`);
 // Refused: down where the engine would over-rev, down from 1st, up from 5th; Q lets go at once.
 const fast=flatCar(100);fast.gear=3;assert.equal(new AutoShift().ask(fast,-1),null,'100 km/h in 2nd would over-rev');
 const first=flatCar(20);first.gear=1;assert.equal(new AutoShift().ask(first,-1),null);
 const fifth=flatCar(200);fifth.gear=5;assert.equal(new AutoShift().ask(fifth,1),null);
 const q=new AutoShift();q.ask(c,1);assert.equal(q.hold(c,1/120,1),undefined);assert.equal(q.holding,false);
 const reset=new AutoShift();reset.ask(c,1);assert.equal(reset.cancel(),true);assert.equal(reset.cancel(),false);
}
// The engine sound and the gauge: neutral is N, a gear put in shows at a standstill, R is R.
{
 const audio=new CarAudio(),car={vx:0,vy:0,surface:{onRoad:true},gear:1,rpm:IDLE_RPM,manualGear:true};
 audio.update(car,{},0,false,'chase');assert.equal(audio.state.gear,1,'in gear at a standstill');
 car.gear=0;car.rpm=5000;audio.update(car,{throttle:1},0,false,'chase');assert.equal(audio.state.gear,'N');assert.equal(audio.state.rpm,5000);
 car.gear=-1;audio.update(car,{},0,false,'chase');assert.equal(audio.state.gear,'R');
 car.manualGear=false;car.gear=1;audio.update(car,{},0,false,'chase');assert.equal(audio.state.gear,'N','automatic at rest still reads N');
}
// The driver's hand: no reaching for the knob before a change the player has not made; neutral
// puts the lever in the middle; the player's clutch pedal moves the left foot.
{
 const hands=new DriverControls();let anticipated=false;
 for(let i=0;i<240;i++){const info=hands.update({throttle:1,gear:2,kmh:60+i*.4,manual:true},1/120);anticipated||=info.anticipating;}
 assert.equal(anticipated,false);
 let info;for(let i=0;i<120;i++)info=hands.update({throttle:0,gear:0,kmh:80,manual:true},1/120);
 assert.equal(info.visualGear,0);assert.deepEqual(info.lever,[0,0]);
 for(let i=0;i<120;i++)info=hands.update({throttle:0,gear:3,kmh:80,manual:true,clutch:1},1/120);
 assert.equal(info.visualGear,3);assert.ok(info.clutch>.9&&info.leftFoot>.9,'clutch pedal held');
}
console.log('Wheel passed: readings, saved map, learning (wheel, pedals, buttons, D-pads), race inputs, several devices, gearbox, physics, sound and hands.');
