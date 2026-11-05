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
  // ==================== 单选题（single · Q0001–Q0008） ====================
  {
    id: 'Q0001',
    category: '十五五规划',
    type: 'single',
    stem: '中心年度代码修改量稳定在多少以上？',
    options: [
      { key: 'A', text: '1000万行' },
      { key: 'B', text: '2000万行' },
      { key: 'C', text: '3000万行' },
      { key: 'D', text: '4000万行' }
    ],
    answer: 'B',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0002',
    category: '十五五规划',
    type: 'single',
    stem: '单元测试分支覆盖率均值从34.4%提升至多少以上？',
    options: [
      { key: 'A', text: '50%' },
      { key: 'B', text: '60%' },
      { key: 'C', text: '70%' },
      { key: 'D', text: '80%' }
    ],
    answer: 'C',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0003',
    category: '十五五规划',
    type: 'single',
    stem: '投产频次从2281次跃升至多少次？',
    options: [
      { key: 'A', text: '3180次' },
      { key: 'B', text: '4180次' },
      { key: 'C', text: '5180次' },
      { key: 'D', text: '6180次' }
    ],
    answer: 'B',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0004',
    category: '十五五规划',
    type: 'single',
    stem: '人工智能安全开发助手识别人工智能训练数据异常多少条？',
    options: [
      { key: 'A', text: '119条' },
      { key: 'B', text: '219条' },
      { key: 'C', text: '319条' },
      { key: 'D', text: '419条' }
    ],
    answer: 'B',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0005',
    category: '十五五规划',
    type: 'single',
    stem: '中心获得全球首批什么认证？',
    options: [
      { key: 'A', text: 'CMMI2.0 ML3' },
      { key: 'B', text: 'CMMI3.0 ML5' },
      { key: 'C', text: 'ISO27001' },
      { key: 'D', text: 'CMMI3.0 ML3' }
    ],
    answer: 'B',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0006',
    category: '十五五规划',
    type: 'single',
    stem: '工程资产使用率提升多少？',
    options: [
      { key: 'A', text: '42%' },
      { key: 'B', text: '142%' },
      { key: 'C', text: '242%' },
      { key: 'D', text: '342%' }
    ],
    answer: 'B',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0007',
    category: '十五五规划',
    type: 'single',
    stem: '软件专业资质认证持有率从57%跃升至多少？',
    options: [
      { key: 'A', text: '81.65%' },
      { key: 'B', text: '91.65%' },
      { key: 'C', text: '95%' },
      { key: 'D', text: '99%' }
    ],
    answer: 'B',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0008',
    category: '十五五规划',
    type: 'single',
    stem: '民航核心业务领域亟须构建的OOSD全流程解决方案涵盖哪些环节？',
    options: [
      { key: 'A', text: '订单管理、精准报价、高效结算和便捷交付' },
      { key: 'B', text: '招聘、培训、考核和激励' },
      { key: 'C', text: '研发、测试、上线和运维' },
      { key: 'D', text: '确权、定价、流通和计量' }
    ],
    answer: 'A',
    status: '启用',
    enabled: true
  },

  // ==================== 判断题（judge · Q0009–Q0016） ====================
  {
    id: 'Q0009',
    category: '十五五规划',
    type: 'judge',
    stem: '文本提出缺陷遗留率与泄漏率从2%以下降至0。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0010',
    category: '十五五规划',
    type: 'judge',
    stem: '中心成功保持“零”自身原因导致的安全事件。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0011',
    category: '十五五规划',
    type: 'judge',
    stem: '中心连续三年区域评估能力排名第一。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0012',
    category: '十五五规划',
    type: 'judge',
    stem: '文本提出制度总数减少10%。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0013',
    category: '十五五规划',
    type: 'judge',
    stem: '文本提出未来五年内研发模式必须保持传统手工作坊式开发。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'F',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0014',
    category: '十五五规划',
    type: 'judge',
    stem: '文本提出隐私计算和区块链技术会阻碍可信数据流通。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'F',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0015',
    category: '十五五规划',
    type: 'judge',
    stem: '公司推进管理改革以“市场为龙头、技术为动力、财务为中心、结果为导向”为目标。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0016',
    category: '十五五规划',
    type: 'judge',
    stem: '新业升级布局低空经济、数据运营等新赛道时需要技术底座和解决方案。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    status: '启用',
    enabled: true
  },

  // ==================== 多选题（multiple · Q0017–Q0024） ====================
  {
    id: 'Q0017',
    category: '十五五规划',
    type: 'multiple',
    stem: '中心“十四五”期间生产交付质效优化表现包括哪些？',
    options: [
      { key: 'A', text: '静态代码质量稳定在A级' },
      { key: 'B', text: '单元测试分支覆盖率均值提升至70%以上' },
      { key: 'C', text: '缺陷遗留率与泄漏率降至0' },
      { key: 'D', text: '投产频次下降至2281次' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0018',
    category: '十五五规划',
    type: 'multiple',
    stem: '中心安全保障能力提升的表述包括哪些？',
    options: [
      { key: 'A', text: '保持“零”自身原因导致的安全事件' },
      { key: 'B', text: '累计新建、修订制度近30项' },
      { key: 'C', text: '累计发现整改隐患超万条' },
      { key: 'D', text: '社工攻击中招率大幅上升' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0019',
    category: '十五五规划',
    type: 'multiple',
    stem: '中心区域研发能力显著跃迁的成果包括哪些？',
    options: [
      { key: 'A', text: '形成“三层四域”规范体系与“八个一”治理框架' },
      { key: 'B', text: '构建“三五四四”研发效能度量模型' },
      { key: 'C', text: '获得全球首批CMMI3.0 ML5认证' },
      { key: 'D', text: '放弃软件工程实践地图' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0020',
    category: '十五五规划',
    type: 'multiple',
    stem: '中心技术创新成果持续涌现的表述包括哪些？',
    options: [
      { key: 'A', text: '参与公司级课题研究13个' },
      { key: 'B', text: '提交专利102项' },
      { key: 'C', text: '发表论文106篇' },
      { key: 'D', text: '软件著作权0个' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0021',
    category: '十五五规划',
    type: 'multiple',
    stem: '中心数字化建设跨领域融合的表述包括哪些？',
    options: [
      { key: 'A', text: '核心网络带宽升至万兆' },
      { key: 'B', text: '配置智算6P FLOPS' },
      { key: 'C', text: '搭建开发、办公及创新三个云平台' },
      { key: 'D', text: '系统可用性低于90%' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0022',
    category: '十五五规划',
    type: 'multiple',
    stem: '中心人才队伍专业水平提升的表述包括哪些？',
    options: [
      { key: 'A', text: '中高级岗占比提升至67%' },
      { key: 'B', text: '培育新一代信息技术8个领域共计240余名专业人才' },
      { key: 'C', text: '补齐能力短板69项' },
      { key: 'D', text: '软件专业资质认证持有率下降至57%' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0023',
    category: '十五五规划',
    type: 'multiple',
    stem: '文本提出的当前突出问题包括哪些？',
    options: [
      { key: 'A', text: '交付效率方面节奏偏慢，部署频率中位数10次/月' },
      { key: 'B', text: '变更前置时间多在1周以上，未达到高效能团队“1天内”基准' },
      { key: 'C', text: '队伍数字思维、产品思维还不足' },
      { key: 'D', text: '已完全满足“标准化生产+个性化定制”业务发展需求' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  },
  {
    id: 'Q0024',
    category: '十五五规划',
    type: 'multiple',
    stem: '“十五五”时期落实公司发展布局的要求包括哪些？',
    options: [
      { key: 'A', text: '安全筑基要求提供更高韧性的信息系统' },
      { key: 'B', text: '主业焕新需要核心业务系统在去主机化进程中实现智能化升级' },
      { key: 'C', text: '新业升级布局低空经济、数据运营等新赛道时需要技术底座和解决方案' },
      { key: 'D', text: '放弃行业数智化发展趋势' }
    ],
    answer: ['A', 'B', 'C'],
    status: '启用',
    enabled: true
  }
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
