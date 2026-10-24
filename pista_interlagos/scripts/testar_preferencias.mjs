import assert from 'node:assert/strict';
import {PlayerPreferences,PREFERENCES_KEY} from '../teste/player-preferences.js';
const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
let preferences=new PlayerPreferences(storage);
assert.deepEqual(preferences.values,{immersive:true,livery:'assinaturas_omp',camera:'chase',circuit:'interlagos',damage:false,aceKoyzinho:false,aiLevel:'facil',retirements:true,classicInterior:false,graphics:{level:'auto',overrides:{}},debugOverlay:'off',debugCorner:'auto',duelRival:'73',fuscaDuelRival:'20',car:'99',fuscaCar:'99',carModel:'opala',carStill:false,laps:3,storyLaps:8,timeOfDay:'dia',rain:'seco',ghost:false,drivingLine:'desligada',padSteering:'normal',padRumble:true,gearbox:'automatico',wheelLock:270,classicMenus:false,raceMode:'single'});
preferences.update({immersive:false,livery:'seiva_danilo',camera:'cockpit'});
preferences=new PlayerPreferences(storage);
assert.deepEqual(preferences.values,{immersive:false,livery:'seiva_danilo',camera:'cockpit',circuit:'interlagos',damage:false,aceKoyzinho:false,aiLevel:'facil',retirements:true,classicInterior:false,graphics:{level:'auto',overrides:{}},debugOverlay:'off',debugCorner:'auto',duelRival:'73',fuscaDuelRival:'20',car:'99',fuscaCar:'99',carModel:'opala',carStill:false,laps:3,storyLaps:8,timeOfDay:'dia',rain:'seco',ghost:false,drivingLine:'desligada',padSteering:'normal',padRumble:true,gearbox:'automatico',wheelLock:270,classicMenus:false,raceMode:'single'});
preferences.update({circuit:'curvelo'});
assert.equal(new PlayerPreferences(storage).values.circuit,'curvelo');
preferences.update({circuit:'../../private'});
assert.equal(new PlayerPreferences(storage).values.circuit,'interlagos');
preferences.update({immersive:true});
assert.equal(new PlayerPreferences(storage).values.immersive,true);
assert.equal(new PlayerPreferences(storage).values.camera,'cockpit');
// The old high chase is kept as Perseguição distante ('far'); saves keep it like any other view.
preferences.update({camera:'far'});assert.equal(new PlayerPreferences(storage).values.camera,'far');preferences.update({camera:'cockpit'});
// Car damage is opt-in and survives a reload; anything but a boolean falls back to off.
preferences.update({damage:true});assert.equal(new PlayerPreferences(storage).values.damage,true);
preferences.update({damage:'yes'});assert.equal(new PlayerPreferences(storage).values.damage,false);
// Graphics (the Gráficos tab): a level and the settings changed by hand, kept after a reload and
// independent of the other fields; unknown levels and values are dropped.
preferences.update({graphics:{level:'ultra',overrides:{shadows:'media',water:'simples'}}});assert.deepEqual(new PlayerPreferences(storage).values.graphics,{level:'ultra',overrides:{shadows:'media',water:'simples'}});assert.equal(new PlayerPreferences(storage).values.damage,false);
preferences.update({damage:true});assert.equal(new PlayerPreferences(storage).values.graphics.level,'ultra');
preferences.update({graphics:{level:'maximo',overrides:{shadows:'altissimas',resolution:3,fpsLimit:30,bogus:1}}});assert.deepEqual(new PlayerPreferences(storage).values.graphics,{level:'auto',overrides:{fpsLimit:30}});
preferences.update({graphics:'ultra'});assert.deepEqual(new PlayerPreferences(storage).values.graphics,{level:'auto',overrides:{}});
// Saved before the Gráficos tab: realistic lake water and the film look become changes to Automático, once.
data.set(PREFERENCES_KEY,JSON.stringify({realisticWater:true,cinematic:'off',damage:true}));
{const migrated=new PlayerPreferences(storage);assert.deepEqual(migrated.values.graphics,{level:'auto',overrides:{water:'realista',post:'off'}});assert.equal(migrated.values.damage,true);assert.equal('realisticWater' in migrated.values,false);assert.equal('cinematic' in migrated.values,false);
 migrated.update({graphics:{level:'baixo',overrides:{}}});assert.deepEqual(new PlayerPreferences(storage).values.graphics,{level:'baixo',overrides:{}},'old keys never come back once graphics is saved');}
