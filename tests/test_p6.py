# -*- coding: utf-8 -*-
"""P6 联调与验收：静态守护、快速连写、强杀恢复、损坏 JSON、双击启动脚本。"""
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BASE_DIR, ServerProcess, initial_data, snapshot_data  # noqa: E402

STATIC = os.path.join(BASE_DIR, "static")
JS_DIR = os.path.join(STATIC, "js")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


class P6StaticGuardTest(unittest.TestCase):
    """8.2 静态守护 + 启动脚本 + 前端无外部依赖（AC-1/5 的静态部分）。"""

    def test_new_date_only_in_utils(self):
        offenders = []
        for root, _dirs, files in os.walk(JS_DIR):
            for name in files:
                if not name.endswith(".js"):
                    continue
                path = os.path.join(root, name)
                if "new Date(" not in read(path):
                    continue
                if os.path.relpath(path, JS_DIR).replace(os.sep, "/") != "utils.js":
                    offenders.append(path)
        self.assertEqual(offenders, [], "new Date( 只允许出现在 utils.js：%s" % offenders)
        self.assertIn("export function today(settings)", read(os.path.join(JS_DIR, "utils.js")))

    def test_frontend_has_no_online_dependency(self):
        html = read(os.path.join(STATIC, "index.html"))
        self.assertNotIn("http://", html)
        self.assertNotIn("https://", html)
        for path in (os.path.join(STATIC, "css"), JS_DIR):
            for root, _dirs, files in os.walk(path):
                for name in files:
                    if not name.endswith((".css", ".js")):
                        continue
                    text = read(os.path.join(root, name))
                    self.assertNotIn("@import", text)
                    if name.endswith(".css"):
                        self.assertNotIn("url(http", text)
        # JS 中仅允许内联 SVG 命名空间与输入框占位文案
        fitness = read(os.path.join(JS_DIR, "views", "fitness.js"))
        stripped = fitness.replace("'http://www.w3.org/2000/svg'", "")
        self.assertNotIn("http://", stripped)
        self.assertNotIn("https://", stripped)
        selfmedia = read(os.path.join(JS_DIR, "views", "selfmedia.js"))
        stripped2 = selfmedia.replace("'https://…'", "")
        self.assertNotIn("http://", stripped2)
        self.assertNotIn("https://", stripped2)

    def test_double_click_launcher(self):
        bat = read(os.path.join(BASE_DIR, "启动.bat"))
        self.assertIn("chcp 65001", bat)
        self.assertIn("cd /d \"%~dp0\"", bat)
        self.assertIn("python server.py", bat)
        self.assertIn("pause", bat)
        server = read(os.path.join(BASE_DIR, "server.py"))
        self.assertIn("webbrowser.open(url)", server)
        self.assertIn("threading.Timer(0.8", server)
        self.assertIn('"--no-browser"', server)
        self.assertIn("APP_URL=%s", server)
        self.assertIn("def handle_error(self, request, client_address):", server)
        self.assertIn("ConnectionResetError", server)

    def test_static_contains_all_nine_views(self):
        views = ["home", "today", "selfmedia", "dev", "consult", "fitness", "diet", "game", "settings"]
        for name in views:
            self.assertTrue(os.path.isfile(os.path.join(JS_DIR, "views", name + ".js")), name)


class P6RobustnessTest(unittest.TestCase):
    """T6-3b 强杀、T6-3c 快速连写、T6-3a 损坏 JSON。"""

    def setUp(self):
        self.temp_root = tempfile.mkdtemp(prefix="lifeapp-p6-")
        self.server = None

    def tearDown(self):
        if self.server:
            self.server.stop()
        shutil.rmtree(self.temp_root, ignore_errors=True)

    def test_rapid_twenty_writes_stay_consistent(self):
        self.server = ServerProcess(temp_root=self.temp_root)
        self.server.start()
        data, updated = snapshot_data(self.server)
        for index in range(20):
            data["memos"].append({
                "id": "memo-rapid-%d" % index,
                "text": "快速写入 %d" % index,
                "convertedToTodo": False,
                "todoId": None,
                "createdAt": "2026-11-01T09:00:00",
                "updatedAt": "2026-11-01T09:00:00",
            })
            status, payload = self.server.post_data(data, base=updated)
            self.assertEqual(status, 200, payload)
            updated = payload["updatedAt"]

        on_disk = self.server.read_file_json()
        current, _ = snapshot_data(self.server)
        self.assertEqual(len(on_disk["memos"]), 20)
        self.assertEqual(on_disk, current)
        self.assertEqual([m["text"] for m in on_disk["memos"]][-1], "快速写入 19")

    def test_force_kill_during_writes_keeps_valid_json(self):
        self.server = ServerProcess(temp_root=self.temp_root)
        self.server.start()
        data, updated = snapshot_data(self.server)
        data["memos"].append({
            "id": "memo-kill", "text": "强杀前写入", "convertedToTodo": False,
            "todoId": None, "createdAt": "2026-11-01T09:00:00",
            "updatedAt": "2026-11-01T09:00:00",
        })
        status, payload = self.server.post_data(data, base=updated)
        self.assertEqual(status, 200, payload)
        updated = payload["updatedAt"]

        def writer():
            text = "强杀测试" + ("x" * 20000)
            for index in range(20):
                data["memos"][0]["text"] = text + str(index)
                try:
                    _status, _payload = self.server.post_data(data, base=updated)
                    if _status == 200:
                        updated = _payload["updatedAt"]
                except Exception:
                    break

        thread = threading.Thread(target=writer, daemon=True)
        thread.start()
        time.sleep(0.12)
        self.server.proc.kill()
        thread.join(timeout=5)

        raw = self.server.read_file_bytes()
        saved = json.loads(raw.decode("utf-8"))
        self.assertEqual(saved["version"], 1)
        self.assertIn("memos", saved)
        self.assertTrue(saved["memos"])

        restarted = ServerProcess(data_dir=self.server.data_dir, temp_root=self.temp_root)
        restarted.start()
        current, _ = snapshot_data(restarted)
        self.assertEqual(current["version"], 1)
        self.assertGreaterEqual(len(current["memos"]), 1)
        restarted.stop()

    def test_corrupt_json_is_preserved_and_rejected(self):
        data_dir = os.path.join(self.temp_root, "data")
        os.makedirs(data_dir, exist_ok=True)
        broken = os.path.join(data_dir, "app-data.json")
        with open(broken, "wb") as f:
            f.write(b'{"version": 1, "memos": [')
        with open(broken, "rb") as f:
            original = f.read()
        self.server = ServerProcess(data_dir=data_dir, temp_root=self.temp_root)
        self.server.start()
        status, payload = self.server.get_data()
        self.assertEqual(status, 500, payload)
        self.assertEqual(payload["error"]["code"], "DATA_CORRUPT")
        status, payload = self.server.post_data(initial_data(), base=None)
        self.assertEqual(status, 500, payload)
        self.assertEqual(payload["error"]["code"], "DATA_CORRUPT")
        self.server.stop()
        self.server = None
        with open(broken, "rb") as f:
            self.assertEqual(f.read(), original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
