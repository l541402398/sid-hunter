# GitLab 标签部署

项目：<https://gitlab.cae.com/jrwu/sid-hunter>。

推送 Git 标签时，`.gitlab-ci.yml` 构建并推送 `dockeropen.x/hbsun/sid-hunter:<标签>`，再更新容器 `sid`（ID `281`）。例如标签 `v1.0.0` 对应镜像 `dockeropen.x/hbsun/sid-hunter:v1.0.0`。普通分支推送不触发流水线。

构建使用内网镜像源 `http://dockerg.x` 下载 `node:22-alpine` 基础镜像，项目镜像仍推送到 `dockeropen.x`。

每次部署保留数据卷 `393`，挂载到 `/app/online/.data`。启动指令为空，沿用镜像的启动命令。更新会重启服务，CAS 和管理员会话需要重新登录。

## GitLab 变量

在项目 **Settings → CI/CD → Variables** 中逐项添加。每项类型都选普通的 **Variable**，**Key** 填下列变量名，**Value** 直接填原值，不额外添加外层引号。

不要填写整段 `KEY=VALUE`；`PROFILE_API_HEADERS` 填 JSON 本身即可。不需要上传配置文件或填写 `.env` 路径。

以下 6 项必填：

- `USER_NAME`：私有镜像仓库用户名，例如 `hbsun`。
- `USER_PASSWORD`：私有镜像仓库密码。
- `XDOG_TOKEN`：更新容器 API 的 `Xdog-Token`。
- `SID_MANAGER_CODE`：强随机管理员授权码。
- `SSO_LOGIN_URL`：CAS 登录地址，例如 `https://172.26.1.10/login?service={service}`。
- `SSO_VALIDATE_URL`：CAS 票据校验地址，例如 `http://172.26.1.10/p3/serviceValidate?service={service}&ticket={ticket}`。

CAS 地址按部署环境填写，保留地址中的 `{service}` 和 `{ticket}`。前三项只供流水线使用，后三项传给容器。

以下可选项也按一个 Key、一个 Value 添加，可参考仓库 `.env.example`：

- `TZ`：时区，不填时部署脚本使用 `Asia/Shanghai`。
- `TOKEN_EXPIRE`：登录会话有效期，单位秒，例如 `604800`。
- `PROFILE_API_URL`：员工档案接口地址，例如 `http://profile.app.x/profilesAll`。
- `PROFILE_API_TICKET`、`PROFILE_API_TOKEN`、`PROFILE_API_COOKIE`：档案接口的登录凭据，按环境选用；票据通常只能使用一次。
- `PROFILE_API_HEADERS`：额外请求头，Value 填 JSON，例如 `{"X-Internal-Token":"替换为实际值"}`。
- `PROFILE_SYNC_INTERVAL_MS`：同步间隔，单位毫秒；`0` 表示仅启动时同步一次。
- `PROFILE_TIMEOUT_MS`：同步超时，单位毫秒，例如 `30000`。
- `SID_PROFILE_SYNC`：填 `0` 关闭启动时的档案同步。
- `HOST`、`PORT`、`NODE_ENV`：监听地址、端口和运行环境。
- `SID_SSO`、`SID_DEV`、`SID_TEST`：现有登录、开发和测试开关。
- `SID_DB`、`SID_DB_FILE`、`SID_SSO_SEED`：现有数据库、数据库路径和 SSO 初始账号配置。
- `SID_AOI`、`SID_AOI_RADIUS`、`SID_SKINS`、`SID_LOD`、`SID_TMJ`、`SID_FLOOR_SCALE`：现有游戏运行参数。

除 `TZ` 外，未配置的可选项不会传给容器，由应用使用自身默认值。部署脚本只传入上述应用变量，不会把其他 CI 变量带入容器。更新 API 接收完整的 `Envs` 列表，平台已有的可选配置也要在 GitLab 中逐项添加，不要假定更新 API 会保留未传入的旧配置。

所有变量关闭 **Expand variable reference**，避免密码里的 `$` 被替换。密码、Token 和管理员授权码等敏感值选择 **Masked**；变量值不写入 Git、不上传为 artifact，也不输出到流水线日志。将发布标签（如 `v*`）设为 **Protected tags**，这些变量设为 **Protected**；不受保护的标签拿不到受保护变量。

## 发布

流水线使用旧版 GitLab 支持的 `only: tags`。同一时间只发布一个标签，等待这次部署完成后再发下一个，避免同时更新容器或旧版本覆盖新版本。

先提交并推送 `.gitlab-ci.yml`、`ci/`、`Dockerfile`、`.dockerignore` 和相关代码修改，再给要部署的提交打标签：

```bash
git tag v1.0.0
git push origin v1.0.0
```

标签需符合 Docker 标签规则：首字符是字母、数字或下划线，其余可含字母、数字、下划线、点和横线，总长度最多 128；不能使用 `release/v1.0.0` 这样的斜杠标签。每次发布使用新标签。

流水线先在构建镜像内运行 `online/healthcheck-test.mjs`，通过后推送；部署前运行 `ci/deploy-test.mjs`，通过后调用 `http://172.26.14.1/modifyContainer`。部署脚本只接受 HTTP 成功响应，不自动重试更新请求；超时后先检查平台状态，避免重复重启。接口业务响应格式尚未提供，流水线成功提交请求后，仍需在平台检查容器和 `/healthz`。

本地验证部署请求生成与错误处理（使用临时配置和模拟请求，不调用平台）：

```bash
node --test ci/deploy-test.mjs
```
