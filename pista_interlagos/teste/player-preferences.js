import {circuitId} from './circuits.js';
import {DUEL_DEFAULT,carEntry,duelDefault,AI_LEVELS,PLAYER_CAR_DEFAULT,CAR_MODELS,CAR_MODEL_DEFAULT} from './race-roster.js';
import {normalizeGraphics,DEBUG_OVERLAY_MODES,DEBUG_OVERLAY_CORNERS} from './graphics-settings.js';
import {WHEEL_LOCKS,WHEEL_LOCK_DEFAULT} from './wheel-controls.js';
import {timeChoice,rainChoice} from './weather.js';
export const PREFERENCES_KEY='opala99-preferences-v1';
// 'tv' films from the trackside towers and verge cameras (tv-camera.js).
// Race length in laps, for the free race and the story alike, on every circuit.
export const LAPS=Object.freeze({min:1,max:20,standard:3});
// 'far' is the old high Perseguição; chase and close ride low behind the car (camera-rig.js).
export const CAMERA_MODES=Object.freeze(['chase','close','far','hood','cockpit','tv','aerial','orbit']);
// The driving line's modes, in the order O goes round them.
export const LINE_MODES=Object.freeze(['desligada','completa','curvas']);
const liveries=['assinaturas_omp','seiva_danilo'];
export function normalizePreferences(value){
 const source=value&&typeof value==='object'?value:{};
 return {
  immersive:typeof source.immersive==='boolean'?source.immersive:true,
  livery:liveries.includes(source.livery)?source.livery:'assinaturas_omp',
  camera:CAMERA_MODES.includes(source.camera)?source.camera:'chase',
  circuit:circuitId(source.circuit),
  // Car damage and wear (power, brakes, grip) is an opt-in realism setting.
  damage:typeof source.damage==='boolean'?source.damage:false,
  // "Koyzinho Indestrutível": Koyzinho (#2) races as the ace, from the back of the grid. Opt-in.
  aceKoyzinho:typeof source.aceKoyzinho==='boolean'?source.aceKoyzinho:false,
  // Rivals' level (race-roster.js AI_LEVELS): 'facil' is the original field.
  aiLevel:AI_LEVELS.includes(source.aiLevel)?source.aiLevel:'facil',
  // Breakdowns (race-field.js): one to four rivals retire in every race, as in the Old Stock. On unless turned off.
  retirements:typeof source.retirements==='boolean'?source.retirements:true,
  // The cockpit view shows the V06 body round the controls; true keeps the old box interior.
  classicInterior:typeof source.classicInterior==='boolean'?source.classicInterior:false,
  // Graphics (graphics-settings.js): a level, "Automático" unless picked, and the settings changed by
  // hand. It took over the lake water and film look settings saved before (realisticWater, cinematic).
  graphics:normalizeGraphics(source.graphics,source),
  // Performance overlay (debug-overlay.js, F3): off unless asked for, and its corner.
  debugOverlay:DEBUG_OVERLAY_MODES.some(([v])=>v===source.debugOverlay)?source.debugOverlay:'off',
  debugCorner:DEBUG_OVERLAY_CORNERS.some(([v])=>v===source.debugCorner)?source.debugCorner:'auto',
  // The rival of the 1x1 (Modo Corrida's track screen), by car number (the 99 when the player races another car);
  // fuscaDuelRival: the one of the Copa Fusca's field (race-roster.js), when the race is in Fuscas.
  duelRival:typeof source.duelRival==='string'&&carEntry(source.duelRival)?source.duelRival:DUEL_DEFAULT,
  fuscaDuelRival:typeof source.fuscaDuelRival==='string'&&carEntry(source.fuscaDuelRival,'fusca')?source.fuscaDuelRival:duelDefault('fusca'),
  // The car the player races in Modo Corrida (the car screen, car-select.js), by number; the story is the 99's.
  // fuscaCar: the one picked on the Fusca tab, among the Copa Fusca's cars.
  car:typeof source.car==='string'&&carEntry(source.car)?source.car:PLAYER_CAR_DEFAULT,
  fuscaCar:typeof source.fuscaCar==='string'&&carEntry(source.fuscaCar,'fusca')?source.fuscaCar:PLAYER_CAR_DEFAULT,
  // Its model (the car screen's tabs): the Opala unless the player picks the Fusca.
  carModel:CAR_MODELS.includes(source.carModel)?source.carModel:CAR_MODEL_DEFAULT,
  // The car screen's turntable held still (its Parar de girar box): it turns unless the player stops it.
  carStill:typeof source.carStill==='boolean'?source.carStill:false,
  // Laps of every race (Modo Corrida and Modo História): 3 unless the player picks more or fewer.
  laps:Number.isInteger(source.laps)&&source.laps>=LAPS.min&&source.laps<=LAPS.max?source.laps:LAPS.standard,
  // The race's weather (weather.js): the time of day (dia, fim_de_tarde, noite) and the rain (seco, garoa, chuva), or
  // aleatorio for either (drawn at each race). Day and dry unless the player picks otherwise, in both modes.
  timeOfDay:timeChoice(source.timeOfDay),
  rain:rainChoice(source.rain),
  // The ghost of the pilot's best lap on the circuit (G, ghost-lap.js): off unless turned on.
  ghost:typeof source.ghost==='boolean'?source.ghost:false,
  // The driving line on the asphalt (O, driving-line.js): the whole lap, only round the corners, or off unless picked.
  drivingLine:LINE_MODES.includes(source.drivingLine)?source.drivingLine:'desligada',
  // Xbox / PlayStation controller (gamepad-controls.js): how the left stick steers, and the shake on impacts.
  padSteering:['suave','normal','direta'].includes(source.padSteering)?source.padSteering:'normal',
  padRumble:typeof source.padRumble==='boolean'?source.padRumble:true,
  // Câmbio (the Controles tab): automatic unless the player shifts the gears (manual-gearbox.js).
  gearbox:['automatico','manual'].includes(source.gearbox)?source.gearbox:'automatico',
  // A racing wheel's full lock in the game, in degrees from one side to the other (wheel-controls.js).
  wheelLock:WHEEL_LOCKS.includes(source.wheelLock)?source.wheelLock:WHEEL_LOCK_DEFAULT
 };
}
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export class PlayerPreferences {
 constructor(storage=browserStorage()){
  this.storage=storage;let saved;
  try{saved=JSON.parse(storage?.getItem(PREFERENCES_KEY)||'null');}catch{}
  this.values=normalizePreferences(saved);
 }
 update(patch){
  this.values=normalizePreferences({...this.values,...patch});
  try{this.storage?.setItem(PREFERENCES_KEY,JSON.stringify(this.values));}catch{}
 }
}
