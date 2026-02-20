const { contextBridge } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    try {
        const script = document.createElement('script');
        script.textContent = `
            try {
                Object.defineProperty(document, 'hidden', { get: () => false });
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
            } catch(e) {}
        `;
        (document.head || document.documentElement).appendChild(script);
    } catch(e) {}
});