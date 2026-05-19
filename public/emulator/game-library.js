/**
 * N64.wasm Game Library
 * Manages a collection of ROMs with metadata, cover art, and a visual picker UI.
 * Sources: local files, or Google Drive folder (future).
 */
class GameLibrary {
  constructor() {
    this.games = []; // Array of { file, header, meta, coverUrl }
    this.container = null;
    this.onGameSelect = null; // Callback when user picks a game
    this.dbName = 'n64wasm-library';
  }

  /**
   * Initialize the library UI
   * @param {string} containerId - DOM element ID to render into
   * @param {Function} onSelect - Callback(file: File) when game is selected
   */
  init(containerId, onSelect) {
    this.container = document.getElementById(containerId);
    this.onGameSelect = onSelect;

    // Load cached library from IndexedDB
    this.loadFromCache().then(() => {
      this.render();
    });
  }

  /**
   * Add ROM files (from file picker or drag-drop)
   * @param {FileList|File[]} files
   */
  async addFiles(files) {
    for (const file of files) {
      if (!/\.(z64|n64|v64|rom)$/i.test(file.name)) continue;

      // Parse header
      const headerBytes = await this.readFileSlice(file, 0, 64);
      const header = N64RomParser.parse(headerBytes);
      const meta = window.n64GameDB.lookup(header);

      const game = {
        id: `${header.crc1}-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        header,
        meta,
        coverUrl: this.getCoverUrl(meta),
        lastPlayed: null,
        file, // Keep reference for loading
      };

      // Avoid duplicates by CRC
      const existing = this.games.findIndex(g => g.header.crcKey === header.crcKey);
      if (existing >= 0) {
        this.games[existing] = game;
      } else {
        this.games.push(game);
      }
    }

    this.saveToCache();
    this.render();
  }

  /**
   * Get a cover art URL for a game from the database
   */
  getCoverUrl(meta) {
    return meta?.cover || null;
  }

  /**
   * Read a slice of a File as ArrayBuffer
   */
  readFileSlice(file, start, length) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(file.slice(start, start + length));
    });
  }

  /**
   * Render the library UI
   */
  render() {
    if (!this.container) return;

    if (this.games.length === 0) {
      this.container.innerHTML = this.renderEmpty();
      this.setupDropZone();
      return;
    }

    const driveBtn = window.driveUI ? window.driveUI.renderConnectButton() : '';
    this.container.innerHTML = `
      <div class="n64-library">
        <div class="n64-library__header">
          <div class="n64-library__title">Game Library</div>
          <div class="n64-library__actions">
            ${driveBtn}
            <button class="n64-btn" onclick="gameLibrary.showAddDialog()">+ Add ROMs</button>
          </div>
        </div>
        <div class="n64-library__grid">
          ${this.games.map(g => this.renderGameCard(g)).join('')}
        </div>
      </div>
      <input type="file" id="libraryFileInput" multiple accept=".z64,.n64,.v64,.rom" style="display:none"
        onchange="gameLibrary.handleFileInput(event)">
    `;
  }

  renderGameCard(game) {
    const title = game.meta?.name || game.header.internalName || game.fileName;
    const year = game.meta?.year || '';
    const genre = game.meta?.genre || '';
    const region = game.header.country || '';
    const initial = title.charAt(0).toUpperCase();

    // Color based on genre
    const colors = {
      'Platformer': '#00ff41', 'Racing': '#ffcc00', 'FPS': '#ff3333',
      'Action-Adventure': '#4488ff', 'Sports': '#ff8800', 'Fighting': '#ff3333',
      'RPG': '#8844ff', 'Shooter': '#ff3333',
    };
    const accentColor = colors[genre] || '#00ff41';

    return `
      <div class="n64-game-card" onclick="gameLibrary.selectGame('${game.header.crcKey}')"
           title="${title} (${year})">
        <div class="n64-game-card__cover" style="border-color: ${accentColor}">
          ${game.coverUrl
            ? `<img src="${game.coverUrl}" alt="${title}">`
            : `<div class="n64-game-card__placeholder" style="color: ${accentColor}">
                <div class="n64-game-card__initial">${initial}</div>
                <div class="n64-game-card__cartridge">N64</div>
              </div>`
          }
        </div>
        <div class="n64-game-card__info">
          <div class="n64-game-card__title">${title}</div>
          <div class="n64-game-card__meta">
            ${year ? `<span>${year}</span>` : ''}
            ${genre ? `<span class="n64-game-card__genre" style="color:${accentColor}">${genre}</span>` : ''}
            ${region ? `<span>${region}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderEmpty() {
    return `
      <div class="n64-library-empty" id="libraryDropZone">
        <div class="n64-library-empty__icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="n64-library-empty__title">No Games Yet</div>
        <div class="n64-library-empty__text">
          Drop ROM files here or click to add games to your library
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button class="n64-btn n64-btn--filled" onclick="document.getElementById('libraryFileInput').click()">
            Add ROMs
          </button>
          ${window.driveUI?.drive?.configured ? `
            <button class="n64-btn n64-btn--yellow" onclick="driveUI.connect()">
              Connect Google Drive
            </button>
          ` : ''}
        </div>
        <input type="file" id="libraryFileInput" multiple accept=".z64,.n64,.v64,.rom" style="display:none"
          onchange="gameLibrary.handleFileInput(event)">
      </div>
    `;
  }

  setupDropZone() {
    const zone = document.getElementById('libraryDropZone');
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('n64-library-empty--dragover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('n64-library-empty--dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('n64-library-empty--dragover');
      this.addFiles(e.dataTransfer.files);
    });
  }

  handleFileInput(event) {
    this.addFiles(event.target.files);
    event.target.value = ''; // Reset for re-selection
  }

  showAddDialog() {
    document.getElementById('libraryFileInput').click();
  }

  /**
   * User selected a game — load it into the emulator
   */
  async selectGame(crcKey) {
    const game = this.games.find(g => g.header.crcKey === crcKey);
    if (!game) return;

    game.lastPlayed = Date.now();
    this.saveToCache();

    // If we have a local File reference, use it directly
    if (game.file) {
      if (this.onGameSelect) this.onGameSelect(game.file);
      return;
    }

    // If it's a Drive file, stream it
    if (game.driveFileId && window.googleDrive?.accessToken) {
      try {
        this.showLoadingOverlay(game.meta?.name || game.fileName);
        const buffer = await window.googleDrive.downloadFile(game.driveFileId);
        this.hideLoadingOverlay();

        // Create a File-like object from the ArrayBuffer
        const blob = new Blob([buffer]);
        const file = new File([blob], game.fileName);

        if (this.onGameSelect) this.onGameSelect(file);
      } catch (e) {
        this.hideLoadingOverlay();
        console.error('Failed to download ROM from Drive:', e);
        alert('Failed to download ROM from Google Drive. Try reconnecting.');
      }
      return;
    }

    // No file available — prompt to re-add
    alert('ROM file not available. Please re-add it from your files or reconnect Google Drive.');
  }

  showLoadingOverlay(gameName) {
    let overlay = document.getElementById('romLoadOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'romLoadOverlay';
      overlay.className = 'n64-kb-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="n64-wizard">
        <div class="n64-wizard__title" style="font-size:11px;">Downloading</div>
        <div class="n64-wizard__prompt" style="font-size:14px;">${gameName}</div>
        <div class="n64-wizard__subtitle">Streaming from Google Drive...</div>
        <div class="n64-loading__bar" style="width:200px;margin:16px auto 0;">
          <div class="n64-loading__bar-fill"></div>
        </div>
      </div>
    `;
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('romLoadOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  /**
   * Save library metadata to IndexedDB (not the ROM files themselves)
   */
  async saveToCache() {
    try {
      const data = this.games.map(g => ({
        id: g.id,
        fileName: g.fileName,
        fileSize: g.fileSize,
        header: g.header,
        meta: g.meta,
        lastPlayed: g.lastPlayed,
        // Don't cache: file reference (can't serialize), coverUrl (regenerated)
      }));
      localStorage.setItem(this.dbName, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to cache library:', e);
    }
  }

  /**
   * Load cached library metadata (ROM files need re-adding)
   */
  async loadFromCache() {
    try {
      const data = localStorage.getItem(this.dbName);
      if (data) {
        const cached = JSON.parse(data);
        this.games = cached.map(g => ({
          ...g,
          coverUrl: this.getCoverUrl(g.meta),
          file: null, // File reference lost — user needs to re-add
        }));
      }
    } catch (e) {
      console.warn('Failed to load library cache:', e);
    }
  }

  clearLibrary() {
    this.games = [];
    localStorage.removeItem(this.dbName);
    this.render();
  }
}

window.GameLibrary = GameLibrary;
window.gameLibrary = new GameLibrary();
