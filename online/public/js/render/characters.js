'use strict';
// V2角色：固定层+四色语义蒙版。颜色atlas按(形象/部位/颜色)缓存，不逐帧读像素。
(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports={createCharacterRenderer:factory};
  else {const api=factory(root);root.SID=root.SID||{};root.SID.characterSprites=api;api.load();}
})(typeof window!=='undefined'?window:globalThis,function(env){
  const PARTS=['hair','top','pants','shoes'],DIRS=['front','left','right','back'];
  // 地图实体约77px高（原60px），放大28%；只改视觉，不改世界脚底锚点和碰撞。
  const CELL_W=64,CELL_H=112,SCALE=.8;
  // 起伏：走路每一步上下一次（触地下沉2px、跨步上抬1px），站立按呼吸缓慢上下。
  // 只作用于绘制纵向偏移，不改世界脚底锚点、碰撞、命中与地面影子。
  // 下沉多于上抬，是为了让鞋底始终压在脚底影子附近——纯向上抬会变成“悬空飘”。
  const STEP_PX=144,WALK_DIP=2,WALK_LIFT=1,IDLE_BOB=1;
  const assets=new Map(),tints=new Map(),portraits=new Map();
  const metrics={pixelScans:0,draws:0,tintBuilds:0};let status='loading',loadPromise=null;
  function canvas(w,h){const c=env.document.createElement('canvas');c.width=w;c.height=h;return c;}
  function style(p){
    // 唯一依据是现有公开发色，不使用id/SID/阵营/姓名。后续若增加玩家自选外观可扩展。
    const palette=env.WORLD?.PALETTES?.hair||[];
    const i=Math.max(0,palette.findIndex(item=>item[0]===p.colors?.hair?.[0]));
    return i%2?'female':'male';
  }
  function validColor(v){return typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);}
  function rgb(hex){return[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
  // 乘法着色：整体保留所选颜色的色相与饱和，不会把高光推向纯白。
  // 素材侧已把明暗压成三档并禁止纯白高光，高光档上限 250，因此换任何颜色都不会出现纯白边。
  function tintPixel(target,shade){const s=shade/190;
    if(s<=1)return target.map(v=>Math.round(v*s));
    const k=1+(s-1)*.8;return target.map(v=>Math.min(250,Math.round(v*k)));}
  function tinted(sex,part,color){
    if(!validColor(color))return null;
    const key=sex+'|'+part+'|'+color.toLowerCase();if(tints.has(key))return tints.get(key);
    const image=assets.get(sex+'-'+part);if(!image)return null;
    const c=canvas(448,448),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,448,448),d=data.data,target=rgb(color);metrics.pixelScans++;
    for(let i=0;i<d.length;i+=4)if(d[i+3]){const v=tintPixel(target,d[i]);d[i]=v[0];d[i+1]=v[1];d[i+2]=v[2];}
    ctx.putImageData(data,0,0);tints.set(key,c);metrics.tintBuilds++;
    // 正常仅36张部位atlas（两种形象×各项有限色板）；异常自定义颜色也有上限。
    if(tints.size>64)tints.delete(tints.keys().next().value);
    return c;
  }
  function layers(p,sex){const list=[assets.get(sex+'-base')];for(const part of PARTS){const c=tinted(sex,part,p.colors?.[part]?.[1]);if(!c)return null;list.push(c);}return list;}
  function bobOffset(p,clock,walking,phase){
    if(walking){
      // |sin| 让每一步起伏一次：触地压到最低、迈步回到最高，不再匀速平移像滑行。
      const u=Math.abs(Math.sin(phase));
      return Math.max(-WALK_LIFT,Math.round(WALK_DIP-(WALK_DIP+WALK_LIFT)*u));
    }
    // 站立/离线：缓慢呼吸起伏，同样只往下沉，脚底不离开地面。
    // 相位只用来错峰，不参与外观、身份或阵营判定。
    const t=Number(clock)||0,id=Number(p.id);
    return Math.round(IDLE_BOB-Math.sin(t*2.6+(Number.isFinite(id)?id*1.9:0))*IDLE_BOB);
  }
  function phaseOf(p){return Math.max(0,Number(p.walk)||0)*(Math.PI*2/STEP_PX);}
  function walkingOf(p){return !!(p.moving&&p.online!==false&&p.alive!==false);}
  function bodyBob(p,clock){return bobOffset(p,clock,walkingOf(p),phaseOf(p));}
  function frame(p,direction,clock){
    const row=Math.max(0,DIRS.indexOf(direction||p.spriteFacing||'front'));
    // 使用位移累计相位，不依赖玩家id或客户端帧率；离线/站立一律待机。
    const walking=walkingOf(p),phase=phaseOf(p);
    const col=walking?1+Math.floor(phase/(Math.PI*2)*6)%6:0;
    return{row,col,sex:style(p),bob:bobOffset(p,clock,walking,phase)};
  }
  function drawBody(g,p,direction,clock){
    if(status!=='ready')return false;
    const f=frame(p,direction,clock),parts=layers(p,f.sex);if(!parts)return false;
    const x=Math.round(p.x)-32*SCALE,y=Math.round(p.y)-104*SCALE+f.bob;
    const smoothing=g.imageSmoothingEnabled;g.imageSmoothingEnabled=false;
    for(const image of parts)g.drawImage(image,f.col*64,f.row*112,64,112,x,y,64*SCALE,112*SCALE);
    g.imageSmoothingEnabled=smoothing;metrics.draws++;return true;
  }
  function portrait(p){
    if(status!=='ready')return null;
    const sex=style(p),key=sex+'|'+PARTS.map(k=>p.colors?.[k]?.[1]).join('|');
    if(portraits.has(key)){const value=portraits.get(key);portraits.delete(key);portraits.set(key,value);return value;}
    const parts=layers(p,sex);if(!parts)return null;
    const c=canvas(32,38),g=c.getContext('2d');g.imageSmoothingEnabled=false;
    for(const image of parts)g.drawImage(image,14,6,36,46,0,0,32,38);
    const uri=c.toDataURL('image/png');portraits.set(key,uri);
    if(portraits.size>128)portraits.delete(portraits.keys().next().value);return uri;
  }
  function load(){
    if(loadPromise)return loadPromise;
    loadPromise=Promise.all(['male','female'].flatMap(sex=>['base',...PARTS].map(part=>new Promise((resolve,reject)=>{
      const name=sex+'-'+part,im=new env.Image();im.onload=()=>{assets.set(name,im);resolve();};im.onerror=()=>reject(Error('角色素材加载失败：'+name));
      im.src=env.SID_CHARACTER_ASSETS?.[name]||'/assets/characters-v4/'+name+'.png';
    })))).then(()=>{
      // 将有限公开色板预烘焙，进入地图后每帧只贴图；肤色/五官/轮廓不被重着色。
      for(const sex of ['male','female'])for(const part of PARTS)for(const color of env.WORLD?.PALETTES?.[part]||[])tinted(sex,part,color[1]);
      status='ready';if(env.dispatchEvent&&env.Event)env.dispatchEvent(new env.Event('sid-character-assets-ready'));return true;
    }).catch(error=>{status='error';env.console?.warn('新人物素材未就绪，保留旧角色绘制。',error.message);return false;});
    return loadPromise;
  }
  return{load,drawBody,portrait,frame,style,bobOffset,bodyBob,tintPixel,get status(){return status;},get metrics(){return{...metrics,tintCache:tints.size,portraitCache:portraits.size};}};
});
