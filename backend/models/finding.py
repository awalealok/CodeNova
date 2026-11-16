import uuid

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SQLAlchemyEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.connection import Base


class FindingReviewStatus(str, Enum):
    SUPPORTED = "supported"
    CONTRADICTED = "contradicted"
    UNSUPPORTED = "unsupported"
    OUTDATED = "outdated"
    NEEDS_HUMAN_JUDGMENT = "needs_human_judgment"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    OVERRIDDEN = "overridden"


class Finding(Base):

    __tablename__ = "findings"

    __table_args__ = (
        CheckConstraint("confidence_score >= 0 AND confidence_score <= 1", name="ck_finding_confidence_range"),
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

    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contents.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rules.id"),
        nullable=True,
        index=True
    )

    fact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("facts.id"),
        nullable=True,
        index=True
    )

    finding_category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True
    )

    severity: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )

    quoted_span: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    start_offset: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )

    end_offset: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )

    explanation: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    suggested_correction: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    confidence_score: Mapped[Decimal] = mapped_column(
        Numeric(4, 3),
        nullable=False
    )

    source_citation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    review_status: Mapped[FindingReviewStatus] = mapped_column(
        SQLAlchemyEnum(
            FindingReviewStatus,
            name="finding_review_status",
            values_callable=lambda enum: [item.value for item in enum],
            native_enum=False
        ),
        default=FindingReviewStatus.NEEDS_HUMAN_JUDGMENT,
        nullable=False,
        index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
