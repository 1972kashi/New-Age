"""
Car Dealership Backend API
==========================
A FastAPI server that replaces json-server and acts as a bridge between
your HTML/JS frontend and the db.json database.

Sections:
  1. Imports & Setup
  2. Database helpers  (read / write db.json)
  3. Auth utilities    (JWT tokens, password hashing)
  4. Auth routes       (register, login, /me)
  5. Cars routes       (list, filter, get, create, update, delete)
  6. CarDetails routes (linked detailed records)
  7. Admin routes      (stats, user management)
  8. File upload route (car images)
"""

# ─────────────────────────────────────────────
# 1. IMPORTS & SETUP
# ─────────────────────────────────────────────
import json, os, uuid, base64, shutil, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import (
    FastAPI, HTTPException, Depends, status,
    UploadFile, File, Query
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from jose import JWTError, jwt
import pyotp
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

# ── Constants ──────────────────────────────────
DB_PATH      = Path("db.json")          # path to your db.json file
UPLOAD_DIR   = Path("Pic")              # folder where car images are saved
SECRET_KEY   = "change-me-in-production-use-env-var"
ALGORITHM    = "HS256"
TOKEN_EXPIRE = 60 * 24                  # minutes — 1 day

UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Car Dealership API", version="1.0.0")

# Allow the HTML/JS frontend to call this API from any origin (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # tighten to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images as static files at /Pic/<filename>
app.mount("/Pic", StaticFiles(directory=str(UPLOAD_DIR)), name="pics")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Simple in-memory rate limit stores (reset on server restart)
LOGIN_RATE = {}
MFA_RATE = {}
RATE_WINDOW = 15 * 60  # seconds
RATE_LIMIT_LOGIN = 12  # max login attempts per window per username
RATE_LIMIT_MFA = 6     # max MFA verify attempts per window per user

def _check_rate(store: dict, key: str, limit: int, window: int):
    now = time.time()
    entries = [t for t in store.get(key, []) if now - t < window]
    if len(entries) >= limit:
        raise HTTPException(429, f"Too many attempts, try again later")
    entries.append(now)
    store[key] = entries


def send_sms(phone: str, message: str) -> bool:
    """Placeholder SMS sender — replace with Twilio or other provider in production.

    For now this prints to server logs so you can verify SMS delivery in development.
    """
    try:
        # In production, integrate with an SMS API (e.g., Twilio, Nexmo) here.
        print(f"[SMS] To={phone} Message={message}")
        return True
    except Exception:
        return False


# Ensure default admin exists in db.json (legacy base64 password)
def ensure_default_admin():
    db = read_db()
    if not any(u.get("email") == "admin@gmail.com" for u in db.get("users", [])):
        admin = {
            "id": new_id(),
            "createdAt": now_iso(),
            "fname": "Admin",
            "lname": "User",
            "email": "admin@gmail.com",
            "phone": "",
            # legacy base64 password for Admin@admin
            "password": base64.b64encode(b"Admin@admin").decode(),
            "role": "admin",
        }
        db.setdefault("users", []).append(admin)
        write_db(db)

# Defer seeding default admin until after DB helpers are defined.


# ─────────────────────────────────────────────
# 2. DATABASE HELPERS
# ─────────────────────────────────────────────

def read_db() -> dict:
    """Load the entire db.json into memory."""
    with open(DB_PATH, "r") as f:
        return json.load(f)

def write_db(data: dict) -> None:
    """Persist changes back to db.json (pretty-printed)."""
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)

def new_id() -> str:
    """Generate a short unique ID similar to the existing ones."""
    return uuid.uuid4().hex[:15]

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Compatibility helper: convert a Pydantic model to dict for v1 (`.dict()`) or v2 (`.model_dump()`).
def model_to_dict(m):
    if hasattr(m, "model_dump"):
        return m.model_dump()
    if hasattr(m, "dict"):
        return m.dict()
    return dict(m)


# ─────────────────────────────────────────────
# 3. AUTH UTILITIES
# ─────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """bcrypt-hash a plain-text password for safe storage."""
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    """Check a plain password against a stored bcrypt hash."""
    return pwd_context.verify(plain, hashed)

