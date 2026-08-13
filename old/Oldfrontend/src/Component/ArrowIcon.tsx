export const ArrowIcon = ({ dir = "right", className = "" }: { dir?: "left" | "right"; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={`w-5 h-5 ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {dir === "right" ? (
      <>
        <path d="M5 12h14" />
        <path d="M13 5l7 7-7 7" />
      </>
    ) : (
      <>
        <path d="M19 12H5" />
        <path d="M11 19l-7-7 7-7" />
      </>
    )}
  </svg>
);