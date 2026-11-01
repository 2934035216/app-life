# -*- coding: utf-8 -*-
"""P4 六模块：视图契约（AC-22~45）+ 真实服务 fixture 持久化 + Node 套件。"""
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BASE_DIR, ServerProcess, initial_data, node_test  # noqa: E402

JS = os.path.join(BASE_DIR, "static", "js")
VIEWS = os.path.join(JS, "views")
CSS = os.path.join(BASE_DIR, "static", "css")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


class P4aSelfmediaTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "selfmedia.js"))

    def test_four_column_board(self):
        self.assertIn("['idea', 'writing', 'scheduled', 'published'].forEach", self.source)
        self.assertIn("dataset: { status }", self.source)
        self.assertIn("CONTENT_STATUS[status]", self.source)
        self.assertIn("item.scheduledDate", self.source)
        self.assertIn("'播放 ' + (metrics.views || 0)", self.source)
        self.assertIn("赞 ' + (metrics.likes || 0)", self.source)

    def test_published_list_sorted_desc(self):
        self.assertIn("R.view === 'list'", self.source)
        self.assertIn("sortByKeyDesc(list, 'publishedDate')", self.source)

    def test_drag_drop_and_publish_confirm(self):
        self.assertIn("draggable: 'true'", self.source)
        self.assertIn("getData('text/plain')", self.source)
        self.assertIn("handleDrop(status, id)", self.source)
        self.assertIn("if (status === 'published')", self.source)
        self.assertIn("publishFlow(item)", self.source)
        self.assertIn("title: '确认发布'", self.source)
        self.assertIn("{ name: 'publishedDate', label: '实际发布日期', type: 'date', value: ctx.today() }", self.source)
        self.assertIn("{ name: 'link', label: '链接（可空）'", self.source)
        self.assertIn("if (!values) return;", self.source)

    def test_fullscreen_writing_route_and_autosave(self):
        self.assertIn("R.params.writeId", self.source)
        self.assertIn("'#/selfmedia/write/' + item.id", self.source)
        self.assertIn("textarea", self.source)
        self.assertIn("outline.value = item.outline", self.source)
        self.assertIn("bodyArea.value = item.body", self.source)
        self.assertIn("debounce(() =>", self.source)
        self.assertIn("}, 1000)", self.source)
        self.assertIn("{ long: true }", self.source)

    def test_detail_panel_metrics_and_saved_marker(self):
        self.assertIn("width: '40'", self.source)
        self.assertIn("openEditor(item.id)", self.source)
        self.assertIn("updateContentMetrics(d, item.id", self.source)
        self.assertIn("metricsUpdatedAt", self.source)
        self.assertIn("p.setStatus('自动保存')", self.source)

    def test_search_filter_and_delete_wording(self):
        self.assertIn("R.search.trim().toLowerCase()", self.source)
        self.assertIn("item.platforms || []).indexOf(R.platform)", self.source)
        self.assertIn("R.platform", self.source)
        self.assertIn("发布数据将一并删除", self.source)
        self.assertIn("deleteWithUndo({", self.source)


    def test_published_performance_chart_and_empty_states(self):
        self.assertIn("contentPerformance", self.source)
        self.assertIn("box.append(buildPerformanceCard());", self.source)
        self.assertIn("text: '发布后视频数据'", self.source)
        self.assertIn("还没有已发布内容；发布并回填数据后，这里会显示表现。", self.source)
        self.assertIn("已发布内容还没有回填播放/点赞/评论，打开详情补填后图表会自动更新。", self.source)
        self.assertIn("perfBar('播放', item.views, perf.max.views, 'views')", self.source)
        self.assertIn("perfBar('赞', item.likes, perf.max.likes, 'likes')", self.source)
        self.assertIn("perfBar('评', item.comments, perf.max.comments, 'comments')", self.source)
        css = read(os.path.join(CSS, "components.css"))
        self.assertIn(".perf-empty {", css)
        self.assertIn(".perf-bar-fill {", css)


