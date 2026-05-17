import { BrowserDetector } from '../lib/browserDetector.js';
import { Cookie } from '../lib/cookie.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { JsonFormat } from '../lib/jsonFormat.js';
import { NetscapeFormat } from '../lib/netscapeFormat.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from '../popup/cookieHandlerPopup.js';

document.addEventListener('DOMContentLoaded', async event => {
  const browserDetector = new BrowserDetector();
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  const cookieHandler = new CookieHandlerPopup(browserDetector);
  const permissionHandler = new PermissionHandler(browserDetector);
  const advancedCookieInput = document.getElementById('advanced-cookie');
  const showDevtoolsInput = document.getElementById('devtool-show');
  const animationsEnabledInput = document.getElementById('animations-enabled');
  const exportFormatInput = document.getElementById('export-format');
  const extraInfoInput = document.getElementById('extra-info');
  const themeInput = document.getElementById('theme');
  const buttonBarTopInput = document.getElementById('button-bar-top');
  const adsEnabledInput = document.getElementById('ads-enabled');
  const remoteSyncUrlInput = document.getElementById('remote-sync-url');
  const remoteSyncTokenInput = document.getElementById('remote-sync-token');
  const remoteSyncStatusElement = document.getElementById('remote-sync-status');
  const remoteSyncTestButton = document.getElementById('remote-sync-test');

  await optionHandler.loadOptions();
  themeHandler.updateTheme();
  setFormValues();
  optionHandler.on('optionsChanged', setFormValues);
  setInputEvents();

  /**
   * Sets the value of the form based on the saved options.
   */
  function setFormValues() {
    console.log('Setting up the form');
    handleAnimationsEnabled();
    advancedCookieInput.checked = optionHandler.getCookieAdvanced();
    showDevtoolsInput.checked = optionHandler.getDevtoolsEnabled();
    animationsEnabledInput.checked = optionHandler.getAnimationsEnabled();
    exportFormatInput.value = optionHandler.getExportFormat();
    extraInfoInput.value = optionHandler.getExtraInfo();
    themeInput.value = optionHandler.getTheme();
    buttonBarTopInput.checked = optionHandler.getButtonBarTop();
    adsEnabledInput.checked = optionHandler.getAdsEnabled();
    remoteSyncUrlInput.value = optionHandler.getRemoteSyncUrl();
    remoteSyncTokenInput.value = optionHandler.getRemoteSyncBearerToken();

    if (!browserDetector.isSafari()) {
      document
        .querySelectorAll('.github-sponsor')
        .forEach(el => el.classList.remove('hidden'));
    }
  }

  /**
   * Sets the different input listeners to save the form changes.
   */
  function setInputEvents() {
    advancedCookieInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setCookieAdvanced(advancedCookieInput.checked);
    });
    showDevtoolsInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setDevtoolsEnabled(showDevtoolsInput.checked);
    });
    animationsEnabledInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAnimationsEnabled(animationsEnabledInput.checked);
      handleAnimationsEnabled();
    });
    exportFormatInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExportFormat(exportFormatInput.value);
    });
    extraInfoInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExtraInfo(extraInfoInput.value);
    });
    themeInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setTheme(themeInput.value);
      themeHandler.updateTheme();
    });
    buttonBarTopInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setButtonBarTop(buttonBarTopInput.checked);
    });
    adsEnabledInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAdsEnabled(adsEnabledInput.checked);
    });
    remoteSyncUrlInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      clearRemoteSyncStatus();
      optionHandler.setRemoteSyncUrl(remoteSyncUrlInput.value);
    });
    remoteSyncTokenInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      clearRemoteSyncStatus();
      optionHandler.setRemoteSyncBearerToken(remoteSyncTokenInput.value);
    });

    remoteSyncTestButton.addEventListener('click', async () => {
      await testRemoteSyncConnection();
    });

    document
      .getElementById('delete-all')
      .addEventListener('click', async event => {
        await deleteAllCookies();
      });

    document
      .getElementById('export-all-json')
      .addEventListener('click', async event => {
        await exportCookiesAsJson();
      });

    document
      .getElementById('export-all-netscape')
      .addEventListener('click', async event => {
        await exportCookiesAsNetscape();
      });
  }

  /**
   * Get permissions for All urls.
   */
  async function getAllPermissions() {
    const hasPermissions =
      await permissionHandler.checkPermissions('<all_urls>');
    if (!hasPermissions) {
      await permissionHandler.requestPermission('<all_urls>');
    }
  }

  /**
   * Get all cookies for the browser
   */
  async function getAllCookies() {
    await getAllPermissions();
    return new Promise((resolve, reject) => {
      cookieHandler.getAllCookiesInBrowser(function (cookies) {
        const loadedCookies = [];
        for (const cookie of cookies) {
          const id = Cookie.hashCode(cookie);
          loadedCookies[id] = new Cookie(id, cookie, optionHandler);
        }
        resolve(loadedCookies);
      });
    });
  }

  /**
   * Delete all cookies.
   */
  async function deleteAllCookies() {
    const deleteAll = confirm(
      'Are you sure you want to delete ALL your cookies?'
    );
    if (!deleteAll) {
      return;
    }
    const cookies = await getAllCookies();
    for (const cookieId in cookies) {
      if (!Object.prototype.hasOwnProperty.call(cookies, cookieId)) {
        continue;
      }
      const exportedCookie = cookies[cookieId].cookie;
      const url = 'https://' + exportedCookie.domain + exportedCookie.path;
      cookieHandler.removeCookie(exportedCookie.name, url);
    }
    alert('All your cookies were deleted');
  }

  /**
   * Export all cookies in the JSON format.
   */
  async function exportCookiesAsJson() {
    const cookies = await getAllCookies();
    copyText(JsonFormat.format(cookies));
    alert('Done!');
  }

  /**
   * Export all cookies in the Netscape format.
   */
  async function exportCookiesAsNetscape() {
    const cookies = await getAllCookies();
    copyText(NetscapeFormat.format(cookies));
    alert('Done!');
  }

  /**
   * Tests the configured remote sync server without mutating cookies.
   */
  async function testRemoteSyncConnection() {
    const baseUrl = remoteSyncUrlInput.value.trim().replace(/\/+$/, '');
    const token = remoteSyncTokenInput.value.trim();
    if (!baseUrl || !token) {
      setRemoteSyncStatus(
        'error',
        'Configure both the server URL and bearer token first.'
      );
      return;
    }

    remoteSyncTestButton.disabled = true;
    setRemoteSyncStatus('pending', 'Testing remote sync connection...');
    try {
      const healthResponse = await fetch(baseUrl + '/health');
      if (!healthResponse.ok) {
        setRemoteSyncStatus('error', 'Remote sync health check failed.');
        return;
      }

      const authResponse = await fetch(baseUrl + '/v1/cookie-sets/localhost', {
        headers: {
          Authorization: 'Bearer ' + token,
        },
      });
      if (authResponse.status === 200 || authResponse.status === 404) {
        optionHandler.setRemoteSyncUrl(baseUrl);
        optionHandler.setRemoteSyncBearerToken(token);
        setRemoteSyncStatus('success', 'Remote sync connection is ready.');
        return;
      }
      if (authResponse.status === 401) {
        setRemoteSyncStatus('error', 'Remote sync bearer token was rejected.');
        return;
      }
      setRemoteSyncStatus(
        'error',
        'Remote sync test failed with HTTP ' + authResponse.status + '.'
      );
    } catch (error) {
      console.error(error);
      setRemoteSyncStatus('error', 'Remote sync test failed: ' + error.message);
    } finally {
      remoteSyncTestButton.disabled = false;
    }
  }

  /**
   * Displays remote sync test status inline.
   * @param {string} type Status type.
   * @param {string} message Status message.
   */
  function setRemoteSyncStatus(type, message) {
    remoteSyncStatusElement.textContent = message;
    remoteSyncStatusElement.classList.remove(
      'hidden',
      'pending',
      'success',
      'error'
    );
    remoteSyncStatusElement.classList.add(type);
  }

  /**
   * Clears the remote sync test status.
   */
  function clearRemoteSyncStatus() {
    remoteSyncStatusElement.textContent = '';
    remoteSyncStatusElement.classList.remove('pending', 'success', 'error');
    remoteSyncStatusElement.classList.add('hidden');
  }

  /**
   * Copy some text to the user's clipboard.
   * @param {string} text Text to copy.
   */
  function copyText(text) {
    const fakeText = document.createElement('textarea');
    fakeText.classList.add('clipboardCopier');
    fakeText.textContent = text;
    document.body.appendChild(fakeText);
    fakeText.focus();
    fakeText.select();
    // TODO: switch to clipboard API.
    document.execCommand('Copy');
    document.body.removeChild(fakeText);
  }

  /**
   * Enables or disables the animations based on the options.
   */
  function handleAnimationsEnabled() {
    if (optionHandler.getAnimationsEnabled()) {
      document.body.classList.remove('notransition');
    } else {
      document.body.classList.add('notransition');
    }
  }
});
