@echo off
:: KVVES Management System — Create Desktop Shortcut
:: Run this to create a desktop shortcut that opens the app silently without a terminal.

title KVVES Desktop Shortcut Creator

echo ==========================================================
echo   KVVES Management System — Create Desktop Shortcut
echo ==========================================================
echo.

set TARGET_VBS=%~dp0launch_app_hidden.vbs

echo Creating desktop shortcut...
echo Target: %TARGET_VBS%
echo.

:: Create a temporary VBScript to generate the shortcut
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\create_shortcut.vbs"
echo destPath = WshShell.SpecialFolders("Desktop") >> "%temp%\create_shortcut.vbs"
echo Set Shortcut = WshShell.CreateShortcut(destPath ^& "\KVVES Management System.lnk") >> "%temp%\create_shortcut.vbs"
echo Shortcut.TargetPath = "wscript.exe" >> "%temp%\create_shortcut.vbs"
echo Shortcut.Arguments = """%TARGET_VBS%""" >> "%temp%\create_shortcut.vbs"
echo Shortcut.WorkingDirectory = "%~dp0" >> "%temp%\create_shortcut.vbs"
echo Shortcut.Description = "Launch KVVES Management System" >> "%temp%\create_shortcut.vbs"
if exist "%~dp0app_icon.ico" (
    echo Shortcut.IconLocation = "%~dp0app_icon.ico" >> "%temp%\create_shortcut.vbs"
) else if exist "%~dp0..\app_icon.ico" (
    echo Shortcut.IconLocation = "%~dp0..\app_icon.ico" >> "%temp%\create_shortcut.vbs"
) else (
    echo Shortcut.IconLocation = "shell32.dll, 85" >> "%temp%\create_shortcut.vbs"
)
echo Shortcut.Save >> "%temp%\create_shortcut.vbs"

cscript //nologo "%temp%\create_shortcut.vbs"
set CSCRIPT_ERR=%errorlevel%
del "%temp%\create_shortcut.vbs"

if %CSCRIPT_ERR% equ 0 (
    echo ==========================================================
    echo   SUCCESS: Desktop Shortcut created successfully!
    echo   Double-click the "KVVES Management System" shortcut
    echo   on your Desktop to launch the app silently.
    echo ==========================================================
) else (
    echo ERROR: Failed to create shortcut.
)

echo.
pause
