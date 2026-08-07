"""Name-tag export fingerprinting (PRD §2.3).

The "roster updated since your last export" banner is the whole reason this
exists. A background job comparing timestamps would be the obvious approach
and the wrong one: a booking edited and reverted would still look changed,
and a table reassignment that does not appear on the tag would raise a banner
for nothing.

Instead the roster is fingerprinted over exactly the fields a name tag
renders. If the hash matches, the printed tags are still correct — regardless
of what else moved.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

__all__ = ["TagSubject", "roster_fingerprint"]


@dataclass(frozen=True, slots=True)
class TagSubject:
    """One guest as they appear on a printed tag."""

    guest_id: str
    full_name: str
    table_number: int | None
    subtext: str | None
    """The booking answer printed under the name, when there is one."""


def roster_fingerprint(subjects: list[TagSubject]) -> str:
    """A stable hash of everything a tag shows.

    Sorted by guest id so row ordering from the database cannot change the
    fingerprint. Serialised as JSON with separators fixed, so a Python
    repr change in a future version cannot silently invalidate every stored
    hash and raise the banner for every session at once.
    """
    payload = [
        [subject.guest_id, subject.full_name, subject.table_number, subject.subtext]
        for subject in sorted(subjects, key=lambda item: item.guest_id)
    ]

    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
