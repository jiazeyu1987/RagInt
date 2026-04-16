# 测试服务器发布运行手册（LLM可执行版）

## 1. 目的
本手册用于在新电脑上完成以下任务：
1. 登录测试服务器。
2. 将本地 `RagInt` 前后端发布到测试服务器。
3. 验证服务是否正常运行。
4. 需要时执行回滚。

本文档按可执行顺序编写，给不了解项目背景的 LLM 或新同事直接使用。

## 2. 项目与发布对象
1. 本地项目根目录：`D:\ProjectPackage\RagInt`
2. 发布脚本：`publish_to_test.py`
3. 一键入口：`publish_test_oneclick.bat`
4. 远端编排文件：`scripts/deploy/docker-compose.remote.yml`
5. 远端运行模式：Docker Compose（三个容器）
6. 容器名：
   1. `ragint-fronted`
   2. `ragint-backend`
   3. `ragint-redis`

## 3. 当前测试环境固定参数
以下是当前可用的测试环境参数（2026-03-18 已验证）：

1. 服务器地址：`172.30.30.58`
2. SSH 用户：`root`
3. SSH 端口：`22`
4. 发布目录：`/opt/ragint`
5. 前端对外端口：`4981`
6. 后端对外端口：`8000`
7. 前端访问地址：`http://172.30.30.58:4981/`
8. 登录页：`http://172.30.30.58:4981/login`
9. 对话页：`http://172.30.30.58:4981/chat`
10. 健康检查：`http://172.30.30.58:4981/health`
11. 版本检查：`http://172.30.30.58:4981/api/version`

## 4. 登录方式（重点）
本项目发布使用 **SSH 密钥登录**，不是密码登录。

1. 当前机器使用的私钥路径：`C:/Users/BJB110/.ssh/id_rsa`
2. 新电脑必须具备可登录该服务器的私钥文件。
3. 新电脑可先执行连通性验证：

```powershell
ssh -i C:\Users\<你的用户名>\.ssh\id_rsa root@172.30.30.58 -p 22 "echo ok"
```

预期输出包含 `ok`。

## 5. 一键发布（推荐）

### 5.1 首次准备
1. 打开项目目录：`D:\ProjectPackage\RagInt`
2. 双击运行：`publish_test_oneclick.bat`
3. 若本地配置不存在，脚本会自动生成：`scripts/deploy/publish.profile.local.json`
4. 脚本会自动打开配置文件，先填写后再运行一次。

### 5.2 一键发布命令（等价）
```powershell
cmd /c publish_test_oneclick.bat
```

### 5.3 本地配置文件（关键）
文件：`scripts/deploy/publish.profile.local.json`

当前有效示例：

```json
{
  "host": "172.30.30.58",
  "user": "root",
  "ssh_port": 22,
  "ssh_key": "C:/Users/BJB110/.ssh/id_rsa",
  "remote_dir": "/opt/ragint",
  "frontend_port": 4981,
  "backend_port": 8000,
  "health_timeout_s": 180,
  "skip_health_check": false
}
```

字段说明：
1. `host`：测试服务器 IP。
2. `user`：SSH 用户名。
3. `ssh_port`：SSH 端口。
4. `ssh_key`：私钥路径（新电脑要改成新电脑上的路径）。
5. `remote_dir`：远端发布根目录。
6. `frontend_port`：前端映射端口。
7. `backend_port`：后端映射端口。
8. `health_timeout_s`：健康检查超时秒数。
9. `skip_health_check`：是否跳过健康检查。

## 6. 发布脚本实际执行流程
`publish_to_test.py publish` 的固定流程如下：

1. 本地构建后端镜像：`ragint-backend:<tag>`
2. 本地构建前端镜像：`ragint-fronted:<tag>`
3. 本地打包镜像 tar。
4. 远端创建目录：`/opt/ragint/releases`、`/opt/ragint/runtime` 等。
5. 上传 compose 文件和镜像 tar 到远端。
6. 远端 `docker load` 导入镜像。
7. 更新远端 `.env` 并执行 `docker compose up -d`。
8. 访问 `/health` 与 `/api/version` 进行验证。
9. 写入发布状态文件与发布记录。

