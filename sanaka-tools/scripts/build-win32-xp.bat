@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set SRC_FILE=%PROJECT_DIR%\src\sanaka_tools.c
set DIST_DIR=%PROJECT_DIR%\dist
set OUTPUT_FILE=%DIST_DIR%\sanaka_clipboard.exe

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"

set CC=gcc
where %CC% >nul 2>nul
if errorlevel 1 (
  echo gcc not found in PATH.
  echo Please open the MinGW32 shell or add MinGW32 bin to PATH.
  exit /b 1
)

%CC% ^
  -std=c89 ^
  -Os ^
  -s ^
  -mwindows ^
  -DWINVER=0x0501 ^
  -D_WIN32_WINNT=0x0501 ^
  -Wall ^
  -Wextra ^
  -o "%OUTPUT_FILE%" ^
  "%SRC_FILE%" ^
  -lws2_32

if errorlevel 1 (
  echo Failed to build sanaka_clipboard.exe
  exit /b 1
)

echo Built: %OUTPUT_FILE%
