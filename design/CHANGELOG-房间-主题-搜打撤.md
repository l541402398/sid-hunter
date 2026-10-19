# 阶段4：独立房间 · 逐层主题重做 · 搜打撤物品格搜索

> 分支 `feature_dev_floor`，基于 `3e19bf8`（分包重构合入后的最新代码）。
> 本轮回应三条用户反馈：①每层太小、要有可进入的独立小房间；②主题只是"按地毯换色"、不够看；③楼层太空、搜索一点就完。
> 所有改动均为本地工作树，**未 commit / push / deploy**。

---

## 一、需求①：独立小房间（14 间）

### 1.1 空间模型

空间由 `floorId + zoneId` 唯一确定（`zoneId = null` 表示楼层公共空间）：

| 位置 | 改动 |
| --- | --- |
| `online/shared/world/rooms.js`（新） | 房间数据层：14 间房的尺寸/门点/墙体/家具/容器，以及 `roomById / roomDoorNear / zoneContainers / zoneCollides / zoneBounds / zoneCamera` 等查询 |
| `online/room/index.js` | 玩家新增 `zoneId`、`zoneReturn`；`step()` 按房间几何裁剪与碰撞；`visibleTo()` 增加同 zone 判定；新增 `enterZone / exitZone` |
| `online/server/routes/gameplay.js` | 新增 `/api/zone/enter`、`/api/zone/exit` |
| `online/public/game.js` | `loadRoomLocal / adoptZone / syncZoneBanner / drawRoomDoors / drawRoomExit`；`drawList()` 只取同 zone 玩家；相机改用 `zoneCamera` |
| `online/public/index.html` | 新增「独立空间」提示条 `#zone-banner` |

- **进入**：站到楼层上的房间门点（56px 内）按 `E`（或点击门牌）。服务端校验同层、存活、未眩晕、`floorGuard` 版本一致、距离够近，然后把玩家放进房间的室内落点。
- **退出**：走到房间内的门口按 `E`。服务端把位置还原为 **进入时站的那一点**（`zoneReturn`），该点若已不可站立则退回门点 —— "退出房间后位置还是处于进入的位置"是结构性保证。
- **独立加载**：房间有**自己的**家具表、墙体、碰撞集合与容器表；房间里看不到走廊上的人，走廊也看不到房间里的人（服务端 `visibleTo` 与客户端 `drawList` 两侧同时裁剪）。房间内不生成 NPC、不生成电梯门。
- **房间清单**（每层 2 间）：

| 层 | 房间 | 类型 | 容器 |
| --- | --- | --- | --- |
| 1F | 大堂经理室 / 员工包间 | office / lounge | 3 / 3 |
| 2F | 220 会议室 / 研发主管室 | meeting / office | 2 / 3 |
| 3F | 301 评审室 / 研发实验室 | meeting / lab | 2 / 4 |
| 4F | 档案库 / 票证库 | archive / vault | 6 / 4 |
| 5F | 值班调度室 / 小会议室 | office / meeting | 3 / 2 |
| 6F | 财务金库 / 圆桌会议厅 | vault / meeting | 4 / 2 |
| 7F | 董事会议室 / 更衣室 | meeting / locker | 2 / 2 |

门点由 `snapDoor()` 在建造期就近吸附到可站立位置，找不到就抛错（不允许出现"看得见走不到"的门）。

### 1.2 房间内景

- `scene.js: roomFloor()`：室内**不再复用楼层图集瓦片**（16px 格在 700×450 的房间里会重复成壁纸），改为逐层材质的程序化铺装（石材/地毯/技术砖/木地板/橡胶），尺度是"约一平米一块"；会议室/休息室/金库另有带包边和斜纹的中央地毯，叠加墙根阴影与顶部灯光斑。
- `scene.js: roomWall()`：四面墙按所在楼层主题上色，北墙挂一排画框；门洞处由 `drawRoomExit()` 画门垫与「E 离开房间」。

---

## 二、需求②：七层真正不同的主题

### 2.1 问题定位

旧实现的七层差异只有两处：`floorStyles` 给同一批图集瓦片换 `tint`（地毯色），`THEME_FURN` 把办公桌/椅子替换成 Kenney indoors 的**中世纪木桌木椅**。结果七层看起来是"同一间办公室铺了不同地毯"，甚至出现"财务层摆巨型棒棒糖"这种互相打架的搭配。

