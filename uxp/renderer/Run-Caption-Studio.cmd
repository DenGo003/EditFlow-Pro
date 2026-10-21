@echo off
setlocal
powershell.exe -NoLogo -NoProfile -Command "try { $ErrorActionPreference='Stop'; $state=Join-Path $env:LOCALAPPDATA 'EditFlowPro'; $cfg=Get-Content -LiteralPath (Join-Path $state 'cep-launcher.json') -Raw | ConvertFrom-Json; $python=[string]$cfg.backendPython; if (!$python) { $python=Join-Path $cfg.backendRoot '.venv\Scripts\python.exe' }; & $python (Join-Path $cfg.backendRoot 'scripts\launch.py') --caption; exit $LASTEXITCODE } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 pause
endlocal
