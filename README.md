# SID-Hunter

《S-ID：年终生存战》浏览器游戏。当前使用原生 Node.js HTTP/SSE 服务端、Canvas 场景和 DOM 界面，没有第三方 npm 依赖或打包构建链。

- 游戏规则、正式规则与试玩差异：[游戏规则.md](游戏规则.md)。规则文档有独立审核未完成的条目，且其中旧源码版本记录不代表当前代码；本 README 的启动说明已按 CAS 合入后的代码核对。
- 开发分支：`dev_wjr`；完成开发并验收后合并到 `dev`。
- 以下命令适用于 **macOS / zsh**，在仓库根目录执行；Windows 不能直接照搬 `lsof` 和 Shell 语法。
- **停止、重启或重置会丢失本进程的游戏局及登录会话。** 当前没有跨重启存档；重连只能恢复仍存在于原进程中的角色。
- 固定试玩构建与开发源码独立，修改开发代码不会自动升级固定版。`releases/`、`release/` 已加入 Git 忽略，不提交构建产物、日志、PID、`.env` 或真实凭证。

## 1. 环境准备

建议使用项目开发环境已验证的 Node.js 22。服务端使用了内置 `fetch`，不要用旧 Node 运行。

```bash
# 进入你自己的仓库路径；以下为当前开发机路径。
cd /Users/jiarunwu/WorkBuddy/SID-Hunter

# 后面的命令共用此变量；每次新开终端需要重新设置。
export NODE=/Users/jiarunwu/.workbuddy/binaries/node/versions/22.22.2-6/bin/node
"$NODE" --version

# 其他电脑安装 Node 22 后可改为：
# export NODE="$(command -v node)"
```

本项目目前没有 `package.json`，**不需要 `npm install`，也没有 `npm run dev/build/start/stop`**。不要照着不存在的 npm 命令执行。

### CAS 配置

```bash
# 仅首次复制；不覆盖已经配置好的 .env。
if [ ! -f .env ]; then cp .env.example .env; fi
```

编辑根目录 `.env`，按公司环境配置：

| 配置 | 含义 |
|---|---|
| `SSO_LOGIN_URL` | CAS 登录地址，保留 `{service}` 占位符 |
| `SSO_VALIDATE_URL` | CAS 验票地址，保留 `{service}` 和 `{ticket}` 占位符 |
| `TOKEN_EXPIRE` | 登录会话有效秒数，示例默认 604800 |

`.env` 由 `online/sso.js` 从当前运行副本根目录加载，已存在的进程环境变量优先。示例中的公司内网地址需要网络可达；不要把配置或真实票据贴进日志、截图或 Git。

**正常模式启用 CAS 登录**，验证后以公司姓名进入游戏。回调地址必须与访问游戏的主机和端口一致；更换域名、IP 或端口后需要重新检查 CAS 配置及允许的回调地址。服务重启后需重新登录。

## 2. 启动开发版（8787）

先检查端口，已有服务时不要重复启动或直接杀掉：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

正常开发启动，启用本机开发按钮，关闭测试接口，**仍需要 CAS 登录**：

```bash
HOST=127.0.0.1 PORT=8787 SID_DEV=1 SID_TEST=0 \
  "$NODE" "$PWD/online/server.js"
```

打开：**http://127.0.0.1:8787/**。

这是前台运行，终端会持续显示服务日志。代码没有热重载：修改后端需要手动重启；修改前端通常刷新页面即可，但新前端若依赖新增后端字段，必须配套升级后端。

- `SID_DEV=1` 仅允许符合本机来源、同源、有效会话、CSRF 等检查的开发管理操作，并非绕过鉴权。
- 重置和结束需要确认；添加 NPC 用于开发自测。
- `HOST=127.0.0.1` 只允许本机访问，不是给同事的局域网地址。

### 临时离线自测模式（可选）

仅在不能访问 CAS、需要本机模拟时使用，建议另开 **8788**，与正常开发版分开：

```bash
HOST=127.0.0.1 PORT=8788 SID_DEV=1 SID_TEST=1 \
  "$NODE" "$PWD/online/server.js"
```

打开 http://127.0.0.1:8788/，使用测试昵称加入。

**`SID_TEST=1` 不只是免登录：它会开放真实状态和测试控制接口。只可绑定本机回环地址，禁止给同事或正式环境开放。** 不要设置 `SID_SSO_SEED` 来运行共享试玩；该变量仅供测试驱动使用。

## 3. 发布固定局域网试玩版（8790）

