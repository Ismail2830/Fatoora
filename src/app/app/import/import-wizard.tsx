"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, TriangleAlert, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMAD } from "@/lib/money";
import { REPORT_FIELD_SPECS } from "@/lib/import/fields";
import { cn } from "@/lib/utils";
import {
  analyzeReport,
  previewReport,
  runImport,
  type AnalyzeResult,
  type ImportResult,
  type PreviewResult,
} from "./actions";

type Step = 0 | 1 | 2 | 3;

const STEP_LABELS = ["Fichier", "Colonnes", "Vérification", "Résultat"];

/** First and last day of the given YYYY-MM month, as ISO. */
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start: start.toISOString(), end: end.toISOString() };
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ImportWizard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(currentMonth());

  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fallbackSlug, setFallbackSlug] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const period = useMemo(() => monthRange(month), [month]);

  function reset() {
    setStep(0);
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setFallbackSlug("");
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setError(null);
  }

  function analyze() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await analyzeReport(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAnalysis(res);
      // Seed the editable mapping from what auto-detect found.
      const seed: Record<string, string> = {};
      for (const [field, header] of Object.entries(res.mapping)) {
        if (header) seed[field] = header;
      }
      setMapping(seed);
      setStep(1);
    });
  }

  function toPreview() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const cleanMapping = Object.fromEntries(
      Object.entries(mapping).filter(([, v]) => v),
    );
    startTransition(async () => {
      const res = await previewReport(fd, cleanMapping, fallbackSlug || null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res);
      setStep(2);
    });
  }

  function commit(force = false) {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const cleanMapping = Object.fromEntries(
      Object.entries(mapping).filter(([, v]) => v),
    );
    startTransition(async () => {
      const res = await runImport(
        fd,
        cleanMapping,
        fallbackSlug || null,
        period.start,
        period.end,
        force,
      );
      if (!res.ok && res.reason === "duplicate") {
        setError(
          `Ce fichier a déjà été importé le ${new Date(res.importedAt).toLocaleDateString("fr-FR")}. Réimporter quand même ?`,
        );
        setResult(res);
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      setStep(3);
      router.refresh();
    });
  }

  const requiredUnmapped = REPORT_FIELD_SPECS.filter((s) => s.required && !mapping[s.field]);

  return (
    <div className="bg-surface border border-hair rounded-[18px] overflow-hidden">
      <Stepper step={step} />

      <div className="p-6">
        {error && (
          <div className="flex items-start gap-2 bg-bad-tint text-bad-ink border border-bad/20 rounded-lg px-3 py-2 text-[13px] mb-4">
            <TriangleAlert className="size-4 flex-none mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              {result && !result.ok && "reason" in result && result.reason === "duplicate" && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => commit(true)}>
                  Réimporter quand même
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ---- Step 0: upload + period ---- */}
        {step === 0 && (
          <div className="space-y-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
                dragOver ? "border-brand bg-brand-tint/50" : "border-hair-strong hover:border-brand/40",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.xlsm,.ods"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-ink">
                  <FileSpreadsheet className="size-5 text-brand" />
                  <span className="font-medium">{file.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="size-7 mx-auto text-ink-4 mb-2" />
                  <p className="text-sm font-medium">Glisse le rapport ici, ou clique</p>
                  <p className="text-xs text-ink-4 mt-1">CSV ou Excel · un seul fichier, plusieurs couriers acceptés</p>
                </>
              )}
            </div>

            <div>
              <label className="text-[13px] font-semibold block mb-1.5">
                Période couverte par le rapport
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 px-3 rounded-[11px] bg-surface border border-input text-sm outline-none focus:border-brand/40"
              />
              <p className="text-xs text-ink-4 mt-1.5">
                Réimporter le même mois remplace l&apos;ancien rapport — pas de double comptage.
              </p>
            </div>

            <Button size="pill" disabled={!file || pending} onClick={analyze}>
              {pending ? "Lecture…" : "Continuer"} <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        {/* ---- Step 1: mapping ---- */}
        {step === 1 && analysis?.ok && (
          <div className="space-y-5">
            <div>
              <p className="font-bold text-[15px]">Vérifie les colonnes</p>
              <p className="text-[13px] text-ink-3">
                Fatora a reconnu {analysis.headers.length} colonnes. Corrige seulement ce qui
                est faux.
              </p>
            </div>

            {!analysis.hasCourierColumn && (
              <div className="bg-warn-tint text-warn-ink border border-warn/30 rounded-lg px-3 py-2.5 text-[13px]">
                <p className="font-semibold">Aucune colonne « courier » détectée.</p>
                <p className="mb-2">
                  Si le fichier mélange plusieurs couriers, mappe la colonne courier ci-dessous.
                  Sinon, choisis le courier de tout le fichier :
                </p>
                <select
                  value={fallbackSlug}
                  onChange={(e) => setFallbackSlug(e.target.value)}
                  className="h-8 px-2 rounded-md bg-surface border border-input text-[13px]"
                >
                  <option value="">— Courier du fichier —</option>
                  {analysis.couriers.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-2">
              {REPORT_FIELD_SPECS.map((spec) => (
                <div key={spec.field} className="grid grid-cols-[160px_1fr] items-center gap-3">
                  <label className="text-[13px]">
                    {spec.label}
                    {spec.required && <span className="text-bad-ink ml-0.5">*</span>}
                  </label>
                  <select
                    value={mapping[spec.field] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [spec.field]: e.target.value }))
                    }
                    className={cn(
                      "h-9 px-2.5 rounded-md bg-surface border text-[13px] outline-none focus:border-brand/40",
                      spec.required && !mapping[spec.field]
                        ? "border-bad/40"
                        : "border-input",
                    )}
                  >
                    <option value="">— Ignorer —</option>
                    {analysis.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {analysis.sampleRows.length > 0 && mapping.status && (
              <div className="text-xs text-ink-4">
                Aperçu statut : «{" "}
                {analysis.sampleRows
                  .map((r) => r[mapping.status!])
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(" », « ")}{" "}
                »
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="pill" onClick={() => setStep(0)}>
                <ArrowLeft className="size-4" /> Retour
              </Button>
              <Button
                size="pill"
                disabled={requiredUnmapped.length > 0 || pending}
                onClick={toPreview}
              >
                {pending ? "Analyse…" : "Vérifier"} <ArrowRight className="size-4" />
              </Button>
            </div>
            {requiredUnmapped.length > 0 && (
              <p className="text-xs text-bad-ink">
                Colonnes requises manquantes : {requiredUnmapped.map((s) => s.label).join(", ")}
              </p>
            )}
          </div>
        )}

        {/* ---- Step 2: preview ---- */}
        {step === 2 && preview?.ok && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Lignes valides" value={preview.valid} tone="good" />
              <Stat label="Rejetées" value={preview.issues.length} tone={preview.issues.length ? "bad" : "neutral"} />
              <Stat label="Avertissements" value={preview.warnings.length} tone={preview.warnings.length ? "warn" : "neutral"} />
            </div>

            <div>
              <p className="text-[13px] font-semibold mb-2">Couriers détectés dans le fichier</p>
              <div className="flex flex-wrap gap-2">
                {preview.courierBreakdown.map((c) => (
                  <Badge key={c.slug ?? "none"} variant={c.slug ? "brand" : "warn"}>
                    {c.label} · {c.count}
                  </Badge>
                ))}
              </div>
            </div>

            {preview.issues.length > 0 && (
              <IssueList title="Lignes rejetées" tone="bad" items={preview.issues} />
            )}
            {preview.warnings.length > 0 && (
              <IssueList title="Avertissements" tone="warn" items={preview.warnings} />
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="pill" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> Retour
              </Button>
              <Button size="pill" disabled={preview.valid === 0 || pending} onClick={() => commit(false)}>
                {pending ? "Import…" : `Importer ${preview.valid} lignes et réconcilier`}
              </Button>
            </div>
          </div>
        )}

        {/* ---- Step 3: the money ---- */}
        {step === 3 && result?.ok && (
          <div className="space-y-5">
            <div className="bg-night text-white rounded-[18px] p-6 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -right-8 -top-8 size-[150px] rounded-full"
                style={{ background: "radial-gradient(circle,rgba(139,111,240,.4),transparent 70%)" }}
              />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Check className="size-4 text-good" />
                  <span className="text-[13px] text-white/70">Réconciliation terminée</span>
                </div>
                {result.deliveredNotPaid > 0 ? (
                  <>
                    <p className="display text-[42px] leading-none mb-1 tabular">
                      {formatMAD(result.missingAmount)}
                    </p>
                    <p className="text-[13.5px] text-night-text">
                      manquants sur {result.deliveredNotPaid} commande
                      {result.deliveredNotPaid > 1 ? "s" : ""} livrée
                      {result.deliveredNotPaid > 1 ? "s" : ""} mais pas payée
                      {result.deliveredNotPaid > 1 ? "s" : ""}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="display text-[36px] leading-none mb-1">Tout est payé 🎉</p>
                    <p className="text-[13.5px] text-night-text">
                      Aucun écart de paiement sur ce rapport.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
              <Fact label="Lignes rapprochées" value={result.linesMatched} />
              <Fact label="Sans commande" value={result.linesUnmatched} />
              <Fact label="Commandes mises à jour" value={result.ordersUpdated} />
            </div>

            {result.superseded > 0 && (
              <p className="text-xs text-ink-4">
                {result.superseded} ancien rapport de cette période a été remplacé.
              </p>
            )}

            <div className="flex gap-2">
              <Button asChild size="pill">
                <a href="/app/reconciliation">Voir les écarts →</a>
              </Button>
              <Button variant="outline" size="pill" onClick={reset}>
                Importer un autre fichier
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex border-b border-hair">
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          className={cn(
            "flex-1 px-4 py-3 text-[13px] font-medium flex items-center gap-2 justify-center",
            i === step ? "text-ink" : i < step ? "text-ink-3" : "text-ink-4",
            i < STEP_LABELS.length - 1 && "border-r border-hair",
          )}
        >
          <span
            className={cn(
              "size-5 rounded-full grid place-items-center text-[11px] font-bold",
              i === step ? "bg-night text-white" : i < step ? "bg-good text-white" : "bg-black/5 text-ink-4",
            )}
          >
            {i < step ? <Check className="size-3" /> : i + 1}
          </span>
          <span className="hidden sm:inline">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "warn" | "neutral" }) {
  const tones = {
    good: "text-good-ink",
    bad: "text-bad-ink",
    warn: "text-warn-ink",
    neutral: "text-ink",
  };
  return (
    <div className="bg-surface-muted border border-hair rounded-xl p-4">
      <p className={cn("display text-3xl leading-none", tones[tone])}>{value}</p>
      <p className="text-xs text-ink-4 mt-1">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-muted border border-hair rounded-lg px-3 py-2.5">
      <p className="font-mono text-lg tabular">{value}</p>
      <p className="text-xs text-ink-4">{label}</p>
    </div>
  );
}

function IssueList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "bad" | "warn";
  items: { rowNumber: number; message: string }[];
}) {
  return (
    <div>
      <p className={cn("text-[13px] font-semibold mb-1.5", tone === "bad" ? "text-bad-ink" : "text-warn-ink")}>
        {title}
      </p>
      <ul className="max-h-40 overflow-y-auto text-xs text-ink-3 space-y-1 border border-hair rounded-lg p-2.5">
        {items.slice(0, 50).map((item, i) => (
          <li key={i}>
            <span className="font-mono text-ink-4">L{item.rowNumber}</span> · {item.message}
          </li>
        ))}
        {items.length > 50 && <li className="text-ink-4">… et {items.length - 50} de plus</li>}
      </ul>
    </div>
  );
}
