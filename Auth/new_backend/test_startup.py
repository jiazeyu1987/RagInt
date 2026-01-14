"""
测试后端启动脚本
"""
import sys

print("=" * 60)
print("测试 FastAPI + AuthX 后端启动")
print("=" * 60)

# 测试 1: 检查依赖
print("\n1. 检查依赖...")
try:
    import fastapi
    print(f"   ✓ FastAPI {fastapi.__version__}")
except ImportError as e:
    print(f"   ✗ FastAPI 未安装: {e}")
    sys.exit(1)

try:
    import authx
    print(f"   ✓ AuthX {authx.__version__}")
except ImportError as e:
    print(f"   ✗ AuthX 未安装: {e}")
    sys.exit(1)

try:
    import pydantic
    print(f"   ✓ Pydantic {pydantic.__version__}")
except ImportError as e:
    print(f"   ✗ Pydantic 未安装: {e}")
    sys.exit(1)

# 测试 2: 导入配置
print("\n2. 导入配置...")
try:
    from config import settings
    print(f"   ✓ 配置加载成功")
    print(f"   - JWT_SECRET_KEY: {settings.JWT_SECRET_KEY[:10]}...")
    print(f"   - JWT_ACCESS_TOKEN_EXPIRES: {settings.JWT_ACCESS_TOKEN_EXPIRES}s")
    print(f"   - JWT_REFRESH_TOKEN_EXPIRES: {settings.JWT_REFRESH_TOKEN_EXPIRES}s")
except Exception as e:
    print(f"   ✗ 配置加载失败: {e}")
    sys.exit(1)

# 测试 3: 导入核心模块
print("\n3. 导入核心模块...")
try:
    from core.security import auth as authx_auth
    print(f"   ✓ AuthX 初始化成功")
except Exception as e:
    print(f"   ✗ AuthX 初始化失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from core.scopes import ROLE_SCOPES, get_scopes_for_role
    print(f"   ✓ Scopes 加载成功")
    print(f"   - 定义了 {len(ROLE_SCOPES)} 个角色")
    print(f"   - admin scopes: {len(get_scopes_for_role('admin'))} 个")
except Exception as e:
    print(f"   ✗ Scopes 加载失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 测试 4: 导入业务服务
print("\n4. 导入业务服务...")
try:
    from services.user_store import UserStore
    from services.kb_store import KbStore
    from services.ragflow_service import RagflowService
    print(f"   ✓ 业务服务加载成功")
except Exception as e:
    print(f"   ✗ 业务服务加载失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 测试 5: 创建应用
print("\n5. 创建 FastAPI 应用...")
try:
    from main import create_app
    app = create_app()
    print(f"   ✓ FastAPI 应用创建成功")
    print(f"   - 应用标题: {app.title}")
    print(f"   - 应用版本: {app.version}")
    print(f"   - 注册的路由: {len(app.routes)} 个")
except Exception as e:
    print(f"   ✗ 应用创建失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 测试 6: 检查数据库
print("\n6. 检查数据库...")
import os
from pathlib import Path

db_path = Path("data/auth.db")
if db_path.exists():
    print(f"   ✓ 数据库文件存在: {db_path}")
    print(f"   - 文件大小: {db_path.stat().st_size} 字节")
else:
    print(f"   ⚠ 数据库文件不存在: {db_path}")
    print(f"   请运行: cd database && python init_db.py")

print("\n" + "=" * 60)
print("✓ 所有测试通过！后端可以启动")
print("=" * 60)
print("\n启动命令:")
print("  cd new_backend")
print("  python main.py")
print("\n或使用 uvicorn:")
print("  uvicorn main:app --host 0.0.0.0 --port 8001 --reload")
print("\n访问:")
print("  - API 文档: http://localhost:8001/docs")
print("  - 健康检查: http://localhost:8001/health")
print("=" * 60)
