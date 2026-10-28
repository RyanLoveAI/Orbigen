param([Parameter(Mandatory=$true)][string]$Action)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$inputText = [Console]::In.ReadToEnd()
$value = if ($inputText) { ConvertFrom-Json $inputText } else { $null }
switch ($Action) {
  'choose' {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Orbigen - Choose local asset folder'
    if ($value.path -and (Test-Path -LiteralPath $value.path -PathType Container)) { $dialog.SelectedPath = $value.path }
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true
    $owner.ShowInTaskbar = $false
    $owner.WindowState = 'Minimized'
    $owner.Show()
    try {
      if ($dialog.ShowDialog($owner) -eq 'OK') { ConvertTo-Json -Compress $dialog.SelectedPath } else { 'null' }
    } finally { $owner.Dispose(); $dialog.Dispose() }
  }
  'open' {
    if (-not (Test-Path -LiteralPath $value.path -PathType Container)) { throw 'Folder does not exist' }
    # ProcessStartInfo.FileName opens the directory without shell command interpolation.
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $value.path
    $info.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($info) | Out-Null
    'true'
  }
  { $_ -in 'read','write','delete' } {
    Add-Type -AssemblyName System.Security
    $file = Join-Path $env:ASSET_WORKBENCH_DATA 'tripo-official-api-session.dpapi'
    if ($Action -eq 'read') {
      if (Test-Path -LiteralPath $file) {
        $plain = [System.Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Console]::Write($utf8.GetString($plain))
      } else { 'null' }
    } elseif ($Action -eq 'write') {
      $bytes = [System.Security.Cryptography.ProtectedData]::Protect($utf8.GetBytes($inputText),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      [IO.File]::WriteAllBytes($file + '.tmp',$bytes)
      Move-Item -LiteralPath ($file + '.tmp') -Destination $file -Force
      'null'
    } else { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue; 'null' }
  }
  default { throw 'Unknown action' }
}
