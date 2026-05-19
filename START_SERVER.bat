@echo off
echo ============================================
echo   UOG Statistics Department Portal
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo.
    echo Please download and install Node.js from:
    echo   https://nodejs.org/en/download
    echo.
    echo After installing, run this file again.
    pause
    exit /b
)

echo [1/2] Installing dependencies...
call npm install

echo.
echo [2/2] Starting server...
echo.
echo ============================================
echo   Portal is running!
echo   Open this link in your browser:
echo   http://localhost:3000
echo ============================================
echo.
node server.js
pause
