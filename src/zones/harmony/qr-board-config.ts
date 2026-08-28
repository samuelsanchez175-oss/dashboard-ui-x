import { CDL_APP_STORE_URL, PENWORK_APP_STORE_URL } from './cdl-qr-shared'

export type QrBoardBrand = {
  id: 'cdl' | 'penwork'
  appName: string
  eyebrow: string
  headline: string
  sub: string
  defaultDest: string
  logoSrc: string
  logoLabel: string
  apiPrefix: string
  downloadName: string
  styleStorage: string
  destStorage: string
  printHint: string
  themeClass: string
  frameColor: string
  fg: string
  bg: string
  frameText: string
  privacyHref: string
  termsHref: string
}

export const CDL_QR_BRAND: QrBoardBrand = {
  id: 'cdl',
  appName: 'CDL TEST PREP 2027',
  eyebrow: 'Harmony Stack · dispatch',
  headline: 'CDL TEST PREP 2027\nSCAN BOARD',
  sub: 'Every time someone hits the QR, they bounce to the App Store and a pin drops here — city, device, time.',
  defaultDest: CDL_APP_STORE_URL,
  logoSrc: `${import.meta.env.BASE_URL}cdl-qr-truck.png`,
  logoLabel: 'CDL truck',
  apiPrefix: '/api/cdl-qr',
  downloadName: 'cdl-test-prep-2027-qr.png',
  styleStorage: 'cdl-qr-style-v1',
  destStorage: 'cdl-qr-dest-v1',
  printHint: 'Truck sits in the quiet zone. Error correction is high so it still scans under tape and yard light.',
  themeClass: 'cdl-scan-board',
  frameColor: '#1F3F2A',
  fg: '#1F3F2A',
  bg: '#F5F1E8',
  frameText: 'SCAN ME',
  privacyHref: '/harmony/cdl-privacy.html',
  termsHref: '/harmony/cdl-terms.html',
}

export const PENWORK_QR_BRAND: QrBoardBrand = {
  id: 'penwork',
  appName: 'Penwork Studio',
  eyebrow: 'Harmony Stack · songwriter',
  headline: 'PENWORK STUDIO\nSCAN BOARD',
  sub: 'Every flyer and post that uses this QR logs a scan here, then sends people to the Penwork App Store page.',
  defaultDest: PENWORK_APP_STORE_URL,
  logoSrc: `${import.meta.env.BASE_URL}harmony/portfolio-screenshots/penwork-icon.png`,
  logoLabel: 'Penwork icon',
  apiPrefix: '/api/penwork-qr',
  downloadName: 'penwork-studio-qr.png',
  styleStorage: 'penwork-qr-style-v1',
  destStorage: 'penwork-qr-dest-v1',
  printHint: 'App icon sits in the quiet zone. High error correction so it still scans on a dim stage or a street flyer.',
  themeClass: 'penwork-scan-board',
  frameColor: '#ff7059',
  fg: '#2a2320',
  bg: '#fff7f3',
  frameText: 'WRITE ON',
  privacyHref: '/harmony/penwork-privacy.html',
  termsHref: '/harmony/penwork-terms.html',
}
