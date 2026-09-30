import sqlite3
import tempfile
import time
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from article_hub import xiaohongshu as xhs


class LoginStatusTests(unittest.TestCase):
    def test_modern_and_legacy_paths_and_expiry(self):
        for relative in ('Default/Network/Cookies', 'Default/Cookies'):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                path = root / relative
                path.parent.mkdir(parents=True)
                with closing(sqlite3.connect(path)) as db:
                    db.execute('CREATE TABLE cookies (name TEXT, host_key TEXT, expires_utc INTEGER)')
                    db.execute('INSERT INTO cookies VALUES (?, ?, ?)',
                               ('web_session', '.xiaohongshu.com', int((time.time()+3600+11644473600)*1000000)))
                    db.commit()
                with patch.object(xhs, 'profile_dir', return_value=root):
                    self.assertEqual(xhs.saved_login_status()['status'], 'saved')
                    with closing(sqlite3.connect(path)) as db:
                        db.execute('UPDATE cookies SET expires_utc=1')
                        db.commit()
                    self.assertEqual(xhs.saved_login_status()['status'], 'missing')

    def test_unreadable_is_not_logged_out(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            path=root/'Default/Network/Cookies'
            path.parent.mkdir(parents=True)
            path.write_bytes(b'not a database')
            with patch.object(xhs, 'profile_dir', return_value=root):
                result=xhs.saved_login_status()
                self.assertEqual(result['status'], 'unknown')
                self.assertIsNone(result['logged_in'])

    def test_empty_profile_is_missing(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(xhs, 'profile_dir', return_value=Path(directory)):
            self.assertEqual(xhs.saved_login_status()['status'], 'missing')
