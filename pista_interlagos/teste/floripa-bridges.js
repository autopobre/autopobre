import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {lightUniforms,nightLights,waterGlints,screenHalf} from './sea-water.js';

// The bridges of the Floripa street circuit (data.scenery.bridges, gerar_floripa.py): the Hercílio Luz, whose deck
// the race starts on, and the Colombo Salles with its twin, the Pedro Ivo Campos. The road on them is the track's
// asphalt (open-circuit.js) and its Jersey walls (street-walls.js); this module builds the structures round and under
// them, from the published dimensions (scratch facts sheet, research 2026-10-11):
// - Hercílio Luz (1926): two rocker towers 74.2 m above the sea on concrete piers (+4.5 m), the eyebar chains in two
//   planes (links of four bars) on a parabola from the saddles (73.5 m) to midspan, which between the quarter points
//   ARE the top chord of the stiffening truss; outside them a straight top chord rises from the tower to the quarter
//   point with 7 hangers per outer quarter and side. Backstays down to anchorage blocks under the approach viaducts,
//   which are Warren deck trusses on lattice trestle towers (two bents 10 m apart, ~23 m spans between towers).
//   Walkways 2.5 m wide outside the truss planes and the tower legs. Silver-grey paint (#BFC3C7), riveted.
// - Colombo Salles (1975): prestressed concrete box girder with curved haunched soffits on flared wall piers; spans
//   from the facts (38 | 230 | 149 | 314 with the 157 m navigation span | 233 | 5×42 landfill | 44).
// - Pedro Ivo Campos (1991): the twin ~30 m south, not driven: its own deck, lanes, parapets and shared path, piers
//   in line with Colombo's, its central 315 m a steel box girder.
// Geometry is merged per material and stretch (a draw call each), lamp posts are instanced. The driving space
// (walls' back + margin, up to 5.2 m over the road) stays clear: the truss planes stand outside it.
// After dark (setNight) the Hercílio Luz wears its architectural lighting (the RGB system finished in 2025: 1300
// luminaires tracing the silhouette, the "sorriso" of the eyebar chains, 5500 LED points up the hangers of the central
// span, 124 projectors washing the towers), warm gold most nights, a campaign's colour on some; the lamps of all three
// bridges light the decks, and every light lays its broken streak on the bay (sea-water.js night lights).

// --- Small vector kit on [x, y, z] arrays in the track frame (x east, y north, z up).
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const mad=(a,b,k)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(a[0],a[1],a[2]);
const unit=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
const Z=[0,0,1],U0=[0,0,0],Q0=[U0,U0,U0,U0];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);},lerp=(a,b,u)=>a+(b-a)*u;
const hash1=i=>{const h=Math.sin(i*91.7+13.1)*43758.5453;return h-Math.floor(h);};
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colour of a CSS colour, times a brightness and a warm/cool shift (tone variation per member).
const tint=(css,k=1,warm=0)=>{const c=new THREE.Color(css);return [c.r*k*(1+warm),c.g*k,c.b*k*(1-warm)];};
// Bilinear height of the terrain grid (null outside it).
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}

// Geometry gathered per mesh: flat quads with a vertex colour and 'steelUv' (metres along the member, metres across
// the face, the face's width: the steel shader rivets the face's edges from it, 0 = plain). Built in the track frame,
// stored in three.js world axes (x, z, -y: a rotation, so windings keep their sense). A lacing mesh keeps the first two
// as its texture uv.
class Mesher{
 constructor(){this.p=[];this.n=[];this.c=[];this.u=[];this.i=[];}
 vertex(p,n,c,u){this.p.push(p[0],p[2],-p[1]);this.n.push(n[0],n[2],-n[1]);this.c.push(c[0],c[1],c[2]);this.u.push(u[0],u[1],u[2]);}
 // a b c d go round the face; out points to its outer side (fixes the winding); uv per corner; normals per corner (smooth).
 quad(a,b,c,d,col,out,uv=Q0,normals=null){
  let n=cross(sub(c,a),sub(d,b));
  if(out&&dot(n,out)<0){[b,d]=[d,b];uv=[uv[0],uv[3],uv[2],uv[1]];if(normals)normals=[normals[0],normals[3],normals[2],normals[1]];n=mul(n,-1);}
  n=unit(n);const k=this.p.length/3;
  this.vertex(a,normals?normals[0]:n,col,uv[0]);this.vertex(b,normals?normals[1]:n,col,uv[1]);this.vertex(c,normals?normals[2]:n,col,uv[2]);this.vertex(d,normals?normals[3]:n,col,uv[3]);
  this.i.push(k,k+1,k+2,k,k+2,k+3);
 }
 tri(a,b,c,col,out){let n=cross(sub(b,a),sub(c,a));if(out&&dot(n,out)<0){[b,c]=[c,b];n=mul(n,-1);}n=unit(n);const k=this.p.length/3;for(const p of [a,b,c])this.vertex(p,n,col,U0);this.i.push(k,k+1,k+2);}
 // Frame of a member along T: S = T × up (across, w), V = S × T (its own up, h).
 static axes(T,up){let S=cross(T,up);if(len(S)<1e-3)S=cross(T,Math.abs(T[2])<.9?Z:[1,0,0]);S=unit(S);return [S,cross(S,T)];}
 // A straight box member from A to B, w across (S) by h (V); rivet rows on faces 18 cm and wider.
 beam(A,B,w,h,up,col,{caps=true,rivets=true}={}){
  const D=sub(B,A),l=len(D);if(l<1e-3)return;const T=mul(D,1/l),[S,V]=Mesher.axes(T,up);
  const c=(P,x,y)=>add(P,add(mul(S,x*w/2),mul(V,y*h/2)));
  for(const [x0,y0,x1,y1,o,fw] of [[-1,1,1,1,V,w],[1,-1,-1,-1,mul(V,-1),w],[1,1,1,-1,S,h],[-1,-1,-1,1,mul(S,-1),h]]){
   const r=rivets?fw:0;this.quad(c(A,x0,y0),c(B,x0,y0),c(B,x1,y1),c(A,x1,y1),col,o,[[0,0,r],[l,0,r],[l,fw,r],[0,fw,r]]);
  }
  if(caps){this.quad(c(A,-1,-1),c(A,1,-1),c(A,1,1),c(A,-1,1),col,mul(T,-1));this.quad(c(B,-1,-1),c(B,1,-1),c(B,1,1),c(B,-1,1),col,T);}
 }
 // A round member (smooth sides), radius r0 at A, r1 at B.
 cyl(A,B,r0,r1,seg,col,{caps=true,up=Z}={}){
  const D=sub(B,A),l=len(D);if(l<1e-4)return;const T=mul(D,1/l),[S,V]=Mesher.axes(T,up);
  const dir=k=>{const t=k/seg*Math.PI*2;return add(mul(S,Math.cos(t)),mul(V,Math.sin(t)));};
  for(let k=0;k<seg;k++){const d0=dir(k),d1=dir(k+1);this.quad(mad(A,d0,r0),mad(B,d0,r1),mad(B,d1,r1),mad(A,d1,r0),col,add(d0,d1),Q0,[d0,d0,d1,d1]);}
  if(caps)for(let k=1;k<seg-1;k++){this.tri(mad(A,dir(0),r0),mad(A,dir(k),r0),mad(A,dir(k+1),r0),col,mul(T,-1));this.tri(mad(B,dir(0),r1),mad(B,dir(k),r1),mad(B,dir(k+1),r1),col,T);}
 }
 // Sections swept along a path: each an array of points (same count) going round counter-clockwise seen from
 // ahead; a quad per edge and step, facing out. col: one colour, or one per edge; to(i,j) may send a quad elsewhere.
 loft(secs,col,{closed=false,rivets=false,to=null}={}){
  const m=secs[0].length,edges=closed?m:m-1;let along=0;
  for(let i=0;i+1<secs.length;i++){
   const A=secs[i],B=secs[i+1];let dir=[0,0,0];for(let j=0;j<m;j++)dir=add(dir,sub(B[j],A[j]));const step=len(dir)/m;
   for(let j=0;j<edges;j++){
    // Facing: the edge crossed with its own step (a step that only grows or shrinks the section at one height
    // makes a ledge facing down or up).
    const j1=(j+1)%m,e=sub(A[j1],A[j]),fw=len(e),r=rivets?fw:0,target=to?.(i,j)??this;if(!target)continue;
    const de=add(sub(B[j],A[j]),sub(B[j1],A[j1]));
    target.quad(A[j],B[j],B[j1],A[j1],Array.isArray(col[0])?col[j]:col,cross(e,len(de)>1e-6?de:dir),[[along,0,r],[along+step,0,r],[along+step,fw,r],[along,fw,r]]);
   }
   along+=step;
  }
 }
 // A flat polygon (fan from its first point), facing out.
 cap(points,col,out){for(let k=1;k+1<points.length;k++)this.tri(points[0],points[k],points[k+1],col,out);}
 // Triangles of a three.js geometry, through a local→track mapping (x along N, y up, z along E: a rotation).
 shape(geometry,place,col){
  const g=geometry.index?geometry.toNonIndexed():geometry,pos=g.attributes.position,nor=g.attributes.normal;
  for(let k=0;k<pos.count;k+=3){
   const kk=this.p.length/3;
   for(let j=0;j<3;j++){const [p,n]=place([pos.getX(k+j),pos.getY(k+j),pos.getZ(k+j)],[nor.getX(k+j),nor.getY(k+j),nor.getZ(k+j)]);this.vertex(p,n,col,U0);}
   this.i.push(kk,kk+1,kk+2);
  }
  geometry.dispose();if(g!==geometry)g.dispose();
 }
 get triangles(){return this.i.length/3;}
 geometry(uv=false){
  const g=new THREE.BufferGeometry(),n=this.p.length/3;
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  if(uv){const t=new Float32Array(n*2);for(let k=0;k<n;k++){t[k*2]=this.u[k*3];t[k*2+1]=this.u[k*3+1];}g.setAttribute('uv',new THREE.BufferAttribute(t,2));}
  else g.setAttribute('steelUv',new THREE.Float32BufferAttribute(this.u,3));
  g.setIndex(this.i);g.computeBoundingSphere();return g;
 }
}

// --- Materials.
const NOISE=`float brHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float brNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(brHash(i),brHash(i+vec2(1,0)),f.x),mix(brHash(i+vec2(0,1)),brHash(i+vec2(1,1)),f.x),f.y);}`;
const WORLD_VARYINGS=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 steelUv;varying vec3 vBrUv;varying vec3 vBrPos;varying vec3 vBrN;')
 .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvBrUv=steelUv;vBrPos=(modelMatrix*vec4(transformed,1.)).xyz;vBrN=normalize(mat3(modelMatrix)*objectNormal);');};