### 2.2 做法

**取消"把办公家具换成木桌"的伪主题**（`THEME_FURN` 只保留 4F 木文件柜、5F 盆栽、7F 球场），把差异交给四个真正影响观感的维度：

| 维度 | 实现 |
| --- | --- |
| 地面材质 | `floorStyles`：每层换图集材质 + 压一层本层基色（0.66 透明度）把 16px 图块压成"材质底纹"，再做专属铺装纹样 |
| 铺装纹样 | `floorAccent()`：水磨石颗粒 / 方块地毯纤维 / 走线槽焊点 / 木纹结疤 / 夜间地灯 / 大理石脉络 / 球场白线 |
| 墙面构造 | `wallBody()` + `wallModule()`：落地玻璃幕墙 / 织物隔断+便签 / 机房钢板+发光走线+蓝图 / 木饰面+证书框+滑轨 / 夜间监控墙+应急灯 / 金库石砌+保险箱阵列 / 镜面墙+运动旗帜 |
| 走廊地毯 | `runner()`：每层不同颜色的主通道地毯，让"人在哪一层"一眼可辨 |

七层主题（`THEMES`）：

| 层 | 主题 | 地面 | 墙面 |
| --- | --- | --- | --- |
| 1F | 门厅·晨光木石 | 米色大理石水磨石 + 黄铜压条 | 落地玻璃幕墙 + 城市天际线 + 铜竖梃 |
| 2F | 综合办公·薄荷工位 | 方形地毯砖 + 薄荷环境光 | 织物隔断 + 便签 + 上部玻璃气窗 |
| 3F | 产品研发·蓝图实验室 | 冷灰金属 + 走线槽 | 机房钢板 + 发光走线 + 蓝图海报 |
| 4F | 档案库·地牢石廊 | 碎石板地面 + 火把暖光 | 砖石拱廊 + 火把 / 挂旗 / 骷髅壁龛 |
| 5F | 值班会议·夜巡 | 深蓝夜砖 + 地灯 | 监控墙 + 红色应急灯 |
| 6F | 财务·保险库 | 红褐石磨 + 酒红地毯 | 石砌错缝 + 黄铜 + 保险箱门阵列 |
| 7F | 健身·天光 | 绿茵橡胶 + 场地线 | 镜面墙 + 天窗带 + 运动旗帜 |

### 2.3 4F：整层换成"地牢奇幻"世界观（第二轮追加）

按用户明确要求「每层一种风格，地牢奇幻风正好可以做成一个楼层」：

- **地面**：不规则碎石板（程序化、确定性），深色缝隙 + 浅色石面 + 苔藓/裂缝；叠 0x72 的血迹、水渍、
  地灯光斑。**踩过的坑**：先用"整齐错缝方砖"画，整层读成"一面铺倒的砖墙"；改成大小不一、
  缝隙不齐的碎石板后才被认成地面。
- **墙面**：0x72 的真实墙砖逐块铺（首行带压边）+ 顶部压暗 + 苔藓；墙面模块循环
  **火把（4 帧闪烁 + 光晕）/ 挂旗 / 骷髅壁龛**。
- **陈设**：文件柜→宝箱、纸箱→木箱堆、绿植位→骷髅、售货机→石柱、工位→木长桌（不再出现带显示器的现代工位）。
  房间内也一起换（`themeSpec` 对 4F 例外放行），保持整层一致。
- **战利品**：4F 的容器在通用物品池之外额外混入 8 种奇幻物品（四色药剂 / 古币 / 羊皮地图 / 蓝宝石 / 金骷髅）。
- 素材：`0x72 16×16 Dungeon Tileset v5`（CC0，选片 25 张，见 `vendor/dungeon-0x72/SOURCE-README.txt`）。

楼层隔墙（`drawWallPanel`）也改为读主题配色，不再一律棕色木墙。

---

## 三、需求③：搜打撤式物品格搜索

### 3.1 数据层

`online/shared/world/loot.js`（新）：

