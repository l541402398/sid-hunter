import { pathToFileURL } from 'node:url';

function required(env, key) {
  if (!env[key]?.trim()) throw new Error(`缺少必填配置 ${key}`);
  return env[key];
}

export function buildPayload(env) {
  const tag = required(env, 'CI_COMMIT_TAG');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag)) {
    throw new Error('Git 标签必须是合法 Docker 标签，例如 v1.0.0');
  }
  const runtime = { TZ: env.TZ || 'Asia/Shanghai' };
  // 只传应用配置，避免将仓库密码和 GitLab 作业凭据注入容器。
  for (const key of [
    'SID_MANAGER_CODE', 'SSO_LOGIN_URL', 'SSO_VALIDATE_URL', 'TOKEN_EXPIRE',
    'PROFILE_API_URL', 'PROFILE_API_TICKET', 'PROFILE_API_TOKEN', 'PROFILE_API_COOKIE', 'PROFILE_API_HEADERS',
    'PROFILE_SYNC_INTERVAL_MS', 'PROFILE_TIMEOUT_MS', 'SID_PROFILE_SYNC',
    'HOST', 'PORT', 'NODE_ENV', 'SID_SSO', 'SID_DEV', 'SID_TEST', 'SID_DB', 'SID_DB_FILE', 'SID_SSO_SEED',
    'SID_AOI', 'SID_AOI_RADIUS', 'SID_SKINS', 'SID_LOD', 'SID_TMJ', 'SID_FLOOR_SCALE'
  ]) {
    if (env[key] !== undefined) runtime[key] = env[key];
  }
  for (const key of ['SID_MANAGER_CODE', 'SSO_LOGIN_URL', 'SSO_VALIDATE_URL']) required(runtime, key);
  return {
    ID: 281,
    Name: 'sid',
    Image: `${required(env, 'IMAGE_NAME')}:${tag}`,
    Cmd: '',
    Envs: Object.entries(runtime).map(([Key, Value]) => ({ ContainerID: 281, Key, Value })),
    Vols: [{ ContainerID: 281, VolumeID: 393, MountPoint: '/app/online/.data' }]
  };
}

export async function deploy(env, request = fetch) {
  const token = required(env, 'XDOG_TOKEN');
  const payload = buildPayload(env);
  let response;
  try {
    response = await request('http://172.26.14.1/modifyContainer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Xdog-Token': token },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(120_000)
    });
  } catch {
    throw new Error('更新容器请求失败或超时，请先到平台确认容器状态再重试');
  }
  if (!response.ok) throw new Error(`更新容器 API 返回 HTTP ${response.status}`);
  // shortcut: API 仅提供了 HTTP 成功约定，取得业务响应规范后再校验业务状态。
  console.log(`更新请求已成功提交：sid → ${payload.Image}，保留数据卷 393`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy(process.env).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
