/**
 * N64.wasm Google Drive Integration
 * Connect a Drive folder, scan for ROMs, identify games, stream to emulator.
 * Uses Google Identity Services (GIS) + Drive API v3 + Picker API.
 * Browser-only — no backend required.
 */
class GoogleDriveLibrary {
  constructor() {
    this.clientId = null; // Set via configure()
    this.accessToken = null;
    this.folderId = null;
    this.folderName = null;
    this.files = []; // { id, name, size, mimeType }
    this.scanning = false;
    this.configured = false;

    // APIs loaded state
    this.gapiLoaded = false;
    this.gisLoaded = false;
    this.pickerLoaded = false;
  }

  /**
   * Configure with Google Cloud OAuth Client ID
   * @param {string} clientId - OAuth 2.0 Web Client ID
   */
  configure(clientId) {
    this.clientId = clientId;
    this.configured = true;
    this.loadGoogleApis();
  }

  /**
   * Load Google API scripts
   */
  loadGoogleApis() {
    // Load GAPI (for Drive API)
    if (!document.getElementById('gapi-script')) {
      const s = document.createElement('script');
      s.id = 'gapi-script';
      s.src = 'https://apis.google.com/js/api.js';
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        gapi.load('client:picker', async () => {
          await gapi.client.init({});
          await gapi.client.load('drive', 'v3');
          this.gapiLoaded = true;
          this.pickerLoaded = true;
          console.log('Google Drive: GAPI + Picker loaded');
        });
      };
      document.head.appendChild(s);
    }

    // Load GIS (Google Identity Services)
    if (!document.getElementById('gis-script')) {
      const s = document.createElement('script');
      s.id = 'gis-script';
      s.src = 'https://accounts.google.com/gsi/client';
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        this.gisLoaded = true;
        console.log('Google Drive: GIS loaded');
      };
      document.head.appendChild(s);
    }
  }

  /**
   * Request OAuth token via Google Identity Services
   */
  async authenticate() {
    if (!this.gisLoaded) throw new Error('GIS not loaded yet');

    return new Promise((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          this.accessToken = response.access_token;
          gapi.client.setToken({ access_token: this.accessToken });
          console.log('Google Drive: Authenticated');
          resolve(this.accessToken);
        },
      });
      tokenClient.requestAccessToken();
    });
  }

  /**
   * Open Google Picker to select a folder
   */
  async pickFolder() {
    if (!this.accessToken) await this.authenticate();
    if (!this.pickerLoaded) throw new Error('Picker API not loaded yet');

    return new Promise((resolve, reject) => {
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(this.accessToken)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            const folder = data.docs[0];
            this.folderId = folder.id;
            this.folderName = folder.name;
            console.log(`Google Drive: Selected folder "${folder.name}" (${folder.id})`);
            resolve({ id: folder.id, name: folder.name });
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .setTitle('Select ROM Folder')
        .build();

      picker.setVisible(true);
    });
  }

  /**
   * Scan the selected folder for N64 ROM files
   */
  async scanFolder() {
    if (!this.folderId || !this.accessToken) return [];
    this.scanning = true;

    try {
      const romExtensions = ['.z64', '.n64', '.v64', '.rom'];
      let allFiles = [];
      let pageToken = null;

      // Paginate through all files in the folder
      do {
        const query = `'${this.folderId}' in parents and trashed = false`;
        const resp = await gapi.client.drive.files.list({
          q: query,
          fields: 'nextPageToken, files(id, name, size, mimeType)',
          pageSize: 100,
          pageToken: pageToken,
        });

        const files = resp.result.files || [];
        allFiles = allFiles.concat(files);
        pageToken = resp.result.nextPageToken;
      } while (pageToken);

      // Filter to ROM files
      this.files = allFiles.filter(f => {
        const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
        return romExtensions.includes(ext);
      });

      console.log(`Google Drive: Found ${this.files.length} ROM files in "${this.folderName}"`);
      return this.files;
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Read the first N bytes of a Drive file (for ROM header parsing)
   * Uses HTTP Range request — doesn't download the full file.
   */
  async readFileHeader(fileId, bytes = 64) {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Range': `bytes=0-${bytes - 1}`,
        },
      }
    );

    if (!resp.ok) throw new Error(`Failed to read file header: ${resp.status}`);
    return await resp.arrayBuffer();
  }

  /**
   * Download a full ROM file from Drive
   * @returns {ArrayBuffer}
   */
  async downloadFile(fileId) {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!resp.ok) throw new Error(`Failed to download file: ${resp.status}`);
    return await resp.arrayBuffer();
  }

  /**
   * Scan folder and identify all ROMs
   * Returns game metadata for each ROM found.
   */
  async scanAndIdentify(onProgress) {
    const files = await this.scanFolder();
    const games = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) onProgress(i + 1, files.length, file.name);

      try {
        // Fetch just the header (64 bytes)
        const headerBytes = await this.readFileHeader(file.id, 64);
        const header = N64RomParser.parse(headerBytes);
        const meta = window.n64GameDB.lookup(header);

        games.push({
          driveFileId: file.id,
          fileName: file.name,
          fileSize: parseInt(file.size) || 0,
          header,
          meta,
          coverUrl: meta?.cover || null,
          source: 'google-drive',
        });
      } catch (e) {
        console.warn(`Failed to parse ROM header for ${file.name}:`, e);
        games.push({
          driveFileId: file.id,
          fileName: file.name,
          fileSize: parseInt(file.size) || 0,
          header: null,
          meta: { name: file.name.replace(/\.[^.]+$/, ''), year: null, genre: null, cover: null },
          coverUrl: null,
          source: 'google-drive',
        });
      }
    }

    return games;
  }
}

