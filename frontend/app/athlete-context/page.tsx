import { Suspense } from "react";
import { AppFrame } from "@/components/AppFrame";
import { AppLoading } from "@/components/AppLoading";
import { AthleteContextRoute } from "@/components/routes/AppPages";

export default function AthleteContextPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppFrame>
        <AthleteContextRoute />
      </AppFrame>
    </Suspense>
  );
}
