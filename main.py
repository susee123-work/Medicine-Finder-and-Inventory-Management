"""
MediPulse AI: Root application entrypoint.
Allows running from workspace root:
    uvicorn main:app --reload
    python main.py
"""
import sys
import os

# Add workspace directory to pythonpath
root_dir = os.path.dirname(os.path.abspath(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Ensure child processes (uvicorn reloader / multiprocessing spawn) inherit PYTHONPATH
current_pythonpath = os.environ.get("PYTHONPATH", "")
if root_dir not in current_pythonpath.split(os.pathsep):
    os.environ["PYTHONPATH"] = f"{root_dir}{os.pathsep}{current_pythonpath}" if current_pythonpath else root_dir

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, app_dir=root_dir)
