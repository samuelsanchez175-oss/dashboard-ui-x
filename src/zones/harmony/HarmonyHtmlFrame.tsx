/**
 * Full-bleed iframe for Harmony Stack static HTML pages served from
 * `public/harmony/` (portfolio, CDL One Stop, Penwork Studio, etc.).
 */
export default function HarmonyHtmlFrame({
  file,
  title,
}: {
  file: string
  title: string
}) {
  const src = `${import.meta.env.BASE_URL}harmony/${file}`
  return (
    <div className="zone-canvas fade-in m-0 flex min-h-0 min-w-0 flex-1 flex-col p-0">
      <div className="m-0 flex min-h-0 min-w-0 w-full flex-1 flex-col p-0">
        <iframe
          title={title}
          src={src}
          className="m-0 block min-h-0 min-w-0 h-full w-full flex-1 border-0 bg-[var(--bg-canvas)] p-0 align-top"
        />
      </div>
    </div>
  )
}