def legacy_decode(encoded: str) -> str:
    """
    The existing db.json stores passwords as base64.
    This decoder lets existing users log in without a forced reset.
    """
    try:
        return base64.b64decode(encoded).decode()
    except Exception:
        return ""

def create_token(data: dict, expires_minutes: int = TOKEN_EXPIRE, purpose: str = "access") -> str:
    """Create a JWT with an explicit purpose (access, mfa_challenge, mfa_setup).

    Tokens with purpose != 'access' are not accepted by get_current_user().
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    payload["purpose"] = purpose
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependency injected into protected routes.
    Decodes the JWT and returns the matching user record.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Only accept 'access' tokens for protected routes
        if payload.get("purpose", "access") != "access":
            raise credentials_error
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_error
    except JWTError:
        raise credentials_error

    db = read_db()
    user = next((u for u in db["users"] if u["id"] == user_id), None)
    if not user:
        raise credentials_error
    return user

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency that additionally checks the user is an admin."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─────────────────────────────────────────────
# 4. AUTH ROUTES  — /auth/*
# ─────────────────────────────────────────────

class RegisterBody(BaseModel):
    fname: str
    lname: str
    email: EmailStr
    phone: Optional[str] = ""
    password: str

class UserOut(BaseModel):
    id: str
    fname: str
    lname: str
    email: str
    phone: str
    role: str
    createdAt: str


@app.post("/auth/register", response_model=UserOut, status_code=201,
          summary="Register a new user account")
def register(body: RegisterBody):
    """
    Creates a new user.
    Passwords are stored as bcrypt hashes (not base64 like the seed data).
    """
    db = read_db()
    if any(u["email"] == body.email for u in db["users"]):
        raise HTTPException(400, "Email already registered")

    user = {
        "id":        new_id(),
        "createdAt": now_iso(),
        "fname":     body.fname,
        "lname":     body.lname,
        "email":     body.email,
        "phone":     body.phone,
        "role":      "user",
        "password":  hash_password(body.password),   # ← bcrypt hash
    }
    db["users"].append(user)
    write_db(db)
    return user


# Now that DB helpers are defined, ensure default admin exists
ensure_default_admin()


@app.post("/auth/login", summary="Login — returns a JWT access token")
def login(form: OAuth2PasswordRequestForm = Depends()):
    """
    Accepts username (email) + password.
    Supports both the legacy base64 passwords in db.json
    AND the new bcrypt hashes created by /auth/register.
    Returns a JWT token the frontend stores in localStorage.
    """
    # Rate-limit login attempts per username to slow brute-force
    try:
        _check_rate(LOGIN_RATE, form.username, RATE_LIMIT_LOGIN, RATE_WINDOW)
    except HTTPException:
        raise HTTPException(429, "Too many login attempts, try again later")

    db   = read_db()
    user = next((u for u in db["users"] if u["email"] == form.username), None)

    if not user:
        raise HTTPException(401, "Invalid email or password")

    stored = user["password"]
    # Try bcrypt first, then fall back to legacy base64
    password_ok = (
        (stored.startswith("$2b$") and verify_password(form.password, stored))
        or
        (not stored.startswith("$2b$") and legacy_decode(stored) == form.password)
    )
    if not password_ok:
        # record the failed attempt
        try:
            _check_rate(LOGIN_RATE, form.username, RATE_LIMIT_LOGIN, RATE_WINDOW)
        except HTTPException:
            pass
        raise HTTPException(401, "Invalid email or password")

    # Enforce strict MFA for admin users
    if user.get("role") == "admin":
        # If admin already has an MFA secret, issue a short-lived MFA challenge token
        if user.get("mfa_secret"):
            mfa_token = create_token({"sub": user["id"], "role": user["role"]}, expires_minutes=5, purpose="mfa_challenge")
            # If a phone number is present, send the current TOTP code via SMS.
            try:
                totp = pyotp.TOTP(user["mfa_secret"])
                code = totp.now()
                phone = user.get("phone")
                if phone:
                    send_sms(phone, f"Your New Age MFA code is: {code}")
            except Exception:
                # Don't block login flow if SMS sending fails; verification can still proceed.
                pass
            return {"mfa_required": True, "mfa_token": mfa_token}
        # No MFA configured yet — return a short-lived setup token so the admin can provision MFA
        setup_token = create_token({"sub": user["id"], "role": user["role"]}, expires_minutes=10, purpose="mfa_setup")
        return {"mfa_setup_required": True, "mfa_token": setup_token, "message": "MFA setup required for admin accounts"}

    # Non-admin users — standard access token
    token = create_token({"sub": user["id"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}


class MFAVerifyBody(BaseModel):
    mfa_token: str
    code: str


@app.post("/auth/mfa/verify", summary="Verify MFA code and return access token")
def mfa_verify(body: MFAVerifyBody):
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired MFA token or code",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(body.mfa_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise credentials_error

    if payload.get("purpose") != "mfa_challenge":
        raise credentials_error

    user_id = payload.get("sub")

    # Rate-limit MFA verification attempts per user
    try:
        _check_rate(MFA_RATE, user_id, RATE_LIMIT_MFA, RATE_WINDOW)
    except HTTPException:
        raise HTTPException(429, "Too many MFA attempts, try again later")

    db = read_db()
    idx = next((i for i, u in enumerate(db.get("users", [])) if u.get("id") == user_id), None)
    user = db.get("users", [])[idx] if idx is not None else None
    if not user or not user.get("mfa_secret"):
        raise credentials_error

    totp = pyotp.TOTP(user["mfa_secret"])

    # Accept either a TOTP code or a one-time backup code
    valid = False
    if totp.verify(body.code, valid_window=1):
        valid = True
    else:
        # check backup codes (one-time use)
        backups = user.get("mfa_backup", []) or []
        if body.code in backups:
            valid = True
            # remove used backup code
            backups = [c for c in backups if c != body.code]
            db["users"][idx]["mfa_backup"] = backups
            write_db(db)

    if not valid:
        raise HTTPException(401, "Invalid MFA code")

    # On success, clear MFA attempt counters for this user
    MFA_RATE[user_id] = []

    # Issue final access token
    token = create_token({"sub": user["id"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}


class MFASetupStartBody(BaseModel):
    mfa_token: str


@app.post("/auth/mfa/setup/start", summary="Start MFA setup (returns secret + otpauth URL)")
def mfa_setup_start(body: MFASetupStartBody):
    try:
        payload = jwt.decode(body.mfa_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired setup token")
    if payload.get("purpose") != "mfa_setup":
        raise HTTPException(401, "Invalid setup token")

    user_id = payload.get("sub")
    db = read_db()
    user = next((u for u in db.get("users", []) if u.get("id") == user_id), None)
    if not user:
        raise HTTPException(401, "Invalid setup token")

    # Generate a new TOTP secret and return provisioning URI for QR code
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    otpauth = totp.provisioning_uri(name=user.get("email"), issuer_name="New Age")
    return {"secret": secret, "otpauth_url": otpauth}


class MFASetupConfirmBody(BaseModel):
    mfa_token: str
    secret: str
    code: str


@app.post("/auth/mfa/setup/confirm", summary="Confirm MFA setup and enable MFA for admin")
def mfa_setup_confirm(body: MFASetupConfirmBody):
    try:
        payload = jwt.decode(body.mfa_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired setup token")
    if payload.get("purpose") != "mfa_setup":
        raise HTTPException(401, "Invalid setup token")

    user_id = payload.get("sub")
    db = read_db()
    idx = next((i for i, u in enumerate(db.get("users", [])) if u.get("id") == user_id), None)
    if idx is None:
        raise HTTPException(401, "Invalid setup token")

    totp = pyotp.TOTP(body.secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(401, "Invalid confirmation code")

    # Persist secret to user record and enable MFA
    db["users"][idx]["mfa_secret"] = body.secret
    db["users"][idx]["mfa_enabled"] = True
    # Generate one-time backup codes for account recovery
    backup_codes = []
    for _ in range(8):
        backup_codes.append(uuid.uuid4().hex[:8].upper())
    db["users"][idx]["mfa_backup"] = backup_codes
    write_db(db)

    # Issue final access token
    user = db["users"][idx]
    token = create_token({"sub": user["id"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"], "backup_codes": backup_codes}


@app.get("/auth/me", response_model=UserOut, summary="Get the logged-in user's profile")
def me(user: dict = Depends(get_current_user)):
    return user


@app.post('/auth/mfa/backup/regenerate', summary='Regenerate backup codes for current admin')
def mfa_backup_regenerate(user: dict = Depends(require_admin)):
    db = read_db()
    idx = next((i for i, u in enumerate(db.get('users', [])) if u.get('id') == user.get('id')), None)
    if idx is None:
        raise HTTPException(404, 'User not found')
    codes = [uuid.uuid4().hex[:8].upper() for _ in range(8)]
    db['users'][idx]['mfa_backup'] = codes
    write_db(db)
    return {'backup_codes': codes}


# ─────────────────────────────────────────────
# 5. CARS ROUTES  — /cars/*
# ─────────────────────────────────────────────

class CarBody(BaseModel):
    name:  str
    miles: str
    trans: str
    fuel:  str
    year:  Optional[str] = ""
    price: str
    img:   Optional[str] = "Pic/Car 1.svg"
    badge: Optional[bool] = True
    link:  Optional[str] = "car-detail.html"


@app.get("/cars", summary="List all cars with optional filters")
def list_cars(
    name:  Optional[str] = Query(None, description="Filter by car name"),
    fuel:  Optional[str] = Query(None, description="Filter by fuel type"),
    trans: Optional[str] = Query(None, description="Filter by transmission"),
    year:  Optional[str] = Query(None, description="Filter by year"),
    min_price: Optional[int] = Query(None, description="Minimum price (numeric)"),
    max_price: Optional[int] = Query(None, description="Maximum price (numeric)"),
):
    """
    Returns the full cars list.
    All query params are optional and can be combined:
      GET /cars?fuel=Diesel&trans=Manual
      GET /cars?name=BMW&min_price=4000000
    """
    db   = read_db()
    cars = db["cars"]

    def parse_price(p: str) -> int:
        try:
            return int(p.replace(",", ""))
        except Exception:
            return 0

    if name:
        cars = [c for c in cars if name.lower() in c["name"].lower()]
    if fuel:
        cars = [c for c in cars if c["fuel"].lower() == fuel.lower()]
    if trans:
        cars = [c for c in cars if c["trans"].lower() == trans.lower()]
    if year:
        cars = [c for c in cars if c.get("year") == year]
    if min_price is not None:
        cars = [c for c in cars if parse_price(c["price"]) >= min_price]
    if max_price is not None:
        cars = [c for c in cars if parse_price(c["price"]) <= max_price]

    return cars


@app.get("/cars/{car_id}", summary="Get a single car by ID")
def get_car(car_id: str):
    db  = read_db()
    car = next((c for c in db["cars"] if c["id"] == car_id), None)
    if not car:
        raise HTTPException(404, "Car not found")
    return car


@app.post("/cars", status_code=201, summary="Add a new car listing (admin only)")
def create_car(body: CarBody, _admin=Depends(require_admin)):
    """
    Adds a car to the `cars` array and auto-generates an id + createdAt.
    Only admins can call this endpoint.
    """
    db  = read_db()
    car = {
        "id":        new_id(),
        "createdAt": now_iso(),
        **model_to_dict(body),
    }
    db["cars"].append(car)
    write_db(db)
    return car


@app.put("/cars/{car_id}", summary="Update an existing car (admin only)")
def update_car(car_id: str, body: CarBody, _admin=Depends(require_admin)):
    db   = read_db()
    idx  = next((i for i, c in enumerate(db["cars"]) if c["id"] == car_id), None)
    if idx is None:
        raise HTTPException(404, "Car not found")

    db["cars"][idx].update(model_to_dict(body))
    write_db(db)
    return db["cars"][idx]


@app.delete("/cars/{car_id}", status_code=204, summary="Delete a car (admin only)")
def delete_car(car_id: str, _admin=Depends(require_admin)):
    db = read_db()
    before = len(db["cars"])
    db["cars"] = [c for c in db["cars"] if c["id"] != car_id]
    if len(db["cars"]) == before:
        raise HTTPException(404, "Car not found")
    write_db(db)


# ─────────────────────────────────────────────
# 6. CAR DETAILS ROUTES  — /carDetails/*
# ─────────────────────────────────────────────

class CarDetailBody(BaseModel):
    name:        str
    miles:       str
    trans:       str
    fuel:        str
    year:        Optional[str] = ""
    price:       str
    img:         Optional[str] = ""
    badge:       Optional[bool] = True
    model:       Optional[str] = ""
    engine:      Optional[str] = ""
    bodyType:    Optional[str] = ""
    condition:   Optional[str] = ""
    drive:       Optional[str] = ""
    location:    Optional[str] = ""
    description: Optional[str] = ""
    make:        Optional[str] = ""
    color:       Optional[str] = ""


@app.get("/carDetails", summary="List all detailed car records")
def list_car_details():
    return read_db()["carDetails"]


@app.get("/carDetails/{detail_id}", summary="Get detailed info for one car")
def get_car_detail(detail_id: str):
    db     = read_db()
    detail = next((d for d in db["carDetails"] if d["id"] == detail_id), None)
    if not detail:
        raise HTTPException(404, "Car detail not found")
    return detail


@app.post("/carDetails", status_code=201, summary="Add detailed car record (admin only)")
def create_car_detail(body: CarDetailBody, _admin=Depends(require_admin)):
    db     = read_db()
    detail = {
        "id":        new_id(),
        "createdAt": now_iso(),
        **model_to_dict(body),
    }
    db["carDetails"].append(detail)
    write_db(db)
    return detail


@app.put("/carDetails/{detail_id}", summary="Update car detail record (admin only)")
def update_car_detail(detail_id: str, body: CarDetailBody, _admin=Depends(require_admin)):
    db  = read_db()
    idx = next((i for i, d in enumerate(db["carDetails"]) if d["id"] == detail_id), None)
    if idx is None:
        raise HTTPException(404, "Car detail not found")
    db["carDetails"][idx].update(model_to_dict(body))
    write_db(db)
    return db["carDetails"][idx]


@app.delete("/carDetails/{detail_id}", status_code=204,
            summary="Delete car detail record (admin only)")
def delete_car_detail(detail_id: str, _admin=Depends(require_admin)):
    db     = read_db()
    before = len(db["carDetails"])
    db["carDetails"] = [d for d in db["carDetails"] if d["id"] != detail_id]
    if len(db["carDetails"]) == before:
        raise HTTPException(404, "Car detail not found")
    write_db(db)


# ─────────────────────────────────────────────
# 7. ADMIN ROUTES  — /admin/*
# ─────────────────────────────────────────────

@app.get("/admin/stats", summary="Dashboard summary stats (admin only)")
def admin_stats(_admin=Depends(require_admin)):
    """
    Returns aggregate numbers the admin dashboard can display:
    total cars, total users, breakdown by fuel type, transmission, etc.
    """
    db   = read_db()
    cars = db["cars"]

    fuel_counts  = {}
    trans_counts = {}
    for car in cars:
        fuel_counts[car["fuel"]]  = fuel_counts.get(car["fuel"],  0) + 1
        trans_counts[car["trans"]]= trans_counts.get(car["trans"], 0) + 1

    return {
        "total_cars":        len(cars),
        "total_users":       len(db["users"]),
        "total_car_details": len(db["carDetails"]),
        "by_fuel":           fuel_counts,
        "by_transmission":   trans_counts,
    }


@app.get("/admin/users", summary="List all users (admin only)")
def list_users(_admin=Depends(require_admin)):
    db = read_db()
    # Strip passwords before returning
    return [{k: v for k, v in u.items() if k != "password"} for u in db["users"]]


@app.delete("/admin/users/{user_id}", status_code=204,
            summary="Delete a user account (admin only)")
def delete_user(user_id: str, admin=Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "Cannot delete your own account")
    db     = read_db()
    before = len(db["users"])
    db["users"] = [u for u in db["users"] if u["id"] != user_id]
    if len(db["users"]) == before:
        raise HTTPException(404, "User not found")
    write_db(db)


# ─────────────────────────────────────────────
# 8. FILE UPLOAD ROUTE  — /upload/image
# ─────────────────────────────────────────────

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_SIZE_MB   = 5

@app.post("/upload/image", summary="Upload a car image (admin only)")
async def upload_image(
    file: UploadFile = File(...),
    _admin=Depends(require_admin)
):
    """
    Saves an uploaded image to the /Pic folder.
    Returns the relative path to store in car.img, e.g. "Pic/abc123.jpg".
    Max size: 5 MB. Allowed types: JPEG, PNG, WebP, SVG.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type '{file.content_type}' not allowed")

    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File exceeds {MAX_SIZE_MB} MB limit")

    ext      = Path(file.filename).suffix
    filename = f"{new_id()}{ext}"
    dest     = UPLOAD_DIR / filename

    with open(dest, "wb") as f:
        f.write(contents)

    return {"img": f"Pic/{filename}", "url": f"/Pic/{filename}"}


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    # Run with:  python app.py
    # Or:        uvicorn app:app --reload
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)


