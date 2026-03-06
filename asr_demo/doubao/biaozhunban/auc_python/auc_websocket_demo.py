import argparse
import json
import os
import time
import uuid
from typing import Tuple

import requests


DEFAULT_SUBMIT_URL = "https://openspeech-direct.zijieapi.com/api/v3/auc/bigmodel/submit"
DEFAULT_QUERY_URL = "https://openspeech-direct.zijieapi.com/api/v3/auc/bigmodel/query"
DEFAULT_RESOURCE_ID = "volc.bigasr.auc"
DEFAULT_APP_KEY = "5843355819"
DEFAULT_ACCESS_KEY = "UQOb6ysCJectPRgE4ZcG4pGMv-CAY3w1"


def submit_task(
    app_key: str,
    access_key: str,
    file_url: str,
    resource_id: str = DEFAULT_RESOURCE_ID,
    submit_url: str = DEFAULT_SUBMIT_URL,
) -> Tuple[str, str]:
    task_id = str(uuid.uuid4())
    headers = {
        "X-Api-App-Key": app_key,
        "X-Api-Access-Key": access_key,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Request-Id": task_id,
        "X-Api-Sequence": "-1",
    }

    request_body = {
        "user": {"uid": "demo_uid"},
        "audio": {"url": file_url},
        "request": {
            "model_name": "bigmodel",
            "enable_channel_split": True,
            "enable_ddc": True,
            "enable_speaker_info": True,
            "enable_punc": True,
            "enable_itn": True,
            "corpus": {
                "correct_table_name": "",
                "context": "",
            },
        },
    }

    print(f"Submit task id: {task_id}")
    response = requests.post(submit_url, json=request_body, headers=headers, timeout=120)
    status_code = response.headers.get("X-Api-Status-Code", "")
    if status_code == "20000000":
        print(f"Submit status: {status_code}")
        print(f"Submit message: {response.headers.get('X-Api-Message', '')}")
        logid = response.headers.get("X-Tt-Logid", "")
        print(f"Submit X-Tt-Logid: {logid}\n")
        return task_id, logid

    raise RuntimeError(f"Submit failed. headers={response.headers}, body={response.text}")


def query_task(
    app_key: str,
    access_key: str,
    task_id: str,
    x_tt_logid: str,
    resource_id: str = DEFAULT_RESOURCE_ID,
    query_url: str = DEFAULT_QUERY_URL,
) -> requests.Response:
    headers = {
        "X-Api-App-Key": app_key,
        "X-Api-Access-Key": access_key,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Request-Id": task_id,
        "X-Tt-Logid": x_tt_logid,
    }

    response = requests.post(query_url, json={}, headers=headers, timeout=120)
    if "X-Api-Status-Code" not in response.headers:
        raise RuntimeError(f"Query failed. headers={response.headers}, body={response.text}")

    print(f"Query status: {response.headers.get('X-Api-Status-Code', '')}")
    print(f"Query message: {response.headers.get('X-Api-Message', '')}")
    print(f"Query X-Tt-Logid: {response.headers.get('X-Tt-Logid', '')}\n")
    return response


def run_task(
    app_key: str,
    access_key: str,
    file_url: str,
    resource_id: str,
    submit_url: str,
    query_url: str,
    poll_interval: float,
    poll_timeout: float,
    output_path: str,
) -> int:
    start = time.time()
    task_id, logid = submit_task(
        app_key=app_key,
        access_key=access_key,
        file_url=file_url,
        resource_id=resource_id,
        submit_url=submit_url,
    )

    while True:
        if time.time() - start > poll_timeout:
            print(f"Timeout waiting for task result. timeout={poll_timeout}s")
            return 1

        query_response = query_task(
            app_key=app_key,
            access_key=access_key,
            task_id=task_id,
            x_tt_logid=logid,
            resource_id=resource_id,
            query_url=query_url,
        )
        code = query_response.headers.get("X-Api-Status-Code", "")
        if code == "20000000":
            result = query_response.json()
            print(json.dumps(result, indent=2, ensure_ascii=False))
            with open(output_path, "w", encoding="utf-8") as result_file:
                json.dump(result, result_file, indent=2, ensure_ascii=False)
            print(f"SUCCESS. Saved result to: {output_path}")
            return 0
        if code not in ("20000001", "20000002"):
            print(f"FAILED. code={code}, logid={logid}")
            return 1
        time.sleep(poll_interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Doubao Standard AUC ASR Demo")
    parser.add_argument("--app-key", default=os.getenv("DOUBAO_APP_KEY", DEFAULT_APP_KEY), help="X-Api-App-Key")
    parser.add_argument("--access-key", default=os.getenv("DOUBAO_ACCESS_KEY", DEFAULT_ACCESS_KEY), help="X-Api-Access-Key")
    parser.add_argument("--file-url", required=True, help="Audio URL for AUC submit")
    parser.add_argument("--resource-id", default=os.getenv("DOUBAO_RESOURCE_ID", DEFAULT_RESOURCE_ID), help="X-Api-Resource-Id")
    parser.add_argument("--submit-url", default=DEFAULT_SUBMIT_URL, help="Submit endpoint")
    parser.add_argument("--query-url", default=DEFAULT_QUERY_URL, help="Query endpoint")
    parser.add_argument("--poll-interval", type=float, default=1.0, help="Polling interval in seconds")
    parser.add_argument("--poll-timeout", type=float, default=300.0, help="Polling timeout in seconds")
    parser.add_argument("--output", default="auc_result.json", help="Output json path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.app_key or not args.access_key:
        print("Missing credentials. Set --app-key/--access-key or env DOUBAO_APP_KEY/DOUBAO_ACCESS_KEY.")
        return 1

    try:
        return run_task(
            app_key=args.app_key,
            access_key=args.access_key,
            file_url=args.file_url,
            resource_id=args.resource_id,
            submit_url=args.submit_url,
            query_url=args.query_url,
            poll_interval=args.poll_interval,
            poll_timeout=args.poll_timeout,
            output_path=args.output,
        )
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
