"""Browser check for the vaquinha that always pays the race and the repair the money pays only in part (user, 10-24).

Brasília (the longest lap of the Old Stock season) with 20 laps and the supporters' morale at 3%: only two supporters
come, and their gifts still pay the R$ 150 entry and the 30 L the team recommends; the desk says the 15 L tank
(Central #17) takes the rest at the Box 99 and how much to keep for it (rounded up, as the Box 99 charges).
Interlagos: a race ends with the engine and the tyres damaged and R$ 50 in the wallet; the report says what share the
money fixed and the CARRO the car starts the next race with, the engine raised free to the team's minimum. The next
race ("Correr de novo") starts with that damage on the car's parts, in the paddock's career block too.
Honours INTERLAGOS_URL (default: the 8799 server); screenshots in SHOTS_DIR (default renders/)."""
import json
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders'))
SHOTS.mkdir(parents=True, exist_ok=True)
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FUND = """async()=>{const {FANS,JOKES}=await import('./immersive-state.js');const s=fixtureMode.state;
 for(let i=0;i<FANS.length;i++){s.fan=null;s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}s.fan=null;s.feedback='';s.touch();return s.profile.fund;}"""
reais = lambda n: f'R$ {n:.2f}'.replace('.', ',')
report = {'errors': [], 'checks': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, (name, detail)


def session(browser, prefs):
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({...JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{}'),"
                            + ','.join(f'{k}:{json.dumps(v)}' for k, v in prefs.items()) + '}))')
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate(HOOK)
    return context, page


frame = lambda page: page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    # The worst case on the longest circuit and the longest race: two supporters, 20 laps at Brasília.
    context, page = session(browser, {'circuit': 'brasilia', 'storyLaps': 20})
    check('brasilia_twenty_laps', page.evaluate("interlagos.circuit==='brasilia'&&fixtureMode.storyLaps===20"))
    page.evaluate("()=>{const s=fixtureMode.state;s.profile.career.morale.torcida=3;s.profile.fund=0;s.touch();}")
    race = page.evaluate("()=>{const s=fixtureMode.state;return {present:s.present,entry:s.entry,raceFuel:s.raceFuel,tank:s.tank,cost:s.raceCost}}")
    report['brasilia'] = race
    check('only_two_supporters', race['present'] == 2 and race['entry'] == 150 and race['tank'] == 15 and race['raceFuel'] == 30, race)
    fund = page.evaluate(FUND)
    report['brasilia']['fund'] = fund
    check('two_supporters_pay_the_race', fund >= 150 + 30 * 6.5 and race['cost'] == 345, fund)
    page.evaluate("fixtureMode.action('desk')")
    page.wait_for_selector('#immLitres')
    text = page.inner_text('#immersivePanel')
    check('desk_names_the_box_refill', 'Recomendado para este circuito: 30 litros. O tanque leva 15: guarde R$ 98,00 para completar no Box 99 no meio da corrida.' in text, text[:900])
    page.locator('#immLitres').fill('15')
    check('full_tank_leaves_the_refill', page.inner_text('#deskLeft') == reais(fund - 150 - 15 * 6.5) and fund - 150 - 15 * 6.5 >= 98, page.inner_text('#deskLeft'))
    frame(page)
    page.screenshot(path=str(SHOTS / 'vaquinha_brasilia_20_voltas.png'))
    context.close()

    # Interlagos: the repair the money pays in part, the rest on the car at the next start.
    context, page = session(browser, {'circuit': 'interlagos', 'storyLaps': 8})
    page.evaluate(FUND)
    page.evaluate("fixtureMode.action('desk')")
    page.wait_for_selector('#immLitres')
    page.keyboard.press('Enter')
    wait_js(page, "fixtureMode.state.phase==='starting'")
    damaged = page.evaluate("""()=>{const m=fixtureMode,s=m.state,c=interlagos.car.condition;s.profile.career.firsts=['podio','vitoria'];s.phase='race';
     c.damage('motor',.8);c.damage('pneus',.5);s.health=c.health;s.profile.fund=50;s.finish(11);m.sync();return {health:s.health,repair:s.repair,car:s.profile.career.car,fund:s.profile.fund};}""")
    report['repair'] = damaged
    rep = damaged['repair']
    check('bill_paid_in_part', rep['bill'] == 210 and rep['charged'] == 50 and damaged['fund'] == 0 and rep['next'] == 86 and rep['free'], damaged)
    check('engine_raised_to_the_minimum', abs(damaged['car']['motor'] - .5) < 1e-9 and abs(damaged['car']['pneus'] - (.5 + .5 * 50 / 210)) < 1e-9 and damaged['car']['freios'] == 1, damaged['car'])
    frame(page)
    page.click('[data-action="afterPodium"]')
    page.click('[data-action="inspect"]')
    page.evaluate("()=>{for(let i=0;i<1100&&fixtureMode.state.phase==='inspection';i++)fixtureMode.step({},1/120);}")
    frame(page)
    text = page.inner_text('body')
    check('report_says_what_was_fixed', 'a conta era de R$ 210,00: com o dinheiro da carteira deu para consertar 23% dos danos, e o Opala vai para a próxima corrida com o CARRO em 86% (o mínimo para ele largar, a equipe fez de graça)' in text, text[:1200])
    page.screenshot(path=str(SHOTS / 'reparo_parcial_relatorio.png'))
    page.evaluate('window.interlagosHistoria.skipCards()')
    # Correr de novo: the paddock with the car as the money left it.
    page.evaluate("fixtureMode.action('again')")
    page.evaluate('window.interlagosHistoria.skipCards()')
    for _ in range(20):
        frame(page)
    start = page.evaluate("()=>{const s=fixtureMode.state,c=interlagos.car.condition;return {phase:s.phase,health:s.health,quality:{...c.quality},enabled:c.enabled,linked:s.condition===c}}")
    report['nextStart'] = start
    check('next_race_starts_damaged', start['phase'] == 'crowd' and abs(start['quality']['motor'] - .5) < 1e-9 and abs(start['quality']['pneus'] - damaged['car']['pneus']) < 1e-9
          and abs(start['health'] - (2 * .5 + .5 * 50 / 210 + 4) / 6) < 1e-9 and start['enabled'] and start['linked'], start)
    text = page.inner_text('#immersivePanel')
    check('paddock_shows_the_car', 'Carro' in text and '86%' in text, text[:600])
    page.screenshot(path=str(SHOTS / 'reparo_parcial_paddock.png'))
    # On the track the HUD's parts read the carried damage.
    page.evaluate(FUND)
    page.evaluate("fixtureMode.action('desk')")
    page.wait_for_selector('#immLitres')
    page.keyboard.press('Enter')
    page.evaluate("()=>{const s=fixtureMode.state;s.phase='race';fixtureMode.sync();}")
    for _ in range(10):
        frame(page)
    hud = page.evaluate("()=>{const h=document.querySelector('#conditionHud');return {shown:!!h&&!h.hidden&&getComputedStyle(h).display!=='none',text:h?.innerText??''}}")
    report['hud'] = hud
    check('race_hud_shows_the_damage', hud['shown'] and '50%' in hud['text'], hud)
    page.screenshot(path=str(SHOTS / 'reparo_parcial_hud.png'))
    context.close()
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('vaquinha pays every race; a short wallet fixes its share and the car starts the next race damaged: verified')
