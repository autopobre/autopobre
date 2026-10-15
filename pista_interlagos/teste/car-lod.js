import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// The cars' middle level of detail (immersive-visuals.js rivalCar, fuscaRival): past some metres a rival's 350
// thousand triangles show as a few hundred pixels, and a cheap notebook's video spent more time on the pack than
// on the whole circuit. clusterGeometry keeps the shape: vertices closer than `cell` that face the same way (26
// directions, so a crease or both sides of a thin panel stay apart) become one, at their mean; the triangles
// that collapse go.
const DIRECTIONS=27;
// A normal's direction among 26: each axis -1, 0 or 1 past about 22°.
const bucket=(x,y,z)=>((x>.38?2:x<-.38?0:1)*3+(y>.38?2:y<-.38?0:1))*3+(z>.38?2:z<-.38?0:1);
export function clusterGeometry(geometry,{cell=.025}={}){
 const pos=geometry.attributes.position,nor=geometry.attributes.normal,uv=geometry.attributes.uv,count=pos.count;
 const index=geometry.index,triangles=index?index.count/3:count/3,cluster=new Int32Array(count),keys=new Map();
 const sum=[],first=[];let clusters=0;
 for(let i=0;i<count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),nx=nor?nor.getX(i):0,ny=nor?nor.getY(i):1,nz=nor?nor.getZ(i):0;
  // Exact numeric key: cells within ±12 m of the car's origin, then the direction.
  const key=((Math.floor(x/cell)+512)*1024+Math.floor(y/cell)+512)*1024*1024*DIRECTIONS+(Math.floor(z/cell)+512)*DIRECTIONS+bucket(nx,ny,nz);
  let c=keys.get(key);
  if(c===undefined){c=clusters++;keys.set(key,c);sum.push(0,0,0,0,0,0,0);first.push(i);}
  const s=c*7;sum[s]+=x;sum[s+1]+=y;sum[s+2]+=z;sum[s+3]+=nx;sum[s+4]+=ny;sum[s+5]+=nz;sum[s+6]++;cluster[i]=c;
 }
 const position=new Float32Array(clusters*3),normal=new Float32Array(clusters*3),uvs=uv?new Float32Array(clusters*2):null;
 for(let c=0;c<clusters;c++){
  const s=c*7,n=sum[s+6],f=first[c];position[c*3]=sum[s]/n;position[c*3+1]=sum[s+1]/n;position[c*3+2]=sum[s+2]/n;
  let nx=sum[s+3],ny=sum[s+4],nz=sum[s+5],l=Math.hypot(nx,ny,nz);
  // Opposite normals in one cluster cancel: the first vertex's normal then.
  if(l<1e-4&&nor){nx=nor.getX(f);ny=nor.getY(f);nz=nor.getZ(f);l=Math.hypot(nx,ny,nz)||1;}
  normal[c*3]=nx/l;normal[c*3+1]=ny/l;normal[c*3+2]=nz/l;
  if(uvs){uvs[c*2]=uv.getX(f);uvs[c*2+1]=uv.getY(f);}
 }
 const kept=[];
 for(let t=0;t<triangles;t++){
  const a=cluster[index?index.getX(t*3):t*3],b=cluster[index?index.getX(t*3+1):t*3+1],c=cluster[index?index.getX(t*3+2):t*3+2];
  if(a!==b&&b!==c&&a!==c)kept.push(a,b,c);
 }
 const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.BufferAttribute(position,3));out.setAttribute('normal',new THREE.BufferAttribute(normal,3));
 if(uvs)out.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
 out.setIndex(clusters>65535?new THREE.Uint32BufferAttribute(kept,1):new THREE.Uint16BufferAttribute(kept,1));out.computeBoundingSphere();return out;
}

