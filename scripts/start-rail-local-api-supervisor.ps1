$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$restartDelaySeconds = 5
$envPath = Join-Path $repoRoot ".env"

Set-Location $repoRoot

if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()

    if ($key -eq "RAIL_LOCAL_API_TOKEN") {
      $env:RAIL_LOCAL_API_TOKEN = $value
      break
    }
  }
}

while ($true) {
  & $npmCmd "run" "rail:local-api"
  Start-Sleep -Seconds $restartDelaySeconds
}
