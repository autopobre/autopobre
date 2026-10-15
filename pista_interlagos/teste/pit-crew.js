import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {crewBack,lollipop} from './pit-textures.js';

// People of the Interlagos pits: articulated figures (hips, torso, head, two-part
// arms and legs) built from vertex-coloured primitives, a pose library, the Box 99
// crew that runs out to the car in its box, and the Tia behind her counter.
// Figures face +x and their limb groups swing about z (positive = forward), like the
// boxy figures of the immersive mode, so the pit walk animates either kind.
const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),SC=new THREE.Vector3(),TR=new THREE.Vector3();
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Parts stay indexed: a fifth of the vertices to skin and shade for the same triangles.
function piece(geometry,color,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
 const g=geometry;g.deleteAttribute('uv');
 g.applyMatrix4(M.compose(TR.set(...pos),Q.setFromEuler(E.set(...rot)),SC.set(...scale)));
 const c=new THREE.Color(color),n=g.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++){rgb[i*3]=c.r;rgb[i*3+1]=c.g;rgb[i*3+2]=c.b;}
 g.setAttribute('color',new THREE.BufferAttribute(rgb,3));return g;
}
const merge=parts=>{const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return g;};
const ball=(r,w=12,h=9)=>new THREE.SphereGeometry(r,w,h),capsule=(r,len)=>new THREE.CapsuleGeometry(r,len,3,10),tube=(a,b,h,s=12)=>new THREE.CylinderGeometry(a,b,h,s),block=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
const darker=(color,k)=>new THREE.Color(color).multiplyScalar(k);

const BASE={skin:0xc68e6a,hair:0x2b1f17,hairStyle:'short',top:0x5a6a78,bottom:0x2d3a4a,belt:0x1b1d20,shoes:0x1b1d20,hands:null,trim:null,sleeves:'long',hat:null,hatColor:0xc81d25,apron:null,skirt:null,legs:null,glasses:false,mustache:false,beard:false,belly:0,back:false};
const CREW={top:0xc81d25,bottom:0xc81d25,trim:0xf4f1ea,hands:0x1b1d20,shoes:0x1b1d20,back:true};
export const OUTFITS={
 crew:CREW,
 // Out of the car the driver swaps the helmet for a cap, to eat and drink.
 // Stevan (carro/piloto_rosto_1.jpg): long wavy dark hair, moustache and a short beard.
 driver:{...CREW,top:0xd82125,bottom:0xd82125,hat:'cap',hatColor:0x1b1d20,skin:0xc98f68,hair:0x3b2a1a,hairStyle:'long',mustache:true,beard:true},
 tia:{skin:0xd8a27e,hair:0xbab4ab,hairStyle:'bun',top:0xe690a8,sleeves:'short',skirt:0x3f5f8f,bottom:0x3f5f8f,apron:0xf7f1e3,legs:0xd09a76,shoes:0x6b3f25,glasses:true,belly:.8},
 engineer:{top:0xc81d25,sleeves:'short',bottom:0x2b2f33,trim:0xf4f1ea,hat:'headset'},
 // Modo História (story-career.js outfitOf): Stevan before he has overalls (jeans and a T-shirt), and in the
 // overalls Kléber Eletric lends him (black and yellow like his own, no 99 on the back).
 stevanCivil:{skin:0xc98f68,hair:0x3b2a1a,hairStyle:'long',mustache:true,beard:true,top:0xe9e5da,sleeves:'short',bottom:0x41618f,belt:0x5a3a22,shoes:0xeeeeea},
 stevanLoan:{...CREW,top:0x1b1d20,bottom:0x1b1d20,trim:0xf2c418,back:false,hat:'cap',hatColor:0x1b1d20,skin:0xc98f68,hair:0x3b2a1a,hairStyle:'long',mustache:true,beard:true},
 // Kléber Eletric (carro/kleber_eletric_0*.jpg: tanned, short black hair, clean shaven), always in the black
 // cap of his brand (Eletric, its logo added by story-scene.js), black and yellow: as a pilot in his racing
 // overalls, and as the businessman of his brand in its black T-shirt (photo 4, the user's pick for his look).
 kleber:{...CREW,top:0x17191c,bottom:0x17191c,trim:0xf2c418,back:false,hands:null,skin:0xb47b5a,hair:0x16120f,hat:'cap',hatColor:0x121315,belly:.25},
 kleberBusiness:{top:0x17191c,sleeves:'short',bottom:0x2b3240,belt:0x1b1d20,shoes:0x1b1d20,skin:0xb47b5a,hair:0x16120f,hat:'cap',hatColor:0x121315,belly:.25},
};
// The pilot's outfit for each stage of the story (story-career.js outfitOf).
export const STEVAN_OUTFITS={civil:OUTFITS.stevanCivil,emprestado:OUTFITS.stevanLoan,proprio:OUTFITS.driver};

// Head, centre 0.1 m above the neck joint: face, ears, hair and headwear.
function headGeometry(o){
 const p=[],skin=o.skin,hair=o.hair;
 p.push(piece(ball(.104,16,12),skin,[0,.1,0],[0,0,0],[1.04,1.17,.93]),piece(ball(.072,12,8),skin,[.028,.035,0],[0,0,0],[1,.95,1.12]),piece(block(.034,.05,.03),darker(skin,.82),[.107,.092,0],[0,0,-.28]));
 for(const z of [-1,1])p.push(piece(ball(.02,8,6),0xf2eee6,[.086,.118,z*.037],[0,0,0],[.6,1,1]),piece(ball(.011,6,5),0x2a1c12,[.099,.118,z*.037]),piece(block(.012,.011,.04),hair,[.1,.148,z*.038],[z*.15,0,0]),piece(ball(.028,8,6),skin,[-.002,.1,z*.1],[0,0,0],[.55,1,.45]));
 p.push(piece(block(.012,.011,.042),0x8a4637,[.1,.042,0]));
 if(o.mustache)p.push(piece(block(.02,.016,.07),hair,[.104,.063,0]));
 // A short beard round the chin and along the jaw, under the mouth.
 if(o.beard)p.push(piece(ball(.07,10,8),hair,[.062,0,0],[0,0,0],[.85,.62,1.2]),...[-1,1].map(z=>piece(block(.075,.06,.022),hair,[.05,.065,z*.094])));
 // Skull caps tilt back so hair and caps clear the brow but cover the nape.
 const shell=(r,color,cut=.55)=>piece(new THREE.SphereGeometry(r,16,8,0,Math.PI*2,0,Math.PI*cut),color,[-.006,.1,0],[0,0,.6],[1.06,1.2,1]);
 if(o.hairStyle==='bun')p.push(shell(.111,hair),piece(ball(.056,10,8),hair,[-.1,.2,0]));
 else if(o.hairStyle==='curly')p.push(shell(.113,hair),...[0,1,2,3,4,5,6].map(k=>piece(ball(.045,8,6),hair,[-.07+Math.cos(k*.9)*.05,.2+Math.sin(k*1.7)*.02,Math.sin(k*.9)*.07])));
 // Long hair: a fuller cap of hair, the mass down to the nape and a lock over each ear.
 else if(o.hairStyle==='long')p.push(shell(.118,hair,.6),piece(ball(.1,10,8),hair,[-.075,.02,0],[0,0,0],[.7,1.35,1.08]),...[-1,1].map(z=>piece(ball(.05,8,6),hair,[-.025,0,z*.098],[0,0,0],[.85,1.7,.6])));
 else if(o.hairStyle!=='bald')p.push(shell(.111,hair));
 if(o.hat==='cap')p.push(shell(.119,o.hatColor,.5),piece(block(.13,.014,.18),o.hatColor,[.12,.16,0],[0,0,-.18]),piece(ball(.013,6,4),o.hatColor,[-.03,.24,0]));
 if(o.hat==='helmet')p.push(piece(new THREE.SphereGeometry(.14,16,8,0,Math.PI*2,0,Math.PI/2),o.hatColor,[0,.11,0],[0,0,.15],[1.05,1.1,1]),piece(new THREE.SphereGeometry(.14,16,5,Math.PI+.95,Math.PI*2-1.9,Math.PI/2,Math.PI*.2),o.hatColor,[0,.11,0],[0,0,.15],[1.05,1.1,1]),piece(block(.3,.03,.03),0xc81d25,[-.01,.26,0],[0,0,.15]));
 if(o.hat==='headset'){p.push(piece(new THREE.TorusGeometry(.128,.011,6,18,Math.PI),0x1b1d20,[0,.11,0],[0,Math.PI/2,0]));for(const z of [-1,1])p.push(piece(tube(.042,.042,.035,12),0x1b1d20,[0,.1,z*.118],[Math.PI/2,0,0]));p.push(piece(block(.11,.01,.01),0x1b1d20,[.05,.065,-.095],[0,.55,0]),piece(ball(.014,6,5),0x1b1d20,[.1,.05,-.05]));}
 if(o.glasses){for(const z of [-1,1])p.push(piece(new THREE.TorusGeometry(.024,.0045,6,16),0x3a2a22,[.113,.117,z*.038],[0,Math.PI/2,0]),piece(block(.1,.006,.006),0x3a2a22,[.065,.12,z*.1]));p.push(piece(block(.006,.006,.022),0x3a2a22,[.116,.12,0]));}
 return merge(p);
}
function torsoGeometry(o){
 const p=[],b=o.belly;
 p.push(piece(tube(.19,.15+.05*b,.52,16),o.top,[0,.27,0],[0,0,0],[.66+.14*b,1,1]),piece(tube(.05,.058,.12,10),o.skin,[0,.57,0]),piece(tube(.066,.074,.05,12),o.top,[0,.535,0]));
 for(const z of [-1,1])p.push(piece(ball(.078,10,8),o.top,[0,.49,z*.18],[0,0,0],[.9,.9,1]));
 if(o.trim)p.push(piece(tube(.192,.184,.055,16),o.trim,[0,.37,0],[0,0,0],[.67+.14*b,1,1.01]),piece(block(.008,.46,.014),darker(o.top,.6),[.126+.03*b,.28,0]),piece(block(.01,.06,.08),0xf4f1ea,[.128+.03*b,.43,.075]));
 if(o.apron)p.push(piece(block(.02,.36,.3),o.apron,[.13+.03*b,.2,0]));
 return merge(p);
}
// Eyelids (skin, a shade darker) hang from their bone on the brow line over each eye.
const lidsGeometry=o=>merge([-1,1].map(z=>piece(ball(.024,10,6),darker(o.skin,.93),[.1,-.024,z*.037],[0,0,0],[.55,1,1.05])));
function hipsGeometry(o){
 const p=[piece(tube(.155,.15,.2,14),o.bottom,[0,-.03,0],[0,0,0],[.72,1,1.05]),piece(tube(.157,.157,.045,14),o.belt,[0,.06,0],[0,0,0],[.73,1,1.06])];
 if(o.skirt)p.push(piece(tube(.165,.26,.56,16),o.skirt,[0,-.3,0],[0,0,0],[.82,1,1]));
 if(o.apron)p.push(piece(block(.02,.46,.34),o.apron,[o.skirt?.19:.125,-.2,0],[0,0,o.skirt?-.14:0]));
 return merge(p);
}
const upperGeometry=o=>merge([piece(capsule(.052,.19),o.top,[0,-.14,0]),...(o.trim?[piece(tube(.054,.054,.03,10),o.trim,[0,-.05,0])]:[])]);
function foreGeometry(o){const sleeve=o.sleeves==='short'?o.skin:o.top,hand=o.hands??o.skin;return merge([piece(capsule(.045,.18),sleeve,[0,-.12,0]),piece(tube(.05,.05,.04,10),o.sleeves==='short'?o.skin:hand,[0,-.22,0]),piece(ball(.05,10,8),hand,[0,-.285,0],[0,0,0],[.75,1.15,.52]),piece(ball(.022,6,5),hand,[.035,-.26,0])]);}
function thighGeometry(o,side){const p=[piece(capsule(.072,.3),o.skirt?(o.legs??o.skin):o.bottom,[0,-.21,0])];if(o.trim&&!o.skirt)p.push(piece(block(.014,.38,.012),o.trim,[0,-.21,side*.071]));return merge(p);}
function shinGeometry(o,side){const p=[piece(capsule(.058,.3),o.skirt?(o.legs??o.skin):o.bottom,[0,-.2,0]),piece(block(.24,.1,.11),o.shoes,[.045,-.45,0]),piece(ball(.056,10,7),o.shoes,[.155,-.455,0],[0,0,0],[1,.8,1])];if(o.trim&&!o.skirt)p.push(piece(block(.012,.3,.012),o.trim,[0,-.2,side*.059]));return merge(p);}

