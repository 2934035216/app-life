// views/selfmedia.js —— 四列看板 / 已发布列表 / 全屏写稿
import { debounce, fmtDateCN, nowISO, sortByKeyDesc, visibleItems } from '../utils.js';
import {
  CONTENT_STATUS,
  PLATFORM_OPTIONS,
  createContent,
  deleteContent,
  findById,
  platformLabel,
  publishContent,
  setContentStatus,
  updateContent,
  updateContentMetrics,
} from '../models.js';
import { confirm, form } from '../ui/dialog.js';
import * as toast from '../ui/toast.js';
import { openPanel, closePanel } from '../ui/panel.js';
import { el, emptyState, deleteWithUndo, field, pageHead } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  R = {
    root, ctx, params: params || {}, search: '', platform: '', view: 'board', justDragged: false,
  };
  root.innerHTML = '';
  if (R.params.writeId) {
    renderWritePage();
    ctx.onCleanup(() => { R = null; });
    return;
  }
  draw();
  ctx.onCleanup(() => { R = null; });
  const queryParams = R.params;
  setTimeout(() => {
    if (!R) return;
    if (queryParams.open) openEditor(queryParams.open);
    else if (queryParams.new === '1') openEditor(null);
  }, 0);
}

function filtered() {
  const data = R.ctx.store.data;
  const search = R.search.trim().toLowerCase();
  return visibleItems(data.contents).filter((item) => {
    if (R.platform && (item.platforms || []).indexOf(R.platform) < 0) return false;
    if (search && String(item.title || '').toLowerCase().indexOf(search) < 0) return false;
    return true;
  });
}

function draw() {
  const { root, ctx } = R;
  root.innerHTML = '';
  const actions = [
    el('button', {
      class: 'btn', type: 'button', text: '看板视图',
      onclick: () => { R.view = 'board'; draw(); },
    }),
    el('button', {
      class: 'btn', type: 'button', text: '已发布列表',
      onclick: () => { R.view = 'list'; draw(); },
    }),
    el('button', {
      class: 'btn primary', type: 'button', text: '+ 新建选题',
      onclick: () => openEditor(null),
    }),
  ];
  root.append(pageHead('自媒体', '选题 → 写稿 → 排发布 → 回填数据', actions));

  const search = el('input', { type: 'search', class: 'search', placeholder: '搜索标题…', value: R.search });
  search.addEventListener('input', () => {
    R.search = search.value;
    refreshViews();
  });
  const platform = el('select', {});
  platform.append(el('option', { value: '', text: '全部平台' }));
  PLATFORM_OPTIONS.forEach((opt) => {
    const node = el('option', { value: opt.key, text: opt.label });
    if (opt.key === R.platform) node.selected = true;
    platform.append(node);
  });
  platform.addEventListener('change', () => {
    R.platform = platform.value;
    refreshViews();
  });
  const toolbar = el('div', { class: 'toolbar' }, [
    search, platform,
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted tiny', text: '拖拽卡片可换列；拖入"已发布"会先确认发布日期' }),
  ]);
  root.append(toolbar);
  const content = el('div', {});
  root.append(content);
  R.content = content;
  refreshViews();
}

function refreshViews() {
  if (!R) return;
  const box = R.content;
  if (!box) return;
  box.innerHTML = '';
  const items = filtered();
  if (!items.length) {
    box.append(emptyState(
      R.search || R.platform ? '没有匹配的选题。' : '还没有选题，把第一个想法记下来吧。',
      '新建选题',
      () => openEditor(null)
    ));
    return;
  }
  if (R.view === 'list') renderList(items, box);
  else renderBoard(items, box);
}

function renderBoard(items, box) {
  const board = el('div', { class: 'board' });
  ['idea', 'writing', 'scheduled', 'published'].forEach((status) => {
    const colItems = items.filter((item) => item.status === status);
    const col = el('div', { class: 'board-col', dataset: { status } });
    col.append(el('div', { class: 'board-col-head' }, [
      el('strong', { text: CONTENT_STATUS[status] }),
      el('span', { class: 'count', text: colItems.length + ' 条' }),
    ]));
    colItems.forEach((item) => col.append(buildCard(item)));
    col.addEventListener('dragover', (event) => {
      event.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', (event) => {
      event.preventDefault();
      col.classList.remove('drag-over');
      const id = event.dataTransfer ? event.dataTransfer.getData('text/plain') : R.dragId;
      handleDrop(status, id);
    });
    board.append(col);
  });
  box.append(board);
}

