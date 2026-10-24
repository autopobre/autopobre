// Graphics quality, the settings' Gráficos tab: four levels for phones and computers and, under
// them, every setting by hand. A level is a full set of values; the player's own changes are kept
// as overrides on top of it, so "Automático" (by the device's video: Baixo on integrated video and cheap
// cards, Médio on phones, Alto on computers with a graphics card) with realistic water stays that on either device. No DOM here: the panel is graphics-panel.js, the engine
// side is applyGraphics in main.js.
export const GRAPHICS_LEVELS=Object.freeze(['baixo','medio','alto','ultra']);
export const GRAPHICS_LEVEL_NAMES=Object.freeze({auto:'Automático',baixo:'Baixo',medio:'Médio',alto:'Alto',ultra:'Ultra'});
// The video chip by its name (WEBGL_debug_renderer_info, main.js): 'software' (the browser draws without one),
// 'fraca' (the integrated video of notebooks and cheap PCs, entry cards, phones' small chips: Baixo), 'media' (the
// stronger integrated ones and small cards: Médio), 'forte' (a graphics card); null when the name says nothing. The
// first list that matches wins, so the specific names come before the broad ones.
// (Intel's Arc cards, "Arc A770"/"B580", are graphics cards; the Arc inside Core Ultra chips, plain "Arc Graphics" or
// "Arc 140V", is integrated: Médio. Vega: only the APUs' "Radeon Vega 8 Graphics", a "Radeon RX Vega 56" is a card.
// Snapdragon X notebooks' Adreno X1: Médio.)
const GPU_TIERS=[
 ['software',/swiftshader|llvmpipe|softpipe|lavapipe|basic render|software rasterizer/i,'o navegador desenha sem placa de vídeo'],
 ['forte',/intel.*\barc(?:\(tm\))?\s*[ab]\d{3}\b/i,'detectamos placa de vídeo'],
 ['media',/intel.*\barc\b|radeon.*\b(?:[6-9][6-9]0m|680m|760m|780m|880m|890m)\b|geforce\s*mx\s*[2-5]\d0|geforce\s*gt\s*1030|mali-g(?:7[1-9]|610|710|715|720|925)\b|adreno[^0-9]*(?:6[4-9]\d|[7-9]\d\d)\b|adreno(?:\s*\(tm\))?\s*x\d/i,'detectamos vídeo intermediário'],
 ['fraca',/intel|radeon(?:\(tm\))?\s*(?:graphics|vega\s*\d+\s*graphics|r[2-7]\b|\d{3}m\b)|geforce\s*(?:mx\s*1\d0|gt\s*\d{3}\b|[89]\d\d[a-z]*\b)|mali|adreno|powervr|videocore|sgx/i,'detectamos vídeo integrado'],
 ['forte',/nvidia|geforce|quadro|rtx|radeon|amd|apple m\d|apple gpu/i,'detectamos placa de vídeo']
];
export function gpuTier(renderer){
 const name=String(renderer||'');if(!name.trim())return {tier:null,reason:''};
 const [tier,,reason]=GPU_TIERS.find(([,test])=>test.test(name))??[null,null,''];
 // An entry card or a phone's chip is not 'integrated': same level, its own words.
 return {tier,reason:tier==='fraca'&&/geforce|mali|adreno|powervr|videocore|sgx/i.test(name)?'detectamos vídeo simples':reason};
}
// The level "Automático" stands for on this device: by its video (device: {tier, drop} from main.js), else
// Médio on phones and Alto on computers as always. drop: the level a race stepped it down to (FrameWatch),
// remembered for this video chip; never above what the chip itself gets.
export function autoLevel(touch,device=null){
 const base=device?.tier==='software'||device?.tier==='fraca'?'baixo':device?.tier==='media'||touch?'medio':'alto';
 return device?.drop&&GRAPHICS_LEVELS.indexOf(device.drop)>=0&&GRAPHICS_LEVELS.indexOf(device.drop)<GRAPHICS_LEVELS.indexOf(base)?device.drop:base;
}
// Why Automático picked its level, for the Gráficos tab's card and the F3 panel (pt-BR, short).
export function autoReason(touch,device=null){
 if(device?.drop&&autoLevel(touch,device)===device.drop)return 'o jogo pesou numa corrida e ficou mais leve';
 return device?.tier&&device.tier!=='forte'?device.reason:touch?'celular':device?.tier?device.reason:'computador';
}
// The next level down (Automático's step in a heavy race), null under Baixo.
export const lowerLevel=level=>GRAPHICS_LEVELS[GRAPHICS_LEVELS.indexOf(level)-1]??null;

