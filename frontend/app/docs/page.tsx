import { Suspense } from "react";
import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import { AppLoading } from "@/components/AppLoading";
import { DocsRoute } from "@/components/routes/AppPages";

export const metadata: Metadata = {
  title: "Docs — RideSense",
  description: "RideSense setup, data source, training read, and Ask documentation."
};

export default function DocsPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppFrame>
        <DocsRoute />
      </AppFrame>
    </Suspense>
  );
}