这里的“发布”是**在本机创建固定提交副本并提供局域网服务**，不是公网部署或正式活动上线。当前没有统一发布脚本或 `npm run build`。

### 3.1 从已提交版本生成固定副本

未提交改动不会进入构建。发布前先完成目标版本的测试和提交，下面命令默认固定本地 `dev` 当前提交：

```bash
git status --short --branch
git log -1 --oneline dev

export VERSION="$(git rev-parse dev)"
export RELEASE_DIR="$PWD/releases/sid-playtest-$(git rev-parse --short "$VERSION")"

# 拒绝覆盖已有发布目录，特别是已经运行或有配置的副本。
if [ -e "$RELEASE_DIR" ]; then
  printf '目录已存在，请复用原版本或使用新的独立目录：%s\n' "$RELEASE_DIR"
else
  mkdir -p "$PWD/releases"
  mkdir "$RELEASE_DIR"
  # pipefail 确保 git archive 失败不会被 tar 的退出码掩盖。
  (set -o pipefail; git archive "$VERSION" online | tar -x -C "$RELEASE_DIR") &&
    printf '%s\n' "$VERSION" > "$RELEASE_DIR/BUILD_COMMIT"
fi
```

如果导出失败，**不要启动不完整目录**；检查错误后另外选择新目录，不能直接覆盖正在运行的构建。

副本应包含 `online/server.js`、`room.js`、`sso.js`、`shared/` 和 `public/`，全部来自同一提交；不使用符号链接，也不回指开发目录。

```bash
# 校验入口并保存构建指纹；这些命令只检查构建，不启动游戏。
test -s "$RELEASE_DIR/BUILD_COMMIT" && \
  "$NODE" --check "$RELEASE_DIR/online/server.js" && \
  "$NODE" --check "$RELEASE_DIR/online/room.js" && \
  "$NODE" --check "$RELEASE_DIR/online/sso.js"

# 源码指纹文件位于构建根；路径可直接交给 shasum -c 校验。
(cd "$RELEASE_DIR" && \
  shasum -a 256 online/*.js online/public/*.js online/public/*.html \
    online/public/*.css online/shared/*.js > SHA256SUMS)
(cd "$RELEASE_DIR" && shasum -a 256 -c SHA256SUMS)
```

配置此副本自己的 `.env`：

```bash
# 不覆盖已经配置好的发布环境。
if [ ! -f "$RELEASE_DIR/.env" ]; then cp .env.example "$RELEASE_DIR/.env"; fi
# 随后编辑 "$RELEASE_DIR/.env" 中的 CAS 地址和有效期。
```

`.env.example` 是模板，并非已经可用的 CAS 配置；若生产配置与开发配置不同，不要直接复制开发 `.env`。构建的 `.env` 放在 **副本根目录**，不是 `online/` 内。

### 3.2 启动固定版

先确认本机实际局域网 IP 和 8790 是否空闲：

```bash
"$NODE" -e 'for (const xs of Object.values(require("os").networkInterfaces())) for (const x of xs || []) if (x.family === "IPv4" && !x.internal) console.log(x.address)'
lsof -nP -iTCP:8790 -sTCP:LISTEN
```

将下面 IP 改为上一步核实的地址（历史地址 `172.26.3.19` **不保证现在仍有效**）：

```bash
export LAN_IP=172.26.3.19
HOST="$LAN_IP" PORT=8790 SID_DEV=0 SID_TEST=0 \
  "$NODE" "$RELEASE_DIR/online/server.js"
```

同事在同一局域网访问 `http://<实际LAN_IP>:8790/` 并完成 CAS 登录。启动前确保 CAS 可以接受这个访问地址；本机可访问不等于其他电脑已通过防火墙、路由和回调验证。

**开发版建议固定用 `127.0.0.1:8787`，共享版固定用局域网 IP:8790，不混用。**

浏览器 cookie 按主机而非端口隔离：当前代码的游戏 cookie `sid_session`、CAS cookie `sid_user` 在“同主机不同端口”下可能互相覆盖。不要仅换端口就宣称会话隔离。若两版必须使用相同主机，应先实现并验证独立 cookie 命名，或采用独立域名/浏览器配置文件；旧版仅修改游戏 cookie 的补丁不能自动覆盖后来加入的 CAS cookie。

### 3.3 旧固定版本启动器（仅限本地已有副本）

本机曾生成的 `releases/sid-playtest-5bfadc4/` 带有校验器和前台监督启动器，可运行：

```bash
"$NODE" "$PWD/releases/sid-playtest-5bfadc4/verify-build.mjs"
"$NODE" "$PWD/releases/sid-playtest-5bfadc4/start-stable.mjs"
```