// Each setting: its group in the panel, its name, a line on what it costs, and its choices
// (value, label) from the lightest to the heaviest. 'next' marks the ones taken at the next start.
export const GRAPHICS_OPTIONS=Object.freeze({
 resolution:{group:'imagem',label:'Densidade de pixels',hint:'Quantos pixels a placa de vídeo desenha por ponto da tela. É o ajuste que mais pesa.',choices:[[.5,'0,5×'],[.75,'0,75×'],[1,'1×'],[1.25,'1,25×'],[1.5,'1,5×'],[2,'2×']]},
 dynamicResolution:{group:'imagem',label:'Resolução dinâmica',hint:'Baixa a densidade sozinha quando o FPS cai e volta quando sobra fôlego.',choices:[[false,'Desligada'],[true,'Ligada']]},
 fpsLimit:{group:'imagem',label:'Limite de FPS',hint:'Poupa energia. O navegador também depende da frequência configurada no monitor em uso.',choices:[[30,'30 FPS'],[60,'60 FPS'],[90,'90 FPS'],[120,'120 FPS'],[144,'144 FPS'],[160,'160 FPS'],[0,'Sem limite']]},
 targetFps:{group:'imagem',label:'Meta da resolução dinâmica',hint:'Automática acompanha o ritmo estimado da tela. Uma meta maior troca nitidez por fluidez; não aumenta os Hz do monitor.',choices:[[0,'Automática · tela'],[60,'60 FPS'],[90,'90 FPS'],[120,'120 FPS'],[144,'144 FPS'],[160,'160 FPS']]},
 antialias:{group:'imagem',label:'Antisserrilhado (MSAA)',hint:'Suaviza os degraus nas bordas. No visual Simples vale ao recarregar a página.',choices:[[0,'Desligado'],[2,'2×'],[4,'4×']]},
 shadows:{group:'luz',label:'Sombras',hint:'Resolução e alcance das sombras do sol em volta do carro.',choices:[['off','Desligadas'],['baixa','Baixas'],['media','Médias'],['alta','Altas'],['ultra','Ultra']]},
 reflections:{group:'luz',label:'Reflexos dos carros',hint:'O que a pintura, os vidros e os cromados refletem. Pista grava arquibancadas e asfalto uma vez na largada; Dinâmicos redesenham a cena em volta do carro aos poucos e pesam mais.',choices:[['ceu','Só o céu'],['pista','Pista'],['dinamico','Dinâmicos'],['dinamico_hd','Dinâmicos HD']]},
 post:{group:'luz',label:'Visual de cinema',hint:'Neblina de São Paulo, cor de filme e ajuste de exposição. Simples desenha direto na tela.',choices:[['off','Simples'],['lite','Leve'],['full','Completo']]},
 ao:{group:'luz',label:'Oclusão de ambiente',hint:'Sombra de contato nos cantos e sob os carros. Só no visual Completo.',choices:[[false,'Desligada'],[true,'Ligada']]},
 lens:{group:'luz',label:'Brilho e lente',hint:'Brilho das luzes fortes, reflexo do sol na lente e foco das câmeras de TV. Só no visual Completo.',choices:[[false,'Desligado'],[true,'Ligado']]},
 motionBlur:{group:'luz',label:'Desfoque de velocidade',hint:'Borra o asfalto perto e as margens da pista conforme a câmera anda rápido; os carros ficam nítidos. Desligado no celular, a Sensação de velocidade Média ainda borra de leve o asfalto perto.',choices:[[false,'Desligado'],[true,'Ligado']]},
 materials:{group:'mundo',label:'Detalhe da pista',hint:'Relevo do asfalto, borracha, remendos, zebras e refletores. Baixo reduz o trabalho da placa de vídeo.',choices:[['baixo','Baixo'],['medio','Médio'],['alto','Alto'],['ultra','Ultra']]},
 cameraMotion:{group:'luz',label:'Movimento de câmera',hint:'Resposta à velocidade, frenagens e impactos. Reduzido é mais confortável; desligado remove essa resposta extra.',choices:[[0,'Desligado'],[.35,'Reduzido'],[1,'Completo']]},
 actionFeedback:{group:'luz',label:'Avisos de ação',hint:'Avisos curtos para disputas roda a roda, passagens por um triz e impactos.',choices:[[false,'Desligados'],[true,'Ligados']]},
 speedEffects:{group:'luz',label:'Sensação de velocidade',hint:'Bandeirinhas que tremulam com o vento dos carros, rodas borradas, poeira e ar passando pela câmera, capim que deita e o vento mais agudo em alta. Leve fica com as bandeiras dos fiscais e da largada e o asfalto correndo perto da câmera; Desligada mantém só o som e a vibração das zebras.',choices:[['off','Desligada'],['leve','Leve'],['media','Média'],['completa','Completa']]},
 carDetail:{group:'mundo',label:'Detalhe dos carros',hint:'Até onde os outros carros aparecem completos, com cabine, piloto e rodas. Mais longe ficam numa versão leve e, ao longe, num modelo simples. Leve poupa muito a placa de vídeo com o pelotão por perto.',choices:[['leve','Leve'],['medio','Médio'],['alto','Alto'],['maximo','Máximo']]},
 scenery:{group:'mundo',label:'Cenário e vegetação',hint:'Árvores, casas e capim com vento nas margens. Vale na próxima largada.',next:true,choices:[['basico','Básico'],['leve','Leve'],['completo','Completo'],['denso','Denso']]},
 viewDistance:{group:'mundo',label:'Distância de visão',hint:'Até onde o horizonte aparece antes de sumir na neblina.',choices:[['curta','Curta'],['media','Média'],['longa','Longa'],['maxima','Máxima']]},
 water:{group:'mundo',label:'Água dos lagos',hint:'Realista reflete árvores, casas e céu e ondula com o vento: desenha a cena mais uma vez.',choices:[['simples','Simples'],['realista','Realista']]},
 mirrors:{group:'mundo',label:'Retrovisores',hint:'Resolução do retrovisor: o espelho da câmera interna e o retrovisor no alto da tela nas câmeras 1 a 4. Desenha a pista para trás a cada quadro (nos níveis mais leves, a cada 2 ou 3 quadros).',choices:[['off','Desligados'],['baixa','Baixa'],['media','Média'],['alta','Alta']]}
});
export const GRAPHICS_GROUPS=Object.freeze([['imagem','Imagem'],['luz','Luz e efeitos'],['mundo','Mundo']]);

