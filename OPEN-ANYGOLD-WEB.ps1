$ErrorActionPreference = 'Stop'
$webUrl = 'http://localhost:3000'
$serviceUrl = 'http://127.0.0.1:4210/status'
$powershell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'

function Test-LocalUrl {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

if (-not (Test-LocalUrl $serviceUrl)) {
    $serviceScript = Join-Path $PSScriptRoot 'ZEBRA-WEB-PRINT-SERVICE.ps1'
    Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $serviceScript + '"')
    )
}

if (-not (Test-LocalUrl $webUrl)) {
    $serverScript = Join-Path $PSScriptRoot 'RUN-WEB-SERVER.ps1'
    Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $serverScript + '"')
    )
}

$ready = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if (Test-LocalUrl $webUrl) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        'ANYGOLD Label Studio could not start. Please try the shortcut again.',
        'ANYGOLD Label Studio',
        'OK',
        'Error'
    ) | Out-Null
    exit 1
}

Start-Process $webUrl
