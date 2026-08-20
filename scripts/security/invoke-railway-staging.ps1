#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RailwayArgs,
  [string]$VaultPath = (Join-Path $env:APPDATA "NexTeam-Studio\secrets\railway-staging.dpapi")
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "SafeOutput.ps1")

function Convert-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)][securestring]$SecureString)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Get-RailwayTokenFromVault {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Railway token vault not found. Run .\scripts\security\capture-railway-staging-token.ps1 first."
  }

  $encrypted = Get-Content -LiteralPath $Path -Raw
  $secure = ConvertTo-SecureString -String $encrypted
  Convert-SecureStringToPlainText -SecureString $secure
}

function Assert-SafeRailwayOperation {
  param([Parameter(Mandatory = $true)][string[]]$Args)

  $command = (($Args -join " ").ToLowerInvariant() -replace "[,;\s]+", " ").Trim()
  $allowed = $command -eq "status" -or $command -eq "whoami" -or
    $command -match "^deployment list(?: --service nexteam-studio)?(?: --environment staging)?(?: --limit [0-9]+)?(?: --json)?$" -or
    $command -eq "up --service nexteam-studio --environment staging --detach"
  if (-not $allowed) {
    throw "Railway operation is denied by the secret-safe staging allowlist. Use approved status, deployment listing, or the explicit staging upload action; raw variables, shells, runtime commands, logs, and environment inspection are never allowed."
  }

  $repositoryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $tsxLoader = Join-Path $repositoryRoot "node_modules\tsx\dist\loader.mjs"
  if (-not (Test-Path -LiteralPath $tsxLoader)) {
    throw "Secret operation policy loader is unavailable; Railway execution is denied."
  }
  $tsxLoaderUri = ([Uri]$tsxLoader).AbsoluteUri
  $policyOutput = & node --import $tsxLoaderUri (Join-Path $PSScriptRoot "evaluate-secret-operation.mjs") -- @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Secret operation policy could not be evaluated; Railway execution is denied."
  }
  $policy = $policyOutput | ConvertFrom-Json
  if (-not $policy.allowed) {
    throw "Railway operation is denied by the controller secret-output policy: $($policy.reason)"
  }
}

if (-not $RailwayArgs -or $RailwayArgs.Count -eq 0) {
  Write-Host "Usage:"
  Write-Host ".\scripts\security\invoke-railway-staging.ps1 status"
  Write-Host ".\scripts\security\invoke-railway-staging.ps1 up --service NexTeam-Studio --environment staging --detach"
  exit 64
}

$normalizedRailwayArgs = @($RailwayArgs | ForEach-Object { $_ -split "," } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
Assert-SafeRailwayOperation -Args $normalizedRailwayArgs

$repositoryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$normalizedCommand = (($normalizedRailwayArgs -join " ").ToLowerInvariant() -replace "[,;\s]+", " ").Trim()
$buildStampPath = Join-Path $repositoryRoot "nexteam-build-sha.txt"
$hadBuildStamp = Test-Path -LiteralPath $buildStampPath
$previousBuildStamp = if ($hadBuildStamp) { Get-Content -LiteralPath $buildStampPath -Raw } else { $null }
$railway = $null
$token = $null
$hadRailwayToken = Test-Path Env:RAILWAY_TOKEN
$oldRailwayToken = $env:RAILWAY_TOKEN
$hadRailwayApiToken = Test-Path Env:RAILWAY_API_TOKEN
$oldRailwayApiToken = $env:RAILWAY_API_TOKEN
$exitCode = 0

try {
  if ($normalizedCommand -eq "up --service nexteam-studio --environment staging --detach") {
    $buildSha = (& git -C $repositoryRoot rev-parse HEAD).Trim()
    if (-not $buildSha) {
      throw "Unable to create the non-secret staging build identity stamp; Railway upload is denied."
    }
    Set-Content -LiteralPath $buildStampPath -Value $buildSha -NoNewline
  }

  $railway = Get-Command railway -ErrorAction Stop
  $token = Get-RailwayTokenFromVault -Path $VaultPath
  $env:RAILWAY_TOKEN = $token
  Remove-Item Env:RAILWAY_API_TOKEN -ErrorAction SilentlyContinue

  $output = & $railway.Source @normalizedRailwayArgs 2>&1
  if ($null -ne $LASTEXITCODE) {
    $exitCode = $LASTEXITCODE
  }

  foreach ($item in $output) {
    Write-SafeOutput -InputObject $item -KnownSecrets @($token)
  }
} catch {
  $knownSecrets = if ($token) { @($token) } else { @() }
  $message = Redact-SecretOutput -Text $_.Exception.Message -KnownSecrets $knownSecrets
  Write-Error $message
  $exitCode = 1
} finally {
  if ($normalizedCommand -eq "up --service nexteam-studio --environment staging --detach") {
    if ($hadBuildStamp) {
      Set-Content -LiteralPath $buildStampPath -Value $previousBuildStamp -NoNewline
    } else {
      Remove-Item -LiteralPath $buildStampPath -ErrorAction SilentlyContinue
    }
  }

  if ($hadRailwayToken) {
    $env:RAILWAY_TOKEN = $oldRailwayToken
  } else {
    Remove-Item Env:RAILWAY_TOKEN -ErrorAction SilentlyContinue
  }

  if ($hadRailwayApiToken) {
    $env:RAILWAY_API_TOKEN = $oldRailwayApiToken
  } else {
    Remove-Item Env:RAILWAY_API_TOKEN -ErrorAction SilentlyContinue
  }

  $token = $null
}

exit $exitCode
