# 个人工作生活 App v1 开发计划（DEV-PLAN）

> 唯一需求依据：PRD.md（FR-1~FR-52、AC-1~AC-51、第 0 节已确认口径）。
> 本文档自包含：从头读到尾即可开工，不需要翻查其他文件。曾标注的 7 处需求缺口（W1~W7）已按第 10 章的默认值落入正文。
> 文档结构：目标与形态 → 数据模型 → 接口契约 → 前端结构 → 关键机制 → 分阶段实施 → 依赖 → 验收 → 风险 → 待确认项。

---

## 1. 目标、技术形态与目录结构

**一句话目标**：做一个本机运行的"工作生活总控台"——双击启动脚本 → 本地 Python 服务 → 浏览器打开 App，把自媒体、开发、咨询、健身、饮食、游戏六个领域的"今天要做什么、做了什么"收进一个页面，全部数据存单个 JSON 文件。

**技术形态**（已锁定，不再讨论）：
- 后端：Python 标准库 `http.server`，单文件 `server.py`，不装任何 pip 依赖。
- 前端：无构建静态站点，原生 ES Module，不引框架；唯一图表（体重折线）用内联 SVG 手绘。
- 存储：单文件 `data/app-data.json`，整文档读写；前端防抖 300ms（长文本 1s）整体 POST 落盘，服务端写 `.tmp` 后原子重命名。
- 运行：双击 `启动.bat` → 端口从 8000 起自动探测 → 自动打开浏览器。

**完整目录结构**（每个文件一行职责）：

```
APP/
├── 启动.bat                      # 双击入口：chcp 65001 + python server.py + pause
├── server.py                     # 唯一后端：静态托管、数据读写、备份/恢复/清空接口、端口探测、打开浏览器、数据初始化与迁移
├── data/
│   └── app-data.json             # 唯一数据文件，首次启动自动创建；备份文件同目录
└── static/
    ├── index.html                # 唯一 HTML 入口：导航容器 + #view 挂载点 + 四个全局组件挂载点
    ├── css/
    │   ├── base.css              # 重置、字体、CSS 变量（深/浅两套主题变量全在这里）
    │   ├── layout.css            # 左侧导航布局、页面容器、看板列宽、<720px 抽屉化媒体查询
    │   └── components.css        # 侧滑面板、确认框、撤销条、横幅、卡片、页签、空状态样式
    └── js/
        ├── main.js               # 启动流程：拉数据 → 渲染导航 → hash 路由分发 → N 快捷键监听
        ├── api.js                # 7 个接口的 fetch 封装（health/data/backup/backups/restore/clear + 静态）
        ├── store.js              # 全量数据唯一持有者；mutate() 修改入口；双档防抖落盘；保存状态回调；失败退避重试；sendBeacon 兜底
        ├── utils.js              # today()（翻篇判定唯一入口）、addDays、fmtDate、weekStart(周一)、uid、debounce
        ├── todoEngine.js         # 今日事项派生引擎：三源扫描 + manual 合并 + 勾选/日终顺延写回
        ├── ui/
        │   ├── panel.js          # 右侧侧滑面板（40%/50% 两档宽，遮罩/Esc 关闭，禁止嵌套）
        │   ├── dialog.js         # 确认框，支持危险样式与"输入指定文字才能确认"模式
        │   ├── undo.js           # 底部 5 秒撤销条，超时执行真正提交
        │   └── toast.js          # 顶部红色错误横幅与普通成功提示
        └── views/
            ├── home.js           # 首页：今日事项区、快速备忘区、六张速览卡
            ├── today.js          # 今日计划页：日期翻页、三段清单、行内创建、日终整理
            ├── selfmedia.js      # 自媒体：四列看板 + 列表视图 + 全屏写稿页路由
            ├── dev.js            # 开发工作：项目列表 + 任务/日志双页签
            ├── consult.js        # 咨询工作：客户网格/列表 + 50% 详情面板时间线
            ├── fitness.js        # 健身计划：本周模板/打卡记录/体重三页签 + SVG 折线
            ├── diet.js           # 饮食计划：按天五区块 + 餐食模板管理
            ├── game.js           # 游戏娱乐：三状态页签 + 时长打卡
            └── settings.js       # 数据与设置：备份恢复/外观/模块开关/偏好四区块
```

---

## 2. 数据模型（data/app-data.json）

### 2.0 通用约定

- 所有实体含三个公共字段：`id`（string，前端 `uid()`）、`createdAt`、`updatedAt`（ISO 本地时间字符串），下文各表不再重复列出。
- 日期字段一律 `"YYYY-MM-DD"`；日期时间用 `"YYYY-MM-DDTHH:MM"`（本机时间，无时区概念）。
- 数组与对象字段不允许 `null`，空值用 `[]` / `""` / `0`；可空日期用 `null`。
- 顶层结构固定如下，启动时缺键自动补齐（见 2.10）：

```json
{
  "version": 1,
  "todos": [], "memos": [],
  "contents": [],
  "devProjects": [], "devTasks": [], "devLogs": [],
  "clients": [], "consultSessions": [],
  "workoutTemplates": [], "workoutLogs": [], "weightEntries": [],
  "mealLogs": [], "mealTemplates": [], "waterLogs": [],
  "games": [], "gameSessions": [],
  "settings": {}
}
```

### 2.1 TodoItem（todos）——只存 manual 临时事项

> 自媒体/开发/咨询产生的今日事项**不落盘**，由 todoEngine 查询时派生（见 5.2），这里只存手动添加的临时事项（含备忘转来的）。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| title | string | 是 | — | 唯一硬性校验：非空 |
| source | string | 是 | `"manual"` | 固定 manual |
| sourceId | string\|null | 是 | `null` | manual 恒为 null |
| planDate | date | 是 | 今天 | 日终顺延改此字段 |
| timeSlot | string | 是 | `"afternoon"` | morning / afternoon / evening |
| priority | string | 是 | `"normal"` | high / normal |
| done | bool | 是 | `false` | |
| doneAt | string\|null | 是 | `null` | 勾选时写入，取消清空 |

### 2.2 Memo（memos）——快速备忘

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| text | string | 是 | — | 纯文本 |
| convertedToTodo | bool | 是 | `false` | 转待办后列表里标"已转" |
| todoId | string\|null | 是 | `null` | 指向生成的 TodoItem.id |

### 2.3 ContentItem（contents）——自媒体内容

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| title | string | 是 | — | |
| platforms | string[] | 是 | `[]` | 多选，取值集合在前端常量（如 bilibili/wechat/xhs） |
| status | string | 是 | `"idea"` | idea / writing / scheduled / published |
| outline | string | 是 | `""` | 长文本，全屏写稿页左栏 |
| body | string | 是 | `""` | 长文本，全屏写稿页右栏 |
| scheduledDate | date\|null | 是 | `null` | status=scheduled 时前端约束必填；=今天且未完成 → 派生今日事项 |
| publishedDate | date\|null | 是 | `null` | 转入已发布时写入 |
| link | string | 是 | `""` | **允许为空**（PRD 口径 8），可后补 |
| metrics | object | 是 | 见右 | `{views:0, likes:0, comments:0, metricsUpdatedAt:null}`，数字为 int≥0 |

### 2.4 开发工作三实体

**DevProject（devProjects）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| name | string | 是 | — | |
| intro | string | 是 | `""` | |
| status | string | 是 | `"active"` | active / paused / done；done 收列表底部 |

**DevTask（devTasks）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| projectId | string | 是 | — | → DevProject.id；删项目级联删除 |
| title | string | 是 | — | |
| note | string | 是 | `""` | |
| dueDate | date\|null | 是 | `null` | =今天且未完成 → 派生今日事项 |
| priority | string | 是 | `"normal"` | high / normal |
| done | bool | 是 | `false` | |
| order | int | 是 | 末尾序号 | 拖拽排序维护，同项目内升序展示 |

**DevLog（devLogs）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| projectId | string | 是 | — | → DevProject.id；级联删除 |
| date | date | 是 | 今天 | **唯一约束 (projectId, date)**：重复创建=更新已有 |
| content | string | 是 | `""` | 今天做了什么 |
| blocker | string | 是 | `""` | 卡点，可空 |

### 2.5 咨询工作两实体

**Client（clients）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| name | string | 是 | — | |
| contact | string | 是 | `""` | |
| source | string | 是 | `""` | 客户来源 |
| requirement | string | 是 | `""` | 需求描述 |
| status | string | 是 | `"following"` | following / deal / paused |
| nextFollowupDate | date\|null | 是 | `null` | 只能由最新咨询记录同步，界面不提供直接编辑 |

