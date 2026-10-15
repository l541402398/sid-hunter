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
  // 每层地板：材质类别互不相同 + 每层环境色温，避免"只换地毯"与"整体偏冷"。
  // sheet/tiles 均取自已核实图集；tint = 环境色叠加；accent = 地板主题纹样（按 chunk 确定性烘焙）。
  const floorStyles={
    1:{sheet:'city',tiles:[[10,1],[11,1],[12,1]],tint:'rgba(210,228,255,0.06)',accent:'tech'},      // 科幻：冷灰金属甲板 + 青蓝走线
    2:{sheet:'city',tiles:[[0,19],[1,19],[2,19]],tint:'rgba(255,196,120,0.09)',accent:'rune'},       // 魔幻：蓝灰石砖 + 烛金纹样
    3:{sheet:'indoors',tiles:[[24,0],[24,1],[24,2],[24,3]],tint:'rgba(255,206,150,0.10)',accent:''}, // 温馨可爱：暖木
    4:{sheet:'farm',tiles:[[0,0],[1,0],[2,0]],cell:16,tint:'rgba(255,236,180,0.05)',accent:'farm'},// 田园：Tiny Town 草地 (0,0)-(2,0)（美术标为草地区，像素均值亦为绿）
    5:{sheet:'indoors',tiles:[[23,0],[25,0],[23,2],[25,2]],tint:'rgba(255,190,110,0.12)',accent:''}, // 暮色书房：深木
    6:{sheet:'city',tiles:[[25,1],[26,1],[27,1],[28,1]],tint:'rgba(255,196,214,0.20)',accent:'sweet'},// 糖果：粉彩糖霜方格
    7:{sheet:'indoors',tiles:[[24,4],[24,5],[24,6],[24,7]],tint:'rgba(255,232,170,0.10)',accent:'court'}// 活力运动：绿茵 + 场地线
  };
  // 地板主题纹样（确定性，随地板块缓存一起烘焙）
  function floorAccent(g,kind,x,y,w,h){
    switch(kind){
      case 'tech':
        g.fillStyle='rgba(79,214,200,0.28)';
        for(let yy=y+8;yy<y+h;yy+=48)g.fillRect(x,yy,w,1);
        for(let xx=x+8;xx<x+w;xx+=96)g.fillRect(xx,y,1,h);
        break;
      case 'rune':
        g.fillStyle='rgba(242,181,68,0.20)';
        for(let xx=x+24;xx<x+w;xx+=72){g.fillRect(xx,y+4,2,8);g.fillRect(xx-4,y+10,10,2);}
        break;
      case 'farm':
        g.fillStyle='rgba(124,195,106,0.26)';
        for(let xx=x+20;xx<x+w;xx+=80){g.fillRect(xx,y+6,14,5);g.fillRect(xx+3,y+3,8,3);}
        break;
      case 'sweet':
        g.fillStyle='rgba(247,168,196,0.34)';
        for(let xx=x+6;xx<x+w;xx+=32)for(let yy=y+6;yy<y+h;yy+=32)if((((xx/32)|0)+((yy/32)|0))%2)g.fillRect(xx,yy,16,16);
        g.fillStyle='rgba(255,255,255,0.22)';
        for(let xx=x+6;xx<x+w;xx+=32)for(let yy=y+6;yy<y+h;yy+=32)if((((xx/32)|0)+((yy/32)|0))%2===0)g.fillRect(xx,yy,16,16);
        break;
      case 'court':
        g.fillStyle='rgba(255,255,255,0.28)';
        for(let yy=y+16;yy<y+h;yy+=64)g.fillRect(x,yy,w,2);
        g.fillStyle='rgba(217,81,78,0.16)';
        for(let xx=x+32;xx<x+w;xx+=160)g.fillRect(xx,y,3,h);
        break;
    }
  }
  function floor(g,id,originX,originY,w,h){
    if(!stats.ready)return false;
    const st=floorStyles[id]||floorStyles[1], stride=st.cell||16;
    for(let y=0;y<h;y+=stride)for(let x=0;x<w;x+=stride){
      const wx=originX+x,wy=originY+y;
      const t=st.tiles[Math.abs(Math.floor(wx/stride)+Math.floor(wy/stride))%st.tiles.length];
      tile(g,st.sheet,t[0],t[1],x,y,Math.min(stride,w-x),Math.min(stride,h-y));
    }
    if(st.tint){g.fillStyle=st.tint;g.fillRect(originX,originY,w,h);}   // 环境色温：整体偏暖
    if(st.accent)floorAccent(g,st.accent,originX,originY,w,h);          // 主题纹样
    stats.floors++;return true;
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
  function themeSpec(id,type){
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
  // ===== F2 魔幻：Kenney indoors（CC0，16px，step 17，坐标已按编号图核实）=====
  // 不采用 OGA 的 32px 单张桌（缩放到 130px 足迹会糊）；改用 16px 模块化木桌面，天然对齐网格。
  THEME_FURN[2]={
    desk:      {sheet:'indoors',col:0,row:0,cw:3,ch:1},    // 直角木长桌（左/中/右模块横铺）
    table:     {sheet:'indoors',col:4,row:0,cw:2,ch:1},    // 圆角木长桌
    cabinet:   {sheet:'indoors',col:5,row:12,cw:1,ch:3},   // 书架堆（彩色书）
    seat:      {sheet:'indoors',col:0,row:2,cw:1,ch:1},    // 棕色木椅
    reception: {sheet:'indoors',col:0,row:0,cw:3,ch:1},
    counter:   {sheet:'indoors',col:0,row:0,cw:3,ch:1}
  };
  // ===== F5 暮色书房：书架带为核心特征（CC0 16px）=====
  THEME_FURN[5]={
    desk:      {sheet:'indoors',col:0,row:0,cw:3,ch:1},    // 直角木长桌
    table:     {sheet:'indoors',col:4,row:0,cw:2,ch:1},    // 圆角木长桌
    cabinet:   {sheet:'indoors',col:5,row:12,cw:1,ch:3},   // 书架堆（彩色书）
    seat:      {sheet:'indoors',col:0,row:2,cw:1,ch:1},
    plant:     {sheet:'indoors',col:16,row:0,cw:1,ch:1,native:true}   // 盆栽（按 16px 原生绘制，勿放大）
  };
  // ===== F3 温馨可爱：暖木家具 + 室内盆栽（CC0 16px）=====
  THEME_FURN[3]={
    table:     {sheet:'indoors',col:4,row:0,cw:2,ch:1},
    cabinet:   {sheet:'indoors',col:5,row:12,cw:1,ch:3},
    seat:      {sheet:'indoors',col:0,row:2,cw:1,ch:1},
    plant:     {sheet:'indoors',col:16,row:0,cw:1,ch:1,native:true}
  };
  // ===== F4 田园农家：木器家具 + 盆栽；地面改用本包真实草地（Tiny Town, CC0）=====
  // 只取无朝向歧义的植被/地面元件；该包为 3/4 视角，不取带正面立面的建筑。
  THEME_FURN[4]={
    desk:      {sheet:'indoors',col:0,row:0,cw:3,ch:1},
    table:     {sheet:'indoors',col:6,row:0,cw:1,ch:1,single:true},
    cabinet:   {sheet:'indoors',col:4,row:12,cw:1,ch:3},   // 木色文件柜
    seat:      {sheet:'indoors',col:0,row:2,cw:1,ch:1},
    plant:     {sheet:'indoors',col:16,row:0,cw:1,ch:1,native:true}
  };
  // ===== F6 糖果甜点：棒棒糖/糖果作观叶位装饰（CC0 单文件，35×35，勿放大超过 2×）=====
  THEME_FURN[6]={
    plant:     {prop:'candyPop',scale:2}
  };
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
    const spec=themeSpec(id,f.type);
    if(spec){
      g.save();
      const ok=drawSpec(g,spec,f);
      g.restore();
      if(ok){stats.furniture++;stats.themed=(stats.themed||0)+1;return true;}
    }
    g.save();g.imageSmoothingEnabled=false;
    let drawn=false;
    if(f.type==='desk'){
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
      const im=props.chair, cw=im?im.width:16, ch=im?im.height:16;      // 按原始 16px 绘制，不做 2 倍放大
      drawn=prop(g,'chair',f.x+w/2-cw/2,by-ch,cw,ch);
    }else if(f.type==='stage'||f.type==='mat'){
      for(let yy=0;yy<h;yy+=16)for(let xx=0;xx<w;xx+=16)
        tile(g,'indoors',24,f.type==='stage'?0:4,f.x+xx,f.y+yy,Math.min(16,w-xx),Math.min(16,h-yy));
      drawn=true;
    }
    g.restore();
    if(!drawn)return false;           // e.g. the CC0/CC-BY packs carry no treadmill or dumbbell sprite.
    stats.furniture++;return true;
  }
  const animations=new Map();
  // ---------- 逐层"世界风格"主题：墙面材质/配色 + 墙饰 + 环境光 ----------
  // 每层换一套材质与配色，让七层一眼看出是不同的"世界"，而不是同一套家具换色。
  const THEMES={
    1:{name:'科幻',   wall:{base:'#2f3b52',trim:'#5c7ea8',line:'#48627f',skirt:'#22303f',foot:'#16202c',seam:'#2a3749',frame:'#7f9cb8',
        glass:['#bfe6ff','#8fc2ea','#dff1ff'],sky:'#6f9ec6',board:{frame:'#7f9cb8',face:'#0d1e33',inner:'#132b46',text:'#7fe3ff'},decor:'tech'}},
    2:{name:'魔幻',   wall:{base:'#3b2f52',trim:'#7f6aa8',line:'#5b4a7a',skirt:'#2a2140',foot:'#1a1430',seam:'#342a4a',frame:'#9a7fc0',
        glass:['#e6d8ff','#c3a8ef','#f4ecff'],sky:'#9b7fd0',board:{frame:'#9a7fc0',face:'#241640',inner:'#33205c',text:'#e8c9ff'},decor:'magic'}},
    3:{name:'温馨可爱',wall:{base:'#f3d9c0',trim:'#ffeede',line:'#e6c3a6',skirt:'#d9a984',foot:'#b9825f',seam:'#ecd0b4',frame:'#c98f63',
        glass:['#eaf8ff','#c8e9fb','#f6fdff'],sky:'#a8d8e8',board:{frame:'#c98f63',face:'#7a4a2c',inner:'#93603c',text:'#ffe6b0'},decor:'cute'}},
    4:{name:'田园农家',wall:{base:'#e8d4a8',trim:'#f7ecd2',line:'#d9c191',skirt:'#b99a62',foot:'#8f7346',seam:'#e0c9a0',frame:'#a87b4a',
        glass:['#eaf7e2','#c6e4b0','#f4fce8'],sky:'#9fc98a',board:{frame:'#a87b4a',face:'#4c3a22',inner:'#5f4a2c',text:'#ffe7a8'},decor:'farm'}},
    5:{name:'暮色书房',wall:{base:'#cfa893',trim:'#f0dccd',line:'#bb9482',skirt:'#9a6f5c',foot:'#75503f',seam:'#c69d89',frame:'#8f5f47',
        glass:['#ffeaea','#ffd0c4','#fff6f2'],sky:'#e8a89c',board:{frame:'#8f5f47',face:'#3f2018',inner:'#522c22',text:'#ffd9a8'},decor:'onsen'}},
    6:{name:'蒸汽工坊',wall:{base:'#4a4038',trim:'#8f7a5c',line:'#6b5b48',skirt:'#332b24',foot:'#221c17',seam:'#413830',frame:'#b08c50',
        glass:['#ffe9c4','#e6c184','#fff6e0'],sky:'#c69a5c',board:{frame:'#b08c50',face:'#241a10',inner:'#33261a',text:'#ffcf7a'},decor:'steam'}},
    7:{name:'活力运动',wall:{base:'#3f6b7a',trim:'#7fc4c9',line:'#5a95a0',skirt:'#2d5260',foot:'#1d3843',seam:'#39606d',frame:'#9fd8d4',
        glass:['#dff7ff','#a8e0ef','#f0fdff'],sky:'#8fc8d8',board:{frame:'#9fd8d4',face:'#10303a',inner:'#164049',text:'#9ff0e6'},decor:'sport'}}
  };
  const themeOf=id=>THEMES[id]||THEMES[3];
  // 墙面主题装饰（画在标语板/窗户之外的空位，纯装饰，不参与碰撞）
  function wallDecor(g,t,x0,x1,y0,y1){
    const mid=(x0+x1)/2;
    switch(t.decor){
      case 'tech':
        g.fillStyle=t.wall.trim;g.fillRect(mid-30,y0+10,60,22);
        g.fillStyle=t.wall.face||t.wall.foot;g.fillRect(mid-26,y0+13,52,16);
        g.fillStyle=t.board.text;for(let i=0;i<4;i++)g.fillRect(mid-20+i*12,y0+20,7,3);
        break;
      case 'magic':
        g.fillStyle='#4a3a1c';g.fillRect(mid-3,y0+8,6,4);
        g.fillStyle='#c9a227';g.fillRect(mid-2,y0+12,4,16);
        g.fillStyle='#ffd76a';g.fillRect(mid-1,y0+12,2,6);
        g.fillStyle='#ffefb0';g.fillRect(mid-5,y0+14,2,8);g.fillRect(mid+3,y0+16,2,6);
        break;
      case 'cute':
        for(let i=0;i<8;i++){const col=['#ff9aa2','#ffdac1','#b5ead7','#c7ceea'][i%4];
          g.fillStyle=col;g.fillRect(mid-56+i*14,y0+8,12,10);g.fillStyle='#ffffff55';g.fillRect(mid-56+i*14,y0+8,12,3);}
        break;
      case 'farm':
        g.fillStyle='#8f7346';g.fillRect(mid-40,y0+12,80,3);
        for(let i=0;i<7;i++){g.fillStyle='#a87b4a';g.fillRect(mid-40+i*12,y0+8,3,10);}
        g.fillStyle='#7fae5a';g.fillRect(mid-20,y0+16,8,8);g.fillRect(mid+12,y0+16,8,8);
        break;
      case 'onsen':
        g.fillStyle='#e8e0d0';g.fillRect(mid-24,y0+8,48,20);
        g.fillStyle='#c94f4f';g.fillRect(mid-24,y0+8,48,4);
        g.fillStyle='#8f5f47';g.fillRect(mid-2,y0+12,4,14);
        break;
      case 'steam':
        g.fillStyle='#6b5b48';g.fillRect(mid-32,y0+10,64,4);
        g.fillStyle='#b08c50';g.fillRect(mid-26,y0+14,10,10);g.fillRect(mid+16,y0+14,10,10);
        g.fillStyle='#8a7a5c';g.fillRect(mid-14,y0+14,28,10);
        break;
      case 'sport':
        g.fillStyle='#ffffff';g.fillRect(mid-30,y0+10,60,20);
        g.fillStyle='#e85d5d';g.fillRect(mid-30,y0+10,60,5);g.fillRect(mid-4,y0+10,8,20);
        break;
    }
  }
  // 后墙墙带（逐层主题）：与两端原 drawBackWall 同尺寸（y -56..58），仅材质/配色/装饰按主题变化。
  // THEME_WALL：某层若配了真实图集墙带（如 F1 的设施窗墙），先铺真图，再叠加原程序化窗/标语/装饰。
  const THEME_WALL={1:{sheet:'shooter',col:21,row:1}};   // Kenney Topdown Shooter 带窗墙带（真 alpha，CC0）
  function wall(g,f){
    const t=themeOf(f.id),w=f.width,y1=MIN_Y,y0=-56,p=t.wall;
    const tw=THEME_WALL[f.id], twim=tw&&images[tw.sheet];
    if(twim){
      const cell=cellOf(tw.sheet).tile;
      for(let y=y0;y<y1;y+=cell)for(let x=0;x<w;x+=cell)
        tile(g,tw.sheet,tw.col,tw.row,x,y,Math.min(cell,w-x),Math.min(cell,y1-y));
    }else{
      g.fillStyle=p.base;g.fillRect(0,y0,w,y1-y0);
      g.fillStyle=p.trim;g.fillRect(0,y0,w,2);
      g.fillStyle=p.line;g.fillRect(0,y0+2,w,1);
    }
    g.fillStyle=p.skirt;g.fillRect(0,y1-7,w,7);
    g.fillStyle=p.foot;g.fillRect(0,y1,w,2);
    for(let x=36;x<w;x+=48)g.fillStyle=p.seam,g.fillRect(x,y0+3,1,y1-y0-10);
    const modules=Math.floor(w/144);
    for(let i=0;i<modules;i++){
      const cx=Math.round(144*(i+.5));
      if(i===2||i===5||i===8){slogan(g,t,cx,i===5?(f.name||'').replace(/^\d+F\s*·?\s*/,''):null);continue;}
      if(i===3||i===9){wallDecor(g,t,cx-72,cx+72,y0,y1);continue;}
      backWindow(g,t,cx);
    }
    return true;
  }
  function backWindow(g,t,cx){
    const p=t.wall,ww=64,wh=34,x0=cx-ww/2,y0=12;
    g.fillStyle='#8d745e';g.fillRect(x0-4,y0+wh,ww+8,4);
    g.fillStyle='#5b4a3c';g.fillRect(x0-4,y0+wh+4,ww+8,1);
    g.fillStyle=p.frame;g.fillRect(x0-2,y0-2,ww+4,wh+4);
    g.fillStyle=p.foot;g.fillRect(x0,y0,ww,wh);
    const gr=g.createLinearGradient(0,y0,0,y0+wh);
    gr.addColorStop(0,p.glass[0]);gr.addColorStop(.6,p.glass[1]);gr.addColorStop(1,p.glass[2]);
    g.fillStyle=gr;g.fillRect(x0,y0,ww,wh);
    g.fillStyle=p.sky;
    g.fillRect(x0+6,y0+wh-9,10,9);g.fillRect(x0+8,y0+wh-14,6,5);
    g.fillRect(x0+22,y0+wh-12,12,12);g.fillRect(x0+40,y0+wh-8,8,8);g.fillRect(x0+50,y0+wh-13,9,13);
    g.fillStyle='#ffffff';g.fillRect(x0+14,y0+6,12,3);g.fillRect(x0+17,y0+4,7,3);g.fillRect(x0+38,y0+9,10,2);
    g.fillStyle=p.frame;g.fillRect(cx-1,y0,2,wh);g.fillRect(x0,y0+Math.floor(wh/2)-1,ww,2);
    g.globalAlpha=.22;g.fillStyle='#ffffff';
    for(let k=0;k<5;k++)g.fillRect(x0+6+k*7,y0+2+k*5,3,8);
    g.globalAlpha=1;
  }
  function slogan(g,t,cx,text){
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
  root.SID_SCENE={ready,stats,floor,furniture,halls,tile,prop,propRow,wall,themeOf};
})(window);
