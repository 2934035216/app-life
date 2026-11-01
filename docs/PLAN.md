# 个人工作生活 App v1 执行计划

> 版本：v1
> 输入：PRD.md（FR-1~FR-52、AC-1~AC-51）、docs/design-v1.md
> 目标：拿到本文件即可开工；每个任务可勾选、可验证、有归属阶段。
> 技术形态已锁定：本地 Python 小服务 + 无构建静态前端 + 单文件 data/app-data.json，不引入任何构建工具与第三方前端依赖（纯 HTML/CSS/ES Module）。

---

## 1. 技术形态与目录结构

### 1.1 总体形态

- **后端**：Python 标准库 `http.server`（不装任何 pip 包），一个 `server.py` 负责：静态文件托管、数据读写接口、备份/恢复/清空接口、端口自动切换、启动时打开浏览器。
- **前端**：无构建静态站点，原生 ES Module（`<script type="module">`），按模块拆文件，浏览器直接加载。不引框架；唯一图表（体重折线）用内联 SVG 手绘，不引图表库。
- **数据流**：整文档读写。前端 `store.js` 持有全量数据对象，任何修改 → 防抖 300ms（长文本 1s）→ `POST /api/data` 整体落盘；服务端先写 `.tmp` 再原子重命名。单用户本机场景下无需字段级接口，避免 52 个接口的联调成本。

### 1.2 目录与文件划分

```
APP/
├── 启动.bat                    # 双击入口：调用 python server.py，窗口保持显示访问地址
├── server.py                   # 服务入口（唯一后端文件）
├── data/
│   └── app-data.json           # 唯一数据文件（首次启动自动创建）
└── static/
    ├── index.html              # 唯一 HTML 入口，含左侧导航容器与 #view 挂载点
    ├── css/
    │   ├── base.css            # 重置、CSS 变量（深浅色主题变量在此）、字体
    │   ├── layout.css          # 导航布局、页面容器、看板列宽、窄屏收缩规则
    │   └── components.css      # 侧滑面板、确认框、撤销条、横幅、卡片、页签
    └── js/
        ├── main.js             # 启动：拉取数据 → 渲染导航 → hash 路由分发
        ├── api.js              # fetch 封装：loadData/saveData/backup/listBackups/restore/clear
        ├── store.js            # 内存数据、修改入口 mutate()、防抖落盘、保存状态回调、失败重试
        ├── utils.js            # today()（凌晨翻篇唯一入口）、日期加减/格式化、uid()、防抖函数
        ├── todoEngine.js       # 今日事项派生引擎：从各模块扫描生成 TodoItem 视图 + 勾选/顺延写回
        ├── ui/
        │   ├── panel.js        # 右侧侧滑面板（40%/50% 宽，遮罩关闭，禁止嵌套）
        │   ├── dialog.js       # 确认框（支持"输入清空二字"强确认模式）
        │   ├── undo.js         # 底部 5 秒撤销条（超时才真正提交删除）
        │   └── toast.js        # 顶部红色错误横幅、普通提示
        └── views/
            ├── home.js         # 首页：今日事项区、快速备忘区、六张速览卡
            ├── today.js        # 今日计划页：三段清单、行内创建、日终整理、日期翻页
            ├── selfmedia.js    # 自媒体：四列看板 + 全屏写稿页
            ├── dev.js          # 开发工作：项目列表 + 任务/日志双页签
            ├── consult.js      # 咨询工作：客户网格/列表 + 详情面板时间线
            ├── fitness.js      # 健身计划：本周模板/打卡记录/体重三页签 + SVG 折线
            ├── diet.js         # 饮食计划：按天五区块 + 餐食模板
            ├── game.js         # 游戏娱乐：三状态页签 + 时长打卡
            └── settings.js     # 数据与设置：备份恢复/外观/模块开关/偏好
```

### 1.3 各文件职责要点

| 文件 | 职责 | 不做什么 |
|---|---|---|
| server.py | 端口探测与切换、静态托管（带 `Cache-Control: no-store`）、`/api/data` 读写（原子写）、`/api/backup` `/api/backups` `/api/restore` `/api/clear`、创建 data 目录与初始 JSON、打开浏览器 | 不做业务校验、不做字段级接口 |
| store.js | 全量数据唯一持有者；所有视图只经 `mutate(fn)` 改数据；防抖落盘；暴露 `onSaveState` 回调给面板显示"已保存 HH:MM" | 不直接操作 DOM |
| utils.js | `today()` 是全 App 唯一"今天"判定（读 Settings.dayRolloverHour，0–4 点归昨天）；`addDays`、`fmtDate`、`uid`、`debounce` | 视图里禁止另写"今天"判定 |
| todoEngine.js | 查询时从 ContentItem/DevTask/Client 派生今日事项（**不复制数据**）；合并 manual 临时事项实体；勾选/取消/日终顺延统一在此写回源字段；日终顺延前做快照供撤销 | 不持久化派生出的 TodoItem |
| views/*.js | 每个文件导出 `render(container, params)`；自带空状态；通过 store 读写 | 不跨文件直接调彼此的内部函数，跨模块联动走 store + 路由参数 |

### 1.4 数据文件顶层结构（写入 PRD 第 10 节实体）

```json
{
  "version": 1,
  "todos": [],        // 仅 manual 临时事项实体（含 memo 转来的）
  "memos": [],
  "contents": [],
  "devProjects": [], "devTasks": [], "devLogs": [],
  "clients": [], "consultSessions": [],
  "workoutTemplates": [ /* 固定 7 条，初始化时生成 */ ],
  "workoutLogs": [], "weightEntries": [],
  "mealLogs": [], "mealTemplates": [], "waterLogs": [],
  "games": [], "gameSessions": [],
  "settings": { "theme": "light", "dayRolloverHour": 4, "waterGoal": 8, "hiddenModules": [], "welcomed": false }
}
```

**关键设计决策（先拍板再动手，避免返工）**：
1. 今日事项 = **查询时派生**（todoEngine 按规则扫源实体）+ manual 实体合并。勾选完成 = 写回源字段（DevTask.done=true / Client.nextFollowupDate 清空 / ContentItem.status→published）。这样天然同源，无同步 bug。
2. 删除撤销的实现：点删除 → 条目仅从**内存视图**隐藏并挂起，撤销条 5 秒倒计时结束才从数据对象中真正移除并落盘；撤销 = 取消挂起。全程无需"恢复数据"。
3. 日终顺延撤销：确认前对受影响的条目做字段快照（旧 planDate/scheduledDate/dueDate/nextFollowupDate），撤销时按快照还原。

---

## 2. 分阶段排期

依赖关系：`P0 → P1 → P2 → P3 → P4（内部六个子模块可并行）→ P5 → P6`。P5 依赖 P2 的主题机制与 P3 的隐藏过滤口径，P6 依赖全部。

### P0 环境与骨架

- **目标**：双击 `启动.bat` → 终端显示地址 → 浏览器自动打开一个能切换九个空白页的框架。
- **任务**：T0-1 ~ T0-5
- **完成标志**：AC-1 通过；data/app-data.json 自动生成；九个路由可切换（内容空白）。
- **依赖**：无。

### P1 数据层与持久化

- **目标**：数据读写、防抖落盘、备份/恢复/清空接口全部可用；不依赖任何正式页面（用临时调试输出验证）。
- **任务**：T1-1 ~ T1-5
- **完成标志**：改数据 → 300ms 内 app-data.json 变化；杀服务再启动数据在；备份接口生成合规文件；AC-3、AC-4 的核心链路通过。
- **依赖**：P0。

### P2 全局框架与导航

- **目标**：导航、侧滑面板、确认框、撤销条、自动保存指示、主题变量这些"所有页面都要用的零件"一次做对。
- **任务**：T2-1 ~ T2-6
- **完成标志**：任一测试表单可演示"失焦保存 + 已保存时间 + 失败横幅"；任一测试条目可演示"确认 → 撤销 → 真删"；导航四组九项高亮正确；深色系变量切换生效（设置页入口 P5 才接）。
- **依赖**：P1（store 就绪）。

### P3 首页与今日计划汇总机制

- **目标**：todoEngine 派生/写回机制 + 首页三区块 + 今日计划页。这是全 App 机制最密的阶段，用"手工往数据文件里塞源数据"的方式先验证派生规则。
- **任务**：T3-1 ~ T3-7
- **完成标志**：AC-11/12/13/16/17/19/21 用预置数据通过（此时模块页还没做，源数据靠手改 JSON 或临时入口注入）。
- **依赖**：P2。

### P4 各业务模块（六条线，内部可并行）

| 子线 | 任务 | 对应 FR | 依赖 |
|---|---|---|---|
| P4a 自媒体 | T4a-1 ~ T4a-6 | FR-20 ~ FR-25 | P3（要接 todoEngine 的发布事项规则） |
| P4b 开发工作 | T4b-1 ~ T4b-4 | FR-26 ~ FR-29 | P3（截止日期=今天派生事项） |
| P4c 咨询工作 | T4c-1 ~ T4c-4 | FR-30 ~ FR-33 | P3（跟进日期派生事项与摘要） |
| P4d 健身计划 | T4d-1 ~ T4d-3 | FR-34 ~ FR-37 | P2（不产今日事项，只供摘要） |
| P4e 饮食计划 | T4e-1 ~ T4e-3 | FR-38 ~ FR-41 | P3（首页喝水+1 已存在，需同源） |
| P4f 游戏娱乐 | T4f-1 ~ T4f-3 | FR-42 ~ FR-44 | P3（本周时长求和已存在，需同源） |

- **目标**：六个模块页面完整可用，且与首页/今日计划的联动全部真实跑通（替换 P3 的手塞数据验证）。
- **完成标志**：各子线对应的 AC 条目通过（见第 5 节挂载表）。
- **依赖**：P3；六条线之间互相不依赖，但**共享 store.js / panel.js 的改动必须回到 P2 负责人手里合并**，不允许在各子线里改公共件。

### P5 设置与备份恢复

- **目标**：设置页四区块全部接线；欢迎引导；备份/恢复/清空全流程。
- **任务**：T5-1 ~ T5-5
- **完成标志**：AC-2、AC-46 ~ AC-51 通过。
- **依赖**：P4（模块开关要验证首页六卡过滤，须等六卡都存在）；P1 的备份接口已就绪，本阶段只做 UI 与串联。

### P6 联调与验收

- **目标**：按 51 条 AC 全量走查 + 边界专项 + 健壮性专项。
- **任务**：T6-1 ~ T6-3
- **完成标志**：AC-1 ~ AC-51 全过；边界专项记录结果。
- **依赖**：P5。

---

## 3. 任务清单（按阶段，可勾选）

> 每条标注：对应 FR、实施要点、易错边界。

### P0 环境与骨架

- [ ] **T0-1 环境确认**（FR-45）：运行 `python --version` 确认 ≥ 3.8；确认工作目录无中文路径问题（路径含中文，`server.py` 一律用 `os.path` 与 UTF-8 读写，bat 里 `chcp 65001`）。
- [ ] **T0-2 server.py 启动与端口**（FR-45）：从 8000 起探测，捕获 `OSError`（errno 10048/98）递增重试，最多试 20 个；启动后 `webbrowser.open`；终端打印最终地址。**易错点**：端口探测不能用"先 bind 再关"的方式（有竞态），直接在 `HTTPServer` 构造时 try。
- [ ] **T0-3 静态托管与 no-store**：`SimpleHTTPRequestHandler` 指到 static/，响应头加 `Cache-Control: no-store`。**易错点**：不加 no-store 时浏览器缓存旧 JS，改代码不生效，排查极耗时。
- [ ] **T0-4 数据初始化**（FR-46 前半）：启动时无 data/ 则建目录，无 app-data.json 则写入 1.4 节初始结构（含 7 条空 workoutTemplates）。
- [ ] **T0-5 启动.bat + 骨架页**：bat 内容 `chcp 65001` + `python server.py` + `pause`；index.html + hash 路由，九个 `#/xxx` 路由渲染占位标题。

