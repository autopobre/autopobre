// The rim of a circuit on a plateau (Chapada dos Sonhos, data.scenery.cliff, scripts/circuitos/gerar_chapada.py):
// the line along the top of the wall, the plateau on its right. Past it the ground is the foot of the wall,
// a hundred metres and more below. physics.js asks here which side of the line a point is on and takes its
// ground from one of two copies of the terrain grid: the plateau's, carried a few cells past the line at the
// height of the top, and the abyss's, carried a few cells short of it at the height of the foot. Either way a
// point never blends heights across the lip: the edge is as sharp as the line. cliff-scenery.js draws the wall
// and the rim from the same line; cliff-fall.js brings back the cars that go over it.
// Plain arithmetic, no three.js: the Node checks load it with physics.js.
const CELL=20,REACH=36,CARRY=3;
const cache=new WeakMap();
// The circuit's rim, built once per track file; null on circuits without one.
export function cliffEdge(data){
 const c=data?.scenery?.cliff;if(!c)return null;
 let edge=cache.get(data);if(!edge){edge=new CliffEdge(data);cache.set(data,edge);}return edge;
}
export class CliffEdge{
 constructor(data){
  const c=data.scenery.cliff,rows=c.edge,n=rows.length,t=data.terrain;
  this.terrain=t;this.n=n;
  this.x=new Float64Array(n);this.y=new Float64Array(n);this.top=new Float64Array(n);this.wall=new Float64Array(n);
  rows.forEach((r,i)=>{this.x[i]=r[0];this.y[i]=r[1];this.top[i]=r[2];this.wall[i]=r[3];});
  // Segments: unit direction and length; the abyss is on the left of the line (-ty, tx).
  this.tx=new Float64Array(n-1);this.ty=new Float64Array(n-1);this.len=new Float64Array(n-1);
  for(let i=0;i<n-1;i++){const dx=this.x[i+1]-this.x[i],dy=this.y[i+1]-this.y[i],l=Math.hypot(dx,dy)||1e-6;this.tx[i]=dx/l;this.ty[i]=dy/l;this.len[i]=l;}
  // Each segment listed in the cells it reaches within REACH: a query only looks at its own cell.
  this.cells=new Map();
  for(let i=0;i<n-1;i++){
   const x0=Math.min(this.x[i],this.x[i+1])-REACH,x1=Math.max(this.x[i],this.x[i+1])+REACH,y0=Math.min(this.y[i],this.y[i+1])-REACH,y1=Math.max(this.y[i],this.y[i+1])+REACH;
   for(let cx=Math.floor(x0/CELL);cx<=Math.floor(x1/CELL);cx++)for(let cy=Math.floor(y0/CELL);cy<=Math.floor(y1/CELL);cy++){
    const key=cx*65536+cy;let list=this.cells.get(key);if(!list){list=[];this.cells.set(key,list);}list.push(i);
   }
  }
  // Which grid nodes lie beyond the line (the generator's runs per row), for points far from it.
  const mask=this.mask=new Uint8Array(t.nx*t.ny);
  (c.abyss_runs??[]).forEach((runs,j)=>{for(let k=0;k<runs.length;k+=2)mask.fill(1,j*t.nx+runs[k],j*t.nx+runs[k+1]);});
  // The two ground grids. A node beyond the line within CARRY cells of the plateau takes the top's height
  // in the plateau's copy; a node on the plateau within CARRY cells of the abyss, the foot's in the abyss's.
  this.plateauZ=Float32Array.from(t.z);this.abyssZ=Float32Array.from(t.z);
  const hit={};
  for(let j=0;j<t.ny;j++)for(let i=0;i<t.nx;i++){
   const k=j*t.nx+i,side=mask[k];let mixed=false;
   for(let dj=-CARRY;dj<=CARRY&&!mixed;dj++)for(let di=-CARRY;di<=CARRY;di++){
    const ii=i+di,jj=j+dj;if(ii<0||jj<0||ii>=t.nx||jj>=t.ny)continue;if(mask[jj*t.nx+ii]!==side){mixed=true;break;}
   }
   if(!mixed)continue;
   const q=this.query(t.x0+i*t.step,t.y0+j*t.step,hit);if(!q.near)continue;
   if(side)this.plateauZ[k]=Math.max(this.plateauZ[k],q.top);else this.abyssZ[k]=Math.min(this.abyssZ[k],q.top-q.wall);
  }
 }
 // Nearest point of the line to (x, y): d the signed distance (positive past the line, in the abyss), top
 // and wall the heights there, (nx, ny) the outward normal, i and u the segment and the metres along it.
 // Far from the line (beyond REACH) only the side is known: d is +-2 REACH and near false.
 query(x,y,out={}){
  const list=this.cells.get(Math.floor(x/CELL)*65536+Math.floor(y/CELL));
  let best=REACH*REACH,bi=-1,bu=0;
  if(list)for(const i of list){
   const ex=x-this.x[i],ey=y-this.y[i],u=Math.max(0,Math.min(this.len[i],ex*this.tx[i]+ey*this.ty[i]));
   const dx=ex-this.tx[i]*u,dy=ey-this.ty[i]*u,d2=dx*dx+dy*dy;if(d2<best){best=d2;bi=i;bu=u;}
  }
  if(bi<0){out.near=false;out.d=this.maskAt(x,y)?2*REACH:-2*REACH;out.top=out.wall=0;out.i=-1;out.u=0;out.nx=out.ny=0;return out;}
  // At a joint the nearest point is the shared vertex: the side comes from both segments' normals.
  let nx=-this.ty[bi],ny=this.tx[bi];
  if(bu<=0&&bi>0){nx-=this.ty[bi-1];ny+=this.tx[bi-1];}
  else if(bu>=this.len[bi]&&bi<this.n-2){nx-=this.ty[bi+1];ny+=this.tx[bi+1];}
  const nl=Math.hypot(nx,ny)||1;nx/=nl;ny/=nl;
  const ex=x-this.x[bi],ey=y-this.y[bi],side=ex*nx+ey*ny>=0?1:-1,f=bu/this.len[bi];
  out.near=true;out.d=side*Math.sqrt(best);out.i=bi;out.u=bu;out.nx=nx;out.ny=ny;
  out.top=this.top[bi]+(this.top[bi+1]-this.top[bi])*f;out.wall=this.wall[bi]+(this.wall[bi+1]-this.wall[bi])*f;
  return out;
 }
 // Beyond the line? (from the grid nodes: only for points far from it)
 maskAt(x,y){const t=this.terrain,i=Math.round((x-t.x0)/t.step),j=Math.round((y-t.y0)/t.step);return i>=0&&j>=0&&i<t.nx&&j<t.ny?this.mask[j*t.nx+i]:0;}
 // Point of the line at segment i, u metres along it.
 point(i,u){return [this.x[i]+this.tx[i]*u,this.y[i]+this.ty[i]*u];}
}
