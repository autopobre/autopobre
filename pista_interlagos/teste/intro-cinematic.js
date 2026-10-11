import * as THREE from 'three';

// Opening shots, film style: letterbox bars, a few camera moves and title cards.
// The free race opens on the grid before its 3-2-1; the story opens in the paddock.
// Shots are built from the scene when the intro first runs, so the car and the pilot
// are already in place. Any key, click or touch skips it.
const STYLE=`
#cineIntro{position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .2s}
#cineIntro.on{opacity:1}
#cineIntro .cine-bar{position:absolute;left:0;right:0;height:11.5vh;background:#050505;transition:transform .38s cubic-bezier(.3,.8,.3,1)}
#cineIntro .cine-bar.top{top:0;transform:translateY(-100%)}#cineIntro .cine-bar.bottom{bottom:0;transform:translateY(100%)}
#cineIntro.on .cine-bar{transform:none}
#cineIntro .cine-title{position:absolute;left:6vw;bottom:calc(11.5vh + 4.5vh);color:#f3efe6;text-shadow:0 2px 18px rgba(0,0,0,.55);font-family:Inter,"Segoe UI",Arial,sans-serif;opacity:0;transform:translateY(10px);transition:opacity .3s,transform .45s}
#cineIntro .cine-title.show{opacity:1;transform:none}
#cineIntro .cine-eyebrow{display:block;font-size:clamp(10px,1.1vw,14px);letter-spacing:.34em;font-weight:600;opacity:.85;margin-bottom:.6em}
#cineIntro h2{margin:0;font-size:clamp(28px,5.2vw,72px);line-height:.95;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
#cineIntro p{margin:.7em 0 0;font-size:clamp(12px,1.35vw,18px);letter-spacing:.12em;opacity:.9}
#cineIntro .cine-skip{position:absolute;right:4vw;bottom:calc(11.5vh - 2.4em);color:#bdb7aa;font:600 11px Inter,"Segoe UI",Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase}
body.cine-intro-on>:not(#view):not(#cineIntro):not(#menu):not(dialog){opacity:0!important;pointer-events:none!important;transition:opacity .3s}
`;
const ease=t=>t<0?0:t>1?1:t*t*(3-2*t);
// Race shots gather speed and are cut at full pace: a ramp in, no settling at the end.
const rampIn=t=>t<0?0:t>1?1:Math.pow(t,2.4);
const UP=new THREE.Vector3(0,1,0);