class P4bDevTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "dev.js"))

    def test_project_progress_and_done_bottom(self):
        self.assertIn("Math.round((doneCount / tasks.length) * 100)", self.source)
        self.assertIn("doneCount + '/' + tasks.length + ' 个任务已完成'", self.source)
        self.assertIn("const order = { active: 0, paused: 1, done: 2 };", self.source)
        self.assertIn("已完结（收起在底部）", self.source)

    def test_project_crud_and_cascade_delete(self):
        self.assertIn("createProject(d, {", self.source)
        self.assertIn("updateProject(d, project.id", self.source)
        self.assertIn("deleteProject(d, project.id)", self.source)
        self.assertIn("task._pendingDelete = true", self.source)
        self.assertIn("log._pendingDelete = true", self.source)
        self.assertIn("个任务、' + logCount + ' 条日志）。", self.source)
        self.assertIn("onUndo", self.source)

    def test_tasks_checkbox_drag_and_done_fold(self):
        self.assertIn("updateTask(d, task.id, { done: checkbox.checked })", self.source)
        self.assertIn("draggable: isDone ? null : 'true'", self.source)
        self.assertIn("moveTask(d, dragged, targetIndex)", self.source)
        self.assertIn("R.showDone = false", self.source)
        self.assertIn("（展开回看）", self.source)

    def test_dev_log_unique_and_inline_edit(self):
        self.assertIn("upsertDevLog(d, project.id, today, { content: text })", self.source)
        self.assertIn("findDevLog(data, project.id, today)", self.source)
        self.assertIn("updateDevLog(d, log.id, { content: content.value }), { long: true })", self.source)
        self.assertIn("updateDevLog(d, log.id, { blocker: blocker.value }), { long: true })", self.source)
        self.assertIn("moveDevLogDate(d, log.id, date.value)", self.source)

    def test_add_work_item_entry_always_available(self):
        models = read(os.path.join(JS, "models.js"))
        self.assertIn("export function addWorkItem", models)
        self.assertIn("export const DEFAULT_PROJECT_NAME = '我的工作'", models)
        self.assertIn("text: '＋ 新增工作项'", self.source)
        self.assertIn("onclick: () => startNewTask()", self.source)
        self.assertIn("function startNewTask()", self.source)
        self.assertIn("buildTaskComposer(null)", self.source)
        self.assertIn("buildTaskComposer(project)", self.source)
        self.assertIn("addWorkItem(d, project ? project.id : null", self.source)
        self.assertIn("text: '新增工作项', onclick: submit", self.source)
        self.assertIn("R.selectedId = result.projectId", self.source)
        self.assertIn("第一条工作项标题，回车添加", self.source)
        self.assertIn("还没有项目，自动归入「我的工作」", self.source)


