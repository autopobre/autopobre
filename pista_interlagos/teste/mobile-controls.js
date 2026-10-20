// Where the thumbs rest (the ✥ beside ⚙, mobile.css --steer-*/--pedal-*): the steering's distance from the
// screen's left and bottom edges, the pedals' from its right and bottom; null for the game's place. digital: the
// pedal as two buttons, ACELERAR and FREAR, all or nothing as the keyboard's; steerDigital: the steering as two
// buttons, left and right, full lock or none as the arrow keys (user, 2026-10-20).
const LAYOUT_KEY='opala99-toque-v1';
const readLayout=()=>{
 const at=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?{x:v.x,y:v.y}:null;
 try{const v=JSON.parse(localStorage.getItem(LAYOUT_KEY));return {steer:at(v?.steer),pedals:at(v?.pedals),digital:v?.digital===true,steerDigital:v?.steerDigital===true};}catch{return {steer:null,pedals:null,digital:false,steerDigital:false};}
};
// Digital steering: past STEER_GAP px either side of the middle a button turns (the gap between them does neither).
const STEER_GAP=4;
export class MobileControls {
 constructor({enabled,onMenu,onCamera,onSkin,onReset,onUnlock,onArrange=()=>{}}){
  this.enabled=enabled;this.onArrange=onArrange;this.arranging=false;this.drags=new Map();this.layout=readLayout();this.pressed=new Set();this.pointers=new Map();this.phase='';this.handbrake=false;this.steering=0;this.steeringPosition=0;this.steerPointer=null;
  document.body.classList.toggle('touch-device',enabled);
  this.root=document.getElementById('touchControls');
  this.cameraGuards=[...this.root.querySelectorAll('.touch-steering,.touch-pedals,#touchHandbrake,#touchLookBack,#touchHorn,.touch-toolbar')];
  this.steerPad=document.getElementById('touchSteering');this.steerThumb=document.getElementById('steeringThumb');
  this.pedalPad=document.getElementById('touchPedals');this.pedalThumb=document.getElementById('pedalThumb');this.pedalPointer=null;this.throttle=this.brake=0;this.pedalPosition=.65;
  // Each pad answers on its zone: the pad and an invisible margin around it (mobile.css ::before; players missed
  // the pads by a little, steering or braking).
  this.steerZone=this.steerPad.parentElement;this.pedalZone=this.pedalPad.parentElement;
  this.miniWheel=document.getElementById('miniWheel');this.miniTurn=document.getElementById('miniWheelTurn');this.miniAngle=null;
  this.miniPedals=document.getElementById('miniPedals');this.miniPedalThumb=document.getElementById('miniPedalThumb');this.miniPedalFill=document.getElementById('miniPedalFill');this.miniPedalKey=null;
  // A new finger on a pad always takes it over: a pointer whose release got lost (a browser
  // gesture, a missed event) must not keep the pad from answering until the pause.
  const take=(pad,old,event)=>{if(old!==null&&old!==event.pointerId){try{pad.releasePointerCapture(old);}catch{}}try{pad.setPointerCapture(event.pointerId);}catch{}};
  const pedalAt=event=>{this.pedalSeen={x:event.clientX,y:event.clientY};const rect=this.pedalPad.getBoundingClientRect();this.setPedals((event.clientY-rect.top-22)/(rect.height-44));};
  this.pedalZone.addEventListener('pointerdown',event=>{if(!enabled)return;event.preventDefault();event.stopPropagation();if(this.arranging)return this.dragStart('pedals',this.pedalZone,event);onUnlock();take(this.pedalZone,this.pedalPointer,event);this.pedalPointer=event.pointerId;this.pedalPad.classList.add('active');pedalAt(event);});
  this.pedalZone.addEventListener('pointermove',event=>{if(this.drags.has(event.pointerId))this.dragMove(event);else if(event.pointerId===this.pedalPointer){event.preventDefault();pedalAt(event);}});
  const releasePedals=event=>{this.dragEnd(event);if(event.pointerId===this.pedalPointer)this.releasePedals();};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.pedalZone.addEventListener(type,releasePedals);
  this.pedalPad.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','Home'].includes(event.key)){event.preventDefault();event.stopPropagation();this.setPedals(event.key==='Home'?this.pedalRest():this.pedalPosition+(event.key==='ArrowUp'?-.05:.05));}});
  this.pedalPad.addEventListener('keyup',event=>{if(['ArrowUp','ArrowDown'].includes(event.key))this.setPedals(this.pedalRest());});
  this.setPedals(.65);
  const steerAt=event=>{this.steerSeen={x:event.clientX,y:event.clientY};const rect=this.steerPad.getBoundingClientRect(),value=(event.clientX-rect.left-rect.width/2)/(rect.width/2-22);this.setSteering(Math.max(-1,Math.min(1,value)));};
  this.steerZone.addEventListener('pointerdown',event=>{if(!enabled)return;event.preventDefault();event.stopPropagation();if(this.arranging)return this.dragStart('steer',this.steerZone,event);onUnlock();take(this.steerZone,this.steerPointer,event);this.steerPointer=event.pointerId;this.steerPad.classList.add('active');steerAt(event);});
  this.steerZone.addEventListener('pointermove',event=>{if(this.drags.has(event.pointerId))this.dragMove(event);else if(event.pointerId===this.steerPointer){event.preventDefault();steerAt(event);}});
  const releaseSteering=event=>{this.dragEnd(event);if(event.pointerId===this.steerPointer)this.releaseSteering();};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.steerZone.addEventListener(type,releaseSteering);
  this.steerPad.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();event.stopPropagation();this.setSteering(event.key==='Home'?0:this.steeringPosition+(event.key==='ArrowLeft'?-.1:.1));}});
  this.steerPad.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key))this.setSteering(0);});
  for(const button of this.root.querySelectorAll('[data-key]')){
   button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();if(!enabled||button.disabled)return;onUnlock();try{button.setPointerCapture(event.pointerId);}catch{}if(button.dataset.key==='Space'&&!this.handbrakeHold){this.setHandbrake(!this.handbrake);return;}if(button.dataset.key==='Space')this.setHandbrake(true);this.pointers.set(event.pointerId,{key:button.dataset.key,button,seen:{x:event.clientX,y:event.clientY}});this.pressed.add(button.dataset.key);button.classList.add('held');});
   const release=event=>this.releaseButton(event.pointerId);
   button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
   button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  // The arranging's buttons answer the finger lifted on them: a tap right after a quick drag of a pad can get no
  // click from the browser (the click stays for the keyboard, not twice).
  const tapped=(id,act)=>{
   const button=document.getElementById(id);let down=null,done=-1e9;
   button.addEventListener('pointerdown',event=>{event.stopPropagation();down=event.pointerId;});
   button.addEventListener('pointerup',event=>{if(event.pointerId!==down)return;down=null;const r=button.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)return;done=performance.now();act();});
   button.addEventListener('click',()=>{if(performance.now()-done>700)act();});
  };
  // The ✥ beside ⚙ opens the arranging.
  tapped('touchArrange',()=>{if(enabled)this.arrange(true);});
  this.arrangePanel=document.getElementById('touchArrangePanel');
  tapped('touchArrangeReset',()=>{this.layout={...this.layout,steer:null,pedals:null};this.applyLayout();});
  // The pedal's kind and the steering's, chosen there too (Redefinir keeps them).
  this.pedalModes=[['touchPedalAnalog',false],['touchPedalDigital',true]].map(([id,digital])=>{tapped(id,()=>{this.layout={...this.layout,digital};this.applyPedalMode();});return [document.getElementById(id),digital];});
  this.steerModes=[['touchSteerAnalog',false],['touchSteerDigital',true]].map(([id,steerDigital])=>{tapped(id,()=>{this.layout={...this.layout,steerDigital};this.applySteerMode();});return [document.getElementById(id),steerDigital];});
  this.applyPedalMode();this.applySteerMode();
  tapped('touchArrangeCancel',()=>this.arrange(false));tapped('touchArrangeDone',()=>this.arrange(false,true));
  this.applyLayout();window.addEventListener('resize',()=>this.applyLayout());
  document.getElementById('touchMenu').onclick=onMenu;document.getElementById('touchCamera').onclick=onCamera;document.getElementById('touchSkin').onclick=onSkin;document.getElementById('touchReset').onclick=onReset;
  const full=document.getElementById('touchFullscreen'),openingFull=document.getElementById('startFullscreen'),openingFullLabel=document.getElementById('startFullscreenLabel'),canFullscreen=!!document.documentElement.requestFullscreen;
  full.hidden=!canFullscreen;openingFull.hidden=!enabled;openingFull.disabled=!canFullscreen;if(!canFullscreen)openingFullLabel.textContent='Sem suporte';
  const fullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();return;}await document.documentElement.requestFullscreen();try{await screen.orientation?.lock?.('landscape');}catch{}}catch{openingFullLabel.textContent='Tentar de novo';}};
  full.onclick=fullscreen;openingFull.onclick=fullscreen;document.addEventListener('fullscreenchange',()=>{const label=document.fullscreenElement?'Sair da tela cheia':'Tela cheia';full.textContent=label;openingFullLabel.textContent=document.fullscreenElement?'Restaurar':'Tela cheia';openingFull.setAttribute('aria-label',label);});
  window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
  // Safety net for lost releases: whenever a finger leaves the screen, every held control with no
  // finger left near where it was last seen lets go (all of them when no finger is left).
  const sweep=event=>{if(enabled)this.releaseStale([...event.touches].map(t=>({x:t.clientX,y:t.clientY})));};
  for(const type of ['touchend','touchcancel'])document.addEventListener(type,sweep,{capture:true,passive:true});
  // No browser zoom while playing: two thumbs on the pads (or one beside them, on the HUD) made a
  // pinch that zoomed the page and pushed the controls off the screen. Pinch and double-tap zoom
  // are off everywhere (mobile.css keeps panning for the panels that scroll), and Safari gesture
  // events are cancelled too.
  if(enabled){
   document.querySelector('meta[name=viewport]')?.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
   for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
  }
 }
 releaseSteering(){this.steerPointer=null;this.steerSeen=null;this.steerPad.classList.remove('active');this.setSteering(0);}
 releasePedals(){this.pedalPointer=null;this.pedalSeen=null;this.pedalPad.classList.remove('active');this.setPedals(this.pedalRest());}
 // Where the pedal rests: the slider's coasting zone, the gap between the two buttons.
 pedalRest(){return this.layout.digital?.5:.65;}
 applyPedalMode(){
  const digital=!!this.layout.digital;this.pedalPad.classList.toggle('digital',digital);
  for(const [button,kind] of this.pedalModes)button.setAttribute('aria-checked',String(kind===digital));
  this.releasePedals();
 }
 applySteerMode(){
  const digital=!!this.layout.steerDigital;this.steerPad.classList.toggle('digital',digital);
  for(const [button,kind] of this.steerModes)button.setAttribute('aria-checked',String(kind===digital));
  this.releaseSteering();
 }
 releaseButton(pointerId){const item=this.pointers.get(pointerId);if(!item)return;this.pointers.delete(pointerId);if(![...this.pointers.values()].some(x=>x.key===item.key)){this.pressed.delete(item.key);item.button.classList.remove('held');if(item.key==='Space')this.setHandbrake(false);}}
 // The Arena de Drift's handbrake button (main.js): pulled only while a finger is on it, as a drifter's lever; elsewhere
 // a press pulls it and the next lets it go.
 setHandbrakeHold(on){this.handbrakeHold=!!on;if(!on&&[...this.pointers.values()].some(x=>x.key==='Space')){for(const [id,x] of this.pointers)if(x.key==='Space')this.pointers.delete(id);}this.setHandbrake(false);}
 // fingers: where the fingers still on the screen are (client px).
 releaseStale(fingers){
  const alive=seen=>!!seen&&fingers.some(f=>Math.hypot(f.x-seen.x,f.y-seen.y)<70);
  if(this.steerPointer!==null&&!alive(this.steerSeen))this.releaseSteering();
  if(this.pedalPointer!==null&&!alive(this.pedalSeen))this.releasePedals();
  for(const [id,item] of [...this.pointers])if(!alive(item.seen))this.releaseButton(id);
 }
 blocksCameraGesture(event){
  if(!this.enabled||this.root.classList.contains('hidden'))return false;
  if(this.arranging||this.steerPointer!==null||this.pedalPointer!==null||this.pointers.size)return true;
  return this.cameraGuards.some(element=>{
   // (the pads' zones reach some 34 px past them: the guard starts past that)
   const rect=element.getBoundingClientRect(),margin=element===this.steerZone||element===this.pedalZone?66:32;
   return rect.width>0&&rect.height>0&&event.clientX>=rect.left-margin&&event.clientX<=rect.right+margin&&event.clientY>=rect.top-margin&&event.clientY<=rect.bottom+margin;
  });
 }
 // The ✥ beside ⚙: the race waits (onArrange), the rest of the screen fades and a finger on a pad drags it
 // where the thumb rests. Confirmar keeps the places (this browser), Cancelar puts back the ones from before,
 // Redefinir the game's. quiet: the menu takes over (no onArrange).
 arrange(on,keep=false,quiet=false){
  if(on===this.arranging)return;
  if(on)this.before={...this.layout};
  else{if(keep){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(this.layout));}catch{}}else this.layout=this.before;this.drags.clear();this.steerZone.classList.remove('dragging');this.pedalZone.classList.remove('dragging');}
  this.arranging=on;this.root.classList.toggle('arranging',on);document.body.classList.toggle('touch-arranging',on);this.arrangePanel.hidden=!on;
  this.clear();this.applyLayout();this.applyPedalMode();this.applySteerMode();
  if(!quiet)this.onArrange(on);
 }
 // A place kept on the screen (clear of its edges); positions from the edges the pad is anchored to.
 fit(zone,at){const box=this.root.getBoundingClientRect(),edge=6;return {x:Math.round(Math.max(edge,Math.min(box.width-zone.offsetWidth-edge,at.x))),y:Math.round(Math.max(edge,Math.min(box.height-zone.offsetHeight-edge,at.y)))};}
 applyLayout(){
  const shown=this.root.getBoundingClientRect().width>0;
  for(const [name,zone,across,up] of [['steer',this.steerZone,'--steer-left','--steer-bottom'],['pedals',this.pedalZone,'--pedal-right','--pedal-bottom']]){
   const at=this.layout[name]&&(shown?this.fit(zone,this.layout[name]):this.layout[name]);
   if(at){this.root.style.setProperty(across,`${at.x}px`);this.root.style.setProperty(up,`${at.y}px`);}else{this.root.style.removeProperty(across);this.root.style.removeProperty(up);}
  }
 }
 dragStart(name,zone,event){
  const r=zone.getBoundingClientRect(),box=this.root.getBoundingClientRect();try{zone.setPointerCapture(event.pointerId);}catch{}
  this.drags.set(event.pointerId,{name,zone,x:event.clientX,y:event.clientY,from:{x:name==='steer'?r.left-box.left:box.right-r.right,y:box.bottom-r.bottom}});zone.classList.add('dragging');
 }
 dragMove(event){
  const d=this.drags.get(event.pointerId);event.preventDefault();const dx=event.clientX-d.x,dy=event.clientY-d.y;
  this.layout={...this.layout,[d.name]:this.fit(d.zone,{x:d.from.x+(d.name==='steer'?dx:-dx),y:d.from.y-dy})};this.applyLayout();
 }
 dragEnd(event){const d=this.drags.get(event.pointerId);if(!d)return;this.drags.delete(event.pointerId);if(![...this.drags.values()].some(x=>x.zone===d.zone))d.zone.classList.remove('dragging');}
 // The mini steering wheel by the map: the car's wheel turned as the cockpit's (driver-rig.js steeringWheelAngle,
 // radians, left positive), its yellow mark at the top when straight.
 showWheel(angle){const deg=Math.round(-angle*360/Math.PI)/2;if(deg===this.miniAngle)return;this.miniAngle=deg;this.miniTurn.setAttribute('transform',`rotate(${deg})`);}
 // The mini pedal by the timing: the throttle and the brake applied (0-1), its thumb where the pedal's would sit for
 // them (setPedals' curve turned back) and the stretch from the coasting zone lit (mobile.css: the track 40 px high,
 // 7 px down the card).
 showPedals(throttle,brake){
  const braking=brake>.001,pos=braking?.7+.3*Math.min(1,brake)**(1/2.2):throttle>.001?.6-.6*Math.min(1,throttle)**(1/2.2):.65,key=Math.round(pos*400);
  if(key===this.miniPedalKey)return;this.miniPedalKey=key;
  const from=braking?.7:throttle>.001?.6:pos,px=v=>`${(7+v*40).toFixed(1)}px`;
  this.miniPedalThumb.style.top=px(pos);this.miniPedalFill.style.top=px(Math.min(pos,from));this.miniPedalFill.style.height=`${(Math.abs(pos-from)*40).toFixed(1)}px`;
  this.miniPedals.classList.toggle('braking',braking);
 }
 setHandbrake(value){this.handbrake=value;if(value)this.pressed.add('Space');else this.pressed.delete('Space');const button=document.getElementById('touchHandbrake');button.classList.toggle('held',value);button.setAttribute('aria-pressed',String(value));button.textContent=value?'SOLTAR FREIO DE MÃO':'FREIO DE MÃO';}
 setSteering(value){
  this.steeringPosition=Math.max(-1,Math.min(1,value));
  if(this.layout.steerDigital){
   // Digital: the left button turns left, the right one right, all the way (as the arrow keys); the finger may slide
   // from one to the other.
   const gap=STEER_GAP/Math.max(1,(this.steerPad.clientWidth||210)/2-22),p=this.steeringPosition;
   this.steering=p<-gap?-1:p>gap?1:0;
   this.steerPad.setAttribute('aria-valuenow',String(this.steering*100));this.steerPad.setAttribute('aria-valuetext',this.steering<0?'Esquerda':this.steering>0?'Direita':'Reto');
   this.steerPad.classList.toggle('left-held',this.steering<0);this.steerPad.classList.toggle('right-held',this.steering>0);
   return;
  }
  this.steerPad.classList.remove('left-held','right-held');this.steerPad.removeAttribute('aria-valuetext');
  // Keep the thumb under the finger; soften the steering response near the center.
  const amount=Math.max(0,(Math.abs(this.steeringPosition)-.10)/.90);
  this.steering=Math.sign(this.steeringPosition)*amount**2.2;
  this.steerPad.setAttribute('aria-valuenow',String(Math.round(this.steeringPosition*100)));
  this.steerThumb.style.left=`${50+this.steeringPosition*(50-2200/Math.max(44,this.steerPad.clientWidth||210))}%`;
 }
 setPedals(position){
  this.pedalPosition=Math.max(0,Math.min(1,position));
  if(this.layout.digital){
   // Digital: the upper button accelerates, the lower one brakes, all or nothing; the finger may slide from one to
   // the other (the 8 px between them do neither).
   this.throttle=this.pedalPosition<.46?1:0;this.brake=this.pedalPosition>.54?1:0;
   this.pedalPad.setAttribute('aria-valuenow',String((this.throttle-this.brake)*100));this.pedalPad.setAttribute('aria-valuetext',this.throttle?'Acelerar':this.brake?'Frear':'Neutro');
   this.pedalPad.classList.toggle('gas-held',this.throttle>0);this.pedalPad.classList.toggle('brake-held',this.brake>0);this.pedalPad.classList.remove('braking');
   return;
  }
  this.pedalPad.classList.remove('gas-held','brake-held');
  // Top 60% accelerates, middle 10% coasts, bottom 30% brakes.
  this.throttle=(Math.max(0,.60-this.pedalPosition)/.60)**2.2;
  this.brake=(Math.max(0,this.pedalPosition-.70)/.30)**2.2;
  this.brake=Math.min(1,this.brake);
  const percent=Math.round((this.throttle||this.brake)*100);
  this.pedalPad.setAttribute('aria-valuenow',String(Math.round((this.throttle-this.brake)*100)));
  this.pedalPad.setAttribute('aria-valuetext',this.throttle?`Acelerar ${percent}%`:this.brake?`Frear ${percent}%`:'Neutro');
  this.pedalPad.classList.toggle('braking',this.brake>0);
  this.pedalThumb.textContent=percent?String(percent):'•';
  this.pedalThumb.style.top=`${22+this.pedalPosition*Math.max(1,(this.pedalPad.clientHeight||148)-44)}px`;
 }
 clear(){this.pressed.clear();for(const {button} of this.pointers.values())button.classList.remove('held');this.pointers.clear();this.releaseSteering();this.releasePedals();this.setHandbrake(this.handbrake&&!this.handbrakeHold);}
 update(paused,phase){const hidden=!this.enabled||paused&&!this.arranging||['podium','complete','disqualified'].includes(phase);if(hidden!==this.root.classList.contains('hidden')){this.root.classList.toggle('hidden',hidden);if(!hidden)this.applyLayout();}if(phase===this.phase)return;this.phase=phase;const walking=phase==='crowd';if(walking||['podium','complete','disqualified'].includes(phase))this.setHandbrake(false);document.getElementById('touchGasLabel').textContent=walking?'ANDAR':'ACELERAR';document.getElementById('touchBrakeLabel').textContent=walking?'VOLTAR':'FREAR';document.getElementById('touchGasDigital').textContent=walking?'ANDAR':'ACELERAR';document.getElementById('touchBrakeDigital').textContent=walking?'VOLTAR':'FREAR';for(const id of ['touchReverseLabel','touchReverseDigital'])document.getElementById(id).hidden=walking;document.getElementById('touchHandbrake').hidden=document.getElementById('touchHorn').hidden=walking;document.getElementById('touchReset').hidden=walking;this.miniWheel.hidden=this.miniPedals.hidden=walking;}
}
