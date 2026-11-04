# S-ID：年终生存战 —— 联机服务端镜像
# 零 npm 依赖（Node 内置 node:sqlite，要求 >= 22.13，无需实验开关），无构建步骤，直接 COPY 源码运行。
#
# 构建（在仓库根目录执行）：
#   docker build -t sid-hunter:latest .
# 运行（先参考 .env.example 配置仓库根目录 .env）：
#   docker run -d --name sid-hunter \
#     -p 8898:8787 \
#     -v sid-data:/app/online/.data \
#     --env-file .env \
#     -e SID_MANAGER_CODE='<强随机值>' \
#     sid-hunter:latest
#   浏览器访问 http://<host>:8898/
#
# 注意：
# - 只能单副本运行（房间状态在内存，多副本会分裂成互不相通的房间）。
# - /app/online/.data 是 SQLite 持久化目录（每 5 秒快照），务必挂卷，删容器不丢成绩。
# - 重启后从挂载卷的快照恢复场次；CAS/管理员会话需重新登录，异常退出可能丢失最近未落盘的进度。
# - CAS/员工档案等配置通过环境变量注入，参考仓库根目录 .env.example；
#   本地昵称试玩可加 -e SID_SSO=0（仅限内网试玩，正式环境勿用）。

FROM node:22-alpine

# 构建元数据，便于回溯镜像对应哪次提交（构建时用 --build-arg 注入）
ARG VERSION=dev
ARG REVISION=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="S-ID 年终生存战" \
      org.opencontainers.image.description="像素办公室社交推理游戏 —— 联机服务端" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="Proprietary" \
      org.opencontainers.image.base.name="docker.io/library/node:22-alpine"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

WORKDIR /app

# 服务端运行时只需要这两个目录：
# - online/  服务端 + 客户端静态资源 + shared 世界数据
# - tiled/   TMJ 地图源（server/config.js 以 ../../tiled 相对路径只读托管）
# 目录层级必须与仓库一致，相对路径依赖不可拆散。
COPY online/ ./online/
COPY tiled/  ./tiled/

# SQLite 数据目录：归属 node 用户，供挂卷持久化
RUN mkdir -p /app/online/.data && chown -R node:node /app

USER node

VOLUME ["/app/online/.data"]

EXPOSE 8787

# 健康检查：HTTP 可响应、存储已启用且没有已知存档错误；休场/暂停不影响健康。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/online
CMD ["node", "server.js"]
