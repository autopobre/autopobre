import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {CONTACT_SHAPES,CONTACT_MARGIN,CONTACT_TEXTURE,contactQuad,contactShade,contactPixels,contactFade,contactStrength,BLUR_LEVELS,wheelSpeeds,carContact,contactPullAt} from '../teste/contact-shadows.js';
import {TYRE_PROFILES,TYRE_BANDS,TYRE_LETTERS,TYRE_MARKINGS,tyreUV,splitSeam,tyreRoughness,BLUR_PROFILES,BLUR_TURN,blurTexel,blurLipSlope,blurArc,spokeCover,faceGLSL,spinBlur} from '../teste/car-wheels.js';
import {GRAPHICS_LEVELS,GRAPHICS_OPTIONS,GRAPHICS_PRESETS} from '../teste/graphics-settings.js';

// Contact shadows (contact-shadows.js): each footprint covers its car's body with a margin, in its own half
// of one texture, darkest under the tyres, dark under the body and gone at the quad's edge, the same both sides.
const {width,height}=CONTACT_TEXTURE,pixels=contactPixels(),rows=height/2;
assert.equal(pixels.length,width*height);
assert.deepEqual(Object.values(CONTACT_SHAPES).map(s=>s.row).sort(),[0,1],'one half each');
const at=(shape,x,z)=>{const q=contactQuad(shape),i=Math.floor(((x-q.center)/q.length+.5)*width),j=Math.floor((-z/q.width+.5)*rows);return pixels[(shape.row*rows+j)*width+i]/255;};
for(const [name,s] of Object.entries(CONTACT_SHAPES)){
 const q=contactQuad(s);
 assert.ok(Math.abs(q.length-(s.front-s.rear+2*CONTACT_MARGIN))<1e-9&&q.width>2*s.halfWidth,`${name}: the quad covers the body`);
 assert.ok(s.axles[0]<s.front&&s.axles[1]>s.rear&&s.track+s.tyre/2<=s.halfWidth+.01,`${name}: the wheels sit inside the body's footprint`);
 for(const ax of s.axles)for(const side of [-1,1]){const tyre=contactShade(s,ax,side*s.track);assert.ok(tyre>.95,`${name}: near black where a tyre touches (${tyre})`);assert.ok(at(s,ax,side*s.track)>.9,`${name}: and in the texture`);}
 const middle=contactShade(s,(s.front+s.rear)/2,0);assert.ok(middle>.7&&middle<.97,`${name}: dark under the body (${middle})`);
 const sill=contactShade(s,(s.axles[0]+s.axles[1])/2,s.halfWidth);assert.ok(sill>.45&&sill<middle,`${name}: lighter at the sills (${sill})`);
 assert.ok(contactShade(s,(s.front+s.rear)/2,s.halfWidth+.4)<.02&&contactShade(s,s.front+.42,0)<.02,`${name}: gone at the margin`);
 for(const [x,z] of [[.3,.5],[s.axles[0]+.2,.7],[s.rear+.3,.2]])assert.ok(Math.abs(contactShade(s,x,z)-contactShade(s,x,-z))<1e-12,`${name}: symmetric`);
 assert.ok(at(s,q.center-q.length/2+.01,q.width/2-.01)<.01,`${name}: the texture's corner is clear`);
}
// Fades out a metre up and once the car lies on its side or roof; whole on its wheels.
assert.equal(contactFade(0,1),1);
assert.ok(contactFade(.3,1)>.3&&contactFade(.3,1)<.9,'half gone 30 cm up');
assert.ok(contactFade(1,1)===0&&contactFade(0,0)===0&&contactFade(0,-1)===0,'none in the air, on its side or roof');
for(let h=0;h<1.2;h+=.05)assert.ok(contactFade(h+.05,1)<=contactFade(h,1),'never darker higher up');
// The footprint is never pulled in front of a tyre (it drew a black band across the tyres' bottom, user 2026-10-05):
// no pull over each tyre's patch and a little round it, the full pull under the middle of the body and out past the sills.
for(const S of Object.values(CONTACT_SHAPES)){
 for(const ax of S.axles)for(const side of [-1,1])for(const [dx,dz] of [[0,0],[S.wheel,0],[-S.wheel,0],[0,S.tyre/2],[0,-S.tyre/2]])
  assert.equal(contactPullAt(S,ax+dx,side*(S.track+dz)),0,`no pull at a tyre (${ax+dx}, ${side*(S.track+dz)})`);
 const q=contactQuad(S);
 assert.equal(contactPullAt(S,q.center,0),1,'full pull under the middle');
 assert.equal(contactPullAt(S,q.center,S.halfWidth+CONTACT_MARGIN*.8),1,'full pull out past the sills');
}
{const g=carContact.shadows.geometry;assert.ok(g.attributes.aPull&&g.attributes.aPull.itemSize===2,'aPull per vertex for both cars');
 const a=g.attributes.aPull.array;assert.ok(Math.min(...a)===0&&Math.max(...a)===1,'the pull falls to 0 round the tyres and is whole elsewhere');}