## 7. 远端目录与状态文件
远端关键路径全部在 `/opt/ragint` 下：

1. 运行目录：`/opt/ragint/runtime`
2. 发布包目录：`/opt/ragint/releases`
3. Compose 文件：`/opt/ragint/runtime/docker-compose.yml`
4. 运行环境：`/opt/ragint/runtime/.env`
5. 发布状态：`/opt/ragint/runtime/release_state.env`
6. 数据目录：`/opt/ragint/runtime/data/backend`
7. 配置文件：`/opt/ragint/runtime/config/ragflow_config.json`

本地发布记录：
1. `scripts/deploy/logs/publish-<tag>.json`
2. `scripts/deploy/logs/rollback-<tag>.json`

## 8. 发布后验证（必须做）

### 8.1 浏览器验证
1. `http://172.30.30.58:4981/login`
2. `http://172.30.30.58:4981/chat`
3. `http://172.30.30.58:4981/health`
4. `http://172.30.30.58:4981/api/version`

### 8.2 远端命令验证
```bash
cd /opt/ragint/runtime
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=200
```

## 9. 回滚方式
支持回滚到指定 tag，或回滚到上一次版本。

### 9.1 回滚到指定 tag
```powershell
python publish_to_test.py rollback `
  --profile scripts/deploy/publish.profile.local.json `
  --to-tag 20260318_102522
```

### 9.2 回滚到上一次版本
```powershell
python publish_to_test.py rollback --profile scripts/deploy/publish.profile.local.json
```

脚本会读取远端 `release_state.env` 中的 `PREVIOUS_TAG`。

## 10. 新电脑完整迁移清单
按顺序执行：

1. 安装 Docker Desktop（确保 `docker` 与 `docker compose` 可用）。
2. 安装 Python 3.10+（可执行 `python` 命令）。
3. 安装 OpenSSH Client（可执行 `ssh`、`scp`）。
4. 拉取仓库到本地，如：`D:\ProjectPackage\RagInt`。
5. 放置可用私钥到新电脑 `.ssh` 目录。
6. 修改 `scripts/deploy/publish.profile.local.json` 中 `ssh_key` 路径。
7. 执行 SSH 连通验证命令。
8. 运行 `publish_test_oneclick.bat`。
9. 发布成功后访问前端 URL 验证。

## 11. 常见问题与处理

### 11.1 SSH 权限或连接失败
现象：
1. `Permission denied (publickey)`。
2. 无法连接服务器。

处理：
1. 检查私钥路径是否正确。
2. 检查私钥是否有权限访问该服务器。
3. 检查 `host/user/port` 是否一致。

### 11.2 发布脚本报错中断
处理原则：
1. 本脚本为“失败即停止”，不做兜底。
2. 按报错信息修复后重试。

### 11.3 健康检查失败
处理：
1. 远端执行 `docker compose ps` 看容器状态。
2. 查看 `fronted/backend` 日志定位启动失败原因。
3. 检查服务器防火墙与端口开放（`4981`、`8000`）。

### 11.4 构建依赖相关失败
后端镜像已在 `backend/Dockerfile` 中安装以下构建依赖：
1. `build-essential`
2. `gcc`
3. `python3-dev`
4. `portaudio19-dev`
5. `libasound2-dev`
6. `ffmpeg`

## 12. 给 LLM 的最短执行指令
若让 LLM 在新电脑直接执行，请给它以下要求：

1. 先读取 `doc/测试服务器发布运行手册-LLM可执行版.md`。
2. 再读取 `scripts/deploy/publish.profile.local.json`。
3. 确认 `ssh_key` 可用后执行 `cmd /c publish_test_oneclick.bat`。
4. 发布后自动检查：
   1. `http://172.30.30.58:4981/health`
   2. `http://172.30.30.58:4981/api/version`
   3. `http://172.30.30.58:4981/login`
5. 若失败，返回完整错误日志，不要做隐式兜底。

