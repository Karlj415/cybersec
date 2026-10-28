# Developer check: runs every command from the Windows phase (lessons l50-l59)
# and saves the output next to this script, so lesson text can be compared
# with real results. Read-only except the NTFS lesson's own exercise, which
# changes and then restores a throwaway file in %TEMP%.
#
# Run in Windows PowerShell 5.1, once normally and once as administrator:
#   powershell -ExecutionPolicy Bypass -File <path>\scripts\verify-windows-lessons.ps1
# -ExecutionPolicy Bypass applies to that one process only.

$ErrorActionPreference = 'Continue'
$courseRoot = Split-Path -Parent $PSScriptRoot
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$mode = if ($isAdmin) { 'admin' } else { 'normal' }
$outFile = Join-Path $PSScriptRoot "windows-verify-$mode.txt"
Set-Content -LiteralPath $outFile -Value "CyberPath Windows verification ($mode) $(Get-Date -Format o)" -Encoding UTF8

function Run([string]$label, [scriptblock]$block) {
  $text = try { & $block 2>&1 | Out-String -Width 220 } catch { "ERROR: $($_.Exception.Message)" }
  Add-Content -LiteralPath $outFile -Value "`r`n===== $label =====`r`n$text" -Encoding UTF8
  Write-Host "done: $label"
}

Set-Location -LiteralPath $courseRoot

# l50
Run 'l50 Get-ComputerInfo' { Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture }
Run 'l50 PSVersionTable' { $PSVersionTable }
Run 'l50 whoami' { whoami }
Run 'l50 Get-Date' { Get-Date -Format o }

# l51
Run 'l51 Get-Member (first 25 lines)' { (Get-Process | Get-Member | Out-String -Width 220) -split "`n" | Select-Object -First 25 }
Run 'l51 explorer filter' { Get-Process | Where-Object { $_.ProcessName -eq 'explorer' } | Select-Object Id, ProcessName }
Run 'l51 top CPU' { Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Id, ProcessName, CPU }
Run 'l51 Get-Help (first 15 lines)' { (Get-Help Get-Process | Out-String) -split "`n" | Select-Object -First 15 }
Run 'l51 ExecutionPolicy' { Get-ExecutionPolicy -List }

# l52
Run 'l52 whoami /user' { whoami /user }
Run 'l52 whoami /groups' { whoami /groups }
Run 'l52 whoami /priv' { whoami /priv }

