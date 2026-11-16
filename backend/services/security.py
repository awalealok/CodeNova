import os, hashlib, hmac, base64, json
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError

DEFAULT_SECRET_KEY = 'CHANGE-ME-IN-PRODUCTION-USE-A-LONG-RANDOM-SECRET'
SECRET_KEY = os.getenv('INKLOOM_SECRET_KEY', DEFAULT_SECRET_KEY).strip()
if os.getenv("APP_ENV", "development").lower() in {"production", "prod"}:
    if not SECRET_KEY or SECRET_KEY == DEFAULT_SECRET_KEY or len(SECRET_KEY) < 32:
        raise RuntimeError("A unique INKLOOM_SECRET_KEY of at least 32 characters is required in production.")
ALGORITHM = 'HS256'
TOKEN_MINUTES = int(os.getenv('ACCESS_TOKEN_MINUTES', '720'))

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 310_000)
    return 'pbkdf2_sha256$310000$' + base64.urlsafe_b64encode(salt).decode() + '$' + base64.urlsafe_b64encode(digest).decode()

def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, rounds, salt_text, digest_text = encoded.split('$')
        if scheme != 'pbkdf2_sha256': return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def create_access_token(
    user_id: str,
    workspace_id: str,
    role: str,
    token_version: int = 0,
) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_MINUTES)
    return jwt.encode(
        {
            'sub': user_id,
            'workspace_id': workspace_id,
            'role': role,
            'token_version': token_version,
            'exp': expires,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

def decode_access_token(token: str):
    try: return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError: return None
