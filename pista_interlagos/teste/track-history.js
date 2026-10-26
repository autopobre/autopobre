import * as THREE from 'three';
import {createPeople,OUTFITS,POSES,clonePose,applyPose} from './pit-crew.js';

// A circuit's history told over its 3D track, played like a video: play, pause, a bar with the chapters marked
// on it to jump to, captions, a narrator's voice (a recorded one, or the browser's own) and Stevan as the presenter,
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
// The pause after a recorded line, in seconds at Normal speed.
export const BREATH=.5;
// The story opens on its title and the first shot before the narrator speaks (user, 10-26: "dá 1 ou 2 segundos antes
// de começar a narração"): the first line's lead, in seconds at Normal speed, before its voice and caption.
export const OPENING=1.5;
// lang: 'pt' (the script's own words) or a language of script.translations (its chapters' titles and lines, in the
// same order: text, say, title); a line's length follows the words of that language.
// voice: a recorded voice of that language (recordedVoice): a line it recorded lasts as long as the recording and a
// breath (a ride given a longer dur keeps it), so the pictures follow that voice line by line.
export function buildTimeline(script,lang='pt',voice=null){
 const chapters=[],lines=[],tr=lang==='pt'?null:script.translations?.[lang];let t=0;
 script.chapters.forEach((c,ci)=>{
  const tc=tr?.chapters?.[c.id];
  const chapter={id:c.id,title:tc?.title??c.title,years:tc?.years??c.years??'',era:c.era??'novo',start:t,lines:[],links:[...(c.links??[])],index:ci};
  c.lines.forEach((l,li)=>{
   const tl=tc?.lines?.[li],text=tl?.text??l.text,say=tl?(tl.say??tl.text):l.say??l.text,clip=voice?.clip(`${c.id}/${li}`,say)??null;
   const lead=lines.length?0:OPENING;
   const dur=lead+(clip?Math.max(2.2,clip.end-clip.start+BREATH,(l.dur??0)/PACE):Math.max(2.2,(l.dur??estimateDuration(say))/PACE));
   const legend=l.legend?.map((item,i)=>({...item,text:tl?.legend?.[i]??item.text}));
   const line={...l,text,say,clip,lead,title:tl?.title??l.title,legend,chapter:ci,index:lines.length,inChapter:li,start:t,dur,end:t+dur};
   if(l.card&&!chapter.links.includes(l.card))chapter.links.push(l.card);
   chapter.lines.push(line);lines.push(line);t+=dur;
  });
  chapter.end=t;chapters.push(chapter);
 });
 // A shot (and the ghost car) lasts until a later line gives another; show until changed. The corners' names add up
 // through a chapter, each staying in view once told (user, 10-21): labels adds, labels:[] clears, labelsOnly replaces;
 // a ride (behind the ghost Opala) toward a named place names it from the start, so it is seen coming.
 let shot=null,car=null,show=[],labels=[],chapter=-1;const named=new Set();
 for(const line of lines){
  line.prevShow=show;line.prevLabels=labels;
  if(line.chapter!==chapter){chapter=line.chapter;named.clear();}
  if(line.shot){shot={shot:line.shot,start:line.start,end:t,prev:shot,blend:line.shot.cut?0:line.shot.blend??1.6};if(shot.prev)shot.prev.end=line.start;}
  const rideCar=line.shot?.ride&&line.car===undefined?{...line.shot.ride}:undefined,wanted=line.car!==undefined?line.car:rideCar;
  if(wanted!==undefined){if(car)car.end=line.start;car=wanted?{car:wanted,start:line.start,end:t}:null;}
  if(line.show)show=line.show;
  if(line.labelsOnly){named.clear();line.labelsOnly.forEach(l=>named.add(l));}
  else if(line.labels){if(!line.labels.length)named.clear();line.labels.forEach(l=>named.add(l));}
  const toward=line.shot?.ride;if(toward&&typeof toward.to==='string'&&Number.isNaN(Number(toward.to)))named.add(`${toward.path}:${toward.to}`);
  labels=[...named];line.shotSeg=shot;line.carSeg=car;line.showNow=show;line.labelsNow=labels;
 }
 return {chapters,lines,duration:t,voice};
}
// A recorded voice (scripts/gerar_narracao.py): the story's lines read by a neural voice into one MP3 (src + '.mp3'),
// meta = its JSON (each line's key '<chapter>/<line>', start and end in seconds, and words). A line is played only
// while its words are still the script's; any other is left to the browser's voice. Named by its file: the same
// neural voice may be recorded at more than one pace.
export function recordedVoice(meta,src){
 const clips=new Map(meta.lines.map(l=>[l.key,l]));
 return {name:`gravada:${src.split('/').pop()}`,label:meta.label,lang:meta.voice.split('-').slice(0,2).join('-'),recorded:true,src,cps:meta.chars/meta.speech,
  clip:(key,say)=>{const c=clips.get(key);return c&&c.say===say?c:null;}};
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
 const missing=new Set(),check=ref=>{if(typeof ref!=='string')return;const [path,name]=ref.split(':');if(name===undefined||/^-?\d+(\.\d+)?$/.test(name))return;const table=path==='old'?{...oldPoints,...script.places?.old}:script.places?.[path];if(!table||!(name in table))missing.add(ref);};
 // A ride, a stretch or a car names its places on its own path: {path:'old', from:'Curva 1', to:'Retão'}.
 const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(typeof v.path==='string')for(const k of ['from','to'])if(v[k]!==undefined)check(`${v.path}:${v[k]}`);Object.values(v).forEach(walk);}else check(v);};
 for(const c of script.chapters)for(const l of c.lines)walk([l.shot,l.car,l.labels,l.labelsOnly]);
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
 // open: a stretch with two ends (a script's drawn path), held at its ends instead of wrapping round like a lap.
 constructor(samples,length=null,open=false){
  const n=samples.length;this.n=n;this.open=open;this.s=new Float64Array(n);this.x=new Float64Array(n);this.y=new Float64Array(n);this.z=new Float64Array(n);
  samples.forEach((p,i)=>{this.s[i]=p[0];this.x[i]=p[1];this.y[i]=p[2];this.z[i]=p[3];});
  this.length=length??this.s[n-1]+Math.hypot(this.x[0]-this.x[n-1],this.y[0]-this.y[n-1]);
 }
 wrap(s){const L=this.length;return this.open?clamp(s,0,L-1e-6):((s%L)+L)%L;}
 // {x, y, z, hx, hy}: the point s metres along and the heading there (unit, in the plane).
 point(s,out={}){
  s=this.wrap(s);const a=this.s,n=this.n;let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m]<=s)lo=m;else hi=m-1;}
  const j=(lo+1)%n,span=(j?a[j]:this.length)-a[lo],k=span>0?(s-a[lo])/span:0;
  out.x=lerp(this.x[lo],this.x[j],k);out.y=lerp(this.y[lo],this.y[j],k);out.z=lerp(this.z[lo],this.z[j],k);
  const b=this.near(s+4),c=this.near(s-4),dx=b[0]-c[0],dy=b[1]-c[1],d=Math.hypot(dx,dy)||1;out.hx=dx/d;out.hy=dy/d;return out;
 }
 near(s){s=this.wrap(s);const a=this.s,n=this.n;let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m]<=s)lo=m;else hi=m-1;}const j=(lo+1)%n,span=(j?a[j]:this.length)-a[lo],k=span>0?(s-a[lo])/span:0;return [lerp(this.x[lo],this.x[j],k),lerp(this.y[lo],this.y[j],k)];}
 // From a to b going the way dir says (+1 along, -1 against), as distances: the end may pass the lap's line.
 span(a,b,dir=1){const L=this.length;let d=dir>0?b-a:a-b;return this.open?clamp(d,0,L):((d%L)+L)%L;}
}

