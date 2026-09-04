import markImg from "../assets/verity-mark.png";

/* ─── Verity logo mark ───
   Single source of truth for the brand icon, used in the sidebar,
   landing nav/footer, login page, and the Ask Verity chat badges. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <img
      src={markImg}
      alt="Verity"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "block", flexShrink: 0 }}
    />
  );
}
