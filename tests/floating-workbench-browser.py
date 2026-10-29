from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright
import json, datetime
from pathlib import Path
state={'note':'原来的碎碎念','version':1,'writes':0,'fail':False}
now=datetime.datetime.now(datetime.timezone.utc).isoformat(); todo='5f49a849-25b4-4cbf-a0f1-c417fa709dd0'; note='be89a849-25b4-4cbf-a0f1-c417fa709dd0'
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,data,status=200):
  payload=json.dumps({'data':data},ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
 def do_GET(self):
  u=urlsplit(self.path);q=parse_qs(u.query);path=u.path
  if path=='/api/v1/auth/me': return self.respond({'id':'synthetic-user','username':'synthetic','publicBusiness':True})
  if path=='/api/v1/workbench-snapshot/index': return self.respond({'scope_id':'a'*64,'complete':True,'projection':'current'})
  if path=='/api/v1/todos':
   date=q.get('date',[''])[0];return self.respond({'items':[{'id':todo,'date':date,'text':'合成待办','completed':False,'version':1,'created_at':now,'updated_at':now,'deleted_at':None}],'completed_mode':'strike','preferences_version':1})
  if path=='/api/v1/daily-notes':return self.respond({'date':q.get('date',[''])[0],'text':'','version':0,'deleted':False,'can_edit':False})
  if path=='/api/v1/note-entries/labels':return self.respond({'labels_version':3,'labels':[{'name':'测试标签','created_at':now}],'archived_labels':[]})
  if path=='/api/v1/note-entries':
   date=q.get('date',[''])[0];category=q.get('category',['life'])[0];version=int(self.headers.get('X-Note-Labels-Version','0'));items=[]
   if category=='life':items=[{'id':note,'category':'life','date':date,'text':state['note'],'version':state['version'],'deleted':False,'can_edit':True,'created_at':now,'updated_at':now,'deleted_at':None,'change_seq':1,'content_hash':'c'*64,'labels_version':version,**({'labels':['生活']} if version>=2 else {'label':None})}]
   return self.respond({'category':category,'date':date,'entries':items,'can_edit':True,'labels_version':version})
  if path=='/api/v1/note-entries/'+note:
   return self.respond({'id':note,'category':'life','date':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat(),'text':state['note'],'version':state['version'],'deleted':False,'can_edit':True,'created_at':now,'updated_at':now,'deleted_at':None,'change_seq':1,'content_hash':'c'*64,'labels_version':3,'labels':['生活']})
  return super().do_GET()
 def do_PUT(self):
  u=urlsplit(self.path);body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
  if u.path=='/api/v1/note-entries/'+note:
   if state['fail']: return self.respond({'error':{'message':'模拟保存失败'}},400)
   state['note']=body['text'];state['version']+=1;state['writes']+=1
   return self.respond({'id':note,'category':'life','date':body['date'],'text':state['note'],'version':state['version'],'deleted':False,'can_edit':True,'created_at':now,'updated_at':now,'deleted_at':None,'change_seq':2,'content_hash':'d'*64,'labels_version':3,'labels':body.get('labels',['生活'])})
  self.respond({},404)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(Path(__file__).resolve().parents[1])));Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context();page=context.new_page()
 page.on('pageerror',lambda err:print('PAGEERROR',str(err),flush=True))
 page.goto(f'http://127.0.0.1:{server.server_port}/public/index.html',wait_until='domcontentloaded')
 page.evaluate('''async () => {document.body.innerHTML='<div id="app"></div><div id="toasts"></div><link rel="stylesheet" href="/public/workbench.css">';
  const {state}=await import('/web/core/state.mjs');const {api}=await import('/web/core/api.mjs');
  state.me={id:'synthetic-user',username:'synthetic',publicBusiness:true};state.page='todos';await api('/auth/me');
  window.documentPictureInPicture={requestWindow:()=>Promise.resolve(window.open('about:blank','synthetic-pip','width=390,height=520'))};
  window.openTest=()=>import('/web/floating-workbench.mjs').then(m=>m.openFloatingWorkbench());}''')
 page.evaluate('openTest()'); pip=context.pages[-1];pip.on('pageerror',lambda err:print('PIPERROR',str(err),flush=True));pip.wait_for_selector('.floating-list input');assert pip.locator('.floating-list').inner_text().strip()=='合成待办'
 assert pip.locator('[data-panel=todos] input').count()==1 and pip.locator('[data-panel=todos] button').count()==0
 pip.locator('.floating-list input').check();page.wait_for_timeout(300)
 assert page.evaluate("import('/web/core/todos-state.mjs').then(m=>m.todoDay(m.todosState.today).items[0].completed)") is True
 pip.locator('[data-tab=notes]').click();page.wait_for_timeout(1500);pip.wait_for_selector('.floating-note-list button',timeout=3000);pip.locator('.floating-note-list button').first.click()
 pip.locator('textarea').fill('合成编辑后的正文');pip.locator('.floating-labels label').filter(has_text='测试标签').locator('input').check();pip.locator('.floating-actions button').first.click();page.wait_for_timeout(900)
 assert state['note']=='合成编辑后的正文' and state['writes']==1, state
 state['fail']=True
 pip.locator('.floating-note-list button').first.click();pip.locator('textarea').fill('失败保留的草稿');pip.locator('.floating-actions button').first.click();page.wait_for_timeout(600)
 assert pip.locator('textarea').input_value()=='失败保留的草稿'
 pip.locator('[data-tab=todos]').click();pip.locator('[data-tab=notes]').click();assert pip.locator('textarea').input_value()=='失败保留的草稿'
 pip.locator('textarea').dispatch_event('compositionstart')
 pip.locator('textarea').evaluate("el=>{el.value='正在合成的草稿';el.dispatchEvent(new Event('input',{bubbles:true}))}")
 pip.close();page.wait_for_timeout(300)
 assert page.evaluate("import('/web/daily-notes-controller.mjs').then(m=>m.hasFloatingNoteDraft())")
 draft=page.evaluate("import('/web/daily-notes-controller.mjs').then(m=>({text:m.floatingNotesSnapshot()?.item?.draft,composing:m.floatingNotesSnapshot()?.item?.composing}))")
 assert draft=={'text':'正在合成的草稿','composing':False},draft
 print('PASS: shared today list, checkbox, no todo add/delete, note read/edit/multi-label send, failure and close retain draft')
 browser.close()
server.shutdown()
