// views/game.js —— 游戏娱乐：在玩/想玩/已通关三页签 + 时长打卡
import { fmtDateCN, fmtMinutes, sortByKeyDesc, visibleItems } from '../utils.js';
import {
  GAME_STATUS,
  addGameSession,
  createGame,
  deleteGame,
  deleteGameSession,
  findById,
  gameWeeklyMinutes,
  recalcGameTotals,
  setGameStatus,
  updateGame,
  updateGameSession,
} from '../models.js';
import { form } from '../ui/dialog.js';
import { openPanel, closePanel } from '../ui/panel.js';
import * as toast from '../ui/toast.js';
import { el, emptyState, deleteWithUndo, field, pageHead, tabs } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  R = { root, ctx, tab: 'playing' };
  root.innerHTML = '';
  draw();
  ctx.onCleanup(() => { R = null; });
  if (params && params.checkin) {
    setTimeout(() => {
      if (!R) return;
      const data = ctx.store.data;
      const playing = visibleItems(data.games).filter((game) => game.status === 'playing');
      if (playing.length) openCheckin(playing[0]);
      else toast.success('还没有"在玩"的游戏，先添加一个并把状态改为在玩吧。');
    }, 0);
    if (typeof history !== 'undefined' && history.replaceState) {
      try { history.replaceState(null, '', '#/game'); } catch (err) { /* 忽略 */ }
    }
  }
}

function draw() {
  if (!R) return;
  const { root, ctx } = R;
  root.innerHTML = '';
  root.append(pageHead('游戏娱乐', '分状态管理，记时长与进度，本周娱乐量上首页', [
    el('button', {
      class: 'btn primary', type: 'button', text: '+ 新建游戏',
      onclick: () => openGamePanel(null),
    }),
  ]));
  const data = ctx.store.data;
  const games = visibleItems(data.games);
  root.append(tabs([
    { key: 'playing', label: '在玩 · ' + games.filter((g) => g.status === 'playing').length },
    { key: 'wishlist', label: '想玩 · ' + games.filter((g) => g.status === 'wishlist').length },
    { key: 'finished', label: '已通关 · ' + games.filter((g) => g.status === 'finished').length },
  ], R.tab, (key) => { R.tab = key; draw(); }));

  const list = games.filter((game) => game.status === R.tab);
  if (!list.length) {
    const emptyText = R.tab === 'playing'
      ? '现在没有在玩的游戏。添加一个，玩起来吧。'
      : (R.tab === 'wishlist' ? '想玩的清单还空着。' : '还没有通关记录。');
    root.append(emptyState(emptyText, '新建游戏', () => openGamePanel(null)));
    return;
  }
  const grid = el('div', { class: 'game-grid' });
  list.forEach((game) => grid.append(buildGameCard(game)));
  root.append(grid);
}

function buildGameCard(game) {
  const { ctx } = R;
  const weekly = gameWeeklyMinutes(ctx.store.data, game.id, ctx.today());
  const card = el('div', {
    class: 'game-card',
    onclick: () => openGamePanel(game.id),
  }, [
    el('div', { class: 'game-name', text: game.name || '（未命名游戏）' }),
    el('div', { class: 'game-meta' }, [
      el('span', { text: '累计 ' + fmtMinutes(game.totalMinutes || 0) }),
      game.status === 'playing' ? el('span', { text: '本周 ' + fmtMinutes(weekly) }) : null,
      game.status === 'finished' && game.finishedDate ? el('span', { text: '通关 ' + game.finishedDate }) : null,
    ]),
    el('div', { class: 'game-progress', text: game.progress || '还没有进度备注' }),
    game.status === 'finished' && game.review ? el('div', { class: 'muted tiny', text: '评价：' + game.review }) : null,
    game.status === 'playing' ? el('div', { class: 'form-actions' }, [
      el('button', {
        class: 'btn primary small', type: 'button', text: '打卡记时长',
        onclick: (event) => { event.stopPropagation(); openCheckin(game); },
      }),
    ]) : null,
  ]);
  return card;
}

