import * as THREE from 'three';

// Film look for the whole game: the scene is drawn in linear HDR into an
// off-screen target, then ambient occlusion, São Paulo haze, bloom, the sun's
// lens glare, tone mapping and a colour grade are applied in a few screen passes.
// 'full' runs everything (desktop), 'lite' keeps only the haze and the grade
// (phones), 'off' draws straight to the screen as before.
// Within those, the Gráficos tab switches parts on and off (setFeatures): the occlusion and the
// lens (bloom, sun glare, depth of field) of 'full', the speed smear and the multisampling.
export const CINEMATIC_LEVELS=['full','lite','off'];
export const CINEMATIC_FEATURES=Object.freeze({ao:true,lens:true,motionBlur:true,samples:4});
// Expensive effects scale independently of the drawing buffer. Alto keeps the HDR
// picture crisp while its soft bloom runs at quarter resolution; Ultra spends more
// on contact shadows and the lens. No temporal history or frame-rate cap is needed.
export const CINEMATIC_QUALITY=Object.freeze({
 baixo:Object.freeze({aoSamples:8,bloomScale:4,bloomLevels:3,clarity:0}),
 medio:Object.freeze({aoSamples:10,bloomScale:4,bloomLevels:4,clarity:.08}),
 alto:Object.freeze({aoSamples:12,bloomScale:4,bloomLevels:4,clarity:.12}),
 ultra:Object.freeze({aoSamples:20,bloomScale:2,bloomLevels:5,clarity:.15})
});

// Colour grade and lens, in one place so the look can be tuned without touching the shaders.
export const LOOK={
 exposure:1.0,
 // Eye adaptation: the mean scene brightness it aims for, how far it may push the exposure
 // (dark cockpit, garages; down for wide sunlit views under the strong sun) and how fast it
 // follows, per second.
 adaptKey:.16,adaptRange:[.72,1.65],adaptSpeed:1.35,
 // Clear-day white balance: a touch warm in the sun, slightly cooler shadows; a clean, saturated,
 // contrasty picture like a race broadcast on a sunny day.
 whiteBalance:[1.015,1.0,.985],
 saturation:1.06,greenSaturation:.9,contrast:1.16,
 // toe: below mid grey the contrast eases into black, reaching it at this slope, instead of clipping.
 // The clip turned all under about 7% (the shade of a car on the asphalt, tyres, wheel wells) pure black,
 // and after the filmic curve's own toe the sky's fill in a cast shadow (a fifth of the sun) sank to
 // about 5%; a little over 1 gives that shade its skylight back, black stays black. At 1.4 (with the occlusion's
 // floor) the whole frame went milky: its darkest twentieth at L 17-26, the Forza shot's at 2.
 toe:1.12,
 shadowTint:[.975,.995,1.03],highlightTint:[1.025,1.0,.965],
 vignette:.12,grain:.007,aberration:.00035,
 // Bloom: hot highlights only (sun on chrome and clear coat), averaged so a single glinting pixel
 // cannot flicker the glow on and off. The threshold is in exposed units (after eye adaptation):
 // sunlit white paint and asphalt reach about 1.4, specular glints far more.
 bloom:.12,bloomThreshold:1.8,bloomKnee:.65,
 // Ambient occlusion: radius in metres, strength and the distance it fades out. A surface
 // drawn with alpha -1 (the door mirrors' glass) shows light from elsewhere and takes no
 // occlusion; materials write 0..1 there (foliage and lake water their cut-out alpha).
 aoRadius:1.35,aoIntensity:2.4,aoBias:.18,aoFade:[85,180],
 // The occlusion multiplies the whole picture (sun included): its floor keeps some sky in the deepest
 // shade, under a car or a stand, so a cast shadow never goes to black.
 aoFloor:.35,
 // Aerial perspective: metres of clear air, density of the haze and how fast it thins with height.
 hazeDensity:.00014,hazeFalloff:.012,hazeStart:140,hazeColor:[.59,.67,.77],hazeSun:[1.0,.83,.63],
 // Sun through the lens: players lost the road to it, so the glow and streak stay modest.
 // ghosts: the lens's reflections of the sun, mirrored through the centre (half the old .05×flare).
 flare:.34,streak:.14,ghosts:.0085,
 // 0 picture, 1 occlusion only (for tuning).
 debug:0
};

// Speed smear (Desfoque de velocidade), driven by the camera's own motion and not the car's speed, so a paused
// frame, a cut, the photo and the podium are sharp: shutter (s) of the streak; it builds from 'from' to 'full'
// of the followed car's top speed (the Fusca feels it as the Opala does) along a gentle curve (t^curve: the Opala at
// 130 km/h about .7, so the mid-speed corners stream too), eased over 'ease' s; it starts 'near'
// metres from the lens (the asphalt under the bottom of the frame) and is capped at 'cap' of the picture's size
// close by and 'farCap' past about 20 m, so the crowd stays legible. SMEAR_CARS: the cars kept sharp (cinematic
// render context smearCars, main.js).
export const SPEED_SMEAR=Object.freeze({shutter:1/360,from:.18,full:.75,curve:1.1,ease:.15,near:1.5,cap:.032,farCap:.008,cut:150});
// The phones' road smear (render context roadSmear: Médio's film look with the full smear off): only the near road,
// three taps of colour with no depth per tap (the riding cars' boxes alone keep them out), nothing past about 20 m.
export const ROAD_SMEAR=Object.freeze({taps:3,cap:.022,farCap:0});
// Eight: in a lap-one pack the 5th to 8th car ahead smeared like scenery (a soft ghost at 30-60 m) with four.
export const SMEAR_CARS=8;
// The smear's strength for a camera moving at speed (m/s) behind a car with this top speed.
export function smearStrength(speed,top=60){const t=THREE.MathUtils.clamp((speed/Math.max(top,1)-SPEED_SMEAR.from)/(SPEED_SMEAR.full-SPEED_SMEAR.from),0,1);return t**SPEED_SMEAR.curve;}
const vertexShader=`varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.0,1.0);}`;
const depthCommon=`
uniform sampler2D tDepth;uniform float cameraNear,cameraFar;uniform vec2 projScale,depthSize;
float viewZAt(vec2 uv){float d=texture2D(tDepth,uv).x;return (cameraNear*cameraFar)/((cameraFar-cameraNear)*d-cameraFar);}
// Positions are rebuilt at depth texel centres, so position and depth always belong to the same pixel.
vec3 viewPosAt(vec2 uv){uv=(floor(uv*depthSize)+.5)/depthSize;float z=viewZAt(uv);return vec3((uv*2.0-1.0)*(-z)/projScale,z);}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
`;