这两个脚本在被忽略的本地产物里，**新克隆仓库不会自动拥有它们，也不是最新版通用发布命令**。启动器要求其 manifest 指定的受管 Node 和局域网 IP，IP 变化会拒绝启动。

该旧版不含新 CAS、匿名坏人池、幽灵及最新资源冻结修复；不要因为名字叫 stable 就认为符合当前全部规则。不要直接编辑旧副本来升级；发布新提交应另建目录、重新验证，保留旧副本用于回退。

## 4. 停止与重启

### 前台服务

在启动服务的终端按 **Ctrl+C**。对于旧固定版监督启动器，Ctrl+C 会转发给其子服务。

### 找到其他终端启动的进程

```bash
# 先查出监听进程，人工确认COMMAND和PID。
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:8790 -sTCP:LISTEN

# 将12345替换为已确认的目标PID；没有进程时不要执行。
kill -TERM 12345

# 再次检查目标端口，确认监听已消失。
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

- 不使用 `killall node`、`pkill node` 或不加确认的批量杀进程命令，避免停止其他项目/试玩服务。
- 通过 `start-stable.mjs` 启动时优先停止其打印的 **Supervisor PID**，让它负责关闭子进程。
- 如果服务由 WorkBuddy 的后台任务托管，可以在对应任务里停止；不要重复启动同一端口，也不要依赖临时对话中的旧任务号或PID。
- 本 README 使用前台命令。需要长期运行应另行配置受管服务；不把 `nohup ... &` 当成自动可靠的常驻方案。

**重启 = 先停止目标服务，确认端口空闲，再重新执行该版本启动命令。** 这会新建内存局并清空登录会话，需要提前告知参与者。不要为了让前端改动生效就擅自重启同事正在玩的固定版。

## 5. 验证服务与查看日志

在另一个终端检查：

```bash
curl --noproxy '*' --connect-timeout 3 -sS -o /dev/null \
  -w '主页 HTTP %{http_code}\n' http://127.0.0.1:8787/

curl --noproxy '*' --connect-timeout 3 -sS -o /dev/null \
  -w '脚本 HTTP %{http_code}\n' http://127.0.0.1:8787/game.js

curl --noproxy '*' --connect-timeout 3 -sS \
  http://127.0.0.1:8787/api/auth/config
```

主页和脚本应返回200；正常模式的登录配置应显示需要登录。未登录访问游戏状态接口返回401是预期，不表示服务没启动。CAS 登录、SSE、跨机访问仍需另行验证，主页200不等于全功能通过。

日志默认输出到启动终端。若需要日志文件，可在启动命令后追加 `> /自行确认的日志路径/server.log 2>&1`，提前创建并检查日志父目录；这仍是前台运行，不会自动后台化。当前日志可能包含员工信息，不公开上传；日志已被Git忽略。

## 6. 测试命令（独立测试进程）

在仓库根目录、设置好 `NODE` 后执行：

```bash
"$NODE" online/sso-test.mjs
"$NODE" online/hammer-test.mjs
"$NODE" online/npc-test.mjs
"$NODE" online/ghost-offline-test.mjs

# 匿名池模块/HTTP/SSE：
"$NODE" online/bad-pool-test.mjs

# 再包含真实Chrome/CDP交互检查：
BAD_POOL_BROWSER=1 "$NODE" online/bad-pool-test.mjs
```

部分脚本使用8899/8900/8912等固定测试端口，先核对它们空闲并**顺序运行**，不要与别人的测试并发争用；脚本会启动自己的测试服务，不能指向正在玩的8787/8790。浏览器测试需要现有的Google Chrome，当前脚本有macOS安装路径假设。

测试模式必须只绑定回环地址。脚本失败时先查实际报错及预置条件，不删除断言“凑绿”；SKIP不是PASS。旧测试报告不证明后来CAS或其他改动已经通过回归。

## 7. Git操作约定

```bash
# 日常开发留在dev_wjr。
git switch dev_wjr
git status --short --branch

# 验收后合并本地dev，不默认推送或发布。
# 合并前先提交并检查dev_wjr修改；下面仅允许快进。
git switch dev
git merge --ff-only dev_wjr
git switch dev_wjr

# 经确认后才推送相应分支。
# git push origin dev_wjr
# git push origin dev
```

分支分叉时 `--ff-only` 会拒绝，请先核对历史，不自动强推或覆盖。**Git提交/合并/推送与运行服务升级是不同操作**：推送不会自动更新本地固定试玩副本，也不会自动重启游戏。
