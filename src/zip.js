const path = require('path')
const signale = require('signale')
const zip = require('bestzip')

const destPath = path.join('output')

async function zipBackup () {
  const fileName = `backup-${new Date().toISOString().replace(':', '-')}.zip`

  zip({ source: destPath, destination: fileName })
    .then(() => signale.star({ prefix: '[ZIP BACKUP]', message: `Images zipped in ${fileName}` }))
    .catch((err) => {
      console.error(err)
    })
}

async function main () {
  await zipBackup()
  process.exit(0)
}

main()
