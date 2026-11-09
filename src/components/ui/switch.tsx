import * as React from "react"

import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "type"> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/**
 * An on/off pill (track + knob). It is the control only: name it with `aria-label`, or wrap it in a `<label>`
 * with the text beside it. A real button with `role="switch"`, so it works with the keyboard and screen readers.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none",
          checked && "translate-x-4"
        )}
      />
    </button>
  )
)
Switch.displayName = "Switch"

export { Switch }
