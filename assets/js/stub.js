const app = document.getElementById('app');

import('./modules.js').catch((error) => {
  console.error('OPK page could not be started.', error);
  app.innerHTML = '<main class="content"><div class="alert alert-error" role="alert">This page could not start. Please reload the page. If the problem continues, contact your administrator.</div><button class="btn btn-primary" id="retry-page" type="button">Reload page</button></main>';
  document.getElementById('retry-page').addEventListener('click', () => location.reload());
});
