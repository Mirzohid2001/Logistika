import { apiService } from './api';

type WebSocketTicketResponse = {
  ticket: string;
  expires_in: number;
};

function appendWsTicket(url: string, ticket: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}ticket=${encodeURIComponent(ticket)}`;
}

class WebSocketAuthService {
  async getAuthorizedUrl(wsUrl: string): Promise<string> {
    const response = await apiService.post<WebSocketTicketResponse>('/chats/ws-ticket/', {});
    return appendWsTicket(wsUrl, response.ticket);
  }
}

export const websocketAuthService = new WebSocketAuthService();
