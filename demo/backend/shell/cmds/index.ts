/**
 * Name → implementation, per shell family. Lookup order in the interpreter:
 * shell builtins, then the executables every shell can reach on PATH, then
 * the program registry (agents), then "not recognized".
 */
import type { Family } from '../parse'
import { bashFsCommands } from './bashfs'
import { cmdFsCommands } from './cmdfs'
import type { CommandFn } from './context'
import { git } from './git'
import { npm, npx } from './npm'
import { psFsCommands } from './psfs'
import {
  bashEcho,
  bashEnv,
  bashExport,
  cargo,
  clear,
  cmdDateTime,
  cmdEcho,
  cmdSet,
  code,
  curl,
  getCommand,
  getDate,
  help,
  hostname,
  invokeWebRequest,
  node,
  ping,
  psEcho,
  python,
  rustc,
  sleep,
  timeout,
  tree,
  ver,
  where,
  which,
  whoami,
  winget,
  writeHost
} from './system'

/** PowerShell cmdlet names by alias (for `gcm`, completion and error sources). */
export const PS_CMDLETS: Record<string, string> = {
  'get-childitem': 'Get-ChildItem',
  ls: 'Get-ChildItem',
  dir: 'Get-ChildItem',
  gci: 'Get-ChildItem',
  'set-location': 'Set-Location',
  cd: 'Set-Location',
  sl: 'Set-Location',
  chdir: 'Set-Location',
  'get-location': 'Get-Location',
  pwd: 'Get-Location',
  gl: 'Get-Location',
  'get-content': 'Get-Content',
  cat: 'Get-Content',
  type: 'Get-Content',
  gc: 'Get-Content',
  'new-item': 'New-Item',
  ni: 'New-Item',
  mkdir: 'mkdir',
  md: 'mkdir',
  'remove-item': 'Remove-Item',
  rm: 'Remove-Item',
  del: 'Remove-Item',
  erase: 'Remove-Item',
  rd: 'Remove-Item',
  rmdir: 'Remove-Item',
  ri: 'Remove-Item',
  'move-item': 'Move-Item',
  mv: 'Move-Item',
  move: 'Move-Item',
  mi: 'Move-Item',
  'copy-item': 'Copy-Item',
  cp: 'Copy-Item',
  copy: 'Copy-Item',
  cpi: 'Copy-Item',
  'rename-item': 'Rename-Item',
  ren: 'Rename-Item',
  rni: 'Rename-Item',
  'test-path': 'Test-Path',
  'select-string': 'Select-String',
  sls: 'Select-String',
  'get-history': 'Get-History',
  history: 'Get-History',
  h: 'Get-History',
  ghy: 'Get-History',
  'clear-history': 'Clear-History',
  clhy: 'Clear-History',
  'write-output': 'Write-Output',
  echo: 'Write-Output',
  write: 'Write-Output',
  'write-host': 'Write-Host',
  'clear-host': 'Clear-Host',
  cls: 'Clear-Host',
  clear: 'Clear-Host',
  'get-date': 'Get-Date',
  date: 'Get-Date',
  'get-command': 'Get-Command',
  gcm: 'Get-Command',
  'invoke-webrequest': 'Invoke-WebRequest',
  iwr: 'Invoke-WebRequest',
  'start-sleep': 'Start-Sleep',
  sleep: 'Start-Sleep',
  help: 'help'
}

const ps = (ps7: boolean): Record<string, CommandFn> => {
  const table: Record<string, CommandFn> = {
    ...psFsCommands,
    'write-output': psEcho,
    echo: psEcho,
    write: psEcho,
    'write-host': writeHost,
    'clear-host': clear,
    cls: clear,
    clear,
    'get-date': getDate,
    date: getDate,
    'get-command': getCommand((n) => PS_CMDLETS[n.toLowerCase()] ?? null),
    gcm: getCommand((n) => PS_CMDLETS[n.toLowerCase()] ?? null),
    'invoke-webrequest': invokeWebRequest,
    iwr: invokeWebRequest,
    'start-sleep': sleep,
    sleep
  }
  // Windows PowerShell aliases curl/wget to Invoke-WebRequest; PowerShell 7 dropped that.
  if (!ps7) {
    table.curl = invokeWebRequest
    table.wget = invokeWebRequest
  }
  return table
}

const PS5 = ps(false)
const PS7 = ps(true)

const CMD: Record<string, CommandFn> = {
  ...cmdFsCommands,
  echo: cmdEcho,
  cls: clear,
  set: cmdSet,
  ver,
  date: cmdDateTime('date'),
  time: cmdDateTime('time'),
  timeout
}

const BASH: Record<string, CommandFn> = {
  ...bashFsCommands,
  echo: bashEcho,
  printf: bashEcho,
  clear,
  export: bashExport,
  env: bashEnv,
  printenv: bashEnv,
  date: getDate,
  which,
  sleep,
  true: () => 0,
  false: () => 1
}

/** Executables on PATH in every shell. */
const EXTERNAL: Record<string, CommandFn> = {
  help,
  git,
  npm,
  npx,
  node,
  python,
  python3: python,
  py: python,
  cargo,
  rustc,
  code,
  curl,
  ping,
  whoami,
  hostname,
  tree,
  where,
  winget
}

export function builtin(family: Family, ps7: boolean, name: string): CommandFn | undefined {
  const key = name.toLowerCase()
  const table = family === 'ps' ? (ps7 ? PS7 : PS5) : family === 'cmd' ? CMD : BASH
  // Bash is case-sensitive about its own builtins; Windows executables are not.
  const own = family === 'bash' ? table[name] : table[key]
  return own ?? EXTERNAL[key.replace(/\.(exe|cmd|bat|com)$/, '')]
}

/** Names Tab completion offers in command position. */
export function commandNames(family: Family, ps7: boolean): string[] {
  const own =
    family === 'ps'
      ? [...new Set(Object.values(PS_CMDLETS)), ...Object.keys(ps7 ? PS7 : PS5).filter((k) => !k.includes('-'))]
      : Object.keys(family === 'cmd' ? CMD : BASH)
  return [...new Set([...own, ...Object.keys(EXTERNAL)])]
}
