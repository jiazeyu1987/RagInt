from __future__ import annotations

import sys
import types


def _install_fake_voicekit() -> None:
    pkg = types.ModuleType("asr_voicekit")
    deps_mod = types.ModuleType("asr_voicekit.deps")
    providers_mod = types.ModuleType("asr_voicekit.providers")
    dashscope_mod = types.ModuleType("asr_voicekit.providers.dashscope_provider")
    wake_mod = types.ModuleType("asr_voicekit.wake_window")

    def register_voicekit(app, deps, url_prefix="/voicekit"):  # noqa: ANN001, ANN002
        app.config["RAGINT_TEST_VOICEKIT_REGISTERED"] = {
            "url_prefix": str(url_prefix or ""),
            "deps": deps,
        }

    class VoiceKitDeps:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class DashScopeProvider:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class WakeWindowService:
        pass

    pkg.register_voicekit = register_voicekit
    deps_mod.VoiceKitDeps = VoiceKitDeps
    dashscope_mod.DashScopeProvider = DashScopeProvider
    wake_mod.WakeWindowService = WakeWindowService

    sys.modules.setdefault("asr_voicekit", pkg)
    sys.modules.setdefault("asr_voicekit.deps", deps_mod)
    sys.modules.setdefault("asr_voicekit.providers", providers_mod)
    sys.modules.setdefault("asr_voicekit.providers.dashscope_provider", dashscope_mod)
    sys.modules.setdefault("asr_voicekit.wake_window", wake_mod)


def pytest_configure(config):  # noqa: ANN001
    _install_fake_voicekit()