# -------------------------------------------------
# Compatibility /api/* endpoints (match existing server.js)
# These allow the frontend to continue using `/api/...` paths
# while the FastAPI app remains the single backend.
# -------------------------------------------------


def create_record(db: dict, table: str, item: dict) -> dict:
    """Create a record with id and createdAt similar to prior server.js behavior."""
    rec = {"id": new_id(), "createdAt": now_iso()}
    rec.update(item)
    if table not in db:
        db[table] = []
    db[table].append(rec)
    return rec


@app.post('/api/cars')
def api_create_cars(body: dict | list):
    if not body:
        raise HTTPException(400, "Missing body")
    db = read_db()
    items = body if isinstance(body, list) else [body]
    created = []
    for item in items:
        base = {
            "name": item.get("name", ""),
            "miles": item.get("miles", ""),
            "trans": item.get("trans", ""),
            "fuel": item.get("fuel", ""),
            "year": item.get("year", ""),
            "price": item.get("price", ""),
            "link": item.get("link", "car-detail.html"),
            "img": item.get("img", ""),
            "badge": item.get("badge", False),
        }
        rec = create_record(db, 'cars', base)
        # Maintain the older server behavior of linking to car-detail/<id> when generic link
        if not rec.get('link') or rec.get('link') == 'car-detail.html':
            rec['link'] = f"car-detail/{rec['id']}"
        created.append(rec)
    write_db(db)
    return created[0] if len(created) == 1 else created


