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
  // 注：oga-indoor/*（CC-BY，洋红键）仍在 vendor 目录留档，但本轮无 spec 引用，
  //     故不在此加载，避免"加载却从不绘制"的隐性开销；将来要用时注册回来即可。
  // 洋红抠图（#FF00FF）的图集：加载后过一次 canvas 色键，避免"带着洋红底画进画面"。
  const CHROMA_TILE_SPACING={ogaBase:0,ogaExp:0,ogaExtra:0};   // 这三张图集无 1px 缝，步长 16
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
    // 需求②（第二轮）：4F 地牢奇幻层 —— 0x72 16×16 Dungeon Tileset（CC0，选片见 vendor 内 SOURCE-README）
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
    // 战利品图标（真实素材）：Antea 纸/文件夹/便签 + Pixelfrog 宝藏 + 0x72 药水
    lootPapers:'antea-office/Papers.png', lootFolders:'antea-office/Folders.png', lootNote:'antea-office/Wall-Note.png',
    lootGold:'pixelfrog-treasure/gold-coin.png', lootDiamond:'pixelfrog-treasure/blue-diamond.png',
    lootMap:'pixelfrog-treasure/big-map.png', lootPotion:'pixelfrog-treasure/red-potion.png',
    lootSkull:'pixelfrog-treasure/golden-skull.png',
    lootFlaskR:'dungeon-0x72/flask_red.png', lootFlaskG:'dungeon-0x72/flask_green.png',
    lootFlaskB:'dungeon-0x72/flask_blue.png', lootFlaskY:'dungeon-0x72/flask_yellow.png',
    // 第二轮：七层七世界观的道具（用户 pixel-themes-7floors）
    // 4F 森林（Snakerser Peaceful Forest）
    forestTree1:'forest-snakerser/tree1a.png', forestTree2:'forest-snakerser/tree2b.png',
    forestBrush1:'forest-snakerser/brush1.png', forestBrush2:'forest-snakerser/brush2.png',
    forestStump:'forest-snakerser/stump.png',
    forestRock1:'forest-snakerser/rock1a.png', forestRock2:'forest-snakerser/rock2a.png',
    forestFlowerR:'forest-snakerser/flowerRed.png', forestFlowerB:'forest-snakerser/flowerBlue.png',
    // 7F 赛博（Warped City / Neon District）
    hotelSign:'cyber-warped/hotel-sign.png', bannerArrow:'cyber-warped/banner-arrow.png',
    bannerSmall:'cyber-warped/banner-small.png', bannerBig:'cyber-warped/banner-a.png',
    controlBox:'cyber-warped/control-box.png', monitorFace:'cyber-warped/monitorface.png',
    cyberLight:'cyber-warped/light.png', antenna:'cyber-warped/antenna.png',
    neonFloorBase:'cyber-neon/floor_concrete_clean_base.png', neonFloorWet:'cyber-neon/floor_concrete_clean_wet.png',
    neonStripH:'cyber-neon/neon_strip_floor_h.png', neonStripV:'cyber-neon/neon_strip_floor_v.png',
    neonHolo:'cyber-neon/panel_holo_on_f0.png', neonWall:'cyber-neon/wall_neon_glow.png',
    // 主题装饰单文件（CC0，仅保留确有 spec 引用的，避免"加载但从不绘制"）
    candyPop:'candy-lumimae-yaycandies/yaycandies/size1/lollipop_red.png'
  };
  // 非 16px 等距图集：tile() 取格用的步长/格宽（默认 Kenney 的 17/16）
  const SHEET_GRID={farm:{stride:17,tile:16},shooter:{stride:64,tile:64},sports:{stride:64,tile:64}};
  const cellOf=key=>SHEET_GRID[key]||{stride:16,tile:16};
  const images={},props={};
  const load=(src)=>{const i=new Image();return new Promise((res,rej)=>{i.onload=res;i.onerror=()=>rej(new Error('Asset failed: '+src));i.src=src;}).then(()=>{if(i.decode)return i.decode().catch(()=>{});}).then(()=>i);};
  // 洋红键置透明：交给浏览器解码，一次性得到可直接 drawImage 的源（canvas 也可作为 drawImage 源）
  // 注意：file:// 下画布会被视为跨域，getImageData 抛错 —— 此时保持原图（离线包请用带 alpha 的成品图）。
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
  // 仅对确认采用洋红键的图集做色键；其余图集为真 alpha，直接用原图。
  const CHROMA_SET=new Set([]);
  const ready=Promise.all([
    ...Object.entries(atlases).map(([k,p])=>load(new URL(p,base).href).then(im=>{images[k]=CHROMA_SET.has(k)?chromaKey(im):im;})),
    ...Object.entries(propFiles).map(([k,p])=>load(new URL(p,base).href).then(im=>{props[k]=im;}))
  ]).then(()=>{stats.ready=true;root.dispatchEvent(new Event('sid-assets-ready'));})
    .catch(e=>{stats.error=e.message;console.error(e);});

  const P=17; // atlas stride = 16 tile + 1 gutter
  // 后墙墙带下沿（世界像素）：墙带覆盖楼面北侧 y<MIN_Y 的区域，属纯背景。
  // 任何精灵/瓦片落在墙带内的部分一律裁掉，避免"家具、装饰被画到墙上"。
  const MIN_Y=(root.WORLD&&root.WORLD.WALL_BASE)||58;
  function blit(g,image,sx,sy,sw,sh,dx,dy,dw,dh){
    let x=Math.round(dx),y=Math.round(dy),w=Math.max(1,Math.round(dw)),h=Math.max(1,Math.round(dh));
    // dx/dy 属于调用画布的坐标空间；离屏家具与地板 chunk 都是局部坐标。
    // 世界后墙裁剪由 demo/main.js 与 online/public/game.js 的最终合成负责。
    g.imageSmoothingEnabled=false;
    g.drawImage(image,sx,sy,sw,sh,x,y,w,h);
    stats.drawImage++;return true;
  }
  function tile(g,key,col,row,x,y,w=16,h=16){
    const image=images[key];if(!image)return false;
    const gr=SHEET_GRID[key];
    const sp=gr?gr.stride:(key in CHROMA_TILE_SPACING?CHROMA_TILE_SPACING[key]:P);   // 有无 1px 缝
    const ts=gr?gr.tile:16;
    return blit(g,image,col*sp,row*sp,ts,ts,x,y,w,h);
  }
  // Draw one whole downloaded PNG at an explicit box (nearest neighbour, no smoothing).
  function prop(g,key,x,y,w,h){
    const im=props[key];if(!im)return false;
    return blit(g,im,0,0,im.width,im.height,x,y,w,h);
  }
  // Tile a prop horizontally across [x, x+w), anchored to a south baseline.
  function propRow(g,key,x,w,bottomY,scale=1){
    const im=props[key];if(!im)return false;
    const pw=im.width*scale, ph=im.height*scale;
    const n=Math.max(1,Math.round(w/pw)), total=n*pw, sx=x+(w-total)/2;
    for(let i=0;i<n;i++)prop(g,key,sx+i*pw,bottomY-ph,pw,ph);
    return true;
  }
  // ---------- 逐层地面（第二轮：七层七个世界观，全部走 procedural 铺装） ----------
  // 用户按楼层整理好了 7 套主题素材（pixel-themes-7floors）。多数包是横版/侧视图集，
  // 直接平铺会露馅，所以**地面与墙体走程序化构造**（材质、拼法、光照按主题换），
  // 真实素材用在"一眼认得出世界观"的**陈设道具**上（树、霓虹招牌、宝箱、仪器……）。
  const floorStyles = {
    1: { procedural: 'scifi',   base: '#182230', runner: '#1f6d7a', bloom: 'rgba(90,220,255,0.10)', tint: 'rgba(90,200,255,0.07)' },
    2: { procedural: 'court',   base: '#2f6a3a', runner: '#c8503c', bloom: 'rgba(255,240,180,0.09)', tint: 'rgba(255,240,190,0.05)' },
    3: { procedural: 'castle',  base: '#3f362b', runner: '#7a2f2f', bloom: 'rgba(255,205,140,0.13)', tint: 'rgba(255,200,140,0.06)' },
    4: { procedural: 'forest',  base: '#2f5230', runner: '#6b5236', bloom: 'rgba(190,255,160,0.10)', tint: 'rgba(180,255,150,0.05)' },
    5: { procedural: 'dungeon', base: '#241f2b', runner: '#4a3552', bloom: 'rgba(255,168,88,0.14)', tint: 'rgba(255,168,110,0.06)' },
    6: { procedural: 'deck',    base: '#4a3421', runner: '#2e6a7a', bloom: 'rgba(255,220,160,0.10)', tint: 'rgba(255,210,150,0.06)' },
    7: { procedural: 'neon',    base: '#12121c', runner: '#7a1f6a', bloom: 'rgba(180,90,255,0.14)', tint: 'rgba(160,80,255,0.08)' }
  };
  // ===== 七种地面构造（确定性：只依赖世界坐标，分块重建后完全一致） =====
  // 1F 科幻实验室：金属甲板 + 铆钉 + 发光走线 + 警示条
  function floorScifi(g, ox, oy, w, h) {
    g.fillStyle = '#182230'; g.fillRect(ox, oy, w, h);
    for (let y = oy - ((oy % 64) + 64) % 64; y < oy + h; y += 64) {
      for (let x = ox - ((ox % 64) + 64) % 64; x < ox + w; x += 64) {
        const k = Math.abs((x / 64) * 31 + (y / 64) * 57) % 97;
        g.fillStyle = k % 2 ? '#1c2735' : '#1a2330'; g.fillRect(x + 1, y + 1, 62, 62);
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 1, y + 1, 62, 1);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, 64, 1); g.fillRect(x, y, 1, 64);
        g.fillStyle = '#33445a';
        for (const [rx, ry] of [[6, 6], [56, 6], [6, 56], [56, 56]]) g.fillRect(x + rx, y + ry, 2, 2);
        if (k % 7 === 0) { g.fillStyle = 'rgba(90,220,255,0.35)'; g.fillRect(x + 8, y + 60, 48, 2); }
      }
    }
    // 每 256px 一条黄黑警示带
    for (let y = oy - ((oy % 256) + 256) % 256; y < oy + h; y += 256) {
      for (let x = ox - ((ox % 32) + 32) % 32; x < ox + w; x += 32) {
        g.fillStyle = ((x / 32) | 0) % 2 ? '#c9a227' : '#20242c';
        g.fillRect(x, y + 120, 32, 6);
      }
    }
  }
  // 2F 运动场：草坪条纹 + 白色场地线 + 中圈
  function floorCourt(g, ox, oy, w, h) {
    g.fillStyle = '#2f6a3a'; g.fillRect(ox, oy, w, h);
    for (let y = oy - ((oy % 32) + 32) % 32; y < oy + h; y += 32) {
      const k = Math.round(y / 32);
      if (k % 2) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(ox, y, w, 32); }
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(ox, y, w, 1);
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let y = oy - ((oy % 192) + 192) % 192; y < oy + h; y += 192) g.fillRect(ox, y, w, 2);
    for (let x = ox - ((ox % 256) + 256) % 256; x < ox + w; x += 256) g.fillRect(x, oy, 2, h);
    // 中圈/罚球弧（每 512 一格）
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
    for (let gy = oy - ((oy % 512) + 512) % 512; gy < oy + h; gy += 512) {
      for (let gx = ox - ((ox % 512) + 512) % 512; gx < ox + w; gx += 512) {
        g.beginPath(); g.arc(gx + 256, gy + 256, 70, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(gx + 256, gy + 256, 7, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
      }
    }
    g.fillStyle = 'rgba(0,40,0,0.10)'; g.fillRect(ox, oy, w, h);
  }
  // 3F 魔幻城堡：大块石砖 + 灰缝 + 苔痕
  function floorCastle(g, ox, oy, w, h) {
    g.fillStyle = '#2f281f'; g.fillRect(ox, oy, w, h);
    const bw = 64, bh = 40;
    for (let row = 0, y = oy - ((oy % bh) + bh) % bh; y < oy + h; y += bh, row++) {
      const off = (row % 2) ? bw / 2 : 0;
      for (let x = ox - ((ox % bw) + bw) % bw - off; x < ox + w; x += bw) {
        const k = Math.abs(row * 41 + Math.round(x / bw) * 67) % 83;
        g.fillStyle = ['#8a7a63', '#7d6f5a', '#94836a', '#736656', '#9c8b70'][k % 5];
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        g.fillStyle = 'rgba(255,245,220,0.10)'; g.fillRect(x + 2, y + 2, bw - 4, 2);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + 2, y + bh - 4, bw - 4, 2);
        if (k % 8 === 0) { g.fillStyle = 'rgba(92,116,74,0.30)'; g.fillRect(x + 8, y + bh - 12, 20, 5); }
        if (k % 13 === 0) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 20, y + 10, 2, 16); }
      }
    }
  }
  // 4F 森林：草地 + 泥径 + 落叶 + 小花
  function floorForest(g, ox, oy, w, h) {
    g.fillStyle = '#2f5230'; g.fillRect(ox, oy, w, h);
    for (let y = oy; y < oy + h; y += 8) for (let x = ox; x < ox + w; x += 8) {
      const k = Math.abs((x / 8) * 73 + (y / 8) * 37) % 101;
      if (k % 3 === 0) { g.fillStyle = k % 2 ? 'rgba(120,190,90,0.16)' : 'rgba(20,60,24,0.18)'; g.fillRect(x, y, 8, 8); }
    }
    // 泥径（主通道那一条）
    g.fillStyle = 'rgba(110,84,52,0.55)'; g.fillRect(ox, Math.max(oy, 168), w, Math.max(0, Math.min(232, oy + h) - Math.max(oy, 168)));
    g.fillStyle = 'rgba(140,110,70,0.35)';
    for (let x = ox; x < ox + w; x += 24) g.fillRect(x, 176 + ((x * 7) % 40), 10, 2);
    // 落叶/小花
    for (let y = oy; y < oy + h; y += 24) for (let x = ox; x < ox + w; x += 24) {
      const k = Math.abs((x / 24) * 91 + (y / 24) * 53) % 61;
      if (k % 7 === 0) { g.fillStyle = ['#c9a227', '#b8642c', '#4a8a3a'][k % 3]; g.fillRect(x + (k % 11), y + (k % 9), 3, 2); }
      if (k % 17 === 0) { g.fillStyle = ['#e06a8a', '#e0d060', '#b07ae0'][k % 3]; g.fillRect(x + (k % 13), y + (k % 7), 2, 2); }
    }
  }
  // 6F 海洋海盗：船甲板木板 + 麻絮缝 + 水光
  function floorDeck(g, ox, oy, w, h) {
    g.fillStyle = '#3a2a1a'; g.fillRect(ox, oy, w, h);
    for (let row = 0, y = oy - ((oy % 24) + 24) % 24; y < oy + h; y += 24, row++) {
      const off = (row % 2) ? 48 : 0;
      for (let x = ox - ((ox % 96) + 96) % 96 - off; x < ox + w; x += 96) {
        const k = Math.abs(row * 29 + Math.round(x / 96) * 43) % 71;
        g.fillStyle = ['#8a5f38', '#7d5632', '#96693e', '#6f4d2c'][k % 4];
        g.fillRect(x + 1, y + 1, 94, 22);
        g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(x + 1, y + 1, 94, 1);
        g.fillStyle = 'rgba(0,0,0,0.40)'; g.fillRect(x, y + 23, 96, 1); g.fillRect(x, y + 1, 1, 22);
        g.fillStyle = '#4a3a24';
        g.fillRect(x + 6, y + 4, 2, 2); g.fillRect(x + 88, y + 4, 2, 2);
        if (k % 9 === 0) { g.fillStyle = 'rgba(90,160,190,0.18)'; g.fillRect(x + 20, y + 8, 40, 8); }
      }
    }
    g.fillStyle = 'rgba(255,200,140,0.05)'; g.fillRect(ox, oy, w, h);
  }
  // 7F 赛博朋克：湿沥青 + 霓虹反光 + 井盖
  function floorNeon(g, ox, oy, w, h) {
    g.fillStyle = '#12121c'; g.fillRect(ox, oy, w, h);
    for (let y = oy; y < oy + h; y += 16) for (let x = ox; x < ox + w; x += 16) {
      const k = Math.abs((x / 16) * 83 + (y / 16) * 47) % 97;
      if (k % 4 === 0) { g.fillStyle = 'rgba(255,255,255,0.028)'; g.fillRect(x, y, 16, 16); }
      if (k % 23 === 0) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, y + 3, 8, 1); }
    }
    // 霓虹带 + 地面反光
    const bands = [[0, 'rgba(90,220,255,0.45)', 'rgba(90,220,255,0.12)'], [1, 'rgba(226,80,200,0.45)', 'rgba(226,80,200,0.12)']];
    for (let y = oy - ((oy % 192) + 192) % 192; y < oy + h; y += 192) {
      const b = bands[Math.abs(Math.round(y / 192)) % 2];
      g.fillStyle = b[1]; g.fillRect(ox, y + 64, w, 3);
      g.fillStyle = b[2]; g.fillRect(ox, y + 67, w, 18);
      g.fillStyle = b[2]; g.fillRect(ox, y + 49, w, 3);
    }
    // 积水反光（斜向条）
    for (let gy = oy - ((oy % 160) + 160) % 160; gy < oy + h; gy += 160) {
      for (let gx = ox - ((ox % 220) + 220) % 220; gx < ox + w; gx += 220) {
        const k = Math.abs((gx / 220) * 31 + (gy / 160) * 17) % 5;
        g.fillStyle = k % 2 ? 'rgba(90,220,255,0.07)' : 'rgba(226,80,200,0.07)';
        g.fillRect(gx + 20, gy + 30, 90, 40);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(gx + 30, gy + 36, 60, 2);
      }
    }
    // 井盖
    g.fillStyle = '#2a2a38';
    for (let gy = oy - ((oy % 320) + 320) % 320; gy < oy + h; gy += 320) {
      for (let gx = ox - ((ox % 320) + 320) % 320; gx < ox + w; gx += 320) {
        g.beginPath(); g.arc(gx + 120, gy + 200, 14, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#3d3d52'; g.lineWidth = 1; g.stroke();
      }
    }
  }
  const PROC_FLOOR = { scifi: floorScifi, court: floorCourt, castle: floorCastle, forest: floorForest, deck: floorDeck, neon: floorNeon };
  // 地板主题纹样（确定性：只依赖世界坐标，所以分块被 LRU 淘汰后重建结果完全一致）
  function floorAccent(g, kind, ox, oy, w, h) {
    const x0 = ox, y0 = oy, x1 = ox + w, y1 = oy + h;
    switch (kind) {
      case 'terrazzo': {
        // 水磨石：稀疏碎石颗粒 + 大块拼缝
        g.fillStyle = 'rgba(90,74,58,0.20)';
        for (let y = y0 - y0 % 48; y < y1; y += 48) g.fillRect(x0, y, w, 1);
        for (let x = x0 - x0 % 48; x < x1; x += 48) g.fillRect(x, y0, 1, h);
        for (let y = y0; y < y1; y += 16) for (let x = x0; x < x1; x += 16) {
          const k = Math.abs((Math.floor(x / 16) * 73 + Math.floor(y / 16) * 131) % 97);
          if (k % 5 === 0) { g.fillStyle = 'rgba(120,100,78,0.35)'; g.fillRect(x + (k % 9), y + (k % 7), 2, 2); }
          if (k % 11 === 0) { g.fillStyle = 'rgba(255,244,220,0.35)'; g.fillRect(x + (k % 11), y + (k % 5), 1, 1); }
        }
        break;
      }
      case 'carpet': {
        // 方块地毯：32px 交错深浅 + 纤维噪点
        for (let y = y0 - y0 % 32; y < y1; y += 32) for (let x = x0 - x0 % 32; x < x1; x += 32) {
          const k = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
          g.fillStyle = k ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.075)';
          g.fillRect(x, y, 32, 32);
        }
        g.fillStyle = 'rgba(0,0,0,0.10)';
        for (let y = y0 - y0 % 32; y < y1; y += 32) g.fillRect(x0, y, w, 1);
        for (let x = x0 - x0 % 32; x < x1; x += 32) g.fillRect(x, y0, 1, h);
        break;
      }
      case 'circuit': {
        // 走线槽：正交线 + 焊点 + 数据流高光
        for (let y = y0 - y0 % 96; y < y1; y += 96) {
          g.fillStyle = 'rgba(90,200,255,0.13)'; g.fillRect(x0, y + 24, w, 1);
          g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x0, y + 25, w, 1);
        }
        for (let x = x0 - x0 % 96; x < x1; x += 96) {
          g.fillStyle = 'rgba(90,200,255,0.10)'; g.fillRect(x + 24, y0, 1, h);
          g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x + 25, y0, 1, h);
        }
        g.fillStyle = 'rgba(140,230,255,0.22)';
        for (let y = y0 - y0 % 96; y < y1; y += 96) for (let x = x0 - x0 % 96; x < x1; x += 96) {
          g.fillRect(x + 21, y + 21, 7, 7);
          g.fillStyle = 'rgba(10,20,30,0.55)'; g.fillRect(x + 23, y + 23, 3, 3);
          g.fillStyle = 'rgba(140,230,255,0.22)';
        }
        break;
      }
      case 'plank': {
        // 木地板：错缝长板 + 木纹 + 结疤
        for (let y = y0 - y0 % 12; y < y1; y += 12) {
          g.fillStyle = 'rgba(60,38,22,0.33)'; g.fillRect(x0, y, w, 1);
          const stag = (Math.floor(y / 12) % 2) ? 48 : 0;
          for (let x = x0 - x0 % 96 + stag; x < x1; x += 96) {
            g.fillStyle = 'rgba(60,38,22,0.22)'; g.fillRect(x, y, 1, 12);
            const k = Math.abs((Math.floor(x / 96) * 91 + Math.floor(y / 12) * 37) % 89);
            if (k % 7 === 0) { g.fillStyle = 'rgba(70,45,26,0.30)'; g.fillRect(x + 18 + k % 30, y + 4, 10, 1); }
            if (k % 13 === 0) { g.fillStyle = 'rgba(48,30,16,0.45)'; g.fillRect(x + 40 + k % 20, y + 6, 3, 2); }
          }
        }
        break;
      }
      case 'night': {
        // 夜间值班层：地砖缝更冷，每隔一段有一盏地灯
        for (let y = y0 - y0 % 64; y < y1; y += 64) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0, y, w, 1); }
        for (let x = x0 - x0 % 64; x < x1; x += 64) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y0, 1, h); }
        for (let x = x0 - x0 % 180; x < x1; x += 180) {
          g.fillStyle = 'rgba(120,170,255,0.10)'; g.fillRect(x + 8, y0, 58, h);
        }
        break;
      }
      case 'marble': {
        // 石材：斜向脉络 + 抛光反光
        g.strokeStyle = 'rgba(255,220,190,0.13)'; g.lineWidth = 1;
        for (let i = -4; i < 8; i++) {
          const bx = x0 + i * 72;
          g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx + (y1 - y0) * 0.55, y1); g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.045)';
        for (let y = y0 - y0 % 64; y < y1; y += 64) g.fillRect(x0, y, w, 2);
        break;
      }
      case 'court': {
        // 球场：白线 + 中圈 + 侧线
        g.fillStyle = 'rgba(255,255,255,0.30)';
        for (let y = y0 - y0 % 96; y < y1; y += 96) g.fillRect(x0, y + 12, w, 2);
        g.fillStyle = 'rgba(217,81,78,0.13)';
        for (let x = x0 - x0 % 192; x < x1; x += 192) g.fillRect(x + 30, y0, 3, h);
        g.fillStyle = 'rgba(255,255,255,0.16)';
        for (let x = x0 - x0 % 192; x < x1; x += 192) for (let y = y0 - y0 % 192; y < y1; y += 192) {
          g.beginPath(); g.arc(x + 96, y + 96, 34, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,0.16)'; g.stroke();
        }
        break;
      }
    }
  }
  // 走廊地毯：每层不同颜色，让"走到哪里"一眼可辨（只铺在主通道的 y 带内）
  const RUNNER_Y0 = 168, RUNNER_Y1 = 232;
  function runner(g, st, ox, oy, w, h) {
    if (!st.runner) return;
    const y0 = Math.max(RUNNER_Y0, oy), y1 = Math.min(RUNNER_Y1, oy + h);
    if (y1 <= y0) return;
    const ly = y0 - oy, lh = y1 - y0;
    g.globalAlpha = 0.5; g.fillStyle = st.runner;
    g.fillRect(ox, ly, w, lh);
    g.globalAlpha = 0.85; g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(ox, ly + 2, w, 1); g.fillRect(ox, ly + lh - 3, w, 1);
    g.globalAlpha = 1;
  }
  // 地牢层地面：**不规则碎石板**（程序化，确定性）。
  // 关键教训：整层用"整齐错缝的方砖"会读成一面铺倒的砖墙；改成大小不一、缝隙不齐的碎石板，
  // 再压一层暖色火光，才会被认成"地面"。
  function drawFlagstones(g, ox, oy, w, h) {
    // 深色缝隙 + 浅色石板（对比方向必须"石头亮、缝暗"，反过来会读成一格格空洞）
    g.fillStyle = '#17120f'; g.fillRect(ox, oy, w, h);
    const cell = 46;
    const stone = ['#8a7660', '#94806a', '#7d6a55', '#9c8870', '#86725c', '#6f5d4a'];
    for (let gy = oy - ((oy % cell) + cell) % cell; gy < oy + h; gy += cell) {
      for (let gx = ox - ((ox % cell) + cell) % cell; gx < ox + w; gx += cell) {
        const k = Math.abs(Math.round(gx / cell) * 97 + Math.round(gy / cell) * 61) % 251;
        const cw = 34 + (k % 8), ch = 30 + ((k >> 3) % 8);
        const px = gx + 2 + (k % 5), py = gy + 2 + ((k >> 4) % 5);
        g.fillStyle = stone[k % stone.length];
        g.fillRect(px, py, cw, ch);
        // 受光面 / 背光面 / 缝隙投影
        g.fillStyle = 'rgba(255,240,214,0.16)'; g.fillRect(px, py, cw, 2);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px, py + ch - 2, cw, 2);
        g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(px + cw, py, 2, ch);
        if (k % 13 === 0) { g.fillStyle = 'rgba(90,116,74,0.30)'; g.fillRect(px + 5, py + ch - 7, 12, 4); }
        if (k % 19 === 0) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + 8, py + 6, 10, 1); }
      }
    }
    // 火光色温 + 地下压暗（比例小，避免把石头压回"暗块"）
    g.fillStyle = 'rgba(255,170,100,0.06)'; g.fillRect(ox, oy, w, h);
    g.fillStyle = 'rgba(10,7,12,0.10)'; g.fillRect(ox, oy, w, h);
  }
  function dungeonFloor(g, st, ox, oy, w, h) {
    drawFlagstones(g, ox, oy, w, h);
    // 贴图：血渍 / 水渍 / 地灯光斑（每 320px 一块，确定性）
    if (stats.ready) {
      const stains = ['dgnStain1', 'dgnStain2', 'dgnStain3'];
      for (let gy = oy - oy % 320; gy < oy + h; gy += 320) for (let gx = ox - ox % 320; gx < ox + w; gx += 320) {
        const k = Math.abs((Math.round(gx / 320) * 41 + Math.round(gy / 320) * 67)) % 13;
        if (k % 3 === 0) prop(g, stains[k % stains.length], gx + 40 + (k * 37) % 200, gy + 60 + (k * 53) % 180, 32, 32);
        if (k === 5) {
          const cx = gx + 164, cy = gy + 144;
          const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 110);
          gr.addColorStop(0, 'rgba(255,196,120,0.20)'); gr.addColorStop(1, 'rgba(255,196,120,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 110, 0, Math.PI * 2); g.fill();
          prop(g, 'dgnLight', cx - 24, cy - 24, 48, 48);
        }
      }
    }
  }
  function floor(g, id, ox, oy, w, h) {
    if (!stats.ready) return false;
    const st = floorStyles[id] || floorStyles[1], stride = st.cell || 16;
    // 统一在**世界坐标**下绘制（translate 掉分块原点）：
    // 旧实现在 tint/accent 里直接用了 originX/originY，导致除 (0,0) 分块外环境色与纹样都被画到画布外。
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
      // 图集块只作"材质底纹"：压一层本层基色，避免 16px 图块在整层上重复成壁纸。
      if (st.base) { g.globalAlpha = 0.66; g.fillStyle = st.base; g.fillRect(ox, oy, w, h); g.globalAlpha = 1; }
    }
    if (st.tint) { g.fillStyle = st.tint; g.fillRect(ox, oy, w, h); }
    runner(g, st, ox, oy, w, h);
    if (st.accent) floorAccent(g, st.accent, ox, oy, w, h);
    // 环境光：每层一个色温的柔光斑（确定性位置），避免"整层一片死平"。
    // 用径向渐变而不是实心椭圆：实心椭圆在放大后的宽视野里会读成"地上一个个大圆圈"。
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
  // South baseline of a furniture item = bottom of its collision footprint when known.
  const baseY=f=>{const b=f.blocks&&f.blocks[0];return b?b.y+b.h:f.y+f.h;};
  // Kenney 木质桌面：{4,0}{5,0} 圆角长桌（1F 食堂），{0,0}{1,0}{2,0} 直角长桌（其余楼层）。
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
  // 结构：THEME_FURN[floorId][WORLD家具type] = spec
  //   spec = {sheet, col, row, cw, ch}  从图集取 cw×ch 个 16px 格（逐格去 1px 缝后拼装），底对齐脚线
  //   spec = {prop:'desk'}              取已加载的单图精灵
  // 未配置的 type 自动回落到下面的默认 Antea 办公家具。图集 key 见 THEME_SHEETS。
  const THEME_FURN={};        // 主题家具表：floorId -> { type: spec }
  function themeSpec(id,type,item){
    // 第二轮：七层是七个世界观，房间也跟着所在楼层走（不再只对某一层例外）。
    const row=THEME_FURN[id];
    return row&&row[type]||null;
  }
  // 逐格拼装一个 cw×ch 的图集区块（自动去掉 1px 缝），并沿宽度重复以铺满家具足迹
  function atlasRow(g,sheet,col,row,cw,ch,x,w,bottomY){
    const im=images[sheet];if(!im)return false;
    const cell=cellOf(sheet).tile, bw=cw*cell, bh=ch*cell;
    const n=Math.max(1,Math.round(w/bw)), total=n*bw, sx=x+(w-total)/2, sy=bottomY-bh;
    for(let k=0;k<n;k++)for(let r=0;r<ch;r++)for(let c=0;c<cw;c++)
      tile(g,sheet,col+c,row+r,sx+k*bw+c*cell,sy+r*cell,cell,cell);
    return true;
  }
  // 在给定足迹内画一个 spec：点状物件（prop/single/native）居中画一个，不铺满整条足迹。
  function drawSpecAt(g,spec,x,w,bottomY){
    if(spec.img){
      const iw=spec.iw||32,ih=spec.ih||32;
      return prop(g,spec.img,x+w/2-iw/2,bottomY-ih,iw,ih);
    }
    if(spec.prop){
      const im=props[spec.prop];if(!im)return false;
      if(spec.repeat)return propRow(g,spec.prop,x,w,bottomY,spec.scale||1);
      const s=spec.native?1:Math.max(1,Math.min(spec.scale||2,Math.floor(w/Math.max(1,im.width))));
      const pw=im.width*s, ph=im.height*s;
      return prop(g,spec.prop,x+w/2-pw/2,bottomY-ph,pw,ph);
    }
    const cell=cellOf(spec.sheet).tile, cw=spec.cw||1, ch=spec.ch||1, bw=cw*cell, bh=ch*cell;
    if(spec.single){
      // 单件家具：居中一张，允许整数倍放大但不超过 scale（默认 2 倍），避免拉糊
      const s=Math.max(1,Math.min(spec.scale||2,Math.max(1,Math.floor(w/bw))));
      const pw=bw*s, ph=bh*s, sx=x+w/2-pw/2, sy=bottomY-ph;
      for(let r=0;r<ch;r++)for(let c=0;c<cw;c++)tile(g,spec.sheet,spec.col+c,spec.row+r,sx+c*cell*s,sy+r*cell*s,cell*s,cell*s);
      return true;
    }
    return atlasRow(g,spec.sheet,spec.col,spec.row,cw,ch,x,w,bottomY);
  }
  // 逐 blocks 绘制：工位岛一行一块，逐块画，保证「画什么、撞什么」一致（此前只取 blocks[0] 会漏掉第二排）
  function drawSpec(g,spec,f){
    const blocks=(f.blocks&&f.blocks.length)?f.blocks:[{x:f.x,y:f.y,w:f.w,h:f.h}];
    let any=false;
    for(const b of blocks)any=drawSpecAt(g,spec,b.x,b.w,b.y+b.h)||any;
    return any;
  }
  // ===== 需求②修正：主题家具不再"把办公桌换成中世纪木桌" =====
  // 旧实现给 F2/F3/F4/F5 把 desk/table/seat 全部替换成 Kenney indoors 的木桌木椅，
  // 结果七层看起来都是"同一间办公室铺了不同地毯"——这正是用户说的"强行按地毯换风格"。
  // 现在：办公家具统一使用 Antea 现代办公套件（真实素材、风格一致），
  // 每层的差异由**地面材质 + 墙面构造 + 陈设小物 + 环境光**承担（见 floorStyles / THEMES）。
  // 仅保留少量"确实表达主题"的替换项（档案层的木文件柜、甜点层的棒棒糖、运动层的场地）。
  // ===== 第二轮：七层七世界观 —— 逐层主题陈设 =====
  // 原则：**不把整层家具都换掉**（那会变成"同一栋楼换皮"），只替换"一眼认得出世界观"的那几类，
  // 其余保持现代办公家具，形成"办公室被搬进了这个世界"的观感。
  THEME_FURN[1] = {   // 科幻实验室
    cabinet:   {prop:'controlBox', scale:2},
    vending:   {prop:'cyberLight', scale:2},
    plant:     {prop:'antenna', scale:2}
  };
  THEME_FURN[4] = {   // 森林：树/灌木/树桩/石头
    plant:     {prop:'forestTree1', scale:1},
    sofa:      {prop:'forestBrush1', scale:1},
    cabinet:   {prop:'forestStump', scale:1},
    crate:     {prop:'forestRock1', scale:2},
    boxstack:  {prop:'forestRock1', scale:2},
    bench:     {prop:'forestRock2', scale:2}
  };
  THEME_FURN[3] = {   // 魔幻城堡：宝箱/木箱/石柱
    cabinet:   {prop:'dgnChest', scale:2},
    crate:     {prop:'dgnBoxes', scale:2},
    plant:     {prop:'dgnColumn', scale:2},
    locker:    {prop:'dgnChestOpen', scale:2}
  };
  THEME_FURN[5] = {   // 地牢
    cabinet:   {prop:'dgnChest', scale:2},
    crate:     {prop:'dgnBoxes', scale:2},
    boxstack:  {prop:'dgnBoxes', scale:2},
    plant:     {prop:'dgnSkull', scale:2},
    locker:    {prop:'dgnChestOpen', scale:2},
    vending:   {prop:'dgnColumn', scale:2}
  };
  THEME_FURN[6] = {   // 海盗船：宝箱/木箱/桅杆
    cabinet:   {prop:'dgnChest', scale:2},
    crate:     {prop:'dgnBoxes', scale:2},
    plant:     {prop:'dgnColumn', scale:2}
  };
  THEME_FURN[7] = {   // 赛博霓虹：天线/霓虹招牌/广告屏
    plant:     {prop:'antenna', scale:1},
    vending:   {prop:'bannerSmall', scale:2},
    tv:        {prop:'monitorFace', scale:3},
    whiteboard:{prop:'bannerBig', scale:1}
  };
  THEME_FURN[5] = {
    plant:     {sheet:'indoors',col:16,row:0,cw:1,ch:1,native:true}   // 盆栽（按 16px 原生绘制，勿放大）
  };
  // 注：旧的 F6 棒棒糖（candyPop）替换已取消 —— 6F 现在的主题是"财务·保险库"，
  // 巨型棒棒糖与金库石墙互相打架。糖果素材仍留在 vendor 里，不再随运行时加载。
  // ===== F7 活力运动：场地用真实球场材质（Kenney Sports Pack, CC0，64px 平块）=====
  THEME_FURN[7]={
    stage:     {sheet:'sports',col:0,row:0,cw:1,ch:1},
    mat:       {sheet:'sports',col:0,row:0,cw:1,ch:1}
  };
  function furniture(g,f){
    if(f.architecturalPlaceholder)return true;
    if(!stats.ready)return false;
    const id=f.floorId||1, by=baseY(f), w=f.w, h=f.h;
    // 主题家具优先：该层配了对应 type 就用主题精灵，否则落回默认办公家具。
    const spec=themeSpec(id,f.type,f);
    if(spec){
      g.save();
      const ok=drawSpec(g,spec,f);
      g.restore();
      if(ok){stats.furniture++;stats.themed=(stats.themed||0)+1;return true;}
    }
    g.save();g.imageSmoothingEnabled=false;
    let drawn=false;
    if(f.type==='desk'){
      // 4F 地牢层：工位改成木长桌（Kenney indoors 木桌模块），避免"石廊里摆着带显示器的现代工位"。
      if(id===4){
        const bl=(f.blocks&&f.blocks.length)?f.blocks:[{x:f.x,y:f.y,w:f.w,h:f.h}];
        for(const b of bl)drawn=woodRow(g,b.x,b.w,b.y+b.h,18,!0)||drawn;
      }else{
        const island=root.WORLD.deskIsland(f);
        if(island){
          for(let r=0;r<island.rows;r++){
            const uy=island.uy+r*(island.plan+island.gap);
            drawn=propRow(g,r%2?'desk2':'desk',island.ox,island.bw,uy+island.plan,1)||drawn;
          }
        }else{
          const bl=(f.blocks&&f.blocks.length)?f.blocks:[{x:f.x,y:f.y,w:f.w,h:f.h}];
          for(const b of bl)drawn=propRow(g,'desk',b.x,b.w,b.y+b.h,1)||drawn;
        }
      }
    }else if(f.type==='reception'||f.type==='counter'){
      drawn=woodRow(g,f.x,w,by,20,!0);                                  // 直角长台面（Kenney 16px）
    }else if(f.type==='table'){
      drawn=woodRow(g,f.x,w,by,16,id!==1);                              // 1F 圆角餐桌，其余直角长桌
    }else if(f.type==='cabinet'){
      const key=id===4?'cabinetWide':id===6?'cabinetBig':'cabinetTall';
      drawn=propRow(g,key,f.x,w,by,1);
    }else if(f.type==='plant'){
      drawn=propRow(g,w>40?'plantBig':'plantSmall',f.x,w,by,1);
    }else if(f.type==='sofa'){
      drawn=propRow(g,w<48?'sofaSmall':'sofa',f.x,w,by,1);
    }else if(f.type==='seat'){
      // 按足迹做整数倍放大（最多 2×），让椅子在地板上"有体积"，同时保持硬边像素。
      const im=props.chair, cw=im?im.width:16, ch=im?im.height:16;
      const s=Math.max(1,Math.min(2,Math.floor(Math.min(w,h)/Math.max(1,cw))));
      drawn=prop(g,'chair',f.x+w/2-cw*s/2,by-ch*s,cw*s,ch*s);
    }else if(f.type==='stage'||f.type==='mat'){
      for(let yy=0;yy<h;yy+=16)for(let xx=0;xx<w;xx+=16)
        tile(g,'indoors',24,f.type==='stage'?0:4,f.x+xx,f.y+yy,Math.min(16,w-xx),Math.min(16,h-yy));
      drawn=true;
    }
    // ===== 阶段4（需求③）：逐层陈设新增的家具类型 =====
    // 全部复用已加载的真实素材（Antea 单图 / Kenney 图集），没有素材的用程序化像素补，
    // 保证"新增的每一件东西"都能画出来，而不是静默回落到一个棕色方盒。
    else if(f.type==='chair'){
      const im=props.chair, cw=im?im.width:16, ch=im?im.height:16;
      const s=Math.max(1,Math.min(2,Math.floor(Math.min(w,h)/Math.max(1,cw))));
      drawn=prop(g,'chair',f.x+w/2-cw*s/2,by-ch*s,cw*s,ch*s);
    }else if(f.type==='shelf'){
      // 档案/资料架：Antea 书架两张，深色书架用在档案主题层
      const key=/档案|资料架/.test(f.label||'')&&id===4?'shelfTall':'shelf';
      drawn=propRow(g,key,f.x,w,by,1);
      // 架上的彩色书脊：让"书架"在一屏里能被一眼认出来
      if(drawn){
        let seed=(f.x*7+f.y*13)|0;
        for(let i=0;i<Math.max(2,Math.floor(w/12));i++){
          seed=(seed*1103515245+12345)&0x7fffffff;
          const bx=f.x+6+i*12+(seed%3);
          const bh=8+(seed>>6)%9;
          g.fillStyle=['#c4553f','#3f7bc4','#4a9a5e','#c9a227','#8a6ad0'][seed%5];
          g.fillRect(Math.round(bx),Math.round(by-14-bh),4,bh);
        }
      }
    }else if(f.type==='whiteboard'||f.type==='tv'){
      drawn=propRow(g,'board',f.x,w,by,1);
      if(drawn&&f.type==='tv'){
        g.fillStyle='#0b1420';g.fillRect(Math.round(f.x+4),Math.round(by-24),Math.round(w-8),16);
        g.fillStyle='#3f7bd6';g.fillRect(Math.round(f.x+6),Math.round(by-22),Math.round(w-12),2);
        g.fillStyle='#54c9d6';g.fillRect(Math.round(f.x+8),Math.round(by-17),Math.round((w-16)*0.55),1);
      }
    }else if(f.type==='server'){
      const n=Math.max(1,Math.round(w/40));
      for(let i=0;i<n;i++){
        const bx=f.x+i*w/n, bw=w/n-2;
        g.fillStyle='#232b36';g.fillRect(Math.round(bx),Math.round(by-58),Math.round(bw),58);
        g.fillStyle='#39424f';g.fillRect(Math.round(bx+2),Math.round(by-56),Math.round(bw-4),2);
        for(let r=0;r<6;r++){
          const ry=by-50+r*8;
          g.fillStyle='#1a2029';g.fillRect(Math.round(bx+3),Math.round(ry),Math.round(bw-6),6);
          const on=(i+r)%3!==0;
          g.fillStyle=on?'#6ee7a8':'#2b4a3a';
          g.fillRect(Math.round(bx+5),Math.round(ry+2),2,2);
          g.fillStyle=(i+r)%5===0?'#ffd76a':'#2b3442';
          g.fillRect(Math.round(bx+9),Math.round(ry+2),2,2);
        }
      }
      drawn=true;
    }else if(f.type==='safe'){
      drawn=propRow(g,'cabinetWide',f.x,w,by,1);
      if(drawn){
        const cx=f.x+w/2, cy=by-26;
        g.fillStyle='#c9a227';g.fillRect(Math.round(cx-9),Math.round(cy-9),18,18);
        g.fillStyle='#7a6318';g.fillRect(Math.round(cx-7),Math.round(cy-7),14,14);
        g.fillStyle='#f6e08a';g.fillRect(Math.round(cx-1),Math.round(cy-5),2,5);
        g.fillRect(Math.round(cx+1),Math.round(cy-2),4,2);
      }
    }else if(f.type==='locker'){
      const n=Math.max(2,Math.round(w/26));
      for(let i=0;i<n;i++){
        const bx=f.x+i*w/n, bw=w/n;
        g.fillStyle='#6b7480';g.fillRect(Math.round(bx),Math.round(by-52),Math.round(bw-1),52);
        g.fillStyle='#8d99a8';g.fillRect(Math.round(bx+1),Math.round(by-51),Math.round(bw-3),2);
        g.fillStyle='#3a444f';g.fillRect(Math.round(bx+1),Math.round(by-26),Math.round(bw-3),1);
        g.fillStyle='#cfd6de';g.fillRect(Math.round(bx+bw/2-1),Math.round(by-30),2,4);
        g.fillStyle='#2b3442';g.fillRect(Math.round(bx+3),Math.round(by-46),3,1);
      }
      drawn=true;
    }else if(f.type==='bench'){
      drawn=propRow(g,'sofaSmall',f.x,w,by,1);
    }else if(f.type==='cooler'){
      drawn=prop(g,'water',f.x+w/2-10,by-34,20,34);
    }else if(f.type==='vending'){
      drawn=prop(g,'vending',f.x+w/2-22,by-52,44,52);
      if(drawn){g.fillStyle='#7fe3ff33';g.fillRect(Math.round(f.x+w/2-18),Math.round(by-48),36,26);}
    }else if(f.type==='printer'){
      drawn=propRow(g,'printer',f.x,w,by,1);
    }else if(f.type==='crate'||f.type==='boxstack'){
      // 纸箱：程序化，两个错位叠放
      const boxes=f.type==='boxstack'?2:1;
      for(let i=0;i<boxes;i++){
        const bw=Math.min(w-6,42), bh=30;
        const bx=f.x+(w-bw)/2+(i?6:-4), bby=by-i*22;
        g.fillStyle='#8f6b45';g.fillRect(Math.round(bx),Math.round(bby-bh),Math.round(bw),bh);
        g.fillStyle='#a9835a';g.fillRect(Math.round(bx),Math.round(bby-bh),Math.round(bw),4);
        g.fillStyle='#6f5133';g.fillRect(Math.round(bx+bw/2-1),Math.round(bby-bh+4),2,bh-4);
        g.fillStyle='#d9c9a8';g.fillRect(Math.round(bx+4),Math.round(bby-bh+8),12,7);
      }
      drawn=true;
    }else if(f.type==='arcade'){
      // 楼层游戏机：深色机柜 + 发光屏 + 两个按钮 + 顶部灯带，一屏内能一眼认出。
      const x=f.x+w/2, ww=Math.min(w,44), hh=Math.min(h,64);
      g.fillStyle='#1a1420'; g.fillRect(Math.round(x-ww/2), Math.round(by-hh), Math.round(ww), Math.round(hh));
      g.fillStyle='#241d2e'; g.fillRect(Math.round(x-ww/2+3), Math.round(by-hh+3), Math.round(ww-6), Math.round(hh*0.45));
      const t=Math.floor(performance.now()/420)%3;
      g.fillStyle=['#5ad8ff','#e250c8','#6ee7a8'][t];
      g.fillRect(Math.round(x-ww/2+6), Math.round(by-hh+7), Math.round(ww-12), 2);
      g.fillStyle='#0d0d16'; g.fillRect(Math.round(x-ww/2+6), Math.round(by-hh+12), Math.round(ww-12), Math.round(hh*0.28));
      g.fillStyle=['#7fe3ff','#ffd76a','#ff7b6b'][t]; g.fillRect(Math.round(x-ww/2+9), Math.round(by-hh+15), Math.round(ww*0.4), 1);
      g.fillStyle='#c8503c'; g.beginPath(); g.arc(x-6, by-12, 3, 0, Math.PI*2); g.fill();
      g.fillStyle='#5aa9f2'; g.beginPath(); g.arc(x+6, by-12, 3, 0, Math.PI*2); g.fill();
      g.fillStyle='rgba(90,216,255,0.10)'; g.fillRect(Math.round(x-ww/2), Math.round(by-hh), Math.round(ww), Math.round(hh));
      drawn=true;    }else if(f.type==='lamp'){
      g.fillStyle='#2b3442';g.fillRect(Math.round(f.x+w/2-2),Math.round(by-30),4,30);
      g.fillStyle='#3a444f';g.fillRect(Math.round(f.x+w/2-8),Math.round(by-3),16,3);
      g.fillStyle='#f2c14e';g.fillRect(Math.round(f.x+w/2-8),Math.round(by-40),16,11);
      g.fillStyle='#ffe08a';g.fillRect(Math.round(f.x+w/2-6),Math.round(by-38),12,4);
      drawn=true;
    }
    g.restore();
    if(!drawn)return false;           // e.g. the CC0/CC-BY packs carry no treadmill or dumbbell sprite.
    stats.furniture++;return true;
  }
  const animations=new Map();
  // ============ 逐层"世界风格"主题（需求②） ============
  // 每层不是"同一面墙换配色"，而是**七套不同的墙面构造**：
  //   1F 落地玻璃幕墙（城市天际线 + 黄铜竖梃）
  //   2F 办公隔断（织物面板 + 便签 + 上部玻璃气窗）
  //   3F 机房钢墙（冷色钢板 + 发光走线 + 蓝图海报）
  //   4F 木质档案墙（木饰面 + 证书框 + 滑轨 + 纸箱）
  //   5F 夜间值班墙（深蓝面板 + 监控墙 + 应急指示灯）
  //   6F 金库石墙（石砌错缝 + 黄铜 + 保险箱门阵列）
  //   7F 镜面墙（镜面反光 + 天窗带 + 运动旗帜）
  // 配色只决定同一构造里的材质色，构造本身不同，所以七层一眼能区分。
  const THEMES = {
    1: { name: '科幻实验室', style: 'scifi', module: 'scifi',
      wall: { base: '#243447', trim: '#4a80b0', line: '#16202c', skirt: '#101822', foot: '#080d14', seam: '#1d2a3a', frame: '#6fa8d8',
        glass: ['#dff4ff', '#9fd2ff', '#f4fcff'], sky: '#2b4a6a', board: { frame: '#6fa8d8', face: '#07121e', inner: '#0d2033', text: '#7fe3ff' } } },
    2: { name: '运动场', style: 'stadium', module: 'stadium',
      wall: { base: '#3a5a78', trim: '#e8eef2', line: '#20303f', skirt: '#25313d', foot: '#161d26', seam: '#33465a', frame: '#d8e2ea',
        glass: ['#eef8ff', '#bfe0f5', '#ffffff'], sky: '#87b6d8', board: { frame: '#d8e2ea', face: '#0d1a24', inner: '#152b3a', text: '#ffe08a' } } },
    3: { name: '魔幻城堡', style: 'castle', module: 'castle',
      wall: { base: '#8a7a63', trim: '#c9b48a', line: '#5a4f40', skirt: '#4a4033', foot: '#2f281f', seam: '#7a6b55', frame: '#a8926a',
        glass: ['#fff2cf', '#f0d9a8', '#fffdf4'], sky: '#c9a86a', board: { frame: '#c9b48a', face: '#1e150c', inner: '#33241a', text: '#ffd76a' } } },
    4: { name: '森林', style: 'canopy', module: 'canopy',
      wall: { base: '#2f5230', trim: '#7ab05a', line: '#1d3a20', skirt: '#26421f', foot: '#162a16', seam: '#3a6238', frame: '#6b8a4a',
        glass: ['#eafbe0', '#bde8a8', '#f8fff0'], sky: '#9ad07a', board: { frame: '#6b8a4a', face: '#0d1a0c', inner: '#162a16', text: '#d9ff9a' } } },
    5: { name: '档案库·地牢石廊', style: 'dungeon', module: 'dungeon',
      wall: { base: '#4a4458', trim: '#8a7a5a', line: '#2a2431', skirt: '#1d1824', foot: '#100d15', seam: '#3a3446', frame: '#8a7a5a',
        glass: ['#ffe2a8', '#d8a860', '#fff6dd'], sky: '#6a4a2a', board: { frame: '#8a7a5a', face: '#17131d', inner: '#241d2e', text: '#ffcf7a' } } },
    6: { name: '海盗船', style: 'ship', module: 'ship',
      wall: { base: '#7a5a3a', trim: '#c9b48a', line: '#3a2a1a', skirt: '#4a3421', foot: '#2a1c10', seam: '#6a4c30', frame: '#a8895a',
        glass: ['#cfeef0', '#8fc8cc', '#f2ffff'], sky: '#3f8a96', board: { frame: '#a8895a', face: '#160f08', inner: '#241a10', text: '#ffd76a' } } },
    7: { name: '赛博霓虹', style: 'neon', module: 'neon',
      wall: { base: '#1a1a26', trim: '#e250c8', line: '#0b0b12', skirt: '#12121c', foot: '#08080c', seam: '#242436', frame: '#5ad8ff',
        glass: ['#5ad8ff', '#e250c8', '#9d7bff'], sky: '#2a1a3a', board: { frame: '#5ad8ff', face: '#05050a', inner: '#0d0d16', text: '#5ad8ff' } } }
  };
  const themeOf = id => THEMES[id] || THEMES[2];
  // 墙面底层构造：每层铺不同的"板"
  function wallBody(g, t, w, y0, y1) {
    const p = t.wall, h = y1 - y0;
    g.fillStyle = p.base; g.fillRect(0, y0, w, h);
    switch (t.style) {
      case 'glass': {
        // 落地玻璃幕墙：整面玻璃 + 天际线 + 黄铜竖梃
        const gr = g.createLinearGradient(0, y0 + 6, 0, y1 - 12);
        gr.addColorStop(0, p.glass[0]); gr.addColorStop(.62, p.glass[1]); gr.addColorStop(1, p.glass[2]);
        g.fillStyle = gr; g.fillRect(0, y0 + 8, w, h - 22);
        g.fillStyle = p.sky;
        for (let x = 0; x < w; x += 56) {
          const bh = 18 + ((x * 37) % 26);
          g.fillRect(x + 4, y1 - 14 - bh, 22, bh);
          g.fillRect(x + 30, y1 - 14 - Math.round(bh * .62), 18, Math.round(bh * .62));
        }
        g.globalAlpha = .28; g.fillStyle = '#ffffff';
        for (let x = 0; x < w; x += 144) { g.fillRect(x + 12, y0 + 10, 16, h - 30); g.fillRect(x + 100, y0 + 10, 10, h - 30); }
        g.globalAlpha = 1;
        for (let x = 0; x < w; x += 144) { g.fillStyle = p.frame; g.fillRect(x, y0 + 4, 6, h - 16); }
        g.fillStyle = p.frame; g.fillRect(0, y0 + Math.round(h / 2), w, 3);
        break;
      }
      case 'partition': {
        // 织物隔断：每 48px 一条板缝，上部 22px 玻璃气窗
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y0 + 6, w, h - 26);
        g.fillStyle = 'rgba(0,0,0,0.14)';
        for (let x = 0; x < w; x += 48) g.fillRect(x, y0 + 6, 2, h - 26);
        g.fillStyle = 'rgba(255,255,255,0.10)';
        for (let x = 24; x < w; x += 48) g.fillRect(x, y0 + 6, 1, h - 26);
        const gt = g.createLinearGradient(0, y0 + 6, 0, y0 + 24);
        gt.addColorStop(0, p.glass[0]); gt.addColorStop(1, p.glass[2]);
        g.fillStyle = gt; g.fillRect(0, y0 + 6, w, 18);
        g.fillStyle = p.frame; g.fillRect(0, y0 + 24, w, 2);
        break;
      }
      case 'tech': {
        // 机房钢板：竖向条板 + 中部发光走线槽
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let x = 0; x < w; x += 64) g.fillRect(x, y0 + 4, 2, h - 12);
        g.fillStyle = 'rgba(120,220,255,0.10)';
        for (let x = 32; x < w; x += 64) g.fillRect(x, y0 + 4, 1, h - 12);
        g.fillStyle = 'rgba(90,220,255,0.45)'; g.fillRect(0, y0 + Math.round(h * .62), w, 2);
        g.fillStyle = 'rgba(90,220,255,0.14)'; g.fillRect(0, y0 + Math.round(h * .62) + 2, w, 6);
        break;
      }
      case 'wood': {
        // 木饰面：横向长板 + 木纹
        for (let y = y0 + 4; y < y1 - 10; y += 18) {
          g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y, w, 1);
          g.fillStyle = 'rgba(255,240,210,0.10)'; g.fillRect(0, y + 1, w, 1);
          for (let x = (y % 36) * 2; x < w; x += 96) {
            g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, y + 4, 26, 1);
          }
        }
        break;
      }
      case 'night': {
        // 夜间值班：深色面板 + 冷光地脚 + 分区缝
        g.fillStyle = 'rgba(0,0,0,0.30)';
        for (let x = 0; x < w; x += 96) g.fillRect(x, y0 + 4, 3, h - 10);
        g.fillStyle = 'rgba(90,140,255,0.10)'; g.fillRect(0, y0 + 4, w, 10);
        break;
      }
      case 'vault': {
        // 石砌错缝 + 黄铜压条
        const bw = 64, bh = 26;
        for (let row = 0, y = y0 + 4; y < y1 - 10; y += bh, row++) {
          const off = (row % 2) ? bw / 2 : 0;
          for (let x = -off; x < w; x += bw) {
            g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(x, y, 1, bh);
            g.fillStyle = 'rgba(255,235,200,0.06)'; g.fillRect(x + 1, y, bw - 1, 1);
          }
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + bh - 1, w, 1);
        }
        g.fillStyle = 'rgba(201,162,39,0.55)'; g.fillRect(0, y0 + Math.round(h * .35), w, 2);
        break;
      }
      case 'mirror': {
        // 镜面：竖向渐变的镜面反光 + 斜向高光（压暗一档，避免整面墙发白）
        const gr = g.createLinearGradient(0, y0 + 6, 0, y1 - 10);
        gr.addColorStop(0, '#9ec4be'); gr.addColorStop(.45, '#6f968f'); gr.addColorStop(1, '#476b66');
        g.fillStyle = gr; g.fillRect(0, y0 + 6, w, h - 20);
        g.globalAlpha = .18; g.fillStyle = '#ffffff';
        for (let x = -40; x < w; x += 96) { g.beginPath(); g.moveTo(x, y1 - 10); g.lineTo(x + 26, y0 + 6); g.lineTo(x + 40, y0 + 6); g.lineTo(x + 14, y1 - 10); g.fill(); }
        g.globalAlpha = 1;
        g.fillStyle = p.frame;
        for (let x = 0; x < w; x += 96) g.fillRect(x, y0 + 6, 3, h - 20);
        g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(0, y0 + Math.round(h * 0.72), w, 3);
        break;
      }
      case 'dungeon': {
        // 地牢石墙：用 0x72 的真实墙砖逐块铺（首行带压边），再压暗 + 加苔藓
        if (stats.ready) {
          for (let x = 0; x < w; x += 16) prop(g, 'dgnWallTop', x, y0, 16, 16);
          for (let y = y0 + 16; y < y1 - 6; y += 16) for (let x = 0; x < w; x += 16) prop(g, 'dgnWall', x, y, 16, 16);
        } else {
          g.fillStyle = p.base; g.fillRect(0, y0, w, h);
        }
        // 顶部更暗（地下）
        const dg = g.createLinearGradient(0, y0, 0, y0 + h * .7);
        dg.addColorStop(0, 'rgba(0,0,0,0.50)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = dg; g.fillRect(0, y0, w, h);
        // 苔藓/水渍（确定性）
        for (let x = 0; x < w; x += 48) {
          const k = Math.abs(Math.round(x / 48) * 37) % 11;
          if (k % 3 === 0) { g.fillStyle = 'rgba(86,120,74,0.16)'; g.fillRect(x + 6, y1 - 26 - (k * 3) % 18, 22, 5); }
        }
        break;
      }
      case 'scifi': {
        // 飞船/实验室舱壁：竖向肋条 + 中部发光灯带 + 底部黄黑警示条
        g.fillStyle = '#22303f'; g.fillRect(0, y0, w, h);
        for (let x = 0; x < w; x += 96) {
          g.fillStyle = '#2b3d50'; g.fillRect(x, y0 + 4, 6, h - 12);
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, y0 + 4, 2, h - 12);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 6, y0 + 4, 2, h - 12);
        }
        g.fillStyle = 'rgba(90,220,255,0.18)'; g.fillRect(0, y0 + 18, w, 6);
        g.fillStyle = 'rgba(90,220,255,0.55)'; g.fillRect(0, y0 + 20, w, 2);
        for (let x = 0; x < w; x += 96) { g.fillStyle = '#1a2634'; g.fillRect(x + 12, y0 + 32, 72, 26); g.fillStyle = '#2f4a63'; g.fillRect(x + 14, y0 + 34, 68, 1); }
        for (let x = 0; x < w; x += 24) { g.fillStyle = ((x / 24) | 0) % 2 ? '#c9a227' : '#20242c'; g.fillRect(x, y1 - 16, 24, 6); }
        break;
      }
      case 'stadium': {
        // 球场看台：下部广告板 + 上部围网 + 顶棚
        g.fillStyle = '#3a5a78'; g.fillRect(0, y0, w, h);
        // 顶棚
        g.fillStyle = '#22303f'; g.fillRect(0, y0, w, 14);
        g.fillStyle = '#4a6a88'; g.fillRect(0, y0 + 14, w, 3);
        // 围网
        g.strokeStyle = 'rgba(230,240,250,0.16)'; g.lineWidth = 1;
        for (let x = 0; x < w; x += 14) { g.beginPath(); g.moveTo(x, y0 + 17); g.lineTo(x + 14, y1 - 22); g.stroke(); g.beginPath(); g.moveTo(x + 14, y0 + 17); g.lineTo(x, y1 - 22); g.stroke(); }
        // 广告板
        for (let x = 0; x < w; x += 128) {
          const k = Math.abs(Math.round(x / 128)) % 4;
          g.fillStyle = ['#c8503c', '#2f6a3a', '#2b5c8a', '#c9a227'][k];
          g.fillRect(x + 4, y1 - 22, 120, 14);
          g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 16, y1 - 17, 60, 2); g.fillRect(x + 16, y1 - 13, 34, 2);
        }
        break;
      }
      case 'castle': {
        // 城堡石墙：错缝巨石 + 顶部城垛 + 底部青苔
        const bw = 56, bh = 28;
        g.fillStyle = '#5a4f40'; g.fillRect(0, y0, w, h);
        for (let row = 0, y = y0; y < y1 - 8; y += bh, row++) {
          const off = (row % 2) ? bw / 2 : 0;
          for (let x = -off; x < w; x += bw) {
            const k = Math.abs(row * 43 + Math.round(x / bw) * 71) % 89;
            g.fillStyle = ['#8a7a63', '#7d6f5a', '#94836a', '#736656'][k % 4];
            g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
            g.fillStyle = 'rgba(255,245,220,0.10)'; g.fillRect(x + 1, y + 1, bw - 2, 1);
            g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + 1, y + bh - 2, bw - 2, 1);
          }
        }
        // 城垛
        for (let x = 0; x < w; x += 32) { g.fillStyle = x % 64 ? '#6a5f50' : '#7d6f5a'; g.fillRect(x, y0, 30, 10); }
        g.fillStyle = 'rgba(92,116,74,0.22)';
        for (let x = 0; x < w; x += 72) g.fillRect(x + 10, y1 - 18, 26, 8);
        break;
      }
      case 'canopy': {
        // 森林：分层树冠 + 树干 + 垂藤 + 斑驳阳光
        g.fillStyle = '#16280f'; g.fillRect(0, y0, w, h);
        for (let layer = 0; layer < 3; layer++) {
          for (let x = 0; x < w; x += 28) {
            const k = Math.abs(layer * 31 + Math.round(x / 28) * 17) % 53;
            g.fillStyle = ['#2f5230', '#3a6238', '#26421f', '#457045'][k % 4];
            const r = 18 + (k % 10), cy = y0 + 12 + layer * 26 + (k % 7);
            g.beginPath(); g.arc(x + 14, cy, r, 0, Math.PI * 2); g.fill();
          }
        }
        for (let x = 16; x < w; x += 160) {
          g.fillStyle = '#3b2a18'; g.fillRect(x, y0 + 40, 14, y1 - y0 - 40);
          g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x + 10, y0 + 40, 4, y1 - y0 - 40);
          g.fillStyle = 'rgba(255,240,180,0.06)'; g.fillRect(x + 20, y0 + 46, 6, h - 60);
        }
        g.fillStyle = 'rgba(120,190,90,0.28)';
        for (let x = 0; x < w; x += 40) { const k = Math.abs(Math.round(x / 40) * 23) % 9; g.fillRect(x + 6, y0 + 30 + (k * 5) % 40, 2, 12 + (k % 9)); }
        break;
      }
      case 'ship': {
        // 海盗船：船壳横板 + 铁钉 + 舷窗 + 缆绳
        g.fillStyle = '#4a3421'; g.fillRect(0, y0, w, h);
        for (let y = y0; y < y1 - 8; y += 16) {
          const k = Math.abs(Math.round(y / 16) * 37) % 13;
          g.fillStyle = ['#7a5a3a', '#6f4f32', '#835f3c', '#66482c'][k % 4];
          g.fillRect(0, y + 1, w, 14);
          g.fillStyle = 'rgba(255,220,170,0.10)'; g.fillRect(0, y + 1, w, 1);
          g.fillStyle = 'rgba(0,0,0,0.40)'; g.fillRect(0, y + 15, w, 1);
          for (let x = 12; x < w; x += 64) { g.fillStyle = '#3a2a1a'; g.fillRect(x, y + 6, 2, 2); }
        }
        // 舷窗
        for (let x = 60; x < w; x += 180) {
          g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(x, y0 + 58, 15, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#8fc8cc'; g.beginPath(); g.arc(x, y0 + 58, 11, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(x - 6, y0 + 54, 8, 2);
          g.fillStyle = '#c9b48a'; g.fillRect(x - 16, y0 + 43, 32, 2);
        }
        // 缆绳
        g.strokeStyle = 'rgba(210,190,150,0.35)'; g.lineWidth = 2;
        for (let x = -40; x < w; x += 120) { g.beginPath(); g.moveTo(x, y1 - 10); g.lineTo(x + 60, y0 + 10); g.stroke(); }
        break;
      }
      case 'neon': {
        // 赛博：暗楼体 + 霓虹竖条 + 电路纹 + 顶部天线剪影
        g.fillStyle = '#12121c'; g.fillRect(0, y0, w, h);
        for (let x = 0; x < w; x += 72) {
          const k = Math.abs(Math.round(x / 72) * 29) % 17;
          g.fillStyle = k % 2 ? '#181826' : '#141420'; g.fillRect(x, y0, 70, h);
          g.fillStyle = 'rgba(90,216,255,0.10)'; g.fillRect(x + 70, y0, 2, h);
          if (k % 3 === 0) { g.fillStyle = 'rgba(226,80,200,0.50)'; g.fillRect(x + 12, y0 + 20, 3, h - 40); }
          if (k % 4 === 0) { g.fillStyle = 'rgba(90,216,255,0.45)'; g.fillRect(x + 46, y0 + 34, 2, h - 60); }
        }
        // 电路横线
        g.fillStyle = 'rgba(160,80,255,0.18)';
        for (let y = y0 + 16; y < y1; y += 34) g.fillRect(0, y, w, 1);
        // 顶部霓虹压边
        g.fillStyle = 'rgba(226,80,200,0.75)'; g.fillRect(0, y0, w, 2);
        g.fillStyle = 'rgba(90,216,255,0.45)'; g.fillRect(0, y0 + 2, w, 1);
        break;
      }
    }
  }
  // 墙面模块：每层不同的"挂什么"
  function wallModule(g, t, cx, y0, y1) {
    const p = t.wall;
    const bx = cx - 44, by = y0 + 16, bw = 88, bh = 40;
    switch (t.module) {
      case 'glass': {
        // 弧形窗 + 铜框 + 窗台绿植
        g.fillStyle = p.frame; g.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
        const gr = g.createLinearGradient(0, by, 0, by + bh);
        gr.addColorStop(0, p.glass[0]); gr.addColorStop(1, p.glass[2]);
        g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
        g.fillStyle = p.sky;
        g.fillRect(bx + 6, by + bh - 12, 16, 12); g.fillRect(bx + 26, by + bh - 18, 12, 18);
        g.fillRect(bx + 44, by + bh - 10, 20, 10); g.fillRect(bx + 66, by + bh - 16, 14, 16);
        g.fillStyle = '#ffffff'; g.globalAlpha = .25;
        g.fillRect(bx + 10, by + 4, 14, bh - 10); g.globalAlpha = 1;
        g.fillStyle = p.frame; g.fillRect(cx - 1, by, 2, bh);
        g.fillStyle = '#5b7a52'; g.fillRect(bx + 6, by + bh + 6, 14, 10);
        g.fillStyle = '#7fb06a'; g.fillRect(bx + 4, by + bh + 2, 18, 6);
        break;
      }
      case 'partition': {
        // 隔断板 + 便签 + 挂钩外套
        g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(bx, by, bw, bh);
        g.fillStyle = p.frame; g.fillRect(bx, by, bw, 2);
        const notes = ['#f2d35a', '#f2a6a0', '#a6d8f2', '#b6eaa6'];
        for (let i = 0; i < 4; i++) {
          g.fillStyle = notes[i]; g.fillRect(bx + 8 + i * 19, by + 8 + (i % 2) * 12, 14, 13);
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(bx + 10 + i * 19, by + 12 + (i % 2) * 12, 10, 1);
        }
        g.fillStyle = '#5a6472'; g.fillRect(bx + bw - 18, by + 6, 3, 12);
        break;
      }
      case 'tech': {
        // 蓝图海报 + 服务器状态灯条
        g.fillStyle = '#123a63'; g.fillRect(bx, by, bw, bh);
        g.fillStyle = '#2a6aa8'; g.fillRect(bx, by, bw, 3);
        g.strokeStyle = 'rgba(180,225,255,0.75)'; g.lineWidth = 1;
        g.strokeRect(bx + 8, by + 8, 30, 22);
        g.beginPath(); g.moveTo(bx + 8, by + 20); g.lineTo(bx + 38, by + 20); g.moveTo(bx + 23, by + 8); g.lineTo(bx + 23, by + 30); g.stroke();
        for (let i = 0; i < 5; i++) { g.fillStyle = i % 3 ? '#6ee7a8' : '#ffd76a'; g.fillRect(bx + 48 + i * 6, by + 10, 3, 3); }
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(bx + 48, by + 22, 26, 2);
        break;
      }
      case 'wood': {
        // 证书木框 + 滑轨铜环 + 底部纸箱
        g.fillStyle = p.frame; g.fillRect(bx + 12, by, 64, 38);
        g.fillStyle = '#f2e6cc'; g.fillRect(bx + 16, by + 4, 56, 30);
        g.fillStyle = '#c9a678'; g.fillRect(bx + 26, by + 10, 36, 2); g.fillRect(bx + 30, by + 16, 28, 2);
        g.fillStyle = '#a8483f'; g.fillRect(bx + 40, by + 24, 8, 8);
        g.fillStyle = p.trim; g.fillRect(bx - 6, by - 8, bw + 12, 3);
        for (let i = 0; i < 3; i++) { g.fillStyle = '#8f6a42'; g.fillRect(bx - 6 + i * 34, by - 8, 3, 6); }
        g.fillStyle = '#a9835a'; g.fillRect(bx + 4, by + bh + 2, 26, 14); g.fillRect(bx + 58, by + bh + 4, 22, 12);
        break;
      }
      case 'night': {
        // 监控墙（3×2 小屏）+ 红色应急灯
        g.fillStyle = '#0c1420'; g.fillRect(bx, by, bw, bh);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
          const sx = bx + 5 + c * 27, sy = by + 4 + r * 18;
          g.fillStyle = '#16324a'; g.fillRect(sx, sy, 24, 14);
          g.fillStyle = 'rgba(120,200,255,0.45)'; g.fillRect(sx + 3, sy + 4, 18, 1);
          g.fillStyle = '#6ee7a8'; g.fillRect(sx + 20, sy + 10, 2, 2);
        }
        g.fillStyle = '#c0392b'; g.fillRect(cx - 10, by - 10, 20, 8);
        g.fillStyle = '#ff7b6b'; g.fillRect(cx - 8, by - 8, 16, 4);
        g.globalAlpha = .28; g.fillStyle = '#ff5a4a';
        g.beginPath(); g.ellipse(cx, by - 2, 26, 14, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
        break;
      }
      case 'vault': {
        // 保险箱门阵列 + 大转盘
        for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
          const sx = bx + 2 + c * 22, sy = by + 2 + r * 20;
          g.fillStyle = '#8a7440'; g.fillRect(sx, sy, 18, 17);
          g.fillStyle = '#c9a227'; g.fillRect(sx + 2, sy + 2, 14, 13);
          g.fillStyle = '#5f4d24'; g.fillRect(sx + 7, sy + 6, 4, 4);
          g.fillStyle = '#f6e08a'; g.fillRect(sx + 3, sy + 3, 4, 1);
        }
        g.fillStyle = '#3a2f22'; g.fillRect(cx - 14, by + 42, 28, 4);
        g.fillStyle = '#c9a227';
        g.beginPath(); g.arc(cx, by + 44, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5f4d24'; g.fillRect(cx - 1, by + 37, 2, 9);
        break;
      }
      case 'mirror': {
        // 运动旗帜 + 天窗带
        g.fillStyle = p.glass[0]; g.fillRect(bx, by - 6, bw, 10);
        g.fillStyle = p.frame; g.fillRect(bx, by - 8, bw, 2);
        const cols = ['#d9514e', '#3f7bd6', '#f2c14e', '#4aa564'];
        for (let i = 0; i < 4; i++) {
          g.fillStyle = cols[i];
          g.beginPath(); g.moveTo(bx + 4 + i * 22, by + 8); g.lineTo(bx + 20 + i * 22, by + 8);
          g.lineTo(bx + 16 + i * 22, by + 30); g.lineTo(bx + 20 + i * 22, by + 30);
          g.lineTo(bx + 4 + i * 22, by + 30); g.closePath(); g.fill();
        }
        g.fillStyle = '#e8fbff'; g.fillRect(bx + 92, by + 4, 8, 26);
        break;
      }
      case 'dungeon': {
        // 地牢墙饰：火把（4 帧闪烁 + 光晕）/ 挂旗 / 骷髅壁龛，三选一循环
        const variant = Math.abs(Math.round(cx / 144)) % 3;
        if (variant === 0) {
          const frame = Math.floor(performance.now() / 110) % 4;
          g.fillStyle = '#241d2e'; g.fillRect(cx - 4, by + 20, 8, 18);
          g.fillStyle = '#3a3446'; g.fillRect(cx - 6, by + 18, 12, 3);
          prop(g, 'dgnTorch' + (frame + 1), cx - 15, by + 4, 30, 48);
          const gr = g.createRadialGradient(cx, by + 16, 4, cx, by + 16, 70);
          gr.addColorStop(0, 'rgba(255,190,100,0.42)'); gr.addColorStop(.55, 'rgba(255,150,60,0.14)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, by + 16, 70, 0, Math.PI * 2); g.fill();
        } else if (variant === 1) {
          g.fillStyle = '#6b5a3a'; g.fillRect(cx - 22, by - 4, 44, 3);
          prop(g, (Math.abs(Math.round(cx / 288)) % 2) ? 'dgnFlagRed' : 'dgnFlagBlue', cx - 16, by - 2, 32, 34);
        } else {
          g.fillStyle = '#17131d'; g.fillRect(cx - 24, by - 2, 48, 42);
          g.fillStyle = '#2a2431'; g.fillRect(cx - 22, by, 44, 38);
          prop(g, 'dgnSkull', cx - 12, by + 6, 24, 24);
          g.fillStyle = 'rgba(160,150,180,0.28)'; g.fillRect(cx - 10, by + 34, 20, 2);
        }
        break;
      }
      case 'scifi': {
        // 终端屏幕 / 警示牌 / 通风口 三循环
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = '#101a26'; g.fillRect(bx, by, bw, bh);
          g.fillStyle = '#0a2233'; g.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
          const t = Math.floor(performance.now() / 320) % 6;
          g.fillStyle = '#5ad8ff';
          for (let i = 0; i < 5; i++) g.fillRect(bx + 8, by + 8 + i * 6, 30 + ((i * 13 + t * 7) % 40), 1);
          g.fillStyle = '#6ee7a8'; g.fillRect(bx + bw - 16, by + 6, 8, 2);
          g.fillStyle = '#ff7b6b'; if (Math.floor(performance.now() / 500) % 2) g.fillRect(bx + bw - 16, by + 11, 5, 2);
        } else if (v === 1) {
          g.fillStyle = '#c9a227'; g.beginPath();
          g.moveTo(cx, by + 2); g.lineTo(cx + 22, by + 36); g.lineTo(cx - 22, by + 36); g.closePath(); g.fill();
          g.fillStyle = '#20242c'; g.fillRect(cx - 2, by + 12, 4, 13); g.fillRect(cx - 2, by + 28, 4, 4);
        } else {
          g.fillStyle = '#1a2634'; g.fillRect(bx + 10, by + 2, bw - 20, bh - 2);
          g.fillStyle = '#2b3d50';
          for (let i = 0; i < 5; i++) g.fillRect(bx + 14, by + 6 + i * 7, bw - 28, 3);
        }
        break;
      }
      case 'stadium': {
        // 记分牌 / 队旗 / 广告灯箱
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = '#0d1a24'; g.fillRect(bx, by, bw, bh);
          g.fillStyle = '#152b3a'; g.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
          g.fillStyle = '#ffe08a'; g.font = 'bold 14px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('2 : 1', cx, by + 16);
          g.fillStyle = '#6ee7a8'; g.fillRect(bx + 12, by + 30, 18, 3); g.fillStyle = '#ff7b6b'; g.fillRect(bx + bw - 30, by + 30, 18, 3);
        } else if (v === 1) {
          g.fillStyle = '#c8503c'; g.beginPath(); g.moveTo(cx - 18, by + 2); g.lineTo(cx + 18, by + 2); g.lineTo(cx + 12, by + 34); g.lineTo(cx - 12, by + 34); g.closePath(); g.fill();
          g.fillStyle = '#ffffff'; g.fillRect(cx - 8, by + 12, 16, 3); g.fillRect(cx - 6, by + 18, 12, 3);
        } else {
          g.fillStyle = '#e8eef2'; g.fillRect(bx + 6, by + 2, bw - 12, 30);
          g.fillStyle = '#2b5c8a'; g.fillRect(bx + 10, by + 6, bw - 20, 4);
          g.fillStyle = '#3a5a78'; g.fillRect(bx + 10, by + 14, (bw - 20) * 0.7, 3); g.fillRect(bx + 10, by + 20, (bw - 20) * 0.45, 3);
        }
        break;
      }
      case 'castle': {
        // 旗帜 / 壁灯火盆 / 拱窗
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = '#6b5a3a'; g.fillRect(cx - 24, by - 4, 48, 3);
          g.fillStyle = ['#8f2f2f', '#2f4f8f', '#8f742f'][Math.abs(Math.round(cx / 288)) % 3];
          g.beginPath(); g.moveTo(cx - 18, by); g.lineTo(cx + 18, by); g.lineTo(cx + 18, by + 30); g.lineTo(cx, by + 24); g.lineTo(cx - 18, by + 30); g.closePath(); g.fill();
          g.fillStyle = '#ffd76a'; g.beginPath(); g.arc(cx, by + 13, 5, 0, Math.PI * 2); g.fill();
        } else if (v === 1) {
          g.fillStyle = '#3a2f22'; g.fillRect(cx - 6, by + 20, 12, 18);
          g.fillStyle = '#6b5a3a'; g.fillRect(cx - 10, by + 16, 20, 4);
          const fl = Math.floor(performance.now() / 130) % 3;
          g.fillStyle = ['#ffb347', '#ffd76a', '#ff8a3d'][fl];
          g.beginPath(); g.ellipse(cx, by + 12, 9, 12 + fl * 2, 0, 0, Math.PI * 2); g.fill();
          const gr = g.createRadialGradient(cx, by + 12, 4, cx, by + 12, 60);
          gr.addColorStop(0, 'rgba(255,190,110,0.40)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, by + 12, 60, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = '#5a4f40'; g.beginPath();
          g.moveTo(cx - 18, by + 36); g.lineTo(cx - 18, by + 14); g.arc(cx, by + 14, 18, Math.PI, 0); g.lineTo(cx + 18, by + 36); g.closePath(); g.fill();
          g.fillStyle = '#c9b48a'; g.beginPath();
          g.moveTo(cx - 14, by + 34); g.lineTo(cx - 14, by + 14); g.arc(cx, by + 14, 14, Math.PI, 0); g.lineTo(cx + 14, by + 34); g.closePath(); g.fill();
          g.fillStyle = '#8fc8cc'; g.fillRect(cx - 12, by + 16, 24, 16);
        }
        break;
      }
      case 'canopy': {
        // 垂藤萤火 / 蘑菇丛 / 鸟窝
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = 'rgba(120,190,90,0.55)';
          for (let i = 0; i < 7; i++) { const hh = 16 + ((i * 37) % 34); g.fillRect(cx - 30 + i * 9, by - 6, 2, hh); }
          for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(220,255,140,0.75)'; g.fillRect(cx - 24 + i * 16, by + 14 + (i % 2) * 8, 3, 3); }
        } else if (v === 1) {
          g.fillStyle = '#4a3524'; g.fillRect(cx - 26, by + 32, 52, 6);
          for (let i = 0; i < 4; i++) {
            g.fillStyle = ['#d9534f', '#f2c14e', '#b07ae0'][i % 3];
            g.beginPath(); g.arc(cx - 18 + i * 12, by + 26, 6, Math.PI, 0); g.fill();
            g.fillStyle = '#f4f1e6'; g.fillRect(cx - 19 + i * 12, by + 26, 2, 7);
          }
        } else {
          prop(g, 'forestBrush2', cx - 16, by + 2, 32, 26);
          g.fillStyle = 'rgba(160,220,120,0.25)'; g.fillRect(cx - 20, by + 26, 40, 2);
        }
        break;
      }
      case 'ship': {
        // 舷窗海景 / 缆绳盘 / 提灯
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(cx, by + 20, 20, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3f8a96'; g.beginPath(); g.arc(cx, by + 20, 16, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#cfeef0'; g.fillRect(cx - 13, by + 12, 26, 2);
          g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(cx, by + 20, 20, 0, Math.PI * 2); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(cx - 10, by + 8, 8, 3);
        } else if (v === 1) {
          g.strokeStyle = '#c9b48a'; g.lineWidth = 3;
          for (let r = 16; r > 4; r -= 5) { g.beginPath(); g.arc(cx, by + 20, r, 0, Math.PI * 2); g.stroke(); }
          g.fillStyle = '#8a6a3a'; g.fillRect(cx - 2, by + 30, 4, 8);
        } else {
          g.fillStyle = '#2a1c10'; g.fillRect(cx - 10, by + 2, 20, 4);
          g.fillStyle = '#ffd76a'; g.beginPath(); g.ellipse(cx, by + 18, 11, 14, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff3c0'; g.fillRect(cx - 5, by + 12, 10, 8);
          const gr = g.createRadialGradient(cx, by + 18, 6, cx, by + 18, 54);
          gr.addColorStop(0, 'rgba(255,220,150,0.35)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, by + 18, 54, 0, Math.PI * 2); g.fill();
        }
        break;
      }
      case 'neon': {
        // 霓虹招牌 / 全息广告 / 监控脸
        const v = Math.abs(Math.round(cx / 144)) % 3;
        if (v === 0) {
          g.fillStyle = 'rgba(226,80,200,0.22)'; g.fillRect(cx - 40, by - 6, 80, 48);
          prop(g, 'hotelSign', cx - 34, by - 2, 68, 35);
          const gr = g.createRadialGradient(cx, by + 16, 6, cx, by + 16, 70);
          gr.addColorStop(0, 'rgba(226,80,200,0.35)'); gr.addColorStop(1, 'rgba(226,80,200,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, by + 16, 70, 0, Math.PI * 2); g.fill();
        } else if (v === 1) {
          g.fillStyle = 'rgba(90,216,255,0.20)'; g.fillRect(cx - 36, by - 4, 72, 44);
          prop(g, 'neonHolo', cx - 30, by, 60, 34);
          const gr = g.createRadialGradient(cx, by + 16, 6, cx, by + 16, 64);
          gr.addColorStop(0, 'rgba(90,216,255,0.32)'); gr.addColorStop(1, 'rgba(90,216,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(cx, by + 16, 64, 0, Math.PI * 2); g.fill();
        } else {
          prop(g, 'monitorFace', cx - 12, by + 4, 24, 20);
          g.fillStyle = 'rgba(90,216,255,0.35)'; g.fillRect(cx - 14, by + 26, 28, 1);
        }
        break;
      }
    }
  }
  function wall(g, f) {
    const t = themeOf(f.id), w = f.width, y1 = MIN_Y, y0 = -56, p = t.wall;
    wallBody(g, t, w, y0, y1);
    // 每 144px 一个模块：中间那块放楼层标语牌，其余按主题挂东西
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
  // ---------- 独立小房间的内景（需求①） ----------
  // 房间地面**不用楼层的图集瓦片**：那些是给大开间用的，16px 格在 700×450 的房间里会重复成"壁纸"。
  // 室内改用逐层材质的程序化铺装（地毯 / 木地板 / 石材 / 橡胶），尺度是"一平米一块"，
  // 再叠一层室内专属处理：中央地毯、墙根阴影、顶灯光斑。
  const ROOM_MATERIAL = {
    1: { kind: 'tile',    base: '#1c2735', line: '#101822', hi: '#2a3a4e', fiber: 'rgba(90,220,255,0.10)' },  // 科幻：金属地砖
    2: { kind: 'grass',   base: '#2f6a3a', line: '#24552d', hi: '#3a7d45', fiber: 'rgba(255,240,190,0.08)' }, // 球场：草坪
    3: { kind: 'stone',   base: '#8a7a63', line: '#5a4f40', hi: '#9c8b70', fiber: 'rgba(255,245,220,0.08)' }, // 城堡：石板
    4: { kind: 'grass',   base: '#3d6b38', line: '#2c5230', hi: '#4f7f42', fiber: 'rgba(190,255,150,0.10)' }, // 森林：草地
    5: { kind: 'dungeon', base: '#2b2536', line: '#1a1522', hi: '#3a3346', fiber: 'rgba(120,100,150,0.14)' }, // 地牢：碎石
    6: { kind: 'wood',    base: '#7a5a3a', line: '#4a3421', hi: '#96a06e', fiber: 'rgba(60,36,18,0.22)' },   // 海盗船：甲板
    7: { kind: 'tile',    base: '#1a1a26', line: '#0b0b12', hi: '#2a2a3c', fiber: 'rgba(226,80,200,0.10)' }   // 赛博：沥青
  };
  function roomFloor(g, room) {
    const w = room.width, h = room.height;
    const m = ROOM_MATERIAL[room.floorId] || ROOM_MATERIAL[2];
    // 1) 材质底 + 铺装纹样
    g.fillStyle = m.base; g.fillRect(0, 0, w, h);
    const cell = m.kind === 'carpet' ? 64 : m.kind === 'wood' ? 96 : 48;
    switch (m.kind) {
      case 'carpet':
        for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
          const k = (Math.floor(x / cell) + Math.floor(y / cell)) % 2;
          g.fillStyle = k ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
          g.fillRect(x, y, cell, cell);
          g.fillStyle = m.fiber;
          for (let i = 0; i < 22; i++) {
            const fx = x + ((i * 37) % cell), fy = y + ((i * 61) % cell);
            g.fillRect(fx, fy, 2, 1);
          }
        }
        g.fillStyle = m.line;
        for (let y = 0; y < h; y += cell) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += cell) g.fillRect(x, 0, 1, h);
        break;
      case 'wood':
        for (let y = 0; y < h; y += 16) {
          g.fillStyle = m.line; g.fillRect(0, y, w, 1);
          const stag = ((y / 16) % 2) ? 48 : 0;
          for (let x = -stag; x < w; x += 96) {
            g.fillStyle = m.line; g.fillRect(x, y, 1, 16);
            const k = Math.abs((Math.floor(x / 96) * 91 + (y / 16) * 37) % 89);
            if (k % 5 === 0) { g.fillStyle = m.fiber; g.fillRect(x + 16 + (k % 40), y + 6, 18, 1); }
            if (k % 9 === 0) { g.fillStyle = m.fiber; g.fillRect(x + 40 + (k % 30), y + 10, 3, 2); }
          }
        }
        break;
      case 'tile':
        for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
          const k = (Math.floor(x / 32) * 7 + Math.floor(y / 32) * 13) % 11;
          g.fillStyle = k === 0 ? m.hi : (k < 3 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)');
          g.fillRect(x, y, 32, 32);
        }
        g.fillStyle = m.line;
        for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h);
        g.fillStyle = m.fiber;
        for (let y = 0; y < h; y += 96) g.fillRect(0, y + 48, w, 1);
        break;
      case 'rubber':
        for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
          const k = (Math.floor(x / 32) * 17 + Math.floor(y / 32) * 29) % 7;
          g.fillStyle = k === 0 ? m.hi : 'rgba(0,0,0,0.035)';
          g.fillRect(x + 4, y + 4, 24, 24);
        }
        g.fillStyle = m.line;
        for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h);
        break;
      case 'grass':
        // 室内草坪（球场/森林）：割草条纹 + 小花
        g.fillStyle = m.base; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 32) {
          if ((y / 32) % 2) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(0, y, w, 32); }
          g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, y, w, 1);
        }
        for (let y = 0; y < h; y += 24) for (let x = 0; x < w; x += 24) {
          const k = Math.abs((x / 24) * 61 + (y / 24) * 43) % 47;
          if (k % 9 === 0) { g.fillStyle = 'rgba(120,190,90,0.22)'; g.fillRect(x + (k % 9), y + (k % 7), 4, 2); }
          if (k % 19 === 0) { g.fillStyle = ['#e06a8a', '#e0d060', '#b07ae0'][k % 3]; g.fillRect(x + (k % 11), y + (k % 5), 2, 2); }
        }
        break;
      case 'dungeon':
        // 室内地牢：同一套不规则碎石板（与楼层地面一致），否则会和墙面糊成一片
        drawFlagstones(g, 0, 0, w, h);
        break;
      default: // stone：大块石材 + 拼缝 + 细颗粒
        for (let y = 0; y < h; y += 48) for (let x = 0; x < w; x += 48) {
          const k = Math.abs((Math.floor(x / 48) * 61 + Math.floor(y / 48) * 97) % 53);
          g.fillStyle = k % 4 === 0 ? m.hi : (k % 3 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.02)');
          g.fillRect(x, y, 48, 48);
          g.fillStyle = m.fiber;
          for (let i = 0; i < 5; i++) g.fillRect(x + ((i * 23 + k) % 44), y + ((i * 31) % 44), 2, 1);
        }
        g.fillStyle = m.line;
        for (let y = 0; y < h; y += 48) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += 48) g.fillRect(x, 0, 1, h);
        break;
    }
    // 2) 中央地毯：会议室 / 休息室 / 金库才有（办公室保持硬地）
    if (room.kind === 'meeting' || room.kind === 'lounge' || room.kind === 'vault') {
      const mx = Math.round(w * 0.17), my = Math.round(h * 0.2);
      const rw = w - mx * 2, rh = h - my * 2.4;
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(mx - 4, my - 4, rw + 8, rh + 8);
      g.fillStyle = room.kind === 'vault' ? '#7a3434' : (room.kind === 'lounge' ? '#4a6b78' : '#3f5f7d');
      g.fillRect(mx, my, rw, rh);
      // 地毯包边 + 斜纹
      g.strokeStyle = 'rgba(255,236,200,0.30)'; g.lineWidth = 2;
      g.strokeRect(mx + 4, my + 4, rw - 8, rh - 8);
      g.save(); g.beginPath(); g.rect(mx + 4, my + 4, rw - 8, rh - 8); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = -rh; x < rw; x += 18) { g.beginPath(); g.moveTo(mx + x, my); g.lineTo(mx + x + rh, my + rh); g.lineTo(mx + x + rh + 6, my + rh); g.lineTo(mx + x + 6, my); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(mx + 10, my + 10, rw - 20, 2);
    }
    // 3) 墙根阴影 + 顶部灯光斑
    const sh = g.createLinearGradient(0, 0, 0, 30);
    sh.addColorStop(0, 'rgba(0,0,0,0.48)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, 30);
    const sh2 = g.createLinearGradient(0, h, 0, h - 18);
    sh2.addColorStop(0, 'rgba(0,0,0,0.30)'); sh2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh2; g.fillRect(0, h - 18, w, 18);
    const lg = g.createRadialGradient(w / 2, h * 0.3, 20, w / 2, h * 0.3, Math.max(w, h) * 0.7);
    lg.addColorStop(0, 'rgba(255,244,214,0.16)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    return true;
  }
  // 房间墙体：木质/玻璃/机柜墙板 + 上压线 + 踢脚线；北墙再挂一排画框。
  function roomWall(g, w, room) {
    const t = themeOf(room.floorId), p = t.wall;
    const horiz = w.w >= w.h;
    const isNorth = horiz && w.y <= 2;
    g.fillStyle = p.base; g.fillRect(w.x, w.y, w.w, w.h);
    if (horiz) {
      // 墙纸竖缝
      for (let x = w.x + 32; x < w.x + w.w; x += 64) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, w.y + 4, 1, w.h - 10); }
      g.fillStyle = p.trim; g.fillRect(w.x, w.y, w.w, 3);
      g.fillStyle = p.line; g.fillRect(w.x, w.y + 3, w.w, 1);
      g.fillStyle = p.skirt; g.fillRect(w.x, w.y + w.h - 7, w.w, 7);
      g.fillStyle = p.foot; g.fillRect(w.x, w.y + w.h, w.w, 2);
      if (isNorth) {
        // 北墙挂画 + 灯带
        g.fillStyle = 'rgba(255,240,200,0.10)'; g.fillRect(w.x, w.y + 4, w.w, 8);
        for (let x = w.x + 56; x < w.x + w.w - 70; x += 128) {
          g.fillStyle = p.frame; g.fillRect(x, w.y + 6, 52, 17);
          g.fillStyle = p.board.inner; g.fillRect(x + 2, w.y + 8, 48, 13);
          g.fillStyle = p.board.text;
          g.fillRect(x + 6, w.y + 12, 22, 1); g.fillRect(x + 6, w.y + 15, 32, 1);
        }
        // 地牢层：北墙每隔一段挂火把 + 暖光晕（房间里的唯一光源）
        if (t.style === 'dungeon') {
          const frame = Math.floor(performance.now() / 120) % 4;
          for (let x = w.x + 110; x < w.x + w.w - 40; x += 190) {
            g.fillStyle = '#241d2e'; g.fillRect(x - 4, w.y + 14, 8, 14);
            g.fillStyle = '#3a3446'; g.fillRect(x - 6, w.y + 12, 12, 3);
            prop(g, 'dgnTorch' + (frame + 1), x - 12, w.y - 2, 24, 39);
            const gr = g.createRadialGradient(x, w.y + 10, 4, x, w.y + 10, 72);
            gr.addColorStop(0, 'rgba(255,190,100,0.34)'); gr.addColorStop(.6, 'rgba(255,150,60,0.10)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(x, w.y + 10, 72, 0, Math.PI * 2); g.fill();
          }
        }
      }
    } else {
      for (let y = w.y + 32; y < w.y + w.h; y += 64) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(w.x + 4, y, w.w - 10, 1); }
      g.fillStyle = p.trim; g.fillRect(w.x, w.y, 3, w.h);
      g.fillStyle = p.skirt; g.fillRect(w.x + w.w - 7, w.y, 7, w.h);
      g.fillStyle = p.foot; g.fillRect(w.x + w.w, w.y, 2, w.h);
    }
    return true;
  }
  function slogan(g, t, cx, text) {
    const b=t.wall.board,bw=104,bh=30,x0=cx-bw/2,y0=14;
    g.fillStyle='#5b4a3c';g.fillRect(cx-2,4,1,10);g.fillRect(cx+1,4,1,10);g.fillRect(cx-3,3,7,2);
    g.fillStyle=b.frame;g.fillRect(x0-3,y0-3,bw+6,bh+6);g.fillRect(x0-3,y0+bh+1,bw+6,2);
    g.fillStyle=b.face;g.fillRect(x0,y0,bw,bh);
    g.fillStyle=b.inner;g.fillRect(x0+2,y0+2,bw-4,bh-4);
    g.font=text?'9px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif':'8px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    g.textAlign='center';g.textBaseline='middle';
    g.fillStyle=text?b.text:b.text+'88';
    g.fillText(text||'标 语 预 留',cx,y0+bh/2+1);
  }
  function halls(g,f,doorStates,dt=.016){
    for(const h of f.halls){
      g.fillStyle='#2f3d49';g.fillRect(h.x,h.y,h.w,h.h);
      if(stats.ready)for(let y=h.y+4;y<h.y+h.h-4;y+=16)for(let x=h.x+4;x<h.x+h.w-4;x+=16)
        tile(g,'city',Math.abs(Math.floor((x-h.x)/16))%2,19,x,y,16,16);
      g.fillStyle='#aecbd4';g.fillRect(h.x+8,h.y+8,h.w-16,2);
      g.font='8px ui-monospace,monospace';g.textAlign='center';g.fillStyle='#e5f6fc';
      g.fillText(`${f.id}F / ${h.side==='left'?'WEST':'EAST'}`,h.x+h.w/2,h.y+14);
    }
    for(const d of f.glassDoors){
      const target=doorStates[d.id]&&doorStates[d.id].open?1:0,old=animations.get(d.id)||0;
      const v=old+(target-old)*Math.min(1,dt*14);animations.set(d.id,v);
      g.fillStyle='#879fa9';g.fillRect(d.x-4,d.y-28,8,4);g.fillRect(d.x-4,d.y+24,8,4);
      g.save();g.globalAlpha=.6;g.fillStyle='#8bd4e3';
      g.fillRect(d.x-2,d.y-24-v*23,4,24);g.fillRect(d.x-2,d.y+v*23,4,24);
      g.globalAlpha=.9;g.fillStyle='#e0fbff';g.fillRect(d.x-1,d.y-19-v*23,1,12);g.fillRect(d.x-1,d.y+5+v*23,1,12);g.restore();
    }
  }
  root.SID_SCENE={ready,stats,floor,furniture,halls,tile,prop,propRow,wall,themeOf,roomFloor,roomWall,floorStyles,THEMES};
})(window);
