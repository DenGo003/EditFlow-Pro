param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Tag)
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'EditFlowPro'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$log=Join-Path $root 'online-update.log'
function Log($msg){Add-Content -LiteralPath $log -Value ("$(Get-Date -Format o) $msg")}
try {
 Log "Waiting for Premiere to exit for $Tag"
 if(!(Test-Path -LiteralPath $Archive -PathType Leaf)){throw "Update package not found: $Archive"}
 $deadline=(Get-Date).AddMinutes(15)
 while((Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -like '*Premiere*'})) {
  if((Get-Date) -gt $deadline){throw 'Premiere did not exit within 15 minutes. No files changed.'}
  Start-Sleep -Seconds 2
 }
 $procs=Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'backend.server' -and $_.CommandLine -match 'EditFlowPro' }
 foreach($p in $procs){Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue}
 $workspace=Join-Path $root ('UpdateStaging\unpacked-'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory $workspace -Force | Out-Null
 Expand-Archive -LiteralPath $Archive -DestinationPath $workspace -Force
 $source=$workspace
 if(!(Test-Path (Join-Path $source 'plugin\CSXS\manifest.xml'))){
  $dirs=@(Get-ChildItem -LiteralPath $workspace -Directory)
  if($dirs.Count -ne 1){throw 'Archive must contain one project root or plugin folder.'}
  $source=$dirs[0].FullName
 }
 if(!(Test-Path (Join-Path $source 'plugin\CSXS\manifest.xml')) -or !(Test-Path (Join-Path $source 'backend\server.py'))){throw 'Invalid update package layout.'}
 # Refuse package that does not match the requested GitHub release tag.
 [xml]$packageManifest=Get-Content -LiteralPath (Join-Path $source 'plugin\CSXS\manifest.xml') -Raw
 if(('v'+$packageManifest.ExtensionManifest.ExtensionBundleVersion) -ne $Tag){throw 'Release tag and extension version do not match.'}
 $target=Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.editflow.pro.cep'
 $config=Join-Path $root 'cep-launcher.json'
 if(!(Test-Path $config)){throw 'Missing installed backend settings.'}
 $cfg=Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
 $app=$cfg.backendRoot
 if(!$app -or !(Test-Path (Join-Path $app '.venv\Scripts\python.exe'))){throw 'Original Python environment not found.'}
 $backup=Join-Path $root ('ExtensionBackups\online-'+(Get-Date -Format yyyyMMdd-HHmmss))
 $newPanel=Join-Path $workspace 'panel-new'
 Copy-Item -LiteralPath (Join-Path $source 'plugin') -Destination $newPanel -Recurse
 New-Item -ItemType Directory $backup -Force | Out-Null
 if(Test-Path $target){Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'plugin') -Recurse}
 foreach($name in @('backend','scripts')){if(Test-Path (Join-Path $app $name)){Copy-Item -LiteralPath (Join-Path $app $name) -Destination (Join-Path $backup $name) -Recurse}}
 $oldPanel=Join-Path $workspace 'panel-old'
 try {
  if(Test-Path $target){Move-Item -LiteralPath $target -Destination $oldPanel}
  Move-Item -LiteralPath $newPanel -Destination $target
  foreach($name in @('backend','scripts')){
   $from=Join-Path $source $name; $to=Join-Path $app $name
   if(Test-Path $from){New-Item -ItemType Directory $to -Force | Out-Null;Copy-Item -Path (Join-Path $from '*') -Destination $to -Recurse -Force}
  }
  Log "SUCCESS updated $Tag. Backup: $backup"
  try { schtasks.exe /Delete /TN ('EditFlowPro-Update-'+($Tag -replace '[^0-9A-Za-z_-]','_')) /F 2>$null | Out-Null } catch {}
 } catch {
  Log "Installation error: $_. Attempting rollback"
  if(Test-Path $target){Remove-Item -LiteralPath $target -Recurse -Force}
  if(Test-Path $oldPanel){Move-Item -LiteralPath $oldPanel -Destination $target}
  foreach($name in @('backend','scripts')){
   $saved=Join-Path $backup $name; $to=Join-Path $app $name
   if(Test-Path $saved){if(Test-Path $to){Remove-Item -LiteralPath $to -Recurse -Force};Copy-Item -LiteralPath $saved -Destination $to -Recurse}
  }
  throw
 }
} catch {Log "FAILED: $_";exit 1}
