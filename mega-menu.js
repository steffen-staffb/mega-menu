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
      /* Vorhandenes Submenü-Popover unterdrücken (Selektor an reale DOM-Struktur angepasst) */
      '[data-base-ui-portal] [data-base-ui-navigation-menu-trigger],',
      '[data-base-ui-portal] > div[data-open]:not(.nav-backdrop) {',
      '  display: none !important;',
      '}',
      /* Backdrop sichtbar transparent halten UND Klicks durchlassen */
      '.nav-backdrop {',
      '  background-color: transparent !important;',
      '  pointer-events: none !important;',
      '}',

      /* Mega-Menü-Overlay */
      '#sb-megamenu {',
      '  position: fixed;',
      '  left: 0; right: 0;',
      '  top: 84px;',
      '  z-index: 10000;',
      '  background: #ececec;',
      '  color: #111;',
      '  box-shadow: 0 6px 16px rgba(0,0,0,0.12);',
      '  padding: 24px 48px;',
      '  display: none;',
      '  pointer-events: auto !important;',
      '}',
      '#sb-megamenu.open { display: block; }',

      '#sb-megamenu .sb-mm-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(4, 1fr);',
      '  gap: 24px 48px;',
      '  max-width: 1332px;',
      '  margin: 0 auto;',
      '}',
      '#sb-megamenu .sb-mm-col h3 {',
      '  font-size: 16px;',
      '  font-weight: 700;',
      '  margin: 0 0 12px;',
      '  color: #111;',
      '}',
      '#sb-megamenu .sb-mm-col h3 a {',
      '  color: inherit; text-decoration: none;',
      '}',
      '#sb-megamenu .sb-mm-col ul {',
      '  list-style: none; margin: 0; padding: 0;',
      '}',
      '#sb-megamenu .sb-mm-col li { margin: 6px 0; }',
      '#sb-megamenu .sb-mm-col a {',
      '  color: #222; text-decoration: none; font-size: 14px;',
      '  pointer-events: auto;',
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
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

  // Selektor für sichtbare Hauptmenü-Items
  var PRIMARY_NAV_SELECTOR =
    'header nav[aria-label="Hauptmenü"] > ul > li, ' +
    'header nav[aria-label="Main menu"] > ul > li';

  // Selektor für Overflow-Items (off-screen, sichtbar im "Mehr"-Dropdown)
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
    // "Mehr" / "More" -Button: button ohne href innerhalb des li
    var hasLink = !!li.querySelector('a[href]');
    var hasButton = !!li.querySelector('button');
    return !hasLink && hasButton;
  }

  // ---------- 3. API-Layer mit einfachem Cache ----------
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

  // Lade direkte Kinder + Enkel parallel
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

  // Für "Mehr": baue ein Panel aus allen Overflow-Items mit deren Kindern
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

  // ---------- 4. Overlay rendern ----------
  function ensureOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.addEventListener('mouseleave', function () { closeOverlay(); });
    document.body.appendChild(el);
    return el;
  }

  function renderOverlay(columns) {
    var el = ensureOverlay();
    if (!columns.length) { closeOverlay(); return; }
    var html = '<div class="sb-mm-grid">';
    columns.forEach(function (col) {
      html += '<div class="sb-mm-col">';
      html += '<h3><a href="' + col.url + '">' + escapeHtml(col.title) + '</a></h3>';
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
  }

  function closeOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) el.classList.remove('open');
  }

  // ---------- 5. Hover-Logik per Event-Delegation ----------
  var currentLi  = null;
  var openTimer  = null;
  var closeTimer = null;

  function findMenuLi(target) {
    if (!target || !target.closest) return null;
    return target.closest(PRIMARY_NAV_SELECTOR);
  }

  function onPointerOver(ev) {
    var li = findMenuLi(ev.target);
    if (!li) return;
    if (li === currentLi) return;
    currentLi = li;

    clearTimeout(closeTimer);
    clearTimeout(openTimer);

    // Fall A: "Mehr"-Trigger – zeige alle Overflow-Items
    if (isOverflowTrigger(li)) {
      openTimer = setTimeout(function () {
        loadOverflowMenu()
          .then(function (cols) { renderOverlay(cols); })
          .catch(function (e) { console.warn('[megamenu] overflow load failed', e); });
      }, 120);
      return;
    }

    // Fall B: Normaler Menüpunkt – zeige Ebene 2 + 3
    var a = li.querySelector('a[href]');
    if (!a) { closeOverlay(); return; }
    var id = idFromHref(a.getAttribute('href'));
    if (!id) { closeOverlay(); return; }

    openTimer = setTimeout(function () {
      loadTwoLevels(id)
        .then(function (cols) { renderOverlay(cols); })
        .catch(function (e) { console.warn('[megamenu] load failed', e); });
    }, 120);
  }

  function onPointerOut(ev) {
    var related = ev.relatedTarget;
    if (related && related.closest) {
      // Cursor noch im Header, Overlay oder Native-Portal? → offen lassen
      if (related.closest('header')) return;
      if (related.closest('#' + OVERLAY_ID)) return;
      if (related.closest('[data-base-ui-portal]')) return;
    }
    currentLi = null;
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(closeOverlay, 200);
  }

  document.addEventListener('mouseover', onPointerOver, true);
  document.addEventListener('mouseout',  onPointerOut,  true);

  // ESC schließt das Menü
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { currentLi = null; closeOverlay(); }
  });
})();
