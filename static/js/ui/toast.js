// ui/toast.js —— 顶部红色错误横幅与普通成功提示
function ensureStack() {
  const root = document.getElementById('toast-root');
  if (!root) return null;
  let stack = root.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    root.append(stack);
  }
  return stack;
}

function push(kind, message, ttl) {
  const stack = ensureStack();
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + kind;
  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', '关闭提示');
  close.textContent = '×';
  toast.append(msg, close);
  stack.append(toast);
  close.addEventListener('click', () => toast.remove());
  if (ttl) {
    setTimeout(() => toast.remove(), ttl);
  }
  return toast;
}

export function error(message) {
  return push('error', message || '保存失败，请重试或检查数据文件', 0);
}

export function success(message) {
  return push('success', message, 3200);
}

export function dismissAll() {
  const root = document.getElementById('toast-root');
  if (root) root.innerHTML = '';
}

export default { error, success, dismissAll };
