const path = require('path')
const signale = require('signale')
const { zip } = require('zip-a-folder')

const destPath = path.join('output')

function getDateString () {
  const date = new Date()
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`
}

async function zipBackup () {
  try {
    const fileName = `backup-${getDateString()}.zip`
    await zip(destPath, path.join(fileName))
    signale.success({ prefix: '[ZIP BACKUP]', message: `Images zipped in ${fileName}` })
  } catch (e) {
    signale.fatal(e)
    signale.error({ prefix: '[ZIP BACKUP]', message: 'Error zipping images' })
  }
}

async function main () {
  signale.star({ prefix: '[ZIP BACKUP]', message: 'Zipping images' })
  await zipBackup()
  process.exit(0)
}

main()
