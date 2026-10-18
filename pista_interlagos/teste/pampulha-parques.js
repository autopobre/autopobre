import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The Jardim Zoológico (with the Aquário da Bacia do Rio São Francisco) and the Parque Ecológico Francisco Lins do Rêgo
// on the Pampulha's west arms (data.scenery.landmarks kinds 'zoologico', 'zoo_entrada', 'aquario', 'parque_ecologico',
// 'parque_ecologico_entrada'). Measured on the city's 2015 orthophoto (BHGeo ORTOFOTO_2015, 20 cm) and OSM, drawn from
// Commons photos and the city's pages (research 2026-10-18):
// - The zoo's Portaria I (Av. Otacílio Negrão de Lima 8000), south of the Praça do Zoológico roundabout, 25 to 130 m left
//   of the lap at s 7330..7450: the brutalist entrance (a concrete portico on raked pillars crowned with jagged blocks,
//   the ticket windows glazed under it) and before it the white sculpture of tall tapering blades standing in a shallow
//   pool, on Portuguese stone paving (Commons 'Entradazoologico.jpg'); here the portico also carries JARDIM ZOOLÓGICO in
//   plain letters and a board by the roundabout says what is inside. 45 m further in the cadastre's 25 × 12 m lens is the
//   metal canopy over the gate's ticket booths (PBH 2023: 600 m² roof over the bilheterias, the road under it): the track
//   file labels it 'aquario' after the city's tourist point, but the Aquário (opened 2010, 3,000 m² on two floors, 21
//   tanks; exposed concrete frame, dark green panels, Commons 'Aquário de Belo Horizonte.jpg') stands 530 m inside on
//   the zoo's east edge (OSM way 626694096), drawn there and announced on the board. On the roundabout's island (the
//   'zoo_entrada' point, the Praça do Zoológico proper, 26 m from the lap) a low white wall with the name, turned to the
//   cars coming from the east, and a bronze-coloured elephant (game signage, not on the photo); a jaguar on a plinth at
//   the gate; on the open lawn east of the gate road the giraffes' paddock: the zoo is receiving three giraffes from
//   Mangaratiba in the second half of 2026 (contract 11/06..10/12/2026), two of them here, necks over the fence for
//   the cars passing (cleared sight lines).
// - The Parque Ecológico (37 ha, 2004, on the silt between the Ressaca and Sarandi channels): the track file's lake is the
//   city's legal water mirror, which still covers the park (its ground dug as lake bed, its land cover water), so while it
//   is drowned (checked at load) the park's ground is drawn here: an island in the lake's level following the OSM outline,
//   banks into the channels, the lawn 5 to 7 m over the water (the 2015 laser reads 806..810 m), the paths of OSM and the
//   photo, the Lagoa do Parque Ecológico (OSM 135477238) in its concrete banks, its trees (instanced; dense woods in the
//   north half, scattered in the lawns). On a fixed track file it stands on the real ground and the landscape's trees.
//   On it: the entrance 60 m right of the lap at s 5450 (a white concrete frame 27.5 × 13.5 m over the road, slender
//   columns, dark wooden booths, the green signpost with its bird; PARQUE ECOLÓGICO on its south wall, facing the lap,
//   and along its east fascia for the cars coming down the east bank),
//   the Centro de Apoio by the pond (OSM 135477239/41: white boxes, the green geometric mural with a bird on the west
//   end facing the west lap, the water tower, flagpoles), the bandstand (Coreto) at the hub of the paths, the red torii
//   (OSM node 9753280499), the Memorial Minas-Japão (OSM 332176304: a white drum standing in a 107 m long reflecting
//   pool, white ribbon walls curving to it), the corten-steel monument to the promotor Francisco Lins do Rêgo (Commons;
//   at OSM's sculpture node 9753280498), lamps and benches. After dark the lamps, the gates' uplights and the booths glow
//   warm. Merged per material (a draw call each, the trees and the giraffes instanced/animated); nothing enters the lap's
//   driving space (checked per vertex), no logos.

const DRIVE=4.6,TAU=Math.PI*2;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u,sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
// A frame: u along heading h, v to its left, z up from oz; returns track coordinates.
const frame=(ox,oy,oz,h)=>{const c=Math.cos(h),s=Math.sin(h);return (u,v,z)=>[ox+u*c-v*s,oy+u*s+v*c,oz+z];};
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}
function inside(x,y,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
// Distance to a polyline (open) and the signed distance to a polygon (positive inside).
function segDist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1e-9,u=clamp(((x-a[0])*dx+(y-a[1])*dy)/l2,0,1);return Math.hypot(x-a[0]-dx*u,y-a[1]-dy*u);}
function lineDist(x,y,pts){let d=Infinity;for(let i=0;i<pts.length-1;i++)d=Math.min(d,segDist(x,y,pts[i],pts[i+1]));return d;}
function polyDist(x,y,pts){let d=Infinity;for(let i=0,j=pts.length-1;i<pts.length;j=i++)d=Math.min(d,segDist(x,y,pts[j],pts[i]));return inside(x,y,pts)?d:-d;}
const edgeOut=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dy/l,-dx/l];};

// ---------- Geometry gathered per material in track coordinates, drawn as one mesh (flat-shaded unless normals given)
// UVs per corner, or metres over `size` (level faces x and y, walls the run along them and z).
class Batch{
 constructor(size=0){this.size=size;this.p=[];this.n=[];this.c=[];this.t=[];}
 get vertices(){return this.p.length/3;}
 get triangles(){return this.p.length/9;}
 tri(a,b,c,col,uv,ns){
  const n=cross(sub(b,a),sub(c,a)),l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)return;const f=[n[0]/l,n[1]/l,n[2]/l];
  const q=[a,b,c];
  for(let i=0;i<3;i++){
   const p=q[i],k=typeof col==='function'?col(p):col,m=ns?ns[i]:f;this.p.push(p[0],p[2],-p[1]);this.n.push(m[0],m[2],-m[1]);this.c.push(k[0],k[1],k[2]);
   let s=0,t=0;if(uv)[s,t]=uv[i];else if(this.size){if(Math.abs(f[2])>.7){s=p[0]/this.size;t=p[1]/this.size;}else{const h=Math.hypot(f[0],f[1])||1;s=(-f[1]*p[0]+f[0]*p[1])/h/this.size;t=p[2]/this.size;}}
   this.t.push(s,t);
  }
 }
 // A planar quad a-b-c-d turned to face `out` when given.
 quad(a,b,c,d,col,out,uv,ns){
  if(out&&dot(cross(sub(c,a),sub(d,b)),out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];if(ns)ns=[ns[0],ns[3],ns[2],ns[1]];}
  this.tri(a,b,c,col,uv&&[uv[0],uv[1],uv[2]],ns&&[ns[0],ns[1],ns[2]]);this.tri(a,c,d,col,uv&&[uv[0],uv[2],uv[3]],ns&&[ns[0],ns[2],ns[3]]);
 }
 // A planar polygon given in 2D (concave allowed), placed by to3(p2) and facing out; uvOf(p2) for its UVs.
 flat(pts2,to3,col,out,uvOf){
  if(pts2.length<3)return;const flat=pts2.map(p=>new THREE.Vector2(p[0],p[1]));if(Math.abs(THREE.ShapeUtils.area(flat))<1e-6)return;
  for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(flat,[])){const a=pts2[i],b=pts2[j],c=pts2[k],A=to3(a),B=to3(b),C=to3(c);
   if(dot(cross(sub(B,A),sub(C,A)),out)<0)this.tri(A,C,B,col,uvOf&&[uvOf(a),uvOf(c),uvOf(b)]);else this.tri(A,B,C,col,uvOf&&[uvOf(a),uvOf(b),uvOf(c)]);}
 }
 // A box a0..a1 × b0..b1 × z0..z1 in frame f, every face turned away from its centre.
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2),face=(A,B,C,D)=>this.quad(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c));
  face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 // An n-sided post from p (radius r0) to q (radius r1); smooth normals when `smooth`.
 post(p,q,r0,r1,n,col,{rot=0,top=true,smooth=false,sx=1}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*TAU/n,x=Math.cos(a)*r*sx,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1),N=i=>{const a=rot+i*TAU/n;return unit([e1[0]*Math.cos(a)/sx+e2[0]*Math.sin(a),e1[1]*Math.cos(a)/sx+e2[1]*Math.sin(a),e1[2]*Math.cos(a)/sx+e2[2]*Math.sin(a)]);};
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))),null,smooth?[N(i),N(j),N(j),N(i)]:null);}
  if(top&&r1>0)for(let i=1;i<n-1;i++){const f=dot(cross(sub(B[i],B[0]),sub(B[i+1],B[0])),d)<0;this.tri(B[0],f?B[i+1]:B[i],f?B[i]:B[i+1],col);}
 }
 // A wall along a polyline (track xy), `thick` metres, from z0(i) to z1(i) at each point (absolute heights).
 wall(pts,thick,z0,z1,col,{caps=true}={}){
  const n=pts.length,off=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)],o=edgeOut(a,b);return [o[0]*thick/2,o[1]*thick/2];});
  const L=(i,s,z)=>[pts[i][0]+off[i][0]*s,pts[i][1]+off[i][1]*s,z];
  for(let i=0;i<n-1;i++)for(const s of [-1,1]){this.quad(L(i,s,z0(i)),L(i+1,s,z0(i+1)),L(i+1,s,z1(i+1)),L(i,s,z1(i)),col,[off[i][0]*s,off[i][1]*s,0]);}
  for(let i=0;i<n-1;i++)this.quad(L(i,-1,z1(i)),L(i+1,-1,z1(i+1)),L(i+1,1,z1(i+1)),L(i,1,z1(i)),col,[0,0,1]);
  if(caps)for(const [i,k] of [[0,-1],[n-1,1]]){const a=pts[i],b=pts[i-k]??pts[i],d=unit([a[0]-b[0],a[1]-b[1],0]);this.quad(L(i,-1,z0(i)),L(i,1,z0(i)),L(i,1,z1(i)),L(i,-1,z1(i)),col,d);}
 }
 mesh(name,material,shadow=true){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;return mesh;
 }
}

// ---------- The lap's driving space (asphalt and walls, DRIVE metres over the road): pampulha-igrejinha.js's index.
function lapSpace(data){
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+4;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 // Free: no wall's back within `margin` metres.
 const free=(x,y,margin)=>!at(x,y).some(h=>Math.abs(h.lat)<h.back+margin);
 return {at,free};
}

// ---------- Places (track metres, measured on the 20 cm orthophoto and OSM; see the header)
// The park's pond, the Centro de Apoio's two blocks, the memorial's pool ends and ribbons, the paths (width, points).
const POND=[[-1863.1,-343.8],[-1858,-326.5],[-1851.7,-319.8],[-1841.6,-317.7],[-1824.8,-322.8],[-1789.4,-328.6],[-1768.1,-327],[-1707.9,-312.3],[-1693.3,-316.9],[-1683.3,-326.4],[-1679.4,-336],[-1679.5,-348.2],[-1685.7,-359.4],[-1695.3,-363.2],[-1706,-363.7],[-1730,-349.1],[-1744.6,-342.8],[-1763.7,-339.4],[-1776.6,-341.5],[-1849.2,-368.4],[-1858.8,-366.7],[-1865.5,-357.7]];
const CENTRO_A=[[-1804,-352.6],[-1768.1,-352.8],[-1768.9,-366.5],[-1804.1,-367]],CENTRO_B=[[-1714.6,-366.2],[-1793.3,-367.1],[-1793.1,-378.9],[-1714.4,-378]];
const MEMO={drum:[-1816.7,-141.7],north:[-1803.4,-84.75],south:[-1822.1,-190.45],width:14.8,
 west:[[-1849.5,-163],[-1845.5,-155],[-1841.6,-147.6],[-1837.6,-141],[-1832.5,-136],[-1826.5,-133.2],[-1821.5,-132.6]],
 east:[[-1786.4,-106],[-1785.2,-118],[-1786.5,-128.5],[-1790.5,-137],[-1797.5,-143.8],[-1805,-148.2],[-1809.6,-148.6]]};
