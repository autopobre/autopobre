import * as THREE from 'three';

// Interior surfaces of the Opala 99 cockpit. Photo-scanned CC0 maps (see
// assets/texturas/interior/creditos.txt) are laid out in real metres, and the
// instruments, labels and stickers are drawn on canvases. Three.js uploads the
// maps only when the cockpit is first drawn, so the external cameras pay nothing.
const DIR='./assets/texturas/interior/';
const loader=new THREE.TextureLoader();

// Geometry UVs in metres: planar per dominant normal (boxes) or along a tube.
export function boxUV(geometry){
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
 for(let i=0;i<p.count;i++){
  const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
  if(ax>=ay&&ax>=az)uv.setXY(i,p.getZ(i)*Math.sign(n.getX(i)),p.getY(i));
  else if(ay>=az)uv.setXY(i,p.getX(i),p.getZ(i)*Math.sign(n.getY(i)));
  else uv.setXY(i,p.getX(i)*-Math.sign(n.getZ(i)),p.getY(i));
 }
 uv.needsUpdate=true;return geometry;
}
export function tubeUV(geometry,radius,length){
 const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*2*radius,uv.getY(i)*length);
 uv.needsUpdate=true;return geometry;
}

function scanned(name,tile,{rough=true}={}){
 const load=(suffix,color)=>{const t=loader.load(`${DIR}${name}_${suffix}.jpg`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/tile,1/tile);t.anisotropy=8;if(color)t.colorSpace=THREE.SRGBColorSpace;return t;};
 return {map:load('diff',true),normalMap:load('nor_gl'),...(rough?{roughnessMap:load('rough')}:{})};
}

// Fine paint "orange peel" as a normal map, generated once from value noise.
function paintNormal(size=128,strength=2.2){
 const h=new Float32Array(size*size),rand=new Float32Array(33*33);
 for(let i=0;i<rand.length;i++)rand[i]=Math.random();
 const cell=size/32,at=(x,y)=>rand[(y%32)*33+(x%32)];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const gx=x/cell,gy=y/cell,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const top=at(ix,iy)+(at(ix+1,iy)-at(ix,iy))*sx,bottom=at(ix,iy+1)+(at(ix+1,iy+1)-at(ix,iy+1))*sx;
  h[y*size+x]=top+(bottom-top)*sy+Math.random()*.08;
 }
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const H=(u,v)=>h[((v+size)%size)*size+(u+size)%size];
  const dx=(H(x+1,y)-H(x-1,y))*strength,dy=(H(x,y+1)-H(x,y-1))*strength,l=Math.hypot(dx,dy,1),i=(y*size+x)*4;
  data[i]=(-dx/l*.5+.5)*255;data[i+1]=(-dy/l*.5+.5)*255;data[i+2]=(1/l*.5+.5)*255;data[i+3]=255;
 }
 // DataTexture filters to the nearest texel by default: smooth it, or large tiles turn blocky.
 const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/.06,1/.06);
 t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}

// What the cabin reflects: dark trim all round and bright glass ahead and to the
// sides, instead of the open sky. The cockpit turns it with the car (envMapRotation).
export function cabinEnvironment(renderer){
 const scene=new THREE.Scene(),add=(geometry,color,p,rotation=[0,0,0])=>{const o=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));o.position.set(...p);o.rotation.set(...rotation);scene.add(o);};
 add(new THREE.BoxGeometry(3,1.5,1.6),0x4a4e52,[0,0,0]);
 add(new THREE.PlaneGeometry(3,1.6),0x2c2e30,[0,-.74,0],[Math.PI/2,0,0]);
 const sky=new THREE.Color(0xc9dcef).multiplyScalar(3),side=new THREE.Color(0xa9bfd4).multiplyScalar(2.2);
 add(new THREE.PlaneGeometry(1.3,.55),sky,[1.49,.3,0],[0,-Math.PI/2,0]);
 add(new THREE.PlaneGeometry(1.1,.3),side.clone().multiplyScalar(.7),[-1.49,.35,0],[0,Math.PI/2,0]);
 for(const z of [-.79,.79])add(new THREE.PlaneGeometry(1.6,.45),side,[-.1,.3,z]);
 const pmrem=new THREE.PMREMGenerator(renderer),texture=pmrem.fromScene(scene,.02).texture;pmrem.dispose();
 return texture;
}

