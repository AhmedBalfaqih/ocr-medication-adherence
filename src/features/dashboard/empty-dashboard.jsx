import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

// UC7 With no medicines there is nothing to count, so the dashboard points to the first one
export function EmptyDashboard() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">You have no medicines yet.</p>
      <Link href="/medicines/new" className={buttonVariants({ size: 'lg' })}>
        Add a medicine
      </Link>
    </div>
  );
}
