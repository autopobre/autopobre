// Recorded engine sounds (teste/engine-loops.js; banks by scripts/gerar_loops_motor.py), offline: each car's loop
// bank and idle loop decode; every loop sits at its labelled revs (of the lines at fractions of its firing
// frequency, the firing line is the strongest: a loop tracked on another order sounded at the wrong revs);
// loops run into themselves without a click or a gap; the throttle-open loops reach the top of the range; first
// gear's heard revs start where the team set them and meet the real ones at the upshift.
// Needs ffmpeg (FFMPEG, else the portable one in an apps/ folder above the repository, else PATH).
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {clickOffset,firstGearRevs,SHIFT_UP,COUNTER} from '../teste/engine-loops.js';
import {TUNING} from '../teste/car-audio.js';

const here=path.dirname(fileURLToPath(import.meta.url)),audio=path.join(here,'../teste/assets/audio'),SR=44100;
const ffmpeg=()=>{
 if(process.env.FFMPEG)return process.env.FFMPEG;
 for(let dir=here;path.dirname(dir)!==dir;dir=path.dirname(dir)){
  const apps=path.join(dir,'apps');if(!existsSync(apps))continue;
  const found=readdirSync(apps).filter(n=>n.startsWith('ffmpeg-')).map(n=>path.join(apps,n,'bin','ffmpeg.exe')).filter(existsSync);
  if(found.length)return found.sort().at(-1);
 }
 return 'ffmpeg';
};
const FFMPEG=ffmpeg();
let failures=0;const check=(name,ok,detail='')=>{console.log(`${ok?'ok  ':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures++;};
const load=name=>{
 const meta=JSON.parse(readFileSync(path.join(audio,name+'.json'),'utf8'));
 const raw=execFileSync(FFMPEG,['-v','error','-i',path.join(audio,name+'.mp3'),'-ac','1','-ar',String(SR),'-f','f32le','-'],{maxBuffer:1<<28});
 const samples=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
 return {meta,samples,offset:Math.round(clickOffset(meta,samples,SR))};
};
const power=re=>{const n=re.length,im=new Float64Array(n);for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len;for(let i=0;i<n;i+=len)for(let k=0;k<len/2;k++){const c=Math.cos(a*k),s=Math.sin(a*k),xr=re[i+k+len/2],xi=im[i+k+len/2],tr=xr*c-xi*s,ti=xr*s+xi*c;re[i+k+len/2]=re[i+k]-tr;im[i+k+len/2]=im[i+k]-ti;re[i+k]+=tr;im[i+k]+=ti;}}
 return Float64Array.from(re,(r,i)=>r*r+im[i]*im[i]);};
const rms=(x,a,b)=>{let s=0;for(let i=a;i<b;i++)s+=x[i]*x[i];return Math.sqrt(s/(b-a));};
// The wrap: the loop's last 10 ms followed by its first 10 ms, against the loop's own level.
const seam=(x,a,b)=>{const w=Math.round(SR*.01),joined=Float32Array.from([...x.subarray(b-w,b),...x.subarray(a,a+w)]);return rms(joined,0,joined.length)/rms(x,a,b);};

for(const [bank,order] of [['loops_m3',3],['loops_fusca',2]]){
 const {meta,samples,offset}=load(bank),loops=meta.loops;
 check(`${bank}: click found`,Math.abs(offset)<3000,`offset ${offset}`);
 const on=loops.filter(l=>l.layer==='on'),off=loops.filter(l=>l.layer==='off');
 check(`${bank}: both layers`,on.length>=2&&off.length>=2,`${on.length} open, ${off.length} shut`);
 check(`${bank}: open loops at the top (over ${TUNING.onFrom} rpm, the cut)`,on.some(l=>l.rpm>=TUNING.onFrom)&&Math.max(...on.map(l=>l.rpm))>=6000,`top ${Math.max(...on.map(l=>l.rpm))}`);
 const wrong=[],seams=[];
 for(const l of loops){
  const a=l.start+offset,b=l.end+offset,n=1<<19,re=new Float64Array(n);
  for(let i=a;i<b;i++)re[i-a]=samples[i]*(.5-.5*Math.cos(2*Math.PI*(i-a)/(b-a-1)));
  const p=power(re),df=SR/n,hz=l.rpm*order/60;
  const level=f=>{const k=Math.round(f/df),w=Math.max(3,Math.round(f*.01/df));let m=0;for(let j=k-w;j<=k+w;j++)m=Math.max(m,p[j]);return 10*Math.log10(m+1e-30);};
  const levels=[.5,2/3,.75,1,1.5,2].map(r=>level(hz*r));
  if(levels[3]<Math.max(...levels)-4)wrong.push(`${l.layer} ${l.rpm}`);
  const s=seam(samples,a,b);if(s<.4||s>2.5)seams.push(`${l.layer} ${l.rpm}: ${s.toFixed(2)}`);
 }
 check(`${bank}: every loop at its labelled revs`,!wrong.length,wrong.join(', '));
 check(`${bank}: loops run into themselves`,!seams.length,seams.join(', '));
}
for(const idle of ['lenta_opala','lenta_fusca']){
 const {meta,samples,offset}=load(idle),[a,b]=meta.loop.map(x=>x+offset);
 check(`${idle}: a long real idle (${((b-a)/SR).toFixed(1)} s)`,b-a>SR*10);
 const s=seam(samples,a,b);check(`${idle}: loops into itself`,s>.4&&s<2.5,s.toFixed(2));
}
// First gear: from firstFrom of the counter at a standstill to the upshift point, climbing with the wheels.
const first=110,curve=[0,10,20,30,40,50,SHIFT_UP/first].map(k=>firstGearRevs(k,first,TUNING.firstFrom));
check('first gear starts at the set share of the counter',Math.abs(curve[0]-TUNING.firstFrom*COUNTER)<1,`${Math.round(curve[0])} rpm`);
check('first gear climbs with the wheels to the upshift',curve.every((v,i)=>!i||v>curve[i-1])&&Math.abs(curve.at(-1)-SHIFT_UP)<1,curve.map(Math.round).join(' → '));
console.log(failures?`${failures} failed`:'all passed');process.exitCode=failures?1:0;
