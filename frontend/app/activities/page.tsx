import { Suspense } from "react";
import { AppFrame } from "@/components/AppFrame";
import { AppLoading } from "@/components/AppLoading";
import { ActivitiesRoute } from "@/components/routes/AppPages";

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppFrame>
        <ActivitiesRoute />
      </AppFrame>
    </Suspense>
  );
}
