// todoEngine.js 派生/写回/顺延/摘要测试（P3）
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addManualTodo,
  convertMemoToTodo,
  deriveTodos,
  getTodosFor,
  groupBySlot,
  restoreRollover,
  rolloverTodos,
  SLOT_LABELS,
  splitTodos,
  summaries,
  toggleTodo,
} from '../../static/js/todoEngine.js';

const TODAY = '2026-11-01';
const TOMORROW = '2026-11-02';

function baseData() {
  return {
    version: 1,
    todos: [], memos: [], contents: [],
    devProjects: [], devTasks: [], devLogs: [],
    clients: [], consultSessions: [],
    workoutTemplates: [], workoutLogs: [], weightEntries: [],
    mealLogs: [], mealTemplates: [], waterLogs: [],
    games: [], gameSessions: [],
    settings: {
      theme: 'light', dayRolloverHour: 4, waterGoal: 8, hiddenModules: [], welcomed: true,
    },
  };
}

function fixture() {
  const data = baseData();
  data.contents.push({
    id: 'c1', title: '测试稿', platforms: [], status: 'scheduled',
    outline: '', body: '', scheduledDate: TODAY, publishedDate: null, link: '',
    metrics: { views: 0, likes: 0, comments: 0, metricsUpdatedAt: null },
    createdAt: '2026-10-30T09:00:00', updatedAt: '2026-10-30T09:00:00',
  });
  data.devProjects.push({ id: 'p1', name: '项目 P1', intro: '', status: 'active', createdAt: '2026-10-30T08:00:00', updatedAt: '' });
  data.devTasks.push({
    id: 't1', projectId: 'p1', title: '任务 T1', note: '', dueDate: TODAY,
    priority: 'high', done: false, order: 0, createdAt: '2026-10-30T10:00:00', updatedAt: '',
  });
  data.clients.push({
    id: 'cl1', name: '客户 C1', contact: '', source: '', requirement: '',
    status: 'following', nextFollowupDate: TODAY, followupClearedAt: null,
    createdAt: '2026-10-30T11:00:00', updatedAt: '',
  });
  data.todos.push(
    { id: 'm1', title: '早上事项', source: 'manual', sourceId: null, planDate: TODAY, timeSlot: 'morning', priority: 'normal', done: false, doneAt: null, createdAt: '2026-10-30T07:00:00', updatedAt: '' },
    { id: 'm2', title: '白天高优先', source: 'manual', sourceId: null, planDate: TODAY, timeSlot: 'afternoon', priority: 'high', done: false, doneAt: null, createdAt: '2026-10-30T12:00:00', updatedAt: '' },
    { id: 'm3', title: '晚上事项', source: 'manual', sourceId: null, planDate: TODAY, timeSlot: 'evening', priority: 'normal', done: false, doneAt: null, createdAt: '2026-10-30T13:00:00', updatedAt: '' },
  );
  return data;
}

test('三源派生 + manual 合并：标题/来源/默认时段/优先级', () => {
  const data = fixture();
  const todos = getTodosFor(TODAY, data);
  assert.equal(todos.length, 6);
  const bySource = (source) => todos.filter((todo) => todo.source === source);
  assert.equal(bySource('selfmedia').length, 1);
  assert.equal(bySource('dev').length, 1);
  assert.equal(bySource('consult').length, 1);
  assert.equal(bySource('manual').length, 3);

  const media = bySource('selfmedia')[0];
  assert.equal(media.title, '发布：《测试稿》');
  assert.equal(media.timeSlot, 'afternoon');
  assert.equal(media.priority, 'normal');
  assert.equal(media.key, 'src:selfmedia:c1');
  assert.equal(media.done, false);

  const dev = bySource('dev')[0];
  assert.equal(dev.title, '开发：项目 P1 - 任务 T1');
  assert.equal(dev.timeSlot, 'afternoon');
  assert.equal(dev.priority, 'high');

  const consult = bySource('consult')[0];
  assert.equal(consult.title, '跟进客户：客户 C1');
  assert.equal(consult.timeSlot, 'afternoon');
});

