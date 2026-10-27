import {clamp,wrap,guardrailClearance} from './physics.js';
import {pitGeometry,locatePit} from './pit-lane.js';

// The verges of a circuit made regular (user, 2026-10-26: the guardrails rose and fell with every hump of the terrain, "como
// se eles estivessem corretos em um chão regular", and some bends had a notch in the asphalt's edge, "curvas irregulares que
// parece que foram feitas erradas"). Run once on the track data as it loads (main.js), before anything reads it: the
// physics, the drawn ground and everything set on it then meet the same verges.
// - The lap's plan (smoothPlan), on the circuits in PLAN (Interlagos, 2026-10-27: in its light bends "a borda da curva está
//   toda irregular!! Um zigue-zague praticamente"). The painted lines it was traced from on the 20 cm orthophoto
//   (refinar_tracado.py) left the centre line's curvature swinging every 15 to 20 m and the width wobbling by centimetres:
//   in perspective, a zigzag along both edges. The curvature is smoothed along the lap (less in a tight bend: a hairpin
//   keeps its shape) and the centre line moved sideways to it, the width smoothed too; each edge moves a few centimetres,
//   0.45 m at most, onto the painted line the photo shows, and beside a pit lane's paved band it stays where surveyed. Its
//   asphalt is drawn from the samples then (open-circuit.js lapRoad; Interlagos' baked GLB ribbon retired, main.js).
// - The ground beside the lap (smoothGround): the terrain grid from under the asphalt out past the barrier's line, smoothed
//   along the lap. Each node takes the Gaussian mean (VERGE_SIGMA) of the survey at its own offset from the centre line up
//   and down the lap, so a bank or a ditch beside the road runs on as one and the bumps of the grid (a LiDAR return off a
//   bush, the 30 m ANADEM's steps) go: the rails stand on it (street-walls.js barrierLines), and so do the cars that run
//   wide. Not on a street circuit (its walls stand on the city's own flattened sidewalks, gerar_pista.aplainar_ruas),
//   nor round the pit lane and its garages, a closed road's asphalt (Velocitta) or a plateau's rim (Chapada): those keep
//   the survey.
// - The kerbs (fillKerbs): a hole in a run of kerb filled (2026-10-27: "a zebra começa e depois termina com um buraco no
//   meio, principalmente em curvas!! Faz a zebra toda nas curvas quando tiver buraco").
// - The lap's width (smoothWidth), on the circuits built from open data (not Interlagos, whose plan is smoothed whole; not
//   a city's streets): a width that changes faster than WIDTH_SLOPE is eased, only ever narrower (the generator's caps
//   against a hairpin's fold or a neighbouring stretch hold). Piracicaba's Junção went from 13.6 to 15.7 m in 4 m: a notch.
const done=new WeakMap();
export function smoothVerges(data){
 if(!done.has(data)){const plan=smoothPlan(data);done.set(data,{plan,width:smoothWidth(data),ground:smoothGround(data),kerbs:fillKerbs(data)});}
 return done.get(data);
}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

