const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('OPK app shell could not be cached for offline use.', error);
    });
  }, { once: true });
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  window.dispatchEvent(new Event('opk-install-availability'));
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  window.dispatchEvent(new Event('opk-app-installed'));
});

export function getInstallState() {
  if (isStandalone()) return 'installed';
  return installPrompt ? 'ready' : 'unavailable';
}

export async function promptInstall() {
  if (isStandalone()) return { outcome: 'installed' };
  if (!installPrompt) return { outcome: 'unavailable' };

  const prompt = installPrompt;
  installPrompt = null;
  window.dispatchEvent(new Event('opk-install-availability'));
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return { outcome };
}
