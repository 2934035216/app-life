// views/home.js —— 首页：今日事项区 + 快速备忘区 + 六张模块速览卡
import { fmtDateCN, nowISO, visibleItems } from '../utils.js';
import {
  convertMemoToTodo,
  getTodosFor,
  groupBySlot,
  splitTodos,
  summaries,
  toggleTodo,
  SLOT_LABELS,
  SLOT_ORDER,
} from '../todoEngine.js';
import { addWaterCup, createMemo, deleteMemo } from '../models.js';
import { el, emptyState, deleteWithUndo, pageHead, sourceTag } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  R = { root, ctx, showDone: false };
  root.innerHTML = '';
  draw();
  ctx.onCleanup(() => { R = null; });
}

function draw() {
  if (!R) return;
  const { root, ctx } = R;
  const date = ctx.today();
  const data = ctx.store.data;
  const settings = data.settings || {};
  root.innerHTML = '';

  root.append(pageHead('首页', fmtDateCN(date) + ' · 今天要做什么，一眼看清', []));

  const todoCard = el('section', { class: 'section-card' });
  const memoCard = el('section', { class: 'section-card' });
  const grid = el('div', { class: 'home-grid' }, [todoCard, memoCard]);
  root.append(grid);

  const todos = getTodosFor(date, data);
  const { pending, done } = splitTodos(todos);
  todoCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '今日事项' }),
    el('span', { class: 'section-sub', text: pending.length + ' 条待完成' }),
    el('span', { class: 'spacer' }),
    el('a', { class: 'btn ghost small', href: '#/today', text: '去今日计划' }),
  ]));

  if (pending.length === 0) {
    todoCard.append(emptyState(
      '今天还没有安排，去今日计划加一条，或从右边随手记转一条',
      '去今日计划',
      () => ctx.navigate('#/today')
    ));
  } else {
    const groups = groupBySlot(pending);
    SLOT_ORDER.forEach((slot) => {
      if (!groups[slot].length) return;
      const block = el('div', { class: 'todo-slot' });
      block.append(el('div', { class: 'todo-slot-head' }, [
        el('span', { text: SLOT_LABELS[slot] }),
        el('span', { class: 'muted', text: groups[slot].length + ' 条' }),
      ]));
      groups[slot].forEach((todo) => block.append(buildTodoRow(todo, false)));
      todoCard.append(block);
    });
  }

  if (done.length) {
    const fold = el('button', {
      class: 'done-toggle',
      type: 'button',
      text: (R.showDone ? '收起已完成' : '已完成 ' + done.length + ' 条（展开回看）'),
      onclick: () => { R.showDone = !R.showDone; draw(); },
    });
    todoCard.append(fold);
    if (R.showDone) {
      const doneWrap = el('div', { class: 'todo-done-list' });
      done.forEach((todo) => doneWrap.append(buildTodoRow(todo, true)));
      todoCard.append(doneWrap);
    }
  }

  /* ---------------- 快速备忘 ---------------- */
  memoCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '快速备忘' }),
    el('span', { class: 'section-sub', text: '回车即存，仅显示最近 10 条' }),
  ]));
  const input = el('input', {
    type: 'text',
    placeholder: '冒出的想法，回车记下来',
    class: 'memo-entry',
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const text = input.value.trim();
    if (!text) return;
    ctx.store.mutate((d) => { createMemo(d, text); });
    input.value = '';
    refreshMemo();
  });
  const listWrap = el('div', { class: 'memo-list' });
  memoCard.append(el('div', { class: 'memo-input' }, [input]), listWrap);
  R.memoList = listWrap;
  R.memoInput = input;
  refreshMemo();

  /* ---------------- 六张速览卡 ---------------- */
  root.append(el('div', { class: 'section-head', style: { marginTop: '20px' } }, [
    el('h2', { text: '模块速览' }),
    el('span', { class: 'section-sub', text: '点快捷入口直接落到对应操作' }),
  ]));
  const cardGrid = el('div', { class: 'card-grid' });
  const summary = summaries(data, date, settings);
  const hidden = settings.hiddenModules || [];

  const cards = [
    {
      key: 'selfmedia', name: '自媒体', route: '#/selfmedia',
      summary: summary.selfmedia.text,
      actions: [
        {
          label: '记选题', run: () => ctx.navigate('#/selfmedia?new=1'),
        },
        summary.selfmedia.firstScheduledId ? {
          label: '去发布', primary: true,
          run: () => ctx.navigate('#/selfmedia?open=' + summary.selfmedia.firstScheduledId),
        } : null,
      ],
    },
    {
      key: 'dev', name: '开发工作', route: '#/dev',
      summary: summary.dev.text,
      actions: [{ label: '记一笔', run: () => ctx.navigate('#/dev?log=1') }],
    },
    {
      key: 'consult', name: '咨询工作', route: '#/consult',
      summary: summary.consult.text,
      actions: [
        {
          label: '记一次咨询',
          run: () => {
            if (summary.consult.firstClientId) ctx.navigate('#/consult?open=' + summary.consult.firstClientId + '&compose=1');
            else ctx.navigate('#/consult?new=1');
          },
        },
        summary.consult.dueClientId ? {
          label: '去跟进', primary: true,
          run: () => ctx.navigate('#/consult?open=' + summary.consult.dueClientId + '&compose=1'),
        } : null,
      ],
    },
    {
      key: 'fitness', name: '健身计划', route: '#/fitness',
      summary: summary.fitness.text,
      actions: [
        { label: '今天打卡', run: () => ctx.navigate('#/fitness?tab=logs&checkin=1') },
        { label: '记体重', run: () => ctx.navigate('#/fitness?tab=weight&focus=weight') },
      ],
    },
    {
      key: 'diet', name: '饮食计划', route: '#/diet',
      summary: summary.diet.text,
      actions: [
        { label: '记一餐', run: () => ctx.navigate('#/diet?focus=nextmeal') },
        {
          label: '喝水 +1',
          run: () => {
            ctx.store.mutate((d) => addWaterCup(d, date, settings.waterGoal));
            draw();
          },
        },
      ],
    },
    {
      key: 'game', name: '游戏娱乐', route: '#/game',
      summary: summary.game.text,
      actions: [{ label: '记时长', run: () => ctx.navigate('#/game?checkin=1') }],
    },
  ];

  cards.forEach((card) => {
    if (hidden.indexOf(card.key) >= 0) return;
    const actions = (card.actions || []).filter(Boolean).map((action) => el('button', {
      type: 'button',
      class: 'btn small' + (action.primary ? ' primary' : ''),
      text: action.label,
      onclick: action.run,
    }));
    const node = el('div', { class: 'panel-card overview-card' }, [
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-name', text: card.name }),
        el('button', {
          class: 'btn ghost card-jump',
          type: 'button',
          title: '进入' + card.name,
          text: '›',
          onclick: () => ctx.navigate(card.route),
        }),
      ]),
      el('div', { class: 'card-summary', text: card.summary }),
      el('div', { class: 'card-actions' }, actions),
    ]);
    cardGrid.append(node);
  });
  root.append(cardGrid);
}

