"""Deployment configuration that would otherwise fail only in production.

Every check here covers something that is green locally and broken once
deployed — the class of bug that costs a rollback rather than a fix.
"""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path
from typing import Any, cast

import pytest

ROOT = Path(__file__).resolve().parents[1]
PYPROJECT = ROOT / "pyproject.toml"
REQUIREMENTS = ROOT / "requirements.txt"
VERCEL = ROOT / "vercel.json"

# Vercel supplies the ASGI server, so uvicorn is intentionally not shipped.
RUNTIME_ONLY_LOCALLY = {"uvicorn"}


def _package_name(spec: str) -> str:
    """`psycopg[binary]>=3.2.3` → `psycopg`."""
    return re.split(r"[<>=!\[;]", spec, maxsplit=1)[0].strip().lower()


def _pyproject_dependencies() -> set[str]:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    deps: list[str] = data["project"]["dependencies"]
    return {_package_name(dep) for dep in deps}


def _requirements() -> set[str]:
    lines = REQUIREMENTS.read_text(encoding="utf-8").splitlines()
    return {
        _package_name(line) for line in lines if line.strip() and not line.strip().startswith("#")
    }


def test_requirements_covers_every_runtime_dependency() -> None:
    """A dependency added to pyproject but not here is an ImportError on deploy.

    It passes locally, passes in CI (which installs from pyproject), and fails
    on the first request in production.
    """
    missing = _pyproject_dependencies() - _requirements() - RUNTIME_ONLY_LOCALLY

    assert not missing, (
        f"in pyproject.toml but not requirements.txt: {sorted(missing)} — "
        "Vercel installs from requirements.txt only"
    )


def test_requirements_has_nothing_extra() -> None:
    """The reverse drift: a package pinned for deploy that nothing declares."""
    extra = _requirements() - _pyproject_dependencies()
    assert not extra, f"in requirements.txt but not declared in pyproject.toml: {sorted(extra)}"


def test_tzdata_ships() -> None:
    """A slim image has no system zoneinfo; every quiet-hours check would raise."""
    assert "tzdata" in _requirements()


# ---------------------------------------------------------------------------
# Vercel
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def vercel() -> dict[str, Any]:
    parsed: dict[str, Any] = json.loads(VERCEL.read_text(encoding="utf-8"))
    return parsed


def test_every_path_routes_to_the_asgi_entrypoint(vercel: dict[str, Any]) -> None:
    """Without this rewrite only `/api/index` resolves and every route 404s."""
    rewrites = vercel["rewrites"]
    assert any(r["source"] == "/(.*)" and r["destination"] == "/api/index" for r in rewrites)


def test_the_entrypoint_exists_and_exposes_app() -> None:
    """Vercel imports this file and looks for a module-level `app`."""
    entry = ROOT / "api" / "index.py"

    assert entry.exists()
    assert re.search(r"^app = create_app\(\)$", entry.read_text(encoding="utf-8"), re.M)


def test_the_cron_target_is_a_real_route(vercel: dict[str, Any]) -> None:
    """A typo here fails silently — the scheduler 404s and nobody is told."""
    from app.main import create_app

    paths = set(create_app().openapi()["paths"])

    for job in vercel["crons"]:
        assert job["path"] in paths, f"cron points at {job['path']}, which is not a route"


def test_the_cron_route_accepts_the_method_vercel_sends(vercel: dict[str, Any]) -> None:
    """Vercel Cron issues GET. A POST-only handler would 405 forever."""
    from app.main import create_app

    schema = create_app().openapi()["paths"]

    for job in vercel["crons"]:
        assert "get" in schema[job["path"]], f"{job['path']} must accept GET"


def test_the_scheduler_runs_often_enough_to_respect_quiet_hours(vercel: dict[str, Any]) -> None:
    """Messages held for quiet hours are only released on the next run.

    An hourly schedule means a message due at 09:00 can go out at 09:59, which
    is close enough to be indistinguishable from a bug.

    Vercel's Hobby plan only allows a daily cron, so `0 9 * * *` is an
    accepted, documented exception (see docs/deploy-vercel.md's Cron
    section) rather than a bug — every message still queues correctly, it
    just drains once a day instead of every 15 minutes. Restore the
    sub-hourly assertion once the project is expected to be on a paid plan.
    """
    for job in vercel["crons"]:
        minute, hour = job["schedule"].split()[:2]

        if minute.startswith("*/"):
            assert int(minute.removeprefix("*/")) <= 15
        else:
            assert (minute, hour) == ("0", "9"), (
                f"expected either a sub-hourly schedule or the documented Hobby-plan "
                f"daily fallback (0 9 * * *), got {job['schedule']}"
            )


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


def _cors_allowed_methods() -> set[str]:
    """The methods the CORS middleware will approve at preflight."""
    from starlette.middleware.cors import CORSMiddleware

    from app.main import create_app

    for middleware in create_app().user_middleware:
        # Matched by name via getattr: Starlette types `.cls` as a middleware
        # *factory* protocol, so neither an identity check against the class
        # nor a plain `.__name__` type-checks against it.
        if getattr(middleware.cls, "__name__", "") == CORSMiddleware.__name__:
            methods = cast("list[str]", middleware.kwargs["allow_methods"])
            return {method.upper() for method in methods}

    raise AssertionError("no CORS middleware is installed")


def test_cors_allows_every_method_the_api_actually_serves() -> None:
    """A method the routes serve but CORS omits is invisibly broken.

    This is not hypothetical. `PUT` was missing while three features used it —
    toggling a reaction, leaving feedback, and pinning a banner. All three did
    nothing in every real browser, and nothing caught it: the request never
    leaves the browser when a preflight is refused, so the server logs stay
    clean, `curl` does not enforce CORS at all, and the e2e suite stubs the
    API. The failure was only ever visible in a devtools console.

    Derived from the OpenAPI schema rather than hardcoded, so a route added
    with a new method is covered the day it lands.
    """
    from app.main import create_app

    served = {
        method.upper()
        for operations in create_app().openapi()["paths"].values()
        for method in operations
        if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}
    }

    missing = served - _cors_allowed_methods()

    assert not missing, (
        f"these methods are served but blocked at preflight: {sorted(missing)} — "
        "every request using them fails in a browser and nowhere else"
    )


def test_cors_still_allows_the_preflight_itself() -> None:
    """OPTIONS is how the browser asks. Dropping it blocks everything."""
    assert "OPTIONS" in _cors_allowed_methods()
