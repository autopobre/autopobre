import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {serviceSpot,inServiceSpot} from './pit-lane.js';
import {CAFE_MENU} from './pitstop.js';
import {RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
import * as art from './pit-textures.js';
import {PitCrew,CafeHost,OUTFITS} from './pit-crew.js';

const RED=0xc01e25,DARK=0x1b1d20,STEEL=0x6d757b,ALU=0xb9bec2,YELLOW=0xf0c419,WHITE=0xf2f0ea,WOOD=0x8a5a36,CARD=0xb98d5a,BLUE=0x1f4e8c,GREEN=0x2f7d4a;
const rng=seed=>()=>(seed=seed*16807%2147483647)/2147483647;
const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d),cyl=(r,h,s=16,top=r)=>new THREE.CylinderGeometry(top,r,h,s),sph=(r,w=12,h=8)=>new THREE.SphereGeometry(r,w,h);
const scaleUV=(g,su,sv=su)=>{const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv);return g;};
function paint(geometry,color){const g=geometry.index?geometry.toNonIndexed():geometry,c=new THREE.Color(color),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}

// Tyres stacked flat, instanced, with lettered sidewalls. stacks: [x,y,z,heading,count].
export function tyreStacks(stacks,sidewall){
 const total=stacks.reduce((n,s)=>n+s[4],0),tread=new THREE.MeshStandardMaterial({name:'Pneus_banda',color:0x161718,roughness:.85}),side=new THREE.MeshStandardMaterial({name:'Pneus_lateral',map:sidewall,roughness:.8});
 const mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.31,.31,.24,24),[tread,side,side],total),m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),one=new THREE.Vector3(1,1,1),v=new THREE.Vector3();let k=0;
 for(const [x,y,z,h,count] of stacks)for(let i=0;i<count;i++)mesh.setMatrixAt(k++,m.compose(v.set(x,y+.12+i*.245,z),q.setFromEuler(e.set(0,h+i*1.3,0)),one));
 mesh.name='Pneus_empilhados';mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();return mesh;
}

