// Futebol no gramado do Mineirao, estilo Rocket League (teste/pampulha-futebol.js; pedido da equipe, 2026-10-19): a bola
// gigante (3,4 m, 250 kg) e a bolinha (22 cm, 430 g) com fisica propria; o Opala e o Fusca chutam a gigante e sentem o
// tranco; a bola volta do muro, sobe a arquibancada e desce, vai pro telhado ou pelo tunel (apito, volta pro meio); gol
// so com a bola inteira passando a linha entre as traves e por baixo do travessao (nao pelo teto do gol); a pe (free-walk.js)
// o piloto conduz a bolinha andando, E chuta (correndo mais forte, agachado um passe), empurra a gigante devagar, e ela
// o atropela quando vem rapida. A fisica de corrida (physics.js) fica igual: o carro so recebe os impulsos da bola.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {TestCar,OPALA_BODY,FUSCA_BODY,roamZoneAt} from '../teste/physics.js';
import {FootballGame,GOAL,BALL_PANELS,hasPampulhaFutebol} from '../teste/pampulha-futebol.js';

// The pilot's overalls carry the 99 painted on a canvas: a do-nothing canvas is enough here.
const ctx=new Proxy({},{get:(target,key)=>key in target?target[key]:()=>({width:0})});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
const {FreeWalk}=await import('../teste/free-walk.js');

const load=id=>{const d=JSON.parse(fs.readFileSync(new URL(`../dados/pista_${id}.json`,import.meta.url)));d.meta.id=id;return d;};
const DT=1/120,FRAME=1/60;
function setup(body=OPALA_BODY){
 const data=load('pampulha'),car=new TestCar(data).setBody(body),game=new FootballGame(data,{ground:(x,y)=>car.terrain(x,y)});
 return {data,car,game,bowl:game.bowl,F:game.field,g:game.giant,s:game.small};
}
const place=(b,bowl,u,v,z=null)=>{const [x,y]=bowl.world(u,v);b.p[0]=x;b.p[1]=y;if(z!==null)b.p[2]=bowl.pitchZ+z;b.v.fill(0);b.w.fill(0);b.asleep=false;b.state='play';b.spawn=1;};
const launch=(b,bowl,du,dv,vz=0)=>{b.v[0]=bowl.U[0]*du+bowl.V[0]*dv;b.v[1]=bowl.U[1]*du+bowl.V[1]*dv;b.v[2]=vz;b.asleep=false;};
const steps=(game,seconds,car=null,each=null)=>{for(let t=0;t<seconds;t+=DT){game.step(car,DT);each?.(t);}};
const local=(bowl,b)=>bowl.local(b.p[0],b.p[1]);

// 0. Only the Pampulha has it; the goals stand in the Mineirão's roam zone for the car.
{
 assert.equal(hasPampulhaFutebol(load('pampulha')),true,'the Pampulha has the Mineirão');
 assert.equal(hasPampulhaFutebol(load('floripa')),false,'other circuits have no football');
 const {game,bowl,F}=setup();
 assert.ok(game.roamSolids>=10,`the goals' posts, sides and backs are the car's solids (${game.roamSolids})`);
 for(const [u,v] of [[0,0],[GOAL.line,0],[-GOAL.line,10]]){const [x,y]=bowl.world(u,v);assert.equal(roamZoneAt(game.data,x,y)?.name,'mineirao',`(${u}, ${v}) is in the Mineirão's zone`);}
 assert.ok(Math.abs(F.tunnel.floor-53.5)<.01&&F.tunnel.mouth>F.tunnel.floor+10,'the cutting runs from the floor to the tunnel');
}

// 0b. The ball's 32 panels: the 12 pentagons over an icosahedron's corners, the 20 hexagons over its faces' centres (the
// other dodecahedron, turned 90°, drew black blots instead of pentagons).
{
 const P=BALL_PANELS.map(v=>[v.x,v.y,v.z]),pent=P.slice(0,12),hex=P.slice(12),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 assert.equal(P.length,32);
 for(const h of hex){const near=pent.filter(q=>dot(q,h)>.79);assert.equal(near.length,3,'each hexagon sits among three pentagons');}
 for(const q of pent){const near=hex.filter(h=>dot(q,h)>.79);assert.equal(near.length,5,'each pentagon is ringed by five hexagons');}
}