// Médio is what phones always had and Alto what computers had, before this tab existed.
export const GRAPHICS_PRESETS=Object.freeze({
 baixo:Object.freeze({resolution:.75,dynamicResolution:true,fpsLimit:60,targetFps:0,antialias:0,shadows:'off',reflections:'ceu',post:'off',ao:false,lens:false,motionBlur:false,materials:'baixo',cameraMotion:.35,actionFeedback:true,speedEffects:'leve',carDetail:'leve',scenery:'basico',viewDistance:'curta',water:'simples',mirrors:'baixa'}),
 medio:Object.freeze({resolution:1,dynamicResolution:true,fpsLimit:0,targetFps:0,antialias:0,shadows:'baixa',reflections:'pista',post:'lite',ao:false,lens:false,motionBlur:false,materials:'medio',cameraMotion:.35,actionFeedback:true,speedEffects:'media',carDetail:'medio',scenery:'leve',viewDistance:'media',water:'simples',mirrors:'media'}),
 alto:Object.freeze({resolution:1.5,dynamicResolution:true,fpsLimit:0,targetFps:0,antialias:4,shadows:'alta',reflections:'dinamico',post:'full',ao:true,lens:true,motionBlur:true,materials:'alto',cameraMotion:1,actionFeedback:true,speedEffects:'completa',carDetail:'alto',scenery:'completo',viewDistance:'longa',water:'simples',mirrors:'alta'}),
 ultra:Object.freeze({resolution:2,dynamicResolution:true,fpsLimit:0,targetFps:0,antialias:4,shadows:'ultra',reflections:'dinamico_hd',post:'full',ao:true,lens:true,motionBlur:true,materials:'ultra',cameraMotion:1,actionFeedback:true,speedEffects:'completa',carDetail:'maximo',scenery:'denso',viewDistance:'maxima',water:'realista',mirrors:'alta'})
});

