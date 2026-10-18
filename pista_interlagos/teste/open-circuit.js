import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar} from './physics.js';
import {terrainMaterial,structureMaterial} from './landscape.js';
import {RIVAL_ROSTER,GRID_ROW_SPACING,GRID_START_BACK} from './race-roster.js';
import {canvasTexture} from './pit-textures.js';
import {gantryPosts,groundHeight} from './track-clearance.js';
import {cliffShownHeights,createCliff} from './cliff-scenery.js';
import {splitByCells} from './perf-probe.js';
import {lakeCells} from './sea-water.js';

// Circuits rebuilt from open data (Cascavel, ECPA): data/pista_<id>.json carries the
// centre line and widths measured on 2025 aerial imagery over the OSM trace, the ANADEM
// terrain grid, land cover (ESA WorldCover + OSM) and real building footprints. This
// module draws what Interlagos gets from its Blender GLB: the ground (Sentinel-2 colour
// far away, land cover close up), the asphalt ribbon with its edge lines, the timing
// line, grid slots and the start gantry. Scripts: scripts/circuitos/.

// Land cover grid -> RGBA texture: R woods, G paved/built, B exposed soil.
const COVER_RGB={'0':[0,0,0],'1':[255,0,0],'2':[150,0,30],'3':[0,0,90],'4':[0,140,40],'5':[0,0,255],'6':[0,0,0],'7':[0,255,0]};
// In a city (a street circuit, Floripa) what the land cover calls built-up is paved: sidewalks, squares, yards and
// car parks, not the dusty ground between a rural circuit's sheds.
const CITY_RGB={...COVER_RGB,'4':[0,235,0],'5':[0,170,50]};
export function coverTexture(cover,{city=false}={}){
 const {nx,ny,classes}=cover,rgba=new Uint8Array(nx*ny*4),table=city?CITY_RGB:COVER_RGB;
 for(let i=0;i<nx*ny;i++){const c=table[classes[i]]??table['0'];rgba[i*4]=c[0];rgba[i*4+1]=c[1];rgba[i*4+2]=c[2];rgba[i*4+3]=255;}
 const texture=new THREE.DataTexture(rgba,nx,ny,THREE.RGBAFormat);
 texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
 return texture;
}

// The terrain grid of data.terrain at the fitted heights (track-clearance.js fitGround),
// triangulated along the (i,j)-(i+1,j+1) diagonal like the Interlagos GLB, with UVs over
// the whole grid for the ground colour and cover textures.
export function terrainMesh(data,heights,material){
 const t=data.terrain,{nx,ny,step,x0,y0}=t,positions=new Float32Array(nx*ny*3),uvs=new Float32Array(nx*ny*2),index=new Uint32Array((nx-1)*(ny-1)*6);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const g=j*nx+i;positions.set([x0+i*step,heights[g],-(y0+j*step)],g*3);uvs.set([i/(nx-1),j/(ny-1)],g*2);}
 let n=0;
 for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const a=j*nx+i,b=a+1,c=a+nx+1,d=a+nx;index[n++]=a;index[n++]=b;index[n++]=c;index[n++]=a;index[n++]=c;index[n++]=d;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(new THREE.BufferAttribute(index,1));geometry.computeVertexNormals();
 // A coastal circuit (meta.sea_level_m, sea-water.js): the bed under the sea's opaque plane is never seen, so its
 // triangles (all three corners half a metre under the surface) are left out, and with them their shading (the normals
 // were worked out with them: the shore's look stays). On a lake (meta.lake, sea-water.js lakeCells) only the lake's own:
 // the ground round it that lies lower (the valley below Pampulha's dam) is land.
 const sea=data.meta.sea_level_m;
 if(sea!=null){const deep=sea-.5,wet=lakeCells(data),shown=g=>heights[g]>=deep||!!wet&&!wet[g];let kept=0;for(let k=0;k<n;k+=3)if(shown(index[k])||shown(index[k+1])||shown(index[k+2])){index[kept++]=index[k];index[kept++]=index[k+1];index[kept++]=index[k+2];}geometry.setIndex(new THREE.BufferAttribute(index.subarray(0,kept),1));}
 // In pieces of 400 m (perf-probe.js splitByCells): the 400 to 500 thousand triangles of the grid were all drawn every
 // frame. After the rest of the opaque world, as Interlagos' ground (main.js): its costly shading skips what the road,
 // the buildings, the walls and the cars cover.
 const group=new THREE.Group();group.name='Terreno_ANADEM';
 for(const piece of splitByCells(geometry,400)){const mesh=new THREE.Mesh(piece,material);mesh.name='Terreno_ANADEM';mesh.receiveShadow=true;mesh.renderOrder=.25;group.add(mesh);}
 if(group.children.length>1)geometry.dispose();
 return group;
}

