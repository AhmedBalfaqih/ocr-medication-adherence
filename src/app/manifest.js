// FR10 NIR1 Lets the app be added to the Home Screen, which iOS needs for reminders
export default function manifest() {
  return {
    name: 'OCR Medication Adherence',
    short_name: 'Medicines',
    description:
      'Add your medicines, get a reminder for each dose and see the doses you have taken.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
