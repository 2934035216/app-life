// views/settings.js —— 数据与设置：备份恢复 / 外观 / 模块开关 / 偏好
import { api } from '../api.js';
import { confirm, choose } from '../ui/dialog.js';
import * as toast from '../ui/toast.js';
import { el, pageHead } from '../ui/common.js';

let R = null;

const MODULE_OPTIONS = [
  { key: 'today', label: '今日计划' },
  { key: 'selfmedia', label: '自媒体' },
  { key: 'dev', label: '开发工作' },
  { key: 'consult', label: '咨询工作' },
  { key: 'fitness', label: '健身计划' },
  { key: 'diet', label: '饮食计划' },
  { key: 'game', label: '游戏娱乐' },
];

export function render(root, ctx, params) {
  R = { root, ctx, restoring: false, savedText: '', backupNote: '' };
  root.innerHTML = '';
  draw();
  const off = ctx.store.onSaved((clock) => {
    if (!R) return;
    R.savedText = '已保存 ' + clock;
    if (R.savedNode) R.savedNode.textContent = R.savedText;
  });
  ctx.onCleanup(() => {
    off();
    R = null;
  });
}

function draw() {
  if (!R) return;
  const { root, ctx } = R;
  const settings = ctx.store.data.settings || {};
  root.innerHTML = '';

  R.savedNode = el('span', { class: 'muted tiny', text: R.savedText });
  root.append(pageHead('数据与设置', '备份、外观、模块开关与偏好', [R.savedNode]));

  /* ---------- 1. 备份与恢复 ---------- */
  const backupCard = el('section', { class: 'section-card', style: { marginBottom: '14px' } });
  backupCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '备份与恢复' }),
    el('span', { class: 'section-sub', text: '备份文件只写在 data 目录内' }),
  ]));
  backupCard.append(el('div', { class: 'settings-row' }, [
    el('div', { class: 'settings-info' }, [
      el('strong', { text: '导出备份' }),
      el('div', { class: 'muted tiny', text: '把当前数据复制为 data/backup-YYYYMMDD-HHmm.json。' }),
    ]),
    el('button', { class: 'btn', type: 'button', text: '导出备份', onclick: doBackup }),
  ]));
  backupCard.append(el('div', { class: 'settings-row' }, [
    el('div', { class: 'settings-info' }, [
      el('strong', { text: '从备份恢复' }),
      el('div', { class: 'muted tiny', text: '仅列出 data 目录内的备份文件；恢复前会自动存一份应急备份，恢复不可撤销。' }),
    ]),
    el('button', {
      class: 'btn', type: 'button', text: '选择备份…', disabled: R.restoring ? true : null,
      onclick: openRestoreChooser,
    }),
  ]));
  backupCard.append(el('div', { class: 'settings-row danger-row' }, [
    el('div', { class: 'settings-info' }, [
      el('strong', { text: '清空数据' }),
      el('div', { class: 'muted tiny', text: '需要手动输入「清空」二字；清空前自动备份，清空后回到首次使用引导。' }),
    ]),
    el('button', { class: 'btn danger', type: 'button', text: '清空数据', onclick: doClear }),
  ]));
  if (R.backupNote) {
    backupCard.append(el('div', { class: 'backup-note', text: R.backupNote }));
  }
  root.append(backupCard);

  /* ---------- 2. 外观 ---------- */
  const themeCard = el('section', { class: 'section-card', style: { marginBottom: '14px' } });
  themeCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '外观' }),
    el('span', { class: 'section-sub', text: '默认浅色，两档主题' }),
  ]));
  const themeRow = el('div', { class: 'settings-row' }, [
    el('div', { class: 'settings-info' }, [
      el('strong', { text: '主题' }),
      el('div', { class: 'muted tiny', text: '切换后即时生效，刷新保持。' }),
    ]),
  ]);
  const themeSwitch = el('div', { class: 'segmented' });
  [['light', '浅色'], ['dark', '深色']].forEach((pair) => {
    themeSwitch.append(el('button', {
      type: 'button',
      class: 'seg-btn' + ((settings.theme || 'light') === pair[0] ? ' active' : ''),
      text: pair[1],
      onclick: () => {
        ctx.store.setTheme(pair[0]);
        draw();
      },
    }));
  });
  themeRow.append(themeSwitch);
  themeCard.append(themeRow);
  root.append(themeCard);

  /* ---------- 3. 模块显示开关 ---------- */
  const moduleCard = el('section', { class: 'section-card', style: { marginBottom: '14px' } });
  moduleCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '模块显示开关' }),
    el('span', { class: 'section-sub', text: '首页与数据与设置不可隐藏' }),
  ]));
  moduleCard.append(el('p', {
    class: 'muted tiny',
    text: '隐藏期间数据仍在，重新开启即恢复。隐藏模块的事项不再汇总到首页。',
  }));
  const hidden = Array.isArray(settings.hiddenModules) ? settings.hiddenModules : [];
  const grid = el('div', { class: 'module-toggle-grid' });
  MODULE_OPTIONS.forEach((item) => {
    const checkbox = el('input', { type: 'checkbox', checked: hidden.indexOf(item.key) >= 0 ? true : null });
    checkbox.addEventListener('change', () => {
      ctx.store.mutate((data) => {
        const list = Array.isArray(data.settings.hiddenModules) ? data.settings.hiddenModules.slice() : [];
        const index = list.indexOf(item.key);
        if (checkbox.checked && index < 0) list.push(item.key);
        if (!checkbox.checked && index >= 0) list.splice(index, 1);
        data.settings.hiddenModules = list;
      });
      ctx.refreshAll();
    });
    grid.append(el('label', { class: 'module-toggle' }, [checkbox, el('span', { text: item.label })]));
  });
  moduleCard.append(grid);
  root.append(moduleCard);

  /* ---------- 4. 偏好 ---------- */
  const prefCard = el('section', { class: 'section-card' });
  prefCard.append(el('div', { class: 'section-head' }, [
    el('h2', { text: '偏好' }),
    el('span', { class: 'section-sub', text: '翻篇时间与喝水目标' }),
  ]));
  const rolloverRow = el('div', { class: 'settings-row' }, [
    el('div', { class: 'settings-info' }, [
      el('strong', { text: '一天翻篇时间' }),
      el('div', { class: 'muted tiny', text: '4 点时，0:00–4:00 之间的记录仍算昨天。' }),
    ]),
  ]);
  const rolloverSwitch = el('div', { class: 'segmented' });
  [0, 4].forEach((hour) => {
    rolloverSwitch.append(el('button', {
      type: 'button',
      class: 'seg-btn' + (Number(settings.dayRolloverHour) === hour ? ' active' : ''),
      text: hour + ' 点',
      onclick: () => {
        ctx.store.mutate((data) => { data.settings.dayRolloverHour = hour; });
        ctx.refreshAll();
      },
    }));
  });
  rolloverRow.append(rolloverSwitch);
  prefCard.append(rolloverRow);

  const goalInput = el('input', {
    type: 'number', min: '1', max: '30', value: settings.waterGoal || 8,
  });
  goalInput.addEventListener('change', () => {
    const value = Math.max(1, Math.min(30, Math.floor(Number(goalInput.value) || 8)));
    goalInput.value = value;
    ctx.store.mutate((data) => { data.settings.waterGoal = value; });
    ctx.refreshAll();
  });
  prefCard.append(el('div', { class: 'settings-row' }, [
    el('div', { class: 'settings-info' }, [
      el('strong', { text: '每天喝水目标杯数' }),
      el('div', { class: 'muted tiny', text: '范围 1~30，默认 8；首页与饮食页同步。' }),
    ]),
    goalInput,
  ]));
  root.append(prefCard);
}

