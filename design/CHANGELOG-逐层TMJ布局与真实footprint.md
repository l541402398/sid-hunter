# CHANGELOG：逐层 TMJ 布局 · 12 色主题 · 真实 footprint 碰撞

日期：2026-10-18
范围：`tiled/`（构建期地图）、`online/shared/world/tmj.js`（运行时碰撞）、`online/shared/world/floors.js`（TMJ 边界/出生点）、`online/shared/world/rooms.js`（房间门点兜底）

## 1. 数据源回滚

- `tiled/build-floors.mjs` 恢复为唯一数据源；地图属性写 `source: build-floors`。
- `tiled/export-from-world.mjs` 降级为**只读碰撞校验器**：不再写 `floor*.tmj`，只输出 `tiled/collision-report.json`；`validate-floors.mjs` 拒绝非 `build-floors` 来源。
- 修掉边界层电梯 bug：1F 只有 `lift-right`，7F 只有 `lift-left`。

## 2. 第 3 步主题表（已确认）

- 7 层 × 12 色，角色固定：`ink / void / wallShadow / wall / wallTop / floorShadow / floor / floorLight / accent1 / accent2 / warm / paper`。
- 7 个主标志物：低温实验舱 / 计分塔 / 王座法阵 / 古树祭坛 / 铁栅井 / 主桅瞭望台 / 全息广告塔。
- 每层 6 个主题功能区；F1–F4/F6 另设东侧电梯厅，F5/F7 由东侧功能区兼作出口；主题单一真源 `tiled/themes.mjs`。
- 色板：`tiled/render/theme-palettes.png`；表：`tiled/THEME-TABLE.md`。

## 3. 第 4 步逐层布局

- 每层手写主路径（2 格宽）从左侧电梯到右侧电梯，路径形态逐层不同：
  - 1F 中央实验舱环岛；2F 跑道 U 形；3F 王座/藏书 zigzag；4F 森林 S 形；
  - 5F 地牢之字；6F 甲板/货舱折线；7F 霓虹街/全息塔折线。
- 功能区贴着主路径，自动 2 格连接；每区 2–3 簇、每簇 2–4 件同族道具，道具 48px 内必须有同伴。
- **房间版定稿（第 4 步修订 3）**：从 3 格开放版回退到 2 格宽主路径/环廊 + 2 格厚功能区隔墙 + 结构柱/设备间；保留 1F/7F 真实素材填充。装饰 props 默认非阻挡（landmark/门框仍实心）。
- 空地率 57.6%–62.4%，实际可达 57.3%–62.3%；厚墙（离可走面 ≥3 格）9.5%–10.1%；死区 0。容量测算见 `tiled/CAPACITY.md`。
- 预览：`tiled/render/layout-floor1..7.png`（干净版）、`layout-floor1-debug.png`（F1 碰撞/道具/身体盒）。

## 4. 碰撞 B 方案

- 90×25 tile 层只做墙体；家具/门框进 `props` 对象层，`x/y/w/h` 为 TMJ 设计 px，可跨格、可半格。
- `TMJ.solidAt()` = tile 墙 ∪ `props.solid`；`spawnCells` 跳过道具；`floorSpawns` 再用身体盒过滤。
- 200–300 人 crowd 模式下装饰 props 默认 `solid:false`（门框/实心 landmark 仍 solid），避免家具形成第二套墙；可在 Tiled 逐件改回。
- 不再把家具整格写进 collision 层，解决“碰撞比画面大一圈/门口被整格封死”。

## 4b. 7 层真实素材填充

- `props` 增加 `prop`（vendor 素材键）与 `propScale`；素材键 → 路径集中在 `tiled/asset-files.mjs`，构建时同步 `asset-files.json`。
- 1F 84 / 2F 90 / 3F 95 / 4F 88 / 5F 82 / 6F 86 / 7F 97 件真实 sprite（不含门框），80–110 件/层；开放环廊新增贴墙成组装饰，非阻挡。
- 1F 使用 `antea-office`（桌/椅/植物/柜）+ `cyber-warped`（控制台/监控/霓虹）+ `dungeon-0x72`（箱/柱/头骨）。
- 7F 使用 `cyber-warped`（霓虹箭头/自动售货机/柜/天线/招牌）+ `cyber-neon`（全息板）+ `dungeon-0x72`（箱/柱）；按反馈移除 7F 的 `controlBox`/`monitorFace`（类似“鼎”的屏+腿造型），换成全息板/箭头/售货机/柜。
- `preview.html` 加载真实 PNG 绘制，7 层全部生效；素材缺失才回退 blockout。
- `validate-extra` 增加素材键/文件存在与 80–110 件密度检查。

## 4c. 游戏内 TMJ 画面层

- 新增 `online/public/js/render/tmj-visual.js`：把 ground/decor/objects/props 预渲染成 2880×800 离屏 canvas，游戏页每帧只 drawImage 一次。
- `SID_TMJ=1` 时 8787 游戏页画 TMJ；`SID_TMJ=0` 回退旧楼层，开关和权威碰撞共用 `config.tmj`。
- `online/server/config.js` 静态白名单补 `.json`，让客户端能读 `/tiled/asset-files.json`；props 走 `/assets/vendor/`。
- 已验证：TMJ 模式 F1 实机截图、WASD 移动 x 2064→2292，console/runtime error 0。
- 未完成：props 整层烘焙，树/柱子不会遮挡玩家；旧 NPC/容器/独立房间仍未对齐 TMJ 坐标。

