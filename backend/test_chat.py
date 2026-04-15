#!/usr/bin/env python
"""
Chat API test script
"""
import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_chat_api():
    print("=" * 50)
    print("CHAT API TEST")
    print("=" * 50)
    
    # 1. Login as client
    print("\n1. Client login...")
    login_data = {
        "phone": "998901234567",  # populate_db dan foydalanuvchi
        "password": "testpass123"
    }
    response = requests.post(f"{BASE_URL}/auth/login/", json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        print(f"Response: {response.text}")
        return
    client_data = response.json()
    client_token = client_data.get('access')
    print(f"✅ Client logged in. Token: {client_token[:20]}...")
    
    # 2. Get orders to find an order for chat
    print("\n2. Getting client orders...")
    headers = {"Authorization": f"Bearer {client_token}"}
    response = requests.get(f"{BASE_URL}/orders/", headers=headers)
    if response.status_code == 200:
        orders = response.json()
        if isinstance(orders, dict) and 'results' in orders:
            orders = orders['results']
        print(f"✅ Found {len(orders)} orders")
        if len(orders) == 0:
            print("⚠️  No orders found. Please create an order first.")
            return
        order_id = orders[0]['id']
        print(f"   Using order ID: {order_id}")
    else:
        print(f"❌ Failed to get orders: {response.status_code}")
        print(f"Response: {response.text}")
        return
    
    # 3. Create chat
    print("\n3. Creating chat...")
    chat_data = {"order_id": order_id}
    response = requests.post(f"{BASE_URL}/chats/create/", json=chat_data, headers=headers)
    if response.status_code in [200, 201]:
        chat = response.json()
        chat_id = chat['id']
        print(f"✅ Chat created. Chat ID: {chat_id}")
    else:
        print(f"❌ Failed to create chat: {response.status_code}")
        print(f"Response: {response.text}")
        return
    
    # 4. Get chat list
    print("\n4. Getting chat list...")
    response = requests.get(f"{BASE_URL}/chats/", headers=headers)
    if response.status_code == 200:
        chats = response.json()
        print(f"✅ Found {len(chats)} chats")
        for chat in chats:
            print(f"   - Chat {chat['id']}: Order {chat['order']['id']}, Unread: {chat['unread_count']}")
    else:
        print(f"❌ Failed to get chats: {response.status_code}")
        print(f"Response: {response.text}")
    
    # 5. Get chat detail
    print(f"\n5. Getting chat detail (ID: {chat_id})...")
    response = requests.get(f"{BASE_URL}/chats/{chat_id}/", headers=headers)
    if response.status_code == 200:
        chat_detail = response.json()
        messages_count = len(chat_detail.get('messages', []))
        print(f"✅ Chat detail loaded. Messages: {messages_count}")
    else:
        print(f"❌ Failed to get chat detail: {response.status_code}")
        print(f"Response: {response.text}")
    
    # 6. Send message
    print(f"\n6. Sending message...")
    message_data = {"text": "Salom! Bu test xabari."}
    response = requests.post(f"{BASE_URL}/chats/{chat_id}/messages/", json=message_data, headers=headers)
    if response.status_code == 201:
        message = response.json()
        print(f"✅ Message sent. Message ID: {message['id']}")
        print(f"   Text: {message['text']}")
    else:
        print(f"❌ Failed to send message: {response.status_code}")
        print(f"Response: {response.text}")
    
    # 7. Get chat detail again to see new message
    print(f"\n7. Getting updated chat detail...")
    response = requests.get(f"{BASE_URL}/chats/{chat_id}/", headers=headers)
    if response.status_code == 200:
        chat_detail = response.json()
        messages = chat_detail.get('messages', [])
        print(f"✅ Chat updated. Total messages: {len(messages)}")
        if messages:
            last_msg = messages[-1]
            print(f"   Last message: {last_msg['text']} (from {last_msg['sender']['first_name']})")
    else:
        print(f"❌ Failed to get updated chat: {response.status_code}")
    
    # 8. Mark as read
    print(f"\n8. Marking messages as read...")
    response = requests.post(f"{BASE_URL}/chats/{chat_id}/mark-read/", headers=headers)
    if response.status_code == 200:
        print(f"✅ Messages marked as read")
    else:
        print(f"❌ Failed to mark as read: {response.status_code}")
        print(f"Response: {response.text}")
    
    print("\n" + "=" * 50)
    print("TEST COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    try:
        test_chat_api()
    except requests.exceptions.ConnectionError:
        print("❌ Connection error. Make sure Django server is running on http://localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
