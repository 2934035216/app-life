# -*- coding: utf-8 -*-
"""测试公共设施：启动真实 server.py 子进程、HTTP 请求、临时数据目录。"""
import json
import os
import queue
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
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


def free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def initial_data():
    data = {"version": 1}
    for key in TOP_KEYS:
        data[key] = []
    data["workoutTemplates"] = [
        {
            "id": "wt-%d" % day,
            "dayOfWeek": day,
            "title": "",
            "isRestDay": False,
            "exercises": [],
            "createdAt": "",
            "updatedAt": "",
        }
        for day in range(1, 8)
    ]
    data["settings"] = {
        "theme": "light",
        "dayRolloverHour": 4,
        "waterGoal": 8,
        "hiddenModules": [],
        "welcomed": False,
    }
    return data


class ServerProcess:
    """启动 server.py；默认每次使用独立临时数据目录与空闲端口。"""

    def __init__(self, data_dir=None, start_port=None, no_browser=True, temp_root=None):
        self._owns_temp = temp_root is None and data_dir is None
        self.temp_root = temp_root or tempfile.mkdtemp(prefix="lifeapp-test-")
        self.data_dir = data_dir or os.path.join(self.temp_root, "data")
        self.start_port = start_port or free_port()
        self.no_browser = no_browser
        self.proc = None
        self.port = None
        self.lines = []
        self._queue = queue.Queue()
        self._reader = None

    @property
    def url(self):
        return "http://127.0.0.1:%d" % self.port

    @property
    def data_file(self):
        return os.path.join(self.data_dir, "app-data.json")

    def start(self, timeout=15):
        cmd = [
            sys.executable, SERVER_PATH,
            "--data-dir", self.data_dir,
            "--port", str(self.start_port),
        ]
        if self.no_browser:
            cmd.append("--no-browser")
        creationflags = 0
        if os.name == "nt":
            creationflags = 0x08000000  # CREATE_NO_WINDOW
        self.proc = subprocess.Popen(
            cmd,
            cwd=BASE_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=creationflags,
        )
        self._reader = threading.Thread(target=self._read_lines, daemon=True)
        self._reader.start()
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = self._queue.get(timeout=0.2)
            except queue.Empty:
                if self.proc.poll() is not None:
                    break
                continue
            self.lines.append(line)
            if line.startswith("PORT="):
                self.port = int(line.split("=", 1)[1].strip())
                break
        if self.port is None:
            self.stop()
            raise RuntimeError("服务未在 %s 秒内打印端口。输出：\n%s" % (timeout, "\n".join(self.lines)))
        # 继续收集启动横幅（APP_URL 等），最多 2 秒
        deadline = time.time() + 2
        while time.time() < deadline:
            try:
                line = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue
            self.lines.append(line)
            if line.startswith("关闭本窗口即停止服务"):
                break
        # 等 health 可用
        deadline = time.time() + 5
        last_error = None
        while time.time() < deadline:
            try:
                status, payload, _ = self.request("GET", "/api/health")
                if status == 200 and payload.get("ok"):
                    return self
            except Exception as exc:  # noqa: BLE001
                last_error = exc
            time.sleep(0.1)
        self.stop()
        raise RuntimeError("健康检查失败：%s" % last_error)

    def _read_lines(self):
        try:
            for line in self.proc.stdout:
                self._queue.put(line.rstrip("\r\n"))
        except Exception:
            pass

    def stop(self, timeout=5):
        if not self.proc:
            return
        try:
            self.proc.terminate()
            self.proc.wait(timeout=timeout)
        except Exception:
            try:
                self.proc.kill()
                self.proc.wait(timeout=timeout)
            except Exception:
                pass
        if self.proc.stdout:
            try:
                self.proc.stdout.close()
            except Exception:
                pass
        self.proc = None

    def cleanup(self):
        self.stop()
        if self._owns_temp and os.path.isdir(self.temp_root):
            shutil.rmtree(self.temp_root, ignore_errors=True)

    def request(self, method, path, body=None, timeout=10):
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        req = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                payload = json.loads(raw.decode("utf-8")) if raw else None
                return resp.status, payload, dict(resp.headers)
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                payload = json.loads(raw.decode("utf-8")) if raw else None
            except Exception:
                payload = None
            return err.code, payload, dict(err.headers)

    def get_raw(self, path, timeout=10):
        req = urllib.request.Request(self.url + path)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read(), dict(resp.headers)
        except urllib.error.HTTPError as err:
            return err.code, err.read(), dict(err.headers)

    # ---------- 数据辅助 ----------
    def get_data(self):
        status, payload, headers = self.request("GET", "/api/data")
        return status, payload

    def post_data(self, data, base=None):
        status, payload, _ = self.request("POST", "/api/data", {"baseUpdatedAt": base, "data": data})
        return status, payload

    def backup(self):
        status, payload, _ = self.request("POST", "/api/backup", {})
        return status, payload

    def list_backups(self):
        status, payload, _ = self.request("GET", "/api/backups")
        return status, payload

    def restore(self, file_name):
        status, payload, _ = self.request("POST", "/api/restore", {"file": file_name})
        return status, payload

    def clear(self):
        status, payload, _ = self.request("POST", "/api/clear", {})
        return status, payload

    def read_file_json(self):
        with open(self.data_file, "r", encoding="utf-8") as f:
            return json.load(f)

    def read_file_bytes(self):
        with open(self.data_file, "rb") as f:
            return f.read()

    def write_file_text(self, text):
        with open(self.data_file, "w", encoding="utf-8") as f:
            f.write(text)

    def write_file_json(self, data):
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)


def snapshot_data(server):
    status, payload = server.get_data()
    assert status == 200, payload
    return payload["data"], payload["updatedAt"]


def make_data_with_memo(text="测试备忘"):
    data = initial_data()
    data["memos"].append({
        "id": "memo-1",
        "text": text,
        "convertedToTodo": False,
        "todoId": None,
        "createdAt": "2026-11-01T09:00:00",
        "updatedAt": "2026-11-01T09:00:00",
    })
    return data


def node_test(relative_path, timeout=120):
    """在项目根目录运行一个 Node 测试文件，返回 (returncode, output)。"""
    proc = subprocess.run(
        ["node", "--test", os.path.join(BASE_DIR, relative_path)],
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    return proc.returncode, proc.stdout