const PATHS=[
 [4.5,[[-1830,-976],[-1829.6,-943],[-1840.4,-902],[-1871,-824],[-1924,-654],[-1937,-574],[-1931,-548],[-1911.6,-450],[-1903,-432],[-1890.4,-424.8]]],
 [5,[[-1667,-431],[-1696,-405],[-1722,-396],[-1757,-391],[-1773,-392],[-1824,-397],[-1831,-397],[-1854,-405],[-1877.5,-423.6],[-1890.4,-424.8],[-1900.7,-457.7],[-1905.3,-482.8],[-1910.5,-502],[-1907.7,-510],[-1899,-510],[-1883,-508.6],[-1870,-506.5],[-1843.6,-497],[-1827.8,-488],[-1805,-477],[-1796,-466],[-1794,-458],[-1788,-451.7],[-1773,-444.5]]],
 [4,[[-1824.4,-396.7],[-1825,-385.6],[-1841,-385.3],[-1855,-385.2],[-1867,-381.4],[-1873.7,-377.4],[-1880.9,-371.6],[-1866.8,-251.1],[-1864.7,-233.1],[-1853.3,-210],[-1847.1,-185.7],[-1849.5,-163]]],
 [4,[[-1773.4,-392.4],[-1773.1,-444.5],[-1772.7,-508.5],[-1772.8,-522.7]]],
 [3,[[-1760.7,-547.9],[-1753.3,-557],[-1743.3,-568.8],[-1707.5,-602.5],[-1690.7,-616.6]]],
 [3,[[-1782.6,-550.6],[-1790.9,-559.8],[-1797,-566.4],[-1800,-576.5],[-1810.7,-589.3],[-1818,-595.9],[-1823.7,-599.8],[-1837.1,-607.1],[-1905,-670.8],[-1890.2,-734.5],[-1886.3,-741.2],[-1880.7,-745.7],[-1877.4,-750.8],[-1872.9,-760.9],[-1870.8,-775.4],[-1866.4,-792.2],[-1848.9,-778.3],[-1823.5,-765.1],[-1802.1,-756.3],[-1738,-746],[-1730.2,-746.1],[-1721.7,-744.5],[-1720,-733.3],[-1722.6,-698.7],[-1727.6,-695.8],[-1749,-693.5],[-1778.2,-695.5],[-1795.6,-697.7],[-1847.9,-698.5],[-1852.4,-711.3],[-1857.5,-722.4],[-1862.1,-728.5],[-1868.4,-744.1],[-1866.7,-750.3],[-1862.3,-760.4],[-1848.9,-778.3]]],
 [3,[[-1870.1,-506.5],[-1866,-522.9],[-1859.9,-536.9],[-1854.3,-545.8],[-1843.2,-567.1],[-1837.8,-594.5],[-1837.1,-607.1],[-1837.9,-616.8],[-1840.2,-630.8],[-1843.7,-645.3],[-1843.2,-658.7],[-1844.5,-679.9],[-1847.9,-698.5]]],
 // The promenade from the gate east and north along the Sarandi (the photo's light band).
 [4.5,[[-1792,-981],[-1750,-970],[-1690,-943],[-1650,-917],[-1637,-880],[-1640,-853],[-1657,-810],[-1667,-790],[-1675,-700],[-1668,-600],[-1660,-520],[-1667,-431]]],
 // In the woods: to the memorial's east ribbon and on north along the lake.
 [3,[[-1786.4,-106],[-1772,-60],[-1742,-20],[-1700,40],[-1660,140],[-1630,250],[-1590,360],[-1540,480],[-1490,610],[-1440,720]]],
 [3,[[-1699.5,-266],[-1720,-230],[-1742,-216],[-1770,-180],[-1790,-150]]]
];
// The entrance's road from the small roundabout through the gate, and the gate's parking (OSM 364188741).
const GATE_ROAD=[[-1868,-1012],[-1845,-995],[-1829,-985],[-1810,-982],[-1792,-981]],ROUNDABOUT=[-1829.2,-984.9];
const PARKING=[[-1720.2,-1000.2],[-1740.2,-1015.9],[-1736.7,-1022.7],[-1696,-1002.4],[-1702.8,-995.9],[-1709.9,-995.6]];
// The apron between the lap's north wall and the park's south bank (land on the photo, lake in the track file).
const APRON=[[-1888,-1020],[-1852,-1034],[-1800,-1043],[-1758,-1036],[-1720,-1024],[-1676,-1004],[-1652,-984],[-1690,-962],[-1760,-978],[-1850,-982],[-1888,-998]];
const CORETO=[-1772.9,-540.3],TORII=[-1866.8,-251.1],LINS=[-1699.5,-266],GATE={x:-1800,y:-982.5};
// The zoo: the plaza's frame origin (pool west of it, portico east), the board, the statues, the paddock, the Aquário.
// The roundabout's island (the Praça do Zoológico proper, 20 m across, its palms): the name sign facing the cars coming
// from the east and the elephant beside it; the paddock on the lawn east of the gate road, 70 m from the avenue.
const ZOO={x:-2712,y:-399},TOTEM=[-2725,-373.5],ISLAND=[-2690,-338],ELEPHANT=[-2694,-350],JAGUAR=[-2703,-386.5],PADDOCK={x:-2658,y:-410,a:16,b:10};
const AQUARIO=[[-2698.5,-951.3],[-2698.3,-943],[-2667.6,-943.7],[-2668.2,-971.5],[-2654.9,-971.8],[-2655.4,-994.9],[-2669.2,-994.6],[-2669.5,-1008.2],[-2699.1,-1007.6],[-2698.6,-980.5],[-2707.6,-980.3],[-2707.3,-968],[-2707,-961.4],[-2706.1,-957.8],[-2701.3,-955.3],[-2701.2,-951.3]];

// ---------- Textures (canvas)
const wrapDraw=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrapDraw(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
// The zoo's exposed concrete (6 m): grey-white, the 1960s weathering (dark run-offs and lichen blotches, as on the photo).
const concreteTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(1959);ctx.fillStyle='#dcdad3';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,70,'255,255,250','80,80,72',70,.08);
 for(let k=0;k<26;k++){const x=r()*w,len=h*(.15+r()*.5),g=ctx.createLinearGradient(0,0,0,len);g.addColorStop(0,'rgba(60,62,58,.28)');g.addColorStop(1,'rgba(60,62,58,0)');ctx.fillStyle=g;ctx.fillRect(x,r()*h*.3,3+r()*14,len);}
 for(let k=0;k<40;k++){ctx.fillStyle=`rgba(${70+r()*40|0},${74+r()*30|0},${62|0},${.08+r()*.14})`;const x=r()*w,y=r()*h,s=4+r()*26;ctx.beginPath();ctx.ellipse(x,y,s,s*(.4+r()*.6),r()*3,0,TAU);ctx.fill();}
 grain(ctx,14,r);
},512,512,true);
// The Portuguese stone paving (calçada portuguesa) of the zoo's square (1.6 m): small grey-white setts.
const settsTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(77);ctx.fillStyle='#6f6b63';ctx.fillRect(0,0,w,h);
 for(let y=0;y<h;y+=9)for(let x=-(y%18?5:0);x<w;x+=10){const v=150+r()*70|0;ctx.fillStyle=`rgb(${v},${v-4},${v-12})`;ctx.beginPath();ctx.ellipse(x+5,y+4.5,4.2+r()*.8,3.6+r()*.6,r(),0,TAU);ctx.fill();}
 blotches(ctx,w,h,r,24,'240,240,230','40,40,36',40,.08);
},256,256,true);
// The giraffes' coat (1.2 m): chestnut patches parted by cream lines, a reticulated network (tiles: the cells wrap).
const coatTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(2026),n=22,pts=Array.from({length:n},()=>[r()*w,r()*h,.75+r()*.35]),img=ctx.createImageData(w,h),d=img.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=1e9,b=1e9,k=0;for(let i=0;i<n;i++){let dx=Math.abs(x-pts[i][0]),dy=Math.abs(y-pts[i][1]);dx=Math.min(dx,w-dx);dy=Math.min(dy,h-dy);const q=Math.hypot(dx,dy);if(q<a){b=a;a=q;k=i;}else if(q<b)b=q;}
  const line=b-a<5,o=(y*w+x)*4,t=pts[k][2];if(line){d[o]=236;d[o+1]=214;d[o+2]=170;}else{d[o]=150*t;d[o+1]=82*t;d[o+2]=34*t;}d[o+3]=255;}
 ctx.putImageData(img,0,0);
},256,256,true);

// The atlas (1024 × 1064) of the boards, the letters and the paintings. Regions in pixels [x0, y0, x1, y1]:
const AT={zooLetters:[0,0,1024,96],totem:[0,104,1024,440],bilheteria:[0,448,512,544],portaria:[512,448,1024,544],
 parkLetters:[0,552,1024,742],mural:[0,750,640,950],swirl:[656,750,880,974],parkSign:[888,750,1024,1006],parkLine:[0,1012,1024,1058]};