// Strongest where nothing else grounds the cars (Baixo, no sun shadows), lightest with sun shadows and SSAO.
const strength=Object.fromEntries(GRAPHICS_LEVELS.map(l=>[l,contactStrength(GRAPHICS_PRESETS[l])]));
assert.ok(strength.baixo>strength.medio&&strength.medio>strength.alto&&strength.alto>=strength.ultra&&strength.ultra>=.6&&strength.baixo<=1,JSON.stringify(strength));
// The wheel blur by Sensação de velocidade: every choice, none when off, never weaker on a heavier choice.
const effects=GRAPHICS_OPTIONS.speedEffects.choices.map(([v])=>v);
assert.deepEqual(Object.keys(BLUR_LEVELS),effects);assert.equal(BLUR_LEVELS.off,0);
effects.slice(1).forEach((v,i)=>assert.ok(BLUR_LEVELS[v]>=BLUR_LEVELS[effects[i]]&&BLUR_LEVELS[v]<=1));
// Tyre surface speed: rolling forward or backward, plus the rear's wheelspin.
assert.deepEqual(wheelSpeeds({vx:0,vy:20,heading:Math.PI/2}).map(v=>+v.toFixed(9)),[20,20]);
assert.deepEqual(wheelSpeeds({vx:-10,vy:0,heading:0,rearSlipSpeed:4}).map(v=>+v.toFixed(9)),[10,6]);
// Blur: none at a walk, full from about 60 km/h, never less at a higher speed.
assert.equal(spinBlur(5),0);assert.equal(spinBlur(17),1);
for(let v=0;v<30;v+=.5)assert.ok(spinBlur(v+.5)>=spinBlur(v));
// The disc's pattern turns slowly (no strobing): under three turns a second at 220 km/h.
assert.ok(BLUR_TURN>0&&61/TYRE_PROFILES.opala.radius*BLUR_TURN/(2*Math.PI)<3);