**ConsultSession（consultSessions）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| clientId | string | 是 | — | → Client.id；级联删除 |
| datetime | string | 是 | 当前时间 | `"YYYY-MM-DDTHH:MM"` |
| topic | string | 是 | `""` | 议题 |
| conclusion | string | 是 | `""` | 结论 |
| nextStep | string | 是 | `""` | 下一步行动 |
| nextFollowupDate | date\|null | 是 | `null` | 保存后最新一条的该值同步到 Client |

### 2.6 健身三实体

**WorkoutTemplate（workoutTemplates）——固定 7 条，初始化生成 dayOfWeek=1..7**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| dayOfWeek | int | 是 | — | 1=周一 … 7=周日 |
| title | string | 是 | `""` | 训练名，如"胸+三头" |
| isRestDay | bool | 是 | `false` | 休息日标记 |
| exercises | object[] | 是 | `[]` | 元素 `{name:"", sets:3, reps:10, durationMinutes:null}`，reps 与 durationMinutes 二选一 |

**WorkoutLog（workoutLogs）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| date | date | 是 | 今天 | 可改补记；**同一天至多一条**（W7 默认值），重复打卡=编辑已有 |
| title | string | 是 | `""` | 从模板带出的训练名 |
| skipped | bool | 是 | `false` | "没练"标记；首页摘要判定时见 5.2 |
| exercises | object[] | 是 | `[]` | 元素 `{name, sets:[{weight:0, reps:0}], durationMinutes:null}`；sets 为空且 durationMinutes 有值=计时类动作 |

**WeightEntry（weightEntries）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| date | date | 是 | 今天 | **唯一**，同日重复录入=覆盖（取最后一次） |
| weight | number | 是 | — | kg，保留 1 位小数 |

### 2.7 饮食三实体

| 实体 | 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| MealLog（mealLogs） | date | date | 是 | 今天 | 同一 (date, mealType) 只有一条记录 |
| | mealType | string | 是 | — | breakfast / lunch / dinner / snack |
| | items | string[] | 是 | `[]` | 回车加菜=push 一条文本 |
| MealTemplate（mealTemplates） | name | string | 是 | — | 如"减脂午餐A" |
| | items | string[] | 是 | `[]` | |
| WaterLog（waterLogs） | date | date | 是 | 今天 | **唯一** |
| | cups | int | 是 | `0` | 上限=settings.waterGoal，前端约束 |

### 2.8 游戏两实体

**Game（games）**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| name | string | 是 | — | |
| status | string | 是 | `"wishlist"` | playing / wishlist / finished；新建默认 wishlist |
| progress | string | 是 | `""` | 进度备注，如"第三章" |
| finishedDate | date\|null | 是 | `null` | 转已通关时引导填，默认今天 |
| review | string | 是 | `""` | 一句话评价，可空 |
| totalMinutes | int | 是 | `0` | **冗余字段**=该游戏所有 GameSession.minutes 之和，增删改 session 后全量重算 |

**GameSession（gameSessions）**：`gameId`（string，必填，级联删除）、`date`（date，必填，可补记）、`minutes`（int>0，必填）。

### 2.9 Settings（settings，单对象）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| theme | string | `"light"` | light / dark，仅两档 |
| dayRolloverHour | int | `4` | 翻篇时间，仅 0 或 4 |
| waterGoal | int | `8` | 每天喝水目标杯数 |
| hiddenModules | string[] | `[]` | selfmedia/dev/consult/fitness/diet/game/today 任意子集 |
| welcomed | bool | `false` | false → 启动显示欢迎引导 |

### 2.10 实体关系、级联与迁移策略

```
DevProject 1──n DevTask、DevLog       删项目级联（确认文案"其下任务与日志一并删除"）
Client     1──n ConsultSession         删客户级联（确认文案带记录数 N）
Game       1──n GameSession            删游戏级联
Memo       0..1→ TodoItem              转待办建立 todoId，备忘保留并标"已转"
派生 TodoItem ─→ ContentItem/DevTask/Client  查询时生成不落盘，源删则事项消失（天然级联）
Client.nextFollowupDate ← 最新 ConsultSession.nextFollowupDate；
   删除最新记录后回退到次新记录的值，无则置 null（W5 默认值）
```

**version 与迁移**：
- 当前 `version=1`。加载时：无 version 或 <1 → 用初始工厂函数默认值补齐缺失顶层键与 settings 字段后视为 v1；>1 → 拒绝写操作并向前端报错（防止新文件被旧版本覆盖）。
- 未来结构变更：version +1，server.py 登记 `MIGRATIONS = {1: migrate_1_to_2, ...}`，加载时按版本链式执行；备份文件同结构同规则。
- 字段演进只允许"新增带默认值"或"废弃保留"，禁止改名复用旧字段，保证旧备份可恢复。

---

## 3. 接口契约（server.py）

### 3.0 通用约定

- 全部接口 `Content-Type: application/json; charset=utf-8`；静态资源一律带 `Cache-Control: no-store`。
- 成功响应含 `"ok": true`；错误响应统一 `{"ok": false, "error": {"code": "错误码", "message": "人类可读信息"}}`。
- **写指纹**：服务端每次成功写盘生成新 `updatedAt`（ISO 本地时间）并随响应返回；客户端写请求回传 `baseUpdatedAt`，不一致返回 409（单用户场景按"后写为准"，前端重发并提示，见 5.4）。
- 服务端所有写操作共用一把 `threading.Lock`；写盘流程固定：写 `app-data.json.tmp` → `os.replace(tmp, 正式文件)`。

### 3.1 接口一览

| # | 路径 | 方法 | 请求体 | 成功响应（200） | 状态码与错误码 |
|---|---|---|---|---|---|
| 1 | /api/health | GET | — | `{"ok":true,"version":1,"dataFile":"data/app-data.json","port":8001}` | — |
| 2 | /api/data | GET | — | `{"ok":true,"updatedAt":"...","data":{全量数据}}` | 500 `DATA_CORRUPT`（文件非法 JSON，**不覆盖原文件**） |
| 3 | /api/data | POST | `{"baseUpdatedAt":"...","data":{全量数据}}` | `{"ok":true,"updatedAt":"新值"}` | 400 `INVALID_JSON`；400 `INVALID_SHAPE`（缺顶层键或 version 非整数）；409 `CONFLICT`（带 serverUpdatedAt）；500 `WRITE_FAILED` |
| 4 | /api/backup | POST | `{}` | `{"ok":true,"file":"backup-YYYYMMDD-HHmm.json","dir":"data/"}` | 500 `BACKUP_FAILED` |
| 5 | /api/backups | GET | — | `{"ok":true,"backups":[{"file":"...","mtime":"...","size":字节}]}`，仅 data 目录内 `backup*.json`，按文件名时间倒序 | — |
| 6 | /api/restore | POST | `{"file":"backup-xxx.json"}` | `{"ok":true,"emergencyBackup":"backup-before-restore-YYYYMMDD-HHmm.json"}` | 400 `FILE_NOT_FOUND`；400 `OUTSIDE_DATA_DIR`；400 `INVALID_BACKUP`；500 `RESTORE_FAILED` |
| 7 | /api/clear | POST | `{}` | `{"ok":true,"autoBackup":"backup-before-clear-YYYYMMDD-HHmm.json"}` | 500 `CLEAR_FAILED` |
| 8 | / 与 /static/* | GET | — | index.html / 静态文件 | 404 |

### 3.2 顺序要求（不可换序）

**/api/restore**：
1. 解析 `file` 的绝对路径，父目录必须等于 data 目录绝对路径（拒绝 `../` 与路径穿越）；
2. 校验文件名匹配 `backup*.json`、内容为合法 JSON 且含整数 version；
3. 把**服务端当前内存数据先落盘**，再复制为 `backup-before-restore-YYYYMMDD-HHmm.json`（同名追加 `-2`）——必须是内存数据落盘后的副本，不是磁盘旧文件的复制，否则最近一个防抖窗口内的编辑丢失；
4. 用备份内容原子替换 app-data.json，更新内存数据与 updatedAt；
5. 返回成功；前端提示"恢复完成，请刷新页面"，用户确认后 `location.reload()`。恢复全程**不出现撤销条**（PRD 口径：唯一不可撤销操作）。

**/api/clear**：自动备份为 `backup-before-clear-*.json` → 用初始工厂函数结构原子覆盖 → settings.welcomed 重置为 false → 返回。