// Poses: hips drop (y), forward lean, head nod; per side [left, right]: thigh swing,
// knee bend, arm raise, elbow bend and arm spread (radians). The idle moves also use
// head turn (+ left) and tilt, torso twist (+ left), hips sway (metres, + right) and
// the forearm turned in about the upper arm (roll, per side); lid closes the eyes (0-1).
const pose=(y,lean,head,thigh,knee,arm,elbow,spread=[.1,.1])=>({y,lean,head,turn:0,twist:0,tilt:0,sway:0,lid:0,thigh,knee,arm,elbow,spread,roll:[0,0]});
export const POSES={
 stand:pose(0,0,0,[0,0],[0,0],[.06,.06],[.18,.18]),
 ready:pose(-.04,.14,.05,[.12,.12],[.22,.22],[.3,.3],[.55,.55],[.14,.14]),
 folded:pose(0,-.02,0,[0,.06],[0,.08],[.38,.38],[1.75,1.75],[.34,.34]),
 kneel:pose(-.42,.32,.15,[1.4,-.12],[1.45,1.5],[.75,.65],[.35,.45],[.05,.05]),
 jack:pose(-.08,.35,.1,[.45,-.1],[.6,.2],[.7,.7],[.2,.2],[.04,.04]),
 rest:pose(0,0,0,[0,.05],[0,.05],[.06,.45],[.18,.5]),
 fuel:pose(-.03,.18,.3,[.12,-.05],[.15,.05],[.85,.8],[.75,.85],[.02,.02]),
 lollipop:pose(0,0,0,[0,.05],[0,.05],[.25,1.35],[.4,.05],[.1,.05]),
 work:pose(-.08,.85,-.3,[.25,.25],[.35,.35],[1.2,1],[.6,.8]),
 sit:pose(-.46,.05,0,[1.5,1.5],[1.5,1.5],[.45,.5],[.9,1.1],[.12,.12]),
 stool:pose(-.2,.1,0,[1.35,1.3],[1.15,1.25],[.8,.85],[.7,.6]),
 serve:pose(0,.18,.2,[0,0],[0,0],[1.2,.3],[.35,.6],[.05,.1]),
 wave:pose(0,-.03,-.1,[0,0],[0,0],[.1,2.7],[.2,.5],[.1,.25]),
 wipe:pose(0,.22,.25,[0,0],[0,0],[.2,1.05],[.4,.5],[.1,.05]),
 cheer:pose(0,-.05,-.2,[0,0],[0,0],[2.6,2.6],[.3,.3],[.3,.3]),
};
const SCALARS=['y','lean','head','turn','twist','tilt','sway','lid'],PAIRS=['thigh','knee','arm','elbow','spread','roll'];
const clonePose=p=>({...p,twist:p.twist??0,tilt:p.tilt??0,sway:p.sway??0,lid:p.lid??0,thigh:[...p.thigh],knee:[...p.knee],arm:[...p.arm],elbow:[...p.elbow],spread:[...p.spread],roll:[...(p.roll??[0,0])]});
function copyPose(to,from){for(const key of SCALARS)to[key]=from[key]??0;for(const key of PAIRS)for(const i of [0,1])to[key][i]=from[key]?.[i]??0;}
function applyPose(rig,p){
 // (stature: a Crowd's standing people are a little taller or shorter, the whole body scaled from the hips.)
 const tall=rig.stature??1;rig.hips.position.y=(.93+p.y)*tall;rig.torso.rotation.z=-p.lean;rig.head.rotation.z=-p.head;rig.head.rotation.y=p.turn;
 // Weight on one leg: the hips slide over it, the legs lean in to keep the feet put
 // and the chest leans back over the middle.
 const sway=p.sway??0,splay=Math.asin(Math.max(-.3,Math.min(.3,sway/.86)));
 rig.hips.position.z=sway*tall;rig.torso.rotation.x=-splay*.8;rig.torso.rotation.y=p.twist??0;rig.head.rotation.x=p.tilt??0;
 // Open eyelids fold away into the brow line; closing, they come down from it.
 if(rig.lids){const lid=Math.max(0,Math.min(1,p.lid??0));if(lid<.02)rig.lids.scale.setScalar(.001);else rig.lids.scale.set(1,Math.max(.08,lid),1);}
 for(const [i,side] of [[0,-1],[1,1]]){const l=rig.limbs[side];l.leg.rotation.z=p.thigh[i];l.leg.rotation.x=splay;l.shin.rotation.z=-p.knee[i];l.arm.rotation.z=p.arm[i];l.arm.rotation.x=-side*p.spread[i];l.fore.rotation.z=p.elbow[i];l.fore.rotation.y=side*(p.roll?.[i]??0);}
}
// Holds a figure in a pose (people standing still: supporters, the podium).
export function setPose(root,pose){root.userData.pose=clonePose(pose);applyPose(root.userData.rig,root.userData.pose);}
function blendPose(cur,target,k){for(const key of SCALARS)cur[key]+=((target[key]??0)-cur[key])*k;for(const key of PAIRS)for(const i of [0,1])cur[key][i]+=((target[key]?.[i]??0)-cur[key][i])*k;}
// Walking and running layered over the current pose.
function gait(cur,phase,amount,run){
 for(const [i,sign] of [[0,1],[1,-1]]){const s=Math.sin(phase)*sign,c=Math.cos(phase)*sign;
  cur.thigh[i]+=((run?.7:.42)*s-cur.thigh[i])*amount;cur.knee[i]+=(.12+(run?1.05:.55)*Math.max(0,c)-cur.knee[i])*amount;
  cur.arm[i]+=(-(run?.6:.32)*s-cur.arm[i])*amount;cur.elbow[i]+=((run?1.3:.35)-cur.elbow[i])*amount;cur.spread[i]+=(.1-cur.spread[i])*amount;}
 cur.lean+=((run?.22:.04)-cur.lean)*amount;cur.y+=(-(run?.05:.02)+Math.abs(Math.sin(phase))*.03-cur.y)*amount;cur.head+=(0-cur.head)*amount;
}

