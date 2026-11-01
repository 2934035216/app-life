// models.js 六模块纯逻辑测试（P4a~P4f）
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GAME_STATUS,
  MEAL_TYPES,
  DEFAULT_PROJECT_NAME,
  addConsultSession,
  addGameSession,
  addLogExercise,
  addLogSet,
  addMealItem,
  addTemplateExercise,
  addWaterCup,
  addWorkItem,
  applyMealTemplate,
  buildWorkoutLogFromTemplate,
  clientSessions,
  contentPerformance,
  createClient,
  createContent,
  createGame,
  createMealTemplate,
  createProject,
  createTask,
  deleteClient,
  deleteConsultSession,
  deleteContent,
  deleteDevLog,
  deleteGame,
  deleteGameSession,
  deleteMealTemplate,
  deleteProject,
  deleteTask,
  deleteWorkoutLog,
  ensureMealLog,
  findDevLog,
  gameWeeklyMinutes,
  lastSessionDate,
  mealLogFor,
  moveDevLogDate,
  moveTask,
  moveWorkoutLogDate,
  platformLabel,
  projectProgress,
  projectTasks,
  publishContent,
  recalcGameTotals,
  removeLogExercise,
  removeMealItem,
  removeTemplateExercise,
  renameMealTemplate,
  setContentStatus,
  setGameStatus,
  setWaterCups,
  syncClientFollowup,
  templateForDate,
  toggleTask,
  updateClient,
  updateConsultSession,
  updateContent,
  updateContentMetrics,
  updateGame,
  updateGameSession,
  updateProject,
  updateTask,
  updateTemplate,
  updateWeight,
  updateWorkoutLog,
  upsertDevLog,
  upsertWeight,
  waterCups,
  weeklyMinutes,
  weightChart,
  workoutLogForDate,
} from '../../static/js/models.js';

const TODAY = '2026-11-01';
const WEEK_START = '2026-10-26';

function baseData() {
  const data = {
    contents: [], memos: [],
    devProjects: [], devTasks: [], devLogs: [],
    clients: [], consultSessions: [],
    workoutTemplates: [], workoutLogs: [], weightEntries: [],
    mealLogs: [], mealTemplates: [], waterLogs: [],
    games: [], gameSessions: [],
    settings: { theme: 'light', dayRolloverHour: 4, waterGoal: 8, hiddenModules: [] },
  };
  for (let day = 1; day <= 7; day += 1) {
    data.workoutTemplates.push({
      id: 'wt-' + day, dayOfWeek: day, title: '', isRestDay: false,
      exercises: [], createdAt: '', updatedAt: '',
    });
  }
  return data;
}

/* ---------------- P4a 自媒体 ---------------- */
test('自媒体：创建/编辑/发布/取消/回填/删除', () => {
  const data = baseData();
  const content = createContent(data, { title: '第一稿', platforms: ['bilibili', 'wechat'] });
  assert.equal(content.status, 'idea');
  assert.equal(content.metrics.views, 0);
  assert.equal(content.scheduledDate, null);
  assert.equal(platformLabel('xhs'), '小红书');

  updateContent(data, content.id, { status: 'scheduled', scheduledDate: TODAY, body: '正文' });
  assert.equal(data.contents[0].status, 'scheduled');
  assert.equal(data.contents[0].body, '正文');

  const published = publishContent(data, content.id, { publishedDate: TODAY, link: '' });
  assert.equal(published.status, 'published');
  assert.equal(published.publishedDate, TODAY);
  assert.equal(published.link, '');
  assert.ok(published.updatedAt);

  updateContentMetrics(data, content.id, { views: 120, likes: 8, comments: 3 });
  assert.equal(data.contents[0].metrics.views, 120);
  assert.equal(data.contents[0].metrics.likes, 8);
  assert.ok(data.contents[0].metrics.metricsUpdatedAt);

  updateContentMetrics(data, content.id, { views: 300 });
  assert.equal(data.contents[0].metrics.views, 300);
  assert.equal(data.contents[0].metrics.likes, 8, '多次回填只覆盖传入字段');

  setContentStatus(data, content.id, 'scheduled');
  assert.equal(data.contents[0].status, 'scheduled');

  assert.equal(deleteContent(data, content.id), true);
  assert.equal(data.contents.length, 0);
});