**备份文件名**：`backup-` + 本机时间 `YYYYMMDD-HHmm` + `.json`；同一分钟已存在则依次追加 `-2`、`-3`。

---

## 4. 前端结构

### 4.1 index.html 骨架

```html
<body data-theme="light">
  <aside id="nav"></aside>        <!-- 四组九项导航 -->
  <main id="view"></main>         <!-- 路由视图挂载点 -->
  <div id="panel-root"></div>     <!-- 侧滑面板挂载点，全局唯一 -->
  <div id="dialog-root"></div>    <!-- 确认框 -->
  <div id="undo-root"></div>      <!-- 底部撤销条 -->
  <div id="toast-root"></div>     <!-- 顶部横幅 -->
  <script type="module" src="/static/js/main.js"></script>
</body>
```

### 4.2 公共组件清单

| 组件 | 文件 | 统一行为 | 使用方 |
|---|---|---|---|
| Panel 侧滑面板 | ui/panel.js | `open({width,title,content})`，宽 40%（咨询 50%），遮罩/Esc/关闭按钮收起，`isOpen()` 时拒绝再开 | 除全屏写稿、开发日志行内编辑、今日计划行内创建外的全部新建/编辑 |
| Dialog 确认框 | ui/dialog.js | `confirm({title,body,danger,requireText})`；requireText 模式下不输入指定文字确认键禁用 | 所有删除、日终整理、发布确认、通关引导、恢复/清空 |
| UndoBar 撤销条 | ui/undo.js | `show(5s,{label,onCommit,onUndo})`，超时 onCommit，点撤销 onUndo | 所有删除 + 日终顺延 |
| Toast 横幅 | ui/toast.js | 失败：顶部红色"保存失败，请重试或检查数据文件"；成功：普通提示 | 保存失败、备份/恢复结果 |
| Toolbar 工具栏 | 各 view 共用 class | 左搜索（输入即过滤）右筛选 | 自媒体、咨询等列表页 |
| EmptyState 空状态 | 各 view 共用函数 | 一句引导文案 + 新建按钮，无插画 | 所有空列表 |
| OverviewCard 速览卡 | views/home.js 内部 | 卡头（图标+名称+"›"）/摘要区/快捷入口区三层；卡片整体不响应点击 | 首页六卡 |

### 4.3 路由与快捷入口参数约定

| 路由 | 视图 | 查询参数 |
|---|---|---|
| #/home | home.js | — |
| #/today | today.js | `?date=YYYY-MM-DD`（默认今天） |
| #/selfmedia | selfmedia.js | `?new=1`（开新建选题面板）、`?open=:id`（开该卡详情） |
| #/selfmedia/write/:id | selfmedia.js 全屏写稿 | — |
| #/dev | dev.js | `?log=1`（展开当天日志输入框） |
| #/consult | consult.js | `?new=1`、`?open=:id&compose=1`（开客户面板并展开记录表单） |
| #/fitness | fitness.js | `?tab=plan\|logs\|weight`、`?checkin=1`、`?focus=weight` |
| #/diet | diet.js | `?focus=nextmeal` |
| #/game | game.js | `?checkin=1`（打开第一个在玩游戏的打卡表单） |
| #/settings | settings.js | — |

### 4.4 各页面区块与字段绑定

> 保存时机三档：**失焦**=300ms 防抖落盘；**停顿 1s**=长文本防抖；**变更即存**=select/checkbox/date 的 change 立即标脏。

**首页（home.js）**：三区块——今日事项区（勾选框+来源标签+标题，勾选收起进底部已完成折叠区）、快速备忘区（常驻输入框回车存 Memo，列表仅最近 10 条，每条「转待办」「删除」两按钮）、六张速览卡（取数口径见 5.2；「喝水 +1」直接写 WaterLog 不跳页，其余入口按 4.3 路由参数跳转）。

**今日计划（today.js）**：日期头（左右箭头翻页，早于今天整页只读）→ 早/白/晚三段（每段底部"+ 加一条"行内创建，标题必填，可设 timeSlot/priority）→ 底部已完成折叠区 +「日终整理」按钮。manual 事项有删除按钮；派生事项无删除入口。

**自媒体（selfmedia.js）**

| 区域 | 字段 → 控件 → 数据路径 → 保存时机 |
|---|---|
| 看板卡 | title/platforms/status（列）/scheduledDate/publishedDate+metrics 摘要，只读展示；HTML5 拖拽换列即改 `contents[i].status` |
| 详情面板 | title→text→`.title`→失焦；platforms→多选 chip→`.platforms`→变更即存；status→下拉→`.status`→变更即存（选 published 改走发布确认弹窗）；scheduledDate→date→变更即存；link→text→失焦（允许空） |
| 全屏写稿页 | outline→左 textarea→`.outline`→停顿 1s；body→右 textarea→`.body`→停顿 1s |
| 数据回填区 | views/likes/comments→number→`.metrics.*`→失焦，同时写 `.metrics.metricsUpdatedAt` |

**开发工作（dev.js）**

| 区域 | 字段绑定 |
|---|---|
| 项目列表（左栏） | name 只读 + 进度条（done 任务数/总数实时计算）；顶部"+ 新建项目" |
| 项目面板 | name→text（必填）、intro→textarea（1s）、status→下拉（active/paused/done） |
| 任务行（列表内直接编辑） | done→checkbox；title→text；dueDate→date；priority→下拉；note→面板 textarea；拖拽把手→改 `order`；已完成默认折叠 |
| 日志页签 | "记一笔今天"输入框回车建当天 DevLog；已有日志**行内展开编辑**（W3 默认值，不走面板）：content/blocker→textarea→停顿 1s |

**咨询工作（consult.js）**

| 区域 | 字段绑定 |
|---|---|
| 客户卡（网格/列表可切换） | name/requirement/nextFollowupDate（到期当天或 ≤3 天高亮橙框）/最近咨询日期，只读；顶部搜索（名称/需求模糊）+状态筛选 |
| 详情面板（50%） | name→text、contact→text、source→text、requirement→textarea（1s）、status→下拉；nextFollowupDate 只读展示（只由咨询记录同步） |
| 记一次咨询表单（面板内顶部展开） | datetime→datetime-local（默认当前）、topic/conclusion/nextStep→textarea（1s）、nextFollowupDate→date（可空）；保存插到时间线最上并同步 Client |

**健身计划（fitness.js）**

| 页签 | 字段绑定 |
|---|---|
| 本周计划 | 7 格：title→text、isRestDay→checkbox、exercises 动作行（name/sets/reps 或 durationMinutes）→失焦保存；改模板不回写历史 WorkoutLog；清空格子直接保存不弹确认 |
| 打卡记录 | "今天打卡"按 dayOfWeek 从模板复制初始 WorkoutLog；date→date（可改补记）、skipped→checkbox、每动作 sets 数组（weight/reps 数字行）或 durationMinutes、临时加动作按钮；列表倒序，删除走撤销条 |
| 体重 | 今日输入框（number，同日覆盖）；历史列表行内改值；下方 SVG 30 天折线只读 |

**饮食计划（diet.js）**：日期头 date→切换重渲染（默认今天可补记）；早/午/晚/加餐四区块各一个"回车加条目"输入框（push 到 `mealLogs[(date,mealType)].items`）+「从模板填入」按钮（弹模板列表整套填入）；每条目「存为模板」按钮；右上角模板管理（改名/删除走撤销条）；喝水区杯子排数量=waterGoal，点第 N 杯设 `waterLogs[date].cups=N`，再点第 N 杯取消为 N-1。

**游戏娱乐（game.js）**：在玩/想玩/已通关三页签；卡片显示 name、totalMinutes、progress，在玩卡另显本周时长；卡片「打卡」→弹表单（minutes→number、date→date 默认今天可改补记）；详情面板：name/progress→text、status→下拉（选 finished 时弹引导表单填 finishedDate 默认今天/review 可空）；删除确认+撤销，时长明细级联。

**设置（settings.js）**：四区块——备份与恢复（导出备份/从备份恢复/清空数据，各接第 3 章接口流程）；外观（theme 单选两档即时生效）；模块显示开关（七个 checkbox，首页与设置不可隐藏，附提示"隐藏期间数据仍在，重新开启即恢复"）；偏好（dayRolloverHour 单选 0/4、waterGoal number 1~30）。

### 4.5 状态流转

**通用实体生命周期**：

```
新建（面板空表单，首个必填字段失焦后才真正创建落盘）
 → 编辑（自动保存循环，面板显示"已保存 HH:MM"）
 → 删除（确认框写明对象与级联 → 挂起 5s〔撤销条〕→ 撤销：恢复原位 / 超时：真正移除并落盘）
```

