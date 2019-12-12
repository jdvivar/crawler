const fs = require('fs')
const path = require('path')
const signale = require('signale')
const { execFileSync } = require('child_process')

const QUALITY = 10
const libExec = path.join(__dirname, `../lib/cwebp/${process.platform}/${process.arch}/${process.platform === 'win32' ? 'cwebp.exe' : 'cwebp'}`)

const originPath = path.join('screenshots')
const destPath = path.join('output')

function getFiles (path) {
  try {
    const files = fs.readdirSync(path)
    return files
  } catch {
    signale.error({ prefix: '[OPTIMISE IMAGES]', message: 'Error reading images' })
    return []
  }
}

function compressFile (file) {
  try {
    const input = path.join(originPath, file)
    const output = path.join(destPath, `${file}.webp`)
    execFileSync(libExec, [`-quiet -q ${QUALITY} ${input} -o ${output}`], { shell: true })
    signale.success({ prefix: '[OPTIMISE IMAGES]', message: `Compressing ${file}` })
  } catch {
    signale.error({ prefix: '[OPTIMISE IMAGES]', message: `Error compressing ${file}` })
  }
}

function compressFiles (files) {
  if (!files || files === []) return
  files.map(compressFile)
}

function main () {
  signale.star({ prefix: '[OPTIMISE IMAGES]', message: 'Starting optimisation of images' })
  try {
    compressFiles(getFiles(originPath))
    signale.complete({ prefix: '[OPTIMISE IMAGES]', message: 'Finished optimising images' })
  } catch (e) {
    signale.fatal(e)
  }
  process.exit(0)
}

main()
