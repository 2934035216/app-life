// views/dev.js —— 开发工作：项目列表 + 任务/开发日志双页签
import { fmtDateCN, sortByKeyDesc, visibleItems } from '../utils.js';
import {
  addWorkItem,
  createProject,
  deleteDevLog,
  deleteProject,
  deleteTask,
  findById,
  findDevLog,
  moveDevLogDate,
  moveTask,
  projectTasks,
  removeItem,
  updateDevLog,
  updateProject,
  updateTask,
  upsertDevLog,
} from '../models.js';
import { confirm, form } from '../ui/dialog.js';
import { openPanel, closePanel } from '../ui/panel.js';
import * as toast from '../ui/toast.js';
import { el, emptyState, deleteWithUndo, field, pageHead, tabs } from '../ui/common.js';

let R = null;

const STATUS_META = {
  active: { label: '进行中', cls: 'accent' },
  paused: { label: '已搁置', cls: 'warn' },
  done: { label: '已完结', cls: 'ok' },
};

export function render(root, ctx, params) {
  const data = ctx.store.data;
  const projects = visibleItems(data.devProjects);
  const wantLog = params && params.log === '1';
  const first = projects.find((p) => p.status !== 'done') || projects[0] || null;
  R = {
    root,
    ctx,
    selectedId: first ? first.id : null,
    tab: wantLog ? 'logs' : 'tasks',
    showDone: false,
    focusLog: wantLog,
    justDragged: false,
  };
  root.innerHTML = '';
  draw();
  if (wantLog) {
    setTimeout(() => focusLogInput(), 0);
    if (typeof history !== 'undefined' && history.replaceState) {
      try { history.replaceState(null, '', '#/dev'); } catch (err) { /* 忽略 */ }
    }
  }
  ctx.onCleanup(() => { R = null; });
}

function selectedProject() {
  if (!R || !R.selectedId) return null;
  return findById(R.ctx.store.data.devProjects, R.selectedId);
}

function draw() {
  if (!R) return;
  const { root, ctx } = R;
  root.innerHTML = '';
  root.append(pageHead('开发工作', '以项目为单位拆任务、追进度，每天记一笔', [
    el('button', { class: 'btn primary', type: 'button', text: '＋ 新增工作项', onclick: () => startNewTask() }),
    el('button', { class: 'btn', type: 'button', text: '+ 新建项目', onclick: () => openProjectPanel(null) }),
  ]));

  const project = selectedProject();
  if (!project || project._pendingDelete) {
    const first = visibleItems(ctx.store.data.devProjects)[0];
    R.selectedId = first ? first.id : null;
  }

  const layout = el('div', { class: 'dev-layout' });
  root.append(layout);
  layout.append(buildProjectList());
  layout.append(buildDetail());
}

function buildProjectList() {
  const { ctx } = R;
  const data = ctx.store.data;
  const projects = visibleItems(data.devProjects);
  const box = el('section', { class: 'section-card project-list-card' });
  box.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '项目' }),
    el('span', { class: 'section-sub', text: projects.length + ' 个' }),
  ]));
  if (!projects.length) {
    box.append(emptyState('还没有项目，新建一个开始推进吧。', '新建项目', () => openProjectPanel(null)));
    return box;
  }
  const order = { active: 0, paused: 1, done: 2 };
  const sorted = projects.slice().sort((a, b) => {
    const diff = (order[a.status] == null ? 1 : order[a.status]) - (order[b.status] == null ? 1 : order[b.status]);
    if (diff) return diff;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  let doneTitleShown = false;
  sorted.forEach((project) => {
    if (project.status === 'done' && !doneTitleShown) {
      doneTitleShown = true;
      box.append(el('div', { class: 'project-group-title', text: '已完结（收起在底部）' }));
    }
    const tasks = visibleItems(projectTasks(data, project.id));
    const doneCount = tasks.filter((task) => task.done).length;
    const percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
    const item = el('div', {
      class: 'project-item' + (project.id === R.selectedId ? ' active' : ''),
      onclick: () => {
        R.selectedId = project.id;
        R.tab = 'tasks';
        R.showDone = false;
        draw();
      },
    }, [
      el('div', { class: 'pj-name' }, [
        el('span', { text: project.name || '（未命名项目）' }),
        el('span', { class: 'badge ' + (STATUS_META[project.status] || {}).cls, text: (STATUS_META[project.status] || {}).label || project.status }),
      ]),
      el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-fill', style: { width: percent + '%' } }),
      ]),
      el('div', { class: 'pj-progress-text', text: doneCount + '/' + tasks.length + ' 个任务已完成' }),
    ]);
    box.append(item);
  });
  return box;
}

