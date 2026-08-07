"""Rate limiting for the unauthenticated surface.

Only the public booking endpoints are limited. The authenticated API is
already bounded by having to hold a valid token for a real studio, and
throttling a host mid-class would be a worse failure than the one it prevents.

Keyed on the client IP, read through `X-Forwarded-For` when present, because
in deployment this sits behind a proxy and every request would otherwise
share the load balancer's address — one bucket for the whole internet.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from slowapi import Limiter
from slowapi.util import get_remote_address

if TYPE_CHECKING:
    from starlette.requests import Request


def client_ip(request: Request) -> str:
    """The caller's address, trusting only the first proxy hop.

    `X-Forwarded-For` is client-controlled and can be forged, so this is a
    throttle rather than a security control. It is the leftmost entry that
    identifies the original client; the rest of the chain is the proxies.
    """
    forwarded = request.headers.get("x-forwarded-for")

    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first

    return get_remote_address(request)


# In-memory storage: a single process is the deployment shape today, and a
# Redis dependency for a form that takes a handful of submissions an hour is
# not worth the operational surface. Revisit when the API runs more than one
# replica — the limit becomes per-replica, not global.
limiter = Limiter(key_func=client_ip, default_limits=[])
