"""Optional browser discovery for local visual checks, with no workstation paths."""
import os
from pathlib import Path
from time import monotonic

GAME_URL = 'http://127.0.0.1:8799/pista_interlagos/teste/'

# Pointer lock kept inside the page, with the browser's rules: a user gesture (or a page that let go
# by exitPointerLock) locks, Escape unlocks and never reaches the page as a keydown.
PAGE_POINTER_LOCK = """(()=>{
 let locked=null,exited=false;
 const fire=type=>setTimeout(()=>document.dispatchEvent(new Event(type)),0);
 const release=programmatic=>{if(!locked)return;exited=programmatic;locked=null;fire('pointerlockchange');};
 Object.defineProperty(Document.prototype,'pointerLockElement',{get:()=>locked,configurable:true});
 Object.defineProperty(Document.prototype,'exitPointerLock',{value:()=>release(true),configurable:true,writable:true});
 Object.defineProperty(Element.prototype,'requestPointerLock',{value(){
  if(!exited&&navigator.userActivation?.isActive===false){fire('pointerlockerror');return Promise.reject(new DOMException('Pointer lock needs a user gesture','NotAllowedError'));}
  if(locked!==this){locked=this;fire('pointerlockchange');}
  return Promise.resolve();
 },configurable:true,writable:true});
 addEventListener('keydown',e=>{if(locked&&e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();release(false);}},true);
})();"""


def _off_screen(launch):
    def headless_launch(self, *args, **kwargs):
        kwargs['headless'] = True
        return launch(self, *args, **kwargs)
    return headless_launch


def _page_lock(new):
    def new_with_page_lock(self, *args, **kwargs):
        made = new(self, *args, **kwargs)
        getattr(made, 'context', made).add_init_script(PAGE_POINTER_LOCK)
        return made
    return new_with_page_lock


# Checks run while someone uses this PC: a browser window would take their focus, and the game's
# pointer lock clips their real cursor to the page's rectangle, even in a headless Edge. Every
# launch from a script that imports this module is headless (even with headless=False) and every
# page gets PAGE_POINTER_LOCK; INTERLAGOS_HEADED=1 keeps the browser as it is, window and real lock.
try:
    from playwright.sync_api import Browser, BrowserType
except ImportError:
    Browser = BrowserType = None
if BrowserType and not os.environ.get('INTERLAGOS_HEADED'):
    BrowserType.launch = _off_screen(BrowserType.launch)
    BrowserType.launch_persistent_context = _page_lock(_off_screen(BrowserType.launch_persistent_context))
    Browser.new_context = _page_lock(Browser.new_context)
    Browser.new_page = _page_lock(Browser.new_page)


def browser_executable():
    configured = os.environ.get('INTERLAGOS_BROWSER')
    if configured:
        return configured
    for variable in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'):
        folder = os.environ.get(variable)
        if folder:
            candidate = Path(folder) / 'Microsoft/Edge/Application/msedge.exe'
            if candidate.is_file():
                return str(candidate)
    # None lets Playwright use its installed Chromium.
    return None


def browser_args():
    """Hardware WebGL by default; INTERLAGOS_SOFTWARE_GL=1 forces SwiftShader on machines without a GPU.

    The landscape renders at about 1 fps in SwiftShader, so software runs need patience.
    INTERLAGOS_LOW_POWER_GPU=1 picks the integrated GPU on a two-GPU laptop: the cheap-PC proxy
    (medir_pc_fraco.py)."""
    args = ['--enable-webgl', '--ignore-gpu-blocklist']
    if os.environ.get('INTERLAGOS_SOFTWARE_GL'):
        args += ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    if os.environ.get('INTERLAGOS_LOW_POWER_GPU'):
        args += ['--force_low_power_gpu']
    return args


def wait_js(page, expression, timeout=120000, arg=None):
    """Poll through DevTools; Playwright's in-page string eval is blocked by CSP."""
    deadline = monotonic() + timeout / 1000
    while monotonic() < deadline:
        result = page.evaluate(expression, arg)
        if result:
            return result
        page.wait_for_timeout(50)
    raise TimeoutError('Browser condition did not become true')


