# 当前状态（Tiled 地图系统）

## 第 4 步已落地（2026-10-18）

- **7 层独立布局**：每层一条手写主路径（左电梯 → 右电梯），6 个主题功能区；F1–F4/F6 另设东侧电梯厅，F5/F7 由东侧功能区兼作出口；路径形态逐层不同：1F 中央实验舱环岛、2F 跑道 U 形、3F 王座/藏书 zigzag、4F 森林 S 形、5F 地牢迷宫、6F 甲板/货舱折线、7F 霓虹街/全息塔折线。
- **房间版 + 5F 迷宫（第 4 步定稿）**：1F–4F/6F/7F 为 84×19 楼板 + 2 格环廊/隔墙 + 结构柱/设备间；5F 改为 1 格宽走廊迷宫 + 石室，搭配现有战争迷雾。空地率 39.1–62.4%，实际可达 39.0–62.3%；5F 厚墙 19.6%（迷宫墙），其余 9.5–10.1%。容量测算见 `tiled/CAPACITY.md`。
- **主题单一真源**：`tiled/themes.mjs`（12 色角色 + 标志物 + 功能区名），`build-floors.mjs` / `build-tilesets.mjs` / `validate-floors.mjs` 共用。
- **12 色 tileset**：每层 4 个 16×16 图块（ground / wall / decor / object），全部从 12 色角色取色。
- **7 层真实素材填充**：`props` 增加 `prop`/`propScale`；1F 84 / 2F 90 / 3F 95 / 4F 88 / 5F 82 / 6F 86 / 7F 97 件（不含门框），80–110 件/层；贴墙成组、非阻挡。7F 已按反馈去掉 `controlBox`/`monitorFace` 的“鼎”形屏，换成全息板/霓虹箭头/售货机/柜。素材表 `asset-files.mjs/json`。
- **游戏内 TMJ 画面层**：`tmj-visual.js` 预渲染 ground/decor/objects 到 2880×800 离屏 canvas；props 单独按深度排序绘制；`SID_TMJ=1` 时 8787 游戏页画 TMJ，`SID_TMJ=0` 回退旧楼层。
- **NPC/容器对齐 TMJ**：`applyTMJLayout()` 把接待员放到 1F 检疫闸口、档案员放到 3F 藏书阁；容器按 footprint 找安全功能区落点，游戏页重新绘制容器。
- **独立房间门点/墙带**：42 个门按 `ROOM_TMJ_ZONE` 映射到功能区，BFS 从 spawn 全部可达；`game.js` 补 58px 主题墙带 + 窗光 + 楼层牌；`tmj-visual.js` 加逐层环境色/光池；`tmj-collision-test` 12/12 通过。
- **第二轮 curation**：F2 加入 `sports-kenney-sportsPack` 球门并随机 A/B/C 变体；F4 红花/蓝花、树 1/树 2、灌木/石头变体；F7 neon/crate/barrel/shelf/sign 变体；容器按类型视觉缩到 0.68–0.92，交互 footprint 不变。
- **墙带主题细节**：stadium 灯点、castle/dungeon 石柱、canopy 藤蔓、ship 铆钉、neon 霓虹线、scifi 扫描线。
- **5F 迷宫/电梯厅/零重叠**：Growing Tree + 8% 回路 + 石室；7 层 sprite 视觉重叠 = 0；TMJ 电梯厅回到 `floor.halls`，轿厢不再悬空。
- **碰撞 B / crowd 模式**：90×25 tile 层做墙体；门框和实心 landmark 在 `props` 里按真实 footprint 挡人；200–300 人模式下装饰 props 默认 `solid:false`（避免家具形成第二套墙），可在 Tiled 里逐件改回 `solid:true`。`TMJ.solidAt()` = tile + solid props。
- **电梯原坐标**：`lift-*` 的 x/y/w/h 直接取 `WORLD.floorPortal(id, side) / FLOOR_SCALE`，不吸附；`export-from-world` 实测所有电梯 Δ=(0,0)。电梯厅是楼板外 144×96 world 的虚拟带，`TMJ.inside/solidAt` 放行，不写 tile 层。
- **独立房间门点**：TMJ 模式下按房间→功能区映射重新落点，不再用旧 `ROOM_SPECS` 坐标；房间内部几何不变。

## 校验（全绿）

- `node tiled/validate-floors.mjs`：7 层全部通过（尺寸 / source=build-floors / 12 色 / 电梯原坐标 / 主路径 / 功能区可达 / 死区 0 / props 不重叠 / 空地率 52–64%（5F 36–50%） / 实际可达 52–64%（5F 36–50%） / 厚墙 5F≤20%、其余≤12%）。
- `node tiled/validate-extra.mjs`：7 层全部通过（objects 2–6 格成簇 / decor gid / 功能区陈设 ≥2 / 道具 48px 内有同伴 / 7 层素材键与文件存在、装饰 80–110 件）。
- `node online/tmj-collision-test.mjs`：12/12（含 NPC/容器/房间门点/电梯厅/5F 迷雾对齐 TMJ）。
- `node online/tmj-elevator-test.mjs`：PASS。
- `node tiled/export-from-world.mjs`：只读碰撞报告，差异 7031/15750 = 44.6%（手绘布局 vs 旧楼层，预期差）；电梯 Δ 全 0。

## 关键约定

- `build-floors.mjs` 写地图，`export-from-world.mjs` 只读；不要把后者改回数据源。
- 地图 90×25 / 16px；`props` 的 x/y/w/h 是 TMJ 设计 px，不乘 `FLOOR_SCALE`；运行时再按 scale 换算世界 px。
- `collision` 非 0 = 墙；`props.solid=true` = 家具/门框；电梯厅不在 tile 层里。
- 1F 只有 `lift-right`，7F 只有 `lift-left`。

## 复跑

```bash
node tiled/build-floors.mjs
node tiled/build-tilesets.mjs
node tiled/validate-floors.mjs
node tiled/validate-extra.mjs
node tiled/export-from-world.mjs
node online/tmj-collision-test.mjs
node online/tmj-elevator-test.mjs
node tiled/serve.mjs 8789
node tiled/shot-preview.mjs          # 需先起 8789；输出 tiled/render/layout-floor1..7.png
```

## 遗留

- **房间/容器/NPC 已对齐 TMJ**；房间内部仍是独立空间，旧家具不挡路；墙带/窗光/逐层光池已接。
- **美术 curation 未完成**：2F 运动器材、4F 花/树重复、7F 箭头/全息板重复。
- **F4/F7 可走 62% 左右**：这是上一版房间设计的自然结果；容量仍够 200–300 人分层，不再为压到 55% 加墙。
- **厚墙**：其余层集中在楼板外圈 9.5–10.1%；5F 迷宫墙 19.6%。装饰 props 非阻挡，不会形成第二套墙。























