'use strict';
// 题库模块（服务端权威）：包含单选（single）、多选（multiple）、判断（judge）三种题型的 Mock 题库与判题逻辑。
// 注意：正确答案（answer）只保留在服务端内存，下发给客户端的题目视图（publicQuestionView）绝不包含 answer 字段。

const QUIZ_TYPES = Object.freeze(['single', 'multiple', 'judge']);

const TYPE_LABELS = Object.freeze({
  single: '单选题',
  multiple: '多选题',
  judge: '判断题'
});

const QUIZ_BANK = Object.freeze([
  // ==================== 单选题（single） ====================
  {
    id: 'single-01',
    type: 'single',
    stem: '在本场对抗赛中，每位玩家的身份码（S-ID）一共由几段组成？',
    options: [
      { key: 'A', text: '2 段' },
      { key: 'B', text: '3 段' },
      { key: 'C', text: '4 段' },
      { key: 'D', text: '5 段' }
    ],
    answer: 'B',
    explanation: '每位玩家的身份码（S-ID）由 3 段组成，每段包含 3 位大写字母或数字。'
  },
  {
    id: 'single-02',
    type: 'single',
    stem: '当潜伏者（坏人）的第几段身份码被公开时，会在同一事务内立即自动出局？',
    options: [
      { key: 'A', text: '第 1 段' },
      { key: 'B', text: '第 2 段' },
      { key: 'C', text: '第 3 段' },
      { key: 'D', text: '不会自动出局' }
    ],
    answer: 'C',
    explanation: '潜伏者（坏人）的第 3 段身份码被公开时会立即自动出局。'
  },
  {
    id: 'single-03',
    type: 'single',
    stem: '在 NPC 幸运大转盘中，每位玩家每日最多可以转动几次？',
    options: [
      { key: 'A', text: '1 次' },
      { key: 'B', text: '2 次' },
      { key: 'C', text: '3 次' },
      { key: 'D', text: '5 次' }
    ],
    answer: 'C',
    explanation: 'NPC 大转盘全楼层共享次数，每人每日上限 3 次（首次免费，后两次各消耗 3 金币）。'
  },
  {
    id: 'single-04',
    type: 'single',
    stem: '在 NPC 处使用金币兑换积分，每人每日最多可兑换多少积分？',
    options: [
      { key: 'A', text: '5 分' },
      { key: 'B', text: '10 分' },
      { key: 'C', text: '15 分' },
      { key: 'D', text: '20 分' }
    ],
    answer: 'B',
    explanation: '金币在 NPC 处兑换积分每日最多 10 分，且每人每日限兑一次。'
  },
  {
    id: 'single-05',
    type: 'single',
    stem: '调查员（好人）使用「指认」技能成功命中潜伏者（坏人）并公开新一段身份码时，可获得多少对抗积分？',
    options: [
      { key: 'A', text: '+2 分' },
      { key: 'B', text: '+5 分' },
      { key: 'C', text: '+10 分' },
      { key: 'D', text: '+15 分' }
    ],
    answer: 'C',
    explanation: '好人指认命中坏人并公开新段可获得 +10 对抗积分。'
  },
  {
    id: 'single-06',
    type: 'single',
    stem: '办公大楼地图一共设有多少层楼面供玩家乘电梯探索？',
    options: [
      { key: 'A', text: '3 层' },
      { key: 'B', text: '5 层' },
      { key: 'C', text: '7 层' },
      { key: 'D', text: '9 层' }
    ],
    answer: 'C',
    explanation: '办公大楼共有 1F 至 7F 共 7 层楼面。'
  },
  {
    id: 'single-07',
    type: 'single',
    stem: '靠近地图中的箱子、文件柜或 NPC 时，默认按哪个快捷键可以发起场景交互？',
    options: [
      { key: 'A', text: 'J 键' },
      { key: 'B', text: 'K 键' },
      { key: 'C', text: 'L 键' },
      { key: 'D', text: 'M 键' }
    ],
    answer: 'B',
    explanation: '靠近可交互实体时按 K 键触发场景交互，按 J 键触发木锤敲击或幽灵吓人。'
  },
  {
    id: 'single-08',
    type: 'single',
    stem: '日常办公信息安全中，离开工位时最推荐的习惯是？',
    options: [
      { key: 'A', text: '保持屏幕常亮方便回来继续写代码' },
      { key: 'B', text: '立即锁屏（Win+L / Ctrl+Cmd+Q）并收好敏感文档' },
      { key: 'C', text: '把账号密码贴在显示器边框上' },
      { key: 'D', text: '将内部测试链接发到外部公开群' }
    ],
    answer: 'B',
    explanation: '离开工位随手锁屏并妥善保管敏感资料是基本的信息安全规范。'
  },

  // ==================== 多选题（multiple） ====================
  {
    id: 'multiple-01',
    type: 'multiple',
    stem: '以下哪些属于每位玩家入场时处于隐藏状态（初始显示为 ***）的个人属性？',
    options: [
      { key: 'A', text: '口头禅' },
      { key: 'B', text: '爱吃的食物' },
      { key: 'C', text: '喜欢的运动' },
      { key: 'D', text: '上衣颜色' }
    ],
    answer: ['A', 'B', 'C'],
    explanation: '口头禅、爱吃的食物、喜欢的运动是 3 项隐藏个人属性；发色、上衣、裤子、鞋子颜色入场默认公开。'
  },
  {
    id: 'multiple-02',
    type: 'multiple',
    stem: '玩家开启地图中的箱子或柜子时，可能触发以下哪些随机结果？',
    options: [
      { key: 'A', text: '箱子为空' },
      { key: 'B', text: '直接获得随机金币' },
      { key: 'C', text: '触发答题挑战，答对获得金币' },
      { key: 'D', text: '直接淘汰其他玩家' }
    ],
    answer: ['A', 'B', 'C'],
    explanation: '每个箱子或柜子的内容按玩家独立随机生成，可能为空、直接获得金币或触发答题获得金币。'
  },
  {
    id: 'multiple-03',
    type: 'multiple',
    stem: '在每层楼的 NPC 处，玩家可以使用金币兑换以下哪些即时效果？',
    options: [
      { key: 'A', text: '兑换积分（每日最多10分）' },
      { key: 'B', text: '公开随机或指定玩家的一条隐藏属性' },
      { key: 'C', text: '隐藏自己的一条已公开属性或最近公开的一段身份码' },
      { key: 'D', text: '隐藏指定匿名坏人卡上的一条已公布线索' }
    ],
    answer: ['A', 'B', 'C', 'D'],
    explanation: '以上六类即时效果均可在 NPC 处用金币兑换，每人每类效果每日限兑一次。'
  },
  {
    id: 'multiple-04',
    type: 'multiple',
    stem: '关于调查员（好人）阵营的专属技能，以下说法正确的有？',
    options: [
      { key: 'A', text: '拥有「调查属性」技能，可公开目标一条未公开属性' },
      { key: 'B', text: '拥有「指认」技能，指认坏人可公开对方一段身份码并得 10 分' },
      { key: 'C', text: '若误指认好人，会公开自己的一段未公开身份码' },
      { key: 'D', text: '好人三段身份码全部公开后会立即自动出局' }
    ],
    answer: ['A', 'B', 'C'],
    explanation: '好人拥有调查属性与指认两项技能；好人三段身份码全部公开不会自动出局，只有被坏人击杀才出局。'
  },
  {
    id: 'multiple-05',
    type: 'multiple',
    stem: '关于潜伏者（坏人）阵营的专属技能，以下说法正确的有？',
    options: [
      { key: 'A', text: '可对好人使用「公开身份码」，成功公开新段得 2 分' },
      { key: 'B', text: '对另一名坏人使用「公开身份码」时双方身份码均不变化' },
      { key: 'C', text: '当其他存活玩家三段身份码全部公开后，可对其发动「击杀」' },
      { key: 'D', text: '击杀好人需要手动输入对方完整的 9 位身份码字符' }
    ],
    answer: ['A', 'B', 'C'],
    explanation: '坏人拥有公开身份码与击杀技能；目标三段全公开后直接点击击杀即可，无需手输身份码。'
  },
  {
    id: 'multiple-06',
    type: 'multiple',
    stem: '以下哪些属于角色入场即对外公开的外观颜色特征？',
    options: [
      { key: 'A', text: '发色' },
      { key: 'B', text: '上衣颜色' },
      { key: 'C', text: '裤子颜色' },
      { key: 'D', text: '鞋颜色' }
    ],
    answer: ['A', 'B', 'C', 'D'],
    explanation: '发色、上衣颜色、裤子颜色、鞋颜色共 4 项外观特征入场默认公开。'
  },
  {
    id: 'multiple-07',
    type: 'multiple',
    stem: '关于每日金币与积分的结算规则，以下描述正确的有？',
    options: [
      { key: 'A', text: '金币每日清零，不跨日保留' },
      { key: 'B', text: '积分持续累计，计入活动总成绩' },
      { key: 'C', text: '玩家当日出局后，已获得的积分依然保留' },
      { key: 'D', text: 'NPC 大转盘的免费次数可以无限累積到最后一天' }
    ],
    answer: ['A', 'B', 'C'],
    explanation: '金币每日清零，积分持续累计；玩家出局后保留已得积分；大转盘每日上限 3 次不跨日累加。'
  },
  {
    id: 'multiple-08',
    type: 'multiple',
    stem: '在团队研发与代码协作中，以下哪些做法符合良好的工程习惯？',
    options: [
      { key: 'A', text: '敏感密钥与口令不硬编码进代码仓库' },
      { key: 'B', text: '关键业务状态由服务端权威校验，不盲信客户端参数' },
      { key: 'C', text: '提交代码前运行回归测试确保核心流程通过' },
      { key: 'D', text: '把未公开的玩家隐藏身份直接放进公开广播接口' }
    ],
    answer: ['A', 'B', 'C'],
    explanation: '不硬编码密钥、服务端权威校验、提交前跑回归测试均为良好工程实践；公开接口绝不能泄露隐藏秘密。'
  },

  // ==================== 判断题（judge） ====================
  {
    id: 'judge-01',
    type: 'judge',
    stem: '同一玩家对地图上的同一个箱子或柜子只能开启一次，不能重复翻找。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    explanation: '同一玩家对同一箱子或柜子只能开启一次。'
  },
  {
    id: 'judge-02',
    type: 'judge',
    stem: '不同楼层的 NPC 大转盘次数相互独立，每层楼都能免费转 3 次。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'F',
    explanation: '每层楼的 NPC 大转盘共享次数，每人每日共计 3 次上限（免费 1 次，另外每次消耗 3 金币）。'
  },
  {
    id: 'judge-03',
    type: 'judge',
    stem: '玩家当天的金币会在次日清零，但获得的积分会持续累计。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    explanation: '金币每日清零，积分持续累计。'
  },
  {
    id: 'judge-04',
    type: 'judge',
    stem: '每层楼的 NPC 功能一致，都提供大转盘与六类金币即时效果兑换。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    explanation: '1F–7F 每层楼的 NPC 功能完全一致。'
  },
  {
    id: 'judge-05',
    type: 'judge',
    stem: '在 NPC 处兑换的六类即时效果，每人每类效果每日限兑一次。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    explanation: '六类金币兑换效果每人每类每日限兑一次。'
  },
  {
    id: 'judge-06',
    type: 'judge',
    stem: '调查员（好人）的三段身份码全部被公开后，会像坏人一样立即自动出局。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'F',
    explanation: '好人三段身份码全公开不会自动出局，但可被坏人发动击杀技能淘汰。'
  },
  {
    id: 'judge-07',
    type: 'judge',
    stem: '玩家出局后将变为幽灵状态，当日已获得的积分完整保留，并可继续在地图中游览。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'T',
    explanation: '出局后保留今日所得积分，停止新增得分，可作为幽灵继续逛地图。'
  },
  {
    id: 'judge-08',
    type: 'judge',
    stem: '每个箱子或柜子的探索结果对所有玩家完全固定相同，第一个人开出空箱子则其他人也必定是空箱子。',
    options: [
      { key: 'T', text: '正确' },
      { key: 'F', text: '错误' }
    ],
    answer: 'F',
    explanation: '每个箱子或柜子的内容按玩家独立随机生成。'
  }
]);

function pickQuizQuestion(rng, preferredType = null) {
  const rand = typeof rng === 'function' ? rng : max => Math.floor(Math.random() * max);
  const pool = (preferredType && QUIZ_TYPES.includes(preferredType))
    ? QUIZ_BANK.filter(q => q.type === preferredType)
    : QUIZ_BANK;
  const idx = Math.max(0, Math.min(pool.length - 1, Number(rand(pool.length)) || 0));
  return pool[idx];
}

function publicQuestionView(question, rewardCoins = 3) {
  if (!question) return null;
  return {
    id: question.id,
    type: question.type,
    typeLabel: TYPE_LABELS[question.type] || '答题',
    stem: question.stem,
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
  QUIZ_BANK,
  pickQuizQuestion,
  publicQuestionView,
  normalizeQuizAnswer,
  checkQuizAnswer
};
