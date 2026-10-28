"""HTTP and browser regression checks for the publication boundary."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, enter_track, pause_race
from publicacao import ROOT, PUBLIC_FILES, contained_file, security_headers
from servidor import Handler


def main():
    dist = ROOT / 'dist'
    if not (dist / 'index.html').is_file():
        raise SystemExit('Build the release first: python pista_interlagos/scripts/preparar_publicacao.py')
    report = {'checks': {}, 'browser_errors': []}
    # The main link's build leaves the multiplayer out; a --multiplayer build is the /dev/ one. The accounts come
    # only with --conta (dev.autopobre.com.br), whose server answers /api/conta/ on the same origin.
    multiplayer = (dist / 'multiplayer.js').is_file()
    conta = (dist / 'conta.js').is_file()

    def check(name, value):
        report['checks'][name] = bool(value)
        print(name, bool(value), flush=True)
        assert value, name

    class ReleaseHandler(SimpleHTTPRequestHandler):
        # No accounts server here: /api/ answers nothing, as servidor.py does when that server is not running.
        def do_GET(self):
            if self.path.startswith('/api/'):
                self.send_response(204)
                self.end_headers()
                return
            super().do_GET()

        def translate_path(self, path):
            translated = super().translate_path(path.removeprefix('/preview'))
            return translated

        def end_headers(self):
            for name, value in security_headers((dist / 'index.html').read_text(encoding='utf-8'), multiplayer=multiplayer).items():
                self.send_header(name, value)
            super().end_headers()

        def list_directory(self, path):
            self.send_error(404)

        def log_message(self, *args):
            pass

    class TestServer(ThreadingHTTPServer):
        # Repeated browser reloads create bursts of short HTTP/1.0 connections.
        # The default backlog of five can refuse image/module requests on Windows.
        request_queue_size = 64

    local = TestServer(('127.0.0.1', 0), Handler)
    release = TestServer(('127.0.0.1', 0), functools.partial(ReleaseHandler, directory=str(dist)))
    for server in (local, release):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    local_url = f'http://127.0.0.1:{local.server_port}'

    def status(path, headers=None):
        try:
            with urlopen(Request(local_url + path, headers=headers or {})) as response:
                return response.status
        except HTTPError as error:
            return error.code

    try:
        for path in ['/.git/config', '/.env', '/carro/', '/pista_interlagos/scripts/servidor.py',
                     '/pista_interlagos/README.md', '/pista_interlagos/dados/',
                     '/pista_interlagos/teste/assets/', '/pista_interlagos/teste/package-lock.json',
                     '/pista_interlagos/teste/../../../.env', '/pista_interlagos/teste/%2e%2e/%2e%2e/.env',
                     '/pista_interlagos/teste/%5c..%5c.env']:
            check('blocked:' + path, status(path) == 404)
        check('host_header_rejected', status('/pista_interlagos/teste/', {'Host': 'untrusted.example'}) == 403)
        check('cross_site_fetch_rejected', status('/pista_interlagos/teste/main.js', {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors'}) == 403)
        for invalid in ['../outside.txt', '/outside.txt']:
            try:
                contained_file(ROOT, invalid)
            except ValueError:
                continue
            raise AssertionError('Path containment failed')
        check('path_containment', True)
        with urlopen(local_url + '/pista_interlagos/teste/') as response:
            check('security_headers', response.headers['X-Content-Type-Options'] == 'nosniff' and "frame-ancestors 'none'" in response.headers['Content-Security-Policy'])
            check('no_python_version', 'Python' not in response.headers.get('Server', ''))
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
            page = browser.new_page(viewport={'width':1280, 'height':800})
            page.set_default_timeout(120000)
            page.on('pageerror', lambda error: report['browser_errors'].append(str(error)))
            console_errors = []
            page.on('requestfailed', lambda request: print('Request failed:', request.url, request.failure, flush=True))
            page.on('console', lambda message: (console_errors.append(message.text), print(message.text, flush=True)) if message.type == 'error' else None)
            page.goto(local_url + '/pista_interlagos/teste/', wait_until='networkidle')
            page.wait_for_selector('#start:not([disabled])')
            check('local_game_ready_with_csp', True)
            # A blank page between the two: a late request of the local game (its accounts, its palpites link) must not
            # count as the release's.
            page.goto('about:blank')
            requests = []
            page.on('request', lambda request: requests.append(request.url))
            base = f'http://127.0.0.1:{release.server_port}/preview/'
            page.goto(base, wait_until='networkidle')
            page.wait_for_selector('#start:not([disabled])')
            check('release_ready_in_subdirectory', True)
            check('logo_visible', page.locator('.opening-brand img:not(.old-stock-opening)').is_visible())
            check('opening_offers_modes', page.is_visible('#start') and page.is_visible('#storyStart') and not page.is_visible('#singleRace') and page.locator('#menu #tour').count()==0)
            page.click('#settingsButton')
            page.select_option('#camera', 'aerial')
            page.select_option('#livery', 'seiva_danilo')
            page.click('#tab-audio');page.locator('#volume').fill('23'); page.click('#mute')
            page.reload(wait_until='networkidle'); page.wait_for_selector('#start:not([disabled])')
            check('camera_and_livery_restored', page.input_value('#camera')=='aerial' and page.input_value('#livery')=='seiva_danilo')
            check('audio_preferences_restored', page.input_value('#volume')=='23' and page.locator('#mute').get_attribute('aria-pressed')=='true')
            enter_track(page, pilot='Piloto seguranca'); page.click('#cockpitButton'); page.click('#skinButton')
            page.wait_for_selector('#skinButton:not([disabled])')
            page.reload(wait_until='networkidle'); page.wait_for_selector('#start:not([disabled])')
            check('track_buttons_preferences_restored', page.input_value('#camera')=='cockpit' and page.input_value('#livery')=='assinaturas_omp')
            check('corrida_choice_persists', page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).immersive===false"))
            enter_track(page)
            page.click('#cockpitButton')
            page.evaluate("interlagos.setLivery('seiva_danilo')")
            check('second_skin', page.locator('#skinButton').inner_text().find('Seiva') >= 0)
            check('invalid_livery_rejected', page.evaluate("async()=>{try{await interlagos.setLivery('../../.env');return false}catch{return true}}"))
            page.reload(wait_until='networkidle'); page.wait_for_selector('#start:not([disabled])')
            check('menu_waits_for_mode_choice', page.is_visible('#start') and not page.evaluate('interlagos.ready'))
            enter_track(page, story=True)
            check('immersive_starts', page.evaluate("interlagos.immersiveInfo().phase==='crowd'"))
            pause_race(page); page.click('#settingsButton'); page.click('#tab-tour'); page.click('#tour')
            wait_js(page, 'interlagos.ready&&!interlagos.state.paused')
            check('normal_mode_returns', not page.evaluate('interlagos.immersiveInfo().active'))
            page.click('#menuButton')
            page.screenshot(path=str(ROOT / '.audit-local/security_release.png'))
            if not multiplayer:
                # A room address on the main link opens the plain game and asks for no multiplayer file.
                page.goto(base + 'index.html#desafio=verificacao', wait_until='networkidle')
                page.wait_for_selector('#start:not([disabled])')
                check('room_address_ignored_without_multiplayer', page.locator('#mpRoom').count() == 0
                      and not any('/multiplayer.' in url or '/net-' in url for url in requests))
            # The accounts' own API sits at the site's root (/api/conta/, /api/recordes/, /api/palpites), the same origin, only
            # in the --conta build.
            account_api = f'http://127.0.0.1:{release.server_port}/api/'
            check('account_api_only_with_accounts', conta or not any('/api/' in url for url in requests))
            check('account_hidden_without_its_server', page.locator('#contaFaixa:not([hidden])').count() == 0)
            outside = [url for url in requests if not (url.startswith(base) or url.startswith('blob:') or url.startswith('data:') or (conta and url.startswith(account_api)))]
            if outside:
                report['outside_requests'] = outside
                print('Requests outside the release:', outside, flush=True)
            check('no_external_network', not outside)
            check('no_unexpected_browser_errors', not report['browser_errors'] and not console_errors)
            page.evaluate("()=>{const s=document.createElement('script');s.textContent='window.inlineInjectionRan=true';document.body.append(s)}")
            check('csp_blocks_inline_script', page.evaluate('window.inlineInjectionRan!==true'))
            check('corrupt_profile_sanitized', page.evaluate("async()=>{const {ImmersiveState}=await import('./immersive-state.js');const a=new ImmersiveState({fund:'<img src=x onerror=alert(1)>',races:Infinity,released:'false'});const b=new ImmersiveState(null);return a.profile.fund===0&&a.profile.races===0&&!a.profile.released&&b.profile.fund===0}"))
            browser.close()
        report['passed'] = True
    finally:
        for server in (local, release):
            server.shutdown(); server.server_close()
        report.setdefault('passed', False)
        (ROOT / '.audit-local').mkdir(exist_ok=True)
        (ROOT / '.audit-local/security_checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
