// main.js —— 启动流程：拉数据 → 渲染导航 → hash 路由 → 快捷键与欢迎引导
import { api } from './api.js';
import { Store, applyTheme } from './store.js';
import { today as todayFn } from './utils.js';
import * as panel from './ui/panel.js';
import * as toast from './ui/toast.js';
import { el } from './ui/common.js';
import * as home from './views/home.js';
import * as todayView from './views/today.js';
import * as selfmedia from './views/selfmedia.js';
import * as dev from './views/dev.js';
import * as consult from './views/consult.js';
import * as fitness from './views/fitness.js';
import * as diet from './views/diet.js';
import * as game from './views/game.js';
import * as settings from './views/settings.js';

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1Z"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5h14M5 12h14M5 19h9"/></svg>',
  selfmedia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 10-10a2 2 0 0 0-3-3L5 16l-1 4Z"/><path d="M13 7l3 3"/></svg>',
  dev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 7-5 5 5 5M15 7l5 5-5 5"/></svg>',
  consult: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="9.5" r="2.4"/><path d="M15 18.5a4.5 4.5 0 0 1 6-4"/></svg>',
  fitness: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 8v8M4 10v4M17 8v8M20 10v4M7 12h10"/></svg>',
  diet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M9 8c0-2 1-3 3-3s3 1 3 3"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 11v3M6.5 12.5h3M16 12h.01M18 13.6h.01"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.5 7.5l1.7 1.7M17.8 14.8l1.7 1.7M3 12h2M19 12h2M4.5 16.5l1.7-1.7M17.8 9.2l1.7-1.7"/></svg>',
};

const NAV_GROUPS = [
  { title: '总览', items: ['home', 'today'] },
  { title: '工作', items: ['selfmedia', 'dev', 'consult'] },
  { title: '生活', items: ['fitness', 'diet', 'game'] },
  { title: '系统', items: ['settings'] },
];

const NAV_META = {
  home: { label: '首页' },
  today: { label: '今日计划' },
  selfmedia: { label: '自媒体' },
  dev: { label: '开发工作' },
  consult: { label: '咨询工作' },
  fitness: { label: '健身计划' },
  diet: { label: '饮食计划' },
  game: { label: '游戏娱乐' },
  settings: { label: '数据与设置' },
};

const VIEWS = {
  home,
  today: todayView,
  selfmedia,
  dev,
  consult,
  fitness,
  diet,
  game,
  settings,
};

const store = new Store(api);
const viewRoot = document.getElementById('view');
const navRoot = document.getElementById('nav');
let cleanups = [];
let activeView = null;
let activeRoute = 'home';
let saveHintEl = null;

function parseHash() {
  const raw = String(location.hash || '#/home').replace(/^#/, '');
  const parts = raw.split('?');
  const path = parts[0] || '/home';
  const query = parts[1] || '';
  const segments = path.split('/').filter(Boolean);
  const route = segments[0] || 'home';
  const params = {};
  query.split('&').forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const key = decodeURIComponent(idx < 0 ? pair : pair.slice(0, idx));
    const value = idx < 0 ? '' : decodeURIComponent(pair.slice(idx + 1));
    if (key) params[key] = value;
  });
  if (route === 'selfmedia' && segments[1] === 'write' && segments[2]) {
    params.writeId = segments[2];
  }
  return { route: VIEWS[route] ? route : 'home', params };
}

function settingsData() {
  return (store.data && store.data.settings) || {};
}

function todayStr() {
  return todayFn(settingsData());
}

function renderNav() {
  const hidden = settingsData().hiddenModules || [];
  navRoot.innerHTML = '';
  const brand = el('div', { class: 'nav-brand' }, [
    '个人工作生活',
    el('small', { text: '本机 · 单文件数据' }),
  ]);
  navRoot.append(brand);
  NAV_GROUPS.forEach((group) => {
    const box = el('div', { class: 'nav-group' + (group.title === '系统' ? ' system' : '') });
    box.append(el('div', { class: 'nav-group-title', text: group.title }));
    group.items.forEach((key) => {
      if (hidden.indexOf(key) >= 0) return;
      if (key === 'settings' && group.title === '系统') {
        // 设置固定置底：system 分组通过 margin-top:auto 顶到底部
      }
      const item = el('a', {
        class: 'nav-item' + (key === activeRoute ? ' active' : ''),
        href: '#/' + key,
        dataset: { route: key },
      }, [
        el('span', { class: 'nav-icon', html: ICONS[key] || '' }),
        el('span', { text: NAV_META[key].label }),
      ]);
      box.append(item);
    });
    navRoot.append(box);
  });
  navRoot.append(buildSaveBox());
  navRoot.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      navRoot.classList.remove('open');
    });
  });
}

