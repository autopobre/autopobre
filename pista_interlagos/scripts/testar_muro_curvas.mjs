// Muros e guardrails nas curvas: o carro encosta onde a barreira está desenhada, sem parede invisível antes dela
// (pedido da equipe: nas curvas fechadas do Minhocão e de Floripa o carro batia antes do muro). Em cada circuito com
// barreira, nas estações das curvas (raio até 80 m), o Opala e o Fusca, alinhados à pista e virados até 30°, são
// empurrados de lado até a barreira em passos de 1 cm até TestCar.step acusar o toque; então o desenho do carro
// (a caixa da carroceria) é medido contra a linha da barreira (street-walls.js barrierLines): chega até o alcance da
// física (o pé do muro de concreto: WALL_REACH; a linha do guardrail: RAIL_REACH, antes dela) com folga de até 8 cm
// (entre duas estações o desenho e a física diferem uns centímetros onde a pista alarga depressa; a parede invisível
// era de 50 a 80 cm),
// e passa dele no máximo PAST: no lado de dentro dos grampos a física mede a distância até as cordas entre as
// estações da pista e a linha desenhada passa pelos vértices, até 10 cm mais longe (no muro a face se inclina 18 cm
// para trás na altura da soleira: nada aparece). Ficam fora as dobras: no lado de dentro de um grampo mais fechado
// que a distância da barreira (a Junção de Interlagos, o grampo de Piracicaba) o desenho corta a dobra num canto
// (street-walls.js untangle) e a pista não tem uma linha só para a física.
// Uso: node scripts/testar_muro_curvas.mjs [circuito...]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestCar,OPALA_BODY,FUSCA_BODY,guardrailPresent,guardrailClearance,WALL_REACH,RAIL_REACH} from '../teste/physics.js';
import {barrierLines} from '../teste/street-walls.js';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';
const load=id=>{const d=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));d.meta.id=id;return d;};
const input={left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0},SHORT=.08,PAST=.12,YAWS=[0,15,30,-15,-30].map(a=>a*Math.PI/180),report={};
for(const id of process.argv.slice(2).length?process.argv.slice(2):Object.keys(CIRCUITS)){
 const data=load(id),a=data.samples,N=a.length,L=data.meta.reconstructed_xy_m,lines=barrierLines(data),reach=data.meta.barrier==='street'?WALL_REACH:RAIL_REACH;
 if(!lines[-1].length&&!lines[1].length){report[id]='sem barreiras';continue;}
 const head=i=>Math.atan2(a[(i+N)%N][8],a[(i+N)%N][7]),out={stations:0,folds:0,shortMax:0,pastMax:-Infinity,worst:null};
 const bend=a.map((p,i)=>{let j=i,k=i;while(a[(j-1+N)%N][0]>p[0]-6&&j>i-20)j--;while(a[(k+1)%N][0]<p[0]+6&&k<i+20)k++;
  let turn=head(k)-head(j);turn=Math.atan2(Math.sin(turn),Math.cos(turn));return {turn,radius:((a[(k+N)%N][0]-a[(j+N)%N][0])+L)%L/Math.max(1e-6,Math.abs(turn))};});
 const foldAt={'-1':[],'1':[]};a.forEach((p,i)=>{for(const side of [-1,1])if(Math.sign(bend[i].turn)===side&&bend[i].radius<p[4]/2+guardrailClearance(data,p[0],side)+3)foldAt[side].push(p[0]);});
 const nearFold=(s,side)=>foldAt[side].some(f=>Math.min(Math.abs(f-s),L-Math.abs(f-s))<10);
 for(const body of [OPALA_BODY,FUSCA_BODY]){
  const car=new TestCar(data).setBody(body);
  for(let i=0;i<N;i+=2){
   const p=a[i],s=p[0];
   // Turn over 12 m: only the bends (the straights never had the trouble and the test stays short).
   if(bend[i].radius>80)continue;
   for(const side of [-1,1]){
    if(!guardrailPresent(data,s,side))continue;
    const line=lines[side].find(l=>s>=l.from+3&&s<=l.to-3)?.stations;if(!line)continue;
    const t=Math.hypot(p[7],p[8]),ux=p[7]/t,uy=p[8]/t,lx=-uy*side,ly=ux*side,limit=p[4]/2+guardrailClearance(data,s,side);
    if(nearFold(s,side)){out.folds++;continue;}
    for(const yaw of YAWS){
     const heading=Math.atan2(uy,ux)+side*yaw,fx=Math.cos(heading),fy=Math.sin(heading);
     // Sideways toward the barrier from 3 m inside its line: coarse, then centimetre steps.
     const touches=d=>{car.relocate(p[1]+lx*d,p[2]+ly*d,p[3],heading);car.vx=lx*.4;car.vy=ly*.4;car.yaw=0;car.step(input,1/120);return car.wallImpactSpeed>0;};
     let d=limit-3;while(d<limit+1&&!touches(d+.1))d+=.1;
     if(d>=limit+1)continue;
     while(!touches(d))d+=.01;
     // The body's box there against the barrier's line: how far past it (outward +) its furthest point is.
     const cx=p[1]+lx*d+fx*body.wallAhead,cy=p[2]+ly*d+fy*body.wallAhead;let past=-Infinity;
     for(let u=-1;u<=1.0001;u+=.05)for(const w of [-1,1])for(const [qx,qy] of [[cx+fx*u*body.halfLength-fy*w*body.halfWidth,cy+fy*u*body.halfLength+fx*w*body.halfWidth],[cx+fx*w*body.halfLength-fy*u*body.halfWidth,cy+fy*w*body.halfLength+fx*u*body.halfWidth]]){
      let best=Infinity,signed=0;
      for(let m=1;m<line.length;m++){
       const A=line[m-1],B=line[m];if(Math.abs(A.x-qx)+Math.abs(A.y-qy)>30)continue;
       const ex=B.x-A.x,ey=B.y-A.y,f=Math.max(0,Math.min(1,((qx-A.x)*ex+(qy-A.y)*ey)/(ex*ex+ey*ey||1))),dx=qx-A.x-f*ex,dy=qy-A.y-f*ey,dist=Math.hypot(dx,dy);
       if(dist<best){best=dist;signed=dx*(A.ox+f*(B.ox-A.ox))+dy*(A.oy+f*(B.oy-A.oy));}
      }
      past=Math.max(past,signed);
     }
     out.stations++;
     const short=reach-past;
     if(short>out.shortMax){out.shortMax=+short.toFixed(3);out.worst={body:body.name,s:+s.toFixed(1),side,yaw:Math.round(yaw*180/Math.PI),past:+past.toFixed(3)};}
     out.pastMax=Math.max(out.pastMax,past);
     assert(past>=reach-SHORT,`${id} ${body.name} s=${s.toFixed(1)} lado ${side} ${Math.round(yaw*180/Math.PI)}°: parede invisível, o carro para ${(reach-past).toFixed(2)} m antes da barreira`);
     assert(past<=reach+PAST,`${id} ${body.name} s=${s.toFixed(1)} lado ${side} ${Math.round(yaw*180/Math.PI)}°: o carro entra ${(past-reach).toFixed(2)} m na barreira`);
    }
   }
  }
 }
 out.pastMax=+out.pastMax.toFixed(3);report[id]=out;
}
console.log(JSON.stringify({passed:true,report},null,1));
