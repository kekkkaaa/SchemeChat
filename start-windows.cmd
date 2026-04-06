@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul
if errorlevel 1 (
  echo Failed to switch to the project directory.
  exit /b 1
)

if not exist "node_modules\electron\cli.js" (
  echo Missing Electron CLI. Run npm install first.
  set "EXIT_CODE=1"
  goto :end
)

where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
  ) else (
    echo Node.js was not found. Install Node.js 20+ and reopen the terminal.
    set "EXIT_CODE=1"
    goto :end
  )
)

node "node_modules\electron\cli.js" .
set "EXIT_CODE=%ERRORLEVEL%"

:end
popd >nul
exit /b %EXIT_CODE%
