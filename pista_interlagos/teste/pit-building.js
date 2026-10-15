import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {skyMirror} from './sky.js';
import {RIVAL_ROSTER} from './race-roster.js';
import {canvasTexture,garageDoors,facadeGlass,FACADE_GLASS_ROWS,tyreWall,css,pitLaneSign} from './pit-textures.js';
import {createPeople} from './pit-crew.js';
import {createBox99,tyreStacks} from './pit-box99.js';
import {curveloPitFrame,inPitBox,garageBays,pitLane} from './pit-lane.js';
import {TestCar,guardrailClearance} from './physics.js';
import {trackPoint} from './immersive-visuals.js';

// Pit buildings shared by the circuits: a row of garages along the pit lane (closed
// bays with their team's roller door and number, glass above, a roof terrace and the
// white membrane canopy on columns and gutter beams), Box 99 with the Lanchonete da Tia,
// and the people. `pit` is laid out like the Interlagos pit block: columns, stations
// along the lane centre (d from it, garages on the positive side), garages and box99;
// optional block (garage depth, 21 m), sink (how far walls go below the lane) and stand.

// Station lookup and positions on a pit block's lane plane.
export function laneFrame(pit){
 const c=Object.fromEntries(pit.columns.map((k,i)=>[k,i])),a=pit.samples,n=a.length;
 const at=(p,d,lift=0)=>new THREE.Vector3(p[c.x]+p[c.lx]*d,p[c.z]+p[c.bank]*d+lift,-(p[c.y]+p[c.ly]*d));
 const index=s=>{let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][c.s]<=s)lo=m;else hi=m-1;}return lo;};
 const lerp=s=>{const i=Math.min(n-2,index(s)),p=a[i],q=a[i+1],u=Math.max(0,Math.min(1,(s-p[c.s])/(q[c.s]-p[c.s])));return p.map((v,k)=>v+(q[k]-v)*u);};
 return {c,lerp,at};
}

