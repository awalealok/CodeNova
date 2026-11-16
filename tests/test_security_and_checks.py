from datetime import date, timedelta
from types import SimpleNamespace
from backend.services.security import hash_password, verify_password
from backend.rule_engine.checks import run_deterministic_checks, validate_finding_citation

def test_password_hash_round_trip():
    encoded = hash_password('A-strong-password-123')
    assert encoded != 'A-strong-password-123'
    assert verify_password('A-strong-password-123', encoded)
    assert not verify_password('wrong-password', encoded)

def test_lexicon_check_and_citation_gate():
    term = SimpleNamespace(is_active=True, term='best in class', preferred_replacement='industry-leading by measured result')
    text = 'Our product is best in class.'
    findings = run_deterministic_checks(text, [], [], [term])
    assert len(findings) == 1
    assert findings[0]['quoted_span'] == 'best in class'
    assert validate_finding_citation(findings[0], text, [], [])

def test_preferred_lexicon_terms_are_not_flagged_as_prohibited():
    preferred = SimpleNamespace(
        is_active=True,
        term_category='preferred',
        term='customer',
        preferred_replacement='client',
    )
    assert run_deterministic_checks('We serve every customer.', [], [], [preferred]) == []

def test_expired_fact_is_not_called_false():
    fact = SimpleNamespace(valid_until=date.today()-timedelta(days=1), statement='serves 40 countries', source_reference='Approved fact sheet', id='fact-1')
    text = 'Our company serves 40 countries.'
    findings = run_deterministic_checks(text, [], [fact], [])
    assert findings[0]['finding_category'] == 'outdated_information'
    assert 'validity period has expired' in findings[0]['explanation']
    assert 'incorrect' not in findings[0]['explanation']