function buildCard(item) {
  const card = el('div', {
    class: 'content-card',
    draggable: 'true',
  });
  card.append(el('div', { class: 'content-title', text: item.title || '（未命名选题）' }));
  const chips = el('div', { class: 'content-meta' });
  (item.platforms || []).forEach((key) => {
    chips.append(el('span', { class: 'platform-chip', text: platformLabel(key) }));
  });
  if (item.status === 'scheduled' && item.scheduledDate) {
    chips.append(el('span', { text: '目标 ' + fmtDateCN(item.scheduledDate) }));
  }
  if (item.status === 'published') {
    chips.append(el('span', { text: '发布 ' + (item.publishedDate ? fmtDateCN(item.publishedDate) : '—') }));
    const metrics = item.metrics || {};
    chips.append(el('span', { text: '播放 ' + (metrics.views || 0) + ' · 赞 ' + (metrics.likes || 0) }));
  }
  card.append(chips);
  if (item.status === 'writing') {
    card.append(el('button', {
      class: 'btn ghost small',
      type: 'button',
      text: '写稿',
      onclick: (event) => {
        event.stopPropagation();
        R.ctx.navigate('#/selfmedia/write/' + item.id);
      },
    }));
  }
  card.addEventListener('click', () => {
    if (R.justDragged) return;
    openEditor(item.id);
  });
  card.addEventListener('dragstart', (event) => {
    R.dragId = item.id;
    card.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    R.justDragged = true;
    setTimeout(() => { R.justDragged = false; }, 120);
  });
  return card;
}

function renderList(items, box) {
  const list = visibleItems(items).filter((item) => item.status === 'published');
  if (!list.length) {
    box.append(emptyState('还没有已发布的内容。', '回到看板', () => { R.view = 'board'; draw(); }));
    return;
  }
  const sorted = sortByKeyDesc(list, 'publishedDate');
  const card = el('section', { class: 'section-card' });
  card.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '已发布' }),
    el('span', { class: 'section-sub', text: '按发布日期倒序' }),
  ]));
  sorted.forEach((item) => {
    const metrics = item.metrics || {};
    card.append(el('div', { class: 'content-list-row' }, [
      el('span', { class: 'cl-title', text: item.title || '（未命名）' }),
      el('span', { class: 'muted tiny', text: item.publishedDate ? fmtDateCN(item.publishedDate) : '—' }),
      el('span', { class: 'muted tiny', text: '播放 ' + (metrics.views || 0) + ' · 赞 ' + (metrics.likes || 0) + ' · 评 ' + (metrics.comments || 0) }),
      el('button', {
        class: 'btn small', type: 'button', text: '详情',
        onclick: () => openEditor(item.id),
      }),
    ]));
  });
  box.append(card);
}

async function handleDrop(status, id) {
  const ctx = R.ctx;
  const item = findById(ctx.store.data.contents, id);
  if (!item || item.status === status) return;
  if (status === 'published') {
    await publishFlow(item);
    return;
  }
  ctx.store.mutate((d) => setContentStatus(d, id, status));
  refreshViews();
}

async function publishFlow(item) {
  const ctx = R.ctx;
  const values = await form({
    title: '确认发布',
    body: '《' + (item.title || '未命名') + '》将进入"已发布"。链接可以留空，之后再补。',
    fields: [
      { name: 'publishedDate', label: '实际发布日期', type: 'date', value: ctx.today() },
      { name: 'link', label: '链接（可空）', type: 'text', value: item.link || '', placeholder: 'https://…' },
    ],
    okText: '确认发布',
  });
  if (!values) return;
  ctx.store.mutate((d) => publishContent(d, item.id, {
    publishedDate: values.publishedDate || ctx.today(),
    link: values.link || '',
  }));
  refreshViews();
  if (R && R.panelRefresh) R.panelRefresh();
}

