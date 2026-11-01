# -*- coding: utf-8 -*-
"""
个人工作生活 App 本地小服务（仅 Python 标准库，兼容 3.8+）

职责：
- 托管 static/ 静态前端（所有响应 Cache-Control: no-store）
- 数据读写：data/app-data.json（原子写入）
- 备份 / 恢复 / 清空接口（见 docs/DEV-PLAN.md 第 3 章）
- 端口 8000 起自动探测，启动后自动打开浏览器

命令行参数：
--data-dir   指定数据目录（测试用，默认脚本同级 data/）
--port       起始端口（默认 8000）
--no-browser 不自动打开浏览器（测试用）
"""
import argparse
import copy
import json
import os
import re
import shutil
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "app-data.json")

CURRENT_VERSION = 1

TOP_KEYS = [
    "todos", "memos", "contents",
    "devProjects", "devTasks", "devLogs",
    "clients", "consultSessions",
    "workoutTemplates", "workoutLogs", "weightEntries",
    "mealLogs", "mealTemplates", "waterLogs",
    "games", "gameSessions",
]

DEFAULT_SETTINGS = {
    "theme": "light",
    "dayRolloverHour": 4,
    "waterGoal": 8,
    "hiddenModules": [],
    "welcomed": False,
}

_WEEK_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

_write_lock = threading.RLock()

# 运行期状态
STATE = {
    "data": None,
    "updatedAt": None,
    "corrupt": False,
    "corrupt_message": "",
    "port": 0,
}


def default_workout_templates():
    return [
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


def new_empty_data():
    """初始工厂函数：全部顶层键 + 7 条空模板 + 默认设置 + version=1"""
    data = {"version": CURRENT_VERSION}
    for key in TOP_KEYS:
        data[key] = []
    data["workoutTemplates"] = default_workout_templates()
    data["settings"] = copy.deepcopy(DEFAULT_SETTINGS)
    return data


def normalize_data(raw):
    """补齐缺失顶层键与 settings 字段；版本高于当前则抛 ValueError"""
    if not isinstance(raw, dict):
        raise ValueError("数据根节点必须是 JSON 对象")
    version = raw.get("version", CURRENT_VERSION)
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValueError("version 必须为整数")
    if version > CURRENT_VERSION:
        raise ValueError("数据版本 %d 高于当前支持版本 %d" % (version, CURRENT_VERSION))
    raw["version"] = CURRENT_VERSION
    for key in TOP_KEYS:
        if key not in raw or raw[key] is None:
            if key == "workoutTemplates":
                raw[key] = default_workout_templates()
            else:
                raw[key] = []
        if not isinstance(raw[key], list):
            raise ValueError("顶层键 %s 必须是数组" % key)
    settings = raw.get("settings")
    if not isinstance(settings, dict):
        settings = {}
        raw["settings"] = settings
    for key, value in DEFAULT_SETTINGS.items():
        if key not in settings:
            settings[key] = copy.deepcopy(value)
    if not isinstance(settings.get("hiddenModules"), list):
        settings["hiddenModules"] = []
    if settings.get("dayRolloverHour") not in (0, 4):
        settings["dayRolloverHour"] = 4
    try:
        goal = int(settings.get("waterGoal", 8))
    except Exception:
        goal = 8
    settings["waterGoal"] = goal if 1 <= goal <= 30 else 8
    if settings.get("theme") not in ("light", "dark"):
        settings["theme"] = "light"
    settings["welcomed"] = bool(settings.get("welcomed", False))
    if len(raw["workoutTemplates"]) == 0:
        raw["workoutTemplates"] = default_workout_templates()
    return raw


def validate_shape(payload):
    """返回 (code, message) 或 None"""
    if not isinstance(payload, dict):
        return ("INVALID_SHAPE", "请求体必须是 JSON 对象")
    if "version" not in payload:
        return ("INVALID_SHAPE", "缺少顶层键 version")
    version = payload["version"]
    if isinstance(version, bool) or not isinstance(version, int):
        return ("INVALID_SHAPE", "version 必须为整数")
    if version > CURRENT_VERSION:
        return ("INVALID_SHAPE", "数据版本 %d 高于当前支持版本 %d，已拒绝写入" % (version, CURRENT_VERSION))
    missing = [k for k in TOP_KEYS if k not in payload]
    if missing:
        return ("INVALID_SHAPE", "缺少顶层键：%s" % "、".join(missing))
    if not isinstance(payload.get("settings"), dict):
        return ("INVALID_SHAPE", "settings 必须是对象")
    for key in TOP_KEYS:
        if not isinstance(payload[key], list):
            return ("INVALID_SHAPE", "顶层键 %s 必须是数组" % key)
    return None


def now_iso():
    return datetime.now().isoformat(timespec="microseconds")


def ensure_data_file():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DATA_FILE):
        _write_disk(new_empty_data())


