from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from backend.ai_engine.retrieval import VectorStoreUnavailable, retrieve_context
from backend.models import Fact, Rule


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class FakePostgresSession:
    def __init__(self, results):
        self.results = iter(results)
        self.statements = []

    def get_bind(self):
        return SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    def execute(self, statement):
        self.statements.append(statement.compile(dialect=postgresql.dialect()))
        return FakeResult(next(self.results))


def test_vector_retrieval_scopes_queries_and_applies_similarity_threshold():
    workspace_id = uuid4()
    rule = Rule(
        id=uuid4(),
        workspace_id=workspace_id,
        stable_id="BR-01",
        version=1,
        statement="Use approved product wording.",
        embedding=[0.1] * 1536,
    )
    matching_fact = Fact(
        id=uuid4(),
        workspace_id=workspace_id,
        statement="The service is available in twelve countries.",
        source_reference="Approved fact sheet",
        valid_from=None,
        valid_until=None,
        embedding=[0.2] * 1536,
    )
    low_similarity_fact = Fact(
        id=uuid4(),
        workspace_id=workspace_id,
        statement="An unrelated approved statement.",
        source_reference=None,
        valid_from=None,
        valid_until=None,
        embedding=[0.3] * 1536,
    )
    db = FakePostgresSession(
        [
            [(rule, 0.12)],
            [(matching_fact, 0.18), (low_similarity_fact, 0.45)],
        ]
    )

    results = retrieve_context(
        db,
        workspace_id,
        [0.0] * 1536,
        min_similarity=0.7,
    )

    assert [item["id"] for item in results] == [str(rule.id), str(matching_fact.id)]
    assert results[0]["similarity"] > results[1]["similarity"]
    for statement in db.statements:
        assert any("workspace_id" in key for key in statement.params)
        assert "workspace_id" in str(statement)
        assert "<=>" in str(statement)
    assert "valid_until" in str(db.statements[1])


def test_vector_retrieval_refuses_sqlite_instead_of_falling_back():
    sqlite_session = SimpleNamespace(
        get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))
    )
    with pytest.raises(VectorStoreUnavailable, match="requires PostgreSQL with pgvector"):
        retrieve_context(sqlite_session, uuid4(), [0.0] * 1536)


def test_retrieval_threshold_configuration_is_validated(monkeypatch):
    from backend.ai_engine import retrieval

    monkeypatch.setenv("RAG_MIN_SIMILARITY", "1.5")
    with pytest.raises(ValueError, match="between 0 and 1"):
        retrieval._minimum_similarity()
