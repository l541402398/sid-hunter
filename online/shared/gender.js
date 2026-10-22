'use strict';
// 性别归一与「发色索引 → 男女形象」的唯一映射。
//
// 客户端 characters.js 的 style() 只看 colors.hair 在公开色板中的索引奇偶：
// 偶数索引是男形象、奇数索引是女形象。服务端分配角色时用这里同一份规则挑选发色，
// 因此不需要把性别写进公开快照，也不会出现“服务端说是女、客户端画成男”的漂移。
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SID_GENDER = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MALE_VALUES = new Set(['male', 'm', 'man', 'boy', '男', '男性', '男生', '先生', '1', 'true']);
  const FEMALE_VALUES = new Set(['female', 'f', 'woman', 'girl', '女', '女性', '女生', '女士', '2', 'false']);
  // 与 public/js/render/characters.js 的 style() 保持一致。
  const HAIR_PARITY = Object.freeze({ male: 0, female: 1 });

  function clean(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().toLowerCase();
  }

  // 返回 male / female / null。数字按国内 HR 系统常见的 1=男、2=女；
  // 0 不猜（未知），调用方退回随机形象。
  function normalizeGender(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 'male' : 'female';
    const text = clean(value).slice(0, 32);
    if (!text) return null;
    if (MALE_VALUES.has(text)) return 'male';
    if (FEMALE_VALUES.has(text)) return 'female';
    // 兼容「男（M）」「性别：女」「MALE」这类带前后缀的值。不能用 includes('m')，否则 female 会误判。
    if (/^(男|男性|男生|先生)/.test(text)) return 'male';
    if (/^(女|女性|女生|女士)/.test(text)) return 'female';
    if (/^(male|man|boy)\b/.test(text)) return 'male';
    if (/^(female|woman|girl)\b/.test(text)) return 'female';
    return null;
  }

  function hairIndexAllowed(index, gender) {
    const parsed = normalizeGender(gender);
    return !parsed || index % 2 === HAIR_PARITY[parsed];
  }

  return { normalizeGender, hairIndexAllowed, HAIR_PARITY };
});
