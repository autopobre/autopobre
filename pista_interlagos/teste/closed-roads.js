import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {TestCar,CLOSURE_HALF} from './physics.js';
import {branchRoadOffset} from './branch-layout.js';
import {pitGeometry,locatePit} from './pit-lane.js';

// The asphalt of an autódromo outside the layout raced on (data.closed_roads, gerar_pista.py montar_fechados): Velocitta's
// original turns 3 and 4 (the loop the Caipirinha replaced, crossing it), its original last corner inside the Ferradura,
// the links of its short circuits and the museum's road. The cars race the competition layout only (the Stock Car's): the
// rest is there, closed as on a race weekend.
// - Its asphalt on the fitted ground (the generator glued the terrain to it; fitGround keeps the lap's planes near the
//   lap), each station across only where it lies off the lap's asphalt and kerbs and off the pit lane's paved band (the
//   oval of Chapecó's pit entry crosses the closed end of the main straight): the seams follow their edges, so the roads
//   never draw over each other. The lap's road material, with an s of its own past the lap's (no braking zone,
//   launch mark or concrete slab of the lap paints on it).
// - Its edge lines and the kerbs inside its tight bends (kerb_left / kerb_right), off the lap's.
// - At each mouth a row of water-filled barriers across it, red and white, where the generator put its line (past the
//   lap's guardrail, or on its own where the lap has none, beside the pit lane): the cars meet the same line
//   (physics.js closureBarrier).
// Draw calls: asphalt, paint, kerbs, barriers.
const LIFT=.04,LINE_LIFT=.046,KERB_W=1.05,KERB_BLOCK=1,BARRIER_LEN=1.1,BARRIER_H=.82;
const KERB_PROFILE=[[0,.02],[.48,.065],[1.05,.02]];

export const hasClosedRoads=data=>(data.closed_roads?.length??0)>0;
// The last scenery built (the checks reach its meshes and numbers through it).
export const closedRoads={current:null};

