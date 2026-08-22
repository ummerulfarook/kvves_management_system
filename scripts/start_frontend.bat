@echo off
:: KVVA Management System — High Performance Frontend Server
title KVVA Frontend Server

cd /d %~dp0..\frontend

echo =====================================================
echo   KVVA Frontend Server
echo   URL: http://localhost:5173
echo =====================================================

if not exist dist (
    echo Building optimized production frontend for low-spec PC performance...
    call npm run build
)

if exist dist (
    echo Starting optimized frontend server...
    call npm run preview -- --host 0.0.0.0 --port 5173
) else (
    echo Starting dev server fallback...
    call npm run dev
)

pause