/* ---------------- P4b 开发工作 ---------------- */
test('开发工作：项目进度/状态/任务排序/日志唯一/级联删除', () => {
  const data = baseData();
  const project = createProject(data, { name: '项目 P1', intro: '做点东西' });
  assert.equal(project.status, 'active');
  const t1 = createTask(data, project.id, { title: '任务 A', dueDate: TODAY, priority: 'high' });
  const t2 = createTask(data, project.id, { title: '任务 B' });
  const t3 = createTask(data, project.id, { title: '任务 C' });
  assert.equal(t1.order, 0);
  assert.equal(t2.order, 1);
  assert.equal(t3.order, 2);

  toggleTask(data, t1.id, true);
  toggleTask(data, t2.id, true);
  assert.deepEqual(projectProgress(data, project.id), { done: 2, total: 3 });
  toggleTask(data, t1.id, false);
  assert.deepEqual(projectProgress(data, project.id), { done: 1, total: 3 });

  updateTask(data, t2.id, { title: '任务 B2' });
  assert.equal(data.devTasks.find((x) => x.id === t2.id).title, '任务 B2');

  moveTask(data, t3.id, 0);
  assert.deepEqual(projectTasks(data, project.id).map((x) => x.id), [t3.id, t1.id, t2.id]);
  assert.deepEqual(projectTasks(data, project.id).map((x) => x.order), [0, 1, 2]);

  updateProject(data, project.id, { status: 'done' });
  assert.equal(data.devProjects[0].status, 'done');

  const log1 = upsertDevLog(data, project.id, '2026-10-31', { content: '昨天' });
  const same = upsertDevLog(data, project.id, '2026-10-31', { content: '昨天更新', blocker: '卡点' });
  assert.equal(same.id, log1.id, '同日重复写入应为更新');
  assert.equal(data.devLogs.length, 1);
  assert.equal(data.devLogs[0].content, '昨天更新');
  assert.equal(findDevLog(data, project.id, '2026-10-31').blocker, '卡点');

  const log2 = upsertDevLog(data, project.id, TODAY, { content: '今天' });
  moveDevLogDate(data, log1.id, TODAY);
  assert.equal(data.devLogs.length, 1, '移到已有日期应合并');
  assert.equal(data.devLogs[0].id, log2.id);
  assert.equal(data.devLogs[0].content, '昨天更新');
  deleteDevLog(data, log2.id);
  assert.equal(data.devLogs.length, 0);

  const another = createTask(data, project.id, { title: '任务 D' });
  assert.equal(deleteTask(data, another.id), true);

  deleteProject(data, project.id);
  assert.equal(data.devProjects.length, 0);
  assert.equal(data.devTasks.length, 0, '删除项目级联任务');
  assert.equal(data.devLogs.length, 0, '删除项目级联日志');
});

test('开发工作：没有项目也能新增工作项（自动建「我的工作」并进入列表）', () => {
  const data = baseData();
  const first = addWorkItem(data, null, { title: '第一件事', dueDate: TODAY, priority: 'high' });
  assert.equal(data.devProjects.length, 1, '没有项目时应自动建一个项目');
  assert.equal(data.devProjects[0].name, DEFAULT_PROJECT_NAME);
  assert.equal(first.createdProject.id, data.devProjects[0].id);
  assert.equal(first.projectId, data.devProjects[0].id);
  assert.equal(first.task.projectId, first.projectId);
  assert.equal(first.task.title, '第一件事');
  assert.equal(first.task.dueDate, TODAY);
  assert.equal(first.task.priority, 'high');
  assert.deepEqual(projectTasks(data, first.projectId).map((t) => t.title), ['第一件事']);
  assert.deepEqual(projectProgress(data, first.projectId), { done: 0, total: 1 });

  const second = addWorkItem(data, null, { title: '第二件事' });
  assert.equal(data.devProjects.length, 1, '已有项目时不应重复建默认项目');
  assert.equal(second.createdProject, null);
  assert.equal(second.projectId, first.projectId);
  assert.deepEqual(projectTasks(data, second.projectId).map((t) => t.title), ['第一件事', '第二件事']);

  const other = createProject(data, { name: '项目 B' });
  const third = addWorkItem(data, other.id, { title: '第三件事' });
  assert.equal(third.projectId, other.id);
  assert.deepEqual(projectTasks(data, other.id).map((t) => t.title), ['第三件事']);

  other._pendingDelete = true;
  const fourth = addWorkItem(data, other.id, { title: '第四件事' });
  assert.equal(fourth.projectId, first.projectId, '目标项目已挂起时退回可见项目');
  assert.equal(projectTasks(data, fourth.projectId).some((t) => t.title === '第四件事'), true);
});

