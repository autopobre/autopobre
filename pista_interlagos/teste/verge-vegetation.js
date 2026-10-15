import * as THREE from 'three';

// Small, opaque grass blades add parallax at driving height. Only the high scenery
// levels build them: shared geometry, one draw per visible 48 m block, no shadow
// casting or texture/alpha overdraw. All placement uses the same road/water field.
const BLOCK=48;
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function patchNoise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}

// bladeRoot: each blade's root (x, z) and its number, for TUFT_SHAPE.
function tuftGeometry(){
 const rand=random(8841),positions=[],normals=[],colors=[],roots=[],indices=[];
 for(let i=0;i<7;i++){
  const a=rand()*Math.PI*2,c=Math.cos(a),s=Math.sin(a),x=(rand()-.5)*.8,z=(rand()-.5)*.8;
  const width=.025+rand()*.02,height=.5+rand()*.5,lean=.12+rand()*.16,base=positions.length/3;
  for(const [side,y,bend] of [[-1,0,0],[1,0,0],[-.55,.55,.3],[.55,.55,.3],[0,1,1]]){
   positions.push(x+c*side*width-s*lean*bend,height*y,z+s*side*width+c*lean*bend);
   normals.push(c*.3,.954,s*.3);
   // Dark roots and fresh tips; the overall tint is per instance in linear space.
   const brightness=.42+y*.58;colors.push(brightness,brightness,brightness*.92);roots.push(x,z,i);
  }
  indices.push(base,base+1,base+2,base+1,base+3,base+2,base+2,base+3,base+4);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('bladeRoot',new THREE.Float32BufferAttribute(roots,3));
 geometry.setIndex(indices);geometry.computeBoundingSphere();
 return geometry;
}
// The tuft's own kind and every blade its own length and lean, from the hash of the tuft's place (no two alike, one
// geometry): a fresh clump; a few tall seeding stalks over short grass; a dry tuft bent over, straw at the tips; a
// sparse low one with blades missing. Ahead of the breeze and the cars' wake, which then move the reshaped blades.
const TUFT_SHAPE=`
#ifdef USE_INSTANCING
{
 float tuft=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453),blade=fract(sin(tuft*91.7+bladeRoot.z*7.31)*43758.5453);
 float kind=fract(tuft*7.77),tall=1.0,spread=1.0,straw=0.0;
 if(kind<.36){tall=.7+.45*blade;}
 else if(kind<.6){tall=blade<.35?1.55+.5*fract(blade*17.0):.45+.2*blade;spread=blade<.35?.6:1.2;}
 else if(kind<.8){tall=.55+.4*blade;spread=1.5;straw=.55+.35*blade;}
 else{tall=.5+.35*blade;spread=1.3;}
 // The sparse kind leaves out about half its blades (folded to nothing at the root).
 float kept=kind<.8||blade>.45?1.0:0.0;
 vec2 bladeAt=bladeRoot.xy;
 transformed.xz=bladeAt+(transformed.xz-bladeAt)*mix(1.0,spread,position.y)*kept;
 transformed.y*=tall*kept;
 vColor.rgb=mix(vColor.rgb,vec3(1.75,1.35,.78)*vColor.g,straw*smoothstep(.15,.9,position.y));
}
#endif`;

// Cars passing close (speed-particles.js wakeCars, 'Sensação de velocidade' Completa): world x, z
// and velocity x, z of up to WAKE_CARS of them.
export const WAKE_CARS=6;
function grassMaterial(time,reach){
 const material=new THREE.MeshStandardMaterial({name:'Capim_margens',roughness:.94,metalness:0,vertexColors:true,side:THREE.DoubleSide});
 const wake={vergeCars:{value:Array.from({length:WAKE_CARS},()=>new THREE.Vector4())},vergeCarCount:{value:0}};material.userData.wake=wake;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{vergeTime:time,vergeReach:{value:reach}},wake);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float vergeTime,vergeReach;uniform vec4 vergeCars[${WAKE_CARS}];uniform int vergeCarCount;`).replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
 vec3 root=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
 float distanceFade=1.0-smoothstep(vergeReach*.6,vergeReach,length(root-cameraPosition));
 // The breeze travels through the verge instead of all blades moving together.
 float gust=sin(root.x*.13+root.z*.17-vergeTime*1.7)*.045+sin(root.x*.7-root.z*.3+vergeTime*3.1)*.016;
 transformed.x+=gust*position.y*position.y;
 transformed.z+=gust*.6*position.y*position.y;
 // A passing car's air: blades lean away from it and along its way, strongest beside it and
 // trailing behind for about half a second, and shiver while they are pushed.
 vec2 wake=vec2(0.0);float shiver=0.0;
 for(int i=0;i<${WAKE_CARS};i++){
  if(i>=vergeCarCount)break;
  vec4 car=vergeCars[i];float speed=length(car.zw);vec2 dir=car.zw/max(speed,.001),rel=root.xz-car.xy;
  float trail=speed*.55+.001,behind=clamp(-dot(rel,dir)/trail,0.0,1.0);vec2 off=rel+dir*behind*trail;float gap=length(off);
  float push=smoothstep(3.0,32.0,speed)*exp(-gap*gap/48.0)*(1.0-behind*.7);
  wake+=(off/max(gap,.3)*.75+dir*.55)*push;shiver+=push;
 }
 float pushed=min(length(wake),1.1);
 if(pushed>.001){
  // World lean of the tip, up to about 40 degrees, taken into the tuft's turned and scaled frame.
  float tall=length(instanceMatrix[1].xyz),wide=length(instanceMatrix[0].xyz);
  vec3 lean=vec3(normalize(wake)*pushed*(.85+.15*sin(vergeTime*23.0+root.x*1.7+root.z*2.3+position.x*9.0)),0.0).xzy*tall;
  lean+=vec3(-lean.z,0.0,lean.x)*sin(vergeTime*31.0+root.x*3.1+position.z*7.0)*min(shiver,1.0)*.5;
  vec3 local=transpose(mat3(instanceMatrix))*lean/(wide*wide);
  transformed.xz+=local.xz*position.y*position.y;
  transformed.y-=pushed*.3*position.y*position.y;
 }
 transformed.y*=distanceFade;
#endif`);
  // Each tuft's shape (TUFT_SHAPE) goes in ahead of the breeze and the wake above.
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 bladeRoot;').replace('#include <begin_vertex>','#include <begin_vertex>'+TUFT_SHAPE);
  // Three expands shader chunks after onBeforeCompile. Undo the back-face flip
  // after the include, so both sides keep these blades' upward shading normals.
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
#if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)
 normal*=faceDirection;
 nonPerturbedNormal=normal;