data.set(PREFERENCES_KEY,JSON.stringify({realisticWater:'on',cinematic:'auto'}));assert.deepEqual(new PlayerPreferences(storage).values.graphics,{level:'auto',overrides:{}});
// The performance overlay: off and in the automatic corner unless the player picks otherwise.
for(const debugOverlay of ['fps','full','off']){preferences.update({debugOverlay});assert.equal(new PlayerPreferences(storage).values.debugOverlay,debugOverlay);}
for(const bad of ['on',true,null])assert.equal((preferences.update({debugOverlay:bad}),new PlayerPreferences(storage).values.debugOverlay),'off');
for(const debugCorner of ['tl','tc','tr','bl','br','auto']){preferences.update({debugCorner});assert.equal(new PlayerPreferences(storage).values.debugCorner,debugCorner);}
assert.equal((preferences.update({debugCorner:'middle'}),new PlayerPreferences(storage).values.debugCorner),'auto');
preferences.update({damage:false});
// Koyzinho Indestrutível is opt-in and kept after a reload; anything but a boolean falls back to off.
preferences.update({aceKoyzinho:true});assert.equal(new PlayerPreferences(storage).values.aceKoyzinho,true);
preferences.update({aceKoyzinho:'yes'});assert.equal(new PlayerPreferences(storage).values.aceKoyzinho,false);
// Rivals' level: Fácil (the original field) unless the player picks Médio, Alto or Impossível.
for(const level of ['medio','alto','impossivel','facil']){preferences.update({aiLevel:level});assert.equal(new PlayerPreferences(storage).values.aiLevel,level);}
for(const bad of ['dificil','IMPOSSIVEL',3,null])assert.equal((preferences.update({aiLevel:bad}),new PlayerPreferences(storage).values.aiLevel),'facil',`aiLevel ${bad} falls back to facil`);
// Breakdowns (Abandonos) are on unless turned off; anything but a boolean falls back to on.
preferences.update({retirements:false});assert.equal(new PlayerPreferences(storage).values.retirements,false);
preferences.update({retirements:'no'});assert.equal(new PlayerPreferences(storage).values.retirements,true);
// The classic cockpit interior is opt-in: the V06 body round the controls is the default.
preferences.update({classicInterior:true});assert.equal(new PlayerPreferences(storage).values.classicInterior,true);
preferences.update({classicInterior:'yes'});assert.equal(new PlayerPreferences(storage).values.classicInterior,false);
for(const corrupted of ['{"damage":1}','{"realisticWater":1}','{"graphics":["ultra"]}','not json','null','[]','42','{"immersive":"false","livery":"../../private","camera":"bad"}','{"circuit":{"toString":42}}']){
 data.set(PREFERENCES_KEY,corrupted);
 assert.deepEqual(new PlayerPreferences(storage).values,{immersive:true,livery:'assinaturas_omp',camera:'chase',circuit:'interlagos',damage:false,aceKoyzinho:false,aiLevel:'facil',retirements:true,classicInterior:false,graphics:{level:'auto',overrides:{}},debugOverlay:'off',debugCorner:'auto',duelRival:'73',fuscaDuelRival:'20',car:'99',fuscaCar:'99',carModel:'opala',carStill:false,laps:3,storyLaps:8,timeOfDay:'dia',rain:'seco',ghost:false,drivingLine:'desligada',padSteering:'normal',padRumble:true,gearbox:'automatico',wheelLock:270,classicMenus:false,raceMode:'single'});
}
const denied=new PlayerPreferences({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});
assert.doesNotThrow(()=>denied.update({immersive:false,camera:'orbit'}));
assert.equal(denied.values.immersive,false);
// The weather: day and dry unless picked; anything unknown falls back to them.
preferences.update({timeOfDay:'noite',rain:'chuva'});assert.deepEqual([new PlayerPreferences(storage).values.timeOfDay,new PlayerPreferences(storage).values.rain],['noite','chuva']);
preferences.update({timeOfDay:'madrugada',rain:'neve'});assert.deepEqual([preferences.values.timeOfDay,preferences.values.rain],['dia','seco']);
// Aleatório is kept as it is (main.js draws a real one for each race).
preferences.update({timeOfDay:'aleatorio',rain:'aleatorio'});assert.deepEqual([new PlayerPreferences(storage).values.timeOfDay,new PlayerPreferences(storage).values.rain],['aleatorio','aleatorio']);
preferences.update({timeOfDay:'dia',rain:'seco'});
// Race length: 3 laps unless the player picks another whole number from 1 to 20.
preferences.update({laps:5});assert.equal(new PlayerPreferences(storage).values.laps,5);
preferences.update({laps:1});assert.equal(new PlayerPreferences(storage).values.laps,1);
for(const bad of [0,21,2.5,'4',null,-3])assert.equal((preferences.update({laps:bad}),new PlayerPreferences(storage).values.laps),3,`laps ${bad} falls back to 3`);
console.log('Preferences passed: defaults, both modes, independent fields, invalid data and unavailable storage.');
// The film look is a graphics setting now: the old key is not kept.
preferences.update({cinematic:'lite'});assert.equal(new PlayerPreferences(storage).values.cinematic,undefined);
preferences.update({duelRival:'19'});assert.equal(new PlayerPreferences(storage).values.duelRival,'19');
// The 99 is a 1x1 rival too (when the player races another team's car); an unknown number is not.
preferences.update({duelRival:'99'});assert.equal(new PlayerPreferences(storage).values.duelRival,'99');
preferences.update({duelRival:'98'});assert.equal(new PlayerPreferences(storage).values.duelRival,'73');
preferences.update({duelRival:19});assert.equal(new PlayerPreferences(storage).values.duelRival,'73');
// Modo Corrida's car (the car screen): the 99 unless the player picks another car of the grid.
for(const car of ['73','2','19','99']){preferences.update({car});assert.equal(new PlayerPreferences(storage).values.car,car);}
for(const bad of ['98','',73,null,'../99'])assert.equal((preferences.update({car:bad}),new PlayerPreferences(storage).values.car),'99',`car ${bad} falls back to 99`);
// Its model (the car screen's tabs): the Opala unless the player picks the Fusca.
preferences.update({carModel:'fusca'});assert.equal(new PlayerPreferences(storage).values.carModel,'fusca');
// The Fusca tab keeps its own car and 1x1 rival, among the Copa Fusca's numbers (race-roster.js FUSCA_CHOICES).
preferences.update({fuscaCar:'33',fuscaDuelRival:'79'});assert.deepEqual([new PlayerPreferences(storage).values.fuscaCar,new PlayerPreferences(storage).values.fuscaDuelRival],['33','79']);
for(const bad of ['73','2','',33,null])assert.deepEqual((preferences.update({fuscaCar:bad,fuscaDuelRival:bad}),[new PlayerPreferences(storage).values.fuscaCar,new PlayerPreferences(storage).values.fuscaDuelRival]),['99','20'],`fusca car ${bad} falls back`);
preferences.update({car:'73',fuscaCar:'4'});assert.deepEqual([new PlayerPreferences(storage).values.car,new PlayerPreferences(storage).values.fuscaCar],['73','4'],'each tab its own car');
for(const bad of ['kombi','',1,null])assert.equal((preferences.update({carModel:bad}),new PlayerPreferences(storage).values.carModel),'opala',`carModel ${bad} falls back to opala`);
preferences.update({carStill:true});assert.equal(new PlayerPreferences(storage).values.carStill,true,'the turntable held still is kept');
for(const bad of ['sim',1,null])assert.equal((preferences.update({carStill:bad}),new PlayerPreferences(storage).values.carStill),false,`carStill ${bad} falls back to turning`);
// The controller: Normal steering and rumble on unless the player picks otherwise.
for(const padSteering of ['suave','direta','normal']){preferences.update({padSteering});assert.equal(new PlayerPreferences(storage).values.padSteering,padSteering);}
for(const bad of ['forte','',1,null])assert.equal((preferences.update({padSteering:bad}),new PlayerPreferences(storage).values.padSteering),'normal',`padSteering ${bad} falls back to normal`);
preferences.update({padRumble:false});assert.equal(new PlayerPreferences(storage).values.padRumble,false);
preferences.update({padRumble:'off'});assert.equal(new PlayerPreferences(storage).values.padRumble,true);
// Câmbio: automatic unless the player picks manual; a wheel's full lock 270° unless one of the listed.
preferences.update({gearbox:'manual'});assert.equal(new PlayerPreferences(storage).values.gearbox,'manual');
for(const bad of ['manual ','auto',true,null])assert.equal((preferences.update({gearbox:bad}),new PlayerPreferences(storage).values.gearbox),'automatico',`gearbox ${bad} falls back to automatico`);
// The menus' look (menus.css) and the track screen's race mode: kept, anything else falls back to the defaults.
preferences.update({classicMenus:true,raceMode:'duel'});assert.equal(new PlayerPreferences(storage).values.classicMenus,true);assert.equal(new PlayerPreferences(storage).values.raceMode,'duel');
for(const bad of ['sim',1,null])assert.equal((preferences.update({classicMenus:bad}),new PlayerPreferences(storage).values.classicMenus),false,`classicMenus ${bad} falls back to false`);
for(const bad of ['grid','',null])assert.equal((preferences.update({raceMode:bad}),new PlayerPreferences(storage).values.raceMode),'single',`raceMode ${bad} falls back to single`);
for(const wheelLock of [180,540,900,270]){preferences.update({wheelLock});assert.equal(new PlayerPreferences(storage).values.wheelLock,wheelLock);}
for(const bad of ['540',1080,0,null])assert.equal((preferences.update({wheelLock:bad}),new PlayerPreferences(storage).values.wheelLock),270,`wheelLock ${bad} falls back to 270`);
