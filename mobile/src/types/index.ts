export interface TrialStatus {
  enabled: boolean;
  granted: number;
  consumed: number;
  remaining: number;
  disabled?: boolean;
  disabled_reason?: string | null;
}

export interface UserSubscriptionStatus {
  required: boolean;
  active: boolean;
  expires_at: string | null;
  plan_code: string | null;
  plan_name: string | null;
  days_remaining: number | null;
  trial?: TrialStatus;
  has_access?: boolean;
}

export interface UserAccountStatus {
  role: 'client' | 'driver' | null;
  is_staff?: boolean;
  subscription_required: boolean;
  subscription_active: boolean;
  can_access_platform: boolean;
  trial?: TrialStatus;
  driver_verification_required: boolean;
  company_inn_required?: boolean;
  service_fee_required?: boolean;
  marketplace_actions_allowed?: boolean;
  service_fee?: OrderCompletionFeeSummary;
  subscription: UserSubscriptionStatus;
}

export interface User {
  id: number;
  phone: string;
  telegram_id?: number | null;
  telegram_username?: string;
  telegram_photo_url?: string;
  first_name: string;
  last_name: string;
  email?: string;
  avatar?: string;
  is_driver: boolean;
  is_client: boolean;
  marketplace_role?: 'client' | 'driver' | null;
  is_dispatcher?: boolean;
  is_updater?: boolean;
  is_operator?: boolean;
  is_admin?: boolean;
  is_verified: boolean;
  verification_status?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  company_inn?: string | null;
  document_photos?: string[];
  average_rating?: number;
  total_ratings?: number;
  complaints_received_count?: number;
  complaints_pending_count?: number;
  trust_score?: number;
  trust_tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | string;
  subscription?: UserSubscriptionStatus;
  account?: UserAccountStatus;
  is_blocked?: boolean;
  suspended_until?: string | null;
  has_expired_documents?: boolean;
  expired_document_count?: number;
  created_at: string;
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  audience: 'client' | 'driver';
  name: string;
  description?: string;
  price: number;
  regular_price: number;
  your_price: number;
  intro_eligible: boolean;
  discount_percent: number;
  is_intro_purchase: boolean;
  currency: string;
  duration_days: number;
}

