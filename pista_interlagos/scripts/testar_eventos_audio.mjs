import assert from 'node:assert/strict';
import {ImmersiveState} from '../teste/immersive-state.js';
import {CarAudio} from '../teste/car-audio.js';
// A career past Kléber's welcome (story-career.js), so the paddock opens on the supporters.
const s=new ImmersiveState({career:{version:1,intro:true}}),names=()=>s.takeSounds().map(e=>e.name);
s.start();assert.deepEqual(names(),['crowdWelcome']);assert.deepEqual(names(),[]);
s.hitCar();s.requestInspection();s.untangle();assert.deepEqual(names(),[]);
s.talk(0);s.joke(0);s.joke(0);assert.deepEqual(names(),['talk','donation','noDonation']);
s.phase='race';s.fuel=2;s.tankWear=1;s.raceStep({speed:20,throttle:1,offTrack:5},.01);assert(names().includes('tankDrop'));
s.raceStep({speed:20,throttle:1},.01);assert(!names().includes('tankDrop'));
s.fuel=.0001;s.raceStep({speed:20,throttle:1},.1);assert.deepEqual(names(),['fuelEmpty']);s.raceStep({speed:20},1);assert.deepEqual(names(),[]);
s.beginTow();s.phase='snag';s.untangle();assert.deepEqual(names(),['towArrive','strapFree']);
s.podium();assert.deepEqual(names(),['podiumLoss']);s.leavePodium();s.requestInspection();s.requestInspection();assert.deepEqual(names(),['judgeStart']);s.inspectionStep(8);assert.deepEqual(names(),['judgeCheck','judgeApprove']);s.podium();assert.deepEqual(names(),[]);
s.start();s.phase='race';s.finish(1);s.leavePodium();s.requestInspection();s.inspectionStep(8);assert(names().includes('podiumWin'));
s.start();s.phase='race';s.finish(1);names();s.leavePodium();s.goToBox();const dq=names();assert(dq.includes('disqualified')&&!dq.includes('podiumWin'));
for(let i=0;i<200;i++)s.emitSound('click');assert.equal(s.takeSounds().length,64);s.emitSound('click');s.disable();assert.deepEqual(names(),[]);
let stored='{"volume":0.6,"muted":false}';globalThis.localStorage={getItem:()=>stored,setItem:(_,v)=>stored=v};
const a=new CarAudio();assert.equal(a.volume,.6);assert.equal(a.musicVolume,.35);assert.equal(a.effectsVolume,1);
a.setMusicVolume(.23);a.setEffectsVolume(.71);a.setVolume(.48);const b=new CarAudio();assert.equal(b.volume,.48);assert.equal(b.musicVolume,.23);assert.equal(b.effectsVolume,.71);
// Music and effects mute on their own, keep their levels and are saved.
b.setMusicMuted(true);b.setEffectsMuted(true);const c=new CarAudio();assert.ok(c.musicMuted&&c.effectsMuted&&!c.muted);assert.equal(c.musicLevel,0);assert.equal(c.effectsLevel,0);assert.equal(c.musicVolume,.23);assert.equal(c.effectsVolume,.71);
c.setEffectsMuted(false);assert.equal(new CarAudio().effectsLevel,.71);assert.ok(new CarAudio().musicMuted);
console.log('Audio events passed: accepted actions, no duplicate rewards, outcomes, bounded queue, independent saved mix.');
