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
  $shadowModeConfigure = $command -match "^shadow-mode configure --email [^\s]+$"
  $allowed = $command -eq "status" -or $command -eq "whoami" -or
    $command -match "^deployment list(?: --service nexteam-studio)?(?: --environment staging)?(?: --limit [0-9]+)?(?: --json)?$" -or
    $command -eq "up --service nexteam-studio --environment staging --detach" -or
    $shadowModeConfigure
  if (-not $allowed) {
    throw "Railway operation is denied by the secret-safe staging allowlist. Use approved status, deployment listing, the explicit staging upload action, or the scoped Shadow Mode configuration action; raw variables, shells, runtime commands, logs, and environment inspection are never allowed."
  }

  $repositoryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $tsxLoader = Join-Path $repositoryRoot "node_modules\tsx\dist\loader.mjs"
  if (-not (Test-Path -LiteralPath $tsxLoader)) {
    throw "Secret operation policy loader is unavailable; Railway execution is denied."
  }
  $tsxLoaderUri = ([Uri]$tsxLoader).AbsoluteUri
  # A fresh PowerShell process has no LASTEXITCODE value under StrictMode.
  # Seed the automatic variable before invoking the policy subprocess so a
  # loader failure is handled as a normal fail-closed policy error.
  $global:LASTEXITCODE = 0
  $policyOutput = & node --import $tsxLoaderUri (Join-Path $PSScriptRoot "evaluate-secret-operation.mjs") -- @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Secret operation policy could not be evaluated; Railway execution is denied."
  }
  $policy = $policyOutput | ConvertFrom-Json
  if ($null -eq $policy -or $null -eq $policy.PSObject.Properties["allowed"]) {
    throw "Secret operation policy did not return a valid decision; Railway execution is denied."
  }
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
$shadowModeConfigure = $normalizedCommand -match "^shadow-mode configure --email [^\s]+$"
$shadowModeEmail = if ($shadowModeConfigure) { $normalizedRailwayArgs[3] } else { $null }
if ($shadowModeConfigure) {
  if ($normalizedRailwayArgs.Count -ne 4 -or $normalizedRailwayArgs[0] -ne "shadow-mode" -or $normalizedRailwayArgs[1] -ne "configure" -or $normalizedRailwayArgs[2] -ne "--email") {
    throw "Shadow Mode configuration must use the guarded email-only command shape."
  }
  try {
    [void]([System.Net.Mail.MailAddress]$shadowModeEmail)
  } catch {
    throw "Shadow Mode configuration requires one valid email recipient."
  }
}
$buildStampPath = Join-Path $repositoryRoot "nexteam-build-sha.txt"
$hadBuildStamp = Test-Path -LiteralPath $buildStampPath
$previousBuildStamp = if ($hadBuildStamp) { Get-Content -LiteralPath $buildStampPath -Raw } else { $null }
$buildInfoPath = Join-Path $repositoryRoot "apps\server\src\buildInfo.ts"
$originalBuildInfo = $null
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
    $originalBuildInfo = Get-Content -LiteralPath $buildInfoPath -Raw
    if (-not $originalBuildInfo.Contains("__NEXTEAM_UPLOAD_SHA__")) {
      throw "The guarded staging build identity marker is unavailable; Railway upload is denied."
    }
    $buildInfoDeclaration = 'const uploadedArchiveSha = "__NEXTEAM_UPLOAD_SHA__";'
    $stampedBuildInfoDeclaration = 'const uploadedArchiveSha = "' + $buildSha + '";'
    Set-Content -LiteralPath $buildInfoPath -Value ($originalBuildInfo.Replace($buildInfoDeclaration, $stampedBuildInfoDeclaration)) -NoNewline
  }

  $railway = Get-Command railway -ErrorAction Stop
  $token = Get-RailwayTokenFromVault -Path $VaultPath
  $env:RAILWAY_TOKEN = $token
  Remove-Item Env:RAILWAY_API_TOKEN -ErrorAction SilentlyContinue

  if ($shadowModeConfigure) {
    # The only permitted variable mutation is a staging-only recipient guard.
    # Railway output is intentionally discarded so this writer cannot become a
    # secret-discovery path.
    $output = & $railway.Source variable set "NEXTEAM_SHADOW_MODE=true" "NEXTEAM_SHADOW_EMAIL_RECIPIENTS=$shadowModeEmail" --service NexTeam-Studio --environment staging 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Railway rejected the staging Shadow Mode configuration update."
    }
    Write-Host "Staging Shadow Mode configuration updated."
    $output = @()
  } else {
    $output = & $railway.Source @normalizedRailwayArgs 2>&1
  }
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
    if ($null -ne $originalBuildInfo) {
      Set-Content -LiteralPath $buildInfoPath -Value $originalBuildInfo -NoNewline
    }
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
