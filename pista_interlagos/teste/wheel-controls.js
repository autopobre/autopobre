// Racing wheels, pedals and gear levers (Gamepad API). Every model reports its wheel, pedals and
// buttons its own way, and every browser too (a pedal at rest reads 1, -1 or 0, some pedal sets share
// one axis, some axes read 0 until first touched), so nothing is assumed: the Controles tab learns
// each control from the player (ControlLearner: turn the wheel a quarter, press each pedal, push each
// button) and the map is kept by device name. Several devices can share it: a wheel with its pedals
// and shifter, or pedals and a lever plugged in apart. The buttons press the game's keys, as the
// Xbox controller's do (gamepad-controls.js).
export const WHEEL_KEY='opala99-volante-v1';
const GEAR_LABELS={g1:['1ª',1],g2:['2ª',2],g3:['3ª',3],g4:['4ª',4],g5:['5ª',5],gR:['Ré',-1]};
export const ROLES=Object.freeze({
 steer:{kind:'steer',label:'Direção'},
 throttle:{kind:'pedal',label:'Acelerador'},
 brake:{kind:'pedal',label:'Freio'},
 clutch:{kind:'pedal',label:'Embreagem'},
 up:{kind:'button',label:'Subir marcha'},
 down:{kind:'button',label:'Descer marcha'},
 ...Object.fromEntries(Object.entries(GEAR_LABELS).map(([role,[label,gear]])=>[role,{kind:'button',label:`Câmbio H: ${label}`,gear}])),
 menu:{kind:'button',label:'Menu (pausa)'},
 handbrake:{kind:'button',label:'Freio de mão',keys:['Space']},
 reverse:{kind:'button',label:'Ré, segurando',keys:['KeyQ']},
 camera:{kind:'button',label:'Trocar câmera',keys:['KeyC']},
 lookBack:{kind:'button',label:'Olhar para trás',keys:['KeyB']},
 action:{kind:'button',label:'Ação (conversar, capô)',keys:['KeyE']},
 ignition:{kind:'button',label:'Ignição (IGN)',keys:['KeyL','KeyF']},
 starter:{kind:'button',label:'Partida, segurando',keys:['KeyI']},
 reset:{kind:'button',label:'Reposicionar / reboque',keys:['KeyR']},
 ghost:{kind:'button',label:'Fantasma',keys:['KeyG']},
 lights:{kind:'button',label:'Faróis',keys:['KeyH']},
 wipers:{kind:'button',label:'Limpador',keys:['KeyJ']}
});
export const H_ROLES=Object.freeze(Object.keys(GEAR_LABELS));
// The guided setup, in order; the first three are needed to drive, the rest can be skipped.
export const GUIDED=Object.freeze(['steer','throttle','brake','clutch','up','down',...H_ROLES]);
export const REQUIRED=Object.freeze(['steer','throttle','brake']);
// Full lock in the game, in degrees of the wheel from one side to the other (the Controles tab).
export const WHEEL_LOCKS=Object.freeze([180,270,360,540,900]);
export const WHEEL_LOCK_DEFAULT=270;
const PEDAL_DEADZONE=.03,STEER_DEADZONE=.4,DRIVING=.05;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const slot=n=>Number.isInteger(n)&&n>=0&&n<64;
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
function readPads(){try{return [...(globalThis.navigator?.getGamepads?.()??[])].filter(Boolean);}catch{return [];}}
// Chrome adds "(Vendor: 046d Product: c24f)" and Firefox "046d-c24f-" to the name.
export const deviceName=id=>String(id??'').replace(/\s*\(.*\)\s*$/,'').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i,'').trim()||'Volante';

