// 与 utils.js 的日期口径/工具函数测试（P1 T1-5a/T1-5b）
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import {
  addDays,
  clamp,
  clone,
  debounce,
  daysBetween,
  fmtDateCN,
  fmtMinutes,
  isoDayOfWeek,
  lastNDates,
  minutesToHours,
  monthGrid,
  sortByKeyDesc,
  stripPending,
  toInt,
  today,
  uid,
  visibleItems,
  weekDates,
  weekStart,
  weekdayIndex,
} from '../../static/js/utils.js';

test('today()：凌晨 4 点翻篇，3:59 归昨天、4:01 归今天', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 1, 3, 59, 0) });
  assert.equal(today({ dayRolloverHour: 4 }), '2026-10-31');
  mock.timers.reset();

  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 1, 4, 1, 0) });
  assert.equal(today({ dayRolloverHour: 4 }), '2026-11-01');
  mock.timers.reset();
});

test('today()：翻篇时间改为 0 点时口径随之切换', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 1, 3, 59, 0) });
  assert.equal(today({ dayRolloverHour: 0 }), '2026-11-01');
  mock.timers.reset();

  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 1, 0, 30, 0) });
  assert.equal(today({ dayRolloverHour: 4 }), '2026-10-31');
  mock.timers.reset();
});

test('today()：默认翻篇为 4 点', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 1, 2, 0, 0) });
  assert.equal(today({}), '2026-10-31');
  mock.timers.reset();
});

test('addDays：跨月、跨年、闰年边界', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-11-01', 0), '2026-11-01');
  assert.equal(addDays('2026-11-01', 2), '2026-11-03');
});

test('weekStart：周一为周起点（周日归到上一个周一）', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(weekStart('2026-10-30'), '2026-10-26');
  assert.equal(isoDayOfWeek('2026-10-26'), 1);
  assert.equal(isoDayOfWeek('2026-11-01'), 7);
  assert.equal(weekdayIndex('2026-11-01'), 6);
});

test('weekDates：返回周一到周日 7 天', () => {
  assert.deepEqual(weekDates('2026-11-01'), [
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
    '2026-10-30', '2026-10-31', '2026-11-01',
  ]);
  assert.deepEqual(lastNDates('2026-11-01', 3), ['2026-10-30', '2026-10-31', '2026-11-01']);
});

test('monthGrid：固定 6×7 周一开头，含前后月补位，可前后翻月', () => {
  const grid = monthGrid('2026-11-01', 0);
  assert.equal(grid.year, 2026);
  assert.equal(grid.month, 11);
  assert.equal(grid.monthKey, '2026-11');
  assert.equal(grid.first, '2026-11-01');
  assert.equal(grid.label, '2026 年 11 月');
  assert.equal(grid.weeks.length, 6);
  grid.weeks.forEach((week) => assert.equal(week.length, 7));
  assert.deepEqual(grid.weeks[0], [
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
    '2026-10-30', '2026-10-31', '2026-11-01',
  ]);
  assert.deepEqual(grid.weeks[5], [
    '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03',
    '2026-12-04', '2026-12-05', '2026-12-06',
  ]);
  const all = grid.weeks.flat();
  assert.equal(all.indexOf('2026-11-29'), 34, '11 月 29 日落在第 5 行第 6 列');
  all.forEach((date, i) => {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    if (i > 0) assert.equal(date, addDays(all[i - 1], 1), '日期连续不断档');
  });

  const prev = monthGrid('2026-11-15', -1);
  assert.equal(prev.monthKey, '2026-10');
  assert.equal(prev.start, '2026-09-28', '10 月 1 日是周四，从 9 月 28 日周一开始');
  const next = monthGrid('2026-12-31', 1);
  assert.equal(next.monthKey, '2027-01');
  assert.equal(next.label, '2027 年 1 月');
});

test('daysBetween / 中文日期格式化', () => {
  assert.equal(daysBetween('2026-10-30', '2026-11-01'), 2);
  assert.equal(daysBetween('2026-11-01', '2026-10-30'), -2);
  assert.equal(fmtDateCN('2026-11-01'), '11月1日 周日');
});

test('uid：带前缀且足够唯一', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) ids.add(uid('todo'));
  assert.equal(ids.size, 200);
  assert.match([...ids][0], /^todo-/);
});

test('debounce：等停后只执行一次，cancel/flush 生效', async () => {
  let calls = 0;
  const fn = debounce(() => { calls += 1; }, 30);
  fn();
  fn();
  fn();
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(calls, 1);

  calls = 0;
  fn();
  fn.cancel();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls, 0);

  calls = 0;
  fn();
  fn.flush();
  assert.equal(calls, 1);
});

test('stripPending：递归剔除下划线字段，原对象不变', () => {
  const input = {
    id: 'a',
    _pendingDelete: true,
    child: { id: 'b', _pendingDelete: true, keep: 1 },
    list: [{ id: 'c', _pendingDelete: true }],
  };
  const out = stripPending(input);
  assert.deepEqual(out, { id: 'a', child: { id: 'b', keep: 1 }, list: [{ id: 'c' }] });
  assert.equal(input._pendingDelete, true);
  assert.equal(input.child._pendingDelete, true);
});

test('visibleItems：过滤挂起删除项', () => {
  assert.deepEqual(visibleItems([
    { id: '1' },
    { id: '2', _pendingDelete: true },
    null,
    { id: '3' },
  ]).map((item) => item.id), ['1', '3']);
});

test('clone / clamp / toInt / 时长换算 / 排序', () => {
  const src = { a: [1, { b: 2 }] };
  const copy = clone(src);
  copy.a[1].b = 3;
  assert.equal(src.a[1].b, 2);

  assert.equal(clamp(5, 1, 3), 3);
  assert.equal(clamp(-1, 1, 3), 1);
  assert.equal(clamp('x', 1, 3), 1);
  assert.equal(toInt('4.9', 0), 4);
  assert.equal(toInt('x', 0), 0);

  assert.equal(minutesToHours(90), 1.5);
  assert.equal(fmtMinutes(45), '45 分钟');
  assert.equal(fmtMinutes(60), '1 小时');
  assert.equal(fmtMinutes(90), '1 小时 30 分');

  const list = [{ d: '2026-01-01' }, { d: '2026-03-01' }, { d: '2026-02-01' }];
  assert.deepEqual(sortByKeyDesc(list, 'd').map((x) => x.d), ['2026-03-01', '2026-02-01', '2026-01-01']);
});