- **42 种物品**，5 档稀有度（普通/优良/稀有/史诗/传说），各自有名称、图标键、折算筹码数与一句描述。
- **10 种容器档案**（`small/desk/table/counter/cabinet/shelf/locker/safe/crate/server`），决定格子形状（3×2、3×3、4×3）、可出物品池与筹码堆区间。
- **确定性掷骰**：`buildSearchPlan(container, playerId, {salt, bonus})` 用 `FNV-1a + mulberry32`，种子 = 容器 ID + 玩家 ID + 本局 salt ⇒ **同一格结果恒定**，刷新页面不会重掷。
- 旧容器的 `EXPLORATION_REWARDS` 折算成一件特殊格（线索券或筹码），保留"每层那个柜子有惊喜"的手感。

### 3.2 服务端权威（三段式）

| 接口 | 作用 |
| --- | --- |
| `POST /api/search/start` | 校验身份/存活/结束/眩晕/`floorGuard`/距离/是否已搜；生成会话，**只下发格子数量**，不下发内容 |
| `POST /api/search/reveal` | 揭示**下一格**；服务端强制每格最小间隔（`nextAt`），改客户端计时器无效 |
| `POST /api/search/take` | 要求全部揭示完；把筹码入账、线索入包、物品入 `backpack`；标记 `searched`；计分 |

要点：客户端在拿到 reveal 结果之前**连"这格是不是空的"都不知道**，因此无法挑肥拣瘦；会话 60s 超时自动失效，玩家中途关页面不会把容器卡在"搜到一半"。

### 3.3 客户端面板

`online/public/js/search/loot-icons.js`（新）+ `loot-grid.js`（新）+ `styles/loot.css`（新）：

- 16×16 程序化像素图标（马克杯/文件夹/相机/U 盘/金条/保险库钥匙…），硬边、统一描边与调色板；
- 盖着的格子有斜纹与流光，逐格翻牌，稀有度描边（绿/蓝/紫/金）；
- 底部进度条 + 「开始搜索」→「全部拾取」两段按钮，拾取后弹出「收获清单」。

> 图标为什么是程序化而不是直接贴素材：**第一版**的理由是"桌面素材库没有成套的办公室战利品小图标"。
> **第二轮按用户反馈改掉了**：物品格现在是"真实素材优先，缺失才回落手绘"，
> 42 种物品里有 16 种用真实素材图标：
>
> | 物品 | 素材 | 出处 |
> | --- | --- | --- |
> | 一沓文件 / 文件夹 / 手写便条 | Papers / Folders / Wall-Note | Antea 办公家具包（CC-BY，须署名） |
> | 金条 / 古币 | Gold Coin | Pixelfrog Treasure Hunters（CC0） |
> | 珠宝盒 / 蓝宝石 | Blue Diamond | 同上 |
> | 施工蓝图 / 羊皮地图 | Big Map | 同上 |
> | 提神药片 | Red Potion | 同上 |
> | 保险库钥匙 / 金骷髅 | Golden Skull | 同上 |
> | 四色药剂 | flask_red/green/blue/yellow | 0x72 Dungeon Tileset（CC0） |
>
> 绘制规则：整数倍最近邻放大 + 居中，**不插值**；素材未就绪时自动回落同键手绘图标，
> 所以首屏不会出现空白格。`SID.lootIcons.realReady()` 可查已加载的真实图标数量。

### 3.4 容器数量

| 指标 | 改动前 | 改动后 |
| --- | --- | --- |
| 楼层可搜容器 | 17 | **62** |
| 房间可搜容器 | 0 | **42** |
| 每层家具 | 22–27 | **49–59** |
| 战利品种类 | — | **42**（16 种用真实素材图标，4F 另有 8 种奇幻物品） |

新增陈设集中在 `online/shared/world/dressing.js`（新）：逐层手工摆位 + 一层通用「别让它太空」补丁（靠墙/角落，全部只用南沿薄碰撞带，不切断走廊）。

---

## 四、兼容与回归

### 4.1 刻意保持不变的契约

- `exploration` 私密投影仍是 `{chips, clues, searched}` 三字段；战利品清单单独走 `backpack`，**不混进旧结构**（否则多个既有测试的深比较会红）。
- `/api/interact` 的 `kind:'search'` 旧闭环保留（NPC 兑换仍用它，服务端旧奖励逻辑未改），新 UI 只走 `/api/search/*`。两条路共用同一个 `searched` 去重。
- 旧容器的 17 个经济 ID 全部保留；新容器用 `f{层}:container:{名字}` 派生稳定 ID。

