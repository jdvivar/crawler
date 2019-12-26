const puppeteer = require('puppeteer')
const fs = require('fs')
const request = require('request-promise-native')
const robotsParse = require('robots-parse')
const path = require('path')
const sitemapsParser = require('sitemap-stream-parser')
const signale = require('signale')
const MAX_URL_FILENAME_LENGTH = 100
const TIMEOUT = 30000
const USER_AGENT = 'Mozilla/5.0 (X11; CrOS x86_64 10066.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36'

module.exports = {
  getPageHrefs,
  extractURLsFromRobots,
  createDirectories,
  closePuppeteer,
  saveURLsToFile
}

let browser
let page

function getUrlToFileName (url) {
  return url.replace(/[//:]/g, '_').substring(0, MAX_URL_FILENAME_LENGTH)
}

async function takeScreenshot (page, url) {
  try {
    if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots')
    const path = './screenshots/' + getUrlToFileName(url) + '.png'
    await page.screenshot({
      path,
      fullPage: true
    })
    signale.note({ prefix: '[SCREENSHOT]', message: `Screenshot saved at ${path}` })
  } catch (e) {
    signale.error({ prefix: '[SCREENSHOT]', message: 'Screenshot failed' })
    signale.fatal(e)
  }
}

function getChromiumPath () {
  const isWindows = (process.platform === 'win32')
  const isMacOS = (process.platform === 'darwin')
  const isLinux = (process.platform === 'linux')

  if (process.env.pptrExecutablePath) return process.env.pptrExecutablePath
  if (isLinux) return path.join('chromium', 'chrome-linux', 'chrome')
  if (isMacOS) return path.join('chromium', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
  if (isWindows) return path.join('chromium', 'chrome-win', 'chrome.exe')

  throw new Error('OS not supported')
}

async function firstTimeVisit (url) {
  try {
    browser = await puppeteer.launch({ executablePath: getChromiumPath() })
  } catch (e) {
    signale.fatal(e)
  }
  page = await browser.newPage()
  if (process.env.width) {
    signale.info({ prefix: '[SCREENSHOT]', message: `Setting width: ${process.env.width}` })
    page.setViewport({ width: parseInt(process.env.width), height: 1000 })
  }
  await page.setUserAgent(USER_AGENT)
  page.setDefaultTimeout(TIMEOUT)
  try {
    await page.goto(url)
    // For the cookie notice
    await takeScreenshot(page, 'cookie')
    await page.click('#aceptar')
  } catch {
    signale.warn({ prefix: '[VISITING  ]', message: 'No cookie button' })
  }
}

async function handleUrl (url, destinationFolder) {
  if (!url.endsWith('pdf')) {
    const response = await page.goto(url)
    if (!response) {
      signale.error({ prefix: '[VISITING  ]', message: `No response received from ${url}` })
      throw new Error('No response received')
    }
    if (response.status() < 400) {
      signale.success({ prefix: '[VISITING  ]', message: `Received HTML ${response.status()}` })
      await takeScreenshot(page, url)

      return page.evaluate(() => {
        function recursiveFindAnchors (node) {
          if (!node) return []
          const bareAnchorURLs = [...node.querySelectorAll('a')].map(anchor => formatHref(anchor.href))
          const allShadowRoots = [...node.querySelectorAll('*')].filter(node => node.shadowRoot).map(node => node.shadowRoot)
          if (allShadowRoots.length === 0) return bareAnchorURLs
          return bareAnchorURLs.concat(allShadowRoots.flatMap(recursiveFindAnchors))
        }

        function formatHref (href) {
          if (!href) return ''
          const { origin, pathname } = new URL(href)
          return origin + pathname
        }

        return [...new Set(recursiveFindAnchors(document.body))]
      })
    } else {
      signale.error({ prefix: '[VISITING  ]', message: `Error receiving HTML ${response.status()}` })
      throw new Error(response.status())
    }
  } else {
    try {
      const fileName = path.join(`./${destinationFolder}/pdfs/${getUrlToFileName(url)}`)
      const pdfBuffer = await request.get({ url, timeout: TIMEOUT, encoding: null })
      fs.writeFileSync(fileName, pdfBuffer)
      signale.success({ prefix: '[VISITING  ]', message: `Received PDF from ${url}` })
    } catch (e) {
      signale.error({ prefix: '[VISITING  ]', message: `Error receiving PDF from ${url}` })
      throw e
    }
  }
}

async function extractHrefsFromUrl (url, brokenUrls, destinationFolder) {
  try {
    if (!page) {
      await firstTimeVisit(url)
    }
    return await handleUrl(url, destinationFolder)
  } catch (error) {
    signale.fatal(error)
    signale.error({ prefix: '[VISITING  ]', message: `Adding to broken URLs list: ${url}` })
    brokenUrls.push(url)
    return []
  }
}

function makeAbsoluteUrls (urls, origin) {
  // if url starts with /, then use that directly, otherwise
  // use origin + url, but if origin ends with / then remove the slash first
  return urls.map(url => url.startsWith('/') ? (origin.endsWith('/') ? origin.slice(0, -1) : origin + url) : url)
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
      signale.warn({ prefix: '[VISITING  ]', message: `Filtered out: ${thisUrl}` })
      return false
    }
  })
}

async function getPageHrefs (url, whitelist, filetypeBlacklist, brokenUrls, destinationFolder) {
  // Get HTML string out of a public URL and make a save a screenshot of it
  const hrefs = await extractHrefsFromUrl(url, brokenUrls, destinationFolder)

  if (!hrefs || !hrefs.length) {
    signale.warn({ prefix: '[VISITING  ]', message: `No hrefs found in this URL: ${url}` })
    return []
  }

  const nonEmptyHrefs = hrefs.filter(i => i)

  // Make all URLs absolute
  const absoluteHrefs = makeAbsoluteUrls(nonEmptyHrefs, new URL(url).origin)

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

async function extractURLsFromRobots (origin) {
  try {
    // Robots
    const robots = await robotsParse(origin)
    const robotsDisallowURLs = robots.disallow.map(url => origin + url)

    // Sitemaps
    const sitemapsURLs = await sitemapsParse(robots.sitemaps)

    // Concatenate all
    const allURLsFromRobots = [...new Set(robotsDisallowURLs.concat(sitemapsURLs))]
    return allURLsFromRobots
  } catch (error) {
    signale.fatal(error)
    return Promise.resolve([])
  }
}

function createDirectories (destination) {
  fs.mkdirSync(destination)
  fs.mkdirSync(path.join(destination, 'pdfs'))
}

async function closePuppeteer () {
  if (browser) await browser.close()
}

function saveURLsToFile (urls) {
  fs.writeFileSync('urls.json', JSON.stringify(urls))
}
