// Arena de Drift's place in main.js's circuit loading: the stadium (drift-arena-stadium.js) and what the circuits'
// loading expects of a venue (cameras' obstacles, the crowd's steps, the floodlights for the night, the TV camera
// spots, a landscape with nothing in it). If the stadium cannot be built, a plain floor and wall stand in for it.
import * as THREE from 'three';
import {ARENA,floorEdge,floorOutline} from './drift-arena.js';
import {FLOOR_Y} from './drift-arena-props.js';

// The asphalt shader's coordinates for the floor (track-surface.js roadData: d, s, width, path): the floor's y across,
// its x along, wide enough (160 m) that no edge line, edge grit or racing line is ever drawn on it.
export function floorRoadData(x,y){return [y,x+1000,160,10000];}
export function floorGeometry(step=2){
 const {halfLength:A,halfWidth:B}=ARENA,nx=Math.ceil(A*2/step),ny=Math.ceil(B*2/step),pos=[],uv=[],road=[];
 // A grid over the floor's box; the cells the rounded corners leave out are dropped, the edge cells pulled onto the wall.
 const vertex=(x,y)=>{const e=floorEdge(x,y);if(e.d>0){x-=e.nx*e.d;y-=e.ny*e.d;}pos.push(x,FLOOR_Y,-y);uv.push(x/2,-y/2);road.push(...floorRoadData(x,y));};
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const x0=-A+i*step,y0=-B+j*step,x1=x0+step,y1=y0+step;if(floorEdge((x0+x1)/2,(y0+y1)/2).d>step*.75)continue;
  for(const [x,y] of [[x0,y0],[x1,y0],[x1,y1],[x0,y0],[x1,y1],[x0,y1]])vertex(x,y);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('roadData',new THREE.Float32BufferAttribute(road,4));g.computeVertexNormals();
 return g;
}
export function arenaLandscape(){
 const root=new THREE.Group();root.name='Arena_sem_paisagem';
 return {root,stats:{arena:true},clearAround(){},trunks:()=>[],dispose(){},setRealisticWater(){},revealWaves(){},compileWater:async()=>{},digLakeBeds:()=>false,water:{at:()=>null},waterInfo:()=>null,update(){}};
}
export async function oldStockPicture(){const t=await new THREE.TextureLoader().loadAsync('./assets/branding/old_stock_preparada_v1.jpg');t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}

export async function createArenaScene({renderer,roadSurface,textures,mobile=false}){
 let stadium=null;
 try{const {createArenaStadium}=await import('./drift-arena-stadium.js');stadium=await createArenaStadium({renderer,roadSurface,textures,mobile});}
 catch(err){console.warn('Estádio da arena indisponível; piso simples.',err);}
 stadium??=plainStadium(roadSurface,textures);
 const root=stadium.root;root.name||='Arena_estadio';
 // The floodlights as main.js's floods (floodlights.js): the stadium's lamps and glow.
 const floodRoot=new THREE.Group();floodRoot.name='Arena_refletores';let level=0;
 const floods=stadium.lamps?.length?{root:floodRoot,lamps:stadium.lamps,setLevel(v){level=Math.max(0,Math.min(1,v));stadium.setLights?.(level);},get level(){return level;},info:()=>({masts:stadium.lamps.length,level})}:null;
 return {root,obstacles:stadium.obstacles??[],crowdSteps:stadium.crowdSteps??[],floods,stats:stadium.stats??{},
  setScreens:lines=>stadium.setScreens?.(lines),
  // The TV cameras on the stands (tv-camera.js towers): each at the lap distance of the floor's station nearest it.
  towers(data){
   const spots=stadium.tvSpots?.length?stadium.tvSpots:defaultSpots();
   return spots.map(t=>{let best=Infinity,s=0;for(const p of data.samples){const d=(p[1]-t.position.x)**2+(p[2]+t.position.z)**2;if(d<best){best=d;s=p[0];}}return {s,position:t.position.clone()};});
  }};
}
function defaultSpots(){return floorOutline(9,1).filter((_,i,a)=>i%Math.round(a.length/12)===0).map(([x,y])=>({position:new THREE.Vector3(x,7,-y)}));}
// The stand-in: the floor and a plain concrete wall, so the arena works without its stadium.
function plainStadium(roadSurface,textures){
 const root=new THREE.Group();root.name='Arena_estadio_simples';
 const floor=new THREE.Mesh(floorGeometry(),roadSurface.material);floor.name='Piso_arena';floor.receiveShadow=true;root.add(floor);
 const ring=floorOutline(0,1.5),outer=floorOutline(ARENA.wallThick,1.5),pos=[],idx=[],H=ARENA.wallHeight;
 for(let i=0;i<ring.length;i++){const [x,y]=ring[i],[ox,oy]=outer[i];pos.push(x,0,-y,x,H,-y,ox,H,-oy,ox,0,-oy);const a=i*4,b=((i+1)%ring.length)*4;idx.push(a,b,a+1,b,b+1,a+1,a+1,b+1,a+2,b+1,b+2,a+2);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const wall=new THREE.Mesh(g,new THREE.MeshStandardMaterial({name:'Concreto',color:0xbdb8ad,roughness:.9,side:THREE.DoubleSide}));wall.name='Muro_arena';wall.castShadow=wall.receiveShadow=true;root.add(wall);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({name:'Chao_fora',map:textures?.concrete??null,color:0x9a958a,roughness:.95}));
 if(ground.material.map){ground.material.map=ground.material.map.clone();ground.material.map.repeat.set(400,400);ground.material.map.needsUpdate=true;}
 ground.position.y=-.05;ground.receiveShadow=true;root.add(ground);
 return {root,obstacles:[wall],crowdSteps:[],lamps:[],stats:{plain:true}};
}
