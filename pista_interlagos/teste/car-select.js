import * as THREE from 'three';
import {rosterOf,carEntry,MODEL_NAMES,CAR_MODELS,CAR_MODEL_DEFAULT,PLAYER_CAR_DEFAULT,cssColor as css} from './race-roster.js';
import {carWorkshop} from './immersive-visuals.js';
import {fuscaCar,fuscaDispose} from './fusca.js';
import {setCarEnvironment} from './car-finish.js';
import {compileInSlices} from './cinematic.js';
import {createGarage,garageLights,G} from './car-garage.js';
// Modo Corrida's car screen (#cars, between the opening and the track screen): two tabs, the Opala and the
// Fusca (fusca.js), each with its grid's 15 cars (the Opala's Old Stock field, the Fusca's Copa Fusca one,
// race-roster.js). The chosen one turns on a turntable in the middle of the team's garage (car-garage.js), the arrows
// on its sides (and ← →) bring the grid's other cars in turn. The studio is drawn by the game's own renderer on the
// page's canvas, which shows through the screen's open middle (carros.css); the car is the race model, painted as the
// rivals are (ImmersiveVisuals.rivalCar, fuscaCar), so it is what races.
function gradient(stops,size=256,radial=false){
 const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),g=radial?ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2):ctx.createLinearGradient(0,0,0,size);
 for(const [at,color] of stops)g.addColorStop(at,color);ctx.fillStyle=g;ctx.fillRect(0,0,size,size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// The studio: the team's garage (car-garage.js) round a turntable, its own lights and the room baked into an
// environment map for the paint. The car turns on its own (slower up close); dragging the stage turns it by hand
// for a while and tilts the camera from near the floor (the tyres' lettering) to almost overhead (the roof). The
// wheel, a pinch, the +/− buttons and keys zoom towards what is under the pointer (zoom: 1 = the whole car framed in
// the stage): the camera closes in to VIEW.near from that point, then the lens narrows (VIEW.lens) so it never
// goes through the car as it turns.
const VIEW=Object.freeze({fov:34,azimuth:.62,elevation:.2,tilt:[-.25,1.35],height:.62+G.deck,near:1.7,lens:2.2,out:.8,ceiling:6,floor:.3,clear:.35});
// The floor's mirror by the Gráficos tab's car reflections: the room drawn twice, so computers' Alto and Ultra only.
const FLOOR_MIRROR=Object.freeze({ceu:false,pista:false,dinamico:true,dinamico_hd:true});
// The studio's look on the screen (the race's cinematic.js draws linear, untoned): set, and what undoes it.
function screenLook(renderer){
 const saved=[renderer.toneMapping,renderer.toneMappingExposure,renderer.outputColorSpace];
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;
 return ()=>{[renderer.toneMapping,renderer.toneMappingExposure,renderer.outputColorSpace]=saved;};
}
class Studio {
 constructor(carRoot){
  this.workshop=carWorkshop(carRoot);this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(VIEW.fov,1,.05,120);
  // world: everything but the background, turned upside down for the floor's mirror (render).
  this.scene.background=new THREE.Color(0x0c0e10);this.garage=null;this.world=new THREE.Group();this.scene.add(this.world);garageLights(this.world);
  this.turntable=new THREE.Group();this.turntable.position.y=G.deck;this.world.add(this.turntable);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(5.6,2.5).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:gradient([[0,'rgba(0,0,0,.85)'],[.6,'rgba(0,0,0,.45)'],[1,'rgba(0,0,0,0)']],128,true),transparent:true,depthWrite:false}));
  shadow.position.y=.004;this.turntable.add(shadow);
  // wanted/shown: 'model:number' of the car asked for and of the one on the turntable; next: the one being prepared
  // (build); template: the Opala's model, fusca the Fusca's.
  // zoom, elevation and offset (the point looked at, from the car's middle) ease towards their ...To; box: the car
  // shown, in the turntable's frame (what the pointer can aim at, what the camera keeps clear of).
  // still: the turntable held (the screen's Parar de girar box); the car still turns by hand.
  this.still=false;this.yaw=-.55;this.handUntil=0;this.time=0;this.car=null;this.shown=null;this.wanted=null;this.next=null;this.template=null;this.fusca=null;this.environment=null;
  this.zoom=this.zoomTo=1;this.zoomMax=2;this.elevation=this.elevationTo=VIEW.elevation;this.offset=new THREE.Vector3();this.offsetTo=new THREE.Vector3();
  this.box=new THREE.Box3(new THREE.Vector3(-2.4,0,-.95),new THREE.Vector3(2.4,1.45,.95));this.view=null;this.lens=1;this.distance=0;
 }
 // The garage is built the first time the screen draws (the story never shows it) and its lights baked into the
 // map the paint reflects.
 setup(renderer){
  this.garage=createGarage();this.world.add(this.garage.root);this.turntable.add(this.garage.deck);
  this.environment=this.garage.bake(renderer);this.scene.environment=this.environment;
 }
 // Throws away a car made here, the one shown unless told (what was made for it; the race car's own parts stay).
 drop(car=this.car,template=this.template){if(!car)return;car.removeFromParent();if(car.userData.own)fuscaDispose(car);else this.workshop.disposeCar(car,template);if(car===this.car){this.car=null;this.shown=null;}}
 ready(model){return !!(model==='fusca'?this.fusca:this.template);}
 // The car asked for is made hidden on the turntable while its programs (the garage's too, the first time) are
 // built in the background, a few at a time (prepare): the page keeps answering and the car shown stays until the
 // new one takes its place. Drawn at once, the first visit froze the page for seconds. stale: the model it was
 // made from was replaced meanwhile (setTemplate, setFusca), so it is thrown away instead.
 build(renderer){
  const wanted=this.wanted,[model,number]=wanted.split(':'),entry=carEntry(number,model);if(!this.ready(model)||!entry)return;
  const template=this.template,car=model==='fusca'?fuscaCar(this.fusca,entry):this.workshop.rivalCar(template,entry.color,entry.number,'',{stripe:entry.stripe,finish:entry.finish,livery99:entry.number==='99'});
  car.visible=false;this.turntable.add(car);const next=this.next={car,template,stale:false};
  this.prepare(renderer).then(()=>{
   if(this.next===next)this.next=null;if(next.stale){this.drop(car,template);return;}
   this.drop();this.car=car;car.visible=true;this.shown=wanted;this.garage.show(entry,model);
   const yaw=this.turntable.rotation.y;this.turntable.rotation.y=0;this.turntable.updateMatrixWorld(true);
   this.box.setFromObject(car).translate(this.turntable.position.clone().negate());this.turntable.rotation.y=yaw;this.turntable.updateMatrixWorld(true);
  });
 }
 // The programs of everything in the studio as the screen draws it (ACES, sRGB: the renderer's own output colours
 // go in every program's key).
 prepare(renderer){return compileInSlices(renderer,this.scene,this.camera,()=>null,()=>screenLook(renderer)).catch(err=>console.warn(err));}
 // rect: where the stage shows on the page (CSS pixels); the car is framed there. reflections: the Gráficos
 // tab's car reflections, which set the floor's. False while there is no car to show yet.
 render(renderer,dt,rect,reflections){
  const {clamp,degToRad,radToDeg}=THREE.MathUtils,ease=1-Math.exp(-dt*9),mirror=FLOOR_MIRROR[reflections]??false;
  // The cars share their materials with the race's (car-finish.js): here they reflect the garage, not the
  // circuit's map (the race takes its own back at its next frame, car-reflections.js).
  if(!this.garage)this.setup(renderer);setCarEnvironment(this.environment,'estudio');
  if(this.wanted!==this.shown&&!this.next)this.build(renderer);
  if(!this.car)return false;
  this.time+=dt;this.zoom+=(this.zoomTo-this.zoom)*ease;if(!this.still&&this.time>this.handUntil)this.yaw+=dt*.32/Math.pow(Math.max(1,this.zoom),.6);this.turntable.rotation.y=this.yaw;
  this.garage.update(dt);
  const size=renderer.getSize(new THREE.Vector2()),W=size.x,H=size.y,c=this.camera,half=Math.tan(degToRad(VIEW.fov/2));
  // Far enough for the car (about 5 m seen three-quarters on, 1.6 m high) to fill most of the stage, clear of the arrows on its sides.
  const d=clamp(Math.max(5*H/(2*half*.76*Math.max(1,rect.width)),1.7*H/(2*half*.66*Math.max(1,rect.height))),4.3,40);
  this.zoomMax=Math.max(1,d/VIEW.near)*VIEW.lens;this.zoomTo=clamp(this.zoomTo,VIEW.out,this.zoomMax);
  const want=d/this.zoom;let dist=Math.max(VIEW.near,want);this.lens=dist/want;
  this.offset.lerp(this.offsetTo,ease);const target=this.offset.clone();target.y+=VIEW.height;
  // Never under the floor nor through the ceiling's lights.
  const tilt=[Math.max(VIEW.tilt[0],Math.asin(clamp((VIEW.floor-target.y)/dist,-1,1))),Math.min(VIEW.tilt[1],Math.asin(clamp((VIEW.ceiling-target.y)/dist,-1,1)))];
  this.elevationTo=clamp(this.elevationTo,...tilt);this.elevation=clamp(this.elevation+(this.elevationTo-this.elevation)*ease,...tilt);
  const el=this.elevation,az=VIEW.azimuth,dir=new THREE.Vector3(Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az));
  // The camera stays out of the circle the turning car sweeps (narrowing to nothing just over the roof): farther
  // back along its line.
  const sweep=Math.hypot(Math.max(-this.box.min.x,this.box.max.x),Math.max(-this.box.min.z,this.box.max.z))+VIEW.clear,roof=this.box.max.y+G.deck,a=dir.x*dir.x+dir.z*dir.z;
  for(let i=0;i<2&&a>1e-4;i++){const r=sweep*clamp((roof+.3-target.y-dir.y*dist)/.6,0,1);if(!r)break;
   const b=2*(target.x*dir.x+target.z*dir.z),k=target.x*target.x+target.z*target.z-r*r,disc=b*b-4*a*k;if(disc>0)dist=Math.max(dist,(-b+Math.sqrt(disc))/(2*a));}
  this.distance=dist;c.position.copy(target).addScaledVector(dir,dist);c.lookAt(target);c.fov=radToDeg(2*Math.atan(half/this.lens));
  c.aspect=W/H;c.setViewOffset(W,H,W/2-(rect.left+rect.width/2),H/2-(rect.top+rect.height*.5),W,H);c.updateProjectionMatrix();c.updateMatrixWorld();
  this.view=renderer.domElement.getBoundingClientRect();
  // The mirror: the room upside down first (no floor), then the room over it, the floor letting part of it through
  // (a colour background clears the screen whatever autoClear says: only the first picture has it).
  const saved={target:renderer.getRenderTarget(),autoClear:renderer.autoClear},undo=screenLook(renderer),floor=this.garage.floor,background=this.scene.background;
  renderer.setRenderTarget(null);renderer.autoClear=true;this.garage.mirror(mirror);
  if(mirror){this.world.scale.y=-1;floor.visible=false;renderer.render(this.scene,c);this.world.scale.y=1;floor.visible=true;renderer.autoClear=false;renderer.clearDepth();this.scene.background=null;}
  renderer.render(this.scene,c);this.scene.background=background;
  undo();renderer.setRenderTarget(saved.target);renderer.autoClear=saved.autoClear;
  return true;
 }
 // A drag: sideways turns the car (and holds its own turn a while), up and down tilts the camera.
 turn(dx,dy=0){this.yaw+=dx*.009;this.elevationTo+=dy*.006;this.handUntil=this.time+2.5;}
 // Where the pointer (page pixels) meets the car's box, in the scene; null off the car.
 pick(x,y){
  if(!this.view||!this.car)return null;const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x-this.view.left)/this.view.width*2-1,1-(y-this.view.top)/this.view.height*2),this.camera);
  const local=ray.ray.clone().applyMatrix4(this.turntable.matrixWorld.clone().invert()),hit=local.intersectBox(this.box,new THREE.Vector3());
  return hit&&hit.applyMatrix4(this.turntable.matrixWorld);
 }
 // Closer (factor > 1) towards what is under the pointer (x, y), or back out towards the car's middle.
 zoomAt(factor,x,y){
  const before=this.zoomTo,after=THREE.MathUtils.clamp(before*factor,VIEW.out,this.zoomMax);if(after===before)return;
  if(after>before){const hit=x===undefined?null:this.pick(x,y);if(hit){hit.y-=VIEW.height;this.offsetTo.lerp(hit,1-before/after);}}
  else this.offsetTo.multiplyScalar(after<=1?0:(after-1)/(before-1));
  this.zoomTo=after;
 }
 // Double click or tap: up close to that spot, or back to the whole car seen as at first.
 toggleZoom(x,y){if(this.zoomTo>1.05){this.zoomTo=1;this.offsetTo.set(0,0,0);this.elevationTo=VIEW.elevation;}else this.zoomAt(2.5/this.zoomTo,x,y);}
}
// root: the #cars screen. values: the chosen car's number in each model's field ({opala, fusca}); model: the tab
// shown ('opala' or 'fusca'). onPick(number, model), onModel(model) (main.js then loads the Fusca's model:
// setFusca), onNext(), onBack(); still and onStill(still): the Parar de girar box, kept by main.js; quality() gives the Gráficos tab's car reflections (the garage floor's follow them).
// In a multiplayer room (setRoom) the arrows pass over the cars other pilots have (the note says whose they are),
// and everyone races the Opala (the tabs hide).
export class CarSelect {
 constructor({root,values={},model=CAR_MODEL_DEFAULT,carRoot,onPick,onModel,onNext,onBack,still=false,onStill,quality=()=>'pista'}){
  this.root=root;this.model=CAR_MODELS.includes(model)?model:CAR_MODEL_DEFAULT;
  this.values=Object.fromEntries(CAR_MODELS.map(m=>[m,carEntry(values[m],m)?values[m]:PLAYER_CAR_DEFAULT]));this.onPick=onPick;this.onModel=onModel;this.quality=quality;this.studio=new Studio(carRoot);this.live=false;
  this.room=null;this.taken=new Map();this.asked=null;this.guest=null;this.failure=null;this.tell('');
  const $=id=>root.querySelector('#'+id);this.stage=$('carStage');this.status=$('carStageStatus');this.tabs=$('carModels');this.note=root.querySelector('.car-note');
  for(const tab of this.tabs.querySelectorAll('[data-model]'))tab.onclick=()=>this.setModel(tab.dataset.model);
  this.tabs.addEventListener('keydown',e=>{const step={ArrowLeft:-1,ArrowRight:1}[e.key];if(!step)return;e.preventDefault();
   const next=CAR_MODELS[(CAR_MODELS.indexOf(this.model)+step+CAR_MODELS.length)%CAR_MODELS.length];this.setModel(next);this.tabs.querySelector(`[data-model="${next}"]`).focus();});
  const box=$('carStill');box.checked=this.studio.still=!!still;box.onchange=()=>{this.studio.still=box.checked;onStill?.(box.checked);};
  $('carLeft').onclick=()=>this.step(-1);$('carRight').onclick=()=>this.step(1);
  $('carsNext').onclick=()=>onNext();$('carsBack').onclick=()=>onBack();
  // Dragging the stage turns the car and tilts the view; two fingers pinch closer or farther, as the mouse wheel does,
  // towards what is under them; the +/− buttons and keys zoom on the stage's middle; a double click or tap goes up
  // close to that spot and back.
  const held=new Map(),spread=()=>{const [a,b]=[...held.values()];return Math.hypot(a.x-b.x,a.y-b.y);},middle=()=>{const [a,b]=[...held.values()];return [(a.x+b.x)/2,(a.y+b.y)/2];};let pinch=0;
  this.stage.addEventListener('pointerdown',e=>{if(e.target.closest('button,label'))return;held.set(e.pointerId,{x:e.clientX,y:e.clientY});this.stage.setPointerCapture(e.pointerId);this.stage.classList.add('dragging');pinch=held.size===2?spread():0;});
  this.stage.addEventListener('pointermove',e=>{const p=held.get(e.pointerId);if(!p)return;if(held.size===1)this.studio.turn(e.clientX-p.x,e.clientY-p.y);p.x=e.clientX;p.y=e.clientY;
   if(held.size===2){const now=spread();if(pinch>0&&now>0)this.studio.zoomAt(now/pinch,...middle());pinch=now;}});
  const end=e=>{if(!held.delete(e.pointerId))return;pinch=held.size===2?spread():0;if(!held.size)this.stage.classList.remove('dragging');};
  this.stage.addEventListener('pointerup',end);this.stage.addEventListener('pointercancel',end);
  this.stage.addEventListener('wheel',e=>{e.preventDefault();this.studio.zoomAt(Math.exp(-e.deltaY*({1:16,2:400}[e.deltaMode]??1)*.0015),e.clientX,e.clientY);},{passive:false});
  this.stage.addEventListener('dblclick',e=>{if(!e.target.closest('button,label'))this.studio.toggleZoom(e.clientX,e.clientY);});
  const onStage=factor=>{const r=this.stage.getBoundingClientRect();this.studio.zoomAt(factor,r.left+r.width/2,r.top+r.height/2);};
  $('carZoomIn').onclick=()=>onStage(1.4);$('carZoomOut').onclick=()=>onStage(1/1.4);
  // Anywhere while this screen shows (dialogs and fields keep their keys): ← and → the previous and next car (the
  // tabs keep theirs for the model), + and − zoom, Enter goes on to the tracks when no button has it.
  document.addEventListener('keydown',e=>{
   if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||root.classList.contains('hidden')||e.target.closest?.('input,select,textarea,dialog'))return;
   const f={'+':1.25,'=':1.25,'-':.8,'_':.8}[e.key],step={ArrowLeft:-1,ArrowRight:1}[e.key];
   if(f){e.preventDefault();onStage(f);}
   else if(step&&!e.target.closest?.('[role=tablist]')){e.preventDefault();this.step(step);}
   else if(e.key==='Enter'&&!e.target.closest?.('button,a')){e.preventDefault();onNext();}
  });
  this.show();
 }
 // The car chosen in the tab shown.
 get value(){return this.values[this.model];}
 set value(number){this.values[this.model]=number;}
 // The grid's previous (-1) or next (1) car, round from the last to the first, past the cars other pilots have in a
 // room (null: every other car is taken).
 neighbour(dir){
  const choices=rosterOf(this.model).choices,n=choices.length,cur=Math.max(0,choices.findIndex(c=>c.number===this.value));
  for(let k=1;k<n;k++){const next=choices[((cur+dir*k)%n+n)%n];if(!this.taken.has(next.number))return next;}
  return null;
 }
 step(dir){const next=this.neighbour(dir);if(next)this.pick(next.number);}
 pick(number){
  if(!carEntry(number,this.model))return;
  if(this.taken.has(number)){this.tell(`O #${number} está com ${this.taken.get(number)}. Escolha outro carro.`,number);this.show();return;}
  this.tell('');this.value=number;this.show();this.onPick?.(number,this.model);
 }
 // The tabs: the Opala or the Fusca, each with its own field and its own car chosen.
 setModel(model,{silent=false}={}){
  if(!CAR_MODELS.includes(model)||model===this.model)return;
  this.model=model;this.show();if(!silent)this.onModel?.(model);
 }
 // The Fusca's model arrived (main.js loads it when its tab is chosen).
 setFusca(template){const s=this.studio;if(s.fusca===template)return;if(s.car?.userData.own)s.drop();if(s.next?.car.userData.own)s.next.stale=true;s.fusca=template;this.show();}
 // The room's note; one about a car someone else has goes when that car changes hands (setRoom).
 tell(text,car=null){this.notice=text;this.noticeCar=car;this.noticeHolder=car&&this.taken.get(car);}
 // A multiplayer room (multiplayer.js, through main.js): taken, the cars other pilots have (number ->
 // name); mine, this window's car once the host has answered its last choice (the room's word wins:
 // the car asked for may have gone to someone else first); asking, the car still being asked for;
 // guest, for a pilot who does not host: whether the host has let it in and whether it waits for the
 // start (its button then waits for the host's race instead of leading to the tracks).
 setRoom({taken,mine,asking,guest=null}){
  this.room??=this.note;this.taken=taken;this.guest=guest;this.tabs.hidden=true;this.setModel('opala',{silent:true});
  if(this.noticeCar&&taken.get(this.noticeCar)!==this.noticeHolder)this.tell('');
  if(this.asked&&!asking&&mine&&mine!==this.asked)this.tell(`O #${this.asked} já estava com outro piloto: você segue no #${mine}.`,this.asked);
  this.asked=asking;
  if(mine&&mine!==this.value)this.value=mine;
  this.show();
 }
 // The model arrived (main.js loads it for the screen): the studio can build the car.
 setTemplate(template){const s=this.studio;if(!s.car?.userData.own)s.drop();if(s.next&&!s.next.car.userData.own)s.next.stale=true;s.template=template;this.show();}
 failed(model='opala'){this.failure=model;if(model!==this.model)return;this.status.textContent=`Não foi possível carregar o ${MODEL_NAMES[model]}. A escolha vale mesmo assim.`;this.status.hidden=false;}
 show(){
  // own: the Opala 99, the Auto-Pobre Racing's; the Fusca 99 is Cristiano Canto's.
  const fusca=this.model==='fusca',entry=carEntry(this.value,this.model),$=id=>this.root.querySelector('#'+id),own=entry.number==='99'&&!fusca,name=MODEL_NAMES[this.model];
  this.studio.wanted=`${this.model}:${entry.number}`;
  for(const tab of this.tabs.querySelectorAll('[data-model]')){const on=tab.dataset.model===this.model;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}
  $('carsTitle').textContent=`Com qual ${name} você vai correr?`;$('carsMode').textContent=this.drift?`ARENA DE DRIFT · ${fusca?'FUSCA':'OPALA'} COM ACERTO DE DRIFT`:fusca?'MODO CORRIDA · COPA FUSCA':'MODO CORRIDA · OLD STOCK RACE';
  // Where the car is in its grid, and on each arrow the car it brings (hidden when there is no other to bring).
  const choices=rosterOf(this.model).choices;$('carsKicker').textContent=`${fusca?'COPA FUSCA':'O GRID'} · ${choices.findIndex(c=>c.number===entry.number)+1} DE ${choices.length}`;
  for(const [id,dir,word] of [['carLeft',-1,'Anterior'],['carRight',1,'Próximo']]){const b=$(id),to=this.neighbour(dir);b.hidden=!to;if(to){b.title=`${word}: #${to.number} · ${to.shortName}`;b.setAttribute('aria-label',b.title);}}
  $('carNumber').textContent='#'+entry.number;$('carNumber').style.setProperty('--body',css(entry.color));$('carNumber').style.setProperty('--stripe',css(entry.stripe));
  // The car's driver in big letters (the screen's only list of names), then the car and the season.
  $('carDriver').textContent=entry.name;
  $('carName').textContent=own?`${name} 99 · Auto-Pobre Racing`:fusca?`${name} ${entry.number} · ${entry.category}`:`${name} ${entry.number}`;
  $('carDetail').textContent=fusca?`${entry.points} pts na classe em 2026 · ${entry.rank}º do top 15 da Copa Fusca. Você corre no lugar dele${entry.number==='99'?'':'; o Cristiano vai de Fusca 99'}.`
   :own?`O carro do Stevan Gaipo e do Edu Neves, da vaquinha ao grid. ${entry.rank}º no campeonato (${entry.points} pts).`
   :`${entry.rank?`${entry.rank}º no campeonato (${entry.points} pts). `:''}Você corre no lugar dele${this.room?'':'; o Stevan Gaipo vai de Opala 99'}.`;
  // Only in a room the note shows: how the cars are shared and whose they are, and what became of the last choice.
  this.note.hidden=!this.room;
  const held=[...this.taken].map(([number,holder])=>`#${number} com ${holder}`).join(', ');
  if(this.room)this.room.textContent=this.notice||(this.asked?`Pedindo o #${this.asked} ao anfitrião… Vale a partir da próxima largada.`:
   `${this.guest?'Escolha o carro e clique em Aguardar início da corrida: o anfitrião escolhe a pista e dá a largada. ':''}Na sala, cada piloto corre com o carro que escolher, se ninguém estiver com ele; os outros carros correm com a IA. O anfitrião larga em último.${held?` Já escolhidos: ${held}.`:''}`);
  // The way on, big as the track screen's Corrida única: the tracks, with the car taken;
  // for a guest, the host's race (once let in: waiting for it, or not).
  const next=$('carsNext'),g=this.guest;
  if(this.room){next.disabled=!!g&&!g.admitted;if(g)next.setAttribute('aria-pressed',String(g.admitted&&g.waiting));else next.removeAttribute('aria-pressed');}
  const label=!g?(this.drift?'Entrar na arena →':'Escolher a pista →'):!g.admitted?'Esperando o anfitrião aceitar você…':g.waiting?'Aguardando o início da corrida':'Aguardar início da corrida →';
  const hint=!g?(this.drift?`Com o ${name} #${entry.number} · treino livre, editor e desafios de drift`:`Com o ${name} #${entry.number} · corrida única, treino, 1x1 ou campeonato`):!g.admitted?'':g.waiting?'O anfitrião escolhe a pista e dá a largada · clique para cancelar':`Com o ${name} #${entry.number} · o anfitrião escolhe a pista e dá a largada`;
  if(next.dataset.label!==label+hint){
   next.dataset.label=label+hint;const span=document.createElement('span'),small=document.createElement('small');span.className='mode-label';span.textContent=label;small.id='carsNextDetail';small.textContent=hint;
   next.replaceChildren(span,...hint?[small]:[]);
  }
  this.stageLine();
 }
 // Every frame while the screen shows (main.js): the studio on the page's canvas.
 // The stage's line while it has no picture: the model loading, then the garage and the car being prepared.
 stageLine(){
  if(this.failure===this.model)return;const loaded=this.studio.ready(this.model);this.status.hidden=loaded&&this.live;
  if(!this.status.hidden)this.status.textContent=loaded?'Preparando a garagem…':`Carregando o ${MODEL_NAMES[this.model]}…`;
 }
 render(renderer,dt){
  const live=this.studio.ready(this.model)&&this.studio.render(renderer,Math.min(dt,.05),this.stage.getBoundingClientRect(),this.quality());
  if(live!==this.live){this.live=live;this.root.classList.toggle('live',live);this.stageLine();}
 }
 info(){return {value:this.value,still:this.studio.still,model:this.model,live:this.live,taken:Object.fromEntries(this.taken),asked:this.asked,guest:this.guest,built:this.studio.shown?.split(':')[1]??null,builtModel:this.studio.shown?.split(':')[0]??null,count:rosterOf(this.model).choices.length,yaw:this.studio.yaw,zoom:this.studio.zoom,zoomTo:this.studio.zoomTo,zoomMax:this.studio.zoomMax,distance:this.studio.distance,elevation:this.studio.elevation,fov:this.studio.camera.fov,
   offset:this.studio.offset.toArray(),camera:this.studio.camera.position.toArray(),garage:this.studio.garage?.info()??null,meshes:(()=>{let n=0;this.studio.car?.traverse(o=>{if(o.isMesh&&o.visible)n++;});return n;})()};}
}