// Plan: the curvature's Gaussian mean along the lap over PLAN_SIGMA metres, divided by 1 + (b/PLAN_TIGHT)² where the bend
// b (|curvature| over PLAN_BEND metres) is tight; the width's over PLAN_WIDTH. The centre line's move e (along its left
// normal) gives a curvature of about c + e'' + c²·e: brought to the smoothed one by least squares, with PLAN_STIFF·e²
// against drifting off (its long waves stay as surveyed). An edge that comes within PLAN_PIT_GAP metres of a pit lane's
// paved band stays put, its change fading in over PLAN_PIT_FADE metres of lap. A circuit joins PLAN once its edges are
// checked against its own photo.
export const PLAN=new Set(['interlagos']);
export const PLAN_SIGMA=8,PLAN_TIGHT=.03,PLAN_BEND=10,PLAN_WIDTH=6,PLAN_STIFF=1e-4,PLAN_PIT_GAP=3,PLAN_PIT_FADE=25;
function smoothPlan(data){
 if(!PLAN.has(data.meta.id))return null;
 const A=data.samples,n=A.length,L=data.meta.reconstructed_xy_m,apart=(i,j)=>{const d=A[j][0]-A[i][0];return d-Math.round(d/L)*L;};
 const lapMean=(v,sigma)=>v.map((_,i)=>{
  const sg=typeof sigma==='function'?sigma(i):sigma;let sum=v[i],weight=1;
  for(const dir of [-1,1])for(let k=1;k<n;k++){const j=((i+dir*k)%n+n)%n,d=apart(i,j);if(Math.abs(d)>3*sg)break;const g=Math.exp(-d*d/(2*sg*sg));sum+=g*v[j];weight+=g;}
  return sum/weight;
 });
 const ds=A.map((p,i)=>{const q=A[(i+1)%n];return Math.hypot(q[1]-p[1],q[2]-p[2])||1e-3;});
 const curve=A.map((p,i)=>{const a=A[(i-1+n)%n],b=A[(i+1)%n],ax=p[1]-a[1],ay=p[2]-a[2],bx=b[1]-p[1],by=b[2]-p[2];return 2*Math.atan2(ax*by-ay*bx,ax*bx+ay*by)/(ds[(i-1+n)%n]+ds[i]);});
 const bend=lapMean(curve.map(Math.abs),PLAN_BEND),target=lapMean(curve,i=>Math.max(1,PLAN_SIGMA/(1+(bend[i]/PLAN_TIGHT)**2)));
 // The curvature's change from e (the stencil M) and its transpose; conjugate gradients on (MᵀM + PLAN_STIFF) e = Mᵀ r.
 const M=(e,o)=>{for(let i=0;i<n;i++){const a=(i-1+n)%n,b=(i+1)%n;o[i]=2*((e[b]-e[i])/ds[i]-(e[i]-e[a])/ds[a])/(ds[a]+ds[i])+curve[i]*curve[i]*e[i];}return o;};
 const MT=(v,o)=>{o.fill(0);for(let i=0;i<n;i++){const a=(i-1+n)%n,b=(i+1)%n,c=2/(ds[a]+ds[i]);o[b]+=v[i]*c/ds[i];o[a]+=v[i]*c/ds[a];o[i]+=v[i]*(curve[i]*curve[i]-c/ds[i]-c/ds[a]);}return o;};
 const tmp=new Float64Array(n),normal=(e,o)=>{MT(M(e,tmp),o);for(let i=0;i<n;i++)o[i]+=PLAN_STIFF*e[i];return o;};
 const e=new Float64Array(n),res=MT(Float64Array.from(target,(c,i)=>c-curve[i]),new Float64Array(n)),dir=Float64Array.from(res),step=new Float64Array(n);
 const dot=(u,v)=>{let s=0;for(let i=0;i<n;i++)s+=u[i]*v[i];return s;};
 let rr=dot(res,res),iterations=0;const start=rr;
 while(rr>1e-14*start&&iterations<4*n){
  normal(dir,step);const k=rr/dot(dir,step);for(let i=0;i<n;i++){e[i]+=k*dir[i];res[i]-=k*step[i];}
  const next=dot(res,res);for(let i=0;i<n;i++)dir[i]=res[i]+next/rr*dir[i];rr=next;iterations++;
 }
 const w0=A.map(p=>p[4]),w=lapMean(w0,PLAN_WIDTH),keep=[-1,1].map(side=>pitKeep(data,side));
 // Each edge's move (along the left normal): the left one e + dw/2, the right one e - dw/2; one kept by the pit lane stays.
 let most=0;
 for(let i=0;i<n;i++){
  const dw=w[i]-w0[i],left=(e[i]+dw/2)*keep[1][i],right=(e[i]-dw/2)*keep[0][i];
  e[i]=(left+right)/2;w[i]=w0[i]+left-right;most=Math.max(most,Math.abs(left),Math.abs(right));
 }
 const x=A.map((p,i)=>p[1]+p[9]*e[i]),y=A.map((p,i)=>p[2]+p[10]*e[i]);
 A.forEach((p,i)=>{
  const a=(i-1+n)%n,b=(i+1)%n,tx=x[b]-x[a],ty=y[b]-y[a],t=Math.hypot(tx,ty)||1;
  // (The centre's height read on the road's plane where it moved: the surface stays where it was.)
  p[3]+=p[5]*e[i];p[1]=x[i];p[2]=y[i];p[4]=w[i];p[7]=tx/t;p[8]=ty/t;p[9]=-ty/t;p[10]=tx/t;
 });
 return {iterations,edge:+most.toFixed(3)};
}
// Kerbs (the flags each station carries, 13 right and 14 left, read off the photo: track-surface.js createCurbs draws them,
// kerb-contact.js feels them): between two runs of kerb on the same side, a hole of KERB_HOLE metres or less is filled,
// and in a bend one of KERB_BEND_GAP or less (the lap turning KERB_BEND_TURN degrees or more over it and KERB_PAD metres
// either side): a block or two the photo's reading missed, a kerb's stretch it read off the edge. Not on a city's
// streets (a side street's mouth is a real gap), nor where the pit lane's paved band or a closed road's asphalt reaches
// the edge (the cars cross there).
export const KERB_HOLE=16,KERB_BEND_GAP=50,KERB_BEND_TURN=10,KERB_PAD=10;
function fillKerbs(data){
 const A=data.samples,n=A.length,L=data.meta.reconstructed_xy_m;
 if(data.meta.street||!(A[0]?.length>14))return null;
 const geo=data.pit?pitGeometry(data):null,heading=q=>{const p=A[((q%n)+n)%n];return Math.atan2(p[8],p[7]);};
 const roads=(data.closed_roads??[]).map(road=>{const c=Object.fromEntries(road.columns.map((k,i)=>[k,i]));return road.samples.map(p=>[p[c.x],p[c.y],p[c.width]/2]);});
 const crossed=(i,side)=>{
  const p=A[i];
  for(const gap of [0,1]){
   const d=side*(p[4]/2+gap),x=p[1]+p[9]*d,y=p[2]+p[10]*d,q=geo&&locatePit(geo,x,y);if(q&&q.d>=q.lo-.5&&q.d<=q.hi+.5)return true;
   for(const road of roads)for(const [rx,ry,half] of road)if(Math.hypot(x-rx,y-ry)<half+3)return true;
  }
  return false;
 };
 const pad=Math.round(KERB_PAD/(L/n));let holes=0,metres=0;
 for(const [side,col] of [[-1,13],[1,14]]){
  const on=A.map(p=>p[col]>.5);if(!on.some(Boolean)||on.every(Boolean))continue;
  for(let a=0;a<n;a++){
   // a: the last kerbed station before a hole, j: the first after it, k stations between.
   if(!on[a]||on[(a+1)%n])continue;
   let j=(a+1)%n,k=0;while(!on[j]){j=(j+1)%n;k++;}
   const gap=((A[j][0]-A[a][0])%L+L)%L;if(gap>KERB_BEND_GAP)continue;
   let turn=0;for(let m=-pad;m<=k+pad;m++)turn+=wrap(heading(a+m+1)-heading(a+m));
   if(gap>KERB_HOLE&&Math.abs(turn)*180/Math.PI<KERB_BEND_TURN)continue;
   let free=true;for(let m=1;m<=k&&free;m++)free=!crossed((a+m)%n,side);
   if(!free)continue;
   for(let m=1;m<=k;m++)A[(a+m)%n][col]=1;
   holes++;metres+=gap;
  }
 }
 return {holes,metres:Math.round(metres)};
}
// 1 where the lap's edge on that side may move, 0 where it comes within PLAN_PIT_GAP of the pit lane's paved band, faded
// between by lap distance.
function pitKeep(data,side){
 const A=data.samples,n=A.length,L=data.meta.reconstructed_xy_m,geo=data.pit?pitGeometry(data):null,far=new Float64Array(n).fill(Infinity);
 if(!geo)return far.fill(1);
 A.forEach((p,i)=>{for(let gap=0;gap<=PLAN_PIT_GAP;gap++){const d=side*(p[4]/2+gap),q=locatePit(geo,p[1]+p[9]*d,p[2]+p[10]*d);if(q&&q.d>=q.lo-.5&&q.d<=q.hi+.5){far[i]=0;break;}}});
 const gap=i=>{const d=(i+1<n?A[i+1][0]:L)-A[i][0];return d>0?d:1;};
 for(let pass=0;pass<2;pass++){
  for(let k=1;k<=n;k++){const i=k%n,j=k-1;far[i]=Math.min(far[i],far[j]+gap(j));}
  for(let k=n-1;k>=0;k--){const j=(k+1)%n;far[k]=Math.min(far[k],far[j]+gap(k));}
 }
 return far.map(d=>smooth(d/PLAN_PIT_FADE));
}
// A straight line z = a + b·x fitted to weighted points, read at x = 0 (the mean where the points stand on one side only).
export class LineFit{
 constructor(){this.s0=this.s1=this.s2=this.t0=this.t1=0;}
 add(x,z,w){this.s0+=w;this.s1+=w*x;this.s2+=w*x*x;this.t0+=w*z;this.t1+=w*x*z;}
 at0(){const det=this.s0*this.s2-this.s1*this.s1;return det>1e-9*this.s0*this.s2?(this.t0*this.s2-this.t1*this.s1)/det:this.t0/this.s0;}
}

