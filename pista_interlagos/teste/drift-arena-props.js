// Arena de Drift, what the layout puts on the floor, drawn: cones and tyre stacks (instanced, posed from the props
// drift-arena-world.js knocks about), tyre walls, concrete blocks, the round islands and the crescent planters with
// their kerbs and grass, the clips' poles and the start gate; and one paint layer over the whole floor (the zones'
// yellow bands, the clips' marks, the start line, the cones' spots, the arena's logo and years of old tyre marks).
// Rebuilt whenever the layout changes. Plan (x east, y north) to scene (x, height, -y).
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ARENA,ITEM_KINDS,MEIA_LUA,ILHA,ZONE_WIDTH,GATE_WIDTH,floorEdge} from './drift-arena.js';
import {JERSEY} from './street-walls.js';

// The asphalt is drawn 3.5 cm over the track file's height (the car's wheels stand at +5.5 cm, physics.js sample).
export const FLOOR_Y=.035;
const MAX_CONES=96,MAX_STACKS=96;
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const seeded=seed=>{let x=seed%2147483647||1;return ()=>(x=x*16807%2147483647)/2147483647;};

function coneGeometry(){
 // A 70 cm traffic cone on its square rubber base: orange with two white reflective bands.
 const profile=[[0,.0],[.16,.0],[.16,.035],[.135,.035],[.118,.12],[.03,.70],[0,.70]].map(([r,h])=>new THREE.Vector2(r,h));
 const body=new THREE.LatheGeometry(profile,20),base=new THREE.BoxGeometry(.38,.035,.38).translate(0,.0175,0);
 const paint=(g,fn)=>{const p=g.attributes.position,c=new Float32Array(p.count*3);for(let i=0;i<p.count;i++)c.set(fn(p.getY(i),p.getX(i),p.getZ(i)),i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');return g;};
 const orange=[1,.22,.03],white=[.92,.92,.88],black=[.05,.05,.05];
 paint(body,y=>y<.04?black:(y>.26&&y<.36)||(y>.45&&y<.52)?white:orange);paint(base,()=>black);
 const g=mergeGeometries([body.toNonIndexed(),base.toNonIndexed()]);g.computeVertexNormals();return g;
}
function stackGeometry(count=3){
 // Old car tyres (62 cm, 20 cm wide) stacked, each a little off the one under it.
 const parts=[];for(let k=0;k<count;k++){const t=new THREE.TorusGeometry(.235,.098,8,22).rotateX(Math.PI/2).scale(1,1.05,1);t.translate((hash(k*3+1)-.5)*.05,.1+k*.2,(hash(k*3+2)-.5)*.05);parts.push(t);}
 return mergeGeometries(parts);
}
// A ring strip (r0..r1) from angle a0 over span radians at height y, as triangles; colour(i) per segment.
function ringStrip(cx,cy,r0,r1,a0,span,y,segments,colour,lift=0){
 const pos=[],col=[],idx=[];
 for(let k=0;k<=segments;k++){const a=a0+span*k/segments,c=Math.cos(a),s=Math.sin(a);pos.push(cx+c*r0,y,-(cy+s*r0),cx+c*r1,y+lift,-(cy+s*r1));const rgb=colour(Math.min(k,segments-1));col.push(...rgb,...rgb);if(k){const b=(k-1)*2;idx.push(b,b+1,b+2,b+1,b+3,b+2);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
 return g.toNonIndexed();
}
// A raised kerb ring: red and white blocks of about 1 m, a rounded top 3 cm up (drift-arena-world.js KERB_LIFT).
function kerbRing(cx,cy,r0,r1,a0,span){
 const segments=Math.max(8,Math.round(span*(r0+r1)/2/.5)),pos=[],col=[],idx=[],rows=[[r0,0],[r0+(r1-r0)*.25,.03],[r0+(r1-r0)*.75,.03],[r1,0]];
 for(let k=0;k<=segments;k++){
  const a=a0+span*k/segments,c=Math.cos(a),s=Math.sin(a),block=Math.floor(k*span*(r0+r1)/2/segments/1.0),rgb=block%2?[.93,.92,.88]:[.78,.08,.06];
  for(const [r,h] of rows){pos.push(cx+c*r,FLOOR_Y+h,-(cy+s*r));col.push(...rgb);}
  if(k)for(let j=0;j<3;j++){const b=(k-1)*4+j;idx.push(b,b+1,b+4,b+1,b+5,b+4);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
// The arc of grass of an island (disc) or planter: a fan or a band, the texture in world metres.
function grassPatch(cx,cy,r0,r1,a0,span,segments){
 const g=ringStrip(cx,cy,r0,r1,a0,span,FLOOR_Y+.03,segments,()=>[1,1,1]),p=g.attributes.position,uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)/4;uv[i*2+1]=p.getZ(i)/4;}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.deleteAttribute('color');g.computeVertexNormals();return g;
}

function signTexture(text){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=80;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#172b27';ctx.fillRect(0,0,1024,80);ctx.fillStyle='#ffdb32';ctx.font='bold 54px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,42,980);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
export class ArenaProps{
 constructor({textures,mobile=false}={}){
  this.root=new THREE.Group();this.root.name='Arena_itens';this.mobile=mobile;this.textures=textures;
  this.materials={
   cone:new THREE.MeshStandardMaterial({name:'Cone',vertexColors:true,roughness:.55}),
   rubber:new THREE.MeshStandardMaterial({name:'Pneu_borracha',color:0x161616,roughness:.88}),
   kerb:new THREE.MeshStandardMaterial({name:'Zebra_pintada',vertexColors:true,roughness:.6}),
   grass:new THREE.MeshStandardMaterial({name:'Grama_canteiro',map:textures?.grass??null,color:textures?.grass?0xb9c7a0:0x4f7a35,roughness:.95}),
   concrete:new THREE.MeshStandardMaterial({name:'Concreto',map:textures?.concrete??null,color:0xc9c4b8,roughness:.9}),
   steel:new THREE.MeshStandardMaterial({name:'Portico_metal',color:0x2b3034,metalness:.5,roughness:.5}),
   pole:new THREE.MeshStandardMaterial({name:'Poste_clipe',vertexColors:true,roughness:.5}),
   paint:new THREE.MeshStandardMaterial({name:'Pintura_arena',transparent:true,depthWrite:false,roughness:.62,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),
   flag:new THREE.MeshStandardMaterial({name:'Bandeira_arena',color:0xe8702a,roughness:.7,side:THREE.DoubleSide}),
   shrub:new THREE.MeshStandardMaterial({name:'Arbusto',color:0x3f5f2a,roughness:.95})
  };
  this.cones=new THREE.InstancedMesh(coneGeometry(),this.materials.cone,MAX_CONES);this.cones.name='Cones';
  this.stacks=new THREE.InstancedMesh(stackGeometry(),this.materials.rubber,MAX_STACKS);this.stacks.name='Pilhas_pneus';
  for(const m of [this.cones,this.stacks]){m.castShadow=true;m.receiveShadow=true;m.count=0;m.frustumCulled=false;this.root.add(m);}
  this.static=new THREE.Group();this.static.name='Arena_itens_fixos';this.root.add(this.static);
  // The paint over the floor: one canvas for the whole rounded rectangle, ~4 cm a pixel (8 on phones).
  const w=mobile?2048:4096,h=Math.round(w*ARENA.halfWidth/ARENA.halfLength);
  this.canvas=document.createElement('canvas');this.canvas.width=w;this.canvas.height=h;
  this.paintMap=new THREE.CanvasTexture(this.canvas);this.paintMap.colorSpace=THREE.SRGBColorSpace;this.paintMap.anisotropy=8;this.materials.paint.map=this.paintMap;
  const plane=new THREE.PlaneGeometry(ARENA.halfLength*2,ARENA.halfWidth*2).rotateX(-Math.PI/2);plane.translate(0,FLOOR_Y+.004,0);
  this.paint=new THREE.Mesh(plane,this.materials.paint);this.paint.name='Pintura_piso_arena';this.paint.receiveShadow=true;this.paint.renderOrder=1;this.root.add(this.paint);
  this.matrix=new THREE.Matrix4();this.quat=new THREE.Quaternion();this.euler=new THREE.Euler(0,0,0,'YXZ');this.pos=new THREE.Vector3();this.one=new THREE.Vector3(1,1,1);
  this.logo=new Image();this.logo.onload=()=>{if(this.layout)this.drawPaint(this.layout);};this.logo.src='./assets/abertura/logo_auto_pobre_racing.webp';
  this.marker=new THREE.Mesh(new THREE.RingGeometry(.9,1,48).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x37e0ff,transparent:true,opacity:.85,depthTest:false,fog:false}));
  this.marker.renderOrder=5;this.marker.visible=false;this.marker.name='Selecao_editor';this.root.add(this.marker);
 }
 // The layout's items (drift-arena.js cleanLayout) and the world that poses its props.
 setLayout(layout,world){
  this.layout=layout;this.world=world;
  for(const child of [...this.static.children]){this.static.remove(child);child.geometry?.dispose();}
  const statics={rubber:[],kerb:[],grass:[],concrete:[],steel:[],pole:[],flag:[],shrub:[]};
  const add=(key,g)=>statics[key].push(g.index?g.toNonIndexed():g);
  layout.items.forEach((item,i)=>this.buildItem(item,i,add));
  for(const [key,list] of Object.entries(statics)){
   if(!list.length)continue;
   const g=mergeGeometries(list.map(g=>{if(!g.attributes.color&&['kerb','pole'].includes(key)){const c=new Float32Array(g.attributes.position.count*3).fill(1);g.setAttribute('color',new THREE.BufferAttribute(c,3));}if(!g.attributes.uv){g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));}if(key!=='kerb'&&key!=='pole'&&g.attributes.color)g.deleteAttribute('color');return g;}));
   list.forEach(g=>g.dispose());
   const mesh=new THREE.Mesh(g,this.materials[key]);mesh.name='Arena_'+key;mesh.castShadow=key!=='grass'&&key!=='kerb';mesh.receiveShadow=true;this.static.add(mesh);
  }
  // The start gate's sign on both faces of its beam, as the circuits' gantries have it.
  const gate=layout.items.find(i=>i.kind==='largada');
  if(gate){
   this.signMaterial??=new THREE.MeshStandardMaterial({name:'Portico_placa',map:signTexture('LARGADA · ARENA DE DRIFT'),color:0xdadada,roughness:.6});
   const c=Math.cos(gate.a),s=Math.sin(gate.a);
   for(const side of [1,-1]){const face=new THREE.Mesh(new THREE.PlaneGeometry(GATE_WIDTH+1.4,1.15),this.signMaterial);face.rotation.y=Math.PI/2+gate.a+(side<0?Math.PI:0);face.position.set(gate.x+c*.27*side,5.6,-(gate.y+s*.27*side));face.name='Placa_largada';this.static.add(face);}
  }
  this.drawPaint(layout);this.sync();
 }
 buildItem(item,i,add){
  const {kind,x,y,a}=item,size=item.size??ITEM_KINDS[kind].size,c=Math.cos(a),s=Math.sin(a),rand=seeded(1+Math.round(Math.abs(x*131+y*17))+i*7);
  const at=(g,px,py,heading=a,h=FLOOR_Y)=>g.rotateY(heading).translate(px,h,-py);
  if(kind==='muro'){
   // Two rows of stacks, bolted together, a belt along the front.
   const n=Math.max(2,Math.round(size/.62));
   for(let row=0;row<2;row++)for(let k=0;k<n;k++){const u=-size/2+(k+.5)*size/n,v=(row-.5)*.6,g=stackGeometry(3+(rand()<.15?1:0)).rotateY(rand()*6);add('rubber',at(g,x+c*u-s*v,y+s*u+c*v,0));}
   add('rubber',at(new THREE.BoxGeometry(size,.42,.04).translate(0,.32,0),x-s*.62,y+c*.62));add('rubber',at(new THREE.BoxGeometry(size,.42,.04).translate(0,.32,0),x+s*.62,y-c*.62));
  }else if(kind==='bloco'){
   // Jersey blocks of 3 m, painted red and white.
   const n=Math.max(1,Math.round(size/3));
   for(let k=0;k<n;k++){
    const u=-size/2+(k+.5)*size/n,shape=new THREE.Shape(JERSEY.map(([d,h])=>new THREE.Vector2(d-.375,h)));
    const g=new THREE.ExtrudeGeometry(shape,{depth:size/n-.04,bevelEnabled:false}).translate(0,0,-(size/n-.04)/2).rotateY(Math.PI/2);
    add('concrete',at(g,x+c*u,y+s*u));
   }
  }else if(kind==='ilha'){
   add('grass',grassPatch(x,y,0,size,0,Math.PI*2,48));
   add('kerb',kerbRing(x,y,size,size+ILHA.kerb,0,Math.PI*2));
   // In the middle a round concrete planter with a shrub and the arena's flag.
   add('concrete',at(new THREE.CylinderGeometry(ILHA.post,ILHA.post+.05,.5,24,1,true).translate(0,.25,0),x,y,0,FLOOR_Y+.03));
   add('concrete',at(new THREE.RingGeometry(ILHA.post-.12,ILHA.post,24).rotateX(-Math.PI/2).translate(0,.5,0),x,y,0,FLOOR_Y+.03));
   add('shrub',at(new THREE.IcosahedronGeometry(.85,1).scale(1,.75,1).translate(0,.85,0),x,y,rand()*6,FLOOR_Y+.03));
   add('steel',at(new THREE.CylinderGeometry(.04,.05,5.5,8).translate(0,2.8,0),x+.5,y,0));
   add('flag',at(new THREE.PlaneGeometry(1.6,.9).translate(.85,4.9,0),x+.5,y,a+rand()));
  }else if(kind==='meia_lua'){
   const cx=x+c*size,cy=y+s*size,mid=a+Math.PI,K=MEIA_LUA.kerb,G=MEIA_LUA.grass,a0=mid-MEIA_LUA.span/2,span=MEIA_LUA.span,segs=Math.round(span*size/1.2);
   add('kerb',kerbRing(cx,cy,size,size+K,a0,span));
   add('grass',grassPatch(cx,cy,size+K,size+K+G,a0,span,segs));
   add('kerb',kerbRing(cx,cy,size+K+G,size+2*K+G,a0,span));
  }else if(kind==='clip'){
   // Two flexible poles at the ends of its line, white with a red top.
   for(const side of [-1,1]){
    const g=new THREE.CylinderGeometry(.03,.035,1.1,8).translate(0,.55,0),p=g.attributes.position,col=new Float32Array(p.count*3);
    for(let k=0;k<p.count;k++)col.set(p.getY(k)>.8?[.85,.07,.05]:[.94,.94,.9],k*3);g.setAttribute('color',new THREE.BufferAttribute(col,3));
    add('pole',at(g,x+c*1.6*side,y+s*1.6*side,0));
   }
  }else if(kind==='largada'){
   // Two truss posts and the beam with the sign over a 14 m gate.
   const lx=-s,ly=c,h=GATE_WIDTH/2+.6;
   for(const side of [-1,1]){add('steel',at(new THREE.BoxGeometry(.5,6.2,.5).translate(0,3.1,0),x+lx*h*side,y+ly*h*side));}
   add('steel',at(new THREE.BoxGeometry(.5,1.4,GATE_WIDTH+1.7).translate(0,5.6,0),x,y));
  }
 }
 // The start gate's sign (a canvas each time the layout changes is cheap: one gate at most).
 // Poses the cones and stacks from the world's props (call every frame).
 sync(){
  const props=this.world?.props??[];let cones=0,stacks=0;
  for(const p of props){
   const mesh=p.kind==='cone'?this.cones:this.stacks,k=p.kind==='cone'?cones++:stacks++;if(k>=(p.kind==='cone'?MAX_CONES:MAX_STACKS))continue;
   // Tipped over by tilt round its own sideways axis; lying, its middle is a radius up.
   const lie=Math.abs(Math.sin(p.tilt??0)),r=p.kind==='cone'?.16:.3;
   this.euler.set(0,p.a,p.tilt??0,'YXZ');this.quat.setFromEuler(this.euler);
   this.pos.set(p.x,FLOOR_Y+(p.z??0)+lie*r*.9,-p.y);this.matrix.compose(this.pos,this.quat,this.one);mesh.setMatrixAt(k,this.matrix);
  }
  this.cones.count=Math.min(cones,MAX_CONES);this.stacks.count=Math.min(stacks,MAX_STACKS);
  this.cones.instanceMatrix.needsUpdate=this.stacks.instanceMatrix.needsUpdate=true;
 }
 // The editor's ring round an item (null hides it).
 select(item){
  if(!item){this.marker.visible=false;return;}
  const k=ITEM_KINDS[item.kind],size=item.size??k.size,r=item.kind==='ilha'?size+ILHA.kerb+.6:item.kind==='meia_lua'?3.5:['zona','muro','bloco'].includes(item.kind)?size/2+.6:item.kind==='largada'?GATE_WIDTH/2+1.2:item.kind==='clip'?2:1;
  this.marker.visible=true;this.marker.scale.setScalar(r);this.marker.position.set(item.x,FLOOR_Y+.06,-item.y);
 }
 // The floor's paint, from scratch.
 drawPaint(layout){
  const cv=this.canvas,ctx=cv.getContext('2d'),W=cv.width,H=cv.height,k=W/(ARENA.halfLength*2);
  const X=x=>(x+ARENA.halfLength)*k,Y=y=>(ARENA.halfWidth-y)*k;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
  // Clip to the floor's rounded rectangle.
  ctx.save();ctx.beginPath();const R=ARENA.corner*k;ctx.roundRect(0,0,W,H,R);ctx.clip();
  this.drawRubber(ctx,k,X,Y,layout);
  this.drawLogo(ctx,k,X,Y);
  for(const item of layout.items)this.drawItem(ctx,item,k,X,Y);
  ctx.restore();this.paintMap.needsUpdate=true;
 }
 // Years of drifting: dark rubber arcs, thickest round where the layout's islands and cones are and along the walls.
 drawRubber(ctx,k,X,Y,layout){
  const rand=seeded(4242),pairs=this.mobile?260:520;ctx.lineCap='round';
  const centres=[...layout.items.filter(i=>['ilha','cone','meia_lua'].includes(i.kind)).map(i=>{if(i.kind!=='meia_lua')return {x:i.x,y:i.y,r:(i.size??4)+6};const s=i.size;return {x:i.x+Math.cos(i.a)*s,y:i.y+Math.sin(i.a)*s,r:s-6};}),{x:-40,y:0,r:16},{x:40,y:0,r:16},{x:0,y:0,r:30}];
  for(let n=0;n<pairs;n++){
   const c=centres[Math.floor(rand()*centres.length)],r=Math.max(5,c.r+(rand()-.5)*12),a0=rand()*Math.PI*2,span=(.5+rand()*2.6)*(rand()<.5?-1:1),gap=1.5+rand()*.15;
   ctx.strokeStyle=`rgba(8,8,8,${.035+rand()*.06})`;ctx.lineWidth=(.2+rand()*.08)*k;
   for(const off of [-gap/2,gap/2]){ctx.beginPath();const steps=24;for(let j=0;j<=steps;j++){const t=a0+span*j/steps,rr=r+off+Math.sin(j*.7+n)*.4;const px=c.x+Math.cos(t)*rr,py=c.y+Math.sin(t)*rr;if(floorEdge(px,py).d>-1){ctx.stroke();ctx.beginPath();continue;}j?ctx.lineTo(X(px),Y(py)):ctx.moveTo(X(px),Y(py));}ctx.stroke();}
  }
  // Long sweeping marks along the walls, where the runs go wide.
  for(let n=0;n<(this.mobile?60:120);n++){
   const t0=rand()*Math.PI*2,len=.3+rand()*.6,inset=4+rand()*12;ctx.strokeStyle=`rgba(8,8,8,${.03+rand()*.05})`;ctx.lineWidth=(.22+rand()*.06)*k;
   for(const off of [0,1.5]){ctx.beginPath();for(let j=0;j<=30;j++){const t=t0+len*j/30,ex=Math.cos(t),ey=Math.sin(t);
    // A point on an ellipse inside the floor, pushed in from the wall.
    let px=ex*(ARENA.halfLength-inset-off),py=ey*(ARENA.halfWidth-inset-off);const e=floorEdge(px,py);if(e.d>-inset){px-=e.nx*(e.d+inset);py-=e.ny*(e.d+inset);}
    j?ctx.lineTo(X(px),Y(py)):ctx.moveTo(X(px),Y(py));}ctx.stroke();}
  }
 }
 drawLogo(ctx,k,X,Y){
  // The arena's name painted big in the middle, worn by the cars running over it.
  ctx.save();ctx.translate(X(0),Y(0));ctx.globalAlpha=.55;
  if(this.logo.complete&&this.logo.naturalWidth){const w=34*k,h=w*this.logo.naturalHeight/this.logo.naturalWidth;ctx.drawImage(this.logo,-w/2,-h/2-3*k,w,h);}
  ctx.globalAlpha=.6;ctx.fillStyle='#f3efe4';ctx.font=`900 ${5.2*k}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ARENA DE DRIFT',0,10.5*k);
  ctx.restore();
  // Wear: specks of asphalt showing through the paint.
  const rand=seeded(77);ctx.save();ctx.globalCompositeOperation='destination-out';
  for(let n=0;n<(this.mobile?1500:4000);n++){ctx.fillStyle=`rgba(0,0,0,${.2+rand()*.6})`;const r=(.05+rand()*.25)*k;ctx.beginPath();ctx.arc(X((rand()-.5)*40),Y((rand()-.5)*30),r,0,Math.PI*2);ctx.fill();}
  ctx.restore();
 }
 drawItem(ctx,item,k,X,Y){
  const {kind,x,y,a}=item,size=item.size??ITEM_KINDS[kind].size;
  ctx.save();ctx.translate(X(x),Y(y));ctx.rotate(-a);
  const yellow='rgba(246,206,38,.92)',hatch=(w,h)=>{ctx.save();ctx.beginPath();ctx.rect(-w/2,-h/2,w,h);ctx.clip();ctx.strokeStyle='rgba(246,206,38,.42)';ctx.lineWidth=.28*k;for(let u=-w;u<w;u+=1.4*k){ctx.beginPath();ctx.moveTo(u,-h/2);ctx.lineTo(u+h,h/2);ctx.stroke();}ctx.restore();};
  if(kind==='zona'){
   const w=size*k,h=ZONE_WIDTH*k;hatch(w,h);ctx.strokeStyle=yellow;ctx.lineWidth=.2*k;ctx.strokeRect(-w/2,-h/2,w,h);
   ctx.save();if(Math.cos(a)<-.01)ctx.rotate(Math.PI);ctx.fillStyle='rgba(246,206,38,.85)';ctx.font=`900 ${1.6*k}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ZONA',0,0);ctx.restore();
  }else if(kind==='meia_lua'){
   ctx.restore();ctx.save();
   const cx=x+Math.cos(a)*size,cy=y+Math.sin(a)*size,mid=a+Math.PI,span=MEIA_LUA.span,r0=size-MEIA_LUA.band,r1=size;
   // Screen y runs south: angles flip sign.
   ctx.translate(X(cx),Y(cy));const s0=-(mid+span/2),s1=-(mid-span/2);
   ctx.beginPath();ctx.arc(0,0,r1*k,s0,s1);ctx.arc(0,0,r0*k,s1,s0,true);ctx.closePath();ctx.save();ctx.clip();
   ctx.strokeStyle='rgba(246,206,38,.42)';ctx.lineWidth=.28*k;for(let t=s0;t<s1;t+=1.4/size){ctx.beginPath();ctx.moveTo(Math.cos(t)*r0*k,Math.sin(t)*r0*k);ctx.lineTo(Math.cos(t+.08)*r1*k,Math.sin(t+.08)*r1*k);ctx.stroke();}
   ctx.restore();ctx.strokeStyle=yellow;ctx.lineWidth=.2*k;ctx.stroke();
  }else if(kind==='clip'){
   // A white line between the poles and a red and white chequer at its middle.
   ctx.fillStyle='rgba(240,238,230,.92)';ctx.fillRect(-1.6*k,-.08*k,3.2*k,.16*k);
   for(let i=0;i<4;i++)for(let j=0;j<2;j++){ctx.fillStyle=(i+j)%2?'rgba(240,238,230,.95)':'rgba(205,25,20,.95)';ctx.fillRect((-.8+i*.4)*k,(-.4+j*.4)*k,.4*k,.4*k);}
   ctx.fillStyle='rgba(240,238,230,.85)';ctx.font=`900 ${.9*k}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('CLIPE',0,1.3*k);
  }else if(kind==='largada'){
   const w=GATE_WIDTH*k;for(let i=0;i<GATE_WIDTH/.5;i++)for(let j=0;j<2;j++){ctx.fillStyle=(i+j)%2?'rgba(20,20,20,.9)':'rgba(240,238,230,.92)';ctx.fillRect(-.5*k+j*.5*k,-w/2+i*.5*k,.5*k,.5*k);}
   ctx.save();ctx.rotate(Math.PI/2);ctx.fillStyle='rgba(240,238,230,.85)';ctx.font=`900 ${1.5*k}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LARGADA',0,2.2*k);ctx.restore();
  }else if(kind==='cone'||kind==='pneus'){
   ctx.strokeStyle='rgba(240,238,230,.55)';ctx.lineWidth=.06*k;ctx.beginPath();ctx.arc(0,0,(kind==='cone'?.3:.45)*k,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
 }
 // The start gate's sign, for the scene: a plane over the beam with LARGADA both ways.
 gateSign(){
  const gate=this.layout?.items.find(i=>i.kind==='largada');if(!gate)return null;
  return gate;
 }
 info(){return {statics:this.static.children.length,cones:this.cones.count,stacks:this.stacks.count,paint:[this.canvas.width,this.canvas.height]};}
 dispose(){this.root.traverse(o=>{o.geometry?.dispose();});for(const m of Object.values(this.materials))m.dispose();this.paintMap.dispose();this.signMaterial?.map.dispose();this.signMaterial?.dispose();}
}
