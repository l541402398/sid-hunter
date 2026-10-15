'use strict';
// 客户端子模块：文本转义与指令 ID（纯函数）。
(function () {
  const SID = window.SID = window.SID || {};
  function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const commandId = () => 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  SID.text = { escapeText, commandId };
})();
