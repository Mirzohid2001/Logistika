import re

_UZ_PHONE_RE = re.compile(r'^998\d{9}$')


def normalize_phone(phone: str | None) -> str:
    """Normalize Uzbekistan mobile numbers to 998XXXXXXXXX."""
    if not phone:
        return ''
    digits = re.sub(r'\D', '', str(phone).strip())
    if not digits:
        return ''
    # Strip leading international trunk 00
    if digits.startswith('00') and len(digits) > 2:
        digits = digits[2:]
    if digits.startswith('998') and len(digits) >= 12:
        return digits[:12]
    if len(digits) == 9 and digits.startswith('9'):
        return f'998{digits}'
    return digits


def is_valid_uz_phone(phone: str) -> bool:
    return bool(_UZ_PHONE_RE.match(normalize_phone(phone)))


def phone_lookup_variants(phone: str | None) -> list[str]:
    """Possible stored forms for the same handset."""
    normalized = normalize_phone(phone)
    if not normalized:
        return []
    raw = str(phone or '').strip()
    variants = {normalized, f'+{normalized}', raw}
    if normalized.startswith('998') and len(normalized) == 12:
        variants.add(normalized[3:])  # local 9XXXXXXXX
        variants.add(f'0{normalized[3:]}')  # 09XXXXXXXX
    return [v for v in variants if v]