test('隐藏模块：三个派生源与今日计划均跳过，数据本身不变', () => {
  const data = fixture();
  for (const moduleKey of ['selfmedia', 'dev', 'consult', 'today']) {
    data.settings.hiddenModules = [moduleKey];
    const todos = getTodosFor(TODAY, data);
    assert.equal(todos.some((todo) => todo.source === (moduleKey === 'today' ? 'manual' : moduleKey)), false);
  }
  data.settings.hiddenModules = ['selfmedia', 'dev', 'consult', 'today'];
  assert.equal(getTodosFor(TODAY, data).length, 0);
  assert.equal(data.contents.length, 1);
  assert.equal(data.todos.length, 3);
});

test('三段分组：组内高优先在前，再按创建时间升序', () => {
  const data = fixture();
  const { pending } = splitTodos(getTodosFor(TODAY, data));
  const groups = groupBySlot(pending);
  assert.equal(groups.morning.length, 1);
  assert.equal(groups.evening.length, 1);
  assert.equal(groups.afternoon.length, 4);
  // 高优先在前；同为高优先按 createdAt 升序（dev 10:00 早于 manual 12:00）
  assert.equal(groups.afternoon[0].title, '开发：项目 P1 - 任务 T1');
  assert.equal(groups.afternoon[0].priority, 'high');
  assert.equal(groups.afternoon[1].title, '白天高优先');
  assert.equal(groups.afternoon[2].title, '发布：《测试稿》');
  assert.equal(groups.afternoon[3].title, '跟进客户：客户 C1');
  assert.equal(SLOT_LABELS.morning, '早上');
});

test('splitTodos：已完成与未完成分开', () => {
  const data = fixture();
  data.todos[0].done = true;
  data.todos[0].doneAt = '2026-11-01T08:00:00';
  const { pending, done } = splitTodos(getTodosFor(TODAY, data));
  assert.equal(pending.length, 5);
  assert.equal(done.length, 1);
  assert.equal(done[0].title, '早上事项');
});

test('manual 勾选/取消：写回 done 与 doneAt', () => {
  const data = fixture();
  const todo = getTodosFor(TODAY, data).find((item) => item.id === 'm1');
  assert.equal(toggleTodo(todo, data, { date: TODAY }), true);
  const item = data.todos.find((x) => x.id === 'm1');
  assert.equal(item.done, true);
  assert.ok(item.doneAt);
  const doneTodo = getTodosFor(TODAY, data).find((x) => x.id === 'm1');
  assert.equal(toggleTodo(doneTodo, data, { date: TODAY }), false);
  assert.equal(item.done, false);
  assert.equal(item.doneAt, null);
});

test('开发任务勾选/取消：写回 devTasks.done', () => {
  const data = fixture();
  const todo = getTodosFor(TODAY, data).find((item) => item.source === 'dev');
  toggleTodo(todo, data, { date: TODAY });
  assert.equal(data.devTasks[0].done, true);
  toggleTodo({ ...todo, done: true }, data, { date: TODAY });
  assert.equal(data.devTasks[0].done, false);
});

test('自媒体勾选：无链接进已发布；取消退回待发布并保留链接/发布日期', () => {
  const data = fixture();
  const todo = getTodosFor(TODAY, data).find((item) => item.source === 'selfmedia');
  toggleTodo(todo, data, { date: TODAY });
  const content = data.contents[0];
  assert.equal(content.status, 'published');
  assert.equal(content.publishedDate, TODAY);
  assert.equal(content.link, '');

  toggleTodo({ ...todo, done: true }, data, { date: TODAY });
  assert.equal(content.status, 'scheduled');
  assert.equal(content.publishedDate, TODAY);
  assert.equal(content.link, '');
});

