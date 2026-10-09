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
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Update -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la comprobacion manual de actualizaciones.' }
    $unchangedProcess = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($firstProcess.id -ne $unchangedProcess.id) { throw 'Una revision sin cambios reinicio innecesariamente la aplicacion.' }
    $buildRevision = Join-Path $root '.windows\build-revision.txt'
    if (-not (Test-Path -LiteralPath $buildRevision)) { throw 'La compilacion no quedo asociada a su revision.' }
    Remove-Item -LiteralPath $buildRevision
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Update -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo recuperar una compilacion anterior al codigo instalado.' }
    if (-not (Test-Path -LiteralPath $buildRevision)) { throw 'No se reconstruyo la compilacion actual.' }
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $body = @{ email = 'windows-test@bitacoras.local'; password = $password } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "http://127.0.0.1:$($settings.webPort)/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -WebSession $session -Headers @{ 'X-Bitacoras-Request' = '1'; Origin = $settings.url }
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
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action DisableAutoUpdate
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo desactivar la actualizacion al abrir.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action EnableAutoUpdate
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo activar la actualizacion al abrir.' }
    & (Join-Path $root 'ApagarPuertos.cmd') --no-pause
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron liberar los puertos con ApagarPuertos.cmd.' }
    foreach ($port in @($settings.webPort, $settings.apiPort)) {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Any, $port)
        try { $listener.Start() }
        finally { $listener.Stop() }
    }
    & (Join-Path $root 'ApagarPuertos.cmd') --no-pause
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo repetir el apagado con los puertos libres.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Start -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo reiniciar despues de liberar los puertos.' }
    Write-Host 'OK: instalacion, administrador, actualizacion al abrir, comprobacion sin reinicio, respaldo, inicio automatico y ApagarPuertos.cmd.'
} catch {
    foreach ($log in @('application.log', 'error.log')) {
        $file = Join-Path $root ('.windows\' + $log)
        if (Test-Path -LiteralPath $file) { Write-Host "Registro de prueba: $log"; Get-Content -LiteralPath $file -Tail 40 | Out-Host }
    }
    throw
} finally {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Stop
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener la aplicacion Windows.' }
    if (Test-Path -LiteralPath (Join-Path $root '.windows\process.json')) { throw 'La instancia no se detuvo.' }
}