// Painted riveted steel: the member's tone in the vertex colour; rivet rows along every face's edges and splice
// plates every 6 m from steelUv (faded out before they shimmer); grime from the world position: soft blotches,
// rain streaks down the vertical faces, darker undersides.
// wash: the floodlights' light on it after dark (the Hercílio Luz's projectors), brWash = colour and strength (0 by
// day: nothing added), brWashZ = [bottom, top height, gain at the bottom, at the top]; uneven, as projectors' beams are.
function steelMaterial(name,{rivets=true,roughness=.44,metalness=.32,wash=null}={}){
 const m=new THREE.MeshStandardMaterial({name,vertexColors:true,roughness,metalness});
 const lit=wash??{brWash:{value:new THREE.Vector4(0,0,0,0)},brWashZ:{value:new THREE.Vector4(0,1,1,1)}};m.userData.wash=lit;
 m.onBeforeCompile=shader=>{
  WORLD_VARYINGS(shader);Object.assign(shader.uniforms,lit);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vBrUv;varying vec3 vBrPos;varying vec3 vBrN;uniform vec4 brWash,brWashZ;
${NOISE}`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
if(brWash.w>0.){float wz=clamp((vBrPos.y-brWashZ.x)/(brWashZ.y-brWashZ.x),0.,1.);
 float beams=.55+.65*smoothstep(.25,.75,brNoise(vec2((vBrPos.x-vBrPos.z)*.21,vBrPos.y*.045)))+.25*brNoise(vBrPos.xz*.5+vBrPos.y*.3);
 totalEmissiveRadiance+=diffuseColor.rgb*brWash.rgb*brWash.w*mix(brWashZ.z,brWashZ.w,wz)*beams*(1.-.35*max(normalize(vBrN).y,0.));}`).replace('#include <color_fragment>',`#include <color_fragment>
{vec3 sp=vBrPos,sn=normalize(vBrN);float side=1.-abs(sn.y);
float tone=brNoise(sp.xz*.045+sp.y*.03)*.55+brNoise(sp.xz*.19-sp.y*.13)*.45;
float streak=smoothstep(.5,.92,brNoise(vec2((sp.x+sp.z)*1.9,sp.y*.14)));
diffuseColor.rgb*=(.93+.11*tone)*(1.-.13*streak*side)*(1.-.16*max(-sn.y,0.));
${rivets?`vec3 su=vBrUv;
if(su.z>.18){float fw=max(fwidth(su.x),fwidth(su.y)),near=1.-smoothstep(.006,.02,fw);
 if(near>0.){float e=min(su.y,su.z-su.y),row=abs(e-.075),al=(fract(su.x/.16)-.5)*.16,r=length(vec2(al,row));
  float head=1.-smoothstep(.012,.02,r),halo=smoothstep(.016,.021,r)*(1.-smoothstep(.021,.029,r));
  float pf=abs(fract(su.x/6.1+.5)-.5)*6.1,plate=1.-smoothstep(.0,.012,abs(pf-.42));
  diffuseColor.rgb*=1.+near*(.16*head-.24*halo-.2*plate);}}`:''}}`);
 };
 m.customProgramCacheKey=()=>'floripa-steel-v1-'+(rivets?1:0);
 return m;
}
// Cast concrete: pores and blotches, rain streaks down the faces, the lift joints of the formwork every 1.2 m, and the
// dark wet band the tide leaves on the piers (sea level 0).
function concreteMaterial(name){
 const m=new THREE.MeshStandardMaterial({name,vertexColors:true,roughness:.9,metalness:0});
 m.onBeforeCompile=shader=>{
  WORLD_VARYINGS(shader);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vBrUv;varying vec3 vBrPos;varying vec3 vBrN;
${NOISE}`).replace('#include <color_fragment>',`#include <color_fragment>
{vec3 cp=vBrPos,cn=normalize(vBrN);float side=1.-abs(cn.y);
vec2 q=abs(cn.y)>.7?cp.xz:(abs(cn.x)>abs(cn.z)?vec2(cp.z,cp.y):vec2(cp.x,cp.y));
float pores=brNoise(q*2.7)*.45+brNoise(q*9.3)*.3+brNoise(q*.31)*.25;
float streak=smoothstep(.45,.9,brNoise(vec2(q.x*1.2,cp.y*.09)));
float lift=abs(fract(cp.y/1.2)-.5)*1.2,fw=fwidth(cp.y);
float joint=(1.-smoothstep(0.,max(fw*1.2,.006),lift-.006))*side*(1.-smoothstep(.02,.07,fw));
diffuseColor.rgb*=(.84+.24*pores)*(1.-.2*streak*side)*(1.-.15*joint)*(1.-.12*max(-cn.y,0.));
float tide=(1.-smoothstep(.2,1.5+.6*brNoise(vec2(q.x*.6,1.7)),cp.y))*side;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.06,.075,.055)*(.8+.5*pores),tide*.85);}`);
 };
 m.customProgramCacheKey=()=>'floripa-concrete-v1';
 return m;
}
// The lacing between the channels of the built-up members (left half of the atlas: single V lacing) and the walkway
// railings (right half: balusters between rails). Alpha-tested, both faces; the alpha grows with the mip level so
// thin bars keep their coverage far off instead of fading out.
function lacingAtlas(){
 return canvasTexture((ctx,w,h)=>{
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='#ffffff';ctx.lineWidth=10;ctx.lineCap='butt';
  ctx.beginPath();for(const y0 of [-256,0,256]){ctx.moveTo(4,y0);ctx.lineTo(60,y0+128);ctx.lineTo(4,y0+256);}ctx.stroke();
  ctx.fillStyle='#ffffff';for(const y of [0,128,256])for(const x of [6,58]){ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();}
  ctx.fillRect(64,0,6,h);ctx.fillRect(122,0,6,h);ctx.fillRect(93,0,4,h);for(let y=0;y<h;y+=32)ctx.fillRect(64,y+14,64,5);
 },128,256,true);
}
function laceMaterial(name,map){
 const m=new THREE.MeshStandardMaterial({name,map,vertexColors:true,alphaTest:.5,side:THREE.DoubleSide,roughness:.48,metalness:.3});
 m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`{vec2 px=vMapUv*vec2(128.,256.);float mip=max(0.,.5*log2(max(dot(dFdx(px),dFdx(px)),dot(dFdy(px),dFdy(px)))));diffuseColor.a*=1.+mip*.35;}
#include <alphatest_fragment>`);};
 m.customProgramCacheKey=()=>'floripa-lace-v1';
 return m;
}
// The Pedro Ivo's carriageway: 14.4 m across (four 3.6 m lanes, solid edge lines, dashed lane lines), 24 m per repeat,
// worn darker in the wheel paths.
function laneTexture(){
 const map=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#46484a';ctx.fillRect(0,0,w,h);const r=random(311),m=w/14.4;
  for(let k=0;k<5200;k++){ctx.fillStyle=r()<.5?`rgba(20,20,22,${.1+r()*.2})`:`rgba(150,150,145,${.06+r()*.14})`;ctx.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}
  for(let lane=0;lane<4;lane++)for(const o of [-.85,.85]){const x=(lane*3.6+1.8+o)*m,g=ctx.createLinearGradient(x-.5*m,0,x+.5*m,0);g.addColorStop(0,'rgba(15,15,16,0)');g.addColorStop(.5,'rgba(15,15,16,.22)');g.addColorStop(1,'rgba(15,15,16,0)');ctx.fillStyle=g;ctx.fillRect(x-.5*m,0,m,h);}
  ctx.fillStyle='rgba(232,230,222,.9)';for(const x of [.3,14.1-.15])ctx.fillRect(x*m,0,.15*m,h);
  for(const x of [3.6,7.2,10.8])for(const y0 of [0,12])ctx.fillRect((x-.07)*m,y0/24*h,.14*m,4/24*h);
 },512,512,true);
 return map;
}

// The Hercílio Luz's lighting schemes (linear colours): the silhouette's luminaires, the hangers' LEDs, the towers'
// projectors; hue: the hangers run through the colours.
const SCHEMES={
 dourado:{chain:[1,.45,.12],hang:[1,.62,.3],tower:[1,.58,.28]},
 branco:{chain:[.95,.97,1],hang:[.86,.92,1],tower:[.9,.94,1]},
 rosa:{chain:[1,.16,.5],hang:[1,.3,.66],tower:[1,.4,.74]},
 azul:{chain:[.18,.42,1],hang:[.3,.56,1],tower:[.42,.62,1]},
 verde_amarelo:{chain:[1,.76,.06],hang:[.1,1,.28],tower:[1,.86,.3]},
 festa:{chain:[1,.84,.58],hang:[1,1,1],tower:[.96,.88,.74],hue:true}
};
// Most nights gold; on some the month's campaign colour (Setembro Amarelo, Outubro Rosa, Novembro Azul) or another.
function pickScheme(rand){
 const forced=globalThis.location?new URLSearchParams(globalThis.location.search).get('ponte'):null;if(forced&&SCHEMES[forced])return forced;
 const month=new Date().getMonth(),campaign={8:'verde_amarelo',9:'rosa',10:'azul'}[month],r=rand(),other=()=>['rosa','azul','verde_amarelo'][Math.floor(rand()*3)];
 return r<.5?'dourado':r<.62?'branco':r<.82?(campaign??other()):r<.92?other():'festa';
}

