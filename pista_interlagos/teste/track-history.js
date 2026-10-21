import * as THREE from 'three';
import {createPeople,OUTFITS,POSES,clonePose,applyPose} from './pit-crew.js';

// A circuit's history told over its 3D track, played like a video: play, pause, a bar with the chapters marked
// on it to jump to, captions, a narrator's voice (the browser's own, in Portuguese) and Stevan as the presenter,
// microphone in hand, beside the pictures that the 3D cannot show. Everything on screen is a function of the
// time on the bar (camera, layers drawn over the track, the ghost Opala on the old layout, captions), so any
// point can be jumped to. A script (historia-<circuito>.js) lists chapters of lines; a line says what is heard
// and, when it changes, what is shown: the shot (kept until another line gives one), the layers over the track
// and the labels (kept until changed), a picture, a "saiba mais" card, a title.
// Physics frame as the rest of the game: x east, y north, z up; three.js has (x, z, -y).

// ---- The timeline (no browser needed: scripts/testar_historia.mjs runs it in Node) ----
// A line lasts as long as the voice takes to say it (about 14 characters a second in Portuguese) and a breath, at the
// story's pace: PACE 1.75 is "Normal" (user, 10-21: the first version's 1.75× became the normal speed), so the scripts
// keep their timings at the voice's own rate and the whole story (voice, camera, ghost car) runs 1.75 times as fast.
export const CHARS_PER_SECOND=14,PACE=1.75;
export const estimateDuration=text=>Math.max(3,String(text||'').length/CHARS_PER_SECOND+.8);
// lang: 'pt' (the script's own words) or a language of script.translations (its chapters' titles and lines, in the
// same order: text, say, title); a line's length follows the words of that language.
export function buildTimeline(script,lang='pt'){
 const chapters=[],lines=[],tr=lang==='pt'?null:script.translations?.[lang];let t=0;
 script.chapters.forEach((c,ci)=>{
  const tc=tr?.chapters?.[c.id];
  const chapter={id:c.id,title:tc?.title??c.title,years:tc?.years??c.years??'',era:c.era??'novo',start:t,lines:[],links:[...(c.links??[])],index:ci};
  c.lines.forEach((l,li)=>{
   const tl=tc?.lines?.[li],text=tl?.text??l.text,say=tl?(tl.say??tl.text):l.say??l.text,dur=Math.max(2.2,(l.dur??estimateDuration(say))/PACE);
   const line={...l,text,say,title:tl?.title??l.title,chapter:ci,index:lines.length,inChapter:li,start:t,dur,end:t+dur};
   if(l.card&&!chapter.links.includes(l.card))chapter.links.push(l.card);
   chapter.lines.push(line);lines.push(line);t+=dur;
  });
  chapter.end=t;chapters.push(chapter);
 });
 // A shot (and the ghost car) lasts until a later line gives another; show and labels until changed.
 let shot=null,car=null,show=[],labels=[];
 for(const line of lines){
  line.prevShow=show;line.prevLabels=labels;
  if(line.shot){shot={shot:line.shot,start:line.start,end:t,prev:shot,blend:line.shot.cut?0:line.shot.blend??1.6};if(shot.prev)shot.prev.end=line.start;}
  const rideCar=line.shot?.ride&&line.car===undefined?{...line.shot.ride}:undefined,wanted=line.car!==undefined?line.car:rideCar;
  if(wanted!==undefined){if(car)car.end=line.start;car=wanted?{car:wanted,start:line.start,end:t}:null;}
  if(line.show)show=line.show;if(line.labels)labels=line.labels;
  line.shotSeg=shot;line.carSeg=car;line.showNow=show;line.labelsNow=labels;
 }
 return {chapters,lines,duration:t};
}
// The line playing at time t (the last one at the very end).
export function lineAt(timeline,t){
 const a=timeline.lines;let lo=0,hi=a.length-1;
 while(lo<hi){const m=(lo+hi+1)>>1;if(a[m].start<=t)lo=m;else hi=m-1;}
 return a[lo];
}
export const chapterAt=(timeline,t)=>timeline.chapters[lineAt(timeline,t).chapter];
export function formatTime(t){t=Math.max(0,Math.floor(t));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;}
// Every place a script names must exist on its path: ['new:Ferradura', …] → the names not found.
export function missingPlaces(script,oldPoints={}){
 const missing=new Set(),check=ref=>{if(typeof ref!=='string')return;const [path,name]=ref.split(':');if(name===undefined||/^-?\d+(\.\d+)?$/.test(name))return;const table=path==='old'?oldPoints:script.places?.[path];if(!table||!(name in table))missing.add(ref);};
 // A ride, a stretch or a car names its places on its own path: {path:'old', from:'Curva 1', to:'Retão'}.
 const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(typeof v.path==='string')for(const k of ['from','to'])if(v[k]!==undefined)check(`${v.path}:${v[k]}`);Object.values(v).forEach(walk);}else check(v);};
 for(const c of script.chapters)for(const l of c.lines)walk([l.shot,l.car,l.labels]);
 for(const layer of Object.values(script.layers??{}))walk(layer.ranges);
 return [...missing];
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
const gentle=u=>.5-.5*Math.cos(Math.PI*clamp(u,0,1));
const lerp=(a,b,k)=>a+(b-a)*k;
const DEG=Math.PI/180;

// A path of [s, x, y, z] samples, closed (a lap) or open.
export class TrackPath{
 constructor(samples,length=null){
  const n=samples.length;this.n=n;this.s=new Float64Array(n);this.x=new Float64Array(n);this.y=new Float64Array(n);this.z=new Float64Array(n);
  samples.forEach((p,i)=>{this.s[i]=p[0];this.x[i]=p[1];this.y[i]=p[2];this.z[i]=p[3];});
  this.length=length??this.s[n-1]+Math.hypot(this.x[0]-this.x[n-1],this.y[0]-this.y[n-1]);
 }
 wrap(s){const L=this.length;return ((s%L)+L)%L;}
 // {x, y, z, hx, hy}: the point s metres along and the heading there (unit, in the plane).
 point(s,out={}){
  s=this.wrap(s);const a=this.s,n=this.n;let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m]<=s)lo=m;else hi=m-1;}
  const j=(lo+1)%n,span=(j?a[j]:this.length)-a[lo],k=span>0?(s-a[lo])/span:0;
  out.x=lerp(this.x[lo],this.x[j],k);out.y=lerp(this.y[lo],this.y[j],k);out.z=lerp(this.z[lo],this.z[j],k);
  const b=this.near(s+4),c=this.near(s-4),dx=b[0]-c[0],dy=b[1]-c[1],d=Math.hypot(dx,dy)||1;out.hx=dx/d;out.hy=dy/d;return out;
 }
 near(s){s=this.wrap(s);const a=this.s,n=this.n;let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m]<=s)lo=m;else hi=m-1;}const j=(lo+1)%n,span=(j?a[j]:this.length)-a[lo],k=span>0?(s-a[lo])/span:0;return [lerp(this.x[lo],this.x[j],k),lerp(this.y[lo],this.y[j],k)];}
 // From a to b going the way dir says (+1 along, -1 against), as distances: the end may pass the lap's line.
 span(a,b,dir=1){const L=this.length;let d=dir>0?b-a:a-b;d=((d%L)+L)%L;return d;}
}

// ---- What is drawn over the track ----
// A band along a stretch of a path, as wide on screen as it needs to be read from the air (min px per metre of
// distance): reveal draws it in from its start; dash runs it as a dashed line flowing in the driving direction.
// It lies on the ground, so buildings, stands and trees in front hide it (low shots crossed the pits with it, user's
// picture 10-21); a faint copy drawn over everything (xray) still hints where it runs behind them.
// Close to the camera (a shot down at the road) it thins to a faint line, or it would cover the road it marks.
const ribbonVertex=`
uniform float width,minWidth;attribute vec3 side;attribute float edge,along;varying float vAlong,vEdge,vDist;
void main(){vec4 w=modelMatrix*vec4(position,1.0);float d=distance(w.xyz,cameraPosition);float hw=max(width*.5*mix(.3,1.0,smoothstep(20.0,160.0,d)),d*minWidth);w.xyz+=side*edge*hw;vAlong=along;vEdge=edge;vDist=d;gl_Position=projectionMatrix*viewMatrix*w;}`;
const ribbonFragment=`
uniform vec3 color;uniform float opacity,reveal,dash,time,pulse,glow,xray;varying float vAlong,vEdge,vDist;
void main(){if(vAlong>reveal)discard;float a=xray*opacity*(1.0-smoothstep(.55,1.0,abs(vEdge)))*mix(.22,1.0,smoothstep(25.0,220.0,vDist));
 if(dash>0.0)a*=.5+.5*step(.4,fract(vAlong/dash-time*.6));
 a*=1.0-pulse*.35*(.5+.5*sin(time*3.4));gl_FragColor=vec4(color*glow,a);}`;
