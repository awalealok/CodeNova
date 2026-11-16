
import uuid

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Enum as SQLAlchemyEnum,
    UniqueConstraint
)

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.connection import Base


class UserRole(str, Enum):
    CREATOR = "creator"
    REVIEWER = "reviewer"
    BRAND_MANAGER = "brand_manager"
    ADMIN = "admin"


class User(Base):

    __tablename__ = "users"

    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "email",
            name="uq_user_workspace_email"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    role: Mapped[UserRole] = mapped_column(
        SQLAlchemyEnum(
            UserRole,
            name="user_role",
            values_callable=lambda enum: [
                item.value for item in enum
            ],
            native_enum=False
        ),
        default=UserRole.CREATOR,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    token_version: Mapped[int] = mapped_column(
        default=0,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    def __repr__(self):
        return f"<User(email='{self.email}', role='{self.role.value}')>"
