// views/fitness.js —— 健身计划：本周模板 / 打卡记录 / 体重（内联 SVG 折线）
import {
  clone,
  fmtDateCN,
  isDateStr,
  visibleItems,
  weekDates,
  weekdayCN,
} from '../utils.js';
import {
  addLogExercise,
  addLogSet,
  addTemplateExercise,
  buildWorkoutLogFromTemplate,
  deleteWeight,
  deleteWorkoutLog,
  moveWorkoutLogDate,
  removeLogExercise,
  removeTemplateExercise,
  templateForDate,
  updateTemplate,
  updateWeight,
  updateWorkoutLog,
  upsertWeight,
  weightChart,
  workoutLogForDate,
} from '../models.js';
import * as toast from '../ui/toast.js';
import { openPanel, closePanel } from '../ui/panel.js';
import { el, emptyState, deleteWithUndo, field, pageHead, tabs } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  const validTab = ['plan', 'logs', 'weight'];
  const tab = params && validTab.indexOf(params.tab) >= 0 ? params.tab : 'plan';
  R = { root, ctx, tab, focusWeight: Boolean(params && params.focus === 'weight') };
  root.innerHTML = '';
  draw();
  ctx.onCleanup(() => { R = null; });
  if (params && (params.tab || params.checkin || params.focus)) {
    if (typeof history !== 'undefined' && history.replaceState) {
      try { history.replaceState(null, '', '#/fitness'); } catch (err) { /* 忽略 */ }
    }
  }
  if (params && params.checkin === '1') {
    setTimeout(() => { if (R) openCheckin(ctx.today()); }, 0);
  }
  if (R.focusWeight) {
    setTimeout(() => {
      if (!R) return;
      const input = R.root.querySelector('.weight-today-input');
      if (input) input.focus();
    }, 0);
  }
}

function draw() {
  if (!R) return;
  const { root, ctx } = R;
  root.innerHTML = '';
  const actions = [
    el('button', {
      class: 'btn primary', type: 'button', text: '今天打卡',
      onclick: () => openCheckin(ctx.today()),
    }),
  ];
  root.append(pageHead('健身计划', fmtDateCN(ctx.today()) + ' · 按模板训练，记体重看趋势', actions));
  root.append(tabs([
    { key: 'plan', label: '本周计划' },
    { key: 'logs', label: '打卡记录' },
    { key: 'weight', label: '体重' },
  ], R.tab, (key) => { R.tab = key; draw(); }));

  if (R.tab === 'plan') drawPlan();
  else if (R.tab === 'logs') drawLogs();
  else drawWeight();
  if (R.focusWeight) {
    R.focusWeight = false;
    const input = R.root.querySelector('.weight-today-input');
    if (input) setTimeout(() => input.focus(), 0);
  }
}

/* ---------------- 本周模板 ---------------- */
function drawPlan() {
  const { root, ctx } = R;
  const data = ctx.store.data;
  const dates = weekDates(ctx.today());
  const grid = el('div', { class: 'plan-grid' });
  const note = el('p', { class: 'muted tiny', text: '模板改动只影响今天及以后的打卡，不会回改历史记录。清空一个格子直接保存，不弹确认。' });
  root.append(note);
  dates.forEach((date, index) => {
    const template = templateForDate(data, date);
    if (!template) return;
    const isToday = date === ctx.today();
    const day = el('div', { class: 'plan-cell section-card' + (isToday ? ' today' : '') });
    const title = el('input', { type: 'text', value: template.title || '', placeholder: '训练名，如 胸+三头' });
    title.addEventListener('blur', () => {
      ctx.store.mutate((d) => updateTemplate(d, template.dayOfWeek, { title: title.value }));
    });
    const rest = el('input', { type: 'checkbox', checked: template.isRestDay ? true : null });
    rest.addEventListener('change', () => {
      ctx.store.mutate((d) => updateTemplate(d, template.dayOfWeek, { isRestDay: rest.checked }));
    });
    day.append(el('div', { class: 'plan-day' }, [
      el('strong', { text: weekdayCN(date) }),
      el('span', { class: 'muted tiny', text: date.slice(5) }),
      isToday ? el('span', { class: 'badge accent', text: '今天' }) : null,
      el('span', { class: 'spacer' }),
      el('label', { class: 'muted tiny' }, [rest, '休息日']),
    ]));
    day.append(title);
    const exercises = el('div', {});
    (template.exercises || []).forEach((exercise, exIndex) => {
      exercises.append(buildTemplateExercise(template, exercise, exIndex));
    });
    const add = el('button', {
      class: 'btn ghost small', type: 'button', text: '+ 动作',
      onclick: () => {
        ctx.store.mutate((d) => addTemplateExercise(d, template.dayOfWeek));
        draw();
      },
    });
    day.append(exercises, add);
    grid.append(day);
  });
  root.append(grid);
}