### P1 数据层与持久化

- [ ] **T1-1 GET /api/data**：返回整个 JSON；文件损坏（非合法 JSON）时返回当前内存备份并给前端错误标记（配合风险表 R5）。
- [ ] **T1-2 POST /api/data**（FR-3 后端）：整体覆盖写；流程：写 `app-data.json.tmp` → `os.replace` 原子替换；单文件锁（`threading.Lock`）串行化写请求。**易错点**：直接 `open('w')` 中途断电会得到半个文件，必须 tmp+replace。
- [ ] **T1-3 备份三接口**（FR-47/48/49 后端）：`POST /api/backup`（复制为 `backup-YYYYMMDD-HHmm.json`，同一分钟内已有同名则追加 `-2`）；`GET /api/backups`（只列 data 目录内 `backup*.json`，按文件名时间倒序）；`POST /api/restore {file}`（先自动写 `backup-before-restore-*.json` 再覆盖）；`POST /api/clear`（先自动备份再写入初始结构）。**易错点**：恢复/清空前必须先落盘当前内存数据，否则应急备份是旧内容。
- [ ] **T1-4 api.js + store.js**（FR-3 前端）：`mutate(fn)` 改数据并标脏；普通字段 300ms 防抖、长文本 1s 防抖（两个独立计时器，统一 flush）；保存中/成功/失败三态回调；失败时保留脏数据 + 定时重试 + 触发红色横幅。**易错点**：页面关闭（beforeunload）时必须尝试最后一次同步保存（`navigator.sendBeacon` 或同步 XHR 备选）。
- [ ] **T1-5 utils.js 日期核心**（FR-7 基础）：`today(settings)` 返回翻篇口径下的"今天"日期串（当前时间 < 翻篇点则取昨天）；`addDays`/`fmtDate`/`weekStart`（周一）/`uid()`。**易错点**：所有视图只准调 `today()`，禁止 `new Date()` 直接取日期，否则 AC-8 必然翻车。

### P2 全局框架与导航

- [ ] **T2-1 导航**（FR-1）：四组九项固定顺序渲染、当前路由高亮、数据与设置置底（与其他项视觉分隔）；窄屏（<720px）收缩为抽屉。渲染时按 `settings.hiddenModules` 过滤（开关本身 P5 做，这里先留口）。
- [ ] **T2-2 侧滑面板**（FR-2）：`panel.open({width, title, content})`，默认 40%、咨询传 50%；遮罩点击与关闭按钮收起；`panel.isOpen()` 存在时拒绝再开（PRD 规则）；面板内整页跳转用路由。自媒体全屏写稿页不走 panel，走独立路由 `#/selfmedia/write/:id`。
- [ ] **T2-3 确认框 + 撤销条**（FR-4）：`dialog.confirm({title, body, danger, requireText})` 支持"需输入指定文字"模式；`undo.show({label, onCommit, onUndo})` 底部横条 5 秒倒计时，超时执行 onCommit（真正改数据落盘），撤销执行 onUndo。**删除统一实现**：点击删除 → 确认框 → 条目仅打挂起标记从视图消失 → undo.show 超时后真正删除。
- [ ] **T2-4 保存指示与错误横幅**（FR-3/FR-6）：面板右上角"已保存 HH:MM"订阅 store 保存回调；失败时 toast.js 顶部红色横幅"保存失败，请重试或检查数据文件"，store 自动重试，表单内容不动。
- [ ] **T2-5 主题机制**（FR-50）：base.css 用 `body[data-theme="dark"]` 切换整套 CSS 变量；`store` 里 theme 变更即时改 attribute；默认 light。
- [ ] **T2-6 通用小件**（FR-5/FR-6）：列表页工具栏样式（左搜索右筛选）、空状态组件（文案+新建按钮）、`N` 快捷键（输入框聚焦时禁用）。

### P3 首页与今日计划

- [ ] **T3-1 todoEngine 派生规则**（FR-9/16/24/29/33）：实现 `getTodosFor(date)`，输出 = 手事项实体（todos 数组中 planDate=date）∪ 派生事项：自媒体（status=scheduled 且 scheduledDate=date → "发布：《标题》"）、开发（dueDate=date 且未完成 → "开发：项目名-任务名"）、咨询（nextFollowupDate=date → "跟进客户：某某"）。每条含虚拟 id（`src:实体id`）、source、sourceId。**易错点**：派生事项不落盘；done 状态映射为源实体自身状态（published/done/无跟进日期），取消勾选 = 反向写回。
- [ ] **T3-2 勾选写回**（FR-16/24/33 副作用）：`toggleTodo(item, done)`：manual → 改实体；dev → task.done；selfmedia → status 转 published（publishedDate=today、link 允许为空）；consult → 清 nextFollowupDate（不建咨询记录）。**易错点**：咨询只清提醒不闭环，AC-32 专查此处。
- [ ] **T3-3 今日计划页**（FR-15/18/19）：日期头（左右箭头翻页）、三段分组、段内优先级+创建时间排序、每段底部"+ 加一条"行内创建（标题必填、可选时间段/优先级）；临时事项可删（撤销条），模块事项无删除入口；早于今天的日期整页只读。
- [ ] **T3-4 日终整理**（FR-17）：按钮 → 确认框"还有 N 条未完成，顺延到明天？"→ 确认前快照所有受影响条目的日期字段 → 批量改为明天（源字段同步改）→ 撤销条 5 秒内按快照还原。仅手动触发，无任何定时器自动顺延。
- [ ] **T3-5 首页今日事项区**（FR-9/10）：复用 T3-1/T3-2；勾选后淡入淡出收起到页面底部"已完成"折叠区，可展开、当天可取消；空状态文案按 PRD 3.1。
- [ ] **T3-6 快速备忘区**（FR-11）：常驻输入框回车存 Memo；列表仅最近 10 条；「转待办」建 manual TodoItem（planDate=today），Memo 标记 convertedToTodo + todoId；删除走撤销条。
- [ ] **T3-7 六张速览卡**（FR-12/13/14）：卡片统一结构（卡头/摘要/快捷入口）；六个取数函数严格按 PRD 5.4 口径；快捷入口用路由参数跳转并自动打开目标功能（如 `#/selfmedia?new=1`、`#/fitness?tab=weight&focus=1`）；「喝水 +1」直接 mutate WaterLog 并即时刷新，是全首页唯一不跳页的写操作。**易错点**：摘要卡的"已练/未练"判定含 skipped 标记；游戏"本周"从周一开始算。

### P4a 自媒体（FR-20 ~ FR-25）

- [ ] **T4a-1 四列看板**（FR-20）：选题池/写稿中/待发布/已发布四列，卡片含标题、平台标签、目标日期、已发布卡显示播放/点赞；HTML5 拖拽换列；已发布列可切列表视图按 publishedDate 倒序。
- [ ] **T4a-2 发布确认弹窗**（FR-21）：拖入已发布列时弹小表单（实际发布日期默认今天、链接可空），确认才入列；取消则卡片弹回原列。**易错点**：链接为空合法，不能加非空校验。
- [ ] **T4a-3 全屏写稿页**（FR-22）：`#/selfmedia/write/:id` 左大纲右正文，两个 textarea 走 store 长文本 1s 防抖；仅 writing 状态可进；关闭返回看板。
- [ ] **T4a-4 详情面板与数据回填**（FR-23）：已发布卡片面板含播放/点赞/评论三个数字框 + metricsUpdatedAt，失焦即存、可多次改。
- [ ] **T4a-5 搜索与平台筛选**（FR-25）：标题模糊匹配输入即过滤；平台多选筛选。
- [ ] **T4a-6 删除**（FR-25）：统一确认+撤销；已发布条目确认文案加"发布数据将一并删除"。删除后 todoEngine 自动不再派生其事项（同源机制白得，无需单独写级联）。

### P4b 开发工作（FR-26 ~ FR-29）

- [ ] **T4b-1 项目列表**（FR-26）：左栏项目列表（名称 + x/y 进度条），新建/重命名/状态（进行中/已搁置/已完结），已完结收底部；删项目确认"其下任务与日志一并删除"，撤销条恢复整棵子树（挂起式删除天然支持）。
- [ ] **T4b-2 任务页签**（FR-27）：任务增删改勾、截止日期、优先级、HTML5 拖拽排序（存 order 字段）、已完成默认折叠。
- [ ] **T4b-3 开发日志页签**（FR-28）：按天倒序流；当天无日志显示"记一笔今天"输入框回车即建（projectId+date 唯一约束在 store 层保证，重复回车更新而非新建）；已有日志行内展开编辑（日志不走侧滑面板）。
- [ ] **T4b-4 首页联动核对**（FR-28/29）：当天有日志 → 首页开发卡"已写"；任务截止日期=今天且未完成 → 派生事项；首页勾选 → task.done 同步（复用 T3-2，联调验证即可）。

### P4c 咨询工作（FR-30 ~ FR-33）

- [ ] **T4c-1 客户卡片网格/列表**（FR-30）：可切换；卡片含名称、需求一句话、下次跟进日期（今天或 3 天内到期高亮橙框）、最近咨询日期；搜索（名称/需求）+ 状态筛选（全部/跟进中/已成交/暂停）。
- [ ] **T4c-2 详情面板**（FR-31，50% 宽）：上部客户信息自动保存；下部咨询时间线倒序；顶部固定"记一次咨询"按钮，点击在面板内顶部展开表单（不再开面板）。
- [ ] **T4c-3 咨询记录与跟进同步**（FR-32）：记录含时间/议题/结论/下一步/下次跟进日期（可空）；保存最新一条后把 nextFollowupDate 同步到 Client。**易错点**：删除最新记录后客户跟进日期要回退到次新记录的值（或空）。
- [ ] **T4c-4 首页联动核对**（FR-33）：跟进日期=今天 → 派生事项；前 3 天 → 进摘要卡计数；首页勾选只清 nextFollowupDate（AC-32）；删客户级联删记录（确认框写明 N 条，可撤销）。

