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

if (-not $RailwayArgs -or $RailwayArgs.Count -eq 0) {
  Write-Host "Usage:"
  Write-Host ".\scripts\security\invoke-railway-staging.ps1 status"
  Write-Host ".\scripts\security\invoke-railway-staging.ps1 up --service NexTeam-Studio --environment staging --detach"
  exit 64
}

$railway = Get-Command railway -ErrorAction Stop
$token = Get-RailwayTokenFromVault -Path $VaultPath

$hadRailwayToken = Test-Path Env:RAILWAY_TOKEN
$oldRailwayToken = $env:RAILWAY_TOKEN
$hadRailwayApiToken = Test-Path Env:RAILWAY_API_TOKEN
$oldRailwayApiToken = $env:RAILWAY_API_TOKEN
$exitCode = 0

try {
  $env:RAILWAY_TOKEN = $token
  Remove-Item Env:RAILWAY_API_TOKEN -ErrorAction SilentlyContinue

  $output = & $railway.Source @RailwayArgs 2>&1
  if ($null -ne $LASTEXITCODE) {
    $exitCode = $LASTEXITCODE
  }

  foreach ($item in $output) {
    Write-SafeOutput -InputObject $item -KnownSecrets @($token)
  }
} catch {
  $message = Redact-SecretOutput -Text $_.Exception.Message -KnownSecrets @($token)
  Write-Error $message
  $exitCode = 1
} finally {
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