// What each choice means to the engine (main.js applyGraphics, landscape.js).
// Sun shadows: map size in pixels, metres covered round the car and the PCF softness. car: the cars'
// own crisp map (car-shadow.js), tile pixels and metres either side of a car, for the followed car
// alone or with the nearest ones.
export const SHADOW_LEVELS=Object.freeze({off:null,baixa:{size:1024,reach:55,radius:2},media:{size:2048,reach:70,radius:2},alta:{size:4096,reach:85,radius:2,car:{size:1024,reach:4.5,cars:1}},ultra:{size:8192,reach:120,radius:3,car:{size:1024,reach:4.5,cars:4}}});
// Fog from near to far (metres) and the camera's far plane; past 'far' everything is fog colour.
export const VIEW_DISTANCES=Object.freeze({curta:{fog:[300,1600],far:1900},media:{fog:[420,2400],far:6500},longa:{fog:[520,3300],far:6500},maxima:{fog:[700,4600],far:9000}});
// A circuit on a plateau's rim (Chapada dos Sonhos: far-terrain.js) looks over a valley out to 22 km: there the
// fog and the far plane reach further, at each level.
// The fog starts near, as over the other circuits: the valley's ridges a few km off take the blue of the distance.
export const VALLEY_VIEW=Object.freeze({curta:{fog:[350,8000],far:12000},media:{fog:[400,13000],far:21000},longa:{fog:[500,17000],far:28000},maxima:{fog:[600,22000],far:34000}});
// Scenery: the light build (mobile), trees and houses per area, and how near a tree shows its full crown.
export const SCENERY_LEVELS=Object.freeze({basico:{mobile:true,density:.7,lod:55},leve:{mobile:true,density:1,lod:80},completo:{mobile:false,density:1,lod:130},denso:{mobile:false,density:1.3,lod:220}});
// How far the people standing about (pit lane, marshals, cameramen: pit-crew.js) are drawn, by the scenery level.
export const PEOPLE_REACH=Object.freeze({basico:250,leve:400,completo:650,denso:800});
// Car reflections: where the paint, glass and chrome get their surroundings (car-reflections.js). sky:
// the sky dome's own map; bake: the circuit seen once from the grid (cube face pixels; 256 as the sky's,
// so no other shader programs on phones); probe: a cube that follows the player's car, 'faces' faces
// redrawn per frame out to 'far' metres (a face costs its draw calls more than its pixels: at 128 px the coat
// mirrored the stands as smeared blobs, satin instead of lacquer). finish: car-finish.js profile. Video memory: a probe
// is its cube, its prefiltered map and the prefilter's work map, about 4 MB at 128, 17 MB at 256 and 69 MB at 512;
// the grid's picture keeps only its prefiltered map (about 6 MB at 256).
export const REFLECTION_LEVELS=Object.freeze({ceu:{source:'sky',finish:'baixo'},pista:{source:'bake',bake:256,far:600,finish:'medio'},dinamico:{source:'probe',probe:256,faces:1,far:250,finish:'alto'},dinamico_hd:{source:'probe',probe:512,faces:2,far:400,finish:'ultra'}});
// The other cars' levels of detail (immersive-visuals.js detailLevel): the detailed car up to `near` metres, a
// light copy (car-lod.js) up to `far`, a simple profile beyond (as seen through a normal lens: a long one counts nearer).
export const CAR_DETAIL=Object.freeze({leve:{near:7,far:30},medio:{near:14,far:45},alto:{near:22,far:65},maximo:{near:32,far:95}});
// Cockpit mirror picture in pixels (null: not drawn).
export const MIRROR_SIZES=Object.freeze({off:null,baixa:[340,57],media:[510,85],alta:[1020,170]});

const isChoice=(key,value)=>GRAPHICS_OPTIONS[key].choices.some(([v])=>v===value);
// {level: 'auto' or one of the four, overrides: {setting: value}}. Settings saved before this tab
// (the lake water and the film look) become overrides of "Automático".
export function normalizeGraphics(value,legacy={}){
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value:null;
 const level=['auto',...GRAPHICS_LEVELS].includes(source?.level)?source.level:'auto';
 const given=source?(source.overrides&&typeof source.overrides==='object'?source.overrides:{}):{
  ...(legacy?.realisticWater===true?{water:'realista'}:{}),
  ...(['full','lite','off'].includes(legacy?.cinematic)?{post:legacy.cinematic}:{})
 };
 const overrides={};
 for(const key of Object.keys(GRAPHICS_OPTIONS))if(Object.hasOwn(given,key)&&isChoice(key,given[key]))overrides[key]=given[key];
 return {level,overrides};
}
// The values in force: the level's, then the player's changes. 'changed' lists the settings that
// differ from the level.
export function resolveGraphics(graphics,{touch=false,device=null}={}){
 const level=graphics.level==='auto'?autoLevel(touch,device):graphics.level,base=GRAPHICS_PRESETS[level],values={...base},changed=[];
 for(const [key,value] of Object.entries(graphics.overrides))if(value!==base[key]){values[key]=value;changed.push(key);}
 return {level,auto:graphics.level==='auto',values,changed};
}
// One setting changed by hand: kept as an override unless it is the level's own value
// (same: a custom test, e.g. two pixel densities this screen draws alike).
export function setGraphicsValue(graphics,key,value,{touch=false,device=null,same=(a,b)=>a===b}={}){
 if(!Object.hasOwn(GRAPHICS_OPTIONS,key)||!isChoice(key,value))return graphics;
 const level=graphics.level==='auto'?autoLevel(touch,device):graphics.level,overrides={...graphics.overrides};
 if(same(value,GRAPHICS_PRESETS[level][key],key))delete overrides[key];else overrides[key]=value;
 return {level:graphics.level,overrides};
}
// Picking a level drops the changes made by hand.
export const chooseGraphicsLevel=level=>({level:['auto',...GRAPHICS_LEVELS].includes(level)?level:'auto',overrides:{}});

