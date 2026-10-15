# 桌面素材库评估：`C:\Users\Administrator\Desktop\pixel-game-assets`

评估日期：2026-10-14
评估对象：`C:\Users\Administrator\Desktop\pixel-game-assets`（8,952 个文件，约 294 MB）
评估目的：判断哪些素材可用于本项目《S-ID：年终生存战》（Canvas2D / 斜俯视 2.5D / 16px 瓦片网格 / 世界 1440×400 / 设计单位 0.96px）

> 结论速览：**真正能直接用于本项目的是「2D 像素精灵 + 瓦片图集 + UI + 音效 + 字体」四类**；3D 模型（约 1000 个文件）、等距渲染图、平台跳跃侧视角色动画**不可直接使用**。办公室主题的最优包是 **Antea 办公家具包（CC-BY，需署名）**，它正好补上了当前项目缺失的沙发/显示器/打印机/白板/售货机等物件。

---

## 一、目录与资源类型清单

| 顶层目录 | 文件数 | 内容概要 |
|---|---|---|
| `kenney/` | 3,854 | Kenney 7 个包（全 CC0）：furniture-kit、city-kit-commercial、tiny-dungeon、pixel-platformer(-blocks)、ui-pack、pixel-ui-pack |
| `pixelfrog/` | 2,306 | Pixel Frog 包（CC0）：Kings and Pigs 等，角色动画帧 + Aseprite 源文件 |
| `ansimuz/` | 1,439 | Ansimuz 3 包（CC0）：SunnyLand、Sunnyland Forest、Super Grotto Escape，**含音乐** |
| `0x72/` | 1,010 | 0x72 4 包（CC0）：DungeonTileset II、16x16 Dungeon、Industrial Tileset、Dungeon UI |
| `opengameart/` | 201 | OGA 14 包：多个办公/室内包（CC0 与 CC-BY 混合） |
| `itchio/` | 61 | Antea 办公家具包（CC-BY）、bitglow 室内包 ×2（自定义许可） |
| `craftpix/` | 1 | **仅有 `TARGET_LIST.md`，素材未下载**（需登录，25 个包待下） |
| 根目录 | 3 | `CREDITS.md`（授权总表）、`kenney/LICENSE.txt`、`kenney/download.log` |

### 按文件类型统计（全库）

| 类型 | 数量 | 本项目可用性 |
|---|---|---|
| `.png` 精灵 / 图集 / 单帧 | 6,667 | ✅ 核心可用 |
| `.svg` 矢量（UI、角色） | 435 | ⚠️ 需先栅格化为 PNG |
| `.obj` / `.glb` / `.fbx` / `.dae` / `.stl` / `.mtl` 3D 模型 | 186 / 181 / 181 / 150 / 140 / 181 | ❌ Canvas2D 用不上 |
| `.gif` 动图预览 | 143 | ❌ 仅预览，非运行时资源 |
| `.jpg` 贴图 | 36 | ⚠️ 多为 3D 贴图 |
| `.aseprite` / `.ase` / `.psd` 源文件 | 49 / 22 / 43 | ⚠️ 源文件，需导出 PNG |
| `.ogg` / `.mp3` / `.wav` 音频 | 44 / 2 / 2 | ✅ 可用（服务端需加 MIME） |
| `.ttf` 字体 | 2 | ✅ 可用（服务端需加 MIME） |
| `.tmx` / `.tsx` Tiled 地图 | 5 / 3 | ⚠️ 需解析器 |
| `.cs` / `.c3p` / `.love` / `.dts` 引擎工程 | 16 / 1 / 1 / 10 | ❌ 忽略 |
| `.pdf` / `.txt` / `.md` 文档授权 | 17 / 55 / 2 | 授权凭证，保留 |

---

## 二、可用于本项目的素材（按优先级）

### ★★★ 1. Antea 办公家具包（最高价值）
`itchio/antea-free-furniture-office-equipment/Office-Furniture-Pixel-Art/Office-Furniture-Pixel-Art/`

