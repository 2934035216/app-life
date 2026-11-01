# -*- coding: utf-8 -*-
"""P3 首页与今日计划：派生/写回/顺延/摘要静态契约 + 真实服务 fixture 读写 + Node 套件。"""
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BASE_DIR, ServerProcess, initial_data, node_test  # noqa: E402

JS = os.path.join(BASE_DIR, "static", "js")
VIEWS = os.path.join(JS, "views")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def p3_fixture():
    """按 DEV-PLAN 8.4 的 P3 fixture。"""
    data = initial_data()
    today = "2026-11-01"
    data["contents"].append({
        "id": "c1", "title": "测试稿", "platforms": ["公众号"], "status": "scheduled",
        "outline": "", "body": "", "scheduledDate": today, "publishedDate": None, "link": "",
        "metrics": {"views": 0, "likes": 0, "comments": 0, "metricsUpdatedAt": None},
        "createdAt": "2026-10-30T09:00:00", "updatedAt": "2026-10-30T09:00:00",
    })
    data["devProjects"].append({
        "id": "p1", "name": "项目 P1", "intro": "", "status": "active",
        "createdAt": "2026-10-30T08:00:00", "updatedAt": "",
    })
    data["devTasks"].append({
        "id": "t1", "projectId": "p1", "title": "任务 T1", "note": "", "dueDate": today,
        "priority": "high", "done": False, "order": 0,
        "createdAt": "2026-10-30T10:00:00", "updatedAt": "",
    })
    data["clients"].append({
        "id": "cl1", "name": "客户 C1", "contact": "", "source": "", "requirement": "",
        "status": "following", "nextFollowupDate": today, "followupClearedAt": None,
        "createdAt": "2026-10-30T11:00:00", "updatedAt": "",
    })
    data["waterLogs"].append({
        "id": "wl1", "date": today, "cups": 0,
        "createdAt": "2026-11-01T00:00:00", "updatedAt": "",
    })
    return data


class P3EngineContractTest(unittest.TestCase):
    def test_three_sources_plus_manual(self):
        source = read(os.path.join(JS, "todoEngine.js"))
        for token in [
            "deriveTodos", "getTodosFor", "'src:selfmedia:'", "'src:dev:'", "'src:consult:'",
            "'todo:'", "manual", "timeSlot: 'afternoon'", "priority: task.priority",
        ]:
            self.assertIn(token, source)
        self.assertIn("if (!isHidden(data, 'selfmedia'))", source)
        self.assertIn("if (!isHidden(data, 'dev'))", source)
        self.assertIn("if (!isHidden(data, 'consult'))", source)
        self.assertIn("if (!isHidden(data, 'today'))", source)

    def test_sort_and_slots(self):
        source = read(os.path.join(JS, "todoEngine.js"))
        self.assertIn("a.priority === 'high' ? -1 : 1", source)
        self.assertIn("byCreatedAsc(a, b)", source)
        self.assertIn("export const SLOT_ORDER = ['morning', 'afternoon', 'evening']", source)
        self.assertIn("export const SLOT_LABELS = { morning: '早上', afternoon: '白天', evening: '晚上' }", source)
        self.assertIn("export function groupBySlot", source)

    def test_toggle_writes_four_sources(self):
        source = read(os.path.join(JS, "todoEngine.js"))
        self.assertIn("if (todo.source === 'manual')", source)
        self.assertIn("if (todo.source === 'dev')", source)
        self.assertIn("if (todo.source === 'selfmedia')", source)
        self.assertIn("if (todo.source === 'consult')", source)
        self.assertIn("content.status = 'published'", source)
        self.assertIn("content.publishedDate = date", source)
        self.assertIn("client.nextFollowupDate = null", source)
        self.assertIn("client.followupClearedAt = date", source)
        self.assertNotIn("consultSessions.push", source, "勾选跟进不应创建咨询记录")

    def test_rollover_snapshot_all_four_fields(self):
        source = read(os.path.join(JS, "todoEngine.js"))
        self.assertIn("export function rolloverTodos", source)
        self.assertIn("export function restoreRollover", source)
        for field in ["'planDate'", "'scheduledDate'", "'dueDate'", "'nextFollowupDate'"]:
            self.assertIn("field: %s" % field, source)
        self.assertIn("if (!item) return;", source)

    def test_six_summaries(self):
        source = read(os.path.join(JS, "todoEngine.js"))
        for key in ["selfmedia:", "dev:", "consult:", "fitness:", "diet:", "game:"]:
            self.assertIn(key, source)
        for text in ["今天无发布计划", "随手记未写", "暂无待跟进", "今天未练", "本周已玩", "已记 "]:
            self.assertIn(text, source)
        self.assertIn("addDays(date, 3)", source)
        self.assertIn("weeklyMinutes(data, date)", source)
        self.assertIn("waterCups(data, date)", source)