### 4.2 测试改动（均为"加内容"导致的口径更新，不是放宽）

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `online/elevator-world-test.mjs` | 容器 ID 从"精确等于 17 个"改为"17 个经济 ID 必须仍在 + ID 唯一 + 数量不减" | 需求③要求大幅增加容器 |
| `online/exploration-test.mjs` | 家具/容器数量改为"只增不减"；足迹断言改按每件家具**自己的碰撞块**取点；跳过电梯厅占位件 | 新增矮件与更多家具；`核心筒` 的碰撞块本就比 rect 宽，旧断言会误判 |
| `online/hammer-test.mjs` | 公共投影白名单新增 `zoneId` | 独立房间的空间键与 `floorId` 同级，是公开地图信息，不含身份数据 |
| `online/test-helpers/world-source.mjs` | `WORLD_PART_FILES` 补 `dressing / rooms / loot`（顺序同 `index.html`） | 新增 world 子模块必须同步 |

### 4.3 回归结果（同一台机器、同一套 Chrome）

| 套件 | 改动前 | 改动后 |
| --- | --- | --- |
| `exploration-test` | 7 通过 / 18 失败 | **8 / 17**（+1，无新增失败） |
| `hammer-test` | 49 / 50 | **50 / 50** |
| `mechanics-test` | 5 / 24 失败 | 5 / 24（持平） |
| `progression-test` | 7 / 8 失败 | 7 / 8（持平） |
| `movement-attack-test` | 13 / 16 失败 | 13 / 16（持平） |
| `npc / ghost-offline / bad-pool / privacy-reset / manager / rules-skill / self` | 38/38、101/101、15/15、23/23、60/60、13/14、10/11 | 完全一致 |
| `elevator-world / elevator-room / elevator-browser` | PASS | PASS |
| `exploration-browser` / `progression-browser` | 5 / 7 | 5 / 7（持平） |

说明：仓库基线本身就有较多红项（`mechanics` 5/24、`exploration` 7/18 等，与本次改动无关，是历史合并遗留）。上表用 `git worktree` 在 `3e19bf8` 上跑出的逐项结果做对照，只看"有没有新增失败"。

### 4.4 本轮新增的验收

`online/rooms-loot-browser-test.mjs`（新，真实 Chrome + CDP，零依赖）：

1. 14 间房、每层 ≥35 件家具 / ≥5 个容器、房间容器 ≥30 的数据层断言；
2. 从 2F 门口按 `E` 进入「220 会议室」→ 服务端 `zoneId` 变化 + 空间提示条出现；
3. 走到房间内容器按 `E` → 物品格面板 → 逐格揭示（6 格全翻开，2 件物品 / 4 格空）；
4. 「全部拾取」→ 服务端记账（筹码 0 → 6，背包 2 件，`searched` 命中）；
5. 走到门口按 `E` 离开 → `zoneId` 归零、站位还原到进入点；
6. 七层各截一张 `theme-{1..7}f.png`，全程断言零未捕获异常。

证据目录：`outputs/status-rooms-loot/`（截图 + `rooms-loot-results.json`）。

---

## 五、素材使用清单（对应"用桌面素材库 / 2d.xlsx 记录的站点"）

桌面素材库（`C:\Users\Administrator\Desktop\pixel-game-assets`，36 个包）与 `2d.xlsx`（7 个站点：
itch.io / Kenney / OpenGameArt / Pixel Frog / Ansimuz / 0x72 / CraftPix）已完整盘点，见
`design/素材盘点-桌面素材库.md` 与 `design/素材来源表-2d-xlsx导出.md`。

本轮**实际在用**的素材：

| 素材包 | 授权 | 用在哪 |
| --- | --- | --- |
| Kenney Modern City / Roguelike Indoors（已在 vendor） | CC0 | 七层地面底纹、电梯厅地坪 |
| Antea 办公家具包（已在 vendor） | **CC-BY（须署名）** | 办公桌/椅/沙发/绿植/文件柜/白板/打印机/饮水机/售货机/书架/圆桌；本轮新增 shelf / whiteboard / tv / locker / cooler / vending / printer 等家具类型；**以及 Papers / Folders / Wall-Note 三张战利品图标** |
| **0x72 16×16 Dungeon Tileset v5（本轮新增 vendor）** | CC0 | 4F 地牢层：墙砖、血迹/水渍/光斑、火把（4 帧）、挂旗、宝箱、木箱、石柱、骷髅、四色药剂图标 |
| **Pixelfrog Treasure Hunters（本轮新增 vendor）** | CC0 | 战利品图标：金币、蓝宝石、羊皮地图、药水、金骷髅 |
| Kenney Topdown Shooter / Sports Pack（已在 vendor） | CC0 | 7F 球场地面（stage/mat） |

