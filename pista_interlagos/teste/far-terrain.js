import * as THREE from 'three';
import {splitByCells} from './perf-probe.js';

// The land far below and around a plateau circuit (Chapada dos Sonhos, data.scenery.far, gerar_chapada.py):
// the Cuiabá lowland, the escarpment running off east and west, the town on the plateau, out to 22 km. Two
// rings of real relief (ANADEM) coloured by the Sentinel-2 picture of the same week: 'medio' (14 km, 40 m)
// round the track's grid and 'longe' (44 km, 160 m) round that. Each ring's nodes under the one inside it
// sink out of sight (its border cell stays, drawn behind: polygonOffset). The picture is a photograph, with the
// light and shade of its own morning: lit again in full by the game's sun the smooth 40 m relief read as a clay
// model (players, 10-11), so its normals lean toward the vertical (RELIEF of the real ones) and the light only
// hints at the slopes. Only the steepest faces, the escarpment's walls seen from afar, take a dull sandstone tint.
// Heights: Int16 decimetres above `offset`, the first row to the north.
// The border cell over the grid's edge stays UNDER m below the ground drawn there: Floripa's relief is Copernicus's
// surface, buildings and all, and in a city open to roam (user, 10-16: the end of the Beira-Mar Norte) the blocks along
// the seafront rose through the avenue as a slanted sheet.
const SANDSTONE=new THREE.Color(.5,.33,.24),RELIEF=.3,UNDER=.3;
// stride: the light build (Baixo) joins every second node (a quarter of the triangles; the grid stays, so the rings and
// the photograph line up as before). under: the ground drawn inside `inside` at (x,y), or null.
async function ring(spec,url,inside,order,stride=1,sea=null,under=null){
 const [buffer,image]=await Promise.all([fetch(url+spec.relief).then(r=>{if(!r.ok)throw new Error(spec.relief);return r.arrayBuffer();}),new THREE.TextureLoader().loadAsync(url+spec.image)]);
 const raw=new Uint16Array(buffer),{nx,ny,step,x0,y0,offset,unit}=spec,y1=y0+(ny-1)*step;
 const pos=new Float32Array(nx*ny*3),uv=new Float32Array(nx*ny*2),steep=new Float32Array(nx*ny*2),sunk=new Uint8Array(nx*ny),index=[];
 const h=(i,j)=>offset+raw[j*nx+i]*unit;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const k=j*nx+i,x=x0+i*step,y=y1-j*step;let z=h(i,j);
  // Under the ring inside, with one cell of overlap at its border (a joined cell with stride: a coarse quad with one
  // corner sunk and one not cut a groove 30-150 m deep along the inner ground's edges).
  const keep=step*stride;
  if(inside&&x>inside.x0+keep&&x<inside.x1-keep&&y>inside.y0+keep&&y<inside.y1-keep){z-=400;sunk[k]=1;}
  else if(under&&x>=inside.x0&&x<=inside.x1&&y>=inside.y0&&y<=inside.y1){const g=under(x,y);if(g!=null)z=Math.min(z,g-UNDER);}
  pos.set([x,z,-y],k*3);uv.set([i/(nx-1),1-j/(ny-1)],k*2);
  const gx=(h(Math.min(nx-1,i+1),j)-h(Math.max(0,i-1),j))/(2*step),gy=(h(i,Math.min(ny-1,j+1))-h(i,Math.max(0,j-1)))/(2*step);
  // [sandstone tint, blur]: a photograph draped from above smears down a steep slope into streaks (one pixel
  // over tens of metres of height); there it is read from a coarser mip, the colour without the streaks.
  const slope=Math.hypot(gx,gy);steep[k*2]=Math.max(0,Math.min(1,(slope-1.1)/.6));steep[k*2+1]=Math.max(0,Math.min(1,(slope-.3)/.5));
 }
 const nodes=n=>{const list=[];for(let k=0;k<n-1;k+=stride)list.push(k);list.push(n-1);return list;},cols=nodes(nx),rows=nodes(ny);
 for(let r=0;r<rows.length-1;r++)for(let q=0;q<cols.length-1;q++){const a=rows[r]*nx+cols[q],b=rows[r]*nx+cols[q+1],c=rows[r+1]*nx+cols[q],d=rows[r+1]*nx+cols[q+1];index.push(a,c,b,b,c,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('steep',new THREE.BufferAttribute(steep,2));g.setIndex(index);g.computeVertexNormals();
 // Left out (the normals above were worked out with them): the cells sunk whole under the ring inside, and on a coastal
 // circuit (meta.sea_level_m) those whole under the sea's opaque plane. They were drawn first and then covered.
 {const y=k=>pos[k*3+1],deep=sea==null?-Infinity:sea-.5,shown=k=>!sunk[k]&&y(k)>=deep,list=[];
  for(let k=0;k<index.length;k+=3)if(shown(index[k])||shown(index[k+1])||shown(index[k+2]))list.push(index[k],index[k+1],index[k+2]);
  g.setIndex(list);}
 const nrm=g.attributes.normal;for(let k=0;k<nrm.count;k++){const x=nrm.getX(k)*RELIEF,y=nrm.getY(k)*RELIEF+(1-RELIEF),z=nrm.getZ(k)*RELIEF,l=Math.hypot(x,y,z);nrm.setXYZ(k,x/l,y/l,z/l);}
 image.colorSpace=THREE.SRGBColorSpace;image.anisotropy=4;
 // The photograph as it comes (as on the ground by the track), lit like the ground; within a few km its woods take a
 // grain of crowns and gaps (two noises over the dark green), which the distance then smooths away.
 const material=new THREE.MeshLambertMaterial({name:'Vale_'+order,map:image,polygonOffset:true,polygonOffsetFactor:2+order*2,polygonOffsetUnits:4+order*4});
 material.onBeforeCompile=shader=>{
  shader.uniforms.sandstone={value:SANDSTONE};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 steep;\nvarying vec2 vSteep;\nvarying vec3 vWorldP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSteep=steep;\nvWorldP=(modelMatrix*vec4(position,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 sandstone;\nvarying vec2 vSteep;\nvarying vec3 vWorldP;\nfloat farHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat farNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(farHash(i),farHash(i+vec2(1,0)),f.x),mix(farHash(i+vec2(0,1)),farHash(i+vec2(1,1)),f.x),f.y);}').replace('#include <map_fragment>','diffuseColor*=mix(texture2D(map,vMapUv),texture2D(map,vMapUv,3.5),vSteep.y);\nfloat farLum=dot(diffuseColor.rgb,vec3(.299,.587,.114)),farWoods=smoothstep(.004,.02,diffuseColor.g-diffuseColor.r)*(1.-smoothstep(.06,.15,farLum));\nfloat farNear=1.-smoothstep(1200.,4500.,length(vWorldP-cameraPosition));\ndiffuseColor.rgb*=1.+farNear*(farWoods*.6*(farNoise(vWorldP.xz/6.5)-.5)+.2*(farNoise(vWorldP.xz/21.)-.5));\ndiffuseColor.rgb=mix(diffuseColor.rgb,sandstone*(.7+.6*dot(diffuseColor.rgb,vec3(.333))),vSteep.x*.55);');
 };
 // After the near ground (.25) and before the sea (.3): only what the nearer world leaves open is shaded. In sectors of
 // a quarter of the ring's span (perf-probe.js splitByCells): drawn whole, the rings sent all their triangles, those
 // behind the camera too, through every pass (some 700 thousand round Pampulha); out of a view a sector is skipped.
 const pieces=splitByCells(g,(spec.nx-1)*spec.step/4),mesh=pieces.length>1?new THREE.Group():new THREE.Mesh(g,material);mesh.name='Vale_'+order;
 if(pieces.length>1){for(const piece of pieces){const part=new THREE.Mesh(piece,material);part.name='Vale_'+order;part.receiveShadow=false;part.renderOrder=.27;mesh.add(part);}g.dispose();}
 else{mesh.frustumCulled=false;mesh.receiveShadow=false;}
 mesh.renderOrder=.27;
 return {mesh,rect:{x0,y0,x1:x0+(nx-1)*step,y1}};
}
// url: the folder of the track's images (circuit.ground's); heights: the grid's heights as drawn (track-clearance.js
// fitGround's; the track file's by default). Resolves to {root, stats} or null.
export async function createFarTerrain(data,url,{stride=1,heights=null}={}){
 const far=data.scenery?.far;if(!far?.medio)return null;
 const t=data.terrain,grid={x0:t.x0,y0:t.y0,x1:t.x0+(t.nx-1)*t.step,y1:t.y0+(t.ny-1)*t.step},z=heights??t.z;
 // The grid's ground at (x,y), on its triangles (split along (i,j)-(i+1,j+1), as drawn).
 const ground=(x,y)=>{const fx=Math.min(t.nx-1.000001,Math.max(0,(x-t.x0)/t.step)),fy=Math.min(t.ny-1.000001,Math.max(0,(y-t.y0)/t.step)),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,a=j*t.nx+i;
  return u>=v?z[a]*(1-u)+z[a+1]*(u-v)+z[a+t.nx+1]*v:z[a]*(1-v)+z[a+t.nx+1]*u+z[a+t.nx]*(v-u);};
 const root=new THREE.Group();root.name='Vale';
 // (A lake, meta.lake, lies wholly inside the grid: the rings are dry land at any height, the valley below Pampulha's dam
 // 10 to 40 m under the lake's level too.)
 const sea=data.meta.lake?null:data.meta.sea_level_m??null,medio=await ring(far.medio,url,grid,0,stride,sea,ground);root.add(medio.mesh);
 let vertices=far.medio.nx*far.medio.ny;
 if(far.longe){const longe=await ring(far.longe,url,medio.rect,1,stride,sea);root.add(longe.mesh);vertices+=far.longe.nx*far.longe.ny;}
 return {root,stats:{vertices}};
}