def open_menu(page, url=GAME_URL, timeout=120000):
    """Opening screen ready. Circuits, cars and the renderer load only once a mode starts."""
    page.goto(url, wait_until='networkidle', timeout=timeout)
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled", timeout=timeout)


def race_options(page, camera=None, livery=None, tap=False):
    """Change race settings from the opening menu or a paused race, then close the dialog.

    The game mode is not a setting: enter_track picks it on the opening menu.
    #settingsClose keeps the current session; #settingsBack would end it."""
    press = page.tap if tap else page.click
    if not page.evaluate("document.querySelector('#settings').open"):
        press('#settingsButton' if page.is_visible('#settingsButton') else '#touchMenu' if page.is_visible('#touchMenu') else '#menuButton')
    press('#tab-race')
    if camera:
        page.select_option('#camera', camera)
    if livery:
        page.select_option('#livery', livery)
        wait_js(page, f"!window.interlagos?.ready||interlagos.state.livery==={livery!r}")
    press('#settingsClose')


def choose_race(page, story=False, championship=False, tap=False):
    """From the opening or the track screen, start a race without waiting for it to load.

    The opening picks the mode: #start (Modo Corrida) or #storyStart (Modo História). Modo Corrida
    shows the car screen first (#cars; #carsNext keeps the car chosen there), then both open the
    track screen, where #singleRace is Corrida única and #championshipStart the championship of
    that mode. A track or car screen of the other mode goes back to the opening (#tracksBack, which
    in Modo Corrida leads to the car screen, then #carsBack) to choose again."""
    press = page.tap if tap else page.click
    if page.is_visible('#tracks') and page.get_attribute('#tracks', 'data-mode') != ('historia' if story else 'corrida'):
        press('#tracksBack')
    if story and page.is_visible('#cars'):
        press('#carsBack')
    if not page.is_visible('#tracks') and not page.is_visible('#cars'):
        press('#storyStart' if story else '#start')
    if page.is_visible('#cars'):
        press('#carsNext')
    if story and not championship:
        # Modo História offers only the Old Stock season; a check's story race on the chosen circuit
        # goes through the page's hook (main.js interlagosHistoria).
        wait_js(page, "!document.querySelector('#championshipStart').disabled")
        page.evaluate('window.interlagosHistoria.race()')
    else:
        press('#championshipStart' if championship else '#singleRace')


def enter_track(page, pilot='Piloto teste', timeout=120000, tap=False, story=False, championship=False):
    """Start or resume a session. The first entry needs a pilot name.

    Mode and race are chosen by choose_race; on a paused session #resume goes back to the track."""
    press = page.tap if tap else page.click
    if page.is_visible('#resume'):
        press('#resume')
    else:
        if pilot and page.is_visible('#pilotName') and not page.input_value('#pilotName'):
            page.fill('#pilotName', pilot)
        choose_race(page, story=story, championship=championship, tap=tap)
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=timeout)
    if story:
        # The career's cards (Kléber's welcome, the last race's report) come before the paddock.
        page.evaluate('window.interlagosHistoria.skipCards()')


def pause_race(page, tap=False):
    """Open the pause menu with the keyboard (Escape) or the touch toolbar.

    P only freezes the race on screen under the pause badge, without the menu. Under pointer lock
    Escape only frees the mouse, with no keydown: on the track that opens the menu, on foot (story
    paddock, podium) it does not, so a second Escape opens it."""
    if tap:
        page.tap('#touchMenu')
        page.tap('#settingsClose')
    else:
        page.keyboard.press('Escape')
        try:
            wait_js(page, 'interlagos.state.paused', timeout=1500)
            return
        except TimeoutError:
            page.keyboard.press('Escape')
    wait_js(page, 'interlagos.state.paused')


def wait_race_start(page, timeout=30000):
    """The free race opens with 3-2-1-VAI!; the car stays frozen until it ends."""
    try:
        wait_js(page, "!document.querySelector('#raceCountdown').hidden", timeout=1500)
    except TimeoutError:
        pass  # Immersive and recognition sessions have no free-race countdown.
    wait_js(page, "document.querySelector('#raceCountdown').hidden", timeout=timeout)