// A saved binding, checked field by field (anything else is dropped).
function normalizeBinding(kind,b){
 if(!b||typeof b!=='object'||typeof b.id!=='string'||!b.id||b.id.length>200)return null;
 const source=slot(b.axis)?{id:b.id,axis:b.axis}:slot(b.button)&&kind!=='steer'?{id:b.id,button:b.button}:null;
 if(!source)return null;
 if(kind==='steer')return finite(b.center)&&Math.abs(b.center)<=1&&finite(b.per90)&&Math.abs(b.per90)>=.01&&Math.abs(b.per90)<=2.5?{...source,center:b.center,per90:b.per90}:null;
 if(kind==='pedal')return finite(b.rest)&&finite(b.full)&&Math.abs(b.rest)<=1.5&&Math.abs(b.full)<=1.5&&Math.abs(b.full-b.rest)>=.2?{...source,rest:b.rest,full:b.full}:null;
 // A button, or a position of an axis (a D-pad the browser reads as one axis).
 if(source.axis!==undefined)return finite(b.value)&&Math.abs(b.value)<=2?{...source,value:b.value}:null;
 return source;
}
export function normalizeWheelMap(value){
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},map={};
 for(const [role,{kind}] of Object.entries(ROLES)){const binding=normalizeBinding(kind,source[role]);if(binding)map[role]=binding;}
 return map;
}
export const sameSource=(a,b)=>a.id===b.id&&a.axis===b.axis&&a.button===b.button&&(a.value===undefined||b.value===undefined||Math.abs(a.value-b.value)<.05);

// Pedal travel from its rest to the floor, 0-1 (a pedal set on one shared axis reads 0 on the other side).
export function pedalValue(value,b){
 if(!finite(value))return 0;
 const travel=(value-b.rest)/(b.full-b.rest);
 return clamp((travel-PEDAL_DEADZONE)/(1-PEDAL_DEADZONE),0,1);
}
// The wheel's angle in degrees, right positive: the setup measured a quarter turn to the right.
export const steeringDegrees=(value,b)=>finite(value)?(value-b.center)/b.per90*90:0;
// How far the wheel itself turns each way before its stop (the shorter side).
export function wheelRange(b){
 const s=Math.sign(b.per90);
 return Math.min(Math.abs((s-b.center)/b.per90*90),Math.abs((-s-b.center)/b.per90*90));
}
// Steering for physics, -1 to 1: full lock at half the chosen lock each way, or before the wheel's stop.
export function steeringCommand(value,b,lock=WHEEL_LOCK_DEFAULT){
 const half=Math.min(lock/2,wheelRange(b)*.98),degrees=steeringDegrees(value,b);
 return Math.abs(degrees)<STEER_DEADZONE?0:clamp(degrees/half,-1,1);
}

