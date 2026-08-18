import { apiService } from './api';
import { Chat, Message, PaginatedResponse } from '../types';

export const chatService = {
  async getChats(params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<Chat>> {
    return apiService.get('/chats/', params);
  },

  async getChat(id: number): Promise<Chat> {
    return apiService.get(`/chats/${id}/`);
  },

  async createChat(orderId: number): Promise<Chat> {
    return apiService.post('/chats/create/', { order_id: orderId });
  },

  async sendMessage(chatId: number, data: {
    text?: string;
    message_type?: string;
    reply_to?: number;
    location_lat?: number;
    location_lng?: number;
    location_address?: string;
    contact_name?: string;
    contact_phone?: string;
  }): Promise<Message> {
    return apiService.post(`/chats/${chatId}/messages/`, data);
  },

  async markAsRead(chatId: number): Promise<void> {
    return apiService.post(`/chats/${chatId}/mark-read/`, {});
  },

  async updateMessage(messageId: number, text: string): Promise<Message> {
    return apiService.patch(`/chats/messages/${messageId}/`, { text });
  },

  async deleteMessage(messageId: number): Promise<void> {
    return apiService.delete(`/chats/messages/${messageId}/delete/`);
  },

  async addReaction(messageId: number, reaction: string): Promise<Message> {
    return apiService.post(`/chats/messages/${messageId}/reaction/`, { reaction });
  },

  async searchMessages(chatId: number, query: string): Promise<Message[]> {
    return apiService.get(`/chats/${chatId}/search/`, { q: query });
  },

  async uploadImage(chatId: number, imageUri: string): Promise<Message> {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'image.jpg',
    } as any);

    return apiService.post('/chats/messages/upload-image/', formData);
  },

  async uploadFile(chatId: number, fileUri: string, fileName: string, fileType: string): Promise<Message> {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    
    // File object ni to'g'ri formatda yaratish
    const fileObject: any = {
      uri: fileUri,
      type: fileType,
      name: fileName,
    };
    
    formData.append('file', fileObject);

    console.log('Uploading file:', { chatId, fileName, fileType, uri: fileUri });
    
    return apiService.post('/chats/messages/upload-file/', formData);
  },

  async uploadVoice(chatId: number, voiceUri: string): Promise<Message> {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append('voice', {
      uri: voiceUri,
      type: 'audio/m4a',
      name: 'voice.m4a',
    } as any);

    return apiService.post('/chats/messages/upload-voice/', formData);
  },
};
