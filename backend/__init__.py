"""
Backend package entry.

Expose `create_app()` for WSGI servers.
"""

from __future__ import annotations


def create_app(*args, **kwargs):
    """Lazily import Flask app factory to keep package imports lightweight."""
    from backend.app import create_app as _create_app

    return _create_app(*args, **kwargs)