/* ---------------- 时长打卡 ---------------- */
async function openCheckin(game) {
  if (!R) return;
  const values = await form({
    title: '给《' + (game.name || '未命名') + '》记时长',
    fields: [
      { name: 'minutes', label: '玩了多久（分钟）', type: 'number', value: '', placeholder: '如 60', required: true },
      { name: 'date', label: '日期（可补记）', type: 'date', value: R.ctx.today() },
    ],
    okText: '记录时长',
  });
  if (!values || !R) return;
  const minutes = Math.floor(Number(values.minutes));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    toast.error('分钟数需要大于 0。');
    return;
  }
  const date = values.date || R.ctx.today();
  R.ctx.store.mutate((d) => addGameSession(d, game.id, minutes, date));
  draw();
  toast.success('已记录 ' + minutes + ' 分钟');
}

/* ---------------- 游戏面板 ---------------- */
function openGamePanel(id) {
  if (!R) return;
  const ctx = R.ctx;
  const data = ctx.store.data;
  let game = id ? findById(data.games, id) : null;
  const draft = {
    name: game ? game.name : '',
    progress: game ? game.progress : '',
    status: game ? game.status : 'wishlist',
    review: game ? game.review : '',
    finishedDate: game ? game.finishedDate : null,
  };
  const panel = openPanel({
    width: '40',
    title: game ? '游戏详情' : '新建游戏',
    onClose: () => {
      if (!game && draft.name.trim()) {
        ctx.store.mutate((d) => createGame(d, {
          name: draft.name.trim(),
          progress: draft.progress,
          status: draft.status,
        }));
        if (R) draw();
      }
    },
  });
  if (!panel) return;

  function ensure() {
    if (game) return game;
    if (!draft.name.trim()) return null;
    game = ctx.store.mutate((d) => createGame(d, {
      name: draft.name.trim(),
      progress: draft.progress,
      status: draft.status,
    }));
    panel.setTitle('游戏详情');
    if (R) draw();
    renderBody();
    return game;
  }

  function save(patch) {
    if (!ensure()) return;
    ctx.store.mutate((d) => updateGame(d, game.id, patch));
    if (R) draw();
  }

  function renderBody() {
    panel.body.innerHTML = '';
    const name = el('input', { type: 'text', value: draft.name, placeholder: '游戏名称（必填）' });
    name.addEventListener('input', () => { draft.name = name.value; });
    name.addEventListener('blur', () => {
      const text = name.value.trim();
      if (!text) { name.value = game ? game.name : ''; return; }
      draft.name = text;
      save({ name: text });
      panel.setTitle('游戏详情');
    });
    const progress = el('input', { type: 'text', value: draft.progress, placeholder: '进度备注，如 第三章' });
    progress.addEventListener('input', () => {
      draft.progress = progress.value;
      if (game) ctx.store.mutate((d) => updateGame(d, game.id, { progress: progress.value }));
    });
    const status = el('select', {});
    Object.keys(GAME_STATUS).forEach((key) => {
      const opt = el('option', { value: key, text: GAME_STATUS[key] });
      if (draft.status === key) opt.selected = true;
      status.append(opt);
    });
    status.addEventListener('change', async () => {
      const next = status.value;
      if (next === 'finished') {
        const values = await form({
          title: '标记已通关',
          body: '填写通关日期与一句话评价（评价可空）。',
          fields: [
            { name: 'finishedDate', label: '通关日期', type: 'date', value: ctx.today() },
            { name: 'review', label: '一句话评价（可空）', type: 'text', value: draft.review || '' },
          ],
          okText: '确认通关',
        });
        if (!values || !R) { status.value = draft.status; return; }
        draft.status = 'finished';
        draft.finishedDate = values.finishedDate || ctx.today();
        draft.review = values.review || '';
        if (!ensure()) return;
        ctx.store.mutate((d) => setGameStatus(d, game.id, 'finished', {
          finishedDate: draft.finishedDate,
          review: draft.review,
        }));
        if (R) draw();
        renderBody();
        return;
      }
      draft.status = next;
      if (!ensure()) return;
      ctx.store.mutate((d) => setGameStatus(d, game.id, next));
      if (R) draw();
    });

    panel.body.append(el('div', { class: 'form-grid' }, [
      field('游戏名称（必填）', name),
      field('进度备注', progress),
      field('状态', status, '改为"已通关"会先请你填通关日期与评价'),
      game && game.status === 'finished' ? el('div', { class: 'form-field' }, [
        el('label', { text: '通关信息' }),
        el('p', { class: 'muted tiny', text: (game.finishedDate || '未填日期') + ' · ' + (game.review || '无评价') }),
      ]) : null,
    ]));

    if (game) {
      const sessions = visibleItems(ctx.store.data.gameSessions)
        .filter((session) => session.gameId === game.id)
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
      panel.body.append(el('div', { class: 'divider' }));
      panel.body.append(el('div', { class: 'section-head' }, [
        el('h3', { text: '时长明细' }),
        el('span', { class: 'section-sub', text: '累计 ' + fmtMinutes(game.totalMinutes || 0) }),
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'btn small primary', type: 'button', text: '打卡',
          onclick: () => openCheckin(game),
        }),
      ]));
      if (!sessions.length) {
        panel.body.append(el('p', { class: 'muted tiny', text: '还没有时长记录。' }));
      }
      sessions.forEach((session) => {
        const date = el('input', { type: 'date', value: session.date || '', style: { width: '138px' } });
        date.addEventListener('change', () => {
          if (!date.value) { date.value = session.date; return; }
          ctx.store.mutate((d) => updateGameSession(d, session.id, { date: date.value }));
          if (R) draw();
        });
        const minutes = el('input', { type: 'number', min: '1', value: session.minutes || 1, style: { width: '88px' } });
        minutes.addEventListener('change', () => {
          const value = Math.floor(Number(minutes.value) || 0);
          if (value <= 0) { minutes.value = session.minutes; return; }
          ctx.store.mutate((d) => updateGameSession(d, session.id, { minutes: value }));
          if (R) draw();
        });
        panel.body.append(el('div', { class: 'workout-log-row' }, [
          date, minutes, el('span', { class: 'muted tiny', text: '分钟' }),
          el('span', { class: 'spacer' }),
          el('button', {
            class: 'btn ghost small', type: 'button', text: '删除',
            onclick: () => deleteSessionFlow(session),
          }),
        ]));
      });

      panel.body.append(el('div', { class: 'divider' }));
      panel.body.append(el('div', { class: 'form-actions' }, [
        el('button', {
          class: 'btn danger', type: 'button', text: '删除游戏',
          onclick: () => deleteGameFlow(game),
        }),
      ]));
    }
    panel.setStatus('自动保存');
  }

  function deleteSessionFlow(session) {
    deleteWithUndo({
      title: '删除这条时长记录？',
      body: '删除后累计时长会自动重算，5 秒内可撤销。',
      undoLabel: '已删除时长记录',
      onConfirm: () => {
        session._pendingDelete = true;
        ctx.store.mutate((d) => recalcGameTotals(d, game.id));
        renderBody();
        if (R) draw();
      },
      onCommit: () => ctx.store.mutate((d) => deleteGameSession(d, session.id)),
      onUndo: () => {
        delete session._pendingDelete;
        ctx.store.mutate((d) => recalcGameTotals(d, game.id));
        renderBody();
        if (R) draw();
      },
    });
  }

  function deleteGameFlow(target) {
    const sessions = visibleItems(ctx.store.data.gameSessions).filter((s) => s.gameId === target.id);
    deleteWithUndo({
      title: '删除游戏《' + (target.name || '未命名') + '》？',
      body: sessions.length + ' 条时长明细一并删除。\n删除后 5 秒内可撤销。',
      undoLabel: '已删除游戏',
      onConfirm: () => {
        target._pendingDelete = true;
        sessions.forEach((session) => { session._pendingDelete = true; });
        closePanel();
        if (R) draw();
      },
      onCommit: () => ctx.store.mutate((d) => deleteGame(d, target.id)),
      onUndo: () => {
        delete target._pendingDelete;
        sessions.forEach((session) => { delete session._pendingDelete; });
        if (R) draw();
      },
    });
  }

  renderBody();
}

export function newItem() {
  if (R) openGamePanel(null);
}