// Learns one control from what the player does with it, against how every axis and button of every
// device stood when the step began. An axis that has read exactly 0 all along may be one never
// touched yet (Chrome reads 0 until the device's first report): its first reading is its start.
const STEADY_STEER=800,STEADY_PEDAL=400,STILL=.008;
export class ControlLearner {
 constructor(kind,pads,now,{exclude=[]}={}){
  this.kind=kind;this.exclude=exclude;this.base=new Map();this.untouched=new Set();this.fresh=new Set();this.tracks=new Map();this.progress=0;
  for(const [key,value,source] of this.inputs(pads)){this.base.set(key,value);if(value===0&&source.axis!==undefined)this.untouched.add(key);}
 }
 // Every candidate input: [key, value, binding source].
 *inputs(pads){
  for(const pad of pads){
   for(let axis=0;axis<pad.axes.length;axis++){
    const source={id:pad.id,axis};
    if(!this.exclude.some(b=>b.id===source.id&&b.axis===axis))yield [`${pad.index}|${pad.id}|a${axis}`,pad.axes[axis],source];
   }
   if(this.kind==='steer')continue;
   for(let button=0;button<pad.buttons.length;button++){
    const source={id:pad.id,button},b=pad.buttons[button];
    if(!this.exclude.some(x=>sameSource(x,source)))yield [`${pad.index}|${pad.id}|b${button}`,this.kind==='button'?(b.pressed||b.value>.5?1:0):b.value??0,source];
   }
  }
 }
 // Each frame: the binding once the control is learnt, else null (progress 0-1 says how close).
 feed(pads,now){
  if(this.kind==='button')return this.feedButton(pads);
  let best=null,second=0;
  for(const [key,value,source] of this.inputs(pads)){
   if(!finite(value))continue;
   // A device plugged in meanwhile starts where it is first read; an axis at exactly 0 since the step
   // began starts at its first other reading (fresh: for the wheel, one read first near the middle
   // may already be on its way). A D-pad axis rests beyond ±1: never a wheel or pedal.
   if(!this.base.has(key)){this.base.set(key,value);this.fresh.add(key);continue;}
   if(this.untouched.has(key)){if(value===0)continue;this.untouched.delete(key);this.base.set(key,value);this.fresh.add(key);}
   const base=this.base.get(key);
   if(source.axis!==undefined&&Math.abs(base)>1.01)continue;
   const t=this.tracks.get(key)??{lo:base,hi:base,anchor:value,since:now};this.tracks.set(key,t);
   t.lo=Math.min(t.lo,value);t.hi=Math.max(t.hi,value);
   if(Math.abs(value-t.anchor)>STILL){t.anchor=value;t.since=now;}
   const from=this.fresh.has(key)&&Math.abs(base)<.25?0:base,size=this.kind==='steer'?Math.abs(value-from):t.hi-t.lo,entry={key,value,source,base,t,size};
   if(!best||size>best.size){second=best?.size??0;best=entry;}else second=Math.max(second,size);
  }
  if(!best){this.progress=0;return null;}
  const {value,source,base,t,size}=best;
  if(this.kind==='steer'){
   // A quarter turn right, held still: the axis, its direction and how far it goes for 90°.
   if(size<.04||second>size*.5){this.progress=0;return null;}
   this.progress=clamp((now-t.since)/STEADY_STEER,0,1);
   if(this.progress<1)return null;
   const center=Math.abs(base)<.25?0:base;
   return {...source,center,per90:value-center};
  }
  // A pedal pressed to the floor and let go: where it came back to is its rest, the farthest it went
  // from there the floor. Still pressed (back nowhere near the start) is not done yet.
  const far=Math.abs(t.hi-value)>Math.abs(t.lo-value)?t.hi:t.lo;
  const back=Math.abs(far-value)>=.5&&Math.abs(far-base)>=.3;
  this.progress=clamp(size/1.2,0,.8)+(back?.2*clamp((now-t.since)/STEADY_PEDAL,0,1):0);
  if(!back||now-t.since<STEADY_PEDAL)return null;
  return {...source,rest:value,full:far};
 }
 // A button pressed (one held when the step began counts once let go and pressed again), or a D-pad
 // read as an axis: one resting beyond ±1, or at 0 and pushed to exactly ±1.
 feedButton(pads){
  for(const [key,value,source] of this.inputs(pads)){
   const base=this.base.get(key);
   if(source.button!==undefined){
    if(base&&!value)this.base.set(key,0);
    if(value&&!base)return source;
    continue;
   }
   if(!finite(value)||base===undefined)continue;
   if(Math.abs(base)>1.01&&Math.abs(value-base)>=.2&&Math.abs(value)<=1.01)return {...source,value};
   if(base===0&&Math.abs(value)>.999)return {...source,value:Math.sign(value)};
  }
  return null;
 }
}

