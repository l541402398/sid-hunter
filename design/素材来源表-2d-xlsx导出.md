# 2d.xlsx 素材来源表（导出报告）

- **源文件**：`C:\Users\Administrator\Desktop\2d.xlsx`
- **导出日期**：2026-10-17
- **导出方式**：openpyxl 读取全部单元格（`data_only=True`），值为空则不列
- **说明**：`~$2d.xlsx` 为 Excel 临时锁文件，按指示忽略，未读取
- **工作表**：2 个 —— `像素素材网站`（A1:G8）、`授权说明`（A1:B5）；均无合并单元格

---

## 工作表 1：像素素材网站

范围 `A1:G8`（表头 1 行 + 数据 7 行 × 7 列）

| 序号 | 网站 | 素材特点 | 推荐游戏类型 | 免费商用情况 | 网址 | 备注 |
|---|---|---|---|---|---|---|
| 1 | itch.io | 角色、地图、怪物、UI、动画 | 综合/RPG/经营 | 依具体素材授权 | https://itch.io/game-assets/free/tag-pixel-art | 可筛选免费素材 |
| 2 | Kenney | 成套地图、建筑、道具、UI | 原型/经营/RPG | CC0 | https://kenney.nl/assets | 风格统一 |
| 3 | OpenGameArt | 角色、地牢、特效、音乐 | RPG/地牢 | 依具体素材授权 | https://opengameart.org/ | 按授权类型筛选 |
| 4 | Pixel Frog | 角色动作、敌人、地形、机关 | 横版动作/平台跳跃 | 多款 CC0，逐包核实 | https://pixelfrog-assets.itch.io/ | Pixel Adventure 系列 |
| 5 | Ansimuz | 16-bit场景、森林、城堡、科幻 | 横版/暗黑/科幻 | 免费与付费混合，逐包核实 | https://ansimuz.itch.io/ | 适合复古场景 |
| 6 | 0x72 | 地牢、怪物、武器、道具 | Roguelike/地牢 | 多款 CC0，逐包核实 | https://0x72.itch.io/ | Dungeon Tileset II |
| 7 | CraftPix | 角色、建筑、地图、UI素材包 | 经营/RPG/生存 | 按具体许可条款 | https://craftpix.net/freebies/ | 免费专区 |

### 提取出的站点 URL 清单（可直接使用）

| # | 站点 | URL |
|---|---|---|
| 1 | itch.io 免费像素素材筛选页 | https://itch.io/game-assets/free/tag-pixel-art |
| 2 | Kenney 素材总览 | https://kenney.nl/assets |
| 3 | OpenGameArt 首页 | https://opengameart.org/ |
| 4 | Pixel Frog（itch.io） | https://pixelfrog-assets.itch.io/ |
| 5 | Ansimuz（itch.io） | https://ansimuz.itch.io/ |
| 6 | 0x72（itch.io） | https://0x72.itch.io/ |
| 7 | CraftPix 免费专区 | https://craftpix.net/freebies/ |

---

## 工作表 2：授权说明

范围 `A1:B5`（表头 1 行 + 数据 4 行 × 2 列）

| 授权类型 | 使用提示 |
|---|---|
| CC0 | 通常可商用且无需署名，但仍应保存原始授权说明 |
| CC-BY | 一般可商用，但需要按要求署名 |
| CC-BY-SA | 通常可商用，改编作品需遵守相同方式共享要求 |
| 自定义/个人免费 | 务必查看是否允许商业使用、修改和分发 |

---

## 逐单元格原始明细（坐标 / 数据类型 / 值）

### 工作表：像素素材网站

