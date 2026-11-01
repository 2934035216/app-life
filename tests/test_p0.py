# -*- coding: utf-8 -*-
"""P0 环境与骨架测试：启动、端口探测、静态托管、数据初始化。"""
import os
import shutil
import socket
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    BASE_DIR,
    ServerProcess,
    TOP_KEYS,
    free_port,
    initial_data,
)


class P0SkeletonTest(unittest.TestCase):
    def setUp(self):
        self.server = ServerProcess().start()

    def tearDown(self):
        if getattr(self, "server", None):
            self.server.cleanup()

    def test_health_endpoint(self):
        status, payload, headers = self.server.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["version"], 1)
        self.assertIn("port", payload)
        self.assertIn("dataFile", payload)

    def test_index_html_served(self):
        status, body, headers = self.server.get_raw("/")
        self.assertEqual(status, 200)
        text = body.decode("utf-8")
        self.assertIn('id="view"', text)
        self.assertIn('id="nav"', text)
        self.assertIn("/static/js/main.js", text)
        self.assertIn("text/html", headers.get("Content-Type", ""))

    def test_static_js_served_no_store(self):
        status, body, headers = self.server.get_raw("/static/js/main.js")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertIn("import", body.decode("utf-8"))

    def test_api_no_store(self):
        status, _, headers = self.server.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Cache-Control"), "no-store")

    def test_data_file_created_with_initial_structure(self):
        self.assertTrue(os.path.isfile(self.server.data_file))
        data = self.server.read_file_json()
        self.assertEqual(data["version"], 1)
        for key in TOP_KEYS:
            self.assertIn(key, data, "缺少顶层键 %s" % key)
            self.assertIsInstance(data[key], list)
        self.assertEqual(len(data["workoutTemplates"]), 7)
        self.assertEqual([t["dayOfWeek"] for t in data["workoutTemplates"]], list(range(1, 8)))
        self.assertEqual(data["settings"], initial_data()["settings"])

    def test_data_dir_auto_created(self):
        """删掉 data 目录后重启，自动重建目录与主文件。"""
        old_dir = self.server.data_dir
        self.server.stop()
        shutil.rmtree(old_dir, ignore_errors=True)
        self.assertFalse(os.path.exists(old_dir))
        new_port = free_port()
        self.server = ServerProcess(data_dir=old_dir, start_port=new_port).start()
        self.assertTrue(os.path.isdir(old_dir))
        self.assertTrue(os.path.isfile(self.server.data_file))
        data = self.server.read_file_json()
        self.assertEqual(data["version"], 1)
        self.assertEqual(len(data["workoutTemplates"]), 7)

    def test_port_occupied_switches(self):
        port = free_port()
        blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        blocker.bind(("127.0.0.1", port))
        blocker.listen(1)
        try:
            other = ServerProcess(start_port=port).start()
            try:
                self.assertEqual(other.port, port + 1)
                joined = "\n".join(other.lines)
                self.assertIn("被占用", joined)
                self.assertIn("APP_URL=http://localhost:%d" % (port + 1), joined)
            finally:
                other.cleanup()
        finally:
            blocker.close()

    def test_terminal_prints_address(self):
        joined = "\n".join(self.server.lines)
        self.assertIn("PORT=%d" % self.server.port, joined)
        self.assertIn("APP_URL=http://localhost:%d" % self.server.port, joined)
        self.assertIn("数据文件：", joined)

    def test_static_404(self):
        status, _, _ = self.server.get_raw("/static/js/nope.js")
        self.assertEqual(status, 404)
        status, payload, _ = self.server.request("GET", "/api/nope")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "NOT_FOUND")

    def test_bat_and_browser_open_code(self):
        bat = os.path.join(BASE_DIR, "启动.bat")
        self.assertTrue(os.path.isfile(bat))
        with open(bat, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("chcp 65001", content)
        self.assertIn("python server.py", content)
        self.assertIn("pause", content)
        with open(os.path.join(BASE_DIR, "server.py"), "r", encoding="utf-8") as f:
            source = f.read()
        self.assertIn("webbrowser.open", source)
        self.assertIn("threading.Timer", source)

    def test_nine_routes_present(self):
        with open(os.path.join(BASE_DIR, "static", "js", "main.js"), "r", encoding="utf-8") as f:
            source = f.read()
        for key in ["home", "today", "selfmedia", "dev", "consult", "fitness", "diet", "game", "settings"]:
            self.assertIn(key, source)
        self.assertIn("hashchange", source)
        self.assertIn("parseHash", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