function buildTemplateExercise(template, exercise, index) {
  const { ctx } = R;
  const name = el('input', { type: 'text', value: exercise.name || '', placeholder: '动作名' });
  name.addEventListener('blur', () => {
    ctx.store.mutate((d) => updateTemplate(d, template.dayOfWeek, {
      exercises: (d.workoutTemplates.find((t) => t.dayOfWeek === template.dayOfWeek) || {}).exercises,
    }));
  });
  const sets = el('input', { type: 'number', min: '1', value: exercise.sets == null ? 3 : exercise.sets, title: '组数' });
  sets.addEventListener('change', () => {
    const current = findTemplateExercise(ctx.store.data, template.dayOfWeek, index);
    if (!current) return;
    ctx.store.mutate((d) => {
      const ex = findTemplateExercise(d, template.dayOfWeek, index);
      if (ex) ex.sets = Math.max(1, Math.floor(Number(sets.value) || 1));
      return updateTemplate(d, template.dayOfWeek, {});
    });
  });
  const reps = el('input', { type: 'number', min: '0', value: exercise.reps == null ? 10 : exercise.reps, title: '次数' });
  reps.addEventListener('change', () => {
    ctx.store.mutate((d) => {
      const ex = findTemplateExercise(d, template.dayOfWeek, index);
      if (ex) ex.reps = Math.max(0, Math.floor(Number(reps.value) || 0));
      return updateTemplate(d, template.dayOfWeek, {});
    });
  });
  const duration = el('input', {
    type: 'number', min: '0', value: exercise.durationMinutes == null ? '' : exercise.durationMinutes,
    placeholder: '时长', title: '时长（分钟）',
  });
  duration.addEventListener('change', () => {
    ctx.store.mutate((d) => {
      const ex = findTemplateExercise(d, template.dayOfWeek, index);
      if (ex) ex.durationMinutes = duration.value === '' ? null : Math.max(0, Number(duration.value));
      return updateTemplate(d, template.dayOfWeek, {});
    });
  });
  const row = el('div', { class: 'plan-exercise' }, [
    name,
    el('span', { class: 'muted tiny', text: '×' }),
    sets, reps,
    el('span', { class: 'muted tiny', text: '或' }),
    duration,
    el('span', { class: 'muted tiny', text: '分' }),
    el('button', {
      class: 'btn ghost small delete-btn', type: 'button', text: '×', title: '移除动作',
      onclick: () => {
        ctx.store.mutate((d) => removeTemplateExercise(d, template.dayOfWeek, index));
        draw();
      },
    }),
  ]);
  name.addEventListener('input', () => { exercise.name = name.value; });
  return row;
}

function findTemplateExercise(data, dayOfWeek, index) {
  const template = data.workoutTemplates.find((t) => t.dayOfWeek === dayOfWeek);
  return template && template.exercises ? template.exercises[index] : null;
}

/* ---------------- 打卡记录 ---------------- */
function drawLogs() {
  const { root, ctx } = R;
  const data = ctx.store.data;
  const logs = visibleItems(data.workoutLogs)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!logs.length) {
    root.append(emptyState(
      '还没有打卡记录。点右上角"今天打卡"，会按本周模板带出初始内容。',
      '今天打卡',
      () => openCheckin(ctx.today())
    ));
    return;
  }
  const card = el('section', { class: 'section-card' });
  card.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '打卡记录' }),
    el('span', { class: 'section-sub', text: '按日期倒序 · 同一天重复打卡=编辑已有' }),
  ]));
  logs.forEach((log) => {
    const exerciseCount = (log.exercises || []).length;
    const row = el('div', { class: 'workout-log-row' }, [
      el('span', { class: 'wl-date', text: fmtDateCN(log.date) }),
      el('span', { class: 'wl-title', text: log.title || '（未命名训练）' }),
      log.skipped ? el('span', { class: 'badge warn', text: '没练' }) : null,
      el('span', { class: 'wl-meta', text: exerciseCount + ' 个动作' }),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn small', type: 'button', text: '查看 / 编辑',
        onclick: () => openCheckin(log.date),
      }),
    ]);
    card.append(row);
  });
  root.append(card);
}