export function createFloripaBridges(data,{mobile=false,ground}={}){
 const root=new THREE.Group();root.name='Pontes_Floripa';
 const list=data.scenery?.bridges??[],a=data.samples,L=data.meta.reconstructed_xy_m,cols=data.columns??[];
 const WR=cols.indexOf('wall_right_m'),WL=cols.indexOf('wall_left_m'),rand=random(9127);
 // The night's lights draw from their own stream: the structures' tones (rand) stay as they were.
 const glim=random(5153);
 const wrap=s=>((s%L)+L)%L;
 const at=s=>{s=wrap(s);let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}const p=a[lo],q=a[(lo+1)%a.length],span=(lo===a.length-1?L:q[0])-p[0],u=span>0?clamp((s-p[0])/span,0,1):0;return p.map((v,k)=>k===0?s:v+(q[k]-v)*u);};
 // Track station: centre, road height, width, crossfall, unit tangent and left normal, wall gaps.
 const frame=s=>{const p=at(s),tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1;return {s:p[0],x:p[1],y:p[2],z:p[3],w:p[4],cf:p[5],t:[p[7]/tl,p[8]/tl,0],n:[p[9]/nl,p[10]/nl,0],gapL:WL>=0?p[WL]:.35,gapR:WR>=0?p[WR]:.35};};
 const onTrack=(f,d,dz=0)=>[f.x+f.n[0]*d,f.y+f.n[1]*d,f.z+f.cf*d+dz];
 // Back of the Jersey wall from the centre line (side +1 left, -1 right): the driving space ends there.
 const wallBack=(f,side)=>f.w/2+(side>0?f.gapL:f.gapR)+.75;
 const bed=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??-12;};
 // Lowest ground under a footprint (centre c, half-lengths hl along t and hw along n): foundations reach below it.
 const lowest=(c,t,n,hl,hw)=>Math.min(...[[0,0],[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[0,1],[-1,0],[1,0]].map(([e,d])=>bed(c[0]+t[0]*e*hl+n[0]*d*hw,c[1]+t[1]*e*hl+n[1]*d*hw)));
 const stats={bridges:list.length,meshes:0,drawCalls:0,triangles:0,instances:0,mobile};

 // Materials (one each, shared by all three bridges).
 const atlas=lacingAtlas();
 const steel=steelMaterial('Aco_pontes',{rivets:!mobile});
 const concrete=concreteMaterial('Concreto_pontes');
 const lace=laceMaterial('Trelica_laco_guarda_corpo',atlas);
 const lanes=laneTexture();
 const asphalt=new THREE.MeshStandardMaterial({name:'Asfalto_Pedro_Ivo',map:lanes,roughness:.88,metalness:0});
 // Patches of newer and older asphalt over the lane texture, from the world position: the 24 m repeat never shows.
 asphalt.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
varying vec3 vAsPos;`).replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
vAsPos=(modelMatrix*vec4(transformed,1.)).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vAsPos;
${NOISE}`).replace('#include <color_fragment>',`#include <color_fragment>
diffuseColor.rgb*=.9+.14*brNoise(vAsPos.xz*.035)+.06*brNoise(vAsPos.xz*.21);`);
 };
 asphalt.customProgramCacheKey=()=>'floripa-asphalt-v1';
 const lampMaterial=new THREE.MeshStandardMaterial({name:'Postes_pontes',vertexColors:true,metalness:.55,roughness:.4});
 // The lenses (steelUv.z = -1 in the lamp geometry) glow after dark: lampGlow = colour x strength, 0 by day.
 const lampGlow={value:new THREE.Vector3()};
 lampMaterial.onBeforeCompile=shader=>{
  shader.uniforms.lampGlow=lampGlow;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 steelUv;varying float vLens;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLens=step(steelUv.z,-.5);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 lampGlow;varying float vLens;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=lampGlow*vLens;');
 };
 lampMaterial.customProgramCacheKey=()=>'floripa-bridge-lamps-v1';
 // Night lights gathered while the bridges are built (sea-water.js nightLights): arch = the Hercílio Luz's architectural
 // lighting and the lamps, reflected = the ones whose streaks show on the bay; washes: the HL's steel, lit per part.
 const arch=[],reflected=[],washes={};
 const laceMeshes=[];
 function emit(m,material,name,{cast=true,receive=true,uv=false}={}){
  if(!m.i.length)return null;const mesh=new THREE.Mesh(m.geometry(uv),material);mesh.name=name;mesh.castShadow=cast;mesh.receiveShadow=receive;
  mesh.matrixAutoUpdate=false;root.add(mesh);stats.meshes++;stats.drawCalls++;stats.triangles+=m.triangles;(stats.parts??={})[name]=m.triangles;return mesh;
 }
 const lamps={pole:[],bracket:[]};
 const obstacles=[];
 const proxy=(A,B,w,h,up,name)=>{const m=new Mesher();m.beam(A,B,w,h,up,[1,1,1],{rivets:false});const mesh=new THREE.Mesh(m.geometry());mesh.name=name;mesh.updateMatrixWorld(true);obstacles.push(mesh);};
 const PAINT=list.find(b=>b.kind==='hercilio_luz')?.paint??'#bfc3c7';
 // Each member its own tone: the same silver paint, a few percent lighter or darker, warmer or cooler.
 const steelTone=(k=1)=>tint(PAINT,k*(.92+rand()*.13),(rand()-.5)*.035);

 // ================================================================ Ponte Hercílio Luz
 function hercilioLuz(info){
  const [sC,sI]=info.towers_s,sSpan=wrap(sI-sC),fC=frame(sC),fI=frame(sI);
  // The main span is straight from tower to tower: its axis (E along it, N to the left).
  const E=unit([fI.x-fC.x,fI.y-fC.y,0]),N=[-E[1],E[0],0],Lm=Math.hypot(fI.x-fC.x,fI.y-fC.y);
  const ax=(x,d,z)=>[fC.x+E[0]*x+N[0]*d,fC.y+E[1]*x+N[1]*d,z];
  const fx=x=>frame(sC+x*sSpan/Lm),offOf=f=>(f.x-fC.x)*N[0]+(f.y-fC.y)*N[1];
  const road=(x,d=0)=>{const f=fx(x);return f.z+f.cf*(d-offOf(f));};
  // Truss and chain planes: just outside the walls' backs all along the span (and at the towers).
  let dClear=0;for(let x=-6;x<=Lm+6;x+=2){const f=fx(x),off=offOf(f);dClear=Math.max(dClear,off+wallBack(f,1),-(off-wallBack(f,-1)));}
  const dT=dClear+.45;
  const saddle=info.chain?.saddle_m??73.5,topZ=info.tower_top_m??74.2,pierTop=info.pier_top_m??4.5,xq=Lm/4;
  // Chain: a parabola from the saddles to the low point; lifted if the top bracing would come within 5.2 m of the road.
  let low=info.chain?.low_m??35.5;
  const chainZ=x=>low+(saddle-low)*((x-Lm/2)/(Lm/2))**2;
  for(let k=0;k<6;k++){let need=0;for(let x=xq;x<=Lm-xq;x+=3)need=Math.max(need,road(x)+5.95-chainZ(x));if(need<=.01)break;low+=need*1.05;}
  // Straight top chord in the outer quarters: from ~6 m over the road at the tower to the chain at the quarter point.
  const chordEnd=[road(0)+6.1,road(Lm)+6.1];
  const chordZ=x=>x<=xq?chordEnd[0]+(chainZ(xq)-chordEnd[0])*x/xq:x>=Lm-xq?chainZ(Lm-xq)+(chordEnd[1]-chainZ(Lm-xq))*(x-Lm+xq)/xq:chainZ(x);
  // Panel points: 8 per outer quarter (7 hangers between), ~12.1 m panels in the middle half.
  const nq=8,nm=Math.max(2,Math.round((Lm-2*xq)/(info.panel_m??12.1))),px=[];
  for(let k=0;k<=nq;k++)px.push(xq*k/nq);for(let k=1;k<=nm;k++)px.push(xq+(Lm-2*xq)*k/nm);for(let k=1;k<=nq;k++)px.push(Lm-xq+xq*k/nq);
  const NP=px.length-1,outer=k=>px[k]<xq-.5||px[k]>Lm-xq+.5;
  // Tower legs: from the rocker on the pier to the saddle, leaning in to the chain plane at the top.
  const zB=pierTop+1.35,zT=topZ-2.8,zH=zT-5.2,lean=1.0;
  const legD=z=>dT+lean*(zT-z)/(zT-zB),legA=z=>lerp(.72,.6,(z-zB)/(zT-zB));
  const rT=Math.max(road(0),road(Lm)),dW=Math.max(dT+.55,legD(rT)+legA(rT)+.15),walkW=info.walkway_m??2.5,dWo=dW+walkW;
  const meshA=new Mesher(),meshB=new Mesher(),towerC=new Mesher(),towerI=new Mesher(),viaC=new Mesher(),viaI=new Mesher(),cc=new Mesher(),laceC=new Mesher(),laceI=new Mesher();
  // The night's light on the steel: the towers bathed by their projectors (strongest round the portal, still lit at the
  // saddles), the span lit by its own LEDs, the approach viaducts by the chains' luminaires only.
  const r0=Math.min(road(0),road(Lm));
  washes.tower=steelMaterial('Aco_torres_Hercilio_Luz',{rivets:!mobile,wash:{brWash:{value:new THREE.Vector4()},brWashZ:{value:new THREE.Vector4(pierTop,topZ,.8,.55)}}});
  washes.span=steelMaterial('Aco_vao_Hercilio_Luz',{rivets:!mobile,wash:{brWash:{value:new THREE.Vector4()},brWashZ:{value:new THREE.Vector4(r0-4,saddle,1,.7)}}});
  washes.via=steelMaterial('Aco_viadutos_Hercilio_Luz',{rivets:!mobile,wash:{brWash:{value:new THREE.Vector4()},brWashZ:{value:new THREE.Vector4(0,saddle,.6,1)}}});
  const half=x=>x<Lm/2?meshA:meshB,laceOf=x=>x<Lm/2?laceC:laceI;
  const PIER=tint('#a39d92'),DECK=tint('#55595c'),GRATE=tint('#3c3f42'),WALK=tint('#8d9296');
  const eyeSeg=mobile?6:10,bars=mobile?[[-.18,.18],[-.36,.36]]:[[-.33,-.11,.11,.33],[-.44,-.22,.22,.44]];

  // A built-up member: two channels with lacing between (both faces), in the plane with normal P (across = P).
  function laced(m,lm,A,B,width,depth,P,col){
   const D=sub(B,A),l=len(D);if(l<.05)return;const T=mul(D,1/l),S=unit(P),V=cross(S,T);
   if(mobile||!lm){m.beam(A,B,depth,width,cross(T,S),col);return;}
   for(const y of [-1,1]){const o=mul(V,y*(width/2-.07));m.beam(add(A,o),add(B,o),depth,.14,V,col,{caps:false});}
   const reps=l/(1.7*width);
   for(const x of [-1,1]){const o=mul(S,x*depth*.42),lo=mul(V,-(width/2-.1)),hi=mul(V,width/2-.1);
    lm.quad(add(add(A,o),lo),add(add(B,o),lo),add(add(B,o),hi),add(add(A,o),hi),col,mul(S,x),[[.02,0,0],[.02,reps,0],[.48,reps,0],[.48,0,0]]);}
  }
  // An eyebar link between two pins: four bars side by side (interleaved with the next link's), an eye at each end.
  function link(m,A,B,odd,col){
   const T=unit(sub(B,A)),up=cross(N,T);
   for(const o of bars[odd?1:0]){
    const p=mad(A,N,o),q=mad(B,N,o);m.beam(p,q,mobile?.12:.065,.8,up,col,{caps:false});
    for(const c of [p,q])m.cyl(mad(c,N,-.035),mad(c,N,.035),.7,.7,eyeSeg,col);
   }
  }
  const pin=(m,P,col)=>{m.cyl(mad(P,N,-.62),mad(P,N,.62),.24,.24,8,col,{caps:false});for(const s of [-1,1])m.cyl(mad(P,N,s*.55),mad(P,N,s*.68),.36,.36,8,col);};

  // --- Main span: stiffening trusses, chains, hangers, bracing, floor.
  const zStrut=k=>Math.max(chordZ(px[k])+.05,road(px[k])+6.05);
  for(const sd of [-1,1]){
   const D=sd*dT,P=(x,z)=>ax(x,D,z),bot=x=>road(x,D)-.25;
   for(let k=0;k<NP;k++){
    const x0=px[k],x1=px[k+1],m=half((x0+x1)/2),lm=laceOf((x0+x1)/2),col=steelTone();
    m.beam(P(x0,bot(x0)),P(x1,bot(x1)),.75,.95,Z,steelTone(),{caps:false});
    if(outer(k)||outer(k+1))m.beam(P(x0,chordZ(x0)),P(x1,chordZ(x1)),.8,.9,cross(N,E),steelTone(),{caps:false});
    link(m,P(x0,chainZ(x0)),P(x1,chainZ(x1)),k%2,steelTone(.98));
    // Warren web, mirrored about midspan so both halves read alike.
    const up=(k<NP/2?k:NP-1-k)%2===0===(k<NP/2),lo0=bot(x0)+.48,lo1=bot(x1)+.48,hi0=chordZ(x0)-.45,hi1=chordZ(x1)-.45;
    laced(m,lm,up?P(x0,lo0):P(x0,hi0),up?P(x1,hi1):P(x1,lo1),.5,.55,N,col);
   }
   for(let k=1;k<NP;k++){
    const x=px[k],m=half(x),lm=laceOf(x),cz=chainZ(x),tz=chordZ(x);
    laced(m,lm,P(x,bot(x)+.48),P(x,tz-.45),.55,.6,N,steelTone());
    // Hangers: from the chain's pins down to the straight top chord (outer quarters only).
    if(outer(k)&&cz-tz>1.2){const col=steelTone();for(const o of [-.14,.14])m.beam(mad(P(x,tz+.45),E,o),mad(P(x,cz-.3),E,o),.34,.1,E,col,{caps:false});}
    pin(m,P(x,cz),steelTone(.9));
   }
  }
  // Top struts, lateral X bracing between the top chords, knee braces where the truss is deep.
  for(let k=1;k<NP;k++){
   const x=px[k],z=zStrut(k),m=half(x);m.beam(ax(x,-dT,z),ax(x,dT,z),.5,.65,Z,steelTone());
   if(z-road(x)>8.6)for(const sd of [-1,1])m.beam(ax(x,sd*(dT-.3),z-2.6),ax(x,sd*(dT-2.6),z-.3),.28,.28,E,steelTone());
   if(k<NP-1){const x1=px[k+1],z1=zStrut(k+1),mm=half((x+x1)/2);for(const sd of [-1,1])mm.beam(ax(x,sd*(dT-.3),z+.05),ax(x1,-sd*(dT-.3),z1+.05),.26,.26,Z,steelTone(),{caps:false});}
  }
  // Floor: beams at the panel points (out under the walkways), stringers, bottom laterals.
  for(let k=1;k<NP;k++){
   const x=px[k],m=half(x),r=road(x),col=steelTone(.85);
   m.beam(ax(x,-dT,r-.95),ax(x,dT,r-.95),.45,1.25,Z,col);
   for(const sd of [-1,1])m.beam(ax(x,sd*(dT+.38),r-.62),ax(x,sd*dWo,r-.3),.32,.5,Z,col);
  }
  for(let k=0;k<NP;k++){
   const x0=Math.max(px[k],1.8),x1=Math.min(px[k+1],Lm-1.8),m=half((x0+x1)/2),r0=road(x0),r1=road(x1);
   for(const d of [-.78,-.27,.27,.78])m.beam(ax(x0,d*dT,r0-.68),ax(x1,d*dT,r1-.68),.3,.6,Z,steelTone(.85),{caps:false,rivets:false});
   for(const sd of [-1,1])m.beam(ax(px[k],sd*dT,road(px[k])-1.5),ax(px[k+1],-sd*dT,road(px[k+1])-1.5),.22,.22,Z,steelTone(.85),{caps:false,rivets:false});
  }
  // Deck between the asphalt and the trusses, walkways outside them, railings; stations ~4 m along the axis.
  {
   const n=Math.ceil(Lm/4),xs=[];for(let k=0;k<=n;k++)xs.push(-2+(Lm+4)*k/n);
   for(let k=0;k<n;k++){
    const x0=xs[k],x1=xs[k+1],m=half((x0+x1)/2),lm=laceOf((x0+x1)/2),f0=fx(x0),f1=fx(x1),o0=offOf(f0),o1=offOf(f1);
    for(const sd of [-1,1]){
     // At the road plane from the asphalt's edge to the wall, a step lower behind the wall, out to the bottom chord.
     const e0=o0+sd*(f0.w/2-.02),e1=o1+sd*(f1.w/2-.02),c0=sd*(dT-.38);
     m.quad(ax(x0,e0,road(x0,e0)-.03),ax(x1,e1,road(x1,e1)-.03),ax(x1,c0,road(x1,c0)-.06),ax(x0,c0,road(x0,c0)-.06),GRATE,Z);
     m.quad(ax(x0,sd*(dT+.38),road(x0)-.1),ax(x1,sd*(dT+.38),road(x1)-.1),ax(x1,sd*dW,road(x1)-.1),ax(x0,sd*dW,road(x0)-.1),DECK,Z);
     // Walkway plate with its edges, the railing outside.
     const w0=road(x0)+.12,w1=road(x1)+.12;
     m.quad(ax(x0,sd*dW,w0),ax(x1,sd*dW,w1),ax(x1,sd*dWo,w1),ax(x0,sd*dWo,w0),WALK,Z);
     m.quad(ax(x0,sd*dW,w0-.22),ax(x1,sd*dW,w1-.22),ax(x1,sd*dWo,w1-.22),ax(x0,sd*dWo,w0-.22),DECK,mul(Z,-1));
     m.quad(ax(x0,sd*dWo,w0-.22),ax(x1,sd*dWo,w1-.22),ax(x1,sd*dWo,w1),ax(x0,sd*dWo,w0),DECK,mul(N,sd));
     m.quad(ax(x0,sd*dW,w0-.22),ax(x1,sd*dW,w1-.22),ax(x1,sd*dW,w1),ax(x0,sd*dW,w0),DECK,mul(N,-sd));
     const rd=sd*(dWo-.06);m.beam(ax(x0,rd,w0+1.08),ax(x1,rd,w1+1.08),.07,.09,Z,steelTone(),{caps:false,rivets:false});
     m.beam(ax(x0,rd,w0),ax(x0,rd,w0+1.1),.07,.07,E,steelTone(),{rivets:false});
     if(!mobile)lm.quad(ax(x0,rd,w0+.04),ax(x1,rd,w1+.04),ax(x1,rd,w1+1.04),ax(x0,rd,w0+1.04),steelTone(),mul(N,sd),[[.52,0,0],[.52,(x1-x0)/1.2,0],[.98,(x1-x0)/1.2,0],[.98,0,0]]);
    }
    // Underside of the deck, seen from the sea.
    m.quad(ax(x0,-dT,road(x0)-.34),ax(x1,-dT,road(x1)-.34),ax(x1,dT,road(x1)-.34),ax(x0,dT,road(x0)-.34),DECK,mul(Z,-1));
   }
  }
  // Roadway lamps: on every other vertical, a bracket reaching in over the wall at ~6.4 m.
  for(let k=2;k<NP;k+=2)for(const sd of [-1,1]){const x=px[k];lamps.bracket.push({p:ax(x,sd*(dT-.32),road(x)+6.4),dir:mul(N,-sd),pool:(u,v)=>ax(x+u,sd*(dT-3.4)+v,road(x+u,sd*(dT-3.4)+v)+.07)});}
  // --- Night: the silhouette's luminaires on top of both chains (every metre; now and then one out), the LED points up
  // every vertical of the central span (a streak on the water for each), the projectors round the towers' feet.
  const chainStep=mobile?2:1,ledStep=mobile?.6:.26;
  for(const sd of [-1,1]){
   for(let x=0;x<=Lm+1e-6;x+=chainStep){if(glim()<.012)continue;const p=ax(x,sd*dT,chainZ(x)+.5),k=arch.length;arch.push({p,c:[1,1,1],i:.9+glim()*.2,s:.1,g:1,on:.2,ph:glim()});if(k%12===0)reflected.push({...arch[k],i:arch[k].i*1.2,s:.3});}
   for(let k=1;k<NP;k++){
    const x=px[k],z0=road(x,sd*dT)+.25,z1=chainZ(x)-.45;let n=0;
    for(let z=z0;z<=z1;z+=ledStep){arch.push({p:ax(x,sd*dT,z),c:[1,1,1],i:.85+glim()*.3,s:.06,g:2,on:.2,ph:glim()});n++;}
    reflected.push({p:ax(x,sd*dT,(z0+z1)/2),c:[1,1,1],i:Math.min(1,n*.01),s:.4,g:2,on:.2,ph:glim()});
   }
  }
  for(const xT of [0,Lm])for(const sd of [-1,1]){const r=road(xT),lc=sd*legD(r+.4),lp=sd*legD(zB);
   for(const [e,d,z] of [[-2.3,-.9,r+.35],[2.3,-.9,r+.35],[-2.3,.9,r+.35],[2.3,.9,r+.35],[-2.9,-1.7,pierTop+.3],[2.9,-1.7,pierTop+.3],[-2.9,1.7,pierTop+.3],[2.9,1.7,pierTop+.3]])
    arch.push({p:ax(xT+e,(sd>0?lc:lp)+d,z),c:[1,1,1],i:.6+glim()*.3,s:.18,g:3,on:.2,ph:glim()});}

  // --- Towers.
  function tower(xT,m,lm,name){
   const r=road(xT),tp=(e,d,z)=>ax(xT+e,d,z),legB=z=>z<r-2.9?lerp(1.0,1.75,(z-zB)/(r-2.9-zB)):z<r+.4?1.75:lerp(1.75,1.3,(z-r-.4)/(zT-r-.4));
   const levels=[zB,(zB+r-2.9)/2,r-2.9,r+.4,r+11,(r+11+zH)/2,zH,zT];
   const col=steelTone(1.03);
   for(const sd of [-1,1]){
    const secs=levels.map(z=>{const c=sd*legD(z),aa=legA(z),b=legB(z);return [tp(-b,c-aa,z),tp(b,c-aa,z),tp(b,c+aa,z),tp(-b,c+aa,z)];});
    m.loft(secs,col,{closed:true,rivets:true});m.cap(secs.at(-1),col,Z);
    // Corner angles standing proud of the plates, batten bands every ~4.4 m: the riveted column's relief.
    for(const [ce,cd] of [[-1,-1],[1,-1],[1,1],[-1,1]])for(let i=0;i+1<levels.length;i++){const k=(z)=>tp(ce*(legB(z)+.03),sd*legD(z)+cd*(legA(z)+.03),z);m.beam(k(levels[i]),k(levels[i+1]),.17,.17,E,col,{caps:false,rivets:false});}
    if(!mobile)for(let z=zB+2.2;z<zT-1;z+=4.4){const c=sd*legD(z),aa=legA(z)+.04,b=legB(z)+.04,bc=steelTone(.97);
     for(const o of [-1,1]){m.beam(tp(-b,c+o*aa,z),tp(b,c+o*aa,z),.06,.5,Z,bc,{rivets:false});m.beam(tp(o*b,c-aa,z),tp(o*b,c+aa,z),.06,.5,Z,bc,{rivets:false});}}
    // Saddle on top of the leg: the casting the chain runs over, and its rounded crown.
    const c=sd*dT;m.beam(tp(0,c,zT-.1),tp(0,c,topZ-1.05),1.5,3.0,E,steelTone());m.cyl(tp(0,c-.75,topZ-1.05),tp(0,c+.75,topZ-1.05),1.05,1.05,14,steelTone(),{up:Z});
    // Rocker bearings on the pier: base plate, two rockers, the shoe under the leg.
    const lc=sd*legD(zB);m.beam(tp(0,lc,pierTop),tp(0,lc,pierTop+.3),2.4,3.4,E,steelTone(.8),{rivets:false});
    for(const o of [-.5,.5])m.cyl(tp(o*1.2,lc-.55,pierTop+.75),tp(o*1.2,lc+.55,pierTop+.75),.45,.45,10,steelTone(.85),{up:Z});
    m.beam(tp(0,lc,pierTop+.95),tp(0,lc,zB+.05),1.6,2.6,E,steelTone(.95),{rivets:false});
    proxy(tp(0,sd*legD(zB),zB),tp(0,sd*legD(zT),topZ),1.5,3.2,E,name+'_perna');
   }
   const inner=z=>legD(z)-legA(z)+.15;
   // Portal strut over the roadway: an arch under a deep girder, square openings in its spandrels (Shape, extruded along E).
   const pb=r+5.6,pc=r+7.7,pt=r+10.4,di=inner(pb),dO=legD(pt);
   const shape=new THREE.Shape();shape.moveTo(-dO,pt);shape.lineTo(-dO,pb);
   for(let k=0;k<=20;k++){const t=Math.PI*(1-k/20),d=Math.cos(t)*di,z=pb+(pc-pb)*Math.sin(t);shape.lineTo(d,z);}
   shape.lineTo(dO,pb);shape.lineTo(dO,pt);shape.closePath();
   for(const c of [-4.7,-1.6,1.6,4.7]){if(Math.abs(c)+.9>di-.6)continue;const h=new THREE.Path();h.moveTo(c-.85,pt-2.1);h.lineTo(c+.85,pt-2.1);h.lineTo(c+.85,pt-.7);h.lineTo(c-.85,pt-.7);h.closePath();shape.holes.push(h);}
   const place=(p,n)=>[ax(xT+p[2],p[0],p[1]),add(add(mul(N,n[0]),mul(Z,n[1])),mul(E,n[2]))];
   m.shape(new THREE.ExtrudeGeometry(shape,{depth:1.5,bevelEnabled:false,curveSegments:16}).translate(0,0,-.75),place,col);
   proxy(tp(0,-dO,(pb+pt)/2),tp(0,dO,(pb+pt)/2),1.5,pt-pb,Z,name+'_portico');
   // Top header with its row of windows.
   const hs=new THREE.Shape(),hd=legD(zH);hs.moveTo(-hd,zH);hs.lineTo(hd,zH);hs.lineTo(hd,zT);hs.lineTo(-hd,zT);hs.closePath();
   const open=inner(zH)-.5,nw=7,pitch=2*open/nw;
   for(let k=0;k<nw;k++){const c=-open+pitch*(k+.5),h=new THREE.Path();h.moveTo(c-pitch*.32,zH+1.2);h.lineTo(c+pitch*.32,zH+1.2);h.lineTo(c+pitch*.32,zT-1.1);h.lineTo(c-pitch*.32,zT-1.1);h.closePath();hs.holes.push(h);}
   m.shape(new THREE.ExtrudeGeometry(hs,{depth:1.8,bevelEnabled:false}).translate(0,0,-.9),place,col);
   proxy(tp(0,-hd,(zH+zT)/2),tp(0,hd,(zH+zT)/2),1.8,zT-zH,Z,name+'_travessa');
   // Three tiers of X bracing between the portal and the header, struts between tiers.
   const tiers=[pt,pt+(zH-pt)/3,pt+(zH-pt)*2/3,zH];
   for(let k=0;k<3;k++){
    const z0=tiers[k],z1=tiers[k+1];
    for(const sd of [-1,1])laced(m,lm,tp(0,sd*inner(z0),z0+.35),tp(0,-sd*inner(z1),z1-.35),.8,.55,E,steelTone());
    if(k)m.beam(tp(0,-inner(z0),z0),tp(0,inner(z0),z0),1.0,.95,Z,steelTone());
   }
   // Below the deck: the floor girder the trusses bear on, the lower strut the viaduct truss ends on, two tiers of
   // X bracing and a strut over the rockers.
   m.beam(tp(0,-legD(r-1.6),r-1.6),tp(0,legD(r-1.6),r-1.6),1.9,2.4,Z,steelTone());
   m.beam(tp(0,-legD(r-4.7),r-4.7),tp(0,legD(r-4.7),r-4.7),1.4,.9,Z,steelTone());
   proxy(tp(0,-legD(r-1.6),r-1.6),tp(0,legD(r-1.6),r-1.6),1.9,2.4,Z,name+'_viga_piso');
   const lowT=[r-5.2,(r-5.2+zB+3)/2,zB+3];
   for(let k=0;k<2;k++){const z0=lowT[k],z1=lowT[k+1];for(const sd of [-1,1])laced(m,lm,tp(0,sd*inner(z0),z0-.3),tp(0,-sd*inner(z1),z1+.3),.75,.55,E,steelTone());m.beam(tp(0,-inner(z1),z1),tp(0,inner(z1),z1),.9,.85,Z,steelTone());}
   // Pier: a block of cyclopean concrete from the sea bed to +4.5 m, cutwater ends across the strait.
   const b=5.4,aa=legD(zB)+3.2,ch=2.4,g=Math.min(lowest(tp(0,0,0),E,N,b+.3,aa+.3),pierTop-3)-2;
   const ring=(z,grow=0)=>{const B=b+grow,A=aa+grow;return [[-B+ch,-A],[B-ch,-A],[B,-A+ch],[B,A-ch],[B-ch,A],[-B+ch,A],[-B,A-ch],[-B,-A+ch]].map(([e,d])=>tp(e,d,z));};
   const secs=[ring(g),ring(pierTop-.45),ring(pierTop-.45,.22),ring(pierTop,.22)];cc.loft(secs,PIER,{closed:true});cc.cap(secs.at(-1),PIER,Z);
  }
  tower(0,towerC,laceC,'HL_torre_continente');tower(Lm,towerI,laceI,'HL_torre_ilha');

  // --- Approach viaducts: Warren deck trusses on lattice trestle towers, backstays to the anchorages.
  const dTr=4.6,truss=3.25;
  function viaduct(sFrom,sTo,towers,towerS,m,lm){
   // Supports: abutment, pairs of bents 10 m apart, ~23 m spans between towers, the main tower.
   const span=sTo-sFrom,long=(span-towers*10)/(towers+1),supports=[sFrom];
   // A street passing under the viaduct (paved land cover right across, both sides; the Beira-Mar avenues) keeps its
   // lanes: a trestle tower standing on one slides along until its bents clear it.
   const cover=data.scenery?.cover,paved=(x,y)=>{if(!cover)return false;const i=Math.round((x-cover.x0)/cover.step),j=Math.round((y-cover.y0)/cover.step);return i>=0&&j>=0&&i<cover.nx&&j<cover.ny&&String(cover.classes[j*cover.nx+i])==='7';};
   const street=s=>{const f=frame(s);let n=0;for(const d of [-26,-20,-14,14,20,26])if(paved(f.x+f.n[0]*d,f.y+f.n[1]*d))n++;return n>=5;};
   const clear=(a0,a1)=>{for(let s=a0;s<=a1;s+=1)if(street(s))return false;return true;};
   let prev=sFrom;
   for(let k=0;k<towers;k++){
    let s=sFrom+long*(k+1)+10*k;
    if(!clear(s-3,s+13))for(let shift=1;shift<=14;shift++){const c=[s+shift,s-shift].find(t=>t-prev>8&&clear(t-3,t+13));if(c!=null){s=c;break;}}
    supports.push(s,s+10);prev=s+10;
   }
   supports.push(sTo);
   const toward=towerS>sFrom+span/2?1:-1;
   // Anchorage: in the middle of the long span nearest 145 m behind the tower.
   let sA=null,best=Infinity;for(let k=0;k+1<supports.length;k+=2){const c=(supports[k]+supports[k+1])/2;if(Math.abs(Math.abs(c-towerS)-145)<best){best=Math.abs(Math.abs(c-towerS)-145);sA=c;}}
   const fA=frame(sA),xT=toward>0?0:Lm;
   // Backstays: straight from the saddle in the chain's plane, past the viaduct's deck (outside its walls; pushed out
   // wherever one would come within reach of the road) and down into an anchorage block on the ground under it.
   const gA=bed(fA.x,fA.y),blockTop=Math.min(gA+7.5,fA.z-1.15-truss-2.2),offA=offOf(fA),stays=[];
   const nearest=Q=>{const xE=(Q[0]-fC.x)*E[0]+(Q[1]-fC.y)*E[1],s0=towerS+(xE-xT);let bs=s0,bd=Infinity;for(let k=-10;k<=10;k+=.5){const f=frame(s0+k),dd=Math.hypot(Q[0]-f.x,Q[1]-f.y);if(dd<bd){bd=dd;bs=s0+k;}}return frame(bs);};
   const latOf=(Q,f,sd)=>((Q[0]-f.x)*f.n[0]+(Q[1]-f.y)*f.n[1])*sd;
   for(const sd of [-1,1]){
    const S0=ax(xT,sd*dT,saddle);let dA=dT-sd*offA;
    const end=()=>[fA.x+fA.n[0]*sd*dA,fA.y+fA.n[1]*sd*dA,blockTop+.4];
    for(let it=0;it<6;it++){
     const S1=end();let need=0;
     for(let u=.3;u<=1;u+=.01){const Q=add(S0,mul(sub(S1,S0),u)),f=nearest(Q),lat=latOf(Q,f,sd),h=Q[2]-f.z;
      if(h>-1.6&&h<5.6)need=Math.max(need,wallBack(f,sd)+.5-lat);else if(h<=-1.6&&h>-1.75-truss)need=Math.max(need,dTr+1.3-lat);}
     if(need<=.01)break;dA+=need;
    }
    const S1=end(),n=Math.max(4,Math.round(len(sub(S1,S0))/14)),sl=len(sub(S1,S0));
    for(let d=chainStep;d<sl-1;d+=chainStep){if(glim()<.012)continue;const k=arch.length;arch.push({p:add(add(S0,mul(sub(S1,S0),d/sl)),[0,0,.5]),c:[1,1,1],i:.9+glim()*.2,s:.1,g:1,on:.2,ph:glim()});if(k%12===0)reflected.push({...arch[k],i:arch[k].i*1.2,s:.3});}
    for(let k=0;k<n;k++){const p=add(S0,mul(sub(S1,S0),k/n)),q=add(S0,mul(sub(S1,S0),(k+1)/n));link(m,p,q,k%2,steelTone(.98));if(k)pin(m,p,steelTone(.9));}
    // The anchor casting the last link pins into, on the block.
    pin(m,S1,steelTone(.9));m.beam(add(S1,[0,0,-.75]),add(S1,[0,0,.25]),1.3,1.6,fA.t,steelTone(.8),{rivets:false});
    let cross=null;for(let u=.3;u<=1;u+=.004){const Q=add(S0,mul(sub(S1,S0),u)),f=nearest(Q);if(Q[2]<=f.z){cross={s:f.s,lat:latOf(Q,f,sd)};break;}}
    stays.push({sd,dA,cross});
   }
   // The anchorage block, cyclopean concrete on the shore: a plinth, battered walls, a coping the chains go into.
   const wA=Math.max(...stays.map(s=>s.dA))+2.6,ch=1.5,hl=9.5,za=lowest([fA.x,fA.y],fA.t,fA.n,hl+.8,wA+.8)-1.5,zp=gA+.9;
   const box=(z,l,w)=>[[-l+ch,-w],[l-ch,-w],[l,-w+ch],[l,w-ch],[l-ch,w],[-l+ch,w],[-l,w-ch],[-l,-w+ch]].map(([e,d])=>[fA.x+fA.t[0]*e+fA.n[0]*d,fA.y+fA.t[1]*e+fA.n[1]*d,z]);
   if(blockTop>zp+1){const bat=(blockTop-zp)*.07,as=[box(za,hl+.8,wA+.8),box(zp,hl+.8,wA+.8),box(zp,hl,wA),box(blockTop-.7,hl-bat,wA-bat),box(blockTop-.7,hl-bat+.3,wA-bat+.3),box(blockTop,hl-bat+.3,wA-bat+.3)];
    cc.loft(as,PIER,{closed:true});cc.cap(as.at(-1),PIER,Z);}
   // Walkway inner edge: a metre off the wall, out to the main span's line near the tower, round the chain where it
   // comes through the deck.
   const walkIn=(f,sd)=>{let d=lerp(wallBack(f,sd)+.95,dW,smooth(42,10,Math.abs(f.s-towerS)));const st=stays.find(q=>q.sd===sd);if(st?.cross)d=Math.max(d,(st.cross.lat+.65)*(1-smooth(5,12,Math.abs(f.s-st.cross.s))));return d;};
   // Deck, walkways and railings along the track, every 2 m.
   const n=Math.ceil(span/(mobile?4:2)),ss=[];for(let k=0;k<=n;k++)ss.push(sFrom+span*k/n);
   for(let k=0;k<n;k++){
    const f0=frame(ss[k]),f1=frame(ss[k+1]);
    for(const sd of [-1,1]){
     const P0=(d,dz)=>onTrack(f0,sd*d,dz),P1=(d,dz)=>onTrack(f1,sd*d,dz),wi0=walkIn(f0,sd),wi1=walkIn(f1,sd);
     m.quad(P0(f0.w/2-.02,-.03),P1(f1.w/2-.02,-.03),P1(wallBack(f1,sd),-.06),P0(wallBack(f0,sd),-.06),GRATE,Z);
     m.quad(P0(wallBack(f0,sd),-.06),P1(wallBack(f1,sd),-.06),P1(wi1,-.08),P0(wi0,-.08),DECK,Z);
     m.quad(P0(wi0,.12),P1(wi1,.12),P1(wi1+walkW,.12),P0(wi0+walkW,.12),WALK,Z);
     m.quad(P0(wi0,-.12),P1(wi1,-.12),P1(wi1+walkW,-.12),P0(wi0+walkW,-.12),DECK,mul(Z,-1));
     m.quad(P0(wi0+walkW,-.12),P1(wi1+walkW,-.12),P1(wi1+walkW,.12),P0(wi0+walkW,.12),DECK,mul(f0.n,sd));
     m.quad(P0(wi0,-.12),P1(wi1,-.12),P1(wi1,.12),P0(wi0,.12),DECK,mul(f0.n,-sd));
     const r0=P0(wi0+walkW-.06,.12),r1=P1(wi1+walkW-.06,.12);
     m.beam(add(r0,[0,0,1.08]),add(r1,[0,0,1.08]),.07,.09,Z,steelTone(),{caps:false,rivets:false});if(mobile||k%2===0)m.beam(r0,add(r0,[0,0,1.1]),.07,.07,f0.t,steelTone(),{rivets:false});
     if(!mobile)lm.quad(add(r0,[0,0,.04]),add(r1,[0,0,.04]),add(r1,[0,0,1.04]),add(r0,[0,0,1.04]),steelTone(),mul(f0.n,sd),[[.52,0,0],[.52,span/n/1.2,0],[.98,span/n/1.2,0],[.98,0,0]]);
    }
    const u0=Math.max(walkIn(f0,1),walkIn(f0,-1))+walkW,u1=Math.max(walkIn(f1,1),walkIn(f1,-1))+walkW;
    m.quad(onTrack(f0,-u0,-.34),onTrack(f1,-u1,-.34),onTrack(f1,u1,-.34),onTrack(f0,u0,-.34),DECK,mul(Z,-1));
   }
   // Deck truss panels between supports (≤6.2 m), Warren web with verticals, floor beams, laterals.
   const panels=[];for(let k=0;k+1<supports.length;k++){const n=Math.max(1,Math.ceil((supports[k+1]-supports[k])/6.2));for(let j=0;j<n;j++)panels.push(supports[k]+(supports[k+1]-supports[k])*j/n);}panels.push(sTo);
   const node=(s,sd,dz)=>{const f=frame(s);return onTrack(f,sd*dTr,dz);};
   for(let k=0;k<panels.length;k++){
    const s=panels[k],f=frame(s);
    for(const sd of [-1,1]){
     const top=node(s,sd,-1.15),bot=node(s,sd,-1.15-truss);
     laced(m,lm,add(top,[0,0,-.25]),add(bot,[0,0,.25]),.4,.45,f.n,steelTone());
     if(k+1<panels.length){
      const s1=panels[k+1],t1=node(s1,sd,-1.15),b1=node(s1,sd,-1.15-truss);
      m.beam(top,t1,.55,.5,Z,steelTone(),{caps:false});m.beam(bot,b1,.55,.5,Z,steelTone(),{caps:false});
      laced(m,lm,k%2?add(top,[0,0,-.25]):add(bot,[0,0,.25]),k%2?add(b1,[0,0,.25]):add(t1,[0,0,-.25]),.4,.45,f.n,steelTone());
      m.beam(node(s,sd,-1.15-truss),node(s1,-sd,-1.15-truss),.2,.2,Z,steelTone(.85),{caps:false,rivets:false});
     }
    }
    const wo=Math.max(walkIn(f,1),walkIn(f,-1))+walkW;
    m.beam(onTrack(f,-dTr,-.62),onTrack(f,dTr,-.62),.4,.55,Z,steelTone(.85));
    for(const sd of [-1,1])if(!stays.some(q=>q.sd===sd&&q.cross&&Math.abs(f.s-q.cross.s)<3))m.beam(onTrack(f,sd*dTr,-.62),onTrack(f,sd*wo,-.3),.3,.42,Z,steelTone(.85));
   }
   // Trestle towers: two bents per tower, laced legs battered out to concrete footings, X bracing in tiers.
   const footD=(H)=>dTr+.1*H;
   for(let k=1;k+1<supports.length;k+=2){
    const pair=[supports[k],supports[k+1]].map(s=>{const f=frame(s),top=f.z-1.15-truss-.3;
     return [-1,1].map(sd=>{const c=onTrack(f,sd*dTr,0),g=bed(c[0],c[1]),zf=Math.max(g+.5,1.3),H=top-zf,fd=footD(Math.max(0,H)),fp=onTrack(f,sd*fd,0);return {f,sd,top:[c[0],c[1],top],foot:[fp[0],fp[1],zf],g,H};});});
    for(const bent of pair){
     const f=bent[0].f;
     for(const l of bent){
      if(l.H>1)laced(m,lm,l.top,l.foot,.7,.55,f.n,steelTone());
      const fz=l.g-1.5;cc.beam([l.foot[0],l.foot[1],l.foot[2]+.02],[l.foot[0],l.foot[1],fz],1.8,1.8,f.t,PIER);
     }
     const H=Math.min(bent[0].H,bent[1].H);if(H<=1)continue;
     const nt=Math.max(1,Math.round(H/7)),lv=t=>bent.map(l=>add(l.top,mul(sub(l.foot,l.top),t)));
     for(let j=0;j<nt;j++){const [a0,b0]=lv(j/nt),[a1,b1]=lv((j+1)/nt);m.beam(a0,b1,.22,.22,Z,steelTone(.95),{caps:false});m.beam(b0,a1,.22,.22,Z,steelTone(.95),{caps:false});if(j)laced(m,lm,a0,b0,.55,.4,f.t,steelTone());}
     if(H>6){const [a1,b1]=lv(.92);laced(m,lm,a1,b1,.55,.4,f.t,steelTone());}
    }
    // Longitudinal bracing between the two bents, on each leg line.
    for(let j=0;j<2;j++){const A=pair[0][j],B=pair[1][j],H=Math.min(A.H,B.H);if(H<=1)continue;const nt=Math.max(1,Math.round(H/7)),lv=(l,t)=>add(l.top,mul(sub(l.foot,l.top),t));
     for(let i=0;i<nt;i++){m.beam(lv(A,i/nt),lv(B,(i+1)/nt),.2,.2,Z,steelTone(.95),{caps:false});m.beam(lv(B,i/nt),lv(A,(i+1)/nt),.2,.2,Z,steelTone(.95),{caps:false});if(i)laced(m,lm,lv(A,i/nt),lv(B,i/nt),.5,.4,A.f.n,steelTone());}}
   }
   // Abutment wall at the land end of the viaduct.
   const fe=frame(toward>0?sFrom+1.5:sTo-1.5),ge=bed(fe.x,fe.y);
   if(fe.z-ge>.8)cc.beam([fe.x,fe.y,fe.z-.45],[fe.x,fe.y,ge-1],2.5,2*(Math.max(walkIn(fe,1),walkIn(fe,-1))+walkW),fe.n,PIER);
   return {supports,anchorage:sA,stays:stays.map(s=>({side:s.sd,d:+s.dA.toFixed(2),cross:s.cross&&+s.cross.s.toFixed(1)})),block:[+gA.toFixed(1),+blockTop.toFixed(1)]};
  }
  const s0=info.s0,s1=info.s1,sCu=sC<s0?sC+L:sC,sCont=s0<=sCu?s0:s0-L;
  const cont=viaduct(sCont,sCu-2,Math.max(0,(info.continental_spans??7)-1),sCu,viaC,laceC);
  const isl=viaduct(sI+2,s1<sI?s1+L:s1,Math.max(0,(info.insular_spans??8)-1),sI,viaI,laceI);

  emit(towerC,washes.tower,'HL_torre_continente');emit(towerI,washes.tower,'HL_torre_ilha');
  emit(meshA,washes.span,'HL_vao_central_continente');emit(meshB,washes.span,'HL_vao_central_ilha');
  emit(viaC,washes.via,'HL_viaduto_continente');emit(viaI,washes.via,'HL_viaduto_ilha');
  emit(cc,concrete,'HL_pilares_ancoragens');
  for(const [lm,name] of [[laceC,'HL_trelicas_continente'],[laceI,'HL_trelicas_ilha']]){const mesh=emit(lm,lace,name,{uv:true});if(mesh)laceMeshes.push(mesh);}
  stats.hercilioLuz={mainSpan:+Lm.toFixed(1),trussPlane:+dT.toFixed(2),walkway:[+dW.toFixed(2),+dWo.toFixed(2)],chainLow:+low.toFixed(2),saddle,panels:NP,
   continental:{supports:cont.supports.map(v=>+wrap(v).toFixed(1)),anchorage:+cont.anchorage.toFixed(1),stays:cont.stays,block:cont.block},insular:{supports:isl.supports.map(v=>+wrap(v).toFixed(1)),anchorage:+wrap(isl.anchorage).toFixed(1),stays:isl.stays,block:isl.block}};
  }

 // ================================================================ Colombo Salles and Pedro Ivo Campos
 function colomboSalles(info){
  const s0=info.s0,s1=info.s1,nav=info.navigation_s??(s0+s1)/2,main=info.main_span_m??157,side=(314-main)/2;
  const sum=x=>x.reduce((p,q)=>p+q,0);
  // Spans by expansion-joint unit, out from the navigation span (facts: 38 | 230 | 149 | 314 | 233 | 5×42 | 44).
  const contSpans=[[side,'M'],[149/2,'C1'],[149/2,'C1'],[230/3,'C2'],[230/3,'C2'],[230/3,'C2'],[38,'C3']];
  const islSpans=[[side,'M'],[233/3,'I1'],[233/3,'I1'],[233/3,'I1'],[42,'L1'],[42,'L2'],[42,'L3'],[42,'L4'],[42,'L5'],[44,'L6']];
  const spans=[];let s=nav-main/2;const kI=(s-s0)/sum(islSpans.map(q=>q[0]));
  for(const [l,u] of islSpans){spans.unshift({a:s-l*kI,b:s,unit:u});s-=l*kI;}
  spans.push({a:nav-main/2,b:nav+main/2,unit:'M'});
  s=nav+main/2;const kC=(s1-s)/sum(contSpans.map(q=>q[0]));for(const [l,u] of contSpans){spans.push({a:s,b:s+l*kC,unit:u});s+=l*kC;}
  // Girder depth: haunched at the continuous supports (deepest at the navigation piers), shallow at the joints.
  const base=l=>l>=100?7.6:l>=60?4.4:2.4,mid=l=>l>=100?3.1:l>=60?2.5:2.3,endJ=l=>l>=60?2.8:2.4;
  spans.forEach((sp,j)=>{const l=sp.b-sp.a,prev=spans[j-1],next=spans[j+1];
   sp.hA=!prev?mid(l):prev.unit===sp.unit?Math.max(base(l),base(prev.b-prev.a)):endJ(l);
   sp.hB=!next?mid(l):next.unit===sp.unit?Math.max(base(l),base(next.b-next.a)):endJ(l);sp.hm=mid(l);});
  const depth=s=>{const sp=spans.find(q=>s<=q.b)??spans.at(-1),u=clamp((s-sp.a)/(sp.b-sp.a),0,1);return u<.5?sp.hm+(sp.hA-sp.hm)*(1-2*u)**2:sp.hm+(sp.hB-sp.hm)*(2*u-1)**2;};
  const piers=spans.slice(1).map((sp,j)=>{const prev=spans[j],l=Math.max(sp.b-sp.a,prev.b-prev.a);return {s:sp.a,joint:prev.unit!==sp.unit,kind:l>=100?'main':l>=60?'water':'land',h:Math.max(prev.hB,sp.hA)};});
  const CON=tint('#aaa69d'),CON2=tint('#b4b0a6'),SOFF=tint('#8f8b83'),PI_CON=tint('#b8b5ac'),PI_STEEL=tint('#59646d'),PATH=tint('#9a6a5a');
  const tones=spans.map(()=>.92+rand()*.14);
  const spanTone=s=>tones[Math.max(0,spans.findIndex(q=>s<=q.b))];
  // Flared wall pier: chamfered rectangle, widening over its top third to carry the box's bottom slab.
  function wallPier(m,c,t,n,zb,zt,kind,joint,col){
   if(zt-zb<1)return;
   const th=(kind==='main'?4.2:kind==='water'?2.5:1.7)+(joint?.5:0),wb=kind==='main'?7.2:kind==='water'?6.2:5.4,wt=8.7,zf=zt-Math.min(6,(zt-zb)*.38),ch=.3;
   const ring=(z,u)=>{const A=(wb+(wt-wb)*u**1.8)/2,B=th/2+.25*u*u;return [[-B+ch,-A],[B-ch,-A],[B,-A+ch],[B,A-ch],[B-ch,A],[-B+ch,A],[-B,A-ch],[-B,-A+ch]].map(([e,d])=>[c[0]+t[0]*e+n[0]*d,c[1]+t[1]*e+n[1]*d,z]);};
   const secs=[ring(zb,0),ring(zf,0)];for(let k=1;k<=4;k++)secs.push(ring(zf+(zt-zf)*k/4,k/4));
   m.loft(secs,col,{closed:true});m.cap(secs.at(-1),col,Z);
  }
  // --- Colombo Salles deck: the driven road's girder, a slim parapet/cornice outside the game's Jersey walls.
  const chunks=[new Mesher(),new Mesher(),new Mesher()],chunk=s=>chunks[Math.min(2,Math.floor((s-s0)/(s1-s0)*3))];
  const stations=[];for(let x=s0;x<s1;x+=mobile?4:2)stations.push(x);stations.push(s1);for(const p of piers)stations.push(p.s);stations.sort((p,q)=>p-q);for(let k=stations.length-1;k>0;k--)if(stations[k]-stations[k-1]<.3)stations.splice(k,1);
  const secs=stations.map(s=>{const f=frame(s),h=depth(s),dL=wallBack(f,1)+.02,dR=wallBack(f,-1)+.02,aw=f.w/2-.02;
   return [[-aw,-.03],[-dR,-.06],[-dR,.95],[-dR-.33,.95],[-dR-.36,-1.05],[-dR+.12,-1.05],[-dR+.12,-.45],[-4.6,-.8],[-3.9,-h],[3.9,-h],[4.6,-.8],[dL-.12,-.45],[dL-.12,-1.05],[dL+.36,-1.05],[dL+.33,.95],[dL,.95],[dL,-.06],[aw,-.03]].map(([d,z])=>onTrack(f,d,z));});
  // Edge colours: deck strip, cornice (inner face, top, outer face, foot), soffits, webs, bottom slab.
  const edgeCol=[CON,CON2,CON2,CON2,CON2,SOFF,SOFF,CON,SOFF,CON,SOFF,SOFF,CON2,CON2,CON2,CON2,CON];
  for(let i=0;i+1<stations.length;i++){const k=spanTone((stations[i]+stations[i+1])/2);chunk(stations[i]).loft([secs[i],secs[i+1]],edgeCol.map(c=>mul(c,k)));}
  for(const p of piers){const f=frame(p.s),c=[f.x,f.y],zb=Math.min(lowest(c,f.t,f.n,2.6,4.6),0)-1.5,zt=f.z-depth(p.s)-.02;wallPier(chunk(p.s),c,f.t,f.n,zb,zt,p.kind,p.joint,mul(CON,.97+rand()*.06));}
  for(let s=s0+14;s<s1-8;s+=35)for(const sd of [-1,1]){const f=frame(s),d=wallBack(f,sd)+.2;lamps.pole.push({p:onTrack(f,sd*d,.95),dir:mul(f.n,-sd),pool:(u,v)=>onTrack(frame(s+u),sd*(d-4.6)+v,.07)});}
  chunks.forEach((m,k)=>emit(m,concrete,'Colombo_Salles_'+(k+1)));

  // --- Pedro Ivo Campos: the twin to the south (the left of Colombo's direction), from its own axis points.
  const tw=info.twin;if(!tw?.points?.length)return;
  const pts=tw.points,acc=[0];for(let k=1;k<pts.length;k++)acc.push(acc[k-1]+Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]));
  const total=acc.at(-1);
  const twinAt=d=>{d=clamp(d,0,total);let k=1;while(k<acc.length-1&&acc[k]<d)k++;const u=(d-acc[k-1])/((acc[k]-acc[k-1])||1),p=pts[k-1],q=pts[k];
   const t=unit([q[0]-p[0],q[1]-p[1],0]);return {x:p[0]+(q[0]-p[0])*u,y:p[1]+(q[1]-p[1])*u,z:p[2]+(q[2]-p[2])*u,t,n:[-t[1],t[0],0],a:d};};
  // Where a line across Colombo at s meets the twin's axis (arc length), for piers in line and the depth profile.
  const across=s=>{const f=frame(s);let best=null;for(let k=1;k<pts.length;k++){const p=pts[k-1],q=pts[k],ex=q[0]-p[0],ey=q[1]-p[1],den=f.n[0]*ey-f.n[1]*ex;if(Math.abs(den)<1e-9)continue;
   const wx=p[0]-f.x,wy=p[1]-f.y,u=(wx*ey-wy*ex)/den,v=(wx*f.n[1]-wy*f.n[0])/den;if(v>=-1e-6&&v<=1+1e-6&&Math.abs(u)>8&&Math.abs(u)<90&&(!best||Math.abs(u)<Math.abs(best.u)))best={u,a:acc[k-1]+v*(acc[k]-acc[k-1])};}return best;};
  const pairs=[];for(let s=s0;s<=s1;s+=6){const c=across(s);if(c)pairs.push([c.a,s]);}pairs.sort((p,q)=>p[0]-q[0]);
  const sOfA=aa=>{if(!pairs.length)return (s0+s1)/2;if(aa<=pairs[0][0])return pairs[0][1]-(aa-pairs[0][0]);if(aa>=pairs.at(-1)[0])return pairs.at(-1)[1]-(aa-pairs.at(-1)[0]);
   let k=1;while(pairs[k][0]<aa)k++;const [a0,x0]=pairs[k-1],[a1,x1]=pairs[k];return x0+(x1-x0)*(aa-a0)/((a1-a0)||1);};
  const navA=across(nav)?.a??total/2,steelFrom=navA-157.5,steelTo=navA+157.5;
  const tChunks=[new Mesher(),new Mesher(),new Mesher()],tChunk=aa=>tChunks[Math.min(2,Math.floor(aa/total*3))],tSteel=new Mesher(),road=new Mesher(),tLace=new Mesher();
  const twinSecs=[],twinSt=[];for(let d=0;d<total;d+=4)twinSt.push(d);twinSt.push(total);
  const tdepth=aa=>{const s=sOfA(aa);return s<s0?2.3:s>s1?2.3:depth(s);};
  // Section (d to the twin's left = north, toward Colombo): box girder, north parapet with its cornice, south parapet,
  // the shared path and its railing kerb.
  const PI_SEC=h=>[[-7.,-.1],[-7.2,0],[-7.25,.08],[-7.45,.33],[-7.66,.9],[-7.98,.9],[-7.98,.15],[-10.55,.15],[-10.55,.32],[-10.9,.32],[-10.93,-1.0],[-10.58,-1.0],[-10.58,-.45],[-4.6,-.8],[-3.9,-h],[3.9,-h],[4.6,-.8],[7.95,-.45],[7.95,-1.0],[8.3,-1.0],[8.27,.9],[7.66,.9],[7.45,.33],[7.25,.08],[7.2,0],[7.,-.1]];
  const BOX=new Set([12,13,14,15,16]);
  for(const d of twinSt){const q=twinAt(d),h=tdepth(d);twinSecs.push(PI_SEC(h).map(([o,z])=>[q.x+q.n[0]*o,q.y+q.n[1]*o,q.z+z]));}
  const piCol=[PI_CON,PI_CON,PI_CON,PI_CON,CON2,PI_CON,PATH,CON2,CON2,CON2,CON2,SOFF,SOFF,SOFF,SOFF,SOFF,SOFF,CON2,CON2,CON2,CON2,PI_CON,PI_CON,PI_CON,PI_CON];
  for(let i=0;i+1<twinSt.length;i++){
   const am=(twinSt[i]+twinSt[i+1])/2,steelHere=am>steelFrom&&am<steelTo,k=.95+.08*hash1(Math.floor(am/40));
   tChunk(am).loft([twinSecs[i],twinSecs[i+1]],piCol.map((c,j)=>steelHere&&BOX.has(j)?PI_STEEL:mul(c,k)),{to:(_,j)=>steelHere&&BOX.has(j)?tSteel:null});
   // Carriageway (the lines are in the texture) and the path's railing.
   const q0=twinAt(twinSt[i]),q1=twinAt(twinSt[i+1]),v0=twinSt[i]/24,v1=twinSt[i+1]/24,P=(q,o,z)=>[q.x+q.n[0]*o,q.y+q.n[1]*o,q.z+z];
   road.quad(P(q0,-7.2,0),P(q1,-7.2,0),P(q1,7.2,0),P(q0,7.2,0),[1,1,1],Z,[[0,v0,0],[0,v1,0],[1,v1,0],[1,v0,0]]);
   const r0=P(q0,-10.72,.32),r1=P(q1,-10.72,.32);tSteel.beam(add(r0,[0,0,1.0]),add(r1,[0,0,1.0]),.07,.08,Z,tint('#9ba1a4'),{caps:false,rivets:false});
   if(i%2===0)tSteel.beam(r0,add(r0,[0,0,1.02]),.07,.07,q0.t,tint('#9ba1a4'),{rivets:false});
   if(!mobile)tLace.quad(add(r0,[0,0,.03]),add(r1,[0,0,.03]),add(r1,[0,0,.98]),add(r0,[0,0,.98]),tint('#a7adb0'),q0.n,[[.52,v0*20,0],[.52,v1*20,0],[.98,v1*20,0],[.98,v0*20,0]]);
  }
  for(const p of piers){const c=across(p.s);if(!c)continue;const q=twinAt(c.a),zb=Math.min(lowest([q.x,q.y],q.t,q.n,2.6,4.6),0)-1.5,zt=q.z-tdepth(c.a)-.02;wallPier(tChunk(c.a),[q.x,q.y],q.t,q.n,zb,zt,p.kind,p.joint,mul(PI_CON,.96+rand()*.06));}
  for(let d=10;d<total-6;d+=35){const q=twinAt(d),at=(u,o)=>{const r=twinAt(d+u);return [r.x+r.n[0]*o,r.y+r.n[1]*o,r.z+.07];};
   lamps.pole.push({p:[q.x+q.n[0]*7.97,q.y+q.n[1]*7.97,q.z+.9],dir:mul(q.n,-1),pool:(u,v)=>at(u,3.4+v)});lamps.pole.push({p:[q.x-q.n[0]*7.82,q.y-q.n[1]*7.82,q.z+.9],dir:q.n,pool:(u,v)=>at(u,-3.3+v)});}
  tChunks.forEach((m,k)=>emit(m,concrete,'Pedro_Ivo_'+(k+1)));emit(tSteel,steel,'Pedro_Ivo_aco');
  emit(road,asphalt,'Pedro_Ivo_pista',{cast:false,uv:true});
  const tl=emit(tLace,lace,'Pedro_Ivo_guarda_corpo',{uv:true});if(tl)laceMeshes.push(tl);
  stats.colomboSalles={spans:spans.map(sp=>+(sp.b-sp.a).toFixed(1)),piers:piers.length,navigation:nav,depthMain:+depth(nav-main/2).toFixed(2),twin:{length:+total.toFixed(1),steel:[+steelFrom.toFixed(1),+steelTo.toFixed(1)]}};
 }

 const hl=list.find(b=>b.kind==='hercilio_luz');if(hl)hercilioLuz(hl);
 const cs=list.find(b=>b.kind==='colombo_salles');if(cs)colomboSalles(cs);

 // --- Lamp posts (instanced): tall single-arm poles on the Colombo Salles and the Pedro Ivo, brackets on the trusses.
 function lampGeometry(kind){
  const m=new Mesher(),pole=tint('#a3a9ac'),head=tint('#3b3f43'),lens=tint('#e4e8e6');
  // (The lens's vertices marked steelUv.z = -1: they glow at night.)
  const lensBeam=(a,b,w,h)=>{const k=m.p.length/3;m.beam(a,b,w,h,Z,lens,{rivets:false});for(let i=k;i<m.p.length/3;i++)m.u[i*3+2]=-1;};
  if(kind==='pole'){
   m.cyl([0,0,0],[0,0,.3],.16,.15,8,pole);m.cyl([0,0,.3],[0,0,12.3],.125,.08,8,pole,{caps:false});
   const arm=[[0,0,11.9],[.35,0,12.45],[1.1,0,12.75],[2.6,0,12.85]];for(let k=0;k+1<arm.length;k++)m.cyl(arm[k],arm[k+1],.065,.06,6,pole,{caps:false});
   m.beam([2.35,0,12.82],[3.2,0,12.78],.36,.16,Z,head,{rivets:false});lensBeam([2.45,0,12.73],[3.1,0,12.72],.28,.02);
  }else{
   m.beam([0,0,0],[1.15,0,.28],.08,.1,Z,pole,{rivets:false});m.beam([0,0,-.35],[0,0,.35],.16,.1,[1,0,0],pole,{rivets:false});
   m.beam([.95,0,.22],[1.55,0,.2],.3,.14,Z,head,{rivets:false});lensBeam([1.0,0,.14],[1.5,0,.13],.22,.02);
  }
  return m.geometry();
 }
 for(const kind of ['pole','bracket']){
  const list=lamps[kind];if(!list.length)continue;
  const mesh=new THREE.InstancedMesh(lampGeometry(kind),lampMaterial,list.length);mesh.name=kind==='pole'?'Postes_Colombo_Pedro_Ivo':'Luminarias_Hercilio_Luz';
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),lean=new THREE.Quaternion(),pos=new THREE.Vector3(),one=new THREE.Vector3(1,1,1),c=new THREE.Color();
  list.forEach((l,k)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(l.dir[1],l.dir[0]));lean.setFromAxisAngle(new THREE.Vector3(1,0,0),(rand()-.5)*.012);q.multiply(lean);
   mtx.compose(pos.set(l.p[0],l.p[2],-l.p[1]),q,one);mesh.setMatrixAt(k,mtx);const t=.94+rand()*.1;mesh.setColorAt(k,c.setRGB(t,t,t*(1+(rand()-.5)*.03)));});
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);stats.instances+=list.length;stats.drawCalls++;stats.meshes++;stats.triangles+=mesh.geometry.index.count/3*list.length;
 }
 // Each lamp's lens as a glowing light (its own tint: mostly the LEDs of the 2019 relamping, a few old sodium lamps on
 // the Colombo Salles and the Pedro Ivo; one flickers), its streak on the water, and its pool of light on the deck.
 const poolVerts=[],poolCols=[],poolUvs=[],poolIdx=[];
 for(const kind of ['pole','bracket'])for(const l of lamps[kind]){
  const head=kind==='pole'?add(add(l.p,mul(l.dir,2.78)),[0,0,12.66]):add(add(l.p,mul(l.dir,1.25)),[0,0,.1]);
  const sodium=kind==='pole'&&glim()<.16,c=sodium?[1,.56,.22]:kind==='pole'?[1,.88+glim()*.05,.72+glim()*.08]:[1,.84,.6],flicker=kind==='pole'&&glim()<.03;
  const light={p:head,c,i:(sodium?3.2:4)*(.9+glim()*.2),s:.2,g:0,on:.05+glim()*.08,ph:glim(),blink:flicker?[.31+glim()*.2,.7]:null,tw:flicker?.35:0};
  arch.push(light);reflected.push({...light,s:.5});
  // The pool: a draped grid along the deck (u along, v across), brightest under the head.
  const along=kind==='pole'?13:8,across=kind==='pole'?7.5:4.5,base=poolVerts.length/3,warm=c.map(v=>v*(.85+glim()*.3));
  for(let j=0;j<=2;j++)for(let i=0;i<=6;i++){const u=i/3-1,v=j-1,q=l.pool(u*along,v*across);poolVerts.push(q[0],q[2],-q[1]);poolCols.push(...warm);poolUvs.push(u*.5+.5,v*.5+.5);}
  for(let j=0;j<2;j++)for(let i=0;i<6;i++){const a=base+j*7+i;poolIdx.push(a,a+1,a+8,a,a+8,a+7);}
 }
 let pools=null;
 if(poolIdx.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(poolVerts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(poolCols,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(poolUvs,2));g.setIndex(poolIdx);g.computeBoundingSphere();
  const disc=canvasTexture((ctx,w,h)=>{const gr=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.6)');gr.addColorStop(.6,'rgba(255,255,255,.18)');gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);},64,64);
  const pm=new THREE.MeshBasicMaterial({name:'Pontes_luz_no_tabuleiro',map:disc,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  // Fog darkens the pools instead of greying them (an additive grey would light the fog itself).
  pm.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#ifdef USE_FOG
 gl_FragColor.rgb*=1.-smoothstep(fogNear,fogFar,vFogDepth);
#endif`);};
  pm.customProgramCacheKey=()=>'floripa-bridge-pools-v1';
  pools=new THREE.Mesh(g,pm);pools.name='Pontes_luz_no_tabuleiro';pools.visible=false;pools.renderOrder=1;pools.matrixAutoUpdate=false;root.add(pools);
 }
 const night=lightUniforms(),glow=nightLights(arch,night,{name:'Pontes_luzes',minPx:mobile?1.4:1.6,floor:.2}),streaks=waterGlints(reflected,night,{name:'Pontes_reflexos',level:data.meta.sea_level_m??0,slope:.055});
 root.add(glow.mesh,streaks.mesh);stats.drawCalls+=pools?3:2;
 const count=g=>arch.filter(l=>l.g===g).length;
 stats.night={level:0,scheme:null,silhouette:count(1),hangers:count(2),projectors:count(3),lamps:count(0),glints:reflected.length,pools:lamps.pole.length+lamps.bracket.length};
 root.updateMatrixWorld(true);
 // Far off the lacing and railings are a few pixels of shimmer: drawn near the bridge only.
 const camAt=new THREE.Vector3();
 function update(dt,camera){
  if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}
  if(!camera||!laceMeshes.length)return;camera.getWorldPosition(camAt);
  for(const mesh of laceMeshes){const s=mesh.geometry.boundingSphere;mesh.visible=camAt.distanceTo(s.center)-s.radius<650;}
 }
 // The night's scheme, drawn as the evening comes (a race at night or at dusk): the gold most nights, the cool white of
 // the first years after the reopening, a campaign's colour (pink in October, blue in November...) or a festive
 // night whose hangers run through the colours. ?ponte=dourado|branco|rosa|azul|verde_amarelo|festa picks one.
 let lit=0;
 function setNight(level){
  if(level>0&&!lit)stats.night.scheme=pickScheme(Math.random);
  lit=level;night.uNight.value=level;stats.night.level=level;
  const S=SCHEMES[stats.night.scheme]??SCHEMES.dourado,arch=level>=.99?1:2.4,G=night.uGroups.value;
  G[0].set(1,1,1,level>=.99?1:2.2);G[1].set(...S.chain,3.2*arch);G[2].set(...S.hang,2.4*arch);G[3].set(...S.tower,1.2*arch);
  night.uHue.value.set(S.hue?4:0,.035,.0035,0);
  const w=level<=0?0:level>=.99?1:1.2;washes.tower?.userData.wash.brWash.value.set(...S.tower,.5*w);washes.span?.userData.wash.brWash.value.set(...S.hang,.16*w);washes.via?.userData.wash.brWash.value.set(...S.chain,.18*w);
  lampGlow.value.set(1,.86,.66).multiplyScalar(level>0?5:0);
  glow.mesh.visible=streaks.mesh.visible=level>0;if(pools){pools.visible=level>0;pools.material.opacity=.34*Math.min(1,level*1.4);}
 }
 stats.trianglesK=Math.round(stats.triangles/1000);
 return {root,obstacles,update,setNight,stats};
}
