import argparse
import base64
import json
import os
import time
import uuid

import requests


DEFAULT_RECOGNIZE_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
DEFAULT_RESOURCE_ID = "volc.bigasr.auc_turbo"
DEFAULT_APP_KEY = "5843355819"
DEFAULT_ACCESS_KEY = "UQOb6ysCJectPRgE4ZcG4pGMv-CAY3w1"


def file_to_base64(file_path: str) -> str:
    with open(file_path, "rb") as file:
        return base64.b64encode(file.read()).decode("utf-8")


def recognize_task(
    app_key: str,
    access_key: str,
    file_url: str = "",
    file_path: str = "",
    resource_id: str = DEFAULT_RESOURCE_ID,
    recognize_url: str = DEFAULT_RECOGNIZE_URL,
) -> requests.Response:
    headers = {
        "X-Api-App-Key": app_key,
        "X-Api-Access-Key": access_key,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Request-Id": str(uuid.uuid4()),
        "X-Api-Sequence": "-1",
    }

    audio_data = None
    if file_url:
        audio_data = {"url": file_url}
    elif file_path:
        audio_data = {"data": file_to_base64(file_path)}

    if not audio_data:
        raise ValueError("Either --file-url or --file-path is required.")

    request_body = {
        "user": {"uid": app_key},
        "audio": audio_data,
        "request": {"model_name": "bigmodel"},
    }

    response = requests.post(recognize_url, json=request_body, headers=headers, timeout=120)
    if "X-Api-Status-Code" in response.headers:
        print(f'X-Api-Status-Code: {response.headers.get("X-Api-Status-Code", "")}')
        print(f'X-Api-Message: {response.headers.get("X-Api-Message", "")}')
        print(f'X-Tt-Logid: {response.headers.get("X-Tt-Logid", "")}')
        print(f"Response JSON: {response.json()}\n")
    else:
        print(f"Request failed. Response headers: {response.headers}\n")
    return response


def recognize_mode(
    app_key: str,
    access_key: str,
    file_url: str = "",
    file_path: str = "",
    resource_id: str = DEFAULT_RESOURCE_ID,
    recognize_url: str = DEFAULT_RECOGNIZE_URL,
    output_path: str = "result.json",
) -> int:
    start_time = time.time()
    print(time.asctime() + " START!")
    recognize_response = recognize_task(
        app_key=app_key,
        access_key=access_key,
        file_url=file_url,
        file_path=file_path,
        resource_id=resource_id,
        recognize_url=recognize_url,
    )

    code = recognize_response.headers.get("X-Api-Status-Code", "")
    logid = recognize_response.headers.get("X-Tt-Logid", "")
    if code == "20000000":
        with open(output_path, mode="w", encoding="utf-8") as result_file:
            result_file.write(json.dumps(recognize_response.json(), indent=4, ensure_ascii=False))
        print(time.asctime() + " SUCCESS!\n")
        print(f"Elapsed: {time.time() - start_time:.3f}s")
        print(f"Saved result to: {output_path}")
        return 0
    if code not in ("20000001", "20000002"):
        print(time.asctime() + f" FAILED! code: {code}, logid: {logid}")
        return 1
    print(f"Task pending. code: {code}, logid: {logid}")
    return 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Doubao Flash ASR Demo")
    parser.add_argument("--app-key", default=os.getenv("DOUBAO_APP_KEY", DEFAULT_APP_KEY), help="X-Api-App-Key")
    parser.add_argument("--access-key", default=os.getenv("DOUBAO_ACCESS_KEY", DEFAULT_ACCESS_KEY), help="X-Api-Access-Key")
    parser.add_argument("--file-url", default="", help="Audio URL")
    parser.add_argument("--file-path", default="", help="Local audio file path")
    parser.add_argument("--resource-id", default=os.getenv("DOUBAO_RESOURCE_ID", DEFAULT_RESOURCE_ID), help="X-Api-Resource-Id")
    parser.add_argument("--recognize-url", default=DEFAULT_RECOGNIZE_URL, help="Flash recognize endpoint")
    parser.add_argument("--output", default="result.json", help="Output json path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.app_key or not args.access_key:
        print("Missing credentials. Set --app-key/--access-key or env DOUBAO_APP_KEY/DOUBAO_ACCESS_KEY.")
        return 1
    if not args.file_url and not args.file_path:
        print("Missing audio source. Set --file-url or --file-path.")
        return 1
    return recognize_mode(
        app_key=args.app_key,
        access_key=args.access_key,
        file_url=args.file_url,
        file_path=args.file_path,
        resource_id=args.resource_id,
        recognize_url=args.recognize_url,
        output_path=args.output,
    )


if __name__ == "__main__":
    raise SystemExit(main())