// The bar's previews, in device pixels (16:9).
const THUMB_W=256,THUMB_H=144;

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
// A drawing laid on the ground over a stretch, made from the stretch's own points so it fits the corner (user, 10-21:
// show the Ferradura's U as a horseshoe, the Bico de Pato as the bill of a duck's head): a canvas seen from above, over
// everything. up: the compass bearing that is "up" in the shot showing it (the duck stands upright in that view).
// A drawing may also place things off the road in that shot's frame (metres right and up, the world origin at 0):
// def.figure.extent gives two corners of what it covers, and px a sharper canvas.
const DECAL_SIZE=1024;
function decal(kind,path,ranges,def){
 const pts=[];for(const [a,b,dir=1] of ranges){const len=path.span(a,b,dir),n=Math.max(2,Math.ceil(len/2));for(let i=0;i<=n;i++)pts.push(path.point(a+dir*len*i/n,{}));}
 const up=(def.up??0)*DEG,view=(r,u)=>({x:r*Math.cos(up)+u*Math.sin(up),y:-r*Math.sin(up)+u*Math.cos(up)});
 const all=[...pts,...(def.figure?.extent??[]).flatMap(([r0,u0,r1,u1])=>[view(r0,u0),view(r1,u0),view(r0,u1),view(r1,u1)])];
 const xs=all.map(p=>p.x),ys=all.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 const px=def.px??DECAL_SIZE,size=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))+2*(def.margin??80),k=px/size;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=px;
 const toCanvas=(x,y)=>[(x-cx)*k+px/2,(cy-y)*k+px/2],P=pts.map(p=>toCanvas(p.x,p.y));
 // view: a point of the shot's frame on the canvas; road: the path between two distances, on the canvas.
 const H={view:(r,u)=>{const w=view(r,u);return toCanvas(w.x,w.y);},road:(a,b)=>{const len=b===undefined?path.length:path.span(a,b),n=Math.max(2,Math.ceil(len/2)),p={};
  return Array.from({length:n+1},(_,i)=>{path.point(a+len*i/n,p);return toCanvas(p.x,p.y);});}};
 DRAWINGS[kind](canvas.getContext('2d'),P,k,[Math.sin(up),-Math.cos(up)],def,H);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map,transparent:true,depthTest:false,depthWrite:false,opacity:0,fog:false,toneMapped:false}));
 mesh.position.set(cx,Math.max(...pts.map(p=>p.z))+2,-cy);mesh.renderOrder=32;mesh.frustumCulled=false;mesh.visible=false;mesh.name='Historia_desenho_'+kind;return mesh;
}
// Along a polyline in canvas pixels: its length, a point and direction at a fraction of it, a stretch of it.
function polyline(P){
 const cum=[0];for(let i=1;i<P.length;i++)cum.push(cum[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));const L=cum.at(-1);
 const at=f=>{const d=clamp(f,0,1)*L;let i=1;while(i<P.length-1&&cum[i]<d)i++;const span=cum[i]-cum[i-1]||1,u=(d-cum[i-1])/span,a=P[i-1],b=P[i];
  return {x:lerp(a[0],b[0],u),y:lerp(a[1],b[1],u),dx:(b[0]-a[0])/span,dy:(b[1]-a[1])/span};};
 const part=(f0,f1,steps=80)=>Array.from({length:steps+1},(_,i)=>{const p=at(lerp(f0,f1,i/steps));return [p.x,p.y];});
 return {L,at,part};
}
function strokePath(g,P,width,style){g.beginPath();P.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.lineWidth=width;g.strokeStyle=style;g.stroke();}
// A smooth curve through points (Catmull-Rom as Béziers), added to the current path; closed joins the last to the first.
function smoothPath(g,P,closed=false,start=true){
 const n=P.length,at=i=>closed?P[(i+n)%n]:P[clamp(i,0,n-1)];if(start)g.moveTo(...P[0]);
 for(let i=0;i<(closed?n:n-1);i++){const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
  g.bezierCurveTo(b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,c[0],c[1]);}
}
const DRAWINGS={
 // A steel horseshoe along a U: a dark rim, the brushed face, the fuller with its eight nail holes, a heel at each end.
 horseshoe(g,P,k,up,def){
  const w=(def.width??16)*k,line=polyline(P),steel=g.createLinearGradient(0,0,g.canvas.width,g.canvas.height);
  steel.addColorStop(0,'#e4e8eb');steel.addColorStop(.45,'#9aa3aa');steel.addColorStop(.7,'#d3d8dc');steel.addColorStop(1,'#7d868d');
  g.lineJoin='round';g.lineCap='butt';
  g.save();g.translate(w*.1,w*.14);strokePath(g,P,w*1.04,'rgba(0,0,0,.42)');g.restore();
  strokePath(g,P,w,'#30373c');strokePath(g,P,w*.84,steel);
  strokePath(g,line.part(.05,.95),w*.13,'#4c545a');
  for(const f of [.11,.19,.27,.35,.65,.73,.81,.89]){const p=line.at(f);g.save();g.translate(p.x,p.y);g.rotate(Math.atan2(p.dy,p.dx));g.fillStyle='#1f2427';g.fillRect(-w*.11,-w*.075,w*.22,w*.15);g.fillStyle='rgba(255,255,255,.35)';g.fillRect(-w*.11,-w*.075,w*.22,w*.03);g.restore();}
  for(const f of [0,1]){const p=line.at(f);g.save();g.translate(p.x,p.y);g.rotate(Math.atan2(p.dy,p.dx));g.fillStyle='#454d53';g.fillRect(f?-w*.32:0,-w*.55,w*.32,w*1.1);g.restore();}
 },
 // A cartoon duck with a tuft (user, 10-21: "o pato é imaginação humana", "pato de desenho animado com topete"): the
 // track draws its head and neck (a black line over the road), the whole corner is the bill, and the rest is drawn
 // over the ground in the shot's frame (def.figure, metres right/up): a black-dot eye, the tuft, the body with its
 // wing and tail, the legs and webbed feet. figure.back / bill / front: the road's stretches (back of the neck and
 // the head up to the bill, the bill, the front of the neck).
 duck(g,P,k,up,def,H){
  // The whole circuit marked first, under the duck (user, 10-21: the track well marked, but never over the body); the
  // line that shows it (dim) fades the duck so the circuit comes through and the drawing is seen sitting on it.
  const f=def.figure,ink='#1b1f24',white='rgba(255,255,255,.9)',line=f.line*k,V=([r,u])=>H.view(r,u);
  const back=H.road(...f.back),bill=H.road(...f.bill),front=H.road(...f.front);
  const poly=(pts,closed=true)=>{g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));if(closed)g.closePath();};
  const paint=(fillStyle,width=line)=>{if(fillStyle){g.fillStyle=fillStyle;g.fill();}if(width){g.lineWidth=width;g.strokeStyle=ink;g.stroke();}};
  g.lineJoin='round';g.lineCap='round';
  if(f.track){poly(H.road(0),false);g.lineWidth=f.track.width*k;g.strokeStyle=f.track.color;g.stroke();}
  // Legs and webbed feet first, so the body covers the tops of the legs.
  for(const [hip,heel] of f.legs){
   g.beginPath();g.moveTo(...V(hip));g.lineTo(...V(heel));g.lineWidth=line*2.4;g.strokeStyle=ink;g.stroke();g.lineWidth=line*1.2;g.strokeStyle='#ff9a1f';g.stroke();
   poly(f.foot.map(([r,u])=>V([heel[0]+r,heel[1]+u])));paint('#ff9a1f');
  }
  // The tuft: feathers fanning up from the crown, behind the head's outline.
  for(const tip of f.tuft.tips){
   const a=V(f.tuft.base),b=V(tip),m=[(a[0]+b[0])/2,(a[1]+b[1])/2],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=[-(b[1]-a[1])/len,(b[0]-a[0])/len],w=f.tuft.width*k;
   g.beginPath();g.moveTo(...a);g.quadraticCurveTo(m[0]+n[0]*w,m[1]+n[1]*w,...b);g.quadraticCurveTo(m[0]-n[0]*w,m[1]-n[1]*w,...a);paint(white,line*.8);
  }
  // Body (from the back of the neck round the tail, belly and chest to the front of the neck), then head and neck.
  g.beginPath();smoothPath(g,[back[0],...f.body.map(V),front.at(-1)]);g.closePath();paint(white,0);
  poly([...back,...front]);paint(white,0);
  g.beginPath();smoothPath(g,[back[0],...f.body.map(V),front.at(-1)]);paint(null);
  g.beginPath();smoothPath(g,f.wing.map(V),true);paint('rgba(226,232,238,.95)',line*.85);
  for(const feather of f.wingLines??[]){g.beginPath();smoothPath(g,feather.map(V));paint(null,line*.6);}
  // The road as the head's outline: the back of the neck and the head, the front of the neck.
  poly(back,false);paint(null);poly(front,false);paint(null);
  // The bill: the whole corner, flat cartoon orange, made a little larger than the road and reaching back into the
  // face (billBack metres), with its nostril and the line of the mouth.
  const A=bill[0],B=bill.at(-1),M=[(A[0]+B[0])/2,(A[1]+B[1])/2];let T=A,far=0;for(const p of bill){const d=Math.hypot(p[0]-M[0],p[1]-M[1]);if(d>far){far=d;T=p;}}
  const d=[(T[0]-M[0])/far,(T[1]-M[1])/far],n=up,width=Math.hypot(A[0]-B[0],A[1]-B[1]),pt=(a,b)=>[M[0]+d[0]*a+n[0]*b,M[1]+d[1]*a+n[1]*b];
  const grow=f.billGrow??1,back0=(f.billBack??0)*k,G=([x,y])=>[M[0]+(x-M[0])*grow,M[1]+(y-M[1])*grow];
  const orange=g.createLinearGradient(...pt(0,width*.6),...pt(0,-width*.6));orange.addColorStop(0,'#ffc93c');orange.addColorStop(1,'#ff9416');
  const a=G(A),b=G(B);g.beginPath();bill.forEach((p,i)=>i?g.lineTo(...G(p)):g.moveTo(...G(p)));
  g.bezierCurveTo(b[0]-d[0]*back0,b[1]-d[1]*back0,...pt(-back0*1.25,-width*.15),...pt(-back0*1.25,0));
  g.bezierCurveTo(...pt(-back0*1.25,width*.15),a[0]-d[0]*back0,a[1]-d[1]*back0,...a);paint(orange);
  g.beginPath();g.moveTo(...pt(-back0*.9,-width*.04));g.quadraticCurveTo(...pt(far*.45,-width*.16),...pt(far*grow*.95,-width*.05));paint(null,line*.7);
  g.beginPath();g.ellipse(...pt(far*.3,width*.2),width*.08,width*.04,Math.atan2(d[1],d[0]),0,Math.PI*2);paint(ink,0);
  // The eye: a black dot with a glint.
  const [er,eu,es]=f.eye,e=V([er,eu]),rad=es*k;g.beginPath();g.arc(e[0],e[1],rad,0,Math.PI*2);paint(ink,0);
  g.beginPath();g.arc(e[0]+rad*.35*(d[0]+n[0]),e[1]+rad*.35*(d[1]+n[1]),rad*.32,0,Math.PI*2);paint('#fff',0);
 },
};

