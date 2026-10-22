"""Browser check for the story's divorce (Central #15, story-career.js divorceStep/divorce/pensionCards, story-scene.js).

A race with the wife at 45% leaves her card with Stevan's warning and how her patience goes. A late race at 15% finished
12th drops her under 10%: her card says she could not take it any more, then the team's and the supporters' cards, the
repair bill and the lawyer at the Box 99 (he walks up with his briefcase, hands over the papers, Stevan signs and is
left alone, then gets up again), and DIVÓRCIO: she took half of the wallet. The next race opens with the pension
before the vaquinha, the wife's bar replaced by it; with no money for the registration, bankruptcy in Stevan's words.
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
# A race of the career set up as given, finished at `position`, then the judge's inspection to the report.
RACE = """([morale,fund,position])=>{const m=fixtureMode,s=m.state,c=s.profile.career;window.interlagosHistoria.skipCards();
 Object.assign(c,{intro:true,races:6,since:6,morale:{...c.morale,...morale}});s.profile.fund=fund;Object.assign(s,{scene:null,phase:'race',health:1,paid:false,inspected:false,judging:false,cash:0});s.finish(position);m.sync();return true;}"""
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
    open_menu(page, URL)
    enter_track(page, story=True)
    page.evaluate(HOOK)
    # The warning: the wife at 45%, 7th to 10th late (−5): 40%.
    page.evaluate(RACE, [{'esposa': 45, 'equipe': 60, 'torcida': 60}, 200, 8])
    types = page.evaluate(INSPECT)
    frame()
    text = panel()
    check('wife_card_warns', card()['key'] == 'esposa' and 'CUIDADO: Moral com a esposa abaixo de 50% pode resultar em divórcio' in text and 'paciência' in text, text[:500])
    page.screenshot(path=str(SHOTS / 'divorcio_aviso.png'))
    page.evaluate('window.interlagosHistoria.skipCards()')
    # The divorce: 15% and 12th late (−10): 5%, at once. The wallet holds 1000.
    page.evaluate(RACE, [{'esposa': 15, 'equipe': 60, 'torcida': 60}, 1000, 12])
    types = page.evaluate(INSPECT)
    report['cards'] = types
    check('report_with_divorce', types.startswith('morale,morale,morale,repair,line,line,line,line,line,line,divorce'), types)
    frame()
    check('wife_card_says_she_left', 'Ela não aguentou mais' in panel(), panel()[:400])
    for _ in range(4):
        nxt()
    seen = []
    for i in range(6):
        frame()
        page.wait_for_timeout(1700 if i not in (3, 4) else 3800)
        info = scene()
        seen.append(info)
        page.screenshot(path=str(SHOTS / f'divorcio_cena_{i + 1}_{info["view"]}.png'))
        if i == 0:
            check('lawyer_at_the_box99', info['active'] and info['stage'] == 'box99' and info['lawyer'] and info['briefcase'] and not info['car'], info)
            check('subtitle_names_the_lawyer', 'ADVOGADO' in panel().upper() and 'representando a sua esposa' in panel(), panel()[:300])
        nxt()
    report['scene'] = [{k: s[k] for k in ('index', 'view', 'papers', 'pen', 'briefcase', 'lawyer')} for s in seen]
    check('papers_change_hands', seen[2]['papers'] == 'pilot' and seen[3]['papers'] == 'lawyer' and seen[4]['papers'] == 'lawyer' and seen[5]['papers'] is None, report['scene'])
    check('lawyer_leaves', seen[4]['lawyer'] and seen[5]['lawyer'] is None and seen[4]['view'] == 'alone' and seen[5]['view'] == 'closePilot', report['scene'])
    frame()
    text = panel()
    check('divorce_card', card()['type'] == 'divorce' and 'DIVÓRCIO' in text and 'Sua esposa levou R$ 500,00 da sua carteira na divisão de bens' in text, text[:400])
    page.screenshot(path=str(SHOTS / 'divorcio_quadro.png'))
    page.evaluate('window.interlagosHistoria.skipCards()')
    # The next race: the pension before the vaquinha (a race outside the calendar: one month); the wife's bar is the pension.
    page.evaluate("fixtureMode.action('again')")
    wait_js(page, "fixtureMode.state.scene?.kind==='pension'", timeout=60000)
    frame()
    text = panel()
    check('pension_before_vaquinha', 'Pensão: R$ 300,00' in text and 'Na carteira antes: R$ 500,00' in text and 'agora: R$ 200,00' in text, text[:400])
    page.screenshot(path=str(SHOTS / 'divorcio_pensao.png'))
    nxt()
    frame()
    check('wife_bar_is_the_pension', 'divorciado · pensão R$ 300,00/mês' in panel(), panel()[:600])
    # Bankrupt: no money and supporters too cold to pay the registration.
    page.evaluate("()=>{const s=fixtureMode.state;s.scene=null;s.profile.fund=0;s.cash=0;s.profile.career.morale.torcida=1;s.entry=400;s.checkMoney();fixtureMode.sync();return true;}")
    frame()
    text = panel()
    check('bankrupt_in_stevans_words', 'Falência.' in text and 'A carreira de piloto te levou à falência e você está fora do automobilismo.' in text, text[:400])
    page.screenshot(path=str(SHOTS / 'divorcio_falencia.png'))
    browser.close()
print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('wife warning, lawyer scene at the Box 99, half the wallet, pension before the vaquinha, bankruptcy: verified')
