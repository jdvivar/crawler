const puppeteer = require('puppeteer')
const imagemin = require('imagemin')
const imageminWebp = require('imagemin-webp')
const fs = require('fs')
const request = require('request')
const { zip } = require('zip-a-folder')
const robotsParser = require('robots-parse')
const path = require('path')
const sitemapsParser = require('sitemap-stream-parser')
const MAX_URL_FILENAME_LENGTH = 100

module.exports = {
  getPageHrefs,
  minimiseImages,
  zipBackup,
  extractURLsFromRobots,
  createDirectories
}

async function zipBackup (folder) {
  try {
    const fileName = `backup-${new Date().toISOString()}.zip`
    await zip(folder, fileName)
    console.log(`Images zipped in ${fileName}`)
  } catch {
    console.log('Error zipping images')
  }
}

async function minimiseImages (destination) {
  try {
    await imagemin(['screenshots/*.png'],
      {
        destination: path.join(destination, 'screenshots'),
        plugins: [
          imageminWebp({
            quality: 10
          })
        ]
      }
    )
    console.log('Images optimized')
  } catch {
    console.log('Error optimising images')
  }
}

function getUrlToFileName (url) {
  return url.replace(/\//g, '--').substring(0, MAX_URL_FILENAME_LENGTH)
}

async function takeScreenshot (page, url) {
  try {
    if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots')
    const path = './screenshots/' + getUrlToFileName(url) + '.png'
    await page.screenshot({
      path,
      fullPage: true
    })
    console.log(`Screenshot saved at ${path}`)
  } catch {
    console.log('Screenshot failed')
  }
}

async function firstTimeVisit (url) {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  page.setDefaultTimeout(3000)
  try {
    await page.goto(url)
    // For the cookie notice
    await takeScreenshot(page, 'cookie')
    await page.click('#aceptar')
  } catch {
    console.log('No cookie button')
  }
  return page
}

async function handleUrl (page, url, destinationFolder) {
  if (!url.endsWith('pdf')) {
    const response = await page.goto(url)
    console.log('Status:', response.status())
    if (response.status() < 400) {
      await takeScreenshot(page, url)
      const content = await page.content()
      return content
    } else {
      throw new Error(response.status())
    }
  } else {
    const fileName = `./${destinationFolder}/pdfs/${getUrlToFileName(url)}`
    return new Promise(function (resolve, reject) {
      request
        .get(url, { timeout: 3000 })
        .on('error', function (err) {
          console.log(err)
          reject(err)
        })
        .on('response', () => resolve(''))
        .pipe(fs.createWriteStream(fileName))
    })
  }
}

let page

async function requestHtmlBody (url, brokenUrls, destinationFolder) {
  try {
    if (!page) {
      page = await firstTimeVisit(url)
    }
    return await handleUrl(page, url, destinationFolder)
  } catch (error) {
    console.error(error)
    brokenUrls.push(url)
    return ''
  }
}

function extractAnchorsHrefs (html) {
  const hrefAttrContentPattern = /<a.*?\shref="(?<href>[^>\s]*)"[^>]*>.*?<\/a>/g
  // String.prototype.matchAll available from Nodejs v12
  const matches = [...html.matchAll(hrefAttrContentPattern)]
  return matches.map(match => match.groups.href)
}

function makeAbsoluteUrls (urls, origin) {
  return urls.map(url => url.startsWith('/') ? (origin + url) : url)
}

function filterUrls (urls, whitelist, filetypeBlacklist) {
  function isWhitelisted (url, whitelist) {
    return whitelist.some(whitelistedUrl => url.hostname.includes(whitelistedUrl))
  }
  function hasNotBlacklistedFiletype (url, filetypeBlacklist) {
    return filetypeBlacklist.every(filetype => !url.href.toLowerCase().endsWith(filetype))
  }
  return urls.filter(thisUrl => {
    try {
      const url = new URL(thisUrl)
      return isWhitelisted(url, whitelist) && hasNotBlacklistedFiletype(url, filetypeBlacklist)
    } catch {
      console.log('URL is filtered out: ', thisUrl)
      return false
    }
  })
}

async function getPageHrefs (url, whitelist, filetypeBlacklist, brokenUrls, destinationFolder) {
  // Get HTML string out of a public URL and make a save a screenshot of it
  const html = await requestHtmlBody(url, brokenUrls, destinationFolder)

  if (!html) {
    console.log('No HTML is used for this URL: ', url)
    return []
  }

  // Parse it and extract hrefs out of all anchors
  const hrefs = extractAnchorsHrefs(html)

  // Make all URLs absolute
  const absoluteHrefs = makeAbsoluteUrls(hrefs, new URL(url).origin)

  // Filter out invalid/not whitelisted/blacklisted filetyped URLs
  const filteredHrefs = filterUrls(absoluteHrefs, whitelist, filetypeBlacklist)

  // Make a array of unique values
  const uniqueUrls = [...new Set(filteredHrefs)]

  return uniqueUrls
}

async function sitemapsParse (sitemaps) {
  const sitemapsURLs = []

  function handleSitemapUrl (url) {
    sitemapsURLs.push(url)
  }
  return new Promise(function (resolve, reject) {
    sitemapsParser.parseSitemaps(sitemaps, handleSitemapUrl, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve(sitemapsURLs)
      }
    })
  })
}

async function extractURLsFromRobots () {
  // This should be https://www.ing.es/robots.txt but as the
  // robots.txt has the wrong format, let's fix and use it locally
  const robotsTxt = fs.readFileSync('./robots.txt', 'utf-8')
  const robots = robotsParser.parser(robotsTxt)

  // Disallow URLs
  // TODO remove domain from here moving on, when using real remote
  const robotsDisallowURLs = robots.disallow.map(url => 'https://www.ing.es' + url)

  // Sitemaps
  const sitemapsURLs = await sitemapsParse(robots.sitemaps)

  const allURLsFromRobots = [...new Set(robotsDisallowURLs.concat(sitemapsURLs))]

  return allURLsFromRobots
}

function createDirectories (destination) {
  fs.mkdirSync(destination)
  fs.mkdirSync(path.join(destination, 'pdfs'))
}
