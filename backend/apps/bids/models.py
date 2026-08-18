from django.db import models
from apps.users.models import User
from apps.advertisements.models import Advertisement


class Bid(models.Model):
    COUNTER_BY_CHOICES = [
        ('driver', 'Driver'),
        ('client', 'Client'),
    ]

    advertisement = models.ForeignKey(Advertisement, on_delete=models.CASCADE, related_name='bids')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='client_bids')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='driver_bids')
    is_driver_agreed_to_amount = models.BooleanField(default=False)
    proposed_amounts = models.JSONField(default=list, blank=True)
    is_rejected_by_client = models.BooleanField(default=False)
    is_accepted_by_client = models.BooleanField(default=False)
    is_rejected_by_driver = models.BooleanField(default=False)
    last_counter_by = models.CharField(max_length=10, choices=COUNTER_BY_CHOICES, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bids'
        verbose_name = 'Bid'
        verbose_name_plural = 'Bids'
        ordering = ['-created_at']

    def __str__(self):
        return f"Bid for {self.advertisement.title_ru} by {self.driver.phone}"

    def can_counter_offer_by_driver(self):
        if self.is_rejected_by_client or self.is_rejected_by_driver or self.is_accepted_by_client:
            return False
        if self.last_counter_by is None:
            return True
        return self.last_counter_by == 'client'

    def can_counter_offer_by_client(self):
        if self.is_rejected_by_client or self.is_rejected_by_driver or self.is_accepted_by_client:
            return False
        if self.last_counter_by is None:
            return True
        return self.last_counter_by == 'driver'

    def can_agree_to_counter_by_driver(self):
        if self.is_rejected_by_client or self.is_rejected_by_driver or self.is_accepted_by_client:
            return False
        return self.last_counter_by == 'client' and not self.is_driver_agreed_to_amount

    def get_last_amount_by(self, party: str):
        for proposal in reversed(self.proposed_amounts):
            if isinstance(proposal, dict) and proposal.get('by') == party:
                return proposal.get('amount')
        return None

    @staticmethod
    def amounts_equal(left, right) -> bool:
        if left is None or right is None:
            return False
        try:
            from decimal import Decimal

            normalize = lambda value: Decimal(str(value).strip().replace(' ', '').replace(',', ''))
            return normalize(left) == normalize(right)
        except Exception:
            return str(left).strip() == str(right).strip()

    def get_current_amount(self):
        if not self.proposed_amounts:
            return None
        last_proposal = self.proposed_amounts[-1]
        raw = last_proposal.get('amount') if isinstance(last_proposal, dict) else last_proposal
        if raw is None:
            return None
        if isinstance(raw, (int, float)):
            return raw
        s = str(raw).strip().replace(' ', '').replace(',', '').replace("'", '')
        if not s:
            return None
        try:
            from decimal import Decimal

            return str(Decimal(s))
        except Exception:
            return raw
