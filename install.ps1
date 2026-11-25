# RBC Sender - Windows RDP Installer
# Run in PowerShell as Administrator:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\install.ps1

param(
  [string]$InstallDir   = "C:\rbc-sender",
  [string]$RepoUrl      = "https://github.com/kensdv/RBC-Sender.git",
  [string]$NodeVersion  = "22.13.0",
  [string]$Domain       = "web03document.cloud",
  [string]$MailDomain   = "mail.web03document.cloud"
)

$ErrorActionPreference = "Stop"

function Info($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }

function RefreshPath {
  $machine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
  $env:PATH = "$machine;$user"
}

function HasCmd($cmd) {
  return ($null -ne (Get-Command $cmd -ErrorAction SilentlyContinue))
}

# ---------------------------------------------------------------------------
# Admin check
# ---------------------------------------------------------------------------
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fail "Re-run PowerShell as Administrator."
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  RBC SENDER  -  Windows RDP Installer"   -ForegroundColor Green
Write-Host "  $Domain"                                 -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Chocolatey
# ---------------------------------------------------------------------------
Info "Step 1/8  Chocolatey..."
if (-not (HasCmd "choco")) {
  Set-ExecutionPolicy Bypass -Scope Process -Force
  $sp = [System.Net.ServicePointManager]::SecurityProtocol
  [System.Net.ServicePointManager]::SecurityProtocol = $sp -bor 3072
  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString(
    'https://community.chocolatey.org/install.ps1'))
  RefreshPath
  Ok "Chocolatey installed."
} else { Ok "Chocolatey OK." }

# ---------------------------------------------------------------------------
# 2. Git
# ---------------------------------------------------------------------------
Info "Step 2/8  Git..."
if (-not (HasCmd "git")) {
  choco install git -y --no-progress
  RefreshPath
}
Ok "Git: $(git --version)"

# ---------------------------------------------------------------------------
# 3. Node.js 22
# ---------------------------------------------------------------------------
Info "Step 3/8  Node.js..."
$needNode = $true
if (HasCmd "node") {
  $major = [int]((node -v).TrimStart('v').Split('.')[0])
  if ($major -ge 22) { Ok "Node.js $(node -v) OK."; $needNode = $false }
  else { Warn "Node.js $(node -v) too old - upgrading..." }
}
if ($needNode) {
  choco install nodejs --version=$NodeVersion -y --no-progress
  RefreshPath
  Ok "Node.js $NodeVersion installed."
}

# ---------------------------------------------------------------------------
# 4. Clone / pull repo
# ---------------------------------------------------------------------------
Info "Step 4/8  Repo..."
if (Test-Path $InstallDir) {
  Info "Pulling latest into $InstallDir..."
  Push-Location $InstallDir
  git stash --include-untracked | Out-Null
  git pull --rebase
  git stash pop 2>&1 | Out-Null
  Pop-Location
} else {
  git clone $RepoUrl $InstallDir
}
Push-Location $InstallDir

# ---------------------------------------------------------------------------
# 5. .env
# ---------------------------------------------------------------------------
Info "Step 5/8  Environment..."
if (-not (Test-Path ".env")) {
  node scripts/setup.mjs
  Ok ".env created."
} else { Ok ".env exists - keeping secrets." }

# Always ensure HOST and PUBLIC_BASE_URL are correct
$env_raw = Get-Content ".env" -Raw
$env_raw = $env_raw -replace "HOST=127\.0\.0\.1", "HOST=0.0.0.0"
$env_raw = $env_raw -replace "PUBLIC_BASE_URL=http[^\r\n]*", "PUBLIC_BASE_URL=https://$MailDomain"
Set-Content ".env" $env_raw -NoNewline
Ok "HOST=0.0.0.0  PUBLIC_BASE_URL=https://$MailDomain"

# ---------------------------------------------------------------------------
# 6. npm install + build
# ---------------------------------------------------------------------------
Info "Step 6/8  npm install..."
npm install
Info "          Building client..."
npm run build
Ok "Build complete."

# ---------------------------------------------------------------------------
# 7. PM2  (Node API server)
# ---------------------------------------------------------------------------
Info "Step 7/8  PM2..."
if (-not (HasCmd "pm2")) { npm install -g pm2; RefreshPath }
pm2 start ecosystem.config.cjs --only rbc-api --update-env
pm2 save
Ok "rbc-api running under PM2."

# PM2 auto-start
try {
  $out = pm2 startup 2>&1 | Out-String
  foreach ($line in ($out -split "`n")) {
    $t = $line.Trim()
    if ($t -match "^pm2\s" -or $t -match "Set-ExecutionPolicy") {
      Info "PM2 startup: $t"
      Invoke-Expression $t
      break
    }
  }
} catch { Warn "pm2 startup - run manually if needed." }

# ---------------------------------------------------------------------------
# 8. Caddy  (reverse proxy  :80/:443 -> localhost:3000)
# ---------------------------------------------------------------------------
Info "Step 8/8  Caddy..."
if (-not (HasCmd "caddy")) {
  choco install caddy -y --no-progress
  RefreshPath
  Ok "Caddy installed."
} else { Ok "Caddy already installed: $(caddy version)" }