export interface SubscriptionPurchaseResponse {
  subscription: {
    id: number;
    status: string;
    started_at: string;
    expires_at: string;
    plan: SubscriptionPlan;
  } | null;
  payment?: Payment;
  checkout_required?: boolean;
  status: UserSubscriptionStatus;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Advertisement {
  id: number;
  title: string;
  description?: string;
  photo?: string;
  weight: number;
  cargo_category?: 'general' | 'furniture' | 'food' | 'electronics' | 'construction' | 'documents' | 'fragile' | 'other' | string;
  volume_m3?: number;
  units_count?: number;
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  delivery_deadline?: string | null;
  contact_name?: string;
  contact_phone?: string;
  receiver_name?: string;
  receiver_phone?: string;
  special_requirements?: string[];
  required_body_type?: string;
  requires_adr?: boolean;
  requires_reefer?: boolean;
  is_heavy?: boolean;
  route_preference?: 'fastest' | 'cheapest' | 'balanced' | 'no_toll' | string;
  is_fragile?: boolean;
  departure_address: string;
  departure_country: Country | number;
  departure_city: City | number;
  destination_address: string;
  destination_country: Country | number;
  destination_city: City | number;
  proposed_cost?: number;
  is_closed: boolean;
  is_favorite?: boolean;
  created_at: string;
  updated_at?: string;
  client?: User;
  client_user?: User;
  route_stops?: Array<{
    sequence?: number;
    stop_type?: string;
    label?: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
  }>;
}

export interface Bid {
  id: number;
  advertisement: number;
  client: number;
  driver: number;
  driver_user?: User;
  proposed_amounts: Array<{
    amount: string;
    by: 'client' | 'driver';
    timestamp?: string;
  }>;
  is_driver_agreed_to_amount: boolean;
  is_rejected_by_client: boolean;
  is_accepted_by_client: boolean;
  is_rejected_by_driver: boolean;
  last_counter_by?: 'client' | 'driver';
  current_amount?: string;
  can_counter_by_driver?: boolean;
  can_counter_by_client?: boolean;
  can_agree_to_counter_by_driver?: boolean;
  created_at: string;
}

export interface OrderDocument {
  id: number;
  doc_type: 'invoice' | 'ttn' | 'cmr' | 'act' | string;
  title: string;
  number: string;
  generated_at?: string | null;
  html_url: string;
  pdf_url?: string;
  xlsx_url: string;
  has_pdf?: boolean;
  token: string;
}

export interface Order {
  id: number;
  advertisement: Advertisement | number;
  driver: User | number;
  client: User | number;
  status: {
    id: number;
    code: string;
    name: string;
  };
  current_location_lat?: number;
  current_location_lng?: number;
  current_speed_mps?: number | null;
  current_heading?: number | null;
  route_progress_m?: number | null;
  driver_last_seen_at?: string | null;
  driver_app_state?: 'foreground' | 'background' | 'inactive' | string | null;
  driver_presence?: {
    status: 'online' | 'offline' | string;
    stale_level: 'online' | 'warning' | 'stale' | 'offline' | string;
    age_seconds?: number | null;
    last_seen_at?: string | null;
    app_state?: string | null;
  };
  planned_route_points?: Array<{
    lat: number;
    lng: number;
    id?: number;
    sequence?: number;
    type?: string;
    label?: string;
    address?: string;
    status?: string;
  }>;
  optimized_route_polyline?: Array<{ lat: number; lng: number }>;
  optimized_route_distance_meters?: number | null;
  optimized_route_duration_seconds?: number | null;
  route_optimization_provider?: string;
  route_stops?: OrderRouteStop[];
  route_deviation_threshold_meters?: number;
  pickup_geofence_radius_meters?: number;
  destination_geofence_radius_meters?: number;
  is_in_pickup_geofence?: boolean;
  is_in_destination_geofence?: boolean;
  route_deviation_last_alert_at?: string | null;
  route_deviation_last_distance_meters?: number | null;
  route_deviation_count?: number;
  tracked_distance_meters?: number | null;
  tracked_distance_computed_at?: string | null;
  distance_summary?: {
    planned_distance_km?: number | null;
    planned_distance_source?: string | null;
    tracked_distance_km?: number | null;
    loaded_distance_km?: number | null;
    deadhead_distance_km?: number | null;
    distance_delta_km?: number | null;
    is_final?: boolean;
    track_points_used?: number;
  };
  estimated_eta_minutes?: number | null;
  tracking_summary?: {
    status?: 'moving' | 'stopped' | 'unknown' | string;
    last_update_at?: string | null;
    speed_kmh?: number | null;
    last_stop_minutes?: number | null;
    longest_stop_minutes?: number | null;
    total_stop_minutes?: number;
    total_moving_minutes?: number;
    stop_count?: number;
    progress_percent?: number | null;
    remaining_distance_km?: number | null;
    planned_distance_km?: number | null;
    planned_distance_source?: string | null;
    tracked_distance_km?: number | null;
    loaded_distance_km?: number | null;
    deadhead_distance_km?: number | null;
    distance_delta_km?: number | null;
    is_final?: boolean;
    track_points_used?: number;
    current_stop_started_at?: string | null;
    last_movement_at?: string | null;
    alert_level?: 'warning' | 'critical' | null | string;
    alert_message?: string | null;
  };
  proof_of_delivery?: {
    id: number;
    receiver_name: string;
    receiver_signature?: string;
    delivery_photo?: string | null;
    delivered_lat: number;
    delivered_lng: number;
    delivered_at: string;
    note?: string;
  } | null;
  return_quality?: {
    id: number;
    quality_status: 'ok' | 'opened' | 'damaged' | string;
    note?: string;
    photo?: string | null;
    classified_by: number;
    classified_at: string;
  } | null;
  tracking_share?: {
    token: string;
    is_active: boolean;
    expires_at: string;
    public_url?: string | null;
  } | null;
  custody_events?: OrderCustodyEvent[];
  active_sos?: OrderSOSAlert | null;
  escrow?: {
    status: string;
    funded_amount: number;
    released_to_driver: number;
    commission_amount: number;
    refunded_amount: number;
    cancellation_fee: number;
    remaining_amount: number;
  } | null;
  documents?: OrderDocument[];
  total_amount?: number;
  paid_amount?: number;
  remaining_amount?: number;
  is_fully_paid?: boolean;
  payment_progress?: number;
  client_payment_confirmed?: boolean | null;
  client_payment_confirmed_at?: string | null;
  client_paid_reported?: boolean | null;
  client_paid_reported_at?: string | null;
  client_delivery_confirmed?: boolean | null;
  client_delivery_confirmed_at?: string | null;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
}

export interface PublicTrackingShare {
  order_id: number;
  status_code: string;
  current_location: {
    lat: number | null;
    lng: number | null;
  };
  speed_mps?: number | null;
  heading?: number | null;
  eta_minutes: number | null;
  updated_at: string;
  expires_at: string;
  driver_last_seen_at?: string | null;
}

export interface Country {
  id: number;
  name: string;
  code: string;
}

export interface City {
  id: number;
  country: number;
  name: string;
}

export interface Vehicle {
  id: number;
  user?: number;
  make: string;
  model: string;
  number: string;
  photo?: string;
  cargo_volume: number;
  load_capacity: number;
  body_type?: 'tent' | 'reefer' | 'tanker' | 'open' | 'van' | 'other' | string;
  has_adr?: boolean;
  is_reefer?: boolean;
  is_heavy_haul?: boolean;
  is_verified: boolean;
  verification_status?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

export interface OrderLocationTrack {
  id: number;
  lat: number | string;
  lng: number | string;
  timestamp: string;
}

export type OrderRouteStopType = 'pickup' | 'delivery';
export type OrderRouteStopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

export interface OrderRouteStop {
  id: number;
  sequence: number;
  stop_type: OrderRouteStopType;
  label: string;
  address: string;
  lat?: number | string | null;
  lng?: number | string | null;
  geofence_radius_meters?: number;
  status: OrderRouteStopStatus;
  arrived_at?: string | null;
  completed_at?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RouteOptimizeResult {
  ordered_stop_ids: number[];
  polyline: Array<{ lat: number; lng: number }>;
  distance_meters: number;
  duration_seconds: number;
  provider: string;
}

export interface NotificationPreferences {
  push_enabled: boolean;
  in_app_enabled: boolean;
  types: Record<string, { push_enabled: boolean; in_app_enabled: boolean }>;
}

export interface News {
  id: number;
  photo?: string;
  title: string;
  text: string;
  date: string;
  created_at?: string;
}

export interface Payment {
  id: number;
  user?: number;
  order?: number;
  completion_fee?: number;
  purpose?: 'order' | 'subscription' | 'order_completion_fee' | 'generic' | string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_id?: string;
  checkout_url?: string | null;
  gateway_response?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  paid_at?: string;
  refunded_at?: string;
  refund_amount?: number;
  refund_reason?: string;
  is_refunded?: boolean;
  refundable_amount?: number;
  history?: PaymentHistory[];
}

export interface OrderCompletionFeeTotal {
  currency: string;
  amount: number;
  count: number;
}

export interface OrderCompletionFeeSummary {
  required: boolean;
  marketplace_actions_allowed: boolean;
  pending_count: number;
  totals: OrderCompletionFeeTotal[];
}

export interface OrderCompletionFee {
  id: number;
  order: number;
  role: 'client' | 'driver';
  role_display: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'waived';
  status_display: string;
  paid_payment?: number | null;
  paid_at?: string | null;
  waived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderCompletionFeeListResponse {
  summary: OrderCompletionFeeSummary;
  results: OrderCompletionFee[];
}

export interface PaymentHistory {
  id: number;
  status: string;
  status_new: string;
  gateway_response?: any;
  created_at: string;
}

export interface Earnings {
  completed_orders: number;
  settled_orders: number;
  total_earnings: number;
  available_balance: number;
  reserved_payouts?: number;
  disputed_orders?: number;
  earnings_source?: string;
}

export interface DriverDocumentMonitoringItem {
  id: number;
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  document_type: string;
  document_type_name: string;
  document_number?: string;
  expires_at: string;
  days_left: number;
  status: 'expired' | 'soon';
  vehicle_number?: string | null;
}

export interface DriverDocumentMonitoringResponse {
  count: number;
  expired_count: number;
  soon_count: number;
  items: DriverDocumentMonitoringItem[];
}

export interface DriverDocument {
  id: number;
  user: number;
  vehicle?: number | null;
  vehicle_number?: string | null;
  document_type: 'passport' | 'driver_license' | 'vehicle_insurance' | 'tech_inspection' | 'permit' | string;
  document_type_name?: string;
  document_number?: string;
  issued_at?: string | null;
  expires_at: string;
  reminder_sent_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaticContent {
  content_type: string;
  content_ru: string;
  content_en: string;
  content_uz: string;
  updated_at: string;
}

export interface Message {
  id: number;
  sender: User;
  text: string;
  message_type?: 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact';
  is_read: boolean;
  is_edited?: boolean;
  is_deleted?: boolean;
  reply_to?: Message;
  created_at: string;
  updated_at?: string;
  image?: string;
  file?: string;
  voice?: string;
  file_name?: string;
  file_size?: number;
  location_lat?: number;
  location_lng?: number;
  location_address?: string;
  contact_name?: string;
  contact_phone?: string;
  reactions?: { [userId: string]: string };
}

export interface Chat {
  id: number;
  order: {
    id: number;
    title: string;
  };
  client: User;
  driver: User;
  last_message?: {
    text: string;
    message_type?: string;
    created_at: string;
    sender_id: number;
  };
  unread_count: number;
  messages?: Message[];
  created_at: string;
  updated_at: string;
}

export interface Rating {
  id: number;
  order: Order | number;
  from_user: User;
  to_user: User;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface RatingStats {
  user_id: number;
  average_rating: number;
  total_ratings: number;
  rating_distribution: {
    '5': number;
    '4': number;
    '3': number;
    '2': number;
    '1': number;
  };
  complaints_received?: number;
  complaints_pending?: number;
  complaints_in_review?: number;
}

export interface Complaint {
  id: number;
  order_id: number;
  from_user: User;
  to_user: User;
  category: string;
  category_display?: string;
  description: string;
  status: string;
  status_display?: string;
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface DriverStatistics {
  total_earnings: number;
  completed_orders: number;
  pending_orders: number;
  in_progress_orders: number;
  avg_order_amount: number;
  earnings_today: number;
  earnings_week: number;
  earnings_month: number;
  daily_earnings: Array<{ date: string; earnings: number }>;
  monthly_earnings: Array<{ month: string; earnings: number }>;
}

export interface ClientStatistics {
  total_spent: number;
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  active_orders: number;
  avg_order_cost: number;
  spent_today: number;
  spent_week: number;
  spent_month: number;
  daily_spending: Array<{ date: string; spending: number }>;
  monthly_spending: Array<{ month: string; spending: number }>;
}

export interface FavoriteAdvertisement {
  id: number;
  advertisement: Advertisement;
  created_at: string;
}

export interface SavedSearch {
  id: number;
  name: string;
  query?: string;
  departure_city?: City | number;
  destination_city?: City | number;
  min_weight?: number;
  max_weight?: number;
  min_cost?: number;
  max_cost?: number;
  filters?: any;
  alerts_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DispatcherAssignment {
  id: number;
  dispatcher: User;
  order: Order;
  assigned_driver?: User;
  assigned_at: string;
  reassigned_at?: string;
  status: 'assigned' | 'reassigned' | 'cancelled' | 'completed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DispatcherNote {
  id: number;
  dispatcher: User;
  order: Order;
  note: string;
  created_at: string;
}

export interface DispatcherDashboard {
  total_orders: number;
  active_orders: number;
  pending_orders: number;
  problematic_orders: number;
  today_assignments: number;
  my_assignments: number;
}

export interface DispatcherStatistics {
  total_assignments: number;
  today_assignments: number;
  week_assignments: number;
  month_assignments: number;
  completed_assignments: number;
  active_assignments: number;
  daily_assignments?: Array<{ date: string; count: number }>;
  monthly_assignments?: Array<{ month: string; count: number }>;
  status_distribution?: { [key: string]: number };
}

export interface DispatcherAnalytics {
  orders_by_status: { [key: string]: { name: string; count: number } };
  drivers_performance: Array<{
    assigned_driver__id: number;
    assigned_driver__first_name: string;
    assigned_driver__last_name: string;
    total_assignments: number;
    completed: number;
    cancelled: number;
  }>;
  hourly_distribution: Array<{ hour: number; count: number }>;
  average_completion_time: number | null;
}

export interface UpdateLog {
  id: number;
  updater?: User;
  order: Order;
  update_type: 'status' | 'location' | 'payment' | 'other';
  old_value?: any;
  new_value?: any;
  description?: string;
  created_at: string;
}

export interface UpdaterDashboard {
  pending_updates: number;
  active_tracking: number;
  today_updates: number;
  week_updates: number;
}

export interface UpdaterStatistics {
  total_updates: number;
  today_updates: number;
  week_updates: number;
  month_updates: number;
  status_updates: number;
  location_updates: number;
  payment_updates: number;
  daily_updates?: Array<{ date: string; count: number }>;
  monthly_updates?: Array<{ month: string; count: number }>;
}

export interface UpdaterAnalytics {
  updates_by_type: { [key: string]: number };
  orders_updated: number;
  hourly_distribution: Array<{ hour: number; count: number }>;
}

export interface Notification {
  id: number;
  user: number;
  order?: Order;
  advertisement?: { id: number };
  chat_id?: number;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface DispatcherMonitoring {
  drivers_with_locations: Array<{
    driver: {
      id: number;
      first_name: string;
      last_name: string;
      phone: string;
    };
    order: {
      id: number;
      status: {
        code: string;
        name: string;
      };
    };
    location: {
      lat: number;
      lng: number;
    };
    location_updated_at?: string | null;
    driver_last_seen_at?: string | null;
    driver_app_state?: string | null;
    driver_presence?: {
      status: 'online' | 'offline' | string;
      stale_level: 'online' | 'warning' | 'stale' | 'offline' | string;
      age_seconds?: number | null;
    };
    vehicle: any;
  }>;
  orders_by_status: { [key: string]: { name: string; count: number } };
  total_active_drivers: number;
  total_orders: number;
  exceptions?: DispatcherException[];
  exceptions_count?: number;
  exceptions_by_type?: {
    stale_location: number;
    delayed_pending: number;
    problematic_status: number;
    route_deviation: number;
  };
  priority_recommendations?: Array<{
    order_id: number;
    status_code: string;
    status_name: string;
    driver_id: number;
    client_id: number;
    priority_score: number;
    eta_risk: 'low' | 'medium' | 'high' | string;
    stale_minutes?: number | null;
    updated_at: string;
    suggested_driver?: {
      driver_id: number;
      driver_name: string;
      driver_phone: string;
      vehicle_number: string;
      vehicle_capacity: number;
      current_load: number;
      score: number;
    } | null;
  }>;
  eta_risk_summary?: {
    high: number;
    medium: number;
    low: number;
  };
  document_expiry_alerts?: {
    items: Array<{
      document_id: number;
      driver_id: number;
      driver_phone: string;
      document_type: string;
      document_type_name: string;
      expires_at: string;
      days_left: number;
      severity: 'low' | 'medium' | 'high' | string;
      vehicle_number?: string | null;
    }>;
    count: number;
    expired_count: number;
    expiring_soon_count: number;
  };
  incident_playbook?: {
    delay_threshold_minutes: number;
    auto_escalated_count: number;
    items: Array<{
      order_id: number;
      status_code: string;
      status_name: string;
      driver_id: number;
      client_id: number;
      playbook: string;
      delay_minutes: number;
      threshold_minutes: number;
      escalation_level: 'warning' | 'critical' | string;
      fallback_driver?: {
        driver_id: number;
        driver_name: string;
        driver_phone: string;
        vehicle_number: string;
        vehicle_capacity: number;
        current_load: number;
        score: number;
      } | null;
      recommended_actions?: string[];
    }>;
  };
  sla_breach_risk_panel?: {
    summary: {
      high: number;
      medium: number;
      low: number;
    };
    count: number;
    items: Array<{
      order_id: number;
      status_code: string;
      deadline: string;
      minutes_to_deadline: number;
      eta_risk: 'low' | 'medium' | 'high' | string;
      sla_breach_risk: 'low' | 'medium' | 'high' | string;
    }>;
  };
  timestamp: string;
}

export type DispatcherExceptionType = 'stale_location' | 'delayed_pending' | 'problematic_status' | 'route_deviation';

export interface DispatcherException {
  order_id: number;
  status_code: string;
  status_name: string;
  driver_id: number;
  client_id: number;
  type: DispatcherExceptionType | string;
  severity: 'low' | 'medium' | 'high' | string;
  message: string;
  detected_at: string;
  last_track_at?: string | null;
  delay_minutes?: number;
  auto_escalated?: boolean;
  escalation_level?: string;
  fallback_driver?: {
    driver_id: number;
    driver_name: string;
    driver_phone: string;
    vehicle_number: string;
    vehicle_capacity: number;
    current_load: number;
    score: number;
  } | null;
}

export interface DriverDetail {
  driver: User;
  vehicles: Vehicle[];
  completed_orders: number;
  active_orders: number;
  total_assignments: number;
}

export interface ClientDetail {
  client: User;
  total_orders: number;
  completed_orders: number;
  active_orders: number;
  total_spent: number;
  recent_orders: Order[];
}

export interface PriceInsight {
  available: boolean;
  sample_count?: number;
  currency?: string;
  min_amount?: number;
  max_amount?: number;
  median_amount?: number;
  average_amount?: number;
  suggested_amount?: number;
  price_per_kg?: number | null;
  confidence?: 'low' | 'medium' | 'high' | string;
  message?: string;
}

export interface BackhaulMatch {
  advertisement_id: number;
  title: string;
  departure_city: string;
  destination_city: string;
  weight: number;
  proposed_cost?: number | null;
  cargo_category: string;
  match_score: number;
  match_reason: string;
  reasons?: string[];
  is_backhaul?: boolean;
}

export interface DriverMatch extends BackhaulMatch {
  departure_city_id?: number;
  destination_city_id?: number;
  required_body_type?: string;
  requires_adr?: boolean;
  requires_reefer?: boolean;
  is_heavy?: boolean;
}

export interface DriverAvailability {
  status: 'available' | 'busy' | 'scheduled' | string;
  effective: 'available' | 'busy' | 'scheduled' | 'on_trip' | string;
  available_from?: string | null;
  current_city_id?: number | null;
  current_city?: string;
  note?: string;
  on_trip?: boolean;
  active_order_id?: number | null;
  anchor_city_id?: number | null;
  anchor_reason?: string | null;
}

export interface DriverLane {
  id: number;
  departure_city_id: number;
  destination_city_id: number;
  departure_city: string;
  destination_city: string;
  weekdays: number[];
  time_from_hour?: number | null;
  time_to_hour?: number | null;
  include_backhaul: boolean;
  is_active: boolean;
}

export interface BackhaulMatchesResponse {
  available: boolean;
  anchor_city_id?: number | null;
  anchor_reason?: string | null;
  matches: BackhaulMatch[];
  message?: string;
  availability?: DriverAvailability;
  lanes?: DriverLane[];
}

export interface DriverMatchesResponse extends BackhaulMatchesResponse {
  matches: DriverMatch[];
  vehicle?: {
    id: number;
    body_type?: string;
    has_adr?: boolean;
    is_reefer?: boolean;
    is_heavy_haul?: boolean;
  } | null;
}

export interface OrderCustodyEvent {
  id: number;
  event_type: string;
  actor: number;
  actor_name: string;
  witness_name?: string;
  lat?: number | null;
  lng?: number | null;
  photo_url?: string | null;
  note?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface OrderSOSAlert {
  id: number;
  order: number;
  driver: number;
  driver_name?: string;
  lat: number;
  lng: number;
  message?: string;
  status: 'active' | 'acknowledged' | 'resolved' | string;
  acknowledged_by?: number | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface TripProfitEstimate {
  currency: string;
  revenue: number;
  estimated_distance_km: number;
  distance_source: string;
  fuel_cost: number;
  toll_estimate: number;
  total_cost: number;
  net_profit: number;
  margin_percent: number;
  is_profitable: boolean;
  fuel_price_per_liter: number;
  fuel_liters_per_100km: number;
}

export interface LoadFitResult {
  fits: boolean;
  reason: 'ok' | 'overweight' | 'no_vehicle' | string;
  best_vehicle?: {
    id: number;
    make: string;
    model: string;
    number: string;
    load_capacity: number;
  } | null;
  margin_kg?: number | null;
}

export interface RouteHealthInsight {
  available: boolean;
  recent_posts_7d: number;
  completed_orders_30d: number;
  avg_close_hours?: number | null;
  competition_level: 'low' | 'medium' | 'high' | string;
  estimated_match_quality: 'low' | 'medium' | 'high' | 'unknown' | string;
  recommendation?: 'neutral' | 'favorable' | 'caution_high_competition' | 'caution_unproven_lane' | string;
}

export interface DuplicateRiskInsight {
  available: boolean;
  risk_level: 'low' | 'medium' | 'high' | string;
  matches_count: number;
  should_delay?: boolean;
  should_review?: boolean;
  matches: Array<{
    id: number;
    title: string;
    weight: number;
    proposed_cost?: number | null;
    created_at: string;
    is_closed: boolean;
  }>;
}