// Tyre UVs (car-wheels.js): the tread across the middle band, each sidewall in its own band from the bead to the
// shoulder; round the tyre u turns the other way on the left so the lettering reads the same from outside.
for(const [name,P] of Object.entries(TYRE_PROFILES)){
 for(const outer of [1,-1]){
  const [,tread]=tyreUV(0,P.radius,0,P,outer);assert.ok(Math.abs(tread-.5)<1e-9,`${name}: tread centre`);
  const shoulder=tyreUV(0,P.radius,outer*P.shoulder,P,outer)[1];assert.ok(Math.abs(shoulder-TYRE_BANDS.tread[1])<1e-9,`${name}: outer shoulder`);
  const outBead=tyreUV(0,P.bead,outer*(P.shoulder+.02),P,outer)[1],inBead=tyreUV(0,P.bead,-outer*(P.shoulder+.02),P,outer)[1];
  assert.ok(Math.abs(outBead-1)<1e-9&&Math.abs(inBead)<1e-9,`${name}: beads at the texture's edges`);
  const mid=tyreUV(0,(P.bead+P.radius)/2,outer*(P.shoulder+.02),P,outer)[1];assert.ok(mid>TYRE_BANDS.outer&&mid<1,`${name}: outer sidewall band`);
  for(const r of [P.bead,(P.bead+P.radius)/2,P.radius-.01]){const [u,v]=tyreUV(0,r,-outer*(P.shoulder+.02),P,outer);assert.ok(u>=0&&u<1&&v>=0&&v<=TYRE_BANDS.inner+1e-9,`${name}: inner sidewall band`);}
 }
 // The lettering's band sits on the outer sidewall, clear of the bead and the shoulder.
 assert.ok(TYRE_LETTERS.v-.1>TYRE_BANDS.outer&&TYRE_LETTERS.v+.1<.97);
 for(const a of [.3,1.4,2.9,-2.2]){const x=P.radius*.9*Math.cos(a),y=P.radius*.9*Math.sin(a),z=P.shoulder+.02,right=tyreUV(x,y,z,P,1),left=tyreUV(x,y,-z,P,-1);
  assert.ok(Math.abs(right[1]-left[1])<1e-12&&Math.abs((right[0]+left[0])%1)<1e-9,`${name}: mirrored on the left`);}
 // A quarter turn moves u by a quarter.
 const u0=tyreUV(P.radius,0,0,P,1)[0],u1=tyreUV(0,P.radius,0,P,1)[0];assert.ok(Math.abs(u1-u0-.25)<1e-9);
}
// Each model's sidewall reads the tyre its real car races on.
assert.deepEqual(Object.keys(TYRE_MARKINGS).sort(),Object.keys(TYRE_PROFILES).sort());
assert.equal(TYRE_MARKINGS.opala,'CORRERIA & DUREZA');assert.equal(TYRE_MARKINGS.fusca,'GOODYEAR 185/70 R14');
// A triangle across u's seam gets copies of its low corners at u+1; the others keep their vertices.
const seam=splitSeam([0,1,2,2,3,4],[.98,.02,.97,.5,.55]);
assert.deepEqual(seam.index,[0,5,2,2,3,4]);assert.deepEqual(seam.copies,[1]);
// Worn tread a little shinier than the matte sidewalls.
assert.ok(tyreRoughness(.3,.5)<.65&&tyreRoughness(.3,.85)>.8&&tyreRoughness(.3,.1)>.8);

