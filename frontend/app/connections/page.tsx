import { Suspense } from "react";
import { AppFrame } from "@/components/AppFrame";
import { AppLoading } from "@/components/AppLoading";
import { ConnectionsRoute } from "@/components/routes/AppPages";

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppFrame>
        <ConnectionsRoute />
      </AppFrame>
    </Suspense>
  );
}
