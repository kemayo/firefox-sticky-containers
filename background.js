const blankPages = new Set(['about:blank', 'about:newtab']);

const defaultCookieStoreId = 'firefox-default';
const privateCookieStorePrefix = 'firefox-private';

let lastCookieStoreId = defaultCookieStoreId;
let abandonedTabId;

// NOTE: This started out with reading the code of a very small corner of the
// Conex extension, and then stripping out and rewriting much of it.

const openInDifferentContainer = function(cookieStoreId, tab, urlOverride) {
  const tabProperties = {
    active: true,
    cookieStoreId: cookieStoreId,
    index: tab.index + 1,
    openerTabId: tab.openerTabId
  };

  if (urlOverride || !blankPages.has(tab.url)) {
    tabProperties.url = urlOverride || tab.url;
  }

  console.debug('openInDifferentContainer', tabProperties);

  // TODO: this isn't ideal, as it causes a flicker when creating the tab, and
  // breaks the normal close-tab stack. However, I can't see a way to change
  // the cookieStore without making a new tab, or to hook in at the pre-tab-
  // opening stage.
  browser.tabs.create(tabProperties);
  browser.tabs.remove(tab.id);
  abandonedTabId = tab.id;
};

const updateLastCookieStoreId = function(activeInfo) {
  browser.tabs.get(activeInfo.tabId).then(tab => {
    if(
      (!blankPages.has(tab.url) || tab.cookieStoreId != defaultCookieStoreId)
      && tab.cookieStoreId != lastCookieStoreId
      && !tab.cookieStoreId.startsWith(privateCookieStorePrefix)
    ) {
      console.debug(`cookieStoreId changed from ${lastCookieStoreId} -> ${tab.cookieStoreId}`);
      lastCookieStoreId = tab.cookieStoreId;
    }
  }, e => console.error(e));
};

const isPrivilegedURL = function(url) {
  return url == 'about:config' ||
    url == 'about:debugging' ||
    url == 'about:addons' ||
    url.startsWith('chrome:') ||
    url.startsWith('javascript:') ||
    url.startsWith('data:') ||
    url.startsWith('file:') ||
    url.startsWith('about:config');
}

// Event flow is:
// tab.onCreated (tab URL not yet set)
// tab.onActivated
// tab.onUpdated -> status:loading
// webNavigation.onBeforeNavigate -> details.url
// tab.onUpdated -> status:loading + url
// tab.onUpdated -> status:complete

browser.tabs.onActivated.addListener(activeInfo => {
  console.debug('tab onActivated', activeInfo);
  if (activeInfo.tabId == abandonedTabId) {
    return;
  }
  updateLastCookieStoreId(activeInfo);
});

browser.webNavigation.onBeforeNavigate.addListener(details => {
  console.debug('webNaviagation onBeforeNavigate', details);
  if (details.tabId == abandonedTabId) {
    return;
  }
  if (isPrivilegedURL(details.url)) {
    console.debug("Privileged URL, didn't try containers", details.url);
    return;
  }
  browser.tabs.get(details.tabId).then(tab => {
    console.debug('onBeforeNavigate tab fetched', tab);
    if(
      // tab will be pre-navigation still, so old URL here:
      blankPages.has(tab.url)
      // if we came from another tab, we should let the normal container inheritance
      // happen without overriding it ourselves
      && tab.openerTabId == undefined
      // ...and nothing else has pushed it out of the default container (e.g. incognito)
      && tab.cookieStoreId == defaultCookieStoreId
      && lastCookieStoreId != defaultCookieStoreId
    ) {
      openInDifferentContainer(lastCookieStoreId, tab, details.url);
    }
  });
});

// DEBUG help for me later:
/*
browser.tabs.onCreated.addListener(tab => {
  console.debug('tab onCreated', tab, tab.url);
  browser.tabs.get(tab.id).then(tab => {
    console.log('onCreated tabs.get', tab);
  })
});
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.debug('tab onUpdated', tabId, changeInfo, tab);
});
*/