export function createPitBuildings({pit,c,lerp,at,root,obstacles,textures,labels}){
 const people=createPeople(),crowd=[],tyres=[],b99=pit.box99,depth=pit.block??21,sink=pit.sink??.3;
 const {bays,bay,open,team:teams}=garageBays(pit,RIVAL_ROSTER.length);
 const mat=(name,color,extra={})=>new THREE.MeshStandardMaterial({name,color,roughness:.9,...extra});
 const concrete=structureMaterial(mat('Concreto',0x8f918b,{side:THREE.DoubleSide}),textures);
 const doors=garageDoors([...RIVAL_ROSTER.map(r=>({number:r.number,name:r.shortName,color:r.color})),undefined]);
 const doorMaterial=new THREE.MeshStandardMaterial({name:'Portas_equipes',map:doors.map,roughness:.55,metalness:.35});
 // (the facade's glass mirrors the sky at its full colour: sky.js SKY_REFLECTION)
 const glass=skyMirror(new THREE.MeshStandardMaterial({name:'Vidros_boxes_fachada',map:facadeGlass(),roughness:.12,metalness:.35}));
 const railGlass=new THREE.MeshStandardMaterial({name:'Terraco_vidro',color:0xcfe6ee,roughness:.05,metalness:.2,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});
 const steel=mat('Aco_cobertura',0xdde1e4,{metalness:.55,roughness:.38});
 const membrane=new THREE.MeshStandardMaterial({name:'Cobertura_membrana',color:0xf4f3ee,emissive:0x2c2c29,roughness:.75,side:THREE.DoubleSide});
 const parts={block:[],frames:[],doors:[],glass:[],rail:[],steel:[],canopy:[]},signs=[];
 const heading=p=>Math.atan2(p[c.ty],p[c.tx]);
 const box=(list,p,d,s,w,thick,h,z0)=>{const g=new THREE.BoxGeometry(w,h,thick),o=at(p,d);g.rotateY(heading(p));g.translate(o.x+p[c.tx]*s,p[c.z]+z0+h/2,o.z-p[c.ty]*s);list.push(g);};
 const plane=(list,p,d,w,h,z0,uv)=>{const g=new THREE.PlaneGeometry(w,h),o=at(p,d);if(uv){const a=g.attributes.uv;for(let k=0;k<a.count;k++)a.setXY(k,uv[0]+a.getX(k)*(uv[2]-uv[0]),uv[1]+a.getY(k)*(uv[3]-uv[1]));}g.rotateY(heading(p));g.translate(o.x,p[c.z]+z0+h/2,o.z);list.push(g);};
 const place=(list,g,p,d,y)=>{const o=at(p,d);g.rotateY(heading(p));g.translate(o.x,y,o.z);list.push(g);};
 // Box 99 and the café next to it are open (floor above and back rooms only); rival
 // teams take the closed garages nearest Box 99, further away the doors are plain.
 const skins=[0xc68e6a,0x8d5a3b,0xe0b08f,0x6b4128,0xb77a55,0xa0694a,0x553322,0xd9a982];
 const slope=Math.tan(.28),panel=bay/2/Math.cos(.28),span=depth+3,mid=depth/2-.5;
 // One seeded draw per bay, per circuit: who stands at the doors and on the terrace, the tyre stacks
 // and which glass the bay shows, so nothing repeats in a fixed every-second or every-third rhythm.
 let seed=(Math.round(pit.garages[0]*10)+bays*7919)>>>0||1;const rnd=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296,pick=list=>list[Math.floor(rnd()*list.length)];
 const tops=[0xf2f0ea,0x2f6db5,0xe690a8,0x1b1d20,0xc8a23a,0x7a8b6f,0xb23a3a,0x4a4f57,0xe8e2d0,0x2e6b4f],bottoms=[0x2d3338,0x3b4a66,0x1b1d20,0x6b5a45,0x8a8f96];
 const look=()=>({skin:pick(skins),hairStyle:pick(['short','short','long','curly','bald']),hair:pick([0x2b1f17,0x1b1410,0x5a3a22,0x8a7a6a]),mustache:rnd()<.2,belly:rnd()*rnd()*.8,glasses:rnd()<.15});
 for(let b=0;b<bays;b++){
  const s=pit.garages[0]+(b+.5)*bay,p=lerp(s),front=(open.has(b)?b99.front:p[c.hi])+.35,hd=heading(p),base=p[c.z];
  if(open.has(b)){box(parts.block,p,front+depth/2,0,bay,depth,3,5.2);if(depth>17)box(parts.block,p,front+(16.5+depth)/2,0,bay,depth-16.5,5.2+sink,-sink);}
  else{
   box(parts.block,p,front+depth/2,0,bay,depth,8.2+sink,-sink);plane(parts.doors,p,front-.03,bay-2.4,4.6,0,doors.uv(teams.get(b)??RIVAL_ROSTER.length));
   box(parts.frames,p,front-.06,0,bay-2.1,.26,.2,4.6);for(const side of [-1,1])box(parts.frames,p,front-.06,side*(bay-2.25)/2,.15,.26,4.6,0);
   const team=teams.has(b)?RIVAL_ROSTER[teams.get(b)]:null;signs.push({p,front,label:String(b+1).padStart(2,'0'),color:team?.color??0x5d666b});
   // The rival crews wait at their doors: nobody, one or a few, each where they like; tyres stacked at some.
   // #19's door always has one (Leonardo takes his place in the story paddock, immersive-visuals.js leoDoor);
   // the draw stays, so the other bays keep theirs.
   if(team){
    // #70's crew and tyres keep to one side of the door: the story's scenes with Kléber Eletric are played on
    // the other, beside his car (story-scene.js); the draws are made all the same.
    const kleber=team.number==='70',n=Math.max(team.number==='19'?1:0,pick([0,1,1,1,2,2,3])),tyreSide=rnd()<.5&&!kleber?1:-1,stack=rnd()<.45,parked=teams.get(b)<4||kleber,placed=[];let first=null;
    // Along the bay: off the tyre stack, inside the bay, and (the four teams nearest Box 99 park a car nose in at
    // the door in the story, immersive-visuals.js) clear of its flanks; never in another crewman's place.
    const fit=a=>{if(stack&&Math.abs(a-tyreSide*3.6)<1)a-=tyreSide*1.2;a=Math.max(-(bay/2-.9),Math.min(bay/2-.9,a));return parked&&Math.abs(a)<1.5?(a<0?-1.5:1.5):a;};
    const crowded=a=>placed.some(q=>Math.abs(q-a)<.7);
    for(let k=0;k<n;k++){
     // A second or third one keeps the first company, turned toward them; pushed onto someone by the rules above,
     // he takes the first one's other side, or stays inside (his draw still made, so the next bays keep theirs).
     const raw=first===null?(rnd()<.5?-1:1)*(1.2+rnd()*3):first+(rnd()<.5?-1:1)*(.8+rnd()*.5);let along=fit(raw);if(crowded(along))along=fit(2*first-raw);if(kleber)along=-Math.abs(along);
     const w=at(p,front-.45-rnd()*1.3),yaw=first===null?hd-Math.PI/2+(rnd()-.5)*1.1:hd+(along>first?Math.PI:0)+(rnd()-.5)*.6;
     const hat=rnd(),polo=rnd()<.3;
     const person={...(k===0?{name:'Porta_equipe_'+team.number}:{}),outfit:{top:polo?0xf4f1ea:team.color,bottom:pick(polo?bottoms:[0x2d3338,0x2d3338,team.color]),trim:polo?team.color:0xf4f1ea,hands:rnd()<.6?0x1b1d20:null,sleeves:polo?'short':'long',hat:hat<.55?'cap':hat<.68?'headset':null,hatColor:team.color,...look()},pose:pick(['folded','stand','ready','rest','folded']),x:w.x+p[c.tx]*along,y:w.y+.05,z:w.z-p[c.ty]*along,yaw};
     if(crowded(along))continue;
     crowd.push(person);placed.push(along);first??=along;
    }
    if(stack){const t=at(p,front-.62);tyres.push([t.x+p[c.tx]*tyreSide*3.6,t.y+.035,t.z-p[c.ty]*tyreSide*3.6,hd+(rnd()-.5)*.5,2+Math.floor(rnd()*4)]);}
   }
  }
  // Kerb between the lane's edge and the doors.
  box(parts.block,p,front-.17,0,bay,.39,.4,p[c.bank]*(front-.17)-.34);
  // Upper glass: one of the variants, shifted by whole panes and sometimes mirrored.
  if(b!==b99?.index){const row=Math.floor(rnd()*FACADE_GLASS_ROWS),u0=Math.floor(rnd()*8)/8,v0=1-(row+1)/FACADE_GLASS_ROWS,v1=1-row/FACADE_GLASS_ROWS;plane(parts.glass,p,front-.03,bay-1.2,2.5,5.45,rnd()<.5?[u0,v0,u0+1,v1]:[u0+1,v0,u0,v1]);}
  // Fascia, terrace balustrade and a few people enjoying the view.
  box(parts.frames,p,front-.12,0,bay,.3,.35,8.2);plane(parts.rail,p,front+.3,bay,.95,8.55);box(parts.steel,p,front+.3,0,bay,.06,.06,9.47);
  {const t=rnd(),n=t<.58?0:t<.74?1:t<.89?2:t<.96?3:4,c0=(rnd()-.5)*(bay-5);
   for(let k=0;k<n;k++){const off=c0+(k-(n-1)/2)*(.75+rnd()*.4),w=at(p,front+.95+rnd()*1.1);crowd.push({outfit:{top:pick(tops),bottom:pick(bottoms),sleeves:rnd()<.5?'short':'long',hat:rnd()<.2?'cap':null,hatColor:pick(tops),...look()},pose:pick(['stand','folded','rest','stand','ready']),idle:'terrace',x:w.x+p[c.tx]*off,y:base+8.2,z:w.z-p[c.ty]*off,yaw:hd-Math.PI/2+(rnd()-.5)*.9});}}
  // Canopy: two sloped membrane panels per bay meeting at a ridge on the bay's
  // centre line, with edge beams at the front and back and a ridge tube.
  const o=at(p,front+mid);
  for(const side of [-1,1]){
   const g=new THREE.PlaneGeometry(panel,span);g.rotateX(-Math.PI/2);g.rotateZ(-side*.28);g.translate(side*bay/4,base+13.05,0);g.rotateY(hd);g.translate(o.x,0,o.z);parts.canopy.push(g);
   for(const e of [-span/2,span/2]){const beam=new THREE.BoxGeometry(panel,.16,.16);beam.rotateZ(-side*.28);beam.translate(side*bay/4,base+13.05,e);beam.rotateY(hd);beam.translate(o.x,0,o.z);parts.steel.push(beam);}
  }
  place(parts.steel,new THREE.CylinderGeometry(.08,.08,span+.3,8).rotateX(Math.PI/2),p,front+mid,base+13.05+bay/4*slope);
 }
 // At every bay line: a pilaster between the doors, two columns rising from the
 // terrace and the gutter beam that carries the membrane valley.
 for(let k=0;k<=bays;k++){
  const s=pit.garages[0]+k*bay,p=lerp(s),front=p[c.hi]+.35,base=p[c.z],valley=base+13.05-bay/4*slope;
  box(parts.block,p,front-.12,0,.55,.3,8.2+sink,-sink);
  place(parts.steel,new THREE.BoxGeometry(.34,.38,span+.3),p,front+mid,valley-.21);
  for(const d of [front+1.3,front+depth-1.3]){const h=valley-.4-(base+8.2);place(parts.steel,new THREE.CylinderGeometry(.15,.19,h,12),p,d,base+8.2+h/2);place(parts.steel,new THREE.BoxGeometry(.5,.12,.5),p,d,valley-.46);}
 }
 for(const [list,material,name] of [[parts.block,concrete,'Box_garagens'],[parts.frames,steel,'Box_batentes'],[parts.doors,doorMaterial,'Box_portas'],[parts.glass,glass,'Box_janelas'],[parts.rail,railGlass,'Terraco_guarda_corpo'],[parts.steel,steel,'Cobertura_estrutura'],[parts.canopy,membrane,'Box_cobertura_membrana']]){
  const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=material!==railGlass;root.add(m);if(list===parts.block||list===parts.doors||list===parts.glass)obstacles.push(m);
 }
 // Garage numbers above the doors, with the team colour.
 const numbers=canvasTexture((ctx,w,h)=>{const cw=w/8,ch=h/4;signs.forEach((q,i)=>{const x=(i%8)*cw,y=Math.floor(i/8)*ch;ctx.fillStyle='#1b2a2c';ctx.fillRect(x,y,cw,ch);ctx.fillStyle=css(q.color);ctx.fillRect(x,y,cw,ch*.18);ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=3;ctx.strokeRect(x+5,y+5,cw-10,ch-10);ctx.fillStyle='#f4f1e4';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(q.label,x+cw/2,y+ch*.6);});},512,256);
 const numberMaterial=new THREE.MeshBasicMaterial({map:numbers}),plates=[];
 signs.forEach((q,i)=>{
  const g=new THREE.PlaneGeometry(1.6,.8),uv=g.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,(i%8+uv.getX(k))/8,1-(Math.floor(i/8)+1-uv.getY(k))/4);
  const m=new THREE.Mesh(g,numberMaterial);const o=at(q.p,q.front-.12,5);m.position.set(o.x,q.p[c.z]+5.05,o.z);
  m.rotation.y=Math.atan2(q.p[c.ty],q.p[c.tx]);m.updateMatrix();plates.push(g.applyMatrix4(m.matrix));
 });
 // One mesh for all the numbers (one material): two dozen draws were one each, every frame on the straight.
 if(plates.length){const m=new THREE.Mesh(mergeGeometries(plates,false),numberMaterial);m.name='Numero_box';root.add(m);plates.forEach(g=>g.dispose());}
 // Box 99: the team garage, the Lanchonete da Tia, the painted service box on the
 // working lane where the car stops in the race, the crew and the Tia.
 const box99=b99?createBox99({pit,c,lerp,at,root,obstacles,textures,people,crowd,labels}):null;
 if(tyres.length)root.add(tyreStacks(tyres,box99?.sidewall??tyreWall()));
 // Everyone placed for good idles there (pit-crew.js): crews, terrace, café, stand.
 const waiting=people.crowd(crowd,{name:'Pessoas_paradas_boxes',seed:2});if(waiting)root.add(waiting);
 return {box:box99?.layout??null,box99,bays};
}

