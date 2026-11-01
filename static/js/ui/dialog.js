// ui/dialog.js —— 确认框 / 表单弹窗 / 列表选择（requireText 模式用于"清空"强确认）
function shell(options) {
  const root = document.getElementById('dialog-root');
  if (!root) return null;
  root.innerHTML = '';
  const mask = document.createElement('div');
  mask.className = 'dialog-mask';
  const card = document.createElement('div');
  card.className = 'dialog-card' + (options.className ? ' ' + options.className : '');
  const title = document.createElement('h3');
  title.textContent = options.title || '';
  const body = document.createElement('div');
  body.className = 'dialog-body';
  if (options.body) body.textContent = options.body;
  const extra = document.createElement('div');
  extra.className = 'dialog-extra';
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  card.append(title);
  if (options.body) card.append(body);
  card.append(extra, actions);
  mask.append(card);
  root.append(mask);
  return { root, mask, card, body, extra, actions };
}

function closeShell(state) {
  if (!state) return;
  state.root.innerHTML = '';
  document.removeEventListener('keydown', state.onKey);
}

function addButton(actions, label, cls, onClick, disabled) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ' + (cls || '');
  btn.textContent = label;
  btn.disabled = Boolean(disabled);
  btn.addEventListener('click', onClick);
  actions.append(btn);
  return btn;
}

export function confirm(options = {}) {
  return new Promise((resolve) => {
    const state = shell(options);
    if (!state) { resolve(false); return; }
    let input = null;
    if (options.requireText) {
      const label = document.createElement('label');
      label.className = 'tiny muted';
      label.textContent = '请输入「' + options.requireText + '」以确认';
      input = document.createElement('input');
      input.type = 'text';
      input.placeholder = options.requireText;
      state.extra.append(label, input);
    }
    const cancelText = options.cancelText === null ? null : (options.cancelText || '取消');
    let cancelBtn = null;
    if (cancelText) {
      cancelBtn = addButton(state.actions, cancelText, 'ghost', finish.bind(null, false));
    }
    const okBtn = addButton(state.actions, options.okText || '确认', options.danger ? 'danger' : 'primary', finish.bind(null, true), Boolean(options.requireText));
    function finish(value) {
      closeShell(state);
      resolve(value);
    }
    if (input) {
      input.addEventListener('input', () => {
        okBtn.disabled = input.value.trim() !== options.requireText;
      });
      setTimeout(() => input.focus(), 30);
    }
    state.onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };
    document.addEventListener('keydown', state.onKey);
    state.mask.addEventListener('click', (event) => {
      if (event.target === state.mask) finish(false);
    });
    if (options.danger === false) okBtn.classList.remove('danger');
  });
}

export function form(options = {}) {
  return new Promise((resolve) => {
    const state = shell(options);
    if (!state) { resolve(null); return; }
    const fields = options.fields || [];
    const inputs = {};
    fields.forEach((field) => {
      const wrap = document.createElement('div');
      wrap.className = 'form-field';
      const label = document.createElement('label');
      label.textContent = field.label || '';
      let control;
      if (field.type === 'textarea') {
        control = document.createElement('textarea');
      } else if (field.type === 'select') {
        control = document.createElement('select');
        (field.options || []).forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          control.append(o);
        });
      } else {
        control = document.createElement('input');
        control.type = field.type || 'text';
      }
      control.value = field.value == null ? '' : field.value;
      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.required) control.required = true;
      wrap.append(label, control);
      if (field.hint) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = field.hint;
        wrap.append(hint);
      }
      state.extra.append(wrap);
      inputs[field.name] = control;
    });
    function finish(value) {
      closeShell(state);
      resolve(value);
    }
    addButton(state.actions, options.cancelText || '取消', 'ghost', finish.bind(null, null));
    addButton(state.actions, options.okText || '确认', options.danger ? 'danger' : 'primary', () => {
      const values = {};
      let invalid = false;
      fields.forEach((field) => {
        const control = inputs[field.name];
        values[field.name] = control ? control.value : '';
        if (field.required && !String(values[field.name] || '').trim()) {
          invalid = true;
          control.classList.add('invalid');
        }
      });
      if (invalid) return;
      finish(values);
    });
    state.onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };
    document.addEventListener('keydown', state.onKey);
    state.mask.addEventListener('click', (event) => {
      if (event.target === state.mask) finish(null);
    });
    const first = fields.length ? inputs[fields[0].name] : null;
    if (first) setTimeout(() => first.focus(), 30);
  });
}

export function choose(options = {}) {
  return new Promise((resolve) => {
    const state = shell(Object.assign({}, options, { className: 'choose' }));
    if (!state) { resolve(null); return; }
    const list = document.createElement('div');
    list.className = 'dialog-choice-list';
    const choices = options.options || [];
    if (!choices.length) {
      const empty = document.createElement('div');
      empty.className = 'muted tiny';
      empty.textContent = options.emptyText || '暂无可选项';
      list.append(empty);
    }
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dialog-choice';
      const main = document.createElement('div');
      main.className = 'choice-main';
      main.textContent = choice.label;
      btn.append(main);
      if (choice.description) {
        const sub = document.createElement('div');
        sub.className = 'choice-sub';
        sub.textContent = choice.description;
        btn.append(sub);
      }
      btn.addEventListener('click', () => finish(choice.value));
      list.append(btn);
    });
    state.extra.append(list);
    function finish(value) {
      closeShell(state);
      resolve(value);
    }
    addButton(state.actions, '取消', 'ghost', finish.bind(null, null));
    state.onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };
    document.addEventListener('keydown', state.onKey);
    state.mask.addEventListener('click', (event) => {
      if (event.target === state.mask) finish(null);
    });
  });
}

export default { confirm, form, choose };