function openCheckin(date) {
  if (!R) return;
  const { ctx } = R;
  const data = ctx.store.data;
  let log = workoutLogForDate(data, date);
  const initial = log ? {
    date: log.date,
    title: log.title || '',
    skipped: Boolean(log.skipped),
    exercises: clone(log.exercises || []),
  } : draftFromTemplate(ctx, date);

  let draft = initial;

  const panel = openPanel({
    width: '40',
    title: log ? '编辑打卡 · ' + fmtDateCN(date) : '今天打卡 · ' + fmtDateCN(date),
  });
  if (!panel) return;

  function ensureLog() {
    if (log) return log;
    log = ctx.store.mutate((d) => buildWorkoutLogFromTemplate(d, draft.date));
    panel.setTitle('编辑打卡 · ' + fmtDateCN(draft.date));
    return log;
  }

  function commit() {
    const target = ensureLog();
    if (!target) return;
    if (target.date !== draft.date) {
      ctx.store.mutate((d) => moveWorkoutLogDate(d, target.id, draft.date));
      const all = ctx.store.data.workoutLogs || [];
      log = all.find((item) => item.id === target.id)
        || all.find((item) => item.date === draft.date && !item._pendingDelete)
        || null;
    }
    if (!log) return;
    ctx.store.mutate((d) => updateWorkoutLog(d, log.id, {
      title: draft.title,
      skipped: draft.skipped,
      exercises: clone(draft.exercises),
    }));
    draw();
  }

  function renderPanel() {
    panel.body.innerHTML = '';
    const dateInput = el('input', { type: 'date', value: draft.date });
    dateInput.addEventListener('change', () => {
      if (!isDateStr(dateInput.value)) { dateInput.value = draft.date; return; }
      draft.date = dateInput.value;
      commit();
      renderPanel();
    });
    const title = el('input', { type: 'text', value: draft.title, placeholder: '训练名称' });
    title.addEventListener('input', () => { draft.title = title.value; commit(); });
    const skipped = el('input', { type: 'checkbox', checked: draft.skipped ? true : null });
    skipped.addEventListener('change', () => { draft.skipped = skipped.checked; commit(); });
    panel.body.append(el('div', { class: 'form-grid' }, [
      field('日期（可改补记）', dateInput, '同一天至多一条记录；改到已有记录的日期会合并'),
      field('训练名称', title),
      el('div', { class: 'settings-row' }, [el('label', {}, [skipped, '标记"没练"'])]),
    ]));

    const list = el('div', { class: 'log-editor' });
    if (!draft.exercises.length) {
      list.append(el('p', { class: 'muted tiny', text: '没有动作。可以从模板带出，也可以临时加一个。' }));
    }
    draft.exercises.forEach((exercise, index) => {
      list.append(buildDraftExercise(exercise, index));
    });
    panel.body.append(el('div', { class: 'section-head', style: { marginTop: '12px' } }, [
      el('h3', { text: '实际训练' }),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn small', type: 'button', text: '+ 临时加动作',
        onclick: () => {
          draft.exercises.push({ name: '', sets: [{ weight: 0, reps: 0 }], durationMinutes: null });
          commit();
          renderPanel();
        },
      }),
    ]));
    panel.body.append(list);

    if (log) {
      panel.body.append(el('div', { class: 'divider' }));
      panel.body.append(el('div', { class: 'form-actions' }, [
        el('button', {
          class: 'btn danger', type: 'button', text: '删除这次打卡',
          onclick: () => deleteLogWithUndo(log),
        }),
      ]));
    }
    panel.setStatus('自动保存');
  }

  function buildDraftExercise(exercise, index) {
    const name = el('input', { type: 'text', value: exercise.name || '', placeholder: '动作名' });
    name.addEventListener('input', () => { exercise.name = name.value; commit(); });
    const rows = el('div', {});
    if (exercise.durationMinutes != null) {
      const duration = el('input', { type: 'number', min: '0', value: exercise.durationMinutes, placeholder: '分钟' });
      duration.addEventListener('input', () => { exercise.durationMinutes = Number(duration.value) || 0; commit(); });
      rows.append(el('div', { class: 'set-row' }, [
        el('span', { class: 'set-label', text: '时长' }), duration,
        el('span', { class: 'muted tiny', text: '分钟' }),
      ]));
    } else {
      if (!Array.isArray(exercise.sets)) exercise.sets = [];
      exercise.sets.forEach((set, setIndex) => {
        const weight = el('input', { type: 'number', min: '0', step: '0.5', value: set.weight == null ? 0 : set.weight, placeholder: 'kg' });
        weight.addEventListener('input', () => { set.weight = Number(weight.value) || 0; commit(); });
        const reps = el('input', { type: 'number', min: '0', value: set.reps == null ? 0 : set.reps, placeholder: '次' });
        reps.addEventListener('input', () => { set.reps = Number(reps.value) || 0; commit(); });
        rows.append(el('div', { class: 'set-row' }, [
          el('span', { class: 'set-label', text: '第 ' + (setIndex + 1) + ' 组' }),
          weight, el('span', { class: 'muted tiny', text: 'kg ×' }), reps, el('span', { class: 'muted tiny', text: '次' }),
        ]));
      });
      rows.append(el('button', {
        class: 'btn ghost small', type: 'button', text: '+ 加一组',
        onclick: () => {
          const last = exercise.sets[exercise.sets.length - 1];
          exercise.sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0 });
          commit();
          renderPanel();
        },
      }));
    }
    return el('div', { class: 'log-editor-exercise' }, [
      el('div', { class: 'row' }, [
        name,
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'btn ghost small', type: 'button', text: '×',
          onclick: () => {
            draft.exercises.splice(index, 1);
            commit();
            renderPanel();
          },
        }),
      ]),
      rows,
    ]);
  }

  function deleteLogWithUndo(target) {
    deleteWithUndo({
      title: '删除 ' + fmtDateCN(target.date) + ' 的打卡记录？',
      body: '删除后 5 秒内可撤销。',
      undoLabel: '已删除打卡记录',
      onConfirm: () => {
        target._pendingDelete = true;
        closePanel();
        draw();
      },
      onCommit: () => ctx.store.mutate((d) => deleteWorkoutLog(d, target.id)),
      onUndo: () => { delete target._pendingDelete; if (R) draw(); },
    });
  }

  renderPanel();
}