export class CinematicIntro{
 constructor(){
  this.active=false;this.kind=null;this.shots=null;this.time=0;this.shot=-1;this.onEnd=null;this.context=null;this.played=0;
  this.position=new THREE.Vector3();this.target=new THREE.Vector3();this.dof={focus:10,amount:0};
 }
 ensureDom(){
  if(this.root||typeof document==='undefined')return;
  const style=document.createElement('style');style.textContent=STYLE;document.head.append(style);
  this.root=document.createElement('div');this.root.id='cineIntro';this.root.setAttribute('aria-hidden','true');
  this.root.innerHTML='<div class="cine-bar top"></div><div class="cine-bar bottom"></div><div class="cine-title"><span class="cine-eyebrow"></span><h2></h2><p></p></div><div class="cine-skip">Qualquer tecla pula a abertura</div>';
  document.body.append(this.root);this.title=this.root.querySelector('.cine-title');
  // A key pressed while it plays is only for the opening (introKey: main.js gives it to nothing else).
  const skip=e=>{if(!this.active)return;if(e.type==='keydown'&&!['Escape','KeyP','KeyM','Tab'].includes(e.code))e.introKey=true;if(this.time<.35)return;if(e.type==='keydown'&&['Escape','KeyP','KeyM','Tab'].includes(e.code))return;this.stop();};
  addEventListener('keydown',skip,true);addEventListener('pointerdown',skip,true);
 }
 // kind 'race' | 'story'; context() is read when the intro starts running.
 play(kind,context){this.ensureDom();this.kind=kind;this.context=context;this.shots=null;this.time=0;this.shot=-1;this.active=true;this.played++;}
 stop(){
  if(!this.active)return;this.active=false;this.shots=null;
  this.root?.classList.remove('on');this.title?.classList.remove('show');document.body.classList.remove('cine-intro-on');
  this.onEnd?.(this.kind);
 }
 caption(eyebrow,title,line){
  if(!this.title)return;this.title.classList.remove('show');
  this.title.querySelector('.cine-eyebrow').textContent=eyebrow;this.title.querySelector('h2').textContent=title;this.title.querySelector('p').textContent=line;
  void this.title.offsetWidth;this.title.classList.add('show');
 }
 build(){
  const c=this.context();if(!c)return null;
  const f=(this.kind==='story'?c.heroForward:c.forward).clone().setY(0).normalize(),side=UP.clone().cross(f).normalize(),at=(base,k,s,h)=>base.clone().addScaledVector(f,k).addScaledVector(side,s).add(new THREE.Vector3(0,h,0));
  if(this.kind==='story'){
   const h=c.hero;
   // A crane down the pit lane from the pit-wall side (negative side), below the garages' roof
   // edge: from behind and above the hero it would start on top of the roof.
   return [
    {duration:3.6,fov:[44,40],from:at(h,-15,-5.5,9),to:at(h,-9,-3,4.2),look:[at(h,9,-1,.8),at(h,7,0,1)],
     caption:[`${c.circuit.toUpperCase()} · DIA DE CORRIDA`,'Auto-Pobre Racing','Sem patrocínio. Com vaquinha.']},
    // The pilot's face: a slow push in from in front of him, focused on him and a little right
    // of centre, clear of the caption.
    {duration:3.4,fov:[34,28],from:at(h,2.5,.6,1.66),to:at(h,1.75,.45,1.64),look:[at(h,0,-.45,1.58),at(h,0,-.4,1.6)],
     dof:.3,caption:['O PILOTO',c.pilot,'Precisa juntar R$ 126 para largar.']}
   ];
  }
  const car=c.car,mid=at(car,40,0,0),inward=c.inward.clone().setY(0);if(inward.lengthSq()<1e-4)inward.copy(side);inward.normalize();
  const orbit=(a,r,h)=>mid.clone().addScaledVector(f,-Math.cos(a)*r).addScaledVector(side,Math.sin(a)*r).add(new THREE.Vector3(0,h,0));
  const lane=k=>c.center(k).add(new THREE.Vector3(0,1.05,0));
  return [
   {duration:1.9,ramp:true,fov:[42,34],from:orbit(1.0,112,56),to:orbit(.62,50,22),look:[mid,mid.clone().addScaledVector(f,-12)],
    caption:[String(c.venue||'').toUpperCase(),c.circuit,c.weather]},
   {duration:1.5,ramp:true,fov:[48,56],from:lane(40),to:lane(7),look:[car.clone().add(new THREE.Vector3(0,.7,0)),car.clone().add(new THREE.Vector3(0,.6,0))],
    // A solo practice (no flag) or a 1x1 (c.duel: the rival's roster entry) says so on the grid;
    // c.number is the car the player races (Modo Corrida's car screen), c.model its model (Opala or Fusca).
    dof:.3,caption:c.practice?['TREINO SOLO','Só você na pista','Voltas livres, sem bandeirada.']:c.duel?['CORRIDA 1x1',`#${c.number} × #${c.duel.number} ${c.duel.shortName}`,`${c.laps} volta${c.laps>1?'s':''}, mano a mano.`]:['OLD STOCK · LARGADA',`${c.grid} carros · ${c.laps} voltas`,'Motores ligados no grid.']},
   {duration:1.6,ramp:true,fov:[36,26],from:car.clone().addScaledVector(f,8.5).addScaledVector(inward,3.6).add(new THREE.Vector3(0,.85,0)),to:car.clone().addScaledVector(f,3.9).addScaledVector(inward,1.7).add(new THREE.Vector3(0,.6,0)),
    look:[car.clone().addScaledVector(f,.4).add(new THREE.Vector3(0,.6,0)),car.clone().addScaledVector(f,.2).add(new THREE.Vector3(0,.55,0))],
    dof:.45,caption:[`${c.model==='fusca'?'FUSCA':'OPALA'} #${c.number}`,c.pilot,c.practice?'Pista livre':`Larga em ${c.position}º`]}
  ];
 }
 // Moves the camera while the intro runs; returns false when there is nothing to do.
 update(dt,camera,paused){
  if(!this.active)return false;
  if(paused){this.root?.classList.remove('on');document.body.classList.remove('cine-intro-on');return false;}
  if(!this.shots){this.shots=this.build();if(!this.shots){this.stop();return false;}}
  this.root.classList.add('on');document.body.classList.add('cine-intro-on');
  this.time+=dt;
  let t=this.time,index=0;while(index<this.shots.length&&t>this.shots[index].duration){t-=this.shots[index].duration;index++;}
  if(index>=this.shots.length){this.stop();return false;}
  const shot=this.shots[index],k=(shot.ramp?rampIn:ease)(t/shot.duration);
  if(index!==this.shot){this.shot=index;if(shot.caption)this.caption(...shot.caption);}
  this.position.lerpVectors(shot.from,shot.to,k);this.target.lerpVectors(shot.look[0],shot.look[1],k);
  camera.position.copy(this.position);camera.up.set(0,1,0);camera.lookAt(this.target);
  camera.fov=shot.fov[0]+(shot.fov[1]-shot.fov[0])*k;camera.updateProjectionMatrix();
  // Focus on what the shot looks at, with the depth of field the shot asks for.
  this.dof.focus=this.position.distanceTo(this.target);this.dof.amount=shot.dof??0;
  return true;
 }
 info(){return {active:this.active,kind:this.kind,shot:this.shot,time:this.time,played:this.played};}
}
