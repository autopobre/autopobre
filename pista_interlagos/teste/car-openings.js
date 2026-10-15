import * as THREE from 'three';
// Hinged parts of the Opala 99 V06 (modelo_3d/v06_pecas_separadas). Each hinge empty in the
// GLB carries its opening in the GLB frame as glTF extras: eixo_gltf (axis) and
// angulo_gltf_graus. Turning the empty from rest by that angle opens the part. Reasons hold
// a part open (the crew on the engine, the driver getting out, the action key); it closes when
// none is left. A car without hinges (the V05 GLB) simply has no parts.
export const OPENINGS=Object.freeze({hood:'Capo_DOBRADICA',trunk:'Tampa_porta_malas_DOBRADICA',
 driverDoor:'Porta_Motorista_DOBRADICA',passengerDoor:'Porta_Passageiro_DOBRADICA',
 fuelCaps:Object.freeze(['Tampa_bocal_1_DOBRADICA','Tampa_bocal_2_DOBRADICA'])});
// Full swings per second: a door is flung, the hood and lid are lifted.
const SWING={porta:1.4,capo:.7,porta_malas:.8,tampa_combustivel:3};
const ease=t=>t*t*(3-2*t),turn=new THREE.Quaternion();
const hinged=o=>Array.isArray(o.userData?.eixo_gltf)&&!!o.userData.angulo_gltf_graus;

export class CarOpenings {
 constructor(){this.parts=new Map();}
 // Hinges of a freshly loaded car, all shut; call again after a livery swap.
 attach(model){
  this.parts.clear();
  model?.traverse(o=>{if(!hinged(o))return;const u=o.userData;
   this.parts.set(o.name,{obj:o,kind:u.peca,rest:o.quaternion.clone(),axis:new THREE.Vector3(...u.eixo_gltf).normalize(),
    angle:THREE.MathUtils.degToRad(u.angulo_gltf_graus),open:0,reasons:new Set(),timers:new Map()});});
  return this;
 }
 has(name){return this.parts.has(name);}
 held(name,reason){return !!this.parts.get(name)?.reasons.has(reason);}
 hold(names,reason,on=true){for(const name of [names].flat()){const p=this.parts.get(name);if(!p)continue;if(on)p.reasons.add(reason);else{p.reasons.delete(reason);p.timers.delete(reason);}}}
 // Open for a moment (the driver getting in or out), then shut again.
 pulse(names,seconds,reason='passagem'){for(const name of [names].flat()){const p=this.parts.get(name);if(p){p.reasons.add(reason);p.timers.set(reason,seconds);}}}
 toggle(name,reason='manual'){if(!this.parts.has(name))return false;const on=!this.held(name,reason);this.hold(name,reason,on);return on;}
 release(reason){for(const p of this.parts.values()){p.reasons.delete(reason);p.timers.delete(reason);}}
 closeAll(instant=false){for(const p of this.parts.values()){p.reasons.clear();p.timers.clear();if(instant){p.open=0;this.pose(p);}}}
 isOpen(name){return (this.parts.get(name)?.open??0)>.02;}
 // How far open, as posed (0 shut, 1 open).
 amount(name){return ease(this.parts.get(name)?.open??0);}
 update(dt){
  for(const p of this.parts.values()){
   for(const [reason,left] of p.timers){if(left<=dt){p.timers.delete(reason);p.reasons.delete(reason);}else p.timers.set(reason,left-dt);}
   const target=p.reasons.size?1:0;if(p.open===target)continue;
   const step=Math.max(0,dt)*(SWING[p.kind]??1);p.open=target>p.open?Math.min(target,p.open+step):Math.max(target,p.open-step);this.pose(p);
  }
 }
 pose(p){p.obj.quaternion.copy(p.rest).multiply(turn.setFromAxisAngle(p.axis,p.angle*ease(p.open)));}
 info(){return Object.fromEntries([...this.parts].map(([name,p])=>[name,{kind:p.kind,open:Math.round(p.open*1000)/1000,reasons:[...p.reasons]}]));}
}
// The action key by the car, GTA style: ahead of the nose it lifts the hood, behind the tail the
// trunk lid, beside the driver's door it gets in. local: the pilot on foot in the car's frame
// (GLB frame: +x forward, driver's side -z). Returns 'capo', 'porta_malas', 'porta' or null.
export function carSpot(local){
 const x=local.x,z=local.z;
 if(Math.abs(z)<1.3&&x>1.85&&x<3.8)return 'capo';
 if(Math.abs(z)<1.3&&x<-1.85&&x>-3.6)return 'porta_malas';
 if(z<-.75&&z>-2.4&&x>-1&&x<1.4)return 'porta';
 return null;
}
export const SPOT_OPENING=Object.freeze({capo:OPENINGS.hood,porta_malas:OPENINGS.trunk});
// Of the model under root, only the part named (and what rides it) left shown: the rear-view mirror's own picture
// (main.js) draws none of the player's car but its open trunk lid, which fills the back window as it would (user,
// 2026-10-15). Returns how to show the rest again (null: no such part).
export function showOnly(root,name){
 const part=root.getObjectByName(name);if(!part)return null;const hidden=[];
 for(let o=part;o!==root;o=o.parent)for(const s of o.parent.children)if(s!==o&&s.visible){s.visible=false;hidden.push(s);}
 return ()=>{for(const o of hidden)o.visible=true;};
}
// Copies for other cars (rivals, the Opala parked in the paddock) keep every hinge shut: the
// exporter saves the hinge empties without rotation, so rest is the identity.
export function shutOpenings(root){root.traverse(o=>{if(hinged(o))o.quaternion.identity();});}