// 1. At rest it stays at rest; dropped, it bounces and settles r over the grass, asleep.
{
 const {game,bowl,g,s}=setup();const z0=g.p[2];steps(game,2);
 assert.ok(g.asleep&&Math.abs(g.p[2]-z0)<1e-9,'the giant ball waits on the centre spot');
 g.reset(4);steps(game,6);const ev=game.takeEvents();
 assert.ok(ev.filter(e=>e.type==='bounce').length>=2,'it bounces a few times');
 assert.ok(g.asleep&&Math.abs(g.p[2]-(bowl.floorAt(g.p[0],g.p[1])+g.r))<.01,`and settles on the grass (${(g.p[2]-bowl.pitchZ).toFixed(3)} m)`);
 assert.ok(Math.abs(s.p[2]-(bowl.floorAt(s.p[0],s.p[1])+s.r))<1e-9,'the small ball on the centre circle');
}

// 1b. The small ball rolls and stops as on a match pitch (grass resists more the faster it goes): from 3 m/s 4 to 10 m
// (FIFA's ball-roll test), a short pass (6.6 m/s) 10 to 18 m, a hard one (18.4 m/s) 30 to 55 m, not to the goal from the
// centre circle.
{
 const {game,bowl,g,s}=setup();g.p[0]+=500;
 for(const [v0,lo,hi] of [[3,4,10],[6.6,10,18],[18.4,30,55]]){
  place(s,bowl,-40,-30,s.r);launch(s,bowl,v0,0);s.w[0]=-s.v[1]/s.r;s.w[1]=s.v[0]/s.r;const p0=[s.p[0],s.p[1]];let t=0;
  for(;t<30&&!s.asleep;t+=DT)game.step(null,DT);const d=Math.hypot(s.p[0]-p0[0],s.p[1]-p0[1]);
  assert.ok(s.asleep&&d>lo&&d<hi,`from ${v0} m/s it rolls ${d.toFixed(1)} m and stops (${t.toFixed(1)} s)`);
 }
}

// 2. The Opala (and the Fusca) at 54 km/h into the giant ball: it flies off faster than the car, a little up, and the car
// feels it (a quarter of its speed at most); the car keeps its own physics (in the zone, on its wheels).
for(const body of [OPALA_BODY,FUSCA_BODY]){
 const {game,bowl,car,g}=setup(body),h=Math.atan2(-bowl.U[1],-bowl.U[0]),[x,y]=bowl.world(25,0);
 car.relocate(x,y,NaN,h);car.vx=Math.cos(h)*15;car.vy=Math.sin(h)*15;
 const cmd={throttle:.25,brake:0,left:0,right:0,reverse:0,handbrake:0};let hit=null,before=0;
 for(let t=0;t<3&&!hit;t+=DT){before=Math.hypot(car.vx,car.vy);car.step(cmd,DT);game.step(car,DT);hit=game.takeEvents().find(e=>e.type==='hit')??null;}
 assert.ok(hit,`${body.name}: the car meets the ball`);
 const after=Math.hypot(car.vx,car.vy),ball=g.speed,lift=g.v[2];
 // (The Fusca's low nose meets it under its middle: more of it goes up.)
 const k=body===FUSCA_BODY?.85:1.05;assert.ok(ball>before*k&&ball<before*2,`${body.name}: the ball leaves about as fast as the car came or faster (${ball.toFixed(1)} vs ${before.toFixed(1)} m/s)`);
 assert.ok(after<before*.97&&after>before*.6,`${body.name}: the car loses some speed (${before.toFixed(1)} → ${after.toFixed(1)} m/s)`);
 assert.ok(lift>.5,`${body.name}: the bumper's edge lifts it (${lift.toFixed(2)} m/s up)`);
 assert.equal(car.roamZone?.name,'mineirao','the car is on the zone\'s ground');
 assert.ok(car.upright>.95,'and on its wheels');
 const [u]=local(bowl,g);steps(game,1.5,car,()=>car.step({throttle:0,brake:1,left:0,right:0,reverse:0,handbrake:0},DT));const [u2]=local(bowl,g);
 assert.ok(u2<u-10,`${body.name}: the ball rolls on ahead of it (${u.toFixed(1)} → ${u2.toFixed(1)} m)`);
}

