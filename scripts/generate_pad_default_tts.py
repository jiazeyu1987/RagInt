from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.api.ragflow_config_cache import get_ragflow_config  # noqa: E402
from backend.bootstrap import build_deps, resolve_config_path  # noqa: E402
from backend.config import resolve_tts_request  # noqa: E402


DEFAULT_HALL_IDS = (
    "hall_01",
    "hall_02",
    "hall_03",
    "hall_04",
    "hall_05",
    "hall_06",
    "hall_07",
    "hall_08",
)


@dataclass(frozen=True)
class ProductTask:
    hall_id: str
    product_id: str
    product_name: str
    sort_order: int
    intro_text: str


@dataclass(frozen=True)
class PrecheckFailure:
    code: str
    hall_id: str
    product_id: str
    product_name: str
    detail: str


@dataclass(frozen=True)
class BatchSkip:
    code: str
    hall_id: str
    product_id: str
    product_name: str
    detail: str


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate default active TTS audio for pad hall products.")
    parser.add_argument(
        "--hall-id",
        action="append",
        default=[],
        help="Restrict generation to one or more hall ids. Can be passed multiple times.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run full precheck and print counts without generating any new audio assets.",
    )
    return parser.parse_args(argv)


def _build_logger() -> logging.Logger:
    logger = logging.getLogger("generate_pad_default_tts")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


def build_runtime_deps():
    logger = _build_logger()
    config_path = resolve_config_path(repo_root=REPO_ROOT)
    return build_deps(base_dir=REPO_ROOT / "backend", config_path=config_path, logger=logger)


def select_hall_ids(raw_hall_ids: list[str] | tuple[str, ...] | None) -> tuple[str, ...]:
    raw_items = [str(item or "").strip() for item in (raw_hall_ids or []) if str(item or "").strip()]
    if not raw_items:
        return DEFAULT_HALL_IDS

    unknown = sorted({item for item in raw_items if item not in DEFAULT_HALL_IDS})
    if unknown:
        raise SystemExit(f"unknown_hall_id:{','.join(unknown)}")

    requested = set(raw_items)
    return tuple(hall_id for hall_id in DEFAULT_HALL_IDS if hall_id in requested)


def _describe_tts_runtime(provider: str, resolved_cfg: dict) -> dict[str, str]:
    cfg = resolved_cfg if isinstance(resolved_cfg, dict) else {}
    tts_cfg = cfg.get("tts") if isinstance(cfg.get("tts"), dict) else {}
    normalized_provider = str(provider or "").strip().lower()

    voice = ""
    model = ""
    if normalized_provider in {"modelscope", "bailian", "dashscope", "flash"}:
        bailian_cfg = tts_cfg.get("bailian") if isinstance(tts_cfg.get("bailian"), dict) else {}
        voice = str(bailian_cfg.get("voice") or "").strip()
        model = str(bailian_cfg.get("model") or "").strip()
    elif normalized_provider == "edge":
        edge_cfg = tts_cfg.get("edge") if isinstance(tts_cfg.get("edge"), dict) else {}
        voice = str(edge_cfg.get("voice") or "").strip()
        model = str(edge_cfg.get("output_format") or "").strip()
    elif normalized_provider == "sapi":
        sapi_cfg = tts_cfg.get("sapi") if isinstance(tts_cfg.get("sapi"), dict) else {}
        voice = str(sapi_cfg.get("voice") or "").strip()
        model = str(sapi_cfg.get("rate") or "").strip()

    return {
        "provider": normalized_provider or str(provider or "").strip(),
        "voice": voice,
        "model": model,
    }


def _resolve_default_tts_request(*, deps) -> tuple[str, dict, dict[str, str]]:
    app_config = get_ragflow_config(deps=deps)
    provider, resolved_cfg = resolve_tts_request(app_config, data=None, headers={})
    provider_text = str(provider or "").strip()
    if not provider_text:
        raise RuntimeError("tts_provider_unresolved")
    runtime = _describe_tts_runtime(provider_text, resolved_cfg if isinstance(resolved_cfg, dict) else {})
    return provider_text, resolved_cfg if isinstance(resolved_cfg, dict) else {}, runtime


