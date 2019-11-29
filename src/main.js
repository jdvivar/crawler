const utils = require('./utils')
const { performance } = require('perf_hooks')
const signale = require('signale')

// Only use one, as it will be used by robots parser as origin
let pendingUrls = ['https://www.ing.es/']
const visitedUrls = []
const brokenUrls = []

const domainWhitelist = [
  'ing.es'
]

const filetypeBlacklist = []

const destinationFolder = 'output'

async function main () {
  // Handling premature closing (e.g. Ctrl + C)
  process.on('exit', (code) => {
    if (code !== 0) signale.fatal('Exiting prematurely. Remember to manually close Chromium processes.')
  })

  // Start counting how much time it will take
  const executionStart = performance.now()
  signale.start({ prefix: '[CRAWLER   ]', message: 'ing-es-cms-crawler starting...' })

  // Create needed directories
  utils.createDirectories(destinationFolder)

  // Extract URLs from robots
  pendingUrls = pendingUrls.concat(await utils.extractURLsFromRobots(pendingUrls[0]))

  // Loop through all pending URLs
  while (pendingUrls.length) {
    const thisUrl = pendingUrls.pop()
    visitedUrls.push(thisUrl)
    signale.info({ prefix: '[VISITING  ]', message: thisUrl })
    signale.info({ prefix: '[VISITING  ]', message: `Pending ${pendingUrls.length} URL(s)` })
    const extractedUrls = await utils.getPageHrefs(thisUrl, domainWhitelist, filetypeBlacklist, brokenUrls, destinationFolder)
    const newUrls = extractedUrls.filter(url => !visitedUrls.includes(url))
    pendingUrls = [...new Set(pendingUrls.concat(newUrls))]
  }

  // Inform about visited and broken URLs found
  signale.note({ prefix: '[VISITING  ]', message: `Visited URLs: ${visitedUrls}` })
  signale.note({ prefix: '[VISITING  ]', message: `Broken URLs: ${brokenUrls}` })

  // Compress images in WEBP format and zip everything into a backup file
  await utils.minimiseImages(destinationFolder)
  await utils.zipBackup(destinationFolder)

  // Calculate execution time
  const executionTime = performance.now() - executionStart
  const executionObject = {
    min: Math.floor(executionTime / 60000),
    sec: Math.round(executionTime % 60000 / 1000)
  }
  signale.complete({ prefix: '[CRAWLER   ]', message: `Executed in ${executionObject.min ? executionObject.min + ' min' : ''} ${executionObject.sec} sec` })

  // Closing pupeeteer
  await utils.closePuppeteer()
  process.exit(0)
}

main()
