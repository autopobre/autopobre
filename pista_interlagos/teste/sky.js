import * as THREE from 'three';

// Early-afternoon sun from the north-west (southern hemisphere), 45° high: bright and clean,
// shadows still long enough to model the terrain, behind the main grandstand so its roof keeps
// the crowd in the shade, and off to the side of the main straight, so the chase cameras see the
// cars lit from three quarters with their shadows beside them (not flat from behind).
export const SUN_DIRECTION=new THREE.Vector3(-.521,.707,-.478).normalize();
// The world's environment strength (scene.environmentIntensity); the cars' trim, which carries the cars' own map
// (three.js then ignores the scene's strength), keeps it too (car-finish.js TRIM_ENV).
export const WORLD_ENV=1;
// The world's lighting map's sky saturation by time of day (sky.js bake, weather.js times): the shade's skylight near
// grey by day (a cast shadow on asphalt about 25,27,31, the Forza shot's 13,15,18 but lighter), a little colour left at
// dusk, the night's moonlit blue kept. The dome, the fog and the cars' own map keep the sky's colours.
export const WORLD_FILL_SATURATION=Object.freeze({dia:.4,fim_de_tarde:.6,noite:1});
// That map is also the mirror of every world material without a map of its own: the lakes, Floripa's sea and the pits'
// glass mirrored a grey sky. Those wear the sky's full colour instead (skyMirror: the same bake at full saturation, one
// map more while the fill is below 1, the world's own at night), at the scene's strength as before. (Not enumerable:
// a circuit's clean-up, main.js clearCircuit, disposes the textures it finds on the old materials, never the sky's.)
export const SKY_REFLECTION={texture:null,scene:null};
export function skyMirror(material){
 Object.defineProperties(material,{envMap:{get:()=>SKY_REFLECTION.texture,set(){},configurable:true,enumerable:false},
  envMapIntensity:{get:()=>SKY_REFLECTION.scene?.environmentIntensity??WORLD_ENV,set(){},configurable:true,enumerable:false}});
 return material;
}
// Linear-space colours shared by the sky dome, the fog and the environment map.
const ZENITH=new THREE.Color(.07,.22,.54),HORIZON=new THREE.Color(.53,.645,.8),GROUND=new THREE.Color(.19,.205,.155);
const SKY_DETAIL=Object.freeze({basico:{octaves:3,layers:1},leve:{octaves:4,layers:1},completo:{octaves:6,layers:2},denso:{octaves:7,layers:2}});
const detailFor=value=>SKY_DETAIL[typeof value==='boolean'?(value?'leve':'completo'):value]??SKY_DETAIL.completo;

