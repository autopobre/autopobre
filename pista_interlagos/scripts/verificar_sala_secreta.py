"""A room's secret off the screen (lives): #desafio=Amigos_Segredo7 opens the room amigossegredo7, the address
bar right away reads #desafio=Amigos_***, the room card shows no name at all, nothing on the page says the secret;
F5 on the hidden address is the same room; the hidden address on another browser (copied off a stream)
opens no room, the card says to ask for the whole link; the old links (#sala=, #corrida=) open the plain
game and ask for no multiplayer file. Usage: verificar_sala_secreta.py [porta].
Screens in renders/: sala_secreta_*.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/?intro=0&cinema=off'
RENDERS=Path(__file__).resolve().parents[1]/'renders';RENDERS.mkdir(exist_ok=True)
SECRET='Segredo7'
ROOM="()=>window.interlagosSala?{...interlagosSala.info(),card:document.querySelector('#mpRoom')?.innerText??''}:null"
errors=[];result={}
def secret_free(page):
 text=page.evaluate("()=>document.body.innerText+' '+location.href+' '+document.title").lower()
 assert SECRET.lower() not in text,text[:400]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 streamer=browser.new_context(viewport={'width':1280,'height':800})
 page=streamer.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'{URL}#desafio=Amigos_{SECRET}&local=1',wait_until='load')
 wait_js(page,'window.interlagosSala&&interlagosSala.info().role')
 a=page.evaluate(ROOM)
 assert a['room']=='amigossegredo7' and a['label']=='amigos_***' and a['address']=='#desafio=Amigos_***&local=1',a
 assert 'amigos' not in a['card'].lower(),a['card'];secret_free(page)
 page.screenshot(path=str(RENDERS/'sala_secreta_cartao.png'))
 result['aberta']={'sala':a['room'],'cartao':a['label'],'endereco':a['address'],'papel':a['role']}

 # F5 on the hidden address: the same room.
 page.reload(wait_until='load');wait_js(page,'window.interlagosSala&&interlagosSala.info().role')
 b=page.evaluate(ROOM);assert b['room']=='amigossegredo7' and b['address']=='#desafio=Amigos_***&local=1',b;secret_free(page)
 result['f5']={'sala':b['room'],'endereco':b['address']}

 # The hidden address copied off the stream, on another browser: no room, the card says why.
 viewer=browser.new_context(viewport={'width':1280,'height':800}).new_page();viewer.on('pageerror',lambda e:errors.append(str(e)))
 viewer.goto(f'{URL}#desafio=Amigos_***&local=1',wait_until='load')
 wait_js(viewer,"document.querySelector('#mpRoom .mp-status')?.textContent.includes('link completo')")
 c=viewer.evaluate("()=>({room:!!window.interlagosSala,card:document.querySelector('#mpRoom').innerText})")
 assert not c['room'] and 'amigos' not in c['card'].lower(),c
 viewer.screenshot(path=str(RENDERS/'sala_secreta_link_escondido.png'))
 result['link_escondido']=c['card'].replace('\n',' · ')

 # The old links (#sala=, #corrida=), even on the streamer's browser: the plain game, no multiplayer file asked for.
 page.close();result['links_antigos']={}
 for old in ('sala','corrida'):
  o=streamer.new_page();o.on('pageerror',lambda e:errors.append(str(e)));asked=[];o.on('request',lambda r:asked.append(r.url))
  o.goto(f'{URL}#{old}=amigos&local=1',wait_until='networkidle');o.wait_for_selector('#start:not([disabled])')
  d=o.evaluate("()=>({room:!!window.interlagosSala,card:!!document.querySelector('#mpRoom'),address:location.hash})")
  assert not d['room'] and not d['card'] and d['address']==f'#{old}=amigos&local=1',d
  assert not any('/multiplayer.' in u or '/net-' in u for u in asked),[u for u in asked if 'multiplayer' in u or '/net-' in u]
  result['links_antigos'][old]='jogo normal, sem sala';o.close()
 browser.close()
assert not errors,errors
print(json.dumps(result,ensure_ascii=False,indent=1))
print('Room secret passed in the browser: the card shows no name, the address bar hides the secret, F5 keeps the room, the hidden link alone opens none.')
