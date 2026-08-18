from __future__ import annotations

import html
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.orders.amount_words import amount_in_words_uz

TYPE_INVOICE = 'invoice'
TYPE_TTN = 'ttn'
TYPE_CMR = 'cmr'
TYPE_ACT = 'act'


def _esc(value) -> str:
    return html.escape('' if value is None else str(value))


def _money(value) -> str:
    try:
        amount = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        amount = Decimal('0')
    return f'{amount:,.2f}'.replace(',', ' ')

BASE_CSS = """
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: 'Times New Roman', Times, serif; color: #111; margin: 0; padding: 0; font-size: 12px; line-height: 1.35; }
.wrap { padding: 8px 4px 16px; }
.brand { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.brand-name { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #1e3a8a; font-weight: 700; font-family: Arial, sans-serif; }
.brand-meta { font-size: 10px; color: #555; text-align: right; }
h1 { font-size: 18px; margin: 0 0 2px; text-align: center; text-transform: uppercase; }
.subtitle { text-align: center; font-size: 11px; color: #444; margin-bottom: 12px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.box { border: 1px solid #222; padding: 8px 10px; min-height: 72px; }
.box h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #333; }
.box p { margin: 0 0 3px; }
.muted { color: #666; }
table.sheet { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
table.sheet th, table.sheet td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; }
table.sheet th { background: #f3f4f6; font-size: 11px; text-align: left; }
table.sheet td.num, table.sheet th.num { text-align: right; white-space: nowrap; }
.cmr { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #222; }
.cmr .cell { border: 1px solid #222; padding: 6px 8px; min-height: 58px; }
.cmr .span2 { grid-column: 1 / span 2; }
.cmr .label { font-size: 9px; text-transform: uppercase; color: #555; margin-bottom: 4px; }
.signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 28px; }
.sign { border-top: 1px solid #222; padding-top: 6px; min-height: 70px; }
.stamp { margin-top: 8px; font-size: 10px; color: #666; }
.note { font-size: 10px; color: #444; margin-top: 10px; }
.words { margin: 8px 0; font-style: italic; }
.printbar { margin: 0 0 12px; }
.printbar button { font-family: Arial, sans-serif; background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; }
@media print { .printbar { display: none; } body { padding: 0; } }
"""


def _party_html(title: str, party: dict[str, Any]) -> str:
    lines = [
        party.get('name') or '—',
        f"STIR: {party.get('inn')}" if party.get('inn') else '',
        party.get('address') or '',
        f"Tel: {party.get('phone')}" if party.get('phone') else '',
        f"Direktor: {party.get('director')}" if party.get('director') else '',
        f"Bank: {party.get('bank_name')} {party.get('bank_account')}".strip() if party.get('bank_name') or party.get('bank_account') else '',
        f"MFO: {party.get('mfo')}" if party.get('mfo') else '',
        f"OKED: {party.get('oked')}" if party.get('oked') else '',
    ]
    body = ''.join(f'<p>{_esc(line)}</p>' for line in lines if line)
    return f'<div class="box"><h3>{_esc(title)}</h3>{body}</div>'


