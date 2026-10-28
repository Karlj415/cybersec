# CyberPath TODO

Handoff notes for the next working session. Read this whole file before starting.

## Context

CyberPath is a no-build cybersecurity course for complete beginners: one `index.html` (68 lessons in 11 phases), local labs in `labs/`, tests in `tests/`. See `README.md` for how it works.

- **Where lessons live:** in `index.html` inside `const PHASES=[...]`. Each lesson is one line of valid JSON, so edit lessons by parsing and rewriting that line with a script. Hand-editing those long lines is error-prone.
- **Lesson fields:** `id`, `t` (title), `m` (minutes), `a` (analogy), `b` (3 paragraphs), `terms`, `lab` (exactly 3 steps), `quiz` (exactly 3 questions of `[question, [3 options], correctIndex]`), `prerequisites`, optional `links`, `deepDive`, `explanations`.
- **Reading lessons:** lessons without a video set `readingFirst: true` and need `links`, a `deepDive` longer than 500 characters, and one `explanations` entry per quiz question.
- **Answer positions:** `orderedOptions()` in `index.html` shifts each question's displayed options by `(lesson number + question index) % 3`. Tests require the displayed answer letters to be balanced, and no single letter may pass more than 5 lessons. For new lessons, give each question's correct answer a different displayed letter.
- **Lesson IDs are permanent:** they are stored in learners' saved progress. Never renumber or reuse an ID. New lessons get new IDs (next free: `l69`).
- **Audience:** complete beginners. Match the tone of the early phases: an everyday analogy, plain words, and a short definition for every new term. For every command, explain what it does and what the learner should expect to see.
- **Labs:** required labs stay on localhost or inside the learner's own VM. They must not need any external account.

Run all checks before and after changes:

```bash
npm test             # curriculum structure, quiz balance, links, backups
npm run test:labs    # JavaScript, SQL and Windows-fixture labs
npm run test:browser # Playwright: renders every lesson at 320px and 1280px
```

Tests hardcode the lesson count (`tests/curriculum.test.cjs`, `tests/interactions.test.cjs`). Update these when adding lessons, along with the counts in `README.md`.

Nothing has been committed since the initial commit. Do not commit unless the user asks.

## 1. Verify the Windows phase against a real Windows VM (done 2026-10-27)

The 10 Windows lessons (`l50`-`l59`, Phase 7) were rewritten for beginners without access to Windows. Every command and every "What you should see" claim needs checking against real output.

**Results files:**
- The user runs `scripts/verify-windows-lessons.ps1` inside their Windows 11 VM (Parallels, Apple Silicon, so ARM64), once in a normal window and once as administrator.
- Output lands in `scripts/windows-verify-normal.txt` (received 2026-10-27, Windows 11 Home ARM64 build 26200 in Parallels) and `scripts/windows-verify-admin.txt` (received 2026-10-27). These are gitignored because they contain machine details.
- If the files are missing, ask the user to run the script. The steps are in the script header. Parallels needs `~/Developer/cybersec` shared with the VM; the share (only this folder, read-write) was turned on 2026-10-27; it appears in the VM as `\\Mac\cybersec`. `prlctl exec` and `prlctl set` don't work on their Parallels edition, so the user has to run it by hand.

**Check each claim against the output.** Each section header (for example `===== l53 NTFS exercise =====`) names its lesson. Specific claims to confirm:

- [x] **l50:** Confirmed 2026-10-27 (normal run). Extra finding, now in the lesson: `WindowsProductName` says `Windows 10 Home` on build 26200 (Windows 11); lesson now says build 22000+ means Windows 11.
- [x] **l51:** Confirmed. (`Get-ExecutionPolicy -List` showed `Process Bypass` only because of how the script was launched; all other scopes `Undefined`.)
- [x] **l52:** Confirmed both halves: normal window Medium + Administrators deny only; admin window High + Administrators enabled (also `Group owner`); same SID. Admin `whoami /priv` lists 24 privileges vs 5.
- [x] **l53:** Was a MISMATCH, now fixed. `(I)` entries and `Everyone:(R)` without `(I)` confirmed. The SDDL comparison printed False in both runs because the first DACL change adds the `AI` flag (`D:(` becomes `D:AI(`), while access rules and `icacls` text were identical. Lesson, lab guide and script now compare `icacls` lists; that comparison printed True in both runs (diagnostics section). Admin-created files are owned by `BA`, not the user. Re-run the script once to see the new exact block print True.
- [x] **l54:** Confirmed; the `-Filter` quoting works. Lesson now notes `C:\WINDOWS` may print in capitals and that the Run key output includes PSPath/PSDrive label lines.
- [x] **l55:** Confirmed: `NotConfigured` on all three profiles, port-filter pipeline works, loopback test `TcpTestSucceeded False` (with `PingSucceeded True`, now explained in the lesson).
- [x] **l56:** Confirmed. Normal window: line 1 "unauthorized operation", line 2 a misleading "No events were found" (lesson now warns). Admin window: Security log enabled (33,889 records), 4624 events present (plus one 4625), no 4688 among the 10 newest matches.
- [x] **l57:** Confirmed (`Normal`, rows returned).
- [x] **l58:** Confirmed.
- [x] **l59:** Confirmed, including `analyze-events.ps1` run from the `\\Mac\cybersec` share.

**Fixing mismatches:**
- Wherever real output differs, fix the lesson text (in `index.html`, edited as described in Context) or the command, then rerun the tests.
- If a command fails on ARM64 Windows, say so in the lesson and give the Settings / Event Viewer fallback.
- Record anything that differs on Intel/AMD, VirtualBox or other Windows editions as an open question; don't guess.
- When done, remove the "Windows native commands have not been executed" caveats from `README.md` and `labs/windows/README.md` for whatever was verified.

**Result (2026-10-27):** no command failed on ARM64. Fixed text in l50, l53, l54, l55, l56. The README caveat now names what was verified.

**Open questions (not checked, don't guess):**
- Intel/AMD guests, VirtualBox, UTM, and Pro/Enterprise editions. Only Windows 11 Home ARM64 build 26200 on Parallels was run.
- Whether `WindowsProductName` still says "Windows 10" on other builds or editions.
- Whether process-creation auditing (4688) is on by default on Enterprise evaluation images (the lesson's recommended route); it was off on this Home VM.
- The lesson setup routes are VirtualBox and UTM, but the verification VM was Parallels. The l50 setup steps themselves are unverified.
- Optional confirmation: re-run the script once to see the rewritten l53 block print `True` directly (the diagnostics already showed the same comparison printing True).

## 2. Add the missing web-security lessons (done 2026-10-27)

XSS, CSRF and IDOR (broken access control) are named in Phase 4-5 lessons and quizzes, but no lesson teaches them. `l32` (SQL injection) says they "deserve their own deeper lessons", and `l23` points forward to XSS.

- [x] Add beginner lessons after `l32` in Phase 5: one on XSS, and one on access control (IDOR) and CSRF. Follow the `l32` pattern: plain explanation, a small localhost-only lab under `labs/` with a "before" and "fixed" version, Node tests, and a lab README.
- [x] Teach the fix, not just the bug: output encoding for XSS; server-side ownership checks for IDOR; CSRF tokens and SameSite cookies for CSRF. Keep any demo harmless and visible only on the learner's own page.
- [x] Bind the labs to `127.0.0.1` only, and use ports that don't clash with existing labs (8765 course, 8766 SQL lab, 8000 enum/Burp labs).
- [x] Update the `l32` and `l23` text and the prerequisite chain. `l33` currently requires `l32`; point it at the new last lesson.
- [x] Watch the browser test that searches for `csrf` and expects exactly one result (`tests/browser.spec.cjs`). Update it deliberately; don't just delete it.
- [x] Optionally point `l41` (Burp Suite) at the new lab instead of the static file server.

Result: `l62` (XSS, `labs/xss/`, port 8767) and `l63` (IDOR + CSRF, `labs/access-control/`, ports 8768 shop / 8769 pretend attacker). Both have Node tests and Playwright specs (`tests/xss-lab.spec.cjs`, `tests/access-control-lab.spec.cjs`). The `csrf` search test now expects two cards (`l32` and `l63`). `l41` now uses the XSS lab in Repeater.

Open questions:
- The SameSite step (attacker page via `localhost:8769` is cross-site to `127.0.0.1:8768`) is verified in Chromium and, on 2026-10-27, in Firefox 154 inside the Ubuntu VM (headless, via WebDriver BiDi), along with IDOR, both CSRF cases and the XSS payload. Safari is unchecked.
- Neither lab has been run inside the Ubuntu VM yet. Add them to the item 3 walkthrough.

## 3. Walk the Linux path in a fresh Ubuntu VM (done 2026-10-27)

Walked over SSH in the user's Parallels VM. Despite its name (`Ubuntu 24.04.3 ARM64`) it runs **Ubuntu 26.04.1 LTS** on aarch64, upgraded from 24.04 rather than freshly installed (has `/var/log/dist-upgrade`), 3.3 GB RAM. The SSH key and a temporary sudoers file `/etc/sudoers.d/cyberpath-temp` were added for this; remove the sudoers file (or restore the user's `before CyberPath` snapshot) when done.

- [x] Every terminal step from `l16` onward run (GUI-only browser/DevTools steps were not). Matched: l16-l21, l30, l43, l44, l45, l47, l60, l61, l49 (all printed output identical), all 22 lab tests, the learner-patch failure counts (SQL 3, XSS 1, access-control 2). apt `nodejs` on 26.04 is 22.22.1, as l60 says. SQLite prints an ExperimentalWarning, already covered.
- [x] Firefox 154 in the VM: IDOR, CSRF, SameSite and XSS behave as the lessons and READMEs describe.
- [x] `l42`: MISMATCH, fixed. Ubuntu's john 1.9.0 has no `--help` (prints `Unknown option`) and supports only descrypt/bsdicrypt/md5crypt/bcrypt/LM/AFS/tripcode, so `$6$` gives `No password hashes loaded` and `--format=crypt` is "Unknown ciphertext format". Lesson now uses `john | head -20` and `openssl passwd -1` (md5crypt), which cracks instantly; explains `$1$` vs `$6$`/`$y$`, the pot file and `--show`.
- [x] `l34`: MISMATCH, fixed. The prompt is "Should non-superusers be able to capture packets?" (default No). Yes sets `dumpcap` to group `wireshark` with capabilities, but does not add the user: a non-member gets "Permission denied". After `sudo usermod -aG wireshark $USER` and a new login, `dumpcap` captured as a normal user and `dns`/`http` filters worked (Wireshark 4.6.4). neverssl.com answered from the VM (about 2.7 s).
- [x] `l46`: Confirmed. JDK 25 for Ghidra 12.2 (2026-10-22); `openjdk-25-jdk` installs on 26.04. 12.2 ships natives only for `linux_x86_64` and `win_x86_64`; the user ran `./gradlew buildNatives`, which produced aarch64 `decompile`/`sleigh` in `build/os/linux_arm_64/`. Headless analysis of `hello` then decompiled `main` as `undefined8 main(void) { puts("CyberPath"); return 0; }`; lesson now shows that and uses `undefined8` vs `int` as the example difference. Only checked headless (`analyzeHeadless` + a decompile script), not by clicking through the GUI.
- [x] `l33`/`l21`: `/var/log/auth.log` exists and `rsyslog` is installed, but this VM was upgraded from 24.04. Open question: does a fresh 26.04 Desktop install still ship rsyslog? The `journalctl` fallback covers either case.
- [x] `l11`, `l15`: now say which `ip a` line to read (`inet` under the adapter, not `lo`), give VM examples (`10.211.55.17` Parallels, `10.0.2.15` VirtualBox), and that the gateway follows `default via`.
- [x] Also fixed: `l35` names the expected `631/tcp open ipp` (CUPS, bound to 127.0.0.1); `l40` says to install `curl` if missing (it was) and explains Nmap's `http-alt` / "unrecognized" fingerprint for port 8000; `l41` says to pick Burp's Linux (ARM64) download (`burpsuite_community_linux_arm64_v2026_3_3.sh` exists; not installed).
- Open questions: Burp install and its built-in browser on ARM64 (not run); VirtualBox/UTM networking defaults beyond the well-known `10.0.2.15`; whether a non-upgraded 26.04 VM shows the same `nmap localhost` result.

## 4. Smaller items (done 2026-10-27, except publishing)

- [x] Videos for reading lessons. Added 9 (checked via oEmbed, embeddable, titles exact; picked by search results, channel, length and description, **not watched end to end**): l51 TechThoughts pipeline, l54 TechKnowSurge services (new upload, only ~200 views), l55 Messer firewall, l56 Jon Good Event Viewer, l57 Messer Windows security settings, l58 CBT Nuggets Active Directory, l59 MyDFIR event logs, l62 PwnFunction XSS, l63 PwnFunction CSRF (2019, predates SameSite=Lax defaults; the lesson text covers SameSite). `readingFirst` removed from those 9; counts are 57 videos in tests, README and the in-app note. Left as reading lessons because nothing fit closely: l60, l61, l49 (JavaScript), l50 (VM setup: candidates cover one route only), l52 (UAC candidates mostly show turning UAC off), l53 (no NTFS-specific beginner video found).
- [x] `npm run test:external`: 70 URLs, 57 videos, no hard failures. neverssl.com answers in 0.7-20 s; kept, because it has no HTTPS version so browsers cannot auto-upgrade it (example.com would be upgraded and show no HTTP in Wireshark). The checker now tries 3 times. The 5 TryHackMe 429s were checked in a real browser: all load (Nmap, Metasploit: Introduction, Linux PrivEsc, Intro to Malware Analysis, Paths).
- [x] Lesson text names lessons/phases instead of numbers (l18, l25, l28, l33, l34, l36, l41, README). New test `lesson text names other lessons and phases instead of numbering them` prevents regressions.
- [x] `l47`: step 3 no longer repeats `sha256sum hello`; it reuses the hash from step 2.
- [ ] Consider publishing the repo (for example GitHub) so "copy the course into the VM" becomes `git clone`. If so, update `l60` and the lab READMEs. Needs the user's decision (public vs private, licence, repo name).

## 5. Arch Linux & Omarchy phase (added 2026-10-28)

New Phase 7 between Defensive Security and Windows (Windows, Pen Testing and Reverse Engineering are now Phases 8-10). Lessons `l64`-`l68`, all reading lessons: VM setup, pacman, the AUR, updates and snapshots, auditing security defaults. Lab guide with the full verification table: `labs/arch/README.md`. Inert AUR review sample: `labs/arch/aur-review/` (a test checks every URL in it ends in `.invalid` and that no file is named `PKGBUILD`).

- [x] Every lesson command run over SSH in Try Omarchy 1.3.0 (Omarchy 4.0.0.r7350 edge, aarch64), as a normal user and with a 1-hour passwordless sudo grant. Mismatches fixed before writing: `/etc/os-release` says `NAME="Omarchy"` / `ID_LIKE=arch` (not "Arch Linux"); `yay -G yay` fails on Omarchy (yay comes from the `omarchy` repo), lesson uses `git clone https://aur.archlinux.org/yay.git`; `pacman -Qkk openssh` needs sudo (false "1 altered file" otherwise); SSH is turned off with Remove > Security > SSHD, not by re-running Setup; the Try Omarchy disk has no LUKS.
- [ ] **Kernel stayed old after update + reboot** (set aside by the user on 2026-10-28). Running `7.2.8-23-omarchy`, installed `linux-omarchy 7.3-4`, before and after `omarchy update` and a reboot. `/boot` is root-only and the sudo grant ended at reboot, so `/boot/limine.conf` was not read. Next step: with sudo, read `/boot/limine.conf` and check which kernel entry is the default. Possibly a Try Omarchy/edge issue; report upstream if so.
- [ ] Booting an older snapshot from the Limine menu (and how to reach that menu in Try Omarchy) not tried.
- [ ] `omarchy pkg add nmap` not run (the command and `extra/nmap 7.992-1` exist).
- [ ] Intel/AMD route (Omarchy ISO in VirtualBox/VMware, signature check, encryption prompt) not run at all.
- [ ] Videos: none chosen; all five are reading lessons. Only add one if it matches Omarchy 4 (the menu moved to Super + Space and SSH became opt-in in v4, so older Omarchy videos teach the wrong keys).
- [x] Cleanup in the user's VM (2026-10-28): throwaway key deleted from the Mac and removed from the VM's `authorized_keys`; the user's own `id_ed25519` is now the only authorized key. Note: Try Omarchy's Add SSH forward did not persist (the VM's `settings.json` has no port-forward entry), so the 2222 forward was added live via QEMU's monitor and lasts until the VM shuts down.

## 6. Quiz explanations (done 2026-10-28)

- [x] Authored explanations for the 47 lessons that had none (l01-l48 except l32): 141 entries, each saying why the right answer is right and, where it helps, why the tempting wrong one is not. `tests/curriculum.test.cjs` now requires one explanation per quiz question for every lesson.
- [x] README "Remaining verification" rewritten: it listed the Windows and Ubuntu walkthroughs as not done.

