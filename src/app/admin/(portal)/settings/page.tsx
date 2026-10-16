import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePortal } from "@/lib/dal";
import { getSetting } from "@/lib/settings";
import { saveSettings, createSubject, setAiProvider } from "@/app/actions/admin";
import { aiStatus, PROVIDER_LABEL, type Provider } from "@/lib/ai";
import { MODEL_CHOICES } from "@/lib/ai-models";
import { PageTitle } from "@/components/PortalHeader";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, Select, SectionTitle, TextArea } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePortal("admin");
  const [consumeOn, maxFollowups, mentorTemplate, subjects] = await Promise.all([
    getSetting("qa.consume_on"), getSetting("qa.max_followups"), getSetting("mentor.reply_template"),
    db.select().from(schema.subjects).orderBy(asc(schema.subjects.name)),
  ]);
  const ai = await aiStatus();

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <Card className="p-5">
        <h2 className="mb-4 text-xl text-ink">Questions and mentor sessions</h2>
        <ActionForm action={saveSettings} submit="Save settings">
          <Select label="When does a question use up the allowance?" name="consumeOn" defaultValue={consumeOn}
            hint="Off-topic messages are always rejected for free.">
            <option value="submit">When the student asks (every answered question counts)</option>
            <option value="escalate">Only when it&apos;s sent to a teacher (AI answers are free)</option>
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Follow-ups per question" name="maxFollowups" type="number" min={0} max={20} defaultValue={maxFollowups}
              hint="How many times a student can reply to a teacher." />
          </div>
          <p className="rounded-xl bg-pen-soft px-4 py-3 text-sm text-ink-soft">
            Every student starts with <strong className="text-ink">20 Q&amp;A</strong> per course. Nothing tops it up automatically —
            change a student&apos;s Q&amp;A or mentor sessions from <strong className="text-ink">Students</strong> → their profile.
          </p>
          <TextArea label="Default message to students when a mentor session is scheduled" name="mentorTemplate" rows={3} defaultValue={mentorTemplate} />
        </ActionForm>
      </Card>

      <SectionTitle>AI that answers questions</SectionTitle>
      <Card className="p-5">
        <ActionForm action={setAiProvider} submit="Save AI settings" pending="Testing the model…">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["gemini", "openai"] as Provider[]).map((p) => (
              <div key={p} className="flex flex-col gap-3 rounded-xl border border-rule p-4 transition-colors has-[input[type=radio]:checked]:border-brand-indigo/50 has-[input[type=radio]:checked]:bg-pen-soft">
                <label className="flex cursor-pointer gap-3">
                  <input type="radio" name="provider" value={p} defaultChecked={ai.selected === p} className="mt-1 size-4 accent-[var(--color-pen)]" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {PROVIDER_LABEL[p]}
                      {ai.configured[p] ? <Badge tone="green">Key added</Badge> : <Badge tone="amber">No key yet</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">Answers new questions when selected.</span>
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                  Model
                  <select name={p === "openai" ? "openaiModel" : "geminiModel"} defaultValue={ai.models[p][0]}
                    className="h-11 rounded-xl border border-rule bg-sheet px-3 text-base font-normal text-ink focus:border-brand-indigo focus:outline-none focus:ring-4 focus:ring-brand-indigo/15">
                    {MODEL_CHOICES[p].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <span className="text-xs text-ink-faint">
                  {p === "gemini" ? <>When busy, falls back to <code>{ai.models.gemini[1]}</code>.</>
                    : <>Voice notes are transcribed with <code>{ai.models.openai[1]}</code>.</>}
                </span>
                {!ai.configured[p] && (
                  <span className="text-sm text-warn">
                    Add <code>{p === "gemini" ? "AI_API" : "GPT_API"}=…</code> to the server&apos;s <code>.env</code> and restart. Until then the other AI answers.
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-soft">
            Saving tests the selected model with your key first; if it doesn&apos;t work, nothing changes.
            If the chosen AI is busy or out of credit, the other one answers automatically.
          </p>
        </ActionForm>
      </Card>

      <SectionTitle>Subjects</SectionTitle>
      <Card className="p-5">
        <p className="mb-3 flex flex-wrap gap-2">
          {subjects.map((x) => <span key={x.id} className="rounded-full border border-rule bg-paper px-3 py-1 text-sm text-ink">{x.name}</span>)}
        </p>
        <ActionForm action={createSubject} submit="Add subject" variant="secondary" resetOnOk className="flex flex-col gap-3">
          <Field label="New subject" name="name" required maxLength={120} />
        </ActionForm>
      </Card>
    </>
  );
}
