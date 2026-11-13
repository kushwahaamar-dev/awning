import { Suspense } from "react";
import { Covers } from "@/components/Covers";
import { Desk } from "@/components/Desk";

export default function Cover() {
  return (
    <>
      <Suspense>
        <Desk />
      </Suspense>
      <Covers />
    </>
  );
}
