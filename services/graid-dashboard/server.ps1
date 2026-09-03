$ErrorActionPreference = 'Stop'

$Port = 8787
$DiskFriendlyName = 'SanDisk G-RAID MIRROR'
$DriveLabel = 'GRAID_MAIN'
$PublicDirectory = Join-Path $PSScriptRoot 'public'

function Get-GRaidStatus {
    try {
        $disk = Get-PhysicalDisk |
            Where-Object FriendlyName -eq $DiskFriendlyName |
            Select-Object -First 1

        if (-not $disk) {
            throw "Disk '$DiskFriendlyName' was not found."
        }

        $reliability = Get-StorageReliabilityCounter -PhysicalDisk $disk
        $temperature = if ($null -ne $reliability.Temperature) {
            [int]$reliability.Temperature
        } else {
            $null
        }
        $powerOnHours = if ($null -ne $reliability.PowerOnHours) {
            [long]$reliability.PowerOnHours
        } else {
            $null
        }

        if ($null -eq $temperature) {
            $temperatureState = 'Unavailable'
            $temperatureLevel = 'unknown'
        } elseif ($temperature -ge 60) {
            $temperatureState = 'Check Fan'
            $temperatureLevel = 'danger'
        } elseif ($temperature -ge 50) {
            $temperatureState = 'Warm'
            $temperatureLevel = 'warm'
        } else {
            $temperatureState = 'Normal'
            $temperatureLevel = 'normal'
        }

        [ordered]@{
            online            = $true
            name              = 'G-RAID MAIN'
            label             = $DriveLabel
            model             = $disk.FriendlyName
            raid              = 'RAID 1'
            health            = [string]$disk.HealthStatus
            operationalStatus = (($disk.OperationalStatus | ForEach-Object { [string]$_ }) -join ', ')
            temperature       = $temperature
            temperatureState  = $temperatureState
            temperatureLevel  = $temperatureLevel
            powerOnHours      = $powerOnHours
            checkedAt         = (Get-Date).ToString('o')
        }
    } catch {
        [ordered]@{
            online            = $false
            name              = 'G-RAID MAIN'
            label             = $DriveLabel
            model             = $DiskFriendlyName
            raid              = 'RAID 1'
            health            = 'Unavailable'
            operationalStatus = 'Unavailable'
            temperature       = $null
            temperatureState  = 'Unavailable'
            temperatureLevel  = 'unknown'
            powerOnHours      = $null
            checkedAt         = (Get-Date).ToString('o')
            error             = $_.Exception.Message
        }
    }
}

function Send-Bytes {
    param(
        [Parameter(Mandatory)]$Response,
        [Parameter(Mandatory)][byte[]]$Bytes,
        [Parameter(Mandatory)][string]$ContentType,
        [int]$StatusCode = 200
    )

    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

function Send-Text {
    param(
        [Parameter(Mandatory)]$Response,
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$ContentType,
        [int]$StatusCode = 200
    )

    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    Send-Bytes -Response $Response -Bytes $bytes -ContentType $ContentType -StatusCode $StatusCode
}

function Send-PublicFile {
    param(
        [Parameter(Mandatory)]$Response,
        [Parameter(Mandatory)][string]$FileName,
        [Parameter(Mandatory)][string]$ContentType
    )

    $path = Join-Path $PublicDirectory $FileName
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Send-Text -Response $Response -Text 'File not found.' -ContentType 'text/plain; charset=utf-8' -StatusCode 404
        return
    }

    $bytes = [IO.File]::ReadAllBytes($path)
    Send-Bytes -Response $Response -Bytes $bytes -ContentType $ContentType
}

if (-not (Test-Path -LiteralPath $PublicDirectory -PathType Container)) {
    throw "Missing public directory: $PublicDirectory"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://+:$Port/")

try {
    $listener.Start()
    Write-Host "G-RAID dashboard is running at http://localhost:$Port" -ForegroundColor Green
    Write-Host 'Press Ctrl+C to stop it.'

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $context.Response.Headers.Add('Cache-Control', 'no-store')

            switch ($context.Request.Url.AbsolutePath) {
                '/api/status' {
                    $json = Get-GRaidStatus | ConvertTo-Json -Depth 4
                    Send-Text -Response $context.Response -Text $json -ContentType 'application/json; charset=utf-8'
                }
                '/style.css' {
                    Send-PublicFile -Response $context.Response -FileName 'style.css' -ContentType 'text/css; charset=utf-8'
                }
                '/dashboard.js' {
                    Send-PublicFile -Response $context.Response -FileName 'dashboard.js' -ContentType 'application/javascript; charset=utf-8'
                }
                '/favicon.ico' {
                    Send-Text -Response $context.Response -Text '' -ContentType 'image/x-icon' -StatusCode 204
                }
                default {
                    Send-PublicFile -Response $context.Response -FileName 'index.html' -ContentType 'text/html; charset=utf-8'
                }
            }
        } catch {
            if ($context.Response.OutputStream.CanWrite) {
                Send-Text -Response $context.Response -Text 'Dashboard server error.' -ContentType 'text/plain; charset=utf-8' -StatusCode 500
            }
        } finally {
            $context.Response.OutputStream.Close()
        }
    }
} finally {
    try {
        if ($listener.IsListening) {
            $listener.Stop()
        }
    } catch {}

    try {
        $listener.Close()
    } catch {}
}
