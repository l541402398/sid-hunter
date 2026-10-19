# tiled/ —— 地图系统（开发期工具 + 运行时数据）

## 产物

| 文件 | 说明 |
| --- | --- |
| `floor1.tmj … floor7.tmj` | 7 层独立布局，90×25 格 / 16px，图层 `ground / decor / objects / collision / zones / props / markers` |
| `tileset-floor1..7.png/.tsj` | 每层 4 个 16×16 主题图块（ground / wall / decor / object），12 色，由 `build-tilesets.mjs` 零依赖生成 |
| `themes.mjs` | **主题单一真源**：12 色角色、7 个标志物、功能区名 |
| `asset-files.mjs` / `asset-files.json` | **素材单一真源**：prop 键 → `online/public/assets/vendor/` 相对路径 + 默认 scale |
| `build-floors.mjs` | **唯一数据源**：84×19 楼板包络 + 2 格宽主路径/环廊 + 2 格厚功能区隔墙 + 结构柱/设备间；家具/门框走 `props` footprint（装饰默认非阻挡） |
| `export-from-world.mjs` | **只读碰撞校验器**：对比 TMJ `collision` 与旧 `WORLD.floorCollides()`，报告电梯/出生点偏移；不写 `floor*.tmj` |
| `THEME-TABLE.md` | 第 3 步主题表（已确认）：7 层 × 12 色 + 标志物 + 功能区 |
| `CAPACITY.md` | 200–300 人同层容量测算（可走格 / m² 每人 / 动线 / 出生点） |
| `collision-report.json` | 碰撞校验产物：逐层差异、电梯/出生点偏移 |
| `build-tilesets.mjs` | 零依赖 PNG 编码器（`zlib.deflateSync` + CRC32）+ `.tsj` |
| `validate-floors.mjs` | 主校验：尺寸/来源/12 色/电梯原坐标/主路径/功能区可达/死区/props 重叠/空地率 52–64%（5F 36–50%）/实际可达 52–64%（5F 36–50%）/厚墙 5F≤20%、其余≤12% |
| `validate-extra.mjs` | 补充校验：objects 2–6 格成簇、decor gid、功能区陈设、道具 48px 成组；7 层素材键/文件与 80–110 件密度 |
| `preview.html` | 可跑预览：ground/decor/objects/props/zones/虚拟电梯厅；7 层加载真实 vendor sprite；**F1** 碰撞调试、WASD、**E** 乘梯 |
| `shot-preview.mjs` | CDP 截图：`tiled/render/layout-floor1..7.png` + `layout-contact-sheet.png` |
| `render/theme-palettes.png` | 7 层 12 色板视觉预览 |
| `render/reach-overlay.png` | 可达性覆盖图：绿=可走 / 红=墙不可达 / 橙=实心 props / 青=主路径 |
| `serve.mjs` | 零依赖静态服务器，`node tiled/serve.mjs 8789` |

## 当前阶段

- **第 3 步（已确认）**：`THEME-TABLE.md` 的 12 色 / 标志物 / 功能区 / 技术 B 已落地。
- **第 4 步（已落地）**：每层独立布局，左电梯 → 主路径 → 右电梯；功能区贴路径；装饰成组。每层 6 个主题功能区；F1–F4/F6 另设东侧电梯厅，F5/F7 由东侧功能区兼作出口。
- **房间版 + 5F 迷宫（第 4 步定稿）**：1F–4F/6F/7F 为 2 格宽主路径/环廊 + 2 格厚隔墙 + 结构柱/设备间；5F 为 1 格宽走廊迷宫 + 石室，搭配战争迷雾。空地率 39.1–62.4%，实际可达 39.0–62.3%；5F 厚墙 19.6%，其余 9.5–10.1%。容量见 `CAPACITY.md`。
- **7 层真实素材填充**：`props` 增加 `prop`/`propScale`；1F 84 / 2F 90 / 3F 95 / 4F 88 / 5F 82 / 6F 86 / 7F 97 件（不含门框），80–110 件/层；贴墙成组、非阻挡。7F 去掉“鼎”形 `controlBox`/`monitorFace`，换全息板/箭头/售货机/柜。
- **游戏内 TMJ 画面层**：`online/public/js/render/tmj-visual.js` 把 ground/decor/objects 预渲染成 2880×800 离屏 canvas；props 单独按深度排序绘制；`SID_TMJ=1` 时 8787 游戏页画 TMJ，`SID_TMJ=0` 回退旧楼层。
- **NPC/容器对齐**：`applyTMJLayout()` 把接待员放 1F 检疫闸口、档案员放 3F 藏书阁；容器按 footprint 找安全功能区落点，游戏页重绘容器。
- **房间门点/墙带**：42 个门按房间→功能区映射重新落点，BFS 可达；`game.js` 补 58px 主题墙带 + 窗光 + 楼层牌；`tmj-visual.js` 加逐层环境色/光池。
- **第二轮 curation**：F2 球门 A/B/C、F4 花/树/灌木/石头变体、F7 neon/crate/barrel/shelf/sign 变体；容器按类型视觉 0.68–0.92，交互 footprint 不变。
- **墙带主题细节**：stadium 灯点、castle/dungeon 石柱、canopy 藤蔓、ship 铆钉、neon 霓虹线、scifi 扫描线。
- **5F 迷宫/电梯厅/零重叠**：Growing Tree + 8% 回路 + 石室，搭配战争迷雾；7 层 sprite 视觉重叠 = 0；TMJ 电梯厅回到 `floor.halls`，轿厢不再悬空。
- **碰撞**：90×25 美术格只做墙；门框/实心 landmark 通过 `props.solid` 按真实 footprint 挡人；crowd 模式装饰默认 `solid:false`，可在 Tiled 逐件改回。
- **电梯**：`lift-*` 的 x/y/w/h 直接取 `WORLD.floorPortal() / FLOOR_SCALE`，不吸附；电梯厅是楼板外虚拟带。

## 常用命令

```bash
node tiled/build-floors.mjs       # 唯一数据源，重新生成 7 层
node tiled/build-tilesets.mjs     # 重新生成 12 色图块集
node tiled/validate-floors.mjs    # 主校验（当前全绿）
node tiled/validate-extra.mjs     # 装饰/成组校验（当前全绿）
node tiled/export-from-world.mjs  # 只读碰撞差异报告（不写地图）
node online/tmj-collision-test.mjs
node online/tmj-elevator-test.mjs

node tiled/serve.mjs 8789         # 预览 http://127.0.0.1:8789/tiled/preview.html
node tiled/shot-preview.mjs       # 需先起 8789；输出 layout-floor*.png
```

## 数据约定

- 格子 16×16，地图 90×25；`collision` 层非 0 = 墙。
- 地形：1F–4F/6F/7F 为 84×19 楼板 + 2 格环廊/隔墙 + 结构柱/设备间；5F 为 Growing Tree 迷宫（1 格宽走廊 + 石室）；空地率 52–64%，实际可达 52–64%，厚墙 5F≤20%、其余≤12%。
- `props` 对象层：家具/门框真实 footprint，`x/y/w/h` 是 TMJ 设计 px（不乘 `FLOOR_SCALE`）；`prop`/`propScale` 指向 `asset-files.mjs` 的 vendor sprite；`solid` 由生成器决定（crowd 模式装饰默认 false，门框/实心 landmark true）。
- `zones` 对象层：每层 6 个主题功能区（F1–F4/F6 另有东侧电梯厅），带 `style` 和 `landmark` 属性。
- `decor` 层：gid 3 = 墙脚线 + 主路径 accent1 导视；`objects` 层：gid 4 = 2–6 格软装饰簇。
- `markers` 对象层：`spawn` 点 + `lift-left` / `lift-right` 矩形，属性 `side`、`targetFloor`、`targetSpawn`。
- 第 1 层只有 `lift-right`（→2），第 7 层只有 `lift-left`（→6），中间层左下行、右上行。
- 地图属性：`theme`、`palette`（12 色逗号分隔）、`source: build-floors`、`grid: 90x25@16`、`collision: tiles+props`、`landmark`、`zones`。
- 世界坐标 = TMJ 设计 px × `WORLD.FLOOR_SCALE`（默认 2）；TMJ 地图铺满 2880×800 的一层。

## 运行时

`online/shared/world/tmj.js`（UMD，服务端/浏览器共用）：

- Node 启动时同步读取 `tiled/floorN.tmj`；浏览器由 `preview.html` / `js/render/tmj-debug.js` fetch 后调用 `TMJ.install()`。
- 解析 `collision` / `ground` / `decor` / `objects` 的 gid、`props` 真实 footprint、`zones`、`markers`。
- `TMJ.solidAt(floorId,x,y,scale)` = tile 墙 ∪ solid props；楼板外只放行左右虚拟电梯厅。
- `spawnCells` 会跳过 props 占位格；`portals` 直接返回 `floorPortal` 原坐标 + 虚拟厅；`stats` 给 props/zones 计数。
- **默认关闭**；`SID_TMJ=1` 时 `online/shared/world/floors.js` 把行走碰撞、出生点、电梯厅/落点、楼层边界切到 TMJ。缺图时单层自动回退旧碰撞。
- `floorBounds` 在 TMJ 模式下向左右各外扩 72 design px（电梯厅）；`inFloor` 放行虚拟厅。
- 独立房间（zone）仍用旧房间几何；`snapDoor()` 在新布局上做全层最近可站立点兜底。

`online/public/js/render/tmj-debug.js`：**F1** 调试层。显示 TMJ 实心格（红）、旧家具/墙 footprint（黄）、玩家身体盒（青）、TMJ 出生点/电梯、整层一致率与 90×25 小地图。服务端每帧快照下发 `config.tmj`。

`tiled/preview.html`：用 `world/tmj.js` 直接画 tile + props + zones；支持 `?clean=1` 隐藏 HUD 供截图。

## 待办

- NPC/容器/房间门点已对齐 TMJ；旧家具在 TMJ 模式下不渲染/不挡路。
- TMJ 画面层/墙带/窗光/逐层光池已接；剩余：逐层材质细化、大容器视觉贴合。
- 7 层已接 vendor sprite + 第二轮变体（F2 球门、F4 花/树、F7 crate/shelf/sign）；仍可继续做逐区主素材 curation。
- 7F 的“鼎”形 `controlBox`/`monitorFace` 已移除；F1 的实验室控制台暂保留，若也想去掉可一起换。

