function buildDetail() {
  const project = selectedProject();
  const wrap = el('section', { class: 'section-card dev-detail' });
  if (!project) {
    wrap.append(emptyState('左侧还没有项目。可以直接在下面添加第一条工作项（自动归入「我的工作」项目），也可以先新建项目。', '新建项目', () => openProjectPanel(null)));
    const quick = el('div', { class: 'section-card', style: { marginTop: '12px' } }, [
      el('div', { class: 'section-head' }, [
        el('h3', { text: '新增工作项' }),
        el('span', { class: 'section-sub', text: '还没有项目，自动归入「我的工作」' }),
      ]),
    ]);
    quick.append(buildTaskComposer(null));
    wrap.append(quick);
    return wrap;
  }
  const p = el('div', { class: 'section-head' }, [
    el('div', {}, [
      el('h2', { text: project.name || '（未命名项目）' }),
      el('span', { class: 'section-sub', text: project.intro || '还没有项目简介' }),
    ]),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn small', type: 'button', text: '编辑项目', onclick: () => openProjectPanel(project.id) }),
  ]);
  wrap.append(p);
  wrap.append(tabs([
    { key: 'tasks', label: '任务' },
    { key: 'logs', label: '开发日志' },
  ], R.tab, (key) => {
    R.tab = key;
    if (key === 'tasks') R.showDone = false;
    draw();
  }));
  if (R.tab === 'logs') wrap.append(buildLogs(project));
  else wrap.append(buildTasks(project));
  return wrap;
}

/* ---------------- 任务 ---------------- */
function buildTasks(project) {
  const { ctx } = R;
  const data = ctx.store.data;
  const tasks = visibleItems(projectTasks(data, project.id));
  const wrap = el('div', { class: 'task-area' });
  const pending = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  if (!tasks.length) {
    wrap.append(el('p', { class: 'muted tiny', text: '还没有任务，在下面输入一条吧。' }));
  }

  const list = el('div', { class: 'task-list' });
  pending.forEach((task) => list.append(buildTaskRow(task, false)));
  wrap.append(list);

  if (done.length) {
    wrap.append(el('button', {
      class: 'done-toggle',
      type: 'button',
      text: R.showDone ? '收起已完成' : '已完成 ' + done.length + ' 条（展开回看）',
      onclick: () => { R.showDone = !R.showDone; draw(); },
    }));
    if (R.showDone) {
      const doneList = el('div', { class: 'task-list' });
      done.forEach((task) => doneList.append(buildTaskRow(task, true)));
      wrap.append(doneList);
    }
  }

  wrap.append(buildTaskComposer(project));
  return wrap;
}

/** 工作项输入区：project 为 null 时自动归入「我的工作」（没有项目会即时新建） */
function buildTaskComposer(project) {
  const { ctx } = R;
  const title = el('input', {
    type: 'text',
    class: 'task-quick-input',
    placeholder: project ? '新任务标题，回车添加' : '第一条工作项标题，回车添加',
  });
  const due = el('input', { type: 'date', value: '' });
  const priority = el('select', {});
  [['normal', '普通'], ['high', '高']].forEach((pair) => priority.append(el('option', { value: pair[0], text: pair[1] })));
  const submit = () => {
    const text = title.value.trim();
    if (!text) { title.focus(); return; }
    const result = ctx.store.mutate((d) => addWorkItem(d, project ? project.id : null, {
      title: text,
      dueDate: due.value || null,
      priority: priority.value,
    }));
    R.selectedId = result.projectId;
    R.tab = 'tasks';
    title.value = '';
    due.value = '';
    draw();
  };
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  R.taskInput = title;
  return el('div', { class: 'form-inline', style: { marginTop: '10px' } }, [
    title, due, priority,
    el('button', { class: 'btn primary small', type: 'button', text: '新增工作项', onclick: submit }),
  ]);
}

function startNewTask() {
  if (!R) return;
  if (R.tab !== 'tasks') {
    R.tab = 'tasks';
    draw();
  }
  setTimeout(() => {
    if (!R) return;
    if (R.taskInput) R.taskInput.focus();
  }, 0);
}

function buildTaskRow(task, isDone) {
  const { ctx } = R;
  const checkbox = el('input', { type: 'checkbox', checked: isDone ? true : null });
  const title = el('input', {
    type: 'text',
    class: 'task-title',
    value: task.title || '',
    placeholder: '任务标题',
  });
  const due = el('input', { type: 'date', value: task.dueDate || '' });
  const priority = el('select', {});
  [['normal', '普通'], ['high', '高']].forEach((pair) => {
    const opt = el('option', { value: pair[0], text: pair[1] });
    if ((task.priority || 'normal') === pair[0]) opt.selected = true;
    priority.append(opt);
  });
  const row = el('div', {
    class: 'task-row' + (isDone ? ' done' : ''),
    draggable: isDone ? null : 'true',
  }, [
    el('span', { class: 'drag-handle', title: '拖动排序', text: '⋮⋮' }),
    checkbox,
    title,
    due,
    priority,
    el('button', {
      class: 'btn ghost small',
      type: 'button',
      text: task.note ? '备注 •' : '备注',
      title: task.note || '',
      onclick: () => editTaskNote(task),
    }),
    el('button', {
      class: 'btn ghost small delete-btn',
      type: 'button',
      text: '删除',
      onclick: () => deleteTaskWithUndo(task),
    }),
  ]);

  checkbox.addEventListener('change', () => {
    row.classList.add('collapsing');
    setTimeout(() => {
      ctx.store.mutate((d) => updateTask(d, task.id, { done: checkbox.checked }));
      if (R) draw();
    }, 160);
  });
  title.addEventListener('blur', () => {
    const text = title.value.trim();
    if (!text) { title.value = task.title || ''; return; }
    if (text === task.title) return;
    ctx.store.mutate((d) => updateTask(d, task.id, { title: text }));
  });
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') title.blur();
  });
  due.addEventListener('change', () => {
    ctx.store.mutate((d) => updateTask(d, task.id, { dueDate: due.value || null }));
  });
  priority.addEventListener('change', () => {
    ctx.store.mutate((d) => updateTask(d, task.id, { priority: priority.value }));
  });
  row.addEventListener('dragstart', (event) => {
    R.dragTaskId = task.id;
    row.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    R.justDragged = true;
    setTimeout(() => { if (R) R.justDragged = false; }, 120);
  });
  row.addEventListener('dragover', (event) => {
    if (!R.dragTaskId || R.dragTaskId === task.id) return;
    event.preventDefault();
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    row.classList.remove('drag-over');
    const dragged = R.dragTaskId || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');
    if (!dragged || dragged === task.id) return;
    const all = projectTasks(ctx.store.data, task.projectId);
    const targetIndex = all.findIndex((item) => item.id === task.id);
    ctx.store.mutate((d) => moveTask(d, dragged, targetIndex));
    R.dragTaskId = null;
    draw();
  });
  return row;
}

function editTaskNote(task) {
  const { ctx } = R;
  form({
    title: '任务备注',
    fields: [
      { name: 'note', label: '备注（可空）', type: 'textarea', value: task.note || '' },
    ],
    okText: '保存备注',
  }).then((values) => {
    if (!values || !R) return;
    ctx.store.mutate((d) => updateTask(d, task.id, { note: values.note || '' }));
    draw();
  });
}

function deleteTaskWithUndo(task) {
  const { ctx } = R;
  deleteWithUndo({
    title: '删除任务「' + (task.title || '未命名') + '」？',
    body: '删除后 5 秒内可撤销。',
    undoLabel: '已删除任务',
    onConfirm: () => { task._pendingDelete = true; draw(); },
    onCommit: () => ctx.store.mutate((d) => removeItem(d.devTasks, task.id)),
    onUndo: () => { delete task._pendingDelete; if (R) draw(); },
  });
}

