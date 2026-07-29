@echo off
:: KVVA Management System — Database Backup Launcher Script
:: Run this to manually perform a database backup.

title KVVA Database Backup Launcher

cd /d %~dp0..\backend

echo Starting database backup process...
if exist venv\Scripts\python.exe (
    set PYTHON_EXE=venv\Scripts\python.exe
) else (
    set PYTHON_EXE=python
)
%PYTHON_EXE% backup.py

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Backup process failed!
    if "%1" neq "--scheduled" pause
    exit /b 1
)

echo.
echo Database backup process completed successfully.
echo.
if "%1" neq "--scheduled" pause
