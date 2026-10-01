#Requires -Version 5.1
# Links the files in this repo into place. Safe to re-run.

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

$links = @{
  (Join-Path $here 'profile.ps1') = $PROFILE.CurrentUserAllHosts
  (Join-Path $here '.gitconfig')  = Join-Path $HOME '.gitconfig'
}

foreach ($source in $links.Keys) {
  $target = $links[$source]
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  if (Test-Path $target) {
    $item = Get-Item $target -Force
    if ($item.LinkType -eq 'SymbolicLink' -and $item.Target -eq $source) {
      Write-Host "ok      $target" -ForegroundColor DarkGray
      continue
    }
    Move-Item $target "$target.bak" -Force
    Write-Host "backup  $target.bak" -ForegroundColor Yellow
  }
  New-Item -ItemType SymbolicLink -Path $target -Target $source | Out-Null
  Write-Host "linked  $target" -ForegroundColor Green
}
