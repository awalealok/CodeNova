import hashlib
import secrets
import smtplib
import ssl
import os
import re
import uuid
import warnings
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend import models
from backend.config import DEMO_AUTH_MODE
from backend.ai_engine.embeddings import (
    EmbeddingProviderError,
    OpenAICompatibleEmbeddingProvider,
)
from backend.ai_engine.provider import AIProviderError, OpenAICompatibleProvider
from backend.ai_engine.review import run_ai_review
from backend.database.connection import Base, engine, get_db, check_database_connection
from backend.document_engine.parser import (
    MAX_DOCUMENT_BYTES,
    DocumentParseError,
    extract_text,
    validate_file_content,
)
from backend.models import (
    AuditEvent,
    Asset,
    Content,
    Decision,
    Fact,
    Finding,
    FindingReviewStatus,
    GuidelineDoc,
    LexiconTerm,
    PasswordResetToken,
    Revision,
    Rule,
    User,
    UserRole,
    Workspace,
)
from backend.rule_engine.checks import run_deterministic_checks, validate_finding_citation
from backend.schemas.api import (
    ContentCreate,
    DecisionCreate,
    DemoLoginRequest,
    DemoRegisterRequest,
    FactCreate,
    LexiconCreate,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    ProfileUpdate,
    RegisterRequest,
    RuleCreate,
)
from backend.services.audit import record_event
from backend.services.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

app = FastAPI(
    title="INKLOOM AI",
    description="Evidence-backed brand consistency review platform",
    version="1.2.0",
)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
APP_ENV = os.getenv("APP_ENV", "development").lower()
IS_PRODUCTION = APP_ENV in {"production", "prod"}
SESSION_COOKIE = "__Host-inkloom_session" if IS_PRODUCTION else "inkloom_session"

# CORS configuration
configured_origins = bool(os.getenv("CORS_ORIGINS", "").strip())

raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
)

origins = [
    origin.strip().rstrip("/")
    for origin in raw_origins.split(",")
    if origin.strip()
]

# Production CORS validation
if IS_PRODUCTION:
    if not configured_origins or not origins or "*" in origins:
        raise RuntimeError(
            "Production requires explicit trusted HTTPS CORS_ORIGINS."
        )

    if any(
        urlsplit(origin).scheme != "https"
        or not urlsplit(origin).netloc
        for origin in origins
    ):
        raise RuntimeError(
            "Every production CORS origin must use HTTPS."
        )

    frontend_origin = os.getenv(
        "FRONTEND_BASE_URL", ""
    ).rstrip("/")

    if not frontend_origin or frontend_origin not in origins:
        raise RuntimeError(
            "Production FRONTEND_BASE_URL must match a trusted CORS origin."
        )

# Register CORS middleware only once
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
UPLOAD_ROOT = Path(
    os.getenv("INKLOOM_UPLOAD_ROOT", str(Path(__file__).resolve().parents[1] / "uploads"))
).resolve()
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


@app.middleware("http")
async def enforce_transport_and_cookie_origin(request: Request, call_next):
    # Enforce HTTPS in production. CORSMiddleware is responsible for
    # validating browser origins and handling CORS preflight requests.
    if IS_PRODUCTION and request.url.scheme != "https":
        return JSONResponse(
            {"detail": "HTTPS is required."},
            status_code=400,
        )

    return await call_next(request)


@app.on_event("startup")
def startup():
    if not IS_PRODUCTION and engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=int(os.getenv("ACCESS_TOKEN_MINUTES", "720")) * 60,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        path="/",
    )


def _commit(db: Session):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "The operation conflicts with an existing record.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(500, "Database operation failed.") from exc


def _audit(
    db: Session,
    user: User,
    event_type: str,
    entity_type: str,
    entity_id: uuid.UUID,
    description: str,
    metadata: dict | None = None,
):
    record_event(
        db,
        user.workspace_id,
        user.id,
        event_type,
        entity_type,
        entity_id,
        description,
        metadata,
    )


def _evidence_embedding(statement: str):
    provider = OpenAICompatibleEmbeddingProvider()
    if not provider.configured:
        return None, None
    try:
        return provider.embed_texts([statement])[0], provider.model
    except EmbeddingProviderError as exc:
        raise HTTPException(503, str(exc)) from exc