export function createClosedRoads(data,roadSurface,{textures,ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Trechos_fechados';
 const stats={roads:data.closed_roads?.length??0,mobile},obstacles=[],clearings=[];
 if(!stats.roads)return {root,obstacles,clearings,stats};
 const probe=new TestCar(data),A=data.samples,N=A.length,colors=(data.meta.kerb_colors??['#c8201e','#f1efe8']).map(c=>new THREE.Color(c));
 const gAt=(x,y,z)=>{const g=ground?.(x,y);return Number.isFinite(g)?g:z;};
 // How far (x, y) lies past the lap's asphalt, and past its kerb on that side where it has one, and past the pit lane's
 // paved band (negative on them).
 const pitGeo=pitGeometry(data);
 const lapOut=(x,y)=>{
  const q=probe.nearest(x,y,true),a=A[q.i],b=A[(q.i+1)%N],u=q.u,lx=a[9]+(b[9]-a[9])*u,ly=a[10]+(b[10]-a[10])*u,l=Math.hypot(lx,ly)||1;
  const d=(q.ex*lx+q.ey*ly)/l,w=a[4]+(b[4]-a[4])*u,kerb=(d<0?a[13]||b[13]:a[14]||b[14])?KERB_W:0,lane=pitGeo&&locatePit(pitGeo,x,y);
  return Math.min(Math.abs(d)-w/2-kerb,lane?Math.max(lane.lo-lane.d,lane.d-lane.hi):Infinity);
 };
 const offset=branchRoadOffset(data)+20000,road={pos:[],uv:[],data:[],index:[]},paint={pos:[],index:[]},kerb={pos:[],color:[]},parts=[];
 let asphaltM=0;
 data.closed_roads.forEach((R,k)=>{
  const c=Object.fromEntries(R.columns.map((n,i)=>[n,i])),st=R.samples,n=st.length,own=offset+k*2000,lines=R.kind!=='servico';
  const at=(p,d)=>[p[c.x]+p[c.lx]*d,p[c.y]+p[c.ly]*d];
  // Across each station: the run off the lap (sampled every 25 cm; the longest one where the lap passes through its middle,
  // at the crossing of the original loop with the Caipirinha).
  const strips=st.map(p=>{
   const w=p[c.width],steps=Math.max(2,Math.ceil(w/.25));let best=null,run=null;
   for(let j=0;j<=steps;j++){const d=-w/2+w*j/steps,[x,y]=at(p,d),off=lapOut(x,y)>0;
    if(off){if(!run)run=[d,d];run[1]=d;if(!best||run[1]-run[0]>best[1]-best[0])best=[...run];}else run=null;}
   return best&&best[1]-best[0]>.2?best:null;
  });
  const cols=Math.max(4,Math.ceil(Math.max(...st.map(p=>p[c.width]))/1.6)),first=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){
   const p=st[i],s=strips[i];if(!s)continue;
   // (Stations whose runs lie on opposite sides of the lap are not joined: no quad across it.)
   const prev=strips[i-1],joined=i>0&&prev&&Math.min(prev[1],s[1])-Math.max(prev[0],s[0])>.4;
   first[i]=road.pos.length/3;
   for(let j=0;j<=cols;j++){const d=s[0]+(s[1]-s[0])*j/cols,[x,y]=at(p,d);road.pos.push(x,gAt(x,y,p[c.z])+LIFT,-y);road.uv.push(x/2,-y/2);road.data.push(d,own+p[c.s],p[c.width],0);}
   if(joined){const a=first[i-1],b=first[i];for(let j=0;j<cols;j++)road.index.push(a+j,b+j,a+j+1,a+j+1,b+j,b+j+1);asphaltM+=p[c.s]-st[i-1][c.s];}
  }
  // Edge lines: 14 cm wide, 18 to 32 cm in from each edge, off the lap.
  if(lines)for(const side of [-1,1]){
   let run=[];
   const flush=()=>{if(run.length>1){const b=paint.pos.length/3;for(const [l,r] of run)paint.pos.push(...l,...r);for(let j=0;j+1<run.length;j++){const i=b+j*2;paint.index.push(i,i+1,i+2,i+1,i+3,i+2);}}run=[];};
   for(const p of st){
    const d0=side*(p[c.width]/2-.32),d1=side*(p[c.width]/2-.18),[x0,y0]=at(p,d0),[x1,y1]=at(p,d1);
    if(lapOut(x0,y0)<.3||lapOut(x1,y1)<.3){flush();continue;}
    const v=(x,y)=>[x,gAt(x,y,p[c.z])+LINE_LIFT,-y],L=v(x0,y0),Rr=v(x1,y1);run.push(side>0?[Rr,L]:[L,Rr]);
   }
   flush();
  }
  // Kerbs: KERB_W wide outside the edge on the flagged side, raised on the lap's profile, blocks of KERB_BLOCK metres.
  if(lines)for(const [side,flag] of [[-1,c.kerb_right],[1,c.kerb_left]]){
   for(let i=0;i+1<n;i++){
    const p=st[i],q=st[i+1];if(!(p[flag]&&q[flag]))continue;
    const [mx,my]=at(p,side*(p[c.width]/2+KERB_W/2));if(lapOut(mx,my)<.2)continue;
    const blocks=Math.max(1,Math.round((q[c.s]-p[c.s])/KERB_BLOCK));
    for(let b=0;b<blocks;b++){
     const u0=b/blocks,u1=(b+1)/blocks,color=colors[Math.floor((p[c.s]+(u0+u1)/2*(q[c.s]-p[c.s]))/KERB_BLOCK)%2];
     const point=(u,o)=>{const r=st[i].map((v,j)=>v+(q[j]-v)*u),d=side*(r[c.width]/2+o[0]),[x,y]=at(r,d);return [x,gAt(x,y,r[c.z])+o[1]+.01,-y];};
     for(let e=0;e+1<KERB_PROFILE.length;e++){
      const a0=point(u0,KERB_PROFILE[e]),a1=point(u0,KERB_PROFILE[e+1]),b0=point(u1,KERB_PROFILE[e]),b1=point(u1,KERB_PROFILE[e+1]);
      // Wound so the face looks up on either side.
      const quad=side>0?[a0,b0,a1,a1,b0,b1]:[a0,a1,b0,b0,a1,b1];
      for(const v of quad){kerb.pos.push(...v);kerb.color.push(color.r,color.g,color.b);}
     }
    }
   }
  }
  // The barriers: units of BARRIER_LEN along each line, red and white by turns, each on the ground under its middle.
  for(const [x1,y1,x2,y2,z] of R.barriers.items){
   const len=Math.hypot(x2-x1,y2-y1),count=Math.max(1,Math.round(len/BARRIER_LEN)),ux=(x2-x1)/len,uy=(y2-y1)/len,heading=Math.atan2(uy,ux);
   for(let j=0;j<count;j++){
    const t=(j+.5)/count,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t,g=gAt(x,y,z),color=colors[j%2],unit=len/count-.04;
    // A water-filled block: a wide foot and a narrower top, a notch of a handle between.
    for(const [w,h0,h1,depth] of [[unit,0,.56,CLOSURE_HALF*2],[unit*.9,.56,BARRIER_H,CLOSURE_HALF*1.3]]){
     const box=new THREE.BoxGeometry(w,h1-h0,depth).toNonIndexed();box.rotateY(heading);box.translate(x,g-.04+(h0+h1)/2,-y);
     const tone=color.clone().multiplyScalar(.92+.08*((j*5+k)%3)/2),cl=[];for(let v=0;v<box.attributes.position.count;v++)cl.push(tone.r,tone.g,tone.b);
     box.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));box.deleteAttribute('uv');parts.push(box);
    }
   }
   clearings.push({x:(x1+x2)/2,y:(y1+y2)/2,r:len/2+1});
  }
 });
 if(road.index.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(road.pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(road.uv,2));g.setAttribute('roadData',new THREE.Float32BufferAttribute(road.data,4));g.setIndex(road.index);g.computeVertexNormals();
  // Pulled a little toward the eye: it lies a few centimetres over the ground it was draped on.
  const m=new THREE.Mesh(g,roadSurface.cloneMaterial({polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));m.name='Asfalto_trechos_fechados';m.receiveShadow=true;root.add(m);
  stats.asphaltTriangles=road.index.length/3;stats.asphaltM=Math.round(asphaltM);
 }
 if(paint.index.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(paint.pos,3));g.setIndex(paint.index);g.computeVertexNormals();
  const m=new THREE.Mesh(g,structureMaterial(new THREE.MeshStandardMaterial({name:'Pintura_borda',color:0xe8e4d6,roughness:.7,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),textures));
  m.name='Linhas_trechos_fechados';m.receiveShadow=true;root.add(m);stats.paintTriangles=paint.index.length/3;
 }
 if(kerb.pos.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(kerb.pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(kerb.color,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({name:'Zebras_trechos_fechados',vertexColors:true,roughness:.85,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  m.name='Zebras_trechos_fechados';m.receiveShadow=true;root.add(m);stats.kerbTriangles=kerb.pos.length/9;
 }
 if(parts.length){
  const m=new THREE.Mesh(mergeGeometries(parts,false),new THREE.MeshStandardMaterial({name:'Barreiras_trechos_fechados',vertexColors:true,roughness:.55,metalness:0}));parts.forEach(g=>g.dispose());
  m.name='Barreiras_trechos_fechados';m.castShadow=m.receiveShadow=true;root.add(m);obstacles.push(m);
  stats.barrierUnits=parts.length/2;stats.barriers=data.closed_roads.reduce((t,R)=>t+R.barriers.items.length,0);
 }
 stats.drawCalls=root.children.length;stats.mobile=mobile;
 root.updateMatrixWorld(true);
 const extra={root,obstacles,clearings,stats};closedRoads.current=extra;
 return extra;
}
