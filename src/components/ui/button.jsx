import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "stackd-btn-primary text-white hover:brightness-110",
        destructive:
          "bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25 backdrop-blur-sm",
        outline:
          "border border-white/12 bg-white/[0.04] text-white/85 hover:bg-white/[0.08] backdrop-blur-sm",
        secondary:
          "bg-white/[0.06] text-white/85 border border-white/10 hover:bg-white/[0.10] backdrop-blur-sm",
        ghost: "text-white/70 hover:text-white hover:bg-white/[0.06]",
        link: "text-teal-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }