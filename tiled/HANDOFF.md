# 交接：Tiled 地图系统重做（进度快照）

更新时间：2026-10-18

## 2026-10-18 第 4 步（逐层布局 / 碰撞 B / 电梯原坐标）

- **7 层独立布局**：`tiled/build-floors.mjs` 的 `LAYOUTS` 手写脊柱 + 功能区；每层主路径从左电梯到右电梯，路径形态逐层不同。
- **房间版 + 5F 迷宫（第 4 步定稿）**：1F–4F/6F/7F 为 2 格宽环廊/隔墙 + 结构柱/设备间；5F 为 1 格宽走廊迷宫 + 石室，搭配战争迷雾。空地率 39.1–62.4%，实际可达 39.0–62.3%；5F 厚墙 19.6%，其余 9.5–10.1%。容量见 `tiled/CAPACITY.md`。
- **12 色**：`tiled/themes.mjs` 单一真源；`build-tilesets.mjs` 生成 12 色 4 tile 图块集。
- **碰撞 B / crowd**：90×25 tile 只做墙；门框/实心 landmark 在 `props` 里按真实 footprint 挡人；crowd 模式装饰 props 默认 `solid:false`（可在 Tiled 逐件改回）；`TMJ.solidAt()` = tile + solid props。
- **电梯原坐标**：`lift-*` 直接取 `WORLD.floorPortal()/FLOOR_SCALE`，不吸附；`export-from-world` 报告 Δ=(0,0)；电梯厅是楼板外虚拟带。
- **校验**：`validate-floors`（含厚墙/实际可达）、`validate-extra`、`tmj-collision-test`、`tmj-elevator-test` 全绿；预览图 `tiled/render/layout-floor1..7.png`。

## 2026-10-18 回滚快照

- **数据源回到 `build-floors.mjs`**：`floor*.tmj` 带 `source: build-floors`，`validate-floors.mjs` 拒绝其它来源。
- **`export-from-world.mjs` 已降级为只读碰撞校验器**：不再写地图，只输出 `tiled/collision-report.json`；当前手绘布局 vs 旧楼层差异 7031/15750 = 44.6%（预期差）。
- **边界电梯 bug 修复**：1F 现在只有 `lift-right`，7F 只有 `lift-left`；之前生成器把双向梯都写进去了。
- **已完成**：第 4 步按 B 方案落地（90×25 tile + props 真实 footprint），电梯对象取 `floorPortal()` 原坐标；主题表 `tiled/THEME-TABLE.md` 已确认。碰撞粒度/电梯坐标/逐层布局三项关闭。

## 已完成

- `tiled/floor1..7.tmj`：90×25 格、16px，图层 `ground / decor / objects / collision / zones / props / markers`
- 每层主题图块集：`build-tilesets.mjs` 用 Node `zlib.deflateSync` + CRC32 生成 `tileset-floorN.png/.tsj`（4 个 16×16 图块：ground / wall / decor / object），TMJ 的 `tilesets` 已引用
- 每层属性 `theme`、`palette`（12 色）、`source=build-floors`、`grid=90x25@16`、`collision=tiles+props`
- 电梯：第 1 层仅 `lift-right→2`，第 7 层仅 `lift-left→6`，中间层左下行右上行；`lift-*` 的 x/y/w/h = `WORLD.floorPortal()/FLOOR_SCALE`，不吸附
- `objects` 层按 2–6 格成簇；`decor` 层含墙脚线与主路径 accent1 导视；`props` 层是家具/门框真实 footprint（`solid` 标记是否挡人）
- 校验：`validate-floors.mjs`（尺寸/来源/12 色/电梯原坐标/主路径/功能区/死区/props 重叠/空地率/厚墙/实际可达）与 `validate-extra.mjs`（objects 簇/decor gid/功能区陈设/道具成组）全部通过
- 运行时：`online/shared/world/tmj.js`（UMD，解析 tile + props + zones，`solidAt/lifts/spawn/portals/stats`）
- **F1 调试层**：`online/public/js/render/tmj-debug.js` + `game.js`，F1 开关；叠 TMJ collision 层、旧家具/墙 footprint、身体盒、每层统计和 90×25 小地图
- **TMJ 接管行走碰撞（可回退）**：`SID_TMJ=1` 时 `floorCollides/floorSpawns/floorPortals/inHall/elevatorLanding/floorBounds` 全部切到 TMJ；默认关闭，旧系统逐字保留
- 预览：`tiled/preview.html`（ground/decor/objects/props/zones/虚拟电梯厅、F1 碰撞调试、WASD 分轴移动、E 乘梯切层），`tiled/serve.mjs` 起服务；`tiled/shot-preview.mjs` 输出 `tiled/render/layout-floor1..7.png`

