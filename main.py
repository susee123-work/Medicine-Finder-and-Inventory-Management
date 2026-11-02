"""
MediPulse AI: Root application entrypoint.
Allows running from workspace root:
    uvicorn main:app --reload
Or from backend directory:
    cd backend && uvicorn app.main:app --reload
"""
import sys
import os

# Add workspace directory to pythonpath
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
