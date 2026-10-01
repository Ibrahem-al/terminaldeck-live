# PowerShell profile — shared by Windows PowerShell 5.1 and PowerShell 7.

Set-PSReadLineOption -EditMode Windows -PredictionSource History -HistoryNoDuplicates
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward

$env:EDITOR = 'code --wait'

# ── navigation ────────────────────────────────────────────────────────
function proj { Set-Location "$HOME\projects\$($args[0])" }
function .. { Set-Location .. }
function ... { Set-Location ..\.. }

# ── git ───────────────────────────────────────────────────────────────
function gs { git status -sb @args }
function gl { git log --oneline --graph --decorate -n 20 @args }
function gd { git diff @args }
function gco { git checkout @args }

# ── node ──────────────────────────────────────────────────────────────
function nr { npm run @args }
function nt { npm test @args }

# Current branch in the window title, so every tab says where it is.
function prompt {
  $branch = git rev-parse --abbrev-ref HEAD 2>$null
  $where = Split-Path -Leaf (Get-Location)
  $Host.UI.RawUI.WindowTitle = if ($branch) { "$where ($branch)" } else { $where }
  "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
}