#endif`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
 float grassBack=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),4.0);
 reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*grassBack*.12;
#endif`);
 };
 material.customProgramCacheKey=()=>'verge-blades-v3';return material;
}

// coverClass follows the circuit's WorldCover mapping: 4 built, 5 bare, 6 water.
export function createVergeVegetation({data,field,ground,vegetated=()=>true,dry=()=>true,density=1,lod=130,time={value:0}}){
 const root=new THREE.Group();root.name='Vegetacao_das_margens';
 const reach=Math.min(145,Math.max(75,lod*.66)),geometry=tuftGeometry(),material=grassMaterial(time,reach);
 const rand=random(499979+data.samples.length),items=[],occupied=new Set(),groups=new Map();
 const spacing=2.15/Math.sqrt(Math.max(.1,density));let next=data.samples[0]?.[0]??0;
 // Where a tuft may grow: a vegetated, dry verge cell 3-23 m from the roads, garages and stands (field.edge).
 const grows=(x,y)=>{const cell=field.cell(x,y);return cell>=0&&field.edge[cell]>=3&&field.edge[cell]<=23&&!field.water[cell]&&dry(x,y,2)&&vegetated(x,y);};
 for(const p of data.samples){
  if(p[0]<next)continue;next+=Math.max(1,Math.floor((p[0]-next)/spacing)+1)*spacing;
  for(const side of [-1,1])for(let offset=3.8;offset<17;offset+=spacing){
   const across=side*(p[4]/2+offset+(rand()-.5)*spacing),along=(rand()-.5)*spacing;
   const x=p[1]+p[9]*across+p[7]*along,y=p[2]+p[10]*across+p[8]*along;
   if(!grows(x,y))continue;
   // Patches from a slow noise (about 20 m across, broken at 6 m): most of the verge thin or bare, here and there a
   // dense bunch, where the spot grows a clump of two to five tufts round it. No even sprinkle of identical dots.
   const dense=smooth(.4,.78,patchNoise(x/21+.37,y/21-1.9)*.75+patchNoise(x/6.3,y/6.3+4.1)*.25);
   if(rand()>.13+.87*dense)continue;
   const key=Math.floor(x/1.35)+':'+Math.floor(y/1.35);if(occupied.has(key))continue;occupied.add(key);
   const clump=1+(dense>.45?Math.floor(rand()*(1+3.6*dense)):0);
   for(let k=0;k<clump;k++){
    const r=k?.3+rand()*.6:0,a=rand()*Math.PI*2,tx=x+Math.cos(a)*r,ty=y+Math.sin(a)*r;
    if(k&&!grows(tx,ty))continue;
    const z=ground(tx,ty);if(!Number.isFinite(z))continue;
    const slope=Math.hypot(ground(tx+1,ty)-ground(tx-1,ty),ground(tx,ty+1)-ground(tx,ty-1))/2;
    if(!Number.isFinite(slope)||slope>.65)continue;
    // Half to 1.6 times the size, as tall and as wide each on its own (bigger in the lush bunches); a green tuft, a
    // greyer one or one gone to straw.
    const dryness=rand(),straw=rand()<.22?.5+.5*rand():0,size=(.5+1.1*Math.pow(rand(),1.3))*(.85+.3*dense);
    const height=(.14+Math.min(1,offset/17)*.24)*size,green=[.105+dryness*.05,.19+dryness*.025,.04+dryness*.02];
    const item={x:tx,y:ty,z:z-.035,height,width:(.95+.8*rand())*(.75+.5*size),turn:rand()*Math.PI*2,color:green.map((c,i)=>c+([.2,.17,.075][i]-c)*straw)};
    items.push(item);const block=Math.floor(tx/BLOCK)+':'+Math.floor(ty/BLOCK);if(!groups.has(block))groups.set(block,[]);groups.get(block).push(item);
   }
  }
 }
 const matrix=new THREE.Matrix4(),color=new THREE.Color(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),pos=new THREE.Vector3(),scale=new THREE.Vector3(),blocks=[];
 for(const list of groups.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name='Capim_bloco';mesh.receiveShadow=true;
  list.forEach((item,index)=>{
   matrix.compose(pos.set(item.x,item.z,-item.y),q.setFromAxisAngle(up,item.turn),scale.set(item.width,item.height,item.width));
   mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,color.setRGB(...item.color));item.mesh=mesh;item.index=index;
  });
  mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.4;root.add(mesh);
  blocks.push({mesh,center:mesh.boundingSphere.center.clone(),radius:mesh.boundingSphere.radius});
 }
 return {root,count:items.length,reach,update(camera){
  for(const block of blocks)block.mesh.visible=camera.position.distanceToSquared(block.center)<(reach+block.radius)**2;
 },
 // The cars that push the grass this frame (TestCars, nearest first; [] lets it be).
 setCars(cars){
  const {vergeCars,vergeCarCount}=material.userData.wake,n=Math.min(WAKE_CARS,cars.length);
  for(let i=0;i<n;i++){const c=cars[i];vergeCars.value[i].set(c.x,-c.y,c.vx,-c.vy);}
  vergeCarCount.value=n;
 },
 wakeInfo:()=>({cars:material.userData.wake.vergeCarCount.value}),clearAround(points){
  const changed=new Set(),zero=new THREE.Matrix4().makeScale(0,0,0);
  for(const item of items){if(item.removed||!points.some(p=>Math.hypot(item.x-p.x,item.y-p.y)<p.r+.65))continue;item.removed=true;item.mesh.setMatrixAt(item.index,zero);changed.add(item.mesh);}
  for(const mesh of changed)mesh.instanceMatrix.needsUpdate=true;
 },dispose(){geometry.dispose();material.dispose();for(const block of blocks)block.mesh.dispose();}};
}
