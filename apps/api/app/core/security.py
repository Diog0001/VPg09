from datetime import UTC, datetime, timedelta
from hashlib import pbkdf2_hmac
from secrets import compare_digest, token_hex

import jwt

from app.core.config import settings

_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = token_hex(16)
    digest = pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return compare_digest(candidate, digest)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm="HS256",
    )


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None
