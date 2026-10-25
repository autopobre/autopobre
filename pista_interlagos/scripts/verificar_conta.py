"""The account in the browser, as on dev.autopobre.com.br: the local preview (servidor.py) passes /api/ on to the
accounts server on this machine (conta-cloudflare/teste/local.mjs, with its stand-in Google), so page and account
share one origin. The menu line says "Entrar com Google"; signing in goes to Google and back, opens "Sua conta" to
pick the nickname (the menu's pilot offered); then the nickname is the menu's pilot (shown, not typed: one name) and
the line goes, the next screens say it; the session cookie is __Host-, HttpOnly, Secure, SameSite=Lax; typing the
nickname drives nothing; F5 keeps the account; the player's data downloads; sign-out gives the name field back (with
the name) and the line; the line is gone mid-race; a cancelled sign-in (told on the way back), signing in again (the
nickname kept, no dialog), deleting the account (a second click confirms); with the accounts server down the menu
shows no account. Also on a phone.
Usage: verificar_conta.py [porta] (the preview's; the accounts server takes porta+1000).
Needs node (INTERLAGOS_NODE=node.exe when node is not on the PATH). Screens in renders/: conta_*.png."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen
from time import sleep
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js

PORT=int(sys.argv[1]) if len(sys.argv)>1 else 8869
API=PORT+1000
ROOT=Path(__file__).resolve().parents[2]
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?intro=0&cinema=off'
RENDERS=Path(__file__).resolve().parents[1]/'renders';RENDERS.mkdir(exist_ok=True)
node=os.environ.get('INTERLAGOS_NODE') or shutil.which('node')
assert node,'node not found: set INTERLAGOS_NODE'
STRIP="()=>({shown:!document.getElementById('contaFaixa')?.hidden&&!!document.getElementById('contaFaixa'),label:document.getElementById('contaRotulo')?.textContent??null,dialog:!!document.getElementById('contaDialog')?.open,notice:document.getElementById('contaAviso')?.textContent??'',account:document.getElementById('pilotAccount')?.hidden===false?document.querySelector('#pilotAccount span').textContent:null,field:!document.getElementById('pilotName').hidden||!document.getElementById('pilotSelect').hidden,typed:document.getElementById('pilotSelect').hidden?document.getElementById('pilotName').value:document.getElementById('pilotSelect').value})"
errors=[];result={};servers=[]

def start(args,ready):
 proc=subprocess.Popen(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 servers.append(proc)
 for _ in range(100):
  try:
   with urlopen(ready,timeout=1):return proc
  except Exception as error:
   if getattr(error,'code',None):return proc
   sleep(.2)
 raise RuntimeError('did not start: '+' '.join(args))

def accounts(**params):
 with urlopen(f'http://127.0.0.1:{API}/falso-google/proxima?'+'&'.join(f'{k}={v}' for k,v in params.items())) as r:return json.load(r)

def stop_accounts():
 servers[0].terminate();servers[0].wait(10)

try:
 start([node,'--no-warnings','conta-cloudflare/teste/local.mjs','--porta',str(API),'--origem',f'http://127.0.0.1:{PORT}'],f'http://127.0.0.1:{API}/api/conta/eu')
 start([sys.executable,'pista_interlagos/scripts/servidor.py',str(PORT),'--no-browser','--conta-porta',str(API)],f'http://127.0.0.1:{PORT}/pista_interlagos/teste/')
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
  context=browser.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(URL,wait_until='load');wait_js(page,"document.getElementById('contaFaixa')?.hidden===false")
  s=page.evaluate(STRIP);assert s['shown'] and s['label']=='Entrar com Google',s
  page.screenshot(path=str(RENDERS/'conta_menu_fora.png'))
  page.click('#contaBotao');wait_js(page,"document.getElementById('contaDialog').open")
  page.screenshot(path=str(RENDERS/'conta_janela_fora.png'))
  pilot=page.evaluate("()=>document.getElementById('pilotName')?.value||''")
  result['fora']={'faixa':s['label'],'piloto_do_menu':pilot}

  # An old record of this browser, under the name the pilot will take: it goes up once, flagged unchecked.
  page.evaluate("""localStorage.setItem('autopobre-records-v1',JSON.stringify([{circuit:'interlagos',name:'Piloto Teste',mode:'normal',bestLap:98.765,bestRace:null,raceLaps:3,date:'2026-10-01T12:00:00Z'},
   {circuit:'interlagos',name:'Outra Pessoa',mode:'normal',bestLap:90,bestRace:null,raceLaps:3,date:''}]))""")
  # To Google and back: the dialog asks for the nickname, the menu's pilot offered.
  accounts(sub='100000000000000000777')
  page.click('#contaEntrar');page.wait_for_url(URL,timeout=60000);wait_js(page,"document.getElementById('contaDialog')?.open")
  s=page.evaluate(STRIP);assert s['label']=='Escolha seu apelido' and 'escolha o apelido' in s['notice'],s
  pilot=page.input_value('#pilotName')   # the menu learns the names of this browser's records: the old one's now
  offered=page.input_value('#contaApelido');assert offered==pilot=='Piloto Teste',(offered,pilot)
  cookie=next(c for c in context.cookies() if c['name']=='__Host-ap_sessao')
  assert cookie['httpOnly'] and cookie['secure'] and cookie['sameSite']=='Lax' and cookie['path']=='/' and cookie['domain']=='127.0.0.1',cookie
  assert not any(c['name']=='__Host-ap_login' for c in context.cookies())
  page.screenshot(path=str(RENDERS/'conta_janela_apelido.png'))
  # Typing the nickname reaches nothing outside the dialog (main.js reads the keys on the document).
  reached=page.evaluate("()=>{window.__keys=0;document.addEventListener('keydown',()=>window.__keys++);return 0;}")
  page.fill('#contaApelido','');page.type('#contaApelido','Piloto Teste');page.keyboard.press('KeyM')
  assert page.evaluate('window.__keys')==0,'a key left the dialog'
  page.fill('#contaApelido','Piloto Teste');page.click('#contaSalvar')
  wait_js(page,"document.getElementById('contaAviso').textContent==='Apelido salvo.'")
  s=page.evaluate(STRIP);assert s['account']=='Piloto Teste' and not s['field'] and not s['shown'],s
  page.screenshot(path=str(RENDERS/'conta_janela_dentro.png'))
  page.keyboard.press('Escape');wait_js(page,"!document.getElementById('contaDialog').open")
  page.screenshot(path=str(RENDERS/'conta_menu_dentro.png'))
  # The nickname is the pilot on the next screens too (the menu's commit takes the account's name).
  page.click('#start');wait_js(page,"!document.getElementById('cars').classList.contains('hidden')")
  assert page.text_content('#carsPilot').startswith('Piloto: Piloto Teste'),page.text_content('#carsPilot')
  page.click('#carsBack');wait_js(page,"!document.getElementById('menu').classList.contains('hidden')")
  # The old record went up (the browser is marked), and the records' Online tab shows it flagged ⚠️, the pilot's own row.
  wait_js(page,"!!localStorage.getItem('autopobre-recordes-importados-v1')")
  page.click('#recordsButton');page.click('[data-records-source=online]')
  wait_js(page,"[...document.querySelectorAll('#lapRecords tbody tr')].some(tr=>tr.textContent.includes('Piloto Teste'))")
  rows=page.evaluate("[...document.querySelectorAll('#lapRecords tbody tr')].map(tr=>({text:tr.textContent,mine:tr.hasAttribute('data-mine'),badge:tr.querySelector('.record-online-badge')?.textContent}))")
  assert len(rows)==1 and '01:38.765' in rows[0]['text'] and rows[0]['badge']=='🌐 ⚠️' and rows[0]['mine'],rows
  page.screenshot(path=str(RENDERS/'conta_recordes_online.png'))
  # Todos joins them: this browser's people, the AI and the accounts; the pilot once (the account's row: the same time).
  page.click('[data-records-source=all]')
  wait_js(page,"!!document.querySelector('#lapRecords tbody tr[data-source=online]')")
  todos=page.evaluate("[...document.querySelectorAll('#lapRecords tbody tr')].map(tr=>({name:tr.children[1].firstChild.textContent,source:tr.dataset.source,mine:tr.hasAttribute('data-mine')}))")
  assert [r['source'] for r in todos if r['name']=='Piloto Teste']==['online'] and todos[[r['name'] for r in todos].index('Piloto Teste')]['mine'],todos
  assert any(r['source']=='ai' for r in todos) and any(r['name']=='Outra Pessoa' and r['source']=='human' for r in todos),todos
  page.screenshot(path=str(RENDERS/'conta_recordes_todos.png'))
  page.keyboard.press('Escape');wait_js(page,"!document.getElementById('lapRecords').open")
  result['recordes_online']={'linha':rows[0]['text'],'selo':rows[0]['badge'],'todos':len(todos)}
  # What is kept: an "i" that opens the technical account.
  page.click('#pilotAccount');page.click('.conta-info summary')
  assert page.evaluate("document.querySelector('.conta-info').open&&document.querySelector('.conta-info').textContent.includes('openid')")
  page.screenshot(path=str(RENDERS/'conta_info.png'))
  page.keyboard.press('Escape');wait_js(page,"!document.getElementById('contaDialog').open")
  result['entrou']={'faixa':s['label'],'cookie':{k:cookie[k] for k in ('name','httpOnly','secure','sameSite','path')}}

  # F5 keeps the account; the player's data downloads.
  page.reload(wait_until='load');wait_js(page,"document.querySelector('#pilotAccount:not([hidden]) span')?.textContent==='Piloto Teste'")
  assert not page.evaluate(STRIP)['dialog']
  page.click('#pilotAccount')
  with page.expect_download() as download:page.click('#contaDados')
  data=json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
  assert data['conta']['apelido']=='Piloto Teste' and data['conta']['identificador_google']=='100000000000000000777',data
  result['meus_dados']=download.value.suggested_filename

  # Sign-out, then a cancelled sign-in, told on the way back.
  page.click('#contaSair');wait_js(page,"document.getElementById('contaRotulo').textContent==='Entrar com Google'")
  assert not any(c['name']=='__Host-ap_sessao' for c in context.cookies())
  s=page.evaluate(STRIP);assert s['shown'] and s['account'] is None and s['field'] and s['typed']=='Piloto Teste',s
  # Mid-race (the pause menu) the line is gone: signing in there would leave the race.
  page.evaluate("document.getElementById('menu').classList.add('in-session')");assert not page.is_visible('#contaFaixa')
  page.evaluate("document.getElementById('menu').classList.remove('in-session')");assert page.is_visible('#contaFaixa')
  accounts(spoil='cancel');page.click('#contaEntrar');page.wait_for_url(URL,timeout=60000)
  wait_js(page,"document.getElementById('contaDialog')?.open");s=page.evaluate(STRIP)
  assert s['label']=='Entrar com Google' and 'cancelado' in s['notice'],s
  page.screenshot(path=str(RENDERS/'conta_cancelado.png'))
  result['cancelado']=s['notice']

  # Back in: the nickname is kept, so no dialog.
  accounts(sub='100000000000000000777');page.click('#contaEntrar');page.wait_for_url(URL,timeout=60000)
  wait_js(page,"document.querySelector('#pilotAccount:not([hidden]) span')?.textContent==='Piloto Teste'");assert not page.evaluate(STRIP)['dialog']
  result['voltou']='Piloto Teste, sem janela'

  # Deleting: the first click asks, the second deletes.
  page.click('#pilotAccount');page.click('#contaApagar')
  assert page.text_content('#contaApagar')=='Confirmar: apagar tudo' and page.evaluate(STRIP)['account']=='Piloto Teste'
  page.screenshot(path=str(RENDERS/'conta_apagar_confirmar.png'))
  page.click('#contaApagar');wait_js(page,"document.getElementById('contaRotulo').textContent==='Entrar com Google'")
  result['apagada']=page.evaluate(STRIP)['notice']

  # On a phone, lying down.
  phone=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2)
  mobile=phone.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)))
  mobile.goto(URL,wait_until='load');wait_js(mobile,"document.getElementById('contaFaixa')?.hidden===false")
  mobile.screenshot(path=str(RENDERS/'conta_celular_menu.png'))
  mobile.tap('#contaBotao');wait_js(mobile,"document.getElementById('contaDialog').open")
  box=mobile.locator('#contaDialog').bounding_box();assert box['width']<=844 and box['height']<=390,box
  mobile.screenshot(path=str(RENDERS/'conta_celular_janela.png'));phone.close()

  # Without the accounts server, no account on the menu.
  stop_accounts();page.reload(wait_until='load');page.wait_for_selector('#start:not([disabled])')
  sleep(1);s=page.evaluate(STRIP);assert not s['shown'],s
  result['sem_servidor']='sem linha de conta no menu'
  browser.close()
finally:
 for proc in servers:
  if proc.poll() is None:proc.terminate()
  try:proc.wait(10)
  except Exception:proc.kill()
assert not errors,errors
print(json.dumps(result,ensure_ascii=False,indent=1))
print('The account passed in the browser: sign-in through Google and back, nickname, F5, my data, sign-out, cancel, delete, phone.')
