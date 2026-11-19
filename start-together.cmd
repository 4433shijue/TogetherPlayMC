@echo off
cd /d "%~dp0"
if not defined TOGETHER_DATA set "TOGETHER_DATA=%LOCALAPPDATA%\TogetherPlayMC\data"
if not exist "runtime\node\node.exe" (
  echo Bundled Node.js 24 is missing. Please restore runtime\node\node.exe.
  pause
  exit /b 1
)
"runtime\node\node.exe" "src\server.mjs" --open
pause
