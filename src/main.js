const utils = require('./utils')
const { performance } = require('perf_hooks')

let pendingUrls = ['https://www.ing.es/']
const visitedUrls = []
const brokenUrls = []

const domainWhitelist = [
  'ing.es'
]

const filetypeBlacklist = []

const destinationFolder = 'output'

async function main () {
  const executionStart = performance.now()

  console.log('ing-es-cms-crawler starting...\n')

  utils.createDirectories(destinationFolder)

  // Extract URLs from robots
  pendingUrls = pendingUrls.concat(await utils.extractURLsFromRobots())

  while (pendingUrls.length) {
    const thisUrl = pendingUrls.pop()
    visitedUrls.push(thisUrl)
    console.log('Visiting: ', thisUrl)
    console.log('Pending: ', pendingUrls.length)
    const extractedUrls = await utils.getPageHrefs(thisUrl, domainWhitelist, filetypeBlacklist, brokenUrls, destinationFolder)
    const newUrls = extractedUrls.filter(url => !visitedUrls.includes(url))
    pendingUrls = [...new Set(pendingUrls.concat(newUrls))]
  }

  console.log('Visited URLs: ', visitedUrls)
  console.log('Broken URLs: ', brokenUrls)

  await utils.minimiseImages(destinationFolder)
  await utils.zipBackup(destinationFolder)

  const executionTime = performance.now() - executionStart
  const executionObject = {
    min: Math.floor(executionTime / 60000),
    sec: Math.round(executionTime % 60000 / 1000)
  }

  console.log(`Executed in ${executionObject.min ? executionObject.min + ' min' : ''} ${executionObject.sec} sec`)
  console.log('\ning-es-cms-crawler finished\n')

  process.exit(0)
}

main()
