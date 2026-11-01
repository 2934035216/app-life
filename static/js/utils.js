// utils.js —— 日期口径与通用工具（全 App 唯一允许出现 new Date( 的文件）
// 约定：日期字符串一律 "YYYY-MM-DD"，日期时间 "YYYY-MM-DDTHH:MM"。

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDate(dateStr) {
  return new Date(String(dateStr) + 'T00:00:00');
}

export function toDateStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 凌晨 dayRolloverHour 点前仍算"昨天"；全 App 唯一的"今天"入口 */
export function today(settings) {
  const now = new Date();
  const hour = settings && Number(settings.dayRolloverHour) >= 0 ? Number(settings.dayRolloverHour) : 4;
  let d = toDateStr(now);
  if (now.getHours() < hour) d = addDays(d, -1);
  return d;
}

export function addDays(dateStr, n) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + Number(n || 0));
  return toDateStr(d);
}

/** 周一=0 … 周日=6（用于 weekStart / workoutTemplates 的 dayOfWeek 换算） */
export function weekdayIndex(dateStr) {
  return (toDate(dateStr).getDay() + 6) % 7;
}

/** ISO 风格 dayOfWeek：1=周一 … 7=周日 */
export function isoDayOfWeek(dateStr) {
  return weekdayIndex(dateStr) + 1;
}

export function weekStart(dateStr) {
  return addDays(dateStr, -weekdayIndex(dateStr));
}

export function weekDates(dateStr) {
  const start = weekStart(dateStr);
  const out = [];
  for (let i = 0; i < 7; i += 1) out.push(addDays(start, i));
  return out;
}

/**
 * 月历网格：以 anchorDate 所在月为基准，monthOffset 前后翻月。
 * 固定 6 行 × 7 列（周一开头），包含前后月的补位日期。
 */
export function monthGrid(anchorDate, monthOffset = 0) {
  const d = toDate(anchorDate);
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(monthOffset || 0));
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const monthKey = year + '-' + pad2(month);
  const first = monthKey + '-01';
  const start = weekStart(first);
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const row = [];
    for (let i = 0; i < 7; i += 1) row.push(addDays(start, w * 7 + i));
    weeks.push(row);
  }
  return { year, month, monthKey, first, start, weeks, label: year + ' 年 ' + month + ' 月' };
}

export function weekdayCN(dateStr) {
  return WEEK_CN[toDate(dateStr).getDay()];
}

export function fmtDateCN(dateStr) {
  if (!isDateStr(dateStr)) return '';
  const d = toDate(dateStr);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK_CN[d.getDay()];
}

export function fmtDateShort(dateStr) {
  if (!isDateStr(dateStr)) return '';
  const d = toDate(dateStr);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

export function daysBetween(a, b) {
  const da = toDate(a).getTime();
  const db = toDate(b).getTime();
  return Math.round((db - da) / 86400000);
}

export function lastNDates(endDate, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(addDays(endDate, -i));
  return out;
}

export function nowISO() {
  return new Date().toISOString();
}

export function nowDateTimeLocal() {
  const d = new Date();
  return toDateStr(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

export function nowClock() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

export function nowDate() {
  const d = new Date();
  return toDateStr(d);
}

export function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return (prefix ? prefix + '-' : '') + Date.now().toString(36) + '-' + rand;
}

export function debounce(fn, ms) {
  let timer = null;
  function wrapped(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(null, args);
    }, ms);
  }
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = (...args) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn.apply(null, args);
  };
  return wrapped;
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 序列化前剔除以下划线开头的内存字段（_pendingDelete 等） */
export function stripPending(value) {
  if (Array.isArray(value)) return value.map(stripPending);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      if (key.charAt(0) === '_') return;
      out[key] = stripPending(value[key]);
    });
    return out;
  }
  return value;
}

export function visibleItems(arr) {
  return (arr || []).filter((item) => item && !item._pendingDelete);
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export function minutesToHours(minutes) {
  const mins = Number(minutes) || 0;
  return Math.round((mins / 60) * 10) / 10;
}

export function fmtMinutes(minutes) {
  const mins = Math.max(0, Math.floor(Number(minutes) || 0));
  if (mins < 60) return mins + ' 分钟';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
}

export function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function byCreatedAsc(a, b) {
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

export function byCreatedDesc(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

export function sortByKeyDesc(arr, key) {
  return arr.slice().sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));
}