def _chrome(title: str, subtitle: str, number: str, snapshot: dict[str, Any], inner: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{_esc(title)} {_esc(number)}</title>
  <style>{BASE_CSS}</style>
</head>
<body>
  <div class="wrap">
    <div class="printbar"><button onclick="window.print()">Chop etish / PDF saqlash</button></div>
    <div class="brand">
      <div class="brand-name">Logistika</div>
      <div class="brand-meta">Buyurtma #{_esc(snapshot.get('order_id'))}<br/>{_esc(snapshot.get('generated_at'))}</div>
    </div>
    <h1>{_esc(title)}</h1>
    <div class="subtitle">{_esc(subtitle)} · № {_esc(number)}</div>
    {inner}
  </div>
</body>
</html>
"""


def render_invoice_html(snapshot: dict[str, Any], number: str) -> str:
    shipper = snapshot.get('shipper') or {}
    carrier = snapshot.get('carrier') or {}
    amount = _money(snapshot.get('amount'))
    currency = snapshot.get('currency') or 'UZS'
    words = amount_in_words_uz(snapshot.get('amount'))
    inner = f"""
    <div class="grid2">
      {_party_html('Yetkazib beruvchi / ijrochi', carrier)}
      {_party_html('Xaridor / buyurtmachi', shipper)}
    </div>
    <table class="sheet">
      <thead>
        <tr>
          <th>№</th>
          <th>Xizmat / yuk nomi</th>
          <th>Marshrut</th>
          <th class="num">Og'irlik, kg</th>
          <th class="num">Summa, { _esc(currency) }</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>{_esc(snapshot.get('title') or 'Yuk tashish xizmati')}</td>
          <td>{_esc(snapshot.get('route'))}</td>
          <td class="num">{_esc(snapshot.get('weight'))}</td>
          <td class="num">{_esc(amount)}</td>
        </tr>
        <tr>
          <th colspan="4">Jami</th>
          <th class="num">{_esc(amount)}</th>
        </tr>
        <tr>
          <td colspan="4">Platforma komissiyasi</td>
          <td class="num">{_esc(_money(snapshot.get('commission')))}</td>
        </tr>
        <tr>
          <td colspan="4">Tashuvchiga o'tkazma</td>
          <td class="num">{_esc(_money(snapshot.get('driver_net')))}</td>
        </tr>
      </tbody>
    </table>
    <p class="words">Jami so'z bilan: {_esc(words)}</p>
    <p class="note">QQS ushbu marketplace hujjatida alohida ajratilmagan. Tomonlar o'z buxgalteriyasida hisoblaydi. Sana: {_esc(snapshot.get('completed_at') or snapshot.get('created_at'))}.</p>
    <div class="signs">
      <div class="sign">Xaridor<br/>F.I.Sh. / M.O'.</div>
      <div class="sign">Ijrochi<br/>F.I.Sh. / M.O'.</div>
      <div class="sign">Logistika<br/>platforma belgesi</div>
    </div>
    """
    return _chrome('Hisob-faktura', 'Счёт-фактура / Invoice', number, snapshot, inner)


def render_ttn_html(snapshot: dict[str, Any], number: str) -> str:
    shipper = snapshot.get('shipper') or {}
    consignee = snapshot.get('consignee') or {}
    carrier = snapshot.get('carrier') or {}
    vehicle = snapshot.get('vehicle') or {}
    stops = snapshot.get('stops') or []
    stop_rows = ''.join(
        f"<tr><td>{_esc(s.get('sequence'))}</td><td>{_esc(s.get('stop_type'))}</td>"
        f"<td>{_esc(s.get('label') or s.get('address'))}</td><td>{_esc(s.get('status'))}</td>"
        f"<td>{_esc(s.get('completed_at'))}</td></tr>"
        for s in stops
    ) or '<tr><td colspan="5">Marshrut: yuklash va yetkazish manzillari asosida</td></tr>'
    inner = f"""
    <div class="grid2">
      {_party_html("1. Yuk jo'natuvchi", shipper)}
      {_party_html('2. Yuk qabul qiluvchi', consignee)}
    </div>
    <div class="grid2">
      {_party_html('3. Tashuvchi', carrier)}
      <div class="box">
        <h3>4. Transport vositasi</h3>
        <p>{_esc(' '.join(part for part in (vehicle.get('make'), vehicle.get('model')) if part) or '—')}</p>
        <p>Davlat raqami: {_esc(vehicle.get('number') or '—')}</p>
        <p>Haydovchi: {_esc(carrier.get('name'))}</p>
        <p>Tel: {_esc(carrier.get('phone'))}</p>
      </div>
    </div>
    <table class="sheet">
      <thead>
        <tr>
          <th>Yuk nomi</th>
          <th>Kategoriya</th>
          <th class="num">Joylar</th>
          <th class="num">Og'irlik, kg</th>
          <th class="num">Hajm, m³</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{_esc(snapshot.get('title'))}</td>
          <td>{_esc(snapshot.get('cargo_category'))}</td>
          <td class="num">{_esc(snapshot.get('units_count') or '—')}</td>
          <td class="num">{_esc(snapshot.get('weight'))}</td>
          <td class="num">{_esc(snapshot.get('volume_m3') or '—')}</td>
        </tr>
      </tbody>
    </table>
    <table class="sheet">
      <thead>
        <tr><th>Yuklash manzili</th><th>Yetkazish manzili</th><th>Masofa</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>{_esc(snapshot.get('pickup_full'))}<br/>{_esc(snapshot.get('started_at'))}</td>
          <td>{_esc(snapshot.get('delivery_full'))}<br/>{_esc(snapshot.get('pod_at') or snapshot.get('completed_at'))}</td>
          <td>{_esc(snapshot.get('distance_km') or '—')} km</td>
        </tr>
      </tbody>
    </table>
    <table class="sheet">
      <thead>
        <tr><th>№</th><th>Tur</th><th>Manzil</th><th>Holat</th><th>Vaqt</th></tr>
      </thead>
      <tbody>{stop_rows}</tbody>
    </table>
    <p class="note">POD qabul qiluvchi: {_esc(snapshot.get('pod_receiver') or consignee.get('name') or '—')}. Imzo va muhur tomonlar o'rtasida qo'yiladi.</p>
    <div class="signs">
      <div class="sign">Jo'natuvchi topshirdi<br/>sana / imzo / M.O'.</div>
      <div class="sign">Tashuvchi qabul qildi<br/>sana / imzo</div>
      <div class="sign">Qabul qiluvchi oldi<br/>sana / imzo / M.O'.</div>
    </div>
    """
    return _chrome('Tovar-transport yuk xati (TTN)', 'Товарно-транспортная накладная', number, snapshot, inner)


def render_cmr_html(snapshot: dict[str, Any], number: str) -> str:
    shipper = snapshot.get('shipper') or {}
    consignee = snapshot.get('consignee') or {}
    carrier = snapshot.get('carrier') or {}
    vehicle = snapshot.get('vehicle') or {}
    inner = f"""
    <div class="cmr">
      <div class="cell"><div class="label">1. Sender / Jo'natuvchi</div>{_esc(shipper.get('name'))}<br/>{_esc(shipper.get('address'))}<br/>STIR {_esc(shipper.get('inn'))} · {_esc(shipper.get('phone'))}</div>
      <div class="cell"><div class="label">16. Carrier / Tashuvchi</div>{_esc(carrier.get('name'))}<br/>{_esc(carrier.get('phone'))}<br/>{_esc(vehicle.get('make'))} {_esc(vehicle.get('model'))} {_esc(vehicle.get('number'))}</div>
      <div class="cell"><div class="label">2. Consignee / Qabul qiluvchi</div>{_esc(consignee.get('name'))}<br/>{_esc(consignee.get('phone'))}<br/>{_esc(snapshot.get('delivery_full'))}</div>
      <div class="cell"><div class="label">4. Place of taking over / Yuklash</div>{_esc(snapshot.get('pickup_full'))}<br/>{_esc(snapshot.get('started_at') or snapshot.get('created_at'))}<br/>{_esc(snapshot.get('departure_country'))}</div>
      <div class="cell"><div class="label">3. Place of delivery / Yetkazish</div>{_esc(snapshot.get('delivery_full'))}<br/>{_esc(snapshot.get('pod_at') or snapshot.get('completed_at'))}<br/>{_esc(snapshot.get('destination_country'))}</div>
      <div class="cell"><div class="label">13. Sender's instructions</div>Marketplace buyurtma #{_esc(snapshot.get('order_id'))}. Maxsus talablar buyurtma kartasida.</div>
      <div class="cell span2">
        <div class="label">6–12. Marks, packages, nature of goods, weight</div>
        <table class="sheet" style="margin:6px 0 0">
          <tr><th>Goods</th><th>Packages</th><th>Gross weight kg</th><th>Volume m³</th></tr>
          <tr>
            <td>{_esc(snapshot.get('title'))} ({_esc(snapshot.get('cargo_category'))})</td>
            <td>{_esc(snapshot.get('units_count') or '—')}</td>
            <td>{_esc(snapshot.get('weight'))}</td>
            <td>{_esc(snapshot.get('volume_m3') or '—')}</td>
          </tr>
        </table>
      </div>
      <div class="cell"><div class="label">20. Special agreements / Freight</div>{_esc(_money(snapshot.get('amount')))} {_esc(snapshot.get('currency'))}</div>
      <div class="cell"><div class="label">21. Established in / Tuzilgan</div>{_esc(snapshot.get('departure_city') or 'Toshkent')}<br/>{_esc(snapshot.get('created_at'))}</div>
      <div class="cell"><div class="label">22. Signature of sender</div><div class="stamp">Imzo / M.O'.</div></div>
      <div class="cell"><div class="label">23. Signature of carrier</div><div class="stamp">Imzo</div></div>
      <div class="cell span2"><div class="label">24. Goods received / Yuk qabul qilindi</div>Qabul qiluvchi: {_esc(snapshot.get('pod_receiver') or consignee.get('name') or '—')} · {_esc(snapshot.get('pod_at') or snapshot.get('completed_at'))}<div class="stamp">Imzo / M.O'.</div></div>
    </div>
    <p class="note">CMR Convention on the Contract for the International Carriage of Goods by Road. Ushbu nusxa Logistika buyurtmasi asosida shakllantirilgan; asl blankaga ko'chirilishi mumkin.</p>
    """
    return _chrome('CMR', 'International consignment note / Xalqaro yuk xati', number, snapshot, inner)


def render_act_html(snapshot: dict[str, Any], number: str) -> str:
    shipper = snapshot.get('shipper') or {}
    carrier = snapshot.get('carrier') or {}
    words = amount_in_words_uz(snapshot.get('amount'))
    inner = f"""
    <p>Biz, quyida imzo chekuvchilar, ushbu dalolatnomani tuzdik:</p>
    <div class="grid2">
      {_party_html('Buyurtmachi', shipper)}
      {_party_html('Ijrochi / tashuvchi', carrier)}
    </div>
    <p>Ijrochi buyurtma #{_esc(snapshot.get('order_id'))} bo'yicha yuk tashish xizmatini bajardi:</p>
    <table class="sheet">
      <tr><th>Ish turi</th><td>Avtomobil transportida yuk tashish</td></tr>
      <tr><th>Yuk</th><td>{_esc(snapshot.get('title'))}</td></tr>
      <tr><th>Marshrut</th><td>{_esc(snapshot.get('route'))}</td></tr>
      <tr><th>Davr</th><td>{_esc(snapshot.get('started_at') or snapshot.get('created_at'))} — {_esc(snapshot.get('completed_at') or snapshot.get('generated_at'))}</td></tr>
      <tr><th>Masofa</th><td>{_esc(snapshot.get('distance_km') or '—')} km</td></tr>
      <tr><th>Kelishilgan summa</th><td>{_esc(_money(snapshot.get('amount')))} {_esc(snapshot.get('currency'))}</td></tr>
      <tr><th>So'z bilan</th><td>{_esc(words)}</td></tr>
    </table>
    <p>Buyurtmachi xizmatning bajarilganini tasdiqlaydi. Tomonlarning bir-biriga ushbu dalolatnoma bo'yicha da'vosi yo'q. Nizo yuzaga kelsa, Logistika shikoyat va escrow qoidalari qo'llaniladi.</p>
    <div class="signs">
      <div class="sign">Buyurtmachi<br/>{_esc(shipper.get('director') or shipper.get('name'))}</div>
      <div class="sign">Ijrochi<br/>{_esc(carrier.get('name'))}</div>
      <div class="sign">Sana<br/>{_esc(snapshot.get('completed_at') or snapshot.get('generated_at'))}</div>
    </div>
    """
    return _chrome(
        'Bajarilgan ishlar dalolatnomasi',
        'Акт выполненных работ / Work completion act',
        number,
        snapshot,
        inner,
    )


def render_document_html(doc_type: str, snapshot: dict[str, Any], number: str) -> str:
    if doc_type == TYPE_INVOICE:
        return render_invoice_html(snapshot, number)
    if doc_type == TYPE_TTN:
        return render_ttn_html(snapshot, number)
    if doc_type == TYPE_CMR:
        return render_cmr_html(snapshot, number)
    if doc_type == TYPE_ACT:
        return render_act_html(snapshot, number)
    return render_invoice_html(snapshot, number)
