const utils = require('./utils')

// let pendingUrls = ['https://www.ing.es/']
let pendingUrls = ['https://www.danielvivar.com/']
const visitedUrls = []
const brokenUrls = []

const domainWhitelist = [
  // 'ing.es'
  'danielvivar.com'
]

const filetypeBlacklist = [
  'pdf',
  'jpg'
]

async function main () {
  while (pendingUrls.length) {
    const thisUrl = pendingUrls.pop()
    visitedUrls.push(thisUrl)
    console.log('Visiting: ', thisUrl)
    console.log('Pending: ', pendingUrls.length)
    const extractedUrls = await utils.getPageHrefs(thisUrl, domainWhitelist, filetypeBlacklist, brokenUrls)
    const newUrls = extractedUrls.filter(url => !visitedUrls.includes(url))
    pendingUrls = [...new Set(pendingUrls.concat(newUrls))]
  }

  console.log('Visited URLs: ', visitedUrls)
  console.log('Broken URLs: ', brokenUrls)

  await utils.minimiseImages()
  await utils.zipImages()
}

main()
