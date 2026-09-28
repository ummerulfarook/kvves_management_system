@echo off
:: KVVA Management System — Unified Launcher
:: Double-click this to start both backend and frontend servers.

title KVVA Management System Launcher

echo ==========================================================
echo   KVVA Management System — Launcher
echo ==========================================================
echo.
echo Starting Backend Server...
start "KVVA Backend Server" cmd /k "call %~dp0start_backend.bat"

echo Starting Frontend Server...
start "KVVA Frontend Server" cmd /k "call %~dp0start_frontend.bat"

echo.
echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ==========================================================
echo   Application started successfully!
echo   Web App URL: http://localhost:5173
echo.
echo   Please keep the server windows open while using the app.
echo ==========================================================
timeout /t 5
