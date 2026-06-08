Unicode true
Name "Sanaka Tools"
OutFile "..\dist\setup.exe"
InstallDir "$PROGRAMFILES\Sanaka Tools"
RequestExecutionLevel user
ShowInstDetails show

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File "..\dist\sanaka_clipboard.exe"
  File "..\config\sanaka-clipboard.ini"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SanakaClipboard" '"$INSTDIR\sanaka_clipboard.exe"'

  DetailPrint "Sanaka Tools installed."
  DetailPrint "Clipboard client: $INSTDIR\sanaka_clipboard.exe"
  DetailPrint "Configuration: $INSTDIR\sanaka-clipboard.ini"

  Exec '"$INSTDIR\sanaka_clipboard.exe"'
SectionEnd