export async function createOpenCircuit(data,roadSurface,{heights,textures,field,groundUrl,label,mobile=false,city=null}){
 const root=new THREE.Group();root.name='Circuito_'+data.meta.id;
 const loader=new THREE.TextureLoader(),ground=await loader.loadAsync(groundUrl);ground.colorSpace=THREE.SRGBColorSpace;ground.anisotropy=4;
 const cover=coverTexture(data.scenery.cover,{city:!!data.meta.street}),groundMaterial=terrainMaterial(textures,field,{ortho:ground,cover,mobile,steep:!!data.scenery.cliff,city:city&&{...city,asphalt:roadSurface.material.map}});groundMaterial.userData.terrain=true;
 // Kept on the material too, so clearing the circuit (main.js) disposes it with the map.
 groundMaterial.coverMap=cover;
 // On a plateau's rim (Chapada dos Sonhos, cliff-scenery.js) no grid triangle leans across the lip: the wall and the
 // ground along its top are drawn apart.
 root.add(terrainMesh(data,data.scenery.cliff?cliffShownHeights(data,heights):heights,groundMaterial));
 const probe=new TestCar(data),a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m;
 const cliff=data.scenery.cliff?createCliff(data,{groundMaterial,probe,mobile}):null;if(cliff)root.add(cliff.root);
 // Road height at (x, y): the plane the car drives on, drawn 3.5 cm above it like the GLB asphalt.
 const road=(x,y,i)=>{probe.index=i;return probe.sample(x,y,i).z-.02;};
 function strip(from,to,material,name,lift=0,{s0=-Infinity,s1=Infinity}={}){
  const positions=[],uv=[],indices=[];
  for(let k=0;k<=n;k++){
   const i=k%n,p=a[i];
   for(const f of [from,to]){const d=f(p),x=p[1]+p[9]*d,y=p[2]+p[10]*d;positions.push(x,road(x,y,i)+lift,-y);uv.push(d/2,(k===n?L:p[0])/2);}
   if(k&&a[k-1][0]>=s0&&a[k-1][0]<=s1){const b=(k-1)*2;indices.push(b,b+2,b+1,b+1,b+2,b+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(material===roadSurface.material?roadSurface.geometry(g):g,material);mesh.name=name;mesh.receiveShadow=true;root.add(mesh);return mesh;
 }
 strip(p=>-p[4]/2,p=>p[4]/2,roadSurface.material,'Asfalto');
 // Worn like the GLB's lines (landscape.js structureMaterial 'paint').
 const paint=structureMaterial(new THREE.MeshStandardMaterial({name:'Pintura_borda',color:0xe8e4d6,roughness:.7,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),textures);
 for(const side of [-1,1])strip(p=>side*(p[4]/2-.32),p=>side*(p[4]/2-.18),paint,side<0?'Linha_borda_direita':'Linha_borda_esquerda',.006);
 // Timing line: two rows of checks across the asphalt at s = 0.
 const check=canvasTexture((ctx,w,h)=>{const cells=16;for(let r=0;r<2;r++)for(let c=0;c<cells;c++){ctx.fillStyle=(r+c)%2?'#141414':'#f1eee4';ctx.fillRect(c*w/cells,r*h/2,w/cells,h/2);}},512,64);
 const p0=a[0],w0=p0[4],line=new THREE.Mesh(new THREE.PlaneGeometry(w0-.4,1.3),new THREE.MeshStandardMaterial({name:'Linha_chegada',map:check,roughness:.7,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
 // The plane's width (x) lies across the track: a quarter turn from the gantry, whose span is along z.
 line.rotation.order='YXZ';line.rotation.y=Math.atan2(p0[8],p0[7])-Math.PI/2;line.rotation.x=-Math.PI/2;line.position.set(p0[1],road(p0[1],p0[2],0)+.008,-p0[2]);line.name='Linha_chegada';line.receiveShadow=true;root.add(line);
 // Grid slots behind the line: the player's box and the fourteen rivals', staggered.
 const slots=[{s:L-GRID_START_BACK,d:0}];
 for(let slot=0;slot<RIVAL_ROSTER.length;slot++)slots.push({s:L-GRID_START_BACK+(Math.ceil(RIVAL_ROSTER.length/2)-Math.floor(slot/2))*GRID_ROW_SPACING+8-(slot%2)*2,d:slot%2?2.2:-2.2});
 const gridParts=[],mark=new THREE.MeshStandardMaterial({name:'Marcas_grid',color:0xe8e4d6,roughness:.7,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 for(const {s,d} of slots){
  const i=Math.min(n-1,Math.max(0,a.findIndex(q=>q[0]>=((s%L)+L)%L))),p=a[i],ahead=2.6;
  for(const [along,across,len,wid] of [[ahead,0,.14,2.2],[ahead-.9,-1.05,1.8,.12],[ahead-.9,1.05,1.8,.12]]){
   const g=new THREE.PlaneGeometry(wid,len).rotateX(-Math.PI/2).rotateY(Math.atan2(p[8],p[7])-Math.PI/2);
   const x=p[1]+p[7]*along+p[9]*(d+across),y=p[2]+p[8]*along+p[10]*(d+across);g.translate(x,road(x,y,i)+.008,-y);gridParts.push(g);
  }
 }
 const grid=new THREE.Mesh(mergeGeometries(gridParts,false),mark);grid.name='Marcas_grid';grid.receiveShadow=true;root.add(grid);gridParts.forEach(g=>g.dispose());
 // Start gantry over the timing line with the circuit's name. Its posts keep off the pit
 // lane and its walls (gantryPosts), so on the pit side the beam may reach over the lane;
 // the sign stays centred over the track. The gantry's +z is the track's right.
 const steel=new THREE.MeshStandardMaterial({name:'Portico_metal',color:0x2b3034,metalness:.5,roughness:.5});
 const gantry=new THREE.Group();gantry.name='Portico_largada';gantry.position.set(p0[1],road(p0[1],p0[2],0),-p0[2]);gantry.rotation.y=Math.atan2(p0[8],p0[7]);root.add(gantry);
 const span=w0/2+2.2,[left,right]=gantryPosts(data);
 for(const {side,d,x,y,deck} of [left,right]){
  // Down into the ground where it falls away from the road (behind ECPA's pit wall); on a bridge deck, from the wall top.
  const foot=deck?.5:Math.min(0,(groundHeight(data.terrain,heights,x,y)??gantry.position.y)-gantry.position.y)-.3;
  const post=new THREE.Mesh(new THREE.BoxGeometry(.35,7.4-foot,.35),steel);post.position.set(0,(7.4+foot)/2,-side*d);post.castShadow=true;post.name='Portico_poste';gantry.add(post);
 }
 const beam=new THREE.Mesh(new THREE.BoxGeometry(.5,1.5,left.d+right.d+.4),steel);beam.position.set(0,7.2,(right.d-left.d)/2);beam.castShadow=true;beam.name='Portico_viga';gantry.add(beam);
 const sign=canvasTexture((ctx,w,h)=>{ctx.fillStyle='#172b27';ctx.fillRect(0,0,w,h);ctx.fillStyle='#ffdb32';ctx.font='bold 66px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,w/2,h/2,w*.94);},1024,128);
 // Lit like the billboards (track-surface.js): it takes the sun and the shade of the beam, never glows.
 const signMaterial=new THREE.MeshStandardMaterial({name:'Portico_placa',map:sign,color:0xdadada,roughness:.6});
 for(const side of [-1,1]){const face=new THREE.Mesh(new THREE.PlaneGeometry(span*2,1.25),signMaterial);face.rotation.y=side*Math.PI/2;face.position.set(side*.26,7.2,0);gantry.add(face);}
 // Camera proxies in world space (the root stays at the origin).
 root.updateMatrixWorld(true);const obstacles=[];gantry.traverse(o=>{if(o.isMesh&&o.name.startsWith('Portico_')){const proxy=new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld));proxy.name=o.name;obstacles.push(proxy);}});
 return {root,ground,cover,obstacles,stats:{gridSlots:slots.length,terrainVertices:data.terrain.nx*data.terrain.ny,cliff:cliff?.stats}};
}
