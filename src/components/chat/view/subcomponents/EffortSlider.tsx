import type { EffortOption } from '../../constants/composerControls';

type EffortSliderProps = {
  /** The levels this model offers, in order. Length varies by model. */
  scale: EffortOption[];
  value: string;
  onChange: (next: string) => void;
};

/**
 * The effort picker, as a slider.
 *
 * It replaced a list of five radio rows, which spent half the settings panel
 * on a choice that is inherently ordinal — the levels have an order, and a
 * slider says so where five separate rows do not.
 *
 * A real `input[type=range]` sits on top of the drawn track rather than the
 * dots being clickable themselves: that keeps drag, tap-to-jump, arrow keys
 * and screen-reader semantics without reimplementing any of them. The track
 * below is purely decorative and marked `pointer-events-none` so it never
 * intercepts the touch.
 */
export default function EffortSlider({ scale, value, onChange }: EffortSliderProps) {
  if (scale.length === 0) return null;

  const index = Math.max(0, scale.findIndex((option) => option.value === value));
  const current = scale[index];
  const lastIndex = scale.length - 1;
  const filledRatio = lastIndex === 0 ? 0 : index / lastIndex;

  return (
    <div className="px-3 pb-2 pt-1">
      <div className="relative h-6">
        {/* Decorative track: a filled bar up to the current level, plus one dot
            per level so the number of steps is visible before dragging. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
          <div className="relative h-1 rounded-full bg-muted-foreground/25">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
              style={{ width: `${filledRatio * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-between">
              {scale.map((option, i) => (
                <span
                  key={option.value}
                  className={
                    i === index
                      ? 'h-3.5 w-3.5 rounded-full border-2 border-background bg-primary shadow'
                      : `h-1.5 w-1.5 rounded-full ${i < index ? 'bg-primary-foreground/70' : 'bg-muted-foreground/50'}`
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={index}
          onChange={(event) => {
            const next = scale[Number(event.target.value)];
            if (next) onChange(next.value);
          }}
          aria-label="Effort"
          aria-valuetext={current?.label}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{current?.hint}</div>
    </div>
  );
}
