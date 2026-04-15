from django.urls import path
from .views import (
    ChatListView,
    ChatDetailView,
    ChatCreateView,
    MessageCreateView,
    MessageMarkReadView,
    MessageUpdateView,
    MessageDeleteView,
    MessageReactionView,
    MessageSearchView,
)
from .media_views import (
    MessageImageUploadView,
    MessageFileUploadView,
    MessageVoiceUploadView,
)

app_name = 'chats'

urlpatterns = [
    path('', ChatListView.as_view(), name='chat-list'),
    path('create/', ChatCreateView.as_view(), name='chat-create'),
    path('<int:pk>/', ChatDetailView.as_view(), name='chat-detail'),
    path('<int:chat_id>/messages/', MessageCreateView.as_view(), name='message-create'),
    path('<int:chat_id>/mark-read/', MessageMarkReadView.as_view(), name='message-mark-read'),
    path('<int:chat_id>/search/', MessageSearchView.as_view(), name='message-search'),
    path('messages/<int:message_id>/', MessageUpdateView.as_view(), name='message-update'),
    path('messages/<int:message_id>/delete/', MessageDeleteView.as_view(), name='message-delete'),
    path('messages/<int:message_id>/reaction/', MessageReactionView.as_view(), name='message-reaction'),
    path('messages/upload-image/', MessageImageUploadView.as_view(), name='message-upload-image'),
    path('messages/upload-file/', MessageFileUploadView.as_view(), name='message-upload-file'),
    path('messages/upload-voice/', MessageVoiceUploadView.as_view(), name='message-upload-voice'),
]
