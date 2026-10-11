import * as THREE from 'three';

// Where the sun's shadow map lies. One orthographic box along the sun follows the car; two things
// make it look better than its size. It leans toward what the camera sees (centred on the car, half
// of it shaded the road behind), and its centre moves in whole shadow texels in the light's own
// frame, so the edges of still shadows (trees, posts, the grandstand roof) stop crawling as the car
// drives. No DOM here: main.js placeSun moves the light, testar_luz.mjs checks the maths.
// How far the box leans, as a share of its half-size, and the room it always keeps round the car
// (the car, the rivals beside it and the road just behind for the cockpit mirror).
export const SHADOW_LEAN=.45,SHADOW_MARGIN=12;
// Easing of the lean (per second): a quick look round or a change of camera slides the box over
// a few frames instead of popping every shadow edge at once.
export const LEAN_RATE=3;

// The axes of a shadow camera looking down -direction, as three's lookAt builds them (up +Y):
// x and y span the map, z runs toward the sun.
export function lightBasis(direction,basis={x:new THREE.Vector3(),y:new THREE.Vector3(),z:new THREE.Vector3()}){
 basis.z.copy(direction).normalize();basis.x.set(0,1,0).cross(basis.z);
 if(basis.x.lengthSq()<1e-12)basis.x.set(1,0,0);basis.x.normalize();basis.y.crossVectors(basis.z,basis.x);
 return basis;
}
// The lean for a camera looking along forward (any vector; only its horizontal part counts, null:
// none), for a box of ±reach metres: along the view as the light sees it, never past the margin.
export function shadowLean(forward,basis,reach,out=new THREE.Vector3()){
 out.set(0,0,0);if(!forward)return out;
 const h=Math.hypot(forward.x,forward.z);if(h<1e-6)return out;
 const fx=(forward.x*basis.x.x+forward.z*basis.x.z)/h,fy=(forward.x*basis.y.x+forward.z*basis.y.z)/h,len=Math.hypot(fx,fy);
 const k=Math.max(0,Math.min(SHADOW_LEAN*reach,reach-SHADOW_MARGIN));
 if(len<1e-6||k===0)return out;
 return out.copy(basis.x).multiplyScalar(fx/len*k).addScaledVector(basis.y,fy/len*k);
}
// A point moved to the nearest whole texel across the map (its depth along the sun is kept).
export function snapToTexels(point,basis,texel,out=new THREE.Vector3()){
 const a=Math.round(point.dot(basis.x)/texel)*texel,b=Math.round(point.dot(basis.y)/texel)*texel,c=point.dot(basis.z);
 return out.copy(basis.x).multiplyScalar(a).addScaledVector(basis.y,b).addScaledVector(basis.z,c);
}

// The light's target for the followed car: the eased lean, then the texel snap. place() returns the
// centre (the sun goes 'distance' metres up the sun direction from it).
export class SunPlacement{
 constructor(direction,{distance=140}={}){
  this.direction=direction.clone().normalize();this.distance=distance;this.basis=lightBasis(this.direction);
  this.lean=new THREE.Vector3();this.wanted=new THREE.Vector3();this.centre=new THREE.Vector3();this.raw=new THREE.Vector3();this.texel=0;
 }
 // Another key light (the weather's: a low sun at dusk, the moon at night): its frame, and the lean starts afresh.
 setDirection(direction){this.direction.copy(direction).normalize();lightBasis(this.direction,this.basis);this.lean.set(0,0,0);}
 // p: the car; forward: where the camera looks (null: centred); reach: half-size of the box in
 // metres; size: map texels; dt: seconds since the last call (1 or more: no easing).
 place(p,forward,{reach,size,dt=1}){
  shadowLean(forward,this.basis,reach,this.wanted);
  this.lean.lerp(this.wanted,dt>=1?1:1-Math.exp(-Math.max(dt,0)*LEAN_RATE));
  this.texel=2*reach/size;
  return snapToTexels(this.raw.copy(p).add(this.lean),this.basis,this.texel,this.centre);
 }
 // Light-space offset of a point from the box centre, in metres (|x|,|y| <= reach: inside the map).
 offset(point,out=new THREE.Vector2()){const d=point.clone().sub(this.centre);return out.set(d.dot(this.basis.x),d.dot(this.basis.y));}
 info(){return {centre:this.centre.toArray(),lean:this.lean.toArray(),texel:this.texel};}
}