// The blur disc: opaque enough over the spokes and the lettered sidewall to hide both, see-through past the
// tyre's edge, the polished lip brighter than the averaged spokes, the letters a lighter band. Its spokes are smeared
// exactly over the shutter's arc: sharp with no arc, a ghost at a short one, even once it spans a spoke's period,
// and the same mean whatever the arc (a box filter keeps the average).
assert.equal(spokeCover(0,0,5,.4),1);assert.equal(spokeCover(Math.PI/5,0,5,.4),0);
for(const arc of [.1,.6,1.3,3])assert.ok(Math.abs([...Array(720)].reduce((sum,_,k)=>sum+spokeCover(k/720*2*Math.PI,arc,5,.4),0)/720-5*.4/(2*Math.PI))<.01,`spokes' mean kept at arc ${arc}`);
assert.ok(Math.abs(spokeCover(0,2*Math.PI/5,5,.4)-spokeCover(.6,2*Math.PI/5,5,.4))<1e-6,'a whole period: even');
assert.ok(blurArc(20,.316)>blurArc(10,.316)&&blurArc(1e4,.316)===2*Math.PI&&Math.abs(blurArc(30,.316)-30/.316/180)<1e-9,'the shutter arc');
for(const [name,p] of Object.entries(BLUR_PROFILES)){
 for(const r of [.3,.5,.8,.9])assert.ok(blurTexel(p,r)[1]>=.97,`${name}: opaque at ${r}`);
 assert.equal(blurTexel(p,1)[1],0);assert.ok(blurTexel(p,.995)[1]<.2,`${name}: fades at the edge`);
 const [lr]=p.letters;assert.ok(blurTexel(p,lr)[0]>blurTexel(p,.75)[0]+20,`${name}: the letters' band`);
 assert.ok(blurTexel(p,.3)[2]>blurTexel(p,.85)[2]&&blurTexel(p,.85)[2]===0,`${name}: metal rim, rubber tyre`);
 const r=(p.spokes[1]+p.spokes[2])/2,spread=arc=>{let lo=255,hi=0,sum=0;for(let k=0;k<720;k++){const g=blurTexel(p,r,k/720*2*Math.PI,arc)[0];sum+=g;lo=Math.min(lo,g);hi=Math.max(hi,g);}return {range:hi-lo,mean:sum/720};};
 const sharp=spread(0),ghost=spread(.8),even=spread(2*Math.PI);
 assert.ok(sharp.range>ghost.range&&ghost.range>sharp.range*.25&&even.range<1,`${name}: spokes sharp, a ghost, then even (${sharp.range}, ${ghost.range}, ${even.range})`);
 assert.ok(Math.abs(sharp.mean-even.mean)<2,`${name}: the smear keeps the face's mean grey`);
 assert.ok(faceGLSL(p).includes('carSpokes(phi,arc,')&&faceGLSL(p).includes(`abs(model-${p.model.toFixed(4)})`),`${name}: drawn by the shader`);
}
// The polished lip brighter than the smeared spokes, its rounded profile tilting the normal so it catches the sky.
const evenGrey=p=>blurTexel(p,(p.spokes[1]+p.spokes[2])/2,0,2*Math.PI)[0];
assert.ok(blurTexel(BLUR_PROFILES.opala,.68)[0]>evenGrey(BLUR_PROFILES.opala)+40,"the Opala's polished lip");
assert.ok(blurLipSlope(BLUR_PROFILES.opala,.655)<0&&blurLipSlope(BLUR_PROFILES.opala,.69)>0&&blurLipSlope(BLUR_PROFILES.opala,.4)===0,'the lip is rounded');
assert.ok(evenGrey(BLUR_PROFILES.fusca)<evenGrey(BLUR_PROFILES.opala)*.5,"the Fusca's black wheel");
assert.deepEqual(Object.values(BLUR_PROFILES).map(p=>p.model).sort(),[0,1]);
// The brake disc shows between the Opala's spokes: lighter than the hub's dark behind them.
assert.ok(blurTexel(BLUR_PROFILES.opala,.52,Math.PI/5)[0]>blurTexel(BLUR_PROFILES.opala,.3,Math.PI/5)[0]+40,'the brake disc between the spokes');