@app.get('/api/cars')
def api_list_cars(page: int = 1, limit: int = 50):
    db = read_db()
    items = list(db.get('cars', []))
    items.reverse()
    total = len(items)
    start = (max(1, page) - 1) * max(1, limit)
    paged = items[start:start + max(1, limit)]
    return {"total": total, "page": page, "limit": limit, "items": paged}


@app.get('/api/cars/{car_id}')
def api_get_car(car_id: str):
    db = read_db()
    car = next((c for c in db.get('cars', []) if c['id'] == car_id), None)
    if not car:
        raise HTTPException(404, "Not found")
    return car


@app.put('/api/cars/{car_id}')
def api_update_car(car_id: str, body: dict):
    db = read_db()
    idx = next((i for i, c in enumerate(db.get('cars', [])) if c['id'] == car_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    db['cars'][idx].update(body)
    write_db(db)
    return db['cars'][idx]


@app.delete('/api/cars/{car_id}')
def api_delete_car(car_id: str):
    db = read_db()
    before = len(db.get('cars', []))
    db['cars'] = [c for c in db.get('cars', []) if c['id'] != car_id]
    if len(db['cars']) == before:
        raise HTTPException(404, "Not found")
    write_db(db)
    return {"deleted": True}


@app.get('/api/car-details')
def api_list_car_details(page: int = 1, limit: int = 50):
    db = read_db()
    items = list(db.get('carDetails', []))
    items.reverse()
    total = len(items)
    start = (max(1, page) - 1) * max(1, limit)
    paged = items[start:start + max(1, limit)]
    return {"total": total, "page": page, "limit": limit, "items": paged}


@app.get('/api/car-details/{detail_id}')
def api_get_car_detail(detail_id: str):
    db = read_db()
    detail = next((d for d in db.get('carDetails', []) if d['id'] == detail_id), None)
    if not detail:
        raise HTTPException(404, "Not found")
    return detail


@app.post('/api/car-details')
def api_create_car_detail(body: dict):
    if not body:
        raise HTTPException(400, "Missing body")
    db = read_db()
    base = {
        "name": body.get("name", ""),
        "miles": body.get("miles", ""),
        "trans": body.get("trans", ""),
        "fuel": body.get("fuel", ""),
        "year": body.get("year", ""),
        "price": body.get("price", ""),
        "img": body.get("img", ""),
        "badge": body.get("badge", False),
        "model": body.get("model", ""),
        "engine": body.get("engine", ""),
        "bodyType": body.get("bodyType", ""),
        "condition": body.get("condition", ""),
        "drive": body.get("drive", ""),
        "location": body.get("location", ""),
        "description": body.get("description", ""),
    }
    rec = create_record(db, 'carDetails', base)
    write_db(db)
    return rec


@app.put('/api/car-details/{detail_id}')
def api_update_car_detail(detail_id: str, body: dict):
    db = read_db()
    idx = next((i for i, d in enumerate(db.get('carDetails', [])) if d['id'] == detail_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    db['carDetails'][idx].update(body)
    write_db(db)
    return db['carDetails'][idx]


@app.delete('/api/car-details/{detail_id}')
def api_delete_car_detail(detail_id: str):
    db = read_db()
    before = len(db.get('carDetails', []))
    db['carDetails'] = [d for d in db.get('carDetails', []) if d['id'] != detail_id]
    if len(db['carDetails']) == before:
        raise HTTPException(404, "Not found")
    write_db(db)
    return {"deleted": True}


@app.get('/api/users')
def api_list_users(page: int = 1, limit: int = 50):
    db = read_db()
    items = list(db.get('users', []))
    items.reverse()
    total = len(items)
    start = (max(1, page) - 1) * max(1, limit)
    paged = items[start:start + max(1, limit)]
    return {"total": total, "page": page, "limit": limit, "items": paged}


@app.get('/api/users/{user_id}')
def api_get_user(user_id: str):
    db = read_db()
    user = next((u for u in db.get('users', []) if u['id'] == user_id), None)
    if not user:
        raise HTTPException(404, "Not found")
    return user


@app.post('/api/users')
def api_create_user(body: dict):
    if not body:
        raise HTTPException(400, "Missing body")
    db = read_db()
    # duplicate email check
    if any(u.get('email') == body.get('email') for u in db.get('users', [])):
        raise HTTPException(400, "Email already registered")
    # Keep password storage compatible with older client (base64)
    user = {
        "fname": body.get('fname', ''),
        "lname": body.get('lname', ''),
        "email": body.get('email', ''),
        "phone": body.get('phone', ''),
        "role": body.get('role', 'user'),
        "password": body.get('password', ''),
    }
    rec = create_record(db, 'users', user)
    write_db(db)
    return rec


@app.put('/api/users/{user_id}')
def api_update_user(user_id: str, body: dict):
    db = read_db()
    idx = next((i for i, u in enumerate(db.get('users', [])) if u['id'] == user_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    # check duplicate email
    if body.get('email') and any(u.get('email') == body.get('email') and u.get('id') != user_id for u in db.get('users', [])):
        raise HTTPException(400, "Email already registered")
    db['users'][idx].update(body)
    write_db(db)
    return db['users'][idx]


@app.delete('/api/users/{user_id}')
def api_delete_user(user_id: str):
    db = read_db()
    before = len(db.get('users', []))
    db['users'] = [u for u in db.get('users', []) if u['id'] != user_id]
    if len(db['users']) == before:
        raise HTTPException(404, "Not found")
    write_db(db)
    return {"deleted": True}


# Serve frontend files for non-API requests (kept after API routes so they don't get shadowed)
@app.get("/", include_in_schema=False)
def serve_root():
    # Prefer login.html if present, else index.html
    if Path('login.html').exists():
        return FileResponse('login.html')
    if Path('index.html').exists():
        return FileResponse('index.html')
    raise HTTPException(404, 'Frontend not found')


@app.get("/{full_path:path}", include_in_schema=False)
def serve_files(full_path: str):
    # Do not interfere with API or Pic routes - let FastAPI match those first
    p = Path(full_path)
    if p.exists() and p.is_file():
        return FileResponse(str(p))
    # fallback to login/index for SPA-style routing
    if Path('login.html').exists():
        return FileResponse('login.html')
    if Path('index.html').exists():
        return FileResponse('index.html')
    raise HTTPException(404, 'Not found')