function buildSaveBox() {
  const box = el('div', { class: 'nav-save' });
  const btn = el('button', { class: 'btn small nav-save-btn', type: 'button', text: '立即保存' });
  saveHintEl = el('span', {
    class: 'nav-save-hint',
    text: store.savedAt
      ? '自动保存已开启 · 上次保存 ' + store.savedAt
      : '自动保存已开启，这里只是立刻落盘',
  });
  btn.addEventListener('click', async () => {
    const wasDirty = store.dirty;
    btn.disabled = true;
    btn.textContent = '保存中…';
    const ok = await store.flushNow();
    btn.disabled = false;
    btn.textContent = '立即保存';
    if (!ok) return;
    if (wasDirty) {
      saveHintEl.textContent = '自动保存已开启 · 上次保存 ' + store.savedAt;
      toast.success('已保存 ' + store.savedAt + '（自动保存仍然开启）');
    } else {
      toast.success('没有待保存的修改；自动保存始终开启');
    }
  });
  box.append(btn, saveHintEl);
  return box;
}

function makeCtx() {
  return {
    store,
    settings: settingsData,
    today: todayStr,
    navigate(hash) {
      if (location.hash === hash) renderCurrent();
      else location.hash = hash;
    },
    refreshAll() {
      renderNav();
      renderCurrent();
    },
    onCleanup(fn) {
      if (typeof fn === 'function') cleanups.push(fn);
    },
  };
}

function renderCurrent() {
  cleanups.forEach((fn) => {
    try { fn(); } catch (err) { /* 忽略清理异常 */ }
  });
  cleanups = [];
  panel.closePanel();
  const parsed = parseHash();
  activeRoute = parsed.route;
  renderNav();
  viewRoot.innerHTML = '';
  const ctx = makeCtx();
  const view = VIEWS[parsed.route];
  activeView = view;
  try {
    view.render(viewRoot, ctx, parsed.params || {});
  } catch (err) {
    viewRoot.append(el('div', { class: 'empty-state' }, [
      el('p', { text: '页面加载失败：' + (err && err.message ? err.message : '未知错误') }),
      el('button', {
        class: 'btn primary',
        type: 'button',
        text: '重试',
        onclick: () => renderCurrent(),
      }),
    ]));
  }
  document.title = (NAV_META[activeRoute] ? NAV_META[activeRoute].label + ' · ' : '') + '个人工作生活 App';
}

function showWelcome() {
  const root = document.getElementById('welcome-root');
  if (!root) return;
  root.innerHTML = '';
  const mask = el('div', { class: 'welcome-mask' });
  const card = el('div', { class: 'welcome-card' }, [
    el('h2', { text: '欢迎使用你的工作生活总控台' }),
    el('ul', {}, [
      el('li', {}, [el('span', { class: 'dot', text: '·' }), '数据存在本机 data 文件夹里，不上传任何地方。']),
      el('li', {}, [el('span', { class: 'dot', text: '·' }), '关掉浏览器不影响数据；关掉服务窗口数据也已保存。']),
      el('li', {}, [el('span', { class: 'dot', text: '·' }), '备份 = 复制 data 文件夹里的 app-data.json。']),
    ]),
    el('button', {
      class: 'btn primary',
      type: 'button',
      text: '开始使用',
      onclick: () => {
        store.mutate((data) => { data.settings.welcomed = true; });
        store.flushNow();
        root.innerHTML = '';
      },
    }),
  ]);
  mask.append(card);
  root.append(mask);
}

function showBootError(err) {
  viewRoot.innerHTML = '';
  const box = el('div', { class: 'empty-state' }, [
    el('p', { text: '数据加载失败：' + (err && err.message ? err.message : '未知错误') }),
    el('p', { class: 'tiny muted', text: '请检查 data/app-data.json 是否被改成非法 JSON；原文件不会被覆盖。可从 data 目录内的备份恢复。' }),
    el('button', {
      class: 'btn primary',
      type: 'button',
      text: '重新加载',
      onclick: () => location.reload(),
    }),
  ]);
  viewRoot.append(box);
}

function bindGlobals() {
  store.onSaved((clock) => panel.markSaved(clock));
  store.onSaved((clock) => {
    if (saveHintEl) saveHintEl.textContent = '自动保存已开启 · 上次保存 ' + clock;
  });
  store.onError((message) => toast.error(message));

  document.getElementById('nav-toggle').addEventListener('click', () => {
    navRoot.classList.toggle('open');
  });
  document.addEventListener('click', (event) => {
    if (window.innerWidth >= 720) return;
    if (navRoot.classList.contains('open')
      && !navRoot.contains(event.target)
      && event.target.id !== 'nav-toggle') {
      navRoot.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
    if (event.key === 'n' || event.key === 'N') {
      if (activeView && typeof activeView.newItem === 'function') {
        event.preventDefault();
        activeView.newItem(store, makeCtx());
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    if (!store.dirty) return;
    try {
      const payload = store.beaconPayload();
      if (payload && navigator.sendBeacon) {
        navigator.sendBeacon('/api/data', new Blob([payload], { type: 'application/json' }));
      }
    } catch (err) { /* 关闭兜底失败不阻塞关闭 */ }
  });

  window.addEventListener('hashchange', renderCurrent);
}

async function boot() {
  try {
    const res = await api.getData();
    store.init(res.data, res.updatedAt);
  } catch (err) {
    bindGlobals();
    renderNav();
    showBootError(err);
    toast.error(err.message);
    return;
  }
  applyTheme(settingsData().theme);
  bindGlobals();
  renderNav();
  renderCurrent();
  if (settingsData().welcomed === false) showWelcome();
}

boot();

export { store };
