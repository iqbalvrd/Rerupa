import Link from "next/link";

export default function UpcomingCollection() {
  return <main className="min-h-dvh bg-[#eee8dc] px-6 py-8 text-[#302b24]">
    <Link href="/galeri" className="inline-flex min-h-11 items-center rounded-full border border-[#b9ab91] px-5">← Kembali ke galeri</Link>
    <div className="mx-auto mt-12 max-w-2xl text-center">
      <h1 className="font-serif text-2xl">Koleksi segera hadir</h1>
      <p className="mt-3 text-sm text-[#6d6354]">Lukisan untuk showcase ini sedang disiapkan.</p>
      <div aria-label="Kanvas kosong" className="mt-8 aspect-[4/3] border border-[#d9cdb8] bg-[#fffdf7] shadow-sm" />
    </div>
  </main>;
}
