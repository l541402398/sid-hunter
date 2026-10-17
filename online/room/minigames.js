'use strict';
// 小游戏框架（v1）：坦克对决。
//
// 定位：小游戏由 server/features.js 的开关控制（rps/spire/tank/parkour），
// 这里只负责"坦克"这一款的最小可玩实现，并把结算回写成成就点。
//
// v1 是**回合制**而不是实时弹幕：双方同时秘密选择 开火 / 装填 / 闪避，
// 服务端一次结算。这样不需要做子弹物理与逐帧同步，也不会因为网络抖动判输赢，
// 后续要做实时版可以替换本文件的 resolve()，框架与结算不用动。
//
// 规则：
//   · 每人 3 点装甲、初始 1 发弹药（上限 3）
//   · 开火：有弹药才生效；对手装填 → 命中（对手 -1 装甲）；对手闪避 → 被躲开；对手也开火 → 双方各中一发
//   · 装填：+1 弹药
//   · 闪避：本回合免疫一次命中
//   · 先把对手打到 0 装甲者胜；超时未出招按"装填"处理
const TANK = { hp: 3, maxAmmo: 3, startAmmo: 1, turnMs: 20000 };

function createMinigames({ room, now, find, gainAchievement }) {
  const matches = new Map(); // id -> match
  let seq = 0;

  function enabledGames(features) {
    return Object.keys(features || {}).filter(k => features[k]);
  }

  function matchOf(playerId) {
    for (const m of matches.values()) if (m.players.includes(playerId)) return m;
    return null;
  }

  function newMatch(game, a, b) {
    seq += 1;
    const m = {
      id: `mg-${seq}`, game, players: [a.id, b.id],
      hp: { [a.id]: TANK.hp, [b.id]: TANK.hp },
      ammo: { [a.id]: TANK.startAmmo, [b.id]: TANK.startAmmo },
      picks: {}, round: 1, turnEndsAt: now() + TANK.turnMs,
      finished: false, winnerId: null, log: []
    };
    matches.set(m.id, m);
    return m;
  }

  // 开一局。两种入口：
  //   · 直接向面前的人发起（direct）：必须同层 —— 你本来就只能在同层看到并点到对方。
  //   · 楼层游戏机（arcade）：允许跨楼层匹配，解决"站在游戏机前等不到人"的问题。
  function start(actor, game, opponentId, viaArcade) {
    const g = String(game || '');
    if (!room.features[g]) return { ok: false, error: '该小游戏尚未开放' };
    if (g !== 'tank') return { ok: false, error: '该小游戏还不能玩' };
    if (!actor || !actor.alive) return { ok: false, error: '你已淘汰，不能开小游戏' };
    if (matchOf(actor.id)) return { ok: false, error: '你已经在别的对局里' };
    const foe = opponentId != null ? find(Number(opponentId)) : null;
    if (!foe || !foe.alive || foe.npc || foe.id === actor.id) return { ok: false, error: '需要选一名在线玩家' };
    if (!viaArcade && foe.floorId !== actor.floorId) return { ok: false, error: '对手不在同一层（跨楼层请用楼层游戏机）' };
    if (matchOf(foe.id)) return { ok: false, error: '对手正在别的对局里' };
    const m = newMatch(g, actor, foe);
    return { ok: true, match: project(m, actor.id) };
  }

  function act(actor, action) {
    const m = matchOf(actor.id);
    if (!m || m.finished) return { ok: false, error: '没有进行中的对局' };
    const kind = String(action || '');
    if (!['fire', 'load', 'dodge'].includes(kind)) return { ok: false, error: '未知操作' };
    if (m.picks[actor.id]) return { ok: false, error: '本回合已经出过招' };
    if (kind === 'fire' && m.ammo[actor.id] <= 0) return { ok: false, error: '没有弹药，先装填' };
    m.picks[actor.id] = kind;
    if (Object.keys(m.picks).length === 2) resolve(m);
    return { ok: true, match: project(m, actor.id) };
  }

  function resolve(m) {
    const [a, b] = m.players;
    const pa = m.picks[a] || 'load', pb = m.picks[b] || 'load';
    const hit = { [a]: false, [b]: false };
    if (pa === 'fire' && pb !== 'dodge') hit[b] = true;
    if (pb === 'fire' && pa !== 'dodge') hit[a] = true;
    if (pa === 'fire') m.ammo[a] -= 1;
    if (pb === 'fire') m.ammo[b] -= 1;
    if (pa === 'load') m.ammo[a] = Math.min(TANK.maxAmmo, m.ammo[a] + 1);
    if (pb === 'load') m.ammo[b] = Math.min(TANK.maxAmmo, m.ammo[b] + 1);
    if (hit[a]) m.hp[a] -= 1;
    if (hit[b]) m.hp[b] -= 1;
    const label = { fire: '开火', load: '装填', dodge: '闪避' };
    m.log.push(`第 ${m.round} 回合：${label[pa]} vs ${label[pb]}${hit[a] ? ' · 你被命中' : ''}${hit[b] ? ' · 对手被命中' : ''}`);
    if (m.log.length > 20) m.log.shift();
    m.picks = {};
    m.round += 1;
    m.turnEndsAt = now() + TANK.turnMs;
    if (m.hp[a] <= 0 || m.hp[b] <= 0) {
      m.finished = true;
      m.winnerId = m.hp[a] <= 0 && m.hp[b] <= 0 ? null : (m.hp[a] <= 0 ? b : a);
      for (const id of m.players) {
        const p = find(id);
        if (p && gainAchievement) gainAchievement(p, 'minigame');
      }
      if (m.winnerId != null) {
        const w = find(m.winnerId);
        if (w && gainAchievement) gainAchievement(w, 'minigameWin');
      }
    }
  }

  // 超时：把没出招的一方按"装填"补上，避免一局卡死。
  function tick() {
    const t = now();
    for (const m of matches.values()) {
      if (m.finished) continue;
      if (t < m.turnEndsAt) continue;
      for (const id of m.players) if (!m.picks[id]) m.picks[id] = 'load';
      resolve(m);
    }
  }

  function quit(actor) {
    const m = matchOf(actor.id);
    if (!m) return { ok: false, error: '没有进行中的对局' };
    if (!m.finished) {
      m.finished = true;
      m.winnerId = m.players.find(id => id !== actor.id) || null;
    }
    matches.delete(m.id);
    return { ok: true };
  }

  function project(m, viewerId) {
    const foeId = m.players.find(id => id !== viewerId);
    const me = find(viewerId), foe = find(foeId);
    return {
      id: m.id, game: m.game, round: m.round, turnEndsAt: m.turnEndsAt,
      finished: m.finished, winnerId: m.winnerId,
      self: { id: viewerId, name: me ? me.name : '', hp: m.hp[viewerId], ammo: m.ammo[viewerId] },
      foe: { id: foeId, name: foe ? foe.name : '', hp: m.hp[foeId] },
      picked: !!m.picks[viewerId], log: m.log.slice()
    };
  }

  return { start, act, tick, quit, matchOf, project, TANK, list: enabledGames };
}

module.exports = { createMinigames, TANK };
