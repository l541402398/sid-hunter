# 变更说明：真实素材与独立电梯厅

- 日期：2026-10-14
- 项目：《S-ID：年终生存战》
- 范围：`online/` 与 `demo/` 场景、楼层交通、选层面板，以及本轮说明文档。
- 当前状态：**实现已集成，独立最终验收中；未正式发布。**
- 依据：实际工作树差异、共享世界/场景文件、素材来源清单及原始 License。工程自检与独立 QA 分开记载，不把历史测试记录写成本轮全绿。
- 操作边界：本轮未 commit、push、deploy，未重启既有 8787 服务；上线、热修、回滚均须用户另行审批。

## 1. 给玩家的变化摘要

1. 地板与绝大部分办公家具改为真实下载素材的像素精灵（Kenney 图集 + Antea 办公家具包），不再只依赖程序绘制色块。当前不是全元素替换：角色、健身专用器材与部分后墙/门仍保留既有表现。
2. 七层楼每层左右各增加一个独立电梯厅。走近厅口的玻璃滑门会自动开启，离开后延迟关闭。
3. 先穿过玻璃门进入电梯厅，再靠近并面向电梯，按 `E` 或点击电梯打开选层面板；选择 1–7F 后落在目标层同侧厅内。
4. 选层按钮、键盘数字与服务端目标层都使用真实楼层 ID，不做“加一/减一”换算。当前层禁选；窄屏面板增加宽度约束、文本换行与内部滚动，最终命中范围仍待独立 QA 确认。

## 2. 素材来源与授权

本轮实际下载并解压的运行素材有三包：两份 Kenney（CC0，无需署名）与一份 Antea（CC-BY，**必须署名**）。三包的作者、来源与授权均留有凭据（Kenney 为包内原始 `License.txt`；Antea 为仓库内 `LICENSE.txt` + `outputs/asset-acquisition/antea-office.json`），便于审计。

| 项目 | Roguelike Indoors | Roguelike Modern City | Antea 办公家具包 |
| --- | --- | --- | --- |
| 作者 | Kenney / Kenney Vleugels | Kenney | Antea ✮⋆˙ (stcrbcn) |
| 官方页 | https://kenney.nl/assets/roguelike-indoors | https://kenney.nl/assets/roguelike-modern-city | https://stcrbcn.itch.io/furniture-office-set |
| 授权 | CC0-1.0 | CC0-1.0 | **CC-BY（允许商用，必须署名）** |
| 运行目录 | `online/public/assets/vendor/kenney-indoors/` | `online/public/assets/vendor/kenney-modern-city/` | `online/public/assets/vendor/antea-office/` |
| 原始 ZIP | `outputs/asset-acquisition/kenney_roguelike-indoors.zip` | `outputs/asset-acquisition/kenney_roguelike-modern-city.zip` | 桌面库 `…/antea-free-furniture-office-equipment/Office-Furniture-Pixel-Art.zip`（未复制进仓库） |
| ZIP 字节数 | 112227 | 519937 | 38447 |
| ZIP SHA-256 | `578cfdb066c4a9de78a52535adaf953728889b2cf268441bd4d338844f7aa586` | `2a3f36b1bc3a3d1cb4b9da051c493d163c493fe54adc66e78e76b3fb4abcfc56` | `22f8f711a888c984a678a334c0883dadcce44a600fd69781d49caeace71b3e34` |
| 当前运行文件 | `Tilesheets/roguelikeIndoor_transparent.png`（458×305，27×18，16px，间隔1） | `Tilemap/tilemap.png`（628×475，37×28，16px，间隔1） | 43 个独立 PNG（16/32px，含总览 `0-Tileset.png`） |
| 许可/来源 | 包内 `License.txt`、`source.json` | 包内 `License.txt`、`source.json` | 仓库内 `online/public/assets/vendor/antea-office/LICENSE.txt`；清单 `outputs/asset-acquisition/antea-office.json` |

### 2.1 第三方素材署名（必须保留）

