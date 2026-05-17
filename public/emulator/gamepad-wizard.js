/**
 * N64.wasm Gamepad Auto-Detect Wizard
 * Walks through each N64 button and maps it to the connected gamepad.
 * Saves to localStorage for persistence.
 */
class GamepadWizard {
  constructor() {
    this.buttons = [
      { key: 'Joy_Mapping_Action_A', label: 'A', color: '#0066ff' },
      { key: 'Joy_Mapping_Action_B', label: 'B', color: '#00cc00' },
      { key: 'Joy_Mapping_Action_Z', label: 'Z', color: '#8844ff' },
      { key: 'Joy_Mapping_Action_Start', label: 'START', color: '#ffcc00' },
      { key: 'Joy_Mapping_Action_L', label: 'L', color: '#ff6600' },
      { key: 'Joy_Mapping_Action_R', label: 'R', color: '#ff6600' },
      { key: 'Joy_Mapping_Action_CUP', label: 'C-UP', color: '#ffcc00' },
      { key: 'Joy_Mapping_Action_CDOWN', label: 'C-DOWN', color: '#ffcc00' },
      { key: 'Joy_Mapping_Action_CLEFT', label: 'C-LEFT', color: '#ffcc00' },
      { key: 'Joy_Mapping_Action_CRIGHT', label: 'C-RIGHT', color: '#ffcc00' },
      { key: 'Joy_Mapping_Up', label: 'D-PAD UP', color: '#c0c0c0' },
      { key: 'Joy_Mapping_Down', label: 'D-PAD DOWN', color: '#c0c0c0' },
      { key: 'Joy_Mapping_Left', label: 'D-PAD LEFT', color: '#c0c0c0' },
      { key: 'Joy_Mapping_Right', label: 'D-PAD RIGHT', color: '#c0c0c0' },
    ];
    this.currentIndex = 0;
    this.mapping = {};
    this.lastBtn = -1;
    this.active = false;
    this.pollInterval = null;
    this.container = document.getElementById('gamepadWizard');
  }

  start() {
    // Check if we have a saved mapping
    const saved = localStorage.getItem('n64wasm-gamepad-mapping');
    if (saved) {
      this.applyMapping(JSON.parse(saved));
      return;
    }

    // Check if a gamepad is connected
    const gp = this.getGamepad();
    if (!gp) return;

    this.active = true;
    this.currentIndex = 0;
    this.mapping = {};
    this.render();
    this.startPolling();
  }

  promptOnConnect() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`Gamepad connected: ${e.gamepad.id}`);
      const saved = localStorage.getItem('n64wasm-gamepad-mapping');
      if (!saved) {
        // Show a prompt to map
        setTimeout(() => this.showConnectPrompt(e.gamepad), 500);
      } else {
        this.applyMapping(JSON.parse(saved));
        this.showStatus(e.gamepad, true);
      }
    });
  }

  showConnectPrompt(gamepad) {
    this.container.innerHTML = `
      <div class="n64-wizard-overlay" id="wizardOverlay">
        <div class="n64-wizard">
          <div class="n64-wizard__title">Controller Detected</div>
          <div class="n64-wizard__subtitle">${gamepad.id.substring(0, 40)}</div>
          <div style="margin-top:20px;">
            <button class="n64-btn n64-btn--filled" onclick="gamepadWizard.startMapping()">Map Buttons</button>
            &nbsp;
            <button class="n64-btn" onclick="gamepadWizard.skipWizard()">Skip</button>
          </div>
        </div>
      </div>
    `;
  }

  startMapping() {
    this.active = true;
    this.currentIndex = 0;
    this.mapping = {};
    this.render();
    this.startPolling();
  }

  skipWizard() {
    this.container.innerHTML = '';
    this.active = false;
  }

  getGamepad() {
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i].buttons.length > 0) return gamepads[i];
    }
    return null;
  }

  render() {
    if (!this.active) { this.container.innerHTML = ''; return; }

    const btn = this.buttons[this.currentIndex];
    const progress = ((this.currentIndex) / this.buttons.length) * 100;
    const mappedList = Object.entries(this.mapping)
      .map(([k, v]) => {
        const label = this.buttons.find(b => b.key === k)?.label || k;
        return `<span style="color:var(--n64-green);">${label}=btn${v}</span>`;
      })
      .join(' &middot; ');

    this.container.innerHTML = `
      <div class="n64-wizard-overlay" id="wizardOverlay">
        <div class="n64-wizard">
          <div class="n64-wizard__title">Map Controller</div>
          <div class="n64-wizard__subtitle">Press each button on your controller</div>
          <div class="n64-wizard__prompt" style="color:${btn.color}">
            Press ${btn.label}
          </div>
          ${mappedList ? `<div class="n64-wizard__mapped">${mappedList}</div>` : ''}
          <div class="n64-wizard__progress">
            <div class="n64-wizard__progress-bar" style="width:${progress}%"></div>
          </div>
          <div class="n64-wizard__skip" onclick="gamepadWizard.skipWizard()">
            Press ESC to skip
          </div>
        </div>
      </div>
    `;
  }

  startPolling() {
    // Listen for ESC
    this.escHandler = (e) => {
      if (e.key === 'Escape') this.skipWizard();
    };
    document.addEventListener('keydown', this.escHandler);

    this.pollInterval = setInterval(() => {
      if (!this.active) { this.stopPolling(); return; }

      const gp = this.getGamepad();
      if (!gp) return;

      // Find pressed button
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i].pressed && i !== this.lastBtn) {
          // Make sure this button isn't already mapped
          const alreadyUsed = Object.values(this.mapping).includes(i);
          if (alreadyUsed) continue;

          this.mapping[this.buttons[this.currentIndex].key] = i;
          this.lastBtn = i;
          this.currentIndex++;

          if (this.currentIndex >= this.buttons.length) {
            this.finish();
            return;
          }
          this.render();
          break;
        }
      }

      // Reset lastBtn when nothing pressed
      if (!gp.buttons.some(b => b.pressed)) {
        this.lastBtn = -1;
      }
    }, 50);
  }

  stopPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.escHandler) document.removeEventListener('keydown', this.escHandler);
  }

  finish() {
    this.stopPolling();
    this.active = false;
    this.container.innerHTML = `
      <div class="n64-wizard-overlay" id="wizardOverlay">
        <div class="n64-wizard">
          <div class="n64-wizard__title" style="color:var(--n64-green);">Mapping Complete</div>
          <div style="margin-top:16px;font-size:12px;color:var(--n64-text);">
            ${this.buttons.map(b => `${b.label}=btn${this.mapping[b.key]}`).join(' &middot; ')}
          </div>
          <div style="margin-top:24px;">
            <button class="n64-btn n64-btn--filled" onclick="gamepadWizard.saveAndClose()">Save</button>
            &nbsp;
            <button class="n64-btn n64-btn--red" onclick="gamepadWizard.startMapping()">Redo</button>
          </div>
        </div>
      </div>
    `;

    // Save to localStorage
    localStorage.setItem('n64wasm-gamepad-mapping', JSON.stringify(this.mapping));
    this.applyMapping(this.mapping);
  }

  saveAndClose() {
    this.container.innerHTML = '';
    const gp = this.getGamepad();
    if (gp) this.showStatus(gp, true);
  }

  applyMapping(mapping) {
    // Apply to the input controller's KeyMappings
    if (window.myApp && window.myApp.rivetsData && window.myApp.rivetsData.inputController) {
      const km = window.myApp.rivetsData.inputController.KeyMappings;
      for (const [key, value] of Object.entries(mapping)) {
        if (km.hasOwnProperty(key)) {
          km[key] = value;
        }
      }
      window.myApp.rivetsData.inputController.Gamepad_Process_Axis = true;
      console.log('Gamepad mapping applied:', mapping);
    }
  }

  showStatus(gamepad, connected) {
    // Add a small status indicator
    let statusEl = document.getElementById('gamepadStatus');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'gamepadStatus';
      document.body.appendChild(statusEl);
    }
    if (connected) {
      statusEl.className = 'n64-gamepad-status n64-gamepad-status--connected';
      statusEl.textContent = '● Controller Connected';
      setTimeout(() => { statusEl.style.opacity = '0.4'; }, 3000);
    } else {
      statusEl.className = 'n64-gamepad-status n64-gamepad-status--none';
      statusEl.textContent = '○ No Controller';
    }
  }

  resetMapping() {
    localStorage.removeItem('n64wasm-gamepad-mapping');
    console.log('Gamepad mapping cleared. Reconnect controller to remap.');
  }
}

// Initialize
const gamepadWizard = new GamepadWizard();
gamepadWizard.promptOnConnect();

// Try to detect already-connected gamepads
setTimeout(() => {
  const gp = gamepadWizard.getGamepad();
  if (gp) {
    const saved = localStorage.getItem('n64wasm-gamepad-mapping');
    if (saved) {
      gamepadWizard.applyMapping(JSON.parse(saved));
      gamepadWizard.showStatus(gp, true);
    } else {
      gamepadWizard.showConnectPrompt(gp);
    }
  }
}, 1000);
