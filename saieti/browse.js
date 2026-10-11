// Catalogue

const STR = {
  lv: {
    pageTitle: 'Spēļu katalogs',
    choose: 'Izvēlies kategoriju:',
    people: 'Dalībnieku skaits',
    duration: 'Ilgums',
    materials: 'Materiāli',
    back: '← Atpakaļ',
    empty: 'Šajā kategorijā pagaidām nav spēļu.',
    linkRandom: '🎲 Ģenerators',
    countLabel: 'spēles šajā kategorijā',
    searchPlaceholder: 'Meklēt pēc nosaukuma vai apraksta…',
    noResults: 'Nekas netika atrasts.',
    showMore: ' ',
    showLess: ' '
  },
  ru: {
    pageTitle: 'Каталог игр',
    choose: 'Выберите категорию:',
    people: 'Количество участников',
    duration: 'Длительность',
    materials: 'Материалы',
    back: '← Назад',
    empty: 'В этой категории пока нет игр.',
    linkRandom: '🎲 Генератор',
    countLabel: 'игр в этой категории',
    searchPlaceholder: 'Поиск по названию или описанию…',
    noResults: 'Ничего не найдено.',
    showMore: ' ',
    showLess: ' '
  }
};

let lang = getSavedLang();
let currentCategory = null;
let searchQuery = '';

function t(key) {
  return STR[lang][key] || key;
}

function applyLanguage() {
  document.getElementById('page-title').textContent = t('pageTitle');
  document.getElementById('choose-text').textContent = t('choose');
  document.getElementById('btn-back').textContent = t('back');
  document.getElementById('link-random').textContent = t('linkRandom');
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = t('searchPlaceholder');
  setActiveLangButtons(lang);
  renderCategoryGrid({
    hideEmpty: true,
    lang,
    onSelect: selectCategory
  });
  if (currentCategory) {
    showList(currentCategory);
  }
}

function selectCategory(key) {
  currentCategory = key;
  searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  document.getElementById('category-view').classList.add('d-none');
  document.getElementById('list-view').classList.remove('d-none');
  showList(key);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function matchesQuery(game, q) {
  if (!q) return true;
  const title = (game.title || '').toLowerCase();
  const desc = ((lang === 'ru' ? game.desc_ru : game.desc_lv) || '').toLowerCase();
  const materials = (game.materials || '').toLowerCase();
  return title.includes(q) || desc.includes(q) || materials.includes(q);
}

function showList(key) {
  const list = GAMES[key] || [];
  const cat = CATEGORIES.find(c => c.key === key);
  const catName = categoryName(cat, lang);
  const q = searchQuery.trim().toLowerCase();
  const filtered = list.filter(g => matchesQuery(g, q));

  document.getElementById('list-category-title').textContent = catName;
  const countEl = document.getElementById('list-count');
  if (list.length === 0) {
    countEl.textContent = t('empty');
  } else if (q && filtered.length === 0) {
    countEl.textContent = t('noResults');
  } else if (q) {
    countEl.textContent = `${filtered.length} / ${list.length} ${t('countLabel')}`;
  } else {
    countEl.textContent = `${list.length} ${t('countLabel')}`;
  }

  const container = document.getElementById('games-list');
  container.innerHTML = '';

  if (filtered.length === 0) return;

  filtered.forEach((game) => {
    const col = document.createElement('div');
    col.className = 'col-12';
    const desc = (lang === 'ru' ? game.desc_ru : game.desc_lv) || '—';
    const long = desc.length > 280;
    const descId = 'desc-' + Math.random().toString(36).slice(2, 9);

    col.innerHTML = `
      <div class="card shadow-sm game-card">
        <div class="card-body p-3 p-md-4">
          <h3 class="card-title h5 mb-3">${splitTitle(game.title, lang)}</h3>
          <div class="meta-row">
            <div class="meta-item">
              <strong>${t('people')}</strong>
              <span>${game.people || '—'}</span>
            </div>
            <div class="meta-item">
              <strong>${t('duration')}</strong>
              <span>${game.duration || '—'}</span>
            </div>
            <div class="meta-item">
              <strong>${t('materials')}</strong>
              <span>${game.materials || '—'}</span>
            </div>
          </div>
          <hr class="my-3">
          <p class="card-text mb-0 game-desc ${long ? 'game-desc-collapsed' : ''}" id="${descId}" style="white-space: pre-wrap;">${escapeHtml(desc)}</p>
          ${long ? `<button type="button" class="btn btn-link btn-sm px-0 mt-1 toggle-desc" data-target="${descId}" aria-expanded="false">${t('showMore')}</button>` : ''}
        </div>
      </div>`;
    container.appendChild(col);
  });

  container.querySelectorAll('.toggle-desc').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const expanded = target.classList.toggle('game-desc-collapsed') === false;
      btn.textContent = expanded ? t('showLess') : t('showMore');
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function goBack() {
  currentCategory = null;
  searchQuery = '';
  document.getElementById('list-view').classList.add('d-none');
  document.getElementById('category-view').classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event listeners
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    saveLang(lang);
    applyLanguage();
  });
});
document.getElementById('btn-back').addEventListener('click', goBack);

const searchInput = document.getElementById('search-input');
if (searchInput) {
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = searchInput.value;
      if (currentCategory) showList(currentCategory);
    }, 180);
  });
}

// Init
applyLanguage();