const ATH=1064;
const B='"Arial Black","Arial Bold",Arial,sans-serif',R='"Arial",sans-serif';
function atlasTexture(){
 return canvasTexture((ctx,w,h)=>{
  ctx.clearRect(0,0,w,h);const r=random(511);
  const text=(s,x,y,size,fill,{font=B,align='center',max=w,stroke=null,sw=0}={})=>{ctx.font=`${size}px ${font}`;ctx.textAlign=align;ctx.textBaseline='middle';if(stroke){ctx.lineJoin='round';ctx.strokeStyle=stroke;ctx.lineWidth=sw;ctx.strokeText(s,x,y,max);}ctx.fillStyle=fill;ctx.fillText(s,x,y,max);};
  // The portico's letters: off-white, a dark edge (cut out of a clear ground).
  {const [x0,y0,x1,y1]=AT.zooLetters;text('JARDIM ZOOLÓGICO',(x0+x1)/2,(y0+y1)/2+4,84,'#f4f1e8',{max:x1-x0-24,stroke:'#2a2a26',sw:7});}
  // The board by the roundabout: dark green, the name, what is inside, a giraffe and a dourado, the way in.
  {const [x0,y0,x1,y1]=AT.totem;ctx.fillStyle='#1d4a32';ctx.fillRect(x0,y0,x1-x0,y1-y0);ctx.strokeStyle='#e9e4cf';ctx.lineWidth=8;ctx.strokeRect(x0+12,y0+12,x1-x0-24,y1-y0-24);
   text('JARDIM ZOOLÓGICO',x0+430,y0+92,86,'#ffffff',{max:760});text('JARDIM BOTÂNICO',x0+430,y0+186,50,'#e9d27a',{max:720});text('AQUÁRIO DO RIO SÃO FRANCISCO',x0+430,y0+252,44,'#bfe3f0',{max:760});
   text('PORTARIA 1  ·  ENTRADA',x0+430,y0+306,30,'#ffffff',{font:R,max:700});
   // A giraffe (silhouette) and a dourado.
   const gx=x0+880,gy=y0+300;ctx.fillStyle='#e7b34a';ctx.beginPath();ctx.moveTo(gx-60,gy);ctx.lineTo(gx-52,gy-80);ctx.lineTo(gx+20,gy-96);ctx.lineTo(gx+40,gy-210);ctx.lineTo(gx+70,gy-224);ctx.lineTo(gx+76,gy-210);ctx.lineTo(gx+56,gy-200);ctx.lineTo(gx+40,gy-80);ctx.lineTo(gx+34,gy);ctx.lineTo(gx+22,gy);ctx.lineTo(gx+18,gy-60);ctx.lineTo(gx-36,gy-56);ctx.lineTo(gx-46,gy);ctx.closePath();ctx.fill();
   ctx.fillStyle='#8a4a1c';for(let k=0;k<14;k++){ctx.beginPath();ctx.arc(gx-40+r()*80,gy-90+r()*20-(k>9?r()*90:0)+(k>9?0:0),5+r()*5,0,TAU);ctx.fill();}
   const fx=x0+880,fy=y0+120;ctx.fillStyle='#e8a33a';ctx.beginPath();ctx.ellipse(fx,fy,66,24,0,0,TAU);ctx.fill();ctx.beginPath();ctx.moveTo(fx-60,fy);ctx.lineTo(fx-104,fy-26);ctx.lineTo(fx-104,fy+26);ctx.closePath();ctx.fill();ctx.fillStyle='#1d4a32';ctx.beginPath();ctx.arc(fx+44,fy-5,5,0,TAU);ctx.fill();}
  {const [x0,y0,x1,y1]=AT.bilheteria;ctx.fillStyle='#1c3f6e';ctx.fillRect(x0,y0,x1-x0,y1-y0);text('BILHETERIA',(x0+x1)/2,(y0+y1)/2+3,62,'#ffffff',{max:x1-x0-30});}
  {const [x0,y0,x1,y1]=AT.portaria;ctx.fillStyle='#f2f0ea';ctx.fillRect(x0,y0,x1-x0,y1-y0);text('PORTARIA 1',(x0+x1)/2,(y0+y1)/2+3,64,'#1d4a32',{max:x1-x0-30});}
  // The park's letters, dark green on the white wall (clear around them).
  {const [x0,y0,x1,y1]=AT.parkLetters;text('PARQUE ECOLÓGICO',(x0+x1)/2,y0+62,104,'#24563a',{max:x1-x0-20});text('DA PAMPULHA',(x0+x1)/2,y0+152,62,'#3b7a4f',{max:x1-x0-260});}
  {const [x0,y0,x1,y1]=AT.parkLine;text('PARQUE ECOLÓGICO DA PAMPULHA',(x0+x1)/2,(y0+y1)/2+2,40,'#24563a',{max:x1-x0-16});}
  // The Centro de Apoio's mural: teal and green facets, light lines, a rufous bird on a branch in the middle (evoked).
  {const [x0,y0,x1,y1]=AT.mural,W=x1-x0,H=y1-y0;ctx.save();ctx.beginPath();ctx.rect(x0,y0,W,H);ctx.clip();ctx.fillStyle='#2f8c74';ctx.fillRect(x0,y0,W,H);
   const cols=['#1f6f5c','#3aa184','#5cbf8f','#2a7d6b','#7ccf9b','#185a4e','#4fae9a','#9ad8a8'];
   for(let k=0;k<70;k++){ctx.fillStyle=cols[k%cols.length];ctx.beginPath();const cx=x0+r()*W,cy=y0+r()*H,s=30+r()*90;ctx.moveTo(cx,cy);ctx.lineTo(cx+(r()-.5)*s*2,cy+(r()-.5)*s);ctx.lineTo(cx+(r()-.5)*s*2,cy+(r()-.5)*s);ctx.closePath();ctx.globalAlpha=.85;ctx.fill();}
   ctx.globalAlpha=1;ctx.strokeStyle='rgba(235,245,230,.75)';ctx.lineWidth=3;for(let k=0;k<6;k++){ctx.beginPath();ctx.moveTo(x0+r()*W,y0);ctx.lineTo(x0+r()*W,y1);ctx.stroke();}
   ctx.strokeStyle='rgba(230,240,225,.9)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x0+W*.62,y0+H*.25);ctx.lineTo(x0+W*.72,y0+H*.55);ctx.lineTo(x0+W*.82,y0+H*.25);ctx.stroke();ctx.beginPath();ctx.arc(x0+W*.9,y0+H*.2,14,0,TAU);ctx.stroke();
   const bx=x0+W*.4,by=y0+H*.48;ctx.strokeStyle='#4b3320';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(bx-110,by+56);ctx.lineTo(bx+120,by+40);ctx.stroke();
   ctx.fillStyle='#b4542a';ctx.beginPath();ctx.ellipse(bx,by,62,34,-.25,0,TAU);ctx.fill();ctx.fillStyle='#d98a46';ctx.beginPath();ctx.ellipse(bx+6,by+12,40,18,-.25,0,TAU);ctx.fill();
   ctx.fillStyle='#7a3518';ctx.beginPath();ctx.moveTo(bx-50,by-6);ctx.lineTo(bx-118,by-52);ctx.lineTo(bx-104,by-10);ctx.closePath();ctx.fill();
   ctx.fillStyle='#8a3f1c';ctx.beginPath();ctx.arc(bx+58,by-26,24,0,TAU);ctx.fill();ctx.fillStyle='#e8d9b0';ctx.beginPath();ctx.moveTo(bx+80,by-28);ctx.lineTo(bx+104,by-24);ctx.lineTo(bx+80,by-20);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(bx+64,by-30,4,0,TAU);ctx.fill();
   ctx.strokeStyle='rgba(40,20,10,.55)';ctx.lineWidth=2;for(let k=0;k<12;k++){ctx.beginPath();ctx.moveTo(bx-40+k*8,by-24);ctx.lineTo(bx-46+k*8,by+20);ctx.stroke();}
   ctx.restore();}
  // The memorial drum's floor: a white swirl on light stone.
  {const [x0,y0,x1,y1]=AT.swirl,c=[(x0+x1)/2,(y0+y1)/2],R0=(x1-x0)/2;ctx.fillStyle='#d9d6cc';ctx.beginPath();ctx.arc(c[0],c[1],R0,0,TAU);ctx.fill();
   for(let k=0;k<7;k++){ctx.strokeStyle=k%2?'#f6f5f0':'#9fa6a2';ctx.lineWidth=7;ctx.beginPath();for(let t=0;t<=1.001;t+=.02){const a=k*TAU/7+t*3.4,rr=R0*(.12+.84*t);const x=c[0]+Math.cos(a)*rr,y=c[1]+Math.sin(a)*rr;t?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}}
  // The park's map board: green, a light map of the park, a few dots.
  {const [x0,y0,x1,y1]=AT.parkSign;ctx.fillStyle='#4f9a2f';ctx.fillRect(x0,y0,x1-x0,y1-y0);text('PARQUE',(x0+x1)/2,y0+20,22,'#ffffff');text('ECOLÓGICO',(x0+x1)/2,y0+44,18,'#ffffff');
   ctx.fillStyle='#bfe0a0';ctx.beginPath();ctx.moveTo(x0+40,y1-20);ctx.lineTo(x0+30,y0+150);ctx.lineTo(x0+70,y0+70);ctx.lineTo(x0+110,y0+64);ctx.lineTo(x0+90,y0+150);ctx.lineTo(x0+80,y1-24);ctx.closePath();ctx.fill();
   for(let k=0;k<9;k++){ctx.fillStyle=['#e24a33','#2a6fb0','#f2c21b'][k%3];ctx.beginPath();ctx.arc(x0+44+r()*44,y0+80+r()*150,5,0,TAU);ctx.fill();}}
 },1024,ATH,false);
}
const regionUv=(R,fx,fy)=>[(R[0]+fx*(R[2]-R[0]))/1024,1-(R[3]-fy*(R[3]-R[1]))/ATH];
const rectUv=R=>[regionUv(R,0,0),regionUv(R,1,0),regionUv(R,1,1),regionUv(R,0,1)];

// The park's plan on the ground (the island while the lake covers it): lawns (dry patches, BH's long dry season), paths,
// the gate's road and parking, the pond's concrete bank, the bandstand's paved hub and its spokes.
const PLAN={x0:-1962,x1:-1378,y0:-1052,y1:782};
function planTexture(mobile){
 return canvasTexture((ctx,w,h)=>{
  const r=random(2004),kx=w/(PLAN.x1-PLAN.x0),ky=h/(PLAN.y1-PLAN.y0),X=x=>(x-PLAN.x0)*kx,Y=y=>(PLAN.y1-y)*ky,k=(kx+ky)/2;
  const path=(pts,close=false)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));if(close)ctx.closePath();};
  ctx.fillStyle='#66703c';ctx.fillRect(0,0,w,h);
  blotches(ctx,w,h,r,mobile?260:620,'150,150,84','66,84,38',34*k,.18);blotches(ctx,w,h,r,mobile?120:260,'170,150,92','84,100,48',60*k,.22);
  // The woods' floor in the north half: darker, leaf litter.
  {const g=ctx.createLinearGradient(0,Y(-330),0,Y(-230));g.addColorStop(0,'rgba(60,72,30,0)');g.addColorStop(1,'rgba(60,72,30,.55)');ctx.fillStyle=g;ctx.fillRect(0,Y(-230),w,Y(-330)-Y(-230));ctx.fillStyle='rgba(60,72,30,.55)';ctx.fillRect(0,0,w,Y(-230));
   blotches(ctx,w,Y(-230),r,mobile?80:200,'110,96,56','40,52,24',26*k,.2);}
  ctx.lineCap='round';ctx.lineJoin='round';
  // The pond's concrete bank (a ring round the water) and the hub's paving.
  path(POND,true);ctx.strokeStyle='#a7a497';ctx.lineWidth=7*k;ctx.stroke();ctx.fillStyle='#5f6a4c';ctx.fill();
  ctx.fillStyle='#cdbf95';ctx.beginPath();ctx.ellipse(X(CORETO[0]),Y(CORETO[1]),17*kx,17*ky,0,0,TAU);ctx.fill();
  ctx.strokeStyle='#c9b98c';ctx.lineWidth=2.4*k;for(let a=0;a<8;a++){const t=a*TAU/8+.2;path([[CORETO[0]+Math.cos(t)*16,CORETO[1]+Math.sin(t)*16],[CORETO[0]+Math.cos(t)*58,CORETO[1]+Math.sin(t)*58]]);ctx.stroke();}
  // Paths: an edge, the yellow brick pavers (the photos), concrete on the perimeter ones.
  for(const [wd,pts] of PATHS){path(pts);ctx.strokeStyle='rgba(96,92,70,.6)';ctx.lineWidth=(wd+1.2)*k;ctx.stroke();path(pts);ctx.strokeStyle=wd>=4.5?'#cfc6ae':'#d6be84';ctx.lineWidth=wd*k;ctx.stroke();}
  // The gate's road, the small roundabout and the parking: asphalt, a kerb line.
  path(GATE_ROAD);ctx.strokeStyle='#d8d4c8';ctx.lineWidth=8.6*k;ctx.stroke();path(GATE_ROAD);ctx.strokeStyle='#55575a';ctx.lineWidth=7.4*k;ctx.stroke();
  ctx.fillStyle='#55575a';ctx.beginPath();ctx.ellipse(X(ROUNDABOUT[0]),Y(ROUNDABOUT[1]),12*kx,12*ky,0,0,TAU);ctx.fill();ctx.fillStyle='#6d8a3a';ctx.beginPath();ctx.ellipse(X(ROUNDABOUT[0]),Y(ROUNDABOUT[1]),5*kx,5*ky,0,0,TAU);ctx.fill();
  path(PARKING,true);ctx.fillStyle='#5a5c5e';ctx.fill();ctx.strokeStyle='#e8e6de';ctx.lineWidth=.25*k;for(let t=0;t<1;t+=.05){const a=PARKING[0],b=PARKING[3],x=lerp(b[0],a[0],t),y=lerp(b[1],a[1],t);path([[x,y],[x-4,y+5.5]]);ctx.stroke();}
  // Under the gate: light paving.
  ctx.fillStyle='#bdb8aa';ctx.fillRect(X(GATE.x-7.5),Y(GATE.y+14.5),15*kx,29*ky);path(GATE_ROAD.slice(2));ctx.strokeStyle='#5d5f61';ctx.lineWidth=6.4*k;ctx.stroke();
  // The memorial: brick paths along the ribbons, lawn round the pool.
  for(const rib of [MEMO.west,MEMO.east]){path(rib);ctx.strokeStyle='#d6be84';ctx.lineWidth=3.2*k;ctx.stroke();}
  grain(ctx,mobile?8:12,r);
 },mobile?512:1024,mobile?1536:3072,false);
}

// ---------- Materials: the floodlights' wash after dark on the lit surfaces (pampulha-igrejinha.js's rule)
const MAX_FLOODS=8;
function washed(m,U,key){
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,U);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPqPos;varying vec3 vPqN;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPqPos=(modelMatrix*vec4(transformed,1.)).xyz;vPqN=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vPqPos;varying vec3 vPqN;uniform vec4 pqFlood[${MAX_FLOODS}];uniform vec3 pqFloodCol[${MAX_FLOODS}];uniform float pqNight;`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
if(pqNight>0.){vec3 n=normalize(vPqN)*(gl_FrontFacing?1.:-1.);vec3 wash=vec3(0.);
 for(int i=0;i<${MAX_FLOODS};i++){vec3 d=pqFlood[i].xyz-vPqPos;float l=length(d);wash+=pqFloodCol[i]*pqFlood[i].w*max(dot(n,d/l),0.)*(1./(1.+l*l/70.));}
 totalEmissiveRadiance+=diffuseColor.rgb*wash*pqNight*.17;}`);
 };
 m.customProgramCacheKey=()=>'pampulha-parques-v1-'+key;
 return m;
}
// Glass: by day its dark vertex colour; after dark the warm light inside (uPqGlow 0..1), each pane its own share.
function glassMaterial(glow){
 const m=new THREE.MeshStandardMaterial({name:'Parques_vidro',vertexColors:true,roughness:.12,metalness:.3,envMapIntensity:1.1});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,glow);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uPqGlow;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance+=vec3(1.,.7,.4)*uPqGlow*(.35+2.4*vColor.g);\n#endif');
 };
 m.customProgramCacheKey=()=>'pampulha-parques-vidro-v1';
 return m;
}
// The island's lawn: the plan texture, broken up close to the eye by world-space noise (the plan is 0.6 m a pixel).
function groundMaterial(map){
 const m=new THREE.MeshStandardMaterial({name:'Parques_chao',map,vertexColors:true,roughness:.96,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPqW;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPqW=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vPqW;float pqH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float pqN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(pqH(i),pqH(i+vec2(1,0)),f.x),mix(pqH(i+vec2(0,1)),pqH(i+vec2(1,1)),f.x),f.y);}`)
   .replace('#include <map_fragment>','#include <map_fragment>\n{vec2 q=vPqW.xz;float n=pqN(q*1.7)*.5+pqN(q*.37)*.35+pqN(q*7.)*.15;diffuseColor.rgb*=.82+.36*n;}');
 };
 m.customProgramCacheKey=()=>'pampulha-parques-chao-v1';
 return m;
}
// The giraffes: each vertex of a neck and head turns about the neck's base (aPivot, about the horizontal aAxis) by
// aSway.x of the sway: a slow nod, a lazy look round, now and then the long reach down (phase aSway.y).
function giraffeMaterial(map,time){
 const m=new THREE.MeshStandardMaterial({name:'Parques_girafas',map,vertexColors:true,roughness:.8,metalness:0});
 m.onBeforeCompile=shader=>{
  shader.uniforms.uPqTime=time;
  const rot=`vec3 pqRot(vec3 v,vec3 k,float a){float c=cos(a),s=sin(a);return v*c+cross(k,v)*s+k*dot(k,v)*(1.-c);}`;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 aPivot;attribute vec3 aAxis;attribute vec2 aSway;uniform float uPqTime;${rot}
float pqAngle(){float t=uPqTime+aSway.y*7.;return aSway.x*(.07*sin(t*.55+aSway.y)+.035*sin(t*1.7+aSway.y*2.3)+.75*smoothstep(.82,.98,sin(t*.11+aSway.y*3.1)));}`)
   .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=pqRot(objectNormal,aAxis,pqAngle());')
   .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=aPivot+pqRot(transformed-aPivot,aAxis,pqAngle());');
 };
 m.customProgramCacheKey=()=>'pampulha-parques-girafas-v1';
 return m;
}

