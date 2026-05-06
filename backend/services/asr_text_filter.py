from __future__ import annotations

from backend.services.qa_audio_utils import extract_json, try_parse_json_like


DEFAULT_ASR_FILTER_CHAT_NAME = "语音模型"
ASR_TEXT_PLACEHOLDERS = (
    "{ASR的语音输入}",
    "{{ASR的语音输入}}",
    "{asr_text}",
    "{{asr_text}}",
    "{ASR_TEXT}",
    "{{ASR_TEXT}}",
)
DOMAIN_TERMS_PLACEHOLDERS = (
    "{领域片段}",
    "{{领域片段}}",
    "{术语列表}",
    "{{术语列表}}",
    "{domain_terms}",
    "{{domain_terms}}",
    "{DOMAIN_TERMS}",
    "{{DOMAIN_TERMS}}",
)


def stringify_domain_terms(value) -> str:
    if isinstance(value, (list, tuple, set)):
        return ",".join(str(item or "").strip() for item in value if str(item or "").strip())
    return str(value or "").strip()


def build_asr_filter_prompt(*, prompt_template: str, asr_text: str, domain_terms_text: str) -> str:
    prompt = str(prompt_template or "").strip()
    text = str(asr_text or "").strip()
    terms = str(domain_terms_text or "").strip()

    has_text_placeholder = False
    for placeholder in ASR_TEXT_PLACEHOLDERS:
        if placeholder in prompt:
            prompt = prompt.replace(placeholder, text)
            has_text_placeholder = True

    has_terms_placeholder = False
    for placeholder in DOMAIN_TERMS_PLACEHOLDERS:
        if placeholder in prompt:
            prompt = prompt.replace(placeholder, terms)
            has_terms_placeholder = True

    if not has_text_placeholder and text:
        prompt = f"{prompt}\n输入是{text}" if prompt else f"输入是{text}"

    if not has_terms_placeholder and terms:
        prompt = f"{prompt}\n领域片段{terms}" if prompt else f"领域片段{terms}"

    return prompt.strip()


def parse_asr_filter_response(*, raw_text: str) -> str:
    payload = try_parse_json_like(extract_json(raw_text))
    if not isinstance(payload, dict):
        payload = try_parse_json_like(raw_text)
    if not isinstance(payload, dict):
        raise ValueError("invalid_asr_filter_response")

    text = str(payload.get("text") or "").strip()
    if not text:
        raise ValueError("invalid_asr_filter_response")
    return text
