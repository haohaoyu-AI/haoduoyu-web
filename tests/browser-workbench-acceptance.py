"""Eight-point UI acceptance: real local Worker, temporary D1, synthetic content only."""
import json,select,subprocess,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-acceptance';OUT.mkdir(parents=True,exist_ok=True)
report={'baseline':'9c9fb40c10ab9f9cb2fbb0ed87beeccc5bae6108','synthetic':True,'real_worker':True,'completed':False,'checks':{},'captures':[],'pageerrors':[],'external_requests':[],'layout':[]}
server=subprocess.Popen(['node','tests/article-pipeline-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def wait_request(page,held):
    for _ in range(70):
        if held:break
        page.wait_for_timeout(50)
    assert len(held)==1,('single request',len(held))
def snap(page,name):
    page.evaluate('document.fonts.ready')
    page.wait_for_function('''()=>[...document.querySelectorAll('.entry-ready')].filter(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight-8&&r.bottom>0}).every(e=>Number(getComputedStyle(e).opacity)>.98)''')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
    page.screenshot(path=str(OUT/(name+'.png')),animations='disabled',full_page=not name.startswith('coverage-info'));report['captures'].append(name+'.png')
def mark(name,value=True):report['checks'][name]=value;print('Passed: '+name,flush=True)
try:
    assert select.select([server.stdout],[],[],45)[0]
    origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        for width,height in [(1440,1000),(900,600),(375,844),(390,844)]:
            c=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<600,has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
            def local(route):
                if route.request.url.startswith(origin+'/'):route.continue_()
                else:report['external_requests'].append(route.request.url);route.abort()
            c.route('**/*',local);page=c.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
            page.goto(origin+'/?page=todos');expect(page.locator('#todo-text')).to_be_visible();day=page.locator('#daily-todos').get_attribute('data-date')
            assert 'page=todos' in page.url
            page.locator('[data-action=todo-panel][data-panel=history]').click();expect(page.locator('#todo-history')).to_be_visible()
            page.locator('[data-action=todo-prev]').click();expect(page.locator('#todo-history')).to_be_visible();snap(page,f'todo-history-{width}')
            page.locator('#todo-history [data-action=todo-panel-close]').click();expect(page.locator('#todo-text')).to_be_visible();expect(page.locator('#daily-todos')).to_have_attribute('data-date',day)
            page.go_back();expect(page.locator('#todo-history')).to_be_visible();page.go_forward();expect(page.locator('#todo-text')).to_be_visible()
            page.locator('[data-action=todo-panel][data-panel=templates]').click();expect(page.locator('#todo-templates')).to_be_visible();snap(page,f'todo-templates-{width}')
            page.locator('#todo-templates [data-action=todo-panel-close]').click();expect(page.locator('#todo-text')).to_be_visible();page.locator('[data-action=todo-panel][data-panel=templates]').click();page.keyboard.press('Escape');expect(page.locator('#todo-text')).to_be_focused();mark(f'2_history_common_return_back_forward_{width}')
            if width==375:
                held=[];pattern='**/api/v1/todos'
                def hold_todo(route):
                    if route.request.method=='POST':held.append(route)
                    else:route.continue_()
                page.route(pattern,hold_todo)
                page.locator('#todo-text').fill('第一条计划');page.locator('#todo-form button').click();wait_request(page,held)
                expect(page.locator('.todo-pending-row')).to_contain_text('第一条计划');assert not page.locator('#todo-text').evaluate('(e)=>e.readOnly||e.disabled')
                page.locator('#todo-text').fill('下一条中文输入');page.wait_for_timeout(1000)
                expect(page.locator('#todo-status')).to_have_text('正在同步…');assert '保存中' not in page.locator('#daily-todos').inner_text()
                snap(page,'todo-delayed-background-375')
                held.pop().continue_();expect(page.locator('.daily-todo-text')).to_contain_text(['第一条计划']);expect(page.locator('#todo-text')).to_have_value('下一条中文输入')
                page.locator('#todo-text').fill('需要重试的计划');page.locator('#todo-form button').click();wait_request(page,held);original=held[0].request.post_data_json
                page.locator('#todo-text').fill('失败时仍保留的新草稿')
                held.pop().fulfill(status=503,content_type='application/json',body=json.dumps({'error':{'code':'SYNTHETIC_FAILURE','message':'合成测试：暂未保存'}}))
                expect(page.locator('[data-action=todo-retry-add]')).to_be_visible();expect(page.locator('#todo-text')).to_have_value('失败时仍保留的新草稿');snap(page,'todo-failure-draft-375')
                page.locator('[data-action=todo-retry-add]').click();wait_request(page,held);assert held[0].request.post_data_json==original;held.pop().continue_()
                expect(page.locator('.daily-todo-text')).to_contain_text(['第一条计划','需要重试的计划']);expect(page.locator('#todo-text')).to_have_value('失败时仍保留的新草稿');page.unroute(pattern)
                mark('8_todo_optimistic_single_delayed_feedback_editable_next_draft_and_exact_retry')
            snap(page,f'todos-{width}')
            nav='.mobile-nav-item' if width<600 else '.nav-item'
            page.locator(nav+'[data-nav=memos]').click();expect(page.locator('[data-memo-action=new-group]')).to_be_visible()
            if width==1440:
                page.locator('[data-memo-action=new-group]').click();expect(page.locator('[data-memo-group]')).to_have_count(1)
                creating=[]
                def hold_creation(route):
                    if route.request.method=='PUT':creating.append(route)
                    else:route.continue_()
                page.route('**/api/v1/memos/notes/*',hold_creation)
                page.locator('[data-memo-action=new-note]').click();wait_request(page,creating);expect(page.locator('#memo-title')).to_be_focused();expect(page.locator('#memo-dialog')).to_be_hidden()
                page.locator('#memo-title').fill('验收：常用资料');page.locator('#memo-body').fill('两级目录，右侧直接编辑。');page.locator('#memo-body').evaluate('e=>e.setSelectionRange(4,4)')
                creating.pop().continue_();page.unroute('**/api/v1/memos/notes/*',hold_creation);expect(page.locator('#memo-status')).to_have_attribute('data-phase','saved')
                assert page.locator('#memo-body').evaluate('e=>document.activeElement===e&&e.selectionStart===4')
                mark('1_direct_plus_focus_is_immediate_and_late_ack_does_not_steal_editor_focus')
            elif width<600:
                expect(page.locator('[data-memo-group]')).to_be_visible();expect(page.locator('[data-memo-note]')).to_be_visible();snap(page,f'memo-tree-{width}');page.locator('[data-memo-note]').first.click()
            expect(page.locator('#memo-body')).to_be_visible();assert page.locator('.memo-layout>.memo-library').count()==1 and page.locator('.memo-layout>.memo-notes').count()==0
            assert page.locator('[data-memo-action=refresh]').count()==0 and page.locator('[data-memo-action=recovery]').count()==0 and page.locator('[data-memo-action=trash]').count()==0
            if width==375:
                body=page.locator('#memo-body');note_id=page.request.get(origin+'/api/v1/memos').json()['data']['notes'][0]['id'];path=origin+'/api/v1/memos/notes/'+note_id;held=[]
                def hold_memo(route):
                    if route.request.method=='PUT':held.append(route)
                    else:route.continue_()
                page.route(path,hold_memo);body.fill('已发出的旧内容');wait_request(page,held)
                long='长文中文验收'*1800
                body.evaluate('''(e,text)=>{e.dataset.acceptanceId='kept';e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value=text;e.setSelectionRange(8,8);e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'中文'}));}''',long)
                held.pop().continue_();expect(page.locator('#memo-status')).to_have_attribute('data-phase','dirty');page.wait_for_timeout(900);assert not held
                expect(body).to_have_value(long);assert body.evaluate("e=>document.activeElement===e&&e.selectionStart===8&&e.dataset.acceptanceId==='kept'")
                body.dispatch_event('compositionend');wait_request(page,held);held.pop().continue_();expect(page.locator('#memo-status')).to_have_attribute('data-phase','saved');page.unroute(path)
                assert page.request.get(path).json()['data']['body']==long;assert page.locator('#memo-drafts').is_hidden();mark('8_memo_long_IME_pending_ack_preserves_caret_and_defers_until_compositionend')
                c.set_offline(True);body.fill('离线草稿必须保留');expect(page.locator('#memo-status')).to_have_attribute('data-phase','offline');expect(body).to_have_value('离线草稿必须保留');snap(page,'memo-offline-draft-375');c.set_offline(False)
                page.locator('.memo-document-menu>summary').click();page.locator('[data-memo-action=save]').click();expect(page.locator('#memo-status')).to_have_attribute('data-phase','saved');assert page.request.get(path).json()['data']['body']=='离线草稿必须保留'
                server_note=page.request.get(path).json()['data'];payload={k:server_note[k] for k in ['group_id','title','body','position','version']};payload.update(body='服务器并发版本',save_id=str(uuid.uuid4()))
                result=c.request.put(path,headers={'Origin':origin,'X-Public-Business':'1'},data=payload);assert result.status==200,result.text()
                body.fill('CAS 冲突中的本机文字');expect(page.locator('#memo-status')).to_have_attribute('data-phase','conflict');expect(body).to_have_value('CAS 冲突中的本机文字');expect(page.locator('#memo-remote')).to_contain_text('服务器并发版本');snap(page,'memo-conflict-preserved-375');mark('8_memo_offline_recovery_and_real_CAS_preserve_local_text')
            snap(page,f'memos-{width}');mark(f'1_memo_two_columns_tree_direct_creation_or_navigation_{width}')
            if width<600:
                page.locator('[data-memo-action=back-notes]').click();expect(page.locator('[data-memo-group]')).to_be_visible();expect(page.locator('[data-memo-note]')).to_be_visible()
            page.locator(nav+'[data-nav=settings]').click();expect(page.locator('[data-action=memo-tools][data-tool=trash]')).to_be_visible();snap(page,f'settings-{width}')
            if width>=761:
                box=page.evaluate('''()=>{const shell=document.querySelector('.shell').getBoundingClientRect(),side=document.querySelector('.sidebar').getBoundingClientRect(),footer=document.querySelector('.sidebar-bottom').getBoundingClientRect();return {shellBottom:shell.bottom,sideBottom:side.bottom,footerBottom:footer.bottom,footerTop:footer.top};}''');assert box['footerBottom']<=box['sideBottom']+1 and box['sideBottom']<=box['shellBottom']+1;report['layout'].append({'width':width,**box})
            page.locator('[data-action=memo-tools][data-tool=trash]').click();expect(page.locator('#memo-groups-heading')).to_have_text('回收站');page.locator('[data-memo-action=exit-trash]').click();expect(page.locator('#memo-groups-heading')).to_have_text('目录');mark(f'3_4_7_settings_in_frame_trash_entry_and_return_{width}')
            # Actual parent/media group routes and the compact coverage information control.
            if width<600:page.locator('.mobile-media-nav>summary').click();link=page.locator('.mobile-media-nav [data-nav=dashboard]')
            else:page.locator('.media-nav>summary').click();link=page.locator('.media-nav [data-nav=dashboard]')
            link.click();expect(page.locator('h1')).to_have_text('总览');page.locator('[data-action=article-overview-mode][data-mode=published]').click()
            info=page.locator('[data-action=dashboard-info][data-kind=coverage]');expect(info).to_be_visible();box=info.bounding_box();assert box['width']<=26 and box['height']<=26,box
            assert info.evaluate("e=>getComputedStyle(e,'::before').left==='-10px'");info.click();expect(info).to_have_attribute('aria-expanded','true');snap(page,f'coverage-info-{width}');page.keyboard.press('Escape');mark(f'5_6_workbench_media_hierarchy_and_compact_clickable_info_{width}')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');c.close()
        assert not report['pageerrors'] and not report['external_requests'];report['completed']=True;browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'completed':report['completed'],'checks':len(report['checks']),'captures':len(report['captures']),'pageerrors':report['pageerrors']},ensure_ascii=False))
