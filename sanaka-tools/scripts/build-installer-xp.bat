@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set NSI_FILE=%PROJECT_DIR%\installer\sanaka-tools.nsi

where makensis >nul 2>nul
if errorlevel 1 (
  echo makensis not found in PATH.
  echo Please install NSIS and ensure makensis.exe is available.
  exit /b 1
)

call "%SCRIPT_DIR%build-win32-xp.bat"
if errorlevel 1 exit /b 1

makensis "%NSI_FILE%"
if errorlevel 1 (
  echo Failed to build setup.exe
  exit /b 1
)

echo Built installer: %PROJECT_DIR%\dist\setup.exe