// ---- Idle life: nobody waits like a statue. ----
// Arm targets [raise, elbow, spread, forearm roll], solved on the rig so the hand lands
// where it should: cup at the mouth, cap brim, brow, watch, phone, radio at the ear,
// hips, behind the back. The arms hang from the torso, so they hold in any base pose.
const ARMS={
 sip:[1.54,2.19,.41,.4],cap:[2.06,1.39,0,.56],brow:[1.94,1.65,.37,.27],fan:[.94,2.25,-.14,.44],
 wrist:[.62,1.52,.34,.99],phone:[.7,1.54,.46,.93],photo:[1.24,1.3,.18,.44],ear:[1.2,2.44,1.7,-1.45],
 back:[-.82,.84,-.31,.11],hip:[-.43,1.59,.69,1.12],point:[1.83,0,-.31,0],chin:[1.44,2.2,.25,.8],
 clap:[.85,1.49,.35,.81],folded:[.38,1.75,.34,0],up:[2.8,.25,.25,0],camera:[1.22,1.71,0,.18],
};
function reach(s,i,[arm,elbow,spread,roll],k){s.arm[i]+=(arm-s.arm[i])*k;s.elbow[i]+=(elbow-s.elbow[i])*k;s.spread[i]+=(spread-s.spread[i])*k;s.roll[i]+=(roll-s.roll[i])*k;}
const both=(s,arms,k)=>{reach(s,0,arms,k);reach(s,1,arms,k);};
// Gestures: duration range (s); hands ('one' takes a free hand, 'left'/'right'/'both' need
// those free, 'posture' is fine with a tool in the hand); the prop shown (needs: only for
// people who carry it); standing: only on their feet; eyesFree: can go on while watching
// a car. move(s,k,g,t): s the shown pose, k the fade in and out, g its dice, t its clock.
const GESTURES={
 look:{dur:[2,4.5],move:(s,k,g)=>{s.turn+=g.dir*g.amount*k;s.twist+=g.dir*g.amount*.25*k;s.head+=g.pitch*k;s.tilt+=g.dir*.05*k;}},
 shift:{dur:[3,7],standing:true,eyesFree:true,move:(s,k,g)=>{const free=g.dir>0?0:1;s.sway+=g.dir*.045*k;s.knee[free]+=.2*k;s.thigh[free]+=.06*k;s.tilt-=g.dir*.05*k;}},
 tap:{dur:[1.6,3],standing:true,eyesFree:true,move:(s,k,g,t)=>{s.knee[g.side]+=(.1+.07*Math.max(0,Math.sin(t*10)))*k;s.thigh[g.side]+=.05*k;}},
 folded:{dur:[4,9],hands:'posture',eyesFree:true,move:(s,k)=>both(s,ARMS.folded,k)},
 hips:{dur:[3,7],hands:'posture',eyesFree:true,move:(s,k)=>{both(s,ARMS.hip,k);s.lean-=.03*k;}},
 back:{dur:[4,8],hands:'posture',eyesFree:true,move:(s,k)=>{both(s,ARMS.back,k);s.lean-=.02*k;}},
 stretch:{dur:[2.2,3],hands:'posture',ramp:.8,move:(s,k)=>{both(s,ARMS.up,k);s.lean-=.12*k;s.head-=.25*k;s.y+=.012*k;s.lid+=.6*k;}},
 cap:{dur:[1.3,2],hands:'one',move:(s,k,g,t)=>{reach(s,g.side,ARMS.cap,k);s.head+=.08*k;s.roll[g.side]+=Math.sin(t*6)*.1*k;}},
 brow:{dur:[1.5,2.3],hands:'one',move:(s,k,g,t)=>{reach(s,g.side,ARMS.brow,k);s.spread[g.side]+=Math.sin(t*6)*.12*k;s.head-=.05*k;}},
 fan:{dur:[2.5,4],hands:'one',move:(s,k,g,t)=>{reach(s,g.side,ARMS.fan,k);s.spread[g.side]+=Math.sin(t*13)*.2*k;s.roll[g.side]+=Math.sin(t*13)*.3*k;s.head-=.08*k;}},
 wrist:{dur:[1.4,2.4],hands:'left',move:(s,k)=>{reach(s,0,ARMS.wrist,k);s.head+=.45*k;s.turn+=.22*k;}},
 phone:{dur:[4,9],hands:'right',prop:'phone',needs:true,move:(s,k,g,t)=>{reach(s,1,ARMS.phone,k);s.elbow[1]+=Math.sin(t*9)*.03*k;s.head+=.5*k;s.turn-=.1*k;}},
 photo:{dur:[2.5,4],hands:'both',prop:'phone',needs:true,move:(s,k,g)=>{both(s,ARMS.photo,k);s.head-=.05*k;s.twist+=g.dir*.2*k;}},
 ear:{dur:[2,4.5],hands:'right',prop:'radio',eyesFree:true,move:(s,k)=>{reach(s,1,ARMS.ear,k);s.tilt+=.12*k;s.head+=.1*k;}},
 point:{dur:[1.8,3],hands:'right',move:(s,k,g)=>{reach(s,1,ARMS.point,k);s.twist+=g.dir*.3*k;s.turn+=g.dir*.3*k;s.head-=.08*k;}},
 chin:{dur:[3,6],hands:'one',move:(s,k,g)=>{reach(s,g.side,ARMS.chin,k);s.head+=.12*k;s.lean+=.06*k;}},
 clap:{dur:[2,4],hands:'both',move:(s,k,g,t)=>{both(s,ARMS.clap,k);const beat=Math.sin(t*11)*.14*k;s.spread[0]+=beat;s.spread[1]+=beat;s.head-=.05*k;}},
 sip:{dur:[2.2,3],hands:'right',prop:'cup',needs:true,eyesFree:true,move:(s,k)=>{reach(s,1,ARMS.sip,k*k*(3-2*k));s.head-=.15*k;}},
 talk:{dur:[3,7],move:(s,k,g,t)=>{s.twist+=g.dir*.3*k;s.turn+=g.dir*.35*k;s.head+=Math.sin(t*2.6)*.07*k;if(g.free)reach(s,g.side,[.45+.15*Math.sin(t*2.3),1.05+.3*Math.sin(t*3.1+g.dir),.18,.35],k);}},
 nod:{dur:[2,4],move:(s,k,g,t)=>{s.head+=(.06+.06*Math.sin(t*3.2))*k;s.turn+=g.dir*.3*k;}},
 type:{dur:[3,8],hands:'both',move:(s,k,g,t)=>{s.elbow[0]+=Math.sin(t*13)*.05*k;s.elbow[1]+=Math.sin(t*11+1)*.05*k;s.arm[0]+=Math.sin(t*7)*.03*k;s.arm[1]+=Math.sin(t*8+2)*.03*k;s.head+=.18*k;}},
};
// What each kind of person does while waiting, with weights.
const KINDS={
 stand:{look:4,shift:3,folded:2,hips:1,back:1,cap:1,brow:.6,wrist:1,phone:1.2,stretch:.5,talk:2,tap:.6,chin:.4},
 crew:{look:4,shift:3,folded:2,hips:1.5,back:1,cap:1,brow:1,wrist:.6,stretch:.8,talk:2,tap:.6},
 seated:{look:3,sip:3,talk:2.5,phone:1,chin:1,nod:1.2,cap:.3},
 desk:{type:5,look:2,ear:1.5,chin:1,talk:1,nod:1,stretch:.4},
 marshal:{look:3,shift:3,back:2,folded:1.5,ear:1.5,wrist:1,brow:.6,hips:1,stretch:.3},
 camera:{look:3,shift:2,ear:2,folded:1.5,stretch:1,brow:.6,back:1,hips:1,wrist:.6,phone:.6},
 terrace:{look:3,shift:3,folded:1.5,point:1.2,photo:1,phone:1.2,talk:2.5,hips:1,chin:.5},
 counter:{look:3,shift:3,hips:1.5,folded:1.5,fan:1.2,phone:1,sip:1,brow:.8,chin:.5,tap:.6},
 fan:{look:3,shift:3,folded:1.5,phone:1.2,photo:.8,talk:2.5,hips:1,point:.8,wrist:.6,tap:.5},
 judge:{look:2,chin:2,wrist:1,back:2,folded:1.5,hips:1,shift:2,cap:.5},
 podium:{clap:4,look:2,folded:1,shift:2,hips:1,point:.6},
 busy:{look:1},
};
// What they carry (hidden until a gesture takes it out, except the café's cups) and how
// far (m) a passing car catches their eye.
const KIND_PROPS={seated:['cup','phone'],stand:['phone'],terrace:['phone'],fan:['phone'],camera:['phone'],marshal:['radio'],counter:['cup','phone']};
const KIND_WATCH={marshal:120,camera:240,terrace:170,desk:150,stand:45,fan:0};
const STANDING=new Set(['stand','rest','folded']);
function dice(seed){let x=Math.floor(Math.abs(seed)*2147483646)%2147483646+1;return ()=>(x=x*16807%2147483647)/2147483647;}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

// One person's idle: breathing and a drifting gaze all the time, a car that catches
// the eye, and now and then a gesture (with pauses in between).
export class IdleMind{
 // hands: [left, right] free for gestures; props: what the person carries.
 constructor(kind='stand',{hands=[true,true],props=[],seed=Math.random()}={}){
  this.kind=kind;this.table=Object.entries(KINDS[kind]??KINDS.stand);this.hands=hands;this.props=new Set(props);this.rand=dice(seed);
  this.t=this.rand()*60;this.phase=this.rand()*7;this.gesture=null;this.wait=.3+this.rand()*3;this.using=null;this.attention=0;this.aim=0;this.pitch=0;this.blink=-1;this.blinkIn=this.rand()*4;
 }
 side(hands){
  const [l,r]=this.hands,coin=this.rand()<.5?0:1;
  if(hands==='posture'&&this.posture===false)return null;if(!hands||hands==='posture')return coin;if(hands==='both')return l&&r?1:null;if(hands==='left')return l?0:null;if(hands==='right')return r?1:null;
  return l&&r?coin:l?0:r?1:null;
 }
 pick(pose,watching){
  const standing=STANDING.has(pose),options=[];let total=0;
  for(const [name,weight] of this.table){
   const G=GESTURES[name];if(!G||G.standing&&!standing||G.needs&&!this.props.has(G.prop)||watching&&!G.eyesFree)continue;
   const side=this.side(G.hands);if(side===null)continue;options.push([name,weight,side]);total+=weight;
  }
  let r=this.rand()*total;
  for(const [name,weight,side] of options)if((r-=weight)<=0){const G=GESTURES[name],[a,b]=G.dur;return {name,G,side,free:this.hands[side],T:a+this.rand()*(b-a),t:0,dir:this.rand()<.5?-1:1,amount:.5+this.rand()*.6,pitch:(this.rand()-.45)*.35};}
  return null;
 }
 // s: the shown pose, already a copy of the base; calm: at work or on the move (only
 // breathing); look: {angle, pitch} of a car in view (radians, + left / + up), or null.
 apply(s,dt,{pose='stand',calm=false,look=null}={}){
  this.t+=dt;const t=this.t,ph=this.phase,breath=Math.sin(t*1.6+ph);
  s.y+=breath*.004;s.lean+=breath*.012;s.spread[0]+=breath*.012;s.spread[1]+=breath*.012;
  // A blink every few seconds (.17 s, lids down faster than up), now and then a double one.
  if(this.blink>=0){this.blink+=dt;const b=this.blink;s.lid=Math.max(s.lid,b<.07?b/.07:Math.max(0,1-(b-.07)/.1));if(b>=.17){this.blink=-1;this.blinkIn=this.rand()<.15?.12:1.8+this.rand()*4.5;}}
  else if((this.blinkIn-=dt)<=0)this.blink=0;
  s.turn+=Math.sin(t*.37+ph)*.1+Math.sin(t*.91+ph*2)*.04;s.head+=Math.sin(t*.53+ph*3)*.035;s.tilt+=Math.sin(t*.29+ph)*.03;
  if(!calm&&STANDING.has(pose))s.sway+=Math.sin(t*.23+ph)*.012;
  let g=this.gesture;
  if(g){
   if(calm)g.T=Math.min(g.T,g.t+.35);g.t+=dt;
   const ramp=Math.min(g.G.ramp??.5,g.T/2),k=smooth(g.t/ramp)*smooth((g.T-g.t)/ramp);
   g.G.move(s,k,g,g.t);this.using=g.G.prop&&this.props.has(g.G.prop)&&k>.2?g.G.prop:null;
   if(g.t>=g.T){this.gesture=g=null;this.using=null;this.wait=.8+this.rand()*3.2;}
  }else if(!calm&&(this.wait-=dt)<=0){this.gesture=this.pick(pose,this.attention>.3);this.wait=1+this.rand()*2;}
  // A car in view: the head follows it, the chest turns a little with it.
  this.attention+=((look?1:0)-this.attention)*Math.min(1,dt*2.5);
  if(look){this.aim+=wrap(look.angle-this.aim)*Math.min(1,dt*5);this.pitch+=(look.pitch-this.pitch)*Math.min(1,dt*5);}
  if(this.attention>.01){const w=this.attention;s.turn+=(Math.max(-1.15,Math.min(1.15,this.aim*.75))-s.turn)*w;s.twist+=Math.max(-.45,Math.min(.45,this.aim*.3))*w;s.head+=Math.max(-.2,Math.min(.4,-this.pitch*.7))*w;}
 }
}