### P4d 健身计划（FR-34 ~ FR-37）

- [ ] **T4d-1 本周模板页签**（FR-34）：七天格子编辑训练名、动作列表（名称、组数×次数或时长）、休息日开关；改模板只写 templates，**绝不触碰历史 WorkoutLog**（AC-35）；清空格子不算删除不弹确认。
- [ ] **T4d-2 打卡页签**（FR-35）：按天倒序；"今天打卡"按当天 dayOfWeek 从模板带出初始记录，可改组数/重量/时长、加动作、标"没练"；日期可改补记（FR-8）；删除打卡走撤销条。
- [ ] **T4d-3 体重页签**（FR-36）：今天体重输入框（同 date 已存在则覆盖，一天一条取最后）；30 天折线用内联 SVG 按最近 30 天数据画点连线（无库）；历史列表可改；首页健身卡"已练/未练"口径 = 当天 WorkoutLog 存在且未 skipped。

### P4e 饮食计划（FR-38 ~ FR-41）

- [ ] **T4e-1 按天五区块**（FR-38）：日期切换头（默认今天可补记）；早/午/晚/加餐四个区块各为"条目列表 + 回车即加的输入框"；喝水区一排杯子图标（数量 = settings.waterGoal），点第 N 个杯子设 cups=N，再点第 N 个取消为 N-1。
- [ ] **T4e-2 餐食模板**（FR-39）：任意已记餐食"存为模板"（起名）；"从模板填入"弹列表一键整套填入；右上角模板管理（改名/删除，删除可撤销）。
- [ ] **T4e-3 首页联动核对**（FR-41 + FR-14）：摘要"已记 N 餐 · 喝水 M/目标 杯"；首页「喝水 +1」与本页 WaterLog 是同一数据（AC-16）；饮食不产今日事项，无需接 todoEngine。

### P4f 游戏娱乐（FR-42 ~ FR-44）

- [ ] **T4f-1 三状态页签 + CRUD**（FR-42）：在玩/想玩/已通关；卡片显示名称、累计时长（Game.totalMinutes 冗余）、进度备注、在玩卡另显本周时长；新建默认想玩；转已通关时引导填通关日期（默认今天）与评价（可空）；删除确认+撤销，时长明细级联。
- [ ] **T4f-2 时长打卡**（FR-43）：在玩卡"打卡"输入分钟数，日期默认今天可改补记；保存 GameSession 后重算 totalMinutes。**易错点**：补记/改删历史 session 后必须重算冗余值，不能只做增量。
- [ ] **T4f-3 首页联动核对**（FR-44）：本周（周一至今，含今天）所有 GameSession.minutes 求和显示"本周已玩 X 小时"（分钟换算小时保留 1 位小数）；上周数据不计入（AC-45）。

### P5 设置与备份恢复

- [ ] **T5-1 设置页四区块布局**：备份与恢复 / 外观 / 模块显示开关 / 偏好，卡片式单页。
- [ ] **T5-2 外观切换**（FR-50）：深/浅两档即时生效（接 P2 主题机制），写入 settings.theme；默认浅色。
- [ ] **T5-3 模块开关**（FR-51）：七个开关（首页、设置无开关）；关闭后导航隐藏、首页不显示该卡、todoEngine 派生时跳过该模块；附提示"隐藏期间数据仍在，重新开启即恢复"。**易错点**：隐藏只过滤展示与派生，任何数据不得删除（AC-50）。
- [ ] **T5-4 偏好**（FR-52）：翻篇时间 0/4 两档（改后全站 today() 立即变口径）；喝水目标杯数（改后饮食页杯子排与首页摘要同步，AC-42）。
- [ ] **T5-5 备份/恢复/清空/欢迎引导**（FR-46/47/48/49）：导出备份→提示文件位置；恢复→列表（仅 data 目录、时间倒序）→强确认（文案写明不可撤销+先自动应急备份）→ 完成后提示"恢复完成，请刷新页面"（**无撤销条**，AC-51）；清空→红色按钮→输入"清空"二字→自动备份→写初始结构→welcomed 重置回欢迎引导；首次使用（welcomed=false）显示三句话引导 + "开始使用"按钮。

### P6 联调与验收

- [ ] **T6-1 AC 全量走查**：按第 5 节"AC 挂载表"逐条执行，结果记录在每条后打勾。
- [ ] **T6-2 边界专项**：① 系统时间调 3:59/4:01 验证翻篇（AC-8）；② 补记前天的打卡/餐食/时长/日志各一条（AC-9）；③ 占用 8000~8005 端口后启动验证自动换端口与终端提示；④ 全程断网走一遍主流程（AC-5）。
- [ ] **T6-3 健壮性专项**：① 手改 app-data.json 为非法 JSON 后启动 → 不崩、有错误提示、数据不丢（原文件保留）；② 保存过程中强杀服务 → 重开后数据至多丢最后一次未落盘编辑；③ 连续快速编辑 20 个字段验证防抖合并无丢写。

---

## 4. 实施顺序与并行建议

### 4.1 串行关键路径（决定整体进度，不能跳）

```
T0-2/T0-4（服务与数据初始化）
 → T1-2/T1-4（落盘链路：原子写 + store 防抖）
  → T2-2/T2-3（面板 + 确认/撤销公共件）
   → T3-1/T3-2（todoEngine 派生与写回）
    → T4a/T4b/T4c（三个产今日事项的模块）
     → T5-3（模块开关，验证隐藏过滤）
      → T6-1（全量验收）
```

### 4.2 可并行项

