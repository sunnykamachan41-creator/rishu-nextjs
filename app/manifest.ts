import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'YORA',
    short_name:       'YORA',
    description:      '学芸大学生のための履修管理アプリ',
    start_url:        '/',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#ffffff',
    theme_color:      '#4f46e5',
    categories:       ['education', 'productivity'],
    icons: [
      {
        src:   '/icons/icon-192.png',
        sizes: '192x192',
        type:  'image/png',
      },
      {
        src:     '/icons/icon-192-maskable.png',
        sizes:   '192x192',
        type:    'image/png',
        purpose: 'maskable',
      },
      {
        src:   '/icons/icon-512.png',
        sizes: '512x512',
        type:  'image/png',
      },
      {
        src:     '/icons/icon-512-maskable.png',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'maskable',
      },
      {
        src:   '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type:  'image/png',
      },
    ],
  }
}
