from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, model_validator

class RegisterRequest(BaseModel):
    workspace_name: str = Field(min_length=2, max_length=150)
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class DemoRegisterRequest(BaseModel):
    workspace_name: str = Field(default="Round 2 Demo", min_length=1, max_length=150)
    full_name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)

    @model_validator(mode="after")
    def require_nonempty_values(self):
        if not self.full_name.strip() or not self.email.strip() or not self.password.strip():
            raise ValueError("Name, email, and password must not be empty.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class DemoLoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)

    @model_validator(mode="after")
    def require_nonempty_values(self):
        if not self.email.strip() or not self.password.strip():
            raise ValueError("Email and password must not be empty.")
        return self


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = None

    @model_validator(mode="after")
    def require_profile_change(self):
        if self.full_name is None and self.email is None:
            raise ValueError("Provide a profile field to update.")
        return self

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=10, max_length=128)

class FactCreate(BaseModel):
    statement: str = Field(min_length=3, max_length=10000)
    source_reference: str | None = Field(default=None, max_length=500)
    valid_from: date | None = None
    valid_until: date | None = None

    @model_validator(mode="after")
    def validate_validity_period(self):
        if self.valid_from and self.valid_until and self.valid_until < self.valid_from:
            raise ValueError("valid_until must be on or after valid_from")
        return self

class RuleCreate(BaseModel):
    guideline_doc_id: UUID
    stable_id: str = Field(min_length=1, max_length=100)
    statement: str = Field(min_length=3, max_length=10000)
    version: int = Field(default=1, ge=1)

class LexiconCreate(BaseModel):
    term: str = Field(min_length=1, max_length=255)
    term_category: Literal["banned", "avoid", "preferred"] = "banned"
    preferred_replacement: str | None = Field(default=None, max_length=255)
    explanation: str | None = Field(default=None, max_length=5000)

class ContentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=1000000)
    channel: str | None = Field(default=None, max_length=100)
    content_type: str = Field(default="general", max_length=100)
    provenance: str | None = Field(default=None, max_length=5000)

class DecisionCreate(BaseModel):
    decision_type: Literal["accept", "reject", "override"]
    decision_reason: str | None = Field(default=None, max_length=5000)