| 组合 | 说明 |
|---|---|
| P0 的 T0-5 与 T1-1~T1-3 | 骨架页与后端接口互不依赖 |
| P2 全部六个任务 | 不同文件（panel/dialog/undo/toast/css），可并行，最后合一次 components.css |
| P4a ~ P4f 六条子线 | 各自的 views/*.js 文件完全独立；只要 P3 把 todoEngine 接口与路由参数约定冻结，六条线可任意顺序/并行 |
| P4d/P4e/P4f 与 T5-1/T5-2/T5-4 | 生活三模块不产今日事项，与设置页大部分工作无冲突 |
| P6-2 边界专项与 P5 收尾 | 端口、断网专项不依赖设置页 |

### 4.3 必须串行（共享同一文件/数据模型，排后做）

- **store.js / utils.js / todoEngine.js**：全 App 唯一数据源与日期口径，只允许在 P1/P3 各动一次，P4 阶段任何人不得再改其对外接口（发现缺能力 → 新增函数，不改签名）。
- **css/components.css**：P2 搭好后，P4 各模块只允许追加自己的 class 段，不改已有选择器。
- **todoEngine 与 P4a/4b/4c 的联动**：P3 用手塞数据定死派生规则与写回行为后，P4 只做"真实页面触发同一函数"的验证，不允许在 P4 里改派生口径（改了首页和今日计划要全部重测）。
- **T5-3 模块开关**：必须等六张速览卡都存在（P4 全部完成）后再做，否则 AC-50 无法完整验证。

---

## 5. 每阶段验证方式与 AC 挂载

### P0 验证

| 操作 | 预期 | 覆盖 |
|---|---|---|
| 双击启动.bat | 终端显示 `http://localhost:端口`，浏览器自动打开 | AC-1 |
| 删除 data 目录后重启 | 自动重建并含初始 app-data.json | AC-2 前半 |
| 预占 8000 端口再启动 | 自动换到 8001 且终端提示 | AC-1 附属 |

### P1 验证

| 操作 | 预期 | 覆盖 |
|---|---|---|
| 调 mutate 改一条数据，等 400ms | app-data.json 内容更新 | FR-3 |
| 新增数据 → 杀服务 → 重启 | 数据仍在 | AC-3 |
| 复制 app-data.json 到桌面，逐字节比对 | 完全一致 | AC-4 |
| POST /api/backup | data/ 出现 backup-YYYYMMDD-HHmm.json | FR-47 后端 |

### P2 验证

| 操作 | 预期 | 覆盖 |
|---|---|---|
| 测试表单失焦 | 300ms 内出现"已保存 HH:MM"，刷新仍在 | AC-6 |
| 测试删除 → 确认 → 4 秒内撤销 | 完整恢复；不撤销 5 秒后刷新仍无 | AC-7 |
| 停掉服务模拟保存失败 | 顶部红横幅，表单内容不丢 | FR-6 |
| body 切 data-theme=dark | 全站变暗 | FR-50 机制 |

### P3 验证（手塞源数据）

| 操作 | 预期 | 覆盖 |
|---|---|---|
| JSON 里放一条 scheduledDate=今天的待发布内容 → 开首页 | 出现"发布：《标题》"带来源标签 | AC-11 |
| 首页勾选 → 展开已完成 → 取消勾选 | 收起/恢复正确 | AC-12 |
| 备忘回车 → 转待办 | 备忘置顶、标"已转"，事项区出现临时事项 | AC-13 |
| 首页「喝水 +1」三次 | 饮食卡杯数即时 +3，JSON 中 WaterLog 同步 | AC-16 |
| 三段分组显示、临时事项行内创建 | 分组与排序正确 | AC-17 |
| 留 2 条未完成点日终整理 | 顺延明天，首页消失，明天可见；5 秒内撤销全回来 | AC-19 |
| 日期翻到昨天 | 只读 | AC-21 |
| 临时事项可删、模块事项无删除入口 | 符合 | AC-20 |

### P4 验证

| 子线 | 操作 → 预期 | 覆盖 |
|---|---|---|
| P4a | 新建选题进选题池；拖拽换列状态同步 | AC-22 |
| P4a | 拖入已发布弹确认表单，链接留空可确认 | AC-23 |
| P4a | 全屏写稿写大纲正文，关闭重开仍在 | AC-24 |
| P4a | 回填播放/点赞/评论，刷新后保留 | AC-25 |
| P4a | 首页勾选发布事项 → 卡片进已发布（无链接） | AC-26 |
| P4b | 新建项目，勾任务进度条实时变化 | AC-27 |
| P4b | 任务拖拽排序、已完成折叠 | AC-28 |
| P4b | "记一笔今天"回车 → 首页开发卡"已写" | AC-29 |
| P4b | 截止今天的任务 → 首页事项 → 勾选同步完成 | AC-30 |
| P4c | 记一条含明天跟进日期的咨询 → 客户卡同步该日期 | AC-31 |
| P4c | 跟进日期=今天 → 首页事项与摘要数 +1；勾选后提醒清、摘要 -1、无新咨询记录 | AC-32 |
| P4c | 跟进日期=3 天后 → 进摘要计数 | AC-33 |
| P4c | 删有 3 条记录的客户 → 撤销完整恢复 | AC-34 |
| P4d | 改周一模板 → 下个周一打卡带出；历史打卡不变 | AC-35 |
| P4d | 今天打卡改重量加动作 → 首页"已练"；标"没练"→"未练" | AC-36/37 |
| P4d | 3 个日期体重 → 折线 3 点正确；同日两次取最后 | AC-38 |
| P4e | 早餐回车"燕麦 + 鸡蛋" → 首页"已记 1 餐" | AC-39 |
| P4e | 存为模板 → 换天从模板填入整套 | AC-40 |
| P4e | 点 5 杯 → 首页 5/8；取消 1 → 4/8 | AC-41 |
| P4f | 状态流转 想玩→在玩→已通关，引导填日期与评价 | AC-43 |
| P4f | 打卡 60 分钟 + 补记昨天 30 → 累计 90 | AC-44 |
| P4f | 本周多次打卡 → 首页"本周已玩 X 小时"一致；上周不计入 | AC-45 |
| P4a~f | 各卡快捷入口跳转并自动打开/聚焦目标表单 | AC-15 |

### P5 验证

| 操作 | 预期 | 覆盖 |
|---|---|---|
| 清空 data 后重启 | 欢迎引导三句话，点后不再出现 | AC-2 |
| 导出备份 | data/ 出现带时间戳文件并提示位置 | AC-46 |
| 改数据 → 从备份恢复 | 强确认 → 先生成 backup-before-restore-* → 恢复后刷新数据完全一致 | AC-47 |
| 恢复列表来源检查 | 只显示 data 目录内备份 | AC-48 |
| 清空数据 | 必须输入"清空"→ 自动备份 → 归零回欢迎引导 | AC-49 |
| 隐藏游戏模块 | 导航/首页卡/事项全消失；重开后数据完整 | AC-50 |
| 恢复操作全程 | 无撤销条出现 | AC-51 |
| 深浅色切换 | 即时生效，默认浅色 | AC-10 |
| 喝水目标改 10 | 首页与饮食页同步 /10 | AC-42 |

### P6 验证

T6-1（AC 全量）、T6-2（AC-5/8/9 + 端口）、T6-3（损坏 JSON、强杀、快速连写）见任务清单；全部通过后 v1 完成。

---

## 6. 风险与兜底

| # | 风险 | 触发场景 | 应对 |
|---|---|---|---|
| R1 | 浏览器缓存旧静态文件 | 改完 JS 页面不变 | server.py 全部响应加 `Cache-Control: no-store`；调试期强刷（Ctrl+F5）写入操作手册 |
| R2 | JSON 并发/中途写坏 | 保存中强杀服务、断电 | 服务端写锁串行化 + tmp 文件 + `os.replace` 原子替换；启动时读不到合法 JSON 不覆盖原文件，提示并保留现场 |
| R3 | 数据迁移 | 后续版本加字段旧文件读不了 | 顶层 `version` 字段（v1=1）；server 启动时若 version 缺失/偏低则按迁移表补默认字段后升级；备份文件同样带 version |
| R4 | 凌晨 4 点翻篇口径不一致 | 各视图各自 `new Date()` 导致 AC-8 翻车 | "今天"判定唯一入口 `utils.today()`，代码评审时 grep `new Date(` 只允许出现在 utils.js；P6-2 调系统时间专项验证 |
| R5 | 误删/误恢复 | 删错客户带 3 条记录、恢复错备份 | 删除一律"挂起 5 秒"而非先删后恢复（撤销=取消挂起，天然完整恢复）；恢复前强制 `backup-before-restore-*`；恢复是唯一不可撤销操作，弹窗文案明示 |
| R6 | 端口占用 | 8000 被别的程序占 | 启动时递增探测（最多 20 个），终端打印最终地址；`webbrowser.open` 用最终端口 |
| R7 | 整文档读写覆盖冲突 | 两个浏览器标签同时改 | 前端每次保存带上次加载的 `updatedAt` 指纹，不一致时以后写为准并提示（单用户场景可接受）；store 保存前合并而非整盖（v1 简化：后写覆盖+提示横幅） |
| R8 | beforeunload 丢最后一次编辑 | 输入后直接关标签 | 长文本 1s 防抖已覆盖大部分；beforeunload 时 `sendBeacon` 兜底发送脏数据 |
| R9 | 派生事项与源实体不同步 | 源实体改了，首页没刷新 | 派生是查询时计算、不落盘，天然同步；视图层任何 mutate 后重渲染本页 + 首页速览（单页应用内直接调 render） |
| R10 | 撤销窗口内服务重启 | 挂起的删除未提交 | 挂起只存在于内存，重启后条目仍在 = 安全方向（最坏结果是"以为删了实际没删"，可从撤销条文案规避：超时前明确提示"将在 N 秒后删除"） |

---

## 7. 总进度表

| 阶段 | 任务数 | 细化步数（附录 E） | 涉及 FR | 涉及 AC | 状态 |
|---|---|---|---|---|---|
| P0 环境与骨架 | 5 | 9 | FR-45、FR-46（半） | AC-1、AC-2（半） | ☐ |
| P1 数据层与持久化 | 5 | 14 | FR-3、FR-7（基础）、FR-46/47/48/49（后端） | AC-3、AC-4 | ☐ |
| P2 全局框架与导航 | 6 | 13 | FR-1、FR-2、FR-4、FR-5、FR-6、FR-50（机制） | AC-6、AC-7 | ☐ |
| P3 首页与今日计划 | 7 | 17 | FR-9 ~ FR-19、FR-24/29/33（机制） | AC-11~13、16、17、19~21 | ☐ |
| P4a 自媒体 | 6 | 11 | FR-20 ~ FR-25 | AC-22 ~ AC-26、AC-15（部分） | ☐ |
| P4b 开发工作 | 4 | 9 | FR-26 ~ FR-29 | AC-27 ~ AC-30 | ☐ |
| P4c 咨询工作 | 4 | 8 | FR-30 ~ FR-33 | AC-31 ~ AC-34 | ☐ |
| P4d 健身计划 | 3 | 8 | FR-34 ~ FR-37 | AC-35 ~ AC-38 | ☐ |
| P4e 饮食计划 | 3 | 5 | FR-38 ~ FR-41、FR-14 | AC-39 ~ AC-41 | ☐ |
| P4f 游戏娱乐 | 3 | 6 | FR-42 ~ FR-44 | AC-43 ~ AC-45 | ☐ |
| P5 设置与备份恢复 | 5 | 10 | FR-46（半）、FR-47 ~ FR-52 | AC-2（半）、AC-10、AC-42、AC-46 ~ AC-51 | ☐ |
| P6 联调与验收 | 3 | 9 | 全部复核 | AC-1 ~ AC-51 全量 | ☐ |
| **合计** | **54** | **119** | FR-1 ~ FR-52 全覆盖 | AC-1 ~ AC-51 全覆盖 | — |

> FR-8（按天数据日期可改补记）落在各模块任务内（T4d-2/T4e-1/T4f-2/T4b-3），由 AC-9 在 P6-2 统一验证。FR-13 快捷入口分挂在 T3-7 与各 P4 模块，AC-15 在 P4 验证。

---

# 附录 A　接口契约（server.py 全部 HTTP 接口）

## A.0 通用约定

- 全部接口 Content-Type 为 `application/json; charset=utf-8`；静态资源带 `Cache-Control: no-store`。
- 成功响应一律含 `"ok": true`；错误响应一律为 `{"ok": false, "error": {"code": "错误码", "message": "人类可读信息"}}`。
- **写指纹**：服务端每次成功写盘生成新的 `updatedAt`（ISO 本地时间字符串），GET/POST 均返回；客户端写请求必须回传 `baseUpdatedAt`，不一致返回 409（单用户场景按"后写为准"处理，前端提示即可，见 R7）。
- 服务端对所有写操作加同一把 `threading.Lock`；写盘固定流程：写 `app-data.json.tmp` → `os.replace(tmp, 正式)`。

## A.1 接口一览

| # | 路径 | 方法 | 请求体 | 成功响应（200） | 错误 |
|---|---|---|---|---|---|
| A1 | /api/health | GET | — | `{"ok":true,"version":1,"dataFile":"data/app-data.json","port":8001}` | — |
| A2 | /api/data | GET | — | `{"ok":true,"updatedAt":"...","data":{全量数据}}` | 500 `DATA_CORRUPT`（文件非法 JSON，**不覆盖原文件**） |
| A3 | /api/data | POST | `{"baseUpdatedAt":"...","data":{全量数据}}` | `{"ok":true,"updatedAt":"新值"}` | 400 `INVALID_JSON` / 400 `INVALID_SHAPE`（缺顶层键或 version 非整数）/ 409 `CONFLICT`（带 serverUpdatedAt）/ 500 `WRITE_FAILED` |
| A4 | /api/backup | POST | `{}` | `{"ok":true,"file":"backup-YYYYMMDD-HHmm.json","dir":"data/"}` | 500 `BACKUP_FAILED` |
| A5 | /api/backups | GET | — | `{"ok":true,"backups":[{"file":"...","mtime":"...","size":字节}]}`（按文件名时间倒序，仅 data 目录内 `backup*.json`） | — |
| A6 | /api/restore | POST | `{"file":"backup-xxx.json"}` | `{"ok":true,"emergencyBackup":"backup-before-restore-YYYYMMDD-HHmm.json"}` | 400 `FILE_NOT_FOUND` / 400 `OUTSIDE_DATA_DIR` / 400 `INVALID_BACKUP`（非合法 JSON 或无 version 字段）/ 500 `RESTORE_FAILED` |
| A7 | /api/clear | POST | `{}` | `{"ok":true,"autoBackup":"backup-before-clear-YYYYMMDD-HHmm.json"}` | 500 `CLEAR_FAILED` |
| A8 | / 与 /static/* | GET | — | index.html / 静态文件 | 404 |

## A.2 关键接口流程

**A6 恢复（顺序不可换）**：
1. 校验 `file` 解析后的绝对路径父目录 == data 目录绝对路径（拒绝 `../` 与绝对路径穿越）；
2. 校验文件名匹配 `backup*.json` 且内容为合法 JSON 且含整数 `version`；
3. 把服务端当前内存数据先落盘，再复制为 `backup-before-restore-YYYYMMDD-HHmm.json`（同名追加 `-2`）；
4. 用备份内容原子替换 app-data.json，更新内存数据与 `updatedAt`；
5. 返回成功；前端提示"恢复完成，请刷新页面"，用户确认后 `location.reload()`。

**A7 清空（顺序不可换）**：自动备份为 `backup-before-clear-*.json` → 用初始结构（T0-4b 工厂函数）原子覆盖 → settings.welcomed 重置为 false → 返回。

**A4 文件名生成**：`backup-` + 本机时间 `YYYYMMDD-HHmm` + `.json`；同一分钟已存在则依次 `-2`、`-3` 后缀。

---

# 附录 B　数据文件结构（data/app-data.json schema）

## B.0 通用约定

- 所有实体含三个公共字段：`id`（string，前端 `uid()` 生成）、`createdAt`、`updatedAt`（ISO 本地时间字符串），下表不再重复列出。
- 日期字段一律 `"YYYY-MM-DD"` 字符串；日期时间用 `"YYYY-MM-DDTHH:MM"`（本机时间，无时区）。
- 数组与对象字段不允许 `null`，空值用 `[]` / `""` / `0`；可空日期用 `null`。
- 顶层固定结构：

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

## B.1 今日计划 / 首页

**TodoItem（todos，仅存 manual 临时事项；派生事项不落盘，见附录 D2）**

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| title | string | 是 | — | 唯一硬性校验：非空 |
| source | string | 是 | `"manual"` | 固定 manual（memo 转来的也是 manual） |
| sourceId | string\|null | 是 | `null` | manual 恒为 null |
| planDate | date | 是 | 今天 | 日终整理改的就是它 |
| timeSlot | string | 是 | `"afternoon"` | morning / afternoon / evening |
| priority | string | 是 | `"normal"` | high / normal |
| done | bool | 是 | `false` | |
| doneAt | string\|null | 是 | `null` | 勾选时写入，取消清空 |

**Memo（memos）**

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| text | string | 是 | — | 纯文本 |
| convertedToTodo | bool | 是 | `false` | 转待办后标"已转" |
| todoId | string\|null | 是 | `null` | 指向生成的 TodoItem.id |

## B.2 自媒体（contents，ContentItem）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| title | string | 是 | — | |
| platforms | string[] | 是 | `[]` | 多选，如 ["bilibili","wechat","xhs"]，取值集合在前端常量 |
| status | string | 是 | `"idea"` | idea / writing / scheduled / published |
| outline | string | 是 | `""` | 长文本，全屏写稿页左栏 |
| body | string | 是 | `""` | 长文本，全屏写稿页右栏 |
| scheduledDate | date\|null | 是 | `null` | status=scheduled 必填（前端约束） |
| publishedDate | date\|null | 是 | `null` | 转入已发布时写入 |
| link | string | 是 | `""` | **允许为空**（PRD 口径 8） |
| metrics | object | 是 | 见下 | `{views:0, likes:0, comments:0, metricsUpdatedAt:null}`，三个数字为 int≥0 |

## B.3 开发工作

**DevProject（devProjects）**：`name`（string，必填）、`intro`（string，默认 `""`）、`status`（string，默认 `"active"`，active/paused/done）。

**DevTask（devTasks）**：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| projectId | string | 是 | — | → DevProject.id，删项目级联删除 |
| title | string | 是 | — | |
| note | string | 是 | `""` | |
| dueDate | date\|null | 是 | `null` | =今天且未完成 → 派生今日事项 |
| priority | string | 是 | `"normal"` | high / normal |
| done | bool | 是 | `false` | |
| order | int | 是 | 末尾序号 | 拖拽排序维护，同项目内升序展示 |

**DevLog（devLogs）**：`projectId`（必填，级联删除）、`date`（date，必填）、`content`（string，默认 `""`）、`blocker`（string，默认 `""`）。**唯一约束：(projectId, date)**，重复创建 = 更新已有记录。

## B.4 咨询工作

**Client（clients）**：`name`（string，必填）、`contact`（string，`""`）、`source`（string，`""`）、`requirement`（string，`""`）、`status`（string，默认 `"following"`，following/deal/paused）、`nextFollowupDate`（date\|null，`null`）。

**ConsultSession（consultSessions）**：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| clientId | string | 是 | — | → Client.id，删客户级联删除 |
| datetime | string | 是 | 当前时间 | `"YYYY-MM-DDTHH:MM"` |
| topic | string | 是 | `""` | 议题 |
| conclusion | string | 是 | `""` | 结论 |
| nextStep | string | 是 | `""` | 下一步行动 |
| nextFollowupDate | date\|null | 是 | `null` | 保存后最新一条的该值同步到 Client.nextFollowupDate |

## B.5 健身

**WorkoutTemplate（workoutTemplates，固定 7 条，初始化生成 dayOfWeek=1..7）**：`dayOfWeek`（int，1=周一）、`title`（string，`""`）、`isRestDay`（bool，`false`）、`exercises`（object[]，`[]`），动作元素结构 `{name:"", sets:3, reps:10, durationMinutes:null}`（reps 与 durationMinutes 二选一）。

**WorkoutLog（workoutLogs）**：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| date | date | 是 | 今天 | 可改补记；同一天允许多条？——**否，同一天至多一条**，重复打卡 = 编辑已有（见 W7 待确认） |
| title | string | 是 | `""` | 从模板带出训练名 |
| skipped | bool | 是 | `false` | "没练"标记 |
| exercises | object[] | 是 | `[]` | `{name, sets:[{weight:0, reps:0}], durationMinutes:null}`，sets 数组为空且 durationMinutes 有值 = 计时类动作 |

**WeightEntry（weightEntries）**：`date`（date，必填，**唯一**）、`weight`（number，kg，保留 1 位小数）。同日重复录入 = 覆盖。

## B.6 饮食

**MealLog（mealLogs）**：`date`（date，必填）、`mealType`（string，breakfast/lunch/dinner/snack）、`items`（string[]，`[]`）。同一 (date, mealType) 只有一条记录，回车加菜 = push 到 items。

**MealTemplate（mealTemplates）**：`name`（string，必填）、`items`（string[]）。

**WaterLog（waterLogs）**：`date`（date，必填，**唯一**）、`cups`（int，默认 0，上限 = settings.waterGoal，前端约束）。

## B.7 游戏娱乐

**Game（games）**：`name`（string，必填）、`status`（string，默认 `"wishlist"`，playing/wishlist/finished）、`progress`（string，`""`）、`finishedDate`（date\|null，`null`）、`review`（string，`""`）、`totalMinutes`（int，默认 0，**冗余字段**＝该游戏所有 GameSession.minutes 之和，增删改 session 后全量重算）。

**GameSession（gameSessions）**：`gameId`（必填，级联删除）、`date`（date，必填，可补记）、`minutes`（int>0）。

## B.8 设置（settings，单对象）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| theme | string | `"light"` | light / dark |
| dayRolloverHour | int | `4` | 仅 0 或 4 |
| waterGoal | int | `8` | 每天喝水目标杯数 |
| hiddenModules | string[] | `[]` | 取值：selfmedia/dev/consult/fitness/diet/game/today 中任意子集 |
| welcomed | bool | `false` | false → 启动显示欢迎引导 |

## B.9 实体关系与级联

```
DevProject 1──n DevTask、DevLog        删项目级联（确认文案"其下任务与日志一并删除"）
Client     1──n ConsultSession          删客户级联（确认文案带记录数 N）
Game       1──n GameSession             删游戏级联
Memo       0..1→ TodoItem               转待办建立 todoId 关联，备忘保留
派生 TodoItem ─→ ContentItem/DevTask/Client   查询时生成不落盘，源删则事项消失（天然级联）
Client.nextFollowupDate ← 最新 ConsultSession.nextFollowupDate（删除最新记录后的回退规则见 W5）
```

## B.10 schema 版本与升级策略

- `version` 当前 = 1。加载时：缺失或 < 1 → 用 T0-4b 工厂函数的默认值补齐缺失顶层键与 settings 字段后视为 v1；> 1 → 拒绝启动写操作，前端弹错误提示（防止新版本文件被旧版本覆盖）。
- 未来升级规则（预留）：每次结构变更 version +1，并在 server.py 内登记 `MIGRATIONS = {1: migrate_1_to_2, ...}`，加载时按版本链式执行；备份文件同结构同规则。
- 任何字段只允许"新增带默认值"或"废弃保留"，禁止改名复用旧字段，保证旧备份可恢复。

---

# 附录 C　前端结构细化

## C.1 index.html 页面骨架

```html
<body data-theme="light">
  <aside id="nav"></aside>        <!-- 四组九项，T2-1 -->
  <main id="view"></main>         <!-- 路由视图挂载点 -->
  <div id="panel-root"></div>     <!-- 侧滑面板挂载点，全局唯一 -->
  <div id="dialog-root"></div>    <!-- 确认框 -->
  <div id="undo-root"></div>      <!-- 底部撤销条 -->
  <div id="toast-root"></div>     <!-- 顶部横幅 -->
  <script type="module" src="/static/js/main.js"></script>
</body>
```

## C.2 组件清单与复用范围

| 组件 | 文件 | 使用方 |
|---|---|---|
| Panel 侧滑面板 | ui/panel.js | 除全屏写稿、开发日志行内编辑、今日计划行内创建外全部新建/编辑场景 |
| Dialog 确认框（含 requireText 强确认） | ui/dialog.js | 所有删除、日终整理、发布确认、通关引导、恢复/清空 |
| UndoBar 撤销条 | ui/undo.js | 所有删除 + 日终顺延 |
| Toast 横幅 | ui/toast.js | 保存失败红横幅、备份/恢复成功提示 |
| Toolbar 工具栏（搜索+筛选） | views 内共用 class | 各自媒体/咨询等列表页 |
| EmptyState 空状态 | views 内共用函数 | 所有空列表 |
| OverviewCard 速览卡 | views/home.js 内部 | 首页六卡 |

## C.3 路由表与跳转参数约定

| 路由 | 视图 | 查询参数（快捷入口用） |
|---|---|---|
| #/home | home.js | — |
| #/today | today.js | `?date=YYYY-MM-DD`（默认今天） |
| #/selfmedia | selfmedia.js | `?new=1`（开新建选题面板）、`?open=:id`（开该卡详情） |
| #/selfmedia/write/:id | selfmedia.js 全屏写稿 | — |
| #/dev | dev.js | `?log=1`（展开当天日志输入框） |
| #/consult | consult.js | `?new=1`、`?open=:id&compose=1`（开客户面板并展开记录表单） |
| #/fitness | fitness.js | `?tab=plan|logs|weight`、`?checkin=1`、`?focus=weight` |
| #/diet | diet.js | `?focus=nextmeal` |
| #/game | game.js | `?checkin=1`（打开第一个在玩游戏的打卡表单） |
| #/settings | settings.js | — |

## C.4 各模块列表/面板/编辑态字段绑定

> "失焦 300ms"= 走 store 普通防抖；"停顿 1s"= 长文本防抖；"变更即存"= select/checkbox/date 的 change 事件立即标脏。

**自媒体（selfmedia.js）**

| 区域 | 字段 → 控件 → 数据路径 → 保存时机 |
|---|---|
| 看板卡 | title/platforms/status（列）/scheduledDate/publishedDate+metrics 摘要，只读展示 |
| 详情面板 | title→text→`contents[i].title`→失焦；platforms→多选 chip→`.platforms`→变更即存；status→下拉→`.status`→变更即存（选 published 时改走发布确认弹窗流程）；scheduledDate→date→`.scheduledDate`→变更即存；link→text→`.link`→失焦 |
| 全屏写稿页 | outline→左 textarea→`.outline`→停顿 1s；body→右 textarea→`.body`→停顿 1s |
| 数据回填区 | views/likes/comments→number→`.metrics.*`→失焦，同时写 `.metrics.metricsUpdatedAt` |

**开发工作（dev.js）**

| 区域 | 字段绑定 |
|---|---|
| 项目列表 | name 只读 + 进度条（done 任务数/总数实时计算） |
| 项目面板 | name→text（必填）、intro→textarea（1s）、status→下拉（active/paused/done） |
| 任务行（列表内直接编辑） | done→checkbox；title→text；dueDate→date；priority→下拉；note→面板 textarea；拖拽把手→改 `order` |
| 日志页签 | "记一笔今天"输入框回车建当天 DevLog（content）；已有日志行内展开：content/blocker→textarea→停顿 1s（**行内编辑为例外，见 W3**） |

**咨询工作（consult.js）**

| 区域 | 字段绑定 |
|---|---|
| 客户卡 | name/requirement/nextFollowupDate（≤3 天橙框）/最近咨询日期，只读 |
| 详情面板（50%） | name→text、contact→text、source→text、requirement→textarea（1s）、status→下拉；nextFollowupDate 只读展示（只能由咨询记录同步，不提供直接编辑） |
| 记一次咨询表单（面板内展开） | datetime→datetime-local（默认当前）、topic/conclusion/nextStep→textarea（1s）、nextFollowupDate→date（可空）；保存即插到时间线最上并同步 Client |

**健身计划（fitness.js）**

| 页签 | 字段绑定 |
|---|---|
| 本周计划 | 7 格：title→text、isRestDay→checkbox、exercises 动作行（name/sets/reps 或 durationMinutes）→失焦保存；清空格子直接保存不弹确认 |
| 打卡记录 | "今天打卡"按钮→按 dayOfWeek 从模板复制初始 WorkoutLog；表单：date→date、skipped→checkbox、每动作 sets 数组（weight/reps 数字行）或 durationMinutes；临时加动作按钮 |
| 体重 | 今日输入框（number，同日覆盖）；历史列表行内改值；SVG 折线只读 |

**饮食计划（diet.js）**：日期头 date→切换重渲染；四餐区各一个"回车加条目"输入框（push 到 `mealLogs[(date,mealType)].items`）；每条目"存为模板"按钮；喝水区杯子排（第 N 杯点击 → `waterLogs[date].cups = N`，再点 → N-1）。

**游戏娱乐（game.js）**：页签按 status 过滤；卡片打卡按钮→弹表单（minutes→number、date→date 默认今天）；详情面板：name/progress→text、status→下拉（选 finished 时弹引导表单填 finishedDate/review，可留空）。

**设置（settings.js）**：theme→单选两档；dayRolloverHour→单选 0/4；waterGoal→number（1~30）；hiddenModules→七个 checkbox；备份/恢复/清空按钮各接对应接口流程。

## C.5 状态流转

**通用实体生命周期**：

```
新建（面板空表单，首个必填字段失焦后才真正创建落盘）
 → 编辑（自动保存循环）
 → 删除（确认框 → 挂起 5s〔撤销条〕→ 撤销：恢复原位 / 超时：真正移除并落盘）
```

**勾选完成流转（TodoItem 与派生事项）**：未勾选 → 勾选（写回 done/源字段，doneAt=now，收起到已完成区）→ 当天取消勾选（反向写回，回到原分组）。派生事项反向写回规则见 W1 待确认。

**自媒体状态机**：`idea → writing → scheduled → published`；看板拖拽与面板下拉共用同一入口；进 published 必经确认弹窗；published 允许回退（面板改状态），metrics/publishedDate 保留。

**客户跟进提醒生命周期**：记录写入 nextFollowupDate →（前 3 天）进摘要卡 →（到期当天）派生今日事项 → 首页勾选 → Client.nextFollowupDate 清空（提醒消失，不产生咨询记录）。

---

# 附录 D　关键机制实现方案

## D.1 凌晨翻篇判定（utils.today，FR-7）

```text
function today(settings):
  now = new Date()                       // 本机时间，全 App 唯一允许取当前时间的入口
  d = datePart(now)
  if timePart(now) < settings.dayRolloverHour:00:   // 如 03:59 < 04:00
      d = d - 1 day                                   // 归"昨天"
  return d                                // "YYYY-MM-DD"
```

所有"今天/明天/昨天/本周/30 天"的计算都必须以 `today()` 的返回值加减天数得到，视图代码禁止直接 `new Date()` 取日期（代码评审 grep 约束，见 R4）。

## D.2 跨模块汇总取数（todoEngine，FR-9/16/24/29/33）

```text
function getTodosFor(date, data):
  result = []
  if "selfmedia" not in hiddenModules:
    for c in data.contents where c.status=="scheduled" and c.scheduledDate==date:
      result.push(derivedItem(source:"selfmedia", sourceId:c.id,
                   title:"发布：《"+c.title+"》", timeSlot:"afternoon",   // 见 W2
                   done:false /* 未完成才派生 */))
  if "dev" not in hiddenModules:
    for t in data.devTasks where t.dueDate==date and not t.done:
      p = findProject(t.projectId)
      result.push(derivedItem(source:"dev", sourceId:t.id,
                   title:"开发："+p.name+" - "+t.title, priority:t.priority))
  if "consult" not in hiddenModules:
    for cl in data.clients where cl.nextFollowupDate==date:
      result.push(derivedItem(source:"consult", sourceId:cl.id,
                   title:"跟进客户："+cl.name))
  result = result.concat(data.todos where planDate==date)   // manual 实体
  return groupByTimeSlot(result).sortBy(priority desc, createdAt asc)
