"""Browser check: in Modo História the supporters' morale fills the paddock and the stands (user, 2026-10-24).

    python verificar_torcida_moral.py [porta]

For the supporters' morale at 0, 50 (a career's start) and 100%: the paddock shows 2, 6 and 10 supporters (the rest
hidden, not clickable), the stands about 2%, 15% and all of their fans; the before-the-race panel says only
"Converse com os torcedores para conseguir patrocínio." (no keys, no desk hint). Modo Corrida keeps the stands full.
Shots in renders/torcida_moral (or SHOTS_DIR)."""
import json
import os
import sys
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, enter_track, start_race
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORTA = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORTA}/pista_interlagos/teste/?intro=0'
SHOTS = Path(os.environ.get('SHOTS_DIR', ROOT / 'renders' / 'torcida_moral'))
SHOTS.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
failed = []
FIXTURE = "async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const o=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return o.call(this)};interlagos.immersiveInfo();return true;}"


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f' · {detail}' if detail != '' else ''), flush=True)
    if not ok:
        failed.append(name)


def story_profile(torcida):
    from_career = {'intro': True, 'morale': {'esposa': 50, 'equipe': 50, 'torcida': torcida}}
    return json.dumps({'fund': 400, 'career': from_career})


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for torcida, fans, fill in ((50, 6, .15), (0, 2, .0225), (100, 10, 1)):
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script(f"""if(!sessionStorage.getItem('moral')){{sessionStorage.setItem('moral','1');
         localStorage.setItem('opala99-preferences-v1',JSON.stringify({{circuit:'interlagos',immersive:true}}));
         localStorage.setItem('opala99-immersive-v1',{json.dumps(story_profile(torcida))});}}""")
        page = ctx.new_page(); page.set_default_timeout(240000)
        errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
        try:
            page.goto(URL, wait_until='networkidle')
            wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
            check('the story profile key', page.evaluate("import('./story-career.js').then(m=>m.STORY_PROFILE_KEY)") == 'opala99-immersive-v1')
            enter_track(page, pilot='Piloto torcida', story=True)
            page.evaluate(FIXTURE)
            wait_js(page, "fixtureMode.state.phase==='crowd'&&!fixtureMode.state.scene")
            # The morale as a race report would leave it: the paddock and the stands follow it live.
            page.evaluate(f'fixtureMode.state.profile.career.morale.torcida={torcida};true')
            page.wait_for_timeout(1200)
            s = page.evaluate("(()=>{const m=fixtureMode;return {morale:m.state.profile.career.morale.torcida,present:m.state.present,shown:m.visual.fans.filter(f=>f.person.visible).length,all:m.visual.fans.length};})()")
            check(f'torcida {torcida}%: {fans} supporters in the paddock', s['present'] == fans and s['shown'] == fans and s['all'] == 10, s)
            crowd = page.evaluate('interlagos.crowdInfo()')
            ratio = crowd['shown'] / max(1, crowd['total'])
            check(f'torcida {torcida}%: stands ~{fill:.0%} full', abs(ratio - fill) < max(.03, fill * .2), f"{crowd['shown']} of {crowd['total']} = {ratio:.3f}")
            text = page.inner_text('#immersivePanel')
            check(f'torcida {torcida}%: the panel is short', 'Converse com os torcedores para conseguir patrocínio.' in text and 'escadinha' not in text and 'Ande à vontade' not in text, text[:160].replace('\n', ' | '))
            # An absent supporter cannot be talked to.
            if fans < 10:
                page.evaluate(f'fixtureMode.state.talk({fans});true')
                check(f'torcida {torcida}%: an absent supporter does not talk', page.evaluate('fixtureMode.state.fan') is None)
            page.screenshot(path=str(SHOTS / f'paddock_{torcida}.png'))
            check(f'torcida {torcida}%: no page errors', not errors, errors[:2])
        except Exception as e:
            check(f'torcida {torcida}%: ran to the end', False, repr(e)[:300])
        ctx.close()
    # Modo Corrida: the stands as always, full.
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("""if(!sessionStorage.getItem('moral')){sessionStorage.setItem('moral','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false}));}""")
    page = ctx.new_page(); page.set_default_timeout(240000)
    try:
        page.goto(URL, wait_until='networkidle')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto torcida'); page.click('#start'); page.click('#carsNext')
        start_race(page, '#soloRace')
        wait_js(page, 'window.interlagos?.ready')
        page.wait_for_timeout(500)
        crowd = page.evaluate('interlagos.crowdInfo()')
        check('Modo Corrida: the stands full', crowd['total'] > 0 and crowd['shown'] == crowd['total'], crowd)
    except Exception as e:
        check('Modo Corrida: ran to the end', False, repr(e)[:300])
    browser.close()
print('PASSED' if not failed else f'FAILED: {failed}')
sys.exit(1 if failed else 0)
