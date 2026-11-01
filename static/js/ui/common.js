// ui/common.js —— 视图共用的小零件（DOM 只在函数内访问）
import { confirm } from './dialog.js';
import * as undo from './undo.js';
import { SOURCE_META } from '../todoEngine.js';

export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach((key) => {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key === 'value') node.value = value;
      else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    });
  }
  if (children !== null && children !== undefined) {
    const list = Array.isArray(children) ? children : [children];
    list.forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
  }
  return node;
}

export function emptyState(message, actionLabel, onAction) {
  const wrap = el('div', { class: 'empty-state' }, [
    el('p', { text: message }),
  ]);
  if (actionLabel && onAction) {
    wrap.append(el('button', { class: 'btn primary', type: 'button', text: actionLabel, onclick: onAction }));
  }
  return wrap;
}

export function sourceTag(source) {
  const meta = SOURCE_META[source] || { label: source || '未知', cls: 'manual' };
  return el('span', { class: 'source-tag ' + meta.cls, text: meta.label });
}

export function field(label, control, hint) {
  const wrap = el('div', { class: 'form-field' }, [el('label', { text: label }), control]);
  if (hint) wrap.append(el('span', { class: 'hint', text: hint }));
  return wrap;
}

export function textInput(value, placeholder, onInput, onBlur, extra) {
  return el('input', Object.assign({
    type: 'text',
    value: value == null ? '' : value,
    placeholder: placeholder || '',
    oninput: onInput,
    onblur: onBlur,
  }, extra || {}));
}

export function dateInput(value, onChange, extra) {
  return el('input', Object.assign({
    type: 'date',
    value: value || '',
    onchange: onChange,
  }, extra || {}));
}

export function numberInput(value, onBlur, extra) {
  return el('input', Object.assign({
    type: 'number',
    value: value == null ? '' : value,
    onblur: onBlur,
  }, extra || {}));
}

export function selectInput(value, options, onChange) {
  const sel = el('select', { onchange: onChange });
  options.forEach((opt) => {
    const option = el('option', { value: opt.value, text: opt.label });
    if (opt.value === value) option.selected = true;
    sel.append(option);
  });
  return sel;
}

/** 删除统一流程：确认框 → 挂起 → 撤销条（5 秒后真正提交） */
export async function deleteWithUndo(opts = {}) {
  const ok = await confirm({
    title: opts.title || '确认删除？',
    body: opts.body || '',
    danger: true,
    okText: '删除',
  });
  if (!ok) return false;
  if (typeof opts.onConfirm === 'function') opts.onConfirm();
  undo.show({
    label: opts.undoLabel || (opts.title ? opts.title.replace(/？$/, '') : '已删除'),
    seconds: 5,
    onCommit: opts.onCommit,
    onUndo: opts.onUndo,
  });
  return true;
}

export function pageHead(title, subtitle, actions) {
  const head = el('div', { class: 'page-head' }, [
    el('div', { class: 'page-title-block' }, [
      el('h1', { text: title }),
      subtitle ? el('div', { class: 'page-sub', text: subtitle }) : null,
    ]),
  ]);
  if (actions) {
    const box = el('div', { class: 'page-actions' }, actions);
    head.append(box);
  }
  return head;
}

export function tabs(items, active, onSwitch) {
  const bar = el('div', { class: 'tabs' });
  items.forEach((item) => {
    bar.append(el('button', {
      type: 'button',
      class: 'tab-btn' + (item.key === active ? ' active' : ''),
      text: item.label,
      onclick: () => onSwitch(item.key),
    }));
  });
  return bar;
}