- **授权**：CC-BY（允许商用，**必须署名**作者 `Antea ✮⋆˙ (stcrbcn)`；https://stcrbcn.itch.io/furniture-office-set）
- **格式**：40+ 个独立透明 PNG，`0-Tileset.png` 为 224×192 总览图
- **尺寸**：大件 **32×32**、小件 **16×16**
- **内容（正对本项目缺口）**：`Desk`、`Desk-2`、`Boss-Desk`、`Chair`、`Chair-2`、`Boss-Chair`、`Filing-Cabinet-Small/Tall/Open`、`Wide-Filing-Cabinet`、`Big-Sofa`、`Big-Sofa-2`、`Small-Sofa`、`Big-Plant`、`Small-Plant`、`Bookshelf`、`Tall-Bookshelf`、`Printer`、`Printer-Furniture`、`Big-Office-Printer`、`Board`（白板）、`Wall-Clock`、`Wall-Graph`、`Wall-Note(-2)`、`Wall-Shelf`、`Coffee-Machine`、`Vending-Machine`、`Water-Dispenser`、`Toilet-Open/Closed`、`WC-Sink`、`WC-Paper`、`Mirror`、`Bin`、`Folders(-2)`、`Papers`、`Books`、`Small-Table`、`Big-Round-Table`
- **适用场景**：2F–6F 全部办公区/会议室/茶水间/卫生间/档案区；补上当前 Kenney 包没有的**沙发、显示器桌面、打印机、白板、售货机、饮水机、马桶**
- **注意**：① 32px 大件应按 2×2 瓦片绘制，**不要压成 16px**（会糊）；② 与 Kenney 16px 瓦片混用需保持最近邻缩放；③ 风格为深蓝灰现代风，与 Kenney Roguelike Indoors 的暖木色**不同**，建议「按楼层分风格」而不是同一层混搭

### ★★★ 2. Kenney `ui-pack` + `pixel-ui-pack`（UI 与音效字体）
- **授权**：CC0，无需署名
- **可用内容**：
  - `ui-pack/PNG/`、`ui-pack/Vector/`（SVG）：按钮、面板、滑条、光标
  - `ui-pack/Font/Kenney Future.ttf`、`Kenney Future Narrow.ttf` → **可直接给 HUD/选层面板用**
  - `ui-pack/Sounds/`：`click-a/b.ogg`、`switch-a/b.ogg`、`tap-a/b.ogg` → 6 个 UI 音效，**可直接接电梯按钮/开门/选层**
  - `pixel-ui-pack/Spritesheet/UIpackSheet_transparent.png`（538×592，750+ 件）→ 像素风 UI 九宫格与图标
- **适用场景**：当前 UI 是 DOM 实现，可先用像素 UI 图集做图标/边框皮肤；音效可立即接入
- **注意**：TTF 与 OGG **不在服务端白名单内**（`online/server.js` 仅允许 `.html/.css/.js/.ico/.png/.jpg/.jpeg/.webp`），要用必须补 MIME

### ★★ 3. Kenney 16px 瓦片图集（CC0）
`kenney/tiny-dungeon/Tilemap/tilemap_packed.png`（192×176）、`kenney/pixel-platformer/Tilemap/tilemap_packed.png`（360×162）、`pixel-platformer-blocks`
- **授权**：CC0
- **适用场景**：地牢/平台跳跃主题，**与本项目办公室主题不符**；可挑其中通用物件（箱子、货架、灯具、地板）
- **注意**：`kenney/furniture-kit/`、`city-kit-commercial/` 是 **3D 模型包**（OBJ/GLB/FBX + 预览图），**本项目用不了**

### ★★ 4. OpenGameArt 室内/办公包
| 包 | 授权 | 内容与可用性 |
|---|---|---|
| `office-space-tileset/offie-space-tileset.png`（480×192） | CC0 | **侧视**办公室瓦片（16px），可挑打印机/柜子等道具；侧视≠斜俯视，注意朝向 |
| `office-supplies/`（`Printer.png` 185×252、`Recycling Bin.png`） | CC0 | 道具单图，但**分辨率尺度远大于 16px**，需大幅缩小，画质有风险 |
| `office-supplies-32x32/`（4 张 32×32） | CC0 | 笔筒、文件、胶带、水瓶，**尺寸合适可直接用** |
| `office-characters-topdown/characters_0.svg` | CC0 | **唯一的俯视办公人物矢量**；SVG 需栅格化后才能 `drawImage` |
| `indoor-rpg-tileset-baseline`（112×192）、`indoor-rpg-tileset-expansion-1`（176×192） | CC-BY 3.0 | 16×16 室内墙/地板/家具，可做墙地变化 |
| `school-tileset-16x16/`（`bofhblk.png` 320×800 等） | CC-BY 3.0 | 16×16 教室/室内墙地 + 人物帧，可做室内变体 |
| `bunker-office-tiles/tiles_9.png` | CC0 | **8×8** 俯视办公，分辨率过低，优先级低 |
| `3td-office-starter-pack/`、`office-desk-and-chair-set/`、`office-set-two/` | CC0 | **全部是 3D 模型**（DAE/OBJ/DTS + JPG/TGA 贴图）→ ❌ 不可用 |
| `cubicle-mini-tile-set/extracted/office/office.png`（608×368） | CC-BY 3.0 | **等距（isometric）3D 渲染**，与斜俯视 2.5D 投影不兼容 → ❌ 除非整体改等距 |
| `office-furniture-64x128-isometric/TileObjectsOfficeFurniture.png`（1024×1024） | CC-BY 3.0 | 64×128 **等距**，尺度与投影都不兼容 → ❌ |
| `forest-rpg-tiles/` | CC-BY 3.0 | 32×32 森林，主题不符（或用于屋顶花园） |

