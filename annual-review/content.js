/* People come from the supplied Excel mock; personal and foreword remain preview content. */
(() => {
  const people = window.AnnualPeopleMock;
  window.AnnualContent = Object.freeze({
    demo: true,
    foreword: {
      heading: '致每一位同行的你',
      salutation: '亲爱的伙伴：',
      paragraphs: [
        '这一年，辛苦了。感谢你在每一个平凡日子里的认真，也感谢你在关键时刻的担当。',
        '有些瞬间，当时只顾着向前，回头才发现格外珍贵。那些共同经历的忙碌、收获与喜悦，都值得好好珍藏。',
        '让我们放慢脚步，再看一遍共同走过的2026。看看身边闪光的伙伴，也看看一路努力的自己。'
      ],
      thanks: '每一份付出，都被看见。',
      signature: '2026 年度活动组',
      date: '2026 · 岁末',
      guide: '接下来，请翻过这一页。先遇见20项闪光的年度记录，再翻到属于你自己的年度故事。'
    },
    people,
    peoplePageTitles: [
      '看见身边的光',
      '认真，自有分量',
      '把热爱写进成果',
      '在每次交付中闪光',
      '向上生长，步履不停',
      '分享与认可，一路同行',
      '总有人默默守候',
      '热爱也在工作之外',
      '收获一路的积累',
      '让每个问题都有回应'
    ],
    personal: {
      name: '示例用户',
      employeeId: 'DEMO-ME',
      portrait: 21,
      keyword: '认真，是你的年度底色',
      intro: '这一次，把目光留给自己。那些看似普通的日常，已经积攒成一整年的成长。',
      stats: [
        { label: '参与上线', value: 136, unit: '次' },
        { label: '协作记录', value: 238, unit: '次' },
        { label: '知识分享', value: 12, unit: '场' },
        { label: '年度同行', value: 365, unit: '天' }
      ],
      moments: [
        { date: '01.12', text: '新一年的第一次协作，从认真回应开始。' },
        { date: '06.18', text: '把积累的经验，分享给身边的伙伴。' },
        { date: '11.06', text: '回头看，已经走过了这么多值得记住的日常。' }
      ]
    }
  });
})();
