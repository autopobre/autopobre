// The race's weather (the Corrida tab: Horário and Clima): the time of day and the rain, chosen before the start
// and kept for the whole race. Pure data, no DOM and no three.js (testar_clima.mjs reads it in Node): main.js
// puts a profile on the sun, the sky (sky.js setWeather), the film look (cinematic.js look), the fog, the road
// (track-surface.js setWetness), the cars' grip (physics.js gripScale), the headlights (headlights.js) and the
// rain itself (rain.js).
// Directions are in the scene's frame: x east, y up, z south (main.js draws the track's north as -z).
// The light on what draws its own colour (smoke, spray, dust, falling leaves, splashes: no lights in their shaders),
// one uniform shared by all of them; main.js applyWeather sets it from weatherProfile().ambient (1 by day).
import {RAIN_CLIMATE} from './rain-climate.js';
import {placeOf} from './circuits.js';
export const EFFECT_LIGHT={value:1};
// The grandstands' lamps after dark (user, 2026-10-15: "o pessoal das arquibancadas fica no escuro total"): the fixtures
// under their roofs glow and light the stands and the fans (interlagos-stands.js, landscape.js createCrowd). One uniform
// shared by them; main.js applyWeather sets it: 1 at night, .45 at dusk, 0 by day.
export const STAND_LIGHTS={value:0};
export const TIMES_OF_DAY=Object.freeze([['dia','Dia (padrão)'],['fim_de_tarde','Fim de tarde'],['noite','Noite']]);
export const RAIN_LEVELS=Object.freeze([['seco','Seco (padrão)'],['garoa','Garoa'],['chuva','Chuva forte']]);
export const TIME_DEFAULT='dia',RAIN_DEFAULT='seco';
export const timeOfDay=value=>TIMES_OF_DAY.some(([v])=>v===value)?value:TIME_DEFAULT;
export const rainLevel=value=>RAIN_LEVELS.some(([v])=>v===value)?value:RAIN_DEFAULT;
// "Aleatório", the selects' last choice: the preference keeps it, and main.js draws a real time or rain for each race
// (drawWeather: a new race or a restart draws again) and races that one to the flag.
export const RANDOM_WEATHER='aleatorio';
export const TIME_CHOICES=Object.freeze([...TIMES_OF_DAY,[RANDOM_WEATHER,'Aleatório']]);
export const RAIN_CHOICES=Object.freeze([...RAIN_LEVELS,[RANDOM_WEATHER,'Aleatório']]);
export const timeChoice=value=>value===RANDOM_WEATHER?value:timeOfDay(value);
export const rainChoice=value=>value===RANDOM_WEATHER?value:rainLevel(value);
// The rain's odds where and when the race is (Central #10): the circuit's city in the month of a championship round
// that has a date, the year's average without one (rain-climate.js, INMET normals: days with rain, the heavy ones);
// a place with no data, Stevan's first ask: 70% dry, the rest drizzle or heavy rain alike.
export const PLAIN_RAIN_ODDS=Object.freeze({seco:.7,garoa:.15,chuva:.15});
const MONTH_DAYS=[31,28.25,31,30,31,30,31,31,30,31,30,31];
export function rainOdds(circuit,month=null){
 const c=RAIN_CLIMATE[placeOf(circuit)];if(!c)return PLAIN_RAIN_ODDS;
 const dated=Number.isInteger(month)&&month>=0&&month<12,sum=list=>list.reduce((a,b)=>a+b,0);
 const wet=Math.min(1,dated?c.rainDays[month]/MONTH_DAYS[month]:sum(c.rainDays)/365.25),heavy=dated?c.heavyDays[month]/c.rainDays[month]:sum(c.heavyDays)/sum(c.rainDays);
 const share=Number.isFinite(heavy)?Math.min(1,heavy):0;
 return {seco:1-wet,garoa:wet*(1-share),chuva:wet*share};
}
// The month a championship round is raced, from its calendar date (championship.js: "21 e 22 MAR", "31 OUT e 01 NOV":
// the Sunday's); null without one.
const MONTHS=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
export function raceMonth(date){const named=String(date??'').toUpperCase().match(/[A-Z]{3}/g)?.filter(w=>MONTHS.includes(w));return named?.length?MONTHS.indexOf(named.at(-1)):null;}
// The rain level a draw's roll (0 to 1) gives at those odds: dry first, then drizzle, then heavy rain.
export function rainFor(roll,odds=PLAIN_RAIN_ODDS){let edge=0;for(const [level] of RAIN_LEVELS){edge+=odds[level]??0;if(roll<edge)return level;}return RAIN_LEVELS.at(-1)[0];}
// A draw: every time of day as likely; the rain by the odds (rainOdds), its roll kept so the race takes the draw
// the menu made at the odds of the circuit and month it is raced (main.js beginRace).
export function drawWeather(random=Math.random,odds=PLAIN_RAIN_ODDS){
 const time=TIMES_OF_DAY[Math.min(TIMES_OF_DAY.length-1,Math.floor(random()*TIMES_OF_DAY.length))][0],roll=random();
 return {time,rain:rainFor(roll,odds),roll};
}
// The weather the chosen time and rain race: the draw where they say Aleatório.
export function chosenWeather(time,rain,draw){
 return {time:time===RANDOM_WEATHER?draw.time:timeOfDay(time),rain:rain===RANDOM_WEATHER?draw.rain:rainLevel(rain)};
}
// The keyboard's Y and U (main.js cycleWeather): the time of day or the rain after the one raced, round the list
// (dia, fim de tarde, noite, dia...; seco, garoa, chuva, seco...), and the name the race shows for it.
const after=(list,value)=>list[(list.findIndex(([v])=>v===value)+1)%list.length];
export const nextTimeOfDay=time=>after(TIMES_OF_DAY,timeOfDay(time))[0];
export const nextRainLevel=rain=>after(RAIN_LEVELS,rainLevel(rain))[0];
export const weatherName=(list,value)=>list.find(([v])=>v===value)?.[1].replace(' (padrão)','')??value;

