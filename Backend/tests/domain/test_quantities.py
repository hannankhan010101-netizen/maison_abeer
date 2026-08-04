"""Quantity expression evaluation and rescaling.

The evaluator parses host-authored text arriving over HTTP, so the security
tests here are as load-bearing as the arithmetic ones.
"""

from __future__ import annotations

import pytest

from app.domain.quantities import (
    QuantityExpressionError,
    QuantityLinkedItem,
    evaluate_expression,
    has_expression,
    primary_quantity,
    render,
    rescale,
)


class TestEvaluateExpression:
    @pytest.mark.parametrize(
        ("expression", "seats", "expected"),
        [
            ("seats", 10, 10),
            ("seats + 2", 10, 12),
            ("seats - 1", 10, 9),
            ("seats * 2", 6, 12),
            ("seats // 2", 11, 5),
            ("(seats + 2) * 2", 4, 12),
            ("3", 10, 3),
            ("seats + seats", 5, 10),
            ("-5 + seats", 10, 5),
        ],
    )
    def test_evaluates_supported_arithmetic(
        self, expression: str, seats: int, expected: int
    ) -> None:
        assert evaluate_expression(expression, seats) == expected

    def test_clamps_negative_results_to_zero(self) -> None:
        # A prep step can't require -3 cake bases.
        assert evaluate_expression("seats - 20", 5) == 0

    def test_handles_zero_seats(self) -> None:
        assert evaluate_expression("seats + 2", 0) == 2

    def test_rejects_negative_seats(self) -> None:
        with pytest.raises(ValueError, match="cannot be negative"):
            evaluate_expression("seats", -1)


class TestEvaluatorIsNotEval:
    """The parser must not be a code-execution vector.

    Checklist text is host-authored and arrives over HTTP. If this were
    `eval`, every one of these strings would be remote code execution.
    """

    @pytest.mark.parametrize(
        "expression",
        [
            "__import__('os').system('echo pwned')",
            "open('/etc/passwd').read()",
            "seats.__class__",
            "().__class__.__bases__",
            "exec('x=1')",
            "lambda: 1",
            "seats if seats else 0",
            "[seats]",
            "{'a': 1}",
            "seats ** 999999",
            "globals()",
        ],
    )
    def test_rejects_python_syntax(self, expression: str) -> None:
        with pytest.raises(QuantityExpressionError):
            evaluate_expression(expression, 10)

    def test_rejects_unknown_identifiers(self) -> None:
        with pytest.raises(QuantityExpressionError):
            evaluate_expression("guests + 2", 10)

    def test_rejects_empty_expression(self) -> None:
        with pytest.raises(QuantityExpressionError, match="Empty"):
            evaluate_expression("   ", 10)

    def test_rejects_unbalanced_parentheses(self) -> None:
        with pytest.raises(QuantityExpressionError):
            evaluate_expression("(seats + 2", 10)

    def test_rejects_division_by_zero(self) -> None:
        with pytest.raises(QuantityExpressionError, match="Division by zero"):
            evaluate_expression("seats // 0", 10)

    def test_rejects_overlong_expressions(self) -> None:
        with pytest.raises(QuantityExpressionError, match="too long"):
            evaluate_expression("seats + " * 20 + "1", 10)

    def test_rejects_oversized_results(self) -> None:
        with pytest.raises(QuantityExpressionError, match="too large"):
            evaluate_expression("seats * 9999", 100)


class TestRender:
    def test_substitutes_the_prd_example(self) -> None:
        assert render("Bake {seats + 2} cake bases", 10) == "Bake 12 cake bases"

    def test_substitutes_multiple_expressions(self) -> None:
        result = render("Mix {seats} bags, chill {seats // 2} bowls", 12)
        assert result == "Mix 12 bags, chill 6 bowls"

    def test_leaves_plain_text_untouched(self) -> None:
        assert render("Wedge the clay", 10) == "Wedge the clay"

    def test_detects_expressions(self) -> None:
        assert has_expression("Bake {seats} bases")
        assert not has_expression("Wash piping tips")

    def test_primary_quantity_reads_first_expression(self) -> None:
        assert primary_quantity("Mix {seats} bags, chill {seats // 2}", 12) == 12
        assert primary_quantity("No expression here", 12) is None


class TestRescale:
    def _item(self, **overrides: object) -> QuantityLinkedItem:
        defaults: dict[str, object] = {
            "item_id": "i1",
            "label": "bake cake bases",
            "template": "Bake {seats + 2} cake bases",
            "last_quantity": 12,
            "completed": False,
        }
        defaults.update(overrides)
        return QuantityLinkedItem(**defaults)  # type: ignore[arg-type]

    def test_reports_increase_when_seats_grow(self) -> None:
        # 10 -> 12 seats means 12 -> 14 bases.
        changes = rescale([self._item()], new_seats=12)

        assert len(changes) == 1
        assert changes[0].previous_quantity == 12
        assert changes[0].new_quantity == 14
        assert changes[0].delta == 2

    def test_is_silent_when_nothing_moves(self) -> None:
        assert rescale([self._item()], new_seats=10) == []

    def test_ignores_items_without_expressions(self) -> None:
        plain = self._item(template="Wash piping tips", last_quantity=None)
        assert rescale([plain], new_seats=20) == []

    def test_flags_completed_items_that_grew(self) -> None:
        changes = rescale([self._item(completed=True)], new_seats=12)

        assert changes[0].needs_attention is True
        assert "You added 2 seats" in changes[0].message()
        assert "bake cake bases" in changes[0].message()

    def test_does_not_flag_completed_items_that_shrank(self) -> None:
        # Fewer bases than you already baked is not a problem to solve.
        changes = rescale([self._item(completed=True)], new_seats=8)

        assert changes[0].delta == -2
        assert changes[0].needs_attention is False
        assert "You removed 2 seats" in changes[0].message()

    def test_singular_copy_for_a_single_seat(self) -> None:
        changes = rescale([self._item()], new_seats=11)
        assert "You added 1 seat —" in changes[0].message()