**勾选完成流转**：未勾选 → 勾选（写回 done/源字段，doneAt=now，动画收起到已完成区）→ 当天取消勾选（反向写回，回到原分组）。派生事项反向写回规则见 5.2（W1 默认值）。

**自媒体状态机**：`idea → writing → scheduled → published`；看板拖拽与面板下拉共用同一入口；进 published 必经确认弹窗（发布日期默认今天、链接可空）；published 允许经面板回退，metrics/publishedDate 保留。

**客户跟进提醒生命周期**：记录写入 nextFollowupDate →（前 3 天）进首页摘要卡 →（到期当天）派生今日事项 → 首页勾选 → Client.nextFollowupDate 清空，提醒消失，**不产生咨询记录**（闭环需手动补记录，PRD 口径 9）。

---

## 5. 关键机制实现

### 5.1 凌晨翻篇判定（FR-7，utils.today）

```text
function today(settings):
  now = new Date()                                  // 全 App 唯一允许取当前时间的入口
  d = datePart(now)
  if timePart(now) < settings.dayRolloverHour:00:   // 如 03:59 < 04:00
      d = d - 1 day                                 // 归"昨天"
  return d                                          // "YYYY-MM-DD"
```

所有"今天/明天/昨天/本周一/最近 30 天"一律由 `today()` 返回值加减天数得到；视图代码禁止直接 `new Date()` 取日期（验收时用 grep 守护，见第 8 章）。

### 5.2 跨模块汇总与勾选写回（todoEngine，FR-9/16/24/29/33）

**派生规则**（查询时计算，不落盘；隐藏模块跳过）：

```text
function getTodosFor(date, data):
  result = []
  if "selfmedia" not in hiddenModules:
    for c in contents where c.status=="scheduled" and c.scheduledDate==date:
      派生(source:"selfmedia", sourceId:c.id, title:"发布：《"+c.title+"》",
           timeSlot:"afternoon", priority:"normal")     // W2 默认值：派生事项一律白天段
  if "dev" not in hiddenModules:
    for t in devTasks where t.dueDate==date and not t.done:
      p = findProject(t.projectId)
      派生(source:"dev", sourceId:t.id, title:"开发："+p.name+" - "+t.title, priority:t.priority)
  if "consult" not in hiddenModules:
    for cl in clients where cl.nextFollowupDate==date:
      派生(source:"consult", sourceId:cl.id, title:"跟进客户："+cl.name)
  result += todos where planDate==date                  // manual 实体
  按 timeSlot(morning→afternoon→evening) 分组，组内 priority(high 先) → createdAt 升序
```

派生事项 uid 约定 `src:{source}:{sourceId}`，供渲染 key 与勾选定位。

**勾选写回映射**（toggleTodo；含 W1 默认值的反向规则）：

| source | 勾选为完成 | 取消勾选（W1 默认值） |
|---|---|---|
| manual | `todos[i].done=true, doneAt=now` | `done=false, doneAt=null` |
| dev | `devTasks[i].done=true` | `done=false` |
| selfmedia | `status→"published"`、`publishedDate=today()`、link 保持原值（可空） | 退回 `status="scheduled"`，**保留** link 与 publishedDate |
| consult | `clients[i].nextFollowupDate=null`（只清提醒，不建咨询记录） | 恢复 `nextFollowupDate=today()` |

**摘要卡取数口径**（FR-12，全部以 today() 为基准）：
- 自媒体：scheduledDate=今天且 status=scheduled → "未发"；publishedDate=今天 → "已发"；否则"今天无发布计划"。
- 开发：存在 date=今天的 DevLog → "已写"，否则"未写"。
- 咨询：nextFollowupDate ∈ [今天, 今天+3 天] 的 clients 计数 + 最近一个客户名；无则"暂无待跟进"。
- 健身：存在 date=今天且 skipped=false 的 WorkoutLog → "已练"+训练名；否则"未练"。
- 饮食：当天四类 mealType 中 items 非空的种数 N + `waterLogs[今天].cups` → "已记 N 餐 · 喝水 M/目标 杯"。
- 游戏：date ∈ [本周一, 今天] 的 GameSession.minutes 求和 ÷60 保留 1 位小数 → "本周已玩 X 小时"。

### 5.3 删除与 5 秒挂起撤销（FR-4）

```text
confirmDelete(item, cascadeText):
  dialog.confirm(文案含对象名与级联影响)
  onConfirm:
    item._pendingDelete = true          // 内存标记，"_"开头字段序列化时剔除
    render()                            // 视图过滤 _pendingDelete 项，条目立即消失
    undo.show(5s,
      onCommit: 从数组真正移除 item（含级联子实体）→ store.save(),
      onUndo:   delete item._pendingDelete → render())
```

要点：挂起期间不落盘，撤销=取消标记，级联子树天然完整恢复；5 秒内页面/服务重启=删除未发生（安全方向）；恢复备份不走此机制（唯一不可撤销操作，AC-51）。

**日终顺延撤销**（FR-17，W6 默认值）：点「日终整理」→ 确认框"还有 N 条未完成，顺延到明天？"→ 确认前对**全部受影响条目**做日期字段快照（manual 的 planDate + 派生源字段 scheduledDate/dueDate/nextFollowupDate）→ 批量改为明天 → 撤销条 5 秒内按快照全部还原。仅手动触发，无任何自动顺延定时器。

### 5.4 防抖自动保存与失败回退（store.js，FR-3/FR-6）

```text
store.mutate(fn, opts): fn(data) → dirty=true → scheduleSave(opts.long ? 1000ms : 300ms)
flush(): POST /api/data {baseUpdatedAt, data}
  成功 → savedAt=now → 回调面板显示"已保存 HH:MM" → dirty=false
  失败(网络错/500) → toast 红横幅"保存失败，请重试或检查数据文件"
       → 退避重试 2s/5s/10s → 保持 dirty，表单内容不动（FR-6）
  409 CONFLICT → 后写为准：取响应里 serverUpdatedAt 重发一次；仍失败则横幅提示
beforeunload → navigator.sendBeacon("/api/data", 当前脏数据)   // 关闭兜底
```

长文本判定：textarea（大纲/正文/日志/需求描述/备忘）输入事件带 `long:true`；其余控件一律 300ms。

### 5.5 端口探测与切换（server.py，FR-45）

```text
for port in 8000..8019:
    try: HTTPServer(("127.0.0.1", port), Handler) → 成功则 break
    except OSError (errno 10048/98/13): 打印"端口 {port} 被占用，尝试下一个" → continue
全部失败 → 终端报错退出
打印 "已在 http://localhost:{port} 启动，数据文件：data/app-data.json"
threading.Timer(0.5, webbrowser.open(url)).start()   // 等服务就绪再开浏览器
```

### 5.6 备份命名与恢复前应急备份

见 3.1 与 3.2：手动导出 `backup-YYYYMMDD-HHmm(-N).json`；恢复前强制先生成 `backup-before-restore-*.json`（内容是当前内存数据落盘后的副本）；清空前生成 `backup-before-clear-*.json`。恢复列表只列 data 目录内文件（PRD 口径 7）。

### 5.7 隐藏模块不汇总（FR-51）

hiddenModules 过滤三层：① 导航渲染（T2-1 留口，P5 接开关）；② 首页速览卡渲染（该卡不显示）；③ todoEngine 派生（5.2 中每个 source 先判 hidden）。**只过滤展示与派生，任何数据不删除**，重新开启即恢复（AC-50）。

---

## 6. 分阶段实施（P0~P6，共 119 步）

> 每步格式：做什么｜产出文件｜完成判据｜对应 FR。步骤编号沿用 T{阶段}-{任务}{子步}。依赖关系见第 7 章，验收细节见第 8 章。

### P0 环境与骨架（9 步）

**目标**：双击启动.bat → 终端显示地址 → 浏览器自动打开可切换九个占位页的框架；data 目录与初始 JSON 自动创建。

