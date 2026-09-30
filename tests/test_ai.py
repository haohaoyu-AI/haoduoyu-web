import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from article_hub import ai, topics


class TrackingResponse(io.BytesIO):
    def __init__(self, body, *, headers=None, read_error=None):
        super().__init__(body)
        self.headers = headers or {}
        self.read_error = read_error
        self.bytes_read = 0
        self.read_sizes = []
        self.was_closed = False

    def read(self, size=-1):
        self.read_sizes.append(size)
        if self.read_error is not None:
            raise self.read_error
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk

    def close(self):
        self.was_closed = True
        super().close()


class AiTests(unittest.TestCase):
    def test_selected_provider_and_protocol(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'config.toml'
            path.write_text('model="my-model"\nmodel_provider="chosen"\n[model_providers.other]\nbase_url="https://wrong.example"\n[model_providers.chosen]\nbase_url="https://chosen.example"\nwire_api="responses"\nexperimental_bearer_token="fixture"\n', encoding='utf-8')
            with patch.object(ai, 'CODEX_CONFIG', path):
                result = ai._from_codex_config()
        self.assertEqual(result['base_url'], 'https://chosen.example')
        self.assertEqual(result['wire_api'], 'responses')

    def call(self, wire, response):
        settings = {'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':wire}
        with patch.object(ai, 'settings', return_value=settings), patch.object(ai.urllib.request, 'urlopen', return_value=io.BytesIO(response)) as mocked:
            result = ai.chat([{'role':'user','content':'hello'}])
        return result, mocked.call_args.args[0]

    def test_response_limit_defaults_to_eight_mib(self):
        self.assertEqual(ai.MAX_RESPONSE_BYTES, 8 * 1024 * 1024)

    def test_response_exactly_at_limit_is_accepted_and_content_length_is_ignored(self):
        limit = 256
        prefix = b'{"choices":[{"message":{"content":"'
        suffix = b'"}}]}'
        body = prefix + b'x' * (limit - len(prefix) - len(suffix)) + suffix
        response = TrackingResponse(body, headers={'Content-Length': '99999999'})
        with patch.object(ai, 'settings', return_value={
                'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':'chat'}), \
             patch.object(ai, 'MAX_RESPONSE_BYTES', limit), \
             patch.object(ai.urllib.request, 'urlopen', return_value=response):
            result = ai.chat([{'role':'user','content':'hello'}])
        self.assertEqual(len(body), limit)
        self.assertEqual(result, 'x' * (limit - len(prefix) - len(suffix)))
        self.assertEqual(response.bytes_read, limit)
        self.assertTrue(response.was_closed)

    def test_oversized_response_is_rejected_after_one_probe_byte(self):
        limit = 128
        marker = b'PRIVATE-RESPONSE-BODY'
        body = b'x' * limit + marker + b'y' * 32
        for headers in ({}, {'Content-Length': '1'}):
            with self.subTest(headers=headers):
                response = TrackingResponse(body, headers=headers)
                with patch.object(ai, 'settings', return_value={
                        'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':'chat'}), \
                     patch.object(ai, 'MAX_RESPONSE_BYTES', limit), \
                     patch.object(ai.urllib.request, 'urlopen', return_value=response):
                    with self.assertRaises(ai.AiError) as caught:
                        ai.chat([{'role':'user','content':'hello'}])
                self.assertEqual(caught.exception.category, 'response_too_large')
                self.assertIn('字节上限', str(caught.exception))
                self.assertNotIn(marker.decode(), str(caught.exception))
                self.assertEqual(response.bytes_read, limit + 1)
                self.assertTrue(response.was_closed)

    def test_response_read_failure_is_sanitized_and_closed(self):
        response = TrackingResponse(b'', read_error=OSError('PRIVATE-READ-DETAIL'))
        with patch.object(ai, 'settings', return_value={
                'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':'chat'}), \
             patch.object(ai.urllib.request, 'urlopen', return_value=response):
            with self.assertRaises(ai.AiError) as caught:
                ai.chat([{'role':'user','content':'hello'}])
        self.assertEqual(caught.exception.category, 'network')
        self.assertNotIn('PRIVATE-READ-DETAIL', str(caught.exception))
        self.assertTrue(response.was_closed)

    def test_http_error_body_remains_classified_and_closed(self):
        response = TrackingResponse(b'{"error":{"message":"denied"}}')
        error = ai.urllib.error.HTTPError('https://fixture.example', 401, 'Unauthorized', {}, response)
        settings = {'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':'chat'}
        with patch.object(ai, 'settings', return_value=settings), \
             patch.object(ai.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(ai.AiError) as caught:
                ai.chat([{'role':'user','content':'hello'}])
        self.assertEqual(caught.exception.category, 'authentication')
        self.assertEqual(caught.exception.http_status, 401)
        self.assertLessEqual(response.bytes_read, ai.MAX_RESPONSE_BYTES + 1)
        self.assertTrue(response.was_closed)

    def test_oversized_http_error_body_is_limited_and_closed(self):
        limit = 96
        marker = b'PRIVATE-ERROR-BODY'
        response = TrackingResponse(b'x' * limit + marker, headers={'Content-Length':'1'})
        error = ai.urllib.error.HTTPError('https://fixture.example', 503, 'Unavailable', {}, response)
        settings = {'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':'chat'}
        with patch.object(ai, 'settings', return_value=settings), \
             patch.object(ai, 'MAX_RESPONSE_BYTES', limit), \
             patch.object(ai.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(ai.AiError) as caught:
                ai.chat([{'role':'user','content':'hello'}])
        self.assertEqual(caught.exception.category, 'response_too_large')
        self.assertEqual(caught.exception.http_status, 503)
        self.assertNotIn(marker.decode(), str(caught.exception))
        self.assertEqual(response.bytes_read, limit + 1)
        self.assertTrue(response.was_closed)

    def test_http_error_body_read_failure_is_sanitized_and_closed(self):
        response = TrackingResponse(b'', read_error=OSError('PRIVATE-ERROR-DETAIL'))
        error = ai.urllib.error.HTTPError('https://fixture.example', 502, 'Bad Gateway', {}, response)
        settings = {'base_url':'https://fixture.example', 'api_key':'fixture', '模型':'test', 'wire_api':'chat'}
        with patch.object(ai, 'settings', return_value=settings), \
             patch.object(ai.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(ai.AiError) as caught:
                ai.chat([{'role':'user','content':'hello'}])
        self.assertEqual(caught.exception.category, 'network')
        self.assertEqual(caught.exception.http_status, 502)
        self.assertNotIn('PRIVATE-ERROR-DETAIL', str(caught.exception))
        self.assertTrue(response.was_closed)

    def test_responses_protocol(self):
        result, request = self.call('responses', json.dumps({'status':'completed', 'output':[{'type':'message','content':[{'type':'output_text','text':'OK'}]}]}).encode())
        self.assertEqual(result, 'OK')
        self.assertTrue(request.full_url.endswith('/responses'))
        self.assertIn('max_output_tokens', json.loads(request.data))
        self.assertNotIn('temperature', json.loads(request.data))

    def test_chat_protocol_still_works(self):
        result, request = self.call('chat', b'{"choices":[{"message":{"content":"OK"}}]}')
        self.assertEqual(result, 'OK')
        self.assertTrue(request.full_url.endswith('/chat/completions'))

    def test_html_response_is_explained(self):
        with self.assertRaisesRegex(ai.AiError, '非 JSON'):
            self.call('responses', b'<html>website</html>')

    def test_truncated_output_not_saved_as_success(self):
        with self.assertRaisesRegex(ai.AiError, 'max_tokens'):
            self.call('responses', b'{"status":"incomplete","output":[]}')

    def test_find_uses_current_batch_not_old_cards(self):
        fresh = Path('fresh-card.md')
        def collect(**kwargs):
            kwargs['cards_out'].append(fresh)
            return 0
        with patch.object(topics, '_run', side_effect=collect), patch.object(topics, 'generate_prompts', return_value=0) as generate:
            self.assertEqual(topics.find_topics(hint=lambda _:None), 0)
        self.assertEqual(generate.call_args.kwargs['cards'], [fresh])


if __name__ == '__main__':
    unittest.main()
