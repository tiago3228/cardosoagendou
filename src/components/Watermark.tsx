/** Subtle author watermark shown on every screen. */
export function Watermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-2 left-3 z-50 select-none text-[10px] font-medium tracking-wide text-muted-foreground/50"
    >
      By: Tiago Cardoso
    </div>
  );
}