function buildTodoRow(todo, isDone) {
  const { ctx } = R;
  const date = ctx.today();
  const checkbox = el('input', {
    type: 'checkbox',
    checked: isDone ? true : null,
  });
  const row = el('div', { class: 'todo-row' + (isDone ? ' done' : '') }, [
    checkbox,
    sourceTag(todo.source),
    el('span', { class: 'todo-title', text: todo.title }),
    todo.priority === 'high' ? el('span', { class: 'badge high', text: '高' }) : null,
  ]);
  checkbox.addEventListener('change', () => {
    if (!isDone && !checkbox.checked) return;
    row.classList.add('collapsing');
    setTimeout(() => {
      ctx.store.mutate((d) => toggleTodo(todo, d, { date }));
      if (!R) return;
      const wasOpen = R.showDone;
      R.showDone = wasOpen;
      draw();
    }, 180);
  });
  return row;
}

function refreshMemo() {
  if (!R) return;
  const { ctx } = R;
  const data = ctx.store.data;
  const list = visibleItems(data.memos)
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 10);
  const wrap = R.memoList;
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.append(el('p', { class: 'muted tiny', text: '还没有备忘，随手记一条吧。' }));
    return;
  }
  list.forEach((memo) => {
    const timeText = String(memo.createdAt || '').slice(11, 16);
    const row = el('div', { class: 'memo-row' }, [
      el('span', { class: 'memo-text', text: memo.text }),
      memo.convertedToTodo ? el('span', { class: 'badge ok', text: '已转' }) : null,
      el('span', { class: 'memo-time', text: timeText }),
      el('div', { class: 'memo-actions' }, [
        memo.convertedToTodo ? null : el('button', {
          type: 'button',
          class: 'btn ghost small',
          text: '转待办',
          onclick: () => {
            const date = ctx.today();
            ctx.store.mutate((d) => convertMemoToTodo(d, memo.id, date));
            draw();
          },
        }),
        el('button', {
          type: 'button',
          class: 'btn ghost small danger-text',
          text: '删除',
          onclick: () => {
            deleteWithUndo({
              title: '删除这条备忘？',
              body: '「' + memo.text + '」\n删除后 5 秒内可撤销。',
              undoLabel: '已删除备忘',
              onConfirm: () => {
                memo._pendingDelete = true;
                refreshMemo();
              },
              onCommit: () => ctx.store.mutate((d) => deleteMemo(d, memo.id)),
              onUndo: () => { delete memo._pendingDelete; refreshMemo(); },
            });
          },
        }),
      ]),
    ]);
    wrap.append(row);
  });
}

export function newItem() {
  // 首页没有新建入口（N 快捷键不生效）
}
