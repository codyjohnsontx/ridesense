import { Suspense } from "react";
import { AppFrame } from "@/components/AppFrame";
import { AppLoading } from "@/components/AppLoading";
import { AskRoute } from "@/components/routes/AppPages";

export default function AskPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppFrame>
        <AskRoute />
      </AppFrame>
    </Suspense>
  );
}
