@echo off
REM FastAPI + AuthX 系统启动脚本 (Windows)

echo =================================================
echo   启动 FastAPI + AuthX 认证系统
echo =================================================
echo.

REM 检查 Python
echo 1. 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python 未安装
    echo 请从 https://www.python.org/downloads/ 下载安装
    pause
    exit /b 1
)

python --version
echo ✓ Python 已安装
echo.

REM 检查文件
if not exist "new_backend\main.py" (
    echo ❌ 请在 Auth 目录下运行此脚本
    pause
    exit /b 1
)

echo 2. 初始化数据库...
cd new_backend\database
python init_db.py
if errorlevel 1 (
    echo ❌ 数据库初始化失败
    pause
    exit /b 1
)
cd ..\..
echo.

echo 3. 安装依赖...
cd new_backend
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo ⚠️  部分依赖安装失败，请检查
)
cd ..\
echo.

echo =================================================
echo   数据库和后端已就绪！
echo =================================================
echo.
echo 后端启动命令:
echo   cd new_backend
echo   python -m app
echo.
echo 前端启动命令:
echo   cd fronted
echo   npm start
echo.
echo 访问地址:
echo   后端 API: http://localhost:8001
echo   后端文档: http://localhost:8001/docs
echo   前端界面: http://localhost:3001
echo.
echo 默认账户:
echo   用户名: admin
echo   密码: admin123
echo.
echo =================================================
echo.

pause
