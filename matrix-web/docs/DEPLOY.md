# 部署与运维

这是独立的好多鱼图文矩阵网站。运行环境为 Node.js 24，自带 `http` 和 `node:sqlite`，没有生产 npm 依赖；不需要 OpenAI、xAI 登录或模型 API。旧站代码、服务和数据库不参与部署。本说明提供标准 Docker 主机部署步骤，不表示站点已经上线。

## 部署前提与配置

准备支持 Docker 的主机、指向该主机的独立域名，以及终止 HTTPS 的反向代理。第一版使用单个应用实例和一个 SQLite 数据卷；不要让多个独立容器从网络文件系统共同写同一个 SQLite 文件。

环境变量：

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | 生产设置为 `production`。 |
| `HOST` | 容器内监听地址，例如 `0.0.0.0`。 |
| `PORT` | 容器内监听端口，例如 `3000`。 |
| `SITE_ORIGIN` | 浏览器访问的唯一公开来源，例如 `https://matrix.example.com`，包含协议和必要端口，无路径；生产必须 HTTPS。 |
| `MATRIX_DB_PATH` | SQLite 文件路径，默认 `./data/matrix.sqlite`。生产指向持久数据卷。 |

生产配置不能把 `SITE_ORIGIN` 写成容器地址、反代内部地址或与浏览器访问不同的域名。会话写操作会检查来源和 CSRF token。反向代理保留浏览器原始 `Origin`，不要将任意外部请求改写成可信来源。

## Docker 运行

在项目 `matrix-web` 目录中构建。下列域名只是示例，需替换：

```bash
docker build -t haoduoyu-matrix:v1 .
docker volume create haoduoyu-matrix-data
docker volume create haoduoyu-matrix-backups

docker run -d \
  --name haoduoyu-matrix \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e SITE_ORIGIN=https://matrix.example.com \
  -e MATRIX_DB_PATH=/app/data/matrix.sqlite \
  -v haoduoyu-matrix-data:/app/data \
  -v haoduoyu-matrix-backups:/app/backups \
  haoduoyu-matrix:v1
```

数据目录必须对镜像内应用用户可写。遇到权限错误时修正该专用卷的所有者，不要开放整个主机目录权限。容器重建或镜像升级必须重新挂载同一个数据卷；删除容器不应删除卷，禁止使用会同时删除业务卷的清理命令。

公开健康探针为 `GET /health`，只报告服务健康，不返回账号和业务数据。`GET /openapi.json`、`GET /api-docs` 可以匿名读取；业务接口需要管理员会话或有范围限制的 Bearer token。

## 首次管理员与密码重置

没有公开注册，没有默认管理员密码。通过管理员 CLI 创建用户。CLI 使用 `node scripts/admin.mjs`，npm 入口为 `npm run admin`；用户名参数不是密码。

下面命令从终端隐藏输入密码，再经 stdin 传入容器；不要把密码写入命令参数、Docker 环境变量、Git 或 shell 历史：

```bash
read -r -s -p '首次管理员密码: ' MATRIX_ADMIN_PASSWORD
printf '\n'
printf '%s\n' "$MATRIX_ADMIN_PASSWORD" \
  | docker exec -i haoduoyu-matrix \
      npm run admin -- create --username owner
unset MATRIX_ADMIN_PASSWORD
```

CLI 也允许从 stdin 读取密码与确认密码两行。密码需要 12 至 256 个字符，用户名需要 3 至 80 个字母、数字或 `. _ @ -`。使用唯一强密码。若用户名已经存在，先核对实际用户，不要创建同名替代用户。

忘记密码时，具备该主机与卷访问权的管理员可运行：

```bash
read -r -s -p '新管理员密码: ' MATRIX_ADMIN_PASSWORD
printf '\n'
printf '%s\n' "$MATRIX_ADMIN_PASSWORD" \
  | docker exec -i haoduoyu-matrix \
      npm run admin -- reset-password --username owner
unset MATRIX_ADMIN_PASSWORD
```

本地运行相同 CLI 时，确保 `MATRIX_DB_PATH` 与实际应用使用的数据库一致。例如在项目目录执行 `npm run admin -- create --username owner`，并从 stdin 提供密码。不要误在临时容器的默认目录创建另一份空数据库。

## HTTPS 反向代理

应用容器仅绑定主机回环端口，由反向代理提供 HTTPS。例如使用 Caddy：