async function doBackup() {
  if (!R) return;
  const ctx = R.ctx;
  try {
    const flushed = await ctx.store.flushNow();
    if (!flushed) throw new Error('当前修改尚未保存成功，请稍后重试');
    const res = await api.backup();
    R.backupNote = '备份已生成：' + (res.dir || 'data/') + res.file;
    toast.success('已导出备份：' + R.backupNote.replace('备份已生成：', ''));
    draw();
  } catch (err) {
    toast.error('备份失败：' + (err.message || '未知错误'));
  }
}

async function openRestoreChooser() {
  if (!R) return;
  const ctx = R.ctx;
  let res;
  try {
    res = await api.listBackups();
  } catch (err) {
    toast.error('读取备份列表失败：' + (err.message || '未知错误'));
    return;
  }
  const backups = res.backups || [];
  if (!backups.length) {
    await confirm({
      title: '暂无备份',
      body: 'data 目录里还没有备份文件，请先点「导出备份」。',
      cancelText: null,
      okText: '知道了',
    });
    return;
  }
  const selected = await choose({
    title: '选择要恢复的备份',
    body: '列出的都是 data 目录内的备份文件，按时间倒序。',
    options: backups.map((item) => ({
      value: item.file,
      label: item.file,
      description: (item.mtime || '').replace('T', ' ') + ' · ' + formatSize(item.size),
    })),
  });
  if (!selected || !R) return;
  const ok = await confirm({
    title: '确认从备份恢复？',
    body: '将用「' + selected + '」覆盖当前全部数据。\n'
      + '此操作不可撤销；恢复前会自动生成一份 backup-before-restore-*.json 应急备份。',
    danger: true,
    okText: '恢复',
  });
  if (!ok || !R) return;
  R.restoring = true;
  draw();
  try {
    const flushed = await ctx.store.flushNow();
    if (!flushed) throw new Error('当前修改尚未保存成功，请稍后重试');
    await api.restore(selected);
    await confirm({
      title: '恢复完成',
      body: '数据已与备份一致。请刷新页面查看。',
      cancelText: null,
      okText: '刷新页面',
    });
    location.reload();
  } catch (err) {
    if (!R) return;
    R.restoring = false;
    draw();
    toast.error('恢复失败：' + (err.message || '未知错误'));
  }
}

async function doClear() {
  if (!R) return;
  const ctx = R.ctx;
  const ok = await confirm({
    title: '清空全部数据',
    body: '这将删除本 App 的全部数据，并在清空前自动备份。恢复备份不可撤销，清空同样不可撤销。\n请输入「清空」二字以确认。',
    danger: true,
    requireText: '清空',
    okText: '清空数据',
  });
  if (!ok || !R) return;
  try {
    const flushed = await ctx.store.flushNow();
    if (!flushed) throw new Error('当前修改尚未保存成功，请稍后重试');
    await api.clear();
    await confirm({
      title: '清空完成',
      body: '数据已归零，并已生成 backup-before-clear-*.json。点击「刷新页面」回到欢迎引导。',
      cancelText: null,
      okText: '刷新页面',
    });
    location.reload();
  } catch (err) {
    toast.error('清空失败：' + (err.message || '未知错误'));
  }
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (Math.round((n / (1024 * 1024)) * 10) / 10) + ' MB';
}