1. **T0-1a 环境确认**｜终端执行 `python --version` 并记录｜版本 ≥3.8 且在中文路径下可运行｜FR-45
2. **T0-2a 端口探测启动**｜server.py 启动段（按 5.5 实现）｜预占 8000 后启动自动用 8001，终端打印占用提示与最终地址｜FR-45
3. **T0-2b 自动开浏览器**｜server.py 的 threading.Timer 调用｜双击启动后浏览器自动打开正确端口｜FR-45
4. **T0-3a 静态托管**｜server.py 的 Handler 指向 static/｜`curl.exe http://localhost:端口/` 返回 200 HTML｜FR-45
5. **T0-3b no-store 响应头**｜server.py 覆写 end_headers｜任意响应头含 `Cache-Control: no-store`｜FR-45
6. **T0-4a ensureData()**｜server.py 初始化段：无 data/ 则建目录、无文件则写初始 JSON｜删 data/ 重启后自动重建｜FR-46
7. **T0-4b newEmptyData()**｜server.py 工厂函数：全部顶层键 + 7 条空 workoutTemplates + settings 默认值 + version=1｜生成文件与 2.0/2.6/2.9 完全一致｜FR-46
8. **T0-5a 启动.bat**｜`chcp 65001` + `python server.py` + `pause`｜双击可用，终端中文不乱码｜FR-45
9. **T0-5b 骨架页与路由**｜static/index.html + js/main.js 的 hash 路由｜#/home…#/settings 九路由各显示占位标题｜FR-1（框架）

**阶段验证**（AC-1、AC-2 前半）：双击启动.bat 浏览器自动打开；删 data 目录重启自动重建。全部通过 → **P0 完成标志达成**。

### P1 数据层与持久化（14 步）

**目标**：读写、防抖落盘、备份/恢复/清空接口全部可用，不依赖正式页面（curl 验证）。

1. **T1-1a GET /api/data**｜server.py 接口 2｜curl 返回 200 + 全量 JSON + updatedAt｜FR-46
2. **T1-1b 损坏处理**｜DATA_CORRUPT 分支｜手改坏文件后接口 500，原文件字节不变｜FR-46
3. **T1-2a 原子写**｜接口 3 写路径（锁+tmp+os.replace）｜脚本连续 50 次 POST 后文件始终为合法 JSON｜FR-3
4. **T1-2b 指纹 409**｜baseUpdatedAt 校验｜旧指纹 POST 返回 409 且文件未变｜FR-3
5. **T1-3a /api/backup**｜接口 4（文件名规则见 3.2）｜连调两次生成不同文件名｜FR-47
6. **T1-3b /api/backups**｜接口 5｜只列 data 目录 backup*.json 且倒序正确｜FR-48
7. **T1-3c /api/restore**｜接口 6（按 3.2 五步顺序）｜目录外路径 400；恢复后内容与备份一致且先生成应急备份｜FR-48
8. **T1-3d /api/clear**｜接口 7｜数据归零 + backup-before-clear-* 存在 + welcomed=false｜FR-49
9. **T1-4a api.js**｜js/api.js 七个封装｜浏览器控制台逐个调通｜FR-3
10. **T1-4b store 防抖**｜js/store.js 的 mutate+flush（按 5.4）｜连改 5 个字段 300ms 内只发 1 次 POST｜FR-3
11. **T1-4c 失败重试**｜退避重试 + 失败回调钩子｜停服务改数据出现 2/5/10s 重试，恢复服务后落盘成功｜FR-6
12. **T1-4d 关闭兜底**｜beforeunload sendBeacon｜输入后立即关标签，重开数据在（抽样 3 次）｜FR-3
13. **T1-5a today()**｜js/utils.js（按 5.1）｜构造 3:59/4:01 断言归昨天/今天；rollover=0 时口径随之切换｜FR-7
14. **T1-5b 工具函数集**｜addDays/fmtDate/weekStart(周一)/uid/debounce｜周一为周起点等断言全过｜FR-7、FR-8（基础）

**阶段验证**（AC-3、AC-4、FR-47 后端）：新增数据→杀服务→重启数据在；复制 app-data.json 逐字节比对一致；POST /api/backup 生成合规文件。**完成标志**：读写回环、备份回环（备份→改→恢复→与备份一致）脚本断言全绿。

### P2 全局框架与导航（13 步）

**目标**：所有页面共用的零件一次做对：导航、面板、确认/撤销、保存指示、主题、工具栏。

1. **T2-1a 导航渲染**｜main.js 导航段｜四组九项顺序与 PRD 2.1 一致、当前项高亮、设置置底｜FR-1
2. **T2-1b 窄屏抽屉**｜layout.css 媒体查询｜<720px 收缩为抽屉可开合｜FR-1
3. **T2-1c 隐藏过滤口**｜hiddenModules 过滤逻辑（开关 P5 接）｜手改 JSON 加 "game" 后导航少一项｜FR-51（机制）
4. **T2-2a 面板开关**｜ui/panel.js｜滑出/遮罩点击/关闭按钮/Esc 均正常｜FR-2
5. **T2-2b 宽度档与防嵌套**｜width 参数 + isOpen 守卫｜40%/50% 正确；面板内再 open 被拒绝｜FR-2
6. **T2-3a 确认框**｜ui/dialog.js（含 requireText 模式）｜requireText="清空" 时不输入二字确认键禁用｜FR-4
7. **T2-3b 撤销条+挂起**｜ui/undo.js（按 5.3）｜挂起即消失、5s 内撤销恢复、超时真删且刷新后无｜FR-4
8. **T2-4a 已保存指示**｜面板右上角组件订阅保存回调｜失焦 300ms 内出现"已保存 HH:MM"｜FR-3
9. **T2-4b 失败横幅**｜ui/toast.js 接线｜停服务改字段出红横幅，表单内容不丢｜FR-6
10. **T2-5a 主题变量**｜base.css 深/浅双套变量｜切 data-theme 全站变色，无遗漏硬编码颜色｜FR-50
11. **T2-5b setTheme()**｜store 内切换函数写 settings.theme｜切换即时生效且刷新保持（默认浅色）｜FR-50
12. **T2-6a 工具栏+空状态**｜components.css + 共用函数｜空列表显示文案+新建按钮；工具栏输入即过滤｜FR-5、FR-6
13. **T2-6b N 快捷键**｜main.js 键盘监听｜列表页按 N 开新建面板；输入框聚焦时不触发｜FR-2

**阶段验证**（AC-6、AC-7、FR-50 机制）：测试表单失焦出"已保存"且刷新仍在；测试删除确认→撤销→恢复、不撤销→5s 后真删；切 data-theme 全站变暗。**完成标志**：全部公共件在测试页演示通过。

### P3 首页与今日计划汇总机制（17 步）

**目标**：todoEngine 派生/写回机制 + 首页三区块 + 今日计划页。源数据靠手塞 JSON 验证（fixture 见 8.4）。

1. **T3-1a 三源派生**｜js/todoEngine.js 派生段（按 5.2，含隐藏模块跳过）｜5.2 用例全过｜FR-9
2. **T3-1b 合并分组排序**｜getTodosFor 完整版｜三段分组 + 优先级 + 创建时间排序正确｜FR-9
3. **T3-2a 勾选写回四源**｜toggleTodo（按 5.2 表，含 W1 反向规则）｜四源勾选/取消后 JSON 源字段变化正确｜FR-16
4. **T3-2b 副作用细节**｜selfmedia/consult 分支｜勾选发布→published+publishedDate+链接可空；勾选跟进→仅清日期不产生咨询记录｜FR-24、FR-33
5. **T3-3a 页面布局**｜views/today.js 骨架｜日期头+三段+已完成区渲染正确｜FR-15
6. **T3-3b 行内创建**｜每段"+ 加一条"（标题必填，可设 timeSlot/priority）｜回车即建入 todos 数组｜FR-15
7. **T3-3c 日期翻页只读**｜左右箭头 + 只读模式｜昨天整页不可勾选不可编辑｜FR-19
8. **T3-3d 删除入口规则**｜manual 删除按钮｜manual 可删走撤销条；派生事项无删除入口｜FR-18
9. **T3-4a 日终顺延**｜快照 + 批量改明天（按 5.3，W6 含源字段）｜确认框带 N 计数；顺延项首页消失、明天可见｜FR-17
10. **T3-4b 撤销还原**｜快照还原逻辑｜5s 内撤销全部回到今天（含源字段还原）｜FR-17
11. **T3-5a 首页事项区**｜views/home.js 区块（复用 T3-1/T3-2）｜与今日计划页同一数据源显示｜FR-9
12. **T3-5b 收起动画**｜CSS 过渡 + 已完成折叠区｜勾选收起、展开回看、当天取消回组｜FR-10
13. **T3-6a 备忘输入+列表**｜home.js 备忘区｜回车置顶显示，仅最近 10 条｜FR-11
14. **T3-6b 转待办+删除**｜转待办逻辑（W4：备忘只在首页，不进今日计划页）｜生成 manual 事项、备忘标"已转"；删除走撤销条｜FR-11
15. **T3-7a 六卡取数**｜6 个 summary 函数（按 5.2 口径）｜六种空/有数据文案逐一正确｜FR-12
16. **T3-7b 快捷入口**｜路由参数 + 自动打开（按 4.3 表）｜预置数据下各入口跳对页面且目标表单已打开/聚焦｜FR-13
17. **T3-7c 喝水 +1**｜卡内直写 WaterLog 逻辑｜点 3 次杯数即时 +3，JSON 同步｜FR-14

**阶段验证**（AC-11/12/13/16/17/19/20/21，用 fixture）：见 8.4。**完成标志**：派生、勾选写回、顺延撤销、备忘转待办、六卡取数全部通过。

### P4a 自媒体（11 步）

1. **T4a-1a 看板渲染**｜selfmedia.js 四列看板｜四列按 status 归位，卡片含标题/平台/目标日期/已发布数字｜FR-20
2. **T4a-1b 拖拽换列**｜HTML5 DnD 处理｜拖拽即改 status 落盘｜FR-21
3. **T4a-1c 已发布列表视图**｜视图切换｜列表按 publishedDate 倒序｜FR-20
4. **T4a-2a 发布确认弹窗**｜dialog 表单（日期默认今天、链接可空）｜确认入列，空链接无报错｜FR-21
5. **T4a-2b 取消回滚**｜取消分支｜取消后卡片回原列状态不变｜FR-21
6. **T4a-3a 全屏写稿路由**｜#/selfmedia/write/:id 布局｜writing 卡片可进入，左大纲右正文｜FR-22
7. **T4a-3b 写稿自动保存**｜双 textarea 1s 防抖接线｜关闭重开内容在｜FR-22
8. **T4a-4a 详情面板**｜面板字段（按 4.4 表）｜失焦自动保存，显示"已保存 HH:MM"｜FR-23
9. **T4a-4b 数据回填区**｜metrics 三数字框 + metricsUpdatedAt｜刷新后数字与回填时间保留，可多次改｜FR-23
10. **T4a-5a 搜索筛选**｜工具栏接线｜标题输入即过滤，平台筛选正确｜FR-25
11. **T4a-6a 删除**｜挂起删除接线｜已发布条目确认文案含"发布数据将一并删除"｜FR-25

**阶段验证**：AC-22/23/24/25/26 + AC-15（快捷入口部分）。

### P4b 开发工作（9 步）

1. **T4b-1a 项目列表+进度条**｜dev.js 左栏｜进度条随任务勾选实时变化（如 2/5）｜FR-26
2. **T4b-1b 项目 CRUD+收起**｜面板 + 状态逻辑｜已完结项目收列表底部｜FR-26
3. **T4b-1c 删项目级联**｜挂起级联（任务+日志一并）｜确认文案带级联，撤销整树恢复｜FR-29
4. **T4b-2a 任务列表+勾选**｜任务渲染｜勾选落盘同步｜FR-27
5. **T4b-2b 拖拽排序**｜order 字段维护｜刷新保持顺序｜FR-27
6. **T4b-2c 已完成折叠**｜折叠区｜默认折叠可展开｜FR-27
7. **T4b-3a 记一笔今天**｜日志页签输入框｜回车建当天日志，(projectId,date) 唯一｜FR-28
8. **T4b-3b 行内编辑+唯一约束**｜行内展开编辑（W3）｜同日重复回车=更新不新建；长文本 1s 保存｜FR-28
9. **T4b-4a 首页联动**｜联调用例｜当天日志→首页"已写"；截止今天任务→派生事项→勾选同步完成｜FR-28、FR-29

**阶段验证**：AC-27/28/29/30。

### P4c 咨询工作（8 步）

1. **T4c-1a 网格/列表**｜consult.js 列表与切换｜卡片字段齐全（名称/需求/跟进日期/最近咨询）｜FR-30
2. **T4c-1b 到期高亮**｜橙框规则｜到期当天及 ≤3 天逐一验证高亮｜FR-30
3. **T4c-1c 搜索筛选**｜工具栏｜名称/需求模糊 + 状态筛选正确｜FR-30
4. **T4c-2a 信息区**｜50% 面板上部｜失焦自动保存｜FR-31
5. **T4c-2b 时间线+记录表单**｜面板下部｜"记一次咨询"面板内展开、新记录插最上、不开第二面板｜FR-31
6. **T4c-3a 跟进日期同步**｜同步逻辑｜最新记录的 nextFollowupDate 同步到 Client｜FR-32
7. **T4c-3b 删除回退**｜回退逻辑（W5）｜删最新记录后取次新值，无则 null｜FR-32
8. **T4c-4a 首页联动**｜联调用例｜到期派生事项、前 3 天摘要计数、勾选只清提醒、删客户级联撤销｜FR-33

**阶段验证**：AC-31/32/33/34。

### P4d 健身计划（8 步）

1. **T4d-1a 模板格子渲染**｜plan 页签七天格｜7 格齐全显示初始空模板｜FR-34
2. **T4d-1b 模板编辑**｜编辑逻辑（训练名/动作/休息日）｜不回写历史 WorkoutLog；清空格子无确认不弹框｜FR-34
3. **T4d-2a 打卡带模板**｜打卡表单初始值（按 dayOfWeek 复制模板）｜当天模板内容自动带出｜FR-35
4. **T4d-2b 实际量编辑**｜sets/重量/时长编辑、加动作、标"没练"、改日期（W7：同日一条，重复=编辑）｜保存后记录与修改一致｜FR-35、FR-8
5. **T4d-2c 打卡列表**｜倒序列表 + 删除｜删除走撤销条｜FR-35
6. **T4d-3a 体重录入**｜weight 页签输入框｜同日两次录入取最后｜FR-36
7. **T4d-3b SVG 折线**｜30 天折线（内联 SVG 手绘，无库）｜3 个不同日期体重点位正确｜FR-36
8. **T4d-3c 历史编辑**｜历史列表改值｜改后折线联动更新｜FR-36

**阶段验证**：AC-35/36/37/38（AC-37 首页"未练"判定在 P4d 完成后与 T3-7a 联动复核）。

### P4e 饮食计划（5 步）

1. **T4e-1a 餐区块**｜diet.js 日期头 + 四餐区块｜回车加条目（如"燕麦 + 鸡蛋"）｜FR-38、FR-8
2. **T4e-1b 喝水杯子**｜杯子排交互（数量=waterGoal）｜点 5 满 5，再点第 5 取消为 4｜FR-40
3. **T4e-2a 模板存取**｜存为模板 + 从模板整套填入｜换天填入整套进入所选餐区｜FR-39
4. **T4e-2b 模板管理**｜右上角入口（改名/删除）｜删除走撤销条｜FR-39
5. **T4e-3a 首页联动**｜联调用例｜首页摘要"已记 N 餐 · 喝水 M/目标 杯"与本页同源；首页 +1 即时同步｜FR-41、FR-14

**阶段验证**：AC-39/40/41 + AC-16 复核。

### P4f 游戏娱乐（6 步）

1. **T4f-1a 三页签卡片**｜game.js 页签｜分签正确，显示累计时长/进度备注/在玩卡本周时长｜FR-42
2. **T4f-1b CRUD+状态流转**｜面板 + 通关引导（finishedDate 默认今天、review 可空）｜新建默认想玩；流转各进其签｜FR-42
3. **T4f-1c 删除级联**｜挂起级联｜时长明细一并删，撤销恢复｜FR-42
4. **T4f-2a 打卡表单**｜打卡弹窗（minutes、date 默认今天可改）｜默认记今天｜FR-43、FR-8
5. **T4f-2b 重算冗余**｜totalMinutes 全量重算（增删改 session 后）｜打卡 60 + 补记昨天 30 = 累计 90｜FR-43
6. **T4f-3a 首页联动**｜联调用例｜本周（周一至今）求和与首页卡一致，上周不计入｜FR-44

**阶段验证**：AC-43/44/45。

### P5 设置与备份恢复（10 步）

**目标**：设置页四区块全部接线 + 欢迎引导 + 备份/恢复/清空全流程。依赖：P4 全部完成（模块开关需六卡就位）。

