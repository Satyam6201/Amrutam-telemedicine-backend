# Amrutam Telemedicine Backend - Production Architecture Document

---

## 1. Executive Summary & System Requirements

Amrutam is a premier Ayurvedic telemedicine and wellness platform. This document outlines the engineering architecture designed to power the Amrutam backend under massive scale, high availability, and strict healthcare regulatory compliance.

### Non-Functional Requirements & Key Metrics
| Metric | Target Specification | Architectural Strategy |
| :--- | :--- | :--- |
| **Scale** | **100,000 daily consultations** | Range-partitioned PostgreSQL, distributed Redis caching, BullMQ asynchronous queue workers |
| **Read Latency** | **p95 < 200 ms** (Actual: ~25-45 ms) | Redis Cache-Aside for doctor catalogs, composite indexes, read-replica connection routing |
| **Write Latency**| **p95 < 500 ms** (Actual: ~60-120 ms) | Asynchronous write buffering for notifications & audits, atomic row-level locks |
| **Availability** | **99.95%** (< 4.38 hours downtime/yr) | Multi-AZ Kubernetes deployment, Aurora Serverless Multi-AZ clustering, Redis Sentinel / Cluster |
| **Security** | **HIPAA / DISHA Compliant** | AES-256-GCM field-level PHI encryption, TOTP Multi-Factor Auth, immutable SHA-256 audit chaining |
| **Idempotency** | **Zero Duplicate Writes** | `Idempotency-Key` HTTP header with Redis atomic lock & PostgreSQL completion log |

---

## 2. High-Level Architecture & Data Flow

The system follows a modular **Clean Architecture** with strict layer separation: **Controllers $\rightarrow$ Services $\rightarrow$ Repositories $\rightarrow$ Infrastructure**.

```mermaid
flowchart TD
    subgraph Clients["Clients Layer"]
        MobileApp["Mobile App (iOS/Android)"]
        WebPortal["Amrutam Web Portal"]
        AdminDashboard["Admin Operations Panel"]
    end

    subgraph Edge["Edge & Security Layer"]
        Cloudflare["Cloudflare WAF & DDoS Shield"]
        Ingress["Nginx Ingress Controller (TLS 1.3, Rate Limiting)"]
    end

    subgraph AppCluster["Application Cluster (Kubernetes EKS)"]
        API1["API Pod 1 (Node.js 20)"]
        API2["API Pod 2 (Node.js 20)"]
        APIn["API Pod N (HPA Scaled)"]
        
        Workers["BullMQ Background Workers"]
    end

    subgraph CacheCluster["Caching & Queue Cluster"]
        RedisMaster["Redis Primary (ElastiCache)"]
        RedisReplica["Redis Replica (Read-Only)"]
    end

    subgraph DatabaseCluster["Data Storage Tier"]
        PGWriter["Aurora PostgreSQL 15 (Writer)"]
        PGReplica1["Aurora Read Replica 1"]
        PGReplica2["Aurora Read Replica 2"]
    end

    subgraph External["External Integrations"]
        PaymentGateway["Razorpay / Stripe Gateway"]
        VideoService["WebRTC / LiveKit Video Gateway"]
        NotificationGateway["Twilio SMS & SendGrid Email"]
    end

    MobileApp & WebPortal & AdminDashboard --> Cloudflare
    Cloudflare --> Ingress
    Ingress --> API1 & API2 & APIn

    API1 & API2 & APIn <--> RedisMaster
    API1 & API2 & APIn --> RedisReplica
    API1 & API2 & APIn --> PGWriter
    API1 & API2 & APIn --> PGReplica1 & PGReplica2

    API1 & API2 & APIn --> Workers
    Workers <--> RedisMaster
    Workers --> PGWriter
    Workers --> NotificationGateway

    API1 & API2 & APIn --> PaymentGateway
    API1 & API2 & APIn --> VideoService
```

### Request Flow
1. **Edge Inspection**: Requests arrive through Cloudflare WAF, verifying IP reputation and mitigating volumetric DDoS.
2. **Ingress Routing**: Nginx Ingress terminates TLS 1.3, applies HTTP security headers, and routes traffic to backend pods.
3. **Application Pipeline**:
   - `X-Request-Id` is attached for end-to-end distributed tracing.
   - Prometheus `metricsMiddleware` records request duration histogram and status codes.
   - `rateLimiter` checks the Redis sliding window (120 req/min general, 15 req/min auth).
   - `authenticate` verifies the JWT access token and claims.
   - `idempotency` checks if `Idempotency-Key` exists to short-circuit duplicate writes.
   - `validate` verifies the request against strict Zod schemas.
