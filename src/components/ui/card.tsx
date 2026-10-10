import * as React from "react"
import { cn } from "@/lib/utils"

/* Surface container. Use for one self-contained thing (a bottle, a store). */
function Card({
  className,
  as: Comp = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "article" | "section" }) {
  return (
    <Comp
      data-slot="card"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 p-4 sm:p-5", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4 pb-4 sm:px-5 sm:pb-5", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center border-t bg-muted/60 px-4 py-3 sm:px-5", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardContent, CardFooter }
