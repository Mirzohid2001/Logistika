import uuid
from decimal import Decimal, InvalidOperation
from django.db import models
from apps.users.models import User
from apps.advertisements.models import Advertisement


class OrderStatus(models.Model):
    name_ru = models.CharField(max_length=50)
    name_en = models.CharField(max_length=50)
    name_uz = models.CharField(max_length=50)
    code = models.CharField(max_length=20, unique=True)

    class Meta:
        db_table = 'order_statuses'
        verbose_name = 'Order Status'
        verbose_name_plural = 'Order Statuses'

    def __str__(self):
        return self.name_ru


class Order(models.Model):
    advertisement = models.ForeignKey(Advertisement, on_delete=models.CASCADE, related_name='orders')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='driver_orders')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='client_orders')
    status = models.ForeignKey(OrderStatus, on_delete=models.PROTECT, related_name='orders')
    agreed_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Buyurtma yaratilganda kelishilgan narx',
    )
    source_bid = models.ForeignKey(
        'bids.Bid',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        help_text='Buyurtmaga asos bo‘lgan qabul qilingan taklif',
    )
    current_location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_location_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    # Live motion for Yandex-style client prediction (m/s, degrees clockwise from north).
    current_speed_mps = models.FloatField(null=True, blank=True)
    current_heading = models.FloatField(null=True, blank=True)
    planned_route_points = models.JSONField(default=list, blank=True)
    route_deviation_threshold_meters = models.PositiveIntegerField(default=500)
    route_deviation_last_alert_at = models.DateTimeField(null=True, blank=True)
    route_deviation_last_distance_meters = models.FloatField(null=True, blank=True)
    route_deviation_count = models.PositiveIntegerField(default=0)
    pickup_geofence_radius_meters = models.PositiveIntegerField(default=300)
    destination_geofence_radius_meters = models.PositiveIntegerField(default=300)
    is_in_pickup_geofence = models.BooleanField(default=False)
    is_in_destination_geofence = models.BooleanField(default=False)
    pickup_entered_at = models.DateTimeField(null=True, blank=True)
    pickup_exited_at = models.DateTimeField(null=True, blank=True)
    destination_entered_at = models.DateTimeField(null=True, blank=True)
    eta_share_enabled = models.BooleanField(default=False)
    eta_share_expires_at = models.DateTimeField(null=True, blank=True)
    driver_last_seen_at = models.DateTimeField(null=True, blank=True)
    driver_app_state = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    in_transit_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    # Offline payment: client confirms after agreeing with driver in chat (not via platform).
    client_paid_reported = models.BooleanField(null=True, blank=True)
    client_paid_reported_at = models.DateTimeField(null=True, blank=True)
    client_payment_confirmed = models.BooleanField(null=True, blank=True)
    client_payment_confirmed_at = models.DateTimeField(null=True, blank=True)
    client_delivery_confirmed = models.BooleanField(null=True, blank=True)
    client_delivery_confirmed_at = models.DateTimeField(null=True, blank=True)
    optimized_route_polyline = models.JSONField(default=list, blank=True)
    optimized_route_distance_meters = models.PositiveIntegerField(null=True, blank=True)
    optimized_route_duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    route_optimization_provider = models.CharField(max_length=20, blank=True, default='')
    tracked_distance_meters = models.PositiveIntegerField(null=True, blank=True)
    loaded_distance_meters = models.PositiveIntegerField(null=True, blank=True)
    tracked_distance_computed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'orders'
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client', 'created_at']),
            models.Index(fields=['driver', 'created_at']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['advertisement']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Order {self.id} - {self.advertisement.title_ru}"
    
    @property
    def total_amount(self):
        if self.agreed_amount is not None:
            return self.agreed_amount

        if self.source_bid_id:
            bid = self.source_bid
            if bid is None:
                bid = self.__class__.objects.select_related('source_bid').get(pk=self.pk).source_bid
            if bid:
                current_amount = bid.get_current_amount()
                if current_amount is not None:
                    try:
                        return Decimal(str(current_amount))
                    except (InvalidOperation, TypeError, ValueError):
                        pass

        from apps.bids.models import Bid

        accepted_bid = (
            Bid.objects.filter(
                advertisement=self.advertisement,
                client=self.client,
                driver=self.driver,
                is_accepted_by_client=True,
                updated_at__lte=self.created_at,
            )
            .order_by('-updated_at')
            .first()
        )
        if accepted_bid:
            current_amount = accepted_bid.get_current_amount()
            if current_amount is not None:
                try:
                    return Decimal(str(current_amount))
                except (InvalidOperation, TypeError, ValueError):
                    pass

        if self.advertisement.proposed_cost:
            return self.advertisement.proposed_cost
        return Decimal('0')
    
    @property
    def paid_amount(self):
        from django.db.models import F, Sum, Value
        from django.db.models.functions import Coalesce
        from apps.payments.models import Payment

        total = Payment.objects.filter(
            order=self,
            payment_status='completed',
        ).aggregate(
            total=Sum(
                Coalesce(F('amount'), Value(Decimal('0')))
                - Coalesce(F('refund_amount'), Value(Decimal('0')))
            )
        )['total'] or Decimal('0')
        return total
    
    @property
    def is_payment_settled(self):
        """Haydovchi tasdiqlagan yoki escrow to'ldirilgan buyurtma to'langan hisoblanadi."""
        amount = self.agreed_amount if self.agreed_amount is not None else self.total_amount
        if amount is None or amount <= 0:
            return False
        if self.client_payment_confirmed is True:
            return True
        from django.core.exceptions import ObjectDoesNotExist
        try:
            escrow = self.escrow
        except ObjectDoesNotExist:
            return False
        if escrow.status in ('funded', 'held', 'released') and escrow.funded_amount >= amount:
            return True
        return False

    @property
    def payment_disputed(self):
        if self.client_paid_reported is not True:
            return False
        return self.client_payment_confirmed is not True

    @property
    def remaining_amount(self):
        if self.is_payment_settled:
            return Decimal('0')
        return max(Decimal('0'), self.total_amount - self.paid_amount)

    @property
    def is_fully_paid(self):
        return self.is_payment_settled

    @property
    def payment_progress(self):
        if self.total_amount <= 0:
            return 100
        if self.is_payment_settled:
            return 100
        return min(100, float(self.paid_amount / self.total_amount) * 100)


class OrderLocationTrack(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='location_tracks')
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_location_tracks'
        verbose_name = 'Order Location Track'
        verbose_name_plural = 'Order Location Tracks'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['order', 'timestamp']),
            models.Index(fields=['timestamp']),
        ]

    def __str__(self):
        return f"Track for Order {self.order.id} at {self.timestamp}"


