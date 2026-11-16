import io
import uuid

import pytest
from docx import Document
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend.document_engine.parser import MAX_DOCUMENT_BYTES


def synthetic_pdf(text):
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n"
        + stream
        + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii") + obj + b"\nendobj\n")
    xref_offset = len(output)
    output.extend(b"xref\n0 6\n0000000000 65535 f \n")
    for offset in offsets:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode(
            "ascii"
        )
    )
    return bytes(output)


@pytest.fixture
def api(tmp_path, monkeypatch):
    import backend.database.connection as connection
    import backend.main as main
    from backend.database.connection import Base

    monkeypatch.setattr(main, "DEMO_AUTH_MODE", False)
    main.limiter.reset()
    database_engine = create_engine(
        f"sqlite:///{tmp_path / 'api-test.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(database_engine)
    test_session = sessionmaker(bind=database_engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(main, "engine", database_engine)
    monkeypatch.setattr(connection, "engine", database_engine)
    monkeypatch.setattr(main, "UPLOAD_ROOT", tmp_path / "uploads")
    monkeypatch.setattr(
        main,
        "run_ai_review",
        lambda text, rules, facts, db, workspace_id: {
            "enabled": False,
            "provider": "test_stub",
            "model": None,
            "findings": [],
            "message": "AI review was stubbed for this offline test.",
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
            yield client, main, test_session
    finally:
        main.app.dependency_overrides.clear()
        database_engine.dispose()


def register(client, workspace_name="Nexora"):
    email = f"member-{uuid.uuid4().hex}@example.com"
    response = client.post(
        "/api/auth/register",
        json={
            "workspace_name": workspace_name,
            "full_name": "Test Reviewer",
            "email": email,
            "password": "Strong-Test-Password-928",
        },
    )
    assert response.status_code == 200
    return email, response.json()


def test_full_workspace_review_and_decision_workflow(api):
    client, main, test_session = api
    email, _ = register(client)

    assert client.post(
        "/api/auth/login",
        json={"email": email, "password": "Strong-Test-Password-928"},
    ).status_code == 200
    assert client.get("/api/auth/me").json()["email"] == email
    assert client.get(
        "/api/auth/me", cookies={main.SESSION_COOKIE: "invalid"}
    ).status_code == 401
    assert client.post(
        "/api/auth/login", json={"email": email, "password": "wrong-password"}
    ).status_code == 401
    assert client.get("/api/guidelines", cookies={main.SESSION_COOKIE: ""}).status_code == 401

    document = client.post(
        "/api/guidelines/upload",
        files={"file": ("brand-guide.txt", b"Approved brand guidance.", "text/plain")},
    )
    assert document.status_code == 200
    guideline = document.json()
    assert guideline["extracted_text"] == "Approved brand guidance."
    assert client.get("/api/guidelines").json()[0]["id"] == guideline["id"]

    rule = client.post(
        "/api/rules",
        json={
            "guideline_doc_id": guideline["id"],
            "stable_id": "BR-001",
            "statement": "Banned term: best in market",
        },
    )
    assert rule.status_code == 200
    assert client.get("/api/rules").json()[0]["stable_id"] == "BR-001"

    fact = client.post(
        "/api/facts",
        json={
            "statement": "The product serves 12 regions.",
            "source_reference": "Approved fact sheet",
            "valid_until": "2000-01-01",
        },
    )
    assert fact.status_code == 200
    assert client.get("/api/facts").json()[0]["id"] == fact.json()["id"]
    assert client.post(
        "/api/facts",
        json={
            "statement": "Invalid date range",
            "valid_from": "2026-01-01",
            "valid_until": "2025-01-01",
        },
    ).status_code == 422

    term = client.post(
        "/api/lexicon",
        json={
            "term": "revolutionary",
            "term_category": "avoid",
            "preferred_replacement": "new",
            "explanation": "Avoid unsupported superlatives.",
        },
    )
    assert term.status_code == 200
    assert client.get("/api/lexicon").json()[0]["term"] == "revolutionary"

    content = client.post(
        "/api/content",
        json={
            "title": "Launch campaign",
            "body": (
                "We are the best in market. This is revolutionary. "
                "The product serves 12 regions."
            ),
            "channel": "web",
            "content_type": "campaign",
        },
    )
    assert content.status_code == 200
    content_id = content.json()["id"]
    assert len(client.get("/api/content").json()) == 1

    review = client.post(f"/api/content/{content_id}/review")
    assert review.status_code == 200
    findings = review.json()["findings"]
    assert {item["category"] for item in findings} == {
        "terminology_drift",
        "outdated_information",
    }
    assert all(item["quoted_span"] in content.json()["body"] for item in findings)
    assert all(
        content.json()["body"][item["start_offset"] : item["end_offset"]]
        == item["quoted_span"]
        for item in findings
    )
    assert len(client.get(f"/api/content/{content_id}/findings").json()) == 3

    high_finding = next(item for item in findings if item["severity"] == "high")
    assert client.post(
        f"/api/findings/{high_finding['id']}/decision",
        json={"decision_type": "override"},
    ).status_code == 422
    overridden = client.post(
        f"/api/findings/{high_finding['id']}/decision",
        json={"decision_type": "override", "decision_reason": "Confirmed current wording."},
    )
    assert overridden.status_code == 200
    assert overridden.json()["new_status"] == "overridden"

    other_findings = [item for item in findings if item["id"] != high_finding["id"]]
    assert client.post(
        f"/api/findings/{other_findings[0]['id']}/decision",
        json={"decision_type": "accept"},
    ).status_code == 200
    assert client.post(
        f"/api/findings/{other_findings[1]['id']}/decision",
        json={"decision_type": "reject"},
    ).status_code == 200
    history = client.get(
        f"/api/findings/{high_finding['id']}/decisions"
    )
    assert history.status_code == 200
    assert history.json()[0]["decision_type"] == "override"

    audit = client.get("/api/audit")
    assert audit.status_code == 200
    audit_types = {event["event_type"] for event in audit.json()}
    assert audit_types >= {
        "workspace.created",
        "guideline.uploaded",
        "content.reviewed",
        "finding.accepted",
        "finding.rejected",
        "finding.overridden",
    }
    assert client.get("/api/insights/summary").json()["submissions"] == 1

    with TestClient(main.app) as other_client:
        other_email, _ = register(other_client, "Different workspace")
        assert other_client.get("/api/guidelines").json() == []
        assert other_client.get(f"/api/content/{content_id}/findings").status_code == 404
        assert other_client.get("/api/audit").json()

        with test_session() as db:
            from backend.models import User, UserRole

            reviewer = db.scalar(select(User).where(User.email == other_email))
            reviewer.role = UserRole.REVIEWER
            db.commit()
        assert other_client.post(
            "/api/facts",
            json={"statement": "Reviewer cannot modify approved facts."},
        ).status_code == 403


def test_upload_content_and_reject_invalid_or_oversized_files(api):
    client, main, _ = api
    register(client)

    doc = Document()
    doc.add_paragraph("DOCX marketing content.")
    stream = io.BytesIO()
    doc.save(stream)
    uploaded = client.post(
        "/api/content/upload",
        data={"title": "DOCX submission", "channel": "email"},
        files={"file": ("content.docx", stream.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["body"] == "DOCX marketing content."

    pdf_text = "Synthetic PDF guideline text."
    pdf_upload = client.post(
        "/api/guidelines/upload",
        files={"file": ("guide.pdf", synthetic_pdf(pdf_text), "application/pdf")},
    )
    assert pdf_upload.status_code == 200
    assert pdf_text in pdf_upload.json()["extracted_text"]

    assert client.post(
        "/api/guidelines/upload",
        files={"file": ("guide.exe", b"not a document", "application/octet-stream")},
    ).status_code == 400
    assert client.post(
        "/api/guidelines/upload",
        files={"file": ("fake.pdf", b"not a PDF", "application/pdf")},
    ).status_code == 400
    assert client.post(
        "/api/guidelines/upload",
        files={"file": ("too-large.txt", b"x" * (MAX_DOCUMENT_BYTES + 1), "text/plain")},
    ).status_code == 413


def test_decision_validation_and_unauthorized_access(api):
    client, main, _ = api
    register(client)
    invalid = client.post("/api/findings/not-a-uuid/decision", json={"decision_type": "approve"})
    assert invalid.status_code == 422
    assert client.get("/api/audit", cookies={main.SESSION_COOKIE: "invalid"}).status_code == 401


def test_demo_auth_uses_persistent_database_session_and_logout(api, monkeypatch):
    client, main, test_session = api
    existing_email, _ = register(client)
    monkeypatch.setattr(main, "DEMO_AUTH_MODE", True)
    registration = {
        "full_name": "A",
        "email": "not-an-email",
        "password": "x",
    }

    first = client.post("/api/auth/register", json=registration)
    assert first.status_code == 200
    first_user = first.json()["user"]
    assert first_user["email"] == "round2-demo@demo.invalid"

    duplicate = client.post(
        "/api/auth/register",
        json={**registration, "workspace_name": "A different workspace"},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["user"]["id"] == first_user["id"]
    existing_email_registration = client.post(
        "/api/auth/register",
        json={**registration, "email": existing_email},
    )
    assert existing_email_registration.status_code == 200
    assert existing_email_registration.json()["user"]["id"] == first_user["id"]

    login = client.post(
        "/api/auth/login",
        json={"email": "arbitrary address", "password": "anything"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["id"] == first_user["id"]
    assert client.get("/api/auth/me").json()["id"] == first_user["id"]
    assert client.get("/api/insights/summary").status_code == 200

    with TestClient(main.app) as refreshed_client:
        refreshed_client.cookies.set(
            main.SESSION_COOKIE,
            client.cookies.get(main.SESSION_COOKIE),
        )
        assert refreshed_client.get("/api/auth/me").json()["id"] == first_user["id"]

    with test_session() as db:
        from backend.models import User, Workspace

        assert len(db.scalars(select(User)).all()) == 2
        assert len(db.scalars(select(Workspace)).all()) == 2

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_demo_auth_mode_is_rejected_in_production(monkeypatch):
    from backend.config import _read_demo_auth_mode

    monkeypatch.setenv("DEMO_AUTH_MODE", "true")
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError, match="restricted to local development"):
        _read_demo_auth_mode()


def test_cookie_profile_password_reset_and_logout(api, monkeypatch):
    client, main, _ = api
    email, _ = register(client)
    cookie = client.cookies.get(main.SESSION_COOKIE)
    assert cookie
    assert any(
        cookie_entry.has_nonstandard_attr("HttpOnly")
        for cookie_entry in client.cookies.jar
    )
    assert client.patch(
        "/api/auth/me",
        json={"full_name": "Updated Reviewer", "email": email},
    ).json()["name"] == "Updated Reviewer"

    sent = []
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.test")
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.test")
    monkeypatch.setattr(
        main,
        "_send_password_reset_email",
        lambda recipient, link: sent.append((recipient, link)),
    )
    requested = client.post("/api/auth/password-reset/request", json={"email": email})
    assert requested.status_code == 202
    assert sent[0][0] == email
    reset_token = sent[0][1].split("token=", 1)[1]
    changed = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "New-Strong-Password-928"},
    )
    assert changed.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.post(
        "/api/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "Another-Strong-Password-928"},
    ).status_code == 400
    assert client.post(
        "/api/auth/login",
        json={"email": email, "password": "New-Strong-Password-928"},
    ).status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_workspace_asset_upload_is_validated_scoped_and_archived(api):
    import io

    from PIL import Image

    client, main, test_session = api
    register(client)
    image = io.BytesIO()
    Image.new("RGB", (4, 4), color="blue").save(image, format="PNG")
    png = image.getvalue()
    uploaded = client.post(
        "/api/assets/upload",
        data={"name": "Primary logo", "description": "Approved logo."},
        files={"file": ("logo.png", png, "image/png")},
    )
    assert uploaded.status_code == 200
    asset = uploaded.json()
    assert asset["asset_type"] == "image/png"
    assert client.get(asset["file_url"]).content == png
    assert client.get("/api/assets").json()[0]["id"] == asset["id"]

    with TestClient(main.app) as other_client:
        register(other_client, "Other workspace")
        assert other_client.get(asset["file_url"]).status_code == 404
        assert other_client.post(f"/api/assets/{asset['id']}/archive").status_code == 404

    assert client.post(
        "/api/assets/upload",
        data={"name": "Fake image"},
        files={"file": ("fake.png", b"not an image", "image/png")},
    ).status_code == 400
    assert client.post(f"/api/assets/{asset['id']}/archive").status_code == 200
    assert client.get("/api/assets").json() == []
    from backend.models import Asset

    with test_session() as db:
        saved = db.get(Asset, uuid.UUID(asset["id"]))
        assert saved is not None
        assert (main.UPLOAD_ROOT / saved.storage_key).is_file()
