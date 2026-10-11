import * as THREE from 'three';
import {cliffEdge} from './cliff-edge.js';
import {canvasTexture} from './pit-textures.js';

// What a plateau circuit's rim looks like (Chapada dos Sonhos, cliff-edge.js): the wall of sandstone under
// the line, a skin of ground along the top of it, and the plateau's grid kept off the lip. The wall follows
// the photos the players sent (fotos_referencia/autodromo_chapada): pink and orange sandstone in level beds,
// split into columns and buttresses, water stains running down it, the forest at its foot. Its beds are drawn
// at fixed heights above the sea, so a layer runs the whole length of the wall as in the real cliffs.

const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
function fbm(x,y,octaves=4){let s=0,a=.5,n=0;for(let o=0;o<octaves;o++){s+=a*noise(x,y);n+=a;x=x*2.03+17.1;y=y*2.11+9.3;a*=.5;}return s/n;}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Rows of the rim skin, metres in from the line, and how far under the plateau's own ground the inner ones
// sit (where the grid is not lowered it covers them; where it dips toward the lip the skin shows).
const SKIN=[[0,0],[.6,0],[1.5,0],[3,0],[5,0],[7.5,0],[10.5,0],[13.5,-.05],[17,-.2]];
// Plateau nodes closer than this to the line are dropped to the foot of the wall in the drawn ground.
const LOWER=7.6;

// The drawn ground's heights (a copy of the fitted ones, track-clearance.js fitGround): no grid triangle may
// lean across the lip, so the plateau's nodes next to it go down to the foot, under the rim skin.
export function cliffShownHeights(data,heights){
 const edge=cliffEdge(data);if(!edge)return heights;
 const t=data.terrain,shown=Float64Array.from(heights),hit={};let lowered=0;
 for(let j=0;j<t.ny;j++)for(let i=0;i<t.nx;i++){
  const k=j*t.nx+i;if(edge.mask[k])continue;
  const q=edge.query(t.x0+i*t.step,t.y0+j*t.step,hit);if(!q.near||q.d<=-LOWER)continue;
  shown[k]=Math.min(shown[k],q.top-q.wall-2);lowered++;
 }
 shown.lowered=lowered;
 return shown;
}

// The sandstone: level beds of cream, peach, orange, rust and grey, thin cross-bedding, dark water stains and
// pale calcite runs down the face, lichen. 48 m along by 96 m up per repeat (wall UVs, below).
function sandstoneTexture(){
 return canvasTexture((ctx,w,h)=>{
  let seed=99;const r=()=>(seed=seed*16807%2147483647)/2147483647;
  // Close tones (the photos' wall reads as one orange-pink mass up close, its beds by texture more than colour), a grey bed now and then.
  const beds=['#c98a62','#d09670','#c4835a','#d6a07c','#bf7e58','#cc9272','#c88c66','#b9775a','#d8a684','#c58660','#c08a6c','#d29a72'];
  let y=0;
  while(y<h){
   const thick=6+r()**1.6*70,base=r()<.07?'#a8968a':beds[Math.floor(r()*beds.length)];
   ctx.fillStyle=base;ctx.fillRect(0,y,w,thick+1);
   // Cross-bedding inside the thicker beds.
   if(thick>24){ctx.strokeStyle='rgba(70,40,25,.12)';ctx.lineWidth=1;const slope=(r()-.5)*.25;for(let k=0;k<thick/5;k++){const yy=y+r()*thick;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy+slope*w);ctx.stroke();}}
   // The parting between beds: a dark seam, the odd overhang's shadow.
   ctx.fillStyle=`rgba(45,25,15,${.06+r()*.14})`;ctx.fillRect(0,y,w,1+r()*2);
   y+=thick;
  }
  // Columns: broad vertical bands a shade lighter or darker, the joints that split the wall into pillars.
  // Each band spans part of the height only, so the joints never cross the beds as a grid.
  for(let k=0;k<18;k++){const x=r()*w,wide=14+r()*50,top=r()*h,len=h*(.25+r()*.5);ctx.fillStyle=r()<.5?`rgba(255,235,210,${.03+r()*.04})`:`rgba(60,35,20,${.03+r()*.05})`;for(const dy of [0,-h]){ctx.fillRect(x,top+dy,wide,len);if(x+wide>w)ctx.fillRect(x-w,top+dy,wide,len);}if(r()<.5){ctx.fillStyle=`rgba(40,22,14,${.06+r()*.1})`;for(const dy of [0,-h])ctx.fillRect(x,top+dy,1+r()*1.5,len);}}
  // Water stains and calcite runs, from a ledge down a good part of the face (they wrap round the repeat).
  for(let k=0;k<110;k++){
   const x=r()*w,wide=1.5+r()**2*16,top=r()*h,len=h*(.15+r()*.7),dark=r()<.78;
   const g=ctx.createLinearGradient(0,top,0,top+len);
   const c=dark?'38,26,20':'236,228,214',a=dark?.05+r()*.14:.04+r()*.1;
   g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;
   for(const dy of [0,-h])ctx.fillRect(x,top+dy,wide,len);
   if(x+wide>w)for(const dy of [0,-h])ctx.fillRect(x-w,top+dy,wide,len);
  }
  // Lichen and soot: grey-green and black blotches.
  for(let k=0;k<900;k++){ctx.fillStyle=r()<.6?`rgba(70,78,62,${.05+r()*.15})`:`rgba(25,20,18,${.04+r()*.12})`;const s=2+r()*14;ctx.beginPath();ctx.ellipse(r()*w,r()*h,s,s*(.4+r()*.8),r()*3,0,7);ctx.fill();}
  // Grain.
  const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;
  for(let i=0;i<d.length;i+=4){const n=(r()-.5)*22;d[i]+=n;d[i+1]+=n*.9;d[i+2]+=n*.8;}
  ctx.putImageData(img,0,0);
 },512,1024,true);
}