/* ---------------- 开发日志 ---------------- */
function buildLogs(project) {
  const { ctx } = R;
  const data = ctx.store.data;
  const today = ctx.today();
  const logs = visibleItems(data.devLogs)
    .filter((log) => log.projectId === project.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const wrap = el('div', { class: 'log-area' });

  const existing = findDevLog(data, project.id, today);
  if (!existing) {
    const input = el('input', {
      type: 'text',
      class: 'log-quick-input',
      placeholder: '记一笔今天：今天做了什么？回车即建',
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      ctx.store.mutate((d) => upsertDevLog(d, project.id, today, { content: text }));
      draw();
      setTimeout(() => {
        const block = R && R.root.querySelector('.log-quick-input');
        if (block) block.focus();
      }, 0);
    });
    R.logFocusInput = input;
    wrap.append(el('div', { class: 'section-card', style: { padding: '12px 14px' } }, [
      el('div', { class: 'section-head' }, [
        el('h3', { text: '今天还没有日志' }),
        el('span', { class: 'section-sub', text: fmtDateCN(today) }),
      ]),
      input,
    ]));
  }

  if (!logs.length) {
    wrap.append(el('p', { class: 'muted tiny', text: '还没有历史日志。' }));
  }
  logs.forEach((log) => wrap.append(buildLogBlock(log, log.date === today)));
  return wrap;
}

function buildLogBlock(log, isToday) {
  const { ctx } = R;
  const date = el('input', { type: 'date', value: log.date || '' });
  const content = el('textarea', { placeholder: '今天做了什么…' });
  content.value = log.content || '';
  const blocker = el('textarea', { placeholder: '卡点（可空）…' });
  blocker.value = log.blocker || '';
  const block = el('div', { class: 'log-block' }, [
    el('div', { class: 'log-head' }, [
      date,
      isToday ? el('span', { class: 'badge accent', text: '今天' }) : null,
      el('span', { class: 'muted tiny', text: '自动保存' }),
      el('button', {
        class: 'btn ghost small delete-btn',
        type: 'button',
        text: '删除',
        onclick: () => deleteLogWithUndo(log),
      }),
    ]),
    field('做了什么', content),
    field('卡点', blocker),
  ]);
  if (isToday) block.classList.add('today-log');
  content.addEventListener('input', () => {
    ctx.store.mutate((d) => updateDevLog(d, log.id, { content: content.value }), { long: true });
  });
  blocker.addEventListener('input', () => {
    ctx.store.mutate((d) => updateDevLog(d, log.id, { blocker: blocker.value }), { long: true });
  });
  date.addEventListener('change', () => {
    if (!date.value) { date.value = log.date; return; }
    ctx.store.mutate((d) => moveDevLogDate(d, log.id, date.value));
    draw();
  });
  return block;
}

function deleteLogWithUndo(log) {
  const { ctx } = R;
  deleteWithUndo({
    title: '删除 ' + fmtDateCN(log.date) + ' 的开发日志？',
    body: '删除后 5 秒内可撤销。',
    undoLabel: '已删除开发日志',
    onConfirm: () => { log._pendingDelete = true; draw(); },
    onCommit: () => ctx.store.mutate((d) => deleteDevLog(d, log.id)),
    onUndo: () => { delete log._pendingDelete; if (R) draw(); },
  });
}

function focusLogInput() {
  if (!R) return;
  const data = R.ctx.store.data;
  const project = selectedProject();
  if (!project) return;
  const today = R.ctx.today();
  const log = findDevLog(data, project.id, today);
  if (log) {
    const nodes = R.root.querySelectorAll('.log-block textarea');
    if (nodes.length) nodes[0].focus();
    return;
  }
  if (R.logFocusInput) R.logFocusInput.focus();
}

/* ---------------- 项目面板 ---------------- */
function openProjectPanel(id) {
  if (!R) return;
  const ctx = R.ctx;
  const data = ctx.store.data;
  let project = id ? findById(data.devProjects, id) : null;
  const draft = {
    name: project ? project.name : '',
    intro: project ? project.intro : '',
    status: project ? project.status : 'active',
    id: null,
  };
  const p = openPanel({
    width: '40',
    title: project ? '编辑项目' : '新建项目',
    onClose: () => {
      if (!project && draft.name.trim()) {
        const created = ctx.store.mutate((d) => createProject(d, {
          name: draft.name.trim(),
          intro: draft.intro,
          status: draft.status,
        }));
        R.selectedId = created.id;
        if (R) draw();
      }
    },
  });
  if (!p) return;

  function ensure() {
    if (project) return project;
    if (!draft.name.trim()) return null;
    project = ctx.store.mutate((d) => createProject(d, {
      name: draft.name.trim(),
      intro: draft.intro,
      status: draft.status,
    }));
    R.selectedId = project.id;
    p.setTitle('编辑项目');
    if (R) draw();
    return project;
  }

  function save(patch, opts) {
    if (!ensure()) return;
    ctx.store.mutate((d) => updateProject(d, project.id, patch), opts);
  }

  const name = el('input', { type: 'text', value: draft.name, placeholder: '项目名称（必填）' });
  name.addEventListener('input', () => { draft.name = name.value; });
  name.addEventListener('blur', () => {
    const text = name.value.trim();
    if (!text) { name.value = project ? project.name : ''; return; }
    draft.name = text;
    save({ name: text });
  });

  const intro = el('textarea', { placeholder: '项目简介（可空）' });
  intro.value = draft.intro || '';
  intro.addEventListener('input', () => {
    draft.intro = intro.value;
    if (project) ctx.store.mutate((d) => updateProject(d, project.id, { intro: intro.value }), { long: true });
  });

  const status = el('select', {});
  [['active', '进行中'], ['paused', '已搁置'], ['done', '已完结']].forEach((pair) => {
    const opt = el('option', { value: pair[0], text: pair[1] });
    if (draft.status === pair[0]) opt.selected = true;
    status.append(opt);
  });
  status.addEventListener('change', () => {
    draft.status = status.value;
    save({ status: status.value });
    if (R) { draw(); }
  });

  const body = el('div', { class: 'form-grid' }, [
    field('项目名称（必填）', name),
    field('简介', intro),
    field('状态', status, '已完结的项目会收在左侧列表底部'),
  ]);
  if (project) {
    const tasks = visibleItems(projectTasks(ctx.store.data, project.id));
    const doneCount = tasks.filter((task) => task.done).length;
    body.append(el('p', { class: 'muted tiny', text: '任务进度：' + doneCount + '/' + tasks.length }));
    body.append(el('div', { class: 'divider' }));
    body.append(el('div', { class: 'form-actions' }, [
      el('button', {
        class: 'btn danger',
        type: 'button',
        text: '删除项目',
        onclick: () => deleteProjectFlow(project),
      }),
    ]));
  }
  p.body.append(body);
  p.setStatus('自动保存');
}

function deleteProjectFlow(project) {
  const { ctx } = R;
  const data = ctx.store.data;
  const taskCount = visibleItems(data.devTasks).filter((task) => task.projectId === project.id).length;
  const logCount = visibleItems(data.devLogs).filter((log) => log.projectId === project.id).length;
  deleteWithUndo({
    title: '删除项目「' + (project.name || '未命名') + '」？',
    body: '其下任务与日志一并删除（' + taskCount + ' 个任务、' + logCount + ' 条日志）。\n删除后 5 秒内可撤销。',
    undoLabel: '已删除项目',
    onConfirm: () => {
      project._pendingDelete = true;
      data.devTasks.forEach((task) => { if (task.projectId === project.id) task._pendingDelete = true; });
      data.devLogs.forEach((log) => { if (log.projectId === project.id) log._pendingDelete = true; });
      closePanel();
      if (R) {
        if (R.selectedId === project.id) {
          const next = visibleItems(data.devProjects)[0];
          R.selectedId = next ? next.id : null;
        }
        draw();
      }
    },
    onCommit: () => ctx.store.mutate((d) => deleteProject(d, project.id)),
    onUndo: () => {
      if (project._pendingDelete) delete project._pendingDelete;
      data.devTasks.forEach((task) => { if (task.projectId === project.id) delete task._pendingDelete; });
      data.devLogs.forEach((log) => { if (log.projectId === project.id) delete log._pendingDelete; });
      if (R) { R.selectedId = project.id; draw(); }
    },
  });
}

export function newItem() {
  if (R) openProjectPanel(null);
}
