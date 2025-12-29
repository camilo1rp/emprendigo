from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, JSON, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from backend.core.database import Base

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String, unique=True, index=True, nullable=False)
    business_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=True)
    
    # WhatsApp Config
    whatsapp_phone_number = Column(String, nullable=True)
    whatsapp_phone_number_id = Column(String, nullable=True)
    whatsapp_access_token = Column(Text, nullable=True)
    whatsapp_waba_id = Column(String, nullable=True)
    whatsapp_webhook_verify_token = Column(String, nullable=True)
    
    # Cal.com Config
    calcom_api_key = Column(String, nullable=True)
    calcom_username = Column(String, nullable=True)
    
    # Payment Config
    nequi_number = Column(String, nullable=True)
    daviviplata_number = Column(String, nullable=True)
    
    # Settings
    brand_settings = Column(JSON, nullable=True)
    status = Column(String, default="active", index=True)
    onboarding_completed = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    users = relationship("AuthUser", back_populates="tenant", cascade="all, delete-orphan")
    services = relationship("Service", back_populates="tenant", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="tenant", cascade="all, delete-orphan")
    bookings = relationship("Booking", back_populates="tenant", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="tenant", cascade="all, delete-orphan")

class AuthUser(Base):
    __tablename__ = "auth_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(Text, nullable=False)
    role = Column(String, default="owner")
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="users")

class Service(Base):
    __tablename__ = "services"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False)
    price_amount = Column(Numeric(10, 2), nullable=False)
    price_currency = Column(String, default="COP")
    calcom_event_type_id = Column(Integer, nullable=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="services")
    bookings = relationship("Booking", back_populates="service", cascade="all, delete-orphan")

class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=False)
    whatsapp_optin = Column(Boolean, default=False)
    whatsapp_optin_date = Column(DateTime(timezone=True), nullable=True)
    source = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="customers")
    bookings = relationship("Booking", back_populates="customer", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="customer", cascade="all, delete-orphan")

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=False)
    
    status = Column(String, default="PENDING_APPROVAL", nullable=False) # PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED
    source = Column(String, default="WEB", nullable=False) # WHATSAPP, WEB
    
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    
    # Cal.com integration
    calcom_booking_id = Column(String, nullable=True)
    calcom_event_type_id = Column(Integer, nullable=True)
    calcom_booking_uid = Column(String, nullable=True)
    
    # Payment info
    payment_status = Column(String, default="PENDING") # PENDING, PAID, REFUNDED, PENDING_VERIFICATION
    payment_proof = Column(JSON, nullable=True) # { "transaction_id": "...", "image_url": "..." }
    price_amount = Column(Numeric(10, 2), nullable=False)
    price_currency = Column(String, default="COP")
    
    customer_notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="bookings")
    customer = relationship("Customer", back_populates="bookings")
    service = relationship("Service", back_populates="bookings")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    
    last_message_at = Column(DateTime(timezone=True), server_default=func.now())
    unread_count = Column(Integer, default=0)
    status = Column(String, default="ACTIVE") # ACTIVE, ARCHIVED
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="conversations")
    customer = relationship("Customer", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    
    direction = Column(String, nullable=False) # INBOUND, OUTBOUND
    message_type = Column(String, default="text") # text, template, image, etc.
    content = Column(Text, nullable=True) # Text body or caption
    metadata_json = Column(JSON, nullable=True) # Store raw JSON for templates/media info
    
    whatsapp_message_id = Column(String, nullable=True, index=True)
    status = Column(String, default="SENT") # SENT, DELIVERED, READ, FAILED
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    conversation = relationship("Conversation", back_populates="messages")
