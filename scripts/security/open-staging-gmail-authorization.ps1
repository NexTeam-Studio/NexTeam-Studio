param(
  [Parameter(Mandatory = $true)]
  [string]$TargetUrl
)

Start-Process -FilePath $TargetUrl
