'use client';

import { Toaster, sileo } from 'sileo';
import { HeartPulse, Hospital, Stethoscope, Wifi } from 'lucide-react';

export default function Notifications() {
  return <Toaster position="bottom-center" options={{ fill: '#1e5b4f', duration: 5000, roundness: 16, styles: { title: 'text-white! normal-case!', description: 'text-white/90!', badge: 'bg-white/15! text-white!', button: 'bg-white/15! text-white!' } }} />;
}

export function notifyNetworkRequest() {
  return sileo.success({
    title: 'Tu ingeniero va en camino',
    duration: 6500,
    description: <div className="w-[min(270px,calc(100vw-96px))] py-2">
      <p className="mb-4 text-xs text-white/90">Conectando al paciente a internet</p>
      <div className="network-journey flex items-center justify-between gap-2" role="img" aria-label="Ruta de asistencia: hospital, personal de salud y conexión a internet">
        <span className="network-journey-node"><Hospital className="size-5" /><small>Hospital</small></span>
        <span className="network-journey-route"><Stethoscope className="network-journey-traveler size-4" /></span>
        <span className="network-journey-node"><HeartPulse className="size-5" /><small>Salud</small></span>
        <span className="network-journey-route"><Stethoscope className="network-journey-traveler size-4" /></span>
        <span className="network-journey-node"><Wifi className="size-5" /><small>Internet</small></span>
      </div>
    </div>
  });
}
