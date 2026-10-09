# Run only in a disposable Windows checkout without a local .env or database.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$installer = Join-Path $root 'scripts\windows\bitacoras.ps1'
$envFile = Join-Path $root '.env'
if ((Test-Path -LiteralPath $envFile) -or (Test-Path -LiteralPath (Join-Path $root 'backend\data'))) {
    throw 'La prueba requiere un checkout desechable sin configuracion ni datos locales.'
}
Set-Location -LiteralPath $root
$password = 'Test-' + [Guid]::NewGuid().ToString('N')
$OutputEncoding = New-Object Text.UTF8Encoding($false)
@{ name = 'Prueba Windows'; email = 'windows-test@bitacoras.local'; password = $password } |
    ConvertTo-Json -Compress | & node.exe (Join-Path $root 'scripts\windows\config.mjs') init
if ($LASTEXITCODE -ne 0) { throw 'Fallo la configuracion de prueba.' }
$configurationHash = (Get-FileHash -LiteralPath $envFile).Hash
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Install -Unattended -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion Windows.' }
    $settings = (& node.exe (Join-Path $root 'scripts\windows\config.mjs')) | ConvertFrom-Json
    $statePath = Join-Path $root '.windows\process.json'
    $firstProcess = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Start -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el segundo arranque.' }
    $secondProcess = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($firstProcess.id -ne $secondProcess.id) { throw 'El segundo arranque duplico la instancia.' }
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $body = @{ email = 'windows-test@bitacoras.local'; password = $password } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "$($settings.url)/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -WebSession $session -Headers @{ 'X-Bitacoras-Request' = '1'; Origin = $settings.url }
    if (-not $login.user.is_admin) { throw 'No se creo el administrador inicial.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Backup
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el respaldo Windows.' }
    if ((Get-FileHash -LiteralPath $envFile).Hash -ne $configurationHash) { throw 'La configuracion fue modificada.' }
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $root '.windows\backups') -Directory)
    if (-not ($backups | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'data\bitacoras.sqlite') })) { throw 'No se encontro la base en el respaldo.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action EnableAutostart
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo activar el inicio automatico.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action DisableAutostart
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo desactivar el inicio automatico.' }
    Write-Host 'OK: instalacion, API, administrador, arranque repetido, respaldo y acceso directo de inicio automatico.'
} finally {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Stop
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener la aplicacion Windows.' }
    if (Test-Path -LiteralPath (Join-Path $root '.windows\process.json')) { throw 'La instancia no se detuvo.' }
}
