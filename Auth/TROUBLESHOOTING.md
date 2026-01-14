# 🔧 问题诊断和解决方案

## 问题：Python Exit code 49

### 原因
你安装的是 **Windows Store Python stub**，而不是完整的 Python。

### 验证方法

打开 PowerShell，运行以下命令：

```powershell
# 检查 Python 版本
python --version

# 如果显示 "Python 3.10.x" 或显示应用商店，说明安装的是 stub
# 如果显示具体版本号且能正常运行，说明安装的是完整版
```

### 解决方案

#### 方案 1: 使用现有的 Python310 环境

你已经有一个 `(py310)` 虚拟环境，这很好！确保使用这个环境：

```powershell
# 激活虚拟环境
cd D:\ProjectPackage\RagInt\Auth
Activate-PS py310

# 或手动激活
D:\ProjectPackage\RagInt\Auth\Scripts\Activate.ps1

# 然后安装依赖
cd new_backend
pip install -r requirements.txt

# 启动后端
python main.py
```

#### 方案 2: 安装完整的 Python（推荐）

如果虚拟环境也有问题，请下载完整的 Python：

1. **卸载 Windows Store Python**:
   ```powershell
   # 打开 Windows 设置
   # → 应用 → Python 3.10 → 卸载
   ```

2. **下载完整 Python**:
   - 访问: https://www.python.org/downloads/
   - 下载 Python 3.10.x
   - 安装时勾选 **"Add Python to PATH"**

3. **验证安装**:
   ```powershell
   # 打开新的 PowerShell 窗口
   python --version
   # 应该显示: Python 3.10.x
   ```

#### 方案 3: 使用系统 Python 路径

如果你的系统有其他 Python 安装，直接使用完整路径：

```powershell
# 查找所有 Python 安装
where python

# 使用完整路径
C:\Python310\python.exe main.py
```

---

## 🔍 依赖安装问题

### 问题：ModuleNotFoundError

**症状**:
```
ModuleNotFoundError: No module named 'fastapi'
ModuleNotFoundError: No module named 'authx'
```

**解决方案**:

```powershell
# 确保在正确的环境中
cd D:\ProjectPackage\RagInt\Auth\new_backend

# 安装依赖
pip install fastapi uvicorn authx pydantic pydantic-settings

# 或使用 requirements.txt
pip install -r requirements.txt
```

### 问题：pip 安装失败

**解决方案**:

```powershell
# 升级 pip
python -m pip install --upgrade pip

# 使用国内镜像源
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## 🗄️ 数据库初始化

### 问题：数据库文件不存在

**解决方案**:

```powershell
cd D:\ProjectPackage\RagInt\Auth\new_backend\database
python init_db.py
```

**预期输出**:
```
==================================================
Initializing Auth Backend Database...
==================================================

✓ Backing up old database to: ...
✓ Creating new schema...
✓ Created default admin user (username: admin, password: admin123)
✓ Database initialized at: ...\auth.db

==================================================
Database initialization complete!
==================================================
```

---

## 🚀 启动后端

### 方法 1: 使用 python main.py

```powershell
cd D:\ProjectPackage\RagInt\Auth\new_backend
python main.py
```

### 方法 2: 使用 uvicorn（推荐）

```powershell
cd D:\ProjectPackage\RagInt\Auth\new_backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 方法 3: 使用 __main__.py

```powershell
cd D:\ProjectPackage\RagInt\Auth\new_backend
python -m app
```

---

## ✅ 验证后端运行

### 1. 检查健康端点

```powershell
# 在浏览器或 PowerShell 中访问
curl http://localhost:8001/health
```

**预期输出**:
```json
{"status": "ok", "service": "auth-backend-fastapi"}
```

### 2. 访问 API 文档

在浏览器中打开:
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

### 3. 测试登录 API

```powershell
curl -X POST http://localhost:8001/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username": "admin", "password": "admin123"}'
```

**预期输出**:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "scopes": ["users:*", "kb_documents:*", "ragflow_documents:*"]
}
```

---

## 🔧 常见错误

### 错误 1: ImportError: cannot import name 'auth'

**原因**: 变量名冲突

**状态**: ✅ 已修复

**修复**: 使用 `from core.security import auth as authx_auth`

### 错误 2: UnboundLocalError: local variable 'auth' referenced before assignment

**原因**: 导入遮蔽

**状态**: ✅ 已修复

**修复**: 重命名为 `authx_auth`

### 错误 3: 数据库连接错误

**原因**: 数据库文件不存在

**解决方案**:
```powershell
cd database
python init_db.py
```

### 错误 4: CORS 错误

**原因**: 前端 URL 不在允许列表中

**解决方案**: 检查 `config.py` 的 `CORS_ORIGINS`

---

## 📋 完整的启动流程

### 步骤 1: 准备 Python 环境

```powershell
# 检查 Python 版本（使用 py310 环境）
(py310) python --version
# 应该显示: Python 3.10.x
```

### 步骤 2: 安装依赖

```powershell
# 激活虚拟环境（如果需要）
(py310) cd new_backend

# 安装依赖
(py310) pip install -r requirements.txt
```

### 步骤 3: 初始化数据库

```powershell
(py310) cd database
(py310) python init_db.py
```

### 步骤 4: 启动后端

```powershell
(py310) cd ..
(py310) python main.py
```

### 步骤 5: 验证运行

打开浏览器访问:
- http://localhost:8001/docs
- http://localhost:8001/health

---

## 💡 快速修复脚本

创建一个 `fix_and_start.bat` 脚本：

```batch
@echo off
echo ================================================
echo  修复并启动 FastAPI + AuthX 后端
echo ================================================

REM 激活 Python 3.10 环境
call Activate-PS py310

REM 安装依赖
echo.
echo [1/4] 安装依赖...
cd new_backend
pip install -r requirements.txt --quiet

REM 初始化数据库
echo.
echo [2/4] 初始化数据库...
cd database
python init_db.py

REM 启动后端
echo.
echo [3/4] 启动后端...
cd ..
python main.py

REM 完成
echo.
echo [4/4] 后端已启动！
echo 访问:
echo   - API 文档: http://localhost:8001/docs
echo   - 健康检查: http://localhost:8001/health
pause
```

---

## 🆘 仍然无法解决？

### 检查清单

- [ ] Python 版本是 3.8+（不是 Windows Store 版本）
- [ ] 所有依赖已安装（`pip list | grep -E "fastapi|authx"`）
- [ ] 数据库已初始化（`data/auth.db` 文件存在）
- [ ] 端口 8001 未被占用
- [ ] 防火墙未阻止

### 获取帮助

1. **查看错误日志**: 运行 `python main.py` 并查看完整错误信息
2. **测试依赖**: 运行 `python test_startup.py`
3. **查看文档**: `new_backend/README.md`
4. **检查兼容性**: `COMPATIBILITY.md`

---

## ✅ 成功启动的标志

运行 `python main.py` 后，应该看到：

```
==================================================
Auth Backend (FastAPI + AuthX) starting...
URL: http://localhost:8001
Health: http://localhost:8001/health
Docs: http://localhost:8001/docs
==================================================
✓ Dependencies initialized

INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001
```

然后访问 http://localhost:8001/docs 应该看到 Swagger UI！

---

## 🎯 下一步

后端启动成功后：

1. **测试 API**: 使用 Swagger UI 测试各个端点
2. **启动前端**: `cd fronted && npm start`
3. **完整测试**: 按照 `MIGRATION_SUMMARY.txt` 中的测试清单

---

**祝你成功启动！** 🚀
