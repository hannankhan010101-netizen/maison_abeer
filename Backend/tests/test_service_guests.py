"""Guest, booking and waitlist orchestration."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from app.core.errors import ConflictError, DuplicateGuestError, NotFoundError
from app.domain.capacity import Capacity
from app.domain.guests import MessageChannel
from app.domain.waitlist import WaitlistEntry, WaitlistStatus
from app.services.guests import GuestDraft, GuestService
from tests.fakes_guests import FakeGuestRepository

NOW = datetime(2026, 8, 4, 12, 0, tzinfo=UTC)


@pytest.fixture
def repo() -> FakeGuestRepository:
    return FakeGuestRepository()


@pytest.fixture
def service(repo: FakeGuestRepository) -> GuestService:
    return GuestService(repo, now=NOW)


class TestCreateGuest:
    def test_adds_a_guest_with_only_a_name(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        # From a DM or a phone call — the PRD explicitly allows this.
        guest = service.create(GuestDraft(full_name="Hira S."))

        assert guest.full_name == "Hira S."
        # No contact details, so automated sends skip them and the roster
        # badges it rather than failing silently.
        assert guest.is_contactable is False

    def test_refuses_to_fragment_an_existing_guest(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        repo.add_guest(full_name="Sana R.", phone="0300 1234567")

        with pytest.raises(DuplicateGuestError) as excinfo:
            service.create(GuestDraft(full_name="Sana", phone="(0300) 123-4567"))

        # The host decides, because merging blends allergy records.
        assert "Sana R." in str(excinfo.value)
        assert "already in your guests" in str(excinfo.value)

    def test_can_merge_when_the_host_confirms(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        existing = repo.add_guest(full_name="Sana R.", phone="03001234567")

        merged = service.create(
            GuestDraft(full_name="Sana", phone="0300 123 4567"), merge_duplicates=True
        )

        assert merged.id == existing.id

    def test_allows_two_guests_with_the_same_name(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        repo.add_guest(full_name="Sana", phone="03001111111")

        created = service.create(GuestDraft(full_name="Sana", phone="03002222222"))

        assert created.full_name == "Sana"
        assert len(repo.guests) == 2


class TestRecognition:
    def test_exposes_the_visit_badge_and_regular_flag(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(visit_count=4)

        found = service.get(guest.id)

        assert found.visit_badge == "4th visit"
        assert found.is_regular is True

    def test_regulars_filter(self, service: GuestService, repo: FakeGuestRepository) -> None:
        repo.add_guest(full_name="Regular", visit_count=3, phone="03001111111")
        repo.add_guest(full_name="Newcomer", visit_count=1, phone="03002222222")

        regulars = service.list_guests(regulars_only=True)

        assert [g.full_name for g in regulars] == ["Regular"]

    def test_search_is_case_insensitive(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        repo.add_guest(full_name="Ayesha K.", phone="03001111111")
        repo.add_guest(full_name="Meerab A.", phone="03002222222")

        assert [g.full_name for g in service.list_guests(search="ayesha")] == ["Ayesha K."]

    def test_unknown_guest_is_not_found(self, service: GuestService) -> None:
        with pytest.raises(NotFoundError):
            service.get(uuid4())


class TestBooking:
    def test_books_a_guest_into_an_open_class(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=4)

        booking = service.book(session_id, guest.id, {"flavour": "gulab jamun"})

        assert booking.guest_id == guest.id
        assert booking.booking_answers == {"flavour": "gulab jamun"}

    def test_points_at_the_waitlist_when_full(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=10)

        with pytest.raises(ConflictError, match="waitlist"):
            service.book(session_id, guest.id, None)

    def test_locked_class_refuses_bookings_with_seats_free(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=4, locked=True)

        with pytest.raises(ConflictError):
            service.book(session_id, guest.id, None)

    def test_refuses_a_second_live_booking(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=1)
        repo.add_booking(session_id, guest.id)

        with pytest.raises(ConflictError, match="already booked"):
            service.book(session_id, guest.id, None)

    def test_allows_rebooking_after_a_cancellation(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=1)
        repo.add_booking(session_id, guest.id, status="cancelled")

        assert service.book(session_id, guest.id, None)

    def test_counts_guests_without_a_table(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id = uuid4()
        g1, g2, g3 = repo.add_guest(), repo.add_guest(), repo.add_guest()
        repo.add_booking(session_id, g1.id, table_number=2)
        repo.add_booking(session_id, g2.id)
        # Cancelled guests do not need a seat.
        repo.add_booking(session_id, g3.id, status="cancelled")

        assert service.unassigned_count(session_id) == 1

    def test_assigns_and_unassigns_a_table(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        booking = repo.add_booking(uuid4(), guest.id)

        assigned = service.assign_table(booking.id, 2, "sits with Sana")
        assert assigned.table_number == 2
        assert assigned.sit_with_note == "sits with Sana"

        cleared = service.assign_table(booking.id, None, None)
        assert cleared.table_number is None


class TestCancellation:
    def test_credit_records_a_rain_check(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        booking = repo.add_booking(session_id, guest.id)

        service.cancel(booking.id, "credit", "life happens")

        assert repo.credits == [(guest.id, session_id, "life happens")]
        assert repo.bookings[booking.id].status == "cancelled"

    def test_refund_issues_no_credit(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        booking = repo.add_booking(uuid4(), guest.id)

        service.cancel(booking.id, "refunded", None)

        # Money is handled off-platform in v1.
        assert repo.credits == []

    def test_cannot_cancel_twice(self, service: GuestService, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()
        booking = repo.add_booking(uuid4(), guest.id, status="cancelled")

        with pytest.raises(ConflictError, match="already cancelled"):
            service.cancel(booking.id, "credit", None)


class TestWaitlist:
    def _seed(self, repo: FakeGuestRepository, *, available: int = 1) -> tuple[object, object]:
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=10 - available)

        first = repo.add_guest(full_name="Hira S.", phone="03001111111")
        second = repo.add_guest(full_name="Noor J.", phone="03002222222")

        repo.waitlists[session_id] = [
            WaitlistEntry(entry_id="w1", guest_id=str(first.id), position=0),
            WaitlistEntry(entry_id="w2", guest_id=str(second.id), position=1),
        ]
        return session_id, first

    def test_invites_the_person_at_the_front(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id, first = self._seed(repo)

        decision = service.invite_next_guest(session_id)  # type: ignore[arg-type]

        assert decision.someone_was_invited
        assert decision.invited is not None
        assert decision.invited.guest_id == str(first.id)  # type: ignore[attr-defined]
        # The updated queue was persisted.
        assert repo.waitlists[session_id][0].status is WaitlistStatus.INVITED  # type: ignore[index]

    def test_does_not_invite_when_the_class_is_full(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id, _ = self._seed(repo, available=0)

        decision = service.invite_next_guest(session_id)  # type: ignore[arg-type]

        assert not decision.someone_was_invited
        assert decision.reason == "There's no free seat to offer."

    def test_persists_expiries_even_when_nobody_new_is_invited(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=9)
        guest = repo.add_guest(phone=None, email=None)

        repo.waitlists[session_id] = [
            WaitlistEntry(
                entry_id="w1",
                guest_id=str(guest.id),
                position=0,
                status=WaitlistStatus.INVITED,
                invite_expires_at=NOW - timedelta(hours=1),
                contactable=False,
            )
        ]

        decision = service.invite_next_guest(session_id)

        assert not decision.someone_was_invited
        # A lapsed hold must not block the queue forever.
        assert repo.waitlists[session_id][0].status is WaitlistStatus.EXPIRED

    def test_unknown_session_is_not_found(self, service: GuestService) -> None:
        with pytest.raises(NotFoundError):
            service.invite_next_guest(uuid4())

    def test_accepting_turns_the_offer_into_a_booking(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id, first = self._seed(repo)
        service.invite_next_guest(session_id)  # type: ignore[arg-type]

        booking = service.accept_waitlist_offer(session_id, first.id)  # type: ignore[arg-type, attr-defined]

        assert booking.guest_id == first.id  # type: ignore[attr-defined]
        # Accepting settles the entry — it moves out of the live queue, so it
        # is no longer at the front position, but its own status is final.
        accepted = next(e for e in repo.waitlists[session_id] if e.guest_id == str(first.id))  # type: ignore[index]
        assert accepted.status is WaitlistStatus.ACCEPTED

    def test_cannot_accept_without_an_open_invite(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id, first = self._seed(repo)
        # Never invited — still just waiting.

        with pytest.raises(NotFoundError):
            service.accept_waitlist_offer(session_id, first.id)  # type: ignore[arg-type, attr-defined]

    def test_cannot_accept_an_expired_invite(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=9)
        guest = repo.add_guest()

        repo.waitlists[session_id] = [
            WaitlistEntry(
                entry_id="w1",
                guest_id=str(guest.id),
                position=0,
                status=WaitlistStatus.INVITED,
                invite_expires_at=NOW - timedelta(hours=1),
            )
        ]

        with pytest.raises(ConflictError):
            service.accept_waitlist_offer(session_id, guest.id)  # type: ignore[arg-type, attr-defined]

    def test_declining_passes_the_offer_to_the_next_person(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        session_id, first = self._seed(repo)
        service.invite_next_guest(session_id)  # type: ignore[arg-type]

        service.decline_waitlist_offer(session_id, first.id)  # type: ignore[arg-type, attr-defined]

        entries = repo.waitlists[session_id]  # type: ignore[index]
        declined = next(e for e in entries if e.guest_id == str(first.id))
        assert declined.status is WaitlistStatus.WITHDRAWN
        # The second person was offered the freed seat automatically.
        assert any(e.status is WaitlistStatus.INVITED for e in entries)


class TestBirthdayRadar:
    def test_lists_upcoming_birthdays_soonest_first(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        soon = repo.add_guest(full_name="Ayesha K.", phone="03001111111", birthday=date(1995, 8, 8))
        later = repo.add_guest(
            full_name="Fatima N.", phone="03002222222", birthday=date(1995, 8, 30)
        )
        repo.add_guest(full_name="Zainab T.", phone="03003333333", birthday=date(1995, 12, 1))

        radar = service.birthday_radar()

        assert [e.guest.id for e in radar] == [soon.id, later.id]
        assert radar[0].days_away == 4

    def test_flags_guests_already_booked_in(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(birthday=date(1995, 8, 8))
        repo.upcoming_booked.add(guest.id)

        radar = service.birthday_radar()

        # Lets the host add a treat to a class they're already attending.
        assert radar[0].has_upcoming_booking is True

    def test_ignores_guests_without_a_birthday(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        repo.add_guest(birthday=None)

        assert service.birthday_radar() == []


class TestContactability:
    def test_opted_out_guests_are_not_contactable(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(opted_out=True)

        assert service.get(guest.id).is_contactable is False

    def test_email_channel_requires_an_email(
        self, service: GuestService, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(preferred_channel=MessageChannel.EMAIL, email=None)

        assert service.get(guest.id).is_contactable is False