test('咨询勾选：只清提醒不建记录；取消恢复日期', () => {
  const data = fixture();
  const todo = getTodosFor(TODAY, data).find((item) => item.source === 'consult');
  toggleTodo(todo, data, { date: TODAY });
  const client = data.clients[0];
  assert.equal(client.nextFollowupDate, null);
  assert.equal(client.followupClearedAt, TODAY);
  assert.equal(data.consultSessions.length, 0, '不应产生咨询记录');
  const doneItems = getTodosFor(TODAY, data).filter((item) => item.source === 'consult');
  assert.equal(doneItems.length, 1);
  assert.equal(doneItems[0].done, true);

  toggleTodo({ ...todo, done: true }, data, { date: TODAY });
  assert.equal(client.nextFollowupDate, TODAY);
  assert.equal(client.followupClearedAt, null);
});

test('日终顺延：四类源字段改到明天，快照可完整还原', () => {
  const data = fixture();
  data.todos[0].done = true;
  const result = rolloverTodos(TODAY, TOMORROW, data);
  assert.equal(result.count, 5);
  assert.equal(data.todos.find((x) => x.id === 'm1').planDate, TODAY, '已完成项不应顺延');
  assert.equal(data.todos.find((x) => x.id === 'm2').planDate, TOMORROW);
  assert.equal(data.todos.find((x) => x.id === 'm3').planDate, TOMORROW);
  assert.equal(data.contents[0].scheduledDate, TOMORROW);
  assert.equal(data.devTasks[0].dueDate, TOMORROW);
  assert.equal(data.clients[0].nextFollowupDate, TOMORROW);

  assert.equal(getTodosFor(TODAY, data).filter((item) => !item.done).length, 0, '今天不再有未完成项');
  assert.equal(getTodosFor(TODAY, data).length, 1, '今天只剩已完成的那条');
  assert.equal(getTodosFor(TOMORROW, data).length, 5);

  restoreRollover(data, result.snapshot);
  assert.equal(data.todos.find((x) => x.id === 'm2').planDate, TODAY);
  assert.equal(data.contents[0].scheduledDate, TODAY);
  assert.equal(data.devTasks[0].dueDate, TODAY);
  assert.equal(data.clients[0].nextFollowupDate, TODAY);
});

test('摘要：六卡空状态文案', () => {
  const data = baseData();
  const s = summaries(data, TODAY, data.settings);
  assert.equal(s.selfmedia.text, '今天无发布计划');
  assert.equal(s.dev.text, '随手记未写');
  assert.equal(s.consult.text, '暂无待跟进');
  assert.equal(s.fitness.text, '今天未练');
  assert.equal(s.diet.text, '已记 0 餐 · 喝水 0/8 杯');
  assert.equal(s.game.text, '本周已玩 0 小时');
  assert.equal(s.game.minutes, 0);
});

test('摘要：自媒体未发/已发、开发已写、咨询前 3 天计数', () => {
  const data = baseData();
  data.contents.push(
    { id: 'c1', title: 'A', status: 'scheduled', scheduledDate: TODAY, publishedDate: null, platforms: [], metrics: {}, createdAt: '' },
    { id: 'c2', title: 'B', status: 'published', scheduledDate: null, publishedDate: TODAY, platforms: [], metrics: {}, createdAt: '' },
  );
  data.devLogs.push({ id: 'l1', projectId: 'p1', date: TODAY, content: '写了', blocker: '', createdAt: '' });
  data.clients.push(
    { id: 'cl1', name: '甲', nextFollowupDate: TODAY, status: 'following', createdAt: '2026-10-01' },
    { id: 'cl2', name: '乙', nextFollowupDate: '2026-11-04', status: 'following', createdAt: '2026-10-02' },
    { id: 'cl3', name: '丙', nextFollowupDate: '2026-11-05', status: 'following', createdAt: '2026-10-03' },
  );
  const s = summaries(data, TODAY, data.settings);
  assert.equal(s.selfmedia.text, '待发布 1 条（未发）');
  assert.equal(s.selfmedia.firstScheduledId, 'c1');
  assert.equal(s.selfmedia.publishedCount, 1);
  assert.equal(s.dev.text, '随手记已写');
  assert.equal(s.consult.count, 2);
  assert.equal(s.consult.text, '待跟进 2 人 · 甲');
  assert.equal(s.consult.dueClientId, 'cl1');
});

test('摘要：健身已练/没练；饮食餐数/杯数/目标；游戏本周求和且上周不计', () => {
  const data = baseData();
  data.workoutLogs.push({ id: 'w1', date: TODAY, title: '胸+三头', skipped: false, exercises: [], createdAt: '' });
  data.mealLogs.push(
    { id: 'ml1', date: TODAY, mealType: 'breakfast', items: ['燕麦 + 鸡蛋'], createdAt: '' },
    { id: 'ml2', date: TODAY, mealType: 'lunch', items: ['鸡胸 + 米饭'], createdAt: '' },
    { id: 'ml3', date: TODAY, mealType: 'dinner', items: [], createdAt: '' },
  );
  data.waterLogs.push({ id: 'wl1', date: TODAY, cups: 5, createdAt: '' });
  data.settings.waterGoal = 10;
  // 2026-11-01 是周日，本周一为 2026-10-26；上周为 10-19 ~ 10-25
  data.gameSessions.push(
    { id: 'g1', gameId: 'game1', date: '2026-10-28', minutes: 60, createdAt: '' },
    { id: 'g2', gameId: 'game1', date: TODAY, minutes: 30, createdAt: '' },
    { id: 'g3', gameId: 'game1', date: '2026-10-25', minutes: 120, createdAt: '' },
  );
  const s = summaries(data, TODAY, data.settings);
  assert.equal(s.fitness.text, '已练 · 胸+三头');
  assert.equal(s.fitness.trained, true);
  assert.equal(s.diet.text, '已记 2 餐 · 喝水 5/10 杯');
  assert.equal(s.game.minutes, 90);
  assert.equal(s.game.hours, 1.5);
  assert.equal(s.game.text, '本周已玩 1.5 小时');

  data.workoutLogs[0].skipped = true;
  const s2 = summaries(data, TODAY, data.settings);
  assert.equal(s2.fitness.text, '今天未练');
  assert.equal(s2.fitness.trained, false);
});

test('备忘转待办：原备忘保留并标已转，生成今日临时事项', () => {
  const data = baseData();
  data.memos.push({
    id: 'memo1', text: '冒出的想法', convertedToTodo: false, todoId: null,
    createdAt: '2026-11-01T08:00:00', updatedAt: '',
  });
  const todo = convertMemoToTodo(data, 'memo1', TODAY);
  assert.ok(todo);
  assert.equal(todo.title, '冒出的想法');
  assert.equal(todo.planDate, TODAY);
  assert.equal(todo.timeSlot, 'afternoon');
  assert.equal(data.memos[0].convertedToTodo, true);
  assert.equal(data.memos[0].todoId, todo.id);
  assert.equal(getTodosFor(TODAY, data).length, 1);
  assert.equal(convertMemoToTodo(data, 'memo1', TODAY), null, '不能重复转');
});

test('addManualTodo：标题必填、去空格、默认时段与优先级', () => {
  const data = baseData();
  assert.equal(addManualTodo(data, { title: '   ' }), null);
  const item = addManualTodo(data, { title: '  写周报  ', planDate: TODAY });
  assert.equal(item.title, '写周报');
  assert.equal(item.timeSlot, 'afternoon');
  assert.equal(item.priority, 'normal');
  assert.equal(item.done, false);
  const high = addManualTodo(data, { title: '交稿', planDate: TODAY, timeSlot: 'morning', priority: 'high' });
  assert.equal(high.timeSlot, 'morning');
  assert.equal(high.priority, 'high');
  assert.equal(data.todos.length, 2);
});

test('派生事项判断使用 planDate 过滤，其他日期不出现', () => {
  const data = fixture();
  assert.equal(getTodosFor('2026-11-02', data).length, 0);
});
