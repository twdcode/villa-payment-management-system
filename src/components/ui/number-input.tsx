"use client";

import { forwardRef, type ChangeEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * Whole-number field for counts like grace days and the pro-rata divisor.
 *
 * Fixes a real editing bug in the `type="number"` + `Number(event.target.value)` pattern
 * this replaces: `Number("")` is `0`, so clearing the box immediately wrote 0 back into
 * state and re-rendered a literal "0" the user could not delete. Typing then appended to
 * it — clear 15, type 13, and the field showed "013".
 *
 * The cure is to hold the *string* the user typed. An empty box stays empty, and the
 * parent converts to a number only when saving, so no stale zero is ever displayed.
 * Kept as `type="text"` with a numeric `inputMode`: `type="number"` also renders the
 * spinner arrows, which the design does not use and which let a stray scroll change a
 * saved value.
 */
type NumberInputProps = {
  className?: string;
  id?: string;
  /** The raw string as typed. `""` means the box is empty, which is distinct from "0". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, id, value, onChange, placeholder, disabled, required, ...props }, ref) => {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      // Digits only; a leading zero the user did not type is never introduced here.
      onChange(event.target.value.replace(/[^0-9]/g, ""));
    }

    return (
      <input
        className={cn(
          "flex h-12 w-full rounded-md border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        onChange={handleChange}
        placeholder={placeholder}
        ref={ref}
        required={required}
        type="text"
        value={value}
        {...props}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

/** Reads a `NumberInput` string back as a number, treating an empty box as `fallback`. */
export function numberInputValue(value: string, fallback = 0): number {
  return value === "" ? fallback : Number(value);
}
