# Backend Implementation Guide
## Colombian Small Business Booking Platform - MVP
### Complete Specification Document (No Code)

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Database Schema](#database-schema)
4. [Domain Layer](#domain-layer)
5. [Application Layer](#application-layer)
6. [Infrastructure Layer](#infrastructure-layer)
7. [API Layer](#api-layer)
8. [Implementation Order](#implementation-order)

---

## Project Overview

### Tech Stack
- **Framework:** FastAPI
- **Language:** Python 3.11+
- **Database:** PostgreSQL (via Supabase)
- **ORM:** SQLAlchemy 2.0
- **Migrations:** Alembic
- **Validation:** Pydantic v2
- **AI Agent:** LangGraph 1.0
- **LLM:** Claude (Anthropic)

### Architecture Pattern
- **Domain-Driven Design (DDD)**
- **Clean Architecture**
- **Repository Pattern**
- **CQRS (lightweight)**

---

## Directory Structure

```
backend/
├── main.py                          # FastAPI application entry point
│
├── core/                            # Core configuration and utilities
│   ├── __init__.py
│   ├── config.py                    # Settings and environment variables
│   ├── database.py                  # Database connection and session
│   ├── security.py                  # Authentication and encryption
│   ├── exceptions.py                # Custom exception classes
│   └── logging.py                   # Logging configuration
│
├── domain/                          # Domain layer (business entities)
│   ├── __init__.py
│   │
│   ├── tenant/
│   │   ├── __init__.py
│   │   ├── entity.py                # Tenant aggregate root
│   │   ├── value_objects.py         # WhatsAppConfig, CalComConfig, etc.
│   │   └── events.py                # Domain events
│   │
│   ├── booking/
│   │   ├── __init__.py
│   │   ├── entity.py                # Booking aggregate root
│   │   ├── value_objects.py         # BookingStatus, TimeSlot, etc.
│   │   └── events.py                # Domain events
│   │
│   ├── customer/
│   │   ├── __init__.py
│   │   ├── entity.py                # Customer entity
│   │   └── value_objects.py         # Phone, Email
│   │
│   ├── service/
│   │   ├── __init__.py
│   │   ├── entity.py                # Service entity
│   │   └── value_objects.py         # Duration, Price
│   │
│   └── conversation/
│       ├── __init__.py
│       ├── entity.py                # Conversation aggregate
│       ├── value_objects.py         # Message, ConversationState
│       └── events.py                # Domain events
│
├── application/                     # Application services (use cases)
│   ├── __init__.py
│   │
│   ├── tenant/
│   │   ├── __init__.py
│   │   ├── create_tenant.py         # CreateTenantUseCase
│   │   ├── update_tenant.py         # UpdateTenantUseCase
│   │   ├── get_tenant_by_slug.py    # GetTenantBySlugQuery
│   │   ├── connect_whatsapp.py      # ConnectWhatsAppUseCase
│   │   └── connect_calcom.py        # ConnectCalComUseCase
│   │
│   ├── booking/
│   │   ├── __init__.py
│   │   ├── create_booking.py        # CreateBookingUseCase
│   │   ├── approve_booking.py       # ApproveBookingUseCase
│   │   ├── reject_booking.py        # RejectBookingUseCase
│   │   ├── confirm_payment.py       # ConfirmPaymentUseCase
│   │   ├── cancel_booking.py        # CancelBookingUseCase
│   │   └── get_bookings.py          # GetBookingsQuery
│   │
│   ├── service/
│   │   ├── __init__.py
│   │   ├── create_service.py        # CreateServiceUseCase
│   │   ├── update_service.py        # UpdateServiceUseCase
│   │   ├── delete_service.py        # DeleteServiceUseCase
│   │   └── get_services.py          # GetServicesQuery
│   │
│   ├── customer/
│   │   ├── __init__.py
│   │   ├── create_or_update_customer.py  # CreateOrUpdateCustomerUseCase
│   │   └── get_customers.py         # GetCustomersQuery
│   │
│   ├── whatsapp/
│   │   ├── __init__.py
│   │   ├── process_incoming_message.py   # ProcessIncomingMessageUseCase
│   │   ├── send_message.py               # SendMessageUseCase
│   │   └── handle_webhook.py             # HandleWhatsAppWebhookUseCase
│   │
│   └── ai_agent/
│       ├── __init__.py
│       ├── langraph_orchestrator.py      # LangGraphOrchestrator
│       ├── intent_classifier.py          # IntentClassifierNode
│       ├── booking_agent.py              # BookingAgentNode
│       └── faq_agent.py                  # FAQAgentNode
│
├── infrastructure/                  # Infrastructure layer
│   ├── __init__.py
│   │
│   ├── persistence/                 # Database models and migrations
│   │   ├── __init__.py
│   │   ├── models.py                # SQLAlchemy models
│   │   └── migrations/              # Alembic migrations
│   │       ├── env.py
│   │       ├── script.py.mako
│   │       └── versions/
│   │
│   ├── repositories/                # Data access repositories
│   │   ├── __init__.py
│   │   ├── base_repository.py       # BaseRepository
│   │   ├── tenant_repository.py     # TenantRepository
│   │   ├── booking_repository.py    # BookingRepository
│   │   ├── service_repository.py    # ServiceRepository
│   │   ├── customer_repository.py   # CustomerRepository
│   │   └── conversation_repository.py  # ConversationRepository
│   │
│   └── external/                    # External service clients
│       ├── __init__.py
│       ├── meta_cloud_api.py        # MetaCloudAPIClient
│       ├── cal_com_api.py           # CalComAPIClient
│       ├── claude_api.py            # ClaudeAPIClient
│       └── storage_client.py        # StorageClient (R2/Supabase)
│
├── api/                             # API/Router layer
│   ├── __init__.py
│   ├── dependencies.py              # Dependency injection
│   ├── middlewares.py               # Custom middlewares
│   │
│   └── v1/                          # API version 1
│       ├── __init__.py
│       │
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── auth.py              # Authentication endpoints
│       │   ├── tenants.py           # Tenant CRUD endpoints
│       │   ├── bookings.py          # Booking CRUD endpoints
│       │   ├── services.py          # Service CRUD endpoints
│       │   ├── customers.py         # Customer endpoints
│       │   ├── conversations.py     # Conversation endpoints
│       │   └── webhooks.py          # Webhook receivers
│       │
│       └── schemas/                 # Pydantic request/response models
│           ├── __init__.py
│           ├── auth_schemas.py
│           ├── tenant_schemas.py
│           ├── booking_schemas.py
│           ├── service_schemas.py
│           ├── customer_schemas.py
│           ├── conversation_schemas.py
│           └── webhook_schemas.py
│
├── tests/                           # Test suites
│   ├── __init__.py
│   ├── conftest.py                  # Pytest fixtures
│   ├── unit/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── integration/
│   └── e2e/
│
├── alembic.ini                      # Alembic configuration
├── requirements.txt                 # Python dependencies
├── requirements-dev.txt             # Development dependencies
├── .env.example                     # Environment variables template
├── .gitignore
├── README.md
└── pyproject.toml                   # Project metadata
```

---

## Database Schema

### Table: `tenants`

**Purpose:** Store business (tenant) information and configuration

**Columns:**
- `id` (UUID, PK): Unique tenant identifier
- `slug` (VARCHAR, UNIQUE): URL-safe identifier for landing page
- `business_name` (VARCHAR): Business display name
- `description` (TEXT): Business description
- `email` (VARCHAR, UNIQUE): Business contact email
- `phone` (VARCHAR): Business phone number
- `whatsapp_phone_number` (VARCHAR): WhatsApp number
- `whatsapp_phone_number_id` (VARCHAR): Meta phone number ID
- `whatsapp_access_token` (TEXT): Meta access token (encrypted)
- `whatsapp_waba_id` (VARCHAR): WhatsApp Business Account ID
- `whatsapp_webhook_verify_token` (VARCHAR): Webhook verification token
- `calcom_api_key` (TEXT): Cal.com API key (encrypted)
- `calcom_username` (VARCHAR): Cal.com username
- `nequi_number` (VARCHAR): Nequi payment number
- `daviviplata_number` (VARCHAR): Daviviplata payment number
- `brand_settings` (JSONB): Brand customization (colors, logo, etc.)
- `status` (VARCHAR): active, suspended, inactive
- `onboarding_completed` (BOOLEAN): Onboarding completion flag
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_tenants_slug` on `slug`
- `idx_tenants_status` on `status`
- `idx_tenants_email` on `email`

**Constraints:**
- `slug` must match pattern: `^[a-z0-9-]+$`
- `email` must be valid email format

---

### Table: `services`

**Purpose:** Store services offered by each tenant

**Columns:**
- `id` (UUID, PK): Unique service identifier
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `name` (VARCHAR): Service name
- `description` (TEXT): Service description
- `duration_minutes` (INTEGER): Duration in minutes
- `price_amount` (DECIMAL): Price amount
- `price_currency` (VARCHAR): Currency code (default: COP)
- `calcom_event_type_id` (INTEGER): Linked Cal.com event type
- `display_order` (INTEGER): Sort order
- `is_active` (BOOLEAN): Active/inactive flag
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_services_tenant` on `tenant_id`
- `idx_services_active` on `(tenant_id, is_active)`

**Constraints:**
- `duration_minutes` > 0
- `price_amount` >= 0
- Cascade delete when tenant deleted

---

### Table: `customers`

**Purpose:** Store customer information per tenant

**Columns:**
- `id` (UUID, PK): Unique customer identifier
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `first_name` (VARCHAR): Customer first name
- `last_name` (VARCHAR): Customer last name
- `email` (VARCHAR): Customer email
- `phone` (VARCHAR): Customer phone (E.164 format)
- `whatsapp_optin` (BOOLEAN): WhatsApp messaging consent
- `whatsapp_optin_date` (TIMESTAMP): Consent date
- `source` (VARCHAR): Acquisition source (landing_page, whatsapp, etc.)
- `notes` (TEXT): Internal notes about customer
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_customers_tenant` on `tenant_id`
- `idx_customers_phone` on `(tenant_id, phone)`

**Constraints:**
- Unique `(tenant_id, phone)` - one customer per phone per tenant
- Cascade delete when tenant deleted

---

### Table: `bookings`

**Purpose:** Store all booking records

**Columns:**
- `id` (UUID, PK): Unique booking identifier
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `customer_id` (UUID, FK → customers.id): Customer who booked
- `service_id` (UUID, FK → services.id): Booked service
- `start_time` (TIMESTAMP WITH TIME ZONE): Booking start time
- `end_time` (TIMESTAMP WITH TIME ZONE): Booking end time
- `timezone` (VARCHAR): Timezone (default: America/Bogota)
- `status` (VARCHAR): Current booking status
  - Values: pending_approval, approved, pending_payment, confirmed, rejected, cancelled, completed
- `payment_screenshot_url` (TEXT): Payment proof URL
- `payment_verified` (BOOLEAN): Payment verification flag
- `payment_verified_at` (TIMESTAMP): Payment verification timestamp
- `payment_verified_by` (UUID): User who verified (future feature)
- `calcom_booking_id` (VARCHAR): Cal.com booking ID
- `calcom_booking_uid` (VARCHAR): Cal.com booking UID
- `source` (VARCHAR): Booking source (landing_page, whatsapp, direct)
- `customer_notes` (TEXT): Customer-provided notes
- `internal_notes` (TEXT): Internal staff notes
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_bookings_tenant` on `tenant_id`
- `idx_bookings_customer` on `customer_id`
- `idx_bookings_status` on `(tenant_id, status)`
- `idx_bookings_start_time` on `(tenant_id, start_time)`
- `idx_bookings_calcom` on `calcom_booking_uid`

**Constraints:**
- `end_time` > `start_time`
- Restrict delete when customer or service deleted

---

### Table: `booking_approvals`

**Purpose:** Track human-in-the-loop approval workflow

**Columns:**
- `id` (UUID, PK): Unique approval identifier
- `booking_id` (UUID, FK → bookings.id): Related booking
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `requested_action` (VARCHAR): create, modify, cancel
- `ai_suggested_data` (JSONB): AI agent's proposed action data
- `status` (VARCHAR): pending, approved, rejected
- `reviewed_at` (TIMESTAMP): Review timestamp
- `reviewed_by` (UUID): User who reviewed (future)
- `rejection_reason` (TEXT): Reason if rejected
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_approvals_booking` on `booking_id`
- `idx_approvals_pending` on `(tenant_id, status)`

**Constraints:**
- Cascade delete when booking deleted

---

### Table: `conversations`

**Purpose:** Store WhatsApp conversation threads

**Columns:**
- `id` (UUID, PK): Unique conversation identifier
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `customer_id` (UUID, FK → customers.id): Customer participant
- `customer_phone` (VARCHAR): Customer phone number
- `status` (VARCHAR): active, closed, archived
- `langraph_state` (JSONB): LangGraph agent state for resumption
- `langraph_checkpoint_id` (VARCHAR): Checkpoint identifier
- `last_message_at` (TIMESTAMP): Last message timestamp
- `service_window_expires_at` (TIMESTAMP): 24-hour window expiry
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_conversations_tenant` on `tenant_id`
- `idx_conversations_customer` on `customer_id`
- `idx_conversations_status` on `(tenant_id, status)`

**Constraints:**
- Unique `(tenant_id, customer_phone, status)` for active conversations
- Cascade delete when tenant deleted

---

### Table: `messages`

**Purpose:** Store individual WhatsApp messages

**Columns:**
- `id` (UUID, PK): Unique message identifier
- `conversation_id` (UUID, FK → conversations.id): Parent conversation
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `message_type` (VARCHAR): text, image, document, template
- `direction` (VARCHAR): inbound, outbound
- `text_content` (TEXT): Message text content
- `media_url` (TEXT): Media file URL
- `media_mime_type` (VARCHAR): Media MIME type
- `whatsapp_message_id` (VARCHAR): WhatsApp message ID
- `template_name` (VARCHAR): Template name (if template message)
- `template_language` (VARCHAR): Template language code
- `status` (VARCHAR): sent, delivered, read, failed
- `error_message` (TEXT): Error details if failed
- `created_at` (TIMESTAMP): Creation timestamp

**Indexes:**
- `idx_messages_conversation` on `conversation_id`
- `idx_messages_tenant` on `(tenant_id, created_at DESC)`
- `idx_messages_whatsapp_id` on `whatsapp_message_id`

**Constraints:**
- Cascade delete when conversation deleted

---

### Table: `auth_users`

**Purpose:** Store authenticated users (business owners)

**Columns:**
- `id` (UUID, PK): Unique user identifier
- `tenant_id` (UUID, FK → tenants.id): Associated tenant
- `email` (VARCHAR, UNIQUE): User email
- `hashed_password` (TEXT): Bcrypt hashed password
- `role` (VARCHAR): owner, staff (future)
- `is_active` (BOOLEAN): Active/inactive flag
- `email_verified` (BOOLEAN): Email verification flag
- `last_login_at` (TIMESTAMP): Last login timestamp
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- `idx_auth_users_email` on `email`
- `idx_auth_users_tenant` on `tenant_id`

**Constraints:**
- Cascade delete when tenant deleted

---

### Table: `media_files`

**Purpose:** Track uploaded media files

**Columns:**
- `id` (UUID, PK): Unique file identifier
- `tenant_id` (UUID, FK → tenants.id): Owner tenant
- `file_key` (VARCHAR): Storage key (R2/S3 key)
- `file_url` (TEXT): Public access URL
- `file_type` (VARCHAR): MIME type
- `file_size_bytes` (INTEGER): File size
- `entity_type` (VARCHAR): booking, tenant, message
- `entity_id` (UUID): Related entity ID
- `uploaded_by` (UUID): User who uploaded (future)
- `created_at` (TIMESTAMP): Upload timestamp

**Indexes:**
- `idx_media_tenant` on `tenant_id`
- `idx_media_entity` on `(entity_type, entity_id)`

**Constraints:**
- Cascade delete when tenant deleted

---

## Domain Layer

### Domain: Tenant

#### Entity: `Tenant`

**Description:** Aggregate root representing a business/tenant

**Attributes:**
- `id`: Unique identifier
- `slug`: URL-safe slug
- `business_name`: Business name
- `description`: Business description
- `email`: Contact email
- `phone`: Contact phone
- `whatsapp_config`: WhatsAppConfig value object
- `calcom_config`: CalComConfig value object
- `payment_config`: PaymentConfig value object
- `brand_settings`: BrandSettings value object
- `status`: TenantStatus enum
- `onboarding_completed`: Boolean flag
- `created_at`: Creation timestamp
- `updated_at`: Update timestamp

**Methods:**
- `update_business_info(name, description, phone)`: Update basic info
- `connect_whatsapp(config)`: Connect WhatsApp Business API
- `disconnect_whatsapp()`: Disconnect WhatsApp
- `connect_calcom(config)`: Connect Cal.com
- `update_payment_config(config)`: Update payment information
- `update_brand_settings(settings)`: Update brand customization
- `complete_onboarding()`: Mark onboarding as complete
- `activate()`: Activate tenant
- `suspend()`: Suspend tenant
- `is_whatsapp_connected()`: Check WhatsApp connection status
- `is_calcom_connected()`: Check Cal.com connection status

**Business Rules:**
- Slug must be unique across all tenants
- WhatsApp configuration required before receiving messages
- Cal.com configuration required before calendar bookings
- Cannot be activated without completing onboarding

---

#### Value Object: `WhatsAppConfig`

**Description:** WhatsApp Business API configuration

**Attributes:**
- `phone_number`: WhatsApp phone number
- `phone_number_id`: Meta phone number ID
- `access_token`: Access token (encrypted)
- `waba_id`: WhatsApp Business Account ID
- `webhook_verify_token`: Webhook verification token

**Methods:**
- `is_valid()`: Validate all required fields present
- `encrypt_token()`: Encrypt access token
- `decrypt_token()`: Decrypt access token

---

#### Value Object: `CalComConfig`

**Description:** Cal.com integration configuration

**Attributes:**
- `api_key`: Cal.com API key (encrypted)
- `username`: Cal.com username

**Methods:**
- `is_valid()`: Validate configuration
- `encrypt_api_key()`: Encrypt API key
- `decrypt_api_key()`: Decrypt API key

---

#### Value Object: `PaymentConfig`

**Description:** Payment information

**Attributes:**
- `nequi_number`: Nequi phone number
- `daviviplata_number`: Daviviplata payment number

**Methods:**
- `is_valid()`: Validate at least one payment method present

---

#### Value Object: `BrandSettings`

**Description:** Brand customization settings

**Attributes:**
- `primary_color`: Hex color code
- `logo_url`: Logo image URL
- `cover_image_url`: Cover image URL
- `font_family`: Font family name

**Methods:**
- `get_default()`: Return default brand settings
- `validate_color(color)`: Validate hex color format

---

#### Events:
- `TenantCreated`: Fired when tenant is created
- `TenantUpdated`: Fired when tenant info updated
- `WhatsAppConnected`: Fired when WhatsApp connected
- `WhatsAppDisconnected`: Fired when WhatsApp disconnected
- `CalComConnected`: Fired when Cal.com connected
- `OnboardingCompleted`: Fired when onboarding complete

---

### Domain: Booking

#### Entity: `Booking`

**Description:** Aggregate root representing a booking

**Attributes:**
- `id`: Unique identifier
- `tenant_id`: Owner tenant ID
- `customer_id`: Customer ID
- `service_id`: Service ID
- `time_slot`: TimeSlot value object
- `status`: BookingStatus enum
- `payment_proof`: PaymentProof value object (optional)
- `calcom_booking_uid`: Cal.com booking UID
- `source`: BookingSource enum
- `customer_notes`: Customer notes
- `internal_notes`: Internal notes
- `created_at`: Creation timestamp
- `updated_at`: Update timestamp

**Methods:**
- `request_approval()`: Submit booking for approval
- `approve()`: Approve booking (business owner)
- `reject(reason)`: Reject booking
- `upload_payment_proof(url)`: Upload payment screenshot
- `verify_payment()`: Verify payment received
- `confirm()`: Confirm booking (after payment)
- `cancel(reason)`: Cancel booking
- `complete()`: Mark as completed (after service delivered)
- `reschedule(new_time_slot)`: Change booking time
- `add_internal_note(note)`: Add staff note
- `is_within_modification_window()`: Check if can be modified
- `calculate_duration()`: Calculate booking duration

**Business Rules:**
- Booking requires approval before Cal.com event creation
- Payment must be verified before status = confirmed
- Cannot modify booking within 24 hours of start time
- Cannot cancel confirmed booking without owner permission
- Time slot cannot overlap with existing confirmed bookings

---

#### Value Object: `TimeSlot`

**Description:** Booking time information

**Attributes:**
- `start_time`: Start datetime (timezone-aware)
- `end_time`: End datetime (timezone-aware)
- `timezone`: Timezone string

**Methods:**
- `is_valid()`: Validate end > start
- `overlaps_with(other_slot)`: Check overlap with another slot
- `duration_minutes()`: Calculate duration in minutes
- `to_local_time(timezone)`: Convert to specific timezone
- `is_in_future()`: Check if slot is in future

---

#### Value Object: `PaymentProof`

**Description:** Payment verification information

**Attributes:**
- `screenshot_url`: URL to payment screenshot
- `upload_timestamp`: When uploaded
- `verified`: Verification status
- `verified_at`: When verified
- `verified_by`: Who verified (user ID)

**Methods:**
- `mark_verified(user_id)`: Mark as verified
- `is_verified()`: Check verification status

---

#### Enum: `BookingStatus`

**Values:**
- `PENDING_APPROVAL`: Waiting for owner approval
- `APPROVED`: Owner approved, awaiting payment
- `PENDING_PAYMENT`: Payment screenshot uploaded
- `CONFIRMED`: Payment verified, booking confirmed
- `REJECTED`: Owner rejected booking
- `CANCELLED`: Booking cancelled
- `COMPLETED`: Service delivered

---

#### Enum: `BookingSource`

**Values:**
- `LANDING_PAGE`: Booked via landing page
- `WHATSAPP`: Booked via WhatsApp
- `DIRECT`: Manually created

---

#### Events:
- `BookingRequested`: Fired when booking submitted
- `BookingApprovalPending`: Fired when needs approval
- `BookingApproved`: Fired when approved
- `BookingRejected`: Fired when rejected
- `PaymentProofUploaded`: Fired when payment uploaded
- `PaymentVerified`: Fired when payment verified
- `BookingConfirmed`: Fired when fully confirmed
- `BookingCancelled`: Fired when cancelled

---

### Domain: Customer

#### Entity: `Customer`

**Description:** Customer entity

**Attributes:**
- `id`: Unique identifier
- `tenant_id`: Owner tenant ID
- `first_name`: First name
- `last_name`: Last name
- `email`: Email value object
- `phone`: Phone value object
- `whatsapp_optin`: WhatsApp consent
- `whatsapp_optin_date`: Consent timestamp
- `source`: CustomerSource enum
- `notes`: Internal notes
- `created_at`: Creation timestamp
- `updated_at`: Update timestamp

**Methods:**
- `update_info(first_name, last_name, email)`: Update customer info
- `grant_whatsapp_optin()`: Grant WhatsApp messaging consent
- `revoke_whatsapp_optin()`: Revoke consent
- `full_name()`: Get formatted full name
- `add_note(note)`: Add internal note
- `can_receive_whatsapp_marketing()`: Check marketing eligibility

**Business Rules:**
- Phone number must be unique per tenant
- WhatsApp opt-in required for marketing messages
- Email optional but recommended

---

#### Value Object: `Phone`

**Description:** Phone number in E.164 format

**Attributes:**
- `number`: Phone number string

**Methods:**
- `is_valid()`: Validate E.164 format
- `format_display()`: Format for display
- `country_code()`: Extract country code

---

#### Value Object: `Email`

**Description:** Email address

**Attributes:**
- `address`: Email address string

**Methods:**
- `is_valid()`: Validate email format
- `domain()`: Extract domain

---

#### Enum: `CustomerSource`

**Values:**
- `LANDING_PAGE`: Came from landing page
- `WHATSAPP`: First contact via WhatsApp
- `REFERRAL`: Referred by another customer

---

### Domain: Service

#### Entity: `Service`

**Description:** Service offered by tenant

**Attributes:**
- `id`: Unique identifier
- `tenant_id`: Owner tenant ID
- `name`: Service name
- `description`: Service description
- `duration`: Duration value object
- `price`: Price value object
- `calcom_event_type_id`: Linked Cal.com event type
- `display_order`: Sort order
- `is_active`: Active flag
- `created_at`: Creation timestamp
- `updated_at`: Update timestamp

**Methods:**
- `update_info(name, description)`: Update service info
- `update_duration(minutes)`: Update duration
- `update_price(amount, currency)`: Update price
- `link_calcom_event(event_type_id)`: Link to Cal.com
- `activate()`: Activate service
- `deactivate()`: Deactivate service
- `reorder(new_order)`: Change display order

**Business Rules:**
- Duration must be between 15 minutes and 8 hours
- Price must be non-negative
- Name must be unique per tenant

---

#### Value Object: `Duration`

**Description:** Service duration

**Attributes:**
- `minutes`: Duration in minutes

**Methods:**
- `is_valid()`: Validate duration range
- `format_display()`: Format as "1 hour 30 min"
- `to_hours()`: Convert to hours

---

#### Value Object: `Price`

**Description:** Service price

**Attributes:**
- `amount`: Price amount (decimal)
- `currency`: Currency code (ISO 4217)

**Methods:**
- `is_valid()`: Validate non-negative
- `format_display()`: Format as "50,000 COP"

---

### Domain: Conversation

#### Entity: `Conversation`

**Description:** WhatsApp conversation aggregate

**Attributes:**
- `id`: Unique identifier
- `tenant_id`: Owner tenant ID
- `customer_id`: Customer ID
- `customer_phone`: Customer phone
- `status`: ConversationStatus enum
- `messages`: List of Message value objects
- `langraph_state`: LangGraph state (JSON)
- `langraph_checkpoint_id`: Checkpoint ID
- `last_message_at`: Last message timestamp
- `service_window_expires_at`: 24h window expiry
- `created_at`: Creation timestamp
- `updated_at`: Update timestamp

**Methods:**
- `add_message(message)`: Add message to conversation
- `close()`: Close conversation
- `archive()`: Archive conversation
- `reopen()`: Reopen closed conversation
- `update_langraph_state(state, checkpoint_id)`: Update agent state
- `is_service_window_open()`: Check if 24h window active
- `extend_service_window()`: Extend service window (on customer message)
- `get_message_history(limit)`: Get recent messages

**Business Rules:**
- Only one active conversation per customer per tenant
- Service window is 24 hours from last customer message
- Closed conversations cannot receive new messages

---

#### Value Object: `Message`

**Description:** Individual message

**Attributes:**
- `message_type`: MessageType enum
- `direction`: MessageDirection enum
- `text_content`: Message text
- `media_url`: Media file URL
- `whatsapp_message_id`: WhatsApp ID
- `status`: MessageStatus enum
- `timestamp`: Message timestamp

**Methods:**
- `is_inbound()`: Check if customer message
- `is_outbound()`: Check if business message
- `has_media()`: Check if contains media

---

#### Enum: `MessageType`

**Values:**
- `TEXT`: Plain text message
- `IMAGE`: Image message
- `DOCUMENT`: Document message
- `TEMPLATE`: Template message

---

#### Enum: `MessageDirection`

**Values:**
- `INBOUND`: Customer to business
- `OUTBOUND`: Business to customer

---

#### Enum: `MessageStatus`

**Values:**
- `SENT`: Sent to WhatsApp
- `DELIVERED`: Delivered to customer
- `READ`: Read by customer
- `FAILED`: Failed to send

---

#### Enum: `ConversationStatus`

**Values:**
- `ACTIVE`: Currently active
- `CLOSED`: Closed (24h expired)
- `ARCHIVED`: Archived by user

---

#### Events:
- `ConversationStarted`: Fired when conversation created
- `MessageReceived`: Fired on inbound message
- `MessageSent`: Fired on outbound message
- `ConversationClosed`: Fired when closed
- `ConversationArchived`: Fired when archived

---

## Application Layer

### Use Cases: Tenant

#### Class: `CreateTenantUseCase`

**Description:** Handle tenant registration

**Dependencies:**
- `TenantRepository`

**Method: `execute(data)`**

**Parameters:**
- `data`: TenantCreateData (slug, business_name, email, password)

**Steps:**
1. Validate slug availability
2. Validate email uniqueness
3. Create Tenant entity
4. Generate default brand settings
5. Save to repository
6. Create auth user
7. Emit TenantCreated event
8. Return tenant

**Returns:** Created Tenant entity

**Raises:**
- `SlugAlreadyExistsError`
- `EmailAlreadyExistsError`
- `ValidationError`

---

#### Class: `UpdateTenantUseCase`

**Description:** Update tenant information

**Dependencies:**
- `TenantRepository`

**Method: `execute(tenant_id, data)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `data`: TenantUpdateData (business_name, description, phone, brand_settings)

**Steps:**
1. Load tenant from repository
2. Validate tenant exists
3. Update entity attributes
4. Validate business rules
5. Save to repository
6. Emit TenantUpdated event
7. Return updated tenant

**Returns:** Updated Tenant entity

**Raises:**
- `TenantNotFoundError`
- `ValidationError`

---

#### Class: `GetTenantBySlugQuery`

**Description:** Retrieve tenant by slug (for landing pages)

**Dependencies:**
- `TenantRepository`

**Method: `execute(slug)`**

**Parameters:**
- `slug`: Tenant slug

**Steps:**
1. Query repository by slug
2. Check if exists
3. Return tenant with services

**Returns:** Tenant entity or None

**Raises:**
- None (returns None if not found)

---

#### Class: `ConnectWhatsAppUseCase`

**Description:** Connect WhatsApp Business API

**Dependencies:**
- `TenantRepository`
- `MetaCloudAPIClient`

**Method: `execute(tenant_id, whatsapp_config)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `whatsapp_config`: WhatsAppConfig data

**Steps:**
1. Load tenant from repository
2. Validate config with Meta API
3. Subscribe to webhooks
4. Update tenant with config
5. Save to repository
6. Emit WhatsAppConnected event
7. Return success

**Returns:** Updated Tenant entity

**Raises:**
- `TenantNotFoundError`
- `InvalidWhatsAppConfigError`
- `MetaAPIError`

---

#### Class: `ConnectCalComUseCase`

**Description:** Connect Cal.com integration

**Dependencies:**
- `TenantRepository`
- `CalComAPIClient`

**Method: `execute(tenant_id, calcom_config)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `calcom_config`: CalComConfig data

**Steps:**
1. Load tenant from repository
2. Validate API key with Cal.com
3. Fetch available event types
4. Update tenant with config
5. Save to repository
6. Emit CalComConnected event
7. Return event types

**Returns:** Tuple (Updated Tenant, List of event types)

**Raises:**
- `TenantNotFoundError`
- `InvalidCalComAPIKeyError`
- `CalComAPIError`

---

### Use Cases: Booking

#### Class: `CreateBookingUseCase`

**Description:** Create a new booking

**Dependencies:**
- `BookingRepository`
- `CustomerRepository`
- `ServiceRepository`
- `TenantRepository`

**Method: `execute(data)`**

**Parameters:**
- `data`: BookingCreateData (tenant_id, customer_info, service_id, time_slot, source)

**Steps:**
1. Validate tenant exists
2. Validate service exists and active
3. Create or update customer
4. Validate time slot available
5. Create Booking entity (status: PENDING_APPROVAL)
6. Save to repository
7. Create BookingApproval record
8. Emit BookingRequested event
9. Notify tenant owner
10. Return booking

**Returns:** Created Booking entity

**Raises:**
- `TenantNotFoundError`
- `ServiceNotFoundError`
- `TimeSlotNotAvailableError`
- `ValidationError`

---

#### Class: `ApproveBookingUseCase`

**Description:** Approve a booking (Human-in-the-Loop)

**Dependencies:**
- `BookingRepository`
- `CalComAPIClient`
- `WhatsAppService`

**Method: `execute(booking_id, approved_by)`**

**Parameters:**
- `booking_id`: Booking UUID
- `approved_by`: User ID (future)

**Steps:**
1. Load booking from repository
2. Validate status is PENDING_APPROVAL
3. Create Cal.com event via API
4. Update booking status to APPROVED
5. Store Cal.com booking UID
6. Save to repository
7. Update approval record
8. Send WhatsApp confirmation to customer
9. Emit BookingApproved event
10. Return booking

**Returns:** Approved Booking entity

**Raises:**
- `BookingNotFoundError`
- `InvalidBookingStatusError`
- `CalComAPIError`

---

#### Class: `RejectBookingUseCase`

**Description:** Reject a booking

**Dependencies:**
- `BookingRepository`
- `WhatsAppService`

**Method: `execute(booking_id, reason, rejected_by)`**

**Parameters:**
- `booking_id`: Booking UUID
- `reason`: Rejection reason
- `rejected_by`: User ID (future)

**Steps:**
1. Load booking from repository
2. Validate status is PENDING_APPROVAL
3. Update booking status to REJECTED
4. Save to repository
5. Update approval record
6. Send WhatsApp notification to customer
7. Emit BookingRejected event
8. Return booking

**Returns:** Rejected Booking entity

**Raises:**
- `BookingNotFoundError`
- `InvalidBookingStatusError`

---

#### Class: `ConfirmPaymentUseCase`

**Description:** Verify payment and confirm booking

**Dependencies:**
- `BookingRepository`
- `WhatsAppService`

**Method: `execute(booking_id, verified_by)`**

**Parameters:**
- `booking_id`: Booking UUID
- `verified_by`: User ID who verified

**Steps:**
1. Load booking from repository
2. Validate status is PENDING_PAYMENT
3. Validate payment proof exists
4. Mark payment as verified
5. Update booking status to CONFIRMED
6. Save to repository
7. Send WhatsApp confirmation to customer
8. Emit BookingConfirmed event
9. Return booking

**Returns:** Confirmed Booking entity

**Raises:**
- `BookingNotFoundError`
- `InvalidBookingStatusError`
- `NoPaymentProofError`

---

#### Class: `CancelBookingUseCase`

**Description:** Cancel a booking

**Dependencies:**
- `BookingRepository`
- `CalComAPIClient`
- `WhatsAppService`

**Method: `execute(booking_id, reason, cancelled_by)`**

**Parameters:**
- `booking_id`: Booking UUID
- `reason`: Cancellation reason
- `cancelled_by`: Who cancelled (customer or owner)

**Steps:**
1. Load booking from repository
2. Validate can be cancelled
3. Cancel Cal.com event if exists
4. Update booking status to CANCELLED
5. Save to repository
6. Send WhatsApp notification
7. Emit BookingCancelled event
8. Return booking

**Returns:** Cancelled Booking entity

**Raises:**
- `BookingNotFoundError`
- `CannotCancelBookingError`

---

#### Class: `GetBookingsQuery`

**Description:** Retrieve bookings with filters

**Dependencies:**
- `BookingRepository`

**Method: `execute(tenant_id, filters, pagination)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `filters`: BookingFilters (status, date_from, date_to, customer_id)
- `pagination`: PaginationParams (page, page_size)

**Steps:**
1. Validate tenant exists
2. Build query with filters
3. Apply pagination
4. Execute query
5. Return results with metadata

**Returns:** PaginatedBookingList (items, total, page, page_size)

**Raises:**
- `TenantNotFoundError`

---

### Use Cases: Service

#### Class: `CreateServiceUseCase`

**Description:** Create a new service

**Dependencies:**
- `ServiceRepository`
- `TenantRepository`

**Method: `execute(tenant_id, data)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `data`: ServiceCreateData (name, description, duration_minutes, price_amount, calcom_event_type_id)

**Steps:**
1. Validate tenant exists
2. Validate service name unique for tenant
3. Create Service entity
4. Validate business rules (duration, price)
5. Save to repository
6. Return service

**Returns:** Created Service entity

**Raises:**
- `TenantNotFoundError`
- `ServiceNameExistsError`
- `ValidationError`

---

#### Class: `UpdateServiceUseCase`

**Description:** Update existing service

**Dependencies:**
- `ServiceRepository`

**Method: `execute(service_id, data)`**

**Parameters:**
- `service_id`: Service UUID
- `data`: ServiceUpdateData

**Steps:**
1. Load service from repository
2. Validate service exists
3. Update entity attributes
4. Validate business rules
5. Save to repository
6. Return service

**Returns:** Updated Service entity

**Raises:**
- `ServiceNotFoundError`
- `ValidationError`

---

#### Class: `DeleteServiceUseCase`

**Description:** Delete (deactivate) a service

**Dependencies:**
- `ServiceRepository`
- `BookingRepository`

**Method: `execute(service_id)`**

**Parameters:**
- `service_id`: Service UUID

**Steps:**
1. Load service from repository
2. Check for active bookings
3. Deactivate service (soft delete)
4. Save to repository
5. Return success

**Returns:** Boolean success

**Raises:**
- `ServiceNotFoundError`
- `ServiceHasActiveBookingsError`

---

#### Class: `GetServicesQuery`

**Description:** Get tenant's services

**Dependencies:**
- `ServiceRepository`

**Method: `execute(tenant_id, active_only)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `active_only`: Boolean flag

**Steps:**
1. Query repository by tenant
2. Filter by active status if needed
3. Sort by display_order
4. Return services

**Returns:** List of Service entities

**Raises:**
- None

---

### Use Cases: Customer

#### Class: `CreateOrUpdateCustomerUseCase`

**Description:** Create new customer or update existing

**Dependencies:**
- `CustomerRepository`

**Method: `execute(tenant_id, customer_data)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `customer_data`: CustomerData (phone, first_name, last_name, email)

**Steps:**
1. Check if customer exists by phone
2. If exists, update information
3. If not, create new customer
4. Save to repository
5. Return customer

**Returns:** Customer entity

**Raises:**
- `ValidationError`

---

#### Class: `GetCustomersQuery`

**Description:** Get tenant's customers

**Dependencies:**
- `CustomerRepository`

**Method: `execute(tenant_id, filters, pagination)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `filters`: CustomerFilters (search, source)
- `pagination`: PaginationParams

**Steps:**
1. Build query with filters
2. Apply pagination
3. Execute query
4. Return results

**Returns:** PaginatedCustomerList

**Raises:**
- None

---

### Use Cases: WhatsApp

#### Class: `HandleWhatsAppWebhookUseCase`

**Description:** Process incoming WhatsApp webhook

**Dependencies:**
- `TenantRepository`
- `ConversationRepository`
- `ProcessIncomingMessageUseCase`

**Method: `execute(payload)`**

**Parameters:**
- `payload`: Webhook payload from Meta

**Steps:**
1. Verify webhook signature
2. Extract phone_number_id
3. Find tenant by phone_number_id
4. Extract message data
5. Delegate to ProcessIncomingMessageUseCase
6. Return 200 OK immediately (async processing)

**Returns:** Success acknowledgment

**Raises:**
- `InvalidWebhookSignatureError`
- `TenantNotFoundError`

---

#### Class: `ProcessIncomingMessageUseCase`

**Description:** Process customer message (async)

**Dependencies:**
- `ConversationRepository`
- `CustomerRepository`
- `LangGraphOrchestrator`
- `SendMessageUseCase`

**Method: `execute(tenant_id, customer_phone, message_data)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `customer_phone`: Customer phone
- `message_data`: Message content

**Steps:**
1. Get or create customer
2. Get or create conversation
3. Add message to conversation
4. Extend service window (24h)
5. Pass to LangGraph orchestrator
6. Get agent response
7. Send response via WhatsApp
8. Update conversation state
9. Save to repository

**Returns:** None (async)

**Raises:**
- Various (logged, not raised)

---

#### Class: `SendMessageUseCase`

**Description:** Send message via WhatsApp

**Dependencies:**
- `MetaCloudAPIClient`
- `ConversationRepository`

**Method: `execute(tenant_id, customer_phone, message_content, message_type)`**

**Parameters:**
- `tenant_id`: Tenant UUID
- `customer_phone`: Recipient phone
- `message_content`: Message text or template data
- `message_type`: MessageType enum

**Steps:**
1. Load tenant config
2. Validate WhatsApp connected
3. Send via Meta Cloud API
4. Get message ID
5. Store message in conversation
6. Update conversation timestamp
7. Return message

**Returns:** Message entity

**Raises:**
- `WhatsAppNotConnectedError`
- `MetaAPIError`

---

### Use Cases: AI Agent

#### Class: `LangGraphOrchestrator`

**Description:** Orchestrate LangGraph agent execution

**Dependencies:**
- `IntentClassifierNode`
- `BookingAgentNode`
- `FAQAgentNode`
- `ConversationRepository`
- `BookingRepository`

**Method: `execute(conversation_id, message_text)`**

**Parameters:**
- `conversation_id`: Conversation UUID
- `message_text`: Customer message

**Steps:**
1. Load conversation with state
2. Initialize or resume LangGraph
3. Add message to graph state
4. Execute state machine
5. Handle human-in-the-loop checkpoints
6. Generate response
7. Save graph state
8. Return response

**Returns:** AgentResponse (text, requires_approval, suggested_action)

**Raises:**
- `ConversationNotFoundError`
- `LangGraphError`

---

#### Class: `IntentClassifierNode`

**Description:** Classify customer intent

**Dependencies:**
- `ClaudeAPIClient`

**Method: `execute(state)`**

**Parameters:**
- `state`: LangGraph state

**Steps:**
1. Extract message and context
2. Build classification prompt
3. Call Claude API
4. Parse intent (BOOK, MODIFY, CANCEL, FAQ, ESCALATE)
5. Update state with intent
6. Return state

**Returns:** Updated state

**Raises:**
- `ClaudeAPIError`

---

#### Class: `BookingAgentNode`

**Description:** Handle booking-related actions

**Dependencies:**
- `BookingRepository`
- `ServiceRepository`
- `CalComAPIClient`
- `ClaudeAPIClient`

**Method: `execute(state)`**

**Parameters:**
- `state`: LangGraph state

**Steps:**
1. Extract intent and parameters
2. If BOOK:
   - Check availability
   - Suggest time slots
   - Create booking (pending approval)
   - Return to human checkpoint
3. If MODIFY:
   - Load existing booking
   - Propose changes
   - Return to human checkpoint
4. If CANCEL:
   - Load existing booking
   - Request confirmation
   - Return to human checkpoint
5. Update state
6. Return state

**Returns:** Updated state

**Raises:**
- Various (handled in orchestrator)

---

#### Class: `FAQAgentNode`

**Description:** Answer frequently asked questions

**Dependencies:**
- `ClaudeAPIClient`
- `TenantRepository`

**Method: `execute(state)`**

**Parameters:**
- `state`: LangGraph state

**Steps:**
1. Extract question
2. Load tenant FAQ knowledge
3. Build answer prompt
4. Call Claude API
5. Format response
6. Update state
7. Return state

**Returns:** Updated state

**Raises:**
- `ClaudeAPIError`

---

## Infrastructure Layer

### Repositories

#### Class: `BaseRepository`

**Description:** Base repository with common operations

**Dependencies:**
- `SQLAlchemy Session`

**Methods:**

**`get_by_id(entity_id)`**
- Parameters: entity_id (UUID)
- Returns: Entity or None
- Description: Retrieve entity by ID

**`get_all(filters, pagination)`**
- Parameters: filters (dict), pagination (PaginationParams)
- Returns: Paginated list
- Description: Get all entities with filters

**`add(entity)`**
- Parameters: entity (Domain entity)
- Returns: Saved entity
- Description: Add new entity

**`update(entity)`**
- Parameters: entity (Domain entity)
- Returns: Updated entity
- Description: Update existing entity

**`delete(entity_id)`**
- Parameters: entity_id (UUID)
- Returns: Boolean success
- Description: Delete entity

**`commit()`**
- Description: Commit transaction

**`rollback()`**
- Description: Rollback transaction

---

#### Class: `TenantRepository`

**Description:** Repository for Tenant aggregate

**Inherits:** BaseRepository

**Additional Methods:**

**`get_by_slug(slug)`**
- Parameters: slug (string)
- Returns: Tenant or None
- Description: Find tenant by slug

**`get_by_email(email)`**
- Parameters: email (string)
- Returns: Tenant or None
- Description: Find tenant by email

**`get_by_whatsapp_phone_number_id(phone_number_id)`**
- Parameters: phone_number_id (string)
- Returns: Tenant or None
- Description: Find tenant by WhatsApp phone number ID

**`slug_exists(slug)`**
- Parameters: slug (string)
- Returns: Boolean
- Description: Check if slug already taken

**`email_exists(email)`**
- Parameters: email (string)
- Returns: Boolean
- Description: Check if email already registered

---

#### Class: `BookingRepository`

**Description:** Repository for Booking aggregate

**Inherits:** BaseRepository

**Additional Methods:**

**`get_by_tenant(tenant_id, filters, pagination)`**
- Parameters: tenant_id, filters, pagination
- Returns: Paginated bookings
- Description: Get bookings for tenant with filters

**`get_by_customer(customer_id)`**
- Parameters: customer_id (UUID)
- Returns: List of bookings
- Description: Get customer's booking history

**`get_by_status(tenant_id, status)`**
- Parameters: tenant_id, status
- Returns: List of bookings
- Description: Get bookings by status

**`get_pending_approvals(tenant_id)`**
- Parameters: tenant_id (UUID)
- Returns: List of bookings
- Description: Get bookings needing approval

**`check_time_slot_available(tenant_id, service_id, time_slot)`**
- Parameters: tenant_id, service_id, time_slot
- Returns: Boolean
- Description: Check if time slot is free

**`get_overlapping_bookings(tenant_id, time_slot)`**
- Parameters: tenant_id, time_slot
- Returns: List of bookings
- Description: Find overlapping confirmed bookings

**`get_by_calcom_uid(calcom_uid)`**
- Parameters: calcom_uid (string)
- Returns: Booking or None
- Description: Find booking by Cal.com UID

---

#### Class: `ServiceRepository`

**Description:** Repository for Service entity

**Inherits:** BaseRepository

**Additional Methods:**

**`get_by_tenant(tenant_id, active_only)`**
- Parameters: tenant_id, active_only (bool)
- Returns: List of services
- Description: Get tenant's services

**`get_active_services(tenant_id)`**
- Parameters: tenant_id (UUID)
- Returns: List of services
- Description: Get only active services

**`name_exists(tenant_id, name)`**
- Parameters: tenant_id, name
- Returns: Boolean
- Description: Check if service name exists for tenant

**`reorder(service_ids)`**
- Parameters: service_ids (list of UUIDs in order)
- Returns: Boolean success
- Description: Update display order

---

#### Class: `CustomerRepository`

**Description:** Repository for Customer entity

**Inherits:** BaseRepository

**Additional Methods:**

**`get_by_phone(tenant_id, phone)`**
- Parameters: tenant_id, phone
- Returns: Customer or None
- Description: Find customer by phone number

**`get_by_tenant(tenant_id, filters, pagination)`**
- Parameters: tenant_id, filters, pagination
- Returns: Paginated customers
- Description: Get tenant's customers with filters

**`search(tenant_id, query)`**
- Parameters: tenant_id, query (string)
- Returns: List of customers
- Description: Search customers by name, email, phone

**`get_with_booking_stats(tenant_id)`**
- Parameters: tenant_id (UUID)
- Returns: List of customers with booking counts
- Description: Get customers with statistics

---

#### Class: `ConversationRepository`

**Description:** Repository for Conversation aggregate

**Inherits:** BaseRepository

**Additional Methods:**

**`get_active_conversation(tenant_id, customer_phone)`**
- Parameters: tenant_id, customer_phone
- Returns: Conversation or None
- Description: Get active conversation for customer

**`get_by_tenant(tenant_id, filters, pagination)`**
- Parameters: tenant_id, filters, pagination
- Returns: Paginated conversations
- Description: Get tenant's conversations

**`get_with_messages(conversation_id, message_limit)`**
- Parameters: conversation_id, message_limit
- Returns: Conversation with messages
- Description: Load conversation with message history

**`close_expired_conversations()`**
- Parameters: None
- Returns: Count of closed conversations
- Description: Auto-close conversations with expired service window

---

### External Service Clients

#### Class: `MetaCloudAPIClient`

**Description:** WhatsApp Business API client

**Dependencies:**
- `httpx` (HTTP client)
- Configuration

**Methods:**

**`send_text_message(phone_number_id, to, text)`**
- Parameters: phone_number_id, to (phone), text
- Returns: Message ID
- Description: Send text message

**`send_template_message(phone_number_id, to, template_name, template_params)`**
- Parameters: phone_number_id, to, template_name, template_params
- Returns: Message ID
- Description: Send template message

**`send_media_message(phone_number_id, to, media_url, caption)`**
- Parameters: phone_number_id, to, media_url, caption
- Returns: Message ID
- Description: Send media message (image, document)

**`mark_message_read(message_id)`**
- Parameters: message_id
- Returns: Success boolean
- Description: Mark message as read

**`verify_webhook_signature(signature, payload)`**
- Parameters: signature (header), payload (body)
- Returns: Boolean
- Description: Verify webhook authenticity

**`subscribe_to_webhooks(phone_number_id, webhook_url, verify_token)`**
- Parameters: phone_number_id, webhook_url, verify_token
- Returns: Success boolean
- Description: Register webhook subscription

**`get_business_profile(phone_number_id)`**
- Parameters: phone_number_id
- Returns: Profile data
- Description: Get WhatsApp Business Profile

---

#### Class: `CalComAPIClient`

**Description:** Cal.com API client

**Dependencies:**
- `httpx`
- Configuration

**Methods:**

**`validate_api_key(api_key)`**
- Parameters: api_key
- Returns: Boolean
- Description: Test API key validity

**`get_event_types(api_key, username)`**
- Parameters: api_key, username
- Returns: List of event types
- Description: Fetch available event types

**`get_availability(api_key, event_type_id, date_from, date_to)`**
- Parameters: api_key, event_type_id, date_from, date_to
- Returns: List of available slots
- Description: Get available time slots

**`create_booking(api_key, booking_data)`**
- Parameters: api_key, booking_data
- Returns: Booking object with UID
- Description: Create Cal.com booking

**`cancel_booking(api_key, booking_uid)`**
- Parameters: api_key, booking_uid
- Returns: Success boolean
- Description: Cancel existing booking

**`reschedule_booking(api_key, booking_uid, new_start_time)`**
- Parameters: api_key, booking_uid, new_start_time
- Returns: Updated booking
- Description: Reschedule booking

**`get_booking(api_key, booking_uid)`**
- Parameters: api_key, booking_uid
- Returns: Booking object
- Description: Get booking details

---

#### Class: `ClaudeAPIClient`

**Description:** Anthropic Claude API client

**Dependencies:**
- `anthropic` SDK
- Configuration

**Methods:**

**`classify_intent(message, context)`**
- Parameters: message (string), context (dict)
- Returns: Intent classification
- Description: Classify user intent using Claude

**`generate_response(prompt, system_prompt, max_tokens)`**
- Parameters: prompt, system_prompt, max_tokens
- Returns: Generated text
- Description: Generate text response

**`answer_faq(question, knowledge_base)`**
- Parameters: question, knowledge_base
- Returns: Answer text
- Description: Answer FAQ using knowledge

**`extract_booking_details(message, context)`**
- Parameters: message, context
- Returns: Extracted entities (date, time, service)
- Description: Extract booking information from text

**`generate_confirmation_message(booking_data)`**
- Parameters: booking_data
- Returns: Formatted confirmation message
- Description: Generate booking confirmation text

---

#### Class: `StorageClient`

**Description:** File storage client (Cloudflare R2 / Supabase)

**Dependencies:**
- `boto3` (S3-compatible)
- Configuration

**Methods:**

**`upload_file(file_data, key, content_type)`**
- Parameters: file_data (bytes), key, content_type
- Returns: Public URL
- Description: Upload file to storage

**`upload_file_from_path(file_path, key)`**
- Parameters: file_path, key
- Returns: Public URL
- Description: Upload file from filesystem

**`download_file(key)`**
- Parameters: key
- Returns: File bytes
- Description: Download file from storage

**`delete_file(key)`**
- Parameters: key
- Returns: Success boolean
- Description: Delete file from storage

**`generate_presigned_url(key, expiry_seconds)`**
- Parameters: key, expiry_seconds
- Returns: Temporary URL
- Description: Generate temporary access URL

**`list_files(prefix)`**
- Parameters: prefix
- Returns: List of file keys
- Description: List files with prefix

---

## API Layer

### Endpoints: Authentication

**Router:** `/api/v1/auth`

#### `POST /register`

**Description:** Register new tenant

**Request Body:**
```
{
  "slug": "maria-terapeuta",
  "business_name": "María Terapia",
  "email": "maria@example.com",
  "password": "secure_password"
}
```

**Response:** Tenant object + auth token

**Status Codes:**
- 201: Created
- 400: Validation error (slug exists, email exists)
- 500: Server error

---

#### `POST /login`

**Description:** Login tenant user

**Request Body:**
```
{
  "email": "maria@example.com",
  "password": "secure_password"
}
```

**Response:** Auth token

**Status Codes:**
- 200: Success
- 401: Invalid credentials
- 500: Server error

---

#### `POST /refresh`

**Description:** Refresh auth token

**Headers:** `Authorization: Bearer <token>`

**Response:** New auth token

**Status Codes:**
- 200: Success
- 401: Invalid token
- 500: Server error

---

#### `GET /me`

**Description:** Get current user info

**Headers:** `Authorization: Bearer <token>`

**Response:** User object with tenant info

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

### Endpoints: Tenants

**Router:** `/api/v1/tenants`

#### `GET /by-slug/{slug}`

**Description:** Get tenant by slug (public)

**Parameters:** slug (path)

**Response:** Tenant object with services

**Status Codes:**
- 200: Success
- 404: Tenant not found
- 500: Server error

---

#### `GET /me`

**Description:** Get current tenant

**Headers:** `Authorization: Bearer <token>`

**Response:** Tenant object

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

#### `PATCH /me`

**Description:** Update tenant info

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```
{
  "business_name": "New Name",
  "description": "Updated description",
  "phone": "+573001234567",
  "brand_settings": {...}
}
```

**Response:** Updated tenant

**Status Codes:**
- 200: Success
- 400: Validation error
- 401: Unauthorized
- 500: Server error

---

#### `POST /me/whatsapp/connect`

**Description:** Connect WhatsApp

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```
{
  "phone_number_id": "123456789",
  "access_token": "token...",
  "waba_id": "987654321",
  "webhook_verify_token": "secret"
}
```

**Response:** Success message

**Status Codes:**
- 200: Success
- 400: Invalid config
- 401: Unauthorized
- 500: Server error

---

#### `POST /me/calcom/connect`

**Description:** Connect Cal.com

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```
{
  "api_key": "cal_live_...",
  "username": "maria-terapeuta"
}
```

**Response:** Success + available event types

**Status Codes:**
- 200: Success
- 400: Invalid API key
- 401: Unauthorized
- 500: Server error

---

### Endpoints: Bookings

**Router:** `/api/v1/bookings`

#### `GET /`

**Description:** Get bookings

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status`: Filter by status
- `date_from`: Start date filter
- `date_to`: End date filter
- `page`: Page number
- `page_size`: Items per page

**Response:** Paginated booking list

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

#### `GET /{id}`

**Description:** Get booking details

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Response:** Booking object

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `POST /{id}/approve`

**Description:** Approve booking

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Request Body:** (optional)
```
{
  "internal_notes": "Approved by owner"
}
```

**Response:** Approved booking

**Status Codes:**
- 200: Success
- 400: Invalid status
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `POST /{id}/reject`

**Description:** Reject booking

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Request Body:**
```
{
  "reason": "Time not available"
}
```

**Response:** Rejected booking

**Status Codes:**
- 200: Success
- 400: Invalid status
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `POST /{id}/confirm-payment`

**Description:** Confirm payment received

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Response:** Confirmed booking

**Status Codes:**
- 200: Success
- 400: No payment proof
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `POST /{id}/cancel`

**Description:** Cancel booking

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Request Body:**
```
{
  "reason": "Customer requested cancellation"
}
```

**Response:** Cancelled booking

**Status Codes:**
- 200: Success
- 400: Cannot cancel
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `POST /{id}/upload-payment`

**Description:** Upload payment screenshot

**Headers:** `Authorization: Bearer <token>` (optional for public access)

**Parameters:** id (path, UUID)

**Request Body:** (multipart/form-data)
- `file`: Image file

**Response:** Updated booking with screenshot URL

**Status Codes:**
- 200: Success
- 400: Invalid file
- 404: Not found
- 500: Server error

---

### Endpoints: Services

**Router:** `/api/v1/services`

#### `GET /`

**Description:** Get services

**Headers:** `Authorization: Bearer <token>`

**Response:** List of services

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

#### `POST /`

**Description:** Create service

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```
{
  "name": "Terapia Individual",
  "description": "60 minutos de terapia",
  "duration_minutes": 60,
  "price_amount": 50000,
  "calcom_event_type_id": 123456
}
```

**Response:** Created service

**Status Codes:**
- 201: Created
- 400: Validation error
- 401: Unauthorized
- 500: Server error

---

#### `GET /{id}`

**Description:** Get service details

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Response:** Service object

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `PATCH /{id}`

**Description:** Update service

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Request Body:** (partial update)
```
{
  "name": "Updated name",
  "price_amount": 60000
}
```

**Response:** Updated service

**Status Codes:**
- 200: Success
- 400: Validation error
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

#### `DELETE /{id}`

**Description:** Delete service (soft delete)

**Headers:** `Authorization: Bearer <token>`

**Parameters:** id (path, UUID)

**Response:** Success message

**Status Codes:**
- 200: Success
- 400: Has active bookings
- 401: Unauthorized
- 404: Not found
- 500: Server error

---

### Endpoints: Webhooks

**Router:** `/api/v1/webhooks`

#### `GET /whatsapp`

**Description:** WhatsApp webhook verification (Meta requirement)

**Query Parameters:**
- `hub.mode`: "subscribe"
- `hub.verify_token`: Verification token
- `hub.challenge`: Challenge string

**Response:** Challenge string (plain text)

**Status Codes:**
- 200: Success
- 403: Invalid token

---

#### `POST /whatsapp`

**Description:** Receive WhatsApp messages

**Headers:**
- `X-Hub-Signature-256`: Webhook signature

**Request Body:** Meta webhook payload

**Response:** Success acknowledgment

**Status Codes:**
- 200: Success (always, even on errors - async processing)

---

#### `POST /calcom`

**Description:** Receive Cal.com events

**Headers:**
- `X-Cal-Signature`: Cal.com signature (future)

**Request Body:** Cal.com webhook payload

**Response:** Success acknowledgment

**Status Codes:**
- 200: Success
- 400: Invalid payload

---

## Implementation Order

### Phase 1: Foundation (Week 1)

**Tasks:**
1. Set up project structure
2. Configure database connection
3. Create SQLAlchemy models
4. Write Alembic migrations
5. Implement BaseRepository
6. Set up FastAPI app with basic routing
7. Implement JWT authentication
8. Create basic endpoints (health check, auth)

**Deliverables:**
- Working FastAPI app
- Database schema deployed
- Authentication working

---

### Phase 2: Core Domain (Week 2)

**Tasks:**
1. Implement Tenant domain (entity, value objects)
2. Implement Service domain
3. Implement Customer domain
4. Implement TenantRepository
5. Implement ServiceRepository
6. Implement CustomerRepository
7. Implement tenant use cases
8. Implement service use cases
9. Create tenant/service API endpoints

**Deliverables:**
- Tenant CRUD working
- Service CRUD working
- API endpoints functional

---

### Phase 3: Cal.com Integration (Week 3)

**Tasks:**
1. Implement CalComAPIClient
2. Implement ConnectCalComUseCase
3. Create Booking domain (entity, value objects)
4. Implement BookingRepository
5. Implement CreateBookingUseCase
6. Implement booking approval workflow
7. Create booking API endpoints
8. Test Cal.com webhook

**Deliverables:**
- Cal.com integration working
- Bookings can be created
- Approval workflow functional

---

### Phase 4: WhatsApp Integration (Week 4)

**Tasks:**
1. Implement MetaCloudAPIClient
2. Implement Conversation domain
3. Implement Message value objects
4. Implement ConversationRepository
5. Implement HandleWhatsAppWebhookUseCase
6. Implement ProcessIncomingMessageUseCase
7. Implement SendMessageUseCase
8. Create webhook endpoint
9. Test end-to-end message flow

**Deliverables:**
- WhatsApp messages received
- Messages stored in database
- Basic replies sent

---

### Phase 5: LangGraph Agent (Week 5-6)

**Tasks:**
1. Implement ClaudeAPIClient
2. Design LangGraph state machine
3. Implement IntentClassifierNode
4. Implement BookingAgentNode
5. Implement FAQAgentNode
6. Implement LangGraphOrchestrator
7. Implement human-in-the-loop checkpoints
8. Integrate with WhatsApp flow
9. Test conversation scenarios

**Deliverables:**
- AI agent working
- Intent classification functional
- Booking via WhatsApp working
- HITL approval integrated

---

### Phase 6: Payment Flow (Week 7)

**Tasks:**
1. Implement StorageClient (R2/Supabase)
2. Implement payment upload endpoint
3. Implement ConfirmPaymentUseCase
4. Add payment verification UI support
5. Implement payment reminders
6. Test payment workflow

**Deliverables:**
- Payment upload working
- Verification workflow complete
- Payment status updates

---

### Phase 7: Testing & Polish (Week 8)

**Tasks:**
1. Write unit tests (domain layer)
2. Write integration tests (use cases)
3. Write API tests (endpoints)
4. Error handling improvements
5. Logging setup
6. Documentation
7. Load testing
8. Security audit

**Deliverables:**
- Test coverage > 70%
- Production-ready backend
- Full API documentation

---

## Summary

This implementation guide provides:

✅ **Complete Architecture** - All layers defined  
✅ **Database Schema** - All tables with columns and constraints  
✅ **Domain Models** - Entities, value objects, events  
✅ **Use Cases** - All application services with steps  
✅ **Repositories** - Data access layer methods  
✅ **External Clients** - Third-party service integrations  
✅ **API Endpoints** - All REST endpoints specified  
✅ **Implementation Order** - 8-week phased approach  

**Next Steps:**
1. Review and approve architecture
2. Set up development environment
3. Initialize project structure
4. Begin Phase 1 implementation
5. Follow implementation order

---

**Document Version:** 1.0  
**Last Updated:** November 29, 2024  
**Status:** Ready for Implementation  
**Estimated Timeline:** 8 weeks (1 developer)
