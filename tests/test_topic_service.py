import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from article_hub import topic_service, topics


class TopicServiceTests(unittest.TestCase):
    def setUp(self):
        with topic_service.LOCK:
            topic_service.OPERATION.clear()
        self.addCleanup(topic_service.OPERATION.clear)

    def test_running_operation_expires_and_releases_next_request(self):
        with topic_service.LOCK:
            topic_service.OPERATION.update(
                id='stuck', status='running', started_at=1, deadline=2)
        with patch.object(topic_service.time, 'time', return_value=3):
            state = topic_service.snapshot('stuck')
        self.assertEqual(state['status'], 'failed')
        self.assertIn('超过 2 分钟', state['error'])

        public = {'choices': {'topics': {'provider': 'deepseek', 'model': 'fixture'}}}
        with patch.object(topic_service.model_settings, 'public_config', return_value=public), \
             patch.object(topic_service.model_settings, 'resolve', return_value={}), \
             patch.object(topic_service.threading, 'Thread') as thread, \
             patch.object(topic_service.time, 'time', return_value=4):
            started = topic_service.start('recommendations', {'sources': ['今日头条']})
        self.assertNotEqual(started['id'], 'stuck')
        self.assertEqual(topic_service.OPERATION['status'], 'running')
        thread.assert_called_once()

    def test_terminal_operation_is_removed_after_ttl(self):
        with topic_service.LOCK:
            topic_service.OPERATION.update(
                id='old', status='done', result={}, finished_at=10)
            topic_service._expire_locked(10 + topic_service.OPERATION_TTL + 1)
            self.assertEqual(topic_service.OPERATION, {})

    def test_timed_out_rewrite_cannot_write_or_overwrite_new_operation(self):
        public = {'choices': {'topics': {'provider': 'deepseek', 'model': 'fixture'}}}
        entered = threading.Event()
        release = threading.Event()
        old_guarded = threading.Event()
        new_guarded = threading.Event()
        ids = {}
        original_guard = topic_service._commit_if_current

        def slow_chat(*_args, **_kwargs):
            entered.set()
            release.wait(5)
            return '模型返回无有效标题，使用基础版'

        def observe_guard(job_id, commit):
            try:
                return original_guard(job_id, commit)
            finally:
                (old_guarded if job_id == ids.get('old') else new_guarded).set()

        with tempfile.TemporaryDirectory() as temp, \
             patch.object(topics, 'DAILY_DIR', Path(temp)), \
             patch.object(topics, '_rule_digest', return_value='规则'), \
             patch.object(topics.ai, 'chat', side_effect=slow_chat), \
             patch.object(topics, 'live_recommendations', return_value={'items': []}), \
             patch.object(topic_service.model_settings, 'public_config', return_value=public), \
             patch.object(topic_service.model_settings, 'resolve', return_value={}), \
             patch.object(topic_service, '_commit_if_current', side_effect=observe_guard):
            old = topic_service.start('rewrite', {'title': '会超时的旧选题', 'sources': ['今日头条']})
            ids['old'] = old['id']
            self.assertTrue(entered.wait(2), '旧任务应进入慢模型调用')
            with topic_service.LOCK:
                deadline = topic_service.OPERATION['deadline']
            with patch.object(topic_service.time, 'time', return_value=deadline + 1):
                self.assertEqual(topic_service.snapshot(old['id'])['status'], 'failed')

            new = topic_service.start('recommendations', {'sources': ['今日头条']})
            ids['new'] = new['id']
            self.assertTrue(new_guarded.wait(2), '新任务应正常发布只读结果')
            release.set()
            self.assertTrue(old_guarded.wait(2), '旧任务返回后应经过所有权检查')

            state = topic_service.snapshot(new['id'])
            self.assertEqual(state['status'], 'done')
            self.assertEqual(state['result'], {'items': []})
            self.assertEqual(list(Path(temp).iterdir()), [], '超时旧任务不得留下任何选题文件')

    def test_current_rewrite_commits_once(self):
        public = {'choices': {'topics': {'provider': 'deepseek', 'model': 'fixture'}}}
        committed = threading.Event()
        prepared = {'fixture': True}
        result = {'标题': '已定标题'}

        def commit(value):
            self.assertIs(value, prepared)
            committed.set()
            return result

        with patch.object(topic_service.model_settings, 'public_config', return_value=public), \
             patch.object(topic_service.model_settings, 'resolve', return_value={}), \
             patch.object(topics, 'prepare_recommendation', return_value=prepared), \
             patch.object(topics, 'commit_recommendation', side_effect=commit) as publish:
            started = topic_service.start('rewrite', {'title': '正常选题', 'sources': ['今日头条']})
            self.assertTrue(committed.wait(2))
            state = topic_service.snapshot(started['id'])
        publish.assert_called_once_with(prepared)
        self.assertEqual(state['status'], 'done')
        self.assertEqual(state['result'], result)

    def test_manual_batch_needs_titles_and_gets_a_longer_deadline(self):
        public = {'choices': {'topics': {'provider': 'deepseek', 'model': 'fixture'}}}
        committed = threading.Event()
        prepared = {'fixture': True}
        result = {'items': [{'标题': '甲选题'}]}

        def commit(value):
            self.assertIs(value, prepared)
            committed.set()
            return result

        with patch.object(topic_service.model_settings, 'public_config', return_value=public), \
             patch.object(topic_service.model_settings, 'resolve', return_value={}), \
             patch.object(topics, 'prepare_manual_topics', return_value=prepared) as prepare, \
             patch.object(topics, 'commit_manual_topics', side_effect=commit) as publish:
            started = topic_service.start('manual', {'titles': '甲选题\n乙选题', 'sources': []})
            self.assertTrue(committed.wait(2))
            state = topic_service.snapshot(started['id'])
        self.assertEqual(prepare.call_args.args[0], ['甲选题', '乙选题'])
        self.assertEqual(prepare.call_args.kwargs['sources_names'], list(topics.TOPIC_SOURCES))
        publish.assert_called_once_with(prepared)
        self.assertEqual(state['status'], 'done')
        self.assertEqual(state['result'], result)
        self.assertGreater(state['timeout'], topic_service.OPERATION_TIMEOUT)

    def test_manual_batch_rejects_empty_input_and_unknown_kinds(self):
        public = {'choices': {'topics': {'provider': 'deepseek', 'model': 'fixture'}}}
        with patch.object(topic_service.model_settings, 'public_config', return_value=public), \
             patch.object(topic_service.model_settings, 'resolve', return_value={}):
            with self.assertRaisesRegex(ValueError, '至少输入一条'):
                topic_service.start('manual', {'titles': '   \n  '})
            with self.assertRaisesRegex(ValueError, '最多 6 条'):
                topic_service.start('manual', {'titles': [f'选题{index}' for index in range(7)]})
        with self.assertRaisesRegex(ValueError, '不支持'):
            topic_service.start('未知任务', {})

    def test_commit_failure_marks_current_operation_failed(self):
        public = {'choices': {'topics': {'provider': 'deepseek', 'model': 'fixture'}}}
        attempted = threading.Event()

        def fail(_prepared):
            attempted.set()
            raise OSError('fixture commit failure')

        with patch.object(topic_service.model_settings, 'public_config', return_value=public), \
             patch.object(topic_service.model_settings, 'resolve', return_value={}), \
             patch.object(topics, 'prepare_recommendation', return_value={'fixture': True}), \
             patch.object(topics, 'commit_recommendation', side_effect=fail):
            started = topic_service.start('rewrite', {'title': '提交失败', 'sources': ['今日头条']})
            self.assertTrue(attempted.wait(2))
            state = topic_service.snapshot(started['id'])
        self.assertEqual(state['status'], 'failed')
        self.assertIn('fixture commit failure', state['error'])


if __name__ == '__main__':
    unittest.main()
