import json
import io
import os
import tempfile
import threading
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from article_hub import ai, config, console, model_settings, sourcing
from article_hub.docxio import Block
from article_hub.hits import Hit


class ModelSettingsTests(unittest.TestCase):
    def test_image_roundup_preserves_more_than_four_grounded_subjects(self):
        titles = ['电影甲', '电影乙', '电影丙', '电影丁', '电影戊', '电影己']
        doc = type('Doc', (), {'title':'电影盘点', 'blocks':[Block('p', '、'.join(titles))]})()
        response = {'anchors': titles + ['虚构电影'], 'queries': [
            {'text': title + ' 剧照', 'heading': ''} for title in titles + ['虚构电影']]}
        with patch.object(ai, 'chat', return_value=json.dumps(response)):
            analysis = sourcing.model_analysis(doc)
        self.assertEqual(analysis.anchors, titles)
        model_queries = [q for q in analysis.queries if q.origin.startswith('模型-')]
        supplemental = [q for q in analysis.queries if not q.origin.startswith('模型-')]
        self.assertEqual([q.text for q in model_queries],
                         [title + ' 剧照' for title in titles])
        self.assertTrue(supplemental)
        article = doc.title + ' ' + ' '.join(block.text for block in doc.blocks)
        self.assertTrue(all(all(term in article for term in q.text.split())
                            for q in supplemental),
                        'Rule supplements may combine grounded terms into a distinct search phrase')
        self.assertNotIn('虚构电影 剧照', [q.text for q in analysis.queries])

    def test_image_json_uses_short_non_thinking_call(self):
        with patch.object(ai, 'chat', return_value='{"keep": []}') as chat:
            self.assertEqual(sourcing._model_json([]), {'keep': []})
        self.assertEqual(chat.call_args.kwargs['timeout'], 90)
        self.assertFalse(chat.call_args.kwargs['thinking'])

    def test_model_not_open_explains_activation_without_leaking_account(self):
        import io
        self.deepseek()
        error = urllib.error.HTTPError('https://example.test', 404, 'Not Found', {},
            io.BytesIO(json.dumps({'error': {'code': 'ModelNotOpen', 'message': 'account 123 private request'}}).encode()))
        with patch.object(ai.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(ai.AiError) as caught:
                ai.chat([{'role': 'user', 'content': 'test'}])
        self.assertIn('尚未开通', str(caught.exception))
        self.assertIn('无需重新填写密钥', str(caught.exception))
        self.assertNotIn('account 123', str(caught.exception))

    def test_not_found_vision_endpoint_keeps_safe_provider_model_and_error_code(self):
        profile={'api_key':'vision-test-secret','base_url':'https://ark.example/api/v3',
                 '模型':'ep-vision-deployment-17','wire_api':'chat',
                 'name':'豆包（火山方舟）'}
        error=urllib.error.HTTPError('https://ark.example/api/v3/chat/completions',404,'Not Found',{},
            io.BytesIO(json.dumps({'error':{'code':'InvalidEndpointOrModel.NotFound',
                'message':'deployment not found'}}).encode()))
        with ai.using_profile(profile), patch.object(ai.urllib.request,'urlopen',side_effect=error):
            with self.assertRaises(ai.AiError) as caught:
                ai.chat([{'role':'user','content':'fixture'}])
        self.assertEqual(caught.exception.category,'model_or_endpoint_unavailable')
        self.assertEqual(caught.exception.http_status,404)
        self.assertEqual(caught.exception.error_code,'InvalidEndpointOrModel.NotFound')
        self.assertEqual(caught.exception.provider,'豆包（火山方舟）')
        self.assertEqual(caught.exception.model,'ep-vision-deployment-17')
        self.assertIn('HTTP 404',str(caught.exception))
        self.assertIn('InvalidEndpointOrModel.NotFound',str(caught.exception))
        self.assertIn('ep-vision-deployment-17',str(caught.exception))
        self.assertNotIn('vision-test-secret',str(caught.exception))

    def test_recommendations_keep_latest_workflow_models_only(self):
        models = ['doubao-seed-2-1-pro-260628','doubao-seed-2-1-pro-260915',
                  'doubao-seed-2-1-turbo-260628','doubao-seed-2-0-lite-260428',
                  'deepseek-v4-flash-ga-260731','deepseek-v4-1-flash-260910',
                  'deepseek-v4-pro-ga-260813','glm-5-2-260617',
                  'glm-5-3-flash-260828','doubao-seedream-5-0-pro-260628',
                  'hitem3d-2-0-251223','kimi-k2-250711']
        topics = [r['id'] for r in model_settings.recommended_models(models, 'topics')]
        images = [r['id'] for r in model_settings.recommended_models(models, 'images')]
        self.assertEqual(topics, ['doubao-seed-2-1-pro-260915','deepseek-v4-pro-ga-260813','glm-5-2-260617'])
        self.assertEqual(images, ['doubao-seed-2-1-turbo-260628','deepseek-v4-1-flash-260910','doubao-seed-2-0-lite-260428'])
        self.assertEqual(model_settings.recommended_models(['ep-custom'], 'topics'), [])

    def test_doubao_choices_and_credentials_are_independent(self):
        row = model_settings.providers()['doubao']
        self.assertFalse(row['api_key'])
        model_settings.save_provider({'provider':'doubao', 'base_url':row['base_url'],
                                      'wire_api':'chat', 'api_key':'doubao-test-secret'})
        model_settings.save_choice('topics', 'doubao', 'ep-test-endpoint')
        model_settings.save_choice('images', 'doubao', 'ep-test-endpoint')
        self.assertEqual(model_settings.public_config()['choices']['images'],
                         {'provider':'doubao','model':'ep-test-endpoint'})
        with patch.dict(os.environ, {'ARTICLE_HUB_PROVIDER':'doubao', 'ARTICLE_HUB_MODEL':'ep-test-endpoint'}):
            settings = ai.settings()
        self.assertEqual(settings['api_key'], 'doubao-test-secret')
        self.assertEqual(settings['wire_api'], 'chat')
        self.assertEqual(settings['模型'], 'ep-test-endpoint')
        self.assertEqual(model_settings.providers()['gpt']['api_key'], 'gpt-test-secret')
        self.assertNotIn('doubao-test-secret', json.dumps(model_settings.public_config()))

    def test_invalid_key_discovery_explains_401(self):
        self.deepseek()
        with patch.object(model_settings.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('https://deepseek.example/v1/models',401,'Unauthorized',{},None)):
            with self.assertRaisesRegex(ValueError, '密钥验证失败（401）'):
                model_settings.discover('deepseek')

    def setUp(self):
        isolated_temp_root = Path(__file__).resolve().parents[1] / 'tmp' / 'model-settings-tests'
        isolated_temp_root.mkdir(parents=True, exist_ok=True)
        temp = tempfile.TemporaryDirectory(dir=isolated_temp_root)
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for mock in [patch.object(config, 'DATA', self.root),
                     patch.object(ai, 'legacy_settings', return_value={'base_url':'https://gpt.example/v1', 'api_key':'gpt-test-secret', '模型':'gpt-test', 'wire_api':'responses'}),
                     patch.object(console, 'CURRENT', None), patch.dict(os.environ, {}, clear=True)]:
            mock.start()
            self.addCleanup(mock.stop)
        self.auth_manager = console.console_auth.AuthManager(
            self.root / 'console-auth-fixture.json', root=self.root)
        self.auth_manager.config_path.write_text(json.dumps({
            'schema':1, 'username':'fixture', 'kdf':'pbkdf2_sha256',
            'iterations':console.console_auth.KDF_ITERATIONS,
            'salt':'00' * 16, 'digest':'00' * 32,
        }), encoding='utf-8')
        fingerprint = self.auth_manager._credential_fingerprint(
            self.auth_manager.load_credentials())
        self.auth_token = 'fixture-session-token-012345678901234567890123'
        self.auth_csrf_token = 'fixture-write-token'
        self.auth_manager._sessions[self.auth_token] = console.console_auth.AuthSession(
            'fixture', self.auth_csrf_token, float('inf'), fingerprint)
        mock = patch.object(console, 'AUTH_MANAGER', self.auth_manager)
        mock.start(); self.addCleanup(mock.stop)
        self.auth_headers = {
            'Host':'127.0.0.1:8765', 'Origin':'http://127.0.0.1:8765',
            'Cookie':f'{console.console_auth.COOKIE_NAME}={self.auth_token}',
            console.WRITE_TOKEN_HEADER:self.auth_csrf_token}

    def deepseek(self):
        model_settings.save_provider({'provider':'deepseek','base_url':'https://deepseek.example/v1',
            'wire_api':'chat','api_key':'deepseek-test-secret'})

    def test_public_config_never_contains_secret(self):
        self.deepseek()
        text = json.dumps(model_settings.public_config())
        self.assertNotIn('gpt-test-secret', text)
        self.assertNotIn('deepseek-test-secret', text)
        self.assertNotIn('api_key', text)

    def test_unconfigured_provider_does_not_borrow_other_key(self):
        with self.assertRaisesRegex(ValueError, '尚未配置'):
            model_settings.resolve('deepseek','deepseek-chat')

    def test_workflow_choices_are_independent_and_persistent(self):
        self.deepseek()
        model_settings.save_choice('topics','gpt','gpt-custom-6')
        model_settings.save_choice('images','deepseek','deepseek-custom')
        choices = model_settings.public_config()['choices']
        self.assertEqual(choices['topics']['model'], 'gpt-custom-6')
        self.assertEqual(choices['images']['provider'], 'deepseek')
        self.assertTrue((self.root/'模型服务.json').is_file())

    def test_collaboration_keeps_only_text_and_layout_roles(self):
        self.deepseek()
        model_settings.save_provider({'provider':'doubao','base_url':'https://ark.example/api/v3',
            'wire_api':'chat','api_key':'doubao-test-secret'})
        model_lists={
            'deepseek':['deepseek-text-v2'],
            'gpt':['gpt-vision-v2'],
            'doubao':['doubao-layout-v2'],
        }
        def listed_models(_request, **_kwargs):
            provider_url = _request.full_url
            provider = 'doubao' if 'ark.example' in provider_url else ('deepseek' if 'deepseek.example' in provider_url else 'gpt')
            body=json.dumps({'data':[{'id': model} for model in model_lists[provider]]}).encode()
            return io.BytesIO(body)
        with patch.object(model_settings.urllib.request,'urlopen',side_effect=listed_models):
            for provider in model_lists:
                model_settings.discover(provider)
        roles={'text':{'provider':'deepseek','model':'deepseek-text-v2'},
               'layout':{'provider':'gpt','model':'gpt-vision-v2'}}
        options=model_settings.public_config()['collaboration_models']
        self.assertTrue(all(any(item['role']==role and item['provider']==value['provider']
                                and item['model']==value['model'] for item in options)
                            for role,value in roles.items()))
        self.assertFalse(any(item['provider']=='doubao' and item['model']=='doubao-layout-v2'
                             for item in options),'The menu stays compact; custom IDs use the explicit input')
        saved=model_settings.save_image_collaboration(
            {'mode':'collaborative','roles':{**roles,
                'vision':{'provider':'doubao','model':'doubao-layout-v2'}},'vision_confirmed':False})
        self.assertEqual(saved['roles'],roles)
        public=json.dumps(model_settings.public_config(),ensure_ascii=False)
        self.assertNotIn('gpt-test-secret',public)
        self.assertNotIn('deepseek-test-secret',public)
        self.assertNotIn('doubao-test-secret',public)
        duplicate={**roles,'layout':roles['text']}
        self.assertEqual(set(model_settings.validate_image_collaboration(
            {'mode':'collaborative','roles':duplicate})['roles']), {'text','layout'})

    def test_collaboration_vision_role_is_optional_and_disables_visual_check(self):
        """搜图阶段不调用视觉模型：vision 角色可以省略，只留文本与排版。"""
        self.deepseek()
        model_settings.save_provider({'provider':'doubao','base_url':'https://ark.example/api/v3',
            'wire_api':'chat','api_key':'doubao-test-secret'})
        two_roles={'text':{'provider':'deepseek','model':'deepseek-text-v2'},
                   'layout':{'provider':'gpt','model':'gpt-layout-v2'}}
        saved=model_settings.validate_image_collaboration(
            {'mode':'collaborative','roles':two_roles,'vision_confirmed':False},
            resolve_profiles=False)
        self.assertEqual(set(saved['roles']),{'text','layout'})
        # Older saved visual-review roles are ignored and never re-enabled.
        with_vision={**two_roles,'vision':{'provider':'doubao','model':'doubao-vision-v2'}}
        confirmed=model_settings.validate_image_collaboration(
            {'mode':'collaborative','roles':with_vision,'vision_confirmed':False},
            resolve_profiles=False)
        self.assertEqual(set(confirmed['roles']), {'text','layout'})
        # 缺 text 或 layout 仍然拒绝。
        with self.assertRaisesRegex(ValueError,'文本筛选、正文排版'):
            model_settings.validate_image_collaboration(
                {'mode':'collaborative','roles':{'text':two_roles['text']},
                 'vision_confirmed':False}, resolve_profiles=False)

    def test_image_collaboration_api_persists_and_returns_the_saved_roles(self):
        payload={"mode":"collaborative","roles":{
            "text":{"provider":"gpt","model":"gpt-text-fixture"},
            "layout":{"provider":"gpt","model":"gpt-layout-fixture"}}}
        encoded=json.dumps(payload).encode("utf-8")
        handler=object.__new__(console.Handler)
        handler.path="/api/image-collaboration"
        handler.headers={**self.auth_headers,"Content-Length":str(len(encoded))}
        handler.server=SimpleNamespace(server_address=("127.0.0.1",8765))
        handler.rfile=io.BytesIO(encoded)
        routed=[]
        handler._json=lambda value,code=200:routed.append((code,value))
        with patch.object(console,"scope_busy",return_value=True), \
             patch.object(console,"OPERATION_LOCK",threading.RLock()), \
             patch.object(console,"SERVER",{"restart_requested":False}), \
             patch.object(console,"CACHE",{"at":0,"images_at":0}):
            handler.do_POST()
        self.assertEqual(routed[0][0],200)
        expected={"text":payload["roles"]["text"],"layout":payload["roles"]["layout"]}
        self.assertEqual(routed[0][1]["image_collaboration"]["roles"],expected)
        self.assertEqual(model_settings.image_collaboration()["roles"],expected,
                         "The persisted settings file is the source used after a page reload or restart")
        self.assertEqual(model_settings.public_config()["choices"]["images"],expected["text"],
                         "The legacy Word image setting follows the saved text role")

    def test_collaboration_settings_can_be_saved_while_an_image_job_runs(self):
        handler=object.__new__(console.Handler)
        handler.path='/api/image-collaboration'
        handler.headers={**self.auth_headers,'Content-Length':'0'}
        handler.server=SimpleNamespace(server_address=('127.0.0.1',8765))
        handler.rfile=io.BytesIO()
        routed=[]
        handler._json=lambda payload,code=200:routed.append((code,payload))
        handler._handle_post=lambda:routed.append(('saved',True))
        cache={'at':0,'images_at':0}
        with patch.object(console,'scope_busy',return_value=True), \
             patch.object(console,'OPERATION_LOCK',threading.RLock()), \
             patch.object(console,'SERVER',{'restart_requested':False}), \
             patch.object(console,'CACHE',cache):
            handler.do_POST()
        self.assertEqual(routed,[('saved',True)],'Running tasks use their launch snapshot; saving next-run settings must not be blocked')

    def test_task_environment_routes_correct_credentials_and_protocol(self):
        self.deepseek()
        with patch.dict(os.environ, {'ARTICLE_HUB_PROVIDER':'deepseek','ARTICLE_HUB_MODEL':'deepseek-custom'}):
            settings = ai.settings()
        self.assertEqual(settings['api_key'],'deepseek-test-secret')
        self.assertEqual(settings['wire_api'],'chat')
        self.assertEqual(settings['模型'],'deepseek-custom')

    def test_new_endpoint_requires_new_key(self):
        with self.assertRaisesRegex(ValueError, '更换接口地址'):
            model_settings.save_provider({'provider':'gpt','base_url':'https://other.example/v1','wire_api':'responses','api_key':''})

    def test_blank_key_preserves_only_same_endpoint_key(self):
        model_settings.save_provider({'provider':'gpt','base_url':'https://gpt.example/v1','wire_api':'responses','api_key':''})
        self.assertEqual(model_settings.resolve('gpt','gpt-test')['api_key'],'gpt-test-secret')

    def test_start_pins_image_model_into_worker(self):
        self.deepseek()
        with patch.object(console.threading, 'Thread') as thread:
            result = console.start('搜图预览',provider='deepseek',model='deepseek-custom')
        self.assertIn('job',result)
        spec = thread.call_args.kwargs['args'][1]
        self.assertEqual(spec['env']['ARTICLE_HUB_PROVIDER'],'deepseek')
        self.assertEqual(spec['env']['ARTICLE_HUB_IMAGE_AI'],'1')
        self.assertNotIn('deepseek-test-secret',json.dumps(spec, default=str))

    def test_unconfigured_start_does_not_launch(self):
        with patch.object(console.threading, 'Thread') as thread:
            result = console.start('选题',provider='deepseek',model='deepseek-chat')
        self.assertIn('error',result)
        thread.assert_not_called()

    def test_model_planner_rejects_invented_subjects(self):
        doc = type('Doc',(),{'title':'牛肉价格', 'blocks':[Block('p','牛肉补栏周期')]})()
        with patch.object(ai,'chat',return_value='{"anchors":["火星"],"queries":[]}'):
            with self.assertRaisesRegex(ValueError, '主题词'):
                sourcing.model_analysis(doc)

    def test_model_planning_and_filtering_have_real_effect(self):
        doc = type('Doc',(),{'title':'牛肉价格', 'blocks':[Block('p','牛肉补栏周期')]})()
        with patch.object(ai,'chat',return_value='{"anchors":["牛肉"],"queries":[{"text":"牛肉 补栏","heading":""}]}') as call:
            analysis = sourcing.model_analysis(doc)
        self.assertEqual(analysis.queries[0].text,'牛肉 补栏')
        call.assert_called_once()
        hits = [Hit('头条','牛肉','牛肉补栏现场','媒体','https://img/a.jpg',''),
                Hit('头条','牛肉','牛肉市场现场','媒体','https://img/b.jpg','')]
        with patch.object(ai,'chat',return_value='{"keep":[0]}'):
            selected = sourcing.model_filter_hits(doc,hits,analysis.anchors)
        self.assertEqual(len(selected),1)


    def test_network_config_uses_saved_project_profile_without_legacy_fallback(self):
        environment = {
            'ARTICLE_HUB_NETWORK_MODEL_CONFIG':'project',
            'ARTICLE_HUB_PROVIDER':'gpt', 'ARTICLE_HUB_MODEL':'gpt-fixture',
            'OPENAI_API_KEY':'old-machine-fixture', 'OLD_CODEX_KEY':'old-codex-fixture'}
        with (
            patch.dict(os.environ, environment, clear=True),
            patch.object(ai, '_from_codex_config', side_effect=AssertionError('Codex config read')),
            patch.object(ai, '_local_settings', side_effect=AssertionError('legacy local config read')),
            patch.object(ai, 'legacy_settings', side_effect=AssertionError('legacy settings used')),
        ):
            model_settings.save_provider({'provider':'gpt','base_url':'https://fixture.example/v1',
                'wire_api':'responses','api_key':'project-fixture-key'})
            model_settings.save_choice('topics','gpt','gpt-fixture')
            public = model_settings.public_config()
            info = ai.settings()
            self.assertEqual(public['choices']['topics'], {'provider':'gpt','model':'gpt-fixture'})
            self.assertTrue(next(row for row in public['providers'] if row['id']=='gpt')['configured'])
            self.assertEqual(info['api_key'], 'project-fixture-key')
            self.assertEqual(info['模型'], 'gpt-fixture')
            self.assertEqual(info['wire_api'], 'responses')
            self.assertNotIn('project-fixture-key', json.dumps(public))

    def test_network_config_missing_fails_closed_without_probing_legacy_sources(self):
        environment = {
            'ARTICLE_HUB_NETWORK_MODEL_CONFIG':'project',
            'OPENAI_API_KEY':'old-machine-fixture', 'DEEPSEEK_API_KEY':'old-machine-fixture'}
        with (
            patch.dict(os.environ, environment, clear=True),
            patch.object(ai, '_from_codex_config', side_effect=AssertionError('Codex config read')) as codex,
            patch.object(ai, '_local_settings', side_effect=AssertionError('legacy local config read')) as local,
            patch.object(ai, 'legacy_settings', side_effect=AssertionError('legacy settings used')),
        ):
            info = ai.settings()
            ready, message = ai.ready()
            public = model_settings.public_config()
            self.assertFalse(info['api_key'])
            self.assertFalse(ready)
            self.assertIn('模型设置', message)
            self.assertEqual(public['choices']['topics']['provider'], 'deepseek')
            self.assertFalse(any(row['configured'] for row in public['providers']))
            codex.assert_not_called()
            local.assert_not_called()

    def test_network_config_invalid_project_file_does_not_fallback(self):
        with (
            patch.dict(os.environ, {'ARTICLE_HUB_NETWORK_MODEL_CONFIG':'project'}, clear=True),
            patch.object(ai, '_from_codex_config', side_effect=AssertionError('Codex config read')) as codex,
            patch.object(ai, '_local_settings', side_effect=AssertionError('legacy local config read')) as local,
        ):
            for invalid in ('{"providers":[]}', '{invalid'):
                model_settings._path().write_text(invalid, encoding='utf-8')
                with self.assertRaisesRegex(ValueError, '模型配置无法读取'):
                    ai.settings()
            model_settings._path().write_text(json.dumps({'choices':{'topics':[]}}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, '项目选题模型配置格式不正确'):
                ai.settings()
            codex.assert_not_called()
            local.assert_not_called()

    def test_network_mode_is_explicitly_forwarded_to_worker_only(self):
        environment = {
            'ARTICLE_HUB_NETWORK_MODEL_CONFIG':'project',
            'ARTICLE_HUB_PROVIDER':'ambient-provider',
            'ARTICLE_HUB_MODEL':'ambient-model',
            'ARTICLE_HUB_API_KEY':'ambient-secret'}
        with patch.dict(os.environ, environment, clear=True):
            env = console._worker_environment({'ARTICLE_HUB_PROVIDER':'gpt',
                                               'ARTICLE_HUB_MODEL':'gpt-fixture'})
        self.assertEqual(env['ARTICLE_HUB_NETWORK_MODEL_CONFIG'], 'project')
        self.assertEqual(env['ARTICLE_HUB_PROVIDER'], 'gpt')
        self.assertEqual(env['ARTICLE_HUB_MODEL'], 'gpt-fixture')
        self.assertNotIn('ARTICLE_HUB_API_KEY', env)


if __name__ == '__main__':
    unittest.main()
