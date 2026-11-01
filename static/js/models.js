// models.js —— 各模块实体的纯函数操作（不碰 DOM，可在 Node 中直接测试）
import {
  addDays,
  clone,
  isoDayOfWeek,
  lastNDates,
  nowDate,
  nowDateTimeLocal,
  nowISO,
  today as todayFn,
  uid,
  weekStart,
} from './utils.js';

export function touch(obj) {
  if (obj) obj.updatedAt = nowISO();
  return obj;
}

function base(prefix) {
  const stamp = nowISO();
  return { id: uid(prefix), createdAt: stamp, updatedAt: stamp };
}

export function findById(arr, id) {
  return (arr || []).find((item) => item && item.id === id) || null;
}

export function removeItem(arr, id) {
  const index = (arr || []).findIndex((item) => item && item.id === id);
  if (index >= 0) arr.splice(index, 1);
  return index >= 0;
}

/* ============ 备忘 ============ */
export function createMemo(data, text) {
  const item = Object.assign(base('memo'), {
    text: String(text || '').trim(),
    convertedToTodo: false,
    todoId: null,
  });
  data.memos.push(item);
  return item;
}

export function deleteMemo(data, id) {
  return removeItem(data.memos, id);
}

/* ============ 自媒体 ============ */
export const CONTENT_STATUS = {
  idea: '选题池',
  writing: '写稿中',
  scheduled: '待发布',
  published: '已发布',
};

export const PLATFORM_OPTIONS = [
  { key: 'bilibili', label: 'B 站' },
  { key: 'wechat', label: '公众号' },
  { key: 'xhs', label: '小红书' },
  { key: 'douyin', label: '抖音' },
  { key: 'other', label: '其他' },
];

export function platformLabel(key) {
  const found = PLATFORM_OPTIONS.find((item) => item.key === key);
  return found ? found.label : key;
}

export function createContent(data, fields = {}) {
  const item = Object.assign(base('content'), {
    title: '',
    platforms: [],
    status: 'idea',
    outline: '',
    body: '',
    scheduledDate: null,
    publishedDate: null,
    link: '',
    metrics: { views: 0, likes: 0, comments: 0, metricsUpdatedAt: null },
  }, fields);
  if (!item.metrics) item.metrics = { views: 0, likes: 0, comments: 0, metricsUpdatedAt: null };
  data.contents.push(item);
  return item;
}

