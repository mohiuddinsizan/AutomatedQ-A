import { Card } from "./ui";
import { Icon } from "./icons";

type Link = { id: number; title: string; url: string; description: string | null; audience: string };

const CHIPS = ["chip-navy", "chip-orange", "chip-red", "chip-green"];
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

/** Big tappable cards that open each tool in a new tab. */
export function LinkCards({ links, showAudience = false }: { links: Link[]; showAudience?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {links.map((l, i) => (
        <a key={l.id} href={l.url} target="_blank" rel="noreferrer noopener" className="group block">
          <Card className="card-hover flex h-full items-start gap-4 p-5">
            <span className={`${CHIPS[i % CHIPS.length]} grid size-12 shrink-0 place-items-center rounded-2xl`}><Icon name="link" className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-lg font-bold text-ink group-hover:text-pen">
                {l.title} <Icon name="external" className="size-4 text-ink-faint" />
              </span>
              {l.description && <span className="mt-1 block text-sm text-ink-soft">{l.description}</span>}
              <span className="mt-2 block truncate text-xs font-medium text-brand-indigo">{host(l.url)}</span>
              {showAudience && (
                <span className="mt-2 inline-block rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink-soft">
                  {l.audience === "admins" ? "Admins only" : "Admins and teachers"}
                </span>
              )}
            </span>
          </Card>
        </a>
      ))}
    </div>
  );
}
