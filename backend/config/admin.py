from django.contrib import admin
from django.contrib import messages
from django.contrib.admin import AdminSite
from django.urls import path
from django.shortcuts import render, redirect
from django.db.models import Count, Sum, Avg, Q, F
from django.template.response import TemplateResponse
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from datetime import timedelta
import csv
from io import BytesIO
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from openpyxl import Workbook
from apps.users.models import User
from apps.vehicles.models import Vehicle
from apps.advertisements.models import Advertisement
from apps.orders.models import Order, OrderLocationTrack
from apps.orders.models import OrderStatus
from apps.bids.models import Bid
from apps.payments.models import Payment
from apps.news.models import News
from apps.chats.models import Message
from apps.notifications.models import Notification
from apps.ratings.models import Rating, Complaint
from apps.subscriptions.models import MarketplaceTrialAccount, TrialDeviceGrant
from apps.dispatcher.models import DispatcherAssignment
from rest_framework_simplejwt.tokens import AccessToken


class CustomAdminSite(AdminSite):
    site_header = "Logistika Admin Panel"
    site_title = "Logistika Admin"
    index_title = "Boshqaruv paneli"

    def _sync_default_registry(self):
        """
        App admin.py fayllarining ko'pchiligi default admin.site ga register bo'ladi.
        Custom admin panelda ham hammasi ko'rinishi uchun registry ni sinxron qilamiz.
        """
        if admin.site is self:
            return
        for model, model_admin in admin.site._registry.items():
            if model not in self._registry:
                self._registry[model] = model_admin

    def each_context(self, request):
        self._sync_default_registry()
        context = super().each_context(request)
        context["control_panel_links"] = [
            {"title": "To'liq statistikalar", "url": "/admin/statistics/", "kind": "primary"},
            {"title": "Operations Intelligence", "url": "/admin/operations/", "kind": "primary"},
            {"title": "Haydovchi verifikatsiyasi", "url": "/admin/driver-verification/", "kind": "success"},
            {"title": "Transport verifikatsiyasi", "url": "/admin/vehicle-verification/", "kind": "success"},
            {"title": "Jalobalar navbati", "url": "/admin/ratings/complaint/?status__exact=pending", "kind": "warning"},
            {"title": "Trial monitoring", "url": "/admin/subscriptions/marketplacetrialaccount/", "kind": "warning"},
            {"title": "Buyurtmalar", "url": "/admin/orders/order/", "kind": "default"},
            {"title": "To'lovlar", "url": "/admin/payments/payment/", "kind": "default"},
            {"title": "Foydalanuvchilar", "url": "/admin/users/user/", "kind": "default"},
            {"title": "Chatlar", "url": "/admin/chats/chat/", "kind": "default"},
        ]
        return context

    def get_app_list(self, request, app_label=None):
        self._sync_default_registry()
        return super().get_app_list(request, app_label=app_label)

    def _get_filtered_active_orders(self, request):
        status_filter = (request.GET.get('status') or '').strip()
        driver_filter = (request.GET.get('driver_id') or '').strip()
        client_filter = (request.GET.get('client_id') or '').strip()
        has_location_filter = (request.GET.get('has_location') or '').strip()
        qs = (
            Order.objects
            .filter(status__code__in=['in_progress', 'in_transit', 'approved_by_client', 'pending'])
            .select_related('driver', 'client', 'status')
            .order_by('-updated_at')
        )
        if status_filter:
            qs = qs.filter(status__code=status_filter)
        if driver_filter.isdigit():
            qs = qs.filter(driver_id=int(driver_filter))
        if client_filter.isdigit():
            qs = qs.filter(client_id=int(client_filter))
        if has_location_filter == 'yes':
            qs = qs.filter(current_location_lat__isnull=False, current_location_lng__isnull=False)
        elif has_location_filter == 'no':
            qs = qs.filter(Q(current_location_lat__isnull=True) | Q(current_location_lng__isnull=True))
        return qs
    
    def index(self, request, extra_context=None):
        self._sync_default_registry()
        extra_context = extra_context or {}
        today = timezone.now().date()
        week_ago = today - timedelta(days=7)
        
        quick_stats = {
            'unverified_drivers': User.objects.filter(is_driver=True, is_verified=False).count(),
            'pending_orders': Order.objects.filter(status__code='pending').count(),
            'active_orders': Order.objects.filter(status__code__in=['in_progress', 'in_transit']).count(),
            'problem_orders': Order.objects.filter(status__code__in=['rejected', 'stopped', 'cancelled']).count(),
            'today_advertisements': Advertisement.objects.filter(created_at__date=today).count(),
            'today_payments': Payment.objects.filter(created_at__date=today, payment_status='completed').count(),
            'today_payment_amount': Payment.objects.filter(
                created_at__date=today,
                payment_status='completed',
            ).aggregate(total=Sum('amount'))['total'] or 0,
            'new_users_week': User.objects.filter(created_at__date__gte=week_ago).count(),
            'active_users_week': User.objects.filter(last_login__date__gte=week_ago).count(),
            'unverified_vehicles': Vehicle.objects.filter(is_verified=False).count(),
        }
        system_health = {
            "orders_without_driver": Order.objects.filter(driver__isnull=True).count(),
            "payments_pending": Payment.objects.filter(payment_status='pending').count(),
            "bids_open": Bid.objects.filter(status='pending').count() if hasattr(Bid, "status") else Bid.objects.count(),
        }

        trend_points = []
        for offset in range(6, -1, -1):
            day = today - timedelta(days=offset)
            users_count = User.objects.filter(created_at__date=day).count()
            orders_count = Order.objects.filter(created_at__date=day).count()
            payments_count = Payment.objects.filter(
                created_at__date=day,
                payment_status='completed',
            ).count()
            trend_points.append({
                "label": day.strftime("%d.%m"),
                "users": users_count,
                "orders": orders_count,
                "payments": payments_count,
            })

        max_users = max([p["users"] for p in trend_points], default=1) or 1
        max_orders = max([p["orders"] for p in trend_points], default=1) or 1
        max_payments = max([p["payments"] for p in trend_points], default=1) or 1
        for point in trend_points:
            point["users_pct"] = int((point["users"] / max_users) * 100) if max_users else 0
            point["orders_pct"] = int((point["orders"] / max_orders) * 100) if max_orders else 0
            point["payments_pct"] = int((point["payments"] / max_payments) * 100) if max_payments else 0

        chart_labels = [p["label"] for p in trend_points]
        users_series = [p["users"] for p in trend_points]
        orders_series = [p["orders"] for p in trend_points]
        payments_series = [p["payments"] for p in trend_points]

        daily_revenue_points = []
        for offset in range(13, -1, -1):
            day = today - timedelta(days=offset)
            amount = Payment.objects.filter(
                created_at__date=day,
                payment_status='completed',
            ).aggregate(total=Sum('amount'))['total'] or 0
            daily_revenue_points.append({
                "label": day.strftime("%d.%m"),
                "amount": float(amount),
            })
        revenue_labels = [p["label"] for p in daily_revenue_points]
        revenue_series = [p["amount"] for p in daily_revenue_points]

        order_status_distribution = list(
            Order.objects.values('status__code')
            .annotate(count=Count('id'))
            .order_by('-count')[:8]
        )
        status_labels = [item['status__code'] or 'unknown' for item in order_status_distribution]
        status_series = [item['count'] for item in order_status_distribution]

        recent_problem_orders = list(
            Order.objects.filter(status__code__in=['rejected', 'stopped', 'cancelled'])
            .select_related('status', 'client', 'driver')
            .order_by('-created_at')[:8]
        )
        pending_driver_reviews = list(
            User.objects.filter(is_driver=True, is_verified=False)
            .order_by('-created_at')[:8]
        )

        status_filter = (request.GET.get('status') or '').strip()
        dispatcher_filter = (request.GET.get('dispatcher_id') or '').strip()
        driver_filter = (request.GET.get('driver_id') or '').strip()
        client_filter = (request.GET.get('client_id') or '').strip()
        has_location_filter = (request.GET.get('has_location') or '').strip()

        active_orders_qs = self._get_filtered_active_orders(request)

        active_rows = []
        for order in active_orders_qs:
            last_assignment = (
                order.dispatcher_assignments
                .select_related('dispatcher')
                .order_by('-assigned_at')
                .first()
            )
            if dispatcher_filter.isdigit():
                dispatcher_id = int(dispatcher_filter)
                if not last_assignment or last_assignment.dispatcher_id != dispatcher_id:
                    continue
            active_rows.append({
                "order": order,
                "driver": order.driver,
                "client": order.client,
                "status_name": order.status.name_ru if hasattr(order.status, "name_ru") else order.status.code,
                "status_code": order.status.code,
                "lat": order.current_location_lat,
                "lng": order.current_location_lng,
                "dispatcher": last_assignment.dispatcher if last_assignment else None,
            })

        live_driver_locations = []
        live_incidents = []
        for row in active_rows:
            order = row["order"]
            latest_track = (
                OrderLocationTrack.objects
                .filter(order=order)
                .order_by('-timestamp')
                .first()
            )
            last_update = latest_track.timestamp if latest_track else order.updated_at
            if last_update:
                age_sec = max(0, int((timezone.now() - last_update).total_seconds()))
            else:
                age_sec = None
            freshness = "stale"
            if age_sec is not None:
                if age_sec <= 30:
                    freshness = "fresh"
                elif age_sec <= 60:
                    freshness = "warm"
                elif age_sec <= 180:
                    freshness = "stale"
                else:
                    freshness = "offline"
            lat = row["lat"]
            lng = row["lng"]
            if lat is not None and lng is not None:
                map_url = f"https://www.google.com/maps?q={lat},{lng}"
            else:
                map_url = None
            live_driver_locations.append({
                "driver": row["driver"],
                "order": order,
                "dispatcher": row["dispatcher"],
                "lat": lat,
                "lng": lng,
                "last_update": last_update,
                "age_sec": age_sec,
                "freshness": freshness,
                "map_url": map_url,
            })
            if age_sec is not None and age_sec >= 300:
                live_incidents.append({
                    "level": "critical" if age_sec >= 900 else "warning",
                    "title": f"Order #{order.id}: stale location",
                    "message": f"Haydovchi lokatsiyasi {age_sec} soniyadan beri yangilanmagan.",
                    "order_id": order.id,
                })
            if order.route_deviation_last_distance_meters and order.route_deviation_last_distance_meters > order.route_deviation_threshold_meters:
                live_incidents.append({
                    "level": "critical",
                    "title": f"Order #{order.id}: route deviation",
                    "message": f"Marshrutdan chiqish {int(order.route_deviation_last_distance_meters)}m.",
                    "order_id": order.id,
                })

        live_driver_map_points = [
            {
                "driver_name": f"{item['driver'].first_name} {item['driver'].last_name}".strip(),
                "driver_phone": item["driver"].phone,
                "order_id": item["order"].id,
                "dispatcher_name": (
                    f"{item['dispatcher'].first_name} {item['dispatcher'].last_name}".strip()
                    if item["dispatcher"] else None
                ),
                "lat": float(item["lat"]) if item["lat"] is not None else None,
                "lng": float(item["lng"]) if item["lng"] is not None else None,
                "freshness": item["freshness"],
                "age_sec": item["age_sec"],
            }
            for item in live_driver_locations
            if item["lat"] is not None and item["lng"] is not None
        ]

        replay_order_id_param = (request.GET.get('replay_order_id') or '').strip()
        replay_hours_param = (request.GET.get('replay_hours') or '1').strip()
        replay_hours = int(replay_hours_param) if replay_hours_param.isdigit() and int(replay_hours_param) in [1, 2, 3] else 1
        replay_order_options = [{"id": row["order"].id, "label": f"#{row['order'].id}"} for row in active_rows]
        replay_order = None
        if replay_order_id_param.isdigit():
            replay_order = next((row["order"] for row in active_rows if row["order"].id == int(replay_order_id_param)), None)
        if replay_order is None and active_rows:
            replay_order = active_rows[0]["order"]

        route_replay_points = []
        geofence_data = {"pickup": None, "destination": None}
        if replay_order:
            tracks_qs = (
                OrderLocationTrack.objects
                .filter(order=replay_order, timestamp__gte=timezone.now() - timedelta(hours=replay_hours))
                .order_by('timestamp')[:2000]
            )
            route_replay_points = [
                {
                    "lat": float(track.lat),
                    "lng": float(track.lng),
                    "ts": timezone.localtime(track.timestamp).strftime('%H:%M:%S'),
                }
                for track in tracks_qs
            ]

            planned_points = replay_order.planned_route_points if isinstance(replay_order.planned_route_points, list) else []
            normalized_planned = []
            for point in planned_points:
                if not isinstance(point, dict):
                    continue
                lat = point.get("lat", point.get("latitude"))
                lng = point.get("lng", point.get("longitude"))
                try:
                    lat_f = float(lat)
                    lng_f = float(lng)
                except (TypeError, ValueError):
                    continue
                normalized_planned.append({"lat": lat_f, "lng": lng_f})

            fallback_points = route_replay_points or (
                [{"lat": float(replay_order.current_location_lat), "lng": float(replay_order.current_location_lng)}]
                if replay_order.current_location_lat is not None and replay_order.current_location_lng is not None
                else []
            )
            pickup_point = normalized_planned[0] if normalized_planned else (fallback_points[0] if fallback_points else None)
            destination_point = normalized_planned[-1] if normalized_planned else (fallback_points[-1] if fallback_points else None)

            geofence_data = {
                "pickup": {
                    "lat": pickup_point["lat"],
                    "lng": pickup_point["lng"],
                    "radius": replay_order.pickup_geofence_radius_meters,
                    "label": f"Pickup geofence (Order #{replay_order.id})",
                } if pickup_point else None,
                "destination": {
                    "lat": destination_point["lat"],
                    "lng": destination_point["lng"],
                    "radius": replay_order.destination_geofence_radius_meters,
                    "label": f"Destination geofence (Order #{replay_order.id})",
                } if destination_point else None,
            }

        heatmap_points = [
            {
                "lat": p["lat"],
                "lng": p["lng"],
                "weight": 1.0 if p["freshness"] == "fresh" else (0.7 if p["freshness"] == "warm" else 0.4),
            }
            for p in live_driver_map_points
        ]

        status_options = list(
            Order.objects.filter(status__code__in=['pending', 'approved_by_client', 'in_progress', 'in_transit'])
            .values('status__code', 'status__name_ru')
            .distinct()
            .order_by('status__code')
        )
        dispatcher_options = list(
            User.objects.filter(is_dispatcher=True)
            .values('id', 'first_name', 'last_name', 'phone')
            .order_by('first_name', 'last_name')[:100]
        )
        driver_options = list(
            User.objects.filter(is_driver=True)
            .values('id', 'first_name', 'last_name', 'phone')
            .order_by('first_name', 'last_name')[:200]
        )
        client_options = list(
            User.objects.filter(is_client=True)
            .values('id', 'first_name', 'last_name', 'phone')
            .order_by('first_name', 'last_name')[:200]
        )
        bulk_status_options = list(
            OrderStatus.objects.values('code', 'name_ru').order_by('code')
        )

        driver_stats = list(
            User.objects.filter(is_driver=True)
            .annotate(
                total_orders=Count('driver_orders', distinct=True),
                active_orders=Count(
                    'driver_orders',
                    filter=Q(driver_orders__status__code__in=['in_progress', 'in_transit', 'approved_by_client']),
                    distinct=True,
                ),
                avg_rating=Avg('ratings_received__rating', filter=Q(ratings_received__to_user__is_driver=True)),
                rating_count=Count('ratings_received', filter=Q(ratings_received__to_user__is_driver=True), distinct=True),
            )
            .order_by('-active_orders', '-total_orders')[:10]
        )

        client_stats = list(
            User.objects.filter(is_client=True)
            .annotate(
                total_orders=Count('client_orders', distinct=True),
                active_orders=Count(
                    'client_orders',
                    filter=Q(client_orders__status__code__in=['pending', 'approved_by_client', 'in_progress', 'in_transit']),
                    distinct=True,
                ),
                avg_rating=Avg('ratings_received__rating', filter=Q(ratings_received__to_user__is_client=True)),
                rating_count=Count('ratings_received', filter=Q(ratings_received__to_user__is_client=True), distinct=True),
            )
            .order_by('-active_orders', '-total_orders')[:10]
        )

        dispatcher_stats = list(
            User.objects.filter(is_dispatcher=True)
            .annotate(
                active_assignments=Count(
                    'dispatcher_assignments',
                    filter=Q(dispatcher_assignments__status__in=['assigned', 'reassigned']),
                    distinct=True,
                ),
                assigned_count=Count('dispatcher_assignments', distinct=True),
            )
            .order_by('-active_assignments', '-assigned_count')[:10]
        )

        active_ops_qs = Order.objects.filter(status__code__in=['in_progress', 'in_transit', 'approved_by_client'])
        pending_qs = Order.objects.filter(status__code='pending')
        stale_threshold = timezone.now() - timedelta(minutes=3)
        stale_location_count = active_ops_qs.filter(updated_at__lte=stale_threshold).count()
        delayed_pending_count = pending_qs.filter(created_at__lte=timezone.now() - timedelta(hours=2)).count()
        route_deviation_count = Order.objects.filter(
            route_deviation_last_distance_meters__isnull=False,
            route_deviation_last_alert_at__gte=timezone.now() - timedelta(days=1),
        ).count()
        sla_alerts = {
            "stale_location_count": stale_location_count,
            "delayed_pending_count": delayed_pending_count,
            "route_deviation_count": route_deviation_count,
            "total_alerts": stale_location_count + delayed_pending_count + route_deviation_count,
        }

        data_quality = {
            "orders_without_driver": Order.objects.filter(driver__isnull=True).count(),
            "orders_without_location": active_ops_qs.filter(
                Q(current_location_lat__isnull=True) | Q(current_location_lng__isnull=True)
            ).count(),
            "completed_without_payment": Order.objects.filter(status__code='completed').exclude(
                payments__payment_status='completed'
            ).distinct().count(),
            "completed_without_rating": Order.objects.filter(status__code='completed').exclude(
                ratings__isnull=False
            ).distinct().count(),
        }

        from apps.common.infrastructure import get_infrastructure_snapshot

        context = {
            **self.each_context(request),
            "title": self.index_title,
            "quick_stats": quick_stats,
            "system_health": system_health,
            "infrastructure_snapshot": get_infrastructure_snapshot(),
            "trend_points": trend_points,
            "chart_labels": chart_labels,
            "users_series": users_series,
            "orders_series": orders_series,
            "payments_series": payments_series,
            "revenue_labels": revenue_labels,
            "revenue_series": revenue_series,
            "status_labels": status_labels,
            "status_series": status_series,
            "recent_problem_orders": recent_problem_orders,
            "pending_driver_reviews": pending_driver_reviews,
            "finance_snapshot": {
                "completed_today_amount": Payment.objects.filter(
                    created_at__date=today, payment_status='completed'
                ).aggregate(total=Sum('amount'))["total"] or 0,
                "completed_week_amount": Payment.objects.filter(
                    created_at__date__gte=week_ago, payment_status='completed'
                ).aggregate(total=Sum('amount'))["total"] or 0,
                "pending_count": Payment.objects.filter(payment_status='pending').count(),
                "refunded_count": Payment.objects.filter(refunded_at__isnull=False).count(),
            },
            "communication_snapshot": {
                "unread_messages": Message.objects.filter(is_read=False, is_deleted=False).count(),
                "unread_notifications": Notification.objects.filter(is_read=False).count(),
                "messages_today": Message.objects.filter(created_at__date=today).count(),
                "notifications_today": Notification.objects.filter(created_at__date=today).count(),
            },
            "moderation_queue": {
                "vehicle_verification_pending": Vehicle.objects.filter(verification_status='pending').count(),
                "driver_verification_pending": User.objects.filter(
                    is_driver=True,
                    verification_status='pending',
                ).count(),
                "open_bid_negotiations": Bid.objects.filter(
                    is_rejected_by_client=False,
                    is_rejected_by_driver=False,
                    is_accepted_by_client=False,
                ).count(),
                "pending_complaints": Complaint.objects.filter(status='pending').count(),
                "complaints_in_review": Complaint.objects.filter(status='in_review').count(),
                "trial_disabled_accounts": MarketplaceTrialAccount.objects.filter(trial_disabled=True).count(),
                "trial_exhausted_accounts": MarketplaceTrialAccount.objects.filter(
                    trial_disabled=False,
                    free_uses_consumed__gte=F('free_uses_granted'),
                ).count(),
                "trial_device_grants": TrialDeviceGrant.objects.count(),
            },
            "active_rows": active_rows,
            "live_driver_locations": live_driver_locations,
            "live_incidents": live_incidents[:12],
            "live_driver_map_points": live_driver_map_points,
            "heatmap_points": heatmap_points,
            "route_replay_points": route_replay_points,
            "replay_order_options": replay_order_options,
            "replay_order_id": str(replay_order.id) if replay_order else "",
            "replay_hours": replay_hours,
            "geofence_data": geofence_data,
            "filters": {
                "status": status_filter,
                "dispatcher_id": dispatcher_filter,
                "driver_id": driver_filter,
                "client_id": client_filter,
                "has_location": has_location_filter,
            },
            "status_options": status_options,
            "dispatcher_options": dispatcher_options,
            "driver_options": driver_options,
            "client_options": client_options,
            "bulk_status_options": bulk_status_options,
            "sla_alerts": sla_alerts,
            "data_quality": data_quality,
            "driver_stats": driver_stats,
            "client_stats": client_stats,
            "dispatcher_stats": dispatcher_stats,
            "app_list": self.get_app_list(request),
            "last_updated_at": timezone.now(),
            "admin_ws_token": str(AccessToken.for_user(request.user)) if request.user.is_authenticated else "",
        }
        context.update(extra_context)
        return TemplateResponse(request, "admin/control_center.html", context)

    def get_urls(self):
        self._sync_default_registry()
        urls = super().get_urls()
        custom_urls = [
            path('export/live-operations.csv', self.admin_view(self.export_live_operations_csv), name='admin_export_live_operations_csv'),
            path('export/live-operations.xlsx', self.admin_view(self.export_live_operations_excel), name='admin_export_live_operations_excel'),
            path('live-data/', self.admin_view(self.live_data_api), name='admin_live_data_api'),
            path('bulk/live-operations/', self.admin_view(self.bulk_live_operations), name='admin_bulk_live_operations'),
            path('operations/', self.admin_view(self.operations_view), name='admin_operations'),
            path('statistics/', self.admin_view(self.statistics_view), name='admin_statistics'),
            path('driver-verification/', self.admin_view(self.driver_verification_view), name='admin_driver_verification'),
            path('vehicle-verification/', self.admin_view(self.vehicle_verification_view), name='admin_vehicle_verification'),
        ]
        return custom_urls + urls

    def _build_live_operations_export_rows(self, request, limit=1000):
        dispatcher_filter = (request.GET.get('dispatcher_id') or '').strip()
        rows = []
        for order in self._get_filtered_active_orders(request):
            last_assignment = order.dispatcher_assignments.select_related('dispatcher').order_by('-assigned_at').first()
            if dispatcher_filter.isdigit():
                if not last_assignment or last_assignment.dispatcher_id != int(dispatcher_filter):
                    continue
            rows.append({
                "order_id": order.id,
                "status": order.status.code,
                "driver": f"{order.driver.first_name} {order.driver.last_name}".strip(),
                "driver_phone": order.driver.phone,
                "client": f"{order.client.first_name} {order.client.last_name}".strip(),
                "client_phone": order.client.phone,
                "dispatcher": (f"{last_assignment.dispatcher.first_name} {last_assignment.dispatcher.last_name}".strip() if last_assignment else ''),
                "lat": str(order.current_location_lat or ''),
                "lng": str(order.current_location_lng or ''),
                "updated_at": timezone.localtime(order.updated_at).strftime('%Y-%m-%d %H:%M:%S') if order.updated_at else '',
            })
            if len(rows) >= limit:
                break
        return rows

    def export_live_operations_csv(self, request):
        rows = self._build_live_operations_export_rows(request)

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="live_operations.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'order_id', 'status', 'driver', 'driver_phone', 'client', 'client_phone',
            'dispatcher', 'lat', 'lng', 'updated_at'
        ])
        for item in rows:
            writer.writerow([
                item["order_id"],
                item["status"],
                item["driver"],
                item["driver_phone"],
                item["client"],
                item["client_phone"],
                item["dispatcher"],
                item["lat"],
                item["lng"],
                item["updated_at"],
            ])
        return response

    def export_live_operations_excel(self, request):
        rows = self._build_live_operations_export_rows(request)
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "live_operations"
        headers = [
            'order_id', 'status', 'driver', 'driver_phone', 'client', 'client_phone',
            'dispatcher', 'lat', 'lng', 'updated_at'
        ]
        sheet.append(headers)
        for item in rows:
            sheet.append([item[h] for h in headers])
        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="live_operations.xlsx"'
        return response

    def bulk_live_operations(self, request):
        if request.method != 'POST':
            return redirect('/admin/')
        wants_json = request.headers.get('x-requested-with') == 'XMLHttpRequest'

        def _respond(level, text):
            if wants_json:
                return JsonResponse({"ok": level == "success", "level": level, "message": text})
            if level == "success":
                messages.success(request, text)
            elif level == "warning":
                messages.warning(request, text)
            else:
                messages.error(request, text)
            return redirect(request.META.get('HTTP_REFERER') or '/admin/')

        action = (request.POST.get('bulk_action') or '').strip()
        dispatcher_id = (request.POST.get('bulk_dispatcher_id') or '').strip()
        status_code = (request.POST.get('bulk_status_code') or '').strip()
        order_ids_raw = (request.POST.get('order_ids') or '').strip()
        order_ids = [int(x) for x in order_ids_raw.split(',') if x.strip().isdigit()]
        if not order_ids:
            return _respond("warning", "Bulk amal uchun order tanlang.")

        orders = list(
            Order.objects.filter(id__in=order_ids).select_related('driver', 'status')
        )
        if not orders:
            return _respond("warning", "Tanlangan orderlar topilmadi.")

        if action in ['assign_dispatcher', 'reassign_dispatcher']:
            if not dispatcher_id.isdigit():
                return _respond("error", "Dispatcher tanlanmadi.")
            dispatcher = User.objects.filter(id=int(dispatcher_id), is_dispatcher=True).first()
            if not dispatcher:
                return _respond("error", "Dispatcher topilmadi.")

            assign_status = 'assigned' if action == 'assign_dispatcher' else 'reassigned'
            for order in orders:
                DispatcherAssignment.objects.create(
                    dispatcher=dispatcher,
                    order=order,
                    assigned_driver=order.driver,
                    status=assign_status,
                )
            channel_layer = get_channel_layer()
            if channel_layer is not None:
                async_to_sync(channel_layer.group_send)(
                    'dispatcher_tracking',
                    {
                        'type': 'ops_refresh',
                        'reason': action,
                        'updated_at': timezone.localtime(timezone.now()).isoformat(),
                    },
                )
            return _respond("success", f"{len(orders)} ta order uchun dispatcher biriktirildi.")
        elif action == 'update_status':
            if not status_code:
                return _respond("error", "Yangi status tanlanmadi.")
            new_status = OrderStatus.objects.filter(code=status_code).first()
            if not new_status:
                return _respond("error", "Status topilmadi.")
            Order.objects.filter(id__in=[o.id for o in orders]).update(status=new_status)
            channel_layer = get_channel_layer()
            if channel_layer is not None:
                async_to_sync(channel_layer.group_send)(
                    'dispatcher_tracking',
                    {
                        'type': 'ops_refresh',
                        'reason': action,
                        'updated_at': timezone.localtime(timezone.now()).isoformat(),
                    },
                )
            return _respond("success", f"{len(orders)} ta order statusi yangilandi.")
        else:
            return _respond("error", "Noto'g'ri bulk amal.")

    def live_data_api(self, request):
        active_ops_qs = Order.objects.filter(status__code__in=['in_progress', 'in_transit', 'approved_by_client'])
        pending_qs = Order.objects.filter(status__code='pending')
        stale_threshold = timezone.now() - timedelta(minutes=3)
        stale_location_count = active_ops_qs.filter(updated_at__lte=stale_threshold).count()
        delayed_pending_count = pending_qs.filter(created_at__lte=timezone.now() - timedelta(hours=2)).count()
        route_deviation_count = Order.objects.filter(
            route_deviation_last_distance_meters__isnull=False,
            route_deviation_last_alert_at__gte=timezone.now() - timedelta(days=1),
        ).count()
        data_quality = {
            "orders_without_driver": Order.objects.filter(driver__isnull=True).count(),
            "orders_without_location": active_ops_qs.filter(
                Q(current_location_lat__isnull=True) | Q(current_location_lng__isnull=True)
            ).count(),
            "completed_without_payment": Order.objects.filter(status__code='completed').exclude(
                payments__payment_status='completed'
            ).distinct().count(),
            "completed_without_rating": Order.objects.filter(status__code='completed').exclude(
                ratings__isnull=False
            ).distinct().count(),
        }
        quick_stats = {
            "pending_orders": Order.objects.filter(status__code='pending').count(),
            "active_orders": Order.objects.filter(status__code__in=['in_progress', 'in_transit']).count(),
            "problem_orders": Order.objects.filter(status__code__in=['rejected', 'stopped', 'cancelled']).count(),
        }
        live_incidents = []

        active_rows = []
        for order in self._get_filtered_active_orders(request):
            last_assignment = (
                order.dispatcher_assignments.select_related('dispatcher').order_by('-assigned_at').first()
            )
            latest_track = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp').first()
            last_update = latest_track.timestamp if latest_track else order.updated_at
            age_sec = max(0, int((timezone.now() - last_update).total_seconds())) if last_update else None
            if age_sec is not None and age_sec >= 300:
                live_incidents.append({
                    "level": "critical" if age_sec >= 900 else "warning",
                    "title": f"Order #{order.id}: stale location",
                    "message": f"Haydovchi lokatsiyasi {age_sec} soniyadan beri yangilanmagan.",
                    "order_id": order.id,
                })
            if order.route_deviation_last_distance_meters and order.route_deviation_last_distance_meters > order.route_deviation_threshold_meters:
                live_incidents.append({
                    "level": "critical",
                    "title": f"Order #{order.id}: route deviation",
                    "message": f"Marshrutdan chiqish {int(order.route_deviation_last_distance_meters)}m.",
                    "order_id": order.id,
                })
            active_rows.append({
                "id": order.id,
                "status_name": order.status.name_ru if hasattr(order.status, "name_ru") else order.status.code,
                "driver_name": f"{order.driver.first_name} {order.driver.last_name}".strip(),
                "client_name": f"{order.client.first_name} {order.client.last_name}".strip(),
                "dispatcher_name": (
                    f"{last_assignment.dispatcher.first_name} {last_assignment.dispatcher.last_name}".strip()
                    if last_assignment else "Tayinlanmagan"
                ),
                "lat": str(order.current_location_lat) if order.current_location_lat is not None else None,
                "lng": str(order.current_location_lng) if order.current_location_lng is not None else None,
                "admin_url": f"/admin/orders/order/{order.id}/change/",
            })

        return JsonResponse({
            "last_updated_at": timezone.localtime(timezone.now()).strftime('%d.%m.%Y %H:%M:%S'),
            "quick_stats": quick_stats,
            "sla_alerts": {
                "stale_location_count": stale_location_count,
                "delayed_pending_count": delayed_pending_count,
                "route_deviation_count": route_deviation_count,
                "total_alerts": stale_location_count + delayed_pending_count + route_deviation_count,
            },
            "data_quality": data_quality,
            "active_rows": active_rows,
            "live_incidents": live_incidents[:12],
        })

    def operations_view(self, request):
        today = timezone.now().date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)

        active_orders_qs = (
            Order.objects
            .filter(status__code__in=['in_progress', 'in_transit', 'approved_by_client', 'pending'])
            .select_related('driver', 'client', 'status', 'advertisement')
            .order_by('-updated_at')[:60]
        )

        active_rows = []
        for order in active_orders_qs:
            last_assignment = order.dispatcher_assignments.select_related('dispatcher', 'assigned_driver').order_by('-assigned_at').first()
            active_rows.append({
                "order": order,
                "driver": order.driver,
                "client": order.client,
                "status_code": order.status.code,
                "status_name": order.status.name_ru if hasattr(order.status, "name_ru") else order.status.code,
                "lat": order.current_location_lat,
                "lng": order.current_location_lng,
                "dispatcher": last_assignment.dispatcher if last_assignment else None,
                "assignment_status": last_assignment.status if last_assignment else None,
            })

        driver_stats = list(
            User.objects.filter(is_driver=True)
            .annotate(
                total_orders=Count('driver_orders', distinct=True),
                active_orders=Count('driver_orders', filter=Q(driver_orders__status__code__in=['in_progress', 'in_transit', 'approved_by_client']), distinct=True),
                completed_orders=Count('driver_orders', filter=Q(driver_orders__status__code='completed'), distinct=True),
                avg_rating=Avg('ratings_received__rating', filter=Q(ratings_received__to_user__is_driver=True)),
                rating_count=Count('ratings_received', filter=Q(ratings_received__to_user__is_driver=True), distinct=True),
            )
            .order_by('-active_orders', '-completed_orders')[:30]
        )

        client_stats = list(
            User.objects.filter(is_client=True)
            .annotate(
                total_orders=Count('client_orders', distinct=True),
                active_orders=Count('client_orders', filter=Q(client_orders__status__code__in=['pending', 'approved_by_client', 'in_progress', 'in_transit']), distinct=True),
                completed_orders=Count('client_orders', filter=Q(client_orders__status__code='completed'), distinct=True),
                avg_rating=Avg('ratings_received__rating', filter=Q(ratings_received__to_user__is_client=True)),
                rating_count=Count('ratings_received', filter=Q(ratings_received__to_user__is_client=True), distinct=True),
            )
            .order_by('-active_orders', '-total_orders')[:30]
        )

        dispatcher_stats = list(
            User.objects.filter(is_dispatcher=True)
            .annotate(
                assigned_count=Count('dispatcher_assignments', distinct=True),
                active_assignments=Count(
                    'dispatcher_assignments',
                    filter=Q(dispatcher_assignments__status__in=['assigned', 'reassigned']),
                    distinct=True,
                ),
                completed_assignments=Count(
                    'dispatcher_assignments',
                    filter=Q(dispatcher_assignments__status='completed'),
                    distinct=True,
                ),
            )
            .order_by('-active_assignments', '-assigned_count')[:20]
        )

        rating_overview = {
            "driver_avg": Rating.objects.filter(to_user__is_driver=True).aggregate(v=Avg('rating'))['v'] or 0,
            "driver_count": Rating.objects.filter(to_user__is_driver=True).count(),
            "client_avg": Rating.objects.filter(to_user__is_client=True).aggregate(v=Avg('rating'))['v'] or 0,
            "client_count": Rating.objects.filter(to_user__is_client=True).count(),
            "today_count": Rating.objects.filter(created_at__date=today).count(),
            "week_count": Rating.objects.filter(created_at__date__gte=week_ago).count(),
            "month_count": Rating.objects.filter(created_at__date__gte=month_ago).count(),
        }

        context = {
            **self.each_context(request),
            "title": "Operations Intelligence",
            "active_rows": active_rows,
            "driver_stats": driver_stats,
            "client_stats": client_stats,
            "dispatcher_stats": dispatcher_stats,
            "rating_overview": rating_overview,
            "last_updated_at": timezone.now(),
        }
        return render(request, 'admin/operations_intelligence.html', context)

    def statistics_view(self, request):
        today = timezone.now().date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        stats = {
            'total_users': User.objects.count(),
            'total_drivers': User.objects.filter(is_driver=True).count(),
            'total_clients': User.objects.filter(is_driver=False).count(),
            'verified_drivers': User.objects.filter(is_driver=True, is_verified=True).count(),
            'unverified_drivers': User.objects.filter(is_driver=True, is_verified=False).count(),
            'total_vehicles': Vehicle.objects.count(),
            'verified_vehicles': Vehicle.objects.filter(is_verified=True).count(),
            'unverified_vehicles': Vehicle.objects.filter(is_verified=False).count(),
            'total_advertisements': Advertisement.objects.count(),
            'active_advertisements': Advertisement.objects.filter(is_closed=False).count(),
            'closed_advertisements': Advertisement.objects.filter(is_closed=True).count(),
            'total_orders': Order.objects.count(),
            'total_bids': Bid.objects.count(),
            'total_payments': Payment.objects.count(),
            'total_payment_amount': Payment.objects.filter(payment_status='completed').aggregate(Sum('amount'))['amount__sum'] or 0,
            'total_news': News.objects.count(),
            
            'users_today': User.objects.filter(created_at__date=today).count(),
            'users_week': User.objects.filter(created_at__date__gte=week_ago).count(),
            'users_month': User.objects.filter(created_at__date__gte=month_ago).count(),
            
            'advertisements_today': Advertisement.objects.filter(created_at__date=today).count(),
            'advertisements_week': Advertisement.objects.filter(created_at__date__gte=week_ago).count(),
            'advertisements_month': Advertisement.objects.filter(created_at__date__gte=month_ago).count(),
            
            'orders_today': Order.objects.filter(created_at__date=today).count(),
            'orders_week': Order.objects.filter(created_at__date__gte=week_ago).count(),
            'orders_month': Order.objects.filter(created_at__date__gte=month_ago).count(),
            
            'payments_today': Payment.objects.filter(created_at__date=today).count(),
            'payments_week': Payment.objects.filter(created_at__date__gte=week_ago).count(),
            'payments_month': Payment.objects.filter(created_at__date__gte=month_ago).count(),
            
            'payment_amount_today': Payment.objects.filter(created_at__date=today, payment_status='completed').aggregate(Sum('amount'))['amount__sum'] or 0,
            'payment_amount_week': Payment.objects.filter(created_at__date__gte=week_ago, payment_status='completed').aggregate(Sum('amount'))['amount__sum'] or 0,
            'payment_amount_month': Payment.objects.filter(created_at__date__gte=month_ago, payment_status='completed').aggregate(Sum('amount'))['amount__sum'] or 0,
        }
        
        users_by_date = User.objects.filter(
            created_at__date__gte=month_ago
        ).extra(
            select={'day': 'date(created_at)'}
        ).values('day').annotate(count=Count('id')).order_by('day')
        
        orders_by_date = Order.objects.filter(
            created_at__date__gte=month_ago
        ).extra(
            select={'day': 'date(created_at)'}
        ).values('day').annotate(count=Count('id')).order_by('day')
        
        payments_by_date = Payment.objects.filter(
            created_at__date__gte=month_ago,
            payment_status='completed'
        ).extra(
            select={'day': 'date(created_at)'}
        ).values('day').annotate(
            count=Count('id'),
            total=Sum('amount')
        ).order_by('day')
        
        context = {
            **self.each_context(request),
            'stats': stats,
            'users_by_date': list(users_by_date),
            'orders_by_date': list(orders_by_date),
            'payments_by_date': list(payments_by_date),
            'title': 'Statistikalar',
        }
        return render(request, 'admin/statistics.html', context)

    def driver_verification_view(self, request):
        from apps.users.verification import (
            VERIFICATION_APPROVED,
            VERIFICATION_PENDING,
            VERIFICATION_REJECTED,
            notify_driver_verification_decision,
        )

        if request.method == 'POST' and 'driver_id' in request.POST:
            try:
                driver_id = request.POST.get('driver_id')
                action = request.POST.get('action', 'approve')
                driver = User.objects.get(id=driver_id, is_driver=True)
                if action == 'reject':
                    driver.verification_status = VERIFICATION_REJECTED
                    driver.is_verified = False
                    notify_driver_verification_decision(driver, approved=False)
                    messages.success(request, f'Haydovchi {driver.first_name} {driver.last_name} rad etildi.')
                else:
                    driver.verification_status = VERIFICATION_APPROVED
                    driver.is_verified = True
                    notify_driver_verification_decision(driver, approved=True)
                    messages.success(request, f'Haydovchi {driver.first_name} {driver.last_name} tasdiqlandi.')
                driver.save(update_fields=['verification_status', 'is_verified', 'updated_at'])
                return redirect('admin:admin_driver_verification')
            except User.DoesNotExist:
                messages.error(request, 'Haydovchi topilmadi.')
            except Exception as e:
                messages.error(request, f'Xatolik: {str(e)}')
        
        pending_drivers = User.objects.filter(
            is_driver=True,
            verification_status=VERIFICATION_PENDING,
        ).prefetch_related('vehicles').order_by('-updated_at')
        
        from django.conf import settings
        
        drivers_with_documents = []
        for driver in pending_drivers:
            has_documents = bool(driver.document_photos and len(driver.document_photos) > 0)
            has_vehicles = driver.vehicles.exists()
            verified_vehicles = driver.vehicles.filter(is_verified=True)
            has_verified_vehicles = verified_vehicles.exists()
            
            document_urls = []
            if driver.document_photos:
                for photo in driver.document_photos:
                    if photo:
                        if isinstance(photo, str):
                            if photo.startswith('http://') or photo.startswith('https://'):
                                document_urls.append(photo)
                            elif photo.startswith('/'):
                                document_urls.append(f"{request.scheme}://{request.get_host()}{settings.MEDIA_URL}{photo.lstrip('/')}")
                            else:
                                document_urls.append(f"{request.scheme}://{request.get_host()}{settings.MEDIA_URL}{photo}")
                        else:
                            document_urls.append(str(photo))
            
            drivers_with_documents.append({
                'driver': driver,
                'has_documents': has_documents,
                'has_vehicles': has_vehicles,
                'has_verified_vehicles': has_verified_vehicles,
                'document_count': len(driver.document_photos) if driver.document_photos else 0,
                'vehicle_count': driver.vehicles.count(),
                'verified_vehicle_count': verified_vehicles.count(),
                'document_urls': document_urls,
            })
        
        context = {
            **self.each_context(request),
            'drivers': drivers_with_documents,
            'title': 'Haydovchilar hujjatlarini tasdiqlash',
        }
        return render(request, 'admin/driver_verification.html', context)

    def vehicle_verification_view(self, request):
        from apps.users.verification import (
            VERIFICATION_APPROVED,
            VERIFICATION_PENDING,
            VERIFICATION_REJECTED,
            notify_vehicle_verification_decision,
        )

        if request.method == 'POST' and 'vehicle_id' in request.POST:
            try:
                vehicle_id = request.POST.get('vehicle_id')
                action = request.POST.get('action', 'approve')
                vehicle = Vehicle.objects.select_related('user').get(id=vehicle_id)
                if action == 'reject':
                    vehicle.verification_status = VERIFICATION_REJECTED
                    vehicle.is_verified = False
                    notify_vehicle_verification_decision(vehicle, approved=False)
                    messages.success(request, f'Transport {vehicle.number} rad etildi.')
                else:
                    vehicle.verification_status = VERIFICATION_APPROVED
                    vehicle.is_verified = True
                    notify_vehicle_verification_decision(vehicle, approved=True)
                    messages.success(request, f'Transport {vehicle.number} tasdiqlandi.')
                vehicle.save(update_fields=['verification_status', 'is_verified', 'updated_at'])
                return redirect('admin:admin_vehicle_verification')
            except Vehicle.DoesNotExist:
                messages.error(request, 'Transport topilmadi.')
            except Exception as e:
                messages.error(request, f'Xatolik: {str(e)}')

        pending_vehicles = (
            Vehicle.objects.filter(verification_status=VERIFICATION_PENDING)
            .select_related('user')
            .order_by('-updated_at')
        )
        from django.conf import settings

        vehicles_data = []
        for vehicle in pending_vehicles:
            document_urls = []
            if vehicle.document_photos:
                for photo in vehicle.document_photos:
                    if not photo:
                        continue
                    if isinstance(photo, str):
                        if photo.startswith('http://') or photo.startswith('https://'):
                            document_urls.append(photo)
                        elif photo.startswith('/'):
                            document_urls.append(
                                f"{request.scheme}://{request.get_host()}{settings.MEDIA_URL}{photo.lstrip('/')}"
                            )
                        else:
                            document_urls.append(
                                f"{request.scheme}://{request.get_host()}{settings.MEDIA_URL}{photo}"
                            )
                    else:
                        document_urls.append(str(photo))

            vehicles_data.append({
                'vehicle': vehicle,
                'driver': vehicle.user,
                'document_count': len(vehicle.document_photos or []),
                'document_urls': document_urls,
                'has_documents': bool(document_urls),
            })

        context = {
            **self.each_context(request),
            'vehicles': vehicles_data,
            'title': 'Transport vositalarini tasdiqlash',
        }
        return render(request, 'admin/vehicle_verification.html', context)


admin_site = CustomAdminSite(name='admin')