// Scalable ambient obscurance from the depth buffer alone (normals rebuilt from
// depth), at half resolution; the linear depth rides along for the blur.
const aoShader=`${depthCommon}
uniform vec2 fullTexel;uniform float radius,intensity,bias,frame;uniform vec2 fade;
varying vec2 vUv;
void main(){
 float d=texture2D(tDepth,vUv).x;
 if(d>=1.0){gl_FragColor=vec4(1.0,1e5,0.0,1.0);return;}
 vec3 p=viewPosAt(vUv);float dist=-p.z;
 if(dist>fade.y){gl_FragColor=vec4(1.0,dist,0.0,1.0);return;}
 // Normal from depth over a 2-pixel baseline, taking the flatter side at creases.
 vec2 e=fullTexel*2.0;
 vec3 l=viewPosAt(vUv-vec2(e.x,0.0)),r=viewPosAt(vUv+vec2(e.x,0.0)),b=viewPosAt(vUv-vec2(0.0,e.y)),t=viewPosAt(vUv+vec2(0.0,e.y));
 vec3 dx=abs(r.z-p.z)<abs(p.z-l.z)?r-p:p-l,dy=abs(t.z-p.z)<abs(p.z-b.z)?t-p:p-b;
 vec3 n=normalize(cross(dx,dy));
 // World radius grows a little with distance so far scenery keeps some contact shading.
 float rad=radius*(1.0+dist*.012),screenR=min(rad*projScale.y*.5/dist,.12);
 float spin=ign(gl_FragCoord.xy)*6.2831853,sum=0.0;
 for(int i=0;i<SAMPLES;i++){
  float a=(float(i)+.5)/float(SAMPLES),ang=a*37.699+spin;
  vec2 o=vec2(cos(ang),sin(ang))*sqrt(a)*screenR;o.x*=fullTexel.x/fullTexel.y;
  vec3 s=viewPosAt(vUv+o)-p;float len=length(s);
  // Ignore the tiny depth steps between terrain triangles (polygon offset) and grazing noise.
  float lift=dot(s,n)-bias*len-.004*dist;
  sum+=max(lift/max(len,1e-4),0.0)*(1.0-smoothstep(rad*.6,rad*1.4,len));
 }
 float ao=clamp(1.0-sum*intensity/float(SAMPLES),0.0,1.0);
 ao=mix(ao,1.0,smoothstep(fade.x,fade.y,dist));
 gl_FragColor=vec4(ao,dist,0.0,1.0);
}`;
// Depth-aware separable blur of the occlusion.
const blurShader=`uniform sampler2D tInput;uniform vec2 direction;varying vec2 vUv;
void main(){
 vec4 c=texture2D(tInput,vUv);float z=c.g,sum=c.r,weight=1.0;
 for(int i=1;i<=4;i++){for(int k=-1;k<=1;k+=2){
  vec4 s=texture2D(tInput,vUv+direction*float(i*k));
  float w=exp(-float(i*i)*.11)*exp(-abs(s.g-z)/(.02*z+.08));sum+=s.r*w;weight+=w;}}
 gl_FragColor=vec4(sum/weight,z,0.0,1.0);
}`;
// Bloom: soft-threshold prefilter and a dual-filter pyramid.
// Each tap is weighted by 1/(1+luma) (Karis): a sub-pixel glint on chrome or clear coat, there one
// frame and gone the next, adds a small steady glow instead of a flashing blob. The threshold is
// on the picture as exposed (the last frame's eye adaptation): white paint and lines in full sun
// stay under it on every circuit and in the dark cockpit alike, only specular glints cross it.
// Each tap is thresholded before the average: a brake lamp a few pixels wide (brake-lights.js, its
// lens brighter than white on purpose) keeps its glow instead of being averaged under the threshold.
const prefilterShader=`uniform sampler2D tInput,tExposure;uniform vec2 texel,adaptRange;uniform float threshold,knee,adaptKey,exposure,adapted;varying vec2 vUv;
vec3 bright(vec3 c,float scale){c=min(c,vec3(60.0));float br=max(c.r,max(c.g,c.b))*scale,soft=clamp(br-threshold+knee,0.0,2.0*knee);soft=soft*soft/(4.0*knee+1e-4);return c*max(soft,br-threshold)/max(br,1e-4);}
vec4 karis(vec3 c){return vec4(c,1.0)/(1.0+dot(c,vec3(.2126,.7152,.0722)));}
void main(){
 float scale=exposure*mix(1.0,clamp(adaptKey/exp(texture2D(tExposure,vec2(.5)).r),adaptRange.x,adaptRange.y),adapted);
 vec4 s=karis(bright(texture2D(tInput,vUv+texel*vec2(-.5,-.5)).rgb,scale))+karis(bright(texture2D(tInput,vUv+texel*vec2(.5,-.5)).rgb,scale))+karis(bright(texture2D(tInput,vUv+texel*vec2(-.5,.5)).rgb,scale))+karis(bright(texture2D(tInput,vUv+texel*vec2(.5,.5)).rgb,scale));
 gl_FragColor=vec4(s.rgb/s.a,1.0);
}`;
const downShader=`uniform sampler2D tInput;uniform vec2 texel;varying vec2 vUv;
void main(){vec3 c=texture2D(tInput,vUv).rgb*4.0;
 c+=texture2D(tInput,vUv-texel).rgb+texture2D(tInput,vUv+texel).rgb+texture2D(tInput,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(tInput,vUv-vec2(texel.x,-texel.y)).rgb;
 gl_FragColor=vec4(c*.125,1.0);}`;
const upShader=`uniform sampler2D tInput,tBase;uniform vec2 texel;varying vec2 vUv;
void main(){vec3 c=vec3(0.0);
 c+=texture2D(tInput,vUv+vec2(-texel.x*2.0,0.0)).rgb+texture2D(tInput,vUv+vec2(texel.x*2.0,0.0)).rgb+texture2D(tInput,vUv+vec2(0.0,-texel.y*2.0)).rgb+texture2D(tInput,vUv+vec2(0.0,texel.y*2.0)).rgb;
 c+=(texture2D(tInput,vUv+texel).rgb+texture2D(tInput,vUv-texel).rgb+texture2D(tInput,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(tInput,vUv-vec2(texel.x,-texel.y)).rgb)*2.0;
 // Energy stays bounded across pyramid levels, avoiding a grey veil over the road.
 gl_FragColor=vec4(mix(texture2D(tBase,vUv).rgb,c/12.0,.65),1.0);}`;
// Depth of field: a quarter-resolution copy of the picture, spread back to half resolution.
const tentShader=`uniform sampler2D tInput;uniform vec2 texel;varying vec2 vUv;
void main(){vec3 c=texture2D(tInput,vUv).rgb*4.0;
 c+=(texture2D(tInput,vUv+vec2(texel.x,0.0)).rgb+texture2D(tInput,vUv-vec2(texel.x,0.0)).rgb+texture2D(tInput,vUv+vec2(0.0,texel.y)).rgb+texture2D(tInput,vUv-vec2(0.0,texel.y)).rgb)*2.0;
 c+=texture2D(tInput,vUv+texel).rgb+texture2D(tInput,vUv-texel).rgb+texture2D(tInput,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(tInput,vUv-vec2(texel.x,-texel.y)).rgb;
 gl_FragColor=vec4(c/16.0,1.0);}`;
// How much of the sun disc is unobstructed (sky pixels around its screen position).
const sunShader=`uniform sampler2D tDepth,tColor;uniform vec2 sunUV,aspect;varying vec2 vUv;
void main(){float seen=0.0;
 for(int j=-4;j<=4;j++)for(int i=-4;i<=4;i++){vec2 uv=sunUV+vec2(float(i),float(j))*.0028*aspect;
  // Clouds occupy the sky's depth, so depth alone cannot hide their lens flare.
  float disc=smoothstep(1.6,5.0,dot(texture2D(tColor,uv).rgb,vec3(.2126,.7152,.0722)));
  seen+=(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)?0.0:step(1.0,texture2D(tDepth,uv).x)*disc;}
 gl_FragColor=vec4(seen/81.0,0.0,0.0,1.0);}`;

