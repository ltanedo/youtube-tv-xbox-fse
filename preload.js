const { contextBridge } = require('electron');

// Override Page Visibility API to prevent YouTube auto-pause on background
// But allow user-initiated pauses
const injectCode = () => {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            console.log('Background play: Starting injection...');

            // Override Page Visibility API to always report "visible"
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'webkitHidden', { get: () => false });
            Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible' });

            // Prevent YouTube's player from detecting focus loss
            setInterval(() => {
                Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            }, 1000);

            console.log('Background play: Visibility API overridden');
        })();
    `;
    (document.head || document.documentElement).appendChild(script);
};

// Try to inject at multiple points
injectCode();
window.addEventListener('load', injectCode);
window.addEventListener('DOMContentLoaded', injectCode);