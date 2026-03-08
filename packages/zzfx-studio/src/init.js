Neutralino.init();
Neutralino.events.on('windowClose', function() { Neutralino.app.exit(); });

// Set up native menu bar (required on macOS for clipboard shortcuts to work)
if (NL_OS === 'Darwin') {
  Neutralino.window.setMainMenu([
    {
      id: 'app',
      text: 'ZzFX Studio',
      menuItems: [
        { id: 'about', text: 'About ZzFX Studio', action: 'orderFrontStandardAboutPanel:' },
        { text: '-' },
        { id: 'hide', text: 'Hide ZzFX Studio', shortcut: 'h', action: 'hide:' },
        { id: 'hideOthers', text: 'Hide Others', shortcut: 'H', action: 'hideOtherApplications:' },
        { id: 'showAll', text: 'Show All', action: 'unhideAllApplications:' },
        { text: '-' },
        { id: 'quit', text: 'Quit ZzFX Studio', shortcut: 'q', action: 'terminate:' }
      ]
    },
    {
      id: 'file',
      text: 'File',
      menuItems: [
        { id: 'import', text: 'Import...', shortcut: 'i' }
      ]
    },
    {
      id: 'edit',
      text: 'Edit',
      menuItems: [
        { id: 'undo', text: 'Undo', shortcut: 'z', action: 'undo:' },
        { id: 'redo', text: 'Redo', shortcut: 'Z', action: 'redo:' },
        { text: '-' },
        { id: 'cut', text: 'Cut', shortcut: 'x', action: 'cut:' },
        { id: 'copy', text: 'Copy', shortcut: 'c', action: 'copy:' },
        { id: 'paste', text: 'Paste', shortcut: 'v', action: 'paste:' },
        { id: 'selectAll', text: 'Select All', shortcut: 'a', action: 'selectAll:' }
      ]
    },
    {
      id: 'window',
      text: 'Window',
      menuItems: [
        { id: 'minimize', text: 'Minimize', shortcut: 'm', action: 'performMiniaturize:' },
        { id: 'zoom', text: 'Zoom', action: 'performZoom:' },
        { text: '-' },
        { id: 'fullscreen', text: 'Toggle Full Screen', shortcut: 'f', action: 'toggleFullScreen:' },
        { text: '-' },
        { id: 'front', text: 'Bring All to Front', action: 'arrangeInFront:' }
      ]
    }
  ]);
} else if (NL_OS === 'Windows') {
  Neutralino.window.setMainMenu([
    {
      id: 'file',
      text: 'File',
      menuItems: [
        { id: 'import', text: 'Import...', shortcut: 'Ctrl+I' },
        { text: '-' },
        { id: 'quit', text: 'Exit', shortcut: 'Alt+F4' }
      ]
    },
    {
      id: 'edit',
      text: 'Edit',
      menuItems: [
        { id: 'undo', text: 'Undo', shortcut: 'Ctrl+Z' },
        { id: 'redo', text: 'Redo', shortcut: 'Ctrl+Y' },
        { text: '-' },
        { id: 'cut', text: 'Cut', shortcut: 'Ctrl+X' },
        { id: 'copy', text: 'Copy', shortcut: 'Ctrl+C' },
        { id: 'paste', text: 'Paste', shortcut: 'Ctrl+V' },
        { id: 'selectAll', text: 'Select All', shortcut: 'Ctrl+A' }
      ]
    }
  ]);
} else if (NL_OS === 'Linux') {
  Neutralino.window.setMainMenu([
    {
      id: 'file',
      text: 'File',
      menuItems: [
        { id: 'import', text: 'Import...', shortcut: 'Ctrl+I' },
        { text: '-' },
        { id: 'quit', text: 'Quit', shortcut: 'Ctrl+Q' }
      ]
    },
    {
      id: 'edit',
      text: 'Edit',
      menuItems: [
        { id: 'undo', text: 'Undo', shortcut: 'Ctrl+Z' },
        { id: 'redo', text: 'Redo', shortcut: 'Ctrl+Shift+Z' },
        { text: '-' },
        { id: 'cut', text: 'Cut', shortcut: 'Ctrl+X' },
        { id: 'copy', text: 'Copy', shortcut: 'Ctrl+C' },
        { id: 'paste', text: 'Paste', shortcut: 'Ctrl+V' },
        { id: 'selectAll', text: 'Select All', shortcut: 'Ctrl+A' }
      ]
    }
  ]);
}

// Handle menu item clicks (for items without predefined actions)
Neutralino.events.on('mainMenuItemClicked', function(e) {
  switch (e.detail.id) {
    case 'quit':
      Neutralino.app.exit();
      break;
    case 'import':
      // Dispatch a custom event the app can listen for
      window.dispatchEvent(new CustomEvent('zs-import'));
      break;
  }
});
