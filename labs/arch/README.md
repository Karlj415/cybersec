# Arch Linux and Omarchy lab guide

This guide supports the Arch Linux & Omarchy phase. It sits after Defensive Security and before the Windows phase, because it reuses the Linux basics (terminal, permissions, packages, services) and the logging and hardening lessons.

Everything happens in a virtual machine. Installing Omarchy on a real drive wipes that drive.

## Pick a route

### Apple Silicon Mac: Try Omarchy (verified)

1. Download the latest `.dmg` from <https://github.com/omacom/try-omarchy/releases>, drag **Try Omarchy** to Applications and open it. You need macOS 15 or newer and about 15 GB free.
2. Choose **Launch Omarchy**. The first launch downloads about 3 GB.
3. On first boot, Omarchy asks for a username, password, keyboard and time zone.
4. The **Command** key acts as Super while the Omarchy window has focus. If Command + Space opens Spotlight instead of the Omarchy menu, grant Accessibility in the launcher.

Facts that matter for the lessons:

- It runs the official `aarch64` Omarchy in QEMU. ARM packages come from Arch Linux ARM (the `alarm` repository).
- Omarchy publishes ARM builds on its **edge** channel only, so this VM gets new Arch packages as soon as they appear.
- The VM lives in `~/Library/Application Support/Try Omarchy/VM/v1`. If the VM does not boot, read `shell/console.log` there.
- To reach the VM from the Mac, add a forward in **Setup > Try Omarchy Settings > Port Forwarding** (**Add SSH** forwards Mac `127.0.0.1:2222` to guest port 22). The guest reaches the Mac at `10.0.2.2`.
- One Mac folder can be shared; it appears under the same name in the Omarchy home folder. Use it to copy this course into the VM.

### Intel or AMD computer: Omarchy ISO in a VM (not yet verified)

1. Download the ISO from <https://omarchy.org> and its signature (add `.sig` to the ISO URL).
2. Verify the signature. The signing key fingerprint is `40DFB630FF42BCFFB047046CF0134EE680CAC571` (from the Omarchy security manual; confirm it there, not only here).
3. Create a VirtualBox or VMware VM with UEFI enabled, at least 4 GB RAM and a 40 GB disk, and boot the ISO. Secure Boot must be off.
4. The Super key is the Windows key.

