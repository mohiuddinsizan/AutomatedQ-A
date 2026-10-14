import { requirePortal } from "@/lib/dal";
import { staffLinksFor } from "@/lib/links";
import { PageTitle } from "@/components/PortalHeader";
import { EmptyState } from "@/components/ui";
import { LinkCards } from "@/components/LinkCards";

export const metadata = { title: "Tools & links" };

export default async function TeacherLinks() {
  const user = await requirePortal("teacher");
  const links = await staffLinksFor(user.role);
  return (
    <>
      <PageTitle sub="Shortcuts to the office's other software.">Tools &amp; links</PageTitle>
      {links.length === 0 ? <EmptyState title="No links shared yet" /> : <LinkCards links={links} />}
    </>
  );
}