## 未完成

1. **TMJ 画面层（已接）**：`tmj-visual.js` 画 ground/decor/objects，props 深度排序；`game.js` 补 58px 主题墙带 + 窗光/楼层牌，`tmj-visual.js` 加逐层光池；剩余素材 curation。
2. **内容对齐**：NPC（接待员→1F 检疫闸口、档案员→3F 藏书阁）、容器、42 个独立房间门点都已按 TMJ 功能区重排并 BFS 可达；房间内部几何不变，旧家具在 TMJ 模式下不渲染/挡路。
3. `decor` / `objects` / `props` 已接 7 层真实 vendor sprite（1F 84 / 2F 90 / 3F 95 / 4F 88 / 5F 82 / 6F 86 / 7F 97，80–110/层）；第二轮变体（F2 球门、F4 花/树、F7 crate/shelf/sign）已加，仍可继续逐区主素材 curation；7F 鼎形 `controlBox`/`monitorFace` 已移除。
4. `online/shared/tmj-loader.js` 是旧预览加载器，现让位给 `online/shared/world/tmj.js`；若要继续用需补 props/hall。
5. 200–300 人地图容量已按房间版 + 5F 迷宫 39.1–62.4% 可走测算（`tiled/CAPACITY.md`）；真正瓶颈是 20Hz SSE/tick/AOI/网络，需要单独压测；出生点上限已提到 1024，服务端用乘法步长打散。

## 开关 / 复跑

```bash
node tiled/build-floors.mjs
node tiled/build-tilesets.mjs
node tiled/validate-floors.mjs
node tiled/validate-extra.mjs
node tiled/export-from-world.mjs         # 只读碰撞报告，电梯 Δ 应为 0
node online/tmj-collision-test.mjs       # TMJ 碰撞/NPC/容器/房间门点/电梯厅（12/12）
node online/tmj-elevator-test.mjs        # 电梯/电梯厅/落点（PASS）

# 预览截图（先起静态服务）
node tiled/serve.mjs 8789
node tiled/shot-preview.mjs              # 输出 tiled/render/layout-floor1..7.png

# 默认：旧碰撞 + F1 叠加对比
node online/server.js
# TMJ 权威分支：服务端与客户端同开
SID_TMJ=1 SID_SSO=0 SID_DEV=1 node online/server.js
```

Windows PowerShell：

```powershell
$env:SID_TMJ='1'; $env:SID_SSO='0'; $env:SID_DEV='1'; node online/server.js
```

打开 `http://127.0.0.1:8787/`，按 **F1** 看碰撞层；快照 `config.tmj` 会自动把客户端布局切到 TMJ（无需额外 query）。

## 关键坑（省时间）

- `tools/tiled-mcp.mjs`：PowerShell 传 JSON 需 `$a = '{"k":"v"}'; --args $a`。
- `get_map_info` 返回字段叫 `revision`，不是 `expectedRevision`。
- `create_layer` 用 `operation.kind`；`update_layer` 用 `operation.patch`；`save_map` 对 untitled 文档一律拒绝（`INVALID_DESTINATION`），改走生成器写盘更省事。
- 桥接进程随 DSH 重启消失，Tiled 需重新 **Map → Tiled AI: Connect**。
- DSH 的 MCP 插件（`@deepseek-ai/dsh-mcp-client`）装了但不加载，已改用 `tools/tiled-mcp.mjs` 直连；profile 里保留的 patch 条目可以删。
- `/tiled/` 现在由 `online/server/http-util.js` 只读托管；新增 TMJ 文件不用再拷贝到 `public/`。
- TMJ tile 坐标 = 16 design px × `FLOOR_SCALE`（默认 2）；`props` 的 x/y/w/h 直接是 design px，不乘 scale；碰撞 = tile + solid props，判定用身体盒四角，和 preview 同源。















