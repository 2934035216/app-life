// views/consult.js —— 咨询工作：客户网格/列表 + 50% 详情面板与咨询时间线
import { addDays, fmtDateCN, nowDateTimeLocal, visibleItems } from '../utils.js';
import {
  CLIENT_STATUS,
  addConsultSession,
  clientSessions,
  createClient,
  deleteClient,
  deleteConsultSession,
  findById,
  lastSessionDate,
  syncClientFollowup,
  updateClient,
} from '../models.js';
import { openPanel, closePanel, isOpen } from '../ui/panel.js';
import { el, emptyState, deleteWithUndo, field, pageHead } from '../ui/common.js';

let R = null;

export function render(root, ctx, params) {
  R = {
    root,
    ctx,
    view: 'grid',
    search: '',
    status: '',
  };
  root.innerHTML = '';
  draw();
  ctx.onCleanup(() => { R = null; });
  const query = params || {};
  setTimeout(() => {
    if (!R) return;
    if (query.open) openClientPanel(query.open, { compose: query.compose === '1' });
    else if (query.new === '1') openClientPanel(null, {});
    if (query.open || query.new) {
      if (typeof history !== 'undefined' && history.replaceState) {
        try { history.replaceState(null, '', '#/consult'); } catch (err) { /* 忽略 */ }
      }
    }
  }, 0);
}

