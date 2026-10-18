import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance} from './physics.js';
import {locateBranch,branchPoint} from './branch-lane.js';
import {branchLayouts,stationZ,branchRoadOffset,lapLineCuts} from './branch-layout.js';

// What is seen of a branch road (data.branches; Pampulha's: Av. Otacílio Negrão de Lima past the Parque Guanabara, the
// other way round the Igrejinha's square), beside what the lap draws (open-circuit.js) and its walls (street-walls.js
// draws the branch's Jersey blocks and fence with the lap's, branch-layout.js branchWallLines):
// - its asphalt where it is its own (branch-layout.js: cut along the lap's edge, welded to it), the lap's road material
//   (track-surface.js) with the branch's own s past the lap's length (no braking zone of the lap paints on it), pushed
//   back a little like the pit lane's so the lap's surface wins along the seam;
// - its edge lines, and the lap's edge line dashed across the two mouths (open-circuit.js leaves its solid one out);
// - at each nose (where the two roads part and meet: the short walls between them) an impact attenuator, a cluster of
//   water-filled barrels in the vee between the walls, the front one just behind the wall's face; at the split a
//   yellow and black chevron board and a small board with the two ways over it;
// - before the split, where both are still one road, an overhead sign on a gantry: the branch's way over its side of the
//   road, the lap's over the other, each with its arrow. Our own lettering, street and landmark names only.
// Draw calls: asphalt, paint, metal, signs, barrels (five for all the branches of a track). Trees keep off the gantry's
// posts and the noses (clearings).
const SEAM_EASE=24,GANTRY_BEFORE=50,GANTRY_CLEAR=5.6,PANEL_H=2.5,BARREL_R=.43,BARREL_H=.95;
// Each branch's two ways as the signs name them (Pampulha's from the team's idea); others take the branch's name.
const WAYS={avenida:{branch:['AV. OTACÍLIO','PARQUE GUANABARA'],lap:['IGREJINHA','PELA PRAÇA'],short:['PQ. GUANABARA','IGREJINHA']}};
const ATLAS={left:[0,0,1024,320],right:[1024,0,1024,320],chevron:[0,384,1024,256],route:[1024,384,1024,256]};

const v3=(x,y,z)=>new THREE.Vector3(x,z,-y);
function wrapAngle(a){return Math.atan2(Math.sin(a),Math.cos(a));}