| 坐标 | 类型 | 值 |
|---|---|---|
| `像素素材网站!A1` | str | 序号 |
| `像素素材网站!B1` | str | 网站 |
| `像素素材网站!C1` | str | 素材特点 |
| `像素素材网站!D1` | str | 推荐游戏类型 |
| `像素素材网站!E1` | str | 免费商用情况 |
| `像素素材网站!F1` | str | 网址 |
| `像素素材网站!G1` | str | 备注 |
| `像素素材网站!A2` | int | 1 |
| `像素素材网站!B2` | str | itch.io |
| `像素素材网站!C2` | str | 角色、地图、怪物、UI、动画 |
| `像素素材网站!D2` | str | 综合/RPG/经营 |
| `像素素材网站!E2` | str | 依具体素材授权 |
| `像素素材网站!F2` | str | https://itch.io/game-assets/free/tag-pixel-art |
| `像素素材网站!G2` | str | 可筛选免费素材 |
| `像素素材网站!A3` | int | 2 |
| `像素素材网站!B3` | str | Kenney |
| `像素素材网站!C3` | str | 成套地图、建筑、道具、UI |
| `像素素材网站!D3` | str | 原型/经营/RPG |
| `像素素材网站!E3` | str | CC0 |
| `像素素材网站!F3` | str | https://kenney.nl/assets |
| `像素素材网站!G3` | str | 风格统一 |
| `像素素材网站!A4` | int | 3 |
| `像素素材网站!B4` | str | OpenGameArt |
| `像素素材网站!C4` | str | 角色、地牢、特效、音乐 |
| `像素素材网站!D4` | str | RPG/地牢 |
| `像素素材网站!E4` | str | 依具体素材授权 |
| `像素素材网站!F4` | str | https://opengameart.org/ |
| `像素素材网站!G4` | str | 按授权类型筛选 |
| `像素素材网站!A5` | int | 4 |
| `像素素材网站!B5` | str | Pixel Frog |
| `像素素材网站!C5` | str | 角色动作、敌人、地形、机关 |
| `像素素材网站!D5` | str | 横版动作/平台跳跃 |
| `像素素材网站!E5` | str | 多款 CC0，逐包核实 |
| `像素素材网站!F5` | str | https://pixelfrog-assets.itch.io/ |
| `像素素材网站!G5` | str | Pixel Adventure 系列 |
| `像素素材网站!A6` | int | 5 |
| `像素素材网站!B6` | str | Ansimuz |
| `像素素材网站!C6` | str | 16-bit场景、森林、城堡、科幻 |
| `像素素材网站!D6` | str | 横版/暗黑/科幻 |
| `像素素材网站!E6` | str | 免费与付费混合，逐包核实 |
| `像素素材网站!F6` | str | https://ansimuz.itch.io/ |
| `像素素材网站!G6` | str | 适合复古场景 |
| `像素素材网站!A7` | int | 6 |
| `像素素材网站!B7` | str | 0x72 |
| `像素素材网站!C7` | str | 地牢、怪物、武器、道具 |
| `像素素材网站!D7` | str | Roguelike/地牢 |
| `像素素材网站!E7` | str | 多款 CC0，逐包核实 |
| `像素素材网站!F7` | str | https://0x72.itch.io/ |
| `像素素材网站!G7` | str | Dungeon Tileset II |
| `像素素材网站!A8` | int | 7 |
| `像素素材网站!B8` | str | CraftPix |
| `像素素材网站!C8` | str | 角色、建筑、地图、UI素材包 |
| `像素素材网站!D8` | str | 经营/RPG/生存 |
| `像素素材网站!E8` | str | 按具体许可条款 |
| `像素素材网站!F8` | str | https://craftpix.net/freebies/ |
| `像素素材网站!G8` | str | 免费专区 |

### 工作表：授权说明

| 坐标 | 类型 | 值 |
|---|---|---|
| `授权说明!A1` | str | 授权类型 |
| `授权说明!B1` | str | 使用提示 |
| `授权说明!A2` | str | CC0 |
| `授权说明!B2` | str | 通常可商用且无需署名，但仍应保存原始授权说明 |
| `授权说明!A3` | str | CC-BY |
| `授权说明!B3` | str | 一般可商用，但需要按要求署名 |
| `授权说明!A4` | str | CC-BY-SA |
| `授权说明!B4` | str | 通常可商用，改编作品需遵守相同方式共享要求 |
| `授权说明!A5` | str | 自定义/个人免费 |
| `授权说明!B5` | str | 务必查看是否允许商业使用、修改和分发 |

---

## 表格本身未包含的信息（明确声明）

该 xlsx 只有上表 7 列，**不存在以下列/信息**，请勿假定其存在：

| 项目 | 是否在 xlsx 中 | 何处可查 |
|---|---|---|
| 素材包名 | ❌ 无（只有"网站"，不是具体包） | 各包 `source.txt`、`C:\Users\Administrator\Desktop\pixel-game-assets\CREDITS.md` |
| 用途 | ⚠️ 近似字段为"推荐游戏类型"，非具体用途 | 同上 |
| 备注 | ✅ 有（G 列） | — |
| **是否已下载** | ❌ **无此列** | 各包 `source.txt` 的"下载状态"字段；本报告第 1 节统计 |
| 具体包的数量 | ❌ 无 | 本地实测 36 个包目录（35 个含素材） |
| CraftPix 需登录 | ❌ 无 | `...\pixel-game-assets\craftpix\TARGET_LIST.md` |
| 单包精确授权 | ❌ 无（仅"依具体素材授权""按具体许可条款"） | 各包 `source.txt` / `License.txt` |

---

*本导出为 `2d.xlsx` 的完整、无损内容呈现；原始逐单元格备份另见 `C:\Users\Administrator\Desktop\workplace\sid-hunter\tools\_2d-xlsx-dump.md`。*
