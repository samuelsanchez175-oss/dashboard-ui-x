import { QrScanBoard } from './CdlQrZone'
import { PENWORK_QR_BRAND } from './qr-board-config'

export default function PenworkQrZone() {
  return <QrScanBoard brand={PENWORK_QR_BRAND} />
}
