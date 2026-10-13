export function GoogleMapPanel() {
  const embedUrl = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL;
  const googleMapsUrl =
    'https://www.google.com/maps/search/?api=1&query=Hong+Kong';
  const osmEmbedUrl =
    'https://www.openstreetmap.org/export/embed.html?bbox=113.85%2C22.20%2C114.45%2C22.60&layer=mapnik&marker=22.3193%2C114.1694';

  if (embedUrl) {
    return (
      <div className="relative h-[420px] overflow-hidden rounded-[22px] bg-slate-100">
        <iframe
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={embedUrl}
          title="Google Maps Hong Kong transit map"
        />
        <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow">
          Google Maps · 路線及地圖資料由 Google 提供
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[22px] bg-slate-100">
      <iframe
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={osmEmbedUrl}
        title="OpenStreetMap Hong Kong transit map"
      />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow">
        <span>OpenStreetMap · 地圖資料由貢獻者提供</span>
        <a
          className="font-bold text-[#176b2c] underline"
          href={googleMapsUrl}
          rel="noreferrer"
          target="_blank"
        >
          在 Google Maps 開啟
        </a>
      </div>
    </div>
  );
}
