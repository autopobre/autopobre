import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {canvasTexture} from './pit-textures.js';
import {createPitBuildings} from './pit-building.js';

// Pit lane of Interlagos from data.pit: the lane and its painted gore and merge,
// markings, the pit wall with its debris fence, the walls along the exit road
// the garage block with its roof terrace and membrane canopy (heights from the
// 2017 LiDAR), and Box 99 with the Lanchonete da Tia (pit-box99.js). Buildings are
// simplified volumes; lane geometry follows the 20 cm orthophoto.
function geometryFrom(positions,uvs,indices,extra){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 if(uvs)g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 for(const [name,values,size] of extra??[])g.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
 if(indices)g.setIndex(indices);g.computeVertexNormals();return g;
}
// Chain-link debris fence, drawn from the wire's own geometry instead of a texture (uv in metres:
// along the wall, height): every wire is antialiased at its true width, a wire thinner than a pixel
// dims to its share of grey instead of breaking into beads, and from about 30 m on the fence fades
// to a flat translucent veil, so no sub-pixel wires crawl. Coverage goes out as alpha: through
// alpha-to-coverage on multisampled targets (no sorting, depth per sample), blended in the main view
// without MSAA (the material then rides in the transparent list), cut by a screen-fixed dither in any
// other pass without it (mirrors, reflection probes). It writes no depth, so the occlusion pass and the
// film look see the ground behind it, not a sieve of wire samples; drawn after the opaque world
// (renderOrder 1), what stands behind it is already there. One double-sided pass even when blended
// (forceSinglePass): a thin sheet needs no back-then-front split, whose two extra programs compiled on
// the first frame without MSAA (Médio, Baixo), long after the load-time compile.
export const FENCE_MESH={diamond:.1,wire:.0075,veil:[28,42]};
export function chainLinkMaterial(){
 const uniforms={fenceMode:{value:1}};
 const material=new THREE.MeshStandardMaterial({name:'Alambrado_boxes',color:0xbcc3c5,roughness:.42,metalness:.55,side:THREE.DoubleSide,forceSinglePass:true,alphaToCoverage:true,depthWrite:false});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vFence;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFence=uv;');
  const D=FENCE_MESH.diamond,w=(FENCE_MESH.wire/(D*Math.SQRT1_2)).toFixed(5),[near,far]=FENCE_MESH.veil;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float fenceMode;
varying vec2 vFence;
// One family of parallel wires, c in wire spacings: coverage of a wire of width w (spacings) in this pixel.
float fenceWire(float c,float w){
 float d=max(fwidth(c),1e-5),drawn=clamp(w,d,.5),dist=abs(fract(c+.5)-.5);
 float line=(1.0-smoothstep(drawn*.5-d*.75,drawn*.5+d*.75,dist))*clamp(w/drawn,0.0,1.0);
 return mix(line,w,clamp(d*2.0-1.0,0.0,1.0));
}`).replace('#include <alphatest_fragment>',`{
  // A wire is a round strand: looking along the fence its width stays while the gaps between wires
  // close up, so the mesh thickens into a grey band at a grazing look (c: how square-on the view is).
  vec3 fenceN=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
  float c=max(abs(dot(fenceN,normalize(vViewPosition))),.12),wide=min(${w}*sqrt(1.0+c*c)/(c*1.4142),.42);
  // Two families of wires at 45 degrees make the diamonds; past the veil distance only their share.
  vec2 q=vec2(vFence.x+vFence.y,vFence.x-vFence.y)/${D.toFixed(4)};
  float a=1.0-(1.0-fenceWire(q.x,wide))*(1.0-fenceWire(q.y,wide)),veil=1.0-(1.0-wide)*(1.0-wide);
  a=mix(a,min(veil*1.1,.62),smoothstep(${near.toFixed(1)},${far.toFixed(1)},length(vViewPosition)));
  if(fenceMode>1.5)a=a>fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))?1.0:0.0;
  if(a<.004)discard;
  diffuseColor.a=a;
 }`);
 };
 material.customProgramCacheKey=()=>'alambrado-v3';
 // Per pass: multisampled (alpha to coverage), blended (main view without MSAA) or dithered. The main
 // view also decides which list the fence rides in from the next frame on.
 material.userData.onPass=(renderer)=>{
  const target=renderer.getRenderTarget(),msaa=target?target.samples>0:!!renderer.getContextAttributes()?.antialias;
  if(!target||target.isMainView)material.transparent=!msaa;
  uniforms.fenceMode.value=msaa?1:material.transparent?0:2;
 };
 return material;
}

// labels: the circuit's names on Box 99 (pit-box99.js); Interlagos keeps its own defaults.
export function createInterlagosPit(data,roadSurface,textures,labels=undefined){
 const pit=data.pit,c=Object.fromEntries(pit.columns.map((k,i)=>[k,i])),a=pit.samples,n=a.length;
 const root=new THREE.Group();root.name='Pit_lane_Interlagos';const obstacles=[];
 const at=(p,d,lift=0)=>new THREE.Vector3(p[c.x]+p[c.lx]*d,p[c.z]+p[c.bank]*d+lift,-(p[c.y]+p[c.ly]*d));
 const index=s=>{let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][c.s]<=s)lo=m;else hi=m-1;}return lo;};
 const lerp=(s)=>{const i=Math.min(n-2,index(s)),p=a[i],q=a[i+1],u=Math.max(0,Math.min(1,(s-p[c.s])/(q[c.s]-p[c.s])));return p.map((v,k)=>v+(q[k]-v)*u);};
 const mat=(name,color,extra={})=>new THREE.MeshStandardMaterial({name,color,roughness:.9,...extra});
 // --- Asphalt: lane, painted gore at the entry and the kerbed merge at the exit.
 {
  // The lane's own s in the road shader, past the lap's (6000 on: a lap longer than that, Pampulha's 20 km, had its
  // braking zones painted on the pit lane).
  const L=data.meta.reconstructed_xy_m,laneS=L+40<6000?6000:Math.ceil(L/1000)*1000+6000;
  const positions=[],uvs=[],road=[],indices=[];
  for(let i=0;i<n;i++){
   const p=a[i],mid=(p[c.lane_lo]+p[c.lane_hi])/2,width=p[c.lane_hi]-p[c.lane_lo];
   for(const d of [p[c.lo],p[c.hi]]){const v=at(p,d,.035);positions.push(v.x,v.y,v.z);uvs.push(v.x/2.1,v.z/2.1);road.push(d-mid,laneS+p[c.s],width,0);}
   if(i){const k=(i-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=geometryFrom(positions,uvs,indices,[['roadData',road,4]]);
  // Pushed back a little: where the lanes touch, the track's own surface wins.
  const material=roadSurface.cloneMaterial({polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const asphalt=new THREE.Mesh(g,material);asphalt.name='Asfalto_pit_lane';asphalt.receiveShadow=true;root.add(asphalt);
 }
 // --- Paint.
 const white=mat('Pintura_pit',0xece8d8,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const yellow=mat('Pintura_box',0xf0c419,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const paints={white:[],yellow:[]};
 function stripe(list,from,to,offset,width,step=2){
  const positions=[],indices=[];let k=0;
  for(let s=from;s<=to+1e-6;s+=step){
   const p=lerp(Math.min(s,to)),d=offset(p);for(const e of [d-width/2,d+width/2]){const v=at(p,e,.045);positions.push(v.x,v.y,v.z);}
   if(k){const b=(k-1)*2;indices.push(b,b+2,b+1,b+1,b+2,b+3);}k++;
  }
  if(k>1)list.push(geometryFrom(positions,null,indices));
 }
 function across(list,s,from,to,depth){const p0=lerp(s-depth/2),p1=lerp(s+depth/2),v=[at(p0,from(p0),.046),at(p0,to(p0),.046),at(p1,from(p1),.046),at(p1,to(p1),.046)];list.push(geometryFrom(v.flatMap(q=>[q.x,q.y,q.z]),null,[0,2,1,1,2,3]));}
 const end=pit.length_m;
 // A block written against the cars (Brasília, pit-lane.js) has its entry at the far end: the
 // entry paint and the boards read by arriving cars go there, turned round.
 const rev=!!pit.reversed,entry=s=>rev?end-s:s,facing=rev?Math.PI/2:-Math.PI/2;
 const limitStart=rev?pit.limit.to:pit.limit.from,limitEnd=rev?pit.limit.from:pit.limit.to,before=d=>rev?d:-d;
 stripe(paints.white,0,end,p=>p[c.lane_lo]+.07,.14);
 stripe(paints.white,0,end,p=>p[c.lane_hi]-.07,.14);
 // Fast lane / working lane divider in front of the garages.
 stripe(paints.white,pit.garages[0]-6,pit.garages[1]+6,p=>p[c.fast_hi]-.07,.14);
 // Entry line, speed-limit lines and the exit line across the lane.
 const lane=p=>p[c.lane_lo],outer=p=>p[c.lane_hi];
 across(paints.white,entry(1),lane,outer,.5);across(paints.white,pit.limit.from,lane,outer,.6);across(paints.white,pit.limit.to,lane,outer,.6);across(paints.white,pit.wall_end,lane,outer,.5);
 // Garage boxes along the working lane, about 13 m apart.
 const bays=Math.max(1,Math.round((pit.garages[1]-pit.garages[0])/13)),bay=(pit.garages[1]-pit.garages[0])/bays;
 for(let b=0;b<=bays;b++)across(paints.yellow,pit.garages[0]+b*bay,p=>p[c.fast_hi],p=>p[c.lane_hi]-.3,.12);
 for(const [list,material] of [[paints.white,white],[paints.yellow,yellow]]){const g=mergeGeometries(list,false);const m=new THREE.Mesh(g,material);m.receiveShadow=true;m.name=material.name;root.add(m);list.forEach(x=>x.dispose());}
 // Painted chevrons in the gore between the track and the pit entry.
 {
  // Paint faded like the run-offs (landscape.js), not a fresh teal.
  const map=canvasTexture((ctx,w,h)=>{ctx.fillStyle='#62786a';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#d6d9cc';ctx.lineWidth=h*.16;for(let k=-1;k<3;k++){ctx.beginPath();ctx.moveTo(0,k*h/2+h*.1);ctx.lineTo(w/2,k*h/2+h*.45);ctx.lineTo(w,k*h/2+h*.1);ctx.stroke();}},128,128);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  const positions=[],uvs=[],indices=[];let k=0;
  // From the lane's entry to the nose of the pit wall (the stations' end on a reversed block). Where the lane's paving
  // stops at its own edge (a measured lane, gerar_pista.py), the gore is the gap out to the lap's edge.
  for(let s=rev?pit.wall_nose:0;s<=(rev?end:pit.wall_nose);s+=2){const p=lerp(s),to=p[c.lane_lo]-.05,from=p[c.lo]<p[c.lane_lo]-.05||c.gap===undefined?p[c.lo]:p[c.lane_lo]-p[c.gap];if(to-from<.2&&k===0)continue;
   for(const d of [from,Math.max(from,to)]){const v=at(p,d,.044);positions.push(v.x,v.y,v.z);uvs.push((d-to)/3,s/3);}
   if(k){const b=(k-1)*2;indices.push(b,b+2,b+1,b+1,b+2,b+3);}k++;}
  const gore=new THREE.Mesh(geometryFrom(positions,uvs,indices),mat('Zebrado_entrada_boxes',0xffffff,{map,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  gore.name='Zebrado_entrada_boxes';gore.receiveShadow=true;root.add(gore);
 }
 // "60" painted before the limiter line, readable when arriving.
 {
  const map=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#f2efe2';ctx.font='bold 190px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('60',w/2,h/2+8);},256,256);
  const p=lerp(limitStart+before(9)),mid=(p[c.lane_lo]+p[c.fast_hi])/2,centre=at(p,mid,.047);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.2,4.4),new THREE.MeshStandardMaterial({map,transparent:true,roughness:.9,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,depthWrite:false}));
  plane.position.copy(centre);plane.rotation.order='YXZ';plane.rotation.y=Math.atan2(p[c.ty],p[c.tx])+facing;plane.rotation.x=-Math.PI/2;plane.name='Pintura_limite_60';root.add(plane);
 }
 // --- Walls: extruded along the surveyed polylines.
 const concrete=structureMaterial(mat('Concreto',0x8f918b,{side:THREE.DoubleSide}),textures),metal=structureMaterial(mat('Metal',0x2c3136,{metalness:.5,roughness:.45}),textures);
 // The debris fence: chain-link wire drawn from its own geometry (chainLinkMaterial).
 const fence=chainLinkMaterial();
 const wallParts=[],fenceParts=[],posts=[];
 // Along the garage fronts the outer wall lies where the doors are: the doors show and
 // its data still stops the cars, so only the stretches beyond the building are drawn.
 const nearestS=(x,y)=>{let best=Infinity,s=0;for(const p of a){const d=(p[c.x]-x)**2+(p[c.y]-y)**2;if(d<best){best=d;s=p[c.s];}}return s;};
 const runsOf=wall=>{if(wall.name!=='Muro_externo_boxes')return [wall.points];const runs=[];let run=[];for(const q of wall.points){const s=nearestS(q[0],q[1]);if(s>pit.garages[0]+.3&&s<pit.garages[1]-.3){if(run.length>1)runs.push(run);run=[];}else run.push(q);}if(run.length>1)runs.push(run);return runs;};
 for(const wall of pit.walls)for(const pts of runsOf(wall)){
  // Box 99 walls are drawn with their rooms; their collision still comes from the data.
  if(wall.name.startsWith('Box99'))continue;
  const positions=[],indices=[],fenceSide=wall.fence_side??0;
  const fencePos=[],fenceUv=[],fenceIdx=[];let run=0;
  for(let i=0;i<pts.length;i++){
   const [x,y,z,thickness]=pts[i],half=thickness/2,[x0,y0]=pts[Math.max(0,i-1)],[x1,y1]=pts[Math.min(pts.length-1,i+1)],tx=x1-x0,ty=y1-y0,len=Math.hypot(tx,ty)||1,nx=-ty/len,ny=tx/len;
   if(i)run+=Math.hypot(x-pts[i-1][0],y-pts[i-1][1]);
   // Outer faces and top: four corners per station, sunk 0.4 m into the ground.
   for(const [side,h] of [[-1,-.4],[-1,wall.height],[1,wall.height],[1,-.4]])positions.push(x+nx*half*side,z+h,-(y+ny*half*side));
   if(i){const b=(i-1)*4;for(let f=0;f<3;f++)indices.push(b+f,b+f+4,b+f+1,b+f+1,b+f+4,b+f+5);}
   // The debris fence stands on the track-side edge of the wall.
   const fx=x+nx*fenceSide*Math.max(0,half-.15),fy=y+ny*fenceSide*Math.max(0,half-.15);
   if(wall.fence){for(const h of [wall.height,wall.height+wall.fence]){fencePos.push(fx,z+h,-fy);fenceUv.push(run,h);}if(i){const b=(i-1)*2;fenceIdx.push(b,b+2,b+1,b+1,b+2,b+3);}
    if(i%2===0)posts.push({x:fx,y:fy,z:z+wall.height+wall.fence/2,h:wall.fence});}
  }
  // End caps.
  for(const [i,sign] of [[0,1],[pts.length-1,-1]]){const b=i*4;indices.push(...(sign>0?[b,b+1,b+2,b,b+2,b+3]:[b,b+2,b+1,b,b+3,b+2]));}
  const solid=geometryFrom(positions,null,indices).toNonIndexed();solid.computeVertexNormals();wallParts.push(solid);
  if(wall.fence)fenceParts.push(geometryFrom(fencePos,fenceUv,fenceIdx));
 }
 const walls=new THREE.Mesh(mergeGeometries(wallParts,false),concrete);walls.name='Muro_boxes';walls.castShadow=walls.receiveShadow=true;root.add(walls);obstacles.push(walls);
 if(fenceParts.length){const f=new THREE.Mesh(mergeGeometries(fenceParts,false),fence);f.name='Alambrado_muro_boxes';f.renderOrder=1;f.onBeforeRender=renderer=>fence.userData.onPass(renderer);root.add(f);}
 if(posts.length){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(.08,1,.08),metal,posts.length),m=new THREE.Matrix4();posts.forEach((p,i)=>{m.makeScale(1,p.h,1).setPosition(p.x,p.z,-p.y);inst.setMatrixAt(i,m);});inst.name='Postes_alambrado';inst.castShadow=true;inst.computeBoundingSphere();root.add(inst);}
 // --- Garage row, Box 99 with the Lanchonete da Tia, crew and people (pit-building.js).
 const {box,garages}=createPitBuildings({pit,c,lerp,at,root,obstacles,textures,labels});
 // --- Signs at the entry and on the pit wall.
 {
  const board=(text,sub,bg,fg)=>canvasTexture((ctx,w,h)=>{ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.textAlign='center';ctx.font='bold 92px sans-serif';ctx.fillText(text,w/2,h*.47);ctx.font='bold 46px sans-serif';ctx.fillText(sub,w/2,h*.82);},512,256);
  const place=(map,s,d,height,w,h,name)=>{const p=lerp(s),o=at(p,d);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));m.position.set(o.x,p[c.z]+height,o.z);m.rotation.y=Math.atan2(p[c.ty],p[c.tx])+facing;m.name=name;root.add(m);
   const pole=new THREE.Mesh(new THREE.BoxGeometry(.12,height-h/2,.12),metal);pole.position.set(o.x,p[c.z]+(height-h/2)/2,o.z);pole.castShadow=true;root.add(pole);};
  // A measured lane crosses the lap from its centreline: its outer wall starts only once the lane is off the asphalt
  // (gerar_pista.py), and the board stands just ahead of that wall's end, off the lap too.
  const outerEnds=pit.walls.filter(w=>w.name==='Muro_externo_boxes').flatMap(w=>[w.points[0],w.points.at(-1)]).map(q=>nearestS(q[0],q[1]));
  const outerStart=outerEnds.length?(rev?Math.max(...outerEnds):Math.min(...outerEnds)):entry(6),signS=rev?Math.min(entry(6),outerStart+3):Math.max(entry(6),outerStart-3);
  place(board('PIT','ENTRADA DOS BOXES','#12463b','#fff6c9'),signS,lerpHi(signS)+1.4,2.6,2.2,1.1,'Placa_entrada_boxes');
  place(board('60','LIMITE NO PIT LANE','#ffffff','#b0161d'),limitStart+before(4),lerpHi(limitStart+before(4))+.8,2.4,1.6,.8,'Placa_limite_60');
  place(board('FIM','LIMITE DE VELOCIDADE','#ffffff','#1b2a2c'),limitEnd-before(2),lerpHi(limitEnd-before(2))+.8,2.4,1.6,.8,'Placa_fim_limite');
  function lerpHi(s){return lerp(s)[c.hi];}
 }
 return {root,obstacles,box,garages,stats:{length:pit.length_m,bays,walls:pit.walls.length,limitKmh:pit.limit.kmh,box99:!!box}};
}
