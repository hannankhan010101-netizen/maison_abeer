"""Vercel entrypoint.

Vercel's Python runtime imports this file and looks for a module-level ASGI
callable named `app`. That is the *only* reason it exists — the application is
still built by `create_app()`, and `uvicorn app.main:create_app --factory`
remains the way to run it anywhere else.

Note the module-level call. Everywhere else in this codebase that is a
mistake: it runs at import time and broke the test suite at collection once
already. Here it is required, and it is contained to a file nothing else
imports.
"""

from __future__ import annotations

from app.main import create_app

app = create_app()
