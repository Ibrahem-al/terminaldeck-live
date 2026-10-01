# dotfiles

My Windows shell setup: PowerShell profile, git config, and an installer
that links them into place.

```powershell
git clone https://github.com/<you>/dotfiles $HOME\projects\dotfiles
& $HOME\projects\dotfiles\install.ps1
```

`install.ps1` creates symbolic links (needs Developer Mode or an elevated
shell), so edits here apply immediately.

| File          | Linked to                                   |
| ------------- | ------------------------------------------- |
| `profile.ps1` | `$PROFILE.CurrentUserAllHosts`              |
| `.gitconfig`  | `~\.gitconfig`                              |
