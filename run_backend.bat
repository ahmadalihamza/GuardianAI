@echo off
echo ========================================
echo   GuardianAI - Backend Server
echo ========================================
echo.

cd /d "%~dp0"

set "NEED_INSTALL=0"
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
    set "NEED_INSTALL=1"
)

call venv\Scripts\activate

if "%1"=="--install" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="1" (
    echo Installing / updating dependencies...
    pip install -r requirements.txt
)

echo.
echo Starting GuardianAI Backend on http://localhost:8000
echo Press Ctrl+C to stop
echo.

python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