```

- 派生事项的 `uid` 约定为 `src:{source}:{sourceId}`，供勾选与渲染 key 使用；**不写盘**。
- 勾选写回映射（toggleTodo）：

| source | 勾选为完成 | 取消勾选 |
|---|---|---|
| manual | todos[i].done=true, doneAt=now | done=false, doneAt=null |
| dev | devTasks[i].done=true | done=false |
| selfmedia | status→"published", publishedDate=today(), link 保持原值（可空） | 见 W1 待确认 |
| consult | clients[i].nextFollowupDate=null | 见 W1 待确认 |

**摘要卡取数**（FR-12，全部以 today() 为基准）：
- 自媒体：contents 中 scheduledDate=今天 → 未发（状态 scheduled）；publishedDate=今天 → 已发；否则"今天无发布计划"。
- 开发：devLogs 存在 (任一 projectId, date=今天) → "已写"。
- 咨询：clients 中 nextFollowupDate ∈ [今天, 今天+3天] 的计数 + 最近一个客户名。
- 健身：workoutLogs 存在 date=今天 且 skipped=false → "已练"+训练名；否则"未练"。
- 饮食：当天 4 类 mealType 中 items.length>0 的种数 N + waterLogs[今天].cups。
- 游戏：gameSessions 中 date ∈ [本周一, 今天] 的 minutes 求和 ÷60 保留 1 位小数。

## D.3 删除与 5 秒撤销（FR-4）

```text
confirmDelete(item, cascadeText):
  dialog.confirm(文案含对象名与级联影响)
  onConfirm:
    item._pendingDelete = true          // 内存标记，"_"开头字段在序列化时被剔除
    render()                            // 视图中过滤 _pendingDelete 项，条目立即消失
    undo.show(5s,
      onCommit: 从数组中真正移除 item（含级联子实体）→ store.save(),
      onUndo:   delete item._pendingDelete → render())
