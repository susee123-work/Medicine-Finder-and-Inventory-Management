import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db.client import db
from backend.app.seed.generate_seed import seed_database

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Ensure database is seeded once before running tests."""
    pharms = db.get_table("pharmacies")
    if not pharms:
        seed_database()
    yield

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

