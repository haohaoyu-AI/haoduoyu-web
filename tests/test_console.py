"""Console regressions. All file mutations use temporary fixtures."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from article_hub import console
from article_hub.library import DispatchResult


class ConsoleTests(unittest.TestCase):
    def test_article_record_delete_restore_and_platform_mark(self):
        from contextlib import contextmanager
        ledger = {'文章': {'unique-id': {'标题': '重复标题'}, 'other-id': {'标题': '重复标题'}}}
        @contextmanager
        def transaction():
            yield ledger
        with patch.object(console.library, 'ledger_transaction', transaction):
            for action in ('draft', 'undo-draft'):
                self.handler('/api/article-record', body={'topic':'unique-id','action':action,'platform':'百家号'}).do_POST()
                self.assertEqual(self.response[0], 200)
                record=ledger['文章']['unique-id']
                if action == 'delete': self.assertTrue(record['列表已删除'])
                if action == 'restore': self.assertNotIn('列表已删除', record)
                if action == 'draft': self.assertIn('百家号', record['手动草稿标记'])
                if action == 'undo-draft': self.assertNotIn('百家号', record['手动草稿标记'])
            self.assertEqual(ledger['文章']['other-id'], {'标题':'重复标题'})
            self.handler('/api/article-record', body={'topic':'unique-id','action':'delete'}).do_POST()
            self.assertEqual(self.response[0], 200)
            self.assertNotIn('unique-id', ledger['文章'])
            self.assertIn('unique-id', ledger['忽略扫描主题'])
            self.handler('/api/article-record', body={'topic':'missing','action':'delete'}).do_POST()
            self.assertEqual(self.response[0], 400)

    def test_modules_start_concurrently_and_reject_same_module(self):
        with patch.object(console.threading, 'Thread'):
            images = console.start('配图', provider='deepseek', model='fixture')
            topics = console.start('选题', provider='deepseek', model='fixture')
            drafts = console.start('一键送草稿', platforms='今日头条')
            for result in (images, topics, drafts):
                self.assertIn('job', result)
            self.assertEqual(set(console.jobs_snapshot()), {'images', 'topics', 'drafts'})
            self.assertIn('error', console.start('配图', provider='deepseek', model='fixture'))
            self.assertIn('error', console.start('选题', provider='deepseek', model='fixture'))

    def test_single_article_layout_can_run_while_a_different_article_searches(self):
        self.assertEqual(console.task_scope('配图'), 'images')
        self.assertEqual(console.task_scope('排版'), 'images', 'legacy Word retains its original task lane')
        topic_id = 'TP-20260924-aaaa1111'
        console.JOBS['images'] = console.Job(201, '配图', '搜图B', topic='B')
        with patch.object(console.image_review, 'ensure_editable'), \
             patch.object(console.image_review, 'topic_path', return_value=self.unformatted / topic_id), \
             patch.object(console.topic_packages, 'is_package', return_value=True), \
             patch.object(console.topic_packages, 'load', return_value={'topic_id':topic_id}), \
             patch.object(console.topic_packages, 'is_imported', return_value=True), \
             patch.object(console.topic_packages, 'imported_word', return_value=self.root / '原稿.docx'), \
             patch.object(console.image_review, 'load_review', return_value={'states': {'a.jpg':'approved'}}), \
             patch.object(console.threading, 'Thread') as thread:
            self.assertEqual(console.task_scope('排版', topic_id), 'layout:' + topic_id)
            result = console.start('排版', topic=topic_id)
        self.assertIn('job', result)
        self.assertEqual(console.JOBS['layout:' + topic_id].topic, topic_id)
        self.assertEqual(console.JOBS['images'].status, 'running')
        self.assertTrue(console.scope_busy('layouts'))
        thread.assert_called_once()

    def test_stop_and_acknowledge_are_isolated(self):
        image_job = console.Job(100, '配图', '图片')
        topic_job = console.Job(101, '选题', '选题')
        console.JOBS.update(images=image_job, topics=topic_job)
        image_job.process = MagicMock()
        with patch.object(console, '_kill_process') as kill:
            self.assertIn('error', console.stop('images', '101'))
            console.stop('images', '100')
            kill.assert_called_once_with(image_job.process)
            self.assertFalse(topic_job.stopped)
        image_job.status = 'ok'
        self.handler('/api/clear-result?id=100').do_POST()
        self.assertNotIn('images', console.JOBS)
        self.assertIs(console.JOBS['topics'], topic_job)

    def test_state_keeps_each_modules_progress(self):
        images = console.Job(1, '配图', '配图')
        topics = console.Job(2, '选题', '选题')
        images.lines = ['[进度] 正在搜图片']
        topics.lines = ['[进度] 正在找选题']
        console.JOBS.update(images=images, topics=topics)
        console.CURRENT = topics
        with patch.object(console, 'overview', return_value={}), \
             patch.object(console, 'latest_topics', return_value=[]), \
             patch.object(console, 'pending_lists', return_value={}), \
             patch.object(console, 'sourcing_status', return_value={}) as sourcing:
            result = console.state()
        self.assertTrue(result['busy'])
        self.assertEqual(result['module_progress']['images']['label'], '正在搜图片')
        self.assertEqual(result['module_progress']['topics']['label'], '正在找选题')
        self.assertEqual(sourcing.call_args.args[0]['id'], 1)

    def test_topic_image_job_exposes_its_latest_structured_progress(self):
        job = console.Job(52, '配图', '按关键词搜图', topic='TP-20260924-aabbccdd')
        job.lines = [
            '[图片进度] {"topic":"TP-20260924-aabbccdd","stage":"搜图","query":"国乒男团","searches_done":1,"searches_total":1}',
            '[图片进度] {"topic":"TP-20260924-otherid","stage":"搜图","query":"别篇"}',
            '[图片进度] {"topic":"TP-20260924-aabbccdd","stage":"相关性筛选","found":12,"checked":8,"accepted":5,"target":8}',
        ]
        self.assertEqual(job.snapshot()['image_progress']['stage'], '相关性筛选')
        self.assertEqual(job.snapshot()['image_progress']['accepted'], 5)

    def test_review_decisions_do_not_wait_for_the_global_post_lock(self):
        console.CURRENT = console.Job(53, '配图', '搜索B', topic='B')
        with patch.object(console, 'OPERATION_LOCK') as operation_lock, \
             patch.object(console.image_review, 'save_review', return_value={
                 'revision': 1, 'export_sync': {'ok': True, 'count': 1}
             }) as save_review:
            operation_lock.acquire.return_value = False
            self.handler('/api/image-review', body={
                'topic': 'A', 'states': {'a.jpg': 'approved'}
            }).do_POST()
            self.assertEqual(self.response[0], 200)
            operation_lock.acquire.assert_not_called()
            save_review.assert_called_once()

    def test_topic_request_and_model_choice_allowed_during_images(self):
        console.JOBS['images'] = console.Job(1, '配图', '配图')
        with patch.object(console.topic_service, 'start', return_value={'id': 'fixture'}) as start:
            self.handler('/api/topic-manual', body={'titles':['fixture']}).do_POST()
            self.assertEqual(self.response[0], 200)
            start.assert_called_once()
        with patch.object(console.model_settings, 'save_choice'), patch.object(console.model_settings, 'public_config', return_value={}):
            self.handler('/api/model-choice', body={'scope':'topics','provider':'deepseek','model':'fixture'}).do_POST()
            self.assertEqual(self.response[0], 200)
            self.handler('/api/model-choice', body={'scope':'images','provider':'deepseek','model':'fixture'}).do_POST()
            self.assertEqual(self.response[0], 409)

    def test_refresh_rejects_running_job(self):
        for endpoint in ('/api/refresh', '/api/restart'):
            with patch.object(console, 'CURRENT', console.Job(1, '配图', '配图')):
                self.handler(endpoint).do_POST()
                self.assertEqual(self.response[0], 409)
                self.assertFalse(console.SERVER.get('restart_requested'))

    def test_idle_refresh_requests_shutdown_without_early_spawn(self):
        httpd = MagicMock()
        console.SERVER['httpd'] = httpd
        with patch.object(console.threading, 'Thread') as thread, patch.object(console.subprocess, 'Popen') as popen:
            self.handler('/api/refresh').do_POST()
            self.assertEqual(self.response, (200, {'ok': True}))
            self.assertTrue(console.SERVER['restart_requested'])
            thread.assert_called_once_with(target=httpd.shutdown, daemon=True)
            popen.assert_not_called()
            self.handler('/api/run?task=配图').do_POST()
            self.assertEqual(self.response[0], 409)

    def test_image_jobs_have_no_batch_watchdog(self):
        for task in console.UNTIMED_IMAGE_TASKS:
            with self.subTest(task=task), patch.object(console.subprocess, 'Popen') as popen, patch.object(console.threading, 'Thread') as thread:
                popen.return_value.stdout = []
                popen.return_value.wait.return_value = 0
                job = console.Job(1, task, task)
                console._execute(job, {'argv': [], 'cwd': self.root})
                thread.assert_not_called()
                self.assertEqual(job.status, 'ok')

    def test_other_jobs_keep_watchdog(self):
        for timeout in (console.JOB_TIMEOUT, 1800):
            with self.subTest(timeout=timeout), patch.object(console.subprocess, 'Popen') as popen, patch.object(console.threading, 'Thread') as thread:
                popen.return_value.stdout = []
                popen.return_value.wait.return_value = 0
                job = console.Job(1, '选题', '选题')
                spec = {'argv': [], 'cwd': self.root}
                if timeout != console.JOB_TIMEOUT:
                    spec['timeout'] = timeout
                console._execute(job, spec)
                thread.assert_called_once_with(target=console._watchdog, args=(job, popen.return_value, timeout), daemon=True)

    def test_image_job_manual_stop_still_kills_process(self):
        job = console.Job(1, '配图', '配图')
        job.process = MagicMock()
        with patch.object(console, 'CURRENT', job), patch.object(console, '_kill_process') as kill:
            console.stop()
            kill.assert_called_once_with(job.process)
            self.assertTrue(job.stopped)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.unformatted = self.root / 'unformatted'
        self.formatted = self.root / 'formatted'
        self.data = self.root / 'data'
        self.unformatted.mkdir()
        self.formatted.mkdir()
        for obj, key, value in [(console.config, 'ROOT', self.root),
                                (console.config, 'UNFORMATTED', self.unformatted),
                                (console.config, 'FORMATTED', self.formatted),
                                (console.config, 'PREVIEW', self.root / 'preview'),
                                (console.config, 'DATA', self.data),
                                (console.config, 'SETTINGS', self.data / '平台设置.json'),
                                (console.config, 'PUBLISH_RULES', self.data / '发布规则.json'),
                                (console.library, 'LEDGER', self.data / '库.json'),
                                (console, 'CURRENT', None),
                                (console, 'JOBS', {}),
                                (console, 'CACHE', {'at': 0, 'overview': None,
                                                    'images_at': 0, 'images': None}),
                                (console, 'SERVER', {'httpd': None, 'port': 8765}),
                                (console, 'CLEAR_IMAGE_CONFIRMATIONS', {})]:
            mock = patch.object(obj, key, value)
            mock.start()
            self.addCleanup(mock.stop)
        self.auth_manager = console.console_auth.AuthManager(
            self.root / 'console-auth-fixture.json', root=self.root)
        self.auth_manager.config_path.write_text(json.dumps({
            'schema': 1, 'username': 'fixture', 'kdf': 'pbkdf2_sha256',
            'iterations': console.console_auth.KDF_ITERATIONS,
            'salt': '00' * 16, 'digest': '00' * 32,
        }), encoding='utf-8')
        fingerprint = self.auth_manager._credential_fingerprint(
            self.auth_manager.load_credentials())
        self.auth_manager._sessions['fixture-session-token-012345678901234567890123'] = console.console_auth.AuthSession(
            'fixture', 'fixture-write-token', float('inf'), fingerprint)
        mock = patch.object(console, 'AUTH_MANAGER', self.auth_manager)
        mock.start(); self.addCleanup(mock.stop)
        self.response = None
        self.response_headers = []
        mock = patch.object(console.model_settings, 'resolve', return_value={})
        mock.start(); self.addCleanup(mock.stop)

    def handler(self, path, *, authorized=True, authenticated=True,
                host='127.0.0.1:8765', origin='http://127.0.0.1:8765', body=None):
        handler = object.__new__(console.Handler)
        handler.path = path
        payload = b'' if body is None else json.dumps(body).encode('utf-8')
        handler.headers = {'Host': host, 'Content-Length': str(len(payload))}
        if authenticated:
            handler.headers['Cookie'] = 'haoduoyu_dev_session=fixture-session-token-012345678901234567890123'
        if authorized:
            handler.headers[console.WRITE_TOKEN_HEADER] = 'fixture-write-token'
        if origin is not None:
            handler.headers['Origin'] = origin
        handler.rfile = io.BytesIO(payload)
        handler.server = SimpleNamespace(server_address=('127.0.0.1', 8765))
        handler.client_address = ('127.0.0.1', 12345)
        handler._json = lambda payload, code=200, **kwargs: (
            setattr(self, 'response', (code, payload)),
            setattr(self, 'response_headers', kwargs.get('extra_headers', [])))
        handler._send = lambda code, body, content_type, **kwargs: (
            setattr(self, 'response', (code, body)),
            setattr(self, 'response_headers', kwargs.get('extra_headers', [])))
        return handler

    def test_task_table_exposes_only_the_idempotent_multi_platform_sender(self):
        table = console.tasks()
        self.assertIn('一键送草稿', table)
        self.assertTrue({'头条', '知乎', '百家号'}.isdisjoint(table))
        self.assertFalse(any(spec.get('argv', [])[-3:] == ['run', '--limit', '0']
                             for spec in table.values()))

    def test_selected_sources_reach_worker(self):
        for sources in ["今日头条", "小红书", "今日头条,小红书"]:
            console.CURRENT = None
            console.JOBS.clear()
            with patch.object(console.threading, 'Thread') as thread:
                result = console.start('配图', provider='deepseek', model='deepseek-flash', sources=sources)
            self.assertIn('job', result)
            argv = thread.call_args.kwargs['args'][1]['argv']
            self.assertEqual(argv[argv.index('--来源') + 1], sources)

    def test_single_article_retry_passes_model_and_sources(self):
        import json
        from article_hub import image_actions
        payload = dict(topic='成稿:测试', mode='search', image='bad.jpg', count=1,
                       provider='deepseek', model='new-model', sources=['今日头条'], query='')
        with patch.object(console.threading, 'Thread') as thread, patch.object(image_actions, 'validate', return_value=payload):
            result = console.start_image_action(payload)
        self.assertIn('job', result)
        spec = thread.call_args.kwargs['args'][1]
        self.assertEqual(spec['argv'], ['-m', 'article_hub.image_actions'])
        self.assertEqual(json.loads(spec['env']['ARTICLE_HUB_IMAGE_ACTION']), payload)

    def test_new_image_task_uses_the_latest_saved_collaboration(self):
        from article_hub import image_actions
        topic="TP-20260925-savedcfg1"
        saved={"mode":"collaborative","roles":{
            "text":{"provider":"deepseek","model":"saved-text"},
            "layout":{"provider":"gpt","model":"saved-layout"}}}
        stale={"mode":"collaborative","roles":{
            "text":{"provider":"doubao","model":"stale-text"},
            "layout":{"provider":"doubao","model":"stale-layout"}}}
        captured={}
        validated={"topic":topic,"mode":"search","image":"","count":1,
                   "provider":"deepseek","model":"saved-text","sources":["今日头条"],
                   "topic_package":True}
        def capture(data):
            captured.update(data)
            return {**validated,"image_mode":data["image_mode"],"collaboration":data["collaboration"]}
        with patch.object(console.image_review,"topic_path",return_value=self.unformatted), \
             patch.object(console.topic_packages,"is_package",return_value=True), \
             patch.object(console.model_settings,"image_collaboration",return_value=saved), \
             patch.object(image_actions,"validate",side_effect=capture), \
             patch.object(console.threading,"Thread") as thread:
            result=console.start_image_action({"topic":topic,"mode":"search",
                "image_mode":"collaborative","collaboration":stale})
        self.assertIn("job",result)
        self.assertEqual(captured["collaboration"],saved)
        spec=thread.call_args.kwargs["args"][1]
        self.assertEqual(json.loads(spec["env"]["ARTICLE_HUB_IMAGE_ACTION"])["collaboration"],saved)

    def test_initial_search_uses_the_per_article_image_plan(self):
        with patch.object(console.threading, 'Thread') as thread:
            console.start('配图', provider='deepseek', model='deepseek-flash', allow_ai_images=True)
        spec = thread.call_args.kwargs['args'][1]
        self.assertNotIn('--不排版', spec['argv'])
        self.assertNotIn('--最多图片', spec['argv'])
        self.assertEqual(spec['env']['ARTICLE_HUB_ALLOW_AI_IMAGES'], '0',
                         'the new keyword-image flow never falls back to automatic AI generation')

    def test_layout_needs_one_approved_picture_and_ignores_the_plan_size(self):
        for states, error in [({'a.jpg': 'pending'}, '1 张图片待审阅'),
                              ({'a.jpg': 'pending', 'b.jpg': 'rejected'}, '1 张图片待审阅'),
                              ({'a.jpg': 'rejected'}, '还没有保留任何图片'),
                              ({}, '还没有保留任何图片')]:
            with patch.object(console.image_review, 'ensure_editable'), \
                 patch.object(console.image_review, 'topic_path', return_value=self.root), \
                 patch.object(console.image_review, 'load_review', return_value={'states': states}), \
                 patch.object(console.threading, 'Thread') as thread:
                self.assertIn(error, console.start('排版', topic='测试')['error'])
                thread.assert_not_called()
        # 计划张数只是建议：少于或多于计划张数都能定稿。
        for states in [{'a.jpg': 'approved'}, {f'{i}.jpg': 'approved' for i in range(6)}]:
            console.CURRENT = None
            console.JOBS.clear()
            with patch.object(console.image_review, 'ensure_editable'), \
                 patch.object(console.image_review, 'topic_path', return_value=self.root), \
                 patch.object(console.image_review, 'load_review', return_value={'states': states}), \
                 patch.object(console.image_review, 'target_count', return_value=3), \
                 patch.object(console.threading, 'Thread') as thread:
                self.assertIn('job', console.start('排版', topic='测试'))
                thread.assert_called_once()

    def test_single_article_image_action_receives_dynamic_target(self):
        with patch.object(console.image_review, 'ensure_editable'), \
             patch.object(console.image_review, 'topic_path', return_value=self.root), \
             patch.object(console.image_review, 'target_count', return_value=8), \
             patch.object(console, 'start_image_action', return_value={'job': {'id': 1}}) as action:
            result = console.start('配图', topic='测试', provider='deepseek',
                                   model='deepseek-flash', sources='全网')
        self.assertIn('job', result)
        self.assertEqual(action.call_args.args[0]['count'], 8)

    def test_topic_sources_reach_worker(self):
        with patch.object(console.threading, 'Thread') as thread, patch.object(console.model_settings, 'resolve', return_value={}):
            result = console.start('选题', provider='deepseek', model='test', sources='微博')
        self.assertIn('job', result)
        argv = thread.call_args.kwargs['args'][1]['argv']
        self.assertEqual(argv[argv.index('--来源') + 1], '微博')

    def test_invalid_sources_never_start_worker(self):
        with patch.object(console.threading, 'Thread') as thread:
            for sources in ['', '未知平台', '今日头条,未知平台']:
                self.assertIn('error', console.start('配图', provider='deepseek', model='deepseek-flash', sources=sources))
            thread.assert_not_called()

    def test_busy_rejects_file_operations_and_quit(self):
        console.CURRENT = console.Job(1, '配图', '配图')
        for endpoint in ['clear-images', 'quit', 'image-action']:
            h=self.handler('/api/' + endpoint)
            h.do_POST()
            self.assertEqual(self.response[0], 409)

    def test_article_review_and_export_are_blocked_only_for_the_running_article(self):
        console.CURRENT = console.Job(1, '配图', '按关键词配图', topic='B')
        with patch.object(console.image_review, 'save_review', return_value={'revision': 1}) as save_review:
            self.handler('/api/image-review', body={
                'topic': 'A', 'states': {'a.jpg': 'approved'}
            }).do_POST()
            self.assertEqual(self.response[0], 200)
            save_review.assert_called_once_with('A', {'a.jpg': 'approved'}, None)

            self.handler('/api/image-review', body={
                'topic': 'B', 'states': {'b.jpg': 'approved'}
            }).do_POST()
            self.assertEqual(self.response[0], 409)
            self.assertEqual(save_review.call_count, 1)

        with patch.object(console.image_review, 'save_selection', return_value=self.unformatted / 'A') as save_selection:
            self.handler('/api/image-selection', body={
                'topic': 'A', 'images': ['a.jpg']
            }).do_POST()
            self.assertEqual(self.response[0], 200)
            save_selection.assert_called_once_with('A', ['a.jpg'], None)

            self.handler('/api/image-selection', body={
                'topic': 'B', 'images': ['b.jpg']
            }).do_POST()
            self.assertEqual(self.response[0], 409)
            self.assertEqual(save_selection.call_count, 1)

        console.CURRENT = console.Job(2, '排版', '旧稿B 排版', topic='B')
        with patch.object(console.image_review, 'save_review') as save_review:
            self.handler('/api/image-review', body={
                'topic': 'B', 'states': {'b.jpg': 'rejected'}
            }).do_POST()
            self.assertEqual(self.response[0], 409)
            self.assertIn('排版', self.response[1]['error'])
            save_review.assert_not_called()

    def test_legacy_batch_progress_locks_only_active_word_article(self):
        batch = console.Job(2, '配图', '旧版 Word 批量配图')
        console.CURRENT = batch
        package_folder = self.unformatted / 'TP-20260924-1234abcd'
        legacy_a = self.unformatted / '旧稿A'
        legacy_b = self.unformatted / '旧稿B'
        for folder in (package_folder, legacy_a, legacy_b):
            folder.mkdir()
        report = {'状态': '运行中', '文章': [
            {'topic': '旧稿A', '标题': '同名文章', '状态': '已完成'},
            {'topic': '旧稿B', '标题': '同名文章', '状态': '运行中'},
        ]}
        with patch.object(console.image_review, 'topic_path',
                          side_effect=lambda topic: self.unformatted / topic), \
             patch.object(console.topic_packages, 'is_package',
                          side_effect=lambda folder: folder.name.startswith('TP-')), \
             patch.object(console.image_review, '_read_status',
                          return_value=(batch.started_at + 1, report)):
            self.assertFalse(console.article_image_busy('旧稿A'))
            self.assertTrue(console.article_image_busy('旧稿B'))
            self.assertFalse(console.article_image_busy('TP-20260924-1234abcd'))

    def test_image_return_stops_running_job_and_remains_available(self):
        console.CURRENT = console.Job(1, '配图', '配图')
        with patch.object(console, 'stop', return_value={'ok': True}) as stop, \
             patch.object(console.image_review, 'return_for_images',
                          return_value={'topic': '测试', 'message': '已退回'}) as returned:
            self.handler('/api/image-return?topic=测试').do_POST()
        self.assertEqual(self.response[0], 200)
        stop.assert_called_once_with('images', '1')
        returned.assert_called_once_with('测试')

    def test_every_post_is_authenticated_before_routing_or_locking(self):
        endpoints = [
            '/api/run?task=预览', '/api/stop', '/api/quit', '/api/dispatch',
            '/api/dispatch-all', '/api/clear-images/preview', '/api/clear-images/confirm',
            '/api/model-choice', '/api/topic-rewrite', '/api/image-review', '/api/not-found',
        ]
        operation_lock = MagicMock()
        with patch.object(console, 'OPERATION_LOCK', operation_lock):
            for endpoint in endpoints:
                self.response = None
                self.handler(endpoint, authorized=False).do_POST()
                self.assertEqual(self.response[0], 403, endpoint)
            operation_lock.acquire.assert_not_called()

        self.response = None
        self.handler('/api/clear-result', authenticated=False).do_POST()
        self.assertEqual(self.response[0], 401)

    def test_anonymous_gets_only_login_page_and_nonrevealing_health(self):
        closed = console.console_auth.AuthManager(self.root / 'missing-auth.json', root=self.root)
        with patch.object(console, 'AUTH_MANAGER', closed):
            login = self.handler('/', authenticated=False)
            login.do_GET()
            self.assertEqual(self.response[0], 200)
            login_page = self.response[1].decode('utf-8')
            self.assertIn('登录好多鱼图文', login_page)
            self.assertNotIn('class="sidebar"', login_page)
            self.assertIn('--setup', login_page)

            with patch.object(console, 'state') as state_reader:
                for endpoint in ('/api/state', '/api/review-image?topic=x&name=x.jpg',
                                 '/api/topic-output?topic_id=x&kind=docx', '/favicon.ico'):
                    self.response = None
                    self.handler(endpoint, authenticated=False).do_GET()
                    self.assertEqual(self.response[0], 401, endpoint)
                state_reader.assert_not_called()

        self.response = None
        self.handler('/api/health', authenticated=False).do_GET()
        self.assertEqual(self.response, (200, console._identity_payload()))
        self.assertNotIn('workspace', self.response[1])

    def test_authenticated_home_uses_session_csrf_token_and_logout_expires_session(self):
        self.response = None
        self.handler('/').do_GET()
        self.assertEqual(self.response[0], 200)
        self.assertIn('fixture-write-token', self.response[1].decode('utf-8'))

        self.response = None
        self.handler('/api/logout', body={}).do_POST()
        self.assertEqual(self.response, (200, {'ok': True}))
        cookie = dict(self.response_headers).get('Set-Cookie', '')
        self.assertIn('HttpOnly', cookie)
        self.assertIn('SameSite=Strict', cookie)
        self.assertIn('Max-Age=0', cookie)

        self.response = None
        self.handler('/api/state').do_GET()
        self.assertEqual(self.response[0], 401)

    def test_login_creates_http_only_session_cookie_without_returning_secret(self):
        password = 'local-test-password-with-enough-length'
        self.auth_manager.save_credentials('fixture-user', password)
        self.response = None
        handler = self.handler('/api/login', authenticated=False,
                               body={'username': 'fixture-user', 'password': password})
        handler.headers['Content-Type'] = 'application/json'
        handler.do_POST()
        self.assertEqual(self.response, (200, {'ok': True}))
        cookie = dict(self.response_headers).get('Set-Cookie', '')
        self.assertIn('HttpOnly', cookie)
        self.assertIn('SameSite=Strict', cookie)
        self.assertNotIn(password, cookie)
        self.assertNotIn(password, self.auth_manager.config_path.read_text(encoding='utf-8'))

    def test_write_auth_rejects_wrong_host_origin_missing_origin_and_token(self):
        cases = [
            self.handler('/api/clear-result', host='evil.example:8765'),
            self.handler('/api/clear-result', origin='https://evil.example'),
            self.handler('/api/clear-result', origin=None),
            self.handler('/api/clear-result', authorized=False),
        ]
        cases[-1].headers[console.WRITE_TOKEN_HEADER] = 'wrong-token'
        for handler in cases:
            handler.do_POST()
            self.assertEqual(self.response[0], 403)
        valid = self.handler('/api/clear-result', origin='http://127.0.0.1:8765')
        valid.do_POST()
        self.assertEqual(self.response, (200, {'ok': True}))

    def test_clear_result_only_acknowledges_matching_finished_job(self):
        finished = console.Job(7, '配图', '完成')
        finished.status = 'ok'
        console.CURRENT = finished
        self.handler('/api/clear-result?id=6').do_POST()
        self.assertIs(console.CURRENT, finished)
        self.handler('/api/clear-result?id=7').do_POST()
        self.assertIsNone(console.CURRENT)

        running = console.Job(8, '配图', '运行中')
        console.CURRENT = running
        self.handler('/api/clear-result?id=8').do_POST()
        self.assertIs(console.CURRENT, running)

    def test_lightweight_state_does_not_scan_docx_topics(self):
        with patch.object(console, 'overview', return_value={}), \
             patch.object(console, 'latest_topics', return_value=[]), \
             patch.object(console, 'pending_lists', return_value={}), \
             patch.object(console.image_review, 'list_topics') as list_topics:
            result = console.state(include_images=False)
        self.assertNotIn('image_review', result)
        list_topics.assert_not_called()

    def test_old_image_progress_is_not_replayed_for_new_job(self):
        self.data.mkdir(exist_ok=True)
        progress = self.data / '配图进度.json'
        progress.write_text('{"状态":"已完成","文章":[{"标题":"旧稿"}]}', encoding='utf-8')
        job = console.Job(9, '配图', '新任务').snapshot()
        with patch.object(console._time, 'time', return_value=job['started_at'] - 5):
            # Force an older file timestamp without depending on wall-clock sleeps.
            import os
            os.utime(progress, (job['started_at'] - 5, job['started_at'] - 5))
        self.assertEqual(console.sourcing_status(job), {})

    def test_sourcing_status_uses_locked_snapshot_reader(self):
        job = console.Job(10, '配图', '正在配图').snapshot()
        payload = {'状态': '运行中', '文章': [{'标题': '新稿'}]}
        with patch.object(console.image_review, '_read_status',
                          return_value=(job['started_at'] + 1, payload)) as reader:
            self.assertEqual(console.sourcing_status(job), payload)
        reader.assert_called_once_with(self.data / '配图进度.json')

    def test_home_page_injects_only_the_session_csrf_token(self):
        page = self.root / 'page.html'
        page.write_text('<script>var token = "__HAODUOYU_REQUEST_TOKEN__";</script>', encoding='utf-8')
        with patch.object(console, 'PAGE_FILE', page):
            rendered = console._render_page('fixture-session-csrf')
        self.assertIn('fixture-session-csrf', rendered)
        self.assertNotIn('__HAODUOYU_REQUEST_TOKEN__', rendered)

    def test_clear_images_requires_preview_and_one_time_confirmation(self):
        platform = self.root / 'platform'
        platform.mkdir()
        archived_root = self.root / '已分发归档'
        archive = archived_root / 'topic'
        archive.mkdir(parents=True)
        (archive / 'topic.docx').write_bytes(b'valid archived document fixture')
        (archive / '配图清单.json').write_text('{"配图": []}', encoding='utf-8')
        (archive / 'a.jpg').write_bytes(b'archive image')
        protected = [self.unformatted / 'topic' / 'a.jpg', self.formatted / 'b.png',
                     self.root / '素材' / '图标' / 'logo.png', platform / 'diagnostic.png']
        for path in protected:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'must-stay')

        with patch.object(console, 'PLATFORM_DIRS', {'头条': platform}):
            preview_handler = self.handler('/api/clear-images/preview')
            preview_handler.do_POST()
            self.assertEqual(self.response[0], 200)
            preview = self.response[1]
            self.assertEqual(preview['count'], 1)
            self.assertTrue(all(path.exists() for path in protected))
            self.assertTrue((archive / 'topic.docx').exists())

            confirm_handler = self.handler('/api/clear-images/confirm',
                                           body={'nonce': preview['nonce']})
            confirm_handler.do_POST()
            self.assertEqual(self.response[0], 200)
            self.assertEqual(self.response[1]['removed'], 1)
            self.assertFalse(archive.exists())
            backup = Path(self.response[1]['backup']) / 'topic'
            self.assertEqual((backup / 'topic.docx').read_bytes(), b'valid archived document fixture')
            self.assertTrue((archived_root / 'topic.docx').exists())
            self.assertTrue(all(path.exists() for path in protected))

            replay = self.handler('/api/clear-images/confirm', body={'nonce': preview['nonce']})
            replay.do_POST()
            self.assertEqual(self.response[0], 400)

    def test_clear_preview_does_not_delete_file_changed_before_confirmation(self):
        archive = self.root / '已分发归档' / 'topic'
        archive.mkdir(parents=True)
        document = archive / 'topic.docx'
        document.write_bytes(b'old document')
        (archive / '配图清单.json').write_text('{"配图": []}', encoding='utf-8')
        with patch.object(console, 'PLATFORM_DIRS', {}):
            preview = console._create_clear_image_preview()
            document.write_bytes(b'new-content-with-different-size')
            with self.assertRaisesRegex(ValueError, '归档内容发生变化，请重新预览'):
                console._confirm_clear_images(preview['nonce'])
        self.assertTrue(document.exists())
        self.assertEqual(document.read_bytes(), b'new-content-with-different-size')

    def test_legacy_clear_endpoint_can_no_longer_delete(self):
        handler = self.handler('/api/clear-images')
        handler.do_POST()
        self.assertEqual(self.response[0], 410)

    def test_partial_dispatch_does_not_archive(self):
        (self.formatted / 'topic').mkdir()
        platforms = console.config.PLATFORM_ORDER
        def dispatch(name):
            if name == platforms[-1]:
                raise OSError('mock platform unavailable')
            return DispatchResult(name, [('Title', self.root / 'draft.docx')], [],
                                  [('topic', 'Title', self.root / 'draft.docx')])
        with patch.object(console.library, 'dispatch', side_effect=dispatch), patch.object(
                console.library, 'load_ledger', return_value={'文章': {'topic': {'标题': 'Title', '分发': dict.fromkeys(platforms, {})}}}):
            self.handler('/api/dispatch-all?purge=1').do_POST()
        self.assertTrue((self.formatted / 'topic').exists())
        self.assertTrue(self.response[1]['errors'])
        self.assertEqual(self.response[1]['moved'], [])

    def test_full_dispatch_archives_only_current_successes(self):
        for topic in ['topic', 'untouched']:
            (self.formatted / topic).mkdir()
        with patch.object(console.library, 'dispatch', side_effect=lambda name: DispatchResult(
                name, [('Title', self.root / 'draft.docx')], [],
                [('topic', 'Title', self.root / 'draft.docx')])), patch.object(
                console.library, 'load_ledger', return_value={'文章': {'topic': {'标题': 'Title'}, 'untouched': {'标题': 'Other'}}}):
            self.handler('/api/dispatch-all?purge=1').do_POST()
        self.assertEqual(self.response[1]['moved'], ['topic'])
        self.assertTrue((self.root / '已分发归档/topic').is_dir())
        self.assertTrue((self.formatted / 'untouched').is_dir())

    def test_dispatch_all_archives_by_current_topic_identity_not_duplicate_title(self):
        for topic in ['current', 'same-title-but-incomplete']:
            folder = self.formatted / topic
            folder.mkdir()
            (folder / 'draft.docx').write_bytes(topic.encode('utf-8'))
        platforms = console.config.PLATFORM_ORDER

        def dispatch(name):
            topics = ['current']
            if name != platforms[-1]:
                topics.append('same-title-but-incomplete')
            copied = [('Same title', self.root / f'{topic}.docx') for topic in topics]
            identities = [(topic, 'Same title', path)
                          for topic, (_title, path) in zip(topics, copied)]
            return DispatchResult(name, copied, [], identities)

        with patch.object(console.library, 'dispatch', side_effect=dispatch):
            self.handler('/api/dispatch-all?purge=1').do_POST()

        self.assertEqual(self.response[1]['moved'], ['current'])
        self.assertTrue((self.root / '已分发归档/current').is_dir())
        self.assertTrue((self.formatted / 'same-title-but-incomplete').is_dir())

    def test_locked_source_is_archived_and_reported_as_cleanup_warning(self):
        source = self.formatted / 'topic'
        source.mkdir()
        (source / 'draft.docx').write_bytes(b'complete package')
        platforms = console.config.PLATFORM_ORDER
        ledger = {'文章': {'topic': {'标题': 'Title'}}}
        real_rmtree = console.library.shutil.rmtree

        def deny_source_cleanup(path, *args, **kwargs):
            if Path(path).resolve() == source.resolve():
                raise PermissionError(5, 'directory is in use')
            return real_rmtree(path, *args, **kwargs)

        with patch.object(console.library, 'dispatch', side_effect=lambda name: DispatchResult(
                name, [('Title', self.root / 'draft.docx')], [],
                [('topic', 'Title', self.root / 'draft.docx')])), patch.object(
                console.library, 'load_ledger', return_value=ledger), patch.object(
                console.library.shutil, 'rmtree', side_effect=deny_source_cleanup):
            self.handler('/api/dispatch-all?purge=1').do_POST()

        payload = self.response[1]
        archive = self.root / '已分发归档' / 'topic'
        self.assertEqual(self.response[0], 200)
        self.assertEqual(payload['errors'], [])
        self.assertEqual(payload['moved'], ['topic'])
        self.assertEqual(payload['cleanup_pending'], ['topic'])
        self.assertIn('已分发并归档', payload['warnings'][0])
        self.assertTrue((archive / 'draft.docx').is_file())
        self.assertTrue((archive / console.library.ARCHIVE_MARKER).is_file())
        self.assertTrue((source / console.library.ARCHIVE_MARKER).is_file())
        # The locked residue is excluded from later scans, preventing a resend.
        self.assertEqual(console.library.scan_formatted(), [])
        # Removing the residue marker and replacing the content creates a real
        # new article, even though an old pending-cleanup receipt still exists.
        (source / console.library.ARCHIVE_MARKER).unlink()
        (source / 'draft.docx').write_bytes(b'a different article')
        self.assertEqual([row['主题'] for row in console.library.scan_formatted()], ['topic/draft'])
        replacement_archive = console.library.archive_dispatched_topic('topic')
        self.assertNotEqual(replacement_archive.target, archive)
        self.assertEqual((replacement_archive.target / 'draft.docx').read_bytes(), b'a different article')

    def test_source_rename_permission_error_cannot_break_copy_first_archive(self):
        source = self.formatted / 'topic'
        source.mkdir()
        (source / 'draft.docx').write_bytes(b'complete package')
        ledger = {'文章': {'topic': {'标题': 'Title'}}}
        with patch.object(console.library, 'dispatch', side_effect=lambda name: DispatchResult(
                name, [('Title', self.root / 'draft.docx')], [],
                [('topic', 'Title', self.root / 'draft.docx')])), patch.object(
                console.library, 'load_ledger', return_value=ledger), patch.object(
                Path, 'rename', side_effect=PermissionError(5, 'rename denied')):
            self.handler('/api/dispatch-all?purge=1').do_POST()

        payload = self.response[1]
        self.assertEqual(payload['errors'], [])
        self.assertEqual(payload['moved'], ['topic'])
        self.assertFalse(source.exists())
        self.assertTrue((self.root / '已分发归档/topic/draft.docx').is_file())
        # A later article may legitimately reuse the same topic folder name.
        source.mkdir()
        (source / 'new.docx').write_bytes(b'new article')
        self.assertEqual([row['主题'] for row in console.library.scan_formatted()], ['topic/new'])

    def test_topic_prefix_sibling_is_rejected(self):
        daily = self.root / 'daily'
        sibling = self.root / 'daily-private'
        sibling.mkdir()
        secret = sibling / 'note.txt'
        secret.write_text('fixture', encoding='utf-8')
        with patch.object(console, 'DAILY_DIR', daily):
            self.handler('/api/topic-text?path=' + secret.as_posix()).do_GET()
        self.assertEqual(self.response[0], 403)

    def test_topic_brief_endpoint_excludes_local_image_prompt(self):
        daily = self.root / 'daily'
        daily.mkdir()
        path = daily / '选题.md'
        path.write_text(
            '# 建议标题：测试\n\n> 选题编号：TP-20260927-aabbccdd\n\n文章提示词：\n\n'
            '什么事：这里是一条已经确认进入写作流程的事件线索\n'
            '值得写：事件存在现实影响；可从具体当事人的实际处境角度切入。\n'
            '特殊要求：无，由写作团判断\n'
            '建议标题：测试标题（仅供参考，可调整）\n\n'
            '图片提示词：\n\n- 不应复制的图片词\n', encoding='utf-8')
        sent = []
        handler = self.handler('/api/topic-brief?path=' + path.as_posix())
        handler._send = lambda code, body, content_type: sent.append(
            (code, body.decode('utf-8'), content_type))
        with patch.object(console, 'DAILY_DIR', daily):
            handler.do_GET()
        self.assertEqual(sent[0][0], 200)
        self.assertEqual(len(sent[0][1].splitlines()), 4)
        self.assertNotIn('图片提示词', sent[0][1])
        self.assertNotIn('选题编号', sent[0][1])

    def test_topic_brief_endpoint_rejects_unsafe_legacy_prompt(self):
        daily = self.root / 'daily'
        daily.mkdir()
        path = daily / '旧提示词.md'
        path.write_text(
            '文章提示词：\n\n必须给五个标题并评分，再按固定结构写作。\n\n'
            '图片提示词：\n\n- 不应复制的图片词\n', encoding='utf-8')
        with patch.object(console, 'DAILY_DIR', daily):
            self.handler('/api/topic-brief?path=' + path.as_posix()).do_GET()
        self.assertEqual(self.response[0], 422)
        self.assertIn('缺少可安全转换', self.response[1]['error'])

    def test_stopped_before_spawn_never_launches(self):
        job = console.Job(1, '选题', '选题')
        job.stopped = True
        with patch.object(console.subprocess, 'Popen') as popen:
            console._execute(job, {'argv': [], 'cwd': self.root})
        popen.assert_not_called()
        self.assertEqual(job.status, 'bad')

    def test_failure_does_not_reuse_earlier_success_summary(self):
        summary = console._summary_for('选题', ['已找到 3 个选题', '保存失败'], 1)
        self.assertEqual(summary, '没跑通：保存失败')

    def test_topic_error_survives_final_count_line(self):
        summary = console._summary_for('选题', ['没写成：接口不匹配', '已找到 0 个选题'], 1)
        self.assertEqual(summary, '没写成：接口不匹配')

    def test_topic_summary_uses_generated_count(self):
        summary = console._summary_for('选题', ['已找到 3 个选题', '已找到 2 个选题'], 0)
        self.assertEqual(summary, '已找到 2 个选题')

    def test_overview_does_not_write_ledger_while_task_runs(self):
        console.CURRENT = console.Job(1, '配图', '配图')
        with patch.object(console.library, 'load_ledger', return_value={'文章': {}}), patch.object(console.library, 'sync_receipts') as sync:
            self.assertEqual(console.overview(force=True)['totals']['篇数'], 0)
        sync.assert_not_called()

    def test_identity_probe_rejects_unrelated_http_service(self):
        response = SimpleNamespace(status=200, read=lambda limit: b'<html>other service</html>')
        connection = MagicMock()
        connection.getresponse.return_value = response
        with patch.object(console, 'HTTPConnection', return_value=connection):
            self.assertFalse(console._already_running(8765))

    def test_identity_probe_accepts_matching_service_protocol_without_workspace(self):
        payload = console._identity_payload()
        response = SimpleNamespace(status=200,
                                   read=lambda limit: json.dumps(payload).encode('utf-8'))
        connection = MagicMock()
        connection.getresponse.return_value = response
        with patch.object(console, 'HTTPConnection', return_value=connection):
            self.assertTrue(console._already_running(8765))
        wrong = dict(payload, protocol='other-protocol')
        response = SimpleNamespace(status=200,
                                   read=lambda limit: json.dumps(wrong).encode('utf-8'))
        with patch.object(console, 'HTTPConnection', return_value=connection):
            connection.getresponse.return_value = response
            self.assertFalse(console._already_running(8765))

    def test_running_console_scan_checks_entire_port_window(self):
        with patch.object(console, '_already_running', side_effect=lambda port: port == 8768) as probe:
            self.assertEqual(console._find_running_console(8765), 8768)
        self.assertEqual([call.args[0] for call in probe.call_args_list], [8765, 8766, 8767, 8768])

    def test_serve_reuses_existing_console_on_non_initial_port(self):
        with patch.object(console, '_find_running_console', return_value=8768), \
             patch.object(console, '_open_window') as open_window, \
             patch.object(console, 'ThreadingHTTPServer') as server:
            self.assertEqual(console.serve(port=8765, open_browser=True), 0)
        open_window.assert_called_once_with('http://127.0.0.1:8768/')
        server.assert_not_called()

    def test_serve_startup_instructions_distinguish_logout_from_stopping_service(self):
        from contextlib import contextmanager, redirect_stdout
        output = io.StringIO()
        @contextmanager
        def startup_mutex():
            yield True
        server = MagicMock()
        thread = MagicMock()
        thread.join.side_effect = [KeyboardInterrupt(), None]
        with patch.object(console, '_find_running_console', side_effect=[None, None]), \
             patch.object(console, '_startup_mutex', startup_mutex), \
             patch.object(console, 'ThreadingHTTPServer', return_value=server), \
             patch.object(console.threading, 'Thread', return_value=thread), \
             patch.object(console, '_already_running', return_value=True), \
             redirect_stdout(output):
            self.assertEqual(console.serve(port=8765, open_browser=False), 0)
        text = output.getvalue()
        self.assertIn('右上角「退出登录」只会退出登录，不会停止服务', text)
        self.assertIn('停止服务请在此终端按 Ctrl+C', text)
        self.assertNotIn('页面右上角点「退出控制台」', text)


if __name__ == '__main__':
    unittest.main()
