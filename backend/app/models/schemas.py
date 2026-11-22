from datetime import date, datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# ---------- AUTH & USERS ----------
class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    full_name: str
    password: str
    role: str = Field(default="patient", pattern="^(pharmacy_staff|pharmacy_admin|health_official|patient)$")
    pharmacy_id: Optional[str] = None
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str
    portal_role: Optional[str] = Field(
        default=None,
        pattern="^(pharmacy_staff|pharmacy_admin|health_official|patient)$"
    )

class EmailOTPRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    portal_role: str = Field(pattern="^(pharmacy_staff|pharmacy_admin|health_official|patient)$")
    purpose: str = Field(default="login", pattern="^(login|signup)$")
    full_name: Optional[str] = None
    password: Optional[str] = None
    pharmacy_id: Optional[str] = None
    phone: Optional[str] = None

class EmailOTPVerify(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=6, max_length=6)
    portal_role: str = Field(pattern="^(pharmacy_staff|pharmacy_admin|health_official|patient)$")

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    pharmacy_id: Optional[str] = None
    pharmacy_name: Optional[str] = None
    is_active: bool = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class TokenPayload(BaseModel):
    sub: str
    email: str
    role: str
    pharmacy_id: Optional[str] = None
    exp: Optional[int] = None

class PharmacyMemberAssign(BaseModel):
    user_id: str
    pharmacy_id: str
    role: str = Field(pattern="^(pharmacy_staff|pharmacy_admin)$")

# ---------- PHARMACIES & SUPPLIERS ----------
class PharmacyIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    license_number: Optional[str] = None
    address: Optional[str] = None
    address_line: Optional[str] = None
    locality: Optional[str] = None
    city: str = Field(default="Chennai", max_length=120)
    district: Optional[str] = "Chennai"
    state: Optional[str] = "Tamil Nadu"
    postal_code: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    is_24_hours: Optional[bool] = False

class SupplierIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    contact: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    typical_lead_time_days: int = Field(default=3, ge=0)
    lead_time_days: Optional[int] = Field(default=3, ge=0)
    reliability_score: Optional[float] = 95.0

# ---------- MEDICINES & INVENTORY ----------
class MedicineIn(BaseModel):
    name: str = Field(min_length=2, max_length=240)
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    pack_size: Optional[str] = None
    manufacturer: Optional[str] = None
    therapeutic_category: Optional[str] = None
    atc_code: Optional[str] = None
    supplier_id: Optional[str] = None
    default_price: Optional[float] = 50.0

class StockIn(BaseModel):
    pharmacy_id: str
    medicine_id: str
    batch_no: str
    quantity: int = Field(ge=0)
    expiry_date: date
    unit_cost: Optional[float] = 0.0
    selling_price: Optional[float] = 0.0

class StockBulkItem(BaseModel):
    medicine_name: str
    batch_no: str
    quantity: int = Field(ge=0)
    expiry_date: str
    unit_cost: Optional[float] = 0.0
    selling_price: Optional[float] = 0.0

class StockBulkIn(BaseModel):
    pharmacy_id: str
    items: List[StockBulkItem]

class SaleIn(BaseModel):
    pharmacy_id: str
    medicine_id: str
    quantity: int = Field(gt=0)
    unit_price: Optional[float] = None

class BasketItemIn(BaseModel):
    medicine_id: str
    quantity: int = Field(default=1, gt=0)
    unit_price: Optional[float] = 0.0

class SaleBasketIn(BaseModel):
    pharmacy_id: str
    items: List[BasketItemIn]

class DeliveryIn(BaseModel):
    supplier_id: str
    pharmacy_id: str
    medicine_id: str
    quantity_ordered: int = Field(default=100, gt=0)
    ordered_on: date
    expected_on: date
    received_on: Optional[date] = None
    quantity_received: Optional[int] = Field(default=0, ge=0)
    status: Optional[str] = "ORDERED"

# ---------- CONFIRMATIONS & FINDER ----------
class ConfirmIn(BaseModel):
    pharmacy_id: str
    medicine_id: str
    patient_contact: str = Field(min_length=5, max_length=100)
    patient_name: Optional[str] = None
    quantity_requested: Optional[int] = Field(default=1, ge=1)
    urgency: Optional[str] = "Normal"
    pickup_preference: Optional[str] = "Counter Pickup"
    notes: Optional[str] = None

class ConfirmRespond(BaseModel):
    status: str = Field(pattern="^(available|unavailable|confirmed|declined|ready_for_pickup)$")
    notes: Optional[str] = None

class RestockSubIn(BaseModel):
    medicine_id: str
    pharmacy_id: Optional[str] = None
    patient_email: str = Field(min_length=3, max_length=254)
    patient_phone: Optional[str] = None

# ---------- OLAP & MINING ----------
class OLAPQueryIn(BaseModel):
    schema_type: str = Field(default="star", pattern="^(star|snowflake)$")
    dimensions: List[str] = ["month", "pharmacy"]
    measures: List[str] = ["units_sold", "revenue"]
    filters: Optional[Dict[str, Any]] = None
    period_comparison: Optional[bool] = False
    top_n: Optional[int] = None
    order_by: Optional[str] = None
    order_desc: Optional[bool] = True

class SavedViewIn(BaseModel):
    name: str
    description: Optional[str] = None
    query_config: Dict[str, Any]

