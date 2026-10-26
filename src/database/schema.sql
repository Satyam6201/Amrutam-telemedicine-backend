-- =============================================================================
-- AMRUTAM TELEMEDICINE BACKEND - DATABASE SCHEMA
-- Scalability: Table Partitioning, Composite Indexes, Concurrency Control
-- Security: PHI Encryption Columns, Tamper-Evident Audit Trails
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE consultation_status AS ENUM (
    'REQUESTED',
    'CONFIRMED',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'PATIENT',
  phone VARCHAR(20),
  is_mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. PROFILES TABLE (Patient & General user profile)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  blood_group VARCHAR(10),
  address JSONB DEFAULT '{}'::jsonb,
  emergency_contact JSONB DEFAULT '{}'::jsonb,
  encrypted_medical_history TEXT, -- AES-256-GCM encrypted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_profile_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- 3. SPECIALTIES TABLE (Ayurveda, Panchakarma, etc.)
CREATE TABLE IF NOT EXISTS specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. DOCTORS TABLE
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_number VARCHAR(100) UNIQUE NOT NULL,
  experience_years INT DEFAULT 0,
  qualification VARCHAR(255) NOT NULL,
  consultation_fee NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  rating NUMERIC(3, 2) DEFAULT 5.00,
  total_ratings INT DEFAULT 0,
  bio TEXT,
  languages TEXT[] DEFAULT ARRAY['English', 'Hindi'],
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_doctor_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_fee ON doctors(consultation_fee);
CREATE INDEX IF NOT EXISTS idx_doctors_rating ON doctors(rating DESC);
CREATE INDEX IF NOT EXISTS idx_doctors_approved ON doctors(is_approved);

-- DOCTOR SPECIALTY MAPPING
CREATE TABLE IF NOT EXISTS doctor_specialties (
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  specialty_id UUID NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  PRIMARY KEY (doctor_id, specialty_id)
);

-- 5. AVAILABILITY SLOTS TABLE (Doctor schedule & booking slots)
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status slot_status NOT NULL DEFAULT 'AVAILABLE',
  held_until TIMESTAMP WITH TIME ZONE,
  held_by_patient_id UUID REFERENCES users(id),
  version INT NOT NULL DEFAULT 1, -- Optimistic locking counter
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_doctor_slot UNIQUE (doctor_id, slot_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor_date_status ON availability_slots(doctor_id, slot_date, status);
CREATE INDEX IF NOT EXISTS idx_slots_held_until ON availability_slots(status, held_until) WHERE status = 'HELD';

-- 6. CONSULTATIONS TABLE (PARTITIONED BY RANGE on scheduled_at)
CREATE TABLE IF NOT EXISTS consultations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  patient_id UUID NOT NULL REFERENCES users(id),
  slot_id UUID REFERENCES availability_slots(id),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status consultation_status NOT NULL DEFAULT 'REQUESTED',
  encrypted_symptoms TEXT,        -- AES-256-GCM Encrypted PHI
  encrypted_clinical_notes TEXT,  -- AES-256-GCM Encrypted PHI
  video_room_url TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (id, scheduled_at)
) PARTITION BY RANGE (scheduled_at);

-- Consultations Partitions
CREATE TABLE IF NOT EXISTS consultations_2026_q1 PARTITION OF consultations
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_2026_q2 PARTITION OF consultations
  FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_2026_q3 PARTITION OF consultations
  FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_2026_q4 PARTITION OF consultations
  FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_default PARTITION OF consultations DEFAULT;

CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);

-- 7. PRESCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL,
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  patient_id UUID NOT NULL REFERENCES users(id),
  encrypted_diagnosis TEXT NOT NULL, -- AES-256-GCM Encrypted PHI
  medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  advice TEXT,
  follow_up_date DATE,
  digital_signature TEXT NOT NULL,   -- Doctor HMAC-SHA256 signature
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_consultation_prescription UNIQUE (consultation_id)
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);

-- 8. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'INR',
  payment_method VARCHAR(30) NOT NULL DEFAULT 'RAZORPAY_UPI',
  transaction_id VARCHAR(100),
  status payment_status NOT NULL DEFAULT 'PENDING',
  idempotency_key VARCHAR(100) UNIQUE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_consultation ON payments(consultation_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 9. AUDIT LOGS TABLE (PARTITIONED BY RANGE on timestamp)
-- Tamper-evident immutable audit log with cryptographic hash chain
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  previous_state JSONB,
  new_state JSONB,
  prev_hash VARCHAR(64) NOT NULL,
  hash_signature VARCHAR(64) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE IF NOT EXISTS audit_logs_2026_q1 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_2026_q2 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_2026_q3 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_2026_q4 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- 10. IDEMPOTENCY RECORDS TABLE (For atomic API idempotency)
CREATE TABLE IF NOT EXISTS idempotency_records (
  idempotency_key VARCHAR(120) PRIMARY KEY,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL, -- PROCESSING, COMPLETED, FAILED
  response_code INT,
  response_body JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);
