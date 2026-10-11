import * as THREE from 'three';

// Working door mirrors for the cockpit view (players asked for them). They show the road
// behind from the picture the rear-view mirror already renders (cockpit.js rearCamera: 125°
// wide, from the middle of the cabin), so they cost no extra pass. Both cars' models carry
// the mirrors' own glass facing the driver (the Opala's "Espelho", the Fusca's "Espelho_fusca"):
// each side's picture is drawn in the plane of its glass, over its outline (the Opala's is a
// rounded rectangle, the Fusca's an oval), a millimetre or two ahead of it.
// Each glass is set as a driver sets it: its middle shows the road straight back, a few
// degrees out past the car's flank, whatever the eye does; it is somewhat convex (widen) so a
// car alongside stays in it. The reflected ray of every pixel meets the scene `distance`
// metres away and is looked up where the rear camera saw that point: exact for cars about
// that far, a little off for those very close. The glass is written with alpha -1: the film
// look (cinematic.js) then keeps its ambient occlusion off it, which read the glass sunk in its
// housing as a deep dark corner and left it about a third as bright as the rear-view mirror.
export const SIDE_MIRRORS=Object.freeze({outward:.12,down:-.02,widen:3.4,distance:14,reflectance:.82});
const vertexShader=`attribute float edge;varying vec3 vWorld;varying float vEdge;
void main(){vEdge=edge;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragmentShader=`uniform sampler2D map;uniform mat4 rearViewProjection;uniform vec3 glassNormal,glassCenter,centerRay;uniform float widen,distance,reflectance;
varying vec3 vWorld;varying float vEdge;
void main(){
 vec3 ray=reflect(normalize(vWorld-cameraPosition),glassNormal);ray=normalize(centerRay+(ray-centerRay)*widen);
 vec4 clip=rearViewProjection*vec4(glassCenter+ray*distance,1.);vec2 uv=clamp(clip.xy/max(clip.w,1e-3)*.5+.5,0.,1.);
 gl_FragColor=vec4(texture2D(map,uv).rgb*reflectance*(1.-.6*smoothstep(.9,1.,vEdge)),-1.);
 #include <colorspace_fragment>
}`;
// The glass's outline in its plane, scaled to the unit square: a fan from the middle, `edge`
// running 0 there to 1 on the rim (the darkened border). Convex hull of the glass's points.
function outlineGeometry(points){
 const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lower=[],upper=[];
 for(const q of p){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
 for(const q of p.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
 const hull=lower.slice(0,-1).concat(upper.slice(0,-1)),position=[0,0,0],edge=[0],index=[];
 hull.forEach((q,i)=>{position.push(q.x,q.y,0);edge.push(1);index.push(0,i+1,(i+1)%hull.length+1);});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('edge',new THREE.Float32BufferAttribute(edge,1));g.setIndex(index);return g;
}
const eyeToGlass=new THREE.Vector3(),back=new THREE.Vector3(),out=new THREE.Vector3(),up=new THREE.Vector3(),basis=new THREE.Matrix3(),viewProjection=new THREE.Matrix4();
export class SideMirrors {
 constructor(texture,look=SIDE_MIRRORS){this.texture=texture;this.look=look;this.glasses=[];this.live=false;}
 // The player's car model (its doors shut) in the sprung body `body`, and the driver's eye
 // there (car frame: +X forward, +Y up, -Z the driver's side). glass: the material of the
 // mirrors' glass in the model (one mesh per door or both doors' in one); each side's picture
 // goes in the plane of its own glass, `ahead` in front of it toward the eye. The glasses are
 // flagged "interno", so the rivals cloned from the model drop them; they show only while live.
 attach(model,body,eye,{glass='Espelho',ahead=.0015}={}){
  this.show(false);for(const g of this.glasses)g.mesh.removeFromParent();this.glasses=[];if(!model)return 0;
  model.updateMatrixWorld(true);const inverse=body.matrixWorld.clone().invert(),found=[];
  model.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)&&o.material.name===glass)found.push(o);});
  const v=new THREE.Vector3(),w=new THREE.Vector3();
  for(const o of found){
   // Each door's glass: its own vertices, split by side.
   const toCar=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),pos=o.geometry.attributes.position;
   const turn=new THREE.Matrix3().getNormalMatrix(toCar),normals=o.geometry.attributes.normal;
   for(const side of [-1,1]){const points=[],normal=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(toCar);if(Math.sign(v.z)!==side)continue;points.push(v.clone());if(normals)normal.add(w.fromBufferAttribute(normals,i).applyMatrix3(turn));}
    if(points.length<3)continue;
    // Its plane: the normal toward the eye, x level across it, the outline's half sizes along x and y.
    const c=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).divideScalar(points.length);
    if(normal.lengthSq()<1e-12)normal.subVectors(eye,c);normal.normalize();if(normal.dot(w.subVectors(eye,c))<0)normal.negate();
    const xAxis=new THREE.Vector3(0,1,0).cross(normal).normalize(),yAxis=new THREE.Vector3().crossVectors(normal,xAxis);
    let rx=0,ry=0;for(const p of points){w.subVectors(p,c);rx=Math.max(rx,Math.abs(w.dot(xAxis)));ry=Math.max(ry,Math.abs(w.dot(yAxis)));}
    const flat=points.map(p=>{w.subVectors(p,c);return new THREE.Vector2(w.dot(xAxis)/rx,w.dot(yAxis)/ry);});
    const inCar=new THREE.Matrix4().makeBasis(xAxis,yAxis,normal).setPosition(c.clone().addScaledVector(normal,ahead)).scale(new THREE.Vector3(rx,ry,1));
    const material=new THREE.ShaderMaterial({name:'Espelho_retrovisor_'+(side<0?'esquerdo':'direito'),vertexShader,fragmentShader,toneMapped:false,
     uniforms:{map:{value:this.texture},rearViewProjection:{value:new THREE.Matrix4()},glassNormal:{value:new THREE.Vector3(-1,0,0)},glassCenter:{value:new THREE.Vector3()},centerRay:{value:new THREE.Vector3(-1,0,0)},
      widen:{value:this.look.widen},distance:{value:this.look.distance},reflectance:{value:this.look.reflectance}}});
    const mesh=new THREE.Mesh(outlineGeometry(flat),material);mesh.name=material.name;
    // The glass rides the door: its pose in the door's frame.
    new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(body.matrixWorld).multiply(inCar).decompose(mesh.position,mesh.quaternion,mesh.scale);
    mesh.visible=false;mesh.castShadow=false;mesh.userData.interno=true;o.parent.add(mesh);
    this.glasses.push({mesh,material,side,world:new THREE.Vector3()});
   }
  }
  return this.glasses.length;
 }
 show(live){if(live===this.live)return;this.live=live;for(const g of this.glasses)g.mesh.visible=live;}
 // After the rear camera has drawn this frame's picture: eye is the camera looking at the
 // mirrors (world), body the car's sprung body (its matrixWorld), rear the rear camera.
 update(eye,body,rear){
  if(!this.live)return;
  basis.setFromMatrix4(body.matrixWorld);back.set(-1,0,0).applyMatrix3(basis).normalize();up.set(0,1,0).applyMatrix3(basis).normalize();
  viewProjection.multiplyMatrices(rear.projectionMatrix,rear.matrixWorldInverse);
  for(const g of this.glasses){
   const u=g.material.uniforms;g.mesh.updateWorldMatrix(true,false);g.world.setFromMatrixPosition(g.mesh.matrixWorld);
   out.set(0,0,g.side).applyMatrix3(basis).normalize();
   u.centerRay.value.copy(back).addScaledVector(out,this.look.outward).addScaledVector(up,this.look.down).normalize();
   // The glass turned so the eye sees centerRay in its middle: its normal halves the angle.
   eyeToGlass.subVectors(g.world,eye).normalize();u.glassNormal.value.subVectors(eyeToGlass,u.centerRay.value).normalize();
   u.glassCenter.value.copy(g.world);u.rearViewProjection.value.copy(viewProjection);
  }
 }
 info(){return {count:this.glasses.length,live:this.live,sides:this.glasses.map(g=>g.side),size:this.glasses.map(g=>[g.mesh.scale.x,g.mesh.scale.y]),visible:this.glasses.map(g=>g.mesh.visible),centers:this.glasses.map(g=>g.world.toArray())};}
}
