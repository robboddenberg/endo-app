# Endo-App Startskript fuer Windows PowerShell
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

$Port = if ($env:PORT) { [int]$env:PORT } else { 8000 }
$BindHost = if ($env:ALLOW_LAN -in @("1", "true", "yes")) { "0.0.0.0" } else { "127.0.0.1" }

# Python-Interpreter bestimmen (.venv, venv oder lokales Python 3.12)
$PyExe = "python"
$VenvPy = Join-Path $RootDir ".venv\Scripts\python.exe"
$AltVenvPy = Join-Path $RootDir "venv\Scripts\python.exe"
$LocalPy312 = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"

if (Test-Path $VenvPy) {
    $PyExe = $VenvPy
} elseif (Test-Path $AltVenvPy) {
    $PyExe = $AltVenvPy
} elseif (Test-Path $LocalPy312) {
    $PyExe = $LocalPy312
} else {
    Write-Host "Erstelle virtuelle Python-Umgebung (venv)..." -ForegroundColor Cyan
    python -m venv venv
    $PyExe = $AltVenvPy
}

Write-Host "Pruefe Python-Abhaengigkeiten..." -ForegroundColor Cyan
& $PyExe -m pip install -r requirements.txt | Out-Null

$DataFile = Join-Path $RootDir "data\data.json"
if (-not (Test-Path $DataFile)) {
    Write-Host "Erzeuge initiale 90-Tage Demo-Daten..." -ForegroundColor Cyan
    & $PyExe scripts/build_initial_data.py
}

Write-Host "Starte Endo-App Server auf http://${BindHost}:${Port} ..." -ForegroundColor Green
& $PyExe -m uvicorn backend.app.main:app --reload --host $BindHost --port $Port
