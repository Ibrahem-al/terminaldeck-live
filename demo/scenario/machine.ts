/** The simulated Windows PC every shell and program runs on. */
import type { Machine } from '../backend/contracts'

const HOME = 'C:\\Users\\dev'

export const machine: Machine = {
  user: 'dev',
  hostname: 'HARBOR',
  home: HOME,
  projectsDir: `${HOME}\\projects`,
  windowsBuild: 26200,
  osName: 'Microsoft Windows 11 Pro',
  shells: [
    { kind: 'powershell', label: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
    { kind: 'pwsh', label: 'PowerShell 7', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' },
    { kind: 'cmd', label: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' },
    { kind: 'gitbash', label: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe' }
  ],
  env: {
    ALLUSERSPROFILE: 'C:\\ProgramData',
    APPDATA: `${HOME}\\AppData\\Roaming`,
    COMPUTERNAME: 'HARBOR',
    ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe',
    HOMEDRIVE: 'C:',
    HOMEPATH: '\\Users\\dev',
    LOCALAPPDATA: `${HOME}\\AppData\\Local`,
    NUMBER_OF_PROCESSORS: '16',
    OS: 'Windows_NT',
    Path: [
      'C:\\WINDOWS\\system32',
      'C:\\WINDOWS',
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\Program Files\\PowerShell\\7\\',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\nodejs\\',
      `${HOME}\\AppData\\Roaming\\npm`,
      `${HOME}\\.cargo\\bin`,
      `${HOME}\\AppData\\Local\\Programs\\Python\\Python313\\`
    ].join(';'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WS;.MSC;.PS1',
    PROCESSOR_ARCHITECTURE: 'AMD64',
    ProgramData: 'C:\\ProgramData',
    ProgramFiles: 'C:\\Program Files',
    SystemDrive: 'C:',
    SystemRoot: 'C:\\WINDOWS',
    TEMP: `${HOME}\\AppData\\Local\\Temp`,
    TMP: `${HOME}\\AppData\\Local\\Temp`,
    USERDOMAIN: 'HARBOR',
    USERNAME: 'dev',
    USERPROFILE: HOME,
    windir: 'C:\\WINDOWS'
  },
  versions: {
    windows: '10.0.26200.6584',
    powershell: '5.1.26100.6584',
    pwsh: '7.5.3',
    node: 'v22.19.0',
    npm: '10.9.3',
    git: '2.51.0.windows.1',
    python: '3.13.7',
    cargo: '1.90.0 (840b83a10 2025-07-30)',
    rustc: '1.90.0 (1159e78c4 2025-09-14)'
  }
}
