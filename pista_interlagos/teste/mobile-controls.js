export class MobileControls {
 constructor({enabled,onMenu,onCamera,onSkin,onReset,onUnlock}){
  this.enabled=enabled;this.pressed=new Set();this.pointers=new Map();this.phase='';this.handbrake=false;this.steering=0;this.steeringPosition=0;this.steerPointer=null;
  document.body.classList.toggle('touch-device',enabled);
  this.root=document.getElementById('touchControls');
  this.cameraGuards=[...this.root.querySelectorAll('.touch-steering,.touch-pedals,#touchHandbrake,#touchReverse,#touchLookBack,.touch-toolbar')];
  this.steerPad=document.getElementById('touchSteering');this.steerThumb=document.getElementById('steeringThumb');
  this.pedalPad=document.getElementById('touchPedals');this.pedalThumb=document.getElementById('pedalThumb');this.pedalPointer=null;this.throttle=this.brake=0;this.pedalPosition=.65;
  // A new finger on a pad always takes it over: a pointer whose release got lost (a browser
  // gesture, a missed event) must not keep the pad from answering until the pause.
  const take=(pad,old,event)=>{if(old!==null&&old!==event.pointerId){try{pad.releasePointerCapture(old);}catch{}}try{pad.setPointerCapture(event.pointerId);}catch{}};
  const pedalAt=event=>{this.pedalSeen={x:event.clientX,y:event.clientY};const rect=this.pedalPad.getBoundingClientRect();this.setPedals((event.clientY-rect.top-22)/(rect.height-44));};
  this.pedalPad.addEventListener('pointerdown',event=>{if(!enabled)return;event.preventDefault();event.stopPropagation();onUnlock();take(this.pedalPad,this.pedalPointer,event);this.pedalPointer=event.pointerId;this.pedalPad.classList.add('active');pedalAt(event);});
  this.pedalPad.addEventListener('pointermove',event=>{if(event.pointerId===this.pedalPointer){event.preventDefault();pedalAt(event);}});
  const releasePedals=event=>{if(event.pointerId===this.pedalPointer)this.releasePedals();};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.pedalPad.addEventListener(type,releasePedals);
  this.pedalPad.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','Home'].includes(event.key)){event.preventDefault();event.stopPropagation();this.setPedals(event.key==='Home'?.65:this.pedalPosition+(event.key==='ArrowUp'?-.05:.05));}});
  this.pedalPad.addEventListener('keyup',event=>{if(['ArrowUp','ArrowDown'].includes(event.key))this.setPedals(.65);});
  this.setPedals(.65);
  const steerAt=event=>{this.steerSeen={x:event.clientX,y:event.clientY};const rect=this.steerPad.getBoundingClientRect(),value=(event.clientX-rect.left-rect.width/2)/(rect.width/2-22);this.setSteering(Math.max(-1,Math.min(1,value)));};
  this.steerPad.addEventListener('pointerdown',event=>{if(!enabled)return;event.preventDefault();event.stopPropagation();onUnlock();take(this.steerPad,this.steerPointer,event);this.steerPointer=event.pointerId;this.steerPad.classList.add('active');steerAt(event);});
  this.steerPad.addEventListener('pointermove',event=>{if(event.pointerId===this.steerPointer){event.preventDefault();steerAt(event);}});
  const releaseSteering=event=>{if(event.pointerId===this.steerPointer)this.releaseSteering();};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.steerPad.addEventListener(type,releaseSteering);
  this.steerPad.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();event.stopPropagation();this.setSteering(event.key==='Home'?0:this.steeringPosition+(event.key==='ArrowLeft'?-.1:.1));}});
  this.steerPad.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key))this.setSteering(0);});
  for(const button of this.root.querySelectorAll('[data-key]')){
   button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();if(!enabled||button.disabled)return;onUnlock();try{button.setPointerCapture(event.pointerId);}catch{}if(button.dataset.key==='Space'&&!this.handbrakeHold){this.setHandbrake(!this.handbrake);return;}if(button.dataset.key==='Space')this.setHandbrake(true);this.pointers.set(event.pointerId,{key:button.dataset.key,button,seen:{x:event.clientX,y:event.clientY}});this.pressed.add(button.dataset.key);button.classList.add('held');});
   const release=event=>this.releaseButton(event.pointerId);
   button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
   button.addEventListener('contextmenu',event=>event.preventDefault());
  }
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
 releasePedals(){this.pedalPointer=null;this.pedalSeen=null;this.pedalPad.classList.remove('active');this.setPedals(.65);}
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
  if(this.steerPointer!==null||this.pedalPointer!==null||this.pointers.size)return true;
  return this.cameraGuards.some(element=>{
   const rect=element.getBoundingClientRect(),margin=32;
   return rect.width>0&&rect.height>0&&event.clientX>=rect.left-margin&&event.clientX<=rect.right+margin&&event.clientY>=rect.top-margin&&event.clientY<=rect.bottom+margin;
  });
 }
 setHandbrake(value){this.handbrake=value;if(value)this.pressed.add('Space');else this.pressed.delete('Space');const button=document.getElementById('touchHandbrake');button.classList.toggle('held',value);button.setAttribute('aria-pressed',String(value));button.textContent=value?'SOLTAR FREIO DE MÃO':'FREIO DE MÃO';}
 setSteering(value){
  this.steeringPosition=Math.max(-1,Math.min(1,value));
  // Keep the thumb under the finger; soften the steering response near the center.
  const amount=Math.max(0,(Math.abs(this.steeringPosition)-.10)/.90);
  this.steering=Math.sign(this.steeringPosition)*amount**2.2;
  this.steerPad.setAttribute('aria-valuenow',String(Math.round(this.steeringPosition*100)));
  this.steerThumb.style.left=`${50+this.steeringPosition*(50-2200/Math.max(44,this.steerPad.clientWidth||210))}%`;
 }
 setPedals(position){
  this.pedalPosition=Math.max(0,Math.min(1,position));
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
 update(paused,phase){this.root.classList.toggle('hidden',!this.enabled||paused||['podium','complete','disqualified'].includes(phase));if(phase===this.phase)return;this.phase=phase;const walking=phase==='crowd';if(walking||['podium','complete','disqualified'].includes(phase))this.setHandbrake(false);document.getElementById('touchGasLabel').textContent=walking?'ANDAR':'ACELERAR';document.getElementById('touchBrakeLabel').textContent=walking?'VOLTAR':'FREAR';document.getElementById('touchHandbrake').hidden=walking;document.getElementById('touchReverse').hidden=walking;document.getElementById('touchReset').hidden=walking;}
}
