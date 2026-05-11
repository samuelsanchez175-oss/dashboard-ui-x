import { Headphones } from 'lucide-react'
import MixingAudioGrabber from './MixingAudioGrabber'

/** Sidebar route — YouTube → MP3 workspace + dock. */
export default function MixingAudioGrabPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white text-gray-900">
      <div className="shrink-0 px-8 pt-8 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Headphones className="size-5 text-gray-600" aria-hidden />
          Audio grab
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Pull MP3 audio locally via the dev server — clips stack in the dock below.
        </p>
      </div>
      <MixingAudioGrabber />
    </div>
  )
}