// A single figure from person() idling on its spot (supporters, the judge, the podium):
// it blends to the pose asked for and adds the idle life on top.
export class Idler{
 constructor(person,kind='stand',{hands,seed,props={}}={}){this.person=person;this.cur=clonePose(person.userData.pose);this.show=clonePose(this.cur);this.props=props;this.mind=new IdleMind(kind,{hands,props:Object.keys(props),seed});}
 update(dt,pose='stand',{calm=false,look=null,snap=false}={}){
  blendPose(this.cur,POSES[pose]??POSES.stand,snap?1:1-Math.exp(-dt*7));copyPose(this.show,this.cur);this.mind.apply(this.show,dt,{pose,calm,look});
  applyPose(this.person.userData.rig,this.show);for(const [name,prop] of Object.entries(this.props))prop.visible=this.mind.using===name;
 }
}

// Bones of a figure in its rest pose, with the part geometries that ride on each.
// The body of a person() at rest, every vertex on its single bone.
function skinnedGeometry(bones,parts){
 bones[0].updateMatrixWorld(true);
 return merge(parts.map(([g,b])=>{g.applyMatrix4(b.matrixWorld);const n=g.attributes.position.count,index=new Uint16Array(n*4),weight=new Float32Array(n*4),k=bones.indexOf(b);for(let i=0;i<n;i++){index[i*4]=k;weight[i*4]=1;}
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));return g;}));
}
// Another outfit on a person() (the story's pilot changing clothes): the bones never move with the
// outfit, so the new body binds to the same skeleton, in whatever pose it holds. The 99 on the back
// shows only on overalls that carry it (back).
export function dressPerson(root,outfit){
 const body=root.children.find(c=>c.isSkinnedMesh);if(!body)return false;const o={...BASE,...outfit},{bones,parts,head}=skeletonFor(o);
 body.geometry.dispose();body.geometry=skinnedGeometry(bones,parts);root.userData.head.geometry.dispose();root.userData.head.geometry=head;
 const decal=root.userData.rig.torso.getObjectByName('Macacao_costas_99');if(decal)decal.visible=!!o.back;
 root.userData.outfit=outfit;return true;
}
function skeletonFor(o){
 const bones=[],bone=(name,parent,x,y,z)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent?.add(b);bones.push(b);return b;};
 const hips=bone('Quadril',null,0,.93,0),torso=bone('Tronco',hips,0,0,0),head=bone('Cabeca',torso,0,.6,0),lids=bone('Palpebras',head,0,.142,0),limbs={},parts=[[hipsGeometry(o),hips],[torsoGeometry(o),torso],[lidsGeometry(o),lids]],upper=upperGeometry(o),fore=foreGeometry(o);
 for(const side of [-1,1]){
  const arm=bone('Membro_braco_'+side,torso,0,.47,side*.2),forearm=bone('Antebraco_'+side,arm,0,-.28,0),hand=bone('Mao_'+side,forearm,0,-.29,0),leg=bone('Membro_perna_'+side,hips,0,0,side*.095),shin=bone('Canela_'+side,leg,0,-.43,0);
  limbs[side]={arm,fore:forearm,hand,leg,shin};parts.push([side<0?upper:upper.clone(),arm],[side<0?fore:fore.clone(),forearm],[thighGeometry(o,side),leg],[shinGeometry(o,side),shin]);
 }
 return {bones,parts,rig:{hips,torso,head,lids,limbs},head:headGeometry(o)};
}