### ★★ 5. bitglow Pixel Interior（卫生间 / 客厅厨房）
`itchio/bitglow-pixel-interior-bathroom/`、`itchio/bitglow-pixel-interior-livingroom-kitchen/`
- **授权**：Bitglow Asset License（自定义）——个人与商业项目可用、可修改；**禁止转售、禁止作为独立文件再分发、禁止打包进其他素材包、禁止分享给项目外人员**。署名非强制但建议
- **内容**：`cabinets_BA` 160×112、`fixtures_BA` 208×112、`textiles_BA` 317×186、`cabinets_LRK` 752×405、`floorswalls_LRK` 224×256、`kitchen_LRK` 416×400、`livingroom_LRK` 624×416、`decorations_LRK` 192×160、`doorswindowsstairs_LRK` 736×256
- **适用场景**：1F 后厨/食堂、各层卫生间、茶水间
- **注意**：① 风格比 Kenney/Antea 更柔和细腻，同层混用会不协调；② 因「禁止再分发」，**不能把原包文件作为可下载资源随项目发布**，只能作为游戏内素材使用；③ 与 16px 网格对齐需自行核对格宽

### ★ 6. 0x72（CC0，主题不符但可用作局部）
`industrial.v2.png`（512×512）、`0x72_DungeonTilesetII_v1.7.png`（512×512）、`dungeonui/dungeonui.v1.png`
- **适用场景**：`Industrial` 可做 7F 机房/设备层或档案地库；`Dungeon UI` 可做 UI 边框
- **注意**：地牢/工业题材与办公室主题冲突，**不建议大面积使用**

### ★ 7. 音频（可直接用）
| 文件 | 来源 | 授权 |
|---|---|---|
| `kenney/ui-pack/Sounds/*.ogg`（6 个） | Kenney | CC0 ✅ |
| `ansimuz/sunny-land/SunnyLand Music/adventure pack 1 ogg/`（8 个）、`adventure pack 2 ogg/`（8 个） | Ansimuz | 包标 CC0 ⚠️ **但目录名标注 "Music by Pascal Belisle"，音乐署名与包授权可能不同，使用前需单独核实** |
| `ansimuz/sunny-land/Music by Pascal Belisle/platformer_level03.mp3 / _loop.ogg` | Pascal Belisle | ⚠️ 同上，需核实 |
| `ansimuz/super-grotto-escape/…/SuperGrottoEscape.ogg / .wav` | Ansimuz | CC0 |
- **格式兼容**：浏览器原生支持 OGG Vorbis / MP3 / WAV；**服务端需补 `.ogg/.mp3/.wav` 白名单与 `audio/*` MIME**
- **适用场景**：当前项目**尚无背景音乐**，可用 Ansimuz 曲目做 BGM；Kenney 6 个音效可直接用于电梯开关门/选层/交互反馈

### ★ 8. 字体
`kenney/ui-pack/Font/Kenney Future.ttf`、`Kenney Future Narrow.ttf`（CC0）
- **适用场景**：HUD、选层面板、结算页
- **注意**：需补 `.ttf` + `font/ttf` MIME，或转 WOFF2 后内嵌；中文仍需系统字体（该字体不含汉字）

### ✖ 9. 不可用（明确排除）
- **Pixel Frog（2,306 文件）**：Kings and Pigs 等为**侧视平台跳跃**角色动画帧 + Aseprite 源文件；无俯视办公人物 → 角色与地形均不适配
- **Ansimuz 美术**：SunnyLand / Forest / Super Grotto 均为侧视平台跳跃，**只有音乐可用**
- **所有 3D 包**（Kenney furniture-kit / city-kit-commercial、OGA 3td / office-desk-and-chair-set / office-set-two）
- **等距包**（cubicle-mini-tile-set、office-furniture-64x128-isometric）
- **CraftPix**：**素材未下载**（仅清单），无法评估
- **`.DS_Store`（158 个）、`__MACOSX/` 垃圾目录**：应清理

---

