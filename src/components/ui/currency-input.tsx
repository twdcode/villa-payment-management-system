"use client";

import { forwardRef, useId, type ChangeEvent } from "react";

import { numberToWordsLkr } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/** Digits, and a single decimal point with up to two digits after it — nothing else survives. */
function sanitizeDigits(raw: string): string {
  const withoutSeparators = raw.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = withoutSeparators.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

function groupThousands(digits: string): string {
  const [whole, decimal] = digits.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal !== undefined ? `${grouped}.${decimal}` : grouped;
}

type CurrencyInputProps = {
  className?: string;
  id?: string;
  /** Plain numeric string, e.g. "2000000" — no commas. What the form actually stores. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Hides the "X rupees" helper line — used where the amount is very small or not yet meaningful. */
  hideWords?: boolean;
};

/**
 * Amount entry field that groups digits with commas as the user types and spells the
 * value out underneath ("two million two thousand rupees"), so a run of zeros can be
 * sanity-checked without recounting them. Kept as `type="text"` throughout: a native
 * `type="number"` input strips any formatting character the browser doesn't recognise,
 * which is what made comma grouping impossible in the fields this replaces.
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, id, value, onChange, placeholder, required, disabled, hideWords }, ref) => {
    const generatedId = useId();
    const helperId = `${id ?? generatedId}-words`;
    const numericValue = Number(value);
    const showWords = !hideWords && value !== "" && Number.isFinite(numericValue) && numericValue > 0;

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      onChange(sanitizeDigits(event.target.value));
    }

    return (
      <div>
        <input
          aria-describedby={showWords ? helperId : undefined}
          className={cn(
            "flex h-12 w-full rounded-md border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          disabled={disabled}
          id={id}
          inputMode="decimal"
          onChange={handleChange}
          placeholder={placeholder}
          ref={ref}
          required={required}
          type="text"
          value={groupThousands(value)}
        />
        {showWords && <p className="mt-1.5 text-xs capitalize text-muted-foreground" id={helperId}>{numberToWordsLkr(numericValue)}</p>}
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