/* ---------------- P4c 咨询工作 ---------------- */
test('咨询工作：新增记录同步跟进日期，删除回退次新，删除客户级联', () => {
  const data = baseData();
  const client = createClient(data, { name: '客户 C1', requirement: '要一套方案' });
  assert.equal(client.status, 'following');

  updateClient(data, client.id, { contact: 'wx-123' });
  assert.equal(data.clients[0].contact, 'wx-123');

  const s1 = addConsultSession(data, client.id, {
    datetime: '2026-10-30T14:00', topic: '初次沟通',
    nextFollowupDate: '2026-11-05',
  });
  assert.equal(data.clients[0].nextFollowupDate, '2026-11-05');
  assert.equal(lastSessionDate(data, client.id), '2026-10-30');

  const s2 = addConsultSession(data, client.id, {
    datetime: '2026-11-01T10:00', topic: '方案评审',
    nextFollowupDate: '2026-11-08',
  });
  assert.equal(s2.clientId, client.id);
  assert.equal(data.clients[0].nextFollowupDate, '2026-11-08');
  assert.equal(clientSessions(data, client.id).length, 2);
  assert.equal(clientSessions(data, client.id)[0].id, s2.id, '时间线最新在前');

  updateConsultSession(data, s2.id, { nextFollowupDate: '2026-11-10' });
  assert.equal(data.clients[0].nextFollowupDate, '2026-11-10');

  deleteConsultSession(data, s2.id);
  assert.equal(data.clients[0].nextFollowupDate, '2026-11-05', '删最新取次新值');
  deleteConsultSession(data, s1.id);
  assert.equal(data.clients[0].nextFollowupDate, null, '无记录则清空');

  const s3 = addConsultSession(data, client.id, { datetime: '2026-11-01T11:00' });
  const other = createClient(data, { name: '客户 C2' });
  const keep = addConsultSession(data, other.id, { datetime: '2026-11-01T12:00', topic: '别人的记录' });
  deleteClient(data, client.id);
  assert.equal(data.clients.length, 1, '只删除目标客户');
  assert.equal(data.clients[0].id, other.id);
  assert.equal(clientSessions(data, client.id).length, 0, '删除客户级联咨询记录');
  assert.equal(clientSessions(data, other.id).length, 1, '不误删其他客户的记录');
  assert.equal(data.consultSessions.length, 1);
  assert.equal(data.consultSessions[0].id, keep.id);
  assert.equal(s3.clientId, client.id);
});

test('咨询工作：空跟进日期会清空客户提醒', () => {
  const data = baseData();
  const client = createClient(data, { name: '甲', nextFollowupDate: TODAY });
  const session = addConsultSession(data, client.id, { datetime: '2026-11-01T09:00', nextFollowupDate: null });
  assert.equal(data.clients[0].nextFollowupDate, null);
  assert.equal(data.clients[0].followupClearedAt, null);
  syncClientFollowup(data, client.id);
  assert.equal(data.clients[0].nextFollowupDate, null);
  assert.equal(session.nextFollowupDate, null);
});