// 3. Rolled at the wall round the floor it comes back off it; fast, it climbs the lower tier and rolls back down.
for(const speed of [6,12,20]){
 const {game,bowl,F,g}=setup();place(g,bowl,10,-35);launch(g,bowl,0,-speed);let minH=99,maxZ=0;
 steps(game,16,null,()=>{const w=bowl.where(g.p[0],g.p[1]);minH=Math.min(minH,w.h);maxZ=Math.max(maxZ,g.p[2]-F.pitch);});
 const w=bowl.where(g.p[0],g.p[1]);
 assert.equal(g.state,'play',`${speed} m/s: still in play`);
 assert.ok(w.h>g.r-.05,`${speed} m/s: back on the floor (${w.h.toFixed(1)} m in)`);
 assert.ok(minH>g.r-.6,`${speed} m/s: the wall stops it (closest ${minH.toFixed(2)} m)`);
 if(speed===20)assert.ok(maxZ>F.wall+g.r,`20 m/s: up the lower tier (${maxZ.toFixed(1)} m)`);
}

// 4. Lobbed into the stands it comes back down; onto the roof it is out ('no telhado') and back on the centre spot.
{
 const {game,bowl,F,g}=setup();place(g,bowl,-40,10);launch(g,bowl,-25,0,22);let minD=999;
 steps(game,18,null,()=>{minD=Math.min(minD,bowl.where(g.p[0],g.p[1]).d);});
 assert.ok(minD<40,`the lob reaches the upper tier (${minD.toFixed(1)} m from the roof's edge)`);
 assert.ok(g.state==='play'&&bowl.where(g.p[0],g.p[1]).h>0,'and rolls back onto the floor');
 game.takeEvents();place(g,bowl,-40,10);launch(g,bowl,-30,0,30);let out=null;
 steps(game,12,null,()=>{out??=game.events.find(e=>e.type==='out')??null;});
 assert.equal(out?.where,'no telhado','a ball resting on the roof is out');
 const [u,v]=local(bowl,g);assert.ok(Math.hypot(u,v)<.01&&g.state==='play','and back on the centre spot');
}

// 5. Down the drive-in cutting: out ('no túnel'), back to the centre; the membrane's slope sends a ball back in.
{
 const {game,bowl,F,g,s}=setup();place(s,bowl,0,40);launch(s,bowl,0,14);let out=null;
 steps(game,5,null,()=>{out??=game.events.find(e=>e.type==='out'&&e.ball==='bolinha')??null;});
 assert.equal(out?.where,'no túnel','the small ball down the tunnel is out');
 const {game:g2,bowl:b2,g:G2}=setup();
 // Dropped on the membrane, it runs off its inner edge back onto the floor.
 const fl=b2.where(...b2.world(-118+40,0));place(G2,b2,-(F.roof[0]-40),0,F.roofHeight+3);steps(g2,14);
 assert.equal(G2.state,'play','on the membrane: still in play');
 assert.ok(b2.where(G2.p[0],G2.p[1]).h>0,`it rolled off the membrane back onto the floor (${b2.where(G2.p[0],G2.p[1]).h.toFixed(1)} m in)`);
}

