import * as THREE from 'three';

// Tree trunks as posts the car can hit. TestCar.step calls collide() after its walls:
// the body's plan (a box round the centre of mass: car.body front, rear and halfWidth, the
// Opala's measured ends by default) meets each trunk's circle, the car is
// pushed out and an impulse at the contact point stops it (a glancing blow on a corner
// spins it). The tree shakes and drops leaves. Physics frame: x, y horizontal, z up.
const CELL=8,FRONT=2.42,REAR=2.35,HALF=.93,BUMPER=-.1,RESTITUTION=.15,FRICTION=.5;
const LEAF=new THREE.Color();

export class TreeField {
 // trees: [{x, y, z, height, width, kind, color, instance:{mesh, index}, nearInstance?}] from the landscape.
 constructor(trees,{mobile=false}={}){
  this.cells=new Map();this.trees=[];this.shaking=[];this.mobile=mobile;
  for(const t of trees){
   // Trunk radius from the tree models (base of a 1 m unit tree, scaled by the crown width).
   const r=Math.min(.5,Math.max(.14,(t.kind==='tall'?.03:.05)*t.width));
   const post={x:t.x,y:t.y,z:t.z??null,r,tree:t,shake:null};this.trees.push(post);
   const key=this.key(Math.floor(t.x/CELL),Math.floor(t.y/CELL));if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(post);
  }
  // Falling leaves: a small pool of points coloured like the crown they come from.
  const n=this.leafCount=mobile?90:240;
  this.leaf={p:new Float32Array(n*3),v:new Float32Array(n*3),age:new Float32Array(n).fill(9),life:new Float32Array(n).fill(1),phase:new Float32Array(n),floor:new Float32Array(n),cursor:0};
  this.geometry=new THREE.BufferGeometry();
  this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
  this.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
  this.geometry.setAttribute('alpha',new THREE.BufferAttribute(new Float32Array(n),1).setUsage(THREE.DynamicDrawUsage));
  this.material=new THREE.ShaderMaterial({name:'Folhas_caindo',transparent:true,depthWrite:false,uniforms:{viewport:{value:900}},
   vertexShader:`attribute vec3 color;attribute float alpha;uniform float viewport;varying vec3 vColor;varying float vAlpha;
    void main(){vec4 p=modelViewMatrix*vec4(position,1.);vColor=color;vAlpha=alpha;gl_Position=projectionMatrix*p;gl_PointSize=clamp(.09*viewport*projectionMatrix[1][1]/max(.3,-p.z),1.,40.);}`,
   fragmentShader:`varying vec3 vColor;varying float vAlpha;
    void main(){vec2 q=gl_PointCoord*2.-1.;q.x*=1.8;if(dot(q,q)>1.||vAlpha<.01)discard;gl_FragColor=vec4(vColor,vAlpha);}`});
  this.points=new THREE.Points(this.geometry,this.material);this.points.name='Folhas_caindo';this.points.frustumCulled=false;
  this.stats={hits:0,lastImpact:0,leaves:0};this.pendingSound=0;
 }
 key(i,j){return i*73856093^j*19349663;}
 near(x,y,reach){
  const out=[],i0=Math.floor((x-reach)/CELL),i1=Math.floor((x+reach)/CELL),j0=Math.floor((y-reach)/CELL),j1=Math.floor((y+reach)/CELL);
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const list=this.cells.get(this.key(i,j));if(list)out.push(...list);}
  return out;
 }
 // Called by TestCar.step: returns the speed the car hit a trunk with (0 if none).
 collide(car){
  const body=car.body??{front:FRONT,rear:REAR,halfWidth:HALF},front=body.front,rear=body.rear,half=body.halfWidth;
  let impact=0;const posts=this.near(car.x,car.y,front+.6);if(!posts.length)return 0;
  const {f,l,u}=car.updateAxes(),c=Math.cos(car.heading),s=Math.sin(car.heading),r=[0,0,0],v=[0,0,0];
  for(const post of posts){
   // Only a trunk the car is down beside (a car falling past the crowns, off a plateau's rim, misses them).
   if(post.z!==null&&Math.abs(car.z-post.z)>3.5)continue;
   const dx=post.x-car.x,dy=post.y-car.y,bx=dx*c+dy*s,by=-dx*s+dy*c;
   const qx=Math.max(-rear,Math.min(front,bx)),qy=Math.max(-half,Math.min(half,by));
   let nx=qx-bx,ny=qy-by,d=Math.hypot(nx,ny),depth;
   if(d>=post.r)continue;
   if(d>1e-6){depth=post.r-d;nx/=d;ny/=d;}
   else{
    // The trunk's centre got inside the body: out through the nearest side.
    const exits=[[front-bx,-1,0],[bx+rear,1,0],[half-by,0,-1],[by+half,0,1]].sort((a,b)=>a[0]-b[0])[0];
    depth=exits[0]+post.r;nx=exits[1];ny=exits[2];
   }
   // Normal in the world, from the trunk toward the car; contact at bumper height.
   const wx=nx*c-ny*s,wy=nx*s+ny*c;
   car.x+=wx*depth;car.y+=wy*depth;
   r[0]=f[0]*qx+l[0]*qy+u[0]*BUMPER;r[1]=f[1]*qx+l[1]*qy+u[1]*BUMPER;r[2]=f[2]*qx+l[2]*qy+u[2]*BUMPER;
   car.pointVelocity(r,v);const vn=v[0]*wx+v[1]*wy;
   if(vn<0){
    const p=-(1+RESTITUTION)*vn/car.inverseMass(r,wx,wy,0);car.impulse(r,wx*p,wy*p,0);
    // Scraping along the bark: friction across the normal, up to what stops the slide.
    let tx=v[0]-vn*wx,ty=v[1]-vn*wy;const slide=Math.hypot(tx,ty);
    if(slide>1e-3){tx/=slide;ty/=slide;const q=Math.min(FRICTION*p,slide/car.inverseMass(r,tx,ty,0));car.impulse(r,-tx*q,-ty*q,0);}
    impact=Math.max(impact,-vn);
    if(-vn>1.2)this.hit(post,-vn,-wx,-wy);
   }
  }
  if(impact)car.surface=car.sample(car.x,car.y);
  return impact;
 }
 // The tree shakes away from the blow and sheds leaves from its crown.
 hit(post,speed,dx,dy){
  this.stats.hits++;this.stats.lastImpact=speed;
  const amount=Math.min(1,speed/14);post.shake={t:0,amount:.05+.2*amount,dir:[dx,dy]};if(!this.shaking.includes(post))this.shaking.push(post);
  const t=post.tree,count=Math.round((this.mobile?10:25)*(.3+amount)),L=this.leaf;
  LEAF.setRGB(...t.color);
  for(let k=0;k<count;k++){
   const i=L.cursor;L.cursor=(L.cursor+1)%this.leafCount;this.stats.leaves++;
   const a=Math.random()*Math.PI*2,rr=Math.sqrt(Math.random())*t.width*.4,h=t.height*(.45+Math.random()*.4);
   L.p.set([t.x+Math.cos(a)*rr,t.y+Math.sin(a)*rr,t.z+h],i*3);L.v.set([(Math.random()-.5)*1.5+dx*speed*.08,(Math.random()-.5)*1.5+dy*speed*.08,Math.random()*1.2],i*3);
   L.age[i]=0;L.life[i]=3+Math.random()*3;L.phase[i]=Math.random()*9;L.floor[i]=t.z+.3;
   // Unlit points: the crown's albedo brightened as the sun would.
   const shade=.55+Math.random()*.7;this.geometry.attributes.color.setXYZ(i,LEAF.r*shade*2.3,LEAF.g*shade*2.1,LEAF.b*shade*1.9);
  }
  this.geometry.attributes.color.needsUpdate=true;
 }
 // Per rendered frame: shaking crowns (instance matrices) and falling leaves.
 update(dt,viewport){
  this.material.uniforms.viewport.value=viewport;if(dt<=0)return;
  const m=new THREE.Matrix4(),tilt=new THREE.Quaternion(),turn=new THREE.Quaternion(),axis=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  for(const post of this.shaking){
   const s=post.shake,t=post.tree;s.t+=dt;
   // A damped sway about the base, away from the car first.
   const angle=s.amount*Math.exp(-s.t*2.2)*Math.sin(s.t*7.5+.3);
   axis.set(-s.dir[1],0,-s.dir[0]).normalize();tilt.setFromAxisAngle(axis,angle);turn.setFromAxisAngle(up,t.turn);
   m.compose(new THREE.Vector3(t.x,t.z,-t.y),tilt.multiply(turn),new THREE.Vector3(t.width,t.height,t.width));
   // The near crown (its own mesh on the full builds) and the distant one sway together.
   for(const {mesh,index} of [t.instance,t.nearInstance].filter(Boolean)){mesh.setMatrixAt(index,m);mesh.instanceMatrix.needsUpdate=true;}
   if(s.t>3)post.shake=null;
  }
  this.shaking=this.shaking.filter(p=>p.shake);
  const L=this.leaf,pos=this.geometry.attributes.position,alpha=this.geometry.attributes.alpha;
  for(let i=0;i<this.leafCount;i++){
   if(L.age[i]>=L.life[i]){alpha.setX(i,0);continue;}
   L.age[i]+=dt;const k=i*3,flutter=Math.sin(L.age[i]*5+L.phase[i]);
   // Leaves fall slowly, drifting from side to side.
   L.v[k]*=Math.exp(-dt*1.5);L.v[k+1]*=Math.exp(-dt*1.5);L.v[k+2]+=(-1.1-L.v[k+2])*Math.min(1,dt*3);
   // On the ground they lie still and fade.
   if(L.p[k+2]>L.floor[i]){L.p[k]+=(L.v[k]+flutter*.6)*dt;L.p[k+1]+=(L.v[k+1]+Math.cos(L.age[i]*4+L.phase[i])*.4)*dt;L.p[k+2]=Math.max(L.floor[i],L.p[k+2]+L.v[k+2]*dt);}
   pos.setXYZ(i,L.p[k],L.p[k+2],-L.p[k+1]);alpha.setX(i,Math.min(1,(L.life[i]-L.age[i])*1.5)*.95);
  }
  pos.needsUpdate=alpha.needsUpdate=true;
 }
 info(){return {trunks:this.trees.length,shaking:this.shaking.length,...this.stats};}
 dispose(){this.geometry.dispose();this.material.dispose();}
}