def build_generation_plan(*, deps, hall_ids: tuple[str, ...]) -> dict[str, Any]:
    provider, resolved_cfg, runtime = _resolve_default_tts_request(deps=deps)
    tasks: list[ProductTask] = []
    failures: list[PrecheckFailure] = []
    skipped: list[BatchSkip] = []
    hall_summaries: list[dict[str, Any]] = []
    total_product_count = 0
    skip_count = 0
    skip_missing_intro_count = 0
    logger = getattr(deps, "logger", None)

    for hall_id in hall_ids:
        rows = deps.pad_product_store.list_hall_products(hall_id)
        if not rows:
            failures.append(
                PrecheckFailure(
                    code="hall_has_no_products",
                    hall_id=hall_id,
                    product_id="",
                    product_name="",
                    detail="No products were found for the selected hall.",
                )
            )
            hall_summaries.append(
                {
                    "hall_id": hall_id,
                    "total_count": 0,
                    "skip_count": 0,
                    "skip_missing_intro_count": 0,
                    "target_count": 0,
                    "generated_count": 0,
                }
            )
            continue

        hall_skip_count = 0
        hall_skip_missing_intro_count = 0
        hall_target_count = 0
        total_product_count += len(rows)
        for row in rows:
            product_id = str(row.get("product_id") or "").strip()
            product_name = str(row.get("product_name") or "").strip()
            sort_order = int(row.get("sort_order") or 0)
            if not product_id:
                failures.append(
                    PrecheckFailure(
                        code="product_id_required",
                        hall_id=hall_id,
                        product_id="",
                        product_name=product_name,
                        detail="The store returned a product row without product_id.",
                    )
                )
                continue

            if str(row.get("active_audio_asset_id") or "").strip():
                skip_count += 1
                hall_skip_count += 1
                continue

            intro_text = str(row.get("intro_text") or "").strip()
            if not intro_text:
                # Explicit user-requested fallback: skip products with empty intro_text
                # inside this batch script instead of blocking the entire batch.
                skipped.append(
                    BatchSkip(
                        code="fallback_skip_missing_intro_text",
                        hall_id=hall_id,
                        product_id=product_id,
                        product_name=product_name,
                        detail="The product intro_text is empty, so this batch run skips it by explicit user request.",
                    )
                )
                skip_missing_intro_count += 1
                hall_skip_missing_intro_count += 1
                if logger is not None:
                    try:
                        logger.warning(
                            "[fallback:skip-missing-intro-text] hall_id=%s product_id=%s product_name=%s",
                            hall_id,
                            product_id,
                            product_name,
                        )
                    except Exception:
                        pass
                continue

            tasks.append(
                ProductTask(
                    hall_id=hall_id,
                    product_id=product_id,
                    product_name=product_name,
                    sort_order=sort_order,
                    intro_text=intro_text,
                )
            )
            hall_target_count += 1

        hall_summaries.append(
            {
                "hall_id": hall_id,
                "total_count": len(rows),
                "skip_count": hall_skip_count,
                "skip_missing_intro_count": hall_skip_missing_intro_count,
                "target_count": hall_target_count,
                "generated_count": 0,
            }
        )

    return {
        "provider": provider,
        "resolved_cfg": resolved_cfg,
        "tts_runtime": runtime,
        "hall_summaries": hall_summaries,
        "tasks": tasks,
        "failures": failures,
        "skipped": skipped,
        "hall_ids": hall_ids,
        "total_product_count": total_product_count,
        "skip_count": skip_count,
        "skip_missing_intro_count": skip_missing_intro_count,
        "target_count": len(tasks),
    }


def _serialize_failure(item: PrecheckFailure) -> dict[str, str]:
    return {
        "code": item.code,
        "hall_id": item.hall_id,
        "product_id": item.product_id,
        "product_name": item.product_name,
        "detail": item.detail,
    }


def _serialize_skip(item: BatchSkip) -> dict[str, str]:
    return {
        "code": item.code,
        "hall_id": item.hall_id,
        "product_id": item.product_id,
        "product_name": item.product_name,
        "detail": item.detail,
    }


def run_batch(*, deps, hall_ids: tuple[str, ...], dry_run: bool = False) -> dict[str, Any]:
    plan = build_generation_plan(deps=deps, hall_ids=hall_ids)
    hall_summaries = [dict(item) for item in plan["hall_summaries"]]
    failures = [_serialize_failure(item) for item in plan["failures"]]
    skipped = [_serialize_skip(item) for item in plan["skipped"]]

    result = {
        "ok": False,
        "phase": "precheck_failed" if failures else "dry_run" if dry_run else "completed",
        "exit_code": 1 if failures else 0,
        "provider": plan["provider"],
        "tts_runtime": dict(plan["tts_runtime"]),
        "hall_ids": tuple(plan["hall_ids"]),
        "total_product_count": int(plan["total_product_count"]),
        "skip_count": int(plan["skip_count"]),
        "skip_missing_intro_count": int(plan["skip_missing_intro_count"]),
        "target_count": int(plan["target_count"]),
        "generated_count": 0,
        "failure_count": len(failures),
        "offline_sync_pending_audio_count": 0,
        "hall_summaries": hall_summaries,
        "failures": failures,
        "skipped": skipped,
        "failed_task": None,
        "error": "",
    }

    if failures:
        return result

    if dry_run:
        result["ok"] = True
        result["exit_code"] = 0
        result["phase"] = "dry_run"
        result["offline_sync_pending_audio_count"] = int(plan["target_count"])
        return result

    if not plan["tasks"]:
        result["ok"] = True
        result["exit_code"] = 0
        result["phase"] = "noop"
        return result

    generated_count = 0
    generated_by_hall = {str(item["hall_id"]): 0 for item in hall_summaries}
    for task in plan["tasks"]:
        try:
            deps.pad_product_audio_service.regenerate_product_audio(
                product_id=task.product_id,
                text=task.intro_text,
                resolved_cfg=plan["resolved_cfg"],
                provider=plan["provider"],
                activate=True,
            )
        except Exception as exc:
            result["phase"] = "generation_failed"
            result["exit_code"] = 1
            result["ok"] = False
            result["generated_count"] = generated_count
            result["failure_count"] = 1
            result["offline_sync_pending_audio_count"] = generated_count
            result["failed_task"] = {
                "hall_id": task.hall_id,
                "product_id": task.product_id,
                "product_name": task.product_name,
                "sort_order": task.sort_order,
            }
            result["error"] = str(exc)
            for item in hall_summaries:
                item["generated_count"] = int(generated_by_hall.get(str(item["hall_id"]), 0))
            return result

        generated_count += 1
        generated_by_hall[task.hall_id] = int(generated_by_hall.get(task.hall_id, 0)) + 1

    for item in hall_summaries:
        item["generated_count"] = int(generated_by_hall.get(str(item["hall_id"]), 0))

    result["ok"] = True
    result["phase"] = "completed"
    result["exit_code"] = 0
    result["generated_count"] = generated_count
    result["offline_sync_pending_audio_count"] = generated_count
    return result