// The performance overlay (debug-overlay.js): off, the FPS line or the full panel, and where it sits.
export const DEBUG_OVERLAY_MODES=Object.freeze([['off','Desligada'],['fps','Só o FPS'],['full','Completa']]);
export const DEBUG_OVERLAY_CORNERS=Object.freeze([['auto','Automático'],['tl','Canto superior esquerdo'],['tc','Topo, ao centro'],['tr','Canto superior direito'],['bl','Canto inferior esquerdo'],['br','Canto inferior direito']]);
// 'auto': top left on computers; phones have the map there, so the top centre.
export const debugCorner=(corner,touch)=>corner==='auto'?(touch?'tc':'tl'):corner;

// The FPS limit: frames still come at the screen's rate and the early ones are skipped, on a fixed
// grid so the average holds (60 on a 144 Hz screen). limit 0: every frame.
// hz (the screen's measured rate, DisplayCadence): when a whole number of the screen's frames comes within 30% over
// the limit, it draws that, so every frame stays on screen as long as the others: 60 on a 75 Hz monitor skipped one
// frame in five, a stutter four times a second at speed; it draws 75 now (72 on 144 Hz, 60 on 120 Hz, 33 on 165 Hz for
// 30). Further over (60 or 120 on 165 Hz) the limit holds on average, as before: a cap is a cap.
export class FrameLimiter {
 constructor(limit=0){this.limit=limit;this.last=0;}
 // The frames per second it lets through on a screen of hz (0: unknown, the limit itself).
 // The time a frame has when the limit holds on average over uneven screen frames: the shorter slot (60 on 165 Hz
 // alternates two and three of its frames: a frame over two waits for a third and the average sinks to 55).
 // Only where two or more screen frames make one (a 120 cap on 165 Hz aims at 120, not at the screen's 165).
 slot(hz=0){const k=this.limit&&hz>0?Math.floor(hz/this.limit+.05):0;return k>=2?hz/k:this.rate(hz);}
 rate(hz=0){if(!this.limit)return hz;if(!(hz>0))return this.limit;const even=hz/Math.max(1,Math.floor(hz/this.limit+.05));return even<=this.limit*1.3?even:this.limit;}
 skip(now,hz=0){
  if(!this.limit)return false;const interval=1000/this.rate(hz),elapsed=now-this.last;
  // A frame up to 1 ms early still counts for its slot; the grid moves on by whole slots.
  if(elapsed<interval-1)return true;this.last=elapsed>interval*3?now:this.last+Math.max(1,Math.floor((elapsed+1)/interval))*interval;return false;
 }
}

// Estimate the browser's presentation cadence before the game's limiter. This is not a monitor
// hardware query. Measure in menus and briefly after a window move; racing load cannot steadily
// pull the estimate down and make dynamic resolution give up its target.
export class DisplayCadence {
 constructor(){this.hz=60;this.measured=false;this.reset();}
 reset(){this.last=0;this.samples=[];this.elapsed=0;this.probeUntil=0;}
 observe(now,measure=false){
  if(!this.last){this.last=now;this.probeUntil=now+3000;return;}
  const dt=now-this.last;this.last=now;
  if(dt<=0||dt>100)return;
  // Shader compilation/loading stalls must not prolong the calibration into the race.
  if(!measure&&now>this.probeUntil)return;
  this.samples.push(dt);this.elapsed+=dt;
  if(this.samples.length<30||this.elapsed<650)return;
  const sorted=this.samples.sort((a,b)=>a-b),interval=sorted[Math.floor(sorted.length*.2)];
  const rate=Math.max(30,Math.min(240,1000/interval));
  const common=[30,50,60,75,90,100,120,144,160,165,180,240].find(h=>Math.abs(h-rate)<h*.025);
  this.hz=common??Math.round(rate);this.measured=true;this.samples=[];this.elapsed=0;
 }
 target(requested=0,limit=0){return Math.min(requested||this.hz,limit||Infinity,this.hz);}
}