def _write_disk(data):
    """原子写入：tmp + os.replace"""
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with _write_lock:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, DATA_FILE)


def load_state():
    """加载磁盘数据到内存；损坏时保留原文件并标记 corrupt"""
    ensure_data_file()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        data = normalize_data(raw)
    except FileNotFoundError:
        data = new_empty_data()
        _write_disk(data)
    except Exception as exc:
        STATE["data"] = None
        STATE["updatedAt"] = now_iso()
        STATE["corrupt"] = True
        STATE["corrupt_message"] = str(exc)
        return
    STATE["data"] = data
    STATE["updatedAt"] = now_iso()
    STATE["corrupt"] = False
    STATE["corrupt_message"] = ""


def _flush_memory_to_disk():
    """把内存数据落盘（不改变 updatedAt）；无内存数据时返回 False"""
    data = STATE["data"]
    if data is None:
        return False
    _write_disk(data)
    return True


def _backup_filename(prefix):
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    name = "%s-%s.json" % (prefix, stamp)
    if not os.path.exists(os.path.join(DATA_DIR, name)):
        return name
    index = 2
    while True:
        candidate = "%s-%s-%d.json" % (prefix, stamp, index)
        if not os.path.exists(os.path.join(DATA_DIR, candidate)):
            return candidate
        index += 1


def make_backup(prefix="backup"):
    """把当前数据（先落盘内存）复制为 data 目录内的备份文件"""
    _flush_memory_to_disk()
    if not os.path.isfile(DATA_FILE):
        raise RuntimeError("数据文件不存在，无法备份")
    name = _backup_filename(prefix)
    shutil.copyfile(DATA_FILE, os.path.join(DATA_DIR, name))
    return name


def list_backup_files():
    backup_re = re.compile(r"^backup.*\.json$")
    result = []
    if not os.path.isdir(DATA_DIR):
        return result
    for name in os.listdir(DATA_DIR):
        if not backup_re.match(name):
            continue
        full = os.path.join(DATA_DIR, name)
        if not os.path.isfile(full):
            continue
        stat = os.stat(full)
        result.append({
            "file": name,
            "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            "size": stat.st_size,
        })
    result.sort(key=lambda item: item["file"], reverse=True)
    return result


def rel_data_dir():
    rel = os.path.relpath(DATA_DIR, BASE_DIR).replace(os.sep, "/")
    if rel in (".", "") or rel.startswith(".."):
        return DATA_DIR.replace(os.sep, "/") + "/"
    return rel + "/"


def rel_data_file():
    rel = os.path.relpath(DATA_FILE, BASE_DIR).replace(os.sep, "/")
    if rel.startswith(".."):
        return DATA_FILE.replace(os.sep, "/")
    return rel


class AppServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        # 浏览器关闭标签/刷新会主动断开连接，属正常现象，不打印堆栈
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeApp/1.0"
    protocol_version = "HTTP/1.1"

    # ---------- 基础工具 ----------
    def log_message(self, fmt, *args):
        try:
            sys.stdout.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))
            sys.stdout.flush()
        except Exception:
            pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        BaseHTTPRequestHandler.end_headers(self)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, code, message, extra=None):
        payload = {"ok": False, "error": {"code": code, "message": message}}
        if extra:
            payload.update(extra)
        self._send_json(payload, status)

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}, None
        try:
            return json.loads(raw.decode("utf-8")), None
        except Exception:
            return None, "INVALID_JSON"

    def _host_port(self):
        try:
            return int(self.server.server_address[1])
        except Exception:
            return STATE["port"]

    # ---------- 静态文件 ----------
    def _serve_static(self, path):
        if path in ("/", "", "/index.html"):
            rel = "index.html"
        elif path.startswith("/static/"):
            rel = path[len("/static/"):]
        else:
            self.send_error(404, "Not Found")
            return
        rel = unquote(rel)
        if rel.startswith("/") or ".." in rel.split("/"):
            self.send_error(404, "Not Found")
            return
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(os.path.normpath(STATIC_DIR)) or not os.path.isfile(full):
            self.send_error(404, "Not Found")
            return
        ext = os.path.splitext(full)[1].lower()
        mime = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".txt": "text/plain; charset=utf-8",
        }.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- 路由 ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json({
                "ok": True,
                "version": CURRENT_VERSION,
                "dataFile": rel_data_file(),
                "port": self._host_port(),
            })
            return
        if path == "/api/data":
            if STATE["corrupt"] or STATE["data"] is None:
                self._send_error_json(500, "DATA_CORRUPT", "数据文件损坏，已保留原文件：%s" % STATE["corrupt_message"])
                return
            self._send_json({"ok": True, "updatedAt": STATE["updatedAt"], "data": STATE["data"]})
            return
        if path == "/api/backups":
            try:
                self._send_json({"ok": True, "backups": list_backup_files()})
            except Exception as exc:
                self._send_error_json(500, "BACKUP_FAILED", "读取备份列表失败：%s" % exc)
            return
        if path.startswith("/api/"):
            self._send_error_json(404, "NOT_FOUND", "接口不存在")
            return
        self._serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/data":
            self._handle_write()
        elif path == "/api/backup":
            self._handle_backup()
        elif path == "/api/restore":
            self._handle_restore()
        elif path == "/api/clear":
            self._handle_clear()
        else:
            self._send_error_json(404, "NOT_FOUND", "接口不存在")

    # ---------- 写数据 ----------
    def _handle_write(self):
        body, parse_error = self._read_json_body()
        if parse_error or not isinstance(body, dict):
            self._send_error_json(400, "INVALID_JSON", "请求体不是合法 JSON")
            return
        data = body.get("data")
        problem = validate_shape(data)
        if problem:
            self._send_error_json(400, problem[0], problem[1])
            return
        if STATE["corrupt"] or STATE["data"] is None:
            self._send_error_json(500, "DATA_CORRUPT", "数据文件损坏，拒绝覆盖；请先从备份恢复")
            return
        base = body.get("baseUpdatedAt")
        if base is not None and base != STATE["updatedAt"]:
            self._send_error_json(409, "CONFLICT", "数据已被其他页面修改，请重新发送", {"serverUpdatedAt": STATE["updatedAt"]})
            return
        try:
            with _write_lock:
                _write_disk(data)
                STATE["data"] = normalize_data(data)
                STATE["updatedAt"] = now_iso()
        except Exception as exc:
            self._send_error_json(500, "WRITE_FAILED", "写入失败：%s" % exc)
            return
        self._send_json({"ok": True, "updatedAt": STATE["updatedAt"]})

    # ---------- 备份 ----------
    def _handle_backup(self):
        self._read_json_body()
        if STATE["corrupt"] or STATE["data"] is None:
            self._send_error_json(500, "DATA_CORRUPT", "数据文件损坏，无法备份")
            return
        try:
            name = make_backup("backup")
        except Exception as exc:
            self._send_error_json(500, "BACKUP_FAILED", "备份失败：%s" % exc)
            return
        self._send_json({"ok": True, "file": name, "dir": rel_data_dir()})

    # ---------- 恢复 ----------
    def _handle_restore(self):
        body, parse_error = self._read_json_body()
        if parse_error or not isinstance(body, dict):
            self._send_error_json(400, "INVALID_JSON", "请求体不是合法 JSON")
            return
        name = body.get("file")
        if not isinstance(name, str) or not name:
            self._send_error_json(400, "FILE_NOT_FOUND", "未指定备份文件")
            return
        if "/" in name or "\\" in name or ".." in name:
            self._send_error_json(400, "OUTSIDE_DATA_DIR", "只允许 data 目录内的备份文件")
            return
        full = os.path.abspath(os.path.join(DATA_DIR, name))
        if os.path.dirname(full) != os.path.abspath(DATA_DIR):
            self._send_error_json(400, "OUTSIDE_DATA_DIR", "只允许 data 目录内的备份文件")
            return
        if not re.match(r"^backup.*\.json$", name) or not os.path.isfile(full):
            self._send_error_json(400, "FILE_NOT_FOUND", "备份文件不存在")
            return
        try:
            with open(full, "r", encoding="utf-8") as f:
                content = json.load(f)
            problem = validate_shape(content)
            if problem:
                self._send_error_json(400, "INVALID_BACKUP", "备份文件结构不合法：%s" % problem[1])
                return
        except Exception as exc:
            self._send_error_json(400, "INVALID_BACKUP", "备份文件不是合法数据：%s" % exc)
            return
        try:
            with _write_lock:
                # 1) 先把服务端内存数据落盘，确保最近编辑不丢
                _flush_memory_to_disk()
                # 2) 基于落盘后的当前数据生成应急备份
                emergency = make_backup("backup-before-restore")
                # 3) 用备份内容原子覆盖
                restored = normalize_data(copy.deepcopy(content))
                _write_disk(restored)
                STATE["data"] = restored
                STATE["updatedAt"] = now_iso()
                STATE["corrupt"] = False
                STATE["corrupt_message"] = ""
        except Exception as exc:
            self._send_error_json(500, "RESTORE_FAILED", "恢复失败：%s" % exc)
            return
        self._send_json({"ok": True, "emergencyBackup": emergency})

    # ---------- 清空 ----------
    def _handle_clear(self):
        self._read_json_body()
        try:
            with _write_lock:
                _flush_memory_to_disk()
                auto_backup = make_backup("backup-before-clear")
                empty = new_empty_data()
                _write_disk(empty)
                STATE["data"] = empty
                STATE["updatedAt"] = now_iso()
                STATE["corrupt"] = False
                STATE["corrupt_message"] = ""
        except Exception as exc:
            self._send_error_json(500, "CLEAR_FAILED", "清空失败：%s" % exc)
            return
        self._send_json({"ok": True, "autoBackup": auto_backup})


