import { useState, type ComponentProps, type FormEvent } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

import type { YtdlpzSettings } from "../lib/ytdlpz.ts";
import type { Outcome } from "./use-ytdlpz-settings.ts";

interface YtdlpzFormProps {
  settings: YtdlpzSettings;
  busy: boolean;
  outcome: Outcome;
  onEnable: (address: string, token: string) => void;
  onDisable: () => void;
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  input: Omit<ComponentProps<"input">, "id" | "value" | "onChange">;
}

function Field({ id, label, value, onChange, input }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...input}
      />
    </div>
  );
}

/** Address and token, with Turn on (checks them first) and Turn off. */
export function YtdlpzForm({ settings, busy, outcome, onEnable, onDisable }: YtdlpzFormProps) {
  const [address, setAddress] = useState(settings.address);
  const [token, setToken] = useState(settings.token);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onEnable(address, token);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <Field
        id="ytdlpz-address"
        label="Server address"
        value={address}
        onChange={setAddress}
        input={{ inputMode: "url", placeholder: "https://yt-dlp-z.example.com" }}
      />
      <Field
        id="ytdlpz-token"
        label="API token"
        value={token}
        onChange={setToken}
        input={{ type: "password", autoComplete: "off" }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {settings.enabled ? "Save and test" : "Turn on"}
        </Button>
        {settings.enabled && (
          <Button type="button" variant="outline" disabled={busy} onClick={onDisable}>
            Turn off
          </Button>
        )}
        <output
          aria-live="polite"
          className={outcome?.tone === "error" ? "text-sm text-destructive" : "text-sm"}
        >
          {busy ? "Testing the connection…" : outcome?.text}
        </output>
      </div>
    </form>
  );
}
