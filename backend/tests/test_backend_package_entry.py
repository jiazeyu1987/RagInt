from __future__ import annotations


def test_backend_package_create_app_is_lazy_import():
    import backend

    assert callable(backend.create_app)
