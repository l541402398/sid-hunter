'use strict';
// 持久化层（第二轮）：把"值得留档"的东西写进 SQLite，而不是全留在内存里。
//
// 设计边界（重要）：
//   · **实时对局状态仍然在内存**（20Hz 快照、位置、指令去重）。把每秒几十次的状态写库只会拖慢服务，
//     而且局域网试玩的语义本来就是"一局一次"。
//   · 落盘的只有两类：
//       1) rounds  —— 每局结束时的结算快照（结束方式、时间、名次），供管理页在重启后仍能看到上局排名；
//       2) players —— 每 60 秒一次的在局玩家进度快照（分数/筹码/道具），进程意外崩掉时最多丢 1 分钟。
//
// 依赖：Node 22.5+ 的内置 `node:sqlite`（零 npm 依赖），首次加载会打印 Experimental 警告。
// 若运行环境没有该模块，自动降级为「不持久化」而不是让服务起不来。
const fs = require('fs');
const path = require('path');

function createStore(options = {}) {
  const disabled = options.enabled === false || process.env.SID_DB === '0' || process.env.SID_TEST === '1';
  const file = options.file || process.env.SID_DB_FILE || path.join(__dirname, '..', '.data', 'sid.sqlite');
  const state = { enabled: false, file, error: null, lastRoundId: null };

  if (disabled) {
    return {
      ...state,
      enabled: false,
      reason: process.env.SID_TEST === '1' ? 'SID_TEST=1（测试隔离，不落盘）' : 'SID_DB=0',
      saveRound() { }, savePlayers() { }, loadLastRound() { return null; },
      saveSnapshot() { return false; }, loadSnapshot() { return null; }, clearSnapshot() { return false; },
      saveFeatures() { return false; }, loadFeatures() { return null; },
      loadAdmin() { return null; }, saveAdmin() { return false; },
      archiveDay() { return false; }, loadDays() { return []; }, archiveSession() { return false; }, loadSessions() { return []; }, close() { }
    };
  }

  let db = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS admin_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_results (
        round_id TEXT PRIMARY KEY, day TEXT NOT NULL, result_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_results (
        day TEXT PRIMARY KEY, round_id TEXT NOT NULL, result_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rounds (
        round_id TEXT PRIMARY KEY,
        finished_at INTEGER NOT NULL,
        finish_reason TEXT NOT NULL,
        alive_count INTEGER NOT NULL,
        roster_json TEXT NOT NULL,
        ranking_json TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS players (
        round_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        faction TEXT NOT NULL,
        alive INTEGER NOT NULL,
        score INTEGER NOT NULL,
        chips INTEGER NOT NULL,
        items_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (round_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rounds_finished ON rounds(finished_at DESC);
      -- 多日长局的整局快照：重启后把玩家与会话原样恢复（实时位置仍靠 15s 一次的快照兜底）。
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        features_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        round_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        players_json TEXT NOT NULL,
        sessions_json TEXT NOT NULL,
        features_json TEXT NOT NULL DEFAULT '{}',
        saved_at INTEGER NOT NULL
      );
    `);
    // 轻量迁移：早于本轮创建的库没有 features_json 列，CREATE TABLE IF NOT EXISTS 不会补列，
    // 会导致 prepared statement 启动即报错（服务直接起不来）。
    try { db.exec("ALTER TABLE snapshot ADD COLUMN features_json TEXT NOT NULL DEFAULT '{}'"); }
    catch { /* 列已存在：正常路径 */ }
    state.enabled = true;
  } catch (error) {
    state.error = String(error && error.message || error);
    db = null;
  }

  const insertRound = db && db.prepare(`
    INSERT INTO rounds (round_id, finished_at, finish_reason, alive_count, roster_json, ranking_json, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(round_id) DO UPDATE SET
      finished_at = excluded.finished_at, finish_reason = excluded.finish_reason,
      alive_count = excluded.alive_count, roster_json = excluded.roster_json,
      ranking_json = excluded.ranking_json, saved_at = excluded.saved_at
  `);
  const upsertPlayer = db && db.prepare(`
    INSERT INTO players (round_id, player_id, name, faction, alive, score, chips, items_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(round_id, player_id) DO UPDATE SET
      name = excluded.name, faction = excluded.faction, alive = excluded.alive,
      score = excluded.score, chips = excluded.chips, items_json = excluded.items_json,
      updated_at = excluded.updated_at
  `);
  const selectLast = db && db.prepare(`SELECT * FROM rounds ORDER BY finished_at DESC LIMIT 1`);
  const upsertSnapshot = db && db.prepare(`
    INSERT INTO snapshot (id, round_id, started_at, players_json, sessions_json, features_json, saved_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      round_id = excluded.round_id, started_at = excluded.started_at,
      players_json = excluded.players_json, sessions_json = excluded.sessions_json, features_json = excluded.features_json,
      saved_at = excluded.saved_at
  `);
  const selectSnapshot = db && db.prepare(`SELECT * FROM snapshot WHERE id = 1`);
  const deleteSnapshot = db && db.prepare(`DELETE FROM snapshot WHERE id = 1`);

  // 整局快照：玩家（去掉 NPC）与会话映射。重启后原样塞回 room，长局不会因为一次发版就从零开始。
  function saveSnapshot(snapshot) {
    if (!state.enabled || !snapshot) return false;
    try {
      const players = (snapshot.players || []).filter(p => p && !p.npc);
      upsertSnapshot.run(String(snapshot.roundId || 'unknown'), Number(snapshot.startedAt) || Date.now(),
        JSON.stringify(players), JSON.stringify(snapshot.sessions || []),
        JSON.stringify(snapshot.features || {}), Date.now());
      return true;
    } catch (error) {
      state.error = String(error && error.message || error);
      return false;
    }
  }
  function loadSnapshot() {
    if (!state.enabled) return null;
    try {
      const row = selectSnapshot.get();
      if (!row) return null;
      return { roundId: row.round_id, startedAt: row.started_at,
        players: JSON.parse(row.players_json || '[]'), sessions: JSON.parse(row.sessions_json || '[]'),
        features: JSON.parse(row.features_json || '{}'), savedAt: row.saved_at };
    } catch (error) {
      state.error = String(error && error.message || error);
      return null;
    }
  }
  // 功能开关的持久化：重启后保留管理页最后一次配置。
  function saveFeatures(json) {
    if (!state.enabled) return false;
    try { upsertSettings.run(JSON.stringify(json || {}), Date.now()); return true; }
    catch (error) { state.error = String(error && error.message || error); return false; }
  }
  function loadFeatures() {
    if (!state.enabled) return null;
    try { const row = selectSettings.get(); return row ? JSON.parse(row.features_json || '{}') : null; }
    catch { return null; }
  }
  function clearSnapshot() {
    if (!state.enabled) return false;
    try { deleteSnapshot.run(); return true; } catch { return false; }
  }

  function saveRound(summary) {
    if (!state.enabled || !summary) return false;
    try {
      insertRound.run(
        String(summary.roundId || 'unknown'),
        Number(summary.finishedAt) || Date.now(),
        String(summary.finishReason || ''),
        Number(summary.aliveCount) || 0,
        JSON.stringify(summary.roster || []),
        JSON.stringify(summary.ranking || []),
        Date.now()
      );
      state.lastRoundId = String(summary.roundId || 'unknown');
      return true;
    } catch (error) {
      state.error = String(error && error.message || error);
      return false;
    }
  }

  function savePlayers(roundId, players) {
    if (!state.enabled || !Array.isArray(players)) return false;
    try {
      db.exec('BEGIN');
      for (const p of players) {
        if (!p || p.npc) continue;
        upsertPlayer.run(
          String(roundId || 'unknown'), Number(p.id), String(p.name || ''),
          String(p.faction || ''), p.alive ? 1 : 0, Number(p.score) || 0,
          Number(p.exploration && p.exploration.chips) || 0,
          JSON.stringify((p.exploration && p.exploration.items) || {}),
          Date.now()
        );
      }
      db.exec('COMMIT');
      return true;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      state.error = String(error && error.message || error);
      return false;
    }
  }

  function loadLastRound() {
    if (!state.enabled) return null;
    try {
      const row = selectLast.get();
      if (!row) return null;
      return {
        roundId: row.round_id,
        finishReason: row.finish_reason,
        finishedAt: row.finished_at,
        aliveCount: row.alive_count,
        roster: JSON.parse(row.roster_json || '[]'),
        ranking: JSON.parse(row.ranking_json || '[]')
      };
    } catch (error) {
      state.error = String(error && error.message || error);
      return null;
    }
  }

  function loadAdmin() {
    if (!state.enabled) return null;
    const row = db.prepare('SELECT state_json FROM admin_state WHERE id=1').get();
    return row ? JSON.parse(row.state_json) : null;
  }
  function saveAdmin(value) {
    if (!state.enabled) return false;
    try {
      db.prepare('INSERT INTO admin_state(id,state_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json').run(JSON.stringify(value));
      return true;
    } catch (error) { state.error = String(error.message || error); return false; }
  }
  // 每日结果不可覆盖，事务内同时记录控制状态，防止重复结算/重启累加。
  function archiveDay(result, control) {
    if (!state.enabled) return false;
    try {
      db.exec('BEGIN IMMEDIATE');
      const old = db.prepare('SELECT round_id FROM daily_results WHERE day=?').get(result.day);
      if (old && old.round_id !== result.roundId) throw new Error('该日期已经结算，不能覆盖');
      db.prepare('INSERT OR IGNORE INTO daily_results(day,round_id,result_json) VALUES(?,?,?)')
        .run(result.day, result.roundId, JSON.stringify(result));
      if (!saveAdmin(control)) throw new Error('保存管理状态失败');
      db.exec('COMMIT'); return true;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { }
      state.error = String(error.message || error); return false;
    }
  }
  function loadDays() {
    if (!state.enabled) return [];
    return db.prepare('SELECT result_json FROM daily_results ORDER BY day DESC').all().map(r => JSON.parse(r.result_json));
  }
  // 场次按round_id幂等，不再以日期为唯一键；旧daily_results只读兼容，不删除不覆盖。
  function archiveSession(result, control) {
    if (!state.enabled) return false;
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('INSERT OR IGNORE INTO session_results(round_id,day,result_json) VALUES(?,?,?)')
        .run(result.roundId, result.day, JSON.stringify(result));
      if (!saveAdmin(control)) throw new Error('保存场次控制状态失败');
      db.exec('COMMIT'); return true;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { }
      state.error = String(error.message || error); return false;
    }
  }
  function loadSessions() {
    if (!state.enabled) return [];
    const recent = db.prepare('SELECT result_json FROM session_results').all().map(r => JSON.parse(r.result_json));
    const seen = new Set(recent.map(r=>r.roundId));
    return [...recent,...loadDays().filter(r=>!seen.has(r.roundId)).map(r=>({...r,label:r.label||'历史每日场',source:r.source||'legacy'}))]
      .sort((a,b)=>b.startedAt-a.startedAt || b.finishedAt-a.finishedAt);
  }
  function close() { try { if (db) db.close(); } catch { /* ignore */ } }

  return { ...state, enabled: state.enabled, file, error: state.error,
    saveRound, savePlayers, loadLastRound, saveSnapshot, loadSnapshot, clearSnapshot, saveFeatures, loadFeatures,
    loadAdmin, saveAdmin, archiveDay, loadDays, archiveSession, loadSessions,
    close, reason: state.error || 'ok' };
}

module.exports = { createStore };