// The game's instance: two instanced draws, no car yet, every level a uniform change (no new program).
const info=carContact.info();assert.deepEqual([info.shadows,info.discs],[0,0]);assert.ok(info.capacity>=16);
assert.equal(carContact.root.children.length,2);assert.ok(carContact.root.children.every(o=>o.isInstancedMesh&&!o.castShadow&&!o.name.startsWith('Numero_')));
const programs=new Set();for(const l of GRAPHICS_LEVELS){carContact.setQuality(GRAPHICS_PRESETS[l]);programs.add(carContact.shadows.material.version+'/'+carContact.discs.material.version);}
assert.equal(programs.size,1,'levels change uniforms only');
// The textures are drawn at the first car placed, not when the module is imported (every page load).
const blank=carContact.shadows.material.uniforms.map.value;assert.ok(!carContact.filled&&blank.image.width===1&&!carContact.discs.material.map,'no texture work at import (the discs need none)');
// A car on its wheels at rest: one shadow under it; at speed its wheels' discs.
const root=new THREE.Group(),wheels=[];
for(const [name,x,z] of [['Roda_Dianteira_E_PIVO',1.55,-.804],['Roda_Dianteira_D_PIVO',1.55,.804],['Roda_Traseira_E_PIVO',-1.117,-.804],['Roda_Traseira_D_PIVO',-1.117,.804]]){const o=new THREE.Group();o.name=name;o.position.set(x,.316,z);root.add(o);wheels.push({obj:o});}
const car={x:0,y:0,heading:0,vx:0,vy:0,upright:1,spin:0,surface:{z:0,gx:0,gy:0}};
carContact.setQuality(GRAPHICS_PRESETS.alto);carContact.begin();carContact.car(root,car,'opala',wheels);
assert.deepEqual([carContact.info().shadows,carContact.info().discs,carContact.info().player.shade],[1,0,1]);
assert.ok(carContact.filled&&carContact.shadows.material.uniforms.map.value.image.width===256,'drawn at the first car');
car.vx=40;car.spin=12;carContact.begin();carContact.car(root,car,'opala',wheels);
assert.deepEqual([carContact.info().discs,carContact.info().player.blur],[4,1]);
// Each disc just outside its tyre, on the axle, facing along it, the tyre's size.
const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
for(let i=0;i<4;i++){carContact.discs.getMatrixAt(i,m);m.decompose(p,q,s);const w=wheels[i].obj.position,axis=new THREE.Vector3(0,0,1).applyQuaternion(q);
 assert.ok(Math.abs(p.x-w.x)<1e-6&&Math.abs(p.y-w.y)<1e-6&&Math.abs(Math.abs(p.z)-(Math.abs(w.z)+CONTACT_SHAPES.opala.disc))<1e-6,`disc ${i} on its wheel's outer face`);
 assert.ok(Math.abs(Math.abs(axis.z)-1)<1e-6&&Math.abs(s.x-CONTACT_SHAPES.opala.wheel*.985)<1e-6);}
// It turns BLUR_TURN as far as the wheel, the same way.
carContact.discs.getMatrixAt(1,m);const a0=new THREE.Vector3(1,0,0).transformDirection(m);
car.spin+=.5;carContact.begin();carContact.car(root,car,'opala',wheels);carContact.discs.getMatrixAt(1,m);const a1=new THREE.Vector3(1,0,0).transformDirection(m);
assert.ok(Math.abs(a0.angleTo(a1)-.5*BLUR_TURN)<1e-6);
// The handbrake locks the rear wheels (physics.js rearWheelSpeed 0): their discs go, the fronts stay; a burnout blurs them.
car.rearWheelSpeed=0;carContact.begin();carContact.car(root,car,'opala',wheels);assert.equal(carContact.info().discs,2,'locked rears unblurred');
car.vx=2;car.rearWheelSpeed=25;carContact.begin();carContact.car(root,car,'opala',wheels);assert.equal(carContact.info().discs,2,'spinning rears blurred at a crawl');
car.vx=40;delete car.rearWheelSpeed;
// In the air or on its roof the shadow goes; Sensação de velocidade off, no discs.
root.position.y=1.2;carContact.begin();carContact.car(root,car,'opala',wheels);assert.equal(carContact.info().shadows,0);
root.position.y=0;car.upright=-1;carContact.begin();carContact.car(root,car,'opala',wheels);assert.equal(carContact.info().shadows,0);
car.upright=1;carContact.setQuality({...GRAPHICS_PRESETS.alto,speedEffects:'off'});carContact.begin();carContact.car(root,car,'opala',wheels);assert.equal(carContact.info().discs,0);
// A far model (no wheels) keeps its shadow; a Fusca draws from its own half of the texture.
carContact.setQuality(GRAPHICS_PRESETS.medio);carContact.begin();carContact.car(root,car,'opala',wheels);carContact.car(root,car,'fusca',null);
assert.deepEqual([carContact.info().shadows,carContact.shadows.instanceColor.getY(1)],[2,CONTACT_SHAPES.fusca.row]);
console.log('testar_contato: ok');
