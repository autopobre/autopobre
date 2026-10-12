// Arena de Drift: a flat asphalt floor inside a stadium, where the player puts down and takes away what the drift is
// done round (cones, tyre stacks, planters with their rear-wheel zones, clips) and drifts alone or tries a challenge.
// This module holds what the physics (drift-arena-world.js), the score (drift-score.js), the scene
// (drift-arena-scene.js) and the screens share: the floor's shape, the kinds of items, the ready-made layouts and the
// track file the rest of the game drives on. Plan frame as the track files: x east (the arena's length), y north.

// The floor: a rounded rectangle 170 m by 100 m, its corners rounded at 30 m, inside the stadium's concrete wall.
export const ARENA=Object.freeze({halfLength:85,halfWidth:50,corner:30,wallHeight:1.15,wallThick:.45,fence:3.2});

// Signed distance from the floor's edge (the wall's face): negative inside, with the outward normal.
export function floorEdge(x,y){
 const {halfLength:A,halfWidth:B,corner:R}=ARENA,qx=Math.abs(x)-(A-R),qy=Math.abs(y)-(B-R),sx=x<0?-1:1,sy=y<0?-1:1;
 if(qx>0&&qy>0){const l=Math.hypot(qx,qy);return {d:l-R,nx:sx*qx/l,ny:sy*qy/l};}
 return qx>qy?{d:qx-R,nx:sx,ny:0}:{d:qy-R,nx:0,ny:sy};
}
// The floor's outline, counter-clockwise from the east, a point every `step` metres or so, offset `out` metres outwards
// (negative: inwards).
export function floorOutline(out=0,step=2){
 const {halfLength:A,halfWidth:B,corner:R}=ARENA,r=R+out,pts=[],cx=A-R,cy=B-R;
 const arc=(x,y,a0)=>{const n=Math.max(2,Math.ceil(r*Math.PI/2/step));for(let k=0;k<n;k++){const a=a0+k/n*Math.PI/2;pts.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}};
 const line=(x0,y0,x1,y1)=>{const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/step));for(let k=0;k<n;k++)pts.push([x0+(x1-x0)*k/n,y0+(y1-y0)*k/n]);};
 line(cx+r,-cy,cx+r,cy);arc(cx,cy,0);line(cx,cy+r,-cx,cy+r);arc(-cx,cy,Math.PI/2);line(-cx-r,cy,-cx-r,-cy);arc(-cx,-cy,Math.PI);line(-cx,-cy-r,cx,-cy-r);arc(cx,-cy,Math.PI*1.5);
 return pts;
}

// What can be put on the floor. size: the default of the one measure the editor changes (min..max): a planter's
// radius, a zone's or a wall's length. solid/dynamic: what the car meets (drift-arena-world.js); paint: marks drawn on
// the floor. Names as the screens show them.
export const ITEM_KINDS=Object.freeze({
 cone:{name:'Cone',hint:'Derruba fácil. Nos desafios, cone no chão é ponto a menos.',dynamic:true,radius:.2,mass:4},
 pneus:{name:'Pilha de pneus',hint:'Três pneus empilhados: dá para empurrar.',dynamic:true,radius:.33,mass:30},
 muro:{name:'Muro de pneus',hint:'Fileira de pneus presos: não sai do lugar.',size:6,min:3,max:16,solid:true},
 bloco:{name:'Bloco de concreto',hint:'Barreira de concreto de 3 m.',size:3,min:3,max:12,solid:true},
 ilha:{name:'Canteiro redondo',hint:'Ilha de grama com zebra, para contornar. O clipe fica na borda.',size:8,min:4,max:16},
 meia_lua:{name:'Canteiro com zona',hint:'Meia-lua de grama com a faixa das rodas traseiras na borda de dentro.',size:22,min:12,max:40},
 zona:{name:'Zona das rodas traseiras',hint:'Faixa pintada: passe as rodas de trás por dentro, de lado.',size:16,min:6,max:40},
 clip:{name:'Clipe (frente)',hint:'Marca para a frente do carro passar rente, de lado.'},
 largada:{name:'Largada',hint:'Portal da largada: os desafios começam ao cruzar.'}
});
export const ITEM_ORDER=Object.freeze(['cone','pneus','ilha','meia_lua','zona','clip','muro','bloco','largada']);
// A crescent planter (meia_lua): its item point is the middle of its inner edge, a its heading towards the arc's centre;
// it spans SPAN radians, 4 m of grass behind a kerb; its rear-wheel zone runs along the inside of the kerb.
export const MEIA_LUA=Object.freeze({span:2.4,grass:4,kerb:.9,band:3.5});
export const ILHA=Object.freeze({kerb:.9,post:1.1});
export const ZONE_WIDTH=3.5,CLIP_REACH=2.2,GATE_WIDTH=14;

