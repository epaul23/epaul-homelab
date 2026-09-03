$ErrorActionPreference = 'Stop'

$Port = 8787
$DiskFriendlyName = 'SanDisk G-RAID MIRROR'
$DriveLabel = 'GRAID_MAIN'
$PublicDirectory = Join-Path $PSScriptRoot 'public'
$DataDirectory = Join-Path $PSScriptRoot 'data'
$HistoryFile = Join-Path $DataDirectory 'temperature-history.csv'
$FolderCacheFile = Join-Path $DataDirectory 'folder-sizes.json'
$FolderScanLock = Join-Path $DataDirectory 'folder-scan.lock'
$FolderScanner = Join-Path $PSScriptRoot 'scan-folders.ps1'
$SampleIntervalMinutes = 5
$RetentionDays = 7
$FolderScanIntervalHours = 6

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

function Get-GRaidStorage {
    try {
        $volume = Get-Volume |
            Where-Object FileSystemLabel -eq $DriveLabel |
            Select-Object -First 1

        if (-not $volume) {
            throw "Volume '$DriveLabel' was not found."
        }

        $totalBytes = [uint64]$volume.Size
        $freeBytes = [uint64]$volume.SizeRemaining
        $usedBytes = $totalBytes - $freeBytes
        $usedPercent = if ($totalBytes -gt 0) {
            [math]::Round(($usedBytes / $totalBytes) * 100, 1)
        } else {
            0
        }

        $spaceLevel = if ($usedPercent -ge 95) {
            'danger'
        } elseif ($usedPercent -ge 85) {
            'warm'
        } else {
            'normal'
        }

        $folders = @()
        $folderSizesUpdatedAt = $null
        if (Test-Path -LiteralPath $FolderCacheFile -PathType Leaf) {
            try {
                $folderCache = Get-Content -LiteralPath $FolderCacheFile -Raw | ConvertFrom-Json
                $folders = @($folderCache.folders)
                $folderSizesUpdatedAt = $folderCache.generatedAt
            } catch {}
        }

        [ordered]@{
            online       = $true
            name         = 'G-RAID MAIN'
            label        = $DriveLabel
            driveLetter  = if ($volume.DriveLetter) { "$($volume.DriveLetter):" } else { $null }
            fileSystem   = [string]$volume.FileSystem
            health       = [string]$volume.HealthStatus
            totalBytes   = $totalBytes
            usedBytes    = $usedBytes
            freeBytes    = $freeBytes
            usedPercent  = $usedPercent
            spaceLevel   = $spaceLevel
            folders      = $folders
            folderSizesUpdatedAt = $folderSizesUpdatedAt
            checkedAt    = (Get-Date).ToString('o')
        }
    } catch {
        [ordered]@{
            online       = $false
            name         = 'G-RAID MAIN'
            label        = $DriveLabel
            health       = 'Unavailable'
            totalBytes   = $null
            usedBytes    = $null
            freeBytes    = $null
            usedPercent  = $null
            spaceLevel   = 'unknown'
            checkedAt    = (Get-Date).ToString('o')
            error        = $_.Exception.Message
        }
    }
}

function Start-FolderSizeScanIfNeeded {
    if (-not (Test-Path -LiteralPath $FolderScanner -PathType Leaf)) {
        return
    }

    if (Test-Path -LiteralPath $FolderScanLock -PathType Leaf) {
        $lockAge = (Get-Date) - (Get-Item -LiteralPath $FolderScanLock).LastWriteTime
        if ($lockAge.TotalHours -lt 2) {
            return
        }
        Remove-Item -LiteralPath $FolderScanLock -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $FolderCacheFile -PathType Leaf) {
        $cacheAge = (Get-Date) - (Get-Item -LiteralPath $FolderCacheFile).LastWriteTime
        if ($cacheAge.TotalHours -lt $FolderScanIntervalHours) {
            return
        }
    }

    Set-Content -LiteralPath $FolderScanLock -Value (Get-Date).ToString('o') -Encoding ASCII
    $arguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$FolderScanner`"",
        '-DriveLabel', "`"$DriveLabel`"",
        '-OutputFile', "`"$FolderCacheFile`"",
        '-LockFile', "`"$FolderScanLock`""
    )
    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}

function Save-TemperatureSample {
    $status = Get-GRaidStatus
    if (-not $status.online -or $null -eq $status.temperature) {
        Write-Warning "Temperature sample skipped: $($status.error)"
        return
    }

    if (-not (Test-Path -LiteralPath $HistoryFile -PathType Leaf)) {
        [IO.File]::WriteAllText(
            $HistoryFile,
            "timestamp,temperature`r`n",
            [Text.UTF8Encoding]::new($false)
        )
    }

    $line = '"{0}",{1}' -f $status.checkedAt, $status.temperature
    [IO.File]::AppendAllText(
        $HistoryFile,
        "$line`r`n",
        [Text.UTF8Encoding]::new($false)
    )

    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $retained = @(
        Import-Csv -LiteralPath $HistoryFile | Where-Object {
            try { [datetime]$_.timestamp -ge $cutoff } catch { $false }
        }
    )

    if ($retained.Count -gt 0) {
        $retained | Export-Csv -LiteralPath $HistoryFile -NoTypeInformation -Encoding UTF8
    }
}

