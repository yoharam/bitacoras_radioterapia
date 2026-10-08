import './globals.css';
import Notifications from '@/components/notifications';
import localFont from 'next/font/local';

const notoSans = localFont({
  src: [
    { path: './fonts/NotoSans-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/NotoSans-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/NotoSans-Bold.ttf', weight: '700', style: 'normal' }
  ],
  variable: '--font-institutional',
  display: 'swap'
});

export const metadata = {
  title: 'Radioterapia | Bitácora de pacientes',
  description: 'Registro de pacientes, hora de llegada y hora programada de tratamiento en radioterapia.'
};

export default function RootLayout({ children }) {
  return <html lang="es" className={`${notoSans.variable} ${notoSans.className}`}><body>{children}<Notifications /></body></html>;
}