## 4d. NPC / 容器对齐 TMJ

- `applyTMJLayout()` 现在把接待员小禾放到 1F 检疫闸口、档案员阿卷放到 3F 藏书阁；坐标取功能区中心最近的可走格。
- 容器按原 footprint 在主题功能区找安全落点，并同步 `footprint.blocks/depth`；7 层容器角点均不压 TMJ 墙/实心 props。
- 游戏内 TMJ 画面层重新绘制容器，`tmj-collision-test` 增加 NPC/容器断言，8/8 通过。
- 未完成：独立房间门点与主题功能区一一映射。

## 4e. 独立房间门点 / 墙带 / 窗光

- `rooms.js` 增加 `ROOM_TMJ_ZONE` 与 `applyTMJRoomDoors()`：42 个房间门按房间→功能区重新落点，避免旧 `ROOM_SPECS` 坐标落在 TMJ 墙里；`world.js` 的 `applyTMJLayout()` 统一调用。
- 门点校验：全部在功能区、`TMJ.solidAt=false`、从 TMJ spawn BFS 可达；`tmj-collision-test` 10/10。
- `game.js` 新增 `drawTMJWallBand()`：58px 主题墙带 + 窗户玻璃光 + 中央楼层牌，补回 3/4 角色的“墙”参照；容器/道具在墙带以上不绘制。
- `tmj-visual.js` 增加逐层 `AMBIENT` 环境色与 `LIGHT_POOLS` 光池，地面烘焙时叠在 props 下方，强化 1F 冷光、2F 球场暖光、3F/5F 火光、4F 林间光、6F 落日、7F 霓虹。
- 未完成：2F/4F/7F 素材重复与房间材质 curation。

## 4f. 第二轮素材 curation

- F2 接入 `sports-kenney-sportsPack/PNG/Elements/element (78–80).png` 球门，按坐标随机 A/B/C，球场不再只有柜/补给箱。
- `assetOf(floorId, kind, seed)` 支持按坐标确定性变体：F4 红/蓝花、树 1/树 2、灌木/石头；F7 neon/crate/barrel/shelf/sign；F1/F3/F7 大小植物。
- 容器按类型视觉缩放 0.68–0.92（reception 0.68、desk/table 0.82、crate 0.92），交互 footprint / `blocks` 不变。
- 墙带按主题加细节：stadium 灯点、castle/dungeon 石柱、canopy 藤蔓、ship 铆钉、neon 霓虹线、scifi 扫描线。
- F2 装饰 90 件、F4 88 件、F7 97 件，仍全部在 80–110；`validate-extra` 通过。

## 4g. 5F 迷宫 / 电梯厅 / 零重叠

- `build-floors.mjs` 增加 `carveMazeFloor()`：5F 用 Growing Tree + 8% 回路 + 1 格宽走廊 + 石室；电梯入口/主路径 BFS 保留，战争迷雾半径从 340 缩到 180，人物可见圈明显收小。
- 5F 可走 39.1%，厚墙 19.6%（迷宫墙），校验放宽到 5F≤20%；其余层仍 ≤12%。
- 5F 火把/环境光池半径：紫/橙 0.24→0.18、冷光 0.22→0.16，alpha 同步下调，避免火光糊满迷宫走廊。
- `asset-sizes.json` + `visualRectOf()`：props 放置时按真实 sprite 尺寸避让，7 层视觉重叠 = 0。
- `applyTMJLayout()` 把 TMJ `portal.hall` 写回 `floor.halls`，`SCENE.halls` 重新画出 144×96 电梯厅，轿厢不再悬空。
- 测试：`tmj-collision-test` 12/12（新增电梯厅保留、5F 迷雾配置、房间门点 BFS 可达）；`tmj-elevator-test` PASS。

## 5. 电梯与电梯厅

- `lift-*` 的 x/y/w/h 直接取 `WORLD.floorPortal(id, side) / FLOOR_SCALE`，不吸附；`collision-report` 实测 Δ=(0,0)。
- 电梯厅在楼板外（144×96 world = 72×48 design），不写 tile 层；`TMJ.inside/solidAt` 用虚拟厅放行，`floorBounds` 向左右各外扩 72 design px。
- 门框用 `props` 的 `jamb` 矩形收窄到 48 world 门洞。

## 6. 兼容处理

- `rooms.js snapDoor()` 保留全层兜底；`SID_TMJ=1` 下 42 个房间门点已按 `ROOM_TMJ_ZONE` 映射到功能区并 BFS 可达。
- `online/shared/tmj-loader.js` 标为旧加载器，补了 props/halls；运行时以 `online/shared/world/tmj.js` 为准。

## 7. 验证

```bash
node tiled/build-floors.mjs
node tiled/build-tilesets.mjs
node tiled/validate-floors.mjs      # 7 层全绿
node tiled/validate-extra.mjs       # 7 层全绿
node tiled/export-from-world.mjs    # 只读报告，电梯 Δ 全 0
node online/tmj-collision-test.mjs  # 6/6
node online/tmj-elevator-test.mjs   # PASS
```

## 8. 未做

- 游戏内 TMJ 画面层（ground/decor/objects/props）绘制；现在 `SID_TMJ=1` 仍画旧楼层。
- 旧家具/NPC/容器/独立房间与新区块一一对齐。
- blockout 道具换成最终像素素材。























