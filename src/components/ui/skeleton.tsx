import * as React from "react"
import { cn } from "@/lib/utils"

/** Placeholder block. Pulses only when the user allows motion. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden data-slot="skeleton" className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} {...props} />
}

export { Skeleton }
