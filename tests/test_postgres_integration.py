import os
import uuid

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from backend.ai_engine.retrieval import retrieve_context
from backend.models import Fact, Rule


POSTGRES_TEST_DATABASE_URL = os.getenv("POSTGRES_TEST_DATABASE_URL", "").strip()
pytestmark = pytest.mark.skipif(
    not POSTGRES_TEST_DATABASE_URL,
    reason="Set POSTGRES_TEST_DATABASE_URL to an isolated PostgreSQL 17 *_test database.",
)


@pytest.fixture
def postgres_api(monkeypatch, tmp_path):
    database_url = make_url(POSTGRES_TEST_DATABASE_URL)
    if not database_url.drivername.startswith("postgresql"):
        pytest.fail("POSTGRES_TEST_DATABASE_URL must use PostgreSQL.")
    if not (database_url.database or "").lower().endswith(("_test", "-test")):
        pytest.fail("PostgreSQL integration tests require a database name ending in _test.")
    if database_url.drivername == "postgresql":
        database_url = database_url.set(drivername="postgresql+psycopg")

    test_database_url = database_url.render_as_string(hide_password=False)
    monkeypatch.setenv("ALEMBIC_DATABASE_URL", test_database_url)
    config = Config("backend/alembic.ini")
    command.upgrade(config, "head")

    import backend.database.connection as connection
    import backend.main as main

    database_engine = create_engine(test_database_url, pool_pre_ping=True)
    test_session = sessionmaker(bind=database_engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(main, "engine", database_engine)
    monkeypatch.setattr(connection, "engine", database_engine)
    monkeypatch.setattr(main, "UPLOAD_ROOT", tmp_path / "uploads")
    monkeypatch.setattr(main, "_evidence_embedding", lambda statement: (None, None))
    monkeypatch.setattr(
        main,
        "run_ai_review",
        lambda source, rules, facts, db, workspace_id: {
            "enabled": False,
            "provider": "integration-test-stub",
            "model": None,
            "findings": [],
            "unverified_claims": [],
        },
    )

    def override_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[main.get_db] = override_db
    try:
        with TestClient(main.app) as client:
            yield client, main, test_session, database_engine
    finally:
        main.app.dependency_overrides.clear()
        database_engine.dispose()


def test_postgres17_schema_vector_isolation_and_review_flow(postgres_api):
    client, main, test_session, database_engine = postgres_api
    with database_engine.connect() as connection:
        version = int(connection.execute(text("SHOW server_version_num")).scalar_one())
        assert version // 10000 == 17
        assert connection.execute(
            text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')")
        ).scalar_one()
        assert connection.execute(
            text("SELECT to_regclass('public.alembic_version') IS NOT NULL")
        ).scalar_one()

    email = f"postgres-{uuid.uuid4().hex}@example.test"
    registered = client.post(
        "/api/auth/register",
        json={
            "workspace_name": f"Postgres test {uuid.uuid4().hex[:8]}",
            "full_name": "Postgres Test User",
            "email": email,
            "password": "Synthetic-Test-Password-928",
        },
    )
    assert registered.status_code == 200
    workspace_id = uuid.UUID(registered.json()["user"]["workspace_id"])
    assert client.get("/api/ai/status").json()["vector_store_available"] is True

    guide = client.post(
        "/api/guidelines/upload",
        files={"file": ("guide.txt", b"Approved test guideline.", "text/plain")},
    )
    assert guide.status_code == 200
    rule = client.post(
        "/api/rules",
        json={
            "guideline_doc_id": guide.json()["id"],
            "stable_id": "TEST-001",
            "statement": "Use approved claims.",
        },
    )
    fact = client.post(
        "/api/facts",
        json={
            "statement": "The product serves twelve regions.",
            "source_reference": "Synthetic test fact sheet",
        },
    )
    assert rule.status_code == fact.status_code == 200

    vector = [1.0] + [0.0] * 1535
    with test_session() as db:
        stored_rule = db.get(Rule, uuid.UUID(rule.json()["id"]))
        stored_fact = db.get(Fact, uuid.UUID(fact.json()["id"]))
        stored_rule.embedding = vector
        stored_rule.embedding_model = "synthetic-integration-test"
        stored_fact.embedding = vector
        stored_fact.embedding_model = "synthetic-integration-test"
        db.commit()
        matching = retrieve_context(
            db,
            workspace_id,
            vector,
            limit=8,
            min_similarity=0.8,
        )
    assert {item["id"] for item in matching} == {rule.json()["id"], fact.json()["id"]}

    content = client.post(
        "/api/content",
        json={
            "title": "Synthetic campaign",
            "body": "We are the best.",
            "channel": "web",
            "content_type": "campaign",
        },
    )
    assert content.status_code == 200
    term = client.post(
        "/api/lexicon",
        json={"term": "best", "term_category": "banned"},
    )
    assert term.status_code == 200
    review = client.post(f"/api/content/{content.json()['id']}/review")
    assert review.status_code == 200
    finding = next(
        item for item in review.json()["findings"] if item["quoted_span"] == "best"
    )
    assert review.json()["content"]["body"][finding["start_offset"] : finding["end_offset"]] == "best"
    decision = client.post(
        f"/api/findings/{finding['id']}/decision",
        json={"decision_type": "accept"},
    )
    assert decision.status_code == 200
    assert client.get(f"/api/findings/{finding['id']}/decisions").json()[0]["decision_type"] == "accept"
    audit_types = {
        event["event_type"] for event in client.get("/api/audit").json()
    }
    assert {"content.reviewed", "finding.accepted"} <= audit_types

    other_workspace_id = uuid.uuid4()
    other_fact_id = uuid.uuid4()
    with test_session() as db:
        from backend.models import Workspace

        other_workspace = Workspace(
            id=other_workspace_id,
            name=f"Isolation test {uuid.uuid4().hex[:8]}",
            slug=f"isolation-{uuid.uuid4().hex}",
        )
        db.add(other_workspace)
        db.flush()
        db.add(
            Fact(
                id=other_fact_id,
                workspace_id=other_workspace_id,
                statement="Isolated synthetic evidence.",
                embedding=vector,
                embedding_model="synthetic-integration-test",
            )
        )
        db.commit()
        scoped = retrieve_context(
            db,
            workspace_id,
            vector,
            limit=8,
            min_similarity=0.8,
        )
    assert str(other_fact_id) not in {item["id"] for item in scoped}
    assert {item["id"] for item in scoped} == {rule.json()["id"], fact.json()["id"]}
