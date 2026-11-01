// todoEngine.js —— 今日事项派生引擎 + 勾选写回 + 摘要口径 + 日终顺延（纯函数）
import { addDays, byCreatedAsc, nowISO, uid, weekStart } from './utils.js';
import {
  waterCups,
  MEAL_TYPES,
  mealLogFor,
  weeklyMinutes,
} from './models.js';

export const SLOT_LABELS = { morning: '早上', afternoon: '白天', evening: '晚上' };
export const SLOT_ORDER = ['morning', 'afternoon', 'evening'];

export const SOURCE_META = {
  manual: { label: '临时', cls: 'manual' },
  selfmedia: { label: '自媒体', cls: 'selfmedia' },
  dev: { label: '开发', cls: 'dev' },
  consult: { label: '咨询', cls: 'consult' },
  fitness: { label: '健身', cls: 'fitness' },
  game: { label: '游戏', cls: 'game' },
  diet: { label: '饮食', cls: 'diet' },
};

export function hiddenModules(data) {
  const settings = (data && data.settings) || {};
  return Array.isArray(settings.hiddenModules) ? settings.hiddenModules : [];
}

export function isHidden(data, moduleKey) {
  return hiddenModules(data).indexOf(moduleKey) >= 0;
}

function visit(item) {
  if (!item) return null;
  return Object.assign({}, item);
}

function makeTodo(fields) {
  const item = {
    key: fields.key,
    id: fields.id || null,
    source: fields.source,
    sourceId: fields.sourceId || null,
    title: fields.title || '',
    timeSlot: fields.timeSlot || 'afternoon',
    priority: fields.priority === 'high' ? 'high' : 'normal',
    done: Boolean(fields.done),
    doneAt: fields.doneAt || null,
    createdAt: fields.createdAt || '',
    planDate: fields.planDate || null,
  };
  return item;
}

/** 扫描三个派生来源 + manual 临时事项 */
export function deriveTodos(date, data) {
  const out = [];
  if (!isHidden(data, 'selfmedia')) {
    (data.contents || []).forEach((content) => {
      if (!content || content._pendingDelete) return;
      if (content.scheduledDate !== date) return;
      if (content.status === 'scheduled') {
        out.push(makeTodo({
          key: 'src:selfmedia:' + content.id,
          source: 'selfmedia',
          sourceId: content.id,
          title: '发布：《' + (content.title || '未命名') + '》',
          timeSlot: 'afternoon',
          priority: 'normal',
          done: false,
          createdAt: content.createdAt,
        }));
      } else if (content.status === 'published' && content.publishedDate === date) {
        out.push(makeTodo({
          key: 'src:selfmedia:' + content.id,
          source: 'selfmedia',
          sourceId: content.id,
          title: '发布：《' + (content.title || '未命名') + '》',
          timeSlot: 'afternoon',
          priority: 'normal',
          done: true,
          createdAt: content.createdAt,
        }));
      }
    });
  }
  if (!isHidden(data, 'dev')) {
    (data.devTasks || []).forEach((task) => {
      if (!task || task._pendingDelete) return;
      if (task.dueDate !== date) return;
      const project = (data.devProjects || []).find((p) => p.id === task.projectId);
      if (!project) return;
      out.push(makeTodo({
        key: 'src:dev:' + task.id,
        source: 'dev',
        sourceId: task.id,
        title: '开发：' + (project.name || '未命名项目') + ' - ' + (task.title || '未命名任务'),
        timeSlot: 'afternoon',
        priority: task.priority,
        done: Boolean(task.done),
        createdAt: task.createdAt,
      }));
    });
  }
  if (!isHidden(data, 'consult')) {
    (data.clients || []).forEach((client) => {
      if (!client || client._pendingDelete) return;
      if (client.nextFollowupDate === date) {
        out.push(makeTodo({
          key: 'src:consult:' + client.id,
          source: 'consult',
          sourceId: client.id,
          title: '跟进客户：' + (client.name || '未命名'),
          timeSlot: 'afternoon',
          priority: 'normal',
          done: false,
          createdAt: client.createdAt,
        }));
      } else if (client.nextFollowupDate === null && client.followupClearedAt === date) {
        out.push(makeTodo({
          key: 'src:consult:' + client.id,
          source: 'consult',
          sourceId: client.id,
          title: '跟进客户：' + (client.name || '未命名'),
          timeSlot: 'afternoon',
          priority: 'normal',
          done: true,
          doneAt: client.followupClearedAt,
          createdAt: client.createdAt,
        }));
      }
    });
  }
  if (!isHidden(data, 'today')) {
    (data.todos || []).forEach((todo) => {
      if (!todo || todo._pendingDelete) return;
      if (todo.planDate !== date) return;
      out.push(makeTodo({
        key: 'todo:' + todo.id,
        id: todo.id,
        source: 'manual',
        sourceId: null,
        title: todo.title,
        timeSlot: todo.timeSlot,
        priority: todo.priority,
        done: Boolean(todo.done),
        doneAt: todo.doneAt,
        createdAt: todo.createdAt,
        planDate: todo.planDate,
      }));
    });
  }
  return out;
}