新增 vendor 目录与选片凭据：

- `online/public/assets/vendor/dungeon-0x72/`（25 张，CC0，`SOURCE-README.txt` 记录了来源与授权措辞冲突）
- `online/public/assets/vendor/pixelfrog-treasure/`（5 张，CC0，`SOURCE-README.txt`）
- `online/public/assets/vendor/antea-office/{Papers,Folders,Wall-Note}.png`（CC-BY，沿用该目录既有 LICENSE.txt）

**本轮没有采用**（并说明原因，避免"看起来用了其实没用"）：

- `0x72 Dungeon / DungeonTileset II`、`Kenney Tiny Dungeon`、`Pixelfrog Pirate Treasure`：都是奇幻/海盗风
  （武器、药水、金币、藏宝图），与"办公室搜刮文件、硬盘、门禁卡"的题材不匹配；只盘点未接入。
- `Pixelfrog Treasure Hunters` 的金币/钻石/藏宝图单图确实可做战利品图标（CC0），
  但选用后会出现"32px 干净描边 + 16px 手绘"两种风格混排的物品格；本轮统一用手绘 16×16 图标，
  素材留待后续做"奇幻彩蛋道具"时再用。
- `Antea` 的 `Papers.png / Folders.png / Wall-Note.png / Books.png` 四张小图同样可做物品图标，
  原因同上（与其余 30 个物品风格不一致）。
- CraftPix：账号需登录，`craftpix\` 下 0 个包，未使用。

> Antea 是 CC-BY，**必须保留署名**：`Office furniture sprites by Antea (stcrbcn) — https://stcrbcn.itch.io/furniture-office-set — Licensed under CC-BY`。

---

## 六、第二轮追加：七层七世界观 + 道具有用化（2026-10-17）

### 6.1 七层七个世界（按用户整理的 `pixel-themes-7floors`）

| 层 | 世界观 | 地面 | 墙面构造 | 真实道具 |
| --- | --- | --- | --- | --- |
| 1F | 科幻实验层 | 金属甲板 + 铆钉 + 发光走线 + 黄黑警示带 | 舱壁肋条 + 灯带 + 警示条 | 控制箱、天线、霓虹灯（Warped City） |
| 2F | 竞技运动层 | 草坪条纹 + 白线 + 中圈 | 看台广告板 + 围网 + 记分牌 | Kenney Sports |
| 3F | 魔幻城堡层 | 大块石砖 + 苔痕 | 巨石墙 + 城垛 + 旗帜/火盆/拱窗 | 宝箱、木箱、石柱（0x72） |
| 4F | 幽深森林层 | 草地 + 泥径 + 落叶小花 | 分层树冠 + 树干 + 垂藤 | 树/灌木/树桩/石头（Peaceful Forest） |
| 5F | 地牢回廊层 | 不规则碎石板 | 砖石拱廊 + 火把/挂旗/骷髅壁龛 | 0x72 地牢全套 |
| 6F | 海盗甲板层 | 船甲板木板 + 麻絮缝 | 船壳横板 + 舷窗 + 缆绳 | 宝箱、木箱、桅杆 |
| 7F | 赛博霓虹层 | 湿沥青 + 霓虹反光 + 井盖 | 暗楼体 + 霓虹竖条 + 电路纹 | 霓虹招牌、全息广告、监控脸、天线 |

> 多数新素材包是横版/侧视图集，直接平铺会露馅；因此**地面与墙体走程序化构造**（材质/拼法/光照按主题换），
> 真实素材用在"一眼认得出世界观"的**陈设道具**上。房间跟随所在楼层换主题（`THEME_FURN` 全层生效）。

### 6.2 物品从"数字"变成"资产"

