"""
MediPulse AI: Backend entrypoint.
Allows running directly from within the backend directory:
    python main.py
Or via uvicorn:
    uvicorn main:app --reload
"""
import os
import sys

# Add root workspace directory to sys.path so 'backend.app' can always be imported
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Ensure child processes (uvicorn reloader / multiprocessing spawn) inherit PYTHONPATH
current_pythonpath = os.environ.get("PYTHONPATH", "")
if root_dir not in current_pythonpath.split(os.pathsep):
    os.environ["PYTHONPATH"] = f"{root_dir}{os.pathsep}{current_pythonpath}" if current_pythonpath else root_dir

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True, app_dir=root_dir)

