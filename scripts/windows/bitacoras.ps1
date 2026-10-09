# Compatible with Windows PowerShell 5.1. Keep this file ASCII for its default encoding.
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Start', 'Stop', 'Status', 'Backup', 'Update', 'EnableAutostart', 'DisableAutostart', 'EnableAutoUpdate', 'DisableAutoUpdate')]
    [string]$Action = 'Install',
    [switch]$NoBrowser,
    [switch]$Unattended,
    [switch]$LibraryOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$script:Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:StateDirectory = Join-Path $script:Root '.windows'
$script:StateFile = Join-Path $script:StateDirectory 'process.json'
$script:ConfigHelper = Join-Path $PSScriptRoot 'config.mjs'
$script:UpdateHelper = Join-Path $PSScriptRoot 'update.mjs'
$script:Runner = Join-Path $script:Root 'scripts\run.mjs'
$script:Node = $null
$script:HealthFailure = 'Los servicios todavia no responden.'

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Fallo un comando ($File), codigo $LASTEXITCODE. No se completo la operacion." }
}

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
}

function Find-Node {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $command) { return $false }
    $script:Node = $command.Source
    & $script:Node -e "const [a,b,c] = process.versions.node.split('.').map(Number); process.exit(a > 22 || (a === 22 && (b > 13 || (b === 13 && c >= 0))) ? 0 : 1);"
    return ($LASTEXITCODE -eq 0)
}

function Require-Node {
    if (-not (Find-Node)) { throw 'Se necesita Node.js 22.13.0 o superior. Ejecuta Instalar.cmd o instala Node.js LTS desde nodejs.org.' }
}

function Install-Node {
    if (Find-Node) { return }
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw 'No se encontro WinGet. Instala Node.js LTS desde https://nodejs.org/es/download y vuelve a ejecutar Instalar.cmd.'
    }
    Write-Host 'Instalando Node.js LTS. Windows puede solicitar permiso de administrador.'
    Invoke-Checked 'winget.exe' @('install', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--source', 'winget', '--silent', '--accept-package-agreements', '--accept-source-agreements')
    Refresh-Path
    Require-Node
}

function Install-Git {
    if (Get-Command git.exe -ErrorAction SilentlyContinue) { return }
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'Instala Git desde https://git-scm.com/downloads para recibir actualizaciones de main.' }
    Write-Host 'Instalando Git para las actualizaciones de main. Windows puede solicitar permiso de administrador.'
    Invoke-Checked 'winget.exe' @('install', '--id', 'Git.Git', '--exact', '--source', 'winget', '--silent', '--accept-package-agreements', '--accept-source-agreements')
    Refresh-Path
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'No se encontro Git despues de instalarlo. Abre de nuevo Actualizar.cmd.' }
}

function Ensure-UpdateRepository {
    if (-not (Test-Path -LiteralPath (Join-Path $script:Root '.git'))) {
        Write-Host 'Preparando actualizaciones del ZIP; se verificaran los archivos antes de agregar Git.'
        $message = & $script:Node $script:UpdateHelper bootstrap
        if ($LASTEXITCODE -ne 0) { throw ($message -join ' ') }
    }
}

function Protect-Path {
    param([string]$Path, [switch]$Directory)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $rights = if ($Directory) { '(OI)(CI)F' } else { 'F' }
    Invoke-Checked 'icacls.exe' @($Path, '/inheritance:r', '/grant:r', "*${sid}:$rights", "*S-1-5-18:$rights", "*S-1-5-32-544:$rights")
}

function Get-Settings {
    $output = & $script:Node $script:ConfigHelper
    if ($LASTEXITCODE -ne 0) { throw 'Revisa los puertos y la configuracion local en .env.' }
    return ($output | ConvertFrom-Json)
}

function New-Configuration {
    $envFile = Join-Path $script:Root '.env'
    if (Test-Path -LiteralPath $envFile) {
        Write-Host 'Se conserva el archivo .env existente y las cuentas actuales.'
        return
    }
    if ($Unattended) { throw 'Para instalar sin preguntas debes preparar .env antes de ejecutar el instalador.' }
    Write-Host 'Configura el administrador inicial. La contrasena no se mostrara.'
    $name = Read-Host 'Nombre del administrador (Enter = Administrador)'
    if ([string]::IsNullOrWhiteSpace($name)) { $name = 'Administrador' }
    $email = Read-Host 'Correo del administrador'
    $first = Read-Host 'Contrasena (12 a 200 caracteres)' -AsSecureString
    $second = Read-Host 'Repite la contrasena' -AsSecureString
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
    try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
        $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
        if ($password -cne $confirmation) { throw 'Las contrasenas no coinciden. Vuelve a ejecutar Instalar.cmd.' }
        @{ name = $name; email = $email; password = $password } | ConvertTo-Json -Compress | & $script:Node $script:ConfigHelper init
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear .env. Corrige los datos y vuelve a ejecutar Instalar.cmd.' }
        Protect-Path $envFile
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
        $password = $null
        $confirmation = $null
        $first.Dispose()
        $second.Dispose()
    }
}

