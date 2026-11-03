'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MedicineForm } from '@/features/medicines/medicine-form';
import { api } from '@/lib/api';

// FR5 Add a medicine by typing its details (UC3)
export default function NewMedicinePage() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  // An error here goes back to the form, which shows it by the button
  async function handleSave(values) {
    const medicine = await api('/medicines', { method: 'POST', body: values });
    // The button stays off while the next screen loads, so a second press saves nothing
    setSaved(true);
    router.replace(`/medicines/${medicine.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Add a medicine</h1>
      <MedicineForm submitLabel="Save medicine" onSubmit={handleSave} disabled={saved} />
    </div>
  );
}
