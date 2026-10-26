# Amrutam Telemedicine Backend - Security Checklist & Threat Model

---

## 1. Threat Modeling (STRIDE Methodology)

The system threat model has been formulated using the Microsoft **STRIDE** methodology tailored specifically to telemedicine and digital healthcare platforms:

| STRIDE Category | Threat Description | Attack Vector | Architecture Mitigation in Amrutam Backend |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Attacker impersonates an authorized doctor to issue illegal prescriptions or access patient health charts. | Stolen credentials, credential stuffing, session hijacking. | **MFA via TOTP (RFC 6238)** enforced for doctors and admins; short-lived signed JWT access tokens (1h) with HMAC-SHA256 digital signatures on all issued prescriptions. |
| **Tampering** | Malicious actor modifies medical clinical notes, prescription dosages, or deletes audit trail logs. | Man-in-the-Middle (MitM) attacks, SQL Injection, direct database manipulation. | **AES-256-GCM Authenticated Encryption** ensures ciphertext cannot be altered without auth tag mismatch; **tamper-evident SHA-256 cryptographic hash chain** for audit logs; strict parameterized queries. |
| **Repudiation** | Doctor claims they did not prescribe a contraindicated drug, or patient denies booking a consultation. | Disputed transactions, lack of non-repudiation proofs. | Every prescription generates a **deterministic HMAC-SHA256 digital signature** binding doctor ID, consultation ID, timestamp, and medication payload; immutable append-only audit trail. |
| **Information Disclosure** | Leakage of sensitive Patient Health Information (PHI) or personal identity records (PII). | Database dump compromise, insecure log files, unencrypted network sniffing. | **Field-Level Encryption (AES-256-GCM)** for symptoms, diagnoses, notes, and medical history; TLS 1.3 in transit; sensitive fields redacted in structured JSON logs. |
| **Denial of Service** | Volumetric HTTP floods or automated bots hoarding doctor availability slots. | Distributed botnets exhausting booking slots without paying. | **Redis sliding-window rate limiters** (20 req/min for booking, 15 req/min for auth); 15-minute slot hold with automatic background sweep expiration; Cloudflare WAF DDoS mitigation. |
| **Elevation of Privilege** | Normal patient invokes doctor/admin endpoints to approve doctors or view financial analytics. | Broken Object Level Authorization (BOLA / IDOR), parameter tampering. | **Role-Based Access Control (`authorizeRoles`)** middleware checks JWT roles (`PATIENT`, `DOCTOR`, `ADMIN`); consultation lookup verifies `patient_id` or `doctor_user_id` matches `req.user.id`. |

---

## 2. Attack Surface Analysis

```
                              ┌───────────────────────────────────┐
                              │     Internet / Public Clients     │
                              └─────────────────┬─────────────────┘
                                                │
                                       HTTPS / TLS 1.3
                                                │
                              ┌─────────────────▼─────────────────┐
                              │      Cloudflare Edge & WAF        │
                              └─────────────────┬─────────────────┘
                                                │
                                    mTLS / VPC Peered Ingress
                                                │
                              ┌─────────────────▼─────────────────┐
 [Attack Vector: Auth API] ──►│  Nginx Ingress (Rate Limit, DDoS) │
                              └─────────────────┬─────────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
┌────────▼────────┐                   ┌────────▼────────┐                   ┌────────▼────────┐
│   Public APIs   │                   │  Patient APIs   │                   │  Doctor & Admin │
│ - /auth/login   │                   │ - /slots/hold   │                   │ - /prescriptions│
│ - /auth/register│                   │ - /consultations│                   │ - /admin/*      │
│ - /doctors      │                   │ - /payments     │                   │                 │
└────────┬────────┘                   └────────┬────────┘                   └────────┬────────┘
         │                                      │                                      │
         └──────────────────────────────────────┼──────────────────────────────────────┘
                                                │
                               ┌────────────────▼────────────────┐
                               │     Internal VPC Private Subnet  │
                               │  - PostgreSQL 15 (AES Storage)  │
                               │  - Redis 7 (In-Memory Locks)    │
                               │  - AWS KMS Key Store            │
                               └─────────────────────────────────┘
```

---

## 3. Data Classification Framework

All data processed within Amrutam is categorized according to risk level and compliance mandates:

| Classification | Examples | Storage Standard | Encryption Standard | Retention Period |
| :--- | :--- | :--- | :--- | :--- |
| **Protected Health Info (PHI)** | Symptoms, Ayurvedic clinical notes, diagnoses, medications, past medical history. | Database (PostgreSQL) | **AES-256-GCM field-level encryption** with unique IV and 16-byte authentication tag per field. | 7 years (Telemedicine Practice Guidelines) |
| **Personally Identifiable Info (PII)** | Patient/Doctor full names, phone numbers, email addresses, dates of birth. | Database (PostgreSQL) | Encrypted at rest via AWS KMS (EBS / Aurora storage level); masked in system logs. | Duration of active account + 3 years |
| **Financial Data** | Payment amounts, UPI transaction IDs, gateway order IDs. | Database (PostgreSQL) | Storage-level AES-256; **Zero PCI DSS cardholder data** stored locally (delegated to Razorpay/Stripe). | 10 years (RBI / Tax compliance) |
| **Operational & Telemetry** | IP addresses, request latency, user agents, audit trails. | Partitioned tables & Prometheus | Immutable SHA-256 hash chaining for audit logs; partitioned by timestamp. | 3 years |

