import argparse

from sqlalchemy import func, select

from backend.ai_engine.embeddings import (
    EmbeddingProviderError,
    OpenAICompatibleEmbeddingProvider,
)
from backend.database.connection import SessionLocal, engine
from backend.models import Fact, Rule


def reindex(batch_size: int = 32, dry_run: bool = False) -> int:
    if engine.dialect.name != "postgresql":
        raise RuntimeError("Embedding reindexing requires PostgreSQL with pgvector.")
    provider = OpenAICompatibleEmbeddingProvider()
    if not provider.configured:
        raise RuntimeError("Configure EMBEDDING_API_KEY and EMBEDDING_MODEL before reindexing.")

    updated = 0
    with SessionLocal() as db:
        for model in (Rule, Fact):
            if dry_run:
                updated += db.scalar(
                    select(func.count()).select_from(model).where(model.embedding.is_(None))
                ) or 0
                continue
            while True:
                rows = db.scalars(
                    select(model)
                    .where(model.embedding.is_(None))
                    .order_by(model.id)
                    .limit(batch_size)
                ).all()
                if not rows:
                    break
                try:
                    vectors = provider.embed_texts([row.statement for row in rows])
                except EmbeddingProviderError:
                    db.rollback()
                    raise
                for row, vector in zip(rows, vectors, strict=True):
                    row.embedding = vector
                    row.embedding_model = provider.model
                db.commit()
                updated += len(rows)
    return updated


def main():
    parser = argparse.ArgumentParser(
        description="Generate embeddings for existing approved rules and facts."
    )
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 128:
        parser.error("--batch-size must be between 1 and 128.")
    try:
        updated = reindex(batch_size=args.batch_size, dry_run=args.dry_run)
    except (RuntimeError, EmbeddingProviderError) as exc:
        parser.exit(1, f"Embedding reindex failed: {exc}\n")
    action = "would update" if args.dry_run else "updated"
    print(f"Embedding reindex {action} {updated} approved evidence records.")


if __name__ == "__main__":
    main()
