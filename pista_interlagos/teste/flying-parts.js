import * as THREE from 'three';

// The parts that fly off the car ahead in the story's race (immersive-mode.js hazards) at the player's windscreen:
// real pieces of a car coming apart (Central de Projetos #24) instead of the prototype's pebble. Each is built once
// here, a few hundred triangles of plain shapes, and shown one at a time. name: how the warning calls it; weight:
// how hard it hits (the glass's knock, how far it bounces); size: about its longest side (m).
export const FLYING_PARTS=Object.freeze([
 Object.freeze({id:'cardan',name:'Um pedaço de cardã',weight:1.4,size:.62}),
 Object.freeze({id:'engrenagem',name:'Uma engrenagem do câmbio',weight:.8,size:.15}),
 Object.freeze({id:'mola',name:'Uma mola da suspensão',weight:1.1,size:.27}),
 Object.freeze({id:'disco',name:'Um disco de freio',weight:1.3,size:.28}),
 Object.freeze({id:'pistao',name:'Um pistão com a biela',weight:1,size:.24}),
 Object.freeze({id:'amortecedor',name:'Um amortecedor',weight:1.1,size:.44}),
 Object.freeze({id:'escapamento',name:'Um pedaço do escapamento',weight:.9,size:.55}),
]);

// (both faces: the lathed and swept shapes are open)
const mat=(color,metalness,roughness)=>new THREE.MeshStandardMaterial({color,metalness,roughness,side:THREE.DoubleSide});
// One material set for every part (dirty steel, polished steel, rust, grease, paint).
function materials(){
 return {steel:mat(0x8e9195,.85,.38),bright:mat(0xc9ccd0,.95,.18),dark:mat(0x3b3d40,.6,.55),rust:mat(0x7b4a2b,.25,.82),
  grease:mat(0x1e1e1f,.2,.6),red:mat(0xa3201d,.3,.45),yellow:mat(0xe0b31a,.25,.4),alloy:mat(0xb7b9b3,.7,.42)};
}
const add=(group,geometry,material,p=[0,0,0],r=[0,0,0])=>{const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.rotation.set(...r);m.castShadow=true;group.add(m);return m;};
const cyl=(r0,r1,h,n=14)=>new THREE.CylinderGeometry(r0,r1,h,n);

// A helix (the spring): radius r, height h, turns, about the y axis, centred.
class Helix extends THREE.Curve{
 constructor(r,h,turns){super();this.r=r;this.h=h;this.turns=turns;}
 getPoint(t,out=new THREE.Vector3()){const a=t*Math.PI*2*this.turns;return out.set(Math.cos(a)*this.r,(t-.5)*this.h,Math.sin(a)*this.r);}
}
// A gear's outline with its teeth and the bore (z the axle), extruded.
function gear(teeth,outer,root,bore,depth){
 const shape=new THREE.Shape(),n=teeth*4;
 for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,k=i%4,r=k===1||k===2?outer:root;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}
 const hole=new THREE.Path();hole.absarc(0,0,bore,0,Math.PI*2,true);shape.holes.push(hole);
 return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:8}).translate(0,0,-depth/2);
}

const BUILD={
 // A driveshaft broken off behind its universal joint: the tube, the balance weight, the yoke and its cross.
 cardan(g,m){
  add(g,cyl(.034,.034,.56),m.dark,[0,-.04,0]);add(g,cyl(.036,.03,.04),m.rust,[0,-.34,0]);
  add(g,new THREE.BoxGeometry(.05,.06,.012),m.dark,[0,-.1,.036]);
  add(g,cyl(.045,.045,.03),m.steel,[0,.25,0]);
  for(const s of [-1,1])add(g,new THREE.BoxGeometry(.016,.06,.03),m.steel,[s*.035,.29,0]);
  add(g,cyl(.012,.012,.1,8),m.bright,[0,.3,0],[0,0,Math.PI/2]);add(g,cyl(.012,.012,.1,8),m.bright,[0,.3,0],[Math.PI/2,0,0]);
 },
 // A gearbox gear (25 teeth) on a stub of its shaft.
 engrenagem(g,m){add(g,gear(25,.07,.06,.016,.024),m.bright);add(g,cyl(.028,.028,.05,14),m.steel,[0,0,0],[Math.PI/2,0,0]);add(g,cyl(.016,.016,.09,10),m.grease,[0,0,0],[Math.PI/2,0,0]);},
 // A suspension coil spring, painted red.
 mola(g,m){add(g,new THREE.TubeGeometry(new Helix(.055,.26,6),150,.008,6,false),m.red);},
 // A vented brake disc with its hat, the swept face shiny and the rest rusty.
 disco(g,m){
  const lathe=(pts,n=28)=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),n);
  add(g,lathe([[.072,-.012],[.14,-.012],[.14,.012],[.072,.012],[.072,-.012]]),m.steel);
  add(g,lathe([[.074,.012],[.074,.05],[.03,.05],[.03,.056],[.001,.056]]),m.rust);
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;add(g,cyl(.007,.007,.06,6),m.dark,[Math.cos(a)*.045,.03,Math.sin(a)*.045]);}
 },
 // A piston with its rings, pin and connecting rod.
 pistao(g,m){
  add(g,cyl(.045,.045,.06,20),m.alloy,[0,.08,0]);for(const y of [.095,.08])add(g,new THREE.TorusGeometry(.045,.002,4,24),m.dark,[0,y,0],[Math.PI/2,0,0]);
  add(g,cyl(.01,.01,.092,8),m.bright,[0,.07,0],[0,0,Math.PI/2]);
  add(g,new THREE.BoxGeometry(.022,.15,.014),m.steel,[0,-.01,0]);add(g,new THREE.TorusGeometry(.03,.009,6,16),m.steel,[0,-.1,0]);
 },
 // A shock absorber: the yellow body, the chrome rod, the eyes at both ends.
 amortecedor(g,m){
  add(g,cyl(.028,.028,.26,16),m.yellow,[0,-.06,0]);add(g,cyl(.009,.009,.15,8),m.bright,[0,.14,0]);add(g,cyl(.022,.022,.03,12),m.grease,[0,.085,0]);
  for(const y of [-.2,.215])add(g,new THREE.TorusGeometry(.017,.006,6,12),m.dark,[0,y,0]);
 },
 // A bent stretch of exhaust pipe with the silencer still on it, rusty.
 escapamento(g,m){
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(-.3,0,0),new THREE.Vector3(-.12,.02,0),new THREE.Vector3(.06,.08,.03),new THREE.Vector3(.18,.2,.05)]);
  add(g,new THREE.TubeGeometry(path,24,.024,8,false),m.rust);add(g,cyl(.065,.065,.2,16),m.dark,[-.2,0,0],[0,0,Math.PI/2]);add(g,cyl(.026,.026,.02,8),m.grease,[.185,.21,.05],[0,0,-.6]);
 },
};

// The parts, each a group in root (hidden), the chosen one shown by show(id) (null: none).
export function createFlyingParts(){
 const root=new THREE.Group(),m=materials(),parts={};root.name='Pecas_voando';
 for(const p of FLYING_PARTS){const g=new THREE.Group();g.name='Peca_'+p.id;BUILD[p.id](g,m);g.visible=false;root.add(g);parts[p.id]=g;}
 let shown=null;
 return {root,parts,show(id){if(shown===id)return;if(shown)parts[shown].visible=false;shown=id;if(id)parts[id].visible=true;root.visible=!!id;}};
}
