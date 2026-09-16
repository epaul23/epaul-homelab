$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $root 'server.ps1'
$log = Join-Path $root 'dashboard.log'

while ($true) {
    try {
        if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) {
            Clear-Content $log
        }

        Add-Content $log "$(Get-Date -Format o) Starting G-RAID dashboard"
        & $server *>> $log
    }
    catch {
        Add-Content $log "$(Get-Date -Format o) ERROR: $($_.Exception.Message)"
    }

    Add-Content $log "$(Get-Date -Format o) Dashboard stopped; restarting in 15 seconds"
    Start-Sleep -Seconds 15
}
