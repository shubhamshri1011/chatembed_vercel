/**
 * EmbedEase Unified Design System â€” theme.js
 * Injects consistent public navigation, footer, trademark & founder notices,
 * and initializes Lucide icons.
 */

(function () {
  'use strict';

  function initIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  function getPublicNavHtml(activePage) {
    var isIndex = activePage === 'home' || activePage === 'index';
    var isPricing = activePage === 'pricing';
    var isGuide = activePage === 'guide';
    var isBuilder = activePage === 'builder';
    var isContact = activePage === 'contact';

    var homeLink = isIndex ? '#' : '/index.html';
    var featuresLink = isIndex ? '#features' : '/index.html#features';

    return `
      <nav class="public-nav-container">
        <div class="nav-inner">
          <a href="/index.html" class="nav-brand" aria-label="EmbedEase Home">
            <span class="nav-brand-logo">
              <i data-lucide="sparkles" style="width:16px;height:16px;color:#0E6B4D;"></i>
            </span>
            <span>EmbedEase</span>
            <span class="badge badge-amber" style="font-size:0.65rem;padding:1px 6px;margin-left:4px;">PRO</span>
          </a>

          <div class="nav-links" id="navLinks">
            <a href="${featuresLink}" class="nav-link">Features</a>
            <a href="/widget-builder.html" class="nav-link ${isBuilder ? 'active' : ''}">Widget Builder</a>
            <a href="/pricing.html" class="nav-link ${isPricing ? 'active' : ''}">Pricing</a>
            <a href="/guide.html" class="nav-link ${isGuide ? 'active' : ''}">Integration Guide</a>
            <a href="/contact.html" class="nav-link ${isContact ? 'active' : ''}">Contact</a>
          </div>

          <div class="nav-actions">
            <a href="/app.html" class="btn btn-ghost btn-sm" id="navSignInBtn">Sign In</a>
            <a href="/app.html" class="btn btn-primary btn-sm" id="navStartFreeBtn">
              <span>Start Free</span>
              <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
            </a>
            <button class="nav-toggle" id="navToggleBtn" aria-label="Toggle Navigation" type="button">
              <i data-lucide="menu" style="width:20px;height:20px;"></i>
            </button>
          </div>
        </div>

        <div class="mobile-menu" id="mobileMenu">
          <div class="mobile-menu-inner">
            <a href="${featuresLink}" class="mobile-nav-link">Features</a>
            <a href="/widget-builder.html" class="mobile-nav-link ${isBuilder ? 'active' : ''}">Widget Builder</a>
            <a href="/pricing.html" class="mobile-nav-link ${isPricing ? 'active' : ''}">Pricing</a>
            <a href="/guide.html" class="mobile-nav-link ${isGuide ? 'active' : ''}">Integration Guide</a>
            <a href="/contact.html" class="mobile-nav-link ${isContact ? 'active' : ''}">Contact</a>
            <a href="/privacy.html" class="mobile-nav-link">Privacy Policy</a>
            <a href="/terms.html" class="mobile-nav-link">Terms of Service</a>
            <div style="padding-top:12px;display:flex;flex-direction:column;gap:8px;">
              <a href="/app.html" class="btn btn-secondary btn-full">Sign In</a>
              <a href="/app.html" class="btn btn-primary btn-full">Start Free Trial</a>
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  function getPublicFooterHtml() {
    return `
      <footer class="public-footer">
        <div class="footer-container">
          <div class="footer-grid">
            <div class="footer-col" style="max-width:320px;">
              <div class="footer-brand">
                <span class="nav-brand-logo">
                  <i data-lucide="sparkles" style="width:16px;height:16px;color:#0E6B4D;"></i>
                </span>
                <span style="font-family:var(--font-serif);font-weight:700;font-size:1.15rem;color:var(--dark-text);">EmbedEase</span>
              </div>
              <p class="footer-desc">
                Enterprise-grade AI chat & voice widget infrastructure for modern websites. Zero iframe lag, 100% brand control, multi-platform integrations, and deep analytics.
              </p>
              <div style="margin-top:16px;display:flex;align-items:center;gap:8px;">
                <span class="badge" style="background:#181D1A;color:#8F9994;border:1px solid rgba(255,255,255,0.1);font-size:0.75rem;">
                  <i data-lucide="shield-check" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;color:var(--amber);"></i>
                  DPDP Act 2023 Compliant
                </span>
              </div>
            </div>

            <div class="footer-col">
              <h4 class="footer-heading">Product</h4>
              <ul class="footer-links">
                <li><a href="/widget-builder.html" class="footer-link">Widget Customizer</a></li>
                <li><a href="/pricing.html" class="footer-link">Pricing & Plans</a></li>
                <li><a href="/guide.html" class="footer-link">Integration Guides</a></li>
                <li><a href="/index.html#platforms" class="footer-link">Supported Platforms</a></li>
                <li><a href="/app.html" class="footer-link">Console Dashboard</a></li>
              </ul>
            </div>

            <div class="footer-col">
              <h4 class="footer-heading">Integrations</h4>
              <ul class="footer-links">
                <li><a href="/guide.html?platform=voiceflow" class="footer-link">Voiceflow Widget</a></li>
                <li><a href="/guide.html?platform=botpress" class="footer-link">Botpress Widget</a></li>
                <li><a href="/guide.html?platform=flowise" class="footer-link">Flowise AI Widget</a></li>
                <li><a href="/guide.html?platform=typebot" class="footer-link">Typebot Widget</a></li>
                <li><a href="/guide.html?platform=bland" class="footer-link">Bland.ai & Retell AI</a></li>
              </ul>
            </div>

            <div class="footer-col">
              <h4 class="footer-heading">Company & Legal</h4>
              <ul class="footer-links">
                <li><a href="/contact.html" class="footer-link">Contact Support</a></li>
                <li><a href="/privacy.html" class="footer-link">Privacy Policy</a></li>
                <li><a href="/terms.html" class="footer-link">Terms of Service</a></li>
                <li><a href="/refund.html" class="footer-link">Refund & Cancellation</a></li>
              </ul>
            </div>
          </div>

          <div class="footer-disclaimer">
            <p><strong>Trademark & Platform Disclaimer:</strong> All product names, logos, brands, and registered trademarks (such as Voiceflow, Botpress, Flowise, Typebot, Dify, LangChain, Bland.ai, Retell AI, Vapi, OpenAI, Claude, DeepSeek, Supabase, and Razorpay) are the property of their respective owners. Their mention does not imply endorsement, affiliation, or sponsorship.</p>
          </div>

          <div class="footer-bottom">
            <div class="footer-copy">
              &copy; 2026 Roopya Technologies. EmbedEase is an engineering product of <strong>Roopya Technologies</strong>. Founder: <strong>Shubham Shrivastava</strong>.
            </div>
            <div class="footer-bottom-links">
              <a href="/privacy.html" class="footer-link">Privacy</a>
              <span style="opacity:0.4;">&bull;</span>
              <a href="/terms.html" class="footer-link">Terms</a>
              <span style="opacity:0.4;">&bull;</span>
              <a href="/refund.html" class="footer-link">Refund Policy</a>
              <span style="opacity:0.4;">&bull;</span>
              <a href="/contact.html" class="footer-link">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    `;
  }

  function bindNavEvents() {
    var toggleBtn = document.getElementById('navToggleBtn');
    var mobileMenu = document.getElementById('mobileMenu');
    if (toggleBtn && mobileMenu) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = mobileMenu.classList.contains('open');
        if (isOpen) {
          mobileMenu.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        } else {
          mobileMenu.classList.add('open');
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', function (e) {
        if (!mobileMenu.contains(e.target) && !toggleBtn.contains(e.target)) {
          mobileMenu.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  window.EmbedEaseTheme = {
    init: function () {
      var navMount = document.querySelector('[data-public-nav]');
      if (navMount) {
        var activePage = navMount.getAttribute('data-active-page') || 'home';
        navMount.innerHTML = getPublicNavHtml(activePage);
        bindNavEvents();
      }

      var footerMount = document.querySelector('[data-public-footer]');
      if (footerMount) {
        footerMount.innerHTML = getPublicFooterHtml();
      }

      initIcons();
    },
    refreshIcons: initIcons
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.EmbedEaseTheme.init);
  } else {
    window.EmbedEaseTheme.init();
  }

  // Capture referral code if present in URL (?ref=CODE)
  try {
    var searchParams = new URLSearchParams(window.location.search);
    var refCode = searchParams.get('ref') || searchParams.get('ref_code');
    if (refCode) {
      localStorage.setItem('embedease_ref', refCode.trim().toUpperCase());
      sessionStorage.setItem('embedease_ref', refCode.trim().toUpperCase());
    }
  } catch(e) {}
})();

