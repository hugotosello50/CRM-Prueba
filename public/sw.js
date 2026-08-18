// Service worker mínimo: solo existe para poder recibir notificaciones push cuando la app
// está cerrada o en segundo plano. No cachea nada (no es para funcionar offline).
//
// El cartel de aviso DENTRO de la app no depende de este archivo — se arma solo, a partir de
// los datos (ver "buscarAvisoSinVer" en components/CRM.jsx), así aparece sin importar cómo se
// haya vuelto a la app. Acá solo hace falta armar bien la notificación del sistema operativo
// y, al tocarla, llevar a la app a la ficha correspondiente.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Recordatorio', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Recordatorio';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