## 三、格式兼容性与接入注意事项

1. **服务端白名单**：`online/server.js` 当前允许 `.html/.css/.js/.ico/.png/.jpg/.jpeg/.webp`。**PNG/JPG 可直接用**；要用 **OGG/MP3/WAV/TTF** 必须补扩展名与 MIME，否则 404。
2. **投影与视角**：本项目为**斜俯视 2.5D（正交）**。等距（isometric）素材与侧视（side-view）素材**不可直接混入**，否则穿帮。
3. **像素密度**：本项目瓦片网格 **16px、最近邻缩放**。
   - 16px 素材 → 直接对齐
   - 32px 素材（Antea 大件）→ 按 **2×2 瓦片**绘制
   - 8px（bunker）→ 过细，会与 16px 冲突
   - 185×252（OGA Printer）→ 尺度严重不符，缩小后画质损失
4. **风格一致性**：全库至少存在 4 种不同画风（Kenney 暖木 / Antea 深蓝现代 / bitglow 柔和细腻 / Ansimuz 明亮卡通）。**建议按楼层分配风格**（正好契合"每层风格各不相同"的需求），而不是同一层混搭。
5. **源文件不能直接上线**：`.aseprite/.ase/.psd/.svg` 需先导出为 PNG。
6. **人物**：全库**没有可用的俯视办公室角色动画**（仅 OGA 一张 CC0 SVG 俯视角色）。当前项目用"身份配色程序化角色"是对的，建议保留。
7. **7F 健身器材**：全库**没有跑步机/哑铃架**等健身设备 → 仍是缺口，需程序化绘制或另寻素材。

---

## 四、授权汇总（务必遵守）

| 授权 | 包 | 义务 |
|---|---|---|
| **CC0 1.0** | Kenney 全部 7 包、Pixel Frog、Ansimuz（美术）、0x72 全部、OGA 的 CC0 包（office-space、office-supplies、3td、office-desk-and-chair-set、office-set-two、office-characters-topdown、bunker） | 无需署名，可直接商用 |
| **CC-BY 3.0** | **Antea 办公家具包**、OGA cubicle-mini-tile-set（Clint Bellanger）、indoor-rpg-tileset baseline/expansion（Redshrike & Jetrel）、school-tileset（qubodup）、forest-rpg-tiles、office-furniture-64x128-isometric（extradave） | **必须署名**作者，建议集中写入 README/游戏内致谢页 |
| **Bitglow 自定义** | bitglow 卫生间 / 客厅厨房 | 可商用可修改；**禁止转售、禁止独立再分发、禁止并入其他素材包** |
| **CraftPix royalty-free** | 未下载 | 非 CC0，条款以页面为准 |

> `CREDITS.md` 记录该库用于"非商用"；但 Antea 等 CC-BY 本身允许商用，若将来转商用，**署名义务依然存在**。

---

## 五、针对本项目的落地建议

| 用途 | 推荐素材 | 备注 |
|---|---|---|
| 2F–6F 办公家具（主） | **Antea 包** | 补齐沙发/显示器/打印机/白板/售货机/饮水机/马桶；CC-BY 需署名 |
| 地板 / 墙面 | Kenney Modern City 地板瓦片（已接入）+ OGA indoor-rpg / school 16px 墙地 | 每层换一种地板图案 |
| 1F 食堂/后厨、卫生间、茶水间 | bitglow LRK / Bathroom | 注意禁止再分发 |
| UI 皮肤 / 图标 | Kenney pixel-ui-pack + ui-pack | CC0 |
| HUD 字体 | Kenney Future TTF | 需补 MIME，不含中文 |
| 交互音效 | Kenney ui-pack Sounds（6 个 OGG） | 电梯开门/选层/点击 |
| 背景音乐 | Ansimuz Adventure pack 1/2 | **先核实 Pascal Belisle 音乐授权** |
| 7F 机房/设备 | 0x72 Industrial | 局部点缀，勿大面积 |
| 角色 | 保留现有身份配色程序化角色 | 全库无可用俯视办公人物 |
| 健身器材（7F） | 无 | 仍缺，需程序化或另寻 |

### 需要清理
- `__MACOSX/` 目录与 `.DS_Store`（158 个）：解压残留垃圾，建议删除
- `craftpix/` 仅 1 个清单文件：素材未下载，若需要须登录后手动下载

---

*本评估仅基于实际遍历文件、读取各包 `source.txt` / `License.txt` / `license.txt` 与 PNG 头信息（尺寸）得出；未把预览图当作可用素材，也未对未下载的 CraftPix 内容作任何推断。*
