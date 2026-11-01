// ui/panel.js —— 全局唯一的右侧侧滑面板（40% / 50% 两档宽，禁止嵌套）
let current = null;

export function isOpen() {
  return Boolean(current);
}

export function openPanel(options = {}) {
  if (current) return null; // 禁止面板内再开第二个面板
  const root = document.getElementById('panel-root');
  if (!root) return null;
  const mask = document.createElement('div');
  mask.className = 'panel-mask';
  const panel = document.createElement('aside');
  panel.className = 'side-panel ' + (options.width === '50' ? 'w50' : 'w40');
  const head = document.createElement('div');
  head.className = 'panel-head';
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = options.title || '';
  const saved = document.createElement('span');
  saved.className = 'panel-saved';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'panel-close';
  closeBtn.setAttribute('aria-label', '关闭面板');
  closeBtn.textContent = '×';
  head.append(title, saved, closeBtn);
  const body = document.createElement('div');
  body.className = 'panel-body';
  panel.append(head, body);
  root.append(mask, panel);

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    if (typeof options.onClose === 'function') {
      try { options.onClose(); } catch (err) { /* 关闭回调异常不影响收起 */ }
    }
    mask.remove();
    panel.remove();
    document.removeEventListener('keydown', onKey);
    if (current === api) current = null;
  }

  function onKey(event) {
    if (event.key !== 'Escape') return;
    const dialogRoot = document.getElementById('dialog-root');
    if (dialogRoot && dialogRoot.childElementCount > 0) return;
    close();
  }

  mask.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  const api = {
    el: panel,
    body,
    close,
    isOpen() { return !closed; },
    setTitle(text) { title.textContent = text || ''; },
    setStatus(text) { saved.textContent = text || ''; },
    markSaved(clock) { saved.textContent = clock ? '已保存 ' + clock : '已保存'; },
  };
  current = api;

  if (options.content) {
    if (typeof options.content === 'function') options.content(body);
    else body.append(options.content);
  }
  return api;
}

export function markSaved(clock) {
  if (current && current.isOpen()) {
    current.setStatus(clock ? '已保存 ' + clock : '已保存');
  }
}

export function closePanel() {
  if (current) current.close();
}

export default { isOpen, openPanel, markSaved, closePanel };
