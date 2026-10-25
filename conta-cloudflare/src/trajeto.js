// A lap's way on its circuit, for the online records (recordes.js): its ghost must have been driven where a car can be
// while the game counts the lap, at the lap distance the game gives each spot. ghostProblem has the car's own motion (its
// speed, its pushes, the track gained against the ground covered); this has the road (pistas.js, gerar_pistas.mjs):
// - every sample where a car can be: the lap's road and out to its barriers where they hold a car (else as far as the
//   absurd: runoffs, grass, the infield behind a rail's end), the pit lane, a branch road or a city's streets open to roam,
//   gone into and left by their gaps;
// - at its sample's lap distance: the spot of the lap followed from the sample before (its nearest station, walking on
//   from the last one, never looked for over the whole lap: where the lap passes over itself, the Minhocão, or round a
//   hairpin, the other stretch is another way), or the ghost's own spot when that is no farther (the game's window may
//   take a nearer stretch than the one followed);
// - no corner cut: off the asphalt, the track gained against the ground covered, as the game counts it (physics.js
//   trackLap: 18 m past 40 m), with room for samples 20 to 4 a second and our coarser stations;
// - not much of the lap driven far off the road (a lap moved aside).
// A lap the game counts must never be refused: every limit is wide (teste/testar_trajeto.mjs: the game's own driver
// round every circuit, its pit stops, Pampulha's branch, the pilots' laps). O(n): each sample walks a few stations on.
import {PISTAS} from './pistas.js';

const FIELDS=7;
const EDGE=1;                // m past the asphalt where an excursion begins, as the game's; it ends back on the asphalt
const CUT=38,CUT_FROM=40;    // m of track gained over the ground driven in one excursion, past CUT_FROM of it (the game: 18, 40)
const S_ROOM=10,S_OFF=.25;   // m: the ghost's lap distance against the spot's, and this share of the way off the asphalt more
const NEARER=3;              // m: the ghost's stretch may be farther than the one followed by this much (quantization)
const FAR=15,FAR_SHARE=.75,FAR_LEAST=1500; // m past the asphalt; the ground a lap may cover out there (its share of the lap)
const BAND=3,LANE_END=3,LANE_NEAR=60;      // m round a lane's paved band and past its ends; how near its lap distances it counts
const GAP_NEAR=30;           // m of lap distance round a zone's gap where a car may go in or come out
const WALK=40;               // stations a sample's nearest may walk from the last one's (200 m: a sample covers 17 at most)

// The tables, decoded once a circuit is asked for (zigzag varint steps in decimetres, gerar_pistas.mjs pack).
function steps(b64,n,k){
 const raw=atob(b64),out=new Float64Array(n*k),acc=new Float64Array(k);let p=0;
 for(let i=0;i<n*k;i++){let v=0,m=1,b;do{b=raw.charCodeAt(p++);v+=(b&127)*m;m*=128;}while(b&128);const c=i%k;acc[c]+=v%2?-(v+1)/2:v/2;out[i]=acc[c]/10;}
 return out;
}
const column=(a,k,c)=>{const n=a.length/k,o=new Float64Array(n);for(let i=0;i<n;i++)o[i]=a[i*k+c];return o;};
function lapTable(P){
 const {n}=P.line,a=steps(P.line.data,n,5),L=P.L,X=column(a,5,0),Y=column(a,5,1),TX=new Float64Array(n),TY=new Float64Array(n);
 for(let i=0;i<n;i++){const j=(i+1)%n,h=(i+n-1)%n,dx=X[j]-X[h],dy=Y[j]-Y[h],l=Math.hypot(dx,dy)||1;TX[i]=dx/l;TY[i]=dy/l;}
 return {L,step:L/n,n,X,Y,TX,TY,HW:column(a,5,2),BL:column(a,5,3),BR:column(a,5,4)};
}
function laneTable(P,L){
 const a=steps(P.data,P.n,6),M=column(a,6,2);
 let lo=Infinity,hi=-Infinity;for(const m of M){lo=Math.min(lo,m);hi=Math.max(hi,m);}
 return {kind:P.kind,n:P.n,X:column(a,6,0),Y:column(a,6,1),M,LO:column(a,6,3),HI:column(a,6,4),HW:column(a,6,5),from:lo-LANE_NEAR,span:hi-lo+2*LANE_NEAR,L};
}
function zoneTable(Z){const raw=atob(Z.bits),bits=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bits[i]=raw.charCodeAt(i);return {...Z,bits};}
const tables=new Map();
function table(circuit){
 if(!tables.has(circuit)){const P=Object.hasOwn(PISTAS,circuit)?PISTAS[circuit]:null;tables.set(circuit,P&&{L:P.L,slack:P.slack,lap:lapTable(P),lanes:P.lanes.map(l=>laneTable(l,P.L)),zones:P.zones.map(zoneTable),gaps:P.zones.flatMap(z=>z.gaps)});}
 return tables.get(circuit);
}

