import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 grid lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-[400px] mx-auto">
          <Logo className="mb-10" />
          {children}
        </div>
      </div>

      {/* The pitch, restated where it costs nothing: this is what they're
          signing up to get. Hidden on small screens where it would push the
          form below the fold. */}
      <aside className="hidden lg:flex flex-col justify-center bg-night text-white p-16">
        <p className="text-[13px] text-night-muted mb-4">Alerte réconciliation</p>
        <p className="display text-[44px] leading-[1.05] mb-6">
          Ton courier dit livré.
          <br />
          Fin la <em className="text-brand">flous</em> ?
        </p>
        <p className="text-[15px] leading-relaxed text-night-text max-w-md">
          Fatora rapproche tes commandes et les rapports des couriers, puis te
          montre exactement combien de cash te manque — bla Excel, bla mal3arf.
        </p>

        <dl className="grid grid-cols-3 gap-6 mt-12 border-t border-white/10 pt-8">
          {[
            { v: "4", k: "couriers supportés" },
            { v: "2 min", k: "pour réconcilier" },
            { v: "100%", k: "de ton cash tracké" },
          ].map((s) => (
            <div key={s.k}>
              <dt className="display text-3xl leading-none">{s.v}</dt>
              <dd className="text-xs text-night-muted mt-1.5">{s.k}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