class OrderRouteStop(models.Model):
    STOP_PICKUP = 'pickup'
    STOP_DELIVERY = 'delivery'
    STOP_TYPE_CHOICES = [
        (STOP_PICKUP, 'Pickup'),
        (STOP_DELIVERY, 'Delivery'),
    ]
    STATUS_PENDING = 'pending'
    STATUS_ARRIVED = 'arrived'
    STATUS_COMPLETED = 'completed'
    STATUS_SKIPPED = 'skipped'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_ARRIVED, 'Arrived'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_SKIPPED, 'Skipped'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='route_stops')
    sequence = models.PositiveIntegerField()
    stop_type = models.CharField(max_length=20, choices=STOP_TYPE_CHOICES, default=STOP_PICKUP)
    label = models.CharField(max_length=255, blank=True, default='')
    address = models.CharField(max_length=500, blank=True, default='')
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    geofence_radius_meters = models.PositiveIntegerField(default=300)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    arrived_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_route_stops'
        ordering = ['sequence']
        unique_together = [('order', 'sequence')]
        indexes = [
            models.Index(fields=['order', 'status']),
        ]

    def __str__(self):
        return f"Order {self.order_id} stop #{self.sequence} ({self.stop_type})"


class OrderProofOfDelivery(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='proof_of_delivery')
    delivered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='delivered_orders_pod')
    receiver_name = models.CharField(max_length=255)
    receiver_signature = models.TextField(blank=True, default='')
    delivery_photo = models.ImageField(upload_to='orders/pod/', null=True, blank=True)
    delivered_lat = models.DecimalField(max_digits=9, decimal_places=6)
    delivered_lng = models.DecimalField(max_digits=9, decimal_places=6)
    delivered_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_proof_of_delivery'
        verbose_name = 'Order Proof Of Delivery'
        verbose_name_plural = 'Order Proof Of Deliveries'
        ordering = ['-delivered_at']

    def __str__(self):
        return f"POD for order {self.order_id}"