function ribbon(path,ranges,{color='#ffffff',width=8,minWidth=.0048,dash=0,pulse=0,glow=1.6,lift=1}={}){
 const pos=[],side=[],edge=[],along=[],index=[];let run=0,p={};
 for(const [a,b,dir=1] of ranges){
  const len=path.span(a,b,dir),steps=Math.max(2,Math.ceil(len/3)),base=pos.length/3;
  for(let i=0;i<=steps;i++){
   const s=a+dir*len*i/steps;path.point(s,p);const lx=-p.hy*dir,ly=p.hx*dir;
   for(const e of [-1,1]){pos.push(p.x,p.z+lift,-p.y);side.push(lx,0,-ly);edge.push(e);along.push(run+len*i/steps);}
   if(i<steps){const v=base+i*2;index.push(v,v+1,v+2,v+1,v+3,v+2);}
  }
  run+=len;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('side',new THREE.Float32BufferAttribute(side,3));
 g.setAttribute('edge',new THREE.Float32BufferAttribute(edge,1));g.setAttribute('along',new THREE.Float32BufferAttribute(along,1));g.setIndex(index);g.computeBoundingSphere();
 // One set of uniforms for both draws (the layer's opacity, reveal and time move both); each has its own xray.
 const uniforms={color:{value:new THREE.Color(color)},width:{value:width},minWidth:{value:minWidth},opacity:{value:0},reveal:{value:1e9},dash:{value:dash},time:{value:0},pulse:{value:pulse},glow:{value:glow}};
 const material=(xray,depthTest)=>new THREE.ShaderMaterial({vertexShader:ribbonVertex,fragmentShader:ribbonFragment,transparent:true,depthTest,depthWrite:false,side:THREE.DoubleSide,
  polygonOffset:depthTest,polygonOffsetFactor:-2,polygonOffsetUnits:-4,uniforms:{...uniforms,xray:{value:xray}}});
 const mesh=new THREE.Mesh(g,material(1,true));mesh.renderOrder=30;mesh.frustumCulled=false;mesh.userData.length=run;mesh.visible=false;
 const ghost=new THREE.Mesh(g,material(.2,false));ghost.renderOrder=29;ghost.frustumCulled=false;ghost.name='Historia_faixa_atras';mesh.add(ghost);
 return mesh;
}
// Chevrons running along a stretch in its driving direction (dir -1: against the path's own order).
class Arrows{
 constructor(path,ranges,{color='#ffffff',spacing=45,speed=26,size=7}={}){
  this.path=path;this.ranges=ranges;this.spacing=spacing;this.speed=speed;this.size=size;
  this.length=ranges.reduce((sum,[a,b,dir=1])=>sum+path.span(a,b,dir),0);this.count=Math.max(1,Math.floor(this.length/spacing));
  const shape=new THREE.Shape();shape.moveTo(.6,0);shape.lineTo(-.4,.55);shape.lineTo(-.15,0);shape.lineTo(-.4,-.55);shape.closePath();
  const g=new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2);
  this.material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(1.6),transparent:true,depthTest:false,depthWrite:false,opacity:0,side:THREE.DoubleSide,fog:false});
  this.mesh=new THREE.InstancedMesh(g,this.material,this.count);this.mesh.renderOrder=31;this.mesh.frustumCulled=false;this.mesh.visible=false;
  this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();this.v=new THREE.Vector3();this.sc=new THREE.Vector3();this.p={};
 }
 update(time,camera){
  for(let i=0;i<this.count;i++){
   let d=(i*this.spacing+time*this.speed)%this.length,k=0;
   while(k<this.ranges.length-1&&d>this.path.span(this.ranges[k][0],this.ranges[k][1],this.ranges[k][2]??1)){d-=this.path.span(this.ranges[k][0],this.ranges[k][1],this.ranges[k][2]??1);k++;}
   const [a,,dir=1]=this.ranges[k],p=this.path.point(a+dir*d,this.p);
   this.v.set(p.x,p.z+1,-p.y);const far=camera.position.distanceTo(this.v),size=Math.max(this.size,far*.022);
   this.e.set(0,Math.atan2(p.hy*dir,p.hx*dir),0);this.q.setFromEuler(this.e);this.sc.setScalar(size);
   this.m.compose(this.v,this.q,this.sc);this.mesh.setMatrixAt(i,this.m);
  }
  this.mesh.instanceMatrix.needsUpdate=true;
 }
}
// A name over a place, the same size on screen at any distance.
function label(text,{color='#f6f1e3',accent='#e8b23a'}={}){
 const c=document.createElement('canvas'),ctx=c.getContext('2d'),font='700 44px Inter, "Segoe UI", Arial, sans-serif';ctx.font=font;
 const w=Math.ceil(ctx.measureText(text).width)+56,h=96;c.width=w;c.height=h;
 ctx.font=font;ctx.fillStyle='rgba(10,14,13,.78)';ctx.beginPath();ctx.roundRect(4,4,w-8,62,14);ctx.fill();
 ctx.fillStyle=accent;ctx.fillRect(4,4,10,62);ctx.beginPath();ctx.moveTo(w/2-12,66);ctx.lineTo(w/2+12,66);ctx.lineTo(w/2,88);ctx.closePath();ctx.fillStyle='rgba(10,14,13,.78)';ctx.fill();
 ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,30,36);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false,opacity:0,fog:false}));
 s.center.set(.5,0);s.renderOrder=40;s.userData.aspect=w/h;s.visible=false;s.name='Historia_rotulo';return s;
}

