import { ProcessTimeline } from "@/src/components/chat/ProcessDetails";
import { CallTable } from "@/src/components/chat/InferenceStats";
import { answerQualityOf } from "@/src/lib/eval/scoring";
import type { ScoredRow } from "@/src/lib/eval/types";

function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

/** Semua yang terjadi pada satu eksekusi eval, tanpa perlu membuka berkas JSON. */
export function EvalRowDetail({ row }: { row: ScoredRow }) {
  const { scenario: s, observation: o } = row;
  const steps = o.processSteps ?? [];
  const intervened = steps.filter((st) => st.assist);
  const quality = answerQualityOf(row);
  const routerOverridden = o.routerPredictedRoute && o.routerPredictedRoute !== o.predictedRoute;

  return (
    <div className="grid gap-4 text-xs text-slate-600 lg:grid-cols-2">
      <Block title="Pesan staf">
        <p className="rounded bg-white px-2 py-1 text-sm text-slate-800">{s.message}</p>
      </Block>

      <Block title="Jawaban akhir ke staf">
        {o.assistantText.trim() ? (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-white px-2 py-1 text-sm text-slate-800">
            {o.assistantText}
          </p>
        ) : (
          <p className="text-slate-600">Tidak ada jawaban{o.runError ? `: ${o.runError}` : "."}</p>
        )}
      </Block>

      <Block title="Harapan vs hasil">
        <table className="w-full text-left">
          <tbody>
            <tr className="align-top">
              <th className="w-20 pr-2 font-normal text-slate-600">Rute</th>
              <td>
                harapan <strong>{s.expected_route}</strong> · hasil <strong>{o.predictedRoute ?? "–"}</strong>{" "}
                {row.routeCorrect ? "✓" : "✗"}
              </td>
            </tr>
            <tr className="align-top">
              <th className="pr-2 font-normal text-slate-600">Alat</th>
              <td>
                harapan {s.expected_tools.join(", ") || "tanpa alat"}
                {s.forbidden_tools?.length ? ` (terlarang: ${s.forbidden_tools.join(", ")})` : ""} · hasil{" "}
                {o.toolTrace.map((t) => t.name).join(", ") || "tanpa alat"} {row.toolCorrect ? "✓" : "✗"}
              </td>
            </tr>
            {s.expected_action && (
              <tr className="align-top">
                <th className="pr-2 font-normal text-slate-600">Parameter</th>
                <td className="break-words font-mono">
                  harapan {json(s.expected_action)}
                  {o.toolTrace.map((t, i) => (
                    <div key={i}>
                      model menulis {t.name} {json(t.args)}
                      {t.resolvedArgs !== undefined && <> → dicocokkan {json(t.resolvedArgs)}</>}
                    </div>
                  ))}
                  <div>
                    {row.paramCorrectFields}/{row.paramTotalFields} field benar
                  </div>
                </td>
              </tr>
            )}
            <tr className="align-top">
              <th className="pr-2 font-normal text-slate-600">Hasil</th>
              <td className={row.success ? "text-emerald-700" : "text-red-700"}>
                {row.success ? "berhasil" : `gagal di tahap ${row.failedStage}`}
              </td>
            </tr>
          </tbody>
        </table>
      </Block>

      <Block title="Jawaban mentah model (sebelum diolah kode)">
        {o.modelReplies && o.modelReplies.length > 0 ? (
          <ol className="space-y-1.5">
            {o.modelReplies.map((reply, i) => (
              <li key={i} className="whitespace-pre-wrap break-words rounded bg-white px-2 py-1 font-mono text-slate-700">
                <span className="text-slate-600">{i + 1}. </span>
                {reply || "(kosong)"}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-600">Tidak tersimpan (run lama atau rute diputuskan kode).</p>
        )}
      </Block>

      <Block title="Mutu jawaban">
        {quality === null ? (
          <p className="text-slate-600">Tidak dinilai (run error atau jawaban kosong).</p>
        ) : quality.ok ? (
          <p className="text-emerald-700">Tidak ada masalah terdeteksi.</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-4 text-amber-700">
            {quality.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Campur tangan kode">
        {o.routedByCode || routerOverridden || intervened.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {o.routedByCode && <li>Rute diputuskan kode tanpa memanggil Router.</li>}
            {routerOverridden && (
              <li>
                Router menjawab <strong>{o.routerPredictedRoute}</strong>, kode mengubahnya jadi{" "}
                <strong>{o.predictedRoute}</strong>.
              </li>
            )}
            {intervened.map((st, i) => (
              <li key={i}>{st.label}</li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-600">Tidak ada. Hasil ini murni keluaran model.</p>
        )}
      </Block>

      <Block title="Panggilan model">
        {o.modelCalls && o.modelCalls.length > 0 ? (
          <CallTable calls={o.modelCalls} />
        ) : (
          <p className="text-slate-600">
            Tidak tersimpan{o.promptTokens != null ? `; total ${o.promptTokens} → ${o.completionTokens} token` : ""}.
          </p>
        )}
      </Block>

      <Block title="Langkah">
        {steps.length > 0 ? <ProcessTimeline steps={steps} /> : <p className="text-slate-600">Tidak ada.</p>}
      </Block>
    </div>
  );
}
