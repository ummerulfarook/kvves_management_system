@echo off
:: KVVA Management System — Database Backup Scheduler Installer
:: Run this script as Administrator to configure daily automated backups in Windows Task Scheduler.

title KVVA Database Backup Scheduler Setup

echo ==========================================================
echo   KVVA Management System — Database Backup Scheduler
echo ==========================================================
echo.
echo This script will schedule daily backups of your KVVA application database.
echo Backups are saved in the project root's "backups" folder.
echo Old backups (>30 days) are automatically cleaned up.
echo.
echo NOTE: Please run this command prompt as Administrator if the setup fails.
echo.

set /p BACKUP_TIME="Enter daily backup time in 24hr format (HH:MM) [default: 21:00]: "
if "%BACKUP_TIME%"=="" set BACKUP_TIME=21:00

:: Setup the path
set BACKUP_SCRIPT=%~dp0run_backup.bat

echo.
echo Scheduling daily backup at %BACKUP_TIME% using Windows Task Scheduler...
echo Command target: %BACKUP_SCRIPT%
echo.

:: Create the scheduled task
schtasks /create /tn "KVVA_Database_Backup" /tr "\"%BACKUP_SCRIPT%\" --scheduled" /sc daily /st %BACKUP_TIME% /f

if %errorlevel% equ 0 (
    echo.
    echo ==========================================================
    echo   SUCCESS: Daily automated backup scheduled at %BACKUP_TIME%!
    echo ==========================================================
) else (
    echo.
    echo ==========================================================
    echo   ERROR: Task scheduling failed.
    echo   Please run this batch file as Administrator!
    echo   Right-click on the file and choose "Run as administrator".
    echo ==========================================================
)

echo.
pause
