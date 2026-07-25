/** Ambient drifting gradient blobs, fixed behind all content. */
export function BackgroundBlobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full opacity-[0.18] blur-3xl"
        style={{ background: "var(--color-accent)", animation: "blobDrift1 22s ease-in-out infinite" }}
      />
      <div
        className="absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full opacity-[0.12] blur-3xl"
        style={{ background: "var(--color-accent-2)", animation: "blobDrift2 26s ease-in-out infinite" }}
      />
    </div>
  );
}
