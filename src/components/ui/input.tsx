import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

/** Shared field chrome for inputs and native selects. 16px text avoids iOS zoom-on-focus. */
export const fieldClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-card transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <InputPrimitive type={type} data-slot="input" className={cn(fieldClass, className)} {...props} />
}

export { Input }