class P4cConsultTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "consult.js"))

    def test_client_fields_and_due_highlight(self):
        self.assertIn("client.name", self.source)
        self.assertIn("client.requirement", self.source)
        self.assertIn("client.nextFollowupDate", self.source)
        self.assertIn("lastSessionDate", self.source)
        self.assertIn("if (client.nextFollowupDate < today) return { due: true", self.source)
        self.assertIn("client.nextFollowupDate === today", self.source)
        self.assertIn("client.nextFollowupDate <= addDays(today, 3)", self.source)
        self.assertIn("'client-card' + (due.due ? ' due' : '')", self.source)
        self.assertIn("橙框 = 到期当天或 3 天内要跟进", self.source)

    def test_search_and_status_filter(self):
        self.assertIn("String(client.name || '').toLowerCase().indexOf(search)", self.source)
        self.assertIn("String(client.requirement || '').toLowerCase().indexOf(search)", self.source)
        self.assertIn("if (R.status && client.status !== R.status) return false;", self.source)

    def test_fifty_percent_panel_and_composer(self):
        self.assertIn("width: '50'", self.source)
        self.assertIn("renderPanelBody", self.source)
        self.assertIn("composing = true", self.source)
        self.assertIn("buildComposer()", self.source)
        self.assertIn("addConsultSession(d, client.id, values)", self.source)
        self.assertIn("clientSessions(ctx.store.data, client.id)", self.source)
        self.assertNotIn("openPanel({", self.source.split("function buildComposer")[1].split("function renderDetail")[0],
                         "记录表单应在面板内展开，不再开第二个面板")

    def test_followup_sync_and_delete_rollback(self):
        self.assertIn("syncClientFollowup(d, client.id)", self.source)
        self.assertIn("deleteConsultSession(d, session.id)", self.source)
        self.assertIn("session._pendingDelete = true", self.source)
        self.assertIn("deleteClient(d, target.id)", self.source)
        self.assertIn("sessions.length + ' 条咨询记录一并删除。", self.source)

    def test_client_delete_entry_on_card_and_list(self):
        self.assertGreaterEqual(self.source.count(
            "onclick: (event) => { event.stopPropagation(); deleteClientFlow(client); }"), 2,
            "卡片和列表行都要有删除入口，且不能触发打开详情")
        self.assertIn("class: 'btn ghost small client-delete'", self.source)
        self.assertIn("title: '删除客户'", self.source)
        self.assertIn("title: '删除客户「' + (target.name || '未命名') + '」？'", self.source)
        self.assertIn("undoLabel: '已删除客户'", self.source)
        self.assertIn("sessions.forEach((session) => { session._pendingDelete = true; });", self.source)
        self.assertIn("deleteClientFlow(client)", self.source.split("function renderDetail")[1],
                      "详情面板底部的删除按钮仍保留")
        css = read(os.path.join(CSS, "components.css"))
        self.assertIn(".client-card .client-delete", css)


class P4dFitnessTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "fitness.js"))

    def test_seven_day_plan_grid(self):
        self.assertIn("weekDates(ctx.today())", self.source)
        self.assertIn("templateForDate(data, date)", self.source)
        self.assertIn("'plan-cell section-card'", self.source)
        self.assertIn("weekdayCN(date)", self.source)

    def test_template_edit_without_history_rewrite(self):
        self.assertIn("updateTemplate(d, template.dayOfWeek, { title: title.value })", self.source)
        self.assertIn("updateTemplate(d, template.dayOfWeek, { isRestDay: rest.checked })", self.source)
        self.assertIn("addTemplateExercise(d, template.dayOfWeek)", self.source)
        self.assertIn("removeTemplateExercise(d, template.dayOfWeek, index)", self.source)
        self.assertNotIn("workoutLogs", self.source.split("function drawPlan")[1].split("function buildTemplateExercise")[0])

    def test_checkin_from_template_and_same_day_edit(self):
        self.assertIn("draftFromTemplate(ctx, date)", self.source)
        self.assertIn("templateForDate(data, date)", self.source)
        self.assertIn("buildWorkoutLogFromTemplate(d, draft.date)", self.source)
        self.assertIn("moveWorkoutLogDate(d, target.id, draft.date)", self.source)
        self.assertIn("同一天至多一条记录", self.source)
        self.assertIn("标记\"没练\"", self.source)
        self.assertIn("'+ 加一组'", self.source)
        self.assertIn("exercise.sets.push", self.source)
        self.assertIn("durationMinutes", self.source)

    def test_logs_desc_and_delete_undo(self):
        self.assertIn("String(b.date).localeCompare(String(a.date))", self.source)
        self.assertIn("deleteWithUndo({", self.source)
        self.assertIn("deleteWorkoutLog(d, target.id)", self.source)

    def test_weight_last_wins_and_inline_svg(self):
        self.assertIn("upsertWeight(d, today, input.value)", self.source)
        self.assertIn("只保留最后一次", self.source)
        self.assertIn("weightChart", self.source)
        self.assertIn("document.createElementNS(ns, 'svg')", self.source)
        self.assertIn("'polyline'", self.source)
        self.assertIn("updateWeight(d, entry.id, weight)", self.source)
        self.assertNotIn("chart.js", self.source)
        self.assertNotIn("d3.", self.source)


