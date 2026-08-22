@echo off
:: KVVA Management System — High Performance Frontend Server
title KVVA Frontend Server

cd /d %~dp0..\frontend

echo =====================================================
echo   KVVA Frontend Server
echo   URL: http://localhost:5173
echo =====================================================

:: Use backend Python environment
if exist ..\backend\venv\Scripts\python.exe (
    set PYTHON_EXE=..\backend\venv\Scripts\python.exe
) else (
    set PYTHON_EXE=python
)

if exist dist (
    echo Starting optimized production server...
    %PYTHON_EXE% -m http.server 5173 --directory dist
) else (
    if not exist node_modules (
        echo Installing node_modules...
        call npm install
    )
    echo Building production bundle...
    call npm run build
    if exist dist (
        %PYTHON_EXE% -m http.server 5173 --directory dist
    ) else (
        call npm run dev
    )
)

pause
