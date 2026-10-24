"""Modo História career in a real browser (story-career.js, pedidos #3/#4 of the Central de Projetos).

From the opening: the story's track screen offers only the Old Stock 2026 season, with the career beside
it; round 1 (Brasília) opens with Kléber Eletric's welcome and the first challenge; the paddock shows the
wallet, the three morale bars and the challenge; the registration away from Interlagos costs R$ 150 and
takes the wallet; after the race the three morale cards, the challenge, the wife's request and the
overalls bought; the end of the story starts the season again. Then the first cards on a phone.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_carreira.py [pasta_das_fotos]
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, GAME_URL, start_race
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, sys
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'renders' / 'carreira'
SHOTS.mkdir(parents=True, exist_ok=True)
report = {'errors': [], 'checks': {}}
HOOK = '''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();return true;}'''


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def frames(page, n=3):
    for _ in range(n): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')


def shot(page, name):
    frames(page); page.screenshot(path=str(SHOTS / f'{name}.png'))


def panel(page): return page.inner_text('#immersivePanel')


def card(page): return page.evaluate("fixtureMode.state.sceneCard()?.type??null")


def start_season(page):
    """From the opening (or the story's track screen) to round 1's paddock, the opening shots skipped."""
    if not page.is_visible('#tracks'):
        if page.is_visible('#pilotName') and not page.input_value('#pilotName'): page.fill('#pilotName', 'Piloto teste')
        page.click('#storyStart')
    start_race(page, '#championshipStart')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
    page.evaluate(HOOK); wait_js(page, "fixtureMode.state.phase==='crowd'")
    page.evaluate('interlagos.skipIntro?.()')


def desktop(browser):
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    page.fill('#pilotName', 'Piloto teste'); page.click('#storyStart')
    wait_js(page, "document.querySelector('#tracks')?.dataset.mode==='historia'&&!document.querySelector('#championshipStart').disabled")
    check('story_has_no_single_race', not page.is_visible('#singleRace') and not page.is_visible('#soloRace'))
    check('story_season_only', page.inner_text('#championshipTitle').startswith('Temporada 2026') and not page.is_visible('#championshipTabs'))
    check('career_beside_season', page.is_visible('#storyCareer') and 'carteira' in page.inner_text('#storyCareer').lower() and 'Esposa' in page.inner_text('#storyCareer'))
    shot(page, '01_pistas_historia')
    start_season(page)
    check('round_one_brasilia', page.evaluate('interlagos.circuit') == 'brasilia')
    # Kléber Eletric's welcome, one line at a time, over the paddock.
    check('welcome_first', page.evaluate("fixtureMode.state.scene?.kind") == 'intro' and 'kléber eletric' in panel(page).lower() and 'bem-vindo' in panel(page))
    # Kléber's lines are played on the scene (story-scene.js), as subtitles; verificar_cena_kleber.py covers the shots.
    check('welcome_as_subtitles', page.evaluate("document.querySelector('#immersivePanel').classList.contains('career-cutscene')&&fixtureMode.visual.storyScene.active"))
    shot(page, '02_kleber_boas_vindas')
    page.keyboard.press('Enter'); frames(page)
    check('enter_next_line', 'Muito obrigado' in panel(page) and page.evaluate('fixtureMode.state.scene.at') == 1)
    for _ in range(2): page.keyboard.press('Enter')
    frames(page); shot(page, '03_stevan_sem_macacao')
    page.click('[data-action="scene:skip"]'); frames(page)
    text = panel(page)
    check('first_challenge_card', card(page) == 'challenge' and 'DESAFIO 1' in text and 'MACACÃO' in text and 'PRAZO: 3 CORRIDAS' in text and 'R$ 1.000,00' in text)
    shot(page, '04_desafio_macacao')
    page.keyboard.press('Enter'); frames(page)
    text = panel(page)
    check('paddock_after_welcome', page.evaluate('!fixtureMode.state.scene&&fixtureMode.state.profile.career.intro') and 'carteira' in text.lower() and 'Torcida' in text and 'DESAFIO 1' in text)
    check('away_entry', page.evaluate('fixtureMode.state.entry') == 150 and 'fora de Interlagos' in text)
    shot(page, '05_paddock_carteira')
    # The team's desk: the kitty and the wallet against the away entry.
    # One wallet (2026-10-24): the gifts are in it already, no kitty apart.
    page.evaluate("()=>{const s=fixtureMode.state;s.cash=0;s.profile.fund=260;fixtureMode.prepFilm=false;fixtureMode.action('desk');}"); frames(page)
    text = panel(page)
    check('desk_shows_wallet', 'Na carteira' in text and 'R$ 260,00' in text and 'Na vaquinha' not in text and 'Inscrição · fora de Interlagos' in text and 'R$ 150,00' in text)
    shot(page, '06_inscricao_carteira')
    page.evaluate("fixtureMode.action('buy')")
    info = page.evaluate("({phase:fixtureMode.state.phase,cash:fixtureMode.state.cash,fund:fixtureMode.state.profile.fund,litres:fixtureMode.state.fuel})")
    check('desk_pays_kitty_then_wallet', info['phase'] == 'starting' and info['cash'] == 0 and abs(info['fund'] - (260 - 150 - info['litres'] * 6.5)) < 1e-6)
    # Racing, the car's condition shows: damage and wear are always on in the story (main.js damageOn).
    page.evaluate("()=>{const s=fixtureMode.state;s.phase='race';fixtureMode.sync();}"); frames(page)
    check('story_race_shows_car_condition', page.evaluate("interlagos.car.condition?.enabled===true&&!document.querySelector('#conditionHud').hidden&&document.querySelector('[data-health-pct=motor]').textContent==='100%'"))
    # Third at the flag, through the podium and the judge, to the report.
    page.evaluate("()=>{const s=fixtureMode.state;s.phase='race';s.finish(3);fixtureMode.sync();}")
    wait_js(page, "fixtureMode.state.phase==='podium'")
    if page.is_visible('#resultsContinue'): page.click('#resultsContinue')
    page.evaluate("()=>{fixtureMode.action('afterPodium');fixtureMode.action('inspect');fixtureMode.state.inspectionStep(8);fixtureMode.sync();fixtureMode.ui();}")
    wait_js(page, "fixtureMode.state.phase==='complete'&&fixtureMode.state.scene?.kind==='report'")
    text = panel(page)
    # One screen for the whole report (user, 2026-10-24): the three moods (wife, team, supporters), the repair bill
    # (Central #14) and the challenge's progress, one Continuar for all.
    fund = page.evaluate('fixtureMode.state.profile.fund')
    check('report_on_one_screen', card(page) == 'morale' and 'Como foi a corrida' in text and 'admirada' in text and '+5%' in text and '+15%' in text and '+10%' in text
          and 'Reparo do carro' in text and 'faltam 2 corridas' in text and f'{int(fund // 10)}%' in text and page.locator('#immersivePanel .report-part').count() == 5)
    shot(page, '07_resumo_da_corrida')
    page.keyboard.press('Enter'); frames(page)
    text = panel(page)
    check('summary_after_report', page.evaluate('!fixtureMode.state.scene') and 'Carteira' in text and 'Próxima etapa' in text and 'Prêmio: R$ 500,00' in text)
    shot(page, '10_resumo')
    # The money is there: the wife asks first; paid, the overalls are bought and Kléber gets his back.
    page.evaluate("()=>{const s=fixtureMode.state,c=s.profile.career;s.profile.fund=2000;c.report={race:c.races,outcome:'vitoria',before:{...c.morale},awaiting:null};const cards=s.careerCards();s.openScene(cards.kind,cards.cards);fixtureMode.ui();}")
    for _ in range(3): page.keyboard.press('Enter')
    frames(page); text = panel(page)
    check('wife_request', card(page) == 'expense' and 'Precisa de R$' in text and 'aniversário' in text and 'Não pagar agora' in text)
    shot(page, '11_pedido_esposa')
    page.keyboard.press('Enter'); frames(page)
    check('request_needs_answer', card(page) == 'expense')
    page.keyboard.press('Digit1'); frames(page)
    check('request_paid', card(page) == 'answer' and 'Pago' in panel(page))
    page.keyboard.press('Enter'); frames(page)
    check('kleber_gets_overalls_back', card(page) == 'line' and 'Muito obrigado pelo macacão' in panel(page))
    shot(page, '12_devolve_macacao')
    # The challenge done and the next one share the report's screen (2026-10-24).
    for _ in range(2): page.keyboard.press('Enter')
    frames(page)
    check('next_challenge_gloves', card(page) in ('done', 'challenge') and 'Novo desafio' in panel(page) and 'LUVAS' in panel(page).upper())
    check('overalls_owned', page.evaluate("fixtureMode.state.profile.career.gear.join()") == 'macacao')
    shot(page, '13_desafio_luvas')
    page.keyboard.press('Enter')
    # The end of the story, and a new one from round 1.
    page.evaluate("()=>{const s=fixtureMode.state;s.profile.career.morale.esposa=0;s.profile.career.over='esposa';s.openScene('over',[{type:'over',reason:'esposa'}]);fixtureMode.ui();}"); frames(page)
    check('game_over_card', 'A história acabou' in panel(page) and 'ultimato' in panel(page) and page.is_visible('[data-action="scene:restart"]'))
    shot(page, '14_fim_de_jogo')
    page.click('[data-action="scene:restart"]')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
    page.evaluate(HOOK); wait_js(page, "fixtureMode.state.phase==='crowd'")
    check('new_story_round_one', page.evaluate("fixtureMode.state.scene?.kind==='intro'&&fixtureMode.state.profile.fund===0&&!fixtureMode.state.profile.career.over") and page.evaluate('interlagos.circuit') == 'brasilia')
    page.close()


def phone(browser):
    context = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=2)
    page = context.new_page(); page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    page.fill('#pilotName', 'Piloto teste'); page.tap('#storyStart')
    wait_js(page, "!document.querySelector('#championshipStart').disabled")
    shot(page, '20_celular_pistas')
    start_race(page, '#championshipStart', tap=True)
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused')
    page.evaluate(HOOK); wait_js(page, "fixtureMode.state.phase==='crowd'"); page.evaluate('interlagos.skipIntro?.()')
    frames(page)
    box = page.evaluate("(()=>{const r=document.querySelector('#immersivePanel').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()")
    check('phone_card_fits', box[0] >= 0 and box[1] >= 0 and box[2] <= 844 and box[3] <= 390)
    shot(page, '21_celular_kleber')
    page.tap('[data-action="scene:skip"]'); frames(page)
    box = page.evaluate("(()=>{const r=document.querySelector('#immersivePanel').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()")
    check('phone_challenge_fits', card(page) == 'challenge' and box[3] <= 390)
    shot(page, '22_celular_desafio')
    page.tap('[data-action="scene:next"]'); frames(page)
    shot(page, '23_celular_paddock')
    context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args())
    try:
        desktop(browser)
        phone(browser)
    finally:
        browser.close()
check('no_page_errors', not report['errors'])
print(json.dumps(report, ensure_ascii=False, indent=1))