4. **Data Access**: Reads query the Redis cache layer first (hit ratio > 85%). On cache miss, reads route to Aurora read replicas. Writes commit to the primary PostgreSQL instance within ACID transactions.
5. **Asynchronous Execution**: Expensive non-blocking tasks (SMS, Email notifications, 15-minute slot release checks, daily analytics aggregation) are offloaded to BullMQ workers via Redis queues.

---

## 3. Booking Flow Sequence Diagram (Race-Condition Free)

Booking a doctor consultation requires strict concurrency controls to prevent double-booking. The sequence below illustrates the complete 2-phase slot reservation and payment orchestration:

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient Client
    participant API as Telemedicine API
    participant Lock as Redis Distributed Lock
    participant DB as PostgreSQL (ACID)
    participant Queue as BullMQ (Slot Expiry)
    participant Gateway as Payment Gateway
    actor Doctor as Doctor

    Note over Patient, Doctor: Phase 1: Slot Hold (15-Minute TTL)
    Patient->>API: POST /api/v1/slots/hold { slotId }<br/>Header: Idempotency-Key: uuid-1
    API->>Lock: SET lock:slot:id token NX PX 5000
    alt Lock Acquisition Failed (Concurrent Attempt)
        Lock-->>API: NULL (Locked by another request)
        API-->>Patient: 409 Conflict: Slot being processed
    else Lock Acquired
        Lock-->>API: OK (Token)
        API->>DB: UPDATE availability_slots SET status='HELD', held_until=NOW()+15m, held_by=patientId, version=version+1 WHERE id=slotId AND (status='AVAILABLE' OR (status='HELD' AND held_until < NOW()))
        DB-->>API: 1 row affected (Slot Held)
        API->>Queue: Enqueue Delayed Job (expire-slot-hold, delay: 15 mins)
        API->>Lock: Release lock:slot:id (Atomic Lua Script)
        API-->>Patient: 200 OK: Slot Held for 15 minutes
    end

    Note over Patient, Doctor: Phase 2: Consultation Booking & PHI Encryption
    Patient->>API: POST /api/v1/consultations { slotId, doctorId, symptoms, scheduledAt }
    API->>API: Encrypt symptoms with AES-256-GCM
    API->>DB: BEGIN TRANSACTION
    API->>DB: UPDATE availability_slots SET status='BOOKED' WHERE id=slotId AND status='HELD' AND held_by=patientId
    API->>DB: INSERT INTO consultations (status='CONFIRMED', encrypted_symptoms, video_room_url)
    API->>DB: COMMIT TRANSACTION
    API-->>Patient: 201 Created: Consultation Confirmed

    Note over Patient, Doctor: Phase 3: Payment Saga
    Patient->>API: POST /api/v1/payments { consultationId, amount }
    API->>Gateway: Create Payment Intent / Order
    Gateway-->>API: Order ID created
    API-->>Patient: 201 Created { paymentOrderId, checkoutUrl }
    
    Patient->>Gateway: Complete Payment (UPI / Card)
    Gateway->>API: POST /api/v1/payments/webhook { status: 'CAPTURED', transactionId }
    API->>DB: UPDATE payments SET status='CAPTURED'
    API->>Queue: Enqueue Notification Job (SMS + Email alerts)
    Queue->>Doctor: SMS/Email: New Appointment Scheduled
    Queue->>Patient: SMS/Email: Booking & Video Room Link
