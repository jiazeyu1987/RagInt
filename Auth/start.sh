#!/bin/bash

# FastAPI + AuthX 系统启动脚本

echo "================================================"
echo "  启动 FastAPI + AuthX 认证系统"
echo "================================================"
echo ""

# 检查 Python 版本
echo "1. 检查 Python 环境..."
if ! command -v python &> /dev/null; then
    echo "❌ Python 未安装"
    echo "请从 https://www.python.org/downloads/ 下载安装"
    exit 1
fi

PYTHON_VERSION=$(python --version 2>&1)
echo "✓ Python 版本: $PYTHON_VERSION"

# 检查是否在正确的目录
if [ ! -f "new_backend/main.py" ]; then
    echo "❌ 请在 Auth 目录下运行此脚本"
    exit 1
fi

echo ""
echo "2. 初始化数据库..."
cd new_backend/database
python init_db.py
if [ $? -ne 0 ]; then
    echo "❌ 数据库初始化失败"
    exit 1
fi
cd ../..

echo ""
echo "3. 安装依赖..."
cd new_backend
pip install -r requirements.txt --quiet
if [ $? -ne 0 ]; then
    echo "⚠️  部分依赖安装失败，请检查"
fi
cd ..

echo ""
echo "================================================"
echo "  数据库和后端已就绪！"
echo "================================================"
echo ""
echo "后端启动命令:"
echo "  cd new_backend"
echo "  python -m app"
echo ""
echo "前端启动命令:"
echo "  cd fronted"
echo "  npm start"
echo ""
echo "访问地址:"
echo "  后端 API: http://localhost:8001"
echo "  后端文档: http://localhost:8001/docs"
echo "  前端界面: http://localhost:3001"
echo ""
echo "默认账户:"
echo "  用户名: admin"
echo "  密码: admin123"
echo ""
echo "================================================"
echo ""