---

## 4. Cryptographic Architecture

### 4.1 PHI Field-Level Encryption (AES-256-GCM)
Sensitive fields (`encrypted_symptoms`, `encrypted_clinical_notes`, `encrypted_diagnosis`, `encrypted_medical_history`) are never stored as plaintext in PostgreSQL:
1. **Key Generation**: 256-bit (32-byte) cryptographically secure key managed via environment / KMS.
2. **Initialization Vector (IV)**: 16-byte cryptographically secure random bytes generated per field encryption via `crypto.randomBytes(16)`.
3. **Authentication Tag**: 16-byte GCM authentication tag verifying ciphertext integrity.
4. **Ciphertext Format**:
   $$\text{Payload} = \texttt{version} : \texttt{iv\_hex} : \texttt{authTag\_hex} : \texttt{ciphertext\_hex}$$
   Example: `v1:4a8b...:f10c...:39a1...`

### 4.2 Key Rotation Strategy
To support zero-downtime key rotation without bulk database re-encryption:
- Keys are versioned with a prefix (e.g., `v1`, `v2`, `v3`).
- The application decryptor inspects the version prefix and fetches the matching key from AWS KMS.
- New writes always encrypt with the latest key version (`v2`).
- A background maintenance script progressively reads old records (`v1`), decrypts them, and re-encrypts them with `v2`.

### 4.3 Tamper-Evident Audit Trails (Cryptographic Chaining)
Every clinical, authentication, and payment event writes to an append-only `audit_logs` table.
- Each record calculates a SHA-256 hash over:
  $$\text{Hash}_n = \text{SHA-256}(\text{Hash}_{n-1} \parallel \text{userId} \parallel \text{action} \parallel \text{resourceType} \parallel \text{resourceId} \parallel \text{timestamp} \parallel \text{oldState} \parallel \text{newState})$$
- **Integrity Verification API**: An automated endpoint (`GET /api/v1/admin/audit-logs/verify-integrity`) scans the audit log chain sequentially, detects any modified records, omitted rows, or chain discontinuities, and alerts administrators immediately.

---

## 5. OWASP Top 10 (2021) Mitigation Matrix

| OWASP Vulnerability | Risk Scenario | Implementation Mitigation in Amrutam Backend |
| :--- | :--- | :--- |
| **A01: Broken Access Control** | Patient attempts to read another patient's prescription or clinical notes. | Checked at service layer: `consultation.patient_id === req.user.id` or `consultation.doctor_user_id === req.user.id`. Unauthorized access triggers `ForbiddenError (403)`. |
| **A02: Cryptographic Failures** | Plaintext medical diagnosis leaked during database compromise. | AES-256-GCM authenticated encryption for all clinical fields; bcrypt (10 rounds) for passwords; TLS 1.3 in transit. |
| **A03: Injection** | SQL injection via doctor search query parameters or slot filters. | **Strict parameterized queries (`$1, $2, ...`)** on all SQL statements via `pg`; zero dynamic string concatenation in SQL. |
| **A04: Insecure Design** | Double-booking slots via high-frequency concurrent HTTP requests. | Redis distributed lock (`SET NX PX`) + PostgreSQL atomic `UPDATE ... WHERE status = 'AVAILABLE'` + unique composite index on slot date & start time. |
| **A05: Security Misconfiguration** | Verbose error stack traces leaked in HTTP responses. | Centralized `errorHandler` maps internal errors to operational response formats; stack traces are hidden from clients in production. |
| **A06: Vulnerable & Outdated Components** | Vulnerabilities in open-source npm dependencies. | Automated GitHub Actions CI workflow running `npm audit --audit-level=critical`; pinned dependency versions; minimal Docker base image (`node:20-slim`). |
| **A07: Identification & Auth Failures** | Brute-force attacks against doctor login credentials. | Sliding-window Redis rate limiter on `/auth/login` (15 req/min); RFC 6238 TOTP Multi-Factor Authentication with QR onboarding. |
| **A08: Software & Data Integrity Failures** | Tampering with digital prescriptions or idempotency request replays. | Digital HMAC-SHA256 doctor signature on prescriptions; SHA-256 request payload verification on idempotent write requests. |
| **A09: Security Logging & Monitoring Failures** | Suspicious privilege escalation attempts go unnoticed. | Immutable audit log capturing IP, user agent, actor, and state changes; Prometheus metrics counting failed auth attempts and 4xx/5xx spikes. |
| **A10: Server-Side Request Forgery (SSRF)** | Malicious webhook URL specified during payment processing. | Webhook endpoints do not make dynamic outbound HTTP requests to user-supplied URLs; signatures verified with fixed gateway secrets. |

---

## 6. Telemedicine Compliance Checklist

- [x] **Indian Telemedicine Practice Guidelines (2020)**: Digital prescriptions include doctor registration number, qualification, patient identification, diagnosis, and digital signature.
- [x] **DISHA (Digital Information Security in Healthcare Act)**: PHI encrypted at rest using industry-standard AES-256; patient consent logged in audit records.
- [x] **HIPAA Security Rule (45 CFR Part 160 & 164)**: Role-based access controls; transmission encryption via TLS 1.3; tamper-evident audit logging.
- [x] **Write Idempotency**: All write mutations accept `Idempotency-Key` preventing duplicate billing and duplicate appointment holds.
