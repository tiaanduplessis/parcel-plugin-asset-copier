/* eslint-env jest */
jest.mock('recursive-copy', () => jest.fn(), { virtual: true })

const fs = require('fs')
const path = require('path')
const copy = require('recursive-copy')
const assetCopier = require('./index')

const createBundle = (name, pkg, children = []) => ({
  name,
  entryAsset: { getPackage: jest.fn().mockResolvedValue(pkg) },
  childBundles: new Set(children)
})

const runBundled = (mainBundle, mainAsset) => {
  const bundler = { mainBundle, mainAsset, on: jest.fn() }
  assetCopier(bundler)
  expect(bundler.on).toHaveBeenCalledWith('bundled', expect.any(Function))
  return bundler.on.mock.calls[0][1](mainBundle)
}

beforeEach(() => {
  copy.mockReset().mockResolvedValue([])
  jest.spyOn(fs, 'existsSync').mockReturnValue(true)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

test.each([null, undefined])('falls back to the main bundle when the first child entryAsset is %s', async entryAsset => {
  // Parcel 1 creates sibling bundles (including source maps) without entry assets.
  const child = { name: path.join('dist', 'maps', 'main.js.map'), entryAsset }
  const main = createBundle(path.join('dist', 'main.js'), { assetsPath: 'static' }, [child])

  await runBundled(main)

  expect(main.entryAsset.getPackage).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledWith('static', 'dist', { overwrite: true })
  expect(console.error).not.toHaveBeenCalled()
})

test('uses the first child entry asset and its output directory when available', async () => {
  const child = createBundle(path.join('dist', 'child', 'index.html'), { assetsPath: 'child-assets' })
  const main = createBundle(null, { assetsPath: 'main-assets' }, [child])

  await runBundled(main)

  expect(child.entryAsset.getPackage).toHaveBeenCalledTimes(1)
  expect(main.entryAsset.getPackage).not.toHaveBeenCalled()
  expect(copy).toHaveBeenCalledWith('child-assets', path.join('dist', 'child'), { overwrite: true })
  expect(console.error).not.toHaveBeenCalled()
})

test('falls back to the main entry rather than a later child when the first child has no entry', async () => {
  const laterChild = createBundle(path.join('dist', 'other', 'lazy.js'), { assetsPath: 'other-assets' })
  const main = createBundle(path.join('dist', 'main.js'), { assetsPath: 'main-assets' }, [
    { name: path.join('dist', 'main.js.map'), entryAsset: null },
    laterChild
  ])

  await runBundled(main)

  expect(laterChild.entryAsset.getPackage).not.toHaveBeenCalled()
  expect(copy).toHaveBeenCalledWith('main-assets', 'dist', { overwrite: true })
})

test('uses the main entry when there are no children and defaults to the assets directory', async () => {
  const main = createBundle(path.join('dist', 'main.js'), {})

  await runBundled(main)

  expect(main.entryAsset.getPackage).toHaveBeenCalledTimes(1)
  expect(fs.existsSync).toHaveBeenCalledWith('assets')
  expect(copy).toHaveBeenCalledWith('assets', 'dist', { overwrite: true })
})

test('preserves the package-file lookup for Parcel versions older than 1.8', async () => {
  const bundle = { name: path.join('legacy-dist', 'index.html') }

  await runBundled(bundle, { package: { pkgfile: path.join(__dirname, 'package.json') } })

  expect(copy).toHaveBeenCalledWith('test-files/assets', 'legacy-dist', { overwrite: true })
  expect(console.error).not.toHaveBeenCalled()
})

test.each([{}, { package: {} }])('uses the current bundle API when the legacy main asset is %j', async mainAsset => {
  const main = createBundle(path.join('dist', 'main.js'), { assetsPath: 'static' })

  await runBundled(main, mainAsset)

  expect(main.entryAsset.getPackage).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledWith('static', 'dist', { overwrite: true })
})

test.each([null, undefined])('reports a missing package when the lookup returns %s', async pkg => {
  const main = createBundle(path.join('dist', 'main.js'), pkg)

  await runBundled(main)

  expect(console.error).toHaveBeenCalledTimes(1)
  expect(console.error).toHaveBeenCalledWith('No package.json file found.')
  expect(copy).not.toHaveBeenCalled()
})

test('reports a missing child package without switching to the main package', async () => {
  const child = createBundle(path.join('dist', 'child', 'index.html'), null)
  const main = createBundle(null, { assetsPath: 'static' }, [child])

  await runBundled(main)

  expect(main.entryAsset.getPackage).not.toHaveBeenCalled()
  expect(console.error).toHaveBeenCalledWith('No package.json file found.')
  expect(copy).not.toHaveBeenCalled()
})

test('reports a rejected package lookup and does not copy assets', async () => {
  const main = createBundle(path.join('dist', 'main.js'), {})
  const error = new Error('Cannot read package.json')
  main.entryAsset.getPackage.mockRejectedValue(error)

  await runBundled(main)

  expect(console.error).toHaveBeenNthCalledWith(1, error)
  expect(console.error).toHaveBeenNthCalledWith(2, 'No package.json file found.')
  expect(copy).not.toHaveBeenCalled()
})

test('reports a missing assets directory', async () => {
  const main = createBundle(path.join('dist', 'main.js'), { assetsPath: 'missing-assets' })
  fs.existsSync.mockReturnValue(false)

  await runBundled(main)

  expect(console.error).toHaveBeenCalledWith('No static assets directory with path "missing-assets" found.')
  expect(copy).not.toHaveBeenCalled()
})

test('reports a copy failure', async () => {
  const main = createBundle(path.join('dist', 'main.js'), {})
  const error = new Error('Cannot copy assets')
  copy.mockRejectedValue(error)

  await runBundled(main)

  expect(console.error).toHaveBeenCalledTimes(1)
  expect(console.error).toHaveBeenCalledWith(error)
})

test('waits for asset copying to finish', async () => {
  const main = createBundle(path.join('dist', 'main.js'), {})
  let finishCopy
  let startCopy
  const started = new Promise(resolve => { startCopy = resolve })
  copy.mockImplementation(() => {
    startCopy()
    return new Promise(resolve => { finishCopy = resolve })
  })
  let finished = false
  const copying = runBundled(main).then(() => { finished = true })
  await started
  await new Promise(resolve => setImmediate(resolve))

  expect(copy).toHaveBeenCalledTimes(1)
  expect(finished).toBe(false)
  finishCopy([])
  await copying
  expect(finished).toBe(true)
})

test('copies again after a watch rebuild with a new package configuration', async () => {
  const main = createBundle(path.join('dist', 'main.js'), { assetsPath: 'first-assets' }, [
    { name: path.join('dist', 'main.js.map'), entryAsset: null }
  ])
  const bundler = { mainBundle: main, on: jest.fn() }
  assetCopier(bundler)
  const onBundled = bundler.on.mock.calls[0][1]

  await onBundled(main)
  main.entryAsset.getPackage.mockResolvedValue({ assetsPath: 'second-assets' })
  await onBundled(main)

  expect(copy).toHaveBeenCalledTimes(2)
  expect(copy).toHaveBeenNthCalledWith(1, 'first-assets', 'dist', { overwrite: true })
  expect(copy).toHaveBeenNthCalledWith(2, 'second-assets', 'dist', { overwrite: true })
  expect(console.error).not.toHaveBeenCalled()
})