// Mean log luminance of 16x16 screen cells (4x4 samples each).
const lumShader=`uniform sampler2D tInput;varying vec2 vUv;
void main(){float s=0.0;
 for(int j=0;j<4;j++)for(int i=0;i<4;i++){vec3 c=texture2D(tInput,vUv+(vec2(float(i),float(j))-1.5)/64.0).rgb;s+=log(max(dot(c,vec3(.2126,.7152,.0722)),1e-4));}
 gl_FragColor=vec4(s/16.0,0.0,0.0,1.0);}`;
// Centre-weighted mean, eased toward over time: the exposure follows the eye, not every frame.
const adaptShader=`uniform sampler2D tLum,tPrev;uniform float rate;varying vec2 vUv;
void main(){float sum=0.0,wsum=0.0;
 for(int j=0;j<16;j++)for(int i=0;i<16;i++){vec2 uv=(vec2(float(i),float(j))+.5)/16.0;float w=1.0-.7*smoothstep(.15,.7,length((uv-.5)*vec2(1.0,1.3)));sum+=texture2D(tLum,uv).r*w;wsum+=w;}
 float now=sum/wsum,before=texture2D(tPrev,vec2(.5)).r;
 gl_FragColor=vec4(rate>=1.0?now:before+(now-before)*rate,0.0,0.0,1.0);}`;

