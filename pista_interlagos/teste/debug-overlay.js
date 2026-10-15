import {debugCorner} from './graphics-settings.js';
// Performance overlay (the Gráficos tab, or F3): the frame rate and frame time with a graph of the
// last frames; the full panel adds CPU and GPU time per frame, what the GPU is asked to draw, its
// memory and the game's own lines (lines()). main.js calls begin() and end() round every frame.
// The text is refreshed four times a second. Optional GPU profiling also serves dynamic
// resolution when the panel is hidden; queries are asynchronous and never wait for the GPU.
const HISTORY=240,GRAPH_MS=50;
const number=(value,digits=0)=>value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "NVIDIA GeForce RTX 5060 · Direct3D11".
export function gpuName(raw){
 const text=String(raw||'').trim(),angle=/^ANGLE \((?:[^,]*), (.+?)(?: \(0x[0-9a-f]+\))?(?: (Direct3D\d*|OpenGL[^,]*|Metal|Vulkan[^,]*))?(?: vs_\S+ ps_\S+)?(?:, [^)]*)?\)$/i.exec(text);
 return angle?[angle[1].trim(),angle[2]?.trim()].filter(Boolean).join(' · '):text||'desconhecida';
}
// A recorded stretch of frames (record()): the average frame rate, the 1% low (the mean of the slowest 1% of frames,
// as a frame rate), the worst frame, how many frames took over twice the usual (hitches) and the CPU time per frame.
export function frameStats(intervals,cpu=[]){
 const n=intervals.length;if(!n)return null;const sorted=[...intervals].sort((a,b)=>b-a),sum=intervals.reduce((a,b)=>a+b,0),slow=sorted.slice(0,Math.max(1,Math.round(n/100)));
 const median=sorted[Math.floor(n/2)],cpuSorted=[...cpu].sort((a,b)=>b-a),round=(v,d=1)=>+v.toFixed(d);
 return {frames:n,seconds:round(sum/1000,2),fps:round(n*1000/sum),low1:round(1000/(slow.reduce((a,b)=>a+b,0)/slow.length)),worst:round(sorted[0]),median:round(median,2),hitches:intervals.filter(t=>t>median*2&&t>20).length,
  cpu:cpu.length?round(cpu.reduce((a,b)=>a+b,0)/cpu.length,2):null,cpuP99:cpu.length?round(cpuSorted[Math.floor(cpu.length/100)],2):null,cpuWorst:cpu.length?round(cpuSorted[0]):null};
}
export class DebugOverlay {
 constructor({renderer,touch=false,lines=()=>[],target=()=>60,profile=()=>false}){
  this.renderer=renderer;this.touch=touch;this.lines=lines;this.target=target;this.profile=profile;this.mode='off';this.frameGpuMs=null;
  this.times=new Float32Array(HISTORY);this.cpu=new Float32Array(HISTORY);this.cursor=0;this.count=0;
  this.window={frames:0,start:0,cpu:0,gpu:0,gpuFrames:0};this.shown={fps:0,ms:0,low:0,worst:0,cpu:0,gpu:null};
  this.last=0;this.started=0;this.refreshAt=0;this.graphAt=0;this.gpu=null;this.gpuLabel='';
  const root=this.root=document.createElement('div');root.id='debugOverlay';root.hidden=true;root.setAttribute('aria-hidden','true');
  root.innerHTML='<div class="dbg-head"><b class="dbg-fps">--</b><span>FPS</span><i class="dbg-ms"></i><small class="dbg-key">F3</small></div><canvas class="dbg-graph" width="200" height="46"></canvas><dl class="dbg-lines"></dl>';
  this.fps=root.querySelector('.dbg-fps');this.ms=root.querySelector('.dbg-ms');this.graph=root.querySelector('.dbg-graph');this.list=root.querySelector('.dbg-lines');
  document.body.append(root);this.setCorner('auto');
 }
 setMode(mode){
  this.mode=['off','fps','full'].includes(mode)?mode:'off';this.root.hidden=this.mode==='off';this.root.classList.toggle('dbg-full',this.mode==='full');
  this.count=0;this.last=0;this.window.frames=0;this.refreshAt=0;if(this.mode!=='full')this.stopGpu();
 }
 setCorner(corner){for(const c of ['tl','tc','tr','bl','br'])this.root.classList.toggle('dbg-'+c,c===debugCorner(corner,this.touch));}
 // Frame start: the interval since the previous frame, and the GPU timer for this one.
 begin(now=performance.now()){
  if(this.mode==='full'||this.profile())this.gpuBegin();else if(this.gpu?.pending.length)this.stopGpu();
  const rec=this.rec;if(rec){if(rec.last&&now-rec.last<1000&&rec.dt.length<36000){const dt=now-rec.last;rec.dt.push(dt);if(dt>50&&rec.long.length<40)rec.long.push([+((now-rec.t0)/1000).toFixed(2),+dt.toFixed(1)]);}rec.last=now;rec.start=performance.now();}
  if(this.mode==='off')return;this.started=performance.now();
  if(this.last){const dt=now-this.last;if(dt<1000){this.times[this.cursor]=dt;this.count=Math.min(HISTORY,this.count+1);this.window.frames++;}}
  else this.window.start=now;
  this.last=now;
 }
 end(){
  this.gpuEnd();if(this.rec?.start){if(this.rec.cpu.length<36000)this.rec.cpu.push(performance.now()-this.rec.start);this.rec.start=0;}
  if(this.mode==='off'||!this.started)return;const cpu=performance.now()-this.started;this.started=0;
  this.cpu[this.cursor]=cpu;this.window.cpu+=cpu;this.cursor=(this.cursor+1)%HISTORY;
  const now=this.last;if(now>=this.graphAt){this.graphAt=now+100;this.drawGraph();}
  if(now-this.window.start>=250&&this.window.frames)this.refresh(now);
 }
 refresh(now){
  const w=this.window,elapsed=now-w.start,s=this.shown;
  s.fps=w.frames*1000/elapsed;s.ms=elapsed/w.frames;s.cpu=w.cpu/Math.max(1,w.frames);s.gpu=w.gpuFrames?w.gpu/w.gpuFrames:s.gpu;
  // 1% low: the mean of the slowest 1% of the last frames, as a frame rate.
  const recent=Array.from(this.times.subarray(0,this.count)).sort((a,b)=>b-a),slow=recent.slice(0,Math.max(1,Math.round(recent.length/100)));
  s.low=slow.length?1000/(slow.reduce((a,b)=>a+b,0)/slow.length):0;s.worst=recent[0]??0;
  Object.assign(w,{frames:0,start:now,cpu:0,gpu:0,gpuFrames:0});
  const target=this.target()||60,grade=s.fps>=target*.92?'good':s.fps>=target*.5?'fair':'poor';
  this.fps.textContent=number(Math.round(s.fps));this.root.dataset.grade=grade;this.ms.textContent=`${number(s.ms,1)} ms`;
  if(this.mode==='full')this.fill();
 }
 fill(){
  const s=this.shown,r=this.renderer(),rows=[['1% low',`${number(Math.round(s.low))} FPS · pior ${number(s.worst,1)} ms`],['CPU',`${number(s.cpu,1)} ms por quadro`],['GPU',this.gpu?.ext?(s.gpu===null?'medindo…':`${number(s.gpu,1)} ms por quadro`):'sem cronômetro neste navegador']];
  if(r){
   const canvas=r.domElement,info=r.info;
   rows.push(['Imagem',`${canvas.width}×${canvas.height} · ${number(r.getPixelRatio(),2)}×`],['Desenho',`${number(info.render.calls)} chamadas · ${number(info.render.triangles/1000,0)} mil triângulos`],['Na placa',`${info.memory.geometries} malhas · ${info.memory.textures} texturas · ${info.programs?.length??0} shaders`]);
   this.gpuLabel||=this.readGpuName(r);
  }
  const heap=performance.memory?.usedJSHeapSize;if(heap)rows.push(['Memória JS',`${number(heap/1048576)} MB`]);
  for(const row of this.lines())rows.push(row);
  if(this.gpuLabel)rows.push(['Placa',this.gpuLabel]);
  const list=this.list;while(list.children.length>rows.length*2)list.lastChild.remove();
  rows.forEach(([label,value],i)=>{let dt=list.children[i*2],dd=list.children[i*2+1];if(!dt){dt=document.createElement('dt');dd=document.createElement('dd');list.append(dt,dd);}if(dt.textContent!==label)dt.textContent=label;if(dd.textContent!==value)dd.textContent=value;});
 }
 readGpuName(r){
  try{const gl=r.getContext();let raw=gl.getParameter(gl.RENDERER);if(/^webkit webgl$/i.test(raw)){const ext=gl.getExtension('WEBGL_debug_renderer_info');if(ext)raw=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);}return gpuName(raw);}catch{return 'desconhecida';}
 }
 drawGraph(){
  const c=this.graph,ctx=c.getContext('2d'),w=c.width,h=c.height,bar=w/HISTORY,target=1000/(this.target()||60);
  ctx.clearRect(0,0,w,h);
  for(let i=0;i<this.count;i++){
   const k=(this.cursor-this.count+i+HISTORY)%HISTORY,ms=this.times[k],y=Math.min(h,ms/GRAPH_MS*h);
   ctx.fillStyle=ms<=target*1.1?'#9fd37c':ms<=target*2.05?'#e8c752':'#ef6b55';ctx.fillRect((HISTORY-this.count+i)*bar,h-y,Math.max(1,bar),y);
  }
  // Guides at the frame time of 60 and 30 FPS.
  ctx.fillStyle='#ffffff55';for(const ms of [1000/60,1000/30])ctx.fillRect(0,Math.round(h-ms/GRAPH_MS*h),w,1);
 }
 // GPU time per frame from EXT_disjoint_timer_query_webgl2, read back a few frames later.
 gpuBegin(){
  const r=this.renderer();if(!r)return;
  if(!this.gpuListening){
   const lost=()=>{this.gpu=null;this.frameGpuMs=null;};
   r.domElement.addEventListener('webglcontextlost',lost);r.domElement.addEventListener('webglcontextrestored',lost);this.gpuListening=true;
  }
  if(r.getContext().isContextLost()){this.gpu=null;this.frameGpuMs=null;return;}
  if(!this.gpu){const gl=r.getContext();this.gpu={gl,ext:gl.getExtension?.('EXT_disjoint_timer_query_webgl2')??null,free:[],pending:[],active:null};}
  const g=this.gpu;if(!g.ext)return;const gl=g.gl;
  // A disjoint invalidates the whole outstanding batch, even if no query is available yet.
  if(gl.getParameter(g.ext.GPU_DISJOINT_EXT)){this.stopGpu();return;}
  while(g.pending.length&&gl.getQueryParameter(g.pending[0],gl.QUERY_RESULT_AVAILABLE)){
   const q=g.pending.shift();if(!gl.getParameter(g.ext.GPU_DISJOINT_EXT)){const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;this.frameGpuMs=this.frameGpuMs===null?ms:this.frameGpuMs+(ms-this.frameGpuMs)*.08;if(this.mode==='full'){this.window.gpu+=ms;this.window.gpuFrames++;}}else this.frameGpuMs=null;g.free.push(q);
  }
  if(g.pending.length<8){g.active=g.free.pop()??gl.createQuery();gl.beginQuery(g.ext.TIME_ELAPSED_EXT,g.active);}
 }
 gpuEnd(){const g=this.gpu;if(!g?.active)return;g.gl.endQuery(g.ext.TIME_ELAPSED_EXT);g.pending.push(g.active);g.active=null;}
 stopGpu(){this.frameGpuMs=null;const g=this.gpu;if(!g)return;if(g.active)this.gpuEnd();for(const q of [...g.pending,...g.free])g.gl.deleteQuery(q);g.pending.length=g.free.length=0;this.shown.gpu=null;}
 // Checks (medir_pc_fraco.py, verificar_velocidade.py): record(true) starts keeping every frame's interval and CPU
 // time, whatever the panel shows; record(false) stops and gives frameStats of them, and when (seconds) the frames over
 // 50 ms came, with their length.
 record(on){if(on){this.rec={dt:[],cpu:[],long:[],last:0,start:0,t0:performance.now()};return true;}const r=this.rec;this.rec=null;return r?{...frameStats(r.dt,r.cpu),long:r.long}:null;}
 info(){return {mode:this.mode,corner:[...this.root.classList].find(c=>/^dbg-(tl|tc|tr|bl|br)$/.test(c))?.slice(4)??null,fps:this.shown.fps,ms:this.shown.ms,low:this.shown.low,cpu:this.shown.cpu,gpu:this.shown.gpu,gpuTimer:!!this.gpu?.ext,rows:[...this.list.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent])};}
}
