@echo off
setlocal
set "TOGETHER_NEOFORGE_PREVIEW=1"
call "%~dp0start-together.cmd"
exit /b %errorlevel%
