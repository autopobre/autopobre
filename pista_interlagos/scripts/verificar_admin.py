"""The admin panel in the browser (admin.html, the dev build's), as on dev.autopobre.com.br: the local preview (servidor.py)
passes /api/ on to the accounts server on this machine (conta-cloudflare/teste/local.mjs, its stand-in Google, one
account made admin). An admin sees the summary, the accounts, the events (by kind) and the last records; a pilot sees
"Acesso só para administradores"; signed out, the page says to sign in first. The game's "Sua conta" has the panel's
link for the admin only. Also on a phone. Usage: verificar_admin.py [porta] (the accounts server takes porta+1000).
Needs node (INTERLAGOS_NODE=node.exe when node is not on the PATH). Screens in renders/: admin_*.png."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from time import sleep
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js

PORT=int(sys.argv[1]) if len(sys.argv)>1 else 8879
API=PORT+1000
ROOT=Path(__file__).resolve().parents[2]
GAME=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
PANEL=GAME+'admin.html'
ADMIN,PILOT='500000000000000000001','500000000000000000002'
RENDERS=Path(__file__).resolve().parents[1]/'renders';RENDERS.mkdir(exist_ok=True)
node=os.environ.get('INTERLAGOS_NODE') or shutil.which('node')
assert node,'node not found: set INTERLAGOS_NODE'
errors=[];result={};servers=[]

def start(args,ready):
 proc=subprocess.Popen(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);servers.append(proc)
 for _ in range(100):
  try:
   with urlopen(ready,timeout=1):return proc
  except Exception as error:
   if getattr(error,'code',None):return proc
   sleep(.2)
 raise RuntimeError('did not start: '+' '.join(args))

def sign_in(page,sub,back):
 with urlopen(f'http://127.0.0.1:{API}/falso-google/proxima?sub={sub}'):pass
 page.goto(f'http://127.0.0.1:{PORT}/api/conta/entrar?volta=/pista_interlagos/teste/{back}',wait_until='load')

try:
 start([node,'--no-warnings','conta-cloudflare/teste/local.mjs','--porta',str(API),'--origem',f'http://127.0.0.1:{PORT}','--admins',ADMIN],f'http://127.0.0.1:{API}/api/conta/eu')
 start([sys.executable,'pista_interlagos/scripts/servidor.py',str(PORT),'--no-browser','--conta-porta',str(API)],GAME)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
  # Signed out: the page asks for the account first.
  nobody=browser.new_context().new_page();nobody.on('pageerror',lambda e:errors.append(str(e)))
  nobody.goto(PANEL,wait_until='load');wait_js(nobody,"document.getElementById('aviso').textContent.includes('Entre com a sua conta')")
  assert nobody.locator('#painel').is_hidden();result['sem_login']=nobody.text_content('#aviso')
  # A pilot with something to show: a nickname and an old record.
  pilot=browser.new_context().new_page();pilot.on('pageerror',lambda e:errors.append(str(e)))
  sign_in(pilot,PILOT,'admin.html')
  pilot.evaluate("""async()=>{const post=(p,b)=>fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
   await post('/api/conta/apelido',{apelido:'Piloto Dois'});await post('/api/recordes/importar',{recordes:[{circuito:'cascavel',modo:'normal',volta_ms:80500}]});}""")
  pilot.reload(wait_until='load');wait_js(pilot,"document.getElementById('aviso').textContent.includes('administradores')")
  assert pilot.locator('#painel').is_hidden();result['piloto']=pilot.text_content('#aviso')
  pilot.screenshot(path=str(RENDERS/'admin_piloto.png'))
  # The admin: the panel, its numbers and tables.
  context=browser.new_context(viewport={'width':1280,'height':900});admin=context.new_page();admin.on('pageerror',lambda e:errors.append(str(e)))
  sign_in(admin,ADMIN,'admin.html');wait_js(admin,"!document.getElementById('painel').hidden")
  cards=admin.evaluate("[...document.querySelectorAll('.cartao')].map(c=>[c.querySelector('span').textContent,c.querySelector('b').textContent])")
  assert dict(cards)['Contas']=='2' and dict(cards)['Recordes ⚠️']=='1',cards
  users=admin.evaluate("[...document.querySelectorAll('#usuarios tbody tr')].map(tr=>tr.children[0].textContent)")
  assert 'Piloto Dois' in users and '(sem apelido) · admin' in users,users
  kinds=admin.evaluate("[...document.querySelectorAll('#eventos tbody tr td.tipo')].map(td=>td.textContent)")
  assert {'Conta criada','Trocou o apelido','Subiu recordes antigos'}<=set(kinds),kinds
  records=admin.evaluate("[...document.querySelectorAll('#recordes tbody tr')].map(tr=>tr.textContent)")
  assert len(records)==1 and 'Cascavel' in records[0] and '1:20.500' in records[0] and '⚠️' in records[0],records
  admin.select_option('#tipo','importou');wait_js(admin,"document.querySelectorAll('#eventos tbody tr').length===1")
  admin.select_option('#tipo','');wait_js(admin,"document.querySelectorAll('#eventos tbody tr').length>1")
  admin.screenshot(path=str(RENDERS/'admin_painel.png'),full_page=True)
  result['admin']={'cartoes':dict(cards),'usuarios':users,'eventos':kinds}
  # The game's "Sua conta": the panel's link for the admin, not for the pilot.
  admin.goto(GAME+'?intro=0&cinema=off',wait_until='load');wait_js(admin,"document.getElementById('contaFaixa')?.hidden===false")
  admin.click('#contaBotao');wait_js(admin,"document.getElementById('contaDialog').open")
  assert admin.is_visible('#contaPainel'),'the admin sees the panel link'
  pilot.goto(GAME+'?intro=0&cinema=off',wait_until='load');wait_js(pilot,"!!document.querySelector('#pilotAccount:not([hidden])')")
  pilot.click('#pilotAccount');wait_js(pilot,"document.getElementById('contaDialog').open")
  assert not pilot.is_visible('#contaPainel'),'a pilot does not'
  # On a phone.
  phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
  phone.add_cookies(context.cookies());mobile=phone.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)))
  mobile.goto(PANEL,wait_until='load');wait_js(mobile,"!document.getElementById('painel').hidden")
  assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no sideways page scroll on a phone'
  mobile.screenshot(path=str(RENDERS/'admin_celular.png'),full_page=True)
  browser.close()
finally:
 for proc in servers:
  if proc.poll() is None:proc.terminate()
  try:proc.wait(10)
  except Exception:proc.kill()
assert not errors,errors
print(json.dumps(result,ensure_ascii=False,indent=1))
print('The admin panel passed in the browser: signed out, a pilot refused, the admin\'s numbers and tables, the link, a phone.')