/* ---------------- 新建/编辑面板 ---------------- */
function openEditor(id) {
  if (!R) return;
  if (typeof history !== 'undefined' && history.replaceState) {
    try { history.replaceState(null, '', '#/selfmedia'); } catch (err) { /* 忽略 */ }
  }
  const ctx = R.ctx;
  const data = ctx.store.data;
  let item = id ? findById(data.contents, id) : null;
  const draft = {
    title: item ? item.title : '',
    platforms: item ? (item.platforms || []).slice() : [],
    status: item ? item.status : 'idea',
    scheduledDate: item ? item.scheduledDate : null,
    publishedDate: item ? item.publishedDate : null,
    link: item ? item.link : '',
  };

  const p = openPanel({
    width: '40',
    title: item ? '编辑选题' : '新建选题',
    onClose: () => {
      if (!item && draft.title.trim()) {
        ctx.store.mutate((d) => createContent(d, {
          title: draft.title.trim(),
          platforms: draft.platforms,
          status: draft.status,
          scheduledDate: draft.scheduledDate,
        }));
        refreshViews();
      }
    },
  });
  if (!p) return;

  function ensure() {
    if (item) return item;
    if (!draft.title.trim()) return null;
    item = ctx.store.mutate((d) => createContent(d, {
      title: draft.title.trim(),
      platforms: draft.platforms,
      status: draft.status,
      scheduledDate: draft.scheduledDate,
      publishedDate: draft.publishedDate,
      link: draft.link,
    }));
    p.setTitle('编辑选题');
    refreshViews();
    return item;
  }

  function save(patch, opts) {
    if (!ensure()) return;
    ctx.store.mutate((d) => updateContent(d, item.id, patch), opts);
    refreshViews();
  }

  const titleInput = el('input', { type: 'text', value: draft.title, placeholder: '标题（必填）' });
  titleInput.addEventListener('input', () => {
    draft.title = titleInput.value;
    if (item) {
      item.title = titleInput.value;
    }
  });
  titleInput.addEventListener('blur', () => {
    const text = titleInput.value.trim();
    if (!text) {
      if (item) titleInput.value = item.title || '';
      return;
    }
    draft.title = text;
    save({ title: text });
  });

  const chipsBox = el('div', { class: 'row wrap' });
  function refreshChips() {
    chipsBox.innerHTML = '';
    PLATFORM_OPTIONS.forEach((opt) => {
      const active = draft.platforms.indexOf(opt.key) >= 0;
      chipsBox.append(el('button', {
        type: 'button',
        class: 'btn small' + (active ? ' primary' : ''),
        text: opt.label,
        onclick: () => {
          const idx = draft.platforms.indexOf(opt.key);
          if (idx >= 0) draft.platforms.splice(idx, 1);
          else draft.platforms.push(opt.key);
          refreshChips();
          if (item) {
            ctx.store.mutate((d) => updateContent(d, item.id, { platforms: draft.platforms.slice() }));
            refreshViews();
          }
        },
      }));
    });
  }
  refreshChips();

  const statusSelect = el('select', {});
  ['idea', 'writing', 'scheduled', 'published'].forEach((key) => {
    const opt = el('option', { value: key, text: CONTENT_STATUS[key] });
    if (key === draft.status) opt.selected = true;
    statusSelect.append(opt);
  });
  statusSelect.addEventListener('change', async () => {
    const next = statusSelect.value;
    if (next === 'published') {
      statusSelect.value = draft.status;
      if (item) await publishFlow(item);
      else {
        const values = await form({
          title: '确认发布',
          fields: [
            { name: 'publishedDate', label: '实际发布日期', type: 'date', value: ctx.today() },
            { name: 'link', label: '链接（可空）', type: 'text', value: '' },
          ],
          okText: '确认发布',
        });
        if (!values) return;
        draft.status = 'published';
        draft.publishedDate = values.publishedDate || ctx.today();
        draft.link = values.link || '';
        ensure();
        refreshViews();
      }
      return;
    }
    draft.status = next;
    save({ status: next });
  });

  const scheduledDate = el('input', { type: 'date', value: draft.scheduledDate || '' });
  scheduledDate.addEventListener('change', () => {
    draft.scheduledDate = scheduledDate.value || null;
    save({ scheduledDate: draft.scheduledDate });
  });

  const linkInput = el('input', { type: 'text', value: draft.link || '', placeholder: '可留空，发布后补' });
  linkInput.addEventListener('input', () => { draft.link = linkInput.value; });
  linkInput.addEventListener('blur', () => { save({ link: linkInput.value }); });

  const metrics = (item && item.metrics) || { views: 0, likes: 0, comments: 0, metricsUpdatedAt: null };
  function metricInput(key, label) {
    const input = el('input', { type: 'number', min: '0', value: metrics[key] || 0 });
    input.addEventListener('blur', () => {
      const value = Math.max(0, Math.floor(Number(input.value) || 0));
      input.value = value;
      if (!ensure()) return;
      ctx.store.mutate((d) => updateContentMetrics(d, item.id, { [key]: value }));
      const updated = findById(ctx.store.data.contents, item.id);
      if (updated) updated.metrics = updated.metrics || metrics;
      toast.success('已保存回填数据');
      refreshViews();
    });
    return field(label, input);
  }

  const deleteBtn = el('button', {
    class: 'btn danger', type: 'button', text: '删除这条选题',
    onclick: () => {
      if (!item) { closePanel(); return; }
      const target = item;
      const cascade = target.status === 'published' ? '\n该条目已发布，发布数据将一并删除。' : '\n删除后 5 秒内可撤销。';
      deleteWithUndo({
        title: '删除选题《' + (target.title || '未命名') + '》？',
        body: cascade.trim(),
        undoLabel: '已删除选题',
        onConfirm: () => {
          target._pendingDelete = true;
          closePanel();
          refreshViews();
        },
        onCommit: () => ctx.store.mutate((d) => deleteContent(d, target.id)),
        onUndo: () => {
          delete target._pendingDelete;
          refreshViews();
        },
      });
    },
  });

  const body = el('div', { class: 'form-grid' }, [
    field('标题（必填）', titleInput),
    el('div', { class: 'form-field' }, [el('label', { text: '平台（可多选）' }), chipsBox]),
    field('状态', statusSelect),
    field('目标发布日期', scheduledDate, '状态为"待发布"时请填写；目标日期=今天时会自动进入首页今日事项'),
    field('发布链接', linkInput, '允许为空，发布后再补'),
    item && item.status === 'published' ? el('div', { class: 'form-field' }, [
      el('label', { text: '发布数据回填（播放 / 点赞 / 评论）' }),
      el('div', { class: 'row wrap' }, [
        metricInput('views', '播放'), metricInput('likes', '点赞'), metricInput('comments', '评论'),
      ]),
    ]) : null,
    item ? (() => {
      const savedAt = item.metrics && item.metrics.metricsUpdatedAt;
      return savedAt ? el('p', { class: 'muted tiny', text: '回填时间：' + savedAt.replace('T', ' ') }) : null;
    })() : null,
    el('div', { class: 'divider' }),
    el('div', { class: 'form-actions' }, [
      item && item.status === 'writing' ? el('button', {
        class: 'btn', type: 'button', text: '开始写稿（全屏）',
        onclick: () => { closePanel(); R.ctx.navigate('#/selfmedia/write/' + item.id); },
      }) : null,
      deleteBtn,
    ]),
  ]);
  p.body.append(body);
  p.setStatus('自动保存');
}

