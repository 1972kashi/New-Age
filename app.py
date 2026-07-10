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
import json, os, uuid, base64, shutil, smtplib, time, io, re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from email.message import EmailMessage

import psycopg
from fastapi import (
    FastAPI, HTTPException, Depends, status,
    UploadFile, File, Query, Body, Request
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.gzip import GZipMiddleware
from jose import JWTError, jwt
import pyotp
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

# ── Constants ──────────────────────────────────
DB_PATH      = Path("db.json")          # legacy JSON backup used for migration
UPLOAD_DIR   = Path("Pic")              # folder where car images are saved
DATABASE_URL = os.getenv("DATABASE_URL")
DB_HOST      = os.getenv("DB_HOST", "localhost")
DB_PORT      = int(os.getenv("DB_PORT", "5432"))
DB_NAME      = os.getenv("DB_NAME", "newage")
DB_USER      = os.getenv("DB_USER", "postgres")
DB_PASSWORD  = os.getenv("DB_PASSWORD", "postgres")
# Read secrets from environment when possible. Keeps the existing default
# value for development to avoid breaking local setups, but logs a warning
# so deployers know to set a real secret in production.
SECRET_KEY   = os.getenv("SECRET_KEY", "change-me-in-production-use-env-var")
ALGORITHM    = "HS256"
# Token expiry (minutes). Can be overridden with the env var `TOKEN_EXPIRE_MIN`.
try:
    TOKEN_EXPIRE = int(os.getenv("TOKEN_EXPIRE_MIN", str(60 * 24)))
except Exception:
    TOKEN_EXPIRE = 60 * 24

if SECRET_KEY == "change-me-in-production-use-env-var":
    print("[WARN] Using default SECRET_KEY. Set SECRET_KEY env var in production.")

UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Car Dealership API", version="1.0.0")

# Configure CORS from environment (comma-separated) to avoid wide-open origins in
# production. Default keeps previous permissive behavior for local development.
allowed = os.getenv("ALLOWED_ORIGINS", "*")
if allowed.strip() == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in allowed.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip responses for bandwidth savings
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    resp = await call_next(request)
    # Basic security headers
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # HSTS only in non-local environments
    host = request.url.hostname or ""
    if host not in ("localhost", "127.0.0.1"):
        resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
    # Content Security Policy (relaxed to avoid breaking inline scripts used by site)
    csp = "default-src 'self' https: data:; script-src 'self' 'unsafe-inline' https://www.google-analytics.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;"
    resp.headers.setdefault("Content-Security-Policy", csp)
    return resp

# Simple global rate limiter (in-memory). Tune via env vars.
GLOBAL_RATE = defaultdict(list)
GLOBAL_RATE_WINDOW = int(os.getenv("GLOBAL_RATE_WINDOW_SEC", "60"))
GLOBAL_RATE_LIMIT = int(os.getenv("GLOBAL_RATE_LIMIT", "120"))


@app.middleware("http")
async def global_rate_limiter(request, call_next):
    try:
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        entries = [t for t in GLOBAL_RATE[ip] if now - t < GLOBAL_RATE_WINDOW]
        if len(entries) >= GLOBAL_RATE_LIMIT:
            return JSONResponse(status_code=429, content={"detail": "Too many requests"})
        entries.append(now)
        GLOBAL_RATE[ip] = entries
    except Exception:
        pass
    return await call_next(request)


# Temporary debugging middleware: log raw request body and headers for API create endpoints
@app.middleware("http")
async def log_api_requests(request, call_next):
    try:
        path = request.url.path
        if path.startswith('/api/cars') or path.startswith('/api/car-details'):
            body = await request.body()
            try:
                bstr = body.decode('utf-8')
            except Exception:
                bstr = str(body)
            print('---[API REQUEST]---')
            print(f'METHOD: {request.method} PATH: {path}')
            # Print a subset of headers relevant for debugging
            hdrs = {k: v for k, v in request.headers.items() if k.lower() in ('content-type', 'content-length', 'origin', 'host')}
            print('HEADERS:', hdrs)
            print('BODY:', bstr)
            print('---[END REQUEST]---')
    except Exception as e:
        print('Error in log_api_requests middleware:', e)
    return await call_next(request)

# Serve uploaded images as static files at /Pic/<filename>
app.mount("/Pic", StaticFiles(directory=str(UPLOAD_DIR)), name="pics")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Simple in-memory rate limit stores (reset on server restart)
LOGIN_RATE = {}
MFA_RATE = {}
REGISTER_RATE = {}
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


from typing import Optional


def audit_log(user_identifier: str, action: str, details: Optional[dict] = None):
    try:
        out = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "user": user_identifier,
            "action": action,
            "details": details or {}
        }
        with open('audit.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps(out, ensure_ascii=False) + "\n")
    except Exception:
        pass


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


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a simple email using SMTP if environment variables are configured."""
    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        print(f"[EMAIL] SMTP not configured. To={to} Subject={subject}")
        return False

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    from_addr = os.getenv("SMTP_FROM") or username or "no-reply@newageautomotive.local"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(body)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as smtp:
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
                smtp.starttls()
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
        return True
    except Exception as exc:
        print(f"[EMAIL] Failed to send to {to}: {exc}")
        return False


def send_auth_notification(user: dict, kind: str) -> bool:
    if not user.get("email"):
        return False

    if kind == "welcome":
        subject = "Welcome to New Age Automotive"
        body = (
            f"Hi {user.get('fname', 'there')},\n\n"
            "Welcome to New Age Automotive. Your account has been created successfully.\n"
            "You can sign in anytime to browse verified cars and manage your account."
        )
    else:
        subject = "New Age Automotive login confirmation"
        body = (
            f"Hi {user.get('fname', 'there')},\n\n"
            "This is a confirmation that you have successfully logged in to New Age Automotive."
        )

    return send_email(user["email"], subject, body)


class EnquiryBody(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    carName: str
    message: str


@app.post('/api/enquiry')
def api_send_enquiry(body: EnquiryBody):
    recipient = os.getenv('CONTACT_EMAIL') or 'jacksonmurithi47@gmail.com'
    subject = f"New enquiry for {body.carName}"
    content = (
        f"Name: {body.name}\n"
        f"Email: {body.email}\n"
        f"Phone: {body.phone or 'Not provided'}\n"
        f"Car: {body.carName}\n\n"
        f"Message:\n{body.message}\n"
    )
    sent = send_email(recipient, subject, content)
    status_message = 'Email sent successfully.' if sent else 'Email request logged; SMTP is not configured.'
    return {"sent": sent, "message": status_message}


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

def _connection_kwargs(database_name: Optional[str] = None) -> dict:
    kwargs = {"host": DB_HOST, "port": DB_PORT, "user": DB_USER, "password": DB_PASSWORD}
    if database_name:
        kwargs["dbname"] = database_name
    elif DATABASE_URL:
        kwargs = {"conninfo": DATABASE_URL}
    return kwargs


def initialize_database() -> bool:
    """Create the PostgreSQL database and required table if needed."""
    try:
        admin_db = "postgres"
        with psycopg.connect(**_connection_kwargs(admin_db), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
                exists = cur.fetchone()
                if not exists:
                    cur.execute(f'CREATE DATABASE "{DB_NAME}"')

        with psycopg.connect(**_connection_kwargs(DB_NAME), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS app_data (
                        collection TEXT NOT NULL,
                        item_id TEXT NOT NULL,
                        payload JSONB NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        PRIMARY KEY (collection, item_id)
                    )
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_app_data_collection ON app_data (collection)")
        return True
    except Exception as exc:
        print(f"[DB] PostgreSQL initialization failed: {exc}")
        return False


def _load_legacy_db() -> dict:
    if not DB_PATH.exists():
        return {}
    try:
        with DB_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def read_db() -> dict:
    """Load the current database state from PostgreSQL, migrating legacy JSON data if needed."""
    if initialize_database():
        try:
            with psycopg.connect(**_connection_kwargs(DB_NAME)) as conn:
                with conn.cursor() as cur:
                    data = {"users": [], "cars": [], "carDetails": [], "faqItems": []}
                    for collection in data:
                        cur.execute("SELECT payload FROM app_data WHERE collection = %s ORDER BY item_id", (collection,))
                        rows = cur.fetchall()
                        data[collection] = [row[0] for row in rows]

            if any(data[col] for col in ("users", "cars", "carDetails", "faqItems")):
                return data
        except Exception as exc:
            print(f"[DB] PostgreSQL read failed: {exc}")

    legacy = _load_legacy_db()
    if legacy:
        return legacy
    return {"users": [], "cars": [], "carDetails": [], "faqItems": []}


def write_db(data: dict) -> None:
    """Persist changes back to PostgreSQL while keeping the legacy JSON file as a backup."""
    payload = data or {}
    if initialize_database():
        try:
            with psycopg.connect(**_connection_kwargs(DB_NAME), autocommit=True) as conn:
                with conn.cursor() as cur:
                    for collection in ("users", "cars", "carDetails", "faqItems"):
                        cur.execute("DELETE FROM app_data WHERE collection = %s", (collection,))
                        for item in payload.get(collection, []):
                            if not isinstance(item, dict):
                                continue
                            item_id = item.get("id") or item.get("email") or item.get("carId") or uuid.uuid4().hex[:15]
                            cur.execute(
                                "INSERT INTO app_data (collection, item_id, payload) VALUES (%s, %s, %s)",
                                (collection, item_id, json.dumps(item)),
                            )
        except Exception as exc:
            print(f"[DB] PostgreSQL write failed: {exc}")

    if DB_PATH.exists() or payload:
        try:
            with DB_PATH.open("w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass


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
        user_id = payload.get("sub")
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
    # Rate-limit registrations per email/IP
    try:
        _check_rate(REGISTER_RATE, body.email, 6, RATE_WINDOW)
    except HTTPException:
        raise HTTPException(429, "Too many registration attempts, try later")

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
        "welcome_email_sent": False,
    }
    db["users"].append(user)
    write_db(db)
    send_auth_notification(user, "welcome")
    audit_log(user.get('email','unknown'), 'register', {'id': user['id']})
    return user


def _sanitize_str(s: str) -> str:
    # Basic sanitization: remove script tags and inline event handlers
    if not isinstance(s, str):
        return s
    s = re.sub(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", "", s, flags=re.I | re.S)
    s = re.sub(r"on\w+\s*=\s*\"[^\"]*\"", "", s, flags=re.I)
    s = re.sub(r"on\w+\s*=\s*'[^']*'", "", s, flags=re.I)
    return s


def sanitize_dict(obj):
    if isinstance(obj, dict):
        return {k: sanitize_dict(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_dict(v) for v in obj]
    if isinstance(obj, str):
        return _sanitize_str(obj)
    return obj


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

    if not password_ok and user.get("role") == "admin" and form.password == os.getenv("ADMIN_PASSWORD", "Admin@admin"):
        password_ok = True
        # Upgrade the stored admin password to bcrypt when the default admin password is used.
        new_hash = hash_password(form.password)
        for idx, candidate in enumerate(db["users"]):
            if candidate.get("id") == user.get("id"):
                db["users"][idx]["password"] = new_hash
                write_db(db)
                break

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
    first_login = not bool(user.get("welcome_email_sent"))
    if first_login:
        user["welcome_email_sent"] = True
        for idx, candidate in enumerate(db["users"]):
            if candidate.get("id") == user.get("id"):
                db["users"][idx] = user
                break
        write_db(db)
        send_auth_notification(user, "login")

    token = create_token({"sub": user["id"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "message": "Login successful." if not first_login else "Login successful. A confirmation email was sent if delivery is configured."
    }


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


def send_password_reset_email(user: dict, token: str) -> bool:
    reset_url = os.getenv("APP_BASE_URL", "http://localhost:8000") + f"/login.html?reset_token={token}"
    subject = "New Age Automotive password reset"
    body = (
        f"Hi {user.get('fname', 'there')},\n\n"
        "We received a request to reset your password for your New Age Automotive account.\n"
        "Use the token below to complete the reset.\n\n"
        f"Reset token: {token}\n\n"
        f"If you have a browser open, you can also visit: {reset_url}\n\n"
        "If you did not request this, please ignore this message."
    )
    return send_email(user["email"], subject, body)


@app.post('/auth/password-reset/request', summary='Request password reset')
def password_reset_request(body: PasswordResetRequest):
    db = read_db()
    user = next((u for u in db["users"] if u.get("email", "").lower() == body.email.lower()), None)
    if not user:
        return {"sent": False, "message": "If the email is registered, reset instructions have been sent."}

    token = create_token({"sub": user["id"], "purpose": "password_reset"}, expires_minutes=30)
    sent = send_password_reset_email(user, token)
    result = {
        "sent": sent,
        "message": "If your email is registered, reset instructions have been sent."
    }
    if not sent:
        result["reset_token"] = token
    return result


@app.post('/auth/password-reset/confirm', summary='Confirm password reset and set a new password')
def password_reset_confirm(body: PasswordResetConfirm):
    try:
        payload = jwt.decode(body.token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired reset token")

    if payload.get("purpose") != "password_reset":
        raise HTTPException(401, "Invalid reset token")

    user_id = payload.get("sub")
    db = read_db()
    idx = next((i for i, u in enumerate(db.get("users", [])) if u.get("id") == user_id), None)
    if idx is None:
        raise HTTPException(404, "User not found")

    db["users"][idx]["password"] = hash_password(body.new_password)
    write_db(db)
    return {"message": "Password updated successfully."}


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
    if not user_id:
        raise credentials_error

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
    audit_log(admin.get('email','admin'), 'delete_user', {'deleted_id': user_id})


# ─────────────────────────────────────────────
# 8. FILE UPLOAD ROUTE  — /upload/image
# ─────────────────────────────────────────────

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_SIZE_MB   = 5
REFERENCE_WIDTH = 529
REFERENCE_HEIGHT = 319


def _resize_image_bytes(contents: bytes, ext: str) -> bytes:
    """Resize uploaded images to the shared 529x319 reference format when possible."""
    if ext.lower() == ".svg":
        return contents

    try:
        from PIL import Image, ImageOps
    except ImportError:
        return contents

    try:
        with Image.open(io.BytesIO(contents)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
            elif img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            target_ratio = REFERENCE_WIDTH / REFERENCE_HEIGHT
            src_ratio = img.width / img.height
            if src_ratio > target_ratio:
                new_height = REFERENCE_HEIGHT
                new_width = int(new_height * src_ratio)
            else:
                new_width = REFERENCE_WIDTH
                new_height = int(new_width / src_ratio)

            resample_filter = getattr(getattr(Image, "Resampling", None), "LANCZOS", 1)
            resized = img.resize((new_width, new_height), resample_filter)
            left = (new_width - REFERENCE_WIDTH) // 2
            top = (new_height - REFERENCE_HEIGHT) // 2
            cropped = resized.crop((left, top, left + REFERENCE_WIDTH, top + REFERENCE_HEIGHT))

            if ext.lower() in {".jpg", ".jpeg", ".webp"}:
                cropped = cropped.convert("RGB")

            out = io.BytesIO()
            if ext.lower() in {".jpg", ".jpeg"}:
                cropped.save(out, format="JPEG", quality=90)
            elif ext.lower() == ".webp":
                cropped.save(out, format="WEBP", quality=90)
            else:
                cropped.save(out, format="PNG")
            return out.getvalue()
    except Exception as exc:
        print(f"[WARN] Image resize failed, using original file: {exc}")
        return contents


def _detect_image_kind(contents: bytes, provided_type: Optional[str], filename: str) -> tuple[Optional[str], Optional[str]]:
    """Infer a normalized image MIME type and extension from content, filename or request headers."""
    normalized_type = (provided_type or "").strip().lower()
    normalized_type = {
        "image/jpg": "image/jpeg",
        "image/jpe": "image/jpeg",
        "image/pjpeg": "image/jpeg",
        "image/x-jpg": "image/jpeg",
        "image/x-png": "image/png",
    }.get(normalized_type, normalized_type)

    if normalized_type in {"image/svg+xml", "image/svg"}:
        return "image/svg+xml", ".svg"

    if contents.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if contents.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if len(contents) >= 12 and contents[0:4] == b"RIFF" and contents[8:12] == b"WEBP":
        return "image/webp", ".webp"

    if b"<svg" in contents[:256].lower() or contents[:4].lower() == b"<?xm":
        return "image/svg+xml", ".svg"

    try:
        from PIL import Image
        with Image.open(io.BytesIO(contents)) as img:
            img_format = (img.format or "").lower()
            if img_format in {"jpeg", "jpg"}:
                return "image/jpeg", ".jpg"
            if img_format == "png":
                return "image/png", ".png"
            if img_format == "webp":
                return "image/webp", ".webp"
    except Exception:
        pass

    if normalized_type in ALLOWED_TYPES:
        ext_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
        }
        return normalized_type, ext_map.get(normalized_type)

    suffix = Path(filename or "").suffix.lower()
    ext_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }
    if suffix in ext_map:
        return ext_map[suffix], suffix

    return None, None


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

    # Read the upload in chunks to enforce size limits without unbounded memory growth
    size = 0
    chunks = []
    while True:
        chunk = await file.read(1024 * 64)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"File exceeds {MAX_SIZE_MB} MB limit")
        chunks.append(chunk)
    contents = b"".join(chunks)

    # Validate the uploaded content using signatures and filename hints rather than
    # relying only on the browser-provided MIME type, which can vary across clients.
    mime_type, ext = _detect_image_kind(contents, file.content_type, file.filename or "")
    if not mime_type or not ext:
        raise HTTPException(400, "Uploaded file is not a recognized image")

    if mime_type == "image/svg+xml":
        # Basic SVG safety checks — disallow scripts and inline event handlers
        try:
            txt = contents.decode("utf-8", errors="ignore").lower()
        except Exception:
            raise HTTPException(400, "Invalid SVG file encoding")
        if "<script" in txt or re.search(r"on\w+\s*=", txt):
            raise HTTPException(400, "SVG contains disallowed script or event handlers")
    else:
        if mime_type not in ALLOWED_TYPES:
            raise HTTPException(400, f"Unsupported image format: {mime_type}")

    # Resize uploaded images to the standard 529x319 reference format before saving.
    contents = _resize_image_bytes(contents, ext)

    # Create a server-generated filename and write to disk
    filename = f"{new_id()}{ext}"
    dest = UPLOAD_DIR / filename
    with open(dest, "wb") as f:
        f.write(contents)

    # If Pillow is available, also attempt to produce a WebP variant for adaptive loading
    # Optional WebP conversion skipped if Pillow is not installed.

    audit_log(_admin.get('email','admin'), 'upload_image', {'filename': str(dest)})

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
def api_create_cars(body: object = Body(...), _admin=Depends(require_admin)):
    if not body:
        raise HTTPException(400, "Missing body")
    db = read_db()
    # Sanitize incoming payloads to remove embedded scripts/event handlers
    body = sanitize_dict(body)
    items = body if isinstance(body, list) else [body]
    created = []
    for item in items:
        if not isinstance(item, dict):
            # Skip non-dict items — maintain backward compatibility but ignore malformed entries
            item = {}
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


@app.get('/sitemap.xml', include_in_schema=False)
def sitemap():
    """Dynamically generate a sitemap listing car detail pages and main routes."""
    db = read_db()
    host = os.getenv('SITE_URL', 'http://localhost:8000').rstrip('/')
    urls = [f"{host}/", f"{host}/car-listings.html", f"{host}/sell-your-car.html"]
    for c in db.get('cars', []):
        urls.append(f"{host}/car-detail/{c['id']}")
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        xml.append('<url>')
        xml.append(f"<loc>{u}</loc>")
        xml.append('</url>')
    xml.append('</urlset>')
    return Response('\n'.join(xml), media_type='application/xml')


@app.get('/robots.txt', include_in_schema=False)
def robots():
    host = os.getenv('SITE_URL', 'http://localhost:8000').rstrip('/')
    txt = f"User-agent: *\nDisallow:\nSitemap: {host}/sitemap.xml\n"
    return Response(txt, media_type='text/plain')


@app.get('/api/cars/{car_id}')
def api_get_car(car_id: str):
    db = read_db()
    car = next((c for c in db.get('cars', []) if c['id'] == car_id), None)
    if not car:
        raise HTTPException(404, "Not found")
    return car


@app.put('/api/cars/{car_id}')
def api_update_car(car_id: str, body: dict = Body(...), _admin=Depends(require_admin)):
    db = read_db()
    idx = next((i for i, c in enumerate(db.get('cars', [])) if c['id'] == car_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    if not isinstance(body, dict):
        raise HTTPException(400, "Invalid body")
    db['cars'][idx].update(body)
    write_db(db)
    return db['cars'][idx]


@app.delete('/api/cars/{car_id}')
def api_delete_car(car_id: str, _admin=Depends(require_admin)):
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


@app.get('/car-detail/{car_id}', include_in_schema=False)
def car_detail_ssr(car_id: str, request: "Request"):
    """Serve `car-detail.html` with injected JSON-LD structured data and canonical link for crawlers.

    This keeps the UI unchanged but improves SEO for individual car pages.
    """
    db = read_db()
    car = next((c for c in db.get('cars', []) if c['id'] == car_id), None)
    if not car:
        raise HTTPException(404, "Not found")

    # read the static HTML and inject JSON-LD into <head>
    p = Path('car-detail.html')
    if not p.exists():
        return FileResponse('car-detail.html')
    html = p.read_text(encoding='utf-8')
    host = os.getenv('SITE_URL', f"{request.url.scheme}://{request.url.hostname}:{request.url.port}")
    canonical = f"<link rel=\"canonical\" href=\"{host}/car-detail/{car_id}\" />"
    ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": car.get('name',''),
        "description": car.get('description',''),
        "image": [f"{host}/{car.get('img','')}"] if car.get('img') else [],
        "sku": car.get('id'),
        "offers": {
            "@type": "Offer",
            "price": car.get('price',''),
            "availability": "https://schema.org/InStock"
        }
    }
    inject = f"\n{canonical}\n<script type=\"application/ld+json\">{json.dumps(ld)}</script>\n"
    if '</head>' in html:
        html = html.replace('</head>', inject + '</head>')
    return Response(content=html, media_type='text/html')


@app.post('/api/car-details')
def api_create_car_detail(body: dict = Body(...), _admin=Depends(require_admin)):
    if not body:
        raise HTTPException(400, "Missing body")
    if not isinstance(body, dict):
        raise HTTPException(400, "Invalid body")
    db = read_db()
    base = {
        "name": body.get("name", ""),
        "miles": body.get("miles", ""),
        "trans": body.get("trans", ""),
        "fuel": body.get("fuel", ""),
        "year": body.get("year", ""),
        "price": body.get("price", ""),
        "img": body.get("img", ""),
        "images": body.get("images") if isinstance(body.get("images"), list) else [],
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
def api_update_car_detail(detail_id: str, body: dict = Body(...), _admin=Depends(require_admin)):
    db = read_db()
    idx = next((i for i, d in enumerate(db.get('carDetails', [])) if d['id'] == detail_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    if not isinstance(body, dict):
        raise HTTPException(400, "Invalid body")
    if isinstance(body.get("images"), list):
        db['carDetails'][idx]['images'] = body['images']
    db['carDetails'][idx].update({k: v for k, v in body.items() if k != 'images'})
    write_db(db)
    return db['carDetails'][idx]


@app.delete('/api/car-details/{detail_id}')
def api_delete_car_detail(detail_id: str, _admin=Depends(require_admin)):
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
def api_create_user(body: dict = Body(...)):
    if not body:
        raise HTTPException(400, "Missing body")
    if not isinstance(body, dict):
        raise HTTPException(400, "Invalid body")
    data = body
    db = read_db()
    # duplicate email check
    if any(u.get('email') == data.get('email') for u in db.get('users', [])):
        raise HTTPException(400, "Email already registered")
    # Keep password storage compatible with older client (base64)
    user = {
        "fname": data.get('fname', ''),
        "lname": data.get('lname', ''),
        "email": data.get('email', ''),
        "phone": data.get('phone', ''),
        "role": data.get('role', 'user'),
        "password": data.get('password', ''),
    }
    rec = create_record(db, 'users', user)
    write_db(db)
    return rec


@app.put('/api/users/{user_id}')
def api_update_user(user_id: str, body: dict = Body(...)):
    db = read_db()
    idx = next((i for i, u in enumerate(db.get('users', [])) if u['id'] == user_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    if not isinstance(body, dict):
        raise HTTPException(400, "Invalid body")
    data = body
    # check duplicate email
    if data.get('email') and any(u.get('email') == data.get('email') and u.get('id') != user_id for u in db.get('users', [])):
        raise HTTPException(400, "Email already registered")
    db['users'][idx].update(data)
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


@app.get('/api/faq')
def api_list_faq():
    db = read_db()
    items = list(db.get('faqItems', []))
    items.reverse()
    return items


@app.post('/api/faq')
def api_create_faq(body: dict = Body(...)):
    if not body or not isinstance(body, dict):
        raise HTTPException(400, "Missing or invalid body")
    body = sanitize_dict(body)
    question = body.get('question', '').strip()
    answer = body.get('answer', '').strip()
    category = body.get('category', 'general').strip() or 'general'
    if not question or not answer:
        raise HTTPException(400, "Question and answer are required")
    db = read_db()
    item = {
        'question': question,
        'answer': answer,
        'category': category,
    }
    rec = create_record(db, 'faqItems', item)
    write_db(db)
    return rec


@app.put('/api/faq/{faq_id}')
def api_update_faq(faq_id: str, body: dict = Body(...)):
    if not body or not isinstance(body, dict):
        raise HTTPException(400, "Missing or invalid body")
    body = sanitize_dict(body)
    question = body.get('question', '').strip()
    answer = body.get('answer', '').strip()
    category = body.get('category', 'general').strip() or 'general'
    if not question or not answer:
        raise HTTPException(400, "Question and answer are required")
    db = read_db()
    idx = next((i for i, item in enumerate(db.get('faqItems', [])) if item['id'] == faq_id), None)
    if idx is None:
        raise HTTPException(404, "Not found")
    db['faqItems'][idx].update({
        'question': question,
        'answer': answer,
        'category': category,
    })
    write_db(db)
    return db['faqItems'][idx]


@app.delete('/api/faq/{faq_id}')
def api_delete_faq(faq_id: str):
    db = read_db()
    before = len(db.get('faqItems', []))
    db['faqItems'] = [item for item in db.get('faqItems', []) if item['id'] != faq_id]
    if len(db['faqItems']) == before:
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
