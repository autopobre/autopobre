import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {LIVERY_99,TEAM_PAINTS,PLATE_NAMES,teamPaint,numberSticker} from './immersive-visuals.js';
import {OPENINGS} from './car-openings.js';
import {finishMaterial,physicalPaint,setCarTone} from './car-finish.js';
// The rivals' liveries (immersive-visuals.js rivalCar; the player's car in a team's colours, CarLivery): each car's
// number and two to four sets of sponsors (made-up local businesses, the circuits' own banners among them), twin
// stripes on some, cut from one shared canvas and bent onto the body, merged into the car's four number stickers:
// one material for the whole field and no draw call more than the numbers alone (immersive-visuals.js numberPlates
// and liveryShapes cast the shapes once per model). Before, all fourteen were the same clean Opala in another colour.
// The sponsors: [name, small line or '', plate colour or null (lettering only), letters, outline or null]. Obvious
// jokes only, never a name that could be a real business, and no phone numbers (user, 2026-10-05; sponsors.js).
export const SPONSORS=Object.freeze([
 ['RETÍFICA DO ZÉ','MOTORES','#1d1f22','#f2c418',null],['PNEU REDONDINHO','RECAPAGEM','#f2c418','#141516',null],
 ['FREIOS SEGURA PEÃO','',null,'#f4f3ee','#101314'],['MOLAS PULA-PULA','SUSPENSÃO','#f4f3ee','#b3151c',null],
 ['ÓLEO GROSSO DO VÔ','LUBRIFICANTES','#2f9b4b','#ffffff',null],['OFICINA DA BLAZER','',"#1f4fb5",'#ffffff',null],
 ['VELAS PEGA DE PRIMEIRA','',"#e8731c",'#141516',null],['AUTO PEÇAS PEÇA-PEÇA','','#ffffff','#1f4fb5',null],
 ['RADIADORES FERVE NUNCA','','#6cb6e8','#141516',null],['ESCAPAMENTOS ACORDA-VIZINHO','',null,'#f4f3ee','#101314'],
 ['LANCHONETE DA TIA','SALGADOS · CAFÉ','#ffffff','#c81d25',null],['GUINCHO QUEBROU-LIGOU','','#f2c418','#141516',null],
 ['BORRACHARIA DO TICO','','#141516','#ffffff',null],['TINTAS PINTA E BORDA','','#ffffff','#2a5cc4',null],
 ['AMORTECEDORES MOLENGA','',null,'#f2c418','#101314'],['VIDRAÇARIA TRINCOU-TROCOU','','#dfe9ef','#1d4f7a',null]
]);
// Where the sets go (car frame: x forward, y up, z right; immersive-visuals.js bendOnBody): plate is the number
// sticker the shape is merged into (0 left side, 1 right, 2 roof, 3 tail), hinge the opening it rides on the player's
// car; grid: the cells the shape is cast in (more along a curve). Sizes keep the canvas cells' 5:1 (the windscreen
// banner a little wider).
export const LIVERY_SLOTS=Object.freeze({
 porta_e:{plate:0,hinge:'driverDoor',at:[.3,.5,-.9],right:[-1,0,0],up:[0,1,0],w:.84,h:.168},
 porta_d:{plate:1,hinge:'passengerDoor',at:[.3,.5,.9],right:[1,0,0],up:[0,1,0],w:.84,h:.168},
 porta_baixa_e:{plate:0,hinge:'driverDoor',at:[.3,.36,-.9],right:[-1,0,0],up:[0,1,0],w:.42,h:.084},
 porta_baixa_d:{plate:1,hinge:'passengerDoor',at:[.3,.36,.9],right:[1,0,0],up:[0,1,0],w:.42,h:.084},
 paralama_e:{plate:0,at:[1.08,.52,-.9],right:[-1,0,0],up:[0,1,0],w:.3,h:.06},
 paralama_d:{plate:1,at:[1.08,.52,.9],right:[1,0,0],up:[0,1,0],w:.3,h:.06},
 lateral_e:{plate:0,at:[-.55,.5,-.9],right:[-1,0,0],up:[0,1,0],w:.38,h:.076},
 lateral_d:{plate:1,at:[-.55,.5,.9],right:[1,0,0],up:[0,1,0],w:.38,h:.076},
 capo:{plate:2,hinge:'hood',at:[1.66,.9,0],right:[0,0,-1],up:[-1,0,0],w:1.06,h:.212},
 parabrisa:{plate:2,at:[.2,1.31,0],right:[0,0,-1],up:[-.877,.481,0],w:1.02,h:.15,grid:[18,3]},
 tampa:{plate:3,hinge:'trunk',at:[-1.98,.9,0],right:[0,0,1],up:[1,0,0],w:.8,h:.16},
 faixas_capo:{plate:2,hinge:'hood',stripes:[-.2,.2],at:[1.58,.9,0],right:[0,0,-1],up:[-1,0,0],w:.13,h:1.32,grid:[2,30]},
 faixas_tampa:{plate:3,hinge:'trunk',stripes:[-.2,.2],at:[-1.98,.9,0],right:[0,0,1],up:[1,0,0],w:.13,h:.62,grid:[2,16]}
});
// Each car's sets: the main sponsor (SPONSORS index) on the bonnet, trunk lid and windscreen, the others on doors,
// fenders and quarters; stripes in the team's stripe colour. Car 70 keeps its doors for the Old Stock ads. tone: a
// second colour below a line round the body ([colour, height in m], car-finish.js setCarTone), so the reds, the
// oranges and the whites of the field part; rim: the wheels' face painted or gold (RIM_STYLES), not all polished.
export const LIVERY_PLANS=Object.freeze({
 '73':{main:0,sets:['capo','parabrisa','porta','paralama'],others:[3,6]},
 '00':{main:1,sets:['capo','tampa','parabrisa','faixas_capo'],others:[8],rim:'branca'},
 '7':{main:2,sets:['tampa','parabrisa','porta','lateral'],others:[12,4],rim:'ouro'},
 '64':{main:3,sets:['capo','porta','paralama'],others:[0,14],tone:[0x161718,.42],rim:'preta'},
 '2':{main:4,sets:['capo','tampa','faixas_capo','parabrisa'],others:[],tone:[0x2a5cc4,.36]},
 '19':{main:5,sets:['tampa','parabrisa','porta','porta_baixa'],others:[9,15],rim:'preta'},
 '51':{main:6,sets:['capo','porta','faixas_tampa','lateral'],others:[2,11]},
 '93':{main:7,sets:['capo','parabrisa','porta','paralama'],others:[13,1],tone:[0x232528,.4]},
 '312':{main:8,sets:['capo','tampa','lateral'],others:[10],rim:'branca'},
 '70':{main:9,sets:['capo','tampa','parabrisa','paralama'],others:[5],tone:[0x1f4fb5,.34]},
 '9':{main:10,sets:['porta','parabrisa','faixas_capo','paralama'],others:[11]},
 '74':{main:11,sets:['capo','tampa','parabrisa','lateral'],others:[7],tone:[0xe9e7df,.4]},
 '88':{main:12,sets:['capo','porta','porta_baixa'],others:[4,6],rim:'preta'},
 '42':{main:13,sets:['capo','faixas_capo','porta','tampa'],others:[15],rim:'ouro'}
});
// A car's two-tone and rims (rivalCar; null: one colour, polished rims).
export const liveryLook=number=>({tone:LIVERY_PLANS[number]?.tone??null,rim:LIVERY_PLANS[number]?.rim??null});
// The rims' faces (the GLB's Aluminio_rodas under the wheel pivots; the polished lip stays): style is also the
// spinning wheel's disc tint (car-wheels.js, contact-shadows.js). paint: a clear-coated colour; metal: gold.
export const RIM_STYLES=Object.freeze({ouro:Object.freeze({style:1,metal:[.86,.62,.25]}),branca:Object.freeze({style:2,paint:0xe6e6e1}),preta:Object.freeze({style:3,paint:0x18191b})});
// One material per style and GLB material, shared by the field (no draw call more: the wheels are drawn apart anyway).
// A hit is finished again: clearCircuit disposes it with the old field, which drops it from car-finish.js's list
// (it would keep the old circuit's map and level for good).
// The entries of a GLB material go with it (a model reloaded brings new ones: they would pile up, kept for good).
const rimCache=new Map(),rimSources=new WeakSet();
export function rimMaterial(style,m){
 const S=RIM_STYLES[style],key=style+':'+m.uuid;if(!S)return m;if(rimCache.has(key))return finishMaterial(rimCache.get(key));
 if(!rimSources.has(m)){rimSources.add(m);m.addEventListener('dispose',()=>{rimSources.delete(m);for(const k of [...rimCache.keys()])if(k.endsWith(':'+m.uuid))rimCache.delete(k);});}
 const c=m.clone();c.name=m.name+'_'+style;
 if(S.metal){c.userData={...c.userData,carFinish:'chrome',finishBase:{...(c.userData.finishBase??{}),roughness:.18,color:S.metal}};c.color.fromArray(S.metal);}
 else{c.userData={...c.userData,carFinish:'paint'};c.color.setHex(S.paint);}
 // A painted face is the paint's own physical material (clear coat): a standard clone is upgraded first.
 const out=finishMaterial(S.paint?physicalPaint(c,true):c);rimCache.set(key,out);return out;
}
export const sharedRims=()=>[...rimCache.values()];
const LIVERY_PLANS_ORDER=Object.freeze(Object.keys(LIVERY_PLANS));
// The slots of a car's plan, each with what it shows: a sponsor (index) or the stripes (null).
export function liveryParts(number){
 const plan=LIVERY_PLANS[number];if(!plan)return [];const out=[];let k=0;const other=()=>plan.others.length?plan.others[k++%plan.others.length]:plan.main;
 for(const set of plan.sets){
  if(set==='porta'||set==='porta_baixa'){const s=set==='porta'?plan.main:other();out.push(['porta_e'.replace('porta',set),s],['porta_d'.replace('porta',set),s]);}
  else if(set==='paralama'||set==='lateral'){const s=other();out.push([set+'_e',s],[set+'_d',s]);}
  else out.push([set,set.startsWith('faixas')?null:plan.main]);
 }
 return out;
}
// The shared canvas: the field's numbers (white italics outlined in black, as numberSticker draws them) in 5 x 3
// cells over the sponsors' 3 x 8, the last cell plain white (the stripes, tinted by vertex colour).
export const LIVERY_ATLAS=Object.freeze({size:1024,number:[204,160,5],logo:[340,68,3],logoTop:480});
// A cell's corners in texture space (v up, the canvas drawn top down), a touch inside it.
function cellUV(x,y,w,h){const S=LIVERY_ATLAS.size,i=1.5;return [(x+i)/S,1-(y+h-i)/S,(x+w-i)/S,1-(y+i)/S];}
export function liveryCell(kind,index){
 const A=LIVERY_ATLAS;
 if(kind==='number'){const [w,h,cols]=A.number;return cellUV(index%cols*w,Math.floor(index/cols)*h,w,h);}
 const [w,h,cols]=A.logo;return cellUV(index%cols*w,A.logoTop+Math.floor(index/cols)*h,w,h);
}
export const STRIPE_CELL=SPONSORS.length;
function drawAtlas(){
 const A=LIVERY_ATLAS,c=document.createElement('canvas');c.width=c.height=A.size;const ctx=c.getContext('2d');ctx.lineJoin='round';
 LIVERY_PLANS_ORDER.forEach((number,i)=>{const [w,h,cols]=A.number,x=i%cols*w+w/2,y=Math.floor(i/cols)*h+h*.54;
  ctx.font='italic 900 136px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=13;ctx.strokeStyle='#101314';ctx.strokeText(number,x,y,w*.89);ctx.fillStyle='#f4f3ee';ctx.fillText(number,x,y,w*.89);});
 const [w,h,cols]=A.logo;
 SPONSORS.forEach(([name,small,plate,ink,outline],i)=>{
  const x=i%cols*w,y=A.logoTop+Math.floor(i/cols)*h,p=4;ctx.save();ctx.translate(x,y);
  if(plate){ctx.fillStyle=plate;ctx.beginPath();ctx.roundRect(p,p,w-2*p,h-2*p,9);ctx.fill();ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=2;ctx.stroke();}
  ctx.textAlign='center';ctx.textBaseline='middle';const big=small?h*.5:h*.62,cy=small?h*.4:h*.53;
  ctx.font=`italic 900 ${big}px Arial`;if(outline){ctx.lineWidth=7;ctx.strokeStyle=outline;ctx.strokeText(name,w/2,cy,w-26);}ctx.fillStyle=ink;ctx.fillText(name,w/2,cy,w-26);
  if(small){ctx.font=`bold ${h*.22}px Arial`;ctx.fillText(small,w/2,h*.79,w-60);}
  ctx.restore();});
 {const i=STRIPE_CELL,x=i%cols*w,y=A.logoTop+Math.floor(i/cols)*h;ctx.fillStyle='#ffffff';ctx.fillRect(x+2,y+2,w-4,h-4);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
// The field's one decal material: under the paint's clear coat (car-finish.js decal), vertex colours tint the stripes.
let shared=null;
export function liveryMaterial(){
 // Finished again on every hand-out, like the rims (a disposed one left the finish's list).
 if(shared)return finishMaterial(shared);
 shared=finishMaterial(new THREE.MeshPhysicalMaterial({name:'Numero_colado',map:typeof document==='undefined'?null:drawAtlas(),vertexColors:true,transparent:true,depthWrite:false,roughness:.35,clearcoat:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 return shared;
}
export const sharedLivery=()=>shared?[shared,shared.map].filter(Boolean):[];
// One sticker shape (uv over 0..1) cut to a cell of the canvas, every vertex the colour given.
function cut(geometry,[u0,v0,u1,v1],color=[1,1,1]){
 const g=geometry.clone(),uv=g.attributes.uv,n=g.attributes.position.count,c=new Float32Array(n*3);
 for(let i=0;i<uv.count;i++)uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0));
 for(let i=0;i<n;i++)c.set(color,i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;
}
// A car's four number stickers with its livery merged in. plates: the model's four number shapes (numberPlates);
// shapes: its livery slots' shapes (liveryShapes, by slot name). apart: slot names kept as separate geometries
// (the player's car: what sits on a door, the bonnet or the trunk lid rides its hinge), returned as extra.
// Null for a number not on the canvas (the caller draws it alone, numberSticker).
export function liveryPlates(entry,plates,shapes,{apart=false}={}){
 const index=LIVERY_PLANS_ORDER.indexOf(entry.number);if(index<0)return null;
 const parts=plates.map(g=>[cut(g,liveryCell('number',index))]),hinged=new Map();
 const stripe=new THREE.Color().setHex(entry.stripe??0xe4e4d5).toArray();
 // Stripes first: drawn in order within one shape (no depth write), the bonnet's sponsor lies over them.
 for(const [slot,sponsor] of liveryParts(entry.number).sort((a,b)=>(a[1]===null?0:1)-(b[1]===null?0:1))){
  const S=LIVERY_SLOTS[slot],g=shapes[slot];if(!g)continue;
  const piece=cut(g,liveryCell('logo',sponsor===null?STRIPE_CELL:sponsor),sponsor===null?stripe:[1,1,1]);
  if(apart&&S.hinge){if(!hinged.has(S.hinge))hinged.set(S.hinge,[]);hinged.get(S.hinge).push(piece);}else parts[S.plate].push(piece);
 }
 const merge=list=>{const g=list.length>1?mergeGeometries(list,false):list[0];if(list.length>1)list.forEach(x=>x.dispose());return g;};
 return {plates:parts.map(merge),extra:[...hinged].map(([hinge,list])=>({hinge,geometry:merge(list)}))};
}
// What sits inside the shut trunk (glTF extra "interno" behind the rear axle: the tub, its floor, the fuel cell
// hanging through it): drawn only while the lid is open (car-openings.js), as at the pit stop and in the paddock.
// Shut, nothing of it shows but its underside: from a low camera behind the car (the story's grid) the tub's pale
// floor and the cell's box hung under the bumper. The lid's own inner panel goes with the lid.
export function trunkInside(model){
 const out=[],lid=model.getObjectByName(OPENINGS.trunk),box=new THREE.Box3(),c=new THREE.Vector3(),m=new THREE.Matrix4();
 model.updateMatrixWorld(true);const toCar=model.matrixWorld.clone().invert();
 model.traverse(o=>{
  if(!o.isMesh||!o.userData.interno)return;for(let q=o;q;q=q.parent)if(q===lid)return;
  o.geometry.computeBoundingBox();box.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(toCar,o.matrixWorld));if(box.getCenter(c).x<-1.45)out.push(o);
 });
 return out;
}
export function showTrunkInside(list,openings){const open=!!openings?.isOpen(OPENINGS.trunk);for(const o of list??[])o.visible=open;}
// The 99's side numbers are flat grids (2 cm cells) laid along the rear quarters; the passenger's runs on round the
// tail's corner, where the body turns in faster than its cells: there a cell cut across the corner up to 2 cm off the
// paint, a white sliver at the bumper's join from behind (round-2 judges, the story's grid). Its cells past DECAL_TAIL
// (car frame, metres) are folded away on the template as loaded (every clone shares the geometry); the number itself
// ends ahead of it.
export const DECAL_TAIL=Object.freeze({names:/^Adesivo_(passageiro|motorista)_99$/,x:-2.085});
export function trimDecalTails(model){
 model.updateMatrixWorld(true);const toCar=model.matrixWorld.clone().invert(),m=new THREE.Matrix4(),v=new THREE.Vector3();let folded=0;
 model.traverse(o=>{
  const g=o.geometry;if(!o.isMesh||!g?.index||g.userData.decalTail||!DECAL_TAIL.names.test([o.material].flat()[0]?.name??''))return;
  m.multiplyMatrices(toCar,o.matrixWorld);const p=g.attributes.position,index=g.index;
  for(let t=0;t<index.count;t+=3){let x=0;for(let k=0;k<3;k++)x+=v.fromBufferAttribute(p,index.getX(t+k)).applyMatrix4(m).x/3;
   if(x<DECAL_TAIL.x){const a=index.getX(t);index.setX(t+1,a);index.setX(t+2,a);folded++;}}
  index.needsUpdate=true;g.userData.decalTail=true;
 });
 return folded;
}
// The player's Opala in another team's colours (Modo Corrida's car selection, race-roster.js): the 99's
// sponsors, names and numbers hidden, body and stripe repainted, the car's own number where the 99
// carries its 99, and car 70's Old Stock ads on the doors (on their hinges, so they swing with them).
// Done in place on the loaded model, so wheels, hinges, mirrors and cockpit stay as they are, and
// undone (clear) before anything is cloned from it: the rivals, the paddock's Opala, the 99 that
// Stevan Gaipo races, the car screen's studio. Paint and plates as the rivals get them (rivalCar).
export class CarLivery {
 constructor(){this.number='99';this.hidden=[];this.painted=[];this.decals=[];this.sponsors=[];this.materials=[];this.own=[];this.pivots=[];}
 // entry: the car's race-roster.js entry (null or the 99: the model as loaded). visual: the circuit's
 // ImmersiveVisuals, whose number plates (cast once per model) and door stickers it reuses. doorAds:
 // the material of car 70's ads (main.js, from the track branding).
 apply(model,entry,visual,{doorAds=null}={}){
  this.clear();if(!model||!entry||entry.number==='99')return;
  const underWheel=o=>{for(let q=o.parent;q;q=q.parent)if(q.name.startsWith('Roda_')&&q.name.includes('PIVO'))return true;return false;};
  // Its two-tone and rims as the rival wears them (rivalCar); the wheels' pivots tell the spinning disc (contact-shadows.js).
  this.number=entry.number;const look=liveryLook(entry.number),paints=new Map(),paint=teamPaint(paints,{...entry,tone:look.tone}),style=RIM_STYLES[look.rim]?.style??0;
  model.traverse(o=>{
   if(!o.isMesh){if(style&&o.name.startsWith('Roda_')&&o.name.includes('PIVO')){o.userData.rimStyle=style;this.pivots.push(o);}return;}
   const mats=[o.material].flat();
   if(mats.some(m=>LIVERY_99.test(m.name))){if(o.visible){o.visible=false;this.hidden.push(o);}return;}
   if(mats.some(m=>TEAM_PAINTS.includes(m.name))){this.painted.push([o,o.material]);o.material=Array.isArray(o.material)?mats.map(paint):paint(o.material);}
   else if(style&&o.material?.name==='Aluminio_rodas'&&underWheel(o)){this.painted.push([o,o.material]);o.material=rimMaterial(look.rim,o.material);}
  });
  this.materials.push(...paints.values());
  // The two-tone's line is a height in the mesh's own frame (car-finish.js): a rival's body is merged into the car's,
  // but here each part keeps the GLB's node (a door, the bonnet or the trunk lid on its hinge, a rotated part): those
  // get the car's height in their frame (the model-from-mesh matrix's second row), on their own clone of the paint.
  if(look.tone){
   model.updateMatrixWorld(true);const inverse=model.matrixWorld.clone().invert(),m=new THREE.Matrix4(),framed=new Map();
   for(const [o] of this.painted){
    const e=m.multiplyMatrices(inverse,o.matrixWorld).elements,up=[e[1],e[5],e[9],e[13]];
    if(Math.abs(up[0])+Math.abs(up[2])+Math.abs(up[1]-1)+Math.abs(up[3])<1e-4)continue;
    const move=c=>{if(c.name!=='Pintura_preta')return c;const key=c.uuid+':'+up.map(v=>v.toFixed(4)).join();
     if(!framed.has(key)){const s=finishMaterial(c.clone(),{rosterFinish:entry.finish??null});setCarTone(s,...look.tone,up);framed.set(key,s);this.materials.push(s);}
     return framed.get(key);};
    o.material=Array.isArray(o.material)?o.material.map(move):move(o.material);
   }
  }
  if(!visual)return;
  // The rivals' plates and livery fit this model's body (same frame, the 99's stickers hidden alike); what sits on
  // a door, the bonnet or the trunk lid rides its hinge, as car 70's ads do.
  const plates=visual.numberPlates(model,model),livery=liveryPlates(entry,plates,visual.liveryShapes(model,model),{apart:true});
  const add=(geometry,material,name,list=this.decals)=>{const decal=new THREE.Mesh(geometry,material);decal.name=name;decal.renderOrder=2;model.add(decal);list.push(decal);return decal;};
  if(livery){
   livery.plates.forEach((g,i)=>{add(g,liveryMaterial(),PLATE_NAMES[i]+entry.number);this.own.push(g);});
   for(const {hinge,geometry} of livery.extra){const decal=add(geometry,liveryMaterial(),'Patrocinio_'+hinge,this.sponsors);this.own.push(geometry);model.getObjectByName(OPENINGS[hinge])?.attach(decal);}
  }else{const sticker=numberSticker(entry.number);this.materials.push(sticker);plates.forEach((g,i)=>add(g,sticker,PLATE_NAMES[i]+entry.number));}
  if(doorAds&&entry.number==='70'){
   const body=[];model.traverse(o=>{if(o.isMesh&&o.visible)body.push(o);});
   const doors=[OPENINGS.driverDoor,OPENINGS.passengerDoor].map(name=>model.getObjectByName(name)).filter(Boolean);
   for(const decal of visual.doorStickers(model,doorAds,{body})){
    decal.name='OldStock_no_Opala70';this.decals.push(decal);
    // Onto the nearer door's hinge, keeping its place (the doors are shut at the start).
    decal.geometry.computeBoundingSphere();const at=decal.localToWorld(decal.geometry.boundingSphere.center.clone());
    const near=o=>o.getWorldPosition(new THREE.Vector3()).distanceTo(at),door=[...doors].sort((a,b)=>near(a)-near(b))[0];
    door?.attach(decal);
   }
  }
 }
 // Back to the Opala 99 as loaded. The number shapes belong to the visuals' cache, the livery's material to the
 // field; the livery's merged shapes are this car's own.
 clear(){
  for(const o of this.hidden)o.visible=true;for(const [o,m] of this.painted)o.material=m;
  for(const decal of [...this.decals,...this.sponsors]){decal.removeFromParent();if(decal.name.startsWith('OldStock_'))decal.geometry.dispose();}
  for(const g of this.own)g.dispose();for(const o of this.pivots)delete o.userData.rimStyle;
  for(const m of this.materials){if(m.map?.isCanvasTexture)m.map.dispose();m.dispose();}
  this.hidden=[];this.painted=[];this.decals=[];this.sponsors=[];this.materials=[];this.own=[];this.pivots=[];this.number='99';
 }
}
