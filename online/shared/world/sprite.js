'use strict';
// 角色像素绘制（drawCharacterBody / 攻击动画）（浏览器与 Node 共用；由 online/shared/world.js 汇总为 window.WORLD）
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./config.js'), require('./geometry.js'), require('./furniture.js'), require('./floors.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { PALETTES } = D;
  const SKIN = ['#eabb94', '#d3a58a', '#c08e73', '#e8c3a3', '#cf9d7e'];
  const characterShadeCache = new Map();
  function characterShade(hex, k) {
    const key = hex + '|' + k;
    if (characterShadeCache.has(key)) return characterShadeCache.get(key);
    const n = parseInt(hex.slice(1), 16), t = k > 0 ? 255 : 8, a = Math.min(1, Math.abs(k));
    const ch = c => Math.round(c + (t - c) * a);
    const color = '#' + ((1 << 24) | (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1);
    characterShadeCache.set(key, color);
    return color;
  }
  const ATTACK_ANIMATION_MS = 260;
  // 新版 V4 素材（public/assets/characters-v4）的 cell 尺寸/缩放/脚底锚点；
  // 权威定义在 public/js/render/characters.js:9（CELL_W=64,CELL_H=112,SCALE=.8，锚点 (32,104)），此处保持一致。
  const NEW_CELL_W = 64, NEW_SCALE = .8, NEW_FOOT_X = 32, NEW_FOOT_Y = 104;
  const ATTACK_FADE_IN_MS = 40, ATTACK_FADE_OUT_MS = 50;
  // 挥锤关键帧 [手x, 手y, 锤柄角]：cell 坐标（原点=素材格左上角，y 向下；角 0=指向 +x，正值向下）。
  // 手位与素材静止手（base 层肤色连通块实测）对齐，首末帧落回静止手位 → 与不打时无缝：
  //   male front 右手 x44..50/y69..76 → (47,73)；male right 近侧手 x22..31/y69..77 → (27,73)；female 整体低 2px。
  // 手必须摆到剪影外面动作才读得出来：素材头占 y8..50/x17..47、躯干+双臂 y56..64 横跨 x15..50，
  // 落在这些范围里的手和手臂都是“隐形”的，所以举锤帧一律抬到 y≤40 并超出头/躯干侧缘，
  // 下砸帧甩过身体中线到另一侧偏低位置。
  const ATTACK_POSES = {
    male: {
      front: { times: [0, .26, .45, .68, 1], poses: [[47, 73, 1], [55, 38, -1.75], [53, 32, -1.55], [36, 84, .85], [47, 73, 1]] },
      back: { times: [0, .26, .45, .68, 1], poses: [[16, 73, 2.14], [9, 38, -1.39], [11, 32, -1.59], [28, 84, 2.29], [16, 73, 2.14]] },
      // 侧面头部剪影是 x8..50/y8..50 的一大团头发：手和锤必须甩到 x<10 或 y<10 才看得见，
      // 所以举锤帧把锤头送到头后上方（cell 外也在所不惜，游戏画布不裁剪）。
      // 下砸段先甩到胸前前方 (36,60) 再下劈，锤头从头前上方直落到身前，不横穿脸。
      right: { times: [0, .22, .45, .62, .78, 1], poses: [[27, 73, .95], [14, 40, -2.31], [16, 26, -1.9], [36, 60, -.2], [42, 80, .6], [27, 73, .95]] }
    },
    female: {
      front: { times: [0, .26, .45, .68, 1], poses: [[45, 75, 1], [53, 40, -1.75], [51, 34, -1.55], [34, 86, .85], [45, 75, 1]] },
      back: { times: [0, .26, .45, .68, 1], poses: [[18, 75, 2.14], [11, 40, -1.39], [13, 34, -1.59], [30, 86, 2.29], [18, 75, 2.14]] },
      right: { times: [0, .22, .45, .62, .78, 1], poses: [[28, 75, .95], [15, 42, -2.31], [17, 28, -1.9], [37, 62, -.2], [43, 82, .6], [28, 75, .95]] }
    }
  };
  // 肩关节（cell 坐标）：手臂从这里伸出，落在上衣肩线上，不在脖子或腰上。
  const ATTACK_SHOULDERS = {
    male: { front: [46, 55], back: [17, 55], right: [28, 53] },
    female: { front: [44, 57], back: [18, 57], right: [28, 55] }
  };
  // 挥击期间用袖子色盖住素材的静止手（否则屏幕上同时出现“素材的手”和“举起的手”）。
  // 盒子只圈住手部肤色及其描边，全部落在该侧衣袖轮廓内部；female y94..100 的脚踝肤色不在此范围。
  // 背面整条手臂由身体遮挡，无需覆盖。
  const ATTACK_HAND_COVER = {
    male: { front: [43, 67, 10, 11], right: [21, 67, 12, 11] },
    female: { front: [42, 71, 8, 8], right: [24, 71, 9, 8] }
  };
  // 攻击手臂的渐入渐出（毫秒）：消除“手和锤突然出现又突然消失”的硬切。
  function attackAlpha(age) {
    if (!Number.isFinite(age) || age <= 0 || age >= ATTACK_ANIMATION_MS) return 0;
    if (age < ATTACK_FADE_IN_MS) return age / ATTACK_FADE_IN_MS;
    const left = ATTACK_ANIMATION_MS - age;
    if (left < ATTACK_FADE_OUT_MS) return left / ATTACK_FADE_OUT_MS;
    return 1;
  }
  // 挥锤配色（与 drawCharacterBody 内推导一致），供预览/调试复用。
  function attackColors(p) {
    const c = p.colors, hi = Math.max(0, PALETTES.hair.findIndex(o => o[0] === c.hair[0]));
    const skin = SKIN[hi], top = c.top[1];
    return { outline: '#1c1620', skin, skinLo: characterShade(skin, -.24), top, topHi: characterShade(top, .24), topLo: characterShade(top, -.3) };
  }
  // 挥锤手臂与木锤：在 cell 空间（与素材同坐标系）逐像素栅格化，(ox,oy)=素材格左上角的屏幕坐标，
  // rect 为屏幕空间 fillRect。'left' 与 'right' 共用关键帧，绘制时按格中心镜像。
  function drawCharacterAttack(rect, ox, oy, direction, age, colors, opts) {
    opts = opts || {};
    const female = !!opts.female, cover = opts.cover !== false;
    const S = NEW_SCALE, flip = direction === 'left';
    const base = flip ? 'right' : direction;
    const build = ATTACK_POSES[female ? 'female' : 'male'];
    const key = base === 'back' ? 'back' : base === 'front' ? 'front' : 'right';
    const times = build[key].times, poses = build[key].poses;
    const t = age / ATTACK_ANIMATION_MS;
    let i = 0;
    while (i < times.length - 2 && t >= times[i + 1]) i++;
    const u = (t - times[i]) / (times[i + 1] - times[i]), eased = u * u * (3 - 2 * u);
    const mix = (a, b) => a + (b - a) * eased;
    const hand = { x: mix(poses[i][0], poses[i + 1][0]), y: mix(poses[i][1], poses[i + 1][1]) };
    const angle = mix(poses[i][2], poses[i + 1][2]);
    // ATTACK_SHOULDERS 里存的是 [x,y] 数组，必须先解构；直接取 .x/.y 会得到 undefined，
    // 导致 shoulder→elbow→hand 三段 segment 的坐标全是 NaN，循环一次都不执行——
    // 结果就是「只有锤子和手、完全没有手臂」。
    const shoulderCell = ATTACK_SHOULDERS[female ? 'female' : 'male'][base];
    const shoulder = { x: shoulderCell[0], y: shoulderCell[1] };
    const elbow = { x: shoulder.x + (hand.x - shoulder.x) * .55 + (base === 'back' ? -3 : 3),
      y: shoulder.y + (hand.y - shoulder.y) * .55 + 3 };
    // cell 空间 → 屏幕空间：先按格中心镜像（left），再乘素材缩放，最后逐边取整保证不产生模糊边。
    const pixel = (px, py, w, h, color) => {
      if (flip) px = NEW_CELL_W - px - w;
      const X = ox + px * S, Y = oy + py * S, X1 = ox + (px + w) * S, Y1 = oy + (py + h) * S;
      const rx = Math.round(X), ry = Math.round(Y);
      rect(rx, ry, Math.max(1, Math.round(X1) - rx), Math.max(1, Math.round(Y1) - ry), color);
    };
    const segment = (a, b, width, color) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= steps; j++) {
        pixel(Math.round(a.x + (b.x - a.x) * j / steps) - (width >> 1),
          Math.round(a.y + (b.y - a.y) * j / steps) - (width >> 1), width, width, color);
      }
    };
    // 先遮掉素材的静止手（袖子同色，视觉上变成一段空袖口），再画抬起的手臂，
    // 避免“胯边一只手 + 又举起一只手”。
    if (cover) {
      const box = ATTACK_HAND_COVER[female ? 'female' : 'male'][base];
      if (box) pixel(box[0], box[1], box[2], box[3], colors.top);
    }
    // 上臂（袖子）描边 9 + topLo，小臂 skin 打底 + skinLo 描边 8：0.8 缩放后仍有 5~6 屏幕像素，
    // 手臂伸出体外时不会被身体同色吃掉。
    segment(shoulder, elbow, 9, colors.outline);
    segment(elbow, hand, 8, colors.skinLo);
    segment(shoulder, elbow, 7, colors.topLo);
    segment(elbow, hand, 5, colors.skin);
    segment({ x: shoulder.x - 1, y: shoulder.y - 1 }, { x: elbow.x - 1, y: elbow.y - 1 }, 2, colors.topHi);
    const vx = Math.cos(angle), vy = Math.sin(angle);
    // 锤子按新身体比例放大：柄长 19、锤头 12×20（cell 像素），51×90 显示尺寸下能一眼认出。
    const handleEnd = { x: hand.x + vx * 19, y: hand.y + vy * 19 };
    const handleButt = { x: hand.x - vx * 3, y: hand.y - vy * 3 };
    segment(handleButt, handleEnd, 5, colors.outline);
    segment(handleButt, handleEnd, 3, '#986039');
    // 锤头的横轴始终垂直于锤柄，保留深棕端面、暖木色与木纹。
    for (let py = Math.floor(handleEnd.y - 14); py <= Math.ceil(handleEnd.y + 14); py++) {
      for (let px = Math.floor(handleEnd.x - 14); px <= Math.ceil(handleEnd.x + 14); px++) {
        const dx = px - handleEnd.x, dy = py - handleEnd.y;
        const along = dx * vx + dy * vy, across = -dx * vy + dy * vx;
        if (Math.abs(along) > 6 || Math.abs(across) > 10) continue;
        const color = Math.abs(along) > 5 || Math.abs(across) > 9 ? colors.outline
          : across > 6 ? '#75472d' : along < -2 ? '#ddb078'
            : Math.abs(along - 1) < .6 ? '#a36b40' : '#bd8750';
        pixel(px, py, 1, 1, color);
      }
    }
    // 手掌最后盖住锤柄握点，不能出现柄与手分离的悬浮武器。
    pixel(Math.round(hand.x) - 4, Math.round(hand.y) - 4, 8, 8, colors.outline);
    pixel(Math.round(hand.x) - 3, Math.round(hand.y) - 3, 6, 6, colors.skin);
    pixel(Math.round(hand.x) - 3, Math.round(hand.y) + 2, 6, 1, colors.skinLo);
  }
  // 旧版（非 V4 素材）逐块身体共用：以脚底中心为原点、1:1 像素空间的挥锤，保持历史外观不变。
  function drawLegacyAttack(rect, x, y, direction, age, colors) {
    const t = age / ATTACK_ANIMATION_MS;
    const side = direction === 'left' || direction === 'right', back = direction === 'back';
    const poses = side
      ? [[2, -17, -.9], [-5, -40, -2.1], [16, -23, .2], [2, -17, -.9]]
      : back ? [[-14, -19, -1.3], [-21, -36, -2.3], [-17, -43, -1.1], [-14, -19, -1.3]]
        : [[14, -17, -1.2], [21, -38, -1.9], [10, -12, .9], [14, -17, -1.2]];
    const times = [0, .22, .62, 1];
    const i = t < times[1] ? 0 : t < times[2] ? 1 : 2;
    const u = (t - times[i]) / (times[i + 1] - times[i]), eased = u * u * (3 - 2 * u);
    const mix = (a, b) => a + (b - a) * eased;
    const hand = { x: mix(poses[i][0], poses[i + 1][0]), y: mix(poses[i][1], poses[i + 1][1]) };
    const angle = mix(poses[i][2], poses[i + 1][2]);
    const shoulder = { x: side ? 0 : back ? -11 : 11, y: -28 };
    const elbow = { x: shoulder.x + (hand.x - shoulder.x) * .55 + (back ? -3 : 3),
      y: shoulder.y + (hand.y - shoulder.y) * .55 + 3 };
    const pixel = (px, py, w, h, color) => rect(x + (direction === 'left' ? -px - w : px), y + py, w, h, color);
    const segment = (a, b, width, color) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= steps; j++) {
        pixel(Math.round(a.x + (b.x - a.x) * j / steps) - Math.floor(width / 2),
          Math.round(a.y + (b.y - a.y) * j / steps) - Math.floor(width / 2), width, width, color);
      }
    };
    segment(shoulder, elbow, 7, colors.outline); segment(elbow, hand, 6, colors.outline);
    segment(shoulder, elbow, 5, colors.topLo); segment(elbow, hand, 4, colors.skinLo);
    segment({ x: shoulder.x - 1, y: shoulder.y - 1 }, { x: elbow.x - 1, y: elbow.y - 1 }, 2, colors.topHi);
    const vx = Math.cos(angle), vy = Math.sin(angle);
    const handleEnd = { x: hand.x + vx * 16, y: hand.y + vy * 16 };
    const handleButt = { x: hand.x - vx * 3, y: hand.y - vy * 3 };
    segment(handleButt, handleEnd, 5, colors.outline);
    segment(handleButt, handleEnd, 3, '#986039');
    // 锤头的横轴始终垂直于锤柄，保留深棕端面、暖木色与木纹。
    for (let py = Math.floor(handleEnd.y - 11); py <= Math.ceil(handleEnd.y + 11); py++) {
      for (let px = Math.floor(handleEnd.x - 11); px <= Math.ceil(handleEnd.x + 11); px++) {
        const dx = px - handleEnd.x, dy = py - handleEnd.y;
        const along = dx * vx + dy * vy, across = -dx * vy + dy * vx;
        if (Math.abs(along) > 5 || Math.abs(across) > 9) continue;
        const color = Math.abs(along) > 4 || Math.abs(across) > 8 ? colors.outline
          : across > 5 ? '#75472d' : along < -2 ? '#ddb078'
            : Math.abs(along - 1) < .6 ? '#a36b40' : '#bd8750';
        pixel(px, py, 1, 1, color);
      }
    }
    // 手掌最后盖住锤柄握点，不能出现柄与手分离的悬浮武器。
    pixel(Math.round(hand.x) - 3, Math.round(hand.y) - 3, 6, 6, colors.outline);
    pixel(Math.round(hand.x) - 2, Math.round(hand.y) - 2, 4, 4, colors.skin);
    pixel(Math.round(hand.x) - 2, Math.round(hand.y) + 1, 4, 1, colors.skinLo);
  }
  // 可选攻击 age 单位为毫秒；固定攻击方向只影响这次挥击，待机/走路仍使用原外观。
  // 跳跃已下线：不再接收 elevation，地面影子透明度固定 0.3。
  function drawCharacterBody(g, p, clock, attackAgeMs = null, attackDirection = null) {
    g.save();
    const rect = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const shade = characterShade, x = Math.round(p.x), c = p.colors;
    const hi = Math.max(0, PALETTES.hair.findIndex(o => o[0] === c.hair[0]));
    const skin = SKIN[hi], skinLo = shade(skin, -.24);
    const hair = c.hair[1], hairHi = shade(hair, .3), hairLo = shade(hair, -.3);
    const top = c.top[1], topHi = shade(top, .24), topLo = shade(top, -.3);
    const pants = c.pants[1], pantsHi = shade(pants, .18), pantsLo = shade(pants, -.26);
    const shoes = c.shoes[1], shoeLo = shade(shoes, -.32), OL = '#1c1620';
    const ph = (p.walk || 0) * .13, sw = p.moving ? Math.sin(ph) : 0;
    // 行走用双腿交替抬脚，不再把整个人向上提，支撑脚保持贴地。
    const bob = p.moving ? 0 : Math.round(Math.sin(clock * 1.5 + (p.spriteIndex ?? p.id) * 1.9) * .7);
    const yb = Math.round(p.y) + bob;
    const liftL = Math.max(0, sw) * 2, liftR = Math.max(0, -sw) * 2, arm = Math.round(-sw * 1.6);
    const a = (p.alive ? 1 : .4) * (p.online === false ? .55 : 1);
    const attacking = p.alive && Number.isFinite(attackAgeMs) && attackAgeMs >= 0 && attackAgeMs < ATTACK_ANIMATION_MS;
    const direction = (attacking ? attackDirection : p.spriteFacing) || p.spriteFacing || 'front';
    const drawAttack = () => drawLegacyAttack(rect, x, yb, direction, attackAgeMs,
      { outline: OL, skin, skinLo, topLo, topHi });
    // 地面阴影贴在脚底中心，先绘制再画身体；影子透明度固定（跳跃已下线）。
    g.globalAlpha = .3 * a;
    rect(x - 11, Math.round(p.y) - 1, 22, 4, '#0f0a12');
    g.globalAlpha = a;
    const newCharacters = typeof window !== 'undefined' ? window.SID?.characterSprites : null;
    // clock 供新版人物做行走/呼吸起伏；地面影子仍在脚底，不随起伏移动。
    if (newCharacters && newCharacters.status === 'ready' && typeof newCharacters.drawBody === 'function') {
      // 挥锤与素材共用同一变换：cell 原点=素材格左上角，脚底锚点 (32,104)，整体 0.8 缩放，
      // 手臂任意像素与身体任意像素一一对齐；起伏只跟随 bodyBob 一次，不再叠加旧 bob。
      if (attacking) {
        const lift = typeof newCharacters.bodyBob === 'function' ? newCharacters.bodyBob(p, clock) : 0;
        const female = typeof newCharacters.style === 'function' ? newCharacters.style(p) === 'female' : false;
        const swingColors = attackColors(p);
        const drawSwing = () => {
          const alpha = attackAlpha(attackAgeMs);
          if (alpha <= 0) return;
          g.save();
          g.globalAlpha *= alpha;
          drawCharacterAttack(rect, x - NEW_FOOT_X * NEW_SCALE,
            Math.round(p.y) - NEW_FOOT_Y * NEW_SCALE + lift, direction, attackAgeMs, swingColors, { female });
          g.restore();
        };
        // 背面先画手臂，再由背部与后脑自然遮挡锤子；其余朝向手臂在身体前景。
        if (direction === 'back') drawSwing();
        newCharacters.drawBody(g, p, direction, clock);
        if (direction !== 'back') drawSwing();
        g.restore();return;
      }
      newCharacters.drawBody(g, p, direction, clock);
      g.restore();return;
    }
    if (direction === 'left' || direction === 'right') {
      // 以右侧面为基准逐块镜像，远侧肢体先画、近侧后画，两个步行相位相反。
      const sideRect = (sx, sy, w, h, color) => rect(x + (direction === 'left' ? -sx - w : sx), yb + sy, w, h, color);
      const layer = parts => {
        for (const q of parts) sideRect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
        for (const q of parts) sideRect(...q);
      };
      const stride = Math.round(sw * 4), farArm = Math.round(sw * 3);
      layer([
        [-5 - stride, -12, 6, 9 - liftR, pantsLo], [-5 - stride, -3 - liftR, 10, 4, shoeLo],
        [-4 + farArm, -30, 4, 12, topLo], [-4 + farArm, -19, 4, 5, skinLo]
      ]);
      layer([[-7, -17, 14, 6, pants], [-7, -31, 14, 16, top]]);
      sideRect(-7, -31, 14, 2, topHi); sideRect(-7, -17, 14, 2, topLo);
      sideRect(-7, -31, 2, 16, topLo); sideRect(5, -29, 2, 12, shade(top, .1));
      sideRect(-7, -17, 14, 1, shade(pants, -.5));
      layer([[-3 + stride, -12, 6, 9 - liftL, pantsLo], [-3 + stride, -3 - liftL, 10, 4, shoes]]);
      sideRect(-3 + stride, -12, 6, 2, pantsHi); sideRect(-3 + stride, -liftL, 10, 1, shoeLo);
      if (!attacking) {
        layer([[-2 - farArm, -30, 5, 12, topLo], [-2 - farArm, -19, 5, 5, skin]]);
        sideRect(-2 - farArm, -29, 2, 10, topHi);
      }
      const head = [[-3, -34, 6, 5, skinLo], [-7, -47, 14, 16, skin],
        [7, -41, 3, 4, skin], [-8, -49, 16, 7, hair], [-8, -44, 7, 12, hairLo]];
      const style = hi % 4;
      if (style === 1) head.push([-9, -44, 5, 16, hair]);
      if (style === 2) head.push([-11, -43, 4, 12, hairLo]);
      if (style === 3) head.push([-5, -53, 8, 5, hair]);
      layer(head);
      sideRect(-6, -48, 8, 2, hairHi); sideRect(-2, -41, 3, 4, skinLo); sideRect(-2, -41, 2, 3, skin);
      sideRect(3, -45, 3, 1, hairLo); sideRect(4, -43, 2, 3, '#2b2230'); sideRect(5, -43, 1, 1, '#f4f8ff');
      sideRect(8, -39, 2, 1, skinLo); sideRect(5, -36, 2, 1, '#a8706a');
      if (attacking) drawAttack(); // 侧面握锤的是近侧手臂，覆盖躯干与头部边缘。
    } else {
      const back = direction === 'back';
      if (attacking && back) drawAttack(); // 朝后挥击先画，随后由背部与后脑自然遮挡。
      const parts = [
        [x - 11, yb - 3 - liftL, 10, 4, shoes], [x + 1, yb - 3 - liftR, 10, 4, shoes],
        [x - 9, yb - 12, 7, 9 - liftL, pantsLo], [x + 2, yb - 12, 7, 9 - liftR, pantsLo],
        [x - 10, yb - 17, 20, 6, pants],
        [x - 11, yb - 31, 22, 16, top],
        [x - 16, yb - 30 + arm, 5, 12, topLo], [x + 11, yb - 30 - arm, 5, 12, topLo],
        [x - 16, yb - 19 + arm, 5, 5, skin], [x + 11, yb - 19 - arm, 5, 5, skin],
        [x - 4, yb - 34, 8, 5, skinLo],
        [x - 10, yb - 47, 20, 16, back ? hair : skin],
        [x - 11, yb - 49, 22, 7, hair]
      ];
      if (attacking) {
        const sleeveIndex = back ? 6 : 7;
        parts.splice(sleeveIndex + 2, 1); parts.splice(sleeveIndex, 1);
      }
      const style = hi % 4;
      if (style === 1) parts.push([x - 13, yb - 44, 3, 16, hair], [x + 10, yb - 44, 3, 16, hair]);
      else parts.push([x - 12, yb - 44, 3, 10, hairLo], [x + 9, yb - 44, 3, 10, hairLo]);
      if (style === 2) parts.push([x + 11, yb - 43, 4, 12, hairLo]);
      if (style === 3) parts.push([x - 5, yb - 53, 10, 5, hair]);
      for (const q of parts) rect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
      for (const q of parts) rect(...q);
      rect(x - 9, yb - 48, 9, 2, hairHi);
      rect(x - 11, yb - 31, 22, 2, topHi); rect(x - 11, yb - 17, 22, 2, topLo);
      rect(x - 11, yb - 31, 2, 16, shade(top, .1)); rect(x + 9, yb - 31, 2, 16, topLo);
      if (!back) rect(x - 1, yb - 31, 2, 5, shade(top, -.45));
      rect(x - 10, yb - 17, 20, 1, shade(pants, -.5));
      rect(x - 9, yb - 12, 7, 2, pantsHi); rect(x + 2, yb - 12, 7, 2, pantsHi);
      rect(x - 11, yb - liftL, 10, 1, shoeLo); rect(x + 1, yb - liftR, 10, 1, shoeLo);
      if (back) {
        rect(x - 10, yb - 35, 20, 4, hairLo); rect(x - 8, yb - 44, 3, 8, shade(hair, .1));
        rect(x - 8, yb - 28, 16, 1, shade(top, .1));
      } else {
        rect(x - 11, yb - 40, 1, 4, skinLo); rect(x + 10, yb - 40, 1, 4, skinLo);
        rect(x - 8, yb - 45, 4, 1, hairLo); rect(x + 4, yb - 45, 4, 1, hairLo);
        rect(x - 7, yb - 43, 3, 3, '#2b2230'); rect(x + 4, yb - 43, 3, 3, '#2b2230');
        rect(x - 7, yb - 43, 1, 1, '#f4f8ff'); rect(x + 4, yb - 43, 1, 1, '#f4f8ff');
        rect(x - 1, yb - 39, 2, 1, skinLo);
        rect(x - 3, yb - 36, 6, 1, '#a8706a'); rect(x - 4, yb - 37, 1, 1, '#a8706a'); rect(x + 3, yb - 37, 1, 1, '#a8706a');
      }
      if (attacking && !back) drawAttack(); // 朝前的手臂与木锤处于身体前景。
    }
    g.restore();
  }
  return { SKIN, characterShadeCache, characterShade, ATTACK_ANIMATION_MS, ATTACK_POSES, ATTACK_SHOULDERS, ATTACK_HAND_COVER, attackAlpha, attackColors, drawCharacterAttack, drawCharacterBody };
});