// The lip: red laterite and loose stones where the ground ends, as on the verges of the roads in the photos
// (MT-251), the odd tuft of dry grass. Along the line by 8 m per repeat, across it by the strip's width.
function lipTexture(){
 return canvasTexture((ctx,w,h)=>{
  let seed=7;const r=()=>(seed=seed*16807%2147483647)/2147483647;
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#8d5a35');g.addColorStop(.45,'#9c4b2b');g.addColorStop(1,'#7c3a22');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  for(let k=0;k<1400;k++){const s=1+r()**3*9;ctx.fillStyle=r()<.5?`rgba(${150+r()*60|0},${90+r()*50|0},${60+r()*40|0},.8)`:`rgba(${70+r()*40|0},${35+r()*20|0},${20+r()*15|0},.6)`;ctx.beginPath();ctx.ellipse(r()*w,r()*h,s,s*(.5+r()*.5),r()*3,0,7);ctx.fill();}
  for(let k=0;k<260;k++){const x=r()*w,y=r()*h*.55,l=4+r()*14;ctx.strokeStyle=`rgba(${150+r()*60|0},${140+r()*50|0},${70+r()*30|0},.7)`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+l);ctx.lineTo(x+(r()-.5)*8,y);ctx.stroke();}
 },512,128,true);
}
// Rows of the lip: metres out from the line (negative: on the plateau) and down from the ground there.
const LIP=[[-1.1,.045],[-.45,.02],[0,0],[.16,.3],[.22,1.5]];

