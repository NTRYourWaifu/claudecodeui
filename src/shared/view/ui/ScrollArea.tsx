import * as React from 'react';

import { cn } from '../../../lib/utils';

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Hides the native scrollbar while keeping the area fully scrollable.
   * Opt-in per call site: chat and the code editor rely on a visible scrollbar
   * to convey position, so this must never become the global default.
   */
  hideScrollbar?: boolean;
};

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, hideScrollbar = false, ...props }, ref) => (
    <div className={cn(className, 'relative overflow-hidden')} {...props}>
      {/* Inner container keeps border radius while allowing momentum scrolling on touch devices. */}
      <div
        ref={ref}
        className={cn('h-full w-full overflow-auto rounded-[inherit]', hideScrollbar && 'scrollbar-hide')}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
