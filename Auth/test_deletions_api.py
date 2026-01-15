import requests
import json

# 测试删除记录API
url = "http://localhost:8001/api/knowledge/deletions"

# 注意：需要先登录获取token，这里用你的admin token
# 如果没有token，先运行登录脚本获取

headers = {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"
}

print(f"正在调用 API: {url}")
print(f"Headers: {headers}")

response = requests.get(url, headers=headers)

print(f"\n状态码: {response.status_code}")
print(f"响应头: {dict(response.headers)}")

try:
    data = response.json()
    print(f"\n返回数据:")
    print(json.dumps(data, indent=2, ensure_ascii=False))

    if 'deletions' in data:
        print(f"\n删除记录数量: {data['deletions']}")
        print(f"总计: {data.get('count', 0)}")

        if data['deletions']:
            print(f"\n第一条记录:")
            print(json.dumps(data['deletions'][0], indent=2, ensure_ascii=False))
except Exception as e:
    print(f"\n解析JSON失败: {e}")
    print(f"原始响应: {response.text}")
