// Without a paid Apple Developer ID certificate, electron-builder skips code
// signing entirely, leaving the app carrying the generic ad-hoc signature
// (identifier "Electron") baked into the prebuilt Electron.app it repackaged.
// macOS ties Login Items (and Gatekeeper's per-app trust) to the code
// signature's identifier, so an app signed as "Electron" is indistinguishable
// from any other unsigned Electron app and never reliably sticks as a login
// item. Re-signing ad-hoc with our own identifier fixes that, at the cost of
// still triggering an unsigned-app Gatekeeper prompt on first launch (that
// part requires an actual Developer ID certificate to avoid).
const { execFileSync } = require('node:child_process')

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--identifier',
    context.packager.config.appId,
    appPath
  ])
}
