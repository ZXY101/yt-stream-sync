import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

const MAX_NAME = 80;

interface RenameFormProps {
  name: string;
  onRename: (name: string) => void;
  onDone: () => void;
}

function FormButtons({ canSave, onCancel }: { canSave: boolean; onCancel: () => void }) {
  return (
    <>
      <Button
        type="submit"
        variant="ghost"
        size="icon-xs"
        aria-label="Save name"
        disabled={!canSave}
      >
        <Check />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Cancel rename"
        onClick={onCancel}
      >
        <X />
      </Button>
    </>
  );
}

/** Edits a saved group's name in place: Enter saves, Escape cancels. */
export function RenameForm({ name, onRename, onDone }: RenameFormProps) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  // The user just asked to rename, so typing should go straight into the field.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  function save() {
    if (trimmed !== "" && trimmed !== name) {
      onRename(trimmed);
    }
    onDone();
  }
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Input
        ref={input}
        aria-label="Group name"
        value={value}
        maxLength={MAX_NAME}
        className="h-7"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onDone();
          }
        }}
      />
      <FormButtons canSave={trimmed !== ""} onCancel={onDone} />
    </form>
  );
}