// 6. Goals: wholly over the line between the posts, under the bar. Orange's goal is blue's point and back to the
// centre after the celebration; over the bar, on the goal's roof, no goal.
{
 const {game,bowl,g,s}=setup();place(g,bowl,30,0);launch(g,bowl,10,0);let goal=null;
 steps(game,6.5,null,()=>{goal??=game.events.find(e=>e.type==='goal')??null;});
 assert.ok(goal,'the giant ball rolled into orange\'s goal');assert.equal(goal.team,0,'a point for blue');assert.deepEqual(game.score,[1,0]);
 const [u]=local(bowl,g);assert.ok(u>GOAL.line+g.r&&u<GOAL.line+GOAL.depth,`it stops in the net (${u.toFixed(1)} m)`);
 steps(game,4.5);const [u2,v2]=local(bowl,g);assert.ok(Math.hypot(u2,v2)<1e-6&&g.state==='play','back on the centre spot');
 game.takeEvents();place(s,bowl,-40,4);launch(s,bowl,-14,0,1.5);goal=null;steps(game,4,null,()=>{goal??=game.events.find(e=>e.type==='goal')??null;});
 assert.ok(goal&&goal.ball==='bolinha'&&goal.team===1,'the small ball in blue\'s goal: orange');assert.deepEqual(game.score,[1,1]);
 // Wide of the post: no goal.
 game.takeEvents();place(s,bowl,40,GOAL.width/2+2);launch(s,bowl,12,0);steps(game,4);assert.ok(!game.events.some(e=>e.type==='goal'),'wide of the post: no goal');
 // Dropped on the goal's roof net: it rolls off, no goal.
 game.takeEvents();place(s,bowl,GOAL.line+3,0,GOAL.height+1.5);steps(game,4);assert.ok(!game.events.some(e=>e.type==='goal'),'on the goal\'s roof: no goal');
 // A post sends a ball back.
 game.takeEvents();place(g,bowl,30,GOAL.width/2+GOAL.post);launch(g,bowl,8,0);steps(game,3);const [u3]=local(bowl,g);assert.ok(u3<GOAL.line-g.r+.2,`the post sends it back (${u3.toFixed(1)} m)`);
 game.reset();assert.deepEqual(game.score,[0,0],'a new race: 0 × 0');
}

// 7. A car at speed into the small ball sends it flying; the car hardly notices.
{
 const {game,bowl,car,s}=setup(),h=Math.atan2(bowl.V[1],bowl.V[0]),[x,y]=bowl.world(0,-5);
 car.relocate(x,y,NaN,h);car.vx=Math.cos(h)*12;car.vy=Math.sin(h)*12;const cmd={throttle:.2,brake:0,left:0,right:0,reverse:0,handbrake:0};let hit=null,before=0;
 for(let t=0;t<2&&!hit;t+=DT){before=Math.hypot(car.vx,car.vy);car.step(cmd,DT);game.step(car,DT);hit=game.takeEvents().find(e=>e.type==='hit'&&e.ball==='bolinha')??null;}
 assert.ok(hit&&s.speed>before*1.2,`the small ball flies off (${s.speed.toFixed(1)} m/s from a car at ${before.toFixed(1)})`);
 assert.ok(Math.hypot(car.vx,car.vy)>before-.05,'the car hardly notices');
}

