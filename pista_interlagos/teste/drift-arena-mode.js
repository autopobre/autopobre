// Arena de Drift in play: the layout on the floor (ArenaWorld + ArenaProps), the drift score and the challenge under
// way, the score on screen and on the stadium's screens, the arena's panel (free drive, ready-made layouts,
// challenges) and the editor, a view from above where items are put down, moved, turned, resized and taken away.
// main.js owns the car, the cameras and the pause; it calls step() each physics step, frame() each frame and asks
// editing/editorCamera() while the editor is open.
import * as THREE from 'three';
import {ARENA,ITEM_KINDS,ITEM_ORDER,PRESETS,PRESET_ORDER,presetLayout,cleanLayout,cleanItem,DRIFT_ARENA,floorEdge,loadArenaSave,storeArenaSave,MAX_ITEMS,MEIA_LUA} from './drift-arena.js';
import {ArenaWorld} from './drift-arena-world.js';
import {DriftScore,ArenaChallenge,CHALLENGES,CHALLENGE_ORDER,MEDAL_NAMES} from './drift-score.js';
import {ArenaProps,FLOOR_Y} from './drift-arena-props.js';

const fmt=n=>Math.round(n).toLocaleString('pt-BR');
const html=(strings,...values)=>strings.reduce((out,s,i)=>out+s+(i<values.length?String(values[i]).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])):''),'');
const ROTATE=Math.PI/12;
// The keys that tune the car while driving: [which, step].
const TUNE_KEYS=Object.freeze({Digit9:['throttle',-.05],Digit0:['throttle',.05],Numpad9:['throttle',-.05],Numpad0:['throttle',.05],Minus:['steer',-2],NumpadSubtract:['steer',-2],Equal:['steer',2],NumpadAdd:['steer',2]});

