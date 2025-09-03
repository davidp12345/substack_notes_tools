// popup.js
class SimplePopup {
  constructor() {
    this.enabledSources = { linkedin: true, x: true };
    this.init();
  }

  async init() {
    try {
      await this.loadToggles();
      this.bindToggleHandlers();
    } catch (err) {
      console.error('Popup init failed', err);
    }
  }

  async loadToggles() {
    const { enabledSources } = await chrome.storage.sync.get(['enabledSources']);
    this.enabledSources = {
      linkedin: enabledSources?.linkedin !== false,
      x: enabledSources?.x !== false
    };
    
    document.getElementById('toggle-linkedin').checked = this.enabledSources.linkedin;
    document.getElementById('toggle-x').checked = this.enabledSources.x;
  }

  bindToggleHandlers() {
    const save = async () => { 
      await chrome.storage.sync.set({ enabledSources: this.enabledSources }); 
    };
    
    document.getElementById('toggle-linkedin').addEventListener('change', (e) => { 
      this.enabledSources.linkedin = !!e.target.checked; 
      save(); 
    });
    
    document.getElementById('toggle-x').addEventListener('change', (e) => { 
      this.enabledSources.x = !!e.target.checked; 
      save(); 
    });
  }
}

new SimplePopup();