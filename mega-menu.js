(function () {
  'use strict';

  // ---------- 1. Konfiguration ----------
  var LANG_FALLBACK_ORDER = ['en_US', 'de_DE'];
  var HEADER_NAV_SELECTOR  = 'header nav[aria-label] > ul';
  var OVERLAY_ID           = 'bsh-megamenu';
  var CACHE_TTL_MS         = 5 * 60 * 1000; // 5 Minuten

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

  // ---------- 4. Overlay rendern ----------
  function ensureOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.addEventListener('mouseleave', closeOverlay);
    document.body.appendChild(el);
    return el;
  }

  function renderOverlay(columns) {
    var el = ensureOverlay();
    if (!columns.length) { closeOverlay(); return; }
    var html = '<div class="bsh-mm-grid">';
    columns.forEach(function (col) {
      html += '<div class="bsh-mm-col">';
      html += '<h3><a href="' + col.url + '">' + escapeHtml(col.title) + '</a></h3>';
      html += '<ul>';
      col.children.forEach(function (item) {
        html += '<li><a href="' + item.url + '">' + escapeHtml(item.title) + '</a></li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.classList.add('open');
  }

  function closeOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) el.classList.remove('open');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // ---------- 5. Hover-Logik an Hauptmenüpunkte hängen ----------
  var hoverTimer = null;

  function attachHover(li) {
    var a = li.querySelector('a[href]');
    if (!a || li.dataset.bshMmBound) return;
    var id = idFromHref(a.getAttribute('href'));
    if (!id) return;
    li.dataset.bshMmBound = '1';

    li.addEventListener('mouseenter', function () {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () {
        loadTwoLevels(id).then(renderOverlay).catch(function (e) {
          console.warn('[megamenu] load failed', e);
        });
      }, 120); // kleine Verzögerung gegen Hover-Flackern
    });
    li.addEventListener('mouseleave', function (ev) {
      clearTimeout(hoverTimer);
      // wenn Cursor ins Overlay wandert, offen lassen
      var related = ev.relatedTarget;
      if (related && related.closest && related.closest('#' + OVERLAY_ID)) return;
      hoverTimer = setTimeout(closeOverlay, 200);
    });
  }

  function init() {
    var ul = document.querySelector(HEADER_NAV_SELECTOR);
    if (!ul) return false;
    ul.querySelectorAll(':scope > li').forEach(attachHover);
    return true;
  }

  // SPA-fest: bei Routenwechseln neu binden
  function bootstrap() {
    if (init()) return;
    var attempts = 0;
    var t = setInterval(function () {
      if (init() || ++attempts > 40) clearInterval(t);
    }, 250);
  }

  // Beobachte DOM-Änderungen (Staffbase ist eine SPA)
  var mo = new MutationObserver(function () { init(); });
  mo.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
