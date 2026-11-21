import { redirect } from "next/navigation";

// The 3D museum landing (LANDING_SPEC.md) will live here. Until it exists,
// the entrance goes straight into the gallery room.
export default function Home() {
  redirect("/galeri");
}