```

要点：① 挂起期间不落盘，撤销零成本完整恢复（含级联子树，因为级联只在 onCommit 时执行）；② 页面/服务 5 秒内重启 = 删除未发生，属安全方向（R10）；③ 恢复备份操作不走此机制（唯一不可撤销，AC-51）。

## D.4 自动保存（store.js，FR-3/FR-6）

```text
store.mutate(fn, opts): fn(data) 修改 → dirty=true → scheduleSave(opts.long ? 1000 : 300)
flush(): POST /api/data {baseUpdatedAt, data}
  成功 → savedAt=now → 回调 UI 显示"已保存 HH:MM" → dirty=false
  失败(网络/500) → toast 红横幅（FR-6 文案）→ 退避重试 2s/5s/10s → 保持 dirty，表单不动
  409 CONFLICT → 后写为准：用 serverUpdatedAt 重发一次，仍失败则横幅提示（R7）
beforeunload → navigator.sendBeacon("/api/data", 当前脏数据)   // R8 兜底
```

长文本判定：textarea（大纲/正文/日志/需求描述）输入事件用 `long:true`；其余控件一律 300ms。

## D.5 端口探测与切换（server.py，FR-45）

```text
for port in 8000..8019:
    try: 构造 HTTPServer(("127.0.0.1", port), Handler) → 成功则 break
    except OSError (errno 10048/98/13): 终端打印"端口 {port} 被占用，尝试下一个" → continue
全部失败 → 终端报错退出
打印 "已在 http://localhost:{port} 启动，数据文件：data/app-data.json"
threading.Timer(0.5, webbrowser.open(url)).start()   // 等服务起来再开浏览器
```

## D.6 备份文件名与恢复应急备份

生成规则见附录 A.4；恢复完整时序见附录 A.2。**易错点**：应急备份必须是"当前内存数据落盘后"的副本，不是磁盘上旧文件的复制（否则最近 300ms 内的编辑丢失）。

---

# 附录 E　任务粒度拆解（54 任务 → 119 步）

> 粒度已够的任务不拆；拆分步以 a/b/c 编号。每步预期 0.5~2 小时。"产出"列省略 static/ 前缀。

### P0（9 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T0-1a 环境确认 | 本机终端 | 版本记录 | `python --version` ≥ 3.8，中文路径下 python 可运行 |
| T0-2a 端口探测启动 | T0-1a | server.py 启动段（D.5） | 预占 8000 后启动自动用 8001，终端打印提示 |
| T0-2b 自动开浏览器 | T0-2a | server.py Timer 调用 | 双击启动后浏览器自动打开正确端口 |
| T0-3a 静态托管 | T0-2a | Handler 指向 static/ | `curl.exe http://localhost:端口/` 返回 200 HTML |
| T0-3b no-store 响应头 | T0-3a | end_headers 覆写 | 响应头含 `Cache-Control: no-store` |
| T0-4a ensureData() | — | server.py 初始化段 | 删 data/ 重启自动重建目录与文件 |
| T0-4b newEmptyData() | 附录 B | server.py 工厂函数 | 生成文件含全部顶层键、7 条模板、version=1，与 B.0 一致 |
| T0-5a 启动.bat | — | 启动.bat（chcp 65001 + python server.py + pause） | 双击可用，乱码消失 |
| T0-5b 骨架页与路由 | T0-3a | index.html + main.js hash 路由 | #/home…#/settings 九路由切换显示占位标题 |

