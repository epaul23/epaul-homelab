param(
    [Parameter(Mandatory)][string]$DriveLabel,
    [Parameter(Mandatory)][string]$OutputFile,
    [Parameter(Mandatory)][string]$LockFile
)

$ErrorActionPreference = 'Stop'
$ignoredFolders = @('$RECYCLE.BIN', 'System Volume Information')

try {
    $volume = Get-Volume |
        Where-Object FileSystemLabel -eq $DriveLabel |
        Select-Object -First 1

    if (-not $volume -or -not $volume.DriveLetter) {
        throw "Volume '$DriveLabel' was not found or has no drive letter."
    }

    $root = "$($volume.DriveLetter):\"
    $folders = @(
        Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object Name -notin $ignoredFolders |
            ForEach-Object {
                $measurement = Get-ChildItem -LiteralPath $_.FullName -File -Recurse -Force -ErrorAction SilentlyContinue |
                    Measure-Object -Property Length -Sum

                [ordered]@{
                    name = $_.Name
                    bytes = if ($null -eq $measurement.Sum) { [uint64]0 } else { [uint64]$measurement.Sum }
                }
            } |
            Sort-Object bytes -Descending
    )

    $result = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        folders = $folders
    }

    $temporaryFile = "$OutputFile.tmp"
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $temporaryFile -Encoding UTF8
    Move-Item -LiteralPath $temporaryFile -Destination $OutputFile -Force
} finally {
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
}
