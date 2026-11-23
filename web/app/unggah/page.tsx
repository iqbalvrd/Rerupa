import type { Metadata } from "next";
import { RequireLogin } from "@/components/auth/require-login";
import { UploadView } from "@/components/upload/upload-view";

export const metadata: Metadata = {
  title: "Foto lukisanmu",
  description: "Foto atau unggah karya lukis, pilih bagian yang mau dilatih, lalu ikuti tahapannya.",
};

export default function UploadPage() {
  return (
    <RequireLogin>
      <UploadView />
    </RequireLogin>
  );
}
