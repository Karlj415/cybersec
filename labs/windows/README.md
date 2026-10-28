# Windows security: client deep dive and practice progression

This is a ten-lesson Windows phase embedded in the course, after defensive-security foundations and before penetration testing. Allow roughly 10 hours for the first pass, plus about 2 hours to build the VM and repeat the labs with changed inputs. Command familiarity alone is not proficiency: explain the security boundary, demonstrate the failure, verify the repair, and preserve legitimate use.

## Prerequisites and environment

Complete the earlier lessons on files, users, networking, command lines, permissions, logs, hardening and incident response. The website now lists direct prerequisites in each lesson. Within this phase follow this order:

1. Windows VM baseline, edition, build and architecture.
2. PowerShell objects, pipelines and code reading.
3. Identity, SIDs, process tokens and UAC.
4. NTFS DACLs: introduce and restore a bad grant on a disposable file.
5. Processes, services, Registry and scheduled tasks.
6. Networking, listeners, SMB/RDP exposure and firewall scope.
7. Event logs, audit policy and evidence limitations.
8. Defender, updates, disk encryption and layered hardening.
9. Enterprise identity: AD DS, Kerberos and Group Policy prerequisites.
10. Investigation capstone with a repeatable synthetic case.

Use a **Windows 11 guest** in VirtualBox, UTM or Parallels, not your host computer or a Linux guest. On an x64 computer, use Microsoft's [Windows 11 download](https://www.microsoft.com/software-download/windows11). An existing suitable Windows VM is fine. Record architecture; on Apple Silicon consult Microsoft's [Windows Arm VM guidance](https://learn.microsoft.com/en-us/windows/arm/iso) and your hypervisor's supported setup. Do not assume a driver or a Windows Server image can run merely because an x64 application can be emulated. Respect the Windows image's licensing terms. A second VM is unnecessary for this phase.

Start with built-in **Windows PowerShell 5.1**. The course labels any need to elevate; do ordinary work unprivileged. Record Access denied, missing modules and absent events honestly. Settings/Event Viewer provide fallback inspection routes. Do not mark live exercises complete merely because a Linux companion script ran successfully.

Take a baseline VM snapshot before configuration exercises and record how to restore it. Snapshots do not isolate networks or protect shared host folders. Use fictional files and identities. The only required permission mutation is on a uniquely named file you create yourself; the lesson captures and restores its original descriptor.

## What to record for every exercise

- Guest build, architecture, shell version and elevation state.
- Exact command and its intended input/output types.
- Prediction, actual output and explanation of any mismatch.
- The boundary involved: identity, authorization, execution, network reachability or evidence collection.
- For a change: baseline, changed state, restored state and verification of normal usage.

The worked code and command blocks are inline in each website lesson. Follow them in sequence. This guide supplies the reusable capstone files and further practice criteria.

## Why the ACL lesson matters

The NTFS lesson creates a unique temporary folder and a fictional text file, captures its SDDL security descriptor, grants Everyone read access using the language-independent SID, then restores the captured descriptor. The final check compares the `icacls` permission list with the one saved at the start and should print True. It deliberately does not compare raw SDDL strings: the first modification adds the `AI` (auto-inherited) control flag to the DACL (`D:(...)` becomes `D:AI(...)`), so the SDDL text differs even when every access rule is identical. This was observed on Windows 11 build 26200 in both normal and elevated windows.

The causal explanation: the grant changes which process tokens may satisfy the object's DACL. Renaming the file, hashing it or encrypting network traffic does not remove that grant. Restoring the original descriptor removes this introduced policy change without discarding unrelated baseline permissions.

Inspect inherited entries before interpreting the result. Your own administrator account's access does not establish another account's effective access. An authorized disposable standard account can supply a separate verification, but do not create broad grants on real files or recursively rewrite Windows directories. Reference: [Microsoft icacls documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls).

## Run the synthetic investigation

`events.csv` is deliberately simplified **synthetic training data**, not a native EVTX export. Its `LogonId` column is normalized for teaching: a real 4624 logon and 4688 process event use distinct named schema fields, and event versions/subject-versus-target identities matter. Do not drop a real EVTX export into this parser and assume equivalent semantics. `TimeUtc` uses one UTC format so sorting these fixture strings is chronological.

From the copied course root inside Windows:

```powershell
$events = Import-Csv .\labs\windows\events.csv
$events | Where-Object { $_.EventId -like '*4624*' } | Select-Object Record, Host, EventId
$events | Where-Object { $_.Provider -eq 'Microsoft-Windows-Security-Auditing' -and [int]$_.EventId -eq 4624 } | Select-Object Record, Host, LogonId
```

Read `analyze-events.ps1` before running it:

```powershell
.\labs\windows\analyze-events.ps1
```

If execution policy blocks the script, inspect it and run its reviewed statements interactively. Do not disable policy globally. There is no need to install a domain controller, SIEM or Sysmon for this fixture.

On any machine with Node.js, the equivalent portable analysis is:

```sh
node labs/windows/analyze-events.mjs
node --test labs/windows/analyze-events.test.mjs
```

The JavaScript companion uses a deliberately limited parser for this unquoted training CSV. It rejects quoted fields and malformed rows instead of silently misreading them; it is not a general CSV/EVTX parser. It only demonstrates fixture analysis. It cannot verify Windows tokens, DACL behavior, Defender, live event channels or the PowerShell runtime.

### Predictions and expected results

The wrong wildcard filter returns Records **3, 4 and 7**. Record 7 deliberately has the invented event ID 14624 and a training provider. An identifier merely containing 4624 is not event 4624. Numeric equality and the correct provider return Records **3 and 4**.

Records 1 and 2 show failed network logons on LAB-WIN. Record 3 shows a successful network logon there for `labstudent`, session `0x42`. Record 4 is another host with the same account label and numeric session ID. It must not be conflated with LAB-WIN.

The matching process event for `(LAB-WIN, 0x42)` is **Record 5: powershell.exe**. Record 6 is a different local maintenance session. The host/session match supports a relationship; it does not establish malicious intent, show the command line or prove who operated the account. Logon type 3 is network access, not a claim of an interactive RDP desktop. Time proximity alone does not prove how the process was launched.

### Challenge the explanation

1. Change the target host to LAB-OTHER: expect no matching process event.
2. Change the logon ID to 0x99 on LAB-WIN: expect Record 6, not Record 5.
3. Explain why a search for only the account name merges unrelated sessions.
4. Propose the additional data needed: named XML fields, process parentage/command line, source host, user confirmation, audit configuration and retention window.
5. Describe why no matching 4688 event would not prove a process never ran.

## Capstone report and readiness checks

Write a report containing scope, sources, the observed timeline, two alternative hypotheses, missing telemetry, a containment proposal, and a targeted fix with verification. Include your own ACL baseline/change/restoration evidence. Keep the proposed response hypothetical for this synthetic case.

You are ready for the next phase when you can explain without copying:

- How a token and DACL combine to decide access, and why an administrator's read test is insufficient for a standard user.
- How control over a service's executable can cross a privilege boundary; what permissions and execution context you must verify.
- Why a listener, a firewall rule and actual reachability are different observations.
- How to correlate events without treating a suspicious sequence as proof.
- Why antivirus, at-rest encryption, patching and authorization are different controls.

## Becoming highly proficient: further practice, not a mastery claim

This phase provides a substantial Windows client foundation. Advanced Windows and enterprise security still require deeper practical work. Progress in this order:

1. **Repeat client administration and authorization:** use two disposable local accounts, test inherited and explicit file permissions, preserve normal access, and document rollback. Inspect a harmless task/service in an isolated lab before attempting any controlled misconfiguration exercise.
2. **Build reliable telemetry:** establish an audit baseline, generate benign activity, collect and compare live named event fields, then investigate collection gaps. Add Sysmon only after checking its availability and supported installation for your actual Windows build and architecture. It supplies telemetry, not automatic prevention.
3. **Create a separate AD lab:** compatible Windows Server domain-controller guest, supported client edition, private DNS/networking, snapshots and separate credentials. On Apple Silicon, validate the Server/hypervisor architecture route before investing time in installation. Never connect a training domain to a real organizational domain.
4. **Practice domain authorization and policy:** users/groups/OUs, scoped GPOs, Kerberos versus authorization, least-privilege administration and effective-policy verification. Later guided labs can examine credential abuse and lateral movement with explicit scope.
5. **Repeat investigations and hardening:** work from fresh evidence, explain false positives, implement a narrow lab fix, and verify both the original failure and legitimate operations. Then extend into memory/endpoint forensics, application control and enterprise incident response.

These advanced exercises are a progression, not implemented automated labs in this repository yet. Completing the website alone does not establish expert proficiency.

## Official references

- [Windows access-control components](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-components)
- [UAC architecture](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works)
- [PowerShell pipelines](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipelines)
- [Execution policy limitations](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)
- [Windows event queries](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent)
- [Process creation auditing](https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/audit-process-creation)
- [AD DS overview](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview)
- [Kerberos overview](https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-authentication-overview)
