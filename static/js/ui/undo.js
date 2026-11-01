// ui/undo.js —— 底部 5 秒撤销条：挂起期间不落盘，撤销=取消标记，超时=真正提交
let state = null;

function clearState(commit) {
  if (!state) return;
  const snapshot = state;
  state = null;
  if (snapshot.timer) clearTimeout(snapshot.timer);
  if (snapshot.ticker) clearInterval(snapshot.ticker);
  snapshot.bar.remove();
  if (commit && typeof snapshot.onCommit === 'function') {
    try { snapshot.onCommit(); } catch (err) { /* 提交异常不应阻塞 */ }
  }
}

export function show(options = {}) {
  // 上一条撤销条如果还在，先立即提交，避免多条挂起叠加
  clearState(true);
  const root = document.getElementById('undo-root');
  if (!root) return;
  const seconds = options.seconds == null ? 5 : options.seconds;
  let remain = seconds;
  const bar = document.createElement('div');
  bar.className = 'undo-bar';
  const label = document.createElement('span');
  label.className = 'undo-label';
  const count = document.createElement('span');
  count.className = 'undo-count';
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.textContent = '撤销';
  bar.append(label, count, undoBtn);
  root.append(bar);

  function render() {
    label.textContent = options.label || '已删除';
    count.textContent = '（' + remain + ' 秒后可撤销）';
  }
  render();

  const snapshot = {
    bar,
    label,
    timer: null,
    ticker: null,
    onCommit: options.onCommit,
    onUndo: options.onUndo,
  };
  state = snapshot;

  snapshot.timer = setTimeout(() => {
    clearState(true);
  }, seconds * 1000);
  snapshot.ticker = setInterval(() => {
    remain -= 1;
    if (remain >= 0) render();
  }, 1000);

  undoBtn.addEventListener('click', () => {
    if (!state) return;
    const current = state;
    state = null;
    if (current.timer) clearTimeout(current.timer);
    if (current.ticker) clearInterval(current.ticker);
    current.bar.remove();
    if (typeof current.onUndo === 'function') {
      try { current.onUndo(); } catch (err) { /* 还原异常不应阻塞 */ }
    }
  });
}

/** 立即结束当前撤销条（commit=true 提交，false 静默丢弃） */
export function dismiss(commit) {
  clearState(Boolean(commit));
}

export function isShowing() {
  return Boolean(state);
}

export default { show, dismiss, isShowing };
