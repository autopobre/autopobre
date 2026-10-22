import * as THREE from 'three';
import {circuitId} from './circuits.js';
import {TANKS,burnRate,fuelScale,recommendedFuel} from './fuel.js';
import {RIVAL_ROSTER,GRID_SIZE} from './race-roster.js';
import {RaceField,lapTravel} from './race-field.js';
import {recognitionInput,sameLevel} from './physics.js';
import {CrashParts} from './crash-parts.js';
import {ImmersiveState,FANS,JOKES,BLAZER_COST,COSTS,START,startCost} from './immersive-state.js';
import {SWITCH_TILT} from './cockpit-instruments.js';
import {ImmersiveVisuals,trackPoint} from './immersive-visuals.js';
import {footGround} from './on-foot.js';
import {keyName,keyText,playerKeys} from './key-bindings.js';
import {CAFE_MENU,snackState,giveSnack,buySnack,useSnack,stepSnack,snackArms,snackHead,snackHands,showSnacks,snackLabel,snackVerb} from './pitstop.js';
import {entryFor,CHALLENGES,MORALE,MORALE_NAMES,MORALE_LABELS,OUTCOME_TITLES,GAME_OVER,MISSED,REFUSED,STORY_PROFILE_KEY,PENSION} from './story-career.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const idle={throttle:0,brake:1,left:0,right:0,handbrake:0,reverse:0},still={throttle:0,brake:0,left:0,right:0};
const touchScreen=()=>document.body.classList.contains('touch-device');
// Modo Corrida's fuel (fuel.js, Central #11): the race starts with what it needs (the circuit's 8-lap litres,
// more for a longer race) and burns at the circuit's scale; practice (endless laps) burns none.
export const freeBurn=(data,laps)=>Number.isFinite(laps)?fuelScale(circuitId(data.meta.id),data.meta.reconstructed_xy_m):0;
const capital=text=>text[0].toUpperCase()+text.slice(1);
// What the action key does by the Opala in the paddock (car-openings.js carSpot); open: already open.
const CAR_ACTIONS=Object.freeze({capo:open=>open?'Fechar o capô':'Abrir o capô · ver o motor',porta_malas:open=>open?'Fechar o porta-malas':'Abrir o porta-malas',porta_carona:open=>open?'Fechar a porta do carona':'Abrir a porta do carona',porta:()=>'Entrar no Opala 99'});
// Reais as on a price tag: R$ 1.000,00.
const money=n=>`R$ ${n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+,)/g,'.')}`;
const percent=(value,goal)=>Math.max(0,Math.min(100,Math.floor(value/goal*100)));
// The faces of the career's cards: the wife, the team, the supporters (story-career.js MORALE).
const MORALE_ICONS=Object.freeze({esposa:'♥',equipe:'99',torcida:'★'});
const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Throttle dial for the engine start: half a circle from no throttle (left) to full (right),
// banded as START: too little, where it catches, too much, flooding. #startNeedle turns about (110, 112).
const START_DIAL=(()=>{
 const cx=110,cy=112,r=88,at=(f,rr=r)=>{const a=Math.PI*(1-f);return [cx+rr*Math.cos(a),cy-rr*Math.sin(a)].map(v=>v.toFixed(1));};
 const bands=[[0,START.low,'BAIXO'],[START.low,START.high,'NO PONTO'],[START.high,START.flood,'ALTO'],[START.flood,1,'AFOGA']];
 const arcs=bands.map(([f0,f1],i)=>{const [x0,y0]=at(f0),[x1,y1]=at(f1);return `<path class="band band-${i}" d="M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}"/>`;}).join('');
 const ticks=Array.from({length:21},(_,i)=>{const [x0,y0]=at(i/20,r-11),[x1,y1]=at(i/20,r-(i%5?15:21));return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;}).join('');
 const labels=bands.map(([f0,f1,label],i)=>{const [x,y]=at((f0+f1)/2,r+15);return `<text class="band-${i}" x="${x}" y="${y}">${label}</text>`;}).join('');
 return `<svg class="start-dial" viewBox="-12 -16 244 136" aria-hidden="true">${arcs}<g class="ticks">${ticks}</g>${labels}<g id="startNeedle"><path d="M${cx-4} ${cy}L${cx} ${cy-r+14}L${cx+4} ${cy}Z"/><circle cx="${cx}" cy="${cy}" r="8"/></g></svg>`;
})();
export class ImmersiveMode {
 // layout: the circuit's Box 99 (pit-box99.js), whose garage and café the pilot can walk
 // into before the race; obstacles: walls the walking camera must not pass through.
 // playerView: the camera the player last chose (main.js), the one the race is driven in.
 // onGo: the start is given (free countdown or story grid), the car must be ready to go.
 constructor({scene,carRoot,car,data,driver,rivalTemplate,skidMarks,resetVehicle,releaseMouse,onNormal,onGo=null,layout=null,obstacles=[],setView=null,getView=null,playerView=null}){
  Object.assign(this,{carRoot,car,data,resetVehicle,releaseMouse,onNormal,onGo,setView,getView,playerView});let profile={};try{profile=JSON.parse(localStorage.getItem(STORY_PROFILE_KEY))||{};}catch{}
  this.freeCountdown=0;this.goTime=0;this.tank=TANKS.opala;this.freeFuel=recommendedFuel(circuitId(data.meta.id),3);this.freeBurn=1;this.laps=3;this.lineup=null;this.freeLineup=null;this.freeTotalLaps=3;this.storyLaps=3;this.freeFinished=false;this.freePosition=GRID_SIZE;this.freePlayerProgress=0;this.rivalTrails=RIVAL_ROSTER.map(()=>skidMarks?.createTrail());this.field=new RaceField(data,{onStep:(r,i,input,dt)=>{r.input=input;this.rivalTrails[i]?.update(r.car,input,dt);},onReset:()=>this.rivalTrails.forEach(t=>t?.breakTrails())});this.parts=new CrashParts(scene);this.state=new ImmersiveState(profile);this.visual=new ImmersiveVisuals(scene,carRoot,data,driver,car,rivalTemplate);this.lastPhase='off';this.lastUI='';this.near=-1;this.rivals=this.field.rivals;this.projectile=null;this.towOrigin=0;this.prepLitres=this.fuelChoice=6;this.prepFilm=false;
  this.brand=document.querySelector('.wordmark');this.baseBrand=this.brand.innerHTML;this.baseTitle=document.title;
  this.controls=document.querySelector('footer>div');this.baseControls=this.controls.innerHTML;
  this.panel=document.createElement('section');this.panel.id='immersivePanel';this.panel.className='hidden';this.panel.setAttribute('aria-label','Auto-Pobre Racing');document.body.append(this.panel);
  this.hud=document.createElement('section');this.hud.id='immersiveHud';this.hud.className='hidden';this.hud.innerHTML='<div class="imm-brand">AUTO-POBRE RACING <span id="immPhase"></span></div><div class="imm-meters"><span>GASOLINA <b id="immFuel"></b></span><span>CARRO <b id="immHealth"></b></span><span>VIDRO <b id="immGlass"></b></span><span>NA PISTA <b id="immPosition"></b></span></div><div id="immAlert" role="status"></div>';document.body.append(this.hud);
  this.onPickFan=e=>this.pickFan(e);document.getElementById('view').addEventListener('pointerdown',this.onPickFan);
  // On foot in the paddock, as in a third-person game: the mouse is captured (no cursor)
  // from the first key or click and turns the camera; the wheel zooms, Shift runs.
  Object.assign(this.visual,{layout,obstacles,groundAt:(x,y)=>car.sample(x,y).z-.055});this.visual.addDesk(layout?.desk);this.visual.addCafe(layout);
  // The Tia's café is open before the race too, as during a pit stop (pitstop.js): what is bought,
  // and Leonardo's coffee, goes into the pilot's hands.
  this.cafe=snackState();this.snackHands=snackHands(this.visual.hero);
  this.walkGround=footGround({car,pit:layout?.pit??null,layout,blocked:pos=>this.visual.blocked(pos)});
  const view=document.getElementById('view');
  this.onFootMouse=e=>{if(this.onFoot()&&document.pointerLockElement===view)this.visual.turnView(e.movementX,e.movementY);};
  this.onFootWheel=e=>{if(this.onFoot())this.visual.zoomView(Math.sign(e.deltaY));};
  this.onShift=e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')this.shift=e.type==='keydown';};this.onBlur=()=>{this.shift=false;};
  // A capture asked for on foot can arrive after the paddock is over: give it back.
  // A capture granted late, after the phase it was asked for (walk to podium), is handed back too.
  this.onLock=()=>{if(document.pointerLockElement!==view)this.footLock=false;else if(this.footLock&&!(this.active&&['crowd','podium'].includes(this.state.phase)&&this.lockFor===this.state.phase))document.exitPointerLock();};
  document.addEventListener('mousemove',this.onFootMouse);view.addEventListener('wheel',this.onFootWheel,{passive:true});document.addEventListener('keydown',this.onShift);document.addEventListener('keyup',this.onShift);window.addEventListener('blur',this.onBlur);
  document.addEventListener('pointerlockchange',this.onLock);document.addEventListener('pointerlockerror',this.onLock);
  document.getElementById('dqContinue').onclick=()=>{if(this.state.phase==='disqualified')this.afterDisqualified();};
  this.panel.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled)this.action(b.dataset.action);});
  // The engine start: PARTIDA is held (on screen, or the PART button in the cockpit) and the
  // IGN switch in the cockpit is clicked like the one on screen.
  this.panel.addEventListener('pointerdown',e=>{if(e.target.closest('[data-hold="crank"]')){e.preventDefault();this.holdStarter(e.pointerId);}});
  this.onStartPointer=e=>{if(e.button!==0||!this.active||this.state.phase!=='starting')return;const hit=this.switchAt(e.clientX,e.clientY);if(hit==='ign')this.action('ign');if(hit==='part')this.holdStarter(e.pointerId);};
  this.onStartHover=e=>{if(this.active&&this.state.phase==='starting')view.style.cursor=this.switchAt(e.clientX,e.clientY)?'pointer':'';else if(view.style.cursor==='pointer')view.style.cursor='';};
  this.onStartRelease=e=>this.releaseStarter(e.pointerId);this.onStartBlur=()=>this.releaseStarter();
  view.addEventListener('pointerdown',this.onStartPointer);view.addEventListener('pointermove',this.onStartHover);window.addEventListener('pointerup',this.onStartRelease);window.addEventListener('pointercancel',this.onStartRelease);window.addEventListener('blur',this.onStartBlur);
  // Enter pays at the team's desk even with the fuel slider or the film box focused (the game skips keys typed in inputs).
  this.panel.addEventListener('keydown',e=>{if(['Enter','NumpadEnter'].includes(e.code)&&this.state.desk&&e.target.matches('input')){e.preventDefault();this.action('buy');}});
  this.panel.addEventListener('input',e=>{if(e.target.id==='immLitres'){this.prepLitres=this.fuelChoice=Number(e.target.value);this.updateDeskCosts();}if(e.target.id==='immFilm'){this.prepFilm=e.target.checked;this.updateDeskCosts();}});
 }
 dispose(){this.disable();const view=document.getElementById('view');view.removeEventListener('pointerdown',this.onPickFan);view.removeEventListener('pointerdown',this.onStartPointer);view.removeEventListener('pointermove',this.onStartHover);window.removeEventListener('pointerup',this.onStartRelease);window.removeEventListener('pointercancel',this.onStartRelease);window.removeEventListener('blur',this.onStartBlur);view.removeEventListener('wheel',this.onFootWheel);document.removeEventListener('mousemove',this.onFootMouse);document.removeEventListener('keydown',this.onShift);document.removeEventListener('keyup',this.onShift);window.removeEventListener('blur',this.onBlur);document.removeEventListener('pointerlockchange',this.onLock);document.removeEventListener('pointerlockerror',this.onLock);this.panel.remove();this.hud.remove();document.getElementById('dqContinue').onclick=null;}
 pickFan(event){
  if(event.button===0&&this.active&&this.state.phase==='podium'&&event.pointerType==='mouse'){this.mouseFree=false;queueMicrotask(()=>this.captureMouse());return;}
  if(event.button!==0||!this.active||this.state.phase!=='crowd'||!this.camera)return;
  // With the mouse captured the middle of the screen aims; a free cursor points. A
  // click takes the mouse for the camera (after this one is handled).
  const view=event.currentTarget,locked=document.pointerLockElement===view,rect=view.getBoundingClientRect(),pointer=locked?new THREE.Vector2():new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
  if(event.pointerType==='mouse'){this.mouseFree=false;queueMicrotask(()=>this.captureMouse());}
  if(this.inCar||this.state.desk||this.state.leo||this.state.cafe||this.state.scene)return;
  const marker=this.visual.deskMarker?.marker.visible?this.visual.deskMarker:null,cafeSign=this.visual.cafe?.sign.visible?this.visual.cafe.sign:null;
  const leo=this.visual.leo,hit=ray.intersectObjects([...this.visual.fans.flatMap(f=>[f.person,f.label,...(f.dollar.visible?[f.dollar]:[])]),...(marker?[marker.marker,marker.sign]:[]),...(leo?[leo.person,leo.label]:[]),...(cafeSign?[cafeSign]:[])],true)[0];if(!hit)return;
  // Leonardo: the pilot walks up to him, and he asks (again) once there.
  if(leo&&(hit.object===leo.label||hit.object===leo.person||hit.object.parent===leo.person)){this.state.fan=null;this.state.feedback='';this.walkToFan=this.walkToDesk=this.walkToCafe=null;if(this.visual.nearLeo(2.4))this.action('leo');else this.walkToLeo=this.visual.leoRoute();this.ui();return;}
  // The registration circle or its sign: he walks there by the steps.
  if(marker&&(hit.object===marker.sign||hit.object.parent===marker.marker)){this.state.fan=null;this.state.feedback='';this.walkToFan=this.walkToCafe=null;this.walkToLeo=false;this.walkToDesk=this.visual.deskRoute();this.state.touch();this.ui();return;}
  // The café's sign: through Box 99 to the Tia's counter, where her menu opens.
  if(cafeSign&&hit.object===cafeSign){this.state.fan=null;this.state.feedback='';this.walkToFan=this.walkToDesk=null;this.walkToLeo=false;if(this.visual.nearCafe(2.4))this.action('cafe');else this.walkToCafe=this.visual.cafeRoute();this.state.touch();this.ui();return;}
  const index=this.visual.fans.findIndex(f=>{let obj=hit.object;while(obj){if(obj===f.person||obj===f.label||obj===f.dollar)return true;obj=obj.parent;}return false;});if(index<0)return;
  this.state.fan=null;this.state.feedback='';this.state.touch();this.walkToFan=index;this.walkToDesk=this.walkToCafe=null;this.walkToLeo=false;this.fanRoute=this.visual.routeTo(this.visual.fans[index].pos,{direct:true});
  if(this.visual.hero.position.distanceTo(this.visual.fans[index].pos)<2.6){this.state.talk(index);this.walkToFan=null;}
  this.ui();
 }
 positionDialogue(){if(this.state.phase!=='crowd'||this.state.fan===null&&!this.state.leo||!this.camera)return;const p=(this.state.leo?this.visual.leo.person:this.visual.fans[this.state.fan].person).getWorldPosition(new THREE.Vector3());p.y+=1.85;p.project(this.camera);const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight,rect=this.panel.getBoundingClientRect();this.panel.style.left=`${Math.round(clamp(x+22+rect.width>innerWidth?x-rect.width-22:x+22,12,Math.max(12,innerWidth-rect.width-12)))}px`;this.panel.style.top=`${Math.round(clamp(y-rect.height*.3,80,Math.max(80,innerHeight-rect.height-70)))}px`;this.panel.style.bottom='auto';}
 get active(){return this.state.active;}
 get finishing(){return this.finishElapsed!==null&&this.finishElapsed!==undefined;}
 get freeResultReady(){return this.freeFinished&&!this.finishing;}
 get finishOpacity(){const t=clamp((this.finishElapsed??0)/5,0,1);return t*t*(3-2*t);}
 beginFinish(position){
  if(this.finishing)return;
  this.finishElapsed=0;this.finishTime=this.car.clock;this.finishPosition=position;this.finishBest=this.car.best;
  // The order at the line; whoever is still racing gets an estimated time to the flag.
  this.freeOrder=this.field.classification(this.active?this.storyLaps:this.freeTotalLaps,this.finishTime);
  this.projectile=null;this.state.emitSound('finish');
 }
 stepFinish(input,dt){
  const c=this.car,command=recognitionInput(c,{maxSpeed:Math.max(12,Math.hypot(c.vx,c.vy)),cornerGrip:7,braking:7});
  // Keep rolling along the circuit while easing off; racing input cannot change the result.
  command.throttle=0;command.brake=Math.max(.06,command.brake);Object.assign(input,command);
  c.step(command,dt);c.clock=this.finishTime;
  this.field.step(c,dt,this.active?this.storyLaps:this.freeTotalLaps);
  this.finishElapsed=Math.min(5,this.finishElapsed+dt);
  if(this.finishElapsed>=5-1e-8){
   this.finishElapsed=null;
   if(this.active){this.state.finish(this.finishPosition,false);this.sync();}
   else this.state.emitSound(this.freePosition===1?'podiumWin':'podiumLoss');
  }
 }
 allowsPointer(){return ['race','tow','grid'].includes(this.state.phase);}
 // While the paddock walk still holds the mouse, losing it is not a pause.
 blockingUI(){return this.active&&(!this.allowsPointer()||!!this.footLock);}
 onFoot(){return this.active&&this.state.phase==='crowd'&&!this.inCar;}
 // The mouse and wheel drive this mode's own camera: the walk, and the podium's free camera.
 ownsMouse(){return this.onFoot()||this.active&&this.state.phase==='podium';}
 // F beside the Opala in Box 99 gets in, as in GTA: the real car takes its place and
 // the cockpit view shows the interior (the mouse looks round); F again gets out.
 enterCar(){
  const pose=this.visual.ownPose();if(!pose||this.inCar)return false;
  const c=this.car;c.x=pose.x;c.y=pose.y;c.heading=pose.heading;c.vx=c.vy=c.yaw=0;c.surface=c.sample(c.x,c.y);c.index=c.surface.i;c.settle?.();
  this.inCar=this.visual.inCar=true;this.walkToFan=this.walkToDesk=this.walkToCafe=null;this.walkToLeo=false;this.viewBefore=this.getView?.()??'chase';this.visual.restoreCamera();this.setView?.('cockpit');this.state.emitSound('click');return true;
 }
 // The paddock hint by the Opala: what E does where the pilot stands.
 carHint(){
  const spot=this.visual.carAction();if(spot){const text=CAR_ACTIONS[spot](this.visual.ownOpen(spot));return `${keyName('KeyE')}: ${text[0].toLowerCase()+text.slice(1)}`+(spot==='porta'?` (ou ${keyName('KeyF')})`:'');}
  return this.visual.nearCar()?keyText('{KeyF}: entrar no Opala 99 · {KeyE} na frente abre o capô, atrás o porta-malas'):'';
 }
 // Leonardo Martins, of the #19, and his coffee: the question with two answers (1, 2), then
 // what he says back. The pilot's name comes from the player: escaped before it goes in.
 leoPanel(){
  const s=this.state,name=escapeHtml(this.pilotName||'Stevan'),line={ask:`E aí, ${name}! Aceita um café? A Tia acabou de passar um fresquinho.`,yes:'Toma aí, puro e quentinho. Boa corrida — e cuidado comigo na freada do S do Senna!',no:'Beleza, fica pra próxima. Boa corrida!',chat:'E o café, tava bom? Agora é acelerar!'}[s.leo];
  const head=`<div class="social-person"><span class="social-avatar">19</span><div><span>CONVERSANDO COM</span><h2>Leonardo Martins · #19</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">“${line}”</div>`;
  if(s.leo!=='ask')return head+this.button('leo:close','Valeu! Boa corrida ({KeyE})',true);
  // The cup goes into a free hand: with both busy (the Tia's snacks) it has to wait.
  const full=this.cafe.held.length>=2;
  return head+`<div class="social-prompt">Sua resposta</div><div class="social-choices">${[['yes','Aceito! Valeu, Leo',full?'As duas mãos estão ocupadas: coma ou beba primeiro.':'Um cafezinho antes da largada cai bem.'],['no','Agora não, obrigado','Fica pra depois da corrida.']].map(([answer,text,more],i)=>`<button type="button" data-action="leo:${answer}" class="speech-choice" ${answer==='yes'&&full?'disabled':''}><span>${i+1}</span><div><b>${text}</b><small>${more}</small></div></button>`).join('')}</div>`;
 }
 // The Tia's menu at her counter, as at the pit stop: 1, 2, 3 or a click buys into a free hand, paid
 // from the kitty first, then from the savings (state.pay), never with the registration's money; E
 // goes back to the paddock. It stands where the team's panel does, clear of the pilot and the Tia
 // (visual.faceCafe).
 cafePanel(){
  const s=this.state,c=this.cafe,wallet=s.spareCash(),kept=s.cash+s.profile.fund,full=c.held.length>=2,line=c.feedback||'Uma prosa é de graça. O cafezinho e os quitutes são por sua conta, uai!';
  return `<div class="social-person"><span class="social-avatar">☕</span><div><span>LANCHONETE DA TIA</span><h2>Cardápio da Tia</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">“${line}”</div>`
   +`<div class="social-prompt">Na vaquinha: ${money(s.cash)}${s.profile.fund>0?` · carteira: ${money(s.profile.fund)}`:''}${c.held.length?` · na mão: ${snackLabel(c)}`:''}</div>`
   +`<div class="social-choices">${CAFE_MENU.map((item,i)=>`<button type="button" data-action="snack:${item.id}" class="speech-choice" ${full||item.price>wallet?'disabled':''}><span>${i+1}</span><div><b>${item.name} · ${money(item.price)}</b><small>${item.bites} ${item.portion}s · ${full?'as duas mãos estão ocupadas':item.price>wallet?(item.price>kept?'não cabe no dinheiro':'o resto é da inscrição'):item.price>s.cash?'sai da carteira':'sai da vaquinha'}</small></div></button>`).join('')}</div>`
   +this.button('closeCafe','Continuar o passeio ({KeyE})');
 }
 // What E does on foot in the paddock, GTA style: the team stand's registration, the Opala's hood,
 // trunk lid or door, Leonardo or the nearest supporter where they are; elsewhere it eats or drinks
 // what is in hand, as during a pit stop, and at the Tia's counter with empty hands opens her menu.
 actionKey(){const v=this.visual;return v.nearDesk()?'desk':v.carAction()?'car':v.nearLeo()?'leo':this.near>=0?'talk':this.cafe.held.length?'eat':v.nearCafe()?'cafe':'talk';}
 // The café's line on the HUD: at the counter, the menu; with something in hand, eating it.
 cafeHint(){const key=this.actionKey();if(key==='cafe')return touchScreen()?'Lanchonete da Tia: toque em Ver cardápio da Tia':keyText('{KeyE}: cardápio da Tia');return key==='eat'&&!touchScreen()?`${keyName('KeyE')}: ${snackVerb(this.cafe)}`:'';}
 // The paddock panel's café part, under the kitty: what is in hand with its button, and the menu at the counter.
 cafeButtons(){
  const c=this.cafe,key=this.actionKey(),e=k=>touchScreen()||key!==k?'':' ({KeyE})';let html='';
  if(c.held.length)html+=`<p class="imm-desk-hint"><b>Na mão:</b> ${snackLabel(c)}</p>`+this.button('eat',capital(snackVerb(c))+e('eat'),false,!!c.using);
  if(this.visual.nearCafe()&&c.held.length<2)html+=this.button('cafe','Ver cardápio da Tia'+e('cafe'),true);
  return html;
 }
 // The Tia greets and serves the pilot walking the paddock (PitStop.update hands this to her).
 cafeGuest(){return this.onFoot()?{hero:this.visual.hero.getWorldPosition(new THREE.Vector3()),snack:this.cafe.snackTime}:null;}
 // Guidance to the registration: the action key by the team stand, else the way there once the kitty is enough.
 deskHint(){
  if(!this.visual.desk)return '';if(this.visual.nearDesk())return touchScreen()?'Entre no círculo amarelo para falar com a equipe 99':keyText('{KeyE}: falar com a equipe 99 · inscrição');
  return this.state.cash+this.state.profile.fund>=this.state.minimum?'Já dá para a inscrição! Na barraca da equipe 99, sobre o muro: suba a escadinha ao lado dela.':'';
 }
 // The team at the computers: the kitty against the costs, with the fuel and the optional
 // windscreen film chosen right here; paying goes straight to the engine start. Back to the
 // supporters for more otherwise. updateDeskCosts follows the slider and the box.
 deskPanel(){
  const s=this.state,cash=s.cash,total=cash+s.profile.fund,ready=total>=s.minimum,litres=Math.min(TANKS.opala,Math.floor((total-s.entry)/COSTS.litre)),least=COSTS.leastLitres,away=s.entry>COSTS.entry;
  const line=s.feedback||(ready?`Fechou! Com ${money(total)} dá a inscrição e até ${litres} litros de gasolina. Quanto vai no tanque?`:`Com ${money(total)} ainda não dá: é ${money(s.entry)} da inscrição e pelo menos ${least} litros de gasolina. Volta lá e pede mais um dindin pra torcida!`);
  const row=(label,value,id)=>`<dt${id?` id="${id}Label"`:''}>${label}</dt><dd${id?` id="${id}"`:''}>${value}</dd>`;
  return `<div class="social-person"><span class="social-avatar">99</span><div><span>CONVERSANDO COM</span><h2>Equipe 99 · computadores</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">“${line}”</div>`
   +`<dl class="imm-budget"><dt class="imm-budget-cash">Na vaquinha</dt><dd class="imm-budget-cash">${money(cash)}</dd><dt class="imm-budget-cash">Na carteira</dt><dd class="imm-budget-cash">${money(s.profile.fund)}</dd>${row(away?'Inscrição · fora de Interlagos':'Inscrição',money(s.entry))}${row(`Gasolina · ${money(COSTS.litre)}/L`,'','deskFuel')}`
   +`<dd class="imm-budget-wide"><input id="immLitres" type="range" min="2" max="${TANKS.opala}" value="${this.prepLitres}" aria-label="Litros de gasolina"></dd>`
   +`<dd class="imm-budget-wide desk-fuel-recommended">Recomendado para este circuito: <b>${recommendedFuel(circuitId(this.data.meta.id),this.storyLaps)} litros</b>.</dd>`
   +`<dt><label class="imm-budget-check"><input id="immFilm" type="checkbox" ${this.prepFilm?'checked':''}> Proteção do para-brisa <small>opcional</small></label></dt><dd id="deskFilm"></dd>`
   +`<dt class="imm-budget-total">Total</dt><dd class="imm-budget-total" id="deskTotal"></dd>${row('','','deskLeft')}</dl>`
   +`<p class="desk-fuel-hint">Burnout e vazamentos gastam mais.${away?' Fora de Interlagos a inscrição inclui a cegonha, as passagens e o hotel da equipe.':''} A vaquinha paga primeiro; o resto sai da carteira.</p>`
   +`<div class="desk-choices">${this.button('buy',touchScreen()?'Pagar e ir →':'Pagar e ir pra partida → (Enter)',true,!ready)}${this.button('leaveDesk',touchScreen()?'Pedir mais dindin':'Voltar e pedir mais dindin ({KeyE})')}</div>`;
 }
 updateDeskCosts(){
  const q=id=>this.panel.querySelector('#'+id);if(!q('deskTotal'))return;
  const s=this.state,cash=s.cash+s.profile.fund,cost=startCost(this.prepLitres,this.prepFilm,s.entry),short=cash<s.minimum?s.minimum-cash:Math.max(0,cost-cash),ok=!short;
  q('deskFuel').textContent=`${this.prepLitres} L · ${money(this.prepLitres*COSTS.litre)}`;q('deskFilm').textContent=this.prepFilm?money(COSTS.film):'—';q('deskTotal').textContent=money(cost);
  q('deskLeftLabel').textContent=ok?'Sobra (vaquinha e carteira)':cash<s.minimum?'Faltam para a inscrição':'Faltam';q('deskLeft').textContent=money(ok?cash-cost:short);
  for(const id of ['deskLeft','deskLeftLabel'])q(id).classList.toggle('imm-budget-short',!ok);
  const b=this.panel.querySelector('[data-action="buy"]');if(b)b.disabled=!ok;
 }
 // The career in the paddock (story-career.js): the wallet, the three morale bars and the challenge.
 careerBlock(){
  const s=this.state,c=s.profile.career;
  return `<div class="career-mini"><div class="career-wallet"><span>Carteira</span><b>${money(s.profile.fund)}</b></div>${MORALE.map(k=>this.moraleBar(k,c.morale[k],c)).join('')}${this.goalBlock()}</div>`;
 }
 // After the divorce (Central #15) the wife's bar is the pension.
 moraleBar(key,value,career=null){if(key==='esposa'&&career?.divorced)return `<div class="career-bar career-divorced" data-key="${key}"><span>${MORALE_NAMES[key]}</span><em>divorciado · pensão ${money(PENSION)}/mês</em></div>`;
  return `<div class="career-bar" data-key="${key}" data-low="${value<=20}"><span>${MORALE_NAMES[key]}</span><i><b style="width:${value}%"></b></i><em>${value}%</em></div>`;}
 // The challenge under way against the wallet, with the races left; after the four, the Blazer.
 goalBlock(){
  const s=this.state,c=s.profile.career,challenge=CHALLENGES[c.challenge],fund=s.profile.fund;
  if(!challenge)return `<div class="imm-dream career-goal"><b>${s.profile.released?'A BLAZER SAIU DA OFICINA!':'SONHO FINAL: TIRAR A BLAZER DA OFICINA'}</b><progress max="${BLAZER_COST}" value="${s.profile.released?BLAZER_COST:Math.min(fund,BLAZER_COST)}"></progress><span>${s.profile.released?'Mecânico pago. Ela voltou para casa.':`${money(fund)} / ${money(BLAZER_COST)}`}</span></div>`;
  const left=Math.max(0,challenge.races-(c.races-c.since));
  return `<div class="imm-dream career-goal"><b>DESAFIO ${challenge.number}: ${challenge.title.toUpperCase()}</b><progress max="${challenge.goal}" value="${Math.min(fund,challenge.goal)}"></progress><span>${percent(fund,challenge.goal)}% de ${money(challenge.goal)} · ${left?`prazo: ${left} corrida${left>1?'s':''}`:'o prazo termina nesta corrida'}</span></div>`;
 }
 blazerDue(){const p=this.state.profile;return p.career.challenge>=CHALLENGES.length&&!p.released;}
 // After the disqualification's photo: the race's report on the panel (a new vaquinha without one).
 afterDisqualified(){if(this.state.afterDisqualified()){this.save();this.sync();this.ui();}else this.start();}
 // The career's card on screen (state.scene): Kléber's lines, the three morale cards after a race,
 // the challenge, the wife's request and its answer, a challenge done or missed, the Blazer, the end.
 scenePanel(){
  const s=this.state,scene=s.scene,card=s.sceneCard(),c=s.profile.career,touch=touchScreen(),name=escapeHtml(this.pilotName||'Stevan');
  const next=(label='Avançar →')=>this.button('scene:next',label+(touch?'':' (Enter)'),true);
  const person=(face,who,kicker,title)=>`<div class="social-person"><span class="social-avatar career-avatar" data-who="${who}">${face}</span><div><span>${kicker}</span><h2>${title}</h2></div><b>◆</b></div>`;
  const challenge=CHALLENGES.find(ch=>ch.id===card.challenge);
  // Kléber's box is played on the scene (story-scene.js): the line as a film subtitle under it.
  if(card.type==='line')return `<div class="cutscene-line" data-who="${card.who}"><span class="cutscene-who">${card.who==='kleber'?'Kléber Eletric':card.who==='lawyer'?'Advogado':name}</span><p>${card.how?`<i>(${card.how})</i>${card.text?' ':''}`:''}${card.text?`“${card.text}”`:''}</p></div><div class="cutscene-buttons">${next()}${scene.kind==='intro'?this.button('scene:skip','Pular a conversa'):''}</div>`;
  if(card.type==='morale'){
   const n=scene.cards.slice(0,scene.at+1).filter(x=>x.type==='morale').length,of=scene.cards.filter(x=>x.type==='morale').length,d=card.delta;
   return `<div class="imm-eyebrow">DEPOIS DA ${card.race}ª CORRIDA · ${OUTCOME_TITLES[card.outcome].toUpperCase()} · QUADRO ${n} DE ${of}</div>${person(MORALE_ICONS[card.key],card.key,MORALE_LABELS[card.key].toUpperCase(),MORALE_NAMES[card.key])}<p class="career-text">${card.text}</p><div class="career-delta" data-sign="${Math.sign(d)}">${MORALE_LABELS[card.key]}: ${d>0?'+':''}${d}%</div>${this.moraleBar(card.key,card.value)}<small>Antes: ${card.before}% · agora: ${card.value}%</small>${card.key==='esposa'?this.wifeWarning(card):''}${next()}`;
  }
  // The team's repair bill (story-career.js repairBill), Stevan's words; a short wallet and what the team let go.
  if(card.type==='repair')return `<div class="imm-eyebrow">DEPOIS DA CORRIDA · DANOS NO CARRO: ${card.damage}%</div><h2 class="career-title">Custos de reparo do carro</h2><p class="career-text">Sua equipe cobrou ${money(card.charged)} para reparar os danos causados ao carro na última corrida.${card.charged<card.bill?` A conta era de ${money(card.bill)}: a carteira não tinha tudo e a equipe perdoou o resto.`:''}</p><p class="career-progress">Valor disponível na carteira: <b>${money(card.fund)}</b></p>${next()}`;
  // The divorce (Central #15): what she took after the lawyer's visit, and the pension before each vaquinha.
  if(card.type==='divorce')return `<div class="imm-eyebrow">DEPOIS DA ${card.race}ª CORRIDA</div><h2 class="career-title career-divorce">DIVÓRCIO</h2><p class="career-text">Sua esposa levou ${money(card.taken)} da sua carteira na divisão de bens.</p><p class="career-progress">Na carteira: <b>${money(card.fund)}</b></p><p>A partir da próxima etapa, ${money(PENSION)} de pensão por mês saem da carteira antes de cada vaquinha. A torcida continua com você.</p>${next()}`;
  if(card.type==='pension'){const months=card.months?card.months.length>1?`${card.months.slice(0,-1).join(', ')} e ${card.months.at(-1)}`:card.months[0]:'o mês desta etapa';
   return `<div class="imm-eyebrow">ANTES DA VAQUINHA · PENSÃO</div><h2 class="career-title">Pensão: ${money(card.amount)}</h2><p class="career-text">${money(PENSION)} por mês: ${months}.</p><p class="career-progress">Na carteira antes: <b>${money(card.before)}</b> · agora: <b>${money(card.fund)}</b></p>${card.charged<card.amount?`<p>A carteira só tinha ${money(card.charged)}: foi tudo para a pensão.</p>`:''}${next('Ir para a vaquinha →')}`;}
  if(card.type==='challenge')return `<div class="imm-eyebrow">${card.fresh?'NOVO DESAFIO':'DESAFIO EM ANDAMENTO'}</div><h2 class="career-title">DESAFIO ${challenge.number}: ${challenge.title.toUpperCase()}</h2><p class="career-deadline">${card.fresh?`PRAZO: ${card.left} CORRIDAS`:`Prazo: falta${card.left>1?'m':''} ${card.left} corrida${card.left>1?'s':''}`}</p><progress max="${challenge.goal}" value="${Math.min(card.fund,challenge.goal)}"></progress><p class="career-progress"><b>${percent(card.fund,challenge.goal)}%</b> de ${money(challenge.goal)} · na carteira: ${money(card.fund)}</p>`
   +(card.fresh?`<p>Você corre com ${challenge.loan}.${scene.kind==='intro'?' Conte piadas para a torcida para pagar a inscrição e a gasolina; os prêmios das corridas vão para a carteira.':''}</p>`:'')+next(scene.at===scene.cards.length-1?'Continuar →':'Avançar →');
  if(card.type==='expense')return `<div class="imm-eyebrow">DESAFIO ${challenge.number} · UM IMPREVISTO EM CASA</div>${person('♥','esposa','SUA ESPOSA',`Precisa de ${money(card.value)}`)}<div class="speech-bubble fan-speech">“${challenge.expense.ask}”</div><p>Na carteira: <b>${money(card.fund)}</b> · ${challenge.own}: ${money(challenge.goal)}</p><div class="social-prompt">Sua decisão</div><div class="social-choices">`
   +[['pay',`Pagar ${challenge.expense.what}`,`Saem ${money(card.value)} da carteira.`],['refuse','Não pagar agora',`Moral com a esposa: ${REFUSED.esposa}%.`]].map(([answer,text,more],i)=>`<button type="button" data-action="scene:${answer}" class="speech-choice"><span>${i+1}</span><div><b>${text}</b><small>${more}</small></div></button>`).join('')
   +`</div><small>Quanto menor a moral com a esposa (agora ${c.morale.esposa}%), mais ela pede.</small>`;
  if(card.type==='answer')return `<div class="imm-eyebrow">DESAFIO ${challenge.number}</div><h2>${card.paid?`Pago: ${challenge.expense.what}.`:'Você não pagou.'}</h2><p>${card.paid?`Saíram ${money(card.value)} da carteira. Ficaram ${money(card.fund)}.`:'Sua esposa ficou chateada.'}</p>${card.paid?'':`<div class="career-delta" data-sign="-1">Moral com a esposa: ${REFUSED.esposa}% (agora ${card.morale}%)</div>`}${next()}`;
  if(card.type==='done')return `<div class="imm-eyebrow">DESAFIO ${challenge.number} CUMPRIDO!</div><h2>Comprou ${challenge.own}!</h2><p>${challenge.done}</p><p>Saíram ${money(challenge.goal)} da carteira; ficaram ${money(card.fund)}.</p>${next()}`;
  if(card.type==='missed')return `<div class="imm-eyebrow">DESAFIO ${challenge.number} · PRAZO ENCERRADO</div><h2>O dinheiro não fechou.</h2><p>${challenge.missed}</p><div class="career-delta" data-sign="-1">Moral com a equipe: ${MISSED.equipe}% · Moral com a torcida: ${MISSED.torcida}%</div><p>Novo prazo: ${card.left} corridas para juntar ${money(challenge.goal)}.</p>${next()}`;
  if(card.type==='dream')return `<div class="imm-eyebrow">${card.fresh?'KIT DE PILOTO COMPLETO':'O SONHO'}</div><h2>${card.released?'A Blazer já está em casa!':'Sonho final: tirar a Blazer da oficina.'}</h2><progress max="${card.goal}" value="${card.released?card.goal:Math.min(card.fund,card.goal)}"></progress><p class="career-progress">${money(card.fund)} de ${money(card.goal)}${card.fund>=card.goal&&!card.released?' · já dá para pagar o mecânico!':''}</p>${next(scene.at===scene.cards.length-1?'Continuar →':'Avançar →')}`;
  return `<div class="imm-eyebrow">FIM DE JOGO</div><h2>${card.reason==='dinheiro'?'Falência.':'A história acabou.'}</h2><p>${GAME_OVER[card.reason]}</p>${MORALE.map(k=>this.moraleBar(k,c.morale[k],c)).join('')}<p>Carteira: ${money(s.profile.fund)} · ${c.races} corrida${c.races===1?'':'s'} na carreira.</p>${this.button('scene:restart','Recomeçar a história do zero →',true)}${this.button('mainMenu','Voltar ao menu principal')}`;
 }
 // The wife's card (Central #15): at 50% or less the warning in Stevan's words and how her patience goes; back above
 // 50% after a fall, the races left for her to forget it; the race she divorced him, someone at the Box 99.
 wifeWarning(card){
  if(card.divorced)return `<div class="career-warning">Ela não aguentou mais. Tem um homem de terno procurando você no Box 99.</div>`;
  const p=card.patience,stage=['Ela ainda tem paciência, mas está de olho.','Ela está perdendo a paciência.','Ela está no limite: mais uma decepção e pode ser o fim.'];
  if(card.value<=50)return `<div class="career-warning">CUIDADO: Moral com a esposa abaixo de 50% pode resultar em divórcio</div>${p?.stage!==undefined?`<p class="career-patience">${stage[p.stage]}</p>`:''}`;
  return p?.chance?`<p class="career-patience career-chance">Ela está te dando uma nova chance: mais ${p.chance} corrida${p.chance>1?'s':''} acima de 50% e ela esquece tudo.</p>`:'';
 }
 restoreStartView(){if(this.startView){this.setView?.(this.startView);this.startView=null;}}
 // The overhead switch bank in the real cockpit (cockpit-instruments.js): during the start the
 // IGN lever follows the switch and the PART dome sinks while the starter turns, and a ring
 // pulses round the next one to use; racing: IGN on (settle snaps it there).
 startSwitches(dt,settle=false){
  const s=this.state;let sw=this.switches;
  if(!sw?.ign){const ign=this.carRoot.getObjectByName('Interruptor_IGN'),part=this.carRoot.getObjectByName('Botao_PART');sw=this.switches=ign&&part?{ign,part,partZ:part.position.z}:null;}
  if(!sw)return;
  const starting=!settle&&this.active&&s.phase==='starting',k=settle?1:Math.min(1,dt*28);
  sw.ign.rotation.x+=((starting&&!s.ignOn?-1:1)*SWITCH_TILT-sw.ign.rotation.x)*k;
  sw.part.position.z+=(sw.partZ-(starting&&s.crank>0?.003:0)-sw.part.position.z)*k;
  if(!this.startRing){
   const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.strokeStyle='#ffd23d';g.shadowColor='#ffb800';g.shadowBlur=16;g.lineWidth=9;g.beginPath();g.arc(64,64,44,0,Math.PI*2);g.stroke();
   const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;this.startRing=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,transparent:true}));this.startRing.renderOrder=95;this.visual.root.add(this.startRing);
  }
  const next=starting&&this.getView?.()==='cockpit'?(!s.ignOn?sw.ign:s.crank>0?null:sw.part):null;this.startRing.visible=!!next;
  if(next){next.getWorldPosition(this.startRing.position);const pulse=1+.18*Math.sin(performance.now()/160);this.startRing.scale.setScalar(.042*pulse);this.startRing.material.opacity=.65+.35*Math.sin(performance.now()/160);}
 }
 // The IGN switch or the PART button under a pointer (screen px), from the cockpit view.
 switchAt(x,y){
  const sw=this.switches;if(!sw||!this.camera||this.getView?.()!=='cockpit')return null;const rect=document.getElementById('view').getBoundingClientRect();
  for(const [name,obj] of [['ign',sw.ign],['part',sw.part]]){const p=obj.getWorldPosition(new THREE.Vector3()).project(this.camera);if(p.z<1&&Math.hypot(rect.left+(p.x+1)/2*rect.width-x,rect.top+(1-p.y)/2*rect.height-y)<Math.max(26,rect.width*.022))return name;}
  return null;
 }
 // Starter held from a pointer (the PART button on screen or in the cockpit) until it is let go.
 holdStarter(pointer){if(this.active&&this.state.phase==='starting'){this.state.starter=true;this.crankPointer=pointer;}}
 releaseStarter(pointer){if(this.crankPointer!==undefined&&this.crankPointer!==null&&(pointer===undefined||pointer===this.crankPointer)){this.state.starter=false;this.crankPointer=null;}}
 // Hora de acordar o Opala: the steps (IGN, PARTIDA, throttle), the throttle dial with its
 // bands and three meters (catching, flooding, battery); updateStartPanel moves them each frame.
 startPanel(){
  const touch=touchScreen(),key=k=>touch?'':`<kbd>${keyName(k)}</kbd>`;
  return `<div class="imm-eyebrow">SEM AFOGAR!</div><h2>Hora de acordar o Opala.</h2>`
   +`<ol class="start-steps"><li data-step="ign">${key('KeyL')}<span>Ligue o <b>IGN</b> no painel de cima</span></li><li data-step="part">${key('KeyI')}<span>Segure a <b>PARTIDA</b></span></li><li data-step="gas">${key('KeyW')}<span>${touch?'ACELERAR':'Acelerador'} <b>no ponto</b></span></li></ol>`
   +`<div class="start-gauge">${START_DIAL}<div class="start-readout"><b id="startZone"></b><span id="startPct"></span></div></div>`
   +`<div class="start-meters"><span>Pegando<i><b id="startCatch"></b></i></span><span>Afogamento<i><b id="startFlood"></b></i></span><span>Bateria<i><b id="startBattery"></b></i></span></div>`
   +`<div class="start-buttons"><button type="button" data-action="ign" class="start-ign${this.state.ignOn?' on':''}"><span class="start-led"></span>IGN <b>${this.state.ignOn?'ON':'OFF'}</b></button><button type="button" data-hold="crank" class="start-crank">PARTIDA <small>segure</small></button></div><p class="start-tip" id="startTip" role="status"></p>`;
 }
 updateStartPanel(){
  const s=this.state,q=id=>this.panel.querySelector('#'+id),needle=q('startNeedle');if(!needle)return;
  const p=s.pressure,zone=p<START.low?0:p<=START.high?1:p<=START.flood?2:3,cranking=s.crank>0,pumping=!cranking&&p>(this.lastPressure??p)+1e-4;this.lastPressure=p;
  needle.setAttribute('transform',`rotate(${((p-.5)*180).toFixed(1)} 110 112)`);this.panel.querySelector('.start-dial').dataset.zone=zone;
  q('startZone').textContent=['BAIXO','NO PONTO','ALTO','AFOGANDO'][zone];q('startZone').dataset.zone=zone;q('startPct').textContent=Math.round(p*100)+'% do acelerador';
  q('startCatch').style.width=`${Math.min(100,(s.ignitionGood||0)/s.catchTime()*100)}%`;q('startFlood').style.width=`${Math.min(100,s.flood*100)}%`;q('startBattery').style.width=`${s.battery*100}%`;
  q('startFlood').parentElement.parentElement.classList.toggle('warn',s.flood>.5);q('startBattery').parentElement.parentElement.classList.toggle('warn',s.battery<.3);
  const done={ign:s.ignOn,part:cranking,gas:cranking&&zone===1},current=!s.ignOn?'ign':!cranking?'part':'gas';
  for(const li of this.panel.querySelectorAll('[data-step]')){li.classList.toggle('done',done[li.dataset.step]);li.classList.toggle('now',li.dataset.step===current);}
  this.panel.querySelector('.start-crank')?.classList.toggle('pressed',cranking);
  // Pumping the pedal between tries only soaks the plugs; wet plugs want little throttle to dry.
  const touch=touchScreen(),wet=s.flood>.5,tip=pumping?'Pisando sem dar partida você só molha a vela!'
   :!s.ignOn?(cranking?'Sem IGN o motor gira, mas não pega! Ligue o IGN.':`Primeiro o painel de cima: IGN em ON (${touch?'toque no IGN':`${keyName('KeyL')}, ou clique no interruptor`}).`)
   :!cranking?(wet?'Vela molhada: dê partida com pouco acelerador para secar.':`Agora segure a PARTIDA (${touch?'botão PARTIDA':keyName('KeyI')}) e dose o acelerador na faixa verde.`)
   :(s.battery<.3?'Bateria arriando! ':'')+(wet&&zone<2?'Vela molhada: segura no ponto que ela seca…':['Falta acelerador: dê toques.','No ponto! Segura assim…','Alto demais: alivia um pouco.','AFOGANDO! Tira o pé do acelerador!'][zone]);
  q('startTip').textContent=tip;q('startTip').dataset.zone=pumping?3:cranking&&s.ignOn?zone:'';
 }
 leaveCar(place=true){
  if(!this.inCar)return false;this.inCar=this.visual.inCar=false;if(place)this.visual.leaveCar(this.walkGround);
  this.resetVehicle();this.setView?.(this.viewBefore??'chase');this.state.emitSound('click');return true;
 }
 // Captures the mouse for the walk (the browser needs a key or click just before). Not
 // during a conversation, whose jokes are clicked, nor after Tab freed it.
 captureMouse(){
  const view=document.getElementById('view');
  const walking=this.state.phase==='crowd'&&this.state.fan===null&&!this.state.desk&&!this.state.leo&&!this.state.cafe&&!this.state.scene,podium=this.state.phase==='podium'&&this.podiumCamera;
  if(!this.active||!(walking||podium)||this.mouseFree||touchScreen()||!view?.requestPointerLock||document.pointerLockElement===view||navigator.userActivation?.isActive===false)return;
  this.footLock=true;this.lockFor=this.state.phase;try{view.requestPointerLock()?.catch?.(()=>{this.footLock=false;});}catch{this.footLock=false;}
 }
 save(){try{localStorage.setItem(STORY_PROFILE_KEY,JSON.stringify(this.state.profile));}catch{}}
 // laps (the player's setting, main.js) is taken at each start: storyLaps for the story,
 // freeTotalLaps (resetField) for the free race. Both burn at the circuit's scale (fuel.js): the
 // story's tank holds what the pilot bought at the desk, the free race starts with what it needs.
 start(){this.freeCountdown=0;this.goTime=0;this.car.condition?.reset();this.finishElapsed=null;this.finishTime=null;this.freeOrder=null;this.recordAssisted=false;this.resetVehicle();this.inCar=this.visual.inCar=false;this.storyLaps=this.laps;this.state.entry=entryFor(circuitId(this.data.meta.id));this.state.round=this.storyRound??null;this.state.start();this.state.fuelScale=fuelScale(circuitId(this.data.meta.id),this.data.meta.reconstructed_xy_m);this.visual.reset();this.near=-1;this.walkToFan=this.walkToDesk=this.walkToCafe=null;this.walkToLeo=false;this.cafe=snackState();this.leoAsked=false;this.deskInside=false;this.projectile=null;this.raceProgress=0;this.previousS=this.car.surface.s;this.field.reset(this.car.surface.s,{grid:true});this.parts.reset();this.rivals=this.field.rivals;this.debrisTimer=6;this.contactCooldown=0;this.sync();this.save();}
 disable(){if(this.lastPhase==='starting'){this.restoreStartView();this.startSwitches(1,true);}document.body.classList.remove('start-scene');this.finishElapsed=null;this.state.disable();this.visual.restoreCamera();this.visual.root.visible=this.visual.damage.visible=false;this.carRoot.visible=true;this.panel.classList.add('hidden');this.hud.classList.add('hidden');document.getElementById('dqScreen').classList.add('hidden');document.body.classList.remove('disqualified-scene','podium-scene','tow-scene','story-cutscene','story-paddock');document.body.classList.remove('immersive-mode','immersive-stage');this.brand.innerHTML=this.baseBrand;this.controls.innerHTML=this.baseControls;document.title=this.baseTitle;this.lastPhase='off';}
 sync(){
  const s=this.state;if(s.phase===this.lastPhase)return;const previous=this.lastPhase;this.lastPhase=s.phase;this.lastUI='';
  // The engine start is played in the cockpit.
  if(s.phase==='starting'){this.startView=this.getView?.()??'chase';this.setView?.('cockpit');this.switches=null;}
  // The engine caught: on to the grid in the player's own camera (the view before the start otherwise).
  else if(previous==='starting'){if(s.phase==='grid'&&this.playerView){this.startView=null;this.setView?.(this.playerView());}else this.restoreStartView();this.startSwitches(1,true);this.state.starter=false;}
  document.body.classList.toggle('start-scene',s.phase==='starting');
  // With a classification the sheet comes first (it needs the cursor); its Continue frees the podium camera.
  this.podiumCamera=s.phase==='podium'&&!this.freeOrder;
  document.body.classList.toggle('immersive-mode',s.active);document.body.classList.toggle('immersive-stage',['crowd','podium'].includes(s.phase));
  this.brand.innerHTML='AUTO-POBRE RACING<span>STEVAN GAIPO · VERSÃO IMERSIVA</span>';document.title='Auto-Pobre Racing com Stevan Gaipo';
  this.controls.innerHTML=this.baseControls.replace('reposicionar','chamar reboque');
  if(this.blockingUI())this.releaseMouse();
  // On foot the walk takes the mouse at once; the podium takes it on its sheet's Continue, a click on the scene or a key.
  if(s.phase==='crowd'||s.phase==='podium')this.mouseFree=false;
  if(s.phase==='crowd')this.captureMouse();
  if(s.phase!=='crowd')this.leaveCar(false);
  if(['crowd','starting','broken','snag','podium'].includes(s.phase))this.stop();
  if(s.phase==='podium')this.visual.dressPodium(this.freeOrder,this.pilotName);
  if(s.phase==='starting'){this.resetVehicle();this.field.reset(this.car.surface.s,{grid:true});this.rivals=this.field.rivals;}
  if(s.phase==='grid'){this.resetVehicle();this.previousS=this.car.surface.s;}
  if(s.phase==='broken')this.towOrigin=this.car.surface.s;
  if(s.phase==='inspection'){
   this.resetVehicle();this.placeCar(trackPoint(this.data,35,-2));this.stop();
  }
  document.body.classList.toggle('tow-scene',['tow','broken','snag'].includes(s.phase));document.body.classList.toggle('podium-scene',s.phase==='podium');document.body.classList.toggle('disqualified-scene',s.phase==='disqualified');if(['podium','complete','disqualified'].includes(s.phase))this.save();
 }
 stop(){this.car.vx=this.car.vy=this.car.yaw=0;this.car.burnout=this.car.rearSlipSpeed=0;}
 placeCar(p){const c=this.car;c.x=p.x;c.y=-p.z;c.heading=p.heading;c.index=p.index;c.surface=c.sample(c.x,c.y);c.settle?.();}
 action(action){
  const s=this.state;
  if(action==='mainMenu'){this.onMainMenu?.();return;}
  if(action==='talk'&&this.near>=0){this.selectedJoke=null;s.talk(this.near);}
  if(action.startsWith('joke:')&&s.phase==='crowd'&&s.fan!==null){const fan=s.fan,cash=s.cash;s.joke(Number(action.split(':')[1]));if(s.cash>cash){this.visual.showDonation(fan,s.cash-cash);s.fan=null;s.feedback='';this.walkToFan=null;s.touch();}}
  if(action==='close'){s.fan=null;s.feedback='';s.touch();}
  // The fuel starts at the pilot's last choice (6 L at first), lowered to what the kitty pays for.
  if(action==='desk'&&s.fan===null&&!this.inCar&&s.openDesk()){this.walkToFan=this.walkToDesk=this.walkToCafe=null;this.visual.faceDesk();this.prepLitres=clamp(Math.min(this.fuelChoice,Math.floor((s.cash+s.profile.fund-s.entry-(this.prepFilm?COSTS.film:0))/COSTS.litre)),2,TANKS.opala);}
  if(action==='leaveDesk')s.closeDesk();
  // Leonardo's coffee: asked when the pilot walks up (step) or with the action key by him.
  if(action==='leo'&&!this.inCar&&s.offerCoffee()){this.walkToFan=this.walkToDesk=this.walkToCafe=null;this.walkToLeo=false;this.leoAsked=true;}
  // His cup goes into a free hand, to be drunk like the Tia's (E).
  if(action==='leo:yes'&&this.cafe.held.length<2&&s.answerCoffee(true))giveSnack(this.cafe,'cafe');
  if(action==='leo:no')s.answerCoffee(false);
  if(action==='leo:close')s.closeCoffee();
  // The Tia's café: her menu at the counter, a snack bought from it, a sip or a bite of what is in hand.
  if(action==='cafe'&&!this.inCar&&this.visual.nearCafe()&&s.openCafe()){this.walkToFan=this.walkToDesk=this.walkToCafe=null;this.walkToLeo=false;this.cafe.feedback='';this.visual.faceCafe();}
  if(action==='closeCafe')s.closeCafe();
  if(action.startsWith('snack:')&&s.cafe&&this.visual.nearCafe()){buySnack(this.cafe,action.slice(6),{pay:price=>{const paid=s.pay(price);if(paid)this.save();return paid;},emit:name=>s.emitSound(name),touch:touchScreen()});s.touch();}
  if(action==='eat'&&s.phase==='crowd'&&!this.inCar&&useSnack(this.cafe))s.touch();
  if(action==='car'&&s.phase==='crowd'&&s.fan===null&&!this.inCar){const spot=this.visual.carAction();if(spot==='porta'){if(this.enterCar())this.captureMouse();}else if(spot)this.visual.toggleOwnOpening(spot);}
  // The career's cards: the next one, Kléber's lines skipped, the wife's request answered, a new story.
  if(action==='scene:next')s.advanceScene();
  if(action==='scene:skip')s.advanceScene(true);
  if(action==='scene:pay'||action==='scene:refuse')s.answerScene(action==='scene:pay');
  if(action==='scene:restart'){s.restartCareer();this.save();if(this.onNewStory)this.onNewStory();else this.start();return;}
  if(action.startsWith('scene:')){this.save();if(s.phase==='crowd'&&!s.scene)this.captureMouse();}
  if(action==='buy'&&s.buy(this.prepLitres,this.prepFilm))this.save();
  if(action==='ign')s.switchIgnition();
  if(action==='untangle')s.untangle();
  if(action==='afterPodium')s.leavePodium();
  if(action==='inspect')s.requestInspection();
  if(action==='box')s.goToBox();
  if(action==='again'){this.start();return;}
  if(action==='blazer'){s.releaseBlazer();this.save();}
  if(action==='normal'){this.disable();this.onNormal();return;}
  this.sync();this.ui();
 }
 handleKey(code){
  if(this.finishing&&code==='KeyR')return true;
  if(!this.active)return false;
  const s=this.state;
  if(code==='KeyR'){s.fail('Volta abandonada: pediu reboque');this.sync();return true;}
  // The career's cards: Enter, Space or E is Avançar; at the wife's request, 1 pays and 2 refuses.
  if(s.scene&&['crowd','complete'].includes(s.phase)){
   const card=s.sceneCard()?.type;
   if(['Enter','NumpadEnter','Space','KeyE'].includes(code)){if(!['expense','over'].includes(card))this.action('scene:next');return true;}
   if(card==='expense'&&['Digit1','Digit2'].includes(code)){this.action(code==='Digit1'?'scene:pay':'scene:refuse');return true;}
  }
  if(s.phase==='crowd'){
   // Keys on foot: Space jumps, C crouches, Tab frees the mouse (and takes it back); at
   // the team's desk Enter goes to the track. Any other key takes the mouse for the camera.
   let used=false;const free=s.fan===null&&!s.desk&&!s.leo&&!s.cafe&&!s.scene;
   if(code==='KeyF'&&free&&(this.inCar?this.leaveCar():this.visual.nearCar()&&this.enterCar())){this.captureMouse();return true;}
   if(this.inCar)return false;
   // E is the action key, GTA style (actionKey): it ends a conversation or the Tia's menu, or does
   // what the place calls for.
   if(code==='KeyE'){this.action(s.leo?(s.leo==='ask'?'leo:no':'leo:close'):s.desk?'leaveDesk':s.cafe?'closeCafe':s.fan!==null?'close':this.actionKey());used=true;}
   else if(['Digit1','Digit2','Digit3'].includes(code)&&s.fan!==null){this.action('joke:'+(Number(code.at(-1))-1));used=true;}
   else if(['Digit1','Digit2'].includes(code)&&s.leo==='ask'){this.action(code==='Digit1'?'leo:yes':'leo:no');used=true;}
   else if(['Digit1','Digit2','Digit3'].includes(code)&&s.cafe){this.action('snack:'+CAFE_MENU[Number(code.at(-1))-1].id);used=true;}
   else if(code==='Tab'){this.mouseFree=!!document.pointerLockElement;if(this.mouseFree)document.exitPointerLock();else this.captureMouse();return true;}
   else if(free&&code==='Space'){this.visual.jump();used=true;}
   else if(free&&code==='KeyC'){this.visual.crouch();used=true;}
   else if(s.desk&&['Enter','NumpadEnter'].includes(code)){this.action('buy');return true;}
   if(!['Escape','KeyP','KeyM'].includes(code))this.captureMouse();
   if(used)return true;
  }
  if(s.phase==='podium'){
   // Space, E (the action key) or Enter: Continuar, also while the mouse turns the photo camera.
   if(this.podiumCamera&&['Space','KeyE','Enter','NumpadEnter'].includes(code)){this.action('afterPodium');return true;}
   if(code==='Tab'){this.mouseFree=!!document.pointerLockElement;if(this.mouseFree)document.exitPointerLock();else this.captureMouse();return true;}
   if(!['Escape','KeyP','KeyM','Enter','NumpadEnter'].includes(code))this.captureMouse();
  }
  // The start: L flips the IGN switch; I is held for the starter (input.ignition).
  if(s.phase==='starting'&&code==='KeyL'){this.action('ign');return true;}
  if(s.phase==='starting'&&code==='KeyI')return true;
  return false;
 }
 beginCountdown(){this.freeCountdown=3;this.goTime=0;this.stop();this.state.emitSound('countdown');}
 // Input along a walking route (local points; a tap on someone or the registration circle): points
 // within `reach` are dropped (all but the last with keepLast) and the pilot heads for the next one;
 // null once none is left.
 follow(route,reach,keepLast){
  const hero=this.visual.hero.position;while(route.length>(keepLast?1:0)&&Math.hypot(route[0].x-hero.x,route[0].z-hero.z)<reach)route.shift();
  const target=route[0];return target?this.visual.toward(Math.atan2(-(target.z-hero.z),target.x-hero.x),touchScreen()):null;
 }
 step(input,dt){
  const s=this.state,c=this.car;this.goTime=Math.max(0,(this.goTime||0)-dt);
  if(!s.active&&this.freeCountdown>0){this.stop();const before=Math.ceil(this.freeCountdown);this.freeCountdown=Math.max(0,this.freeCountdown-dt);if(this.freeCountdown===0){this.goTime=.85;s.emitSound('raceGo');this.onGo?.();}else if(Math.ceil(this.freeCountdown)<before)s.emitSound('countdown');return true;}
  if(this.finishing){this.stepFinish(input,dt);return true;}if(!s.active)return false;
  if(s.phase==='crowd'&&this.inCar)this.near=-1;
  else if(s.phase==='crowd'){
   // A click on a supporter (or the registration circle) walks the pilot there (any key
   // takes over); while talking he stands.
   const free=s.fan===null&&!s.desk&&!s.leo&&!s.cafe&&!s.scene,steering=input.throttle||input.brake||input.left||input.right;let walking=free?input:still;
   if(free&&this.walkToLeo){if(steering)this.walkToLeo=false;else walking=this.follow(this.walkToLeo,.6,true);}
   if(free&&this.walkToFan!==null&&this.walkToFan!==undefined){
    if(steering)this.walkToFan=null;
    else{const hero=this.visual.hero.position,target=this.visual.fans[this.walkToFan].pos;if(Math.hypot(target.x-hero.x,target.z-hero.z)<2.4){s.talk(this.walkToFan);this.walkToFan=null;walking=still;}else walking=this.follow(this.fanRoute??[target.clone()],.6,true);}
   }
   if(free&&this.walkToDesk?.length){
    if(steering)this.walkToDesk=null;
    else{walking=this.follow(this.walkToDesk,.3,false);if(!walking){this.walkToDesk=null;walking=still;}}
   }
   // Sent to the café (its sign): at the counter the Tia's menu opens.
   if(free&&this.walkToCafe?.length){
    if(steering)this.walkToCafe=null;
    else if(this.visual.nearCafe(2.4)){this.walkToCafe=null;walking=still;this.action('cafe');}
    else walking=this.follow(this.walkToCafe,.3,true);
   }
   if(this.visual.walk(walking,dt,{shift:!!this.shift,touch:touchScreen(),ground:this.walkGround,arms:snackArms(this.cafe)}))s.emitSound('footstep');
   stepSnack(this.cafe,dt,name=>s.emitSound(name));snackHead(this.cafe,this.visual.hero,dt);
   // Stepping into the circle at the team stand opens the registration (once per visit).
   const atDesk=this.visual.atDesk();if(atDesk&&!this.deskInside&&s.fan===null&&!s.leo&&!s.cafe&&!s.scene)this.action('desk');this.deskInside=atDesk;
   // Leonardo Martins comes over with his offer the first time the pilot walks up to him.
   if(s.fan===null&&!s.desk&&!s.leo&&!s.cafe&&(!this.leoAsked||this.walkToLeo)&&this.visual.nearLeo(this.walkToLeo?2.4:2.6))this.action('leo');
   // A conversation frees the mouse for the jokes; closing it takes the mouse back.
   if((s.fan!==null||s.desk||s.leo||s.cafe||s.scene)&&this.footLock&&document.pointerLockElement)document.exitPointerLock();
   this.near=this.visual.nearestFan();}
  else if(s.phase==='starting')s.startEngine(input,dt);
  else if(s.phase==='grid'){const before=Math.ceil(s.countdown);s.countdown-=dt;if(s.countdown<=0){s.startRace();this.goTime=.85;this.onGo?.();}else if(Math.ceil(s.countdown)<before)s.emitSound('countdown');}
  else if(s.phase==='race'){
   const before=Math.hypot(c.vx,c.vy);c.step(input,dt);const speed=Math.hypot(c.vx,c.vy),L=this.data.meta.reconstructed_xy_m,impact=Math.max(c.wallImpactSpeed??0,c.crashImpactSpeed??0,before-speed);if(impact>4)this.wallImpact(impact);
   this.raceProgress=Math.max(0,this.raceProgress+lapTravel(this.previousS,c.surface.s,L));this.previousS=c.surface.s;
   this.contacts(this.field.step(c,dt,this.storyLaps));
   s.position=1+this.rivals.filter(r=>r.progress>this.raceProgress).length;
   s.raceStep({speed,throttle:input.throttle,wheelspin:c.rearSlipSpeed,offTrack:c.surface.pit?0:Math.max(0,Math.abs(c.surface.d)-c.surface.width/2),collision:impact>4,finished:false,position:s.position},dt);
   if(s.phase==='race'&&c.laps>=this.storyLaps)this.beginFinish(s.position);
   if(!this.finishing)this.hazards(dt);
  }else if(s.phase==='broken'){s.rescueWait-=dt;if(s.rescueWait<=0)s.beginTow();}
  else if(s.phase==='tow'){
   s.towStep(input,dt);const p=trackPoint(this.data,this.towOrigin+s.towDistance+9-4.67-s.towGap);this.placeCar(p);
   c.vx=Math.cos(c.heading)*s.towSpeed;c.vy=Math.sin(c.heading)*s.towSpeed;c.steer=c.steerVisual=(input.left-input.right)*.2;c.spin+=s.towSpeed*dt/.31595;c.rearSpin=c.spin;c.clock+=dt;
  }else if(s.phase==='disqualified'){s.disqualifiedTime-=dt;if(s.disqualifiedTime<=0){this.afterDisqualified();return true;}}else if(s.phase==='inspection'){
   if(s.judging){this.stop();s.inspectionStep(dt);}else{c.step(input,dt);if((c.surface.s<250||c.surface.s>this.data.meta.reconstructed_xy_m-120)&&c.surface.d>c.surface.width/2+.8)s.goToBox();}
  }
  this.sync();return true;
 }
 stepPit(dt){
  this.car.clock+=dt;this.contacts(this.field.step(this.car,dt,this.active?this.storyLaps:this.freeTotalLaps));
  if(this.active){this.state.raceTime+=dt;this.state.position=1+this.rivals.filter(r=>r.progress>this.raceProgress).length;this.state.alertTime=Math.max(0,this.state.alertTime-dt);}
  else this.freePosition=1+this.rivals.filter(r=>r.progress>this.freePlayerProgress).length;
 }
 damageAt(speed,point){const c=this.car,dx=point[0]-c.x,dy=point[1]-c.y;c.condition?.impact(speed,dx*Math.cos(c.heading)+dy*Math.sin(c.heading),-dx*Math.sin(c.heading)+dy*Math.cos(c.heading),this.active?this.state.damageScale():1);}
 hazards(dt){
  const s=this.state,c=this.car;if(s.phase!=='race'){this.projectile=null;return;}
  this.contactCooldown-=dt;this.debrisTimer-=dt;
  for(const rival of this.rivals){
   if(rival.finished)continue;const p={x:rival.car.x,y:rival.car.surface.z,z:-rival.car.y,heading:rival.car.heading},dx=p.x-c.x,dy=-p.z-c.y,forward=dx*Math.cos(c.heading)+dy*Math.sin(c.heading),side=-dx*Math.sin(c.heading)+dy*Math.cos(c.heading);
   // (Never from a car on the viaduct overhead or the street below: physics.js sameLevel.)
   if(!this.projectile&&this.debrisTimer<=0&&forward>7&&forward<34&&Math.abs(side)<2.1&&Math.hypot(c.vx,c.vy)>9&&sameLevel(c,rival.car)){
    s.emitSound('debrisFly',{pan:clamp(side/3,-1,1)});this.projectile={age:0,duration:1.25,start:new THREE.Vector3(p.x-Math.cos(p.heading)*2,p.y+.8,p.z+Math.sin(p.heading)*2),end:new THREE.Vector3(c.x+c.vx*1.25+Math.cos(c.heading)*.45,c.surface.z+1.1,-c.y-c.vy*1.25-Math.sin(c.heading)*.45)};
    s.warn('Peça voando do carro da frente! Mude de linha.');this.debrisTimer=8+Math.random()*5;
   }
  }
  if(this.projectile){this.projectile.age+=dt;if(this.projectile.age>=this.projectile.duration){const target=this.projectile.end,fx=c.x+Math.cos(c.heading)*.45,fy=-c.y-Math.sin(c.heading)*.45;if(Math.hypot(target.x-fx,target.z-fy)<1.35)s.hitDebris();else s.emitSound('debrisMiss');this.projectile=null;}}
 }
 // lineup: the rivals of the next free race, taken here like laps (null: the whole field; [] a solo
 // practice, which has no flag and burns no fuel; [number] a 1x1). freeLineup: the race under way's.
 resetField(){this.freeCountdown=0;this.goTime=0;this.recordAssisted=false;this.finishElapsed=null;this.finishTime=null;this.finishBest=null;this.freeOrder=null;this.freeLineup=this.lineup;this.freeTotalLaps=this.practice?Infinity:this.laps;this.freeFuel=Math.min(this.tank,recommendedFuel(circuitId(this.data.meta.id),this.freeTotalLaps));this.freeBurn=freeBurn(this.data,this.freeTotalLaps);this.freeFinished=false;this.freePlayerProgress=0;this.freeLastS=this.car.surface.s;this.field.reset(this.car.surface.s,{grid:!!this.car.awaitingStart,entrants:this.freeLineup});this.rivals=this.field.rivals;this.freePosition=this.fieldSize;this.parts.reset();}
 get practice(){return !this.active&&this.freeLineup?.length===0;}
 // What the race under way needs in the tank (fuel.js); the Box 99's Completar fills back to it.
 get fuelTarget(){return Math.min(this.tank,recommendedFuel(circuitId(this.data.meta.id),this.active?this.storyLaps:this.freeTotalLaps));}
 // Cars racing: the whole grid in the story; the free race's may be short (practice, 1x1).
 get fieldSize(){return this.rivals.length+1;}
 // Race times reach the record boards only from the whole grid: a practice or a 1x1 starts at the front.
 get fullGrid(){return this.active||!this.freeLineup;}
 wallImpact(speed){const c=this.car,side=Math.sign(c.surface.d);this.knock=Math.max(this.knock??0,speed);this.damageAt(speed,[c.x+c.surface.lx*side,c.y+c.surface.ly*side]);this.parts.burst({speed,point:[this.car.x+Math.cos(this.car.heading)*2,this.car.y+Math.sin(this.car.heading)*2]},this.car);}
 // The hardest knock on the player's car (m/s, a wall or a rival) since main.js last took it: the
 // controller's rumble, in the story's race as in Modo Corrida.
 takeKnock(){const knock=this.knock??0;this.knock=0;return knock;}
 contacts(hits){for(const hit of hits){if(hit.player){this.damageAt(hit.speed,hit.point);this.knock=Math.max(this.knock??0,hit.speed);}this.parts.burst(hit,this.car);if(hit.player&&this.active)this.state.hitCar(Math.min(1.5,hit.speed/10));else{const dx=hit.point[0]-this.car.x,dy=hit.point[1]-this.car.y,d=Math.hypot(dx,dy);if(d<65)this.state.emitSound('collision',{strength:Math.min(1.5,hit.speed/10)*(1-d/65),pan:clamp((-dx*Math.sin(this.car.heading)+dy*Math.cos(this.car.heading))/Math.max(1,d),-1,1)});}}}
 stepFree(dt,input={}){if(this.freeFinished)return;const previous=this.freeFuel;this.freeFuel=Math.max(0,this.freeFuel-dt*(burnRate(Math.hypot(this.car.vx,this.car.vy),input.throttle||0,this.car.rearSlipSpeed||0)*this.freeBurn+(this.car.condition?.factors.leak??0)));if(previous>=1&&this.freeFuel<1)this.state.emitSound('reserve');if(previous>0&&this.freeFuel===0)this.state.emitSound('fuelEmpty');this.contacts(this.field.step(this.car,dt,this.freeTotalLaps));
  const L=this.data.meta.reconstructed_xy_m;this.freePlayerProgress+=lapTravel(this.freeLastS??0,this.car.surface.s,L);this.freeLastS=this.car.surface.s;
  const progress=Math.min(this.freePlayerProgress,this.car.laps*L+this.car.surface.s+this.field.gridLeadIn);
  this.freePosition=1+this.rivals.filter(r=>r.progress>progress).length;
  if(this.car.laps>=this.freeTotalLaps&&!this.freeFinished){this.freeFinished=true;this.freePosition=1+this.rivals.filter(r=>r.finished).length;this.beginFinish(this.freePosition);}
 }
 // listener: the car the sound is heard from (a rival watched in the recon lap hears the
 // player's car among the others).
 audioScene(listener=this.car){const s=this.state,c=listener;return {phase:s.active?s.phase:this.freeResultReady?'free-finish':'free',starter:s.phase==='starting'&&s.crank>0,pressure:s.pressure,crank:s.crank,battery:s.battery,truckSpeed:s.phase==='tow'?s.truckSpeed:0,towGap:s.towGap,tankDetached:s.active&&s.tankDetached,fuel:s.fuel,won:s.active?s.result?.position===1&&s.result?.status!=='Desclassificado':this.freeFinished&&this.freePosition===1,driving:!s.active?!this.freeResultReady:s.phase==='race',rivals:!s.active||['starting','grid','race'].includes(s.phase)?[...this.rivals.filter(r=>!r.finished&&r.car!==c),...(c===this.car?[]:[{car:this.car,progress:0}])].map(r=>{const p={x:r.car.x,z:-r.car.y},dx=p.x-c.x,dy=-p.z-c.y,distance=Math.hypot(dx,dy);return {distance,speed:['starting','grid'].includes(s.phase)?10+6*Math.sin(this.visual.time*3+r.progress):Math.hypot(r.car.vx,r.car.vy),pan:clamp((-dx*Math.sin(c.heading)+dy*Math.cos(c.heading))/Math.max(1,distance),-1,1),rpm:r.car.rpm,throttle:r.input?.throttle,ref:r.car};}).sort((a,b)=>a.distance-b.distance).slice(0,2):[]};}
 // A rival's engine and tyres as heard from its own car: its driver's last input and its tyres' slide.
 rivalSound(car){const i=this.rivals.findIndex(r=>r.car===car);return {command:this.rivals[i]?.input??{},skid:(this.rivalTrails[i]?.wheels.reduce((sum,w)=>sum+w.strength,0)??0)/4};}
 audioCommand(input){if(this.finishing)return {...input,throttle:0,reverse:0,handbrake:0,engineOff:false};return this.active?{...input,throttle:['race','grid'].includes(this.state.phase)?input.throttle:0,engineOff:!['race','grid','inspection'].includes(this.state.phase)||!!this.state.reason}:{...input,engineOff:this.freeFuel<=0};}
 update(dt,camera){this.camera=camera;this.parts.update(dt,this.car);if(!this.active){this.visual.storyScene?.sync(null);this.visual.updateFree(this.rivals,dt);return;}this.sync();this.visual.storyScene?.sync(this.state.sceneCard());this.visual.update(this.state,this.car,dt,this.rivals,this.projectile,this.towOrigin);if(this.state.phase==='crowd')showSnacks(this.snackHands,this.visual.hero,this.cafe);this.visual.camera(camera,this.state,dt);if(this.state.phase==='starting')this.startSwitches(dt);this.ui();this.positionDialogue();}
 button(action,label,primary=false,disabled=false){return `<button type="button" data-action="${action}" ${disabled?'disabled':''} class="${primary?'imm-primary':''}">${label}</button>`;}
 ui(){
  const s=this.state;if(!s.active)return;const talking=s.phase==='crowd'&&(s.fan!==null||s.desk||!!s.leo||!!s.cafe);this.panel.classList.toggle('social-dialogue',talking);this.panel.classList.toggle('desk-dialogue',s.phase==='crowd'&&s.desk);this.panel.classList.toggle('leo-dialogue',s.phase==='crowd'&&!!s.leo);this.panel.classList.toggle('cafe-dialogue',s.phase==='crowd'&&!!s.cafe);this.panel.classList.toggle('start-panel',s.phase==='starting');const cutscene=s.sceneCard()?.type==='line';this.panel.classList.toggle('career-scene',!!s.scene&&!cutscene);this.panel.classList.toggle('career-cutscene',cutscene);document.body.classList.toggle('story-cutscene',cutscene);document.body.classList.toggle('story-paddock',s.phase==='crowd'&&!cutscene);this.panel.classList.toggle('social-explore',s.phase==='crowd'&&!talking&&!s.scene);if(s.phase!=='crowd'||s.fan===null&&!s.leo){this.panel.style.removeProperty('left');this.panel.style.removeProperty('top');this.panel.style.removeProperty('bottom');}this.hud.classList.remove('hidden');
  const names={crowd:'VAQUINHA',starting:'PARTIDA',grid:'LARGADA',race:`${this.storyLaps} VOLTA${this.storyLaps>1?'S':''}`,broken:'SOCORRO',tow:'REBOQUE',snag:'FITA ENROSCADA',inspection:'PÓS-CORRIDA',podium:'SEXTO, SEMPRE',complete:'ATÉ A PRÓXIMA',disqualified:'A FOTO FICOU'};
  document.getElementById('dqScreen').classList.toggle('hidden',s.phase!=='disqualified');document.getElementById('dqCountdown').textContent='Nova vaquinha em '+Math.max(1,Math.ceil(s.disqualifiedTime))+' s';
  document.getElementById('immPhase').textContent=names[s.phase];document.getElementById('immFuel').textContent=s.fuel.toFixed(1)+' L';document.getElementById('immHealth').textContent=Math.ceil(s.health*100)+'%';document.getElementById('immGlass').textContent=Math.round((1-s.glass)*100)+'%';document.getElementById('immPosition').textContent=s.phase==='podium'?'6º no pódio':s.position+'º / '+GRID_SIZE;
  document.getElementById('immAlert').textContent=s.phase==='podium'?(touchScreen()?'Arraste na cena para girar a câmera pelo pódio.':keyText('Câmera livre: clique na cena e o mouse olha em volta · roda aproxima · {KeyW} {KeyA} {KeyS} {KeyD} passeia · {Space} ou {KeyE} continua · Tab solta o mouse')):s.phase==='crowd'?(this.inCar?keyText('{KeyF}: sair do Opala · o mouse olha em volta'):talking||s.scene?'':this.carHint()||this.cafeHint()||this.deskHint()):s.phase==='race'?(s.alertTime>0?s.alert:s.tankDetached?'Tanque solto · combustível vazando':s.fuel<1?'Reserva! A gasolina está acabando.':'Guarde distância: o carro da frente pode soltar peças.'):s.phase==='tow'?(s.towGap<3?'FREIE · FITA FROUXA':'Controle o freio quando o caminhão diminuir.'):'';
  const spot=s.phase==='crowd'?this.visual.carAction():null,nearDesk=s.phase==='crowd'&&this.visual.nearDesk(),cafe=s.phase==='crowd'?[this.actionKey(),this.visual.nearCafe(),snackLabel(this.cafe),!!this.cafe.using,this.cafe.feedback].join('/'):'',key=[s.phase,s.revision,playerKeys.revision,this.near,s.fan,s.desk,s.leo,s.cafe,nearDesk,spot,spot&&this.visual.ownOpen(spot),cafe].join(':');
  if(key!==this.lastUI){this.lastUI=key;let body='';
   if(s.phase==='crowd'){
    if(s.fan!==null){const fan=FANS[s.fan];body=`<div class="social-person"><span class="social-avatar">${fan.name[0]}</span><div><span>CONVERSANDO COM</span><h2>${fan.name}</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">${s.feedback||'“'+fan.hint+'”'}</div><div class="social-prompt">Escolha sua fala</div><div class="imm-jokes social-choices">${JOKES.map((j,i)=>`<button type="button" data-action="joke:${i}" class="speech-choice"><span>${i+1}</span><div><b>${['Família e boletos','Vida de oficina','Perrengues de piloto'][i]}</b><small>${j.text}</small></div></button>`).join('')}</div><div class="social-help">Clique em uma fala para contar a piada.</div>${this.button('close','Encerrar conversa ({KeyE})')}`;}
    else if(s.desk)body=this.deskPanel();
    else if(s.leo)body=this.leoPanel();
    else if(s.cafe)body=this.cafePanel();
    else body=`<div class="imm-eyebrow">ANTES DA CORRIDA</div><h2>Patrocínio? Só na risada.</h2><p>${touchScreen()?'Caminhe pelos boxes até a torcida. Toque em uma pessoa para conversar. Depois, toque na piada que quer contar.':'Ande à vontade pelos boxes, pela garagem do 99 e pela lanchonete da Tia (café e quitutes, pagos da vaquinha). Chegue perto de um torcedor e aperte {KeyE} para conversar; depois clique na piada (ou {Digit1}, {Digit2}, {Digit3}).'}</p><strong class="imm-cash">${money(s.cash)}</strong>${this.cafeButtons()}${this.careerBlock()}<p>Inscrição${s.entry>COSTS.entry?' fora de Interlagos':''}: ${money(s.entry)} · gasolina: ${money(COSTS.litre)}/L · para largar: pelo menos ${money(s.minimum)}, da vaquinha e da carteira.</p><p class="imm-desk-hint"><b>Inscrição com a equipe 99</b> nos computadores da barraca sobre o muro dos boxes: suba a escadinha ao lado dela e entre no círculo amarelo${touchScreen()?' (ou toque nele e o piloto vai sozinho)':''}.</p><p class="imm-controls">${touchScreen()?'Toque no torcedor · toque na fala para enviar · toque na placa da Tia para ir à lanchonete':'{KeyW} {KeyA} {KeyS} {KeyD} anda · mouse gira a câmera · {ShiftLeft} corre · {Space} pula · {KeyC} agacha · {KeyE} ação (conversar; na barraca: inscrição; no balcão da Tia: cardápio; com algo na mão: comer ou beber; no Opala: capô na frente, porta-malas atrás, porta para entrar) · {KeyF} entra no Opala · Tab solta o mouse'}</p>${spot?this.button('car',CAR_ACTIONS[spot](this.visual.ownOpen(spot))+(touchScreen()?'':' ({KeyE})')):nearDesk?this.button('desk','Falar com a equipe 99 · inscrição'+(touchScreen()?'':' ({KeyE})'),true):this.button('talk',this.near<0?'Aproxime-se de um torcedor ou do Opala':'Conversar com '+FANS[this.near].name+(touchScreen()?'':' ({KeyE})'),false,this.near<0)}`;
   }
   if(s.phase==='starting')body=this.startPanel();
   if(s.phase==='grid')body='';
   if(s.phase==='broken')body=`<div class="imm-eyebrow">DEU RUIM</div><h2>${s.reason}</h2><p>O reboque está chegando. Durante o resgate, <b>{KeyS}</b> controla o freio. Não deixe a fita frouxa entrar debaixo da roda dianteira.</p>`;
   if(s.phase==='tow')body='<div class="imm-eyebrow">REBOQUE</div><h2>Olho na fita!</h2><p>A fita tem 5 m e não recolhe sozinha. Quando o caminhão diminuir, freie com <b>{KeyS}</b>.</p><meter id="immTowGap" min="0" max="5" low="2.2" optimum="5"></meter><p id="immTowText"></p>';
   if(s.phase==='snag')body=`<div class="imm-eyebrow">A FITA ENTROU NA RODA</div><h2>Mais R$ 25 na conta.</h2><p>O carro avançou sobre a fita frouxa e ela enroscou na dianteira. O socorrista vai soltar; no próximo trecho, controle o freio com <b>{KeyS}</b>.</p>${this.button('untangle','Desenroscar e continuar',true)}`;
   if(s.phase==='inspection')body=`<div class="imm-eyebrow">${s.result?.position===1?'VENCEU NA PISTA!':'FIM DA PARTICIPAÇÃO'}</div><h2>Depois da foto.</h2><p>O movimento continua no paddock. O juiz está por perto e o pessoal já espera nos boxes.</p>${s.judging?'<progress id="immInspection" max="8" value="0"></progress><p>O juiz está conferindo o carro…</p>':this.button('inspect','Parar e aguardar a vistoria',true)+this.button('box','Levar o carro ao box')}`;
   if(['podium','complete'].includes(s.phase))body=`<div class="imm-eyebrow">AUTO-POBRE RACING · PÓDIO OFICIAL DA ZOEIRA</div><h2>Sexto. Sempre sexto.</h2><p>Na pista: <b>${s.result?.position?s.result.position+'º lugar':s.result?.status}</b><br>Situação: ${s.result?.status}${s.inspected?' · vistoriado':''}<br>Na foto do pódio: <b>6º lugar</b></p><p>${s.reason||'A corrida acabou. Os boletos continuam.'}</p><p>Prêmio: <b>${money(s.prize)}</b>${s.snagCost?` · fita do guincho: −${money(s.snagCost)}`:''}${s.repair?.charged?` · conserto do carro: −${money(s.repair.charged)}`:''}</p><p>Sobra da vaquinha guardada: <b>${money(s.savedCash)}</b><br>Carteira: <b>${money(s.profile.fund)}</b></p>${this.goalBlock()}${s.phase==='complete'&&this.blazerDue()?this.button('blazer','Pagar o mecânico e buscar a Blazer',true,s.profile.fund<BLAZER_COST):''}${s.phase==='podium'?this.button('afterPodium','Continuar →',true):this.button('again','Próxima etapa, nova vaquinha →',true)+this.button('normal','Voltar à sessão livre')}`;
   if(['podium','complete'].includes(s.phase))body+=this.button('mainMenu','Voltar ao menu principal');
   // The career's cards cover the paddock's panel and the summary after the race.
   if(s.scene&&['crowd','complete'].includes(s.phase))body=this.scenePanel();
   if(document.body.classList.contains('touch-device'))body=body.replaceAll('Clique','Toque').replaceAll('clique','toque').replaceAll('<b>{KeyW}</b>','<b>ACELERAR</b>').replaceAll('<b>{KeyS}</b>','<b>FREAR</b>').replaceAll('<b>{KeyI}</b>','<b>Dar partida</b>').replaceAll(' ({KeyE})','').replaceAll(' ({KeyI})','');
   body=keyText(body);
   this.panel.innerHTML=body;this.panel.classList.toggle('hidden',!body);this.updateDeskCosts();
  }
  if(s.phase==='starting')this.updateStartPanel();

  if(s.phase==='tow'){this.panel.querySelector('#immTowGap').value=s.towGap;this.panel.querySelector('#immTowText').textContent=`Folga útil: ${s.towGap.toFixed(1)} m · resgate ${Math.min(100,Math.floor(s.towDistance/105*100))}%`;}
  if(s.phase==='inspection'&&s.judging)this.panel.querySelector('#immInspection').value=s.inspection;
 }
 info(){return {...this.state.info(),snacks:this.cafe.held.map(h=>[h.id,h.bites]),eating:!!this.cafe.using,nearCafe:this.visual.nearCafe(),freeFuel:this.freeFuel,freeTotalLaps:this.freeTotalLaps,storyLaps:this.storyLaps,laps:this.laps,freeFinished:this.freeFinished,finishing:this.finishing,finishElapsed:this.finishElapsed,finishTime:this.finishTime,freeResultReady:this.freeResultReady,freePosition:this.freePosition,nearFan:this.near,atDesk:this.visual.atDesk(),hero:this.visual.hero.position.toArray(),rivals:this.rivals.map(({car,...r})=>({...r,x:car.x,y:car.y})),field:this.field.info(),parts:this.parts.info(),projectile:!!this.projectile};}
}
