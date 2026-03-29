/* Service Worker for TM Hub push notifications */

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'TM Hub', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: payload.url || '/' },
    vibrate: [200, 100, 200],
    tag: payload.tag || 'tm-hub-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'TM Hub', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});