def start_server(start_port=8000, attempts=20, host="127.0.0.1"):
    server = None
    port = None
    for candidate in range(start_port, start_port + attempts):
        try:
            server = AppServer((host, candidate), Handler)
            port = candidate
            break
        except OSError:
            print("端口 %d 被占用，尝试下一个端口..." % candidate, flush=True)
            continue
    if server is None:
        print("端口 %d-%d 全部被占用，请关闭部分程序后重试。" % (start_port, start_port + attempts - 1), flush=True)
        return None, None
    return server, port


def main():
    global DATA_DIR, DATA_FILE, STATIC_DIR
    parser = argparse.ArgumentParser(description="个人工作生活 App 本地服务")
    parser.add_argument("--data-dir", default=None, help="数据目录（默认脚本同级 data/）")
    parser.add_argument("--port", type=int, default=8000, help="起始端口（默认 8000）")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    args = parser.parse_args()

    if args.data_dir:
        DATA_DIR = args.data_dir if os.path.isabs(args.data_dir) else os.path.join(BASE_DIR, args.data_dir)
        DATA_FILE = os.path.join(DATA_DIR, "app-data.json")
    else:
        DATA_DIR = os.path.join(BASE_DIR, "data")
        DATA_FILE = os.path.join(DATA_DIR, "app-data.json")
    STATIC_DIR = os.path.join(BASE_DIR, "static")

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    os.makedirs(DATA_DIR, exist_ok=True)
    load_state()
    if STATE["corrupt"]:
        print("警告：数据文件损坏（%s）。原文件已保留，静态页面仍可打开，请从备份恢复。" % STATE["corrupt_message"], flush=True)

    server, port = start_server(args.port)
    if server is None:
        try:
            input("按回车退出...")
        except Exception:
            pass
        sys.exit(1)
    STATE["port"] = port
    url = "http://localhost:%d" % port
    print("=" * 56, flush=True)
    print("个人工作生活 App 已启动", flush=True)
    print("PORT=%d" % port, flush=True)
    print("APP_URL=%s" % url, flush=True)
    print("访问地址：%s" % url, flush=True)
    print("数据文件：%s" % rel_data_file(), flush=True)
    print("关闭本窗口即停止服务；数据已保存，不会丢失。", flush=True)
    print("=" * 56, flush=True)
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
