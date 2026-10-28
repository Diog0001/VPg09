from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db import get_db
from app.models import Membership, User


def get_current_user(
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_workspace(db: Session, user: User, workspace_id: str) -> Membership:
    membership = (
        db.query(Membership)
        .filter(Membership.workspace_id == workspace_id, Membership.user_id == user.id)
        .one_or_none()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return membership
