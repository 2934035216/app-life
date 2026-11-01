# -*- coding: utf-8 -*-
"""P5 设置与备份恢复：视图契约 + 真实服务备份/恢复/清空 + 设置持久化。

覆盖 AC-2（欢迎引导）、AC-10（主题切换与保持）、AC-42（喝水目标同步值）、
AC-46（备份文件命名与位置）、AC-47（恢复前应急备份、数据与备份一致）、
AC-48（备份列表只含 data 目录内文件）、AC-49（清空强确认与归零回欢迎）、
AC-50（隐藏模块三层过滤与数据保留）、AC-51（恢复/清空不可撤销、无撤销条）。
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BACKUP_RE, BASE_DIR, ServerProcess, initial_data, node_test  # noqa: E402

JS = os.path.join(BASE_DIR, "static", "js")
VIEWS = os.path.join(JS, "views")
CSS = os.path.join(BASE_DIR, "static", "css")
UI = os.path.join(JS, "ui")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


class P5SettingsViewTest(unittest.TestCase):
    """设置页四区块、外观、模块开关、翻篇、喝水、备份/恢复/清空接线（AC-10/42/46~51）。"""

    def setUp(self):
        self.source = read(os.path.join(VIEWS, "settings.js"))

    def test_four_section_cards(self):
        for title in ("备份与恢复", "外观", "模块显示开关", "偏好"):
            self.assertIn("text: '%s'" % title, self.source)
        self.assertIn("class: 'section-card'", self.source)
        self.assertIn("备份文件只写在 data 目录内", self.source)
        self.assertIn("翻篇时间与喝水目标", self.source)

    def test_theme_toggle_instant_and_persisted(self):
        self.assertIn("[['light', '浅色'], ['dark', '深色']].forEach((pair) => {", self.source)
        self.assertIn("ctx.store.setTheme(pair[0]);", self.source)
        # setTheme 内部写 settings.theme 并立即 applyTheme，刷新后由 store.init 回放
        store_source = read(os.path.join(JS, "store.js"))
        self.assertIn("data.settings.theme = theme === 'dark' ? 'dark' : 'light';", store_source)
        self.assertIn("applyTheme(theme);", store_source)
        self.assertIn("applyTheme(data && data.settings ? data.settings.theme : 'light');", store_source)

    def test_seven_module_checkboxes_and_note(self):
        keys = ["today", "selfmedia", "dev", "consult", "fitness", "diet", "game"]
        for key in keys:
            self.assertIn("{ key: '%s', label:" % key, self.source)
        # 首页与数据与设置不可隐藏
        self.assertNotIn("{ key: 'home'", self.source)
        self.assertNotIn("{ key: 'settings'", self.source)
        self.assertIn("首页与数据与设置不可隐藏", self.source)
        self.assertIn("隐藏期间数据仍在，重新开启即恢复。隐藏模块的事项不再汇总到首页。", self.source)
        self.assertIn("type: 'checkbox'", self.source)
        self.assertIn("data.settings.hiddenModules = list;", self.source)
        self.assertIn("ctx.refreshAll();", self.source)

    def test_rollover_and_water_goal_controls(self):
        self.assertIn("[0, 4].forEach((hour) => {", self.source)
        self.assertIn("data.settings.dayRolloverHour = hour;", self.source)
        self.assertIn("type: 'number', min: '1', max: '30', value: settings.waterGoal || 8,", self.source)
        self.assertIn("Math.max(1, Math.min(30, Math.floor(Number(goalInput.value) || 8)))", self.source)
        self.assertIn("data.settings.waterGoal = value;", self.source)

    def test_backup_button_and_location_hint(self):
        self.assertIn("const res = await api.backup();", self.source)
        self.assertIn("res.dir", self.source)
        self.assertIn("res.file", self.source)
        self.assertIn("'备份已生成：' + (res.dir || 'data/') + res.file", self.source)
        self.assertIn("data/backup-YYYYMMDD-HHmm.json", self.source)

    def test_restore_flow_with_emergency_backup(self):
        self.assertIn("await api.listBackups();", self.source)
        self.assertIn("await api.restore(selected);", self.source)
        self.assertIn("backup-before-restore-*.json", self.source)
        self.assertIn("此操作不可撤销", self.source)
        self.assertIn("title: '确认从备份恢复？'", self.source)
        self.assertIn("location.reload();", self.source)
        # AC-51：恢复过程不出现撤销条（settings.js 不引用任何 undo 设施）
        self.assertNotIn("undo", self.source.lower())

    def test_clear_requires_typed_confirmation(self):
        self.assertIn("requireText: '清空'", self.source)
        self.assertIn("await api.clear();", self.source)
        self.assertIn("backup-before-clear-*.json", self.source)
        self.assertIn("data.settings.welcomed", read(os.path.join(JS, "main.js")))

    def test_destructive_actions_flush_first(self):
        guard = "if (!flushed) throw new Error('当前修改尚未保存成功，请稍后重试');"
        self.assertEqual(self.source.count("const flushed = await ctx.store.flushNow();"), 3)
        self.assertEqual(self.source.count(guard), 3)
        # 恢复选择器必须持有 ctx（回归：曾因 ctx 未定义导致恢复必失败）
        self.assertIn("async function openRestoreChooser() {\n  if (!R) return;\n  const ctx = R.ctx;", self.source)

    def test_dialog_require_text_blocks_until_exact_match(self):
        dialog = read(os.path.join(UI, "dialog.js"))
        self.assertIn("if (options.requireText) {", dialog)
        self.assertIn("okBtn.disabled = input.value.trim() !== options.requireText;", dialog)
        self.assertIn("'请输入「' + options.requireText + '」以确认'", dialog)


class P5WelcomeAndFilterTest(unittest.TestCase):
    """欢迎引导（AC-2）与隐藏模块三层过滤（AC-50）。"""

    def setUp(self):
        self.main = read(os.path.join(JS, "main.js"))
        self.home = read(os.path.join(VIEWS, "home.js"))
        self.engine = read(os.path.join(JS, "todoEngine.js"))
        self.css = read(os.path.join(CSS, "components.css"))
        self.base_css = read(os.path.join(CSS, "base.css"))

    def test_welcome_shows_only_when_not_welcomed(self):
        self.assertIn("if (settingsData().welcomed === false) showWelcome();", self.main)
        self.assertIn("function showWelcome()", self.main)
        for line in (
            "数据存在本机 data 文件夹里，不上传任何地方。",
            "关掉浏览器不影响数据；关掉服务窗口数据也已保存。",
            "备份 = 复制 data 文件夹里的 app-data.json。",
        ):
            self.assertIn(line, self.main)
        self.assertIn("text: '开始使用'", self.main)
        self.assertIn("data.settings.welcomed = true;", self.main)
        self.assertIn("store.flushNow();", self.main)
        self.assertIn(".welcome-mask {", self.css)
        self.assertIn(".welcome-card {", self.css)

    def test_nav_filters_hidden_modules(self):
        self.assertIn("const hidden = settingsData().hiddenModules || [];", self.main)
        self.assertIn("if (hidden.indexOf(key) >= 0) return;", self.main)
        # 首页与设置永不隐藏
        self.assertIn("home: { label: '首页' }", self.main)
        self.assertIn("settings: { label: '数据与设置' }", self.main)

    def test_home_cards_filter_hidden_modules(self):
        self.assertIn("const hidden = settings.hiddenModules || [];", self.home)
        self.assertIn("if (hidden.indexOf(card.key) >= 0) return;", self.home)

    def test_engine_derivation_skips_hidden_sources(self):
        for key in ("selfmedia", "dev", "consult"):
            self.assertIn("isHidden(data, '%s')" % key, self.engine)
        # 隐藏只影响派生，不删源数据
        self.assertNotIn("data.contents = []", self.engine)
        self.assertNotIn("data.devTasks = []", self.engine)
        self.assertNotIn("data.clients = []", self.engine)

    def test_dark_theme_variables_exist(self):
        self.assertIn('body[data-theme="dark"] {', self.base_css)
        self.assertIn("--bg-elevated: #1c2230;", self.base_css)
        self.assertIn(".segmented {", self.css)
        self.assertIn(".module-toggle-grid {", self.css)
        self.assertIn(".danger-row {", self.css)
        self.assertIn(".backup-note {", self.css)


class P5BackupRestoreApiTest(unittest.TestCase):
    """真实服务：备份命名/位置、恢复应急备份、清空自动备份、设置持久化（AC-46~51）。"""

    def setUp(self):
        self.servers = []
        self.server = self._start()

    def tearDown(self):
        for server in reversed(self.servers):
            server.stop()
        self.server.cleanup()

    def _start(self, data_dir=None):
        server = ServerProcess(data_dir=data_dir, temp_root=self.server.temp_root if self.servers else None)
        if data_dir is not None and self.servers:
            server.temp_root = self.server.temp_root
        server.start()
        self.servers.append(server)
        return server

    def _save(self, server, data, base):
        status, payload = server.post_data(data, base=base)
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["ok"])
        return payload["updatedAt"]

    def _data_with_memo(self, text):
        data = initial_data()
        data["memos"].append({
            "id": "memo-marker",
            "text": text,
            "convertedToTodo": False,
            "todoId": None,
            "createdAt": "2026-11-01T09:00:00",
            "updatedAt": "2026-11-01T09:00:00",
        })
        return data

    def _current(self, server):
        status, payload = server.get_data()
        self.assertEqual(status, 200, payload)
        return payload["data"], payload["updatedAt"]

    def test_backup_filename_matches_contract_and_lives_in_data_dir(self):
        data, updated = self._current(self.server)
        status, payload = self.server.backup()
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["ok"])
        name = payload["file"]
        self.assertTrue(BACKUP_RE.match(name), name)
        self.assertRegex(name, r"^backup-\d{8}-\d{4}\.json$")
        self.assertTrue(payload["dir"].endswith("/"), payload["dir"])
        path = os.path.join(self.server.data_dir, name)
        self.assertTrue(os.path.isfile(path))
        with open(path, "rb") as f:
            self.assertEqual(f.read(), self.server.read_file_bytes())

        status, second = self.server.backup()
        self.assertEqual(status, 200, second)
        # 同一分钟重复导出时追加 -2，跨分钟则使用新时间戳；两种情况都必须合法且不覆盖
        self.assertRegex(second["file"], r"^backup-\d{8}-\d{4}(-2)?\.json$")
        self.assertNotEqual(second["file"], name)
        self.assertTrue(os.path.isfile(os.path.join(self.server.data_dir, second["file"])))

        status, listed = self.server.list_backups()
        self.assertEqual(status, 200, listed)
        files = [item["file"] for item in listed["backups"]]
        self.assertIn(name, files)
        self.assertIn(second["file"], files)
        for item in listed["backups"]:
            self.assertEqual(sorted(item.keys()), ["file", "mtime", "size"])
        self.assertEqual(files, sorted(files, reverse=True))

    def test_backup_list_ignores_files_outside_data_dir(self):
        outside = os.path.join(self.server.temp_root, "backup-20990101-0000.json")
        with open(outside, "w", encoding="utf-8") as f:
            f.write("{}")
        status, listed = self.server.list_backups()
        self.assertEqual(status, 200, listed)
        self.assertNotIn("backup-20990101-0000.json", [item["file"] for item in listed["backups"]])
        status, payload = self.server.restore("backup-20990101-0000.json")
        self.assertEqual(status, 400, payload)
        self.assertEqual(payload["error"]["code"], "FILE_NOT_FOUND")

    def test_restore_creates_emergency_backup_and_matches_target(self):
        data_a = self._data_with_memo("版本A")
        _, updated = self._current(self.server)
        self._save(self.server, data_a, updated)

        status, backup = self.server.backup()
        self.assertEqual(status, 200, backup)

        data_b = self._data_with_memo("版本B")
        _, updated = self._current(self.server)
        self._save(self.server, data_b, updated)

        status, restored = self.server.restore(backup["file"])
        self.assertEqual(status, 200, restored)
        self.assertTrue(restored["ok"])
        emergency = restored["emergencyBackup"]
        self.assertTrue(BACKUP_RE.match(emergency), emergency)
        self.assertRegex(emergency, r"^backup-before-restore-\d{8}-\d{4}(-\d+)?\.json$")

        emergency_path = os.path.join(self.server.data_dir, emergency)
        self.assertTrue(os.path.isfile(emergency_path))
        with open(emergency_path, "r", encoding="utf-8") as f:
            emergency_data = json.load(f)
        self.assertEqual(emergency_data["memos"][0]["text"], "版本B")

        current, _ = self._current(self.server)
        self.assertEqual(current["memos"][0]["text"], "版本A")
        self.assertEqual([m["text"] for m in self.server.read_file_json()["memos"]], ["版本A"])

        # 重启后仍是恢复后的数据（恢复已落盘）
        restarted = self._start(data_dir=self.server.data_dir)
        again, _ = self._current(restarted)
        self.assertEqual(again["memos"][0]["text"], "版本A")

    def test_restore_rejects_unsafe_or_missing_files(self):
        cases = [
            ("../app-data.json", "OUTSIDE_DATA_DIR"),
            ("backup/../app-data.json", "OUTSIDE_DATA_DIR"),
            ("backup-not-exist.json", "FILE_NOT_FOUND"),
        ]
        for name, code in cases:
            status, payload = self.server.restore(name)
            self.assertEqual(status, 400, payload)
            self.assertEqual(payload["error"]["code"], code)

    def test_clear_auto_backups_and_resets_to_welcome(self):
        data = self._data_with_memo("清空前数据")
        _, updated = self._current(self.server)
        self._save(self.server, data, updated)

        status, payload = self.server.clear()
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["ok"])
        auto_backup = payload["autoBackup"]
        self.assertRegex(auto_backup, r"^backup-before-clear-\d{8}-\d{4}(-\d+)?\.json$")
        with open(os.path.join(self.server.data_dir, auto_backup), "r", encoding="utf-8") as f:
            archived = json.load(f)
        self.assertEqual(archived["memos"][0]["text"], "清空前数据")

        current, _ = self._current(self.server)
        self.assertEqual(current["memos"], [])
        self.assertEqual(current["todos"], [])
        self.assertEqual(current["contents"], [])
        self.assertEqual(current["settings"]["welcomed"], False)
        self.assertEqual(current["settings"]["theme"], "light")
        self.assertEqual(current["settings"]["dayRolloverHour"], 4)
        self.assertEqual(current["settings"]["waterGoal"], 8)
        self.assertEqual(current["settings"]["hiddenModules"], [])
        self.assertEqual(len(current["workoutTemplates"]), 7)

        restarted = self._start(data_dir=self.server.data_dir)
        again, _ = self._current(restarted)
        self.assertEqual(again["memos"], [])
        self.assertEqual(again["settings"]["welcomed"], False)

    def test_settings_and_hidden_sources_survive_restart(self):
        data = initial_data()
        data["settings"] = {
            "theme": "dark",
            "dayRolloverHour": 0,
            "waterGoal": 10,
            "hiddenModules": ["selfmedia", "game"],
            "welcomed": True,
        }
        data["contents"].append({
            "id": "c-hidden",
            "title": "隐藏期间的稿子",
            "status": "idea",
            "platforms": [],
            "createdAt": "2026-11-01T09:00:00",
            "updatedAt": "2026-11-01T09:00:00",
        })
        data["games"].append({
            "id": "g-hidden",
            "name": "隐藏期间的游戏",
            "status": "wishlist",
            "progressNote": "",
            "totalMinutes": 0,
            "createdAt": "2026-11-01T09:00:00",
            "updatedAt": "2026-11-01T09:00:00",
        })
        _, updated = self._current(self.server)
        self._save(self.server, data, updated)

        restarted = self._start(data_dir=self.server.data_dir)
        current, _ = self._current(restarted)
        self.assertEqual(current["settings"], data["settings"])
        self.assertEqual([c["title"] for c in current["contents"]], ["隐藏期间的稿子"])
        self.assertEqual([g["name"] for g in current["games"]], ["隐藏期间的游戏"])

        # 重新开启（清空 hiddenModules）后源数据仍在
        current["settings"]["hiddenModules"] = []
        _, updated = self._current(restarted)
        self._save(restarted, current, updated)
        reopened, _ = self._current(restarted)
        self.assertEqual(reopened["settings"]["hiddenModules"], [])
        self.assertEqual(len(reopened["contents"]), 1)
        self.assertEqual(len(reopened["games"]), 1)

    def test_invalid_settings_are_normalized_on_save(self):
        data = initial_data()
        data["settings"] = {
            "theme": "blue",
            "dayRolloverHour": 3,
            "waterGoal": 31,
            "hiddenModules": "selfmedia",
            "welcomed": "yes",
        }
        _, updated = self._current(self.server)
        self._save(self.server, data, updated)
        current, _ = self._current(self.server)
        settings = current["settings"]
        self.assertEqual(settings["theme"], "light")
        self.assertEqual(settings["dayRolloverHour"], 4)
        self.assertEqual(settings["waterGoal"], 8)
        self.assertEqual(settings["hiddenModules"], [])
        self.assertEqual(settings["welcomed"], True)

    def test_restore_and_clear_endpoints_are_not_undoable(self):
        # 服务端没有撤销接口，前端 settings.js 也不引用 undo（AC-51）
        status, payload, _ = self.server.request("POST", "/api/undo", {})
        self.assertEqual(status, 404, payload)


class P5NodeTest(unittest.TestCase):
    """P3 引擎套件在本阶段继续作为隐藏过滤回归（不新增重复用例）。"""

    def test_todo_engine_suite_still_passes(self):
        code, output = node_test(os.path.join("tests", "js", "todoEngine.test.mjs"))
        self.assertEqual(code, 0, output)
        self.assertIn("ℹ pass 15", output)
        self.assertIn("ℹ fail 0", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