// 8. On foot (free-walk.js): out of the car on the pitch, the small ball at his feet: E (held: harder) shoots it the
// camera's way, rising more the harder; R passes it along the grass; he dribbles it (walking, running, turning, it stays
// ahead of him, and standing he keeps it at his feet); the giant ball stops him, he pushes it at a walk, and it throws
// him when it comes fast.
{
 const {data,game,bowl,car,s,g}=setup(),[x,y]=bowl.world(-20,20),h=Math.atan2(bowl.V[1],bowl.V[0]);car.relocate(x,y,NaN,h);
 const scene=new THREE.Scene(),walk=new FreeWalk({scene,car,driver:{root:{visible:true}},hud:false,play:game});
 game.hero=()=>walk.active?walk.footInfo():null;game.onKnock=(from,side,text)=>walk.knock(from,side,text);
 const frames=(seconds,input={},extra={},each=null)=>{for(let t=0;t<seconds;t+=FRAME){for(let k=0;k<2;k++){const c={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};walk.drive(c);car.step(c,DT);game.step(car,DT);}walk.update(FRAME,null,{input:{throttle:0,brake:0,left:0,right:0,...input},...extra});each?.(t);}};
 assert.equal(walk.request(),true);frames(.3);assert.ok(walk.active,'he got out on the pitch');
 // Stand him at (u, v) facing +U (the camera's yaw).
 const U=Math.atan2(bowl.U[1],bowl.U[0]),hero=()=>bowl.local(walk.hero.position.x,-walk.hero.position.z);
 const stand=(u,v,yaw=U)=>{const [hx,hy]=bowl.world(u,v);walk.hero.position.set(hx,bowl.floorAt(hx,hy),-hy);walk.hero.rotation.y=yaw;walk.motion={x:hx,y:hy,vx:0,vy:0};walk.foot.floor=bowl.floorAt(hx,hy);walk.foot.lift=0;walk.foot.vz=0;walk.foot.yaw=yaw;walk.foot.crouch=false;game.control=null;};
 // A kick: the ball 45 cm ahead, the key pressed, held for `held` seconds, let go; the ball's speed and rise after it.
 const kickWith=(kind,held)=>{place(s,bowl,0,9.15,s.r);stand(-.11-.45,9.15);frames(.05);assert.ok(walk.canKick(),`${kind}: the ball is at his feet`);
  if(kind==='chute'){assert.equal(walk.actionLabel(),'chutar a bola','E says so');assert.equal(walk.action(),true,'E winds up');}else assert.equal(walk.handleKey('KeyR'),true,'R winds up');
  assert.ok(walk.charge?.kind===kind,'winding up');frames(held,{},{hold:{[kind]:true}});let top=0;const z0=s.p[2];
  frames(1.1,{},{hold:{}},()=>{top=Math.max(top,s.p[2]-z0);});const hit=walk.lastKick;walk.lastKick=null;return {speed:hit?.speed??0,v:[...s.v],top,hit};};
 const tap=kickWith('chute',.05),tapSpeed=tap.speed;
 const a=kickWith('chute',1.1),[du,dv]=[a.v[0]*bowl.U[0]+a.v[1]*bowl.U[1],a.v[0]*bowl.V[0]+a.v[1]*bowl.V[1]];
 assert.ok(du>Math.abs(dv)*4,'toward where the camera looks');
 const passTap=kickWith('passe',.05),passHard=kickWith('passe',1.1);
 console.log(`kicks: tap ${tapSpeed.toFixed(1)} m/s rising ${tap.top.toFixed(2)} m, held ${a.speed.toFixed(1)} rising ${a.top.toFixed(2)} m; pass tap ${passTap.speed.toFixed(1)}, held ${passHard.speed.toFixed(1)} (rising ${passHard.top.toFixed(2)} m)`);
 assert.ok(tap.hit&&a.hit&&passTap.hit&&passHard.hit,'every one met the ball');assert.ok(tapSpeed>9&&tapSpeed<13&&a.speed>23&&a.speed<29,'a tapped shot ~10 m/s, a held one ~26');
 assert.ok(a.top>tap.top+1,`held longer, the shot rises more (${tap.top.toFixed(2)} → ${a.top.toFixed(2)} m)`);
 assert.ok(passHard.top<.12&&passTap.top<.12,`a pass stays on the grass (${passTap.top.toFixed(2)}, ${passHard.top.toFixed(2)} m)`);
 assert.ok(passTap.speed>5&&passTap.speed<8&&passHard.speed>passTap.speed*2.5,'a pass held longer goes harder');
 // Away from any ball, E and R are no kick.
 stand(-30,-20);frames(.05);assert.equal(walk.canKick(),false,'no ball near: nothing to kick');assert.equal(walk.press('passe'),false);
 // Dribbling: the ball ahead of him, walking: it is his, and stays ahead of his feet.
 const ahead=()=>{const [hu,hv]=hero(),[bu,bv]=local(bowl,s),f=walk.foot.yaw,c=Math.cos(f-U),sn=Math.sin(f-U);return {along:(bu-hu)*c+(bv-hv)*sn,across:-(bu-hu)*sn+(bv-hv)*c};};
 const keep=(seconds,input,extra,label,min=.2,max=1.6)=>{let lo=99,hi=-99,wide=0;frames(seconds,input,extra,t=>{if(t<.5)return;const q=ahead();lo=Math.min(lo,q.along);hi=Math.max(hi,q.along);wide=Math.max(wide,Math.abs(q.across));});
  assert.ok(game.dribbling,`${label}: still his`);assert.ok(lo>min&&hi<max&&wide<.8,`${label}: ahead of his feet (${lo.toFixed(2)}…${hi.toFixed(2)} m, ${wide.toFixed(2)} m aside)`);};
 place(s,bowl,-30,-30,s.r);stand(-30.7,-30);const [h0]=hero();keep(4,{throttle:1},{},'walking');const [h1]=hero();assert.ok(h1-h0>9,`he walked on with it (${(h1-h0).toFixed(1)} m)`);
 assert.ok(game.touches>4,`with soft touches (${game.touches})`);
 keep(3,{throttle:1},{shift:true},'running',.3,1.7);const [h2]=hero();assert.ok(h2-h1>14,`running with it (${(h2-h1).toFixed(1)} m)`);
 // Turning: the camera's way 90° to the left; the ball comes round in front of him.
 walk.foot.yaw+=Math.PI/2;frames(1.5,{throttle:1});keep(2,{throttle:1},{},'after a turn');
 // Standing: at his feet, at rest.
 frames(2);const q=ahead();assert.ok(game.dribbling&&q.along>.2&&q.along<.8&&s.speed<.2,`standing, it rests at his feet (${q.along.toFixed(2)} m ahead, ${s.speed.toFixed(2)} m/s)`);
 // A shot from the dribble, wound up on the run: the ball leaves at speed and is loose.
 frames(.6,{throttle:1},{shift:true});walk.action();frames(.9,{throttle:1},{shift:true,hold:{chute:true}});frames(.6,{throttle:1},{shift:true,hold:{}});
 assert.ok(!game.dribbling&&walk.lastKick?.speed>22,`the shot on the run leaves it (${walk.lastKick?.speed.toFixed(1)} m/s)`);
 // A fast ball at him (he faces it) is not taken (it bounces off him); a slow one is.
 game.control=null;stand(0,-20,U+Math.PI);place(s,bowl,-5,-20,.11);launch(s,bowl,16,0);s.w[0]=-s.v[1]/s.r;s.w[1]=s.v[0]/s.r;frames(1.2);assert.equal(game.dribbling,false,'a ball at 16 m/s is not his');
 game.control=null;stand(0,-20,U+Math.PI);place(s,bowl,-4,-20,.11);launch(s,bowl,6,0);s.w[0]=-s.v[1]/s.r;s.w[1]=s.v[0]/s.r;frames(1.5);assert.equal(game.dribbling,true,'a ball at 6 m/s is taken');
 // The giant ball: he cannot walk into it, he pushes it.
 place(s,bowl,40,30,s.r);game.control=null;
 place(g,bowl,10,-25);stand(10-g.r-.6,-25);frames(4,{throttle:1});const [gu]=local(bowl,g),[hu2]=hero(),apart=Math.hypot(g.p[0]-walk.hero.position.x,g.p[1]+walk.hero.position.z);
 assert.ok(gu>12&&gu>hu2&&apart>g.r+.2,`pushed at a walk (ball ${gu.toFixed(1)} m, he at ${hu2.toFixed(1)} m, ${apart.toFixed(2)} m from its centre)`);
 assert.ok(g.speed<3.6,`no faster than he walks (${g.speed.toFixed(2)} m/s)`);
 // It comes at him at 7 m/s: he goes flying.
 stand(0,-40);place(g,bowl,-12,-40);launch(g,bowl,7,0);frames(2.5);
 assert.ok(walk.info().tumble!==null||walk.messageTime>0&&walk.message.includes('bola gigante'),'the giant ball knocks him over');
}
console.log('futebol no Mineirão: ok');
