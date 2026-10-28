# CyberPath — From Zero to Cybersecurity

A no-build learning website for complete beginners. It includes 68 lessons in 11 phases, practical exercises, quizzes, and browser-based progress tracking.

## Open the course

The course is online at **https://karlj415.github.io/cybersec/**. Nothing to install; progress is saved in your browser, and **Sign in** syncs it across browsers and VMs.

### Get the lab files into a VM

The practical labs run inside your own VMs, so each VM needs a copy of this repository. No GitHub account is needed.

```bash
git clone https://github.com/Karlj415/cybersec.git ~/cybersec
```

- **Ubuntu or Kali:** install git first if `git --version` says `command not found` (`sudo apt install git`).
- **Omarchy:** git is already installed.
- **Windows:** open https://github.com/Karlj415/cybersec in Edge, choose **Code > Download ZIP** and extract it (the folder is `cybersec-main`).
- **No internet in the VM:** use a shared folder or copy a zip over, as the lessons describe.

### Run it locally

Double-clicking **`index.html`** opens the full reading, practical work, quizzes, and progress tracking. No package installation or build command is needed. For **inline video playback**, use the local server because YouTube blocks embedded players on `file://` pages.

With Node.js installed, open a terminal in the project folder and run:

```bash
node scripts/serve.mjs . 8765
```

Open http://127.0.0.1:8765/ in your browser. Stop the server later with Ctrl+C.

When opened directly from disk, lessons show a video thumbnail and direct YouTube link instead of a broken player. Videos, Google Fonts, and external resource links need an internet connection; system fonts are used if Google Fonts is unavailable.

