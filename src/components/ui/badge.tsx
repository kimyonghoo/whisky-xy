import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * Badges are non-interactive labels. Status meaning always comes from
 * text + icon, never from color alone (see docs/design-system.md).
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border whitespace-nowrap font-semibold [&>svg]:pointer-events-none [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border-strong bg-card text-foreground",
        spec: "border-border bg-card text-foreground/85 font-medium",
        instock: "border-instock-line bg-instock-bg text-instock-fg",
        soldout: "border-soldout-line bg-soldout-bg text-soldout-fg",
        caution: "border-caution-line bg-caution-bg text-caution-fg",
        stale: "border-stale-line bg-stale-bg text-stale-fg",
        danger: "border-danger-line bg-danger-bg text-danger-fg",
        info: "border-info-line bg-info-bg text-info-fg",
        solid: "border-transparent bg-instock text-white",
      },
      size: {
        sm: "h-6 px-2 text-xs [&>svg]:size-3.5",
        md: "h-7 px-2.5 text-[0.8125rem] [&>svg]:size-4",
        lg: "h-9 px-3.5 text-base [&>svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "sm",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