export function updateContent(data, id, patch) {
  const item = findById(data.contents, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function publishContent(data, id, info = {}) {
  const item = findById(data.contents, id);
  if (!item) return null;
  item.status = 'published';
  item.publishedDate = info.publishedDate || nowDate();
  if (info.link !== undefined) item.link = String(info.link || '');
  return touch(item);
}

export function setContentStatus(data, id, status) {
  if (status === 'published') return publishContent(data, id, {});
  return updateContent(data, id, { status });
}

export function updateContentMetrics(data, id, patch) {
  const item = findById(data.contents, id);
  if (!item) return null;
  item.metrics = Object.assign({}, item.metrics, patch);
  item.metrics.metricsUpdatedAt = nowDateTimeLocal();
  return touch(item);
}

export function deleteContent(data, id) {
  return removeItem(data.contents, id);
}

/** 已发布内容的表现汇总：只统计已发布且未挂起删除的条目，数据来自手动回填 */
export function contentPerformance(contents, limit = 8) {
  const published = (contents || []).filter((item) => (
    item && item.status === 'published' && !item._pendingDelete
  ));
  const sorted = published.slice().sort((a, b) => (
    String(b.publishedDate || '').localeCompare(String(a.publishedDate || ''))
  ));
  const take = Math.max(1, Math.floor(Number(limit) || 8));
  const items = sorted.slice(0, take).map((item) => {
    const metrics = item.metrics || {};
    return {
      id: item.id,
      title: item.title || '（未命名）',
      publishedDate: item.publishedDate || null,
      views: Math.max(0, Math.floor(Number(metrics.views) || 0)),
      likes: Math.max(0, Math.floor(Number(metrics.likes) || 0)),
      comments: Math.max(0, Math.floor(Number(metrics.comments) || 0)),
    };
  });
  const totals = items.reduce((acc, item) => {
    acc.views += item.views;
    acc.likes += item.likes;
    acc.comments += item.comments;
    return acc;
  }, { views: 0, likes: 0, comments: 0 });
  const max = {
    views: Math.max(0, ...items.map((item) => item.views)),
    likes: Math.max(0, ...items.map((item) => item.likes)),
    comments: Math.max(0, ...items.map((item) => item.comments)),
  };
  return {
    items,
    totals,
    max,
    hasData: items.some((item) => item.views || item.likes || item.comments),
    publishedCount: published.length,
  };
}

/* ============ 开发工作 ============ */
export function createProject(data, fields = {}) {
  const item = Object.assign(base('proj'), {
    name: '',
    intro: '',
    status: 'active',
  }, fields);
  data.devProjects.push(item);
  return item;
}

export function updateProject(data, id, patch) {
  const item = findById(data.devProjects, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function deleteProject(data, id) {
  removeItem(data.devProjects, id);
  data.devTasks = data.devTasks.filter((task) => task.projectId !== id);
  data.devLogs = data.devLogs.filter((log) => log.projectId !== id);
}

export function projectTasks(data, projectId) {
  return (data.devTasks || [])
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function projectProgress(data, projectId) {
  const tasks = projectTasks(data, projectId);
  const done = tasks.filter((task) => task.done).length;
  return { done, total: tasks.length };
}

export function createTask(data, projectId, fields = {}) {
  const tasks = projectTasks(data, projectId);
  const order = tasks.length ? tasks[tasks.length - 1].order + 1 : 0;
  const item = Object.assign(base('task'), {
    projectId,
    title: '',
    note: '',
    dueDate: null,
    priority: 'normal',
    done: false,
    order,
  }, fields);
  data.devTasks.push(item);
  return item;
}

export function updateTask(data, id, patch) {
  const item = findById(data.devTasks, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function toggleTask(data, id, done) {
  const item = findById(data.devTasks, id);
  if (!item) return null;
  item.done = done === undefined ? !item.done : Boolean(done);
  return touch(item);
}

export function deleteTask(data, id) {
  return removeItem(data.devTasks, id);
}

export function moveTask(data, id, targetIndex) {
  const task = findById(data.devTasks, id);
  if (!task) return;
  const tasks = projectTasks(data, task.projectId);
  const from = tasks.findIndex((item) => item.id === id);
  if (from < 0) return;
  tasks.splice(from, 1);
  const index = Math.max(0, Math.min(targetIndex, tasks.length));
  tasks.splice(index, 0, task);
  tasks.forEach((item, i) => { item.order = i; });
}

export function findDevLog(data, projectId, date) {
  return (data.devLogs || []).find((log) => log.projectId === projectId && log.date === date) || null;
}

export function upsertDevLog(data, projectId, date, fields = {}) {
  const existing = findDevLog(data, projectId, date);
  if (existing) {
    if (fields.content !== undefined) existing.content = fields.content;
    if (fields.blocker !== undefined) existing.blocker = fields.blocker;
    return touch(existing);
  }
  const item = Object.assign(base('log'), {
    projectId,
    date,
    content: '',
    blocker: '',
  }, fields);
  data.devLogs.push(item);
  return item;
}

export function updateDevLog(data, id, patch) {
  const item = findById(data.devLogs, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function moveDevLogDate(data, id, newDate) {
  const item = findById(data.devLogs, id);
  if (!item || item.date === newDate) return item;
  const conflict = (data.devLogs || []).find(
    (log) => log.id !== id && log.projectId === item.projectId && log.date === newDate
  );
  if (conflict) {
    conflict.content = item.content;
    conflict.blocker = item.blocker;
    touch(conflict);
    removeItem(data.devLogs, id);
    return conflict;
  }
  item.date = newDate;
  return touch(item);
}

export function deleteDevLog(data, id) {
  return removeItem(data.devLogs, id);
}

/* ============ 咨询工作 ============ */
export const CLIENT_STATUS = { following: '跟进中', deal: '已成交', paused: '暂停' };

export function createClient(data, fields = {}) {
  const item = Object.assign(base('client'), {
    name: '',
    contact: '',
    source: '',
    requirement: '',
    status: 'following',
    nextFollowupDate: null,
    followupClearedAt: null,
  }, fields);
  data.clients.push(item);
  return item;
}

export function updateClient(data, id, patch) {
  const item = findById(data.clients, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function clientSessions(data, clientId) {
  return (data.consultSessions || [])
    .filter((session) => session.clientId === clientId && !session._pendingDelete)
    .sort((a, b) => String(b.datetime || '').localeCompare(String(a.datetime || ''))
      || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/** 最新一条咨询记录的 nextFollowupDate 同步到客户；无记录则 null（W5） */
export function syncClientFollowup(data, clientId) {
  const client = findById(data.clients, clientId);
  if (!client) return null;
  const sessions = clientSessions(data, clientId);
  const latest = sessions[0];
  client.nextFollowupDate = latest ? (latest.nextFollowupDate || null) : null;
  return touch(client);
}

export function addConsultSession(data, clientId, fields = {}) {
  const item = Object.assign(base('session'), {
    clientId,
    datetime: nowDateTimeLocal(),
    topic: '',
    conclusion: '',
    nextStep: '',
    nextFollowupDate: null,
  }, fields);
  data.consultSessions.push(item);
  const client = findById(data.clients, clientId);
  if (client) client.followupClearedAt = null;
  syncClientFollowup(data, clientId);
  return item;
}

export function updateConsultSession(data, id, patch) {
  const item = findById(data.consultSessions, id);
  if (!item) return null;
  Object.assign(item, patch);
  touch(item);
  syncClientFollowup(data, item.clientId);
  return item;
}

export function deleteConsultSession(data, id) {
  const item = findById(data.consultSessions, id);
  if (!item) return false;
  removeItem(data.consultSessions, id);
  syncClientFollowup(data, item.clientId);
  return true;
}

export function deleteClient(data, id) {
  removeItem(data.clients, id);
  data.consultSessions = data.consultSessions.filter((session) => session.clientId !== id);
}

export function lastSessionDate(data, clientId) {
  const sessions = clientSessions(data, clientId);
  return sessions.length ? String(sessions[0].datetime || '').slice(0, 10) : null;
}

/* ============ 健身 ============ */
export function templateForDate(data, date) {
  const day = isoDayOfWeek(date);
  return (data.workoutTemplates || []).find((item) => item.dayOfWeek === day) || null;
}

export function updateTemplate(data, dayOfWeek, patch) {
  const item = (data.workoutTemplates || []).find((t) => t.dayOfWeek === dayOfWeek);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function addTemplateExercise(data, dayOfWeek) {
  const item = (data.workoutTemplates || []).find((t) => t.dayOfWeek === dayOfWeek);
  if (!item) return null;
  item.exercises.push({ name: '', sets: 3, reps: 10, durationMinutes: null });
  return touch(item);
}

export function removeTemplateExercise(data, dayOfWeek, index) {
  const item = (data.workoutTemplates || []).find((t) => t.dayOfWeek === dayOfWeek);
  if (!item) return null;
  item.exercises.splice(index, 1);
  return touch(item);
}

export function workoutLogForDate(data, date) {
  return (data.workoutLogs || []).find((log) => log.date === date && !log._pendingDelete) || null;
}

/** "今天打卡"：按当天模板复制出初始打卡（同一天重复打卡=编辑已有，W7） */
export function buildWorkoutLogFromTemplate(data, date) {
  const existing = workoutLogForDate(data, date);
  if (existing) return existing;
  const template = templateForDate(data, date);
  const exercises = [];
  if (template) {
    (template.exercises || []).forEach((ex) => {
      const sets = [];
      if (ex.durationMinutes != null && ex.durationMinutes !== '') {
        // 计时类动作：sets 留空，记录时长
      } else {
        const count = Math.max(1, Number(ex.sets) || 1);
        const reps = Math.max(0, Number(ex.reps) || 0);
        for (let i = 0; i < count; i += 1) sets.push({ weight: 0, reps });
      }
      exercises.push({
        name: ex.name || '',
        sets,
        durationMinutes: ex.durationMinutes != null && ex.durationMinutes !== ''
          ? Number(ex.durationMinutes) : null,
      });
    });
  }
  const item = Object.assign(base('wlog'), {
    date,
    title: template ? template.title || '' : '',
    skipped: false,
    exercises,
  });
  data.workoutLogs.push(item);
  return item;
}

export function updateWorkoutLog(data, id, patch) {
  const item = findById(data.workoutLogs, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function moveWorkoutLogDate(data, id, newDate) {
  const item = findById(data.workoutLogs, id);
  if (!item || item.date === newDate) return item;
  const conflict = (data.workoutLogs || []).find(
    (log) => log.id !== id && log.date === newDate && !log._pendingDelete
  );
  if (conflict) {
    conflict.title = item.title;
    conflict.skipped = item.skipped;
    conflict.exercises = item.exercises;
    touch(conflict);
    removeItem(data.workoutLogs, id);
    return conflict;
  }
  item.date = newDate;
  return touch(item);
}

export function deleteWorkoutLog(data, id) {
  return removeItem(data.workoutLogs, id);
}

export function addLogExercise(data, id) {
  const item = findById(data.workoutLogs, id);
  if (!item) return null;
  item.exercises.push({ name: '', sets: [{ weight: 0, reps: 0 }], durationMinutes: null });
  return touch(item);
}

export function addLogSet(data, id, exerciseIndex) {
  const item = findById(data.workoutLogs, id);
  if (!item || !item.exercises[exerciseIndex]) return null;
  const exercise = item.exercises[exerciseIndex];
  if (!Array.isArray(exercise.sets)) exercise.sets = [];
  const last = exercise.sets[exercise.sets.length - 1];
  exercise.sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0 });
  return touch(item);
}

export function removeLogExercise(data, id, exerciseIndex) {
  const item = findById(data.workoutLogs, id);
  if (!item) return null;
  item.exercises.splice(exerciseIndex, 1);
  return touch(item);
}

export function upsertWeight(data, date, weight) {
  const value = Math.round(Number(weight) * 10) / 10;
  if (!Number.isFinite(value)) return null;
  const existing = (data.weightEntries || []).find((entry) => entry.date === date);
  if (existing) {
    existing.weight = value;
    return touch(existing);
  }
  const item = Object.assign(base('weight'), { date, weight: value });
  data.weightEntries.push(item);
  return item;
}

export function updateWeight(data, id, weight) {
  const item = findById(data.weightEntries, id);
  if (!item) return null;
  const value = Math.round(Number(weight) * 10) / 10;
  if (!Number.isFinite(value)) return null;
  item.weight = value;
  return touch(item);
}

export function deleteWeight(data, id) {
  return removeItem(data.weightEntries, id);
}

/** 30 天体重折线点位（SVG viewBox 0 0 100 40，返回归一化坐标） */
export function weightChart(entries, endDate, days = 30) {
  const dates = lastNDates(endDate, days);
  const byDate = {};
  (entries || []).forEach((entry) => {
    if (!entry || entry._pendingDelete) return;
    byDate[entry.date] = Number(entry.weight);
  });
  const present = dates.map((date, i) => ({ date, index: i, weight: byDate[date] }))
    .filter((item) => Number.isFinite(item.weight));
  if (!present.length) {
    return { points: [], min: null, max: null, dates, width: 100, height: 40 };
  }
  let min = Math.min.apply(null, present.map((p) => p.weight));
  let max = Math.max.apply(null, present.map((p) => p.weight));
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const points = present.map((p) => ({
    date: p.date,
    weight: p.weight,
    x: (p.index / Math.max(1, days - 1)) * 100,
    y: 40 - ((p.weight - min) / (max - min)) * 40,
  }));
  return { points, min, max, dates, width: 100, height: 40 };
}

/* ============ 饮食 ============ */
export const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

export function mealLogFor(data, date, mealType) {
  return (data.mealLogs || []).find((log) => log.date === date && log.mealType === mealType) || null;
}

export function ensureMealLog(data, date, mealType) {
  const existing = mealLogFor(data, date, mealType);
  if (existing) return existing;
  const item = Object.assign(base('meal'), { date, mealType, items: [] });
  data.mealLogs.push(item);
  return item;
}

export function addMealItem(data, date, mealType, text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const log = ensureMealLog(data, date, mealType);
  log.items.push(value);
  return touch(log);
}

export function removeMealItem(data, date, mealType, index) {
  const log = mealLogFor(data, date, mealType);
  if (!log) return null;
  log.items.splice(index, 1);
  return touch(log);
}

export function createMealTemplate(data, name, items) {
  const item = Object.assign(base('mtpl'), {
    name: String(name || '').trim() || '未命名模板',
    items: (items || []).slice(),
  });
  data.mealTemplates.push(item);
  return item;
}

export function renameMealTemplate(data, id, name) {
  const item = findById(data.mealTemplates, id);
  if (!item) return null;
  item.name = String(name || '').trim() || item.name;
  return touch(item);
}

export function deleteMealTemplate(data, id) {
  return removeItem(data.mealTemplates, id);
}

export function applyMealTemplate(data, date, mealType, templateId) {
  const template = findById(data.mealTemplates, templateId);
  if (!template) return null;
  const log = ensureMealLog(data, date, mealType);
  (template.items || []).forEach((text) => {
    if (log.items.indexOf(text) < 0) log.items.push(text);
  });
  return touch(log);
}

export function waterFor(data, date) {
  return (data.waterLogs || []).find((log) => log.date === date) || null;
}

export function waterCups(data, date) {
  const log = waterFor(data, date);
  return log ? Number(log.cups) || 0 : 0;
}

export function setWaterCups(data, date, cups, goal) {
  const limit = goal === undefined ? 30 : Math.max(0, Number(goal) || 8);
  const value = Math.max(0, Math.min(limit, Math.floor(Number(cups) || 0)));
  const existing = waterFor(data, date);
  if (existing) {
    existing.cups = value;
    return touch(existing);
  }
  const item = Object.assign(base('water'), { date, cups: value });
  data.waterLogs.push(item);
  return item;
}

export function addWaterCup(data, date, goal) {
  return setWaterCups(data, date, waterCups(data, date) + 1, goal);
}

/* ============ 游戏娱乐 ============ */
export const GAME_STATUS = { playing: '在玩', wishlist: '想玩', finished: '已通关' };

export function createGame(data, fields = {}) {
  const item = Object.assign(base('game'), {
    name: '',
    status: 'wishlist',
    progress: '',
    finishedDate: null,
    review: '',
    totalMinutes: 0,
  }, fields);
  data.games.push(item);
  return item;
}

export function updateGame(data, id, patch) {
  const item = findById(data.games, id);
  if (!item) return null;
  Object.assign(item, patch);
  return touch(item);
}

export function setGameStatus(data, id, status, info = {}) {
  const item = findById(data.games, id);
  if (!item) return null;
  item.status = status;
  if (status === 'finished') {
    item.finishedDate = info.finishedDate || nowDate();
    if (info.review !== undefined) item.review = String(info.review || '');
  }
  return touch(item);
}

export function recalcGameTotals(data, gameId) {
  const games = gameId ? data.games.filter((game) => game.id === gameId) : data.games;
  games.forEach((game) => {
    const total = (data.gameSessions || [])
      .filter((session) => session.gameId === game.id && !session._pendingDelete)
      .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
    game.totalMinutes = total;
  });
}

export function addGameSession(data, gameId, minutes, date) {
  const value = Math.floor(Number(minutes));
  if (!Number.isFinite(value) || value <= 0) return null;
  const item = Object.assign(base('gsess'), {
    gameId,
    date: date || nowDate(),
    minutes: value,
  });
  data.gameSessions.push(item);
  recalcGameTotals(data, gameId);
  return item;
}

export function updateGameSession(data, id, patch) {
  const item = findById(data.gameSessions, id);
  if (!item) return null;
  Object.assign(item, patch);
  touch(item);
  recalcGameTotals(data, item.gameId);
  return item;
}

export function deleteGameSession(data, id) {
  const item = findById(data.gameSessions, id);
  if (!item) return false;
  removeItem(data.gameSessions, id);
  recalcGameTotals(data, item.gameId);
  return true;
}

export function deleteGame(data, id) {
  removeItem(data.games, id);
  data.gameSessions = data.gameSessions.filter((session) => session.gameId !== id);
}

export function gameWeeklyMinutes(data, gameId, date) {
  const start = weekStart(date);
  return (data.gameSessions || [])
    .filter((session) => session.gameId === gameId && !session._pendingDelete
      && session.date >= start && session.date <= date)
    .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
}

export function weeklyMinutes(data, date) {
  const start = weekStart(date);
  return (data.gameSessions || [])
    .filter((session) => !session._pendingDelete && session.date >= start && session.date <= date)
    .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
}

/* ============ 通用 ============ */
export function deepCopy(value) {
  return clone(value);
}

export function todayIn(settings) {
  return todayFn(settings);
}

export function dateOffset(date, n) {
  return addDays(date, n);
}
