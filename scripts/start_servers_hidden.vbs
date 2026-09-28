Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Start backend server silently in background
WshShell.Run "cmd.exe /c """ & scriptDir & "\start_backend.bat""", 0, False

' Start frontend static server silently in background
WshShell.Run "cmd.exe /c """ & scriptDir & "\start_frontend.bat""", 0, False
