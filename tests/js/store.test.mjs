// store.js 自动保存/防抖/重试/冲突测试（P2 T2-4）
import test from 'node:test';
import assert from 'node:assert/strict';

import { Store } from '../../static/js/store.js';
import { ApiError } from '../../static/js/api.js';

function initialData() {
  return {
    version: 1,
    todos: [], memos: [], contents: [],
    devProjects: [], devTasks: [], devLogs: [],
    clients: [], consultSessions: [],
    workoutTemplates: [], workoutLogs: [], weightEntries: [],
    mealLogs: [], mealTemplates: [], waterLogs: [],
    games: [], gameSessions: [],
    settings: { theme: 'light', dayRolloverHour: 4, waterGoal: 8, hiddenModules: [], welcomed: false },
  };
}

function makeClient(handler) {
  const calls = [];
  return {
    calls,
    async saveData(base, data) {
      calls.push({ base, data });
      return handler(base, data, calls.length);
    },
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('5 次 mutate 在防抖窗口内只发 1 次 POST，负载含全部修改', async () => {
  const client = makeClient(async () => ({ updatedAt: 'u1' }));
  const store = new Store(client, { shortDelay: 20, longDelay: 50, retryDelays: [10] });
  store.init(initialData(), 'u0');
  for (let i = 0; i < 5; i += 1) {
    store.mutate((data) => {
      data.memos.push({ id: 'm' + i, text: 'memo' + i });
    });
  }
  await wait(80);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].data.memos.length, 5);
  assert.equal(client.calls[0].base, 'u0');
  assert.equal(store.dirty, false);
  assert.equal(store.updatedAt, 'u1');
});

test('长文本 mutate 使用 1 秒档（长延迟）', async () => {
  const client = makeClient(async () => ({ updatedAt: 'u1' }));
  const store = new Store(client, { shortDelay: 20, longDelay: 60, retryDelays: [10] });
  store.init(initialData(), 'u0');
  store.mutate((data) => { data.contents.push({ id: 'c1', title: '写稿' }); }, { long: true });
  await wait(40);
  assert.equal(client.calls.length, 0, '长文本不应在短防抖窗口内落盘');
  await wait(60);
  assert.equal(client.calls.length, 1);
});

test('保存成功回调“已保存 HH:MM”并清 dirty', async () => {
  let savedClock = null;
  const client = makeClient(async () => ({ updatedAt: 'u1' }));
  const store = new Store(client, { shortDelay: 20, longDelay: 60, retryDelays: [10] });
  store.init(initialData(), 'u0');
  store.onSaved((clock) => { savedClock = clock; });
  store.mutate((data) => { data.memos.push({ id: 'm1', text: 'a' }); });
  await wait(80);
  assert.match(String(savedClock), /^\d{2}:\d{2}$/);
  assert.equal(store.dirty, false);
  assert.equal(store.savedAt, savedClock);
});

test('flushNow：手动保存立即落盘并跳过防抖，无改动时不重复发请求', async () => {
  const client = makeClient(async () => ({ updatedAt: 'u1' }));
  const store = new Store(client, { shortDelay: 200, longDelay: 400, retryDelays: [10] });
  store.init(initialData(), 'u0');

  assert.equal(store.dirty, false);
  assert.equal(await store.flushNow(), true);
  assert.equal(client.calls.length, 0, '没有待保存改动时不应发请求');

  store.mutate((data) => { data.memos.push({ id: 'm1', text: '手动保存' }); });
  assert.equal(store.dirty, true);
  const started = Date.now();
  assert.equal(await store.flushNow(), true);
  assert.ok(Date.now() - started < 180, '手动保存应跳过 200ms 防抖');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].data.memos[0].text, '手动保存');
  assert.equal(store.dirty, false);
  assert.match(String(store.savedAt), /^\d{2}:\d{2}$/);

  await wait(260);
  assert.equal(client.calls.length, 1, '防抖计时器已被手动保存清掉，不应重复落盘');
});

test('409 冲突：用 serverUpdatedAt 重发一次后成功', async () => {
  const client = makeClient(async (base, data, callNo) => {
    if (callNo === 1) {
      throw new ApiError('conflict', {
        status: 409,
        code: 'CONFLICT',
        payload: { ok: false, serverUpdatedAt: 'server-u' },
      });
    }
    return { updatedAt: 'u2' };
  });
  const store = new Store(client, { shortDelay: 10, longDelay: 30, retryDelays: [10] });
  store.init(initialData(), 'local-u');
  store.mutate((data) => { data.memos.push({ id: 'm1', text: 'a' }); });
  await wait(60);
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[1].base, 'server-u');
  assert.equal(store.updatedAt, 'u2');
  assert.equal(store.dirty, false);
});

test('保存失败：错误回调 + 退避重试后成功，表单数据不丢', async () => {
  let errorMessage = null;
  const client = makeClient(async (base, data, callNo) => {
    if (callNo === 1) throw new ApiError('网络断开', { code: 'NETWORK' });
    return { updatedAt: 'u2' };
  });
  const store = new Store(client, { shortDelay: 10, longDelay: 30, retryDelays: [25] });
  store.init(initialData(), 'u0');
  store.onError((message) => { errorMessage = message; });
  store.mutate((data) => { data.memos.push({ id: 'm1', text: '重要内容' }); });
  await wait(40);
  assert.equal(errorMessage, '网络断开');
  assert.equal(store.dirty, true, '失败后必须保持脏状态');
  assert.equal(store.data.memos[0].text, '重要内容');
  await wait(80);
  assert.equal(client.calls.length, 2);
  assert.equal(store.dirty, false);
});

test('落盘负载剔除 _pendingDelete 等内存字段', async () => {
  const client = makeClient(async () => ({ updatedAt: 'u1' }));
  const store = new Store(client, { shortDelay: 10, longDelay: 30, retryDelays: [10] });
  store.init(initialData(), 'u0');
  store.mutate((data) => {
    data.memos.push({ id: 'm1', text: 'a', _pendingDelete: true });
  });
  await wait(50);
  assert.equal(client.calls.length, 1);
  const payload = client.calls[0].data;
  assert.equal(payload.memos[0]._pendingDelete, undefined);
  assert.equal(payload.memos[0].text, 'a');
});

test('setTheme 即时写入 settings.theme', async () => {
  const client = makeClient(async () => ({ updatedAt: 'u1' }));
  const store = new Store(client, { shortDelay: 10, longDelay: 30, retryDelays: [10] });
  store.init(initialData(), 'u0');
  store.setTheme('dark');
  assert.equal(store.data.settings.theme, 'dark');
  await wait(50);
  assert.equal(client.calls[0].data.settings.theme, 'dark');
});

test('beaconPayload 是合法 JSON 且不含下划线字段', () => {
  const store = new Store(makeClient(async () => ({ updatedAt: 'u1' })));
  store.init(initialData(), 'u0');
  store.data.memos.push({ id: 'm1', text: 'x', _pendingDelete: true });
  const raw = store.beaconPayload();
  assert.equal(typeof raw, 'string');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.baseUpdatedAt, 'u0');
  assert.equal(parsed.data.memos[0]._pendingDelete, undefined);
});