def _require_roles(*roles: UserRole):
    def checker(user: User = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Insufficient role permissions.")
        return user

    return checker


def _demo_auth_user(db: Session) -> tuple[User, Workspace]:
    try:
        workspace = db.scalar(
            select(Workspace).where(Workspace.slug == "inkloom-round2-demo")
        )
        if workspace is None:
            workspace = Workspace(
                id=uuid.uuid4(),
                name="INKLOOM AI Round 2 Demo",
                slug="inkloom-round2-demo",
            )
            db.add(workspace)
            db.flush()

        user = db.scalar(
            select(User).where(
                User.workspace_id == workspace.id,
                User.email == "round2-demo@demo.invalid",
            )
        )
        if user is None:
            user = User(
                id=uuid.uuid4(),
                workspace_id=workspace.id,
                full_name="Round 2 Demo User",
                email="round2-demo@demo.invalid",
                password_hash=hash_password(secrets.token_urlsafe(32)),
                role=UserRole.ADMIN,
            )
            db.add(user)
            db.flush()
            _audit(
                db,
                user,
                "workspace.created",
                "workspace",
                workspace.id,
                "Created the Round 2 demo workspace and administrator.",
            )
        elif not user.is_active:
            user.is_active = True
            user.token_version += 1
        _commit(db)
        return user, workspace
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        workspace = db.scalar(
            select(Workspace).where(Workspace.slug == "inkloom-round2-demo")
        )
        if workspace is None:
            raise
        user = db.scalar(
            select(User).where(
                User.workspace_id == workspace.id,
                User.email == "round2-demo@demo.invalid",
                User.is_active.is_(True),
            )
        )
        if user is None:
            raise
        return user, workspace


def current_user(
    request: Request,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "A valid session is required.")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token.")
    try:
        user_id = uuid.UUID(payload["sub"])
        workspace_id = uuid.UUID(payload["workspace_id"])
        token_version = payload.get("token_version", 0)
    except (KeyError, TypeError, ValueError):
        raise HTTPException(401, "Invalid token claims.")
    if isinstance(token_version, bool) or not isinstance(token_version, int):
        raise HTTPException(401, "Invalid token claims.")
    user = db.scalar(
        select(User).where(
            User.id == user_id,
            User.workspace_id == workspace_id,
            User.is_active.is_(True),
        )
    )
    if not user:
        raise HTTPException(401, "User not found or inactive.")
    if user.token_version != token_version:
        raise HTTPException(401, "Session has been revoked.")
    return user


def _read_upload(file: UploadFile) -> bytes:
    chunks = []
    size = 0
    while size <= MAX_DOCUMENT_BYTES:
        chunk = file.file.read(min(64 * 1024, MAX_DOCUMENT_BYTES + 1 - size))
        if not chunk:
            break
        chunks.append(chunk)
        size += len(chunk)
    if size > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "The uploaded file exceeds the 15 MB limit.")
    return b"".join(chunks)


def _json_asset(asset: Asset):
    return {
        "id": str(asset.id),
        "name": asset.name,
        "asset_type": asset.asset_type,
        "description": asset.description,
        "version": asset.version,
        "is_active": asset.is_active,
        "file_url": f"/api/assets/{asset.id}/file",
        "created_at": asset.created_at.isoformat(),
    }


def _send_password_reset_email(email: str, link: str):
    host = os.getenv("SMTP_HOST")
    sender = os.getenv("SMTP_FROM")
    if not host or not sender:
        raise RuntimeError("Password recovery email is not configured.")
    message = EmailMessage()
    message["Subject"] = "Reset your INKLOOM AI password"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        "A password reset was requested for your INKLOOM AI account.\n\n"
        f"Use this single-use link within 30 minutes:\n{link}\n\n"
        "If you did not request this, you can ignore this message."
    )
    port = int(os.getenv("SMTP_PORT", "587"))
    timeout = int(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))
    with smtplib.SMTP(host, port, timeout=timeout) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp_user = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        if smtp_user and smtp_password:
            smtp.login(smtp_user, smtp_password)
        smtp.send_message(message)


def _json_guideline(document: GuidelineDoc):
    return {
        "id": str(document.id),
        "title": document.title,
        "filename": document.original_filename,
        "file_type": document.file_type,
        "version": document.version,
        "extracted_text": document.extracted_text,
        "created_at": document.created_at.isoformat(),
    }


def _json_rule(rule: Rule):
    return {
        "id": str(rule.id),
        "guideline_doc_id": str(rule.guideline_doc_id),
        "stable_id": rule.stable_id,
        "statement": rule.statement,
        "version": rule.version,
        "created_at": rule.created_at.isoformat(),
    }


def _json_fact(fact: Fact):
    return {
        "id": str(fact.id),
        "statement": fact.statement,
        "source_reference": fact.source_reference,
        "valid_from": fact.valid_from.isoformat() if fact.valid_from else None,
        "valid_until": fact.valid_until.isoformat() if fact.valid_until else None,
        "created_at": fact.created_at.isoformat(),
    }


def _json_lexicon(term: LexiconTerm):
    return {
        "id": str(term.id),
        "term": term.term,
        "term_category": term.term_category,
        "preferred_replacement": term.preferred_replacement,
        "explanation": term.explanation,
        "is_active": term.is_active,
        "created_at": term.created_at.isoformat(),
    }


