from sqlalchemy import JSON
from pgvector.sqlalchemy import Vector

VECTOR_DIMENSIONS = 1536
VECTOR_TYPE = Vector(VECTOR_DIMENSIONS).with_variant(JSON(), "sqlite")
