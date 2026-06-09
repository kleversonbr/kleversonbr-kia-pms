/**
 * Deterministic color picker for Squads to ensure each squad name
 * has a distinct and consistent beautiful color palette.
 */
export function getSquadColorClasses(squadName: string): string {
  if (!squadName) {
    return "bg-slate-50 border-slate-100 text-slate-700";
  }

  const colors = [
    "bg-indigo-50 border-indigo-100 text-indigo-700",
    "bg-emerald-50 border-emerald-100 text-emerald-700",
    "bg-amber-50 border-amber-100 text-amber-700",
    "bg-rose-50 border-rose-100 text-rose-700",
    "bg-violet-50 border-violet-100 text-violet-700",
    "bg-cyan-50 border-cyan-100 text-cyan-700",
    "bg-teal-50 border-teal-100 text-teal-700",
    "bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700",
    "bg-sky-50 border-sky-100 text-sky-700",
    "bg-orange-50 border-orange-100 text-orange-700",
    "bg-pink-50 border-pink-100 text-pink-700"
  ];

  // Simple deterministic string hashing algorithm
  const trimmed = squadName.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = trimmed.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