// A repeating canvas pattern laid out in metres (tile = metres per repeat).
function pattern(size,tile,draw){const t=canvasTexture(size,size,draw,{anisotropy:8});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/tile,1/tile);return t;}
// The cabin is bare steel painted gloss black, dusty and chipped (photos 30-36).
function dustyPaint(){
 return pattern(512,.6,(ctx,s)=>{
  ctx.fillStyle='#1a1c1e';ctx.fillRect(0,0,s,s);
  for(let i=0;i<220;i++){const x=Math.random()*s,y=Math.random()*s,r=10+Math.random()*46,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,Math.random()<.5?'rgba(52,54,56,.32)':'rgba(6,7,8,.4)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  for(let i=0;i<150;i++){const x=Math.random()*s,y=Math.random()*s,r=Math.random()<.9?.4+Math.random()*.8:1.1+Math.random()*1.6,v=170+Math.random()*60|0;
   ctx.fillStyle=`rgba(${v},${v-4},${v-12},${.2+Math.random()*.4})`;ctx.beginPath();ctx.ellipse(x,y,r,r*(.5+Math.random()*.5),Math.random()*3,0,Math.PI*2);ctx.fill();}
 });
}
// Sgarbi "air mesh" upholstery: staggered holes in a black knit.
function airMesh(){
 return pattern(128,.009,(ctx,s)=>{
  ctx.fillStyle='#2a2c2e';ctx.fillRect(0,0,s,s);ctx.fillStyle='#060707';
  for(let row=0;row<4;row++)for(let col=-1;col<4;col++){ctx.beginPath();ctx.arc((col+.5+(row%2)*.5)*s/4,(row+.5)*s/4,s*.088,0,Math.PI*2);ctx.fill();}
 });
}
// Punched aluminium (foot rest, throttle): white keeps, black is a hole.
function punched(){
 return pattern(128,.027,(ctx,s)=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,s,s);ctx.fillStyle='#000';ctx.beginPath();ctx.arc(s/2,s/2,s*.24,0,Math.PI*2);ctx.fill();});
}
// 2x2 twill carbon as on the instrument and key plates (carro_26-28): tows about 2.5 mm.
function twill(){
 return pattern(256,.008,(ctx,s)=>{
  const c=s/4;
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
   const warp=((i-j)%4+4)%4<2,x=i*c,y=j*c,g=warp?ctx.createLinearGradient(x,0,x+c,0):ctx.createLinearGradient(0,y,0,y+c);
   g.addColorStop(0,'#4b5057');g.addColorStop(.5,warp?'#878d94':'#787e85');g.addColorStop(1,'#4b5057');ctx.fillStyle=g;ctx.fillRect(x,y,c,c);
  }
 });
}
// Cast Tilton pedal pad: diamond knurl with the name in the middle.
function tiltonPad(){
 const t=canvasTexture(256,256,(ctx,s)=>{
  ctx.fillStyle='#b9bcbd';ctx.fillRect(0,0,s,s);ctx.strokeStyle='#6e7275';ctx.lineWidth=5;
  for(let i=-s;i<2*s;i+=26){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+s,s);ctx.stroke();ctx.beginPath();ctx.moveTo(i,s);ctx.lineTo(i+s,0);ctx.stroke();}
  ctx.fillStyle='#c9cccd';ctx.fillRect(s*.16,s*.40,s*.68,s*.2);ctx.fillStyle='#55595c';ctx.font='italic 900 44px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('tilton',s/2,s/2+2);
 });
 return t;
}