function clients() {
  const data = R.ctx.store.data;
  const search = R.search.trim().toLowerCase();
  const today = R.ctx.today();
  return visibleItems(data.clients)
    .filter((client) => {
      if (R.status && client.status !== R.status) return false;
      if (!search) return true;
      return String(client.name || '').toLowerCase().indexOf(search) >= 0
        || String(client.requirement || '').toLowerCase().indexOf(search) >= 0;
    })
    .sort((a, b) => {
      const da = a.nextFollowupDate || '9999-99-99';
      const db = b.nextFollowupDate || '9999-99-99';
      if (da !== db) return da.localeCompare(db);
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
}

function dueState(client) {
  const today = R.ctx.today();
  if (!client.nextFollowupDate || client.status === 'paused') return { due: false, text: '' };
  if (client.nextFollowupDate < today) return { due: true, text: '已过期 · ' + client.nextFollowupDate };
  if (client.nextFollowupDate === today) return { due: true, text: '今天跟进 · ' + client.nextFollowupDate };
  if (client.nextFollowupDate <= addDays(today, 3)) {
    return { due: true, text: client.nextFollowupDate + ' · 临近' };
  }
  return { due: false, text: '下次跟进 ' + client.nextFollowupDate };
}

function draw() {
  if (!R) return;
  const { root, ctx } = R;
  root.innerHTML = '';
  const headActions = [
    el('button', {
      class: 'btn' + (R.view === 'grid' ? ' primary' : ''),
      type: 'button', text: '卡片',
      onclick: () => { R.view = 'grid'; draw(); },
    }),
    el('button', {
      class: 'btn' + (R.view === 'list' ? ' primary' : ''),
      type: 'button', text: '列表',
      onclick: () => { R.view = 'list'; draw(); },
    }),
    el('button', {
      class: 'btn primary', type: 'button', text: '+ 新建客户',
      onclick: () => openClientPanel(null, {}),
    }),
  ];
  root.append(pageHead('咨询工作', '围绕"人"管理客户，到期待跟进的会自动浮现', headActions));

  const search = el('input', {
    type: 'search', class: 'search', placeholder: '搜索客户名 / 需求关键词…', value: R.search,
  });
  search.addEventListener('input', () => {
    R.search = search.value;
    refreshList();
  });
  const status = el('select', {});
  status.append(el('option', { value: '', text: '全部状态' }));
  Object.keys(CLIENT_STATUS).forEach((key) => {
    const opt = el('option', { value: key, text: CLIENT_STATUS[key] });
    if (key === R.status) opt.selected = true;
    status.append(opt);
  });
  status.addEventListener('change', () => {
    R.status = status.value;
    refreshList();
  });
  root.append(el('div', { class: 'toolbar' }, [
    search, status,
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted tiny', text: '橙框 = 到期当天或 3 天内要跟进' }),
  ]));
  const listBox = el('div', {});
  root.append(listBox);
  R.listBox = listBox;
  refreshList();
}

function refreshList() {
  if (!R) return;
  const box = R.listBox;
  if (!box) return;
  box.innerHTML = '';
  const list = clients();
  if (!list.length) {
    box.append(emptyState(
      R.search || R.status ? '没有匹配的客户。' : '还没有客户，新建第一位咨询客户吧。',
      '新建客户',
      () => openClientPanel(null, {})
    ));
    return;
  }
  if (R.view === 'list') box.append(buildClientList(list));
  else box.append(buildClientGrid(list));
}

function buildClientGrid(list) {
  const grid = el('div', { class: 'client-grid' });
  list.forEach((client) => {
    const due = dueState(client);
    const last = lastSessionDate(R.ctx.store.data, client.id);
    const count = clientSessions(R.ctx.store.data, client.id).length;
    grid.append(el('div', {
      class: 'client-card' + (due.due ? ' due' : ''),
      onclick: () => openClientPanel(client.id, {}),
    }, [
      el('div', { class: 'client-name' }, [
        el('span', { text: client.name || '（未命名客户）' }),
        el('span', { class: 'badge' + (client.status === 'deal' ? ' ok' : (client.status === 'paused' ? ' warn' : '')), text: CLIENT_STATUS[client.status] || client.status }),
        el('button', {
          class: 'btn ghost small client-delete',
          type: 'button',
          text: '删除',
          title: '删除客户',
          onclick: (event) => { event.stopPropagation(); deleteClientFlow(client); },
        }),
      ]),
      el('div', { class: 'client-req', text: client.requirement || '还没有填写需求' }),
      el('div', { class: 'client-meta' }, [
        due.text ? el('span', { class: due.due ? 'due-text' : '', text: due.text }) : el('span', { text: '未设下次跟进' }),
        el('span', { text: last ? '最近咨询 ' + last : '还没有咨询记录' }),
        el('span', { text: count + ' 条记录' }),
      ]),
    ]));
  });
  return grid;
}

function buildClientList(list) {
  const card = el('section', { class: 'section-card' });
  list.forEach((client) => {
    const due = dueState(client);
    const last = lastSessionDate(R.ctx.store.data, client.id);
    card.append(el('div', {
      class: 'client-list-row' + (due.due ? ' due' : ''),
      onclick: () => openClientPanel(client.id, {}),
    }, [
      el('span', { class: 'cl-name', text: client.name || '（未命名客户）' }),
      el('span', { class: 'cl-req', text: client.requirement || '—' }),
      el('span', { class: 'badge', text: CLIENT_STATUS[client.status] || client.status }),
      el('span', { class: 'muted tiny' + (due.due ? ' due-text' : ''), text: due.text || '未设下次跟进' }),
      el('span', { class: 'muted tiny', text: last ? '最近 ' + last : '无记录' }),
      el('button', {
        class: 'btn ghost small client-delete',
        type: 'button',
        text: '删除',
        title: '删除客户',
        onclick: (event) => { event.stopPropagation(); deleteClientFlow(client); },
      }),
    ]));
  });
  return card;
}

/* ---------------- 删除客户：确认 + 5 秒撤销 + 级联咨询记录 ---------------- */
function deleteClientFlow(target) {
  if (!R) return;
  const ctx = R.ctx;
  const reopenPanel = isOpen();
  const sessions = visibleItems(ctx.store.data.consultSessions).filter((s) => s.clientId === target.id);
  deleteWithUndo({
    title: '删除客户「' + (target.name || '未命名') + '」？',
    body: sessions.length + ' 条咨询记录一并删除。\n删除后 5 秒内可撤销。',
    undoLabel: '已删除客户',
    onConfirm: () => {
      target._pendingDelete = true;
      sessions.forEach((session) => { session._pendingDelete = true; });
      closePanel();
      refreshList();
    },
    onCommit: () => ctx.store.mutate((d) => deleteClient(d, target.id)),
    onUndo: () => {
      delete target._pendingDelete;
      sessions.forEach((session) => { delete session._pendingDelete; });
      refreshList();
      if (R && reopenPanel) openClientPanel(target.id, {});
    },
  });
}

/* ---------------- 客户详情面板（50%） ---------------- */
function openClientPanel(id, options) {
  if (!R) return;
  const ctx = R.ctx;
  const data = ctx.store.data;
  let client = id ? findById(data.clients, id) : null;
  const draft = {
    name: client ? client.name : '',
    contact: client ? client.contact : '',
    source: client ? client.source : '',
    requirement: client ? client.requirement : '',
    status: client ? client.status : 'following',
  };
  let composing = Boolean(options && options.compose);
  let panel = null;

  panel = openPanel({
    width: '50',
    title: client ? (client.name || '客户详情') : '新建客户',
    onClose: () => {
      if (!client && draft.name.trim()) {
        ctx.store.mutate((d) => createClient(d, {
          name: draft.name.trim(),
          contact: draft.contact,
          source: draft.source,
          requirement: draft.requirement,
          status: draft.status,
        }));
        refreshList();
      }
    },
  });
  if (!panel) return;

  function ensure() {
    if (client) return client;
    if (!draft.name.trim()) return null;
    client = ctx.store.mutate((d) => createClient(d, {
      name: draft.name.trim(),
      contact: draft.contact,
      source: draft.source,
      requirement: draft.requirement,
      status: draft.status,
    }));
    panel.setTitle(client.name);
    refreshList();
    renderPanelBody();
    return client;
  }

  function save(patch) {
    if (!ensure()) return;
    ctx.store.mutate((d) => updateClient(d, client.id, patch));
    refreshList();
  }

  function renderPanelBody() {
    panel.body.innerHTML = '';
    if (!client) {
      renderNewForm();
      return;
    }
    renderDetail();
  }

  function renderNewForm() {
    const name = el('input', { type: 'text', value: draft.name, placeholder: '客户名称（必填）' });
    name.addEventListener('input', () => { draft.name = name.value; });
    name.addEventListener('blur', () => {
      const text = name.value.trim();
      if (!text) { name.value = client ? client.name : ''; return; }
      draft.name = text;
      ensure();
    });
    const contact = el('input', { type: 'text', value: draft.contact, placeholder: '联系方式（可空）' });
    contact.addEventListener('input', () => {
      draft.contact = contact.value;
      if (client) ctx.store.mutate((d) => updateClient(d, client.id, { contact: contact.value }));
    });
    const source = el('input', { type: 'text', value: draft.source, placeholder: '来源（可空）' });
    source.addEventListener('input', () => {
      draft.source = source.value;
      if (client) ctx.store.mutate((d) => updateClient(d, client.id, { source: source.value }));
    });
    const requirement = el('textarea', { placeholder: '需求描述（可空）' });
    requirement.value = draft.requirement || '';
    requirement.addEventListener('input', () => {
      draft.requirement = requirement.value;
      if (client) ctx.store.mutate((d) => updateClient(d, client.id, { requirement: requirement.value }), { long: true });
    });
    const status = el('select', {});
    Object.keys(CLIENT_STATUS).forEach((key) => {
      const opt = el('option', { value: key, text: CLIENT_STATUS[key] });
      if (draft.status === key) opt.selected = true;
      status.append(opt);
    });
    status.addEventListener('change', () => {
      draft.status = status.value;
      if (client) save({ status: status.value });
    });
    panel.body.append(el('div', { class: 'form-grid' }, [
      field('客户名称（必填）', name),
      field('联系方式', contact),
      field('来源', source),
      field('需求描述', requirement),
      field('状态', status),
      el('p', { class: 'muted tiny', text: '填写名称后会自动创建客户；其余字段自动保存。' }),
    ]));
    panel.setStatus('自动保存');
  }

  function renderDetail() {
    const contact = el('input', { type: 'text', value: client.contact || '', placeholder: '联系方式' });
    contact.addEventListener('input', () => { client.contact = contact.value; });
    contact.addEventListener('blur', () => save({ contact: contact.value }));

    const source = el('input', { type: 'text', value: client.source || '', placeholder: '来源' });
    source.addEventListener('input', () => { client.source = source.value; });
    source.addEventListener('blur', () => save({ source: source.value }));

    const requirement = el('textarea', { placeholder: '需求描述' });
    requirement.value = client.requirement || '';
    requirement.addEventListener('input', () => {
      client.requirement = requirement.value;
      if (client.id) ctx.store.mutate((d) => updateClient(d, client.id, { requirement: requirement.value }), { long: true });
    });

    const status = el('select', {});
    Object.keys(CLIENT_STATUS).forEach((key) => {
      const opt = el('option', { value: key, text: CLIENT_STATUS[key] });
      if (client.status === key) opt.selected = true;
      status.append(opt);
    });
    status.addEventListener('change', () => { save({ status: status.value }); });

    panel.body.append(el('div', { class: 'form-grid' }, [
      field('客户名称', (() => {
        const name = el('input', { type: 'text', value: client.name || '', placeholder: '客户名称（必填）' });
        name.addEventListener('input', () => { client.name = name.value; });
        name.addEventListener('blur', () => {
          const text = name.value.trim();
          if (!text) { name.value = client.name; return; }
          save({ name: text });
          panel.setTitle(text);
        });
        return name;
      })()),
      field('联系方式', contact),
      field('来源', source),
      field('需求描述', requirement),
      field('状态', status),
    ]));

    const due = dueState(client);
    panel.body.append(el('div', { class: 'settings-row', style: { marginTop: '12px' } }, [
      el('span', { class: 'muted tiny', text: '下次跟进日期（只由最新咨询记录同步）：' }),
      el('span', { class: 'badge' + (due.due ? ' warn' : ''), text: client.nextFollowupDate || '未设置' }),
    ]));

    panel.body.append(el('div', { class: 'divider' }));

    const composeBtn = el('button', {
      class: 'btn primary small', type: 'button', text: '记一次咨询',
      onclick: () => { composing = true; renderPanelBody(); },
    });
    panel.body.append(el('div', { class: 'section-head' }, [
      el('h3', { text: '咨询记录' }),
      el('span', { class: 'spacer' }),
      composeBtn,
    ]));

    if (composing) panel.body.append(buildComposer());

    const sessions = clientSessions(ctx.store.data, client.id);
    if (!sessions.length) {
      panel.body.append(el('p', { class: 'muted tiny', text: '还没有咨询记录。点"记一次咨询"添加第一条。' }));
    } else {
      const timeline = el('div', { class: 'timeline' });
      sessions.forEach((session) => timeline.append(buildSession(session)));
      panel.body.append(timeline);
    }

    panel.body.append(el('div', { class: 'divider' }));
    panel.body.append(el('div', { class: 'form-actions' }, [
      el('button', {
        class: 'btn danger', type: 'button', text: '删除客户',
        onclick: () => deleteClientFlow(client),
      }),
    ]));
    panel.setStatus('自动保存');
  }

  function buildComposer() {
    const datetime = el('input', { type: 'datetime-local', value: nowDateTimeLocal() });
    const topic = el('textarea', { placeholder: '议题（可空）' });
    const conclusion = el('textarea', { placeholder: '结论（可空）' });
    const nextStep = el('textarea', { placeholder: '下一步行动（可空）' });
    const nextDate = el('input', { type: 'date', value: '' });
    const formBox = el('div', { class: 'session-form' }, [
      el('div', { class: 'section-head' }, [el('h3', { text: '新咨询记录' })]),
      el('div', { class: 'form-grid' }, [
        field('时间', datetime),
        field('议题', topic),
        field('结论', conclusion),
        field('下一步行动', nextStep),
        field('下次跟进日期（可空）', nextDate, '保存后会自动同步到客户卡；留空则清空提醒'),
      ]),
      el('div', { class: 'form-actions' }, [
        el('button', {
          class: 'btn primary', type: 'button', text: '保存记录',
          onclick: () => {
            const values = {
              datetime: datetime.value || nowDateTimeLocal(),
              topic: topic.value,
              conclusion: conclusion.value,
              nextStep: nextStep.value,
              nextFollowupDate: nextDate.value || null,
            };
            ctx.store.mutate((d) => addConsultSession(d, client.id, values));
            composing = false;
            refreshList();
            renderPanelBody();
          },
        }),
        el('button', {
          class: 'btn ghost', type: 'button', text: '取消',
          onclick: () => { composing = false; renderPanelBody(); },
        }),
      ]),
    ]);
    setTimeout(() => topic.focus(), 0);
    return formBox;
  }

  function buildSession(session) {
    const box = el('div', { class: 'timeline-item' }, [
      el('div', { class: 'tl-head' }, [
        el('span', { class: 'tl-time', text: String(session.datetime || '').replace('T', ' ') }),
        session.nextFollowupDate ? el('span', { class: 'badge', text: '下次 ' + session.nextFollowupDate }) : null,
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'btn ghost small', type: 'button', text: '删除',
          onclick: () => deleteSessionFlow(session),
        }),
      ]),
      el('div', { class: 'tl-fields' }, [
        session.topic ? el('span', { class: 'tl-sub', text: '议题：' + session.topic }) : null,
        session.conclusion ? el('span', { class: 'tl-sub', text: '结论：' + session.conclusion }) : null,
        session.nextStep ? el('span', { class: 'tl-sub', text: '下一步：' + session.nextStep }) : null,
      ]),
    ]);
    return box;
  }

  function deleteSessionFlow(session) {
    deleteWithUndo({
      title: '删除这条咨询记录？',
      body: '删除后会自动按剩余记录同步客户的跟进日期。5 秒内可撤销。',
      undoLabel: '已删除咨询记录',
      onConfirm: () => {
        session._pendingDelete = true;
        ctx.store.mutate((d) => syncClientFollowup(d, client.id));
        refreshList();
        renderPanelBody();
      },
      onCommit: () => ctx.store.mutate((d) => deleteConsultSession(d, session.id)),
      onUndo: () => {
        delete session._pendingDelete;
        ctx.store.mutate((d) => syncClientFollowup(d, client.id));
        refreshList();
        renderPanelBody();
      },
    });
  }

  renderPanelBody();
}

export function newItem() {
  if (R) openClientPanel(null, {});
}
