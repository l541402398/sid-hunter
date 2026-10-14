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
    city:'kenney-modern-city/Tilemap/tilemap.png'
  };
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
    water:'antea-office/Water-Dispenser.png', bin:'antea-office/Bin.png'
  };
  const images={},props={};
  const load=(src)=>{const i=new Image();return new Promise((res,rej)=>{i.onload=res;i.onerror=()=>rej(new Error('Asset failed: '+src));i.src=src;}).then(()=>{if(i.decode)return i.decode().catch(()=>{});}).then(()=>i);};
  const ready=Promise.all([
    ...Object.entries(atlases).map(([k,p])=>load(new URL(p,base).href).then(im=>{images[k]=im;})),
    ...Object.entries(propFiles).map(([k,p])=>load(new URL(p,base).href).then(im=>{props[k]=im;}))
  ]).then(()=>{stats.ready=true;root.dispatchEvent(new Event('sid-assets-ready'));})
    .catch(e=>{stats.error=e.message;console.error(e);});

  const P=17; // atlas stride = 16 tile + 1 gutter
  function tile(g,key,col,row,x,y,w=16,h=16){
    const image=images[key];if(!image)return false;
    g.imageSmoothingEnabled=false;
    g.drawImage(image,col*P,row*P,16,16,Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
    stats.drawImage++;return true;
  }
  // Draw one whole downloaded PNG at an explicit box (nearest neighbour, no smoothing).
  function prop(g,key,x,y,w,h){
    const im=props[key];if(!im)return false;
    g.imageSmoothingEnabled=false;
    g.drawImage(im,Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
    stats.drawImage++;return true;
  }
  // Tile a prop horizontally across [x, x+w), anchored to a south baseline.
  function propRow(g,key,x,w,bottomY,scale=1){
    const im=props[key];if(!im)return false;
    const pw=im.width*scale, ph=im.height*scale;
    const n=Math.max(1,Math.round(w/pw)), total=n*pw, sx=x+(w-total)/2;
    for(let i=0;i<n;i++)prop(g,key,sx+i*pw,bottomY-ph,pw,ph);
    return true;
  }
  // Per-floor flooring: every floor uses a different verified indoor floor tile from the packs.
  const floorStyles={
    1:{sheet:'indoors',tiles:[[24,0],[24,1],[24,2],[24,3]]},   // warm wood planks (lobby / canteen)
    2:{sheet:'city',tiles:[[18,1],[19,1],[20,1]]},              // pale grey tile (open office)
    3:{sheet:'city',tiles:[[10,1],[11,1],[12,1]]},              // grey stone (product / R&D)
    4:{sheet:'city',tiles:[[1,1],[2,1],[3,1]]},                 // red-brown brick (archives / tickets)
    5:{sheet:'city',tiles:[[25,1],[26,1],[27,1],[28,1]]},       // cream tile (duty / meeting)
    6:{sheet:'city',tiles:[[0,19],[1,19],[2,19]]},              // blue-grey grid (finance)
    7:{sheet:'indoors',tiles:[[24,4],[24,5],[24,6],[24,7]]}    // green panel (gym / auditorium)
  };
  function floor(g,id,originX,originY,w,h){
    if(!stats.ready)return false;
    const st=floorStyles[id]||floorStyles[1], stride=16;
    for(let y=0;y<h;y+=stride)for(let x=0;x<w;x+=stride){
      const wx=originX+x,wy=originY+y;
      const t=st.tiles[Math.abs(Math.floor(wx/16)+Math.floor(wy/16))%st.tiles.length];
      tile(g,st.sheet,t[0],t[1],x,y,Math.min(16,w-x),Math.min(16,h-y));
    }
    stats.floors++;return true;
  }
  // South baseline of a furniture item = bottom of its collision footprint when known.
  const baseY=f=>{const b=f.blocks&&f.blocks[0];return b?b.y+b.h:f.y+f.h;};
  // Kenney wooden tabletop row (warm wood, used for the 1F canteen furniture).
  function woodRow(g,x,w,bottomY,depth=16){
    const im=images.indoors;if(!im)return false;
    const n=Math.max(1,Math.round(w/16)),sx=x+(w-n*16)/2;
    for(let i=0;i<n;i++){
      const col=i===0?4:i===n-1?5:4+(i%2);
      tile(g,'indoors',col,0,sx+i*16,bottomY-depth,16,depth);
    }
    return true;
  }
  function furniture(g,f){
    if(f.architecturalPlaceholder)return true;
    if(!stats.ready)return false;
    const id=f.floorId||1, by=baseY(f), w=f.w, h=f.h;
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
      drawn=(id===1&&f.type==='counter')?woodRow(g,f.x,w,by,20):propRow(g,'tableSmall',f.x,w,by,1);
    }else if(f.type==='table'){
      drawn=(id===1)?woodRow(g,f.x,w,by,16):propRow(g,'tableRound',f.x,w,by,1);
    }else if(f.type==='cabinet'){
      const key=id===4?'cabinetWide':id===6?'cabinetBig':'cabinetTall';
      drawn=propRow(g,key,f.x,w,by,1);
    }else if(f.type==='plant'){
      drawn=propRow(g,w>40?'plantBig':'plantSmall',f.x,w,by,1);
    }else if(f.type==='sofa'){
      drawn=propRow(g,w<48?'sofaSmall':'sofa',f.x,w,by,1);
    }else if(f.type==='seat'){
      drawn=prop(g,'chair',f.x+w/2-16,by-32,32,32);
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
  root.SID_SCENE={ready,stats,floor,furniture,halls,tile,prop,propRow};
})(window);
