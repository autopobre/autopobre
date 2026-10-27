import {clamp,wrap,guardrailClearance} from './physics.js';

// The verges of a circuit made regular (user, 2026-10-26: the guardrails rose and fell with every hump of the terrain, "como
// se eles estivessem corretos em um chão regular", and some bends had a notch in the asphalt's edge, "curvas irregulares que
// parece que foram feitas erradas"). Run once on the track data as it loads (main.js), before anything reads it: the
// physics, the drawn ground and everything set on it then meet the same verges.
// - The ground beside the lap (smoothGround): the terrain grid from under the asphalt out past the barrier's line, smoothed
//   along the lap. Each node takes the Gaussian mean (VERGE_SIGMA) of the survey at its own offset from the centre line up
//   and down the lap, so a bank or a ditch beside the road runs on as one and the bumps of the grid (a LiDAR return off a
//   bush, the 30 m ANADEM's steps) go: the rails stand on it (street-walls.js barrierLines), and so do the cars that run
//   wide. Not on a street circuit (its walls stand on the city's own flattened sidewalks, gerar_pista.aplainar_ruas),
//   nor round the pit lane and its garages, a closed road's asphalt (Velocitta) or a plateau's rim (Chapada): those keep
//   the survey.
// - The lap's width (smoothWidth), where the asphalt is drawn from the track file (not Interlagos' Blender road, not a
//   city's streets): a width that changes faster than WIDTH_SLOPE is eased, only ever narrower (the generator's caps
//   against a hairpin's fold or a neighbouring stretch hold). Piracicaba's Junção went from 13.6 to 15.7 m in 4 m: a notch.
const done=new WeakMap();
export function smoothVerges(data){
 if(!done.has(data))done.set(data,{width:smoothWidth(data),ground:smoothGround(data)});
 return done.get(data);
}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
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