// The way from b to a along a lap of L, the short way round.
const along=(a,b,L)=>{let d=(a-b)%L;if(d>L/2)d-=L;else if(d<-L/2)d+=L;return d;};
// The nearest station walking from i (a local minimum of the distance), at most WALK stations on.
function walk(X,Y,n,x,y,i,loop){
 let d=(X[i]-x)**2+(Y[i]-y)**2;
 for(let g=0;g<WALK;g++){
  const j=i+1<n?i+1:loop?0:i,dj=(X[j]-x)**2+(Y[j]-y)**2;if(dj<d){i=j;d=dj;continue;}
  const h=i>0?i-1:loop?n-1:i,dh=(X[h]-x)**2+(Y[h]-y)**2;if(dh<d){i=h;d=dh;continue;}
  break;
 }
 return i;
}
// The spot of the lap at (x, y) by station i, as physics.js sample has it: the nearer of the segments either side by the
// foot of the perpendicular, the fraction along it from the stations' normal lines. off: the distance to the centre line;
// hw: the half width there; bound: how far from it a car can be on that side.
function onLap(T,x,y,i,o){
 const {X,Y,n}=T,h=i>0?i-1:n-1,j=i+1<n?i+1:0;
 let dx=X[i]-X[h],dy=Y[i]-Y[h],u=Math.max(0,Math.min(1,((x-X[h])*dx+(y-Y[h])*dy)/(dx*dx+dy*dy||1)));
 let a=h,ex=x-X[h]-u*dx,ey=y-Y[h]-u*dy,best=ex*ex+ey*ey;
 dx=X[j]-X[i];dy=Y[j]-Y[i];u=Math.max(0,Math.min(1,((x-X[i])*dx+(y-Y[i])*dy)/(dx*dx+dy*dy||1)));
 const fx=x-X[i]-u*dx,fy=y-Y[i]-u*dy;if(fx*fx+fy*fy<best){a=i;ex=fx;ey=fy;best=fx*fx+fy*fy;}
 const b=a+1<n?a+1:0,fa=(x-X[a])*T.TX[a]+(y-Y[a])*T.TY[a],fb=(x-X[b])*T.TX[b]+(y-Y[b])*T.TY[b],w=fa<=0?0:fb>=0?1:fa/(fa-fb);
 const tx=T.TX[a]+(T.TX[b]-T.TX[a])*w,ty=T.TY[a]+(T.TY[b]-T.TY[a])*w,left=ey*tx-ex*ty>=0;
 o.s=(a+w)*T.step%T.L;o.off=Math.sqrt(best);o.hw=T.HW[a]+(T.HW[b]-T.HW[a])*w;
 o.bound=left?T.BL[a]+(T.BL[b]-T.BL[a])*w:T.BR[a]+(T.BR[b]-T.BR[a])*w;
 return o;
}
// The spot of a lane (the pit lane, a branch road) at (x, y) by station k: within its paved band (band), on its asphalt
// (road), and the lap distance it stands for (m).
function onLane(G,x,y,k,o){
 const {X,Y,n}=G;let best=Infinity,a=0,u=0,ex=0,ey=0,past=0;
 for(let p=Math.max(0,k-1);p<=Math.min(n-2,k);p++){
  const dx=X[p+1]-X[p],dy=Y[p+1]-Y[p],l2=dx*dx+dy*dy||1,raw=((x-X[p])*dx+(y-Y[p])*dy)/l2,t=Math.max(0,Math.min(1,raw)),fx=x-X[p]-t*dx,fy=y-Y[p]-t*dy,d2=fx*fx+fy*fy;
  if(d2<best){best=d2;a=p;u=t;ex=fx;ey=fy;past=(p===0&&raw<0?-raw:p===n-2&&raw>1?raw-1:0)*Math.sqrt(l2);}
 }
 const b=a+1,dx=X[b]-X[a],dy=Y[b]-Y[a],l=Math.hypot(dx,dy)||1,d=(ey*dx-ex*dy)/l,mix=A=>A[a]+(A[b]-A[a])*u;
 o.k=k;o.band=past<=LANE_END&&d>=mix(G.LO)-BAND&&d<=mix(G.HI)+BAND;o.road=o.band&&Math.abs(d)<=mix(G.HW)+EDGE;o.m=((mix(G.M)%G.L)+G.L)%G.L;
 return o;
}
// Whether a lap distance is within LANE_NEAR of the stretch of the lap a lane stands for.
const nearLane=(G,s)=>((s-G.from)%G.L+G.L)%G.L<=G.span;
function inZone(T,x,y){
 for(const Z of T.zones){const i=Math.floor((x-Z.x0)/Z.cell),j=Math.floor((y-Z.y0)/Z.cell);if(i>=0&&j>=0&&i<Z.nx&&j<Z.ny){const k=j*Z.nx+i;if(Z.bits[k>>3]&128>>(k&7))return true;}}
 return false;
}
// Whether a lap distance is by one of the zones' gaps in the lap's walls.
const byGap=(T,s)=>T.gaps.some(([a,b])=>along(s,a,T.L)>=-GAP_NEAR&&along(s,b,T.L)<=GAP_NEAR);