# Write Caddyfile
# Cloudflare Tunnel terminates TLS, so Caddy listens plain HTTP :80.
# If you ever expose the port directly, swap :80 for the two hostnames
# and Caddy will auto-get Let's Encrypt certs.
$caddyfile = @"
:80 {
    reverse_proxy localhost:3000
    encode gzip

    header {
        -Server
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer
    }
}
"@
Set-Content "$InstallDir\Caddyfile" $caddyfile
Ok "Caddyfile written to $InstallDir\Caddyfile"

# Open firewall ports
Info "Opening firewall ports 80 and 443..."
netsh advfirewall firewall add rule name="Caddy HTTP"  protocol=TCP dir=in action=allow localport=80  | Out-Null
netsh advfirewall firewall add rule name="Caddy HTTPS" protocol=TCP dir=in action=allow localport=443 | Out-Null
Ok "Ports 80 and 443 open."

# Register Caddy as a Windows service via NSSM
$caddyExe = (Get-Command caddy -ErrorAction SilentlyContinue).Source
if (-not $caddyExe) { $caddyExe = "caddy" }

if (-not (HasCmd "nssm")) {
  choco install nssm -y --no-progress
  RefreshPath
}

$svcName = "CaddyRBC"
$existing = sc.exe query $svcName 2>&1 | Out-String
if ($existing -notmatch "RUNNING|STOPPED") {
  nssm install $svcName "$caddyExe" "run --config `"$InstallDir\Caddyfile`" --adapter caddyfile"
  nssm set $svcName AppDirectory $InstallDir
  nssm set $svcName Start SERVICE_AUTO_START
  Ok "Caddy registered as Windows service '$svcName'."
} else {
  Info "Service $svcName already exists - skipping install."
}
Start-Service $svcName -ErrorAction SilentlyContinue
Ok "Caddy service started."

# ---------------------------------------------------------------------------
# Cloudflare Tunnel  (connects web03document.cloud -> Caddy:80)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "  CLOUDFLARE TUNNEL"                        -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan

if (-not (HasCmd "cloudflared")) {
  choco install cloudflared -y --no-progress
  RefreshPath
}
Ok "cloudflared: $(cloudflared --version 2>&1 | Select-Object -First 1)"

$doTunnel = Read-Host "Set up Cloudflare Tunnel now? (Y/N)"
if ($doTunnel -match "^[Yy]") {
  Info "Logging in (browser will open)..."
  cloudflared tunnel login

  Info "Creating tunnel 'rbc-sender'..."
  cloudflared tunnel create rbc-sender 2>&1 | Write-Host

  # Get tunnel ID
  $tunnelId = ""
  $listOut = cloudflared tunnel list 2>&1 | Out-String
  foreach ($line in ($listOut -split "`n")) {
    if ($line -match "rbc-sender") {
      $parts = $line.Trim() -split "\s+"
      if ($parts.Count -ge 1) { $tunnelId = $parts[0]; break }
    }
  }

  # Route both domains
  Info "Routing $Domain -> tunnel..."
  cloudflared tunnel route dns rbc-sender $Domain
  Info "Routing $MailDomain -> tunnel..."
  cloudflared tunnel route dns rbc-sender $MailDomain

  # Write cloudflared config (points to Caddy:80, not Node:3000)
  $cfgDir = "$env:USERPROFILE\.cloudflared"
  if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Path $cfgDir | Out-Null }

  $cfgYml = @"
tunnel: $tunnelId
credentials-file: $cfgDir\$tunnelId.json

ingress:
  - hostname: $Domain
    service: http://localhost:80
  - hostname: $MailDomain
    service: http://localhost:80
  - service: http_status:404
"@
  Set-Content "$cfgDir\config.yml" $cfgYml
  Ok "Tunnel config saved to $cfgDir\config.yml"

  Info "Installing cloudflared as Windows service..."
  cloudflared service install
  Start-Service cloudflared -ErrorAction SilentlyContinue
  Ok "Cloudflare Tunnel service started."
} else {
  Warn "Skipping tunnel. Run when ready:"
  Write-Host "  cloudflared tunnel login"
  Write-Host "  cloudflared tunnel create rbc-sender"
  Write-Host "  cloudflared tunnel route dns rbc-sender $Domain"
  Write-Host "  cloudflared tunnel route dns rbc-sender $MailDomain"
  Write-Host "  cloudflared service install"
}

# ---------------------------------------------------------------------------
# Read token and print summary
# ---------------------------------------------------------------------------
$token = ""
try {
  foreach ($line in (Get-Content ".env")) {
    if ($line -match "^DASHBOARD_TOKEN=(.+)$") { $token = $matches[1]; break }
  }
} catch {}

Pop-Location

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  DONE"                                     -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Panel    : https://$Domain"               -ForegroundColor Cyan
Write-Host "  Tracking : https://$MailDomain"           -ForegroundColor Cyan
if ($token) { Write-Host "  Token    : $token"          -ForegroundColor Yellow }
else { Write-Host "  Token    : see $InstallDir\.env"   -ForegroundColor Yellow }
Write-Host ""
Write-Host "  Services running:"
Write-Host "    PM2        rbc-api  (Node.js :3000)"
Write-Host "    Caddy      $svcName  (reverse proxy :80 -> :3000)"
Write-Host "    cloudflared          (tunnel -> Caddy)"
Write-Host ""
Write-Host "  Useful commands:"
Write-Host "    pm2 logs rbc-api          live log"
Write-Host "    pm2 restart rbc-api       restart node"
Write-Host "    caddy reload --config $InstallDir\Caddyfile"
Write-Host "    cloudflared tunnel list   tunnel status"
Write-Host ""
