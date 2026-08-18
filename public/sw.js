// Service worker mínimo: solo existe para poder recibir notificaciones push cuando la app
// está cerrada o en segundo plano. No cachea nada (no es para funcionar offline).

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
  const url = data.url || '/';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url, hiloId: data.hiloId || null },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Si la app ya está abierta en algún dispositivo/pestaña, le avisa además con un
      // mensaje directo — así se puede mostrar un aviso adentro de la app, no solo la
      // notificación del sistema operativo.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ tipo: 'aviso', texto: data.body || title, hiloId: data.hiloId || null, fecha: data.fecha || null, hora: data.hora || null });
        }
      }),
    ])
  );
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
