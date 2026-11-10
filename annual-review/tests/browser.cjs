'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

function onPath(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) return;
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .find((candidate) => existsSync(candidate));
}

function resolveChrome() {
  if (process.env.CHROME_BIN) {
    const configured = process.env.CHROME_BIN;
    const executable = existsSync(configured) ? configured : onPath(configured);
    if (executable) return executable;
    throw Error('CHROME_BIN does not point to an installed Chrome, Chromium, or Edge executable.');
  }

  let candidates, commands;
  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA
    ].filter(Boolean);
    candidates = roots.flatMap((root) => [
      join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]);
    commands = ['chrome.exe', 'msedge.exe', 'chromium.exe'];
  } else if (process.platform === 'darwin') {
    candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    commands = ['chromium', 'google-chrome'];
  } else {
    candidates = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/chrome',
      '/snap/bin/chromium'
    ];
    commands = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  }
  const installed = candidates.find((candidate) => existsSync(candidate));
  if (installed) return installed;
  for (const command of commands) {
    const executable = onPath(command);
    if (executable) return executable;
  }
  throw Error(
    'No installed Chrome, Chromium, or Edge was found. Set CHROME_BIN to its executable path.'
  );
}

module.exports = { resolveChrome };
