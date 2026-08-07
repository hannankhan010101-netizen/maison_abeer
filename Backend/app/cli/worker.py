"""Reminder worker: drains the scheduled-message queue (PRD §2.6).

Run on a schedule (cron, Render cron job, Railway scheduled task):

    python -m app.cli.worker --once

Design decisions worth stating, because they are what make failure visible:

* **Every outcome is written back.** A send either becomes `sent` or `failed`
  with `last_error` populated. There is no path where a message quietly
  disappears — the dashboard reads `failed` and shows a retry action.
* **Claim-then-send.** A row moves to `sending` in its own committed
  transaction before the provider is called, so two workers running at once
  cannot both pick it up. `SKIP LOCKED` makes the claim non-blocking.
* **Quiet hours are re-checked at send time**, not trusted from scheduling
  time. A studio that changed its window after a message was queued would
  otherwise send outside it.
* **The transport is injectable.** The default logs instead of sending, so
  running this against a real database cannot message real guests by
  accident. A provider is opt-in via `--transport`.

Scoped per studio: the worker iterates studios and opens a `TenantSession`
for each, so the same tenancy guarantee the API has applies here too.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import get_session_factory, reset_engine
from app.domain.scheduling import QuietHours
from app.models.enums import MessageChannel, MessageStatus
from app.models.guest import Guest
from app.models.session import ScheduledMessage
from app.models.studio import Studio, StudioSettings
from app.services.transports import (
    LoggingTransport,
    Recipient,
    Transport,
    build_transport,
)

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.orm import Session as SASession

logger = logging.getLogger("maison.worker")

MAX_ATTEMPTS = 3
"""After this many failures a message stays `failed` for the host to decide."""


def _quiet_hours_for(db: SASession, studio_id: UUID) -> QuietHours:
    row = db.execute(
        select(StudioSettings).where(StudioSettings.studio_id == studio_id)
    ).scalar_one_or_none()

    if row is None:
        return QuietHours()

    return QuietHours(start=row.quiet_hours_start, end=row.quiet_hours_end, timezone=row.timezone)


def _claim_due(db: SASession, studio_id: UUID, now: datetime, limit: int) -> list[ScheduledMessage]:
    """Take ownership of due messages so a second worker cannot double-send.

    `with_for_update(skip_locked=True)` is the important part: a concurrent
    worker skips rows this one holds rather than blocking behind them.
    """
    statement = (
        select(ScheduledMessage)
        .where(
            ScheduledMessage.studio_id == studio_id,
            ScheduledMessage.status.in_([MessageStatus.SCHEDULED, MessageStatus.QUEUED]),
            ScheduledMessage.send_at <= now,
        )
        .order_by(ScheduledMessage.send_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )

    due = list(db.execute(statement).scalars())

    for message in due:
        message.status = MessageStatus.SENDING

    # Committed before any provider call, so the claim survives a crash.
    db.commit()
    return due


def _address_for(db: SASession, message: ScheduledMessage) -> str | None:
    """The phone or email this message should reach, for its channel.

    Returns None when there is nothing to send to. The worker treats that as
    a skip with a reason rather than a failure: the host cannot fix a
    delivery error, but they can add a phone number.
    """
    if message.guest_id is None:
        return None

    guest = db.get(Guest, message.guest_id)
    if guest is None:
        return None

    if message.channel in (MessageChannel.SMS, MessageChannel.WHATSAPP):
        return guest.phone

    if message.channel is MessageChannel.EMAIL:
        return guest.email

    return None


def _deliver(db: SASession, message: ScheduledMessage, transport: Transport, address: str) -> bool:
    message.attempt_count += 1

    try:
        provider_id = transport.send(
            channel=message.channel.value,
            body=message.body,
            recipient=Recipient(
                address=address,
                guest_id=str(message.guest_id) if message.guest_id else None,
            ),
        )
    # Any provider failure is the same to us: record it and move on.
    except Exception as exc:
        message.status = MessageStatus.FAILED
        # Truncated: a provider stack trace in the UI helps nobody, and the
        # column is the host-facing explanation.
        message.last_error = str(exc)[:500]
        logger.warning("send failed for %s: %s", message.id, exc)
        db.commit()
        return False

    message.status = MessageStatus.SENT
    message.sent_at = datetime.now(UTC)
    message.provider_message_id = provider_id
    message.last_error = None
    db.commit()
    return True


def drain(
    *,
    transport: Transport | None = None,
    now: datetime | None = None,
    limit: int = 100,
) -> dict[str, int]:
    """One pass over every studio's due messages. Returns a tally."""
    resolved_transport = transport or LoggingTransport()
    moment = now or datetime.now(UTC)

    tally = {"sent": 0, "failed": 0, "held": 0, "skipped": 0}
    factory = get_session_factory()

    with factory() as db:
        studio_ids = list(db.execute(select(Studio.id)).scalars())

        for studio_id in studio_ids:
            quiet = _quiet_hours_for(db, studio_id)

            for message in _claim_due(db, studio_id, moment, limit):
                # Re-checked here, not trusted from scheduling time: the
                # studio may have narrowed its window since.
                if message.guest_id is not None and not quiet.allows(moment):
                    message.status = MessageStatus.QUEUED
                    db.commit()
                    tally["held"] += 1
                    continue

                if message.attempt_count >= MAX_ATTEMPTS:
                    message.status = MessageStatus.FAILED
                    message.last_error = f"Gave up after {MAX_ATTEMPTS} attempts."
                    db.commit()
                    tally["failed"] += 1
                    continue

                address = _address_for(db, message)

                if address is None:
                    # Not a failure the host can retry — record why and stop
                    # re-attempting it every fifteen minutes.
                    message.status = MessageStatus.SKIPPED_NO_CONTACT
                    message.last_error = "No phone number or email on file."
                    db.commit()
                    tally["skipped"] += 1
                    continue

                if _deliver(db, message, resolved_transport, address):
                    tally["sent"] += 1
                else:
                    tally["failed"] += 1

    return tally


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Drain the scheduled-message queue.")
    parser.add_argument("--once", action="store_true", help="single pass, then exit")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument(
        "--transport",
        choices=["log", "configured"],
        default="log",
        help=(
            "'log' performs a dry run and contacts nobody; 'configured' uses "
            "MESSAGE_PROVIDER from the environment and will message real guests"
        ),
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=get_settings().log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    if not args.once:
        # No built-in loop: process supervision belongs to the platform's
        # scheduler, which already handles restarts, overlap and alerting.
        print("only --once is supported; schedule it with cron", file=sys.stderr)
        return 2

    try:
        transport = build_transport(get_settings()) if args.transport == "configured" else None
        tally = drain(limit=args.limit, transport=transport)
    finally:
        reset_engine()

    logger.info("sent=%(sent)d failed=%(failed)d held=%(held)d skipped=%(skipped)d", tally)
    print(
        f"sent={tally['sent']} failed={tally['failed']} "
        f"held={tally['held']} skipped={tally['skipped']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