function arrow(ctx,x,y,size,angle,color){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();
 const s=size;ctx.moveTo(s*.55,0);ctx.lineTo(s*.05,-s*.42);ctx.lineTo(s*.05,-s*.17);ctx.lineTo(-s*.55,-s*.17);ctx.lineTo(-s*.55,s*.17);ctx.lineTo(s*.05,s*.17);ctx.lineTo(s*.05,s*.42);ctx.closePath();ctx.fill();ctx.restore();
}
function signAtlas(ways,side){
 return canvasTexture((ctx,w,h)=>{
  ctx.clearRect(0,0,w,h);
  const green='#0f6339',white='#f3f3ec';
  // The two gantry panels: the branch's on its side of the road (left for a branch leaving to the left).
  const panel=([x0,y0,pw,ph],[big,small],pointLeft)=>{
   ctx.fillStyle=green;ctx.fillRect(x0,y0,pw,ph);ctx.strokeStyle=white;ctx.lineWidth=9;ctx.strokeRect(x0+16,y0+16,pw-32,ph-32);
   const ax=pointLeft?x0+130:x0+pw-130;arrow(ctx,ax,y0+ph/2,190,pointLeft?-Math.PI*.75:-Math.PI*.25,white);
   ctx.fillStyle=white;ctx.textAlign='center';ctx.textBaseline='middle';const tx=pointLeft?x0+pw/2+95:x0+pw/2-95,tw=pw-300;
   ctx.font='bold 112px sans-serif';ctx.fillText(big,tx,y0+ph*.4,tw);ctx.font='bold 60px sans-serif';ctx.fillText(small,tx,y0+ph*.74,tw);
  };
  panel(side>0?ATLAS.left:ATLAS.right,ways.branch,side>0);panel(side>0?ATLAS.right:ATLAS.left,ways.lap,side<0);
  // Chevron board: yellow, black chevrons parting from the middle (pass either side).
  {const [x0,y0,pw,ph]=ATLAS.chevron;ctx.fillStyle='#f2c200';ctx.fillRect(x0,y0,pw,ph);ctx.strokeStyle='#121212';ctx.lineWidth=44;ctx.lineJoin='miter';
   for(const dir of [-1,1])for(let k=0;k<3;k++){const cx=x0+pw/2+dir*(110+k*130);ctx.beginPath();ctx.moveTo(cx-dir*42,y0+40);ctx.lineTo(cx+dir*42,y0+ph/2);ctx.lineTo(cx-dir*42,y0+ph-40);ctx.stroke();}
   ctx.fillStyle='#121212';ctx.fillRect(x0+pw/2-6,y0+30,12,ph-60);}
  // Route board: the two ways, an arrow each, split by a white rule.
  {const [x0,y0,pw,ph]=ATLAS.route,[a,b]=side>0?ways.short:[ways.short[1],ways.short[0]];ctx.fillStyle=green;ctx.fillRect(x0,y0,pw,ph);ctx.strokeStyle=white;ctx.lineWidth=7;ctx.strokeRect(x0+12,y0+12,pw-24,ph-24);
   ctx.fillRect(x0+pw/2-4,y0+30,8,ph-60);ctx.fillStyle=white;ctx.fillRect(x0+pw/2-4,y0+30,8,ph-60);
   arrow(ctx,x0+80,y0+ph/2,110,Math.PI,white);arrow(ctx,x0+pw-80,y0+ph/2,110,0,white);
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 58px sans-serif';ctx.fillText(a,x0+pw*.25+40,y0+ph/2+3,pw/2-170);ctx.fillText(b,x0+pw*.75-40,y0+ph/2+3,pw/2-170);}
 },2048,1024);
}

// The last scenery built (the checks: verificar_ramal_pampulha.py reaches its meshes through it).
export const branchScenery={current:null};
export function createBranchScenery(data,roadSurface,{textures,ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Ramal_cenario';
 const layouts=branchLayouts(data),stats={branches:layouts.length,mobile},obstacles=[],clearings=[];
 if(!layouts.length)return {root,obstacles,clearings,stats,setNight(){}};
 const gAt=(x,y)=>{const z=ground?.(x,y);return Number.isFinite(z)?z:null;};
 const offset=branchRoadOffset(data),L=data.meta.reconstructed_xy_m,cols=mobile?6:10;
 const road={pos:[],uv:[],data:[],index:[]},paint={pos:[],index:[]},steel=[],faces=[],barrels=[];
 // Lap station at s (interpolated, unit normal).
 const A=data.samples,lapAt=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}
  const p=A[lo],q=A[(lo+1)%A.length],u=Math.min(1,(s-p[0])/((lo===A.length-1?L:q[0])-p[0])),m=k=>p[k]+(q[k]-p[k])*u,nl=Math.hypot(m(9),m(10))||1;
  return {s,x:m(1),y:m(2),z:m(3),w:m(4),bank:m(5),lx:m(9)/nl,ly:m(10)/nl,tx:m(10)/nl,ty:-m(9)/nl};};
 // A ribbon of quads (paint) from a list of [left point, right point] pairs, each [x, y, z] in track coordinates.
 const ribbon=pairs=>{if(pairs.length<2)return;const b=paint.pos.length/3;for(const [l,r] of pairs)paint.pos.push(l[0],l[2],-l[1],r[0],r[2],-r[1]);for(let k=0;k+1<pairs.length;k++){const i=b+k*2;paint.index.push(i,i+1,i+2,i+1,i+3,i+2);}};
 for(const B of layouts){
  const st=B.stations,n=st.length,side=B.geo.side;
  // --- Asphalt: cols+1 vertices across each station's strip; quads between stations that both have one.
  const bendAt=i=>{const a=st[Math.max(0,i-18)],b=st[Math.min(n-1,i+18)];return wrapAngle(Math.atan2(b.ty,b.tx)-Math.atan2(a.ty,a.tx));};
  // The rubbered line (the shader's path, across from the centre): along the seam the lap's own line (as track-surface.js
  // geometry() puts it), carried into the branch's frame, so the two roads' rubber meets across the seam instead of
  // breaking along it; easing into the branch's own over SEAM_EASE metres either side of the stretch beside the lap.
  const lapPath=s=>{const k=A.findIndex(q=>q[0]>=s),i=k<0?0:k,a=A[(i-18+A.length)%A.length],b=A[(i+18)%A.length],q=lapAt(s);return Math.max(-1,Math.min(1,wrapAngle(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7]))*1.2))*q.w*.18;};
  const seams=st.filter(p=>p.seam).map(p=>p.s),pathAt=i=>{
   const p=st[i],own=Math.max(-1,Math.min(1,bendAt(i)*1.2))*p.w*.18;if(!seams.length)return own;
   const gap=Math.min(...seams.map(s=>Math.abs(s-p.s))),k=1-Math.min(1,gap/SEAM_EASE);if(k<=0)return own;
   const l=B.lap(p.x,p.y),q=lapAt(l.s),off=lapPath(l.s),px=q.x+q.lx*off,py=q.y+q.ly*off,there=(px-p.x)*p.lx+(py-p.y)*p.ly;
   return own+(there-own)*k*k*(3-2*k);
  };
  const first=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){
   const p=st[i];if(!p.strip)continue;first[i]=road.pos.length/3;
   const path=pathAt(i);
   for(let k=0;k<=cols;k++){
    const d=p.strip[0]+(p.strip[1]-p.strip[0])*k/cols,x=p.x+p.lx*d,y=p.y+p.ly*d,z=stationZ(p,d)+.035;
    road.pos.push(x,z,-y);road.uv.push(x/2,-y/2);road.data.push(d,offset+p.s,p.w,path);
   }
   if(i&&first[i-1]>=0){const a=first[i-1],b=first[i];for(let k=0;k<cols;k++)road.index.push(a+k,b+k,a+k+1,a+k+1,b+k,b+k+1);}
  }
  // --- Edge lines: each 14 cm wide, 18-32 cm in from the asphalt's edge, where that edge is the branch's own.
  for(const [k,gap] of [[side,'outerGap'],[-side,'innerGap']]){
   let run=[];
   const flush=()=>{ribbon(run);run=[];};
   for(const p of st){
    const inside=p.strip&&p[gap]>.4;if(!inside){flush();continue;}
    const d0=k*(p.w/2-.32),d1=k*(p.w/2-.18),at=d=>[p.x+p.lx*d,p.y+p.ly*d,stationZ(p,d)+.041];
    run.push(k>0?[at(d1),at(d0)]:[at(d0),at(d1)]);
   }
   flush();
  }
 }
 // The lap's edge line across the mouths: 3 m dashes, 3 m apart.
 for(const cut of lapLineCuts(data)){
  for(let s0=cut.from;s0<cut.to;s0+=6){
   const pairs=[];for(let s=s0;s<=Math.min(s0+3,cut.to)+1e-6;s+=.5){const p=lapAt(s),at=d=>[p.x+p.lx*d,p.y+p.ly*d,p.z+p.bank*d+.041],d0=cut.side*(p.w/2-.32),d1=cut.side*(p.w/2-.18);pairs.push(cut.side>0?[at(d1),at(d0)]:[at(d0),at(d1)]);}
   ribbon(pairs);
  }
 }
 // --- Signs and attenuators.
 const box=(c,ex,ey,hx,hy,hz,list=steel)=>{
  // A box centred on c (track coordinates), its length along ex (horizontal unit, track), height up, depth along ey.
  const X=v3(ex[0],ex[1],0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3().crossVectors(X,Y),m=new THREE.Matrix4().makeBasis(X,Y,Z).setPosition(v3(...c));
  const g=new THREE.BoxGeometry(hx*2,hy*2,hz*2);g.applyMatrix4(m);list.push(g);
 };
 const post=(x,y,z0,z1,r=.05)=>{const g=new THREE.CylinderGeometry(r,r*1.1,z1-z0,8);g.translate(x,(z0+z1)/2,-y);steel.push(g);};
 // A sign face: the atlas rectangle `key` on a w x h plane centred on c, read by someone looking along `look` (track).
 const face=(key,c,look,w,h)=>{
  const [x0,y0,pw,ph]=ATLAS[key],g=new THREE.PlaneGeometry(w,h),uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,(x0+uv.getX(i)*pw)/2048,1-(y0+(1-uv.getY(i))*ph)/1024);
  const right=v3(look[1],-look[0],0).normalize(),up=new THREE.Vector3(0,1,0),out=new THREE.Vector3().crossVectors(right,up);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(right,up,out).setPosition(v3(...c)));faces.push(g);
 };
 let gantries=0,noses=0;const signWays=[];
 for(const B of layouts){
  const geo=B.geo,side=geo.side,ways=WAYS[geo.id]??{branch:(geo.name??geo.label??'').toUpperCase().split(' · ').slice(0,2),lap:['CIRCUITO',''],short:[(geo.label??'').toUpperCase(),'CIRCUITO']};
  while(ways.branch.length<2)ways.branch.push('');signWays.push(ways);
  // The gantry, GANTRY_BEFORE metres before the branch leaves the lap: posts behind the walls, the beam over the road,
  // the two panels hung on its front, facing the cars.
  {
   const p=lapAt(geo.entryMainS-GANTRY_BEFORE),t=[p.tx,p.ty],n=[p.lx,p.ly],zc=p.z,beamZ=zc+GANTRY_CLEAR+PANEL_H/2,ends=[];
   for(const sd of [-1,1]){
    const d=sd*(p.w/2+guardrailClearance(data,p.s,sd)+.75+.55),x=p.x+n[0]*d,y=p.y+n[1]*d,g=gAt(x,y)??zc;
    box([x,y,(g-.4+beamZ+.45)/2],t,n,.2,(beamZ+.45-g+.4)/2,.2);ends.push({x,y,d});
    box([x,y,g+.05],t,n,.45,.15,.45);clearings.push({x,y,r:3});
   }
   const span=Math.abs(ends[1].d-ends[0].d),mid=(ends[0].d+ends[1].d)/2,bx=p.x+n[0]*mid,by=p.y+n[1]*mid;
   // Beam: a box girder and its lower chord behind the panels (downstream of them: the cars see the panels' faces).
   box([bx+t[0]*.3,by+t[1]*.3,beamZ+.25],n,t,span/2+.2,.3,.22);box([bx+t[0]*.3,by+t[1]*.3,beamZ-.75],n,t,span/2+.2,.12,.12);
   for(const sd of [-1,1]){const d=sd*p.w/4;box([p.x+n[0]*d+t[0]*.12,p.y+n[1]*d+t[1]*.12,beamZ-.25],t,n,.1,1.1,.06);}
   const pw=Math.min(8,p.w/2-.6),ph=PANEL_H;
   for(const sd of [-1,1]){
    const d=sd*p.w/4,cx=p.x+n[0]*d-t[0]*.06,cy=p.y+n[1]*d-t[1]*.06;
    // The panel's back plate, then its face just in front (toward the cars).
    box([cx-t[0]*.05,cy-t[1]*.05,beamZ-.25],n,t,pw/2,ph/2,.04);
    face(sd===side?(side>0?'left':'right'):(side>0?'right':'left'),[cx-t[0]*.1,cy-t[1]*.1,beamZ-.25],t,pw,ph);
   }
   gantries++;stats.gantry={s:+p.s.toFixed(1),x:+bx.toFixed(1),y:+by.toFixed(1),z:+(beamZ-.25).toFixed(2),span:+span.toFixed(1)};
  }
  // The noses: the branch's walls of side 0 (the short ones between the two roads).
  const keepOut=(x,y,tol=.06)=>{
   const l=B.lap(x,y);if(Math.abs(l.d)<l.width/2+l.wall-tol)return true;
   const h=locateBranch(geo,x,y);return !!h&&Math.abs(h.d)<h.width/2+(h.d>=0?h.wallLeft:h.wallRight)-tol;
  };
  const rails=geo.rails['-1']?.[0]??[0,geo.length];
  for(const wall of (geo.block.walls??[]).filter(w=>!w.side)){
   const [P1,P2]=[wall.points[0],wall.points.at(-1)],M=[(P1[0]+P2[0])/2,(P1[1]+P2[1])/2],ex=[P2[0]-P1[0],P2[1]-P1[1]],el=Math.hypot(...ex)||1,E=[ex[0]/el,ex[1]/el];
   const near=s=>{const q=branchPoint(geo,s);return Math.hypot(q.x-M[0],q.y-M[1]);},split=near(rails[0])<near(rails[1]);
   // V: into the vee between the two walls, the middle of the widest arc round the nose clear of both roads 2 m out
   // (across the nose at the split; at Pampulha's merge the two walls end two metres apart along the way, so the vee
   // opens back past the branch wall's end); R the other way, toward the cars; E2 across it.
   let V=[-E[1],E[0]];
   {const N=48,free=[];for(let k=0;k<N;k++){const a=k/N*Math.PI*2;free.push(!keepOut(M[0]+Math.cos(a)*2,M[1]+Math.sin(a)*2));}
    let run=0,best=0,end=-1;for(let k=0;k<N*2;k++){if(free[k%N]){run++;if(run>best&&run<N){best=run;end=k;}}else run=0;}
    if(best){const a=(end-(best-1)/2)/N*Math.PI*2;V=[Math.cos(a),Math.sin(a)];}}
   const R=[-V[0],-V[1]],E2=[-V[1],V[0]],at=(back,lat)=>[M[0]+V[0]*back+E2[0]*lat,M[1]+V[1]*back+E2[1]*lat];
   // A barrel stands clear of both roads' wall faces and, where the nose faces the cars (across the way), no further out
   // than the nose wall's own face (its centre line + 0.3 m: the half thickness branch-lane.js gives it).
   let Nn=[-E[1],E[0]];if(Nn[0]*V[0]+Nn[1]*V[1]<0)Nn=[-Nn[0],-Nn[1]];const facing=Nn[0]*V[0]+Nn[1]*V[1]>.5;
   const ok=(x,y)=>!keepOut(x,y)&&(!facing||(x-M[0])*Nn[0]+(y-M[1])*Nn[1]>=-.3);
   const clear=(back,lat,r)=>{const c=at(back,lat);if(!ok(c[0],c[1]))return false;for(let k=0;k<8;k++){const a=k*Math.PI/4;if(!ok(c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r))return false;}return true;};
   // Rows of barrels into the vee from the nearest spot one fits, each row a barrel wider, kept wherever clear.
   let b0=null;for(let b=-.4;b<3;b+=.05)if(clear(b,0,BARREL_R)){b0=b;break;}
   const kept=[];
   if(b0!==null)for(let row=0;row<4;row++)for(let j=0;j<=row;j++){
    const back=b0+row*BARREL_R*1.8,lat=(j-row/2)*(BARREL_R*2+.04);
    if(clear(back,lat,BARREL_R))kept.push(at(back,lat));
   }
   for(const [x,y] of kept){const g=gAt(x,y)??(P1[2]+P2[2])/2;barrels.push([x,y,g]);clearings.push({x,y,r:1.4});}
   // At the split: the chevron board and the ways over it, on two posts, as far back as they fit.
   if(split){
    for(let back=.75;back<4;back+=.25){
     // (Its posts just outside the barrels of the row below, the boards over them.)
     if(![-1.15,1.15].every(l=>clear(back,l,.08)))continue;
     const [cx,cy]=at(back,0),g=gAt(cx,cy)??P1[2],look=V;
     for(const l of [-.97,.97]){const [px,py]=at(back+.05,l);post(px,py,g-.3,g+2.45,.045);}
     face('chevron',[cx,cy,g+1.42],look,1.9,.475);face('route',[cx+R[0]*.02,cy+R[1]*.02,g+2.1],look,2.2,.55);
     box([cx+V[0]*.02,cy+V[1]*.02,g+1.42],E2,V,.97,.25,.012);box([cx+V[0]*.02,cy+V[1]*.02,g+2.1],E2,V,1.12,.29,.012);
     stats.chevron={x:+cx.toFixed(1),y:+cy.toFixed(1),back};break;
    }
   }
   noses++;(stats.noses??=[]).push({name:wall.name,barrels:kept.length,span:+el.toFixed(2)});
  }
 }
 // --- Meshes.
 let drawCalls=0;
 if(road.index.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(road.pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(road.uv,2));g.setAttribute('roadData',new THREE.Float32BufferAttribute(road.data,4));g.setIndex(road.index);g.computeVertexNormals();
  const m=new THREE.Mesh(g,roadSurface.cloneMaterial({polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));m.name='Asfalto_ramal';m.receiveShadow=true;root.add(m);drawCalls++;stats.asphaltTriangles=road.index.length/3;
 }
 if(paint.index.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(paint.pos,3));g.setIndex(paint.index);g.computeVertexNormals();
  const material=structureMaterial(new THREE.MeshStandardMaterial({name:'Pintura_borda',color:0xe8e4d6,roughness:.7,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),textures);
  const m=new THREE.Mesh(g,material);m.name='Linhas_ramal';m.receiveShadow=true;root.add(m);drawCalls++;stats.paintTriangles=paint.index.length/3;
 }
 if(steel.length){
  const g=mergeGeometries(steel.map(x=>x.index?x.toNonIndexed():x),false);steel.forEach(x=>x.dispose());
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({name:'Portico_ramal_metal',color:0x8e969b,metalness:.6,roughness:.45}));m.name='Portico_ramal';m.castShadow=m.receiveShadow=true;root.add(m);obstacles.push(m);drawCalls++;
 }
 let signMaterial=null;
 if(faces.length){
  const map=signAtlas(signWays[0],layouts[0].geo.side);
  signMaterial=new THREE.MeshStandardMaterial({name:'Placas_ramal',map,roughness:.55,emissive:0xffffff,emissiveMap:map,emissiveIntensity:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const m=new THREE.Mesh(mergeGeometries(faces,false),signMaterial);faces.forEach(x=>x.dispose());m.name='Placas_ramal';m.receiveShadow=true;root.add(m);drawCalls++;
 }
 if(barrels.length){
  // Water-filled barrels: yellow body, a white reflective band, black lid and foot.
  const seg=mobile?10:16,parts=[],yellow=new THREE.Color(0xf0bd12),black=new THREE.Color(0x1a1a1a),white=new THREE.Color(0xe9e9e2);
  const piece=(r0,r1,h0,h1,color,x,y,z)=>{const g=new THREE.CylinderGeometry(r1,r0,h1-h0,seg,1,false);g.translate(x,z+(h0+h1)/2,-y);const c=[];for(let i=0;i<g.attributes.position.count;i++)c.push(color.r,color.g,color.b);g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));parts.push(g);};
  barrels.forEach(([x,y,z],i)=>{const tone=yellow.clone().multiplyScalar(.9+.1*((i*7)%5)/4),r=BARREL_R;
   piece(r*.96,r*.96,-.15,.06,black,x,y,z);piece(r,r,.06,BARREL_H*.55,tone,x,y,z);piece(r,r,BARREL_H*.55,BARREL_H*.68,white,x,y,z);piece(r,r*.94,BARREL_H*.68,BARREL_H,tone,x,y,z);piece(r*.94,r*.7,BARREL_H,BARREL_H+.07,black,x,y,z);});
  const m=new THREE.Mesh(mergeGeometries(parts,false),new THREE.MeshStandardMaterial({name:'Barris_ramal',vertexColors:true,roughness:.5,metalness:0}));parts.forEach(x=>x.dispose());
  m.name='Barris_ramal';m.castShadow=m.receiveShadow=true;root.add(m);obstacles.push(m);drawCalls++;
 }
 Object.assign(stats,{drawCalls,gantries,noseCount:noses,barrels:barrels.length,signs:faces.length});
 root.updateMatrixWorld(true);
 // After dark the panels catch the headlights (retroreflective sheeting): a little of their own light.
 function setNight(level){if(signMaterial)signMaterial.emissiveIntensity=.04+.3*level;stats.night=level;}
 setNight(0);
 const extra={root,obstacles,clearings,stats,setNight};branchScenery.current=extra;
 return extra;
}