```caddyfile
matrix.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy 与应用位于不同容器时，使用专用 Docker 网络和应用服务名作为上游，避免公开应用端口。其他代理同样需要有效 TLS 证书、保留必要请求头，以及合理的请求体和超时限制。只有最终 HTTPS 域名应面向互联网。

上线前通过 HTTPS 完成登录、退出、修改密码与会话写入验收，确认安全 cookie 正常工作。公开访问不等于开放写权限，不能为了让 AI 接入而取消认证或放开跨来源写入。

## API key 与权限

管理员在站内创建 key，限制账号范围和读写权限。原始 token 仅在创建时返回一次；数据库保存 token hash，不保存可恢复的原文。会话 token 也只保存 hash，密码保存单向密码 hash。数据库、备份和审计内容仍是私有数据，须限制主机访问。

丢失 token 无法从数据库恢复：新建 key、更新获授权的执行器、撤销旧 key。撤销后验证旧 key 失效。不要把真实 token 加入公开 OpenAPI 示例、部署脚本或文档。

## 一致性备份

项目提供 `scripts/backup.mjs`，通过 Node 内置 SQLite backup 创建一致性在线备份；不需要停止应用。脚本将备份文件权限设为 `0600`，自动创建的父目录为 `0700`。每份备份使用不同文件名，避免覆盖已验证的备份。示例先在独立备份卷中创建，再导出到主机受控目录：

```bash
mkdir -p backups
chmod 700 backups
MATRIX_BACKUP_NAME="matrix-$(date -u +%Y%m%dT%H%M%SZ).sqlite"

docker exec haoduoyu-matrix \
  npm run backup -- "/app/backups/$MATRIX_BACKUP_NAME"
docker cp "haoduoyu-matrix:/app/backups/$MATRIX_BACKUP_NAME" \
  "./backups/$MATRIX_BACKUP_NAME"
chmod 600 "./backups/$MATRIX_BACKUP_NAME"
```

本地命令为 `npm run backup -- /受控目录/filename.sqlite`；确保 `MATRIX_DB_PATH` 指向实际应用数据库。在线备份文件可以独立恢复，无需另外热复制 WAL 文件。备份目标不能与源数据库相同。

SQLite 使用中的文件可能伴随 `-wal`、`-shm`。普通复制正在写入的数据库文件不能保证一致性。若选择归档整个数据卷，必须先停止应用；这是另一种备份方式：

```bash
mkdir -p backups
chmod 700 backups
docker stop haoduoyu-matrix

docker run --rm \
  -v haoduoyu-matrix-data:/data:ro \
  -v "$PWD/backups:/backup" \
  alpine:3.22 \
  tar -czf /backup/matrix-data.tgz -C /data .

chmod 600 backups/matrix-data.tgz
docker start haoduoyu-matrix
```

每份备份使用独立文件名，避免覆盖最后一个已验证备份。记录时间、应用版本与校验值，定期在隔离环境验证恢复。备份不输出 token 明文，但包含私有业务数据和 hash，应按私有数据保护。

如果备份或归档失败，先保留生产卷，确认失败原因后重试；不以空文件替代备份。项目在线备份脚本已在开发环境验证可读回及 `0600` 权限；生产备份存储、传输与隔离恢复仍需实际验收。

## 恢复与升级回退

恢复前停止写入、停止生产容器，并先为当前卷留一份独立备份。优先恢复到一个新数据卷，保留旧卷作为回退点：

若使用在线备份生成的单个 `.sqlite` 文件，将下例文件名替换为实际备份名，复制进空的新卷，并修正为镜像内 `node` 用户可访问：

```bash
docker stop haoduoyu-matrix
docker volume create haoduoyu-matrix-restored

docker run --rm \
  -v haoduoyu-matrix-restored:/data \
  -v "$PWD/backups:/backup:ro" \
  alpine:3.22 \
  cp /backup/filename.sqlite /data/matrix.sqlite

docker run --rm --user root \
  -v haoduoyu-matrix-restored:/data \
  haoduoyu-matrix:v1 \
  chown -R node:node /data
```

若使用停服务后生成的整卷 `.tgz` 归档，则改用下面的恢复方式；两种方式二选一，不向已有业务卷直接覆盖：

```bash
docker stop haoduoyu-matrix
docker volume create haoduoyu-matrix-restored

docker run --rm \
  -v haoduoyu-matrix-restored:/data \
  -v "$PWD/backups:/backup:ro" \
  alpine:3.22 \
  tar -xzf /backup/matrix-data.tgz -C /data
```

随后使用原版本镜像、相同环境配置和新卷创建隔离恢复实例，检查数据目录所有者、数据库完整性、管理员登录、账号数量、文章、快照、日报与撤销状态。确认后再切换生产容器挂载卷；不要同时启动新旧实例写相同数据。恢复测试不得调用外部平台写入。

升级前停止服务并备份，保留旧镜像和旧卷。在确认新版本数据库兼容前，不应直接让旧程序读取已迁移的数据。完成恢复或升级后重新核对权限与 key；备份恢复可能带回备份时尚未撤销的会话或 key，必要时由管理员重新撤销。

## 部署验收

按 [ACCEPTANCE.md](./ACCEPTANCE.md) 检查。至少确认：HTTPS 和 `SITE_ORIGIN` 一致、无公开注册、匿名不能访问业务数据、跨账号 key 隔离、幂等重试不重复、版本冲突可见、数据卷重建保留业务记录、隔离恢复成功。

当前文档没有部署任何外部服务，也不声明域名、证书、外部 AI 连接或平台自动采数已经配置。
