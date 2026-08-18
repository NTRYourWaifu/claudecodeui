import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

type Mark = {
  /** Position along the rail, 0–1. */
  ratio: number;
  /** The message element this mark jumps to. */
  element: HTMLElement;
  /** 1-based index, shown on hover. */
  ordinal: number;
  preview: string;
};

type ConversationScrollMarksProps = {
  scrollContainerRef: RefObject<HTMLDivElement>;
  /** Changes whenever the rendered message list changes, to trigger a re-measure. */
  messageSignature: string | number;
};

const MARK_HEIGHT = 14;
const MARK_GAP = 3;

/**
 * A rail of tick marks down the right edge, one per question asked, for
 * jumping back to an earlier turn.
 *
 * Deliberately overlaid rather than laid out in the flow: it must not narrow
 * the text column. It stays faint until hovered so it does not compete with
 * the conversation.
 *
 * Marks are bars rather than dots because dots are hard to hit on a phone.
 */
export default function ConversationScrollMarks({
  scrollContainerRef,
  messageSignature,
}: ConversationScrollMarksProps) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hovered, setHovered] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollable = container.scrollHeight - container.clientHeight;
    const questions = Array.from(
      container.querySelectorAll<HTMLElement>('.chat-message.user'),
    );

    if (questions.length < 2 || scrollable <= 0) {
      setMarks([]);
      return;
    }

    const next = questions.map((element, index) => ({
      // Ratio of the scroll position that brings this message to the top,
      // so a mark's height on the rail matches where it lands when clicked.
      ratio: Math.min(1, Math.max(0, element.offsetTop / scrollable)),
      element,
      ordinal: index + 1,
      preview: (element.textContent || '').trim().slice(0, 40),
    }));

    // Bail out when nothing moved. The rail lives inside the element being
    // observed, so re-rendering it would trip the observer again — without
    // this guard the two would feed each other indefinitely.
    setMarks((previous) => {
      const unchanged =
        previous.length === next.length &&
        previous.every((mark, index) =>
          mark.element === next[index].element && Math.abs(mark.ratio - next[index].ratio) < 0.002);
      return unchanged ? previous : next;
    });
  }, [scrollContainerRef]);

  // Re-measure when the message list changes, and once more after layout
  // settles (markdown and images finish rendering a frame or two later).
  useEffect(() => {
    measure();
    const raf = window.requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 250);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [measure, messageSignature]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const onScroll = () => {
      const scrollTop = container.scrollTop;
      let current = -1;
      for (let i = 0; i < marks.length; i += 1) {
        // +2px tolerance so the mark you just jumped to counts as reached.
        if (marks[i].element.offsetTop <= scrollTop + 2) current = i;
      }
      setActiveIndex(current);
    };

    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });

    // ResizeObserver on the container only fires when the container itself is
    // resized, which misses the case that actually moves the marks: content
    // growing inside it. Markdown, code blocks and images all settle after
    // their message has mounted, and streaming replies grow continuously —
    // in every one of those the message count is unchanged while every
    // position below shifts. Watching the subtree catches all of it.
    let debounce = 0;
    const scheduleMeasure = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(measure, 120);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(container);

    const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(scheduleMeasure) : null;
    mutationObserver?.observe(container, { childList: true, subtree: true });

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.clearTimeout(debounce);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [marks, measure, scrollContainerRef]);

  if (marks.length < 2) return null;

  const railHeight = railRef.current?.clientHeight ?? 0;
  // When there are more questions than the rail can show without overlapping,
  // thin them out evenly rather than letting them merge into a solid line.
  const capacity = railHeight > 0 ? Math.floor(railHeight / (MARK_HEIGHT + MARK_GAP)) : marks.length;
  const step = capacity > 0 && marks.length > capacity ? Math.ceil(marks.length / capacity) : 1;
  const visibleMarks = step > 1 ? marks.filter((_, index) => index % step === 0) : marks;

  return (
    <div
      ref={railRef}
      className="pointer-events-none absolute bottom-2 right-0.5 top-2 z-10 flex w-4 flex-col items-center justify-start"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-hidden={false}
    >
      {visibleMarks.map((mark) => {
        const isActive = marks[activeIndex] === mark;
        return (
          <button
            key={mark.ordinal}
            type="button"
            title={`#${mark.ordinal} ${mark.preview}`}
            aria-label={`Jump to question ${mark.ordinal}`}
            onClick={() => {
              const container = scrollContainerRef.current;
              // Jump instantly rather than smoothly: a smooth scroll runs for
              // hundreds of milliseconds, during which a pagination fetch can
              // land and its scroll restore can override the jump mid-flight.
              if (container) container.scrollTo({ top: mark.element.offsetTop, behavior: 'auto' });
            }}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            style={{
              position: 'absolute',
              top: `calc(${mark.ratio * 100}% - ${MARK_HEIGHT / 2}px)`,
              height: MARK_HEIGHT,
            }}
            className={`pointer-events-auto flex w-4 items-center justify-center transition-opacity duration-150 ${
              hovered || isActive ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <span
              className={`block rounded-full transition-all duration-150 ${
                isActive ? 'h-3 w-[3px] bg-primary' : 'h-2.5 w-[2px] bg-muted-foreground hover:bg-primary'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
