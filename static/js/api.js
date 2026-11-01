// api.js —— 7 个后端接口的 fetch 封装（同源，无外网依赖）
export class ApiError extends Error {
  constructor(message, opts = {}) {
    super(message || '请求失败');
    this.name = 'ApiError';
    this.status = opts.status || 0;
    this.code = opts.code || 'UNKNOWN';
    this.payload = opts.payload || null;
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body } = options;
  const init = { method, cache: 'no-store', headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json; charset=utf-8';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError('无法连接本地服务，请确认服务窗口仍在运行', { code: 'NETWORK' });
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    payload = null;
  }
  if (!payload) {
    throw new ApiError('服务返回内容无法解析', { status: res.status, code: 'BAD_RESPONSE' });
  }
  if (!res.ok || payload.ok === false) {
    const info = payload.error || {};
    throw new ApiError(info.message || '请求失败', {
      status: res.status,
      code: info.code || 'HTTP_' + res.status,
      payload,
    });
  }
  return payload;
}

export const api = {
  health() {
    return request('/api/health');
  },
  getData() {
    return request('/api/data');
  },
  saveData(baseUpdatedAt, data) {
    return request('/api/data', { method: 'POST', body: { baseUpdatedAt, data } });
  },
  backup() {
    return request('/api/backup', { method: 'POST', body: {} });
  },
  listBackups() {
    return request('/api/backups');
  },
  restore(file) {
    return request('/api/restore', { method: 'POST', body: { file } });
  },
  clear() {
    return request('/api/clear', { method: 'POST', body: {} });
  },
};

export default api;