export function createInteriorMaterials(renderer){
 const peel=paintNormal(),envMap=renderer?cabinEnvironment(renderer):null;
 // Without the cabin map, most of the sky is hidden: reflections are scaled down.
 const inside=envMap?1:.4;
 const vinyl=scanned('couro_painel',.32),suede=scanned('camurca',.14),brushed=scanned('aluminio_escovado',.55);
 const rubber=scanned('borracha',.5,{rough:false}),carbon=scanned('carbono',.075,{rough:false});
 const mesh=airMesh(),holes=punched(),pad=tiltonPad(),weave=twill(),bumps=paintNormal(128,3);bumps.repeat.set(1/2.4,1/2.4);
 const materials={
  // Leather-grain moulded dash, as on the original Opala panel: dull and dusty black,
  // so it barely mirrors the windscreen at grazing angles.
  dash:new THREE.MeshStandardMaterial({...vinyl,color:0xb4b4b4,roughness:1,normalScale:new THREE.Vector2(.8,.8),envMapIntensity:inside*.18}),
  // Smooth gloss black vinyl of the Sgarbi bolsters.
  seatVinyl:new THREE.MeshPhysicalMaterial({color:0x151617,roughness:.34,clearcoat:.6,clearcoatRoughness:.22,normalMap:vinyl.normalMap,normalScale:new THREE.Vector2(.15,.15),envMapIntensity:inside*.8}),
  // Resin-coated twill weave for the instrument pod: satin grey, lighter than the black around it.
  carbon:new THREE.MeshPhysicalMaterial({...carbon,color:0xa6aaaf,roughness:.42,metalness:.15,clearcoat:1,clearcoatRoughness:.06,normalScale:new THREE.Vector2(.7,.7),envMapIntensity:.7}),
  // Brushed aluminium: footwell sheet, kick panel and seat brackets.
  aluminium:new THREE.MeshStandardMaterial({...brushed,color:0xc9ccce,metalness:.85,roughness:.55,envMapIntensity:.95}),
  // Ribbed rubber over the tunnel and in the footwell.
  rubber:new THREE.MeshStandardMaterial({...rubber,color:0xdcdcdc,roughness:.9,envMapIntensity:.25}),
  // Suede: steering wheel rim and seat centres, with a soft fabric sheen.
  suede:new THREE.MeshPhysicalMaterial({...suede,color:0x6a6a6a,roughness:1,sheen:1,sheenColor:new THREE.Color(0x707070),sheenRoughness:.55,envMapIntensity:.2}),
  // Satin black body paint (roof, firewall, bulkheads) and the painted cage.
  body:new THREE.MeshStandardMaterial({color:0x2c3033,roughness:.62,metalness:.2,normalMap:peel,normalScale:new THREE.Vector2(.18,.18),envMapIntensity:inside}),
  cage:new THREE.MeshPhysicalMaterial({color:0x202326,roughness:.3,metalness:.3,clearcoat:.9,clearcoatRoughness:.12,normalMap:peel,normalScale:new THREE.Vector2(.03,.03),envMapIntensity:.6}),
  // Gloss black hood seen through the windscreen.
  hood:new THREE.MeshPhysicalMaterial({color:0x0b0c0d,roughness:.28,metalness:.4,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1}),
  // Moulded fibreglass seat shell and plastic housings.
  shell:new THREE.MeshPhysicalMaterial({color:0x1a1d20,roughness:.35,clearcoat:.8,clearcoatRoughness:.2,envMapIntensity:.5}),
  plastic:new THREE.MeshStandardMaterial({color:0x25282b,roughness:.7,envMapIntensity:inside}),
  foam:new THREE.MeshStandardMaterial({color:0x1e2022,roughness:1,normalMap:suede.normalMap,normalScale:new THREE.Vector2(1.2,1.2),envMapIntensity:.15}),
  webbing:new THREE.MeshStandardMaterial({color:0x151618,roughness:.95,normalMap:suede.normalMap,normalScale:new THREE.Vector2(.8,.8),envMapIntensity:.15}),
  // Gloss red cylinder with a clear lacquer, like the real extinguisher.
  extinguisher:new THREE.MeshPhysicalMaterial({color:0xb3121a,roughness:.3,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.8}),
  // Instrument lenses: faint, sharp reflections over the faces.
  glass:new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.04,metalness:0,transparent:true,opacity:.12,clearcoat:1,envMapIntensity:1.6,depthWrite:false}),
  // Gloss black paint over bare steel: floor, tunnel, doors, rear seat pan and bulkheads.
  paint:new THREE.MeshPhysicalMaterial({map:dustyPaint(),roughness:.3,metalness:.1,clearcoat:.8,clearcoatRoughness:.15,normalMap:peel,normalScale:new THREE.Vector2(.05,.05),envMapIntensity:inside*.8}),
  // Twill carbon plates and the glossy tar-like sound deadener on the firewall.
  twill:new THREE.MeshPhysicalMaterial({map:weave,bumpMap:weave,bumpScale:.35,roughness:.36,metalness:.1,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.8}),
  bitumen:new THREE.MeshPhysicalMaterial({color:0x0c0c0d,roughness:.3,clearcoat:.9,clearcoatRoughness:.2,normalMap:bumps,normalScale:new THREE.Vector2(.6,.6),envMapIntensity:inside}),
  // Sgarbi seat centres and back: open air mesh.
  airMesh:new THREE.MeshStandardMaterial({map:mesh,bumpMap:mesh,bumpScale:1.5,roughness:.96,envMapIntensity:.15}),
  // Black anodised spokes and hub plate.
  anodized:new THREE.MeshStandardMaterial({color:0x17181a,metalness:.7,roughness:.3,envMapIntensity:1}),
  polished:new THREE.MeshStandardMaterial({color:0xe4e6e8,metalness:1,roughness:.16,envMapIntensity:1.3}),
  perforated:new THREE.MeshStandardMaterial({...brushed,color:0xc9ccce,metalness:.85,roughness:.5,alphaMap:holes,alphaTest:.5,side:THREE.DoubleSide,envMapIntensity:.9}),
  tilton:new THREE.MeshStandardMaterial({map:pad,bumpMap:pad,bumpScale:2,color:0xffffff,metalness:.75,roughness:.45,envMapIntensity:.9}),
  copper:new THREE.MeshStandardMaterial({color:0x9a6040,metalness:.6,roughness:.5,envMapIntensity:.7}),
  // Cream piping of the seat bolsters.
  whitePiping:new THREE.MeshStandardMaterial({color:0xe8e0c8,roughness:.5,envMapIntensity:.3}),
  // Smoked polycarbonate of the quarter and rear windows.
  tint:new THREE.MeshPhysicalMaterial({color:0x2a3136,roughness:.06,transparent:true,opacity:.26,clearcoat:1,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.4})
 };
 // Everything but the hood (outside the windscreen) reflects the cabin.
 if(envMap)for(const [name,material] of Object.entries(materials))if(name!=='hood'){material.envMap=envMap;material.envMapIntensity*=1.5;}
 return {...materials,envMap};
}

