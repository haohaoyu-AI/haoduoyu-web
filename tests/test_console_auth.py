"""Local-console credential, session, expiry, and rate-limit tests."""

import json
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from article_hub import console_auth


class ConsoleAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = [1000.0]
        self.path = self.root / "data" / "console-auth.json"
        self.manager = console_auth.AuthManager(
            self.path, root=self.root, clock=lambda: self.now[0])

    def test_credentials_are_salted_hashed_and_sessions_are_memory_only(self):
        username = "本地用户"
        password = "本地测试密码-with-long-length"
        self.manager.save_credentials(username, password)
        raw = self.path.read_text(encoding="utf-8")
        self.assertNotIn(password, raw)
        record = json.loads(raw)
        self.assertEqual(record["kdf"], "pbkdf2_sha256")
        self.assertEqual(record["iterations"], console_auth.KDF_ITERATIONS)
        self.assertEqual(len(record["salt"]), 32)
        self.assertEqual(len(record["digest"]), 64)

        result = self.manager.login(username, password, "127.0.0.1")
        self.assertEqual(result.status, "ok")
        self.assertGreaterEqual(len(result.session_token), 40)
        self.assertNotEqual(result.session_token, result.session.csrf_token)
        self.assertEqual(self.manager.get_session(result.session_token), result.session)
        request = type("Request", (), {"headers": {
            "Cookie": f"{console_auth.COOKIE_NAME}={result.session_token}"}})()
        self.assertEqual(self.manager.session_for_request(request), result.session)
        self.manager.save_credentials(username, "a-second-local-password-for-tests")
        self.assertIsNone(self.manager.session_for_request(request))
        result = self.manager.login(username, "a-second-local-password-for-tests", "127.0.0.1")
        request.headers["Cookie"] = f"{console_auth.COOKIE_NAME}={result.session_token}"
        self.path.unlink()
        self.assertIsNone(self.manager.session_for_request(request))
        restarted = console_auth.AuthManager(self.path, root=self.root, clock=lambda: self.now[0])
        self.assertIsNone(restarted.get_session(result.session_token))

    def test_missing_invalid_and_out_of_root_config_fail_closed(self):
        self.assertEqual(self.manager.login("any", "any-password-long", "127.0.0.1").status,
                         "unavailable")
        self.path.parent.mkdir(parents=True)
        self.path.write_text('{broken', encoding="utf-8")
        self.assertIsNone(self.manager.load_credentials())
        self.assertEqual(self.manager.login("any", "any-password-long", "127.0.0.1").status,
                         "unavailable")

        outside = self.root.parent / "outside-auth.json"
        outside_manager = console_auth.AuthManager(outside, root=self.root,
                                                    clock=lambda: self.now[0])
        with self.assertRaises(ValueError):
            outside_manager.save_credentials("local", "another-long-password")
        self.assertFalse(outside.exists())

    def test_expired_or_logged_out_sessions_are_rejected(self):
        self.manager.save_credentials("local", "another-long-password")
        result = self.manager.login("local", "another-long-password", "127.0.0.1")
        self.now[0] += console_auth.SESSION_TTL_SECONDS + 1
        self.assertIsNone(self.manager.get_session(result.session_token))

        self.now[0] = 2000.0
        result = self.manager.login("local", "another-long-password", "127.0.0.1")
        self.manager.logout(result.session_token)
        self.assertIsNone(self.manager.get_session(result.session_token))

    def test_failed_logins_are_rate_limited_per_peer_and_expire(self):
        password = "another-long-password"
        self.manager.save_credentials("local", password)
        with patch.object(console_auth.hashlib, "pbkdf2_hmac", return_value=b"x" * 32) as derive:
            for _ in range(console_auth.FAILURE_LIMIT):
                self.assertEqual(self.manager.login("wrong", "wrong-password", "127.0.0.1").status,
                                 "invalid")
            self.assertEqual(self.manager.login("local", password, "127.0.0.1").status,
                             "rate_limited")
            self.assertEqual(derive.call_count, console_auth.FAILURE_LIMIT)

        self.now[0] += console_auth.FAILURE_WINDOW_SECONDS + 1
        self.assertEqual(self.manager.login("local", password, "127.0.0.1").status, "ok")

    def test_duplicate_session_cookies_are_rejected(self):
        cookie = console_auth.COOKIE_NAME
        self.assertEqual(console_auth.AuthManager.token_from_cookie(
            {"Cookie": f"{cookie}=token-one; {cookie}=token-two"}), None)
        self.assertEqual(console_auth.AuthManager.token_from_cookie(
            {"Cookie": f"{cookie}=token-one; other=value"}), "token-one")

    def test_interactive_setup_writes_only_a_verifier_inside_workspace(self):
        password = "setup-password-long-enough"
        with patch.object(console_auth.config, "ROOT", self.root), \
             patch.object(console_auth, "AUTH_CONFIG", self.path), \
             patch("builtins.input", return_value="local-user"), \
             patch.object(console_auth.getpass, "getpass", side_effect=[password, password]), \
             redirect_stdout(io.StringIO()):
            self.assertTrue(console_auth.configure_local_auth())
        self.assertTrue(self.path.is_file())
        self.assertNotIn(password, self.path.read_text(encoding="utf-8"))
        self.assertEqual(console_auth.AuthManager(self.path, root=self.root).load_credentials().username,
                         "local-user")


if __name__ == "__main__":
    unittest.main()