const vertexShader=`
varying vec3 vDirection;
void main(){
 vDirection=position;
 // Rotation only: the dome is always centred on the camera and drawn at the far plane.
 vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0);
 gl_Position=vec4(clip.xy,clip.w*.99999,clip.w);
}`;
const fragmentShader=`
uniform vec3 sunDirection,zenith,horizon,ground,cloudShade,cloudLit,cirrusTint,aureoleTint,silverTint,disc,sunset,city;
uniform float time,cloudCover,environment,stars,band,fill,discScale;
varying vec3 vDirection;
float skyHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y);}
float skyFbm(vec2 p){float value=0.0,amplitude=.5;for(int i=0;i<CLOUD_OCTAVES;i++){value+=amplitude*skyNoise(p);p=p*2.07+vec2(13.1,7.7);amplitude*=.5;}return value;}
void main(){
 vec3 direction=normalize(vDirection);float h=direction.y,mu=dot(direction,sunDirection),towardSun=max(mu,0.0),transmission=1.0;
 vec3 color=mix(horizon,zenith,pow(clamp(h,0.0,1.0),.45));
 // Directional aerial scattering: neutral blue overhead, pearl-grey distance and
 // warm light only near the sun. The opposite horizon stays cool rather than orange.
 // The weather (weather.js) tints that glow: gold and wide at dusk, a faint cool halo round the moon at night.
 float aureole=.014/pow(max(1.0-.94*mu,.065),1.35);
 color+=aureoleTint*(pow(towardSun,6.0)*.14+aureole*.45);
 vec3 horizonLight=horizon+aureoleTint*vec3(.11,.0793,.0323)*pow(towardSun,4.0);
 color=mix(color,horizonLight,exp(-max(h,0.0)*12.0)*.5);
 // Dusk: the band of orange over the horizon on the sun's side, fading up into the blue.
 color+=sunset*pow(towardSun,2.5)*exp(-max(h,0.0)*7.0);
 // Night: São Paulo's sodium light glows low all round, strongest toward the city's centre (north, -z).
 color+=city*exp(-max(h,0.0)*9.0)*(1.0+.6*max(-direction.z,0.0));
 // A few thousand stars, fewer and fainter near the city's glow; they twinkle a little.
 if(stars>0.0&&h>0.0){
  vec3 cell=floor(direction*230.0),f=fract(direction*230.0)-.5;
  float r=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
  vec3 spot=vec3(fract(r*13.1),fract(r*71.7),fract(r*29.3))-.5;
  float star=step(.9925,r)*smoothstep(.2,.02,length(f-spot*.5));
  float bright=pow((r-.9925)/.0075,3.0)*2.2+.12;
  color+=vec3(.85,.9,1.0)*star*bright*stars*(.8+.2*sin(time*(1.3+r*3.0)+r*91.0))*smoothstep(.04,.3,h);
 }
 // environment: 0 the dome, 1 the world's lighting map, 2 the cars' own (the horizon band below).
 float world=min(environment,1.0);
 if(h<0.0)color=mix(horizon,ground,smoothstep(0.0,.18,-h)*world+smoothstep(0.0,.5,-h)*(1.0-world)*.35);
 if(h>0.0){
  #if CLOUD_LAYERS > 1
  // Thin high-altitude cirrus: stretched, separate drift and very low opacity.
  // Only the detailed scenery profiles evaluate this extra layer.
  vec2 high=direction.xz/(h+.18)*vec2(1.5,6.0)+vec2(time*.0014,-time*.0007);
  float wisps=skyNoise(high)*.57+skyNoise(high*2.4+19.0)*.28+skyNoise(high*5.7)*.15;
  float cirrus=smoothstep(.53,.79,wisps)*smoothstep(.02,.25,h)*.23;
  color=mix(color,(vec3(.91,.94,1.0)+vec3(.19,.12,.045)*pow(towardSun,6.0))*cirrusTint,cirrus);
  #endif
  // Lower cumulus: independent broad masses, sun-facing rims and shaded interiors.
  // The offset density approximates light travelling through each cloud mass.
  vec2 uv=direction.xz/(h+.105)*1.55+vec2(time*.0032,time*.0013);
  float density=skyFbm(uv),towards=skyFbm(uv+sunDirection.xz*.16);
  float horizonFade=smoothstep(.012,.18,h);
  float cover=smoothstep(1.0-cloudCover,1.22-cloudCover,density)*horizonFade;
  float thickness=smoothstep(1.01-cloudCover,1.32-cloudCover,density);
  float lit=clamp(.67+(density-towards)*3.8-thickness*.13,.23,1.0);
  vec3 cloud=mix(cloudShade,cloudLit,lit);
  float silver=pow(towardSun,10.0)*(1.0-smoothstep(.3,.86,cover))*cover;
  cloud+=silverTint*(silver*1.7+pow(towardSun,5.0)*.14);
  // At night the cloud's underside takes the city's light.
  cloud+=city*.8*(1.0-lit*.5);
  color=mix(color,cloud,cover*.97);
  transmission=exp(-cover*7.0);
 }
 if(environment>1.5){
  // The cars' map only (carEnvironment): what glossy paint and chrome reflect round the horizon on any
  // circuit (the circuit's own picture, car-reflections.js, replaces it where the Gráficos tab asks); the
  // world's lighting map (stands, walls, water, glass) keeps the plain sky and ground. A dark tree line
  // with grandstand blocks over it, a pale wall at eye level, grey asphalt under it fading into the
  // verge: the horizon line that shapes a body, where a flat ground showed none. Noise read round a
  // circle so the band joins up behind the car; drawn over the low clouds, as trees and stands are.
  vec2 ring=normalize(direction.xz+vec2(1e-5,0.0));
  float trees=.03+.045*skyNoise(ring*7.0+3.1)+.015*skyNoise(ring*29.0+7.7),stands=step(.62,skyNoise(ring*3.0+11.0))*(.11+.04*skyNoise(ring*17.0));
  float top=max(trees,stands),wall=smoothstep(-.036,-.028,h)*(1.0-smoothstep(-.008,-.003,h));
  vec3 band=(stands>trees?mix(vec3(.07,.072,.08),vec3(.22,.22,.23),step(top-.012,h)):vec3(.03,.04,.028))*band;
  // Asphalt a little brighter than the shade's (the circuits' own captures read about .36 sunlit on the grid; a
  // uniform ground that bright greys a whole black body); a soft fill over the band, the bright low sky a flank's
  // shoulder catches.
  if(h<0.0)color=mix(mix(vec3(.18,.185,.19)*band,ground,smoothstep(.05,.45,-h)),vec3(.42,.42,.41)*band,wall);
  else color=mix(band,color*(1.0+.22*(1.0-smoothstep(.1,.35,h))),smoothstep(top-.003,top+.002,h));
 }
 // The world's lighting map: its sky's colour at 'fill' saturation (WORLD_FILL_SATURATION). That map is the shade's
 // whole light (a cast shadow on asphalt lit by the blue zenith alone came out 19,27,40: blue, where a camera, the sun
 // bouncing off the ground round it and a broadcast's white balance give a near grey).
 if(environment>.5&&environment<1.5)color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,fill);
 // A cloud also occludes the solar disc; otherwise it glowed on top of dark clouds. The world's lighting
 // map keeps 10% of it; the cars' 30%: a glint in the paint beside the sun's own highlight, not a second sun.
 // discScale: the dome while the cars' reflection probe or the grid's picture capture it (CAPTURE_SUN).
 color+=disc*smoothstep(.99965,.99986,mu)*(environment>1.5?.3:(1.0-environment*.9)*discScale)*transmission;
 gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function createSky(renderer,scene,{mobile=false,detail=mobile?'leve':'completo'}={}){
 const v3=value=>new THREE.Vector3(...value);
 const uniforms={
  sunDirection:{value:SUN_DIRECTION.clone()},zenith:{value:ZENITH.clone()},horizon:{value:HORIZON.clone()},ground:{value:GROUND.clone()},
  time:{value:0},cloudCover:{value:.47},environment:{value:0},
  // The weather's tints (weather.js weatherProfile().sky); these are the clear day's, the game as it always was.
  cloudShade:{value:v3([.34,.405,.52])},cloudLit:{value:v3([1.08,1.06,1.01])},cirrusTint:{value:v3([1,1,1])},aureoleTint:{value:v3([1,.82,.62])},
  silverTint:{value:v3([1,.85,.65])},disc:{value:v3([22,19,15])},sunset:{value:v3([0,0,0])},city:{value:v3([0,0,0])},stars:{value:0},band:{value:1},fill:{value:WORLD_FILL_SATURATION.dia},discScale:{value:1}
 };
 const quality=detailFor(detail);
 const material=new THREE.ShaderMaterial({name:'Ceu_dinamico',uniforms,vertexShader,fragmentShader,side:THREE.BackSide,depthWrite:false,fog:false,defines:{CLOUD_OCTAVES:quality.octaves,CLOUD_LAYERS:quality.layers}});
 const dome=new THREE.Mesh(new THREE.SphereGeometry(1,48,24),material);
 // Drawn after the opaque world (renderOrder 0), at the far plane: only the pixels nothing covers run its clouds. First,
 // it shaded the whole screen and the ground then painted over most of it (a cheap notebook's video: 3 ms of 28).
 dome.name='Ceu';dome.frustumCulled=false;dome.renderOrder=.5;
 scene.add(dome);
 scene.background=null;
 scene.fog=new THREE.Fog(HORIZON.clone(),mobile?420:520,mobile?2400:3300);
 // Image-based lighting: reflections on paint, glass, rails and water come from the same sky. The maps share the
 // dome's uniforms (only 'environment' is their own), so a new weather draws them again with its own colours.
 const envScene=new THREE.Scene(),envMaterial=material.clone();envMaterial.uniforms={...uniforms,environment:{value:1}};envMaterial.defines={CLOUD_OCTAVES:4,CLOUD_LAYERS:2};
 envScene.add(new THREE.Mesh(dome.geometry,envMaterial));
 let environmentTarget=null,carTarget=null,mirrorTarget=null;
 function bake(){
  const pmrem=new THREE.PMREMGenerator(renderer);
  envMaterial.uniforms.environment.value=1;const world=pmrem.fromScene(envScene,.025);
  // The mirrors' map (SKY_REFLECTION): the world's at full colour, drawn only while its fill greys it.
  const fill=uniforms.fill.value;let mirror=null;
  if(fill<1){uniforms.fill.value=1;mirror=pmrem.fromScene(envScene,.025);uniforms.fill.value=fill;}
  // The cars' own map (car-reflections.js 'ceu' and its fallback): the same sky with the horizon band.
  envMaterial.uniforms.environment.value=2;const cars=pmrem.fromScene(envScene,.025);
  pmrem.dispose();
  const old=[environmentTarget,carTarget,mirrorTarget];environmentTarget=world;carTarget=cars;mirrorTarget=mirror;
  // The world's sky light (the cars carry their own map and strength, car-finish.js): with the hemisphere
  // (main.js skyFill), about a fifth of the sun on open ground, so shade keeps its skylight.
  if(!scene.environment||scene.environment===old[0]?.texture)scene.environment=world.texture;
  SKY_REFLECTION.texture=(mirror??world).texture;SKY_REFLECTION.scene=scene;
  for(const t of old)t?.dispose();
 }
 bake();scene.environmentIntensity=WORLD_ENV;
 const sky={
  dome,get environment(){return environmentTarget.texture;},get carEnvironment(){return carTarget.texture;},sunDirection:uniforms.sunDirection.value,horizon:HORIZON,
  weather:'dia',
  update(dt){uniforms.time.value+=dt;},
  // The sun's disc on the dome as the cars' captures see it (car-reflections.js): 1 back for the main view.
  setCaptureSun(scale=1){uniforms.discScale.value=scale;},
  // The boolean API remains valid; scenery names also distinguish Básico and Ultra.
  setDetail(value){const next=detailFor(value);if(material.defines.CLOUD_OCTAVES!==next.octaves||material.defines.CLOUD_LAYERS!==next.layers){material.defines.CLOUD_OCTAVES=next.octaves;material.defines.CLOUD_LAYERS=next.layers;material.needsUpdate=true;}},
  // A weather (weather.js weatherProfile): the dome's colours, the key light's direction (the moon at night), the fog's
  // colour, and both lighting maps drawn again. key: what the profile is ('dia/seco'...), nothing is redrawn for the same.
  // Returns true when the maps changed: the cars wearing the sky's old map must take the new one (main.js).
  setWeather(profile,key=`${profile.time}/${profile.rain}`){
   if(key===sky.weather)return false;sky.weather=key;const k=profile.sky;
   uniforms.sunDirection.value.fromArray(profile.sun.direction).normalize();
   uniforms.zenith.value.setRGB(...k.zenith);uniforms.horizon.value.setRGB(...k.horizon);uniforms.ground.value.setRGB(...k.ground);uniforms.cloudCover.value=k.cloudCover;
   for(const name of ['cloudShade','cloudLit','disc','sunset','city'])uniforms[name].value.fromArray(k[name]);
   uniforms.cirrusTint.value.fromArray(k.cirrus);uniforms.aureoleTint.value.fromArray(k.aureole);uniforms.silverTint.value.fromArray(k.silver);
   uniforms.stars.value=k.stars;uniforms.band.value=k.band;uniforms.fill.value=WORLD_FILL_SATURATION[profile.time]??1;
   scene.fog.color.setRGB(...profile.fog.color);
   bake();return true;
  },
  dispose(){scene.remove(dome);dome.geometry.dispose();material.dispose();envMaterial.dispose();if(scene.environment===environmentTarget.texture)scene.environment=null;
   if(SKY_REFLECTION.scene===scene){SKY_REFLECTION.texture=null;SKY_REFLECTION.scene=null;}environmentTarget.dispose();carTarget.dispose();mirrorTarget?.dispose();},
  info:()=>({clouds:uniforms.cloudCover.value,cloudOctaves:material.defines.CLOUD_OCTAVES,cloudLayers:material.defines.CLOUD_LAYERS,environment:!!scene.environment,fog:[scene.fog.near,scene.fog.far],weather:sky.weather,stars:uniforms.stars.value})
 };
 return sky;
}