export function canvasTexture(width,height,draw,{anisotropy=4}={}){
 const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'),width,height);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=anisotropy;return t;
}

// Seven-segment LCD: unlit segments stay faintly visible, as on the real display.
const SEGMENTS={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcdfg'};
export function drawSegments(ctx,text,x,y,height,lit,unlit){
 const w=height*.5,t=height*.12,g=t*.18;
 const bars={a:[0,0,1,0],b:[1,0,1,.5],c:[1,.5,1,1],d:[0,1,1,1],e:[0,.5,0,1],f:[0,0,0,.5],g:[0,.5,1,.5]};
 [...text].forEach((ch,i)=>{
  const ox=x+i*(w+height*.28);
  for(const [name,[x0,y0,x1,y1]] of Object.entries(bars)){
   const on=(SEGMENTS[ch]??'').includes(name);ctx.fillStyle=on?lit:unlit;
   const ax=ox+x0*w-y0*height*.06,ay=y+y0*height,bx=ox+x1*w-y1*height*.06,by=y+y1*height,horizontal=y0===y1;
   ctx.beginPath();
   if(horizontal){ctx.moveTo(ax+g,ay);ctx.lineTo(ax+t/2+g,ay-t/2);ctx.lineTo(bx-t/2-g,by-t/2);ctx.lineTo(bx-g,by);ctx.lineTo(bx-t/2-g,by+t/2);ctx.lineTo(ax+t/2+g,ay+t/2);}
   else{ctx.moveTo(ax,ay+g);ctx.lineTo(ax+t/2,ay+t/2+g);ctx.lineTo(bx+t/2,by-t/2-g);ctx.lineTo(bx,by-g);ctx.lineTo(bx-t/2,by-t/2-g);ctx.lineTo(ax-t/2,ay+t/2+g);}
   ctx.closePath();ctx.fill();
  }
 });
}

// Brazilian ABC powder label as on the car's extinguisher (photos 34, 36).
export function extinguisherLabel(){
 return canvasTexture(512,384,(ctx,w,h)=>{
  ctx.fillStyle='#f1f0ea';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e7c923';ctx.fillRect(24,26,96,92);ctx.fillStyle='#161718';ctx.fillRect(0,132,w,64);
  ctx.fillStyle='#ffffff';ctx.font='900 46px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PÓ ABC',w/2,166);
  ctx.fillStyle='#161718';ctx.font='900 40px Arial,sans-serif';ctx.fillText('EXTINTOR',320,72);ctx.font='700 30px Arial';ctx.fillText('4 kg',72,74);
  [['A','#2d8f45'],['B','#c62828'],['C','#1f5fb4']].forEach(([t,color],i)=>{ctx.fillStyle=color;ctx.fillRect(150+i*80,222,64,64);ctx.fillStyle='#fff';ctx.font='900 44px Arial';ctx.fillText(t,182+i*80,256);});
  ctx.fillStyle='#b3121a';ctx.fillRect(0,h-56,w,56);ctx.fillStyle='#6d7176';ctx.font='20px Arial,sans-serif';ctx.fillText('Recarga 09/2026 · uso em competição',w/2,306);
 });
}
// Auto Meter instruments of the car (photos 25-27). Angles in degrees, clockwise from
// 3 o'clock as on the canvas; the needles turn on the same scales.
export const AUTOMETER=Object.freeze({
 tach:{min:0,max:8,start:38,sweep:232},
 fuel:{min:0,max:15,start:135,sweep:270},
 water:{min:120,max:240,start:135,sweep:270},
 oil:{min:0,max:100,start:135,sweep:270}
});
export function autoMeterFace(kind,size=512){
 const s=AUTOMETER[kind],yellow='#f0bd2e',white='#efefe8';
 return canvasTexture(size,size,(ctx,w)=>{
  const c=w/2,k=w/512;ctx.translate(c,c);
  const face=ctx.createRadialGradient(0,-60*k,10*k,0,0,c);face.addColorStop(0,'#1c1e20');face.addColorStop(.78,'#0e0f10');face.addColorStop(1,'#030404');
  ctx.fillStyle=face;ctx.fillRect(-c,-c,w,w);
  const angle=v=>(s.start+s.sweep*(v-s.min)/(s.max-s.min))*Math.PI/180;
  const tick=(v,r0,width,color)=>{const a=angle(v);ctx.beginPath();ctx.moveTo(Math.cos(a)*r0*k,Math.sin(a)*r0*k);ctx.lineTo(Math.cos(a)*247*k,Math.sin(a)*247*k);ctx.lineWidth=width*k;ctx.strokeStyle=color;ctx.stroke();};
  const text=(t,x,y,px,{color=white,font='Arial,sans-serif',weight=700,italic=false,rotate=0}={})=>{ctx.save();ctx.translate(x*k,y*k);ctx.rotate(rotate);ctx.font=`${italic?'italic ':''}${weight} ${px*k}px ${font}`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,0,0);ctx.restore();};
  const logo=(x,y,px,color,rotate=0)=>text('Auto Meter',x,y,px,{color,font:'"Trebuchet MS",Arial,sans-serif',weight:800,italic:true,rotate});
  const scale=(major,minor,mid,minorColor,numberRadius,numberSize)=>{
   for(let v=s.min;v<=s.max+1e-6;v+=minor){
    const q=(v-s.min)/major,isMajor=Math.abs(q-Math.round(q))<1e-6,isMid=mid&&Math.abs((v-s.min)/mid-Math.round((v-s.min)/mid))<1e-6;
    tick(v,isMajor?200:isMid?218:228,isMajor?9:isMid?5:3,isMajor?white:minorColor);
    if(isMajor){const a=angle(v);text(String(Math.round(v)),Math.cos(a)*numberRadius,Math.sin(a)*numberRadius,numberSize,{font:'"Arial Narrow",Arial,sans-serif'});}
   }
  };
  if(kind==='tach'){
   scale(1,.1,.5,white,166,74);
   // Peak-recall square just before zero.
   const a=angle(-.3);ctx.strokeStyle=white;ctx.lineWidth=3*k;ctx.save();ctx.translate(Math.cos(a)*205*k,Math.sin(a)*205*k);ctx.rotate(a);ctx.strokeRect(-10*k,-10*k,20*k,20*k);ctx.restore();
   text('SPORT-COMP',-40,-98,25,{italic:true,weight:900,rotate:-.42});text('MONSTER',-6,-58,15);
   logo(40,78,26,white,-.42);text('SYCAMORE, IL USA',95,196,11,{color:'#9a9c98',weight:400,rotate:-.42});
  }else{
   const pro=kind!=='water';
   scale(kind==='fuel'?3:20,kind==='fuel'?.5:5,0,pro?yellow:white,150,kind==='water'?50:58);
   text(pro?'PRO-COMP':'SPORT-COMP',0,-52,pro?30:26,{color:pro?yellow:white,italic:!pro,weight:900});
   if(pro)text('LIQUID FILLED',0,-28,13,{weight:400});
   logo(0,30,30,pro?yellow:white);
   const [title,sub]={fuel:['FUEL','PRESS'],water:['WATER','TEMP'],oil:['OIL','PRESS']}[kind];
   text(title,0,100,46,{weight:900});text(sub,0,134,19);if(pro)text('PSI',0,156,12,{weight:400});
   text('MADE IN USA',0,178,10,{color:'#9a9c98',weight:400});
  }
  const rim=ctx.createRadialGradient(0,0,212*k,0,0,c);rim.addColorStop(0,'rgba(0,0,0,0)');rim.addColorStop(1,'rgba(0,0,0,.7)');ctx.fillStyle=rim;ctx.fillRect(-c,-c,w,w);
 },{anisotropy:8});
}
// Control pod on the tachometer face: push-to-display and shift-set.
export function shiftSetLabel(){
 return canvasTexture(256,176,(ctx,w,h)=>{
  ctx.fillStyle='#141516';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e9e9e2';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.save();ctx.translate(40,70);ctx.rotate(-Math.PI/2);ctx.font='700 15px Arial';ctx.fillText('PUSH',30,-14);ctx.fillText('TO',30,4);ctx.fillText('DISPLAY',30,22);ctx.restore();
  ctx.font='900 34px Arial';ctx.fillText('RPM',120,108);ctx.font='700 13px Arial';ctx.fillText('x 1000',120,132);ctx.font='700 16px Arial';ctx.fillText('SHIFT-SET',178,158);
 });
}
// Overhead switch bank made by Luizão Racing (photo 31): engraved acrylic, 0.22 x 0.062 m.
export const SWITCH_BANK=Object.freeze([['IGN',-.080],['PART',-.049],['BC1',-.018],['DH',.0074],['LAN',.0335],['LIMP',.060],['FAROL',.086]]);
function luizaoLogo(ctx,x,y,size,color='#dcd9cf'){
 ctx.save();ctx.translate(x,y);ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';ctx.strokeStyle=color;
 // Outlined (hollow) script over an outlined italic RACING, as engraved on the real plates.
 ctx.font=`italic 800 ${size}px Arial,sans-serif`;ctx.lineWidth=size*.04;ctx.strokeText('Luizão',0,0);
 ctx.font=`italic 900 ${size*.4}px "Arial Black",Arial,sans-serif`;ctx.lineWidth=size*.022;ctx.strokeText('RACING',size*.45,size*.45);
 ctx.restore();
}
// Luizão Racing's logo only in the cars it prepared (Central #17, race-roster.js LUIZAO_CARS): the material keeps both
// faces (draw(logo)) and the cockpit's setLuizao picks one; the plain face is drawn the first time a car without it is taken.
export function luizaoFaces(material,draw){
 const faces=new Map([[true,draw(true)]]);material.map=faces.get(true);
 material.userData.luizao=logo=>{if(!faces.has(logo))faces.set(logo,draw(logo));return faces.get(logo);};
 return material;
}
export function switchPanelTexture(logo=true){
 return canvasTexture(2048,576,(ctx,w,h)=>{
  const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#0e1011');bg.addColorStop(.45,'#1d2022');bg.addColorStop(.55,'#141618');bg.addColorStop(1,'#0b0c0d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const px=x=>(x/.22+.5)*w,py=y=>(.5-y/.062)*h;
  const engrave=(t,x,y,size)=>{ctx.font=`400 ${size}px "Times New Roman",Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(0,0,0,.85)';ctx.fillText(t,px(x)+3,py(y)+3);ctx.fillStyle='#dcd9cf';ctx.fillText(t,px(x),py(y));};
  for(const [label,x] of SWITCH_BANK){if(label!=='PART'){engrave('ON',x,.0104,40);engrave('OFF',x,-.0132,40);}engrave(label,x,-.0252,66);}
  if(logo)luizaoLogo(ctx,px(.004),py(.019),112);
 });
}
// Lettering on a transparent (or plain) card: OMP on the wheel spoke, Sgarbi seat and belts.
export function logoTexture(text,{width=512,height=128,color='#f2c81b',font='italic 900 96px Arial,sans-serif',background=null,underline=false}={}){
 return canvasTexture(width,height,(ctx,w,h)=>{
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,w,h);}else ctx.clearRect(0,0,w,h);
  ctx.fillStyle=color;ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2+(underline?-8:4));
  // A swoosh under the name (underline).
  if(underline){ctx.beginPath();ctx.moveTo(w*.12,h*.86);ctx.quadraticCurveTo(w*.5,h*.74,w*.9,h*.8);ctx.lineTo(w*.9,h*.86);ctx.quadraticCurveTo(w*.5,h*.8,w*.12,h*.93);ctx.closePath();ctx.fill();}
 });
}
// MSD 6AL: finned red box, the white oval label at its left end (carro_30).
export function msdLabel(){
 return canvasTexture(512,288,(ctx,w,h)=>{
  ctx.fillStyle='#c01822';ctx.fillRect(0,0,w,h);
  for(let y=10;y<h;y+=18){ctx.fillStyle='rgba(0,0,0,.32)';ctx.fillRect(0,y,w,5);ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(0,y+5,w,2);}
  ctx.fillStyle='#ece8df';ctx.beginPath();ctx.ellipse(118,144,86,118,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#c01822';ctx.font='italic 900 64px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('MSD',118,92);
  ctx.fillStyle='#111';ctx.font='900 22px Arial';ctx.fillText('IGNITION',118,140);ctx.font='900 30px Arial';ctx.fillText('6AL',118,178);ctx.font='700 14px Arial';ctx.fillText('Multiple Spark',118,208);ctx.fillText('Discharge',118,226);
  ctx.fillStyle='#e8e4dc';ctx.fillRect(250,118,120,36);ctx.fillStyle='#c01822';ctx.font='900 24px Arial';ctx.fillText('6420',310,137);
 });
}
export function relayPanelTexture(logo=true){
 return canvasTexture(512,448,(ctx,w,h)=>{
  ctx.fillStyle='#101112';ctx.fillRect(0,0,w,h);ctx.fillStyle='rgba(255,255,255,.05)';for(let i=0;i<40;i++)ctx.fillRect(Math.random()*w,Math.random()*h,2,2);
  if(logo)luizaoLogo(ctx,370,386,64,'#e2dfd6');
 });
}
// Battery top: one continuous white and green label with a row of small pictograms.
// Battery top (carro_34): white label, a diagonal lime band, a round lime logo in the
// corner and two rows of small pictograms.
export function batteryLabel(){
 return canvasTexture(512,368,(ctx,w,h)=>{
  ctx.fillStyle='#16181a';ctx.fillRect(0,0,w,h);ctx.fillStyle='#eff2ec';ctx.fillRect(28,52,456,264);
  ctx.fillStyle='#b5d93a';ctx.beginPath();ctx.moveTo(120,52);ctx.lineTo(210,52);ctx.lineTo(120,316);ctx.lineTo(30,316);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.arc(430,100,34,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 30px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('m',430,102);
  const colors=['#f5c400','#1f5fb4','#d32f2f','#1f5fb4','#f5c400','#111','#d32f2f','#1f5fb4'];
  colors.forEach((color,i)=>{const x=250+(i%4)*52,y=190+Math.floor(i/4)*54;ctx.fillStyle=color;ctx.beginPath();if(i%2)ctx.arc(x+18,y+18,16,0,Math.PI*2);else{ctx.moveTo(x+18,y);ctx.lineTo(x+36,y+34);ctx.lineTo(x,y+34);}ctx.fill();});
  ctx.fillStyle='#1b1d1f';ctx.font='700 22px Arial';ctx.textAlign='left';ctx.fillText('12V 60Ah',250,150);
 });
}
// Round green "D" sticker on the rear window, read from inside (mirrored print).
export function dSticker(){
 return canvasTexture(256,256,(ctx,w)=>{
  ctx.clearRect(0,0,w,w);ctx.fillStyle='#f4f4ef';ctx.beginPath();ctx.ellipse(128,128,124,110,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#2f9d4c';ctx.lineWidth=14;ctx.beginPath();ctx.ellipse(128,128,106,92,0,0,Math.PI*2);ctx.stroke();
  // A round-bellied D, mirrored: read from inside the car it faces backwards.
  ctx.translate(w,0);ctx.scale(-1,1);ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(98,72);ctx.lineTo(98,184);ctx.lineTo(126,184);ctx.bezierCurveTo(190,184,190,72,126,72);ctx.closePath();ctx.stroke();
 });
}
// Rear polycarbonate: smoked, with two half-moon scoops at the top and three slots low
// (carro_6); from inside they read as dark openings. u runs across the car from the
// driver's side, v from the bottom edge up.
export const REAR_WINDOW_VENTS=Object.freeze([{u:.24,v:.74,w:.11,h:.13,scoop:true},{u:.76,v:.78,w:.10,h:.13,scoop:true},{u:.255,v:.12,w:.15,h:.045},{u:.51,v:.12,w:.16,h:.045},{u:.79,v:.12,w:.17,h:.045}]);
export function rearWindowTexture(){
 return canvasTexture(1024,512,(ctx,w,h)=>{
  ctx.fillStyle='rgba(30,36,40,.44)';ctx.fillRect(0,0,w,h);
  for(const {u,v,w:vw,h:vh,scoop} of REAR_WINDOW_VENTS){
   const x=u*w,y=(1-v)*h,rx=vw*w/2,ry=vh*h/2;
   if(scoop){
    // Half-moon opening under the moulded scoop; its lip catches the light.
    ctx.fillStyle='rgba(8,9,10,.92)';ctx.beginPath();ctx.ellipse(x,y+ry*.5,rx,ry,0,Math.PI,0);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(170,174,176,.9)';ctx.lineWidth=7;ctx.beginPath();ctx.ellipse(x,y+ry*.5,rx,ry,0,Math.PI,0);ctx.stroke();
   }else{
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='rgba(10,11,12,.85)';ctx.beginPath();ctx.roundRect(x-rx,y-ry,rx*2,ry*2,ry);ctx.fill();
    ctx.strokeStyle='rgba(200,203,205,.95)';ctx.lineWidth=4;ctx.stroke();
   }
  }
 });
}
// "EDU / STEVAN 99" on the windscreen (photo 15), seen through the glass from inside.
export function windscreenNumber(){
 return canvasTexture(1024,768,(ctx,w)=>{
  ctx.translate(w,0);ctx.scale(-1,1);ctx.textAlign='center';ctx.textBaseline='middle';
  // Seen from inside: the back of solid vinyl letters, dark and slightly see-through.
  ctx.save();ctx.translate(w/2,70);ctx.transform(1,0,-.36,1,0,0);ctx.font='900 58px Arial,sans-serif';ctx.fillStyle='rgba(18,22,28,.75)';ctx.fillText('EDU / STEVAN',0,0);ctx.restore();
  // Big condensed italic digits (width about 0.65 of the height), heavy strokes.
  ctx.save();ctx.translate(w/2,440);ctx.transform(.64,0,-.2,1,0,0);
  ctx.font='900 700px "Arial Black",Arial,sans-serif';ctx.fillStyle='rgba(20,26,34,.5)';ctx.fillText('99',0,0);ctx.lineWidth=30;ctx.strokeStyle='rgba(236,238,234,.7)';ctx.strokeText('99',0,0);
  ctx.restore();
 });
}
// Insurer lettering on the boot lid, seen through the rear window.
export function rtjDecal(){
 return canvasTexture(512,160,(ctx,w)=>{
  ctx.fillStyle='#e8732a';ctx.strokeStyle='#e8732a';ctx.lineWidth=6;
  ctx.beginPath();ctx.moveTo(40,20);ctx.lineTo(130,20);ctx.lineTo(130,70);ctx.quadraticCurveTo(85,112,40,70);ctx.closePath();ctx.stroke();
  ctx.font='900 92px "Times New Roman",Georgia,serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('RTJ',160,64);
  ctx.font='700 26px Arial';ctx.textAlign='center';ctx.fillText('CORRETORA DE SEGUROS',w/2,138);
 });
}
