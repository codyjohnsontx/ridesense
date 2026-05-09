import { Suspense } from "react";
import { AppFrame } from "@/components/AppFrame";
import { AppLoading } from "@/components/AppLoading";
import { TrainingRoute } from "@/components/routes/AppPages";

export default function TrainingPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppFrame>
        <TrainingRoute />
      </AppFrame>
    </Suspense>
  );
}
