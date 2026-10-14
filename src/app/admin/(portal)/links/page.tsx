import { requirePortal } from "@/lib/dal";
import { staffLinksFor } from "@/lib/links";
import { saveLink, deleteLink } from "@/app/actions/admin";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { LinkCards } from "@/components/LinkCards";
import { Button, Card, EmptyState, Field, SectionTitle, Select, TextArea } from "@/components/ui";

export const metadata = { title: "Tools & links" };

function LinkFields({ link }: { link?: { id: number; title: string; url: string; description: string | null; audience: string; position: number } }) {
  return (
    <>
      {link && <input type="hidden" name="id" value={link.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="title" required defaultValue={link?.title} placeholder="e.g. OMR Software" />
        <Field label="Address" name="url" type="url" required defaultValue={link?.url} placeholder="https://…" />
      </div>
      <TextArea label="What it's for (optional)" name="description" rows={2} defaultValue={link?.description ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Who can see it" name="audience" defaultValue={link?.audience ?? "staff"}>
          <option value="staff">Admins and teachers</option>
          <option value="admins">Admins only</option>
        </Select>
        <Field label="Order" name="position" type="number" min={0} max={999} defaultValue={link?.position ?? 0} hint="Lower numbers come first." />
      </div>
    </>
  );
}

export default async function AdminLinks() {
  await requirePortal("admin");
  const links = await staffLinksFor("admin");

  return (
    <>
      <PageTitle sub="Shortcuts to the office's other software. Students never see this page.">Tools &amp; links</PageTitle>
      {links.length === 0 ? <EmptyState title="No links yet">Add the first one below.</EmptyState> : <LinkCards links={links} showAudience />}

      {links.length > 0 && (
        <>
          <SectionTitle>Edit links</SectionTitle>
          <Card className="divide-y divide-rule overflow-hidden">
            {links.map((l) => (
              <details key={l.id} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-paper [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{l.title}</span>
                    <span className="block truncate text-sm text-ink-faint">{l.url}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-pen">Edit</span>
                </summary>
                <div className="border-t border-rule bg-paper/50 p-4">
                  <ActionForm action={saveLink} submit="Save changes"><LinkFields link={l} /></ActionForm>
                  <form action={deleteLink} className="mt-3">
                    <input type="hidden" name="id" value={l.id} />
                    <Button type="submit" variant="danger" size="sm">Delete link</Button>
                  </form>
                </div>
              </details>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Add a link</SectionTitle>
      <Card className="p-5">
        <ActionForm action={saveLink} submit="Add link" resetOnOk><LinkFields /></ActionForm>
      </Card>
    </>
  );
}
