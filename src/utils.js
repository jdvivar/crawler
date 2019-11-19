const puppeteer = require('puppeteer')
const imagemin = require('imagemin')
const imageminWebp = require('imagemin-webp')
const fs = require('fs')
const request = require('request-promise')
const { zip } = require('zip-a-folder')
const MAX_URL_FILENAME_LENGTH = 100

module.exports = {
  getPageHrefs,
  minimiseImages,
  zipImages
}

async function zipImages () {
  try {
    const destination = `dist/screenshots-${new Date().toISOString()}.zip`
    await zip('dist/optimised', destination)
    console.log(`Images zipped in ${destination}`)
  } catch {
    console.log('Error zipping images')
  }
}

async function minimiseImages () {
  try {
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
  } catch {
    console.log('Error optimising images')
  }
}

function getUrlToFileName (url) {
  return url.replace(/\//g, '--').substring(0, MAX_URL_FILENAME_LENGTH)
}

async function takeScreenshot (page, url) {
  try {
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

async function handleUrl (page, url) {
  try {
    if (!url.endsWith('pdf')) {
      await page.goto(url)
      await takeScreenshot(page, url)
    } else {
      await request(url).pipe(fs.createWriteStream('./screenshots/' + getUrlToFileName(url)))
      return ''
    }
  } catch {
    console.log(`Navigation to ${url} failed`)
  }
}

let page

async function requestHtmlBody (url, brokenUrls) {
  try {
    if (!page) {
      page = await firstTimeVisit(url)
    }
    await handleUrl(page, url)
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

  if (!html) {
    return []
  }

  console.log('HTML: ', html)

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
