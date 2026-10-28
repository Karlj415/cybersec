# Synthetic CSV only. Does not collect live logs or change Windows settings.
# Review this code before running it. Compatible with Windows PowerShell 5.1.
param(
    [string]$Path = (Join-Path $PSScriptRoot 'events.csv'),
    [string]$TargetHost = 'LAB-WIN',
    [string]$LogonId = '0x42'
)
$ErrorActionPreference = 'Stop'
$events = Import-Csv -LiteralPath $Path
$provider = 'Microsoft-Windows-Security-Auditing'

Write-Output 'Deliberately wrong substring filter (Records 3, 4, 7):'
$events | Where-Object { $_.EventId -like '*4624*' } |
    Select-Object Record, Host, Provider, EventId | Format-Table -AutoSize

Write-Output 'Correct numeric ID and provider filter (Records 3, 4):'
$events | Where-Object {
    $_.Provider -eq $provider -and [int]$_.EventId -eq 4624
} | Select-Object Record, Host, LogonId | Format-Table -AutoSize

Write-Output 'Session-matched process events (Record 5):'
$events | Where-Object {
    $_.Provider -eq $provider -and [int]$_.EventId -eq 4688 -and
    $_.Host -eq $TargetHost -and $_.LogonId -eq $LogonId
} | Sort-Object TimeUtc | Select-Object Record, TimeUtc, Host, Account, LogonId, Process | Format-Table -AutoSize
