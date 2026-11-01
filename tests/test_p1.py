# -*- coding: utf-8 -*-
"""P1 数据层与持久化：读写回环、原子写、指纹、备份/恢复/清空、重启持久化。"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    BACKUP_RE,
    ServerProcess,
    free_port,
    initial_data,
    make_data_with_memo,
    node_test,
)


class P1DataLayerTest(unittest.TestCase):
    def setUp(self):
        self.servers = []
        self.cleanup_dirs = []
        self.server = self._start()

    def tearDown(self):
        for server in self.servers:
            server.stop()
        for directory in self.cleanup_dirs:
            shutil.rmtree(directory, ignore_errors=True)
        for server in self.servers:
            if server.temp_root in self.cleanup_dirs:
                continue
            shutil.rmtree(server.temp_root, ignore_errors=True)

    def _start(self, data_dir=None):
        server = ServerProcess(data_dir=data_dir, start_port=free_port())
        server.start()
        self.servers.append(server)
        return server

    def test_get_data_returns_full_document_and_updated_at(self):
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["updatedAt"])
        self.assertEqual(payload["data"]["version"], 1)
        self.assertEqual(len(payload["data"]["workoutTemplates"]), 7)

    def test_write_roundtrip_and_updated_at_changes(self):
        data = make_data_with_memo("第一条")
        status, first = self.server.post_data(data, None)
        self.assertEqual(status, 200)
        self.assertTrue(first["ok"])
        self.assertEqual(self.server.read_file_json()["memos"][0]["text"], "第一条")
        status, second = self.server.post_data(self.server.read_file_json(), first["updatedAt"])
        self.assertEqual(status, 200)
        self.assertNotEqual(second["updatedAt"], first["updatedAt"])
        status, payload = self.server.get_data()
        self.assertEqual(payload["data"]["memos"][0]["text"], "第一条")

    def test_restart_keeps_data(self):
        data = make_data_with_memo("重启后还在")
        status, _ = self.server.post_data(data, None)
        self.assertEqual(status, 200)
        old_dir = self.server.data_dir
        self.server.stop()
        self.server = self._start(old_dir)
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        self.assertEqual(payload["data"]["memos"][0]["text"], "重启后还在")

    def test_copy_data_file_is_identical_backup(self):
        data = make_data_with_memo("复制即备份")
        status, _ = self.server.post_data(data, None)
        self.assertEqual(status, 200)
        copy_path = os.path.join(self.server.temp_root, "copy.json")
        shutil.copyfile(self.server.data_file, copy_path)
        with open(copy_path, "rb") as f:
            copied = f.read()
        self.assertEqual(copied, self.server.read_file_bytes())

    def test_corrupt_file_is_preserved_and_rejected(self):
        directory = tempfile.mkdtemp(prefix="lifeapp-corrupt-")
        self.cleanup_dirs.append(directory)
        data_dir = os.path.join(directory, "data")
        os.makedirs(data_dir)
        data_file = os.path.join(data_dir, "app-data.json")
        broken = '{"version": 1, "todos": [ this is broken'
        with open(data_file, "w", encoding="utf-8") as f:
            f.write(broken)
        server = self._start(data_dir)
        status, payload = server.get_data()
        self.assertEqual(status, 500)
        self.assertEqual(payload["error"]["code"], "DATA_CORRUPT")
        with open(data_file, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), broken)
        status, payload = server.post_data(initial_data(), None)
        self.assertEqual(status, 500)
        self.assertEqual(payload["error"]["code"], "DATA_CORRUPT")
        with open(data_file, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), broken)

    def test_atomic_write_50_times(self):
        data = make_data_with_memo("循环 0")
        for i in range(50):
            data["memos"][0]["text"] = "循环 %d" % i
            status, payload = self.server.post_data(data, None)
            self.assertEqual(status, 200)
            with open(self.server.data_file, "r", encoding="utf-8") as f:
                parsed = json.load(f)
            self.assertEqual(parsed["memos"][0]["text"], "循环 %d" % i)

    def test_stale_base_updated_at_409(self):
        status, payload = self.server.get_data()
        old_base = payload["updatedAt"]
        data = make_data_with_memo("先写一次")
        status, first = self.server.post_data(data, old_base)
        self.assertEqual(status, 200)
        before = self.server.read_file_bytes()
        data2 = make_data_with_memo("旧指纹写入")
        status, conflict = self.server.post_data(data2, old_base)
        self.assertEqual(status, 409)
        self.assertEqual(conflict["error"]["code"], "CONFLICT")
        self.assertIn("serverUpdatedAt", conflict)
        self.assertEqual(self.server.read_file_bytes(), before)
        status, ok = self.server.post_data(data2, conflict["serverUpdatedAt"])
        self.assertEqual(status, 200)

    def test_invalid_shape_and_version_rejected(self):
        data = initial_data()
        del data["memos"]
        status, payload = self.server.post_data(data, None)
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "INVALID_SHAPE")
        data = initial_data()
        data["version"] = 2
        status, payload = self.server.post_data(data, None)
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "INVALID_SHAPE")
        data = initial_data()
        data["settings"] = []
        status, payload = self.server.post_data(data, None)
        self.assertEqual(status, 400)

    def test_backup_naming_and_unique(self):
        status, first = self.server.backup()
        self.assertEqual(status, 200)
        status, second = self.server.backup()
        self.assertEqual(status, 200)
        self.assertNotEqual(first["file"], second["file"])
        for item in (first, second):
            self.assertRegex(item["file"], BACKUP_RE)
            self.assertTrue(os.path.isfile(os.path.join(self.server.data_dir, item["file"])))
            self.assertTrue(item["dir"].endswith("data/"))

    def test_backups_returns_only_data_dir_and_sorted(self):
        self.server.backup()
        self.server.backup()
        outside = os.path.join(self.server.temp_root, "outside")
        os.makedirs(outside, exist_ok=True)
        fake = os.path.join(outside, "backup-20991231-2359.json")
        with open(fake, "w", encoding="utf-8") as f:
            f.write("{}")
        status, payload = self.server.list_backups()
        self.assertEqual(status, 200)
        names = [item["file"] for item in payload["backups"]]
        self.assertGreaterEqual(len(names), 2)
        self.assertNotIn("backup-20991231-2359.json", names)
        for name in names:
            self.assertRegex(name, BACKUP_RE)
            self.assertTrue(os.path.isfile(os.path.join(self.server.data_dir, name)))
        self.assertEqual(names, sorted(names, reverse=True))

    def test_restore_roundtrip_with_emergency_backup(self):
        data_a = make_data_with_memo("备份时的数据")
        status, _ = self.server.post_data(data_a, None)
        self.assertEqual(status, 200)
        status, backup = self.server.backup()
        self.assertEqual(status, 200)
        backup_path = os.path.join(self.server.data_dir, backup["file"])
        with open(backup_path, "r", encoding="utf-8") as f:
            backup_content = json.load(f)

        data_b = make_data_with_memo("恢复前的当前数据")
        status, _ = self.server.post_data(data_b, None)
        self.assertEqual(status, 200)
        status, _ = self.server.restore(backup["file"])
        self.assertEqual(status, 200)
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        self.assertEqual(payload["data"], backup_content)
        self.assertEqual(self.server.read_file_json(), backup_content)

        status, backups = self.server.list_backups()
        emergency = [item["file"] for item in backups["backups"] if item["file"].startswith("backup-before-restore-")]
        self.assertTrue(emergency)
        self.assertRegex(emergency[0], BACKUP_RE)
        with open(os.path.join(self.server.data_dir, emergency[0]), "r", encoding="utf-8") as f:
            emergency_content = json.load(f)
        self.assertEqual(emergency_content["memos"][0]["text"], "恢复前的当前数据")

    def test_restore_rejects_outside_and_invalid(self):
        status, _ = self.server.backup()
        self.assertEqual(status, 200)
        status, payload = self.server.restore("../outside/backup-20260101-0000.json")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "OUTSIDE_DATA_DIR")
        status, payload = self.server.restore("backup-does-not-exist.json")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "FILE_NOT_FOUND")

        bad = os.path.join(self.server.data_dir, "backup-20260101-0000.json")
        with open(bad, "w", encoding="utf-8") as f:
            f.write("{not json")
        status, payload = self.server.restore("backup-20260101-0000.json")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "INVALID_BACKUP")

        wrong_shape = os.path.join(self.server.data_dir, "backup-20260101-0001.json")
        with open(wrong_shape, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "todos": []}, f)
        status, payload = self.server.restore("backup-20260101-0001.json")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "INVALID_BACKUP")

    def test_clear_resets_and_backs_up(self):
        data = make_data_with_memo("清空前数据")
        status, _ = self.server.post_data(data, None)
        self.assertEqual(status, 200)
        status, result = self.server.clear()
        self.assertEqual(status, 200)
        self.assertRegex(result["autoBackup"], BACKUP_RE)
        self.assertTrue(os.path.isfile(os.path.join(self.server.data_dir, result["autoBackup"])))
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        self.assertEqual(payload["data"], initial_data())
        self.assertFalse(payload["data"]["settings"]["welcomed"])
        with open(os.path.join(self.server.data_dir, result["autoBackup"]), "r", encoding="utf-8") as f:
            backup_content = json.load(f)
        self.assertEqual(backup_content["memos"][0]["text"], "清空前数据")

    def test_api_error_shape(self):
        status, payload, headers = self.server.request("GET", "/api/nope")
        self.assertEqual(status, 404)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "NOT_FOUND")
        self.assertIn("message", payload["error"])

    def test_utils_node_suite(self):
        code, output = node_test("tests/js/utils.test.mjs")
        self.assertEqual(code, 0, output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
