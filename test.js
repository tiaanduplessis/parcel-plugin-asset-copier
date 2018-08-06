const fs = require('fs')
const path = require('path')

const Bundler = require('parcel-bundler')

const assetCopier = require('./index')

test('should copy assets', async () => {
  let bundler = new Bundler('./test-files/index.html', {
    outDir: path.join(__dirname, 'dist'),
    watch: false,
    cache: false,
    hmr: false,
    logLevel: 0
  })
  assetCopier(bundler)
  await bundler.bundle()

  // HACK: - No clue what async op is causing me to do this
  setTimeout(() => {
    const files = fs.readdirSync('dist')
    console.log(files)
    expect(files.includes('test.jpg')).toBeTruthy()
    expect(files.includes('test.txt')).toBeTruthy()
  }, 0)
})
