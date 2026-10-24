"""Browser check for the fuel by circuit (Central #11, fuel.js) and the story's repair bill (Central #14).

Story at Interlagos: the team's desk shows "Recomendado para este circuito: 10 litros." between the fuel slider
and the windscreen film, the slider goes up to the 15 L tank (Central #17) and the old per-lap hint is gone. A race
finished with the CARRO bar at 75%: after the three morale cards (the supporters' last) comes "Custos de reparo do
carro", R$ 250,00 charged and the wallet left; the podium's money line lists it too. Modo Corrida starts with
the table's litres and the HUD's bar reads against the tank.
Honours INTERLAGOS_URL (default: the 8799 server); screenshots in SHOTS_DIR (default renders/)."""
import json
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders'))
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FUND = """async()=>{const {FANS,JOKES}=await import('./immersive-state.js');window.interlagosHistoria.skipCards();const s=fixtureMode.state;
 for(let i=0;i<FANS.length;i++){s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));s.fan=null;}s.feedback='';fixtureMode.action('close');return s.cash;}"""
report = {'errors': [], 'checks': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, (name, detail)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    frame = lambda: page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate(HOOK)
    report['kitty'] = page.evaluate(FUND)
    page.evaluate("fixtureMode.action('desk')")
    page.wait_for_selector('#immLitres')
    desk = page.evaluate("""()=>{const p=document.querySelector('#immersivePanel')??document.body,rec=document.querySelector('.desk-fuel-recommended'),
     slider=document.querySelector('#immLitres'),film=document.querySelector('#immFilm')?.closest('dt'),hint=document.querySelector('.desk-fuel-hint');
     return {rec:rec?.textContent,max:slider.max,between:!!rec&&slider.closest('dd').nextElementSibling===rec&&rec.nextElementSibling===film,hint:hint?.textContent};}""")
    report['desk'] = desk
    check('desk_recommends_the_table', desk['rec'] == 'Recomendado para este circuito: 10 litros.' and desk['between'], desk)
    check('slider_up_to_the_tank', desk['max'] == '15', desk)
    check('old_lap_hint_gone', 'costuma gastar' not in (desk['hint'] or '') and desk['hint'].startswith('Burnout e vazamentos gastam mais.'), desk)
    frame()
    page.screenshot(path=str(SHOTS / 'combustivel_mesa_equipe.png'))
    # The race, finished second with the CARRO bar at 75% and a cracked windscreen (not on the bill).
    page.evaluate("()=>{const m=fixtureMode;m.state.desk=false;m.state.phase='race';m.state.health=.75;m.state.glass=.5;m.state.finish(2);m.sync();}")
    frame()
    podium = page.inner_text('#immersivePanel') if page.locator('#immersivePanel').count() else page.inner_text('body')
    check('podium_lists_the_repair', 'conserto do carro: −R$ 250,00' in podium, podium[:600])
    page.click('[data-action="afterPodium"]')
    page.click('[data-action="inspect"]')
    page.evaluate("()=>{for(let i=0;i<1100&&fixtureMode.state.phase==='inspection';i++)fixtureMode.step({},1/120);}")
    types = page.evaluate("fixtureMode.state.scene?.cards.map(c=>c.type).join()")
    report['cards'] = types
    for _ in range(3):
        page.click('[data-action="scene:next"]')
    frame()
    card = page.evaluate("()=>{const c=fixtureMode.state.sceneCard();return {type:c?.type,key:fixtureMode.state.scene.cards[2].key,charged:c?.charged,fund:c?.fund,wallet:fixtureMode.state.profile.fund}}")
    text = page.inner_text('body')
    report['repairCard'] = card
    check('repair_card_after_supporters', types.startswith('morale,morale,morale,repair') and card['type'] == 'repair' and card['key'] == 'torcida', [types, card])
    check('repair_card_words', 'Custos de reparo do carro' in text and 'Sua equipe cobrou R$ 250,00 para reparar os danos causados ao carro na última corrida.' in text
          and f"Valor disponível na carteira: R$ {card['fund']:.2f}".replace('.', ',') in text and card['fund'] == card['wallet'], [card, text[:400]])
    page.screenshot(path=str(SHOTS / 'reparo_custos.png'))
    page.evaluate('window.interlagosHistoria.skipCards()')
    page.close()
    # Modo Corrida: the race starts with the table's litres (Interlagos, 3 laps: 10 L); the HUD's bar against the 15 L tank.
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    page.evaluate(HOOK)
    free = page.evaluate("()=>({fuel:fixtureMode.freeFuel,tank:fixtureMode.tank,target:fixtureMode.fuelTarget,bar:+document.querySelector('#fuelBar').max})")
    report['free'] = free
    check('free_race_starts_with_the_table', free['fuel'] == 10 and free['target'] == 10 and free['tank'] == 15 and free['bar'] == 15, free)
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('fuel recommendation at the desk, repair bill card, Modo Corrida start fuel: verified')
