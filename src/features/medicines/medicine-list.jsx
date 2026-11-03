import Link from 'next/link';

// FR4 DR4 Each medicine shows its name and dose in large, clear type
export function MedicineList({ medicines }) {
  return (
    <ul className="flex flex-col gap-3">
      {medicines.map((medicine) => (
        <li key={medicine.id}>
          <Link
            href={`/medicines/${medicine.id}`}
            className="flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border p-4 text-xl outline-hidden hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="min-w-0 font-bold wrap-break-word">{medicine.name}</span>
            <span className="min-w-0 wrap-break-word">{medicine.dosage}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
