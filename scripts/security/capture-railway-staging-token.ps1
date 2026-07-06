#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$VaultPath = (Join-Path $env:APPDATA "NexTeam-Studio\secrets\railway-staging.dpapi"),
  [switch]$Force
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
  throw "APPDATA is not set; cannot choose a user-local vault path."
}

$vaultDir = Split-Path -Parent $VaultPath
New-Item -ItemType Directory -Path $vaultDir -Force | Out-Null

if ((Test-Path -LiteralPath $VaultPath) -and -not $Force) {
  throw "Vault already exists. Re-run with -Force only when intentionally replacing the stored Railway project token."
}

Write-Host "Railway project token capture for cozy-sparkle / staging"
Write-Host "Input is hidden. Do not paste the token into chat, a file, or a normal terminal echo."
Write-Host ""

$secureToken = Read-Host "Paste the Railway project token now, then press Enter" -AsSecureString
if ($secureToken.Length -lt 20) {
  throw "Token was empty or unexpectedly short. Nothing was saved."
}

$encryptedToken = ConvertFrom-SecureString -SecureString $secureToken
$tempPath = "$VaultPath.tmp"
Set-Content -LiteralPath $tempPath -Value $encryptedToken -Encoding ASCII -NoNewline
Move-Item -LiteralPath $tempPath -Destination $VaultPath -Force

Write-Host ""
Write-Host "Saved encrypted Railway token vault:"
Write-Host $VaultPath
Write-Host ""
Write-Host "Next safe check:"
Write-Host ".\scripts\security\test-railway-staging-auth.ps1"
