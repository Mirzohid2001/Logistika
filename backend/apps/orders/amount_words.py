from __future__ import annotations

from decimal import Decimal, InvalidOperation

_ONES = [
    '', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz",
]
_TEENS = [
    "o'n", "o'n bir", "o'n ikki", "o'n uch", "o'n to'rt", "o'n besh",
    "o'n olti", "o'n yetti", "o'n sakkiz", "o'n to'qqiz",
]
_TENS = [
    '', '', 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson",
]
_HUNDREDS = [
    '', 'bir yuz', 'ikki yuz', 'uch yuz', "to'rt yuz", 'besh yuz',
    'olti yuz', 'yetti yuz', 'sakkiz yuz', "to'qqiz yuz",
]


def _under_thousand(n: int) -> str:
    if n <= 0:
        return ''
    parts: list[str] = []
    hundreds, rest = divmod(n, 100)
    if hundreds:
        parts.append(_HUNDREDS[hundreds])
    if rest == 0:
        return ' '.join(parts)
    if rest < 10:
        parts.append(_ONES[rest])
    elif rest < 20:
        parts.append(_TEENS[rest - 10])
    else:
        tens, ones = divmod(rest, 10)
        parts.append(_TENS[tens])
        if ones:
            parts.append(_ONES[ones])
    return ' '.join(p for p in parts if p)


def _int_words(n: int) -> str:
    if n == 0:
        return 'nol'
    groups = [
        (1_000_000_000, 'milliard'),
        (1_000_000, 'million'),
        (1_000, 'ming'),
    ]
    parts: list[str] = []
    for value, label in groups:
        count, n = divmod(n, value)
        if count:
            words = _under_thousand(count)
            parts.append(f'{words} {label}'.strip())
    if n:
        parts.append(_under_thousand(n))
    return ' '.join(parts)


def amount_in_words_uz(value) -> str:
    try:
        amount = Decimal(str(value or 0)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        return ''
    som = int(amount)
    tiyin = int((amount - Decimal(som)) * 100)
    words = _int_words(abs(som)).capitalize()
    sign = 'minus ' if amount < 0 else ''
    return f"{sign}{words} so'm {tiyin:02d} tiyin"