1. **T5-1a 四区块布局**｜settings.js 骨架｜备份与恢复/外观/模块开关/偏好四卡片齐全｜FR-45（页面归属）
2. **T5-2a 外观切换**｜theme 控件接 T2-5b｜默认浅色、切换即时生效、刷新保持｜FR-50
3. **T5-3a 开关 UI**｜七个 checkbox + 提示文案｜首页/设置无开关；提示"隐藏期间数据仍在，重新开启即恢复"｜FR-51
4. **T5-3b 隐藏过滤接线**｜导航/速览卡/派生三层过滤（按 5.7）｜隐藏后三处消失、数据保留、重开恢复｜FR-51
5. **T5-4a 翻篇时间**｜单选 0/4｜改后 today() 口径立即变，首页归属随之变化｜FR-52
6. **T5-4b 喝水目标**｜number 控件（1~30）｜改 10 后首页与饮食页同步 /10｜FR-52
7. **T5-5a 导出备份**｜按钮 + 位置提示｜data/ 出现 backup-YYYYMMDD-HHmm.json 并提示位置｜FR-47
8. **T5-5b 恢复流程**｜列表→强确认（文案含"不可撤销+先自动应急备份"）→恢复→提示刷新｜先生成 backup-before-restore-*，恢复后数据与备份一致，全程无撤销条｜FR-48
9. **T5-5c 清空流程**｜输入"清空"二字→自动备份→归零→welcomed 重置｜不输入二字不能确认；清空后回欢迎引导｜FR-49
10. **T5-5d 欢迎引导**｜首屏引导组件（三句话+开始使用）｜welcomed=false 时显示，点击后不再出现｜FR-46

**阶段验证**：AC-2、AC-10、AC-42、AC-46~AC-51。

### P6 联调与验收（9 步）

1. **T6-1a 脚本化检查**｜scripts/check.ps1 或 check.py（断言见 8.1/8.2）｜全部断言通过｜AC-1/3/4/46/47/48/49 自动化部分
2. **T6-1b AC 手工走查**｜51 条勾选记录（按第 8 章归位表）｜全过｜AC-1~51
3. **T6-2a 翻篇专项**｜调系统时间 3:59/4:01 各记一条健身打卡｜分别归昨天/今天；改 0 点后口径切换｜AC-8
4. **T6-2b 补记专项**｜四类按天数据（打卡/餐食/时长/日志）各改一条到前天｜出现在对应日期记录与统计中｜AC-9
5. **T6-2c 端口专项**｜预占 8000–8005 后启动｜自动换 8006 且终端有提示｜AC-1 附属
6. **T6-2d 断网专项**｜断网全流程走一遍｜除打开浏览器外无任何网络请求失败报错｜AC-5
7. **T6-3a 损坏 JSON**｜手改 app-data.json 为非法 JSON 后启动｜不崩、报错可见、原文件保留未被覆盖｜健壮性
8. **T6-3b 强杀专项**｜保存过程中强杀服务｜重开后至多丢最后一次未落盘编辑｜健壮性
9. **T6-3c 快速连写**｜连续快速改 20 个字段｜最终文件与界面显示完全一致｜健壮性

**完成标志**：51 条 AC 全过 + 专项记录齐全 → v1 完成。

---

## 7. 依赖与关键路径

### 7.1 必须串行（硬依赖）

```
T0-2 → T0-3 → T0-5b                # 服务先于骨架页
T0-4 → T1-1 → T1-2 → T1-4          # 数据文件 → 读 → 写 → 前端 store
T1-4 → 一切视图任务（P2 后半、P3、P4、P5）# 没有 store 无法保存
T1-5a → T3-1、T4d、T4e、T4f、T5-4  # 日期口径先行
T2-2 → 所有面板任务；T2-3 → 所有删除/顺延任务
T3-1 → T3-2 → T3-3 → T3-4；T3-1 → T3-5 → T3-6
T3-1 → P4a、P4b、P4c               # 派生规则冻结后才接真实模块
T3-7 → P4d、P4e、P4f               # 摘要口径冻结后才接生活模块
P4a∧P4b∧P4c∧P4d∧P4e∧P4f → T5-3     # 模块开关等六卡就位
T5-3 → T5-5 → T6-1
```

**共享文件串行约束**：store.js / utils.js / todoEngine.js 对外接口在 P1/P3 冻结后，P4 阶段只准新增函数不准改签名；components.css 在 P2 冻结后各模块只追加自己的 class 段。

### 7.2 可并行

