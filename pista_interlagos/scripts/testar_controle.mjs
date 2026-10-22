import assert from 'node:assert/strict';
// The Xbox / PlayStation controller (teste/gamepad-controls.js) with a fake Gamepad API: triggers and
// stick, buttons pressed as keys (once per press) where the pilot is (at the wheel or on foot, pad-bindings.js),
// the player's own buttons (saved, swapped, cleaned), learning a button, Menu, the right stick's look and the rumble.
const listeners={};globalThis.addEventListener=(type,fn)=>{(listeners[type]??=[]).push(fn);};
globalThis.document={hidden:false};
globalThis.KeyboardEvent=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
let pads=[];
Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>pads},configurable:true});
const {GamepadControls,MENU_BUTTON,STEERING_CURVES,stickValue,triggerValue}=await import('../teste/gamepad-controls.js');
const {PadBindings,PAD_ACTIONS,PAD_STORAGE,PAD_PLACES,buttonName,padStyle,normalizePad}=await import('../teste/pad-bindings.js');
const events=[],target={dispatchEvent:e=>events.push(`${e.type}:${e.code}`)};
const effects=[];
function pad({id='Xbox 360 Controller (XInput STANDARD GAMEPAD)',index=0,mapping='standard',axes=[0,0,0,0],buttons={}}={}){
 return {id,index,mapping,connected:true,axes,buttons:Array.from({length:17},(_,i)=>{const v=buttons[i]??0;return {pressed:v>.5,value:v};}),
  vibrationActuator:{playEffect:(type,params)=>{effects.push({type,...params});return Promise.resolve('complete');}}};
}
let menus=0,lookEnds=0,where='car';const looks=[],changes=[];
const controls=new GamepadControls({target,onMenu:()=>menus++,onLook:(dx,dy)=>looks.push([dx,dy]),onLookEnd:()=>lookEnds++,onChange:c=>changes.push(c.connected),place:()=>where});
// No controller: nothing moves.
controls.poll(1/60);
assert.equal(controls.connected,false);assert.deepEqual([controls.throttle,controls.brake,controls.steering],[0,0,0]);
// Triggers: analog, a resting trigger gives exactly 0 (a tiny brake would hold the car), full gives 1.
pads=[pad({buttons:{7:.5,6:.02}})];controls.poll(1/60);
assert.equal(controls.connected,true);assert.equal(controls.name,'Xbox 360 Controller');assert.deepEqual(changes,[true]);
assert.ok(controls.throttle>.45&&controls.throttle<.5,`half RT ${controls.throttle}`);assert.equal(controls.brake,0);
pads=[pad({buttons:{6:1}})];controls.poll(1/60);assert.equal(controls.brake,1);assert.equal(controls.throttle,0);
assert.equal(triggerValue(undefined),0);assert.equal(triggerValue(1.2),1);
// Left stick: a dead zone in the middle, full lock before the stick's rim, the curve in between.
assert.equal(stickValue(.1),0);assert.equal(stickValue(-.11),0);
assert.equal(stickValue(.95),1);assert.equal(stickValue(-1),-1);
const half=stickValue(.5),linear=stickValue(.5,STEERING_CURVES.direta),gentle=stickValue(.5,STEERING_CURVES.suave);
assert.ok(gentle<half&&half<linear&&linear<.5,`curves ${gentle} ${half} ${linear}`);
pads=[pad({axes:[-.6,0,0,0]})];controls.poll(1/60);assert.ok(controls.steering<0&&controls.driving,'stick left steers left');
// Up and down on the same stick walk (forward is up, as the axis grows downwards); never a driving input.
pads=[pad({axes:[0,-1,0,0]})];controls.poll(1/60);assert.equal(controls.walk,1);assert.equal(controls.driving,false);
pads=[pad({axes:[0,.5,0,0]})];controls.poll(1/60);assert.ok(controls.walk<0&&controls.walk>-1);
pads=[pad({axes:[0,.05,0,0]})];controls.poll(1/60);assert.equal(controls.walk,0);
pads=[pad({axes:[-.6,0,0,0]})];controls.poll(1/60);
controls.setSteering('direta');controls.poll(1/60);assert.ok(Math.abs(controls.steering-stickValue(-.6,1))<1e-12);
controls.setSteering('forte');assert.equal(controls.curve,STEERING_CURVES.normal);
// Buttons at the wheel: one keydown per press, a keyup on release. The team's pedido of 10-22: Y the handbrake, X up
// and A down a gear, ↓ out of the car (the horn to L3, the lights to ←, the IGN to →).
events.length=0;
pads=[pad({buttons:{3:1}})];controls.poll(1/60);controls.poll(1/60);
assert.deepEqual(events,['keydown:Space']);
pads=[pad()];controls.poll(1/60);assert.deepEqual(events,['keydown:Space','keyup:Space']);
const press=index=>{events.length=0;pads=[pad({buttons:{[index]:1}})];controls.poll(1/60);pads=[pad()];controls.poll(1/60);return events.filter(e=>e.startsWith('keydown:')).map(e=>e.slice(8)).join();};
assert.deepEqual([3,2,0,13,1,10,14,15,4,5,8,11,12].map(press),['Space','KeyX','KeyZ','KeyF','KeyQ','KeyH','KeyK','KeyL','KeyI','KeyC','KeyR','KeyB','KeyG']);
// On foot, as the controller always was, and ↓ back into the car too.
where='foot';
assert.deepEqual([0,1,2,3,13,5,10,8,14,12,15,4,11].map(press),['Space','KeyQ','KeyE','KeyF','KeyF','KeyC','ShiftLeft','KeyR','Digit1','Digit2','Digit3','','']);
// A button held while the pilot gets out lets go of the key it pressed, never of the one it has on foot.
where='car';events.length=0;pads=[pad({buttons:{13:1}})];controls.poll(1/60);where='foot';controls.poll(1/60);pads=[pad()];controls.poll(1/60);
assert.deepEqual(events,['keydown:KeyF','keyup:KeyF']);where='car';
// The triggers press no key; every command presses a real key of the game, one per button and place.
events.length=0;pads=[pad({buttons:{6:1,7:1}})];controls.poll(1/60);pads=[pad()];controls.poll(1/60);assert.deepEqual(events,[]);
for(const a of PAD_ACTIONS){assert.match(a.code,/^(Key[A-Z]|Digit[1-3]|Space|ShiftLeft)$/);for(const b of a.buttons)assert.ok(![6,7,MENU_BUTTON].includes(b),a.id);}
for(const [place] of PAD_PLACES){const used=PAD_ACTIONS.filter(a=>a.place===place).flatMap(a=>a.buttons);assert.equal(new Set(used).size,used.length,`${place}: one command per button`);}
// Learning a button (the settings): a press only names it, Menu too, and its release presses nothing; a button held
// when the learning starts lets go of its key and is not learnt.
{
 const learnt=[],before=menus;events.length=0;
 controls.listen(i=>learnt.push(i));pads=[pad({buttons:{2:1}})];controls.poll(1/60);pads=[pad({buttons:{2:1,[MENU_BUTTON]:1}})];controls.poll(1/60);
 controls.listen(null);pads=[pad()];controls.poll(1/60);
 assert.deepEqual(learnt,[2,MENU_BUTTON]);assert.deepEqual(events,[]);assert.equal(menus,before);
 pads=[pad({buttons:{1:1}})];controls.poll(1/60);controls.listen(i=>learnt.push(i));controls.poll(1/60);controls.listen(null);pads=[pad()];controls.poll(1/60);
 assert.deepEqual(events,['keydown:KeyQ','keyup:KeyQ']);assert.deepEqual(learnt,[2,MENU_BUTTON]);
}
// O controle do seu jeito: a button another command of the same place had swaps over; the other place keeps its own;
// saved at once and read back; triggers and Menu refused; a second button; one left empty; Restaurar.
{
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const mine=new PadBindings(storage);let heard=0;mine.onChange(()=>heard++);
 assert.equal(mine.code('car',3),'Space');assert.equal(mine.code('foot',3),'KeyF');assert.equal(mine.changed,false);
 const result=mine.set('buzina',0,3);
 assert.deepEqual(result.moved,{id:'freioMao',slot:0,button:10});assert.equal(heard,1);
 assert.deepEqual([mine.code('car',3),mine.code('car',10),mine.code('foot',3)],['KeyH','Space','KeyF'],'Y the horn, L3 the handbrake; on foot Y as it was');
 assert.deepEqual(JSON.parse(memory.get(PAD_STORAGE)).buttons,{freioMao:[10,null],buzina:[3,null]});
 assert.equal(new PadBindings(storage).code('car',3),'KeyH','read back');
 const own=new GamepadControls({target,bindings:mine,place:()=>'car'});events.length=0;
 pads=[pad({buttons:{3:1}})];own.poll(1/60);pads=[pad()];own.poll(1/60);assert.deepEqual(events,['keydown:KeyH','keyup:KeyH']);
 assert.equal(mine.set('buzina',0,7).ok,false);assert.equal(mine.set('buzina',0,MENU_BUTTON).ok,false);assert.equal(mine.set('nada',0,1).ok,false);
 assert.equal(mine.set('buzina',0,3).same,true);
 mine.set('limpador',1,16);assert.equal(mine.code('car',16),'KeyJ');
 mine.clear('sair',0);assert.equal(mine.code('car',13),null);assert.equal(mine.code('foot',13),'KeyF');
 mine.set('voltar',1,8);assert.deepEqual([mine.code('foot',8),mine.code('foot',13)],['KeyF','KeyR'],"within a command's place too, swapped");
 mine.reset();assert.equal(memory.has(PAD_STORAGE),false);assert.equal(mine.changed,false);assert.equal(mine.code('car',13),'KeyF');
 // A save from elsewhere, checked: no trigger, Menu, string or unknown button; a button once per place.
 memory.set(PAD_STORAGE,JSON.stringify({buttons:{freioMao:[7,'3'],buzina:[3,3],sair:'x',voltar:[99,0],nada:[1]}}));
 const odd=new PadBindings(storage);
 assert.deepEqual([odd.buttons.freioMao,odd.buttons.buzina,odd.buttons.sair,odd.buttons.voltar,odd.buttons.pular],[[null,null],[3,null],[13,null],[null,0],[null,null]]);
 assert.deepEqual(normalizePad([1,2]),normalizePad(null));
 memory.set(PAD_STORAGE,'{oops');assert.equal(new PadBindings(storage).changed,false);
}
// The names follow the controller: Xbox's letters, PlayStation's shapes.
assert.equal(padStyle('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'),'playstation');
assert.equal(padStyle('Xbox 360 Controller (XInput STANDARD GAMEPAD)'),'xbox');assert.equal(padStyle(undefined),'xbox');
assert.deepEqual([0,1,2,3,4,8,9].map(i=>buttonName(i,'playstation')),['✕','○','□','△','L1','Share','Options']);
assert.deepEqual([0,3,4,13].map(i=>buttonName(i)),['A','Y','LB','↓']);
// Menu: once per press, however long it is held.
pads=[pad({buttons:{[MENU_BUTTON]:1}})];controls.poll(1/60);controls.poll(1/60);pads=[pad()];controls.poll(1/60);
pads=[pad({buttons:{[MENU_BUTTON]:1}})];controls.poll(1/60);assert.equal(menus,2);pads=[pad()];controls.poll(1/60);
// Right stick: looks around in mouse pixels, in proportion to the frame time.
looks.length=0;pads=[pad({axes:[0,0,1,0]})];controls.poll(1/60);controls.poll(1/30);
assert.equal(looks.length,2);assert.ok(looks[0][0]>0&&Math.abs(looks[1][0]-2*looks[0][0])<1e-9&&looks[0][1]===0);
controls.poll(0);assert.equal(looks.length,2,'no look without time');
// Let go (back in its dead zone), the look ends, once; the pad going away mid-look ends it too.
assert.equal(lookEnds,0,'held, no end');pads=[pad({axes:[0,0,.2,0]})];controls.poll(1/60);assert.equal(lookEnds,1,'let go, the look ends');
controls.poll(1/60);assert.equal(lookEnds,1,'only once');
pads=[pad({axes:[0,0,0,-1]})];controls.poll(1/60);pads=[];controls.poll(1/60);assert.equal(lookEnds,2,'pad gone mid-look');
pads=[pad()];controls.poll(1/60);assert.equal(lookEnds,2);
// Two controllers: the one being used drives.
pads=[pad({id:'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',index:0}),pad({index:1,buttons:{7:1}})];controls.poll(1/60);
assert.equal(controls.pad.index,1);assert.equal(controls.throttle,1);
pads=[pad({id:'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',index:0}),pad({index:1})];controls.poll(1/60);assert.equal(controls.pad.index,1,'stays on the last one used');
// Only standard pads drive. A device that is no standard pad (pedals, a wheel, a pad its browser does
// not map) has its pedals and sticks elsewhere: alone, it is named as unsupported and moves nothing
// (its axes resting at -1 once spun the camera, its button 7 accelerated); beside a pad, it is ignored.
const pedals=axes=>pad({id:'Pedals (Vendor: 1234 Product: 5678)',index:2,mapping:'',axes,buttons:{7:1,6:1}});
pads=[pedals([-1,-1,-1,-1])];changes.length=0;looks.length=0;controls.poll(1/60);controls.poll(1/60);
assert.equal(controls.connected,false);assert.equal(controls.unsupported,'Pedals');assert.deepEqual(changes,[false],'the settings hear of it once');
assert.deepEqual([controls.throttle,controls.brake,controls.steering,controls.walk,looks.length],[0,0,0,0,0]);
pads=[pad({index:1}),pedals([1,-1,1,1])];controls.poll(1/60);controls.poll(1/60);
assert.equal(controls.pad.index,1);assert.equal(controls.unsupported,null);assert.deepEqual([controls.throttle,controls.brake,controls.steering],[0,0,0]);
// A pad whose trigger rests above zero (worn) seems touched all the time: once the player takes up the
// other pad, it never takes the wheel back, and nothing switches to and fro.
const worn=pad({id:'Worn pad (STANDARD GAMEPAD Vendor: 0000 Product: 0001)',index:3,buttons:{6:.2}});
pads=[pad({index:1}),worn];controls.poll(1/60);
pads=[pad({index:1,buttons:{7:1}}),worn];controls.poll(1/60);assert.equal(controls.pad.index,1,'the pad just taken up');
changes.length=0;pads=[pad({index:1}),worn];for(let k=0;k<30;k++)controls.poll(1/60);
assert.equal(controls.pad.index,1,'the worn pad stays out');assert.deepEqual(changes,[],'no switching');
// Alone, the worn pad's trigger counts from where it rests: no brake dragging the car at rest, and no
// driving input taking the wheel from the automatic pilot (main.js takeWheel); pressed, it brakes.
const wornAt=value=>pad({id:worn.id,index:3,buttons:{6:value}});
pads=[wornAt(.2)];for(let k=0;k<3;k++)controls.poll(1/60);
assert.equal(controls.pad.index,3);assert.equal(controls.brake,0);assert.equal(controls.driving,false,'a worn trigger at rest drives nothing');
pads=[wornAt(.6)];controls.poll(1/60);assert.ok(controls.brake>.4&&controls.brake<.55,`half the worn LT ${controls.brake}`);
pads=[wornAt(1)];controls.poll(1/60);assert.equal(controls.brake,1);
pads=[wornAt(.2)];controls.poll(1/60);assert.equal(controls.brake,0);
// Sticks resting a little off centre (an Xbox pad in spec may rest up to XInput's dead zone, a worn one
// near it): no steering, no driving input taking the wheel from the automatic pilot, and no look
// turning the camera every frame (before: the left stick at 0.15 steered, the right one orbited).
looks.length=0;pads=[pad({axes:[.15,-.2,.22,-.24]})];for(let k=0;k<3;k++)controls.poll(1/60);
assert.deepEqual([controls.steering,controls.walk,controls.driving,looks.length],[0,0,false,0],'resting sticks do nothing');
pads=[pad({axes:[.3,0,0,0]})];controls.poll(1/60);assert.ok(controls.steering>0&&!controls.driving,'a stick just past its dead zone steers a little, without taking the wheel');
// A held button still holds its key after the game let go of the keys (main.js: the menu, a pause).
pads=[pad({buttons:{1:1}})];controls.poll(1/60);assert.equal(controls.holds('KeyQ'),true);assert.equal(controls.holds('KeyE'),false);
pads=[pad()];controls.poll(1/60);assert.equal(controls.holds('KeyQ'),false);
// A held button lets go when the controller goes away or the page is hidden.
events.length=0;pads=[pad({buttons:{1:1}})];controls.poll(1/60);pads=[];controls.poll(1/60);
assert.deepEqual(events,['keydown:KeyQ','keyup:KeyQ']);assert.equal(controls.connected,false);assert.equal(changes.at(-1),false);
events.length=0;pads=[pad({buttons:{11:1,7:1}})];controls.poll(1/60);document.hidden=true;controls.poll(1/60);document.hidden=false;
assert.deepEqual(events,['keydown:KeyB','keyup:KeyB']);assert.equal(controls.throttle,0);
// The PlayStation name loses its brackets too; the controller connecting is read at once.
pads=[pad({id:'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'})];listeners.gamepadconnected[0]();
assert.equal(controls.name,'DualSense Wireless Controller');
// Rumble: harder hits shake longer and stronger; small knocks and the option turned off do not.
controls.bump(3);assert.equal(effects.length,0);
controls.bump(6);controls.bump(30);assert.equal(effects.length,2);
assert.equal(effects[0].type,'dual-rumble');assert.ok(effects[1].strongMagnitude===1&&effects[1].duration>effects[0].duration&&effects[0].strongMagnitude>0);
controls.rumble=false;controls.bump(30);assert.equal(effects.length,2);
console.log('Controller passed: analog triggers and stick with dead zones, curves, buttons as keys at the wheel and on foot, own buttons saved and swapped, learning, Menu, right-stick look and its let-go, two pads (a worn one stays out), standard pads only, held buttons, release on disconnect/hidden, rumble.');