class P3TodayViewContractTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "today.js"))

    def test_date_paging_and_readonly(self):
        self.assertIn("const readonly = date < today;", self.source)
        self.assertIn("'#/today?date=' + addDays(date, -1)", self.source)
        self.assertIn("'#/today?date=' + addDays(date, 1)", self.source)
        self.assertIn("历史日期只读", self.source)
        self.assertIn("disabled: readonly ? true : null", self.source)
        self.assertIn("if (!readonly) {", self.source)

    def test_three_slots_and_inline_create(self):
        self.assertIn("SLOT_ORDER.forEach", self.source)
        self.assertIn("SLOT_LABELS[slot]", self.source)
        self.assertIn("addManualTodo(d, {", self.source)
        self.assertIn("+ 加一条", self.source)
        self.assertIn("if (event.key === 'Enter') submit()", self.source)
        self.assertIn("if (!text)", self.source)

    def test_manual_delete_only_with_undo(self):
        self.assertIn("if (todo.source === 'manual' && !readonly)", self.source)
        self.assertIn("deleteWithUndo({", self.source)
        self.assertIn("_pendingDelete = true", self.source)
        self.assertIn("removeItem(d.todos, todo.id)", self.source)
        self.assertIn("onUndo", self.source)
        self.assertNotIn("source === 'dev' &&", self.source)

    def test_rollover_confirm_count_and_undo(self):
        self.assertIn("日终整理", self.source)
        self.assertIn("还有 ' + pending.length + ' 条未完成，顺延到明天？", self.source)
        self.assertIn("rolloverTodos(today, tomorrow, d)", self.source)
        self.assertIn("restoreRollover(d, result.snapshot)", self.source)
        self.assertIn("seconds: 5", self.source)
        self.assertIn("if (date === today) {", self.source)


class P3HomeViewContractTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "home.js"))

    def test_three_blocks(self):
        self.assertIn("今日事项", self.source)
        self.assertIn("快速备忘", self.source)
        self.assertIn("模块速览", self.source)
        self.assertIn("home-grid", self.source)

    def test_memo_latest_ten_and_convert(self):
        self.assertIn(".slice(0, 10)", self.source)
        self.assertIn("convertMemoToTodo(d, memo.id, date)", self.source)
        self.assertIn("已转", self.source)
        self.assertIn("仅显示最近 10 条", self.source)

    def test_hidden_module_filtering(self):
        self.assertIn("const hidden = settings.hiddenModules || [];", self.source)
        self.assertIn("if (hidden.indexOf(card.key) >= 0) return;", self.source)
        self.assertIn("getTodosFor(date, data)", self.source)

    def test_water_cup_and_shortcut_routes(self):
        self.assertIn("addWaterCup(d, date, settings.waterGoal)", self.source)
        self.assertIn("喝水 +1", self.source)
        for route in [
            "#/selfmedia?new=1", "#/selfmedia?open=", "#/dev?log=1",
            "#/consult?open=", "#/consult?new=1",
            "#/fitness?tab=logs&checkin=1", "#/fitness?tab=weight&focus=weight",
            "#/diet?focus=nextmeal", "#/game?checkin=1",
        ]:
            self.assertIn(route, self.source)

    def test_memo_delete_with_five_second_undo(self):
        self.assertIn("deleteWithUndo({", self.source)
        self.assertIn("onConfirm", self.source)
        self.assertIn("onCommit: () => ctx.store.mutate((d) => deleteMemo(d, memo.id))", self.source)
        self.assertNotIn("seconds: 1", self.source)


class P3FixtureServiceTest(unittest.TestCase):
    """手塞 fixture 数据后启动真实服务，确认数据可被读取并正常保存。"""

    def setUp(self):
        self.server = ServerProcess()
        self.server.data_dir = os.path.join(self.server.temp_root, "data")
        os.makedirs(self.server.data_dir, exist_ok=True)
        self.fixture = p3_fixture()
        self.server.write_file_json(self.fixture)
        self.server.start()

    def tearDown(self):
        self.server.cleanup()

    def test_fixture_read_back(self):
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        data = payload["data"]
        self.assertEqual(data["contents"][0]["status"], "scheduled")
        self.assertEqual(data["contents"][0]["scheduledDate"], "2026-11-01")
        self.assertEqual(data["devTasks"][0]["dueDate"], "2026-11-01")
        self.assertEqual(data["clients"][0]["nextFollowupDate"], "2026-11-01")
        self.assertEqual(data["waterLogs"][0]["cups"], 0)
        self.assertEqual(data["settings"]["hiddenModules"], [])

    def test_fixture_write_persists_and_restart_keeps(self):
        status, payload = self.server.get_data()
        data = payload["data"]
        data["todos"].append({
            "id": "m1", "title": "临时事项", "source": "manual", "sourceId": None,
            "planDate": "2026-11-01", "timeSlot": "morning", "priority": "normal",
            "done": False, "doneAt": None,
            "createdAt": "2026-11-01T08:00:00", "updatedAt": "2026-11-01T08:00:00",
        })
        status, saved = self.server.post_data(data, base=payload["updatedAt"])
        self.assertEqual(status, 200, saved)
        on_disk = self.server.read_file_json()
        self.assertEqual(on_disk["todos"][0]["title"], "临时事项")

        self.server.stop()
        self.server.start()
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["data"]["todos"]), 1)
        self.assertEqual(payload["data"]["contents"][0]["title"], "测试稿")

    def test_hidden_module_fixture_does_not_lose_source(self):
        status, payload = self.server.get_data()
        data = payload["data"]
        data["settings"]["hiddenModules"] = ["selfmedia", "dev", "consult", "today"]
        status, saved = self.server.post_data(data, base=payload["updatedAt"])
        self.assertEqual(status, 200, saved)
        on_disk = self.server.read_file_json()
        self.assertEqual(len(on_disk["contents"]), 1)
        self.assertEqual(len(on_disk["devTasks"]), 1)
        self.assertEqual(len(on_disk["clients"]), 1)
        self.assertEqual(on_disk["settings"]["hiddenModules"],
                         ["selfmedia", "dev", "consult", "today"])


class P3NodeTest(unittest.TestCase):
    def test_todo_engine_js_suite(self):
        code, output = node_test("tests/js/todoEngine.test.mjs")
        self.assertEqual(code, 0, output)
        match = re.search(r"pass (\d+)", output)
        self.assertIsNotNone(match, output)
        self.assertGreaterEqual(int(match.group(1)), 15, output)
        self.assertIn("fail 0", output, output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
