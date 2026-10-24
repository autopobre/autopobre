"""Kléber Eletric congratulates on every conquest of Modo História, in a real browser (story-career.js KLEBER_LINES,
FIRST_LINES; story-scene.js acts 'parabens' and 'podio').

Every talk is played at the door of Kléber's garage: Kléber as the businessman after a purchase, in his overalls after
the first podium or win; Stevan brings what he bought in his right hand (the Opala's key comes in Kléber's hand and
changes hands), and the lines' gestures move them. Then two real races: the gloves bought after a race (the talk before
the challenge's card) and the first podium in sixth (the talk before the race's report). A photo of every line goes to
the folder given (default renders/parabens_kleber), with a mosaic per talk.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_parabens_kleber.py [pasta_das_fotos]
"""
from browser_config import browser_executable, browser_args, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, sys
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'renders' / 'parabens_kleber'
SHOTS.mkdir(parents=True, exist_ok=True)
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
# A conquest's talk on the scene, as the career would open it (the pilot in his own red overalls; the podium's in the
# loaned black ones: Stevan's first podium came before his own overalls).
OPEN = """async([id,first,position])=>{const m=await import('./story-career.js'),s=fixtureMode.state,c=s.profile.career;window.interlagosHistoria.skipCards();
 Object.assign(c,{intro:true,gear:first?[]:['macacao'],firsts:[],report:first?{race:3,outcome:id,position,before:{...c.morale},awaiting:null}:null});
 const cards=first?m.firstsCards(c):m.kleberCards(c,id);c.report=null;s.openScene('report',cards);fixtureMode.ui();return cards.length;}"""
# A race of the career (as verificar_novos_desafios.py), finished at `position`, then the judge's inspection to the report.
RACE = """([challenge,fund,position,firsts])=>{const m=fixtureMode,s=m.state,c=s.profile.career;window.interlagosHistoria.skipCards();
 Object.assign(c,{intro:true,races:6,since:6,challenge,expense:true,gear:['macacao','luvas','sapatilhas','capacete'].slice(0,challenge),report:null,firsts});s.profile.fund=fund;
 Object.assign(s,{scene:null,phase:'race',health:1,paid:false,inspected:false,judging:false,cash:0});s.finish(position);m.sync();return true;}"""
INSPECT = """()=>{const m=fixtureMode;m.action('afterPodium');m.action('inspect');for(let i=0;i<1100&&m.state.phase==='inspection';i++)m.step({},1/120);m.sync();return m.state.scene?.cards.map(c=>c.act??c.type).join();}"""
PROPS = {'luvas': 'Luvas_novas', 'sapatilhas': 'Sapatilhas_novas', 'capacete': 'Capacete_novo', 'hans': 'HANS_novo', 'carretinha': 'Engate_Blazer',
         'ferramentas': 'Parafusadeira_nova', 'bodas': 'Mala_bodas', 'kart': None, 'motor': 'Pistao_novo', 'blazer': 'Chave_Blazer', 'opala': 'Chave_Opala_99',
         'podio': 'Trofeu_podio', 'vitoria': 'Trofeu_vitoria'}
report = {'errors': [], 'checks': {}, 'talks': {}}


def check(name, value, detail=None):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, (name, detail)


def frames(page, n=3):
    for _ in range(n): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')