// The lap followed sample by sample: the first problem, or null. st (the checks): the worst of each measure.
function follow(ghost,T,st){
 const v=ghost.values,n=ghost.n,L=T.L,P=T.lap,o={},q={},lanes=T.lanes,at=lanes.map(()=>-1),on=lanes.map(()=>({band:false,road:false}));
 const station=s=>Math.round(s/P.step)%P.n;
 let i=walk(P.X,P.Y,P.n,v[0],v[1],station(((v[6]%L)+L)%L),true),ref=null,px=0,py=0,cut=null,far=0,roaming=false,roadS=null;
 for(let k=0;k<n;k++){
  const x=v[k*FIELDS],y=v[k*FIELDS+1],sg=((v[k*FIELDS+6]%L)+L)%L;
  i=walk(P.X,P.Y,P.n,x,y,i,true);onLap(P,x,y,i,o);
  // The lanes near that stretch (by the spot followed or the ghost's own), each followed from its nearest station.
  let band=false,road=false;
  for(let g=0;g<lanes.length;g++){
   const G=lanes[g];if(!nearLane(G,o.s)&&!nearLane(G,sg)){at[g]=-1;on[g].band=on[g].road=false;continue;}
   if(at[g]<0){let b=Infinity;for(let j=0;j<G.n;j++){const d=(G.X[j]-x)**2+(G.Y[j]-y)**2;if(d<b){b=d;at[g]=j;}}}
   at[g]=walk(G.X,G.Y,G.n,x,y,at[g],false);onLane(G,x,y,at[g],on[g]);band||=on[g].band;road||=on[g].road;
  }
  // Off the lap's reach and every lane's band: the ghost's own stretch (the game's window may have taken another), else
  // a city's zone open to roam, else no road a car can be on.
  let zone=false;
  if(o.off>o.bound&&!band){
   const j=walk(P.X,P.Y,P.n,x,y,station(sg),true);onLap(P,x,y,j,q);
   if(q.off<=q.bound){i=j;Object.assign(o,q);}
   else if(inZone(T,x,y))zone=true;
   else{if(st)st.off={k,x,y,off:o.off,bound:o.bound};return 'o carro saiu do traçado da pista';}
  }
  // The lap distance: the spot's or a lane's, whichever the ghost's is nearer (its share of the room), or the ghost's own
  // stretch when no farther than the one followed.
  let s=null;
  if(!zone){
   const room=S_ROOM+S_OFF*Math.max(0,o.off-o.hw);let miss=Math.abs(along(sg,o.s,L)),share=miss/room,pick=o.s;
   for(let g=0;g<lanes.length;g++)if(on[g].band){const m=Math.abs(along(sg,on[g].m,L));if(m/S_ROOM<share){share=m/S_ROOM;miss=m;pick=on[g].m;}}
   if(share<=1)s=pick;
   else{
    const j=walk(P.X,P.Y,P.n,x,y,station(sg),true);onLap(P,x,y,j,q);const m=Math.abs(along(sg,q.s,L)),r=S_ROOM+S_OFF*Math.max(0,q.off-q.hw);
    if(q.off<=q.bound&&q.off<=o.off+NEARER&&m<=r){i=j;Object.assign(o,q);s=q.s;miss=m;share=m/r;if(st)st.snaps.push({k,from:pick,to:q.s,off:q.off});}
    else{if(st)st.miss={k,sg,s:pick,off:o.off};return 'a distância na pista não bate com onde o carro estava';}
   }
   if(st){st.sMiss=Math.max(st.sMiss,miss);st.sShare=Math.max(st.sShare,share);}
  }
  // Into a zone and out of it by a gap only (its ground lies right behind the walls: a way through one is no way in): a
  // stretch only the zone holds begins where the car was last on the road's side of every barrier, and ends back there,
  // each by a gap.
  if(zone){if(!roaming){if(roadS===null||!byGap(T,roadS)){if(st)st.off={k,x,y,through:roadS};return 'o carro saiu do traçado da pista';}roaming=true;}}
  else if(band||o.off<=o.bound-T.slack){if(roaming&&!byGap(T,s)){if(st)st.off={k,x,y,back:s};return 'o carro saiu do traçado da pista';}roaming=false;roadS=s;}
  if(st){if(zone)st.zone++;else if(band)st.lane++;else{st.edge=Math.max(st.edge,o.off-o.hw);st.reach=Math.max(st.reach,o.off/o.bound);}}
  // Excursions as the game counts them (trackLap): from the step out past EDGE (off every lane's asphalt) to the step back,
  // the track gained (the spot's lap distance; in a zone the last before it) against the ground driven, judged back or at
  // the line. Back only on the asphalt itself: our stations are coarser than the game's, and part of its excursion (one
  // ended early, the car back by another stretch's edge) may show a cut its whole does not.
  if(ref===null)ref=s??sg;
  const moved=k?Math.hypot(x-px,y-py):0,now=s??ref;
  if(!cut&&(zone||!road&&o.off>o.hw+EDGE))cut={gained:0,driven:0};
  if(cut){
   cut.gained+=along(now,ref,L);cut.driven+=moved;
   if(!zone&&(road||o.off<=o.hw)||k===n-1){
    if(st&&cut.gained>CUT_FROM)st.cut=Math.max(st.cut,cut.gained-cut.driven);
    if(cut.gained>CUT_FROM&&cut.gained-cut.driven>CUT)return 'o carro cortou caminho por fora da pista';
    cut=null;
   }
  }
  // Far off the road (and in no lane, no zone).
  if(!zone&&!band&&o.off-o.hw>FAR&&!inZone(T,x,y))far+=moved;
  ref=now;px=x;py=y;
 }
 if(st)st.far=far;
 if(far>Math.max(FAR_LEAST,FAR_SHARE*L))return 'o carro andou longe da pista em boa parte da volta';
 return null;
}

