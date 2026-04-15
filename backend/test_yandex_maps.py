#!/usr/bin/env python
"""
Yandex Maps Integration Test Script
Tests location tracking and navigation functionality
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000/api"

def test_location_tracking():
    print("=" * 60)
    print("YANDEX MAPS INTEGRATION TEST")
    print("=" * 60)
    
    # 1. Login as driver
    print("\n1. Driver login...")
    driver_login = {
        "phone": "998901234568",  # Driver from populate_db
        "password": "testpass123"
    }
    response = requests.post(f"{BASE_URL}/auth/login/", json=driver_login)
    if response.status_code != 200:
        print(f"❌ Driver login failed: {response.status_code}")
        print(f"Response: {response.text}")
        return
    driver_data = response.json()
    driver_token = driver_data.get('access')
    print(f"✅ Driver logged in. Token: {driver_token[:20]}...")
    
    # 2. Get driver orders
    print("\n2. Getting driver orders...")
    headers = {"Authorization": f"Bearer {driver_token}"}
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
        return
    
    # 3. Start order (if not started)
    print("\n3. Starting order...")
    response = requests.post(f"{BASE_URL}/orders/{order_id}/start/", headers=headers)
    if response.status_code in [200, 201]:
        print(f"✅ Order started")
    else:
        print(f"⚠️  Order might already be started: {response.status_code}")
    
    # 4. Update location (simulate real-time tracking)
    print("\n4. Testing location updates...")
    test_locations = [
        {"lat": 41.3111, "lng": 69.2797},  # Tashkent center
        {"lat": 41.3150, "lng": 69.2800},  # Move 1
        {"lat": 41.3200, "lng": 69.2850},  # Move 2
        {"lat": 41.3250, "lng": 69.2900},  # Move 3
    ]
    
    for i, loc in enumerate(test_locations):
        print(f"   Updating location {i+1}/{len(test_locations)}: {loc['lat']}, {loc['lng']}")
        response = requests.post(
            f"{BASE_URL}/orders/{order_id}/update-location/",
            json=loc,
            headers=headers
        )
        if response.status_code == 200:
            print(f"   ✅ Location updated successfully")
        else:
            print(f"   ❌ Failed: {response.status_code}")
            print(f"   Response: {response.text}")
        time.sleep(1)
    
    # 5. Get order tracking history
    print("\n5. Getting tracking history...")
    response = requests.get(f"{BASE_URL}/orders/{order_id}/track/", headers=headers)
    if response.status_code == 200:
        tracks = response.json()
        print(f"✅ Found {len(tracks)} tracking points")
        if tracks:
            print(f"   Latest: {tracks[0]['lat']}, {tracks[0]['lng']}")
            print(f"   Time: {tracks[0]['timestamp']}")
    else:
        print(f"❌ Failed to get tracking: {response.status_code}")
    
    # 6. Login as client and check tracking
    print("\n6. Client checking tracking...")
    client_login = {
        "phone": "998901234567",  # Client from populate_db
        "password": "testpass123"
    }
    response = requests.post(f"{BASE_URL}/auth/login/", json=client_login)
    if response.status_code == 200:
        client_data = response.json()
        client_token = client_data.get('access')
        client_headers = {"Authorization": f"Bearer {client_token}"}
        
        response = requests.get(f"{BASE_URL}/orders/{order_id}/", headers=client_headers)
        if response.status_code == 200:
            order = response.json()
            if order.get('current_location_lat') and order.get('current_location_lng'):
                print(f"✅ Client can see driver location:")
                print(f"   Lat: {order['current_location_lat']}")
                print(f"   Lng: {order['current_location_lng']}")
            else:
                print("⚠️  No current location in order")
        
        response = requests.get(f"{BASE_URL}/orders/{order_id}/track/", headers=client_headers)
        if response.status_code == 200:
            tracks = response.json()
            print(f"✅ Client can see {len(tracks)} tracking points")
    else:
        print(f"❌ Client login failed: {response.status_code}")
    
    # 7. Test Yandex Maps URL format
    print("\n7. Testing Yandex Maps URL format...")
    test_lat = 41.3111
    test_lng = 69.2797
    yandex_url = f"https://yandex.ru/maps/?pt={test_lng},{test_lat}&z=15"
    print(f"✅ Yandex Maps URL: {yandex_url}")
    
    yandex_navi_url = f"yandexnavi://build_route?lat_to={test_lat}&lon_to={test_lng}"
    print(f"✅ Yandex Navigator URL: {yandex_navi_url}")
    
    print("\n" + "=" * 60)
    print("TEST COMPLETED")
    print("=" * 60)
    print("\n📱 Mobile test qadamlari:")
    print("1. Driver OrderTrackingScreen'da 'Boshlash' tugmasini bosing")
    print("2. Real-time tracking ishga tushadi")
    print("3. Client OrderTrackingScreen'da driver joylashuvini ko'ring")
    print("4. Navigatsiya tugmalarini bosing - Yandex Navigator ochiladi")

if __name__ == "__main__":
    try:
        test_location_tracking()
    except requests.exceptions.ConnectionError:
        print("❌ Connection error. Make sure Django server is running on http://localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
