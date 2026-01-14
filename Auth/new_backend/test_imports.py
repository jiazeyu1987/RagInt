"""
简化的测试脚本 - 仅测试导入
"""
import sys
print("测试导入...")

try:
    from authx import TokenPayload
    print("✓ authx.TokenPayload 导入成功")
except ImportError as e:
    print(f"✗ authx.TokenPayload 导入失败: {e}")
    sys.exit(1)

try:
    from core.security import auth
    print("✓ core.security.auth 导入成功")
except ImportError as e:
    print(f"✗ core.security.auth 导入失败: {e}")
    sys.exit(1)

try:
    from api import auth, users, knowledge, review, ragflow
    print("✓ 所有 API 模块导入成功")
except ImportError as e:
    print(f"✗ API 模块导入失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from main import create_app
    print("✓ main.create_app 导入成功")
except Exception as e:
    print(f"✗ main.create_app 导入失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n✅ 所有导入测试通过！")
print("\n启动后端:")
print("  python main.py")
print("\n或使用 uvicorn:")
print("  uvicorn main:app --host 0.0.0.0 --port 8001 --reload")