/**
 * UI integration for Google Drive in the game library
 */
class DriveLibraryUI {
  constructor(driveLib, gameLibrary) {
    this.drive = driveLib;
    this.library = gameLibrary;
  }

  /**
   * Render the "Connect Google Drive" button
   */
  renderConnectButton() {
    if (!this.drive.configured) {
      return `<div class="n64-drive-unconfigured">
        <span style="font-size:10px;color:rgba(255,255,255,0.2);">Google Drive integration requires setup</span>
      </div>`;
    }

    if (this.drive.folderId) {
      return `
        <div class="n64-drive-connected">
          <span class="n64-drive-status">Connected: ${this.drive.folderName}</span>
          <button class="n64-btn" onclick="driveUI.rescan()">Rescan</button>
          <button class="n64-btn n64-btn--red" onclick="driveUI.disconnect()">Disconnect</button>
        </div>
      `;
    }

    return `
      <button class="n64-btn n64-btn--yellow" onclick="driveUI.connect()">
        Connect Google Drive
      </button>
    `;
  }

  /**
   * Connect to Google Drive: authenticate → pick folder → scan → add to library
   */
  async connect() {
    try {
      await this.drive.authenticate();
      const folder = await this.drive.pickFolder();
      if (!folder) return;

      // Show scanning progress
      this.showScanProgress();

      const games = await this.drive.scanAndIdentify((current, total, name) => {
        this.updateScanProgress(current, total, name);
      });

      // Add to game library
      for (const game of games) {
        const existing = this.library.games.findIndex(
          g => g.header?.crcKey === game.header?.crcKey
        );

        const libGame = {
          id: `drive-${game.driveFileId}`,
          fileName: game.fileName,
          fileSize: game.fileSize,
          header: game.header || { crcKey: game.driveFileId, internalName: game.fileName },
          meta: game.meta,
          coverUrl: game.coverUrl,
          lastPlayed: null,
          file: null, // Will be streamed from Drive on demand
          driveFileId: game.driveFileId,
          source: 'google-drive',
        };

        if (existing >= 0) {
          this.library.games[existing] = libGame;
        } else {
          this.library.games.push(libGame);
        }
      }

      // Save and re-render
      this.library.saveToCache();
      this.library.render();

      console.log(`Google Drive: Added ${games.length} games to library`);
    } catch (e) {
      console.error('Google Drive connection failed:', e);
      alert('Failed to connect to Google Drive: ' + e.message);
    }
  }

  async rescan() {
    if (!this.drive.folderId) return;
    await this.connect();
  }

  disconnect() {
    this.drive.folderId = null;
    this.drive.folderName = null;
    this.drive.accessToken = null;
    this.drive.files = [];

    // Remove Drive-sourced games from library
    this.library.games = this.library.games.filter(g => g.source !== 'google-drive');
    this.library.saveToCache();
    this.library.render();
  }

  showScanProgress() {
    const container = document.getElementById('gameLibraryContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="n64-library-empty" style="border-color: var(--n64-yellow);">
        <div class="n64-library-empty__title" style="color:var(--n64-yellow);" id="scanTitle">Scanning Drive...</div>
        <div class="n64-library-empty__text" id="scanStatus">Connecting...</div>
        <div style="width:200px;height:3px;background:rgba(255,255,255,0.1);margin-top:16px;">
          <div id="scanBar" style="height:100%;background:var(--n64-yellow);width:0%;transition:width 0.3s;"></div>
        </div>
      </div>
    `;
  }

  updateScanProgress(current, total, name) {
    const status = document.getElementById('scanStatus');
    const bar = document.getElementById('scanBar');
    if (status) status.textContent = `Identifying ${name} (${current}/${total})`;
    if (bar) bar.style.width = `${(current / total) * 100}%`;
  }
}

// Initialize
window.GoogleDriveLibrary = GoogleDriveLibrary;
window.googleDrive = new GoogleDriveLibrary();
window.DriveLibraryUI = DriveLibraryUI;
