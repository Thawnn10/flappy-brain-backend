@echo off
chcp 65001 >nul
title Flappy Brain Backend Server
color 0A

:menu
cls
echo ========================================
echo        FLAPPY BRAIN BACKEND
echo ========================================
echo.
echo   [1] Start Backend Server
echo   [2] Install Dependencies
echo   [3] Check Node.js Version
echo   [4] Test Backend Connection
echo   [5] View .env File
echo   [6] Open in Browser
echo   [7] Exit
echo.
set /p choice="Select option (1-7): "

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto install_deps
if "%choice%"=="3" goto check_node
if "%choice%"=="4" goto test_connection
if "%choice%"=="5" goto view_env
if "%choice%"=="6" goto open_browser
if "%choice%"=="7" exit

goto menu

:start_server
echo.
echo 🚀 Starting Backend Server...
if not exist "node_modules" call :install_deps
if not exist ".env" call :create_env
node server.js
pause
goto menu

:install_deps
echo 📦 Installing dependencies...
npm install
if %errorlevel% equ 0 (
    echo ✅ Dependencies installed successfully
) else (
    echo ❌ Failed to install dependencies
)
pause
goto :eof

:check_node
echo.
echo 📊 Checking Node.js environment...
node --version
npm --version
echo.
pause
goto menu

:test_connection
echo.
echo 🌐 Testing backend connection...
timeout /t 2 >nul
start "" "http://localhost:3000/api/health"
echo ⏳ Opening browser to test connection...
pause
goto menu

:view_env
echo.
echo 📄 .env file contents:
echo =====================
if exist ".env" (
    type ".env"
) else (
    echo File .env does not exist
)
echo =====================
pause
goto menu

:open_browser
start "" "http://localhost:3000/api/health"
echo 🌐 Opening backend health check...
goto menu

:create_env
echo 📝 Creating .env file...
(
    echo PORT=3000
    echo.
    echo # Groq API Key - Get from: https://console.groq.com/keys
    echo GROQ_API_KEY=your_key_here
    echo.
    echo NODE_ENV=development
) > .env
echo ✅ .env file created. Please edit it with your API key.
timeout /t 3
goto :eof