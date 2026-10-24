"""Browser check for the story's challenges after the Blazer (Central #16, story-career.js CHALLENGES/stageOf, story-scene.js).

The kit bought, the Blazer is the dream: paying the mechanic after a race brings the Blazer home and opens the HANS, its
deadline from that race. The daughter's kart, bought after a win: her scene at the Box 99 (she drives round the lane,
her father watches from the door, she stops in front of him), then the card with the supporters' +15%. After every
challenge, the Opala 99 is bought from the team after a race. The engine's new parts make the player's car a little
stronger in the story only. Honours INTERLAGOS_URL (default: the 8799 server); screenshots in SHOTS_DIR (default renders/)."""
import json
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, open_menu, enter_track, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders'))
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
# A race of the career at challenge `challenge` (the wife's request already answered), finished at `position`, then the
# judge's inspection to the report.
RACE = """([challenge,fund,position,released])=>{const m=fixtureMode,s=m.state,c=s.profile.career;window.interlagosHistoria.skipCards();
 Object.assign(c,{intro:true,races:6,since:6,challenge,expense:true,gear:['macacao','luvas','sapatilhas','capacete','hans','carretinha','ferramentas','bodas','kart','motor'].slice(0,challenge),report:null,opala:false});s.profile.released=released;s.profile.fund=fund;
 Object.assign(s,{scene:null,phase:'race',health:1,paid:false,inspected:false,judging:false,cash:0});s.finish(position);m.sync();return true;}"""
INSPECT = """()=>{const m=fixtureMode;m.action('afterPodium');m.action('inspect');for(let i=0;i<1100&&m.state.phase==='inspection';i++)m.step({},1/120);m.sync();return m.state.scene?.cards.map(c=>c.type).join();}"""
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
    panel = lambda: page.inner_text('#immersivePanel')
    card = lambda: page.evaluate('fixtureMode.state.sceneCard()')
    scene = lambda: page.evaluate('fixtureMode.visual.storyScene.info()')
    nxt = lambda: page.click('[data-action="scene:next"]')
    read_all = lambda: page.evaluate("()=>{const m=fixtureMode;for(let i=0;i<40&&m.state.scene;i++)m.action('scene:next');m.sync();return !m.state.scene;}")
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate(HOOK)

    # The Blazer after the kit: the button after the race, then the HANS (challenge 5) with its 3 races.
    page.evaluate(RACE, [4, 900, 6, False])
    types = page.evaluate(INSPECT)
    check('blazer_dream_after_kit', types.endswith('dream'), types)
    read_all()
    frame()
    check('blazer_button', 'Pagar o mecânico e buscar a Blazer' in panel(), panel()[:400])
    page.click('[data-action="blazer"]')
    frame()
    text = panel()
    check('blazer_out_card', card()['type'] == 'dream' and card()['done'] and 'A Blazer saiu da oficina!' in text and 'novos desafios' in text, text[:400])
    page.screenshot(path=str(SHOTS / 'desafios_blazer.png'))
    nxt()
    frame()
    text = panel()
    check('hans_next', card()['challenge'] == 'hans' and 'DESAFIO 5: JUNTAR DINHEIRO PARA COMPRAR SEU HANS' in text and 'PRAZO: 3 CORRIDAS' in text, text[:400])
    life = page.evaluate('({released:fixtureMode.state.profile.released,since:fixtureMode.state.profile.career.since,races:fixtureMode.state.profile.career.races,blazerAt:fixtureMode.state.profile.career.blazerAt})')
    check('hans_deadline_from_now', life['released'] and life['since'] == life['races'] == life['blazerAt'], life)
    page.screenshot(path=str(SHOTS / 'desafios_hans.png'))
    read_all()

    # The daughter's kart (challenge 9), bought after a win: the morale cards, the repair bill, her scene, the card.
    page.evaluate(RACE, [8, 3000, 1, True])
    types = page.evaluate(INSPECT)
    report['kart_cards'] = types
    check('kart_report', types == 'morale,morale,morale,repair,line,line,line,line,done,challenge', types)
    for _ in range(4):
        nxt()
    seen = []
    for i in range(4):
        frame()
        first = scene()
        page.wait_for_timeout(1500 if i != 2 else 3200)
        info = scene()
        seen.append({**info, 'moved': first['kart'] and info['kart'] and first['kart']['position'] != info['kart']['position']})
        page.screenshot(path=str(SHOTS / f'desafios_kart_{i + 1}_{info["view"]}.png'))
        if i == 0:
            check('kart_scene_at_box99', info['active'] and info['stage'] == 'kart' and info['kart'] and info['car'] is None and info['outfit'] == 'proprio', info)
            check('subtitle_names_her', 'SUA FILHA' in panel().upper() and 'olha eu' in panel(), panel()[:300])
        nxt()
    report['kart_scene'] = [{k: s.get(k) for k in ('index', 'view', 'moved')} | {'stopped': s['kart'] and s['kart']['stopped']} for s in seen]
    check('kart_goes_round_then_stops', seen[0]['moved'] and seen[1]['moved'] and seen[2]['kart']['stopped'] and not seen[3]['moved'], report['kart_scene'])
    frame()
    text = panel()
    check('kart_done_card', card()['type'] == 'done' and 'Kart novo para a filha' in text and 'Moral com a torcida: +15%' in text, text[:400])
    check('kart_scene_closed', not scene()['active'] and not scene()['kart'])
    page.screenshot(path=str(SHOTS / 'desafios_kart_cartao.png'))
    read_all()

    # After every challenge: the Opala 99, bought with the button after a race.
    page.evaluate(RACE, [10, 7600, 1, True])
    page.evaluate(INSPECT)
    read_all()
    frame()
    check('opala_button', 'Comprar o Opala 99 da equipe' in panel() and 'GRANDE SONHO' in panel(), panel()[:500])
    page.click('[data-action="opala"]')
    frame()
    text = panel()
    check('opala_bought', card()['type'] == 'owned' and 'O Opala 99 agora é seu!' in text and page.evaluate('fixtureMode.state.profile.career.opala'), text[:400])
    page.screenshot(path=str(SHOTS / 'desafios_opala.png'))
    read_all()
    frame()
    check('opala_stays_bought', 'O OPALA 99 É SEU!' in panel() and 'Comprar o Opala 99' not in panel(), panel()[:500])

    # The engine's new parts: 3% more in the story, back to the plain engine outside it.
    page.evaluate("()=>{const m=fixtureMode;m.state.profile.career.challenge=10;m.state.profile.career.gear=['motor'];m.start();return true;}")
    stronger = page.evaluate('fixtureMode.car.engineScale')
    page.evaluate('()=>{fixtureMode.disable();return true;}')
    plain = page.evaluate('fixtureMode.car.engineScale')
    check('engine_parts_in_story_only', abs(stronger - 1.03) < 1e-9 and plain == 1, [stronger, plain])
    browser.close()
report['errors'] = [e for e in report['errors'] if 'favicon' not in e]
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('challenges after the Blazer: Blazer then HANS, the daughter\'s kart scene, the Opala 99 bought, engine parts: verified')