### P1（14 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T1-1a GET /api/data | T0-4 | server.py A2 接口 | curl 返回 200 + 全量 JSON + updatedAt |
| T1-1b 损坏处理 | T1-1a | DATA_CORRUPT 分支 | 手改坏文件后接口报 500，原文件字节不变 |
| T1-2a 原子写 | T0-4 | server.py A3 写路径（锁+tmp+replace） | 脚本连续 50 次 POST 后文件始终为合法 JSON |
| T1-2b 指纹 409 | T1-2a | baseUpdatedAt 校验 | 旧指纹 POST 返回 409 且文件未变 |
| T1-3a /api/backup | T1-2a | A4 接口 | 连调两次生成不同文件名（`-2` 递增） |
| T1-3b /api/backups | T1-3a | A5 接口 | 只列 data 目录 backup*.json，倒序正确 |
| T1-3c /api/restore | T1-3b | A6 接口（A.2 时序） | 目录外路径 400；恢复后内容与备份一致且先生成应急备份 |
| T1-3d /api/clear | T1-2a | A7 接口 | 数据归零 + 自动备份存在 + welcomed=false |
| T1-4a api.js | A 附录 | js/api.js 7 个封装 | 浏览器控制台逐个调通 |
| T1-4b store 防抖 | T1-4a | js/store.js mutate+flush（D.4） | 连改 5 字段 300ms 内只发 1 次 POST |
| T1-4c 失败重试 | T1-4b | 退避重试+失败回调 | 停服务改数据→重试日志可见；恢复服务后落盘成功 |
| T1-4d 关闭兜底 | T1-4b | beforeunload sendBeacon | 输入后立即关标签，重开数据在（抽样 3 次） |
| T1-5a today() | D.1 | js/utils.js | 构造 3:59/4:01 断言归昨天/今天；rollover=0 时口径切换 |
| T1-5b 工具函数集 | — | addDays/fmtDate/weekStart(周一)/uid/debounce | 周一为周起点等断言全过 |

### P2（13 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T2-1a 导航渲染 | T0-5b | main.js 导航段 | 四组九项顺序与 PRD 2.1 一致，当前项高亮，设置置底 |
| T2-1b 窄屏抽屉 | T2-1a | layout.css 媒体查询 | <720px 收缩为抽屉可开合 |
| T2-1c 隐藏过滤口 | T2-1a | hiddenModules 过滤逻辑 | 手改 JSON 加入 "game" 后导航少一项 |
| T2-2a 面板开关 | — | ui/panel.js | 滑出/遮罩点击/关闭按钮/Esc 均正常 |
| T2-2b 宽度档与防嵌套 | T2-2a | width 参数+isOpen 守卫 | 40%/50% 正确；面板内再 open 被拒绝 |
| T2-3a 确认框 | — | ui/dialog.js（含 requireText） | requireText="清空" 时不输入二字确认键禁用 |
| T2-3b 撤销条+挂起 | D.3 | ui/undo.js | 挂起即消失、5s 内撤销恢复、超时真删且刷新后无 |
| T2-4a 已保存指示 | T1-4b | 面板右上角组件 | 失焦 300ms 内出现"已保存 HH:MM" |
| T2-4b 失败横幅 | T1-4c | ui/toast.js 接线 | 停服务改字段出红横幅，表单内容不丢 |
| T2-5a 主题变量 | — | base.css 双套变量 | 切 data-theme 全站变色，无遗漏硬编码颜色 |
| T2-5b setTheme() | T2-5a | store 内切换函数 | 切换即时生效且刷新保持 |
| T2-6a 工具栏+空状态 | — | components.css + 共用函数 | 空列表显示文案+新建按钮 |
| T2-6b N 快捷键 | T2-6a | main.js 键盘监听 | 列表页按 N 开新建面板；输入框聚焦时不触发 |

### P3（17 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T3-1a 三源派生 | T1-5a, D.2 | js/todoEngine.js derive | D.2 用例表全过；隐藏模块被跳过 |
| T3-1b 合并分组排序 | T3-1a | getTodosFor 完整版 | 三段分组 + 优先级 + 创建时间排序用例通过 |
| T3-2a 勾选写回四源 | T3-1a | toggleTodo（D.2 表） | 四源勾选后 JSON 源字段变化正确 |
| T3-2b 副作用细节 | T3-2a | selfmedia/consult 分支 | 勾选发布事项→published+日期写入+链接可空；勾选跟进→仅清日期无新记录 |
| T3-3a 页面布局 | T2-6a | views/today.js 骨架 | 日期头+三段+已完成区渲染正确 |
| T3-3b 行内创建 | T3-3a | 每段"+ 加一条" | 回车即建（标题必填），入 todos 数组 |
| T3-3c 日期翻页只读 | T3-3a | 左右箭头+只读模式 | 昨天整页不可勾选不可编辑（AC-21） |
| T3-3d 删除入口规则 | T2-3b | manual 删除按钮 | manual 可删走撤销条；派生事项无删除入口（AC-20） |
| T3-4a 日终顺延 | T3-3a | 快照+批量改明天 | 确认框带 N 计数；顺延项首页消失、明天可见 |
| T3-4b 撤销还原 | T3-4a | 快照还原逻辑 | 5s 内撤销全部回到今天（AC-19） |
| T3-5a 首页事项区 | T3-1b | views/home.js 区块 | 与今日计划页显示同一数据源 |
| T3-5b 收起动画 | T3-5a | CSS 过渡+已完成折叠区 | 勾选收起、展开回看、取消回组（AC-12） |
| T3-6a 备忘输入+列表 | — | home.js 备忘区 | 回车置顶显示，仅最近 10 条 |
| T3-6b 转待办+删除 | T3-2a | 转待办逻辑 | 生成 manual 事项、备忘标已转；删除走撤销条（AC-13） |
| T3-7a 六卡取数 | D.2 | 6 个 summary 函数 | AC-14 六种文案逐一核对一致 |
| T3-7b 快捷入口 | C.3 | 路由参数+自动打开 | 预置数据下各入口跳对页面且表单已打开 |
| T3-7c 喝水 +1 | T3-7a | 卡内直写逻辑 | 点 3 次杯数 +3，JSON 同步（AC-16） |

### P4a 自媒体（11 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T4a-1a 看板渲染 | T2-6a, T3-1a | selfmedia.js 看板 | 四列按 status 归位，卡片字段齐全 |
| T4a-1b 拖拽换列 | T4a-1a | HTML5 DnD 处理 | 拖拽即改 status 落盘（AC-22） |
| T4a-1c 已发布列表视图 | T4a-1a | 视图切换 | 按 publishedDate 倒序 |
| T4a-2a 发布确认弹窗 | T4a-1b | dialog 表单 | 日期默认今天、链接可空确认入列（AC-23） |
| T4a-2b 取消回滚 | T4a-2a | 取消分支 | 取消后卡片回原列状态不变 |
| T4a-3a 全屏写稿路由 | C.3 | write 页布局 | writing 卡片可进入，左大纲右正文 |
| T4a-3b 写稿自动保存 | T1-4b | 双 textarea 接线 | 关闭重开内容在（AC-24） |
| T4a-4a 详情面板 | T2-2a | 面板字段（C.4） | 失焦自动保存，已保存时间显示 |
| T4a-4b 数据回填区 | T4a-4a | metrics 三框 | 刷新后数字与回填时间保留（AC-25） |
| T4a-5a 搜索筛选 | T4a-1a | 工具栏接线 | 输入即过滤，平台筛选正确 |
| T4a-6a 删除 | T2-3b | 删除接线 | 已发布条目确认文案含"发布数据将一并删除" |

### P4b 开发工作（9 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T4b-1a 项目列表+进度条 | T2-6a | dev.js 左栏 | 进度条随勾选实时变化（AC-27） |
| T4b-1b 项目 CRUD+收起 | T4b-1a | 面板+状态逻辑 | done 项目收底部 |
| T4b-1c 删项目级联 | T2-3b | 挂起级联 | 确认文案带级联，撤销整树恢复 |
| T4b-2a 任务列表+勾选 | T4b-1a | 任务渲染 | 勾选落盘 |
| T4b-2b 拖拽排序 | T4b-2a | order 字段维护 | 刷新保持顺序（AC-28） |
| T4b-2c 已完成折叠 | T4b-2a | 折叠区 | 默认折叠可展开 |
| T4b-3a 记一笔今天 | T4b-1a | 日志页签输入框 | 回车建当天日志（projectId+date 唯一） |
| T4b-3b 行内编辑+唯一约束 | T4b-3a | 行内展开编辑 | 同日重复回车=更新不新建；长文本 1s 保存 |
| T4b-4a 首页联动 | T3-1a | 联调用例 | AC-29/30 通过 |

### P4c 咨询工作（8 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T4c-1a 网格/列表 | T2-6a | consult.js 列表 | 切换正常，字段齐全 |
| T4c-1b 到期高亮 | T4c-1a | 橙框规则 | 今天及 ≤3 天逐一验证 |
| T4c-1c 搜索筛选 | T4c-1a | 工具栏 | 名称/需求模糊+状态筛选正确 |
| T4c-2a 信息区 | T2-2b | 50% 面板上部 | 失焦自动保存 |
| T4c-2b 时间线+记录表单 | T4c-2a | 面板下部 | 新记录插最上，不开第二面板 |
| T4c-3a 跟进日期同步 | T4c-2b | 同步逻辑 | 最新记录值同步到 Client（AC-31） |
| T4c-3b 删除回退 | T4c-3a | 回退逻辑（W5） | 删最新记录后取次新值或 null |
| T4c-4a 首页联动 | T3-2b | 联调用例 | AC-32/33/34 通过 |

### P4d 健身计划（8 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T4d-1a 模板格子渲染 | T0-4b | plan 页签 | 7 格齐全显示初始空模板 |
| T4d-1b 模板编辑 | T4d-1a | 编辑逻辑 | 不回写历史 WorkoutLog；清空格子无确认 |
| T4d-2a 打卡带模板 | T4d-1a | 打卡表单初始值 | 下周一模板在当天打卡带出（AC-35） |
| T4d-2b 实际量编辑 | T4d-2a | sets/重量/时长/加动作/没练/改日期 | AC-36 各项一致 |
| T4d-2c 打卡列表 | T4d-2a | 倒序列表+删除 | 删除走撤销条 |
| T4d-3a 体重录入 | — | weight 页签输入 | 同日两次取最后（AC-38 后半） |
| T4d-3b SVG 折线 | T4d-3a | 30 天折线 | 3 个点位正确（AC-38 前半） |
| T4d-3c 历史编辑 | T4d-3a | 历史列表 | 改值后折线联动 |