// ---- Stevan, the presenter ----
// Drawn last and over everything (a depth pass of his own first): he stands in the camera's frame, lower left,
// beside the picture, wherever the camera flies. He holds the reporter's microphone at his chin (right hand)
// and talks with the left; a fill light of his own (in his material) keeps his face lit against the sun.
// As a TV reporter holds it (user's reference, 10-21), lower so the face shows (user, same day): the right hand
// before the middle of the belly, the elbow by his side, the microphone upright with its head at chest height and the
// flag to the camera. The arm's pose was solved on the rig (hand 26 cm ahead, 1.18 m up); the microphone follows the
// hand but always stands upright, its top tipped a little toward the mouth, whatever the wrist does.
const MIC_HAND=[.28,1.65,.15,.8],MIC_GRIP=new THREE.Vector3(0,-.035,0),MIC_TILT=.1,EYES=1.64;
function microphone(){
 const g=new THREE.Group();g.name='Microfone_reporter';
 const m=(geo,color,extra={})=>new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.2,...extra}));
 const handle=m(new THREE.CylinderGeometry(.0135,.017,.2,14),0x1a1b1d);handle.position.y=.06;
 const ring=m(new THREE.CylinderGeometry(.021,.019,.022,16),0x9aa0a6,{metalness:.8,roughness:.3});ring.position.y=.165;
 const grille=m(new THREE.SphereGeometry(.032,18,12),0x3a3d40,{metalness:.6,roughness:.45});grille.position.y=.2;
 // The flag (canopla) with the game's name on its four faces.
 const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#f4ce39';ctx.fillRect(0,0,256,256);
 ctx.fillStyle='#14211d';ctx.fillRect(0,170,256,86);ctx.font='900 96px Inter, Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AP',128,92);
 ctx.fillStyle='#f4ce39';ctx.font='800 36px Inter, Arial, sans-serif';ctx.fillText('AUTO-POBRE',128,214,236);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const flag=new THREE.Mesh(new THREE.BoxGeometry(.062,.05,.062),[0,1,2,3,4,5].map(i=>new THREE.MeshStandardMaterial(i===2||i===3?{color:0xf4ce39,roughness:.6}:{map:tex,roughness:.6})));flag.position.y=.135;
 g.add(handle,ring,grille,flag);return g;
}
class Presenter{
 constructor(scene){
  const people=createPeople();this.person=people.person(OUTFITS.driver,{shadows:false});this.person.name='Stevan_apresentador';
  this.root=new THREE.Group();this.root.name='Historia_apresentador';this.root.add(this.person);this.root.visible=false;scene.add(this.root);
  this.mic=microphone();this.person.add(this.mic);this.grip=new THREE.Vector3();
  this.pose=clonePose(POSES.stand);this.time=0;this.shown=0;
  const depth=new THREE.MeshBasicMaterial({colorWrite:false,depthFunc:THREE.AlwaysDepth,transparent:true,depthWrite:true});
  const meshes=[];this.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  for(const o of meshes){
   const materials=Array.isArray(o.material)?o.material:[o.material];
   for(const m of materials){m.transparent=true;m.depthWrite=true;m.fog=false;}
   o.renderOrder=991;o.castShadow=false;o.frustumCulled=false;
   const twin=o.isSkinnedMesh?new THREE.SkinnedMesh(o.geometry,depth):new THREE.Mesh(o.geometry,depth);
   if(o.isSkinnedMesh)twin.bind(o.skeleton,o.bindMatrix);
   twin.position.copy(o.position);twin.quaternion.copy(o.quaternion);twin.scale.copy(o.scale);twin.renderOrder=990;twin.frustumCulled=false;twin.name=o.name+'_profundidade';o.parent.add(twin);
  }
  // Fill light on his fabric only: the material of his own people set (createPeople makes one per call).
  const fabric=this.person.getObjectByName('Corpo').material,before=fabric.onBeforeCompile;
  fabric.onBeforeCompile=(shader,renderer)=>{before?.(shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight+=diffuseColor.rgb*.42;\n#include <opaque_fragment>');};
  fabric.customProgramCacheKey=()=>'people-fabric-v3-apresentador';fabric.needsUpdate=true;
  this.v=new THREE.Vector3();this.q=new THREE.Quaternion();this.q2=new THREE.Quaternion();this.e=new THREE.Euler(0,0,0,'YXZ');this.lens=new THREE.Vector3();
 }
 // show 0..1 (slides in from the left edge), talking: the voice is on the line now.
 update(dt,camera,show,talking){
  this.shown+=(show-this.shown)*(1-Math.exp(-dt*5));if(Math.abs(this.shown-show)<.002)this.shown=show;
  this.root.visible=this.shown>.01;if(!this.root.visible)return;
  // In the camera's frame: about 1.5 m of him seen top to bottom (the hips at the bottom edge), in the left third;
  // he slides in from the left edge. His body faces the lens, turned a touch toward the picture on the right.
  const f=1/Math.tan(camera.fov*DEG/2),d=.74*f,halfW=d/f*camera.aspect,x=-halfW*(.62+.5*(1-gentle(this.shown)));
  this.v.set(x,-.74-.92,-d);this.root.position.copy(this.v).applyMatrix4(camera.matrixWorld);
  this.e.set(0,-Math.atan2(d,-x)+.26,0);this.root.quaternion.setFromRotationMatrix(camera.matrixWorld).multiply(this.q2.setFromEuler(this.e));
  this.root.updateMatrixWorld(true);
  // He looks into the lens, at whoever watches (user, 10-21: he seemed to look off the screen): the camera in his own
  // frame (+x ahead, +z his right) gives the head's turn and nod.
  this.lens.copy(camera.position);this.person.worldToLocal(this.lens);
  const ahead=Math.hypot(this.lens.x,this.lens.z),turn=clamp(Math.atan2(-this.lens.z,this.lens.x),-.8,.8),nod=clamp(-Math.atan2(this.lens.y-EYES,ahead),-.35,.35);
  this.time+=dt;const t=this.time,k=1-Math.exp(-dt*8),p=clonePose(POSES.stand);
  p.y=Math.sin(t*1.6)*.006;p.lid=t%3.7<.13?1:0;p.turn=turn;p.head=nod;
  p.arm[1]=MIC_HAND[0];p.elbow[1]=MIC_HAND[1];p.spread[1]=MIC_HAND[2];p.roll[1]=MIC_HAND[3];
  if(talking){p.arm[0]=.28+.16*Math.sin(t*1.9);p.elbow[0]=.9+.4*Math.sin(t*2.7+1);p.spread[0]=.18+.1*Math.sin(t*1.3);p.head+=.03*Math.sin(t*5.1);p.turn+=.04*Math.sin(t*1.2);p.twist=.04*Math.sin(t*.9);}
  else{p.arm[0]=.1;p.elbow[0]=.3;p.head+=.025*Math.max(0,Math.sin(t*2.2));}
  for(const key of ['y','head','turn','twist','lid'])this.pose[key]+=(p[key]-this.pose[key])*(key==='lid'?1:k);
  for(const key of ['arm','elbow','spread','roll'])for(const i of [0,1])this.pose[key][i]+=(p[key][i]-this.pose[key][i])*k;
  applyPose(this.person.userData.rig,this.pose);
  this.root.updateMatrixWorld(true);
  this.person.userData.rig.limbs[1].hand.getWorldPosition(this.grip);this.person.worldToLocal(this.grip);
  this.mic.position.copy(this.grip).add(MIC_GRIP);this.mic.rotation.set(0,0,MIC_TILT);this.mic.updateMatrixWorld(true);
 }
}

// ---- The voice: the browser's ones in the story's language (Windows and Edge have several); a man's by default
// (Stevan presents), any of them by choice, at the story's speed ----
const MALE=/antonio|daniel|thiago|fabio|donato|julio|humberto|valerio|nicolau|leandro|marcelo|guy|andrew|brian|christopher|eric|roger|steffan|davis|tony|jason|ryan|thomas|william|george|mark|david|james|liam|connor|male|masculin/i;
const REGIONS={'pt-BR':['Brasil','Brazil'],'pt-PT':['Portugal','Portugal'],'en-US':['EUA','US'],'en-GB':['Reino Unido','UK'],'en-AU':['Austrália','Australia'],'en-CA':['Canadá','Canada'],'en-IN':['Índia','India'],'en-IE':['Irlanda','Ireland']};
class Narrator{
 constructor(){this.all=[];this.voices=[];this.voice=null;this.lang='pt';this.wanted='';this.rate=1;this.speaking=null;this.onVoices=null;this.synth=typeof speechSynthesis!=='undefined'?speechSynthesis:null;
  if(!this.synth)return;const load=()=>{this.all=this.synth.getVoices();this.refresh();this.onVoices?.();};load();this.synth.addEventListener?.('voiceschanged',load);}
 static score(v,lang){const home=lang==='pt' ? /^pt[-_]BR/i : /^en[-_](US|GB)/i;return (home.test(v.lang)?8:6)+(MALE.test(v.name)?4:0)+(/natural|online|neural/i.test(v.name)?2:0)+(/google/i.test(v.name)?1:0)+(v.localService?0:.5);}
 // The voices of one language (pt: Brazil's first; en: American and British first), the best-sounding first.
 static forLanguage(voices,lang){const re=new RegExp(`^${lang}`,'i');return voices.filter(v=>re.test(v.lang||'')).sort((a,b)=>Narrator.score(b,lang)-Narrator.score(a,lang)||a.name.localeCompare(b.name));}
 static choose(voices,lang='pt'){return Narrator.forLanguage(voices,lang)[0]??null;}
 // "Microsoft Antonio Online (Natural) - Portuguese (Brazil)" → "Antonio · natural · Brasil" (the region in the UI's language).
 static label(v,ui='pt'){const name=v.name.replace(/^Microsoft\s+/i,'').replace(/\s*-\s*[A-Z][a-zçã]+\s*\(.*\)$/i,'').replace(/\s*-\s*(Portug|English).*$/i,'').replace(/\s*Online\s*\(Natural\)/i,' · natural').replace(/^Google\s+(portugu[eê]s|UK English|US English)\s*(d[oe]\s+\w+)?/i,'Google');
  const region=REGIONS[(v.lang||'').replace('_','-')];return `${name} · ${region?region[ui==='en'?1:0]:v.lang}`;}
 refresh(){this.voices=Narrator.forLanguage(this.all,this.lang);this.pick();}
 setLanguage(lang,wanted){this.lang=lang;this.wanted=wanted||'';this.refresh();}
 // The one chosen if this browser has it; else the best one of the language.
 pick(){this.voice=this.voices.find(v=>v.name===this.wanted)??this.voices[0]??null;}
 use(name){this.wanted=name||'';this.pick();}
 get available(){return !!this.voice;}
 speak(line,text=line?.say){if(!this.synth||!this.voice||!text)return false;this.cancel();const u=new SpeechSynthesisUtterance(text);u.voice=this.voice;u.lang=this.voice.lang;u.rate=clamp(1.05*PACE*this.rate,.5,3);u.pitch=1;
  const token={line,done:false,started:false,at:performance.now()};u.onstart=()=>{token.started=true;};u.onend=u.onerror=()=>{token.done=true;if(this.speaking===token)this.speaking=null;};this.speaking=token;this.synth.speak(u);return true;}
 cancel(){if(this.speaking){this.speaking.done=true;this.speaking=null;}this.synth?.cancel();}
 busyWith(line){return !!this.speaking&&!this.speaking.done&&this.speaking.line===line;}
 // The voice sounding now (an engine that never says it started counts after half a second).
 get talking(){const s=this.speaking;return !!s&&!s.done&&(s.started||performance.now()-s.at>500);}
}

// ---- The player ----
const PREFS='autopobre-historia-v1';
const SPEEDS=Object.freeze([.75,1,1.25,1.5,1.75,2]),speedLabel=s=>`${String(s).replace('.',',')}×`;
// The game's music themes (car-audio.js; the recorded songs, or the composed ones when a file is missing).
const MUSICS=Object.freeze(['menu','sponsor','race','none']);
// The story in Portuguese or English (user, 10-21): its words (script.translations), its voice and the player's own.
const LANGS=Object.freeze(['pt','en']);
const TEXTS=Object.freeze({
 pt:{back:'Voltar',backTitle:'Sair da história (Esc)',info:'Saiba mais: vídeos e matérias deste capítulo',zoom:'Ampliar a imagem',ended:'Fim da história.',again:'Ver de novo',leave:'Sair',bar:'Tempo da história',
  play:'Reproduzir (k)',pause:'Pausar (k)',prev:'Capítulo anterior (Page Up)',next:'Próximo capítulo (Page Down)',voice:'Narração em voz (m)',chapters:'Capítulos',cc:'Legendas (c)',gear:'Idioma, voz, velocidade e música',list:'Capítulos e links',full:'Tela cheia (f)',close:'Fechar',
  speed:'Velocidade',normal:'Normal',narrator:'Voz do narrador',hear:'▶ Ouvir',hearTitle:'Ouvir esta voz',music:'Música',musicLevel:'Volume da música',duck:'Música abaixa quando o narrador fala',
  musics:{menu:'Energia',sponsor:'Patrocínio',race:'Corrida',none:'Sem música'},speedNote:s=>s===1?'Velocidade normal':`Velocidade ${speedLabel(s)}`,
  noVoice:'Este navegador não tem voz em português: a narração segue nas legendas.',noVoices:'Nenhuma voz em português neste navegador',sample:'Olá! Esta é a voz que vai contar a história de Interlagos.',video:'Vídeo',more:'Saiba mais'},
 en:{back:'Back',backTitle:'Leave the story (Esc)',info:'Learn more: videos and articles for this chapter',zoom:'Enlarge the picture',ended:'The end.',again:'Watch again',leave:'Leave',bar:'Story time',
  play:'Play (k)',pause:'Pause (k)',prev:'Previous chapter (Page Up)',next:'Next chapter (Page Down)',voice:'Voice narration (m)',chapters:'Chapters',cc:'Captions (c)',gear:'Language, voice, speed and music',list:'Chapters and links',full:'Full screen (f)',close:'Close',
  speed:'Speed',normal:'Normal',narrator:'Narrator voice',hear:'▶ Listen',hearTitle:'Listen to this voice',music:'Music',musicLevel:'Music volume',duck:'Lower the music while the narrator speaks',
  musics:{menu:'Energia',sponsor:'Patrocínio',race:'Race',none:'No music'},speedNote:s=>s===1?'Normal speed':`Speed ${s}×`,
  noVoice:'This browser has no English voice: the narration goes on in the captions.',noVoices:'No English voice in this browser',sample:'Hello! This is the voice that will tell the story of Interlagos.',video:'Video',more:'Learn more'},
});
// The language a story starts in when none was chosen: the browser's (Portuguese, or English for everyone else).
export const defaultLanguage=()=>/^pt/i.test(globalThis.navigator?.language??'pt')?'pt':'en';
const ICONS={
 play:'<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',pause:'<svg viewBox="0 0 24 24"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>',
 next:'<svg viewBox="0 0 24 24"><path d="M6 6.5v11l8.2-5.5zM15.6 6.5h2.4v11h-2.4z"/></svg>',prev:'<svg viewBox="0 0 24 24"><path d="M18 6.5v11l-8.2-5.5zM6 6.5h2.4v11H6z"/></svg>',
 voice:'<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="wave" d="M15 9a4.2 4.2 0 0 1 0 6M17.4 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',
 cc:'<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke-width="2"/><path d="M10.6 10.4a2.4 2.4 0 1 0 0 3.2M16.6 10.4a2.4 2.4 0 1 0 0 3.2" fill="none" stroke-width="1.8"/></svg>',
 list:'<svg viewBox="0 0 24 24"><path d="M4 6h2v2H4zM8 6h12v2H8zM4 11h2v2H4zM8 11h12v2H8zM4 16h2v2H4zM8 16h12v2H8z"/></svg>',
 full:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5v2H6v3zM15 4h5v5h-2V6h-3zM20 15v5h-5v-2h3v-3zM9 20H4v-5h2v3h3z"/></svg>',
 info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/><path d="M11 10.5h2V17h-2zM11 7h2v2h-2z"/></svg>',
 gear:'<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM12 15.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6z"/></svg>',
 back:'<svg viewBox="0 0 24 24"><path d="M15.5 5 8.5 12l7 7" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export class TrackHistory{
 constructor(){
  this.active=false;this.playing=false;this.time=0;this.hold=0;this.timeline=null;this.script=null;this.onExit=null;
  // speed: the whole story's pace, voice included, as a video's playback speed; voices: the one chosen per language
  // ('' = the best one found); lang: 'pt' or 'en'; music: a theme of car-audio.js ('none' = silence); duck: the music
  // gives way to the voice.
  this.focus=new THREE.Vector3();this.dof={focus:60,amount:0};this.narrator=new Narrator();this.prefs={voice:true,captions:true,speed:1,voices:{},lang:null,music:'menu',duck:true};
  try{Object.assign(this.prefs,JSON.parse(localStorage.getItem(PREFS))||{});}catch{}
  if(typeof this.prefs.voiceName==='string'){this.prefs.voices={pt:this.prefs.voiceName,...this.prefs.voices};delete this.prefs.voiceName;}
  if(!LANGS.includes(this.prefs.lang))this.prefs.lang=defaultLanguage();
  // A speed saved before PACE (1.75× of the old normal) would now play at 3×: back to Normal once.
  if(this.prefs.pace!==PACE){this.prefs.speed=1;this.prefs.pace=PACE;}
  this.prefs.speed=SPEEDS.includes(this.prefs.speed)?this.prefs.speed:1;this.narrator.setLanguage(this.prefs.lang,this.prefs.voices?.[this.prefs.lang]);this.narrator.rate=this.prefs.speed;
  this.narrator.onVoices=()=>this.renderSettings();
  this.lastLine=null;this.pose={pos:new THREE.Vector3(),look:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),fov:45};this.tmp={a:{},b:{}};
 }
 savePrefs(){try{localStorage.setItem(PREFS,JSON.stringify(this.prefs));}catch{}}
 t(key){return (TEXTS[this.prefs.lang]??TEXTS.pt)[key];}
 get lang(){return this.prefs.lang;}
 // The story's language, chosen in the player or on the História das Corridas screen: the words, the voice and the
 // player change at once; playing, it goes on from the same line in the other language.
 setLang(lang){
  if(!LANGS.includes(lang))return;const changed=lang!==this.prefs.lang;this.prefs.lang=lang;this.savePrefs();
  this.narrator.cancel();this.narrator.setLanguage(lang,this.prefs.voices?.[lang]);
  if(!this.active||!changed)return;
  const index=lineAt(this.timeline,this.time).index,playing=this.playing,settings=!this.settings.hidden;
  this.timeline=buildTimeline(this.script,lang);for(const s of this.labelSprites.values())s.removeFromParent();this.labelSprites.clear();
  this.root.remove();this.buildDom();this.settings.hidden=!settings;
  this.time=this.timeline.lines[index].start;this.lastLine=null;this.playing=playing;this.root.classList.toggle('paused',!playing);this.renderUi(this.timeline.lines[index],true);
 }
 // script: the circuit's (historia-<id>.js); context: {data (pista.json), oldLayout, media, scene, ghostCar, renderer, camera}.
 // The timeline, the paths and the places, without the page (a Node check samples the camera with this alone).
 prepare(script,context,lang=this.prefs.lang){
  this.script=script;this.ctx=context;this.timeline=buildTimeline(script,lang);this.time=0;this.hold=0;this.lastLine=null;
  const d=context.data,cols=d.columns,ix=cols.indexOf('x_east_m'),iy=cols.indexOf('y_north_m'),iz=cols.indexOf('z_local_m');
  this.paths={new:new TrackPath(d.samples.map(p=>[p[0],p[ix],p[iy],p[iz]]),d.meta.reconstructed_xy_m)};
  const old=context.oldLayout;if(old){const c=old.columns;this.paths.old=new TrackPath(old.samples.map(p=>[p[c.indexOf('s')],p[c.indexOf('x')],p[c.indexOf('y')],p[c.indexOf('z')]]),old.length_m);}
  this.places={new:script.places?.new??{},old:{}};for(const p of old?.points??[])this.places.old[p.name]=p.s??p.s_from;
  return this;
 }
 play(script,context){
  this.stop(false);this.prepare(script,context);
  this.buildLayers();this.presenter??=new Presenter(context.scene);if(this.presenter.root.parent!==context.scene)context.scene.add(this.presenter.root);
  this.buildDom();this.active=true;document.body.classList.add('history-on');this.ctx.audio?.theme(this.prefs.music);this.setPlaying(true);this.showControls();
  if(context.renderer&&context.camera)context.renderer.compileAsync?.(this.presenter.root,context.camera,context.scene).catch(()=>{});
 }
 stop(exit=true){
  if(!this.active)return;this.active=false;this.playing=false;this.narrator.cancel();
  for(const layer of Object.values(this.layers??{})){layer.mesh.removeFromParent();layer.mesh.geometry.dispose();layer.mesh.traverse(o=>o.material?.dispose());}for(const l of this.labelSprites?.values()??[])l.removeFromParent();
  this.layers=null;this.labelSprites=null;if(this.presenter){this.presenter.shown=0;this.presenter.root.visible=false;}
  this.ctx?.ghostCar?.setOpacity(0);this.ctx?.audio?.duck(0);this.ctx?.audio?.theme(null);if(this.onResize)removeEventListener('resize',this.onResize);this.root?.remove();this.root=null;document.body.classList.remove('history-on','history-era-antigo');
  if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
  if(exit)this.onExit?.();
 }
 // A reference to a place: 'new:Ferradura', 'old:Curva 1', 'new:1234', {x, y}.
 at(ref,out={}){
  if(ref&&typeof ref==='object'&&'x' in ref){out.x=ref.x;out.y=ref.y;out.z=ref.z??this.ground(ref.x,ref.y);out.hx=1;out.hy=0;out.path=null;return out;}
  const [pathName,name]=String(ref).split(':'),path=this.paths[pathName]??this.paths.new,table=this.places[pathName]??{};
  const s=name in table?table[name]:Number(name);path.point(Number.isFinite(s)?s:0,out);out.path=path;out.s=Number.isFinite(s)?s:0;return out;
 }
 sOf(ref){const [pathName,name]=String(ref).split(':'),table=this.places[pathName]??{};return name in table?table[name]:Number(name)||0;}
 ground(x,y){
  const t=this.ctx.data.terrain;if(!t)return 0;const fx=(x-t.x0)/t.step,fy=(y-t.y0)/t.step,i=clamp(Math.floor(fx),0,t.nx-2),j=clamp(Math.floor(fy),0,t.ny-2),u=clamp(fx-i,0,1),v=clamp(fy-j,0,1),z=t.z,n=t.nx;
  return lerp(lerp(z[j*n+i],z[j*n+i+1],u),lerp(z[(j+1)*n+i],z[(j+1)*n+i+1],u),v);
 }
 // A camera position {at, h, r, a (compass degrees), dx, dy}: above the place (its road, or the ground).
 spot(p,out){const c=this.at(p.at,out),a=(p.a??0)*DEG,r=p.r??0;out.x=c.x+Math.sin(a)*r+(p.dx??0);out.y=c.y+Math.cos(a)*r+(p.dy??0);out.z=(p.ground?this.ground(out.x,out.y):c.z)+(p.h??0);return out;}
 // The camera of a shot at u (0..1 through it): {pos, look, up, fov} in three.js coordinates.
 shotPose(shot,u,out){
  const e=shot.ease==='linear'?clamp(u,0,1):gentle(u),A=this.tmp.a,B=this.tmp.b;out.up.set(0,1,0);out.fov=lerp(shot.fov??45,shot.fov2??shot.fov??45,e);
  if(shot.orbit){
   const o=shot.orbit,c=this.at(o.at,A),a=lerp(o.from??0,o.to??o.from??0,e)*DEG,r=lerp(o.r,o.r2??o.r,e),h=lerp(o.h,o.h2??o.h,e);
   out.pos.set(c.x+Math.sin(a)*r,c.z+h,-(c.y+Math.cos(a)*r));out.look.set(c.x,c.z+(o.lookH??0),-c.y);
  }else if(shot.ride||shot.along){
   const o=shot.ride??shot.along,path=this.paths[o.path]??this.paths.new,dir=o.dir??1,s0=this.sOf(`${o.path}:${o.from}`),len=path.span(s0,this.sOf(`${o.path}:${o.to}`),dir);
   const s=s0+dir*len*(shot.ride?clamp(u,0,1):e),p=path.point(s-dir*(o.back??14),A),q=path.point(s+dir*(o.ahead??30),B),lx=-p.hy*dir,ly=p.hx*dir;
   out.pos.set(p.x+lx*(o.side??0),p.z+(o.h??5),-(p.y+ly*(o.side??0)));out.look.set(q.x,q.z+(o.lookH??1),-q.y);
  }else if(shot.fly){
   const o=shot.fly,f=this.spot(o.from,A),t=this.spot(o.to??o.from,B);out.pos.set(lerp(f.x,t.x,e),lerp(f.z,t.z,e),-lerp(f.y,t.y,e));
   const l0=this.spot(o.look,A),l1=this.spot(o.look2??o.look,B);out.look.set(lerp(l0.x,l1.x,e),lerp(l0.z,l1.z,e),-lerp(l0.y,l1.y,e));
  }else if(shot.top){
   const o=shot.top,c=this.at(o.at,A),a=lerp(o.a??0,o.a2??o.a??0,e)*DEG,h=lerp(o.h,o.h2??o.h,e),tilt=(o.tilt??8)*DEG;
   out.pos.set(c.x-Math.sin(a)*h*Math.tan(tilt),c.z+h,-(c.y-Math.cos(a)*h*Math.tan(tilt)));out.look.set(c.x,c.z,-c.y);out.up.set(Math.sin(a),0,-Math.cos(a));
  }
  // Never under the ground (a hill between two spots of a fly).
  const floor=this.ground(out.pos.x,-out.pos.z)+2;if(out.pos.y<floor)out.pos.y=floor;
  return out;
 }
 cameraAt(t,out){
  const line=lineAt(this.timeline,t),seg=line.shotSeg;if(!seg){out.pos.set(0,400,0);out.look.set(0,0,0);out.up.set(0,1,0);out.fov=45;return out;}
  const u=(t-seg.start)/Math.max(.001,seg.end-seg.start);this.shotPose(seg.shot,u,out);
  if(seg.prev&&seg.blend>0&&t-seg.start<seg.blend){
   const from=this.shotPose(seg.prev.shot,1,{pos:new THREE.Vector3(),look:new THREE.Vector3(),up:new THREE.Vector3(),fov:45}),k=smooth((t-seg.start)/seg.blend);
   out.pos.lerpVectors(from.pos,out.pos,k);out.look.lerpVectors(from.look,out.look,k);out.up.lerpVectors(from.up,out.up,k).normalize();out.fov=lerp(from.fov,out.fov,k);
  }
  return out;
 }
 // ---- layers ----
 rangesOf(def){
  const path=this.paths[def.path];if(!path)return [];
  if(def.status){const segs=(this.ctx.oldLayout?.segments??[]).filter(s=>[].concat(def.status).includes(s.status));
   return def.path==='old'?segs.map(s=>[s.from_s,s.to_s,1]):segs.filter(s=>Number.isFinite(s.current_from_s)).map(s=>[s.current_from_s,s.current_to_s,s.current_to_s>=s.current_from_s?1:-1]);}
  if(def.ranges)return def.ranges.map(([a,b,dir=1])=>[this.sOf(a),this.sOf(b),dir]);
  return [[0,path.length-.01,1]];
 }
 buildLayers(){
  this.layers={};const scene=this.ctx.scene;
  for(const [name,def] of Object.entries(this.script.layers??{})){
   const path=this.paths[def.path];if(!path)continue;const ranges=this.rangesOf(def);if(!ranges.length)continue;
   const object=def.arrows?new Arrows(path,ranges,def):ribbon(path,ranges,def);
   const mesh=object.mesh??object;scene.add(mesh);this.layers[name]={def,object,mesh,opacity:0};
  }
  this.labelSprites=new Map();
 }
 labelSprite(ref){
  if(!this.labelSprites.has(ref)){const name=String(ref).split(':').slice(1).join(':').replace(/^\d+$/,''),text=this.script.translations?.[this.prefs.lang]?.labels?.[name]??name;const s=label(text||ref,{accent:ref.startsWith('old:')?'#e8913a':'#4fb3ff'});this.ctx.scene.add(s);this.labelSprites.set(ref,s);}
  return this.labelSprites.get(ref);
 }
 updateLayers(t,dt,camera){
  const line=lineAt(this.timeline,t),since=t-line.start,fade=k=>smooth(k/.9);
  for(const [name,layer] of Object.entries(this.layers)){
   const now=line.showNow.includes(name),before=line.prevShow.includes(name);
   const opacity=now?(before?1:fade(since)):(before&&line.show?1-fade(since):0);
   const material=layer.mesh.material;layer.mesh.visible=opacity>.005;material.opacity=opacity*(layer.def.opacity??.9);
   if(material.uniforms){material.uniforms.opacity.value=opacity*(layer.def.opacity??.9);material.uniforms.time.value=t;
    const revealing=line.reveal===name&&!before;material.uniforms.reveal.value=revealing?layer.mesh.userData.length*smooth(since/Math.max(1,line.dur*.85)):1e9;}
   if(layer.object.update&&layer.mesh.visible)layer.object.update(t,camera);
  }
  const f=1/Math.tan(camera.fov*DEG/2),P={};
  const wanted=new Set(line.labelsNow),had=new Set(line.prevLabels);
  for(const ref of new Set([...wanted,...had]))this.labelSprite(ref);
  for(const [ref,sprite] of this.labelSprites){
   const now=wanted.has(ref),before=had.has(ref),opacity=now?(before?1:fade(since)):(before&&line.labels?1-fade(since):0);
   sprite.visible=opacity>.005;if(!sprite.visible)continue;sprite.material.opacity=opacity;
   const p=this.at(ref,P);sprite.position.set(p.x,(p.path?p.z:this.ground(p.x,p.y))+3,-p.y);const h=.052*2/f;sprite.scale.set(h*sprite.userData.aspect,h,1);
  }
 }
 // The ghost Opala on a path through a stretch (the old layout's lap, a reversed run…), fading at the ends.
 updateCar(t,dt){
  const g=this.ctx.ghostCar;if(!g)return;const line=lineAt(this.timeline,t),seg=line.carSeg;
  if(!seg){g.setOpacity(Math.max(0,g.opacity-dt*2));return;}
  const o=seg.car,path=this.paths[o.path]??this.paths.new,dir=o.dir??1,s0=this.sOf(`${o.path}:${o.from}`),len=path.span(s0,this.sOf(`${o.path}:${o.to}`),dir);
  const u=clamp((t-seg.start)/Math.max(.001,seg.end-seg.start),0,1),s=s0+dir*len*u,p=path.point(s,this.tmp.a),q=path.point(s+dir*3,this.tmp.b);
  const heading=Math.atan2(p.hy*dir,p.hx*dir),pitch=-Math.atan2(q.z-p.z,3);
  g.place({x:p.x,y:p.y,z:p.z+.02,heading,pitch,roll:0});g.update(dt);g.detail(this.ctx.camera?.position.distanceTo(g.body.position)??20);g.setPlate(o.plate??'1940');
  const edge=Math.min(t-seg.start,seg.end-t);g.setOpacity(clamp(edge/.6,0,1)*.95);
 }
 // ---- every frame ----
 update(dt,camera){
  if(!this.active)return false;
  if(this.playing){
   const line=lineAt(this.timeline,this.time);let next=this.time+dt*this.prefs.speed;
   // The voice still on this line at its end: the bar waits for it (a few seconds at most).
   if(this.prefs.voice&&this.narrator.busyWith(line)&&next>=line.end-.02&&this.hold<8){this.hold+=dt;next=line.end-.02;}
   else if(next>=line.end)this.hold=0;
   this.time=Math.min(this.timeline.duration,next);
   if(this.time>=this.timeline.duration){this.setPlaying(false);this.ended=true;}
  }
  const line=lineAt(this.timeline,this.time);
  if(line!==this.lastLine){const fresh=this.lastLine===null||line.index===this.lastLine.index+1;this.lastLine=line;this.enterLine(line,fresh);}
  this.cameraAt(this.time,this.pose);camera.position.copy(this.pose.pos);camera.up.copy(this.pose.up);camera.lookAt(this.pose.look);camera.fov=this.pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  this.focus.copy(this.pose.look);this.dof.focus=this.pose.pos.distanceTo(this.pose.look);this.dof.amount=0;
  this.updateLayers(this.time,dt,camera);this.updateCar(this.time,dt);
  const showPresenter=!!(line.image||line.presenter);this.root?.classList.toggle('presenting',showPresenter);
  const voiced=this.prefs.voice&&this.narrator.available,talking=this.playing&&(voiced?this.narrator.talking:this.time-line.start<line.dur*.85);
  this.presenter.update(dt,camera,showPresenter?1:0,showPresenter&&talking);
  // The music steps down while the narrator speaks and comes back up in his silences (pictures, pauses, the end).
  this.ctx.audio?.duck(this.prefs.duck&&voiced&&this.playing&&this.narrator.talking?1:0);
  this.renderUi(line);
  return true;
 }
 enterLine(line,fresh){
  if(this.playing&&this.prefs.voice&&fresh)this.narrator.speak(line);
  const chapter=this.timeline.chapters[line.chapter];document.body.classList.toggle('history-era-antigo',chapter.era==='antigo');
  this.showCaption(line);this.showImage(line);this.showCard(line);this.showTitle(line);
 }
 // ---- playing, pausing, jumping ----
 setPlaying(on){
  if(on&&this.ended){this.seek(0);this.ended=false;}
  this.playing=on;this.root?.classList.toggle('paused',!on);
  if(!on)this.narrator.cancel();
  else if(this.prefs.voice&&this.lastLine){
   // The voice cannot start mid-sentence: the line playing starts again from its beginning.
   const line=lineAt(this.timeline,this.time);if(this.time-line.start>.05){this.time=line.start;}this.narrator.speak(line);this.lastLine=line;
  }
  this.flash(on?'play':'pause');this.renderUi(lineAt(this.timeline,this.time),true);
 }
 toggle(){this.setPlaying(!this.playing);}
 seek(t){
  t=clamp(t,0,this.timeline.duration-.01);const line=lineAt(this.timeline,t);
  // Landing early in a line starts it from its beginning, so the voice says all of it.
  if(t-line.start<line.dur*.35)t=line.start;
  this.time=t;this.hold=0;this.ended=false;this.narrator.cancel();this.lastLine=line;this.enterLine(line,false);
  if(this.playing&&this.prefs.voice&&t===line.start)this.narrator.speak(line);
  this.renderUi(line,true);
 }
 chapterJump(step){const c=chapterAt(this.timeline,this.time),i=clamp(c.index+step,0,this.timeline.chapters.length-1);
  if(step<0&&this.time-c.start>3&&i===c.index-1){this.seek(c.start);return;}this.seek(this.timeline.chapters[i].start);}
 // Keys while the history plays (main.js gives it every key first). True: handled here.
 handleKey(e){
  if(!this.active)return false;const c=e.code;
  // The settings' own controls (a list, the volume) keep their keys; Escape still closes the panel.
  if(['SELECT','INPUT'].includes(e.target?.tagName)&&c!=='Escape')return false;
  if(this.root?.querySelector('.hp-lightbox:not([hidden])')&&['Escape','Space','KeyK','Enter'].includes(c)){this.closeLightbox();return true;}
  if(c==='Escape'){for(const p of [this.panel,this.settings])if(p&&!p.hidden){p.hidden=true;return true;}this.stop();return true;}
  // < and > as on YouTube: the playback speed one step down or up.
  if(e.key==='<'||e.key==='>'){this.setSpeed(SPEEDS[clamp(SPEEDS.indexOf(this.prefs.speed)+(e.key==='>'?1:-1),0,SPEEDS.length-1)]);return true;}
  if(c==='Space'||c==='KeyK'){if(!e.repeat)this.toggle();return true;}
  if(c==='ArrowRight'||c==='KeyL'){this.seek(this.time+(c==='KeyL'?10:5));return true;}
  if(c==='ArrowLeft'||c==='KeyJ'){this.seek(this.time-(c==='KeyJ'?10:5));return true;}
  if(c==='PageDown'||c==='KeyN'&&e.shiftKey){this.chapterJump(1);return true;}
  if(c==='PageUp'||c==='KeyP'&&e.shiftKey){this.chapterJump(-1);return true;}
  if(c==='Home'){this.seek(0);return true;}if(c==='End'){this.seek(this.timeline.duration-1);return true;}
  if(/^(Digit|Numpad)\d$/.test(c)){this.seek(this.timeline.duration*Number(c.slice(-1))/10);return true;}
  if(c==='KeyC'){this.toggleCaptions();return true;}if(c==='KeyM'){this.toggleVoice();return true;}if(c==='KeyF'){this.fullscreen();return true;}
  this.showControls();return false;
 }
 toggleCaptions(){this.prefs.captions=!this.prefs.captions;this.savePrefs();this.renderUi(lineAt(this.timeline,this.time),true);}
 toggleVoice(){this.prefs.voice=!this.prefs.voice;this.savePrefs();if(!this.prefs.voice)this.narrator.cancel();else if(this.playing){const l=lineAt(this.timeline,this.time);this.time=l.start;this.narrator.speak(l);}this.renderUi(lineAt(this.timeline,this.time),true);}
 fullscreen(){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}
 // ---- settings (the ⚙ panel): speed, voice, music ----
 setSpeed(speed){
  this.prefs.speed=speed;this.narrator.rate=speed;this.savePrefs();
  // The sentence playing is said again at the new pace, from its beginning.
  if(this.playing&&this.prefs.voice){const l=lineAt(this.timeline,this.time);this.time=l.start;this.narrator.speak(l);}
  this.flashNote(this.t('speedNote')(speed));this.renderSettings();this.renderUi(lineAt(this.timeline,this.time),true);
 }
 setVoice(name){this.prefs.voices={...this.prefs.voices,[this.prefs.lang]:name};this.narrator.use(name);this.savePrefs();this.preview();this.renderSettings();}
 // A sample of the voice chosen, at the speed chosen (the story waits, paused).
 preview(){if(!this.narrator.available)return;this.pause();this.narrator.speak(null,this.t('sample'));}
 setMusic(theme){this.prefs.music=theme;this.savePrefs();this.ctx.audio?.theme(theme);this.renderSettings();}
 renderSettings(){
  const box=this.settings;if(!box)return;const voices=this.narrator.voices;
  for(const b of box.querySelectorAll('[data-speed]'))b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===this.prefs.speed));
  for(const b of box.querySelectorAll('[data-lang]'))b.setAttribute('aria-pressed',String(b.dataset.lang===this.prefs.lang));
  // The voices of the story's language only (user, 10-21: as before).
  const select=box.querySelector('.hp-voices'),wanted=this.narrator.voice?.name??'';
  select.replaceChildren(...(voices.length?voices.map(v=>new Option(Narrator.label(v,this.prefs.lang),v.name)):[new Option(this.t('noVoices'),'')]));
  select.value=wanted;select.disabled=!voices.length;box.querySelector('.hp-hear').disabled=!voices.length;
  box.querySelector('.hp-musics').value=this.prefs.music;box.querySelector('.hp-duck').checked=this.prefs.duck;
  const level=this.ctx?.audio?.musicVolume?.();if(Number.isFinite(level))box.querySelector('.hp-music-level').value=String(Math.round(level*100));
 }
 pause(){if(this.active&&this.playing)this.setPlaying(false);}
 // For checks: each layer as drawn now (in the scene, shown, how many triangles, its uniforms).
 layerInfo(){return Object.fromEntries(Object.entries(this.layers??{}).map(([k,l])=>{const m=l.mesh,u=m.material.uniforms;
  return [k,{inScene:!!m.parent,visible:m.visible,triangles:(m.geometry.index?.count??0)/3,instances:m.count??null,opacity:u?u.opacity.value:m.material.opacity,reveal:u?.reveal.value??null,length:m.userData.length??null}];}));}
 info(){const line=this.timeline&&lineAt(this.timeline,this.time);return {active:this.active,playing:this.playing,time:this.time,duration:this.timeline?.duration??0,chapter:line?this.timeline.chapters[line.chapter].title:null,line:line?.index??null,
  chapters:this.timeline?.chapters.map(c=>({title:c.title,start:c.start,end:c.end,lines:c.lines.length}))??[],voice:this.narrator.voice?.name??null,voices:this.narrator.voices.map(v=>v.name),voiceOn:this.prefs.voice,captions:this.prefs.captions,
  speed:this.prefs.speed,music:this.prefs.music,duck:this.prefs.duck,talking:this.narrator.talking,lang:this.prefs.lang,caption:line?.text??null,
  layers:Object.fromEntries(Object.entries(this.layers??{}).map(([k,l])=>[k,+l.mesh.material.opacity.toFixed?.(3)||l.mesh.material.uniforms?.opacity.value||0])),presenter:this.presenter?.root.visible??false,image:line?.image??null};}

 // ---- the page ----
 buildDom(){
  const t=this.timeline,root=document.createElement('div'),T=key=>esc(this.t(key)),title=this.script.translations?.[this.prefs.lang]?.title??this.script.title;root.id='historyPlayer';root.className='paused';root.lang=this.prefs.lang==='en'?'en':'pt-BR';
  const chapterMarks=t.chapters.map(c=>`<div class="hp-seg" style="left:${c.start/t.duration*100}%;width:${(c.end-c.start)/t.duration*100}%"><i class="hp-seg-fill"></i><i class="hp-seg-hover"></i></div>`).join('');
  root.innerHTML=`
<div class="hp-click" aria-hidden="true"></div>
<div class="hp-top"><button class="hp-exit" type="button" title="${T('backTitle')}">${ICONS.back}<span>${T('back')}</span></button><div class="hp-heading"><b>${esc(title)}</b><span class="hp-heading-chapter"></span></div>
 <button class="hp-info" type="button" title="${T('info')}" hidden>${ICONS.info}</button></div>
<div class="hp-title" aria-live="polite"><span class="hp-title-eyebrow"></span><h2></h2><p></p></div>
<figure class="hp-image" hidden><div class="hp-image-frame"><button class="hp-image-open" type="button" title="${T('zoom')}"><img alt=""></button><figcaption><b></b><span class="hp-image-text"></span><small class="hp-credit"></small></figcaption></div></figure>
<a class="hp-card" hidden target="_blank" rel="noopener noreferrer"><i>${ICONS.info}</i><span><small></small><b></b></span></a>
<div class="hp-caption" aria-live="polite"><span></span></div>
<div class="hp-center" aria-hidden="true"></div><div class="hp-toast" role="status" hidden></div>
<div class="hp-ended" hidden><p>${T('ended')}</p><button class="hp-again" type="button">${T('again')}</button><button class="hp-leave" type="button">${T('leave')}</button></div>
<div class="hp-bottom">
 <div class="hp-bar" role="slider" tabindex="0" aria-label="${T('bar')}" aria-valuemin="0" aria-valuemax="${Math.round(t.duration)}">${chapterMarks}<div class="hp-scrub"></div><div class="hp-tip" hidden><b></b><span></span></div></div>
 <div class="hp-controls">
  <button class="hp-play" type="button" title="${T('play')}">${ICONS.play}</button>
  <button class="hp-prevch" type="button" title="${T('prev')}">${ICONS.prev}</button><button class="hp-nextch" type="button" title="${T('next')}">${ICONS.next}</button>
  <button class="hp-voice" type="button" title="${T('voice')}">${ICONS.voice}</button>
  <span class="hp-time"></span><button class="hp-chapter" type="button" title="${T('chapters')}"></button>
  <span class="hp-spacer"></span>
  <button class="hp-cc" type="button" title="${T('cc')}">${ICONS.cc}</button><button class="hp-gear" type="button" title="${T('gear')}">${ICONS.gear}</button><button class="hp-list" type="button" title="${T('list')}">${ICONS.list}</button><button class="hp-full" type="button" title="${T('full')}">${ICONS.full}</button>
 </div>
</div>
<aside class="hp-panel" hidden><header><b>${T('chapters')}</b><button class="hp-panel-close" type="button" aria-label="${T('close')}">×</button></header><ol></ol></aside>
<aside class="hp-settings" hidden aria-label="${T('gear')}">
 <div class="hp-set-row"><span>Idioma · Language</span><div class="hp-speeds hp-langs"><button type="button" data-lang="pt">Português</button><button type="button" data-lang="en">English</button></div></div>
 <div class="hp-set-row"><span>${T('speed')}</span><div class="hp-speeds">${SPEEDS.map(s=>`<button type="button" data-speed="${s}">${s===1?T('normal'):speedLabel(s)}</button>`).join('')}</div></div>
 <label class="hp-set-row"><span>${T('narrator')}</span><span class="hp-set-line"><select class="hp-voices"></select><button class="hp-hear" type="button" title="${T('hearTitle')}">${T('hear')}</button></span></label>
 <label class="hp-set-row"><span>${T('music')}</span><select class="hp-musics">${MUSICS.map(id=>`<option value="${id}">${esc(this.t('musics')[id])}</option>`).join('')}</select></label>
 <label class="hp-set-row"><span>${T('musicLevel')}</span><input class="hp-music-level" type="range" min="0" max="100" step="1"></label>
 <label class="hp-set-check"><input class="hp-duck" type="checkbox"> ${T('duck')}</label>
</aside>
<div class="hp-lightbox" hidden><img alt=""><p></p><button type="button" aria-label="${T('close')}">×</button></div>`;
  document.body.append(root);this.root=root;const $=s=>root.querySelector(s);this.$=$;this.panel=$('.hp-panel');this.settings=$('.hp-settings');
  $('.hp-voices').addEventListener('change',e=>this.setVoice(e.target.value));
  $('.hp-musics').addEventListener('change',e=>this.setMusic(e.target.value));
  $('.hp-music-level').addEventListener('input',e=>this.ctx.audio?.setMusicVolume(Number(e.target.value)/100));
  $('.hp-duck').addEventListener('change',e=>{this.prefs.duck=e.target.checked;this.savePrefs();});
  this.renderSettings();
  // Chapters and their links.
  const media=this.ctx.media??{},links=media.links??{};
  $('.hp-panel ol').innerHTML=t.chapters.map((c,i)=>`<li data-chapter="${i}"><button type="button" class="hp-panel-go"><time>${formatTime(c.start)}</time><span><b>${esc(c.title)}</b>${c.years?`<small>${esc(c.years)}</small>`:''}</span></button>${
   c.links.map(id=>links[id]).filter(Boolean).map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="hp-link" data-kind="${esc(l.kind)}">${l.kind==='video'?'▶ ':''}${esc(l.title)}<small>${esc(l.source??'')}</small></a>`).join('')}</li>`).join('');
  root.addEventListener('click',e=>{
   const b=e.target.closest('button,a');if(!b){return;}
   if(b.matches('a'))this.pause();
   if(b.matches('.hp-play'))this.toggle();if(b.matches('.hp-nextch'))this.chapterJump(1);if(b.matches('.hp-prevch'))this.chapterJump(-1);
   if(b.matches('.hp-voice')){if(!this.narrator.available)this.flashNote(this.t('noVoice'));else this.toggleVoice();}
   if(b.matches('[data-lang]')){this.setLang(b.dataset.lang);return;}
   if(b.matches('.hp-cc'))this.toggleCaptions();if(b.matches('.hp-full'))this.fullscreen();
   if(b.matches('.hp-gear')){this.settings.hidden=!this.settings.hidden;this.panel.hidden=true;if(!this.settings.hidden)this.renderSettings();}
   if(b.matches('[data-speed]'))this.setSpeed(Number(b.dataset.speed));if(b.matches('.hp-hear'))this.preview();
   if(b.matches('.hp-list,.hp-chapter,.hp-info')){this.settings.hidden=true;this.panel.hidden=!this.panel.hidden;if(!this.panel.hidden)this.panel.querySelector(`[data-chapter="${chapterAt(t,this.time).index}"]`)?.scrollIntoView({block:'nearest'});}
   if(b.matches('.hp-panel-close'))this.panel.hidden=true;
   if(b.matches('.hp-panel-go')){this.seek(t.chapters[Number(b.closest('li').dataset.chapter)].start);this.panel.hidden=true;}
   if(b.matches('.hp-exit,.hp-leave'))this.stop();if(b.matches('.hp-again')){this.seek(0);this.setPlaying(true);}
   if(b.matches('.hp-image-open'))this.openLightbox();if(b.closest('.hp-lightbox'))this.closeLightbox();
  });
  // A click on the picture: closes an open panel first (as YouTube does), else plays or pauses.
  $('.hp-click').addEventListener('click',()=>{if(this.touchHidden()){this.showControls();return;}if(!this.panel.hidden||!this.settings.hidden){this.panel.hidden=this.settings.hidden=true;return;}this.toggle();});
  $('.hp-click').addEventListener('dblclick',()=>this.fullscreen());
  root.addEventListener('pointermove',()=>this.showControls());
  if(this.onResize)removeEventListener('resize',this.onResize);this.onResize=()=>this.fitImage();addEventListener('resize',this.onResize);
  // The bar: hover shows the chapter and time there, a press (and a drag) jumps.
  const bar=$('.hp-bar'),tip=$('.hp-tip'),at=e=>{const r=bar.getBoundingClientRect();return clamp((e.clientX-r.left)/r.width,0,1)*t.duration;};
  bar.addEventListener('pointermove',e=>{const time=at(e),c=chapterAt(t,time);tip.hidden=false;tip.querySelector('b').textContent=c.title;tip.querySelector('span').textContent=formatTime(time);
   const r=bar.getBoundingClientRect();tip.style.left=`${clamp(e.clientX-r.left,70,r.width-70)}px`;for(const [i,seg] of [...bar.querySelectorAll('.hp-seg')].entries())seg.classList.toggle('hover',i===c.index);});
  bar.addEventListener('pointerleave',()=>{tip.hidden=true;for(const seg of bar.querySelectorAll('.hp-seg'))seg.classList.remove('hover');});
  bar.addEventListener('pointerdown',e=>{bar.setPointerCapture(e.pointerId);this.dragging=true;this.dragTime=at(e);this.renderUi(lineAt(t,this.dragTime),true);});
  bar.addEventListener('pointermove',e=>{if(this.dragging){this.dragTime=at(e);this.renderUi(lineAt(t,this.dragTime),true);}});
  bar.addEventListener('pointerup',e=>{if(!this.dragging)return;this.dragging=false;this.seek(at(e));});
  bar.addEventListener('keydown',e=>{if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.stopPropagation();e.preventDefault();this.seek(this.time+(e.code==='ArrowRight'?5:-5));}});
  this.uiKey='';this.idleAt=performance.now()+2500;
 }
 touchHidden(){return this.root.classList.contains('idle');}
 showControls(){if(!this.root)return;this.root.classList.remove('idle');this.idleAt=performance.now()+2600;}
 flash(kind){const c=this.root?.querySelector('.hp-center');if(!c)return;c.innerHTML=ICONS[kind];c.classList.remove('go');void c.offsetWidth;c.classList.add('go');}
 // A short note over the picture (the speed chosen, no voice here), gone after a moment.
 flashNote(text){const toast=this.$?.('.hp-toast');if(!toast)return;toast.textContent=text;toast.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{toast.hidden=true;},1800);}
 showCaption(line,note=false){const c=this.$?.('.hp-caption');if(!c)return;c.querySelector('span').textContent=line.text??'';c.classList.toggle('note',note);}
 showTitle(line){
  const box=this.$?.('.hp-title');if(!box)return;const chapter=this.timeline.chapters[line.chapter],title=line.title??(line.inChapter===0?{eyebrow:chapter.years,title:chapter.title}:null);
  box.classList.remove('show');clearTimeout(this.titleTimer);if(!title)return;
  box.querySelector('.hp-title-eyebrow').textContent=title.eyebrow??'';box.querySelector('h2').textContent=title.title??'';box.querySelector('p').textContent=title.sub??'';
  void box.offsetWidth;box.classList.add('show');this.titleTimer=setTimeout(()=>box.classList.remove('show'),Math.min(5200,line.dur*1000-300));
 }
 showImage(line){
  // The picture's title and caption in the story's language (credit and licence as they are).
  const fig=this.$?.('.hp-image');if(!fig)return;const base=line.image&&this.ctx.media?.images?.[line.image];
  const image=base&&{...base,...this.ctx.media?.translations?.[this.prefs.lang]?.images?.[line.image]};
  if(!image){fig.hidden=true;fig.dataset.id='';return;}
  if(fig.dataset.id===line.image&&!fig.hidden)return;fig.dataset.id=line.image;
  const img=fig.querySelector('img');img.style.width=img.style.height='';img.onload=()=>this.fitImage();
  img.src=image.src;img.alt=image.title??'';fig.querySelector('b').textContent=image.title??'';fig.querySelector('.hp-image-text').textContent=image.caption??'';
  fig.querySelector('.hp-credit').textContent=[image.credit,image.licence].filter(Boolean).join(' · ');fig.hidden=false;fig.classList.remove('in');void fig.offsetWidth;fig.classList.add('in');
  if(img.complete)this.fitImage();
 }
 // The picture as large as the free space allows (user, 10-21): right of Stevan, under the top bar and the cards,
 // above the captions (historia.css .hp-image is that space); old photos up to twice their size.
 fitImage(){
  const fig=this.$?.('.hp-image'),img=fig?.querySelector('img');if(!img?.naturalWidth||fig.hidden)return;
  const r=fig.getBoundingClientRect(),k=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight,2);
  img.style.width=`${Math.floor(img.naturalWidth*k)}px`;img.style.height=`${Math.floor(img.naturalHeight*k)}px`;
 }
 openLightbox(){const fig=this.$('.hp-image'),box=this.$('.hp-lightbox');if(fig.hidden)return;this.pause();box.querySelector('img').src=fig.querySelector('img').src;box.querySelector('p').textContent=`${fig.querySelector('b').textContent} — ${fig.querySelector('.hp-credit').textContent}`;box.hidden=false;}
 closeLightbox(){this.$('.hp-lightbox').hidden=true;}
 showCard(line){
  const card=this.$?.('.hp-card');if(!card)return;const link=line.card&&this.ctx.media?.links?.[line.card];
  // A card stays its few seconds while the chapter goes on; a jump elsewhere takes it away.
  if(!link){if(!card.hidden&&(performance.now()>this.cardUntil||this.cardChapter!==line.chapter||line.index<this.cardLine))card.hidden=true;return;}
  this.cardChapter=line.chapter;this.cardLine=line.index;
  card.href=link.url;card.querySelector('small').textContent=link.kind==='video'?`${this.t('video')} · ${link.source??''}`:link.source??this.t('more');card.querySelector('b').textContent=link.title;
  card.hidden=false;card.classList.remove('in');void card.offsetWidth;card.classList.add('in');this.cardUntil=performance.now()+8000;
 }
 renderUi(line,force=false){
  const root=this.root;if(!root)return;const t=this.timeline,shown=this.dragging?this.dragTime:this.time;
  if(this.playing&&performance.now()>this.idleAt&&!this.dragging&&this.panel.hidden&&this.settings.hidden)root.classList.add('idle');
  const card=root.querySelector('.hp-card');if(!card.hidden&&performance.now()>this.cardUntil)card.hidden=true;
  const key=`${Math.floor(shown*4)}|${this.playing}|${this.prefs.captions}|${this.prefs.voice}|${this.ended}`;if(key===this.uiKey&&!force)return;this.uiKey=key;
  for(const [i,seg] of [...root.querySelectorAll('.hp-seg')].entries()){const c=t.chapters[i];seg.querySelector('.hp-seg-fill').style.transform=`scaleX(${clamp((shown-c.start)/(c.end-c.start),0,1)})`;}
  root.querySelector('.hp-scrub').style.left=`${shown/t.duration*100}%`;root.querySelector('.hp-bar').setAttribute('aria-valuenow',String(Math.round(shown)));
  root.querySelector('.hp-time').textContent=`${formatTime(shown)} / ${formatTime(t.duration)}`;
  const chapter=t.chapters[lineAt(t,shown).chapter];root.querySelector('.hp-chapter').textContent=`• ${chapter.title} ›`;root.querySelector('.hp-heading-chapter').textContent=chapter.title;
  const play=root.querySelector('.hp-play');play.innerHTML=this.playing?ICONS.pause:ICONS.play;play.title=this.t(this.playing?'pause':'play');
  root.classList.toggle('captions-off',!this.prefs.captions);root.querySelector('.hp-cc').classList.toggle('on',this.prefs.captions);
  root.querySelector('.hp-voice').classList.toggle('on',this.prefs.voice&&this.narrator.available);root.querySelector('.hp-voice').classList.toggle('missing',!this.narrator.available);
  root.querySelector('.hp-ended').hidden=!this.ended;root.querySelector('.hp-info').hidden=!chapter.links.length;
 }
}
