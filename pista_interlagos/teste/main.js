import {PitStop} from './pitstop.js';
import {FreeWalk,pilotOutfit} from './free-walk.js';
import {pitLane} from './pit-lane.js';
import {createInterlagosPit} from './interlagos-pit.js';
import {createCurveloPit} from './pit-building.js';
import {CIRCUITS,selectedCircuit,mapProjection,fixedLaps,raceLaps,placeOf} from './circuits.js';
import {tankFor} from './fuel.js';
import {createCurveloData} from './curvelo-data.js';
import {createCurveloScene} from './curvelo-scene.js';
import {createOpenCircuit,lapRoad} from './open-circuit.js';
import {RaceResults,resultRows} from './race-results.js';
import {Championship,calendarsFor,championshipCalendar,titleStakes} from './championship.js';
import {renderChampionshipPanel,ChampionshipDialog} from './championship-board.js';
import {LapRecords,AutomaticRecords,trackRecords} from './lap-records.js';
import {AutomaticAIRecords} from './ai-records.js';
import {PilotPicker,pilotStorage} from './pilot-profile.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,clamp,wrap,recognitionInput,RIGHTING_DELAY,OPALA_BODY,FUSCA_BODY,addRoamSolids} from './physics.js';
import {PLAYER_ENTRY,ACE_NUMBER,playerGridSlot,carEntry,fieldRoster,duelRivalFor,cssColor,MODEL_NAMES,LUIZAO_CARS} from './race-roster.js';
import {CarSelect} from './car-select.js';
import {LookSelect} from './look-select.js';
import {LookStore} from './pilot-look.js';
import {CarLivery,trunkInside,showTrunkInside,trimDecalTails} from './car-livery.js';
import {finishMesh,finishMaterial} from './car-finish.js';
import {CarReflections} from './car-reflections.js';
import {FuscaBody,prepareFusca,FUSCA_URL,FUSCA_SEAT,FUSCA_EYE,FUSCA_HOOD_EYE,FUSCA_BOOT_EYE,FUSCA_WHEEL_TRAVEL,FUSCA_WHEEL_BUMP} from './fusca.js';
import {createTrackSurface,createGuardrails,createCurbs,createTrackBranding} from './track-surface.js';
import {createCockpit} from './cockpit.js?v=20260927-omp-retrovisores';
import {CarOpenings,OPENINGS,showOnly} from './car-openings.js';
import {SideMirrors} from './side-mirrors.js';
import {createBrakeLights,lampUVs,TAIL_LIGHTS} from './brake-lights.js';
import {PlayerHeadlights,createHeadlights,lampSetFor,setGlare,lampPatch,updateRoadLamps,ROAD_LAMPS} from './headlights.js';
import {SWITCH_TILT} from './cockpit-instruments.js';
import {Rain,RAIN_DROPS} from './rain.js';
import {prepareWipers,WindscreenRain,WIPER_PROFILES,wipersOf} from './windscreen-rain.js';
import {createFloodlights,FLOOD} from './floodlights.js';
import {CameraReturn,LookBack,turnHead,neckTwist,HEAD_YAW_COCKPIT,HEAD_YAW_HOOD} from './camera-return.js';
import {CameraRig,CAMERA_FRAMES,FOLLOW_FRAMES,baseFov,speedFov as lensFov,easeLens,dolly,frameFor,topSpeed,vibration,carPoints,carScale} from './camera-rig.js';
import {clearView} from './on-foot.js';
import {createDriver} from './driver.js?v=20260923-controls';
import {SkidMarks} from './skid-marks.js?v=20260923-capotagem';
import {TyreSmoke} from './tyre-smoke.js?v=20261005-poeira-folhas';
import {ImmersiveMode} from './immersive-mode.js';
import {ImmersiveState} from './immersive-state.js';
import {stageOf,deadlineText,MORALE,MORALE_NAMES,GAME_OVER,BLAZER_GOAL,OPALA_GOAL,STORY_PROFILE_KEY,PENSION,standsFill} from './story-career.js';
import {MobileControls} from './mobile-controls.js';
import {GamepadControls} from './gamepad-controls.js';
import {WheelControls} from './wheel-controls.js';
import {WheelPanel} from './wheel-panel.js';
import {playerKeys,installKeyBindings,applyKeyLabels,keyName} from './key-bindings.js';
import {KeysPanel} from './keys-panel.js';
import {PadPanel} from './pad-panel.js';
import {ManualGearbox,AutoShift} from './manual-gearbox.js';
import {BrakeReverse} from './brake-reverse.js';
import {setupSettings} from './settings.js';
import {CarAudio} from './car-audio.js?v=20260913-immersive';
import {CornerCallouts} from './corner-callouts.js';
import {PlayerPreferences,CAMERA_MODES,LAPS,LINE_MODES} from './player-preferences.js';
import {createSky,SUN_DIRECTION} from './sky.js';
import {weatherProfile,weatherCaption,TIME_CHOICES,RAIN_CHOICES,RANDOM_WEATHER,drawWeather,chosenWeather,rainOdds,raceMonth,rainFor,EFFECT_LIGHT,STAND_LIGHTS,TIMES_OF_DAY,RAIN_LEVELS,nextTimeOfDay,nextRainLevel,weatherName} from './weather.js';
import {createCinematic,SMEAR_CARS,compileInSlices} from './cinematic.js';
import {SunPlacement} from './sun-light.js';import {CarShadow} from './car-shadow.js';import {steeringWheelAngle} from './driver-rig.js';
import {createLandscape,loadTerrainTextures,buildTrackField,readOrtho,looseGround,terrainMaterial,structureMaterial,createCrowd,SKYLINE_FAR} from './landscape.js';
import {LakeContact} from './lake-contact.js';
import {fitGround,applyGroundHeights,groundHeight} from './track-clearance.js';
import {smoothVerges} from './track-verge.js';
import {createGrandstands} from './interlagos-stands.js';
import {createTrackside} from './trackside.js';
import {createFlagField} from './trackside-flags.js';
import {updatePeople,setPeopleReach,hitPeople,takePeopleEvents,tumbleInfo} from './pit-crew.js';
import {TreeField} from './tree-contact.js';
import {TvCamera} from './tv-camera.js';
import {trackFall,FallView,fallInSight} from './cliff-fall.js';
import {createFarTerrain} from './far-terrain.js';
import {createSea,lakeWater} from './sea-water.js';
import {createFloripaBridges} from './floripa-bridges.js';
import {createFloripaLandmarks} from './floripa-landmarks.js';
import {createMinhocaoStructures} from './minhocao-structures.js';
import {createMinhocaoLandmarks,hasMinhocaoLandmarks} from './minhocao-landmarks.js';
import {createPampulhaEstadios,hasPampulhaEstadios} from './pampulha-estadios.js';
import {createPampulhaIgrejinha,hasPampulhaIgrejinha} from './pampulha-igrejinha.js';
import {createPampulhaFauna,hasPampulhaFauna} from './pampulha-fauna.js';
import {createPampulhaGuanabara,hasPampulhaGuanabara} from './pampulha-guanabara.js';
import {createPampulhaNiemeyer,hasPampulhaNiemeyer} from './pampulha-niemeyer.js';
import {createPampulhaOrla,hasPampulhaOrla} from './pampulha-orla.js';
import {createPampulhaBarragem,hasPampulhaBarragem} from './pampulha-barragem.js';
import {createPampulhaParques,hasPampulhaParques} from './pampulha-parques.js';
import {createPampulhaPontes,hasPampulhaPontes} from './pampulha-pontes.js';
import {createPampulhaFutebol,hasPampulhaFutebol} from './pampulha-futebol.js';
import {createFlyingSaucer,hasFlyingSaucer} from './flying-saucer.js';
import {createBranchScenery} from './branch-scenery.js';
import {createClosedRoads,hasClosedRoads} from './closed-roads.js';
import {hasBranches} from './branch-layout.js';
import {createCityStreets} from './city-streets.js';
import {createStreetClosures} from './street-closures.js';
import {createCityFurniture} from './city-furniture.js';
import {createBeiraMar} from './beira-mar.js';
import {loadCityMap} from './city-map.js';
import {createCityBuildings} from './city-buildings.js';
import {citySpectators} from './city-crowd.js';
import {createCityLife} from './city-life.js';
import {createCityTraffic} from './city-traffic.js';
import {createCityRace} from './city-race.js';
import {Explosions} from './explosion.js';
import {trackPoint as podiumPoint} from './immersive-visuals.js';
import {CinematicIntro} from './intro-cinematic.js';
import {TrackHistory} from './track-history.js';
import {HISTORIAS} from './historias.js';
import {resolveGraphics,resolutionFloor,ResolutionPace,gpuTier,autoLevel,autoReason,lowerLevel,FrameWatch,FrameLimiter,DisplayCadence,adaptivePixelRatio,SHADOW_LEVELS,VIEW_DISTANCES,VALLEY_VIEW,SCENERY_LEVELS,MIRROR_SIZES,CAR_DETAIL,PEOPLE_REACH,GRAPHICS_LEVEL_NAMES,GRAPHICS_OPTIONS,DEBUG_OVERLAY_MODES,DEBUG_OVERLAY_CORNERS} from './graphics-settings.js';
import {GraphicsPanel} from './graphics-panel.js';
import {DebugOverlay} from './debug-overlay.js';
import {PerfProbe,freezeStatic,splitByCells,cullBoxes,farMerge} from './perf-probe.js';
import {RaceAction,ActionNotice} from './race-action.js';
import {GhostRecorder,loadGhost,saveGhost} from './ghost-lap.js';
import {GhostCar} from './ghost-car.js';
import {DrivingLineView} from './driving-line-view.js';
import {carContact} from './contact-shadows.js';
import {prepareWheels,setTyreDetail} from './car-wheels.js';
import {createSpeedEffects,releaseWakeCars} from './speed-particles.js';
import {rideKerbs,kerbSound} from './kerb-contact.js';
import {DRIFT_ARENA,createArenaData,floorOutline} from './drift-arena.js';
import {ArenaMode} from './drift-arena-mode.js';
import {DriftCar} from './drift-physics.js';
import {createArenaScene,arenaLandscape,oldStockPicture} from './drift-arena-scene.js';
const $=id=>document.getElementById(id);
// Inside another site's frame (a page that lays its own buttons over the game to steer the player's
// clicks) the game does not start: a link opens it at its own address. The header that forbids the
// frame outright (frame-ancestors) comes from Cloudflare's proxy, not from GitHub Pages: this holds
// should that ever be off (SEGURANCA.md).
if(window.top!==window.self){
 const link=document.createElement('a');link.href=location.href;link.target='_top';link.textContent='Abrir o Auto-Pobre Racing';
 link.style.cssText='display:block;margin:30vh auto 0;width:max-content;padding:14px 22px;border-radius:8px;background:#e2fb57;color:#111;font:700 18px system-ui,sans-serif;text-decoration:none';
 document.body.replaceChildren(link);
 await new Promise(()=>{});
}
// The player's keys (Controles tab, key-bindings.js): every keyboard event reads through them from here on.
installKeyBindings(playerKeys);
const touchDevice=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;let mobile;
const preferences=new PlayerPreferences();
// The menus' look: the paddock restyle of 2026-10 (menus.css; index.html opens with it), unless the settings' Menus
// clássicos box brings back the boxes and filled buttons of before.
const paddockMenus=()=>document.documentElement.classList.contains('menus-paddock');
document.documentElement.classList.toggle('menus-paddock',!preferences.values.classicMenus);
let circuit=selectedCircuit(preferences.values.circuit,window.location.search);
preferences.update({circuit:circuit.id});
// Screens while no race runs: the opening (pilot, then Modo Corrida or Modo História) or the
// track screen, where the player picks the circuit and a single race or the championship of
// that mode. Finishing or leaving a race comes back to the track screen.
let screen='opening',menuMode=preferences.values.immersive?'historia':'corrida';
// História do autódromo (track-history.js): the circuits whose story can be watched (historias.js), from the track
// screen and from the opening's História das Corridas; loaded only when asked for (the script brings the old layout
// and the pictures with it).
const HISTORIES=Object.fromEntries(HISTORIAS.map(h=>[h.circuit,h.load]));
function showCircuitSelection(){
 document.title=`${circuit.name} · Auto-Pobre Racing`;
 document.querySelector('.wordmark').firstChild.textContent=$('mapTitle').textContent=circuit.name.toUpperCase();
 document.querySelector('.session>span').textContent=circuit.length.toLocaleString('pt-BR')+' m';
 document.querySelector('.maplabel').firstChild.textContent=circuit.label;
 $('circuitDescription').textContent=circuit.description;$('circuitIntro').textContent=circuit.intro;
 $('circuitSource').textContent=circuit.source+' Reconstrução para jogo; física e instalações simplificadas.';
 $('historyStart').hidden=!HISTORIES[circuit.id];
 document.querySelector('#menu article>p').textContent=circuit.intro;
 for(const button of document.querySelectorAll('[data-circuit]'))button.setAttribute('aria-pressed',String(button.dataset.circuit===placeOf(circuit.id)));
 for(const box of layoutBoxes)showCardLayout(box,placeOf(circuit.id)===CIRCUITS[box.dataset.variant].variantOf?circuit.id===box.dataset.variant:box.checked);
 showHero(circuit.id);
}
// Another layout of a card's autódromo (circuits.js variantOf: Chapecó's oval): a box on that card picks it. Ticked, the
// card shows the layout's outline, name, figures and best lap (data-* on the box; the card's own, kept in data-own, come
// back unticked), and the card picks the layout until it is unticked, while another circuit is chosen too.
const layoutBoxes=[...document.querySelectorAll('.track-cards [data-variant]')];
function showCardLayout(box,on){
 const card=box.closest('.track-card-group').querySelector('[data-circuit]'),path=card.querySelector('path'),[b,span,small,em]=['b','span','small','em'].map(k=>card.querySelector(k));
 card.dataset.own??=JSON.stringify({path:path.getAttribute('d'),name:b.textContent,span:span.textContent,small:small.textContent,best:em.dataset.best});
 const v=on?{...box.dataset,best:box.dataset.variant}:JSON.parse(card.dataset.own);
 path.setAttribute('d',v.path);b.textContent=v.name;span.textContent=v.span;small.textContent=v.small;
 if(em.dataset.best!==v.best){em.dataset.best=v.best;em.textContent='';}
 box.checked=on;
}
const cardLayout=id=>layoutBoxes.find(box=>box.checked&&CIRCUITS[box.dataset.variant].variantOf===id)?.dataset.variant??id;
// The circuit in big beside the list (paddock look): its outline, name, place and figures, as its card has them, and its
// best lap; round, the season's round it races (Modo História shows the round to come, not a pick).
function showHero(id,round=''){
 const card=document.querySelector(`.track-cards [data-circuit="${placeOf(id)}"]`);if(!card)return;
 const [length,...place]=card.querySelector('span').textContent.split(' · ');
 $('trackHeroPath').setAttribute('d',card.querySelector('path').getAttribute('d'));$('trackHeroName').textContent=card.querySelector('b').textContent;$('trackHeroPlace').textContent=place.join(' · ');
 $('trackHeroStats').replaceChildren(...[length,...card.querySelector('small').textContent.split(' · ')].map(text=>Object.assign(document.createElement('li'),{textContent:text})));
 $('trackHeroRound').textContent=round;$('trackHeroBest').textContent=document.querySelector(`[data-best="${id}"]`)?.textContent??'';
}
// Behind it, the circuit seen from the air at the golden hour (scripts/gerar_fotos_pistas.py), faded in once it has
// loaded; only asked for when the track screen shows. A circuit without one (not in CIRCUIT_SCENES, the same list as
// publicacao.py's) keeps the plain backdrop.
const CIRCUIT_SCENES=new Set(['interlagos','cascavel','piracicaba','chapeco','brasilia','goiania','guaratiba','velocitta','chapada','floripa','minhocao','pampulha','curvelo']);
let heroPhoto=null;
function showCircuitPhoto(id){
 id=placeOf(id);if(heroPhoto===id)return;heroPhoto=id;const layer=$('trackPhoto'),img=new Image();layer.classList.remove('shown');if(!CIRCUIT_SCENES.has(id))return;
 img.onload=()=>{if(heroPhoto!==id)return;layer.style.backgroundImage=`url("${img.src}")`;layer.classList.add('shown');};img.src=`./assets/circuitos/cenas/${id}.webp`;
}
showCircuitSelection();
function selectCircuit(id){
 if(!Object.hasOwn(CIRCUITS,id))return;
 circuit=CIRCUITS[id];preferences.update({circuit:circuit.id});lapRecords.circuit=circuit.id;
 const url=new URL(window.location.href);url.searchParams.set('circuito',circuit.id);history.replaceState(null,'',url.href);
 showCircuitSelection();updateMenuLabels();fillBestLaps();showHero(circuit.id);
}
// A track card picks its circuit, or the layout ticked on it; the records' own button picks just what it says.
for(const button of document.querySelectorAll('[data-circuit]'))button.onclick=()=>{if(!sessionStarted&&!loading)selectCircuit(button.closest('.track-cards')?cardLayout(button.dataset.circuit):button.dataset.circuit);};
for(const box of layoutBoxes)box.onchange=()=>{
 if(sessionStarted||loading){box.checked=circuit.id===box.dataset.variant;return;}
 selectCircuit(box.checked?box.dataset.variant:CIRCUITS[box.dataset.variant].variantOf);
};
let projectMap;
// The circuit's stands crowd (landscape.js createCrowd): full in Modo Corrida, as full as the supporters' morale in Modo
// História (story-career.js standsFill: 15% at a career's start), checked every frame, changed only when it differs.
let standsCrowd=null;
const fillStands=()=>standsCrowd?.fill(immersive?.active?standsFill(immersive.state.profile.career?.morale?.torcida??50):1);
$('livery').value=preferences.values.livery;
$('camera').value=preferences.values.camera;
$('carDamage').checked=preferences.values.damage;
$('classicMenus').checked=preferences.values.classicMenus;
$('classicMenus').onchange=()=>{preferences.update({classicMenus:$('classicMenus').checked});document.documentElement.classList.toggle('menus-paddock',!preferences.values.classicMenus);updateMenuLabels();showRaceMode();carSelect.show();};
// Damage and wear: Modo Corrida's setting; always on in Modo História, whose career counts on it (the team's
// morale makes the knocks harder or softer, story-career.js), with the car's condition on screen (pitstop.js).
// Applied when what it should be changes (the mode, the setting) or a circuit's pit stop is built (force).
const damageOn=()=>preferences.values.damage||!!immersive?.active;let damageApplied=null;
function syncDamage(force=false){const want=damageOn();if(!pitstop||want===damageApplied&&!force)return;damageApplied=want;pitstop.setDamage(want);}
$('carDamage').onchange=()=>{preferences.update({damage:$('carDamage').checked});syncDamage();};
// The grid list in the race settings; Koyzinho is marked while he races as the ace. Fácil shows the
// standings pace, the harder levels the pilots' table.
// The player's car is the 99 or, in Modo Corrida, the car screen's choice, whose driver then sits out
// and the 99 races in its seat (race-roster.js fieldRoster).
// The car each tab of the car screen keeps (the Opala's and the Fusca's fields have their own numbers,
// race-roster.js), and the 1x1's rival picked in that field.
const chosenCar=model=>model==='fusca'?preferences.values.fuscaCar:preferences.values.car;
const chosenDuel=model=>model==='fusca'?preferences.values.fuscaDuelRival:preferences.values.duelRival;
// The car of the next race: Modo Corrida's choice (in a multiplayer room, the car the room gave this
// window, multiplayer.js car); the story races the 99, so it skips the car screen.
const menuCar=()=>menuMode==='historia'?'99':multiplayer?.car()??chosenCar(menuModel());
// Its model: Modo Corrida's Fusca tab (fusca.js) or the Opala; the story and a room's race are Opalas.
const menuModel=()=>menuMode==='historia'||roomWanted?'opala':preferences.values.carModel;
const carScreen=()=>menuMode==='corrida'||menuMode==='drift';
// The settings' grid list: the field racing now or, between races, the next one. Rebuilt each time
// the settings open (openSettings).
function showRoster(){
 // own: the Opala 99, the player's team's car; in the Fusca's field the 99 is Cristiano Canto's.
 const roster=$('gridRoster'),mine=sessionStarted?raceCar:menuCar(),field=sessionStarted?raceModel:menuModel(),own=mine==='99'&&field!=='fusca',you=own?PLAYER_ENTRY:carEntry(mine,field);roster.replaceChildren();
 // A multiplayer guest races in the host's field (raceGrid): in its own car's seat, the host's car at the back.
 const back=sessionStarted?raceGrid:mine,host=back===mine?null:back==='99'?PLAYER_ENTRY:carEntry(back);
 for(const entry of [...fieldRoster(back,field).map(e=>host&&e.number===mine?you:e),host??you]){const row=document.createElement('li');row.textContent=entry===host?`#${back} · ANFITRIÃO${back==='99'?'':`, no carro de ${host.name}`}`:entry===you&&!own?`#${mine} · VOCÊ, no carro de ${you.name}`:`#${entry.number} · ${entry.name}${entry===you?' · VOCÊ':entry.number===ACE_NUMBER&&preferences.values.aceKoyzinho?' · Indestrutível':preferences.values.aiLevel==='facil'?` · Ritmo ${entry.level}/100`:` · Nível ${entry.skill}/10`}`;roster.append(row);}
}
// Koyzinho Indestrutível: taken at the next start (RaceField.reset), like the race length.
$('aceKoyzinho').checked=preferences.values.aceKoyzinho;
$('aceKoyzinho').onchange=()=>{preferences.update({aceKoyzinho:$('aceKoyzinho').checked});if(immersive)immersive.field.ace=preferences.values.aceKoyzinho;if(ready)showRoster();};
// Rivals' level (race-roster.js AI_LEVELS): taken at the next start, like Koyzinho Indestrutível. Picked in the race
// settings or on the track screen (its options copied from the settings'): one preference.
$('tracksAiLevel').append(...[...$('aiLevel').options].map(o=>new Option(o.text,o.value)));
for(const id of ['aiLevel','tracksAiLevel']){$(id).value=preferences.values.aiLevel;
 $(id).onchange=()=>{preferences.update({aiLevel:$(id).value});for(const other of ['aiLevel','tracksAiLevel'])$(other).value=preferences.values.aiLevel;if(immersive)immersive.field.level=preferences.values.aiLevel;if(ready)showRoster();};}
// Breakdowns ("Abandonos"): taken at the next start too.
$('retirements').checked=preferences.values.retirements;
$('retirements').onchange=()=>{preferences.update({retirements:$('retirements').checked});if(immersive)immersive.field.retirements=preferences.values.retirements;};
// Race length (every circuit), picked in the race settings or on the track screen: one preference per mode (laps for Modo
// Corrida, 3 by default; storyLaps for Modo História, 8 by default, user 10-24), taken at the next start, so a race under
// way keeps its own. A circuit that fixes its race length
// (circuits.js fixedLaps: Pampulha's one lap) shows it there, locked (showLaps); the choice saved comes back elsewhere.
const lapsKey=(mode=menuMode)=>mode==='historia'?'storyLaps':'laps',chosenLaps=(mode=menuMode)=>preferences.values[lapsKey(mode)];
for(const laps of [$('raceLaps'),$('tracksLaps')]){for(let n=LAPS.min;n<=LAPS.max;n++)laps.add(new Option('',String(n)));
 laps.onchange=()=>{if(fixedLaps(circuit.id))return;preferences.update({[lapsKey()]:Number(laps.value)});showLaps();if(immersive)immersive.laps=raceLaps(circuit.id,chosenLaps());updateMenuLabels();};}
function showLaps(){
 const fixed=fixedLaps(circuit.id),standard=menuMode==='historia'?LAPS.story:LAPS.standard;
 for(const select of [$('raceLaps'),$('tracksLaps')]){
  for(const o of select.options)if(!o.dataset.fixed){const n=Number(o.value);o.textContent=`${n} volta${n>1?'s':''}${n===standard?' (padrão)':''}`;}
  let locked=select.querySelector('option[data-fixed]');if(fixed&&!locked){locked=new Option('','fixo');locked.dataset.fixed='';select.add(locked);}
  if(fixed)locked.textContent=`${fixed} volta${fixed>1?'s':''} (fixo nesta pista)`;else locked?.remove();
  select.disabled=!!fixed;select.value=fixed?'fixo':String(chosenLaps());
 }
}
showLaps();
// The weather (weather.js): the time of day and the rain, in the race settings and on the track screen, like the
// laps. One preference each; a race under way takes it at once (applyWeather). Aleatório picked draws that part
// afresh: the race under way races it, or else the next race does (the menu showed it).
for(const [key,part,choices,ids] of [['timeOfDay','time',TIME_CHOICES,['timeOfDay','tracksTime']],['rain','rain',RAIN_CHOICES,['rainLevel','tracksRain']]])for(const id of ids){
 const select=$(id);for(const [value,label] of choices)select.add(new Option(label,value));select.value=preferences.values[key];
 select.onchange=()=>{preferences.update({[key]:select.value});for(const other of ids)$(other).value=preferences.values[key];
  if(select.value===RANDOM_WEATHER)redrawWeather(part);
  applyWeather();};
}
// The 1x1's rival, on the track screen: any driver of the field the chosen car races in (options and
// labels in updateMenuLabels).
{const pick=$('duelRival');
 pick.onchange=()=>{preferences.update({[menuModel()==='fusca'?'fuscaDuelRival':'duelRival']:pick.value});updateMenuLabels();};}
$('classicInterior').checked=preferences.values.classicInterior;
$('classicInterior').onchange=()=>{preferences.update({classicInterior:$('classicInterior').checked});if(ready)cabinVisibility();};
// Graphics (the Gráficos tab, graphics-settings.js): the values in force on this device, applied by
// applyGraphics. sceneryBuilt is the scenery level the loaded circuit was built with.
// Automático goes by the device's video chip (graphics-settings.js gpuTier), read from a throwaway context before the
// game's own, and by how the races ran on it: a step down taken in a heavy race (FrameWatch) is remembered for that chip.
const AUTO_KEY='opala99-graficos-auto-v1';
const device=(()=>{
 let renderer='';try{const gl=document.createElement('canvas').getContext('webgl2')??document.createElement('canvas').getContext('webgl');const ext=gl?.getExtension('WEBGL_debug_renderer_info');renderer=String((ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER))??'');gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
 let saved=null;try{saved=JSON.parse(localStorage.getItem(AUTO_KEY)??'null');}catch{}
 const same=saved?.renderer===renderer,ratios=same&&saved.ratios&&typeof saved.ratios==='object'?saved.ratios:{};
 // ratios: the pixel density dynamic resolution settled on, per level, so the next race starts there (no stalls to find it).
 // goodRaces: races run since the step down without the watch firing again; at GOOD_RACES the step is forgotten.
 return {renderer,...gpuTier(renderer),drop:same&&typeof saved.drop==='string'?saved.drop:null,goodRaces:same&&Number.isFinite(saved.goodRaces)?saved.goodRaces:0,ratios:Object.fromEntries(Object.entries(ratios).filter(([,v])=>Number.isFinite(v)&&v>=.25&&v<=2))};
})();
const saveDevice=()=>{try{localStorage.setItem(AUTO_KEY,JSON.stringify({renderer:device.renderer,drop:device.drop,goodRaces:device.goodRaces,ratios:device.ratios}));}catch{}};
let graphics=resolveGraphics(preferences.values.graphics,{touch:touchDevice,device}),sceneryBuilt=null;
// Picking Automático again (from a level chosen by hand) forgets a step down a heavy race took: the player asks anew.
const graphicsPanel=new GraphicsPanel({root:$('settings-graphics'),touch:touchDevice,device,graphics:preferences.values.graphics,onApply:()=>{$('settings').close();beginRace(true);},onChange:value=>{
 if(value?.level==='auto'&&preferences.values.graphics?.level!=='auto'&&device.drop){device.drop=null;device.goodRaces=0;saveDevice();}
 preferences.update({graphics:value});applyGraphics();}});
// The performance overlay (debug-overlay.js): the tab's two selects, and F3 cycles it.
const displayCadence=new DisplayCadence(),action=new RaceAction(),actionNotice=new ActionNotice(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
// The frame rate dynamic resolution aims at: the screen's, under the FPS limit as the screen paces it (graphics-settings.js
// FrameLimiter slot: 60 on a 165 Hz panel needs frames of two of its frames, 82.5; one that misses waits for a third).
// Dynamic resolution aims at the player's FPS limit, never above it: the limiter may still draw on the screen's even
// slot when the video has room (60 on a 75 Hz screen draws 75, frameCap.rate), but aiming at that slot pushed a weak
// video's picture down to the floor for frames the player never asked for.
const dynamicTarget=()=>{const cap=graphics.values.fpsLimit;return displayCadence.target(graphics.values.targetFps,cap&&displayCadence.measured?Math.min(cap,frameCap.slot(displayCadence.hz)):cap);};
const debugOverlay=new DebugOverlay({renderer:()=>renderer,touch:touchDevice,lines:debugLines,target:()=>dynamicTarget(),profile:()=>!!renderer&&resolution.dynamic});
for(const [id,key,choices] of [['debugMode','debugOverlay',DEBUG_OVERLAY_MODES],['debugPlace','debugCorner',DEBUG_OVERLAY_CORNERS]]){const select=$(id);for(const [value,label] of choices)select.add(new Option(label,value));select.onchange=()=>setDebugOverlay({[key]:select.value});}
function setDebugOverlay(patch){preferences.update(patch);const {debugOverlay:shown,debugCorner:corner}=preferences.values;$('debugMode').value=shown;$('debugPlace').value=corner;debugOverlay.setMode(shown);debugOverlay.setCorner(corner);}
setDebugOverlay({});
// The opening menu picks the mode: Modo Corrida (free race) or Modo História (immersive).
function chooseImmersive(value){
 preferences.update({immersive:value});if(ready)updateMenuLabels();
}
const scene=new THREE.Scene();scene.background=new THREE.Color('#a8c8dd');
let sky,landscape,landscapeField,terrainTextures,lakeContact=null,treeField=null,cinematic,trackside=null,tvCamera=null;const tvVelocity=new THREE.Vector3();
// Flags that fly in the cars' wake, corner rods and brake boards (trackside-flags.js).
let flags=null;
// Film-style opening shots before the free race's 3-2-1 and when the story begins.
const intro=new CinematicIntro();let introHidden=null;
const trackHistory=new TrackHistory();
let renderer;
// What the cars' paint, glass and chrome reflect (car-reflections.js; the Gráficos tab's Reflexos dos carros).
// Its captures leave out the player's car, the ghost and the sprites sized for the screen.
// The scene's big parts by name, for the cost of each (perf-probe.js; interlagosGraficos.cost/hide).
const perfProbe=new PerfProbe({renderer:()=>renderer,scene,parts:()=>[['carro do jogador',carRoot],['rivais',immersive?.visual?.root],['cenário',landscape?.root],['beira da pista',trackside?.root],['bandeiras',flags?.root],['guard-rails',roadRails?.root],['zebras',roadCurbs],['postes das árvores',treeField?.points],['efeitos de velocidade',speedFx?.root],['chuva',rain?.root],['refletores',floods?.root],['marcas de pneu',skidMarks?.mesh],['fumaça',tyreSmoke?.mesh],['fantasma',ghostCar.root],['lago',lakeContact?.mesh]]});
// (A circuit's small street things, root.userData.noReflection: poles and paint are not worth their draws in the car's paint.)
let carReflections=null;const probeAt=new THREE.Vector3(),reflectionHide=()=>[carRoot,ghostCar.root,lineView.root,tyreSmoke?.mesh,lakeContact?.mesh,treeField?.points,speedFx?.root,...circuitExtras.filter(e=>e.root.userData.noReflection).map(e=>e.root)];
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,6500);
const orbit=new OrbitControls(camera,$('view'));
const ORBIT_MAX_DISTANCE=45;
orbit.enabled=false;orbit.enablePan=false;orbit.minDistance=3.2;orbit.maxDistance=ORBIT_MAX_DISTANCE;
orbit.minPolarAngle=.015;orbit.maxPolarAngle=Math.PI/2;
orbit.rotateSpeed=.8;orbit.zoomSpeed=.8;
const orbitTarget=new THREE.Vector3(),orbitDelta=new THREE.Vector3();
const hoodEye=new THREE.Vector3(1.1,1.25,0),fuscaHoodEye=new THREE.Vector3(...FUSCA_HOOD_EYE),followOffset=new THREE.Vector3();let followInitialized=false;
// The hood camera looking back (Central #23): on the boot lid, facing the road behind.
const bootEye=new THREE.Vector3(-1.38,1.16,0),fuscaBootEye=new THREE.Vector3(...FUSCA_BOOT_EYE),BEHIND=Object.freeze({yaw:Math.PI,pitch:0});
const cameraObstacles=[],cameraRay=new THREE.Raycaster(),cameraRayDirection=new THREE.Vector3();
// Chase, close and far ride on camera-rig.js springs; followReach: how far the eye may sit from the car past walls.
const rig=new CameraRig(),camDir=new THREE.Vector3(),camRight=new THREE.Vector3(),camShake={pitch:0,yaw:0,roll:0},rayFrom=new THREE.Vector3(),rayProbe=new THREE.Vector3(),screenPoint=new THREE.Vector3();let followReach=null,followBlock=Infinity,followObstacles=null;
const obstacleMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const cameraModes=CAMERA_MODES;
const cameraReturn=new CameraReturn(),orbitSphere=new THREE.Spherical(),orbitHome=new THREE.Spherical(),orbitSeen=new THREE.Spherical();
// Framing the orbit inherited: turn and tilt away from "looking at the car", about the vertical so the horizon stays level.
// Also whether it keeps the chase speed widening, and the camera the mouse turned into the orbit.
const orbitAim={yaw:0,pitch:0},orbitHomeAim={yaw:0,pitch:0},aimToCar=new THREE.Vector3(),aimView=new THREE.Vector3();let orbitSpeedFov=false,orbitFrom=null;
function aimOffset(toCar,view,out){
 out.yaw=wrap(Math.atan2(view.x,view.z)-Math.atan2(toCar.x,toCar.z));out.pitch=Math.asin(clamp(view.y,-1,1))-Math.asin(clamp(toCar.y,-1,1));return out;
}
function aimOrbit(){
 aimToCar.subVectors(orbit.target,camera.position).normalize();
 const yaw=Math.atan2(aimToCar.x,aimToCar.z)+orbitAim.yaw,pitch=clamp(Math.asin(clamp(aimToCar.y,-1,1))+orbitAim.pitch,-1.5,1.5);
 camera.lookAt(aimView.set(Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw)).add(camera.position));
}
// Far from the car (an orbit that began in the aerial view) the camera stays high, above the trees.
// Set before every orbit update, or the previous orbit's limit would move the next one.
function orbitTilt(){orbit.maxPolarAngle=Math.PI/2-clamp((camera.position.distanceTo(orbit.target)-ORBIT_MAX_DISTANCE)/60,0,1)*.5;}
const headLook={yaw:0,pitch:0};
// B held in the cockpit looks back; headView is the look actually drawn (mouse look blended with it).
// cockpitView is a debug pose for interior photos (interlagos.setCockpitView); null in play.
const lookBack=new LookBack(),headView={yaw:0,pitch:0},headEye=new THREE.Vector3(),twist=[0,0,0];
let cockpitView=null,photoHidDriver=false;const photoEye=new THREE.Vector3();
// Recon lap: N (or the Piloto button) hands the cameras to the next car on track, to watch the lap
// with another driver; 0 is the player's own Opala.
let watched=0;const watchForward=new THREE.Vector3(1,0,0),watchTarget=new THREE.Vector3();
let pointerLocked=false,lockPending=false,lockUnavailable=!$('view').requestPointerLock;
// The mouse let go on purpose (a multiplayer host's door on the grid): no menu for that.
let mouseFreed=false;
const isInside=()=>mode==='cockpit'||mode==='hood';
// A fall into a plateau circuit's abyss (cliff-fall.js): the rim camera and the fade; the view to give back.
const fallView=new FallView($('fallFade'),$('fallFlash'));let fallMode=null;
// The fireballs at the foot of the wall (explosion.js), on a circuit with a rim.
let explosions=null;
// What a circuit adds to the world and moves every frame (the sea's chop, Floripa's bridges and landmarks).
let circuitExtras=[];
// The football on the Mineirão's floor (pampulha-futebol.js), one of them: its balls step with the cars.
let futebol=null;
// The far pieces of the circuit-wide scenery drawn together (perf-probe.js farMerge), switched round the camera each frame.
let farMerges=[];const FAR_MERGE_GAP=750;
// The world round an enclosed bowl out of the pictures taken from inside it (an extra's encloses(camera): the Mineirão's
// floor, pampulha-estadios.js), each render by its own camera (the picture, a mirror, each face of a reflection capture;
// the sun's shadow map is drawn within the same render) and given back after it: true leaves out the circuit's still
// scenery (world, loadCircuit), whole; a Frustum (the bowl's way out in view: its tunnel) each piece of it (parts) that
// lies wholly outside that frustum. Never the cars, the people, the effects, the sky or the lights.
let enclosure=null,enclosing=0;const shutOut=[];
scene.onBeforeRender=(r,s,camera)=>{if(enclosing++||!enclosure?.on)return;let view=false;for(const e of enclosure.shut)if(view=e.encloses(camera))break;if(!view)return;
 if(view===true){for(const o of enclosure.world)if(o.visible){o.visible=false;shutOut.push(o);}enclosure.renders++;}
 else{for(const o of enclosure.parts)if(o.visible&&o.frustumCulled&&!view.intersectsObject(o)){o.visible=false;shutOut.push(o);}enclosure.portals++;}};
scene.onAfterRender=()=>{if(--enclosing>0)return;enclosing=0;for(const o of shutOut)o.visible=true;shutOut.length=0;};
// Look-back (B or the touch button): while driving, not on foot, in the pit stop or menus. (On the arena B is a handbrake
// key, ARENA_HANDBRAKE: no looking back there.) The head turns round in the cockpit; the hood camera moves onto the boot
// lid and the follow cameras to the front of the car, as far and as high, facing it (Central #23). Not the aerial, TV or orbit.
const LOOK_BACK_VIEWS=Object.freeze(['cockpit','hood','chase','close','far']);
const lookBackAllowed=()=>!arenaMode&&LOOK_BACK_VIEWS.includes(mode)&&ready&&!paused&&!cockpitView&&!pitstop?.opened&&!immersive?.onFoot()&&!walker?.active&&!gridPreview()&&!$('settings').open;
// Sky light comes mostly from the environment map (sky.js); the hemisphere lifts the shade a little more.
// Clear early-afternoon key light: a strong, barely warm sun against the open sky's fill, about 5:1 on
// the ground like a sunny day (the fill was half that and a car's shadow went black), so shade under cars
// and stands reads dark and crisp but keeps its skylight (eye adaptation keeps the exposure).
const skyFill=new THREE.HemisphereLight('#c4d8f2','#4c4a38',.45);scene.add(skyFill);
const sun=new THREE.DirectionalLight('#fff1e2',7);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?1024:4096,touchDevice?1024:4096);const shadowReach=touchDevice?55:85;Object.assign(sun.shadow.camera,{left:-shadowReach,right:shadowReach,top:shadowReach,bottom:-shadowReach,near:1,far:340});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;sun.shadow.radius=2;scene.add(sun,sun.target);
const sunOffset=SUN_DIRECTION.clone().multiplyScalar(140);
// The shadow box leans toward what the camera sees and moves in whole texels (sun-light.js); the
// cars get a crisp map of their own on Alto and Ultra (car-shadow.js).
const sunPlacement=new SunPlacement(SUN_DIRECTION),sunView=new THREE.Vector3(),carShadow=new CarShadow(SUN_DIRECTION),shadowRoots=[];
// The race's weather (weather.js; the Corrida tab's Horário and Clima): the key light's direction (the day's sun,
// a low sun at dusk, the moon at night) and everything applyWeather puts on the world.
// weatherOverride: a multiplayer room's (the host's weather, multiplayer.js), not saved. weatherDraw: what Aleatório
// races (weather.js drawWeather); weatherDrawRaced: a race took it, so the next one (or a restart) draws again.
let weather=weatherProfile(),weatherOverride=null,weatherDraw=drawWeather(),weatherDrawRaced=false;const sunDirection=SUN_DIRECTION.clone();
function playerWeather(){return chosenWeather(preferences.values.timeOfDay,preferences.values.rain,weatherDraw);}
// Aleatório's rain odds for the race at hand (weather.js rainOdds, Central #10): its circuit's city in the month of a
// championship round with a date, the year's average otherwise.
const raceRainOdds=()=>rainOdds(circuit?.id,raceMonth(championshipRace?.championship.schedule[championshipRace.round]?.date));
// Aleatório just picked: that part drawn afresh, raced by the race under way, or else by the next one.
function redrawWeather(part){const fresh=drawWeather(Math.random,raceRainOdds());weatherDraw=part==='rain'?{...weatherDraw,rain:fresh.rain,roll:fresh.roll}:{...weatherDraw,time:fresh.time};weatherDrawRaced=sessionStarted;}
// The opening's weather line (weather.js weatherCaption), naming what Aleatório drew (a room's weather is the host's).
function weatherLine(){
 const drawn=weatherOverride?null:{time:preferences.values.timeOfDay===RANDOM_WEATHER,rain:preferences.values.rain===RANDOM_WEATHER};
 return weatherCaption(circuit.id==='interlagos'?'São Paulo · 16h40 · 27 °C · pista seca':circuit.weather??'Fim de tarde · 26 °C · pista seca',weather,drawn);
}
function placeSun(p,view=null,dt=1){const c=sunPlacement.place(p,view,{reach:sun.shadow.camera.right,size:sun.shadow.mapSize.x,dt});sun.target.position.copy(c);sun.position.copy(c).add(sunOffset);sun.target.updateMatrixWorld();}
// The followed car (the watched rival in the recon lap) first, then the nearest cars within 30 m of it;
// none when the camera is far from it (TV camera, the pilot on foot away from the car).
function carShadowRoots(){
 const cars=SHADOW_LEVELS[graphics.values.shadows]?.car?.cars??0,first=watchedRival()?.obj??carRoot;shadowRoots.length=0;if(!cars||!ready||first.position.distanceToSquared(camera.position)>6400)return shadowRoots;shadowRoots.push(first);
 if(cars>1)shadowRoots.push(...[carRoot,...(immersive?.visual?.rivals??[])].filter(o=>o!==first&&o.visible&&o.position.distanceToSquared(first.position)<900).sort((a,b)=>a.position.distanceToSquared(first.position)-b.position.distanceToSquared(first.position)).slice(0,cars-1));
 return shadowRoots;
}
const loader=new GLTFLoader(),carRoot=new THREE.Group();scene.add(carRoot);
// Sprung mass: body, cabin, cockpit and driver roll and pitch on the suspension;
// the wheels are counter-rotated so they stay planted on the ground.
const carBody=new THREE.Group();carBody.name='Carroceria_suspensao';carRoot.add(carBody);
// Contact shadows and wheel blur of every car (contact-shadows.js): kept with carRoot, placed in world space.
carRoot.add(carContact.root);
// Doors, hood, trunk lid and filler caps of the V06 Opala, on their hinges (car-openings.js); the doors, front lid and
// engine lid of the Fusca while the player races one (attachOpenings).
const openings=new CarOpenings();
// Which interior shows (cockpit.js setView). The game's controls sit in the V06 body, as in its
// Blender scene: its structure is the cabin's floor and walls, and from outside the seat and
// controls show through the windows. The classic setting keeps the old box interior in the
// cockpit view instead. The driver drops with the controls he holds.
function cabinVisibility(){
 // The opening films the car from outside, whatever view the race then starts in.
 const inside=mode==='cockpit'&&!gridPreview()&&!watchedRival()&&!intro.active,classic=preferences.values.classicInterior;
 // A Fusca (fusca.js) has no room for the Opala's cockpit: its own interior shows, and the driver with the
 // controls he works sits in its seat (seatShift, showFusca), at the V06 view's height (the classic box is the Opala's).
 // Outside the cockpit view the cabin shows through the windows as one still, batched copy (cockpit.js outsideBatch).
 if(cockpit){const outside=!fuscaBody.active&&!inside&&!!model,batch=cockpit.outsideBatch(outside);if(batch)batch.visible=outside;
  cockpit.root.visible=!fuscaBody.active&&(inside||!!model&&!(batch&&outside));cockpit.setView({inside,classic:classic&&!fuscaBody.active});if(driver)driver.root.position.set(seatShift.x,cockpit.drop()+seatShift.y,seatShift.z);}
 if(model){model.visible=!inside||!classic;carStructure.visible=!(inside&&classic);}
 trimCasters(inside);
}
// The sun's map draws every caster once more each frame, a draw call each: the player's car keeps the ones whose shadow
// that map can show. Parts under a texel and a half across (bolts, switches, pedals; more of them at the lower levels'
// coarser maps) and the see-through ones (stickers lying on a panel, whose shadow is the panel's; lenses, smoked plastic)
// cast nothing it holds. Outside the cockpit view the driver and the cabin seen through the windows sit under the roof:
// their shadow falls inside the shut body. In the cockpit they cast (the arms on the dash and the door, the cage).
// wantShadow: what each mesh was made to cast, before this.
const casterRadius=new WeakMap(),wantShadow=new WeakMap();
function trimCasters(inside=mode==='cockpit'&&!gridPreview()&&!watchedRival()&&!intro.active){
 const shadow=SHADOW_LEVELS[graphics?.values.shadows];if(!shadow||!renderer)return;
 const texel=2*shadow.reach/Math.min(shadow.size,renderer.capabilities.maxTextureSize),cabin=new Set([driver?.root,cockpit?.root,cockpit?.outsideBatch?.(false)].filter(Boolean));
 const trim=(o,inCabin)=>{
  if(cabin.has(o))inCabin=true;
  if(o.isMesh){
   if(!wantShadow.has(o))wantShadow.set(o,o.castShadow);
   let r=casterRadius.get(o.geometry);if(r===undefined){if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();r=o.geometry.boundingSphere.radius;casterRadius.set(o.geometry,r);}
   const clear=[o.material].flat().every(m=>m.transparent),small=!o.isSkinnedMesh&&!o.isInstancedMesh&&r*o.matrixWorld.getMaxScaleOnAxis()<texel*.75;
   o.castShadow=wantShadow.get(o)&&!clear&&!small&&(inside||!inCabin);
  }
  for(const c of o.children)trim(c,inCabin);
 };
 carBody.updateMatrixWorld(true);trim(carBody,false);
}
const suspension={roll:0,rollRate:0,pitch:0,pitchRate:0},bodyPivot=new THREE.Vector3(.3,.38,0),bodyTilt=new THREE.Quaternion(),bodyTiltInverse=new THREE.Quaternion(),bodyEuler=new THREE.Euler(),wheelOffset=new THREE.Vector3();
function springTo(key,target,dt,frequency,damping){const rate=key+'Rate';suspension[rate]+=((target-suspension[key])*frequency*frequency-2*damping*frequency*suspension[rate])*dt;suspension[key]+=suspension[rate]*dt;}
let cockpit,skidMarks,tyreSmoke,sideMirrors,fuscaMirrors,rain;
// Air, dust and pushed grass that sell the speed (speed-particles.js), built with each circuit.
let speedFx=null;
// The player's Opala on the sprung body: its model, cabin structure (setLivery) and brake lights
// (brake-lights.js), hidden together while the player races a Fusca (fuscaBody, showFusca).
const opalaShell=new THREE.Group();opalaShell.name='Opala_do_jogador';carBody.add(opalaShell);
const brakeLamps=createBrakeLights();opalaShell.add(brakeLamps);
// Headlights (headlights.js): the player's two spot lights ride the sprung body; the lit lenses and glare sit on the
// car shown (the Opala's auxiliary lamps or headlamps, the Fusca's headlamps). K switches them.
const playerLamps=new PlayerHeadlights(carBody);let playerGlow=null,playerGlowKey='',farolSwitch=null,limpSwitch=null;
// The rain on the Opala's windscreen and its wipers (windscreen-rain.js): J or the LIMP switch.
const windscreen=new WindscreenRain();
// The Fusca's (the player's own clone of the Fusca template; its wipers turn about their outer ends).
const fuscaScreen=new WindscreenRain();
// Where the drops splash: the road's plane under the player's car (rain.js).
const splashGround={point:new THREE.Vector3(),normal:new THREE.Vector3(0,1,0)};
// The floodlight masts on the pit wall of the circuit loaded (floodlights.js), lit after dark.
let floods=null;
const fuscaBody=new FuscaBody(carBody),seatShift=new THREE.Vector3(),eyeShift=new THREE.Vector3(),noShift=new THREE.Vector3();
// The two TVs in Box 99's garage and the team stand's monitors show this track's best laps (one record a circuit,
// whichever mode drove it): the Opala's with the AI, the Fusca's, and on the stand the Opala's people alone; they
// are checked every 1.5 s and redrawn only when the lists change (a new record).
let recordTvs=null,recordTvsKey='',recordTvsAt=0;
function updateRecordTvs(now){
 if(!recordTvs||now<recordTvsAt)return;recordTvsAt=now+1500;
 const read=(car,ai=true)=>trackRecords(pilotStorage(),circuit.id,car,immersive?.pilotName,8,{ai}).lap;
 const boards=[{subtitle:'MELHOR VOLTA · OPALA',rows:read('opala')},{subtitle:'MELHOR VOLTA · FUSCA',rows:read('fusca')},{subtitle:'MELHOR VOLTA · OPALA · PESSOAS',rows:read('opala',false)}];
 const key=JSON.stringify([circuit.id,boards]);
 if(key!==recordTvsKey){recordTvsKey=key;recordTvs.showRecords({title:`RECORDES · ${circuit.name.toUpperCase()}`,boards});}
}
// Ghost lap (G): the pilot's best lap on this circuit, in the mode being played (as the records),
// recorded while he drives (ghost-lap.js) and replayed as a see-through Opala over the race
// (ghost-car.js). ghostSavedAt: the crossing that saved a new one (the lap banner says so).
const ghostRecorder=new GhostRecorder(),ghostCar=new GhostCar(),ghostPose={};scene.add(ghostCar.root);
let ghostLap=null,ghostKey='',ghostSavedAt=null,ghostOnTrack=false;
const ghostOwner=()=>immersive&&data?{circuit:circuit.id,mode:immersive.active?'immersive':'normal',car:raceModel,pilot:immersive.pilotName||''}:null;
// The saved lap for the pilot, circuit and mode on track now (read again when any of them changes).
function currentGhost(){
 const key=ghostOwner(),id=key?JSON.stringify(key):'';
 if(id!==ghostKey){ghostKey=id;ghostLap=key?.pilot?loadGhost(pilotStorage(),key):null;}
 return ghostLap;
}
// After each physics step: a lap that counts, driven whole by the pilot (not the recon lap's autopilot
// nor the coast after the flag), becomes his ghost when it beats the one saved; the next lap races it.
// command: the step's, whose brake the ghost's brake lights replay.
function recordGhost(command){
 const driving=sessionStarted&&!automatic&&!immersive.recordAssisted&&!immersive.finishing&&(immersive.active?immersive.state.phase==='race':!immersive.freeFinished);
 contaOnline?.step(car,command,inputSources);   // the step's controls, for the lap that goes online with its ghost
 const lap=ghostRecorder.step(car,driving,command?.brake??0),key=lap&&ghostOwner();
 if(key?.pilot&&saveGhost(pilotStorage(),{...key,lap})){ghostKey='';ghostSavedAt=car.lapStart;}
 if(key)contaOnline?.lapDone({...key,lap,end:car.lapStart});
}
// Each frame: the ghost where its lap was at this point of the lap being driven. It waits at its
// start until the clock runs, fades out once its lap is over, and fades near the camera and the
// Opala (in the cockpit it would fill the windscreen). Hidden off the track: menus, box, podium. Its brake
// lights come on where its lap braked.
function updateGhost(dt){
 const lap=preferences.values.ghost?currentGhost():null;
 const racing=!!lap&&sessionStarted&&!intro.active&&!pitstop?.opened&&raceResults.root.hidden&&(immersive.active?['starting','grid','race'].includes(immersive.state.phase):!immersive.freeResultReady);
 ghostOnTrack=racing;if(!racing){ghostCar.setOpacity(0);return;}
 const t=car.clock-car.lapStart+renderAhead();ghostOnTrack=t<lap.time+.8;lap.poseAt(t,ghostPose);ghostCar.place(ghostPose);ghostCar.setBrake(lap.brakeAt(t));ghostCar.update(paused?0:dt);
 const near=camera.position.distanceTo(ghostCar.body.position),apart=Math.hypot(ghostPose.x-car.x,ghostPose.y-car.y);ghostCar.detail(near);
 ghostCar.setOpacity(clamp(1-(t-lap.time)/.8,0,1)*clamp((near-2.5)/4,0,1)*(.3+.7*clamp((apart-1.5)/4,0,1)));
 ghostCar.setPlate(fmt(lap.time));
}
// The timing panel's ghost line: its lap, and the gap to it at this point of the track (minus: ahead).
function ghostHud(){
 const on=preferences.values.ghost,lap=on?currentGhost():null;$('ghostInfo').hidden=!on;
 for(const id of ['ghostButton','touchGhost']){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}
 if(!on)return;
 const t=car.clock-car.lapStart,gap=lap&&ghostRecorder.lapStart===car.lapStart&&t>.5?t-lap.timeAt(ghostRecorder.progress):null;
 $('ghostTime').textContent=lap?fmt(lap.time):'sem volta';
 $('ghostGap').textContent=gap===null?'':`${gap<0?'−':'+'}${Math.abs(gap).toFixed(2).replace('.',',')}`;$('ghostGap').className=gap===null?'':gap<0?'ahead':'behind';
}
// G (the Fantasma buttons, the controller's ↑): the ghost on or off. With no lap saved yet for the
// pilot here, it only says so. The saved laps are read again (another tab may have raced here).
function toggleGhost(){
 if(!ready||!sessionStarted)return;
 ghostKey='';const lap=currentGhost(),owner=ghostOwner();let text;
 if(preferences.values.ghost){preferences.update({ghost:false});text=`Fantasma desligado · ${keyName('KeyG')} liga de novo`;}
 else if(!lap)text=`Ainda não há volta gravada para o fantasma de ${owner.pilot||'você'} em ${circuit.name} (${immersive.active?'Modo História':'Modo Corrida'}). Complete uma volta válida pilotando e ela fica gravada.`;
 else{preferences.update({ghost:true});text=`Fantasma ligado · sua melhor volta, ${fmt(lap.time)} · ${keyName('KeyG')} desliga`;}
 status(text);setTimeout(()=>{if($('status').textContent===text)status('');},4500);ghostHud();
}
// Linha ideal (O, the Linha buttons, the race settings): the way round the circuit drawn on the asphalt, coloured by
// what the pedals should do there (driving-line.js lays it for the car being raced, driving-line-view.js draws it):
// the whole lap, only round the corners, or off. At the wheel in a race and in the recon lap; not on foot, in the box,
// past the flag's sheet, in the arena or in the track's story, nor while the recon lap watches another car.
const lineView=new DrivingLineView();scene.add(lineView.root);
function updateDrivingLine(){
 const mode=preferences.values.drivingLine;
 const racing=mode!=='desligada'&&ready&&sessionStarted&&!!data&&!circuit.arena&&!intro.active&&!pitstop?.opened&&raceResults.root.hidden&&!trackHistory.active&&!immersive?.onFoot()&&!walker?.active&&!watchedRival()&&(immersive.active?['starting','grid','race'].includes(immersive.state.phase):!immersive.freeResultReady);
 if(!racing){lineView.hide();return;}
 lineView.show(data,car,{mode,weatherGrip:car.weatherGrip??1,light:weather.time==='noite'?.5:weather.time==='fim_de_tarde'?.8:1,heightAt:(x,y,i)=>car.sample(x,y,i).z});
}
function lineHud(){const on=preferences.values.drivingLine!=='desligada';for(const id of ['lineButton','touchLine']){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}}
// O: completa, só nas curvas, desligada, and round again; the words say what the colours mean.
function cycleDrivingLine(){
 if(!ready||!sessionStarted)return;
 const next=LINE_MODES[(LINE_MODES.indexOf(preferences.values.drivingLine)+1)%LINE_MODES.length];preferences.update({drivingLine:next});$('drivingLine').value=next;
 const key=keyName('KeyO'),text=next==='desligada'?`Linha ideal desligada · ${key} liga de novo`:`Linha ideal${next==='curvas'?' só nas curvas':''} · verde acelera, amarelo segura, vermelho freia · ${key} ${next==='completa'?'deixa só nas curvas':'desliga'}`;
 status(text);setTimeout(()=>{if($('status').textContent===text)status('');},4500);lineHud();
}
$('drivingLine').value=preferences.values.drivingLine;
$('drivingLine').onchange=()=>{preferences.update({drivingLine:$('drivingLine').value});lineHud();};
lineHud();
function initializeRenderer(){
 if(renderer)return;
 // The screen's own antialiasing serves the Simples film look; it is fixed when the page loads.
 // Simples has no eye adaptation: its exposure is set for the strong sun (and no sun shadows on Baixo).
 renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:graphics.values.antialias>0});renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.5));renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.78;
 sky=createSky(renderer,scene,{mobile:SCENERY_LEVELS[graphics.values.scenery].mobile,detail:graphics.values.scenery});
 // Film look: linear HDR scene, then occlusion, haze, bloom, lens and grade (cinematic.js).
 cinematic=createCinematic(renderer,{mobile:touchDevice,level:cinematicLevel(),quality:graphics.level,features:cinematicFeatures()});cinematic.setSun(SUN_DIRECTION);
 carReflections=new CarReflections(renderer,sky,cinematic);
 cockpit=createCockpit(renderer);carBody.add(cockpit.root);
 // The door mirrors show the same picture of the road behind (side-mirrors.js); a Fusca's too, and its rear-view mirror.
 sideMirrors=new SideMirrors(cockpit.mirrorTarget.texture);fuscaMirrors=new SideMirrors(cockpit.mirrorTarget.texture);fuscaBody.mirror=cockpit.mirrorTarget.texture;
 skidMarks=new SkidMarks(16384);scene.add(skidMarks.mesh);
 tyreSmoke=new TyreSmoke();tyreSmoke.wet=weather.wetness;scene.add(tyreSmoke.mesh);
 // The rain and the cars' spray (rain.js), drawn only when the weather has rain.
 rain=new Rain({count:RAIN_DROPS[graphics.values.materials]??RAIN_DROPS.alto});scene.add(rain.root);
 applyGraphics();applyWeather();
}
// The Gráficos tab's values on the renderer, the sun, the film look, the fog and the mirrors. All of
// it takes effect at once except the scenery (built with the circuit: loadCircuit rebuilds it at the
// next start) and the screen's own antialiasing (initializeRenderer).
// The fog and the far plane of the Gráficos tab's view distance; a circuit over a valley (far-terrain.js) sees further.
// The weather shortens the fog (rain, night: weather.js fog.reach), never the far plane.
function applyViewDistance(){const view=(data?.scenery?.far?VALLEY_VIEW:VIEW_DISTANCES)[graphics.values.viewDistance],reach=weather.fog.reach;[scene.fog.near,scene.fog.far]=[view.fog[0]*Math.min(1,reach*1.15),view.fog[1]*reach];camera.far=SKYLINE_FAR.value=view.far;camera.updateProjectionMatrix();}
function applyGraphics(){
 graphics=graphicsPanel.show(preferences.values.graphics);const g=graphics.values;
 resolution.max=Math.min(devicePixelRatio,g.resolution);resolution.min=Math.min(resolution.max,resolutionFloor(graphics.level,touchDevice));resolution.dynamic=g.dynamicResolution;frameCap.limit=g.fpsLimit;
 if(!renderer)return;
 const materialQualityChanged=roadSurface&&roadSurface.stats.quality!==g.materials;
 const wasOff=cinematic.level==='off',hadShadows=sun.castShadow;
 // With dynamic resolution, where it settled last time on this level (device.ratios); the first race on integrated
 // video starts at the floor and climbs if there is room (from the top it took seconds of stutter to come down); else
 // the level's density. Phones never start at the floor (a phone's small screen shows a soft picture at once).
 const remembered=device.ratios[graphics.level],weak=!touchDevice&&(device.tier==='fraca'||device.tier==='software');
 const startRatio=g.dynamicResolution&&(remembered||weak)?Math.min(resolution.max,Math.max(resolution.min,remembered??resolution.min)):resolution.max;
 if(Math.abs(renderer.getPixelRatio()-startRatio)>.001){renderer.setPixelRatio(startRatio);renderer.setSize(innerWidth,innerHeight,false);}
 // Sun shadows: off, or a map of this size covering this much round the car (a new size is allocated at the next frame).
 const shadow=SHADOW_LEVELS[g.shadows];sun.castShadow=renderer.shadowMap.enabled=!!shadow;
 if(shadow){
  const size=Math.min(shadow.size,renderer.capabilities.maxTextureSize);if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
  Object.assign(sun.shadow.camera,{left:-shadow.reach,right:shadow.reach,top:shadow.reach,bottom:-shadow.reach});sun.shadow.camera.updateProjectionMatrix();sun.shadow.radius=shadow.radius;
 }
 // Alto/Ultra: the cars' crisp map (uniforms only: the ground shaders always carry the lookup).
 carShadow.configure(shadow?.car??null);trimCasters();
 cinematic.setLevel(cinematicLevel());cinematic.setQuality(graphics.level);cinematic.setFeatures(cinematicFeatures());
 roadSurface?.setQuality(g.materials);roadRails?.setQuality(g.materials);rain?.setCount(RAIN_DROPS[g.materials]??RAIN_DROPS.alto);roadCurbs?.userData.setQuality(g.materials);
 // The cars' finish and reflections (car-reflections.js); another map size, the flake or a capture in the
 // Simples look means other programs (precompiled below).
 const reflectionPrograms=carReflections.setLevel(g.reflections);
 flags?.setQuality(g.speedEffects);
 speedFx?.setLevel(g.speedEffects);
 // The other cars' levels of detail (immersive-visuals.js detailLevel).
 immersive?.visual.setCarDetail(CAR_DETAIL[g.carDetail]);setPeopleReach(PEOPLE_REACH[g.scenery]);
 applyViewDistance();
 // The cockpit mirror's picture; switched off it goes dark (the door mirrors hide).
 const mirror=MIRROR_SIZES[g.mirrors];
 if(mirror)cockpit.mirrorTarget.setSize(...mirror);else{renderer.setRenderTarget(cockpit.mirrorTarget);renderer.clear();renderer.setRenderTarget(null);}
 sky.setDetail(g.scenery);
 landscape?.setRealisticWater(g.water==='realista');
 // Contact shadows by the sun shadows and AO in force, wheel blur by Sensação de velocidade; the tyres' lettering
 // goes with the track detail (off on Baixo), whose change already precompiles below.
 carContact.setQuality(g);setTyreDetail(g.materials!=='baixo');
 if(ready&&(reflectionPrograms||materialQualityChanged||wasOff!==(cinematic.level==='off')||hadShadows!==sun.castShadow))precompileGraphics();
 sceneryNotice();
}
// Cenário e vegetação (trees, houses, grass, a city's people and traffic) is built with the track (sceneryBuilt): a level
// picked mid-race shows the rest at once, and the Gráficos tab says the scenery comes with the next start, with a button
// that starts the race again now when the pause menu offers that (#restartRace). Closing the settings repeats it on the
// track for a few seconds.
let sceneryToastDue=false;
// Back on the track (menu(false)) after a change that waits for the next start: said for a few seconds, a moment after the
// mouse is captured again (capturing it clears the status line).
function sceneryToast(){
 if(!sceneryToastDue)return;sceneryToastDue=false;const text='Cenário e vegetação mudam quando a corrida recomeçar (Gráficos › Aplicar agora).';
 setTimeout(()=>{if(paused||!sessionStarted)return;status(text);setTimeout(()=>{if($('status').textContent===text)status('');},6000);},500);
}
function sceneryNotice(){
 const pending=ready&&sessionStarted&&!!sceneryBuilt&&sceneryBuilt!==graphics.values.scenery;
 graphicsPanel.pending(pending?{built:sceneryBuilt,wanted:graphics.values.scenery,restart:!$('restartRace').hidden}:null);
 return pending;
}
// The Simples look (other tone mapping) and shadows on or off need every material's program again:
// compiled the first time on the next frame, that froze the page for seconds. They compile in
// parallel instead, a slice at a time (cinematic.js compileInSlices), while the picture and the game
// hold (frame), and the tab says so.
let graphicsCompiling=null;
// The Simples look (cinematic off) draws the picture with the screen's programs; the rear-view mirror's target takes the
// linear ones (no tone mapping), a hundred or so: built inside the first frame of the cockpit view, they froze the page
// for 9 s on a notebook's integrated video. They are built a slice at a time (cinematic.js compileInSlices) the first
// time the mirror is wanted, the mirror (and the door mirrors) left out meanwhile; the film look's programs are the
// mirror's already. mirrorPrograms: null (to build for the programs in use), a Promise (building), true (built).
let mirrorPrograms=null;const MIRROR_FAR=2200;
// The rear-view mirror on screen for the outside views 1 to 4 (Perseguição, próxima, distante, Capô; user, 10-24): the
// cockpit mirror's picture (the same target, the Gráficos tab's Retrovisores: Desligados turns it off too), drawn small at
// the top middle over the finished frame (its own tone mapping: no film effects on it, never in the reflections). It
// sees HUD_MIRROR.far metres back and, on the lighter levels, is redrawn every `every` frames.
const HUD_MIRROR_MODES=new Set(['chase','close','far','hood']),HUD_MIRROR=Object.freeze({far:600,width:[180,.22,380],top:10,every:{baixo:3,medio:2,alto:1,ultra:1}});
let hudOverlay=null,hudMirrorShown=false;
function hudMirrorWanted(){
 return HUD_MIRROR_MODES.has(mode)&&ready&&sessionStarted&&!intro.active&&!gridPreview()&&!watchedRival()&&!!MIRROR_SIZES[graphics.values.mirrors]&&!car.fall
  &&!walker?.active&&!pitstop?.opened&&!immersive?.onFoot()&&raceResults.root.hidden&&!trackHistory.active&&!arenaMode?.editing;
}
// The mirror's frame and glass in a scene of their own, an orthographic camera over the viewport it is drawn in; the
// picture flipped left to right, as a mirror shows it.
function hudMirrorOverlay(){
 if(hudOverlay)return hudOverlay;
 const scene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-1,1,1,-1,0,2),frame=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x0a0c0d,toneMapped:false,depthTest:false}));
 const glassGeo=new THREE.PlaneGeometry(2,2),uv=glassGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
 const glass=new THREE.Mesh(glassGeo,new THREE.MeshBasicMaterial({map:cockpit.mirrorTarget.texture,depthTest:false}));glass.renderOrder=1;cam.position.z=1;scene.add(frame,glass);
 return hudOverlay={scene,cam,frame,glass};
}
// Over the finished frame: the frame 3 px round the glass, the glass at the target's own proportions.
function drawHudMirror(){
 const o=hudMirrorOverlay(),[min,share,max]=HUD_MIRROR.width,target=cockpit.mirrorTarget,w=Math.round(Math.min(max,Math.max(min,innerWidth*share))),h=Math.round(w*target.height/target.width),x=Math.round((innerWidth-w)/2),y=innerHeight-HUD_MIRROR.top-h,b=3;
 const saved={tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,space:renderer.outputColorSpace,autoClear:renderer.autoClear,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissorTest()};
 renderer.setRenderTarget(null);renderer.autoClear=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;
 o.glass.visible=false;o.frame.visible=true;renderer.setViewport(x-b,y-b,w+2*b,h+2*b);renderer.render(o.scene,o.cam);
 o.glass.visible=true;o.frame.visible=false;renderer.setViewport(x,y,w,h);renderer.render(o.scene,o.cam);
 renderer.toneMapping=saved.tone;renderer.toneMappingExposure=saved.exposure;renderer.outputColorSpace=saved.space;renderer.autoClear=saved.autoClear;renderer.setViewport(saved.viewport);renderer.setScissorTest(saved.scissor);
}
function mirrorReady(){
 if(cinematic.level!=='off'||mirrorPrograms===true)return true;
 if(!mirrorPrograms){const target=cockpit.mirrorTarget,job=mirrorPrograms=compileInSlices(renderer,scene,cockpit.rearCamera,()=>target).catch(err=>console.warn(err)).finally(()=>{if(mirrorPrograms===job)mirrorPrograms=true;});}
 return false;
}
function precompileGraphics(){
 const token=graphicsCompiling={};graphicsPanel.busy(true);mirrorPrograms=null;
 // Never held for good: after 30 s the picture comes back and whatever is left compiles as before. Not
 // sooner: the page answers meanwhile, and a busy machine took over 8 s for the Simples look's hundred
 // programs; coming back then built the rest inside one frame, the very freeze this avoids. The cars'
 // reflection captures (Simples look: linear programs of their own) wait for theirs in car-reflections.js.
 Promise.race([Promise.all([cinematic.compile(scene,camera),carReflections.compile(scene)]),new Promise(done=>setTimeout(done,30000))]).catch(err=>console.warn(err)).finally(()=>{if(graphicsCompiling!==token)return;graphicsCompiling=null;graphicsPanel.busy(false);});
}
// The weather picked in the Corrida tab or on the track screen (weather.js), put on the world: the key light (sun or
// moon), the sky's fill, the dome and its lighting maps, the film look, the fog, the road's water, the rain, the
// headlights and every car's grip. Taken at once (a paused race too): the next frames show it. A change that brings
// lights in or takes them out (headlights.js) needs new programs, compiled in slices like the Gráficos tab's.
function applyWeather(){
 const own=playerWeather();weather=weatherProfile(weatherOverride?.time??own.time,weatherOverride?.rain??own.rain);
 sunDirection.fromArray(weather.sun.direction).normalize();sunOffset.copy(sunDirection).multiplyScalar(140);sunPlacement.setDirection(sunDirection);carShadow.direction.copy(sunDirection);
 sun.color.set(weather.sun.color);sun.intensity=weather.sun.intensity;sun.shadow.bias=weather.shadowBias.bias;sun.shadow.normalBias=weather.shadowBias.normalBias;
 skyFill.color.set(weather.fill.sky);skyFill.groundColor.set(weather.fill.ground);skyFill.intensity=weather.fill.intensity;
 // The tyres on a wet track (physics.js weatherGrip): the player's car and the rivals', and those the next start builds.
 if(car)car.weatherGrip=weather.grip;if(immersive){immersive.field.weatherGrip=weather.grip;for(const r of immersive.rivals??[])r.car.weatherGrip=weather.grip;}
 // A wet kerb throws no grit (tyre-smoke.js kerbFrom).
 if(tyreSmoke)tyreSmoke.wet=weather.wetness;
 if(!renderer)return;
 scene.environmentIntensity=weather.environment;
 // New lighting maps: the cars wearing the sky's old one take the new one (a probe or the grid's picture keep theirs).
 if(sky.setWeather(weather))carReflections.useRaceMap();
 cinematic.setSun(sunDirection);cinematic.setLook(weather.look);speedFx?.motes.setSun(sunDirection);
 // The Simples look has no eye adaptation: its exposure follows the light.
 renderer.toneMappingExposure=weather.exposure;
 applyViewDistance();placeSun(carRoot.position);
 roadSurface?.setWetness?.(weather.wetness,weather.drops);
 EFFECT_LIGHT.value=weather.ambient;rain?.setWeather(weather);
 // Headlights: the rivals' and the tail lamps follow the weather; the player's spot lights come into the scene with it
 // (new programs: compiled in slices when a race already shows), lit as the start decides (startLights) or H.
 TAIL_LIGHTS.on=weather.lights;setGlare(weather.lamps);playerLamps.setStrength(weather.lamps);
 floods?.setLevel(weather.night?1:weather.time==='fim_de_tarde'?.45:0);STAND_LIGHTS.value=weather.night?1:weather.time==='fim_de_tarde'?.45:0;
 for(const extra of circuitExtras){extra.setNight?.(weather.night?1:weather.time==='fim_de_tarde'?.45:0);extra.setRain?.(weather.wetness);}
 // At night the cars reflect the night sky only (car-reflections.js setSkyOnly): another map size, other programs.
 const programs=playerLamps.install(weather.lights)|carReflections.setSkyOnly(weather.night);
 if(programs&&ready)precompileGraphics();
 if(!weather.lights)playerLamps.on(false);else if(sessionStarted&&!immersive?.active)playerLamps.on(true);
 // The wipers: parked when it stops raining; started for the Modo Corrida's driver when it starts.
 if(!weather.wet)setWipers(false);else if(sessionStarted&&!immersive?.active)setWipers(true);
 floodLevel=0;headlightsHud();
}
// The player's lamps as a race starts: on whenever the weather wants them in Modo Corrida; in the story the pilot
// switches them on (K), as the IGN and PART before.
function startLights(){playerLamps.on(weather.lights&&!preferences.values.immersive);setWipers(weather.wet&&!preferences.values.immersive);headlightsHud();}
// Both cars' wipers together (the Opala's and the Fusca's: only the one raced shows).
function setWipers(on){fuscaScreen.setWipers(on);return windscreen.setWipers(on);}
// J (the touch button, a learnt wheel button): the wipers on or off (they finish their stroke and park).
function toggleWipers(){
 if(!ready||!sessionStarted||immersive?.onFoot())return;
 const on=setWipers(!windscreen.wiping),text=`Limpador ${on?'ligado':'desligado'} · ${keyName('KeyJ')} ${on?'desliga':'liga'}`;
 status(text);setTimeout(()=>{if($('status').textContent===text)status('');},2500);headlightsHud();
}
// K (the controller's L3, the touch button, a learnt wheel button): the player's headlights on or off. No status line:
// the light itself shows it at once (the user's call, 10-20).
function toggleHeadlights(){
 if(!ready||!sessionStarted||immersive?.onFoot())return;
 playerLamps.toggle();headlightsHud();
}
// Y and U on the track: the next time of day (dia, fim de tarde, noite) or rain (seco, garoa, chuva) after the one
// raced, as if picked in the Corrida tab (saved, both selects follow; Aleatório gives way to it). A room race keeps
// the host's weather (multiplayer.js: the same grip for everyone).
function cycleWeather(part){
 if(!ready||!sessionStarted)return;
 const time=part==='time',key=time?'timeOfDay':'rain',ids=time?['timeOfDay','tracksTime']:['rainLevel','tracksRain'];
 let text='Na sala, horário e clima são os do anfitrião';
 if(!weatherOverride&&!multiplayer?.race){
  const value=time?nextTimeOfDay(weather.time):nextRainLevel(weather.rain);
  preferences.update({[key]:value});for(const id of ids)$(id).value=value;applyWeather();
  text=`${weatherName(time?TIMES_OF_DAY:RAIN_LEVELS,value)} · ${time?'Y muda o horário':'U muda o clima'}`;
 }
 status(text);setTimeout(()=>{if($('status').textContent===text)status('');},2500);
}
function headlightsHud(){$('touchLights')?.classList.toggle('active',playerLamps.lit);$('touchWipers')?.classList.toggle('active',windscreen.wiping);document.body.classList.toggle('lights-weather',weather.lights);document.body.classList.toggle('rain-weather',weather.wet);}
// Every frame: the player's lit lenses on the car shown (rebuilt for another livery or the Fusca), the cockpit's FAROL
// switch, the rivals' lamps (on while they race in the weather that wants them) and the lamps that light the road.
// RIVAL_BEAM: a rival's beam on the road against the player's own (a pack behind would flood the road white).
// Baixo: the three nearest lamps (the player's and the two nearest cars'): each one more is a loop step on every lit
// pixel, 0.2 ms apiece on integrated video.
const ROAD_LAMP_LIMIT={baixo:3,medio:10,alto:18,ultra:24},RIVAL_BEAM=.5,lampCars=[];let lampLimit=null;
const FLOODLIGHT=Object.freeze({gain:6,color:'#ffdcb0'}),floodSky=new THREE.Color(),floodWarm=new THREE.Color(FLOODLIGHT.color);let floodLevel=0;
function updateLamps(dt){
 const fusca=fuscaBody.active&&fuscaBody.car?fuscaBody.car:null,owner=fusca??model,holder=fusca??opalaShell;
 if(owner&&owner.uuid!==playerGlowKey){playerGlowKey=owner.uuid;playerGlow?.removeFromParent();const set=fusca?'fusca':lampSetFor(model);playerGlow=createHeadlights(set);holder.add(playerGlow);playerLamps.place(set);}
 if(playerGlow)playerGlow.visible=playerLamps.lit&&!!owner?.visible;
 farolSwitch??=cockpit.root.getObjectByName('Interruptor_FAROL');
 if(farolSwitch)farolSwitch.rotation.x+=((playerLamps.lit?SWITCH_TILT:-SWITCH_TILT)-farolSwitch.rotation.x)*Math.min(1,dt*28||1);
 limpSwitch??=cockpit.root.getObjectByName('Interruptor_LIMP');
 if(limpSwitch)limpSwitch.rotation.x+=((windscreen.wiping?SWITCH_TILT:-SWITCH_TILT)-limpSwitch.rotation.x)*Math.min(1,dt*28||1);
 // The paddock, the podium and the pit box are floodlit after dark (the garages' and the stands' lamps): a warm lift
 // of the sky's fill there, eased so walking in or driving out does not pop.
 const phase=immersive?.active?immersive.state.phase:null,floodlit=weather.night&&(phase==='crowd'||phase==='podium'||!!pitstop?.opened);
 // Untouched while there is nothing to lift (the fill stays as applyWeather or the light hook left it).
 const ease=dt>0?1-Math.exp(-dt*2.5):1,flood=floodLevel;floodLevel+=((floodlit?1:0)-floodLevel)*ease;if(floodLevel<.002&&!floodlit)floodLevel=0;
 if(flood>0||floodLevel>0){skyFill.intensity=weather.fill.intensity*(1+(FLOODLIGHT.gain-1)*floodLevel);skyFill.color.lerpColors(floodSky.set(weather.fill.sky),floodWarm,floodLevel);}
 const racing=!immersive?.active||phase!=='crowd',lit=weather.lights&&racing;lampCars.length=0;
 for(const obj of immersive?.visual?.rivals??[]){const heads=obj.userData.headlights;if(heads)heads.visible=lit&&obj.visible;if(lit&&obj.visible)lampCars.push({obj,set:obj.userData.lampSet,head:RIVAL_BEAM,tail:1});}
 // The player's own beam on the road comes from here too (its spot lights light what stands up in it).
 if(playerLamps.lit)lampCars.push({obj:carBody,set:playerLamps.set,head:1,tail:1});
 updateRoadLamps(lampCars,camera.position,lampLimit??ROAD_LAMP_LIMIT[graphics.values.materials]??12,weather.lamps,floods?.lamps??[],FLOOD.slots);
}
reducedMotion.addEventListener('change',()=>{if(cinematic)cinematic.setFeatures(cinematicFeatures());});
const cinematicFeatures=()=>({ao:graphics.values.ao,lens:graphics.values.lens,motionBlur:graphics.values.motionBlur&&!reducedMotion.matches,samples:graphics.values.antialias});
// The game's own lines in the full performance overlay.
function debugLines(){
 const g=graphics.values,c=cinematic?.info(),shadow=SHADOW_LEVELS[g.shadows],ratio=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:2});
 const rows=[['Gráficos',`${GRAPHICS_LEVEL_NAMES[graphics.level]}${graphics.auto?` (automático: ${autoReason(touchDevice,device)})`:''}${graphics.changed.length?` · ${graphics.changed.length} ajuste${graphics.changed.length>1?'s':''} à mão`:''}`],
  ['Densidade',`máx. ${ratio(resolution.max)}× · ${g.dynamicResolution?`dinâmica (mín. ${ratio(resolution.min)}×)`:'fixa'}${frameCap.limit?` · limite ${frameCap.limit} FPS${(r=>r>frameCap.limit+.5?` · desenhando ${Math.round(r)} para ficar liso`:'')(frameCap.rate(displayCadence.measured?displayCadence.hz:0))}`:''}`]];
 rows.push(['Fluidez',`meta ${dynamicTarget()} FPS · ritmo do navegador ${displayCadence.measured?'≈':'estimado '}${displayCadence.hz} Hz`],['Materiais',GRAPHICS_LEVEL_NAMES[g.materials]]);
 if(c)rows.push(['Visual',c.level==='off'?'Simples':`${c.level==='full'?'Completo':'Leve'} · ${c.passes} passes · MSAA ${c.samples}×${c.ao?' · oclusão':''}${c.lens?' · lente':''}`]);
 rows.push(['Sombras',shadow&&renderer?`${sun.shadow.mapSize.x} px · ${shadow.reach} m${shadow.car?` · carros ${shadow.car.size} px × ${shadow.car.cars}`:''}`:'desligadas'],['Visão',`neblina até ${scene.fog?.far??'-'} m · ${GRAPHICS_OPTIONS.water.choices.find(([v])=>v===g.water)[1].toLowerCase()} nos lagos`]);
 if(ready)rows.push(['Cenário',`${GRAPHICS_OPTIONS.scenery.choices.find(([v])=>v===sceneryBuilt)?.[1]??'-'} · ${landscape?.stats.trees??0} árvores · ${(immersive?.visual?.rivals?.length??0)+1} carros`],['Pista',`${circuit.name} · câmera ${$('camera').querySelector(`option[value="${mode}"]`)?.textContent??mode}`]);
 return rows;
}
const carAudio=new CarAudio();
// Each channel keeps its level while silenced: the slider stays put, dimmed, and says so.
const AUDIO_CHANNELS=Object.freeze([['musicVolume','music','música'],['effectsVolume','effects','efeitos']]);
function audioControls(){ for(const [key,channel,label] of AUDIO_CHANNELS){const muted=!!carAudio[channel+'Muted'];$(key).value=Math.round(carAudio[key]*100);$(key).classList.toggle('channel-muted',muted);$(key+'Value').textContent=`${Math.round(carAudio[key]*100)}%${muted?' · mudo':''}`;$(channel+'Mute').textContent=`${muted?'Ativar':'Silenciar'} ${label}`;$(channel+'Mute').setAttribute('aria-pressed',String(muted));} $('volume').value=Math.round(carAudio.volume*100);$('volumeValue').textContent=`${Math.round(carAudio.volume*100)}%`;$('mute').textContent=`${carAudio.muted?'Ativar som':'Silenciar'} (${keyName('KeyM')})`;$('mute').setAttribute('aria-pressed',String(carAudio.muted)); }
audioControls();
// Moving a silenced channel's slider turns it back on; the effects slider plays its preview.
for(const [key,channel] of AUDIO_CHANNELS){
 $(key).oninput=e=>{const music=channel==='music';carAudio[music?'setMusicVolume':'setEffectsVolume'](Number(e.target.value)/100);if(carAudio[channel+'Muted'])carAudio[music?'setMusicMuted':'setEffectsMuted'](false);carAudio.unlock();if(!music)carAudio.previewEffects();audioControls();};
 $(channel+'Mute').onclick=()=>{const music=channel==='music',muted=!carAudio[channel+'Muted'];carAudio[music?'setMusicMuted':'setEffectsMuted'](muted);carAudio.unlock();if(!music&&!muted)carAudio.previewEffects();audioControls();};
}
document.addEventListener('pointerdown',()=>carAudio.unlock(),{once:true});
document.addEventListener('keydown',()=>carAudio.unlock(),{once:true});
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('button').disabled)carAudio.uiClick();});
$('volume').oninput=e=>{carAudio.setVolume(Number(e.target.value)/100);audioControls();};
$('mute').onclick=()=>{carAudio.toggleMute();carAudio.unlock();audioControls();};
// The copilot names the corner ahead (corner-callouts.js), switched in the Áudio tab, at its own volume (up to 200%):
// letting go of the slider, or ▶ Ouvir, says one name at the level chosen.
const callouts=new CornerCallouts(carAudio);
function calloutsControls(){$('calloutsVolume').value=Math.round(callouts.volume*100);$('calloutsVolumeValue').textContent=`${Math.round(callouts.volume*100)}%`;}
calloutsControls();
$('cornerCallouts').checked=callouts.on;$('cornerCallouts').onchange=()=>callouts.setOn($('cornerCallouts').checked);
$('calloutsVolume').oninput=e=>{callouts.setVolume(Number(e.target.value)/100);calloutsControls();};
$('calloutsVolume').onchange=$('calloutsHear').onclick=()=>{carAudio.unlock();callouts.preview();};
window.interlagosCopiloto={info:()=>callouts.info(),setOn:on=>{callouts.setOn(on);$('cornerCallouts').checked=callouts.on;return callouts.info();},setVolume:v=>{callouts.setVolume(v);calloutsControls();return callouts.info();},preview:()=>{carAudio.unlock();return callouts.preview();}};
let sessionStarted=false,loading=false,loadedCircuit=null;
// Multiplayer test room (multiplayer.js): loaded only for an address with #desafio=NOME (the old
// #sala= and #corrida= links open no room); no menu leads there.
// Only /dev/ publishes it: the main link's build (preparar_publicacao.py without --multiplayer) turns this off.
const MULTIPLAYER=true;
// The sound bench is published only with the /dev/ build (with the multiplayer): its link in Áudio, and only there
// may the bench's own sets play in the game.
if(!MULTIPLAYER)carAudio.useDefaultSound();
$('soundBench').hidden=!MULTIPLAYER;$('soundBenchState').textContent=carAudio.tuningSource==='bancada'?'Os seus ajustes da bancada estão tocando no jogo (desligue lá e recarregue o jogo para voltar ao padrão).':'Ajuste o ronco do Opala e do Fusca, marcha por marcha, e escolha se o jogo toca os seus ajustes.';
// Accounts (conta.js: sign in with Google, the nickname on the records). Only the dev.autopobre.com.br build carries
// them (preparar_publicacao.py --conta: the accounts' server answers only there); the others turn this off.
const CONTA=true;
// The online records (recordes-online.js, through conta.js): fed the run every frame (onlineRun) and each lap that counts (recordGhost).
// contaModule: the module itself, for a multiplayer room's pass (conta.js roomPass); conta: the account's menu line and dialog.
let contaOnline=null,conta=null;
const contaModule=CONTA?import('./conta.js'):null;
contaModule?.then(m=>m.startConta({pilot:()=>pilotPicker.profiles.selected,usePilot:(name,open)=>pilotPicker.useAccount(name,open),records:lapRecords}))
 .then(c=>{conta=c;contaOnline=c?.online??null;startLobby();}).catch(()=>{});
// Online for the hosts' invitations to their rooms (saguao.js): the test version only (the multiplayer and the accounts),
// signed in with a nickname; an invitation taken opens that room here.
function startLobby(){
 if(!MULTIPLAYER||!conta)return;
 import('./saguao.js').then(m=>m.startLobby({pass:()=>contaModule.then(mod=>mod.roomPass('@saguao')),account:()=>conta?.account?.apelido??null,racing:()=>sessionStarted})).catch(()=>{});
}
// The run as the online records see it: the Opala's clock and laps while the pilot drives a race they count (not
// the recon lap's autopilot, a run that used it, the Arena, nor a multiplayer room, whose clock the room may move).
const onlineRun=()=>({circuit:circuit.id,mode:immersive.active?'immersive':'normal',car:raceModel,clock:car.clock,lapStart:car.lapStart,
 driving:sessionStarted&&ready&&!automatic&&!immersive.recordAssisted&&!arenaMode&&!multiplayer,
 // Why the clock stands, when the race is paused: the tab hidden, the window left (both pause it: hold), or P / a menu.
 parado:paused?(document.hidden?'aba':document.hasFocus()?'pausa':'janela'):null});
// Which devices drive this step, for the online lap log (comandos-volta.js): 1 the keyboard, 2 touch, 4 a controller
// (its stick and triggers, or a button holding a driving key), 8 a wheel. A program driving the car leaves none.
const DRIVING_KEYS=Object.freeze(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','Space','KeyN']);
const inputSources=()=>(DRIVING_KEYS.some(code=>keys.has(code))?1:0)|(mobile&&(mobile.throttle||mobile.brake||mobile.steering||mobile.pressed.size)?2:0)
 |(gamepad.driving||DRIVING_KEYS.some(code=>gamepad.holds(code))?4:0)|(wheel.throttle||wheel.brake||Math.abs(wheel.steering)>.02||DRIVING_KEYS.some(code=>wheel.holds(code))?8:0);
const roomWanted=MULTIPLAYER&&new URLSearchParams(window.location.hash.slice(1)).has('desafio');let multiplayer=null;
// In a room only the room's things (the team's wish, 10-26: so many choices left players and hosts lost; the rest comes
// back as players ask for it): Modo Corrida's single race to the end and the next one, the car and the pilot's look,
// the settings that are the player's own; the room's card has the way out (multiplayer.js: Sair da sala, the host's
// Fechar sala). menus.css hides the rest (body.modo-sala) and these handlers refuse it.
if(roomWanted)document.body.classList.add('modo-sala');
let pitstop,rivalGarages=null,peekView=null,walker=null,walkView=null,immersive,car,data,roadSurface,roadRails,roadCurbs,driver,wheels=[],trunkInterior=[],model,carStructure,paused=true,automatic=false,mode='chase',ready=false,loadToken=0,activeLivery='';
// The car raced now ('99', or Modo Corrida's choice), the car at the back of its grid whose driver
// sits out (the same, or a multiplayer host's: seatCar), whether it is the recon lap, its paint on
// the player's model, and the track branding's Old Stock ads that car 70 carries on its doors.
let raceCar='99',raceModel='opala',raceGrid='99',reconLap=false,oldStockMaterial=null,modelLoading=null;
// The Arena de Drift under way (drift-arena-mode.js, drift-arena-scene.js): its stadium, layout, score, challenges and
// editor; null on a circuit.
let arenaMode=null,arenaScene=null;const carLivery=new CarLivery();
// clone(model) with the player's model as loaded: the paint it may wear (car-livery.js) comes off for
// the clone and goes back on after it.
function withCleanModel(clone){
 const painted=carLivery.number;if(painted==='99')return clone(model);
 carLivery.clear();try{return clone(model);}finally{carLivery.apply(model,carEntry(painted),immersive.visual,{doorAds:oldStockMaterial});}
}
// The story's grid countdown is shown from behind the car; the engine start before it
// ('starting') is played in the cockpit (ImmersiveMode switches the view).
const gridPreview=()=>immersive?.active&&immersive.state.phase==='grid';
let wasGridPreview=false;
const keys=new Set(),clock=new THREE.Timer(),matrix=new THREE.Matrix4(),forward=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3(),desired=new THREE.Vector3(),look=new THREE.Vector3();
// Number keys pick a view straight away, in the menu's order: 1 chase, 2 close, 3 far, 4 hood,
// 5 cockpit, 6 TV, 7 aerial, 8 orbit. The numpad does the same.
const CAMERA_KEYS=Object.fromEntries(cameraModes.flatMap((view,i)=>[[`Digit${i+1}`,view],[`Numpad${i+1}`,view]]));
const wheelForward=new THREE.Vector3(),wheelUp=new THREE.Vector3(0,1,0),wheelAxle=new THREE.Vector3(),wheelMatrix=new THREE.Matrix4(),wheelTurn=new THREE.Quaternion(),wheelSpin=new THREE.Quaternion(),axleAxis=new THREE.Vector3(0,0,1);
function status(text){$('status').textContent=text;$('status').classList.toggle('hidden',!text);}
function flattenStatic(root){
 // The GLB's walls, kerbs and step-only grandstands are rebuilt from the data (Curvelo's stands stay), and so are its
 // asphalt ribbon and edge lines (open-circuit.js lapRoad: on the plan track-verge.js smoothed, not the survey's zigzag).
 // GLTFLoader drops the dot from Blender's numbered names: Arquibancada.001 arrives as Arquibancada001.
 const retired=[];root.traverse(ob=>{if(/^(Muro_protecao|Zebras_|Arquibancada\d*$|Circuito_4309m_colisao$|Linha_limite_)/.test(ob.name))retired.push(ob);});retired.forEach(ob=>ob.removeFromParent());
 root.updateMatrixWorld(true);const batches=new Map(),structures=new Map(),standTops=[];
 root.traverse(ob=>{if(!ob.isMesh||ob.isInstancedMesh)return;
  if(Array.isArray(ob.material)){ob.receiveShadow=true;return;}
  let g=ob.geometry.clone().applyMatrix4(ob.matrixWorld);
  if(ob.material.name==='Asfalto'){ob.material=roadSurface.material;g=roadSurface.geometry(g);}
  else ob.material=structureMaterial(ob.material,terrainTextures,structures);
  // Each grandstand step contributes its top face as a row of seats.
  if(/^Arquibancada/.test(ob.name)){const pos=g.attributes.position;let top=-Infinity;for(let i=0;i<pos.count;i++)top=Math.max(top,pos.getY(i));const corners=new Map();for(let i=0;i<pos.count;i++)if(pos.getY(i)>top-.02)corners.set(pos.getX(i).toFixed(2)+':'+pos.getZ(i).toFixed(2),{x:pos.getX(i),y:pos.getY(i),z:pos.getZ(i)});if(corners.size===4)standTops.push([...corners.values()]);}
  const key=ob.material.uuid;
  // Proxies so para consulta: os meshes visiveis seguem agrupados por material.
  if(/^(Portico_|Box_|Arquibancada|Muro)/.test(ob.name)){
   const proxy=new THREE.Mesh(g.clone(),obstacleMaterial);proxy.name=ob.name;cameraObstacles.push(proxy);
  }
  // Todos os meshes de um lote precisam dos mesmos atributos.
  g.deleteAttribute('tangent');if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!batches.has(key))batches.set(key,{mat:ob.material,gs:[],obs:[]});const b=batches.get(key);b.gs.push(g);b.obs.push(ob);
 });
 for(const b of batches.values()){
  const g=mergeGeometries(b.gs,false);if(!g)continue;
  // The ground in pieces of 400 m (perf-probe.js splitByCells): out of view they are not drawn (one mesh of 370 thousand
  // triangles was, every frame). After the rest of the opaque world (and before the sky): its costly shading skips what
  // the road, stands and cars cover.
  const pieces=b.mat.userData.terrain?splitByCells(g,400):[g];
  for(const piece of pieces){const m=new THREE.Mesh(piece,b.mat);m.castShadow=!b.mat.userData.terrain;m.receiveShadow=true;if(b.mat.userData.terrain)m.renderOrder=.25;scene.add(m);}
  if(pieces[0]!==g)g.dispose();b.obs.forEach(o=>o.removeFromParent());b.gs.forEach(g=>g.dispose());
 }
 scene.add(root);
 return standTops;
}
async function setLivery(value){
 if(!['assinaturas_omp','seiva_danilo'].includes(value))throw new Error('Pintura inválida');
 const token=++loadToken;status('Carregando Opala 99…');
 $('skinButton').disabled=true;$('skinButton').textContent='Carregando pintura…';$('livery').disabled=true;
 try{
 const gltf=await loader.loadAsync(`./assets/opala99_${value}.glb?v=06-milha-seiva`);
 if(token!==loadToken)return;
 carLivery.clear();if(model)opalaShell.remove(model);model=gltf.scene;wheels=[];
 // Meshes inside the shut body (engine bay, trunk, hinges: glTF extra "interno") cast no shadow.
 // Clear coat, glass, chrome and rubber by material name: car-finish.js (rivals clone these).
 model.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.interno;o.receiveShadow=true;finishMesh(o);
  for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.name==='Policarbonato_fume'){m.transparent=true;m.opacity=.19;m.depthWrite=false;o.castShadow=false;}
   // Blender's glass (transmission: the V06 headlamp lenses, turn signals, translucent plastics) would make
   // three.js draw the whole scene a second time every frame; here they are plain see-through materials.
   if(m.transmission>0){m.transparent=true;m.opacity=Math.min(m.opacity,1-.65*m.transmission);m.transmission=0;m.depthWrite=false;}}
 }if(o.name.startsWith('Roda_')&&o.name.includes('PIVO')){const front=o.name.includes('Dianteira');wheels.push({obj:o,front,index:(front?0:2)+(o.position.z>0?1:0),base:o.quaternion.clone(),basePosition:o.position.clone()});}});
 // Slicks with lettered sidewalls on the template (car-wheels.js): every clone made from it shares them.
 prepareWheels(model,'opala');
 // The side number's cells that cut across the tail's corner (car-livery.js), before any clone shares the geometry.
 trimDecalTails(model);
 // Its wipers on their own pivots, cut out of the body (windscreen-rain.js), before any rival is cloned from it.
 prepareWipers(model);
 // The tail lamps' lens rings (brake-lights.js); the trunk's inside shown only with the lid open (car-livery.js).
 lampUVs(model);trunkInterior=trunkInside(model);
 attachOpenings();
 // These solid Blender panels close the cabin seen from outside. The detailed
 // cockpit has its own floor, walls and rear cabin, so they hide with the body
 // (their belt-high sheet over the rear seat would cover the interior).
 if(carStructure)opalaShell.remove(carStructure);
 carStructure=new THREE.Group();carStructure.name='Estrutura_cabine_V04';
 model.updateMatrixWorld(true);const structuralParts=[];
 model.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Chapa_fechamento_V04'))structuralParts.push(o);});
 for(const part of structuralParts){const local=part.matrixWorld.clone();carStructure.add(part);local.decompose(part.position,part.quaternion,part.scale);}
 opalaShell.add(model,carStructure);windscreen.attach(model,opalaShell);sideMirrors.attach(model,carBody,cockpit.eye);cabinVisibility();activeLivery=value;status('');if(sessionStarted&&immersive)paintCar();
 preferences.update({livery:value});if(ready)carAudio.effect('paint');
 }finally{
  if(token===loadToken){
   $('skinButton').disabled=!ready;$('livery').disabled=false;
   if(activeLivery)$('livery').value=activeLivery;
   skinLabel();
  }
 }
}
// The Fusca's model (fusca.js): loaded the first time its tab or a race in it asks; null if it failed.
let fuscaTemplate=null,fuscaLoading=null;
function ensureFusca(){
 if(fuscaTemplate)return Promise.resolve(fuscaTemplate);
 return fuscaLoading??=loader.loadAsync(FUSCA_URL).then(gltf=>{fuscaTemplate=prepareFusca(gltf.scene);prepareWipers(fuscaTemplate,WIPER_PROFILES.fusca);return fuscaTemplate;}).catch(err=>{console.error(err);return null;}).finally(()=>{fuscaLoading=null;});
}
// The model a race asks for: its championship's (the Copa Fusca races Fuscas, another the model it started in) or
// the car screen's tab.
const wantedModel=()=>championshipRace?.championship.model??preferences.values.carModel;
// A race in the Fusca loads it with the circuit, and the ghost of the best lap gets its shell (ghost-car.js).
async function fuscaWanted(){
 if(wantedModel()!=='fusca'||roomWanted)return;
 if(await ensureFusca()&&!ghostCar.has('fusca'))ghostCar.build(fuscaTemplate,null,'fusca');
}
// The player's car as a Fusca in entry's colours (a Copa Fusca car, race-roster.js; null: back to the Opala). Meanwhile the Opala's body,
// cockpit and brake lamps hide, and the driver and the cockpit camera move to the Fusca's seat.
function showFusca(entry){
 const on=!!entry&&fuscaBody.apply(fuscaTemplate,entry);if(!on)fuscaBody.clear();
 opalaShell.visible=!on;seatShift.fromArray(on?FUSCA_SEAT:[0,0,0]);eyeShift.fromArray(on?FUSCA_EYE:[0,0,0]);cabinVisibility();attachOpenings();
 // Its door mirrors' own glass, seen from the cockpit camera there.
 fuscaMirrors?.attach(on?fuscaBody.car:null,carBody,cockpit.eye.clone().add(eyeShift),{glass:'Espelho_fusca'});return on;
}
// The Opala's model in the chosen paint: the car screen and the circuit load share one download.
function ensureCarModel(){
 if(model&&activeLivery===$('livery').value)return Promise.resolve();
 return modelLoading??=setLivery($('livery').value).finally(()=>{modelLoading=null;});
}
// The 99's two paints (V): another team's car has only its own (the settings' Pintura then only
// saves the choice, loaded when the next race in the 99, or the car screen, needs it).
async function cycleLivery(){
 if(!ready||$('skinButton').disabled||raceCar!=='99'||raceModel==='fusca')return;
 try{await setLivery(activeLivery==='assinaturas_omp'?'seiva_danilo':'assinaturas_omp');}
 catch(err){status('Não foi possível trocar a pintura. Tente novamente.');console.error(err);}
}
// At the box the crew and the pilot on foot (action key) open the hinged parts; what he opened by
// hand stays open as the car moves off, until he shuts it again (user, 2026-10-15: "não fecha automático").
function updateOpenings(dt){openings.update(dt);showTrunkInside(trunkInterior,openings);}
// The hinged parts the crew and the pilot on foot work: the car the player drives, the Opala or the Fusca shown in its place.
function attachOpenings(){openings.attach(fuscaBody.active?fuscaBody.car:model);}
// nearest (R key): only the player's car goes back on track; rivals, laps and fuel carry on.
function reset(nearest=false){walker?.reset();autoShift.cancel();car.fall=null;if(fallMode){setCameraMode(fallMode);fallMode=null;}fallView.stop(camera);if(!nearest)explosions?.reset();action.reset();mobile?.setHandbrake(false);openings.closeAll(true);if(nearest&&arenaMode)arenaMode.spawn(car);else if(nearest)car.recover();else{ghostRecorder.reset();car.resetGrid(playerGridSlot(immersive?.lineup?.length));arenaMode?.spawn(car);if(immersive&&!immersive.active)immersive.resetField();cockpit.resetPhone();}driver?.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();automatic=false;followInitialized=false;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;lookBack.reset();updateCar(1);updateCamera(1);}
// The Descida do Lago begins where T4 turns (1368 m; it began at 1500, after T4, and the HUD said Reta Oposta through it).
// The Laranjinha is the Ferradura's second bend (T7, from 2140 m), the corner after it the Curva do Esse (T8; the user,
// 10-27: the HUD called that one Laranjinha). The Reta dos boxes begins out of the Café (3740 m; the copilot names it
// in its middle), T15 its kink.
const names=[[0,'Reta dos boxes'],[280,'S do Senna · T1–T2'],[490,'Curva do Sol · T3'],[700,'Reta Oposta'],[1368,'Descida do Lago · T4–T5'],[1810,'Subida para a Ferradura'],[1990,'Ferradura · T6'],[2140,'Laranjinha · T7'],[2230,'Curva do Esse · T8'],[2430,'Pinheirinho · T9'],[2660,'Bico de Pato · T10'],[2840,'Mergulho · T11'],[3120,'Junção · T12'],[3250,'Subida dos boxes · T13'],[3570,'Café · T14'],[3740,'Reta dos boxes'],[3960,'T15 · Reta dos boxes']];
function location(s){const sections=data.meta.sections||names;let name=sections[0][1];for(const [d,n] of sections)if(s>=d)name=n;return name;}
const fmt=t=>{if(t===null)return '—';const m=Math.floor(t/60),s=t%60;return `${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}`;};
// The track's outline, drawn once per circuit and map size into a canvas of its own: the HUD's map copies it and adds
// the cars (it traced 2000 points 14 times a second, on the processor of a cheap PC too).
let mapBase=null;
function mapOutline(w,h){
 if(mapBase?.data===data&&mapBase.w===w&&mapBase.h===h&&mapBase.project===projectMap)return mapBase.canvas;
 const canvas=mapBase?.canvas??document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
 ctx.beginPath();data.samples.forEach((p,i)=>{const [x,y]=projectMap(p[1],p[2]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();
 // A branch road (data.branches) is part of the lap: drawn with it, from where it leaves to where it rejoins.
 for(const b of data.branches??[]){const c=b.columns,x=c.indexOf('x'),y=c.indexOf('y');b.samples.forEach((p,i)=>{const [px,py]=projectMap(p[x],p[y]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});}
 ctx.lineWidth=8;ctx.strokeStyle='#ffffff16';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#b6c5b5';ctx.stroke();
 // The stretches closed to the race (data.closed_roads), faint under the lap.
 if(data.closed_roads?.length){
  ctx.beginPath();for(const r of data.closed_roads){const x=r.columns.indexOf('x'),y=r.columns.indexOf('y');r.samples.forEach((p,i)=>{const [px,py]=projectMap(p[x],p[y]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});}
  ctx.lineWidth=1.5;ctx.strokeStyle='#b6c5b544';ctx.stroke();
 }
 mapBase={data,w,h,project:projectMap,canvas};return canvas;
}
function drawMap(){
 const ctx=$('map').getContext('2d'),w=260,h=$('map').height;ctx.clearRect(0,0,w,h);
 if(arenaMode){arenaMode.drawMap(ctx,projectMap,car);return;}
 const xy=p=>projectMap(p[1],p[2]);
 ctx.drawImage(mapOutline(w,h),0,0);
 if(immersive&&(!immersive.active||['starting','grid','race'].includes(immersive.state.phase))){for(const [i,r] of immersive.rivals.entries()){if(r.spectator)continue;const [x,y]=projectMap(r.car.x,r.car.y);ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle=cssColor(r.entry.mark);ctx.fill();ctx.strokeStyle='#0c1c17';ctx.lineWidth=1.2;ctx.stroke();}}
 if(pitstop){ctx.beginPath();let started=false;const nodes=data.samples.filter(p=>pitLane(data,p[0])).sort((a,b)=>pitLane(data,a[0]).u-pitLane(data,b[0]).u);for(const p of nodes){const d=pitLane(data,p[0]).offset,[x,y]=projectMap(p[1]-p[8]*d,p[2]+p[7]*d);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.strokeStyle='#55e0db';ctx.lineWidth=2;ctx.stroke();const [px,py]=projectMap(pitstop.anchor.x,-pitstop.anchor.z);ctx.fillStyle='#114e43';ctx.fillRect(px-9,py-21,18,16);ctx.fillStyle='#fff5a1';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('P',px,py-9);}
 if(data.pit){const c=data.pit.columns,x=c.indexOf('x'),y=c.indexOf('y');ctx.beginPath();data.pit.samples.forEach((p,i)=>{const [px,py]=projectMap(p[x],p[y]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.lineWidth=1.5;ctx.strokeStyle=car.surface.pit?'#55e0db':'#7fa7a0';ctx.stroke();}
 const [sx,sy]=xy(data.samples[0]);ctx.fillStyle='#ffffff';ctx.fillRect(sx-3,sy-3,6,6);
 if(ghostOnTrack){const [gx,gy]=projectMap(ghostPose.x,ghostPose.y);ctx.beginPath();ctx.arc(gx,gy,4,0,Math.PI*2);ctx.fillStyle='#7fdcff66';ctx.fill();ctx.strokeStyle='#c8f6ff';ctx.lineWidth=1.5;ctx.stroke();}
 const [x,y]=projectMap(car.x,car.y);ctx.save();ctx.translate(x,y);ctx.rotate(-car.heading);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4);ctx.lineTo(-3,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fillStyle='#e2fb57';ctx.shadowBlur=10;ctx.shadowColor='#d6fa4b';ctx.fill();ctx.restore();
}
const roughRotation=new THREE.Quaternion(),roughEuler=new THREE.Euler(),chaseForward=new THREE.Vector3(1,0,0),chaseTarget=new THREE.Vector3(1,0,0),driftView=new THREE.Vector3();let roughRide=0;
function updateCar(dt){
 cabinVisibility();
 // A paused race holds the car still (dt 1, a placement, still snaps): a sprung body still settling would
 // carry the cockpit and photo cameras with it for a couple of seconds.
 const live=paused&&dt<1?0:dt;
 // Wheels on the kerbs (kerb-contact.js): car.kerbRide for the cameras; a kerb under the body is no rough grass.
 rideKerbs(car,live);
 const p=car.surface,speed=Math.hypot(car.vx,car.vy),roughTarget=p.onRoad||car.kerbCentre||!car.wheelsDown?0:clamp(speed/22,0,1);
 roughRide=dt>=1?0:roughRide+(roughTarget-roughRide)*(1-Math.exp(-live*9));
 // Distance-based suspension motion stops at rest and fades on returning to asphalt.
 const bump=roughRide*(Math.sin(car.distance*2.1)*.025+Math.sin(car.distance*4.7)*.012);
 // The physics body carries heave, pitch, roll, jumps and rollovers; the
 // model origin sits on the ground below its centre of mass.
 const pose=car.pose(renderAhead());carRoot.position.set(pose.x,pose.z+bump,-pose.y);
 forward.set(pose.forward[0],pose.forward[2],-pose.forward[1]);up.set(pose.up[0],pose.up[2],-pose.up[1]);right.crossVectors(forward,up).normalize();
 matrix.makeBasis(forward,up,right);
 roughEuler.set(Math.sin(car.distance*2.7)*roughRide*.008,0,Math.sin(car.distance*1.9)*roughRide*.006);
 // On a kerb the side on its crown sits a few centimetres up and the body buzzes over the ridges (less with calmer camera motion).
 const kerbBuzz=(speedFx?.profile.kerbBuzz?car.kerbRide:0)*(reducedMotion.matches?0:graphics.values.cameraMotion)*(Math.sin(car.distance*15.7)*.6+Math.sin(car.distance*9.1+1)*.4);roughEuler.x+=car.kerbTilt*.022+kerbBuzz*.004;carRoot.position.y+=Math.abs(car.kerbTilt)*.02+kerbBuzz*.006;
 carRoot.quaternion.setFromRotationMatrix(matrix).multiply(roughRotation.setFromEuler(roughEuler));
 // Springs and anti-roll bars now tilt the physics body; this adds the rest of
 // the visible roll outward in corners, dive under braking and squat under power.
 const rollTarget=clamp((car.latAccel??0)*.0022,-.03,.03),pitchTarget=clamp((car.longAccel??0)*.002,-.025,.015);
 if(dt>=1){suspension.roll=rollTarget;suspension.pitch=pitchTarget;suspension.rollRate=suspension.pitchRate=0;}
 else for(let left=live;left>1e-6;left-=1/120){const h=Math.min(left,1/120);springTo('roll',rollTarget,h,8.5,.5);springTo('pitch',pitchTarget,h,9.5,.55);}
 setBodyTilt(suspension.roll,suspension.pitch);
 // Cameras and bodywork must use the same rendered orientation.
 forward.set(1,0,0).applyQuaternion(carRoot.quaternion);up.set(0,1,0).applyQuaternion(carRoot.quaternion);right.set(0,0,1).applyQuaternion(carRoot.quaternion);
 // Chase views follow the nose while the car is on its wheels; in a roll they
 // swing slowly toward the direction of travel instead of tumbling with it.
 const tumbling=car.upright<.6;
 if(!tumbling)chaseTarget.copy(forward);else if(speed>2)chaseTarget.set(car.vx,0,-car.vy).normalize();
 // On the arena the follow cameras look between the nose and the way the car travels, and swing more slowly: a drift
 // is seen from its side instead of the camera turning with the car.
 const drifting=arenaMode&&!tumbling&&speed>4&&driftView.set(car.vx,0,-car.vy).normalize().dot(forward)>-.2;if(drifting)chaseTarget.lerp(driftView,.5).normalize();
 chaseForward.lerp(chaseTarget,dt>=1?1:1-Math.exp(-dt*(tumbling?2.5:drifting?7:30))).normalize();
 for(const w of fuscaBody.active?fuscaBody.wheels:wheels){
  // Fisica: angulo positivo aponta para a esquerda. No GLB: frente +X,
  // cima +Y e esquerda -Z. Construir o eixo de rodagem evita inverter
  // esquerda/direita ao converter os eixos Blender -> glTF.
  const angle=w.front?car.steer:0;
  wheelForward.set(Math.cos(angle),0,-Math.sin(angle));
  wheelAxle.crossVectors(wheelForward,wheelUp);
  wheelTurn.setFromRotationMatrix(wheelMatrix.makeBasis(wheelForward,wheelUp,wheelAxle));
  wheelSpin.setFromAxisAngle(axleAxis,-(w.front?car.spin:car.rearSpin));
  w.obj.quaternion.copy(wheelTurn).multiply(w.base).multiply(wheelSpin).premultiply(bodyTiltInverse);
  // Suspension travel: wheels tuck in over bumps and hang down in the air.
  const travel=car.wheelTravel?.[w.index]??0;
  wheelOffset.copy(w.basePosition);wheelOffset.y+=fuscaBody.active?Math.min(FUSCA_WHEEL_BUMP,travel*FUSCA_WHEEL_TRAVEL):travel;
  w.obj.position.copy(wheelOffset.sub(bodyPivot).applyQuaternion(bodyTiltInverse).add(bodyPivot));
 }
 // The frame's contact shadows start with this car's (fading in the air and on its side), and its wheels blur at speed.
 const wheelsShown=fuscaBody.active?!!fuscaBody.car?.visible:!!model?.visible&&opalaShell.visible;
 carContact.begin();carContact.car(carRoot,car,fuscaBody.active?'fusca':'opala',wheelsShown?(fuscaBody.active?fuscaBody.wheels:wheels):null);
}
function setBodyTilt(roll,pitch){
 bodyTilt.setFromEuler(bodyEuler.set(roll,0,pitch));bodyTiltInverse.copy(bodyTilt).invert();
 carBody.quaternion.copy(bodyTilt);carBody.position.copy(bodyPivot).sub(wheelOffset.copy(bodyPivot).applyQuaternion(bodyTilt));
}
// Rival templates are cloned from the model: hand them an untilted body and wheels.
function restBodyPose(){
 suspension.roll=suspension.pitch=suspension.rollRate=suspension.pitchRate=0;setBodyTilt(0,0);
 for(const w of wheels){w.obj.quaternion.copy(w.base);w.obj.position.copy(w.basePosition);}
}
// chosen: the player picked this view (C, the camera buttons, the menu, touch). It is remembered and
// every race starts in it: after the opening shots and, in the story, once the engine catches. Views
// the game sets itself (the story's cockpit for the start, the orbit a mouse drag opens) are not.
function setCameraMode(value,chosen=false){
 if(!cameraModes.includes(value))return;
 // Only a follow view already drawn for this car is worth keeping when the orbit takes over.
 const previous=mode,keepView=ready&&value==='orbit'&&previous!=='orbit'&&(followInitialized||wasGridPreview);
 mode=value;orbitFrom=null;followInitialized=false;if(value==='tv')tvCamera?.reset();orbit.enabled=value==='orbit';$('camera').value=value;
 if(chosen)preferences.update({camera:value});
 orbit.enableRotate=!pointerLocked;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;lookBack.reset();
 cabinVisibility();
 document.body.classList.toggle('cockpit-mode',value==='cockpit');
 $('cockpitButton').classList.toggle('active',value==='cockpit');$('cockpitButton').setAttribute('aria-pressed',String(value==='cockpit'));
 if(!keepView)camera.fov=baseFov(value,camera.aspect);camera.near=value==='cockpit'?.025:.1;camera.updateProjectionMatrix();
 if(value!=='cockpit')camera.up.set(0,1,0);
 $('orbitButton').classList.toggle('active',orbit.enabled);
 $('orbitButton').setAttribute('aria-pressed',String(orbit.enabled));
 cameraHint();
 if(orbit.enabled&&ready&&previous!=='orbit'){
  orbit.target.copy(carRoot.position).add(new THREE.Vector3(0,.85,0));
  // A orbita continua a vista externa atual: mesma posicao, enquadramento e campo de visao.
  // De dentro do carro, recua atras dele na direcao do olhar e mira o carro.
  if(!keepView){
   if(previous==='hood'||previous==='cockpit')camera.getWorldDirection(orbitDelta);else orbitDelta.copy(forward);
   if(orbitDelta.setY(0).lengthSq()<1e-6)orbitDelta.copy(forward).setY(0);
   camera.position.copy(orbit.target).addScaledVector(orbitDelta.normalize(),-7).add(new THREE.Vector3(0,2.8,0));
  }
  // A aerea fica alem do alcance normal: a orbita comeca na mesma distancia.
  orbit.maxDistance=keepView&&previous==='aerial'?Math.max(ORBIT_MAX_DISTANCE,camera.position.distanceTo(orbit.target)):ORBIT_MAX_DISTANCE;
  camera.getWorldDirection(aimView);orbitTilt();orbit.update();
  if(keepView)aimOffset(aimToCar.subVectors(orbit.target,camera.position).normalize(),aimView,orbitAim);else orbitAim.yaw=orbitAim.pitch=0;
  aimOrbit();orbitSeen.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));orbitSpeedFov=keepView&&FOLLOW_FRAMES.includes(previous)?previous:false;
 }
}
// Mouse, wheel and touch turn the current view into the orbit; C still moves on from that view.
function orbitFromView(){if(mode==='orbit')return;const from=mode;setCameraMode('orbit');orbitFrom=from;}
function nextCameraMode(){
 const step=m=>cameraModes[(cameraModes.indexOf(m)+1)%cameraModes.length],next=step(orbitFrom??mode);
 return next===mode?step(next):next;
}
function cameraHint(){
 $('cameraHint').textContent=pointerLocked?'Mouse capturado · mova para olhar · Esc libera · retorno após 3 s em movimento':lockUnavailable?'Arraste para girar · retorno após 3 s em movimento':'Clique na pista para capturar o mouse · Esc libera';
}
function lockFailed(){lockPending=false;orbit.enableRotate=true;cameraHint();status('Mouse livre. Clique novamente na pista para tentar capturar.');}
// Ignore the entire touch gesture when it starts near driving controls,
// before either the camera-mode handler or OrbitControls receives it.
const blockedCameraTouches=new Set();
for(const type of ['pointerdown','pointermove','pointerup','pointercancel']){
 $('view').addEventListener(type,e=>{
  if(e.pointerType!=='touch')return;
  if(type==='pointerdown'&&mobile?.blocksCameraGesture(e))blockedCameraTouches.add(e.pointerId);
  if(!blockedCameraTouches.has(e.pointerId))return;
  if(type==='pointerup'||type==='pointercancel')blockedCameraTouches.delete(e.pointerId);
  e.preventDefault();e.stopImmediatePropagation();
 },{capture:true,passive:false});
}
window.addEventListener('blur',()=>blockedCameraTouches.clear());
// Native lock is requested only from a deliberate click on the playing surface.
$('view').addEventListener('pointerdown',e=>{
 // On foot the right button winds up a pass (pampulha-futebol.js; held: harder).
 if(e.button===2&&pointerLocked&&walker?.active&&!paused){e.preventDefault();e.stopImmediatePropagation();walkMouse.passe=true;walker.rightClick();return;}
 if(!ready||paused||pitstop?.opened||e.button!==0||immersive?.active&&!immersive.allowsPointer())return;
 cameraReturn.manual(performance.now());
 if(e.pointerType==='mouse'&&!lockUnavailable&&$('view').requestPointerLock){
  e.stopImmediatePropagation();
  // On foot with the phone out (selfie.js), a click on the captured mouse is the shutter; with a ball at his feet it winds up
  // a shot (held: harder, walkMouse).
  if(pointerLocked&&walker?.active){walkMouse.chute=true;if(walker.click())return;}
  if(pointerLocked||lockPending)return;
  lockPending=true;
  try{const request=$('view').requestPointerLock();request?.catch(lockFailed);}catch{lockFailed();}
 }else{orbitFromView();$('view').classList.add('dragging');}
},{capture:true});
document.addEventListener('pointerlockchange',()=>{
 const wasLocked=pointerLocked,freed=mouseFreed;pointerLocked=document.pointerLockElement===$('view');lockPending=false;mouseFreed=false;
 if(pointerLocked&&paused){document.exitPointerLock();return;}
 orbit.enableRotate=!pointerLocked;document.body.classList.toggle('pointer-locked',pointerLocked);$('view').classList.remove('dragging');
 cameraReturn.manual(performance.now());cameraHint();
 if(pointerLocked)status('');
 // Escape releases the lock without a keydown: that opens the menu, but with the selfie's phone out it only puts the
 // phone away (user, 2026-10-20: "no modo selfie, ESC volta pra tela principal"). The pause (P) releasing it,
 // or the window going to another app, only pauses with the track on screen (the recon lap goes on).
 if(wasLocked&&!pointerLocked&&!freed&&!held&&walker?.active&&walker.selfie.busy&&document.hasFocus()&&!document.hidden){walker.selfie.close();return;}
 if(wasLocked&&!pointerLocked&&!freed&&!held&&!pitstop?.opened&&!immersive?.blockingUI()){if(document.hasFocus()&&!document.hidden)menu(true);else if(!automatic)hold(true);}
});
document.addEventListener('pointerlockerror',lockFailed);
document.addEventListener('mousemove',e=>{
 // On foot (pit stop, story-mode paddock, out of the car anywhere) and on the podium the mouse belongs to that camera.
 if(!pointerLocked||paused||pitstop?.opened||immersive?.ownsMouse()||(!e.movementX&&!e.movementY))return;
 if(walker?.active){walker.turnView(e.movementX,e.movementY);return;}
 lookAround(e.movementX,e.movementY);
});
// Looking around from the car (dx, dy in mouse pixels): the captured mouse or the controller's right stick.
function lookAround(dx,dy){
 if(isInside()){
  // The cockpit turns right round; while B holds the look back, the look to return to stays put.
  if(!lookBack.held)turnHead(headLook,dx,dy,mode==='cockpit'?HEAD_YAW_COCKPIT:HEAD_YAW_HOOD);
 }else{
  orbitFromView();
  orbit.rotateLeft(dx*.0025);orbit.rotateUp(dy*.0025);
 }
 cameraReturn.manual(performance.now());
}
// The right stick needs no captured mouse: on foot it turns the walking camera, at the box (in the
// car) it orbits round the crew, and on the podium the mouse alone moves the photo camera. In the car,
// let go, the view turns back to the front at once (the mouse keeps its 3 s return while moving).
let padLooked=false;
function padLook(dx,dy){
 padLooked=false;
 if(!ready||paused)return;
 if(pitstop?.opened){if(!pitstop.coffee)pitstop.orbitView(dx,dy);else if(!pitstop.coffee.menu)pitstop.turnView(dx,dy);return;}
 if(immersive?.onFoot()){immersive.visual.turnView(dx,dy);return;}
 if(walker?.active){walker.turnView(dx,dy);return;}
 if(!immersive?.ownsMouse()){lookAround(dx,dy);padLooked=true;}
}
function padLookEnd(){if(padLooked)cameraReturn.recall();padLooked=false;}
$('view').addEventListener('pointermove',e=>{if(!pointerLocked&&e.buttons)cameraReturn.manual(performance.now());});
window.addEventListener('pointerup',e=>{$('view').classList.remove('dragging');walkMouse[e.button===2?'passe':'chute']=false;});
// The mouse's buttons held on foot (a shot, a pass winding up); the menu the right button would open stays shut there.
const walkMouse={chute:false,passe:false};$('view').addEventListener('contextmenu',e=>{if(walker?.active)e.preventDefault();});
$('view').addEventListener('pointercancel',()=>$('view').classList.remove('dragging'));
$('view').addEventListener('wheel',e=>{if(walker?.active){if(!paused)walker.zoom(Math.sign(e.deltaY));return;}if(ready&&!paused&&!pitstop?.opened&&!immersive?.ownsMouse()){if(pointerLocked&&isInside()){e.stopImmediatePropagation();return;}orbitFromView();cameraReturn.manual(performance.now());}},{capture:true,passive:true});
// The rival the cameras watch in the recon lap, or a multiplayer pilot's past the flag, parked (null: the player's own car).
const watchingOthers=()=>automatic||!!multiplayer?.spectating?.();
function watchedRival(){
 if(!watched||!watchingOthers()||!immersive||immersive.active)return null;
 const obj=immersive.visual.rivals[watched-1],rival=immersive.rivals[watched-1];
 return obj&&rival?{obj,car:rival.car,entry:obj.userData.entry}:null;
}
function watchNext(step=1){
 if(!ready||!watchingOthers()||immersive.active)return;
 // (past a car out of sight: a room's host who only watches, its own or, on a guest's screen, that host's: spectator)
 const n=immersive.visual.rivals.length+1,shown=k=>k?!immersive.rivals[k-1]?.spectator:!immersive.visual.hideOwn;
 for(let i=0;i<n;i++){watched=((watched+step)%n+n)%n;if(shown(watched))break;}
 followInitialized=false;tvCamera?.reset();headLook.yaw=headLook.pitch=0;lookBack.reset();
 const rival=watchedRival();if(rival)watchForward.set(1,0,0).applyQuaternion(rival.obj.quaternion);
 cabinVisibility();hud();
}
// Follow cameras sit behind the smoothed heading and look ahead of the car.
const followsCar=m=>m==='chase'||m==='close'||m==='far'||m==='aerial';
// A follow view's place at rest (camera-rig.js CAMERA_FRAMES, for this car and screen): where the orbit returns to.
function followPose(m,p,ahead=chaseForward,body=car.body){
 if(m==='aerial'){desired.copy(p).addScaledVector(ahead,-40).add(new THREE.Vector3(0,95,35));look.copy(p).addScaledVector(ahead,22);}
 else{const f=frameFor(m,{body,aspect:camera.aspect});desired.copy(p).addScaledVector(ahead,-f.back);desired.y+=f.up;look.copy(p).addScaledVector(ahead,f.ahead);look.y+=f.lookUp;}
}
// Walls between the car and a follow camera: a copy of the list per circuit (on-foot.js clearView caches its cut
// pieces per list, and cameraObstacles is refilled in place for the next circuit).
function followWalls(){if(followObstacles?.data!==data||followObstacles.count!==cameraObstacles.length){followObstacles=[...cameraObstacles];followObstacles.data=data;followObstacles.count=cameraObstacles.length;}return followObstacles;}
// Keeps the eye (desired) in front of the first wall between it and the car's roof, easing back out over
// a quarter second once clear, and above the ground. Checked every other frame.
function clearFollow(p,subject,dt){
 rayFrom.copy(p);rayFrom.y+=1.1;const full=desired.distanceTo(rayFrom);
 if(followReach===null||renderedFrame%2===0){rayProbe.copy(desired);followBlock=clearView(rayFrom,rayProbe,followWalls())?rayProbe.distanceTo(rayFrom):Infinity;}
 let reach=followReach??full;reach=reach<full?reach+(full-reach)*(1-Math.exp(-dt*4)):full;followReach=reach=Math.min(reach,followBlock);
 if(reach<full-.01)desired.sub(rayFrom).multiplyScalar(reach/full).add(rayFrom);
 // Pulled in past the car's tail (a wall right behind it), the eye rises over the roof instead of entering the body.
 const tail=(subject.body?.rear??2.35)+1.2,flat=Math.hypot(desired.x-p.x,desired.z-p.z);if(flat<tail)desired.y+=1.3*Math.min(1,(tail-flat)/1.2);
 desired.y=Math.max(desired.y,subject.sample(desired.x,-desired.z).z+.35);
}
// Chase, close and far (camera-rig.js): springs behind the car, a lens that opens with speed while the eye comes
// in (dolly), a look into the corners, clear of walls and ground, and vibration as small turns of the view. behind: looking
// back (Central #23), the same place mirrored to the front of the car, facing it.
let rodeBehind=false;
function rideCamera(dt,p,subject,ahead,motion,top,behind=false){
 if(!followInitialized){rig.reset();followReach=null;followInitialized=true;}
 if(behind!==rodeBehind){followReach=null;rodeBehind=behind;}
 // (held as the race is: paused, or a multiplayer race standing still while its host is out of reach)
 const vel=Math.hypot(subject.vx,subject.vy),still=(paused||!!multiplayer?.frozen())&&dt<1;
 const r=rig.update({dt:still?0:dt,mode,aspect:camera.aspect,body:subject.body,heading:Math.atan2(-ahead.z,ahead.x),pitch:Math.asin(clamp(ahead.y,-1,1)),travel:Math.atan2(subject.vy,subject.vx),
  speed:vel,yawRate:subject.yaw??0,longAccel:subject.longAccel??0,heave:p.y-subject.sample(p.x,-p.z).z,tumbling:subject.upright<.6,motion,gear:subject.gear,keep:dolly(baseFov(mode,camera.aspect),camera.fov),kerb:subject.kerbRide||0});
 camDir.set(Math.cos(r.pitch)*Math.cos(r.yaw),Math.sin(r.pitch),-Math.cos(r.pitch)*Math.sin(r.yaw));camRight.set(Math.sin(r.yaw),0,Math.cos(r.yaw));
 // (the kerb's jolt moves the eye alone: the car under it shakes, the far scenery hardly)
 const face=behind?-1:1;desired.copy(p).addScaledVector(camDir,-r.back*face);desired.y+=r.up+r.lift+r.jolt;
 look.copy(p).addScaledVector(camDir,r.ahead*face).addScaledVector(camRight,behind?0:-r.side);look.y+=r.lookUp+r.lift;
 clearFollow(p,subject,still?0:dt);
 camera.position.copy(desired);camera.up.set(0,1,0);camera.lookAt(look);
 if(still||motion<=0)return;
 const rough=subject===car?roughRide:subject.surface?.onRoad===false?clamp(vel/22,0,1):0;
 vibration(performance.now()/1000,{u:vel/top,motion,rough,kerb:subject.kerbRide||0,impact:action.impact},camShake);camera.rotateX(camShake.pitch);camera.rotateY(camShake.yaw);camera.rotateZ(camShake.roll);
}
// The story's grid: a low rear three-quarter shot of the car (a racing game's grid), from the side away from the
// pits, looking across the car toward them; while the countdown runs it slowly swings in behind the car.
let gridHeroStart=0,gridHeroSeen=0;
function gridHero(p){
 const s=carScale(car.body),side=data.pit?.reversed?-1:1,now=performance.now();if(now-gridHeroSeen>500)gridHeroStart=now;gridHeroSeen=now;
 const motion=reducedMotion.matches?0:graphics.values.cameraMotion,swing=motion*.08*Math.exp(-(now-gridHeroStart)/6000),c=Math.cos(swing),k=-side*Math.sin(swing);
 camera.fov=baseFov('grid',camera.aspect);camera.updateProjectionMatrix();
 const back=-4.6*s,across=1.4*s*side;desired.copy(p).addScaledVector(forward,back*c-across*k).addScaledVector(right,across*c+back*k);desired.y+=1.02;
 look.copy(p).addScaledVector(forward,7.5).addScaledVector(right,-1.05*side);look.y+=.72;
 followReach=null;clearFollow(p,car,0);camera.position.copy(desired);camera.up.set(0,1,0);camera.lookAt(look);
}
// Where the car's outline (camera-rig.js carPoints) is on screen, as fractions from the top left (checks).
function carOnScreen(){
 carRoot.updateMatrixWorld(true);camera.updateMatrixWorld();let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 // (null while part of the car is behind the lens)
 for(const [f,l,h] of carPoints(car.body)){screenPoint.set(f,h,-l).applyMatrix4(carRoot.matrixWorld).applyMatrix4(camera.matrixWorldInverse);if(screenPoint.z>-camera.near)return null;screenPoint.applyMatrix4(camera.projectionMatrix);const x=(screenPoint.x+1)/2,y=(1-screenPoint.y)/2;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 const r=v=>Math.round(v*1e4)/1e4;return {x0:r(x0),x1:r(x1),y0:r(y0),y1:r(y1),width:r(x1-x0),height:r(y1-y0)};
}
// The cars riding with the camera, kept sharp by the speed smear (cinematic.js smearCars): the followed car and the
// nearest others within 70 m, each its outline's screen box (the followed car's is the whole screen while part of it
// is behind the lens: the bonnet, the cockpit) and the road under it in view space. Composed from the pose, no matrix walk of the models.
const smearCars=Array.from({length:SMEAR_CARS},()=>({box:[0,0,0,0],plane:[0,1,0,0],far:0})),smearList=[],smearNear=[],smearRiders=[],smearPose=new THREE.Matrix4(),smearClip=new THREE.Matrix4(),smearUp=new THREE.Vector3(),smearAt=new THREE.Vector3(),smearOutline=new WeakMap();
const nearSmear=(a,b)=>a.d-b.d;
function ridingCars(subjectObj,subjectCar){
 smearList.length=0;smearNear.length=0;camera.updateMatrixWorld();smearClip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const rivalObjs=immersive?.visual?.root.visible?immersive.visual.rivals:null,field=rivalObjs?immersive.rivals:null,count=2+(field?.length??0);
 // (pooled entries: a frame allocates nothing here; the last candidate is the ghost lap, shaped as the player's car.
 // Each field rival finds its car by rosterIndex, as ImmersiveVisuals.updateFree poses it: a 1x1 or short field keeps
 // only the entrants, so the k-th rival is not the k-th car.)
 for(let k=0;k<count;k++){const ghost=k===count-1,r=!ghost&&k?field[k-1]:null,o=ghost?ghostCar.body:r?rivalObjs[r.rosterIndex]:carRoot,c=ghost?car:r?r.car:car;if(!o||o===subjectObj||!(ghost?ghostCar.root.visible:o.visible)||!c)continue;const d=o.position.distanceToSquared(camera.position);if(d>=4900)continue;
  const e=smearRiders[smearNear.length]??(smearRiders[smearNear.length]={d:0,o:null,c:null});e.d=d;e.o=o;e.c=c;smearNear.push(e);}
 // Slots left over from a fuller frame let go of their cars (an old circuit's rivals and track data, after a reload).
 for(let i=smearNear.length;i<smearRiders.length&&smearRiders[i].o;i++)smearRiders[i].o=smearRiders[i].c=null;
 smearNear.sort(nearSmear);
 // Down the list until the slots are full: a car wholly behind the lens or off screen gives its slot to the next.
 for(let k=0;k<=smearNear.length&&smearList.length<SMEAR_CARS;k++){const out=smearCars[smearList.length];if(riderBox(k?smearNear[k-1].o:subjectObj,k?smearNear[k-1].c:subjectCar,out,!k))smearList.push(out);}
 return smearList;
}
// One car's entry (out: box, plane, far) for the camera this frame (smearClip set): false when it is off screen.
function riderBox(o,c,out,followed){
 const points=c.body?smearOutline.get(c.body)??smearOutline.set(c.body,carPoints(c.body)).get(c.body):carPoints(null);
 smearPose.compose(o.position,o.quaternion,o.scale);let x0=1,y0=1,x1=0,y1=0,far=0,behind=false;
 for(const [f,l,h] of points){
  smearAt.set(f,h,-l).applyMatrix4(smearPose);far=Math.max(far,smearAt.distanceTo(camera.position));smearAt.applyMatrix4(smearClip);
  // (applyMatrix4 divides by w: a point behind the lens has w<=0, its box is the whole screen)
  if(smearAt.z>1||smearAt.z<-1){behind=true;continue;}const x=smearAt.x*.5+.5,y=smearAt.y*.5+.5;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
 }
 // Another car across the lens (tucked in behind, passing the camera): the box of its part in front, run out to the
 // screen's edges on its side (a whole-screen box switched the phones' road smear off all through close racing).
 if(behind&&followed){x0=y0=-1;x1=y1=2;}
 else{if(x1<x0)return false;const mx=(x1-x0)*.04+.004,my=(y1-y0)*.04+.004;x0-=mx;x1+=mx;y0-=my;y1+=my;
  if(behind){smearAt.copy(o.position).applyMatrix4(camera.matrixWorldInverse);if(smearAt.x<0)x0=-1;else x1=2;if(smearAt.y<0)y0=-1;else y1=2;}}
 if(x1<=0||x0>=1||y1<=0||y0>=1)return false;
 smearUp.set(0,1,0).applyQuaternion(o.quaternion).transformDirection(camera.matrixWorldInverse);smearAt.copy(o.position).applyMatrix4(camera.matrixWorldInverse);
 out.box[0]=x0;out.box[1]=y0;out.box[2]=x1;out.box[3]=y1;out.plane[0]=smearUp.x;out.plane[1]=smearUp.y;out.plane[2]=smearUp.z;out.plane[3]=smearUp.dot(smearAt);out.far=far+1;return true;
}
// The followed car's box for the air's specks (speed-particles.js setCarBox): none from inside it (its box is the whole
// screen there, and the specks start past the bonnet) or with no specks drawn. Its own entry: a few dozen points a frame.
const moteRider={box:[0,0,0,0],plane:[0,1,0,0],far:0};
function moteCarBox(subjectObj,subjectCar){
 if(!speedFx?.motes.count||isInside()||!subjectObj?.visible)return null;
 camera.updateMatrixWorld();smearClip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 return riderBox(subjectObj,subjectCar,moteRider,false)?moteRider:null;
}
function updateCamera(dt){
 if(pitstop?.opened)return;
 // Out of the car (free-walk.js) the walk places the camera; the sun's shadows follow the pilot.
 if(walker?.active){placeSun(walker.hero.position,null,dt);return;}
 // The arena's editor looks down on the whole floor (drift-arena-mode.js).
 if(arenaMode?.editing){arenaMode.editorCamera(camera);placeSun(carRoot.position,null,dt);return;}
 if(immersive?.active&&['crowd','podium'].includes(immersive.state.phase)&&!immersive.inCar){const p=immersive.visual.hero.getWorldPosition(new THREE.Vector3());placeSun(p,null,dt);return;}
 const rival=watchedRival(),subject=rival?.car??car,p=rival?rival.obj.position:carRoot.position,vel=Math.hypot(subject.vx,subject.vy);
 // A watched rival's nose, smoothed as chaseForward is for the player's car.
 if(rival){rival.obj.updateMatrixWorld(true);watchTarget.set(1,0,0).applyQuaternion(rival.obj.quaternion);if(subject.upright<.6&&vel>2)watchTarget.set(subject.vx,0,-subject.vy).normalize();watchForward.lerp(watchTarget,dt>=1?1:1-Math.exp(-dt*30)).normalize();}
 const ahead=rival?watchForward:chaseForward,heading=rival?watchTarget:forward;if(immersive?.visual)immersive.visual.focus=rival?.obj.position??null;
 // The opening shots place the sun themselves (runFrame), once a frame: here it would ease the lean twice.
 if(gridPreview()){wasGridPreview=true;gridHero(p);if(!intro.active)placeSun(p,forward,dt);return;}
 if(wasGridPreview){wasGridPreview=false;followInitialized=false;camera.fov=baseFov(mode,camera.aspect);camera.updateProjectionMatrix();}
 // Holding B counts as looking around: the 3 s return waits until it is let go.
 const photo=mode==='cockpit'&&!rival?cockpitView:null,lookingBack=lookBackAllowed()&&pressed('KeyB');
 if(lookingBack)cameraReturn.manual(performance.now());
 // The right stick let go swings back quicker than the slow return after the mouse.
 const centering=cameraReturn.update(performance.now(),vel,paused),blend=1-Math.exp(-dt*(cameraReturn.recalled?6:2.8));
 // Speed widens the view (camera-rig.js: by the share of the car's top speed, near misses punch it); inside
 // the car rough ground, kerbs and very high speed add a fine shake (the follow views turn instead).
 const motion=reducedMotion.matches?0:graphics.values.cameraMotion,top=topSpeed(subject.mechanics);
 const speedFov=photo?photo.fov:lensFov(mode==='orbit'?orbitSpeedFov||'orbit':mode,camera.aspect,{speed:vel,top,motion,surge:action.surge,punch:FOLLOW_FRAMES.includes(mode)?rig.punch:0});
 if(mode!=='tv'&&Math.abs(camera.fov-speedFov)>.01){camera.fov=dt>=1||photo?speedFov:easeLens(camera.fov,speedFov,dt);camera.updateProjectionMatrix();}
 const shakeTime=performance.now()/1000,shake=photo||paused||!isInside()?0:motion*(roughRide*.05+clamp((vel/top-.7)/.25,0,1)*.01+action.impact*.075+(subject.kerbRide||0)*.03);
 if(centering&&isInside()){headLook.yaw*=1-blend;headLook.pitch*=1-blend;}
 // The cockpit swings the head round; the hood and follow cameras cut to their view behind the car.
 const behind=lookingBack&&mode!=='cockpit';
 lookBack.update(dt,lookingBack&&!behind,headLook,headView);
 if(mode==='cockpit'||mode==='hood'){
  // Fixed local mount keeps the hood/dashboard still relative to the camera; turned far
  // round in the cockpit, the head leans in toward the middle of the car.
  neckTwist(mode==='cockpit'&&!photo?headView.yaw:0,twist);
  // A watched rival carries both cameras at the same places in its own body, beside its driver.
  const mount=rival?rival.obj.matrixWorld:carBody.matrixWorld;
  const fusca=fuscaBody.active&&!rival,view=photo??(behind?BEHIND:headView),eye=photo?photoEye:mode==='hood'?(behind?(fusca?fuscaBootEye:bootEye):fusca?fuscaHoodEye:hoodEye):headEye.fromArray(twist).add(cockpit.eye).add(rival?noShift:eyeShift),drop=photo?0:.20;
  // The mount's own matrix is all the eye needs (not the car's 600 parts below it, every frame).
  carBody.updateWorldMatrix(true,false);camera.position.copy(eye).applyMatrix4(mount);
  look.set(Math.cos(view.pitch)*Math.cos(view.yaw)*20,Math.sin(view.pitch)*20-drop,Math.cos(view.pitch)*Math.sin(view.yaw)*20).add(eye).applyMatrix4(mount);
  camera.position.y+=Math.sin(shakeTime*41)*shake*.35;look.y+=Math.sin(shakeTime*29+1.3)*shake*2;
  if(!photo&&!paused)look.y-=motion*action.braking*.16;
  camera.up.set(0,1,0).transformDirection(mount);camera.lookAt(look);if(photo?.roll)camera.rotateZ(photo.roll);
 } else if(mode==='orbit'){
  orbitTarget.copy(p).add(new THREE.Vector3(0,.85,0));
  orbitDelta.subVectors(orbitTarget,orbit.target);camera.position.add(orbitDelta);orbit.target.copy(orbitTarget);
  orbitTilt();orbit.update();
  orbitSphere.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));
  // A sideways framing only fits the view it came from: turning the orbit by hand lets it go,
  // or the car would slide off to the side as the camera comes down towards the horizon.
  orbitAim.yaw*=Math.exp(-4*(Math.abs(wrap(orbitSphere.theta-orbitSeen.theta))*Math.sin(orbitSphere.phi)+Math.abs(orbitSphere.phi-orbitSeen.phi)));
  if(centering){
   // The mouse only looked around a follow camera: return to that camera's own place. Otherwise go behind the car.
   if(followsCar(orbitFrom)){
    followPose(orbitFrom,p,ahead,subject.body);
    // That camera frames the road ahead, not the car: blend the aim to its framing too.
    aimOffset(aimToCar.subVectors(orbit.target,desired).normalize(),aimView.subVectors(look,desired).normalize(),orbitHomeAim);
    orbitAim.yaw+=wrap(orbitHomeAim.yaw-orbitAim.yaw)*blend;orbitAim.pitch+=(orbitHomeAim.pitch-orbitAim.pitch)*blend;
    orbitHome.setFromVector3(desired.sub(orbit.target));
   }
   else orbitHome.set(Math.min(orbitSphere.radius,ORBIT_MAX_DISTANCE),1.25,Math.atan2(-heading.x,-heading.z));
   orbitSphere.theta+=wrap(orbitHome.theta-orbitSphere.theta)*blend;
   orbitSphere.phi+=(orbitHome.phi-orbitSphere.phi)*blend;
   orbitSphere.radius+=(orbitHome.radius-orbitSphere.radius)*blend;orbit.maxDistance=Math.max(ORBIT_MAX_DISTANCE,orbitSphere.radius);
   camera.position.copy(orbit.target).add(orbitDelta.setFromSpherical(orbitSphere));orbit.update();
  }
  // Evita entrar no solo nas subidas e nas bordas inclinadas da pista.
  const ground=car.sample(camera.position.x,-camera.position.z).z;
  camera.position.y=Math.max(camera.position.y,ground+.3);
  cameraRayDirection.subVectors(camera.position,orbit.target);
  cameraRay.far=cameraRayDirection.length();cameraRay.set(orbit.target,cameraRayDirection.normalize());
  // An orbit that began in the aerial view keeps flying up there; only the nearer orbits come in past walls.
  const obstruction=orbit.maxDistance>ORBIT_MAX_DISTANCE?null:cameraRay.intersectObjects(cameraObstacles,false)[0];
  if(obstruction)camera.position.copy(orbit.target).addScaledVector(cameraRayDirection,Math.max(.2,obstruction.distance-.3));
  aimOrbit();orbitSeen.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));
 } else if(mode==='tv'){
  tvCamera.update(camera,p,subject.surface.s,tvVelocity.set(subject.vx,0,-subject.vy),dt);
 } else if(mode==='aerial'){
 followPose(mode,p,ahead);
 // Smooth the offset, not the world position: frame-rate changes must not
 // make the car surge back and forth relative to its following camera.
 desired.sub(p);if(!followInitialized){followOffset.copy(desired);followInitialized=true;}else followOffset.lerp(desired,1-Math.exp(-dt*5));
 camera.position.copy(p).add(followOffset);camera.up.set(0,1,0);camera.lookAt(look);
 } else rideCamera(dt,p,subject,ahead,motion,top,behind);
 // The shadow box leans toward the riding cameras' view ('far' included); orbit, TV, aerial, looking back and reversing keep it centred.
 const riding=!['orbit','tv','aerial'].includes(mode)&&!lookingBack&&!photo&&subject.vx*heading.x-subject.vy*heading.z>-1;
 if(!intro.active)placeSun(p,riding?camera.getWorldDirection(sunView):null,dt);
}
// (a controller's button held through the menu or a pause, which let go of the keys, still holds its
// key; Space only latches the handbrake, keyboard or controller)
const pressed=code=>keys.has(code)||mobile?.pressed.has(code)||code!=='Space'&&(gamepad.holds(code)||wheel.holds(code));
// Keyboard, touch pads, the controller's triggers and stick and a racing wheel's pedals (analog) all
// drive at once. On foot the controller's left stick also walks, pushed up or down; in the car it never
// accelerates. A wheel with no centring spring rests anywhere: on foot it turns the pilot only past a
// quarter of its lock. The physics loop passes its step, which alone moves the brake-to-reverse latch on.
// Modo Corrida out of fuel: nothing drives, Q included.
// Keys that hold the handbrake only while held (the drifter's way): N; on the arena Shift and Space too (Space enters
// keys there only). Many keyboards drop a third key held with W and A or D (ghosting, user 10-12: W + D + N); Space and
// Shift are the ones they keep; with the arrows ↑ + ← + N was dropped and ↑ + → + N kept, so B too (the user's pick; it
// looks back elsewhere). Shift and B only on the arena: a controller's R3 (looking back) sends a B.
// The arena's own keys while driving: T its panel, 9 / 0 the throttle's map and − / = the wheel's (drift-arena-mode.js).
const ARENA_KEYS=Object.freeze(['KeyT','Digit9','Digit0','Numpad9','Numpad0','Minus','Equal','NumpadSubtract','NumpadAdd']);
const HANDBRAKE_HOLD=Object.freeze(['KeyN']),ARENA_HANDBRAKE=Object.freeze(['KeyN','KeyB','ShiftLeft','ShiftRight','Space']);
const outOfFuel=()=>immersive&&!immersive.active&&immersive.freeFuel<=0&&!pitstop?.coffee;
function input(step=0){
 const afoot=pitstop?.coffee||immersive?.onFoot()||walker?.active,walk=afoot?gamepad.walk:0;
 const steer=afoot?Math.sign(wheel.steering)*Math.max(0,Math.abs(wheel.steering)-.25)/.75:wheel.steering;
 const command={ignition:pressed('KeyI')?1:0,throttle:Math.max(pressed('KeyW')||pressed('ArrowUp')?1:0,mobile?.throttle??0,gamepad.throttle,wheel.throttle,walk),brake:Math.max(pressed('KeyS')||pressed('ArrowDown')?1:0,mobile?.brake??0,gamepad.brake,wheel.brake,-walk),left:Math.max(pressed('KeyA')||pressed('ArrowLeft')?1:0,-(mobile?.steering??0),-gamepad.steering,-steer),right:Math.max(pressed('KeyD')||pressed('ArrowRight')?1:0,mobile?.steering??0,gamepad.steering,steer),reverse:pressed('KeyQ')?1:0,handbrake:pressed('Space')||!automatic&&!afoot&&(arenaMode?ARENA_HANDBRAKE:HANDBRAKE_HOLD).some(code=>keys.has(code))?1:0};
 // The wheel alone steering: physics turns the road wheels where it is, with no smoothing.
 if(!afoot&&wheel.steers&&command.left+command.right===Math.abs(steer))command.wheel=true;
 // Câmbio manual: the gear the player put in, and a wheel's clutch pedal (the keyboard has none). (A gear the automatic
 // was holding for the player hands the car over as the automatic's.)
 if(manualGearbox()&&!afoot){if(autoShift.cancel())car.manualGear=false;ownGearbox();gearbox.setLever(wheel.lever);command.gear=gearbox.gear;command.clutch=wheel.clutch;}
 // Câmbio automático: a gear the player asked for, held a few seconds (manual-gearbox.js AutoShift).
 // Backing up (Q, or the brake held nearly stopped) lets it go.
 else if(!afoot&&autoShift.holding){const gear=step?autoShift.hold(car,step,command.reverse||command.brake>.3&&Math.hypot(car.vx,car.vy)<1):autoShift.gear;if(gear!==undefined)command.gear=gear;}
 return brakeReverse.apply(command,car,{allowed:!afoot&&command.gear===undefined&&!outOfFuel(),dt:step});
}
// The recon lap races the Opala 99 with the rivals' racecraft (RaceField.heroInput). Each physics
// step asks for a new command; the sound and the driver's hands reuse the last one.
let heroCommand=null;
function pilot(step=0){
 if(step||!heroCommand)heroCommand=immersive&&!immersive.active?immersive.field.heroInput(car,step||1/120):recognitionInput(car);
 return {...heroCommand};
}
// The Pintura button: the paint on the car, the other one, and the key (V unless the player moved it).
function skinLabel(){
 $('skinButton').textContent=`Pintura: ${activeLivery==='seiva_danilo'?'Seiva':'OMP'} (${keyName('KeyV')})`;
 $('skinButton').title=`Trocar para ${activeLivery==='seiva_danilo'?'Assinaturas · OMP':'Seiva · Danilo Veículos'} (${keyName('KeyV')})`;
}
function hud(){
 const fuel=immersive?.active?immersive.state.fuel:immersive?.freeFuel??12,staged=immersive?.active&&['crowd','podium'].includes(immersive.state.phase);$('fuelGauge').classList.toggle('hidden',!!staged);$('fuelGauge').classList.toggle('reserve',fuel<1);$('fuelVolume').textContent=fuel.toFixed(1)+' L';$('fuelBar').value=fuel;$('fuelStatus').textContent=fuel<=0?(immersive?.active?'TANQUE VAZIO':'VAZIO · R PARA REABASTECER'):fuel<1?'RESERVA':immersive?.active&&immersive.state.tankDetached?'VAZAMENTO':'COMBUSTÍVEL';const p=car.surface,watch=watchedRival(),shown=watch?.car??car,speed=Math.hypot(shown.vx,shown.vy)*3.6;
 $('speed').textContent=Math.round(speed);$('gear').textContent=watch?watch.car.gear:carAudio.state.gear;if(touchDevice)mobile.showWheel(steeringWheelAngle(shown.steerVisual??shown.steer??0));$('rev').style.width=`${(watch?watch.car.rpm:carAudio.state.rpm)/7400*100}%`;
 // Recon lap: the Piloto button (N) names the driver the cameras watch; speed and gear are that car's.
 const touring=automatic&&!immersive.active;$('watchButton').hidden=$('tourBadge').hidden=$('touchTourBadge').hidden=!touring;if(touring)$('watchButton').textContent=`Piloto: ${watch?`#${watch.entry.number} ${watch.entry.shortName}`:'você'} (${keyName('KeyN')})`;
 $('grade').textContent=`${(p.grade*100).toFixed(1).replace('.',',')}%`;$('bank').textContent=`${(p.bank*100).toFixed(1).replace('.',',')}%`;$('alt').textContent=circuit.altitude===null?'—':`${(p.z+circuit.altitude).toFixed(1)} m`;
 const totalLaps=immersive.active?immersive.storyLaps:immersive.freeTotalLaps;$('lap').textContent=Number.isFinite(totalLaps)?`${Math.min(car.laps+1,totalLaps)} / ${totalLaps}`:String(car.laps+1);$('racePosition').textContent=`${immersive.active?immersive.state.result?.position??immersive.state.position:immersive.freePosition}º / ${immersive.fieldSize}`;$('racePosition').parentElement.hidden=immersive.practice;$('timer').textContent=fmt(car.clock-car.lapStart);$('best').textContent=fmt(car.best);const rejected=car.lastLapValid===false&&car.clock-car.lapStart<10;$('valid').textContent=rejected?(car.lastInvalidReason==='pit'?'Volta não contou · excesso de velocidade nos boxes':'Volta não contou · trecho cortado ou incompleto'):car.lapValid?'Volta válida':car.invalidReason==='pit'?`Volta inválida · ${Math.round(car.pitPenalty?.kmh??0)} km/h nos boxes (máx. 60)`:'Volta inválida · trecho cortado';$('valid').hidden=car.lapValid&&!rejected;$('valid').style.color=car.lapValid&&!rejected?'#e2fb57':'#ffb789';
 $('surface').textContent=automatic?(watch?`RECONHECIMENTO · #${watch.entry.number} ${watch.entry.shortName.toUpperCase()}`:'RECONHECIMENTO AUTOMÁTICO'):p.pit&&data.pit?(car.limiter?`PIT LANE · LIMITADOR ${data.pit.limit?.kmh??60} km/h`:'PIT LANE'):p.onRoad?'ASFALTO · SESSÃO LIVRE':'FORA DA PISTA · ADERÊNCIA REDUZIDA';$('location').textContent=p.pit&&data.pit?'Pit lane · boxes':p.branch!=null&&data.branches?.[p.branch]?data.branches[p.branch].label:location(p.s);drawMap();
 // Jumps and crashes take over the surface line while they last.
 const crash=car.fall?.hit?'KABUM! O RESGATE TRAZ O CARRO DE VOLTA':car.fall?'QUEDA NO ABISMO!':car.backAt!=null&&car.clock-car.backAt<4?'DE VOLTA À PISTA · ESTA VOLTA NÃO VALE RECORDE':car.upright<.45?(car.overturned>0?`CAPOTADO · FISCAIS DESVIRAM EM ${Math.max(1,Math.ceil(RIGHTING_DELAY-car.overturned))} s`:'CAPOTANDO!'):car.rightedAt!==null&&car.clock-car.rightedAt<3?'FISCAIS DESVIRARAM O CARRO':car.airTime>.25?'NO AR!':car.pitPenalty&&car.clock-car.pitPenalty.clock<3?'EXCESSO DE VELOCIDADE NOS BOXES · VOLTA INVÁLIDA':'';if(crash)$('surface').textContent=crash;
 else if(mobile.handbrake)$('surface').textContent=touchDevice?'FREIO DE MÃO PUXADO':'FREIO DE MÃO PUXADO · ESPAÇO SOLTA';
 ghostHud();
}
// Automated browsers (the checks) skip it unless the page asks with ?intro=1; ?intro=0 turns it off.
// A multiplayer room skips it: every window must reach the 3-2-1 together.
function introWanted(){const asked=new URLSearchParams(window.location.search).get('intro');return !roomWanted&&(asked==='1'||(asked!=='0'&&!navigator.webdriver));}
function introContext(){
 if(!ready||!car)return null;
 const s=car.surface.s,a=data.samples,L=data.meta.reconstructed_xy_m,probe=new TestCar(data);
 // Track centre line k metres ahead of the car, on the road surface.
 const center=k=>{const t=((s+k)%L+L)%L,i=Math.max(0,a.findIndex(q=>q[0]>=t)),p=a[i];probe.index=i;return new THREE.Vector3(p[1],probe.sample(p[1],p[2]).z,-p[2]);};
 const here=center(0),position=immersive.active?immersive.state.position:immersive.freePosition;
 return {car:carRoot.position.clone(),number:raceCar,model:raceModel,forward:forward.clone(),inward:here.sub(carRoot.position),center,pilot:immersive.pilotName||'Stevan',position,grid:immersive.fieldSize,laps:immersive.active?immersive.storyLaps:immersive.freeTotalLaps,practice:immersive.practice,duel:!immersive.active&&immersive.freeLineup?.length===1?carEntry(immersive.freeLineup[0]):null,
  circuit:circuit.name,venue:circuit.id==='interlagos'?'Autódromo José Carlos Pace':circuit.venue??circuit.label,weather:weatherLine(),
  hero:immersive.visual?.hero?immersive.visual.hero.getWorldPosition(new THREE.Vector3()):carRoot.position.clone(),
  // People face their local +x.
  heroForward:immersive.visual?.hero?new THREE.Vector3(1,0,0).applyQuaternion(immersive.visual.hero.getWorldQuaternion(new THREE.Quaternion())):forward.clone()};
}
intro.onEnd=kind=>{
 // Back to the player's own camera; the 3-2-1 beeps now.
 if(!immersive)return;
 if(kind==='race'&&!immersive.active&&immersive.freeCountdown>0)immersive.state.emitSound('countdown');
 camera.fov=baseFov(mode,camera.aspect);camera.updateProjectionMatrix();followInitialized=false;
 if(introHidden){for(const o of introHidden)o.visible=true;introHidden=null;}
};
// Film look: the Gráficos tab's choice; ?cinema=full|lite|off overrides it for one visit.
function cinematicLevel(){const asked=new URLSearchParams(window.location.search).get('cinema');return ['full','lite','off'].includes(asked)?asked:graphics.values.post;}
// The haze thins with height above the circuit's mean ground level.
let hazeData=null,hazeLevel=0;
// A circuit over a valley gives its own (the valley floor: data.meta.haze_base_m), or the valley would vanish in the haze.
function hazeBase(){if(hazeData!==data){hazeData=data;const z=data?.terrain?.z;hazeLevel=data?.meta?.haze_base_m??(z?.length?z.reduce((a,b)=>a+b,0)/z.length:0);}return hazeLevel;}
let accumulator=0,lastHud=0,renderedFrame=0,mirrorFrame=0,frameImpact=0;
// The rear-view mirror's picture with the trunk lid open (made on first use) and its lens: 16 degrees high in the 6:1
// picture, about 80 across where the usual one spans 126, so the open lid covers nearly all of the glass.
let lidMirror=null;const LID_MIRROR_FOV=16;
// Time since the last 1/120 s physics step: cars are drawn where they are at this frame.
const renderAhead=()=>clamp(accumulator,0,1/120);
// Adaptive resolution: slower GPUs trade sharpness for a steady frame rate, between the Gráficos
// tab's pixel density (max) and a floor; target follows the browser cadence or the player's choice.
const resolution={max:Math.min(devicePixelRatio,graphics.values.resolution),min:resolutionFloor(graphics.level,touchDevice),dynamic:true,frame:1/60,timer:0,changes:0};
// Each change rebuilds the drawing buffer, so the pace (graphics-settings.js ResolutionPace) keeps them few; where it
// settles is remembered per level for this video chip (device.ratios): the next race starts there.
const resolutionPace=new ResolutionPace();
function adaptResolution(rawDt){
 if(rawDt>.25||!resolution.dynamic)return;resolution.frame+=(rawDt-resolution.frame)*.05;resolution.timer+=rawDt;if(resolution.timer<1.5)return;resolution.timer=0;
 const current=renderer.getPixelRatio(),gpu=debugOverlay.frameGpuMs===null?null:debugOverlay.frameGpuMs/1000,target=dynamicTarget();
 const next=resolutionPace.decide(current,adaptivePixelRatio(current,{min:resolution.min,max:resolution.max,frameSeconds:resolution.frame,gpuSeconds:gpu,targetFps:target,tight:graphics.level==='baixo'}),{far:(gpu??resolution.frame)*Math.max(1,target)>1.6});
 if(Math.abs(next-current)>.001){renderer.setPixelRatio(next);renderer.setSize(innerWidth,innerHeight,false);resolution.changes++;device.ratios[graphics.level]=+next.toFixed(3);saveDevice();}
}
// The car screen's garage drawn sharper than the race (there the player admires the car): computers up to twice the
// screen's pixels by Gráficos level (STUDIO_DENSITY, at most ~8 MP: a 4K picture), phones up to their own density.
// Slow frames once the car shows (over 1/40 s for a while) step it down; the race's density comes back as the screen goes.
const STUDIO_DENSITY=Object.freeze({baixo:1,medio:1.5,alto:2,ultra:2}),studioView={saved:null,ratio:1,slow:0};
function studioDensity(on,rawDt=0){
 if(!renderer)return;
 if(!on){if(studioView.saved!==null){const back=clamp(studioView.saved,resolution.min,resolution.max);studioView.saved=null;if(Math.abs(renderer.getPixelRatio()-back)>.001){renderer.setPixelRatio(back);renderer.setSize(innerWidth,innerHeight,false);}}return;}
 if(studioView.saved===null){const top=STUDIO_DENSITY[graphics.level]??1.5;studioView.saved=renderer.getPixelRatio();studioView.ratio=touchDevice?Math.min(devicePixelRatio,top):Math.max(Math.min(devicePixelRatio,2),top);studioView.slow=0;}
 if(carSelect.live&&!carSelect.studio.next&&rawDt<.25){studioView.slow=Math.max(0,studioView.slow+(rawDt>1/40?rawDt:-rawDt/2));if(studioView.slow>1.5&&studioView.ratio>1){studioView.ratio=Math.max(1,studioView.ratio-.25);studioView.slow=0;}}
 const want=Math.min(studioView.ratio,Math.sqrt(8.3e6/Math.max(1,innerWidth*innerHeight)));
 if(Math.abs(renderer.getPixelRatio()-want)>.001){renderer.setPixelRatio(want);renderer.setSize(innerWidth,innerHeight,false);}
}
// The Gráficos tab's FPS limit (graphics-settings.js FrameLimiter).
const frameCap=new FrameLimiter();
// The cars on track and the picture's size for this frame's effects (speed-particles.js, rain.js): lists kept and
// refilled, not made anew twice a frame (what the garbage collector then pauses for).
const frameCars=[],frameViewport=[0,0];
function carsThisFrame(){frameCars.length=0;frameCars.push(car);for(const r of immersive?.rivals??[])frameCars.push(r.car);return frameCars;}
function viewportThisFrame(){frameViewport[0]=renderer.domElement.width;frameViewport[1]=renderer.domElement.height;return frameViewport;}
// Automático's watch over the race (graphics-settings.js FrameWatch): far under the target with nothing left for dynamic
// resolution to give, it steps down one level, once, and says so (remembered for this video chip); a level chosen by
// hand is never changed, the player only gets a hint, once.
// Not under automation: a check on a busy machine would find its level changed under it (interlagosGraficos.heavy tests it).
// The step is taken at the next pause, menu or race start (takeDrop), never mid-race: its new programs compile with the
// game stopped (seconds on a weak PC; in a multiplayer room that dropped the guest). Off in a multiplayer room.
// A step down is forgotten after GOOD_RACES races of at least a minute watched without the watch firing (raceWatch).
const frameWatch=new FrameWatch(),GOOD_RACES=3,raceWatch={seconds:0,heavy:false};let dropPending=false;
function watchFrames(rawDt){
 if(multiplayer)return;
 if(rawDt>0&&rawDt<.5)raceWatch.seconds+=rawDt;
 const floor=!resolution.dynamic||renderer.getPixelRatio()<=resolution.min+.001;
 if(frameWatch.feed(rawDt,{target:dynamicTarget(),floor}))heavyRace();
}
function heavyRace(){
 raceWatch.heavy=true;
 const lower=lowerLevel(graphics.level);if(!lower)return;
 let text;
 if(graphics.auto){device.drop=lower;device.goodRaces=0;saveDevice();dropPending=true;text=`Gráficos no Automático: na próxima pausa o jogo passa para o nível ${GRAPHICS_LEVEL_NAMES[lower]}, mais leve.`;}
 else text=`O jogo está pesado neste aparelho: o nível ${GRAPHICS_LEVEL_NAMES[lower]} (Configurações › Gráficos) deixa mais leve.`;
 status(text);setTimeout(()=>{if($('status').textContent===text)status('');},6000);
}
// The step at a pause, the menu or a race's start (applyGraphics: new programs compile with the game stopped).
function takeDrop(){if(!dropPending)return;dropPending=false;applyGraphics();}
// At a race's start: the race before it counts as a good one if it ran a minute or more and never went heavy.
function countGoodRace(){
 if(device.drop&&graphics.auto&&raceWatch.seconds>=60&&!raceWatch.heavy&&++device.goodRaces>=GOOD_RACES){device.drop=null;device.goodRaces=0;dropPending=true;}
 if(raceWatch.seconds>=60)saveDevice();raceWatch.seconds=0;raceWatch.heavy=false;
}
function updateCountdown(){
 if(resumeLeft>0||resumeGo>0){const label=resumeLeft>0?String(Math.ceil(resumeLeft/RESUME.step-1e-6)):'VAI!';$('raceCountdown').hidden=false;
  if($('countdownNumber').textContent!==label){$('countdownNumber').textContent=label;$('countdownCaption').textContent=resumeLeft>0?'PREPARE-SE':'';}return;}
 const count=immersive?.active?(immersive.state.phase==='grid'?Math.max(1,Math.ceil(immersive.state.countdown)):0):Math.ceil(immersive?.freeCountdown||0),go=immersive?.goTime>0;const visible=sessionStarted&&!paused&&(count>0||go);$('raceCountdown').hidden=!visible;if(visible){const label=count>0?String(count):'VAI!';if($('countdownNumber').textContent!==label){$('countdownNumber').textContent=label;$('countdownCaption').textContent=count>0?'PREPARE-SE':'BOA CORRIDA!';}}}
// Crossing the line: one line at the top of the screen with the lap just run and how far it is
// from the best lap before it (minus: faster, green; plus: slower, red), for a few seconds. The
// lap count and the position stay in the timing panel; the road ahead stays in sight.
let lapSeen=0,lapShown=0,bestBefore=null;
function lapBanner(dt){
 const banner=$('lapBanner');
 if(car.lapStart!==lapSeen){
  const crossed=car.lapStart>lapSeen&&car.lastLap!==null&&car.lastLapValid!==null;lapSeen=car.lapStart;
  if(crossed){
   const valid=car.lastLapValid,delta=valid&&bestBefore!==null?car.lastLap-bestBefore:null;
   $('lapBannerTime').textContent=fmt(car.lastLap);
   $('lapBannerDelta').textContent=delta===null?'':`${delta<0?'−':'+'}${Math.abs(delta).toFixed(3).replace('.',',')}`;
   // A lap that became the ghost says so (the first one tells where the ghost is).
   const ghostSaved=valid&&ghostSavedAt===car.lapStart;banner.classList.toggle('ghost-saved',ghostSaved);
   $('lapBannerNote').textContent=valid&&car.lastLapFell?'Não vale recorde · queda no abismo':valid?ghostSaved?preferences.values.ghost?'Novo fantasma':`Fantasma gravado · ${keyName('KeyG')} mostra`:'':car.lastInvalidReason==='pit'?'Não contou · velocidade nos boxes':'Não contou · trecho cortado';
   banner.classList.toggle('faster',delta!==null&&delta<0);banner.classList.toggle('slower',delta!==null&&delta>=0);banner.classList.toggle('invalid',!valid);
   // Restart the entrance animation even when two crossings come close together.
   banner.hidden=true;void banner.offsetWidth;banner.hidden=false;lapShown=5;
  }
 }
 // The best lap as it stood before this frame's crossing, if any.
 bestBefore=car.best;
 if(lapShown>0){lapShown-=dt;if(lapShown<=0)banner.hidden=true;}
}
let displayLocation='',displayCheck=0;
function frame(now=performance.now()){requestAnimationFrame(frame);
 if(now>displayCheck){displayCheck=now+750;const place=[window.screenX,window.screenY,window.screen.width,window.screen.height,devicePixelRatio].join(':');if(place!==displayLocation){displayLocation=place;displayCadence.reset();}}
 if(!document.hidden)displayCadence.observe(now,!sessionStarted&&!loading&&!['cars','visual'].includes(screen));
 if(frameCap.skip(now,displayCadence.measured?displayCadence.hz:0))return;if(graphicsCompiling){clock.update().getDelta();return;}debugOverlay.begin(now);try{runFrame();}finally{debugOverlay.end();}}
// One frame of the game: controls, physics steps, people, cameras and the picture.
function runFrame(){scene.matrixWorldAutoUpdate=true;const rawDt=clock.update().getDelta(),dt=Math.min(rawDt,.08);resumeTick(rawDt);fillStands();gamepad.suspended=wheel.learning;gamepad.poll(dt);wheel.poll(dt);if($('settings').open)wheelPanel.frame();multiplayer?.frame(dt);mobile?.update(paused,pitstop?.coffee||walker?.active?'crowd':immersive?.active?immersive.state.phase:'race');if(touchDevice)document.body.classList.toggle('can-look-back',lookBackAllowed());updateCountdown();if(!ready||!sessionStarted){action.update(0,{active:false});actionNotice.update(0,null,false);carAudio.updateScene({},[],dt);const onCars=renderer&&!sessionStarted&&!$('cars').classList.contains('hidden'),onLook=renderer&&!sessionStarted&&!$('visual').classList.contains('hidden');studioDensity(onCars||onLook,rawDt);if(onCars)carSelect.render(renderer,dt);else if(onLook)lookSelect.render(renderer,dt);return;}studioDensity(false);
 renderedFrame++;if(!paused&&!document.hidden){adaptResolution(rawDt);if(!intro.active&&!trackHistory.active&&!navigator.webdriver)watchFrames(rawDt);}
 if(intro.active&&automatic)intro.stop();
 if(intro.active&&!immersive.active&&immersive.freeCountdown>0){immersive.freeCountdown=3;$('raceCountdown').hidden=true;}
 // In a multiplayer race the result waits while other humans still race (multiplayer.js holdResults),
 // and the whole race stands still while its host is out of reach (frozen: no step, no engine sound).
 if(!immersive.active&&immersive.freeResultReady&&!paused&&!multiplayer?.holdResults()){accumulator=0;recordChampionshipRound();menu(true);}
 const frozen=!!multiplayer?.frozen();if(frozen)accumulator=0;
 // The sound is heard from the rival the recon lap watches (N), otherwise from the player's car.
 const heard=watchedRival()?.car??car;
 if(automatic&&!paused&&(mobile?.throttle||mobile?.brake||mobile?.steering||gamepad.driving||wheel.driving))takeWheel();
 if(arenaMode?.demo&&!paused&&(mobile?.throttle||mobile?.brake||mobile?.steering||gamepad.driving||wheel.driving))arenaMode.stopDemo('VOCÊ ASSUMIU O CARRO');
 if(!paused&&!frozen){if(automatic)immersive.recordAssisted=true;accumulator+=dt*fallView.timeScale;while(accumulator>=1/120){const command=automatic?pilot(1/120):arenaMode?.demo?arenaMode.demoCommand():input(1/120);if(outOfFuel()){command.throttle=0;command.reverse=0;}if(car.fall)Object.assign(command,{throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0});walker?.drive(command,{wait:!!(pitstop?.opened||pitstop?.willOpen())});if(!(walker?.active?false:pitstop?.beforeStep(command,1/120))&&!immersive?.step(command,1/120)){const before=Math.hypot(car.vx,car.vy);arenaMode?.beforeStep();car.step(command,1/120);const impact=Math.max(car.wallImpactSpeed??0,car.crashImpactSpeed??0,before-Math.hypot(car.vx,car.vy));arenaMode?.step(1/120,impact,{handbrake:!!command.handbrake,latched:!!mobile?.handbrake});if(impact>4){if(heard===car)carAudio.effect('collision');if(!car.fall)immersive?.wallImpact(impact);frameImpact=Math.max(frameImpact,impact);}const heardBefore=Math.hypot(heard.vx,heard.vy);immersive?.stepFree(1/120,command);if(heard!==car&&Math.max(heard.wallImpactSpeed??0,heard.crashImpactSpeed??0,heardBefore-Math.hypot(heard.vx,heard.vy))>4)carAudio.effect('collision');}lakeContact?.step(car,1/120);futebol?.step(car,1/120);skidMarks.update(car,command,1/120);recordGhost(command);accumulator-=1/120;if(!immersive.active&&immersive.freeResultReady&&!multiplayer?.holdResults()){menu(true);break;}}}
 if(car.cliff&&!paused&&!frozen)playerFall(trackFall(car,dt*fallView.timeScale));
 // Any car meeting the ground below the wall goes up (the player's, a rival's): heard from afar, fainter.
 if(explosions&&!paused&&!frozen){
  for(const c of [car,...(immersive?.rivals??[]).map(r=>r.car)]){const f=c.fall;if(!f?.hit||f.boom)continue;f.boom=true;
   explosions.spawn(f.hit.x,f.hit.y,f.hit.z,{power:Math.min(1.3,.75+f.hit.drop/300),ground:(x,y)=>car.terrain(x,y,car.cliff.abyssZ)});
   const far=Math.hypot(c.x-camera.position.x,c.y+camera.position.z);if(far<1600)carAudio.effect('explosion',{strength:c===car?1.4:Math.max(.25,1.3-far/900)});}
  explosions.update(dt*fallView.timeScale);
 }
 automaticRecords.update(immersive);automaticAIRecords.update(immersive);updateRecordTvs(performance.now());if(contaOnline&&immersive&&car)contaOnline.frame(onlineRun());
 skidMarks.flush();
 tyreSmoke.clearView(...(isInside()?[1.5,9]:followsCar(mode)?[.6,Math.max(2,(CAMERA_FRAMES[mode]?.back??9)*.45)]:[.5,2]));tyreSmoke.update(car,skidMarks.wheels,paused||frozen?0:dt,renderer.domElement.height);if(!paused&&!frozen)for(const r of immersive?.rivals??[])if(r.broken?.smokeLeft>0)tyreSmoke.plume(r.car,dt);lakeContact?.update(paused?0:dt,renderer.domElement.height);treeField?.update(paused?0:dt,renderer.domElement.height);
 const actionImpact=Math.max(frameImpact,immersive?.takeKnock()??0);
 const actionActive=!paused&&!frozen&&!intro.active&&!car.fall&&!automatic&&!watchedRival()&&!gridPreview()&&!pitstop?.opened&&!immersive?.onFoot()&&!walker?.active&&(immersive?.active?immersive.state.phase==='race':!immersive.freeCountdown&&!immersive.freeResultReady);
 action.update(paused||frozen?0:dt,{car,rivals:immersive?.rivals??[],impact:actionImpact,active:actionActive});
 actionNotice.update(paused?0:dt,action.event,actionActive&&graphics.values.actionFeedback);
 const skid=skidMarks.wheels.reduce((sum,w)=>sum+w.strength,0)/4;
 // The same command drives the engine sound and the driver's hands and feet.
 // Out of the car (free-walk.js) it idles, fainter the farther he walks; braking to let him out, the brake lights and the engine say so.
 const walkCommand=walker?.active?{throttle:0,brake:0,left:0,right:0,listen:clamp(7/Math.max(7,walker.carDistance()),.06,1)}:walker?.stopping?{...input(),throttle:0,brake:1,reverse:0}:null;
 const driveCommand=pitstop?.opened||trackHistory.active?{throttle:0,brake:1,engineOff:true}:walkCommand??immersive?.audioCommand(automatic?pilot():arenaMode?.demo?arenaMode.demo.last():input())??input();
 const rivalSound=heard!==car?immersive.rivalSound(heard):null;
 const braking=driveCommand.engineOff?0:driveCommand.brake;if(touchDevice)mobile.showPedals(driveCommand.throttle??0,Math.max(driveCommand.brake??0,driveCommand.reverse??0));brakeLamps.userData.set(model?.visible?braking:0,!!model?.visible&&playerLamps.lit);fuscaBody.brake(braking,playerLamps.lit);
 carAudio.update(heard,rivalSound?.command??driveCommand,rivalSound?.skid??skid,paused||frozen,mode);
 // The copilot speaks while the player's own car runs the lap (the recon lap too): not at a pit stop, the pause, the
 // opening shots, the countdown, on foot or watching a rival. The pit lane is no reason: surface.pit is also true where
 // the racing line crosses the lane's paint at a merge (Velocitta's Curva 1 lost its name there), and through the pits
 // the lap distance keeps counting, so the names still fall in place.
 const calloutsOk=sessionStarted&&!paused&&!frozen&&!intro.active&&!car.fall&&!watchedRival()&&!gridPreview()&&!pitstop?.opened&&!immersive?.onFoot()&&!walker?.active&&!trackHistory.active&&car.surface?.branch==null&&(immersive?.active?immersive.state.phase==='race':!immersive?.freeCountdown&&!immersive?.freeResultReady);
 callouts.track(arenaMode?null:circuit.id,data?.meta?.reconstructed_xy_m);callouts.update(car.surface?.s??0,Math.hypot(car.vx,car.vy),calloutsOk);
 // H (the controller's LB / L1, a learnt wheel button, the touch Buzina): the horn, while held, at the wheel of one's own car.
 carAudio.honk(pressed('KeyH')&&!paused&&!frozen&&!intro.active&&heard===car&&!pitstop?.opened&&!immersive?.onFoot()&&!walker?.active,car.mechanics?.name==='fusca'?'fusca':'opala',mode);
 carAudio.updateScene({...immersive?.audioScene(heard),speed:Math.hypot(heard.vx,heard.vy),onRoad:heard.surface.onRoad,rain:weather.drops,wet:weather.wetness,...speedFx?.sound(heard===car?car:null),camera:mode},immersive?.state.takeSounds()??[],dt);
 if(futebol){futebol.view.ahead=renderAhead();futebol.view.shown=sessionStarted&&!paused&&!intro.active&&raceResults.root.hidden;}
 sky.update(paused?0:dt);landscape?.update(paused?0:dt,camera);for(const far of farMerges)far.update(camera);arenaMode?.frame(paused?0:dt);for(const extra of circuitExtras)extra.update?.(paused?0:dt,camera);
 // A watched rival is posed by immersive.update below: its camera follows after that.
 updateOpenings(paused?0:dt);updateCar(dt);if(!watchedRival())updateCamera(dt);const dash=cockpit.update(car,paused?0:dt,heard===car?carAudio.state:null),phoneArrived=dash.phoneArrived;if(phoneArrived)carAudio.notifyPhone();fuscaBody.update(dash.speed,dash.rpm,(immersive?.active?immersive.state.fuel:immersive?.freeFuel??12)/(immersive?.tank??12));driver.look(pilotLook());driver.update(car,paused?0:dt,{command:driveCommand,impact:frameImpact,phoneArrived});gamepad.bump(actionImpact);frameImpact=0;lapBanner(paused?0:dt);lastHud+=dt;if(lastHud>.07){hud();lastHud=0;}
 if(immersive?.visual)immersive.visual.renderAhead=renderAhead();immersive?.update(paused?0:dt,camera);if(watchedRival())updateCamera(dt);
 syncDamage();pitstop?.update(paused?0:dt,camera,sessionStarted&&!paused);
 // The rivals' garages in a long race: doors up, the crews out to their cars at the refuelling stops (pit-building.js).
 if(peekView)camera.position.fromArray(peekView[0]);
 rivalGarages?.update(paused?0:dt,{field:immersive?.field,active:sessionStarted&&!trackHistory.active,camera});updateGhost(dt);updateDrivingLine();
 // Out of the car anywhere (free-walk.js): F at the box hands the stop to the pit (out to its café there); the race leaving
 // its running phase puts him back in at once; then the walk and its camera.
 if(walker){
  if(walker.stopping&&pitstop?.opened){walker.cancel();pitstop.visitCafe();}
  if(walker.busy&&!walkRace()&&!meetingWalk())walker.reset();
  walker.update(paused?0:dt,camera,{input:paused?undefined:input(),shift:pressed('ShiftLeft')||pressed('ShiftRight'),rivals:immersive?.rivals??[],visible:sessionStarted&&!paused,hold:{chute:pressed('KeyE')||walkMouse.chute,passe:pressed('KeyR')||walkMouse.passe}});
  if(touchDevice){const cafe=!walker.active&&!!multiplayer?.spectating?.()&&!!pitstop?.cafeSeat,show=!walker.active&&(walker.stopping||walkRace()||cafe),label=walker.stopping?'Parando…':cafe?'Lanchonete da Tia':'Sair do carro';if($('touchExit').hidden===show)$('touchExit').hidden=!show;if($('touchExit').textContent!==label)$('touchExit').textContent=label;}
 }
 // Specks in the air, the rivals' dust and the pushed verge grass; the pad buzzes on the kerbs.
 speedFx?.update(paused||frozen?0:dt,camera,{cars:carsThisFrame(),landscape,inside:isInside(),viewport:viewportThisFrame(),subject:watchedRival()?.car??car});gamepad.kerb(paused||frozen?0:car.kerbRide);
 // Marshals, cameramen, crews, the terrace and the café idle; passing cars catch their eye.
 // Anyone the Opala runs over goes flying (a cartoon, not a crash): the car barely notices.
 if(!paused&&hitPeople(car)){car.vx*=.97;car.vy*=.97;}for(const e of takePeopleEvents())carAudio.effect(e.sound,{strength:e.strength});
 updatePeople(paused?0:dt,camera,[carRoot,...(immersive?.visual?.rivals??[])]);
 // The flags' whoosh follows the car heard (N watching a rival); the player's car still stirs the cloth.
 flags?.update(paused?0:dt,camera,heard,heard===car?immersive?.rivals:[{car},...(immersive?.rivals??[]).filter(r=>r.car!==heard)]);
 // A championship round is scored before its result sheet is first drawn, paused or not.
 recordChampionshipRound();
 // Modo História: going to the box before the judge's inspection takes the round's points away.
 if(storyRound&&immersive.active&&immersive.state.phase==='disqualified')storyRound.championship.disqualify(storyRound.round);
 raceResults.update(immersive,paused,$('settings').open);
 $('finishFade').classList.toggle('fading',!paused&&immersive.finishing);$('finishFade').style.opacity=String(!paused?immersive.finishOpacity:0);
 // The broadcast camera shows the race without the game's floating name tags.
 if(mode==='tv')for(const rival of immersive.visual.rivals)if(rival.userData.nameLabel)rival.userData.nameLabel.visible=false;
 if(intro.update(paused?0:dt,camera,paused)){
  placeSun(carRoot.position,null,dt);
  // Name tags and money signs are game interface: the opening shots go without them.
  if(!introHidden){introHidden=[];scene.traverse(o=>{if(o.isSprite&&o.visible)introHidden.push(o);});}
  for(const o of introHidden)o.visible=false;
 }
 // História do autódromo: its camera; the sun's shadows round what it looks at; the parked car out of sight.
 if(trackHistory.update(paused?0:dt,camera)){carRoot.visible=false;placeSun(trackHistory.focus,null,dt);}
 // Over a plateau's rim: someone at the lip watches the car go down (cliff-fall.js).
 fallView.update(paused?0:dt,camera,car,{slowMotion:!multiplayer});
 // The results sheet is opaque; avoid spending mobile GPU time behind it.
 if(!raceResults.root.hidden)return;
 // The cars' crisp shadow tiles (Alto/Ultra) before any pass that draws the ground.
 holdLightPhoto();updateLamps(paused?0:dt);
 // The rain falls round the eye (out of the cabin in the cockpit and bonnet views) and the cars throw their spray.
 roadSurface?.tickRain?.(paused||frozen?0:dt);
 splashGround.point.copy(carRoot.position);splashGround.normal.set(0,1,0).applyQuaternion(carRoot.quaternion);
 rain.update(paused||frozen?0:dt,camera,{cabin:carBody,inside:isInside()||mode==='hood',cars:carsThisFrame(),viewport:renderer.domElement.height,ground:car.fall?null:splashGround});
 // The drops on the windscreen, seen from the Opala's cockpit; the wipers turn in every view.
 windscreen.update(paused||frozen?0:dt,{rain:weather.drops,speed:Math.hypot(car.vx,car.vy),inside:mode==='cockpit'&&!fuscaBody.active&&!immersive?.onFoot()});
 // The Fusca's: its drops on the player's Fusca, built afresh with each new clone of it.
 if(fuscaBody.car&&fuscaBody.car!==fuscaScreen.model)fuscaScreen.attach(fuscaBody.car,fuscaBody.car,wipersOf(fuscaTemplate));
 fuscaScreen.update(paused||frozen?0:dt,{rain:weather.drops,speed:Math.hypot(car.vx,car.vy),inside:mode==='cockpit'&&fuscaBody.active&&!immersive?.onFoot()});
 // One walk of the scene graph for the matrices this frame, now that everything is placed: every render after it (the
 // cars' shadow tiles, the mirror, the reflection probe, the picture) reuses it; three.js walked all of it again for
 // each of them (thousands of objects, a fifth of a frame's processor time).
 scene.updateMatrixWorld();scene.matrixWorldAutoUpdate=false;
 carShadow.update(renderer,carShadowRoots());
 // Render the reflection from this frame's car pose before displaying the cockpit.
 // A simulation-time timer made the mirror visibly stutter, especially at low FPS.
 const watchedCar=watchedRival();
 // Mirrors switched off in the Gráficos tab skip this extra pass.
 // A Fusca's (fusca-cockpit.js) take the same picture, from its own mirror's height.
 const mirrors=fuscaBody.active?fuscaMirrors:sideMirrors;
 const inside=mode==='cockpit',hudWanted=!inside&&hudMirrorWanted(),hudDue=hudWanted&&renderedFrame%(HUD_MIRROR.every[graphics.level]??1)===0;
 hudMirrorShown=hudWanted&&mirrorReady();document.body.classList.toggle('hud-mirror',hudMirrorShown);
 if((inside||hudDue)&&!gridPreview()&&!watchedCar&&MIRROR_SIZES[graphics.values.mirrors]&&mirrorReady()){
  // The mirror sees the road behind, not the body round it (the classic view hides it anyway).
  const bodyShown=!!model?.visible,cockpitShown=cockpit.root.visible;cockpit.root.visible=false;driver.root.visible=false;if(model)model.visible=false;if(fuscaBody.car)fuscaBody.car.visible=false;
  const mirrorHeight=fuscaBody.active?1.28:1.14,rear=cockpit.rearCamera,mirrorTarget=cockpit.mirrorTarget;
  rear.position.set(-.65,mirrorHeight,0).applyMatrix4(carBody.matrixWorld);
  look.set(-30,mirrorHeight,0).applyMatrix4(carBody.matrixWorld);
  rear.up.set(0,1,0).transformDirection(carBody.matrixWorld);rear.lookAt(look);
  // No further than the fog's end (Baixo's view: 1.6 km): past it everything is the fog's colour, and the mirror drew a
  // million triangles of it on a notebook's integrated video.
  const rearFar=Math.min(inside?MIRROR_FAR:HUD_MIRROR.far,scene.fog?.far??MIRROR_FAR);if(rear.far!==rearFar){rear.far=rearFar;rear.updateProjectionMatrix();}
  const oldShadowUpdate=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
  tyreSmoke.material.uniforms.viewport.value=mirrorTarget.height;
  renderer.setRenderTarget(mirrorTarget);renderer.render(scene,rear);
  // The door mirrors look up this picture in the main pass below.
  mirrors.show(inside);if(inside)mirrors.update(camera.position,carBody,rear);
  // The Opala's trunk lid (the Fusca's engine lid) left open stands in the back window: the rear-view mirror gets a
  // picture of its own with it (car-openings.js showOnly), narrowing as the Opala's lid rises until it fills nearly all
  // of it (the Fusca's, lower, rises across the bottom of the picture as it is); the door mirrors look past the flanks
  // and keep the picture without it (user, 2026-10-15).
  const owner=fuscaBody.active?fuscaBody.car:model,rearLid=openings.part('rear'),lid=owner&&inside?openings.amount(rearLid):0,lidOnly=lid>.02?showOnly(owner,rearLid):null;
  if(lidOnly){
   lidMirror??=mirrorTarget.clone();if(lidMirror.width!==mirrorTarget.width||lidMirror.height!==mirrorTarget.height)lidMirror.setSize(mirrorTarget.width,mirrorTarget.height);
   owner.visible=true;const fov=rear.fov;if(!fuscaBody.active)rear.fov+=(LID_MIRROR_FOV-fov)*lid;rear.updateProjectionMatrix();
   renderer.setRenderTarget(lidMirror);renderer.render(scene,rear);rear.fov=fov;rear.updateProjectionMatrix();lidOnly();
  }
  cockpit.mirrorMaterial.map=lidOnly?lidMirror.texture:mirrorTarget.texture;fuscaBody.cockpit?.mirrorMap(cockpit.mirrorMaterial.map);
  renderer.setRenderTarget(null);tyreSmoke.material.uniforms.viewport.value=renderer.domElement.height;
  mirrorFrame=renderedFrame;
  renderer.shadowMap.autoUpdate=oldShadowUpdate;cockpit.root.visible=cockpitShown;driver.root.visible=true;if(model)model.visible=bodyShown;if(fuscaBody.car)fuscaBody.car.visible=true;
 }else if(!hudWanted){mirrors.show(false);if(cockpit){cockpit.mirrorMaterial.map=cockpit.mirrorTarget.texture;fuscaBody.cockpit?.mirrorMap(cockpit.mirrorTarget.texture);}}
 // The cars take the race's reflections back (the car screen's studio lends them its own) and the probe
 // redraws its next faces round the player's car; in the story's paddock the grid's picture would lie.
 carReflections.update(scene,probeAt.copy(carRoot.position).setY(carRoot.position.y+1),{onTrack:!(immersive?.active&&immersive.state.phase==='crowd'),hide:reflectionHide(),rivals:immersive?.visual?.rivals,data});
 // Long lenses (broadcast camera, opening shots) get depth of field focused on their subject.
 const subject=watchedCar?.car??car,dof=intro.active?intro.dof:trackHistory.active?trackHistory.dof:mode==='tv'?{focus:camera.position.distanceTo(watchedCar?.obj.position??carRoot.position),amount:.35}:null;
 // The speed smear rides on the camera's own motion, only while it drives with a car (not the opening shots, the
 // grid, the café, on foot, the podium or a cockpit photo); the cars riding along stay sharp. Phones (the lite film
 // look) with the full smear off get the light road smear of their Sensação de velocidade instead.
 const smearMode=intro.active||trackHistory.active||gridPreview()||pitstop?.opened||immersive?.onFoot()||walker?.active||(immersive?.active&&['crowd','podium'].includes(immersive.state.phase)&&!immersive.inCar)||(mode==='cockpit'&&cockpitView&&!watchedCar)?'still':mode;
 // The phones' road smear only behind the car: in the bonnet and cockpit views the own car's box is the whole screen,
 // every tap would be thrown away and the pass would cost its time for nothing.
 const behindCar=smearMode==='chase'||smearMode==='close'||smearMode==='far';
 const roadSmear=behindCar&&!graphics.values.motionBlur&&cinematic.level==='lite'&&!!speedFx?.profile.roadSmear&&!reducedMotion.matches;
 // The near asphalt's speed cue has one owner: the film's smear where it reaches the road (the full one in the views
 // riding with a car, the phones' road smear behind it), else the asphalt shader's streak (track-surface.js setMotion,
 // no extra pass: the TV and orbit cameras, the phones' bonnet and cockpit, Baixo), as strong as Sensação de
 // velocidade asks (speed-particles.js roadStreak: Leve's .45 is Baixo's only road cue; none when Desligada). Never both
 // on the same pixels, never in a still shot.
 const filmRoad=cinematic.level!=='off'&&(graphics.values.motionBlur&&(behindCar||smearMode==='hood'||smearMode==='cockpit')||roadSmear);
 roadSurface?.setMotion(camera,paused||frozen?0:dt,reducedMotion.matches||smearMode==='still'||filmRoad?0:speedFx?.profile.roadStreak??0);
 speedFx?.motes.setCarBox(moteCarBox(watchedCar?.obj??carRoot,subject));
 // A check's fixed view (interlagos.peek): the camera where it asks, looking at what it asks (three.js world).
 if(peekView){camera.position.fromArray(peekView[0]);camera.lookAt(...peekView[1]);camera.updateMatrixWorld();}
 perfProbe.enforce();
 // The selfie's shot (selfie.js): that one frame drawn denser, the photo cut from it while the canvas still holds it.
 const raceRatio=renderer.getPixelRatio(),shotRatio=walker?.selfie.pending?walker.selfie.density(raceRatio):raceRatio,sharpShot=shotRatio>raceRatio+.01;
 if(sharpShot){renderer.setPixelRatio(shotRatio);renderer.setSize(innerWidth,innerHeight,false);}
 // (the Visual screen open at the room's meeting: its studio instead of the track; the meeting over, it closes)
 if(lookInRace&&!meetingWalk())closeCafeLook();
 if(lookInRace){if(sharpShot){renderer.setPixelRatio(raceRatio);renderer.setSize(innerWidth,innerHeight,false);}lookSelect.render(renderer,dt);return;}
 cinematic.render(scene,camera,{dt:paused?0:dt,topSpeed:topSpeed(subject.mechanics),mode:smearMode,hazeBase:hazeBase(),dof,roadSmear,smearCars:(graphics.values.motionBlur||roadSmear)&&smearMode!=='still'?ridingCars(watchedCar?.obj??carRoot,subject):null});
 if(hudMirrorShown)drawHudMirror();
 walker?.selfie.capture(renderer.domElement);
 if(sharpShot){renderer.setPixelRatio(raceRatio);renderer.setSize(innerWidth,innerHeight,false);}
}
// The player's car went over the rim ('fall': seen from outside, whatever the view) or is back on the track
// ('back': the view it had, the follow cameras placed afresh, the trails and the smoke cut).
function playerFall(event){
 if(event==='fall'){if(isInside()){fallMode=mode;setCameraMode('chase');}carAudio.effect('debrisFly',{strength:1});}
 if(event==='back'){if(fallMode){setCameraMode(fallMode);fallMode=null;}driver?.reset();skidMarks.breakTrails();tyreSmoke.reset();followInitialized=false;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;lookBack.reset();}
}
function renderClassification(){
 const rows=[...(immersive.freeOrder??[])];
 // A multiplayer guest races a rival's car (immersive.playerEntry); otherwise the Opala 99.
 const me=immersive.playerEntry??PLAYER_ENTRY;rows.splice(immersive.freePosition-1,0,me);const list=$('finishingOrder');list.replaceChildren();
 rows.forEach((entry,i)=>{const row=document.createElement('li');row.classList.toggle('player-row',entry===me);row.textContent=`${i+1}º · #${entry.number} ${entry.shortName}`;list.append(row);});
}
// A paused session that #resume can go back to (a finished free race can only be run again).
function resumable(){return sessionStarted&&(immersive?.active||!immersive?.freeResultReady);}
function updateMenuLabels(){
 const finished=!immersive?.active&&!!immersive?.freeResultReady,resume=resumable(),scored=finished&&!!raceResults.championship;
 pilotPicker.root.hidden=sessionStarted;
 $('menu').classList.toggle('race-finished',finished);$('menu').classList.toggle('in-session',sessionStarted&&!finished);
 $('finishingOrder').hidden=!finished;if(finished)renderClassification();
 document.querySelector('#menu h1').textContent=finished?'Fim de corrida.':`Pausa em ${circuit.name}.`;
 document.querySelector('#menu .eyebrow').textContent=finished?'BANDEIRADA / RESULTADO FINAL':`${immersive?.active?'MODO HISTÓRIA':'MODO CORRIDA'} · ${championshipRace?`${championshipRace.championship.info.label} · ETAPA ${championshipRace.round+1}/${championshipRace.championship.total}`:freeRaceTitle()} / PAUSA`;
 // Opening: Modo Corrida or Modo História. Paused: back to the track, restart, change track.
 // A finished single race can be run again; a scored championship round goes on from the result sheet.
 $('start').hidden=$('storyStart').hidden=$('driftStart').hidden=$('historiasStart').hidden=sessionStarted;$('carsVisual').hidden=menuMode==='historia';if(!$('start').disabled)menuLabel($('start'),'Modo Corrida →');
 $('resume').hidden=!resume;$('leaveRace').hidden=!sessionStarted;$('leaveRace').textContent=circuit.arena?'Sair da arena':'Trocar de pista';
 $('restartRace').hidden=!(resume||finished&&!scored&&!multiplayer?.guest());menuLabel($('restartRace'),finished?'Correr novamente →':immersive?.practice?'Recomeçar treino':'Recomeçar corrida');
 // The track screen races in the mode chosen at the opening.
 const story=menuMode==='historia',laps=raceLaps(circuit.id,chosenLaps());
 $('tracks').dataset.mode=menuMode;$('tracksTitle').textContent=story?'Sua temporada na Old Stock.':'Onde vamos acelerar hoje?';document.querySelector('.tracks-side-head .tracks-kicker').textContent=story?'SUA TEMPORADA':'NA PISTA ESCOLHIDA';if(!$('championshipReset').dataset.armed)$('championshipReset').textContent=story?'Recomeçar história':'Recomeçar campeonato';$('tracksMode').textContent=story?'MODO HISTÓRIA · AUTO-POBRE RACING':menuModel()==='fusca'?'MODO CORRIDA · COPA FUSCA':'MODO CORRIDA · OLD STOCK RACE';
 // The paddock look names the race in its mode row: each start button says Largar, its line what it races.
 const paddock=paddockMenus(),go=paddock?'Largar →':null;
 $('singleRace').querySelector('.mode-label').textContent=loading&&pendingMode==='single'?'Carregando circuito…':go??'Corrida única →';
 $('singleRaceDetail').textContent=`${paddock?'Corrida única':'Só esta pista'} · ${laps} volta${laps>1?'s':''}${story?' · vaquinha, boxes e o sonho da Blazer':' contra 14 adversários'}`;
 // Modo Corrida's solo practice and 1x1 (the story's track screen hides them: pistas.css).
 const myModel=menuModel(),myCar=menuCar(),rival=carEntry(duelRivalFor(myCar,chosenDuel(myModel),myModel),myModel);
 $('soloRace').querySelector('.mode-label').textContent=loading&&pendingMode==='solo'?'Carregando circuito…':go??'Treino solo →';
 $('duelRace').querySelector('.mode-label').textContent=loading&&pendingMode==='duel'?'Carregando circuito…':go??'Corrida 1x1 →';
 $('duelRaceDetail').textContent=`Você contra #${rival.number} ${rival.shortName} · ${laps} volta${laps>1?'s':''}`;
 $('duelSwatch').style.setProperty('--body',cssColor(rival.color));$('duelSwatch').style.setProperty('--stripe',cssColor(rival.stripe));
 const pick=$('duelRival'),field=fieldRoster(myCar,myModel);if(pick.options.length!==field.length||field.some((e,i)=>pick.options[i].value!==e.number))pick.replaceChildren(...field.map(e=>new Option('',e.number)));
 for(const option of pick.options){const entry=carEntry(option.value,myModel);option.textContent=`#${entry.number} ${entry.shortName}${entry.number===ACE_NUMBER&&preferences.values.aceKoyzinho?' · Indestrutível':''}`;}
 $('duelRival').value=rival.number;showLaps();$('tracksBack').textContent=carScreen()?'← Carro':'← Início';renderSteps();showRaceMode();
 if(loading&&pendingMode==='championship')$('championshipStart').textContent=`Etapa ${championshipFor().round+1}: carregando ${circuit.name}…`;
 $('settingsResume').hidden=!sessionStarted||(!immersive?.active&&immersive?.freeResultReady);$('settingsRestart').hidden=$('settingsResume').hidden;
 $('settingsBack').textContent=sessionStarted?'Sair para a escolha de pista →':screen==='tracks'?'Voltar à escolha de pista →':'Voltar ao início →';
 $('raceResult').hidden=immersive?.active||!immersive?.freeResultReady;if(!immersive?.active&&immersive?.freeResultReady)$('raceResult').textContent=`Bandeirada! ${immersive.freePosition}º de ${immersive.fieldSize} · ${immersive.freeTotalLaps} volta${immersive.freeTotalLaps>1?'s':''} · ${fmt(immersive.finishTime??car.clock)}`;
 if(!loading&&screen==='tracks'&&!sessionStarted)renderTracks();
}
// A menu choice's words, its closing arrow apart: the paddock look leaves the opening's arrows out (menus.css).
function menuLabel(button,text){const [,words,arrow]=text.match(/^(.*?)( →)?$/);button.replaceChildren(arrow?words+' ':words,...arrow?[Object.assign(document.createElement('span'),{className:'menu-arrow',textContent:'→'})]:[]);}
// The free race under way as the pause menu names it: a single race, the solo practice (its laps and
// best so far) or the 1x1 and its rival.
function freeRaceTitle(){
 if(circuit.arena)return 'ARENA DE DRIFT';
 const lineup=immersive?.active?null:immersive?.freeLineup;
 if(!lineup)return 'CORRIDA ÚNICA';
 if(!lineup.length)return `TREINO SOLO · ${car.laps} VOLTA${car.laps===1?'':'S'}${car.best?` · MELHOR ${fmt(car.best)}`:''}`;
 return `1x1 CONTRA #${lineup[0]} ${carEntry(lineup[0],raceModel)?.shortName.toUpperCase()??''}`;
}
function resumeRace(){if(!sessionStarted||(!immersive.active&&immersive.freeResultReady))return;$('settings').close();menu(false);}
$('settingsResume').onclick=resumeRace;
// P, or the window losing focus (another app, a screenshot tool), freezes the race and keeps it
// on screen under a small badge; Escape opens the menu.
let held=false;
// Taking the wheel ends the recon lap: the cameras come back to the player's car.
// Getting out of the car anywhere (free-walk.js): while the race runs (Modo Corrida's, the story's, the arena, the recon
// lap) with the car on the ground; not in the countdown, the opening shots, the grid, at the open box (its own walk), in
// the arena's editor or after the flag.
function walkRace(){return ready&&sessionStarted&&!intro.active&&!gridPreview()&&!car.fall&&!pitstop?.opened&&!arenaMode?.editing&&raceResults.root.hidden&&(immersive.active?immersive.state.phase==='race':!immersive.freeCountdown&&!immersive.freeResultReady&&!immersive.finishing);}
// A multiplayer room's meeting at the Tia's café (multiplayer.js meet: before its start, and past the flag): on foot
// away from the car, outside walkRace's times; over once the result sheet shows.
function meetingWalk(){return !!walker?.away&&ready&&sessionStarted&&!intro.active&&raceResults.root.hidden;}
// Where the room's pilots stand as they meet (index: theirs in the room): the Box 99 layout's spots by the café
// (pit-box99.js meeting), one each, the next ones after it should one be taken; elsewhere round the Tia's counter.
function meetingSpots(index){
 const listed=pitstop?.layout?.meeting,k=listed?.length?index%listed.length:0;
 if(listed?.length)return [...listed.slice(k),...listed.slice(0,k)].map(p=>p.clone());
 const seat=pitstop.cafeSeat,spots=[];
 for(let j=0;j<16;j++){const i=index+j,a=i*2.4,r=2.2+.45*(i%4);spots.push(new THREE.Vector3(seat.x+Math.cos(a)*r,seat.y,seat.z+Math.sin(a)*r));}
 return spots;
}
// The room's hooks (multiplayer.js): the pilot on foot by the café (away: free-walk.js meet's), back in the car.
function meetAtCafe(index,away){
 if(!walker||!pitstop?.cafeSeat||!ready||!sessionStarted||intro.active||gridPreview()||!raceResults.root.hidden||pitstop.opened)return false;
 if(walker.stopping)walker.cancel();
 return walker.meet(meetingSpots(index),{face:pitstop.cafeSeat,away});
}
// F in the car: it stops and he gets out (the recon lap and the arena's demonstration hand the car over first); F again
// while it brakes stays in. Past the flag in a room (parked, watching the others) F takes him to the Tia's café.
function toggleWalk(){
 if(walker&&!walker.active&&multiplayer?.spectating?.())return multiplayer.toCafe();
 if(!walker||walker.active||!walker.stopping&&!walkRace())return false;
 if(automatic)takeWheel();if(arenaMode?.demo)arenaMode.stopDemo('VOCÊ ASSUMIU O CARRO');
 return walker.request();
}
// A multiplayer room's pilot past the flag watches a car by its number (multiplayer.js finishAndWatch).
function watchCar(number){
 if(!ready||!immersive||immersive.active)return false;const k=immersive.rivals.findIndex(r=>(r.seat??r.entry.number)===number);if(k<0)return false;
 watched=k;watchNext(1);return watched===k+1;
}
function takeWheel(){automatic=false;if(watched){watched=0;followInitialized=false;tvCamera?.reset();}}
// Back from a pause in the middle of a race (P, Escape's menu, the window coming back), the picture stays frozen
// under a quick 3, 2, 1 (RESUME: faster than seconds, as games do) so the player sees where the car was before it
// runs on (user, 10-24). Keys pressed during it count at the go. Not for the recon lap, a multiplayer room, on foot
// or at the box; a new race has its own countdown. pausedRacing: the pause came mid-race; resumeLeft: the count's
// seconds left (paused stays true meanwhile, the menu and the badge hidden); resumeGo: VAI! shown after it.
const RESUME=Object.freeze({steps:3,step:.55,go:.5});
let pausedRacing=false,resumeLeft=0,resumeGo=0;
const stillRacing=()=>walkRace()&&!automatic&&!roomWanted&&!walker?.active&&!arenaMode?.demo&&!trackHistory.active;
// Leaving a pause: true when the count starts (the race then stays paused until it ends).
function countBack(){const wanted=pausedRacing&&stillRacing();pausedRacing=false;resumeLeft=wanted?RESUME.steps*RESUME.step:0;return wanted;}
// Every frame: the count runs down (not while the tab is hidden) and, at its end, the race goes on.
function resumeTick(dt){
 resumeGo=Math.max(0,resumeGo-dt);if(resumeLeft<=0||document.hidden)return;
 resumeLeft-=Math.min(dt,.1);if(resumeLeft>0)return;
 resumeLeft=0;resumeGo=RESUME.go;paused=false;carAudio.setPaused(false);carAudio.unlock();cameraReturn.reset(performance.now());
}
// The recon lap (automatic) is never paused by the window losing focus: it may be a demonstration.
// Nor is a multiplayer race: the others race on (two windows side by side share one focus).
function hold(on){
 // The track's story pauses as a video does (the window left, the tab hidden), without the race's pause badge.
 if(trackHistory.active){if(on)trackHistory.pause();return;}
 // P (or the window leaving) during the count: back to the frozen pause under its badge.
 if(on&&resumeLeft>0){resumeLeft=0;held=true;pausedRacing=stillRacing();keys.clear();mobile?.clear();$('pauseBadge').hidden=false;return;}
 if(!ready||on===held||on&&paused||on&&roomWanted)return;
 if(on)pausedRacing=stillRacing();
 const counting=!on&&countBack();
 held=on;paused=on||counting;carAudio.setPaused(paused);if(!paused)carAudio.unlock();if(on)takeDrop();
 if(on&&document.pointerLockElement===$('view'))document.exitPointerLock();
 keys.clear();mobile?.clear();cameraReturn.reset(performance.now());$('pauseBadge').hidden=!on;
}
$('pauseBadge').onclick=()=>hold(false);
// The touch pads' places (mobile-controls.js arrange, the ✥ beside ⚙): the race waits as in the menu, without
// it, while the pads are dragged.
function arrangePause(on){held=false;$('pauseBadge').hidden=true;paused=on;carAudio.setPaused(on);if(!on)carAudio.unlock();if(on&&document.pointerLockElement===$('view'))document.exitPointerLock();keys.clear();cameraReturn.reset(performance.now());updateScreens();}
function menu(show){mobile?.arrange(false,false,true);if(!show)sceneryToast();held=false;$('pauseBadge').hidden=true;if(!show&&!immersive?.active&&immersive?.freeResultReady)show=true;
 if(show&&(!paused||resumeLeft>0)){pausedRacing=stillRacing();resumeLeft=0;}const counting=!show&&countBack();
 paused=show||counting;if(show)takeDrop();updateMenuLabels();carAudio.setPaused(paused);if(!paused)carAudio.unlock();if(show&&document.pointerLockElement===$('view'))document.exitPointerLock();cameraReturn.reset(performance.now());updateScreens();keys.clear();mobile?.clear();status('');}
function updateScreens(){
 const free=paused&&!sessionStarted,tracks=free&&screen==='tracks',cars=free&&screen==='cars',visual=(free||lookInRace)&&screen==='visual',histories=free&&screen==='historias';
 $('historias').classList.toggle('hidden',!histories);
 // The arena's panel and editor pause the car without the menu (drift-arena-mode.js).
 $('menu').classList.toggle('hidden',!paused||resumeLeft>0||tracks||cars||visual||histories||!!(arenaMode?.editing||arenaMode?.panelOpen||mobile?.arranging));$('tracks').classList.toggle('hidden',!tracks);$('cars').classList.toggle('hidden',!cars);$('visual').classList.toggle('hidden',!visual);
 // The Visual screen too: only the canvas (its studio) and the screen (visual.css).
 document.body.classList.toggle('visual-open',visual);
 // The car screen is the canvas's window: the race's HUD steps aside (carros.css).
 document.body.classList.toggle('cars-open',cars);
 if(tracks)renderTracks();if(cars)openCarScreen();
}
// A multiplayer guest back at the opening no longer waits for the host's race (multiplayer.js wait).
function showScreen(name){screen=name;if(name==='opening')multiplayer?.wait(false);if(name==='historias')renderHistorias();updateScreens();updateMenuLabels();if(name==='tracks')raceStart().focus({preventScroll:true});if(name==='cars')$('carsNext').focus({preventScroll:true});if(name==='visual')openVisualScreen();}
// Who races, as the track and car screens show it: the pilot and, in Modo Corrida, the car.
const pilotLine=()=>[pilotPicker.profiles.selected&&`Piloto: ${pilotPicker.profiles.selected}`,menuMode==='corrida'&&`${MODEL_NAMES[menuModel()]} #${menuCar()}`].filter(Boolean).join(' · ');
// Modo Corrida's car screen (car-select.js): the studio needs the renderer and the car's model, both
// kept for the race. A multiplayer guest does not pick the track: its button waits for the host's race.
const carSelect=new CarSelect({root:$('cars'),values:{opala:preferences.values.car,fusca:preferences.values.fuscaCar},model:preferences.values.carModel,carRoot,quality:()=>graphics.values.reflections,livery:()=>$('livery').value,fill:()=>paddockMenus()?.9:.76,
 onModel:model=>{preferences.update({carModel:model});updateMenuLabels();if(model==='fusca')fuscaInStudio();},
 onPick:(number,model)=>{preferences.update({[model==='fusca'?'fuscaCar':'car']:number});multiplayer?.choose(number);updateMenuLabels();if(ready)showRoster();},onNext:()=>{if(multiplayer?.guest())multiplayer.wait();else if(menuMode==='drift')beginArena();else showScreen('tracks');},onBack:()=>showScreen('opening'),
 still:preferences.values.carStill,onStill:carStill=>preferences.update({carStill})});
// The Fusca tab's studio needs the Fusca's model.
function fuscaInStudio(){ensureFusca().then(template=>{if(template)carSelect.setFusca(template);else carSelect.failed('fusca');});}
function openCarScreen(){
 if(carSelect.model==='fusca')fuscaInStudio();
 $('carsPilot').textContent=pilotPicker.profiles.selected?`Piloto: ${pilotPicker.profiles.selected}`:'';if(model&&carSelect.studio.template===model&&activeLivery===$('livery').value)return;
 // No WebGL: the screen says so and the choice still counts.
 try{initializeRenderer();}catch(err){console.error(err);carSelect.failed();return;}
 ensureCarModel().then(()=>{if(model&&carSelect.studio.template!==model)carSelect.setTemplate(model);}).catch(err=>{console.error(err);carSelect.failed();});
}
// The Visual screen (look-select.js): the pilot's suit, man or woman, gloves, hair and helmet, kept per pilot in this
// browser (pilot-look.js); opened from the car screen (Visual, after the Opala and Fusca tabs: Modo Corrida and the
// arena; user, 2026-10-20) and back there. The story always races Stevan's own look (pilotLook), and has no car screen.
const lookStore=new LookStore();let lookFrom='opening';
const lookSelect=new LookSelect({root:$('visual'),store:lookStore,pilot:()=>pilotPicker.profiles.selected,onBack:()=>lookFrom==='cafe'?closeCafeLook():showScreen(lookFrom),quality:()=>graphics.values.reflections});
// A multiplayer room's meeting at the Tia's café (multiplayer.js meet; the team's wish, 10-26: change clothes while the
// start waits): the Visual screen over the race, which goes on behind it (the studio drawn instead of the track,
// runFrame); back, the pilot on foot in the new clothes, the room seeing them as they are chosen (multiplayer.js look).
let lookInRace=false,lookScreen='opening';
function openVisual(from){
 if(from==='cafe'){
  if(!walker?.away||loading||lookInRace)return;
  lookInRace=true;lookScreen=screen;lookFrom='cafe';keys.clear();mobile?.clear();
  if(document.pointerLockElement===$('view')){mouseFreed=true;document.exitPointerLock();}
  showScreen('visual');return;
 }
 if(sessionStarted||loading||from==='opening'&&!pilotPicker.commit())return;lookFrom=from;showScreen('visual');
}
function closeCafeLook(){if(!lookInRace)return;lookInRace=false;screen=lookScreen;updateScreens();walker?.redress();keys.clear();}
function openVisualScreen(){lookSelect.show();$('visualDone').focus({preventScroll:true});try{initializeRenderer();}catch(err){console.error(err);lookSelect.failed();}}
$('carsVisual').onclick=()=>openVisual('cars');
// The look the player races in now: none in the story (Stevan's), the pilot's own elsewhere (null: Stevan's too).
const pilotLook=()=>immersive?.active?null:lookStore.get(pilotPicker.profiles.selected);
window.interlagosVisual={info:()=>({...lookSelect.info(),screen,from:lookFrom,racing:pilotLook()}),open:from=>{openVisual(from??'cars');return screen==='visual';},view:(part,yaw)=>lookSelect.view(part,yaw),saved:()=>lookStore.names()};
window.interlagosCarros={info:()=>({...carSelect.info(),raceCar,painted:carLivery.number,decals:carLivery.decals.length,hidden:carLivery.hidden.length,paint:carLivery.materials.find(m=>m.name==='Pintura_preta')?.color.getHex()??null,skin:!$('skinButton').hidden,touchSkin:!$('touchSkin').hidden,screen,livery:activeLivery,
 // Stevan's Opala 99 built from the model as loaded now (null: not built on this circuit).
 stevanCurrent:immersive?.visual?.opala99?immersive.visual.opala99Template===model:null,
 // The model raced, the player's Fusca (fusca.js) and whether the Opala's body shows.
 raceModel,fusca:fuscaBody.info(),fuscaLoaded:!!fuscaTemplate,opalaShown:opalaShell.visible,seatShift:seatShift.toArray(),
 // The screen's pixel density now (the garage draws sharper than the race: studioDensity).
 pixelRatio:renderer?.getPixelRatio()??null,studioRatio:studioView.saved===null?null:studioView.ratio}),
 // Takes a car of the tab shown as the arrows would (a taken one only gets the room's note); gives the car chosen after it.
 pick:number=>{carSelect.pick(String(number));return carSelect.value;},
 // The car shown, alone on a see-through ground (car-select.js snapshot): the strip's pictures (gerar_miniaturas_carros.py).
 snapshot:options=>renderer?carSelect.studio.snapshot(renderer,options):null};
// Each circuit's best lap on its card (the layout ticked on a card, its own).
function fillBestLaps(){
 const pilot=pilotPicker.profiles.selected||'';
 for(const slot of document.querySelectorAll('[data-best]')){
  const lap=trackRecords(pilotStorage(),slot.dataset.best,menuModel(),pilot,8).lap,mine=lap.find(r=>r.me);   // the car chosen (the story's Opala)
  slot.textContent=mine?`Seu recorde · ${mine.time}`:lap[0]?`Recorde · ${lap[0].time}`:'';
 }
}
// The track screen: the pilot, each circuit's best lap and the championship panel.
function renderTracks(){
 $('tracksPilot').textContent=pilotLine();
 fillBestLaps();
 // Modo História's season picks the track: the round to come in big (the first before the season starts, the last once it is over).
 const season=menuMode==='historia'?championshipFor():null,rounds=season?.schedule,k=rounds?Math.min(season.round,rounds.length-1):0,next=rounds?.[k];
 const hero=next?.circuit??circuit.id;showHero(hero,next?`Etapa ${k+1} de ${rounds.length}${next.date?` · ${next.date}`:''}`:'');showCircuitPhoto(hero);showRaceMode();
 renderChampionshipPanel($('tracks'),championshipFor());renderStoryCareer();
}
// Modo História's career (story-career.js) as this browser keeps it: read for the track screen, and
// started over with the season ("Recomeçar história").
function storyProfile(){let profile={};try{profile=JSON.parse(localStorage.getItem(STORY_PROFILE_KEY))||{};}catch{}return new ImmersiveState(profile).profile;}
function resetStoryCareer(){
 const state=new ImmersiveState(storyProfile());state.restartCareer();try{localStorage.setItem(STORY_PROFILE_KEY,JSON.stringify(state.profile));}catch{}
 immersive?.state.restartCareer();
}
// Beside the season on the story's track screen: the wallet, the three bars and the challenge (or the end).
function renderStoryCareer(){
 const box=$('storyCareer');box.hidden=menuMode!=='historia';if(box.hidden)return;
 const p=storyProfile(),c=p.career,stage=stageOf(c,p.released),challenge=stage.challenge,money=n=>`R$ ${n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+,)/g,'.')}`;
 const goal=c.over?`<p class="story-career-over"><b>Fim de jogo.</b> ${GAME_OVER[c.over]} Entre na próxima etapa para recomeçar a história do zero.</p>`
  :challenge?`<p${c.late===null?'':' class="story-career-late"'}>Desafio ${challenge.number}: ${challenge.title.toLowerCase()} · ${money(Math.min(p.fund,challenge.goal))} de ${money(challenge.goal)} · ${deadlineText(challenge,c)}</p>`
  :stage.kind==='blazer'?`<p>Sonho: tirar a Blazer da oficina · ${money(Math.min(p.fund,BLAZER_GOAL))} de ${money(BLAZER_GOAL)}</p>`
  :`<p>${stage.done?'O Opala 99 é seu!':`Grande sonho: comprar o Opala 99 da equipe · ${money(Math.min(p.fund,OPALA_GOAL))} de ${money(OPALA_GOAL)}`}</p>`;
 const energy=c.energy??100;
 box.innerHTML=`<span class="tracks-kicker">SUA CARREIRA · ${c.races} corrida${c.races===1?'':'s'}</span><div class="career-wallet"><span>Carteira</span><b>${money(p.fund)}</b></div>`
  +`<div class="career-bar career-energy" data-key="energia" data-low="${energy<=30}"><span>Energia</span><i><b style="width:${energy}%"></b></i><em>${energy}%</em></div>`
  +MORALE.map(k=>k==='esposa'&&c.divorced?`<div class="career-bar career-divorced" data-key="${k}"><span>${MORALE_NAMES[k]}</span><em>divorciado · pensão ${money(PENSION)}/mês</em></div>`
   :`<div class="career-bar" data-key="${k}" data-low="${c.morale[k]<=20}"><span>${MORALE_NAMES[k]}</span><i><b style="width:${c.morale[k]}%"></b></i><em>${c.morale[k]}%</em></div>`).join('')+goal;
}
// The Gráficos tab's pixel sizes follow the window: refreshed whenever the settings open.
const openSettings=setupSettings(()=>{menu(true);showRoster();graphicsPanel.show(preferences.values.graphics);sceneryNotice();},returnToMainMenu);
// For checks: the graphics in force and what the renderer really uses; set() takes {level, overrides}.
window.interlagosGraficos={
 info:()=>({...graphics,stored:structuredClone(preferences.values.graphics),pixelRatio:renderer?.getPixelRatio()??null,resolution:{max:resolution.max,min:resolution.min,dynamic:resolution.dynamic,changes:resolution.changes,targetFps:dynamicTarget(),cadence:displayCadence.hz,cadenceMeasured:displayCadence.measured,gpuMs:debugOverlay.frameGpuMs},fpsLimit:frameCap.limit,
  shadow:{cast:sun.castShadow,enabled:!!renderer?.shadowMap.enabled,size:sun.shadow.mapSize.x,reach:sun.shadow.camera.right,radius:sun.shadow.radius},fog:scene.fog?[scene.fog.near,scene.fog.far]:null,far:camera.far,
  device:{renderer:device.renderer,tier:device.tier,level:autoLevel(touchDevice,device),reason:autoReason(touchDevice,device),drop:device.drop,ratios:{...device.ratios}},watch:{slow:frameWatch.slow,fired:frameWatch.fired},
  compiling:!!graphicsCompiling,mirror:cockpit?[cockpit.mirrorTarget.width,cockpit.mirrorTarget.height]:null,cinematic:cinematic?(({look,...rest})=>rest)(cinematic.info()):null,scenery:sceneryBuilt,water:landscape?.waterInfo().realistic??null,debug:debugOverlay.info()}),
 set:value=>{preferences.update({graphics:value});applyGraphics();return window.interlagosGraficos.info();},
 // Checks: heavy() acts as a heavy race would (Automático steps down, a level by hand gets the hint); forget() drops the
 // step remembered for this video chip.
 heavy:()=>{frameWatch.fired=true;heavyRace();return window.interlagosGraficos.info();},forget:()=>{device.drop=null;device.ratios={};try{localStorage.removeItem(AUTO_KEY);}catch{}applyGraphics();return window.interlagosGraficos.info();},
 // What the frame costs by part of the scene (perf-probe.js): cost(frames) draw calls and triangles, hide(parts, hidden).
 cost:frames=>perfProbe.count(frames),hide:(parts,hidden=true)=>perfProbe.hide(parts,hidden),graph:part=>perfProbe.graph(part),
 // The world left out from inside an enclosed bowl (enclosure): enclosure(false) draws it all the same (a check's A/B).
 enclosure:on=>{if(enclosure&&on!=null)enclosure.on=!!on;return enclosure&&{on:enclosure.on,renders:enclosure.renders,portals:enclosure.portals,world:enclosure.world.length,parts:enclosure.parts.length};},
 // Every frame's interval from record(true) to record(false): average FPS, 1% low, worst frame, hitches (debug-overlay.js frameStats).
 record:on=>debugOverlay.record(on)
};
// For checks and tuning: the sun, the fill, where the shadow box lies and the cars' crisp map; set()
// changes the light live ({sun, sunColor, fill, fillColor, fillGround, environment, exposure}: a test, not saved); photo()
// holds the camera at {from, at} metres in the car's frame (x ahead, y up), {fov}; null lets go.
let lightPhoto=null;const lightPhotoAt=new THREE.Vector3();
function holdLightPhoto(){if(!lightPhoto)return;carRoot.updateMatrixWorld();
 // world: from and at in the track's frame (x east, y north, z up), for photos of the scenery away from the car.
 if(lightPhoto.world){const [fx,fy,fz]=lightPhoto.from,[ax,ay,az]=lightPhoto.at;camera.position.set(fx,fz,-fy);camera.up.set(0,1,0);camera.lookAt(lightPhotoAt.set(ax,az,-ay));}else{camera.position.set(...lightPhoto.from).applyMatrix4(carRoot.matrixWorld);camera.up.set(0,1,0);camera.lookAt(lightPhotoAt.set(...lightPhoto.at).applyMatrix4(carRoot.matrixWorld));}camera.fov=lightPhoto.fov??40;camera.updateProjectionMatrix();}
window.interlagosLuz={
 info:()=>({sun:{intensity:sun.intensity,color:'#'+sun.color.getHexString(),direction:sunDirection.toArray()},fill:skyFill.intensity,fillColor:'#'+skyFill.color.getHexString(),fillGround:'#'+skyFill.groundColor.getHexString(),environment:scene.environmentIntensity,exposure:renderer?.toneMappingExposure??null,box:sunPlacement.info(),car:carShadow.info()}),
 set:({sun:i,sunColor,fill,fillColor,fillGround,environment,exposure,carShadow:look}={})=>{if(i!=null)sun.intensity=i;if(sunColor)sun.color.set(sunColor);if(fill!=null)skyFill.intensity=fill;if(fillColor)skyFill.color.set(fillColor);if(fillGround)skyFill.groundColor.set(fillGround);if(environment!=null)scene.environmentIntensity=environment;if(exposure!=null&&renderer)renderer.toneMappingExposure=exposure;if(look)carShadow.look(look);return window.interlagosLuz.info();},
 photo:pose=>{lightPhoto=pose?{from:pose.from,at:pose.at,fov:pose.fov,world:!!pose.world}:null;if(!pose){followInitialized=false;camera.fov=baseFov(mode,camera.aspect);camera.updateProjectionMatrix();}return !!lightPhoto;}
};
// The weather for checks and photos (weather.js): what is in force, set({time, rain}) as the selects do (saved),
// settle() lets the eye adapt at once (a held frame has no time to adapt).
window.interlagosClima={
 info:()=>({time:weather.time,rain:weather.rain,choice:{time:preferences.values.timeOfDay,rain:preferences.values.rain},draw:{time:weatherDraw.time,rain:weatherDraw.rain},roll:weatherDraw.roll,odds:raceRainOdds(),caption:circuit?weatherLine():null,floods:floods?.info()??null,falling:rain?.info()??null,wipers:windscreen.info(),fuscaWipers:fuscaScreen.info(),limp:limpSwitch?+limpSwitch.rotation.x.toFixed(3):null,compiling:!!graphicsCompiling,lamps:playerLamps.info(),farol:farolSwitch?+farolSwitch.rotation.x.toFixed(3):null,glow:!!playerGlow?.visible,rivalGlow:!!immersive?.visual?.rivals?.some(o=>o.userData.headlights?.visible),tail:TAIL_LIGHTS.on,roadLamps:ROAD_LAMPS.roadLampCount.value,wetness:roadSurface?.stats.wetness??0,grip:car?.weatherGrip??null,fieldGrip:immersive?.field.weatherGrip??null,rivalGrip:immersive?.rivals?.[0]?.car.weatherGrip??null,sun:{intensity:sun.intensity,color:'#'+sun.color.getHexString(),direction:sunDirection.toArray()},fog:scene.fog?[scene.fog.near,scene.fog.far]:null,sky:sky?.info()??null,exposure:renderer?.toneMappingExposure??null,look:cinematic?{exposure:cinematic.look.exposure,adaptRange:cinematic.look.adaptRange,hazeDensity:cinematic.look.hazeDensity}:null}),
 set:({time,rain}={})=>{const patch={};if(time)patch.timeOfDay=time;if(rain)patch.rain=rain;preferences.update(patch);for(const [part,value] of [['time',time],['rain',rain]])if(value===RANDOM_WEATHER)redrawWeather(part);for(const [id,key] of [['timeOfDay','timeOfDay'],['tracksTime','timeOfDay'],['rainLevel','rain'],['tracksRain','rain']])$(id).value=preferences.values[key];applyWeather();return window.interlagosClima.info();},
 settle:()=>{cinematic?.resetAdaptation();return true;},
 // The follow cameras placed afresh round the car where it stands now (a photo after moving it by hand).
 snap:()=>{followInitialized=false;car.settle?.();updateCar(1);updateCamera(1);return true;},
 // Tuning, not saved: {cap (road lamps' ceiling), limit (road lamps), spot (player's spot strength), glare}.
 tune:({cap,limit,spot,glare,rainSky,rainWidth,rainShutter,dropsDebug}={})=>{if(dropsDebug!=null){windscreen.material.fragmentShader=dropsDebug;windscreen.material.needsUpdate=true;}if(rainSky!=null)rain.uniforms.rainSky.value=rainSky;if(rainWidth!=null)rain.uniforms.rainWidth.value=rainWidth;if(rainShutter!=null)rain.uniforms.rainShutter.value=rainShutter;if(cap!=null)ROAD_LAMPS.roadLampCap.value=cap;if(limit!=null)lampLimit=limit;if(spot!=null)playerLamps.setStrength(spot);if(glare!=null)setGlare(glare);return {cap:ROAD_LAMPS.roadLampCap.value,limit:lampLimit,count:ROAD_LAMPS.roadLampCount.value,car:[car.x,car.y],lamps:ROAD_LAMPS.roadLampPos.value.slice(0,ROAD_LAMPS.roadLampCount.value).map((p,i)=>[...p.toArray().map(v=>+v.toFixed(2)),...ROAD_LAMPS.roadLampDir.value[i].toArray().map(v=>+v.toFixed(2))])};}
};
// The cars' reflections in that info (source, map size, faces, captures, who lends the map now) and, in
// a race, interlagos.carPaintInfo(): the finish in force and the paint of the player's car and a rival's.
{const info=window.interlagosGraficos.info;window.interlagosGraficos.info=()=>({...info(),reflections:carReflections?.info()??null});window.interlagosGraficos.reflectionSnapshot=()=>carReflections?.snapshot()??null;}
const carPaintInfo=()=>carReflections.paintInfo({player:fuscaBody.car??model,rivals:immersive?.visual?.rivals,far:immersive?.visual?.materials.farCar});
// Championship (championship.js): one per mode and calendar (Todas as pistas, Old Stock 2026 and, in
// Modo Corrida, the Copa Fusca 2026), the panel's tab picks the calendar (remembered; Modo História
// shows Todas as pistas for a calendar it does not offer). championshipRace is the round on track; storyRound, a
// Modo História round already scored that the judge can still disqualify and whose next vaquinha is
// the next round.
const CHAMPIONSHIP_VIEW_KEY='opala99-championship-calendar-v1';
let championshipView=(()=>{try{return championshipCalendar(pilotStorage()?.getItem(CHAMPIONSHIP_VIEW_KEY));}catch{return 'todas';}})();
const championships=Object.fromEntries(['corrida','historia'].map(mode=>[mode,Object.fromEntries(calendarsFor(mode).map(id=>[id,new Championship(pilotStorage(),mode,id)]))])),championshipDialog=new ChampionshipDialog();
// One not started yet would race the car screen's model (Modo História: the Opala): its standings show that field.
const championshipFor=(mode=menuMode,calendar=championshipView)=>Object.assign(championships[mode][championshipCalendar(calendar,mode)],{preferredModel:mode==='historia'?'opala':preferences.values.carModel});
let championshipRace=null,storyRound=null,scoredChampionship=null,pendingMode=null;
// Modo Corrida's single races: 'grid' (the whole field), 'solo' (practice alone) or 'duel' (the 1x1).
let raceKind='grid';
const lapRecords=new LapRecords(circuit.id),raceResults=new RaceResults({
 // A multiplayer guest does not rerun alone: it goes back to the car screen to wait for the host's next race.
 onRestart:()=>{if(multiplayer?.guest())returnToMainMenu();else beginRace(true);},rerunLabel:()=>multiplayer?.guest()?'Aguardar a próxima corrida →':null,onSettings:openSettings,onRecords:mode=>lapRecords.open(mode),onMainMenu:returnToMainMenu,
 onNextRound:()=>{returnToMainMenu();startChampionshipRound();},onChampionship:()=>championshipDialog.open(scoredChampionship??championshipFor()),
 // Closing the sheet opens the podium with the mouse free: a click on the scene gives it to the free camera
 // (user, 10-24: only if the player clicks).
 onPodium:()=>{if(immersive){immersive.podiumCamera=true;immersive.mouseFree=false;}}});
const pilotPicker=new PilotPicker(),automaticRecords=new AutomaticRecords(pilotStorage()),automaticAIRecords=new AutomaticAIRecords(pilotStorage());
// The menu's Recordes: during a session, its circuit and car; before any, the dialog's last view.
$('recordsButton').onclick=()=>{lapRecords.circuit=circuit.id;lapRecords.open(null,sessionStarted?{circuit:circuit.id,car:raceModel}:null);};
$('settingsButton').onclick=openSettings;
mobile=new MobileControls({enabled:touchDevice,onMenu:openSettings,onCamera:()=>{if(ready)setCameraMode(nextCameraMode(),true);},onSkin:cycleLivery,onReset:()=>{if(ready&&!immersive.finishing){if(!immersive?.handleKey('KeyR'))reset(true);}},onUnlock:()=>carAudio.unlock(),onArrange:arrangePause});
// Xbox / PlayStation controller (gamepad-controls.js) and racing wheel (wheel-controls.js): their
// buttons arrive as keys. Menu opens the pause menu and, paused, goes back to the race (as P does
// from the menu or the pause badge).
function padMenu(){
 if(!sessionStarted||lapRecords.dialog.open||championshipDialog.dialog.open)return;
 if($('settings').open)resumeRace();else gamepad.press(paused?'KeyP':'Escape');
}
// Câmbio manual (manual-gearbox.js): X / Z, the controller's X and A, a wheel's paddles or levers. With the automatic
// the same shifts put a gear in for a few seconds (autoShift).
const gearbox=new ManualGearbox(),autoShift=new AutoShift(),manualGearbox=()=>preferences.values.gearbox==='manual';
// The player takes the gearbox over from the automatic (a race start, the recon lap's autopilot, the
// cool-down after the flag): it starts in the car's gear, or the H lever's.
function ownGearbox(){if(!car.manualGear){gearbox.sync(car,wheel.lever);car.manualGear=true;}}
// With the automatic the brake held at rest backs up (brake-reverse.js).
const brakeReverse=new BrakeReverse();
function shiftGear(step){
 if(!ready||!sessionStarted||paused||automatic||immersive?.onFoot()||walker?.active||pitstop?.opened)return;
 if(!manualGearbox()){autoShift.ask(car,step);return;}
 ownGearbox();if(step>0)gearbox.up();else gearbox.down(car);
}
let wheelPanel=null,padPanel=null;
const wheel=new WheelControls({onMenu:padMenu,onShift:shiftGear,onChange:wheelStatus});
// The controller's buttons do as on foot (pad-bindings.js) walking, at the box's café, in the story's paddock and on its
// podium and results; anywhere else, as at the wheel.
const padPlace=()=>pitstop?.coffee||immersive?.onFoot()||walker?.active||immersive?.active&&['podium','complete'].includes(immersive.state.phase)?'foot':'car';
const gamepad=new GamepadControls({onLook:padLook,onLookEnd:padLookEnd,onChange:padStatus,onMenu:padMenu,place:padPlace,ignore:pad=>wheel.uses(pad.id)});
$('padSteering').value=preferences.values.padSteering;gamepad.setSteering(preferences.values.padSteering);
$('padSteering').onchange=()=>{preferences.update({padSteering:$('padSteering').value});gamepad.setSteering(preferences.values.padSteering);};
$('padRumble').checked=gamepad.rumble=preferences.values.padRumble;
$('padRumble').onchange=()=>{preferences.update({padRumble:$('padRumble').checked});gamepad.rumble=preferences.values.padRumble;gamepad.bump(12);};
// Picked in the Controles tab or on the track screen: one preference, in force at once.
const showGearbox=()=>{for(const id of ['gearbox','tracksGearbox'])$(id).value=preferences.values.gearbox;};
for(const id of ['gearbox','tracksGearbox'])$(id).onchange=()=>{preferences.update({gearbox:$(id).value});showGearbox();};
showGearbox();
$('wheelLock').value=String(preferences.values.wheelLock);wheel.setLock(preferences.values.wheelLock);
$('wheelLock').onchange=()=>{preferences.update({wheelLock:Number($('wheelLock').value)});wheel.setLock(preferences.values.wheelLock);};
// A setup that found paddles or an H gate turns Câmbio manual on.
wheelPanel=new WheelPanel({wheel,gearbox,manual:manualGearbox,onManual:()=>{preferences.update({gearbox:'manual'});showGearbox();}});
// Closing the settings ends a wheel setup left half done.
$('settings').addEventListener('close',()=>wheelPanel.cancel());
// Teclado do seu jeito: a key moved lets go of whatever was held (it would read as another key on release), and the
// screen's key names follow.
new KeysPanel();
// O controle do seu jeito: its buttons for each command, at the wheel and on foot.
padPanel=new PadPanel({gamepad});
const keyLabels=()=>{applyKeyLabels(document);audioControls();if(activeLivery)skinLabel();};
playerKeys.onChange(()=>{keys.clear();keyLabels();});keyLabels();
$('settings').addEventListener('close',()=>{sceneryToastDue=sceneryNotice();});
// For checks: what the wheel reads and the gear asked for (from the opening menu on).
window.interlagosVolante={info:()=>({configured:wheel.configured,connected:wheel.connected,learning:wheel.learning,steering:wheel.steering,degrees:wheel.degrees,throttle:wheel.throttle,brake:wheel.brake,clutch:wheel.clutch,lever:wheel.lever,held:[...wheel.held],map:structuredClone(wheel.map),lock:wheel.lock,gear:gearbox.gear,manual:manualGearbox(),carGear:car?.gear??null,carManual:!!car?.manualGear})};
// The controls tab says how the wheel stands; a race in progress says so for a moment when it comes or goes.
let wheelShown=false;
function wheelStatus(){
 wheelPanel?.refresh();
 const connected=wheel.configured&&wheel.connected,changed=connected!==wheelShown;wheelShown=connected;
 if(!changed||!sessionStarted||$('settings').open||!wheel.configured)return;
 const shown=connected?'Volante conectado':'Volante desconectado';status(shown);setTimeout(()=>{if($('status').textContent===shown)status('');},4000);
}
// The controls tab names the controller; a race in progress says so for a moment too.
// A device that is no standard pad (a wheel, pedals) is named, and why it does nothing.
function padStatus(pad){
 padPanel?.refresh();
 const odd=pad.unsupported,text=pad.connected?`Controle conectado: ${pad.name}`:odd?`${odd}: não é um controle Xbox ou PlayStation. Se for volante ou pedaleira, configure em Volante, pedais e câmbio, logo abaixo`:'Nenhum controle conectado';
 $('padStatus').textContent=pad.connected||odd?text:`${text}. Ligue o controle e aperte um botão.`;$('padStatus').classList.toggle('connected',pad.connected);
 if(!sessionStarted||$('settings').open)return;const shown=pad.connected?`${text} · RT acelera, LT freia`:odd?text:'Controle desconectado';status(shown);setTimeout(()=>{if($('status').textContent===shown)status('');},4000);
}
document.addEventListener('keydown',e=>{
 // F3 cycles the performance overlay (off, FPS, full) anywhere, menus and dialogs included.
 if(e.code==='F3'){e.preventDefault();if(!e.repeat)setDebugOverlay({debugOverlay:{off:'fps',fps:'full',full:'off'}[preferences.values.debugOverlay]});return;}
 // The Visual screen open at a room's meeting (openVisual 'cafe'): its own keys; Escape back to the café.
 if(lookInRace){if(e.code==='Escape'){e.preventDefault();closeCafeLook();}return;}
 // The track's story playing (track-history.js) has every key: play, pause, jumps, Escape out; none drives.
 if(trackHistory.active&&!$('settings').open){if(trackHistory.handleKey(e))e.preventDefault();return;}
 if(lapRecords.dialog.open||championshipDialog.dialog.open)return;
 if(pitstop?.opened&&!$('settings').open){if(e.code==='Escape')openSettings();else if(e.code==='KeyP')hold(!held);else if(!paused){if(pitstop.coffee&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(!e.repeat&&pitstop.handleKey(e.code))e.preventDefault();}return;}
 if($('settings').open){if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}return;}
 // The selfie's phone out (the photo under review: the mouse is free): Escape puts it away, back to the walk.
 if(e.code==='Escape'&&walker?.active&&walker.selfie.busy&&sessionStarted&&ready&&!paused){e.preventDefault();walker.selfie.close();return;}
 // The Tia's menu open on foot: Escape closes it.
 if(e.code==='Escape'&&walker?.active&&walker.snack.menu&&sessionStarted&&ready&&!paused){e.preventDefault();walker.closeMenu();return;}
 // Out of the car (free-walk.js) the walk takes the keys: F back in, E the hood or the trunk, Space, C, Shift and the
 // movement keys; Escape, P, M, Y and U do as in the car; nothing else (no camera, lights, ghost, gear or rescue).
 if(walker?.active&&sessionStarted&&ready&&!['Escape','KeyP','KeyM','KeyY','KeyU'].includes(e.code)){if(['INPUT','SELECT'].includes(e.target.tagName))return;e.preventDefault();if(e.code!=='Space')keys.add(e.code);if(!e.repeat&&!paused)walker.handleKey(e.code);return;}
 // The arena's panel and editor take their keys; T opens the panel while driving, 9 0 − = tune the car (ARENA_KEYS).
 if(arenaMode&&sessionStarted&&ready&&(arenaMode.editing||arenaMode.panelOpen||!paused&&ARENA_KEYS.includes(e.code))&&arenaMode.handleKey(e)){e.preventDefault();return;}
 if(arenaMode?.editing||arenaMode?.panelOpen)return;
 // Without a race, Escape goes back from the track screen to the opening; P does nothing.
 if(!sessionStarted&&['Escape','KeyP'].includes(e.code)){if(e.code==='Escape'&&screen!=='opening'&&!loading)showScreen(screen==='visual'?lookFrom:screen==='tracks'&&carScreen()?'cars':'opening');return;}
 if(['INPUT','SELECT'].includes(e.target.tagName)&&!['Escape','KeyP'].includes(e.code))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code!=='Space'||arenaMode)keys.add(e.code);if(e.repeat||!ready)return;
 // The key that skips the opening (intro-cinematic.js) does nothing else: not the story's first card, not the handbrake.
 if(e.introKey)return;
 if(!paused&&immersive?.handleKey(e.code)){e.preventDefault();return;}
 // F gets out of the car anywhere in a race (free-walk.js); the car stops first.
 if(e.code==='KeyF'&&!paused)toggleWalk();
 // X shifts up, Z down (the controller's X and A): in the manual, and for a few seconds in the automatic.
 if(e.code==='KeyX'||e.code==='KeyZ')shiftGear(e.code==='KeyX'?1:-1);
 // The controller's D-pad sends 1 2 3 too (synthetic), and on foot the numbers answer: only the
 // keyboard's numbers, in the car, pick a view.
 if(e.code in CAMERA_KEYS&&e.isTrusted&&!immersive?.onFoot()&&!pitstop?.coffee)setCameraMode(CAMERA_KEYS[e.code],true);
 // Space pulls the handbrake and leaves it pulled until the next press, like the touch button; N holds it only while
 // held (input, HANDBRAKE_HOLD), the drifter's way, and on the arena Space and Shift do too.
 if(e.code==='Space'&&!paused&&!arenaMode)mobile.setHandbrake(!mobile.handbrake);
 if(e.code==='KeyC')setCameraMode(nextCameraMode(),true);
 if(e.code==='KeyN')watchNext(e.shiftKey?-1:1);
 if(e.code==='KeyR'&&!immersive.finishing)reset(true);
 if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}
 if(e.code==='KeyV')cycleLivery();
 // On foot only the keyboard's G turns the ghost.
 if(e.code==='KeyG'&&(e.isTrusted||!immersive.onFoot()))toggleGhost();
 if(e.code==='KeyO')cycleDrivingLine();
if(e.code==='KeyK')toggleHeadlights();
if(e.code==='KeyJ')toggleWipers();
 // (in a room the weather is the host's, announced with its race)
 if(e.code==='KeyY'&&!roomWanted)cycleWeather('time');
 if(e.code==='KeyU'&&!roomWanted)cycleWeather('rain');
 // P pauses on the track (from the menu it resumes, as before); Escape opens the menu and, pressed again there, goes back
 // to the track (the team's request, 10-15).
 if(e.code==='KeyP'){if(resumeLeft>0)hold(true);else if(held||!paused)hold(!held);else menu(false);}
 if(e.code==='Escape'){if(paused&&!held&&!(resumeLeft>0))resumeRace();else menu(true);}
 if(automatic&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))takeWheel();
 // The arena's AI demonstration hands the car back at the first driving key (drift-arena-mode.js stopDemo).
 if(arenaMode?.demo&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))arenaMode.stopDemo('VOCÊ ASSUMIU O CARRO');
});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('focus',()=>carAudio.setFocused(!document.hidden));window.addEventListener('blur',()=>{carAudio.setFocused(automatic);keys.clear();mobile?.clear();if(!automatic)hold(true);});
document.addEventListener('visibilitychange',()=>{carAudio.setFocused(!document.hidden&&(automatic||document.hasFocus()));if(document.hidden&&!automatic)hold(true);});
window.addEventListener('resize',()=>{displayCadence.reset();resolution.max=Math.min(devicePixelRatio,graphics.values.resolution);resolution.min=Math.min(resolution.max,resolutionFloor(graphics.level,touchDevice));if(renderer)renderer.setPixelRatio(Math.min(resolution.max,Math.max(resolution.min,renderer.getPixelRatio())));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer?.setSize(innerWidth,innerHeight,false);mobile?.clear();if(touchDevice&&innerHeight>innerWidth&&ready)menu(true);});
$('orbitButton').onclick=()=>{if(ready)setCameraMode(mode==='orbit'?'chase':'orbit',true);};
$('cockpitButton').onclick=()=>{if(ready)setCameraMode(mode==='cockpit'?'chase':'cockpit',true);};
$('skinButton').onclick=cycleLivery;
$('watchButton').onclick=()=>watchNext(1);
$('ghostButton').onclick=$('touchGhost').onclick=toggleGhost;
$('lineButton').onclick=$('touchLine').onclick=cycleDrivingLine;
$('touchExit').onclick=()=>{if(walker?.active)walker.getIn();else toggleWalk();};$('touchLights').onclick=toggleHeadlights;$('touchWipers').onclick=toggleWipers;
async function beginRace(restart=false,tour=false,story=preferences.values.immersive){
 if(loading)return;
 // The race the track screen asked for (a championship round or a room's race is a single race); a
 // restart keeps the one before; the recon lap runs with the whole field.
 if(pendingMode)raceKind=['solo','duel'].includes(pendingMode)?pendingMode:'grid';if(tour)raceKind='grid';
 const continuing=sessionStarted&&!restart&&!tour&&story===immersive.active&&!(!immersive.active&&immersive.freeResultReady);
 const pilot=continuing?immersive.pilotName:pilotPicker.commit();if(!pilot)return;
 // Aleatório (weather.js): a new race or a restart races a new draw; the first race after the choice takes the
 // one the menu showed, its rain at the odds of this circuit and month (raceRainOdds). loadCircuit puts it on the world.
 if(!continuing){const odds=raceRainOdds();weatherDraw=weatherDrawRaced?drawWeather(Math.random,odds):{...weatherDraw,rain:rainFor(weatherDraw.roll,odds)};weatherDrawRaced=true;}
 // Automático's step down (or its end after good races) is taken here, before the circuit loads, never mid-race.
 if(!continuing){countGoodRace();takeDrop();}
 if(story!==preferences.values.immersive)chooseImmersive(story);
 if(!await loadCircuit())return;
 const same=sessionStarted&&preferences.values.immersive===immersive.active&&!(!immersive.active&&immersive.freeResultReady);
 if(same&&!restart&&!tour){menu(false);return;}
 automaticRecords.start(pilot);immersive.pilotName=pilot;immersive.recordSaveError='';ghostKey='';
 // A championship round races the championship's laps; everything else the chosen ones; a circuit that fixes its race
 // length (circuits.js fixedLaps: Pampulha) always its own. A room's race (multiplayer.js plan) takes the host's.
 if(tour)championshipRace=null;storyRound=null;raceResults.championship=null;
 immersive.laps=raceLaps(circuit.id,championshipRace?championshipRace.championship.laps:chosenLaps());
 // In a Fusca (the car screen's tab, or the Copa Fusca's rounds) when it loaded; the story and the recon lap race the Opala 99.
 raceModel=!preferences.values.immersive&&!tour&&!roomWanted&&wantedModel()==='fusca'&&fuscaTemplate?'fusca':'opala';ghostCar.use(raceModel);
 // The car: Modo Corrida's choice for that model, or the room's (multiplayer.js); the story and the recon lap race the 99.
 raceCar=preferences.values.immersive||tour?'99':multiplayer?.car()??chosenCar(raceModel);reconLap=tour;
 immersive.lineup=preferences.values.immersive||raceKind==='grid'?null:raceKind==='solo'?[]:[duelRivalFor(raceCar,chosenDuel(raceModel),raceModel)];
 seatCar();
 // On the arena the car meets the arena's floor and items (drift-arena-mode.js attach).
 arenaMode?.attach(car);
 document.querySelector('.session').childNodes[1].textContent=championshipRace?` ${championshipRace.championship.info.label} · ETAPA ${championshipRace.round+1}/${championshipRace.championship.total} `:circuit.arena?' ARENA DE DRIFT ':immersive.lineup?.length===0?' TREINO SOLO ':immersive.lineup?` 1x1 · #${immersive.lineup[0]} `:' PISTA LIVRE ';
 // The story's paddock names the round ahead under its map (immersive.css .story-paddock): season, round, place and dates.
 {const r=championshipRace,row=r?.championship.schedule[r.round];$('mapRound').hidden=!r;if(r)$('mapRound').innerHTML=`<b>${r.championship.info.label} · ETAPA ${r.round+1} DE ${r.championship.total}</b>${[row?.place??circuit.name,row?.date].filter(Boolean).join(' · ')}`;}
 pitstop?.reset();walker?.reset();automatic=false;watched=0;
 // Each new race (a restart, a championship round) lets the circuit's extras draw anew (pampulha-fauna.js: another bank).
 for(const extra of circuitExtras)extra.newRace?.();
 // The title on the line in the season's last three rounds (Central #21, race-field.js TITLE_PACE): the rivals who can still win it.
 immersive.field.stakes=championshipRace?titleStakes(championshipRace.championship,championshipRace.round):null;
 // The story's round (Old Stock 2026) tells the pension which months it pays (story-career.js PENSION_MONTHS).
 if(preferences.values.immersive){immersive.storyRound=championshipRace?.championship.mode==='historia'?championshipRace.round:null;immersive.start();}
 else{if(immersive.active)immersive.disable();reset();setCameraMode(preferences.values.camera);updateCar(1);updateCamera(1);}
 paintCar();
 if(!immersive.active&&!tour&&!circuit.arena&&!historyPending)immersive.beginCountdown();
 startLights();
 sessionStarted=true;automatic=tour&&!immersive.active;pausedRacing=false;menu(false);
}
// História do autódromo: the circuit loads as a solo practice without the 3-2-1 and the story takes the camera;
// leaving it (Pistas, Escape, the end) lands back on the track screen.
// from: 'tracks' (the track screen's button) or 'historias' (História das Corridas, where leaving comes back to).
let historyPending=false,historyFrom=null,circuitBeforeHistory=null;
const historyButtons=()=>[$('historyStart'),...document.querySelectorAll('[data-historia]')];
async function beginHistory(from='tracks'){
 const load=HISTORIES[circuit.id];if(!load||sessionStarted||loading||historyPending)return;
 historyPending=true;historyFrom=from;for(const b of historyButtons())b.disabled=true;
 const label=document.querySelector(`[data-historia="${circuit.id}"]`);if(label)label.textContent='Carregando a pista…';
 try{
  championshipRace=null;pendingMode='solo';
  const [story]=await Promise.all([load(),beginRace(false,false,false)]);
  // The music under the story: its theme, its volume (the Áudio tab's) and the duck under the narrator's voice.
  const audio={duck:a=>carAudio.duckMusic(a),theme:t=>{carAudio.themeOverride=t;},musicVolume:()=>carAudio.musicVolume,setMusicVolume:v=>{carAudio.setMusicMuted(false);carAudio.setMusicVolume(v);}};
  if(sessionStarted&&ready)trackHistory.play(story.HISTORY,{data,oldLayout:story.OLD_LAYOUT,media:story.MEDIA,scene,ghostCar,renderer,camera,audio});
 }catch(err){console.error(err);status('Não foi possível abrir a história desta pista.');}
 finally{historyPending=false;for(const b of historyButtons())b.disabled=false;if(label)label.textContent='▶ Assistir';if(!sessionStarted)leftHistory();}
}
// História das Corridas: the story's circuit for the while; leaving brings back the screen and the circuit chosen before.
function watchHistory(id){if(sessionStarted||loading||historyPending||!HISTORIES[id])return;circuitBeforeHistory=circuit.id;if(circuit.id!==id)selectCircuit(id);beginHistory('historias');}
function leftHistory(){
 if(historyFrom!=='historias'){historyFrom=null;return;}historyFrom=null;
 if(circuitBeforeHistory&&circuitBeforeHistory!==circuit.id)selectCircuit(circuitBeforeHistory);circuitBeforeHistory=null;showScreen('historias');
}
function renderHistorias(){
 $('historiasPilot').textContent=pilotPicker.profiles.selected?`Piloto: ${pilotPicker.profiles.selected}`:'';
 // The stories' language (track-history.js keeps it): the cards speak it; the player and its voice start in it.
 const en=trackHistory.lang==='en';for(const b of document.querySelectorAll('[data-hlang]'))b.setAttribute('aria-pressed',String(b.dataset.hlang===trackHistory.lang));
 $('historiasList').replaceChildren(...HISTORIAS.map(h=>{
  const card=document.createElement('article'),words=en&&h.en?{...h,...h.en}:h;card.className='historia-card';card.lang=en?'en':'pt-BR';
  card.innerHTML=`<img src="${h.picture}" alt="" loading="lazy"><div class="historia-card-body"><span class="tracks-kicker"></span><h3></h3><p></p><small>${en?`${h.chapters} chapters · ${words.minutes} min · narrated, with photos and links`:`${h.chapters} capítulos · ${h.minutes} min · narrada, com fotos e links`}</small><button type="button" class="primary" data-historia="${h.circuit}">${en?'▶ Watch':'▶ Assistir'}</button></div>`;
  card.querySelector('.tracks-kicker').textContent=`${words.place} · ${h.years}`.toUpperCase();card.querySelector('h3').textContent=words.title;card.querySelector('p').textContent=words.summary;
  card.querySelector('button').onclick=()=>watchHistory(h.circuit);return card;
 }));
}
trackHistory.onExit=()=>{carRoot.visible=true;ghostCar.setOpacity(0);camera.up.set(0,1,0);camera.fov=baseFov(mode,camera.aspect);camera.updateProjectionMatrix();followInitialized=false;returnToMainMenu();leftHistory();};
$('historyStart').onclick=()=>{if(!roomWanted)beginHistory('tracks');};
$('historiasStart').onclick=()=>{if(sessionStarted||loading||roomWanted||!pilotPicker.commit())return;showScreen('historias');$('historiasList').querySelector('button')?.focus({preventScroll:true});};
$('historiasBack').onclick=()=>showScreen('opening');
for(const b of document.querySelectorAll('[data-hlang]'))b.onclick=()=>{trackHistory.setLang(b.dataset.hlang);renderHistorias();};
// For checks: the story's state, a jump, play or pause, and starting it as the button does.
window.interlagosAutodromo={info:()=>trackHistory.info(),seek:t=>{trackHistory.seek(t);return trackHistory.info();},play:(on=true)=>{trackHistory.setPlaying(on);return trackHistory.info();},
 start:()=>{beginHistory();return true;},stop:()=>{trackHistory.stop();return true;},layers:()=>trackHistory.layerInfo(),screen:()=>screen,
 audio:()=>({theme:carAudio.themeOverride??null,ducked:carAudio.ducked??0,duckGain:carAudio.musicDuck?.gain.value??null,voiceCut:carAudio.voiceCut?.gain.value??null,music:carAudio.info().musicVolume}),shown:()=>({car:carRoot.visible,ghost:ghostCar.opacity,camera:camera.position.toArray(),fov:camera.fov})};
// Leaving a race (the result sheet, the pause menu, settings) lands on the track screen; a
// championship round left unfinished is raced again next time.
function returnToMainMenu(){
 // Leaving a story by the settings' way out: back where it was started (História das Corridas or the tracks).
 if(trackHistory.active){trackHistory.stop(false);carRoot.visible=true;queueMicrotask(leftHistory);}
 if(weatherOverride){weatherOverride=null;applyWeather();}
 $('settings').close();lapRecords.dialog.close();championshipDialog.close();
 if(!sessionStarted){updateMenuLabels();return;}
 multiplayer?.leaving();
 automaticRecords.update(immersive);automaticAIRecords.update(immersive);
 pitstop?.reset();
 carLivery.clear();showFusca(null);if(ready){immersive.disable();reset();}
 // A multiplayer guest has no track to pick: Modo Corrida brings it back to the car screen, where it
 // waits for the host's next race (or, having left this one early, picks again).
 sessionStarted=false;automatic=false;watched=0;championshipRace=storyRound=null;raceResults.root.hidden=true;screen=multiplayer?.guest()&&carScreen()?'cars':'tracks';
 // Out of the arena: back to its car screen, the circuit chosen before on the track screen again.
 if(circuit.arena){screen='cars';restoreCircuit();}
 menu(true);showCircuitSelection();
}
// Scores the championship round when its race is over (once, before the result sheet shows):
// Modo Corrida at the flag, Modo História when the podium comes, finished or towed in.
function recordChampionshipRound(){
 if(!championshipRace)return;
 const {championship,round,circuit}=championshipRace,story=championship.mode==='historia';
 if(story?!(immersive.active&&immersive.state.phase==='podium'):immersive.active||!immersive.freeResultReady)return;
 raceResults.championship=championship.record(round,circuit,story?storyRows():resultRows(immersive),immersive.pilotName);
 scoredChampionship=championship;if(story&&raceResults.championship)storyRound={championship,round};championshipRace=null;
}
// A story race: the order at the Opala's flag, or, towed in without finishing, the rivals in
// running order and the player last, with no points.
function storyRows(){
 if(immersive.state.result?.position&&immersive.freeOrder)return resultRows(immersive);
 return [...immersive.field.classification(immersive.storyLaps),
  {...PLAYER_ENTRY,name:immersive.pilotName||PLAYER_ENTRY.name,bestLap:car.best,totalTime:null,finished:false,player:true,dnf:true}];
}
function startChampionshipRound(mode=menuMode){
 if(loading||sessionStarted)return;
 const pilot=pilotPicker.commit();if(!pilot)return;
 const championship=championshipFor(mode);if(!championship.available)return;menuMode=mode;
 if(championship.finished)championship.reset();
 if(!championship.started)championship.start(pilot,chosenLaps(mode),mode==='historia'?'opala':preferences.values.carModel);
 // The story's rounds race the laps chosen now (its Voltas, 8 by default); a Modo Corrida championship keeps its start's.
 else if(mode==='historia'&&championship.state.laps!==chosenLaps(mode)){championship.state.laps=chosenLaps(mode);championship.save();}
 selectCircuit(championship.nextCircuit);championshipRace={championship,round:championship.round,circuit:championship.nextCircuit};
 pendingMode='championship';beginRace(true,false,mode==='historia');
}
// After a scored Modo História round (Próxima etapa, or Continuar after a disqualification) the season's screen, its next
// round waiting for the player's Correr a etapa (user, 10-24: no round loads on its own); after the last one, the final
// standings.
function nextStoryRound(){
 const {championship}=storyRound;storyRound=null;returnToMainMenu();
 if(!championship.active)championshipDialog.open(championship);
}
// The opening picks the mode; the track screen then the circuit and a single race or the championship.
function chooseMode(mode){if(sessionStarted||loading||roomWanted&&mode!=='corrida'||!pilotPicker.commit())return;menuMode=mode;carSelect.drift=mode==='drift';carSelect.show();showScreen(carScreen()?'cars':'tracks');}
// The Arena de Drift (drift-arena.js): its own place, never one of CIRCUITS (no championship, records, ghosts or
// room), driven alone in the car screen's car. Leaving it brings back the circuit chosen before.
async function beginArena(){
 if(sessionStarted||loading)return;
 circuit=DRIFT_ARENA;championshipRace=null;pendingMode='solo';await beginRace(false,false,false);
 if(!sessionStarted)restoreCircuit();
}
function restoreCircuit(){if(circuit.arena){circuit=selectedCircuit(preferences.values.circuit);showCircuitSelection();}}
// The arena's panel and editor stop the car and free the mouse, as the menu does, without showing it.
function arenaPause(on){
 if(on){held=false;$('pauseBadge').hidden=true;paused=true;carAudio.setPaused(true);keys.clear();mobile?.clear();if(document.pointerLockElement===$('view')){mouseFreed=true;document.exitPointerLock();}}
 else{paused=false;carAudio.setPaused(false);carAudio.unlock();keys.clear();mobile?.clear();cameraReturn.reset(performance.now());followInitialized=false;}
 updateScreens();
}
// The chosen car on track: the field with the 99 in its seat (RaceField's roster, the rivals' models)
// and the player's result rows under its number; set before the grid. The model goes back to the 99
// first, since the 99 that Stevan Gaipo races is cloned from it. In a Fusca race the whole field races
// Fuscas (raceModel), the Copa Fusca's field, each meeting the others, the walls and the ground with the Fusca's body
// (physics.js FUSCA_BODY; the rivals take it at the grid's reset). A multiplayer guest's field is the
// host's (gridCar: the host's car sits out of it); the guest's own car takes its seat (multiplayer.js).
// The player's rows go under the car's entry, but the Opala 99's (Stevan Gaipo's team: PLAYER_ENTRY).
function seatCar(){
 carLivery.clear();showFusca(null);const entry=raceCar==='99'&&raceModel!=='fusca'?null:carEntry(raceCar,raceModel),grid=raceGrid=multiplayer?.gridCar()??raceCar;
 const body=raceModel==='fusca'?FUSCA_BODY:OPALA_BODY;car.setBody(body);immersive.field.body=body;
 // The car's tank (fuel.js): 15 L, more where the circuit gives it (the Pampulha); the HUD's bar and the Fusca's gauge
 // read against it.
 immersive.tank=tankFor(circuit.id);$('fuelBar').max=$('fuelBar').optimum=immersive.tank;$('fuelTank').textContent=immersive.tank+' L';
 immersive.field.roster=fieldRoster(grid,raceModel);immersive.visual.seatOpala99(model,grid,raceModel==='fusca'?fuscaTemplate:null);
 immersive.playerEntry=entry?{...entry,name:immersive.pilotName,shortName:immersive.pilotName}:undefined;
}
// Once the grid is set: the player's Opala in that car's colours (car-livery.js), the Luizão Racing logo in the
// cockpit only in the cars it prepared, the map's legend, and the paint button only for the 99's two liveries.
function paintCar(){
 if(!(raceModel==='fusca'&&showFusca(carEntry(raceCar,'fusca'))))carLivery.apply(model,raceCar==='99'?null:carEntry(raceCar),immersive.visual,{doorAds:oldStockMaterial});
 cockpit.setLuizao(LUIZAO_CARS.includes(raceCar));
 $('skinButton').hidden=$('touchSkin').hidden=raceCar!=='99'||raceModel==='fusca';document.querySelector('.map-legend').childNodes[1].textContent=` ${raceCar} · VOCÊ `;
}
$('start').onclick=()=>chooseMode('corrida');
$('storyStart').onclick=()=>chooseMode('historia');
$('driftStart').onclick=()=>chooseMode('drift');
$('pilotName').addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('start').disabled){e.preventDefault();$(menuMode==='historia'?'storyStart':'start').click();}});
$('tracksBack').onclick=()=>{if(!loading)showScreen(carScreen()?'cars':'opening');};
// The steps on top of the car and track screens (the paddock look, menus.css): Início, Carro (Modo Corrida and the
// arena), then Pista, Temporada (Modo História) or Arena; the screen shown is the current step, the others go there
// (onwards from the car screen as its own button does: a room's guest waits, the arena opens).
function renderSteps(){
 const last=menuMode==='drift'?['arena','Arena']:['tracks',menuMode==='historia'?'Temporada':'Pista'],steps=[['opening','Início'],...carScreen()?[['cars','Carro']]:[],last],key=steps.flat().join()+screen;
 for(const nav of document.querySelectorAll('.menu-steps')){
  if(nav.dataset.key===key)continue;nav.dataset.key=key;
  nav.replaceChildren(...steps.map(([step,label],i)=>{const b=document.createElement('button');b.type='button';b.dataset.step=step;b.innerHTML=`<b>${i+1}</b> ${label}`;if(step===screen)b.setAttribute('aria-current','step');return b;}));
 }
}
for(const nav of document.querySelectorAll('.menu-steps'))nav.onclick=e=>{
 const step=e.target.closest('[data-step]')?.dataset.step;if(!step||step===screen||loading||sessionStarted)return;
 if(step==='opening'||step==='cars')showScreen(step);else if(screen==='cars')$('carsNext').click();
};
// The track screen's mode row (paddock look): Corrida única, Treino solo, 1x1 or Campeonato, kept for the next visit.
// The screen then shows that race's start button (Largar) and what it needs: the 1x1's rival, the championship's
// calendar. Modo História races only its season. The classic menus show every start button, as before.
const RACE_STARTS={single:'singleRace',solo:'soloRace',duel:'duelRace',championship:'championshipStart'};
// (a multiplayer room races the single race only, whatever was picked before: modo-sala)
const raceMode=()=>roomWanted?'single':menuMode==='historia'?'championship':preferences.values.raceMode;
function showRaceMode(){
 const mode=raceMode();$('tracks').dataset.race=mode;
 for(const tab of $('raceModes').querySelectorAll('[data-race]')){const on=tab.dataset.race===mode;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}
 // The 1x1's rival right after its tab, the row's last (user, 10-24); the classic menus keep it under the 1x1's button.
 const pick=document.querySelector('.duel-pick'),home=paddockMenus()?$('raceModes'):document.querySelector('.duel-card');if(pick.parentElement!==home)home.append(pick);
}
function pickRaceMode(mode,focus=false){if(sessionStarted||loading||!RACE_STARTS[mode]||roomWanted&&mode!=='single')return;preferences.update({raceMode:mode});showRaceMode();if(focus)$('raceModes').querySelector(`[data-race="${mode}"]`).focus();}
for(const tab of $('raceModes').querySelectorAll('[data-race]'))tab.onclick=()=>pickRaceMode(tab.dataset.race);
$('raceModes').addEventListener('keydown',e=>{const step={ArrowLeft:-1,ArrowRight:1}[e.key];if(!step||!e.target.closest('[role=tab]'))return;e.preventDefault();const modes=[...$('raceModes').querySelectorAll('[data-race]')].map(tab=>tab.dataset.race);pickRaceMode(modes[(modes.indexOf(raceMode())+step+modes.length)%modes.length],true);});
// The button that starts the race the track screen offers first: the mode's Largar (paddock look), or Corrida única.
const raceStart=()=>$(paddockMenus()?RACE_STARTS[raceMode()]:menuMode==='historia'?'championshipStart':'singleRace');
// For the browser checks: a Modo História race on the chosen circuit outside the season (players race
// only the Old Stock championship in the story), and the career's cards read through (the wife paid).
window.interlagosHistoria={
 race:()=>{if(sessionStarted||loading)return false;menuMode='historia';championshipRace=null;pendingMode='single';beginRace(false,false,true);return true;},
 skipCards:()=>{const s=immersive?.state;for(let i=0;i<60&&s?.scene;i++){const card=s.sceneCard().type;if(card==='over')break;if(card==='expense')immersive.action('scene:pay');else immersive.action(i?'scene:next':'scene:skip');}return !s?.scene;}
};
$('singleRace').onclick=()=>{if(sessionStarted||menuMode==='historia')return;championshipRace=null;pendingMode='single';beginRace(false,false,menuMode==='historia');};
$('soloRace').onclick=()=>{if(sessionStarted||roomWanted)return;championshipRace=null;pendingMode='solo';beginRace(false,false,false);};
$('duelRace').onclick=()=>{if(sessionStarted||roomWanted)return;championshipRace=null;pendingMode='duel';beginRace(false,false,false);};
$('resume').onclick=resumeRace;
$('leaveRace').onclick=returnToMainMenu;
$('championshipStart').onclick=()=>{if(!roomWanted)startChampionshipRound();};
$('championshipTableButton').onclick=()=>championshipDialog.open(championshipFor());
// The calendar tabs (championship-board.js draws them): click, or the arrows between them.
function showChampionshipCalendar(id,focus=false){
 if(loading||sessionStarted)return;championshipView=championshipCalendar(id);try{pilotStorage()?.setItem(CHAMPIONSHIP_VIEW_KEY,championshipView);}catch{}
 renderTracks();if(focus)$(`championshipTab-${championshipView}`)?.focus();
}
$('championshipTabs').onclick=e=>{const tab=e.target.closest('[data-championship-calendar]');if(tab)showChampionshipCalendar(tab.dataset.championshipCalendar);};
$('championshipTabs').onkeydown=e=>{
 const ids=calendarsFor(menuMode),i=ids.indexOf(championshipFor().calendar),go={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:ids.length-1}[e.key];
 if(go===undefined)return;e.preventDefault();e.stopPropagation();showChampionshipCalendar(ids[(go+ids.length)%ids.length],true);
};
// Erasing a championship under way takes a second click.
// In Modo História it starts the whole story over: the season and the career (wallet, bars, challenges).
$('championshipReset').onclick=()=>{const b=$('championshipReset'),story=menuMode==='historia';if(b.dataset.armed){championshipFor().reset();if(story)resetStoryCareer();delete b.dataset.armed;renderTracks();return;}b.dataset.armed='1';b.textContent=story?'Apagar a carreira e os pontos? Clique de novo':'Apagar pontos? Clique de novo';setTimeout(()=>{delete b.dataset.armed;b.textContent=menuMode==='historia'?'Recomeçar história':'Recomeçar campeonato';},4000);};
$('restartRace').onclick=()=>{if(!roomWanted)beginRace(true);};
$('settingsRestart').onclick=()=>{if(roomWanted)return;$('settings').close();beginRace(true);};
$('tour').onclick=()=>{if(roomWanted)return;$('settings').close();beginRace(true,true,false);};$('menuButton').onclick=openSettings;$('camera').onchange=e=>setCameraMode(e.target.value,true);$('livery').onchange=async e=>{preferences.update({livery:e.target.value});if(!ready||!sessionStarted||raceCar!=='99'||raceModel==='fusca')return;try{await setLivery(e.target.value);}catch(err){status('Não foi possível carregar a pintura. Tente novamente.');console.error(err);}};
// Keep the car and audio session; release the previous circuit before loading another.
function clearCircuit(){
 explosions=null;circuitExtras=[];farMerges=[];enclosure=null;futebol?.dispose();futebol=null;fallView.stop(camera);
 if(arenaMode)mobile?.setHandbrakeHold(false);arenaMode?.dispose();arenaMode=null;arenaScene=null;document.body.classList.remove('arena-mode');if(car)car.world=null;
 action.reset();actionNotice.update(0,null,false);intro.stop();const retired=[];
 if(pitstop){pitstop.reset();pitstop.panel.remove();pitstop.hud.remove();pitstop.walkHud.remove();pitstop.markers.removeFromParent();retired.push(pitstop.markers);pitstop=null;}
 if(walker){walker.dispose();retired.push(walker.hero);walker=null;walkView=null;}
 camera.clearViewOffset();
 if(immersive){immersive.visual.restoreGraph();immersive.dispose();immersive.visual.damage.removeFromParent();retired.push(immersive.visual.damage);immersive=null;}
 if(car)delete car.condition;
 // The grid's reflection goes with its circuit; the cars wear the sky's map until the next one.
 carReflections?.clearCircuit();
 const keepRoots=new Set([carRoot,ghostCar.root,lineView.root,skidMarks?.mesh,tyreSmoke?.mesh,rain?.root,sun,sun.target,sky?.dome]);
 for(const root of [...scene.children])if(!root.isLight&&!keepRoots.has(root)){scene.remove(root);retired.push(root);}
 const collect=roots=>{const geometries=new Set(),materials=new Set(),textures=new Set();for(const root of roots)root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});return {geometries,materials,textures};};
 const keep=collect([...keepRoots]),old=collect(retired);
 for(const texture of carReflections?.textures()??[])keep.textures.add(texture);
 for(const root of retired)root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
 if(roadSurface){old.materials.add(roadSurface.material);for(const value of Object.values(roadSurface.material))if(value?.isTexture)old.textures.add(value);}
 for(const key of ['geometries','materials','textures'])for(const resource of old[key])if(!keep[key].has(resource))resource.dispose();
 for(const proxy of cameraObstacles)if(!old.geometries.has(proxy.geometry))proxy.geometry.dispose();cameraObstacles.length=0;
 landscapeField?.texture.dispose();landscapeField=null;landscape?.dispose();landscape=null;
 roadSurface=null;roadRails=null;roadCurbs=null;loadedCircuit=null;raceResults.mode=null;raceResults.snapshot=null;raceResults.root.hidden=true;renderer?.renderLists.dispose();
 if(skidMarks){skidMarks.breakTrails();skidMarks.count=skidMarks.total=skidMarks.cursor=0;skidMarks.geometry.setDrawRange(0,0);}
 tyreSmoke?.reset();lakeContact=null;treeField=null;accumulator=0;followInitialized=false;
 window.interlagos={ready:false,audioInfo:()=>carAudio.info()};
}
async function loadCircuit(){
 const reuse=ready&&loadedCircuit===circuit.id&&sceneryBuilt===graphics.values.scenery;
 loading=true;ready=false;if(window.interlagos)window.interlagos.ready=false;$('start').disabled=true;$('storyStart').disabled=true;$('singleRace').disabled=$('soloRace').disabled=$('duelRace').disabled=true;$('championshipStart').disabled=true;$('tour').disabled=true;$('livery').disabled=true;
 for(const button of document.querySelectorAll('[data-circuit],[data-variant]'))button.disabled=true;
 updateMenuLabels();
 try{
 if(reuse){if(activeLivery!==$('livery').value)await setLivery($('livery').value);await fuscaWanted();applyWeather();ready=true;window.interlagos.ready=true;$('skinButton').disabled=false;return true;}
 initializeRenderer();clearCircuit();showCircuitSelection();
 // The Gráficos tab's scenery level (graphics-settings.js): taken now, a change waits for the next start.
 const sceneryLevel=graphics.values.scenery,scenery=SCENERY_LEVELS[sceneryLevel];

 // Track files live in dados/, beside teste/ here and beside index.html once published (preparar_publicacao.py).
 data=circuit.id==='curvelo'?createCurveloData():circuit.arena?createArenaData():await (await fetch('../dados/'+(circuit.data??'pista.json'))).json();data.meta.id=circuit.id;data.meta.name=circuit.name;
 // Regular verges (track-verge.js): the ground beside the lap smoothed along it and the asphalt's width eased, before the
 // physics, the ground or anything set on it reads the track.
 const verges=circuit.arena?null:smoothVerges(data);
 // The circuit name sits in the top band of the map (#mapTitle); phones hide it and keep the whole canvas.
 projectMap=mapProjection(circuit.arena?floorOutline(0,6).map(([x,y])=>[0,x,y]):data.samples,260,300,touchDevice?0:40);$('map').height=projectMap.height??300;
 // The arena's car drives on a drift physics of its own (drift-physics.js); the circuits' cars are physics.js's own.
 car=circuit.arena?new DriftCar(data):new TestCar(data);ghostRecorder.reset();
 roadSurface=await createTrackSurface(renderer,data,{quality:graphics.values.materials});
 // Roots placed once and never moved: frozen below (perf-probe.js freezeStatic).
 const fixed=[],wide=[];
 // The circuit's ground and far relief, with the rest of its still scenery out of sight from inside an enclosed bowl.
 const world=[];
 if(!driver){driver=await createDriver(cockpit);carBody.add(driver.root);}
 terrainTextures??=await loadTerrainTextures(renderer);landscapeField=buildTrackField(data);let standTops=[];tyreSmoke.soft=null;smearRiders.length=0;releaseWakeCars();
 if(circuit.id==='curvelo'){
  const groundMaterial=terrainMaterial(terrainTextures,landscapeField,{mobile:scenery.mobile});groundMaterial.userData.terrain=true;
  standTops=flattenStatic(createCurveloScene(data,roadSurface,{groundMaterial,gravelMap:terrainTextures.gravel}));
  landscape=createLandscape({data,field:landscapeField,mobile:scenery.mobile,density:scenery.density,lod:scenery.lod,lean:sceneryLevel==='basico',style:'cerrado'});
 }else if(circuit.arena){
  // The Arena de Drift: the stadium (drift-arena-scene.js) round a flat floor; what stands on the floor is the layout's
  // (drift-arena-mode.js). No woods, no rails, no trackside: the stadium is all there is.
  arenaScene=await createArenaScene({renderer,roadSurface,textures:terrainTextures,mobile:scenery.mobile});
  scene.add(arenaScene.root);cameraObstacles.push(...arenaScene.obstacles);standTops=arenaScene.crowdSteps;
  landscape=arenaLandscape();
 }else if(data.scenery){
  // Cascavel, ECPA: terrain, asphalt and gantry from the open-data track file (open-circuit.js);
  // woods from the land-cover grid and the real building footprints (landscape.js).
  const groundFit=fitGround(data);
  // A real city round the lap (Floripa): its streets, sidewalks and squares are drawn on the ground from the city map.
  const cityMap=data.scenery.city?await loadCityMap(data,circuit.ground.replace(/[^/]*$/,'')):null;
  const open=await createOpenCircuit(data,roadSurface,{heights:groundFit.heights,textures:terrainTextures,field:landscapeField,groundUrl:circuit.ground,label:`${circuit.track} · AUTO-POBRE RACING`,mobile:scenery.mobile,city:cityMap});
  scene.add(open.root);fixed.push(open.root);wide.push(open.root);world.push(open.root);cameraObstacles.push(...open.obstacles);
  // The valley out to 22 km below a plateau circuit (Chapada dos Sonhos), from the same folder as its ground photo.
  const far=data.scenery.far?await createFarTerrain(data,circuit.ground.replace(/[^/]*$/,''),{stride:sceneryLevel==='basico'?2:1,heights:groundFit.heights}):null;if(far){scene.add(far.root);fixed.push(far.root);wide.push(far.root);world.push(far.root);}applyViewDistance();
  explosions=data.scenery.cliff?new Explosions(scene,{mobile:scenery.mobile}):null;
  // A coastal street circuit (Floripa): the sea at its level, the bridges round the decks the road runs on and the
  // city's landmarks, each with its own model.
  const groundAt=(x,y)=>groundHeight(data.terrain,groundFit.heights,x,y);
  if(data.meta.sea_level_m!=null)circuitExtras.push(createSea(data,{mobile:scenery.mobile}));
  if(data.scenery.bridges)circuitExtras.push(createFloripaBridges(data,{mobile:scenery.mobile,ground:groundAt}));
  if(data.scenery.landmarks?.some(m=>m.kind==='rodoviaria'))circuitExtras.push(createFloripaLandmarks(data,{mobile:scenery.mobile,ground:groundAt}));
  // São Paulo's Minhocão (minhocao-structures.js): the elevated's girders, pillars and ramps, the tunnel under Praça Roosevelt.
  if(data.scenery.minhocao)circuitExtras.push(createMinhocaoStructures(data,{mobile:scenery.mobile,ground:groundAt}));
  // Its landmarks (minhocao-landmarks.js: Copan, Itália, the ex-Hilton, Caetano de Campos, the Consolação church...),
  // before the landscape: the generic buildings that cut into them are trimmed back first.
  if(hasMinhocaoLandmarks(data))circuitExtras.push(createMinhocaoLandmarks(data,{mobile:scenery.mobile,ground:groundAt}));
  // Belo Horizonte's Pampulha (pedido #8): the Mineirão and the Mineirinho by the start, the Igrejinha on the lake shore.
  if(hasPampulhaEstadios(data))circuitExtras.push(createPampulhaEstadios(data,{mobile:scenery.mobile,ground:groundAt}));
  // On the Mineirão's floor, football Rocket League style (pampulha-futebol.js; user, 2026-10-19): a giant ball for the car,
  // an ordinary one for the pilot on foot, two giant goals and the score on the stadium's screens.
  if(hasPampulhaFutebol(data)){futebol=createPampulhaFutebol(data,{mobile:scenery.mobile,ground:groundAt,sound:(name,options)=>carAudio.effect(name,options)});circuitExtras.push(futebol);}
  if(hasPampulhaIgrejinha(data))circuitExtras.push(createPampulhaIgrejinha(data,{mobile:scenery.mobile,ground:groundAt}));
  // Round 2 of the Pampulha (pedido #8): the Parque Guanabara's rides, Niemeyer's other buildings, the shore's monuments and
  // viewpoints, the dam and its spillway, the zoo and the Parque Ecológico.
  if(hasPampulhaGuanabara(data))circuitExtras.push(createPampulhaGuanabara(data,{mobile:scenery.mobile,ground:groundAt}));
  if(hasPampulhaNiemeyer(data))circuitExtras.push(createPampulhaNiemeyer(data,{mobile:scenery.mobile,ground:groundAt}));
  if(hasPampulhaOrla(data))circuitExtras.push(createPampulhaOrla(data,{mobile:scenery.mobile,ground:groundAt}));
  if(hasPampulhaBarragem(data))circuitExtras.push(createPampulhaBarragem(data,{mobile:scenery.mobile,ground:groundAt}));
  if(hasPampulhaParques(data))circuitExtras.push(createPampulhaParques(data,{mobile:scenery.mobile,ground:groundAt}));
  // The bridge at "Orla · Zoológico" and the Ressaca and Sarandi creeks running under it into the lake (pampulha-pontes.js).
  if(hasPampulhaPontes(data))circuitExtras.push(createPampulhaPontes(data,{mobile:scenery.mobile,ground:groundAt}));
  // Round 3 of the Pampulha: the fork by the Igrejinha (data.branches): the avenue's asphalt and lines past the Parque
  // Guanabara, the attenuators on the noses and the sign over the road before it (branch-scenery.js; its walls are the
  // lap's, street-walls.js).
  if(hasBranches(data))circuitExtras.push(createBranchScenery(data,roadSurface,{textures:terrainTextures,ground:groundAt,mobile:scenery.mobile}));
  // The rest of an autódromo's asphalt, closed to the race (data.closed_roads: Velocitta's original turns 3 and 4 and last
  // corner, the links of its short circuits): drawn on the ground with its lines and kerbs, barriers across its mouths.
  if(hasClosedRoads(data))circuitExtras.push(createClosedRoads(data,roadSurface,{textures:terrainTextures,ground:groundAt,mobile:scenery.mobile}));
  // The lake's capybaras (a family at one bank per race) and now and then the fat caiman (pampulha-fauna.js); they
  // watch the cars passing and shy from the pilot on foot.
  if(hasPampulhaFauna(data))circuitExtras.push(createPampulhaFauna(data,{mobile:scenery.mobile,ground:groundAt,cars:()=>[carRoot,...(immersive?.visual?.rivals??[])],walker:()=>walker?.active?walker.hero:null}));
  // A real city closed for the race (data.scenery.city, Floripa): the paint on its streets and on the lap, the side
  // streets blocked where they meet the walls (with the traffic held behind and the parked cars), the poles, wires,
  // traffic lights, bus stops and street signs, and the seafront promenades. The streets themselves are the ground's
  // (landscape.js LAND_CITY, from the city map).
  if(cityMap){const city={mobile:scenery.mobile,lean:sceneryLevel==='basico',ground:groundAt,map:cityMap};circuitExtras.push(...await Promise.all([createCityBuildings(data,city),createCityStreets(data,city),createStreetClosures(data,city),createCityFurniture(data,city),createBeiraMar(data,city),createCityLife(data,city),createCityTraffic(data,city),createCityRace(data,city)]));}
  for(const extra of circuitExtras){scene.add(extra.root);if(extra.obstacles)cameraObstacles.push(...extra.obstacles);}
  landscape=createLandscape({data,field:landscapeField,ground:(x,y)=>groundHeight(data.terrain,groundFit.heights,x,y),cover:data.scenery.cover,buildings:data.scenery.city?.buildings?null:data.scenery.buildings,city:cityMap,cityAngle:data.meta.city_angle??Math.PI/2,mobile:scenery.mobile,density:scenery.density,lod:scenery.lod,lean:sceneryLevel==='basico',style:'urban'});
  // The trees the land cover put where a landmark's yard or apron is (floripa-landmarks.js) go.
  for(const extra of circuitExtras)if(extra.clearings)landscape.clearAround(extra.clearings);
  // An extra's own woods (pampulha-parques.js: the Parque Ecológico's) grow as the landscape's trees, in its blocks.
  for(const extra of circuitExtras)if(extra.trees?.length)landscape.plant(extra.trees);
  const stands=createGrandstands(data,terrainTextures,(x,y)=>groundHeight(data.terrain,groundFit.heights,x,y));scene.add(stands.root);fixed.push(stands.root);cameraObstacles.push(...stands.obstacles);standTops=stands.rows;
  // Out in a city open to roam the car stands on the ground as drawn (physics.js terrain).
  if(data.meta.roam)car.heights=groundFit.heights;
  // A city's own sidewalks fill with people behind the fences (city-crowd.js): standing fans, with the stands' in one draw.
  if(cityMap)standTops=[...standTops,...citySpectators(data,{map:cityMap,ground:groundAt,lean:sceneryLevel==='basico',mobile:scenery.mobile})];
  // An extra's own rows of fans (temporary stands, balconies) sit with them, in the same draw.
  for(const extra of circuitExtras)if(extra.standTops)standTops=[...standTops,...extra.standTops];
  Object.assign(landscape.stats,{ground:groundFit.stats,stands:stands.stats,circuit:open.stats,far:far?.stats,extras:Object.fromEntries(circuitExtras.map(e=>[e.root.name,e.stats]))});
 }else{
  const track=await loader.loadAsync('../exports/interlagos_pista.glb');let ortho=null;
  // The orthophoto stays as land-cover data and far-distance colour; close up it becomes grass, woods, paving and water.
  // The ground is the one the car drives on, lowered wherever it would rise through asphalt, kerbs, pit floors or stands.
  const groundFit=fitGround(data);
  track.scene.traverse(o=>{if(!o.isMesh||o.material?.name!=='GeoSampa_Ortofoto_2020')return;const photo=o.material;ortho=readOrtho(photo.map,o.geometry);if(!applyGroundHeights(o.geometry,data,groundFit.heights))console.warn('Terreno do GLB fora da grade de pista.json; relevo sem ajuste.');o.material=terrainMaterial(terrainTextures,landscapeField,{ortho:photo.map,mobile:scenery.mobile});o.material.userData.terrain=true;photo.map=null;photo.dispose();});
  // Lakes come out of the orthophoto: their beds, already dug in the physics ground, are dug into the
  // visible terrain too, before flattenStatic copies it into the static batches.
  landscape=createLandscape({data,field:landscapeField,ortho,ground:(x,y)=>groundHeight(data.terrain,groundFit.heights,x,y),mobile:scenery.mobile,density:scenery.density,lod:scenery.lod,lean:sceneryLevel==='basico'});
  // Tyres throw dirt only off the photo's paving and the painted run-off: those smoke like asphalt.
  if(ortho)tyreSmoke.soft=looseGround(landscapeField,ortho);
  if(landscape.digLakeBeds(groundFit.heights))track.scene.traverse(o=>{if(o.material?.userData.terrain)applyGroundHeights(o.geometry,data,groundFit.heights);});
  if(landscape.stats.water){lakeContact=new LakeContact({water:landscape.water,mobile:scenery.mobile,onSound:(name,options)=>carAudio.effect(name,options)});scene.add(lakeContact.mesh);}
  const legacyStands=flattenStatic(track.scene).length;
  // Its asphalt and edge lines as the GLB drew them (1.5 cm under the plane the car drives on, the lines 15 to 30 cm in).
  const lap=lapRoad(data,roadSurface,terrainTextures,{drop:.015,edge:[.30,.15]});scene.add(lap.root);fixed.push(lap.root);
  const stands=createGrandstands(data,terrainTextures,(x,y)=>groundHeight(data.terrain,groundFit.heights,x,y));scene.add(stands.root);fixed.push(stands.root);cameraObstacles.push(...stands.obstacles);standTops=stands.rows;
  Object.assign(landscape.stats,{ground:groundFit.stats,stands:stands.stats,legacyStands});
 }
 scene.add(landscape.root);
 const crowd=createCrowd(standTops,{mobile:scenery.mobile,lean:sceneryLevel==='basico'});standsCrowd=crowd;scene.add(crowd.root);fixed.push(crowd.root);landscape.stats.fans=crowd.count;
 // The fans standing on a city's sidewalks are in the way of a car out in the city (meta.roam).
 if(data.meta.roam)landscape.stats.fanSolids=addRoamSolids(data,crowd.standing);await ensureCarModel();await fuscaWanted();
 if(circuit.arena){roadRails={root:new THREE.Group(),rails:null,setQuality(){}};roadCurbs=new THREE.Group();roadCurbs.userData.setQuality=()=>{};}
 else{roadRails=createGuardrails(data,{quality:graphics.values.materials});scene.add(roadRails.root);cameraObstacles.push(roadRails.rails);landscape.stats.barrier=roadRails.stats;landscape.stats.verges=verges;
 roadCurbs=createCurbs(data,{quality:graphics.values.materials});scene.add(roadCurbs);}
 // Surveyed pit lane: entry after the Cafe, garages, exit around the S do Senna.
 let pitLayout=null;rivalGarages=null;if(data.pit){const pitLaneScene=createInterlagosPit(data,roadSurface,terrainTextures,circuit.track?{label:`${circuit.track} · BOX 99`,title:circuit.boxTitle,name:`Box 99 de ${circuit.name}`,track:circuit.track}:undefined);scene.add(pitLaneScene.root);fixed.push(pitLaneScene.root);cameraObstacles.push(...pitLaneScene.obstacles);pitLayout=pitLaneScene.box;rivalGarages=pitLaneScene.garages;}
 // Curvelo: the same garage row and Box 99, on the infield behind its service lane.
 else if(circuit.id==='curvelo'){const pitScene=createCurveloPit(data,terrainTextures);scene.add(pitScene.root);fixed.push(pitScene.root);cameraObstacles.push(...pitScene.obstacles);pitLayout=pitScene.box;rivalGarages=pitScene.garages;}
 // Floodlight masts along the pit wall, lit by the weather after dark (floodlights.js).
 floods=circuit.arena?arenaScene.floods:createFloodlights(data);if(floods)scene.add(floods.root);
 recordTvs=pitLayout?.showRecords?pitLayout:null;recordTvsKey='';recordTvsAt=0;
 const branding=circuit.arena?{root:new THREE.Group(),oldStock:await oldStockPicture()}:await createTrackBranding(data);scene.add(branding.root);
 // Race-day dressing: sponsor banners on the rails, marshal posts and TV towers (trackside.js).
 trackside=circuit.arena?{root:new THREE.Group(),towers:arenaScene.towers(data),clearings:[],stats:{}}:createTrackside(data);scene.add(trackside.root);landscape.clearAround(trackside.clearings);landscape.stats.trackside=trackside.stats;
 // Flags, corner rods and brake boards: built at every level (before the compile below), shown per Sensação de velocidade.
 // A pole flicking past is heard from the riding cameras only, muffled inside the car.
 flags=circuit.arena?{root:new THREE.Group(),clearings:[],stats:{},setQuality(){},update(){}}:createFlagField(data,{level:graphics.values.speedEffects,onWhoosh:e=>{if(isInside()||mode==='chase'||mode==='close')carAudio.effect('passBy',{pan:e.pan,strength:e.strength*(isInside()?.55:1)});}});scene.add(flags.root);landscape.clearAround(flags.clearings);landscape.stats.flags=flags.stats;
 // What is placed once leaves the per-frame matrix work: three.js recomputed every object's matrix every frame (pit lane,
 // stands, crowd, rails, kerbs, boards, masts, trackside; the people in them stay live).
 if(!circuit.arena)for(const root of [...fixed,roadRails?.root,roadCurbs,floods?.root,branding.root,trackside.root])freezeStatic(root);
 // Broadcast view: the towers and low verge cameras film the car with a long lens.
 const tvProbe=new TestCar(data),tvObstacles=[...cameraObstacles];branding.root.traverse(o=>{if(o.isMesh)tvObstacles.push(o);});
 tvCamera=new TvCamera(data,trackside.towers,(x,y,i)=>{tvProbe.index=i;return tvProbe.sample(x,y).z;},tvObstacles);
 landscape.clearAround(tvCamera.cameras.filter(c=>!c.tower).map(c=>({x:c.position.x,y:-c.position.z,r:3.5})));
 // The story's podium (immersive-visuals.js, circuits.js podium) stands in a clearing: on a wooded plateau (the Chapada)
 // the trees round it go, before they become posts.
 {const [s,d]=circuit.podium??[35,-32],p=podiumPoint(data,s,d);landscape.clearAround([{x:p.x,y:-p.z,r:24}]);}
 // The trees left standing are posts the Opala can hit.
 treeField=new TreeField(landscape.trunks(),{mobile:scenery.mobile});scene.add(treeField.points);car.posts=treeField;
 // The woods, houses and horizon are placed once too (the lake's wave patch under the car stays live). Past FAR_MERGE_GAP
 // metres (beyond the probe's faces and the sun's box) the pieces of the walls, fences, banners, ground and houses within a
 // square are one draw each (perf-probe.js farMerge: the far shore across a lake was hundreds of draws); then every wide
 // still piece (blocks of trees and houses, the ground, the walls, the banners) is culled by its own box, not by a sphere
 // as high as it is wide (cullBoxes): the same picture, far fewer blocks in the shadow map and the probe's faces.
 if(!circuit.arena){
  freezeStatic(landscape.root);
  const within=(root,name)=>root?.getObjectByName(name)?.children??[],named=(root,name)=>root?.children.filter(o=>o.name===name)??[];
  for(const [pieces,cell] of [[within(roadRails?.root,'Muro_concreto_trechos'),1200],[within(roadRails?.root,'Alambrado_trechos'),1800],[within(roadRails?.root,'Postes_alambrado_trechos'),1800],
   [named(trackside.root,'Faixas_nos_guardrails'),1800],[wide.flatMap(root=>within(root,'Terreno_ANADEM')),1200],
   [within(landscape.root,'Casas'),1800],[within(landscape.root,'Casas_laje'),1800],[within(landscape.root,'Predios'),2700],[within(landscape.root,'Predios_redondos'),2700],
   [within(landscape.root,'Horizonte_casas'),4400],[within(landscape.root,'Horizonte_cidade'),4500]])
   if(pieces.length>1)farMerges.push(farMerge(pieces,{cell,gap:FAR_MERGE_GAP}));
  for(const root of [landscape.root,...wide,roadRails?.root,trackside.root])cullBoxes(root);
 }
 speedFx=createSpeedEffects({smoke:tyreSmoke,level:graphics.values.speedEffects});scene.add(speedFx.root);speedFx.motes.setSun(sunDirection);
 // An enclosed bowl's (enclosure above): the circuit's still scenery, whole roots and, for the view through its mouth,
 // every piece drawn of them.
 {const shut=circuitExtras.filter(e=>e.encloses);if(shut.length){
  // (An extra drawn inside the bowl, enclosed: the football on its floor, stays.)
  const roots=[...world,...fixed,landscape.root,crowd.root,roadRails.root,roadCurbs,floods?.root,branding.root,trackside.root,flags.root,treeField.points,...circuitExtras.filter(e=>!e.encloses&&!e.enclosed).map(e=>e.root)];
  const still=roots.filter((o,i)=>o&&roots.indexOf(o)===i),parts=[];for(const root of still)root.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine||o.isSprite)parts.push(o);});
  enclosure={on:true,shut,renders:0,portals:0,world:still,parts};}}
 // Over Minas Gerais at night, now and then, a flying saucer crosses the sky and goes (flying-saucer.js; user, 2026-10-20).
 // Its clock runs while the race is on; it moves on the sky, never shut out of a bowl's view (added after the enclosure).
 if(hasFlyingSaucer(circuit)){const saucer=createFlyingSaucer({mobile:scenery.mobile,sound:(name,options)=>carAudio.effect(name,options),
  racing:()=>sessionStarted&&!intro.active&&!gridPreview()&&(immersive?.active?immersive.state.phase==='race':!immersive?.freeCountdown&&!immersive?.freeResultReady),
  raceSeconds:()=>(immersive?.laps??3)*circuit.length/40,inside:()=>mode==='cockpit'});
  circuitExtras.push(saucer);scene.add(saucer.root);}
 restBodyPose();
 carLivery.clear();
 immersive=new ImmersiveMode({scene,carRoot,car,data,driver,rivalTemplate:model,skidMarks,layout:pitLayout,obstacles:cameraObstacles,setView:setCameraMode,getView:()=>mode,playerView:()=>preferences.values.camera,resetVehicle:()=>reset(),releaseMouse:()=>{keys.clear();mobile?.clear();if(document.pointerLockElement)document.exitPointerLock();},onNormal:()=>{storyRound=null;chooseImmersive(false);reset();menu(true);},
  // The start always finds the handbrake down: A (Space) pressed to skip the opening, in the 3-2-1 or in the
  // story paddock pulled it, and the car would sit there at the green light.
  onGo:()=>mobile?.setHandbrake(false)});
 immersive.onMainMenu=returnToMainMenu;
 // The end of the story (story-career.js): a new one starts the Old Stock season again from round 1.
 immersive.onNewStory=()=>{championshipFor('historia').reset();storyRound=null;returnToMainMenu();startChampionshipRound('historia');};
 // The ghost's shell is the same for every paint and car colour: built once, from the first model (at
 // rest, as the rivals were just cloned), with the distant rivals' profile beyond 45 m.
 if(!ghostCar.has('opala'))ghostCar.build(model,immersive.visual.farProxy(0xffffff).geometry,'opala');
 // In a Modo História championship the story's own restarts lead to the next round (after this frame).
 {const storyStart=immersive.start.bind(immersive);immersive.start=()=>{if(storyRound){queueMicrotask(()=>{if(storyRound)nextStoryRound();});return;}storyStart();};}immersive.laps=raceLaps(circuit.id,chosenLaps());immersive.field.ace=preferences.values.aceKoyzinho;immersive.field.level=preferences.values.aiLevel;immersive.field.retirements=preferences.values.retirements;immersive.visual.viewCamera=camera;immersive.visual.setCarDetail(CAR_DETAIL[graphics.values.carDetail]);
 // The weather on the new track, the new car and the new field, before their programs compile below.
 applyWeather();
 // Sessions started from the menu open with the cinematic intro (the 3-2-1 waits for it).
 const beginCountdown=immersive.beginCountdown.bind(immersive),startStory=immersive.start.bind(immersive);
 immersive.beginCountdown=()=>{beginCountdown();if(paused&&!automatic&&introWanted()){immersive.state.sounds=immersive.state.sounds.filter(sound=>sound.name!=='countdown');intro.play('race',introContext);}};
 immersive.start=()=>{startStory();if(paused&&introWanted())intro.play('story',introContext);};
 const disableStory=immersive.disable.bind(immersive);immersive.disable=()=>{intro.stop();disableStory();};
 multiplayer?.attach(immersive);
 // Box 99: Curvelo's service lane, or the surveyed garage at Interlagos.
 if(circuit.id==='curvelo'||pitLayout)pitstop=new PitStop({scene,car,carRoot,driver,mode:immersive,data,roadSurface,layout:pitLayout,obstacles:cameraObstacles,openings,onOpen:()=>{automatic=false;keys.clear();mobile?.clear();mobile?.setHandbrake(false);setCameraMode('chase');if(document.pointerLockElement)document.exitPointerLock();},onClose:()=>{keys.clear();mobile?.clear();followInitialized=false;},onSettings:openSettings,
  outfit:()=>{const look=pilotLook();return look&&pilotOutfit({look,entry:raceCar==='99'&&raceModel!=='fusca'?null:carEntry(raceCar,raceModel)});}});
 // Out of the car anywhere (free-walk.js), among the Box 99's rooms and people where the circuit has them (and never out
 // into Interlagos' lakes or Pampulha's, sea-water.js lakeWater); he wears
 // the clothes of the car he races (or of his story stage).
 walker=new FreeWalk({scene,car,driver,openings,layout:pitstop?.layout??null,obstacles:cameraObstacles,water:landscape.stats.water?(x,y)=>landscape.water.at(x,y):lakeWater(data),
  outfit:()=>pilotOutfit({career:immersive.active?immersive.state.profile.career:null,entry:raceCar==='99'&&raceModel!=='fusca'?null:carEntry(raceCar,raceModel),look:pilotLook()}),
  title:()=>circuit.arena?'A PÉ · NA ARENA':reconLap||immersive.lineup?.length===0?'A PÉ · NA PISTA':'A PÉ · A CORRIDA CONTINUA',
  emit:(name,options)=>carAudio.effect(name,options),
  onOut:()=>{walkView=mode;setCameraMode('chase');keys.clear();mobile?.clear();if(!touchDevice&&!pointerLocked&&!lockUnavailable)try{$('view').requestPointerLock()?.catch?.(()=>{});}catch{}},
  onIn:()=>{keys.clear();mobile?.clear();setCameraMode(walkView??preferences.values.camera);walkView=null;followInitialized=false;},
  // The selfie (selfie.js): the circuit and the pilot's name in the photo's signature; the captured mouse let go to click the photo's buttons
  // (no menu: mouseFreed) and taken again to frame another.
  selfie:{label:()=>circuit.name,pilot:()=>immersive?.pilotName||typedPilot(),freeMouse:()=>{if(document.pointerLockElement!==$('view'))return;mouseFreed=true;document.exitPointerLock();},
   lockMouse:()=>{if(!touchDevice&&!pointerLocked&&!lockUnavailable)try{$('view').requestPointerLock()?.catch?.(()=>{});}catch{}}},
  // On the Mineirão's floor the balls are his to kick (pampulha-futebol.js).
  play:futebol?.game??null,
  // The Box 99's café: the Tia's menu, paid from the team's money (pitstop.js: Modo Corrida's Verba da equipe, the
  // story's cash).
  cafe:pitstop?.cafeSeat?{seat:pitstop.cafeSeat,pay:cost=>pitstop.spend(cost),wallet:()=>pitstop.wallet}:null,
  // At a room's meeting (meet), V opens the Visual screen to change clothes there.
  wardrobe:()=>openVisual('cafe')});
 futebol?.attach(walker);
 syncDamage(true);
 if(circuit.arena){
  arenaMode=new ArenaMode({scene,view:$('view'),textures:terrainTextures,mobile:scenery.mobile,storage:pilotStorage(),stadium:arenaScene,pilot:()=>immersive?.pilotName||typedPilot(),
   sound:(name,options)=>carAudio.effect(name,options),onPause:arenaPause});
  arenaMode.attach(car);document.body.classList.add('arena-mode');mobile?.setHandbrakeHold(true);
 }
 landscape.setRealisticWater(graphics.values.water==='realista');
 const kleber=immersive.visual.rivals.find(o=>o.userData.entry.number==='70');
 // Car 70's Old Stock ads sit on its doors, bent onto the body.
 oldStockMaterial=finishMaterial(new THREE.MeshPhysicalMaterial({name:'OldStock_portas',map:branding.oldStock,roughness:.35,clearcoat:.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 for(const decal of immersive.visual.doorStickers(kleber,oldStockMaterial))decal.name='OldStock_no_Opala70';
 showRoster();
 // The rivals' headlights and tail lamps light the asphalt, the kerbs, the rails and the ground (headlights.js).
 scene.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())if(m&&(/^(Asfalto_PBR_circuito_v5|Zebra_pintada|Aco_galvanizado)$/.test(m.name)||m.userData?.terrain))lampPatch(m);});
 // Compile the new programs while the loading label is still shown, instead of
 // freezing the first race frame (D3D shader compilation is slow on Windows).
 carShadow.compile(renderer,[carRoot,...immersive.visual.rivals.slice(0,1)]);
 // The cars wear the race's reflections while they compile (a probe's map means other programs); the
 // circuit seen from its grid (Pista) is drawn at the first race frame, once the track shows (car-reflections.js).
 carReflections.useRaceMap();await carReflections.compile(scene);
 // The cabin's batched copy for the outside views (cockpit.js outsideBatch) is built now, so its programs compile here.
 updateCar(1);updateCamera(1);cockpit.outsideBatch();landscape.revealWaves(true);try{await cinematic.compile(scene,camera);await landscape.compileWater(renderer,scene,camera);}catch(err){console.warn(err);}finally{landscape.revealWaves(false);}
 ready=true;loadedCircuit=circuit.id;sceneryBuilt=sceneryLevel;mirrorPrograms=null;setCameraMode(preferences.values.camera);$('skinButton').disabled=false;updateCar(1);cockpit.update(car,0);driver.update(car,0);updateCamera(1);cameraHint();hud();$('start').disabled=false;
 window.interlagos={ready:true,circuit:circuit.id,car,explosionInfo:()=>explosions?.info()??null,garagesInfo:()=>rivalGarages?.info()??null,peek:(from,to)=>{peekView=from?[from,to]:null;return true;},pitStops:()=>immersive?.field.pitStops().map(({car,...s})=>s)??[],fallInfo:()=>({timeScale:fallView.timeScale,active:fallView.active,shot:!!fallView.shot,sight:fallInSight(fallView,car,camera)}),renderAhead,telemetry:()=>car.telemetry(),setLivery,reset:()=>reset(),reposition:index=>{car.reset(index);driver.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();cockpit.resetPhone();updateCar(1);updateCamera(1);},setTour:value=>{if(immersive.active)return;automatic=value;menu(false);},
  immersiveInfo:()=>immersive.info(),pitInfo:()=>pitstop?.info()??null,walkInfo:()=>walker?.info()??null,walker:()=>walker,futebolInfo:()=>futebol?.info()??null,futebol:()=>futebol,
  audioInfo:()=>carAudio.info(),mobileInfo:()=>({enabled:touchDevice,steering:mobile?.steering??0,throttle:mobile?.throttle??0,brake:mobile?.brake??0,pressed:[...(mobile?.pressed??[])],pixelRatio:renderer.getPixelRatio()}),gamepadInfo:()=>({connected:gamepad.connected,name:gamepad.connected?gamepad.name:'',steering:gamepad.steering,throttle:gamepad.throttle,brake:gamepad.brake,held:[...gamepad.held.keys()],pressing:[...gamepad.held.values()],place:padPlace(),rumble:gamepad.rumble,curve:gamepad.curve,gear:car?.gear??null,autoHold:autoShift.gear}),
  cinematicInfo:()=>({...cinematic.info(),adaptation:cinematic.adaptation()}),tvInfo:()=>tvCamera.info(),tvCamera:()=>tvCamera,introInfo:()=>intro.info(),skipIntro:()=>intro.stop(),setCinematic:level=>cinematic.setLevel(level),cinematicLook:patch=>Object.assign(cinematic.look,patch||{}),
  skidInfo:()=>skidMarks.info(),smokeInfo:()=>tyreSmoke.info(),sceneryInfo:()=>({...landscape.stats,sky:sky.info()}),waterInfo:()=>landscape.waterInfo(),lakeInfo:()=>lakeContact?.info()??null,treeInfo:()=>treeField?.info()??null,tumbleInfo,waterAt:(x,y)=>landscape.water.at(x,y),
  structureInfo:()=>({revision:'v04_fechamentos',parts:carStructure.children.length,visible:carStructure.visible}),
  openingsInfo:()=>openings.info(),holdOpening:(name,on=true)=>openings.hold(name,'teste',on),
  // materials: those shown on the rival (whatever its distance detail), numbers: its own number decals.
  rivalParts:()=>{const rival=immersive.visual.rivals[0],names=[],shown=new Set();let meshes=0;rival?.traverse(o=>{names.push(o.name);if(!o.isMesh)return;meshes++;let seen=true;for(let q=o;q&&q!==rival;q=q.parent)if(!q.visible&&q!==rival.userData.detail)seen=false;if(seen)for(const m of [o.material].flat())shown.add(m.name);});return {motor:names.includes('Motor_CONJUNTO'),tanque:names.includes('Tanque_combustivel_CONJUNTO'),meshes,materials:[...shown],numbers:names.filter(n=>n.startsWith('Numero_')).length};},
  driverInfo:()=>driver.info(),
  // The ghost (G): the lap it replays, where it is drawn and how see-through, and the lap being recorded.
  ghostInfo:()=>{const lap=currentGhost();return {enabled:preferences.values.ghost,lap:lap?{time:lap.time,samples:lap.n,pilot:lap.pilot,brakes:lap.brakes.length,brakesInferred:lap.brakesInferred}:null,onTrack:ghostOnTrack,visible:ghostCar.root.visible,opacity:ghostCar.opacity,braking:ghostCar.braking,
   position:ghostCar.body.position.toArray(),pose:{...ghostPose},plate:ghostCar.plateText,plateAt:ghostCar.plate.position.toArray(),triangles:ghostCar.triangles,savedAt:ghostSavedAt,gap:$('ghostGap').textContent,time:$('ghostTime').textContent,
   recorder:{lapStart:ghostRecorder.lapStart,clean:ghostRecorder.clean,samples:ghostRecorder.values.length/7,progress:ghostRecorder.progress,brakes:ghostRecorder.brakes.length,braking:ghostRecorder.braking}};},
  // The driving line (O): its mode, the line laid for the car (lap times of its own model), and the stretch ahead.
  drivingLineInfo:()=>({mode:preferences.values.drivingLine,...lineView.info()}),
  // The rivals' levels of detail (immersive-visuals.js detailLevel): how many show each; lod {near, far} sets them (a test).
  rivalLod:lod=>{const v=immersive.visual;if(lod)v.setCarDetail(lod);const shown={detailed:0,light:0,distant:0};for(const o of v.rivals){if(!o.visible)continue;const u=o.userData;shown[u.far?.visible?'distant':u.mid?.visible?'light':'detailed']++;}return {...v.lod,...shown};},
  rivalDrivers:()=>immersive.visual.rivals.map(o=>o.userData.driver?{...o.userData.driver.info(),shown:o.userData.detail.visible&&o.visible}:null),
  watchInfo:()=>{const r=watchedRival();return {watched,number:r?.entry.number??null,camera:camera.position.toArray(),target:r?r.obj.position.toArray():carRoot.position.toArray(),rpm:(r?.car??car).rpm};},
  actionInfo:()=>action.info(),
  surfaceInfo:()=>({...roadSurface.stats,material:roadSurface.material.name,drawCalls:renderer.info.render.calls}),
  // Interior cameras ride on the sprung body, so report them in its frame.
  cockpitInfo:()=>({...cockpit.info(),eyeLocal:carBody.worldToLocal(camera.position.clone()).toArray(),fov:camera.fov,externalVisible:model.visible,
   renderedFrame,mirrorFrame,mirrorEyeLocal:carBody.worldToLocal(cockpit.rearCamera.position.clone()).toArray(),lidMirror:cockpit.mirrorMaterial.map!==cockpit.mirrorTarget.texture,sideMirrors:(fuscaBody.active?fuscaMirrors:sideMirrors).info(),fusca:fuscaBody.info()?.cabin??null}),
  viewControls:()=>({pointerLocked,lockPending,lockUnavailable,yaw:headLook.yaw,pitch:headLook.pitch,centering:cameraReturn.active,recalled:cameraReturn.recalled,movingSince:cameraReturn.movingSince,lastInput:cameraReturn.lastInput,delayMs:cameraReturn.delayMs,
   lookBack:{held:lookBack.held,allowed:lookBackAllowed(),amount:lookBack.amount,side:lookBack.side,viewYaw:headView.yaw,viewPitch:headView.pitch,eyeShift:[...twist]},photo:cockpitView&&structuredClone(cockpitView)}),
  // Interior photography: a fixed cockpit-local pose {eye:[x,y,z],yaw,pitch,fov,hideDriver,roll?} replaces the
  // head look (no clamps, shake or speed widening) while in the cockpit camera; null returns to play.
  setCockpitView:view=>{
   if(view){
    const eye=view.eye??cockpit.eye.toArray(),number=value=>typeof value==='number'&&Number.isFinite(value);
    if(!Array.isArray(eye)||eye.length!==3||!eye.every(number)||![view.yaw??0,view.pitch??0,view.roll??0,view.fov??74].every(number))throw new Error('setCockpitView: eye [x,y,z], yaw, pitch e fov numéricos');
    cockpitView={eye:[...eye],yaw:view.yaw??0,pitch:view.pitch??0,roll:view.roll??0,fov:clamp(view.fov??74,5,150),hideDriver:!!view.hideDriver};photoEye.fromArray(eye);if(view.eye)photoEye.y+=cockpit.drop(); // poses follow the cabin
   }else cockpitView=null;
   // The driver's group also carries the wheel, levers and pedals he works: only his body is hidden.
   const hide=!!cockpitView?.hideDriver;if(hide!==photoHidDriver){const controls=new Set([cockpit.wheel,...cockpit.controls.parts]);for(const part of driver.root.children)if(!controls.has(part))part.visible=!hide;photoHidDriver=hide;}
   if(!cockpitView){camera.fov=baseFov(mode,camera.aspect);camera.updateProjectionMatrix();}
   lookBack.reset();return cockpitView&&structuredClone(cockpitView);
  },
  cameraSnapshot:()=>({position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),fov:camera.fov,roll:Math.asin(clamp(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).y,-1,1)),target:orbit.target.toArray(),car:carRoot.position.toArray(),distance:camera.position.distanceTo(orbit.target),ground:car.sample(camera.position.x,-camera.position.z).z,
    // The lens with no speed widening (camera-rig.js baseFov), the follow frame drawn and where the player's car is on screen.
    baseFov:baseFov(gridPreview()?'grid':mode==='orbit'?orbitSpeedFov||'orbit':mode,camera.aspect),aspect:camera.aspect,frame:gridPreview()?'grid':FOLLOW_FRAMES.includes(mode)?mode:null,carScreen:carOnScreen(),rig:{...rig.out}}),
  wheelSnapshot:()=>{carRoot.updateMatrixWorld(true);const inverse=carRoot.getWorldQuaternion(new THREE.Quaternion()).invert();return wheels.map(w=>{const axle=new THREE.Vector3(0,0,1).applyQuaternion(w.obj.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(inverse);return {name:w.obj.name,front:w.front,angle:Math.atan2(axle.x,axle.z),axle:axle.toArray()};});},
  get state(){return {paused,resuming:resumeLeft>0,pausedRacing,racingNow:stillRacing(),walkRace:walkRace(),automatic,mode,livery:activeLivery,wheels:wheels.length,drawCalls:renderer.info.render.calls};}};
 window.interlagos.carPaintInfo=carPaintInfo;
 // Paint and glass checks (verificar_pintura.py): points of the player's car frame (x forward, y up, z right; world: the
 // scene's) where the last picture drew them, CSS pixels from the top left, and their depth (past 1: behind the camera).
 window.interlagos.carScreenPoints=(points,world=false)=>{opalaShell.updateWorldMatrix(true,false);const box=renderer.domElement.getBoundingClientRect(),v=new THREE.Vector3();
  return points.map(p=>{v.fromArray(p);if(!world)v.applyMatrix4(opalaShell.matrixWorld);v.project(camera);return [(v.x*.5+.5)*box.width,(.5-v.y*.5)*box.height,v.z];});};
 // The sun's direction in that car frame (where its cast shadow falls).
 window.interlagos.carSun=()=>{opalaShell.updateWorldMatrix(true,false);return sunDirection.clone().transformDirection(opalaShell.matrixWorld.clone().invert()).toArray();};
 // The Arena de Drift's state for the checks (verificar_arena_drift.py): layout, score, challenge, editor.
 window.interlagos.arenaInfo=()=>arenaMode?.info()??null;
 // The stands' fans: how many the circuit has and how many the fill shows now (Modo História: the supporters' morale).
 window.interlagos.crowdInfo=()=>({total:standsCrowd?.count??0,shown:standsCrowd?.shown()??0});
 window.interlagos.speedInfo=()=>({...speedFx.info(),particles:tyreSmoke.info().speedFx,kerb:kerbSound(car),kerbWheels:car.kerbWheels??0,kerbTilt:car.kerbTilt??0});
 return true;
 }catch(err){console.error(err);ready=false;clearCircuit();status('Não foi possível carregar a pista. Clique em começar para tentar novamente.');return false;}
 finally{loading=false;pendingMode=null;$('start').disabled=false;$('storyStart').disabled=false;$('singleRace').disabled=$('soloRace').disabled=$('duelRace').disabled=false;$('championshipStart').disabled=false;$('tour').disabled=false;$('livery').disabled=false;for(const button of document.querySelectorAll('[data-circuit],[data-variant]'))button.disabled=false;updateMenuLabels();}
}
$('start').disabled=false;$('storyStart').disabled=false;$('singleRace').disabled=$('soloRace').disabled=$('duelRace').disabled=false;$('championshipStart').disabled=false;status('');updateMenuLabels();updateScreens();
window.interlagos={ready:false,audioInfo:()=>carAudio.info()};
// The multiplayer room reaches into the game only through these hooks.
const typedPilot=()=>(pilotPicker.input.hidden?pilotPicker.select.value:pilotPicker.input.value.trim())||pilotPicker.profiles.selected||'';
if(roomWanted)import('./multiplayer.js').then(({startMultiplayer})=>{multiplayer=startMultiplayer({
 session:()=>({started:sessionStarted,paused,loading,circuit:circuit.id}),
 immersive:()=>immersive,template:()=>model,withTemplate:withCleanModel,
 // The race being set up is a room's kind: Modo Corrida with the whole grid (not the story, the
 // recon lap, Treino solo or 1x1).
 fullGrid:()=>!preferences.values.immersive&&!reconLap&&immersive?.lineup==null,
 // The car screen's choice is the car asked for in the room; the room's answer comes back to it.
 wantedCar:()=>preferences.values.car,roomCars:state=>{carSelect.setRoom(state);updateMenuLabels();},
 pilotName:typedPilot,
 // A guest the host let in goes from the opening to Modo Corrida's car screen (not with a dialog
 // open, nor before it has a pilot's name: the room card then says where to go).
 openCars:()=>{if(sessionStarted||loading||screen!=='opening'||$('settings').open||!typedPilot())return false;chooseMode('corrida');return screen==='cars';},
 // A knock at the host's door while its grid waits: the mouse is let go to answer it (no menu, no pause).
 freeMouse:()=>{if(document.pointerLockElement!==$('view'))return;mouseFreed=true;document.exitPointerLock();},
 command:()=>automatic?pilot():input(),
 // The account (conta.js): the room server lets in only pilots signed in, with a nickname. Signing in leaves for
 // Google and comes back to this address; the nickname is picked in the account's dialog.
 roomPass:room=>contaModule?contaModule.then(m=>m.roomPass(room)).catch(()=>({problema:'contas'})):{problema:'contas'},
 accountName:()=>conta?.account?.apelido??null,
 // The host's invitations (multiplayer.js): a track's online records (the board: nickname, badge, best lap) and its name.
 records:circuit=>contaModule?contaModule.then(m=>m.boardFor(circuit)):[],circuitName:id=>CIRCUITS[id]?.name??id,
 signIn:()=>conta?.signIn(),openAccount:()=>conta?.open(),
 // The chat's balloons (multiplayer-chat.js): the scene's camera, and the point over this window's own car, or over
 // its pilot out of it.
 camera:()=>camera,
 playerAnchor:out=>walker?.active?out.copy(walker.hero.position).setY(walker.hero.position.y+2.05):out.copy(carRoot.position).setY(carRoot.position.y+1.45),
 keyName,
 // What this window's car carries beside its motion: its pilot out of it (free-walk.js: where he stands, the way he faces,
 // running, crouched, off the ground) and its parts held open (car-openings.js openMask); and the pilot's look (pilot-look.js),
 // which the others see on him and at the wheel.
 onFoot:()=>{if(!walker?.active)return null;const f=walker.footInfo();return {x:f.x,y:f.y,z:f.z,facing:f.facing,running:f.running,crouch:walker.foot?.crouchAmount??0,lift:f.lift,hands:walker.handsCode()};},
 // The room's meeting at the Tia's café (before its start; past the flag, F): on foot there (meetAtCafe), back in the
 // car, whether there is a café at all and whether this pilot is there.
 meet:meetAtCafe,unmeet:()=>{if(walker?.away)walker.leave();},hasCafe:()=>!!pitstop?.cafeSeat,meeting:()=>!!walker?.away,
 openMask:()=>openings.openMask(),look:()=>pilotLook(),
 // The ghost lap's see-through shell (ghost-car.js instance): a car whose line is unsteady is drawn so for the others.
 ghostShell:color=>ghostCar.instance(color),
 // Past the flag (multiplayer.js finishAndWatch): the car taken to the pit lane (its trails and smoke broken there), and the
 // cameras on a car by its number (N and Shift+N then go round).
 teleported:()=>{skidMarks.breakTrails();tyreSmoke.reset();driver?.reset();},watchCar,
 autopilot:on=>{if(on!==undefined&&ready&&sessionStarted&&!immersive.active){if(on)automatic=true;else takeWheel();}return automatic;},
 hasCircuit:id=>Object.hasOwn(CIRCUITS,id),
 // The weather a host announces with its race (weather.js; Aleatório's draw, never 'aleatorio'), and a guest racing
 // it (null: its own again).
 weather:()=>playerWeather(),
 setWeather:w=>{const key=JSON.stringify(w??null);if(key===JSON.stringify(weatherOverride))return;weatherOverride=w??null;applyWeather();},
 // A race the host announced: its track as a single race, from whatever screen or race this window is on.
 startRace:id=>{
  if(loading||!Object.hasOwn(CIRCUITS,id))return false;
  if(!pilotPicker.input.value.trim()&&!pilotPicker.select.value)pilotPicker.input.value='Convidado';
  if(sessionStarted&&circuit.id!==id)returnToMainMenu();
  if(circuit.id!==id)selectCircuit(id);
  $('settings').close();lapRecords.dialog.close();championshipDialog.close();
  championshipRace=null;menuMode='corrida';pendingMode='single';beginRace(true,false,false);return true;
 }});}).catch(err=>console.error(err));
frame();
