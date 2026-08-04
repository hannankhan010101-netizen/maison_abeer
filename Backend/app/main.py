"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.providers import (
    provide_checklist_service,
    provide_guest_service,
    provide_session_service,
)
from app.api.v1 import checklist, guests, sessions
from app.core.config import Settings, get_settings
from app.core.db import reset_engine
from app.core.errors import AppError

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Awaitable, Callable

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    reset_engine()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()

    app = FastAPI(
        title="Maison Abeer API",
        version="0.1.0",
        lifespan=lifespan,
        # No interactive docs in production: the schema describes every
        # endpoint and is free reconnaissance.
        docs_url=None if resolved.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if resolved.is_production else "/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    _register_error_handlers(app)
    _register_security_headers(app)

    # Replace the routers' placeholder providers with the real, database-backed
    # ones. Tests override these same keys with in-memory doubles.
    app.dependency_overrides[sessions.get_session_service] = provide_session_service
    app.dependency_overrides[guests.get_guest_service] = provide_guest_service
    app.dependency_overrides[checklist.get_checklist_service] = provide_checklist_service

    app.include_router(sessions.router, prefix=API_PREFIX)
    app.include_router(guests.router, prefix=API_PREFIX)
    app.include_router(checklist.router, prefix=API_PREFIX)

    @app.get("/health", include_in_schema=False)
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def _register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Pydantic's default payload leaks internal field paths and the raw
        # input. Reshape it into something the UI can attach to a field.
        fields = [
            {
                "field": ".".join(str(part) for part in error["loc"][1:]),
                "message": error["msg"].removeprefix("Value error, "),
            }
            for error in exc.errors()
        ]

        return JSONResponse(
            status_code=422,
            content={
                "code": "validation_failed",
                "message": "Some details need a second look.",
                "details": {"fields": fields},
            },
        )


def _register_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def security_headers(
        request: Request,
        call_next: Callable[[Request], Awaitable[JSONResponse]],
    ) -> JSONResponse:
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # API responses are JSON; nothing should ever be executed or embedded.
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        # Guest contact and allergy data must not sit in shared caches.
        response.headers["Cache-Control"] = "no-store"

        return response


# No module-level `app = create_app()`. Instantiating at import time means
# merely importing this module requires a complete environment, which breaks
# tests and tooling that only want the factory. Run with:
#
#     uvicorn app.main:create_app --factory
