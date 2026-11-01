# -*- coding: utf-8 -*-
"""DEV-PLAN 8.1 的 P0/P1 自动化断言（独立于单元测试，可在交付前手动运行）。

用法：
    python scripts/check.py

脚本在临时数据目录启动真实 server.py（--no-browser，空闲端口），
逐条执行 8.1 的 11 项断言；任一失败返回非 0。
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_PATH = os.path.join(BASE_DIR, "server.py")

TOP_KEYS = [
    "todos", "memos", "contents",
    "devProjects", "devTasks", "devLogs",
    "clients", "consultSessions",
    "workoutTemplates", "workoutLogs", "weightEntries",
    "mealLogs", "mealTemplates", "waterLogs",
    "games", "gameSessions",
]
BACKUP_RE = re.compile(r"^backup(-before-(restore|clear))?-\d{8}-\d{4}(-\d+)?\.json$")

CHECKS = []


def free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def http(base, method, path, body=None):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return resp.status, raw, dict(resp.headers)
    except urllib.error.HTTPError as err:
        return err.code, err.read(), dict(err.headers)


def json_body(raw):
    return json.loads(raw.decode("utf-8")) if raw else None


class Server:
    def __init__(self, data_dir, port):
        self.data_dir = data_dir
        self.data_file = os.path.join(data_dir, "app-data.json")
        self.port = port
        self.base = "http://127.0.0.1:%d" % port
        self.proc = subprocess.Popen(
            [sys.executable, SERVER_PATH, "--data-dir", data_dir, "--port", str(port), "--no-browser"],
            cwd=BASE_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace",
        )

    def wait_ready(self, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("服务提前退出：%s" % self.proc.stdout.read())
            try:
                status, raw, _ = http(self.base, "GET", "/api/health")
                if status == 200 and json_body(raw)["ok"]:
                    return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("服务启动超时")

    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
        if self.proc and self.proc.stdout:
            self.proc.stdout.close()

    def data_bytes(self):
        with open(self.data_file, "rb") as f:
            return f.read()

    def data_json(self):
        return json.loads(self.data_bytes().decode("utf-8"))


def expect(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))
    print(("[PASS] " if ok else "[FAIL] ") + name + (" :: " + detail if detail else ""), flush=True)
    return bool(ok)


def main():
    temp_dir = tempfile.mkdtemp(prefix="lifeapp-check-")
    data_dir = os.path.join(temp_dir, "data")
    server = Server(data_dir, free_port())
    try:
        server.wait_ready()

        # 1. 首页骨架
        status, raw, _ = http(server.base, "GET", "/")
        expect("1 首页 200 且含 id=\"view\"", status == 200 and b'id="view"' in raw)

        # 2. health
        status, raw, _ = http(server.base, "GET", "/api/health")
        health = json_body(raw) or {}
        expect("2 /api/health version==1", status == 200 and health.get("version") == 1, str(health))

        # 3. 静态 no-store
        status, raw, headers = http(server.base, "GET", "/static/js/main.js")
        expect("3 main.js 200 + no-store",
               status == 200 and headers.get("Cache-Control") == "no-store")

        # 4. 初始数据文件
        data = server.data_json()
        complete = all(key in data for key in TOP_KEYS) and len(data.get("workoutTemplates", [])) == 7
        expect("4 app-data.json 顶层键齐全 + 7 条模板", complete)

        # 5. 读写回环
        status, raw, _ = http(server.base, "GET", "/api/data")
        payload = json_body(raw)
        base_updated = payload["updatedAt"]
        data = payload["data"]
        data["memos"].append({
            "id": "memo-check", "text": "断言用备忘", "convertedToTodo": False, "todoId": None,
            "createdAt": "2026-11-01T09:00:00", "updatedAt": "2026-11-01T09:00:00",
        })
        status, raw, _ = http(server.base, "POST", "/api/data",
                              {"baseUpdatedAt": base_updated, "data": data})
        saved = json_body(raw) or {}
        disk = server.data_json()
        expect("5 写入回环：磁盘与提交内容一致",
               status == 200 and disk["memos"][-1]["text"] == "断言用备忘",
               "status=%s" % status)

        # 6. 50 次原子写
        ok50 = True
        for index in range(50):
            data["memos"][-1]["text"] = "断言用备忘-%d" % index
            status, raw, _ = http(server.base, "POST", "/api/data",
                                  {"baseUpdatedAt": saved.get("updatedAt"), "data": data})
            payload = json_body(raw) or {}
            saved["updatedAt"] = payload.get("updatedAt")
            try:
                server.data_json()
            except Exception:
                ok50 = False
                break
            if status != 200:
                ok50 = False
                break
        expect("6 50 次原子写后文件始终合法", ok50)

        # 7. 旧指纹 409
        stale = saved.get("updatedAt")
        status, raw, _ = http(server.base, "POST", "/api/data",
                              {"baseUpdatedAt": stale + "-old", "data": data})
        expect("7 旧 baseUpdatedAt → 409", status == 409, "status=%s" % status)

        # 8. 备份回环
        status, raw, _ = http(server.base, "POST", "/api/backup", {})
        backup_info = json_body(raw) or {}
        backup_name = backup_info.get("file")
        backup_path = os.path.join(data_dir, backup_name or "")
        ok_backup = status == 200 and os.path.isfile(backup_path)
        if ok_backup:
            with open(backup_path, "rb") as f:
                backup_bytes = f.read()
            data["memos"][-1]["text"] = "恢复前被改"
            status, raw, _ = http(server.base, "GET", "/api/data")
            payload = json_body(raw)
            status, raw, _ = http(server.base, "POST", "/api/data",
                                  {"baseUpdatedAt": payload["updatedAt"], "data": data})
            status, raw, _ = http(server.base, "POST", "/api/restore", {"file": backup_name})
            restored = json_body(raw) or {}
            emergency = restored.get("emergencyBackup", "")
            status2, raw2, _ = http(server.base, "GET", "/api/data")
            final = json_body(raw2) or {}
            disk_ok = server.data_bytes() == backup_bytes
            expect("8 备份→改→恢复：磁盘与备份逐字节一致 + 应急备份",
                   status == 200 and disk_ok and bool(emergency)
                   and BACKUP_RE.match(emergency) is not None
                   and final.get("data", {}).get("memos", [{}])[-1].get("text") != "恢复前被改",
                   "emergency=%s" % emergency)
        else:
            expect("8 备份→改→恢复", False, "backup failed")

        # 9. 清空
        status, raw, _ = http(server.base, "POST", "/api/clear", {})
        cleared = json_body(raw) or {}
        current = server.data_json()
        empty_ok = all(current[key] == [] for key in TOP_KEYS if key != "workoutTemplates")
        empty_ok = empty_ok and len(current["workoutTemplates"]) == 7
        empty_ok = empty_ok and current["settings"]["welcomed"] is False
        auto = cleared.get("autoBackup", "")
        expect("9 清空：结构归零 + welcome 重置 + 自动备份",
               status == 200 and empty_ok and BACKUP_RE.match(auto) is not None
               and auto.startswith("backup-before-clear-"),
               "autoBackup=%s" % auto)

        # 10. 备份名正则
        names = [name for name in os.listdir(data_dir) if name.startswith("backup")]
        bad = [name for name in names if not BACKUP_RE.match(name)]
        expect("10 备份文件名全部符合正则", not bad, "bad=%s" % bad)

        # 11. 备份列表越界
        outside = os.path.join(temp_dir, "backup-20990101-0000.json")
        with open(outside, "w", encoding="utf-8") as f:
            f.write("{}")
        status, raw, _ = http(server.base, "GET", "/api/backups")
        listed = {item["file"] for item in (json_body(raw) or {}).get("backups", [])}
        expect("11 备份列表不含 data 目录外文件",
               "backup-20990101-0000.json" not in listed)
    finally:
        server.stop()
        shutil.rmtree(temp_dir, ignore_errors=True)

    failures = [item for item in CHECKS if not item[1]]
    print("-" * 56)
    print("check.py：%d/%d 通过" % (len(CHECKS) - len(failures), len(CHECKS)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