// A direction from the compass bearing (degrees from north, clockwise) and the height over the horizon.
export function skyDirection(bearing,elevation){
 const b=bearing*Math.PI/180,e=elevation*Math.PI/180;
 return [Math.sin(b)*Math.cos(e),Math.sin(e),-Math.cos(b)*Math.cos(e)];
}

// Each time of day, dry. The day is the game as it always was (sky.js, main.js sun and skyFill, cinematic.js LOOK):
// nothing here may change it.
//  sun: the key light (the moon at night): direction, colour, strength; fill: the hemisphere (sky, ground, strength);
//  environment: the world's sky-light strength; sky: the dome's colours (linear), clouds and what only dusk and
//  night have (sunset glow, stars, moon disc, the city's sodium glow under the clouds); fog: colour (linear) and how
//  far it reaches against the Gráficos tab's distance; exposure: the Simples look's (no eye adaptation);
//  look: what changes in the film look (cinematic.js LOOK), the rest stays.
const DAY={
 sun:{direction:[-.521,.707,-.478],color:'#fff1e2',intensity:7},
 fill:{sky:'#c4d8f2',ground:'#4c4a38',intensity:.45},
 environment:1,
 sky:{zenith:[.07,.22,.54],horizon:[.53,.645,.8],ground:[.19,.205,.155],cloudCover:.47,cloudShade:[.34,.405,.52],cloudLit:[1.08,1.06,1.01],
  cirrus:[1,1,1],aureole:[1,.82,.62],silver:[1,.85,.65],disc:[22,19,15],sunset:[0,0,0],stars:0,city:[0,0,0],band:1},
 fog:{color:[.53,.645,.8],reach:1},
 exposure:.78,
 look:{},
 shadowBias:{bias:-.0004,normalBias:.03}
};
export const TIME_PROFILES=Object.freeze({
 dia:DAY,
 // About half past five in the afternoon: the sun 7° over the west-north-west horizon, orange, with long shadows;
 // the sky deep blue overhead, gold to rose round the sun, lilac on the other side; the shade is cool.
 fim_de_tarde:{
  sun:{direction:skyDirection(288,7),color:'#ffb066',intensity:4.6},
  fill:{sky:'#a9b6dc',ground:'#4b3a2c',intensity:.42},
  environment:.85,
  sky:{zenith:[.035,.085,.25],horizon:[.62,.5,.5],ground:[.13,.11,.09],cloudCover:.42,cloudShade:[.3,.25,.33],cloudLit:[1.25,.82,.55],
   cirrus:[1.15,.8,.62],aureole:[1.7,.95,.42],silver:[1.7,.78,.36],disc:[30,17,6],sunset:[1.05,.42,.12],stars:0,city:[0,0,0],band:.75},
  fog:{color:[.6,.52,.5],reach:.95},
  exposure:.92,
  // A warmer, softer picture; the sun is low and often in sight, so its glare stays modest.
  look:{whiteBalance:[1.05,1.0,.93],saturation:1.1,hazeColor:[.56,.52,.56],hazeSun:[1.0,.6,.32],flare:.26,streak:.1,adaptKey:.15},
  // Grazing light: a little more bias, or the terrain's own shadow speckles (acne).
  shadowBias:{bias:-.0009,normalBias:.06}
 },
 // A clear night with the moon high in the east-north-east: blue moonlight, a little starry sky over the dark
 // and São Paulo's orange glow on the horizon and under the clouds. The headlights do the rest (headlights.js).
 noite:{
  sun:{direction:skyDirection(62,38),color:'#9db4ff',intensity:.2},
  fill:{sky:'#3b4d78',ground:'#1d1813',intensity:.05},
  environment:1,
  sky:{zenith:[.0016,.0034,.011],horizon:[.022,.018,.019],ground:[.006,.006,.006],cloudCover:.32,cloudShade:[.006,.006,.008],cloudLit:[.018,.015,.014],
   cirrus:[.03,.026,.024],aureole:[.05,.06,.08],silver:[.012,.014,.018],disc:[1.5,1.6,1.8],sunset:[0,0,0],stars:1,city:[.03,.016,.006],band:.05},
  fog:{color:[.016,.014,.015],reach:.8},
  exposure:2.5,
  // The eye opens up in the dark, though not to daylight: the moonlit track stays about a tenth of the day's, and
  // headlights close it down again (adaptation from .32, a pack's beams, to 1.6). Cool and a little grainy.
  look:{exposure:2,adaptKey:.07,adaptRange:[.32,1.6],whiteBalance:[.94,.99,1.08],saturation:.92,contrast:1.1,
   hazeColor:[.035,.03,.032],hazeSun:[.05,.055,.07],hazeDensity:.0002,flare:0,streak:0,ghosts:0,grain:.012,bloom:.2,bloomThreshold:1.4},
  shadowBias:{bias:-.0006,normalBias:.04}
 }
});

