'use client';

import { useFormStatus } from 'react-dom';
import { LoaderCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict } from '@/lib/i18n/client';

export function LogoutButton() {
  const d = useDict();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending}>
      {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <LogOut aria-hidden />}
      {pending ? d.watch.loggingOut : d.watch.logout}
    </Button>
  );
}
