-- =========================
-- 1. ORGANIZATION & HOTELS
-- =========================
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hotels (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  timezone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 2. ROOM STRUCTURE
-- =========================
CREATE TABLE room_types (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  name VARCHAR(100),
  description TEXT,
  capacity INT,
  base_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  room_type_id UUID REFERENCES room_types(id),
  room_number VARCHAR(50),
  floor INT,
  status VARCHAR(50), -- available, occupied, maintenance
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 3. INVENTORY (CORE ENGINE)
-- =========================
CREATE TABLE inventory (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  room_type_id UUID REFERENCES room_types(id),
  date DATE NOT NULL,
  total_rooms INT,
  available_rooms INT,
  booked_rooms INT,
  blocked_rooms INT,
  UNIQUE(hotel_id, room_type_id, date)
);

-- =========================
-- 4. RATE PLANS & PRICING
-- =========================
CREATE TABLE rate_plans (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  name VARCHAR(100),
  cancellation_policy TEXT,
  meal_plan VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rates (
  id UUID PRIMARY KEY,
  rate_plan_id UUID REFERENCES rate_plans(id),
  room_type_id UUID REFERENCES room_types(id),
  date DATE,
  price DECIMAL(10,2),
  currency VARCHAR(10),
  UNIQUE(rate_plan_id, room_type_id, date)
);

-- =========================
-- 5. GUESTS
-- =========================
CREATE TABLE guests (
  id UUID PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  nationality VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 6. BOOKINGS
-- =========================
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  guest_id UUID REFERENCES guests(id),
  source VARCHAR(50), -- direct, OTA
  status VARCHAR(50), -- confirmed, cancelled, checked_in, checked_out
  check_in DATE,
  check_out DATE,
  total_amount DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE booking_rooms (
  id UUID PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  room_id UUID REFERENCES rooms(id),
  room_type_id UUID REFERENCES room_types(id),
  rate_plan_id UUID REFERENCES rate_plans(id),
  price DECIMAL(10,2)
);

-- =========================
-- 7. PAYMENTS
-- =========================
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  amount DECIMAL(10,2),
  method VARCHAR(50), -- card, UPI, cash
  status VARCHAR(50), -- pending, paid
  transaction_ref VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 8. STAFF
-- =========================
CREATE TABLE staff (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  name VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 9. HOUSEKEEPING
-- =========================
CREATE TABLE housekeeping (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  status VARCHAR(50), -- clean, dirty, in_progress
  assigned_to UUID REFERENCES staff(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 10. OTA / CHANNEL MANAGER
-- =========================
CREATE TABLE ota_mappings (
  id UUID PRIMARY KEY,
  hotel_id UUID REFERENCES hotels(id),
  ota_name VARCHAR(100),
  external_room_type_id VARCHAR(255),
  external_rate_plan_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ota_reservations (
  id UUID PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  ota_name VARCHAR(100),
  external_booking_id VARCHAR(255),
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 11. AUDIT LOGS
-- =========================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  entity_type VARCHAR(100),
  entity_id UUID,
  action VARCHAR(50),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- INDEXES (IMPORTANT)
-- =========================
CREATE INDEX idx_inventory_date ON inventory(date);
CREATE INDEX idx_booking_dates ON bookings(check_in, check_out);
CREATE INDEX idx_rates_date ON rates(date);