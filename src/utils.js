const request = require('request-promise')

module.exports = {
  getPageHrefs
}

async function requestHtmlBody (url, brokenUrls) {
  try {
    return await request(url)
  } catch (error) {
    // console.error('URL failed: ', url)
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
  // Get HTML string out of a public URL
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