export const hasPampulhaParques=data=>(data.scenery?.landmarks??[]).some(m=>['zoologico','zoo_entrada','aquario','parque_ecologico','parque_ecologico_entrada'].includes(m.kind));
export function createPampulhaParques(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Zoológico e Parque Ecológico da Pampulha não montados:',e);const root=new THREE.Group();root.name='Marcos_PampulhaParques';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}

function build(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_PampulhaParques';
 const marks=Object.fromEntries((data.scenery?.landmarks??[]).map(m=>[m.kind,m])),stats={mobile};
 const gAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??0;};
 const lap=lapSpace(data),rand=random(8000),W=data.meta?.sea_level_m??.8;
 const U={pqFlood:{value:Array.from({length:MAX_FLOODS},()=>new THREE.Vector4())},pqFloodCol:{value:Array.from({length:MAX_FLOODS},()=>new THREE.Vector3())},pqNight:{value:0}};
 const glow={uPqGlow:{value:0}},girTime={value:0};
 const tex={concrete:concreteTexture(),setts:settsTexture(),atlas:atlasTexture(),coat:coatTexture()};
 const materials={
  concrete:washed(new THREE.MeshStandardMaterial({name:'Parques_concreto',map:tex.concrete,vertexColors:true,roughness:.88,metalness:0}),U,'concrete'),
  paint:washed(new THREE.MeshStandardMaterial({name:'Parques_pintura',vertexColors:true,roughness:.62,metalness:.08}),U,'paint'),
  metal:new THREE.MeshStandardMaterial({name:'Parques_metal',vertexColors:true,roughness:.38,metalness:.55}),
  glass:glassMaterial(glow),
  signs:washed(new THREE.MeshStandardMaterial({name:'Parques_placas',map:tex.atlas,emissiveMap:tex.atlas,emissive:0xffffff,emissiveIntensity:0,vertexColors:true,alphaTest:.5,roughness:.55,metalness:0}),U,'signs'),
  water:new THREE.MeshStandardMaterial({name:'Parques_agua',vertexColors:true,roughness:.06,metalness:.15,envMapIntensity:1.2}),
  paving:new THREE.MeshStandardMaterial({name:'Parques_calcada',map:tex.setts,vertexColors:true,roughness:.9,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3}),
  giraffes:giraffeMaterial(tex.coat,girTime)
 };
 const SIZES={concrete:6,paving:1.6},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const lamps=[],floods=[],clearings=[],obstacles=[],white=[1,1,1];let islandBatch=null,treeMesh=null;
 // A sign: the atlas rectangle R on quad a-b-c-d (bottom left, bottom right, top right, top left as read), facing o.
 const sign=(a,b,c,d,R,o,col=white)=>T.signs.quad(a,b,c,d,col,o,rectUv(R));
 // A board centred at (x, y) facing the horizontal direction o, w wide from z0 to z1 (read the right way round: the
 // reader faces -o, the board's left is to o's right).
 const board=(x,y,o,w,z0,z1,R)=>{const r=[-o[1],o[0]],P=(s,z)=>[x-r[0]*s,y-r[1]*s,z];sign(P(w/2,z0),P(-w/2,z0),P(-w/2,z1),P(w/2,z1),R,[o[0],o[1],0]);};
 // Faces seen from both sides (rails, flags, ears) and triangles turned to face out.
 const both=(b,a,c,d,e,col)=>{const n=cross(sub(d,a),sub(e,c));b.quad(a,c,d,e,col,n);b.quad(a,c,d,e,col,mul(n,-1));};
 const triOut=(b,a,c,d,col,out)=>{if(dot(cross(sub(c,a),sub(d,a)),out)<0)b.tri(a,d,c,col);else b.tri(a,c,d,col);};
 // Camera proxies (the chase camera stays out of the big structures).
 const prism=(pts,z0,z1,name)=>{const b=new Batch();for(let i=0;i<pts.length;i++){const a=pts[i],c=pts[(i+1)%pts.length];b.quad([a[0],a[1],z0],[c[0],c[1],z0],[c[0],c[1],z1],[a[0],a[1],z1],white);}b.flat(pts,p=>[p[0],p[1],z1],white,[0,0,1]);const o=b.mesh('Parques_obstaculo_'+name,new THREE.MeshBasicMaterial(),false);o.updateMatrixWorld(true);obstacles.push(o);};
 // Clear the trees off a disc, and along the sight lines from the lap (stations s0..s1, every `every` m) to a point:
 // discs from the wall out to `short` metres before it.
 const clear=(x,y,r)=>clearings.push({x,y,r});
 const sight=(s0,s1,tx,ty,short=8,r=5.5)=>{for(let s=s0;s<=s1;s+=20){const p=data.samples.find(q=>q[0]>=s);if(!p)continue;const dx=tx-p[1],dy=ty-p[2],d=Math.hypot(dx,dy);for(let t=p[4]/2+3;t<d-short;t+=9)clear(p[1]+dx/d*t,p[2]+dy/d*t,r);}};
 const N=mobile?6:12;
 try{buildZoo();}catch(e){console.warn('Zoológico da Pampulha não montado:',e);stats.zooError=String(e);}
 try{buildPark();}catch(e){console.warn('Parque Ecológico da Pampulha não montado:',e);stats.parkError=String(e);}

 // ========== The zoo
 function buildZoo(){
  const zoo={};
  // ---------- The square before the gate: Portuguese paving from the roundabout's verge to the portico, on the ground.
  {const x0=-2738,x1=-2686,y0=-404,y1=-371,st=mobile?4:2,drop={kept:0};
   for(let x=x0;x<x1;x+=st)for(let y=y0;y<y1;y+=st){const c=[[x,y],[x+st,y],[x+st,y+st],[x,y+st]];
    // A softened outline: the corners trimmed, the bus bay (east, north) left to the street.
    if(c.some(([px,py])=>Math.hypot(px-(-2692),py-(-340))<30.5||(px>-2700&&py>-378)||Math.hypot(px-(-2712),py-(-387.5))>29))continue;
    if(!c.every(([px,py])=>lap.free(px,py,1)))continue;
    T.paving.quad(...c.map(([px,py])=>[px,py,gAt(px,py)+.04]),p=>{const k=.92+.12*fbm(p[0]/6,p[1]/6);return [k,k,k];},[0,0,1]);drop.kept++;}
   zoo.paving=drop.kept;}
  // ---------- The pool and the white blades (in the square's frame: u east, v north from ZOO). The pool is level: its rim
  // stands out of the ground on the low (north) side.
  const zf=Math.min(...[[1,-3],[1,3],[11,-3],[11,3],[22,-3],[22,3]].map(([u,v])=>gAt(ZOO.x+u,ZOO.y+v))),F=frame(ZOO.x,ZOO.y,zf,0);
  {const u0=-8.5,u1=-.6,v0=-7.2,v1=7.2,rim=.36,c=lin(0xd8d4c8),zp=Math.max(...[[u0,v0],[u0,v1],[u1,v0],[u1,v1]].map(([u,v])=>gAt(ZOO.x+u,ZOO.y+v)))+.12,Fp=frame(ZOO.x,ZOO.y,zp,0),low=zf-zp-.6;
   T.concrete.box(Fp,u0,u1,v0,v0+rim,low,.38,c);T.concrete.box(Fp,u0,u1,v1-rim,v1,low,.38,c);T.concrete.box(Fp,u0,u0+rim,v0,v1,low,.38,c);T.concrete.box(Fp,u1-rim,u1,v0,v1,low,.38,c);
   T.water.quad(Fp(u0+rim,v0+rim,.24),Fp(u1-rim,v0+rim,.24),Fp(u1-rim,v1-rim,.24),Fp(u0+rim,v1-rim,.24),lin(0x5fb3b8,.9),[0,0,1]);
   // Five blades: triangular in section, leaning a little, tapering to blunt tips (the photo's 5..10 m).
   const blades=[[-4.4,.6,1.5,.32,10.2,.05,-.04,.4],[-2.9,-1.4,1.25,.26,8.4,-.04,.05,1.3],[-5.9,-1.9,1.1,.22,6.9,.06,.03,2.2],[-3.6,2.9,1,.2,5.6,-.02,-.06,.9],[-6.2,1.9,.85,.18,4.4,.04,.04,2.8]];
   for(const [u,v,r0,r1,hgt,lu,lv,rot] of blades){const p=Fp(u,v,-.2),q=Fp(u+lu*hgt,v+lv*hgt,hgt);T.concrete.post(p,q,r0,r1,3,p=>{const k=.97+.06*fbm(p[0]*.8,p[2]*.4);return [k,k,k*.98];},{rot});}
   floods.push({p:Fp(-4,8.6,-.1),c:[1,.93,.82],s:3.2},{p:Fp(-9.6,3,-.1),c:[1,.93,.82],s:2.4});
   for(const [u,v] of [[-4,8.4],[-9.4,3]]){const q=Fp(u,v,0);T.paint.box(frame(q[0],q[1],gAt(q[0],q[1]),0),-.15,.15,-.12,.12,-.2,.25,lin(0x45484c));}
   clear(ZOO.x-4,ZOO.y,11);zoo.pool=+zp.toFixed(2);}
  // ---------- The portico: raked pillars, two beams with the cross beams, the slab, the jagged crown; the ticket windows
  // glazed under it; JARDIM ZOOLÓGICO standing on its north edge.
  {const u0=.2,u1=23.4,V=3.6,ZB=3.75,ZT=4.7,c=lin(0xcfcdc5),dark=lin(0xa9a79f);
   for(const u of [1,6.6,12.2,17.8,23])for(const s of [-1,1]){T.concrete.post(F(u,s*(V-.5),-.6),F(u+.06,s*(V-.35),ZB),.5,.34,4,c,{rot:Math.PI/4});}
   T.concrete.box(F,u0,u1,V-.7,V,ZB,ZT,c,{bottom:true});T.concrete.box(F,u0,u1,-V,-V+.7,ZB,ZT,c,{bottom:true});
   for(let u=u0+.2;u<u1;u+=2.6)T.concrete.box(F,u,u+.35,-V+.7,V-.7,ZB+.25,ZT-.1,dark,{bottom:true});
   T.concrete.box(F,u0,u1,-V,V,ZT,ZT+.26,c,{bottom:false});
   const r=random(64);
   for(const s of [-1,1])for(let u=u0+.1;u<u1-.6;){const w=.9+r()*1.3,hh=.5+r()*1.9;if(s>0&&u>4.2&&u<19.6){u=19.6;continue;}T.concrete.box(F,u,Math.min(u1,u+w),s>0?V-.9:-V,s>0?V:-V+.9,ZT+.2,ZT+.26+hh,lin(0xd4d2ca,.94+r()*.1));u+=w+.15+r()*.9;}
   for(let u=u0+2;u<u1-1;u+=3.1+r()*1.5)T.concrete.box(F,u,u+.8+r()*.8,-1.1,1.1,ZT+.2,ZT+.6+r()*1.5,lin(0xd4d2ca));
   // The letters, a dark frame behind them (a plain backing seen from the south).
   const lu0=4.6,lu1=19.2,lz0=ZT+.32,lz1=ZT+1.52,o=[0,1,0];{const c=F((lu0+lu1)/2,V-.12,0);board(c[0],c[1],[0,1],lu1-lu0,zf+lz0,zf+lz1,AT.zooLetters);}
   for(const u of [6,10.5,14,18])T.metal.box(F,u-.04,u+.04,V-.5,V-.2,ZT+.2,lz1-.1,lin(0x3a3c3e));
   // The glazed ticket windows and their frames.
   for(const [b0,b1] of [[2.6,9.4],[13.8,20.4]]){T.glass.quad(F(b0,1.9,0),F(b1,1.9,0),F(b1,1.9,2.7),F(b0,1.9,2.7),lin(0x2b3a40),[0,1,0]);T.glass.quad(F(b0,-1.9,0),F(b1,-1.9,0),F(b1,-1.9,2.7),F(b0,-1.9,2.7),lin(0x2b3a40),[0,-1,0]);
    T.glass.quad(F(b0,-1.9,0),F(b0,1.9,0),F(b0,1.9,2.7),F(b0,-1.9,2.7),lin(0x2b3a40),[-1,0,0]);T.glass.quad(F(b1,-1.9,0),F(b1,1.9,0),F(b1,1.9,2.7),F(b1,-1.9,2.7),lin(0x2b3a40),[1,0,0]);
    T.concrete.box(F,b0,b1,-1.9,1.9,2.7,ZB,c,{bottom:true});
    for(let u=b0;u<=b1+.01;u+=(b1-b0)/5)for(const s of [-1,1])T.metal.box(F,u-.05,u+.05,s*1.9-.05,s*1.9+.05,0,2.7,lin(0x38404a));
    for(const s of [-1,1])T.metal.box(F,b0,b1,s*1.9-.05,s*1.9+.05,.95,1.05,lin(0x38404a));
    {const c=F(b0+2.7,1.97,0);board(c[0],c[1],[0,1],3,zf+2.05,zf+2.6,AT.bilheteria);}
    lamps.push({p:F((b0+b1)/2,2.6,2.9),c:[1,.82,.6],i:.8,s:.22});}
   // Turnstiles between the windows.
   for(let u=10.2;u<13.2;u+=.9)T.metal.box(F,u-.1,u+.1,-.4,.4,0,1,lin(0x8a9096));
   for(const u of [3,8,13,18,22.6])lamps.push({p:F(u,V+.2,ZB-.1),c:[1,.85,.62],i:.9,s:.2});
   floods.push({p:F(12,10,.3),c:[1,.9,.75],s:3.6});
   prism([F(0,-V,0),F(23.6,-V,0),F(23.6,V,0),F(0,V,0)].map(p=>p.slice(0,2)),zf-1,zf+ZT+1.5,'portico');
   clear(ZOO.x+12,ZOO.y,13);clear(ZOO.x+12,ZOO.y+9,9);sight(7240,7345,ZOO.x+9,ZOO.y+2,10);}
  // ---------- The board by the roundabout (facing the cars coming from the east), on two posts, lit.
  {const [tx,ty]=TOTEM,h=Math.atan2(-322-ty,-2672-tx),f=frame(tx,ty,gAt(tx,ty),h-Math.PI/2),o=sub(f(0,1,0),f(0,0,0)),w=5.8,z0=1.1,z1=z0+w*336/1024;
   {const c=f(0,.06,0);board(c[0],c[1],o,w,c[2]+z0,c[2]+z1,AT.totem);}T.paint.box(f,-w/2-.08,w/2+.08,-.06,.05,z0-.08,z1+.08,lin(0x23282a));
   for(const u of [-w/2+.5,w/2-.5])T.metal.box(f,u-.09,u+.09,-.09,.09,-.5,z0,lin(0x2a2e30));
   for(const u of [-1.6,1.6]){lamps.push({p:f(u,1.3,.35),c:[1,.95,.85],i:.7,s:.14});T.paint.box(f,u-.12,u+.12,1.15,1.45,-.1,.3,lin(0x3a3d40));}
   clear(tx,ty,4.5);}
  // ---------- The canopy over Portaria I's road (the cadastre's lens): a thin metal roof on round columns, the white
  // fascia, the light ceiling; the booths on both sides of the road, the barrier arms, PORTARIA 1 over the way in.
  const aq=marks.aquario;
  if(aq?.outline?.length>3){
   const out=aq.outline.slice(0,aq.outline[0][0]===aq.outline.at(-1)[0]&&aq.outline[0][1]===aq.outline.at(-1)[1]?-1:undefined),zc=Math.min(...out.map(p=>gAt(p[0],p[1]))),h=aq.heading??0;
   const C=frame(aq.x,aq.y,zc,h),zr=Math.max(5.2,(aq.height??5.9)-.2),grey=lin(0x8d9196),fascia=lin(0xe9e8e3);
   T.metal.flat(out,p=>[p[0],p[1],zc+zr+.32],grey,[0,0,1]);T.paint.flat(out,p=>[p[0],p[1],zc+zr],lin(0xdedcd6),[0,0,-1]);
   for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length],o=edgeOut(a,b),sgn=inside((a[0]+b[0])/2+o[0]*.3,(a[1]+b[1])/2+o[1]*.3,out)?-1:1;T.paint.quad([a[0],a[1],zc+zr-.1],[b[0],b[1],zc+zr-.1],[b[0],b[1],zc+zr+.5],[a[0],a[1],zc+zr+.5],fascia,[o[0]*sgn,o[1]*sgn,0]);}
   for(const u of [-10.5,-4.6,4.6,10.5])for(const v of [-3,3]){const g0=C(u,v,0);T.metal.post([g0[0],g0[1],gAt(g0[0],g0[1])-.3],[g0[0],g0[1],zc+zr],.14,.14,mobile?6:8,lin(0xbfc3c6),{smooth:true});}
   for(const s of [-1,1]){const b0=s*5.2,b1=s*9.2,bb=frame(...C(0,0,0).slice(0,2),gAt(...C(s*7.2,0,0).slice(0,2)),h);
    T.paint.box(bb,Math.min(b0,b1),Math.max(b0,b1),-2.2,2.2,-.4,2.8,lin(0x8f4a32),{bottom:false});T.paint.box(bb,Math.min(b0,b1)-.2,Math.max(b0,b1)+.2,-2.4,2.4,2.8,3.05,lin(0xe8e6df));
    const fu=s*5.18,o=[Math.cos(h)*-s,Math.sin(h)*-s,0];T.glass.quad(bb(fu,-1.6,.95),bb(fu,1.6,.95),bb(fu,1.6,2.3),bb(fu,-1.6,2.3),lin(0x2c3d44,.9),o);
    {const c=bb(s*5.16,0,0);board(c[0],c[1],o,3,c[2]+2.35,c[2]+2.75,AT.bilheteria);}
    lamps.push({p:bb(s*4.6,0,2.6),c:[1,.85,.62],i:.8,s:.22});
    // The barrier arm across half the road (red and white).
    for(let k=0;k<6;k++)T.paint.box(bb,s*(4.9-k*.72)-.36,s*(4.9-k*.72)+.36,2.6,2.75,.95,1.08,k%2?lin(0xf2f2ee):lin(0xc8241c));}
   {const fn=sub(C(0,1,0),C(0,0,0)),c=C(0,6.4,0);board(c[0],c[1],fn,6,zc+zr-.02,zc+zr+.48,AT.portaria);}
   floods.push({p:C(0,0,zr-.6),c:[1,.9,.75],s:2.6});
   prism(out,zc-1,zc+zr+.6,'portaria');clear(aq.x,aq.y,16);zoo.canopy={floor:+zc.toFixed(2),roof:+(zc+zr).toFixed(2)};
  }
  // ---------- On the roundabout's island: a low white wall, the name in a dark green band, turned to the cars from the east.
  {const [ix,iy]=ISLAND,o=unit([-2600-ix,-318-iy,0]),h=Math.atan2(o[1],o[0]),z=gAt(ix,iy),F=frame(ix,iy,z,h),w=11,c=lin(0xe9e6dd),green=lin(0x1d4a32);
   const zl=1.95,lh=(w-.9)*96/1024;T.concrete.box(F,-.35,.35,-w/2,w/2,-.5,zl+lh+.45,c);T.paint.box(F,.35,.39,-w/2+.25,w/2-.25,zl-.12,zl+lh+.1,green,{top:false});
   board(ix+o[0]*.4,iy+o[1]*.4,o,w-.9,z+zl,z+zl+lh,AT.zooLetters);
   for(const v of [-3.5,0,3.5]){lamps.push({p:F(1.6,v,.25),c:[1,.95,.85],i:.75,s:.14});T.paint.box(F,1.45,1.75,v-.12,v+.12,-.1,.22,lin(0x3a3d40));}
   clear(ix,iy,8);}
  // ---------- The statues: the elephant (bronze-dark, on a low plinth) on the island, the jaguar on a tall one at the gate.
  {const [ex,ey]=ELEPHANT,he=Math.atan2(-318-ey,-2600-ex),z=gAt(ex,ey),E=frame(ex,ey,z,he),col=lin(0x5d5448),plinth=lin(0xbdb8ab);
   T.concrete.box(E,-2.4,2.4,-1.5,1.5,-.4,.5,plinth);const P=(u,v,zz)=>E(u,v,.5+zz);
   T.metal.post(P(-1.4,0,2.15),P(1.2,0,2.25),1.05,.98,N,col,{smooth:true,sx:1.18});T.metal.post(P(-1.6,0,2.15),P(-1.4,0,2.15),.6,1.05,N,col,{smooth:true});T.metal.post(P(1.2,0,2.25),P(1.4,0,2.2),.98,.5,N,col,{smooth:true});
   for(const [u,v] of [[-.95,.55],[-.95,-.55],[.85,.55],[.85,-.55]])T.metal.post(P(u,v,0),P(u,v,1.6),.36,.4,mobile?5:7,col,{smooth:true});
   T.metal.post(P(1.5,0,2.55),P(2.15,0,2.75),.62,.5,N,col,{smooth:true});
   const trunk=[[2.4,0,2.6],[2.75,0,2.1],[2.9,0,1.4],[2.85,0,.75],[3.05,0,.35]];for(let i=0;i<trunk.length-1;i++)T.metal.post(P(...trunk[i]),P(...trunk[i+1]),.24-i*.04,.2-i*.04,mobile?5:7,col,{smooth:true});
   for(const s of [-1,1]){T.metal.quad(P(1.85,s*.5,3.25),P(1.6,s*1.55,3.05),P(1.5,s*1.45,1.75),P(1.85,s*.55,2.1),mul(col,.92),[0,s,0]);T.metal.quad(P(1.85,s*.5,3.25),P(1.6,s*1.55,3.05),P(1.5,s*1.45,1.75),P(1.85,s*.55,2.1),mul(col,.92),[0,-s,0]);
    T.paint.post(P(2.35,s*.32,2.2),P(2.95,s*.42,1.85),.08,.03,5,lin(0xe9e2cf));}
   T.metal.post(P(-1.65,0,2.6),P(-1.95,0,1.4),.07,.04,4,col);clear(ex,ey,5);}
  {const [jx,jy]=JAGUAR,z=gAt(jx,jy),J=frame(jx,jy,z,Math.PI/2+.5),col=lin(0x6a5232),plinth=lin(0xbdb8ab);
   T.concrete.box(J,-1.3,1.3,-.6,.6,-.4,1.4,plinth);const P=(u,v,zz)=>J(u,v,1.4+zz);
   T.metal.post(P(-.75,0,.62),P(.6,0,.68),.3,.3,N,col,{smooth:true,sx:1.1});T.metal.post(P(.6,0,.7),P(.95,0,.95),.22,.18,N,col,{smooth:true});
   for(const [u,v] of [[-.6,.16],[-.6,-.16],[.45,.17],[.45,-.17]])T.metal.post(P(u,v,0),P(u,v,.55),.08,.1,5,col);
   const tail=[[-.8,0,.62],[-1.25,0,.45],[-1.45,.1,.12]];for(let i=0;i<2;i++)T.metal.post(P(...tail[i]),P(...tail[i+1]),.06,.05,5,col);clear(jx,jy,3.5);}
  // ---------- The giraffes' paddock up the slope east of the road: a timber fence, the tall house, a feeder; two giraffes.
  {const {x:px,y:py,a,b}=PADDOCK,n=mobile?20:32,ring=Array.from({length:n},(_,i)=>{const t=i*TAU/n,x=px+a*Math.cos(t),y=py+b*Math.sin(t);return [x,y,gAt(x,y)];}),wood=lin(0x7a5b3a);
   for(let i=0;i<n;i++){const p=ring[i],q=ring[(i+1)%n];T.paint.post([p[0],p[1],p[2]-.3],[p[0],p[1],p[2]+1.9],.09,.08,4,wood);for(const zz of [.8,1.6])both(T.paint,[p[0],p[1],p[2]+zz],[q[0],q[1],q[2]+zz],[q[0],q[1],q[2]+zz+.14],[p[0],p[1],p[2]+zz+.14],wood);}
   const hx=px+7,hy=py-9.5,hz=Math.min(gAt(hx-4,hy-3),gAt(hx+4,hy+3)),H=frame(hx,hy,hz,0),tim=lin(0x8a6a44),thatch=lin(0x8f7a4c);
   T.paint.box(H,-4,4,-3,3,-.6,4.4,tim,{top:false});T.paint.box(H,-1,1,2.95,3.08,0,3.6,lin(0x26201a),{top:false});
   const apex=H(0,0,7.2);for(const [p,q] of [[H(-4.6,-3.6,4.2),H(4.6,-3.6,4.2)],[H(4.6,-3.6,4.2),H(4.6,3.6,4.2)],[H(4.6,3.6,4.2),H(-4.6,3.6,4.2)],[H(-4.6,3.6,4.2),H(-4.6,-3.6,4.2)]])triOut(T.paint,p,q,apex,thatch,sub([(p[0]+q[0])/2,(p[1]+q[1])/2,0],[hx,hy,0]));
   const fx=px+4+2.2*Math.cos(2.4),fy=py-3+2.2*Math.sin(2.4),fz=gAt(fx,fy);T.paint.post([fx,fy,fz-.3],[fx,fy,fz+4.2],.1,.1,5,wood);T.paint.post([fx,fy,fz+4.1],[fx,fy,fz+4.9],.3,.45,6,lin(0x6b7a3a));
   giraffe([px-4,py+1.5],1.29,5.6,0);giraffe([px+4,py-3],2.4,5.1,1.7);
   clear(px,py,a+3);clear(hx,hy,7);sight(7220,7345,px-2,py+2,6);zoo.paddock={ground:+gAt(px,py).toFixed(2)};}
  // A giraffe at (x, y) facing h: legs, the sloping body, the neck and head that sway, the ossicones, the tail.
  function giraffe([x,y],h,height,phase){
   const z=gAt(x,y)-.05,G=frame(x,y,z,h),k=height/5.6,start=T.giraffes.vertices,col=[1,1,1],dark=lin(0x3a2a1c),P=(u,v,zz)=>G(u*k,v*k,zz*k);
   const uvOf=p=>{const q=sub(p,G(0,0,0));return [(q[0]*.7+q[1]*.45)/1.2,q[2]/1.2];};
   const part=(p,q,r0,r1,n,c=col)=>{const b=T.giraffes.vertices;T.giraffes.post(p,q,r0*k,r1*k,n,c,{smooth:true});for(let i=b;i<T.giraffes.vertices;i++){const pp=[T.giraffes.p[i*3],-T.giraffes.p[i*3+2],T.giraffes.p[i*3+1]],[s,t]=uvOf(pp);T.giraffes.t[i*2]=s;T.giraffes.t[i*2+1]=t;}};
   for(const [u,v,top] of [[.75,.24,2.05],[.75,-.24,2.05],[-.7,.22,1.85],[-.7,-.22,1.85]]){part(P(u,v,0),P(u,v,.5),.08,.07,5,dark);part(P(u,v,.5),P(u*.97,v,top),.09,.13,6);}
   part(P(-1,0,2.15),P(.95,0,2.45),.42,.48,N);part(P(-1.18,0,2.12),P(-1,0,2.15),.2,.42,N);
   // The neck, the head, its horns and ears turn together about the neck's base (sway weight 1); body, legs, tail stay.
   const neckFrom=T.giraffes.vertices;
   part(P(.85,0,2.5),P(1.55,0,4.7),.3,.14,N);part(P(1.45,0,4.75),P(2.05,0,4.55),.14,.07,N);
   for(const s of [-1,1]){part(P(1.5,s*.07,4.8),P(1.45,s*.09,5.05),.03,.035,4,dark);part(P(1.52,s*.13,4.72),P(1.38,s*.24,4.78),.04,.01,4);}
   const neckTo=T.giraffes.vertices;
   part(P(-1.15,0,2.3),P(-1.3,0,1.3),.03,.02,4,dark);
   const pivot=P(.85,0,2.5),axis=unit(sub(G(0,1,0),G(0,0,0))),piv=[pivot[0],pivot[2],-pivot[1]],ax=[axis[0],axis[2],-axis[1]];
   const ex=T.giraffes.extra??=[];for(let i=start;i<T.giraffes.vertices;i++)ex.push(...piv,...ax,i>=neckFrom&&i<neckTo?1:0,phase);
  }
  // ---------- The Aquário where it stands, 530 m inside (OSM): two floors of dark green panels in an exposed concrete frame,
  // a pergola of beams on the roof, the round tank; glass at the entrance.
  {const out=AQUARIO,z=Math.min(...out.map(p=>gAt(p[0],p[1]))),zt=z+8.4,green=lin(0x2f6b45),conc=lin(0xc9c7bf);
   T.concrete.flat(out,p=>[p[0],p[1],zt],conc,[0,0,1]);
   for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length],o=edgeOut(a,b),sg=inside((a[0]+b[0])/2+o[0]*.3,(a[1]+b[1])/2+o[1]*.3,out)?-1:1,on=[o[0]*sg,o[1]*sg,0],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const at=(t,zz)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),zz];
    T.paint.quad(at(0,z-.6),at(1,z-.6),at(1,z+.9),at(0,z+.9),conc,on);T.paint.quad(at(0,z+.9),at(1,z+.9),at(1,z+3.4),at(0,z+3.4),green,on);T.concrete.quad(at(0,z+3.4),at(1,z+3.4),at(1,z+4.2),at(0,z+4.2),conc,on);
    T.paint.quad(at(0,z+4.2),at(1,z+4.2),at(1,z+7.6),at(0,z+7.6),mul(green,1.08),on);T.concrete.quad(at(0,z+7.6),at(1,z+7.6),at(1,zt),at(0,zt),conc,on);
    for(let t=0;t<=1.001;t+=1/Math.max(1,Math.round(len/6))){const p=at(t,0),f=frame(p[0],p[1],z,Math.atan2(b[1]-a[1],b[0]-a[0]));T.concrete.box(f,-.25,.25,-.3,.3,-.5,zt+.9-z,conc);}}
   for(let x=-2705;x<-2656;x+=4){const ys=[];for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length];if((a[0]>x)!==(b[0]>x))ys.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}ys.sort((a,b)=>a-b);for(let k=0;k+1<ys.length;k+=2)T.concrete.box(frame(x,0,zt,0),-.2,.2,ys[k]+.3,ys[k+1]-.3,.2,.75,conc);}
   T.concrete.post([-2701,-971,z-.5],[-2701,-971,z+9.6],6,6,mobile?14:24,conc,{smooth:true});
   T.glass.quad([-2698.3,-943.05,z],[-2668,-943.7,z],[-2668,-943.7,z+3.2],[-2698.3,-943.05,z+3.2],lin(0x2a3a3c,.8),[0,1,0]);
   zoo.aquario={ground:+z.toFixed(2)};}
  zoo.giraffes=2;stats.zoo=zoo;
 }

 // ========== The Parque Ecológico
 function buildPark(){
  const pe=marks.parque_ecologico,park={};
  if(!pe?.outline)return;
  const PARK=pe.outline;
  // Drowned? The track file's lake over the park (its ground dug to the lake bed): then the island is drawn here.
  const probe=[[-1800,-850],[-1773,-560],[-1780,-400],[-1820,-150],[-1700,-260],[-1640,180]].map(([x,y])=>gAt(x,y)).sort((a,b)=>a-b);
  const drowned=probe[probe.length>>1]<W+.5;park.drowned=drowned;
  const WP=W+4.2;
  // The island's ground: the bank out of the water, the lawn 4.2..5.5 m over the lake (lower at the south gate), a slow
  // undulation inland; the apron to the lap; the pond sunk in its banks.
  function islandH(x,y){
   const dP=polyDist(x,y,PARK),dA=polyDist(x,y,APRON);let h=-Infinity;
   if(dP>-12){const plateau=4.2+1.3*sstep(-1000,-850,y);h=dP>=0?W+.9+plateau*sstep(0,26,dP)+1.4*(fbm(x/70,y/70)-.5)*sstep(15,50,dP):W+.9+dP*.42;}
   if(dA>-12)h=Math.max(h,dA>=0?W+.9+3.4*sstep(0,12,dA):W+.9+dA*.42);
   if(h>-Infinity&&Math.abs(y+340)<45&&x>-1880&&x<-1660){const dW=polyDist(x,y,POND),bank=WP-.9;if(dW>=0)h=bank-Math.min(dW*.08,.6);else if(dW>-9)h=lerp(bank,h,sstep(0,9,-dW));}
   return h;
  }
  const gP=drowned?(x,y)=>Math.max(islandH(x,y),gAt(x,y)):gAt;park.gate=+gP(GATE.x,GATE.y).toFixed(2);
  if(drowned){
   // ---------- The island's ground mesh: cells over the park and the apron where it stands proud of the track file's
   // ground, none in the lap's driving space.
   const plan=planTexture(mobile),groundM=groundMaterial(plan),G=new Batch(),st=mobile?10:5,verts=new Map(),key=(i,j)=>i*8192+j;
   const nx=Math.ceil((PLAN.x1-PLAN.x0)/st),ny=Math.ceil((PLAN.y1-PLAN.y0)/st);
   const vtx=(i,j)=>{const k=key(i,j);let q=verts.get(k);if(!q){const x=PLAN.x0+i*st,y=PLAN.y0+j*st,ih=islandH(x,y),g=gAt(x,y);q={x,y,h:Math.max(ih,g+.03),proud:ih>g+.08,near:ih>-Infinity};verts.set(k,q);}return q;};
   const uv=q=>[(q.x-PLAN.x0)/(PLAN.x1-PLAN.x0),(q.y-PLAN.y0)/(PLAN.y1-PLAN.y0)],shade=p=>{const k=.96+.08*fbm(p[0]/23,p[1]/23);return [k,k,k];};
   let cells=0;
   for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const c=[vtx(i,j),vtx(i+1,j),vtx(i+1,j+1),vtx(i,j+1)];
    if(!c.some(q=>q.proud)||!c.every(q=>q.near))continue;if(!c.every(q=>lap.free(q.x,q.y,1.5)))continue;
    G.quad(...c.map(q=>[q.x,q.y,q.h]),shade,[0,0,1],c.map(uv));cells++;}
   const gm=G.mesh('Parques_ilha',groundM,false);root.add(gm);park.island={cells,triangles:G.triangles,step:st};islandBatch=G;
   // The pond's water in its banks.
   T.water.flat(POND,p=>[p[0],p[1],WP],lin(0x3d5a4a,.75),[0,0,1]);
  }else{
   // The park on dry ground (the track file's lake leaves it): the pond's water where the laser read it (~806.6 m, the
   // terrain lies flat on it; the 5 m grid brings the banks in at the edges), a hand over the typical ground inside, in
   // a low concrete kerb that hides the sheet's edge.
   const xs=POND.map(p=>p[0]),ys=POND.map(p=>p[1]),hs=[];
   for(let x=Math.min(...xs);x<=Math.max(...xs);x+=2.5)for(let y=Math.min(...ys);y<=Math.max(...ys);y+=2.5)if(inside(x,y,POND))hs.push(gAt(x,y));
   if(hs.length){hs.sort((a,b)=>a-b);const zw=hs[Math.floor(hs.length*.4)]+.08,kerb=lin(0xa7a497);T.water.flat(POND,p=>[p[0],p[1],zw],lin(0x3d5a4a,.75),[0,0,1]);
    for(let i=0,j=POND.length-1;i<POND.length;j=i++){const a=POND[j],c=POND[i],len=Math.hypot(c[0]-a[0],c[1]-a[1]),F=frame((a[0]+c[0])/2,(a[1]+c[1])/2,zw,Math.atan2(c[1]-a[1],c[0]-a[0]));
     T.paint.box(F,-len/2-.25,len/2+.25,-.3,.3,-.9,.12,kerb);}
    park.pond=+zw.toFixed(2);}
  }
  // ---------- The gate: a white concrete frame over the road (u east along the road, v north): the slab and its deep
  // fascia, the end walls, slender columns, two dark slatted booths, the barrier; the letters on the south wall.
  {const zg=Math.min(gP(GATE.x-6,GATE.y-13),gP(GATE.x+6,GATE.y+13),gP(GATE.x,GATE.y)),F=frame(GATE.x,GATE.y,zg,0),wh=lin(0xf3f2ee),soffit=lin(0xd9d8d2),wood=lin(0x4a3424);
   const U0=-6.75,U1=6.75,V0=-13.9,V1=13.9,Z0=6,Z1=6.95;
   T.paint.box(F,U0,U1,V0,V1,Z0,Z1,wh,{bottom:false});T.paint.quad(F(U0,V0,Z0),F(U1,V0,Z0),F(U1,V1,Z0),F(U0,V1,Z0),soffit,[0,0,-1]);
   T.paint.box(F,U0,U1,V0,V0+.8,-.8,Z0,wh,{top:false});T.paint.box(F,U0,U1,V1-.8,V1,-.8,Z0,wh,{top:false});
   for(const u of [-4.6,4.6])for(const v of [-7.2,-1.2,4.8])T.paint.post(F(u,v,-.4),F(u,v,Z0),.17,.17,mobile?6:10,wh,{smooth:true});
   const slats=(u0,u1,v0,v1)=>{T.paint.box(F,u0,u1,v0,v1,-.3,3.1,wood,{top:true});for(let u=u0+.25;u<u1;u+=.5)for(const v of [v0-.03,v1+.03])T.paint.box(F,u-.05,u+.05,v-.02,v+.02,.1,3,mul(wood,.7));};
   slats(-4.2,1.2,6.4,12.6);slats(-1,4.2,-12.6,-7.6);
   T.glass.quad(F(1.2,7,.9),F(1.2,12,.9),F(1.2,12,2.6),F(1.2,7,2.6),lin(0x2c3a40),[1,0,0]);T.glass.quad(F(-1,-8,.9),F(-1,-12,.9),F(-1,-12,2.6),F(-1,-8,2.6),lin(0x2c3a40),[-1,0,0]);
   for(let k=0;k<7;k++)T.paint.box(F,3.4-.06,3.4+.06,-6.8+k*.95,-6.8+(k+1)*.95,.95,1.1,k%2?lin(0x1d1d1d):lin(0xf2c21b));
   // PARQUE ECOLÓGICO on the south wall, toward the lap; a green signpost with its bird at the south-west corner.
   {const c=F(U1+.03,0,0);board(c[0],c[1],[1,0],22,zg+Z0+.12,zg+Z0+.12+22*46/1024,AT.parkLine);}
   const o=[0,-1,0];sign(F(-6.3,V0-.03,2.35),F(6.3,V0-.03,2.35),F(6.3,V0-.03,4.68),F(-6.3,V0-.03,4.68),AT.parkLetters,o);
   const sp=F(-8.6,-15.5,0),spz=gP(sp[0],sp[1]),S=frame(sp[0],sp[1],spz,0),green=lin(0x3f8a2e);
   T.paint.box(S,-.16,.16,-.16,.16,-.4,7.4,green);T.paint.box(S,.16,.3,-.7,.7,4.4,5.9,lin(0x2f6b25));
   sign(S(.31,-.65,4.45),S(.31,.65,4.45),S(.31,.65,5.85),S(.31,-.65,5.85),AT.parkSign,[1,0,0]);
   for(const s of [-1,1])T.paint.quad(S(0,0,7.4),S(-.2,s*.9,7.95),S(.35,s*1.15,8.15),S(.25,s*.15,7.55),lin(0x4fb3a0),[0,0,1]);T.paint.post(S(-.05,0,7.35),S(.5,0,7.6),.1,.06,5,lin(0x4fb3a0));
   // The map board inside the gate.
   {const M=frame(GATE.x+11,GATE.y+4,gP(GATE.x+11,GATE.y+4),0);T.paint.box(M,-.06,.06,-.05,.05,-.3,2.6,green);T.paint.box(M,-.04,.04,-.8,.8,1,2.6,lin(0x2f6b25));sign(M(-.05,.75,1.05),M(-.05,-.75,1.05),M(-.05,-.75,2.55),M(-.05,.75,2.55),AT.parkSign,[-1,0,0]);}
   floods.push({p:F(-3.5,-19,.3),c:[1,.93,.82],s:3},{p:F(3.5,-19,.3),c:[1,.93,.82],s:3},{p:F(0,0,Z0-.4),c:[1,.88,.7],s:3.4});
   for(const [u,v] of [[-3.5,-18.8],[3.5,-18.8]])T.paint.box(frame(...F(u,v,0).slice(0,2),gP(...F(u,v,0).slice(0,2)),0),-.15,.15,-.12,.12,-.2,.25,lin(0x45484c));
   for(const v of [-10,-4,2,8])lamps.push({p:F(0,v,Z0-.15),c:[1,.86,.64],i:.9,s:.22});
   prism([[U0,V0],[U1,V0],[U1,V1],[U0,V1]].map(([u,v])=>F(u,v,0).slice(0,2)),zg-1,zg+Z1,'portao');
   clear(GATE.x,GATE.y,17);sight(5380,5500,GATE.x,GATE.y-8,10);sight(5180,5330,GATE.x+6,GATE.y,10);park.gateFloor=+zg.toFixed(2);}
  // ---------- The Centro de Apoio by the pond: two white blocks (the west one taller, its end wall the green mural facing
  // the west lap), a band of dark glass to the pond, a dark wooden stretch, the water tower, flagpoles.
  {const zA=Math.min(...CENTRO_A.map(p=>gP(p[0],p[1]))),zB=Math.min(...CENTRO_B.map(p=>gP(p[0],p[1]))),wh=lin(0xf1f0eb);
   const block=(pts,z,hgt,col)=>{T.paint.flat(pts,p=>[p[0],p[1],z+hgt],lin(0xb9b8b2),[0,0,1]);for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],o=edgeOut(a,b),sg=inside((a[0]+b[0])/2+o[0]*.3,(a[1]+b[1])/2+o[1]*.3,pts)?-1:1;T.paint.quad([a[0],a[1],z-.6],[b[0],b[1],z-.6],[b[0],b[1],z+hgt+.4],[a[0],a[1],z+hgt+.4],col,[o[0]*sg,o[1]*sg,0]);}};
   block(CENTRO_A,zA,5.4,wh);block(CENTRO_B,zB,3.6,wh);
   // The mural on A's west end (x = -1804): 14.4 m × 5.4 m.
   board(-1804.12,-359.8,[-1,0],14.4,zA+.1,zA+5.75,AT.mural);
   T.glass.quad([-1790,-366.95,zB+.9],[-1722,-366.1,zB+.9],[-1722,-366.1,zB+2.7],[-1790,-366.95,zB+2.7],lin(0x26323a),[0,1,0]);
   T.glass.quad([-1800,-352.5,zA+.9],[-1772,-352.7,zA+.9],[-1772,-352.7,zA+3],[-1800,-352.5,zA+3],lin(0x26323a),[0,1,0]);
   T.paint.quad([-1745,-378.95,zB],[-1730,-378.85,zB],[-1730,-378.85,zB+3.9],[-1745,-378.95,zB+3.9],lin(0x3b2a1e),[0,-1,0]);
   const tw=frame(-1719,-370,zB,0);T.paint.box(tw,-1.6,1.6,-1.6,1.6,0,9.6,wh);T.paint.box(tw,-1.65,1.65,-1.65,1.65,7.8,8.9,lin(0x8d9094),{top:false});
   const flags=[[lin(0x2f8f3a),lin(0xf2d22e)],[lin(0xf4f4f0),lin(0xc4282b)],[lin(0x2a59a8),lin(0xf4f4f0)]];
   flags.forEach(([a,b],k)=>{const fx=-1810.5,fy=-349-k*3.2,fz=gP(fx,fy);T.metal.post([fx,fy,fz-.3],[fx,fy,fz+9.5],.06,.045,5,lin(0xd5d8da));
    T.paint.quad([fx,fy,fz+8],[fx-2.6,fy+.15,fz+8.05],[fx-2.6,fy+.15,fz+9.3],[fx,fy,fz+9.3],a,null);T.paint.quad([fx-.7,fy+.04,fz+8.35],[fx-1.9,fy+.11,fz+8.4],[fx-1.9,fy+.11,fz+8.95],[fx-.7,fy+.04,fz+8.95],b,[0,1,0]);T.paint.quad([fx-.7,fy+.04,fz+8.35],[fx-1.9,fy+.11,fz+8.4],[fx-1.9,fy+.11,fz+8.95],[fx-.7,fy+.04,fz+8.95],b,[0,-1,0]);});
   floods.push({p:[-1812,-360,zA+.3],c:[.95,1,.92],s:2.6});
   lamps.push({p:[-1800,-352,zA+3.4],c:[1,.86,.64],i:.7,s:.18},{p:[-1760,-366,zB+3],c:[1,.86,.64],i:.7,s:.18},{p:[-1730,-366,zB+3],c:[1,.86,.64],i:.7,s:.18});
   prism(CENTRO_A,zA-1,zA+5.8,'centro_a');clear(-1770,-366,30);clear(-1735,-372,22);
   sight(6280,6440,-1806,-360,14);park.centro={floorA:+zA.toFixed(2),floorB:+zB.toFixed(2)};}
  // ---------- The bandstand at the hub of the paths: an octagonal platform, eight white posts, a pointed red roof.
  {const [cx,cy]=CORETO,z=gP(cx,cy),n=8,ring=(r,zz)=>Array.from({length:n},(_,i)=>{const t=i*TAU/n+Math.PI/8;return [cx+Math.cos(t)*r,cy+Math.sin(t)*r,z+zz];});
   T.concrete.post([cx,cy,z-.5],[cx,cy,z+.7],6.3,6.3,n,lin(0xd8d4c8),{rot:Math.PI/8});
   for(const p of ring(5.7,.7))T.paint.post(p,[p[0],p[1],z+3.6],.13,.11,6,lin(0xf2f1ec));
   const eave=ring(6.6,3.6),apex=[cx,cy,z+6.2];for(let i=0;i<n;i++){const e0=eave[i],e1=eave[(i+1)%n],o=[(e0[0]+e1[0])/2-cx,(e0[1]+e1[1])/2-cy,0];triOut(T.paint,e0,e1,apex,lin(0xa8442e),[o[0],o[1],1]);T.paint.quad(e0,e1,[e1[0],e1[1],z+3.3],[e0[0],e0[1],z+3.3],lin(0xf2f1ec),o);}
   lamps.push({p:[cx,cy,z+3.2],c:[1,.85,.6],i:1,s:.3});clear(cx,cy,12);}
  // ---------- The red torii on the path along the Ressaca (a gate of the Japanese garden): posts, the black-capped
  // kasagi with lifted ends, the nuki, the plaque post; the blue wayfinding plates beside it.
  {const [tx,ty]=TORII,z=gP(tx,ty),F=frame(tx,ty,z,-.12),red=lin(0xa8232b),blk=lin(0x1c1c1c);
   for(const s of [-1,1])T.paint.post(F(s*2.3,0,-.4),F(s*2.2,0,4.4),.2,.17,mobile?6:10,red,{smooth:true});
   T.paint.box(F,-2.9,2.9,-.12,.12,3.45,3.72,red);T.paint.box(F,-.12,.12,-.08,.08,3.72,4.3,red);T.paint.box(F,-3.1,3.1,-.16,.16,4.3,4.6,red);
   const kas=[[-3.7,4.85],[-2.6,4.62],[2.6,4.62],[3.7,4.85]];for(let i=0;i<3;i++){const [u0,z0]=kas[i],[u1,z1]=kas[i+1];T.paint.quad(F(u0,-.24,z0),F(u1,-.24,z1),F(u1,-.24,z1+.24),F(u0,-.24,z0+.24),blk,[0,-1,0]);T.paint.quad(F(u0,.24,z0),F(u1,.24,z1),F(u1,.24,z1+.24),F(u0,.24,z0+.24),blk,[0,1,0]);T.paint.quad(F(u0,-.24,z0+.24),F(u1,-.24,z1+.24),F(u1,.24,z1+.24),F(u0,.24,z0+.24),blk,[0,0,1]);T.paint.quad(F(u0,-.24,z0),F(u1,-.24,z1),F(u1,.24,z1),F(u0,.24,z0),red,[0,0,-1]);}
   const sp=F(-3.6,-1,0);T.paint.box(frame(sp[0],sp[1],z,0),-.06,.06,-.06,.06,-.3,2.3,lin(0x25282a));for(let k=0;k<3;k++)T.paint.box(frame(sp[0],sp[1],z,0),.06,.1,-.55,.55,1.5+k*.28,1.72+k*.28,lin(0x1f4f8a));
   clear(tx,ty,6);sight(6370,6470,tx,ty,5);}
  // ---------- The Memorial Minas-Japão (2008, the centenary of Japanese immigration): the white drum standing in the long
  // reflecting pool, its floor a swirl, the white ribbon walls curving down to it from both sides along the brick ramps.
  {const [dx,dy]=MEMO.drum,z=gP(dx,dy),wl=z-.25,ax=unit([MEMO.south[0]-MEMO.north[0],MEMO.south[1]-MEMO.north[1],0]),nrm=[-ax[1],ax[0]],hw=MEMO.width/2;
   const corner=(e,s)=>[e[0]+nrm[0]*hw*s,e[1]+nrm[1]*hw*s];const pool=[corner(MEMO.north,-1),corner(MEMO.north,1),corner(MEMO.south,1),corner(MEMO.south,-1)];
   T.water.flat(pool,p=>[p[0],p[1],wl],lin(0x2c4a50,.8),[0,0,1]);
   for(let i=0;i<4;i++){const a=pool[i],b=pool[(i+1)%4];T.concrete.wall([a,b],.45,()=>z-.8,()=>z+.12,lin(0xe6e3da));}
   const n=mobile?24:48,R=9;T.concrete.wall(Array.from({length:n+1},(_,i)=>{const t=i*TAU/n;return [dx+Math.cos(t)*R,dy+Math.sin(t)*R];}),.35,()=>z-.8,()=>z+4.4,lin(0xf3f1ea),{caps:false});
   const disc=Array.from({length:n},(_,i)=>{const t=i*TAU/n;return [Math.cos(t)*(R-.2),Math.sin(t)*(R-.2)];});
      T.signs.flat(disc,p=>[dx+p[0],dy+p[1],z+.55],white,[0,0,1],p=>regionUv(AT.swirl,.5+p[0]/(2*R),.5+p[1]/(2*R)));
   for(const rib of [MEMO.west,MEMO.east]){const L=rib.length;T.concrete.wall(rib,.32,i=>gP(...rib[i])-.6,i=>z+.9+3.4*Math.pow(i/(L-1),1.4),lin(0xf3f1ea));}
      lamps.push(...[0,1,2,3].map(k=>{const t=k*TAU/4+.8;return {p:[dx+Math.cos(t)*(R+1.2),dy+Math.sin(t)*(R+1.2),z+.4],c:[.95,.97,1],i:.6,s:.16};}));
   clear(dx,dy,24);clear((MEMO.north[0]+dx)/2,(MEMO.north[1]+dy)/2,16);clear((MEMO.south[0]+dx)/2,(MEMO.south[1]+dy)/2,16);park.memorial={floor:+z.toFixed(2)};}
  // ---------- The monument to Francisco Lins do Rêgo: a corten pillar holding a wide arc that lifts at both ends.
  {const [mx,my]=LINS,z=gP(mx,my),F=frame(mx,my,z,.3),cor=lin(0x5a3121);T.paint.box(F,-.5,.5,-.28,.28,-.5,4.8,cor);
   const seg=mobile?8:16;for(let i=0;i<seg;i++){const a=-1+2*i/seg,b=-1+2*(i+1)/seg,za=4.75+1.6*a*a,zb=4.75+1.6*b*b,ua=a*5.6,ub=b*5.6;
    T.paint.quad(F(ua,-.25,za),F(ub,-.25,zb),F(ub,-.25,zb+.5),F(ua,-.25,za+.5),cor,[0,-1,0]);T.paint.quad(F(ua,.25,za),F(ub,.25,zb),F(ub,.25,zb+.5),F(ua,.25,za+.5),cor,[0,1,0]);T.paint.quad(F(ua,-.25,za+.5),F(ub,-.25,zb+.5),F(ub,.25,zb+.5),F(ua,.25,za+.5),cor,[0,0,1]);T.paint.quad(F(ua,-.25,za),F(ub,-.25,zb),F(ub,.25,zb),F(ua,.25,za),cor,[0,0,-1]);}
   T.paint.box(F,-.4,.4,-.3,-.28,1.2,2.1,lin(0xd9d6cc));clear(mx,my,8);}
  // ---------- Lamps and benches along the main paths (a lamp every ~32 m, a bench by every other one).
  {const r=random(6061),green=lin(0x2d4a33),wood=lin(0x8a6a44);let k=0;
   for(const [wd,pts] of [PATHS[1],PATHS[7],PATHS[3]]){let acc=10;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),d=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[-d[1],d[0]];
     while(acc<len){const s=k%2?1:-1,x=a[0]+d[0]*acc+n[0]*s*(wd/2+.9),y=a[1]+d[1]*acc+n[1]*s*(wd/2+.9),z=gP(x,y);
      if(lap.free(x,y,4)){T.paint.post([x,y,z-.3],[x,y,z+4.3],.07,.05,5,green);T.paint.post([x,y,z+4.25],[x,y,z+4.75],.2,.12,6,lin(0x1f2a22));lamps.push({p:[x,y,z+4.45],c:[1,.82,.56],i:1,s:.24});
       if(k%2===0){const bx=x-n[0]*s*.2+d[0]*2.2,by=y-n[1]*s*.2+d[1]*2.2,h=Math.atan2(d[1],d[0]),Bf=frame(bx,by,gP(bx,by),h);T.paint.box(Bf,-.9,.9,-.22,.22,.42,.5,wood);T.paint.box(Bf,-.9,.9,s*.2-.04,s*.2+.04,.5,.9,wood);for(const u of [-.75,.75])T.paint.box(Bf,u-.05,u+.05,-.2,.2,-.2,.42,lin(0x55585a));}}
      k++;acc+=28+r()*8;}
     acc-=len;}}
   park.lamps=k;}
  // ---------- The park's trees (the land cover has none there: lawn in the track file): woods in the north half,
  // scattered over the lawns, never on the paths, the pond, the structures or the sight lines; one instanced draw.
  {
   const r=random(2003),spots=[],gap=mobile?13:9,clr=clearings.slice();
   const pathNear=(x,y,m)=>PATHS.some(([wd,pts])=>lineDist(x,y,pts)<wd/2+m)||lineDist(x,y,GATE_ROAD)<6;
   for(let x=PLAN.x0;x<PLAN.x1;x+=gap)for(let y=PLAN.y0;y<PLAN.y1;y+=gap){const px=x+(r()-.5)*gap*.9,py=y+(r()-.5)*gap*.9,dP=polyDist(px,py,PARK);if(dP<5)continue;
    const n=fbm(px/45,py/45),zone=py>330?.5:py>-300?(px>-1700&&py<-90?.25:.88):py>-430?.07:py>-760?.32:.13,p=zone*(.55+.9*n);if(r()>p)continue;
    if(polyDist(px,py,POND)>-6||pathNear(px,py,2.5)||clr.some(c=>Math.hypot(px-c.x,py-c.y)<c.r+2)||!lap.free(px,py,9))continue;
    spots.push([px,py,gP(px,py)]);}
   const max=mobile?420:1000;while(spots.length>max)spots.splice(Math.floor(r()*spots.length),1);
   const tree=treeGeometry(mobile),mat=new THREE.MeshStandardMaterial({name:'Parques_arvores',vertexColors:true,roughness:.92,metalness:0}),im=new THREE.InstancedMesh(tree,mat,spots.length);
   const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),c=new THREE.Color();
   spots.forEach(([x,y,z],i)=>{const woods=y>-300&&y<330,s=(woods?1.05:.8)+r()*.55,sy=s*(.85+r()*.35);e.set(0,r()*TAU,0);q.setFromEuler(e);m4.compose(new THREE.Vector3(x,z-.2,-y),q,new THREE.Vector3(s,sy,s));im.setMatrixAt(i,m4);
    const dry=r()<.12?.25:0;c.setRGB(.82+r()*.3+dry,.85+r()*.25+dry*.6,.8+r()*.25);im.setColorAt(i,c);});
   im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;im.castShadow=true;im.receiveShadow=true;im.name='Parques_arvores';im.computeBoundingSphere();root.add(im);
   park.trees=spots.length;park.treeTriangles=tree.index?tree.index.count/3*spots.length:tree.attributes.position.count/3*spots.length;treeMesh=im;
  }
  stats.park=park;
 }

 // ---------- Driving space: no vertex over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null};
 const check=(k,b)=>{for(let v=0;v<b.p.length;v+=3){const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}}};
 for(const [k,b] of Object.entries(T))check(k,b);
 if(islandBatch)check('ilha',islandBatch);
 // Trees: their trunks 9 m clear of the walls already; their crowns checked as 7 m discs.
 if(treeMesh){const im=treeMesh,m4=new THREE.Matrix4(),p=new THREE.Vector3();for(let i=0;i<im.count;i++){im.getMatrixAt(i,m4);p.setFromMatrixPosition(m4);drive.checked++;if(!lap.free(p.x,-p.z,7))drive.violations++;}}
 // The giraffes' sway attributes.
 if(T.giraffes.vertices){const b=T.giraffes,ex=b.extra??[],n=b.vertices,piv=new Float32Array(n*3),ax=new Float32Array(n*3),sw=new Float32Array(n*2);
  for(let i=0;i<n;i++){piv.set(ex.slice(i*8,i*8+3),i*3);ax.set(ex.slice(i*8+3,i*8+6),i*3);sw.set(ex.slice(i*8+6,i*8+8),i*2);}
  b.attrs={aPivot:piv,aAxis:ax,aSway:sw};}
 let drawCalls=0,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;const mesh=b.mesh('Parques_'+k,materials[k],k!=='paving'&&k!=='water'&&k!=='signs');
  if(b.attrs)for(const [name,arr] of Object.entries(b.attrs))mesh.geometry.setAttribute(name,new THREE.Float32BufferAttribute(arr,name==='aSway'?2:3));
  if(k==='giraffes'){mesh.geometry.boundingSphere.radius+=3;}
  root.add(mesh);drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 const island=root.getObjectByName('Parques_ilha');if(island){drawCalls++;triangles+=stats.park.island.triangles;parts.ilha=stats.park.island.triangles;}
 const trees=root.getObjectByName('Parques_arvores');if(trees){drawCalls++;parts.arvores=stats.park.treeTriangles;}
 // ---------- Night: the floods (uplights) wash the lit surfaces; the lamps glow.
 floods.slice(0,MAX_FLOODS).forEach((f,i)=>{U.pqFlood.value[i].set(f.p[0],f.p[2],-f.p[1],f.s);U.pqFloodCol.value[i].set(...f.c);});
 const night=lightUniforms(),glowLights=lamps.length?nightLights(lamps.map(l=>({...l,g:0,on:.3,ph:rand()})),night,{name:'Parques_luzes_noite',minPx:mobile?1.5:1.7,floor:.45,fogKeep:.5}):null;
 if(glowLights){root.add(glowLights.mesh);drawCalls++;}
 root.updateMatrixWorld(true);
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,driveSpace:drive,clearings:clearings.length,cameraObstacles:obstacles.length,lamps:lamps.length,floods:Math.min(floods.length,MAX_FLOODS),night:0});
 let lit=0;
 // 0 by day; dusk (.45) brings the lamps and the uplights; full at night lights the booths and the boards.
 function setNight(level){lit=level;U.pqNight.value=level>0?(level>=.99?1:.55):0;night.uNight.value=level;glow.uPqGlow.value=level*.9;materials.signs.emissiveIntensity=level*.35;if(glowLights)glowLights.mesh.visible=level>0;stats.night=level;}
 function update(dt){girTime.value+=dt;if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}
 return {root,obstacles,clearings,stats,setNight,update};
}

