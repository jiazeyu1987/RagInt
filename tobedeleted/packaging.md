# 安装包 / 升级包（MVP）

仓库内提供脚本 `scripts/package_release.py` 用于生成交付 zip：

- 全量安装包：包含后端、前端源码、文档、docker-compose 等
- 增量升级包：包含 `backend/` + `fronted/build/` + 部署示例文件（用于覆盖升级）

## 使用

从仓库根目录：

- 全量安装包：`python scripts/package_release.py --mode full --version 0.0.0`
- 增量升级包：`python scripts/package_release.py --mode upgrade --version 0.0.1`

输出默认在 `dist/`，并包含：

- `manifest.json`：文件清单 + sha256
- `UPGRADE.md`：升级与回滚指引（每次构建会写入包内）

## 校验与回滚

详见包内 `UPGRADE.md`。升级前务必备份：

- `backend/data/`（SQLite 等数据）
- `.env` / 环境变量配置
- `fronted/build/`（前端静态资源）

