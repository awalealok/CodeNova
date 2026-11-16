from backend.models.audit_event import AuditEvent

def record_event(db, workspace_id, actor_id, event_type, entity_type, entity_id, description, metadata=None):
    event = AuditEvent(workspace_id=workspace_id, actor_id=actor_id, event_type=event_type,
        entity_type=entity_type, entity_id=entity_id, action_description=description,
        event_metadata=metadata or {})
    db.add(event)
    return event