function draftFromTemplate(ctx, date) {
  const data = ctx.store.data;
  const template = templateForDate(data, date);
  const exercises = ((template && template.exercises) || []).map((ex) => ({
    name: ex.name || '',
    sets: ex.durationMinutes != null && ex.durationMinutes !== ''
      ? []
      : new Array(Math.max(1, Math.floor(Number(ex.sets) || 1))).fill(null).map(() => ({
        weight: 0,
        reps: Math.max(0, Math.floor(Number(ex.reps) || 0)),
      })),
    durationMinutes: ex.durationMinutes != null && ex.durationMinutes !== ''
      ? Number(ex.durationMinutes) : null,
  }));
  return {
    date,
    title: template ? template.title || '' : '',
    skipped: false,
    exercises,
  };
}

/* ---------------- 体重 ---------------- */
function drawWeight() {
  const { root, ctx } = R;
  const data = ctx.store.data;
  const today = ctx.today();
  const todayEntry = (data.weightEntries || []).find((entry) => entry.date === today && !entry._pendingDelete);

  const top = el('section', { class: 'section-card' });
  top.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '今天的体重' }),
    el('span', { class: 'section-sub', text: '同一天多次录入，只保留最后一次' }),
  ]));
  const input = el('input', {
    type: 'number', step: '0.1', min: '0', class: 'weight-today-input',
    value: todayEntry ? todayEntry.weight : '', placeholder: 'kg',
  });
  const saveWeight = () => {
    if (input.value === '') return;
    ctx.store.mutate((d) => upsertWeight(d, today, input.value));
    draw();
    const node = R && R.root.querySelector('.weight-today-input');
    if (node) node.focus();
  };
  input.addEventListener('change', saveWeight);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); saveWeight(); }
  });
  top.append(el('div', { class: 'form-inline' }, [
    input,
    el('span', { class: 'muted tiny', text: 'kg' }),
    el('button', { class: 'btn primary small', type: 'button', text: '记录体重', onclick: saveWeight }),
  ]));
  root.append(top);

  const chartCard = el('section', { class: 'section-card', style: { marginTop: '12px' } });
  chartCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '最近 30 天' }),
    el('span', { class: 'section-sub', text: '简单折线，只看趋势' }),
  ]));
  chartCard.append(buildChart(data.weightEntries || [], today));
  root.append(chartCard);

  const history = visibleItems(data.weightEntries)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const histCard = el('section', { class: 'section-card', style: { marginTop: '12px' } });
  histCard.append(el('div', { class: 'section-head' }, [el('h2', { text: '历史体重' })]));
  if (!history.length) {
    histCard.append(el('p', { class: 'muted tiny', text: '还没有体重记录。' }));
  }
  history.forEach((entry) => {
    const value = el('input', { type: 'number', step: '0.1', min: '0', value: entry.weight, style: { width: '92px' } });
    value.addEventListener('change', () => {
      const weight = Number(value.value);
      if (!Number.isFinite(weight)) return;
      ctx.store.mutate((d) => updateWeight(d, entry.id, weight));
      draw();
    });
    histCard.append(el('div', { class: 'workout-log-row' }, [
      el('span', { class: 'wl-date', text: fmtDateCN(entry.date) }),
      value,
      el('span', { class: 'muted tiny', text: 'kg' }),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn ghost small', type: 'button', text: '删除',
        onclick: () => deleteWeightWithUndo(entry),
      }),
    ]));
  });
  root.append(histCard);
}

