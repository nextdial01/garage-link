import LinePackageShell from '@/components/line-package/LinePackageShell';

type LineFeatureComingSoonProps = {
  title: string;
  description: string;
};

export default function LineFeatureComingSoon({
  title,
  description,
}: LineFeatureComingSoonProps) {
  return (
    <LinePackageShell title={title} description={description}>
      <section className="rounded-2xl border border-green-100 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold text-green-700">準備中</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          現在準備中です。LINE単体パッケージで利用予定の機能であり、GARAGE LINK専用機能ではありません。
          車両・商談・帳票などのGARAGE LINK専用導線は表示しません。
        </p>
      </section>
    </LinePackageShell>
  );
}
