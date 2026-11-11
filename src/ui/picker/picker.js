// src/ui/picker/picker.js
let allSources = [];
let currentTab = 'screens'; // 'screens' or 'windows'
let selectedSourceId = null;

const tabScreens = document.getElementById('tab-screens');
const tabWindows = document.getElementById('tab-windows');
const grid = document.getElementById('sources-grid');
const btnShare = document.getElementById('btn-share');
const btnCancel = document.getElementById('btn-cancel');

// Setup event listeners
tabScreens.addEventListener('click', () => switchTab('screens'));
tabWindows.addEventListener('click', () => switchTab('windows'));

btnCancel.addEventListener('click', () => {
  if (window.pickerAPI) {
    window.pickerAPI.cancel();
  }
});

btnShare.addEventListener('click', () => {
  if (selectedSourceId && window.pickerAPI) {
    window.pickerAPI.selectSource(selectedSourceId);
  }
});

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (window.pickerAPI) window.pickerAPI.cancel();
  } else if (e.key === 'Enter' && selectedSourceId) {
    if (window.pickerAPI) window.pickerAPI.selectSource(selectedSourceId);
  }
});

function switchTab(tab) {
  currentTab = tab;
  tabScreens.classList.toggle('active', tab === 'screens');
  tabWindows.classList.toggle('active', tab === 'windows');
  renderSources();
}

function renderSources() {
  grid.innerHTML = '';

  const filtered = allSources.filter(s => {
    return currentTab === 'screens' ? s.isScreen : !s.isScreen;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="loading">No ${currentTab === 'screens' ? 'screens' : 'application windows'} found.</div>`;
    selectedSourceId = null;
    btnShare.disabled = true;
    return;
  }

  filtered.forEach(source => {
    const card = document.createElement('div');
    card.className = `source-card ${selectedSourceId === source.id ? 'selected' : ''}`;
    card.tabIndex = 0;

    const thumbnailWrap = document.createElement('div');
    thumbnailWrap.className = 'thumbnail-wrap';

    if (source.thumbnail) {
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = source.thumbnail;
      img.alt = source.name;
      thumbnailWrap.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'source-info';

    if (source.appIcon) {
      const icon = document.createElement('img');
      icon.className = 'app-icon';
      icon.src = source.appIcon;
      info.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = source.name;
    info.appendChild(name);

    card.appendChild(thumbnailWrap);
    card.appendChild(info);

    card.addEventListener('click', () => {
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedSourceId = source.id;
      btnShare.disabled = false;
    });

    card.addEventListener('dblclick', () => {
      selectedSourceId = source.id;
      if (window.pickerAPI) {
        window.pickerAPI.selectSource(source.id);
      }
    });

    grid.appendChild(card);
  });

  // Auto-select the first item if none is selected
  if (!selectedSourceId && filtered.length > 0) {
    selectedSourceId = filtered[0].id;
    btnShare.disabled = false;
    const firstCard = grid.querySelector('.source-card');
    if (firstCard) firstCard.classList.add('selected');
  }
}

// Receive sources from main process
if (window.pickerAPI) {
  window.pickerAPI.onSources((sources) => {
    allSources = sources || [];
    renderSources();
  });
}
