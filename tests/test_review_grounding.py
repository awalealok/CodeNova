from uuid import uuid4

from backend.ai_engine.review import run_ai_review


class StubProvider:
    enabled = True
    model = "synthetic-test-model"

    def __init__(self, responses):
        self.responses = iter(responses)

    def complete_json(self, system_prompt, user_content):
        return next(self.responses)


class StubEmbeddingProvider:
    configured = True
    model = "synthetic-test-embedding"

    def embed_texts(self, texts):
        assert len(texts) == 1
        return [[0.0] * 1536]


def test_ai_review_rejects_fabricated_evidence_and_preserves_codepoint_offsets(monkeypatch):
    evidence_id = str(uuid4())
    monkeypatch.setattr(
        "backend.ai_engine.review.retrieve_context",
        lambda *args, **kwargs: [
            {
                "kind": "rule",
                "id": evidence_id,
                "stable_id": "BR-1",
                "version": 1,
                "text": "Use approved claims.",
                "similarity": 0.9,
            }
        ],
    )
    text = "🚀 We serve twelve countries."
    provider = StubProvider(
        [
            {"claims": [{"quoted_span": "We serve twelve countries."}]},
            {
                "verification": "contradicted",
                "findings": [
                    {
                        "category": "claim_review",
                        "severity": "medium",
                        "quoted_span": "We serve twelve countries.",
                        "explanation": "Synthetic evidence conflict.",
                        "suggested_correction": "We serve twelve regions.",
                        "confidence_score": 0.9,
                        "evidence_id": str(uuid4()),
                        "evidence_kind": "rule",
                    },
                    {
                        "category": "claim_review",
                        "severity": "medium",
                        "quoted_span": "We serve twelve countries.",
                        "explanation": "Valid cited test finding.",
                        "suggested_correction": None,
                        "confidence_score": 0.8,
                        "evidence_id": evidence_id,
                        "evidence_kind": "rule",
                    },
                ],
            },
        ]
    )

    result = run_ai_review(
        text,
        [],
        [],
        db=object(),
        workspace_id=uuid4(),
        provider=provider,
        embedding_provider=StubEmbeddingProvider(),
    )

    assert result["rejected_uncited_findings"] == 1
    assert len(result["findings"]) == 1
    finding = result["findings"][0]
    assert finding["start_offset"] == 2
    assert finding["end_offset"] == len(text)
    assert text[finding["start_offset"] : finding["end_offset"]] == finding["quoted_span"]
    assert evidence_id in finding["source_citation"]


def test_ai_review_marks_claim_unverified_when_no_evidence_is_retrieved(monkeypatch):
    monkeypatch.setattr(
        "backend.ai_engine.review.retrieve_context",
        lambda *args, **kwargs: [],
    )
    text = "The device runs on moonlight."
    result = run_ai_review(
        text,
        [],
        [],
        db=object(),
        workspace_id=uuid4(),
        provider=StubProvider(
            [{"claims": [{"quoted_span": text}]}
            ]
        ),
        embedding_provider=StubEmbeddingProvider(),
    )

    assert result["findings"] == []
    assert result["unverified_claims"][0]["quoted_span"] == text
    assert result["unverified_claims"][0]["start_offset"] == 0
