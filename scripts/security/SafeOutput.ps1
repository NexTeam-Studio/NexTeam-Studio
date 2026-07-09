#requires -Version 5.1

Set-StrictMode -Version 2.0

function Redact-SecretOutput {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
    [string[]]$KnownSecrets = @()
  )

  $redacted = $Text

  foreach ($secret in $KnownSecrets) {
    if (-not [string]::IsNullOrWhiteSpace($secret)) {
      $redacted = $redacted.Replace($secret, "[REDACTED_KNOWN_SECRET]")
    }
  }

  $secretNamePattern = '(?i)[A-Z0-9_]*(?:API_KEY|APP_PASSWORD|CLIENT_SECRET|PASSWORD|PRIVATE_KEY|REFRESH_TOKEN|SECRET|TOKEN|ANTHROPIC|ELEVENLABS|OPENWEATHER|STRIPE|GOOGLE_MAPS|COMPANYCAM|JOBBER|GMAIL)[A-Z0-9_]*'

  $redacted = $redacted -replace '(?i)(Project-Access-Token\s*[:=]\s*)\S+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)(Authorization\s*:\s*Bearer\s+)\S+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)((?:RAILWAY_TOKEN|RAILWAY_API_TOKEN)\s*[:=]\s*)\S+', '$1[REDACTED]'
  $redacted = $redacted -replace '(?i)(sk-ant-api03-[A-Za-z0-9_\-]+)', '[REDACTED_ANTHROPIC_KEY]'
  $redacted = $redacted -replace '(?i)(sk_(?:live|test|[A-Za-z0-9])[A-Za-z0-9_\-]+)', '[REDACTED_SECRET_KEY]'
  $redacted = $redacted -replace '(?i)(whsec_[A-Za-z0-9_\-]+)', '[REDACTED_WEBHOOK_SECRET]'
  $redacted = $redacted -replace '(?i)(AIza[A-Za-z0-9_\-]+)', '[REDACTED_GOOGLE_API_KEY]'
  $redacted = $redacted -replace '(?i)(GOCSPX-[A-Za-z0-9_\-]+)', '[REDACTED_GOOGLE_CLIENT_SECRET]'
  $redacted = $redacted -replace '(?i)(1//[A-Za-z0-9_\-]+)', '[REDACTED_GOOGLE_REFRESH_TOKEN]'
  $redacted = $redacted -replace '(?i)\b[a-f0-9]{32,}\b', '[REDACTED_HEX_SECRET]'
  $redacted = $redacted -replace "(?i)($secretNamePattern\s*[:=]\s*)[^\s,;]+", '$1[REDACTED]'

  $box = [char]0x2502
  $lines = $redacted -split "(`r`n|`n|`r)"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -match $secretNamePattern) {
      if ($line.Contains($box)) {
        $parts = $line -split [regex]::Escape([string]$box)
        if ($parts.Count -ge 3) {
          $parts[2] = " [REDACTED] "
          $lines[$i] = $parts -join $box
        } elseif ($parts.Count -ge 2) {
          $parts[1] = " [REDACTED] "
          $lines[$i] = $parts -join $box
        }
      } elseif ($line -match '\|') {
        $parts = $line -split '\|'
        if ($parts.Count -ge 3) {
          $parts[2] = " [REDACTED] "
          $lines[$i] = $parts -join "|"
        } elseif ($parts.Count -ge 2) {
          $parts[1] = " [REDACTED] "
          $lines[$i] = $parts -join "|"
        }
      }
    }
  }

  $lines -join ""
}

function Write-SafeOutput {
  param(
    [Parameter(ValueFromPipeline = $true)][AllowNull()]$InputObject,
    [string[]]$KnownSecrets = @()
  )

  process {
    $text = ($InputObject | Out-String).TrimEnd()
    if ($text.Length -gt 0) {
      Write-Output (Redact-SecretOutput -Text $text -KnownSecrets $KnownSecrets)
    }
  }
}
