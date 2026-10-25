"""Local preview only. Serves the explicit public file list, never the workspace.

/api/ goes on to the accounts server on this machine (conta-cloudflare: `npm run local`, or wrangler dev), on
--conta-porta (8788), so the page and its account share one origin as on dev.autopobre.com.br. Without it
running, /api/ answers 204 (nothing, and no error in the browser's console) and the game shows no account."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import argparse
import http.client
import socket
import webbrowser
import io
import json
from urllib.parse import urlsplit, unquote
from urllib.request import urlopen
from publicacao import ROOT, GAME, PUBLIC_FILES, OPTIONAL_AUDIO, audio_manifest, contained_file, security_headers


class Handler(SimpleHTTPRequestHandler):
    server_version = 'AutoPobrePreview'
    sys_version = ''
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript',
                      '.glb': 'model/gltf-binary', '.json': 'application/json'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed_host(self):
        port = self.server.server_port
        return self.headers.get('Host', '').lower() in {f'127.0.0.1:{port}', f'localhost:{port}'}

    def do_GET(self):
        if urlsplit(self.path).path.startswith('/api/'):
            return self.pass_to_accounts()
        return super().do_GET()

    def do_HEAD(self):
        if urlsplit(self.path).path.startswith('/api/'):
            return self.pass_to_accounts()
        return super().do_HEAD()

    def do_POST(self):
        if urlsplit(self.path).path.startswith('/api/'):
            return self.pass_to_accounts()
        self.send_error(405, 'Method not allowed')

    # The request as the browser sent it (cookies, Origin, JSON), and the answer as the server gave it
    # (redirects not followed: the sign-in sends the browser to Google and back).
    PASSED_IN = {'cookie', 'origin', 'content-type', 'accept', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'user-agent'}
    PASSED_OUT = {'content-type', 'location', 'set-cookie', 'cache-control', 'content-disposition'}

    def pass_to_accounts(self):
        if not self.allowed_host():
            self.send_error(403, 'Forbidden')
            return
        length = int(self.headers.get('Content-Length') or 0)
        if length > 65536:
            self.send_error(413, 'Too large')
            return
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() in self.PASSED_IN}
        try:
            connection = http.client.HTTPConnection('127.0.0.1', getattr(self.server, 'accounts_port', 8788), timeout=20)
            connection.request(self.command, self.path, body=body, headers=headers)
            answer = connection.getresponse()
            data = answer.read()
        except OSError:
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(answer.status)
        for name, value in answer.getheaders():
            if name.lower() in self.PASSED_OUT:
                self.send_header(name, value)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def send_head(self):
        if not self.allowed_host():
            self.send_error(403, 'Forbidden')
            return None
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' and self.headers.get('Sec-Fetch-Mode') != 'navigate':
            self.send_error(403, 'Forbidden')
            return None
        path = unquote(urlsplit(self.path).path)
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/' + GAME)
            self.end_headers()
            return None
        if path == '/' + GAME:
            path += 'index.html'
        if path == '/' + GAME + 'assets/audio/tracks.json':
            try:
                data = json.dumps(audio_manifest()).encode('utf-8')
            except (ValueError, OSError):
                self.send_error(404, 'Not found')
                return None
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return io.BytesIO(data)
        allowed = {'/' + src for src in [*PUBLIC_FILES.values(), *OPTIONAL_AUDIO.values()]}
        if path not in allowed:
            self.send_error(404, 'Not found')
            return None
        try:
            self.public_path = contained_file(ROOT, path[1:])
        except (ValueError, OSError):
            self.send_error(404, 'Not found')
            return None
        return super().send_head()

    def translate_path(self, path):
        return str(self.public_path)

    def list_directory(self, path):
        self.send_error(404, 'Not found')
        return None

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except ConnectionError:
            pass  # The browser cancelled a download or closed the tab.

    def end_headers(self):
        html = (ROOT / GAME / 'index.html').read_text(encoding='utf-8')
        for name, value in security_headers(html, dev=True).items():
            self.send_header(name, value)
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-AutoPobre-Preview', 'restricted-v1')
        super().end_headers()

    def log_message(self, *args):
        pass


class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False
    # The page asks for dozens of ES modules at once; the default backlog (5) refused some.
    request_queue_size = 128

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('port', nargs='?', type=int, default=8799)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--conta-porta', type=int, default=8788, help='the accounts server on this machine (/api/)')
    args = parser.parse_args()
    for candidate in range(args.port, min(args.port + 10, 65536)):
        url = f'http://127.0.0.1:{candidate}/' + GAME
        try:
            with urlopen(url, timeout=1) as response:
                existing = response.headers.get('X-AutoPobre-Preview') == 'restricted-v1'
            if existing:
                print(url, flush=True)
                if not args.no_browser:
                    webbrowser.open(url)
                return
        except OSError:
            pass
        try:
            server = LocalServer(('127.0.0.1', candidate), Handler)
            server.accounts_port = args.conta_porta
            break
        except OSError:
            pass
    else:
        raise RuntimeError('Nenhuma porta local livre no intervalo solicitado.')
    print(url, flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
