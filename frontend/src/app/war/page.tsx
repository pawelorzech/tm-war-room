"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WarRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/team"); }, [router]);
  return null;
}
