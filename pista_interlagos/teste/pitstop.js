import * as THREE from 'three';
import {CarCondition,CAR_PARTS,PitService,PLACE_NAMES} from './car-condition.js';
import {pitLane,inPitBox} from './pit-lane.js';
import {trackPoint} from './immersive-visuals.js';
import {footState,stepOnFoot,footGround,clearView,placeFootCamera,turnFootView,zoomFootView,footJump} from './on-foot.js';
import {OPENINGS,carSpot,SPOT_ROLE,partName} from './car-openings.js';
import {dressPerson,STEVAN_OUTFITS} from './pit-crew.js';
import {outfitOf} from './story-career.js';
import {keyName,keyText} from './key-bindings.js';
const money=n=>'R$ '+n.toFixed(2).replace('.',','),pct=n=>Math.round(n*100)+'%';
const idle={throttle:0,brake:1,left:0,right:0,reverse:0,handbrake:0},still={throttle:0,brake:0,left:0,right:0};
export const CAFE_MENU=Object.freeze([{id:'cafe',name:'Café',price:4,bites:3,verb:'beber',portion:'gole'},{id:'pao',name:'Pão de queijo',price:6,bites:2,verb:'comer',portion:'mordida'},{id:'doce',name:'Doce de leite',price:5,bites:3,verb:'comer',portion:'colherada'}]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// What the pilot buys at the Tia's café goes into a free hand (one item per hand) until it is
// eaten or drunk, sip by sip. Shared by the stroll at a pit stop and the story's paddock
// (immersive-mode.js): s is the walker's {held, using, snackTime, feedback}; pay(price) spends
// (false: not enough), emit(name) plays a sound, touch words the hint for touch screens.
export const snackState=(extra={})=>({held:[],using:null,snackTime:0,feedback:'',...extra});
const snackItem=id=>CAFE_MENU.find(item=>item.id===id);
// An item in the free hand, paid or not (Leonardo's coffee in the paddock); null with both hands busy.
export function giveSnack(s,id){const item=snackItem(id);if(!item||s.held.length>=2)return null;const held={id,bites:item.bites,side:s.held.some(h=>h.side===1)?-1:1};s.held.push(held);return held;}
export function buySnack(s,id,{pay,emit,touch=false}){
 const item=snackItem(id);if(!item)return false;
 if(s.held.length>=2){s.feedback=`As duas mãos estão ocupadas: coma ou beba primeiro (${keyName('KeyE')}).`;return false;}
 if(!pay(item.price))return false;
 giveSnack(s,id);s.snackTime=4;s.feedback=`${item.name} na mão! ${money(item.price)} pagos. ${touch?'Toque em':`Aperte ${keyName('KeyE')} para`} ${item.verb}, sô!`;emit('pitCoffee');return true;
}
// One sip or bite: the hand goes to the mouth; the last one finishes the item.
export function useSnack(s){if(s.menu||s.using||!s.held.length)return false;s.using={item:s.held[0],t:0,taken:false};return true;}
export function stepSnack(s,dt,emit){
 s.snackTime=Math.max(0,s.snackTime-dt);const u=s.using;if(!u)return;u.t+=dt;const item=snackItem(u.item.id);
 if(!u.taken&&u.t>.55){u.taken=true;u.item.bites--;emit(item.id==='cafe'?'sip':'bite');s.feedback=u.item.bites>0?`Hum! Mais ${u.item.bites} ${item.portion}${u.item.bites>1?'s':''} de ${item.name.toLowerCase()}.`:item.id==='cafe'?'Cafezinho da Tia: coisa boa demais!':`${item.name} acabou. Delícia, uai!`;}
 if(u.t>1.25){s.using=null;if(u.item.bites<=0)s.held.splice(s.held.indexOf(u.item),1);}
}
// What is in hand, for the walking HUD: 'Café (3 goles) + Pão de queijo (2 mordidas)'.
export const snackLabel=s=>s.held.map(h=>{const m=snackItem(h.id);return `${m.name} (${h.bites} ${m.portion}${h.bites>1?'s':''})`;}).join(' + ');
// What the action key does with the first item in hand: 'beber café', 'comer pão de queijo' ('' with empty hands).
export const snackVerb=s=>{const m=s.held[0]&&snackItem(s.held[0].id);return m?`${m.verb} ${m.name.toLowerCase()}`:'';};
const sipLift=s=>s.using?Math.sin(Math.min(1,s.using.t/1.25)*Math.PI):0;
// stepOnFoot's arms (on-foot.js): a hand holding something stays out in front; to reach the mouth
// the forearm turns in about the upper arm (the elbow stays out), bringing the hand in front of the
// face instead of swinging the whole arm sideways.
export function snackArms(s){
 const u=s.using,lift=sipLift(s);
 return (side,{swing,run,rig})=>{
  const holding=s.held.some(h=>h.side===side),eating=u?.item.side===side;if(!holding&&!eating)return null;
  let raise=holding?.4-swing*side*.3:-swing*side*(run?.85:1),bend=holding?1.1:run?1.35:.18,twist=0;
  if(eating){raise+=((rig?1.2:1.8)-raise)*lift;bend+=(2.25-bend)*lift;twist=side*.6*lift;}
  return [raise,bend,twist];
 };
}
// The head tips back for a sip of coffee, less for a bite.
export function snackHead(s,hero,dt){const rig=hero.userData.rig;if(rig)rig.head.rotation.z+=((s.using?.item.id==='cafe'?.3:.1)*sipLift(s)-rig.head.rotation.z)*(1-Math.exp(-dt*18));}
// Snacks in hand: a cup of coffee, a pão de queijo, a pot of doce de leite with its spoon, in each
// of the hero's hands (a rigged person's, else the simple figure's arm); hidden until held.
export function snackHands(hero){
 const snackMaterial=color=>new THREE.MeshStandardMaterial({color,roughness:.6}),cupMaterial=snackMaterial(0xf5f1e6),hands={};
 for(const side of [-1,1]){
  const holder=new THREE.Group(),rig=hero.userData.rig;holder.position.set(rig?.03:.05,rig?-.08:-.6,0);(rig?.limbs[side].hand??hero.getObjectByName('Membro_braco_'+side)).add(holder);holder.visible=false;
  const cafe=new THREE.Group(),doce=new THREE.Group();cafe.add(new THREE.Mesh(new THREE.CylinderGeometry(.036,.027,.08,14),cupMaterial));const drink=new THREE.Mesh(new THREE.CylinderGeometry(.033,.033,.004,14),snackMaterial(0x3b2314));drink.position.y=.034;cafe.add(drink);
  const pao=new THREE.Mesh(new THREE.SphereGeometry(.042,12,9),snackMaterial(0xe0ac55));pao.scale.y=.82;
  const spoon=new THREE.Mesh(new THREE.BoxGeometry(.008,.1,.016),snackMaterial(0xc9ced1));spoon.position.set(.012,.05,0);spoon.rotation.z=-.3;doce.add(spoon,new THREE.Mesh(new THREE.CylinderGeometry(.042,.036,.048,14),snackMaterial(0x9a6232)));
  holder.add(cafe,pao,doce);hands[side]={holder,items:{cafe,pao,doce}};
 }
 return hands;
}
// Each frame: what is held shows upright in its hand, the pão de queijo shrinks bite by bite, the
// pot empties and the cup tips toward the mouth for a sip. s: null when nobody walks.
const upright=new THREE.Quaternion(),handTurn=new THREE.Quaternion();
export function showSnacks(hands,hero,s){
 const held=s?.held??[],u=s?.using;hero.updateMatrixWorld(true);hero.getWorldQuaternion(upright);
 for(const side of [-1,1]){
  const hand=hands[side],item=held.find(h=>h.side===side);hand.holder.visible=!!item;if(!item)continue;
  for(const [id,mesh] of Object.entries(hand.items))mesh.visible=id===item.id;
  const full=snackItem(item.id).bites,left=item.bites;hand.items.pao.scale.setScalar(.45+.55*left/full);hand.items.doce.children[0].visible=left>0;
  hand.holder.parent.getWorldQuaternion(handTurn).invert();hand.holder.quaternion.copy(handTurn).multiply(upright);
  if(u?.item===item&&item.id==='cafe')hand.holder.rotateZ(1.1*Math.sin(Math.min(1,u.t/1.25)*Math.PI));
 }
}
const jobName=job=>job.id==='fuel'?'Gasolina':CAR_PARTS.find(p=>p.id===job.id).name;
export class PitStop {
 // layout (optional): another circuit's box. anchor {x,y,z,heading} places the station;
 // inBox(surface) tells when the car is parked in it. A layout with its own scenery
 // also brings the café seat and sign, walk(position) (floor height, or null where
 // blocked), frameEye(eye,hero), heroHeading, pitView, makeHero() and animate(dt,state).
 // openings (optional): the car's hinged parts (car-openings.js), opened by the crew and the driver.
 // outfit (optional): the player's own clothes out of the car outside the story (pilot-look.js), null for Stevan's.
 constructor({scene,car,carRoot,driver,mode,data,roadSurface,onOpen,onClose,onSettings,layout=null,obstacles=[],openings=null,outfit=()=>null}){
  Object.assign(this,{car,carRoot,driver,mode,data,roadSurface,onOpen,onClose,onSettings,layout,obstacles,openings,outfit});this.groundAt=(x,y)=>car.sample(x,y).z-.055;
  this.label=layout?.label??'CURVELO · BOX 99';this.title=layout?.title??'Cuida do Opala, uai!';
  this.condition=new CarCondition();car.condition=this.condition;mode.state.condition=this.condition;
  this.setDamage(false);
  this.bank=450;this.opened=false;this.coffee=null;this.stationary=0;this.departing=false;
  this.service=new PitService({condition:this.condition,getFuel:()=>this.fuel,getTank:()=>mode.tank,setFuel:v=>{if(mode.active)mode.state.fuel=v;else mode.freeFuel=v;},pay:cost=>this.spend(cost,true)?{...this.payment}:false,refund:(cost,job)=>this.refund(cost,job.payment)});
  this.root=new THREE.Group();this.root.name='Pitstop_e_Lanchonete_da_Tia';scene.add(this.root);this.buildScene();
  this.hud=document.createElement('aside');this.hud.id='conditionHud';this.hud.hidden=true;this.hud.innerHTML='<b>OPALA · <span id="conditionPower"></span></b><div class="condition-bars">'+CAR_PARTS.map(p=>`<label>${p.name}<b data-health-pct="${p.id}">100%</b><meter data-health="${p.id}" min="0" max="1" low=".4" high=".8" optimum="1" value="1"></meter></label>`).join('')+'</div><small id="pitHint"></small>';document.body.append(this.hud);
  this.panel=document.createElement('section');this.panel.id='pitPanel';this.panel.hidden=true;this.panel.setAttribute('aria-label',layout?.name??'Pitstop de Curvelo');
  this.panel.innerHTML=`<header class="pit-heading"><div><small>${this.label}</small><h2 id="pitTitle">${this.title}</h2></div><button id="pitSettings" aria-label="Pausar e abrir configurações">⚙</button></header><p class="pit-budget"><span id="pitWallet"></span><b id="pitFuel"></b></p><small id="pitViewHint"></small><p class="pit-message" id="pitMessage" role="status"></p><div id="pitJob" hidden><b id="pitJobLabel"></b><div id="pitActive"></div><div id="pitQueue"></div></div><div class="pit-scroll"><div id="pitGarage"><div class="pit-refuel"><button id="pitFill2">Abastecer 2 L</button><button id="pitFillAll">Completar</button></div><p class="pit-explain">Clique em quantas peças quiser: cada serviço é pago e entra na fila. Peças em lugares diferentes do carro são consertadas ao mesmo tempo; no mesmo lugar, uma depois da outra (três mecânicos e um frentista). Resolver pra valer: 100%. Gambiarra: reparo parcial, até 78%.</p><div class="pit-parts">${CAR_PARTS.map((p,i)=>`<article><div class="pit-part-title"><b>${i+1}. ${p.name}</b><strong data-quality="${p.id}"></strong></div><small>${p.effect}</small><meter data-quality-bar="${p.id}" min="0" max="1" low=".4" high=".8" optimum="1" value="1"></meter><div class="pit-repair-options"><button data-repair="${p.id}" data-kind="proper"></button><button data-repair="${p.id}" data-kind="patch"></button></div></article>`).join('')}</div></div><div id="pitCafe" hidden><small>CARDÁPIO DA TIA</small><h3>Uma prosa é de graça.</h3><p>O cafezinho e os quitutes são por sua conta, uai!</p><div class="pit-food-options">${CAFE_MENU.map(item=>`<button data-snack="${item.id}"><span>${item.name}</span><b>${money(item.price)}</b></button>`).join('')}</div><p id="pitCafeStatus" role="status"></p><button id="pitCloseCafe">Continuar o passeio</button></div></div><footer class="pit-actions"><button id="pitCoffee">Passear / Café da Tia · grátis</button><button id="pitLeave">Voltar à pista →</button></footer>`;
  document.body.append(this.panel);const $=id=>this.panel.querySelector('#'+id);
  this.walkHud=document.createElement('aside');this.walkHud.id='pitWalkHud';this.walkHud.hidden=true;this.walkHud.innerHTML='<div><b>UMA PROSA NOS BOXES</b><button id="pitWalkSettings" aria-label="Pausar e abrir configurações">⚙</button></div><span id="pitWalkJob"></span><span id="pitWalkHold" hidden></span><small id="pitWalkHint"></small><button id="pitRepairs"></button><button id="pitUse" hidden></button><button id="pitInteract" hidden></button>';document.body.append(this.walkHud);
  $('pitSettings').onclick=onSettings;this.walkHud.querySelector('#pitWalkSettings').onclick=onSettings;
  $('pitLeave').onclick=()=>this.leave();$('pitCoffee').onclick=()=>this.visitCafe();$('pitCloseCafe').onclick=()=>{this.coffee.menu=false;this.onClose?.();this.captureMouse();this.render();};this.walkHud.querySelector('#pitInteract').onclick=()=>this.interact();this.walkHud.querySelector('#pitUse').onclick=()=>this.useSnack();this.walkHud.querySelector('#pitRepairs').onclick=()=>{if(this.coffee){this.coffee.repairs=!this.coffee.repairs;this.render();}};
  // Mouse: on foot it turns the third-person camera (captured on desktop, dragged on
  // touch screens); in the car at the box a drag orbits the camera round the car, so
  // the crew can be watched at work. The wheel moves either camera closer or away.
  const view=document.getElementById('view'),free=()=>this.coffee&&!this.coffee.menu,inCar=()=>this.opened&&!this.coffee;
  document.addEventListener('mousemove',e=>{if(free()&&document.pointerLockElement===view)this.turnView(e.movementX,e.movementY);});
  view?.addEventListener('pointerdown',e=>{if(!free()&&!inCar())return;if(free()&&e.pointerType==='mouse'&&!document.pointerLockElement)this.captureMouse();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};});
  view?.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId||document.pointerLockElement)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;if(inCar())this.orbitView(dx,dy);else if(free())this.turnView(dx,dy);});
  window.addEventListener('pointerup',e=>{if(this.drag?.id===e.pointerId)this.drag=null;});
  const shift=e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')this.shift=e.type==='keydown';};
  document.addEventListener('keydown',shift);document.addEventListener('keyup',shift);window.addEventListener('blur',()=>{this.shift=false;});
  view?.addEventListener('wheel',e=>{const k=Math.sign(e.deltaY);if(inCar())this.view.distance=clamp(this.view.distance*(1+k*.14),1.8,18);else if(free())zoomFootView(this.coffee,k);},{passive:true});
  $('pitFill2').onclick=()=>this.startFuel(2);$('pitFillAll').onclick=()=>this.startFuel(this.mode.fuelTarget-this.fuel);
  for(const button of this.panel.querySelectorAll('[data-snack]'))button.onclick=()=>this.buySnack(button.dataset.snack);
  for(const button of this.panel.querySelectorAll('[data-repair]'))button.onclick=()=>{if(this.service.startRepair(button.dataset.repair,button.dataset.kind)){this.message=this.orderMessage(button.dataset.repair);mode.state.emitSound('judgeCheck');}else this.message='Confira o saldo: esta peça pode já estar na fila.';this.render();};
 }
 get racing(){return !this.mode.finishing&&(this.mode.active?this.mode.state.phase==='race':!this.mode.freeFinished);}
 get fuel(){return this.mode.active?this.mode.state.fuel:this.mode.freeFuel;}
 get wallet(){return this.mode.active?this.mode.state.cash+this.mode.state.profile.fund:this.bank;}
 spend(cost,service=false){
  if(!Number.isFinite(cost)||cost<0||cost>this.wallet+.001)return false;
  if(this.mode.active){const cash=Math.min(this.mode.state.cash,cost),fund=cost-cash;this.mode.state.cash-=cash;this.mode.state.profile.fund-=fund;if(service)this.payment={cash,fund,total:cost};this.mode.save();}
  else{this.bank-=cost;if(service)this.payment={total:cost};}return true;
 }
 refund(amount,payment=this.payment){if(this.mode.active){const ratio=payment?.cash/(payment?.total||1)||0;this.mode.state.cash+=amount*ratio;this.mode.state.profile.fund+=amount*(1-ratio);this.mode.save();}else this.bank+=amount;}
 // After an order: the crew is on it at once (alongside whoever works elsewhere on the
 // car), or it waits for the job in the same place or for a free mechanic.
 orderMessage(id){
  const queued=this.service.queue.find(job=>job.id===id),others=this.service.jobs.filter(job=>job.id!==id).map(jobName);
  return queued?`${jobName(queued)} na fila: ${this.waitReason(queued)}. Pago; começa sozinho.`:`${jobName({id})}: equipe já trabalhando`+(others.length?`, junto com ${others.join(', ')}.`:'.');
 }
 waitReason(job){const b=this.service.blocker(job);return b?.job?`espera ${jobName(b.job)} (mesmo lugar: ${PLACE_NAMES[b.zone]??b.zone})`:b?.crew?'espera um mecânico livre':'começando';}
 startFuel(amount){if(this.service.startFuel(amount)){this.message=this.orderMessage('fuel');this.mode.state.emitSound('fuelFill');}else this.message='Tanque cheio, saldo insuficiente ou abastecimento já na fila.';this.render();}
 // Realism setting: with damage off the immersive story keeps its own simple health.
 setDamage(on){this.condition.setEnabled(on);this.mode.state.condition=on?this.condition:null;}
 reset(){this.service.cancel();this.close();this.condition.reset();this.bank=450;this.departing=false;this.stationary=0;this.message='';}
 close(){if(this.cameraRef){this.cameraRef.clearViewOffset();this.viewShifted=false;if(this.savedFov!==undefined){this.cameraRef.fov=this.savedFov;this.cameraRef.updateProjectionMatrix();this.savedFov=undefined;}}this.opened=false;this.coffee=null;this.hero.visible=false;this.driver.root.visible=true;this.panel.hidden=true;this.walkHud.hidden=true;this.markers.visible=false;this.cafePrompt.visible=false;document.body.classList.remove('pit-open','pit-walking','pit-cafe-menu','pit-repairs');this.openings?.hold(OPENINGS.driverDoor,'manual',false);this.syncOpenings();this.onClose?.();}
 leave(){if(this.coffee){this.returnCar();return;}const refund=this.service.cancel();this.message=refund?`Serviços interrompidos. ${money(refund)} devolvidos.`:'';this.close();this.departing=true;this.stationary=0;}
 // Hinged parts (car-openings.js): the crew opens what it works on (the Opala's hood for the engine,
 // its trunk lid for the fuel cell, the filler caps while refuelling; the Fusca's engine lid, and its front
 // lid for the tank and its filler); on foot, the action key at the nose or the tail lifts the lid there
 // for a look, by the passenger's door opens that one (left open, they stay open as the car goes; user,
 // 2026-10-20); the driver's door stays open while he is out (E at it shuts or opens it) and shuts behind
 // him as he gets back in (user, 2026-10-15).
 syncOpenings(){const o=this.openings;if(!o)return;const at=id=>this.opened&&this.service.jobs.some(job=>job.id===id),open=new Set();
  const jobs=[['engine','motor'],['tank','tanque'],['fuel','fuel']];
  for(const [role,job] of jobs)if(at(job))for(const name of [o.part(role)].flat())open.add(name);
  for(const [role] of jobs)for(const name of [o.part(role)].flat())o.hold(name,'equipe',open.has(name));}
 // which: a name of OPENINGS ('hood', 'trunk', 'driverDoor') or a place's part ('front', 'rear': car-openings.js part).
 toggleOpening(which){const o=this.openings,name=OPENINGS[which]??o?.part(which);if(!this.opened||!o?.has(name))return false;o.toggle(name);this.render();return true;}
 get touch(){return document.body.classList.contains('touch-device');}
 // Out of the car: the camera starts behind the driver, looking where he faces.
 visitCafe(){if(!this.opened||this.coffee)return;
  // In the story he walks out in the overalls of his stage (Kléber's loaned ones until he buys his own); elsewhere in
  // the player's own look, when there is one.
  {const kind=this.mode.active?outfitOf(this.mode.state.profile.career):'proprio',outfit=(!this.mode.active&&this.outfit())||STEVAN_OUTFITS[kind];if(this.hero.userData.outfit!==outfit)dressPerson(this.hero,outfit);}
 this.openings?.hold(OPENINGS.driverDoor,'manual');const yaw=this.layout?.heroHeading??this.station.rotation.y+Math.PI/2;this.coffee=footState(yaw,snackState({elapsed:0,menu:false,repairs:!this.touch,floor:this.heroStart().y}));this.hero.visible=true;this.hero.position.copy(this.heroStart());this.hero.rotation.y=yaw;this.message='Passeio grátis. Chegue perto da Tia para ver o cardápio.';this.onClose?.();this.captureMouse();this.render();}
 captureMouse(){const view=document.getElementById('view');if(this.touch||!view?.requestPointerLock||document.pointerLockElement===view)return;try{view.requestPointerLock()?.catch?.(()=>{});}catch{}}
 releaseMouse(){if(document.pointerLockElement)document.exitPointerLock();}
 turnView(dx,dy){if(this.coffee)turnFootView(this.coffee,dx,dy);}
 // Camera round the car at the box, starting from the circuit's chosen view.
 startView(){const [ahead,side,rise]=this.layout?.pitView??[-7,-7,2.7],flat=Math.hypot(ahead,side);return {angle:Math.atan2(side,ahead),elev:Math.atan2(rise,flat),distance:Math.hypot(flat,rise)};}
 orbitView(dx,dy){const v=this.view;v.angle-=dx*.005;v.elev=clamp(v.elev+dy*.004,.08,1.35);}
 jump(){const s=this.coffee;if(s&&!s.menu)footJump(s);}
 // Keys on foot, as in GTA: F gets out of the Opala or back in beside it; E uses what
 // the driver holds, otherwise talks to the Tia (at the driver's door: shuts or opens it).
 handleKey(code){
  if(!this.opened)return false;const s=this.coffee;
  if(code==='KeyF'){if(!s){this.visitCafe();return true;}return !s.menu&&this.returnCar();}
  if(code==='KeyE'&&s&&!s.menu){if(s.held.length)this.useSnack();else if(this.interaction()!=='car'||!this.toggleOpening('driverDoor'))this.interact();return true;}
  // Tab frees the mouse to click the repairs panel (and takes it back); Space jumps, C crouches.
  if(code==='Tab'&&s&&!s.menu){s.repairs=true;if(document.pointerLockElement)this.releaseMouse();else this.captureMouse();this.render();return true;}
  if(code==='Space'&&s&&!s.menu){this.jump();return true;}
  if(code==='KeyC'&&s&&!s.menu){s.crouch=!s.crouch;return true;}
  return false;
 }
 heroStart(){const c=this.car;return new THREE.Vector3(c.x-Math.sin(c.heading)*1.6,c.surface.z,-c.y-Math.cos(c.heading)*1.6);}
 // What the action key (E, or the context button) does where the pilot stands: at the Opala's nose
 // it lifts the hood, at its tail the trunk lid, by the passenger's door it opens that one, by the driver's
 // door it gets in; at the café, the menu.
 interaction(){if(!this.coffee)return null;const spot=this.standingSpot();if(SPOT_ROLE[spot])return spot;if(this.hero.position.distanceTo(this.heroStart())<2)return 'car';if(this.hero.position.distanceTo(this.cafeSeat)<2.6)return 'cafe';return null;}
 standingSpot(){if(!this.openings?.has(OPENINGS.hood))return null;const c=this.car,h=c.heading,dx=this.hero.position.x-c.x,dz=this.hero.position.z+c.y;return carSpot({x:dx*Math.cos(h)-dz*Math.sin(h),z:dx*Math.sin(h)+dz*Math.cos(h)});}
 // The lid at a place by the car (the job under it: the Opala's engine at the nose, the Fusca's at the tail).
 openingLabel(spot){const o=this.openings,job=o.jobAt(spot),name=o.part(SPOT_ROLE[spot]),crew=this.service.jobs.some(j=>j.id===job),open=o.held(name,'manual'),what=job==='motor'?'o motor':'o tanque';
  return crew?`Ver ${what} · equipe trabalhando`:open?'Fechar '+partName(name):'Abrir '+partName(name)+(job==='motor'||spot==='capo'?' · ver '+what:'');}
 interact(){if(!this.coffee||this.coffee.menu)return;const action=this.interaction();if(action==='car')this.returnCar();else if(SPOT_ROLE[action])this.toggleOpening(SPOT_ROLE[action]);else if(action==='cafe'){this.coffee.menu=true;this.releaseMouse();this.onClose?.();this.mode.state.emitSound('paper');this.render();}}
 returnCar(){if(!this.coffee||this.interaction()!=='car')return false;this.openings?.hold(OPENINGS.driverDoor,'manual',false);this.openings?.pulse(OPENINGS.driverDoor,1.2);this.coffee=null;this.mode.state.emitSound('engineCatch');this.leave();return true;}
 // What is bought goes into a free hand (one item per hand) until it is eaten or drunk.
 buySnack(id){
  const s=this.coffee;if(!s?.menu||this.interaction()!=='cafe')return false;
  const bought=buySnack(s,id,{pay:price=>this.spend(price),emit:name=>this.mode.state.emitSound(name),touch:this.touch});this.render();return bought;
 }
 useSnack(){return !!this.coffee&&useSnack(this.coffee);}
 walk(input,dt){
  const s=this.coffee;if(!s)return;s.elapsed+=dt;stepSnack(s,dt,name=>this.mode.state.emitSound(name));
  // The walk itself is on-foot.js (free to go anywhere; the Opala at the box is solid,
  // the crew at work round it is not, so it never pins the pilot at the door).
  // Here the hands hold the snacks in front and bring them to the mouth.
  this.footGround??=this.layout?.walk?footGround({car:this.car,pit:this.layout.pit,layout:this.layout,blocked:pos=>this.againstCar(pos),crew:false}):pos=>this.stationFloor(pos);
  if(stepOnFoot(s,this.hero,s.menu?still:input,dt,{touch:this.touch,shift:!!this.shift,ground:this.footGround,arms:snackArms(s)}))this.mode.state.emitSound('footstep');
  snackHead(s,this.hero,dt);
 }
 // The Opala parked at the box is solid for the pilot on foot.
 againstCar(pos){const c=this.car,dx=pos.x-c.x,dz=pos.z+c.y,h=c.heading;return Math.abs(dx*Math.cos(h)-dz*Math.sin(h))<2.65&&Math.abs(dx*Math.sin(h)+dz*Math.cos(h))<1.25;}
 // Without a layout: the paved area round the station, clear of the car, pump and people.
 stationFloor(pos){
  const local=this.station.worldToLocal(pos.clone());if(Math.abs(local.x)>7||local.z<-8.7||local.z>3.5||this.againstCar(pos))return null;
  if([[4,-3.5,.9,.8],[2.7,-2.5,.55,.55],[-5,-4,.35,.35],[5,-4,.35,.35],[-6.5,-8,.35,.35],[6.5,-8,.35,.35]].some(([x,z,rx,rz])=>Math.abs(local.x-x)<rx&&Math.abs(local.z-z)<rz))return null;
  local.y=Math.max(0,Math.min(.25,(-local.z-6.5)*.25));return this.station.localToWorld(local).y;
 }
 // A car stopping here opens the stop (beforeStep): F there (free-walk.js) waits for it and gets out to the café.
 willOpen(){return !this.opened&&!this.departing&&this.racing&&(this.layout?.inBox?this.layout.inBox(this.car.surface):inPitBox(this.car.surface));}
 beforeStep(input,dt){
  if(!this.racing){if(this.opened){this.service.cancel();this.close();}return false;}
  const c=this.car,speed=Math.hypot(c.vx,c.vy),box=this.layout?.inBox?this.layout.inBox(c.surface):inPitBox(c.surface);
  if(!box)this.departing=false;
  this.condition.wear(dt,{offRoad:!c.surface.onRoad,speed,spin:c.rearSlipSpeed});
  if(!this.opened){this.stationary=box&&speed<.65&&!input.throttle&&!input.reverse?this.stationary+dt:0;if(this.stationary>.65&&!this.departing){this.opened=true;this.view=this.startView();this.mode.goTime=0;this.message='Bem-vindo ao box. Escolha abastecimento, reparos ou um passeio.';this.onOpen();this.mode.state.emitSound('paper');this.render();}}
  if(!this.opened)return false;
  this.walk(input,dt);Object.assign(input,idle);c.vx=c.vy=c.yaw=0;c.burnout=c.rearSlipSpeed=0;
  this.mode.stepPit(dt);
  if(this.service.jobs.some(job=>job.id!=='fuel'&&Math.floor(job.elapsed/1.4)!==Math.floor((job.elapsed+dt)/1.4)))this.mode.state.emitSound('pitRepair');
  const completed=this.service.step(dt);this.syncOpenings();
  if(completed.length){const working=this.service.jobs.map(jobName);this.message=`${completed.map(jobName).join(' e ')}: serviço concluído.`+(working.length?` Na equipe agora: ${working.join(', ')}.`:' Tudo pronto para voltar!');this.mode.state.emitSound('judgeApprove');}
  if(this.mode.active){this.mode.state.health=this.condition.health;if(this.condition.quality.tanque>.4){this.mode.state.tankDetached=false;this.mode.state.tankWear=0;}}
  return true;
 }
 render(){
  const $=id=>this.panel.querySelector('#'+id),job=this.service.job,busy=!!job,walking=!!this.coffee;
  const menu=!!this.coffee?.menu,locked=!!document.pointerLockElement;$('pitTitle').textContent=menu?'Lanchonete da Tia':this.title;
  $('pitViewHint').textContent=walking?(this.touch?'':locked?'Tab: solta o mouse para clicar nos consertos.':'Clique na pista para voltar a olhar com o mouse · Tab também.'):this.touch?'Arraste na pista para girar a câmera.':'Arraste na pista para girar a câmera · roda do mouse: zoom.';$('pitWallet').textContent=(this.mode.active?'Saldo disponível: ':'Verba da equipe: ')+money(this.wallet);$('pitFuel').textContent=this.fuel.toFixed(1)+' / 12 L';$('pitMessage').textContent=this.message||'';
  // Every job at work has its own bar; each waiting one says what it waits for.
  const jobs=this.service.jobs;$('pitJob').hidden=!busy;
  if(busy){
   $('pitJobLabel').textContent=(jobs.length>1?`Equipe em ${jobs.length} frentes ao mesmo tempo`:'Equipe trabalhando')+(this.service.queue.length?` · +${this.service.queue.length} na fila`:'');
   const active=jobs.map(j=>j.id).join(',');if(this.activeSignature!==active){this.activeSignature=active;$('pitActive').replaceChildren(...jobs.map(j=>{const row=document.createElement('div');row.dataset.activeJob=j.id;row.append(document.createElement('span'),Object.assign(document.createElement('progress'),{max:1}));return row;}));}
   for(const j of jobs){const row=$('pitActive').querySelector(`[data-active-job="${j.id}"]`);row.firstChild.textContent=`${jobName(j)}${j.kind==='patch'?' (gambiarra)':''} · ${Math.ceil(j.seconds-j.elapsed)} s`;row.lastChild.value=j.progress;}
  }else this.activeSignature='';
  const signature=this.service.queue.map(j=>j.id+':'+this.waitReason(j)).join(',');if(this.queueSignature!==signature){this.queueSignature=signature;$('pitQueue').replaceChildren();for(const queued of this.service.queue){const button=document.createElement('button');button.dataset.cancelJob=queued.id;button.textContent=`${jobName(queued)}${queued.kind==='patch'?' (gambiarra)':''} · ${this.waitReason(queued)} · cancelar ×`;button.onclick=()=>{const refund=this.service.cancelQueued(queued.id);this.message=`Retirado da fila. ${money(refund)} devolvidos.`;this.render();};$('pitQueue').append(button);}}
  for(const p of CAR_PARTS){const q=this.condition.quality[p.id];this.panel.querySelector(`[data-quality="${p.id}"]`).textContent=pct(q);this.panel.querySelector(`[data-quality-bar="${p.id}"]`).value=q;}
  for(const b of this.panel.querySelectorAll('[data-repair]')){const quote=this.condition.quote(b.dataset.repair,b.dataset.kind),proper=b.dataset.kind==='proper',pending=this.service.has(b.dataset.repair);b.textContent=pending?(jobs.some(j=>j.id===b.dataset.repair)?'Em serviço':'Na fila · pago'):quote?`${proper?'Resolver pra valer':'Gambiarra'} · ${money(quote.cost)} · ${Math.ceil(quote.seconds)} s → ${pct(quote.to)}`:proper?'Tudo certo · 100%':'Gambiarra não melhora';b.disabled=pending||!quote||quote.cost>this.wallet;}
  // Abastecer: 2 L more, as the tank holds; Completar: back to what the race needs (fuel.js, ImmersiveMode.fuelTarget).
  for(const [id,amount] of [['pitFill2',Math.min(2,this.mode.tank-this.fuel)],['pitFillAll',this.mode.fuelTarget-this.fuel]]){const litres=Math.max(0,amount),cost=Math.ceil(litres*6.5);$(id).textContent=this.service.has('fuel')?'Abastecimento · pago':litres<.05?(id==='pitFill2'?'Tanque cheio':'Completo para a corrida'):(id==='pitFill2'?'Abastecer ':'Completar · ')+litres.toFixed(1)+' L · '+money(cost);$(id).disabled=this.service.has('fuel')||litres<.05||cost>this.wallet;}
  $('pitGarage').hidden=menu;$('pitCafe').hidden=!menu;$('pitCoffee').hidden=walking;$('pitCoffee').textContent=document.body.classList.contains('touch-device')?'Sair do carro · Café da Tia grátis':`Sair do carro (${keyName('KeyF')}) · Café da Tia grátis`;$('pitLeave').hidden=walking;$('pitLeave').textContent=busy?'Sair agora · interromper serviços':'Voltar à pista →';
  $('pitCafeStatus').textContent=this.coffee?.feedback||'Escolha um quitute. Só paga o que pedir.';
  for(const button of this.panel.querySelectorAll('[data-snack]'))button.disabled=CAFE_MENU.find(item=>item.id===button.dataset.snack).price>this.wallet||(this.coffee?.held.length??0)>=2;
  if(walking){
   const action=this.interaction(),touch=this.touch,s=this.coffee,first=s.held[0],firstItem=first&&CAFE_MENU.find(m=>m.id===first.id),hud=id=>this.walkHud.querySelector('#'+id);
   hud('pitWalkJob').textContent=busy?'Equipe: '+jobs.map(j=>`${jobName(j)} ${Math.ceil(j.seconds-j.elapsed)} s`).join(' · ')+(this.service.queue.length?` · +${this.service.queue.length} na fila`:''):'Opala pronto. Volte quando quiser.';
   hud('pitWalkHold').hidden=!first;hud('pitWalkHold').textContent='Na mão: '+snackLabel(s);
   const lid=SPOT_ROLE[action]?this.openingLabel(action):'',eText=firstItem?`${firstItem.verb} ${firstItem.name.toLowerCase()}`:action==='cafe'?'cardápio':action==='car'?(!this.openings?.has(OPENINGS.driverDoor)?'entrar no Opala':this.openings.held(OPENINGS.driverDoor,'manual')?'fechar a porta':'abrir a porta'):lid?lid[0].toLowerCase()+lid.slice(1):'interagir';
   hud('pitWalkHint').textContent=`Saldo: ${money(this.wallet)} · `+(touch?'Caminhe até a Tia ou o carro.':keyText(`Mouse: câmera · {KeyW}/{KeyA}/{KeyS}/{KeyD}: andar · {ShiftLeft}: correr · {Space}: pular · {KeyC}: agachar · {KeyE}: ${eText} · {KeyF}: ${action==='car'?'entrar no Opala':'sair/entrar no carro'} · Tab: mouse no menu`));
   hud('pitRepairs').textContent=s.repairs?'Esconder consertos':'Consertos do Opala';
   const use=hud('pitUse');use.hidden=!firstItem;if(firstItem)use.textContent=`${firstItem.verb[0].toUpperCase()+firstItem.verb.slice(1)} ${firstItem.name.toLowerCase()}`+(touch?'':' · E');use.disabled=!!s.using;
   const button=hud('pitInteract');button.hidden=!action;button.textContent=action==='car'?(busy?'Entrar e sair · interromper serviços':'Entrar no Opala e voltar à pista')+(touch?'':' · F'):lid?lid+(touch?'':' · E'):'Ver cardápio da Tia';
  }
 }
 update(dt,camera,visible){
  this.cameraRef=camera;const walking=!!this.coffee,menu=!!this.coffee?.menu;
  // In the story's paddock the Tia greets and serves its pilot (ImmersiveMode.cafeGuest).
  const guest=this.opened?null:this.mode.cafeGuest?.();
  this.layout?.animate?.(dt,{camera,opened:this.opened,walking:walking||!!guest,departing:this.departing,job:this.service.job,jobs:this.service.jobs,queue:this.service.queue,car:this.car,hero:guest?.hero??this.hero.position,snack:guest?.snack??this.coffee?.snackTime??0});this.hud.hidden=!visible||!this.racing||this.opened||!this.condition.enabled;this.panel.hidden=!visible||!this.opened||(walking&&!menu&&!this.coffee.repairs);this.walkHud.hidden=!visible||!walking||menu;this.panel.classList.toggle('cafe-menu',menu);this.panel.classList.toggle('walking',walking&&!menu);
  document.body.classList.toggle('pit-open',visible&&this.opened);document.body.classList.toggle('pit-walking',visible&&walking);document.body.classList.toggle('pit-cafe-menu',visible&&menu);document.body.classList.toggle('pit-repairs',visible&&walking&&!menu&&!!this.coffee?.repairs);
  if(this.viewShifted&&(!visible||this.panel.hidden)){camera.clearViewOffset();this.viewShifted=false;}
  if(this.savedFov!==undefined&&(!visible||!walking)){camera.fov=this.savedFov;camera.updateProjectionMatrix();this.savedFov=undefined;}
  this.hud.querySelector('#conditionPower').textContent='CONDIÇÃO '+pct(this.condition.health)+' · POTÊNCIA '+pct(this.condition.factors.power);
  // Each part's bar with its percentage, red below 40%, yellow below 80%.
  for(const p of CAR_PARTS){const q=this.condition.quality[p.id],label=this.hud.querySelector(`[data-health-pct="${p.id}"]`);this.hud.querySelector(`[data-health="${p.id}"]`).value=q;label.textContent=pct(q);label.dataset.level=q<.4?'low':q<.8?'mid':'ok';}
  this.hud.querySelector('#pitHint').textContent=this.car.surface.pit?'BOX 99 · pare no retângulo amarelo':'P no mapa · pitstop na reta principal';
  this.markers.visible=this.opened&&!walking;this.cafePrompt.visible=visible&&walking&&!menu&&this.interaction()!=='cafe';this.markers.children.forEach((m,i)=>m.material.color.setHSL(this.condition.quality[CAR_PARTS[i].id]*.32,.85,.52));
  if(!this.opened)return;this.render();this.driver.root.visible=!walking;showSnacks(this.hands,this.hero,this.coffee);
  if(!visible)return;
  const c=this.car,forward=new THREE.Vector3(Math.cos(c.heading),0,-Math.sin(c.heading)),inside=new THREE.Vector3(-Math.sin(c.heading),0,-Math.cos(c.heading));
  const v=this.view??=this.startView(),flat=Math.cos(v.elev)*v.distance,target=new THREE.Vector3(c.x,c.surface.z+1,-c.y),eye=target.clone().addScaledVector(forward,Math.cos(v.angle)*flat).addScaledVector(inside,Math.sin(v.angle)*flat).add(new THREE.Vector3(0,Math.sin(v.elev)*v.distance,0));
  if(walking){
   if(this.savedFov===undefined){this.savedFov=camera.fov;camera.fov=58;camera.updateProjectionMatrix();}
   const s=this.coffee,lens=s.zoomFov??58,fov=s.running&&lens>=57?65:lens;if(Math.abs(camera.fov-fov)>.05){camera.fov+=(fov-camera.fov)*(1-Math.exp(-dt*5));camera.updateProjectionMatrix();}
  }
  if(!this.panel.hidden){camera.setViewOffset(innerWidth,innerHeight,this.panel.getBoundingClientRect().width/2,0,innerWidth,innerHeight);this.viewShifted=true;}
  // On foot the camera follows the pilot (on-foot.js, smoothed from where it was); in
  // the car it orbits. Either way a wall in between brings it in front of the wall.
  if(walking)this.walkFollow=placeFootCamera(camera,this.coffee,this.hero.position,{layout:this.layout,obstacles:this.obstacles,ground:this.groundAt,dt,follow:this.walkFollow??camera.position.clone(),body:this.hero});
  else{this.walkFollow=null;camera.position.lerp(eye,1-Math.exp(-Math.max(dt,.016)*12));clearView(target,camera.position,this.obstacles,this.groundAt);camera.up.set(0,1,0);camera.lookAt(target);}
 }
 buildScene(){
  const v=this.mode.visual,anchor=this.layout?.anchor??trackPoint(this.data,20,20);this.anchor=anchor;const h=anchor.heading;
  this.station=new THREE.Group();this.station.position.set(anchor.x,anchor.y,anchor.z);this.station.rotation.y=h;this.root.add(this.station);
  const box=(pos,size,color)=>v.box(this.station,pos,size,color);
  // Building signs stay fixed to the facade instead of turning across the camera.
  const sign=(text,pos,w,h,fg,bg)=>{const sprite=v.tag(this.station,text,pos,w,h,fg,bg),plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:sprite.material.map,side:THREE.DoubleSide}));plane.position.copy(sprite.position);this.station.remove(sprite);sprite.material.dispose();this.station.add(plane);return plane;};
  this.station.updateMatrixWorld(true);if(!this.layout){const apronGeometry=new THREE.PlaneGeometry(16,16).rotateX(-Math.PI/2).translate(0,-.024,-4).applyMatrix4(this.station.matrixWorld);const apron=new THREE.Mesh(this.roadSurface.geometry(apronGeometry),this.roadSurface.material);apron.name='Asfalto_Area_Box99';apron.receiveShadow=true;this.root.add(apron);}
  // Curvelo's lane-side box and café; a layout with its own scenery builds its garage.
  if(!this.layout?.scenery){
   for(const z of [-2.25,2.25])box([0,.03,z],[7,.025,.12],0xf3d349);for(const x of [-3.5,3.5])box([x,.03,0],[.12,.025,4.5],0xf3d349);
   box([0,4.15,.62],[9.5,1.25,.14],0x103a30);const pitSign=sign('PITSTOP · BOX 99',[0,4.15,.71],9.2,1.12,'#fff4c5','#103a30');pitSign.name='Placa_Pitstop_Frente';pitSign.material.map.anisotropy=8;pitSign.material.side=THREE.FrontSide;const backSign=pitSign.clone();backSign.name='Placa_Pitstop_Verso';backSign.position.z=.53;backSign.rotation.y=Math.PI;this.station.add(backSign);
   for(const x of [-5,5])box([x,2.3,-4],[.18,4.6,.18],0xb6b9ac);box([0,4.65,-4],[12,.18,9],0x447361);
   box([4,1,-3.5],[1,2,.7],0xd6bc43);v.tag(this.station,'GASOLINA',[4,2.35,-3.5],1.7,.32);
   const mechanic=v.human(0x547c9e);mechanic.position.set(2.7,0,-2.5);this.station.add(mechanic);v.tag(mechanic,'MECÂNICO',[0,2.1,0],2,.32);
   // The café is inside the pit complex, on the infield side of the service lane.
   box([0,.1,-12],[14,.3,9],0xaf9875);box([0,1.7,-15],[14,3.4,.25],0xb8764b);box([0,3.6,-12],[15,.25,9],0x974b32);
   for(const x of [-6.5,6.5])box([x,1.8,-8],[.2,3.6,.2],0xd5b898);
   box([0,.7,-10],[8,.9,1.2],0xe0c89a);sign('LANCHONETE DA TIA',[0,3,-14.8],11,.8,'#ffe2a0','#754627');sign('CAFÉ · PÃO DE QUEIJO · DOCE DE LEITE',[0,2.2,-14.8],8,.38,'#fff','#8b5434');
   const tia=this.tia=v.human(0xe5b269);tia.position.set(1,.25,-11.2);tia.rotation.y=Math.PI/2;this.station.add(tia);v.box(tia,[.18,1.03,0],[.03,.48,.36],0xf2ecdc);v.tag(tia,'TIA',[0,2.05,0],.8,.3);
   for(let i=0;i<5;i++){const bread=new THREE.Mesh(new THREE.SphereGeometry(.16,10,6),new THREE.MeshStandardMaterial({color:0xe8bb62,roughness:.9}));bread.position.set(-1.6+i*.32,1.33,-9.7);this.station.add(bread);}
   for(const [x,color] of [[1,0x815031],[2,0xeee9dc]]){const jar=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.45,12),new THREE.MeshStandardMaterial({color}));jar.position.set(x,1.4,-9.7);this.station.add(jar);}
  }
  this.hero=this.layout?.makeHero?.()??v.human(0xd82125);if(!this.layout?.makeHero)v.tag(this.hero,'99',[.19,1.15,0],.3,.25);const helmet=this.driver.root.getObjectByName('Capacete_preto_vermelho_balaclava');if(helmet&&!this.layout?.makeHero){this.hero.userData.head.visible=false;const copy=helmet.clone();copy.position.set(0,1.62,0);this.hero.add(copy);}this.hero.visible=false;this.root.add(this.hero);
  this.hands=snackHands(this.hero);
  this.station.updateMatrixWorld(true);
  // The Interlagos café is behind walls: its sign shows through them as a guide.
  if(this.layout?.cafeSeat){this.cafeSeat=this.layout.cafeSeat.clone();this.cafePrompt=v.tag(this.root,'CARDÁPIO DA TIA',this.layout.cafeSign.toArray(),2.6,.4,'#ffe2a0','#754627');this.cafePrompt.material.depthTest=false;this.cafePrompt.renderOrder=90;}
  else{this.cafeSeat=this.station.localToWorld(new THREE.Vector3(-1,.25,-8.2));this.cafePrompt=v.tag(this.station,'CARDÁPIO DA TIA',[-1,2.3,-8.2],2.6,.4,'#ffe2a0','#754627');}
  this.cafePrompt.visible=false;
  this.markers=new THREE.Group();this.carRoot.add(this.markers);for(const [i,p] of CAR_PARTS.entries()){const marker=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),new THREE.MeshBasicMaterial({color:0x60df62,depthTest:false}));marker.position.set(...p.point);marker.renderOrder=100;this.markers.add(marker);v.tag(marker,String(i+1),[0,.23,0],.25,.25);}this.markers.visible=false;
  // Driveable entrance and exit join the track smoothly. All vertices follow physics.
  // A surveyed circuit brings its own pit lane; Curvelo's service lane is drawn here.
  if(this.data.pit)return;
  const positions=[],indices=[];let n=0;
  const ordered=this.data.samples.filter(p=>pitLane(this.data,p[0])).sort((a,b)=>pitLane(this.data,a[0]).u-pitLane(this.data,b[0]).u);
  for(const p of ordered){const lane=pitLane(this.data,p[0]);for(const side of [-1,1]){const d=lane.offset+side*lane.halfWidth;positions.push(p[1]+p[9]*d,3.075,-p[2]-p[10]*d);}if(n){const k=(n-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}n++;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const laneGeometry=this.roadSurface.geometry(g),coords=laneGeometry.getAttribute('roadData');for(let i=0;i<coords.count;i++){const lane=pitLane(this.data,coords.getY(i));coords.setX(i,coords.getX(i)-(lane?.offset??0));coords.setZ(i,6.6);coords.setW(i,0);}const asphalt=new THREE.Mesh(laneGeometry,this.roadSurface.material);asphalt.name='Asfalto_Acesso_Pitstop';asphalt.receiveShadow=true;this.root.add(asphalt);
  // Entry and exit signs stand beside the lane with the pit scenery (pit-building.js).
 }
 info(){return {opened:this.opened,coffee:!!this.coffee,walking:!!this.coffee,cafeMenu:!!this.coffee?.menu,hero:this.hero.position.toArray(),queue:this.service.queue.map(job=>({...job})),job:this.service.job?{...this.service.job}:null,jobs:this.service.jobs.map(job=>({...job})),wallet:this.wallet,quality:{...this.condition.quality},factors:this.condition.factors};}
}
