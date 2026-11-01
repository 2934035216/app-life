// views/diet.js —— 饮食计划：按天四餐 + 喝水打点 + 餐食模板
import { addDays, fmtDateCN, isDateStr, monthGrid } from '../utils.js';
import {
  MEAL_TYPES,
  addMealItem,
  applyMealTemplate,
  createMealTemplate,
  deleteMealTemplate,
  dietDaySummary,
  ensureMealLog,
  findById,
  mealLogFor,
  removeMealItem,
  renameMealTemplate,
  setWaterCups,
  waterCups,
} from '../models.js';
import { choose, form } from '../ui/dialog.js';
import { openPanel, closePanel } from '../ui/panel.js';
import * as toast from '../ui/toast.js';
import { el, emptyState, deleteWithUndo, field, pageHead } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  const today = ctx.today();
  R = {
    root,
    ctx,
    date: today,
    monthOffset: 0,
    pending: {},
    focusMeal: params && params.focus === 'nextmeal' ? 'nextmeal' : null,
  };
  root.innerHTML = '';
  if (R.focusMeal === 'nextmeal') {
    const data = ctx.store.data;
    const empty = MEAL_TYPES.find((type) => {
      const log = mealLogFor(data, today, type.key);
      return !log || !(log.items || []).length;
    });
    R.focusMeal = empty ? empty.key : 'snack';
  }
  draw();
  ctx.onCleanup(() => { R = null; });
  if (params && params.focus) {
    if (typeof history !== 'undefined' && history.replaceState) {
      try { history.replaceState(null, '', '#/diet'); } catch (err) { /* 忽略 */ }
    }
  }
}

function draw() {
  if (!R) return;
  const { root, ctx, date } = R;
  const data = ctx.store.data;
  const goal = Math.max(1, Math.min(30, Number(data.settings.waterGoal) || 8));
  root.innerHTML = '';
  root.append(pageHead('饮食计划', fmtDateCN(date) + ' · 快速记吃了什么、喝了几杯水', [
    el('button', {
      class: 'btn', type: 'button', text: '← 前一天',
      onclick: () => { R.date = addDays(date, -1); R.monthOffset = 0; R.pending = {}; draw(); },
    }),
    el('button', {
      class: 'btn', type: 'button', text: '后一天 →',
      onclick: () => { R.date = addDays(date, 1); R.monthOffset = 0; R.pending = {}; draw(); },
    }),
    date !== ctx.today() ? el('button', {
      class: 'btn ghost', type: 'button', text: '回到今天',
      onclick: () => { R.date = ctx.today(); R.monthOffset = 0; R.pending = {}; draw(); },
    }) : null,
    el('button', {
      class: 'btn', type: 'button', text: '模板管理',
      onclick: () => openTemplatePanel(),
    }),
  ]));

  const dateInput = el('input', { type: 'date', value: date });
  dateInput.addEventListener('change', () => {
    if (!isDateStr(dateInput.value)) { dateInput.value = date; return; }
    R.date = dateInput.value;
    R.monthOffset = 0;
    R.pending = {};
    draw();
  });
  root.append(el('div', { class: 'toolbar' }, [
    el('span', { class: 'muted tiny', text: '日期：' }), dateInput,
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted tiny', text: '可补记过去任意一天的餐食；输入后按回车即可添加' }),
  ]));

  root.append(buildCalendar(goal));

  const grid = el('div', { class: 'diet-grid' });
  MEAL_TYPES.forEach((type) => grid.append(buildMealBlock(type.key, type.label, goal)));
  root.append(grid);
  root.append(buildWaterBlock(goal));

  if (R.focusMeal) {
    const key = R.focusMeal;
    R.focusMeal = null;
    setTimeout(() => {
      if (!R) return;
      const input = R.root.querySelector('[data-meal="' + key + '"] .meal-input input');
      if (input) input.focus();
    }, 0);
  }
}

