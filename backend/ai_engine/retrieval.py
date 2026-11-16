import os
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.models import Fact, Rule


class VectorStoreUnavailable(RuntimeError):
    pass


def _minimum_similarity() -> float:
    value = float(os.getenv("RAG_MIN_SIMILARITY", "0.62"))
    if not 0 <= value <= 1:
        raise ValueError("RAG_MIN_SIMILARITY must be between 0 and 1.")
    return value


def retrieve_context(
    db: Session,
    workspace_id,
    query_embedding: list[float],
    limit: int = 8,
    min_similarity: float | None = None,
) -> list[dict]:
    if db.get_bind().dialect.name != "postgresql":
        raise VectorStoreUnavailable("Vector retrieval requires PostgreSQL with pgvector.")

    threshold = _minimum_similarity() if min_similarity is None else min_similarity
    if not 0 <= threshold <= 1:
        raise ValueError("Minimum cosine similarity must be between 0 and 1.")
    if limit < 1:
        return []

    candidates: list[tuple[float, dict]] = []
    try:
        rule_distance = Rule.embedding.cosine_distance(query_embedding)
        rule_rows = db.execute(
            select(Rule, rule_distance.label("distance"))
            .where(
                Rule.workspace_id == workspace_id,
                Rule.embedding.is_not(None),
            )
            .order_by(rule_distance)
            .limit(limit)
        ).all()
        for rule, distance in rule_rows:
            similarity = 1.0 - float(distance)
            if similarity < threshold:
                continue
            candidates.append(
                (
                    similarity,
                    {
                        "kind": "rule",
                        "id": str(rule.id),
                        "stable_id": rule.stable_id,
                        "version": rule.version,
                        "text": rule.statement,
                        "similarity": similarity,
                    },
                )
            )

        today = date.today()
        fact_distance = Fact.embedding.cosine_distance(query_embedding)
        fact_rows = db.execute(
            select(Fact, fact_distance.label("distance"))
            .where(
                Fact.workspace_id == workspace_id,
                Fact.embedding.is_not(None),
                (Fact.valid_from.is_(None)) | (Fact.valid_from <= today),
                (Fact.valid_until.is_(None)) | (Fact.valid_until >= today),
            )
            .order_by(fact_distance)
            .limit(limit)
        ).all()
        for fact, distance in fact_rows:
            similarity = 1.0 - float(distance)
            if similarity < threshold:
                continue
            candidates.append(
                (
                    similarity,
                    {
                        "kind": "fact",
                        "id": str(fact.id),
                        "text": fact.statement,
                        "source": fact.source_reference,
                        "valid_from": fact.valid_from.isoformat() if fact.valid_from else None,
                        "valid_until": fact.valid_until.isoformat() if fact.valid_until else None,
                        "similarity": similarity,
                    },
                )
            )
    except SQLAlchemyError as exc:
        raise VectorStoreUnavailable(
            "The pgvector store is unavailable; AI review was skipped."
        ) from exc

    candidates.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in candidates[:limit]]
