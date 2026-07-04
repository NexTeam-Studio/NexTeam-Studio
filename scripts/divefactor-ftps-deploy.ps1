param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("inspect", "deploy")]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$FtpHost,

  [Parameter(Mandatory = $true)]
  [string]$Username,

  [Parameter(Mandatory = $true)]
  [string]$Password,

  [string]$SiteRoot = "/home/aquatr7/divefactor.com",
  [string]$LocalPackage,
  [string]$LocalBackupRoot,
  [string]$RemoteBackupName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

function New-FtpRequest {
  param(
    [Parameter(Mandatory = $true)][string]$RemotePath,
    [Parameter(Mandatory = $true)][string]$Method
  )

  $path = if ($RemotePath.StartsWith("/")) { $RemotePath } else { "/$RemotePath" }
  $uri = "ftp://$FtpHost$path"
  $request = [System.Net.FtpWebRequest]::Create($uri)
  $request.Method = $Method
  $request.Credentials = New-Object System.Net.NetworkCredential($Username, $Password)
  $request.EnableSsl = $true
  $request.UsePassive = $true
  $request.UseBinary = $true
  $request.KeepAlive = $false
  $request.Timeout = 60000
  $request.ReadWriteTimeout = 60000
  return $request
}

function Invoke-FtpTextRequest {
  param(
    [Parameter(Mandatory = $true)][string]$RemotePath,
    [Parameter(Mandatory = $true)][string]$Method
  )

  $request = New-FtpRequest -RemotePath $RemotePath -Method $Method
  $response = $request.GetResponse()
  try {
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    try {
      return $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  }
  finally {
    $response.Dispose()
  }
}

function Invoke-FtpBinaryDownload {
  param(
    [Parameter(Mandatory = $true)][string]$RemotePath,
    [Parameter(Mandatory = $true)][string]$LocalPath
  )

  $request = New-FtpRequest -RemotePath $RemotePath -Method ([System.Net.WebRequestMethods+Ftp]::DownloadFile)
  $response = $request.GetResponse()
  try {
    $stream = $response.GetResponseStream()
    $outStream = [System.IO.File]::Create($LocalPath)
    try {
      $stream.CopyTo($outStream)
    }
    finally {
      $outStream.Dispose()
      $stream.Dispose()
    }
  }
  finally {
    $response.Dispose()
  }
}

function Invoke-FtpBinaryUpload {
  param(
    [Parameter(Mandatory = $true)][string]$LocalPath,
    [Parameter(Mandatory = $true)][string]$RemotePath
  )

  $request = New-FtpRequest -RemotePath $RemotePath -Method ([System.Net.WebRequestMethods+Ftp]::UploadFile)
  $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
  $request.ContentLength = $bytes.Length
  $requestStream = $request.GetRequestStream()
  try {
    $requestStream.Write($bytes, 0, $bytes.Length)
  }
  finally {
    $requestStream.Dispose()
  }

  $response = $request.GetResponse()
  $response.Dispose()
}

function Invoke-FtpSimple {
  param(
    [Parameter(Mandatory = $true)][string]$RemotePath,
    [Parameter(Mandatory = $true)][string]$Method
  )

  $request = New-FtpRequest -RemotePath $RemotePath -Method $Method
  $response = $request.GetResponse()
  $response.Dispose()
}

function Join-RemotePath {
  param(
    [AllowEmptyString()][string]$Base = "",
    [Parameter(Mandatory = $true)][string]$Child
  )

  $cleanBase = if ($Base.EndsWith("/")) { $Base.TrimEnd("/") } else { $Base }
  $cleanChild = $Child.Trim("/")
  if (-not $cleanBase) { return "/$cleanChild" }
  return "$cleanBase/$cleanChild"
}

function Parse-FtpListingLine {
  param([Parameter(Mandatory = $true)][string]$Line)

  if ($Line -match '^(?<perm>[dl-][rwx-]{9})\s+\d+\s+\S+\s+\S+\s+(?<size>\d+)\s+\w+\s+\d+\s+[\d:]+\s+(?<name>.+)$') {
    return [pscustomobject]@{
      Name = $matches.name.Trim()
      Type = if ($matches.perm[0] -eq "d") { "dir" } else { "file" }
      Size = [int64]$matches.size
    }
  }

  if ($Line -match '^(?<date>\d{2}-\d{2}-\d{2})\s+(?<time>\d{2}:\d{2}(AM|PM))\s+(?<dir>\<DIR\>)?\s*(?<size>\d+)?\s+(?<name>.+)$') {
    return [pscustomobject]@{
      Name = $matches.name.Trim()
      Type = if ($matches.dir) { "dir" } else { "file" }
      Size = if ($matches.size) { [int64]$matches.size } else { $null }
    }
  }

  return [pscustomobject]@{
    Name = $Line.Trim()
    Type = "unknown"
    Size = $null
  }
}

function Get-FtpEntries {
  param([Parameter(Mandatory = $true)][string]$RemotePath)

  $listing = Invoke-FtpTextRequest -RemotePath $RemotePath -Method ([System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails)
  $entries = @()
  foreach ($line in ($listing -split "`r?`n")) {
    if (-not $line.Trim()) { continue }
    $entry = Parse-FtpListingLine -Line $line
    if ($entry.Name -in @(".", "..")) { continue }
    $entries += $entry
  }
  return $entries
}

function Test-FtpPath {
  param([Parameter(Mandatory = $true)][string]$RemotePath)
  try {
    $null = Get-FtpEntries -RemotePath $RemotePath
    return $true
  }
  catch {
    return $false
  }
}

function Ensure-LocalDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Ensure-RemoteDirectory {
  param([Parameter(Mandatory = $true)][string]$RemotePath)

  $normalized = if ($RemotePath -eq "/") { "/" } else { $RemotePath.TrimEnd("/") }
  if ($normalized -eq "/") { return }

  $segments = $normalized.Trim("/").Split("/") | Where-Object { $_ }
  $current = ""
  foreach ($segment in $segments) {
    $current = Join-RemotePath -Base $current -Child $segment
    try {
      Invoke-FtpSimple -RemotePath $current -Method ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)
    }
    catch {
      if ($_.Exception.Message -notmatch "exist|exists|550") {
        throw
      }
    }
  }
}

function Copy-RemoteToLocal {
  param(
    [Parameter(Mandatory = $true)][string]$RemotePath,
    [Parameter(Mandatory = $true)][string]$LocalPath
  )

  Ensure-LocalDirectory -Path $LocalPath
  foreach ($entry in Get-FtpEntries -RemotePath $RemotePath) {
    if ($entry.Name -like "_backup_before_*") { continue }
    $childRemote = Join-RemotePath -Base $RemotePath -Child $entry.Name
    $childLocal = Join-Path $LocalPath $entry.Name
    if ($entry.Type -eq "dir") {
      Copy-RemoteToLocal -RemotePath $childRemote -LocalPath $childLocal
    }
    else {
      Invoke-FtpBinaryDownload -RemotePath $childRemote -LocalPath $childLocal
    }
  }
}

function Copy-LocalToRemote {
  param(
    [Parameter(Mandatory = $true)][string]$LocalPath,
    [Parameter(Mandatory = $true)][string]$RemotePath
  )

  Ensure-RemoteDirectory -RemotePath $RemotePath

  foreach ($item in Get-ChildItem -LiteralPath $LocalPath -Force) {
    $childRemote = Join-RemotePath -Base $RemotePath -Child $item.Name
    if ($item.PSIsContainer) {
      Copy-LocalToRemote -LocalPath $item.FullName -RemotePath $childRemote
    }
    else {
      Invoke-FtpBinaryUpload -LocalPath $item.FullName -RemotePath $childRemote
    }
  }
}

function Get-ResolvedSiteRoot {
  $candidates = @($SiteRoot, "/", "")
  foreach ($candidate in $candidates) {
    if (-not $candidate) { continue }
    if (Test-FtpPath -RemotePath $candidate) {
      $entries = Get-FtpEntries -RemotePath $candidate
      $names = $entries.Name
      if (
        $candidate -eq $SiteRoot -or
        ($names -contains "index.html" -and $names -contains "assets")
      ) {
        return [pscustomobject]@{
          Path = $candidate
          Entries = $entries
        }
      }
    }
  }

  throw "Unable to resolve a live site root that contains the expected static-site files."
}

if ($Mode -eq "inspect") {
  $resolved = Get-ResolvedSiteRoot
  $payload = [pscustomobject]@{
    ResolvedSiteRoot = $resolved.Path
    EntryCount = $resolved.Entries.Count
    Entries = $resolved.Entries | Select-Object -First 80
  }
  $payload | ConvertTo-Json -Depth 5
  exit 0
}

if (-not $LocalPackage) {
  throw "LocalPackage is required in deploy mode."
}

if (-not $LocalBackupRoot) {
  throw "LocalBackupRoot is required in deploy mode."
}

if (-not $RemoteBackupName) {
  throw "RemoteBackupName is required in deploy mode."
}

$resolvedRoot = Get-ResolvedSiteRoot
$remoteSiteRoot = $resolvedRoot.Path
$remoteBackupPath = Join-RemotePath -Base $remoteSiteRoot -Child $RemoteBackupName

Ensure-LocalDirectory -Path $LocalBackupRoot
Copy-RemoteToLocal -RemotePath $remoteSiteRoot -LocalPath $LocalBackupRoot
Ensure-RemoteDirectory -RemotePath $remoteBackupPath
Copy-LocalToRemote -LocalPath $LocalBackupRoot -RemotePath $remoteBackupPath
Copy-LocalToRemote -LocalPath $LocalPackage -RemotePath $remoteSiteRoot

[pscustomobject]@{
  ResolvedSiteRoot = $remoteSiteRoot
  LocalBackupRoot = $LocalBackupRoot
  RemoteBackupPath = $remoteBackupPath
  UploadedFrom = $LocalPackage
} | ConvertTo-Json -Depth 4
