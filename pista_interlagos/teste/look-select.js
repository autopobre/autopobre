import * as THREE from 'three';
import {createPeople,dressPerson,OUTFITS,Idler,IDLE_KINDS} from './pit-crew.js';
import {createHelmet} from './driver-helmet.js';
import {compileInSlices} from './cinematic.js';
import {GENDERS,SUIT_COLORS,GLOVE_COLORS,HAIR_STYLES,HAIR_COLORS,BEARDS,HELMET_DESIGNS,HELMET_COLORS,VISORS,LOOK_DEFAULT,normalizeLook,lookOutfit,lookKey,nameOf} from './pilot-look.js';
// The Visual screen (#visual; user, 2026-10-20: "nova tela de criação de skin, em uma versão simplificada"): the pilot
// stands on a turntable in a small studio, helmet in hand, and the panel beside picks the suit's colour, man or woman, the
// gloves, the hair (and a man's beard) and the helmet (its design, two colours and the visor). Each pick shows at once
// and is kept for the pilot (pilot-look.js LookStore); the story keeps Stevan's own look whatever is picked here.
// Picking in a part of the panel brings the camera to it: the whole pilot, the hands, the head, the helmet put on.
// The pilot faces the camera unless Girar is ticked (user, 2026-10-20: "girar como opcional, por padrão mostra de
// frente"; kept in this browser): then he turns round, or swings to and fro for a close look. Dragged by hand, he
// waits a while and then goes back. The wheel (or a pinch) zooms in and out towards what is under the pointer (user,
// 2026-10-20); a double click, or another part of the panel, frames the part again.
// The studio is drawn by the game's renderer on the page's canvas, through the screen's open middle (visual.css), as the
// car screen's garage is (car-select.js).
const css=hex=>'#'+hex.toString(16).padStart(6,'0');
// Who is shown standing still: glances, weight from leg to leg, the free (left) hand to the brow or the wrist.
IDLE_KINDS.visual??={look:4,shift:3,tap:.6,wrist:1,brow:.5,chin:.4};
// The parts the camera comes to: what it looks at (m above the platform), the height of the frame there (m) and, with
// Girar, how far round from the front the pilot swings while it does (radians; 0 turns him all the way round).
const FOCUS=Object.freeze({
 corpo:{y:.98,height:2.15,swing:0},maos:{y:.9,height:1.05,swing:.7},cabeca:{y:1.64,height:.62,swing:.8},capacete:{y:1.66,height:.66,swing:.8}});