function Get-OwnedProcess {
    if (-not (Test-Path -LiteralPath $script:StateFile)) { return $null }
    $state = Get-Content -LiteralPath $script:StateFile -Raw | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$state.id)" -ErrorAction Stop
    if (-not $process) { return $null }
    # PID reuse must never stop an unrelated process.
    if ($process.CreationDate.ToUniversalTime().Ticks.ToString() -ne $state.createdTicks -or
        $process.ExecutablePath -ne $script:Node -or
        -not $process.CommandLine.Contains('"' + $script:Runner + '" start')) {
        throw 'El PID guardado pertenece a otro proceso. No se detendra. Revisa .windows/process.json.'
    }
    return $process
}

function Test-PortBusy {
    param([int]$Port)
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start(); return $false }
    catch [Net.Sockets.SocketException] { return $true }
    finally { $listener.Stop() }
}

function Assert-FreePorts {
    param($Settings)
    foreach ($port in @($Settings.webPort, $Settings.apiPort)) {
        if (Test-PortBusy $port) { throw "El puerto $port esta ocupado. Deten cualquier instancia de desarrollo u otra aplicacion antes de continuar." }
    }
}

function Test-Healthy {
    param($Settings)
    try {
        $message = & $script:Node $script:ConfigHelper health
        if ($LASTEXITCODE -eq 0) { return $true }
        $script:HealthFailure = $message -join ' '
        return $false
    } catch { $script:HealthFailure = $_.Exception.Message; return $false }
}

function Stop-Application {
    $process = Get-OwnedProcess
    if (-not $process) { Write-Host 'No hay una instancia iniciada por este instalador.'; return }
    # /T also terminates the API and Next.js children. Only a verified parent is targeted.
    Invoke-Checked 'taskkill.exe' @('/PID', [string]$process.ProcessId, '/T', '/F')
    Remove-Item -LiteralPath $script:StateFile -ErrorAction SilentlyContinue
    $settings = Get-Settings
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Test-PortBusy $settings.webPort) -or (Test-PortBusy $settings.apiPort)) {
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Los servicios siguen ocupando sus puertos. No se modificaran los datos.' }
        Start-Sleep -Milliseconds 500
    }
    Write-Host 'Bitacoras se detuvo.'
}

function Start-Application {
    param([switch]$QuietBrowser)
    $settings = Get-Settings
    if (-not (Test-Path -LiteralPath $settings.buildId)) { throw 'Falta la compilacion. Ejecuta Instalar.cmd.' }
    $process = Get-OwnedProcess
    if (-not $process) {
        Assert-FreePorts $settings
        $process = Start-Process -FilePath $script:Node -ArgumentList ('"' + $script:Runner + '" start') -WorkingDirectory $script:Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $script:StateDirectory 'application.log') -RedirectStandardError (Join-Path $script:StateDirectory 'error.log') -PassThru
        try {
            $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
            if (-not $details) { throw 'El proceso termino antes de iniciar.' }
            @{ id = $process.Id; createdTicks = $details.CreationDate.ToUniversalTime().Ticks.ToString() } |
                ConvertTo-Json | Set-Content -LiteralPath $script:StateFile -Encoding UTF8
        } catch {
            # The process handle comes from this launch, rather than a persisted PID.
            if (-not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
            throw
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while (-not (Test-Healthy $settings)) {
        if (-not (Get-OwnedProcess)) { throw 'No pudieron iniciar los servicios. Revisa .windows/error.log.' }
        if ([DateTime]::UtcNow -ge $deadline) {
            Stop-Application
            throw ('La aplicacion no respondio a tiempo: ' + $script:HealthFailure + ' Revisa .windows/application.log y .windows/error.log.')
        }
        Start-Sleep -Seconds 1
    }
    Write-Host "Bitacoras esta lista en $($settings.url). Puedes cerrar esta ventana."
    if (-not $QuietBrowser) { Start-Process $settings.url | Out-Null }
}

function New-Shortcut {
    param([string]$Folder, [switch]$Autostart)
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $Folder 'Bitacoras Institucionales.lnk'))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'bitacoras.ps1') + '" -Action Start'
    if ($Autostart) { $shortcut.Arguments += ' -NoBrowser' }
    $shortcut.WorkingDirectory = $script:Root
    $shortcut.Description = 'Iniciar Bitacoras Institucionales'
    $shortcut.Save()
}

