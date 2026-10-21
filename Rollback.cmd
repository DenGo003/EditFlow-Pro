@echo off
setlocal
set "EDITFLOW_UPDATE_SOURCE=%~dp0"
powershell.exe -NoLogo -NoProfile -Command "try { $ErrorActionPreference='Stop'; $state=Join-Path $env:LOCALAPPDATA 'EditFlowPro'; $cfg=Get-Content -LiteralPath (Join-Path $state 'cep-launcher.json') -Raw | ConvertFrom-Json; $python=[string]$cfg.backendPython; if (!$python) { $python=Join-Path $cfg.backendRoot '.venv\Scripts\python.exe' }; & $python (Join-Path $env:EDITFLOW_UPDATE_SOURCE 'scripts\rollback.py'); exit $LASTEXITCODE } catch { Write-Host $_.Exception.Message; exit 1 }"
pause
endlocal