// An item as stored: {kind, x, y, a (heading, radians), size?}; out of the floor or of a kind not known: null.
export function cleanItem(item){
 if(!item||typeof item!=='object'||!Object.hasOwn(ITEM_KINDS,item.kind))return null;
 const k=ITEM_KINDS[item.kind],num=(v,d)=>Number.isFinite(v)?v:d,x=num(item.x,NaN),y=num(item.y,NaN);
 if(!Number.isFinite(x)||!Number.isFinite(y)||floorEdge(x,y).d>-.5)return null;
 const out={kind:item.kind,x:+x.toFixed(2),y:+y.toFixed(2),a:+(((num(item.a,0)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)).toFixed(4)};
 if(k.size)out.size=+Math.min(k.max,Math.max(k.min,num(item.size,k.size))).toFixed(2);
 return out;
}
export const MAX_ITEMS=160;
export function cleanLayout(layout){
 const items=Array.isArray(layout?.items)?layout.items.map(cleanItem).filter(Boolean).slice(0,MAX_ITEMS):[];
 // One start gate at most: the last one put down.
 const gates=items.filter(i=>i.kind==='largada');for(const g of gates.slice(0,-1))items.splice(items.indexOf(g),1);
 return {name:typeof layout?.name==='string'?layout.name.slice(0,40):'Minha arena',items};
}

// Ready-made layouts. The challenges race on theirs; free driving starts from the player's own (saved) or Campeonato.
const cone=(x,y)=>({kind:'cone',x,y,a:0}),stack=(x,y)=>({kind:'pneus',x,y,a:0});
// Headings: towards the east 0, north π/2, west π.
const EAST=0,WEST=Math.PI;
export const PRESETS=Object.freeze({
 vazia:{name:'Arena vazia',items:[]},
 um_cone:{name:'Um cone',items:[cone(0,0)]},
 oito:{name:'Oito em dois cones',items:[cone(-22,0),cone(22,0)]},
 slalom:{name:'Slalom de cones',items:[-55,-33,-11,11,33,55].map(x=>cone(x,0))},
 canteiros:{name:'Dois canteiros',items:[
  {kind:'ilha',x:-42,y:0,a:0,size:8},{kind:'ilha',x:42,y:0,a:0,size:8},
  // The crescents face their islands (heading towards the island): inner edge 21 m from its middle, on the far side.
  {kind:'meia_lua',x:-63,y:0,a:EAST,size:21},{kind:'meia_lua',x:63,y:0,a:WEST,size:21}]},
 // A figure eight like a drift final's: in through the gate heading west, the north zone, round the west island
 // anticlockwise (its crescent's zone wide, the clip tight at its south-west), across the middle, round the east island
 // clockwise and out through the south zone.
 campeonato:{name:'Campeonato Auto-Pobre',items:[
  {kind:'largada',x:-4,y:30,a:WEST},
  {kind:'zona',x:-25,y:22,a:WEST,size:16},
  {kind:'ilha',x:-42,y:-2,a:0,size:8},{kind:'meia_lua',x:-63,y:-2,a:EAST,size:21},{kind:'clip',x:-46.5,y:-9.7,a:-Math.PI/3},
  {kind:'ilha',x:42,y:-2,a:0,size:8},{kind:'meia_lua',x:63,y:-2,a:WEST,size:21},{kind:'clip',x:46.5,y:-9.7,a:-Math.PI*2/3},
  {kind:'zona',x:22,y:-24,a:WEST,size:16},
  cone(-33,29),cone(-17,29),cone(14,-31),cone(30,-31),
  stack(-51.8,23.2),stack(-51.8,-27.2),stack(51.8,23.2),stack(51.8,-27.2)]}
});
export const PRESET_ORDER=Object.freeze(['campeonato','canteiros','oito','um_cone','slalom','vazia']);
export const presetLayout=id=>cleanLayout(structuredClone(PRESETS[id]??PRESETS.vazia));

// The venue the menus and main.js take as `circuit` while in the arena (never in CIRCUITS: no championship,
// records, ghosts nor multiplayer).
export const DRIFT_ARENA=Object.freeze({id:'arena',arena:true,name:'Arena de Drift',label:'ARENA DE DRIFT · AUTO-POBRE RACING',length:0,
 description:'Arena plana de asfalto · cones, pneus e canteiros · treino livre e desafios',
 intro:'Um estádio inteiro de asfalto liso para derrapar. Monte a arena do seu jeito, ou tente os desafios: rodas de trás dentro da zona, frente rente ao clipe.',
 source:'Arena imaginária.',fuel:'Na arena o tanque não acaba.',altitude:null,track:'ARENA',boxTitle:'Cuida do Opala!',weather:'Arena de Drift · 16h40 · 26 °C · pista seca',venue:'Arena de Drift Auto-Pobre',
 // Where the car comes in: the west end, facing east down the floor.
 spawn:{x:-66,y:-20,heading:0}});

// The track file the game drives on (physics.js TestCar, the cameras, the asphalt): a loop of stations round the floor
// 25 m in from the wall, 52 m wide, so the whole floor is road and no station is ever more than 26 m away. Flat at
// height 0. The wall, the items and the planters' grass are drift-arena-world.js's, not the track file's.
export function createArenaData(){
 const {halfLength:A,halfWidth:B,corner:R}=ARENA,inset=25,hx=A-inset,hy=B-inset,r=R-inset,ring=[];
 // Rounded rectangle (hx, hy, corner r) counter-clockwise from the middle of the south side, heading east.
 const cx=hx-r,cy=hy-r,step=2;
 const line=(x0,y0,x1,y1)=>{const n=Math.max(1,Math.round(Math.hypot(x1-x0,y1-y0)/step));for(let k=0;k<n;k++)ring.push([x0+(x1-x0)*k/n,y0+(y1-y0)*k/n]);};
 const arc=(x,y,a0)=>{const n=Math.max(2,Math.round(r*Math.PI/2/step));for(let k=0;k<n;k++){const a=a0+k/n*Math.PI/2;ring.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}};
 line(0,-hy,cx,-hy);arc(cx,-cy,-Math.PI/2);line(hx,-cy,hx,cy);arc(cx,cy,0);line(cx,hy,-cx,hy);arc(-cx,cy,Math.PI/2);line(-hx,cy,-hx,-cy);arc(-cx,-cy,Math.PI);line(-cx,-hy,0,-hy);
 let s=0;const n=ring.length,samples=ring.map((p,i)=>{
  const prev=ring[(i+n-1)%n],next=ring[(i+1)%n],dx=next[0]-prev[0],dy=next[1]-prev[1],l=Math.hypot(dx,dy),row=[+s.toFixed(3),p[0],p[1],0,52,0,0,dx/l,dy/l,-dy/l,dx/l];
  s+=Math.hypot(next[0]-p[0],next[1]-p[1]);return row;
 });
 const terrain={x0:-260,y0:-200,step:10,nx:53,ny:41,z:new Array(53*41).fill(0)};
 return {meta:{id:'arena',name:DRIFT_ARENA.name,arena:true,nominal_m:s,reconstructed_xy_m:s,reconstructed_3d_m:s,samples:n,width_assumed_m:52,elevation_surveyed:false,model_revision:'arena-drift-v1',
  rails:{'-1':[],'1':[]},sections:[[0,'Arena de Drift']],asphalt:{tone:.93,tar:-.25,repair:.05}},columns:['s','x','y','z','width','bank','grade','tx','ty','lx','ly'],samples,terrain};
}

// What this browser keeps of the arena: the free layout, the best marks and the player's map of the keys (tune:
// throttle 0.2-1, steer: the wheels' angle at rest in degrees, drift-physics.js DRIFT_TUNE). Storage may be missing or throw.
export const ARENA_KEY='opala99-arena-drift-v1';
export function loadArenaSave(storage){
 let saved=null;try{saved=JSON.parse(storage?.getItem(ARENA_KEY)||'null');}catch{}
 const bests={};for(const [k,v] of Object.entries(saved?.bests??{}))if(typeof k==='string'&&Number.isFinite(v?.score))bests[k]={score:v.score,pilot:typeof v.pilot==='string'?v.pilot.slice(0,40):'',at:typeof v.at==='string'?v.at:''};
 const t=saved?.tune,num=(v,lo,hi,d)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;
 const tune={throttle:num(t?.throttle,.2,1,1),steer:num(t?.steer,10,49,49)};
 return {layout:saved?.layout?cleanLayout(saved.layout):presetLayout('campeonato'),bests,bestDrift:Number.isFinite(saved?.bestDrift)?saved.bestDrift:0,tune};
}
export function storeArenaSave(storage,save){try{storage?.setItem(ARENA_KEY,JSON.stringify({layout:save.layout,bests:save.bests,bestDrift:save.bestDrift,tune:save.tune}));return true;}catch{return false;}}