// A rival's middle level of detail: its bodywork as seen from some metres off, light. The team's paint (keep: its
// own materials, so the dirt, the two-tone and the finish match the close model's) and all the rest in one mesh of
// vertex colours (`material`: the distant model's), the windows dark as on the distant model; no cabin (skip, by
// material or group name), the wheels plain discs (a rim in motion reads as a disc anyway). The shapes are worked
// out once per model and kept in `cache` under `key`: the next rivals of that model share them, each in its paint.
const GLASS=new THREE.Color(.02,.025,.03),TYRE=new THREE.Color(.025,.025,.025),RIM=new THREE.Color(.2,.2,.21);
// Lamps keep their colour lit by day (their own is the clear lens over a coloured reflector or a map).
const LAMPS=[[/Lanterna|vermelh/i,new THREE.Color(.5,.02,.02)],[/ambar|Seta/i,new THREE.Color(.6,.28,.02)],[/farol|Refletor|LED/i,new THREE.Color(.8,.78,.6)]];
const tint=m=>m.transparent||m.opacity<1||m.transmission>0?(LAMPS.find(([r])=>r.test(m.name))?.[1]??GLASS):LAMPS.find(([r])=>r.test(m.name))?.[1]??m.color??RIM;
export function midLevel({detail,root,keep,skip,wheels=[],radius=.316,material,cache,key,cell=.06}){
 let shape=cache.get(key);
 if(!shape){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),pivots=new Set(wheels.map(w=>w.obj)),own=new Map(),coloured=[],m=new THREE.Matrix4();
  // Left out: what is hidden, the wheels (on their pivots), the cabin's groups.
  const out=o=>{for(let q=o;q&&q!==root;q=q.parent)if(!q.visible||pivots.has(q)||skip.test(q.name))return true;return false;};
  const paint=(g,color)=>{const c=new Float32Array(g.attributes.position.count*3);for(let i=0;i<c.length;i+=3){c[i]=color.r;c[i+1]=color.g;c[i+2]=color.b;}g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;};
  detail.traverse(o=>{
   if(!o.isMesh||o.isSkinnedMesh||Array.isArray(o.material)||o.renderOrder>0||out(o))return;
   const mat=o.material,name=mat.name||'';if(skip.test(name))return;
   const g=o.geometry.clone();for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
   if(!g.attributes.normal)g.computeVertexNormals();g.applyMatrix4(m.multiplyMatrices(inverse,o.matrixWorld));
   const c=clusterGeometry(g,{cell});g.dispose();
   if(keep.test(name)){if(!c.attributes.uv)c.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(c.attributes.position.count*2),2));if(!own.has(name))own.set(name,[]);own.get(name).push(c);return;}
   c.deleteAttribute('uv');coloured.push(paint(c,tint(mat)));
  });
  // The wheels: a tyre and the rim's face at each pivot.
  const at=new THREE.Vector3();
  for(const w of wheels){
   w.obj.getWorldPosition(at).applyMatrix4(inverse);
   for(const [r,width,color] of [[radius,.2,TYRE],[radius*.64,.212,RIM]])coloured.push(paint(new THREE.CylinderGeometry(r,r,width,14,1).rotateX(Math.PI/2).translate(at.x,at.y,at.z).deleteAttribute('uv'),color));
  }
  const merged=list=>{const g=mergeGeometries(list,false);list.forEach(g=>g.dispose());return g;};
  shape={own:new Map([...own].map(([name,list])=>[name,merged(list)])),coloured:coloured.length?merged(coloured):null};
  cache.set(key,shape);
 }
 const group=new THREE.Group();group.name='Rival_medio';group.visible=false;
 const named=new Map();detail.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)&&o.material.name&&!named.has(o.material.name))named.set(o.material.name,o.material);});
 for(const [name,g] of shape.own){const mesh=new THREE.Mesh(g,named.get(name));mesh.name='Rival_medio_'+name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 if(shape.coloured){const mesh=new THREE.Mesh(shape.coloured,material);mesh.name='Rival_medio_resto';mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 return group;
}
// The meshes under `group` that never move apart from it (a steering wheel's spokes, bolts and stitching; a glove's
// fingers) as one mesh per material: the same picture in a few draws. skip: subtrees left alone (a phone whose screen
// changes, a button that is pressed). Only plain meshes with one material and no children of their own merge.
export function mergeStill(group,{skip=[]}={}){
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),m=new THREE.Matrix4(),lists=new Map(),held=new Set(skip.filter(Boolean));
 const free=o=>{for(let q=o;q&&q!==group;q=q.parent)if(held.has(q))return false;return true;};
 group.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||Array.isArray(o.material)||o.children.length||!o.visible||!free(o)||o.morphTargetInfluences)return;
  const key=`${o.material.uuid}|${o.renderOrder}|${o.castShadow}|${o.receiveShadow}`;if(!lists.has(key))lists.set(key,[]);lists.get(key).push(o);});
 let saved=0;
 for(const list of lists.values()){
  if(list.length<2)continue;
  const names=['position','normal','uv'].filter(k=>list.every(o=>o.geometry.attributes[k])),indexed=list.every(o=>o.geometry.index);
  const parts=list.map(o=>{let g=o.geometry.clone();if(!indexed&&g.index)g=g.toNonIndexed();for(const k of Object.keys(g.attributes))if(!names.includes(k))g.deleteAttribute(k);g.morphAttributes={};return g.applyMatrix4(m.multiplyMatrices(inverse,o.matrixWorld));});
  const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!merged)continue;
  const first=list[0],mesh=new THREE.Mesh(merged,first.material);Object.assign(mesh,{name:first.name||'Lote',renderOrder:first.renderOrder,castShadow:first.castShadow,receiveShadow:first.receiveShadow});
  group.add(mesh);for(const o of list)o.removeFromParent();saved+=list.length-1;
 }
 return saved;
}
// Shapes shared by every rival of a model: never freed with one car (immersive-visuals.js disposeCar).
export const sharedMidShapes=cache=>[...cache.values()].flatMap(s=>[...s.own.values(),s.coloured].filter(Boolean));
