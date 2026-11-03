// NIR1 NIR2 Show the medicine name and time, with Taken and Skip where the browser has buttons
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: `reminder-${data.reminderId}`,
      data,
      actions: [
        { action: 'taken', title: 'Taken' },
        { action: 'skipped', title: 'Skip' },
      ],
    }),
  );
});

// NIR3 Taken and Skip log the dose; a body tap, the only path on Safari, opens the dose page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { reminderId } = event.notification.data;
  const open = () => self.clients.openWindow(`/doses/${reminderId}`);
  if (event.action === 'taken' || event.action === 'skipped') {
    event.waitUntil(
      fetch(`/api/doses/${reminderId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: event.action.toUpperCase() }),
      })
        .then((res) => (res.ok ? undefined : open()))
        .catch(open),
    );
  } else {
    event.waitUntil(open());
  }
});