const compositeShader=`${depthCommon}
uniform sampler2D tColor,tAO,tBloom,tSun,tExposure,tDof;uniform float dofFocus,dofAmount;uniform float adaptKey;uniform vec2 adaptRange;
uniform vec2 resolution,aoSize;uniform mat4 cameraWorld;uniform vec3 camPos,sunDir;uniform vec2 sunUV;uniform float sunFront;
uniform float debugView,exposure,time,frame,speedBlur,aoStrength,bloomStrength,vignette,grain,aberration,saturation,greenSaturation,contrast,toe,aoFloor,flare,streak,ghosts,clarity;
uniform vec3 whiteBalance,shadowTint,highlightTint,hazeColor,hazeSun;uniform float hazeDensity,hazeFalloff,hazeStart,hazeBase;
uniform vec3 smearShift;uniform vec4 smearBoxes[${SMEAR_CARS}],smearPlanes[${SMEAR_CARS}];uniform float smearFar[${SMEAR_CARS}];uniform vec4 smearReach;
varying vec2 vUv;
// The cars riding with the camera (speed smear): inside one's screen box, standing above the road under it and
// nearer than its far end; the road inside the box is still the road and smears like the rest. The slots are filled
// in order (updateSmear), so the first empty one ends the list: a lone car costs one pass, not SMEAR_CARS.
float riding(vec2 p,vec3 v){
 for(int i=0;i<${SMEAR_CARS};i++){vec4 b=smearBoxes[i];if(b.z<=b.x)break;
  if(p.x>b.x&&p.x<b.z&&p.y>b.y&&p.y<b.w&&-v.z<smearFar[i]&&dot(smearPlanes[i].xyz,v)-smearPlanes[i].w>.12)return 1.0;}
 return 0.0;}
// The road smear's cheaper test (no depth): inside any riding car's box.
float boxed(vec2 p){
 for(int i=0;i<${SMEAR_CARS};i++){vec4 b=smearBoxes[i];if(b.z<=b.x)break;if(p.x>b.x&&p.x<b.z&&p.y>b.y&&p.y<b.w)return 1.0;}
 return 0.0;}
vec3 RRTAndODTFit(vec3 v){vec3 a=v*(v+.0245786)-.000090537,b=v*(.983729*v+.432951)+.238081;return a/b;}
vec3 aces(vec3 c){
 const mat3 i=mat3(vec3(.59719,.076,.0284),vec3(.35458,.90834,.13383),vec3(.04823,.01566,.83777));
 const mat3 o=mat3(vec3(1.60475,-.10208,-.00327),vec3(-.53108,1.10813,-.07276),vec3(-.07367,-.00605,1.07602));
 return clamp(o*RRTAndODTFit(i*c/.6),0.0,1.0);}
vec3 toSRGB(vec3 c){c=max(c,vec3(0.0));return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(.0031308,c));}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
 vec2 uv=vUv,fromCenter=uv-.5;float edge=dot(fromCenter,fromCenter);
 // Lens: slight colour fringing toward the frame edges.
 vec2 ca=fromCenter*edge*aberration*4.0;
 vec4 center=texture2D(tColor,uv);
 vec3 color=vec3(texture2D(tColor,uv+ca).r,center.g,texture2D(tColor,uv-ca).b);
 float d=texture2D(tDepth,uv).x;
 vec3 viewPos=viewPosAt(uv);vec3 ray=normalize(mat3(cameraWorld)*viewPos);
 float dist=d>=1.0?1e5:length(viewPos);
 #ifdef DETAIL
 // Bounded local contrast recovers fine asphalt/foliage at reduced resolution.
 // Avoid sharpening the sky, glass and nearby cockpit, or generating edge halos.
 if(d<1.0&&dist>3.5&&center.a>=0.0){
  vec2 px=1.0/resolution;
  vec3 n=texture2D(tColor,uv+vec2(0.0,px.y)).rgb,s=texture2D(tColor,uv-vec2(0.0,px.y)).rgb;
  vec3 e=texture2D(tColor,uv+vec2(px.x,0.0)).rgb,w=texture2D(tColor,uv-vec2(px.x,0.0)).rgb;
  vec3 low=min(color,min(min(n,s),min(e,w))),high=max(color,max(max(n,s),max(e,w)));
  vec3 detail=clamp(color-(n+s+e+w)*.25,-vec3(.08),vec3(.08));
  color=clamp(color+detail*clarity,low,high);
 }
 #endif
 // Speed smear (SPEED_SMEAR): the still world as it streams past the moving camera during a short shutter
 // (smearShift: the camera's own travel in view space), so the near asphalt and the road's edges smear most and
 // the far crowd hardly at all (a mid-distance cap keeps it legible); the cars riding with the camera stay sharp.
 if(speedBlur>.001&&d<1.0&&center.a>=0.0&&dist>smearReach.x&&riding(uv,viewPos)<.5){
  float z=-viewPos.z;vec3 q=viewPos-smearShift;
  vec2 flow=(projScale*q.xy/max(-q.z,.05)-projScale*viewPos.xy/z)*.5;
  float len=length(flow),cap=mix(smearReach.y,smearReach.z,smoothstep(8.0,22.0,z))*smoothstep(smearReach.x,smearReach.x+.6,dist);
  if(len>cap)flow*=cap/len;
  if(min(len,cap)*resolution.y>1.5){
   // Six taps across the shutter (smearReach.w; the phones' road smear three, colour only), centred on now,
   // jittered per pixel so they never band, the pattern moved every frame (a still one printed a halftone dot screen
   // on hard edges: a car's shadow, the kerb's colour join, the bonnet's edge). Where the shutter's two ends differ a
   // lot the dither read as dots: there it goes as the taps close up (a step under two or three pixels is no band).
   // (The halftone left on a cast shadow's edge is the sun shadow's own: three.js turns its five PCF taps by a still
   // per-pixel noise.)
   float taps=smearReach.w;bool full=taps>4.5;
   float jitter=ign(gl_FragCoord.xy+frame*5.588)-.5;
   if(full){float a=luma(texture2D(tColor,clamp(uv-flow*.5,vec2(.001),vec2(.999))).rgb),b=luma(texture2D(tColor,clamp(uv+flow*.5,vec2(.001),vec2(.999))).rgb);
    jitter*=1.0-smoothstep(.15,.5,abs(a-b)/(a+b+.05))*(1.0-smoothstep(2.0,5.0,min(len,cap)*resolution.y/taps));}
   // Next to a car kept sharp (its box, a pixel or two off its edge) the smear fades in over a few pixels: a hard cut
   // there crawled along the bonnet from the hood view. Two looks, 2 px either way along the smear (the cut shows
   // along it): in the hood view the box is the whole screen, and four looks round cost every smeared pixel twice that.
   // (flow is over a pixel and a half long here: never a zero vector)
   float keep=1.0;
   if(full&&boxed(uv)>.5){vec2 o=normalize(flow)*2.0/resolution;keep=1.0-.5*(riding(uv+o,viewPosAt(uv+o))+riding(uv-o,viewPosAt(uv-o)));}
   vec3 acc=color,still=color;float w=1.0;
   for(int i=0;i<6;i++){
    if(float(i)>=taps)break;
    vec2 tap=clamp(uv+flow*((float(i)+.5+jitter*.9)/taps-.5),vec2(.001),vec2(.999));float weight;
    if(full){vec3 tv=viewPosAt(tap);weight=exp(-abs(tv.z-viewPos.z)/max(1.0,z*.12))*(1.0-riding(tap,tv));}else weight=1.0-boxed(tap);
    acc+=texture2D(tColor,tap).rgb*weight;w+=weight;
   }
   color=mix(still,acc/w,keep);
  }
 }
 #ifdef BLOOM
 // Long-lens depth of field (broadcast camera and opening shots only).
 if(dofAmount>.001){float coc=clamp(abs(dist-dofFocus)/(dofFocus*.9)-.25,0.0,1.0)*dofAmount;color=mix(color,texture2D(tDof,uv).rgb,coc);}
 #endif
 #ifdef AO
 if(d<1.0){
  // Joint bilateral upsampling of the half-resolution occlusion.
  vec2 st=uv*aoSize-.5,base=floor(st),f=fract(st);float ao=0.0,wsum=0.0,z=-viewPos.z;
  for(int j=0;j<2;j++)for(int i=0;i<2;i++){
   vec2 c=(base+vec2(float(i),float(j))+.5)/aoSize;vec2 s=texture2D(tAO,c).rg;
   float w=(i==0?1.0-f.x:f.x)*(j==0?1.0-f.y:f.y)*exp(-abs(s.g-z)/(.03*z+.05))+1e-4;ao+=s.r*w;wsum+=w;}
  ao=mix(1.0,max(ao/wsum,aoFloor),clamp(1.0+texture2D(tColor,uv).a,0.0,1.0));color*=mix(1.0,ao,aoStrength);
  if(debugView>.5){gl_FragColor=vec4(vec3(ao),1.0);return;}
 }
 #endif
 // Aerial perspective: height fog integrated along the view ray, lit by the sun.
 float sunAmount=max(dot(ray,sunDir),0.0);
 vec3 haze=mix(hazeColor,hazeSun,pow(sunAmount,6.0)*.75)*mix(1.0,1.18,pow(sunAmount,24.0));
 if(d<1.0){
  float h0=camPos.y-hazeBase,dy=ray.y*dist,falloff=hazeFalloff*dy;
  float optical=hazeDensity*exp(-hazeFalloff*h0)*max(dist-hazeStart,0.0)*(abs(falloff)>.001?(1.0-exp(-falloff))/falloff:1.0);
  color=mix(color,haze,1.0-exp(-optical));
 }
 #ifdef BLOOM
 color+=texture2D(tBloom,uv).rgb*bloomStrength;
 // The sun through the lens: soft glow, an anamorphic streak and ghosts mirrored through the centre.
 float sunSeen=texture2D(tSun,vec2(.5)).r*sunFront;
 if(sunSeen>.001){
  vec2 aspect=vec2(resolution.x/resolution.y,1.0),toSun=(uv-sunUV)*aspect;float r=length(toSun);
  vec3 sunLight=vec3(1.0,.86,.66)*sunSeen;
  color+=sunLight*(exp(-r*9.0)*.35+exp(-r*38.0)*.9)*flare;
  color+=vec3(1.0,.8,.62)*sunSeen*exp(-abs(toSun.y)*170.0)*exp(-abs(toSun.x)*2.4)*streak;
  // Ghosts: soft discs with no rim (a hard-edged dot read as a speck on the car), fading out as the sun
  // nears the frame's edge instead of popping when it leaves.
  vec2 axis=vec2(.5)-sunUV;float ghostFade=ghosts*smoothstep(0.0,.15,min(min(sunUV.x,1.0-sunUV.x),min(sunUV.y,1.0-sunUV.y)));
  for(int i=0;i<4;i++){
   float t=float(i)==0.0?.55:float(i)==1.0?1.1:float(i)==2.0?1.45:1.85;
   vec2 g=((sunUV+axis*t)-uv)*aspect;float size=float(i)==0.0?.035:float(i)==1.0?.07:float(i)==2.0?.022:.11;
   vec3 tint=float(i)==0.0?vec3(.55,.8,1.0):float(i)==1.0?vec3(1.0,.7,.45):float(i)==2.0?vec3(.6,1.0,.7):vec3(.8,.6,1.0);
   float ghost=1.0-smoothstep(0.0,size,length(g));
   color+=tint*sunSeen*ghostFade*ghost*ghost;
  }
 }
 #endif
 float adapted=clamp(adaptKey/exp(texture2D(tExposure,vec2(.5)).r),adaptRange.x,adaptRange.y);
 color*=whiteBalance*exposure*adapted;
 color=aces(color);
 // Grade in display space: split toning, gentle S-curve, softer greens.
 color=toSRGB(color);
 float l=luma(color);
 color*=mix(shadowTint,highlightTint,smoothstep(.15,.75,l));
 // Contrast round the middle; under it a toe with the same slope there that eases into black at the
 // slope LOOK.toe, rather than clipping at about 7% (a cubic through black and mid grey).
 vec3 steep=(color-.5)*contrast+.5,t=2.0*max(color,0.0);
 color=clamp(mix(.5*t*(toe+t*(3.0-2.0*toe-contrast+t*(toe+contrast-2.0))),steep,step(.5,color)),0.0,1.0);
 color=mix(color,color*color*(3.0-2.0*color),.22);
 l=luma(color);
 float green=clamp((color.g-max(color.r,color.b))*4.0,0.0,1.0);
 color=mix(vec3(l),color,saturation*mix(1.0,greenSaturation,green));
 float v=smoothstep(.2,1.05,length(fromCenter*vec2(resolution.x/resolution.y,1.0))*1.05);
 color*=1.0-vignette*v*v;
 // Fine film grain doubles as dithering against banding in the sky.
 float n=ign(gl_FragCoord.xy+fract(time*7.3)*113.0)-.5;
 color+=n*grain*(1.0-l*.6);
 gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}`;

