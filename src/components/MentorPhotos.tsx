/** Thumbnails of the photos attached to a mentor request; each opens full size. */
export function MentorPhotos({ ids, size = "md" }: { ids: number[]; size?: "sm" | "md" }) {
  if (!ids.length) return null;
  const box = size === "sm" ? "size-16" : "size-24 sm:size-28";
  return (
    <ul className="flex flex-wrap gap-2">
      {ids.map((id, i) => (
        <li key={id}>
          <a href={`/api/mentor-files/${id}`} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/mentor-files/${id}`} alt={`Problem photo ${i + 1}`} loading="lazy"
              className={`${box} rounded-lg border border-rule bg-paper object-cover transition hover:opacity-90`} />
          </a>
        </li>
      ))}
    </ul>
  );
}
