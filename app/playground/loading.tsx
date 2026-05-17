export default function PlaygroundLoading() {
  return (
    <main
      style={{
        alignItems: "center",
        background: "#0f172a",
        color: "#e5e7eb",
        display: "flex",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        height: "100vh",
        justifyContent: "center",
        width: "100vw",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 14 }}>
        <img
          src="./layang-logo.png"
          alt="Layang"
          draggable={false}
          style={{
            borderRadius: 16,
            height: 54,
            objectFit: "cover",
            width: 54,
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0 }}>Loading Layang</div>
        <div
          aria-hidden="true"
          style={{
            background: "rgba(148, 163, 184, 0.24)",
            borderRadius: 999,
            height: 3,
            overflow: "hidden",
            width: 160,
          }}
        >
          <div
            style={{
              animation: "layang-loading 1.1s ease-in-out infinite",
              background: "#22c55e",
              borderRadius: 999,
              height: "100%",
              width: "42%",
            }}
          />
        </div>
        <style>{`
          @keyframes layang-loading {
            0% { transform: translateX(-105%); }
            100% { transform: translateX(245%); }
          }
        `}</style>
      </div>
    </main>
  );
}
