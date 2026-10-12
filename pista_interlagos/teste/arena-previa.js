// Dev only (never published): arena-previa.html's scene: the drift arena's stadium with the game's sky, sun, asphalt and
// crowd, seen from the camera the address picks. Sets window.__previa when the picture is ready.
import * as THREE from 'three';
import {createSky,SUN_DIRECTION} from './sky.js';
import {createTrackSurface} from './track-surface.js';
import {loadTerrainTextures,createCrowd} from './landscape.js';
import {createArenaData,floorEdge} from './drift-arena.js';
import {createArenaStadium} from './drift-arena-stadium.js';
import {weatherProfile} from './weather.js';
import {lampPatch,updateRoadLamps} from './headlights.js';
import {CarShadow} from './car-shadow.js';

const q=new URLSearchParams(location.search),vista=q.get('vista')||'canto',night=q.get('noite')==='1'||vista==='noite',mobile=q.get('mobile')==='1';
// Cameras: position and target in plan (x east, y north, height), and the lens.
const VIEWS={
 cima:{pos:[0,0,330],at:[0,0,0],fov:36,up:'north'},
 canto:{pos:[185,-150,105],at:[0,0,0],fov:40},
 piso:{pos:[-62,-22,1.6],at:[40,8,5],fov:62},
 noite:{pos:[-62,-22,1.6],at:[40,8,5],fov:62},
 arquibancada:{pos:[12,64.5,9.5],at:[-18,-35,2],fov:66},
 muro:{pos:[18,-44.5,1.2],at:[46,-49.6,1.2],fov:58},
 tunel:{pos:[-45,4,2.2],at:[-100,0,9],fov:55},
 telao:{pos:[30,-10,3],at:[97,0,17],fov:42},
 fora:{pos:[260,170,60],at:[0,0,10],fov:45},
 gente:{pos:[42,30,1.7],at:[66,47,1.6],fov:50},
 apron:{pos:[66,26,7],at:[82,39,1],fov:50},
 vomitorio:{pos:[-20,-20,4],at:[-16,-62,8],fov:50}
};
const view=VIEWS[vista]??VIEWS.canto;
const W=+q.get('w')||1600,H=+q.get('h')||900;
const canvas=document.getElementById('view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(1);renderer.setSize(W,H,false);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.78;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(view.fov,W/H,.3,6000);
const sky=createSky(renderer,scene,{mobile});
const fill=new THREE.HemisphereLight('#c4d8f2','#4c4a38',.45);scene.add(fill);
const sun=new THREE.DirectionalLight('#fff1e2',7);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);
const reach=vista==='cima'||vista==='canto'||vista==='fora'?180:130;Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:1,far:700});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;
sun.position.copy(SUN_DIRECTION).multiplyScalar(320);sun.target.position.set(0,0,0);scene.add(sun,sun.target);
const info=document.getElementById('info');
async function main(){
 const t0=performance.now();
 const data=createArenaData(),[roadSurface,textures]=await Promise.all([createTrackSurface(renderer,data),loadTerrainTextures(renderer)]);
 const stadium=await createArenaStadium({renderer,roadSurface,textures,mobile});scene.add(stadium.root);
 let fans=0;if(q.get('torcida')!=='0'){const crowd=createCrowd(stadium.crowdSteps,{mobile});scene.add(crowd.root);fans=crowd.count;}
 // A car-sized box for scale on the floor.
 const car=new THREE.Mesh(new THREE.BoxGeometry(4.6,1.35,1.8),new THREE.MeshStandardMaterial({color:0x9b1616,roughness:.35,metalness:.3}));car.position.set(-30,.72,12);car.rotation.y=.4;car.castShadow=true;scene.add(car);
 stadium.setScreens(q.get('tela')?q.get('tela').split('|'):['ARENA DE DRIFT','DRIFT 1.240','RECORDE 3.880']);
 const [px,py,ph]=view.pos,[tx,ty,th]=view.at;camera.position.set(px,ph,-py);if(view.up==='north')camera.up.set(0,0,-1);camera.lookAt(tx,th,-ty);camera.updateMatrixWorld();
 if(night){
  const w=weatherProfile('noite');sky.setWeather(w);sun.color.set(w.sun.color);sun.intensity=w.sun.intensity;sun.position.fromArray(w.sun.direction).normalize().multiplyScalar(320);
  fill.color.set(w.fill.sky);fill.groundColor.set(w.fill.ground);fill.intensity=w.fill.intensity;scene.environmentIntensity=w.environment;renderer.toneMappingExposure=w.exposure;
  scene.fog.color.setRGB(...w.fog.color);stadium.setLights(1);lampPatch(roadSurface.material);updateRoadLamps([],camera.position,24,1,stadium.lamps,8);
  // headlights.js tints every lamp with a negative edge (dir.w) red, floods included: here (preview only) the white ones
  // (positive strength) stay white, as the game would show them once that is fixed.
  if(q.get('tinta')!=='0'){const m=roadSurface.material,before=m.onBeforeCompile,key=m.customProgramCacheKey;m.onBeforeCompile=function(shader,r){before.call(this,shader,r);shader.fragmentShader=shader.fragmentShader.replace('tint=vec3(1.0,.04,.015);}','tint=lp.w>0.0?vec3(1.0,.96,.9):vec3(1.0,.04,.015);}');};m.customProgramCacheKey=function(){return key.call(this)+'|previa-branco';};m.needsUpdate=true;}
 }
 const built=performance.now()-t0;
 // The ground shaders sample the cars' shadow map: the game's idle one (car-shadow.js), cleared to lit.
 const carShadow=new CarShadow(SUN_DIRECTION);try{carShadow.update(renderer,[]);}catch(err){console.warn(err);}
 renderer.compile(scene,camera);
 for(let i=0;i<3;i++){renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(r));}
 renderer.info.reset();renderer.info.autoReset=false;renderer.render(scene,camera);
 const r=renderer.info.render;
 window.__previa={vista,night,mobile,fans,built:Math.round(built),calls:r.calls,triangles:r.triangles,stats:stadium.stats,tvSpots:stadium.tvSpots.map(t=>t.position.toArray().map(v=>+v.toFixed(2))),lamps:stadium.lamps.map(l=>({pos:l.pos.toArray().map(v=>+v.toFixed(1)),strength:l.strength}))};
 info.textContent=q.get('hud')==='1'?`${vista}${night?' noite':''} · ${r.calls} draws · ${(r.triangles/1e6).toFixed(2)} M tri · ${fans} torcedores`:'';
 renderer.info.autoReset=true;
 // ?teste=tv: how much of the floor each TV spot sees past the cameras' obstacles (a ray from a car's roof, 1.5 m up).
 if(q.get('teste')==='tv'){
  const ray=new THREE.Raycaster(),pts=[];for(let x=-82;x<=82;x+=6)for(let y=-47;y<=47;y+=6)if(floorEdge(x,y).d<-1)pts.push(new THREE.Vector3(x,1.5,-y));
  const seen=pts.map(()=>0),each=stadium.tvSpots.map(t=>{let n=0;pts.forEach((p,i)=>{const d=t.position.clone().sub(p),L=d.length();ray.set(p,d.normalize());ray.far=L;if(!ray.intersectObjects(stadium.obstacles,false).length){n++;seen[i]++;}});return +(n/pts.length).toFixed(2);});
  window.__previa.tv={each,points:pts.length,none:seen.filter(v=>v===0).length,atLeast3:+(seen.filter(v=>v>=3).length/pts.length).toFixed(2)};
 }
}
main().catch(err=>{console.error(err);window.__previa={error:String(err&&err.stack||err)};});
