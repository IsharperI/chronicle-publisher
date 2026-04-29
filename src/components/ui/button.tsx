import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "gel-button",
        destructive:
          "text-white border border-[hsl(0_70%_38%)] rounded-full " +
          "[background:linear-gradient(180deg,hsl(0_95%_70%)_0%,hsl(0_85%_55%)_50%,hsl(0_85%_45%)_100%)] " +
          "shadow-[0_4px_10px_-2px_hsl(0_70%_45%/0.45),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.15)] " +
          "hover:-translate-y-px hover:brightness-110",
        outline: "gel-button-ghost",
        secondary:
          "gel-button-lime",
        ghost:
          "rounded-full hover:bg-white/60 hover:backdrop-blur-md text-foreground transition-colors",
        link: "text-primary underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
