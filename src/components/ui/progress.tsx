import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  gradient?: boolean;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, gradient, ...props }, ref) => {
  // Gradient color based on percentage: red → yellow → green
  const getGradientColor = (percentage: number) => {
    if (percentage < 33) {
      // Red to orange
      return 'bg-gradient-to-r from-red-500 to-orange-500';
    } else if (percentage < 66) {
      // Orange to yellow
      return 'bg-gradient-to-r from-orange-500 to-yellow-500';
    } else if (percentage < 100) {
      // Yellow to green
      return 'bg-gradient-to-r from-yellow-500 to-green-500';
    } else {
      // Full green with glow
      return 'bg-gradient-to-r from-green-500 to-emerald-400';
    }
  };

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 transition-all duration-500",
          gradient ? getGradientColor(value || 0) : "bg-primary"
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };