(function () {
  window.GTOApp = window.GTOApp || {};
  const { config, utils, logger } = window.GTOApp;

  window.GTOApp.storage = {
    load() {
      const raw = localStorage.getItem(config.storageKey);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (error) {
        logger.error('Не удалось прочитать локальное состояние', error);
        return null;
      }
    },
    save(state) {
      localStorage.setItem(config.storageKey, JSON.stringify(state));
    },
    async exportToFile(state) {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      utils.downloadBlob(blob, config.projectFileName);
    },
    async importFromFile(file) {
      return JSON.parse(await file.text());
    },
    async chooseDirectory() {
      if (!window.showDirectoryPicker) throw new Error('Браузер не поддерживает выбор рабочей папки.');
      return window.showDirectoryPicker();
    },
    async saveToDirectory(directoryHandle, state) {
      const fileHandle = await directoryHandle.getFileHandle(config.projectFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
    }
  };
})();
