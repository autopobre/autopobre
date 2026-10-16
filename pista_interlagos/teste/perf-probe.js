import * as THREE from 'three';
// What a frame costs, part by part of the scene: for medir_pc_fraco.py and for tuning the light levels (Baixo on a
// notebook's integrated video). count() tallies every draw the renderer makes over a few frames (the picture,
// the sun's shadow map, mirrors and reflection captures) by the part it belongs to (parts(): main.js names the
// big ones; any other top-level object goes by its name or its first material's) and, below that, by material.
// hide() takes parts out of the picture, so a check can time the frame without them. Diagnostic only:
// renderBufferDirect is wrapped while counting and given back after.
// Static scenery out of the per-frame matrix work: three.js recomputes, every frame, the matrix of every object that
// keeps matrixAutoUpdate on, and of everything under it. A root placed once (the pit lane, the stands, the trackside)
// and its parts that never move keep the matrices they have; people (bones) and any group holding them stay live, as
// what its module marks userData.live (Box 99's fan); a group its module froze already ends that climb. Returns how many
// objects were frozen.
export function freezeStatic(root){
 if(!root)return 0;const live=new Set();
 root.traverse(o=>{if(o.isBone||o.isCamera||o.isLight||o.userData.live)for(let q=o;q&&q!==root.parent&&!(q!==o&&!q.matrixAutoUpdate);q=q.parent)live.add(q);});
 let frozen=0;root.updateMatrixWorld(true);
 root.traverse(o=>{if(live.has(o)&&o!==root||!o.matrixAutoUpdate)return;o.matrixAutoUpdate=false;frozen++;});
 return frozen;
}
// A big still mesh cut into pieces of `cell` metres (by each triangle's centre, x and z of the scene). One mesh over a
// whole circuit (an open circuit's ground, a street circuit's walls) was drawn whole in every pass: the picture, the
// sun's shadow map, the mirrors; in pieces three.js culls what is out of each view, and the sun's box takes the few
// round the car. Every attribute is kept (the normals were worked out over the whole first, so no seam shows); the
// pieces share the material. Returns the geometries (the one given when it all falls in one cell).
export function splitByCells(geometry,cell){
 const index=geometry.index?.array,pos=geometry.attributes.position.array,count=geometry.attributes.position.count,n=index?index.length:count,cells=new Map();
 for(let t=0;t<n;t+=3){
  const a=index?index[t]:t,b=index?index[t+1]:t+1,c=index?index[t+2]:t+2;
  const key=(Math.floor((pos[a*3]+pos[b*3]+pos[c*3])/(3*cell))+32768)*65536+Math.floor((pos[a*3+2]+pos[b*3+2]+pos[c*3+2])/(3*cell))+32768;
  let list=cells.get(key);if(!list)cells.set(key,list=[]);list.push(a,b,c);
 }
 if(cells.size<2)return [geometry];
 const stamp=new Int32Array(count).fill(-1),local=new Int32Array(count),out=[];let id=0;
 for(const list of cells.values()){
  const order=[],idx=new Uint32Array(list.length);
  for(let i=0;i<list.length;i++){const v=list[i];if(stamp[v]!==id){stamp[v]=id;local[v]=order.length;order.push(v);}idx[i]=local[v];}
  const g=new THREE.BufferGeometry();
  for(const [name,attr] of Object.entries(geometry.attributes)){
   const s=attr.itemSize,src=attr.array,dst=new src.constructor(order.length*s);
   for(let i=0;i<order.length;i++)for(let j=0;j<s;j++)dst[i*s+j]=src[order[i]*s+j];
   g.setAttribute(name,new THREE.BufferAttribute(dst,s,attr.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(order.length>65535?idx:Uint16Array.from(idx),1));g.computeBoundingSphere();out.push(g);id++;
 }
 return out;
}
export class PerfProbe {
 constructor({renderer,scene,parts=()=>[]}){this.renderer=renderer;this.scene=scene;this.parts=parts;this.hidden=new Map();this.counting=null;this.rendered=0;}
 // Which part an object belongs to: a named part it sits in, else its top-level object in the scene.
 owners(){
  const map=new Map();
  for(const [label,root] of this.parts())if(root)root.traverse(o=>{if(!map.has(o))map.set(o,label);});
  for(const top of this.scene.children){if(map.has(top))continue;let label=top.name;if(!label){let material=null;top.traverse(o=>{material??=[o.material??[]].flat()[0]?.name||null;});label=`${top.type}${material?' '+material:''}`;}top.traverse(o=>{if(!map.has(o))map.set(o,label);});}
  return map;
 }
 // Draw calls and triangles per part and per part·material over `frames` frames, and per pass (tela: the
 // picture or its HDR target, sombra: the sun's map, cubo: a reflection capture, alvo: mirrors and the rest).
 count(frames=20){
  if(this.counting)return this.counting;
  const r=this.renderer(),owners=this.owners(),info=r.info.render,original=r.renderBufferDirect,parts={},materials={},passes={},groups={};
  // An object's place in its part: the names of the groups it sits in, two levels below the part's root.
  const place=o=>{const names=[];for(let q=o;q&&owners.get(q.parent)===owners.get(o);q=q.parent)names.unshift(q.name||q.type);return names.slice(0,3).join(' › ');};
  const first=this.rendered;const add=(table,key,calls,tris)=>{const t=table[key]??=[0,0];t[0]+=calls;t[1]+=tris;};
  r.renderBufferDirect=function(camera,scene,geometry,material,object,group){
   const calls=info.calls,tris=info.triangles;original.call(this,camera,scene,geometry,material,object,group);
   const dc=info.calls-calls,dt=info.triangles-tris,target=r.getRenderTarget(),part=owners.get(object)??'outros (passes de tela)';
   const pass=scene===null?'sombra':!target?'tela':target.isWebGLCubeRenderTarget?'cubo':target.width>=r.domElement.width*.4?'tela':`alvo ${target.width}×${target.height}`;
   add(parts,part,dc,dt);add(materials,`${part} · ${material?.name||material?.type||'?'}`,dc,dt);add(passes,pass,dc,dt);add(groups,`${part} · ${place(object)}`,dc,dt);
  };
  return this.counting=new Promise(done=>{
   // Frames the game drew (enforce() runs once in each): an FPS limit skips some of the browser's.
   const tick=()=>{if(this.rendered-first<frames){requestAnimationFrame(tick);return;}frames=this.rendered-first;r.renderBufferDirect=original;this.counting=null;
    const per=table=>Object.fromEntries(Object.entries(table).sort((a,b)=>b[1][0]-a[1][0]).map(([k,[c,t]])=>[k,{calls:+(c/frames).toFixed(1),triangles:Math.round(t/frames)}]));
    done({frames,parts:per(parts),materials:per(materials),groups:per(groups),passes:per(passes)});};
   requestAnimationFrame(tick);
  });
 }
 // Parts by label (as count() names them) out of the picture, or back; '#name' stands for every object of that name.
 hide(labels,hidden=true){
  const owners=this.owners(),wanted=new Set([labels].flat());
  for(const [object,label] of owners){if(!(wanted.has(label)&&!(object.parent&&owners.get(object.parent)===label)||object.name&&wanted.has('#'+object.name)))continue;
   if(hidden){if(!this.hidden.has(object)){this.hidden.set(object,object.visible);object.visible=false;}}else if(this.hidden.has(object)){object.visible=this.hidden.get(object);this.hidden.delete(object);}}
  return [...this.hidden.keys()].length;
 }
 // What the scene graph asks of the processor every frame, per part: objects walked by updateMatrixWorld (those that
 // recompute their matrix), bones and skinned meshes.
 graph(part=null){
  // One part's top groups (name: objects under it, visible or not), to see which hold the count.
  if(part){const root=this.parts().find(([label])=>label===part)?.[1];if(!root)return null;const out={};for(const c of root.children){let n=0;c.traverse(()=>n++);const k=`${c.name||c.type}${c.visible?'':' (oculto)'}`;out[k]=(out[k]??0)+n;}return Object.fromEntries(Object.entries(out).sort((a,b)=>b[1]-a[1]));}
  const owners=this.owners(),out={};
  this.scene.traverse(o=>{const t=out[owners.get(o)??'outros']??={objects:0,auto:0,bones:0,skinned:0,meshes:0};t.objects++;if(o.matrixAutoUpdate)t.auto++;if(o.isBone)t.bones++;if(o.isSkinnedMesh)t.skinned++;if(o.isMesh)t.meshes++;});
  return Object.fromEntries(Object.entries(out).sort((a,b)=>b[1].objects-a[1].objects));
 }
 // Holds hidden parts hidden though the game shows them again each frame (rivals, LOD swaps): call after the game's update.
 enforce(){this.rendered++;for(const object of this.hidden.keys())object.visible=false;}
}
