/**
 * EmbedEase Widget v4.0 — High-Attribution, Secure & Multi-Channel
 *
 * Embed snippet:
 * <script src="https://embedease.in/widget.js"
 *   data-bot-id="YOUR_BOT_ID"
 *   data-color="#0E6B4D"
 *   data-name="Aria"
 *   data-whatsapp="919425625642"
 *   data-welcome="Hi! How can I help you today?">
 * </script>
 */
(function () {
  'use strict';

  /* ── 1. FIND SCRIPT TAG & CONFIG ─────────────────────────── */
  var sc = (function () {
    if (document.currentScript && document.currentScript.getAttribute('data-bot-id'))
      return document.currentScript;
    var t = document.getElementsByTagName('script');
    for (var i = t.length - 1; i >= 0; i--)
      if (t[i].getAttribute('data-bot-id')) return t[i];
    return null;
  })();
  if (!sc) return;

  var BOT_ID   = sc.getAttribute('data-bot-id')   || '';
  var COLOR    = sc.getAttribute('data-color')    || '#0E6B4D';
  var NAME     = sc.getAttribute('data-name')     || 'AI Assistant';
  var WELCOME  = sc.getAttribute('data-welcome')  || 'Hi! How can I help your business today?';
  var POS      = sc.getAttribute('data-position') || 'right';
  var WA_PHONE = sc.getAttribute('data-whatsapp') || '';
  var BASE_URL = sc.getAttribute('data-api')      || 'https://rlzscyjegyorjpagguhc.supabase.co/functions/v1';

  var ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsenNjeWplZ3lvcmpwYWdndWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MjU2MDMsImV4cCI6MjA1OTAwMTYwM30.p-4Bsa_yL2vGUfFnImHGPBKJYu7qMmRilLLDdHNu5Oo';

  if (!BOT_ID) return;
  if (window.__eeInit) return;
  window.__eeInit = true;

  /* ── 2. ATTRIBUTION ENGINE ──────────────────────────────── */
  function parseUrlParams() {
    var params = {};
    try {
      var search = window.location.search.substring(1);
      if (search) {
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split('=');
          if (pair[0]) {
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
          }
        }
      }
    } catch (e) {}
    return params;
  }

  var currentParams = parseUrlParams();

  // Generate or restore persistent visitor_id & session_id
  var visitorId = (function () {
    try {
      var v = localStorage.getItem('ee_vid');
      if (!v) {
        v = 'vid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        localStorage.setItem('ee_vid', v);
      }
      return v;
    } catch (e) {
      return 'vid_tmp_' + Math.random().toString(36).slice(2, 9);
    }
  })();

  var sessionId = (function () {
    try {
      var s = sessionStorage.getItem('ee_sid');
      if (!s) {
        s = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem('ee_sid', s);
      }
      return s;
    } catch (e) {
      return 'sid_tmp_' + Math.random().toString(36).slice(2, 9);
    }
  })();

  // Multi-Touch Attribution: First touch vs Last touch
  var currentTouch = {
    page_url: window.location.href,
    referrer: document.referrer || '',
    utm_source: currentParams.utm_source || '',
    utm_medium: currentParams.utm_medium || '',
    utm_campaign: currentParams.utm_campaign || '',
    utm_content: currentParams.utm_content || '',
    utm_term: currentParams.utm_term || '',
    gclid: currentParams.gclid || '',
    fbclid: currentParams.fbclid || '',
    ctwa_clid: currentParams.ctwa_clid || '',
    timestamp: new Date().toISOString()
  };

  var firstTouch = (function () {
    try {
      var stored = localStorage.getItem('ee_ft');
      if (!stored) {
        localStorage.setItem('ee_ft', JSON.stringify(currentTouch));
        return currentTouch;
      }
      return JSON.parse(stored);
    } catch (e) {
      return currentTouch;
    }
  })();

  var lastTouch = (function () {
    try {
      localStorage.setItem('ee_lt', JSON.stringify(currentTouch));
    } catch (e) {}
    return currentTouch;
  })();

  var detectedLang = (navigator.language || 'en').slice(0, 2);

  /* ── 3. STATE & API HEADERS ─────────────────────────────── */
  var open = false, busy = false, msgCount = 0;
  var leadDone = false, leadShown = false;
  var hist = [];
  var isMob = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var isL   = POS === 'left';

  var H = {
    'Content-Type': 'application/json',
    'apikey': ANON,
    'Authorization': 'Bearer ' + ANON
  };

  /* ── 4. TELEMETRY EVENT EMITTER ─────────────────────────── */
  function trackEvent(name, props) {
    var payload = {
      bot_id: BOT_ID,
      session_id: sessionId,
      name: name,
      page_url: window.location.href,
      props: props || {}
    };

    try {
      fetch(BASE_URL + '/chat', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          bot_id: BOT_ID,
          session_id: sessionId,
          event_only: true,
          event_name: name,
          props: props
        })
      }).catch(function () {});
    } catch (e) {}
  }

  // Public SDK
  window.EmbedEase = {
    track: function (eventName, props) {
      trackEvent(eventName, props);
    },
    open: function () { openW(); },
    close: function () { closeW(); }
  };

  /* ── 5. CSS STYLES ──────────────────────────────────────── */
  var css = [
    '#eer,#eer *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}',
    '#eer{position:fixed;z-index:2147483647;' + (isL ? 'left:20px' : 'right:20px') + ';bottom:24px}',

    /* Bubble */
    '#eer-btn{width:56px;height:56px;border-radius:50%;background:' + COLOR + ';border:none;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 6px 20px rgba(0,0,0,.22);transition:transform .2s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s;',
    '-webkit-tap-highlight-color:transparent;outline:none}',
    '#eer-btn:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(0,0,0,.3)}',
    '#eer-btn:active{transform:scale(.94)}',
    '#eer-badge{position:absolute;top:-2px;right:-2px;background:#e11d48;color:#fff;',
    'border-radius:50%;width:20px;height:20px;font-size:10px;font-weight:700;',
    'display:none;align-items:center;justify-content:center;border:2px solid #fff;pointer-events:none}',

    /* Window */
    '#eer-win{position:absolute;' + (isL ? 'left:0' : 'right:0') + ';bottom:70px;width:370px;',
    'background:#fff;border-radius:20px;',
    'box-shadow:0 20px 60px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.06);',
    'display:flex;flex-direction:column;overflow:hidden;max-height:560px;',
    'transform-origin:bottom ' + (isL ? 'left' : 'right') + ';',
    'transform:scale(.88) translateY(12px);opacity:0;pointer-events:none;',
    'transition:transform .24s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;will-change:transform}',
    '#eer-win.on{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}',

    /* Header */
    '#eer-hd{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;',
    'background:' + COLOR + ';flex-shrink:0;color:#fff}',
    '#eer-hd-l{display:flex;align-items:center;gap:10px}',
    '#eer-av{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);',
    'display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}',
    '#eer-nm{font-size:14.5px;font-weight:700;line-height:1.2}',
    '#eer-st{font-size:11px;opacity:.9;display:flex;align-items:center;gap:4px;margin-top:2px}',
    '#eer-dot{width:7px;height:7px;border-radius:50%;background:#4ade80}',
    '#eer-hd-r{display:flex;align-items:center;gap:8px}',
    '#eer-wa-btn{background:rgba(255,255,255,.2);border:none;border-radius:8px;padding:5px 8px;',
    'color:#fff;font-size:11.5px;cursor:pointer;display:flex;align-items:center;gap:4px;',
    'text-decoration:none;transition:background .15s}',
    '#eer-wa-btn:hover{background:rgba(255,255,255,.32)}',
    '#eer-cls{background:rgba(255,255,255,.18);border:none;border-radius:50%;width:28px;height:28px;',
    'cursor:pointer;color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;',
    'transition:background .15s;-webkit-tap-highlight-color:transparent}',
    '#eer-cls:hover{background:rgba(255,255,255,.32)}',

    /* Scrollable body */
    '#eer-body{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;',
    'min-height:140px;background:#f8f9fb;-webkit-overflow-scrolling:touch}',
    '#eer-body::-webkit-scrollbar{width:3px}',
    '#eer-body::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}',

    /* Welcome & Suggested Questions */
    '#eer-wel{padding:20px 18px 10px;text-align:center;background:#fff;flex-shrink:0;border-bottom:1px solid #f1f3f5}',
    '#eer-wel-t{font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;line-height:1.3}',
    '#eer-wel-s{font-size:12.5px;color:#6b7280;margin-bottom:2px}',
    '#eer-qs{padding:10px 14px 6px;background:#fff;border-bottom:1px solid #f1f3f5;flex-shrink:0}',
    '.eer-q{display:flex;align-items:center;gap:9px;padding:9px 12px;',
    'border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:7px;cursor:pointer;',
    'background:#fff;width:100%;text-align:left;transition:all .15s;outline:none}',
    '.eer-q:hover{border-color:' + COLOR + ';background:#f0fdf4;transform:translateX(2px)}',
    '.eer-q-ic{width:18px;height:18px;border-radius:50%;background:' + COLOR + ';',
    'display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.eer-q-t{font-size:12.5px;color:#374151;font-weight:500;line-height:1.3}',

    /* Messages */
    '#eer-msgs{display:flex;flex-direction:column;gap:8px;padding:12px 14px;flex:1;min-height:20px}',
    '@keyframes eefi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '.eer-m{max-width:84%;padding:10px 14px;border-radius:18px;font-size:13.5px;',
    'line-height:1.55;animation:eefi .18s ease both;word-break:break-word}',
    '.eer-b{background:#fff;color:#1f2937;align-self:flex-start;',
    'border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '.eer-u{background:' + COLOR + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}',
    '.eer-e{background:#fef2f2;color:#dc2626;align-self:flex-start;',
    'border:1px solid #fca5a5;font-size:12.5px;border-radius:12px;padding:8px 12px}',

    /* Typing Animation */
    '@keyframes eeb{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
    '#eer-ty{display:flex;gap:5px;padding:10px 14px;background:#fff;border-radius:18px;',
    'border-bottom-left-radius:4px;align-self:flex-start;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '#eer-ty span{width:7px;height:7px;border-radius:50%;background:#cbd5e1;animation:eeb .9s infinite}',
    '#eer-ty span:nth-child(2){animation-delay:.15s}#eer-ty span:nth-child(3){animation-delay:.3s}',

    /* Lead Form */
    '#eer-lf{background:#f8f9fb;padding:10px 14px;border-top:1px solid #f0f0f0;flex-shrink:0;display:none}',
    '#eer-lc{background:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e5e7eb}',
    '#eer-lt{font-size:12px;font-weight:600;color:#374151;margin-bottom:8px}',
    '.eer-li{width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;',
    'font-size:12.5px;outline:none;margin-bottom:6px;color:#1f2937;font-family:inherit;transition:border-color .15s}',
    '.eer-li:focus{border-color:' + COLOR + '}',
    '#eer-lb{width:100%;padding:9px;border:none;border-radius:8px;background:' + COLOR + ';',
    'color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}',
    '#eer-lb:hover{opacity:.88}',

    /* Input Row */
    '#eer-ia{padding:10px 12px;background:#fff;border-top:1px solid #f0f0f0;display:flex;gap:8px;align-items:flex-end;flex-shrink:0}',
    '#eer-inp{flex:1;border:1.5px solid #e5e7eb;border-radius:14px;padding:10px 13px;font-size:13.5px;outline:none;resize:none;',
    'max-height:90px;min-height:40px;color:#1f2937;background:#f9fafb;line-height:1.4;transition:all .15s}',
    '#eer-inp:focus{border-color:' + COLOR + ';background:#fff}',
    '#eer-inp::placeholder{color:#adb5bd}',
    '#eer-sb{width:38px;height:38px;min-width:38px;border-radius:12px;background:' + COLOR + ';border:none;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s,transform .1s}',
    '#eer-sb:disabled{opacity:.35;cursor:default}',
    '#eer-sb:not(:disabled):hover{opacity:.88}',
    '#eer-sb:not(:disabled):active{transform:scale(.92)}',

    /* Footer */
    '#eer-ft{text-align:center;padding:5px 0 7px;background:#fff;font-size:10px;color:#9ca3af;flex-shrink:0}',
    '#eer-ft a{color:#9ca3af;text-decoration:none;font-weight:500}',

    /* Mobile */
    '@media(max-width:480px){',
    '#eer-win{width:calc(100vw - 16px);' + (isL ? 'left:-2px' : 'right:-2px') + ';',
    'max-height:calc(100vh - 90px);bottom:70px;border-radius:16px}}'
  ].join('');

  /* ── 6. BOOTSTRAP WIDGET ────────────────────────────────── */
  function boot() {
    if (!document.body) { setTimeout(boot, 15); return; }
    if (document.getElementById('eer')) return;

    var st = document.createElement('style');
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);

    var waLink = WA_PHONE
      ? 'https://wa.me/' + WA_PHONE.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent('Hi, I visited ' + window.location.hostname + ' and have a question.')
      : '';

    var root = document.createElement('div');
    root.id = 'eer';
    root.innerHTML =
      '<div id="eer-win">' +
        '<div id="eer-hd">' +
          '<div id="eer-hd-l">' +
            '<div id="eer-av">💬</div>' +
            '<div><div id="eer-nm">' + x(NAME) + '</div>' +
            '<div id="eer-st"><span id="eer-dot"></span>&nbsp;Online</div></div>' +
          '</div>' +
          '<div id="eer-hd-r">' +
            (waLink ? '<a id="eer-wa-btn" href="' + x(waLink) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
            '<button id="eer-cls" aria-label="Close">×</button>' +
          '</div>' +
        '</div>' +
        '<div id="eer-body">' +
          '<div id="eer-wel">' +
            '<div id="eer-wel-t">' + x(WELCOME) + '</div>' +
            '<div id="eer-wel-s">Ask me anything ↓</div>' +
          '</div>' +
          '<div id="eer-qs"></div>' +
          '<div id="eer-msgs"></div>' +
        '</div>' +
        '<div id="eer-lf"><div id="eer-lc">' +
          '<div id="eer-lt">Get an instant quote or callback:</div>' +
          '<input class="eer-li" id="eer-ln" type="text" placeholder="Your name" autocomplete="name">' +
          '<input class="eer-li" id="eer-le" type="email" placeholder="your@email.com" autocomplete="email">' +
          '<input class="eer-li" id="eer-lp" type="tel" placeholder="Phone (optional)" autocomplete="tel">' +
          '<button id="eer-lb">Send Details →</button>' +
        '</div></div>' +
        '<div id="eer-ia">' +
          '<textarea id="eer-inp" rows="1" placeholder="Type a message..." autocomplete="off"></textarea>' +
          '<button id="eer-sb" aria-label="Send" disabled>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          '</button>' +
        '</div>' +
        '<div id="eer-ft">Powered by <a href="https://embedease.in" target="_blank" rel="noopener">EmbedEase</a></div>' +
      '</div>' +
      '<button id="eer-btn" aria-label="Open chat">' +
        '<svg id="eer-ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '<svg id="eer-xi" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '<div id="eer-badge"></div>' +
      '</button>';

    document.body.appendChild(root);
    events();
    loadQs();
    trackEvent('widget_loaded', { visitor_id: visitorId });

    setTimeout(function () {
      if (!open) {
        var b = g('eer-badge');
        if (b) { b.style.display = 'flex'; b.textContent = '1'; }
      }
    }, 3500);
  }

  /* ── 7. EVENTS & LISTENERS ──────────────────────────────── */
  function events() {
    g('eer-btn').addEventListener('click', toggle);
    g('eer-cls').addEventListener('click', closeW);
    g('eer-sb').addEventListener('click', send);
    g('eer-lb').addEventListener('click', submitLead);

    var waBtn = g('eer-wa-btn');
    if (waBtn) {
      waBtn.addEventListener('click', function () {
        trackEvent('whatsapp_clicked');
      });
    }

    var inp = g('eer-inp');
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    inp.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 90) + 'px';
      g('eer-sb').disabled = !this.value.trim();
    });

    document.addEventListener('click', function (e) {
      if (open && !g('eer').contains(e.target)) closeW();
    });
  }

  /* ── 8. SUGGESTED QUESTIONS ─────────────────────────────── */
  var defaultQs = ['What services do you offer?', 'How can I get started?', 'What is the pricing?'];

  function loadQs() {
    fetch(BASE_URL + '/chat', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ bot_id: BOT_ID, get_questions: true })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var qs = (d && Array.isArray(d.questions) && d.questions.length) ? d.questions : defaultQs;
      renderQs(qs);
    })
    .catch(function () { renderQs(defaultQs); });
  }

  function renderQs(qs) {
    var c = g('eer-qs');
    if (!c) return;
    c.innerHTML = qs.slice(0, 3).map(function (q) {
      return '<button class="eer-q" data-q="' + x(q) + '" type="button" aria-label="' + x(q) + '">' +
        '<span class="eer-q-ic"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>' +
        '<span class="eer-q-t">' + x(q) + '</span>' +
        '</button>';
    }).join('');

    var btns = c.querySelectorAll('.eer-q');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var q = btn.getAttribute('data-q');
          if (!q) return;
          hideWelcome();
          var inp = g('eer-inp');
          if (inp) {
            inp.value = q;
            inp.dispatchEvent(new Event('input'));
          }
          setTimeout(function () { send(); }, 30);
        });
      })(btns[i]);
    }
  }

  function hideWelcome() {
    var w = g('eer-wel'); if (w) w.style.display = 'none';
    var q = g('eer-qs');  if (q) q.style.display = 'none';
  }

  /* ── 9. OPEN / CLOSE ────────────────────────────────────── */
  function toggle() { open ? closeW() : openW(); }

  function openW() {
    open = true;
    g('eer-win').classList.add('on');
    g('eer-ic').style.display = 'none';
    g('eer-xi').style.display = 'block';
    var b = g('eer-badge'); if (b) b.style.display = 'none';
    scrollB();
    trackEvent('widget_opened');
    if (!isMob) { var inp = g('eer-inp'); if (inp) inp.focus(); }
  }

  function closeW() {
    open = false;
    g('eer-win').classList.remove('on');
    g('eer-ic').style.display = 'block';
    g('eer-xi').style.display = 'none';
  }

  /* ── 10. MESSAGES & RENDERING (SANITIZED) ───────────────── */
  function addMsg(txt, cls) {
    var c = g('eer-msgs'); if (!c) return;
    var d = document.createElement('div');
    d.className = 'eer-m ' + cls;
    d.textContent = txt; // textContent automatically escapes user/AI output preventing XSS
    c.appendChild(d); scrollB();
  }
  function showTyping() {
    var c = g('eer-msgs'); if (!c || g('eer-ty')) return;
    var t = document.createElement('div');
    t.id = 'eer-ty'; t.innerHTML = '<span></span><span></span><span></span>';
    c.appendChild(t); scrollB();
  }
  function hideTyping() { var t = g('eer-ty'); if (t) t.parentNode.removeChild(t); }
  function scrollB() { var b = g('eer-body'); if (b) b.scrollTop = b.scrollHeight; }

  /* ── 11. SEND MESSAGE ───────────────────────────────────── */
  function send() {
    if (busy) return;
    var inp = g('eer-inp'); if (!inp) return;
    var txt = inp.value.trim(); if (!txt) return;

    hideWelcome();
    addMsg(txt, 'eer-u');
    hist.push({ role: 'user', content: txt });
    inp.value = ''; inp.style.height = 'auto';
    g('eer-sb').disabled = true;
    msgCount++; busy = true; inp.disabled = true;
    showTyping();

    // Trigger lead capture form after 2nd message
    if (msgCount === 2 && !leadShown && !leadDone) {
      setTimeout(function () {
        var lf = g('eer-lf');
        if (lf && !leadDone) {
          lf.style.display = 'block';
          leadShown = true;
          trackEvent('lead_form_shown');
        }
      }, 900);
    }

    fetch(BASE_URL + '/chat', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        bot_id: BOT_ID,
        message: txt,
        conversation_history: hist.slice(-8),
        session_id: sessionId,
        page_url: window.location.href,
        language: detectedLang
      })
    })
    .then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, s: r.status, d: d }; });
    })
    .then(function (res) {
      hideTyping();
      if (res.ok) {
        var rep = (res.d && res.d.response) ? res.d.response
                : 'I could not generate a response. Please try again.';
        addMsg(rep, 'eer-b');
        hist.push({ role: 'assistant', content: rep });
      } else {
        var em = res.s === 429 ? 'Monthly chat limit reached. Please contact the website owner.' :
                 res.s === 404 ? 'This chatbot is currently offline.' :
                 (res.d && res.d.error) ? res.d.error :
                 'Something went wrong. Please try again.';
        addMsg(em, 'eer-e');
      }
    })
    .catch(function () {
      hideTyping();
      addMsg('Connection error. Please check your internet connection.', 'eer-e');
    })
    .finally(function () {
      busy = false;
      inp.disabled = false;
      g('eer-sb').disabled = !inp.value.trim();
      if (!isMob) inp.focus();
    });
  }

  /* ── 12. SUBMIT LEAD WITH MULTI-TOUCH ATTRIBUTION ───────── */
  function submitLead() {
    var nm = g('eer-ln'), em = g('eer-le'), ph = g('eer-lp'), btn = g('eer-lb');
    if (!em || !btn) return;
    var name = nm ? nm.value.trim() : '';
    var email = em.value.trim();
    var phone = ph ? ph.value.trim() : '';

    if (!email || email.indexOf('@') < 0) { em.focus(); return; }
    btn.textContent = 'Saving…'; btn.disabled = true;

    fetch(BASE_URL + '/lead', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        bot_id: BOT_ID,
        name: name,
        email: email,
        phone: phone,
        session_id: sessionId,
        source_page: window.location.href,
        utm_source: currentTouch.utm_source,
        utm_medium: currentTouch.utm_medium,
        utm_campaign: currentTouch.utm_campaign,
        utm_content: currentTouch.utm_content,
        utm_term: currentTouch.utm_term,
        gclid: currentTouch.gclid,
        fbclid: currentTouch.fbclid,
        ctwa_clid: currentTouch.ctwa_clid,
        first_touch: firstTouch,
        last_touch: lastTouch,
        consent: true
      })
    })
    .then(function (r) { return r.json(); })
    .then(function () {
      leadDone = true;
      trackEvent('lead_submitted', { email: email });
      var lf = g('eer-lf');
      if (lf) {
        lf.innerHTML = '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;' +
          'padding:10px 13px;font-size:12.5px;color:#15803d;margin:3px 0">' +
          '✓ Thank you ' + (name ? x(name) : '') + '! We will be in touch soon.</div>';
        setTimeout(function () { if (lf) lf.style.display = 'none'; }, 4000);
      }
    })
    .catch(function () {
      btn.textContent = 'Retry →';
      btn.disabled = false;
      var lf = g('eer-lf');
      if (lf) {
        var errDiv = g('eer-lead-err');
        if (!errDiv) {
          errDiv = document.createElement('div');
          errDiv.id = 'eer-lead-err';
          errDiv.style.cssText = 'font-size:11.5px;color:#b91c1c;margin-top:6px;line-height:1.4;text-align:center;';
          lf.appendChild(errDiv);
        }
        errDiv.innerHTML = 'Submission failed. Please retry or email <a href="mailto:support@embedease.in" style="color:#b91c1c;font-weight:600;text-decoration:underline;">support@embedease.in</a>';
      }
    });
  }

  /* ── 13. UTILITIES ──────────────────────────────────────── */
  function g(id) { return document.getElementById(id); }
  function x(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── 14. INITIALIZE ─────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
