"""Quantity expressions on checklist items.

A checklist step may reference the live seat count — "Bake {seats + 2} cake
bases". When capacity changes the rendered text follows, and if the item was
already ticked the host is told rather than the value being silently rewritten
(PRD §2.5: "Prep and capacity can never silently drift apart").

The evaluator is a deliberately tiny arithmetic parser, NOT `eval`. Checklist
text is host-authored and reaches this code from an HTTP request; `eval` on
that input would be remote code execution. Only integers, `seats`, `+`, `-`,
`*`, `//` and parentheses are accepted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# {seats + 2}, {seats}, {seats * 2} …
EXPRESSION_PATTERN = re.compile(r"\{([^{}]+)\}")

_TOKEN_PATTERN = re.compile(r"\s*(\d+|seats|[()+\-*]|//)")

MAX_EXPRESSION_LENGTH = 64
MAX_QUANTITY = 10_000


class QuantityExpressionError(ValueError):
    """Raised when an expression is malformed or uses unsupported syntax."""


@dataclass(frozen=True, slots=True)
class QuantityChange:
    """A quantity-linked item whose value moved because capacity changed."""

    item_id: str
    label: str
    previous_quantity: int
    new_quantity: int
    was_completed: bool

    @property
    def delta(self) -> int:
        return self.new_quantity - self.previous_quantity

    @property
    def needs_attention(self) -> bool:
        """A ticked item whose quantity grew needs the host to act again."""
        return self.was_completed and self.delta > 0

    def message(self) -> str:
        """Copy for the kind re-opening prompt in PRD §2.5."""
        if self.delta > 0:
            return (
                f"You added {self.delta} seat{'s' if abs(self.delta) != 1 else ''} — "
                f"you may need {self.delta} more for “{self.label}”."
            )
        if self.delta < 0:
            fewer = abs(self.delta)
            return (
                f"You removed {fewer} seat{'s' if fewer != 1 else ''} — "
                f"“{self.label}” now needs {self.new_quantity}."
            )
        return ""


class _Evaluator:
    """Recursive-descent parser for the supported arithmetic subset.

    Grammar:
        expr   := term (('+' | '-') term)*
        term   := factor (('*' | '//') factor)*
        factor := INTEGER | 'seats' | '(' expr ')' | '-' factor
    """

    def __init__(self, source: str, seats: int) -> None:
        self._seats = seats
        self._tokens = self._tokenize(source)
        self._position = 0

    @staticmethod
    def _tokenize(source: str) -> list[str]:
        tokens: list[str] = []
        index = 0

        while index < len(source):
            match = _TOKEN_PATTERN.match(source, index)
            if not match:
                remainder = source[index:].strip()
                if not remainder:
                    break
                raise QuantityExpressionError(
                    f"Unsupported character in quantity expression: {remainder[0]!r}"
                )
            tokens.append(match.group(1))
            index = match.end()

        if not tokens:
            raise QuantityExpressionError("Empty quantity expression.")
        return tokens

    def _peek(self) -> str | None:
        return self._tokens[self._position] if self._position < len(self._tokens) else None

    def _consume(self) -> str:
        token = self._peek()
        if token is None:
            raise QuantityExpressionError("Unexpected end of quantity expression.")
        self._position += 1
        return token

    def evaluate(self) -> int:
        value = self._expr()
        if self._peek() is not None:
            raise QuantityExpressionError(f"Unexpected {self._peek()!r} in quantity expression.")
        return value

    def _expr(self) -> int:
        value = self._term()
        while (token := self._peek()) in {"+", "-"}:
            self._consume()
            right = self._term()
            value = value + right if token == "+" else value - right
        return value

    def _term(self) -> int:
        value = self._factor()
        while (token := self._peek()) in {"*", "//"}:
            self._consume()
            right = self._factor()
            if token == "//":
                if right == 0:
                    raise QuantityExpressionError("Division by zero in quantity expression.")
                value //= right
            else:
                value *= right
                if abs(value) > MAX_QUANTITY:
                    raise QuantityExpressionError("Quantity expression result is too large.")
        return value

    def _factor(self) -> int:
        token = self._consume()

        if token == "-":
            return -self._factor()
        if token == "(":
            value = self._expr()
            if self._consume() != ")":
                raise QuantityExpressionError("Unbalanced parentheses in quantity expression.")
            return value
        if token == "seats":
            return self._seats
        if token.isdigit():
            return int(token)

        raise QuantityExpressionError(f"Unexpected {token!r} in quantity expression.")


def evaluate_expression(expression: str, seats: int) -> int:
    """Evaluate a single expression body such as `seats + 2`.

    Returns:
        The result, clamped to >= 0 — a negative prep quantity is meaningless.

    Raises:
        QuantityExpressionError: on malformed or oversized input.
    """
    if seats < 0:
        raise ValueError("seats cannot be negative")
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise QuantityExpressionError("Quantity expression is too long.")

    value = _Evaluator(expression, seats).evaluate()

    if abs(value) > MAX_QUANTITY:
        raise QuantityExpressionError("Quantity expression result is too large.")

    return max(0, value)


def render(template: str, seats: int) -> str:
    """Substitute every `{…}` expression in an item's text.

    "Bake {seats + 2} cake bases" with seats=10 becomes "Bake 12 cake bases".
    """

    def substitute(match: re.Match[str]) -> str:
        return str(evaluate_expression(match.group(1), seats))

    return EXPRESSION_PATTERN.sub(substitute, template)


def has_expression(template: str) -> bool:
    """Whether an item's text is capacity-linked at all."""
    return EXPRESSION_PATTERN.search(template) is not None


def primary_quantity(template: str, seats: int) -> int | None:
    """The first expression's value, stored alongside the text.

    Persisting this is what lets us detect drift later: comparing the stored
    value against a fresh evaluation is cheaper and more honest than diffing
    rendered strings.
    """
    match = EXPRESSION_PATTERN.search(template)
    if match is None:
        return None
    return evaluate_expression(match.group(1), seats)


@dataclass(frozen=True, slots=True)
class QuantityLinkedItem:
    """A checklist item as stored: its template text and last-evaluated value."""

    item_id: str
    label: str
    template: str
    last_quantity: int | None
    completed: bool = False


def rescale(items: list[QuantityLinkedItem], new_seats: int) -> list[QuantityChange]:
    """Recompute quantity-linked items for a new seat count.

    Returns only the items whose value actually moved, so callers can prompt
    about real drift instead of every capacity edit.
    """
    changes: list[QuantityChange] = []

    for item in items:
        if not has_expression(item.template):
            continue

        new_quantity = primary_quantity(item.template, new_seats)
        if new_quantity is None or item.last_quantity is None:
            continue
        if new_quantity == item.last_quantity:
            continue

        changes.append(
            QuantityChange(
                item_id=item.item_id,
                label=item.label,
                previous_quantity=item.last_quantity,
                new_quantity=new_quantity,
                was_completed=item.completed,
            )
        )

    return changes