function sortTodos(list) {
  return list.slice().sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return byCreatedAsc(a, b);
  });
}

export function getTodosFor(date, data) {
  return sortTodos(deriveTodos(date, data));
}

export function splitTodos(todos) {
  const pending = sortTodos(todos.filter((item) => !item.done));
  const done = sortTodos(todos.filter((item) => item.done));
  return { pending, done };
}

export function groupBySlot(todos) {
  const groups = { morning: [], afternoon: [], evening: [] };
  todos.forEach((todo) => {
    const slot = SLOT_ORDER.indexOf(todo.timeSlot) >= 0 ? todo.timeSlot : 'afternoon';
    groups[slot].push(todo);
  });
  return groups;
}

/** 勾选/取消勾选；返回新的 done 状态。四源写回规则见 DEV-PLAN 5.2 */
export function toggleTodo(todo, data, opts = {}) {
  const date = opts.date || todo.planDate || '';
  const now = opts.now || nowISO();
  const nextDone = !todo.done;
  if (todo.source === 'manual') {
    const item = (data.todos || []).find((t) => t.id === todo.id);
    if (!item) return todo.done;
    item.done = nextDone;
    item.doneAt = nextDone ? now : null;
    item.updatedAt = nowISO();
    return nextDone;
  }
  if (todo.source === 'dev') {
    const task = (data.devTasks || []).find((t) => t.id === todo.sourceId);
    if (!task) return todo.done;
    task.done = nextDone;
    task.updatedAt = nowISO();
    return nextDone;
  }
  if (todo.source === 'selfmedia') {
    const content = (data.contents || []).find((c) => c.id === todo.sourceId);
    if (!content) return todo.done;
    if (nextDone) {
      content.status = 'published';
      content.publishedDate = date;
    } else {
      content.status = 'scheduled';
    }
    content.updatedAt = nowISO();
    return nextDone;
  }
  if (todo.source === 'consult') {
    const client = (data.clients || []).find((c) => c.id === todo.sourceId);
    if (!client) return todo.done;
    if (nextDone) {
      client.nextFollowupDate = null;
      client.followupClearedAt = date;
    } else {
      client.nextFollowupDate = date;
      client.followupClearedAt = null;
    }
    client.updatedAt = nowISO();
    return nextDone;
  }
  return todo.done;
}

/** 日终顺延：全部未完成项改到明天，返回快照供 5 秒撤销 */
export function rolloverTodos(date, tomorrow, data) {
  const todos = getTodosFor(date, data).filter((todo) => !todo.done);
  const snapshot = [];
  todos.forEach((todo) => {
    if (todo.source === 'manual') {
      const item = (data.todos || []).find((t) => t.id === todo.id);
      if (!item) return;
      snapshot.push({ kind: 'todo', id: item.id, field: 'planDate', value: item.planDate });
      item.planDate = tomorrow;
      item.updatedAt = nowISO();
    } else if (todo.source === 'selfmedia') {
      const item = (data.contents || []).find((c) => c.id === todo.sourceId);
      if (!item) return;
      snapshot.push({ kind: 'content', id: item.id, field: 'scheduledDate', value: item.scheduledDate });
      item.scheduledDate = tomorrow;
      item.updatedAt = nowISO();
    } else if (todo.source === 'dev') {
      const item = (data.devTasks || []).find((t) => t.id === todo.sourceId);
      if (!item) return;
      snapshot.push({ kind: 'task', id: item.id, field: 'dueDate', value: item.dueDate });
      item.dueDate = tomorrow;
      item.updatedAt = nowISO();
    } else if (todo.source === 'consult') {
      const item = (data.clients || []).find((c) => c.id === todo.sourceId);
      if (!item) return;
      snapshot.push({ kind: 'client', id: item.id, field: 'nextFollowupDate', value: item.nextFollowupDate });
      item.nextFollowupDate = tomorrow;
      item.followupClearedAt = null;
      item.updatedAt = nowISO();
    }
  });
  return { count: todos.length, snapshot };
}

