// The lap of a circuit as the copilot's tools read it (propor_chamadas_curvas.mjs, testar_copiloto.mjs): the track file
// (circuits.js data; Curvelo's built by curvelo-data.js), its HUD sections (meta.sections, else main.js names, the
// HUD's place line) and how the centre line turns along it.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';

const here=dirname(fileURLToPath(import.meta.url)),teste=join(here,'..','teste');
let mainNames=null;
function namesTable(){
 if(mainNames)return mainNames;
 const m=readFileSync(join(teste,'main.js'),'utf8').match(/const names=(\[\[.*?\]\]);/);if(!m)throw new Error('main.js names table');
 return mainNames=JSON.parse(m[1].replace(/'/g,'"'));
}

export function loadLap(id){
 const circuit=CIRCUITS[id];if(!circuit)throw new Error(`${id} is not a circuit`);
 const data=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(join(here,'..','dados',circuit.data??'pista.json'),'utf8'));
 const L=data.meta.reconstructed_xy_m,sections=data.meta.sections??namesTable();
 const cols=data.columns,ix=cols.indexOf(cols.includes('x_east_m')?'x_east_m':'x'),iy=cols.indexOf(cols.includes('y_north_m')?'y_north_m':'y'),pts=data.samples;
 const wrap=s=>((s%L)+L)%L;
 const at=s=>{s=wrap(s);let i=pts.findIndex(p=>p[0]>s);if(i<1)i=i<0?pts.length-1:1;const a=pts[i-1],b=pts[i],f=Math.min(1,Math.max(0,(s-a[0])/((b[0]-a[0])||1)));return [a[ix]+(b[ix]-a[ix])*f,a[iy]+(b[iy]-a[iy])*f];};
 const heading=s=>{const [x0,y0]=at(s-2),[x1,y1]=at(s+2);return Math.atan2(y1-y0,x1-x0);};
 // Degrees turned from a to b (left positive), and their size.
 const signed=(a,b)=>{let sum=0;for(let s=a;s<b;s+=4){let d=heading(s+4)-heading(s);d=Math.atan2(Math.sin(d),Math.cos(d));sum+=d;}return sum*180/Math.PI;};
 const turn=(a,b)=>Math.abs(signed(a,b));
 // The bend's end past s: the first 10 m turning less than 2.5° its way.
 const bendEnd=s=>{const way=Math.sign(signed(s-10,s+10));let e=s;while(signed(e,e+10)*way>=2.5&&e<s+400)e+=10;return e;};
 const gap=(a,b)=>{const d=Math.abs(a-b)%L;return Math.min(d,L-d);};
 // The bends of the lap: from 2.5° in 10 m one way, on while it keeps turning that way 1.5° in 10 m (a long sweep in
 // one piece), at least 15° in all; mid where half of it is turned.
 function bends(){
  const per=[];for(let s=0;s<L;s+=10)per.push([s,signed(s,s+10)]);
  const out=[];let cur=null;
  const close=()=>{if(cur&&Math.abs(cur.total)>=15){let acc=0;for(const [s,t] of cur.items){acc+=t;if(Math.abs(acc)>=Math.abs(cur.total)/2){cur.mid=s+5;break;}}out.push({start:cur.start,end:cur.end,mid:cur.mid,total:cur.total,way:cur.way});}cur=null;};
  for(const [s,t] of per){
   if(cur&&Math.sign(t)===cur.way&&Math.abs(t)>=1.5){cur.items.push([s,t]);cur.total+=t;cur.end=s+10;continue;}
   close();
   if(Math.abs(t)>=2.5)cur={way:Math.sign(t),start:s,end:s+10,total:t,items:[[s,t]]};
  }
  close();
  return out;
 }
 return {circuit,data,L,sections,wrap,signed,turn,bendEnd,gap,bends};
}
