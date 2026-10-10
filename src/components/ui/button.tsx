import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * Buttons — see docs/design-system.md "Actions".
 * On touch screens (pointer: coarse) every size grows to at least 44px.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover",
        dark: "bg-foreground text-background shadow-card hover:bg-foreground/90",
        outline:
          "border-border-strong bg-card text-foreground shadow-card hover:border-foreground/30 hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)]",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-danger-bg text-danger-fg hover:bg-[color-mix(in_oklab,var(--danger-bg),var(--danger-fg)_8%)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-sm",
        xs: "h-7 gap-1 rounded-md px-2 text-xs",
        sm: "h-9 gap-1.5 rounded-md px-3 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-14 rounded-xl px-6 text-lg",
        icon: "size-10 pointer-coarse:min-w-11",
        "icon-sm": "size-9 rounded-md pointer-coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