Open questions for this route (record what you see, don't guess): whether the installer's full-disk encryption prompt works in VirtualBox, how usable Hyprland is without 3D acceleration, and how to reach the Limine boot menu.

## What was verified and how

On 2026-10-28 every lesson command was run over SSH in **Try Omarchy 1.3.0** on an Apple Silicon Mac (Omarchy `4.0.0.r7350`, edge channel, kernel `7.2.8-23-omarchy`), first as a normal user and then with a temporary one-hour passwordless sudo grant. Results:

| Lesson | Check | Result |
| --- | --- | --- |
| First look | `/etc/os-release` | `NAME="Omarchy"`, `ID=omarchy`, `ID_LIKE=arch`, `VERSION_ID="4.0.0.r7350.ge71dc3f"` |
| First look | `uname -m`, `uname -r` | `aarch64`, `7.2.8-23-omarchy` |
| pacman | `pacman -Qo /usr/bin/ssh` | `/usr/bin/ssh is owned by openssh 10.6p1-2` |
| pacman | `pacman -Qi openssh` | `Validated By : Signature`; packager `Arch Linux ARM Build System` |
| pacman | `pacman -Qkk openssh` | as a normal user: `1 altered file` (cannot read the root-only `ssh-keysign`); with sudo: `89 total files, 0 altered files` |
| pacman | `/etc/pacman.conf` | `SigLevel = Required DatabaseOptional`, `LocalFileSigLevel = Optional`; repositories `[omarchy]`, `[core]`, `[extra]`, `[alarm]` |
| pacman | update guard | hook at `/usr/share/libalpm/hooks/00-omarchy-update-guard.hook` runs `omarchy-update-pacman-guard` before any upgrade. A direct `sudo pacman -Syu` on an up-to-date system printed only `there is nothing to do`, so the guard's refusal message itself was not seen |
| pacman | `pacman -Ss '^nmap$'` | `extra/nmap 7.992-1` |
| AUR | `yay -G yay` | **fails** on Omarchy: yay comes from the `omarchy` repo, so yay looks for an official Arch recipe. `git clone https://aur.archlinux.org/yay.git` and `yay -Ga yay` both work |
| AUR | real yay PKGBUILD | one GitHub release source, real sha256, `build()`/`package()` run `make`, no `install=` |
| AUR | `pacman -Qm` | `try-omarchy 0.1.0-36` only |
| Updates | `findmnt /` | `/dev/vda2[/@] btrfs` with `compress=zstd:3` |
| Updates | `snapper list` | without sudo: `No permissions.`; with sudo: numbered `single` snapshots, `Cleanup: number`, Omarchy version as description |
| Updates | `omarchy update` | asks "Continue with update?" (`-y` skips it), then: Prune package cache, Create system snapshot, Update Arch signing keys, Update system packages, mise tools, AUR packages. A new snapshot appeared. It ended with "Linux kernel has been updated. Reboot?" |
| Updates | `systemctl --failed`, `pacdiff -o` | `0 loaded units listed.`; no output |
| Hardening | `sudo ufw status verbose` | `Status: active`, `Default: deny (incoming), allow (outgoing), disabled (routed)`, 53317 tcp/udp allowed, two `allow-docker-dns` rules, and with SSHD on `22/tcp LIMIT IN Anywhere # omarchy-sshd` |
| Hardening | `sudo ss -tulpn` | systemd-resolve on 127.0.0.53/54 and 172.17.0.1, cupsd on 127.0.0.1:631, avahi on UDP 5353, sshd on 0.0.0.0:22 and [::]:22 |
| Hardening | Setup > Security > SSHD | asks for a public key, then writes `/etc/ssh/sshd_config.d/10-omarchy-hardening.conf` with `PasswordAuthentication no`. Logins show `Accepted publickey ... from 10.0.2.2`. It is turned off with **Remove > Security > SSHD** (`omarchy-remove-security-sshd`) |
| Hardening | `lsblk -f` | **no LUKS** in Try Omarchy: `vda2` is plain btrfs. The ISO install encrypts by default; that was not checked here |
| Hardening | journal access | the user is in `wheel` and can read the journal without sudo |
| Hardening | passwordless sudo | a reboot ended the timed grant, as the Omarchy manual says |

## Open questions

- **Kernel after reboot.** After `omarchy update` and a reboot, the VM still ran `7.2.8-23-omarchy` while `linux-omarchy 7.3-4` was installed. `/boot` is root-only and the sudo grant had ended, so the Limine entries were not inspected. The lesson tells learners to report a mismatch that survives a reboot, not to expect it.
- **Rollback.** Booting an older snapshot from the Limine menu was not tried. How to reach that menu in Try Omarchy, and in VirtualBox or VMware, is unverified.
- **Installing nmap.** `omarchy pkg add nmap` exists (`omarchy pkg --help`) and `extra/nmap` is in the repositories, but the install itself was not run.
- **Intel/AMD route.** Nothing on the ISO route has been run yet.

## The AUR review sample

`aur-review/suspicious.PKGBUILD` and `aur-review/notes-app-patched-bin.install` are a deliberately suspicious recipe for the AUR lesson. Every address uses the reserved `.invalid` domain, which never resolves, and the file is not named `PKGBUILD`, so `makepkg` will not pick it up by accident. A test in `tests/curriculum.test.cjs` keeps it that way. Read it; do not build it.

Red flags a learner should find (there are more):

1. The name copies a popular app and adds "patched".
2. `sha256sums` are `SKIP` for a fixed-version release archive.
3. A second source labelled `patches::` is a git repository on an unrelated host.
4. `prepare()` runs a script from that repository (`bash ./apply.sh`).
5. `package()` installs an extra `notes-update-helper` program and a systemd service the app does not need.
6. The `.install` file enables that service as root and pipes a downloaded script into `sh`.
7. The maintainer address and URLs do not belong to the real project.

## Cleaning up after verification

If you enabled SSH or passwordless sudo only for this lab:

- **Remove > Security > SSHD** in the Omarchy menu (and let it remove the authorized keys you added).
- Click the red passwordless-sudo icon in the top bar, or reboot, to end a timed grant.
- In Try Omarchy, delete port forwards you no longer need.
