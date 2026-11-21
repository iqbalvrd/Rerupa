import { ApiStatus } from "@/components/dev/api-status";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

// Placeholder home. The real Beranda (collection scope, artwork picks, free
// mode entry) is built in the gallery step; the 3D landing comes later.
export default function Home() {
  return (
    <AppShell>
      <section className="flex flex-col gap-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">Mentor melukis seni Nusantara</p>
        <h1 className="font-display text-4xl leading-tight">Rerupa</h1>
        <p className="max-w-[60ch] text-muted-foreground">
          Pilih karya dari galeri atau foto lukisanmu sendiri, lalu ikuti tahap demi tahap dari sketsa sampai detail.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button size="lg" disabled>
            Pilih karya
          </Button>
          <Button size="lg" variant="outline" disabled>
            Foto lukisanmu
          </Button>
        </div>
      </section>
      {process.env.NODE_ENV === "development" && <ApiStatus />}
    </AppShell>
  );
}