function Get-TemperatureHistory {
    $cutoff = (Get-Date).AddHours(-24)
    $samples = @()

    if (Test-Path -LiteralPath $HistoryFile -PathType Leaf) {
        $samples = @(
            Import-Csv -LiteralPath $HistoryFile | ForEach-Object {
                try {
                    $timestamp = [datetime]$_.timestamp
                    $temperature = [int]$_.temperature
                    if ($timestamp -ge $cutoff) {
                        [ordered]@{
                            timestamp = $timestamp.ToString('o')
                            temperature = $temperature
                        }
                    }
                } catch {}
            }
        )
    }

    $temperatures = @($samples | ForEach-Object { $_.temperature })
    $minimum = $null
    $average = $null
    $maximum = $null

    if ($temperatures.Count -gt 0) {
        $measurement = $temperatures | Measure-Object -Minimum -Average -Maximum
        $minimum = [int]$measurement.Minimum
        $average = [math]::Round([double]$measurement.Average, 1)
        $maximum = [int]$measurement.Maximum
    }

    [ordered]@{
        rangeHours = 24
        sampleIntervalMinutes = $SampleIntervalMinutes
        minimum = $minimum
        average = $average
        maximum = $maximum
        generatedAt = (Get-Date).ToString('o')
        samples = $samples
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

if (-not (Test-Path -LiteralPath $DataDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $DataDirectory | Out-Null
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://+:$Port/")

try {
    $listener.Start()
    Write-Host "G-RAID dashboard is running at http://localhost:$Port" -ForegroundColor Green
    Write-Host "Temperature history is sampled every $SampleIntervalMinutes minutes."
    Write-Host 'Press Ctrl+C to stop it.'

    $nextSampleAt = Get-Date
    $nextFolderScanCheckAt = Get-Date
    $pendingContext = $null

    while ($listener.IsListening) {
        if ((Get-Date) -ge $nextSampleAt) {
            try {
                Save-TemperatureSample
            } catch {
                Write-Warning "Could not save temperature history: $($_.Exception.Message)"
            }
            $nextSampleAt = (Get-Date).AddMinutes($SampleIntervalMinutes)
        }

        if ((Get-Date) -ge $nextFolderScanCheckAt) {
            try {
                Start-FolderSizeScanIfNeeded
            } catch {
                Write-Warning "Could not start folder-size scan: $($_.Exception.Message)"
            }
            $nextFolderScanCheckAt = (Get-Date).AddMinutes(10)
        }

        if ($null -eq $pendingContext) {
            $pendingContext = $listener.GetContextAsync()
        }

        if (-not $pendingContext.Wait(1000)) {
            continue
        }

        $context = $pendingContext.GetAwaiter().GetResult()
        $pendingContext = $null
        try {
            $context.Response.Headers.Add('Cache-Control', 'no-store')

            switch ($context.Request.Url.AbsolutePath) {
                '/api/status' {
                    $json = Get-GRaidStatus | ConvertTo-Json -Depth 4
                    Send-Text -Response $context.Response -Text $json -ContentType 'application/json; charset=utf-8'
                }
                '/api/history' {
                    $history = Get-TemperatureHistory
                    $json = $history | ConvertTo-Json -Depth 6
                    Send-Text -Response $context.Response -Text $json -ContentType 'application/json; charset=utf-8'
                }
                '/api/storage' {
                    $storage = Get-GRaidStorage
                    $json = $storage | ConvertTo-Json -Depth 4
                    Send-Text -Response $context.Response -Text $json -ContentType 'application/json; charset=utf-8'
                }
                '/style.css' {
                    Send-PublicFile -Response $context.Response -FileName 'style.css' -ContentType 'text/css; charset=utf-8'
                }
                '/dashboard.js' {
                    Send-PublicFile -Response $context.Response -FileName 'dashboard.js' -ContentType 'application/javascript; charset=utf-8'
                }
                '/history.js' {
                    Send-PublicFile -Response $context.Response -FileName 'history.js' -ContentType 'application/javascript; charset=utf-8'
                }
                '/history.html' {
                    Send-PublicFile -Response $context.Response -FileName 'history.html' -ContentType 'text/html; charset=utf-8'
                }
                '/storage.js' {
                    Send-PublicFile -Response $context.Response -FileName 'storage.js' -ContentType 'application/javascript; charset=utf-8'
                }
                '/storage.html' {
                    Send-PublicFile -Response $context.Response -FileName 'storage.html' -ContentType 'text/html; charset=utf-8'
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