- **Antea 办公家具包（CC-BY，必须署名）**：作者 `Antea ✮⋆˙ (stcrbcn)`，来源 https://stcrbcn.itch.io/furniture-office-set （包名 Free Furniture Office Equipment Set）。用于 2F–6F 办公桌/椅/沙发/文件柜/打印机/白板/售货机/饮水机等。**CC-BY 署名是硬性义务**：随包发布、改版、转商用均须保留署名。
- **Kenney Roguelike Indoors / Roguelike Modern City（CC0，无需署名）**：作者 Kenney / Kenney Vleugels，来源 kenney.nl。CC0 无署名义务，仍保留来源与许可以便审计。
- 建议署名位置：`README.md` 末“第三方素材署名”小节 + 游戏内“关于/致谢”页。
- 署名文本（Antea 包建议用法）：`Office furniture sprites by Antea (stcrbcn) — https://stcrbcn.itch.io/furniture-office-set — Licensed under CC-BY`。
- 授权凭据：`online/public/assets/vendor/antea-office/LICENSE.txt`（作者/来源/CC-BY 强制署名文本/原包 SHA256/43 精灵清单/缺项说明），以及 `outputs/asset-acquisition/antea-office.json`。原 Antea 包本身未附独立许可文件，此 `LICENSE.txt` 为依据包页 CC-BY 声明的自撰凭据；此前误放的桌面库“下载说明模板”已移除，不再作为依据。

- 来源总表：`outputs/asset-acquisition/acquisition.json`（Kenney 两包）与 `outputs/asset-acquisition/antea-office.json`（Antea 包）。
- 实际 PNG 编号预览与库存：同目录 `kenney-indoors-numbered.png`、`kenney-modern-city-numbered.png` 及对应 `*-inventory.json`。
- 美术选片与缺项：`outputs/asset-acquisition/sprite-selection.json`（Kenney 选片）。选片表不是运行裁片审核结论；Antea 裁片用于运行，须由美术按层复核。
- Kenney packed 图集可用于后续组合；**当前 `scene.js` 实际读取带 1px 间隔的原图**，按 `column*17`、`row*17` 分别裁每个 16px 瓦片，不整体拉伸带间隔的大区块。Antea 精灵按整图绘制，32px 大件不压成 16px。
- 桌面素材库全量评估（可用/不可用/授权汇总）：`design/素材库评估-pixel-game-assets.md`。
- Pixel Office 购买/下载页请求经代理返回 502，未取得 ZIP，不能列为已下载或已使用的素材。其他访问失败或授权不适合的包亦不纳入本轮运行资产；详见 `outputs/asset-acquisition/access-log.json`。

### 2.2 覆盖与缺项（验收中）

| 类别 | 已有事实 | 当前边界 |
| --- | --- | --- |
| 地板 | 七层逐层使用已核实室内地材（见 §3.1）；地板块缓存区分楼层 | 每层主题观感仍需美术/QA 复核 |
| 桌、椅、沙发、柜、植物、打印机、白板、售货机、饮水机、厨房台 | 已由 Kenney + Antea 真实精灵绘制 | 接入不等于每件裁片大小/遮挡/用途已通过终验 |
| 显示器 | 含在 Antea `Desk`/`Boss-Desk` 内 | 未单列独立显示器资产 |
| 跑步机、哑铃架等健身器材 | 全库无可用专用贴图 | `scene.js` 无对应精灵时返回 false，继续程序化 fallback，**不得写成已替换** |
| 俯视办公角色动画 | 全库无可用素材 | 保留既有身份配色程序化角色 |
| 后墙、窗户、标语、玻璃滑门、电梯 | 保留/新增程序绘制 | 不属于真实精灵替换 |

没有建立“全部场景元素数”的稳定统计分母，因此不提供虚假的贴图覆盖率百分比。

## 3. 工程变更与规则边界

### 3.1 共享绘制与静态资源

