# Manual Testing Guide - Emprendigo Backend

This guide provides step-by-step instructions to manually test every functionality of the Emprendigo Backend using the Swagger UI.

**Prerequisites:**
1.  Docker is running (`docker-compose up -d --build`).
2.  Database migrations are applied (`docker-compose exec backend alembic upgrade head`).
3.  You have a `.env` file with valid keys (even if dummy ones for non-integrated parts).
4.  Open your browser to: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 1. Authentication & Tenant Management

### 1.1. Register a New Tenant (Owner)
1.  Go to `POST /api/v1/auth/register`.
2.  Click **Try it out**.
3.  Enter JSON:
    ```json
    {
      "slug": "barberia-cool",
      "business_name": "Barberia Cool",
      "email": "admin@barberia.com",
      "password": "Password123!"
    }
    ```
4.  Execute.
5.  **Verify:** Response 201 Created. Copy the `access_token` from the response.

### 1.2. Login (Get Token)
1.  Go to `POST /api/v1/auth/login`.
2.  Enter:
    - `username`: `admin@barberia.com`
    - `password`: `Password123!`
3.  Execute.
4.  **Action:** Click the **Authorize** button at the top right of the Swagger page. Enter the token (no "Bearer " prefix needed usually in Swagger UI if configured for OAuth2, but if it's HTTP Bearer, just paste the token string).
    *Note: If Swagger/FastAPI is set up with OAuth2PasswordBearer, the Authorize button usually handles the flow. If specific "Authorize" button asks for `Bearer <token>`, do that.*

### 1.3. Get Current Tenant Profile
1.  Go to `GET /api/v1/tenants/me`.
2.  Execute.
3.  **Verify:** You see your tenant details.

---

## 2. Core Domain: Services & Customers

### 2.1. Create a Service
1.  Go to `POST /api/v1/services/`.
2.  JSON:
    ```json
    {
      "name": "Corte de Cabello",
      "description": "Corte clásico",
      "duration_minutes": 30,
      "price_amount": 20000,
      "price_currency": "COP",
      "is_active": true
    }
    ```
3.  Execute.
4.  **Verify:** Response 201. Copy the `id` (SERVICE_ID).

### 2.2. Create a Customer
1.  Go to `POST /api/v1/customers/`.
2.  JSON:
    ```json
    {
      "first_name": "Juan",
      "last_name": "Cliente",
      "email": "juan@mail.com",
      "phone": "+573001234567"
    }
    ```
3.  Execute.
4.  **Verify:** Response 201. Copy the `id` (CUSTOMER_ID).

---

## 3. Integrations Setup

### 3.1. Connect WhatsApp
1.  Go to `POST /api/v1/tenants/whatsapp-connection`.
2.  JSON:
    ```json
    {
      "phone_number_id": "123456789",
      "waba_id": "987654321",
      "access_token": "EAAG...",
      "verify_token": "emprendigo_verify_token"
    }
    ```
3.  Execute.
4.  **Verify:** Response 200.

### 3.2. Connect Cal.com
1.  Go to `POST /api/v1/tenants/calcom-connection`.
2.  JSON:
    ```json
    {
      "api_key": "cal_live_...",
      "username": "barberiacool"
    }
    ```
3.  Execute.
4.  **Verify:** Response 200.

---

## 4. Booking Flow (Manual)

### 4.1. Create a Booking
1.  Go to `POST /api/v1/bookings/`.
2.  JSON (Use IDs from Step 2):
    ```json
    {
      "service_id": "PASTE_SERVICE_ID_HERE",
      "customer_id": "PASTE_CUSTOMER_ID_HERE",
      "start_time": "2025-12-30T10:00:00",
      "end_time": "2025-12-30T10:30:00"
    }
    ```
3.  Execute.
4.  **Verify:** Response 201. Status should be `PENDING_APPROVAL` (or PENDING). Copy `id` (BOOKING_ID).

### 4.2. Approve Booking (If no payment needed)
1.  Go to `POST /api/v1/bookings/{booking_id}/approve`.
2.  Execute.
3.  **Verify:** Status becomes `APPROVED`. If Cal.com key was valid, it creates an event there.

---

## 5. Payment Flow (For Paid Services)

### 5.1. Make Service Expensive
Ensure the service created in 2.1 has a price > 0. (We set 20000 COP).

### 5.2. Upload Payment Proof (Customer Action)
1.  Go to `POST /api/v1/payments/{booking_id}/proof`.
2.  JSON:
    ```json
    {
      "transaction_id": "NEQUI_12345",
      "image_url": "http://img.com/voucher.jpg",
      "notes": "Paid via Nequi"
    }
    ```
3.  Execute.
4.  **Verify:** Response 200. Booking `payment_status` is `PENDING_VERIFICATION`.

### 5.3. Verify Payment (Admin Action)
1.  Go to `POST /api/v1/payments/{booking_id}/verify`.
2.  JSON:
    ```json
    {
      "verified": true
    }
    ```
3.  Execute.
4.  **Verify:** Response 200. `payment_status` becomes `PAID`.

---

## 6. AI Agent & WhatsApp (Integration Test)

To test this without a real phone, we can simulate the Webhook.

### 6.1. Simulate Incoming WhatsApp Message
1.  Go to `POST /api/v1/whatsapp/webhook`.
2.  **Note:** This endpoint expects the complex Meta Payload. The simplest way is to look at `backend/tests/test_whatsapp.py` (if created) or use a sample payload.
3.  **Payload Sample:**
    ```json
    {
      "object": "whatsapp_business_account",
      "entry": [
        {
          "id": "987654321",
          "changes": [
            {
              "value": {
                "messaging_product": "whatsapp",
                "metadata": {
                  "display_phone_number": "1234567890",
                  "phone_number_id": "123456789"
                },
                "contacts": [{ "profile": { "name": "Juan" }, "wa_id": "573001234567" }],
                "messages": [
                  {
                    "from": "573001234567",
                    "id": "wamid.HBgM...",
                    "timestamp": "1703688000",
                    "text": { "body": "Hola, quiero una cita" },
                    "type": "text"
                  }
                ]
              },
              "field": "messages"
            }
          ]
        }
      ]
    }
    ```
4.  **Important:** `phone_number_id` (123456789) must match what you set in Step 3.1. `from` (573001234567) simulates the customer phone.
5.  Execute.
6.  **Verify:** 
    -   Check server logs (`docker-compose logs -f backend`).
    -   You should see the Agent processing the message.
    -   If valid API keys (OpenAI) are set, it will generate a response and try to send it via Meta API (which might fail if tokens are fake, but logs will show the attempt).

### 6.2. Check Conversation History
1.  Go to `GET /api/v1/whatsapp/conversations`.
2.  Execute.
3.  **Verify:** You see the conversation with the customer.
4.  Copy `conversation_id`.
5.  Go to `GET /api/v1/whatsapp/conversations/{conversation_id}/messages`.
6.  **Verify:** You see the "Hola..." message and the Agent's reply.
