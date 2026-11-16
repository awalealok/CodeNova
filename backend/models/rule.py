
import uuid

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.connection import Base
from backend.database.vector import VECTOR_TYPE


class Rule(Base):

    __tablename__ = "rules"

    __table_args__ = (
        UniqueConstraint(
            "guideline_doc_id",
            "stable_id",
            "version",
            name="uq_rule_document_stable_id_version"
        ),
        Index(
            "ix_rules_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
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

    guideline_doc_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("guideline_docs.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    stable_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    statement: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False
    )

    embedding: Mapped[list[float] | None] = mapped_column(
        VECTOR_TYPE,
        nullable=True
    )

    embedding_model: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    def __repr__(self):
        return (
            f"<Rule("
            f"stable_id='{self.stable_id}', "
            f"version={self.version})>"
        )
