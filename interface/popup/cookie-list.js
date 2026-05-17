import { CookieHandlerDevtools } from '../devtools/cookieHandlerDevtools.js';
import { AdHandler } from '../lib/ads/adHandler.js';
import { Animate } from '../lib/animate.js';
import { BrowserDetector } from '../lib/browserDetector.js';
import { Cookie } from '../lib/cookie.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { HeaderstringFormat } from '../lib/headerstringFormat.js';
import { JsonFormat } from '../lib/jsonFormat.js';
import { NetscapeFormat } from '../lib/netscapeFormat.js';
import { ExportFormats } from '../lib/options/exportFormats.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from './cookieHandlerPopup.js';

(function () {
  ('use strict');

  let containerCookie;
  let cookiesListHtml;
  let pageTitleContainer;
  let notificationElement;
  let loadedCookies = {};
  let disableButtons = false;
  let remoteSyncBusy = false;

  const notificationQueue = [];
  let notificationTimeout;

  const browserDetector = new BrowserDetector();
  const permissionHandler = new PermissionHandler(browserDetector);
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  const adHandler = new AdHandler(
    browserDetector,
    storageHandler,
    optionHandler
  );
  const cookieHandler = window.isDevtools
    ? new CookieHandlerDevtools(browserDetector)
    : new CookieHandlerPopup(browserDetector);

  document.addEventListener('DOMContentLoaded', async function () {
    containerCookie = document.getElementById('cookie-container');
    notificationElement = document.getElementById('notification');
    pageTitleContainer = document.getElementById('pageTitle');

    await initWindow();

    /**
     * Expands the HTML cookie element.
     * @param {element} e Element to expand.
     */
    function expandCookie(e) {
      const parent = e.target.closest('li');
      const header = parent.querySelector('.header');
      const expando = parent.querySelector('.expando');

      Animate.toggleSlide(expando);
      header.classList.toggle('active');
      header.ariaExpanded = header.classList.contains('active');
      expando.ariaHidden = !header.classList.contains('active');
    }

    /**
     * Handles clicks on the delete button of a cookie.
     * @param {Element} e Delete button element.
     * @return {false} returns false to prevent click event propagation.
     */
    function deleteButton(e) {
      e.preventDefault();
      console.log('removing cookie...');
      const listElement = e.target.closest('li');
      removeCookie(listElement.dataset.name);
      return false;
    }

    /**
     * Handles saving a cookie from a form.
     * @param {element} form Form element that contains the cookie fields.
     * @return {false} returns false to prevent click event propagation.
     */
    function saveCookieForm(form) {
      const isCreateForm = form.classList.contains('create');

      const id = form.dataset.id;
      const name = form.querySelector('input[name="name"]').value;
      const value = form.querySelector('textarea[name="value"]').value;

      let domain;
      let path;
      let expiration;
      let sameSite;
      let hostOnly;
      let session;
      let secure;
      let httpOnly;

      if (!isCreateForm) {
        domain = form.querySelector('input[name="domain"]').value;
        path = form.querySelector('input[name="path"]').value;
        expiration = form.querySelector('input[name="expiration"]').value;
        sameSite = form.querySelector('select[name="sameSite"]').value;
        hostOnly = form.querySelector('input[name="hostOnly"]').checked;
        session = form.querySelector('input[name="session"]').checked;
        secure = form.querySelector('input[name="secure"]').checked;
        httpOnly = form.querySelector('input[name="httpOnly"]').checked;
      }
      saveCookie(
        id,
        name,
        value,
        domain,
        path,
        expiration,
        sameSite,
        hostOnly,
        session,
        secure,
        httpOnly
      );

      if (form.classList.contains('create')) {
        showCookiesForTab();
      }

      return false;
    }

    /**
     * Creates or saves changes to a cookie.
     * @param {string} id HTML ID assigned to the cookie.
     * @param {string} name Name of the cookie.
     * @param {string} value Value of the cookie.
     * @param {string} domain
     * @param {string} path
     * @param {string} expiration
     * @param {string} sameSite
     * @param {boolean} hostOnly
     * @param {boolean} session
     * @param {boolean} secure
     * @param {boolean} httpOnly
     */
    function saveCookie(
      id,
      name,
      value,
      domain,
      path,
      expiration,
      sameSite,
      hostOnly,
      session,
      secure,
      httpOnly
    ) {
      console.log('saving cookie...');

      const cookieContainer = loadedCookies[id];
      let cookie = cookieContainer ? cookieContainer.cookie : null;
      let oldName;
      let oldHostOnly;

      if (cookie) {
        oldName = cookie.name;
        oldHostOnly = cookie.hostOnly;
      } else {
        cookie = {};
        oldName = name;
        oldHostOnly = hostOnly;
      }

      cookie.name = name;
      cookie.value = value;

      if (domain !== undefined) {
        cookie.domain = domain;
      }
      if (path !== undefined) {
        cookie.path = path;
      }
      if (sameSite !== undefined) {
        cookie.sameSite = sameSite;
      }
      if (hostOnly !== undefined) {
        cookie.hostOnly = hostOnly;
      }
      if (session !== undefined) {
        cookie.session = session;
      }
      if (secure !== undefined) {
        cookie.secure = secure;
      }
      if (httpOnly !== undefined) {
        cookie.httpOnly = httpOnly;
      }

      if (cookie.session) {
        cookie.expirationDate = null;
      } else {
        cookie.expirationDate = new Date(expiration).getTime() / 1000;
        if (!cookie.expirationDate) {
          // Reset it to null because on safari it is NaN and causes failures.
          cookie.expirationDate = null;
          cookie.session = true;
        }
      }

      if (oldName !== name || oldHostOnly !== hostOnly) {
        cookieHandler.removeCookie(oldName, getCurrentTabUrl(), function () {
          cookieHandler.saveCookie(
            cookie,
            getCurrentTabUrl(),
            function (error, cookie) {
              if (error) {
                sendNotification(error);
                return;
              }
              if (browserDetector.isSafari()) {
                onCookiesChanged();
              }
              if (cookieContainer) {
                cookieContainer.showSuccessAnimation();
              }
            }
          );
        });
      } else {
        // Should probably put in a function to prevent duplication
        cookieHandler.saveCookie(
          cookie,
          getCurrentTabUrl(),
          function (error, cookie) {
            if (error) {
              sendNotification(error);
              return;
            }
            if (browserDetector.isSafari()) {
              onCookiesChanged();
            }

            if (cookieContainer) {
              cookieContainer.showSuccessAnimation();
            }
          }
        );
      }
    }

    if (containerCookie) {
      containerCookie.addEventListener('click', e => {
        let target = e.target;
        if (target.nodeName === 'path') {
          target = target.parentNode;
        }
        if (target.nodeName === 'svg') {
          target = target.parentNode;
        }

        if (
          target.classList.contains('header') ||
          target.classList.contains('header-name') ||
          target.classList.contains('header-extra-info')
        ) {
          return expandCookie(e);
        }
        if (target.classList.contains('delete')) {
          return deleteButton(e);
        }
        if (target.classList.contains('save')) {
          return saveCookieForm(e.target.closest('li').querySelector('form'));
        }
      });
      document.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.code === 'Enter') {
          const target = e.target;
          if (target.classList.contains('header')) {
            e.preventDefault();
            return expandCookie(e);
          }
        }
      });
    }

    document.getElementById('create-cookie').addEventListener('click', () => {
      if (disableButtons) {
        return;
      }

      setPageTitle('Cookie-Editor - Add a Cookie');

      disableButtons = true;
      console.log('strart transition');
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        createHtmlFormCookie(),
        'left',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
      console.log('after transition');

      document.getElementById('button-bar-default').classList.remove('active');
      document.getElementById('button-bar-add').classList.add('active');
      document.getElementById('name-create').focus();
      return false;
    });

    document
      .getElementById('delete-all-cookies')
      .addEventListener('click', () => {
        const buttonIcon = document
          .getElementById('delete-all-cookies')
          .querySelector('use');
        if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
          return;
        }
        if (loadedCookies && Object.keys(loadedCookies).length) {
          for (const cookieId in loadedCookies) {
            if (Object.prototype.hasOwnProperty.call(loadedCookies, cookieId)) {
              removeCookie(loadedCookies[cookieId].cookie.name);
            }
          }
        }
        sendNotification('All cookies were deleted');
        buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
        setTimeout(() => {
          buttonIcon.setAttribute('href', '../sprites/solid.svg#trash');
        }, 1500);
      });

    document.getElementById('export-cookies').addEventListener('click', () => {
      if (disableButtons) {
        hideExportMenu();
        return;
      }
      handleExportButtonClick();
    });

    document
      .getElementById('remote-sync-cookies')
      .addEventListener('click', () => {
        if (disableButtons || remoteSyncBusy) {
          hideRemoteSyncMenu();
          return;
        }
        toggleRemoteSyncMenu();
      });

    document.getElementById('import-cookies').addEventListener('click', () => {
      if (disableButtons) {
        return;
      }

      setPageTitle('Cookie-Editor - Import');

      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        createHtmlFormImport(),
        'left',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );

      document.getElementById('button-bar-default').classList.remove('active');
      document.getElementById('button-bar-import').classList.add('active');

      document.getElementById('content-import').focus();
      return false;
    });

    document.getElementById('return-list-add').addEventListener('click', () => {
      showCookiesForTab();
    });
    document
      .getElementById('return-list-import')
      .addEventListener('click', () => {
        showCookiesForTab();
      });

    containerCookie.addEventListener('submit', e => {
      e.preventDefault();
      saveCookieForm(e.target);
      return false;
    });

    document
      .getElementById('save-create-cookie')
      .addEventListener('click', () => {
        saveCookieForm(document.querySelector('form'));
      });

    document
      .getElementById('save-import-cookie')
      .addEventListener('click', e => {
        const buttonIcon = document
          .getElementById('save-import-cookie')
          .querySelector('use');
        if (
          buttonIcon.getAttribute('href') !== '../sprites/solid.svg#file-import'
        ) {
          return;
        }

        const json = document.querySelector('textarea').value;
        if (!json) {
          return;
        }
        let cookies;
        try {
          cookies = JsonFormat.parse(json);
        } catch (error) {
          console.warn(error);
          try {
            cookies = HeaderstringFormat.parse(json);
          } catch (error) {
            console.warn(error);
            try {
              cookies = NetscapeFormat.parse(json);
            } catch (error) {
              console.warn("Couldn't parse Data", error);
              sendNotification('The input is not in a valid format.');
              buttonIcon.setAttribute('href', '../sprites/solid.svg#times');
              setTimeout(() => {
                buttonIcon.setAttribute(
                  'href',
                  '../sprites/solid.svg#file-import'
                );
              }, 1500);
              return;
            }
          }
        }

        if (!isArray(cookies) || cookies.length === 0) {
          console.log('No cookies were imported.');
          sendNotification('No cookies were imported. Verify your input.');
          buttonIcon.setAttribute('href', '../sprites/solid.svg#times');
          setTimeout(() => {
            buttonIcon.setAttribute('href', '../sprites/solid.svg#file-import');
          }, 1500);
          return;
        }

        for (const cookie of cookies) {
          // Make sure we are using the right store ID. This is in case we are
          // importing from a basic store ID and the current user is using
          // custom containers
          cookie.storeId = cookieHandler.currentTab.cookieStoreId;

          if (cookie.sameSite && cookie.sameSite === 'unspecified') {
            cookie.sameSite = null;
          }

          try {
            cookieHandler.saveCookie(
              cookie,
              getCurrentTabUrl(),
              function (error, cookie) {
                if (error) {
                  sendNotification(error);
                }
              }
            );
          } catch (error) {
            console.error(error);
            sendNotification(error);
          }
        }

        sendNotification(`Cookies were imported`);
        showCookiesForTab();
      });

    const mainMenuContent = document.querySelector('#main-menu-content');
    document
      .querySelector('#main-menu-button')
      .addEventListener('click', function (e) {
        mainMenuContent.classList.toggle('visible');
      });

    document.addEventListener('click', function (e) {
      // Clicks in the main menu should not dismiss it.
      if (
        document.querySelector('#main-menu').contains(e.target) ||
        !mainMenuContent.classList.contains('visible')
      ) {
        return;
      }
      console.log('main menu blur');
      mainMenuContent.classList.remove('visible');
    });

    document.addEventListener('click', function (e) {
      const exportMenu = document.querySelector('#export-menu');
      // Clicks in the export menu should not dismiss it.
      if (!exportMenu || exportMenu.contains(e.target)) {
        return;
      }

      const exportButton = document.querySelector('#export-cookies');
      if (!exportButton || exportButton.contains(e.target)) {
        return;
      }

      console.log('export menu blur');
      hideExportMenu();
    });

    document.addEventListener('click', function (e) {
      const remoteSyncMenu = document.querySelector('#remote-sync-menu');
      // Clicks in the remote sync menu should not dismiss it.
      if (!remoteSyncMenu || remoteSyncMenu.contains(e.target)) {
        return;
      }

      const remoteSyncButton = document.querySelector('#remote-sync-cookies');
      if (!remoteSyncButton || remoteSyncButton.contains(e.target)) {
        return;
      }

      console.log('remote sync menu blur');
      hideRemoteSyncMenu();
    });

    document
      .querySelector('#advanced-toggle-all')
      .addEventListener('change', function (e) {
        optionHandler.setCookieAdvanced(e.target.checked);
        showCookiesForTab();
      });

    document
      .querySelector('#menu-all-options')
      .addEventListener('click', function (e) {
        if (browserDetector.getApi().runtime.openOptionsPage) {
          browserDetector.getApi().runtime.openOptionsPage();
        } else {
          window.open(
            browserDetector
              .getApi()
              .runtime.getURL('interface/options/options.html')
          );
        }
      });

    notificationElement.addEventListener('animationend', e => {
      if (notificationElement.classList.contains('fadeInUp')) {
        return;
      }

      triggerNotification();
    });

    document
      .getElementById('notification-dismiss')
      .addEventListener('click', e => {
        hideNotification();
      });

    adjustWidthIfSmaller();

    if (chrome && chrome.runtime && chrome.runtime.getBrowserInfo) {
      chrome.runtime.getBrowserInfo(function (info) {
        const mainVersion = info.version.split('.')[0];
        if (mainVersion < 57) {
          containerCookie.style.height = '600px';
        }
      });
    }
  });

  // == End document ready == //

  /**
   * Builds the HTML for the cookies of the current tab.
   * @return {Promise|null}
   */
  async function showCookiesForTab() {
    if (!cookieHandler.currentTab) {
      return;
    }
    if (disableButtons) {
      return;
    }

    console.log('showing cookies');

    setPageTitle('Cookie-Editor');
    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    document.getElementById('button-bar-default').classList.add('active');
    document.myThing = 'DarkSide';
    const domain = getDomainFromUrl(cookieHandler.currentTab.url);
    const subtitleLine = document.querySelector('.titles h2');
    if (subtitleLine) {
      subtitleLine.textContent = domain || cookieHandler.currentTab.url;
    }

    if (!permissionHandler.canHavePermissions(cookieHandler.currentTab.url)) {
      showPermissionImpossible();
      return;
    }
    // If devtools has not been fully init yet, we will wait for a signal.
    if (!cookieHandler.currentTab) {
      showNoCookies();
      return;
    }
    const hasPermissions = await permissionHandler.checkPermissions(
      cookieHandler.currentTab.url
    );
    if (!hasPermissions) {
      showNoPermission();
      return;
    }

    cookieHandler.getAllCookies(function (cookies) {
      cookies = cookies.sort(sortCookiesByName);

      loadedCookies = {};

      if (cookies.length === 0) {
        showNoCookies();
        return;
      }

      cookiesListHtml = document.createElement('ul');
      cookiesListHtml.appendChild(generateSearchBar());
      cookies.forEach(function (cookie) {
        const id = Cookie.hashCode(cookie);
        loadedCookies[id] = new Cookie(id, cookie, optionHandler);
        cookiesListHtml.appendChild(loadedCookies[id].html);
      });

      if (containerCookie.firstChild) {
        disableButtons = true;
        Animate.transitionPage(
          containerCookie,
          containerCookie.firstChild,
          cookiesListHtml,
          'right',
          () => {
            disableButtons = false;
          },
          optionHandler.getAnimationsEnabled()
        );
      } else {
        containerCookie.appendChild(cookiesListHtml);
      }
    });
  }

  /**
   * Displays a message to the user to let them know that no cookies are
   * available for the current page.
   */
  function showNoCookies() {
    if (disableButtons) {
      return;
    }
    // If on a different page (e.g: import page) - don't show the no-cookies message.
    const pageTitle =
      pageTitleContainer?.querySelector('h1')?.textContent ?? '';
    if (pageTitle !== 'Cookie-Editor') {
      return;
    }
    cookiesListHtml = null;
    const html = document
      .importNode(document.getElementById('tmp-empty').content, true)
      .querySelector('p');
    if (containerCookie.firstChild) {
      if (containerCookie.firstChild.id === 'no-cookie') {
        return;
      }
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        html,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(html);
    }
  }

  /**
   * Displays a message to the user to let them know that the extension doesn't
   * have permission to access the cookies for this page.
   */
  function showNoPermission() {
    if (disableButtons) {
      return;
    }
    cookiesListHtml = null;
    const html = document
      .importNode(document.getElementById('tmp-no-permission').content, true)
      .querySelector('div');

    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    document.getElementById('button-bar-default').classList.remove('active');
    // Firefox can't request permissions from devTools due to
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1796933
    if (
      browserDetector.isFirefox() &&
      typeof browserDetector.getApi().devtools !== 'undefined'
    ) {
      console.log('Firefox devtools permission display hack');
      html.querySelector('div').textContent =
        "Go to your settings (about:addons) or open the extension's popup to " +
        'adjust your permissions.';
    }

    if (containerCookie.firstChild) {
      if (containerCookie.firstChild.id === 'no-permission') {
        return;
      }
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        html,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(html);
    }
    document.getElementById('request-permission').focus();
    document
      .getElementById('request-permission')
      .addEventListener('click', async event => {
        console.log('requesting permissions!');
        const isPermissionGranted = await permissionHandler.requestPermission(
          cookieHandler.currentTab.url
        );
        console.log('permission granted? ', isPermissionGranted);
        if (isPermissionGranted) {
          showCookiesForTab();
        }
      });
    document
      .getElementById('request-permission-all')
      .addEventListener('click', async event => {
        console.log('requesting all permissions!');
        const isPermissionGranted =
          await permissionHandler.requestPermission('<all_urls>');
        console.log('permission granted? ', isPermissionGranted);
        if (isPermissionGranted) {
          showCookiesForTab();
        }
      });
  }

  /**
   * Displays a message to the user to let them know that the extension can't
   * get permission to access the cookies for this page due to them being
   * internal pages.
   */
  function showPermissionImpossible() {
    if (disableButtons) {
      return;
    }
    cookiesListHtml = null;
    const html = document
      .importNode(
        document.getElementById('tmp-permission-impossible').content,
        true
      )
      .querySelector('div');

    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    document.getElementById('button-bar-default').classList.remove('active');
    if (containerCookie.firstChild) {
      if (containerCookie.firstChild.id === 'permission-impossible') {
        return;
      }
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        html,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(html);
    }
  }

  /**
   * Shows the current version number in the interface.
   */
  function showVersion() {
    const version = browserDetector.getApi().runtime.getManifest().version;
    document.getElementById('version').textContent = 'v' + version;
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

  /**
   * Creates the HTML representation of a cookie.
   * @param {string} name Name of the cookie.
   * @param {string} value Value of the cookie.
   * @param {string} id HTML ID to use for the cookie.
   * @return {string} the HTML of the cookie.
   */
  function createHtmlForCookie(name, value, id) {
    const cookie = new Cookie(
      id,
      {
        name: name,
        value: value,
      },
      optionHandler
    );

    return cookie.html;
  }

  /**
   * Creates the HTML form to allow editing a cookie.
   * @return {string} The HTML for the form.
   */
  function createHtmlFormCookie() {
    const template = document.importNode(
      document.getElementById('tmp-create').content,
      true
    );
    return template.querySelector('form');
  }

  /**
   * Creates the HTML form to allow importing cookies.
   * @return {string} The HTML for the form.
   */
  function createHtmlFormImport() {
    const template = document.importNode(
      document.getElementById('tmp-import').content,
      true
    );
    return template.querySelector('form');
  }

  /**
   * Handles the logic of the export button, depending on user preferences.
   */
  function handleExportButtonClick() {
    const exportOption = optionHandler.getExportFormat();
    switch (exportOption) {
      case ExportFormats.Ask:
        toggleExportMenu();
        break;
      case ExportFormats.JSON:
        exportToJson();
        break;
      case ExportFormats.HeaderString:
        exportToHeaderstring();
        break;
      case ExportFormats.Netscape:
        exportToNetscape();
        break;
    }
  }

  /**
   * Toggles the visibility of the export menu.
   */
  function toggleExportMenu() {
    if (document.getElementById('export-menu')) {
      hideExportMenu();
    } else {
      showExportMenu();
    }
  }

  /**
   * Shows the export menu.
   */
  function showExportMenu() {
    const template = document.importNode(
      document.getElementById('tmp-export-options').content,
      true
    );
    containerCookie.appendChild(template.getElementById('export-menu'));

    document.getElementById('export-json').focus();
    document.getElementById('export-json').addEventListener('click', event => {
      exportToJson();
    });
    document
      .getElementById('export-headerstring')
      .addEventListener('click', event => {
        exportToHeaderstring();
      });
    document
      .getElementById('export-netscape')
      .addEventListener('click', event => {
        exportToNetscape();
      });
  }

  /**
   * Hides the export menu.
   */
  function hideExportMenu() {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) {
      containerCookie.removeChild(exportMenu);
      document.activeElement.blur();
    }
  }

  /**
   * Toggles the visibility of the remote sync menu.
   */
  function toggleRemoteSyncMenu() {
    hideExportMenu();
    if (document.getElementById('remote-sync-menu')) {
      hideRemoteSyncMenu();
    } else {
      showRemoteSyncMenu();
    }
  }

  /**
   * Shows the remote sync menu.
   */
  function showRemoteSyncMenu() {
    const template = document.importNode(
      document.getElementById('tmp-remote-sync-options').content,
      true
    );
    containerCookie.appendChild(template.getElementById('remote-sync-menu'));

    document.getElementById('remote-sync-push').focus();
    document
      .getElementById('remote-sync-push')
      .addEventListener('click', () => {
        pushCookiesToRemote();
      });
    document
      .getElementById('remote-sync-pull')
      .addEventListener('click', () => {
        pullCookiesFromRemote();
      });
  }

  /**
   * Hides the remote sync menu.
   */
  function hideRemoteSyncMenu() {
    const remoteSyncMenu = document.getElementById('remote-sync-menu');
    if (remoteSyncMenu) {
      containerCookie.removeChild(remoteSyncMenu);
      document.activeElement.blur();
    }
  }

  if (typeof createHtmlFormCookie === 'undefined') {
    // This should not happen anyway ;)
    // eslint-disable-next-line no-func-assign
    createHtmlFormCookie = createHtmlForCookie;
  }

  /**
   * Exports all the cookies for the current tab in the JSON format.
   */
  function exportToJson() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    copyText(JsonFormat.format(loadedCookies));

    sendNotification('Cookies exported to clipboard as JSON');
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  /**
   * Exports all the cookies for the current tab in the header string format.
   */
  function exportToHeaderstring() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    copyText(HeaderstringFormat.format(loadedCookies));

    sendNotification('Cookies exported to clipboard as Header String');
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  /**
   * Exports all the cookies for the current tab in the Netscape format.
   */
  function exportToNetscape() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    copyText(NetscapeFormat.format(loadedCookies));

    sendNotification('Cookies exported to clipboard as Netscape format');
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  /**
   * Pushes all cookies in the current site scope to the remote server.
   */
  async function pushCookiesToRemote() {
    if (remoteSyncBusy) {
      return;
    }
    hideRemoteSyncMenu();

    const config = getRemoteSyncConfig();
    if (!config) {
      return;
    }

    remoteSyncBusy = true;
    setRemoteSyncIcon('../sprites/solid.svg#cloud-upload-alt');
    try {
      const domain = getCurrentSyncDomain();
      const cookies = await getCookiesForSyncDomain(domain);
      const payload = {
        version: 1,
        domain: domain,
        updatedAt: new Date().toISOString(),
        source: {
          browser: browserDetector.getBrowserName(),
          extensionVersion: browserDetector.getApi().runtime.getManifest()
            .version,
        },
        cookies: cookies.map(normalizeCookieForRemote),
      };

      const response = await fetch(
        config.baseUrl + '/v1/cookie-sets/' + encodeURIComponent(domain),
        {
          method: 'PUT',
          headers: getRemoteSyncHeaders(config),
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error(await getRemoteSyncError(response));
      }

      setRemoteSyncIcon('../sprites/solid.svg#check', true);
      sendNotification('Cookies pushed to remote for ' + domain);
    } catch (error) {
      console.error(error);
      setRemoteSyncIcon('../sprites/solid.svg#times', true);
      sendNotification('Remote push failed: ' + error.message);
    } finally {
      remoteSyncBusy = false;
    }
  }

  /**
   * Pulls cookies from the remote server and replaces local cookies in scope.
   */
  async function pullCookiesFromRemote() {
    if (remoteSyncBusy) {
      return;
    }
    hideRemoteSyncMenu();

    const config = getRemoteSyncConfig();
    if (!config) {
      return;
    }

    remoteSyncBusy = true;
    setRemoteSyncIcon('../sprites/solid.svg#cloud-download-alt');
    try {
      const domain = getCurrentSyncDomain();
      const response = await fetch(
        config.baseUrl + '/v1/cookie-sets/' + encodeURIComponent(domain),
        {
          headers: getRemoteSyncHeaders(config),
        }
      );
      if (response.status === 404) {
        setRemoteSyncIcon('../sprites/solid.svg#sync-alt', true);
        sendNotification('No remote cookies saved for ' + domain);
        return;
      }
      if (!response.ok) {
        throw new Error(await getRemoteSyncError(response));
      }

      const payload = await response.json();
      validateRemoteCookiePayload(payload, domain);
      const cookieCount = payload.cookies.length;
      const shouldReplace = confirm(
        'Replace all local cookies for ' +
          domain +
          ' with ' +
          cookieCount +
          ' remote cookies?'
      );
      if (!shouldReplace) {
        setRemoteSyncIcon('../sprites/solid.svg#sync-alt', true);
        return;
      }

      const localCookies = await getCookiesForSyncDomain(domain);
      await removeCookiesForRemoteSync(localCookies);
      const failures = await saveCookiesFromRemote(payload.cookies);
      showCookiesForTab();

      if (failures.length) {
        setRemoteSyncIcon('../sprites/solid.svg#times', true);
        sendNotification(
          'Remote pull finished with ' + failures.length + ' failures'
        );
        return;
      }

      setRemoteSyncIcon('../sprites/solid.svg#check', true);
      sendNotification('Remote cookies imported for ' + domain);
    } catch (error) {
      console.error(error);
      setRemoteSyncIcon('../sprites/solid.svg#times', true);
      sendNotification('Remote pull failed: ' + error.message);
    } finally {
      remoteSyncBusy = false;
    }
  }

  /**
   * Gets the configured remote sync server settings.
   * @return {object|null} Remote sync config.
   */
  function getRemoteSyncConfig() {
    const baseUrl = optionHandler.getRemoteSyncUrl().replace(/\/+$/, '');
    const token = optionHandler.getRemoteSyncBearerToken();
    if (!baseUrl || !token) {
      sendNotification('Configure remote sync in options first.');
      return null;
    }
    return {
      baseUrl: baseUrl,
      token: token,
    };
  }

  /**
   * Gets request headers for remote sync API calls.
   * @param {object} config Remote sync config.
   * @return {object} Fetch headers.
   */
  function getRemoteSyncHeaders(config) {
    return {
      Authorization: 'Bearer ' + config.token,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Extracts a useful remote sync error message.
   * @param {Response} response Fetch response.
   * @return {Promise<string>} Error message.
   */
  async function getRemoteSyncError(response) {
    let details = '';
    try {
      details = await response.text();
    } catch (error) {
      console.warn(error);
    }
    return 'HTTP ' + response.status + (details ? ': ' + details : '');
  }

  /**
   * Sets the icon for the remote sync button.
   * @param {string} iconHref SVG symbol href.
   * @param {boolean} reset Whether to reset back to the sync icon.
   */
  function setRemoteSyncIcon(iconHref, reset = false) {
    const buttonIcon = document
      .getElementById('remote-sync-cookies')
      .querySelector('use');
    buttonIcon.setAttribute('href', iconHref);
    if (reset) {
      setTimeout(() => {
        buttonIcon.setAttribute('href', '../sprites/solid.svg#sync-alt');
      }, 1500);
    }
  }

  /**
   * Gets the current site scope used by the remote sync backend.
   * @return {string} Normalized domain scope.
   */
  function getCurrentSyncDomain() {
    const currentUrl = getCurrentTabUrl();
    const hostname = getDomainFromUrl(currentUrl);
    if (!hostname) {
      throw new Error('Remote sync is only available on web pages.');
    }
    if (hostname === 'localhost' || isIpv4Address(hostname)) {
      return hostname;
    }
    return permissionHandler.getRootDomainName(hostname);
  }

  /**
   * Gets all cookies in the current remote sync domain.
   * @param {string} domain Domain scope.
   * @return {Promise<object[]>} Cookies from the browser API.
   */
  function getCookiesForSyncDomain(domain) {
    return new Promise(resolve => {
      cookieHandler.getAllCookiesForDomain(domain, cookies => {
        resolve(cookies || []);
      });
    });
  }

  /**
   * Normalizes a browser cookie for remote storage.
   * @param {object} cookie Browser cookie object.
   * @return {object} Serializable cookie object.
   */
  function normalizeCookieForRemote(cookie) {
    const keys = [
      'name',
      'value',
      'domain',
      'hostOnly',
      'path',
      'secure',
      'httpOnly',
      'sameSite',
      'expirationDate',
      'session',
      'partitionKey',
      'firstPartyDomain',
    ];
    const normalizedCookie = {};
    for (const key of keys) {
      if (cookie[key] !== undefined) {
        normalizedCookie[key] = cookie[key];
      }
    }
    if (normalizedCookie.sameSite === 'unspecified') {
      normalizedCookie.sameSite = null;
    }
    return normalizedCookie;
  }

  /**
   * Validates a remote cookie payload before local cookies are cleared.
   * @param {object} payload Remote payload.
   * @param {string} expectedDomain Expected domain scope.
   */
  function validateRemoteCookiePayload(payload, expectedDomain) {
    if (!payload || payload.version !== 1) {
      throw new Error('Remote cookie payload has an unsupported version.');
    }
    if (payload.domain !== expectedDomain) {
      throw new Error('Remote cookie payload domain does not match.');
    }
    if (!isArray(payload.cookies)) {
      throw new Error('Remote cookie payload does not contain cookies.');
    }
  }

  /**
   * Removes a list of cookies with exact tuple semantics.
   * @param {object[]} cookies Browser cookies to remove.
   */
  async function removeCookiesForRemoteSync(cookies) {
    for (const cookie of cookies) {
      await new Promise(resolve => {
        cookieHandler.removeCookieDetails(cookie, function (error) {
          if (error) {
            console.warn(error);
          }
          resolve();
        });
      });
    }
  }

  /**
   * Saves remote cookies into the current cookie store.
   * @param {object[]} cookies Cookies from the remote payload.
   * @return {Promise<string[]>} Import failure messages.
   */
  async function saveCookiesFromRemote(cookies) {
    const failures = [];
    for (const cookie of cookies) {
      const cookieToSave = Object.assign({}, cookie);
      cookieToSave.storeId = cookieHandler.currentTab.cookieStoreId;
      if (cookieToSave.sameSite === 'unspecified') {
        cookieToSave.sameSite = null;
      }

      await new Promise(resolve => {
        try {
          cookieHandler.saveCookie(
            cookieToSave,
            getCurrentTabUrl(),
            function (error) {
              if (error) {
                failures.push(error);
              }
              resolve();
            }
          );
        } catch (error) {
          failures.push(error.message);
          resolve();
        }
      });
    }
    return failures;
  }

  /**
   * Removes a cookie from the current tab.
   * @param {string} name Name of the cookie to remove.
   * @param {string} url Url of the tab that contains the cookie.
   * @param {function} callback
   */
  function removeCookie(name, url, callback) {
    cookieHandler.removeCookie(name, url || getCurrentTabUrl(), function (e) {
      console.log('removed successfuly', e);
      if (callback) {
        callback();
      }
      if (browserDetector.isSafari()) {
        onCookiesChanged();
      }
    });
  }

  /**
   * Handles the CookiesChanged event and updates the interface.
   * @param {object} changeInfo
   */
  function onCookiesChanged(changeInfo) {
    if (!changeInfo) {
      showCookiesForTab();
      return;
    }

    console.log('Cookies have changed!', changeInfo.removed, changeInfo.cause);
    const id = Cookie.hashCode(changeInfo.cookie);

    if (changeInfo.cause === 'overwrite') {
      return;
    }

    if (changeInfo.removed) {
      if (loadedCookies[id]) {
        loadedCookies[id].removeHtml(() => {
          if (!Object.keys(loadedCookies).length) {
            showNoCookies();
          }
        });
        delete loadedCookies[id];
      }
      return;
    }

    if (loadedCookies[id]) {
      loadedCookies[id].updateHtml(changeInfo.cookie);
      return;
    }

    const newCookie = new Cookie(id, changeInfo.cookie, optionHandler);
    loadedCookies[id] = newCookie;

    if (!cookiesListHtml && document.getElementById('no-cookies')) {
      clearChildren(containerCookie);
      cookiesListHtml = document.createElement('ul');
      cookiesListHtml.appendChild(generateSearchBar());
      containerCookie.appendChild(cookiesListHtml);
    }

    if (cookiesListHtml) {
      cookiesListHtml.appendChild(newCookie.html);
    }
  }

  /**
   * Evaluates two cookies to determine which comes first when sorting them.
   * @param {object} a First cookie.
   * @param {object} b Second cookie.
   * @return {int} -1 if a should show first, 0 if they are equal, otherwise 1.
   */
  function sortCookiesByName(a, b) {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  }

  /**
   * Initialises the interface.
   * @param {object} _tab The current Tab.
   */
  async function initWindow(_tab) {
    await optionHandler.loadOptions();
    themeHandler.updateTheme();
    moveButtonBar();
    handleAd();
    handleAnimationsEnabled();
    optionHandler.on('optionsChanged', onOptionsChanged);
    cookieHandler.on('cookiesChanged', onCookiesChanged);
    cookieHandler.on('ready', showCookiesForTab);
    document.querySelector('#advanced-toggle-all').checked =
      optionHandler.getCookieAdvanced();
    if (cookieHandler.isReady) {
      showCookiesForTab();
    }
    showVersion();
  }

  /**
   * Gets the URL of the current tab.
   * @return {string} The URL of the current tab, otherwise empty string if
   *     we can't get the current tab.
   */
  function getCurrentTabUrl() {
    if (cookieHandler.currentTab) {
      return cookieHandler.currentTab.url;
    }
    return '';
  }

  /**
   * Gets the domain of an URL.
   * @param {string} url URL to extract the domain from.
   * @return {string} The domain extracted.
   */
  function getDomainFromUrl(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        return parsedUrl.hostname.toLowerCase().replace(/\.$/, '');
      }
    } catch (error) {
      console.warn(error);
    }
    return '';
  }

  /**
   * Checks if a hostname is an IPv4 address.
   * @param {string} hostname Hostname to check.
   * @return {boolean} True when the hostname is IPv4.
   */
  function isIpv4Address(hostname) {
    const parts = hostname.split('.');
    if (parts.length !== 4) {
      return false;
    }
    return parts.every(part => {
      const partNumber = Number(part);
      return part !== '' && partNumber >= 0 && partNumber <= 255;
    });
  }

  /**
   * Adds a notification to the notification queue.
   * @param {string} message Message to display in the notification.
   */
  function sendNotification(message) {
    notificationQueue.push(message);
    triggerNotification();
  }

  /**
   * Generates the HTML for the search bar.
   * @return {string} The HTML to display the search bar.
   */
  function generateSearchBar() {
    const searchBarContainer = document.importNode(
      document.getElementById('tmp-search-bar').content,
      true
    );
    searchBarContainer
      .getElementById('searchField')
      .addEventListener('keyup', e => filterCookies(e.target, e.target.value));
    return searchBarContainer;
  }

  /**
   * Starts displaying the next notification in the queue if there is one.
   * This will also make sure that wer are not already in the middle of
   * displaying a notification already.
   */
  function triggerNotification() {
    if (!notificationQueue || !notificationQueue.length) {
      return;
    }
    if (notificationTimeout) {
      return;
    }
    if (notificationElement.classList.contains('fadeInUp')) {
      return;
    }

    showNotification();
  }

  /**
   * Creates the HTML for a notification and animates it into view for a
   * specific amount of time. Then it will dismiss itself if the user doesn't
   * dismiss it manually.
   */
  function showNotification() {
    if (notificationTimeout) {
      return;
    }

    notificationElement.parentElement.style.display = 'block';
    notificationElement.querySelector('#notification-dismiss').style.display =
      'block';
    notificationElement.querySelector('span').textContent =
      notificationQueue.shift();
    notificationElement.querySelector('span').setAttribute('role', 'alert');
    notificationElement.classList.add('fadeInUp');
    notificationElement.classList.remove('fadeOutDown');

    notificationTimeout = setTimeout(() => {
      hideNotification();
    }, 2500);
  }

  /**
   * Hides a notification.
   */
  function hideNotification() {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }

    notificationElement.querySelector('span').setAttribute('role', '');
    notificationElement.classList.remove('fadeInUp');
    notificationElement.classList.add('fadeOutDown');
    notificationElement.querySelector('#notification-dismiss').style.display =
      'none';
  }

  /**
   * Sets the page title.
   * @param {string} title Title to display.
   */
  function setPageTitle(title) {
    if (!pageTitleContainer) {
      return;
    }

    pageTitleContainer.querySelector('h1').textContent = title;
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
   * Checks if a value is an arary.
   * @param {any} value Value to evaluate.
   * @return {boolean} true if the value is an array, otherwise false.
   */
  function isArray(value) {
    return value && typeof value === 'object' && value.constructor === Array;
  }

  /**
   * Clears all the children of an element.
   * @param {element} element Element to clear its children.
   */
  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Adjusts the width of the interface if the container it's in is smaller than
   * a specific size.
   */
  function adjustWidthIfSmaller() {
    const realWidth = document.documentElement.clientWidth;
    if (realWidth < 500) {
      console.log('Editor is smaller than 500px!');
      document.body.style.minWidth = '100%';
      document.body.style.width = realWidth + 'px';
    }
  }

  /**
   * Filters the cookies based on keywords. Used for searching.
   * @param {element} target The searchbox.
   * @param {*} filterText The text to search for.
   */
  function filterCookies(target, filterText) {
    const cookies = cookiesListHtml.querySelectorAll('.cookie');
    filterText = filterText.toLowerCase();

    if (filterText) {
      target.classList.add('content');
    } else {
      target.classList.remove('content');
    }

    for (let i = 0; i < cookies.length; i++) {
      const cookieElement = cookies[i];
      const cookieName = cookieElement.children[0]
        .getElementsByTagName('span')[0]
        .textContent.toLocaleLowerCase();
      if (!filterText || cookieName.indexOf(filterText) > -1) {
        cookieElement.classList.remove('hide');
      } else {
        cookieElement.classList.add('hide');
      }
    }
  }

  /**
   * Handles the main logic of displaying ads. This will check if there are any
   * ads that can be displayed and will select a random one to display if there
   * are more than one valid option.
   */
  async function handleAd() {
    const canShow = await adHandler.canShowAnyAd();
    if (!canShow) {
      return;
    }
    const selectedAd = await adHandler.getRandomValidAd();
    if (selectedAd === false) {
      console.log('No valid ads to display');
      return;
    }
    clearAd();
    const adItemHtml = displayAd(selectedAd);
    document.getElementById('ad-container').appendChild(adItemHtml);
  }
  /**
   * Removes the currently displayed ad from the interface.
   */
  function clearAd() {
    clearChildren(document.getElementById('ad-container'));
  }

  /**
   * Creates the HTML to display an ad and assigns the event handlers.
   * @param {object} adObject Ad to display.
   * @return {string} The HTML representation of the ad.
   */
  function displayAd(adObject) {
    const template = document.importNode(
      document.getElementById('tmp-ad-item').content,
      true
    );
    const link = template.querySelector('.ad-link a');
    link.textContent = adObject.text;
    link.title = adObject.tooltip;
    link.href = adObject.url;

    template.querySelector('.dont-show').addEventListener('click', e => {
      clearAd();
      adHandler.markAdAsDismissed(adObject);
    });
    template.querySelector('.later').addEventListener('click', e => {
      clearAd();
    });

    return template;
  }

  /**
   * Handles the changes required to the interface when the options are changed
   * by an external source.
   * @param {Option} oldOptions the options before changes.
   */
  function onOptionsChanged(oldOptions) {
    handleAnimationsEnabled();
    moveButtonBar();
    if (oldOptions.advancedCookies != optionHandler.getCookieAdvanced()) {
      document.querySelector('#advanced-toggle-all').checked =
        optionHandler.getCookieAdvanced();
      showCookiesForTab();
    }

    if (oldOptions.extraInfo != optionHandler.getExtraInfo()) {
      showCookiesForTab();
    }
  }

  /**
   * Moves the button bar to the top or bottom depending on the user preference
   */
  function moveButtonBar() {
    const siblingElement = optionHandler.getButtonBarTop()
      ? document.getElementById('pageTitle').nextSibling
      : document.body.lastChild;
    document.querySelectorAll('.button-bar').forEach(bar => {
      siblingElement.parentNode.insertBefore(bar, siblingElement);
      if (optionHandler.getButtonBarTop()) {
        document.body.classList.add('button-bar-top');
      } else {
        document.body.classList.remove('button-bar-top');
      }
    });
  }
})();