// Width: the narrower envelope of the lap's width whose slope stays under WIDTH_SLOPE (metres of width per metre of lap),
// rounded over WIDTH_SIGMA; a station it leaves within a centimetre keeps its own width.
export const WIDTH_SLOPE=.15,WIDTH_SIGMA=4;
function smoothWidth(data){
 if(!data.scenery||data.meta.street)return null;
 const A=data.samples,n=A.length,L=data.meta.reconstructed_xy_m,w=A.map(p=>p[4]),env=Float64Array.from(w);
 const gap=i=>{const d=(i+1<n?A[i+1][0]:L)-A[i][0];return d>0?d:1;},apart=(i,j)=>{const d=Math.abs(A[i][0]-A[j][0]);return Math.min(d,L-d);};
 for(let pass=0;pass<2;pass++){
  for(let k=1;k<=n;k++){const i=k%n,j=k-1;env[i]=Math.min(env[i],env[j]+WIDTH_SLOPE*gap(j));}
  for(let k=n-1;k>=0;k--){const j=(k+1)%n;env[k]=Math.min(env[k],env[j]+WIDTH_SLOPE*gap(k));}
 }
 const K=Math.ceil(3*WIDTH_SIGMA/Math.max(.5,L/n))+1;let changed=0,most=0;
 for(let i=0;i<n;i++){
  let sum=0,weight=0;for(let k=-K;k<=K;k++){const j=(i+k+n)%n,g=Math.exp(-(apart(i,j)**2)/(2*WIDTH_SIGMA*WIDTH_SIGMA));sum+=g*env[j];weight+=g;}
  const v=Math.min(sum/weight,w[i]);if(w[i]-v<.01)continue;
  A[i][4]=v;changed++;most=Math.max(most,w[i]-v);
 }
 return {stations:changed,narrowest:+most.toFixed(3)};
}

// Ground: how far along the lap each node's survey is averaged (Gaussian sigma, metres), out to how far past the barrier's
// line in full and then fading over VERGE_FADE more, plus VERGE_FADE_PER_M for each metre the node is moved; no node moves
// more than VERGE_CAP. On the inside of a bend the mean stops where its offset reaches VERGE_INNER of the radius (its
// points would wheel round past the centre). Where two parts of the lap pass within SEPARATE metres of lap of each other,
// a node whose two distances out from their asphalt differ by less than SEAM takes from both.
export const VERGE_SIGMA=10,VERGE_PAST=1.5,VERGE_FADE=5.5,VERGE_FADE_PER_M=4,VERGE_CAP=1.5,VERGE_INNER=.6;
const SEPARATE=40,SEAM=8,ALONG_STEP=4;
// Kept clear round the pit lane (metres beside its paved band on the lap's side, behind it past the garages), then faded
// in over FADE; the same round a closed road's asphalt, and round a plateau's rim (its two terrain copies, cliff-edge.js).
const PIT_FRONT=4,PIT_BACK=26,ROAD_KEEP=3,RIM_KEEP=45,KEEP_FADE=10,ROW_GAP=1;
function smoothGround(data){
 const t=data.terrain;
 if(!t||data.meta.street||data.meta.id==='curvelo'||data.branches?.length||data.meta.sea_level_m!=null)return null;
 const {nx,ny,step,x0,y0}=t,raw=Float64Array.from(t.z),A=data.samples,N=A.length,L=data.meta.reconstructed_xy_m;
 const bilinear=(x,y)=>{const fx=clamp((x-x0)/step,0,nx-1.001),fy=clamp((y-y0)/step,0,ny-1.001),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,k=j*nx+i;return (raw[k]*(1-u)+raw[k+1]*u)*(1-v)+(raw[k+nx]*(1-u)+raw[k+nx+1]*u)*v;};
 // The lap's nearest stretch to each node (as track-clearance.js fitGround), out to the widest band; then the nearest of
 // another part of the lap (SEPARATE metres of lap or more away from it), where two pass close (Piracicaba's infield).
 const reach=VERGE_PAST+VERGE_FADE+VERGE_FADE_PER_M*VERGE_CAP+10+.5,size=nx*ny,stretch=[{hint:new Int32Array(size).fill(-1),best:new Float64Array(size).fill(Infinity),at:new Float64Array(size)},{hint:new Int32Array(size).fill(-1),best:new Float64Array(size).fill(Infinity),at:new Float64Array(size)}];
 const apart=(i,j)=>{const d=Math.abs(A[i][0]-A[j][0]);return Math.min(d,L-d);};
 for(const [n,S] of stretch.entries())for(let i=0;i<N;i++){
  const p=A[i],q=A[(i+1)%N],r=Math.max(p[4],q[4])/2+reach,dx=q[1]-p[1],dy=q[2]-p[2],len2=dx*dx+dy*dy||1e-9;
  const i0=Math.max(0,Math.floor((Math.min(p[1],q[1])-r-x0)/step)),i1=Math.min(nx-1,Math.ceil((Math.max(p[1],q[1])+r-x0)/step));
  const j0=Math.max(0,Math.floor((Math.min(p[2],q[2])-r-y0)/step)),j1=Math.min(ny-1,Math.ceil((Math.max(p[2],q[2])+r-y0)/step));
  for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){
   const g=j*nx+k;if(n&&(stretch[0].hint[g]<0||apart(i,stretch[0].hint[g])<SEPARATE))continue;
   const x=x0+k*step,y=y0+j*step;let u=((x-p[1])*dx+(y-p[2])*dy)/len2;
   // (The other part of the lap only where the node stands square to it: not the same road further on.)
   if(n&&(u<=0||u>=1))continue;u=u<0?0:u>1?1:u;
   const ex=x-p[1]-u*dx,ey=y-p[2]-u*dy,d2=ex*ex+ey*ey;if(d2<S.best[g]){S.best[g]=d2;S.hint[g]=i;S.at[g]=u;}
  }
 }
 const keep=new Float64Array(size).fill(1);
 // Each node of the lap's band near a polyline band ([x, y, lx, ly, lo, hi] rows, lo..hi across it along l) faded by its
 // distance outside it. (Its rows taken ROW_GAP or more apart: a rim's come every few decimetres; further apart, the
 // chords across the pit lane's entry cut into its band.)
 const clear=(rows,margin)=>{
  let last=null;
  for(let r=0;r<rows.length;r++){const row=rows[r];if(last&&r<rows.length-1&&Math.hypot(row[0]-last[0],row[1]-last[1])<ROW_GAP)continue;if(last)span(last,row,margin);last=row;}
 };
 const span=(p,q,margin)=>{
  const dx=q[0]-p[0],dy=q[1]-p[1],len2=dx*dx+dy*dy||1e-9,ext=Math.max(-p[4],p[5],-q[4],q[5])+margin+KEEP_FADE;
  const i0=Math.max(0,Math.floor((Math.min(p[0],q[0])-ext-x0)/step)),i1=Math.min(nx-1,Math.ceil((Math.max(p[0],q[0])+ext-x0)/step));
  const j0=Math.max(0,Math.floor((Math.min(p[1],q[1])-ext-y0)/step)),j1=Math.min(ny-1,Math.ceil((Math.max(p[1],q[1])+ext-y0)/step));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const g=j*nx+i;if(stretch[0].hint[g]<0||keep[g]<=0)continue;
   const x=x0+i*step,y=y0+j*step,u=((x-p[0])*dx+(y-p[1])*dy)/len2,f=clamp(u,0,1),lx=p[2]+(q[2]-p[2])*f,ly=p[3]+(q[3]-p[3])*f,l=Math.hypot(lx,ly)||1;
   const ex=x-p[0]-f*dx,ey=y-p[1]-f*dy,d=(ex*lx+ey*ly)/l,lo=p[4]+(q[4]-p[4])*f-margin,hi=p[5]+(q[5]-p[5])*f+margin;
   const across=Math.max(lo-d,d-hi,0),along=(u<0?-u:u>1?u-1:0)*Math.sqrt(len2);
   keep[g]=Math.min(keep[g],smooth(Math.hypot(across,along)/KEEP_FADE));
  }
 };
 if(data.pit){
  const P=data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i]));
  clear(P.samples.map(p=>[p[c.x],p[c.y],p[c.lx],p[c.ly],p[c.lo]-PIT_FRONT,p[c.hi]+PIT_BACK]),0);
 }
 for(const road of data.closed_roads??[]){const c=Object.fromEntries(road.columns.map((k,i)=>[k,i]));clear(road.samples.map(p=>[p[c.x],p[c.y],p[c.lx],p[c.ly],-p[c.width]/2,p[c.width]/2]),ROAD_KEEP);}
 const rim=data.scenery?.cliff?.edge;if(rim)clear(rim.map((r,k)=>{const a=rim[Math.max(0,k-1)],b=rim[Math.min(rim.length-1,k+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [r[0],r[1],-(b[1]-a[1])/l,(b[0]-a[0])/l,0,0];}),RIM_KEEP);
 // Curvature at each station (1/m, positive turning left: the centre of the bend on the left, d > 0).
 const curve=A.map((p,i)=>{const a=A[(i-1+N)%N],b=A[(i+1)%N],ds=(b[0]-a[0]+L)%L||1;return wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7]))/ds;});
 // (The survey read every ALONG_STEP metres or so up and down the lap: a tenth of the sigma's run or less.)
 const K=Math.ceil(3*VERGE_SIGMA/Math.max(.5,L/N))+1,stride=Math.max(1,Math.round(ALONG_STEP/(L/N)));
 // The change one stretch asks of node g at (x, y): its offset out past the asphalt and the change, faded past the band.
 const along=(g,x,y,i,u)=>{
  const p=A[i],q=A[(i+1)%N];
  const lx=p[9]+(q[9]-p[9])*u,ly=p[10]+(q[10]-p[10])*u,l=Math.hypot(lx,ly)||1,cx=p[1]+(q[1]-p[1])*u,cy=p[2]+(q[2]-p[2])*u;
  const d=((x-cx)*lx+(y-cy)*ly)/l,side=d<0?-1:1,s=(p[0]+u*(((i+1)%N?q[0]:L)-p[0]))%L,out=Math.abs(d)-(p[4]+(q[4]-p[4])*u)/2;
  const band=guardrailClearance(data,s,side)+VERGE_PAST;if(out>band+VERGE_FADE+VERGE_FADE_PER_M*VERGE_CAP)return {out,dz:0};
  // Up and down the lap at the node's own offset, each way until the bend's inside wheels the offset round; a line fitted
  // there (weighted least squares), so a window cut short on one side keeps the slope instead of leaning to it.
  const fit=new LineFit();fit.add(0,raw[g],1);
  for(const dir of [-1,1])for(let k=stride;k<=K;k+=stride){
   const j=(i+dir*k+N)%N,a=A[j],b=A[(j+1)%N];if(Math.abs(d)*Math.abs(curve[j])>VERGE_INNER&&side*curve[j]>0)break;
   const ds=apart(i,j);if(ds>3*VERGE_SIGMA)break;
   const mx=a[9]+(b[9]-a[9])*u,my=a[10]+(b[10]-a[10])*u,m=Math.hypot(mx,my)||1;
   fit.add(dir*ds,bilinear(a[1]+(b[1]-a[1])*u+mx/m*d,a[2]+(b[2]-a[2])*u+my/m*d),Math.exp(-ds*ds/(2*VERGE_SIGMA*VERGE_SIGMA)));
  }
  // At most VERGE_CAP, eased into it (a cutting's lip, the bank of a creek running across: not a bump), and faded out over a
  // longer run the more it lifts or lowers (no short ramp up to the band's edge).
  const dz=VERGE_CAP*Math.tanh((fit.at0()-raw[g])/VERGE_CAP);
  return {out,dz:dz*(1-smooth((out-band)/(VERGE_FADE+VERGE_FADE_PER_M*Math.abs(dz))))};
 };
 let nodes=0,moved=0,most=0;
 for(let g=0;g<size;g++){
  const i=stretch[0].hint[g];if(i<0||keep[g]<=0)continue;
  const x=x0+(g%nx)*step,y=y0+Math.floor(g/nx)*step,a=along(g,x,y,i,stretch[0].at[g]),k=stretch[1].hint[g];
  let dz=a.dz;
  // Where another part of the lap is nearly as near, the two changes blended by how much nearer each is: no seam halfway.
  if(k>=0&&Math.sqrt(stretch[1].best[g])-Math.max(A[k][4],A[(k+1)%N][4])/2<a.out+SEAM){const b=along(g,x,y,k,stretch[1].at[g]),w=1-smooth((b.out-a.out)/SEAM);if(w>0)dz=(a.dz+w*b.dz)/(1+w);}
  dz*=keep[g];if(!dz)continue;
  nodes++;if(Math.abs(dz)>.01)moved++;most=Math.max(most,Math.abs(dz));t.z[g]=raw[g]+dz;
 }
 return {nodes,moved,most:+most.toFixed(3)};
}
