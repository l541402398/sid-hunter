// 客户端异步边界：防连点、旧会话/旧场响应、失败重试与无积分覆盖。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { create } = createRequire(import.meta.url)('./public/js/flowers.js');
function fixture() {
  let context = { me: { id: 1, score: 30, flowers: { received: 0, sentPoints: 0, sentTo: [] } }, roundId: 'r1', generation: 1, finished: false, closed: '' };
  const button = {}, effects = [], messages = [], requests = [];
  function node() { return { style: {}, children: [], setAttribute() {}, append(...children) { this.children.push(...children); }, remove() { const i = effects.indexOf(this); if (i >= 0) effects.splice(i, 1); } }; }
  const doc = { body: { append: n => effects.push(n) }, createElement: node, getElementById: () => button };
  const ui = create({ context: () => context, api: (path, body) => new Promise((resolve, reject) => requests.push({ path, body, resolve, reject })),
    changed() {}, toast: message => messages.push(message), document: doc });
  const target = { id: 2, name: '<img src=x onerror=alert(1)>', flowerRecipient: true, flowersReceived: 0 };
  ui.bind(target);
  return { ui, button, target, effects, messages, requests, get context() { return context; }, set context(value) { context = value; } };
}
test('快速连点只发一笔，成功后按钮已送花，特效文字安全且不改写较新的积分', async () => {
  const f = fixture(), task = f.button.onclick();
  assert.match(f.ui.panelHTML(f.target), /正在送出/);
  await f.button.onclick(); assert.equal(f.requests.length, 1);
  f.context.me.score = 99;
  f.requests[0].resolve({ ok: true, gainedPoints: 2, score: 32 }); await task;
  assert.equal(f.context.me.score, 99);
  assert.match(f.ui.panelHTML(f.target), /已送花/);
  await f.button.onclick(); assert.equal(f.requests.length, 1);
  assert.equal(f.effects.length, 1);
  const dedication = f.effects[0].children.at(-1);
  assert.equal(dedication.children[1].textContent, '向 ' + f.target.name + ' 致敬');
  assert.equal(dedication.children[1].innerHTML, undefined);
  f.ui.clearEffect(); assert.equal(f.effects.length, 0);
});
test('旧场次或旧会话的迟到响应不能弹特效、改按钮或发提示', async () => {
  for (const change of [{ roundId: 'r2' }, { generation: 2 }, { me: { id: 9, flowers: {} } }]) {
    const f = fixture(), task = f.button.onclick();
    f.context = { ...f.context, ...change }; f.ui.synchronize();
    f.requests[0].resolve({ ok: true, gainedPoints: 2 }); await task;
    assert.equal(f.effects.length, 0); assert.deepEqual(f.messages, []); assert.equal(f.ui.sent(f.target), false);
  }
});
test('请求失败不记成功、不自动重试；服务端重复响应不再播放特效', async () => {
  const f = fixture(), first = f.button.onclick();
  f.requests[0].reject(Error('offline')); await first;
  assert.equal(f.ui.sent(f.target), false); assert.equal(f.requests.length, 1);
  const retry = f.button.onclick();
  f.requests[1].resolve({ ok: true, alreadySent: true, gainedPoints: 0 }); await retry;
  assert.equal(f.ui.sent(f.target), true); assert.equal(f.effects.length, 0);
  assert.match(f.messages.at(-1), /已向 TA 献过花/);
});
test('自送、关闭场次、未加入和服务端已送记录均禁用；满额仍允许送花', async () => {
  const f = fixture();
  f.context.me.flowers.sentPoints = 10;
  assert.match(f.ui.panelHTML(f.target), /仍可送出心意/);
  assert(!/id="send-flower"[^>]* disabled/.test(f.ui.panelHTML(f.target)));
  for (const state of [{ finished: true }, { closed: 'paused' }, { me: null }]) {
    const x = fixture(); x.context = { ...x.context, ...state }; await x.button.onclick(); assert.equal(x.requests.length, 0);
  }
  f.context.me.flowers.sentTo = [f.target.id]; await f.button.onclick(); assert.equal(f.requests.length, 0);
  const own = { ...f.target, id: 1 }; assert(!f.ui.panelHTML(own).includes('id="send-flower"'));
});
