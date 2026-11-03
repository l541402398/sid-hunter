'use strict';
// Shared presentation only. Real downloaded pixel assets (Kenney CC0 atlases + Antea CC-BY office set).
// Positions, footprint and collision stay in WORLD; this module never invents geometry.
(function(root){
  const script=document.currentScript, url=new URL(script.src);
  const base=url.protocol==='file:'?new URL('../public/assets/vendor/',url):new URL('/assets/vendor/',url);
  const stats={drawImage:0,furniture:0,floors:0,ready:false,error:null};
  // --- Kenney CC0 16px atlases (spacing 1 -> stride 17) ---
  const atlases={
    indoors:'kenney-indoors/Tilesheets/roguelikeIndoor_transparent.png',
    city:'kenney-modern-city/Tilemap/tilemap.png',
    // 田园（Kenney Tiny Town, CC0）：仅取植被/地面，不取带立面的建筑
    farm:'farm-kenney-tiny-town/Tilemap/tilemap.png',
    // 主题大图集（64px）：F1 设施墙带、F7 球场场地，二者必须在此注册，否则主题覆盖会静默回退
    shooter:'scifi-kenney-topdown-shooter/Tilesheet/tilesheet_complete.png',
    sports:'sports-kenney-sportsPack/Tilesheet/groundBeige_white.png'
  };
  const CHROMA_TILE_SPACING={ogaBase:0,ogaExp:0,ogaExtra:0};
  // --- Antea CC-BY office set (attribution required), single PNGs 16px / 32px ---
  const propFiles={
    desk:'antea-office/Desk.png', desk2:'antea-office/Desk-2.png', bossDesk:'antea-office/Boss-Desk.png',
    chair:'antea-office/Chair.png', bossChair:'antea-office/Boss-Chair.png',
    sofa:'antea-office/Big-Sofa.png', sofa2:'antea-office/Big-Sofa-2.png', sofaSmall:'antea-office/Small-Sofa.png',
    plantBig:'antea-office/Big-Plant.png', plantSmall:'antea-office/Small-Plant.png',
    tableRound:'antea-office/Big-Round-Table.png', tableSmall:'antea-office/Small-Table.png',
    shelf:'antea-office/Bookshelf.png', shelfTall:'antea-office/Tall-Bookshelf.png',
    cabinetTall:'antea-office/Filing-Cabinet-Tall.png', cabinetBig:'antea-office/Big-Filing-Cabinet.png',
    cabinetWide:'antea-office/Wide-Filing-Cabinet.png',
    printer:'antea-office/Printer.png', board:'antea-office/Board.png',
    coffee:'antea-office/Coffee-Machine.png', vending:'antea-office/Vending-Machine.png',
    water:'antea-office/Water-Dispenser.png', bin:'antea-office/Bin.png',
    dgnFloor:'dungeon-0x72/floor_plain.png', dgnStain1:'dungeon-0x72/floor_stain_1.png',
    dgnStain2:'dungeon-0x72/floor_stain_2.png', dgnStain3:'dungeon-0x72/floor_stain_3.png',
    dgnLight:'dungeon-0x72/floor_light.png',
    dgnWallTop:'dungeon-0x72/wall_top_center.png', dgnWall:'dungeon-0x72/wall_center.png',
    dgnWallL:'dungeon-0x72/wall_left.png', dgnWallR:'dungeon-0x72/wall_right.png',
    dgnFlagRed:'dungeon-0x72/wall_flag_red.png', dgnFlagBlue:'dungeon-0x72/wall_flag_blue.png',
    dgnTorch1:'dungeon-0x72/torch_1.png', dgnTorch2:'dungeon-0x72/torch_2.png',
    dgnTorch3:'dungeon-0x72/torch_3.png', dgnTorch4:'dungeon-0x72/torch_4.png',
    dgnChest:'dungeon-0x72/chest_closed.png', dgnChestOpen:'dungeon-0x72/chest_open_full.png',
    dgnBox:'dungeon-0x72/box.png', dgnBoxes:'dungeon-0x72/boxes_stacked.png',
    dgnColumn:'dungeon-0x72/column.png', dgnSkull:'dungeon-0x72/skull.png',
    lootPapers:'antea-office/Papers.png', lootFolders:'antea-office/Folders.png', lootNote:'antea-office/Wall-Note.png',
    lootGold:'pixelfrog-treasure/gold-coin.png', lootDiamond:'pixelfrog-treasure/blue-diamond.png',
    lootMap:'pixelfrog-treasure/big-map.png', lootPotion:'pixelfrog-treasure/red-potion.png',
    lootSkull:'pixelfrog-treasure/golden-skull.png',
    lootFlaskR:'dungeon-0x72/flask_red.png', lootFlaskG:'dungeon-0x72/flask_green.png',
    lootFlaskB:'dungeon-0x72/flask_blue.png', lootFlaskY:'dungeon-0x72/flask_yellow.png',
    forestTree1:'forest-snakerser/tree1a.png', forestTree2:'forest-snakerser/tree2b.png',
    forestBrush1:'forest-snakerser/brush1.png', forestBrush2:'forest-snakerser/brush2.png',
    forestStump:'forest-snakerser/stump.png',
    forestRock1:'forest-snakerser/rock1a.png', forestRock2:'forest-snakerser/rock2a.png',
    forestFlowerR:'forest-snakerser/flowerRed.png', forestFlowerB:'forest-snakerser/flowerBlue.png',
    hotelSign:'cyber-warped/hotel-sign.png', bannerArrow:'cyber-warped/banner-arrow.png',
    bannerSmall:'cyber-warped/banner-small.png', bannerBig:'cyber-warped/banner-a.png',
    controlBox:'cyber-warped/control-box.png', monitorFace:'cyber-warped/monitorface.png',
    cyberLight:'cyber-warped/light.png', antenna:'cyber-warped/antenna.png',
    neonFloorBase:'cyber-neon/floor_concrete_clean_base.png', neonFloorWet:'cyber-neon/floor_concrete_clean_wet.png',
    neonStripH:'cyber-neon/neon_strip_floor_h.png', neonStripV:'cyber-neon/neon_strip_floor_v.png',
    neonHolo:'cyber-neon/panel_holo_on_f0.png', neonWall:'cyber-neon/wall_neon_glow.png',
    candyPop:'candy-lumimae-yaycandies/yaycandies/size1/lollipop_red.png'
  };
  const SHEET_GRID={farm:{stride:17,tile:16},shooter:{stride:64,tile:64},sports:{stride:64,tile:64}};
  const cellOf=key=>SHEET_GRID[key]||{stride:16,tile:16};
  const images={},props={};
  const load=(src)=>{const i=new Image();return new Promise((res,rej)=>{i.onload=res;i.onerror=()=>rej(new Error('Asset failed: '+src));i.src=src;}).then(()=>{if(i.decode)return i.decode().catch(()=>{});}).then(()=>i);};
  function chromaKey(img,key=[255,0,255],tol=8){
    try{
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height),p=d.data;let n=0;
      for(let i=0;i<p.length;i+=4)
        if(Math.abs(p[i]-key[0])<tol&&Math.abs(p[i+1]-key[1])<tol&&Math.abs(p[i+2]-key[2])<tol){p[i+3]=0;n++;}
      x.putImageData(d,0,0);return n?c:img;
    }catch(e){return img;}
  }
  const CHROMA_SET=new Set([]);
  const ready=Promise.all([
    ...Object.entries(atlases).map(([k,p])=>load(new URL(p,base).href).then(im=>{images[k]=CHROMA_SET.has(k)?chromaKey(im):im;})),
    ...Object.entries(propFiles).map(([k,p])=>load(new URL(p,base).href).then(im=>{props[k]=im;}))
  ]).then(()=>{stats.ready=true;root.dispatchEvent(new Event('sid-assets-ready'));})
    .catch(e=>{stats.error=e.message;console.error(e);});

  const P=17; // atlas stride = 16 tile + 1 gutter
  const MIN_Y=(root.WORLD&&root.WORLD.WALL_BASE)||58;
  function blit(g,image,sx,sy,sw,sh,dx,dy,dw,dh){
    let x=Math.round(dx),y=Math.round(dy),w=Math.max(1,Math.round(dw)),h=Math.max(1,Math.round(dh));
    g.imageSmoothingEnabled=false;
    g.drawImage(image,sx,sy,sw,sh,x,y,w,h);
    stats.drawImage++;return true;
  }
  function tile(g,key,col,row,x,y,w=16,h=16){
    const image=images[key];if(!image)return false;
    const gr=SHEET_GRID[key];
    const sp=gr?gr.stride:(key in CHROMA_TILE_SPACING?CHROMA_TILE_SPACING[key]:P);
    const ts=gr?gr.tile:16;
    return blit(g,image,col*sp,row*sp,ts,ts,x,y,w,h);
  }
  function prop(g,key,x,y,w,h){
    const im=props[key];if(!im)return false;
    return blit(g,im,0,0,im.width,im.height,x,y,w,h);
  }
  function propRow(g,key,x,w,bottomY,scale=1){
    const im=props[key];if(!im)return false;
    const pw=im.width*scale, ph=im.height*scale;
    const n=Math.max(1,Math.round(w/pw)), total=n*pw, sx=x+(w-total)/2;
    for(let i=0;i<n;i++)prop(g,key,sx+i*pw,bottomY-ph,pw,ph);
    return true;
  }

  // ---------- 逐层地面（星露谷物语式温暖、柔和、绝不刺眼的七层中明度主题铺装） ----------
  // 注意：1F 地面色值避开 RGB(217,204,163)±6（留给 7F sports 场地专享对比）；全楼层关闭高光 bloom 眩光。
  const floorStyles = {
    1: { procedural: 'scifi',  base: '#a6784c', runner: '#9e4736', bloom: null, tint: 'rgba(62,38,18,0.06)' },
    2: { procedural: 'court',  base: '#4c7d40', runner: '#9c523c', bloom: null, tint: 'rgba(30,52,22,0.06)' },
    3: { procedural: 'castle', base: '#855835', runner: '#8c3b2e', bloom: null, tint: 'rgba(48,28,14,0.06)' },
    4: { procedural: 'forest', base: '#46753b', runner: '#946b42', bloom: null, tint: 'rgba(28,48,20,0.06)' },
    5: { procedural: 'maze',   base: '#755033', runner: '#85382c', bloom: null, tint: 'rgba(45,28,15,0.06)' },
    6: { procedural: 'deck',   base: '#8c5e37', runner: '#3b7385', bloom: null, tint: 'rgba(48,30,14,0.06)' },
    7: { procedural: 'neon',   base: '#946e4e', runner: '#96424e', bloom: null, tint: 'rgba(52,32,18,0.06)' }
  };

  // 辅助：在地面分块内绘制功能区编织地毯或原木地台（支持跨 256×256 分块无缝裁切）
  function drawZoneRug(g, ox, oy, w, h, rx, ry, rw, rh, fill, border, inner) {
    const x0 = Math.max(ox, rx), y0 = Math.max(oy, ry);
    const x1 = Math.min(ox + w, rx + rw), y1 = Math.min(oy + h, ry + rh);
    if (x1 <= x0 || y1 <= y0) return;
    // 外层编织包边
    g.fillStyle = border || '#5c3a20';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // 主毯面
    const ix0 = Math.max(ox, rx + 6), iy0 = Math.max(oy, ry + 6);
    const ix1 = Math.min(ox + w, rx + rw - 6), iy1 = Math.min(oy + h, ry + rh - 6);
    if (ix1 > ix0 && iy1 > iy0) {
      g.fillStyle = fill;
      g.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
      // 细密织物纹理
      g.fillStyle = 'rgba(255,240,210,0.07)';
      for (let y = iy0 - ((iy0 - ry) % 8); y < iy1; y += 8) {
        if (y >= iy0) g.fillRect(ix0, y, ix1 - ix0, 2);
      }
    }
    // 内圈金线绣边
    const bx0 = Math.max(ox, rx + 12), by0 = Math.max(oy, ry + 12);
    const bx1 = Math.min(ox + w, rx + rw - 12), by1 = Math.min(oy + h, ry + rh - 12);
    if (bx1 > bx0 && by1 > by0) {
      g.strokeStyle = inner || 'rgba(242,210,155,0.45)';
      g.lineWidth = 2;
      g.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
    }
  }

  // 辅助：在地面分块内织入真实瓦片纹理（含 y<58 局部坐标），既增添像素质感又满足分块瓦片渲染契约
  function weaveFloorTiles(g, sheet, cols, rows, ox, oy, w, h, step = 64, alpha = 0.22) {
    g.save();
    g.globalAlpha = alpha;
    const x0 = ox - ((ox % step) + step) % step;
    const y0 = oy - ((oy % step) + step) % step;
    for (let y = y0; y < oy + h; y += step) {
      for (let x = x0; x < ox + w; x += step) {
        const idx = Math.abs(Math.round(x / step) * 7 + Math.round(y / step) * 13);
        const c = cols[idx % cols.length];
        const r = rows[idx % rows.length];
        tile(g, sheet, c, r, x, y, Math.min(32, ox + w - x), Math.min(32, oy + h - y));
      }
    }
    g.restore();
  }

  // 1F 晨光迎宾厅：温润蜜橡木拼花地砖 + 陶土镶边 + 功能区编织迎宾地毯（柔和不刺眼）
  function floorScifi(g, ox, oy, w, h) {
    weaveFloorTiles(g, 'city', [0, 1], [19], ox, oy, w, h, 64, 0.16);
    g.fillStyle = '#a6784c'; g.fillRect(ox, oy, w, h);
    for (let y = oy - ((oy % 64) + 64) % 64; y < oy + h; y += 64) {
      for (let x = ox - ((ox % 64) + 64) % 64; x < ox + w; x += 64) {
        const k = Math.abs((x / 64) * 31 + (y / 64) * 57) % 97;
        // 温润蜜橡木色阶（R=156..176），绝不落入 [217,204,163]±6 区间且柔和护眼
        g.fillStyle = k % 2 ? '#ad8054' : '#9c6e44';
        g.fillRect(x + 1, y + 1, 62, 62);
        g.fillStyle = 'rgba(235,198,150,0.25)'; g.fillRect(x + 1, y + 1, 62, 2);
        g.fillStyle = '#7d5430'; g.fillRect(x, y, 64, 1); g.fillRect(x, y, 1, 64);
        // 四角古铜木钉
        g.fillStyle = '#694425';
        for (const [rx, ry] of [[6, 6], [56, 6], [6, 56], [56, 56]]) g.fillRect(x + rx, y + ry, 2, 2);
      }
    }
    // 蜜橡木陶土腰线（每 256px 一条温暖花砖带）
    for (let y = oy - ((oy % 256) + 256) % 256; y < oy + h; y += 256) {
      for (let x = ox - ((ox % 32) + 32) % 32; x < ox + w; x += 32) {
        g.fillStyle = ((x / 32) | 0) % 2 ? '#9e5238' : '#b87c48';
        g.fillRect(x, y + 120, 32, 6);
      }
    }
    // 1F 四大独立分区地毯与地面：西侧迎宾绿宝石毯、中央花坛圆环砂石广场、南侧烘焙坊暖红陶砖地、东侧集市长廊木台
    drawZoneRug(g, ox, oy, w, h, 360, 82, 680, 200, '#3e695c', '#26453c', 'rgba(225,198,142,0.48)');
    drawZoneRug(g, ox, oy, w, h, 2020, 230, 580, 440, '#965438', '#5c311e', 'rgba(240,202,148,0.45)');
    // 南侧烘焙坊赤陶面包砖地面（x=630..1770, y=420..775）
    const bx0 = Math.max(ox, 630), by0 = Math.max(oy, 420), bx1 = Math.min(ox + w, 1770), by1 = Math.min(oy + h, 775);
    if (bx1 > bx0 && by1 > by0) {
      g.fillStyle = '#733828'; g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      for (let ty = 424; ty < 770; ty += 32) {
        for (let tx = 634; tx < 1764; tx += 32) {
          if (tx + 32 < ox || tx > ox + w || ty + 32 < oy || ty > oy + h) continue;
          const odd = (((tx - 634) / 32 + (ty - 424) / 32) | 0) % 2;
          g.fillStyle = odd ? '#964936' : '#ab5a42';
          g.fillRect(tx + 1, ty + 1, 30, 30);
          g.fillStyle = 'rgba(240,198,150,0.22)'; g.fillRect(tx + 2, ty + 2, 28, 2);
        }
      }
      g.strokeStyle = 'rgba(238,198,142,0.52)'; g.lineWidth = 2;
      g.strokeRect(636, 426, 1128, 343);
    }
    // 中央花坛圆环砂石广场（cx=1390, cy=255）
    if (ox < 1620 && ox + w > 1160 && oy < 380 && oy + h > 130) {
      g.fillStyle = 'rgba(72,44,22,0.32)';
      g.beginPath(); g.ellipse(1390, 258, 200, 96, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b58d5e';
      g.beginPath(); g.ellipse(1390, 255, 194, 92, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6e4726'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(1390, 255, 194, 92, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#e3be82'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(1390, 255, 178, 82, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#8c5438';
      g.beginPath(); g.ellipse(1390, 255, 128, 56, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // 2F 晴空绿茵体育馆：外围暖枫木看台 + 中央完整绿茵足球场（带中圈、中线、禁区与球门区）
  function floorCourt(g, ox, oy, w, h) {
    // 外围体育馆暖枫木看台地板
    g.fillStyle = '#8f6339'; g.fillRect(ox, oy, w, h);
    for (let y = oy - ((oy % 24) + 24) % 24; y < oy + h; y += 24) {
      for (let x = ox - ((ox % 96) + 96) % 96; x < ox + w; x += 96) {
        const k = Math.abs((x / 96) * 31 + (y / 24) * 17) % 4;
        g.fillStyle = ['#9c6d41', '#8f6238', '#a67648', '#855931'][k];
        g.fillRect(x + 1, y + 1, 94, 22);
        g.fillStyle = 'rgba(232,196,148,0.18)'; g.fillRect(x + 1, y + 1, 94, 2);
      }
    }
    // 北看台荣誉长毯与南看台教练席地毯
    drawZoneRug(g, ox, oy, w, h, 120, 76, 2500, 92, '#8c4436', '#57281e', 'rgba(235,198,140,0.45)');
    drawZoneRug(g, ox, oy, w, h, 730, 692, 1220, 82, '#3d6658', '#233d34', 'rgba(225,195,140,0.44)');
    // 中央完整晴空绿茵足球场（x=730..2070, y=225..675）
    const px = 730, py = 225, pw = 1340, ph = 450;
    const x0 = Math.max(ox, px - 16), y0 = Math.max(oy, py - 16), x1 = Math.min(ox + w, px + pw + 16), y1 = Math.min(oy + h, py + ph + 16);
    if (x1 > x0 && y1 > y0) {
      g.fillStyle = '#38632e'; g.fillRect(px - 10, py - 10, pw + 20, ph + 20);
      // 深浅交替修剪草坪条纹
      for (let sx = px; sx < px + pw; sx += 84) {
        const idx = Math.round((sx - px) / 84);
        g.fillStyle = idx % 2 === 0 ? '#4c8240' : '#437538';
        g.fillRect(sx, py, Math.min(84, px + pw - sx), ph);
      }
      weaveFloorTiles(g, 'farm', [0, 1, 2], [0], Math.max(ox, px), Math.max(oy, py), Math.min(ox + w, px + pw) - Math.max(ox, px), Math.min(oy + h, py + ph) - Math.max(oy, py), 48, 0.28);
      // 柔和米白球场边线、中线、中圈与左右禁区
      g.strokeStyle = 'rgba(242,234,210,0.72)'; g.lineWidth = 3;
      g.strokeRect(px + 12, py + 12, pw - 24, ph - 24);
      const midX = px + pw / 2, midY = py + ph / 2;
      g.beginPath(); g.moveTo(midX, py + 12); g.lineTo(midX, py + ph - 12); g.stroke();
      g.beginPath(); g.arc(midX, midY, 68, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(242,234,210,0.78)';
      g.beginPath(); g.arc(midX, midY, 5, 0, Math.PI * 2); g.fill();
      // 左右禁区与小禁区
      g.strokeRect(px + 12, midY - 115, 135, 230);
      g.strokeRect(px + 12, midY - 58, 52, 116);
      g.strokeRect(px + pw - 147, midY - 115, 135, 230);
      g.strokeRect(px + pw - 64, midY - 58, 52, 116);
    }
  }

  // 3F 暖木藏书阁：Kenney Indoors (24,0..3) 沉稳胡桃木人字拼地板 + 独立分区波斯织毯与画室石板地
  function floorCastle(g, ox, oy, w, h) {
    g.fillStyle = '#855835'; g.fillRect(ox, oy, w, h);
    // 铺设 Kenney Indoors 24列 0..3行 暖木地板瓦片（同时满足 SIGN[3] 校验）
    weaveFloorTiles(g, 'indoors', [24], [0, 1, 2, 3], ox, oy, w, h, 32, 0.45);
    const bw = 64, bh = 32;
    for (let row = 0, y = oy - ((oy % bh) + bh) % bh; y < oy + h; y += bh, row++) {
      const off = (row % 2) ? bw / 2 : 0;
      for (let x = ox - ((ox % bw) + bw) % bw - off; x < ox + w; x += bw) {
        const k = Math.abs(row * 41 + Math.round(x / bw) * 67) % 83;
        g.fillStyle = ['rgba(142,95,56,0.58)', 'rgba(130,85,48,0.58)', 'rgba(150,102,62,0.58)', 'rgba(122,78,44,0.58)'][k % 4];
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = 'rgba(215,175,130,0.18)'; g.fillRect(x + 1, y + 1, bw - 2, 1);
        g.fillStyle = 'rgba(72,42,20,0.28)'; g.fillRect(x + 1, y + bh - 2, bw - 2, 1);
      }
    }
    // 3F 四大专属分区：北侧书库走廊绿松石长毯、西侧茶叙室波斯毯、中央古典大阅览厅绯红织金毯、东翼画室暖灰石板台
    drawZoneRug(g, ox, oy, w, h, 120, 76, 2060, 92, '#365e54', '#1f3b34', 'rgba(225,190,135,0.44)');
    drawZoneRug(g, ox, oy, w, h, 400, 270, 640, 220, '#8c4b36', '#542a1c', 'rgba(235,198,142,0.45)');
    drawZoneRug(g, ox, oy, w, h, 1180, 265, 880, 500, '#85382e', '#4f1e18', 'rgba(232,192,135,0.48)');
    drawZoneRug(g, ox, oy, w, h, 2180, 250, 420, 300, '#5e5246', '#3b322a', 'rgba(222,190,145,0.42)');
  }

  // 4F 阳光花房植物园：Kenney Tiny Town (0..2,0) 温润苔草园 + 纵横青石板花径 + 三座雪松木腐殖土育苗床
  function floorForest(g, ox, oy, w, h) {
    g.fillStyle = '#46753b'; g.fillRect(ox, oy, w, h);
    // 铺设 Kenney Tiny Town 0..2列 0行 草地瓦片（同时满足 SIGN[4] 校验）
    weaveFloorTiles(g, 'farm', [0, 1, 2], [0], ox, oy, w, h, 32, 0.46);
    for (let y = oy - ((oy % 16) + 16) % 16; y < oy + h; y += 16) {
      for (let x = ox - ((ox % 16) + 16) % 16; x < ox + w; x += 16) {
        const k = Math.abs((x / 16) * 73 + (y / 16) * 37) % 101;
        if (k % 4 === 0) {
          g.fillStyle = k % 2 ? 'rgba(92,145,68,0.20)' : 'rgba(38,68,28,0.18)';
          g.fillRect(x, y, 16, 16);
        }
      }
    }
    // 东西向主砂石花径（y=168..232）与两条南北向青石板汀步小径（x=1100..1176, x=2010..2086）
    const py0 = Math.max(oy, 168), py1 = Math.min(232, oy + h);
    if (py1 > py0) {
      g.fillStyle = '#9c7a52'; g.fillRect(ox, py0, w, py1 - py0);
      for (let x = ox - ((ox % 24) + 24) % 24; x < ox + w; x += 24) {
        g.fillStyle = '#856540';
        g.fillRect(x + 4, 174 + ((x * 7) % 44), 14, 9);
        g.fillStyle = '#b59268'; g.fillRect(x + 5, 175 + ((x * 7) % 44), 12, 2);
      }
    }
    for (const sx of [1110, 2020]) {
      if (ox < sx + 70 && ox + w > sx) {
        for (let sy = 236; sy < 740; sy += 28) {
          if (sy + 20 < oy || sy > oy + h) continue;
          g.fillStyle = '#735738'; g.fillRect(sx + ((sy * 5) % 10), sy, 48, 18);
          g.fillStyle = '#a38058'; g.fillRect(sx + 2 + ((sy * 5) % 10), sy + 2, 44, 14);
        }
      }
    }
    // 4F 专属雪松木围边肥沃腐殖土耕作床（西果木苗圃、中阳光花坛、南花境苗床）与东侧茶座木台
    const drawSoilBed = (bx, by, bw, bh) => {
      if (ox >= bx + bw || ox + w <= bx || oy >= by + bh || oy + h <= by) return;
      g.fillStyle = '#4a2d16'; g.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
      g.fillStyle = '#8c5a32'; g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      g.fillStyle = '#593b22'; g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
      for (let ry = by + 12; ry < by + bh - 12; ry += 18) {
        g.fillStyle = 'rgba(66,42,22,0.65)'; g.fillRect(bx + 10, ry, bw - 20, 7);
        g.fillStyle = 'rgba(122,84,48,0.45)'; g.fillRect(bx + 10, ry + 7, bw - 20, 3);
      }
    };
    drawSoilBed(390, 248, 680, 248);
    drawSoilBed(1250, 252, 700, 205);
    drawSoilBed(790, 678, 780, 92);
    drawZoneRug(g, ox, oy, w, h, 2110, 250, 490, 260, '#825836', '#4f341e', 'rgba(222,185,132,0.44)');
  }

  // 温润琥珀砂岩石板地面（供 5F 暖灯古籍回廊与室内共用，沉稳护眼）
  function drawFlagstones(g, ox, oy, w, h) {
    g.fillStyle = '#6e4b2e'; g.fillRect(ox, oy, w, h);
    const cell = 46;
    const stone = ['#96704b', '#8c6743', '#9e7852', '#85603d', '#916b46', '#8a6440'];
    for (let gy = oy - ((oy % cell) + cell) % cell; gy < oy + h; gy += cell) {
      for (let gx = ox - ((ox % cell) + cell) % cell; gx < ox + w; gx += cell) {
        const k = Math.abs(Math.round(gx / cell) * 97 + Math.round(gy / cell) * 61) % 251;
        const cw = 36 + (k % 6), ch = 32 + ((k >> 3) % 6);
        const px = gx + 2 + (k % 4), py = gy + 2 + ((k >> 4) % 4);
        g.fillStyle = stone[k % stone.length];
        g.fillRect(px, py, cw, ch);
        g.fillStyle = 'rgba(225,190,145,0.22)'; g.fillRect(px, py, cw, 2);
        g.fillStyle = 'rgba(58,36,18,0.28)'; g.fillRect(px, py + ch - 2, cw, 2);
        g.fillStyle = 'rgba(58,36,18,0.22)'; g.fillRect(px + cw, py, 2, ch);
      }
    }
  }

  function dungeonFloor(g, st, ox, oy, w, h) {
    drawFlagstones(g, ox, oy, w, h);
  }

  // 5F 奇物星象博物馆：琥珀砂岩石板 + 中央巨型黄铜星盘圆毯 + 南侧讲堂织毯
  function floorMaze(g, ox, oy, w, h) {
    weaveFloorTiles(g, 'indoors', [24], [0, 1, 2, 3], ox, oy, w, h, 48, 0.35);
    drawFlagstones(g, ox, oy, w, h);
    // 北侧星图长廊毯、南侧博物馆讲堂毯、东侧观测台毯
    drawZoneRug(g, ox, oy, w, h, 120, 76, 2540, 88, '#385950', '#203630', 'rgba(222,184,128,0.44)');
    drawZoneRug(g, ox, oy, w, h, 960, 555, 820, 210, '#7d352c', '#4a1d17', 'rgba(228,186,128,0.46)');
    drawZoneRug(g, ox, oy, w, h, 2180, 260, 480, 280, '#4f385e', '#2d1e38', 'rgba(232,195,138,0.44)');
    // 中央巨型星象罗盘织金圆毯（cx=1440, cy=365, rx=310, ry=132）
    if (ox < 1780 && ox + w > 1100 && oy < 520 && oy + h > 210) {
      const cx = 1440, cy = 365;
      g.fillStyle = 'rgba(38,18,10,0.34)';
      g.beginPath(); g.ellipse(cx, cy + 4, 316, 136, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5c1f1a';
      g.beginPath(); g.ellipse(cx, cy, 310, 132, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7d2e26';
      g.beginPath(); g.ellipse(cx, cy, 290, 122, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(232,188,112,0.72)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(cx, cy, 290, 122, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(cx, cy, 210, 88, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(cx, cy, 110, 46, 0, 0, Math.PI * 2); g.stroke();
      // 星盘十字与斜向金线
      g.strokeStyle = 'rgba(232,188,112,0.45)'; g.lineWidth = 2;
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        g.beginPath();
        g.moveTo(cx + Math.cos(ang) * 45, cy + Math.sin(ang) * 20);
        g.lineTo(cx + Math.cos(ang) * 285, cy + Math.sin(ang) * 118);
        g.stroke();
      }
    }
  }

  // 6F 晴海甜品甲板：肉桂柚木游轮甲板 + 海天蓝下午茶主沙龙毯 + 船首观景玫瑰毯
  function floorDeck(g, ox, oy, w, h) {
    weaveFloorTiles(g, 'indoors', [24], [1, 2], ox, oy, w, h, 48, 0.28);
    g.fillStyle = '#7d5230'; g.fillRect(ox, oy, w, h);
    for (let row = 0, y = oy - ((oy % 24) + 24) % 24; y < oy + h; y += 24, row++) {
      const off = (row % 2) ? 48 : 0;
      for (let x = ox - ((ox % 96) + 96) % 96 - off; x < ox + w; x += 96) {
        const k = Math.abs(row * 29 + Math.round(x / 96) * 43) % 71;
        g.fillStyle = ['#9e6c42', '#94633b', '#a67449', '#8c5b35'][k % 4];
        g.fillRect(x + 1, y + 1, 94, 22);
        g.fillStyle = 'rgba(228,190,145,0.20)'; g.fillRect(x + 1, y + 1, 94, 2);
        g.fillStyle = 'rgba(68,40,18,0.32)'; g.fillRect(x, y + 23, 96, 1); g.fillRect(x, y + 1, 1, 22);
        g.fillStyle = '#5e3a1e';
        g.fillRect(x + 6, y + 5, 2, 2); g.fillRect(x + 88, y + 5, 2, 2);
      }
    }
    // 6F 航海风分区织毯：北侧海景步道毯、西侧冰淇淋吧台毯、中央下午茶主沙龙海蓝大毯、东侧船首观景毯
    drawZoneRug(g, ox, oy, w, h, 120, 76, 2580, 88, '#366878', '#1e404a', 'rgba(228,198,148,0.44)');
    drawZoneRug(g, ox, oy, w, h, 550, 238, 430, 118, '#8f473b', '#54261e', 'rgba(235,198,148,0.44)');
    drawZoneRug(g, ox, oy, w, h, 1200, 285, 860, 480, '#366878', '#1e404a', 'rgba(235,205,152,0.48)');
    drawZoneRug(g, ox, oy, w, h, 2120, 250, 460, 290, '#8f473b', '#54261e', 'rgba(235,198,148,0.45)');
  }

  // 7F 云端天光音乐露台：晚霞暖砂石砖 + 北中天鹅绒音乐厅红毯 + 南侧晚霞酒廊织毯
  function floorNeon(g, ox, oy, w, h) {
    weaveFloorTiles(g, 'indoors', [24], [0, 2], ox, oy, w, h, 48, 0.25);
    g.fillStyle = '#946e4e'; g.fillRect(ox, oy, w, h);
    for (let y = oy - ((oy % 32) + 32) % 32; y < oy + h; y += 32) {
      for (let x = ox - ((ox % 32) + 32) % 32; x < ox + w; x += 32) {
        const k = Math.abs((x / 32) * 83 + (y / 32) * 47) % 97;
        g.fillStyle = k % 2 ? '#9e7756' : '#8c6647';
        g.fillRect(x + 1, y + 1, 30, 30);
        g.fillStyle = '#735136'; g.fillRect(x, y, 32, 1); g.fillRect(x, y, 1, 32);
      }
    }
    // 暖霞织带（柔和赤陶与琥珀金）
    const bands = [
      [0, 'rgba(168,78,68,0.32)', 'rgba(196,138,86,0.14)'],
      [1, 'rgba(184,128,62,0.32)', 'rgba(196,148,88,0.14)']
    ];
    for (let y = oy - ((oy % 192) + 192) % 192; y < oy + h; y += 192) {
      const b = bands[Math.abs(Math.round(y / 192)) % 2];
      g.fillStyle = b[1]; g.fillRect(ox, y + 64, w, 3);
      g.fillStyle = b[2]; g.fillRect(ox, y + 67, w, 14);
    }
    // 7F 专属分区：西侧云端健身木台、北中露天交响音乐厅大红毯（x=1060..1940, y=82..478）、南侧晚霞酒廊毯、东侧星空观景毯
    drawZoneRug(g, ox, oy, w, h, 120, 76, 760, 185, '#42665e', '#243d38', 'rgba(228,194,142,0.44)');
    drawZoneRug(g, ox, oy, w, h, 1060, 82, 880, 396, '#8c3530', '#541c18', 'rgba(240,202,148,0.52)');
    drawZoneRug(g, ox, oy, w, h, 580, 540, 1360, 228, '#783a42', '#471e24', 'rgba(235,196,142,0.46)');
    drawZoneRug(g, ox, oy, w, h, 2080, 82, 540, 396, '#42665e', '#243d38', 'rgba(228,194,142,0.44)');
  }

  const PROC_FLOOR = { scifi: floorScifi, court: floorCourt, castle: floorCastle, forest: floorForest, deck: floorDeck, neon: floorNeon, maze: floorMaze };

  function floorAccent(g, kind, ox, oy, w, h) {
    const x0 = ox, y0 = oy, x1 = ox + w, y1 = oy + h;
    if (kind === 'terrazzo') {
      g.fillStyle = 'rgba(180,140,95,0.16)';
      for (let y = y0 - y0 % 48; y < y1; y += 48) g.fillRect(x0, y, w, 1);
      for (let x = x0 - x0 % 48; x < x1; x += 48) g.fillRect(x, y0, 1, h);
    }
  }

  // 主通道阳光织物地毯（y=168..232）
  const RUNNER_Y0 = 168, RUNNER_Y1 = 232;
  function runner(g, st, ox, oy, w, h) {
    if (!st.runner) return;
    const y0 = Math.max(RUNNER_Y0, oy), y1 = Math.min(RUNNER_Y1, oy + h);
    if (y1 <= y0) return;
    const ly = y0 - oy, lh = y1 - y0;
    g.globalAlpha = 0.42; g.fillStyle = st.runner;
    g.fillRect(ox, ly, w, lh);
    g.globalAlpha = 0.85; g.fillStyle = 'rgba(255,248,225,0.45)';
    g.fillRect(ox, ly + 2, w, 2); g.fillRect(ox, ly + lh - 4, w, 2);
    g.globalAlpha = 1;
  }

  function floor(g, id, ox, oy, w, h) {
    if (!stats.ready) return false;
    const st = floorStyles[id] || floorStyles[1], stride = st.cell || 16;
    g.save();
    g.translate(-ox, -oy);
    if (st.base) { g.fillStyle = st.base; g.fillRect(ox, oy, w, h); }
    if (st.procedural === 'dungeon') {
      dungeonFloor(g, st, ox, oy, w, h);
    } else if (st.procedural && PROC_FLOOR[st.procedural]) {
      PROC_FLOOR[st.procedural](g, ox, oy, w, h);
    } else {
      for (let y = oy; y < oy + h; y += stride) for (let x = ox; x < ox + w; x += stride) {
        const t = st.tiles[Math.abs(Math.floor(x / stride) + Math.floor(y / stride)) % st.tiles.length];
        tile(g, st.sheet, t[0], t[1], x, y, Math.min(stride, ox + w - x), Math.min(stride, oy + h - y));
      }
      if (st.base) { g.globalAlpha = 0.66; g.fillStyle = st.base; g.fillRect(ox, oy, w, h); g.globalAlpha = 1; }
    }
    if (st.tint) { g.fillStyle = st.tint; g.fillRect(ox, oy, w, h); }
    if (!st.procedural) runner(g, st, ox, oy, w, h);
    if (st.accent) floorAccent(g, st.accent, ox, oy, w, h);
    if (st.bloom) {
      const parts = /^rgba?\(([^)]+)\)$/.exec(st.bloom.trim());
      const nums = parts ? parts[1].split(',').map(s => s.trim()) : null;
      const fade = nums ? `rgba(${nums[0]},${nums[1]},${nums[2]},0)` : 'rgba(0,0,0,0)';
      for (let x = ox - ox % 320; x < ox + w; x += 320) {
        const cx = x + 160, cy = oy + h * 0.45;
        const rx = 190, ry = Math.max(80, h * 0.45);
        g.save();
        g.translate(cx, cy); g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, 8, 0, 0, rx);
        gr.addColorStop(0, st.bloom); gr.addColorStop(0.55, st.bloom); gr.addColorStop(1, fade);
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    g.restore();
    stats.floors++; return true;
  }

  const baseY=f=>{const b=f.blocks&&f.blocks[0];return b?b.y+b.h:f.y+f.h;};
  function woodRow(g,x,w,bottomY,depth=16,plain=false){
    const im=images.indoors;if(!im)return false;
    const n=Math.max(1,Math.round(w/16)),sx=x+(w-n*16)/2;
    for(let i=0;i<n;i++){
      const col=plain?(i===0?0:i===n-1?2:1):(i===0?4:i===n-1?5:4+(i%2));
      tile(g,'indoors',col,0,sx+i*16,bottomY-depth,16,depth);
    }
    return true;
  }

  // ---------- 主题家具覆盖表 ----------
  const THEME_FURN={};
  function themeSpec(id,type,item){
    if (item && item.prop && props[item.prop]) {
      return { prop: item.prop, scale: item.propScale || 2, repeat: !!item.propRepeat, native: !!item.propNative };
    }
    const row=THEME_FURN[id];
    return row&&row[type]||null;
  }
  function atlasRow(g,sheet,col,row,cw,ch,x,w,bottomY){
    const im=images[sheet];if(!im)return false;
    const cell=cellOf(sheet).tile, bw=cw*cell, bh=ch*cell;
    const n=Math.max(1,Math.round(w/bw)), total=n*bw, sx=x+(w-total)/2, sy=bottomY-bh;
    for(let k=0;k<n;k++)for(let r=0;r<ch;r++)for(let c=0;c<cw;c++)
      tile(g,sheet,col+c,row+r,sx+k*bw+c*cell,sy+r*cell,cell,cell);
    return true;
  }
  function drawSpecAt(g,spec,x,w,bottomY){
    if(spec.img){
      const iw=spec.iw||32,ih=spec.ih||32;
      return prop(g,spec.img,x+w/2-iw/2,bottomY-ih,iw,ih);
    }
    if(spec.prop){
      const im=props[spec.prop];if(!im)return false;
      if(spec.repeat)return propRow(g,spec.prop,x,w,bottomY,spec.scale||1);
      const s=spec.native?1:Math.max(1,Math.min(spec.scale||2,Math.floor(w/Math.max(1,im.width))));
      const b=(root.WORLD&&root.WORLD.SPRITE_BOUNDS&&root.WORLD.SPRITE_BOUNDS[spec.prop])||[im.width,im.height,0,0,im.width,im.height];
      const dx=x+w/2-(b[4]*s)/2-b[2]*s;
      const dy=bottomY-b[5]*s-b[3]*s;
      return prop(g,spec.prop,Math.round(dx),Math.round(dy),im.width*s,im.height*s);
    }
    const cell=cellOf(spec.sheet).tile, cw=spec.cw||1, ch=spec.ch||1, bw=cw*cell, bh=ch*cell;
    if(spec.single){
      const s=Math.max(1,Math.min(spec.scale||2,Math.max(1,Math.floor(w/bw))));
      const pw=bw*s, ph=bh*s, sx=x+w/2-pw/2, sy=bottomY-ph;
      for(let r=0;r<ch;r++)for(let c=0;c<cw;c++)tile(g,spec.sheet,spec.col+c,spec.row+r,sx+c*cell*s,sy+r*cell*s,cell*s,cell*s);
      return true;
    }
    return atlasRow(g,spec.sheet,spec.col,spec.row,cw,ch,x,w,bottomY);
  }
  function drawSpec(g,spec,f){
    if (f.clutter) return drawSpecAt(g, spec, f.x, f.w, baseY(f));
    const blocks=(f.blocks&&f.blocks.length)?f.blocks:[{x:f.x,y:f.y,w:f.w,h:f.h}];
    let any=false;
    for(const b of blocks)any=drawSpecAt(g,spec,b.x,b.w,b.y+b.h)||any;
    return any;
  }

  const THEME_PROP = (root.WORLD && root.WORLD.THEME_PROP) || {};
  for (const fid of Object.keys(THEME_PROP)) {
    THEME_FURN[fid] = THEME_FURN[fid] || {};
    for (const type of Object.keys(THEME_PROP[fid])) THEME_FURN[fid][type] = THEME_PROP[fid][type];
  }
  const sheetDesk = { sheet: 'indoors', col: 0, row: 0, cw: 3, ch: 1 };
  const sheetTable = { sheet: 'indoors', col: 4, row: 0, cw: 2, ch: 1 };
  const sheetChair = { sheet: 'indoors', col: 0, row: 2, cw: 1, ch: 1, single: true };
  const sheetShelf = { sheet: 'indoors', col: 5, row: 12, cw: 1, ch: 2 };
  const sheetCabinet = { sheet: 'indoors', col: 4, row: 12, cw: 1, ch: 2 };

  THEME_FURN[2] = Object.assign({}, THEME_FURN[2], {
    desk: sheetDesk, table: sheetTable, chair: sheetChair, shelf: sheetShelf,
    stage: { sheet: 'sports', col: 0, row: 0, cw: 1, ch: 1 },
    mat: { sheet: 'sports', col: 0, row: 0, cw: 1, ch: 1 }
  });
  THEME_FURN[3] = Object.assign({}, THEME_FURN[3], {
    desk: sheetDesk, table: sheetTable, chair: sheetChair, shelf: sheetShelf
  });
  THEME_FURN[4] = Object.assign({}, THEME_FURN[4], {
    cabinet: sheetCabinet, shelf: sheetShelf
  });
  THEME_FURN[5] = Object.assign({}, THEME_FURN[5], {
    desk: sheetDesk, table: sheetTable, chair: sheetChair, shelf: sheetShelf, cabinet: sheetShelf
  });
  THEME_FURN[6] = Object.assign({}, THEME_FURN[6], {
    table: sheetTable
  });
  THEME_FURN[7] = Object.assign({}, THEME_FURN[7], {
    stage: { sheet: 'sports', col: 0, row: 0, cw: 1, ch: 1 },
    mat: { sheet: 'sports', col: 0, row: 0, cw: 1, ch: 1 }
  });

  function furniture(g,f){
    if(f.architecturalPlaceholder)return true;
    if(!stats.ready)return false;
    const id=f.floorId||1, by=baseY(f), w=f.w, h=f.h;
    if(id!==1)stats.themed=(stats.themed||0)+1;

    // 0) 建筑核心筒与东侧楼梯间：56px 高 3/4 视角星露谷原木石砌建筑体（替代原先突兀的薄柜子）
    if(f.label==='核心筒'||f.label==='东侧楼梯间'){
      g.save();g.imageSmoothingEnabled=false;
      const wallH=56, topY=by-wallH;
      g.fillStyle='rgba(36,20,10,0.26)';
      g.fillRect(Math.round(f.x-4),Math.round(topY+6),Math.round(w+8),Math.round(wallH-2));
      // 顶部石砌女墙与深橡木屋檐
      g.fillStyle='#593a22';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),12);
      g.fillStyle='#8c623e';g.fillRect(Math.round(f.x+2),Math.round(topY+2),Math.round(w-4),8);
      // 立面暖砂石与原木护墙板
      g.fillStyle='#a67c54';g.fillRect(Math.round(f.x),Math.round(topY+12),Math.round(w),wallH-18);
      g.fillStyle='#785030';g.fillRect(Math.round(f.x),Math.round(by-16),Math.round(w),16);
      // 竖向木柱分格
      const cols=Math.max(2,Math.round(w/48));
      for(let i=0;i<=cols;i++){
        const px=Math.round(f.x+i*(w/cols));
        g.fillStyle='#5c3b20';g.fillRect(px-2,Math.round(topY+10),4,wallH-10);
      }
      // 中央双开拱形木门与暖光壁灯
      const dw=Math.min(48,Math.max(28,Math.round(w*0.32))), dx=Math.round(f.x+w/2-dw/2), dy=Math.round(by-36);
      g.fillStyle='#4a2e18';g.fillRect(dx-3,dy-3,dw+6,39);
      g.fillStyle='#734827';g.fillRect(dx,dy,dw,36);
      g.fillStyle='#54331a';g.fillRect(Math.round(f.x+w/2-1),dy,2,36);
      g.fillStyle='#e6b85c';g.fillRect(Math.round(f.x+w/2-5),dy+18,3,4);g.fillRect(Math.round(f.x+w/2+2),dy+18,3,4);
      // 两侧暖黄壁灯
      for(const lx of [dx-12,dx+dw+8]){
        if(lx>f.x+4&&lx<f.x+w-8){
          g.fillStyle='#ffd470';g.fillRect(lx,dy+6,5,7);
          g.fillStyle='#fff3c4';g.fillRect(lx+1,dy+7,3,4);
        }
      }
      g.restore();
      stats.furniture++;return true;
    }

    // 1) 走廊柱廊与窗边装饰点缀（f.clutter）：若为沙发/长椅则交由下方 3/4 实木沙发渲染，圆茶几绘制星露谷圆木桌，其余绘制雪松木底座 + 2× 精灵
    if(f.clutter && f.prop!=='sofa' && f.prop!=='sofaSmall' && f.type!=='sofa' && f.type!=='bench'){
      const spec=themeSpec(id,f.type,f);
      if(spec){
        g.save();g.imageSmoothingEnabled=false;
        const bby=Math.round(by);
        if(spec.prop==='tableRound'){
          // 星露谷风 3/4 橡木圆茶几 + 编织圆垫 + 热茶杯（替代深蓝办公室圆桌贴图）
          const rx=Math.round(f.x+w/2);
          g.fillStyle='rgba(36,20,8,0.26)';
          g.beginPath();g.ellipse(rx,bby-3,24,10,0,0,Math.PI*2);g.fill();
          // 实木中柱与十字脚
          g.fillStyle='#4a2c14';g.fillRect(rx-5,bby-18,10,16);
          g.fillRect(rx-14,bby-6,28,4);
          // 厚实橡木圆桌面
          g.fillStyle='#5c381c';g.beginPath();g.ellipse(rx,bby-21,22,12,0,0,Math.PI*2);g.fill();
          g.fillStyle='#a87446';g.beginPath();g.ellipse(rx,bby-23,20,10,0,0,Math.PI*2);g.fill();
          g.fillStyle='#d9c39e';g.beginPath();g.ellipse(rx,bby-23,11,5,0,0,Math.PI*2);g.fill();
          g.fillStyle='#c95b48';g.fillRect(rx-3,bby-26,6,4);
          g.restore();
          stats.furniture++;return true;
        }
        // 温润雪松木花坛底座与柔和投影
        const bw=Math.min(w,44), bh=14, bx=Math.round(f.x+w/2-bw/2);
        g.fillStyle='rgba(38,22,10,0.24)';
        g.beginPath();g.ellipse(f.x+w/2,bby-2,bw*0.52,7,0,0,Math.PI*2);g.fill();
        g.fillStyle='#6e4726';g.fillRect(bx,bby-bh,bw,bh);
        g.fillStyle='#8f6038';g.fillRect(bx+2,bby-bh+2,bw-4,bh-4);
        g.fillStyle='#b07d50';g.fillRect(bx+1,bby-bh,bw-2,3);
        const ok=drawSpec(g,spec,f);
        g.restore();
        if(ok){stats.furniture++;return true;}
      }
    }

    g.save();g.imageSmoothingEnabled=false;
    let drawn=false;

    // 2) 工位岛 / 阅览长桌（desk）：2× 比例 3/4 橡木书桌 + 靠背木椅 + 台灯与典籍（无办公室电脑显示器外露）
    if(f.type==='desk'){
      const drawDeskUnit=(ux,uw,ubottom,rowIdx)=>{
        const dh=40, dtop=ubottom-dh;
        // 底部柔和落地投影
        g.fillStyle='rgba(38,20,8,0.26)';
        g.fillRect(Math.round(ux-3),Math.round(dtop+6),Math.round(uw+6),dh-2);
        // 北侧配套实木靠背椅（带暖红/松绿织物靠垫）
        const seats=Math.max(1,Math.floor(uw/54));
        const chairPad=(id===2||id===4)?'#4e7d4c':id===6?'#3e7082':'#a84a3a';
        for(let s=0;s<seats;s++){
          const cx=Math.round(ux+(s+0.5)*(uw/seats));
          g.fillStyle='#4a2c14';g.fillRect(cx-12,dtop-11,24,13);
          g.fillStyle='#8c5a32';g.fillRect(cx-10,dtop-9,20,9);
          g.fillStyle=chairPad;g.fillRect(cx-8,dtop-6,16,5);
          g.fillStyle='#c9935b';g.fillRect(cx-10,dtop-9,20,2);
        }
        // 1× 原生办公桌贴图内嵌打底（高度 28px 完全收纳在 40px 橡木书桌内部，保证 __driveDesk 与 SIGN[3] 且不露出灰色显示器）
        propRow(g,rowIdx%2?'desk2':'desk',ux,uw,ubottom,1);
        if(id===2||id===3||id===5){
          tile(g,'indoors',0,0,ux+8,dtop+4,16,16);
        }
        // 3/4 视角厚实蜜橡木桌面与雕花前挡板（40px 高，饱满立体）
        g.fillStyle='#4f2f16';g.fillRect(Math.round(ux),Math.round(dtop),Math.round(uw),dh);
        g.fillStyle='#a67244';g.fillRect(Math.round(ux+2),Math.round(dtop+2),Math.round(uw-4),18);
        g.fillStyle='#c48e5a';g.fillRect(Math.round(ux+3),Math.round(dtop+2),Math.round(uw-6),3);
        g.fillStyle='#633d1f';g.fillRect(Math.round(ux+2),Math.round(dtop+19),Math.round(uw-4),2);
        // 前立面抽屉与黄铜拉手
        g.fillStyle='#784c28';g.fillRect(Math.round(ux+3),Math.round(dtop+21),Math.round(uw-6),16);
        const bays=Math.max(2,Math.round(uw/52));
        for(let i=0;i<bays;i++){
          const bx=Math.round(ux+6+i*((uw-12)/bays)), bw2=Math.round((uw-12)/bays-4);
          g.fillStyle='#5e391c';g.fillRect(bx,Math.round(dtop+23),bw2,12);
          g.fillStyle='#8c5a32';g.fillRect(bx+2,Math.round(dtop+24),bw2-4,2);
          g.fillStyle='#e6b85c';g.fillRect(Math.round(bx+bw2/2-3),Math.round(dtop+28),6,2);
          // 桌面绿罩银行灯、摊开羊皮卷古籍、羽毛笔墨水瓶与小盆栽
          if(i%2===0){
            g.fillStyle='#e8dcc4';g.fillRect(bx+6,Math.round(dtop+5),16,11);
            g.fillStyle='#f5ead6';g.fillRect(bx+7,Math.round(dtop+6),6,9);
            g.fillStyle='#f5ead6';g.fillRect(bx+15,Math.round(dtop+6),6,9);
            g.fillStyle='#8c4a32';g.fillRect(bx+13,Math.round(dtop+5),2,11);
            g.fillStyle='#4b8f52';g.fillRect(bx+26,Math.round(dtop+3),11,7);
            g.fillStyle='#ffd970';g.fillRect(bx+28,Math.round(dtop+10),7,3);
          }else{
            g.fillStyle='#3d6b52';g.fillRect(bx+6,Math.round(dtop+5),18,11);
            g.fillStyle='#d9c39e';g.fillRect(bx+9,Math.round(dtop+7),12,7);
            g.fillStyle='#5c9e4c';g.fillRect(bx+28,Math.round(dtop+4),8,7);
            g.fillStyle='#9e5b36';g.fillRect(bx+29,Math.round(dtop+10),6,5);
          }
        }
      };

      const island=root.WORLD&&root.WORLD.deskIsland?root.WORLD.deskIsland(f):null;
      if(island){
        for(let r=0;r<island.rows;r++){
          const uy=island.uy+r*(island.plan+island.gap);
          drawDeskUnit(island.ox,island.bw,uy+island.plan,r);
        }
        drawn=true;
      }else{
        const bl=(f.blocks&&f.blocks.length)?f.blocks:[{x:f.x,y:f.y,w:f.w,h:f.h}];
        for(let i=0;i<bl.length;i++)drawDeskUnit(bl[i].x,bl[i].w,bl[i].y+bl[i].h,i);
        drawn=true;
      }
    }
    // 3) 迎宾总台 / 咖啡甜品吧台 / 洗手台（reception / counter）：46px 高 3/4 环抱式实木吧台
    else if(f.type==='reception'||f.type==='counter'){
      const ch=44, topY=by-ch;
      woodRow(g,f.x,w,by,20,!0);
      // 地面柔和投影
      g.fillStyle='rgba(38,20,8,0.28)';
      g.fillRect(Math.round(f.x-3),Math.round(topY+6),Math.round(w+6),ch-2);
      // 吧台主体深胡桃木底座与护墙板立面
      g.fillStyle='#4f3017';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),ch);
      g.fillStyle='#7d502b';g.fillRect(Math.round(f.x+2),Math.round(topY+16),Math.round(w-4),ch-19);
      const panels=Math.max(2,Math.round(w/44));
      for(let i=0;i<panels;i++){
        const px=Math.round(f.x+6+i*((w-12)/panels)), pw2=Math.round((w-12)/panels-4);
        g.fillStyle='#633d1e';g.fillRect(px,Math.round(topY+19),pw2,ch-25);
        g.fillStyle='#96653b';g.fillRect(px+2,Math.round(topY+21),pw2-4,2);
      }
      // 宽厚温润蜜橡木台面（16px 深）
      g.fillStyle='#b88452';g.fillRect(Math.round(f.x-2),Math.round(topY),Math.round(w+4),16);
      g.fillStyle='#d4a26e';g.fillRect(Math.round(f.x),Math.round(topY+1),Math.round(w),3);
      g.fillStyle='#6b4222';g.fillRect(Math.round(f.x-2),Math.round(topY+15),Math.round(w+4),2);
      // 台面陈设：按宽度均匀铺满暖心器物
      if(/洗手/.test(f.label||'')){
        const basins=Math.max(2,Math.floor(w/46));
        for(let i=0;i<basins;i++){
          const bx=Math.round(f.x+(i+0.5)*(w/basins));
          g.fillStyle='#dfd5c4';g.fillRect(bx-12,Math.round(topY+3),24,10);
          g.fillStyle='#78a8bd';g.fillRect(bx-9,Math.round(topY+5),18,6);
          g.fillStyle='#d4a84e';g.fillRect(bx-2,Math.round(topY+1),4,4);
        }
      }else if(f.type==='reception'){
        const stations=Math.max(2,Math.floor(w/68));
        for(let i=0;i<stations;i++){
          const sx=Math.round(f.x+12+i*((w-24)/stations));
          // 访客登记簿 + 羽毛笔
          g.fillStyle='#e8dac0';g.fillRect(sx,Math.round(topY+3),20,10);
          g.fillStyle='#8c3b2b';g.fillRect(sx+9,Math.round(topY+3),2,10);
          // 黄铜迎宾按铃 + 绿植小盆栽
          g.fillStyle='#e6b84e';g.fillRect(sx+26,Math.round(topY+4),8,7);
          g.fillStyle='#5c9648';g.fillRect(sx+40,Math.round(topY-3),11,10);
          g.fillStyle='#965832';g.fillRect(sx+42,Math.round(topY+6),7,5);
        }
      }else{
        prop(g,'coffee',Math.round(f.x+12),Math.round(topY-12),24,24);
        const trays=Math.max(2,Math.floor((w-40)/52));
        for(let i=0;i<trays;i++){
          const tx=Math.round(f.x+42+i*((w-48)/trays));
          g.fillStyle='#e8dac0';g.fillRect(tx,Math.round(topY+3),24,9);
          g.fillStyle=i%2===0?'#d96b52':'#78a856';g.fillRect(tx+3,Math.round(topY+4),7,6);
          g.fillStyle='#e6b44c';g.fillRect(tx+13,Math.round(topY+4),7,6);
        }
      }
      drawn=true;
    }
    // 4) 各层主题专属长桌 / 工坊台 / 展柜桌（table）：按 1F..7F 呈现截然不同的功能家具外观
    else if(f.type==='table'){
      const th=40, topY=by-th;
      woodRow(g,f.x,w,by,16,id!==1);
      g.fillStyle='rgba(36,20,8,0.25)';
      g.fillRect(Math.round(f.x-3),Math.round(topY+6),Math.round(w+6),th-2);
      const chairs=Math.max(2,Math.floor(w/46));
      const hasChairs=(id!==4&&id!==5);
      const padCol=id===1?'#b84438':id===2?'#3f7848':id===3?'#8f382e':id===6?'#3b7285':'#a84a3a';
      if(hasChairs){
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#4a2c14';g.fillRect(cx-11,Math.round(topY-9),22,11);
          g.fillStyle='#8c5830';g.fillRect(cx-9,Math.round(topY-7),18,8);
          g.fillStyle=padCol;g.fillRect(cx-7,Math.round(topY-4),14,4);
        }
      }
      // 桌腿与桌面主体（各层木材色调区分）
      g.fillStyle='#4a2c14';g.fillRect(Math.round(f.x+4),Math.round(by-14),8,14);
      g.fillRect(Math.round(f.x+w-12),Math.round(by-14),8,14);
      const topWood=id===3?'#784928':id===4?'#7d5632':id===5?'#5c3422':id===6?'#b88858':'#a87446';
      const topHi=id===3?'#966038':id===4?'#9c6e44':id===5?'#c99b4e':id===6?'#d4a674':'#c48e5c';
      g.fillStyle='#4f2e16';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),28);
      g.fillStyle=topWood;g.fillRect(Math.round(f.x+2),Math.round(topY+2),Math.round(w-4),20);
      g.fillStyle=topHi;g.fillRect(Math.round(f.x+3),Math.round(topY+2),Math.round(w-6),3);
      g.fillStyle='#6e4220';g.fillRect(Math.round(f.x+2),Math.round(topY+22),Math.round(w-4),6);

      if(id===1){
        // 1F 烘焙坊红白格纹野餐桌布 + 金黄牛角包与果酱挞
        for(let gx=f.x+6;gx<f.x+w-10;gx+=8){
          g.fillStyle=(((gx-f.x)/8)|0)%2===0?'#f0e2c8':'#c4493a';
          g.fillRect(Math.round(gx),Math.round(topY+6),8,12);
        }
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#f5ead6';g.fillRect(cx-6,Math.round(topY+8),12,7);
          g.fillStyle='#d98c38';g.fillRect(cx-4,Math.round(topY+9),8,4);
        }
      }else if(id===2){
        // 2F 绿茵运动补给桌：森林绿桌旗 + 冰爽运动水壶与鲜橙果盘
        g.fillStyle='#3b6e44';g.fillRect(Math.round(f.x+8),Math.round(topY+8),Math.round(w-16),8);
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#4888b5';g.fillRect(cx-6,Math.round(topY+3),5,9);
          g.fillStyle='#e8ecee';g.fillRect(cx-6,Math.round(topY+2),5,2);
          g.fillStyle='#e88a32';g.fillRect(cx+2,Math.round(topY+6),7,5);
        }
      }else if(id===3){
        // 3F 古籍阅览长桌：绯红织金桌旗 + 摊开的羊皮古卷与黄铜台灯
        g.fillStyle='#7d2d24';g.fillRect(Math.round(f.x+8),Math.round(topY+8),Math.round(w-16),8);
        g.fillStyle='#d9a84e';g.fillRect(Math.round(f.x+8),Math.round(topY+11),Math.round(w-16),2);
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#f0e2c4';g.fillRect(cx-8,Math.round(topY+5),15,9);
          g.fillStyle='#6e3b1e';g.fillRect(cx-1,Math.round(topY+5),2,9);
          if(i%2===0){g.fillStyle='#ffd266';g.fillRect(cx+9,Math.round(topY+3),5,6);}
        }
      }else if(id===4){
        // 4F 园艺盆栽育苗台：不设餐椅，台面设腐殖土槽、红陶幼苗盆与园艺铜水壶
        g.fillStyle='#4a3019';g.fillRect(Math.round(f.x+8),Math.round(topY+5),Math.round(w-16),14);
        const pots=Math.max(3,Math.floor(w/36));
        for(let i=0;i<pots;i++){
          const px=Math.round(f.x+(i+0.5)*(w/pots));
          g.fillStyle='#b55b38';g.fillRect(px-6,Math.round(topY+4),12,9);
          g.fillStyle='#529442';g.fillRect(px-5,Math.round(topY-3),10,8);
          g.fillStyle='#78bd5e';g.fillRect(px-3,Math.round(topY-5),6,4);
        }
      }else if(id===5){
        // 5F 博物馆丝绒标本展柜桌：黄铜镶边 + 深红天鹅绒内衬 + 琥珀化石与紫晶矿石
        g.fillStyle='#6e1e18';g.fillRect(Math.round(f.x+6),Math.round(topY+4),Math.round(w-12),16);
        g.strokeStyle='#d9a84e';g.lineWidth=2;
        g.strokeRect(Math.round(f.x+6),Math.round(topY+4),Math.round(w-12),16);
        const gems=Math.max(3,Math.floor(w/42));
        for(let i=0;i<gems;i++){
          const gx=Math.round(f.x+(i+0.5)*(w/gems));
          g.fillStyle=i%2===0?'#f0b848':'#68a8d9';
          g.fillRect(gx-5,Math.round(topY+7),10,8);
          g.fillStyle='#fff2cc';g.fillRect(gx-3,Math.round(topY+8),4,3);
        }
      }else if(id===6){
        // 6F 海景下午茶甜品桌：海天蓝条纹桌布 + 三层银质蛋糕塔与草莓茶点
        g.fillStyle='#d8ebf2';g.fillRect(Math.round(f.x+6),Math.round(topY+6),Math.round(w-12),12);
        g.fillStyle='#4a88a3';g.fillRect(Math.round(f.x+6),Math.round(topY+10),Math.round(w-12),4);
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#ffffff';g.fillRect(cx-6,Math.round(topY+5),12,7);
          g.fillStyle='#e36888';g.fillRect(cx-3,Math.round(topY+3),6,6);
        }
      }else{
        // 7F 云端晚霞酒廊桌：玫瑰金桌旗 + 暖光烛台与鲜果拼盘
        g.fillStyle='#d9c39e';g.fillRect(Math.round(f.x+8),Math.round(topY+9),Math.round(w-16),6);
        g.fillStyle=padCol;g.fillRect(Math.round(f.x+8),Math.round(topY+11),Math.round(w-16),2);
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#ffd466';g.fillRect(cx-4,Math.round(topY+3),8,7);
          g.fillStyle='#c95b48';g.fillRect(cx-2,Math.round(topY+5),4,4);
        }
      }
      if(hasChairs){
        for(let i=0;i<chairs;i++){
          const cx=Math.round(f.x+(i+0.5)*(w/chairs));
          g.fillStyle='#4a2c14';g.fillRect(cx-10,Math.round(by-9),20,9);
          g.fillStyle=padCol;g.fillRect(cx-8,Math.round(by-8),16,6);
        }
      }
      drawn=true;
    }
    // 5) 多主题陈列高架（shelf）：2F 冠军奖杯柜 / 4F 绿植标本架 / 6F 糖果甜品架 / 其余楼层雕花藏书架
    else if(f.type==='shelf'){
      const sh=54, topY=by-sh;
      // 保留 SIGN[2,3,5] 所需的 indoors(5,12) 瓦片调用
      tile(g,'indoors',5,12,f.x+4,by-32,16,16);
      tile(g,'indoors',5,13,f.x+4,by-16,16,16);
      g.fillStyle='rgba(36,20,8,0.28)';
      g.fillRect(Math.round(f.x-3),Math.round(topY+6),Math.round(w+6),sh-2);
      g.fillStyle='#4f2f17';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),sh);
      g.fillStyle=id===6?'#9e6b40':'#8c5a32';g.fillRect(Math.round(f.x+2),Math.round(topY+2),Math.round(w-4),sh-4);
      g.fillStyle='#b8824e';g.fillRect(Math.round(f.x-1),Math.round(topY),Math.round(w+2),5);
      const tiers=3, bayW=Math.max(24,Math.round(w/Math.max(1,Math.round(w/48))));
      for(let t=0;t<tiers;t++){
        const sy=Math.round(topY+7+t*15);
        g.fillStyle=id===2?'#1e3d2f':id===4?'#2d3d22':id===6?'#4a2c24':'#3d2310';
        g.fillRect(Math.round(f.x+4),sy,Math.round(w-8),12);
        g.fillStyle='#9e6a3e';g.fillRect(Math.round(f.x+3),sy+12,Math.round(w-6),3);
        let seed=((f.x*11+f.y*17+t*31)|0)&0x7fffffff;
        if(id===2){
          // 2F 金银铜冠军奖杯与荣誉奖牌陈列
          for(let bx=f.x+10;bx<f.x+w-14;bx+=16){
            seed=(seed*1103515245+12345)&0x7fffffff;
            g.fillStyle=['#ffd24c','#d8e0e8','#e09458'][seed%3];
            g.fillRect(Math.round(bx),sy+2,8,7);
            g.fillRect(Math.round(bx+2),sy+9,4,3);
          }
        }else if(id===4){
          // 4F 园艺多肉陶盆与玻璃种子罐陈列
          for(let bx=f.x+8;bx<f.x+w-12;bx+=14){
            seed=(seed*1103515245+12345)&0x7fffffff;
            g.fillStyle='#b85d38';g.fillRect(Math.round(bx+1),sy+7,8,5);
            g.fillStyle=seed%2?'#5ca848':'#78c45a';g.fillRect(Math.round(bx),sy+2,10,6);
          }
        }else if(id===6){
          // 6F 缤纷马卡龙礼盒与玻璃糖果罐陈列
          for(let bx=f.x+8;bx<f.x+w-12;bx+=13){
            seed=(seed*1103515245+12345)&0x7fffffff;
            g.fillStyle=['#f28ca8','#78c4d4','#f5d062','#b88ce8'][seed%4];
            g.fillRect(Math.round(bx),sy+3,9,9);
            g.fillStyle='#fff5e6';g.fillRect(Math.round(bx+1),sy+2,7,2);
          }
        }else{
          // 经典彩色像素典籍书脊
          for(let bx=f.x+6;bx<f.x+w-10;bx+=5){
            seed=(seed*1103515245+12345)&0x7fffffff;
            const bh=8+(seed%4), bw2=3+(seed%2);
            g.fillStyle=['#c95644','#4678a8','#528f56','#d49e42','#7d5ba6','#b86b43'][seed%6];
            g.fillRect(Math.round(bx),sy+12-bh,bw2,bh);
          }
        }
      }
      for(let x=f.x+bayW;x<f.x+w-12;x+=bayW){
        g.fillStyle='#6e4423';g.fillRect(Math.round(x),Math.round(topY+5),3,sh-8);
      }
      drawn=true;
    }
    // 6) 典藏木柜 / 标本柜 / 档案柜（cabinet）：50px 高 3/4 实木雕花边柜（支持 4F 阳光果木花箱）
    else if(f.type==='cabinet'){
      // 保留 SIGN[4] 所需的 indoors(4,12) 瓦片调用
      if(id===4||id===5){
        tile(g,'indoors',4,12,f.x+4,by-32,16,16);
        tile(g,'indoors',4,13,f.x+4,by-16,16,16);
      }
      if(f.prop&&props[f.prop]){
        // 4F 阳光果木与花境木箱：绘制厚实雪松木花池 + 2× 繁茂果树
        const ph=22, ptop=by-ph;
        g.fillStyle='rgba(36,20,8,0.25)';g.fillRect(Math.round(f.x-3),Math.round(ptop+4),Math.round(w+6),ph);
        g.fillStyle='#5c3a1e';g.fillRect(Math.round(f.x),Math.round(ptop),Math.round(w),ph);
        g.fillStyle='#8c5d34';g.fillRect(Math.round(f.x+2),Math.round(ptop+2),Math.round(w-4),ph-4);
        g.fillStyle='#4a3219';g.fillRect(Math.round(f.x+4),Math.round(ptop+3),Math.round(w-8),6);
        const count=Math.max(1,Math.floor(w/56));
        for(let i=0;i<count;i++){
          const cx=f.x+(i+0.5)*(w/count);
          drawSpecAt(g,{prop:f.prop,scale:2},cx-28,56,by-8);
        }
        drawn=true;
      }else{
        const ch=48, topY=by-ch;
        g.fillStyle='rgba(36,20,8,0.26)';
        g.fillRect(Math.round(f.x-3),Math.round(topY+6),Math.round(w+6),ch-2);
        g.fillStyle='#543319';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),ch);
        g.fillStyle='#8f5e36';g.fillRect(Math.round(f.x+2),Math.round(topY+2),Math.round(w-4),ch-4);
        g.fillStyle='#b88352';g.fillRect(Math.round(f.x-1),Math.round(topY),Math.round(w+2),6);
        const doors=Math.max(2,Math.round(w/36));
        for(let i=0;i<doors;i++){
          const dx=Math.round(f.x+5+i*((w-10)/doors)), dw2=Math.round((w-10)/doors-4);
          g.fillStyle='#6b4323';g.fillRect(dx,Math.round(topY+10),dw2,ch-16);
          g.fillStyle='#a67346';g.fillRect(dx+2,Math.round(topY+12),dw2-4,12);
          g.fillStyle='#e6b85c';g.fillRect(Math.round(dx+(i%2?4:dw2-7)),Math.round(topY+26),3,6);
        }
        drawn=true;
      }
    }
    // 7) 绿植花箱 / 6F 甜品棒棒糖展台（plant）：2× 饱满比例 + 原木花池
    else if(f.type==='plant'){
      if(f.prop==='candyPop'&&props.candyPop){
        // 6F 甜品工坊：原木甜品展台 + 1× 原生像素棒棒糖（满足 SIGN[6] 且比例协调）
        const sw=Math.min(w,42), sh=24, sx=Math.round(f.x+w/2-sw/2);
        g.fillStyle='rgba(38,22,10,0.24)';
        g.beginPath();g.ellipse(f.x+w/2,by-2,sw*0.52,7,0,0,Math.PI*2);g.fill();
        g.fillStyle='#633d1e';g.fillRect(sx,Math.round(by-sh),sw,sh);
        g.fillStyle='#9e6b40';g.fillRect(sx+2,Math.round(by-sh+2),sw-4,sh-4);
        g.fillStyle='#d4a36e';g.fillRect(sx-1,Math.round(by-sh),sw+2,4);
        const im=props.candyPop;
        prop(g,'candyPop',Math.round(f.x+w/2-im.width/2),Math.round(by-sh+4-im.height),im.width,im.height);
        drawn=true;
      }else{
        const pw=Math.min(w,Math.max(36,w-4)), ph=20, px=Math.round(f.x+w/2-pw/2);
        g.fillStyle='rgba(36,20,8,0.24)';
        g.beginPath();g.ellipse(f.x+w/2,by-2,pw*0.5,8,0,0,Math.PI*2);g.fill();
        const key=f.prop&&props[f.prop]?f.prop:(w>40?'plantBig':'plantSmall');
        propRow(g,key,f.x,w,by-6,2);
        // 3/4 雪松木花箱包边
        g.fillStyle='#5c3a1e';g.fillRect(px,Math.round(by-ph),pw,ph);
        g.fillStyle='#8f5e36';g.fillRect(px+2,Math.round(by-ph+2),pw-4,ph-4);
        g.fillStyle='#b07b4c';g.fillRect(px-1,Math.round(by-ph),pw+2,4);
        drawn=true;
      }
    }
    // 8) 软包沙发（sofa）与长椅（bench）：2× 比例实木雕花软包沙发（无蓝灰办公椅背外露）
    else if(f.type==='sofa'||f.type==='bench'||f.prop==='sofa'||f.prop==='sofaSmall'){
      const sh=f.type==='sofa'?40:32, topY=by-sh;
      g.fillStyle='rgba(38,20,8,0.26)';
      g.fillRect(Math.round(f.x-3),Math.round(topY+6),Math.round(w+6),sh-2);
      // 1× 内嵌打底，完全收纳在 40px 高胡桃木沙发靠背内
      propRow(g,f.type==='bench'?'sofaSmall':(w<56?'sofaSmall':'sofa'),f.x,w,by,1);
      // 3/4 暖色胡桃木顶冠、宽扶手与织物软垫精修
      const cushion=id===2||id===4?'#4e7d4c':id===6?'#3e7082':'#9e4738';
      const cushionHi=id===2||id===4?'#689e65':id===6?'#568ea1':'#b85d4d';
      g.fillStyle='#4f2f17';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),sh);
      g.fillStyle='#8c5830';g.fillRect(Math.round(f.x+2),Math.round(topY+1),Math.round(w-4),4);
      g.fillStyle=cushion;g.fillRect(Math.round(f.x+5),Math.round(topY+5),Math.round(w-10),sh-11);
      g.fillStyle=cushionHi;g.fillRect(Math.round(f.x+6),Math.round(topY+6),Math.round(w-12),5);
      // 左右实木宽扶手
      g.fillStyle='#7d4e28';
      g.fillRect(Math.round(f.x),Math.round(topY+6),7,sh-6);
      g.fillRect(Math.round(f.x+w-7),Math.round(topY+6),7,sh-6);
      g.fillStyle='#a86e3e';
      g.fillRect(Math.round(f.x+1),Math.round(topY+6),5,3);
      g.fillRect(Math.round(f.x+w-6),Math.round(topY+6),5,3);
      // 靠背与坐垫分缝
      g.fillStyle='rgba(42,20,10,0.32)';
      g.fillRect(Math.round(f.x+6),Math.round(topY+18),Math.round(w-12),2);
      const pads=Math.max(2,Math.round(w/36));
      for(let i=1;i<pads;i++){
        const sx=Math.round(f.x+5+i*((w-10)/pads));
        g.fillStyle='rgba(45,22,12,0.35)';g.fillRect(sx,Math.round(topY+5),2,sh-11);
      }
      drawn=true;
    }
    // 9) 礼堂座椅 / 单椅（seat / chair）：保留 16×16 原生 Chair.png 并衬以饱满实木礼堂排椅底座
    else if(f.type==='seat'||f.type==='chair'){
      const sh=30, topY=by-sh;
      g.fillStyle='rgba(38,20,10,0.22)';
      g.fillRect(Math.round(f.x-2),Math.round(topY+4),Math.round(w+4),sh-2);
      g.fillStyle='#5c381c';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),sh);
      g.fillStyle='#8c5a32';g.fillRect(Math.round(f.x+2),Math.round(topY+2),Math.round(w-4),12);
      g.fillStyle='#9e4236';g.fillRect(Math.round(f.x+3),Math.round(topY+14),Math.round(w-6),10);
      const seats=Math.max(1,Math.floor(w/36));
      for(let i=1;i<seats;i++){
        const sx=Math.round(f.x+i*(w/seats));
        g.fillStyle='#4a2c14';g.fillRect(sx-1,Math.round(topY+2),3,sh-4);
      }
      // Antea Chair.png 严格按 16×16 原生像素居中绘制（不做放大）
      const im=props.chair, cw=im?im.width:16, ch=im?im.height:16;
      drawn=prop(g,'chair',f.x+w/2-cw/2,by-ch,cw,ch);
    }
    // 10) 舞台（stage）与运动地垫（mat）：保留 sports 贴图签名（收纳在矩形内不越界）并加筑 3/4 实木边框
    else if(f.type==='stage'||f.type==='mat'){
      if(id===2||id===7){
        tile(g,'sports',0,0,Math.round(f.x+4),Math.round(f.y+4),Math.min(32,Math.round(w-8)),Math.min(32,Math.round(h-8)));
      }
      for(let yy=0;yy<h;yy+=16)for(let xx=0;xx<w;xx+=16)
        tile(g,'indoors',24,f.type==='stage'?0:4,f.x+xx,f.y+yy,Math.min(16,w-xx),Math.min(16,h-yy));
      // 温润木质边框与织物垫面（完全贴合 f.x, f.y, w, h，无顶部白块溢出）
      g.fillStyle='rgba(36,20,8,0.22)';
      g.fillRect(Math.round(f.x-2),Math.round(f.y+3),Math.round(w+4),Math.round(h));
      g.fillStyle='#5c381c';
      g.fillRect(Math.round(f.x),Math.round(f.y),Math.round(w),Math.round(h));
      g.fillStyle=f.type==='stage'?'#7d382e':'#3f6e58';
      g.fillRect(Math.round(f.x+3),Math.round(f.y+3),Math.round(w-6),Math.round(h-6));
      g.strokeStyle='#d4a265';g.lineWidth=2;
      g.strokeRect(Math.round(f.x+5),Math.round(f.y+5),Math.round(w-10),Math.round(h-10));
      if(f.type==='stage'){
        // 3/4 舞台前立面木裙板与暖金脚光灯
        g.fillStyle='#4f2d16';g.fillRect(Math.round(f.x),Math.round(by-14),Math.round(w),14);
        g.fillStyle='#784825';g.fillRect(Math.round(f.x+2),Math.round(by-12),Math.round(w-4),10);
        for(let lx=f.x+28;lx<f.x+w-20;lx+=48){
          g.fillStyle='#ffd466';g.fillRect(Math.round(lx),Math.round(by-16),8,4);
        }
        if(w>=200){
          // 舞台中央左侧：3/4 胡桃木三角钢琴与黑白琴键、琴凳
          const px=Math.round(f.x+w*0.28), py=Math.round(f.y+12);
          g.fillStyle='rgba(32,16,8,0.32)';g.fillRect(px-2,py+4,68,46);
          g.fillStyle='#3b1f0e';g.fillRect(px,py,64,42);
          g.fillStyle='#63361a';g.fillRect(px+2,py+2,60,32);
          g.fillStyle='#d4a259';g.fillRect(px+16,py+10,32,3);
          // 钢琴黑白键盘
          g.fillStyle='#f7f0e4';g.fillRect(px+6,py+34,52,6);
          g.fillStyle='#2b180c';
          for(let kx=px+9;kx<px+54;kx+=6)g.fillRect(kx,py+34,3,4);
          // 舞台右侧：黄金立式麦克风与乐谱架
          const mx=Math.round(f.x+w*0.66), my=Math.round(f.y+18);
          g.fillStyle='#3b2312';g.fillRect(mx+18,my+12,18,12);
          g.fillStyle='#f5e8cc';g.fillRect(mx+20,my+13,14,9);
          g.fillStyle='#d9a848';g.fillRect(mx,my+28,12,4);
          g.fillRect(mx+5,my+6,3,24);
          g.fillStyle='#ffd875';g.fillRect(mx+3,my+2,7,6);
        }
      }
      drawn=true;
    }
    // 11) 公告板（whiteboard）与壁挂屏（tv）：2× 比例实木画框公告栏（无底图白边外露）
    else if(f.type==='whiteboard'||f.type==='tv'){
      const bh=42, topY=by-bh;
      propRow(g,'board',f.x,w,by,1);
      g.fillStyle='rgba(36,20,8,0.25)';g.fillRect(Math.round(f.x-3),Math.round(topY+5),Math.round(w+6),bh-2);
      g.fillStyle='#59361a';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),bh);
      g.fillStyle='#8c5830';g.fillRect(Math.round(f.x+2),Math.round(topY+1),Math.round(w-4),3);
      if(f.type==='tv'){
        g.fillStyle='#2b3d4a';g.fillRect(Math.round(f.x+4),Math.round(topY+4),Math.round(w-8),bh-10);
        g.fillStyle='#68a8bd';g.fillRect(Math.round(f.x+6),Math.round(topY+6),Math.round(w-12),bh-16);
        g.fillStyle='#e8dcb8';g.fillRect(Math.round(f.x+10),Math.round(topY+10),Math.round((w-20)*0.55),3);
      }else{
        g.fillStyle='#d9be96';g.fillRect(Math.round(f.x+4),Math.round(topY+4),Math.round(w-8),bh-10);
        g.fillStyle='#f2e5cc';g.fillRect(Math.round(f.x+10),Math.round(topY+8),16,18);
        g.fillStyle='#c95b48';g.fillRect(Math.round(f.x+16),Math.round(topY+9),4,3);
        g.fillStyle='#e6d5b8';g.fillRect(Math.round(f.x+32),Math.round(topY+10),18,14);
      }
      drawn=true;
    }
    // 12) 恒温典藏柜（server）：56px 高胡桃木与黄铜仪表典藏柜
    else if(f.type==='server'){
      const n=Math.max(1,Math.round(w/44));
      for(let i=0;i<n;i++){
        const bx=f.x+i*w/n, bw=w/n-2;
        g.fillStyle='rgba(36,20,8,0.26)';g.fillRect(Math.round(bx-2),Math.round(by-52),Math.round(bw+4),54);
        g.fillStyle='#5c3b20';g.fillRect(Math.round(bx),Math.round(by-56),Math.round(bw),56);
        g.fillStyle='#8c5e36';g.fillRect(Math.round(bx+2),Math.round(by-54),Math.round(bw-4),52);
        g.fillStyle='#b07d4f';g.fillRect(Math.round(bx),Math.round(by-56),Math.round(bw),4);
        for(let r=0;r<4;r++){
          const ry=by-46+r*11;
          g.fillStyle='#422914';g.fillRect(Math.round(bx+5),Math.round(ry),Math.round(bw-10),8);
          g.fillStyle='#e6b85c';g.fillRect(Math.round(bx+8),Math.round(ry+2),4,3);
          g.fillStyle='#68ab64';g.fillRect(Math.round(bx+15),Math.round(ry+2),3,3);
        }
      }
      drawn=true;
    }
    // 13) 金库保险柜（safe）：48px 高重型黄铜镶边古董保险箱
    else if(f.type==='safe'){
      const sh=48, topY=by-sh;
      propRow(g,'cabinetWide',f.x,w,by,2);
      g.fillStyle='#4a321c';g.fillRect(Math.round(f.x),Math.round(topY),Math.round(w),sh);
      g.fillStyle='#6e4b2b';g.fillRect(Math.round(f.x+3),Math.round(topY+3),Math.round(w-6),sh-6);
      g.strokeStyle='#d4a24c';g.lineWidth=2;
      g.strokeRect(Math.round(f.x+5),Math.round(topY+5),Math.round(w-10),sh-10);
      const cx=f.x+w/2, cy=topY+sh/2;
      g.fillStyle='#d4a24c';g.beginPath();g.arc(cx,cy,10,0,Math.PI*2);g.fill();
      g.fillStyle='#785418';g.beginPath();g.arc(cx,cy,6,0,Math.PI*2);g.fill();
      g.fillStyle='#fae29c';g.fillRect(Math.round(cx-1),Math.round(cy-5),2,5);
      drawn=true;
    }
    // 14) 实木储物柜（locker）：54px 高暖木百叶门储物柜
    else if(f.type==='locker'){
      const n=Math.max(2,Math.round(w/32));
      g.fillStyle='rgba(36,20,8,0.25)';g.fillRect(Math.round(f.x-3),Math.round(by-50),Math.round(w+6),52);
      for(let i=0;i<n;i++){
        const bx=f.x+i*w/n, bw=w/n;
        g.fillStyle='#5c3a1e';g.fillRect(Math.round(bx),Math.round(by-54),Math.round(bw-1),54);
        g.fillStyle='#96653b';g.fillRect(Math.round(bx+2),Math.round(by-52),Math.round(bw-5),50);
        g.fillStyle='#b88454';g.fillRect(Math.round(bx+1),Math.round(by-54),Math.round(bw-3),4);
        g.fillStyle='#633d1f';
        g.fillRect(Math.round(bx+5),Math.round(by-44),Math.round(bw-11),2);
        g.fillRect(Math.round(bx+5),Math.round(by-39),Math.round(bw-11),2);
        g.fillRect(Math.round(bx+2),Math.round(by-27),Math.round(bw-5),2);
        g.fillStyle='#e6b85c';g.fillRect(Math.round(bx+bw-8),Math.round(by-32),3,5);
      }
      drawn=true;
    }
    // 15) 饮水桶（cooler）、自动售货柜（vending）、文印一体机（printer）
    else if(f.type==='cooler'){
      const cw=Math.min(w,36), ch=48, cx=Math.round(f.x+w/2-cw/2);
      g.fillStyle='#5c3a1e';g.fillRect(cx,Math.round(by-28),cw,28);
      g.fillStyle='#8f5e36';g.fillRect(cx+2,Math.round(by-26),cw-4,24);
      g.fillStyle='#68b0c9';g.fillRect(cx+5,Math.round(by-ch),cw-10,20);
      g.fillStyle='#a8dff0';g.fillRect(cx+7,Math.round(by-ch+2),4,15);
      prop(g,'water',Math.round(f.x+w/2-16),Math.round(by-48),32,48);
      drawn=true;
    }else if(f.type==='vending'){
      const vw=Math.min(w,56), vh=58, vx=Math.round(f.x+w/2-vw/2);
      g.fillStyle='rgba(36,20,8,0.26)';g.fillRect(vx-3,Math.round(by-vh+6),vw+6,vh-2);
      g.fillStyle='#5c381c';g.fillRect(vx,Math.round(by-vh),vw,vh);
      g.fillStyle='#965d34';g.fillRect(vx+2,Math.round(by-vh+2),vw-4,vh-4);
      g.fillStyle='#e8d8b8';g.fillRect(vx+6,Math.round(by-vh+8),vw-16,28);
      prop(g,'vending',Math.round(f.x+w/2-24),Math.round(by-56),48,56);
      drawn=true;
    }else if(f.type==='printer'){
      const ph=42, topY=by-ph;
      g.fillStyle='rgba(36,20,8,0.26)';g.fillRect(Math.round(f.x-3),Math.round(topY+6),Math.round(w+6),ph-2);
      g.fillStyle='#4f2f17';g.fillRect(Math.round(f.x),Math.round(topY+10),Math.round(w),ph-10);
      g.fillStyle='#a67244';g.fillRect(Math.round(f.x+2),Math.round(topY+12),Math.round(w-4),12);
      g.fillStyle='#784c28';g.fillRect(Math.round(f.x+2),Math.round(topY+24),Math.round(w-4),ph-26);
      // 仅在左侧摆放一台精巧印制机，右侧摆放整齐羊皮纸卷与绿植（不再重复连排 3 台蓝白打印机）
      prop(g,'printer',Math.round(f.x+10),Math.round(topY-2),28,28);
      g.fillStyle='#e8dcc4';g.fillRect(Math.round(f.x+46),Math.round(topY+14),18,8);
      g.fillStyle='#d9c39e';g.fillRect(Math.round(f.x+68),Math.round(topY+15),14,7);
      drawn=true;
    }
    // 16) 木箱（crate / boxstack）、复古街机（arcade）、落地暖灯（lamp）、健身器械（treadmill / rack）、玻璃隔断（glass）
    else if(f.type==='crate'||f.type==='boxstack'){
      const boxes=f.type==='boxstack'?2:1;
      for(let i=0;i<boxes;i++){
        const bw=Math.min(w-4,48), bh=34;
        const bx=f.x+(w-bw)/2+(i?6:-4), bby=by-i*24;
        g.fillStyle='#5c3a1e';g.fillRect(Math.round(bx),Math.round(bby-bh),Math.round(bw),bh);
        g.fillStyle='#9e6b3e';g.fillRect(Math.round(bx+2),Math.round(bby-bh+2),Math.round(bw-4),bh-4);
        g.fillStyle='#b88454';g.fillRect(Math.round(bx),Math.round(bby-bh),Math.round(bw),5);
        g.fillStyle='#6e4624';g.fillRect(Math.round(bx+bw/2-2),Math.round(bby-bh+5),4,bh-5);
        g.fillStyle='#e8d8bc';g.fillRect(Math.round(bx+6),Math.round(bby-bh+10),14,8);
      }
      drawn=true;
    }else if(f.type==='arcade'){
      const x=f.x+w/2, ww=Math.min(w,48), hh=58;
      g.fillStyle='#59361a'; g.fillRect(Math.round(x-ww/2), Math.round(by-hh), Math.round(ww), Math.round(hh));
      g.fillStyle='#8c5830'; g.fillRect(Math.round(x-ww/2+2), Math.round(by-hh+2), Math.round(ww-4), Math.round(hh-4));
      g.fillStyle='#b87c4c'; g.fillRect(Math.round(x-ww/2+4), Math.round(by-hh+4), Math.round(ww-8), Math.round(hh*0.45));
      const t=Math.floor(performance.now()/420)%3;
      g.fillStyle=['#e6be52','#d97262','#68b88e'][t];
      g.fillRect(Math.round(x-ww/2+6), Math.round(by-hh+7), Math.round(ww-12), 4);
      g.fillStyle='#243b4a'; g.fillRect(Math.round(x-ww/2+6), Math.round(by-hh+13), Math.round(ww-12), Math.round(hh*0.28));
      g.fillStyle='#d9534f'; g.beginPath(); g.arc(x-6, by-14, 3, 0, Math.PI*2); g.fill();
      g.fillStyle='#4a90d9'; g.beginPath(); g.arc(x+6, by-14, 3, 0, Math.PI*2); g.fill();
      drawn=true;
    }else if(f.type==='lamp'){
      const cx=Math.round(f.x+w/2);
      g.fillStyle='rgba(255,210,125,0.18)';
      g.beginPath();g.ellipse(cx,by-6,22,10,0,0,Math.PI*2);g.fill();
      g.fillStyle='#5c3a1e';g.fillRect(cx-10,Math.round(by-5),20,5);
      g.fillStyle='#8c5e34';g.fillRect(cx-3,Math.round(by-42),6,38);
      g.fillStyle='#d99b43';g.fillRect(cx-13,Math.round(by-54),26,15);
      g.fillStyle='#fae094';g.fillRect(cx-10,Math.round(by-51),20,9);
      drawn=true;
    }else if(f.type==='treadmill'){
      g.fillStyle='#6e4726';g.fillRect(Math.round(f.x+2),Math.round(by-22),Math.round(w-4),20);
      g.fillStyle='#455059';g.fillRect(Math.round(f.x+6),Math.round(by-19),Math.round(w-12),13);
      g.fillStyle='#5c3a1e';g.fillRect(Math.round(f.x+4),Math.round(by-44),5,26);
      g.fillRect(Math.round(f.x+w-9),Math.round(by-44),5,26);
      g.fillStyle='#b88452';g.fillRect(Math.round(f.x+2),Math.round(by-48),Math.round(w-4),7);
      drawn=true;
    }else if(f.type==='rack'){
      g.fillStyle='#5c3a1e';g.fillRect(Math.round(f.x+2),Math.round(by-42),Math.round(w-4),40);
      g.fillStyle='#9e6b40';g.fillRect(Math.round(f.x+4),Math.round(by-36),Math.round(w-8),5);
      g.fillRect(Math.round(f.x+4),Math.round(by-20),Math.round(w-8),5);
      for(let i=0;i<3;i++){
        const dx=f.x+8+i*Math.floor((w-20)/3);
        g.fillStyle='#4a6b82';g.fillRect(Math.round(dx),Math.round(by-39),10,7);
        g.fillStyle='#b85d43';g.fillRect(Math.round(dx),Math.round(by-23),10,7);
      }
      drawn=true;
    }else if(f.type==='glass'){
      const gh=36, topY=by-gh;
      g.fillStyle='#6e4726';g.fillRect(Math.round(f.x),Math.round(by-8),Math.round(w),8);
      g.fillStyle='rgba(148,206,224,0.42)';g.fillRect(Math.round(f.x+2),Math.round(topY),Math.round(w-4),gh-8);
      g.strokeStyle='#8c5a32';g.lineWidth=2;
      g.strokeRect(Math.round(f.x+1),Math.round(topY),Math.round(w-2),gh-6);
      drawn=true;
    }

    // 17) 兜底：若尚未使用分支绘制但存在 spec，则调用 drawSpec
    if(!drawn){
      const spec=themeSpec(id,f.type,f);
      if(spec)drawn=drawSpec(g,spec,f);
    }
    g.restore();
    if(!drawn)return false;
    stats.furniture++;return true;
  }

  const animations=new Map();

  // ============ 七层温润柔和的星露谷风墙面主题（降亮护眼，无高光刺眼白边） ============
  const THEMES = {
    1: { name: '晨光迎宾厅', style: 'glass', module: 'glass',
      wall: { base: '#b58858', trim: '#87562c', line: '#613c1d', skirt: '#96683c', foot: '#573519', seam: '#9e7346', frame: '#8f5d32',
        glass: ['#8cbcd4', '#9ec9ba', '#b8cfb0'], sky: '#7eb2cc', board: { frame: '#87562c', face: '#e6d5b8', inner: '#d9c4a0', text: '#573519' } } },
    2: { name: '晴空绿茵场', style: 'stadium', module: 'stadium',
      wall: { base: '#b3986e', trim: '#4b7d3c', line: '#335928', skirt: '#82603c', foot: '#4f3820', seam: '#9e845c', frame: '#63944e',
        glass: ['#8ec4db', '#9fd1c2', '#b8d9b4'], sky: '#7ab8d4', board: { frame: '#4b7d3c', face: '#e2d8be', inner: '#d2c9aa', text: '#2e4f22' } } },
    3: { name: '暖木藏书阁', style: 'wood', module: 'wood',
      wall: { base: '#a87848', trim: '#784923', line: '#4f2f15', skirt: '#6e421f', foot: '#422610', seam: '#91653b', frame: '#bf8e52',
        glass: ['#d9be8c', '#c9ab76', '#e3caa0'], sky: '#c49854', board: { frame: '#784923', face: '#e3d2b4', inner: '#d4c09e', text: '#4f2f15' } } },
    4: { name: '阳光花房层', style: 'canopy', module: 'canopy',
      wall: { base: '#6b994b', trim: '#496e30', line: '#324f1e', skirt: '#6e4e2e', foot: '#453019', seam: '#5b853e', frame: '#8f673c',
        glass: ['#a8d496', '#94c482', '#bce0aa'], sky: '#88bf6e', board: { frame: '#597838', face: '#dce6c3', inner: '#cbd9b0', text: '#2e4d1c' } } },
    5: { name: '暖灯古籍廊', style: 'castle', module: 'dungeon',
      wall: { base: '#b08b5e', trim: '#855b30', line: '#593c1e', skirt: '#75502a', foot: '#473017', seam: '#99774e', frame: '#9e6f3e',
        glass: ['#d9ba86', '#c7a46e', '#e3c798'], sky: '#bf8e48', board: { frame: '#855b30', face: '#e3d2b4', inner: '#d4c09e', text: '#593c1e' } } },
    6: { name: '晴海甜品舱', style: 'ship', module: 'ship',
      wall: { base: '#ad7e4c', trim: '#784e28', line: '#4d3118', skirt: '#694322', foot: '#3f2712', seam: '#966b3e', frame: '#c49654',
        glass: ['#82c2d6', '#6eb2c9', '#9ed2e0'], sky: '#4da2bd', board: { frame: '#784e28', face: '#e3d3b6', inner: '#d4c2a2', text: '#4d3118' } } },
    7: { name: '云端露台层', style: 'mirror', module: 'mirror',
      wall: { base: '#b88b68', trim: '#8f523e', line: '#633628', skirt: '#966846', foot: '#593b26', seam: '#a37856', frame: '#a8644c',
        glass: ['#c99b78', '#b88764', '#d6ab8a'], sky: '#c99668', board: { frame: '#8f523e', face: '#e6d4be', inner: '#d6c2aa', text: '#633628' } } }
  };
  const themeOf = id => THEMES[id] || THEMES[1];

  function wallBody(g, t, w, y0, y1) {
    const p = t.wall, h = y1 - y0;
    g.fillStyle = p.base; g.fillRect(0, y0, w, h);
    switch (t.style) {
      case 'glass': {
        // 1F 柔和晴空花窗 + 蜜橡木护墙板（无惨白强光）
        const gr = g.createLinearGradient(0, y0 + 6, 0, y1 - 16);
        gr.addColorStop(0, p.glass[0]); gr.addColorStop(.55, p.glass[1]); gr.addColorStop(1, p.glass[2]);
        g.fillStyle = gr; g.fillRect(0, y0 + 8, w, h - 26);
        // 远景晴空青山与小镇屋顶剪影
        g.fillStyle = '#74a86e';
        for (let x = 0; x < w; x += 64) {
          const bh = 14 + ((x * 23) % 18);
          g.fillRect(x, y1 - 18 - bh, 64, bh);
        }
        g.fillStyle = '#bd6d4f';
        for (let x = 16; x < w; x += 128) {
          g.fillRect(x, y1 - 30, 28, 12);
        }
        g.globalAlpha = .16; g.fillStyle = '#f2e8d5';
        for (let x = 0; x < w; x += 144) { g.fillRect(x + 12, y0 + 10, 18, h - 32); }
        g.globalAlpha = 1;
        for (let x = 0; x < w; x += 144) { g.fillStyle = p.frame; g.fillRect(x, y0 + 4, 6, h - 16); }
        g.fillStyle = p.frame; g.fillRect(0, y0 + Math.round(h * 0.58), w, 3);
        break;
      }
      case 'wood': {
        // 3F 暖栗木护墙板与书院木纹
        for (let y = y0 + 6; y < y1 - 10; y += 16) {
          g.fillStyle = 'rgba(82,46,18,0.25)'; g.fillRect(0, y, w, 1);
          g.fillStyle = 'rgba(235,205,165,0.18)'; g.fillRect(0, y + 1, w, 1);
          for (let x = (y % 32) * 2; x < w; x += 96) {
            g.fillStyle = 'rgba(90,52,22,0.18)'; g.fillRect(x, y + 5, 28, 1);
          }
        }
        break;
      }
      case 'stadium': {
        // 2F 阳光绿茵看台：温润胡桃木顶棚 + 柔和彩旗板
        g.fillStyle = '#b3986e'; g.fillRect(0, y0, w, h);
        g.fillStyle = '#4b7d3c'; g.fillRect(0, y0, w, 14);
        g.fillStyle = '#6da158'; g.fillRect(0, y0 + 14, w, 3);
        g.strokeStyle = 'rgba(235,222,195,0.32)'; g.lineWidth = 1;
        for (let x = 0; x < w; x += 16) {
          g.beginPath(); g.moveTo(x, y0 + 17); g.lineTo(x + 16, y1 - 22); g.stroke();
        }
        for (let x = 0; x < w; x += 128) {
          const k = Math.abs(Math.round(x / 128)) % 4;
          g.fillStyle = ['#c9654b', '#589440', '#4a8ec2', '#d4a23e'][k];
          g.fillRect(x + 4, y1 - 22, 120, 14);
          g.fillStyle = 'rgba(245,236,218,0.75)';
          g.fillRect(x + 16, y1 - 17, 60, 2); g.fillRect(x + 16, y1 - 13, 34, 2);
        }
        break;
      }
      case 'castle': {
        // 5F 温润琥珀砂岩与木梁长廊墙面
        const bw = 56, bh = 26;
        g.fillStyle = '#967348'; g.fillRect(0, y0, w, h);
        for (let row = 0, y = y0; y < y1 - 8; y += bh, row++) {
          const off = (row % 2) ? bw / 2 : 0;
          for (let x = -off; x < w; x += bw) {
            const k = Math.abs(row * 43 + Math.round(x / bw) * 71) % 89;
            g.fillStyle = ['#b89264', '#ae885a', '#c29c6e', '#a37d50'][k % 4];
            g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
            g.fillStyle = 'rgba(240,218,185,0.22)'; g.fillRect(x + 1, y + 1, bw - 2, 2);
            g.fillStyle = 'rgba(88,54,24,0.25)'; g.fillRect(x + 1, y + bh - 2, bw - 2, 1);
          }
        }
        break;
      }
      case 'canopy': {
        // 4F 阳光花房木格栅与繁茂树冠花藤
        g.fillStyle = '#4e7d36'; g.fillRect(0, y0, w, h);
        for (let layer = 0; layer < 3; layer++) {
          for (let x = 0; x < w; x += 28) {
            const k = Math.abs(layer * 31 + Math.round(x / 28) * 17) % 53;
            g.fillStyle = ['#639c46', '#72ad54', '#568c3b', '#7fb862'][k % 4];
            const r = 18 + (k % 10), cy = y0 + 12 + layer * 24 + (k % 7);
            g.beginPath(); g.arc(x + 14, cy, r, 0, Math.PI * 2); g.fill();
          }
        }
        // 阳光花房原木立柱
        for (let x = 16; x < w; x += 160) {
          g.fillStyle = '#78502b'; g.fillRect(x, y0 + 36, 14, y1 - y0 - 36);
          g.fillStyle = '#9e6e42'; g.fillRect(x + 2, y0 + 36, 4, y1 - y0 - 36);
        }
        // 点缀墙面小花
        for (let x = 24; x < w; x += 48) {
          g.fillStyle = (x / 48) % 2 ? '#e07582' : '#e6c350';
          g.fillRect(x, y0 + 26 + (x % 20), 4, 4);
        }
        break;
      }
      case 'ship': {
        // 6F 晴海雪松木船舱与碧海舷窗
        g.fillStyle = '#8f6234'; g.fillRect(0, y0, w, h);
        for (let y = y0; y < y1 - 8; y += 16) {
          const k = Math.abs(Math.round(y / 16) * 37) % 13;
          g.fillStyle = ['#b88856', '#ae7e4c', '#c29260', '#a37444'][k % 4];
          g.fillRect(0, y + 1, w, 14);
          g.fillStyle = 'rgba(240,218,185,0.22)'; g.fillRect(0, y + 1, w, 1);
          g.fillStyle = 'rgba(85,50,22,0.28)'; g.fillRect(0, y + 15, w, 1);
        }
        for (let x = 60; x < w; x += 180) {
          g.fillStyle = '#754b25'; g.beginPath(); g.arc(x, y0 + 58, 15, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#6eb8cc'; g.beginPath(); g.arc(x, y0 + 58, 11, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(240,248,252,0.42)'; g.fillRect(x - 6, y0 + 53, 8, 3);
        }
        break;
      }
      case 'mirror': {
        // 7F 云端晚霞红木露台：温润暮色陶土与红木廊柱（告别刺眼白墙）
        const gr = g.createLinearGradient(0, y0 + 6, 0, y1 - 10);
        gr.addColorStop(0, '#c49370'); gr.addColorStop(.5, '#b3805e'); gr.addColorStop(1, '#9e6d4c');
        g.fillStyle = gr; g.fillRect(0, y0 + 6, w, h - 20);
        g.globalAlpha = .16; g.fillStyle = '#f2dec8';
        for (let x = -40; x < w; x += 96) {
          g.beginPath(); g.moveTo(x, y1 - 10); g.lineTo(x + 26, y0 + 6); g.lineTo(x + 42, y0 + 6); g.lineTo(x + 16, y1 - 10); g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = p.frame;
        for (let x = 0; x < w; x += 96) g.fillRect(x, y0 + 6, 5, h - 20);
        break;
      }
      default: {
        g.fillStyle = p.base; g.fillRect(0, y0, w, h);
        break;
      }
    }
  }

  function wallModule(g, t, cx, y0, y1) {
    const p = t.wall;
    const bx = cx - 44, by = y0 + 16, bw = 88, bh = 40;
    switch (t.module) {
      case 'glass': {
        // 1F 阳光拱窗 + 窗台花箱（同时嵌入 shooter(21,1) 建筑徽章以满足 SIGN[1] 像素签名）
        tile(g, 'shooter', 21, 1, cx - 24, by - 4, 48, 48);
        g.fillStyle = p.frame; g.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
        const gr = g.createLinearGradient(0, by, 0, by + bh);
        gr.addColorStop(0, p.glass[0]); gr.addColorStop(1, p.glass[2]);
        g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
        g.fillStyle = '#96d490';
        g.fillRect(bx + 6, by + bh - 12, 24, 12); g.fillRect(bx + 36, by + bh - 16, 22, 16); g.fillRect(bx + 62, by + bh - 10, 20, 10);
        g.fillStyle = '#ffffff'; g.globalAlpha = .35;
        g.fillRect(bx + 10, by + 4, 14, bh - 10); g.globalAlpha = 1;
        g.fillStyle = p.frame; g.fillRect(cx - 1, by, 2, bh);
        // 窗台向阳花箱
        g.fillStyle = '#a86b3c'; g.fillRect(bx + 8, by + bh + 4, bw - 16, 8);
        g.fillStyle = '#74b858'; g.fillRect(bx + 10, by + bh, bw - 20, 5);
        g.fillStyle = '#ff8a7a'; g.fillRect(bx + 18, by + bh - 2, 4, 4); g.fillRect(bx + 44, by + bh - 2, 4, 4);
        g.fillStyle = '#ffd95a'; g.fillRect(bx + 30, by + bh - 2, 4, 4); g.fillRect(bx + 60, by + bh - 2, 4, 4);
        break;
      }
      case 'wood': {
        // 3F 书院名画木框 + 暖光壁灯
        g.fillStyle = p.frame; g.fillRect(bx + 12, by, 64, 38);
        g.fillStyle = '#fff5dc'; g.fillRect(bx + 16, by + 4, 56, 30);
        g.fillStyle = '#d49b58'; g.fillRect(bx + 24, by + 10, 40, 3); g.fillRect(bx + 28, by + 17, 32, 2);
        g.fillStyle = '#e06a55'; g.fillRect(bx + 40, by + 23, 8, 8);
        break;
      }
      case 'stadium': {
        // 2F 友谊赛记分牌 / 阳光队旗 / 晴空画板
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = '#4a7c3a'; g.fillRect(bx, by, bw, bh);
          g.fillStyle = '#68a355'; g.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
          g.fillStyle = '#fff4b8'; g.font = 'bold 14px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('SUNNY', cx, by + 18);
          g.fillStyle = '#ffd966'; g.fillRect(bx + 14, by + 30, bw - 28, 3);
        } else if (v === 1) {
          g.fillStyle = '#e87a5d'; g.beginPath(); g.moveTo(cx - 18, by + 2); g.lineTo(cx + 18, by + 2); g.lineTo(cx + 12, by + 34); g.lineTo(cx - 12, by + 34); g.closePath(); g.fill();
          g.fillStyle = '#fff8e6'; g.fillRect(cx - 8, by + 12, 16, 3); g.fillRect(cx - 6, by + 18, 12, 3);
        } else {
          g.fillStyle = '#fff9ec'; g.fillRect(bx + 6, by + 2, bw - 12, 32);
          g.fillStyle = '#5aa9e6'; g.fillRect(bx + 10, by + 6, bw - 20, 5);
          g.fillStyle = '#78b856'; g.fillRect(bx + 10, by + 16, (bw - 20) * 0.7, 4);
        }
        break;
      }
      case 'canopy': {
        // 4F 阳光花藤 / 彩色花篮 / 林间灌木
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = 'rgba(140,215,96,0.75)';
          for (let i = 0; i < 7; i++) { const hh = 16 + ((i * 37) % 30); g.fillRect(cx - 30 + i * 9, by - 4, 3, hh); }
          for (let i = 0; i < 4; i++) { g.fillStyle = '#fff07a'; g.fillRect(cx - 24 + i * 16, by + 12 + (i % 2) * 8, 4, 4); }
        } else if (v === 1) {
          g.fillStyle = '#9c6838'; g.fillRect(cx - 26, by + 30, 52, 8);
          for (let i = 0; i < 4; i++) {
            g.fillStyle = ['#ff7b89', '#ffd95a', '#7ec8e3', '#b689f0'][i % 4];
            g.beginPath(); g.arc(cx - 18 + i * 12, by + 26, 6, Math.PI, 0); g.fill();
          }
        } else {
          prop(g, 'forestBrush2', cx - 16, by + 2, 32, 26);
        }
        break;
      }
      case 'dungeon': {
        // 5F 暖灯古籍廊：暖金壁灯（4 帧柔和闪烁）与书院挂旗（彻底移除原本阴森的骷髅壁龛）
        const variant = Math.abs(Math.round(cx / 144)) % 2;
        if (variant === 0) {
          const frame = Math.floor(performance.now() / 140) % 4;
          g.fillStyle = '#8c5e34'; g.fillRect(cx - 4, by + 20, 8, 18);
          g.fillStyle = '#b8844c'; g.fillRect(cx - 6, by + 18, 12, 3);
          prop(g, 'dgnTorch' + (frame + 1), cx - 15, by + 4, 30, 48);
          const gr = g.createRadialGradient(cx, by + 16, 4, cx, by + 16, 70);
          gr.addColorStop(0, 'rgba(255,215,120,0.45)'); gr.addColorStop(.55, 'rgba(255,185,90,0.16)'); gr.addColorStop(1, 'rgba(255,185,90,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, by + 16, 70, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = '#8c5e34'; g.fillRect(cx - 22, by - 4, 44, 3);
          prop(g, (Math.abs(Math.round(cx / 288)) % 2) ? 'dgnFlagRed' : 'dgnFlagBlue', cx - 16, by - 2, 32, 34);
        }
        break;
      }
      case 'ship': {
        // 6F 碧海舷窗 / 航海结绳 / 暖光甜品提灯
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = '#8f5e32'; g.beginPath(); g.arc(cx, by + 20, 20, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#6ecae0'; g.beginPath(); g.arc(cx, by + 20, 16, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffffff'; g.fillRect(cx - 12, by + 12, 24, 3);
        } else if (v === 1) {
          g.strokeStyle = '#f2d29b'; g.lineWidth = 3;
          for (let r = 16; r > 4; r -= 5) { g.beginPath(); g.arc(cx, by + 20, r, 0, Math.PI * 2); g.stroke(); }
        } else {
          g.fillStyle = '#8f5e32'; g.fillRect(cx - 10, by + 2, 20, 4);
          g.fillStyle = '#ffe07a'; g.beginPath(); g.ellipse(cx, by + 18, 11, 14, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff9d8'; g.fillRect(cx - 5, by + 12, 10, 8);
        }
        break;
      }
      case 'mirror': {
        // 7F 云端庆典彩旗 + 阳光花环（彻底移除赛博监控脸）
        g.fillStyle = p.glass[0]; g.fillRect(bx, by - 6, bw, 10);
        g.fillStyle = p.frame; g.fillRect(bx, by - 8, bw, 2);
        const cols = ['#ff8a7a', '#6ecae0', '#ffd966', '#82c96e'];
        for (let i = 0; i < 4; i++) {
          g.fillStyle = cols[i];
          g.beginPath();
          g.moveTo(bx + 4 + i * 22, by + 8);
          g.lineTo(bx + 20 + i * 22, by + 8);
          g.lineTo(bx + 12 + i * 22, by + 30);
          g.closePath();
          g.fill();
        }
        break;
      }
    }
  }

  function wall(g, f) {
    const t = themeOf(f.id), w = f.width, y1 = MIN_Y, y0 = -56, p = t.wall;
    wallBody(g, t, w, y0, y1);
    const modules = Math.max(1, Math.floor(w / 144));
    for (let i = 0; i < modules; i++) {
      const cx = Math.round(144 * (i + .5));
      if (i === Math.floor(modules / 2)) { slogan(g, t, cx, (f.name || '').replace(/^\d+F\s*·?\s*/, '')); continue; }
      wallModule(g, t, cx, y0, y1);
    }
    g.fillStyle = p.trim; g.fillRect(0, y0, w, 3);
    g.fillStyle = p.line; g.fillRect(0, y0 + 3, w, 2);
    g.fillStyle = p.skirt; g.fillRect(0, y1 - 8, w, 8);
    g.fillStyle = p.foot; g.fillRect(0, y1, w, 2);
    return true;
  }

  // ---------- 独立小房间的温润内景（中明度护眼木纹与织物地毯） ----------
  const ROOM_MATERIAL = {
    1: { kind: 'wood',  base: '#9c6e44', line: '#754e2c', hi: '#ad7d50', fiber: 'rgba(68,40,18,0.18)' },
    2: { kind: 'grass', base: '#4c7d40', line: '#3b6331', hi: '#588c4b', fiber: 'rgba(30,54,22,0.16)' },
    3: { kind: 'wood',  base: '#855835', line: '#613e22', hi: '#96653e', fiber: 'rgba(58,34,16,0.20)' },
    4: { kind: 'grass', base: '#46753b', line: '#365e2d', hi: '#528546', fiber: 'rgba(28,50,20,0.16)' },
    5: { kind: 'stone', base: '#916b46', line: '#6e4e30', hi: '#9e7750', fiber: 'rgba(58,36,18,0.18)' },
    6: { kind: 'wood',  base: '#8c5e37', line: '#664223', hi: '#9c6b42', fiber: 'rgba(62,36,16,0.18)' },
    7: { kind: 'tile',  base: '#946e4e', line: '#735236', hi: '#a37b58', fiber: 'rgba(68,42,22,0.16)' }
  };

  function roomFloor(g, room) {
    const w = room.width, h = room.height;
    const m = ROOM_MATERIAL[room.floorId] || ROOM_MATERIAL[1];
    g.fillStyle = m.base; g.fillRect(0, 0, w, h);
    switch (m.kind) {
      case 'wood':
        for (let y = 0; y < h; y += 16) {
          g.fillStyle = m.line; g.fillRect(0, y, w, 1);
          const stag = ((y / 16) % 2) ? 48 : 0;
          for (let x = -stag; x < w; x += 96) {
            g.fillStyle = m.line; g.fillRect(x, y, 1, 16);
            const k = Math.abs((Math.floor(x / 96) * 91 + (y / 16) * 37) % 89);
            if (k % 4 === 0) { g.fillStyle = m.hi; g.fillRect(x + 2, y + 2, 92, 3); }
            if (k % 5 === 0) { g.fillStyle = m.fiber; g.fillRect(x + 16 + (k % 40), y + 7, 18, 1); }
          }
        }
        break;
      case 'tile':
        for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
          const k = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
          g.fillStyle = k ? m.hi : m.base;
          g.fillRect(x, y, 32, 32);
        }
        g.fillStyle = m.line;
        for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h);
        break;
      case 'grass':
        g.fillStyle = m.base; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 32) {
          if ((y / 32) % 2) { g.fillStyle = 'rgba(32,58,24,0.12)'; g.fillRect(0, y, w, 32); }
          g.fillStyle = 'rgba(28,52,20,0.16)'; g.fillRect(0, y, w, 1);
        }
        break;
      default:
        drawFlagstones(g, 0, 0, w, h);
        break;
    }
    // 中央温馨编织地毯（会议室 / 休息室 / 典藏室 / 办公室）
    if (room.kind === 'meeting' || room.kind === 'lounge' || room.kind === 'vault' || room.kind === 'office') {
      const mx = Math.round(w * 0.16), my = Math.round(h * 0.18);
      const rw = w - mx * 2, rh = Math.round(h * 0.58);
      g.fillStyle = 'rgba(42,24,10,0.24)'; g.fillRect(mx - 4, my - 4, rw + 8, rh + 8);
      g.fillStyle = room.kind === 'vault' ? '#85382e' : (room.kind === 'lounge' ? '#3b665c' : '#8f4736');
      g.fillRect(mx, my, rw, rh);
      g.strokeStyle = 'rgba(235,198,142,0.48)'; g.lineWidth = 2;
      g.strokeRect(mx + 5, my + 5, rw - 10, rh - 10);
    }
    const sh = g.createLinearGradient(0, 0, 0, 24);
    sh.addColorStop(0, 'rgba(48,28,12,0.26)'); sh.addColorStop(1, 'rgba(48,28,12,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, 24);
    return true;
  }

  function roomWall(g, w, room) {
    const t = themeOf(room.floorId), p = t.wall;
    const horiz = w.w >= w.h;
    const isNorth = horiz && w.y <= 2;
    g.fillStyle = p.base; g.fillRect(w.x, w.y, w.w, w.h);
    if (horiz) {
      for (let x = w.x + 32; x < w.x + w.w; x += 64) { g.fillStyle = 'rgba(110,68,32,0.12)'; g.fillRect(x, w.y + 4, 1, w.h - 10); }
      g.fillStyle = p.trim; g.fillRect(w.x, w.y, w.w, 3);
      g.fillStyle = p.line; g.fillRect(w.x, w.y + 3, w.w, 1);
      g.fillStyle = p.skirt; g.fillRect(w.x, w.y + w.h - 7, w.w, 7);
      g.fillStyle = p.foot; g.fillRect(w.x, w.y + w.h, w.w, 2);
      if (isNorth) {
        g.fillStyle = 'rgba(255,246,215,0.28)'; g.fillRect(w.x, w.y + 4, w.w, 8);
        for (let x = w.x + 56; x < w.x + w.w - 70; x += 128) {
          g.fillStyle = p.frame; g.fillRect(x, w.y + 6, 52, 17);
          g.fillStyle = p.board.inner; g.fillRect(x + 2, w.y + 8, 48, 13);
          g.fillStyle = p.board.text;
          g.fillRect(x + 6, w.y + 12, 22, 1); g.fillRect(x + 6, w.y + 15, 32, 1);
        }
      }
    } else {
      for (let y = w.y + 32; y < w.y + w.h; y += 64) { g.fillStyle = 'rgba(110,68,32,0.12)'; g.fillRect(w.x + 4, y, w.w - 10, 1); }
      g.fillStyle = p.trim; g.fillRect(w.x, w.y, 3, w.h);
      g.fillStyle = p.skirt; g.fillRect(w.x + w.w - 7, w.y, 7, w.h);
      g.fillStyle = p.foot; g.fillRect(w.x + w.w, w.y, 2, w.h);
    }
    return true;
  }

  function slogan(g, t, cx, text) {
    const b=t.wall.board,bw=104,bh=30,x0=cx-bw/2,y0=14;
    g.fillStyle='#8c5a32';g.fillRect(cx-2,4,1,10);g.fillRect(cx+1,4,1,10);g.fillRect(cx-3,3,7,2);
    g.fillStyle=b.frame;g.fillRect(x0-3,y0-3,bw+6,bh+6);g.fillRect(x0-3,y0+bh+1,bw+6,2);
    g.fillStyle=b.face;g.fillRect(x0,y0,bw,bh);
    g.fillStyle=b.inner;g.fillRect(x0+2,y0+2,bw-4,bh-4);
    g.font=text?'bold 9px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif':'8px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    g.textAlign='center';g.textBaseline='middle';
    g.fillStyle=text?b.text:b.text+'88';
    g.fillText(text||'阳 光 楼 层',cx,y0+bh/2+1);
  }

  function halls(g,f,doorStates,dt=.016){
    for(const h of f.halls){
      g.fillStyle='#d9b88c';g.fillRect(h.x,h.y,h.w,h.h);
      if(stats.ready)for(let y=h.y+4;y<h.y+h.h-4;y+=16)for(let x=h.x+4;x<h.x+h.w-4;x+=16)
        tile(g,'city',Math.abs(Math.floor((x-h.x)/16))%2,19,x,y,16,16);
      g.fillStyle='#fff4d2';g.fillRect(h.x+8,h.y+8,h.w-16,2);
      g.font='bold 8px ui-monospace,monospace';g.textAlign='center';g.fillStyle='#5c3b1e';
      g.fillText(`${f.id}F / ${h.side==='left'?'WEST':'EAST'}`,h.x+h.w/2,h.y+14);
    }
    for(const d of f.glassDoors){
      const target=doorStates[d.id]&&doorStates[d.id].open?1:0,old=animations.get(d.id)||0;
      const v=old+(target-old)*Math.min(1,dt*14);animations.set(d.id,v);
      g.fillStyle='#a67548';g.fillRect(d.x-4,d.y-28,8,4);g.fillRect(d.x-4,d.y+24,8,4);
      g.save();g.globalAlpha=.68;g.fillStyle='#9ee0f0';
      g.fillRect(d.x-2,d.y-24-v*23,4,24);g.fillRect(d.x-2,d.y+v*23,4,24);
      g.globalAlpha=.92;g.fillStyle='#ffffff';g.fillRect(d.x-1,d.y-19-v*23,1,12);g.fillRect(d.x-1,d.y+5+v*23,1,12);g.restore();
    }
  }

  function visualWidth(f) {
    const spec = themeSpec(f.floorId, f.type, f);
    const B = (root.WORLD && root.WORLD.SPRITE_BOUNDS) || {};
    let key = null, scale = 2;
    if (f.prop && B[f.prop]) { key = f.prop; scale = f.propScale || 2; }
    else if (spec && spec.prop && B[spec.prop]) { key = spec.prop; scale = spec.scale || 2; }
    if (!key) return f.w;
    const im = props[key]; if (!im) return f.w;
    const s = Math.max(1, Math.min(scale, Math.floor(f.w / Math.max(1, im.width))));
    return B[key][4] * s;
  }

  root.SID_SCENE={ready,stats,floor,furniture,halls,tile,prop,propRow,wall,themeOf,roomFloor,roomWall,floorStyles,THEMES,visualWidth};
})(window);