// How far dynamic resolution may lower the pixel density: Baixo, the cheap PCs' level, down to half (integrated video
// is the limit there; a softer picture beats a stutter); phones .6, computers .7.
// (phones keep .6 on every level: Baixo's .5 on a phone's dense small screen read as a blur)
export const resolutionFloor=(level,touch=false)=>touch?.6:level==='baixo'?.5:.7;
// Dynamic resolution's pace (main.js adaptResolution): adaptivePixelRatio says which way, this says when. Every change
// rebuilds the drawing buffer (and the film look's targets), a stall of 100-300 ms on integrated video: a picture that
// went up and down with every stretch of the lap (9 changes a minute on a cheap notebook) stuttered more than it
// gained. A step down waits for two slow windows in a row (one when far over: `far`), a step up for four quick ones
// and `wait` seconds since the last change; an up that had to be taken back doubles that wait (up to a minute).
export class ResolutionPace {
 constructor({window=1.5,wait=8}={}){this.window=window;this.wait=wait;this.down=0;this.up=0;this.since=99;this.lastUp=false;}
 decide(current,next,{far=false}={}){
  this.since+=this.window;
  if(next<current){this.up=0;if(++this.down<2&&!far)return current;
   if(this.lastUp&&this.since<this.wait*2)this.wait=Math.min(60,this.wait*2);this.down=0;this.since=0;this.lastUp=false;return next;}
  if(next>current){this.down=0;if(++this.up<4||this.since<this.wait)return current;this.up=0;this.since=0;this.lastUp=true;return next;}
  this.down=this.up=0;return current;
 }
}
// A race's frame rate as Automático watches it (main.js): one-second windows; a window is slow under `ratio` of the
// target (at most 60: a fast screen is no reason to lower the level) while dynamic resolution has nothing left to
// give (at its floor, or off). After `hold` slow windows (a quick one takes two back) it says so, once: true.
export class FrameWatch {
 constructor({hold=12,ratio=.72}={}){this.hold=hold;this.ratio=ratio;this.reset();}
 reset(){this.time=0;this.frames=0;this.slow=0;this.fired=false;}
 feed(dt,{target=60,floor=true}={}){
  if(this.fired||!(dt>0)||dt>.5)return false;
  this.time+=dt;this.frames++;if(this.time<1)return false;
  const fps=this.frames/this.time;this.time=this.frames=0;
  this.slow=fps<Math.min(60,target||60)*this.ratio&&floor?this.slow+1:Math.max(0,this.slow-2);
  return this.fired=this.slow>=this.hold;
 }
}

// Hysteresis leaves time for textures/shaders to settle and avoids continuously rebuilding HDR
// targets. A faster target trades pixels only; it never skips physics steps or overrides an FPS cap.
export function adaptivePixelRatio(current,{min,max,frameSeconds,gpuSeconds=null,targetFps,tight=false}){
 const budget=1/Math.max(1,targetFps);
 // Frame time also includes CPU simulation and the browser's presentation wait. When the
 // asynchronous GPU timer exists, trade pixels against that work, not a CPU bottleneck.
 const timed=Number.isFinite(gpuSeconds)&&gpuSeconds>0,load=timed?gpuSeconds:frameSeconds;
 // tight (Baixo, main.js): the GPU's own time is a clean signal, 10% over the budget is a frame that misses the screen,
 // and a step up adds about 15% of pixels, so it waits for that much room (ResolutionPace keeps the changes few). The
 // GPU timer leaves out the picture's way to the screen: frames that miss the budget while the GPU takes most of it
 // (over 80%) step down too (an integrated video's 15.5 ms of 16.7 drew 54 FPS under a 60 cap). The other levels keep
 // their old give (22% over to step down, 6% under to step up): their picture changes less often.
 const missing=tight&&timed&&frameSeconds>budget*1.1&&gpuSeconds>budget*.8;
 return load>budget*(timed&&tight?1.1:1.22)||missing?Math.max(min,current-.1):load<budget*(timed?(tight?.85:.94):1.04)?Math.min(max,current+.05):current;
}