// The wall, the rim skin and the plateau kept off the lip. probe: a TestCar of the track (ground heights).
export function createCliff(data,{groundMaterial,probe,mobile=false}){
 const edge=cliffEdge(data);if(!edge)return null;
 const root=new THREE.Group();root.name='Paredao';
 const n=edge.n,t=data.terrain,W=(t.nx-1)*t.step,H=(t.ny-1)*t.step;
 // The line's outward normal at each point (both segments' at a joint).
 const nx=new Float64Array(n),ny=new Float64Array(n),along=new Float64Array(n);
 for(let i=0;i<n;i++){
  const a=Math.max(0,i-1),b=Math.min(n-2,i);let x=-(edge.ty[a]+edge.ty[b]),y=edge.tx[a]+edge.tx[b];const l=Math.hypot(x,y)||1;nx[i]=x/l;ny[i]=y/l;
  if(i)along[i]=along[i-1]+edge.len[i-1];
 }
 // Each point's nearest track station: the probe's ground there needs no search round the whole lap.
 const hints=new Int32Array(n);for(let i=0;i<n;i+=1)hints[i]=probe.nearest(edge.x[i],edge.y[i],true).i;
 // --- Rim skin: ground from the line in toward the plateau, at the height the car drives on.
 {
  const R=SKIN.length,pos=new Float32Array(n*R*3),uv=new Float32Array(n*R*2),index=[];
  for(let i=0;i<n;i++)for(let k=0;k<R;k++){
   const [inward,sink]=SKIN[k],x=edge.x[i]-nx[i]*inward,y=edge.y[i]-ny[i]*inward,v=i*R+k;
   const z=(inward<.01?edge.top[i]:probe.sample(x,y,hints[i]).z-.055)+sink;
   pos.set([x,z,-y],v*3);uv.set([(x-t.x0)/W,(y-t.y0)/H],v*2);
  }
  for(let i=0;i<n-1;i++)for(let k=0;k<R-1;k++){const a=i*R+k,b=a+R;index.push(a,a+1,b,b,a+1,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
  const skin=new THREE.Mesh(g,groundMaterial);skin.name='Beirada_chao';skin.receiveShadow=true;root.add(skin);
 }
 // --- The lip: a strip of red earth and stones over the last metre, rolling over the edge onto the wall's top.
 {
  const R=LIP.length,pos=new Float32Array(n*R*3),uv=new Float32Array(n*R*2),col=new Float32Array(n*R*3),index=[];
  for(let i=0;i<n;i++){
   const ground=probe.sample(edge.x[i]-nx[i]*1.1,edge.y[i]-ny[i]*1.1,hints[i]).z-.055,grass=smooth(.55,.8,fbm(along[i]/26,3.1));
   for(let k=0;k<R;k++){
    const [out,down]=LIP[k],x=edge.x[i]+nx[i]*out,y=edge.y[i]+ny[i]*out,v=i*R+k;
    const z=out<0?ground+(edge.top[i]-ground)*(1+out/1.1)-down+.02:edge.top[i]-down;
    pos.set([x,z,-y],v*3);uv.set([along[i]/8,k/(R-1)],v*2);
    const shade=.85+.3*noise(along[i]/3.3,k);col.set([shade*(1-.35*grass),shade*(1+.1*grass),shade*(1-.4*grass)],v*3);
   }
  }
  for(let i=0;i<n-1;i++)for(let k=0;k<R-1;k++){const a=i*R+k,b=a+R;index.push(a,a+1,b,b,a+1,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(index);g.computeVertexNormals();
  const lip=new THREE.Mesh(g,new THREE.MeshStandardMaterial({name:'Beirada_terra',map:lipTexture(),vertexColors:true,roughness:.97,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  lip.name='Beirada_terra';lip.receiveShadow=true;root.add(lip);
 }
 // --- Wall: columns at the line's points, rows from the lip down into the ground at its foot (abyss side).
 const ROWS=mobile?18:30,pos=new Float32Array(n*ROWS*3),uv=new Float32Array(n*ROWS*2),col=new Float32Array(n*ROWS*3),index=[];
 const abyss=(x,y)=>probe.terrain(x,y,edge.abyssZ);
 for(let i=0;i<n;i++){
  const top=edge.top[i],foot=Math.min(top-4,abyss(edge.x[i]+nx[i]*3,edge.y[i]+ny[i]*3)-6),u=along[i];
  // Buttresses and gullies: a ridge every 6-14 m, irregular.
  const ridge=Math.pow(Math.abs(Math.sin(u/(4+5*fbm(u/57,2.5))+4*fbm(u/31,.5))),.6)*fbm(u/23,7.7)*1.6;
  for(let k=0;k<ROWS;k++){
   const f=k/(ROWS-1),depth=(top-foot)*Math.pow(f,1.7),z=top-depth,v=i*ROWS+k;
   // Out from the line: nothing at the lip (the skin's edge), bulges, buttresses and ledges below it.
   const grow=smooth(.2,5,depth),bed=fbm(u/40,z/7,3),out=grow*(3.6*fbm(u/31,z/38)+1.5*fbm(u/9,z/12)+1.3*ridge+1.1*(bed>.55?bed-.55:0)*4);
   const x=edge.x[i]+nx[i]*out,y=edge.y[i]+ny[i]*out;
   pos.set([x,z,-y],v*3);uv.set([u/48,z/96],v*2);
   // Weathering in large patches, darker toward the foot (damp, soil, moss).
   const shade=.68+.55*fbm(u/90+40,z/70),foot1=smooth(28,0,z-foot),green=foot1*.5;
   col.set([shade*(1-.35*foot1),shade*(1-.25*foot1+.08*green),shade*(1-.35*foot1)],v*3);
  }
 }
 for(let i=0;i<n-1;i++)for(let k=0;k<ROWS-1;k++){const a=i*ROWS+k,b=a+ROWS;index.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(index);g.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({name:'Paredao_arenito',map:sandstoneTexture(),vertexColors:true,roughness:.93,metalness:0});
 const wall=new THREE.Mesh(g,material);wall.name='Paredao_arenito';wall.receiveShadow=true;root.add(wall);
 return {root,stats:{edge:n,wallVertices:n*ROWS,length:Math.round(along[n-1])}};
}
