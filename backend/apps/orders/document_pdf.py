from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from apps.orders.amount_words import amount_in_words_uz
from apps.orders.document_html import TYPE_ACT, TYPE_CMR, TYPE_INVOICE, TYPE_TTN, _money

logging.getLogger('fontTools').setLevel(logging.WARNING)
logging.getLogger('fontTools.subset').setLevel(logging.WARNING)

FONT_CANDIDATES = [
    Path(__file__).resolve().parent / 'fonts' / 'DejaVuSans.ttf',
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
    Path('/Library/Fonts/Arial Unicode.ttf'),
    Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf'),
]
BOLD_CANDIDATES = [
    Path(__file__).resolve().parent / 'fonts' / 'DejaVuSans-Bold.ttf',
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
]


def resolve_pdf_font() -> tuple[str, str] | None:
    regular = next((str(path) for path in FONT_CANDIDATES if path.exists()), None)
    if not regular:
        return None
    bold = next((str(path) for path in BOLD_CANDIDATES if path.exists()), regular)
    return regular, bold


def render_document_pdf(doc_type: str, snapshot: dict[str, Any], number: str) -> bytes | None:
    fonts = resolve_pdf_font()
    if not fonts:
        return None
    try:
        from fpdf import FPDF
    except ImportError:
        return None

    regular, bold = fonts
    pdf = FPDF(format='A4', unit='mm')
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    pdf.add_font('DocSans', '', regular)
    pdf.add_font('DocSans', 'B', bold)
    pdf.set_text_color(17, 17, 17)

    titles = {
        TYPE_INVOICE: 'HISOB-FAKTURA',
        TYPE_TTN: 'TOVAR-TRANSPORT YUK XATI (TTN)',
        TYPE_CMR: 'CMR — INTERNATIONAL CONSIGNMENT NOTE',
        TYPE_ACT: 'BAJARILGAN ISHLAR DALOLATNOMASI',
    }
    pdf.set_font('DocSans', 'B', 11)
    pdf.cell(0, 6, 'LOGISTIKA', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('DocSans', 'B', 16)
    pdf.multi_cell(0, 8, titles.get(doc_type, 'HUJJAT'))
    pdf.set_font('DocSans', '', 10)
    pdf.cell(0, 6, f'№ {number}   Buyurtma #{snapshot.get("order_id")}   {snapshot.get("generated_at") or ""}', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(3)

    shipper = snapshot.get('shipper') or {}
    consignee = snapshot.get('consignee') or {}
    carrier = snapshot.get('carrier') or {}
    vehicle = snapshot.get('vehicle') or {}

    def _kv(label: str, value: Any) -> None:
        text = '' if value in (None, '') else str(value)
        if not text:
            return
        pdf.set_font('DocSans', 'B', 9)
        pdf.cell(48, 6, label)
        pdf.set_font('DocSans', '', 9)
        pdf.multi_cell(0, 6, text, new_x='LMARGIN', new_y='NEXT')

    if doc_type == TYPE_INVOICE:
        _kv('Xaridor', shipper.get('name'))
        _kv('STIR', shipper.get('inn'))
        _kv('Manzil', shipper.get('address'))
        _kv('Ijrochi', carrier.get('name'))
        _kv('Xizmat', snapshot.get('title'))
        _kv('Marshrut', snapshot.get('route'))
        _kv('Summa', f"{_money(snapshot.get('amount'))} {snapshot.get('currency') or 'UZS'}")
        _kv('Komissiya', _money(snapshot.get('commission')))
        _kv('Tashuvchiga', _money(snapshot.get('driver_net')))
        _kv("So'z bilan", amount_in_words_uz(snapshot.get('amount')))
    elif doc_type == TYPE_TTN:
        _kv("Jo'natuvchi", shipper.get('name'))
        _kv('STIR', shipper.get('inn'))
        _kv('Qabul qiluvchi', consignee.get('name'))
        _kv('Tashuvchi', carrier.get('name'))
        _kv('Transport', f"{vehicle.get('make') or ''} {vehicle.get('model') or ''} {vehicle.get('number') or ''}".strip())
        _kv('Yuk', snapshot.get('title'))
        _kv("Og'irlik, kg", snapshot.get('weight'))
        _kv('Yuklash', snapshot.get('pickup_full'))
        _kv('Yetkazish', snapshot.get('delivery_full'))
        _kv('POD', snapshot.get('pod_receiver'))
    elif doc_type == TYPE_CMR:
        _kv('1. Sender', f"{shipper.get('name')} / {shipper.get('inn')}")
        _kv('2. Consignee', consignee.get('name'))
        _kv('3. Delivery', f"{snapshot.get('delivery_full')} ({snapshot.get('destination_country')})")
        _kv('4. Taking over', f"{snapshot.get('pickup_full')} ({snapshot.get('departure_country')})")
        _kv('6-12. Goods', f"{snapshot.get('title')}  {snapshot.get('weight')} kg")
        _kv('16. Carrier', f"{carrier.get('name')}  {vehicle.get('number')}")
        _kv('20. Freight', f"{_money(snapshot.get('amount'))} {snapshot.get('currency') or 'UZS'}")
    else:
        _kv('Buyurtmachi', shipper.get('name'))
        _kv('Ijrochi', carrier.get('name'))
        _kv('Ish', 'Yuk tashish xizmati')
        _kv('Marshrut', snapshot.get('route'))
        _kv('Davr', f"{snapshot.get('started_at') or ''} — {snapshot.get('completed_at') or ''}")
        _kv('Summa', f"{_money(snapshot.get('amount'))} {snapshot.get('currency') or 'UZS'}")
        _kv("So'z bilan", amount_in_words_uz(snapshot.get('amount')))

    pdf.ln(10)
    pdf.set_font('DocSans', '', 9)
    pdf.cell(63, 16, "Buyurtmachi ________", border=0)
    pdf.cell(63, 16, 'Tashuvchi ________', border=0)
    pdf.cell(0, 16, "M.O'. ________", new_x='LMARGIN', new_y='NEXT')
    return bytes(pdf.output())
