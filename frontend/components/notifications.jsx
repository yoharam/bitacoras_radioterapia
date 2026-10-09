'use client';

import { Toaster, sileo } from 'sileo';
import { HeartPulse, Hospital, Stethoscope, Trophy, Wifi } from 'lucide-react';

export default function Notifications() {
  return <Toaster position="bottom-center" options={{ fill: '#1e5b4f', duration: 5000, roundness: 16, styles: { title: 'text-white! normal-case!', description: 'text-white/90!', badge: 'bg-white/15! text-white!', button: 'bg-white/15! text-white!' } }} />;
}

export function networkRecognitionFill(completed) {
  const progress = Math.min(11, Math.max(0, Number(completed) || 0)) / 11;
  const green = [30, 91, 79], gold = [149, 109, 32];
  return `#${green.map((channel, index) => Math.round(channel + (gold[index] - channel) * progress).toString(16).padStart(2, '0')).join('')}`;
}

export function notifyNetworkRecognition(recognition) {
  const month = new Date(`${recognition.month}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return sileo.success({
    title: '¡Gran trabajo, inge!',
    fill: networkRecognitionFill(recognition.completed),
    icon: <Trophy className="size-4" />,
    duration: 8500,
    description: <div data-testid="network-recognition-toast" data-engineer-id={recognition.engineer_id} data-count={recognition.completed} data-level={recognition.gold ? 'gold' : 'building'} className="w-[min(270px,calc(100vw-96px))] space-y-3 py-2 text-white">
      <p className="font-semibold break-words">{recognition.engineer_name}</p>
      <div className="flex items-center gap-3"><strong className="text-4xl leading-none">x{recognition.completed}</strong><div className="text-xs"><p className="font-semibold">Racha mensual</p><p className="mt-1 capitalize text-white/90">{month}</p></div></div>
      <p className="text-xs leading-relaxed text-white/90">{recognition.gold ? '¡Dorado del mes! Más de 10 atenciones gracias a tu gran trabajo.' : 'Gracias por tu gran trabajo conectando a nuestros pacientes.'}</p>
    </div>
  });
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