### P4e 饮食计划（5 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T4e-1a 餐区块 | T2-6a | diet.js 五区块 | 回车加条目（AC-39） |
| T4e-1b 喝水杯子 | T4e-1a | 杯子排交互 | 点 5 满 5，再点第 5 取消为 4（AC-41） |
| T4e-2a 模板存取 | T4e-1a | 存为模板+整套填入 | AC-40 |
| T4e-2b 模板管理 | T4e-2a | 右上角入口 | 改名/删除撤销正常 |
| T4e-3a 首页联动 | T3-7c | 联调用例 | 摘要与首页 +1 同源（AC-16/41） |

### P4f 游戏娱乐（6 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T4f-1a 三页签卡片 | T2-6a | game.js 页签 | 分签正确，累计/本周时长显示 |
| T4f-1b CRUD+状态流转 | T4f-1a | 面板+通关引导 | AC-43（日期默认今天、评价可空） |
| T4f-1c 删除级联 | T2-3b | 挂起级联 | 时长明细一并删，撤销恢复 |
| T4f-2a 打卡表单 | T4f-1a | 打卡弹窗 | 默认今天可改日期（AC-44 前半） |
| T4f-2b 重算冗余 | T4f-2a | totalMinutes 重算 | 补记 30 后累计 90（AC-44） |
| T4f-3a 首页联动 | T3-7a | 联调用例 | 本周之和一致、上周不计（AC-45） |

### P5（10 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T5-1a 四区块布局 | T2-6a | settings.js 骨架 | 四卡片齐全 |
| T5-2a 外观切换 | T2-5b | theme 控件接线 | AC-10（默认浅色、即时生效） |
| T5-3a 开关 UI | T5-1a | 七开关+提示文案 | 首页/设置无开关 |
| T5-3b 隐藏过滤接线 | 全部 P4 | 导航/速览卡/派生过滤 | AC-50（数据保留，重开恢复） |
| T5-4a 翻篇时间 | T1-5a | 单选 0/4 | 改后 today() 口径立即变（AC-8 后半） |
| T5-4b 喝水目标 | T4e-1b | number 控件 | 改 10 后首页与饮食页同步 /10（AC-42） |
| T5-5a 导出备份 | T1-3a | 按钮+位置提示 | AC-46 |
| T5-5b 恢复流程 | T1-3c, T2-3a | 列表→强确认→恢复→提示刷新 | AC-47/48/51（全程无撤销条） |
| T5-5c 清空流程 | T1-3d, T2-3a | 输入"清空"→备份→归零 | AC-49 |
| T5-5d 欢迎引导 | T0-4b | 首屏引导组件 | welcomed=false 时显示三句话+开始使用，点后不再出现（AC-2） |

### P6（9 步）

| 步骤 | 输入 | 产出 | 完成判据 |
|---|---|---|---|
| T6-1a 脚本化检查 | 附录 F | scripts/check-*.ps1 或 py | 脚本断言全绿 |
| T6-1b AC 手工走查 | 第 5 节 | 51 条勾选记录 | 全过 |
| T6-2a 翻篇专项 | — | 操作记录 | 3:59 归昨天、4:01 归今天（AC-8） |
| T6-2b 补记专项 | — | 操作记录 | 四类按天数据改前天各一条（AC-9） |
| T6-2c 端口专项 | — | 操作记录 | 预占 8000–8005 后自动换 8006 并提示 |
| T6-2d 断网专项 | — | 操作记录 | 断网全流程无网络报错（AC-5） |
| T6-3a 损坏 JSON | T1-1b | 操作记录 | 不崩、报错、原文件保留 |
| T6-3b 强杀专项 | T1-2a | 操作记录 | 至多丢最后一次未落盘编辑 |
| T6-3c 快速连写 | T1-4b | 操作记录 | 连改 20 字段最终文件与界面一致 |

---

# 附录 F　每阶段验证脚本与操作清单

> 脚本只做断言，不含产品代码；统一约定 BASE=http://localhost:8000（端口以终端实际打印为准）。Windows 下用 curl.exe。

## F-P0（脚本可全量覆盖）

检查脚本断言：
1. `GET {BASE}/` → 200 且含 `id="view"`；
2. `GET {BASE}/api/health` → 200，`version==1`；
3. `GET {BASE}/static/js/main.js` → 200 且响应头含 `no-store`；
4. 文件系统：`data/app-data.json` 存在，解析 JSON 含附录 B.0 全部顶层键且 `workoutTemplates.length==7`。
手工补充：双击启动.bat 验浏览器自动打开（AC-1）；预占端口验切换。

## F-P1（脚本为主）

1. 读写回环：POST 一份含 1 条 memo 的 data → 读磁盘文件比对一致；
2. 原子写压力：循环 50 次 POST（每次改一个字段），每次后解析磁盘文件均为合法 JSON；
3. 409：用旧 baseUpdatedAt POST → 期望 409；
4. 备份回环：POST /api/backup → 记下文件名 → 再 POST /api/data 改数据 → POST /api/restore {file} → GET /api/data 与备份文件逐字节比对一致 → 且存在 `backup-before-restore-*`；
5. 清空：POST /api/clear → data 等于 newEmptyData 结构且 `backup-before-clear-*` 存在；
6. 正则校验备份文件名：`^backup(-before-(restore|clear))?-\d{8}-\d{4}(-\d+)?\.json$`。
手工：杀服务重启数据仍在（AC-3）、复制文件比对（AC-4）。

## F-P2（手工为主）

按第 5 节 P2 表逐项操作；唯一可脚本化项：静态检查 `grep -rn "new Date(" static/js` 只允许命中 utils.js（翻篇口径守护，每阶段跑）。

## F-P3（手塞数据 + 手工）

准备 fixture（直接写入 data/app-data.json 后刷新）：
- contents：1 条 status=scheduled、scheduledDate=今天、title="测试稿"；
- devProjects/devTasks：项目 P1 + 任务 T1（dueDate=今天、未完成）；
- clients：客户 C1（nextFollowupDate=今天）；
- todos：空；waterLogs：今天 cups=0。
然后按第 5 节 P3 表逐项操作（AC-11/12/13/16/17/19/20/21）。脚本补充：断言派生结果——`GET /api/data` 后本地计算 getTodosFor 期望输出与页面显示条目数一致（可改为人工数条目，允许）。

## F-P4（手工为主，按第 5 节 P4 表）

每条子线完成后跑一遍该子线 AC；全局 grep 守护（F-P2）再跑一次；P4a 完成时额外验证 AC-15 全部快捷入口。

## F-P5（手工 + 小脚本）

手工按第 5 节 P5 表；脚本断言：恢复列表接口只返回 data 目录内文件（在 data 外放一个假 backup 文件，调 /api/backups 不应出现它）；清空后 settings.welcomed==false。

## F-P6（汇总）

- T6-1a 汇总脚本 = F-P0 + F-P1 全部重跑；
- T6-2/T6-3 为手工专项，结果记入验收记录（操作、预期、实际、通过/失败四列）。

---

# 附录 G　依赖图与关键路径

## G.1 任务级依赖（只列硬依赖边）

```text
T0-2 → T0-3, T0-5
T0-4 → T1-1, T1-2, T1-3, T4d-1
T1-2 → T1-4                # store 依赖写接口
T1-4 → T2-4, T3-x, 全部 P4, T5-x   # 一切视图保存依赖 store
T1-5 → T3-1, T4d, T4e, T4f, T5-4   # 日期口径
T2-2 → T3-3, T4a-4, T4b-1, T4c-2, T4f-1   # 面板
T2-3 → T3-4, T3-6, 全部删除任务, T5-5     # 确认/撤销
T2-5 → T5-2
T3-1 → T3-2 → T3-3 → T3-4
T3-1 → T3-5 → T3-6
T3-1 → T4a, T4b, T4c       # 派生规则冻结后才能接真实模块
T3-7 → T4d-3, T4e-3, T4f-3 # 摘要口径
T4a ∧ T4b ∧ T4c ∧ T4d ∧ T4e ∧ T4f → T5-3   # 模块开关最后接
T5-3 → T5-5 → T6-1
T2-1c → T5-3
```

## G.2 可并行带

- P4a / P4b / P4c 三条线互相独立；P4d / P4e / P4f 互相独立且只依赖 T3-7 口径。
- T0-5（骨架页）与 T1 全部接口任务可并行。
- T2-5（主题）与 T2-2/T2-3 可并行。
- T5-1/T5-2/T5-4 与 P4d/e/f 收尾可并行。

## G.3 关键路径（19 个任务节点，决定整体进度）

```text
T0-2 → T0-4 → T1-2 → T1-4 → T2-2 → T2-3 → T3-1 → T3-2 → T3-3 → T3-4
 → T3-5 → T3-7 → T4a-1 → T4a-2 → T4a-3 → T4a-4 → T5-3 → T5-5 → T6-1
```

说明：P4 六条线取最长的 P4a（11 步）计入；若多人并行，P4a 拆人可缩短为 P4c（8 步）级别，但 T3-1→T3-2 与 T5-3→T5-5→T6-1 两段不可压缩。

---

# 附录 H　待确认事项（PRD/设计稿的矛盾或缺口，不擅自定需求）

| # | 位置 | 问题 | 计划暂按 | 影响 |
|---|---|---|---|---|
| W1 | PRD FR-10/FR-16 与口径 12 | 首页勾选自媒体/咨询派生事项后，"取消勾选"的反向写回未定义：自媒体退回 scheduled？链接/发布日期保留吗？咨询恢复 nextFollowupDate 为今天？ | 自媒体退回 scheduled、保留 link 与 publishedDate；咨询恢复为今天 | T3-2、AC-12 变体 |
| W2 | design 4.3/4.5 | 派生事项 timeSlot 只写了自媒体/咨询"默认白天"，开发任务未写 | 派生事项一律默认 afternoon | T3-1、AC-17 排序 |
| W3 | PRD 口径 15 vs design 4.4 | PRD 编辑统一侧滑面板，例外只列全屏写稿与行内创建；design 明确开发日志用行内编辑 | 按 design：日志行内编辑 | T4b-3 |
| W4 | design 3.1 vs PRD 4.1 | design 备忘"更多进今日计划页看"，PRD 今日计划页无备忘区块 | 第一版只做首页最近 10 条，今日计划页不放备忘 | T3-6 |
| W5 | PRD 4.4 | 删除客户"最新一条"咨询记录后，Client.nextFollowupDate 如何取值未定义 | 回退到次新记录的值，无则置 null | T4c-3b |
| W6 | PRD FR-17 | 日终顺延撤销的快照范围：是否含派生事项源字段（scheduledDate/dueDate/nextFollowupDate）一并还原 | 全部还原（含源字段） | T3-4、AC-19 |
| W7 | PRD 4.6 | 同一天是否允许多条 WorkoutLog 未明示（"一天可补记/修改"） | 同一天至多一条，重复打卡=编辑已有 | B.5、T4d-2 |