// Cloth, skin and hair: soft sheen on the rim, and a fine weave in the normals up close.
function fabricMaterial(){
 // A faint sheen only: a strong one coats every figure in a milky, washed-out layer.
 const material=new THREE.MeshPhysicalMaterial({name:'Pessoas_boxes',vertexColors:true,roughness:.8,sheen:.14,sheenRoughness:.9,sheenColor:new THREE.Color(.3,.3,.3)});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vClothPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvClothPos=transformed;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vClothPos;').replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 weave=vec3(sin(vClothPos.y*900.0)*.5+sin(vClothPos.x*1300.0+vClothPos.z*1100.0)*.5,0.0,sin(vClothPos.z*900.0+vClothPos.x*700.0)*.5);
normal=normalize(normal+weave*.035*(1.0-smoothstep(1.5,5.0,-vViewPosition.z)));`).replace('#include <color_fragment>',`#include <color_fragment>
// Pure paint colours read as toys: fabric dyes are a touch duller.
diffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.94);`);
 };
 material.customProgramCacheKey=()=>'people-fabric-v3';
 return material;
}
export function createPeople(){
 const material=fabricMaterial();let backMaterial=null;
 // One skinned mesh per body (every vertex follows a single bone) plus the head, so
 // the head can give way to the driver's helmet.
 function person(outfit,{shadows=true}={}){
  const o={...BASE,...outfit},{bones,parts,rig,head}=skeletonFor(o),root=new THREE.Group();root.name='Pessoa_boxes';
  const geometry=skinnedGeometry(bones,parts);
  const body=new THREE.SkinnedMesh(geometry,material);body.name='Corpo';body.castShadow=shadows;body.add(rig.hips);root.add(body);body.bind(new THREE.Skeleton(bones));
  const face=new THREE.Mesh(head,material);face.name='Cabeca';face.castShadow=shadows;rig.head.add(face);
  // The 99 on the back sits below the white band round the chest (.34-.40 m).
  if(o.back){backMaterial??=new THREE.MeshStandardMaterial({name:'Macacao_costas_99',map:crewBack(),transparent:true,roughness:.7,polygonOffset:true,polygonOffsetFactor:-1});const decal=new THREE.Mesh(new THREE.PlaneGeometry(.22,.22),backMaterial);decal.name='Macacao_costas_99';decal.position.set(-.114-.03*o.belly,.215,0);decal.rotation.y=-Math.PI/2;rig.torso.add(decal);}
  root.userData={head:face,rig,pose:clonePose(POSES.stand)};applyPose(rig,root.userData.pose);return root;
 }
 // Props carried by the crew, in the same vertex-coloured material.
 function prop(parts,parent,name){const m=new THREE.Mesh(merge(parts),material);m.name=name;m.castShadow=true;parent.add(m);return m;}
 // A cup, phone or radio in a person()'s hand, hidden until a gesture takes it out.
 function carry(name,hand){const m=new THREE.Mesh(PROPS[name](),material);m.name='Objeto_'+name;m.castShadow=true;m.visible=false;hand.add(m);return m;}
 // People who stay at their spot, idling (see Crowd): café customers, rival crews, the
 // pit wall stand, the terrace, marshals and cameramen. Grouped by neighbourhood.
 function crowd(entries,{name='Pessoas_paradas_boxes',cell=48,seed=1}={}){
  if(!entries.length)return null;const group=new THREE.Group(),cells=new Map();group.name=name;
  for(const e of entries){const key=Math.floor(e.x/cell)+':'+Math.floor(e.z/cell);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(e);}
  let n=0;for(const list of cells.values()){const c=new Crowd(list,material,seed+n*.618);c.mesh.name=`${name}_${++n}`;group.add(c.mesh);}
  return group;
 }
 return {material,person,prop,carry,crowd};

}

// Things held in the right hand (hand bone frame: -y toward the fingers, +x up when the
// forearm points forward) and the TV camera head on its tripod (+x toward the lens).
const PROPS={
 cup:()=>merge([piece(tube(.036,.03,.085,12),0xf4f1ea,[0,-.035,0],[0,0,-Math.PI/2]),piece(tube(.031,.031,.004,12),0x3b2415,[.041,-.035,0],[0,0,-Math.PI/2])]),
 phone:()=>merge([piece(block(.012,.13,.066),0x15171a,[.046,-.05,0]),piece(block(.002,.114,.056),0x6f9fc4,[.053,-.05,0])]),
 radio:()=>merge([piece(block(.035,.12,.058),0x1b1d20,[.03,-.035,0]),piece(tube(.006,.006,.1,6),0x1b1d20,[.03,-.14,.015])]),
};
const cameraHead=()=>merge([piece(block(.62,.3,.26),0x1b1d20,[0,.12,0]),piece(tube(.09,.11,.42,10),0x0e0f10,[.46,.14,0],[0,0,Math.PI/2]),piece(block(.12,.09,.09),0x2a2d30,[-.3,.22,-.1]),piece(block(.3,.04,.2),0x3a3f44,[0,-.05,0])]);

// People who stay at their spot, idling. One skinned mesh per neighbourhood (a draw
// call each, culled together; every vertex on a single bone like person()), updated
// by updatePeople. Entries: {outfit, pose, x, y, z, yaw, idle?, hands?, props?, watch?,
// camera?, name?} in the parent's frame; name labels the person's spot bone (found with
// getObjectByName; scaled to ~0 it hides the person); idle is a KINDS name (default seated or stand);
// camera {x, y, z, back, drop} puts a TV camera head on a panning tripod top there, the
// operator `back` metres behind it and `drop` below.
const LIVE=new Set(),CENTRE=new THREE.Vector3(),EYE=new THREE.Vector3(),AT=new THREE.Vector3(),CARS=[],POOL=[];
class Crowd{
 constructor(entries,material,seed){
  const rand=dice(seed),bones=[],slot=new Map(),geometries=[],roots=[];this.folk=[];
  const bone=(name,parent,x=0,y=0,z=0)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent?.add(b);slot.set(b,bones.length);bones.push(b);return b;};
  const skin=(g,b)=>{g.applyMatrix4(b.matrixWorld);const n=g.attributes.position.count,index=new Uint16Array(n*4),weight=new Float32Array(n*4),k=slot.get(b);for(let i=0;i<n;i++){index[i*4]=k;weight[i*4]=1;}
   g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));geometries.push(g);};
  for(const e of entries){
   const o={...BASE,...e.outfit},{bones:own,parts,rig,head}=skeletonFor(o),kind=e.idle??(['sit','stool'].includes(e.pose)?'seated':'stand');
   const spot=bone(e.name??'Lugar',null,e.x,e.y,e.z);spot.rotation.y=e.yaw;roots.push(spot);let feet=spot,camera=null;
   if(e.camera){const c=e.camera;spot.position.set(c.x,c.y,c.z);camera={spot,tilt:bone('Camera_tv',spot),pan:0,speed:0,step:0,busy:0,back:c.back};feet=bone('Operador',spot,-c.back,-c.drop,0);}
   feet.add(rig.hips);for(const b of own){slot.set(b,bones.length);bones.push(b);}
   // Taller or shorter (about ±6%), standing people only: the seated ones keep the height of their stool or chair.
   // (From the spot's place, not the crowd's dice: the idles stay as they were.)
   // (by the pose, not the idle: Box 99's desk engineers sit on stools with the 'desk' idle, their hands on the desk)
   if(!['sit','stool'].includes(e.pose)&&!e.camera){const h=Math.abs(Math.sin(e.x*12.9898+e.z*78.233)*43758.5453)%1;rig.stature=.94+.12*h;rig.hips.scale.setScalar(rig.stature);rig.hips.position.y=.93*rig.stature;}
   const carried=e.props??KIND_PROPS[kind]??[],props={};for(const name of carried)props[name]=bone('Objeto_'+name,rig.limbs[1].hand);
   spot.updateMatrixWorld(true);
   for(const [g,b] of parts)skin(g,b);skin(head,rig.head);for(const name of carried)skin(PROPS[name](),props[name]);if(camera)skin(cameraHead(),camera.tilt);
   const base=POSES[e.pose]??POSES.stand;
   this.folk.push({rig,pose:e.pose??'stand',base,show:clonePose(base),mind:new IdleMind(kind,{hands:e.hands,props:carried,seed:rand()}),props,always:kind==='seated'?['cup']:[],camera,spot,yaw:e.yaw,watch:e.watch??KIND_WATCH[kind]??0,look:{angle:0,pitch:0,tilt:0}});
  }
  const mesh=this.mesh=new THREE.SkinnedMesh(mergeGeometries(geometries,false),material);geometries.forEach(g=>g.dispose());
  mesh.castShadow=mesh.receiveShadow=true;for(const r of roots)mesh.add(r);mesh.bind(new THREE.Skeleton(bones));
  // Culled as a group: the spots, with room for raised arms and the camera heads.
  const box=new THREE.Box3();for(const r of roots)box.expandByPoint(r.position);box.expandByScalar(2.6);mesh.boundingBox=box;mesh.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
  this.centre=mesh.boundingSphere.center.clone();this.radius=mesh.boundingSphere.radius;this.due=0;this.tick=0;this.attached=false;
  // The mesh never moves; its bones only when this crowd is updated (hold): the rest of the time three.js need not
  // recompute their matrices every frame (perf-probe.js freezeStatic freezes what holds it).
  this.bones=bones;this.held=false;mesh.matrixAutoUpdate=false;
  for(const f of this.folk){for(const [name,b] of Object.entries(f.props))b.scale.setScalar(f.always.includes(name)?1:1e-4);applyPose(f.rig,f.show);}
  LIVE.add(this);
 }
 // Bones still (on) while the crowd is not updated: they keep the matrices of their last pose.
 hold(on){if(this.held===on)return;this.held=on;for(const b of this.bones)b.matrixAutoUpdate=!on;}
 // The nearest car within `range` of a spot, as seen from its heading (null if none, or behind).
 sight(f,range,cars,eye){
  if(!range||!cars.length)return null;AT.copy(f.spot.position).applyMatrix4(this.mesh.matrixWorld);let best=null,d2=range*range;
  for(const c of cars){const dx=c.x-AT.x,dz=c.z-AT.z,d=dx*dx+dz*dz;if(d<d2){d2=d;best=c;}}
  if(!best)return null;const dx=best.x-AT.x,dz=best.z-AT.z,flat=Math.hypot(dx,dz),angle=wrap(Math.atan2(-dz,dx)-f.yaw);if(Math.abs(angle)>2.3)return null;
  f.look.angle=angle;f.look.pitch=Math.atan2(best.y+.6-AT.y-eye,flat);f.look.tilt=Math.atan2(best.y+.5-AT.y,flat);return f.look;
 }
 // Someone here run over: the flight is worked out in the mesh's frame, and the group is
 // drawn even when its box is off screen while anyone is in the air.
 launch(f,velocity,car){
  const inverse=this.mesh.matrixWorld.clone().invert(),turn=new THREE.Quaternion().setFromRotationMatrix(this.mesh.matrixWorld).invert();
  f.home??=f.spot.position.clone();
  f.tumble=new Tumble({feet:f.spot.position,yaw:f.yaw,velocity:velocity.clone().applyQuaternion(turn),home:f.home,homeYaw:f.yaw,car:car.clone().applyMatrix4(inverse)});
  this.flying=(this.flying??0)+1;this.mesh.frustumCulled=false;
 }
 update(dt,cars){
  for(const f of this.folk){
   const s=f.show,c=f.camera;
   if(f.tumble){
    copyPose(s,POSES.stand);
    if(f.tumble.update(dt,s)){f.spot.position.copy(f.tumble.feet);f.spot.quaternion.copy(f.tumble.q);}
    else{f.spot.position.copy(f.home);f.spot.rotation.set(0,f.yaw,0);f.tumble=null;if(!--this.flying)this.mesh.frustumCulled=true;}
    applyPose(f.rig,s);continue;
   }
   copyPose(s,f.base);
   if(!c){f.mind.apply(s,dt,{pose:f.pose,look:this.sight(f,f.watch,cars,1.6)});}
   else{
    // The cameraman keeps the lens on the nearest car in range, panning the head and
    // stepping round the tripod with it; with nothing to film he idles beside it.
    const look=this.sight(f,f.watch,cars,0),film=!!look&&Math.abs(look.angle)<1.35,before=c.pan;
    c.pan+=Math.max(-2.6*dt,Math.min(2.6*dt,((film?look.angle:0)-c.pan)*Math.min(1,dt*(film?6:.8))));
    c.speed=dt>0?Math.abs(c.pan-before)/dt:0;c.busy+=((film?1:0)-c.busy)*Math.min(1,dt*3);
    c.spot.rotation.y=f.yaw+c.pan;c.tilt.rotation.z+=((film?Math.max(-.5,Math.min(.15,look.tilt)):-.06)-c.tilt.rotation.z)*Math.min(1,dt*4);
    f.mind.apply(s,dt,{pose:f.pose,calm:c.busy>.2});
    const w=c.busy;s.lean+=(.3-s.lean)*w;s.y+=(-.06-s.y)*w;s.head+=(.2-s.head)*w;s.turn*=1-w;s.twist*=1-w;s.sway*=1-w;
    for(const i of [0,1]){s.thigh[i]+=(.1-s.thigh[i])*w;s.knee[i]+=(.15-s.knee[i])*w;}both(s,ARMS.camera,w);
    const walk=Math.min(1,c.speed*c.back/.5);c.step+=dt*c.speed*c.back*9;
    if(walk>.05)for(const [i,sign] of [[0,1],[1,-1]]){s.thigh[i]+=Math.sin(c.step)*sign*.22*walk;s.knee[i]+=Math.max(0,Math.cos(c.step)*sign)*.4*walk;}
   }
   applyPose(f.rig,s);
   for(const [name,b] of Object.entries(f.props))if(!f.always.includes(name))b.scale.setScalar(f.mind.using===name?1:1e-4);
  }
 }
}
const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true;};

// ---- Run over (by accident, of course). ----
// A car that hits someone throws them up like a cartoon: floaty hang time, spinning like
// a pinwheel with arms and legs flailing, a couple of rubbery bounces. They lie flat out a
// moment, get up dizzy, shake a fist at the car and walk back to their spot.
// Works in any frame with y up (a crowd's mesh, or the world for the Box 99 crew): feet
// are where the figure's origin goes, q its orientation.
const TUMBLE_G=6.5,HIPS=.93,UP=new THREE.Vector3(0,1,0),ALONG=new THREE.Vector3(0,0,1),EVENTS=[];
const TQ=new THREE.Quaternion(),TQ2=new THREE.Quaternion(),TV=new THREE.Vector3();
class Tumble{
 constructor({feet,yaw,velocity,home,homeYaw,car,seed=Math.random()}){
  const rand=dice(seed);
  this.hips=new THREE.Vector3(feet.x,feet.y+HIPS,feet.z);this.v=velocity.clone();this.floor=feet.y;this.yaw=yaw;
  this.home=home.clone();this.homeYaw=homeYaw;this.car=car.clone();this.phase='fly';this.t=0;this.clock=0;this.bounces=0;this.step=0;
  // Tumbling head over heels about the horizontal line across the throw, and twirling.
  this.axis=new THREE.Vector3(-velocity.z,0,velocity.x);if(this.axis.lengthSq()<1e-6)this.axis.set(1,0,0);this.axis.normalize();
  this.spin=(8+rand()*6)*(rand()<.5?-1:1);this.twirl=(2+rand()*4)*(rand()<.5?-1:1);this.angle=0;
  this.q=new THREE.Quaternion().setFromAxisAngle(UP,yaw);this.from=new THREE.Quaternion();this.feet=feet.clone();
 }
 upright(q=this.q){return q.setFromAxisAngle(UP,this.yaw);}
 // Lying on the back: the body's front turned to the sky.
 flat(q){return q.setFromAxisAngle(UP,this.yaw).multiply(TQ2.setFromAxisAngle(ALONG,Math.PI/2));}
 go(phase){
  this.phase=phase;this.t=0;this.from.copy(this.q);
  // Getting up: the hips come up over the feet, which stay where the legs lay.
  if(phase==='rise'){this.riseFrom=this.hips.clone();this.riseTo=new THREE.Vector3(this.feet.x,this.floor+HIPS,this.feet.z);}
 }
 // Advance by dt and pose the figure on s (a copy of its standing pose); false once home.
 update(dt,s){
  this.t+=dt;this.clock+=dt;const t=this.clock;s.y=0;
  if(this.phase==='fly'){
   this.v.y-=TUMBLE_G*dt;this.hips.addScaledVector(this.v,dt);this.angle+=this.spin*dt;this.yaw+=this.twirl*dt;
   this.q.setFromAxisAngle(this.axis,this.angle).multiply(TQ.setFromAxisAngle(UP,this.yaw));
   // Flailing: arms windmilling overhead, legs kicking.
   s.arm[0]=2.1+.7*Math.sin(t*17);s.arm[1]=1.9+.7*Math.sin(t*15+1);s.spread[0]=1.1+.4*Math.sin(t*13);s.spread[1]=1.2+.4*Math.sin(t*11+2);
   s.elbow[0]=.4+.3*Math.sin(t*9);s.elbow[1]=.6;s.thigh[0]=.6*Math.sin(t*14);s.thigh[1]=-.6*Math.sin(t*14);
   s.knee[0]=.7+.4*Math.sin(t*9);s.knee[1]=.8+.4*Math.cos(t*10);s.lean=-.25;s.head=-.35;
   if(this.hips.y<this.floor+.35&&this.v.y<0){
    const drop=-this.v.y;this.hips.y=this.floor+.35;
    // Rubbery: two bounces, each lower, then flat on the ground.
    if(this.bounces<2&&drop>2.2){this.v.y=drop*.5;this.v.x*=.35;this.v.z*=.35;this.spin*=.55;this.twirl*=.5;this.bounces++;EVENTS.push({sound:'boing',strength:Math.min(1.2,drop/7)});}
    else{this.v.y=0;this.go('lie');EVENTS.push({sound:'boing',strength:.4});}
   }
  }else if(this.phase==='lie'){
   // Slides to a stop, sprawled like a starfish, one foot twitching.
   const k=Math.exp(-dt*4);this.v.x*=k;this.v.z*=k;this.hips.x+=this.v.x*dt;this.hips.z+=this.v.z*dt;
   this.hips.y+=(this.floor+.16-this.hips.y)*Math.min(1,dt*10);this.q.slerpQuaternions(this.from,this.flat(TQ),smooth(this.t/.3));
   s.arm[0]=s.arm[1]=.3;s.spread[0]=s.spread[1]=1.35;s.elbow[0]=s.elbow[1]=.2;s.thigh[0]=.25;s.thigh[1]=-.2;s.knee[1]=.1;s.knee[0]=.2+.35*Math.max(0,Math.sin(t*14))*(this.t>.6);s.lid=1;
   if(this.t>1.5)this.go('rise');
  }else if(this.phase==='rise'){
   const k=smooth(this.t/.7);this.q.slerpQuaternions(this.from,this.upright(TQ),k);this.hips.lerpVectors(this.riseFrom,this.riseTo,k);
   s.knee[0]=s.knee[1]=.9*(1-k);s.thigh[0]=s.thigh[1]=.8*(1-k);s.arm[0]=s.arm[1]=.5*(1-k);s.lid=1-k;
   if(this.t>.7)this.go('dizzy');
  }else if(this.phase==='dizzy'){
   // Seeing stars: swaying in circles, head lolling.
   this.upright();s.sway=.06*Math.sin(t*5);s.tilt=.2*Math.sin(t*4);s.head=.15*Math.sin(t*3.3);s.turn=.35*Math.sin(t*2.5);s.lid=.45;
   s.arm[0]=s.arm[1]=.35;s.spread[0]=.55+.1*Math.sin(t*5);s.spread[1]=.55-.1*Math.sin(t*5);
   if(this.t>1.3){this.go('fist');EVENTS.push({sound:'talk',strength:.8});}
  }else if(this.phase==='fist'){
   // Turns to the car and shakes a fist at it.
   const want=Math.atan2(-(this.car.z-this.hips.z),this.car.x-this.hips.x);this.yaw+=wrap(want-this.yaw)*Math.min(1,dt*6);this.upright();
   s.arm[1]=2.5;s.elbow[1]=1.25+.4*Math.sin(t*22);s.spread[1]=.25;s.arm[0]=-.3;s.spread[0]=.5;s.lean=-.06;s.head=-.12;s.tilt=.08*Math.sin(t*22);
   if(this.t>1.1)this.go('walk');
  }else if(this.phase==='walk'||this.phase==='turn'){
   const dx=this.home.x-this.hips.x,dz=this.home.z-this.hips.z,dist=Math.hypot(dx,dz);
   if(this.phase==='walk'&&dist>.05){
    // Back to the spot at a limping walk.
    const len=Math.min(dist,1.8*dt);this.hips.x+=dx/dist*len;this.hips.z+=dz/dist*len;this.step+=len*4.3;
    this.yaw+=wrap(Math.atan2(-dz,dx)-this.yaw)*Math.min(1,dt*8);gait(s,this.step,1,false);s.tilt+=.07*Math.sin(this.step);s.sway+=.03*Math.sin(this.step);
   }else{
    if(this.phase==='walk')this.go('turn');
    this.hips.x=this.home.x;this.hips.z=this.home.z;this.yaw+=wrap(this.homeYaw-this.yaw)*Math.min(1,dt*6);
    if(this.t>.6){this.yaw=this.homeYaw;this.upright();this.feet.copy(this.home);return false;}
   }
   this.hips.y=this.home.y+HIPS;this.upright();
  }
  // Feet below the hips along the body.
  this.feet.copy(this.hips).sub(TV.set(0,HIPS,0).applyQuaternion(this.q));
  return true;
 }
}
// The Box 99 crew and the Tia (Actors, in world coordinates) can be run over too.
const ACTORS=new Set();
// How a car throws someone it hits (world, three.js axes): mostly up, and ahead and off to
// the side it was on, harder the faster the car (high rather than far: they walk back).
function throwFrom(car,side){
 const speed=Math.hypot(car.vx,car.vy),c=Math.cos(car.heading),s=Math.sin(car.heading),k=(.25+Math.random()*.15)*Math.min(1,14/Math.max(speed,1)),out=side*(1+Math.random()*1.5);
 const up=3+Math.min(speed,25)*.4+Math.random();
 return new THREE.Vector3(car.vx*k-s*out,up,-(car.vy*k+c*out));
}
// Once a frame (main.js) with the player's car: anyone standing in its path, on the same
// level and hit faster than a walk, goes flying. Returns how many were hit.
// CAR_GROUND: the centre of mass above the ground (physics.js CG_HEIGHT). The car's plan is its body's
// (car.body front, rear and halfWidth: the Opala's or the Fusca's), the Opala's by default.
const CAR_FRONT=2.42,CAR_REAR=2.35,CAR_SIDE=.93,BODY=.3,HIT_SPEED=2,CAR_GROUND=.52;
export function hitPeople(car){
 const speed=Math.hypot(car.vx,car.vy);if(speed<HIT_SPEED)return 0;
 const front=car.body?.front??CAR_FRONT,rear=car.body?.rear??CAR_REAR,side=car.body?.halfWidth??CAR_SIDE;
 const c=Math.cos(car.heading),s=Math.sin(car.heading),ground=car.z-CAR_GROUND,where=new THREE.Vector3(car.x,ground,-car.y);let hits=0;
 // Body frame of the car: along (forward) and across (left); true when (x, y) is inside the plan.
 const inside=(x,y,z)=>{if(Math.abs(z-ground)>1.3)return 0;const dx=x-car.x,dy=y-car.y,b=dx*c+dy*s,l=-dx*s+dy*c;
  return b>-rear-BODY&&b<front+BODY&&Math.abs(l)<side+BODY?(Math.sign(l)||1):0;};
 for(const crowd of LIVE){
  if(!crowd.attached||!shown(crowd.mesh))continue;
  CENTRE.copy(crowd.centre).applyMatrix4(crowd.mesh.matrixWorld);if(Math.hypot(CENTRE.x-car.x,-CENTRE.z-car.y)>crowd.radius+4)continue;
  for(const f of crowd.folk){
   if(f.tumble||f.camera||f.spot.scale.x<.01)continue;AT.copy(f.spot.position).applyMatrix4(crowd.mesh.matrixWorld);
   const side=inside(AT.x,-AT.z,AT.y);if(!side)continue;
   crowd.launch(f,throwFrom(car,side),where);hits++;
  }
 }
 for(const a of ACTORS){
  let root=a.person;while(root.parent)root=root.parent;
  // Actors of a circuit that was unloaded are forgotten.
  if(!root.isScene){if(a.attached)ACTORS.delete(a);continue;}a.attached=true;
  if(a.tumble||!shown(a.person))continue;
  const side=inside(a.x,a.y,a.person.position.y);if(!side)continue;
  a.tumble=new Tumble({feet:a.person.position,yaw:a.yaw,velocity:throwFrom(car,side),home:a.person.position,homeYaw:a.yaw,car:where});hits++;
 }
 for(let i=0;i<hits;i++)EVENTS.push({sound:'bonk',strength:Math.min(1.3,.5+speed/15)});
 return hits;
}
// Sounds from the flights since the last call ({sound, strength}), for main.js to play.
export function takePeopleEvents(){return EVENTS.splice(0);}
// Once a frame (main.js): people near the camera idle every frame, the ones farther off
// every fourth, beyond 300 m not at all; past 200 m they cast no shadow and past 800 m (a
// pixel or two tall) they are not drawn. cars: Object3Ds (the player's car and the rivals) whose positions catch the
// eye of marshals, cameramen and spectators.
// How far the idle crowds show (graphics-settings.js PEOPLE_REACH by the scenery level): beyond 250 m a person is a few
// pixels tall, and the light build's video spent a millisecond on them from across the circuit.
// The reach, the idling's pace and the cut-off go by how big a person looks: the distance shortened by the camera's lens
// (the broadcast camera's long lens shows a marshal 400 m off as big as the chase view at 40: landscape.js crowdNear's
// rule, 29° the chase lens's half height); the shadow stays in metres (the sun's map knows no lens).
let peopleReach=800;export const setPeopleReach=metres=>{peopleReach=metres;};
const LENS_REF=Math.tan(29*Math.PI/180);
export function updatePeople(dt,camera,cars=[]){
 CARS.length=0;for(const o of cars)if(o&&shown(o)){const v=POOL[CARS.length]??(POOL[CARS.length]=new THREE.Vector3());CARS.push(v.setFromMatrixPosition(o.matrixWorld));}
 EYE.setFromMatrixPosition(camera.matrixWorld);
 const zoom=camera.isPerspectiveCamera?Math.min(1,Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1)/LENS_REF):1;
 for(const c of LIVE){
  let root=c.mesh;while(root.parent)root=root.parent;
  // A crowd put aside for a while (immersive-visuals.js park: keepPeople) waits; one taken out of the scene for good goes.
  if(!root.isScene){if(c.attached&&!root.userData.keepPeople)LIVE.delete(c);continue;}c.attached=true;
  CENTRE.copy(c.centre).applyMatrix4(c.mesh.matrixWorld);const metres=CENTRE.distanceTo(EYE)-c.radius,far=metres*zoom;c.mesh.visible=far<peopleReach;c.mesh.castShadow=metres<200;
  if(far>300||!shown(c.mesh)){c.due=0;c.hold(true);continue;}
  c.due+=dt;if(far>90&&(c.tick=(c.tick+1)%4)){c.hold(true);continue;}c.hold(false);c.update(c.due,CARS);c.due=0;
 }
}
export {ARMS as IDLE_ARMS,GESTURES as IDLE_GESTURES,KINDS as IDLE_KINDS,applyPose,clonePose};
// Test hook: how many idle crowds are live and what their people are doing.
export function peopleInfo(){return [...LIVE].map(c=>({name:c.mesh.name,people:c.folk.length,attached:c.attached,visible:c.mesh.visible,
 doing:c.folk.map(f=>f.mind.gesture?.name??(f.camera&&f.camera.busy>.5?'filmando':null)),using:c.folk.map(f=>f.mind.using),kinds:c.folk.map(f=>f.mind.kind),
 spots:c.folk.map(f=>{const w=f.spot.getWorldPosition(new THREE.Vector3());return [w.x,w.y,w.z,f.yaw];}),pan:c.folk.map(f=>f.camera?f.camera.pan:null),
 tumbles:c.folk.map(f=>f.tumble?.phase??null)}));}
// Test hook: everyone in the air or on the way back ({phase, feet} in world metres, three.js axes).
export function tumbleInfo(){
 const out=[];
 for(const c of LIVE)for(const f of c.folk)if(f.tumble){const w=f.tumble.feet.clone().applyMatrix4(c.mesh.matrixWorld);out.push({crowd:c.mesh.name,phase:f.tumble.phase,feet:[w.x,w.y,w.z]});}
 for(const a of ACTORS)if(a.tumble)out.push({actor:a.person.name,phase:a.tumble.phase,feet:a.tumble.feet.toArray()});
 return out;
}

// One animated person: walks or jogs to a target spot, turns to face its heading,
// settles into a pose and layers small work movements on top.
// idle: {kind, hands, posture, props (name: mesh in hand), seed} for the IdleMind that
// fills the waits; calm (set by the owner) keeps it to breathing and glances.
class Actor{
 constructor(person,x,y,yaw,idle={}){this.person=person;this.x=x;this.y=y;this.yaw=yaw;this.speed=0;this.phase=0;this.t=Math.random()*9;this.act=null;this.look=0;this.calm=false;this.target={x,y,yaw,pose:'stand'};this.show=clonePose(person.userData.pose);
  this.props=idle.props??{};this.mind=new IdleMind(idle.kind??'crew',{hands:idle.hands,props:Object.keys(this.props),seed:idle.seed});this.mind.posture=idle.posture??true;this.tumble=null;ACTORS.add(this);}
 go(x,y,yaw,pose,pass=false){Object.assign(this.target,{x,y,yaw,pose,pass});}
 step(dt,ground){
  // Run over: the flight, the fall and the walk back take over until they are done.
  if(this.tumble){
   const s=this.show;copyPose(s,POSES.stand);
   if(this.tumble.update(dt,s)){applyPose(this.person.userData.rig,s);this.person.position.copy(this.tumble.feet);this.person.quaternion.copy(this.tumble.q);this.x=this.tumble.feet.x;this.y=-this.tumble.feet.z;return;}
   this.yaw=this.tumble.yaw;this.tumble=null;this.person.rotation.set(0,this.yaw,0);
  }
  const dx=this.target.x-this.x,dy=this.target.y-this.y,dist=Math.hypot(dx,dy),p=this.person.userData.pose;this.t+=dt;let moving=0;
  if(dist>.05){const want=this.target.pass?3.2:Math.min(dist>2.5?3.6:1.7,dist*3+.3);this.speed+=(want-this.speed)*Math.min(1,dt*6);const len=Math.min(dist,this.speed*dt);this.x+=dx/dist*len;this.y+=dy/dist*len;this.yaw+=wrap(Math.atan2(dy,dx)-this.yaw)*Math.min(1,dt*10);moving=Math.min(1,this.speed/1.1);this.phase+=len*(this.speed>2.3?3.2:4.3);}
  else{this.speed=0;this.yaw+=wrap(this.target.yaw-this.yaw)*Math.min(1,dt*6);}
  blendPose(p,POSES[this.target.pose]??POSES.stand,1-Math.exp(-dt*7));
  if(moving>.05)gait(p,this.phase,moving,this.speed>2.3);
  // Work movements and breathing go on a copy, so they never build up in the pose.
  const s=this.show,t=this.t;copyPose(s,p);s.turn+=this.look;
  this.mind.apply(s,dt,{pose:this.target.pose,calm:this.calm||moving>.05||!!this.act});for(const [name,prop] of Object.entries(this.props))prop.visible=this.mind.using===name;
  if(moving<=.05){
   if(this.act==='gun'){s.elbow[1]+=Math.sin(t*38)*.06;s.lean+=Math.sin(t*3)*.02;}
   else if(this.act==='wrench'){s.arm[1]+=Math.sin(t*6)*.18;s.elbow[1]+=Math.sin(t*6+1)*.25;s.arm[0]+=Math.sin(t*2.3)*.06;}
   else if(this.act==='fuel')s.arm[0]+=Math.sin(t*2)*.03;
   else if(this.act==='wave')s.spread[1]+=Math.sin(t*9)*.35;
   else if(this.act==='wipe'){s.arm[1]+=Math.sin(t*4)*.14;s.spread[1]+=Math.cos(t*4)*.18;}
  }
  applyPose(this.person.userData.rig,s);this.person.position.set(this.x,ground(this.x,this.y),-this.y);this.person.rotation.y=this.yaw;
 }
}

// Walking round the car, never through it: the shortest way past the corners of its
// footprint (car frame: forward, right; metres, with a margin). `keep` favours the
// corner taken last time so a detour does not flip sides halfway.
const CAR_HALF=[2.75,1.25];
function crossesBox(p,q,hx,hy){
 let t0=0,t1=1;const dx=q[0]-p[0],dy=q[1]-p[1];
 for(const [a,b] of [[-dx,p[0]+hx],[dx,hx-p[0]],[-dy,p[1]+hy],[dy,hy-p[1]]]){
  if(a===0){if(b<0)return false;continue;}const r=b/a;
  if(a<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}
 }
 return t0<t1;
}
function detour(a,t,keep){
 const [hx,hy]=CAR_HALF;
 if(Math.abs(a[0])<hx&&Math.abs(a[1])<hy)return hy-Math.abs(a[1])<hx-Math.abs(a[0])?{point:[a[0],Math.sign(a[1]||-1)*(hy+.35)],corner:-1}:{point:[Math.sign(a[0]||1)*(hx+.35),a[1]],corner:-1};
 if(!crossesBox(a,t,hx-.05,hy-.05))return null;
 const nodes=[a,...[[1,1],[1,-1],[-1,-1],[-1,1]].map(([i,j])=>[i*(hx+.3),j*(hy+.3)]),t],n=nodes.length,dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),done=Array(n).fill(false);dist[0]=0;
 // The corner already chosen keeps a small bonus (no dithering between two routes), but not once
 // reached: standing on it, it would be chosen again forever (Brasília's fuel man, who comes round
 // the car's front to his place behind it, stopped at the rear corner instead of going on).
 const reached=keep>0&&Math.hypot(a[0]-nodes[keep][0],a[1]-nodes[keep][1])<.3;
 for(;;){
  let u=-1;for(let i=0;i<n;i++)if(!done[i]&&dist[i]<Infinity&&(u<0||dist[i]<dist[u]))u=i;if(u<0||u===n-1)break;done[u]=true;
  for(let v=1;v<n;v++)if(!done[v]&&!crossesBox(nodes[u],nodes[v],hx-.05,hy-.05)){const w=Math.hypot(nodes[u][0]-nodes[v][0],nodes[u][1]-nodes[v][1])-(u===0&&v===keep&&!reached?.4:0);if(dist[u]+w<dist[v]){dist[v]=dist[u]+w;prev[v]=u;}}
 }
 let v=n-1;if(prev[v]<0)return null;while(prev[v]!==0)v=prev[v];return {point:nodes[v],corner:v};
}

// Box 99 crew: [role, outfit extras, spot beside the car (forward, right of the car
// centre, metres), pose there]. Jobs send the matching mechanic to the part.
const ROLES=[
 ['Chefe_pirulito',{hat:'headset',skin:0xb77a55,mustache:true},[2.75,-1.5],'lollipop'],
 ['Macaco_dianteiro',{hat:'cap',skin:0x8d5a3b},[3.2,-.5],'ready'],
 ['Roda_dianteira',{hat:'helmet',hatColor:0xf2f2ee,skin:0xe0b08f},[1.53,-1.55],'ready'],
 ['Roda_traseira',{hat:'helmet',hatColor:0xf2f2ee,skin:0x6b4128},[-1.12,-1.55],'ready'],
 ['Gasolina',{hat:'cap',skin:0xc68e6a,hairStyle:'curly'},[-2.4,-1.45],'stand'],
 ['Mecanico',{hat:'cap',skin:0xd9a37f,mustache:true,belly:.6},[.25,-1.6],'ready'],
];
// Where each service is done (car frame f forward, r right) and how. The fuel man
// refuels; the three mechanics (front wheel, rear wheel and the engine man) share the
// other jobs, each taking the next job still unmanned and preferring his own trade,
// so jobs in different places (car-condition.js) are worked at the same time. The
// jack man lifts the front for brakes and suspension.
const SLOTS={
 fuel:[[[-.7,1.55],'fuel','fuel']],
 motor:[[[2.85,.45],'work','wrench']],
 cambio:[[[-.1,-1.45],'kneel','wrench']],
 freios:[[[1.53,1.42],'kneel','gun']],
 suspensao:[[[1.53,-1.45],'kneel','gun']],
 pneus:[[[-1.12,-1.45],'kneel','gun'],[[-1.12,1.42],'kneel','gun']],
 tanque:[[[-2.95,-.25],'kneel','wrench']],
};
const PREFER={motor:[5,2,3],cambio:[5,3,2],freios:[2,5,3],suspensao:[2,5,3],pneus:[3,5,2],tanque:[5,3,2]};
function crewTasks(jobs){
 const tasks=new Map(),free=[2,3,5];
 for(const id of jobs){
  if(id==='fuel'){const [at,pose,act]=SLOTS.fuel[0];tasks.set(4,{at,pose,act});continue;}
  for(const [at,pose,act] of SLOTS[id]??[]){const who=(PREFER[id]??free).find(i=>free.includes(i));if(who===undefined)break;free.splice(free.indexOf(who),1);tasks.set(who,{at,pose,act});}
 }
 if(jobs.includes('freios')||jobs.includes('suspensao'))tasks.set(1,{at:[3.2,-.5],pose:'jack',act:null});
 return tasks;
}
export class PitCrew{
 // homes: [{x,y,yaw,pose}] in track coordinates (y north); ground(x,y) gives the floor height.
 constructor(people,{homes,ground}){
  this.root=new THREE.Group();this.root.name='Equipe_box99';this.ground=ground;this.homes=homes;
  // At the door they idle with the free hand: the chief holds the lollipop, the fuel
  // man his can and the three mechanics their gun or spanner in the right hand.
  this.actors=ROLES.map(([name,extra],i)=>{const person=people.person({...CREW,...extra});person.name=name;this.root.add(person);const h=homes[i];const a=new Actor(person,h.x,h.y,h.yaw,{kind:'crew',hands:[true,i===1],posture:i!==0,seed:.07+i*.131});a.go(h.x,h.y,h.yaw,h.pose);return a;});
  const hand=i=>this.actors[i].person.userData.rig.limbs[1].hand;
  // Wheel guns, fuel dump can, spanner and the front jack.
  // Each mechanic has a wheel gun and a spanner and shows the one his job needs.
  this.tools=[2,3,5].map(i=>({i,gun:people.prop([piece(block(.09,.2,.1),0x2a2d30,[0,-.06,0]),piece(tube(.025,.025,.16,10),0xb9bec2,[0,-.22,0]),piece(block(.06,.1,.05),0xf0c419,[.07,-.02,0])],hand(i),'Pistola_pneumatica'),spanner:people.prop([piece(block(.03,.28,.015),0xc9ced2,[0,-.12,0])],hand(i),'Chave_boca')}));
  // Dump can, origin at its handle; the spout tip is at SPOUT (filler at the right rear quarter).
  this.can=people.prop([piece(block(.34,.38,.18),0xc81d25,[-.02,-.26,0]),piece(block(.22,.03,.04),0x2a2d30,[0,-.02,0]),piece(block(.03,.06,.04),0x2a2d30,[-.1,-.05,0]),piece(block(.03,.06,.04),0x2a2d30,[.1,-.05,0]),piece(tube(.024,.024,.34,8),0x2a2d30,[.27,-.21,0],[0,0,-2.27]),piece(tube(.032,.032,.04,8),0xf0c419,[-.12,-.06,.05])],this.root,'Galao_gasolina');
  this.spout=new THREE.Vector3(.4,-.31,0);this.filler=new THREE.Vector3();
  const jack=this.actors[1].person;people.prop([piece(block(.9,.14,.3),0xc81d25,[1.3,.12,0]),piece(tube(.06,.06,.04,12),0x2a2d30,[1.7,.07,.14],[Math.PI/2,0,0]),piece(tube(.06,.06,.04,12),0x2a2d30,[1.7,.07,-.14],[Math.PI/2,0,0]),piece(block(.2,.04,.24),0x3a3f44,[1.72,.21,0]),piece(tube(.022,.022,.85,8),0xb9bec2,[.74,.6,0],[0,0,.28])],jack,'Macaco_jacare');
  // Lollipop: the pole follows the chief's right hand; the disc turns to the driver.
  this.discs={stop:new THREE.MeshBasicMaterial({map:lollipop('FREIO','#c81d25'),transparent:true,side:THREE.DoubleSide}),go:new THREE.MeshBasicMaterial({map:lollipop('ENGATA\n1ª','#1f8a3b'),transparent:true,side:THREE.DoubleSide})};
  this.pole=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,1,8),people.material);this.pole.geometry.deleteAttribute('uv');
  const colors=new Float32Array(this.pole.geometry.attributes.position.count*3).fill(.12);this.pole.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  this.disc=new THREE.Mesh(new THREE.CircleGeometry(.23,28),this.discs.stop);this.root.add(this.pole,this.disc);
  // The can, the pole and the disc are placed by hand every frame (below): never frozen with the still scenery
  // (perf-probe.js freezeStatic; frozen, they stood at the world's origin, 30 m off the box).
  this.can.userData.live=this.pole.userData.live=this.disc.userData.live=true;
  this.handPos=new THREE.Vector3();this.poleDir=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);this.visible=true;
 }
 update(dt,{car,active,jobs=[],finished,departing,near}){
  this.root.visible=near;if(!near)return;
  const h=car.heading,cos=Math.cos(h),sin=Math.sin(h),toWorld=(f,r)=>[car.x+cos*f+sin*r,car.y+sin*f-cos*r];
  const facing=(f,r)=>{const [x,y]=toWorld(f,r),[tx,ty]=toWorld(Math.max(-2,Math.min(2,f)),Math.max(-.5,Math.min(.5,r)));return Math.atan2(ty-y,tx-x);};
  const tasks=active?crewTasks(jobs):new Map();
  const local=(x,y)=>{const dx=x-car.x,dy=y-car.y;return [dx*cos+dy*sin,dx*sin-dy*cos];},parked=Math.hypot(car.vx??0,car.vy??0)<1;
  this.actors.forEach((actor,i)=>{
   let x,y,yaw,pose;
   if(active){const [,,ready,idle]=ROLES[i],task=tasks.get(i),at=task?.at??ready;[x,y]=toWorld(...at);yaw=facing(...at);pose=task?.pose??(i===0?'lollipop':idle);actor.act=task?.act??null;}
   else{const home=this.homes[i];({x,y,yaw,pose}=home);if(i===0&&departing)pose='wave';actor.act=i===0&&departing?'wave':null;}
   // Round the parked car rather than through it.
   const way=parked&&Math.hypot(actor.x-car.x,actor.y-car.y)<12?detour(local(actor.x,actor.y),local(x,y),actor.corner):null;
   // With the car in the box they wait at their places ready, no stretching.
   actor.calm=active;
   if(way){actor.corner=way.corner;const [wx,wy]=toWorld(...way.point);actor.go(wx,wy,Math.atan2(wy-actor.y,wx-actor.x),'stand',true);actor.act=null;}
   else{actor.corner=-1;actor.go(x,y,yaw,pose);}
   actor.step(dt,this.ground);
  });
  // The can: spout in the filler while refuelling, otherwise hanging from the right hand.
  const fuel=this.actors[4];fuel.person.updateMatrixWorld(true);
  if(active&&fuel.act==='fuel'&&Math.hypot(fuel.target.x-fuel.x,fuel.target.y-fuel.y)<.2){
   const [fx,fy]=toWorld(-.7,.79),turn=Math.atan2(fy-fuel.y,fx-fuel.x);this.filler.set(fx,this.ground(fx,fy)+.9,-fy);
   this.can.rotation.set(0,turn,-.35);this.can.position.copy(this.filler).sub(this.spout.clone().applyEuler(this.can.rotation));
  }else{fuel.person.userData.rig.limbs[1].hand.getWorldPosition(this.can.position);this.can.rotation.set(0,fuel.yaw,0);}
  for(const t of this.tools){const act=this.actors[t.i].act;t.gun.visible=act==='gun'||!act&&t.i!==5;t.spanner.visible=!t.gun.visible;}
  // Pole along the hand, disc square to the driver (or to the lane when idle).
  const chief=this.actors[0],hand=chief.person.userData.rig.limbs[1].hand;chief.person.updateMatrixWorld(true);
  hand.getWorldPosition(this.handPos);this.poleDir.set(0,-1,0).transformDirection(hand.matrixWorld);
  this.pole.position.copy(this.handPos).addScaledVector(this.poleDir,.35);this.pole.scale.y=1.2;this.pole.quaternion.setFromUnitVectors(this.up,this.poleDir);
  this.disc.position.copy(this.handPos).addScaledVector(this.poleDir,.95);this.disc.rotation.set(0,active?h-Math.PI/2:chief.yaw+Math.PI/2,0);
  this.disc.material=finished?this.discs.go:this.discs.stop;
 }
}

// The Tia: turns to a customer coming close, waves, serves what was bought and
// wipes the counter now and then; in between she fans herself, checks her phone,
// sips her own coffee, puts her hands on her hips...
export class CafeHost{
 constructor(people,{x,y,yaw,ground}){
  const person=people.person(OUTFITS.tia),hand=person.userData.rig.limbs[1].hand;
  this.actor=new Actor(person,x,y,yaw,{kind:'counter',props:{cup:people.carry('cup',hand),phone:people.carry('phone',hand)},seed:.41});this.actor.person.name='Tia_da_lanchonete';this.home={x,y,yaw};this.ground=ground;this.greeted=false;this.wave=0;this.idle=0;
 }
 get root(){return this.actor.person;}
 update(dt,{hero,walking,snack,near}){
  this.root.visible=near;if(!near)return;
  const a=this.actor,dx=hero?hero.x-a.x:0,dy=hero?-hero.z-a.y:0,dist=walking?Math.hypot(dx,dy):99;
  if(dist<3.4&&!this.greeted){this.greeted=true;this.wave=1.8;}if(dist>6)this.greeted=false;
  this.wave=Math.max(0,this.wave-dt);this.idle=(this.idle+dt)%16;
  const look=dist<6?wrap(Math.atan2(dy,dx)-this.home.yaw):0,yaw=this.home.yaw+Math.max(-.8,Math.min(.8,look))*.6;
  const pose=snack>2.4?'serve':this.wave>0?'wave':this.idle>12.5?'wipe':'stand';
  a.look+=(Math.max(-.6,Math.min(.6,look*.5))-a.look)*Math.min(1,dt*4);
  // A customer at the counter has her attention: no phone then.
  a.calm=pose!=='stand'||dist<3.4;
  a.go(this.home.x,this.home.y,yaw,pose);a.act=pose==='wave'?'wave':pose==='wipe'?'wipe':null;a.step(dt,this.ground);
 }
}