const VIEW=Object.freeze({fov:30,elevation:.1,platform:.07});
const SPIN_KEY='autopobre-visual-girar';
// Zoom: from a little farther than the part's frame to 4 times closer; the camera never nearer the pilot's middle than NEAR m.
const ZOOM=Object.freeze({out:.75,in:4,near:.42});
// The studio's look on the screen (the race's cinematic.js draws linear, untoned): set, and what undoes it.
function screenLook(renderer){
 const saved=[renderer.toneMapping,renderer.toneMappingExposure,renderer.outputColorSpace];
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;
 return ()=>{[renderer.toneMapping,renderer.toneMappingExposure,renderer.outputColorSpace]=saved;};
}
function canvasTexture(size,paint){const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
const radial=(stops,size=256)=>canvasTexture(size,(ctx,s)=>{const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);for(const [at,color] of stops)g.addColorStop(at,color);ctx.fillStyle=g;ctx.fillRect(0,0,s,s);});
class LookStudio {
 constructor(){
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(VIEW.fov,1,.05,60);
  this.scene.background=canvasTexture(512,(ctx,s)=>{const g=ctx.createRadialGradient(s*.5,s*.42,0,s*.5,s*.5,s*.75);g.addColorStop(0,'#33403f');g.addColorStop(.55,'#172120');g.addColorStop(1,'#070b0b');ctx.fillStyle=g;ctx.fillRect(0,0,s,s);});
  this.scene.add(new THREE.HemisphereLight(0xdfe8ee,0x2b2620,1.1));
  const key=new THREE.DirectionalLight(0xfff1dc,2.4);key.position.set(3,4,2.2);const rim=new THREE.DirectionalLight(0xbfd8ff,1.6);rim.position.set(-3,2.6,-2.5);const fill=new THREE.DirectionalLight(0xffffff,.55);fill.position.set(2,1,-3);
  this.scene.add(key,rim,fill);
  // The floor's pool of light, the platform and its soft shadow, a ring lit in the suit's colour.
  const pool=new THREE.Mesh(new THREE.CircleGeometry(4,48).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:radial([[0,'#4a5654'],[.35,'#232c2b'],[1,'#0a0f0f']]),depthWrite:false}));
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(.62,.66,VIEW.platform,48),new THREE.MeshStandardMaterial({color:0x22282a,roughness:.55,metalness:.2}));platform.position.y=VIEW.platform/2;
  this.ring=new THREE.Mesh(new THREE.TorusGeometry(.64,.008,6,64).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xd82125}));this.ring.position.y=VIEW.platform;
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.5,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:radial([[0,'rgba(0,0,0,.7)'],[.55,'rgba(0,0,0,.35)'],[1,'rgba(0,0,0,0)']],128),transparent:true,depthWrite:false}));shadow.position.y=VIEW.platform+.002;
  this.scene.add(pool,platform,this.ring,shadow);
  this.turntable=new THREE.Group();this.turntable.position.y=VIEW.platform;this.scene.add(this.turntable);
  this.people=createPeople();this.person=null;this.helmet=null;this.idler=null;this.ready=false;this.preparing=null;
  this.look=null;this.shownKey=null;this.focus='corpo';this.spin=false;this.yaw=0;this.handUntil=0;this.time=0;this.target=new THREE.Vector3(0,FOCUS.corpo.y,0);this.height=FOCUS.corpo.height;this.helmetOn=0;
  // zoom and pan (m: across the screen, up) ease towards their ...To; both start again with each part framed.
  this.zoom=this.zoomTo=1;this.pan=new THREE.Vector2();this.panTo=new THREE.Vector2();
 }
 // The pilot and his helmet, made the first time the screen draws; then the programs, a few at a time (the page answers).
 async build(renderer){
  this.person=this.people.person(OUTFITS.driver,{shadows:false});this.person.name='Piloto_visual';
  this.turntable.add(this.person);this.idler=new Idler(this.person,'visual',{hands:[true,false],seed:.37});
  this.helmet=await createHelmet();this.helmet.root.name='Capacete_visual';
  this.hand=new THREE.Group();this.person.userData.rig.limbs[1].hand.add(this.hand);
  this.onHead=new THREE.Group();this.onHead.position.set(.004,.103,0);this.person.userData.rig.head.add(this.onHead);
  this.hand.add(this.helmet.root);this.placeHelmet(false);this.dress(true);
  await compileInSlices(renderer,this.scene,this.camera,()=>null,()=>screenLook(renderer)).catch(err=>console.warn(err));
  this.ready=true;
 }
 // In the hand, gripped by its crown, hanging at his hip facing ahead (the forearm hangs .58 rad forward: the hand's
 // frame turned back by that); or on, the head hidden under it.
 placeHelmet(on){
  const h=this.helmet.root;(on?this.onHead:this.hand).add(h);this.person.userData.head.visible=!on;this.helmet.wear(on);
  if(on){h.position.set(0,0,0);h.rotation.set(0,0,0);}else{h.position.set(-.082,-.125,.085);h.rotation.set(.12,0,-.48);}
 }
 dress(force=false){
  const key=lookKey(this.look);if(!force&&key===this.shownKey)return;this.shownKey=key;
  dressPerson(this.person,this.look?lookOutfit(this.look):OUTFITS.driver);this.helmet.look(this.look);
  this.ring.material.color.setHex(this.look?lookOutfit(this.look).top:OUTFITS.driver.top);
 }
 render(renderer,dt,rect){
  if(!this.preparing)this.preparing=this.build(renderer);
  if(!this.ready)return false;
  this.time+=dt;this.dress();
  const f=FOCUS[this.focus]??FOCUS.corpo,ease=1-Math.exp(-dt*5);
  // Facing the camera; with Girar he turns round slowly, or swings to and fro for a close look; dragged, he waits a while.
  if(this.time>this.handUntil){
   if(this.spin&&!f.swing)this.yaw+=dt*.3;
   else{const want=this.spin?-.25+f.swing*Math.sin(this.time*.45):0,d=Math.atan2(Math.sin(want-this.yaw),Math.cos(want-this.yaw));this.yaw+=d*Math.min(1,dt*(this.spin?1.5:3));}
  }
  this.turntable.rotation.y=this.yaw;
  const on=this.focus==='capacete';if(on!==this.helmetOn){this.helmetOn=on;this.placeHelmet(on);}
  this.idler.update(dt,'stand',{calm:this.focus!=='corpo'});
  // The right arm holds the helmet at the hip (the idle moves only the left).
  const right=this.person.userData.rig.limbs[1];if(!on){right.arm.rotation.z=.16;right.arm.rotation.x=-.16;right.fore.rotation.z=.42;right.fore.rotation.y=.25;}
  this.zoom+=(this.zoomTo-this.zoom)*ease;this.pan.lerp(this.panTo,ease);
  this.target.y+=(f.y+this.pan.y-this.target.y)*ease;this.target.z+=(-this.pan.x-this.target.z)*ease;this.height+=(f.height/this.zoom-this.height)*ease;
  const size=renderer.getSize(new THREE.Vector2()),W=size.x,H=size.y,c=this.camera,half=Math.tan(THREE.MathUtils.degToRad(VIEW.fov/2));
  // Far enough for the frame's height to fill most of the stage, and the pilot (about .9 m wide) to fit across it.
  const dist=Math.max(this.height*H/(2*half*Math.max(1,rect.height)),Math.min(this.height,.95)*H/(2*half*Math.max(1,rect.width)),ZOOM.near);
  const target=this.target.clone();target.y+=VIEW.platform;
  c.position.set(Math.cos(VIEW.elevation)*dist,target.y+Math.sin(VIEW.elevation)*dist,0);c.lookAt(target);
  c.aspect=W/H;c.setViewOffset(W,H,W/2-(rect.left+rect.width/2),H/2-(rect.top+rect.height*.5),W,H);c.updateProjectionMatrix();c.updateMatrixWorld();
  const saved={target:renderer.getRenderTarget(),autoClear:renderer.autoClear},undo=screenLook(renderer);
  renderer.setRenderTarget(null);renderer.autoClear=true;renderer.render(this.scene,c);
  undo();renderer.setRenderTarget(saved.target);renderer.autoClear=saved.autoClear;
  return true;
 }
 turn(dx){this.yaw+=dx*.01;this.handUntil=this.time+3;}
 // A part framed afresh (the panel, a check): zoom and pan start again.
 setFocus(part){if(!FOCUS[part]||part===this.focus)return;this.focus=part;this.zoomTo=1;this.panTo.set(0,0);}
 // Closer (factor > 1) or farther, keeping the point under the pointer (page pixels) where it is on the stage (rect).
 zoomAt(factor,x,y,rect){
  const f=FOCUS[this.focus]??FOCUS.corpo,before=this.zoomTo,after=THREE.MathUtils.clamp(before*factor,ZOOM.out,ZOOM.in);if(after===before)return;
  const metres=f.height/before/Math.max(1,rect.height),dx=(x-(rect.left+rect.width/2))*metres,dy=(rect.top+rect.height/2-y)*metres;
  if(after>before)this.panTo.add(new THREE.Vector2(dx,dy).multiplyScalar(1-before/after));
  else this.panTo.multiplyScalar(after<=1?0:(after-1)/(before-1));
  // Not off the pilot: the middle of the frame stays within his reach and height.
  this.panTo.x=THREE.MathUtils.clamp(this.panTo.x,-.5,.5);this.panTo.y=THREE.MathUtils.clamp(this.panTo.y,-f.y+.05,1.9-f.y);
  this.zoomTo=after;
 }
 resetZoom(){this.zoomTo=1;this.panTo.set(0,0);}
}
// root: the #visual screen. store: the looks (pilot-look.js LookStore); pilot(): whose look is shown and kept; onBack():
// the Voltar and Pronto buttons.
export class LookSelect {
 constructor({root,store,pilot,onBack}){
  this.root=root;this.store=store;this.pilot=pilot;this.studio=new LookStudio();this.live=false;this.editing={...LOOK_DEFAULT};
  const $=id=>root.querySelector('#'+id);this.stage=$('visualStage');this.status=$('visualStageStatus');this.panel=$('visualPanel');this.state=$('visualState');this.reset=$('visualDefault');
  $('visualBack').onclick=()=>onBack();$('visualDone').onclick=()=>onBack();
  const spin=$('visualSpin');try{spin.checked=globalThis.localStorage?.getItem(SPIN_KEY)==='1';}catch{}this.studio.spin=spin.checked;
  spin.onchange=()=>{this.studio.spin=spin.checked;try{globalThis.localStorage?.setItem(SPIN_KEY,spin.checked?'1':'0');}catch{}};
  this.reset.onclick=()=>{this.store.set(this.pilot(),null);this.sync();};
  this.build();
  // Picking in a part of the panel brings the camera to it.
  for(const box of this.panel.querySelectorAll('fieldset[data-focus]')){const go=()=>{this.studio.setFocus(box.dataset.focus);this.focusBox=box;this.mark();};box.addEventListener('focusin',go);box.addEventListener('pointerdown',go);}
  // Dragging the stage turns the pilot round (not from the Girar box on it); two fingers pinch the zoom.
  const fingers=new Map(),rect=()=>this.stage.getBoundingClientRect();let drag=null,pinch=0;
  const spread=()=>{const [a,b]=[...fingers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  this.stage.addEventListener('pointerdown',e=>{if(e.target.closest?.('label,button,input'))return;fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.stage.setPointerCapture?.(e.pointerId);
   if(fingers.size===2){drag=null;pinch=spread();}else if(fingers.size===1){drag={x:e.clientX,id:e.pointerId};this.stage.classList.add('dragging');}});
  this.stage.addEventListener('pointermove',e=>{
   if(!fingers.has(e.pointerId))return;fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(fingers.size===2&&pinch){const now=spread(),[a,b]=[...fingers.values()];if(now>0)this.studio.zoomAt(now/pinch,(a.x+b.x)/2,(a.y+b.y)/2,rect());pinch=now;return;}
   if(drag&&e.pointerId===drag.id){this.studio.turn(e.clientX-drag.x);drag.x=e.clientX;}});
  const end=e=>{fingers.delete(e.pointerId);if(fingers.size<2)pinch=0;if(drag&&e.pointerId===drag.id||!fingers.size){drag=null;this.stage.classList.remove('dragging');}};
  this.stage.addEventListener('pointerup',end);this.stage.addEventListener('pointercancel',end);
  this.stage.addEventListener('wheel',e=>{e.preventDefault();this.studio.zoomAt(Math.exp(-THREE.MathUtils.clamp(e.deltaY,-300,300)*.0015),e.clientX,e.clientY,rect());},{passive:false});
  this.stage.addEventListener('dblclick',e=>{if(!e.target.closest?.('label,button,input'))this.studio.resetZoom();});
 }
 // The panel's groups, from pilot-look.js's lists: swatches for colours, buttons with names for the rest (native radios,
 // so the arrows and Tab work as in any form).
 build(){
  const group=(field,list,label,kind)=>{
   const g=document.createElement('div');g.className='look-options look-'+kind;g.setAttribute('role','radiogroup');g.setAttribute('aria-label',label);g.dataset.field=field;
   for(const entry of list){
    const [id]=entry,name=nameOf(list,id),option=document.createElement('label');option.className=kind==='swatches'?'look-swatch':'look-chip';option.title=name;
    const input=document.createElement('input');input.type='radio';input.name='look-'+field;input.value=id;input.onchange=()=>this.choose(field,id);
    const face=document.createElement('span');if(kind==='swatches'){face.style.setProperty('--c',css(entry[1]));face.className='look-dot';const hidden=document.createElement('span');hidden.className='sr-only';hidden.textContent=name;option.append(input,face,hidden);}
    else{face.textContent=name;option.append(input,face);}
    g.append(option);
   }
   return g;
  };
  const row=(title,node)=>{const r=document.createElement('div');r.className='look-row';const h=document.createElement('span');h.className='look-row-title';h.textContent=title;r.append(h,node);return r;};
  const section=(title,focus,...rows)=>{const f=document.createElement('fieldset');f.dataset.focus=focus;const l=document.createElement('legend');l.textContent=title;f.append(l,...rows);return f;};
  this.panel.replaceChildren(
   section('Piloto','corpo',group('gender',GENDERS,'Homem ou mulher','chips')),
   section('Macacão','corpo',group('suit',SUIT_COLORS,'Cor do macacão','swatches')),
   section('Luvas','maos',group('gloves',GLOVE_COLORS,'Cor das luvas','swatches')),
   section('Cabelo','cabeca',group('hair',HAIR_STYLES,'Penteado','chips'),row('Cor',group('hairColor',HAIR_COLORS,'Cor do cabelo','swatches')),row('Barba',group('beard',BEARDS,'Barba','chips'))),
   section('Capacete','capacete',group('helmet',HELMET_DESIGNS,'Desenho do capacete','chips'),row('Cor',group('helmetColor',HELMET_COLORS,'Cor do capacete','swatches')),row('Detalhes',group('helmetDetail',HELMET_COLORS,'Cor dos detalhes','swatches')),row('Viseira',group('visor',VISORS,'Viseira','chips'))));
 }
 // A pick: kept at once for the pilot (from Stevan's look, the first pick makes the player's own from his colours).
 choose(field,id){
  const look=normalizeLook({...this.editing,[field]:id});this.editing={...look};this.store.set(this.pilot(),look);this.sync();
 }
 // The panel and the studio as the pilot's look is now.
 sync(){
  const saved=this.store.get(this.pilot());this.editing={...(saved??LOOK_DEFAULT)};this.studio.look=saved;
  for(const g of this.panel.querySelectorAll('[data-field]'))for(const input of g.querySelectorAll('input'))input.checked=input.value===this.editing[g.dataset.field];
  // A woman has no beard; a bald head no hair colour.
  this.panel.querySelector('[data-field="beard"]').closest('.look-row').hidden=this.editing.gender==='mulher';
  this.panel.querySelector('[data-field="hairColor"]').closest('.look-row').hidden=this.editing.hair==='careca';
  this.root.classList.toggle('look-default',!saved);this.reset.disabled=!saved;
  this.state.textContent=saved?'Seu visual · salvo neste navegador':'Visual do Stevan (padrão) · escolha qualquer item para montar o seu';
  this.mark();
 }
 // The part of the panel picked in last, marked.
 mark(){for(const box of this.panel.querySelectorAll('fieldset[data-focus]'))box.classList.toggle('focused',box===this.focusBox);}
 show(){
  const pilot=this.pilot();this.root.querySelector('#visualPilot').textContent=pilot?`Piloto: ${pilot}`:'';
  this.studio.setFocus('corpo');this.studio.resetZoom();this.focusBox=null;this.sync();
 }
 // Checks and photos: the camera on a part ('corpo', 'maos', 'cabeca', 'capacete'), the pilot held at a turn (radians;
 // 0 faces the camera) or let go (undefined).
 view(part,yaw){this.studio.setFocus(part);if(Number.isFinite(yaw)){this.studio.yaw=yaw;this.studio.handUntil=Infinity;}else this.studio.handUntil=0;}
 failed(){this.status.hidden=false;this.status.textContent='Seu navegador não conseguiu desenhar o piloto em 3D. As escolhas valem do mesmo jeito.';}
 // Draws the studio in the stage's rectangle; the screen's dark backdrop gives way once the pilot shows.
 render(renderer,dt){
  const rect=this.stage.getBoundingClientRect(),drawn=rect.width>0&&rect.height>0&&this.studio.render(renderer,dt,rect);
  if(drawn!==this.live){this.live=drawn;this.root.classList.toggle('live',drawn);this.status.hidden=drawn;}
  return drawn;
 }
 info(){
  const s=this.studio;
  return {live:this.live,ready:s.ready,focus:s.focus,spin:s.spin,zoom:s.zoomTo,helmetOn:!!s.helmetOn,look:this.store.get(this.pilot()),pilot:this.pilot(),shown:s.shownKey,yaw:s.yaw,
   outfit:s.person?.userData.outfit??null,helmet:s.helmet?.info()??null,headShown:s.person?.userData.head.visible??null};
 }
}
