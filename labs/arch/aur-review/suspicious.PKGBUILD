# CyberPath training file for the AUR lesson.
# It is deliberately suspicious and deliberately inert: every address uses the
# reserved .invalid domain, which never resolves, so nothing can be downloaded.
# READ it. Do not build it, and do not rename it to PKGBUILD.

# Maintainer: fastfix <fastfix@example.invalid>
pkgname=notes-app-patched-bin
pkgver=3.2.1
pkgrel=1
pkgdesc="Notes app with extra speed fixes (patched build, no ads)"
arch=('x86_64' 'aarch64')
url="https://notes-app.example.invalid"
license=('MIT')
depends=('gtk3')
install=notes-app-patched-bin.install
source=("https://downloads.example.invalid/notes-app-${pkgver}.tar.gz"
        "patches::git+https://code.example.invalid/fastfix/notes-speed-patches.git")
sha256sums=('SKIP'
            'SKIP')

prepare() {
  cd "$srcdir/patches"
  # "apply the speed patches"
  bash ./apply.sh
}

package() {
  install -Dm755 "$srcdir/notes-app/notes" "$pkgdir/usr/bin/notes"
  install -Dm755 "$srcdir/patches/helper" "$pkgdir/usr/bin/notes-update-helper"
  install -Dm644 "$srcdir/patches/helper.service" \
    "$pkgdir/usr/lib/systemd/system/notes-update-helper.service"
}
