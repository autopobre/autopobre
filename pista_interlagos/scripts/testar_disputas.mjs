// Battles between the rivals above Fácil (Central #21, race-field.js): the lane beside the centre line where the road only
// widens (Interlagos' pit exit) no longer reads as a corner, two cars side by side onto the reta oposta stay so; a move is
// weighed against the man ahead (skill), set up in the tow and made at the end of the straight; the man passed comes back
// at the one who did it; a title on the line in the last rounds makes a rival give it all.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar} from '../teste/physics.js';
import {RaceField,racingLine,lapTravel,commitChance,defendChance} from '../teste/race-field.js';
import {Championship,titleStakes} from '../teste/championship.js';
import {RIVAL_ROSTER} from '../teste/race-roster.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
const a=data.samples,L=data.meta.reconstructed_xy_m,line=racingLine(data),at=s=>a.findIndex(p=>p[0]>=s);
const checks={},check=(name,value,detail='')=>{checks[name]=!!value;assert(value,`${name} ${detail}`);};

// The pit exit's merge widens the road some 4 m and the centre line swings across it (an S of about 175 m); one edge runs
// straight there, so a lane's bend is the straight edge's. A real corner keeps the centre's.
const merge=at(852);
check('pit_exit_is_no_corner',Math.abs(line.centre[merge])>.004&&Math.abs(line.laneCentre[merge])<.5*Math.abs(line.centre[merge]),`centre ${line.centre[merge]} lane ${line.laneCentre[merge]}`);
check('real_corners_keep_their_bend',line.corners.every(c=>line.laneCentre[c.apex]===line.centre[c.apex]));

// Two Médio rivals side by side out of the Sol, Kleber inside: past the pit exit neither brakes to tuck in (#21.5).
const blank=()=>{const player=new TestCar(data);player.resetGrid();player.x=player.y=1e4;player.surface=player.sample(player.x,player.y);return player;};
const place=(r,s,d,v)=>{const i=at(s),p=a[i],c=r.car;c.reset(i);c.x=p[1]+p[9]*d;c.y=p[2]+p[10]*d;c.heading=Math.atan2(p[8],p[7]);c.vx=v*Math.cos(c.heading);c.vy=v*Math.sin(c.heading);c.surface=c.sample(c.x,c.y);c.index=c.surface.i;
 Object.assign(r,{lastS:c.surface.s,progress:c.surface.s,lane:d,blend:0,blendTarget:0,mode:'line',reaction:0,merge:0,lap:-1,cooldown:0,stuck:0});};
{const player=blank(),f=new RaceField(data,{seed:3,level:'medio'});f.reset(0);const K=f.rivals.find(r=>r.entry.number==='70'),M=f.rivals.find(r=>r.entry.number==='9');f.rivals=[K,M];
 place(K,800,3.4,40);place(M,801.5,.9,40);K.blend=M.blend=1;let brake=0,beside=0;
 for(let k=0;k<120*6;k++){f.step(player,1/120,0);const s=K.car.surface.s;if(s>830&&s<1000){brake=Math.max(brake,K.brakePedal);if(Math.abs(lapTravel(s,M.car.surface.s,L))<5)beside++;}}
 check('side_by_side_onto_the_reta_oposta',brake<.05&&beside>120*2,`brake ${brake.toFixed(2)} beside ${(beside/120).toFixed(1)} s`);}

// The move weighed: a stronger attacker goes more often, a weaker one now and then; a cover against another rival weighs
// skill too.
check('commit_by_skill',commitChance(10,7,.6)>commitChance(7,7,.6)&&commitChance(7,7,.6)>commitChance(5,10,.6)&&commitChance(5,10,0)>=.12&&commitChance(10,5,1,.5)<=.95);
check('cover_by_skill',defendChance(.5,10,7)>.5&&defendChance(.5,7,10)<.5);

// Duels out of the Sol, 8 m behind: Kleber (10) gets by Maragno (7) most times, Aloísio (5) hardly ever by Koyzinho (10).
// The man passed comes back at the one who did it.
function duels(an,bn,trials){
 let passes=0,revenge=0;
 for(let k=0;k<trials;k++){
  const player=blank(),f=new RaceField(data,{seed:1000+k,level:'medio'});f.reset(0);const A=f.rivals.find(r=>r.entry.number===an),B=f.rivals.find(r=>r.entry.number===bn);f.rivals=[B,A];
  place(B,830,line.off[at(830)],42);place(A,822,line.off[at(822)],42);
  for(let t=0;t<120*25&&!(A.car.surface.s>1520&&B.car.surface.s>1520);t++)f.step(player,1/120,0);
  if(lapTravel(B.car.surface.s,A.car.surface.s,L)>3){passes++;if(B.revenge?.on===A.car)revenge++;}
 }
 return {passes,revenge};
}
const strong=duels('70','9',8),weak=duels('312','2',8);
check('the_stronger_gets_by',strong.passes>=5,JSON.stringify(strong));
check('the_weaker_hardly_ever',weak.passes<=1,JSON.stringify(weak));
check('the_man_passed_wants_it_back',strong.revenge===strong.passes);

// The title on the line: in the season's last three rounds the rivals who can still be champion, all of it in the last
// (Stevan's last round: Koyzinho a few points behind the player); none out of reach, nothing earlier.
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const season=new Championship(memory(),'historia');season.start('Stevan',8);
const rival=n=>RIVAL_ROSTER.find(e=>e.number===n);
for(let k=0;k<season.total-1;k++){
 // The player wins the odd rounds and Koyzinho the even ones; Kleber always third, the others behind.
 const first=k%2?'2':'99',second=k%2?'99':'2',order=[first,second,'70',...RIVAL_ROSTER.map(e=>e.number).filter(n=>!['2','70'].includes(n))];
 season.record(k,season.nextCircuit,order.map(n=>({number:n,name:n==='99'?'Stevan':rival(n).name,player:n==='99',finished:true,totalTime:600,bestLap:100})),'Stevan');
}
const last=titleStakes(season,season.total-1);
check('title_stakes_in_the_last_round',last['2']>.8&&!('70' in last)&&!('312' in last),JSON.stringify(last));
check('no_stakes_early',titleStakes(season,0)===null&&titleStakes(new Championship(memory(),'historia'),7)===null);

// Giving it all: Koyzinho alone at Médio laps faster on average with the title at stake, his best as it was.
function lone(stake){
 let sum=0,count=0;
 for(const seed of [1,2]){
  const player=blank(),f=new RaceField(data,{seed,level:'medio'});f.stakes=stake?{'2':1}:null;f.reset(player.surface.s,{grid:true});player.x=player.y=1e4;player.surface=player.sample(player.x,player.y);
  const r=f.rivals.find(q=>q.entry.number==='2');f.rivals=[r];let steps=0,last=null;const times=[];
  while(!r.finished&&steps<120*150*5){f.step(player,1/120,5);steps++;if(r.car.lastLap!==last){last=r.car.lastLap;if(last)times.push(last);}}
  for(const t of times.slice(1)){sum+=t;count++;}
 }
 return sum/count;
}
const calm=lone(false),pushed=lone(true);
check('title_makes_him_give_it_all',pushed<calm-.2,`${calm.toFixed(2)} -> ${pushed.toFixed(2)} s`);
const report={passed:true,checks,strong,weak,last,laps:{calm:+calm.toFixed(2),pushed:+pushed.toFixed(2)}};
fs.writeFileSync(new URL('../dados/validacao_disputas.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,1));
