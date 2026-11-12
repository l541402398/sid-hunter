// Exercise the real client spin handler without a browser or a live game server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = (await readFile(new URL('./public/game.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const start = source.indexOf('  async function spinWheel() {');
const end = source.indexOf('\n  }\n', start);
assert(start >= 0 && end > start, 'Client spin handler was not found');
const handler = source.slice(start, end + 5);
const slots = [2, 4, 6, 8, 2, 4, 6, 8].map(amount => ({ kind: 'points', amount }));

function fixture() {
  const button = { disabled: false };
  const result = { status: 200, ok: true, score: 2, games: { wheelDailySpins: 1 },
    wheel: { slots, slotIndex: 0 }, resultText: '获得2积分' };
  const state = {
    wheelOpen: true, wheelTarget: { entityId: 'npc-reception' }, wheelSpinFlight: null,
    me: { score: 0, games: { wheelDailySpins: 0 } }, sessionGeneration: 1,
    sessionToken: 'isolated-test-token', wheelViewGeneration: 1, roundId: 'round-1',
    wheelSlots: null, wheelAnimating: false, wheelResult: '', explorationPanel: null,
    keys: new Set(), lastIntent: '', requests: 0, resultDisplays: 0, scoreDisplays: 0,
    $: () => button, commandId: () => 'client-spin-test', floorFields: () => ({ roundId: 'round-1' }),
    stopIntent: async () => ({ status: 200, ok: true }),
    updateWheelControls() { button.disabled = !!state.wheelSpinFlight || state.wheelAnimating; },
    showWheelResult() { state.resultDisplays++; },
    updateScoreDisplay() { state.scoreDisplays++; },
    syncExploration() {}, buildWheelPool: () => slots,
    api: async () => { state.requests++; return result; },
    animateWheel(items, index, done) { state.completeAnimation = done; }
  };
  runInNewContext(handler + '\nthis.spin = spinWheel;', state);
  return { state, result, button };
}

function holdResponse(state) {
  let respond, entered;
  const requested = new Promise(resolve => { entered = resolve; });
  state.api = () => new Promise(resolve => { state.requests++; respond = resolve; entered(); });
  return { requested, respond: value => respond(value) };
}

test('The HTTP result is applied only after animation when no newer projection arrives', async () => {
  const { state } = fixture();
  await state.spin();
  assert.equal(state.requests, 1);
  assert.equal(state.me.score, 0, 'Client granted points before animation completed');
  assert.equal(state.wheelAnimating, true);
  state.completeAnimation();
  assert.equal(state.me.score, 2);
  assert.equal(state.me.games.wheelDailySpins, 1);
  assert.equal(state.wheelResult, '获得2积分');
  assert.equal(state.wheelAnimating, false);
});

test('A newer private projection survives the end of an older spin animation', async () => {
  const { state } = fixture();
  await state.spin();
  const newer = { score: 12, games: { wheelDailySpins: 1, rpsPending: { id: 'new-game' } }, exploration: { exploreCount: 6 } };
  state.me = newer;
  state.completeAnimation();
  assert.equal(state.me, newer, 'Animation replaced a newer private projection');
  assert.equal(state.me.score, 12);
  assert.equal(state.me.games.rpsPending.id, 'new-game');
  assert.equal(state.me.exploration.exploreCount, 6);
  assert.equal(state.wheelResult, '获得2积分');
});

test('A newer projection received before the HTTP response also remains authoritative', async () => {
  const { state, result } = fixture();
  const response = holdResponse(state);
  const spinning = state.spin();
  await response.requested;
  const newer = { score: 15, games: { wheelDailySpins: 1 } };
  state.me = newer; response.respond(result); await spinning; state.completeAnimation();
  assert.equal(state.me, newer);
});

test('Returning and reopening rejects a response belonging to the previous wheel view', async () => {
  const { state, result } = fixture();
  const response = holdResponse(state);
  const spinning = state.spin(); await response.requested;
  state.wheelViewGeneration++;
  response.respond(result); await spinning;
  assert.equal(state.completeAnimation, undefined);
  assert.equal(state.me.score, 0);
  assert.equal(state.wheelResult, '');
  assert.equal(state.wheelSpinFlight, null);
});

test('A response from a previous round cannot change the current round', async () => {
  const { state, result } = fixture();
  const response = holdResponse(state);
  const spinning = state.spin(); await response.requested;
  state.roundId = 'round-2';
  response.respond(result); await spinning;
  assert.equal(state.completeAnimation, undefined);
  assert.equal(state.me.score, 0);
});

test('Repeated activation sends only one request while a spin is pending or animating', async () => {
  const { state } = fixture();
  const spinning = state.spin();
  await state.spin(); await spinning;
  await state.spin();
  assert.equal(state.requests, 1);
  state.completeAnimation();
});

test('A failed request does not add points or automatically retry', async () => {
  const { state, button } = fixture();
  state.api = async () => { state.requests++; throw Error('Connection lost'); };
  await state.spin();
  assert.equal(state.requests, 1);
  assert.equal(state.me.score, 0);
  assert.equal(state.wheelSpinFlight, null);
  assert.equal(button.disabled, false);
  assert.match(state.wheelResult, /未确认/);
});