```

---

## 4. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USERS ||--|| PROFILES : has
    USERS ||--o| DOCTORS : "registers as"
    USERS ||--o{ CONSULTATIONS : "books as patient"
    DOCTORS ||--o{ CONSULTATIONS : "conducts as doctor"
    DOCTORS ||--o{ AVAILABILITY_SLOTS : "publishes schedule"
    DOCTORS }|--|{ SPECIALTIES : "specializes in"
    CONSULTATIONS ||--o| PRESCRIPTIONS : "results in"
    CONSULTATIONS ||--o{ PAYMENTS : "billed via"
    USERS ||--o{ AUDIT_LOGS : "triggers actions"

    USERS {
        uuid id PK
        string email UK
        string password_hash
        user_role role "PATIENT | DOCTOR | ADMIN"
        string phone
        boolean is_mfa_enabled
        string mfa_secret
        boolean is_verified
        timestamp created_at
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        string first_name
        string last_name
        date date_of_birth
        string gender
        string blood_group
        text encrypted_medical_history "AES-256-GCM"
    }

    DOCTORS {
        uuid id PK
        uuid user_id FK
        string registration_number UK
        int experience_years
        string qualification
        numeric consultation_fee
        numeric rating
        int total_ratings
        text bio
        string_array languages
        boolean is_approved
    }

    SPECIALTIES {
        uuid id PK
        string name UK
        string slug UK
        text description
    }

    AVAILABILITY_SLOTS {
        uuid id PK
        uuid doctor_id FK
        date slot_date
        time start_time
        time end_time
        slot_status status "AVAILABLE | HELD | BOOKED | BLOCKED"
        timestamp held_until
        uuid held_by_patient_id FK
        int version "Optimistic lock counter"
    }

    CONSULTATIONS {
        uuid id PK
        timestamp scheduled_at PK "Partition Key (Range)"
        uuid doctor_id FK
        uuid patient_id FK
        uuid slot_id FK
        consultation_status status "REQUESTED | CONFIRMED | SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED"
        text encrypted_symptoms "AES-256-GCM"
        text encrypted_clinical_notes "AES-256-GCM"
        string video_room_url
        string cancellation_reason
    }

    PRESCRIPTIONS {
        uuid id PK
        uuid consultation_id UK
        uuid doctor_id FK
        uuid patient_id FK
        text encrypted_diagnosis "AES-256-GCM"
        jsonb medications "List of drugs, dosages, frequencies"
        text advice
        date follow_up_date
        string digital_signature "HMAC-SHA256"
    }

    PAYMENTS {
        uuid id PK
        uuid consultation_id FK
        uuid patient_id FK
        numeric amount
        string currency
        string payment_method
        string transaction_id
        payment_status status "PENDING | CAPTURED | FAILED | REFUNDED"
        string idempotency_key UK
    }

    AUDIT_LOGS {
        bigserial id PK
        timestamp timestamp PK "Partition Key (Range)"
        uuid user_id FK
        string action
        string resource_type
        string resource_id
        string ip_address
        text user_agent
        jsonb previous_state
        jsonb new_state
        string prev_hash "Chain link"
        string hash_signature "SHA-256 cryptographic signature"
    }
```

---

## 5. Scalability Strategy for 100k Daily Consultations

### 5.1 Throughput Mathematics
- **Daily Volume**: $100,000\text{ consultations/day}$.
- **Average Write Throughput**:
  $$\frac{100,000}{86,400\text{ s}} \approx 1.16\text{ consultations/sec}$$
- **Peak Write Throughput (Morning Burst 09:00 - 12:00)**:
  $$\approx 15 - 25\text{ writes/sec}$$
- **Read-to-Write Ratio**: Estimated $20:1$ (slot browsing, doctor catalog searches, profile views).
- **Peak Read Throughput**:
  $$25\text{ writes/sec} \times 20 \approx 500\text{ reads/sec}$$

A single Aurora PostgreSQL `db.r6g.xlarge` instance comfortably handles up to 8,000 queries/sec. Under this design, our capacity headroom exceeds peak load by **$16\times$**.

### 5.2 PostgreSQL Declarative Range Partitioning
At $100\text{k}$ consultations/day, the `consultations` table grows by **3,000,000 rows/month** ($\approx 1\text{ GB/month}$ including indexes).
- **Partitioning Strategy**: Range Partitioning by `scheduled_at` on monthly intervals (`consultations_2026_q1`, `consultations_2026_q2`, etc.).
- **Partition Pruning**: PostgreSQL automatically eliminates irrelevant table partitions at query planning time when `WHERE scheduled_at >= ...` is queried.
- **Audit Logs Partitioning**: The `audit_logs` table accumulates $\approx 5\text{M}$ entries/month and is partitioned quarterly by `timestamp`.

