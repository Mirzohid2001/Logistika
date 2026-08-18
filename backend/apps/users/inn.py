import re

from .models import User

INN_PATTERN = re.compile(r'^\d{9}$')


def normalize_company_inn(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r'\D', '', str(value).strip())
    if not digits:
        return None
    return digits


def validate_company_inn(value: str | None) -> str:
    inn = normalize_company_inn(value)
    if not inn or not INN_PATTERN.match(inn):
        raise ValueError('STIR 9 ta raqamdan iborat bo\'lishi kerak')
    return inn


def inn_already_registered(inn: str, *, exclude_user_id: int | None = None) -> bool:
    qs = User.objects.filter(company_inn=inn, is_client=True)
    if exclude_user_id:
        qs = qs.exclude(pk=exclude_user_id)
    return qs.exists()