def _json_content(content: Content, revision: Revision | None = None):
    return {
        "id": str(content.id),
        "title": content.title,
        "channel": content.channel,
        "content_type": content.content_type,
        "provenance": content.provenance,
        "workflow_status": content.workflow_status,
        "body": revision.body if revision else None,
        "revision_number": revision.revision_number if revision else None,
        "created_at": content.created_at.isoformat(),
        "updated_at": content.updated_at.isoformat(),
    }


def _json_finding(finding: Finding):
    status = (
        finding.review_status.value
        if isinstance(finding.review_status, FindingReviewStatus)
        else str(finding.review_status)
    )
    return {
        "id": str(finding.id),
        "content_id": str(finding.content_id),
        "revision_id": str(finding.revision_id),
        "rule_id": str(finding.rule_id) if finding.rule_id else None,
        "fact_id": str(finding.fact_id) if finding.fact_id else None,
        "finding_category": finding.finding_category,
        "category": finding.finding_category,
        "severity": finding.severity,
        "quoted_span": finding.quoted_span,
        "start_offset": finding.start_offset,
        "end_offset": finding.end_offset,
        "explanation": finding.explanation,
        "suggested_correction": finding.suggested_correction,
        "confidence_score": float(finding.confidence_score),
        "source_citation": finding.source_citation,
        "review_status": status,
        "created_at": finding.created_at.isoformat(),
    }


@app.get("/")
def home():
    return {"project": "INKLOOM AI", "status": "running", "api_docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy", "service": "INKLOOM AI Backend"}


@app.get("/health/database")
def database_health():
    if not check_database_connection():
        raise HTTPException(503, "Database connection failed.")
    return {"status": "healthy", "database": "connected"}


@app.get("/api/ai/status")
def ai_status(user: User = Depends(current_user)):
    provider = OpenAICompatibleProvider()
    embeddings = OpenAICompatibleEmbeddingProvider()
    vector_extension_available = False
    if engine.dialect.name == "postgresql":
        try:
            with engine.connect() as connection:
                vector_extension_available = bool(
                    connection.execute(
                        text(
                            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
                        )
                    ).scalar_one()
                )
        except SQLAlchemyError:
            vector_extension_available = False
    return {
        "enabled": provider.enabled,
        "provider": "openai_compatible" if provider.enabled else "deterministic_only",
        "model": provider.model if provider.enabled else None,
        "embedding_configured": embeddings.configured,
        "vector_store_available": vector_extension_available,
        "note": "AI review requires a configured embedding provider and PostgreSQL pgvector; credentials are not connectivity-tested here.",
    }