export class ArenaMode{
 // scene: the game's scene; view: the canvas; storage: the pilot's localStorage; pilot(): the pilot's name;
 // sound(name, options): a game effect; onPause(on): main.js stops the physics and frees the mouse (panel, editor).
 constructor({scene,view,textures,mobile=false,storage=null,pilot=()=>'',sound=()=>{},onPause=()=>{},stadium=null}){
  Object.assign(this,{scene,view,mobile,storage,pilot,sound,onPause,stadium});
  this.save=loadArenaSave(storage);this.mode='livre';this.challenge=null;
  this.world=new ArenaWorld(this.save.layout);this.score=new DriftScore();this.score.best=this.save.bestDrift;
  this.props=new ArenaProps({textures,mobile});scene.add(this.props.root);this.props.setLayout(this.world.layout,this.world);
  this.editing=false;this.panelOpen=false;this.tool='mover';this.selected=null;this.drag=null;this.undo=[];
  this.view3=new THREE.Vector3();this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),-FLOOR_Y);this.hit=new THREE.Vector3();
  this.zoom=1;this.pan=new THREE.Vector2();this.screenAt=0;this.toastAt=0;this.prev=[0,0];
  this.buildDom();this.bind();this.renderHud(true);
 }
 // The player's car on the arena (drift-physics.js DriftCar): the world under its wheels and round it.
 attach(car){this.car=car;car.world=this.world;car.tune?.(this.save.tune);}
 // Where the car comes in (a fresh start, R): the west end, at rest; every cone back in place.
 spawn(car=this.car){
  const s=this.challenge?.def.spawn??DRIFT_ARENA.spawn;car.relocate(s.x,s.y,NaN,s.heading);car.vx=car.vy=car.yaw=0;car.settle();car.awaitingStart=false;
  this.world.resetProps();this.score.reset();this.score.best=this.save.bestDrift;this.challenge?.reset();this.renderHud(true);
 }
 beforeStep(){this.prev[0]=this.car.x;this.prev[1]=this.car.y;this.car.prevX=this.prev[0];this.car.prevY=this.prev[1];}
 // One physics step, after the car's: the props move, the drift is scored, the challenge measured.
 // hand: the handbrake this step ({handbrake, latched}: pulled, and pulled by Space's latch rather than held on N).
 step(dt,impact=0,hand=null){
  if(hand){this.handbrake=hand.handbrake;this.latched=hand.latched;}
  this.world.step(dt);this.score.update(this.car,this.world,dt,impact);
  const result=this.challenge?.update(this.car,this.score,dt,impact);if(result)this.challengeDone(result);
  for(const e of this.score.takeEvents())this.onEvent(e);
 }
 onEvent(e){
  if(e.type==='bank'&&e.points>0){
   this.toast(`DRIFT ${fmt(e.points)}`,'bank');if(e.points>this.save.bestDrift){this.save.bestDrift=e.points;this.persist();if(e.points>=300)this.toast(`NOVO RECORDE · ${fmt(e.points)}`,'record');}
   if(e.points>1500)this.sound('crowdWelcome',{strength:Math.min(1,e.points/6000)});
  }
  if(e.type==='lost'){this.toast(`${e.reason.toUpperCase()} −${fmt(e.points)}`,'lost');this.sound('denied');}
  if(e.type==='clip'){this.toast(`CLIPE +${fmt(e.bonus)}`,'clip');this.sound('judgeCheck');}
  if(e.type==='transition'&&!this.mobile)this.toast(`TROCA DE LADO · x${e.combo.toFixed(1).replace('.',',')}`,'combo');
 }
 // Per frame: the props drawn where the world has them, the screens.
 frame(dt){
  this.props.sync();
  // The handbrake's lamp, every frame: a drift starts on it.
  const hb=this.handbrake&&!this.editing,box=this.$('arenaHandbrake');if(box.hidden===hb){box.hidden=!hb;}if(hb){const t='FREIO DE MÃO';if(box.textContent!==t)box.textContent=t;}
  this.screenAt-=dt;if(this.screenAt<=0){this.screenAt=.25;this.renderHud();this.renderScreens();}
 }
 renderScreens(){
  if(!this.stadium?.setScreens)return;const d=this.score.drift,c=this.challenge;
  const lines=c?[c.def.name.toUpperCase(),c.state==='running'?`${c.current.toLocaleString('pt-BR',{maximumFractionDigits:c.def.digits})} ${c.def.unit.toUpperCase()}`:'PRONTO',`RECORDE ${this.bestText(c.id)}`]
   :['ARENA DE DRIFT',d?`DRIFT ${fmt(d.points)} x${d.combo.toFixed(1).replace('.',',')}`:`TOTAL ${fmt(this.score.total)}`,`MELHOR ${fmt(this.save.bestDrift)}`];
  this.stadium.setScreens(lines);
 }
 // --- Challenges
 startChallenge(id){
  this.mode=id;this.challenge=new ArenaChallenge(id,this.world);this.world.setLayout(presetLayout(CHALLENGES[id].preset));this.props.setLayout(this.world.layout,this.world);
  this.challenge.world=this.world;this.spawn();this.closePanel();this.toast(CHALLENGES[id].name.toUpperCase(),'combo');this.sound('raceGo');
 }
 freeDrive(){this.mode='livre';this.challenge=null;this.world.setLayout(this.save.layout);this.props.setLayout(this.world.layout,this.world);this.spawn();}
 challengeDone(result){
  const id=this.challenge.id,def=CHALLENGES[id],best=this.save.bests[id],value=result.value;
  const text=`${value.toLocaleString('pt-BR',{maximumFractionDigits:def.digits})} ${def.unit}`;
  if(!best||value>best.score){this.save.bests[id]={score:value,pilot:this.pilot()||'',at:new Date().toISOString().slice(0,10)};this.persist();}
  this.toast(result.reason?`${result.reason}`:`${text}${result.medal?' · '+MEDAL_NAMES[result.medal].toUpperCase():''}`,result.medal??(result.reason?'lost':'bank'),3.5);
  this.sound(result.medal?'finish':'click');this.lastSheet=result.sheet??null;this.renderHud(true);
 }
 bestText(id){const b=this.save.bests[id];return b?b.score.toLocaleString('pt-BR',{maximumFractionDigits:CHALLENGES[id].digits}):'—';}
 persist(){storeArenaSave(this.storage,this.save);}
 // --- On screen
 $(id){return this.root.querySelector('#'+id);}
 buildDom(){
  const root=this.root=document.createElement('div');root.id='arenaUi';
  root.innerHTML=`
<section id="arenaHud" aria-live="off"><div class="arena-drift"><b id="arenaPoints">0</b><span id="arenaCombo">x1</span></div>
 <div class="arena-meter"><i id="arenaAngle"></i></div><p id="arenaLine"></p></section>
<section id="arenaChallenge" hidden></section>
<div id="arenaHandbrake" hidden role="status">FREIO DE MÃO</div>
<div id="arenaToast" role="status" aria-live="polite"></div>
<button id="arenaButton" type="button" title="Arena: layouts, desafios e editor (T)">Arena <kbd>T</kbd></button>
<section id="arenaTune" aria-label="Ajuste do carro">
 <label class="arena-tune-row" title="Quanto ↑ / W acelera apertado até o fim · teclas 9 e 0"><span>Acelerador</span><input id="arenaThrottle" type="range" min="20" max="100" step="5"><output id="arenaThrottleValue"></output><kbd>9 0</kbd></label>
 <label class="arena-tune-row" title="Quanto as rodas viram com o carro parado (com a velocidade, menos) · teclas − e ="><span>Volante</span><input id="arenaSteer" type="range" min="10" max="49" step="1"><output id="arenaSteerValue"></output><kbd>− =</kbd></label>
</section>
<div id="arenaPanel" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="arenaPanelTitle"><div class="arena-shell">
 <div class="arena-head"><div><span class="tracks-kicker">ARENA DE DRIFT · AUTO-POBRE RACING</span><h2 id="arenaPanelTitle">O que vamos fazer?</h2></div><button id="arenaClose" type="button">Voltar a dirigir (T)</button></div>
 <div class="arena-cols">
  <section><h3>Treino livre</h3><p class="arena-note">Dirija à vontade na sua arena. Cada drift vale pontos: ângulo, velocidade, combo e rodas de trás na zona amarela.</p>
   <p class="arena-note arena-keys">Freio de mão: segure <b>Espaço</b>, <b>Shift</b>, <b>B</b> ou <b>N</b> (solta ao soltar). De lado, D/A contra a curva segura o drift; para dentro, aprofunda.</p>
   <button id="arenaFree" class="primary" type="button">Treino livre na minha arena →</button>
   <button id="arenaEdit" type="button">Montar a minha arena (editor)</button>
   <h4>Layouts prontos <small>(substituem a sua arena)</small></h4><div id="arenaPresets" class="arena-presets"></div></section>
  <section><h3>Desafios</h3><div id="arenaChallenges" class="arena-challenges"></div></section>
 </div></div></div>
<div id="arenaEditor" hidden><aside><h3>Montar arena</h3><div id="arenaTools" class="arena-tools"></div><p id="arenaToolHint" class="arena-note"></p>
 <div class="arena-edit-actions"><button id="arenaRotL" type="button" title="Girar (Q)">⟲</button><button id="arenaRotR" type="button" title="Girar (E)">⟳</button><button id="arenaSmaller" type="button" title="Menor (−)">−</button><button id="arenaBigger" type="button" title="Maior (+)">+</button><button id="arenaDelete" type="button" title="Apagar (Delete)">Apagar</button></div>
 <div class="arena-edit-actions"><button id="arenaUndo" type="button">Desfazer</button><button id="arenaClear" type="button">Limpar tudo</button></div>
 <button id="arenaDone" class="primary" type="button">Pronto, dirigir (T)</button>
 <p class="arena-note arena-keys">Clique no piso para pôr · arraste para mover · Q/E gira · +/− tamanho · Delete apaga · roda do mouse aproxima · botão direito apaga</p></aside>
 <p id="arenaCount" class="arena-count"></p></div>`;
  document.body.append(root);
  // Ready-made layouts and challenges.
  this.$('arenaPresets').innerHTML=PRESET_ORDER.map(id=>html`<button type="button" data-arena-preset="${id}"><b>${PRESETS[id].name}</b><small>${PRESETS[id].items.length} itens</small></button>`).join('');
  this.$('arenaTools').innerHTML=[['mover','Mover / escolher','Clique num item para escolher e arrastar.'],...ITEM_ORDER.map(k=>[k,ITEM_KINDS[k].name,ITEM_KINDS[k].hint])].map(([k,name,hint])=>html`<button type="button" data-arena-tool="${k}" title="${hint}"><i class="arena-icon arena-icon-${k}"></i>${name}</button>`).join('');
 }
 renderChallenges(){
  this.$('arenaChallenges').innerHTML=CHALLENGE_ORDER.map(id=>{const c=CHALLENGES[id],b=this.save.bests[id],medal=b?['ouro','prata','bronze'].find(m=>b.score>=c.medals[['bronze','prata','ouro'].indexOf(m)]):null;
   return html`<article class="arena-card"><h4>${c.name}</h4><p>${c.goal}</p><p class="arena-medals"><span class="bronze">${c.medals[0]}</span><span class="prata">${c.medals[1]}</span><span class="ouro">${c.medals[2]}</span> ${c.unit}</p>
    <p class="arena-best">${b?`Seu recorde: ${this.bestText(id)} ${c.unit}${medal?' · '+MEDAL_NAMES[medal]:''}`:'Ainda sem recorde'}</p><button type="button" class="primary" data-arena-challenge="${id}">Tentar →</button></article>`;}).join('');
 }
 bind(){
  this.$('arenaButton').onclick=()=>this.togglePanel();
  // The player's map of the keys: kept as it moves, on the car at once (drift-physics.js tune).
  const tuned=()=>{const t=this.save.tune;this.$('arenaThrottle').value=String(Math.round(t.throttle*100));this.$('arenaSteer').value=String(Math.round(t.steer));
   this.$('arenaThrottleValue').textContent=`${Math.round(t.throttle*100)}%`;this.$('arenaSteerValue').textContent=`${Math.round(t.steer)}°`;this.car?.tune?.(t);};
  this.$('arenaThrottle').oninput=e=>{this.save.tune.throttle=+e.target.value/100;tuned();this.persist();};
  this.$('arenaSteer').oninput=e=>{this.save.tune.steer=+e.target.value;tuned();this.persist();};
  // Let go of the slider, the keys drive again (a focused range input would take the arrows).
  for(const id of ['arenaThrottle','arenaSteer']){this.$(id).addEventListener('change',e=>e.target.blur());this.$(id).addEventListener('pointerup',e=>e.target.blur());}
  this.showTune=tuned;tuned();
  this.$('arenaClose').onclick=()=>this.closePanel();
  this.$('arenaFree').onclick=()=>{this.freeDrive();this.closePanel();};
  this.$('arenaEdit').onclick=()=>{this.closePanel(false);this.openEditor();};
  this.$('arenaPresets').onclick=e=>{const b=e.target.closest('[data-arena-preset]');if(!b)return;this.save.layout=presetLayout(b.dataset.arenaPreset);this.persist();this.freeDrive();this.closePanel();this.toast(PRESETS[b.dataset.arenaPreset].name.toUpperCase(),'combo');};
  this.$('arenaChallenges').onclick=e=>{const b=e.target.closest('[data-arena-challenge]');if(b)this.startChallenge(b.dataset.arenaChallenge);};
  this.$('arenaTools').onclick=e=>{const b=e.target.closest('[data-arena-tool]');if(b)this.setTool(b.dataset.arenaTool);};
  this.$('arenaRotL').onclick=()=>this.turn(-ROTATE);this.$('arenaRotR').onclick=()=>this.turn(ROTATE);
  this.$('arenaSmaller').onclick=()=>this.resize(-1);this.$('arenaBigger').onclick=()=>this.resize(1);
  this.$('arenaDelete').onclick=()=>this.removeSelected();this.$('arenaUndo').onclick=()=>this.undoLast();
  this.$('arenaClear').onclick=()=>{const b=this.$('arenaClear');if(!b.dataset.armed){b.dataset.armed='1';b.textContent='Apagar tudo? Clique de novo';setTimeout(()=>{delete b.dataset.armed;b.textContent='Limpar tudo';},3500);return;}delete b.dataset.armed;b.textContent='Limpar tudo';this.edit(l=>{l.items=[];});this.select(null);};
  this.$('arenaDone').onclick=()=>this.closeEditor();
  // The editor's pointer on the floor (main.js leaves the canvas to it while editing).
  const v=this.view;
  this.onPointerDown=e=>{if(!this.editing)return;e.preventDefault();e.stopImmediatePropagation();this.pointerDown(e);};
  this.onPointerMove=e=>{if(!this.editing)return;this.pointerMove(e);};
  this.onPointerUp=e=>{if(!this.editing)return;this.pointerUp(e);};
  this.onWheel=e=>{if(!this.editing)return;e.preventDefault();e.stopImmediatePropagation();this.zoomAt(e);};
  this.onContext=e=>{if(this.editing)e.preventDefault();};
  v.addEventListener('pointerdown',this.onPointerDown,{capture:true});v.addEventListener('pointermove',this.onPointerMove);window.addEventListener('pointerup',this.onPointerUp);
  v.addEventListener('wheel',this.onWheel,{capture:true,passive:false});v.addEventListener('contextmenu',this.onContext);
 }
 // Keys while the panel or the editor is open (main.js asks first). true: handled.
 handleKey(e){
  if(e.code==='KeyT'){if(!e.repeat){if(this.editing)this.closeEditor();else this.togglePanel();}return true;}
  // Driving: 9 / 0 the throttle's map, − / = the wheel's (held, they repeat).
  const nudge=!this.editing&&!this.panelOpen&&TUNE_KEYS[e.code];if(nudge){this.nudge(...nudge);return true;}
  if(this.panelOpen){if(e.code==='Escape'){this.closePanel();return true;}return false;}
  if(!this.editing)return false;
  const map={KeyQ:()=>this.turn(-ROTATE),KeyE:()=>this.turn(ROTATE),Equal:()=>this.resize(1),NumpadAdd:()=>this.resize(1),Minus:()=>this.resize(-1),NumpadSubtract:()=>this.resize(-1),Delete:()=>this.removeSelected(),Backspace:()=>this.removeSelected(),Escape:()=>this.closeEditor(),KeyZ:()=>{if(e.ctrlKey||e.metaKey)this.undoLast();}};
  const fn=map[e.code];if(fn){e.preventDefault();fn();}
  return true;
 }
 // One step of the player's map: the throttle by 5%, the wheel by 2°.
 nudge(which,step){
  const t=this.save.tune;if(which==='throttle')t.throttle=Math.min(1,Math.max(.2,Math.round((t.throttle+step)*100)/100));else t.steer=Math.min(49,Math.max(10,t.steer+step));
  this.showTune();this.persist();const box=this.$('arenaTune');box.classList.remove('nudged');void box.offsetWidth;box.classList.add('nudged');
 }
 togglePanel(){if(this.panelOpen)this.closePanel();else this.openPanel();}
 openPanel(){if(this.editing)return;this.panelOpen=true;this.renderChallenges();this.$('arenaPanel').classList.remove('hidden');this.onPause(true);this.$('arenaFree').focus({preventScroll:true});}
 closePanel(resume=true){if(!this.panelOpen)return;this.panelOpen=false;if(this.root.contains(document.activeElement))document.activeElement.blur();this.$('arenaPanel').classList.add('hidden');if(resume)this.onPause(false);}
 // --- Editor
 openEditor(){
  if(this.mode!=='livre')this.freeDrive();
  this.editing=true;this.zoom=1;this.pan.set(0,0);this.$('arenaEditor').hidden=false;document.body.classList.add('arena-editing');this.onPause(true);this.setTool(this.tool);this.select(null);this.updateCount();
 }
 closeEditor(){
  if(!this.editing)return;this.editing=false;this.drag=null;this.camera?.up.set(0,1,0);this.$('arenaEditor').hidden=true;document.body.classList.remove('arena-editing');this.props.select(null);
  // The car back at the start if an item landed on it.
  const car=this.car;if(car&&this.world.solids.some(q=>this.world.touch(car,q.x,q.y,q.r)))this.spawn();
  this.onPause(false);
 }
 setTool(tool){this.tool=tool;for(const b of this.root.querySelectorAll('[data-arena-tool]'))b.setAttribute('aria-pressed',String(b.dataset.arenaTool===tool));this.$('arenaToolHint').textContent=tool==='mover'?'Clique num item para escolher e arrastar.':ITEM_KINDS[tool].hint;}
 // The camera above the floor: the whole arena framed for the window, zoomed and panned by the wheel.
 editorCamera(camera){
  const aspect=camera.aspect,fov=40,tilt=.12,spanX=(ARENA.halfLength*2+16)/this.zoom,spanY=(ARENA.halfWidth*2+16)/this.zoom;
  const half=Math.tan(fov/2*Math.PI/180),height=Math.max(spanY/2/half,spanX/2/(half*aspect))*1.04;
  // The editor's panel covers the left of the window on a wide screen: the floor is framed to its right.
  const shift=this.mobile||aspect<1.2?0:spanX*.12;
  this.camera=camera;camera.fov=fov;camera.updateProjectionMatrix();camera.up.set(0,0,-1);
  camera.position.set(this.pan.x-shift,height,-this.pan.y+height*tilt);camera.lookAt(this.pan.x-shift,0,-this.pan.y);
  return true;
 }
 floorPoint(e){
  const r=this.view.getBoundingClientRect(),ndc=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
  this.ray.setFromCamera(ndc,this.camera);if(!this.ray.ray.intersectPlane(this.plane,this.hit))return null;return {x:this.hit.x,y:-this.hit.z};
 }
 itemAt(p){
  let best=null,bestD=Infinity;
  this.world.layout.items.forEach((item,i)=>{
   const k=ITEM_KINDS[item.kind],size=item.size??k.size;let d=Math.hypot(p.x-item.x,p.y-item.y);
   const reach=item.kind==='ilha'?size+1:['zona','muro','bloco'].includes(item.kind)?Math.max(2,size/2):item.kind==='meia_lua'?4:item.kind==='largada'?8:1.6;
   if(['zona','muro','bloco'].includes(item.kind)){const c=Math.cos(item.a),s=Math.sin(item.a),u=(p.x-item.x)*c+(p.y-item.y)*s,v=-(p.x-item.x)*s+(p.y-item.y)*c;d=Math.abs(u)<=size/2&&Math.abs(v)<=2.2?Math.abs(v)*.5:Infinity;}
   if(d<=reach&&d<bestD){bestD=d;best=i;}
  });
  return best;
 }
 pointerDown(e){
  const p=this.floorPoint(e);if(!p)return;
  if(e.button===2){const i=this.itemAt(p);if(i!==null){this.select(i);this.removeSelected();}return;}
  const i=this.itemAt(p);
  if(i!==null&&(this.tool==='mover'||this.tool===this.world.layout.items[i].kind)){this.select(i);const it=this.world.layout.items[i];this.drag={dx:it.x-p.x,dy:it.y-p.y,moved:false,before:structuredClone(this.world.layout)};return;}
  if(this.tool==='mover'){this.select(null);return;}
  if(this.world.layout.items.length>=MAX_ITEMS){this.toast('ARENA CHEIA',`lost`);return;}
  const item=cleanItem({kind:this.tool,x:p.x,y:p.y,a:this.defaultHeading(this.tool,p),size:ITEM_KINDS[this.tool].size});
  if(!item){this.toast('FORA DO PISO','lost');return;}
  this.edit(l=>{if(item.kind==='largada')l.items=l.items.filter(x=>x.kind!=='largada');l.items.push(item);});
  this.select(this.world.layout.items.length-1);this.drag={dx:0,dy:0,moved:false,before:null};this.sound('click');
 }
 // A new zone or wall lies along the nearest wall; a crescent faces the middle of the floor.
 defaultHeading(kind,p){
  if(kind==='meia_lua')return Math.atan2(-p.y,-p.x);
  if(kind==='largada'||kind==='zona'||kind==='muro'||kind==='bloco'){const e=floorEdge(p.x,p.y);return Math.atan2(e.nx,-e.ny)+(kind==='largada'?Math.PI/2:0);}
  return 0;
 }
 pointerMove(e){
  if(!this.drag||this.selected===null)return;const p=this.floorPoint(e);if(!p)return;
  const item=this.world.layout.items[this.selected],x=p.x+this.drag.dx,y=p.y+this.drag.dy;if(floorEdge(x,y).d>-.6)return;
  if(this.drag.before&&!this.drag.moved){this.undo.push(this.drag.before);if(this.undo.length>40)this.undo.shift();}
  this.drag.moved=true;item.x=+x.toFixed(2);item.y=+y.toFixed(2);this.applyLayout();
 }
 pointerUp(){if(!this.drag)return;const moved=this.drag.moved;this.drag=null;if(moved){this.commit();}}
 zoomAt(e){const before=this.zoom;this.zoom=Math.min(4,Math.max(1,this.zoom*(e.deltaY<0?1.15:1/1.15)));if(this.zoom===1)this.pan.set(0,0);else if(this.zoom!==before){const p=this.floorPoint(e);if(p){const k=1-before/this.zoom;this.pan.x+=(p.x-this.pan.x)*k;this.pan.y+=(p.y-this.pan.y)*k;}}}
 select(i){this.selected=i;this.props.select(i===null?null:this.world.layout.items[i]);const item=i===null?null:this.world.layout.items[i];this.$('arenaToolHint').textContent=item?`${ITEM_KINDS[item.kind].name} escolhido: arraste, gire (Q/E)${ITEM_KINDS[item.kind].size?', mude o tamanho (+/−)':''} ou apague.`:this.tool==='mover'?'Clique num item para escolher e arrastar.':ITEM_KINDS[this.tool].hint;}
 turn(da){if(this.selected===null)return;this.edit(l=>{const it=l.items[this.selected];it.a=+(((it.a+da)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)).toFixed(4);});}
 resize(step){if(this.selected===null)return;const it=this.world.layout.items[this.selected],k=ITEM_KINDS[it.kind];if(!k.size)return;const unit=it.kind==='meia_lua'||it.kind==='ilha'?1:2;this.edit(l=>{const x=l.items[this.selected];x.size=Math.min(k.max,Math.max(k.min,(x.size??k.size)+step*unit));});}
 removeSelected(){if(this.selected===null)return;const i=this.selected;this.edit(l=>{l.items.splice(i,1);});this.select(null);this.sound('click');}
 undoLast(){const last=this.undo.pop();if(!last)return;this.save.layout=cleanLayout(last);this.applyLayout();this.persist();this.select(null);this.updateCount();}
 // A change to the player's arena: kept for undo, cleaned, shown and saved.
 edit(fn){this.undo.push(structuredClone(this.save.layout));if(this.undo.length>40)this.undo.shift();const l=structuredClone(this.save.layout);fn(l);this.save.layout=cleanLayout(l);if(this.selected!==null&&this.selected>=this.save.layout.items.length)this.selected=null;this.applyLayout();this.commit();}
 applyLayout(){this.world.setLayout(this.save.layout);this.props.setLayout(this.world.layout,this.world);if(this.selected!==null)this.props.select(this.world.layout.items[this.selected]);this.updateCount();}
 commit(){this.save.layout=cleanLayout(this.world.layout);this.persist();}
 updateCount(){const n=this.world.layout.items.length;this.$('arenaCount').textContent=`${n} ${n===1?'item':'itens'} na arena · máximo ${MAX_ITEMS}`;}
 toast(text,kind='bank',time=1.6){const t=this.$('arenaToast');t.textContent=text;t.className='show '+kind;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.remove('show'),time*1000);}
 // The HUD: the drift under way (or the last one), the angle meter, the totals and the challenge.
 renderHud(force=false){
  const s=this.score,d=s.drift,last=s.last;
  this.$('arenaHud').classList.toggle('drifting',!!d);this.$('arenaHud').classList.toggle('zone',s.inZone);
  this.$('arenaPoints').textContent=d?fmt(d.points):last?(last.ok?fmt(last.points):'0'):'0';
  this.$('arenaCombo').textContent=d?`x${d.combo.toFixed(1).replace('.',',')}${s.inZone?' · ZONA x2':''}`:last&&!last.ok?last.reason:'DRIFT';
  this.$('arenaAngle').style.width=`${Math.min(100,Math.abs(s.angle)/70*100)}%`;
  this.$('arenaLine').textContent=`${Math.round(Math.abs(s.angle))}° · total ${fmt(s.total)} · melhor drift ${fmt(this.save.bestDrift)}`;
  const box=this.$('arenaChallenge'),c=this.challenge;box.hidden=!c;
  if(c){
   const def=c.def,running=c.state==='running',sheet=this.lastSheet,last=c.lastResult;
   box.innerHTML=html`<h4>${def.name}</h4><p class="arena-now">${running?`${c.current.toLocaleString('pt-BR',{maximumFractionDigits:def.digits})} ${def.unit}`:c.id==='qualificacao'?'Cruze a largada para valer':'Comece um drift'}</p>
    <p class="arena-medals"><span class="bronze">${def.medals[0]}</span><span class="prata">${def.medals[1]}</span><span class="ouro">${def.medals[2]}</span> · recorde ${this.bestText(c.id)}</p><p class="arena-keys">R recomeça · T troca de desafio</p>`+
    (last?html`<p class="arena-last">Última: ${last.value.toLocaleString('pt-BR',{maximumFractionDigits:def.digits})} ${def.unit}${last.medal?' · '+MEDAL_NAMES[last.medal]:''}${last.reason?' · '+last.reason:''}</p>`:'')+
    (sheet&&c.id==='qualificacao'&&!running?html`<p class="arena-sheet">Linha ${sheet.line}/40 · Ângulo ${sheet.angle}/30 · Estilo ${sheet.style}/30${sheet.penalty?` · −${sheet.penalty}`:''}</p>`:'');
  }
 }
 // The minimap: the floor, the items, the car.
 drawMap(ctx,project,car){
  ctx.beginPath();const {halfLength:A,halfWidth:B,corner:R}=ARENA,[x0,y0]=project(-A,B),[x1,y1]=project(A,-B),k=(x1-x0)/(2*A);
  ctx.roundRect(x0,y0,x1-x0,y1-y0,R*k);ctx.fillStyle='#ffffff10';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#b6c5b5';ctx.stroke();
  for(const item of this.world.layout.items){
   const [x,y]=project(item.x,item.y),size=item.size??ITEM_KINDS[item.kind].size;ctx.beginPath();
   if(item.kind==='ilha'){ctx.arc(x,y,size*k,0,Math.PI*2);ctx.fillStyle='#5f8f45';ctx.fill();}
   else if(item.kind==='meia_lua'){const [cx,cy]=project(item.x+Math.cos(item.a)*size,item.y+Math.sin(item.a)*size),mid=-(item.a+Math.PI);ctx.arc(cx,cy,(size+2.5)*k,mid-MEIA_LUA.span/2,mid+MEIA_LUA.span/2);ctx.lineWidth=Math.max(2,4*k);ctx.strokeStyle='#5f8f45';ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,(size-1.7)*k,mid-MEIA_LUA.span/2,mid+MEIA_LUA.span/2);ctx.lineWidth=Math.max(1.5,3.5*k);ctx.strokeStyle='#f6ce26aa';ctx.stroke();}
   else if(item.kind==='zona'){ctx.save();ctx.translate(x,y);ctx.rotate(-item.a);ctx.fillStyle='#f6ce26aa';ctx.fillRect(-size/2*k,-1.75*k,size*k,3.5*k);ctx.restore();}
   else if(item.kind==='clip'){ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fillStyle='#ff4b3a';ctx.fill();}
   else if(item.kind==='largada'){ctx.save();ctx.translate(x,y);ctx.rotate(-item.a);ctx.fillStyle='#ffffff';ctx.fillRect(-1,-7*k,2,14*k);ctx.restore();}
   else if(item.kind==='muro'||item.kind==='bloco'){ctx.save();ctx.translate(x,y);ctx.rotate(-item.a);ctx.fillStyle=item.kind==='muro'?'#222':'#ccc';ctx.fillRect(-size/2*k,-1,size*k,2);ctx.restore();}
  }
  for(const p of this.world.props){const [x,y]=project(p.x,p.y);ctx.beginPath();ctx.arc(x,y,p.kind==='cone'?1.6:2,0,Math.PI*2);ctx.fillStyle=p.kind==='cone'?(p.down?'#ff8a3a66':'#ff8a3a'):'#111';ctx.fill();}
  const [x,y]=project(car.x,car.y);ctx.save();ctx.translate(x,y);ctx.rotate(-car.heading);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4);ctx.lineTo(-3,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fillStyle='#e2fb57';ctx.shadowBlur=10;ctx.shadowColor='#d6fa4b';ctx.fill();ctx.restore();
 }
 info(){return {tune:{...this.save.tune},carTune:this.car?{throttle:this.car.throttleMax,steer:+((this.car.steerMax??0)*180/Math.PI).toFixed(1)}:null,mode:this.mode,setup:this.car?.setup?this.car.mechanics.name:null,drift:this.car?.info?.()??null,editing:this.editing,panel:this.panelOpen,layout:this.world.layout.items.length,world:this.world.info(),score:this.score.info(),challenge:this.challenge?.info()??null,props:this.props.info(),bests:structuredClone(this.save.bests),bestDrift:this.save.bestDrift,selected:this.selected,tool:this.tool,zoom:this.zoom};}
 dispose(){
  const v=this.view;v.removeEventListener('pointerdown',this.onPointerDown,{capture:true});v.removeEventListener('pointermove',this.onPointerMove);window.removeEventListener('pointerup',this.onPointerUp);
  v.removeEventListener('wheel',this.onWheel,{capture:true});v.removeEventListener('contextmenu',this.onContext);
  document.body.classList.remove('arena-editing','arena-mode');this.root.remove();this.props.root.removeFromParent();this.props.dispose();if(this.car?.world===this.world)this.car.world=null;
 }
}
