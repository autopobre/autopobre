import * as THREE from 'three';
import {lookColors,lookKey} from './pilot-look.js';

// Full-face shell profile, chin to crown: [height, radius toward the front and back, radius to
// the sides, forward offset]. Local +X faces forward, +Y up, +/-Z sides; the rivals' helmets
// (rival-driver.js) share it.
const rings=[[-.139,.067,.073,-.009],[-.118,.118,.105,.012],[-.073,.144,.121,.017],
 [-.021,.140,.123,.008],[.006,.137,.124,.002],[.055,.131,.122,-.004],
 [.096,.119,.111,-.012],[.127,.096,.091,-.019],[.151,.059,.058,-.025],[.161,.001,.001,-.028]];
export const HELMET_RINGS=rings.map(r=>r[0]);
export function helmetSurface(y,a,lift=0){
 let i=0;while(i<rings.length-2&&rings[i+1][0]<y)i++;
 const r=rings[i],b=rings[i+1],t=THREE.MathUtils.clamp((y-r[0])/(b[0]-r[0]),0,1),mix=k=>THREE.MathUtils.lerp(r[k],b[k],t);
 return new THREE.Vector3(mix(3)+(mix(1)+lift)*Math.cos(a),y,(mix(2)+lift)*Math.sin(a));
}
// A band of the shell's paint between two heights, from angle a0 to a1 (lifted off the shell by lift).
function shellBand(y0,y1,a0,a1,cols,lift){
 const rows=[y0,...HELMET_RINGS.filter(y=>y>y0+1e-4&&y<y1-1e-4),y1],p=[],ix=[];
 for(const y of rows)for(let j=0;j<=cols;j++)p.push(...helmetSurface(y,a0+(a1-a0)*j/cols,lift).toArray());
 for(let i=0;i<rows.length-1;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;ix.push(a,b,a+1,a+1,b,b+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
// A stripe w wide over the top, from the brow over the crown down to the nape: along the shell's middle line, each
// side let down by how far the shell curves away there.
function topStripe(w=.022,lift=.004){
 const front=Array.from({length:10},(_,i)=>helmetSurface(.099+i*.0062,0)),back=Array.from({length:22},(_,i)=>helmetSurface(.158-i*.0125,Math.PI));
 const line=[...front,helmetSurface(.161,0),...back],across=[-1,-.5,0,.5,1],p=[],ix=[];
 for(let i=0;i<line.length;i++){
  const t=line[Math.min(line.length-1,i+1)].clone().sub(line[Math.max(0,i-1)]).normalize(),n=new THREE.Vector3(t.y,-t.x,0),bend=Math.max(.08,helmetSurface(line[i].y,Math.PI/2).z);
  for(const k of across)p.push(...line[i].clone().addScaledVector(n,lift-(k*w)**2/(2*bend)).add(new THREE.Vector3(0,0,k*w)).toArray());
 }
 const c=across.length;for(let i=0;i<line.length-1;i++)for(let j=0;j<c-1;j++){const a=i*c+j,b=a+c;ix.push(a,b,a+1,a+1,b,b+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
// Photo-based full-face helmet. look(look): the player's own (pilot-look.js: paint, detail colour and design, a visor shut
// in its tint); null: Stevan's, as in the photo.
export async function createHelmet(){
 const root=new THREE.Group();root.name='Capacete_preto_vermelho_balaclava';
 const paint=new THREE.MeshPhysicalMaterial({color:0x101218,roughness:.23,metalness:.12,clearcoat:1,clearcoatRoughness:.15});
 // Local soft light reflections keep the black lacquer readable inside the shaded cabin.
 const envCanvas=document.createElement('canvas');envCanvas.width=256;envCanvas.height=128;
 const ec=envCanvas.getContext('2d'),gradient=ec.createLinearGradient(0,0,0,128);
 gradient.addColorStop(0,'#8795a3');gradient.addColorStop(.52,'#303a45');gradient.addColorStop(1,'#131921');ec.fillStyle=gradient;ec.fillRect(0,0,256,128);
 for(const x of [45,183]){const glow=ec.createRadialGradient(x,39,2,x,39,29);glow.addColorStop(0,'#ffffff');glow.addColorStop(.5,'#aebbc7');glow.addColorStop(1,'#303a45');ec.fillStyle=glow;ec.fillRect(x-29,10,58,58);}
 const env=new THREE.CanvasTexture(envCanvas);env.mapping=THREE.EquirectangularReflectionMapping;env.colorSpace=THREE.SRGBColorSpace;paint.envMap=env;paint.envMapIntensity=.6;
 const rubber=new THREE.MeshStandardMaterial({color:0x080a0c,roughness:.84});
 const lining=new THREE.MeshStandardMaterial({color:0x191c20,roughness:1});
 const white=new THREE.MeshStandardMaterial({color:0xd4d0c4,roughness:1});
 const red=new THREE.MeshPhysicalMaterial({color:0xd41132,roughness:.28,clearcoat:.8});
 const silver=new THREE.MeshStandardMaterial({color:0x85898e,metalness:.8,roughness:.3});
 const visorMaterial=new THREE.MeshPhysicalMaterial({color:0x8496a4,roughness:.08,metalness:.1,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide});
 function mesh(g,m,parent=root){const o=new THREE.Mesh(g,m);parent.add(o);o.castShadow=!m.transparent;o.receiveShadow=true;return o;}
 function sphere(p,scale,m){const o=mesh(new THREE.SphereGeometry(1,32,20),m);o.position.set(...p);o.scale.set(...scale);return o;}
 function tube(points,r,m){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(16,points.length*2),r,8,false),m);}
 // Separate crown, eye aperture and projecting chin guard, not a solid ball over the face.
 const surface=helmetSurface,n=80,positions=[],indices=[];
 for(const r of rings)for(let j=0;j<=n;j++)positions.push(...surface(r[0],j/n*Math.PI*2).toArray());
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
  const a=(j+.5)/n*Math.PI*2,front=Math.cos(a)>Math.cos(1.02);
  if(i>=3&&i<=5&&front)continue;
  const p=i*(n+1)+j,q=p+n+1;indices.push(p,q,p+1,p+1,q,q+1);
 }
 const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();mesh(shell,paint).name='Casco_integral_com_abertura';
 // Padding and fireproof balaclava surround the visible face; hair and beard are covered.
 sphere([-.003,.015,0],[.098,.123,.097],lining);
 const balaclava=[sphere([.008,-.004,0],[.087,.117,.083],white),sphere([-.007,-.143,0],[.059,.052,.057],white)];
 const photo=await new THREE.TextureLoader().loadAsync('./assets/piloto/capacete_publico.jpg');photo.colorSpace=THREE.SRGBColorSpace;photo.anisotropy=8;
 const faceMaterial=new THREE.MeshStandardMaterial({map:photo,roughness:.96}),strokes=[];
 const fv=[],fu=[],fi=[],cols=48,rows=28;
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
  const v=i/rows,u=j/cols,y=-.025+v*.125,a=(u-.5)*2.20;
  const point=surface(y,a,-.003);
  point.x-=.012*Math.cos(a)**2*Math.sin(Math.PI*v);
  fv.push(...point.toArray());
  // Project the entire aperture, including the dark padding, to avoid a rectangular face patch.
  fu.push((275-u*250)/501,1-(284-v*133)/522);
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const p=i*(cols+1)+j,q=p+cols+1;fi.push(p,q,p+1,p+1,q,q+1);}
 const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute(fv,3));face.setAttribute('uv',new THREE.Float32BufferAttribute(fu,2));face.setIndex(fi);face.computeVertexNormals();const faceMesh=mesh(face,faceMaterial);faceMesh.name='Olhos_e_balaclava_da_referencia';
 for(const y of [-.021,.096])tube(Array.from({length:33},(_,i)=>surface(y,-1.04+i/32*2.08,.002)),.0035,rubber);
 for(const side of [-1,1])tube([-.021,.006,.055,.096].map(y=>surface(y,side*1.03,.002)),.004,rubber);
 tube(Array.from({length:65},(_,i)=>surface(-.132,i/64*Math.PI*2,.001)),.003,rubber);
 // Three red tapered cheek strokes visible in the photograph, mirrored across the chin.
 for(const side of [-1,1])for(let stripe=0;stripe<3;stripe++){
  const points=[],uv=[],idx=[];
  for(let i=0;i<=22;i++){
   const u=i/22,a=side*(.43+u*.94),y=-.050-stripe*.012+u*.030;
   for(const edge of [-1,1]){points.push(...surface(y+edge*.0045*Math.sin(Math.PI*u)**.5,a,.0015).toArray());uv.push(u,edge>0?1:0);}
   if(i<22){const k=i*2;idx.push(k,k+1,k+2,k+2,k+1,k+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(idx);g.computeVertexNormals();
  const decal=mesh(g,red);decal.material=red;red.side=THREE.DoubleSide;strokes.push(decal);
 }
 // Pale blank forehead oval in the reference (no invented helmet manufacturer).
 const badgePos=[],badgeIndex=[],radial=8,sectors=64;
 for(let r=0;r<=radial;r++)for(let i=0;i<=sectors;i++){
  const t=i/sectors*Math.PI*2,f=r/radial;
  badgePos.push(...surface(.124+Math.sin(t)*.010*f,Math.cos(t)*.49*f,.002).toArray());
  if(r<radial&&i<sectors){const p=r*(sectors+1)+i,q=p+sectors+1;badgeIndex.push(p,q,p+1,p+1,q,q+1);}
 }
 const badgeGeo=new THREE.BufferGeometry();badgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(badgePos,3));badgeGeo.setIndex(badgeIndex);badgeGeo.computeVertexNormals();const oval=mesh(badgeGeo,new THREE.MeshStandardMaterial({color:0xd9d8cf,roughness:.5,side:THREE.DoubleSide}));
 for(const side of [-1,1]){
  const pivot=mesh(new THREE.CylinderGeometry(.012,.012,.006,24),rubber);pivot.rotation.x=Math.PI/2;pivot.position.set(.041,.038,side*.119);
  const screw=mesh(new THREE.CylinderGeometry(.004,.004,.007,16),silver);screw.rotation.x=Math.PI/2;screw.position.copy(pivot.position);screw.position.z+=side*.003;
  tube([new THREE.Vector3(.093,-.070,side*.090),new THREE.Vector3(.096,-.055,side*.092),new THREE.Vector3(.088,-.046,side*.102)],.002,rubber);
 }
 // Raised clear visor leaves the eye opening unobstructed, as in the supplied photo.
 const vp=[],vi=[];
 for(let row=0;row<2;row++)for(let i=0;i<=48;i++)vp.push(...surface(row?.143:.098,-1.10+i/48*2.20,.005).toArray());
 for(let i=0;i<48;i++)vi.push(i,i+1,i+49,i+1,i+50,i+49);
 const vg=new THREE.BufferGeometry();vg.setAttribute('position',new THREE.Float32BufferAttribute(vp,3));vg.setIndex(vi);vg.computeVertexNormals();const raised=mesh(vg,visorMaterial);raised.name='Viseira_levantada';
 // The player's helmets (look): the crown and a pin line under it, or a stripe over the top, in the detail colour; the
 // visor shut over the eye opening, tinted (smoked or mirrored), as the rivals wear theirs (rival-driver.js).
 const crown=new THREE.Group();crown.name='Capacete_topo';root.add(crown);mesh(shellBand(.101,.161,0,Math.PI*2,80,.0015),red,crown);mesh(shellBand(.084,.093,0,Math.PI*2,80,.0015),red,crown);
 const stripe=mesh(topStripe(),red);stripe.name='Capacete_listra';
 const shutMaterial=new THREE.MeshPhysicalMaterial({color:0x14171b,roughness:.06,metalness:.3,clearcoat:1,clearcoatRoughness:.05,envMap:env,envMapIntensity:1});
 const shut=mesh(shellBand(-.021,.096,-1.04,1.04,40,.004),shutMaterial);shut.name='Viseira_fechada';
 let current=null,worn=true;
 // Off the head (in the hand, look-select.js): no balaclava nor face inside, only the dark padding.
 function wear(on){worn=on;for(const b of balaclava)b.visible=on;faceMesh.visible=on&&!current;}
 function look(l){
  const key=lookKey(l);if(key===current)return;current=key;
  const c=l?lookColors(l):null,design=l?.helmet??'stevan';
  paint.color.setHex(c?c.helmet:0x101218);red.color.setHex(c?c.detail:0xd41132);
  for(const s of strokes)s.visible=design==='stevan'||design==='faixas';oval.visible=design==='stevan'||design==='faixas';
  crown.visible=design==='topo';stripe.visible=design==='listra';
  // Stevan's photo shows behind his raised visor; a shut one hides the face.
  raised.visible=!l;faceMesh.visible=!l&&worn;shut.visible=!!l;
  if(c){shutMaterial.color.setHex(c.visor);shutMaterial.metalness=l.visor==='fume'?.3:.75;}
 }
 look(null);
 return {root,look,wear,info:()=>({reference:'carro/piloto_capacete_bala_clava.jpg',visor:current?'shut':'raised',balaclava:true,color:current?'look':'black_red',look:current||null,
  design:crown.visible?'topo':stripe.visible?'listra':strokes[0].visible?'faixas':null,paint:paint.color.getHex(),detail:red.color.getHex(),visorTint:current?shutMaterial.color.getHex():null,height:.356})};
}
