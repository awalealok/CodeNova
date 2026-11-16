import re
from datetime import date

def run_deterministic_checks(text: str, rules: list, facts: list, terms: list):
    """Return only evidence-backed deterministic findings; never invent a source."""
    findings = []
    for term in terms:
        if not term.is_active or getattr(term, "term_category", "banned") not in {"banned", "avoid"}:
            continue
        pattern = re.compile(r'(?<!\w)' + re.escape(term.term) + r'(?!\w)', re.IGNORECASE)
        for match in pattern.finditer(text):
            findings.append({
                'finding_category': 'terminology_drift', 'severity': 'medium',
                'quoted_span': match.group(0),
                'start_offset': match.start(), 'end_offset': match.end(),
                'explanation': f'The term “{term.term}” is listed in the workspace lexicon as a term to avoid.',
                'suggested_correction': term.preferred_replacement,
                'confidence_score': 1.0, 'rule_id': None, 'fact_id': None,
                'source_citation': f'Lexicon term: {term.term}'
            })
    for rule in rules:
        # Only run rules with an explicit, machine-readable banned-term convention.
        match = re.match(r'(?i)^\s*(?:banned term|avoid term)\s*:\s*(.+?)\s*$', rule.statement)
        if not match:
            continue
        banned = match.group(1)
        pattern = re.compile(r'(?<!\w)' + re.escape(banned) + r'(?!\w)', re.IGNORECASE)
        for found in pattern.finditer(text):
            findings.append({
                'finding_category': 'terminology_drift', 'severity': 'high',
                'quoted_span': found.group(0),
                'start_offset': found.start(), 'end_offset': found.end(),
                'explanation': f'This wording violates guideline rule {rule.stable_id}.',
                'suggested_correction': None, 'confidence_score': 1.0,
                'rule_id': rule.id, 'fact_id': None,
                'source_citation': f'Rule {rule.stable_id} v{rule.version}: {rule.statement}'
            })
    today = date.today()
    for fact in facts:
        if fact.valid_until and fact.valid_until < today:
            # Date-based expiry is surfaced as a review warning; no unsupported claim is called false.
            needle = fact.statement.strip()
            if needle and needle.casefold() in text.casefold():
                start = text.casefold().find(needle.casefold())
                findings.append({
                    'finding_category': 'outdated_information', 'severity': 'high',
                    'quoted_span': text[start:start+len(needle)],
                    'start_offset': start, 'end_offset': start + len(needle),
                    'explanation': 'This exact approved fact appears in the content, but its validity period has expired. Confirm the current approved value.',
                    'suggested_correction': None, 'confidence_score': 1.0,
                    'rule_id': None, 'fact_id': fact.id,
                    'source_citation': f'Fact source: {fact.source_reference or "not supplied"}; valid until {fact.valid_until.isoformat()}'
                })
    return findings

def validate_finding_citation(finding: dict, source_text: str, rules: list, facts: list) -> bool:
    span = finding.get('quoted_span', '')
    if not span or span not in source_text:
        return False
    rule_ids = {str(r.id) for r in rules}
    fact_ids = {str(f.id) for f in facts}
    if finding.get('rule_id') and str(finding['rule_id']) not in rule_ids:
        return False
    if finding.get('fact_id') and str(finding['fact_id']) not in fact_ids:
        return False
    return bool(finding.get('rule_id') or finding.get('fact_id') or finding.get('source_citation','').startswith('Lexicon term:'))