function Install-Dependencies {
    # npm.cmd avoids execution-policy problems with npm.ps1; pnpm stays in the user's npm cache.
    $npm = Join-Path (Split-Path $script:Node -Parent) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { throw 'No se encontro npm.cmd junto a Node.js. Reinstala Node.js LTS.' }
    Invoke-Checked $npm @('exec', '--yes', '--package=pnpm@11.22.0', '--', 'pnpm', 'install', '--frozen-lockfile')
    Invoke-Checked $npm @('run', 'build')
    if (Get-Command git.exe -ErrorAction SilentlyContinue) {
        $revision = & git.exe rev-parse HEAD
        if ($LASTEXITCODE -eq 0) { $revision | Set-Content -LiteralPath (Join-Path $script:StateDirectory 'build-revision.txt') -Encoding ASCII }
    }
}

function Backup-Application {
    $settings = Get-Settings
    $wasRunning = [bool](Get-OwnedProcess)
    if ($wasRunning) { Stop-Application }
    try {
        Assert-FreePorts $settings
        $directory = Join-Path $script:StateDirectory ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6))
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        $defaultDatabase = Join-Path $script:Root 'backend\data\bitacoras.sqlite'
        if ($settings.database -eq $defaultDatabase) {
            $data = Join-Path $script:Root 'backend\data'
            if (Test-Path -LiteralPath $data) { Copy-Item -LiteralPath $data -Destination (Join-Path $directory 'data') -Recurse }
        } else {
            New-Item -ItemType Directory -Path (Join-Path $directory 'data') | Out-Null
            foreach ($suffix in @('', '-wal', '-shm', '-journal')) {
                $file = $settings.database + $suffix
                if (Test-Path -LiteralPath $file) { Copy-Item -LiteralPath $file -Destination (Join-Path $directory 'data') }
            }
        }
        if (Test-Path -LiteralPath (Join-Path $script:Root '.env')) { Copy-Item -LiteralPath (Join-Path $script:Root '.env') -Destination (Join-Path $directory '.env') }
        @{ database = $settings.database; created = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'backup.json') -Encoding UTF8
        Write-Host "Respaldo creado en $directory. Contiene configuracion privada; guardalo en un lugar protegido."
        return $directory
    } finally {
        if ($wasRunning) { Start-Application -QuietBrowser }
    }
}

function Update-Application {
    param([switch]$Automatic, [switch]$QuietBrowser)
    # All checks and downloads happen before interrupting an existing instance.
    try {
        if ($Automatic) {
            if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Falta Git. Ejecuta Actualizar.cmd una vez para instalarlo.' }
        } else { Install-Git }
        Ensure-UpdateRepository
        $output = & $script:Node $script:UpdateHelper plan
        if ($LASTEXITCODE -ne 0) { throw ($output -join ' ') }
        $plan = $output | ConvertFrom-Json
    } catch {
        if ($Automatic) {
            Write-Host ('Se abrira la version instalada: ' + $_.Exception.Message)
            return $false
        }
        throw
    }
    $revisionFile = Join-Path $script:StateDirectory 'build-revision.txt'
    $builtRevision = if (Test-Path -LiteralPath $revisionFile) { (Get-Content -LiteralPath $revisionFile -Raw).Trim() } else { '' }
    $settings = Get-Settings
    $needsBuild = ($builtRevision -ne $plan.current) -or (-not (Test-Path -LiteralPath $settings.buildId))
    if (-not $plan.changed -and -not $needsBuild) { Write-Host 'Ya tienes la ultima version de main y su compilacion.'; return $false }
    if ($plan.changed) { Write-Host "Hay una version nueva de main: $($plan.target.Substring(0, 7)). Preparando actualizacion..." }
    else { Write-Host 'El codigo esta actualizado; preparando su compilacion para mostrar la interfaz actual.' }
    $wasRunning = [bool](Get-OwnedProcess)
    if ($wasRunning) { Stop-Application }
    try {
        $backup = Backup-Application
        Write-Host "Antes de actualizar se respaldo la instalacion en $backup. Revision anterior: $($plan.current)"
        if ($plan.changed) { Invoke-Checked 'git.exe' @('merge', '--ff-only', 'refs/remotes/origin/main') }
        Install-Dependencies
        Start-Application -QuietBrowser:$QuietBrowser
        Write-Host "Actualizacion terminada: $($plan.target.Substring(0, 7))."
        return $true
    } catch {
        Write-Host 'La actualizacion no termino. Se conservaron .env, datos y respaldo. La aplicacion queda detenida; corrige el error y ejecuta Instalar.cmd.'
        throw
    }
}

