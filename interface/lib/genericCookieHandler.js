import { EventEmitter } from './eventEmitter.js';

/**
 * Class used to implement basic common Cookie API handling.
 */
export class GenericCookieHandler extends EventEmitter {
  /**
   * Constructs a GenericCookieHandler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super();
    this.cookies = [];
    this.currentTab = null;
    this.browserDetector = browserDetector;
  }

  /**
   * Gets all cookie for the current tab.
   * @param {function} callback
   */
  getAllCookies(callback) {
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll({
          url: this.currentTab.url,
          storeId: this.currentTab.cookieStoreId,
        })
        .then(callback, function (e) {
          console.error('Failed to retrieve cookies', e);
        });
    } else {
      this.browserDetector.getApi().cookies.getAll(
        {
          url: this.currentTab.url,
          storeId: this.currentTab.cookieStoreId,
        },
        callback
      );
    }
  }

  /**
   * Gets all cookies matching a domain in the current cookie store.
   * @param {string} domain Domain to retrieve cookies for.
   * @param {function} callback
   */
  getAllCookiesForDomain(domain, callback) {
    const details = {
      domain: domain,
      storeId: this.currentTab.cookieStoreId,
    };
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll(details)
        .then(callback, function (e) {
          console.error('Failed to retrieve cookies', e);
        });
    } else {
      this.browserDetector.getApi().cookies.getAll(details, callback);
    }
  }

  /**
   * Prepares a cookie to be saved. Cleans it up for certain browsers.
   * @param {object} cookie
   * @param {string} url
   * @return {object}
   */
  prepareCookie(cookie, url) {
    const newCookie = {
      domain: cookie.domain || '',
      name: cookie.name || '',
      value: cookie.value || '',
      path: cookie.path || null,
      secure: cookie.secure || null,
      httpOnly: cookie.httpOnly || null,
      expirationDate: cookie.expirationDate || null,
      storeId: cookie.storeId || this.currentTab.cookieStoreId || null,
      url: url,
    };

    // Bad hack on safari because cookies needs to have the very exact same domain
    // to be able to edit it.
    if (this.browserDetector.isSafari() && newCookie.domain) {
      newCookie.url = 'http://' + newCookie.domain;
    }
    if (this.browserDetector.isSafari() && !newCookie.path) {
      newCookie.path = '/';
    }

    if (
      cookie.hostOnly ||
      (this.browserDetector.isSafari() && !newCookie.domain)
    ) {
      newCookie.domain = null;
    }

    if (!this.browserDetector.isSafari()) {
      newCookie.sameSite = cookie.sameSite || undefined;

      if (newCookie.sameSite == 'no_restriction') {
        newCookie.secure = true;
      }
    }

    return newCookie;
  }

  /**
   * Saves a cookie. This can either create a new cookie or modify an existing
   * one.
   * @param {Cookie} cookie Cookie's data.
   * @param {string} url The url to attach the cookie to.
   * @param {function} callback
   */
  saveCookie(cookie, url, callback) {
    cookie = this.prepareCookie(cookie, url);
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.set(cookie)
        .then(
          (cookie, a, b, c) => {
            if (callback) {
              callback(null, cookie);
            }
          },
          error => {
            console.error('Failed to create cookie', error);
            if (callback) {
              callback(error.message, null);
            }
          }
        );
    } else {
      this.browserDetector.getApi().cookies.set(cookie, cookieResponse => {
        const error = this.browserDetector.getApi().runtime.lastError;
        if (!cookieResponse || error) {
          console.error('Failed to create cookie', error);
          if (callback) {
            const errorMessage =
              (error ? error.message : '') || 'Unknown error';
            return callback(errorMessage, cookieResponse);
          }
          return;
        }

        if (callback) {
          return callback(null, cookieResponse);
        }
      });
    }
  }

  /**
   * Removes a cookie from the browser.
   * @param {string} name The name of the cookie to remove.
   * @param {string} url The url that the cookie is attached to.
   * @param {function} callback
   * @param {boolean} isRecursive
   */
  removeCookie(name, url, callback, isRecursive = false) {
    // Bad hack on safari because cookies needs to have the very exact same domain
    // to be able to delete it.
    // TODO: Check if this hack is needed on devtools.
    if (this.browserDetector.isSafari() && !isRecursive) {
      this.getAllCookies(cookies => {
        for (const cookie of cookies) {
          if (cookie.name === name) {
            this.removeCookie(name, 'http://' + cookie.domain, callback, true);
          }
        }
      });
    } else if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.remove({
          name: name,
          url: url,
          storeId: this.currentTab.cookieStoreId,
        })
        .then(callback, function (e) {
          console.error('Failed to remove cookies', e);
          if (callback) {
            callback();
          }
        });
    } else {
      this.browserDetector.getApi().cookies.remove(
        {
          name: name,
          url: url,
          storeId: this.currentTab.cookieStoreId,
        },
        cookieResponse => {
          const error = this.browserDetector.getApi().runtime.lastError;
          if (!cookieResponse || error) {
            console.error('Failed to remove cookie', error);
            if (callback) {
              const errorMessage =
                (error ? error.message : '') || 'Unknown error';
              return callback(errorMessage, cookieResponse);
            }
            return;
          }

          if (callback) {
            return callback(null, cookieResponse);
          }
        }
      );
    }
  }

  /**
   * Removes a browser cookie using the exact tuple returned by the cookies API.
   * @param {object} cookie Cookie returned from the browser cookies API.
   * @param {function} callback
   */
  removeCookieDetails(cookie, callback) {
    const removeDetails = {
      name: cookie.name,
      url: this.getUrlForCookie(cookie),
      storeId: cookie.storeId || this.currentTab.cookieStoreId,
    };

    if (cookie.partitionKey) {
      removeDetails.partitionKey = cookie.partitionKey;
    }
    if (this.browserDetector.isFirefox() && cookie.firstPartyDomain) {
      removeDetails.firstPartyDomain = cookie.firstPartyDomain;
    }

    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.remove(removeDetails)
        .then(
          cookieResponse => {
            if (callback) {
              callback(null, cookieResponse);
            }
          },
          error => {
            console.error('Failed to remove cookie', error);
            if (callback) {
              callback(error.message, null);
            }
          }
        );
    } else {
      this.browserDetector
        .getApi()
        .cookies.remove(removeDetails, cookieResponse => {
          const error = this.browserDetector.getApi().runtime.lastError;
          if (!cookieResponse || error) {
            console.error('Failed to remove cookie', error);
            if (callback) {
              const errorMessage =
                (error ? error.message : '') || 'Unknown error';
              return callback(errorMessage, cookieResponse);
            }
            return;
          }

          if (callback) {
            return callback(null, cookieResponse);
          }
        });
    }
  }

  /**
   * Builds a URL that identifies a cookie for set/remove API calls.
   * @param {object} cookie Cookie returned from the browser cookies API.
   * @return {string} URL matching the cookie's domain, path, and security.
   */
  getUrlForCookie(cookie) {
    const protocol = cookie.secure ? 'https:' : 'http:';
    const domain = (cookie.domain || '').replace(/^\./, '');
    let path = cookie.path || '/';
    if (path[0] !== '/') {
      path = '/' + path;
    }
    return protocol + '//' + domain + path;
  }

  /**
   * Gets all the cookies from the browser.
   * @param {function} callback
   */
  getAllCookiesInBrowser(callback) {
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll({})
        .then(callback, function (e) {
          console.error('Failed to retrieve cookies', e);
        });
    } else {
      this.browserDetector.getApi().cookies.getAll({}, callback);
    }
  }
}
