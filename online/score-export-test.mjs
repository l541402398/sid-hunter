// 独立XML/ZIP解析和真实鉴权路由调用，不启动HTTP监听/Chrome，不读真实成绩库。
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),{buildScoreExport,MIME}=require('./server/score-export.js'),{createManager}=require('./manager.js'),routes=require('./server/routes/manager.js');
const secret='PRIVATE_SECRET_SHOULD_NOT_EXPORT';
const a={roundId:'round-a',label:'上午 & <场>',day:'2026-10-20',startedAt:Date.parse('2026-10-20T01:00:00Z'),finishedAt:Date.parse('2026-10-20T04:00:00Z'),ranking:[{key:secret,rank:1,name:'=HYPERLINK("https://bad")',score:12,alive:true,sid:secret,traits:{food:secret}},{key:'b',rank:2,name:'张三\u0001 & <同事>',score:3,alive:false},{key:'npc',rank:0,name:'NPC',score:999,npc:true}]};
const b={...a,roundId:'round-b',label:'下午场',ranking:[{rank:1,name:'王五',score:8,alive:true}]};
const state={history:[a,b],dailyRanking:[{rank:1,name:'张三',score:20,sessions:2,key:secret}],totalRanking:[{rank:1,name:'张三',score:30,sessions:3,days:2,key:secret}],config:{}};
const now=Date.parse('2026-10-20T07:00:00Z');
const file=buildScoreExport(state,'round-a',now);assert.equal(file.mime,MIME);assert.equal(file.buffer.readUInt32LE(0),0x04034b50);assert.match(file.fileName,/\.xlsx$/);
// Python标准库为独立解析器：检查ZIP中央目录/CRC、每份XML、sheet关系、字符串/数值/无公式。
const python=`import io,zipfile,xml.etree.ElementTree as ET,sys,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for name in z.namelist(): ET.fromstring(z.read(name))
book=ET.fromstring(z.read('xl/workbook.xml'))
names=[s.attrib['name'] for s in book.findall('m:sheets/m:sheet',ns)]
assert names==['所选场次成绩','今日合计','累计总分','全部场次明细'],names
assert b'PRIVATE_SECRET_SHOULD_NOT_EXPORT' not in b''.join(z.read(n) for n in z.namelist())
rows=[]
for i in range(1,5):
 root=ET.fromstring(z.read('xl/worksheets/sheet%d.xml'%i))
 assert not root.findall('.//m:f',ns)
 assert root.find('m:sheetViews/m:sheetView/m:pane',ns).attrib['state']=='frozen'
 assert root.find('m:autoFilter',ns) is not None
 data=[]
 for row in root.findall('m:sheetData/m:row',ns):
  data.append([c.find('m:is/m:t',ns).text or '' if c.attrib.get('t')=='inlineStr' else float(c.find('m:v',ns).text) for c in row])
 rows.append(data)
assert len(rows[0])==3,rows[0]
assert rows[0][1][0]=='2026-10-20'
assert rows[0][1][1]=='上午 & <场>'
assert rows[0][1][3]=='2026-10-20 09:00:00'
assert rows[0][1][4]=='2026-10-20 12:00:00'
assert rows[0][1][6]=='=HYPERLINK("https://bad")'
assert rows[0][1][7]==12
assert rows[0][2][6]=='张三 & <同事>'
assert rows[1][1][3]==20 and rows[2][1][3]==30
assert len(rows[3])==4
assert all('NPC' not in row for table in rows for row in table)
print('PASS 独立ZIP/CRC/XML解析：4张sheet、北京时间、数值、中文转义、公式文本安全、无NPC和隐私字段')
`;
const parsed=spawnSync('/Users/jiarunwu/.workbuddy/binaries/python/versions/3.13.12/bin/python3',['-c',python],{input:file.buffer,encoding:'utf8'});assert.equal(parsed.status,0,parsed.stdout+parsed.stderr);console.log(parsed.stdout.trim());
assert.throws(()=>buildScoreExport(state,'not-real',now),/请选择/);assert.throws(()=>buildScoreExport({history:[]},'round-a',now),/请选择/);
const empty=buildScoreExport({...state,history:[{...a,ranking:[]}],dailyRanking:[],totalRanking:[]},'round-a',now);assert.ok(empty.buffer.length>1000);
const manager=createManager({room:{},passcode:'test-only-secret',now:()=>now});manager.state=()=>({status:200,body:{activity:state}});
const reqBase={method:'GET',headers:{host:'localhost:1234',origin:'http://localhost:1234'},socket:{remoteAddress:'127.0.0.1'}};
const login=manager.login(reqBase,{code:'test-only-secret'}),cookie=login.cookie.split(';')[0];
async function request(headers={},method='GET',round='round-a'){
 const url=new URL('http://localhost:1234/api/manager/export-scores?roundId='+encodeURIComponent(round));
 const res={status:0,headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);},end(data){this.body=data;}};
 await routes.handle({req:{...reqBase,method,headers:{...reqBase.headers,...headers}},res,url,pathname:url.pathname,MANAGER:manager});return res;
}
try{
 assert.equal((await request()).status,401);
 assert.equal((await request({cookie,'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await request({cookie},'POST')).status,405);
 assert.equal((await request({cookie},'GET','not-real')).status,400);
 const ok=await request({cookie});assert.equal(ok.status,200);assert.equal(ok.headers['Content-Type'],MIME);assert.equal(ok.headers['Cache-Control'],'no-store');assert.equal(ok.headers['X-Content-Type-Options'],'nosniff');assert.match(ok.headers['Content-Disposition'],/attachment; filename=".*\.xlsx"/);assert.ok(Buffer.isBuffer(ok.body));assert.equal(ok.headers['Content-Length'],ok.body.length);
 console.log('PASS 真实管理鉴权导出路由：无会话拒绝、跨站拒绝、方法/场次校验、正确xlsx附件及空表导出；无HTTP服务或浏览器。');
}finally{manager.close();}