class P4eDietTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "diet.js"))

    def test_four_meal_blocks_and_enter_add(self):
        self.assertIn("MEAL_TYPES.forEach((type) => grid.append(buildMealBlock", self.source)
        self.assertIn("meal-input", self.source)
        self.assertIn("if (event.key === 'Enter') submit();", self.source)
        self.assertIn("addMealItem(d, date, mealType, text)", self.source)
        self.assertIn("data-meal", self.source)

    def test_water_cups_toggle(self):
        self.assertIn("for (let i = 1; i <= goal; i += 1)", self.source)
        self.assertIn("const next = cups === i ? i - 1 : i;", self.source)
        self.assertIn("setWaterCups(d, date, next, goal)", self.source)
        self.assertIn("cups + ' / ' + goal + ' 杯'", self.source)

    def test_meal_templates(self):
        self.assertIn("createMealTemplate(d, values.name, items)", self.source)
        self.assertIn("applyMealTemplate(d, R.date, mealType, value)", self.source)
        self.assertIn("renameMealTemplate(d, template.id, text)", self.source)
        self.assertIn("deleteMealTemplate(d, template.id)", self.source)
        self.assertIn("deleteWithUndo({", self.source)
        self.assertIn("模板管理", self.source)


class P4fGameTest(unittest.TestCase):
    def setUp(self):
        self.source = read(os.path.join(VIEWS, "game.js"))

    def test_three_tabs_and_card_metrics(self):
        self.assertIn("key: 'playing'", self.source)
        self.assertIn("key: 'wishlist'", self.source)
        self.assertIn("key: 'finished'", self.source)
        self.assertIn("'累计 ' + fmtMinutes(game.totalMinutes || 0)", self.source)
        self.assertIn("'本周 ' + fmtMinutes(weekly)", self.source)
        self.assertIn("game.progress", self.source)
        self.assertIn("game.finishedDate", self.source)

    def test_status_flow_with_finish_fields(self):
        self.assertIn("if (next === 'finished')", self.source)
        self.assertIn("title: '标记已通关'", self.source)
        self.assertIn("{ name: 'finishedDate', label: '通关日期', type: 'date', value: ctx.today() }", self.source)
        self.assertIn("{ name: 'review', label: '一句话评价（可空）'", self.source)
        self.assertIn("setGameStatus(d, game.id, 'finished'", self.source)
        self.assertIn("createGame(d, {", self.source)

    def test_checkin_and_session_recalc(self):
        self.assertIn("title: '给《' + (game.name || '未命名') + '》记时长'", self.source)
        self.assertIn("{ name: 'minutes', label: '玩了多久（分钟）'", self.source)
        self.assertIn("{ name: 'date', label: '日期（可补记）', type: 'date', value: R.ctx.today() }", self.source)
        self.assertIn("addGameSession(d, game.id, minutes, date)", self.source)
        self.assertIn("updateGameSession(d, session.id, { minutes: value })", self.source)
        self.assertIn("deleteGameSession(d, session.id)", self.source)
        self.assertIn("recalcGameTotals(d, game.id)", self.source)
        self.assertIn("gameWeeklyMinutes(ctx.store.data, game.id, ctx.today())", self.source)

    def test_delete_game_cascade(self):
        self.assertIn("deleteGame(d, target.id)", self.source)
        self.assertIn("session._pendingDelete = true", self.source)
        self.assertIn("条时长明细一并删除", self.source)
        self.assertIn("onUndo", self.source)


