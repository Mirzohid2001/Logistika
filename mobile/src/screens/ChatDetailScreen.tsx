import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, launchCamera, ImagePickerResponse } from 'react-native-image-picker';
import Geolocation from 'react-native-geolocation-service';
import { chatService } from '../services/chatService';

let DocumentPicker: any = null;
try {
  DocumentPicker = require('react-native-document-picker');
} catch (error) {
  console.warn('react-native-document-picker not available');
}
import { websocketService } from '../services/websocketService';
import { Chat, Message } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { getMediaUrl } from '../services/api';
import { ScreenBackground } from '../components/ScreenBackground';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import { useThemedStyles, type AppColors } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { toastService } from '../services/toastService';
import { navigateRoot, navigateRoleStack } from '../utils/navigationHelpers';
import { VoiceMessageBubble } from '../components/VoiceMessageBubble';
import {
  resetVoiceRecorder,
  startVoiceRecording,
  stopVoiceRecording,
  cancelVoiceRecording,
  setVoiceRecordingMaxListener,
  MAX_VOICE_RECORDING_SECONDS,
} from '../services/voiceRecorderService';

const ChatDetailScreen = () => {
  const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = route.params as { id: number };

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showReactions, setShowReactions] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPickingFileRef = useRef<boolean>(false);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingPathRef = useRef<string | null>(null);
  const recordingSecondsRef = useRef(0);

  useEffect(() => {
    loadChat();
    websocketService.connect(id);

    const unsubscribeNewMessage = websocketService.on('new_message', (data: any) => {
      if (data.message) {
        setMessages((prev) => {
          // Duplicate'ni tekshirish - agar xabar allaqachon bor bo'lsa, qo'shmaslik
          const exists = prev.find((m) => m.id === data.message.id);
          if (exists) {
            console.log('Duplicate message detected, ignoring:', data.message.id);
            return prev;
          }
          return [...prev, data.message];
        });
        scrollToEnd();
        websocketService.sendReadReceipt(data.message.id);
      }
    });

    const unsubscribeTyping = websocketService.on('typing', (data: any) => {
      if (data.user_id !== user?.id) {
        setOtherUserTyping(data.is_typing);
        if (data.is_typing) {
          setTimeout(() => setOtherUserTyping(false), 3000);
        }
      }
    });

    const unsubscribeUserStatus = websocketService.on('user_status', (data: any) => {
      if (data.user_id !== user?.id) {
        setOtherUserOnline(data.status === 'online');
      }
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeTyping();
      unsubscribeUserStatus();
      websocketService.disconnect();
      resetVoiceRecorder();
      setVoiceRecordingMaxListener(null);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  const handleGoBack = useCallback(() => {
    websocketService.disconnect();
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigateRoot(navigation as any, 'ChatList');
  }, [navigation]);

  const openLinkedOrder = useCallback(() => {
    if (!chat) {return;}
    const orderId = chat.order.id;
    if (user?.is_dispatcher || user?.is_updater) {
      navigateRoleStack(navigation as any, 'DispatcherStack', 'DispatcherOrderDetail', { id: orderId });
      return;
    }
    if (user?.is_driver) {
      navigateRoleStack(navigation as any, 'DriverStack', 'OrderDetail', { id: orderId });
      return;
    }
    navigateRoleStack(navigation as any, 'ClientStack', 'ClientOrderDetail', { id: orderId });
  }, [chat, navigation, user]);

  const handleCallUser = useCallback((phone?: string) => {
    if (!phone) {return;}
    const normalized = phone.startsWith('+') ? phone : `+${phone}`;
    Linking.openURL(`tel:${normalized}`).catch(() => {
      toastService.error(t('common.error'));
    });
  }, [t]);

  const handleSearchMessages = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const results = await chatService.searchMessages(id, query);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch {
      toastService.error(t('chat.loadError'));
    } finally {
      setSearching(false);
    }
  }, [id, searchQuery, t]);

  const loadChat = async () => {
    try {
      const data = await chatService.getChat(id);
      setChat(data);
      if (data.messages) {
        setMessages(data.messages.filter((m: Message) => !m.is_deleted));
        scrollToEnd();
      }
      await chatService.markAsRead(id);
    } catch (error) {
      console.error('Error loading chat:', error);
      setChat(null);
      toastService.error(t('chat.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const scrollToEnd = () => {
    setTimeout(() => {
      if (flatListRef.current && messages.length > 0) {
        try {
          flatListRef.current.scrollToEnd({ animated: true });
        } catch (e) {
          // Ignore scroll errors
        }
      }
    }, 100);
  };

  const handleTyping = useCallback((text: string) => {
    setMessageText(text);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      websocketService.sendTyping(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      websocketService.sendTyping(false);
    }, 1000);
  }, [isTyping]);

  const handleSend = async () => {
    if (editingMessage) {
      await handleUpdateMessage();
      return;
    }

    if (!messageText.trim() || sending) {return;}

    const text = messageText.trim();
    const replyToId = replyingTo?.id; // Reply ID ni saqlash
    setMessageText('');
    setIsTyping(false);
    websocketService.sendTyping(false);
    setSending(true);

    try {
      // Xabarni yuborish, lekin local state'ga qo'shmaslik
      // WebSocket orqali keladi va u yerda qo'shiladi
      await chatService.sendMessage(id, {
        text,
        reply_to: replyToId,
      });
      // Muvaffaqiyatli yuborilgandan keyin reply mode'dan chiqish
      setReplyingTo(null);
      // WebSocket orqali xabar keladi, shuning uchun bu yerda qo'shmaslik
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageText(text);
      toastService.error(t('chat.sendError'));
    } finally {
      setSending(false);
    }
  };

  const handleUpdateMessage = async () => {
    if (!editingMessage || !messageText.trim()) {return;}

    try {
      const updated = await chatService.updateMessage(editingMessage.id, messageText.trim());
      setMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      setEditingMessage(null);
      setMessageText('');
    } catch (error) {
      console.error('Error updating message:', error);
      toastService.error(t('chat.updateError'));
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    Alert.alert(
      t('chat.deleteTitle'),
      t('chat.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteMessage(messageId);
              setMessages((prev) => prev.filter((m) => m.id !== messageId));
              toastService.success(t('chat.deletedSuccess'));
            } catch (error) {
              console.error('Error deleting message:', error);
              toastService.error(t('chat.deleteError'));
            }
          },
        },
      ]
    );
  };

  const handleReaction = async (messageId: number, reaction: string) => {
    try {
      const updated = await chatService.addReaction(messageId, reaction);
      setMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      setShowReactions(null);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const handlePickImage = () => {
    setShowMediaPicker(false);
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
      },
      async (response: ImagePickerResponse) => {
        if (response.assets && response.assets[0] && response.assets[0].uri) {
          const asset = response.assets[0];
          if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
            Alert.alert(t('common.error'), t('chatUpload.imageTooLarge'));
            return;
          }
          await handleUploadImage(asset.uri);
        }
      }
    );
  };

  const handleTakePhoto = () => {
    setShowMediaPicker(false);
    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
      },
      async (response: ImagePickerResponse) => {
        if (response.assets && response.assets[0] && response.assets[0].uri) {
          const asset = response.assets[0];
          if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
            Alert.alert(t('common.error'), t('chatUpload.imageTooLarge'));
            return;
          }
          await handleUploadImage(asset.uri);
        }
      }
    );
  };

  const handleUploadImage = async (imageUri: string) => {
    setUploading(true);
    try {
      // Rasmni yuborish, lekin local state'ga qo'shmaslik
      // WebSocket orqali keladi va u yerda qo'shiladi
      await chatService.uploadImage(id, imageUri);
      // WebSocket orqali xabar keladi, shuning uchun bu yerda qo'shmaslik
    } catch (error) {
      console.error('Error uploading image:', error);
      toastService.error(t('chat.imageUploadError'));
    } finally {
      setUploading(false);
    }
  };

  const handlePickFile = async () => {
    // Agar fayl tanlash jarayonda bo'lsa, yangi chaqiruvni bloklash
    if (isPickingFileRef.current) {
      console.warn('File picker is already in progress, ignoring duplicate call');
      return;
    }

    setShowMediaPicker(false);
    if (!DocumentPicker) {
      toastService.error(t('chat.filePickerUnavailable'));
      return;
    }

    isPickingFileRef.current = true;

    try {
      const pickerOptions: any = {
        type: [DocumentPicker.types.allFiles],
      };

      // Android uchun copyTo qo'shamiz
      if (Platform.OS === 'android') {
        pickerOptions.copyTo = 'cachesDirectory';
      }

      const res = await DocumentPicker.pick(pickerOptions);

      if (res && res.length > 0) {
        const file = res[0];

        // File URI ni to'g'rilash
        let fileUri = file.uri;
        if (Platform.OS === 'ios' && fileUri && !fileUri.startsWith('file://')) {
          fileUri = `file://${fileUri}`;
        }

        // File type va name ni to'g'rilash
        const fileName = file.name || file.fileName || 'file';
        const fileType = file.type || file.mimeType || 'application/octet-stream';
        const fileSize = Number(file.size || 0);

        if (fileSize > MAX_FILE_SIZE_BYTES) {
          toastService.error(t('chat.fileMaxSize'));
          return;
        }

        console.log('Picked file:', { uri: fileUri, name: fileName, type: fileType, size: file.size });

        await handleUploadFile(fileUri, fileName, fileType);
      }
    } catch (err: any) {
      if (DocumentPicker.isCancel && DocumentPicker.isCancel(err)) {
        // Foydalanuvchi bekor qildi, bu xato emas
        toastService.info(t('chat.filePickCancelled'));
        return;
      }
      console.error('Error picking file:', err);
      toastService.error(`${t('chat.filePickError')}: ${err.message || t('errors.unknownError')}`);
    } finally {
      // Har doim flag'ni reset qilish
      isPickingFileRef.current = false;
    }
  };

  const handleUploadFile = async (fileUri: string, fileName: string, fileType: string) => {
    setUploading(true);
    try {
      console.log('Uploading file:', { chatId: id, uri: fileUri, name: fileName, type: fileType });

      // File URI ni to'g'rilash
      let finalUri = fileUri;
      if (Platform.OS === 'ios' && finalUri && !finalUri.startsWith('file://')) {
        finalUri = `file://${finalUri}`;
      }

      // Faylni yuborish, lekin local state'ga qo'shmaslik
      // WebSocket orqali keladi va u yerda qo'shiladi
      await chatService.uploadFile(id, finalUri, fileName, fileType);
      // WebSocket orqali xabar keladi, shuning uchun bu yerda qo'shmaslik
    } catch (error: any) {
      console.error('Error uploading file:', error);
      const errorMessage = error?.response?.data?.error || error?.message || t('errors.unknownError');
      toastService.error(`${t('chat.fileUploadError')}: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };


  const handleShareLocation = async () => {
    setShowMediaPicker(false);
    try {
      const hasPermission = await Geolocation.requestAuthorization('whenInUse');

      if (hasPermission !== 'granted') {
        Alert.alert(
          t('chat.permissionRequiredTitle'),
          t('chat.locationPermissionRequired'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('chat.openSettings'), onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const position = await new Promise<any>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
          }
        );
      });

      const { latitude, longitude } = position.coords;
      const address = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;

      // Joylashuvni yuborish, lekin local state'ga qo'shmaslik
      // WebSocket orqali keladi va u yerda qo'shiladi
      await chatService.sendMessage(id, {
        message_type: 'location',
        location_lat: latitude,
        location_lng: longitude,
        location_address: address,
      });
      // WebSocket orqali xabar keladi, shuning uchun bu yerda qo'shmaslik
    } catch (error: any) {
      console.error('Error sharing location:', error);
      if (error.code === 1) {
        Alert.alert(t('chat.permissionDeniedTitle'), t('chat.locationPermissionDenied'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('chat.openSettings'), onPress: () => Linking.openSettings() },
        ]);
      } else {
        toastService.error(t('chat.locationSendError'));
      }
    }
  };

  const handleUploadVoice = async (voiceUri: string) => {
    setUploading(true);
    try {
      await chatService.uploadVoice(id, voiceUri);
    } catch (error) {
      console.error('Error uploading voice:', error);
      toastService.error(t('chat.voiceUploadError'));
    } finally {
      setUploading(false);
    }
  };

  const handleStartVoiceRecording = async () => {
    if (uploading || isRecording) {
      return;
    }
    try {
      const path = await startVoiceRecording();
      recordingPathRef.current = path;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
      setVoiceRecordingMaxListener(() => {
        void finalizeVoiceRecording(true);
      });
    } catch (error: any) {
      if (error?.message === 'microphone_permission_denied') {
        Alert.alert(t('chat.permissionRequiredTitle'), t('chat.microphonePermissionRequired'));
        return;
      }
      toastService.error(t('chat.voiceRecordError'));
    }
  };

  const finalizeVoiceRecording = async (fromMaxDuration = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setVoiceRecordingMaxListener(null);
    setIsRecording(false);
    try {
      const path = await stopVoiceRecording();
      const voiceUri = path || recordingPathRef.current;
      recordingPathRef.current = null;
      if (!voiceUri || recordingSecondsRef.current < 1) {
        toastService.info(t('chat.voiceTooShort'));
        return;
      }
      await handleUploadVoice(voiceUri);
      if (fromMaxDuration) {
        toastService.info(t('chat.voiceMaxDuration', { seconds: MAX_VOICE_RECORDING_SECONDS }));
      }
    } catch (error) {
      console.error('Error stopping voice recording:', error);
      toastService.error(t('chat.voiceUploadError'));
    } finally {
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
    }
  };

  const handleStopVoiceRecording = async (fromMaxDuration = false) => {
    if (!isRecording) {
      return;
    }
    await finalizeVoiceRecording(fromMaxDuration);
  };

  const handleCancelVoiceRecording = async () => {
    if (!isRecording) {
      return;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    recordingPathRef.current = null;
    recordingSecondsRef.current = 0;
    setRecordingSeconds(0);
    setVoiceRecordingMaxListener(null);
    await cancelVoiceRecording();
  };

  const handleToggleVoiceRecording = () => {
    if (isRecording) {
      void handleStopVoiceRecording(false);
      return;
    }
    void handleStartVoiceRecording();
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return t('chat.today');
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('chat.yesterday');
    } else {
      const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';
      return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
      });
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMyMessage = item.sender.id === user?.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showDate =
      !prevMessage ||
      new Date(item.created_at).toDateString() !==
        new Date(prevMessage.created_at).toDateString();

    const messageType = item.message_type || 'text';

    return (
      <View>
        {showDate && (
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={() => {
            if (isMyMessage) {
              Alert.alert(t('chat.messageActions'), undefined, [
                { text: t('chat.reply'), onPress: () => setReplyingTo(item) },
                {
                  text: t('chat.edit'),
                  onPress: () => {
                    setEditingMessage(item);
                    setMessageText(item.text || '');
                  },
                },
                {
                  text: t('chat.delete'),
                  style: 'destructive',
                  onPress: () => handleDeleteMessage(item.id),
                },
                { text: t('chat.addReaction'), onPress: () => setShowReactions(item.id) },
                { text: t('common.cancel'), style: 'cancel' },
              ]);
            } else {
              Alert.alert(t('chat.messageActions'), undefined, [
                { text: t('chat.reply'), onPress: () => setReplyingTo(item) },
                { text: t('chat.addReaction'), onPress: () => setShowReactions(item.id) },
                { text: t('common.cancel'), style: 'cancel' },
              ]);
            }
          }}>
          <View
            style={[
              styles.messageContainer,
              isMyMessage ? styles.myMessage : styles.otherMessage,
            ]}>
            {item.reply_to && (
              <View style={styles.replyContainer}>
                <View style={styles.replyLine} />
                <View style={styles.replyContent}>
                  <Text style={styles.replyName}>
                    {item.reply_to.sender.first_name} {item.reply_to.sender.last_name}
                  </Text>
                  <Text style={styles.replyText} numberOfLines={1}>
                    {item.reply_to.text || 'Media'}
                  </Text>
                </View>
              </View>
            )}

            {!isMyMessage && (
              <View style={styles.messageHeader}>
                <Text style={styles.senderName}>
                  {item.sender.first_name} {item.sender.last_name}
                </Text>
              </View>
            )}

            {messageType === 'image' && item.image && (
              <Image
                source={{ uri: getMediaUrl(item.image) || '' }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            )}

            {messageType === 'file' && item.file && (
              <TouchableOpacity
                style={styles.fileContainer}
                onPress={() => {
                  const url = getMediaUrl(item.file);
                  if (url) {Linking.openURL(url);}
                }}>
                <MaterialIcons name="insert-drive-file" size={32} color={isMyMessage ? colors.textLight : colors.primary} />
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, isMyMessage && styles.myMessageText]} numberOfLines={1}>
                    {item.file_name || 'Fayl'}
                  </Text>
                  {item.file_size && (
                    <Text style={[styles.fileSize, isMyMessage && styles.myMessageTime]}>
                      {(item.file_size / 1024).toFixed(1)} KB
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {messageType === 'voice' && item.voice && (
              <VoiceMessageBubble voicePath={item.voice} isMyMessage={isMyMessage} />
            )}

            {messageType === 'location' && item.location_lat && item.location_lng && (
              <TouchableOpacity
                style={styles.locationContainer}
                onPress={() => {
                  const lat = typeof item.location_lat === 'number' ? item.location_lat : parseFloat(String(item.location_lat));
                  const lng = typeof item.location_lng === 'number' ? item.location_lng : parseFloat(String(item.location_lng));
                  const url = `https://maps.google.com/?q=${lat},${lng}`;
                  Linking.openURL(url);
                }}>
                <MaterialIcons name="location-on" size={32} color={isMyMessage ? colors.textLight : colors.danger} />
                <View style={styles.locationInfo}>
                  <Text style={[styles.locationText, isMyMessage && styles.myMessageText]}>
                    {item.location_address || 'Joylashuv'}
                  </Text>
                  <Text style={[styles.locationCoords, isMyMessage && styles.myMessageTime]}>
                    {(() => {
                      const lat = typeof item.location_lat === 'number' ? item.location_lat : parseFloat(String(item.location_lat));
                      const lng = typeof item.location_lng === 'number' ? item.location_lng : parseFloat(String(item.location_lng));
                      return `${isNaN(lat) ? '0' : lat.toFixed(6)}, ${isNaN(lng) ? '0' : lng.toFixed(6)}`;
                    })()}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {messageType === 'contact' && item.contact_name && (
              <View style={styles.contactContainer}>
                <MaterialIcons name="person" size={32} color={isMyMessage ? colors.textLight : colors.primary} />
                <View style={styles.contactInfo}>
                  <Text style={[styles.contactName, isMyMessage && styles.myMessageText]}>
                    {item.contact_name}
                  </Text>
                  {item.contact_phone && (
                    <Text style={[styles.contactPhone, isMyMessage && styles.myMessageTime]}>
                      {item.contact_phone}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {item.text && (
              <Text style={[styles.messageText, isMyMessage && styles.myMessageText]}>
                {item.text}
                {item.is_edited && (
                  <Text style={[styles.editedLabel, isMyMessage && styles.myMessageTime]}>
                    {' '}{t('chat.editedLabel')}
                  </Text>
                )}
              </Text>
            )}

            {item.reactions && Object.keys(item.reactions).length > 0 && (
              <View style={styles.reactionsContainer}>
                {Object.entries(item.reactions).map(([userId, reaction]) => (
                  <TouchableOpacity
                    key={userId}
                    style={styles.reactionItem}
                    onPress={() => handleReaction(item.id, reaction as string)}>
                    <Text style={styles.reactionEmoji}>{reaction}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isMyMessage && styles.myMessageTime]}>
                {formatTime(item.created_at)}
              </Text>
              {isMyMessage && (
                <MaterialIcons
                  name={item.is_read ? 'done-all' : 'done'}
                  size={14}
                  color={item.is_read ? colors.primary : colors.textTertiary}
                  style={styles.readIcon}
                />
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={handleGoBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!chat) {
    return (
      <ScreenBackground>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={handleGoBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <EmptyState
          variant="error"
          title={t('chat.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={loadChat}
        />
      </ScreenBackground>
    );
  }

  const otherUser = user?.id === chat.client.id ? chat.driver : chat.client;
  const avatarUrl = getMediaUrl(otherUser.avatar);
  const orderSubtitle = chat.order.title
    ? `${t('chat.orderLabel', { id: chat.order.id })}: ${chat.order.title}`
    : t('chat.orderLabel', { id: chat.order.id });

  const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const renderChatHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <TouchableOpacity
        style={styles.headerIconButton}
        onPress={handleGoBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}>
        <MaterialIcons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.headerProfile} onPress={openLinkedOrder} activeOpacity={0.8}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarPlaceholder}>
            <Text style={styles.headerAvatarText}>
              {otherUser.first_name?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser.first_name} {otherUser.last_name}
            </Text>
            {otherUserOnline && <View style={styles.onlineIndicator} />}
          </View>
          <Text style={styles.headerOrder} numberOfLines={1}>
            {orderSubtitle}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.headerIconButton}
        onPress={() => setShowSearch(true)}
        accessibilityRole="button"
        accessibilityLabel={t('chat.searchMessages')}>
        <MaterialIcons name="search" size={24} color={colors.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.headerIconButton}
        onPress={() => setShowActions(true)}
        accessibilityRole="button"
        accessibilityLabel={t('chat.moreActions')}>
        <MaterialIcons name="more-vert" size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenBackground>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}>
      {renderChatHeader()}

      {otherUserTyping && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>
            {otherUser.first_name} {t('chat.typing')}
          </Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={scrollToEnd}
        onLayout={scrollToEnd}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('chat.noChats')}</Text>
            <Text style={styles.emptySubtext}>{t('chat.sendFirstMessage')}</Text>
          </View>
        }
      />

      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarContent}>
            <View style={styles.replyBarLine} />
            <View style={styles.replyBarInfo}>
              <Text style={styles.replyBarName}>
                {replyingTo.sender.first_name} {replyingTo.sender.last_name}
              </Text>
              <Text style={styles.replyBarText} numberOfLines={1}>
                {replyingTo.text || 'Media'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <MaterialIcons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {editingMessage && (
        <View style={styles.editBar}>
          <Text style={styles.editBarText}>{t('chat.editingMessage')}</Text>
          <TouchableOpacity onPress={() => {
            setEditingMessage(null);
            setMessageText('');
          }}>
            <MaterialIcons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {isRecording ? (
        <View style={styles.recordingBar}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>
            {t('chat.recordingVoice', { seconds: recordingSeconds })}
          </Text>
          <TouchableOpacity onPress={() => void handleCancelVoiceRecording()}>
            <Text style={styles.recordingCancel}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void handleStopVoiceRecording(false)}>
            <Text style={styles.recordingStop}>{t('chat.stopRecording')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => setShowMediaPicker(true)}>
          <MaterialIcons name="attach-file" size={24} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.micButton, isRecording && styles.micButtonActive]}
          onPress={handleToggleVoiceRecording}
          disabled={uploading}>
          <MaterialIcons
            name={isRecording ? 'stop' : 'keyboard-voice'}
            size={24}
            color={isRecording ? colors.danger : colors.primary}
          />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={handleTyping}
          placeholder={editingMessage ? t('chat.editMessagePlaceholder') : replyingTo ? t('chat.replyPlaceholder') : t('chat.typeMessage')}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={5000}
        />
        {uploading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.uploadIndicator} />
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!messageText.trim() || sending}>
            <MaterialIcons
              name={editingMessage ? 'check' : 'send'}
              size={24}
              color={colors.textLight}
            />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showMediaPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMediaPicker(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMediaPicker(false)}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalOption} onPress={handlePickImage}>
              <MaterialIcons name="photo-library" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.fromGallery')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleTakePhoto}>
              <MaterialIcons name="camera-alt" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handlePickFile}>
              <MaterialIcons name="insert-drive-file" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.file')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleShareLocation}>
              <MaterialIcons name="location-on" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.location')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showReactions !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReactions(null)}>
        <TouchableOpacity
          style={styles.reactionsModalOverlay}
          activeOpacity={1}
          onPress={() => setShowReactions(null)}>
          <View style={styles.reactionsModalContent}>
            {REACTIONS.map((reaction) => (
              <TouchableOpacity
                key={reaction}
                style={styles.reactionButton}
                onPress={() => showReactions && handleReaction(showReactions, reaction)}>
                <Text style={styles.reactionButtonText}>{reaction}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showSearch}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearch(false)}>
        <View style={styles.searchModalOverlay}>
          <View style={[styles.searchModalContent, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.searchHeaderRow}>
              <TouchableOpacity style={styles.headerIconButton} onPress={() => setShowSearch(false)}>
                <MaterialIcons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.searchTitle}>{t('chat.searchMessages')}</Text>
            </View>
            <View style={styles.searchInputRow}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('chat.searchPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={handleSearchMessages}
              />
              <TouchableOpacity style={styles.searchSubmit} onPress={handleSearchMessages}>
                {searching ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="search" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id.toString()}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                searchQuery.trim() ? (
                  <Text style={styles.searchEmpty}>{t('chat.searchNoResults')}</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultItem}
                  onPress={() => {
                    setShowSearch(false);
                    const index = messages.findIndex((message) => message.id === item.id);
                    if (index >= 0) {
                      flatListRef.current?.scrollToIndex({ index, animated: true });
                    }
                  }}>
                  <Text style={styles.searchResultText} numberOfLines={2}>
                    {item.text || item.file_name || t('chat.file')}
                  </Text>
                  <Text style={styles.searchResultMeta}>{formatTime(item.created_at)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowActions(false)}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setShowActions(false);
                openLinkedOrder();
              }}>
              <MaterialIcons name="assignment" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.openOrder')}</Text>
            </TouchableOpacity>
            {otherUser.phone ? (
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setShowActions(false);
                  handleCallUser(otherUser.phone);
                }}>
                <MaterialIcons name="phone" size={24} color={colors.primary} />
                <Text style={styles.modalOptionText}>{t('chat.callUser')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setShowActions(false);
                setShowSearch(true);
              }}>
              <MaterialIcons name="search" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.searchMessages')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setShowActions(false);
                loadChat();
              }}>
              <MaterialIcons name="refresh" size={24} color={colors.primary} />
              <Text style={styles.modalOptionText}>{t('chat.refreshChat')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginHorizontal: spacing.xs,
  },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.round,
    marginRight: spacing.md,
  },
  headerAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.round,
    marginRight: spacing.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  headerAvatarText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textLight,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  headerOrder: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  typingIndicator: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  typingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  messagesContainer: {
    padding: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  emptySubtext: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  dateContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dateText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    fontWeight: fontWeight.medium,
    ...shadows.sm,
  },
  messageContainer: {
    maxWidth: '78%',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.xl,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
    ...shadows.colored(colors.primary),
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  replyContainer: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  replyLine: {
    width: 3,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  replyContent: {
    flex: 1,
  },
  replyName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.xs / 2,
  },
  replyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  messageHeader: {
    marginBottom: spacing.xs,
  },
  senderName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  messageText: {
    fontSize: fontSize.base,
    color: colors.text,
    lineHeight: 22,
    fontWeight: fontWeight.medium,
  },
  myMessageText: {
    color: colors.textLight,
  },
  editedLabel: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    opacity: 0.7,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  fileInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  fileName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  fileSize: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  locationInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  locationText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  locationCoords: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  contactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  contactInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  contactName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  contactPhone: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  reactionItem: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: borderRadius.round,
  },
  reactionEmoji: {
    fontSize: fontSize.base,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  messageTime: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  myMessageTime: {
    color: colors.textLight,
    opacity: 0.85,
  },
  readIcon: {
    marginLeft: spacing.xs / 2,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyBarLine: {
    width: 3,
    height: 40,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  replyBarInfo: {
    flex: 1,
  },
  replyBarName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.xs / 2,
  },
  replyBarText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.warning,
  },
  editBarText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textLight,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    ...shadows.floating,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  micButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    borderRadius: borderRadius.full,
  },
  micButtonActive: {
    backgroundColor: colors.dangerGlow,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.dangerGlow,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
    recordingStop: {
      color: colors.primary,
      fontWeight: fontWeight.bold,
      fontSize: fontSize.sm,
    },
    recordingCancel: {
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
      fontSize: fontSize.sm,
      marginRight: spacing.sm,
    },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.base,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  uploadIndicator: {
    marginLeft: spacing.sm,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.round,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
    ...shadows.colored(colors.primary),
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
    ...shadows.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundTertiary,
  },
  modalOptionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.text,
    marginLeft: spacing.md,
  },
  reactionsModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionsModalContent: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.xl,
  },
  reactionButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.round,
    backgroundColor: colors.backgroundTertiary,
  },
  reactionButtonText: {
    fontSize: fontSize.xl,
  },
  searchModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  searchModalContent: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.lg,
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  searchTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  searchSubmit: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  searchEmpty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    fontSize: fontSize.base,
  },
  searchResultItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchResultText: {
    fontSize: fontSize.base,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  searchResultMeta: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
});

export default ChatDetailScreen;
