import io
import json
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch
from PIL import Image

from article_hub import config, image_actions as actions, image_review as review, sourcing, model_settings
from article_hub.docxio import Block, write_document
from article_hub.hits import Hit


class ImageActionTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        for name in ['UNFORMATTED', 'FORMATTED', 'DATA']:
            folder = self.root / name
            folder.mkdir()
            p = patch.object(config, name, folder)
            p.start(); self.addCleanup(p.stop)
        self.folder = config.UNFORMATTED / '测试'
        self.folder.mkdir()
        write_document(self.folder / '稿.docx', [Block('title', '百家讲坛'),
            *[Block('p', f'易中天讲三国第{index}部分。') for index in range(1, 6)]],
            title='百家讲坛')
        for filename in ['good.jpg', 'bad.jpg']:
            Image.new('RGB', (800, 600), 'gray').save(self.folder / filename)
        self.profile = ('gpt-image-1', {'base_url': 'https://example.test', 'api_key': 'fixture'})
        p = patch.object(model_settings, 'resolve_image', return_value=self.profile[1])
        p.start(); self.addCleanup(p.stop)
        review.save_review('测试', {'good.jpg': 'approved', 'bad.jpg': 'rejected'})
        for target, name, value in [(model_settings, 'resolve', self.profile[1]),
                                    (sourcing, '_image_ai_profile', self.profile),
                                    (sourcing, 'generate_ai_image', None)]:
            mock = patch.object(target, name, return_value=value)
            mock.start(); self.addCleanup(mock.stop)
        self.finalize = patch.object(actions, '_finalize_five', return_value=[])
        self.finalize.start(); self.addCleanup(self.finalize.stop)
        self.data = dict(topic='测试', mode='generate', image='bad.jpg', count=1,
                         provider='gpt', model='gpt-image-1', query='书桌与书籍')

    def test_download_attempts_default_and_explicit_values_are_normalized(self):
        self.assertEqual(actions.validate(self.data)['download_attempts'], 2)
        for value in (1, 2):
            with self.subTest(value=value):
                self.assertEqual(actions.validate(dict(self.data, download_attempts=value))['download_attempts'], value)

    def test_run_passes_single_attempt_choice_to_validated_worker_payload(self):
        received = {}

        def capture(data, **kwargs):
            received.update(data)
            return []

        with patch.object(actions, '_run_validated', side_effect=capture):
            result = actions.run(dict(self.data, download_attempts=1), hint=lambda _: None)
        self.assertEqual(result, [])
        self.assertEqual(received['download_attempts'], 1)

    def test_validated_legacy_word_search_limits_real_source_download_attempts(self):
        query = '服务区充电排队'
        hit = Hit('今日头条', query, '服务区充电排队现场', '测试来源',
                  'https://images.test/legacy-retry.jpg', 'https://pages.test/legacy',
                  900, 600, semantic_approved=True)
        for attempts in (1, 2):
            with self.subTest(attempts=attempts):
                calls = []
                source = SimpleNamespace(name='今日头条', close=lambda: None)

                def download(_url):
                    calls.append(_url)
                    if len(calls) == 1:
                        raise TimeoutError('fixture timeout')
                    stream = io.BytesIO()
                    Image.new('RGB', (900, 600), 'teal').save(stream, format='JPEG')
                    return stream.getvalue()

                source.download = download
                data = actions.validate(dict(
                    self.data, mode='search', provider='deepseek', model='fixture-text',
                    image='', count=1, query=query, sources=['今日头条'],
                    download_attempts=attempts))
                with patch.object(sourcing, 'build_sources', return_value=([source], [])), \
                     patch.object(sourcing, 'collect_hits', return_value=([hit], [])), \
                     patch.object(sourcing, 'model_analysis', return_value=SimpleNamespace(
                         queries=[sourcing.Query(query, -1, '', '自定义')], anchors=[])), \
                     patch.object(sourcing, 'model_filter_hits', return_value=[hit]), \
                     patch.object(sourcing, 'rejection_reason', return_value=''):
                    stage = self.root / f'stage-{attempts}'
                    stage.mkdir()
                    actions._network_round(data, review.source_document(self.folder),
                                           self.folder, stage, {}, lambda _message: None)
                self.assertEqual(len(calls), attempts)

    def test_invalid_download_attempts_are_rejected_before_action_validation(self):
        with patch.object(actions.review, 'ensure_editable') as ensure_editable:
            for value in (0, 3, True, 1.5, '1', None):
                with self.subTest(value=value):
                    with self.assertRaisesRegex(ValueError, '只能是 1 或 2'):
                        actions.validate(dict(self.data, download_attempts=value))
        ensure_editable.assert_not_called()

    def test_generator_adds_pending_candidate_without_touching_approved_or_old_draft(self):
        old = {p.name: p.read_bytes() for p in self.folder.iterdir() if p.suffix == '.jpg'}
        def generate(prompt, folder, *, stem, **kwargs):
            self.assertEqual(kwargs['profile'], self.profile)
            path = folder / (stem + '.jpg')
            Image.new('RGB', (900, 600), 'red').save(path)
            return path, 900, 600, self.profile[0]
        with patch.object(sourcing, 'generate_ai_image', side_effect=generate):
            rows = actions.run(self.data, hint=lambda _: None)
        states = review.load_review(self.folder)['states']
        self.assertEqual(states['good.jpg'], 'approved')
        self.assertEqual(states['bad.jpg'], 'rejected')
        self.assertEqual(states[rows[0]['原始文件名']], 'pending')
        self.assertEqual(review.load_selection(self.folder), ['good.jpg'])
        for name, raw in old.items():
            self.assertEqual((self.folder / name).read_bytes(), raw)
        self.assertFalse(list(config.FORMATTED.iterdir()))
        self.assertEqual(rows[0]['平台'], 'AI生成')

    def test_provider_failure_does_not_change_existing_review_or_files(self):
        before = {p.name: p.read_bytes() for p in self.folder.iterdir()}
        with patch.object(sourcing, 'generate_ai_image', return_value=None):
            with self.assertRaisesRegex(ValueError, '未取得'):
                actions.run(self.data, hint=lambda _: None)
        self.assertEqual({p.name: p.read_bytes() for p in self.folder.iterdir()}, before)

    def _seed_previous_round(self):
        names = ['approved.jpg', 'rejected.jpg', 'pending.jpg']
        for name, color in zip(names, ['green', 'red', 'blue']):
            Image.new('RGB', (800, 600), color).save(self.folder / name)
        review.save_review('测试', {'approved.jpg':'approved', 'rejected.jpg':'rejected'})
        review_path=self.folder/review.REVIEW_FILE
        review_data=json.loads(review_path.read_text(encoding='utf-8'))
        review_data['states']['pending.jpg']='pending'
        review_path.write_text(json.dumps(review_data),encoding='utf-8')
        review.save_selection('测试', ['approved.jpg'])
        (self.folder / sourcing.MANIFEST_FILE).write_text(json.dumps({'配图':[
            {'原始文件名':name,'图片链接':f'https://img.test/{name}'} for name in names
        ]}), encoding='utf-8')
        (self.folder / actions.TOPIC_SEARCH_HISTORY_FILE).write_text(json.dumps({
            'schema_version':1,'topic_id':'TP-test','next_pages':{},'pages':{},
            'permanent_urls':{},'rounds':[]}), encoding='utf-8')

    def test_new_search_round_preserves_approved_rejected_and_retires_only_pending(self):
        self._seed_previous_round()
        current={'states':{'approved.jpg':'approved','rejected.jpg':'rejected','pending.jpg':'pending'},
                 'cover':'approved.jpg','revision':4,'needs_layout':True}
        with patch.object(actions.topic_packages, 'load', return_value={'topic_id':'TP-test'}), \
             patch.object(review, 'load_review', return_value=current):
            actions._discard_unkept_previous_candidates('测试', self.folder, lambda _:None)
        self.assertTrue((self.folder/'approved.jpg').exists())
        self.assertTrue((self.folder/'rejected.jpg').exists())
        self.assertFalse((self.folder/'pending.jpg').exists())
        states=json.loads((self.folder/review.REVIEW_FILE).read_text(encoding='utf-8'))['states']
        self.assertEqual(states, {'approved.jpg':'approved','rejected.jpg':'rejected'})
        history=json.loads((self.folder/actions.TOPIC_SEARCH_HISTORY_FILE).read_text(encoding='utf-8'))
        self.assertIn('https://img.test/pending.jpg',history['permanent_urls'])

    def test_new_search_round_save_failure_rolls_back_images_and_ledgers(self):
        self._seed_previous_round()
        before={path.relative_to(self.folder).as_posix():path.read_bytes()
                for path in self.folder.rglob('*') if path.is_file()}
        original=review._write_json
        failed=False
        def fail_review_once(path, value):
            nonlocal failed
            if Path(path).name==review.REVIEW_FILE and not failed:
                failed=True
                raise OSError('fixture ledger write failure')
            return original(path,value)
        current={'states':{'approved.jpg':'approved','rejected.jpg':'rejected','pending.jpg':'pending'},
                 'cover':'approved.jpg','revision':4,'needs_layout':True}
        with patch.object(actions.topic_packages, 'load', return_value={'topic_id':'TP-test'}), \
             patch.object(review, 'load_review', return_value=current), \
             patch.object(review, '_write_json', side_effect=fail_review_once):
            with self.assertRaisesRegex(OSError,'fixture ledger write failure'):
                actions._discard_unkept_previous_candidates('测试', self.folder, lambda _:None)
        after={path.relative_to(self.folder).as_posix():path.read_bytes()
               for path in self.folder.rglob('*') if path.is_file()}
        self.assertEqual(after,before)

    def test_duplicate_url_normalization_and_pixel_hash_match(self):
        self.assertEqual(actions._normalized_image_url('HTTPS://Images.Example:443/a.jpg?signature=x#view'),
                         actions._normalized_image_url('https://images.example/a.jpg?signature=y'))
        first=self.folder/'pixel-one.png';second=self.folder/'pixel-two.png'
        Image.new('RGB',(800,600),'purple').save(first)
        Image.new('RGB',(800,600),'purple').save(second)
        digest_one=sourcing._dhash(first.read_bytes());digest_two=sourcing._dhash(second.read_bytes())
        self.assertTrue(sourcing._similar(digest_one,digest_two),
                        'Different URLs with the same pixels are duplicate candidates')

    def test_approved_image_can_be_replaced_atomically(self):
        validated = actions.validate(dict(self.data, image='good.jpg'))
        self.assertEqual(validated['image'], 'good.jpg')

    def test_failed_approved_replacement_preserves_old_decision_and_bytes(self):
        before = {path.name: path.read_bytes() for path in self.folder.iterdir()}
        with patch.object(sourcing, 'generate_ai_image', return_value=None):
            with self.assertRaisesRegex(ValueError, '未取得'):
                actions.run(dict(self.data, image='good.jpg'), hint=lambda _: None)
        self.assertEqual({path.name: path.read_bytes() for path in self.folder.iterdir()}, before)

    def test_successful_approved_replacement_commits_old_rejected_and_new_pending_together(self):
        def generate(prompt, folder, *, stem, **kwargs):
            path = folder / (stem + '.jpg')
            Image.new('RGB', (900, 600), 'green').save(path)
            return path, 900, 600, self.profile[0]
        with patch.object(sourcing, 'generate_ai_image', side_effect=generate):
            rows = actions.run(dict(self.data, image='good.jpg'), hint=lambda _: None)
        states = review.load_review(self.folder)['states']
        self.assertEqual(states['good.jpg'], 'rejected')
        self.assertEqual(states[rows[0]['原始文件名']], 'pending')

    def test_deepseek_cannot_be_used_as_generator(self):
        with self.assertRaisesRegex(ValueError, '图片模型'):
            actions.validate(dict(self.data, provider='deepseek', model='deepseek-flash'))

    def test_doubao_is_allowed_for_search_but_not_generation(self):
        validated = actions.validate(dict(self.data, mode='search', provider='doubao',
                                          model='doubao-seed-1', image='bad.jpg'))
        self.assertEqual((validated['provider'], validated['model']), ('doubao', 'doubao-seed-1'))

    def test_non_gpt_image_generation_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '只使用 GPT'):
            actions.validate(dict(self.data, provider='doubao', model='seedream-test'))

    def test_network_rejects_old_pixels_and_never_calls_generator(self):
        data = dict(self.data, mode='search', provider='deepseek', model='deepseek-flash',
                    image='', sources=['今日头条'])
        hit = Hit('今日头条', '百家讲坛', '百家讲坛', '', 'https://image/new-url.jpg', '', 800, 600)
        source = type('Source', (), {'name': '今日头条', 'close': lambda self: None})()
        with patch.object(sourcing, 'build_sources', return_value=([source], [])), \
             patch.object(sourcing, 'collect_hits', return_value=([hit], [])), \
             patch.object(sourcing, 'rejection_reason', return_value=''), \
             patch.object(sourcing, '_Downloader', return_value=lambda _: (self.folder/'bad.jpg').read_bytes()), \
             patch.object(sourcing, 'generate_ai_image', return_value=None) as generate, \
             patch.object(sourcing, 'model_analysis', return_value=sourcing.Analysis([sourcing.Query('百家讲坛')], ['百家讲坛'], [])), \
             patch.object(sourcing, 'model_filter_hits', return_value=[hit]):
            with self.assertRaisesRegex(ValueError, '未取得'):
                actions.run(data, hint=lambda _: None)
        generate.assert_not_called()

    def test_explicit_network_search_never_generates_when_provider_fails(self):
        data = dict(self.data, mode='search', provider='deepseek', model='deepseek-flash',
                    image='', sources=['今日头条'])
        logs = []
        with patch.object(actions, '_network', side_effect=OSError('fixture search failure')), \
             patch.object(sourcing, '_image_ai_profile') as image_profile, \
             patch.object(sourcing, 'generate_ai_image') as generate:
            with self.assertRaisesRegex(ValueError, '仅网络搜图，未调用 AI 配图'):
                actions.run(data, hint=logs.append)
        image_profile.assert_not_called()
        generate.assert_not_called()
        self.assertTrue(any('不会调用 AI 配图' in line for line in logs))

    def test_replacement_search_falls_back_to_gpt_and_keeps_candidate_pending(self):
        data = dict(self.data, mode='search', provider='deepseek', model='deepseek-flash',
                    sources=['全网'])
        def generate(prompt, folder, *, stem, **kwargs):
            path = folder / (stem + '.jpg')
            Image.new('RGB', (900, 600), 'blue').save(path)
            return path, 900, 600, self.profile[0]
        with patch.object(actions, '_network', return_value=[]), \
             patch.object(sourcing, 'generate_ai_image', side_effect=generate):
            rows = actions.run(data, hint=lambda _: None)
        states = review.load_review(self.folder)['states']
        self.assertEqual(states['bad.jpg'], 'rejected')
        self.assertEqual(states[rows[0]['原始文件名']], 'pending')
        self.assertEqual(rows[0]['平台'], 'AI生成')

    def test_all_rejected_allows_fresh_network_candidates(self):
        review.save_review('测试', {'good.jpg': 'rejected'})
        data = dict(self.data, mode='search', provider='deepseek', model='deepseek-flash', sources=['今日头条'])
        self.assertEqual(actions.validate(data)['provider'], 'deepseek')

    def test_network_results_use_one_picture_per_subject(self):
        document = review.source_document(self.folder)
        data = dict(self.data, mode='search', provider='deepseek', model='deepseek-test',
                    count=4, query='', sources=['今日头条'])
        hits = [Hit('今日头条', '同一颁奖活动', f'报道{i}', '', f'https://image/{i}', f'https://page/{i}')
                for i in range(4)]
        # A rejected picture may be replaced by a new picture for that same
        # subject; rejecting pixels is not a permanent ban on the search term.
        (self.folder / sourcing.MANIFEST_FILE).write_text(json.dumps({'配图': [
            {'原始文件名': 'bad.jpg', '搜索词': '同一颁奖活动'}]}), encoding='utf-8')
        source = type('Source', (), {'name': '今日头条', 'close': lambda self: None})()
        stage = self.root / 'stage'; stage.mkdir()
        with patch.object(sourcing, 'model_analysis', return_value=sourcing.analyze(document)), \
             patch.object(sourcing, 'build_sources', return_value=([source], [])), \
             patch.object(sourcing, 'collect_hits', return_value=(hits, [])), \
             patch.object(sourcing, 'model_filter_hits', return_value=hits), \
             patch.object(sourcing, 'rejection_reason', return_value=''), \
             patch.object(sourcing, '_Downloader', return_value=lambda _: (self.folder/'bad.jpg').read_bytes()), \
             patch.object(sourcing, '_similar', return_value=False):
            rows = actions._network(data, document, self.folder, stage, {}, lambda _: None)
        self.assertEqual(len(rows), 1)

    def test_long_article_network_search_uses_target_sized_query_budget(self):
        data = dict(self.data, mode='auto', provider='deepseek', model='deepseek-test',
                    image='', count=10, target_count=20, sources=['全网'], query='')
        analysis = sourcing.Analysis(
            [sourcing.Query(f'长文搜索词{index}') for index in range(20)], ['百家讲坛'], [])
        source = type('Source', (), {'name': '全网', 'close': lambda self: None})()
        stage = self.root / 'long-stage'; stage.mkdir()
        with patch.object(sourcing, 'analyze', return_value=analysis) as rules, \
             patch.object(sourcing, 'model_analysis', return_value=analysis) as model, \
             patch.object(sourcing, 'build_sources', return_value=([source], [])), \
             patch.object(sourcing, 'collect_hits', return_value=([], [])) as collect:
            rows = actions._network(data, review.source_document(self.folder), self.folder,
                                    stage, {}, lambda _: None)
        self.assertEqual(rows, [])
        rules.assert_called_once_with(unittest.mock.ANY, limit=20)
        model.assert_called_once_with(unittest.mock.ANY, limit=20)
        self.assertEqual(len(collect.call_args.args[1]), 20)

    def test_model_filter_error_or_empty_keeps_web_hits_for_rule_scoring(self):
        data = dict(self.data, mode='search', provider='deepseek', model='deepseek-test',
                    image='', count=1, target_count=5, sources=['全网'])
        hit = Hit('全网图片', '百家讲坛', '百家讲坛 易中天 节目现场', 'example.test',
                  'https://image/new.jpg', 'https://page/new', 1000, 700)
        source = type('Source', (), {'name': '全网', 'close': lambda self: None})()
        analysis = sourcing.Analysis([sourcing.Query('百家讲坛')], ['百家讲坛'], [])
        for index, outcome in enumerate((ValueError('fixture filter failure'), [])):
            with self.subTest(outcome=type(outcome).__name__):
                stage = self.root / f'fallback-stage-{index}'; stage.mkdir()
                model_filter = patch.object(
                    sourcing, 'model_filter_hits', side_effect=outcome
                    if isinstance(outcome, Exception) else None,
                    return_value=outcome if not isinstance(outcome, Exception) else None)
                logs = []
                with patch.object(sourcing, 'analyze', return_value=analysis), \
                     patch.object(sourcing, 'model_analysis', return_value=analysis), \
                     patch.object(sourcing, 'build_sources', return_value=([source], [])), \
                     patch.object(sourcing, 'collect_hits', return_value=([hit], [])), \
                     model_filter, \
                     patch.object(sourcing, 'rejection_reason', return_value=''), \
                     patch.object(sourcing, '_Downloader', return_value=lambda _: (self.folder/'bad.jpg').read_bytes()), \
                     patch.object(sourcing, '_similar', return_value=False):
                    rows = actions._network(data, review.source_document(self.folder), self.folder,
                                            stage, {}, logs.append)
                self.assertEqual(len(rows),1)
                self.assertTrue(any('规则打分' in line for line in logs))

    def test_auto_count_uses_only_missing_slots_and_preserves_rejections(self):
        data = actions.validate(dict(self.data, mode='auto', provider='deepseek',
                                     model='deepseek-flash', image='', count=5))
        self.assertEqual(data['count'], sourcing.candidate_target(data['target_count']) - 1)

    def test_auto_payload_accepts_non_five_article_target(self):
        (self.folder / sourcing.MANIFEST_FILE).write_text(
            json.dumps({'建议配图数': 7, '配图': []}), encoding='utf-8')
        data = actions.validate(dict(self.data, mode='auto', provider='deepseek',
                                     model='deepseek-flash', image='', count=7))
        self.assertEqual(data['target_count'], 7)
        self.assertEqual(data['count'], sourcing.candidate_target(7) - 1)

    def test_explicit_finalize_uses_exactly_five_approved_and_keeps_rejected_out(self):
        self.finalize.stop()
        for index in range(sourcing.candidate_target(5) - 1):
            Image.new('RGB', (900, 600), (index * 20, 100, 50)).save(self.folder / f'new{index}.jpg')
        review.save_review('测试', {f'new{index}.jpg': 'approved' for index in range(4)})
        with patch.object(review, 'reformat') as render:
            actions._finalize_five('测试', hint=lambda _: None)
        render.assert_called_once_with('测试')
        selected = review.load_selection(self.folder)
        self.assertEqual(len(selected), 5)
        self.assertIn('good.jpg', selected)
        self.assertNotIn('bad.jpg', selected)

    def test_complete_auto_payload_survives_console_and_worker_validation(self):
        for index in range(sourcing.candidate_target(5) - 1):
            Image.new('RGB', (900, 600), 'white').save(self.folder / f'existing{index}.jpg')
        data = dict(self.data, mode='auto', provider='deepseek', model='deepseek-flash',
                    image='', count=5)
        validated = actions.validate(data)
        self.assertEqual(validated['count'], 0)
        self.assertEqual(actions.validate(validated)['count'], 0)

    def test_auto_search_fills_only_gap_with_gpt_and_waits_for_review(self):
        captured = []
        def network(data, document, folder, stage, context, hint):
            self.assertEqual(data['count'], sourcing.candidate_target(5) - 1)
            result = []
            for index in range(2):
                path = stage / f'web{index}.jpg'
                Image.new('RGB', (900, 600), (10, index * 30, 200)).save(path)
                result.append({'原始文件名': path.name, '平台': '今日头条'})
            return result
        def generate(prompt, folder, *, stem, **kwargs):
            captured.append(kwargs['profile'])
            path = folder / (stem + '.jpg')
            Image.new('RGB', (900, 600), 'blue').save(path)
            return path, 900, 600, 'gpt-image-1'
        data = dict(self.data, mode='auto', provider='deepseek', model='deepseek-flash',
                    image='', count=5)
        with patch.object(actions, '_network', side_effect=network), \
             patch.object(sourcing, 'generate_ai_image', side_effect=generate), \
             patch.object(actions, '_finalize_five') as finalize:
            rows = actions.run(data, hint=lambda _: None)
        self.assertEqual(len(rows), sourcing.candidate_target(5) - 1)
        self.assertEqual(len(captured), sourcing.candidate_target(5) - 3)
        finalize.assert_not_called()
        states = review.load_review(self.folder)['states']
        self.assertTrue(all(states[row['原始文件名']] == 'pending' for row in rows))

    def test_commit_failure_restores_files_and_all_metadata(self):
        for failure in ['second_move', 'manifest', 'review']:
            with self.subTest(failure=failure):
                before = {p.name: p.read_bytes() for p in self.folder.iterdir()}
                def generate(prompt, folder, *, stem, **kwargs):
                    path = folder / (stem + '.jpg')
                    Image.new('RGB', (900, 600), 'red').save(path)
                    return path, 900, 600, self.profile[0]
                original_rename, original_replace = Path.rename, Path.replace
                original_save = review.save_candidate_review
                moves = []
                def rename(path, target):
                    moves.append(path)
                    if failure == 'second_move' and len(moves) == 2:
                        raise OSError('fixture commit failure')
                    return original_rename(path, target)
                def replace(path, target):
                    if failure == 'manifest' and path.name == 'manifest.json':
                        raise OSError('fixture commit failure')
                    return original_replace(path, target)
                def save(*args, **kwargs):
                    original_save(*args, **kwargs)
                    if failure == 'review':
                        raise OSError('fixture commit failure')
                with patch.object(sourcing, 'generate_ai_image', side_effect=generate), \
                     patch.object(Path, 'rename', rename), patch.object(Path, 'replace', replace), \
                     patch.object(review, 'save_candidate_review', side_effect=save):
                    with self.assertRaisesRegex(OSError, 'fixture commit failure'):
                        actions.run(dict(self.data, image='', count=2), hint=lambda _: None)
                self.assertEqual({p.name: p.read_bytes() for p in self.folder.iterdir()}, before)

    def test_partial_generation_keeps_candidate_and_reports_shortfall(self):
        calls = []
        def generate(prompt, folder, *, stem, **kwargs):
            calls.append(stem)
            if len(calls) > 1:
                return None
            path = folder / (stem + '.jpg')
            Image.new('RGB', (900, 600), 'red').save(path)
            return path, 900, 600, self.profile[0]
        logs = []
        with patch.object(sourcing, 'generate_ai_image', side_effect=generate):
            with self.assertRaisesRegex(ValueError, '还缺 2 张'):
                actions.run(dict(self.data, image='', count=3), hint=logs.append)
        rows = json.loads((self.folder / sourcing.MANIFEST_FILE).read_text(encoding='utf-8'))['配图'][-1:]
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(review.load_review(self.folder)['states'][rows[0]['原始文件名']], 'pending')


if __name__ == '__main__':
    unittest.main()
