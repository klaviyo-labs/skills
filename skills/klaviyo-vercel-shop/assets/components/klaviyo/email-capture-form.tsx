"use client";

import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeKlaviyoBackInStock, subscribeKlaviyoProfile } from "@/lib/klaviyo/client";

type CaptureStatus = "error" | "idle" | "pending" | "success";

interface EmailCaptureLabels {
  button: string;
  error: string;
  placeholder: string;
  success: string;
}

interface EmailCaptureFormProps {
  labels: EmailCaptureLabels;
  onSubmitEmail: (email: string) => Promise<boolean>;
}

function EmailCaptureForm({ labels, onSubmitEmail }: EmailCaptureFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<CaptureStatus>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("pending");
    setStatus((await onSubmitEmail(email.trim())) ? "success" : "error");
  }

  if (status === "success") {
    return (
      <p role="status" className="text-sm">
        {labels.success}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2">
      <div className="flex gap-2">
        <Input
          aria-label={labels.placeholder}
          autoComplete="email"
          className="h-10 flex-1"
          onChange={(event) => setEmail(event.target.value)}
          placeholder={labels.placeholder}
          required
          type="email"
          value={email}
        />
        <Button type="submit" size="lg" disabled={status === "pending"}>
          {labels.button}
        </Button>
      </div>
      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {labels.error}
        </p>
      )}
    </form>
  );
}

export function KlaviyoSignupForm({
  labels,
  listId,
  source,
}: {
  labels: EmailCaptureLabels;
  listId: string;
  source: string;
}) {
  return (
    <EmailCaptureForm
      labels={labels}
      onSubmitEmail={(email) => subscribeKlaviyoProfile({ email, listId, source })}
    />
  );
}

export function KlaviyoBackInStockForm({
  labels,
  variantId,
}: {
  labels: EmailCaptureLabels;
  variantId: string;
}) {
  return (
    <EmailCaptureForm
      labels={labels}
      onSubmitEmail={(email) => subscribeKlaviyoBackInStock({ email, variantId })}
    />
  );
}