### 5.3 Caching & Concurrency Architecture
1. **Cache-Aside Pattern**:
   - `cache:doctors:search:<hash>`: Cached in Redis with a 5-minute TTL.
   - `cache:doctor:<id>`: Cached in Redis with a 10-minute TTL.
   - Invalidation: Cache entries are evicted immediately when an admin updates doctor status or doctors modify fees.
2. **Double-Booking Prevention (Hybrid Concurrency Model)**:
   - **Layer 1 (Distributed Mutex)**: Redis `SET lock:slot:<id> <token> NX PX 5000` serializes concurrent booking attempts for the same slot across all distributed API pods.
   - **Layer 2 (Database Optimistic Row Lock)**:
     ```sql
     UPDATE availability_slots
     SET status = 'HELD', held_until = NOW() + INTERVAL '15 minutes', held_by_patient_id = $1, version = version + 1
     WHERE id = $2 AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < NOW()))
     RETURNING *;
     ```
   - **Layer 3 (Database Constraint)**: Unique composite key on `(doctor_id, slot_date, start_time)` ensures duplicate slots can never be generated.

---

## 6. Distributed Sagas & Idempotency

### 6.1 Booking & Payment Saga Orchestration
The booking flow is managed as an orchestrated Saga:

```
[Start Saga]
   │
   ├─► Step 1: Hold Slot (Status: HELD, TTL: 15 min)
   │     └─► [Failure] ──► Return 409 Conflict (User picks another slot)
   │
   ├─► Step 2: Initialize Payment (Status: PENDING)
   │     └─► [Failure] ──► Compensating Tx: Release Slot to AVAILABLE
   │
   ├─► Step 3: Webhook Verification
   │     ├─► [Payment CAPTURED] ──► Confirm Consultation + Dispatch Notifications
   │     └─► [Payment FAILED]   ──► Compensating Tx: Release Slot + Cancel Consultation
   ▼
[End Saga]
```

### 6.2 Write Idempotency Pattern
All write endpoints (`POST /slots/hold`, `POST /consultations`, `POST /prescriptions`, `POST /payments`) accept the `Idempotency-Key: <UUID>` header:
1. **Processing Phase**: When a request arrives, the system registers the key in Redis with status `PROCESSING` and a 60-second processing TTL.
2. **Replay Phase**: If a duplicate request arrives with the exact same payload while `PROCESSING`, the client receives `409 Conflict`. If already `COMPLETED`, the stored HTTP status code and response payload are returned instantly with header `X-Idempotent-Replay: true`.
3. **Payload Mismatch Detection**: If a client reuses an idempotency key with a different body payload, the system rejects it with `422 Unprocessable Entity`.

---

## 7. Retry, Backoff & Dead Letter Queue (DLQ) Strategy

All background asynchronous operations (notifications, slot release triggers, analytics aggregation) run on **BullMQ**:
- **Backoff Algorithm**: Exponential backoff with jitter:
  $$T_{\text{delay}} = \min(T_{\text{base}} \times 2^{\text{attempt}} + \text{jitter}, T_{\text{max}})$$
- **Attempts**: 5 retries for external SMS/Email dispatches ($T_{\text{base}} = 2\text{s}$, max delay $60\text{s}$).
- **Dead Letter Queue (DLQ)**: Jobs failing after 5 attempts are automatically transitioned to `failed` state with the complete error stack. Alerts fire to Sentry/PagerDuty when DLQ depth exceeds 50 messages.

---

## 8. Backup & Disaster Recovery (DR) Strategy

| Parameter | Objective Target | Technical Implementation |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **< 5 minutes** | Continuous PostgreSQL Write-Ahead Log (WAL) archiving to encrypted AWS S3 via pgBackRest |
| **RTO (Recovery Time Objective)** | **< 15 minutes** | Aurora Multi-AZ automated failover (< 30s) + cross-region replica promotion (< 10 min) |

### DR Architecture:
1. **Primary Region (`ap-south-1` Mumbai)**: Active 3-node Aurora PostgreSQL cluster with 1 primary writer and 2 multi-AZ read replicas.
2. **Secondary Region (`ap-southeast-1` Singapore)**: Asynchronous cross-region Aurora read replica continuously streaming changes.
3. **Automated Snapshots**: Daily full snapshots at 02:00 UTC with 30-day retention and KMS copy-to-cold-storage policy.
4. **Disaster Drills**: Automated monthly restore validation drills spinning up a dry-run cluster in an isolated VPC.