@app.post("/api/auth/register")
@limiter.limit("10/hour")
def register(
    request: Request,
    payload: RegisterRequest | DemoRegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    if DEMO_AUTH_MODE:
        user, workspace = _demo_auth_user(db)
        token = create_access_token(
            str(user.id), str(workspace.id), user.role.value, user.token_version
        )
        _set_session_cookie(response, token)
        return {
            "user": {
                "id": str(user.id),
                "name": user.full_name,
                "email": user.email,
                "role": user.role.value,
                "workspace_id": str(workspace.id),
                "workspace_name": workspace.name,
            },
        }
    if isinstance(payload, DemoRegisterRequest):
        raise HTTPException(422, "Invalid registration details.")
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email is already registered.")
    slug = re.sub(r"[^a-z0-9]+", "-", payload.workspace_name.lower()).strip("-")
    workspace = Workspace(
        id=uuid.uuid4(),
        name=payload.workspace_name,
        slug=f"{slug or 'workspace'}-{uuid.uuid4().hex[:8]}",
    )
    db.add(workspace)
    user = User(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        full_name=payload.full_name,
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.flush()
    _audit(
        db,
        user,
        "workspace.created",
        "workspace",
        workspace.id,
        "Created workspace and initial administrator.",
    )
    _commit(db)
    token = create_access_token(
        str(user.id), str(workspace.id), user.role.value, user.token_version
    )
    _set_session_cookie(response, token)
    return {
        "user": {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "workspace_id": str(workspace.id),
            "workspace_name": workspace.name,
        },
    }


@app.post("/api/auth/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: LoginRequest | DemoLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    if DEMO_AUTH_MODE:
        user, workspace = _demo_auth_user(db)
        token = create_access_token(
            str(user.id), str(workspace.id), user.role.value, user.token_version
        )
        _set_session_cookie(response, token)
        return {
            "user": {
                "id": str(user.id),
                "name": user.full_name,
                "email": user.email,
                "role": user.role.value,
                "workspace_id": str(workspace.id),
                "workspace_name": workspace.name,
            },
        }
    if isinstance(payload, DemoLoginRequest):
        raise HTTPException(422, "Invalid login details.")
    user = db.scalar(
        select(User).where(
            User.email == str(payload.email).lower(),
            User.is_active.is_(True),
        )
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    workspace = db.get(Workspace, user.workspace_id)
    if not workspace:
        raise HTTPException(401, "User workspace is unavailable.")
    token = create_access_token(
        str(user.id), str(user.workspace_id), user.role.value, user.token_version
    )
    _set_session_cookie(response, token)
    return {
        "user": {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "workspace_id": str(user.workspace_id),
            "workspace_name": workspace.name,
        },
    }


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        secure=IS_PRODUCTION,
        httponly=True,
        samesite="lax",
    )
    return {"status": "signed_out"}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace = db.get(Workspace, user.workspace_id)
    if not workspace:
        raise HTTPException(401, "User workspace is unavailable.")
    return {
        "id": str(user.id),
        "name": user.full_name,
        "email": user.email,
        "role": user.role.value,
        "workspace_id": str(user.workspace_id),
        "workspace_name": workspace.name,
    }


@app.patch("/api/auth/me")
@limiter.limit("15/hour")
def update_profile(
    request: Request,
    payload: ProfileUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    changes = payload.model_dump(exclude_unset=True)
    if "full_name" in changes:
        user.full_name = changes["full_name"].strip()
    if "email" in changes and changes["email"] is not None:
        email = str(changes["email"]).lower()
        duplicate = db.scalar(
            select(User).where(
                User.workspace_id == user.workspace_id,
                User.email == email,
                User.id != user.id,
            )
        )
        if duplicate:
            raise HTTPException(409, "That email is already used in this workspace.")
        user.email = email
    _audit(db, user, "user.profile_updated", "user", user.id, "Updated account profile.")
    _commit(db)
    return me(user, db)


@app.post("/api/auth/password-reset/request", status_code=202)
@limiter.limit("3/hour")
def request_password_reset(
    request: Request,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_from = os.getenv("SMTP_FROM")
    frontend_url = os.getenv("FRONTEND_BASE_URL")
    if not smtp_host or not smtp_from or not frontend_url:
        raise HTTPException(503, "Password recovery is not configured on this server.")
    user = db.scalar(
        select(User).where(
            User.email == str(payload.email).lower(),
            User.is_active.is_(True),
        )
    )
    if user:
        raw_token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.add(reset_token)
        _audit(
            db,
            user,
            "user.password_reset_requested",
            "user",
            user.id,
            "Requested a password reset email.",
        )
        _commit(db)
        link = (
            f"{frontend_url.rstrip('/')}/reset-password?"
            f"token={raw_token}"
        )
        try:
            _send_password_reset_email(user.email, link)
        except (OSError, smtplib.SMTPException, RuntimeError) as exc:
            reset_token.used_at = datetime.now(timezone.utc)
            _commit(db)
            raise HTTPException(503, "Password reset email could not be sent.") from exc
    return {"status": "If an account exists, password reset instructions have been sent."}


@app.post("/api/auth/password-reset/confirm")
@limiter.limit("5/hour")
def confirm_password_reset(
    request: Request,
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    reset_token = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
    )
    now = datetime.now(timezone.utc)
    if not reset_token:
        raise HTTPException(400, "Reset link is invalid or expired.")
    expires_at = reset_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        reset_token.used_at = now
        _commit(db)
        raise HTTPException(400, "Reset link is invalid or expired.")
    user = db.get(User, reset_token.user_id)
    if not user or not user.is_active:
        reset_token.used_at = now
        _commit(db)
        raise HTTPException(400, "Reset link is invalid or expired.")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    pending_tokens = db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    ).all()
    for pending_token in pending_tokens:
        pending_token.used_at = now
    _commit(db)
    return {"status": "Password reset successful. Sign in with your new password."}


@app.post("/api/guidelines/upload")
def upload_guideline(
    file: UploadFile = File(...),
    user: User = Depends(_require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER)),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx", ".txt", ".md"}:
        raise HTTPException(400, "Only PDF, DOCX, TXT and MD are supported.")
    data = _read_upload(file)
    try:
        validate_file_content(filename, data)
        extracted = extract_text(filename, data)
    except DocumentParseError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not extracted:
        raise HTTPException(
            422, "No selectable text was found. Scanned PDF OCR is not enabled."
        )

    document_id = uuid.uuid4()
    directory = UPLOAD_ROOT / "guidelines" / str(user.workspace_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{document_id}{suffix}"
    relative_key = target.relative_to(UPLOAD_ROOT).as_posix()
    try:
        target.write_bytes(data)
        document = GuidelineDoc(
            id=document_id,
            workspace_id=user.workspace_id,
            uploaded_by=user.id,
            title=Path(filename).stem[:200] or "Guideline",
            original_filename=filename[:255],
            file_type=suffix.lstrip("."),
            storage_key=relative_key,
            extracted_text=extracted,
        )
        db.add(document)
        _audit(
            db,
            user,
            "guideline.uploaded",
            "guideline",
            document_id,
            "Uploaded and extracted a guideline document.",
            {"filename": filename[:255], "file_type": suffix.lstrip(".")},
        )
        _commit(db)
    except (OSError, SQLAlchemyError, HTTPException):
        db.rollback()
        target.unlink(missing_ok=True)
        raise
    return _json_guideline(document)


@app.get("/api/guidelines")
def list_guidelines(user: User = Depends(current_user), db: Session = Depends(get_db)):
    documents = db.scalars(
        select(GuidelineDoc)
        .where(GuidelineDoc.workspace_id == user.workspace_id)
        .order_by(GuidelineDoc.created_at.desc())
    ).all()
    return [_json_guideline(document) for document in documents]


@app.post("/api/assets/upload")
@limiter.limit("20/hour")
def upload_asset(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=200),
    description: str | None = Form(default=None, max_length=5000),
    user: User = Depends(_require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER)),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename or "").suffix.lower()
    expected_formats = {
        ".png": ("PNG", "image/png"),
        ".jpg": ("JPEG", "image/jpeg"),
        ".jpeg": ("JPEG", "image/jpeg"),
        ".webp": ("WEBP", "image/webp"),
    }
    if suffix not in expected_formats:
        raise HTTPException(400, "Brand assets must be PNG, JPEG or WebP images.")
    data = _read_upload(file)
    if not data:
        raise HTTPException(400, "The uploaded asset is empty.")
    expected_format, media_type = expected_formats[suffix]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(BytesIO(data))
            if image.format != expected_format or image.width * image.height > 40_000_000:
                raise HTTPException(400, "The image format or dimensions are not supported.")
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(400, "The uploaded file is not a valid supported image.") from exc
    clean_name = name.strip()
    if not clean_name or any(ord(character) < 32 for character in clean_name):
        raise HTTPException(400, "Asset name is invalid.")

    relative_key = f"assets/{user.workspace_id}/{uuid.uuid4().hex}{suffix}"
    target = (UPLOAD_ROOT / relative_key).resolve()
    if UPLOAD_ROOT not in target.parents:
        raise HTTPException(400, "Asset storage path is invalid.")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.write_bytes(data)
        asset = Asset(
            id=uuid.uuid4(),
            workspace_id=user.workspace_id,
            name=clean_name,
            asset_type=media_type,
            storage_key=relative_key,
            description=description.strip() if description else None,
        )
        db.add(asset)
        _audit(db, user, "asset.uploaded", "asset", asset.id, "Uploaded a brand asset.")
        _commit(db)
    except (OSError, SQLAlchemyError, HTTPException):
        db.rollback()
        target.unlink(missing_ok=True)
        raise
    return _json_asset(asset)


@app.get("/api/assets")
def list_assets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    assets = db.scalars(
        select(Asset)
        .where(Asset.workspace_id == user.workspace_id, Asset.is_active.is_(True))
        .order_by(Asset.created_at.desc())
    ).all()
    return [_json_asset(asset) for asset in assets]


@app.get("/api/assets/{asset_id}/file")
def get_asset_file(
    asset_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    asset = db.scalar(
        select(Asset).where(
            Asset.id == asset_id,
            Asset.workspace_id == user.workspace_id,
            Asset.is_active.is_(True),
        )
    )
    if not asset:
        raise HTTPException(404, "Asset not found in this workspace.")
    target = (UPLOAD_ROOT / asset.storage_key).resolve()
    if UPLOAD_ROOT not in target.parents or not target.is_file():
        raise HTTPException(404, "Asset file is unavailable.")
    return FileResponse(
        target,
        media_type=asset.asset_type,
        filename=asset.name,
        content_disposition_type="inline",
    )


@app.post("/api/assets/{asset_id}/archive")
def archive_asset(
    asset_id: uuid.UUID,
    user: User = Depends(_require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER)),
    db: Session = Depends(get_db),
):
    asset = db.scalar(
        select(Asset).where(
            Asset.id == asset_id,
            Asset.workspace_id == user.workspace_id,
            Asset.is_active.is_(True),
        )
    )
    if not asset:
        raise HTTPException(404, "Asset not found in this workspace.")
    asset.is_active = False
    _audit(db, user, "asset.archived", "asset", asset.id, "Archived a brand asset.")
    _commit(db)
    return _json_asset(asset)


@app.post("/api/rules")
def create_rule(
    payload: RuleCreate,
    user: User = Depends(_require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER)),
    db: Session = Depends(get_db),
):
    document = db.scalar(
        select(GuidelineDoc).where(
            GuidelineDoc.id == payload.guideline_doc_id,
            GuidelineDoc.workspace_id == user.workspace_id,
        )
    )
    if not document:
        raise HTTPException(404, "Guideline not found in this workspace.")
    rule = Rule(
        id=uuid.uuid4(),
        workspace_id=user.workspace_id,
        guideline_doc_id=document.id,
        stable_id=payload.stable_id.strip(),
        statement=payload.statement.strip(),
        version=payload.version,
    )
    rule.embedding, rule.embedding_model = _evidence_embedding(rule.statement)
    db.add(rule)
    _audit(db, user, "rule.created", "rule", rule.id, "Added an approved rule.")
    _commit(db)
    response = _json_rule(rule)
    response["embedding_status"] = "ready" if rule.embedding is not None else "not_configured"
    return response


@app.get("/api/rules")
def list_rules(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rules = db.scalars(
        select(Rule)
        .where(Rule.workspace_id == user.workspace_id)
        .order_by(Rule.stable_id, Rule.version.desc())
    ).all()
    return [_json_rule(rule) for rule in rules]


@app.post("/api/facts")
def create_fact(
    payload: FactCreate,
    user: User = Depends(_require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER)),
    db: Session = Depends(get_db),
):
    fact = Fact(
        id=uuid.uuid4(),
        workspace_id=user.workspace_id,
        owner_id=user.id,
        statement=payload.statement.strip(),
        source_reference=payload.source_reference,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
    )
    fact.embedding, fact.embedding_model = _evidence_embedding(fact.statement)
    db.add(fact)
    _audit(db, user, "fact.created", "fact", fact.id, "Added an approved fact.")
    _commit(db)
    response = _json_fact(fact)
    response["embedding_status"] = "ready" if fact.embedding is not None else "not_configured"
    return response


@app.get("/api/facts")
def list_facts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    facts = db.scalars(
        select(Fact)
        .where(Fact.workspace_id == user.workspace_id)
        .order_by(Fact.created_at.desc())
    ).all()
    return [_json_fact(fact) for fact in facts]


@app.post("/api/lexicon")
def create_lexicon_term(
    payload: LexiconCreate,
    user: User = Depends(_require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER)),
    db: Session = Depends(get_db),
):
    term = LexiconTerm(
        id=uuid.uuid4(),
        workspace_id=user.workspace_id,
        term=payload.term.strip(),
        term_category=payload.term_category,
        preferred_replacement=payload.preferred_replacement,
        explanation=payload.explanation,
    )
    db.add(term)
    _audit(
        db,
        user,
        "lexicon.created",
        "lexicon_term",
        term.id,
        "Added a terminology entry.",
    )
    _commit(db)
    return _json_lexicon(term)


@app.get("/api/lexicon")
def list_lexicon(user: User = Depends(current_user), db: Session = Depends(get_db)):
    terms = db.scalars(
        select(LexiconTerm)
        .where(LexiconTerm.workspace_id == user.workspace_id)
        .order_by(LexiconTerm.term)
    ).all()
    return [_json_lexicon(term) for term in terms]


def _create_content(
    db: Session,
    user: User,
    title: str,
    body: str,
    channel: str | None,
    content_type: str,
    provenance: str | None,
    canonical_content_reference: str | None = None,
):
    content = Content(
        id=uuid.uuid4(),
        workspace_id=user.workspace_id,
        submitted_by=user.id,
        title=title.strip(),
        channel=channel,
        content_type=content_type,
        provenance=provenance,
        workflow_status="submitted",
    )
    db.add(content)
    revision = Revision(
        id=uuid.uuid4(),
        workspace_id=user.workspace_id,
        content_id=content.id,
        revision_number=1,
        body=body,
        canonical_content_reference=canonical_content_reference,
        created_by=user.id,
    )
    db.add(revision)
    _audit(
        db,
        user,
        "content.submitted",
        "content",
        content.id,
        "Submitted content for brand review.",
    )
    return content, revision


@app.post("/api/content")
def create_content(
    payload: ContentCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    content, revision = _create_content(
        db,
        user,
        payload.title,
        payload.body,
        payload.channel,
        payload.content_type,
        payload.provenance,
    )
    _commit(db)
    return _json_content(content, revision)


@app.post("/api/content/upload")
def upload_content(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    channel: str | None = Form(default=None),
    content_type: str = Form(default="general"),
    provenance: str | None = Form(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx", ".txt", ".md"}:
        raise HTTPException(400, "Only PDF, DOCX, TXT and MD are supported.")
    data = _read_upload(file)
    try:
        body = extract_text(filename, data)
    except DocumentParseError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not body:
        raise HTTPException(422, "No selectable text was found in the upload.")
    if len(body) > 1_000_000:
        raise HTTPException(413, "Extracted content exceeds the 1 MB text limit.")

    content_id = uuid.uuid4()
    directory = UPLOAD_ROOT / "content" / str(user.workspace_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{content_id}{suffix}"
    relative_key = target.relative_to(UPLOAD_ROOT).as_posix()
    try:
        target.write_bytes(data)
        content, revision = _create_content(
            db,
            user,
            title or Path(filename).stem or "Uploaded content",
            body,
            channel,
            content_type,
            provenance,
            relative_key,
        )
        _commit(db)
    except (OSError, SQLAlchemyError, HTTPException):
        db.rollback()
        target.unlink(missing_ok=True)
        raise
    return _json_content(content, revision)


@app.get("/api/content")
def list_content(user: User = Depends(current_user), db: Session = Depends(get_db)):
    contents = db.scalars(
        select(Content)
        .where(Content.workspace_id == user.workspace_id)
        .order_by(Content.updated_at.desc())
    ).all()
    result = []
    for content in contents:
        revision = db.scalar(
            select(Revision)
            .where(
                Revision.content_id == content.id,
                Revision.workspace_id == user.workspace_id,
            )
            .order_by(Revision.revision_number.desc())
            .limit(1)
        )
        item = _json_content(content, revision)
        item["finding_count"] = db.scalar(
            select(func.count(Finding.id)).where(
                Finding.content_id == content.id,
                Finding.workspace_id == user.workspace_id,
            )
        )
        result.append(item)
    return result


def _workspace_content(db: Session, user: User, content_id: uuid.UUID):
    content = db.scalar(
        select(Content).where(
            Content.id == content_id,
            Content.workspace_id == user.workspace_id,
        )
    )
    if not content:
        raise HTTPException(404, "Content not found in this workspace.")
    return content


@app.post("/api/content/{content_id}/review")
def review_content(
    content_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    content = _workspace_content(db, user, content_id)
    previous_revision = db.scalar(
        select(Revision)
        .where(
            Revision.content_id == content.id,
            Revision.workspace_id == user.workspace_id,
        )
        .order_by(Revision.revision_number.desc())
        .limit(1)
    )
    if not previous_revision or not previous_revision.body:
        raise HTTPException(422, "Content has no text revision to review.")

    text = previous_revision.body
    rules = db.scalars(
        select(Rule).where(Rule.workspace_id == user.workspace_id)
    ).all()
    facts = db.scalars(
        select(Fact).where(Fact.workspace_id == user.workspace_id)
    ).all()
    terms = db.scalars(
        select(LexiconTerm).where(
            LexiconTerm.workspace_id == user.workspace_id,
            LexiconTerm.is_active.is_(True),
        )
    ).all()

    deterministic = run_deterministic_checks(text, rules, facts, terms)
    provider = OpenAICompatibleProvider()
    try:
        ai_result = run_ai_review(text, rules, facts, db, user.workspace_id)
    except AIProviderError as exc:
        ai_result = {
            "enabled": provider.enabled,
            "provider": "openai_compatible" if provider.enabled else "not_configured",
            "model": provider.model if provider.enabled else None,
            "findings": [],
            "error": str(exc),
        }

    next_revision = Revision(
        id=uuid.uuid4(),
        workspace_id=user.workspace_id,
        content_id=content.id,
        revision_number=previous_revision.revision_number + 1,
        body=text,
        canonical_content_reference=previous_revision.canonical_content_reference,
        created_by=user.id,
    )
    db.add(next_revision)

    stored = []
    for finding_data in deterministic + ai_result.get("findings", []):
        if not validate_finding_citation(finding_data, text, rules, facts):
            continue
        start_offset = finding_data.get("start_offset")
        end_offset = finding_data.get("end_offset")
        quoted_span = finding_data["quoted_span"]
        if (
            isinstance(start_offset, bool)
            or not isinstance(start_offset, int)
            or isinstance(end_offset, bool)
            or not isinstance(end_offset, int)
            or end_offset - start_offset != len(quoted_span)
            or text[start_offset:end_offset] != quoted_span
        ):
            continue
        finding = Finding(
            id=uuid.uuid4(),
            workspace_id=user.workspace_id,
            content_id=content.id,
            revision_id=next_revision.id,
            rule_id=finding_data.get("rule_id"),
            fact_id=finding_data.get("fact_id"),
            finding_category=finding_data["finding_category"],
            severity=finding_data["severity"],
            quoted_span=quoted_span,
            start_offset=start_offset,
            end_offset=end_offset,
            explanation=finding_data["explanation"],
            suggested_correction=finding_data.get("suggested_correction"),
            confidence_score=finding_data["confidence_score"],
            source_citation=finding_data.get("source_citation"),
            review_status=FindingReviewStatus.NEEDS_HUMAN_JUDGMENT,
        )
        db.add(finding)
        stored.append(finding)

    content.workflow_status = "in_review"
    _audit(
        db,
        user,
        "content.reviewed",
        "content",
        content.id,
        "Completed deterministic and evidence-grounded review.",
        {"finding_count": len(stored), "ai_enabled": bool(ai_result.get("enabled"))},
    )
    _commit(db)
    return {
        "content": _json_content(content, next_revision),
        "findings": [_json_finding(finding) for finding in stored],
        "ai": {key: value for key, value in ai_result.items() if key != "findings"},
    }


@app.get("/api/content/{content_id}/findings")
def list_findings(
    content_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _workspace_content(db, user, content_id)
    findings = db.scalars(
        select(Finding)
        .where(
            Finding.content_id == content_id,
            Finding.workspace_id == user.workspace_id,
        )
        .order_by(Finding.created_at.desc())
    ).all()
    return [_json_finding(finding) for finding in findings]


@app.post("/api/findings/{finding_id}/decision")
@limiter.limit("60/minute")
def decide_finding(
    request: Request,
    finding_id: uuid.UUID,
    payload: DecisionCreate,
    user: User = Depends(
        _require_roles(UserRole.ADMIN, UserRole.BRAND_MANAGER, UserRole.REVIEWER)
    ),
    db: Session = Depends(get_db),
):
    finding = db.scalar(
        select(Finding).where(
            Finding.id == finding_id,
            Finding.workspace_id == user.workspace_id,
        )
    )
    if not finding:
        raise HTTPException(404, "Finding not found in this workspace.")
    if payload.decision_type == "override" and finding.severity in {"high", "critical"}:
        if not payload.decision_reason or len(payload.decision_reason.strip()) < 3:
            raise HTTPException(
                422, "A written reason is required to override a high-severity finding."
            )

    previous_status = (
        finding.review_status.value
        if isinstance(finding.review_status, FindingReviewStatus)
        else str(finding.review_status)
    )
    new_status = {
        "accept": FindingReviewStatus.ACCEPTED,
        "reject": FindingReviewStatus.REJECTED,
        "override": FindingReviewStatus.OVERRIDDEN,
    }[payload.decision_type]
    decision = Decision(
        workspace_id=user.workspace_id,
        finding_id=finding.id,
        decided_by=user.id,
        decision_type=payload.decision_type,
        decision_reason=payload.decision_reason,
        previous_status=previous_status,
        new_status=new_status.value,
    )
    db.add(decision)
    finding.review_status = new_status
    event_type = {
        "accept": "finding.accepted",
        "reject": "finding.rejected",
        "override": "finding.overridden",
    }[payload.decision_type]
    decision_label = {
        "accept": "accepted",
        "reject": "rejected",
        "override": "overrode",
    }[payload.decision_type]
    _audit(
        db,
        user,
        event_type,
        "finding",
        finding.id,
        f"Reviewer {decision_label} a finding.",
        {"previous_status": previous_status, "new_status": new_status.value},
    )
    _commit(db)
    return {
        "id": str(decision.id),
        "finding_id": str(finding.id),
        "decision_type": decision.decision_type,
        "decision_reason": decision.decision_reason,
        "previous_status": decision.previous_status,
        "new_status": decision.new_status,
        "decided_by": str(user.id),
        "created_at": decision.created_at.isoformat(),
    }


@app.get("/api/findings/{finding_id}/decisions")
def list_decisions(
    finding_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    finding = db.scalar(
        select(Finding).where(
            Finding.id == finding_id,
            Finding.workspace_id == user.workspace_id,
        )
    )
    if not finding:
        raise HTTPException(404, "Finding not found in this workspace.")
    decisions = db.scalars(
        select(Decision)
        .where(
            Decision.finding_id == finding.id,
            Decision.workspace_id == user.workspace_id,
        )
        .order_by(Decision.created_at.desc())
    ).all()
    return [
        {
            "id": str(item.id),
            "decision_type": item.decision_type,
            "decision_reason": item.decision_reason,
            "previous_status": item.previous_status,
            "new_status": item.new_status,
            "decided_by": str(item.decided_by),
            "created_at": item.created_at.isoformat(),
        }
        for item in decisions
    ]


@app.get("/api/audit")
def list_audit_events(
    limit: int = 100,
    offset: int = 0,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if limit < 1 or limit > 500 or offset < 0:
        raise HTTPException(422, "Use a limit from 1 to 500 and a non-negative offset.")
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.workspace_id == user.workspace_id)
        .order_by(AuditEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        {
            "id": str(event.id),
            "event_type": event.event_type,
            "entity_type": event.entity_type,
            "entity_id": str(event.entity_id),
            "action_description": event.action_description,
            "metadata": event.event_metadata,
            "actor_id": str(event.actor_id) if event.actor_id else None,
            "created_at": event.created_at.isoformat(),
        }
        for event in events
    ]


@app.get("/api/insights/summary")
def insights_summary(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {
        "submissions": db.scalar(
            select(func.count(Content.id)).where(Content.workspace_id == user.workspace_id)
        ),
        "findings": db.scalar(
            select(func.count(Finding.id)).where(Finding.workspace_id == user.workspace_id)
        ),
        "pending_reviews": db.scalar(
            select(func.count(Finding.id)).where(
                Finding.workspace_id == user.workspace_id,
                Finding.review_status == FindingReviewStatus.NEEDS_HUMAN_JUDGMENT,
            )
        ),
        "guidelines": db.scalar(
            select(func.count(GuidelineDoc.id)).where(
                GuidelineDoc.workspace_id == user.workspace_id
            )
        ),
    }