/* ---------------- P4d 健身 ---------------- */
test('健身：七天模板、按星期带出打卡、同日唯一、改期合并', () => {
  const data = baseData();
  assert.equal(data.workoutTemplates.length, 7);
  assert.equal(templateForDate(data, TODAY).dayOfWeek, 7, '2026-11-01 是周日');
  assert.equal(templateForDate(data, '2026-10-31').dayOfWeek, 6, '周六');

  updateTemplate(data, 7, { title: '胸+三头', isRestDay: false });
  addTemplateExercise(data, 7);
  const ex = data.workoutTemplates[6].exercises[0];
  ex.name = '卧推';
  ex.sets = 3;
  ex.reps = 10;
  removeTemplateExercise(data, 7, 0);
  assert.equal(data.workoutTemplates[6].exercises.length, 0);

  addTemplateExercise(data, 7);
  data.workoutTemplates[6].exercises[0] = { name: '卧推', sets: 3, reps: 10, durationMinutes: null };
  updateTemplate(data, 7, { title: '胸+三头' });

  const log = buildWorkoutLogFromTemplate(data, TODAY);
  assert.equal(log.title, '胸+三头');
  assert.equal(log.date, TODAY);
  assert.equal(log.skipped, false);
  assert.equal(log.exercises.length, 1);
  assert.equal(log.exercises[0].name, '卧推');
  assert.equal(log.exercises[0].sets.length, 3);
  assert.deepEqual(log.exercises[0].sets[0], { weight: 0, reps: 10 });

  const again = buildWorkoutLogFromTemplate(data, TODAY);
  assert.equal(again.id, log.id, '同日重复打卡=编辑已有');
  assert.equal(data.workoutLogs.length, 1);
  assert.equal(workoutLogForDate(data, TODAY).id, log.id);

  updateWorkoutLog(data, log.id, { skipped: true, title: '改成没练' });
  assert.equal(data.workoutLogs[0].skipped, true);

  addLogExercise(data, log.id);
  assert.equal(data.workoutLogs[0].exercises.length, 2);
  addLogSet(data, log.id, 1);
  assert.equal(data.workoutLogs[0].exercises[1].sets.length, 2);
  removeLogExercise(data, log.id, 1);
  assert.equal(data.workoutLogs[0].exercises.length, 1);

  const yesterday = buildWorkoutLogFromTemplate(data, '2026-10-31');
  updateWorkoutLog(data, yesterday.id, { title: '昨天训练', skipped: true });
  assert.equal(data.workoutLogs.length, 2);
  moveWorkoutLogDate(data, yesterday.id, TODAY);
  assert.equal(data.workoutLogs.length, 1, '改到已有日期应合并');
  assert.equal(data.workoutLogs[0].id, log.id, '保留目标日期的记录');
  assert.equal(data.workoutLogs[0].title, '昨天训练', '合并时以被移动的记录内容为准');
  assert.equal(data.workoutLogs[0].skipped, true);

  deleteWorkoutLog(data, log.id);
  assert.equal(data.workoutLogs.length, 0);
});

test('健身：同一天体重只留最后一条，30 天折线三点归一', () => {
  const data = baseData();
  const first = upsertWeight(data, TODAY, 70.04);
  assert.equal(data.weightEntries.length, 1);
  assert.equal(first.weight, 70);
  const second = upsertWeight(data, TODAY, 69.86);
  assert.equal(data.weightEntries.length, 1, '同日两次只留一条');
  assert.equal(data.weightEntries[0].weight, 69.9);

  data.weightEntries.push({ id: 'w2', date: '2026-10-30', weight: 71, createdAt: '', updatedAt: '' });
  data.weightEntries.push({ id: 'w3', date: '2026-10-31', weight: 70.5, createdAt: '', updatedAt: '' });
  const chart = weightChart(data.weightEntries.filter((x) => !x._pendingDelete), TODAY, 30);
  assert.equal(chart.points.length, 3);
  assert.deepEqual(chart.points.map((p) => p.date), ['2026-10-30', '2026-10-31', TODAY]);
  assert.equal(chart.width, 100);
  assert.equal(chart.height, 40);
  chart.points.forEach((point) => {
    assert.ok(point.x >= 0 && point.x <= 100);
    assert.ok(point.y >= 0 && point.y <= 40);
  });
  assert.ok(chart.points[2].x > chart.points[1].x);
  assert.ok(chart.min < 69.9 && chart.max > 71);

  updateWeight(data, data.weightEntries.find((x) => x.date === '2026-10-30').id, 72);
  const chart2 = weightChart(data.weightEntries, TODAY, 30);
  assert.equal(chart2.points[0].weight, 72);

  data.weightEntries.push({ id: 'w4', date: '2026-11-01', weight: 69.9, _pendingDelete: true });
  const chart3 = weightChart(data.weightEntries, TODAY, 30);
  assert.equal(chart3.points.filter((p) => p.date === TODAY).length, 1);
});