def mosaic(name, files):
    from PIL import Image
    tiles = [Image.open(f).convert('RGB').resize((640, 400)) for f in files]
    cols = 3; rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 640, rows * 400), (20, 20, 22))
    for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 640, (i // cols) * 400))
    sheet.save(SHOTS / f'{name}_mosaico.jpg', quality=82)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    scene = lambda: page.evaluate('fixtureMode.visual.storyScene.info()')
    panel = lambda: page.inner_text('#immersivePanel')
    open_menu(page, URL)
    enter_track(page, pilot='Stevan', story=True)
    page.evaluate(HOOK)
    page.evaluate('interlagos.skipIntro?.()')

    for n, (talk, first, position) in enumerate([(k, False, None) for k in ['luvas', 'sapatilhas', 'capacete', 'hans', 'carretinha', 'ferramentas', 'bodas', 'kart', 'motor', 'blazer', 'opala']]
                                                + [('podio', True, 6), ('podio', True, 3), ('vitoria', True, 1)]):
        label = f'{n + 1:02d}_{talk}' + (f'_p{position}' if talk == 'podio' else '')
        count = page.evaluate(OPEN, [talk, first, position])
        lines, files = [], []
        for i in range(count):
            frames(page)
            start = scene()
            page.wait_for_timeout(1400)
            frames(page)
            info = scene()
            text = panel()
            f = SHOTS / f'{label}_{i + 1}_{info["view"]}.jpg'
            page.screenshot(path=str(f), type='jpeg', quality=82)
            files.append(f)
            lines.append({'view': info['view'], 'prop': info['prop'], 'start': start['prop'], 'text': text.split('\n')[1][:70] if '\n' in text else text[:70]})
            if i == 0:
                act = 'podio' if first else 'parabens'
                check(f'{label}_on_stage', info['active'] and info['act'] == act and info['stage'] == 'kleber' and info['car'] and info['kleberLook'] == ('pilot' if first else 'business')
                      and info['outfit'] == ('emprestado' if first else 'proprio') and 'KLÉBER ELETRIC' in text.upper(), info)
                want = PROPS[talk]
                if talk == 'opala':
                    check('opala_key_handed_over', start['prop'] == {'name': want, 'holder': 'kleber'} and info['prop'] == {'name': want, 'holder': 'pilot'}, [start, info])
                else:
                    check(f'{label}_prop', (info['prop'] or {}).get('name') == want and (want is None or info['prop']['holder'] == 'pilot'), info)
                if talk == 'podio' and position == 3:
                    check('third_place_opening', 'Terceiro lugar' in text, text)
                if talk == 'podio' and position == 6:
                    check('sixth_place_opening', 'Sexto lugar' in text, text)
            page.click('[data-action="scene:next"]')
        frames(page)
        check(f'{label}_closed', not scene()['active'] and not page.evaluate('fixtureMode.state.scene'))
        report['talks'][label] = lines
        mosaic(label, files)

    # A real race: the gloves bought with the prize, Kléber's talk between the report and the challenge's card.
    page.evaluate(RACE, [1, 300, 12, ['podio', 'vitoria']])
    order = page.evaluate(INSPECT)
    report['gloves_race'] = order
    check('gloves_talk_after_report', order == 'morale,morale,morale,repair,' + ','.join(['parabens'] * 6) + ',done,challenge', order)
    page.click('[data-action="scene:next"]'); frames(page)
    check('gloves_talk_plays', scene()['act'] == 'parabens' and scene()['prop']['name'] == 'Luvas_novas')
    page.evaluate("()=>{const m=fixtureMode;for(let i=0;i<40&&m.state.scene;i++)m.action('scene:next');m.sync();return true;}")
    # The first podium, sixth: Kléber in his overalls before the report; "torcer por mim não, está no contrato!".
    page.evaluate(RACE, [1, 0, 6, []])
    order = page.evaluate(INSPECT)
    report['podium_race'] = order
    check('first_podium_before_report', order.startswith(','.join(['podio'] * 6) + ',morale'), order)
    frames(page)
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOTS / '20_corrida_primeiro_podio.jpg'), type='jpeg', quality=82)
    check('first_podium_plays', scene()['act'] == 'podio' and scene()['kleberLook'] == 'pilot' and 'Sexto lugar' in panel())
    texts = page.evaluate("fixtureMode.state.scene.cards.filter(c=>c.type==='line').map(c=>c.text).join(' ')")
    check('contract_joke', 'Está no contrato' in texts)
    browser.close()
report['errors'] = [e for e in report['errors'] if 'favicon' not in e]
(SHOTS / 'relatorio.json').write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'talks'}, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print("Kléber's congratulations: every conquest's talk at his box, the gloves after a race, the first podium: verified")
