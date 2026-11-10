'use strict';
// The local preview runs the real game, with its own save file and an annual-book overlay.
const path = require('node:path');
process.env.HOST = '127.0.0.1';
process.env.PORT = process.env.REVIEW_PORT || '8790';
process.env.SID_SSO = '0';
process.env.SID_TEST = '0';
process.env.SID_DB = '1';
process.env.SID_DEV = '0';
process.env.SID_PROFILE_SYNC = '0';
process.env.SID_DB_FILE = path.join(
  __dirname,
  '..',
  'outputs',
  'annual-review-game-preview',
  'sid.sqlite'
);
const { ACTIVITY } = require('../online/server.js');
ACTIVITY.tick();
if (ACTIVITY.isReady() && !ACTIVITY.state().active) {
  const now = new Date(Date.now() + 8 * 3600000),
    remainingMinutes = Math.floor(
      (86400000 -
        (now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000 + now.getUTCSeconds() * 1000)) /
        60000
    );
  if (remainingMinutes > 0) {
    const result = ACTIVITY.startManual({
      minutes: Math.min(120, remainingMinutes),
      label: '纪念册本地预览'
    });
    if (!result.ok) console.error('本地预览场未开启：' + result.error);
  }
}