// Shader programs built a few at a time while the page keeps answering. One compileAsync of the whole
// circuit (a level switch, the Simples look) built about a hundred programs of some 100 KB of source
// each in a single task: seconds of frozen page on a busy machine. The scene goes in subtrees of at
// most SLICE_MATERIALS materials (one new program took 0.1 to 0.7 s on a loaded PC), as many per task
// as fit in SLICE_MS. Once the GPU has linked them (KHR_parallel_shader_compile), each program's first
// use (uniform lookup, the driver's log) and the textures waiting for an upload (a new anisotropy
// re-uploads the asphalt's 2048 px maps) go the same way, so the first frame after it does not pay for
// them all at once. target(): the render target the programs are for, asked again at every slice (null:
// the screen); look(): sets the renderer as the pictures are drawn (tone mapping, output colours; for the
// screen's programs) and gives back what undoes it, around every slice.
const SLICE_MATERIALS=3,SLICE_MS=24;
export async function compileInSlices(renderer,scene,camera,target=()=>null,look=()=>()=>{}){
 const drawn=o=>o.isMesh||o.isPoints||o.isLine||o.isSprite,units=[],wait=ms=>new Promise(done=>setTimeout(done,ms));
 // compile() counts the lights below the subtree it is given on top of the scene's: a slice holds none
 // (a drawn object with a light under it is left to a last whole-scene pass).
 const fits=root=>{const seen=new Set(),stack=[root];while(stack.length){const o=stack.pop();if(o.isLight)return false;
  if(drawn(o))for(const m of [].concat(o.material??[])){seen.add(m);if(seen.size>SLICE_MATERIALS)return false;}for(const c of o.children)stack.push(c);}return true;};
 const lit=new Map(),holdsLight=o=>{let light=lit.get(o);if(light===undefined){light=false;o.traverse(c=>{light||=!!c.isLight;});lit.set(o,light);}return light;};
 let whole=false;
 const split=o=>{if(fits(o))units.push(o);else if(!drawn(o))for(const c of o.children)split(c);else if(holdsLight(o))whole=true;else units.push(o);};
 split(scene);
 // A rival's close model out of the scene graph while it is far (immersive-visuals.js detailLevel) is compiled too: a
 // recompile then (a weather, a level) left its programs to be built at the first close fight.
 const detached=[];scene.traverse(o=>{const d=o.userData?.detail;if(d?.isObject3D&&!d.parent)detached.push(d);});for(const d of detached)split(d);
 // compile() also walks the whole scene for its lights at every call: some 6000 objects, a millisecond,
 // times the two or three thousand subtrees of a circuit. The top-level children with no light are hidden
 // from that walk for the task and shown again before it ends (compile() takes every material, shown or not).
 let t=performance.now();const pace=async()=>{if(performance.now()-t>SLICE_MS){await wait(0);t=performance.now();}};
 for(let i=0;i<units.length;){
  const previous=renderer.getRenderTarget(),hidden=scene.children.filter(c=>c.visible&&!holdsLight(c)),undo=look();renderer.setRenderTarget(target());for(const c of hidden)c.visible=false;
  try{do renderer.compile(units[i++],camera,scene);while(i<units.length&&performance.now()-t<SLICE_MS);}finally{for(const c of hidden)c.visible=true;renderer.setRenderTarget(previous);undo();}
  await pace();
 }
 if(whole){const previous=renderer.getRenderTarget(),undo=look();renderer.setRenderTarget(target());try{renderer.compile(scene,camera);}finally{renderer.setRenderTarget(previous);undo();}}
 // Linked by the GPU in parallel meanwhile; a lost context never answers, so not waited for forever.
 const programs=renderer.info.programs;for(const until=performance.now()+20000;programs.some(p=>!p.isReady())&&performance.now()<until;)await wait(10);
 t=performance.now();
 for(const p of [...programs]){if(p.program&&p.isReady())p.getUniforms();await pace();}
 // The maps of what is shown (a hidden object's wait until it shows, as before); a cheap bind when uploaded already.
 const textures=new Set(),materials=new Set(),add=v=>{if(v?.isTexture&&!v.isRenderTargetTexture&&!v.isVideoTexture&&v.version>0&&v.image&&v.image.complete!==false)textures.add(v);};
 scene.traverseVisible(o=>{if(drawn(o))for(const m of [].concat(o.material??[]))materials.add(m);});
 for(const m of materials){for(const key in m)add(m[key]);if(m.uniforms)for(const u of Object.values(m.uniforms)){const v=u?.value;if(Array.isArray(v))v.forEach(add);else add(v);}}
 for(const texture of textures){renderer.initTexture(texture);await pace();}
}

