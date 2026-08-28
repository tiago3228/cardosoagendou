import * as React from "react";

import { Input } from "@/components/ui/input";
import { maskBrPhone, brPhoneDigits } from "@/lib/format";

type WhatsappInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  /** Current value (accepts raw digits, E.164 or already masked text). */
  value: string;
  /** Receives the masked value, e.g. "(31) 99999-9999". */
  onChange: (value: string) => void;
};

/**
 * WhatsApp field with Brazilian mask "(31) 99999-9999".
 * The +55 country code is implicit and never typed by the user.
 */
export function WhatsappInput({ value, onChange, ...props }: WhatsappInputProps) {
  const display = maskBrPhone(value);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        +55
      </span>
      <Input
        {...props}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={16}
        className={`pl-12 ${props.className ?? ""}`}
        placeholder={props.placeholder ?? "(31) 99999-9999"}
        value={display}
        onChange={(e) => onChange(maskBrPhone(brPhoneDigits(e.target.value)))}
      />
    </div>
  );
}