export function restoreRollover(data, snapshot) {
  const table = {
    todo: data.todos,
    content: data.contents,
    task: data.devTasks,
    client: data.clients,
  };
  (snapshot || []).forEach((entry) => {
    const arr = table[entry.kind] || [];
    const item = arr.find((x) => x.id === entry.id);
    if (item) item[entry.field] = entry.value;
  });
}

export function addManualTodo(data, fields = {}) {
  const title = String(fields.title || '').trim();
  if (!title) return null;
  const stamp = nowISO();
  const item = {
    id: uid('todo'),
    title,
    source: 'manual',
    sourceId: null,
    planDate: fields.planDate || '',
    timeSlot: SLOT_ORDER.indexOf(fields.timeSlot) >= 0 ? fields.timeSlot : 'afternoon',
    priority: fields.priority === 'high' ? 'high' : 'normal',
    done: false,
    doneAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  data.todos.push(item);
  return item;
}

export function convertMemoToTodo(data, memoId, date) {
  const memo = (data.memos || []).find((item) => item.id === memoId);
  if (!memo || memo.convertedToTodo) return null;
  const todo = addManualTodo(data, {
    title: memo.text,
    planDate: date,
    timeSlot: 'afternoon',
    priority: 'normal',
  });
  if (!todo) return null;
  memo.convertedToTodo = true;
  memo.todoId = todo.id;
  memo.updatedAt = nowISO();
  return todo;
}

/** 六张速览卡的摘要取数（口径见 DEV-PLAN 5.2） */
export function summaries(data, date, settings) {
  const goal = Number(settings && settings.waterGoal) || 8;

  const scheduledToday = (data.contents || []).filter(
    (content) => !content._pendingDelete && content.status === 'scheduled' && content.scheduledDate === date
  );
  const publishedToday = (data.contents || []).filter(
    (content) => !content._pendingDelete && content.status === 'published' && content.publishedDate === date
  );

  const devLogsToday = (data.devLogs || []).filter((log) => !log._pendingDelete && log.date === date);

  const followupEnd = addDays(date, 3);
  const followupClients = (data.clients || [])
    .filter((client) => !client._pendingDelete && client.nextFollowupDate
      && client.nextFollowupDate >= date && client.nextFollowupDate <= followupEnd)
    .sort((a, b) => String(a.nextFollowupDate).localeCompare(String(b.nextFollowupDate)));
  const dueToday = followupClients.filter((client) => client.nextFollowupDate === date);

  const workoutLog = (data.workoutLogs || []).find(
    (log) => !log._pendingDelete && log.date === date && !log.skipped
  );

  const mealTypes = MEAL_TYPES.map((type) => mealLogFor(data, date, type.key))
    .filter((log) => log && (log.items || []).length > 0);
  const cups = waterCups(data, date);

  const weekMinutes = weeklyMinutes(data, date);

  return {
    selfmedia: {
      text: scheduledToday.length
        ? '待发布 ' + scheduledToday.length + ' 条（未发）'
        : (publishedToday.length ? '已发布 ' + publishedToday.length + ' 条' : '今天无发布计划'),
      scheduledCount: scheduledToday.length,
      publishedCount: publishedToday.length,
      firstScheduledId: scheduledToday.length ? scheduledToday[0].id : null,
    },
    dev: {
      text: devLogsToday.length ? '随手记已写' : '随手记未写',
      hasLog: devLogsToday.length > 0,
    },
    consult: {
      text: followupClients.length
        ? '待跟进 ' + followupClients.length + ' 人 · ' + (followupClients[0].name || '未命名')
        : '暂无待跟进',
      count: followupClients.length,
      firstClientId: followupClients.length ? followupClients[0].id : null,
      dueClientId: dueToday.length ? dueToday[0].id : null,
    },
    fitness: {
      text: workoutLog ? '已练 · ' + (workoutLog.title || '训练') : '今天未练',
      trained: Boolean(workoutLog),
    },
    diet: {
      text: '已记 ' + mealTypes.length + ' 餐 · 喝水 ' + cups + '/' + goal + ' 杯',
      meals: mealTypes.length,
      cups,
      goal,
    },
    game: {
      text: '本周已玩 ' + (Math.round((weekMinutes / 60) * 10) / 10) + ' 小时',
      minutes: weekMinutes,
      hours: Math.round((weekMinutes / 60) * 10) / 10,
    },
  };
}

export function weekRange(date) {
  return { start: weekStart(date), end: date };
}