/* ---------------- P4e 饮食 ---------------- */
test('饮食：四餐回车添加/删除，模板存取与整套填入，喝水打点与上限', () => {
  const data = baseData();
  assert.deepEqual(MEAL_TYPES.map((x) => x.key), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.equal(mealLogFor(data, TODAY, 'lunch'), null);
  assert.equal(addMealItem(data, TODAY, 'lunch', '   '), null);
  const item = addMealItem(data, TODAY, 'lunch', '鸡胸 + 米饭');
  assert.ok(item);
  assert.equal(data.mealLogs.length, 1);
  assert.deepEqual(data.mealLogs[0].items, ['鸡胸 + 米饭']);

  addMealItem(data, TODAY, 'breakfast', '燕麦 + 鸡蛋');
  assert.equal(data.mealLogs.length, 2);

  const ensureAgain = ensureMealLog(data, TODAY, 'lunch');
  assert.equal(data.mealLogs.length, 2, '同一餐只建一条');

  removeMealItem(data, TODAY, 'lunch', 0);
  assert.deepEqual(mealLogFor(data, TODAY, 'lunch').items, []);

  const template = createMealTemplate(data, '减脂午餐A', ['鸡胸 + 米饭', '西兰花']);
  assert.equal(data.mealTemplates.length, 1);
  renameMealTemplate(data, template.id, '减脂午餐B');
  assert.equal(data.mealTemplates[0].name, '减脂午餐B');

  applyMealTemplate(data, TODAY, 'lunch', template.id);
  assert.deepEqual(mealLogFor(data, TODAY, 'lunch').items, ['鸡胸 + 米饭', '西兰花']);
  applyMealTemplate(data, TODAY, 'lunch', template.id);
  assert.deepEqual(mealLogFor(data, TODAY, 'lunch').items, ['鸡胸 + 米饭', '西兰花'], '重复填入不重复条目');

  applyMealTemplate(data, '2026-10-30', 'dinner', template.id);
  assert.equal(data.mealLogs.length, 3);

  deleteMealTemplate(data, template.id);
  assert.equal(data.mealTemplates.length, 0);

  assert.equal(waterCups(data, TODAY), 0);
  setWaterCups(data, TODAY, 5, 8);
  assert.equal(waterCups(data, TODAY), 5);
  addWaterCup(data, TODAY, 8);
  assert.equal(waterCups(data, TODAY), 6);
  addWaterCup(data, TODAY, 8);
  addWaterCup(data, TODAY, 8);
  assert.equal(waterCups(data, TODAY), 8);
  addWaterCup(data, TODAY, 8);
  assert.equal(waterCups(data, TODAY), 8, '不超过目标杯数');
  setWaterCups(data, TODAY, -3, 8);
  assert.equal(waterCups(data, TODAY), 0);
  assert.equal(data.waterLogs.length, 1, '同一天只有一条 WaterLog');
});

/* ---------------- P4f 游戏娱乐 ---------------- */
test('游戏：三状态流转、累计时长重算、删除级联、本周求和排除上周', () => {
  const data = baseData();
  assert.equal(GAME_STATUS.wishlist, '想玩');
  const game = createGame(data, { name: '游戏 A', progress: '第三章' });
  assert.equal(game.status, 'wishlist');
  assert.equal(game.totalMinutes, 0);

  updateGame(data, game.id, { status: 'playing' });
  assert.equal(data.games[0].status, 'playing');

  addGameSession(data, game.id, 60, TODAY);
  assert.equal(data.games[0].totalMinutes, 60);
  addGameSession(data, game.id, 30, '2026-10-31');
  assert.equal(data.games[0].totalMinutes, 90, '打卡 60 + 补记昨天 30');
  addGameSession(data, game.id, 0, TODAY);
  assert.equal(data.games[0].totalMinutes, 90, '0 分钟不记录');
  addGameSession(data, game.id, 120, '2026-10-25');
  assert.equal(data.games[0].totalMinutes, 210);

  assert.equal(gameWeeklyMinutes(data, game.id, TODAY), 90, '本周只算 10-26 之后');
  assert.equal(weeklyMinutes(data, TODAY), 90);

  const session = data.gameSessions.find((x) => x.date === TODAY);
  updateGameSession(data, session.id, { minutes: 100 });
  assert.equal(data.games[0].totalMinutes, 250);

  const second = data.gameSessions.find((x) => x.date === '2026-10-31');
  deleteGameSession(data, second.id);
  assert.equal(data.games[0].totalMinutes, 220, '删除明细重算累计');

  const pending = data.gameSessions.find((x) => x.date === TODAY);
  pending._pendingDelete = true;
  recalcGameTotals(data, game.id);
  assert.equal(data.games[0].totalMinutes, 120, '挂起删除的明细不计入合计');
  assert.equal(gameWeeklyMinutes(data, game.id, TODAY), 0);

  setGameStatus(data, game.id, 'finished', { finishedDate: TODAY, review: '好玩' });
  assert.equal(data.games[0].status, 'finished');
  assert.equal(data.games[0].finishedDate, TODAY);
  assert.equal(data.games[0].review, '好玩');

  const extraSession = addGameSession(data, game.id, 45, TODAY);
  assert.equal(data.games[0].totalMinutes, 165);
  assert.equal(data.gameSessions.filter((x) => !x._pendingDelete).length, 2);

  deleteGame(data, game.id);
  assert.equal(data.games.length, 0);
  assert.equal(data.gameSessions.length, 0, '删除游戏级联时长明细');
  assert.ok(extraSession);
});

/* ---------------- 自媒体：发布后数据图表 ---------------- */
test('自媒体：发布后数据只汇总已发布、按日期倒序并可空态', () => {
  const data = baseData();
  const empty = contentPerformance(data.contents);
  assert.equal(empty.publishedCount, 0);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.hasData, false, '没有已发布内容时为图表空态');
  assert.deepEqual(empty.totals, { views: 0, likes: 0, comments: 0 });

  const first = createContent(data, { title: '旧视频' });
  publishContent(data, first.id, { publishedDate: '2026-10-20', link: '' });
  updateContentMetrics(data, first.id, { views: 120, likes: 9, comments: 2 });

  const second = createContent(data, { title: '新视频' });
  publishContent(data, second.id, { publishedDate: '2026-10-31', link: '' });
  updateContentMetrics(data, second.id, { views: 320, likes: 15, comments: 4 });

  createContent(data, { title: '还在选题池' });
  const pending = createContent(data, { title: '挂起删除' });
  publishContent(data, pending.id, { publishedDate: '2026-10-25', link: '' });
  updateContentMetrics(data, pending.id, { views: 999, likes: 99, comments: 99 });
  pending._pendingDelete = true;

  const perf = contentPerformance(data.contents);
  assert.equal(perf.publishedCount, 2, '未发布与挂起删除的条目不进图表');
  assert.deepEqual(perf.items.map((item) => item.title), ['新视频', '旧视频']);
  assert.deepEqual(perf.totals, { views: 440, likes: 24, comments: 6 });
  assert.deepEqual(perf.max, { views: 320, likes: 15, comments: 4 });
  assert.equal(perf.hasData, true);

  const limited = contentPerformance(data.contents, 1);
  assert.equal(limited.items.length, 1);
  assert.equal(limited.items[0].title, '新视频');
  assert.deepEqual(limited.totals, { views: 320, likes: 15, comments: 4 });

  updateContentMetrics(data, second.id, { views: -5 });
  assert.equal(contentPerformance(data.contents).items[0].views, 0, '负数回填按 0 展示');
});
