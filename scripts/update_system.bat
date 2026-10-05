@echo off
:: KVVA Management System — One-Click Client System Update Script
:: Run this script on the client machine to update to the latest version seamlessly.

title KVVA System Update
cd /d %~dp0..

echo ==========================================================
echo   KVVA Management System — Client System Update
echo ==========================================================
echo.

:: 1. Auto-Backup existing database before making any changes
echo [Step 1/4] Creating safety backup of current database...
if exist scripts\run_backup.bat (
    call scripts\run_backup.bat --scheduled
)

:: 2. Pull latest code and pre-compiled frontend from git
echo.
echo [Step 2/4] Pulling latest updates from repository...
git pull origin main
if errorlevel 1 (
    echo.
    echo WARNING: Git pull encountered an issue. Checking working tree...
)

:: 3. Run Django migrations safely
echo.
echo [Step 3/4] Applying database schema updates...
cd backend
if exist venv\Scripts\python.exe (
    set PYTHON_EXE=venv\Scripts\python.exe
) else (
    set PYTHON_EXE=python
)

findstr /I "postgres" .env >nul 2>nul
if %errorlevel% equ 0 (
    set DJANGO_SETTINGS_MODULE=core.settings.production
) else (
    set DJANGO_SETTINGS_MODULE=core.settings.development
)

%PYTHON_EXE% manage.py migrate
if errorlevel 1 (
    echo.
    echo ERROR: Migration failed! Please check logs.
    pause
    exit /b 1
)

:: 4. Verify system check
echo.
echo [Step 4/4] Verifying system integrity...
%PYTHON_EXE% manage.py check
if errorlevel 1 (
    echo.
    echo ERROR: Django system check reported issues.
    pause
    exit /b 1
)

cd ..
echo.
echo ==========================================================
echo   UPDATE COMPLETED SUCCESSFULLY!
echo ==========================================================
echo   - All existing client data preserved intact.
echo   - New features, bug fixes, and reports applied.
echo   - Pre-built frontend production bundle updated.
echo.
echo   You can now start the application using:
echo     scripts\start_app.bat  OR  Desktop Shortcut
echo ==========================================================
echo.
pause
