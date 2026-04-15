from django.db import models
from apps.users.models import User
from apps.orders.models import Order


class Chat(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='chats')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='client_chats')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='driver_chats')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chats'
        verbose_name = 'Chat'
        verbose_name_plural = 'Chats'
        unique_together = ['order', 'client', 'driver']
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['client', 'updated_at']),
            models.Index(fields=['driver', 'updated_at']),
            models.Index(fields=['order']),
            models.Index(fields=['updated_at']),
        ]

    def __str__(self):
        return f"Chat for Order {self.order.id}"


class Message(models.Model):
    MESSAGE_TYPE_TEXT = 'text'
    MESSAGE_TYPE_IMAGE = 'image'
    MESSAGE_TYPE_FILE = 'file'
    MESSAGE_TYPE_VOICE = 'voice'
    MESSAGE_TYPE_LOCATION = 'location'
    MESSAGE_TYPE_CONTACT = 'contact'
    
    MESSAGE_TYPES = [
        (MESSAGE_TYPE_TEXT, 'Text'),
        (MESSAGE_TYPE_IMAGE, 'Image'),
        (MESSAGE_TYPE_FILE, 'File'),
        (MESSAGE_TYPE_VOICE, 'Voice'),
        (MESSAGE_TYPE_LOCATION, 'Location'),
        (MESSAGE_TYPE_CONTACT, 'Contact'),
    ]
    
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    text = models.TextField(blank=True, null=True)
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default=MESSAGE_TYPE_TEXT)
    is_read = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    reply_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    image = models.ImageField(upload_to='chat/images/', null=True, blank=True)
    file = models.FileField(upload_to='chat/files/', null=True, blank=True)
    voice = models.FileField(upload_to='chat/voice/', null=True, blank=True)
    file_name = models.CharField(max_length=255, null=True, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    
    location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_address = models.CharField(max_length=500, null=True, blank=True)
    
    contact_name = models.CharField(max_length=255, null=True, blank=True)
    contact_phone = models.CharField(max_length=20, null=True, blank=True)
    
    reactions = models.JSONField(default=dict, blank=True, null=True)

    class Meta:
        db_table = 'messages'
        verbose_name = 'Message'
        verbose_name_plural = 'Messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['chat', 'created_at']),
            models.Index(fields=['sender', 'created_at']),
            models.Index(fields=['is_read']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Message from {self.sender.phone} in Chat {self.chat.id}"