# l53 (exact lesson block)
Run 'l53 NTFS exercise' {
  $lab = Join-Path $env:TEMP ('CyberPath-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $lab | Out-Null
  $file = Join-Path $lab 'practice.txt'
  Set-Content -LiteralPath $file -Value 'fictional training data'
  $before = (Get-Acl -LiteralPath $file).Sddl
  $beforeList = icacls $file | Out-String
  '--- before'; $beforeList
  '--- grant'; icacls $file /grant '*S-1-1-0:(R)'
  '--- after'; icacls $file
  $acl = Get-Acl -LiteralPath $file
  $acl.SetSecurityDescriptorSddlForm($before)
  Set-Acl -LiteralPath $file -AclObject $acl
  '--- restored list equals before:'; (icacls $file | Out-String) -eq $beforeList
  Remove-Item -LiteralPath $file; Remove-Item -LiteralPath $lab
}

# l53 diagnostics: why the SDDL comparison above can print False, and whether
# a targeted icacls undo gives an exact match. Two separate throwaway files.
Run 'l53 restore diagnostics' {
  $lab = Join-Path $env:TEMP ('CyberPath-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $lab | Out-Null
  foreach ($method in 'Set-Acl', 'icacls-remove') {
    $file = Join-Path $lab "$method.txt"
    Set-Content -LiteralPath $file -Value 'fictional training data'
    $before = (Get-Acl -LiteralPath $file).Sddl
    $beforeText = (icacls $file | Out-String)
    icacls $file /grant '*S-1-1-0:(R)' | Out-Null
    $granted = (Get-Acl -LiteralPath $file).Sddl
    if ($method -eq 'Set-Acl') {
      $acl = Get-Acl -LiteralPath $file
      $acl.SetSecurityDescriptorSddlForm($before)
      Set-Acl -LiteralPath $file -AclObject $acl
    } else {
      icacls $file /remove:g '*S-1-1-0' | Out-Null
    }
    $after = (Get-Acl -LiteralPath $file).Sddl
    "##### method: $method"
    '--- SDDL before';  $before
    '--- SDDL granted'; $granted
    '--- SDDL after';   $after
    '--- icacls after'; icacls $file
    '--- SDDL equals before:';        $after -eq $before
    '--- icacls text equals before:'; (icacls $file | Out-String) -eq $beforeText
    '--- Access rules equal before:'
    $acl0 = New-Object System.Security.AccessControl.FileSecurity
    $acl0.SetSecurityDescriptorSddlForm($before)
    $rules = { param($a) ($a.Access | ForEach-Object { "$($_.IdentityReference)|$($_.FileSystemRights)|$($_.AccessControlType)|$($_.IsInherited)" }) -join ';' }
    (& $rules $acl0) -eq (& $rules (Get-Acl -LiteralPath $file))
    Remove-Item -LiteralPath $file
  }
  Remove-Item -LiteralPath $lab
}

# l54
Run 'l54 services' { Get-CimInstance Win32_Service | Select-Object -First 8 Name, State, StartName, PathName }
Run 'l54 scheduled tasks' { Get-ScheduledTask | Select-Object -First 8 TaskName, TaskPath, State }
Run 'l54 HKCU Run' { Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue }
Run 'l54 Spooler' { Get-CimInstance Win32_Service -Filter "Name='Spooler'" | Select-Object Name, State, StartName, PathName }
Run 'l54 spoolsv ACL' { Get-Acl 'C:\Windows\System32\spoolsv.exe' | Format-List Owner, AccessToString }

# l55
Run 'l55 IP config' { Get-NetIPConfiguration }
Run 'l55 profile' { Get-NetConnectionProfile }
Run 'l55 listeners' { Get-NetTCPConnection -State Listen | Select-Object -First 12 LocalAddress, LocalPort, OwningProcess }
Run 'l55 firewall profiles' { Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction }
Run 'l55 firewall rules' { Get-NetFirewallRule -PolicyStore ActiveStore -Enabled True | Select-Object -First 10 DisplayName, Direction, Action, Profile }
Run 'l55 port filter for first rule' {
  $name = (Get-NetFirewallRule -PolicyStore ActiveStore -Enabled True | Select-Object -First 1).DisplayName
  "rule: $name"
  Get-NetFirewallRule -DisplayName $name | Get-NetFirewallPortFilter
}
Run 'l55 loopback test' { Test-NetConnection -ComputerName 127.0.0.1 -Port 8766 -WarningAction SilentlyContinue }

# l56
Run 'l56 Security log info' { Get-WinEvent -ListLog Security | Select-Object LogName, IsEnabled, RecordCount }
Run 'l56 Security events' { Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624,4625,4688; StartTime=(Get-Date).AddHours(-2)} -MaxEvents 10 | Select-Object TimeCreated, Id, ProviderName, RecordId }
Run 'l56 System events' { Get-WinEvent -LogName System -MaxEvents 3 | Select-Object TimeCreated, Id, ProviderName }

# l57
Run 'l57 Defender' { Get-MpComputerStatus | Select-Object AMRunningMode, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated }
Run 'l57 HotFix' { Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 5 HotFixID, InstalledOn }

# l58
Run 'l58 domain' { Get-CimInstance Win32_ComputerSystem | Select-Object Name, PartOfDomain, Domain }
Run 'l58 klist' { klist }

# l59 (run from course root)
Run 'l59 wrong filter' { $events = Import-Csv .\labs\windows\events.csv; $events | Where-Object { $_.EventId -like '*4624*' } | Select-Object Record, Host, EventId }
Run 'l59 right filter' { $events = Import-Csv .\labs\windows\events.csv; $events | Where-Object { [int]$_.EventId -eq 4624 } | Select-Object Record, Host, LogonId }
Run 'l59 timeline' { $events = Import-Csv .\labs\windows\events.csv; $events | Sort-Object TimeUtc | Select-Object TimeUtc, Host, EventId, Account, LogonId, Process }
Run 'l59 analyze-events.ps1' { & (Join-Path $courseRoot 'labs\windows\analyze-events.ps1') }

Write-Host "`nSaved: $outFile"