// A setting sun for one moment of a story (user, 10-21: the Curva do Sol's sun in the old driver's eyes): a glowing disc
// low over the horizon at a compass bearing, as far as a real one (it keeps its bearing wherever the camera goes);
// the page adds its warm glow over the picture (historia.css .hp-sunglow).
class SettingSun{
 constructor({azimuth=290,elevation=3,size=7}={}){
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),r=g.createRadialGradient(128,128,0,128,128,128);
  r.addColorStop(0,'rgba(255,250,230,1)');r.addColorStop(.18,'rgba(255,236,170,1)');r.addColorStop(.26,'rgba(255,190,90,.95)');r.addColorStop(.45,'rgba(255,140,50,.35)');r.addColorStop(1,'rgba(255,110,40,0)');
  g.fillStyle=r;g.fillRect(0,0,256,256);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  this.mesh=new THREE.Sprite(new THREE.SpriteMaterial({map,color:new THREE.Color(2.6,2.1,1.6),transparent:true,depthTest:false,depthWrite:false,fog:false,opacity:0}));
  this.mesh.renderOrder=28;this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.name='Historia_sol_poente';
  const a=azimuth*DEG,e=elevation*DEG;this.dir=new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e));this.far=1500;this.size=size*DEG;
 }
 update(t,camera){this.mesh.position.copy(camera.position).addScaledVector(this.dir,this.far);const s=2*this.far*Math.tan(this.size/2)*3.2;this.mesh.scale.set(s,s,1);}
}

// Where the ghost car meets the water (user, 10-21: miss the Mergulho and the dive ends in the lake): rings spreading on
// the surface and a burst of spray, all a function of the time since it hit, so seeking back plays it again.
const SPLASH_LIFE=2.8;
class Splash{
 constructor(){
  const soft=document.createElement('canvas');soft.width=soft.height=64;let g=soft.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.45,'rgba(236,244,250,.75)');r.addColorStop(1,'rgba(236,244,250,0)');g.fillStyle=r;g.fillRect(0,0,64,64);
  const ring=document.createElement('canvas');ring.width=ring.height=128;g=ring.getContext('2d');g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=7;g.beginPath();g.arc(64,64,56,0,Math.PI*2);g.stroke();
  this.maps=[soft,ring].map(c=>{const m=new THREE.CanvasTexture(c);m.colorSpace=THREE.SRGBColorSpace;return m;});
  this.root=new THREE.Group();this.root.name='Historia_respingo';this.root.visible=false;
  this.rings=[0,.35,.75].map(delay=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:this.maps[1],transparent:true,depthWrite:false,fog:false}));m.userData.delay=delay;m.renderOrder=33;this.root.add(m);return m;});
  let seed=11;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
  this.drops=Array.from({length:46},()=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.maps[0],transparent:true,depthWrite:false,fog:false}));
   s.userData={a:rnd()*Math.PI*2,out:2+rnd()*7,up:5+rnd()*10,size:1+rnd()*2.2,delay:rnd()*.3};s.renderOrder=34;this.root.add(s);return s;});
 }
 // age: seconds since the car hit the water (negative: not yet); at: where, physics frame.
 update(age,at){
  this.root.visible=age>=0&&age<SPLASH_LIFE;if(!this.root.visible)return;this.root.position.set(at.x,at.z+.06,-at.y);
  for(const m of this.rings){const k=age-m.userData.delay,on=k>0;m.visible=on;if(!on)continue;const s=4+k*12;m.scale.set(s,1,s);m.material.opacity=.85*clamp(1-k/2,0,1);}
  for(const d of this.drops){const u=d.userData,k=age-u.delay,y=u.up*k-4.9*k*k;d.visible=k>0&&y>-.3;if(!d.visible)continue;
   d.position.set(Math.cos(u.a)*u.out*k,Math.max(0,y),-Math.sin(u.a)*u.out*k);const s=u.size*(1+k*.7);d.scale.set(s,s,1);d.material.opacity=.9*clamp(1-k/1.8,0,1);}
 }
 dispose(){this.root.removeFromParent();this.root.traverse(o=>{if(o.isMesh)o.geometry.dispose();o.material?.dispose();});this.maps.forEach(m=>m.dispose());}
}