export class WheelControls {
 constructor({target=globalThis.document,storage=browserStorage(),onMenu,onShift,onChange}={}){
  this.target=target;this.storage=storage;this.onMenu=onMenu;this.onShift=onShift;this.onChange=onChange;
  let saved;try{saved=JSON.parse(storage?.getItem(WHEEL_KEY)||'null');}catch{}
  this.map=normalizeWheelMap(saved);this.lock=WHEEL_LOCK_DEFAULT;this.suspended=false;
  this.steering=this.degrees=this.throttle=this.brake=this.clutch=0;this.lever=undefined;
  this.held=new Set();this.live=new Set();this.present=[];this.pads=[];this.plugged='';this.learner=null;this.swallow=false;
  globalThis.addEventListener?.('gamepadconnected',()=>this.poll(0));globalThis.addEventListener?.('gamepaddisconnected',()=>this.poll(0));
 }
 // The devices the map uses, and those of them plugged in now.
 get devices(){return [...new Set(Object.values(this.map).map(b=>b.id))];}
 get connected(){return this.present.length>0;}
 get missing(){return this.devices.filter(id=>!this.present.includes(id));}
 get configured(){return REQUIRED.every(role=>this.map[role]);}
 get learning(){return !!this.learner;}
 // Pedals take the car from the recon lap's autopilot; a wheel with no centring spring rests anywhere.
 get driving(){return this.throttle>DRIVING||this.brake>DRIVING;}
 // A configured wheel's own steering is in use (no smoothing in physics).
 get steers(){return !!this.map.steer&&this.present.includes(this.map.steer.id);}
 get hasLever(){return H_ROLES.some(role=>this.map[role]);}
 uses(id){return Object.values(this.map).some(b=>b.id===id);}
 setLock(degrees){this.lock=WHEEL_LOCKS.includes(Number(degrees))?Number(degrees):WHEEL_LOCK_DEFAULT;}
 // main.js: whether a held button presses that key now (as GamepadControls.holds).
 holds(code){for(const role of this.held)if(ROLES[role].keys?.includes(code))return true;return false;}
 // Binds a role. A button taken from another role leaves it; a pedal or the wheel cannot share an
 // axis direction with another (returns {taken: role}).
 set(role,binding){
  const kind=ROLES[role]?.kind,b=normalizeBinding(kind,binding);if(!b)return {invalid:true};
  for(const [other,o] of Object.entries(this.map)){
   if(other===role||!sameSource(o,b))continue;
   const otherKind=ROLES[other].kind;
   if(kind==='button'&&otherKind==='button'){delete this.map[other];continue;}
   if(kind==='pedal'&&otherKind==='pedal'&&Math.sign(o.full-o.rest)!==Math.sign(b.full-b.rest))continue;
   return {taken:other};
  }
  this.map[role]=b;this.save();this.swallow=true;this.poll(0);return {ok:true};
 }
 clear(role){if(!this.map[role])return;delete this.map[role];this.save();this.swallow=true;this.poll(0);}
 forget(){this.map={};this.save();this.swallow=true;this.poll(0);}
 save(){try{this.storage?.setItem(WHEEL_KEY,JSON.stringify(this.map));}catch{}}
 // The Controles tab learns one control: done(binding) once it has it. Nothing drives meanwhile.
 learn(role,done){
  // What it cannot be: the wheel never a pedal or a D-pad; a pedal never the wheel or a button (it may
  // share an axis with another pedal, the other way round); a button never the wheel or a pedal.
  const kind=ROLES[role].kind,others=Object.entries(this.map).filter(([other])=>other!==role).map(([other,b])=>[ROLES[other].kind,b]);
  const exclude=others.filter(([k,b])=>kind==='steer'?b.axis!==undefined:kind==='pedal'?k!=='pedal':k!=='button').map(([,b])=>b);
  this.learner=new ControlLearner(kind,readPads(),performance.now(),{exclude});
  this.learner.role=role;this.learner.done=done;this.releaseAll();
 }
 // (a button still held when a setup step ends is not a press: the one just learnt may be the Menu)
 stopLearning(){this.learner=null;this.swallow=true;}
 // Once per frame (after the controller's): the wheel, pedals, lever and buttons.
 poll(dt,now=performance.now()){
  const pads=this.target?.hidden?[]:readPads();this.pads=pads;
  const byId=new Map();for(const pad of pads)if(!byId.has(pad.id))byId.set(pad.id,pad);
  for(const pad of pads)pad.axes.forEach((value,axis)=>{if(value!==0)this.live.add(pad.id+'|'+axis);});
  // (onChange: a device of the map came or went, or any other device (the tab names a wheel not set
  // up yet), or the map got or lost what it needs to drive)
  const present=this.devices.filter(id=>byId.has(id)),plugged=[...pads.map(pad=>pad.id),this.configured].join('\n');
  if(present.join('\n')!==this.present.join('\n')||plugged!==this.plugged){
   for(const key of [...this.live])if(!byId.has(key.slice(0,key.lastIndexOf('|'))))this.live.delete(key);
   this.present=present;this.plugged=plugged;this.onChange?.(this);
  }
  if(this.learner){
   const learner=this.learner,binding=learner.feed(pads,now);
   this.zero();
   if(binding){this.learner=null;this.swallow=true;learner.done?.(binding);}
   return;
  }
  if(this.suspended||!present.length){this.zero();return;}
  // (an axis never touched since the device came reads 0: it counts as resting)
  const value=b=>{const pad=b&&byId.get(b.id);if(!pad)return undefined;if(b.axis===undefined)return pad.buttons[b.button]?.value;const v=pad.axes[b.axis];return v===0&&!this.live.has(b.id+'|'+b.axis)?undefined:v;};
  const pressed=b=>{const pad=b&&byId.get(b.id);if(!pad)return false;if(b.axis!==undefined)return Math.abs((pad.axes[b.axis]??9)-b.value)<.1;const button=pad.buttons[b.button];return !!(button?.pressed||button?.value>.5);};
  const m=this.map;
  this.degrees=m.steer?steeringDegrees(value(m.steer),m.steer):0;
  this.steering=m.steer?steeringCommand(value(m.steer),m.steer,this.lock):0;
  this.throttle=m.throttle?pedalValue(value(m.throttle),m.throttle):0;
  this.brake=m.brake?pedalValue(value(m.brake),m.brake):0;
  this.clutch=m.clutch?pedalValue(value(m.clutch),m.clutch):0;
  // An H shifter: the slot its lever is in, null in neutral (undefined: none plugged in).
  const slots=H_ROLES.filter(role=>m[role]&&byId.has(m[role].id));
  this.lever=slots.length?ROLES[slots.find(role=>pressed(m[role]))]?.gear??null:undefined;
  const swallow=this.swallow;this.swallow=false;
  for(const [role,{kind,keys}] of Object.entries(ROLES)){
   if(kind!=='button'||ROLES[role].gear!==undefined)continue;
   const down=pressed(m[role]),was=this.held.has(role);
   if(down===was)continue;
   if(down)this.held.add(role);else this.held.delete(role);
   if(down&&swallow)continue;
   if(!down)for(const code of keys??[])this.key('keyup',code);
   else if(role==='up'||role==='down')this.onShift?.(role==='up'?1:-1);
   else if(role==='menu')this.onMenu?.();
   else for(const code of keys)this.key('keydown',code);
  }
 }
 zero(){this.steering=this.degrees=this.throttle=this.brake=this.clutch=0;this.lever=undefined;this.releaseAll();}
 key(type,code){this.target?.dispatchEvent?.(new KeyboardEvent(type,{code,key:code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code,bubbles:true,cancelable:true}));}
 releaseAll(){for(const role of this.held)for(const code of ROLES[role].keys??[])this.key('keyup',code);this.held.clear();}
 // How a binding reads in the Controles tab.
 describe(role){
  const b=this.map[role];if(!b)return '';
  const where=this.devices.length>1?` · ${deviceName(b.id)}`:'';
  if(ROLES[role].kind==='steer')return `Eixo ${b.axis} · gira ${Math.round(wheelRange(b)*2)}°${where}`;
  if(b.axis!==undefined)return (ROLES[role].kind==='pedal'?`Eixo ${b.axis}`:`Direcional (eixo ${b.axis})`)+where;
  return `Botão ${b.button}${where}`;
 }
}
