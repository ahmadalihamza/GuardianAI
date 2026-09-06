@echo off
echo ========================================
echo   GuardianAI - Frontend Dashboard
echo ========================================
echo.

cd /d "%~dp0frontend"

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm was not found on PATH.
    echo Install Node.js 18.18 or newer from https://nodejs.org and try again.
    exit /b 1
)

set "NEED_INSTALL=0"
set "PROD=0"
if not exist node_modules set "NEED_INSTALL=1"

:parse_args
if "%~1"=="" goto args_parsed
if /i "%~1"=="--install" set "NEED_INSTALL=1"
if /i "%~1"=="--prod" set "PROD=1"
shift
goto parse_args
:args_parsed

if "%NEED_INSTALL%"=="1" (
    echo Installing / updating Node dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)

if "%PORT%"=="" set "PORT=3000"

echo.
echo Starting GuardianAI Dashboard on http://localhost:%PORT%
echo Backend is expected on http://localhost:8000 ^(override with BACKEND_URL^)
echo Press Ctrl+C to stop
echo.

if "%PROD%"=="1" (
    call npm run build
    if errorlevel 1 exit /b 1
    call npx next start -p %PORT%
) else (
    call npx next dev -p %PORT%
)