class P4PersistenceTest(unittest.TestCase):
    """六模块样例数据经真实服务写入、落盘、重启后仍完整。"""

    def setUp(self):
        self.server = ServerProcess()
        self.server.start()

    def tearDown(self):
        self.server.cleanup()

    def test_six_modules_persist(self):
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        data = payload["data"]
        today = "2026-11-01"
        data["contents"].append({
            "id": "c1", "title": "发布稿", "platforms": ["bilibili"], "status": "published",
            "outline": "纲要", "body": "正文", "scheduledDate": today, "publishedDate": today,
            "link": "", "metrics": {"views": 120, "likes": 8, "comments": 3, "metricsUpdatedAt": "2026-11-01T10:00"},
            "createdAt": today, "updatedAt": today,
        })
        data["devProjects"].append({"id": "p1", "name": "项目", "intro": "", "status": "active", "createdAt": today, "updatedAt": today})
        data["devTasks"].append({"id": "t1", "projectId": "p1", "title": "任务", "note": "", "dueDate": today, "priority": "high", "done": True, "order": 0, "createdAt": today, "updatedAt": today})
        data["devLogs"].append({"id": "l1", "projectId": "p1", "date": today, "content": "写了", "blocker": "", "createdAt": today, "updatedAt": today})
        data["clients"].append({"id": "cl1", "name": "客户", "contact": "wx", "source": "", "requirement": "需求", "status": "following", "nextFollowupDate": today, "followupClearedAt": None, "createdAt": today, "updatedAt": today})
        data["consultSessions"].append({"id": "s1", "clientId": "cl1", "datetime": today + "T10:00", "topic": "议题", "conclusion": "", "nextStep": "", "nextFollowupDate": "2026-11-05", "createdAt": today, "updatedAt": today})
        data["workoutLogs"].append({"id": "w1", "date": today, "title": "胸+三头", "skipped": False, "exercises": [{"name": "卧推", "sets": [{"weight": 40, "reps": 10}], "durationMinutes": None}], "createdAt": today, "updatedAt": today})
        data["weightEntries"].append({"id": "we1", "date": today, "weight": 69.9, "createdAt": today, "updatedAt": today})
        data["mealLogs"].append({"id": "m1", "date": today, "mealType": "lunch", "items": ["鸡胸 + 米饭"], "createdAt": today, "updatedAt": today})
        data["mealTemplates"].append({"id": "mt1", "name": "减脂午餐", "items": ["鸡胸 + 米饭"], "createdAt": today, "updatedAt": today})
        data["waterLogs"].append({"id": "wl1", "date": today, "cups": 5, "createdAt": today, "updatedAt": today})
        data["games"].append({"id": "g1", "name": "游戏", "status": "playing", "progress": "第三章", "finishedDate": None, "review": "", "totalMinutes": 90, "createdAt": today, "updatedAt": today})
        data["gameSessions"].append({"id": "gs1", "gameId": "g1", "date": today, "minutes": 60, "createdAt": today, "updatedAt": today})
        status, saved = self.server.post_data(data, base=payload["updatedAt"])
        self.assertEqual(status, 200, saved)

        on_disk = self.server.read_file_json()
        for key in ["contents", "devProjects", "devTasks", "devLogs", "clients",
                    "consultSessions", "workoutLogs", "weightEntries", "mealLogs",
                    "mealTemplates", "waterLogs", "games", "gameSessions"]:
            self.assertGreaterEqual(len(on_disk[key]), 1, key)

        self.server.stop()
        self.server.start()
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        data = payload["data"]
        self.assertEqual(data["contents"][0]["metrics"]["views"], 120)
        self.assertEqual(data["devTasks"][0]["done"], True)
        self.assertEqual(data["consultSessions"][0]["nextFollowupDate"], "2026-11-05")
        self.assertEqual(data["workoutLogs"][0]["exercises"][0]["sets"][0]["weight"], 40)
        self.assertEqual(data["mealLogs"][0]["items"], ["鸡胸 + 米饭"])
        self.assertEqual(data["waterLogs"][0]["cups"], 5)
        self.assertEqual(data["games"][0]["totalMinutes"], 90)

    def test_initial_seven_templates(self):
        status, payload = self.server.get_data()
        self.assertEqual(status, 200)
        templates = payload["data"]["workoutTemplates"]
        self.assertEqual(len(templates), 7)
        self.assertEqual([t["dayOfWeek"] for t in templates], [1, 2, 3, 4, 5, 6, 7])
        for template in templates:
            self.assertEqual(template["title"], "")
            self.assertEqual(template["exercises"], [])


class P4NodeTest(unittest.TestCase):
    def test_models_js_suite(self):
        code, output = node_test("tests/js/models.test.mjs")
        self.assertEqual(code, 0, output)
        match = re.search(r"pass (\d+)", output)
        self.assertIsNotNone(match, output)
        self.assertGreaterEqual(int(match.group(1)), 8, output)
        self.assertIn("fail 0", output, output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
