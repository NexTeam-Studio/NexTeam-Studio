#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RailwayArgs,
  [string]$VaultPath = (Join-Path $env:APPDATA "NexTeam-Studio\secrets\railway-staging.dpapi")
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

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

function Redact-SecretOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Secret
  )

  $redacted = $Text.Replace($Secret, "[REDACTED_RAILWAY_TOKEN]")
  $redacted = $redacted -replace '(?i)(Project-Access-Token\s*[:=]\s*)\S+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)(Authorization\s*:\s*Bearer\s+)\S+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)((?:RAILWAY_TOKEN|RAILWAY_API_TOKEN)\s*[:=]\s*)\S+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)(sk-ant-api03-[A-Za-z0-9_\-]+)', '[REDACTED_ANTHROPIC_KEY]'
  $redacted = $redacted -replace '(?i)(sk_(?:live|test|[A-Za-z0-9])[A-Za-z0-9_\-]+)', '[REDACTED_SECRET_KEY]'
  $redacted = $redacted -replace '(?i)(whsec_[A-Za-z0-9_\-]+)', '[REDACTED_WEBHOOK_SECRET]'
  $redacted = $redacted -replace '(?i)((?:API_KEY|APP_PASSWORD|CLIENT_SECRET|PASSWORD|REFRESH_TOKEN|SECRET|TOKEN)[A-Z0-9_]*\s*(?:│|\|)\s*)[^│|\r\n]+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)([A-Z0-9_]*(?:ANTHROPIC|ELEVENLABS|OPENWEATHER|STRIPE|GOOGLE_MAPS)[A-Z0-9_]*\s*(?:│|\|)\s*)[^│|\r\n]+', '$1[REDACTED]'
  $redacted
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
    $text = ($item | Out-String).TrimEnd()
    if ($text.Length -gt 0) {
      Write-Output (Redact-SecretOutput -Text $text -Secret $token)
    }
  }
} catch {
  $message = Redact-SecretOutput -Text $_.Exception.Message -Secret $token
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
