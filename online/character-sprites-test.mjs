// 真渲染模块集成回归：本地PNG解码+内存Canvas。无HTTP/Chrome，不碰真实游戏。
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createCharacterRenderer}=require('./public/js/render/characters.js'),WORLD=require('./shared/world.js');
const ROOT=path.dirname(new URL(import.meta.url).pathname);let passed=0;const test=(s,fn)=>{fn();passed++;console.log('PASS',s);};
function png(file){const b=fs.readFileSync(file);let p=8,w,h,color,depth,raw=[];while(p<b.length){const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8),data=b.subarray(p+8,p+8+n);p+=n+12;if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];color=data[9];}if(type==='IDAT')raw.push(data);}
 assert.equal(depth,8);assert.ok(color===6||color===2);const channels=color===6?4:3,stride=w*channels,src=zlib.inflateSync(Buffer.concat(raw)),out=new Uint8ClampedArray(w*h*4);let prev=Buffer.alloc(stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<h;y++){const off=y*(stride+1),f=src[off],row=Buffer.from(src.subarray(off+1,off+1+stride));for(let i=0;i<stride;i++){const a=i>=channels?row[i-channels]:0,b=prev[i],c=i>=channels?prev[i-channels]:0;row[i]=(row[i]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
 for(let x=0;x<w;x++){const o=(y*w+x)*4,i=x*channels;out[o]=row[i];out[o+1]=row[i+1];out[o+2]=row[i+2];out[o+3]=channels===4?row[i+3]:255;}prev=row;}
 return{width:w,height:h,data:out};}
class Canvas{constructor(){this.width=1;this.height=1;this._data=null;this.ctx={imageSmoothingEnabled:true,drawImage:(im,...args)=>this.draw(im,args),getImageData:()=>({data:new Uint8ClampedArray(this.data)}),putImageData:d=>{this._data=new Uint8ClampedArray(d.data);}};}get data(){if(!this._data||this._data.length!==this.width*this.height*4)this._data=new Uint8ClampedArray(this.width*this.height*4);return this._data;}getContext(){return this.ctx;}toDataURL(){return'data:image/png;base64,'+Buffer.from(this.data).subarray(0,20).toString('base64');}
 draw(im,args){let sx=0,sy=0,sw=im.width,sh=im.height,dx=0,dy=0,dw=sw,dh=sh;if(args.length===2)[dx,dy]=args;else[sx,sy,sw,sh,dx,dy,dw,dh]=args;const src=im.data,dst=this.data;
 for(let y=Math.max(0,Math.floor(dy));y<Math.min(this.height,Math.ceil(dy+dh));y++)for(let x=Math.max(0,Math.floor(dx));x<Math.min(this.width,Math.ceil(dx+dw));x++){
 const xx=Math.min(im.width-1,Math.max(0,Math.floor(sx+(x-dx)*sw/dw))),yy=Math.min(im.height-1,Math.max(0,Math.floor(sy+(y-dy)*sh/dh))),i=(yy*im.width+xx)*4,o=(y*this.width+x)*4;if(src[i+3]){dst.set(src.subarray(i,i+4),o);}}
 }}
class LocalImage{set src(url){const file=path.join(ROOT,'public',url);queueMicrotask(()=>{try{Object.assign(this,png(file));this.onload();}catch(e){this.onerror(e);}});}}
const env={Image:LocalImage,document:{createElement:t=>{assert.equal(t,'canvas');return new Canvas();}},WORLD,console,dispatchEvent:e=>events.push(e.type),Event:class{constructor(type){this.type=type;}}};const events=[];
const renderer=createCharacterRenderer(env);assert.equal(await renderer.load(),true);
const colors=Object.fromEntries(Object.entries(WORLD.PALETTES).map(([k,v])=>[k,v[0]]));const p={x:60,y:90,colors,alive:true,online:true,moving:true,walk:10,spriteFacing:'front'};
test('有限公开色板一次预烘焙36 atlas，加载事件与重复加载幂等',()=>{assert.equal(renderer.status,'ready');assert.equal(renderer.metrics.tintCache,36);assert.equal(renderer.metrics.pixelScans,36);assert.deepEqual(events,['sid-character-assets-ready']);assert.equal(renderer.load(),renderer.load());});
test('四向/待机/离线/位移驱动6行走帧正确，静止不继续迈步',()=>{for(const [i,d]of ['front','left','right','back'].entries())assert.equal(renderer.frame({...p,spriteFacing:d}).row,i);assert.equal(renderer.frame({...p,moving:false}).col,0);assert.equal(renderer.frame({...p,online:false}).col,0);assert.equal(renderer.frame({...p,alive:false}).col,0);const cols=new Set();for(let i=0;i<6;i++)cols.add(renderer.frame({...p,walk:(i+.1)*144/6}).col);assert.equal(cols.size,6);});
test('男女形象只由公开发色决定，不读id/姓名/阵营/SID技能等秘密',()=>{for(let hi=0;hi<5;hi++){const safe=new Proxy({colors:{...colors,hair:WORLD.PALETTES.hair[hi]}},{get:(o,k)=>{assert.equal(k,'colors');return o[k];}});assert.equal(renderer.style(safe),hi%2?'female':'male');}});
test('实际drawBody循环只贴5层，不扫描像素，影像平滑开关恢复',()=>{let n=0;const ctx={imageSmoothingEnabled:true,drawImage(...a){n++;assert.equal(a[3],64);assert.equal(a[4],112);assert.equal(a[7],51.2);assert.ok(Math.abs(a[8]-89.6)<1e-9);assert.ok(Math.abs(a[5]+32*.8-Math.round(p.x))<1e-9);const q={...p,walk:Math.floor((n-1)/5)*.5};assert.ok(Math.abs(a[6]+104*.8-Math.round(q.y)-renderer.bodyBob(q,0))<1e-9);}};const before=renderer.metrics.pixelScans;for(let i=0;i<120;i++)assert.equal(renderer.drawBody(ctx,{...p,walk:i*.5},'left',0),true);assert.equal(n,600);assert.equal(renderer.metrics.pixelScans,before);assert.equal(ctx.imageSmoothingEnabled,true);});
test('走路每步起伏、站立呼吸起伏，地面影子始终留在脚底不跟着动',()=>{
  const walking=[],standing=[];
  for(let i=0;i<48;i++)walking.push(renderer.bodyBob({...p,walk:i*3},0));
  for(let i=0;i<48;i++)standing.push(renderer.bodyBob({...p,moving:false},i*.05));
  // 触地下沉、跨步上抬：至少3档起伏，且鞋底最多只离地1px，不会出现悬空平移感。
  assert.ok(new Set(walking).size>=3);assert.ok(walking.includes(2)&&walking.includes(-1));
  assert.ok(Math.min(...walking)>=-1&&Math.max(...walking)<=2);
  assert.ok(new Set(standing).size>=3);assert.ok(Math.min(...standing)>=0&&Math.max(...standing)<=2);
  assert.ok(standing.every(v=>Number.isInteger(v))&&walking.every(v=>Number.isInteger(v)));
  const rects=[];const g={globalAlpha:1,imageSmoothingEnabled:true,save(){},restore(){},translate(){},fillRect(...a){rects.push(a);},drawImage(){}};
  global.window={SID:{characterSprites:renderer}};
  for(const walk of [0,36,72,108])WORLD.drawCharacterBody(g,{...p,walk},0);
  delete global.window;
  assert.equal(rects.length,4);assert.equal(new Set(rects.map(r=>r[1])).size,1);
});
test('真实四色atlas输出：同一形象只改目标部位，肤色及其它三层对象不变',()=>{
 function capture(c){const dst=new Canvas(),layers=[];dst.width=120;dst.height=112;const g={imageSmoothingEnabled:false,drawImage(im,...a){layers.push(im);dst.draw(im,a);}};renderer.drawBody(g,{...p,x:60,y:96,moving:false,colors:c},'front');return{pixels:dst.data,layers};}
 const base=capture(colors),parts=['hair','top','pants','shoes'];
 for(const [index,part] of parts.entries()){
  const changed=capture({...colors,[part]:WORLD.PALETTES[part][part==='hair'?2:1]});let n=0;
  for(let i=0;i<base.pixels.length;i+=4)if(base.pixels[i]!==changed.pixels[i]||base.pixels[i+1]!==changed.pixels[i+1]||base.pixels[i+2]!==changed.pixels[i+2])n++;
  assert.ok(n>5,part+' must recolor');for(let i=0;i<5;i++)assert.equal(base.layers[i]===changed.layers[i],i!==index+1);
  const skin=base.layers[0].data;for(let i=0;i<skin.length;i+=4)if(skin[i+3])assert.deepEqual(Array.from(base.layers[0].data.subarray(i,i+4)),Array.from(changed.layers[0].data.subarray(i,i+4)));
  assert.equal(renderer.metrics.pixelScans,36);
 }
});
test('名单头像沿同一形象与配色生成并复用缓存',()=>{const first=renderer.portrait(p);assert.match(first,/^data:image\/png;base64,/);assert.equal(renderer.portrait(p),first);assert.equal(renderer.metrics.portraitCache,1);});
test('任何公开配色都不会画出接近纯白的边缘（白边回归）',()=>{
  // 旧公式把灰度>190的像素往纯白外推：深色头发/衣服的边缘会被推亮，浅色鞋底会变成 255 纯白。
  // 新公式是乘法着色，任何档位都不会超过所选颜色本身 15%。
  for(const color of Object.values(WORLD.PALETTES).flat()){
    const target=[1,3,5].map(i=>parseInt(color[1].slice(i,i+2),16));
    for(const shade of [70,141,190,222]){
      const out=renderer.tintPixel(target,shade);
      for(let i=0;i<3;i++){
        assert.ok(out[i]<=Math.min(255,Math.ceil(target[i]*1.15)+1),`${color[0]} ${shade} 档被推亮`);
        assert.ok(out[i]>=0);
      }
    }
    assert.deepEqual(renderer.tintPixel(target,190),target,'主体档必须还原为调色板原色');
  }
  // 纯白像素只能来自固定层（眼睛高光等原画内容），不能随换色出现或消失：
  // 旧公式会把浅色鞋底推到 255，深色鞋子看起来就是一圈白边。
  const C=72,H2=116;
  const count=cs=>{
    const dst=new Canvas();dst.width=C;dst.height=H2;
    const g={imageSmoothingEnabled:false,drawImage:(im,...a)=>dst.draw(im,a)};
    renderer.drawBody(g,{x:32,y:112,colors:{...colors,...cs},alive:true,online:true,moving:false,walk:0,spriteFacing:'front'},'front',0);
    let n=0;
    for(let i=0;i<dst.data.length;i+=4)
      if(dst.data[i+3]&&dst.data[i]===255&&dst.data[i+1]===255&&dst.data[i+2]===255)n++;
    return n;
  };
  // 同一形象（发型决定男女）下，换任何颜色纯白像素数都不变 → 白只来自固定层原画。
  for(const hair of WORLD.PALETTES.hair){
    const seen=new Set();
    for(const top of WORLD.PALETTES.top)for(const shoes of WORLD.PALETTES.shoes)seen.add(count({hair,top,shoes}));
    assert.equal(seen.size,1,`${hair[0]} 形象下纯白像素数随配色变化：${[...seen].join('/')}`);
    assert.ok(Math.max(...seen)<400,'固定层白色过多，可能是素材残留背景');
  }
});
const failed=createCharacterRenderer({...env,console:{warn(){}},Image:class{set src(v){queueMicrotask(()=>this.onerror());}}});assert.equal(await failed.load(),false);test('素材加载失败不抛异常，保留旧画法而非人物消失',()=>{assert.equal(failed.status,'error');assert.equal(failed.drawBody({},p),false);});
test('真实页面加载顺序与头像接入，未修改服务器玩法/身份规则',()=>{const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),game=fs.readFileSync(path.join(ROOT,'public/game.js'),'utf8');assert.ok(html.indexOf('js/render/characters.js')>html.indexOf('/shared/world.js'));assert.ok(html.indexOf('js/render/characters.js')<html.indexOf('src="game.js"'));assert.ok(game.includes('characterSprites?.portrait(p)'));assert.ok(game.includes('sid-character-assets-ready'));});
console.log(`人物接入轻量检查 ${passed} PASS；未启动HTTP或Chrome。`);