if ($LibraryOnly) { return }
$mutex = $null
$locked = $false
try {
    if ($env:OS -ne 'Windows_NT') { throw 'Este instalador requiere Windows 11 y Windows PowerShell.' }
    if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'package.json'))) { throw 'Extrae el proyecto completo antes de ejecutar el instalador.' }
    Set-Location -LiteralPath $script:Root
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $identity = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($script:Root.ToLowerInvariant())))).Replace('-', '').Substring(0, 24) }
    finally { $hash.Dispose() }
    $mutex = New-Object Threading.Mutex($false, ('Local\Bitacoras-' + $identity))
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Ya hay otra operacion de Bitacoras en curso. Espera a que termine.' }
    if (-not (Test-Path -LiteralPath $script:StateDirectory)) {
        New-Item -ItemType Directory -Path $script:StateDirectory | Out-Null
        Protect-Path $script:StateDirectory -Directory
    }
    if ($Action -eq 'Install') { Install-Node } else { Require-Node }
    switch ($Action) {
        'Install' {
            New-Configuration
            try { Install-Git; Ensure-UpdateRepository }
            catch { Write-Host ('La instalacion continuara; las actualizaciones requieren resolver esto: ' + $_.Exception.Message) }
            $settings = Get-Settings
            if (Get-OwnedProcess) { Stop-Application }
            Assert-FreePorts $settings
            $null = Backup-Application
            Install-Dependencies
            New-Shortcut ([Environment]::GetFolderPath('Desktop'))
            $answer = if ($Unattended) { 'n' } else { Read-Host 'Iniciar automaticamente al entrar a Windows? (s/N)' }
            if ($answer -match '^(s|si)$') { New-Shortcut ([Environment]::GetFolderPath('Startup')) -Autostart }
            Start-Application -QuietBrowser:$NoBrowser
            Write-Host 'Instalacion terminada. Usa el acceso directo o Bitacoras.cmd.'
        }
        'Start' {
            if (-not (Test-Path -LiteralPath (Join-Path $script:StateDirectory 'auto-update.disabled'))) {
                Write-Host 'Buscando actualizaciones de main...'
                $null = Update-Application -Automatic -QuietBrowser
            }
            Start-Application -QuietBrowser:$NoBrowser
        }
        'Stop' { Stop-Application }
        'Status' {
            $settings = Get-Settings
            if ((Get-OwnedProcess) -and (Test-Healthy $settings)) { Write-Host "En ejecucion: $($settings.url)" }
            else { Write-Host 'Detenida o sin respuesta. Revisa los registros en .windows/.' }
        }
        'Backup' { $null = Backup-Application }
        'Update' {
            $updated = Update-Application -QuietBrowser:$NoBrowser
            if (-not $updated) { Start-Application -QuietBrowser:$NoBrowser }
        }
        'EnableAutoUpdate' {
            $file = Join-Path $script:StateDirectory 'auto-update.disabled'
            if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
            Write-Host 'Actualizacion al abrir activada.'
        }
        'DisableAutoUpdate' {
            New-Item -ItemType File -Path (Join-Path $script:StateDirectory 'auto-update.disabled') -Force | Out-Null
            Write-Host 'Actualizacion al abrir desactivada. Puedes usar Actualizar.cmd.'
        }
        'EnableAutostart' { New-Shortcut ([Environment]::GetFolderPath('Startup')) -Autostart; Write-Host 'Inicio automatico activado para este usuario.' }
        'DisableAutostart' {
            $shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Bitacoras Institucionales.lnk'
            if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut }
            Write-Host 'Inicio automatico desactivado.'
        }
    }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
