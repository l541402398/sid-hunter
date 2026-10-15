oga-indoor —— OpenGameArt 室内 RPG 图集（CC-BY 3.0，运行时须署名）
================================================================

本目录内的 PNG 由桌面素材库中 OpenGameArt 原包复制而来（原包带 source.txt，本文件为其凭据留档）。

文件与来源
----------
baseline.png      <- indoor-rpg-tileset-baseline/tilesetformattedupdate1.png
extratiles.png    <- indoor-rpg-tileset-baseline/16x16extratiles.PNG
expansion1.png    <- indoor-rpg-tileset-expansion-1/rpg indoor tileset expansion 1 trans.png

包 1：16x16 indoor rpg tileset: the baseline
  作者：Redshrike
  授权：CC-BY 3.0 / OGA-BY 3.0
  原址：https://opengameart.org/content/16x16-indoor-rpg-tileset-the-baseline

包 2：RPG Indoor Tileset: Expansion 1
  作者：Stephen Challener (Redshrike) and Jetrel
  授权：CC-BY 3.0 / GPL 2.0 / GPL 3.0 / OGA-BY 3.0
  原址：https://opengameart.org/content/rpg-indoor-tileset-expansion-1

强制署名（进游戏 Credits / README 第三方素材署名）
--------------------------------------------------
"16x16 indoor rpg tileset: the baseline" by Redshrike (CC-BY 3.0, OpenGameArt.org)
"RPG Indoor Tileset: Expansion 1" by Stephen Challener (Redshrike) and Jetrel (CC-BY 3.0, OpenGameArt.org)

注意事项
--------
1) 原图为 colortype=2 RGB + 洋红 #FF00FF 色键（无 alpha 通道）。运行时会带着洋红方块，
   故这三张图必须"离线转成真 alpha 后再上架"；离线成品生成脚本见 outputs/theme-work/make-alpha.mjs。
2) 带 1px 缝的图集步长为 17，本三张无 1px 缝，步长为 16（见 scene.js 的 CHROMA_TILE_SPACING）。
3) 授权非 CC0：可商用但必须署名；不得删除本文件。