class OrderReturnQuality(models.Model):
    QUALITY_OK = 'ok'
    QUALITY_OPENED = 'opened'
    QUALITY_DAMAGED = 'damaged'
    QUALITY_CHOICES = [
        (QUALITY_OK, 'OK'),
        (QUALITY_OPENED, 'Opened'),
        (QUALITY_DAMAGED, 'Damaged'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='return_quality')
    classified_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='classified_returns')
    quality_status = models.CharField(max_length=20, choices=QUALITY_CHOICES)
    photo = models.ImageField(upload_to='orders/returns/', null=True, blank=True)
    note = models.TextField(blank=True, default='')
    classified_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_return_quality'
        verbose_name = 'Order Return Quality'
        verbose_name_plural = 'Order Return Qualities'
        ordering = ['-classified_at']

    def __str__(self):
        return f"Return quality for order {self.order_id}: {self.quality_status}"


class OrderTrackingShareLink(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='tracking_share')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='created_tracking_links')
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_tracking_share_links'
        verbose_name = 'Order Tracking Share Link'
        verbose_name_plural = 'Order Tracking Share Links'
        ordering = ['-created_at']

    def __str__(self):
        return f"Share link for order {self.order_id}"


class OrderCustodyEvent(models.Model):
    EVENT_PICKUP = 'pickup_handed'
    EVENT_STOP = 'stop_handed'
    EVENT_DELIVERY = 'delivery_handed'
    EVENT_SEAL = 'seal_verified'
    EVENT_TEMPERATURE = 'temperature_check'
    EVENT_CHOICES = [
        (EVENT_PICKUP, 'Pickup handed'),
        (EVENT_STOP, 'Stop handed'),
        (EVENT_DELIVERY, 'Delivery handed'),
        (EVENT_SEAL, 'Seal verified'),
        (EVENT_TEMPERATURE, 'Temperature check'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='custody_events')
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name='custody_events')
    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    witness_name = models.CharField(max_length=255, blank=True, default='')
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    photo = models.ImageField(upload_to='orders/custody/', null=True, blank=True)
    qr_token = models.CharField(max_length=64, blank=True, default='')
    note = models.TextField(blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_custody_events'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['order', 'created_at']),
            models.Index(fields=['event_type', 'created_at']),
        ]

    def __str__(self):
        return f"Custody {self.event_type} order={self.order_id}"


class OrderSOSAlert(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_RESOLVED = 'resolved'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged'),
        (STATUS_RESOLVED, 'Resolved'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='sos_alerts')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sos_alerts')
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    message = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acknowledged_sos_alerts',
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_sos_alerts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['order', 'status']),
        ]

    def __str__(self):
        return f"SOS order={self.order_id} status={self.status}"


def order_document_upload_to(instance, filename):
    return f'orders/documents/{instance.order_id}/{filename}'


class OrderDocument(models.Model):
    TYPE_INVOICE = 'invoice'
    TYPE_TTN = 'ttn'
    TYPE_CMR = 'cmr'
    TYPE_ACT = 'act'
    TYPE_CHOICES = [
        (TYPE_INVOICE, 'Hisob-faktura'),
        (TYPE_TTN, 'TTN / yuk xati'),
        (TYPE_CMR, 'CMR'),
        (TYPE_ACT, 'Bajarilgan ishlar dalolatnomasi'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='documents')
    doc_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    number = models.CharField(max_length=40)
    snapshot = models.JSONField(default=dict, blank=True)
    html_file = models.FileField(upload_to=order_document_upload_to, blank=True)
    pdf_file = models.FileField(upload_to=order_document_upload_to, blank=True)
    xlsx_file = models.FileField(upload_to=order_document_upload_to, blank=True)
    download_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    generated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_documents'
        unique_together = [('order', 'doc_type')]
        ordering = ['doc_type']
        indexes = [
            models.Index(fields=['order', 'doc_type']),
            models.Index(fields=['download_token']),
        ]

    def __str__(self):
        return f"{self.number} ({self.doc_type}) order={self.order_id}"
