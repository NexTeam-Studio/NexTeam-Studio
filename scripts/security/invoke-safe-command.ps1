#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Executable,

  [Parameter(ValueFromRemainingArguments = $true, Position = 1)]
  [string[]]$CommandArgs
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "SafeOutput.ps1")

if ([string]::IsNullOrWhiteSpace($Executable)) {
  throw "Command is required."
}

$resolved = Get-Command $Executable -ErrorAction Stop
$exitCode = 0

try {
  $output = & $resolved.Source @CommandArgs 2>&1
  if ($null -ne $LASTEXITCODE) {
    $exitCode = $LASTEXITCODE
  }

  foreach ($item in $output) {
    Write-SafeOutput -InputObject $item
  }
} catch {
  Write-Error (Redact-SecretOutput -Text $_.Exception.Message)
  $exitCode = 1
}

exit $exitCode
