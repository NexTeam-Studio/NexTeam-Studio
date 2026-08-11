#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$VaultPath = (Join-Path $env:APPDATA "NexTeam-Studio\secrets\railway-staging.dpapi")
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$railwayCli = Join-Path $env:APPDATA "npm\node_modules\@railway\cli\bin\railway.js"
if (-not (Test-Path -LiteralPath $railwayCli)) {
  throw "The local Railway CLI runtime is unavailable."
}

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
    throw "The local staging credential vault is unavailable."
  }
  $secure = ConvertTo-SecureString -String (Get-Content -LiteralPath $Path -Raw)
  Convert-SecureStringToPlainText -SecureString $secure
}

function Set-StagingValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][securestring]$Value,
    [Parameter(Mandatory = $true)][string]$RailwayToken
  )

  $plainValue = Convert-SecureStringToPlainText -SecureString $Value
  $priorToken = $env:RAILWAY_TOKEN
  try {
    $env:RAILWAY_TOKEN = $RailwayToken
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo.FileName = $nodeExecutable
    $process.StartInfo.Arguments = "`"$railwayCli`" variable set $Name --stdin --service NexTeam-Studio --environment staging"
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.CreateNoWindow = $true
    if (-not $process.Start()) { throw "Could not start the staging secret writer." }
    $process.StandardInput.Write($plainValue)
    $process.StandardInput.Close()
    $null = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Railway rejected the staging-only OAuth client update." }
  } finally {
    $plainValue = $null
    $env:RAILWAY_TOKEN = $priorToken
  }
}

Write-Host "This stores only the dedicated STAGING owner-invitation OAuth client binding. Nothing is printed or written to Git."
$credentials = Get-Credential -Message "Paste the Google OAuth Client ID in User name and the new Google OAuth Client Secret in Password."
if ($null -eq $credentials) { throw "OAuth client capture was cancelled." }
$clientId = ConvertTo-SecureString -String $credentials.UserName -AsPlainText -Force
$clientSecret = $credentials.Password
$railwayToken = Get-RailwayTokenFromVault -Path $VaultPath
try {
  Set-StagingValue -Name "GMAIL_SEND_MAILBOX_CLIENT_SECRET" -Value $clientSecret -RailwayToken $railwayToken
  Set-StagingValue -Name "GMAIL_SEND_MAILBOX_CLIENT_ID" -Value $clientId -RailwayToken $railwayToken
  Write-Host "STAGING_OWNER_INVITATION_OAUTH_CLIENT_STORED"
} finally {
  $railwayToken = $null
  $clientId = $null
  $clientSecret = $null
  $credentials = $null
}