// A name over a place, the same size on screen at any distance.
function label(text,{color='#f6f1e3',accent='#e8b23a'}={}){
 const c=document.createElement('canvas'),ctx=c.getContext('2d'),font='700 44px Inter, "Segoe UI", Arial, sans-serif';ctx.font=font;
 const w=Math.ceil(ctx.measureText(text).width)+56,h=96;c.width=w;c.height=h;
 // Nearly opaque: a bright band under a name (the Junção's, lit white) must not show through its letters.
 ctx.font=font;ctx.fillStyle='rgba(10,14,13,.93)';ctx.beginPath();ctx.roundRect(4,4,w-8,62,14);ctx.fill();
 ctx.fillStyle=accent;ctx.fillRect(4,4,10,62);ctx.beginPath();ctx.moveTo(w/2-12,66);ctx.lineTo(w/2+12,66);ctx.lineTo(w/2,88);ctx.closePath();ctx.fillStyle='rgba(10,14,13,.93)';ctx.fill();
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

// ---- The voice: the story's recorded ones first (the same in every browser), then the browser's ones in the story's
// language (Windows and Edge have several); a man's by default (Stevan presents), any of them by choice, at the
// story's speed ----
const MALE=/antonio|daniel|thiago|fabio|donato|julio|humberto|valerio|nicolau|leandro|marcelo|guy|andrew|brian|christopher|eric|roger|steffan|davis|tony|jason|ryan|thomas|william|george|mark|david|james|liam|connor|male|masculin/i;
const REGIONS={'pt-BR':['Brasil','Brazil'],'pt-PT':['Portugal','Portugal'],'en-US':['EUA','US'],'en-GB':['Reino Unido','UK'],'en-AU':['Austrália','Australia'],'en-CA':['Canadá','Canada'],'en-IN':['Índia','India'],'en-IE':['Irlanda','Ireland']};
class Narrator{
 constructor(){this.all=[];this.recorded=[];this.story=null;this.voices=[];this.voice=null;this.lang='pt';this.wanted='';this.rate=1;this.speaking=null;this.onVoices=null;this.measured=new Map();this.synth=typeof speechSynthesis!=='undefined'?speechSynthesis:null;
  if(!this.synth)return;const load=()=>{this.all=this.synth.getVoices();this.refresh();this.onVoices?.();};load();this.synth.addEventListener?.('voiceschanged',load);}
 static score(v,lang){const home=lang==='pt' ? /^pt[-_]BR/i : /^en[-_](US|GB)/i;return (home.test(v.lang)?8:6)+(MALE.test(v.name)?4:0)+(/natural|online|neural/i.test(v.name)?2:0)+(/google/i.test(v.name)?1:0)+(v.localService?0:.5);}
 // The voices of one language (pt: Brazil's first; en: American and British first), the best-sounding first.
 static forLanguage(voices,lang){const re=new RegExp(`^${lang}`,'i');return voices.filter(v=>re.test(v.lang||'')).sort((a,b)=>Narrator.score(b,lang)-Narrator.score(a,lang)||a.name.localeCompare(b.name));}
 static choose(voices,lang='pt'){return Narrator.forLanguage(voices,lang)[0]??null;}
 // "Microsoft Antonio Online (Natural) - Portuguese (Brazil)" → "Antonio · natural · Brasil" (the region in the UI's language).
 static label(v,ui='pt'){if(v.recorded)return `${v.label} · ${ui==='en'?'recorded':'gravada'} · ${REGIONS[v.lang]?.[ui==='en'?1:0]??v.lang}`;
  const name=v.name.replace(/^Microsoft\s+/i,'').replace(/\s*-\s*[A-Z][a-zçã]+\s*\(.*\)$/i,'').replace(/\s*-\s*(Portug|English).*$/i,'').replace(/\s*Online\s*\(Natural\)/i,' · natural').replace(/^Google\s+(portugu[eê]s|UK English|US English)\s*(d[oe]\s+\w+)?/i,'Google');
  const region=REGIONS[(v.lang||'').replace('_','-')];return `${name} · ${region?region[ui==='en'?1:0]:v.lang}`;}
 // A language with a recorded voice lists only its recorded ones (user, 10-26: "só mostra a voz do Bob"); the browser's
 // stay behind them as the spare for a line not recorded, and are the list where nothing was recorded (English).
 refresh(){const rec=this.recorded.filter(v=>v.lang.startsWith(this.lang));this.voices=rec.length?rec:Narrator.forLanguage(this.all,this.lang);this.pick();}
 setLanguage(lang,wanted){this.lang=lang;this.wanted=wanted||'';this.refresh();}
 // The one chosen if this browser has it; else the best one of the language (a recorded one starts downloading).
 pick(){this.voice=this.voices.find(v=>v.name===this.wanted)??this.voices[0]??null;if(this.voice?.recorded)this.fetchRecording(this.voice);}
 use(name){this.wanted=name||'';this.pick();}
 get available(){return !!this.voice;}
 // The browser's best voice of the language: it says the lines a recorded voice lacks.
 get spare(){return Narrator.forLanguage(this.all,this.lang)[0]??null;}
 // A story's recorded voices (assets/historia/vozes_<historia>.json; none when it is missing), listed before the
 // browser's ones.
 async loadRecorded(story){
  if(this.story===story)return;this.story=story;let list=[];
  try{const r=await fetch(`./assets/historia/vozes_${story}.json`);if(r.ok)list=await r.json();}catch{}
  const voices=await Promise.all(list.map(async e=>{try{const r=await fetch(`./${e.src}.json`);return r.ok?recordedVoice(await r.json(),e.src):null;}catch{return null;}}));
  if(this.story!==story)return;this.recorded=voices.filter(Boolean);this.refresh();
 }
 // A recorded voice's MP3, downloaded whole once: the lines are played by seeking in it (the local server has no
 // ranges). One <audio> per voice, its pitch kept at other speeds.
 fetchRecording(v){
  v.ready??=fetch(`./${v.src}.mp3`).then(r=>{if(!r.ok)throw new Error(`${v.src}.mp3: ${r.status}`);return r.blob();})
   .then(blob=>{const a=new Audio();a.preload='auto';a.preservesPitch=true;a.src=URL.createObjectURL(blob);v.audio=a;return a;});
  v.ready.catch(()=>{v.failed=true;});return v.ready;
 }
 // The rate a voice reads at, at Normal speed. Windows' own voices (Daniel, Maria: local, not "Natural") are slow at
 // rate 1, and 1.05×PACE suits them — the pace the user approved on 10-21 ("essa velocidade atual ficou boa"): keep it.
 // The online "Natural" voices (Edge) already speak at a natural pace; at that rate they rushed: theirs is 1.15.
 static natural(v){return !!v&&(!v.localService||/natural|online|neural/i.test(v.name));}
 // A recorded voice was read at that pace already (gerar_narracao.py --rate): it plays at the story's speed.
 static baseRate(v){return v?.recorded?1:Narrator.natural(v)?1.15:1.05*PACE;}
 rateFor(v=this.voice){return clamp(Narrator.baseRate(v)*this.rate,.5,3);}
 // How fast a voice really reads (characters a second at rate 1): measured on its finished lines, a guess until then.
 cpsOf(v=this.voice){return v?.recorded?v.cps:this.measured.get(v?.name)??(Narrator.natural(v)?15:13.3);}
 // Characters a second the voice says now, at the speed chosen.
 get pace(){return this.cpsOf()*this.rateFor();}
 speak(line,text=line?.say){
  if(this.voice?.recorded&&line?.clip&&!this.voice.failed)return this.play(line,line.clip,this.voice);
  const voice=this.voice?.recorded?this.spare:this.voice;if(!this.synth||!voice||!text)return false;
  this.cancel();const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang;u.rate=this.rateFor(voice);u.pitch=1;
  const token={line,done:false,started:false,at:performance.now(),chars:text.length,rate:u.rate};
  u.onstart=()=>{token.started=true;token.t0=performance.now();};
  u.onend=u.onerror=e=>{
   // A line read to its end teaches how fast this voice reads (a cut one does not).
   if(!token.cancelled&&e.type==='end'&&token.t0){const secs=(performance.now()-token.t0)/1000;if(secs>1.2&&token.chars>20){const cps=token.chars/secs/token.rate,prev=this.measured.get(voice.name);this.measured.set(voice.name,prev?prev*.7+cps*.3:cps);}}
   token.done=true;if(this.speaking===token)this.speaking=null;};
  this.speaking=token;this.synth.speak(u);return true;}
 // A recorded line: from its start in the voice's MP3 to its end, at the story's speed. A timer from the time left
 // stops it, checked again on the audio's own clock until it gets there (the pause after each line is the margin).
 play(line,clip,voice){
  this.cancel();const token={line,done:false,started:false,at:performance.now(),chars:clip.say.length,rate:this.rateFor(voice)};this.speaking=token;
  token.stop=()=>{if(token.done)return;token.done=true;clearTimeout(token.timer);voice.audio?.pause();if(this.speaking===token)this.speaking=null;};
  this.fetchRecording(voice).then(a=>{
   if(token.done)return;a.playbackRate=token.rate;a.currentTime=clip.start;
   const check=()=>{clearTimeout(token.timer);if(token.done)return;const left=clip.end-a.currentTime;
    if(left<=.02||a.ended)token.stop();else token.timer=setTimeout(check,Math.max(15,left/a.playbackRate*1000-10));};
   a.ontimeupdate=a.onended=check;
   a.play().then(()=>{if(token.done){a.pause();return;}token.started=true;token.t0=performance.now();check();},token.stop);
  },token.stop);
  return true;
 }
 cancel(){const s=this.speaking;if(s){s.cancelled=true;s.stop?.();s.done=true;this.speaking=null;}this.synth?.cancel();}
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
// The language a story starts in when none was chosen: Portuguese, whatever the browser's (user, 10-26: "o padrão tem
// que ser português"; the narrator's recorded voice is Portuguese). English is a choice on the PT/EN buttons.
export const defaultLanguage=()=>'pt';
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
  // A language saved without being chosen (the browser's English, before Portuguese became the default) goes back to
  // the default; one picked on the PT/EN buttons stays.
  if(!LANGS.includes(this.prefs.lang)||!this.prefs.langChosen)this.prefs.lang=defaultLanguage();
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
  if(!LANGS.includes(lang))return;const changed=lang!==this.prefs.lang;this.prefs.lang=lang;this.prefs.langChosen=true;this.savePrefs();
  this.narrator.cancel();this.narrator.setLanguage(lang,this.prefs.voices?.[lang]);
  if(!this.active||!changed)return;
  this.rebuild();
 }
 // The timeline again (another language, another voice) and the page with it, from the start of the same line.
 rebuild(){
  const index=lineAt(this.timeline,this.time).index,playing=this.playing,settings=!this.settings.hidden;
  this.narrator.cancel();this.timeline=buildTimeline(this.script,this.prefs.lang,this.timedVoice());for(const s of this.labelSprites.values())s.removeFromParent();this.labelSprites.clear();
  this.root.remove();this.buildDom();this.settings.hidden=!settings;
  this.time=this.timeline.lines[index].start;this.lastLine=null;this.playing=playing;this.root.classList.toggle('paused',!playing);this.renderUi(this.timeline.lines[index],true);
 }
 // A recorded voice times the story's lines itself; the browser's ones follow the estimate (voiceFollow).
 timedVoice(){return this.narrator.voice?.recorded?this.narrator.voice:null;}
 retime(){if(this.active&&this.timeline.voice!==this.timedVoice())this.rebuild();}
 // A recorded voice this player has not offered yet is chosen once, over a browser voice chosen before.
 offerRecorded(){
  const fresh=this.narrator.voices.find(v=>v.recorded&&!this.prefs.offered?.includes(v.name));if(!fresh)return;
  this.prefs.offered=[...(this.prefs.offered??[]),fresh.name];this.prefs.voices={...this.prefs.voices,[this.prefs.lang]:fresh.name};this.narrator.use(fresh.name);this.savePrefs();
 }
 // script: the circuit's (historia-<id>.js); context: {data (pista.json), oldLayout, media, scene, ghostCar, renderer, camera}.
 // The timeline, the paths and the places, without the page (a Node check samples the camera with this alone).
 prepare(script,context,lang=this.prefs.lang){
  this.script=script;this.ctx=context;this.timeline=buildTimeline(script,lang,this.timedVoice());this.time=0;this.hold=0;this.lastLine=null;
  const d=context.data,cols=d.columns,ix=cols.indexOf('x_east_m'),iy=cols.indexOf('y_north_m'),iz=cols.indexOf('z_local_m');
  this.paths={new:new TrackPath(d.samples.map(p=>[p[0],p[ix],p[iy],p[iz]]),d.meta.reconstructed_xy_m)};
  const old=context.oldLayout;if(old){const c=old.columns;this.paths.old=new TrackPath(old.samples.map(p=>[p[c.indexOf('s')],p[c.indexOf('x')],p[c.indexOf('y')],p[c.indexOf('z')]]),old.length_m);}
  this.places={new:script.places?.new??{},old:{}};for(const p of old?.points??[])this.places.old[p.name]=p.s??p.s_from;
  Object.assign(this.places.old,script.places?.old);
  // A long stretch (the Retão, the Reta Oposta) is named in its middle, not where it begins.
  this.labelMid={old:{}};const L=this.paths.old?.length??1;
  for(const p of old?.points??[])if(Number.isFinite(p.s_from)&&Number.isFinite(p.s_to)){const span=((p.s_to-p.s_from)%L+L)%L;this.labelMid.old[p.name]=(p.s_from+span/2)%L;}
  // A script may set where a corner's label sits (script.labelAt: {path: {name: s}}) apart from its place.
  for(const [path,at] of Object.entries(script.labelAt??{}))Object.assign(this.labelMid[path]??={},at);
  // A script's own stretches (script.paths: {name: {points: [[x, y], …]}}), such as a link of the old track that no
  // lap of it ran: every 4 m along the points, on the ground, or through the air where a point gives its own height
  // ([x, y, z]: a car leaving the road).
  for(const [name,def] of Object.entries(script.paths??{})){this.paths[name]=this.drawnPath(def.points);this.places[name]={...script.places?.[name]};}
  return this;
 }
 drawnPath(points){
  const samples=[];let s=0;
  for(let i=0;i<points.length-1;i++){
   const [x0,y0,z0]=points[i],[x1,y1,z1]=points[i+1],len=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.ceil(len/4)),air=z0!==undefined||z1!==undefined;
   const za=z0??this.ground(x0,y0),zb=z1??this.ground(x1,y1);
   for(let j=i?1:0;j<=n;j++){const x=lerp(x0,x1,j/n),y=lerp(y0,y1,j/n);samples.push([s+len*j/n,x,y,air?lerp(za,zb,j/n):this.ground(x,y)]);}
   s+=len;
  }
  return new TrackPath(samples,s,true);
 }
 play(script,context){
  this.stop(false);this.prepare(script,context);
  this.buildLayers();this.presenter??=new Presenter(context.scene);if(this.presenter.root.parent!==context.scene)context.scene.add(this.presenter.root);
  // The bar's previews: the chapters' first lines first, then every line in order (none without hover).
  const firsts=this.timeline.chapters.map(c=>c.lines[0].index);this.thumbs=new Map();this.thumbTick=0;this.thumbsFrom=performance.now()+2500;this.hoverLine=null;
  this.thumbQueue=matchMedia('(hover: hover)').matches?[...firsts,...this.timeline.lines.map(l=>l.index).filter(i=>!firsts.includes(i))]:[];
  this.buildDom();this.active=true;document.body.classList.add('history-on');this.ctx.audio?.theme(this.prefs.music);this.showControls();
  // The story's recorded voices first (a moment), so the first line is already in the voice that times it; after
  // 1.5 s the story starts anyway and a voice that comes later retimes it from the line playing.
  let started=false;const go=()=>{if(started||!this.active||this.script!==script)return;started=true;if(!this.playing)this.setPlaying(true);};
  this.narrator.loadRecorded(script.id).then(()=>{if(!this.active||this.script!==script)return;this.offerRecorded();this.retime();this.renderSettings();go();});
  setTimeout(go,1500);
  if(context.renderer&&context.camera)context.renderer.compileAsync?.(this.presenter.root,context.camera,context.scene).catch(()=>{});
 }
 stop(exit=true){
  if(!this.active)return;this.active=false;this.playing=false;this.narrator.cancel();
  for(const layer of Object.values(this.layers??{})){layer.mesh.removeFromParent();layer.mesh.geometry.dispose();layer.mesh.traverse(o=>{o.material?.map?.dispose();o.material?.dispose();});}for(const l of this.labelSprites?.values()??[])l.removeFromParent();
  this.splash?.dispose();this.splash=null;this.thumbs=null;this.thumbQueue=null;
  this.layers=null;this.labelSprites=null;if(this.presenter){this.presenter.shown=0;this.presenter.root.visible=false;}
  this.ctx?.ghostCar?.setOpacity(0);this.ctx?.audio?.duck(0);this.ctx?.audio?.theme(null);if(this.onResize)removeEventListener('resize',this.onResize);this.root?.remove();this.root=null;document.body.classList.remove('history-on','history-era-antigo');
  if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
  if(exit)this.onExit?.();
 }
 // A reference to a place: 'new:Ferradura', 'old:Curva 1', 'new:1234', {x, y}. A place off the road (the lake) is
 // named by its {x, y} in the script's places.
 at(ref,out={}){
  if(ref&&typeof ref==='object'&&'x' in ref){out.x=ref.x;out.y=ref.y;out.z=ref.z??this.ground(ref.x,ref.y);out.hx=1;out.hy=0;out.path=null;return out;}
  const [pathName,name]=String(ref).split(':'),path=this.paths[pathName]??this.paths.new,table=this.places[pathName]??{};
  if(typeof table[name]==='object')return this.at(table[name],out);
  const s=name in table?table[name]:Number(name);path.point(Number.isFinite(s)?s:0,out);out.path=path;out.s=Number.isFinite(s)?s:0;return out;
 }
 labelRef(ref){const [path,name]=String(ref).split(':'),mid=this.labelMid?.[path]?.[name];return mid===undefined?ref:`${path}:${mid}`;}
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
   if(def.sun){const sun=new SettingSun(def);scene.add(sun.mesh);this.layers[name]={def,object:sun,mesh:sun.mesh,opacity:0};continue;}
   const path=this.paths[def.path];if(!path)continue;const ranges=this.rangesOf(def);if(!ranges.length)continue;
   const object=def.decal?decal(def.decal,path,ranges,def):def.arrows?new Arrows(path,ranges,def):ribbon(path,ranges,def);
   const mesh=object.mesh??object;scene.add(mesh);this.layers[name]={def,object,mesh,opacity:0};
  }
  this.labelSprites=new Map();
 }
 labelSprite(ref){
  if(!this.labelSprites.has(ref)){const name=String(ref).split(':').slice(1).join(':').replace(/^\d+$/,''),text=this.script.translations?.[this.prefs.lang]?.labels?.[name]??name;const s=label(text||ref,{accent:ref.startsWith('new:')?'#4fb3ff':'#e8913a'});this.ctx.scene.add(s);this.labelSprites.set(ref,s);}
  return this.labelSprites.get(ref);
 }
 updateLayers(t,dt,camera){
  const line=lineAt(this.timeline,t),since=t-line.start,fade=k=>smooth(k/.9),prev=this.timeline.lines[line.index-1];
  // A line's dim: {layer: [from, to, least]} fades that layer through the line (shares of it), down to `least`; the
  // next line takes it on from there.
  const dim=(l,name,u)=>{const d=l?.dim?.[name];return d?lerp(1,d[2],smooth((u-d[0])/(d[1]-d[0]))):1;};
  for(const [name,layer] of Object.entries(this.layers)){
   const now=line.showNow.includes(name),before=line.prevShow.includes(name);
   const opacity=(now?(before?1:fade(since)):(before&&line.show?1-fade(since):0))*(now?dim(line,name,since/line.dur):dim(prev,name,1));
   const material=layer.mesh.material;layer.mesh.visible=opacity>.005;material.opacity=opacity*(layer.def.opacity??.9);
   if(material.uniforms){material.uniforms.opacity.value=opacity*(layer.def.opacity??.9);material.uniforms.time.value=t;
    const revealing=line.reveal===name&&!before;material.uniforms.reveal.value=revealing?layer.mesh.userData.length*smooth(since/Math.max(1,line.dur*.85)):1e9;}
   if(layer.object.update&&layer.mesh.visible)layer.object.update(t,camera);
  }
  // A setting sun's warm glow over the picture, centred where the sun is on screen, stronger as it comes ahead.
  const sun=Object.values(this.layers).find(l=>l.def.sun),glow=this.root?.querySelector('.hp-sunglow');
  if(glow){let a=0;if(sun?.mesh.visible){const v=(this.sunAt??=new THREE.Vector3()).copy(sun.mesh.position).project(camera);
   if(v.z<1){a=sun.mesh.material.opacity*clamp(1.35-Math.hypot(v.x,v.y)*.55,0,1);glow.style.setProperty('--sun-x',`${(v.x+1)*50}%`);glow.style.setProperty('--sun-y',`${(1-v.y)*50}%`);}}
   glow.style.opacity=a.toFixed(3);}
  const f=1/Math.tan(camera.fov*DEG/2),P={};
  const wanted=new Set(line.labelsNow),had=new Set(line.prevLabels);
  for(const ref of new Set([...wanted,...had]))this.labelSprite(ref);
  for(const [ref,sprite] of this.labelSprites){
   const now=wanted.has(ref),before=had.has(ref),opacity=now?(before?1:fade(since)):(before?1-fade(since):0);
   sprite.visible=opacity>.005;if(!sprite.visible)continue;sprite.material.opacity=opacity;
   const p=this.at(this.labelRef(ref),P);sprite.position.set(p.x,p.z+3,-p.y);const h=.052*2/f;sprite.scale.set(h*sprite.userData.aspect,h,1);
  }
 }
 // The ghost Opala on a path through a stretch (the old layout's lap, a reversed run…), fading at the ends.
 updateCar(t,dt){
  const g=this.ctx.ghostCar;if(!g)return;const line=lineAt(this.timeline,t),seg=line.carSeg;
  if(!seg?.car.splash)this.splash?.update(-1);
  if(!seg){g.setOpacity(Math.max(0,g.opacity-dt*2));return;}
  const o=seg.car,path=this.paths[o.path]??this.paths.new,dir=o.dir??1,s0=this.sOf(`${o.path}:${o.from}`),len=path.span(s0,this.sOf(`${o.path}:${o.to}`),dir);
  // until: the share of its time the run takes (then it stays where it ended: a car sunk in the lake).
  const run=o.until??1,raw=(t-seg.start)/Math.max(.001,seg.end-seg.start),u=clamp(raw/run,0,1),s=s0+dir*len*u,p=path.point(s,this.tmp.a),q=path.point(s+dir*3,this.tmp.b);
  const heading=Math.atan2(p.hy*dir,p.hx*dir),pitch=-Math.atan2(q.z-p.z,3);
  this.carPlace={x:p.x,y:p.y,z:p.z+.02,heading,pitch,roll:0};g.place(this.carPlace);g.update(dt);g.detail(this.ctx.camera?.position.distanceTo(g.body.position)??20);g.setPlate(o.plate??'1940');
  const edge=Math.min(t-seg.start,seg.end-t);g.setOpacity(clamp(edge/.6,0,1)*.95);
  // splash: the water's level; the spray starts where the run first goes under it.
  if(o.splash!==undefined){
   if(!seg.hit){let d=0;const w={};while(d<len&&path.point(s0+dir*d,w).z>o.splash)d+=.5;path.point(s0+dir*d,w);seg.hit={u:d/Math.max(.001,len),at:{x:w.x,y:w.y,z:o.splash}};}
   if(!this.splash){this.splash=new Splash();this.ctx.scene.add(this.splash.root);}
   this.splash.update((raw-seg.hit.u*run)*(seg.end-seg.start),seg.hit.at);
  }
 }
 // ---- the bar's previews (user, 10-21: a small picture on hover, like a video's) ----
 // The story is a function of time, so any moment can be drawn: one line at a time, every few frames, the scene set
 // to that moment and drawn in a corner of the canvas before the frame's own render covers it, copied out at once;
 // the frame's update then sets everything back. The line under the pointer goes first. Only where there is a pointer
 // to hover with.
 makeThumb(){
  const r=this.ctx.renderer,queue=this.thumbQueue;if(!r||!queue?.length||document.hidden)return;
  if(this.hoverLine!=null&&!this.thumbs.has(this.hoverLine)){const i=queue.indexOf(this.hoverLine);if(i>0){queue.splice(i,1);queue.unshift(this.hoverLine);}}
  const index=queue.shift(),line=this.timeline.lines[index],t=line.start+line.dur*.6,main=this.ctx.camera;
  const cam=this.thumbCam??=new THREE.PerspectiveCamera(45,THUMB_W/THUMB_H,.5,20000),pose=this.thumbPose??={pos:new THREE.Vector3(),look:new THREE.Vector3(),up:new THREE.Vector3(),fov:45};
  this.cameraAt(t,pose);cam.near=main.near;cam.far=main.far;cam.fov=pose.fov;cam.position.copy(pose.pos);cam.up.copy(pose.up);cam.lookAt(pose.look);cam.updateProjectionMatrix();cam.updateMatrixWorld();
  const g=this.ctx.ghostCar,carPlace=this.carPlace,carOpacity=g?.opacity,shown=this.presenter.root.visible;
  this.updateLayers(t,0,cam);this.updateCar(t,0);this.presenter.root.visible=false;
  const pr=r.getPixelRatio(),vp=r.getViewport(new THREE.Vector4()),sc=r.getScissor(new THREE.Vector4()),scissor=r.getScissorTest(),target=r.getRenderTarget();
  r.setRenderTarget(null);r.setViewport(0,0,THUMB_W/pr,THUMB_H/pr);r.setScissor(0,0,THUMB_W/pr,THUMB_H/pr);r.setScissorTest(true);r.render(this.ctx.scene,cam);
  const canvas=document.createElement('canvas');canvas.width=THUMB_W;canvas.height=THUMB_H;const c=canvas.getContext('2d');
  if(this.timeline.chapters[line.chapter].era==='antigo')c.filter='sepia(.4) saturate(.86)';
  c.drawImage(r.domElement,0,r.domElement.height-THUMB_H,THUMB_W,THUMB_H,0,0,THUMB_W,THUMB_H);
  r.setViewport(vp);r.setScissor(sc);r.setScissorTest(scissor);r.setRenderTarget(target);
  if(g){if(carPlace)g.place(carPlace);g.setOpacity(carOpacity);}this.presenter.root.visible=shown;
  this.thumbs.set(index,canvas);if(this.hoverLine===index)this.drawThumb(index);
 }
 drawThumb(index){
  const c=this.$?.('.hp-thumb')?.getContext('2d');if(!c)return;const thumb=this.thumbs?.get(index);
  if(thumb)c.drawImage(thumb,0,0);else{c.fillStyle='#000';c.fillRect(0,0,THUMB_W,THUMB_H);}
 }
 // ---- every frame ----
 update(dt,camera){
  if(!this.active)return false;
  if(this.thumbQueue?.length&&performance.now()>this.thumbsFrom&&++this.thumbTick%3===0)this.makeThumb();
  if(this.playing){
   // The story keeps the narrator's pace: the voice heard reads at its own speed (measured), the timings assume
   // CHARS_PER_SECOND×PACE; the camera and the bar follow the voice instead of waiting for it at each line's end.
   const line=lineAt(this.timeline,this.time),follow=this.prefs.voice&&this.narrator.available?this.voiceFollow():1;let next=this.time+dt*this.prefs.speed*follow;
   // The voice still on this line at its end: the bar waits for it (a few seconds at most).
   if(this.prefs.voice&&this.narrator.busyWith(line)&&next>=line.end-.02&&this.hold<8){this.hold+=dt;next=line.end-.02;}
   else if(next>=line.end)this.hold=0;
   this.time=Math.min(this.timeline.duration,next);
   if(this.time>=this.timeline.duration){this.setPlaying(false);this.ended=true;}
  }
  const line=lineAt(this.timeline,this.time);
  if(line!==this.lastLine){const fresh=this.lastLine===null||line.index===this.lastLine.index+1;this.lastLine=line;this.enterLine(line,fresh);}
  // The lead over: the held words come in.
  if(this.waiting===line&&!this.inLead(line)){this.waiting=null;this.showCaption(line);if(this.playing&&this.prefs.voice)this.narrator.speak(line);}
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
 voiceFollow(){return this.timeline?.voice&&this.timeline.voice===this.narrator.voice?1:clamp(this.narrator.pace/(CHARS_PER_SECOND*PACE*this.prefs.speed),.5,1.4);}
 // A line in its lead (the opening's pause) holds its words: no caption, no voice until the lead is over.
 inLead(line){return !!line?.lead&&this.time<line.start+line.lead;}
 say(line){if(this.inLead(line)){this.narrator.cancel();this.waiting=line;return;}this.narrator.speak(line);}
 enterLine(line,fresh){
  this.waiting=this.inLead(line)?line:null;
  if(this.playing&&this.prefs.voice&&fresh)this.say(line);
  const chapter=this.timeline.chapters[line.chapter];document.body.classList.toggle('history-era-antigo',chapter.era==='antigo');
  this.showCaption(this.waiting===line?{text:''}:line);this.showImage(line);this.showCard(line);this.showTitle(line);this.showLegend(line);
 }
 // ---- playing, pausing, jumping ----
 setPlaying(on){
  if(on&&this.ended){this.seek(0);this.ended=false;}
  this.playing=on;this.root?.classList.toggle('paused',!on);
  if(!on)this.narrator.cancel();
  else if(this.prefs.voice&&this.lastLine){
   // The voice cannot start mid-sentence: the line playing starts again from its beginning.
   const line=lineAt(this.timeline,this.time);if(this.time-line.start>.05){this.time=line.start;}if(this.inLead(line))this.enterLine(line,false);else this.say(line);this.lastLine=line;
  }
  this.flash(on?'play':'pause');this.renderUi(lineAt(this.timeline,this.time),true);
 }
 toggle(){this.setPlaying(!this.playing);}
 seek(t){
  t=clamp(t,0,this.timeline.duration-.01);const line=lineAt(this.timeline,t);
  // Landing early in a line starts it from its beginning, so the voice says all of it.
  if(t-line.start<line.dur*.35)t=line.start;
  this.time=t;this.hold=0;this.ended=false;this.narrator.cancel();this.lastLine=line;this.enterLine(line,false);
  if(this.playing&&this.prefs.voice&&t===line.start)this.say(line);
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
 toggleVoice(){this.prefs.voice=!this.prefs.voice;this.savePrefs();if(!this.prefs.voice)this.narrator.cancel();else if(this.playing){const l=lineAt(this.timeline,this.time);this.time=l.start;this.say(l);}this.renderUi(lineAt(this.timeline,this.time),true);}
 fullscreen(){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}
 // ---- settings (the ⚙ panel): speed, voice, music ----
 setSpeed(speed){
  this.prefs.speed=speed;this.narrator.rate=speed;this.savePrefs();
  // The sentence playing is said again at the new pace, from its beginning.
  if(this.playing&&this.prefs.voice){const l=lineAt(this.timeline,this.time);this.time=l.start;this.say(l);}
  this.flashNote(this.t('speedNote')(speed));this.renderSettings();this.renderUi(lineAt(this.timeline,this.time),true);
 }
 setVoice(name){this.prefs.voices={...this.prefs.voices,[this.prefs.lang]:name};this.narrator.use(name);this.savePrefs();this.retime();this.preview();this.renderSettings();}
 // A sample of the voice chosen, at the speed chosen (the story waits, paused): a recorded voice says the first line.
 preview(){if(!this.narrator.available)return;this.pause();this.narrator.speak(this.narrator.voice.recorded?this.timeline.lines[0]:null,this.t('sample'));}
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
  speed:this.prefs.speed,music:this.prefs.music,duck:this.prefs.duck,talking:this.narrator.talking,lang:this.prefs.lang,caption:line?.text??null,thumbs:this.thumbs?.size??0,thumbsLeft:this.thumbQueue?.length??0,
  voiceRate:this.narrator.voice?this.narrator.rateFor():null,voiceNatural:Narrator.natural(this.narrator.voice),voiceCps:this.narrator.voice?+this.narrator.cpsOf().toFixed(2):null,follow:+this.voiceFollow().toFixed(3),
  recorded:!!this.narrator.voice?.recorded,timedBy:this.timeline?.voice?.name??null,clip:line?.clip?[line.clip.start,line.clip.end]:null,audioAt:this.narrator.voice?.audio?.currentTime??null,
  layers:Object.fromEntries(Object.entries(this.layers??{}).map(([k,l])=>[k,+l.mesh.material.opacity.toFixed?.(3)||l.mesh.material.uniforms?.opacity.value||0])),presenter:this.presenter?.root.visible??false,image:line?.image??null};}

 // ---- the page ----
 buildDom(){
  const t=this.timeline,root=document.createElement('div'),T=key=>esc(this.t(key)),title=this.script.translations?.[this.prefs.lang]?.title??this.script.title;root.id='historyPlayer';root.className='paused';root.lang=this.prefs.lang==='en'?'en':'pt-BR';
  const chapterMarks=t.chapters.map(c=>`<div class="hp-seg" style="left:${c.start/t.duration*100}%;width:${(c.end-c.start)/t.duration*100}%"><i class="hp-seg-fill"></i><i class="hp-seg-hover"></i></div>`).join('');
  root.innerHTML=`
<div class="hp-sunglow" aria-hidden="true"></div><div class="hp-click" aria-hidden="true"></div>
<div class="hp-top"><button class="hp-exit" type="button" title="${T('backTitle')}">${ICONS.back}<span>${T('back')}</span></button><div class="hp-heading"><b>${esc(title)}</b><span class="hp-heading-chapter"></span></div>
 <button class="hp-info" type="button" title="${T('info')}" hidden>${ICONS.info}</button></div>
<div class="hp-title" aria-live="polite"><span class="hp-title-eyebrow"></span><h2></h2><p></p></div>
<figure class="hp-image" hidden><div class="hp-image-frame"><button class="hp-image-open" type="button" title="${T('zoom')}"><img alt=""></button><figcaption><b></b><span class="hp-image-text"></span><small class="hp-credit"></small></figcaption></div></figure>
<a class="hp-card" hidden target="_blank" rel="noopener noreferrer"><i>${ICONS.info}</i><span><small></small><b></b></span></a>
<div class="hp-legend" hidden></div>
<div class="hp-caption" aria-live="polite"><span></span></div>
<div class="hp-center" aria-hidden="true"></div><div class="hp-toast" role="status" hidden></div>
<div class="hp-ended" hidden><p>${T('ended')}</p><button class="hp-again" type="button">${T('again')}</button><button class="hp-leave" type="button">${T('leave')}</button></div>
<div class="hp-bottom">
 <div class="hp-bar" role="slider" tabindex="0" aria-label="${T('bar')}" aria-valuemin="0" aria-valuemax="${Math.round(t.duration)}">${chapterMarks}<div class="hp-scrub"></div><div class="hp-tip" hidden><canvas class="hp-thumb" width="${THUMB_W}" height="${THUMB_H}"></canvas><b></b><span></span></div></div>
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
  bar.addEventListener('pointermove',e=>{const time=at(e),c=chapterAt(t,time),line=lineAt(t,time);tip.hidden=false;tip.querySelector('b').textContent=c.title;tip.querySelector('span').textContent=formatTime(time);
   if(line.index!==this.hoverLine){this.hoverLine=line.index;this.drawThumb(line.index);}
   const r=bar.getBoundingClientRect();tip.style.left=`${clamp(e.clientX-r.left,104,r.width-104)}px`;for(const [i,seg] of [...bar.querySelectorAll('.hp-seg')].entries())seg.classList.toggle('hover',i===c.index);});
  bar.addEventListener('pointerleave',()=>{tip.hidden=true;this.hoverLine=null;for(const seg of bar.querySelectorAll('.hp-seg'))seg.classList.remove('hover');});
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
 // A line's colour key (user, 10-21): [{layer, text}], each swatch in its layer's colour.
 showLegend(line){
  const box=this.$?.('.hp-legend');if(!box)return;const items=line.legend??[],key=items.map(i=>i.text).join('|');
  if(!items.length){box.hidden=true;box.dataset.key='';return;}
  if(box.dataset.key===key&&!box.hidden)return;box.dataset.key=key;
  box.innerHTML=items.map(i=>{const c=esc(i.color??this.script.layers?.[i.layer]?.color??'#fff');return `<span><i style="background:${c};color:${c}"></i>${esc(i.text)}</span>`;}).join('');
  box.hidden=false;box.classList.remove('in');void box.offsetWidth;box.classList.add('in');
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