- T0-5（骨架页）∥ T1 全部接口任务。
- P2 内部：T2-5（主题）∥ T2-2/T2-3。
- P4 六条线：P4a ∥ P4b ∥ P4c ∥ P4d ∥ P4e ∥ P4f（各自的 views/*.js 文件独立；公共件改动回 P2 合并）。
- T5-1/T5-2/T5-4 ∥ P4d/e/f 收尾。
- T6-2 各专项互相独立。

### 7.3 关键路径（19 个任务节点）

```
T0-2 → T0-4 → T1-2 → T1-4 → T2-2 → T2-3 → T3-1 → T3-2 → T3-3 → T3-4
 → T3-5 → T3-7 → T4a-1 → T4a-2 → T4a-3 → T4a-4 → T5-3 → T5-5 → T6-1
```

不可压缩的三段：**T1-2→T1-4**（落盘链路，一切之上）、**T3-1→T3-2**（汇总机制，三条工作线都依赖）、**T5-3→T5-5→T6-1**（验收收尾，无法提前）。P4 段按最长的 P4a（11 步）计入；多人并行时把 P4a 拆给两人，关键路径缩短为 P4c（8 步）级别。

---

## 8. 验证与验收（51 条 AC 归位）

### 8.1 P0/P1 自动化断言（check 脚本）

1. `GET {BASE}/` → 200 且含 `id="view"`；
2. `GET {BASE}/api/health` → 200，`version==1`；
3. `GET {BASE}/static/js/main.js` → 200 且响应头含 `no-store`；
4. `data/app-data.json` 存在，解析含 2.0 全部顶层键且 `workoutTemplates.length==7`；
5. 读写回环：POST 含 1 条 memo 的 data → 磁盘文件比对一致；
6. 原子写压力：循环 50 次 POST，每次后磁盘文件均为合法 JSON；
7. 409：旧 baseUpdatedAt POST → 期望 409；
8. 备份回环：backup → 改数据 → restore → GET /api/data 与备份文件逐字节一致，且存在 `backup-before-restore-*`；
9. 清空：clear 后 data 等于初始结构且 `backup-before-clear-*` 存在、`settings.welcomed==false`；
10. 文件名正则：`^backup(-before-(restore|clear))?-\d{8}-\d{4}(-\d+)?\.json$`；
11. 恢复列表越界检查：data 目录外放假 backup 文件，/api/backups 不返回它。

### 8.2 每阶段跑的静态守护

`grep -rn "new Date(" static/js` 只允许命中 utils.js（翻篇口径守护）。

### 8.3 AC 归位总表

| AC | 验证阶段 | 验法（操作 → 预期） |
|---|---|---|
| AC-1 | P0 + T6-2c | 双击启动 → 服务起、浏览器自动开、终端见地址；预占端口自动换 |
| AC-2 | P5 | 删 data 重启 → 欢迎引导三句话，点后不再出现 |
| AC-3 | P1 | 新增数据→关浏览器和服务→重启→数据在 |
| AC-4 | P1 | 复制 app-data.json 逐字节比对一致 |
| AC-5 | T6-2d | 断网全流程无网络报错 |
| AC-6 | P2 | 失焦出"已保存 HH:MM"，刷新仍在，全程无保存按钮 |
| AC-7 | P2 | 删除：确认（含级联文案）→撤销条→5s 内撤销恢复；不撤销刷新后无 |
| AC-8 | T6-2a | 3:59 记归昨天、4:01 归今天；改 0 点口径切换 |
| AC-9 | T6-2b | 四类按天数据日期改前天，统计随之归属前天 |
| AC-10 | P5 | 深色即时变暗、切回浅色恢复、默认浅色 |
| AC-11 | P3 | fixture 待发布卡 → 首页出现"发布：《标题》"带来源标签 |
| AC-12 | P3 | 勾选收起进已完成区，取消回到原分组 |
| AC-13 | P3 | 备忘回车置顶；转待办生成事项且备忘标"已转" |
| AC-14 | P3 + P4 各线复核 | 六卡摘要六种状态逐一核对（未发/已发、未写/已写、待跟进 N、未练/已练、N 餐 M/8 杯、本周 X 小时） |
| AC-15 | P4a 完成时 | 各快捷入口跳转且目标表单已打开/聚焦 |
| AC-16 | P3 + P4e | 首页 +1 三次杯数 +3，饮食页一致 |
| AC-17 | P3 | 三段分组显示正确 |
| AC-18 | P4b | 今日计划勾选开发任务事项 → 任务同步完成；取消同步恢复 |
| AC-19 | P3 | 2 条未完成日终顺延到明天；5s 内撤销全回来 |
| AC-20 | P3 | 临时事项可删（可撤销）；模块事项无删除入口 |
| AC-21 | P3 | 昨天整页只读 |
| AC-22 | P4a | 新建进选题池；拖拽换列状态同步 |
| AC-23 | P4a | 拖入已发布弹确认（日期默认今天、链接可空），空链接入列无报错 |
| AC-24 | P4a | 全屏写稿关闭重开内容在 |
| AC-25 | P4a | 回填数字刷新后保留 |
| AC-26 | P4a | 首页勾选发布事项 → 卡片进已发布（无链接允许） |
| AC-27 | P4b | 新建项目进度条随勾选实时变化 |
| AC-28 | P4b | 任务增删、拖拽排序、已完成折叠生效 |
| AC-29 | P4b | "记一笔今天"回车建日志，首页开发卡变"已写" |
| AC-30 | P4b | 截止今天任务→首页事项→勾选同步完成 |
| AC-31 | P4c | 记咨询（跟进日期=明天）→ 客户卡同步该日期 |
| AC-32 | P4c | 跟进日期=今天→首页事项与摘要+1；勾选后提醒清、摘要-1、无新咨询记录 |
| AC-33 | P4c | 跟进日期=3 天后 → 进摘要计数 |
| AC-34 | P4c | 删含 3 条记录客户 → 撤销完整恢复 |
| AC-35 | P4d | 改周一模板→下个周一打卡带出；历史打卡不变 |
| AC-36 | P4d | 打卡改重量加动作保存一致；首页"已练" |
| AC-37 | P4d | 标"没练"→ 首页"未练" |
| AC-38 | P4d | 3 日期体重折线点位正确；同日两次取最后 |
| AC-39 | P4e | 早餐回车条目出现；首页"已记 1 餐" |
| AC-40 | P4e | 存为模板→换天整套填入 |
| AC-41 | P4e | 点 5 杯→首页 5/8；取消 1→4/8 |
| AC-42 | P5 | 目标改 10 → 首页与饮食页同步 /10 |
| AC-43 | P4f | 想玩→在玩→已通关流转，通关引导填日期与评价（可空） |
| AC-44 | P4f | 打卡 60 + 补记昨天 30 = 累计 90 |
| AC-45 | P4f | 首页"本周已玩 X 小时"与明细之和一致，上周不计 |
| AC-46 | P5 | 导出备份生成带时间戳文件并提示位置 |
| AC-47 | P5 | 恢复：强确认→先生成应急备份→恢复后刷新数据完全一致 |
| AC-48 | P5 | 恢复列表只显示 data 目录内备份 |
| AC-49 | P5 | 清空需输入"清空"二字→自动备份→归零回欢迎引导 |
| AC-50 | P5 | 隐藏游戏模块→导航/首页卡/事项消失；重开数据完整恢复 |
| AC-51 | P5 | 恢复备份全程无撤销条 |

### 8.4 P3 验证 fixture（手塞 data/app-data.json 后刷新）

- contents：1 条 `status=scheduled、scheduledDate=今天、title="测试稿"`；
- devProjects：项目 P1；devTasks：任务 T1（`dueDate=今天、done=false`）；
- clients：客户 C1（`nextFollowupDate=今天`）；
- todos：空；waterLogs：`{date:今天, cups:0}`。
按 8.3 表中 P3 行逐项操作。

---

## 9. 风险与兜底

| # | 风险 | 触发场景 | 应对 |
|---|---|---|---|
| R1 | 浏览器缓存旧静态文件 | 改完 JS 页面不更新 | server.py 全响应加 `Cache-Control: no-store`；调试用 Ctrl+F5 |
| R2 | JSON 写坏/半写 | 保存中强杀服务、断电 | 写锁串行化 + tmp + os.replace 原子替换；启动读到非法 JSON 不覆盖原文件，报 DATA_CORRUPT |
| R3 | schema 迁移 | 后续版本加字段读旧文件 | version 字段 + 缺键补默认值 + MIGRATIONS 链式迁移；version 大于当前则拒绝写 |
| R4 | 翻篇口径不一致 | 各视图各自 new Date() | "今天"唯一入口 utils.today()；验收 grep 守护；T6-2a 调系统时间专项 |
| R5 | 误删/误恢复 | 删错客户带 N 条记录、恢复错备份 | 删除挂起 5s（撤销=取消标记，零成本恢复）；恢复前强制应急备份；恢复为唯一不可撤销操作且弹窗明示 |
| R6 | 端口占用 | 8000 被占 | 8000–8019 递增探测，终端打印最终地址，webbrowser 用最终端口 |
| R7 | 双标签页写冲突 | 同时开两个标签改数据 | baseUpdatedAt 指纹 + 409 后写为准重发 + 横幅提示（单用户可接受） |
| R8 | 关标签丢最后一次输入 | 输入后立即关闭 | 长文本 1s 短防抖 + beforeunload sendBeacon 兜底 |
| R9 | 派生事项不同步 | 源实体改了首页没变 | 派生查询时计算不落盘，天然同源；任何 mutate 后重渲染当前页与首页速览 |
| R10 | 撤销窗口内服务重启 | 挂起未提交 | 挂起只在内存，重启=删除未发生（安全方向）；撤销条文案明示"N 秒后删除" |
| R11 | 中文路径/编码 | 项目路径含中文 | server.py 全用 os.path + UTF-8 读写；bat 首行 chcp 65001 |
| R12 | 冗余字段失真 | Game.totalMinutes 与明细不一致 | 增删改 session 后一律全量重算，不做增量维护；AC-44 专查 |

---

## 10. 待确认项（集中列出；正文已按"采用默认值"实现）

| # | 缺口/矛盾 | 正文采用的默认值 | 影响位置 |
|---|---|---|---|
| W1 | 派生事项"取消勾选"的反向写回 PRD 未定义 | 自媒体：退回 scheduled，保留 link 与 publishedDate；咨询：恢复 nextFollowupDate=今天 | 5.2 写回表、T3-2 |
| W2 | 派生事项 timeSlot 仅注明自媒体/咨询默认白天，开发任务未写 | 派生事项一律默认 afternoon | 5.2、T3-1 |
| W3 | PRD 口径 15 的例外清单未含开发日志行内编辑，design 4.4 明确行内 | 按 design：日志行内编辑，不走面板 | 4.4、T4b-3 |
| W4 | design 备忘"更多进今日计划页看"，PRD 今日计划页无备忘区块 | 第一版备忘只在首页显示最近 10 条 | T3-6 |
| W5 | 删除客户最新一条咨询记录后 nextFollowupDate 取值未定义 | 回退到次新记录的值，无则 null | 2.10、T4c-3b |
| W6 | 日终顺延撤销快照范围未定义 | 全部还原（manual 的 planDate + 派生源字段 scheduledDate/dueDate/nextFollowupDate） | 5.3、T3-4 |
| W7 | 同一天是否允许多条 WorkoutLog 未明示 | 同一天至多一条，重复打卡=编辑已有 | 2.6、T4d-2 |

---

## 11. 变更记录（交付后）

> 本计划正文为交付前版本，未随以下改动回写；以下五处改动的权威描述以 PRD.md 与 docs/design-v1.md 现行内容为准。

| 提交 | 改动 | 同步到的文档章节 |
|---|---|---|
| 69ececc | 自媒体增加"发布后视频数据"图表与两种空态（问题2） | PRD 4.2 / 7 FR-53 / 8 / 9.5 AC-53；design-v1 4.3 / 6 |
| 825ffdc | 开发工作增加常驻"＋ 新增工作项"入口与无项目时自动建"我的工作"（问题3） | PRD 4.3 / 7 FR-56 / 9.6 AC-54；design-v1 4.4 |
| c39a7d0 | 咨询客户卡片与列表行增加删除入口（确认 + 5 秒撤销 + 级联删除咨询记录）（问题4） | PRD 4.4 / 7 FR-57 / 9.7 AC-55；design-v1 4.5 |
| ec02ed3 | 健身新增"日历"默认页签、饮食页头新增月度日历（问题5） | PRD 4.5 / 4.6 / 7 FR-54、FR-55 / 8 / 9.8 AC-56、9.9 AC-57；design-v1 4.6 / 4.7 / 6 |
| 707dd0f | 导航底部新增"立即保存"按钮，与自动保存并存（问题6） | PRD 0 口径5 / 7 FR-3 / 9.2 AC-6、AC-52；design-v1 2.1 / 7 |