// Curvelo's garage row, on the infield behind its service lane (see curveloPitFrame).
export function createCurveloPit(data,textures){
 const pit=curveloPitFrame(data),root=new THREE.Group();root.name='Boxes_Curvelo';const obstacles=[];
 const {box}=createPitBuildings({pit,...laneFrame(pit),root,obstacles,textures,labels:{label:'CURVELO · BOX 99',title:'Cuida do Opala, uai!',name:'Box 99 de Curvelo',track:'CURVELO'}});
 // The service lane has no surveyed stations: the box is found by lap distance and offset.
 box.inBox=inPitBox;
 root.add(curveloPitSigns(data));
 return {root,obstacles,box};
}

// Road signs on posts, off the asphalt and facing the cars that approach them: the entry
// board behind the infield guardrail before the lane peels off, the BOX/PISTA arrow on the
// grass where lane and track part, and the exit board with its green light on the grass
// between the lane and the track where the lane runs back.
function curveloPitSigns(data){
 const root=new THREE.Group();root.name='Placas_boxes_Curvelo';
 const probe=new TestCar(data),shoulder=8.4,lane=s=>pitLane(data,s)?.offset??0,laneEdge=s=>lane(s)-3.3;
 const ground=(x,y)=>{probe.index=probe.nearest(x,y,true).i;return probe.sample(x,y).z-.09;};
 const metal=new THREE.MeshStandardMaterial({name:'Placas_postes',color:0xa9b0b5,metalness:.6,roughness:.45});
 const back=new THREE.MeshStandardMaterial({name:'Placas_verso',color:0x59626a,metalness:.5,roughness:.55});
 const footing=new THREE.MeshStandardMaterial({name:'Placas_base',color:0x8f918b,roughness:.9});
 const put=(parent,mesh,x,y,z)=>{mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
 // Lap distance s and offset d (left of the track), panel w x h with its lower edge at
 // `bottom`; toe turns the face towards the track.
 const sign=(kind,s,d,{w,h,bottom,toe=0,light=false})=>{
  const p=trackPoint(data,s,d),g=new THREE.Group();g.name='Placa_boxes_'+kind;
  g.position.set(p.x,ground(p.x,-p.z),p.z);g.rotation.y=p.heading-Math.PI/2+toe;root.add(g);
  const map=pitLaneSign(kind),face=new THREE.MeshStandardMaterial({name:'Placa_'+kind,map,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.35,roughness:.45});
  put(g,new THREE.Mesh(new THREE.BoxGeometry(w,h,.05),[back,back,back,back,face,back]),0,bottom+h/2,0);
  put(g,new THREE.Mesh(new THREE.BoxGeometry(w+.1,h+.1,.04),back),0,bottom+h/2,-.04);
  for(const y of [bottom+h*.25,bottom+h*.75])put(g,new THREE.Mesh(new THREE.BoxGeometry(w-.3,.08,.05),metal),0,y,-.09);
  const top=bottom+h-.1;
  for(const x of w>2?[-w/2+.45,w/2-.45]:[0]){
   put(g,new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,top+.3,12),metal),x,(top-.3)/2,-.13);
   put(g,new THREE.Mesh(new THREE.CylinderGeometry(.2,.24,.4,12),footing),x,0,-.13);
  }
  if(light){
   // Pit-exit light on top of the board: red dark, green lit.
   const y=bottom+h+.5;put(g,new THREE.Mesh(new THREE.BoxGeometry(.36,.8,.26),back),0,y,-.04);
   for(const [dy,color,lit] of [[.18,0xd8262b,false],[-.18,0x3dff6a,true]]){
    const lamp=put(g,new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.05,16).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({name:'Semaforo_saida',color:lit?color:0x2a1414,emissive:lit?color:0x000000,emissiveIntensity:lit?1.6:0,roughness:.3})),0,y+dy,.1);lamp.name=lit?'Semaforo_verde':'Semaforo_vermelho';
   }
  }
  g.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  return g;
 };
 const entry=1082,toe=.2,w=4.2;
 sign('entrada',entry,7+guardrailClearance(data,entry,1)+.8+w/2*Math.cos(toe),{w,h:2.1,bottom:1.25,toe});
 // Where the grass between the track and the lane is wide enough for the arrow.
 let split=1100;while(laneEdge(split)-shoulder<3.2&&split<1180)split+=.5;
 sign('bifurcacao',split,(shoulder+laneEdge(split))/2,{w:1.5,h:1.5,bottom:.7});
 const exit=76;
 sign('saida',exit,(shoulder+laneEdge(exit))/2,{w:3.4,h:1.7,bottom:1.1,light:true});
 return root;
}