- 新增 `online/shared/scene.js`；两版 HTML 在 world 之后、客户端之前加载它。
- 图集使用 `Image` 加载与解码，Canvas `drawImage` 逐瓦片（Kenney）或整图（Antea）绘制并关闭平滑。
- **逐层地材（已修复误用草地）**：1F indoors 木纹 `24,0–24,3`；2F city 浅灰 `18–20,1`；3F city 灰石 `10–12,1`；4F city 红褐砖 `1–3,1`；5F city 米色 `25–28,1`；6F city 蓝灰格 `0–2,19`；7F indoors 绿色 `24,4–24,7`；电梯厅地坪统一 city `0/1,19`。此前“1F/2F/4F/5F 误用 city 第 26 行草地”的缺陷已修复；6F 亦已由 `(2,3,4,19)` 更正为 `(0,1,2,19)`——实测 `(3,19)(4,19)` 为米色，原写法会与 5F 撞色。
- **真实精灵家具**：`desk`→Antea `Desk`/`Desk-2`（工位岛逐排、含显示器）、`seat`→`Chair`、`sofa`→`Big-Sofa`/`Small-Sofa`、`plant`→`Big/Small-Plant`、`cabinet`→`Filing-Cabinet` 系列（4F 用 `Wide`、6F 用 `Big`、其余 `Tall`）、`table`→1F Kenney 木桌其余 Antea `Big-Round-Table`、`counter`/`reception`→Antea `Small-Table`（1F 取餐台用 Kenney 厨房台）、`stage`/`mat`→图集地材铺面。无对应精灵的类型返回 false 走程序化 fallback。
- 两端家具缓存在图集就绪后重建；地板块缓存键包含 `floorId`，避免换层沿用上一层纹理。
- `online/server.js` 增加图片扩展名和 MIME 支持，并只额外开放明确的 `/shared/scene.js` 路径；不意味着开放任意仓库文件。许可和来源文件保留在磁盘供审计。
- 展示层不替代 WORLD 中的家具足迹、深度、出生点、容器奖励与服务端规则。

### 3.2 主楼不缩放，外接 14 个独立厅

| 参数 | 当前实现 |
| --- | --- |
| 主楼 | 每层 `1440×400` 世界像素，原主楼多边形保留 |
| 设计跨度 | `X_SPAN=1500`、`Y_SPAN=1000`，换算比例仍为 `0.96` / `0.4` |
| 电梯厅 | 每层左右各 `144×96`，共 14 个 |
| 外接厅 x 范围 | 西厅 `[-144,0]`，东厅 `[1440,1584]` |
| 世界横向包围边界 | `[-144,1584]`；不是将主楼拉伸到 1728px |
| 与主楼衔接 | 逐层选择不与既有家具/墙碰撞的走廊入口，实际 y 由世界文件生成 |
| 原东侧电梯厅占位柜 | 保留装饰 ID 但标为 `architecturalPlaceholder`，不再当柜子绘制/碰撞 |
| 相机 | 两端与服务端可见性计算改读含外接厅的共享 cameraBounds |

旧 `stairLeft/stairRight` 设计位置不再代表实际电梯 portal 坐标；稳定 portal ID 仍为 `f{层}:portal:{left或right}`。

算法须区分：`world.js` 实际通过候选入口走廊的碰撞检查确定厅口，不是 BFS 自动建厅；`online/elevator-world-test.mjs` 则在测试侧以 4px 网格 BFS 验证出生点到接近点、接近点到厅内落点的通路。工程 14 厅 BFS 自检已由主理人复跑通过，但它不能代替真实浏览器行走、防夹与多玩家同步终验。

### 3.3 自动玻璃滑门

- 每厅入口实际开口 48px；传感范围 x 距门 38px、y 覆盖开口及脚部余量；活着且在线的同层角色触发。
- `WORLD.advanceGlassDoors` 管理开门及离开后的 650ms 保持时间，开门时移除门碰撞，关门时恢复。完整防夹与双玩家一致性以独立 QA 为准。
- 联机版 `room.js` 在移动与投影前推进门状态，SSE 快照只复制门 ID 与 open；不加入身份、阵营或私密线索。
- 离线版用同一状态函数推进玻璃门；`scene.js` 根据状态绘制滑动与透明玻璃效果。
- 房间重置同时清空门状态。

### 3.4 选层与落点

