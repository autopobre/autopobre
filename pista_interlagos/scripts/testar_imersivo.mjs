import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ImmersiveState,FANS,JOKES,COSTS,strapPath} from '../teste/immersive-state.js';
import {BLAZER_AFTER} from '../teste/story-career.js';
import {snackState,buySnack,giveSnack,useSnack,stepSnack} from '../teste/pitstop.js';
const checks={},check=(name,value)=>{checks[name]=!!value;assert(value,name);};
// A career whose welcome in Kléber's box was already seen (story-career.js; testar_carreira.mjs covers it).
const fresh=()=>{const s=new ImmersiveState({career:{version:1,intro:true}});s.start();return s;};
const fund=s=>{for(let i=0;i<FANS.length;i++){s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}};
const s=fresh();check('optional_off_by_default',!new ImmersiveState().active);
// A gift goes straight into the wallet (one sum, user 2026-10-24); raised counts the race's gifts.
s.talk(0);s.joke(1);check('no_laugh_no_money',s.profile.fund===0&&s.raised===0);s.joke(0);const cash=s.profile.fund;s.joke(0);check('laugh_donates_once',cash>0&&s.profile.fund===cash&&s.raised===cash&&s.cash===0);
const desk=fresh();check('desk_opens_without_money',desk.openDesk()&&desk.desk&&desk.cash===0);desk.talk(0);check('desk_keeps_supporters_waiting',desk.fan===null);check('poor_kitty_stays_in_paddock',!desk.buy(2,false)&&desk.phase==='crowd'&&desk.desk);
check('desk_closes_back_to_supporters',desk.closeDesk()&&!desk.desk&&desk.phase==='crowd');fund(desk);desk.openDesk();check('fuel_chosen_at_desk_goes_to_start',desk.buy(6,true)&&desk.phase==='starting'&&!desk.desk&&desk.fuel===6&&desk.film);
// Leonardo Martins (#19) offers a coffee in the paddock: one conversation at a time, one answer.
const leo=fresh();check('leo_offers_coffee',leo.offerCoffee()&&leo.leo==='ask'&&!leo.coffee);leo.talk(0);check('leo_keeps_other_talks_waiting',leo.fan===null&&!leo.openDesk()&&!leo.desk);
check('leo_coffee_accepted_once',leo.answerCoffee(true)&&leo.leo==='yes'&&leo.coffee&&!leo.answerCoffee(false));check('leo_asked_again_just_chats',leo.closeCoffee()&&leo.leo===null&&leo.offerCoffee()&&leo.leo==='chat');
const busy=fresh();busy.talk(1);check('leo_waits_for_supporter_talk',!busy.offerCoffee()&&busy.leo===null);
const refused=fresh();refused.offerCoffee();check('leo_coffee_declined',refused.answerCoffee(false)&&refused.leo==='no'&&!refused.coffee&&refused.closeCoffee());
// The Tia's menu in the paddock, as at a pit stop: one conversation at a time; a snack is paid
// from the kitty first, then from the savings, never beyond both; one item per hand, a sip at a time.
const cafe=fresh();check('cafe_menu_opens',cafe.openCafe()&&cafe.cafe);cafe.talk(0);check('cafe_keeps_other_talks_waiting',cafe.fan===null&&!cafe.openDesk()&&!cafe.offerCoffee()&&!cafe.openCafe());
check('cafe_menu_closes',cafe.closeCafe()&&!cafe.cafe&&cafe.openDesk()&&!cafe.openCafe());
const wallet=fresh();wallet.cash=5;wallet.profile.fund=3;check('snack_paid_from_kitty_then_savings',wallet.pay(6)&&wallet.cash===0&&wallet.profile.fund===2);check('snack_never_beyond_money',!wallet.pay(4)&&wallet.profile.fund===2);
// Once every supporter has given, the kitty keeps what the registration needs: snacks spend only the rest.
const kept=fresh();fund(kept);const spare=kept.profile.fund-COSTS.minimum;check('snack_keeps_registration_money',kept.spareCash()===spare&&!kept.pay(spare+1)&&kept.pay(spare)&&kept.profile.fund===COSTS.minimum&&!kept.pay(4));
const early=fresh();early.talk(0);early.joke(JOKES.findIndex(j=>j.topic===FANS[0].taste));check('snack_before_all_gifts_counts_the_rest',early.spareCash()===early.profile.fund&&early.pay(4));
const hands=snackState(),paid=[],pay=price=>{paid.push(price);return true;},emit=()=>{};
check('snacks_one_per_hand',buySnack(hands,'cafe',{pay,emit})&&giveSnack(hands,'pao')&&!buySnack(hands,'doce',{pay,emit})&&paid.join()==='4'&&hands.held.map(h=>h.side).join()==='1,-1');
useSnack(hands);for(let i=0;i<200;i++)stepSnack(hands,1/120,emit);check('a_sip_at_a_time',hands.held[0].bites===2&&!hands.using&&!giveSnack(hands,'cafe'));
fund(s);check('crowd_can_fund_entry_and_full_tank',s.profile.fund>=208&&s.openDesk());check('fuel_and_protection_purchase',s.buy(12,true)&&s.fuel===12&&s.film);
s.starter=true;for(let i=0;i<120;i++)s.startEngine({throttle:s.pressure<.45?1:0},1/120);check('no_ign_turns_but_never_fires',s.phase==='starting'&&s.crank>0);s.starter=false;s.startEngine({},1/120);
check('ign_switch_flips',s.switchIgnition()&&s.ignOn);s.starter=true;for(let i=0;i<240&&s.phase==='starting';i++)s.startEngine({throttle:s.pressure<.45?1:0},1/120);check('controlled_start_works',s.phase==='grid');
const flooded=fresh();fund(flooded);flooded.openDesk();flooded.buy(4,false);for(let i=0;i<240;i++)flooded.startEngine({throttle:1},1/120);flooded.starter=true;for(let i=0;i<120&&flooded.phase==='starting';i++)flooded.startEngine({throttle:1},1/120);check('flooded_start_calls_tow',flooded.phase==='broken'&&flooded.reason.includes('afogado'));
// The battery does not recover between tries; pumping the pedal between tries soaks the plugs until it floods.
const tries=fresh();fund(tries);tries.openDesk();tries.buy(6,false);tries.starter=true;for(let i=0;i<120;i++)tries.startEngine({},1/120);tries.starter=false;tries.startEngine({},1/120);const charge=tries.battery;for(let i=0;i<600;i++)tries.startEngine({},1/120);check('battery_does_not_recharge_between_tries',charge<.8&&tries.battery===charge&&tries.phase==='starting');
const pump=fresh();fund(pump);pump.openDesk();pump.buy(6,false);const cycle=()=>{for(let i=0;i<200;i++)pump.startEngine({throttle:1},1/120);for(let i=0;i<240;i++)pump.startEngine({},1/120);};cycle();cycle();check('pumping_pedal_soaks_plugs',pump.flood>.35&&pump.phase==='starting'&&pump.catchTime()>1.2);
for(let k=0;k<6&&pump.phase==='starting';k++)cycle();check('playing_with_pedal_floods_engine',pump.phase==='broken'&&pump.reason.includes('afogado'));
s.startRace();s.fuel=.001;s.raceStep({speed:25,throttle:1},1);check('empty_tank_breakdown',s.phase==='broken');
const off=fresh();off.phase='race';off.fuel=8;for(let i=0;i<200;i++)off.raceStep({speed:20,throttle:1,offTrack:6},1/120);check('deep_excursion_drops_tank',off.tankDetached&&off.fuel<7.9);
const glass=fresh();glass.phase='race';glass.fuel=8;glass.hitDebris();check('glass_first_hit_cracks',glass.glass>0&&glass.phase==='race');glass.hitDebris();glass.hitDebris();check('shattered_glass_calls_tow',glass.phase==='broken');
const goodTow=fresh();goodTow.beginTow();for(let i=0;i<12000&&goodTow.phase==='tow';i++)goodTow.towStep({brake:1},1/120);check('braking_keeps_tow_strap_safe',goodTow.phase==='podium'&&goodTow.towSnags===0);
const badTow=fresh();badTow.beginTow();for(let i=0;i<3000&&badTow.phase==='tow';i++)badTow.towStep({brake:0},1/120);check('coasting_runs_over_strap',badTow.phase==='snag'&&badTow.towGap<2.2);badTow.untangle();check('snag_recoverable',badTow.phase==='tow'&&badTow.towGap===5);
for(const gap of [.5,1,2,3,4,5]){const pts=strapPath([0,.2,0],[gap,.2,0]);const len=pts.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-pts[i][j])),0);check('strap_fixed_length_'+gap,Math.abs(len-5)<.001);check('strap_attached_'+gap,Math.hypot(...pts[0].map((v,j)=>v-[0,.2,0][j]))<1e-8&&Math.hypot(...pts.at(-1).map((v,j)=>v-[gap,.2,0][j]))<1e-8);}
const winner=fresh();winner.phase='race';winner.finish(1);winner.leavePodium();winner.requestInspection();winner.inspectionStep(8);check('winner_still_sixth_on_podium',winner.inspected&&winner.podiumPlace===6&&winner.result.position===1&&winner.prize===800);
const angled=strapPath([10,5,30],[11.5,5.1,33.8]);const angledLength=angled.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-angled[i][j])),0);
check('strap_follows_world_space_anchors',Math.hypot(...angled[0].map((v,j)=>v-[10,5,30][j]))<1e-8&&Math.hypot(...angled.at(-1).map((v,j)=>v-[11.5,5.1,33.8][j]))<1e-8&&Math.abs(angledLength-5)<.001);
const balance=winner.profile.fund;winner.podium();check('prize_not_paid_twice',winner.profile.fund===balance);
const dq=fresh();dq.phase='race';dq.finish(1);dq.leavePodium();dq.goToBox();check('box_before_judge_disqualifies_winner',dq.result.status==='Desclassificado'&&dq.prize===0&&dq.podiumPlace===6);
for(const reason of ['Motor afogado na partida','Acabou a gasolina','Para-brisa estilhaçado','Carro quebrou']){const d=fresh();d.phase='race';d.fail(reason);d.beginTow();while(d.phase==='tow')d.towStep({brake:1},.05);d.leavePodium();d.requestInspection();d.inspectionStep(8);check('dnf_sixth_'+reason,d.podiumPlace===6&&d.result.status==='Não terminou');}
winner.start();winner.phase='race';winner.finish(1);winner.leavePodium();winner.requestInspection();winner.inspectionStep(8);check('blazer_waits_for_the_equipment',!winner.releaseBlazer()&&winner.sceneCard()?.type==='morale');
// The Blazer is the dream once the four pieces of equipment are bought (then come the challenges after it).
winner.scene=null;Object.assign(winner.profile.career,{challenge:BLAZER_AFTER,report:null});winner.profile.fund=1200;check('blazer_goal_can_be_completed',winner.releaseBlazer()&&winner.profile.released&&winner.profile.fund===300);check('mechanic_paid_once',!winner.releaseBlazer());
const saved=new ImmersiveState(JSON.parse(JSON.stringify(winner.profile)));check('profile_survives_reload',saved.profile.released&&saved.profile.races===2);saved.disable();check('normal_mode_isolated',!saved.active&&saved.phase==='off');
const report={passed:true,checks};fs.writeFileSync(new URL('../dados/validacao_imersivo.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
