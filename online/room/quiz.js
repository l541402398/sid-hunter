'use strict';
// 题库模块（服务端权威）：默认内置第一批「十五五规划」24 道题目（Q0001–Q0024），
// 并支持通过 /manager 管理员面板导入 .xlsx / .csv 题库（增量合并或全量覆盖）及单题启停。
// 注意：正确答案（answer）只保留在服务端内存/数据库，下发给玩家客户端的题目视图（publicQuestionView）绝不包含 answer 字段。

const QUIZ_TYPES = Object.freeze(['single', 'multiple', 'judge']);

const TYPE_LABELS = Object.freeze({
  single: '单选题',
  multiple: '多选题',
  judge: '判断题'
});

const INITIAL_QUIZ_BANK = Object.freeze([
  {"id":"Q0001","category":"十五五规划","type":"single","stem":"根据规划，中心锚定公司“三个业务曲线”战略目标，构建的核心定位是什么？","options":[{"key":"A","text":"三个业务曲线"},{"key":"B","text":"一中心两单元"},{"key":"C","text":"一体两翼"},{"key":"D","text":"双轮驱动"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0002","category":"十五五规划","type":"single","stem":"中心以什么为核心抓手，全力支撑公司航旅数智生态网络高质量发展？","options":[{"key":"A","text":"求稳、求快、求新"},{"key":"B","text":"求新、求精、求实"},{"key":"C","text":"提质、增效、创新"},{"key":"D","text":"稳中求进"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0003","category":"十五五规划","type":"multiple","stem":"推动技术服务模式全面升级，中心将从单一提供“人力资源”的传统模式，向哪些模式协同发力的综合技术服务体系转型？","options":[{"key":"A","text":"“人力资源+智能工具”"},{"key":"B","text":"“智能平台+超级个体”"},{"key":"C","text":"“智能工具+超级平台”"},{"key":"D","text":"“人力资源+业务外包”"}],"answer":["A","B"],"status":"启用","enabled":true},
  {"id":"Q0004","category":"十五五规划","type":"judge","stem":"中心将全面构建“新型软件工程师+智能流水线工具”的人机协同开发新模式，搭建标准化、智能化的软件生产流水线。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0005","category":"十五五规划","type":"single","stem":"航旅数智化生态网络构建的卓越开发中心坚持的发展基调是什么？","options":[{"key":"A","text":"“模式创新、快速响应”"},{"key":"B","text":"“求新突破、市场导向”"},{"key":"C","text":"“求稳固本、提质增效”"},{"key":"D","text":"“服务市场为龙头”"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0006","category":"十五五规划","type":"multiple","stem":"数字化技术服务支撑单元打破传统技术服务的条块分割局限，整合的三大核心能力是什么？","options":[{"key":"A","text":"技术开发"},{"key":"B","text":"业务洞察"},{"key":"C","text":"工程交付"},{"key":"D","text":"市场推广"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0007","category":"十五五规划","type":"judge","stem":"数字化技术服务支撑单元将构建覆盖“需求速判-方案设计-开发交付-运维保障”全链条的全栈技术服务体系。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0008","category":"十五五规划","type":"single","stem":"数字化技术服务支撑单元坚持的发展导向是什么？","options":[{"key":"A","text":"“求稳固本、提质增效”"},{"key":"B","text":"“模式创新、快速响应”"},{"key":"C","text":"“求新突破、市场导向”"},{"key":"D","text":"“求稳、求快、求新”"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0009","category":"十五五规划","type":"single","stem":"新一代信息技术应用创新单元坚持的发展理念是什么？","options":[{"key":"A","text":"“求稳固本、提质增效”"},{"key":"B","text":"“模式创新、快速响应”"},{"key":"C","text":"“求新突破、市场导向”"},{"key":"D","text":"“全面从严、廉洁自律”"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0010","category":"十五五规划","type":"multiple","stem":"新一代信息技术应用创新单元聚焦的新一代信息技术包括哪些？","options":[{"key":"A","text":"人工智能"},{"key":"B","text":"可信计算"},{"key":"C","text":"区块链"},{"key":"D","text":"低空经济"}],"answer":["A","B","C","D"],"status":"启用","enabled":true},
  {"id":"Q0011","category":"十五五规划","type":"judge","stem":"新一代信息技术应用创新单元将打通“技术预研-场景试验-成果转化-市场落地”的全链条创新链路。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0012","category":"十五五规划","type":"multiple","stem":"保障去主机工作提质增速，主要包括以下哪些方面？","options":[{"key":"A","text":"全力保障前端去主机"},{"key":"B","text":"支撑系统去主机"},{"key":"C","text":"支持基础架构去主机"},{"key":"D","text":"全面关停主机系统"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0013","category":"十五五规划","type":"single","stem":"支撑国际运价发布系统建设，需对标哪家机构打造完整的国际运价发布能力？","options":[{"key":"A","text":"IATA"},{"key":"B","text":"SITA"},{"key":"C","text":"ATPCO"},{"key":"D","text":"OAG"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0014","category":"十五五规划","type":"judge","stem":"支撑航旅数智底座建设，将依托区块链存证溯源、隐私计算数据密态协同优势，实现数据可用不可见。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0015","category":"十五五规划","type":"multiple","stem":"建设数智化软件工厂、升级研发生产范式的重点任务包括哪些？","options":[{"key":"A","text":"深化DevSecOps流水线，构建柔性生产能力"},{"key":"B","text":"厚积标准化研发资产，建设组件库与知识体系"},{"key":"C","text":"推进AI赋能人机协同，升级软件生产范式"},{"key":"D","text":"缩减研发资产投入，降低组件复用效益"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0016","category":"十五五规划","type":"judge","stem":"数智化软件工厂将构建“标准化生产+个性化定制”的软件生产模式，实现“周级”与“天级”发布的双模交付。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0017","category":"十五五规划","type":"single","stem":"根据复合型人才队伍建设目标，3年内中高级复合型人才占比将提升至多少？","options":[{"key":"A","text":"30%"},{"key":"B","text":"40%"},{"key":"C","text":"50%"},{"key":"D","text":"60%"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0018","category":"十五五规划","type":"multiple","stem":"建设复合型人才队伍、完善数字化岗位体系的重点举措包括哪些？","options":[{"key":"A","text":"构建“产教融合”的复合型人才培养体系"},{"key":"B","text":"实施高端数字人才精准引进计划"},{"key":"C","text":"建立长效激励机制与职业发展通道"},{"key":"D","text":"取消技术与管理双通道晋升路径"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0019","category":"十五五规划","type":"single","stem":"中心坚持并完善的科技创新体系是什么？","options":[{"key":"A","text":"“三层九要素”"},{"key":"B","text":"“1+5+6+N”"},{"key":"C","text":"“一中心两单元”"},{"key":"D","text":"“三个业务曲线”"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0020","category":"十五五规划","type":"judge","stem":"促进技术创新成果转化应用，中心将建立“创意孵化—MVP验证—试点应用—规模化推广”的漏斗机制。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0021","category":"十五五规划","type":"multiple","stem":"以“三层九要素”为框架推进研发治理体系建设，遵循的三大建设原则是什么？","options":[{"key":"A","text":"问题导向"},{"key":"B","text":"协同发展"},{"key":"C","text":"市场驱动"},{"key":"D","text":"结果导向"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0022","category":"十五五规划","type":"multiple","stem":"研发治理体系“三层九要素”整体框架分为哪三层？","options":[{"key":"A","text":"交付团队层"},{"key":"B","text":"研发平台层"},{"key":"C","text":"组织生态层"},{"key":"D","text":"决策支持层"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0023","category":"十五五规划","type":"single","stem":"研发平台层（PMP）依托的三大要素是什么？","options":[{"key":"A","text":"人员、流程、工具"},{"key":"B","text":"文化、组织、制度"},{"key":"C","text":"专家、机制、技术平台"},{"key":"D","text":"创意、验证、推广"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0024","category":"十五五规划","type":"judge","stem":"组织生态层（COS）统筹文化、组织、制度三大要素。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0025","category":"十五五规划","type":"judge","stem":"交付团队层（PPT）依托专家、机制、技术平台三大要素打通需求到交付全链条价值创造。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0026","category":"十五五规划","type":"multiple","stem":"以高质量党建引领保障中心高质量发展，重点推动的工作包括哪些？","options":[{"key":"A","text":"强化政治建设，践行“两个维护”"},{"key":"B","text":"建强干部队伍，培育组织中坚力量"},{"key":"C","text":"夯实党建基础，提升基层党建质量"},{"key":"D","text":"压缩基层党建工作投入"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0027","category":"十五五规划","type":"multiple","stem":"“十四五”时期，中心在以下哪些方面奠定了坚实的发展基础？","options":[{"key":"A","text":"生产交付"},{"key":"B","text":"安全保障"},{"key":"C","text":"规模扩张"},{"key":"D","text":"区域研发能力"}],"answer":["A","B","D"],"status":"启用","enabled":true},
  {"id":"Q0028","category":"十五五规划","type":"single","stem":"“十四五”时期，中心年度代码修改量稳定在多少行以上？","options":[{"key":"A","text":"1000万行"},{"key":"B","text":"1500万行"},{"key":"C","text":"2000万行"},{"key":"D","text":"2500万行"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0029","category":"十五五规划","type":"single","stem":"“十四五”时期，单元测试分支覆盖率均值从34.4%大幅提升至多少以上？","options":[{"key":"A","text":"50%"},{"key":"B","text":"60%"},{"key":"C","text":"70%"},{"key":"D","text":"80%"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0030","category":"十五五规划","type":"multiple","stem":"以下关于“十四五”时期生产交付质效的表述，正确的有哪些？","options":[{"key":"A","text":"测试用例增至47万余个"},{"key":"B","text":"投产频次从2281次跃升至4180次"},{"key":"C","text":"缺陷遗留率与泄漏率从2%以下降至0"},{"key":"D","text":"一次上线成功率稳定在99%以上"}],"answer":["A","B","C","D"],"status":"启用","enabled":true},
  {"id":"Q0031","category":"十五五规划","type":"judge","stem":"“十四五”时期，中心成功保持“零”自身原因导致的安全事件，年均专项保障超百天。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0032","category":"十五五规划","type":"single","stem":"“十四五”时期，中心软件工程能力获得全球首批哪项认证？","options":[{"key":"A","text":"CMMI3.0 ML5"},{"key":"B","text":"CMMI2.0 ML3"},{"key":"C","text":"ISO9001"},{"key":"D","text":"DevOps成熟度三级"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0033","category":"十五五规划","type":"single","stem":"围绕软件生产流水线，中心探索“AI+软件生产”，推出的智能助手名称是什么？","options":[{"key":"A","text":"懂小生"},{"key":"B","text":"小慧"},{"key":"C","text":"智码"},{"key":"D","text":"云小工"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0034","category":"十五五规划","type":"single","stem":"“十四五”时期，Quicken系列智能辅助工具集累计生成超多少行代码？","options":[{"key":"A","text":"590万行"},{"key":"B","text":"690万行"},{"key":"C","text":"790万行"},{"key":"D","text":"890万行"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0035","category":"十五五规划","type":"single","stem":"“十四五”时期，中心提交专利多少项？","options":[{"key":"A","text":"92项"},{"key":"B","text":"102项"},{"key":"C","text":"106项"},{"key":"D","text":"39项"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0036","category":"十五五规划","type":"multiple","stem":"“十四五”时期，中心搭建的开发、办公及创新三个云平台包括哪些？","options":[{"key":"A","text":"开发云平台"},{"key":"B","text":"办公云平台"},{"key":"C","text":"创新云平台"},{"key":"D","text":"生产云平台"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0037","category":"十五五规划","type":"judge","stem":"“十四五”时期，中心建成现代化桌面云机房，核心网络带宽升至千兆。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0038","category":"十五五规划","type":"single","stem":"“十四五”时期，软件专业资质认证持有率从57%跃升至多少？","options":[{"key":"A","text":"81.65%"},{"key":"B","text":"86.65%"},{"key":"C","text":"91.65%"},{"key":"D","text":"95.65%"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0039","category":"十五五规划","type":"multiple","stem":"回顾“十四五”改革发展实践，中心深刻认识到推动组织持续进阶的核心经验包括以下哪些维度？","options":[{"key":"A","text":"战略方向上增强国家思维，全面加强党的领导"},{"key":"B","text":"组织形态上坚持协同共治，塑造“扁平柔性、协同高效、平台共治”的组织生态"},{"key":"C","text":"思想方法上树立系统观念，践行“体系化设计、结构化统筹、制度化保障、平台化支撑”的工作方法"},{"key":"D","text":"能力成长上坚持规模扩张优先"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0040","category":"十五五规划","type":"multiple","stem":"关于三色基因文化的内涵，以下表述正确的有哪些？","options":[{"key":"A","text":"红色是根本，聚焦党建引领、文化聚力"},{"key":"B","text":"蓝色是CQRD核心价值观的主要体现，坚持创新驱动发展"},{"key":"C","text":"绿色是践行高效能运营、低成本管控的重要内涵"},{"key":"D","text":"黄色是践行市场开拓的重要内涵"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0041","category":"十五五规划","type":"multiple","stem":"“十四五”期间，中心面临的突出问题包括哪些？","options":[{"key":"A","text":"软件开发质效与公司要求和行业先进之间还存在差距"},{"key":"B","text":"支撑公司“一转型、两加快”方面存在能力差距"},{"key":"C","text":"队伍思维转变不够快，数字思维、产品思维还不足"},{"key":"D","text":"中高级岗占比过低"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0042","category":"十五五规划","type":"single","stem":"对标高效能团队“1天内”的基准，当前中心部署频率中位数为多少？","options":[{"key":"A","text":"5次/月"},{"key":"B","text":"10次/月"},{"key":"C","text":"30次/月"},{"key":"D","text":"50次/月"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0043","category":"十五五规划","type":"single","stem":"国家明确民航领域“新质生产力”发展要求，以什么为核心路径？","options":[{"key":"A","text":"“人工智能+”、“数据要素×”"},{"key":"B","text":"“大数据+”、“算力网×”"},{"key":"C","text":"“区块链+”、“元宇宙×”"},{"key":"D","text":"“物联网+”、“5G×”"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0044","category":"十五五规划","type":"multiple","stem":"民航核心业务领域亟须构建的OOSD全流程解决方案涵盖哪些环节？","options":[{"key":"A","text":"订单管理"},{"key":"B","text":"精准报价"},{"key":"C","text":"高效结算"},{"key":"D","text":"便捷交付"}],"answer":["A","B","C","D"],"status":"启用","enabled":true},
  {"id":"Q0045","category":"十五五规划","type":"judge","stem":"国家正全力推动数据基础制度建设，破解数据“确权难、定价难、流通难”的困局。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0046","category":"十五五规划","type":"judge","stem":"人工智能正从“赋能工具”跃升为“核心生产范式”，未来五年内研发模式必须向“人机协同”的智能研发转型。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0047","category":"十五五规划","type":"judge","stem":"“十四五”时期，区块链技术支撑“航旅链”电子票据等场景，链上交易量突破3000万，服务超百家企业。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0048","category":"十五五规划","type":"single","stem":"中心发展的指导思想是（ ）。","options":[{"key":"A","text":"习近平新时代中国特色社会主义思想"},{"key":"B","text":"科学技术是第一生产力"},{"key":"C","text":"社会主义市场经济理论"},{"key":"D","text":"创新驱动发展战略"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0049","category":"十五五规划","type":"single","stem":"指导思想明确，要坚持以（ ）为中心的发展思想。","options":[{"key":"A","text":"效益"},{"key":"B","text":"人民"},{"key":"C","text":"规模"},{"key":"D","text":"技术"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0050","category":"十五五规划","type":"single","stem":"指导思想要求全面贯彻（ ）精神。","options":[{"key":"A","text":"党的十九大和十九届历次全会"},{"key":"B","text":"党的二十大和二十届历次全会"},{"key":"C","text":"党的十八大和十八届历次全会"},{"key":"D","text":"党的二十大和十九届历次全会"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0051","category":"十五五规划","type":"single","stem":"指导思想明确，中心发展的主题是（ ）。","options":[{"key":"A","text":"全面从严治党"},{"key":"B","text":"改革创新"},{"key":"C","text":"推动中心高质量发展"},{"key":"D","text":"培育发展新质生产力"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0052","category":"十五五规划","type":"single","stem":"指导思想明确，中心发展的重点是（ ）。","options":[{"key":"A","text":"培育发展新质生产力"},{"key":"B","text":"增加传统运维业务数量"},{"key":"C","text":"扩大专项资源投入规模"},{"key":"D","text":"拓展行政管理职能"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0053","category":"十五五规划","type":"single","stem":"指导思想明确，中心发展的根本动力是（ ）。","options":[{"key":"A","text":"规模扩张"},{"key":"B","text":"业务外包"},{"key":"C","text":"改革创新"},{"key":"D","text":"资源集中"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0054","category":"十五五规划","type":"single","stem":"指导思想明确，中心发展的根本保障是（ ）。","options":[{"key":"A","text":"扩大研发人员规模"},{"key":"B","text":"增加市场宣传投入"},{"key":"C","text":"提高项目承接数量"},{"key":"D","text":"全面从严治党"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0055","category":"十五五规划","type":"single","stem":"指导思想明确的总目标是（ ）。","options":[{"key":"A","text":"将公司建设为以传统软件外包为主的信息服务企业"},{"key":"B","text":"将中心建设为全国最大的通用软件销售平台"},{"key":"C","text":"将中心建设为独立运营的综合交通运输企业"},{"key":"D","text":"助力公司建成世界一流的航旅综合智能信息服务企业"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0056","category":"十五五规划","type":"single","stem":"指导思想要求，中心应切实增强核心功能、提升（ ）。","options":[{"key":"A","text":"固定资产规模"},{"key":"B","text":"核心竞争力"},{"key":"C","text":"外包业务占比"},{"key":"D","text":"行政审批能力"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0057","category":"十五五规划","type":"single","stem":"指导思想提出，要培育（ ）。","options":[{"key":"A","text":"新型复合软件工程师"},{"key":"B","text":"专职硬件销售人员"},{"key":"C","text":"通用行政事务专员"},{"key":"D","text":"传统单一运维工程师"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0058","category":"十五五规划","type":"single","stem":"指导思想提出，加快推进研发治理体系与治理能力（ ）。","options":[{"key":"A","text":"专业化"},{"key":"B","text":"集中外包化"},{"key":"C","text":"单一化"},{"key":"D","text":"粗放化"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0059","category":"十五五规划","type":"single","stem":"指导思想提出，要加速升级（ ）。","options":[{"key":"A","text":"线下行政审批模式"},{"key":"B","text":"软件开发新范式"},{"key":"C","text":"传统软件采购模式"},{"key":"D","text":"硬件渠道销售模式"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0060","category":"十五五规划","type":"single","stem":"“坚持党的全面领导”要求提高党（ ）的能力。","options":[{"key":"A","text":"定价格、拓渠道、增销量"},{"key":"B","text":"管项目、抓采购、做营销"},{"key":"C","text":"管资产、增投资、扩规模"},{"key":"D","text":"把方向、谋大局、促改革"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0061","category":"十五五规划","type":"single","stem":"“坚持服务公司战略”要求紧扣公司（ ）总体发展思路。","options":[{"key":"A","text":"一三五九"},{"key":"B","text":"一三五七"},{"key":"C","text":"一四五九"},{"key":"D","text":"一二三四"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0062","category":"十五五规划","type":"single","stem":"“坚持服务公司战略”提出，要强化（ ）。","options":[{"key":"A","text":"短期指标与单点考核"},{"key":"B","text":"战略解码与执行闭环"},{"key":"C","text":"资源堆积与规模扩张"},{"key":"D","text":"部门分割与独立决策"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0063","category":"十五五规划","type":"single","stem":"“坚持创新驱动发展”将（ ）作为中心改革发展和技术进步的源动力。","options":[{"key":"A","text":"外包比例"},{"key":"B","text":"人员数量"},{"key":"C","text":"创新"},{"key":"D","text":"投资规模"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0064","category":"十五五规划","type":"single","stem":"“坚持全面深化改革”要求强化（ ）导向。","options":[{"key":"A","text":"行政化、同质化、粗放化"},{"key":"B","text":"规模化、单一化、封闭化"},{"key":"C","text":"市场化、专业化、规范化"},{"key":"D","text":"短期化、部门化、形式化"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0065","category":"十五五规划","type":"single","stem":"“坚守安全合规底线”提出的发展与安全的关系是（ ）。","options":[{"key":"A","text":"先完成发展任务，再集中解决安全问题"},{"key":"B","text":"业务发展与安全管理分别推进、互不关联"},{"key":"C","text":"在发展中固安全，在安全中谋发展"},{"key":"D","text":"以业务增长速度决定是否开展安全建设"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0066","category":"十五五规划","type":"single","stem":"“坚守安全合规底线”要求强化（ ）的风险防控。","options":[{"key":"A","text":"研发过程关键环节"},{"key":"B","text":"仅项目交付后的运维阶段"},{"key":"C","text":"仅市场推广环节"},{"key":"D","text":"仅项目立项前的预算阶段"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0067","category":"十五五规划","type":"single","stem":"“坚持党的全面领导”要求推动党建工作与（ ）深度融合、同频共振。","options":[{"key":"A","text":"中心业务"},{"key":"B","text":"硬件销售"},{"key":"C","text":"行政审批流程"},{"key":"D","text":"社会公益项目"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0068","category":"十五五规划","type":"single","stem":"中心的使命是（ ）。","options":[{"key":"A","text":"以通用软件销售服务市场扩张，让软件采购成本更低"},{"key":"B","text":"以规模化资源投入服务外包业务，让项目交付数量更多"},{"key":"C","text":"以基础设施托管服务渠道建设，让渠道覆盖范围更广"},{"key":"D","text":"卓越的自主可控技术服务公司战略，让旅客出行体验更美好"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0069","category":"十五五规划","type":"single","stem":"传承“绿色基因”对应的使命定位是（ ）。","options":[{"key":"A","text":"公司战略落地的重要技术力量"},{"key":"B","text":"软件生产技术创新的先行者"},{"key":"C","text":"公司传统资源采购的组织者"},{"key":"D","text":"航旅数智生态网络建设的排头兵"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0070","category":"十五五规划","type":"single","stem":"传承“蓝色基因”对应的使命定位是（ ）。","options":[{"key":"A","text":"公司战略落地的重要技术力量"},{"key":"B","text":"软件生产技术创新的先行者"},{"key":"C","text":"公司传统资源采购的组织者"},{"key":"D","text":"航旅数智生态网络建设的排头兵"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0071","category":"十五五规划","type":"single","stem":"传承“红色基因”对应的使命定位是（ ）。","options":[{"key":"A","text":"公司战略落地的重要技术力量"},{"key":"B","text":"公司传统资源采购的组织者"},{"key":"C","text":"软件生产技术创新的先行者"},{"key":"D","text":"航旅数智生态网络建设的排头兵"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0072","category":"十五五规划","type":"single","stem":"“航旅数智生态网络建设的排头兵”定位要求深耕的研发赛道是（ ）。","options":[{"key":"A","text":"传统渠道销售管理"},{"key":"B","text":"地产信息化建设"},{"key":"C","text":"通用消费硬件制造"},{"key":"D","text":"航旅智能服务研发"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0073","category":"十五五规划","type":"single","stem":"“软件生产技术创新的先行者”定位提出，要培育（ ）。","options":[{"key":"A","text":"单一硬件制造能力"},{"key":"B","text":"传统资源堆积能力"},{"key":"C","text":"数字化新质生产力"},{"key":"D","text":"劳动密集型外包生产力"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0074","category":"十五五规划","type":"single","stem":"“公司战略落地的重要技术力量”定位要求搭建（ ）。","options":[{"key":"A","text":"完全依赖外部厂商的通用软件销售平台"},{"key":"B","text":"面向非航旅领域的硬件分销网络"},{"key":"C","text":"以线下人工服务为主的业务受理中心"},{"key":"D","text":"全栈自主可控航旅数智底座"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0075","category":"十五五规划","type":"single","stem":"“公司战略落地的重要技术力量”定位提出，以（ ）承接公司各项战略部署。","options":[{"key":"A","text":"专项研发能力"},{"key":"B","text":"行政审批能力"},{"key":"C","text":"硬件采购能力"},{"key":"D","text":"渠道分销能力"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0076","category":"十五五规划","type":"single","stem":"“一三五九”规划思路中，打造“九大治理要素”是为了构建（ ）。","options":[{"key":"A","text":"通用行政审批框架"},{"key":"B","text":"专业化研发治理框架"},{"key":"C","text":"传统资源采购管理框架"},{"key":"D","text":"单一市场营销框架"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0077","category":"十五五规划","type":"single","stem":"到“十五五”末，重庆研发中心要实现的跃升是（ ）。","options":[{"key":"A","text":"从“数字技术服务中心”向“硬件采购中心”跃升"},{"key":"B","text":"从“专项资源中心”向“渠道销售中心”跃升"},{"key":"C","text":"从“数字技术服务中心”向“专项资源中心”跃升"},{"key":"D","text":"从“专项资源中心”向“数字技术服务中心”跃升"}],"answer":"D","status":"启用","enabled":true},
  {"id":"Q0078","category":"十五五规划","type":"single","stem":"“主要目标”明确，到“十五五”末形成的技术服务格局是（ ）。","options":[{"key":"A","text":"资源采购＋硬件销售＋渠道扩张"},{"key":"B","text":"项目外包＋人员派遣＋规模扩张"},{"key":"C","text":"软件生产＋工程输出＋价值创造"},{"key":"D","text":"系统维护＋行政审批＋资产管理"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0079","category":"十五五规划","type":"single","stem":"“主要目标”明确，要建设卓越的（ ）。","options":[{"key":"A","text":"传统渠道分销中心"},{"key":"B","text":"综合行政服务中心"},{"key":"C","text":"航旅数智化开发中心"},{"key":"D","text":"通用硬件制造中心"}],"answer":"C","status":"启用","enabled":true},
  {"id":"Q0080","category":"十五五规划","type":"multiple","stem":"指导思想中提出的“三个”相关要求包括哪些？","options":[{"key":"A","text":"做好“三个服务”"},{"key":"B","text":"争当“三个排头兵”"},{"key":"C","text":"充分发挥“三个作用”"},{"key":"D","text":"打造“三个销售平台”"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0081","category":"十五五规划","type":"multiple","stem":"指导思想中提出的加速推进事项包括哪些？","options":[{"key":"A","text":"升级软件开发新范式"},{"key":"B","text":"全面数智化转型"},{"key":"C","text":"培育新型复合软件工程师"},{"key":"D","text":"扩大传统资源堆积规模"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0082","category":"十五五规划","type":"multiple","stem":"下列哪些属于原文明确提出的基本原则？","options":[{"key":"A","text":"坚持服务公司战略"},{"key":"B","text":"坚持以扩大资源投入规模为首要原则"},{"key":"C","text":"坚守安全合规底线"},{"key":"D","text":"坚持党的全面领导"}],"answer":["A","C","D"],"status":"启用","enabled":true},
  {"id":"Q0083","category":"十五五规划","type":"multiple","stem":"“坚持党的全面领导”明确提出了哪些要求？","options":[{"key":"A","text":"以全面从严治党引领保障中心高质量发展行稳致远"},{"key":"B","text":"坚决维护党中央权威和集中统一领导"},{"key":"C","text":"把党的领导贯穿中心发展各方面全过程"},{"key":"D","text":"将党建工作与中心业务分别推进、互不关联"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0084","category":"十五五规划","type":"multiple","stem":"“坚持服务公司战略”要求紧扣的内容包括哪些？","options":[{"key":"A","text":"建设世界一流航旅综合智能信息服务企业的战略目标"},{"key":"B","text":"以部门短期收益替代公司战略方向"},{"key":"C","text":"以传统软件外包规模作为公司唯一战略目标"},{"key":"D","text":"公司“一三五七”总体发展思路"}],"answer":["A","D"],"status":"启用","enabled":true},
  {"id":"Q0085","category":"十五五规划","type":"multiple","stem":"“坚持创新驱动发展”明确提出的举措包括哪些？","options":[{"key":"A","text":"以引入成熟软件产品替代重点研发项目布局"},{"key":"B","text":"布局重点研发项目"},{"key":"C","text":"整合内外部创新资源"},{"key":"D","text":"完善创新生态体系"}],"answer":["B","C","D"],"status":"启用","enabled":true},
  {"id":"Q0086","category":"十五五规划","type":"multiple","stem":"“坚持全面深化改革”明确提出的举措包括哪些？","options":[{"key":"A","text":"持续深化体制机制改革"},{"key":"B","text":"优化治理体系、提升治理效能，激发各类要素活力"},{"key":"C","text":"固化现有治理模式并收缩开放合作范围"},{"key":"D","text":"主动拓展开放合作维度，构建协同联动、互利共赢的发展格局"}],"answer":["A","B","D"],"status":"启用","enabled":true},
  {"id":"Q0087","category":"十五五规划","type":"multiple","stem":"“坚守安全合规底线”明确提出的要求包括哪些？","options":[{"key":"A","text":"树牢安全发展理念"},{"key":"B","text":"有效防范化解安全风险"},{"key":"C","text":"强化底线思维，加强安全体系建设"},{"key":"D","text":"将安全风险防控集中在最终验收阶段"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0088","category":"十五五规划","type":"multiple","stem":"中心致力于成为的三项使命定位包括哪些？","options":[{"key":"A","text":"航旅数智生态网络建设的排头兵"},{"key":"B","text":"公司战略落地的重要技术力量"},{"key":"C","text":"软件生产技术创新的先行者"},{"key":"D","text":"公司生产系统统一运营管理中心"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0089","category":"十五五规划","type":"multiple","stem":"“航旅数智生态网络建设的排头兵”定位明确提出，要实现哪些行业和出行服务成效？","options":[{"key":"A","text":"赋能民航上下游共建共生共赢数字生态"},{"key":"B","text":"以通用硬件制造替代软件研发核心职能"},{"key":"C","text":"以独立封闭的平台替代民航上下游生态协同"},{"key":"D","text":"助力行业提质增效、服务群众美好出行"}],"answer":["A","D"],"status":"启用","enabled":true},
  {"id":"Q0090","category":"十五五规划","type":"multiple","stem":"“软件生产技术创新的先行者”定位明确提出的工作内容包括哪些？","options":[{"key":"A","text":"攻坚航旅核心软件自研、前沿技术攻关"},{"key":"B","text":"推动科创与民航产业融合"},{"key":"C","text":"以传统人力资源外包替代核心软件自研"},{"key":"D","text":"锚定科创赋能主业"}],"answer":["A","B","D"],"status":"启用","enabled":true},
  {"id":"Q0091","category":"十五五规划","type":"multiple","stem":"“公司战略落地的重要技术力量”定位明确提出的要求包括哪些？","options":[{"key":"A","text":"承载公司重要信息基础设施运营服务国家队使命"},{"key":"B","text":"保障公司战略闭环落地"},{"key":"C","text":"以部门自主项目替代公司各项战略部署"},{"key":"D","text":"坚守央企政治担当"}],"answer":["A","B","D"],"status":"启用","enabled":true},
  {"id":"Q0092","category":"十五五规划","type":"multiple","stem":"下列基因与使命定位的对应关系，哪些符合原文？","options":[{"key":"A","text":"绿色基因——航旅数智生态网络建设的排头兵"},{"key":"B","text":"蓝色基因——软件生产技术创新的先行者"},{"key":"C","text":"红色基因——公司战略落地的重要技术力量"},{"key":"D","text":"红色基因——软件生产技术创新的先行者"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0093","category":"十五五规划","type":"multiple","stem":"重庆研发中心“一三五九”规划思路具体包括哪些内容？","options":[{"key":"A","text":"三个发展方向"},{"key":"B","text":"打造“九大治理要素”的专业化研发治理框架"},{"key":"C","text":"一个总体目标"},{"key":"D","text":"五项重点任务"}],"answer":["A","B","C","D"],"status":"启用","enabled":true},
  {"id":"Q0094","category":"十五五规划","type":"multiple","stem":"关于到“十五五”末的主要目标，下列哪些表述符合原文？","options":[{"key":"A","text":"实现从“专项资源中心”向“数字技术服务中心”的跃升"},{"key":"B","text":"形成“软件生产＋工程输出＋价值创造”的技术服务格局"},{"key":"C","text":"转型为以通用硬件制造和销售为主的中心"},{"key":"D","text":"建设卓越的航旅数智化开发中心"}],"answer":["A","B","D"],"status":"启用","enabled":true},
  {"id":"Q0095","category":"十五五规划","type":"multiple","stem":"指导思想对中心核心能力建设明确提出了哪些要求？","options":[{"key":"A","text":"提升核心竞争力"},{"key":"B","text":"切实增强中心核心功能"},{"key":"C","text":"以资源投入规模作为核心竞争力的唯一指标"},{"key":"D","text":"以行政审批权限扩张作为核心功能建设重点"}],"answer":["A","B"],"status":"启用","enabled":true},
  {"id":"Q0096","category":"十五五规划","type":"multiple","stem":"下列关于三色基因作用的表述，哪些符合原文？","options":[{"key":"A","text":"传承“红色基因”铸魂"},{"key":"B","text":"传承“蓝色基因”铸魂"},{"key":"C","text":"传承“蓝色基因”固本"},{"key":"D","text":"传承“绿色基因”立身"}],"answer":["A","C","D"],"status":"启用","enabled":true},
  {"id":"Q0097","category":"十五五规划","type":"multiple","stem":"三项使命定位分别承接、赋能或承载了公司的哪些使命？","options":[{"key":"A","text":"国家战略重要科技力量使命"},{"key":"B","text":"航旅数智生态网络主力军使命"},{"key":"C","text":"通用消费硬件制造主力军使命"},{"key":"D","text":"重要信息基础设施运营服务国家队使命"}],"answer":["A","B","D"],"status":"启用","enabled":true},
  {"id":"Q0098","category":"十五五规划","type":"judge","stem":"公司总体发展思路为“一三五七”，重庆研发中心“十五五”规划思路为“一三五九”。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0099","category":"十五五规划","type":"judge","stem":"指导思想将规模扩张作为中心发展的根本动力。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0100","category":"十五五规划","type":"judge","stem":"指导思想将全面从严治党作为中心发展的根本保障。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0101","category":"十五五规划","type":"judge","stem":"研发过程的安全风险防控只需在项目交付后开展。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0102","category":"十五五规划","type":"judge","stem":"“坚持创新驱动发展”要求整合内外部创新资源，布局重点研发项目，完善创新生态体系。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0103","category":"十五五规划","type":"judge","stem":"“航旅数智生态网络建设的排头兵”定位对应传承“蓝色基因”。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0104","category":"十五五规划","type":"judge","stem":"“公司战略落地的重要技术力量”定位要求搭建全栈自主可控航旅数智底座。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0105","category":"十五五规划","type":"judge","stem":"到“十五五”末，中心要实现从“数字技术服务中心”向“专项资源中心”的跃升。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0106","category":"十五五规划","type":"judge","stem":"“一三五九”中的“三”和“五”分别指三项重点任务、五个发展方向。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"F","status":"启用","enabled":true},
  {"id":"Q0107","category":"十五五规划","type":"judge","stem":"到“十五五”末，中心要形成“软件生产＋工程输出＋价值创造”的技术服务格局。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0108","category":"中心文化","type":"single","stem":"公司的愿景是什么？","options":[{"key":"A","text":"建成世界一流的航旅综合智能信息服务企业"},{"key":"B","text":"让航旅出行更智慧"},{"key":"C","text":"成为航旅数字生态网络的主力军"},{"key":"D","text":"打造行业领先的技术研发平台"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0109","category":"中心文化","type":"multiple","stem":"公司的使命包括以下哪些内容？","options":[{"key":"A","text":"重要信息基础设施运营服务的国家队"},{"key":"B","text":"航旅数字生态网络的主力军"},{"key":"C","text":"国家战略的重要科技力量"},{"key":"D","text":"行业标准的主要制定者"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0110","category":"中心文化","type":"multiple","stem":"公司的价值观包括以下哪些内容？","options":[{"key":"A","text":"使命引领"},{"key":"B","text":"价值创新"},{"key":"C","text":"生态共建"},{"key":"D","text":"务实笃行"}],"answer":["A","B","C","D"],"status":"启用","enabled":true},
  {"id":"Q0111","category":"中心文化","type":"single","stem":"公司的目标是什么？","options":[{"key":"A","text":"让航旅出行更智慧"},{"key":"B","text":"建成世界一流的航旅综合智能信息服务企业"},{"key":"C","text":"成为重要信息基础设施运营服务的国家队"},{"key":"D","text":"引领民航行业数字化转型"}],"answer":"B","status":"启用","enabled":true},
  {"id":"Q0112","category":"中心文化","type":"multiple","stem":"公司的文化基因包括以下哪些表述？","options":[{"key":"A","text":"根脉深植——红色基因铸魂"},{"key":"B","text":"创新驱动——蓝色基因立身"},{"key":"C","text":"根植产业——绿色基因固本"},{"key":"D","text":"规模领先——金色基因赋能"}],"answer":["A","B","C"],"status":"启用","enabled":true},
  {"id":"Q0113","category":"中心文化","type":"single","stem":"文化基因中，“红色基因”对应的关键词是什么？","options":[{"key":"A","text":"铸魂"},{"key":"B","text":"立身"},{"key":"C","text":"固本"},{"key":"D","text":"强基"}],"answer":"A","status":"启用","enabled":true},
  {"id":"Q0114","category":"中心文化","type":"judge","stem":"“创新驱动——蓝色基因立身”的表述符合公司文化基因的定义。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true},
  {"id":"Q0115","category":"中心文化","type":"judge","stem":"“根植产业——绿色基因固本”的表述符合公司文化基因的定义。","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"answer":"T","status":"启用","enabled":true}
]);

function cloneQuestion(q) {
  const enabled = q.enabled !== false && q.status !== '停用';
  return {
    id: String(q.id || ''),
    category: String(q.category || '十五五规划'),
    type: q.type,
    stem: String(q.stem || ''),
    options: Array.isArray(q.options) ? q.options.map(o => ({ key: String(o.key), text: String(o.text ?? '') })) : [],
    answer: Array.isArray(q.answer) ? q.answer.slice() : String(q.answer || ''),
    explanation: String(q.explanation || ''),
    status: enabled ? '启用' : '停用',
    enabled
  };
}

let activeBank = INITIAL_QUIZ_BANK.map(cloneQuestion);

function getQuizBank() {
  return activeBank.map(cloneQuestion);
}

function getEnabledQuizBank() {
  return activeBank.filter(q => q.enabled !== false && q.status !== '停用');
}

function setQuizBank(questions) {
  if (!Array.isArray(questions) || !questions.length) return activeBank.length;
  activeBank = questions.map(cloneQuestion);
  return activeBank.length;
}

function importQuizQuestions(questions, { mode = 'merge' } = {}) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error('没有可导入的题目');
  }
  const normalized = questions.map(cloneQuestion);
  let added = 0;
  let updated = 0;
  if (mode === 'replace') {
    added = normalized.length;
    activeBank = normalized;
  } else {
    const indexById = new Map(activeBank.map((q, idx) => [q.id, idx]));
    for (const q of normalized) {
      if (indexById.has(q.id)) {
        activeBank[indexById.get(q.id)] = q;
        updated++;
      } else {
        indexById.set(q.id, activeBank.length);
        activeBank.push(q);
        added++;
      }
    }
  }
  return {
    added,
    updated,
    importedCount: normalized.length,
    totalCount: activeBank.length,
    enabledCount: getEnabledQuizBank().length
  };
}

function toggleQuestionStatus(id, enabled) {
  const target = activeBank.find(q => q.id === String(id || ''));
  if (!target) return null;
  const nextEnabled = typeof enabled === 'boolean' ? enabled : !target.enabled;
  target.enabled = nextEnabled;
  target.status = nextEnabled ? '启用' : '停用';
  return cloneQuestion(target);
}

function quizSummary() {
  const enabled = getEnabledQuizBank();
  const byType = { single: 0, multiple: 0, judge: 0 };
  const categories = new Set();
  for (const q of activeBank) {
    if (byType[q.type] !== undefined) byType[q.type]++;
    if (q.category) categories.add(q.category);
  }
  return {
    total: activeBank.length,
    enabled: enabled.length,
    disabled: activeBank.length - enabled.length,
    byType,
    categories: [...categories]
  };
}

function pickQuizQuestion(rng, preferredType = null) {
  const rand = typeof rng === 'function' ? rng : max => Math.floor(Math.random() * max);
  const enabledPool = getEnabledQuizBank();
  const basePool = enabledPool.length ? enabledPool : (activeBank.length ? activeBank : INITIAL_QUIZ_BANK);
  const filtered = (preferredType && QUIZ_TYPES.includes(preferredType))
    ? basePool.filter(q => q.type === preferredType)
    : basePool;
  const pool = filtered.length ? filtered : basePool;
  const idx = Math.max(0, Math.min(pool.length - 1, Number(rand(pool.length)) || 0));
  return pool[idx];
}

function publicQuestionView(question, rewardCoins = 3) {
  if (!question) return null;
  return {
    id: question.id,
    category: question.category || '',
    type: question.type,
    typeLabel: TYPE_LABELS[question.type] || '答题',
    stem: question.stem,
    question: question.stem,
    options: question.options.map(o => ({ key: o.key, text: o.text })),
    rewardCoins: Number(rewardCoins) || 0
  };
}

function normalizeQuizAnswer(type, input) {
  if (input === null || input === undefined) return '';
  if (type === 'judge') {
    const raw = Array.isArray(input) ? String(input[0] ?? '') : String(input);
    const v = raw.trim().toUpperCase();
    if (['T', 'TRUE', '1', 'YES', 'Y', '对', '正确', 'A'].includes(v)) return 'T';
    if (['F', 'FALSE', '0', 'NO', 'N', '错', '错误', 'B'].includes(v)) return 'F';
    return '';
  }
  if (type === 'single') {
    const raw = Array.isArray(input) ? (input.length === 1 ? String(input[0]) : '') : String(input);
    const v = raw.trim().toUpperCase();
    return /^[A-Z]$/.test(v) ? v : '';
  }
  if (type === 'multiple') {
    let arr = [];
    if (Array.isArray(input)) {
      arr = input.map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
    } else if (typeof input === 'string') {
      const cleaned = input.trim().toUpperCase();
      arr = cleaned.includes(',') || cleaned.includes(' ')
        ? cleaned.split(/[\s,，;；]+/).filter(Boolean)
        : cleaned.split('').filter(c => /^[A-Z]$/.test(c));
    }
    const unique = [...new Set(arr.filter(c => /^[A-Z]$/.test(c)))].sort();
    return unique.length > 0 ? unique.join('') : '';
  }
  return '';
}

function formatCorrectAnswer(question) {
  if (!question) return '';
  if (question.type === 'judge') {
    return question.answer === 'T' ? '正确' : '错误';
  }
  if (question.type === 'multiple' && Array.isArray(question.answer)) {
    return question.answer.slice().sort().join('');
  }
  return String(question.answer || '');
}

function checkQuizAnswer(question, userInput) {
  if (!question) return { valid: false, correct: false, normalized: '', correctAnswer: '', explanation: '' };
  const normalized = normalizeQuizAnswer(question.type, userInput);
  if (!normalized) {
    return {
      valid: false,
      correct: false,
      normalized: '',
      correctAnswer: formatCorrectAnswer(question),
      explanation: question.explanation || ''
    };
  }
  const expected = normalizeQuizAnswer(question.type, question.answer);
  const correct = normalized === expected;
  return {
    valid: true,
    correct,
    normalized,
    correctAnswer: formatCorrectAnswer(question),
    explanation: question.explanation || ''
  };
}

module.exports = {
  QUIZ_TYPES,
  TYPE_LABELS,
  INITIAL_QUIZ_BANK,
  get QUIZ_BANK() { return activeBank; },
  getQuizBank,
  getEnabledQuizBank,
  setQuizBank,
  importQuizQuestions,
  toggleQuestionStatus,
  quizSummary,
  pickQuizQuestion,
  publicQuestionView,
  normalizeQuizAnswer,
  checkQuizAnswer
};