- `WORLD.floorOptions()` 返回真实 `{id,label,name}`，两客户端据此生成按钮，并添加 `data-floor-id` / `aria-label`。
- 请求字段为真实 `targetFloorId`（1–7），当前层、非法层、厅外、太远或面向不符均拒绝。无证据表明旧实现采用“ID 差一”，不能把窄屏错位解释为楼层数字整体 ±1。
- `WORLD.portalAccess` 共享同层、同侧厅内、64px 内和面向判定；客户端给提示，服务端最终校验。
- `WORLD.elevatorLanding` 优先目标层同侧门前安全点，候选均要求不碰撞、不遮挡；无候选时返回 null，不回退到另一侧或强行穿墙。
- `floorById` 对非法 ID 返回 null，不再默默映射到 1F。
- 两版面板设置 border-box、min-width:0、minmax(0,1fr)、长文本换行与内部滚动。当前源码已修，但实测结论以 QA 定稿为准。

## 4. 运行与验收入口

### 离线试玩

直接打开 `demo/index.html`。必须保留 `demo/` 与 `online/shared/`、`online/public/assets/vendor/` 的相对目录结构。不要只拷贝一个 HTML，也不要将网页预览图当运行素材。

### 新树联机试玩（与既有 8787 隔离）

从仓库根目录，在确认空闲端口后启动独立本地实例。下列示例仅供人工操作，本轮文档编写未执行启动或重启：

```powershell
$env:HOST='127.0.0.1'; $env:PORT='8788'; $env:SID_SSO='0'
node online/server.js
# 浏览器访问 http://127.0.0.1:8788/
```

`SID_SSO=0` 只用于本地昵称试玩，正式环境不能直接沿用；不要为验收关闭或重启既有 8787/PID 9332。服务端逻辑已由旧进程加载，旧进程未重启不等于运行的是新树；静态文件与服务端逻辑可能不同步，不能拿该实例当本轮验收对象。

### 工程自检入口（由工程/QA执行）

```bash
node online/elevator-world-test.mjs
node online/elevator-room-test.mjs
node online/elevator-browser-test.mjs
```

- 浏览器入口需要系统 Chrome，可用 `SID_CHROME` 指定已有 Chrome 路径，不需要为本轮新增安装。
- 工程浏览器脚本自行使用回环空闲端口及 `SID_TEST=1`，并在结束后关闭它创建的进程；不要将测试接口带入正式环境。
- 工程证据：`outputs/engine-elevator-results.json`、`outputs/engine-picker-{1440,768,390}.png`、`outputs/engine-online-4f-west.png`、`outputs/engine-demo-{1..7}f.png`。其中结果标为 `engineering-self-check-pass`，不是独立 QA 全绿判定。主理人已在真实 Chrome 复跑：图片 HTTP 200 + `image/png`、真实 `drawImage`、1440/768/390 三宽按钮完整包含且命中、真实点击 4F → 服务端 `floorId 4` 且落在西侧厅（x<0）、七层截图齐出。
- 截图有效性注意：此前 City 图集 row26 草地误作室内地板属素材视觉质量 FAIL，**现已修复为逐层已核实室内地材（见 §3.1）**；旧截图只留作缺陷过程证据，最终成品以修复后的重拍截图为准，绘制次数不代替视觉审核。
- 独立验收目录：`outputs/qa-floor-final/`，结论及截图待 QA 完成；归因中间产物 `failure-attribution.json` 明确不是修正后的测试全过报告。

## 5. 当前验收与发布门控

| 门控 | 当前状态 |
| --- | --- |
| Kenney 两份 ZIP、hash、License 和来源保留 | 已核对；ZIP 大小/hash 复算一致 |
| Antea 包来源与 CC-BY 署名 | 已建立署名小节；`LICENSE.txt` + `antea-office.json` 凭据就绪；原包自带许可文件不存在（已自撰并说明） |
| 工程新增世界/房间与浏览器自检 | 已有工程通过报告；不代替独立 QA |
| 14 厅路径连通、玻璃门防夹、多玩家/SSE一致性 | 独立最终验收中 |
| 所有有效跨层路径与楼层 ID 一致性 | 独立最终验收中 |
| 1440/768/390 选层视觉、点击命中、滚动与禁当前层 | 独立最终验收中 |
| 全七层真实贴图表现与裁片语义 | 美术及独立最终验收中 |
| 旧回归失败项归因 | 进行中；观察结果不等于批准发布 |
| 用户上线/热修审批 | 未请求、未获准，本轮不执行 |