export function createCinematic(renderer,{mobile=false,level=mobile?'lite':'full',quality=mobile?'medio':'alto',features:wanted={}}={}){
 if(!Object.hasOwn(CINEMATIC_QUALITY,quality))quality=mobile?'medio':'alto';
 const profile=()=>CINEMATIC_QUALITY[quality];
 const look={...LOOK},features={...CINEMATIC_FEATURES,...wanted};
 const aoOn=()=>level==='full'&&features.ao,lensOn=()=>level==='full'&&features.lens;
 const quadScene=new THREE.Scene(),quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 const triangle=new THREE.BufferGeometry();triangle.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
 const quad=new THREE.Mesh(triangle);quad.frustumCulled=false;quadScene.add(quad);
 const pass=(fragmentShader,uniforms,defines={})=>new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,defines,depthTest:false,depthWrite:false,toneMapped:false});
 const target=(options={})=>{const t=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,...options});t.texture.generateMipmaps=false;t.texture.minFilter=t.texture.magFilter=THREE.LinearFilter;return t;};
 let dofHalf=null,dofQuarter=null,dofBlur=null,hdr=null,aoA=null,aoB=null,sunTarget=null,lumTarget=null,adapt=[null,null],adaptReset=true;const bloom=[];
 const depthUniforms=()=>({tDepth:{value:null},cameraNear:{value:.1},cameraFar:{value:1000},projScale:{value:new THREE.Vector2(1,1)},depthSize:{value:new THREE.Vector2(1,1)}});
 const aoMaterial=pass(aoShader,{...depthUniforms(),fullTexel:{value:new THREE.Vector2()},radius:{value:look.aoRadius},intensity:{value:look.aoIntensity},bias:{value:look.aoBias},frame:{value:0},fade:{value:new THREE.Vector2(...look.aoFade)}},{SAMPLES:profile().aoSamples});
 const blurMaterial=pass(blurShader,{tInput:{value:null},direction:{value:new THREE.Vector2()}});
 const prefilter=pass(prefilterShader,{tInput:{value:null},texel:{value:new THREE.Vector2()},threshold:{value:look.bloomThreshold},knee:{value:look.bloomKnee},tExposure:{value:null},adaptKey:{value:.2},adaptRange:{value:new THREE.Vector2(1,1)},exposure:{value:1},adapted:{value:0}});
 const down=pass(downShader,{tInput:{value:null},texel:{value:new THREE.Vector2()}});
 const up=pass(upShader,{tInput:{value:null},tBase:{value:null},texel:{value:new THREE.Vector2()}});
 const sunMaterial=pass(sunShader,{tDepth:{value:null},tColor:{value:null},sunUV:{value:new THREE.Vector2()},aspect:{value:new THREE.Vector2(1,1)}});
 const compositeUniforms={...depthUniforms(),tColor:{value:null},tAO:{value:null},tBloom:{value:null},tSun:{value:null},
  resolution:{value:new THREE.Vector2()},aoSize:{value:new THREE.Vector2()},cameraWorld:{value:new THREE.Matrix4()},camPos:{value:new THREE.Vector3()},
  sunDir:{value:new THREE.Vector3(0,1,0)},sunUV:{value:new THREE.Vector2()},sunFront:{value:0},time:{value:0},frame:{value:0},speedBlur:{value:0},
  smearShift:{value:new THREE.Vector3()},smearBoxes:{value:Array.from({length:SMEAR_CARS},()=>new THREE.Vector4())},smearPlanes:{value:Array.from({length:SMEAR_CARS},()=>new THREE.Vector4())},smearFar:{value:new Array(SMEAR_CARS).fill(0)},
  smearReach:{value:new THREE.Vector4(SPEED_SMEAR.near,SPEED_SMEAR.cap,SPEED_SMEAR.farCap,6)},
  tDof:{value:null},dofFocus:{value:10},dofAmount:{value:0},tExposure:{value:null},adaptKey:{value:.2},adaptRange:{value:new THREE.Vector2(1,1)},debugView:{value:0},exposure:{value:0},aoStrength:{value:0},bloomStrength:{value:0},vignette:{value:0},grain:{value:0},aberration:{value:0},saturation:{value:1},greenSaturation:{value:1},contrast:{value:1},toe:{value:1},aoFloor:{value:0},flare:{value:0},streak:{value:0},ghosts:{value:0},clarity:{value:0},
  whiteBalance:{value:new THREE.Vector3()},shadowTint:{value:new THREE.Vector3()},highlightTint:{value:new THREE.Vector3()},hazeColor:{value:new THREE.Vector3()},hazeSun:{value:new THREE.Vector3()},
  hazeDensity:{value:0},hazeFalloff:{value:0},hazeStart:{value:0},hazeBase:{value:0}};
 const tent=pass(tentShader,{tInput:{value:null},texel:{value:new THREE.Vector2()}});
 const lumMaterial=pass(lumShader,{tInput:{value:null}}),adaptMaterial=pass(adaptShader,{tLum:{value:null},tPrev:{value:null},rate:{value:1}});
 // One composite program per set of parts in use, built when first needed (they share the uniforms).
 const composites=new Map();
 const composite=()=>{const ao=stats.ao,lens=stats.lens,detail=level==='full',key=(ao?'ao':'')+(lens?'lens':'')+(detail?'detail':'');let m=composites.get(key);if(!m){m=pass(compositeShader,compositeUniforms,{...(ao?{AO:''}:{}),...(lens?{BLOOM:''}:{}),...(detail?{DETAIL:''}:{})});composites.set(key,m);}return m;};
 const size=new THREE.Vector2(),sunProjected=new THREE.Vector3(),cameraDirection=new THREE.Vector3();
 // The camera's own velocity for the smear (world m/s, eased), where it was last frame and the view it rode.
 const smear={velocity:new THREE.Vector3(),last:new THREE.Vector3(),step:new THREE.Vector3(),view:new THREE.Matrix3(),ready:false,mode:'',strength:0,road:false};
 let width=0,height=0,frame=0,time=0,previousToneMapping=renderer.toneMapping,previousColorSpace=renderer.outputColorSpace;
 const stats={level,quality,passes:0,width:0,height:0,samples:0,sunVisible:0,ao:false,lens:false,aoSamples:0,bloomScale:0};
 // Multisampling of the HDR frame as asked (features.samples): 4x up to about 1080p, fewer on very
 // large drawing buffers (a 4x half-float frame at 4K would take hundreds of MB of video memory).
 const samplesFor=(w,h)=>Math.min(features.samples,w*h<2.3e6?4:w*h<5.2e6?2:0,renderer.capabilities.maxSamples??4),planned=new THREE.Vector2();

 function allocate(){
  dispose();
  const samples=samplesFor(width,height);
  hdr=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,samples,depthTexture:new THREE.DepthTexture(width,height,THREE.FloatType)});
  hdr.texture.minFilter=hdr.texture.magFilter=THREE.LinearFilter;hdr.texture.generateMipmaps=false;
  // Passes that only draw for the player's own view (lake reflections) treat this target as the screen.
  hdr.isMainView=true;stats.samples=samples;
  lumTarget=target();lumTarget.setSize(16,16);lumTarget.texture.minFilter=lumTarget.texture.magFilter=THREE.NearestFilter;
  adapt=[target(),target()];for(const t of adapt)t.setSize(1,1);adaptReset=true;
  stats.ao=aoOn();stats.lens=lensOn();stats.aoSamples=stats.ao?profile().aoSamples:0;stats.bloomScale=stats.lens?profile().bloomScale:0;
  const hw=Math.max(1,width>>1),hh=Math.max(1,height>>1);
  if(stats.ao){
   aoA=target({type:THREE.HalfFloatType,format:THREE.RGFormat});aoB=target({type:THREE.HalfFloatType,format:THREE.RGFormat});aoA.setSize(hw,hh);aoB.setSize(hw,hh);
   for(const t of [aoA,aoB])t.texture.minFilter=t.texture.magFilter=THREE.NearestFilter;
  }
  if(!stats.lens)return;
  for(let i=0,w=Math.max(1,Math.floor(width/profile().bloomScale)),h=Math.max(1,Math.floor(height/profile().bloomScale));i<profile().bloomLevels;i++,w=Math.max(1,w>>1),h=Math.max(1,h>>1)){const a=target(),b=target();a.setSize(w,h);b.setSize(w,h);bloom.push({down:a,up:b,w,h});}
  sunTarget=target({type:THREE.UnsignedByteType});sunTarget.setSize(1,1);
  // The driving cameras never need these: allocate only when a broadcast shot asks.
 }
 function dispose(){for(const t of [hdr,aoA,aoB,sunTarget,lumTarget,dofHalf,dofQuarter,dofBlur,...adapt])if(t){t.depthTexture?.dispose();t.dispose();}for(const b of bloom){b.down.dispose();b.up.dispose();}bloom.length=0;hdr=aoA=aoB=sunTarget=lumTarget=dofHalf=dofQuarter=dofBlur=null;adapt=[null,null];
  Object.assign(stats,{passes:0,width:0,height:0,samples:0,sunVisible:0,ao:false,lens:false,aoSamples:0,bloomScale:0});
 }
 function draw(material,output){quad.material=material;renderer.setRenderTarget(output);renderer.render(quadScene,quadCamera);stats.passes++;}
 // Speed smear (SPEED_SMEAR) for the views that ride with the car: the camera's travel this frame, eased; a
 // paused frame (dt 0), a cut (another view, or a jump faster than SPEED_SMEAR.cut) start it from nothing.
 // road: the phones' lighter road smear (ROAD_SMEAR) where the full one is off.
 function updateSmear(camera,dt,mode,top,cars,road){
  const u=compositeUniforms,riding=mode==='chase'||mode==='close'||mode==='far'||mode==='hood'||mode==='cockpit',full=features.motionBlur;
  smear.step.subVectors(camera.position,smear.last);
  if(dt>0&&riding&&smear.ready&&mode===smear.mode&&smear.step.length()<SPEED_SMEAR.cut*dt)smear.velocity.lerp(smear.step.divideScalar(dt),1-Math.exp(-dt/SPEED_SMEAR.ease));
  else smear.velocity.set(0,0,0);
  smear.last.copy(camera.position);smear.ready=true;smear.mode=mode;smear.road=!full&&!!road;
  smear.strength=(full||road)&&riding?smearStrength(smear.velocity.length(),top||60):0;u.speedBlur.value=smear.strength;
  if(!smear.strength)return;
  if(full)u.smearReach.value.set(SPEED_SMEAR.near,SPEED_SMEAR.cap,SPEED_SMEAR.farCap,6);else u.smearReach.value.set(SPEED_SMEAR.near,ROAD_SMEAR.cap,ROAD_SMEAR.farCap,ROAD_SMEAR.taps);
  u.smearShift.value.copy(smear.velocity).applyMatrix3(smear.view.setFromMatrix4(camera.matrixWorldInverse)).multiplyScalar(SPEED_SMEAR.shutter*smear.strength);
  // (packed from slot 0 with no gap: the shader stops at the first empty box)
  let k=0;for(let i=0;cars&&i<cars.length&&k<SMEAR_CARS;i++){const c=cars[i];if(!c)continue;u.smearBoxes.value[k].fromArray(c.box);u.smearPlanes.value[k].fromArray(c.plane);u.smearFar.value[k++]=c.far;}
  for(;k<SMEAR_CARS;k++){u.smearBoxes.value[k].set(0,0,0,0);u.smearFar.value[k]=0;}
 }
 // Materials compile for the render target they draw into: with the look on, the scene is
 // linear and un-tone-mapped both on screen and off it, so load-time compiles stay valid.
 function applyRendererState(){
  if(level==='off'){renderer.toneMapping=previousToneMapping;renderer.outputColorSpace=previousColorSpace;}
  else{renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;}
 }
 applyRendererState();

 return {
  look,stats,
  get level(){return level;},
  get quality(){return quality;},
  setQuality(value){if(!Object.hasOwn(CINEMATIC_QUALITY,value)||value===quality)return quality;quality=value;stats.quality=value;aoMaterial.defines.SAMPLES=profile().aoSamples;aoMaterial.needsUpdate=true;width=height=0;return quality;},
  setLevel(value){if(!CINEMATIC_LEVELS.includes(value)||value===level)return level;level=value;stats.level=level;width=height=0;if(level==='off')dispose();applyRendererState();return level;},
  // {ao, lens, motionBlur, samples}: the targets are rebuilt at the next frame when one of them changes.
  get features(){return {...features};},
  setFeatures(patch){const before=JSON.stringify(features);for(const key of Object.keys(CINEMATIC_FEATURES))if(patch&&typeof patch[key]===typeof CINEMATIC_FEATURES[key])features[key]=patch[key];if(JSON.stringify(features)!==before)width=height=0;return {...features};},
  // The multisampling the HDR frame draws with from now on: a level, feature or size change only marks
  // the target stale (stats.samples keeps the old one until the next frame rebuilds it), and the cars'
  // clear coat must follow at once (car-reflections.js).
  samples(){if(level==='off')return 0;renderer.getDrawingBufferSize(planned);return samplesFor(planned.x,planned.y);},
  // context: {dt (0 paused), mode (camera; anything but a riding view, e.g. 'still', has no smear), hazeBase (m),
  // topSpeed (m/s, the followed car's), smearCars: up to SMEAR_CARS {box:[x0,y0,x1,y1] (uv, from the bottom left),
  // plane:[x,y,z,w] (the road under it in view space: up . p - w is the height), far (m)} kept sharp, roadSmear:
  // the phones' light road smear (ROAD_SMEAR) while the full one (features.motionBlur) is off}
  render(scene,camera,{dt=0,mode='chase',hazeBase=0,dof=null,topSpeed=60,smearCars=null,roadSmear=false}={}){
   if(level==='off'){
    renderer.getDrawingBufferSize(size);
    Object.assign(stats,{passes:1,width:size.x,height:size.y,samples:0,sunVisible:0,ao:false,lens:false,aoSamples:0,bloomScale:0});
    renderer.setRenderTarget(null);renderer.render(scene,camera);return;
   }
   renderer.getDrawingBufferSize(size);
   if(size.x!==width||size.y!==height||!hdr){width=size.x;height=size.y;allocate();}
   // Count the primary scene pass too, so Simples is one and Leve/Completo include it.
   time+=dt;frame=(frame+1)%64;stats.passes=1;stats.width=width;stats.height=height;
   const info=renderer.info,autoReset=info.autoReset;
   renderer.setRenderTarget(hdr);renderer.render(scene,camera);
   const calls=info.render.calls,triangles=info.render.triangles;info.autoReset=false;
   const projection=camera.projectionMatrix.elements;
   for(const u of [aoMaterial.uniforms,compositeUniforms]){u.tDepth.value=hdr.depthTexture;u.cameraNear.value=camera.near;u.cameraFar.value=camera.far;u.projScale.value.set(projection[0],projection[5]);u.depthSize.value.set(width,height);}
   const u=compositeUniforms;
   if(stats.ao){
    const hw=aoA.width,hh=aoA.height;
    aoMaterial.uniforms.fullTexel.value.set(1/width,1/height);aoMaterial.uniforms.frame.value=frame;
    aoMaterial.uniforms.radius.value=look.aoRadius;aoMaterial.uniforms.intensity.value=look.aoIntensity;aoMaterial.uniforms.bias.value=look.aoBias;aoMaterial.uniforms.fade.value.set(...look.aoFade);
    draw(aoMaterial,aoA);
    blurMaterial.uniforms.tInput.value=aoA.texture;blurMaterial.uniforms.direction.value.set(1/hw,0);draw(blurMaterial,aoB);
    blurMaterial.uniforms.tInput.value=aoB.texture;blurMaterial.uniforms.direction.value.set(0,1/hh);draw(blurMaterial,aoA);
    u.tAO.value=aoA.texture;u.aoSize.value.set(hw,hh);
   }
   if(stats.lens){
    prefilter.uniforms.tInput.value=hdr.texture;prefilter.uniforms.texel.value.set(profile().bloomScale*.5/width,profile().bloomScale*.5/height);prefilter.uniforms.threshold.value=look.bloomThreshold;prefilter.uniforms.knee.value=look.bloomKnee;
    const pu=prefilter.uniforms;pu.tExposure.value=adapt[0].texture;pu.adapted.value=adaptReset?0:1;pu.adaptKey.value=look.adaptKey;pu.adaptRange.value.set(...look.adaptRange);pu.exposure.value=look.exposure;
    draw(prefilter,bloom[0].down);
    for(let i=1;i<bloom.length;i++){down.uniforms.tInput.value=bloom[i-1].down.texture;down.uniforms.texel.value.set(1/bloom[i-1].w,1/bloom[i-1].h);draw(down,bloom[i].down);}
    let source=bloom[bloom.length-1].down;
    for(let i=bloom.length-2;i>=0;i--){up.uniforms.tInput.value=source.texture;up.uniforms.tBase.value=bloom[i].down.texture;up.uniforms.texel.value.set(1/bloom[i+1].w,1/bloom[i+1].h);draw(up,bloom[i].up);source=bloom[i].up;}
    // Where the sun is on screen, and whether it is in front of the camera at all.
    camera.getWorldDirection(cameraDirection);
    sunProjected.copy(u.sunDir.value).multiplyScalar(camera.far*.5).add(camera.position).project(camera);
    const front=cameraDirection.dot(u.sunDir.value)>.05&&Math.abs(sunProjected.x)<1.4&&Math.abs(sunProjected.y)<1.4;
    u.sunUV.value.set(sunProjected.x*.5+.5,sunProjected.y*.5+.5);u.sunFront.value=front?1:0;
    sunMaterial.uniforms.tDepth.value=hdr.depthTexture;sunMaterial.uniforms.tColor.value=hdr.texture;sunMaterial.uniforms.sunUV.value.copy(u.sunUV.value);sunMaterial.uniforms.aspect.value.set(height/width,1);
    if(front)draw(sunMaterial,sunTarget);
    // Depth of field only when a shot asks for it: {focus: metres, amount: 0..1}.
    u.dofAmount.value=dof?.amount??0;
    if(u.dofAmount.value>.001){
     if(!dofHalf){const hw=Math.max(1,width>>1),hh=Math.max(1,height>>1);dofHalf=target();dofHalf.setSize(hw,hh);dofBlur=target();dofBlur.setSize(hw,hh);dofQuarter=target();dofQuarter.setSize(Math.max(1,hw>>1),Math.max(1,hh>>1));}
     u.dofFocus.value=Math.max(.5,dof.focus);
     down.uniforms.tInput.value=hdr.texture;down.uniforms.texel.value.set(1/width,1/height);draw(down,dofHalf);
     down.uniforms.tInput.value=dofHalf.texture;down.uniforms.texel.value.set(1/dofHalf.width,1/dofHalf.height);draw(down,dofQuarter);
     tent.uniforms.tInput.value=dofQuarter.texture;tent.uniforms.texel.value.set(1/dofQuarter.width,1/dofQuarter.height);draw(tent,dofBlur);
     u.tDof.value=dofBlur.texture;
    }
    u.tBloom.value=bloom[0].up.texture;u.tSun.value=sunTarget.texture;
   }
   // Eye adaptation: scene brightness, eased toward from the previous frame.
   lumMaterial.uniforms.tInput.value=hdr.texture;draw(lumMaterial,lumTarget);
   adaptMaterial.uniforms.tLum.value=lumTarget.texture;adaptMaterial.uniforms.tPrev.value=adapt[0].texture;
   adaptMaterial.uniforms.rate.value=adaptReset?1:1-Math.exp(-Math.min(dt,.1)*look.adaptSpeed);draw(adaptMaterial,adapt[1]);
   adapt.reverse();adaptReset=false;u.tExposure.value=adapt[0].texture;u.adaptKey.value=look.adaptKey;u.adaptRange.value.set(...look.adaptRange);
   u.tColor.value=hdr.texture;u.resolution.value.set(width,height);u.cameraWorld.value.copy(camera.matrixWorld);u.camPos.value.copy(camera.position);u.time.value=time;u.frame.value=frame;
   u.debugView.value=look.debug;u.exposure.value=look.exposure;u.aoStrength.value=1;u.aoFloor.value=look.aoFloor;u.toe.value=look.toe;u.bloomStrength.value=look.bloom;u.vignette.value=look.vignette;u.grain.value=look.grain;u.aberration.value=look.aberration;
   u.saturation.value=look.saturation;u.greenSaturation.value=look.greenSaturation;u.contrast.value=look.contrast;u.flare.value=look.flare;u.streak.value=look.streak;u.ghosts.value=look.ghosts;u.clarity.value=profile().clarity;
   u.whiteBalance.value.set(...look.whiteBalance);u.shadowTint.value.set(...look.shadowTint);u.highlightTint.value.set(...look.highlightTint);
   u.hazeColor.value.set(...look.hazeColor);u.hazeSun.value.set(...look.hazeSun);u.hazeDensity.value=look.hazeDensity;u.hazeFalloff.value=look.hazeFalloff;u.hazeStart.value=look.hazeStart;u.hazeBase.value=hazeBase;
   updateSmear(camera,dt,mode,topSpeed,smearCars,roadSmear);
   draw(composite(),null);
   info.render.calls=calls;info.render.triangles=triangles;info.autoReset=autoReset;
   stats.sunVisible=stats.lens?u.sunFront.value:0;
  },
  // Compile the scene's programs for the off-screen target (loading, a level switch) a slice at a time
  // (compileInSlices), and the screen passes the next frame draws with (another set of parts, Ultra's
  // occlusion samples), which otherwise compiled inside that frame.
  async compile(scene,camera){
   if(level!=='off'){
    renderer.getDrawingBufferSize(size);if(!hdr||size.x!==width||size.y!==height){width=size.x;height=size.y;allocate();}
    const previous=renderer.getRenderTarget(),drawn=quad.material;renderer.setRenderTarget(null);
    try{for(const m of [composite(),lumMaterial,adaptMaterial,...(stats.ao?[aoMaterial,blurMaterial]:[]),...(stats.lens?[prefilter,down,up,sunMaterial]:[])]){quad.material=m;renderer.compile(quadScene,quadCamera);}}
    finally{quad.material=drawn;renderer.setRenderTarget(previous);}
   }
   await compileInSlices(renderer,scene,camera,()=>level==='off'?null:hdr);
  },
  setSun(direction){compositeUniforms.sunDir.value.copy(direction).normalize();},
  // The weather's changes to the look (weather.js profile.look): everything else back to LOOK. The eye adapts
  // afresh, so a race at night does not open on the day's exposure.
  setLook(patch={}){for(const key of Object.keys(look))if(!Object.hasOwn(LOOK,key))delete look[key];Object.assign(look,LOOK,patch);adaptReset=true;return look;},
  dispose(){dispose();for(const m of [aoMaterial,blurMaterial,prefilter,down,up,tent,sunMaterial,lumMaterial,adaptMaterial,...composites.values()])m.dispose();triangle.dispose();},
  // Reads the adapted mean luminance back from the GPU: for tests and tuning only.
  adaptation(){if(!adapt[0])return null;const out=new Uint16Array(4);renderer.readRenderTargetPixels(adapt[0],0,0,1,1,out);const mean=Math.exp(THREE.DataUtils.fromHalfFloat(out[0]));
   return {mean,scale:THREE.MathUtils.clamp(look.adaptKey/mean,...look.adaptRange)};},
  resetAdaptation(){adaptReset=true;},
  info:()=>({...stats,features:{...features},look:{...look},smear:{strength:+smear.strength.toFixed(3),road:!!(smear.strength&&smear.road),speed:+smear.velocity.length().toFixed(2),shift:+(smear.strength?compositeUniforms.smearShift.value.length():0).toFixed(4)}})
 };
}
