import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from article_hub import ai, config, model_settings


class ThinkingSwitchTests(unittest.TestCase):
    def request_for(self, model, thinking=False, wire='chat'):
        profile = {'base_url':'https://fixture.example/v1', 'api_key':'fixture',
                   '模型':model, 'wire_api':wire}
        body = {'choices':[{'message':{'content':'{"keep":[0]}'}}]}
        if wire == 'responses':
            body = {'status':'completed', 'output':[{'type':'message',
                'content':[{'type':'output_text', 'text':'{"keep":[0]}'}]}]}
        with ai.using_profile(profile), patch.object(ai.urllib.request, 'urlopen',
                return_value=io.BytesIO(json.dumps(body).encode())) as call:
            self.assertEqual(ai.chat([], max_tokens=4000, thinking=thinking), '{"keep":[0]}')
        return json.loads(call.call_args.args[0].data)

    def test_short_deepseek_search_turns_off_reasoning(self):
        for model in ('deepseek-flash', 'deepseek-v4-flash-ga-260731',
                      'deepseek-chat', 'vendor/DeepSeek-v4-pro'):
            with self.subTest(model=model):
                self.assertEqual(self.request_for(model)['thinking'], {'type':'disabled'})

    def test_explicit_thinking_and_existing_doubao_mode(self):
        self.assertEqual(self.request_for('deepseek-flash', True)['thinking'], {'type':'enabled'})
        self.assertEqual(self.request_for('doubao-seed-2-1-turbo-260628')['thinking'], {'type':'disabled'})
        self.assertNotIn('thinking', self.request_for('deepseek-flash', None))

    def test_unrelated_models_do_not_receive_deepseek_parameter(self):
        self.assertNotIn('thinking', self.request_for('gpt-test'))
        self.assertNotIn('thinking', self.request_for('gpt-test', wire='responses'))
        self.assertEqual(self.request_for('deepseek-flash', wire='responses')['reasoning'], {'effort':'none'})


class ImageModelCapabilityTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        for mocked in [patch.object(config, 'DATA', Path(temp.name)),
                patch.object(ai, 'legacy_settings', return_value={'base_url':'https://gpt.example/v1',
                    'api_key':'gpt-fixture-secret', '模型':'gpt-text', 'wire_api':'responses'})]:
            mocked.start()
            self.addCleanup(mocked.stop)
        for provider in ('doubao', 'deepseek'):
            row = model_settings.providers()[provider]
            model_settings.save_provider({'provider':provider, 'base_url':row['base_url'],
                'wire_api':'chat', 'api_key':provider+'-fixture-secret'})

    def discover(self, provider, models):
        response = io.BytesIO(json.dumps({'data':[{'id':model} for model in models]}).encode())
        with patch.object(model_settings.urllib.request, 'urlopen', return_value=response):
            return model_settings.discover(provider)

    def test_discovery_separates_search_models_from_generation(self):
        self.discover('doubao', ['doubao-seed-2-1-turbo-260628', 'deepseek-v4-flash-ga-260731',
            'doubao-seedream-5-0-pro-260628', 'text-embedding-3-small', 'audio-model'])
        self.discover('gpt', ['gpt-4o', 'gpt-image-1', 'dall-e-3', 'custom-image-generation-v1',
            'text-embedding-3-small', 'gpt-4o-audio-preview', 'image-caption-model'])
        rows = {row['id']:row for row in model_settings.public_config()['providers']}
        self.assertEqual(rows['doubao']['image_models'], ['doubao-seedream-5-0-pro-260628'])
        self.assertEqual(rows['doubao']['models'], ['deepseek-v4-flash-ga-260731', 'doubao-seed-2-1-turbo-260628'])
        self.assertEqual(rows['gpt']['models'], ['gpt-4o'])
        self.assertEqual(rows['gpt']['image_models'], ['custom-image-generation-v1', 'dall-e-3', 'gpt-image-1'])
        self.assertEqual(rows['gpt']['model'], 'gpt-4o')
        self.assertNotIn('fixture-secret', json.dumps(model_settings.public_config()))

    def test_image_only_service_has_no_default_text_model(self):
        self.discover('gpt', ['gpt-image-1'])
        row = next(row for row in model_settings.public_config()['providers'] if row['id']=='gpt')
        self.assertEqual(row['model'], '')
        self.assertEqual(row['models'], [])
        self.assertEqual(row['image_models'], ['gpt-image-1'])

    def test_rediscovery_drops_removed_generation_models(self):
        self.discover('gpt', ['gpt-image-1', 'gpt-text'])
        self.discover('gpt', ['gpt-text'])
        row = next(row for row in model_settings.public_config()['providers'] if row['id']=='gpt')
        self.assertEqual(row['image_models'], [])

    def test_separate_generation_choice_persists_without_changing_search(self):
        model_settings.save_choice('images', 'deepseek', 'deepseek-flash')
        model_settings.save_choice('image_generation', 'gpt', 'gpt-image-2.5-flare')
        choices = model_settings.public_config()['choices']
        self.assertEqual(choices['images'], {'provider':'deepseek','model':'deepseek-flash'})
        self.assertEqual(choices['image_generation'], {'provider':'gpt','model':'gpt-image-2.5-flare'})

    def test_image_workflow_choices_reject_disallowed_providers(self):
        for provider in ('doubao', 'rules'):
            with self.assertRaisesRegex(ValueError, 'GPT 或 DeepSeek'):
                model_settings.save_choice('images', provider, 'text-model')
        with self.assertRaisesRegex(ValueError, '只使用 GPT'):
            model_settings.save_choice('image_generation', 'doubao', 'doubao-seedream-5')

    def test_old_image_choices_migrate_without_deleting_provider_credentials(self):
        data = model_settings._load()
        data['choices'] = {'images': {'provider': 'rules', 'model': ''},
                           'image_generation': {'provider': 'doubao', 'model': 'seedream-5'}}
        model_settings._save(data)
        public = model_settings.public_config()
        self.assertIn(public['choices']['images']['provider'], {'deepseek', 'gpt'})
        self.assertNotIn('image_generation', public['choices'])
        self.assertEqual(model_settings.providers()['doubao']['api_key'], 'doubao-fixture-secret')

    def test_text_models_cannot_be_sent_to_generation_api(self):
        for provider, model in [('deepseek','deepseek-flash'), ('doubao','deepseek-v4-flash-ga-260731'),
                                ('gpt','gpt-4o'), ('doubao','ep-unknown'), ('deepseek','gpt-image-1')]:
            with self.subTest(provider=provider, model=model), self.assertRaisesRegex(ValueError, '图片生成模型'):
                model_settings.resolve_image(provider, model)
        self.assertEqual(model_settings.resolve_image('gpt', 'gpt-image-1')['模型'], 'gpt-image-1')
        with self.assertRaisesRegex(ValueError, '文本模型'):
            model_settings.save_choice('images', 'gpt', 'gpt-image-1')


if __name__ == '__main__':
    unittest.main()
