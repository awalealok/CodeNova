"""Bootstrap missing INKLOOM tables and safely add blocker-resolution columns.

Revision ID: 0001_safe_schema_bootstrap
Revises:
Create Date: 2025-03-08
"""
from alembic import op
from sqlalchemy import inspect, text

from backend import models  # noqa: F401
from backend.database.connection import Base

revision = "0001_safe_schema_bootstrap"
down_revision = None
branch_labels = None
depends_on = None


def _has_column(connection, table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in inspect(connection).get_columns(table_name)
    )


def _add_column_if_missing(connection, table_name: str, column):
    if not _has_column(connection, table_name, column.name):
        op.add_column(table_name, column)


def _backfill_finding_offsets(connection, include_all=False):
    null_filter = "" if include_all else "WHERE f.start_offset IS NULL OR f.end_offset IS NULL"
    rows = connection.execute(
        text(
            "SELECT f.id, f.quoted_span, r.body "
            "FROM findings AS f "
            "JOIN revisions AS r ON r.id = f.revision_id "
            + null_filter
        )
    ).mappings().all()
    for row in rows:
        start = row["body"].find(row["quoted_span"])
        if start < 0:
            raise RuntimeError(
                "Cannot safely backfill a finding offset because its quoted text "
                "does not occur in the linked revision."
            )
        connection.execute(
            text(
                "UPDATE findings SET start_offset = :start, end_offset = :end "
                "WHERE id = :finding_id"
            ),
            {
                "start": start,
                "end": start + len(row["quoted_span"]),
                "finding_id": row["id"],
            },
        )


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.create_all(bind=connection, checkfirst=True)

    metadata = Base.metadata
    _add_column_if_missing(
        connection,
        "users",
        metadata.tables["users"].c.token_version.copy(server_default="0"),
    )
    for table_name in ("rules", "facts"):
        table = metadata.tables[table_name]
        for column_name in ("embedding", "embedding_model"):
            _add_column_if_missing(connection, table_name, table.c[column_name].copy())

    finding_table = metadata.tables["findings"]
    missing_finding_offsets = False
    for column_name in ("start_offset", "end_offset"):
        column = finding_table.c[column_name].copy()
        column.nullable = True
        column.server_default = "0"
        missing_finding_offsets = missing_finding_offsets or not _has_column(
            connection, "findings", column_name
        )
        _add_column_if_missing(connection, "findings", column)

    _backfill_finding_offsets(connection, include_all=missing_finding_offsets)
    for table in metadata.sorted_tables:
        for index in table.indexes:
            index.create(bind=connection, checkfirst=True)
    if connection.dialect.name == "postgresql":
        connection.execute(text("ALTER TABLE findings ALTER COLUMN start_offset SET NOT NULL"))
        connection.execute(text("ALTER TABLE findings ALTER COLUMN end_offset SET NOT NULL"))


def downgrade():
    raise RuntimeError(
        "This migration is intentionally non-destructive; restore from a verified backup "
        "or write a reviewed forward migration instead of dropping user data."
    )