// Box 99 at Interlagos: the team garage (open; the car can still be driven in), the
// Lanchonete da Tia in the bay before it, the painted service box on the working lane
// where the car stops during the race, the team stand on the pit wall and the crew.
// x runs along the lane from the Box 99 centre, d across it (the pit-lane offset,
// garages positive) and y up from the lane plane, which the floors continue like the
// physics surface does; "absolute" heights start at the lane centre instead.
export function createBox99({pit,c,lerp,at,root,obstacles,textures,people,crowd,labels}){
 const sink=-(pit.sink??.3),b=pit.box99,S=b.s,B=b.bay/2,F=b.front,spot=serviceSpot(pit),group=new THREE.Group();group.name='Box99_e_Lanchonete_da_Tia';root.add(group);
 const frame=(x,d,y=0,absolute=false)=>{const p=lerp(S+x),o=at(p,d);return {h:Math.atan2(p[c.ty],p[c.tx]),x:o.x,y:(absolute?p[c.z]:o.y)+y,z:o.z};};
 const floorAt=(x,d)=>{const p=lerp(S+x);return p[c.z]+p[c.bank]*d+.05;};
 const lists=new Map(),push=(material,g)=>{if(!lists.has(material))lists.set(material,[]);lists.get(material).push(g);return g;};
 // Object frame: +x along the lane, +z toward the lane side (smaller d), y up.
 const add=(material,g,x,d,y=0,turn=0,absolute=false)=>{const f=frame(x,d,y,absolute);return push(material,g.rotateY(f.h+turn).translate(f.x,f.y,f.z));};
 const put=(object,x,d,y=0,turn=0,absolute=false)=>{const f=frame(x,d,y,absolute);object.position.set(f.x,f.y,f.z);object.rotation.y=f.h+turn;group.add(object);return object;};
 const std=(name,color,extra={})=>new THREE.MeshStandardMaterial({name,color,roughness:.7,...extra}),decal={polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2};
 const image=path=>{const t=new THREE.TextureLoader().load(path);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;};
 const rows=[...RIVAL_ROSTER.slice(0,4),{...PLAYER_ENTRY,me:true},...RIVAL_ROSTER.slice(4,8)].map((r,i)=>({number:r.number,name:r.shortName,color:art.css(r.color),me:!!r.me,time:`1:${(52.31+i*.287+(i%3)*.061).toFixed(3)}`}));
 const M={
  props:new THREE.MeshStandardMaterial({name:'Box99_objetos',vertexColors:true,roughness:.6,metalness:.08}),
  chrome:std('Box99_cromado',0xd4d9dc,{roughness:.22,metalness:.9}),
  concrete:structureMaterial(new THREE.MeshStandardMaterial({name:'Concreto',color:0x8f918b,roughness:.9}),textures),
  plaster:std('Lanchonete_fachada',0xead7ae,{roughness:.85}),
  glass:new THREE.MeshStandardMaterial({name:'Box99_vidro',color:0xcfe6ee,roughness:.04,metalness:.25,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}),
  light:new THREE.MeshBasicMaterial({name:'Box99_luz',color:0xfff3d6}),
  floor:new THREE.MeshStandardMaterial({name:'Piso_epoxi_box99',color:0xc4c8ca,map:art.garageFloor(),roughness:.42,metalness:.05,...decal}),
  tiles:new THREE.MeshStandardMaterial({name:'Ladrilho_hidraulico',map:art.cafeFloor(),roughness:.45,...decal}),
  box:new THREE.MeshStandardMaterial({name:'Box_de_parada_99',map:art.serviceBox(),transparent:true,depthWrite:false,roughness:.8,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),
  garageWall:std('Parede_box99',0xffffff,{map:art.garageWall(),roughness:.6}),
  cafeWall:std('Azulejo_lanchonete',0xffffff,{map:art.cafeWall(),roughness:.35}),
  toolBoard:std('Painel_ferramentas',0xffffff,{map:art.toolBoard(),roughness:.5,metalness:.15,...decal}),
  menu:std('Cardapio_da_Tia',0xffffff,{map:art.menuBoard(CAFE_MENU),roughness:.85}),
  cloth:std('Toalha_xadrez',0xffffff,{map:art.gingham(),side:THREE.DoubleSide,roughness:.85}),
  awning:std('Toldo_listrado',0xffffff,{map:art.awning(),side:THREE.DoubleSide,roughness:.8}),
  storefront:std('Pastilhas_fachada',0xffffff,{map:art.storefrontTiles(),roughness:.5}),
  fridge:std('Geladeira_bebidas',0xffffff,{map:art.fridgeDoor(),roughness:.2,metalness:.1}),
  poster:std('Cartaz_corrida',0xffffff,{map:art.racePoster(),roughness:.8}),
  opening:std('Quadro_abertura',0xffffff,{map:image('./assets/abertura/abertura_stevan_opala99.jpg?v=20261002-omp-q6'),roughness:.6}),
  logo:std('Banner_logo_box99',0xffffff,{map:image('./assets/abertura/logo_auto_pobre_racing_v2.webp'),transparent:true,roughness:.7,...decal}),
  screen:new THREE.MeshBasicMaterial({name:'Monitores_cronometragem',map:art.timingScreen(rows,'CRONOMETRAGEM · '+(labels?.track??'INTERLAGOS'))}),
 };
 const addc=(color,g,x,d,y=0,turn=0,absolute=false)=>add(M.props,paint(g,color),x,d,y,turn,absolute);
 // Several coloured parts in one object's own frame, placed together.
 const kit=(parts,x,d,y=0,turn=0,absolute=false)=>add(M.props,mergeGeometries(parts.map(([g,color,pos=[0,0,0]])=>paint(g.translate(...pos),color)),false),x,d,y,turn,absolute);
 const wall=(material,x0,x1,d0,d1,y0,y1)=>add(material,box(x1-x0,y1-y0,d1-d0),(x0+x1)/2,(d0+d1)/2,(y0+y1)/2,0,true);
 const sign=(map,w,h,x,d,y,turn=0)=>put(new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map})),x,d,y,turn,true);
 // Floors follow the lane plane on a coarse grid.
 const grid=(material,x0,x1,d0,d1,lift,uv,name)=>{
  const nx=Math.max(1,Math.ceil((x1-x0)/2)),nd=Math.max(1,Math.ceil((d1-d0)/2)),pos=[],uvs=[],idx=[];
  for(let i=0;i<=nx;i++)for(let j=0;j<=nd;j++){const x=x0+(x1-x0)*i/nx,d=d0+(d1-d0)*j/nd,o=at(lerp(S+x),d,lift);pos.push(o.x,o.y,o.z);uvs.push(...uv(x,d));if(i&&j){const a=(i-1)*(nd+1)+j-1,e=i*(nd+1)+j-1;idx.push(a,e,a+1,a+1,e,e+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.name=name;m.receiveShadow=true;group.add(m);return m;
 };
 // Cladding on a wall face from A to B: bottom on the floor (or at an absolute
 // height), top at an absolute height; it faces the side where `inside` lies.
 const clad=(material,[xa,da],[xb,db],inside,{top=5.15,bottom=null,u0=0}={})=>{
  const pa=lerp(S+xa),pb=lerp(S+xb),A=at(pa,da),Bp=at(pb,db),fa=floorAt(xa,da)-.04,fb=floorAt(xb,db)-.04,len=Math.hypot(xb-xa,db-da);
  const ya=bottom===null?fa:pa[c.z]+bottom,yb=bottom===null?fb:pb[c.z]+bottom,ta=pa[c.z]+top,tb=pb[c.z]+top;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([A.x,ya,A.z,Bp.x,yb,Bp.z,A.x,ta,A.z,Bp.x,tb,Bp.z],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([u0/2.6,(ya-fa)/5.2,(u0+len)/2.6,(yb-fb)/5.2,u0/2.6,(ta-fa)/5.2,(u0+len)/2.6,(tb-fb)/5.2],2));
  const I=frame(...inside),n=new THREE.Vector3(Bp.x-A.x,0,Bp.z-A.z).cross(new THREE.Vector3(0,1,0));g.setIndex(n.x*(I.x-A.x)+n.z*(I.z-A.z)>0?[0,1,2,2,1,3]:[0,2,1,2,3,1]);g.computeVertexNormals();return push(material,g);
 };

 // --- Floors: flake epoxy in the garage, hydraulic tiles in the café, and the
 // painted service box on the working lane in front of the garage.
 grid(M.floor,-B+.17,B-.15,F+.35,F+16.15,.05,(x,d)=>[(x+6.3)/12.6,(d-F-.35)/15.8],'Piso_epoxi_box99');
 grid(M.tiles,-3*B+.15,-B-.06,F+.35,F+16.15,.05,(x,d)=>[x/.8,d/.8],'Ladrilho_lanchonete');
 // The painted 99 reads right for the arriving car: turned half round where the cars run against
 // the stations (pit.reversed, Brasília), or it would read 66.
 const turned=pit.reversed?uv=>[1-uv[0],1-uv[1]]:uv=>uv;
 grid(M.box,-spot.length/2,spot.length/2,spot.d-spot.width/2,spot.d+spot.width/2,.047,(x,d)=>turned([(x+spot.length/2)/spot.length,(d-spot.d+spot.width/2)/spot.width]),'Box_de_parada_99');

 // --- Walls (their collision comes from the data walls): garage side, back wall,
 // café side and the café storefront with its window and door.
 wall(M.concrete,B-.15,B+.15,F+.05,F+16.45,sink,5.25);wall(M.concrete,-3*B-.15,B+.15,F+16.15,F+16.45,sink,5.25);wall(M.concrete,-3*B-.15,-3*B+.15,F+.05,F+16.45,sink,5.25);
 const [w0,w1,sill,head,door0,door1,doorTop]=[-17.6,-9.4,.95,2.65,-8.7,-7.5,2.4];
 for(const [x0,x1,y0,y1] of [[-3*B-.15,w0,sink,5.25],[w0,w1,sink,sill],[w0,w1,head,5.25],[w1,door0,sink,5.25],[door0,door1,doorTop,5.25],[door1,-B+.15,sink,5.25]])wall(M.plaster,x0,x1,F+.05,F+.35,y0,y1);
 clad(M.garageWall,[B-.16,F+.36],[B-.16,F+16.14],[0,F+8]);clad(M.garageWall,[-B+.06,F+16.14],[B-.16,F+16.14],[0,F+8]);
 clad(M.cafeWall,[-3*B+.16,F+.36],[-3*B+.16,F+16.14],[-13,F+6]);clad(M.cafeWall,[-3*B+.16,F+16.14],[-B-.06,F+16.14],[-13,F+14]);
 for(const [x0,x1,opt] of [[-3*B+.16,w0,{}],[w0,w1,{top:sill}],[w0,w1,{bottom:head}],[w1,door0,{}],[door0,door1,{bottom:doorTop}],[door1,-B-.06,{}]])clad(M.cafeWall,[x0,F+.36],[x1,F+.36],[-13,F+5],{...opt,u0:x0});
 for(const [x0,x1] of [[-3*B-.15,door0],[door1,-B+.15]])clad(M.storefront,[x0,F+.04],[x1,F+.04],[-13,F-3],{top:.95});
 // Rail between the garage and the café, with the walkway gap.
 for(const [d0,d1] of [[F+.6,F+4.3],[F+5.7,F+16]]){const mid=(d0+d1)/2,len=d1-d0,n=Math.max(1,Math.round(len/1.6));
  add(M.chrome,box(.06,.06,len),-B,mid,1.05);add(M.chrome,box(.04,.04,len),-B,mid,.12);add(M.glass,new THREE.PlaneGeometry(len-.1,.85),-B,mid,.6,Math.PI/2);
  for(let k=0;k<=n;k++)add(M.chrome,box(.06,1.05,.06),-B,d0+k*len/n,.53);}

 // --- Garage mouth: rolled-up door, guide rails and the lit Box 99 sign.
 addc(0x4b5358,cyl(.32,2*B-.4,20).rotateZ(Math.PI/2),0,F+.62,4.86,0,true);for(const x of [-B+.22,B-.22])addc(STEEL,box(.1,4.7,.16),x,F+.42,2.35,0,true);
 sign(art.signBoard('BOX 99','AUTO-POBRE RACING · OPALA 99','#c01e25','#fff4d8'),9.6,2.4,0,F+.3,6.7).name='Placa_box99';

 // --- Workshop: bench and shadow board, tool chests, compressor, drums, engine
 // on its stand, tyres, spare parts, timing monitors, fuel cans and lights.
 const bx=B-.575;
 addc(WOOD,box(.75,.05,6),bx,F+6.2,.9);addc(STEEL,box(.7,.03,5.9),bx,F+6.2,.2);for(const d of [F+3.3,F+6.2,F+9.1])for(const x of [B-.9,B-.25])addc(STEEL,box(.05,.88,.05),x,d,.44);
 add(M.toolBoard,new THREE.PlaneGeometry(6,1.5),B-.2,F+6.2,1.75,-Math.PI/2);addc(0x8c969b,box(.03,1.56,6.06),B-.175,F+6.2,1.75);
 kit([[box(.16,.1,.28),STEEL],[box(.04,.14,.26),STEEL,[.1,.05,0]],[box(.24,.03,.03),ALU,[-.05,.03,.18]]],B-.45,F+3.7,.98);
 kit([[box(.36,.2,.55),RED],[box(.3,.03,.03),ALU,[0,.12,0]],[box(.37,.01,.56),DARK,[0,.02,0]]],B-.55,F+5,1.02);
 for(const [d,y] of [[F+6.2,.94],[F+6.55,.97]])addc(0x7d8083,cyl(.14,.03,20),B-.58,d,y);
 kit([[cyl(.07,.32,12),0x2f6db5],[cyl(.045,.08,10),0xd8d8d8,[0,.2,0]],[box(.05,.03,.02),DARK,[.05,.2,0]]],B-.45,F+7.4,1.08);
 kit([[box(.12,.16,.3),0x2a2d30],[cyl(.045,.012,14).rotateZ(Math.PI/2),0x9aa1a5,[-.065,0,-.06]],[box(.005,.4,.005),ALU,[0,.28,.12]]],B-.5,F+8.3,1.01);
 kit([[box(.24,.02,.32),0x2a2d30],[box(.02,.22,.32),0x2a2d30,[.12,.11,0]],[box(.005,.19,.29),0x16324a,[.108,.11,0]]],B-.6,F+8.9,.935);
 addc(0xdcdcdc,box(.16,.06,5.6),B-.7,F+6.2,3.0);add(M.light,box(.1,.012,5.5),B-.7,F+6.2,2.965);
 for(const [d,tall] of [[F+10.3,false],[F+11.55,true]]){
  const parts=[[box(.6,.95,1.15),RED,[0,.55,0]],[box(.62,.03,1.17),DARK,[0,1.04,0]]];
  for(let k=0;k<6;k++)parts.push([box(.012,.012,1.1),0x2a2d30,[-.303,.16+k*.15,0]],[box(.03,.025,.7),ALU,[-.315,.22+k*.15,0]]);
  for(const z of [-.5,.5])for(const x of [-.25,.25])parts.push([cyl(.05,.05,10).rotateX(Math.PI/2),DARK,[x,.05,z]]);
  if(tall){parts.push([box(.5,.5,1.1),RED,[.05,1.31,0]]);for(let k=0;k<3;k++)parts.push([box(.012,.012,1.05),0x2a2d30,[-.203,1.14+k*.15,0]],[box(.03,.025,.6),ALU,[-.215,1.2+k*.15,0]]);}
  kit(parts,B-.5,d);
 }
 kit([[cyl(.22,1,16).rotateX(Math.PI/2),RED,[0,.32,0]],[box(.3,.25,.36),0x2a2d30,[0,.62,.2]],[box(.06,.26,.32),ALU,[.18,.62,-.05]],[sph(.05),WHITE,[-.2,.42,-.35]],...[[-.35,-.1],[.35,-.1],[-.35,.1],[.35,.1]].map(([z,x])=>[cyl(.06,.05,10).rotateZ(Math.PI/2),DARK,[x,.06,z]])],B-.55,F+13.65);
 addc(YELLOW,new THREE.TorusGeometry(.2,.022,6,20).rotateX(Math.PI/2),B-1.4,F+13.8,.03);
 for(const [x,d,color] of [[B-.5,F+15.6,BLUE],[B-1.15,F+15.75,YELLOW]])kit([[cyl(.29,.88,20),color,[0,.44,0]],[new THREE.TorusGeometry(.292,.014,6,24).rotateX(Math.PI/2),color,[0,.3,0]],[new THREE.TorusGeometry(.292,.014,6,24).rotateX(Math.PI/2),color,[0,.6,0]],[cyl(.27,.012,20),0x2a2d30,[0,.885,0]]],x,d);
 kit([[box(.32,1,.32),WHITE,[0,.5,0]],[cyl(.13,.36,14),0x6fb6e3,[0,1.2,0]],[cyl(.05,.05,10),0x2f6db5,[0,1.4,0]],[box(.05,.04,.04),0x2f6db5,[-.18,.8,.06]],[box(.05,.04,.04),RED,[-.18,.8,-.06]]],B-1.85,F+15.8);
 kit([[box(.9,.05,.08),STEEL,[0,.03,0]],[box(.08,.05,.8),STEEL,[-.4,.03,0]],[box(.08,.72,.08),STEEL,[-.4,.4,0]],[box(.34,.06,.06),STEEL,[-.25,.76,0]],
  [box(.75,.4,.42),0x2f5d8a,[.18,.8,0]],[box(.72,.12,.34),0x2f5d8a,[.18,1.06,0]],[box(.7,.08,.25),RED,[.18,1.16,0]],[cyl(.035,.06,10),ALU,[.4,1.22,0]],
  [box(.5,.08,.1),0x3a3f44,[.18,1.02,.24]],[cyl(.17,.08,20),ALU,[.2,1.3,.2]],[box(.6,.1,.08),0x6b4a35,[.18,.92,-.26]],[box(.62,.15,.32),DARK,[.18,.53,0]],
  [cyl(.19,.05,24).rotateZ(Math.PI/2),0x5d666b,[.6,.8,0]],...[[-.4,-.35],[-.4,.35],[.4,0]].map(([x,z])=>[cyl(.04,.04,8).rotateX(Math.PI/2),DARK,[x,.02,z]])],2.85,F+14);
 const sidewall=art.tyreWall();
 group.add(tyreStacks([[-5.45,F+15.55,4],[-4.8,F+15.6,4],[-4.15,F+15.55,4],[-3.5,F+15.6,3],[-5.45,F+14.85,3],[-4.8,F+14.85,2]].map(([x,d,n])=>{const f=frame(x,d);return [f.x,f.y,f.z,f.h,n];}),sidewall));
 const shelves=(x,d,turn,seed)=>{const r=rng(seed),parts=[];for(const [px,z] of [[-.22,-1.72],[.22,-1.72],[-.22,0],[.22,0],[-.22,1.72],[.22,1.72]])parts.push([box(.05,2,.05),0x2f6db5,[px,1,z]]);
  for(const y of [.15,.65,1.15,1.65]){parts.push([box(.5,.03,3.5),ALU,[0,y,0]]);for(let z=-1.65;z<1.45;){const w=Math.min(.25+r()*.45,1.7-z),h=.15+r()*.3;parts.push([box(.38,h,w),[CARD,CARD,RED,0x2f6db5,YELLOW,DARK][Math.floor(r()*6)],[0,y+.015+h/2,z+w/2]]);z+=w+.05+r()*.1;}}
  kit(parts,x,d,0,turn);};
 shelves(-B+.47,F+10.75,0,3);
 kit([[cyl(.3,.04,16),DARK,[0,.02,0]],[cyl(.035,1.9,10),STEEL,[0,.95,0]],[box(1.5,.06,.06),STEEL,[0,1.75,-.02]],[box(.72,.44,.05),DARK,[-.37,1.75,.04]],[box(.72,.44,.05),DARK,[.37,1.75,.04]]],B-1.15,F+1.2);
 // Record boards (layout.showRecords): the mode's best laps and best races, and the other mode's
 // best laps. The two TVs by the door show the first two, the team stand's three monitors all.
 const boards=[art.recordBoard(),art.recordBoard(),art.recordBoard()],boardMaterials=boards.map((board,i)=>new THREE.MeshBasicMaterial({name:'TV_recordes_'+['volta','corrida','outro_modo'][i],map:board.map}));
 for(const i of [0,1])add(boardMaterials[i],new THREE.PlaneGeometry(.64,.37),B-1.15+(i?.37:-.37),F+1.115,1.75);
 {const rack=[[box(.9,.04,.45),STEEL,[0,.45,0]],[box(.9,.04,.45),STEEL,[0,.02,0]]];for(const [x,z] of [[-.43,-.2],[.43,-.2],[-.43,.2],[.43,.2]])rack.push([box(.04,.9,.04),STEEL,[x,.45,z]]);
  for(const [x,y] of [[-.22,.04],[.22,.04],[-.22,.47],[.22,.47]])rack.push([box(.3,.34,.18),RED,[x,y+.17,0]],[cyl(.03,.05,8),YELLOW,[x+.1,y+.37,0]],[box(.14,.03,.04),DARK,[x-.05,y+.36,0]]);kit(rack,-B+1,F+1.25);}
 const extinguisher=(x,d)=>kit([[cyl(.09,.5,14),RED,[0,.3,0]],[sph(.09,12,6),RED,[0,.55,0]],[box(.06,.08,.06),DARK,[0,.66,0]],[box(.14,.02,.03),DARK,[.05,.7,0]],[cyl(.012,.35,6),DARK,[.09,.45,0]]],x,d);
 extinguisher(-B+.3,F+2);extinguisher(B-.3,F+9.6);
 kit([[box(.28,.14,.8),RED,[0,.12,0]],[cyl(.05,.04,10).rotateZ(Math.PI/2),DARK,[.14,.05,.3]],[cyl(.05,.04,10).rotateZ(Math.PI/2),DARK,[-.14,.05,.3]],[box(.2,.04,.2),0x3a3f44,[0,.21,.38]],[cyl(.022,.9,8).rotateX(.9),ALU,[0,.5,-.55]]],2.2,F+11.5);
 kit([[box(.45,.04,1),0x2a2d30,[0,.1,0]],[box(.4,.05,.25),RED,[0,.14,-.38]],...[[-.18,-.42],[.18,-.42],[-.18,.42],[.18,.42]].map(([x,z])=>[sph(.035,8,6),DARK,[x,.04,z]])],3.5,F+10.5);
 for(const x of [-3.5,3.5])for(const d of [F+4,F+9,F+14]){addc(0xdcdcdc,box(2.5,.08,.5),x,d,5.12,0,true);add(M.light,box(2.4,.02,.4),x,d,5.07,0,true);}
 addc(0x9aa1a5,box(.3,.06,15.4),0,F+8.2,5.1,0,true);
 addc(0x121416,box(6.8,3.4,.04),0,F+16.12,2.9);add(M.logo,new THREE.PlaneGeometry(6.4,3.2),0,F+16.09,2.9);

 // --- Lanchonete da Tia: window bar and stools, tables, counter with display case,
 // back counter with the coffee corner, fridge, lamps, fan, bunting and posters.
 addc(WOOD,box(w1-w0,.05,.45),(w0+w1)/2,F+.76,1.05);for(let x=w0+.3;x<w1;x+=1.6)addc(STEEL,box(.04,.3,.36),x,F+.72,.88);
 for(const x of [-16.8,-15.3,-13.8,-12.3,-10.8])kit([[cyl(.19,.06,18),RED,[0,.76,0]],[cyl(.03,.72,8),ALU,[0,.37,0]],[new THREE.TorusGeometry(.16,.012,6,18).rotateX(Math.PI/2),ALU,[0,.3,0]],[cyl(.22,.03,18),ALU,[0,.015,0]]],x,F+1.35);
 for(const [x,cup] of [[-15.3,true],[-12.3,true],[-10.8,false]])if(cup)kit([[cyl(.06,.01,14),WHITE],[cyl(.035,.06,12,.04),WHITE,[0,.04,0]]],x,F+.7,1.085);
 const chair=(x,d,turn)=>kit([[box(.42,.04,.42),0xc4232a,[0,.46,0]],[box(.04,.46,.42),0xc4232a,[-.2,.7,0]],...[[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]].map(([a,z])=>[box(.035,.45,.035),0xc4232a,[a,.225,z]])],x,d,0,turn);
 const tables=[[-17.4,F+4.6],[-17.4,F+7],[-14.4,F+4.4]],seats=[.3,2.4,4.4];
 for(const [x,d] of tables){
  add(M.cloth,scaleUV(new THREE.CylinderGeometry(.47,.5,.2,24,1,true),8,1),x,d,.66);add(M.cloth,scaleUV(new THREE.CircleGeometry(.47,24).rotateX(-Math.PI/2),3),x,d,.762);
  kit([[cyl(.45,.02,24),WHITE,[0,.75,0]],[cyl(.04,.72,8),DARK,[0,.37,0]],[cyl(.25,.03,16),DARK,[0,.015,0]]],x,d);
  for(const a of seats)chair(x+Math.cos(a)*.78,d+Math.sin(a)*.78,a+Math.PI);
 }
 addc(WOOD,box(9.65,1,.7),-13.4,F+9.2,.5);addc(0x3b3a38,box(9.75,.05,.78),-13.4,F+9.2,1.025);addc(DARK,box(9.65,.1,.02),-13.4,F+8.84,.05);
 for(let x=-18.1;x<-8.7;x+=.32)addc(0x6f4526,box(.04,.84,.012),x,F+8.845,.5);
 addc(WOOD,box(.6,1,2.7),-8.9,F+10.55,.5);addc(0x3b3a38,box(.66,.05,2.76),-8.9,F+10.55,1.025);
 addc(ALU,box(3.8,.04,.6),-14.5,F+9.2,1.07);add(M.glass,box(3.8,.44,.6),-14.5,F+9.2,1.31);addc(ALU,box(3.82,.02,.62),-14.5,F+9.2,1.53);
 {const food=[];for(let i=0;i<14;i++)food.push([sph(.036,8,6).scale(1,.8,1),0xe3b25e,[-1.8+(i%7)*.13,.04,-.1+Math.floor(i/7)*.14]]);
  for(let i=0;i<8;i++)food.push([new THREE.ConeGeometry(.04,.1,8),0xc98a3e,[-.7+(i%4)*.13,.06,-.08+Math.floor(i/4)*.15]]);
  for(let i=0;i<12;i++)food.push([sph(.02,8,6),0x3b2314,[.05+(i%6)*.07,.03,-.06+Math.floor(i/6)*.1]]);
  food.push([cyl(.14,.09,20),0xe8c15a,[.85,.05,0]],[cyl(.15,.01,20),WHITE,[.85,.005,0]]);for(let i=0;i<5;i++)food.push([box(.12,.025,.08),0xd9a441,[1.35+(i%2)*.14,.015+Math.floor(i/2)*.026,-.05+(i%2)*.1]]);
  kit(food,-14.5,F+9.2,1.09);}
 kit([[box(.36,.2,.34),0x2a2d30,[0,.1,0]],[box(.2,.1,.02),0x2a2d30,[0,.25,.1]],[box(.16,.06,.005),0x8fe39a,[0,.26,.112]],[box(.3,.08,.3),0x3a3f44,[0,.04,0]]],-10.1,F+9.2,1.05);
 kit([[box(.1,.12,.06),ALU],[box(.08,.1,.004),WHITE,[0,.005,0]]],-11.1,F+9.05,1.11);
 for(const [x,color] of [[-11.8,0xc4232a],[-12.15,GREEN]])kit([[cyl(.075,.34,14),color,[0,.17,0]],[cyl(.06,.05,12),0xd8d8d8,[0,.365,0]],[box(.04,.03,.12),0xd8d8d8,[0,.4,.04]]],x,F+9.35,1.05);
 for(const x of [-12.7,-12.95,-13.2])kit([[cyl(.06,.01,14),WHITE],[cyl(.035,.06,12,.04),WHITE,[0,.04,0]]],x,F+9.0,1.055);
 kit([[cyl(.06,.08,12),WHITE,[0,.04,0]],[sph(.02),WHITE,[0,.09,0]]],-12.45,F+9.0,1.05);
 addc(WOOD,box(.3,.02,.08),-10.75,F+8.97,1.06);put(new THREE.Mesh(new THREE.PlaneGeometry(.36,.18),std('Placa_fiado',0xffffff,{map:art.plaque('FIADO SÓ\nAMANHÃ')})),-10.75,F+8.95,1.16).name='Placa_fiado_so_amanha';
 addc(WOOD,box(8.4,.9,.6),-14.4,F+12.2,.45);addc(0x3b3a38,box(8.5,.05,.64),-14.4,F+12.2,.925);
 kit([[box(.7,.42,.48),ALU,[0,.21,0]],[box(.72,.06,.5),RED,[0,.45,0]],[cyl(.035,.08,10),DARK,[-.15,.1,.26]],[cyl(.035,.08,10),DARK,[.15,.1,.26]],[box(.6,.02,.2),DARK,[0,.02,.3]],[cyl(.03,.05,10),WHITE,[-.15,.5,0]],[cyl(.03,.05,10),WHITE,[0,.5,0]],[cyl(.03,.05,10),WHITE,[.15,.5,0]]],-17.2,F+12.2,.95);
 kit([[box(.3,.02,.2),WOOD,[0,.35,0]],[box(.02,.35,.02),WOOD,[-.13,.175,0]],[box(.02,.35,.02),WOOD,[.13,.175,0]],[new THREE.ConeGeometry(.08,.18,12).rotateX(Math.PI),0xf4efe2,[0,.28,0]],[cyl(.08,.16,14,.06),0x3d6fb5,[0,.08,0]],[box(.08,.02,.02),0x3d6fb5,[.1,.12,0]]],-15.9,F+12.2,.95);
 kit([[box(.18,.14,.18),WHITE,[0,.07,0]]],-14.9,F+12.2,.95);add(M.glass,cyl(.08,.28,12,.1),-14.9,F+12.2,1.23);
 kit([[box(.5,.3,.38),WHITE,[0,.15,0]],[box(.3,.2,.005),DARK,[-.05,.15,.19]],[box(.08,.2,.005),0x9aa1a5,[.18,.15,.19]]],-13.2,F+12.2,.95);
 kit([[cyl(.16,.08,14,.2),WOOD,[0,.04,0]],[sph(.05),0xe88a1a,[-.05,.1,.03]],[sph(.05),0xe88a1a,[.06,.1,-.02]],[sph(.05),0xe88a1a,[0,.12,.06]],...[0,1,2].map(k=>[new THREE.CapsuleGeometry(.018,.12,2,6).rotateZ(1.2+k*.15),0xf2d13a,[.02*k-.04,.14,-.05+k*.03]])],-12.1,F+12.2,.95);
 kit([0,1,2,3,4,5].map(k=>[cyl(.12,.012,18),WHITE,[0,k*.014,0]]),-11.2,F+12.2,.955);
 {const jars=[];for(const y of [1.75,2.3]){jars.push([box(2.2,.04,.25),WOOD,[0,y,0]]);for(let k=0;k<7;k++){const x=-.95+k*.3,kind=k%3;if(kind===0)jars.push([cyl(.055,.11,12),0x8a5a2b,[x,y+.075,0]],[cyl(.058,.02,12),WHITE,[x,y+.14,0]]);else if(kind===1)jars.push([cyl(.06,.05,14),0xb3242a,[x,y+.045,0]]);else jars.push([box(.12,.08,.08),0xe0b25a,[x,y+.06,0]]);}}kit(jars,-17.3,F+12.32);}
 add(M.menu,new THREE.PlaneGeometry(2.4,1.5),-14.2,F+12.47,2.75);
 kit([[box(1.2,.7,.06),DARK],[box(.1,.3,.1),DARK,[0,.3,-.08]]],-11.1,F+12.42,2.75);add(M.screen,new THREE.PlaneGeometry(1.1,.62),-11.1,F+12.37,2.75);
 // Partition to the stock room, with a strip curtain in its doorway.
 wall(M.plaster,-3*B+.15,-9,F+12.5,F+12.7,sink,5.25);wall(M.plaster,-8,-B-.06,F+12.5,F+12.7,sink,5.25);wall(M.plaster,-9,-8,F+12.5,F+12.7,2.3,5.25);
 clad(M.cafeWall,[-3*B+.16,F+12.49],[-9,F+12.49],[-13,F+8]);clad(M.cafeWall,[-8,F+12.49],[-B-.06,F+12.49],[-13,F+8],{u0:5});
 for(let k=0;k<10;k++)addc([RED,YELLOW,GREEN,0x2f6db5][k%4],box(.085,2.15,.01),-8.95+k*.1,F+12.6,1.2,0,true);
 kit([[box(.85,1.95,.75),0xc9282e,[0,.975,0]],[box(.87,.08,.77),0x2a2d30,[0,1.99,0]]],-18.75,F+9.4);add(M.fridge,new THREE.PlaneGeometry(.75,1.72),-18.75,F+9.005,1);
 const lamp=(x,d,y,color)=>{const len=5.1-y-.2;kit([[cyl(.006,len,6),DARK,[0,.2+len/2,0]],[new THREE.ConeGeometry(.22,.2,16),color,[0,.1,0]]],x,d,y,0,true);add(M.light,sph(.06,10,8),x,d,y-.02,0,true);};
 for(const x of [-16.3,-13.4,-10.5])lamp(x,F+9.2,2.7,GREEN);for(const [x,d] of tables)lamp(x,d,2.35,0xc4232a);
 const fan=new THREE.Mesh(mergeGeometries([paint(cyl(.08,.14,12),DARK),...[0,1,2].map(k=>paint(box(.95,.012,.15).translate(.55,-.02,0).rotateY(k*Math.PI*2/3),0x7a4a2a))],false),M.props);fan.name='Ventilador_de_teto';fan.userData.live=true;put(fan,-13.4,F+5.2,4.5,0,true);addc(DARK,cyl(.015,.55,6),-13.4,F+5.2,4.85,0,true);
 {const pos=[],col=[],colors=[RED,YELLOW,GREEN,0x2f6db5,WHITE].map(h=>new THREE.Color(h));let k=0;
  for(const d of [F+2.6,F+5.4,F+8.2])for(let x=-19.1;x<-6.9;x+=.3,k++){
   const sag=u=>4.55-.4*Math.sin(Math.PI*(u+19.1)/12.3),A=frame(x,d,sag(x),true),Bq=frame(x+.22,d,sag(x+.22),true),C=frame(x+.11,d,sag(x+.11)-.26,true),color=colors[k%5];
   for(const [p,q,r] of [[A,Bq,C],[A,C,Bq]])for(const v of [p,q,r]){pos.push(v.x,v.y,v.z);col.push(color.r,color.g,color.b);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();push(M.props,g);}
 addc(0x3a2616,box(.04,1.25,2.2),-3*B+.18,F+5.2,2.6);add(M.opening,new THREE.PlaneGeometry(2.08,1.17),-3*B+.21,F+5.2,2.6,Math.PI/2);
 addc(0x3a2616,box(.04,1.37,1),-3*B+.18,F+2.3,2.4);add(M.poster,new THREE.PlaneGeometry(.9,1.27),-3*B+.21,F+2.3,2.4,Math.PI/2);
 kit([[cyl(.2,.04,24).rotateZ(Math.PI/2),WHITE],[cyl(.21,.03,24).rotateZ(Math.PI/2),DARK,[-.005,0,0]],[box(.01,.12,.012),DARK,[.025,.05,0]],[box(.01,.012,.09),DARK,[.025,0,.04]]],-3*B+.2,F+7.6,3);
 const plant=(x,d)=>kit([[cyl(.2,.36,14,.24),0xa0522d,[0,.18,0]],[cyl(.21,.02,14),0x3b2a1a,[0,.35,0]],...[0,1,2,3,4,5,6].map(k=>[sph(.16,8,6).scale(.45,1.6,.45).rotateZ(.5*Math.cos(k*.9)).rotateX(.5*Math.sin(k*.9)),0x2f7d3a,[Math.cos(k*.9)*.08,.7,Math.sin(k*.9)*.08]])],x,d);
 plant(-7.2,F+1.2);plant(-18.95,F+1.35);
 kit([[cyl(.17,.5,14),0x7d858a,[0,.25,0]],[cyl(.18,.03,14),0x5d656a,[0,.515,0]]],-7.3,F+2.4);
 {const crates=[];for(const [x,z,n] of [[-.3,-.35,3],[.3,-.35,2],[-.3,.35,2],[.3,.35,3],[0,1.05,2]])for(let k=0;k<n;k++){crates.push([box(.45,.28,.35),k%2?RED:GREEN,[x,.14+k*.29,z]]);if(k===n-1)for(let i=0;i<6;i++)crates.push([cyl(.028,.12,8),k%2?0x5a1d12:GREEN,[x-.15+(i%3)*.15,.34+k*.29,z-.08+Math.floor(i/3)*.16]]);}kit(crates,-7.6,F+11.3,0,Math.PI/2);}
 // Stock room behind the partition: freezer, sacks of polvilho, shelving, a lamp.
 kit([[box(1.4,.85,.7),WHITE,[0,.425,0]],[box(1.42,.06,.72),0x9aa1a5,[0,.88,0]]],-10.5,F+14.9);
 {const sacks=[];for(let i=0;i<5;i++)sacks.push([box(.42,.22,.62),0xd9c9a3,[(i%2)*.46,.12+Math.floor(i/2)*.23,0]]);kit(sacks,-8.3,F+15.3);}
 shelves(-15,F+15.85,Math.PI/2,5);addc(0xdcdcdc,box(2.5,.08,.5),-13,F+14.5,5.12,0,true);add(M.light,box(2.4,.02,.4),-13,F+14.5,5.07,0,true);

 // --- Storefront outside: window, door with its sign, sill, awning, menu and sign.
 add(M.glass,new THREE.PlaneGeometry(w1-w0,head-sill),(w0+w1)/2,F+.2,(sill+head)/2,0,true);
 for(const x of [w0,w0+(w1-w0)/3,w0+2*(w1-w0)/3,w1])addc(ALU,box(.07,head-sill,.12),x,F+.2,(sill+head)/2,0,true);
 for(const y of [sill,head])addc(ALU,box(w1-w0,.07,.14),(w0+w1)/2,F+.2,y,0,true);addc(0xd9d2c0,box(w1-w0+.2,.05,.3),(w0+w1)/2,F+.02,sill-.02,0,true);
 add(M.glass,new THREE.PlaneGeometry(door1-door0,doorTop),(door0+door1)/2,F+.2,doorTop/2,0,true);for(const x of [door0,door1])addc(ALU,box(.07,doorTop,.12),x,F+.2,doorTop/2,0,true);addc(ALU,box(door1-door0,.07,.12),(door0+door1)/2,F+.2,doorTop,0,true);addc(ALU,box(.03,.35,.05),door1-.15,F+.12,1.05,0,true);
 put(new THREE.Mesh(new THREE.PlaneGeometry(.9,.45),std('Placa_entrada_lanchonete',0xffffff,{map:art.plaque('ENTRADA\nPELO BOX 99 →','#f7f1dc','#754627')})),(door0+door1)/2,F+.13,1.55,0,true).name='Placa_entrada_pelo_box';
 add(M.awning,scaleUV(new THREE.PlaneGeometry(w1-w0+.4,1.36),(w1-w0+.4)/2.8,1).rotateX(1.865),(w0+w1)/2,F-.6,2.75,0,true);add(M.awning,scaleUV(new THREE.PlaneGeometry(w1-w0+.4,.28),(w1-w0+.4)/2.8,1),(w0+w1)/2,F-1.25,2.44,0,true);
 // The canvas falls toward the lane: arms run 3 cm under it with the same slope, and
 // tie rods come down above it from under the sign to its front edge, so no rod
 // comes through the awning (the window below leaves no room for struts).
 for(const x of [w0,(w0+w1)/2,w1])addc(DARK,box(.03,.03,1.3).rotateX(.294),x,F-.59,2.72,0,true);
 for(const x of [w0,w1])addc(DARK,box(.02,.02,1.41).rotateX(.394),x,F-.6,2.83,0,true);
 add(M.menu,new THREE.PlaneGeometry(1.3,.81),-18.5,F+.03,1.75,0,true);
 sign(art.signBoard('LANCHONETE DA TIA','CAFÉ · PÃO DE QUEIJO · DOCE DE LEITE','#754627','#ffe2a0'),8,1.6,-13.5,F+.03,3.95).name='Placa_lanchonete';

 // --- Team stand on the pit wall in front of the box, facing the track.
 // Without a pit wall (Curvelo) it stands on a concrete plinth on the grass.
 let standBox,standFloor,onStand,desk;
 {const p0=lerp(S);let dw,t,top;
  if(pit.stand)({d:dw,thickness:t,top}=pit.stand);
  // The pit wall may come in several stretches (Cascavel has three): the nearest point of any.
  else{const o=at(p0,0);let best=null;for(const q of pit.walls.filter(w=>w.name==='Muro_boxes').flatMap(w=>w.points)){const dist=Math.hypot(q[0]-o.x,q[1]+o.z);if(!best||dist<best[0])best=[dist,q];}
   const q=best[1];dw=(q[0]-p0[c.x])*p0[c.lx]+(q[1]-p0[c.y])*p0[c.ly];t=q[3];top=q[2]+1.05-p0[c.z];}
  const W=Math.min(2.2,t-.5),dc=dw+t/2-.2-W/2;
  // The plinth runs under the steps' landing too (x -2.65 to 1.95, as the pit wall top).
  if(pit.stand)addc(0x9a9c96,box(4.6,top-sink,t),-.35,dw,(top+sink)/2,0,true);
  const stand=[[box(3.2,.08,W),0x3a4045,[0,.04,0]],[box(2.8,.05,.7),DARK,[0,.82,W/2-.45]],[box(3.5,.08,W+.3),RED,[0,2.46,0]],[box(3.5,.3,.04),RED,[0,2.3,-W/2-.15]],[cyl(.012,1.6,6),ALU,[1.5,3.3,0]],[box(.02,.25,.4),YELLOW,[1.5,3.95,.2]]];
  for(const x of [-1.3,1.3])stand.push([box(.05,.78,.05),STEEL,[x,.43,W/2-.45]]);
  for(const x of [-.95,0,.95])stand.push([box(.62,.4,.04),DARK,[x,1.1,W/2-.28]]);
  for(const [x,z] of [[-1.55,-W/2+.05],[1.55,-W/2+.05],[-1.55,W/2-.05],[1.55,W/2-.05]])stand.push([cyl(.035,2.4,8),STEEL,[x,1.24,z]]);
  for(const x of [-.6,.6])stand.push([cyl(.2,.05,14),DARK,[x,.72,-W/2+.55]],[cyl(.03,.66,8),ALU,[x,.37,-W/2+.55]],[cyl(.2,.02,14),ALU,[x,.05,-W/2+.55]]);
  // Read by the engineers, left to right: best laps, best races, the other mode's best laps.
  kit(stand,0,dc,top,0,true);[.95,0,-.95].forEach((x,i)=>add(boardMaterials[i],new THREE.PlaneGeometry(.56,.33),x,dc-(W/2-.31),top+1.1,Math.PI,true));
  // The team sign hangs 3 cm off the red fascia (on its face it flickered).
  sign(art.signBoard('AUTO-POBRE RACING · 99','','#c01e25','#fff4d8',{h:96}),3.4,.28,0,dc+W/2+.2,top+2.3,Math.PI);
  // Steps up from the lane, with yellow nosing on the treads.
  const D=dw+t/2+.3;
  kit([[box(.8,top/3,.3),STEEL,[0,top/6,-.15]],[box(.8,top*2/3,.3),STEEL,[0,top/3,.15]],[box(.8,.012,.06),YELLOW,[0,top/3+.006,-.27]],[box(.8,.012,.06),YELLOW,[0,top*2/3+.006,.03]]],-2.2,D);
  standBox=[-2.65,1.95,Math.min(dw-t/2,dc-W/2-.2),Math.max(dw+t/2+.6,dc+W/2+.25)];
  // On foot the stand is climbed by its steps: the treads, the wall top (or plinth) and
  // the deck are floors, each entered from at most a step (45 cm) below. The fence edge,
  // the desk and the canopy posts stay solid; the engineers are solid people (layout.solid).
  // onStand: the cells where these floors replace the pit wall's collision.
  const deskD=dc-W/2+.45,edge=pit.stand?0:.15;
  onStand=(x,d)=>x>-2.6&&x<-1.8&&d>D-.3&&d<D+.3?(d>D?1:2):x>-2.65&&x<1.95&&d>dw-t/2&&d<=dw+t/2?3:0;
  standFloor=(x,d,elevation)=>{
   const cell=onStand(x,d);if(!cell)return x>-2.65-R&&x<1.95+R&&d>dw-t/2-R&&d<dw+t/2?null:undefined;
   if(cell===3&&(d<dw-t/2+edge+R||Math.abs(x)<1.4+R&&Math.abs(d-deskD)<.35+R||[-1.55,1.55].some(px=>[-1,1].some(k=>Math.hypot(x-px,d-dc-k*(W/2-.05))<.035+R))))return null;
   const y=cell<3?frame(x,D,top*cell/3).y:frame(x,d,top+(Math.abs(x)<1.6&&Math.abs(d-dc)<W/2?.08:0),true).y;
   return y<=elevation+.45?y:null;
  };
  // Registration (story mode): the circle beside the left engineer, where the pilot
  // faces him and his screens; the route climbs from the foot of the steps.
  const place=(x,d,y,absolute=true)=>{const f=frame(x,d,y,absolute);return new THREE.Vector3(f.x,f.y,f.z);},[sx,sd,ex,ed]=[-1.15,(dc+W/2-.55+deskD+.35)/2,-.6,dc+W/2-.55],spot=place(sx,sd,top+.08),team=place(ex,ed,top+.08);
  desk={spot,team,face:Math.atan2(-(team.z-spot.z),team.x-spot.x),look:frame(0,0).h-Math.PI/2+.2,route:[place(-2.2,D+.9,0,false),place(-2.2,dw+t/2-.45,top),spot.clone()]};
  for(const x of [-.6,.6]){const w=frame(x,dc+W/2-.55,top+.08,true);crowd.push({outfit:{...OUTFITS.engineer,skin:x<0?0xc68e6a:0x8d5a3b},pose:'stool',idle:'desk',x:w.x,y:w.y+.02,z:w.z,yaw:w.h-Math.PI/2});}}

 // --- Café regulars (idling with their coffee, pit-crew.js) and the animated crew and Tia.
 const person=(x,d,y,pose,outfit,turn)=>{const w=frame(x,d,y);crowd.push({outfit,pose,x:w.x,y:w.y,z:w.z,yaw:w.h+turn});};
 person(-15.3,F+1.4,.16,'stool',{top:GREEN,bottom:0x2b3a55,skin:0xb77a55,hat:'cap',hatColor:YELLOW},-Math.PI/2);
 person(-12.3,F+1.4,.16,'stool',{top:WHITE,bottom:0x3b3f45,skin:0x8d5a3b,hairStyle:'curly'},-Math.PI/2);
 {const [x,d]=tables[0],a=seats[1];person(x+Math.cos(a)*.74,d+Math.sin(a)*.74,.12,'sit',{top:0xe0b25a,bottom:0x3b3f45,skin:0xe0b08f,hairStyle:'long',hair:0x5a3a22},a+Math.PI);}
 {const [x,d]=tables[2],a=seats[0];person(x+Math.cos(a)*.74,d+Math.sin(a)*.74,.12,'sit',{top:0x2f6db5,bottom:0x2d3338,skin:0x6b4128,mustache:true,hairStyle:'bald'},a+Math.PI);}
 const h0=spot.heading,O=at(lerp(S),0),ux=Math.cos(h0),uy=Math.sin(h0);
 const toData=(x,d)=>[O.x+ux*x-uy*d,-O.z+uy*x+ux*d],toLocal=(X,Y)=>{const dx=X-O.x,dy=Y+O.z;return {x:dx*ux+dy*uy,d:-dx*uy+dy*ux};};
 const ground=(X,Y)=>{const q=toLocal(X,Y);return floorAt(q.x,q.d);};
 // The crew waits at the door, clear of the car parked in the box.
 const homes=[[-1.4,'rest'],[1.3,'stand'],[2.7,'ready'],[-2.8,'stand'],[-4.1,'folded'],[4.1,'stand']].map(([x,pose])=>{const [X,Y]=toData(x,Math.max(F-.45,spot.d+1.55));return {x:X,y:Y,yaw:h0-Math.PI/2,pose};});
 const crew=new PitCrew(people,{homes,ground});group.add(crew.root);
 const [tx,ty]=toData(-13.2,F+10.25),tia=new CafeHost(people,{x:tx,y:ty,yaw:h0-Math.PI/2,ground});group.add(tia.root);

 // --- Merge the static parts by material.
 for(const [material,list] of lists){
  const all=list.some(g=>!g.index)?list.map(g=>g.index?g.toNonIndexed():g):list,g=mergeGeometries(all,false);list.forEach(x=>x.dispose());
  const m=new THREE.Mesh(g,material);m.name=material.name;m.castShadow=!material.transparent&&material!==M.light;m.receiveShadow=true;group.add(m);
  if(material===M.concrete||material===M.plaster)obstacles.push(m);
 }

 // --- On foot (on-foot.js) these are the rooms: the garage, the gap in the rail and
 // the café up to its counter, with the door threshold; outside them the pilot walks
 // on the ground. Blocks are [x0,x1,d0,d1] with a 25 cm body radius.
 const R=.25,blocks=[[B-.95,B-.15,F+3.2,F+9.2],[B-.45,B-.15,F+9.4,F+9.8],[B-.85,B-.15,F+9.7,F+12.2],[B-.9,B-.15,F+13.1,F+14.2],[B-1.65,B-1.15,F+13.55,F+14.05],[B-2.1,B-.15,F+15.1,F+16.2],
  [2.2,3.4,F+13.4,F+14.6],[1.95,2.45,F+11,F+12],[3.25,3.75,F+10,F+11],[-B+.1,-2.9,F+14.3,F+16.2],[-B,-B+.75,F+9,F+12.5],[B-1.55,B-.75,F+.9,F+1.5],[-B+.5,-B+1.5,F+.95,F+1.55],[-B+.15,-B+.45,F+1.85,F+2.15],
  [-17.45,-9.55,F+.35,F+1],...[-16.8,-15.3,-13.8,-12.3,-10.8].map(x=>[x-.2,x+.2,F+1.15,F+1.55]),...tables.map(([x,d])=>[x-.8,x+.8,d-.8,d+.8]),
  [-18.25,-8.55,F+8.85,F+9.6],[-19.4,-18.3,F+9,F+9.8],[-9.2,-8.55,F+9.2,F+11.9],[-8.3,-6.6,F+10.2,F+12.5],[-19.4,-6.5,F+12.45,F+12.75],[-7.45,-6.95,F+.95,F+1.45],[-19.2,-18.7,F+1.1,F+1.6],[-7.5,-7.1,F+2.2,F+2.6]];
 function walkable(x,d){
  let inside;
  if(d<F+.35+R)inside=x>-B+.35&&x<B-.35;
  else inside=x>-B+.06+R&&x<B-.15-R&&d<F+16.15-R||x>-3*B+.15+R&&x<-B-.06-R&&d<F+16.15-R||Math.abs(x+B)<.5&&d>F+4.3+R&&d<F+5.7-R;
  return inside&&!blocks.some(([x0,x1,d0,d1])=>x>x0-R&&x<x1+R&&d>d0-R&&d<d1+R);
 }
 const world=(x,d,y=0)=>{const [X,Y]=toData(x,d);return new THREE.Vector3(X,floorAt(x,d)+y,-Y);};
 // First waypoint: beside the parked car, clear of its footprint, before the garage door.
 const route=[[0,Math.min(F-.07,Math.max(spot.d+1.45,F-.6))],[-3.2,F+2.6],[-5.6,F+5],[-7.3,F+5.2],[-11.2,F+7.4],[-13.2,F+8.1]].map(([x,d])=>world(x,d));
 const spotWorld=at(lerp(S),spot.d),[spotX,spotY]=toData(0,spot.d);
 const layout={
  pit,anchor:{x:spotWorld.x,y:spotWorld.y+.055,z:spotWorld.z,heading:h0},label:'INTERLAGOS · BOX 99',title:'Cuida do Opala!',name:'Box 99 de Interlagos',...labels,scenery:true,
  // lap, race: trackRecords rows (lap-records.js); mode: the story's ('immersive') or the race's.
  // recordsShown keeps what the TVs show.
  showRecords:({title,mode,lap,race,laps,other})=>{layout.recordsShown={title,mode,lap,race,other};const kind=m=>m==='immersive'?'MODO HISTÓRIA':'MODO CORRIDA';
   boards[0].show({title,subtitle:`MELHOR VOLTA · ${kind(mode)}`,rows:lap});boards[1].show({title,subtitle:`CORRIDA DE ${laps} VOLTA${laps>1?'S':''} · ${kind(mode)}`,rows:race});boards[2].show({title,subtitle:`MELHOR VOLTA · ${kind(other.mode)}`,rows:other.lap});},
  inBox:surface=>inServiceSpot(spot,surface),
  crew,cafeSeat:route.at(-1).clone(),cafeSign:world(-13.2,F+9.6,2.95),route,heroHeading:h0+Math.PI/2,pitView:[5.6,-6.4,2.9],
  makeHero:()=>people.person(OUTFITS.driver),
  // elevation: the height of the pilot's feet (the team stand is climbed step by step).
  walk:(pos,elevation=pos.y)=>{
   const q=toLocal(pos.x,-pos.z);if(q.x>standBox[0]-R&&q.x<standBox[1]+R&&q.d>standBox[2]-R&&q.d<standBox[3]+R){const y=standFloor(q.x,q.d,elevation);if(y!==undefined)return y;}
   if(q.d<F+.2-R||q.d>F+16.8||q.x<-3*B-1||q.x>B+1)return undefined;return walkable(q.x,q.d)?floorAt(q.x,q.d):null;
  },
  // On the stand's steps, wall top and deck the layout's floors stand for the pit wall.
  overWalls:pos=>{const q=toLocal(pos.x,-pos.z);return !!onStand(q.x,q.d);},
  desk,
  // People are solid on foot: everyone placed for good at his level (the stand, the
  // café, the garages; not the roof terrace) and, unless it is at work round the car,
  // the crew. Only steps toward someone are stopped, so nobody gets pinned.
  solid:(pos,from,withCrew=true)=>{const near=(x,z)=>{const a=Math.hypot(pos.x-x,pos.z-z);return a<.5&&a<Math.hypot(from.x-x,from.z-z);};return withCrew&&crew.actors.some(a=>near(a.x,-a.y))||crowd.some(p=>Math.abs(p.y-pos.y)<1.6&&near(p.x,p.z));},
  // Keep the walking camera inside the garage and the café's customer side (the low
  // glass rail between them hides nothing), out of the closed buildings, under the ceiling.
  frameEye:(eye,hero)=>{
   const hq=toLocal(hero.x,-hero.z),e=toLocal(eye.x,-eye.z),indoors=hq.d>F+.3&&hq.d<F+16.8&&hq.x>-3*B-1&&hq.x<B+1;let {x,d}=e;
   if(Math.abs(hq.x)>60||hq.d<F-40||hq.d>F+40)return;
   if(indoors){x=Math.min(B-.35,Math.max(-3*B+.4,x));d=x<-B?Math.min(F+8.6,Math.max(F+.6,d)):Math.min(F+15.8,d);}
   else if(hq.d<F&&d>F-.1&&(x<-B+.3||x>B-.3))d=F-.1;
   // Past a limit the eye comes in toward the pilot's head along its own line, so the
   // view keeps its angle (instead of sliding over him and looking straight down).
   let t=1;
   if(x!==e.x&&Math.abs(e.x-hq.x)>1e-3)t=Math.min(t,(x-hq.x)/(e.x-hq.x));
   if(d!==e.d&&Math.abs(e.d-hq.d)>1e-3)t=Math.min(t,(d-hq.d)/(e.d-hq.d));
   if(t<1){t=Math.max(.05,t);const head=hero.y+1.35;eye.x=hero.x+(eye.x-hero.x)*t;eye.z=hero.z+(eye.z-hero.z)*t;eye.y=head+(eye.y-head)*t;}
   if(indoors){const q=toLocal(eye.x,-eye.z);eye.y=Math.min(eye.y,floorAt(q.x,q.d)+4.3);}
  },
  animate(dt,s){
   const cam=s.camera.position,near=Math.hypot(cam.x-O.x,cam.z-O.z)<160;fan.rotation.y+=dt*3.2;
   crew.update(dt,{car:s.car,active:s.opened,jobs:s.jobs.map(j=>j.id),finished:!s.jobs.length&&!s.queue.length,departing:s.departing&&Math.hypot(s.car.x-spotX,s.car.y-spotY)<30,near});
   tia.update(dt,{hero:s.hero,walking:s.walking,snack:s.snack,near});
  },
 };
 return {group,crew,tia,layout,frame,sidewall};
}