- **66 种物品**（新增 21 种七层特产 + 3 种商店货）。物品不再拾取即折现，而是进 `items`（key→数量）。
- **通道**：`/api/item/use`（使用）、`/api/item/sell`（卖成筹码）、`/api/shop/buy`（筹码买道具）。
- **buff（服务端计时，限时/限次）**：疾行（速度 ×1.45，12–18s）、护体（免疫 J 键眩晕/僵直，8–15s）、专注（下一次搜索多翻 1 件，一次性）。
- **逐层特产**：每层 3 件（1 加速 / 1 护体 / 1 高价宝物），只在对应楼层掉落。
- 客户端：背包面板（图标 + 数量 + 售价 + 效果 + 使用/卖出）、NPC 面板商店、HUD buff 倒计时条。
- 验收：`rooms-loot-browser-test` 扩展通过（真实图标 / 5F 地牢战利品 / 背包使用 → 疾行 buff / 卖出金条 → 筹码 / 七层截图 / 零异常）。

### 6.3 数据持久化（第二轮补齐）

原先**没有数据库**：所有状态在 `online/room/index.js` 的内存里，重启即清空。现已加 **SQLite**：

- 实现：`online/server/store.js`，用 Node 22.5+ 内置 `node:sqlite`（**零 npm 依赖**），
  默认库文件 `online/.data/sid.sqlite`（已加入 `.gitignore`），WAL 模式。
- 落盘范围（**刻意不全量落盘**）：
  | 表 | 内容 | 写入时机 |
  | --- | --- | --- |
  | `rounds` | 每局结束快照：roundId / 结束方式 / 结束时间 / 存活数 / 名册 / 排名 | 房间一结束 1 秒内 |
  | `players` | 在局进度：名字 / 阵营 / 存活 / 分数 / 筹码 / 道具 | 每 60 秒 + 结算时 |
- **实时状态仍只在内存**（位置、指令去重、SSE 快照）：20Hz 写库只会拖慢服务，且局域网试玩是"一局制"。
- 启动时 `loadLastRound()` 回填 `room.lastResult`，所以**重启后管理页仍能看到上局排名**。
- 开关：`SID_DB=0` 关闭；`SID_DB_FILE` 指定路径；**`SID_TEST=1` 自动关闭**（保证自测互不污染）。
- 已验证：跨进程读回（同一文件第二个进程能读到上一局）、真实服务 `host/finish` 后 `rounds=1 / players=1`、回归套件全部持平。

### 6.4 多日长局 + 背包被动（第三轮）

**多日长局**：默认 7 天一场（`SID_DURATION_MS` 覆盖）。SQLite 新增 `snapshot` 表，
每 5 秒落一次「玩家 + 会话」，重启后原样恢复 —— 实测重启后同一令牌仍指向同一 `id/name/chips`，
时限仍为 `604800000ms`；房间被清空时自动删除快照。

**背包被动**：物品不再只有 3 种效果。49 件非消耗品各带一条**在包生效**的被动（哈希稳定分配，稀有度决定数值），
17 件消耗品保留主动使用：

| 被动 | 效果 | 上限 |
| --- | --- | --- |
| 轻身 | 移动速度 +N% | 40% |
| 眼力 | 每次搜索多翻 N 件 | 2 |
| 行情 | 卖出物品筹码 +N% | 50% |
| 硬朗 | 被 J 命中时眩晕 -N% | 50% |
| 手气 | 开出稀有物品概率 +N%（每 25% 多掷一次取高） | 50% |
| 人脉 | NPC 线索兑换便宜 N 筹码 | 1 |

已接线处：`step()` 速度、J 命中眩晕、`searchStart` 翻格数 + 稀有度、`sellItem` 售价、`interact` 兑换价；
背包面板每行显示「在包生效：…」，卖掉/用掉立刻失效。

---

## 七、已知边界

- **离线 demo（`demo/`）仍是一键搜索、且没有房间**：本轮只把共享的 `world / scene` 升级（主题与陈设对 demo 同样生效），房间与物品格是联机客户端 `game.js` 的能力。demo 的奖励逻辑按 `entity.type` 取值，新增容器在 demo 里也能搜。
- 房间是**楼层的子空间**，不做持久化；服务端重启后回到楼层。
- 房间内视角会跟随玩家滚动（房间世界尺寸 520–760 × 360–470，大于一屏的世界可视区），不是"整间一眼看全"。
- 物品格的内容在揭示前不下发，但**已揭示**的格子在客户端可见；这是"逐格揭示"本身的语义，不是漏洞。
- 新的 34 种战利品里，折算筹码普遍很低（普通 0–1、稀有 4–5、传说 25–30），因为容器数量从 17 涨到 104，避免一次性打穿筹码经济。
