/**
 * Staffbase Mega-Menü
 * ------------------------------------------------------------
 * Ersetzt das Standard-Submenü der Top-Navigation durch ein
 * breites Mega-Menü-Overlay, das Ebene 2 + 3 gleichzeitig anzeigt.
 *
 * Authentifizierung: läuft über das HttpOnly-Session-Cookie des
 * eingeloggten Users (credentials: 'include'). Es werden nur
 * Inhalte abgerufen, die der User ohnehin sehen darf.
 */
(function () {
  'use strict';

  // ---------- 0. CSS in den Head injizieren ----------
  (function injectStyles() {
    if (document.getElementById('sb-megamenu-styles')) return;
    var css = [
      /* Vorhandenes Submenü-Popover unterdrücken */
      '[data-base-ui-portal] [data-base-ui-navigation-menu-trigger],',
      '[data-base-ui-portal] > div[data-open]:not(.nav-backdrop) {',
      '  display: none !important;',
      '}',
      '.nav-backdrop {',
      '  background-color: transparent !important;',
      '  pointer-events: none !important;',
      '}',

      /* Mega-Menü-Overlay – Breite & Position werden zur Laufzeit dynamisch
         auf die orange NavBar abgestimmt (siehe updateOverlayPosition). */
      '#sb-megamenu {',
      '  position: fixed;',
      '  left: 0;',
      '  width: max-content;',
      '  max-width: calc(100% - 64px);',
      '  top: 84px;',
      '  z-index: 10000;',
      '  background: #dedede;',
      '  color: #111;',
      '  box-shadow: 0 6px 16px rgba(0,0,0,0.12);',
      '  border-radius: 16px;',
      '  padding: 24px 48px;',
      '  display: none;',
      '  pointer-events: auto !important;',
      '  box-sizing: border-box;',
      '}',
      '#sb-megamenu.open { display: block; }',

      /* Unsichtbare Hover-Brücke nach oben, damit der Hover beim Übergang
         vom Trigger zum Overlay nicht abreißt. Höhe = Lücke + etwas Puffer. */
      '#sb-megamenu::before {',
      '  content: "";',
      '  position: absolute;',
      '  left: 0; right: 0;',
      '  top: -24px;',
      '  height: 24px;',
      '  background: transparent;',
      '  pointer-events: auto;',
      '}',

      '#sb-megamenu .sb-mm-grid {',
      '  display: grid;',
      '  grid-auto-flow: column;',
      '  grid-auto-columns: max-content;',
      '  gap: 24px 48px;',
      '  width: 100%;',
      '  margin: 0 auto;',
      '}',
      '#sb-megamenu .sb-mm-col h3 {',
      '  font-size: 16px;',
      '  font-weight: 700;',
      '  margin: 0 0 12px;',
      '  color: #111;',
      '}',
      /* Ordner-Überschrift ist nicht klickbar */
      '#sb-megamenu .sb-mm-col h3.sb-mm-folder {',
      '  cursor: default;',
      '  user-select: none;',
      '}',
      '#sb-megamenu .sb-mm-col ul {',
      '  list-style: none; margin: 0; padding: 0;',
      '}',
      '#sb-megamenu .sb-mm-col li { margin: 6px 0; }',
      '#sb-megamenu .sb-mm-col a {',
      '  color: #222; text-decoration: none; font-size: 14px;',
      '  pointer-events: auto;',
      '  cursor: pointer;',
      '}',
      '#sb-megamenu .sb-mm-col a:hover { text-decoration: underline; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'sb-megamenu-styles';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ---------- 1. Konfiguration ----------
  var LANG_FALLBACK_ORDER = ['en_US', 'de_DE'];
  var OVERLAY_ID = 'sb-megamenu';
  var CACHE_TTL_MS = 5 * 60 * 1000;
  var OPEN_DELAY_MS = 120;
  var CLOSE_DELAY_MS = 350;

  var PRIMARY_NAV_SELECTOR =
    'header nav[aria-label="Hauptmenü"] > ul > li, ' +
    'header nav[aria-label="Main menu"] > ul > li';

  var OVERFLOW_NAV_SELECTOR =
    'header nav:not([aria-label]) > ul > li';

  // ---------- 2. Hilfsfunktionen ----------
  function pickTitle(node) {
    var loc = (node.config && node.config.localization) || {};
    var docLang = (document.documentElement.lang || '').replace('-', '_');
    var keys = [docLang].concat(LANG_FALLBACK_ORDER);
    for (var i = 0; i < keys.length; i++) {
      if (loc[keys[i]] && loc[keys[i]].title) return loc[keys[i]].title;
    }
    var any = Object.values(loc)[0];
    return (any && any.title) || '(ohne Titel)';
  }

  function idFromHref(href) {
    var m = href && href.match(/\/(page|menu|network)\/([a-f0-9]+)/);
    return m ? m[2] : null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function isOverflowTrigger(li) {
    var hasLink = !!li.querySelector('a[href]');
    var hasButton = !!li.querySelector('button');
    return !hasLink && hasButton;
  }

  function isInternalUrl(href) {
    if (!href) return false;
    if (href.startsWith('/')) return true;
    try {
      var u = new URL(href, location.origin);
      return u.origin === location.origin;
    } catch (e) { return false; }
  }

  // ---------- 3. Overlay-Position dynamisch an Header andocken ----------
  function updateOverlayPosition() {
    var el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    var header = document.querySelector('header');
    if (!header) return;
    var headerRect = header.getBoundingClientRect();
    // Unterkante des Headers = obere Kante des Overlays (keine Lücke)
    el.style.top = Math.max(0, Math.round(headerRect.bottom)) + 'px';
    // Maximale Breite an der NavBar-Breite orientieren.
    // Die tatsächliche Breite ergibt sich dynamisch aus dem Inhalt (max-content).
    el.style.maxWidth = Math.round(headerRect.width) + 'px';

    // Links an der linken Kante des aktiven Level-1-Triggers ausrichten.
    // Fallback: linke Kante der NavBar, falls (noch) kein Trigger bekannt ist.
    var anchor = (currentLi && currentLi.getBoundingClientRect)
      ? currentLi.getBoundingClientRect()
      : null;
    var desiredLeft = anchor ? anchor.left : headerRect.left;

    // Damit das Overlay nicht über die rechte NavBar-Kante hinausragt,
    // klemmen wir die linke Position an die rechte NavBar-Grenze minus
    // tatsächlicher Overlay-Breite.
    var overlayWidth = el.getBoundingClientRect().width || 0;
    var maxLeft = headerRect.right - overlayWidth;
    var minLeft = headerRect.left;
    var clampedLeft = Math.min(Math.max(desiredLeft, minLeft), Math.max(maxLeft, minLeft));

    el.style.left = Math.round(clampedLeft) + 'px';
    // Brückenhöhe = etwas Puffer
    el.style.setProperty('--mm-bridge', '24px');
  }

  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition, true);

  // ---------- 4. API-Layer mit einfachem Cache ----------
  var cache = {};
  function fetchMenu(id) {
    var key = id || 'root';
    var entry = cache[key];
    if (entry && (Date.now() - entry.t < CACHE_TTL_MS)) return Promise.resolve(entry.data);
    var url = id ? '/api/menu/' + id : '/api/menu';
    return fetch(url, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) { cache[key] = { t: Date.now(), data: data }; return data; });
  }

  function loadTwoLevels(rootId) {
    return fetchMenu(rootId).then(function (root) {
      var lvl2 = (root.children && root.children.data) || [];
      var visible = lvl2.filter(function (c) {
        return (c.visibility || []).indexOf('desktop') !== -1;
      });
      return Promise.all(visible.map(function (c) {
        return fetchMenu(c.id).then(function (full) {
          return {
            id: c.id,
            title: pickTitle(c),
            url: (c.target && c.target.url) || '#',
            children: ((full.children && full.children.data) || [])
              .filter(function (g) { return (g.visibility || []).indexOf('desktop') !== -1; })
              .map(function (g) {
                return {
                  id: g.id,
                  title: pickTitle(g),
                  url: (g.target && g.target.url) || '#'
                };
              })
          };
        });
      }));
    });
  }

  function loadOverflowMenu() {
    var lis = document.querySelectorAll(OVERFLOW_NAV_SELECTOR);
    var jobs = [];
    lis.forEach(function (li) {
      var a = li.querySelector('a[href]');
      if (!a) return;
      var id = idFromHref(a.getAttribute('href'));
      if (!id) return;
      var title = (a.textContent || '').trim();
      var url = a.getAttribute('href');
      jobs.push(fetchMenu(id).then(function (node) {
        return {
          id: id,
          title: title,
          url: url,
          children: ((node.children && node.children.data) || [])
            .filter(function (g) { return (g.visibility || []).indexOf('desktop') !== -1; })
            .map(function (g) {
              return {
                id: g.id,
                title: pickTitle(g),
                url: (g.target && g.target.url) || '#'
              };
            })
        };
      }));
    });
    return Promise.all(jobs);
  }

  // ---------- 5. Hover-State ----------
  var hoveringTrigger = false;
  var hoveringOverlay = false;
  var currentLi = null;
  var openTimer = null;
  var closeTimer = null;

  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      if (!hoveringTrigger && !hoveringOverlay) {
        currentLi = null;
        closeOverlay();
      }
    }, CLOSE_DELAY_MS);
  }
  function cancelClose() { clearTimeout(closeTimer); }

  // ---------- 6. Overlay rendern ----------
  function ensureOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;

    el.addEventListener('mouseenter', function () {
      hoveringOverlay = true;
      cancelClose();
    });
    el.addEventListener('mouseleave', function () {
      hoveringOverlay = false;
      scheduleClose();
    });

    // Klick-Delegation für SPA-Navigation
    el.addEventListener('click', onOverlayClick, true);

    document.body.appendChild(el);
    updateOverlayPosition();
    return el;
  }

  function renderOverlay(columns) {
    var el = ensureOverlay();
    if (!columns.length) { closeOverlay(); return; }
    var html = '<div class="sb-mm-grid">';
    columns.forEach(function (col) {
      html += '<div class="sb-mm-col">';
      // Ordner-Überschrift: nicht klickbar rendern (kein <a>),
      // da der Ordner keine Landing Page hat und sonst auf die Startseite springt.
      html += '<h3 class="sb-mm-folder">' + escapeHtml(col.title) + '</h3>';
      if (col.children && col.children.length) {
        html += '<ul>';
        col.children.forEach(function (item) {
          html += '<li><a href="' + item.url + '">' + escapeHtml(item.title) + '</a></li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.classList.add('open');
    updateOverlayPosition();
  }

  function closeOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) el.classList.remove('open');
  }

  // ---------- 7. SPA-Navigation ----------
  function spaNavigate(href) {
    // Externe Links / neue Tabs etc. → normale Navigation
    if (!isInternalUrl(href)) {
      window.location.href = href;
      return;
    }
    try {
      // 1) Versuch: existierenden Header-Link mit gleicher href "fernsteuern".
      //    Damit wird der originale React-onClick-Handler ausgelöst (sauberste Lösung).
      var sameLink = document.querySelector(
        'header a[href="' + href + '"]'
      );
      if (sameLink) {
        sameLink.click();
        return;
      }

      // 2) Fallback: pushState + popstate – die meisten React-Router (v5/v6)
      //    reagieren darauf und rendern die neue Route ohne Full-Reload.
      var absolute = new URL(href, location.origin);
      window.history.pushState({}, '', absolute.pathname + absolute.search + absolute.hash);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    } catch (e) {
      // 3) Letzter Fallback: harte Navigation
      window.location.href = href;
    }
  }

  function onOverlayClick(ev) {
    // Nur primärer Klick ohne Modifier
    if (ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    if (a.getAttribute('target') === '_blank') return;

    var href = a.getAttribute('href');
    if (!href || href === '#') return;

    ev.preventDefault();
    ev.stopPropagation();

    // Menü schließen, dann navigieren
    hoveringTrigger = false;
    hoveringOverlay = false;
    currentLi = null;
    closeOverlay();

    // Harte Navigation für Level-3 Links, da die SPA-Auflösung
    // der /openlink/content/page/-URLs nicht zuverlässig zur Zielseite führt.
    window.location.assign(href);
  }

  // ---------- 8. Hover-Logik per Event-Delegation auf Trigger ----------
  function findMenuLi(target) {
    if (!target || !target.closest) return null;
    return target.closest(PRIMARY_NAV_SELECTOR);
  }

  function onPointerOver(ev) {
    var li = findMenuLi(ev.target);
    if (!li) return;

    hoveringTrigger = true;
    cancelClose();

    if (li === currentLi) return;
    currentLi = li;

    clearTimeout(openTimer);

    if (isOverflowTrigger(li)) {
      openTimer = setTimeout(function () {
        loadOverflowMenu()
          .then(function (cols) { renderOverlay(cols); })
          .catch(function (e) { console.warn('[megamenu] overflow load failed', e); });
      }, OPEN_DELAY_MS);
      return;
    }

    var a = li.querySelector('a[href]');
    if (!a) { closeOverlay(); return; }
    var id = idFromHref(a.getAttribute('href'));
    if (!id) { closeOverlay(); return; }

    openTimer = setTimeout(function () {
      loadTwoLevels(id)
        .then(function (cols) { renderOverlay(cols); })
        .catch(function (e) { console.warn('[megamenu] load failed', e); });
    }, OPEN_DELAY_MS);
  }

  function onPointerOut(ev) {
    var li = findMenuLi(ev.target);
    if (!li) return;

    var related = ev.relatedTarget;
    if (related && related.closest) {
      if (related.closest(PRIMARY_NAV_SELECTOR)) return;
      if (related.closest('#' + OVERLAY_ID)) { hoveringOverlay = true; return; }
      if (related.closest('header')) return;
      if (related.closest('[data-base-ui-portal]')) return;
    }

    hoveringTrigger = false;
    clearTimeout(openTimer);
    scheduleClose();
  }

  document.addEventListener('mouseover', onPointerOver, true);
  document.addEventListener('mouseout', onPointerOut, true);

  // ESC schließt das Menü
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      hoveringTrigger = false;
      hoveringOverlay = false;
      currentLi = null;
      closeOverlay();
    }
  });

  // Nach SPA-Navigation Menü zuverlässig schließen
  window.addEventListener('popstate', function () {
    hoveringTrigger = false;
    hoveringOverlay = false;
    currentLi = null;
    closeOverlay();
  });
})();
