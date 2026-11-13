# Builds dist/parrot-windows.zip: Parrot's standalone server, a portable Node and a
# double-click launcher, so someone can run Parrot in their browser without installing
# anything. Run from app/:  bun run package:win
#
# The zip holds no user data; whoever runs it gets their own %USERPROFILE%\.parrot.

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$distDir = ".next-package"   # not .next, so a running `next dev` is left alone
$out = Join-Path $root "dist\parrot"
$zip = Join-Path $root "dist\parrot-windows.zip"

Push-Location $root
try {
  $env:NEXT_DIST_DIR = $distDir
  bun run build
  if ($LASTEXITCODE -ne 0) { throw "next build failed" }
} finally {
  Remove-Item Env:NEXT_DIST_DIR
  Pop-Location
}

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

# The standalone server needs the static assets and public/ copied in beside it.
Copy-Item -Recurse (Join-Path $root "$distDir\standalone") (Join-Path $out "app")
Copy-Item -Recurse (Join-Path $root "$distDir\static") (Join-Path $out "app\$distDir\static")
Copy-Item -Recurse (Join-Path $root "public") (Join-Path $out "app\public")

# Never ship this machine's env files (they can hold API keys).
Get-ChildItem (Join-Path $out "app") -Filter ".env*" -Force | Remove-Item -Force

# better-sqlite3's native binary was installed for this Node's ABI, so ship this exact node.exe.
New-Item -ItemType Directory (Join-Path $out "node") | Out-Null
Copy-Item (Get-Command node).Source (Join-Path $out "node\node.exe")

Copy-Item (Join-Path $PSScriptRoot "package\*") $out

if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $out -DestinationPath $zip

$mb = [math]::Round((Get-Item $zip).Length / 1MB)
Write-Host "Built $zip ($mb MB)"
