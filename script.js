// Shared site logic — translations live in i18n.js

let currentLang = 'en';

function changeLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang === 'lv' ? 'lv' : lang === 'ru' ? 'ru' : 'en';

  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.getAttribute('data-key');
    if (translations[lang][key] !== undefined) {
      el.innerHTML = translations[lang][key];
    }
  });

  // Mark active language button
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const isActive = btn.dataset.lang === lang;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'true' : 'false');
  });

  // Refresh dynamic content
  const setIfExists = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  };
  setIfExists('summerCountdown', daysUntilSummer());
  setIfExists('BDayCountdown', daysUntilBDay());
  setIfExists('AgeCounter', currentAge());
}

function daysUntilSummer() {
  const today = new Date();
  const year = today.getFullYear();
  let summerStart = new Date(year, 5, 1); // June 1
  const summerEnd = new Date(year, 7, 31); // July 31

  if (today >= summerStart && today <= summerEnd) {
    return translations[currentLang]['summer-now'];
  }
  if (today > summerEnd) {
    summerStart = new Date(year + 1, 5, 1);
  }
  const diffDays = Math.ceil((summerStart - today) / (1000 * 60 * 60 * 24));
  return translations[currentLang]['summer-countdown'].replace('{days}', diffDays);
}

function daysUntilBDay() {
  const today = new Date();
  const year = today.getFullYear();
  let BDay = new Date(year, 5, 30); // June 30

  if (today.getMonth() === 5 && today.getDate() === 30) {
    return translations[currentLang]['bday-today'];
  }
  if (today > BDay) {
    BDay = new Date(year + 1, 5, 30);
  }
  const diffDays = Math.ceil((BDay - today) / (1000 * 60 * 60 * 24));
  return translations[currentLang]['bday-countdown'].replace('{days}', diffDays);
}

function currentAge() {
  const dob = new Date('2007-06-30');
  const age_dt = new Date(Date.now() - dob.getTime());
  let age = Math.abs(age_dt.getUTCFullYear() - 1970);
  const willbe = new Date().getFullYear() - 2007;

  let returntext = translations[currentLang]['age-current'].replace('{age}', age);
  if (willbe !== age) {
    returntext += translations[currentLang]['age-will-be'].replace('{willbe}', willbe);
  } else {
    returntext += '. ';
  }
  return returntext;
}

// Path-aware base for pages in subfolders
function siteBase() {
  const path = window.location.pathname.replace(/\/[^/]*$/, '/');
  // If we're in a subfolder of the site root (e.g. /saieti/), go up
  // For main pages (index, faq, thoughts) base is ''
  if (/\/(saieti|msaieti|sp|games|thoughts)\//.test(window.location.pathname)) {
    return '../';
  }
  return '';
}

const NAVBAR_HTML = () => {
  const base = siteBase();
  return `
<nav class="navbar sticky-top navbar-expand-lg bg-body-tertiary" role="navigation" aria-label="Main">
  <div class="container-fluid">
    <a class="navbar-brand" href="${base}index.html">wowemain's page</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavAltMarkup" aria-controls="navbarNavAltMarkup" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNavAltMarkup">
      <div class="navbar-nav me-auto">
        <a class="nav-link" href="${base}faq.html" data-key="nav-faq">FAQ</a>
        <a class="nav-link" href="${base}thoughts.html" data-key="Thoughtslink">Thoughts</a>
        <a class="nav-link" href="${base}saieti/games.html">Saieti</a>
      </div>
      <div class="navbar-nav" role="group" aria-label="Language">
        <a class="nav-link lang-btn" href="#" data-lang="en" role="button" aria-label="English">EN</a>
        <a class="nav-link lang-btn" href="#" data-lang="lv" role="button" aria-label="Latviešu">LV</a>
        <a class="nav-link lang-btn" href="#" data-lang="ru" role="button" aria-label="Русский">RU</a>
      </div>
    </div>
  </div>
</nav>`;
};

function loadNavbar() {
  const placeholder = document.getElementById('site-navbar');
  if (!placeholder) return;
  placeholder.innerHTML = NAVBAR_HTML();
}

const FOOTER_HTML = `
<footer class="bg-body-tertiary py-4 mt-5 border-top">
  <div class="container text-center text-muted small">
    <p class="mb-1" data-key="footer-author">Page author: Timurs Besarabs, 2025–2026</p>
    <p class="mb-1" data-key="footer-license">
      All material on this domain, including subdomains, is licensed under
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener" class="text-reset">CC BY-SA 4.0</a>,
      unless stated otherwise.
    </p>
    <p class="mb-0" data-key="footer-contact">
      Contact e-mail:
      <a href="mailto:tbesarabs@gmail.com" class="text-reset">tbesarabs@gmail.com</a>
    </p>
  </div>
</footer>`;

function loadFooter() {
  const placeholder = document.getElementById('site-footer');
  if (!placeholder) return;
  placeholder.innerHTML = FOOTER_HTML;
}

// Tiny privacy-friendly visit counter (local only, no third-party)
function bumpLocalVisitCounter() {
  try {
    const key = 'wowemain-visits';
    const n = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
    localStorage.setItem(key, String(n));
  } catch (_) { /* ignore */ }
}

document.addEventListener('DOMContentLoaded', () => {
  loadNavbar();
  loadFooter();
  bumpLocalVisitCounter();

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      changeLanguage(btn.dataset.lang);
    });
    // Keyboard: Enter/Space already activate links; ensure focus style
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        changeLanguage(btn.dataset.lang);
      }
    });
  });

  const savedLang = localStorage.getItem('lang');
  const initialLang = (savedLang && translations[savedLang]) ? savedLang : 'en';
  changeLanguage(initialLang);
});
