# Sanaka Tools XP build + installer script
# Requires: MinGW32 (from Pier toolchain), NSIS 3.x

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir

# MinGW32 paths to search (in order)
$MingwPaths = @(
    # Pier project toolchain (relative from sanaka-tools)
    "E:\backup\pier-2.0.0-beta1\dev\toolchains\mingw32\bin",
    # Relative to ProjectDir (G:\work\sanaka)
    (Join-Path (Split-Path -Parent $ProjectDir) "dev\toolchains\mingw32\bin"),
    # User-specified env var
    $env:MINGW32_DIR
)

# NSIS paths to search
$NsisPaths = @(
    "${env:ProgramFiles(x86)}\NSIS",
    "$env:ProgramFiles\NSIS",
    $env:NSIS_DIR
)

$SrcFile = Join-Path $ProjectDir "src\sanaka_tools.c"
$DistDir = Join-Path $ProjectDir "dist"
$OutExe = Join-Path $DistDir "sanaka_clipboard.exe"
$NsiFile = Join-Path $ProjectDir "installer\sanaka-tools.nsi"

# Find MinGW32 gcc
$gcc = $null
foreach ($p in $MingwPaths) {
    if ($p -and (Test-Path "$p\i686-w64-mingw32-gcc.exe")) {
        $gcc = "$p\i686-w64-mingw32-gcc.exe"
        break
    }
}
if (-not $gcc) {
    Write-Error "[ERROR] MinGW32 gcc not found. Set MINGW32_DIR env var or install Pier toolchain."
    exit 1
}

# Find NSIS makensis
$makensis = $null
foreach ($p in $NsisPaths) {
    if ($p -and (Test-Path "$p\makensis.exe")) {
        $makensis = "$p\makensis.exe"
        break
    }
}
if (-not $makensis) {
    Write-Error "[ERROR] makensis not found. Install NSIS 3.x"
    exit 1
}

Write-Host "[1/2] Compiling sanaka_clipboard.exe ..."

$Mingw32Dir = Split-Path -Parent $gcc
$env:PATH = "$Mingw32Dir;$env:PATH"

& $gcc -std=c89 -Os -s -mwindows -DWINVER=0x0501 -D_WIN32_WINNT=0x0501 -Wall -Wextra -o $OutExe $SrcFile -lws2_32
if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Compilation failed (exit $LASTEXITCODE)"
    exit 1
}
Write-Host "[OK] $OutExe"

Write-Host "[2/2] Building setup.exe ..."

& $makensis $NsiFile
if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Installer build failed (exit $LASTEXITCODE)"
    exit 1
}

Write-Host "[OK] Setup installer built!"
Get-ChildItem $DistDir | Select-Object Name, Length