// What the rain adds on top of any time of day. light: the sun's share through the cloud; fill: the hemisphere's
// gain (the overcast sky lights from everywhere); grey: how far the dome's colours go toward the cloud's grey;
// fog: the fog's reach and the haze's density against the dry ones; grip: the tyres' grip on the wet track (all
// cars: physics.js gripScale); wetness: the road's film of water (track-surface.js); drops: the rain's density
// (rain.js); spray: the water thrown up behind the wheels.
export const RAIN_PROFILES=Object.freeze({
 seco:{light:1,fill:1,grey:0,cloudCover:null,fog:1,haze:1,grip:1,wetness:0,drops:0,spray:0},
 garoa:{light:.38,fill:1.35,grey:.55,cloudCover:.86,fog:.62,haze:2.6,grip:.88,wetness:.55,drops:.32,spray:.45},
 chuva:{light:.16,fill:1.6,grey:.85,cloudCover:1.1,fog:.4,haze:5,grip:.76,wetness:1,drops:1,spray:1}
});

const AMBIENT={dia:1,fim_de_tarde:.62,noite:.045};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const grey=c=>{const l=c[0]*.2126+c[1]*.7152+c[2]*.0722;return [l,l,l];};
const hex=v=>{const n=parseInt(v.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
const toHex=c=>'#'+c.map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('');

// The whole weather for a time of day and a rain level: every number main.js and the modules need.
export function weatherProfile(time=TIME_DEFAULT,rain=RAIN_DEFAULT){
 time=timeOfDay(time);rain=rainLevel(rain);
 const base=TIME_PROFILES[time],r=RAIN_PROFILES[rain],wet=rain!=='seco',night=time==='noite';
 const sky={...base.sky};
 if(wet){
  // The overcast: the dome greys toward its own clouds, the clouds close up and lose their bright tops.
  const cloud=night?[.012,.012,.014]:time==='fim_de_tarde'?[.3,.27,.28]:[.42,.44,.47];
  sky.zenith=mix(base.sky.zenith,mix(grey(base.sky.zenith),cloud,.6),r.grey);
  sky.horizon=mix(base.sky.horizon,mix(grey(base.sky.horizon),cloud,.4),r.grey);
  sky.cloudCover=r.cloudCover;sky.cloudShade=mix(base.sky.cloudShade,cloud.map(v=>v*.55),r.grey);sky.cloudLit=mix(base.sky.cloudLit,cloud.map(v=>v*1.25),r.grey);
  sky.silver=base.sky.silver.map(v=>v*(1-r.grey));sky.aureole=base.sky.aureole.map(v=>v*(1-r.grey*.8));sky.sunset=base.sky.sunset.map(v=>v*(1-r.grey*.75));
  sky.cirrus=mix(base.sky.cirrus,grey(base.sky.cirrus).map(v=>v*.7),r.grey);sky.band=base.sky.band*(1-.35*r.grey);
  sky.stars=base.sky.stars*(1-r.grey);sky.disc=base.sky.disc.map(v=>v*(1-r.grey));
  // The city's light bounces off a low cloud: the rainy night is a little orange overhead, never a dusk.
  sky.city=base.sky.city.map(v=>v*(1+r.grey*.15));
 }
 const fogColor=wet?mix(base.fog.color,mix(grey(base.fog.color),sky.horizon,.5),r.grey):base.fog.color;
 const look={...base.look};
 if(wet){
  const dry=k=>base.look[k];
  look.hazeDensity=(dry('hazeDensity')??.00014)*r.haze;look.hazeColor=fogColor.map(v=>v*1.08);look.hazeSun=fogColor.map(v=>v*1.15);
  look.flare=(dry('flare')??.34)*(1-r.grey);look.streak=(dry('streak')??.14)*(1-r.grey);look.ghosts=(dry('ghosts')??.0085)*(1-r.grey);
  look.saturation=(dry('saturation')??1.06)*(1-.12*r.grey);look.contrast=(dry('contrast')??1.16)*(1-.06*r.grey);
 }
 return {
  time,rain,night,wet,
  sun:{direction:base.sun.direction.slice(),color:base.sun.color,intensity:base.sun.intensity*r.light},
  // The overcast lights from everywhere by day; at night it only hides the moon.
  fill:{sky:wet?toHex(mix(hex(base.fill.sky),grey(hex(base.fill.sky)),r.grey*.7)):base.fill.sky,ground:base.fill.ground,intensity:base.fill.intensity*(night?1:r.fill)},
  environment:base.environment,sky,
  fog:{color:fogColor,reach:base.fog.reach*r.fog},
  exposure:base.exposure*(wet?1+.25*r.grey:1),
  look,shadowBias:base.shadowBias,
  grip:r.grip,wetness:r.wetness,drops:r.drops,spray:r.spray,
  // The light on what draws its own colour (smoke, spray, dust, falling leaves: no lights in their shaders).
  ambient:AMBIENT[time]*(wet?1-.3*r.grey:1),
  // The cars light up at night and in the rain; the player's own lamps start on in those (headlights.js), except the
  // story's, which the pilot switches on (K). Dry dusk is still daylight: no lamps (the team's call, 10-15).
  lights:night||wet,
  // How strong the headlights read against the daylight left (the beams, the glare): full at night.
  lamps:night?1:time==='fim_de_tarde'?.35:.25
 };
}

// The opening's caption ('São Paulo · 16h40 · 27 °C · pista seca', circuits.js weather): the hour, the temperature
// and the track as the weather has them; drawn ({time,rain}: which of them Aleatório drew) names the draw at the end.
const CLOCK={dia:null,fim_de_tarde:'17h50',noite:'21h30'};
const COOLER={dia:0,fim_de_tarde:3,noite:7};
const TRACK={seco:'pista seca',garoa:'garoa · pista úmida',chuva:'chuva forte · pista molhada'};
const DRAWN={time:{dia:'dia',fim_de_tarde:'fim de tarde',noite:'noite'},rain:{seco:'tempo seco',garoa:'garoa',chuva:'chuva forte'}};
export function weatherCaption(text,profile,drawn=null){
 const clock=CLOCK[profile.time],cooler=COOLER[profile.time]+(profile.rain==='chuva'?5:profile.rain==='garoa'?3:0);
 const caption=String(text).replace(/\d{1,2}h\d{2}/,hour=>clock??hour).replace(/(-?\d+) °C/,(_,t)=>`${Number(t)-cooler} °C`).replace(/pista seca/,TRACK[profile.rain]);
 const draw=['time','rain'].filter(k=>drawn?.[k]).map(k=>DRAWN[k][profile[k]]);
 return draw.length?`${caption} · sorteio: ${draw.join(', ')}`:caption;
}
