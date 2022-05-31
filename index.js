const fs = require('fs')
const path = require('path')
const copy = require('recursive-copy')

const hasPkgFile = bundler => bundler.mainAsset && bundler.mainAsset.package && bundler.mainAsset.package.pkgfile

function assetCopier (bundler) {
  bundler.on('bundled', async bundle => {
    let pkg
    if (
      hasPkgFile(bundler)
    ) {
      // NOTE: - For parcel-bundler version@<1.8
      pkg = require(bundler.mainAsset.package.pkgfile)
    } else {
      try {
        if (bundler.mainBundle.childBundles.values().next().value) {
          bundle = bundler.mainBundle.childBundles.values().next().value
          pkg = await bundler.mainBundle.childBundles.values().next().value.entryAsset.getPackage()
        } else {
          pkg = await bundler.mainBundle.entryAsset.getPackage()
        }
      } catch (error) {
        console.error(error)
      }
    }

    if (!pkg) {
      console.error('No package.json file found.')
      return
    }

    const assetDir = pkg.assetsPath || 'assets'

    if (fs.existsSync(assetDir)) {
      const bundleDir = path.dirname(bundle.name)

      try {
        await copy(assetDir, bundleDir, { overwrite: true })
      } catch (error) {
        console.error(error)
      }
    } else {
      console.error(`No static assets directory with path "${assetDir}" found.`)
    }
  })
}

module.exports = assetCopier