/* ---------------- 日历 ---------------- */
function buildCalendar(goal) {
  const { ctx, date } = R;
  const data = ctx.store.data;
  const today = ctx.today();
  const grid = monthGrid(date, R.monthOffset);

  const card = el('section', { class: 'section-card calendar-card' });
  card.append(el('div', { class: 'calendar-head' }, [
    el('button', {
      class: 'btn ghost small', type: 'button', text: '‹ 上一月',
      onclick: () => { R.monthOffset -= 1; draw(); },
    }),
    el('strong', { class: 'calendar-title', text: grid.label }),
    el('span', { class: 'spacer' }),
    R.monthOffset !== 0 ? el('button', {
      class: 'btn ghost small', type: 'button', text: '回到本月',
      onclick: () => { R.monthOffset = 0; draw(); },
    }) : null,
    el('button', {
      class: 'btn ghost small', type: 'button', text: '下一月 ›',
      onclick: () => { R.monthOffset += 1; draw(); },
    }),
  ]));
  const weekdays = el('div', { class: 'calendar-weekdays' });
  ['一', '二', '三', '四', '五', '六', '日'].forEach((name) => {
    weekdays.append(el('span', { text: '周' + name }));
  });
  card.append(weekdays);

  const body = el('div', { class: 'calendar-grid' });
  grid.weeks.forEach((week) => {
    week.forEach((day) => {
      const summary = dietDaySummary(data, day, goal);
      const classes = ['cal-day'];
      if (day.slice(0, 7) !== grid.monthKey) classes.push('outside');
      if (day === today) classes.push('today');
      if (day === date) classes.push('selected');
      if (summary.hasData) classes.push('has-data');

      const cell = el('div', { class: classes.join(' '), dataset: { date: day } });
      cell.append(el('div', { class: 'cal-num' }, [
        el('span', { text: String(Number(day.slice(8))) }),
        day === today ? el('span', { class: 'cal-today', text: '今' }) : null,
      ]));
      const lines = el('div', { class: 'cal-lines' });
      if (summary.mealCount) {
        lines.append(el('span', {
          class: 'cal-line',
          text: summary.meals.map((meal) => meal.label + ' ' + meal.count).join(' · '),
        }));
      }
      if (summary.water) {
        lines.append(el('span', {
          class: 'cal-line cal-water',
          text: '喝水 ' + summary.water + '/' + summary.goal + ' 杯',
        }));
      }
      cell.append(lines);
      cell.addEventListener('click', () => {
        R.date = day;
        R.monthOffset = 0;
        R.pending = {};
        draw();
      });
      body.append(cell);
    });
  });
  card.append(body);
  return card;
}

/* ---------------- 四餐 ---------------- */
function buildMealBlock(mealType, label, goal) {
  const { ctx, date } = R;
  const data = ctx.store.data;
  const log = mealLogFor(data, date, mealType);
  const items = log ? (log.items || []) : [];
  const block = el('section', { class: 'section-card meal-block', dataset: { meal: mealType } });
  block.append(el('div', { class: 'meal-head' }, [
    el('strong', { text: label }),
    el('span', { class: 'muted tiny', text: items.length ? items.length + ' 条' : '还没记录' }),
    el('span', { class: 'spacer' }),
    items.length ? el('button', {
      class: 'btn ghost small', type: 'button', text: '存为模板',
      onclick: () => saveAsTemplate(items),
    }) : null,
  ]));

  const list = el('div', { class: 'meal-items' });
  items.forEach((text, index) => {
    if (isPending(log, index)) return;
    list.append(el('div', { class: 'meal-item' }, [
      el('span', { class: 'mi-text', text: text }),
      el('button', {
        class: 'btn ghost small', type: 'button', text: '存为模板',
        onclick: () => saveAsTemplate([text]),
      }),
      el('button', {
        class: 'btn ghost small delete-btn', type: 'button', text: '删除',
        onclick: () => deleteMealItemFlow(log, text, index),
      }),
    ]));
  });
  if (!items.length) {
    list.append(el('p', { class: 'muted tiny', text: '还没有记录，输入一条吧。' }));
  }
  block.append(list);

  const input = el('input', { type: 'text', placeholder: label + '吃了什么？回车添加' });
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    ctx.store.mutate((d) => addMealItem(d, date, mealType, text));
    R.focusMeal = mealType;
    draw();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  const templates = (data.mealTemplates || []).filter((item) => !item._pendingDelete);
  block.append(el('div', { class: 'meal-input' }, [
    input,
    el('button', { class: 'btn small', type: 'button', text: '添加', onclick: submit }),
    el('button', {
      class: 'btn ghost small', type: 'button', text: '从模板填入',
      onclick: () => fillFromTemplate(mealType, label),
    }),
  ]));
  if (!templates.length) {
    block.append(el('span', { class: 'muted tiny', text: '还没有模板；任意一条餐食都可以存为模板。' }));
  }
  return block;
}

function isPending(log, index) {
  if (!log) return false;
  return Boolean(R.pending[log.id + '#' + index]);
}

function deleteMealItemFlow(log, text, index) {
  if (!log) return;
  const { ctx } = R;
  const key = log.id + '#' + index;
  deleteWithUndo({
    title: '删除这条餐食记录？',
    body: '「' + text + '」\n删除后 5 秒内可撤销。',
    undoLabel: '已删除餐食',
    onConfirm: () => {
      R.pending[key] = true;
      draw();
    },
    onCommit: () => ctx.store.mutate((d) => removeMealItem(d, log.date, log.mealType, index)),
    onUndo: () => {
      delete R.pending[key];
      if (R) draw();
    },
  });
}

