// 真实答题UI模块的异步生命周期回归：关闭/重开后迟到响应不得串容器，无HTTP或浏览器。
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./public/js/search/loot-grid.js',import.meta.url),'utf8');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS',name); }
const flush = () => new Promise(setImmediate);
function fixture() {
  class Element {
    constructor(tag) {
      this.tagName=tag.toUpperCase();this.className='';this.dataset={};this.style={};
      this.children=[];this.hidden=true;this.disabled=false;this.text='';this.attributes={};
      this.classList={add:name=>{if(!this.className.split(' ').includes(name))this.className+=' '+name;},toggle:(name,on)=>{
        this.className=this.className.split(' ').filter(value=>value!==name).concat(on?[name]:[]).join(' ');
      }};
    }
    set textContent(value) { this.text=String(value);this.children=[]; }
    get textContent() { return this.text+this.children.map(child=>child.textContent).join(''); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.text='';this.children=nodes; }
    setAttribute(name,value) { this.attributes[name]=String(value); }
    querySelectorAll(selector) {
      const matches=[];
      const walk=node=>{for(const child of node.children){if(selector==='button.quiz-option'&&child.tagName==='BUTTON'&&child.className.split(' ').includes('quiz-option'))matches.push(child);walk(child);}};
      walk(this);return matches;
    }
  }
  const elements=new Map(),requests=[],results=[];
  const element=id=>{if(!elements.has(id))elements.set(id,new Element('div'));return elements.get(id);};
  const env={window:{},document:{getElementById:element,createElement:tag=>new Element(tag),addEventListener(){}}};
  vm.runInNewContext(source,env);
  const ui=env.window.SID.lootGrid;
  function open(id) {
    ui.open({containerId:id,containerName:'容器'+id,resumeQuiz:true,commandId:()=>id+'-open',floorFields:()=>({roundId:'r'}),
      api:(url,body)=>new Promise((resolve,reject)=>requests.push({url,body,resolve,reject})),onResult:(exploration,score)=>results.push({id,exploration,score})});
  }
  return {ui,open,element,requests,results};
}
const question = id => ({status:200,ok:true,mode:'quiz',sessionId:'quiz-'+id,quiz:{type:'single',stem:'题目'+id,rewardCoins:2,
  options:[{key:'A',text:'选项A'},{key:'B',text:'选项B'}]},exploration:{searched:[id],pendingQuizContainerIds:[id]},score:0});
await test('迟到开箱成功不覆盖新容器题目、不解除新请求busy，当前响应仍可继续答题',async()=>{
  const f=fixture();f.open('A');f.ui.close();f.open('B');
  f.requests[0].resolve(question('A'));await flush();
  assert.equal(f.element('loot-title').textContent,'容器B');assert.equal(f.element('loot-grid').children.length,0);
  assert.equal(f.ui.pressPrimary(),false);assert.equal(f.requests.length,2);assert.equal(f.results.length,0);
  f.requests[1].resolve(question('B'));await flush();
  assert.equal(f.ui.isQuizActive(),true);assert.match(f.element('loot-grid').textContent,/题目B/);
  assert.ok(!f.element('loot-grid').textContent.includes('题目A'));assert.equal(f.results.length,1);assert.equal(f.results[0].id,'B');
});
await test('迟到开箱异常不污染新容器状态，关闭后当前请求异常也不会重建面板',async()=>{
  const f=fixture();f.open('A');f.ui.close();f.open('B');
  const before=f.element('loot-status').textContent;
  f.requests[0].reject(Error('late A'));await flush();
  assert.equal(f.element('loot-status').textContent,before);assert.equal(f.ui.pressPrimary(),false);
  f.ui.close();f.requests[1].reject(Error('late B'));await flush();assert.equal(f.ui.isOpen(),false);assert.equal(f.results.length,0);
});
await test('迟到答题成功不能结算新容器或锁住新选项，继续题目只提交自身session',async()=>{
  const f=fixture();f.open('A');f.requests[0].resolve(question('A'));await flush();
  f.element('loot-grid').querySelectorAll('button.quiz-option')[0].onclick();
  const answerA=f.element('loot-take').onclick();assert.equal(f.requests[1].body.sessionId,'quiz-A');
  f.ui.close();f.open('B');
  f.requests[1].resolve({status:200,ok:true,correct:true,gained:{points:2},score:2,resultText:'A已结算'});await answerA;await flush();
  assert.equal(f.element('loot-summary').hidden,true);assert.ok(!f.element('loot-status').textContent.includes('A已结算'));
  assert.equal(f.ui.pressPrimary(),false);assert.equal(f.results.length,1,'只有A开箱响应，A迟到答题不能写B回调');
  f.requests[2].resolve(question('B'));await flush();
  const option=f.element('loot-grid').querySelectorAll('button.quiz-option')[1];assert.equal(option.disabled,false);option.onclick();
  const answerB=f.element('loot-take').onclick();assert.equal(f.requests[3].body.sessionId,'quiz-B');assert.equal(f.requests[3].body.answer,'B');
  f.requests[3].resolve({status:200,ok:true,correct:true,gained:{points:2},score:2,exploration:{searched:['B'],pendingQuizContainerIds:[]}});await answerB;
  assert.equal(f.ui.isQuizActive(),false);assert.equal(f.results.length,3);assert.equal(f.results[2].id,'B');
});
await test('迟到答题异常不能解除新容器busy或覆盖恢复提示',async()=>{
  const f=fixture();f.open('A');f.requests[0].resolve(question('A'));await flush();
  f.element('loot-grid').querySelectorAll('button.quiz-option')[0].onclick();const pending=f.element('loot-take').onclick();
  f.ui.close();f.open('B');const before=f.element('loot-status').textContent;
  f.requests[1].reject(Error('late submit'));await pending;
  assert.equal(f.element('loot-status').textContent,before);assert.equal(f.ui.pressPrimary(),false);assert.equal(f.element('loot-take').hidden,true);
  f.requests[2].resolve(question('B'));await flush();assert.equal(f.ui.isQuizActive(),true);
});
console.log(`答题UI生命周期检查 ${passed} PASS；未启动HTTP或Chrome。`);
