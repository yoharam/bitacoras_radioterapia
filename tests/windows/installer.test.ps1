param([string]$NodePath = 'node')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$installer = Join-Path $repository 'scripts\windows\bitacoras.ps1'
$tokens = $null
$parseErrors = $null
$null = [Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
. $installer -LibraryOnly

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
function Assert-Throws {
    param([scriptblock]$Operation, [string]$Message)
    $threw = $false
    try { & $Operation | Out-Null } catch { $threw = $true }
    Assert-True $threw $Message
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) ('bitacoras windows tests ' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $script:Root = $temporary
    $script:StateDirectory = Join-Path $temporary '.windows'
    $script:StateFile = Join-Path $script:StateDirectory 'process.json'
    $script:Runner = Join-Path $temporary 'scripts\run.mjs'
    $script:Node = $NodePath
    New-Item -ItemType Directory -Path $script:StateDirectory | Out-Null

    # No configuration overwrite and no administrator prompt on a repeat installation.
    $environmentFile = Join-Path $temporary '.env'
    [IO.File]::WriteAllText($environmentFile, 'existing private configuration')
    function Read-Host { throw 'Unexpected prompt' }
    New-Configuration
    Assert-True ([IO.File]::ReadAllText($environmentFile) -ceq 'existing private configuration') 'Existing .env was modified.'

    # A nonzero native exit must abort rather than continue into build/start.
    Assert-Throws { Invoke-Checked $NodePath @('-e', 'process.exit(7)') } 'Native failure was ignored.'

    # Never terminate a recycled PID, even when its executable is Node.
    $created = [DateTime]::UtcNow
    @{ id = 1234; createdTicks = $created.Ticks.ToString() } | ConvertTo-Json | Set-Content -LiteralPath $script:StateFile
    $script:fakeProcess = [pscustomobject]@{ ProcessId = 1234; CreationDate = $created; ExecutablePath = $NodePath; CommandLine = 'unrelated project' }
    function Get-CimInstance { param($ClassName, $Filter); return $script:fakeProcess }
    Assert-Throws { Get-OwnedProcess } 'An unrelated process was accepted.'
    $script:fakeProcess.CommandLine = 'node "' + $script:Runner + '" start'
    Assert-True ((Get-OwnedProcess).ProcessId -eq 1234) 'The owned process was not recognized.'
    $script:fakeProcess.CreationDate = $created.AddMinutes(1)
    Assert-Throws { Get-OwnedProcess } 'A reused PID was accepted.'
    $script:fakeProcess = $null
    Assert-True ($null -eq (Get-OwnedProcess)) 'Stale state should be treated as stopped.'
    Remove-Item -LiteralPath $script:StateFile

    # Both ports are checked; the failure does not stop another application.
    function Test-PortBusy { param($Port); return ($Port -eq 4200) }
    $script:testSettings = [pscustomobject]@{ webPort = 3200; apiPort = 4200; database = (Join-Path $temporary 'backend\data\bitacoras.sqlite'); url = 'http://localhost:3200' }
    Assert-Throws { Assert-FreePorts $script:testSettings } 'Occupied API port was ignored.'
    function Test-PortBusy { param($Port); return $false }

    # Backups preserve database sidecars and configuration. A running instance is stopped and restarted.
    function Get-Settings { return $script:testSettings }
    $script:running = $true
    $script:events = New-Object 'Collections.Generic.List[string]'
    function Get-OwnedProcess { if ($script:running) { return [pscustomobject]@{ ProcessId = 1234 } }; return $null }
    function Stop-Application { $script:events.Add('stop'); $script:running = $false }
    function Start-Application { param([switch]$QuietBrowser); $script:events.Add('start'); $script:running = $true }
    $data = Join-Path $temporary 'backend\data'
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    foreach ($name in @('bitacoras.sqlite', 'bitacoras.sqlite-wal', 'bitacoras.sqlite-shm')) { [IO.File]::WriteAllText((Join-Path $data $name), $name) }
    $backup = Backup-Application
    foreach ($name in @('bitacoras.sqlite', 'bitacoras.sqlite-wal', 'bitacoras.sqlite-shm')) {
        Assert-True ([IO.File]::ReadAllText((Join-Path $backup "data/$name")) -eq $name) 'Database backup is incomplete.'
    }
    Assert-True ([IO.File]::ReadAllText((Join-Path $backup '.env')) -eq 'existing private configuration') 'Configuration backup is missing.'
    Assert-True (($script:events -join ',') -eq 'stop,start') 'Backup did not stop and restart the installation.'

    # An external DB_PATH backs up only that database and its auxiliaries.
    $external = Join-Path $temporary 'external'
    New-Item -ItemType Directory -Path $external | Out-Null
    $script:testSettings.database = Join-Path $external 'hospital.sqlite'
    [IO.File]::WriteAllText($script:testSettings.database, 'custom database')
    [IO.File]::WriteAllText(($script:testSettings.database + '-wal'), 'custom wal')
    [IO.File]::WriteAllText((Join-Path $external 'unrelated.sqlite'), 'unrelated')
    $backup = Backup-Application
    Assert-True (Test-Path -LiteralPath (Join-Path $backup 'data/hospital.sqlite')) 'Custom database was not backed up.'
    Assert-True (Test-Path -LiteralPath (Join-Path $backup 'data/hospital.sqlite-wal')) 'Custom WAL was not backed up.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $backup 'data/unrelated.sqlite'))) 'Backup copied an unrelated database.'

    # A ZIP installation has no Git metadata and cannot run a destructive update.
    Assert-Throws { Update-Application } 'ZIP update was incorrectly allowed.'
    Write-Host 'OK: syntax, configuration preservation, command failures, process ownership, occupied ports, backups and ZIP update guard.'
} finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
# One assertion deliberately runs a failing native command. Do not let its exit
# code survive a successful suite into GitHub's Windows PowerShell wrapper.
$global:LASTEXITCODE = 0