旧逻辑套件观察为 281/363（82 未通过），旧探索浏览器为 5/17（12 未通过）；这些数字不是新增测试结果，也不能仅凭目录名认定为本轮改动前基线。

`outputs/qa-floor-final/failure-attribution.json` 已记录 82 个逻辑与 12 个浏览器未通过项的逐条名称、断言与首个失败归因；含当前树 8 个文件 hash/mtime，以及原浏览器记录 9 个文件与 HEAD 的 CRLF 哈希一致性证据。归因涉及旧协议/字段前提、失败级联、浮点边界、旧速度和坐标、几何及遮挡、跨层 undefined、RPS 旧路线、Canvas 观察点与计数等；这些解释**不将原 FAIL 改成 PASS**。旧 fixture 修正后仍须完整重跑后续断言，尤其不能假定旧 RPS respond 模型等同当前 accept/choice。

390px 面板真实越界与 7F 电梯覆盖是已经复现的独立产品缺陷，不以“测试陈旧”掩盖；当前工程已修，修复后的终验仍待独立 QA。所有定案须记录运行版本/哈希、证据时间与覆盖限制，不能提前宣称“无新增失败”。

**发布门控：待审 / 不批准上线。** 独立最终 QA 和美术审核未结，不能宣布完整 PASS。若存在未清 Blocker，不发布，除非用户明确豁免并接受风险。

## 6. 跨部门清单与已知风险

- [x] 工程：记录真实共享场景、厅/门/选层实现，不改写产品代码。
- [x] 资产：保留 Kenney 两包（CC0）与 Antea 一包（CC-BY）的来源/许可/ZIP hash；未取得包明确写缺项；建立 CC-BY 署名小节。
- [x] 文档：README 与 design 索引更新，历史状态不代表本轮状态。
- [ ] 美术：按层复核新裁片语义、缩放与碰撞深度；确认逐层地材观感。
- [ ] 发布前：在游戏内“关于/致谢”页落地 Antea 署名（`LICENSE.txt`/`antea-office.json` 凭据已就绪）。
- [ ] QA：完成独立新树验收、版本前后哈希一致性与旧回归归因。
- [ ] 交付：按最终证据更新统计、已知限制与七层截图索引。
- [ ] 发布：用户审批；本轮无上线动作，也不替代商店/法务发布审查。

| 风险 | 缓解与发布要求 |
| --- | --- |
| 缺少专用健身/角色贴图 | 明确保留程序绘制，不使用未经授权或未下载包；不宣称全元素替换 |
| Antea 为 CC-BY，署名是硬义务 | README 与游戏内致谢页双处署名；发布前补存原包许可凭证；不得移除署名 |
| 选片表与运行裁片不同 | 由美术实际读图复核并更新证据；未通过前保留“待审核” |
| 新图集未加载或资源目录拆散 | 保留完整相对路径；验收检查 MIME、解码及真实 drawImage，不只看文件存在 |
| 独立厅/门碰撞与旧坐标用例冲突 | 独立QA验证真实走路连通、防夹、越界及同侧落点，逐根因区分过期用例和真实回归 |
| 既有进程加载旧权威逻辑 | 本轮不重启它；用隔离端口验新树，勿混用新静态与旧服务端 |
| 内存房间与更新风险 | 后续若发布须先获用户许可，记录当前局状态、选择维护窗口；重启会清空房间/结算 |

后续回滚必须先明确受影响文件与资产版本、保存本轮新树证据；采用经批准的版本包切换而非 `git reset --hard` 抹除其他成员/用户改动。当前未建立或执行线上回滚事务。

## 7. 本地化边界

本轮是中文场景及 UI 调整，不包含多语言发布。楼层名字、提示与按钮中文仍在源码中；厅标识含 WEST/EAST，图集可能包含原始文字或符号。本轮没有字符串抽取、翻译表或 LQA 的统计分母，**本地化覆盖率未统计**，不能将素材覆盖当本地化完成。若后续扩语言，须先建立字符串表、审核图中文字、做长文本/平台验证，再冻结字符串。
