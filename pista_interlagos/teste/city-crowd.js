import {guardrailClearance,onDeck,addRoamSolids} from './physics.js';
import {sceneryBands,bandClearance} from './track-clearance.js';
import {billboardSpots} from './track-surface.js';
import {marshalSpots,towerSpots} from './trackside.js';

// People watching the race from the city's own sidewalks (Floripa, data.scenery.city): standing rows behind the race
// walls' fences, as the streets of a city closed for a weekend fill up. Rows for landscape.js createCrowd (its fans, one
// draw call with the grandstands'), given as steps {corners, face, stand}: standing fans on the pavement, facing the lap.
// More of them where it is worth watching (bends, the closed side streets where they come to the barrier), none on the
// bridges, by the pits and stands, in front of the boards, marshal posts and TV towers, or where there is no sidewalk.
const WALL_DEEP=.75,FENCE_GAP=.55,ROW=1.1;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
export function citySpectators(data,{map,ground,lean=false,mobile=false}){
 const a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,rand=random(1517),bands=sceneryBands(data).filter(b=>b.name!=='pista');
 const closures=data.scenery.city.closures??[];
 // A side street opened to roam (meta.roam's gaps) keeps its mouth clear; in a zone the fans are solid for the car
 // driving about there (a post where each one stands: physics.js RoamWorld).
 const gaps=(data.meta.roam?.zones??[]).flatMap(z=>z.gaps),inGap=(s,side)=>gaps.some(g=>g.side===side&&s>g.s0-8&&s<g.s1+8);
 // What must stay in view: the boards (up to 14 m wide), marshals and TV towers behind the walls.
 const posts=[...billboardSpots(data).map(q=>({x:q.x,y:q.y,r:9})),...marshalSpots(data).map(q=>({x:q.x,y:q.y,r:5})),...towerSpots(data).map(q=>({x:q.x,y:q.y,r:6}))];
 const turn=i=>{const p=a[(i-5+n)%n],q=a[(i+5)%n];let d=Math.atan2(q[8],q[7])-Math.atan2(p[8],p[7]);d=(d+Math.PI*3)%(Math.PI*2)-Math.PI;return Math.abs(d)/20;};
 const steps=[],share=lean?.5:mobile?.7:1;
 for(const side of [-1,1]){
  let run=null;
  const close=()=>{if(run&&run.length>=3)steps.push(...rows(run,side));run=null;};
  for(let i=0;i<n;i++){
   const p=a[i],s=p[0];
   // The pavement behind the wall: from the fence back to where the sidewalk (or square) ends.
   const back=p[4]/2+guardrailClearance(data,s,side)+WALL_DEEP+FENCE_GAP,ox=p[9]*side,oy=p[10]*side,x=p[1]+ox*(back+ROW/2),y=p[2]+oy*(back+ROW/2);
   const d=map.at(x,y),paved=Math.min(d.sidewalk,d.plaza)<-.2&&d.road>.3;
   const nearClosure=closures.some(c=>Math.hypot(c.x-x,c.y-y)<22);
   // How busy this stretch is: a slow noise along the lap, raised in bends and at the closed side streets.
   const busy=.5+.5*Math.sin(s*.013+side*1.7)*Math.sin(s*.0047+2.1)+Math.min(1,turn(i)*90)*.5+(nearClosure?.6:0);
   const ok=paved&&!inGap(s,side)&&!onDeck(data,s)&&busy>.62&&bandClearance(bands,x,y).distance>3&&!posts.some(q=>Math.hypot(q.x-x,q.y-y)<q.r)&&ground(x,y)!==null;
   if(ok)(run??=[]).push({p,x,y,ox,oy,back,depth:Math.min(-Math.min(d.sidewalk,d.plaza),3.2)});else close();
   if(run&&run.length>=9)close();
  }
  close();
 }
 // A share of the rows only on the lighter builds.
 const kept=steps.filter(()=>rand()<share);
 if(gaps.length)addRoamSolids(data,kept.flatMap(step=>step.solids??[]));
 return kept;
 // Up to two rows deep where the sidewalk allows; each row a quad standing on the ground, facing the lap.
 function rows(run,side){
  const out=[],deep=Math.min(...run.map(r=>r.depth))>2.4&&rand()<.55?2:1;
  for(let k=0;k<deep;k++){
   const at=(r,extra)=>{const d=r.back+.25+k*ROW+extra,x=r.p[1]+r.ox*d,y=r.p[2]+r.oy*d;return {x,y:ground(x,y)??r.p[3],z:-y};};
   const f=run[0],l=run.at(-1),corners=[at(f,0),at(l,0),at(l,ROW*.6),at(f,ROW*.6)];
   out.push({corners,face:[-run[0].ox,run[0].oy],stand:true,ground,solids:gaps.length?run.map(r=>{const d=r.back+.25+k*ROW+ROW*.3;return {x:r.p[1]+r.ox*d,y:r.p[2]+r.oy*d,r:.75};}):null});
  }
  return out;
 }
}
