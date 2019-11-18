const puppeteer = require('puppeteer')
const imagemin = require('imagemin')
const imageminWebp = require('imagemin-webp')
const { zip } = require('zip-a-folder')
const MAX_URL_FILENAME_LENGTH = 100

module.exports = {
  getPageHrefs,
  minimiseImages,
  zipImages
}

async function zipImages () {
  await zip('dist/optimised', `dist/screenshots-${new Date().toISOString()}.zip`)
  console.log('Images zipped')
}

async function minimiseImages () {
  await imagemin(['screenshots/*.png'],
    {
      destination: 'dist/optimised',
      plugins: [
        imageminWebp({
          quality: 10
        })
      ]
    }
  )

  console.log('Images optimized')
}

async function takeScreenshot (page, url) {
  await page.screenshot({
    path: './screenshots/' + url.replace(/\//g, '--').substring(0, MAX_URL_FILENAME_LENGTH) + '.png',
    fullPage: true
  })
}

let browser

async function firstTimeVisit (url) {
  browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.goto(url)
  // For the cookie notice
  await takeScreenshot(page, 'cookie')
  try {
    await page.click('#aceptar')
  } catch {
    console.log('No cookie button')
  }
  return browser
}

async function requestHtmlBody (url, brokenUrls) {
  try {
    if (!browser) {
      browser = await firstTimeVisit(url)
    }
    const page = await browser.newPage()
    await page.goto(url)
    const body = await page.content()
    if (body) {
      await takeScreenshot(page, url)
    }
    page.close()
    return body
  } catch (error) {
    // console.error('URL failed: ', url)
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
      return false
    }
  })
}

async function getPageHrefs (url, whitelist, filetypeBlacklist, brokenUrls) {
  // Get HTML string out of a public URL and make a save a screenshot of it
  const html = await requestHtmlBody(url, brokenUrls)

  if (html === '') {
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
