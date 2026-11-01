// views/today.js —— 今日计划：日期翻页、早/白/晚三段、行内创建、日终整理
import { addDays, fmtDateCN, isDateStr, visibleItems } from '../utils.js';
import {
  addManualTodo,
  getTodosFor,
  groupBySlot,
  restoreRollover,
  rolloverTodos,
  SLOT_LABELS,
  SLOT_ORDER,
  splitTodos,
  toggleTodo,
} from '../todoEngine.js';
import { removeItem } from '../models.js';
import { confirm } from '../ui/dialog.js';
import * as undo from '../ui/undo.js';
import { el, emptyState, deleteWithUndo, pageHead, sourceTag } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  const today = ctx.today();
  const requested = params && params.date;
  const date = isDateStr(requested) ? requested : today;
  R = { root, ctx, date, today, openSlot: null, showDone: true };
  root.innerHTML = '';
  draw();
  ctx.onCleanup(() => { R = null; });
}

function draw() {
  if (!R) return;
  const { root, ctx, date, today } = R;
  const data = ctx.store.data;
  const readonly = date < today;
  root.innerHTML = '';

  const actions = [
    el('button', {
      class: 'btn', type: 'button', text: '← 前一天',
      onclick: () => ctx.navigate('#/today?date=' + addDays(date, -1)),
    }),
    el('button', {
      class: 'btn', type: 'button', text: '后一天 →',
      onclick: () => ctx.navigate('#/today?date=' + addDays(date, 1)),
    }),
  ];
  if (date !== today) {
    actions.push(el('button', {
      class: 'btn ghost', type: 'button', text: '回到今天',
      onclick: () => ctx.navigate('#/today'),
    }));
  }

  root.append(pageHead(
    '今日计划',
    fmtDateCN(date) + (date === today ? ' · 今天' : (readonly ? ' · 历史日期（只读）' : ' · 未来日期')),
    actions
  ));

  if (readonly) {
    root.append(el('div', { class: 'section-card', style: { marginBottom: '14px' } }, [
      el('p', { class: 'muted tiny', text: '历史日期只读：可以查看当天的清单与完成情况，不能勾选或新增。' }),
    ]));
  }

  const todos = getTodosFor(date, data);
  const { pending, done } = splitTodos(todos);

  if (!pending.length && !done.length) {
    root.append(emptyState(
      readonly ? '这一天没有记录。' : '这一天还没有安排，在下面每段添加一条临时事项吧。',
      null, null
    ));
  }

  const groups = groupBySlot(pending);
  SLOT_ORDER.forEach((slot) => {
    const section = el('section', { class: 'section-card', style: { marginBottom: '12px' } });
    section.append(el('div', { class: 'section-head' }, [
      el('h2', { text: SLOT_LABELS[slot] }),
      el('span', { class: 'section-sub', text: groups[slot].length + ' 条待完成' }),
    ]));
    if (!groups[slot].length) {
      section.append(el('p', { class: 'muted tiny', text: '这一段还没有事项。' }));
    }
    groups[slot].forEach((todo) => section.append(buildRow(todo, false, readonly)));
    if (!readonly) {
      if (R.openSlot === slot) {
        section.append(buildInlineForm(slot));
      } else {
        section.append(el('button', {
          class: 'btn ghost small',
          type: 'button',
          text: '+ 加一条',
          onclick: () => { R.openSlot = slot; draw(); },
        }));
      }
    }
    root.append(section);
  });

  /* 已完成折叠区 */
  if (done.length) {
    const doneCard = el('section', { class: 'section-card' });
    const toggle = el('button', {
      class: 'done-toggle',
      type: 'button',
      text: (R.showDone ? '收起已完成' : '已完成 ' + done.length + ' 条（展开回看）'),
      onclick: () => { R.showDone = !R.showDone; draw(); },
    });
    doneCard.append(toggle);
    if (R.showDone) {
      done.forEach((todo) => doneCard.append(buildRow(todo, true, readonly)));
    }
    root.append(doneCard);
  }

  /* 日终整理 */
  if (date === today) {
    const bar = el('div', { class: 'row wrap', style: { marginTop: '8px' } });
    bar.append(el('button', {
      class: 'btn',
      type: 'button',
      text: '日终整理',
      disabled: pending.length === 0 ? true : null,
      onclick: () => runRollover(),
    }));
    bar.append(el('span', {
      class: 'muted tiny',
      text: pending.length ? '还有 ' + pending.length + ' 条未完成，可一键顺延到明天（手动触发，5 秒内可撤销）。' : '今天的事项都完成了。',
    }));
    root.append(bar);
  }
}

function buildRow(todo, isDone, readonly) {
  const { ctx, date } = R;
  const checkbox = el('input', {
    type: 'checkbox',
    checked: isDone ? true : null,
    disabled: readonly ? true : null,
  });
  const row = el('div', { class: 'todo-row' + (isDone ? ' done' : '') }, [
    checkbox,
    sourceTag(todo.source),
    el('span', { class: 'todo-title', text: todo.title }),
    todo.priority === 'high' ? el('span', { class: 'badge high', text: '高' }) : null,
  ]);
  if (todo.source === 'manual' && !readonly) {
    row.append(el('button', {
      class: 'btn ghost small delete-btn',
      type: 'button',
      text: '删除',
      onclick: () => deleteManual(todo),
    }));
  }
  if (!readonly) {
    checkbox.addEventListener('change', () => {
      row.classList.add('collapsing');
      setTimeout(() => {
        ctx.store.mutate((d) => toggleTodo(todo, d, { date }));
        if (!R) return;
        draw();
      }, 180);
    });
  }
  return row;
}

function buildInlineForm(slot) {
  const { ctx, date } = R;
  const title = el('input', { type: 'text', placeholder: '临时事项标题（必填）' });
  const slotSelect = el('select', {});
  SLOT_ORDER.forEach((key) => {
    const opt = el('option', { value: key, text: SLOT_LABELS[key] });
    if (key === slot) opt.selected = true;
    slotSelect.append(opt);
  });
  const prioritySelect = el('select', {});
  [['normal', '普通'], ['high', '高']].forEach((pair) => {
    prioritySelect.append(el('option', { value: pair[0], text: pair[1] }));
  });
  const submit = () => {
    const text = title.value.trim();
    if (!text) {
      title.focus();
      return;
    }
    ctx.store.mutate((d) => addManualTodo(d, {
      title: text,
      planDate: date,
      timeSlot: slotSelect.value,
      priority: prioritySelect.value,
    }));
    R.openSlot = null;
    draw();
  };
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') { R.openSlot = null; draw(); }
  });
  const form = el('div', { class: 'form-inline', style: { marginTop: '6px' } }, [
    title, slotSelect, prioritySelect,
    el('button', { class: 'btn primary small', type: 'button', text: '添加', onclick: submit }),
    el('button', { class: 'btn ghost small', type: 'button', text: '取消', onclick: () => { R.openSlot = null; draw(); } }),
  ]);
  setTimeout(() => title.focus(), 0);
  return form;
}

function deleteManual(todo) {
  const { ctx } = R;
  deleteWithUndo({
    title: '删除这条临时事项？',
    body: '「' + todo.title + '」\n删除后 5 秒内可撤销。',
    undoLabel: '已删除临时事项',
    onConfirm: () => {
      const item = (ctx.store.data.todos || []).find((t) => t.id === todo.id);
      if (item) item._pendingDelete = true;
      draw();
    },
    onCommit: () => ctx.store.mutate((d) => removeItem(d.todos, todo.id)),
    onUndo: () => {
      const item = (ctx.store.data.todos || []).find((t) => t.id === todo.id);
      if (item) delete item._pendingDelete;
      draw();
    },
  });
}

async function runRollover() {
  const { ctx, today } = R;
  const pending = splitTodos(getTodosFor(today, ctx.store.data)).pending;
  if (!pending.length) return;
  const ok = await confirm({
    title: '日终整理',
    body: '还有 ' + pending.length + ' 条未完成，顺延到明天？\n顺延后 5 秒内可撤销。',
    okText: '顺延到明天',
  });
  if (!ok || !R) return;
  const tomorrow = addDays(today, 1);
  const result = ctx.store.mutate((d) => rolloverTodos(today, tomorrow, d));
  draw();
  undo.show({
    label: '已顺延 ' + result.count + ' 条到明天',
    seconds: 5,
    onCommit: () => { /* 已落盘，无需额外提交 */ },
    onUndo: () => {
      ctx.store.mutate((d) => restoreRollover(d, result.snapshot));
      if (R) draw();
    },
  });
}

export function newItem(store, ctx) {
  if (!R) return;
  R.openSlot = 'afternoon';
  draw();
}