// A park tree: a trunk and three crown lobes (displaced icospheres), coloured per vertex (light tops, darker undersides);
// the instance colour varies the green. Unit size ~10 m tall, 8 m across.
function treeGeometry(mobile){
 const parts=[],r=random(31),trunk=new THREE.CylinderGeometry(.22,.38,4.2,mobile?5:7,1,true);trunk.translate(0,2.1,0);parts.push([trunk,[.32,.24,.16]]);
 for(const [x,y,z,s,d] of [[0,6.4,0,3.4,1],[1.6,5.4,.8,2.5,0],[-1.4,5.7,-1,2.6,0]]){const g=new THREE.IcosahedronGeometry(s,mobile?0:d),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i),k=1+(fbm(v.x*1.3+x*3,v.y*1.3+z*3)-.5)*.8+(hash(Math.round(v.x*4),Math.round(v.z*4+v.y*7))-.5)*.12;v.multiplyScalar(k);v.y*=.82;p.setXYZ(i,v.x+x,v.y+y,v.z+z);}
  parts.push([g,null,[x,y,z]]);}
 // Crowns shade as round masses (normals from their middles), not as facets.
 const geos=parts.map(([g,col,mid])=>{g=g.index?g.toNonIndexed():g;const p=g.attributes.position,c=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){let k;if(col)k=col;else{const t=clamp((p.getY(i)-3.5)/6,0,1),n=.62+r()*.5;k=[(.1+.07*t)*n,(.19+.11*t)*n,(.07+.035*t)*n];}c.set(k,i*3);}g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');g.computeVertexNormals();
  if(mid){const nr=g.attributes.normal;for(let i=0;i<p.count;i++){const v=unit([p.getX(i)-mid[0],(p.getY(i)-mid[1])*1.2+.6,p.getZ(i)-mid[2]]),f=[nr.getX(i),nr.getY(i),nr.getZ(i)],m=unit([v[0]*.75+f[0]*.25,v[1]*.75+f[1]*.25,v[2]*.75+f[2]*.25]);nr.setXYZ(i,...m);}}
  return g;});
 const pos=[],nor=[],col=[];for(const g of geos){pos.push(...g.attributes.position.array);nor.push(...g.attributes.normal.array);col.push(...g.attributes.color.array);}
 const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));out.setAttribute('color',new THREE.Float32BufferAttribute(col,3));out.computeBoundingSphere();return out;
}