function buildChart(entries, today) {
  const chart = weightChart(entries, today, 30);
  if (!chart.points.length) {
    return el('div', { class: 'chart-empty', text: '最近 30 天还没有体重数据，记一条就能看到折线。' });
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  // 网格线
  [0, 10, 20, 30, 40].forEach((y) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', '100');
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--border)');
    line.setAttribute('stroke-width', '0.3');
    svg.append(line);
  });
  const points = chart.points.map((p) => p.x + ',' + p.y).join(' ');
  const polyline = document.createElementNS(ns, 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'var(--accent)');
  polyline.setAttribute('stroke-width', '1');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.append(polyline);
  chart.points.forEach((p) => {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(p.x));
    circle.setAttribute('cy', String(p.y));
    circle.setAttribute('r', '1.6');
    circle.setAttribute('fill', 'var(--accent)');
    circle.setAttribute('data-date', p.date);
    circle.setAttribute('data-weight', String(p.weight));
    const title = document.createElementNS(ns, 'title');
    title.textContent = p.date + ' · ' + p.weight + ' kg';
    circle.append(title);
    svg.append(circle);
  });
  const wrap = el('div', { class: 'weight-chart' }, [svg]);
  wrap.append(el('div', { class: 'row' }, [
    el('span', { class: 'muted tiny', text: chart.min == null ? '' : '低 ' + Math.round(chart.min * 10) / 10 + ' kg' }),
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted tiny', text: chart.max == null ? '' : '高 ' + Math.round(chart.max * 10) / 10 + ' kg' }),
  ]));
  return wrap;
}

function deleteWeightWithUndo(entry) {
  const { ctx } = R;
  deleteWithUndo({
    title: '删除 ' + fmtDateCN(entry.date) + ' 的体重记录？',
    body: '删除后 5 秒内可撤销。',
    undoLabel: '已删除体重记录',
    onConfirm: () => { entry._pendingDelete = true; draw(); },
    onCommit: () => ctx.store.mutate((d) => deleteWeight(d, entry.id)),
    onUndo: () => { delete entry._pendingDelete; if (R) draw(); },
  });
}

export function newItem() {
  if (R) openCheckin(R.ctx.today());
}