/* ---------------- 全屏写稿 ---------------- */
function renderWritePage() {
  const { root, ctx, params } = R;
  const item = findById(ctx.store.data.contents, params.writeId);
  if (!item) {
    root.append(emptyState('这个选题不存在或已被删除。', '返回自媒体', () => ctx.navigate('#/selfmedia')));
    return;
  }
  const savedSpan = el('span', { class: 'write-saved', text: '自动保存' });
  const back = el('button', {
    class: 'btn', type: 'button', text: '← 返回看板',
    onclick: () => {
      flushWrites();
      ctx.store.flushNow();
      ctx.navigate('#/selfmedia');
    },
  });
  root.append(el('div', { class: 'write-page' }, [
    el('div', { class: 'write-head' }, [
      back,
      el('h1', { text: item.title || '（未命名选题）' }),
      el('span', { class: 'badge', text: CONTENT_STATUS[item.status] || item.status }),
      savedSpan,
    ]),
    el('p', { class: 'muted tiny', text: '左栏写大纲，右栏写正文；停止输入 1 秒自动保存，关闭页面不会丢。' }),
  ]));

  const outline = el('textarea', { placeholder: '大纲：要点、结构、素材…' });
  outline.value = item.outline || '';
  const bodyArea = el('textarea', { placeholder: '正文：开始写吧…' });
  bodyArea.value = item.body || '';

  const saveOutline = debounce(() => {
    ctx.store.mutate((d) => updateContent(d, item.id, { outline: outline.value }), { long: true });
  }, 1000);
  const saveBody = debounce(() => {
    ctx.store.mutate((d) => updateContent(d, item.id, { body: bodyArea.value }), { long: true });
  }, 1000);
  outline.addEventListener('input', () => { savedSpan.textContent = '输入中…'; saveOutline(); });
  bodyArea.addEventListener('input', () => { savedSpan.textContent = '输入中…'; saveBody(); });

  root.append(el('div', { class: 'write-body' }, [
    el('div', { class: 'write-pane' }, [el('h3', { text: '大纲' }), outline]),
    el('div', { class: 'write-pane' }, [el('h3', { text: '正文' }), bodyArea]),
  ]));

  flushWrites = function flushWrites() {
    saveOutline.flush();
    saveBody.flush();
  };

  const offSaved = ctx.store.onSaved((clock) => {
    savedSpan.textContent = '已保存 ' + clock;
  });
  ctx.onCleanup(() => {
    flushWrites();
    ctx.store.flushNow();
    offSaved();
  });
}

let flushWrites = function noop() {};

export function newItem() {
  if (R) openEditor(null);
}