async function saveAsTemplate(items) {
  const values = await form({
    title: '存为餐食模板',
    body: '把 ' + items.length + ' 条餐食保存成一套模板，之后可在任意一天一键填入。',
    fields: [{ name: 'name', label: '模板名称', type: 'text', placeholder: '如 减脂午餐A', required: true }],
    okText: '保存模板',
  });
  if (!values || !R) return;
  R.ctx.store.mutate((d) => createMealTemplate(d, values.name, items));
  toast.success('模板已保存');
}

async function fillFromTemplate(mealType, label) {
  if (!R) return;
  const templates = (R.ctx.store.data.mealTemplates || []).filter((item) => !item._pendingDelete);
  if (!templates.length) {
    toast.success('还没有模板，可以先把某条餐食存为模板。');
    return;
  }
  const value = await choose({
    title: '从模板填入 · ' + label,
    options: templates.map((item) => ({
      value: item.id,
      label: item.name,
      description: (item.items || []).join('、') || '空模板',
    })),
    emptyText: '还没有模板。',
  });
  if (!value || !R) return;
  R.ctx.store.mutate((d) => applyMealTemplate(d, R.date, mealType, value));
  R.focusMeal = mealType;
  draw();
}

/* ---------------- 喝水 ---------------- */
function buildWaterBlock(goal) {
  const { ctx, date } = R;
  const data = ctx.store.data;
  const cups = waterCups(data, date);
  const block = el('section', { class: 'section-card water-block', style: { marginTop: '14px' } });
  block.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '喝水' }),
    el('span', { class: 'section-sub', text: cups + ' / ' + goal + ' 杯' }),
  ]));
  const row = el('div', { class: 'water-cups' });
  for (let i = 1; i <= goal; i += 1) {
    row.append(el('button', {
      type: 'button',
      class: 'water-cup' + (i <= cups ? ' filled' : ''),
      title: i <= cups ? '点一下取消这杯' : '点一下记一杯',
      text: i <= cups ? '●' : '○',
      onclick: () => {
        const next = cups === i ? i - 1 : i;
        ctx.store.mutate((d) => setWaterCups(d, date, next, goal));
        draw();
      },
    }));
  }
  block.append(row);
  block.append(el('p', { class: 'muted tiny', text: '目标杯数可在「数据与设置」里调整（默认 8 杯）。' }));
  return block;
}

/* ---------------- 模板管理 ---------------- */
function openTemplatePanel() {
  if (!R) return;
  const ctx = R.ctx;
  const panel = openPanel({
    width: '40',
    title: '餐食模板管理',
    onClose: () => { if (R) draw(); },
  });
  if (!panel) return;

  function renderList() {
    panel.body.innerHTML = '';
    const templates = (ctx.store.data.mealTemplates || []).filter((item) => !item._pendingDelete);
    if (!templates.length) {
      panel.body.append(emptyState('还没有模板。在任意一餐点「存为模板」即可创建。', null, null));
      return;
    }
    templates.forEach((template) => {
      const name = el('input', { type: 'text', value: template.name || '' });
      name.addEventListener('blur', () => {
        const text = name.value.trim();
        if (!text) { name.value = template.name || ''; return; }
        ctx.store.mutate((d) => renameMealTemplate(d, template.id, text));
        toast.success('模板已改名');
      });
      panel.body.append(el('div', { class: 'settings-block' }, [
        field('模板名称', name),
        el('p', { class: 'muted tiny', text: (template.items || []).join('、') || '空模板' }),
        el('div', { class: 'form-actions' }, [
          el('button', {
            class: 'btn danger small', type: 'button', text: '删除模板',
            onclick: () => deleteTemplateFlow(template),
          }),
        ]),
      ]));
    });
  }

  function deleteTemplateFlow(template) {
    deleteWithUndo({
      title: '删除模板「' + (template.name || '未命名') + '」？',
      body: '只删除模板本身，已经记下的餐食不受影响。删除后 5 秒内可撤销。',
      undoLabel: '已删除模板',
      onConfirm: () => { template._pendingDelete = true; renderList(); },
      onCommit: () => ctx.store.mutate((d) => deleteMealTemplate(d, template.id)),
      onUndo: () => { delete template._pendingDelete; renderList(); },
    });
  }

  renderList();
  panel.setStatus('自动保存');
}

export function newItem() {
  if (R) { R.focusMeal = 'breakfast'; draw(); }
}