def print_result(result: dict[str, Any]) -> None:
    print(f"phase: {result['phase']}")
    print(f"halls: {', '.join(result['hall_ids'])}")
    runtime = result.get("tts_runtime") or {}
    print(
        "tts_runtime: provider={provider} voice={voice} model={model}".format(
            provider=str(runtime.get("provider") or ""),
            voice=str(runtime.get("voice") or ""),
            model=str(runtime.get("model") or ""),
        )
    )
    print("summary:")
    print(f"- total_products: {int(result.get('total_product_count') or 0)}")
    print(f"- skip_existing_active_audio: {int(result.get('skip_count') or 0)}")
    print(f"- fallback_skip_missing_intro_text: {int(result.get('skip_missing_intro_count') or 0)}")
    print(f"- target_generation_count: {int(result.get('target_count') or 0)}")
    print(f"- generated_count: {int(result.get('generated_count') or 0)}")
    print(f"- failure_count: {int(result.get('failure_count') or 0)}")
    print(f"- offline_sync_pending_audio_count: {int(result.get('offline_sync_pending_audio_count') or 0)}")
    print("by_hall:")
    for item in result.get("hall_summaries") or []:
        print(
            "- {hall_id}: total={total_count} skip={skip_count} fallback_skip_missing_intro={skip_missing_intro_count} target={target_count} generated={generated_count}".format(
                hall_id=str(item.get("hall_id") or ""),
                total_count=int(item.get("total_count") or 0),
                skip_count=int(item.get("skip_count") or 0),
                skip_missing_intro_count=int(item.get("skip_missing_intro_count") or 0),
                target_count=int(item.get("target_count") or 0),
                generated_count=int(item.get("generated_count") or 0),
            )
        )

    failures = result.get("failures") or []
    if failures:
        print("precheck_failures:")
        for item in failures:
            print(
                "- {hall_id} {product_id} {product_name} {code}: {detail}".format(
                    hall_id=str(item.get("hall_id") or ""),
                    product_id=str(item.get("product_id") or ""),
                    product_name=str(item.get("product_name") or ""),
                    code=str(item.get("code") or ""),
                    detail=str(item.get("detail") or ""),
                ).rstrip()
            )

    skipped = result.get("skipped") or []
    if skipped:
        print("requested_fallback_skips:")
        for item in skipped:
            print(
                "- {hall_id} {product_id} {product_name} {code}: {detail}".format(
                    hall_id=str(item.get("hall_id") or ""),
                    product_id=str(item.get("product_id") or ""),
                    product_name=str(item.get("product_name") or ""),
                    code=str(item.get("code") or ""),
                    detail=str(item.get("detail") or ""),
                ).rstrip()
            )

    failed_task = result.get("failed_task") or {}
    if failed_task:
        print("generation_failed_at:")
        print(
            "- {hall_id} {product_id} {product_name} sort_order={sort_order}".format(
                hall_id=str(failed_task.get("hall_id") or ""),
                product_id=str(failed_task.get("product_id") or ""),
                product_name=str(failed_task.get("product_name") or ""),
                sort_order=str(failed_task.get("sort_order") or ""),
            ).rstrip()
        )
        if result.get("error"):
            print(f"generation_error: {result['error']}")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    hall_ids = select_hall_ids(args.hall_id)
    deps = build_runtime_deps()
    result = run_batch(deps=deps, hall_ids=hall_ids, dry_run=bool(args.dry_run))
    print_result(result)
    return int(result.get("exit_code") or 0)


if __name__ == "__main__":
    raise SystemExit(main())
