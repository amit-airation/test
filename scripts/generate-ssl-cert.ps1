# Issue or renew a Let's Encrypt TLS certificate for the nginx edge.
#
# Windows helper only. On EC2 Ubuntu use:
#   npm run ssl:cert
#   bash ./scripts/generate-ssl-cert.sh
#
# Defaults (SAN cert):
#   Domains = test.amitverma01.dev,api.test.amitverma01.dev
#   Email   = amitz.airation@gmail.com
#
# Usage:
#   .\scripts\generate-ssl-cert.ps1
#   .\scripts\generate-ssl-cert.ps1 -WebRoot
#   .\scripts\generate-ssl-cert.ps1 -Staging
#
# Requires: Docker, DNS A/AAAA for every domain pointing at this host,
#           port 80 free for -Standalone.

[CmdletBinding()]
param(
  [string]$Domains = $(if ($env:DOMAINS) { $env:DOMAINS } else { "test.amitverma01.dev,api.test.amitverma01.dev,live.test.amitverma01.dev" }),
  [string]$Email = $(if ($env:EMAIL) { $env:EMAIL } else { "amitz.airation@gmail.com" }),
  [switch]$WebRoot,
  [switch]$Standalone,
  [switch]$Staging
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$CertDir = Join-Path $RootDir "docker/nginx/certs"
$WebRootDir = Join-Path $RootDir "docker/nginx/certbot/www"
$LeDir = Join-Path $RootDir "docker/nginx/certbot/letsencrypt"

New-Item -ItemType Directory -Force -Path $CertDir, $WebRootDir, $LeDir | Out-Null

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required to run certbot."
}

$domainList = @($Domains.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($domainList.Count -eq 0) {
  throw "No domains provided."
}
$primaryDomain = $domainList[0]

$Mode = if ($WebRoot) { "webroot" } else { "standalone" }
Write-Host "Issuing certificate for $($domainList -join ', ') (email $Email, mode $Mode)..."

$stagingArgs = @()
if ($Staging) { $stagingArgs += "--staging" }

$domainArgs = @()
foreach ($d in $domainList) {
  $domainArgs += @("-d", $d)
}

$volumeArgs = @(
  "-v", "${LeDir}:/etc/letsencrypt",
  "-v", "${WebRootDir}:/var/www/certbot"
)

$restartNginx = $false
if ($Mode -eq "standalone") {
  $running = docker ps --format "{{.Names}}" 2>$null
  if ($running -match "(?m)^hirance-nginx$") {
    Write-Host "Stopping hirance-nginx so standalone can bind :80..."
    docker stop hirance-nginx | Out-Null
    $restartNginx = $true
  }

  $certbotArgs = @(
    "run", "--rm"
  ) + $volumeArgs + @(
    "-p", "80:80",
    "certbot/certbot", "certonly",
    "--standalone",
    "--preferred-challenges", "http"
  ) + $domainArgs + @(
    "--email", $Email,
    "--agree-tos",
    "--non-interactive",
    "--expand",
    "--keep-until-expiring"
  ) + $stagingArgs

  & docker @certbotArgs
  if ($LASTEXITCODE -ne 0) { throw "certbot failed with exit code $LASTEXITCODE" }

  if ($restartNginx) {
    Write-Host "Starting hirance-nginx again..."
    docker start hirance-nginx | Out-Null
  }
}
else {
  $certbotArgs = @(
    "run", "--rm"
  ) + $volumeArgs + @(
    "certbot/certbot", "certonly",
    "--webroot",
    "-w", "/var/www/certbot"
  ) + $domainArgs + @(
    "--email", $Email,
    "--agree-tos",
    "--non-interactive",
    "--expand",
    "--keep-until-expiring"
  ) + $stagingArgs

  & docker @certbotArgs
  if ($LASTEXITCODE -ne 0) { throw "certbot failed with exit code $LASTEXITCODE" }
}

$livePath = "/etc/letsencrypt/live/$primaryDomain"
docker run --rm `
  -v "${LeDir}:/etc/letsencrypt:ro" `
  -v "${CertDir}:/out" `
  alpine:3.20 `
  sh -c "test -f $livePath/fullchain.pem && test -f $livePath/privkey.pem && cp -L $livePath/fullchain.pem /out/fullchain.pem && cp -L $livePath/privkey.pem /out/privkey.pem && chmod 644 /out/fullchain.pem && chmod 600 /out/privkey.pem"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy certificate PEMs into docker/nginx/certs."
}

Write-Host "Wrote:"
Write-Host "  $(Join-Path $CertDir 'fullchain.pem')"
Write-Host "  $(Join-Path $CertDir 'privkey.pem')"
Write-Host ""
Write-Host "Reload nginx if it is already running:"
Write-Host "  docker exec hirance-nginx nginx -s reload"
Write-Host "Or start the edge:"
Write-Host "  docker compose up -d --build"