// Why this ghost (recordes.js readGhost: {time, rate, n, values}) cannot have been driven on that circuit's road, or null
// when it can. A circuit with no table yet (pistas.js not written again since it came) is not checked.
export function trackProblem(ghost,circuit){
 if(!ghost?.values||!(ghost.n>=2))return 'o fantasma da volta não pôde ser lido';
 const T=table(circuit);return T?follow(ghost,T,null):null;
}
// The same lap's worst against each limit (the checks): the first problem (or null) and, for the samples up to it, the
// lap distance's worst miss (m, and its share of the room), the farthest past the asphalt and nearest the reach (share),
// the worst cut (m of track gained past the ground driven, in an excursion past CUT_FROM), the ground covered far off,
// the samples in a lane's band and in a zone, and where the ghost's own stretch was taken (snaps).
export function trackMargins(ghost,circuit){
 if(!ghost?.values)return {problem:trackProblem(ghost,circuit)};
 const T=table(circuit),st={sMiss:0,sShare:0,edge:-Infinity,reach:0,cut:-Infinity,far:0,lane:0,zone:0,snaps:[]};
 st.problem=T?follow(ghost,T,st):null;st.limits={sRoom:S_ROOM,cut:CUT,far:Math.max(FAR_LEAST,FAR_SHARE*(T?.L??0))};return st;
}
