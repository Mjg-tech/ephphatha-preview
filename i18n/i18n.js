/*
 * EPHPHATHA - language layer (French / English / Portuguese).
 *
 * The site is a compiled app whose texts are French.  This script translates what is DISPLAYED, using
 * dictionary.js, and never changes what the app sends to the server (form values stay French).
 *
 *  - first visit: language of the visitor's device/browser (fr, en or pt; anything else -> French);
 *  - the visitor can change it with the FR | EN | PT switch in the header; the choice is remembered;
 *  - a link ending in ?lang=en (or fr / pt) opens the site in that language.
 *
 * A French text that is not in the dictionary stays in French (nothing breaks).
 */
(function () {
  'use strict';

  var LANGS = ['fr', 'en', 'pt'];
  var DEFAULT_LANG = 'fr';
  var STORE_KEY = 'eph-lang';
  var ATTRS = ['placeholder', 'aria-label', 'alt', 'title'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, TITLE: 1 };
  var META_SELECTORS = [
    'meta[name="description"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]'
  ];
  var LABELS = { fr: 'Langue', en: 'Language', pt: 'Idioma' };
  var NAMES = { fr: 'Français', en: 'English', pt: 'Português' };

  var dict = window.EPH_DICTIONARY || {};
  var lang = DEFAULT_LANG;

  // ---------- language choice ----------
  function storeGet() { try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function storeSet(v) { try { window.localStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode */ } }
  function fromTag(tag) {
    var base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    return LANGS.indexOf(base) >= 0 ? base : null;
  }
  function detect() {
    var q = /[?&]lang=([A-Za-z_-]+)/.exec(window.location.search);
    var fromQuery = q && fromTag(q[1]);
    if (fromQuery) { storeSet(fromQuery); return fromQuery; }
    var saved = fromTag(storeGet());
    if (saved) return saved;
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    for (var i = 0; i < list.length; i++) {
      var l = fromTag(list[i]);
      if (l) return l;
    }
    return DEFAULT_LANG;
  }

  // ---------- translation ----------
  // texts that the app assembles itself from pieces ("Étape 2 / 4 - Coordonnées", "5 – 14 participants")
  var PATTERNS = [
    [/^Étape (\d+) \/ (\d+) - ([\s\S]+)$/, function (m, to) { return tr('Étape', to) + ' ' + m[1] + ' / ' + m[2] + ' - ' + tr(m[3], to); }],
    [/^(\d+)\+ participants$/, function (m, to) { return m[1] + '+ ' + tr('participants', to); }],
    [/^(\d+) – (\d+) participants$/, function (m, to) { return m[1] + ' – ' + m[2] + ' ' + tr('participants', to); }]
  ];

  function tr(text, to) {
    if (to === 'fr') return text;
    var d = dict[to];
    if (!d) return text;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!m[2]) return text;
    var core = m[2].replace(/\s+/g, ' ');
    var v = d[core];
    if (v === undefined) {
      for (var i = 0; i < PATTERNS.length; i++) {
        var pm = PATTERNS[i][0].exec(core);
        if (pm) { v = PATTERNS[i][1](pm, to); break; }
      }
    }
    return v === undefined ? text : m[1] + v + m[3];
  }
  function trPrefixed(text, to) {            // keeps the "[PROTOTYPE] " tag of the test version
    var m = /^(\[PROTOTYPE\]\s*)?([\s\S]*)$/.exec(text);
    return (m[1] || '') + tr(m[2], to);
  }

  // ---------- DOM walking ----------
  var textState = new WeakMap();   // text node -> { orig: French text, out: text we wrote (or null) }
  var attrState = new WeakMap();   // element   -> { attr: { orig, out } }

  // attrsOnly: the element's own attributes are still translated (a <textarea> placeholder), only its content is not
  function skipped(el, attrsOnly) {
    for (var own = true; el && el.nodeType === 1; el = el.parentNode, own = false) {
      if (el.hasAttribute('data-eph-skip')) return true;
      if (SKIP_TAGS[el.tagName] && !(own && attrsOnly && el.tagName === 'TEXTAREA')) return true;
    }
    return false;
  }

  function processText(n) {
    var cur = n.nodeValue;
    if (!cur || !cur.trim()) return;
    var st = textState.get(n);
    var orig = (st && st.out === cur) ? st.orig : cur;      // our own output -> keep its French source
    // <option>Français</option> without a value attribute: its value IS its text.  Pin the French text as the
    // value first, so the form still sends "Français" whatever language is displayed.
    var p = n.parentNode;
    if (p && p.tagName === 'OPTION' && (!p.hasAttribute('value') || p.hasAttribute('data-eph-v'))) {
      p.setAttribute('value', orig.replace(/\s+/g, ' ').trim());
      p.setAttribute('data-eph-v', '');
    }
    var t = tr(orig, lang);
    textState.set(n, { orig: orig, out: t === orig ? null : t });
    if (t !== cur) n.nodeValue = t;
  }

  function processAttr(el, a) {
    var cur = el.getAttribute(a);
    if (cur === null || !cur.trim()) return;
    var all = attrState.get(el);
    if (!all) { all = {}; attrState.set(el, all); }
    var st = all[a];
    var orig = (st && st.out === cur) ? st.orig : cur;
    var t = tr(orig, lang);
    all[a] = { orig: orig, out: t === orig ? null : t };
    if (t !== cur) el.setAttribute(a, t);
  }

  function walk(node) {
    if (node.nodeType === 3) { if (!skipped(node.parentNode)) processText(node); return; }
    if (node.nodeType !== 1 || skipped(node, true)) return;
    for (var i = 0; i < ATTRS.length; i++) processAttr(node, ATTRS[i]);
    if (SKIP_TAGS[node.tagName]) return;
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }

  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'childList') {
        for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      } else if (r.type === 'characterData') {
        if (!skipped(r.target.parentNode)) processText(r.target);
      } else if (r.type === 'attributes') {
        if (!skipped(r.target, true)) processAttr(r.target, r.attributeName);
      }
    }
    placeSwitch();
  });

  // ---------- page title / description ----------
  var titleOrig = null;
  var metaOrig = [];
  function applyMeta() {
    document.documentElement.setAttribute('lang', lang);
    if (titleOrig === null) titleOrig = document.title;
    document.title = trPrefixed(titleOrig, lang);
    if (!metaOrig.length) {
      META_SELECTORS.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) metaOrig.push({ el: el, orig: el.getAttribute('content') || '' });
      });
    }
    metaOrig.forEach(function (m) { m.el.setAttribute('content', trPrefixed(m.orig, lang)); });
  }

  // ---------- switch FR | EN | PT ----------
  var ui = null;
  function buildSwitch() {
    var css = document.createElement('style');
    css.id = 'eph-lang-style';
    css.textContent =
      '#eph-lang{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:rgba(10,17,40,.62);' +
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 1px 4px rgba(0,0,0,.25);flex:0 0 auto;margin-left:auto;margin-right:12px}' +
      '#eph-lang button{all:unset;box-sizing:border-box;cursor:pointer;min-width:34px;height:28px;padding:0 8px;border-radius:999px;' +
      'font:600 12px/28px system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.04em;text-align:center;color:#fff}' +
      '#eph-lang button:hover{background:rgba(255,255,255,.18)}' +
      '#eph-lang button:focus-visible{outline:2px solid #fff;outline-offset:1px}' +
      '#eph-lang button[aria-pressed="true"]{background:hsl(45 100% 51%);color:#0a1128;cursor:default}' +
      '#eph-lang.eph-fixed{position:fixed;top:12px;right:12px;z-index:2147483000;margin:0}' +
      '@media (min-width:768px){#eph-lang{margin-left:20px;margin-right:0}nav>.container>div.hidden{margin-left:auto}}';
    document.head.appendChild(css);

    ui = document.createElement('div');
    ui.id = 'eph-lang';
    ui.setAttribute('role', 'group');
    ui.setAttribute('data-eph-skip', '');
    LANGS.forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-lang', code);
      b.setAttribute('lang', code);
      b.setAttribute('title', NAMES[code]);
      b.setAttribute('aria-label', NAMES[code]);
      b.textContent = code.toUpperCase();
      b.addEventListener('click', function () { setLang(code, true); });
      ui.appendChild(b);
    });
    refreshSwitch();
  }
  function refreshSwitch() {
    if (!ui) return;
    ui.setAttribute('aria-label', LABELS[lang]);
    var buttons = ui.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-lang') === lang ? 'true' : 'false');
    }
  }
  function placeSwitch() {
    if (!ui || !document.body) return;
    var bar = document.querySelector('nav > div.container');
    if (bar) {
      if (ui.parentNode !== bar) {
        var last = bar.lastElementChild;
        if (last && last.tagName === 'BUTTON') bar.insertBefore(ui, last); else bar.appendChild(ui);
      }
      ui.classList.remove('eph-fixed');
    } else if (ui.parentNode !== document.body || !ui.classList.contains('eph-fixed')) {
      ui.classList.add('eph-fixed');
      document.body.appendChild(ui);
    }
  }

  // ---------- applying a language ----------
  function retranslateAll() {
    walk(document.body);
  }
  function setLang(code, remember) {
    if (LANGS.indexOf(code) < 0) return;
    lang = code;
    if (remember) {
      storeSet(code);
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); window.history.replaceState(null, '', u.toString()); }
      } catch (e) { /* old browser */ }
    }
    applyMeta();
    refreshSwitch();
    if (document.body) retranslateAll();
  }

  // texts added by other scripts (e.g. the banner of the test version): { en: {"texte fr": "..."}, pt: {...} }
  function extend(extra) {
    Object.keys(extra || {}).forEach(function (code) {
      dict[code] = dict[code] || {};
      Object.keys(extra[code]).forEach(function (k) { dict[code][k] = extra[code][k]; });
    });
    if (document.body) retranslateAll();
  }

  window.EphI18n = {
    get lang() { return lang; },
    set: function (code) { setLang(code, true); },
    extend: extend,
    languages: LANGS.slice()
  };

  // ---------- start ----------
  lang = detect();
  document.documentElement.setAttribute('lang', lang);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS
  });
  function ready() {
    buildSwitch();
    applyMeta();
    placeSwitch();
    retranslateAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