Browser storage for the website, `file://` and `http://127.0.0.1:8765` is separate. **Sign in** (see [Sync across browsers and VMs](#sync-across-browsers-and-vms)) to share progress between them, or use **Save backup** and **Restore backup**.

## How to study

- Aim for up to **1 hour a day**, usually one or two lessons. The cards number lessons, not days.
- Follow the phases in order because later practical steps use earlier skills.
- Most lessons take 20–30 minutes. VM setup, downloads, and external labs can take an hour or more; taking longer is expected.
- Each lesson follows an analogy, selected video or guided reading, worked explanation, three practical steps, and three quiz questions. Checking the quiz explains why each answer is right.
- 57 of the 68 lessons have a selected video with title, channel, duration, and verification metadata. The eleven without one (the three JavaScript lessons, the Windows VM setup, identity/UAC and NTFS lessons, and the five Arch Linux lessons) use guided reading with official sources, because no video matched them closely; video searches are optional. Use the YouTube fallback if an embed cannot play.
- Every lesson shows **Where you'll work** under its title, and every practical step carries a label for the machine it runs on: Your Mac or Windows PC, Your phone, Notebook (no computer), Ubuntu or Kali VM, Omarchy VM, Windows VM, or Windows PC or Windows VM. The roadmap cards show the same list, and search matches it (for example, search "omarchy vm").
- To complete a lesson, tick all three practical steps and score at least **2/3** in the quiz. Retries have no penalty.
- **Continue** returns to your unfinished lesson when possible, otherwise it finds the next incomplete lesson.

The "What is Linux?" lesson recommends **Ubuntu Desktop in a virtual machine** because later commands, logs, and graphical tools are written for that route. Read its resource checklist before installing anything. JavaScript is the default for application and portable analysis lessons, with PowerShell/Bash for OS-specific work and C for native-binary exercises. WSL and macOS terminals are not identical substitutes. **Kali Linux works for every Linux lesson too.** It was checked on Kali Rolling (ARM64) on 2026-10-28: all local labs pass, and lessons carry an "On Kali:" note where it differs (no `/var/log/auth.log`, no `ufw` until installed, John is the Jumbo edition, and several tools come preinstalled).

Required practical work stays inside **your own practice VM**, using local files, Windows inspection or localhost services. No external platform account, paid room, or remote target is required to complete a lesson. TryHackMe, Hack The Box, and PortSwigger rooms are clearly labeled optional extensions; when using them, stay inside their supplied lab targets and rules.

## Progress and backups

Progress, practical ticks, and quiz scores save automatically in this browser using `localStorage`.

- **Save backup** downloads a JSON progress file with a format version and export date.
- **Restore backup** validates and imports that file. It asks before replacing existing completed lessons.
- **Reset** deletes current progress after confirmation. Save a backup first if you may want it later.
- If saved data is malformed, CyberPath preserves a recovery copy where browser storage is available and shows a warning instead of failing with an empty roadmap.

Clearing browser site data or using private browsing can remove progress. Keep a backup if the work matters to you.

### Sync across browsers and VMs

**Sign in** keeps progress the same in every browser and VM. It is built for one person and needs no server: progress lives in a secret GitHub Gist, and the site talks to the GitHub API directly.

One-time setup, on your own computer:

1. Create a fine-grained token at https://github.com/settings/personal-access-tokens/new with **Account permissions > Gists: Read and write** and nothing else. (A classic token with only the `gist` scope also works.)
2. Run `node scripts/setup-sync.mjs`, paste the token, and choose a passphrase. It creates the gist and writes `sync-config.js`.
3. Commit and push `sync-config.js`.

Then in any browser: **Sign in**, enter the passphrase. You stay signed in on that browser until **Sign out**.

- Changes upload about 1.5 seconds after you make them, and the page pulls the latest copy when it loads or when you come back to the tab.
- Progress already in a browser when you first sign in is merged with the synced copy, not thrown away. If two browsers change things offline, ticks and completions from both are kept.
- **Reset** and **Restore backup** replace the synced copy everywhere.
- `sync-config.js` holds the token and gist id encrypted with your passphrase (PBKDF2-SHA256, 600,000 rounds, then AES-256-GCM). It is public, so the passphrase is the only lock: use a long one. If the token leaks, the worst case is read and write access to your gists.
- After signing in, the decrypted token is kept in that browser's `localStorage`. Every GitHub Pages project under `karlj415.github.io` shares that storage, so only sign in where you trust the scripts.
- New token or new passphrase: run `node scripts/setup-sync.mjs --gist <gist id>` to reuse the same gist, then push and sign in again.

## The path

0. How Computers Actually Work
1. Using a Computer Like a Pro
2. Networking
3. Linux
4. How the Web Works
5. Cybersecurity Fundamentals
6. Defensive Security (Blue Team)
7. Arch Linux & Omarchy — A Second Linux, Hands-On
8. Windows Security — Deep Dive
9. Pen Testing (guided labs only)
10. Reverse Engineering & Next Steps

**Golden rule:** only practise security testing on systems you own or labs that explicitly authorise it, and stay within their instructions and scope. Platform room availability and pricing can change; use the official links in the lessons and check before starting.

## Development checks

The website has no runtime dependencies or build step. The tests use Node.js's built-in test runner; Use Node 24 LTS, or Node 22.13+ on the 22.x line; the code labs use the built-in node:sqlite module.

```bash
npm test
```

The tests validate lesson structure, the complete 57-video catalog, quiz answer indexes and displayed answer positions, resource URLs, practical-step markup, full-content search, backup normalisation, and that required labs do not depend on external accounts. Run `npm install` once to install the development-only DOM test dependency. The website itself still needs no installation. The supplied static server and code labs need Node but no third-party runtime packages.

Run the network-dependent external check separately:

```bash
npm run test:external
```

It verifies every resource URL and every selected video through YouTube's oEmbed endpoint. Sites that deliberately block automated requests are reported as warnings for manual verification. The last full check was completed on **2026-10-27**, when all 57 videos were public, unrestricted, and permitted embedding.

## Browser checks

```bash
npx playwright install chromium
npm run test:browser
```

This checks a 320-pixel viewport, keyboard selection and focus, search, the local-file video fallback, and answer persistence through navigation and reload. It also drives the SQL injection, XSS and access-control lab apps through their real forms. The sync test runs two separate browsers against a fake GitHub Gist API: sign-in, upload, merge, unticking, reset and a revoked token. External requests are blocked in this test; live video playback and screen-reader behavior require manual checks.

Quiz selections and checked feedback now return when reopening a lesson. Changing an answer clears the previous score and feedback until you check again. Existing version 1 backups remain compatible. Restore asks before replacing partial work as well as completed lessons, and rejects unsupported backup versions.

## Remaining verification

Done: every Windows lesson command (Windows 11 ARM64 in Parallels, normal and admin windows, 2026-10-27), every Linux terminal step in an Ubuntu 26.04 ARM64 VM (2026-10-27), the web labs in headless Firefox 154, and every Arch/Omarchy lesson command in Try Omarchy (2026-10-28). Every quiz question now has an authored explanation, and a test enforces it.

Still open:

- Intel/AMD hosts: the Windows lessons in VirtualBox, UTM or an Enterprise edition, and the Omarchy ISO route in VirtualBox or VMware.
- The Mac/UTM route for Ubuntu (the walkthrough used Parallels), and a fresh Ubuntu 26.04 install rather than one upgraded from 24.04.
- Omarchy: booting an older snapshot from the boot menu, and a VM that kept the old kernel after an update and reboot (see [the Arch lab guide](labs/arch/README.md)).
- Safari, live YouTube playback over HTTP, and screen-reader announcements in a real browser.

## Code-first security lab: SQL injection lesson

The SQL injection lesson includes a worked local lab: trace an HTTP input into real JavaScript/SQLite code, observe a private draft leak, compare parameter binding, then patch and retest the code yourself. Quiz feedback explains the reasoning.

Use the Ubuntu VM from the Linux phase (VirtualBox, UTM or Parallels; Kali also works). Copy the project into the VM, then run:

```bash
cd labs/sql-injection
node app.mjs
```

Open http://127.0.0.1:8766 **inside that VM**. Full setup, explanations, expected outputs and the optional Kali-to-app-VM SSH tunnel are in [the lab guide](labs/sql-injection/README.md). No second VM or third-party runtime packages are required.

```bash
npm run test:labs
npm run test:browser
```

The Node.js tests exercise real SQLite and HTTP. The browser suite submits the real lab form with normal names, apostrophes and attack input in both modes. These checks run on the development host; Parallels/UTM guest installation and cross-VM connectivity have not been verified here.

## Code-first security labs: XSS, IDOR and CSRF

Two more labs follow the SQL injection lesson, built the same way: a small local Node app with a vulnerable and a fixed implementation, Node tests that reproduce the bug, and a guide that has the learner patch the code and update the tests.

| Lesson | Lab folder | Address | What the learner fixes |
| --- | --- | --- | --- |
| Cross-site scripting (XSS) | `labs/xss/` | http://127.0.0.1:8767 | Output encoding (`escapeHtml`), then sees what HttpOnly does and does not change |
| Access control: IDOR and CSRF | `labs/access-control/` | shop http://127.0.0.1:8768, pretend attacker page http://127.0.0.1:8769 | Server-side ownership check, CSRF token, and SameSite=Lax as a second layer |

Run each with `node app.mjs` from its folder, inside the VM. See [the XSS guide](labs/xss/README.md) and [the access-control guide](labs/access-control/README.md). All attack demos are harmless and only change the learner's own local page or fictional in-memory data.

The browser suite drives both labs in Chromium: the XSS payload must run in vulnerable mode and stay inert in fixed mode, and the CSRF form must succeed from a same-site page (`127.0.0.1:8769`) but arrive without the session cookie from a cross-site page (`localhost:8769`). The same checks (IDOR, both CSRF cases, the SameSite block from `localhost:8769`, and the XSS payload in both modes) were repeated in headless Firefox 154 inside an Ubuntu 26.04 ARM64 VM on 2026-10-27 and matched. Safari has not been checked; the cookie sets `SameSite=Lax` explicitly rather than relying on browser defaults.

## Arch Linux and Omarchy

A five-lesson phase follows Defensive Security and comes before Windows: setting up an Omarchy VM, pacman and package signatures, reviewing AUR recipes (including the July 2025 AUR malware incident and a deliberately suspicious, inert sample PKGBUILD in `labs/arch/aur-review/`), rolling updates with btrfs snapshots, and auditing Omarchy's security defaults (ufw, listening ports, SSHD, disk encryption, the journal).

On Apple Silicon Macs the route is the Try Omarchy app; on Intel/AMD it is the Omarchy ISO in VirtualBox or VMware. Every lesson command was run in Try Omarchy 1.3.0 (Omarchy 4.0 edge, aarch64) on 2026-10-28 and the text was corrected to match. The Intel/AMD ISO route, snapshot rollback from the boot menu, and a kernel that stayed old after an update and reboot are still open. See [the Arch lab guide](labs/arch/README.md) for the verification table and open questions.

## Prerequisite order and Windows security

Three JavaScript lessons follow the web/API basics and come before the SQL injection lab. Two assume no programming at all and teach values, variables, if/else, functions, arrays, objects and loops with runnable files in `labs/javascript/` (they also cover installing Node.js and copying the course into the VM). The third reads the exact code used in the SQL lab. Each lesson displays links to prerequisites that appear earlier in the roadmap. These are readiness guidance rather than navigation locks.

The ten-lesson Windows phase follows the Arch Linux phase and precedes penetration testing: VM baseline → PowerShell → tokens/UAC → NTFS permissions → services/tasks/Registry → networking/firewall → event logs → hardening → enterprise identity → investigation capstone. Use a Windows guest in VirtualBox, UTM or Parallels for native exercises. The Windows guide explains architecture considerations, live versus synthetic evidence, expected outputs and the longer progression toward enterprise proficiency.

See [the Windows lab guide](labs/windows/README.md). It includes a reversible permissions exercise in the course and a synthetic event dataset with both PowerShell and JavaScript analysis. Every Windows lesson command was run in a normal (non-admin) PowerShell window on a Windows 11 ARM64 guest (Parallels on Apple Silicon, Home edition, build 26200) on 2026-10-27, and the lesson text was corrected to match the real output. Every Windows lesson command was also run in an administrator window. Still unverified: Intel/AMD, VirtualBox, UTM and Enterprise-edition guests. Advanced AD attack/defence and endpoint forensics remain further practice, not completed repository labs.

Existing progress and backups retain their original lesson IDs. Displayed lesson numbers shift as new prerequisites are inserted; prior completions remain recorded, and the new lessons add to the completion total. The video catalog now covers 57 lessons; the eleven reading-based lessons do not claim verified video coverage.
