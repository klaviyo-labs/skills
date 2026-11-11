"use client";

import { useEffect } from "react";

import { identifyKlaviyoProfile } from "@/lib/klaviyo/client";

export function KlaviyoIdentify({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  useEffect(() => {
    identifyKlaviyoProfile({
      email,
      first_name: firstName ?? undefined,
      last_name: lastName ?? undefined,
    });
  }, [email, firstName, lastName]);
  return null;
}
