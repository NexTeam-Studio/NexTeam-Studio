#requires -Version 5.1
[CmdletBinding()]
param(
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

function Invoke-RailwayGraphQL {
  param(
    [Parameter(Mandatory = $true)][string]$Token,
    [Parameter(Mandatory = $true)][string]$Query
  )

  $headers = @{
    "Project-Access-Token" = $Token
    "Content-Type" = "application/json"
  }
  $body = @{ query = $Query } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body -TimeoutSec 20
}

$token = Get-RailwayTokenFromVault -Path $VaultPath

try {
  Write-Host "Railway staging vault: present"

  $smoke = Invoke-RailwayGraphQL -Token $token -Query "query RailwayProjectTokenSmoke { __typename }"
  if ($smoke.__typename -or ($smoke.data -and $smoke.data.__typename)) {
    Write-Host "Railway project-token API smoke: passed"
  } else {
    Write-Host "Railway project-token API smoke: response received"
  }

  Write-Host "Railway CLI smoke: status"
  & (Join-Path $PSScriptRoot "invoke-railway-staging.ps1") status
  $cliExit = $LASTEXITCODE
  if ($cliExit -ne 0) {
    throw "Railway CLI smoke failed with exit code $cliExit."
  }

  $rotationProbe = Invoke-RailwayGraphQL -Token $token -Query "query RailwayRotationProbe { __schema { mutationType { fields { name } } } }"
  $mutationNames = @()
  if ($rotationProbe.data -and $rotationProbe.data.__schema -and $rotationProbe.data.__schema.mutationType) {
    $mutationNames = @($rotationProbe.data.__schema.mutationType.fields | ForEach-Object { $_.name })
  }

  $tokenMutations = @($mutationNames | Where-Object { $_ -match "(?i)token" } | Sort-Object -Unique)
  if ($tokenMutations.Count -gt 0) {
    Write-Host "Project-token-only rotation probe: possible token-related mutations are visible."
    foreach ($name in $tokenMutations) {
      Write-Host " - $name"
    }
    Write-Host "No rotation mutation was executed by this probe."
  } else {
    Write-Host "Project-token-only rotation probe: no token-management mutation is visible to this project token."
    Write-Host "If Railway has no dashboard-independent project-token rotation API for project tokens, a broader workspace token will be required only for rotation."
  }
} finally {
  $token = $null
}
