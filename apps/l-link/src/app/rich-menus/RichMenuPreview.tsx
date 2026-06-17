import type { LLinkRichMenu, LLinkRichMenuArea } from "@/lib/rich-menus/lLinkRichMenus";

function menuName(menu: LLinkRichMenu) {
  return menu.name || menu.title || "リッチメニュー";
}

export function RichMenuPreview({ menu, areas }: { menu: LLinkRichMenu; areas: LLinkRichMenuArea[] }) {
  const width = Math.max(menu.width || 2500, 1);
  const height = Math.max(menu.height || 1686, 1);
  const imageUrl = menu.image_url || menu.image_path;

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ aspectRatio: `${width} / ${height}` }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={menuName(menu)} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm font-bold text-slate-400">
            {width} x {height} プレビュー
          </div>
        )}
        {areas.map((area) => (
          <div
            key={area.id}
            className="absolute border-2 border-green-500 bg-green-500/15 px-2 py-1 text-xs font-black text-green-950"
            style={{
              left: `${(area.x / width) * 100}%`,
              top: `${(area.y / height) * 100}%`,
              width: `${(area.width / width) * 100}%`,
              height: `${(area.height / height) * 100}%`,
            }}
          >
            {area.label || "エリア"}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs font-bold text-slate-500">数値入力したタップ領域を比率換算で重ねています。ドラッグ編集は次フェーズで対応します。</p>
    </div>
  );
}
