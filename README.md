# Bitácora de radioterapia

Aplicación interna en español para registrar pacientes, su día de atención, la hora de llegada y el horario programado de tratamiento. Incluye login, CRUD de registros, exportación CSV, solicitudes de internet a Redes, gestión de usuarios y permisos por módulo.

El frontend usa **Next.js y React**, **Tailwind CSS 4**, componentes **shadcn/ui** y **react-super-responsive-table**. El backend usa **Express** y **SQLite**, que guarda los datos en un archivo local. No necesitas instalar un servidor de base de datos, Docker ni un ORM.

## 1. Requisitos

| Herramienta | Requisito | Uso |
| --- | --- | --- |
| Node.js | 22.13.0 o superior; probado con 22.23.3 | Ejecutar frontend, API y SQLite integrado |
| pnpm | 11.22.0 | Instalar las dependencias del workspace |
| Git | Una versión reciente | Descargar y actualizar el proyecto |
| Navegador | Chrome, Edge, Firefox o Safari actual | Usar la aplicación |

Funciona en Linux, Windows y macOS. Requiere internet para descargar el proyecto y sus dependencias la primera vez. Después puede trabajar localmente sin internet. Las fuentes Noto Sans se incluyen en el proyecto.

Instala Node.js desde [nodejs.org](https://nodejs.org/es/download) y Git desde [git-scm.com](https://git-scm.com/downloads). Después abre una terminal nueva y verifica:

```bash
node --version
npm --version
git --version
```

Instala el gestor de paquetes usado por el proyecto:

```bash
npm install --global pnpm@11.22.0
pnpm --version
```

En Linux, si tu instalación de Node no permite instalar paquetes globales, utiliza una instalación de Node en tu usuario o un gestor de versiones. La aplicación no necesita ejecutarse como root.

## 2. Descargar e instalar

En una instalación nueva:

```bash
git clone https://github.com/yoharam/bitacoras_radioterapia.git
cd bitacoras_radioterapia
pnpm install --frozen-lockfile
```

Ejecuta los comandos desde la raíz del proyecto, donde está este README y el archivo `package.json`.

Si ya tienes la carpeta local creada durante el desarrollo:

```bash
cd /home/zaid/Downloads/bitacoras-institucionales
pnpm install --frozen-lockfile
```

### Crear la configuración

En Linux o macOS:

```bash
cp .env.example .env
```

En Windows, desde PowerShell:

```powershell
Copy-Item .env.example .env
```

Este paso se hace **una sola vez**. En una instalación existente conserva tu `.env`.

Abre `.env` con tu editor y configura el administrador inicial:

```dotenv
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@bitacoras.local
ADMIN_PASSWORD=Bitacoras2026!
WEB_PORT=3100
API_PORT=4100
APP_ORIGIN=http://localhost:3100
COOKIE_SECURE=false
```

| Variable | Qué significa |
| --- | --- |
| `ADMIN_NAME` | Nombre del administrador que se crea en el primer inicio |
| `ADMIN_EMAIL` | Correo con el que iniciará sesión ese administrador |
| `ADMIN_PASSWORD` | Contraseña inicial, entre 12 y 200 caracteres |
| `WEB_PORT` | Puerto del frontend; por defecto 3100 |
| `API_PORT` | Puerto del backend; por defecto 4100 |
| `APP_ORIGIN` | Dirección del frontend; usa `http://localhost:` y su puerto |
| `COOKIE_SECURE` | Mantén `false` para la instalación local con HTTP |
| `DB_PATH` | Opcional: ruta alternativa del archivo SQLite; normalmente se deja sin definir |
| `STRICT_PORTS` | Opcional: `1` hace que desarrollo falle si un puerto está ocupado |

Las variables `ADMIN_*` se usan únicamente cuando todavía no existen usuarios. Cambiarlas después no modifica las cuentas existentes. Para cambiar una contraseña, usa **Mi cuenta** o **Usuarios → Editar usuario**.

## 3. Arrancar frontend y backend con un comando

Desde la raíz:

```bash
npm run dev
```

Abre **http://localhost:3100**. La terminal indica las direcciones elegidas:

```text
Abre la aplicación en http://localhost:3100
Frontend y backend se inician juntos. Ctrl+C detiene ambos.
API de bitácoras: http://127.0.0.1:4100
```

Si un puerto ya está ocupado, desarrollo prueba los siguientes 19 puertos y ajusta automáticamente la conexión entre los servicios. Abre la URL que aparezca en tu terminal. Para detener ambos, presiona **Ctrl+C**.

No tienes que abrir dos terminales ni arrancar Next.js y Express por separado. Para volver a iniciar el sistema otro día, basta con entrar a la carpeta y ejecutar `npm run dev`.

### Primer acceso

Si dejaste los valores de ejemplo:

- Correo: `admin@bitacoras.local`
- Contraseña: `Bitacoras2026!`

Puedes personalizarlos en `.env` antes del primer inicio. La base inicial no contiene pacientes ni usuarios de prueba; solo se crea el administrador.

La aplicación escucha en esta computadora (`127.0.0.1`). Usa HTTP local, sin dominio ni certificados. Esta configuración no expone el sistema a otros equipos de la red.

## 4. Uso de la bitácora

1. Inicia sesión y abre **Pacientes**.
2. Selecciona el período: Hoy, Ayer, Esta semana, Semana pasada, Este mes o Todo el historial. También puedes elegir **Día específico** o **Rango de fechas**. El sistema muestra el día de la semana y la fecha, por ejemplo: “jueves, 8 de octubre de 2026”.
3. Presiona **Registrar paciente**.
4. Captura nombre completo, día y fecha de atención y hora programada de tratamiento. La hora de llegada se registra después. Puedes añadir el **RFC** con homoclave y el **tipo de cirugía**: Hospitalizado o Ambulatorio; ambos son opcionales. El RFC se guarda en mayúsculas.
5. Cuando llegue, pulsa **Registrar llegada** en su fila. El sistema guarda la hora local; después habilita el botón del hospital para solicitar internet a Redes.
6. El registro comienza **En espera**. Usa la acción **Avanzar** para pasar a **En tratamiento** cuando inicie la atención y a **Atendido** al terminar. El detalle del paciente muestra las tres etapas en una línea de progreso. Editar permite corregir el estado si hace falta. Las observaciones son opcionales.
7. Pulsa el folio, el paciente, el RFC, la fecha, los horarios o el estado para abrir su ficha. Puedes consultar, editar o eliminar el registro según tus permisos.

Las horas se guardan en formato de **24 horas**, `HH:MM`. La hora programada representa el horario previsto, no el inicio real del tratamiento. Si el paciente llega tarde, puedes conservar su horario programado original.

Cada registro corresponde a una atención. El mismo paciente puede tener registros en diferentes días. El día de la semana se calcula a partir de la fecha para que ambos coincidan.

- **Búsqueda:** por nombre del paciente y observaciones, sin distinguir acentos o mayúsculas, con sugerencias de pacientes que puedes seleccionar con el ratón o con ↑, ↓ y Enter.
- **Período y estado:** filtran los registros; “Todo el historial” muestra todos los días. Los rangos incluyen ambos extremos y se consultan con “Aplicar rango”.
- **Resumen:** muestra totales y estados según los filtros aplicados.
- **Orden:** fecha descendente y hora programada ascendente dentro del día.
- **CSV:** exporta todos los resultados filtrados, incluyendo día, fecha, paciente, RFC, tipo de cirugía, ambos horarios, estado y observaciones.
- **Imprimir / PDF:** abre un reporte de los resultados filtrados. Desde el diálogo del navegador puedes imprimirlo o guardarlo como PDF; requiere permiso de exportación.
- **Asistencia de Redes:** el icono del hospital en las acciones del paciente solicita ayuda para conectarlo a internet y anima un recorrido hospital → salud → internet en la confirmación verde «Tu ingeniero va en camino». La solicitud queda guardada; el icono se deshabilita mientras esté pendiente para evitar duplicados. El menú **Redes** permite consultar pendientes e historial y marcar como atendida después de conectar al paciente; se actualiza cada 15 segundos mientras está visible. Este flujo registra solicitudes dentro de la aplicación; el mensaje de confirmación no verifica un desplazamiento real ni envía avisos por correo o WhatsApp.
- **Responsive:** la tabla se transforma en fichas cuando el espacio disponible es reducido, también en tabletas con menú lateral.

## 5. Usuarios y permisos modulares

El administrador tiene acceso a todos los módulos. Desde **Usuarios** puede crear, consultar, editar y eliminar cuentas, cambiar sus contraseñas y activarlas o desactivarlas.

Para crear una cuenta:

1. Abre **Usuarios → Crear usuario**.
2. Escribe nombre, correo único y contraseña inicial de al menos 12 caracteres.
3. Selecciona **Permisos personalizados** o **Administrador**.
4. Marca las acciones permitidas en cada módulo y guarda.

| Módulo | Permisos disponibles |
| --- | --- |
| Bitácora de radioterapia | Consultar, Registrar, Registrar llegada del paciente, Editar, Eliminar, Exportar CSV, Solicitar asistencia de Redes |
| Asistencia de Redes | Consultar solicitudes, Marcar como atendida |
| Usuarios | Consultar, Crear, Editar y asignar permisos, Eliminar |

Al seleccionar una acción se activa también **Consultar** para ese módulo. Una cuenta sin permisos puede iniciar sesión y cambiar su contraseña desde **Mi cuenta**, pero no accede a los módulos.

Ejemplos de configuración:

| Tipo de cuenta | Permisos sugeridos |
| --- | --- |
| Consulta | Radioterapia: Consultar |
| Captura | Radioterapia: Consultar, Registrar y Editar |
| Seguimiento y reportes | Radioterapia: Consultar, Editar y Exportar CSV |
| Administración completa | Perfil Administrador |

Los permisos se verifican tanto en la interfaz como en la API. Una cuenta con permisos personalizados solo puede delegar permisos que ella misma tenga y no puede gestionar administradores. Los cambios de permisos se aplican en las siguientes solicitudes; la interfaz actualiza el acceso al recargar, volver a enfocar la ventana o recibir una denegación de permisos.

Para quien registra llegadas, asigna **Consultar** y **Registrar llegada del paciente** en radioterapia. Para quien solicita internet, activa además **Solicitar asistencia de Redes**. Para una cuenta de Redes, asigna **Consultar solicitudes** y **Marcar como atendida** en Asistencia de Redes; puede entrar directamente a ese panel sin consultar toda la bitácora. Los administradores ya tienen estas acciones; las cuentas existentes con permisos personalizados necesitan que se les asignen.

- No puedes desactivar o eliminar tu propia cuenta ni cambiar tus propios permisos.
- Debe quedar al menos un administrador activo.
- Desactivar una cuenta impide nuevos accesos y revoca sus sesiones actuales.
- Cambiar la contraseña desde Usuarios revoca las sesiones de esa cuenta.
- Si una cuenta ya creó registros, **desactívala** para conservar la autoría del historial. Su eliminación se bloquea mientras tenga registros asociados.
- Las cuentas sin registros pueden eliminarse con confirmación.

## 6. Ejecutar la versión compilada

Para usar la aplicación sin recarga automática de desarrollo, detén primero `npm run dev` con Ctrl+C. Conserva la configuración de `.env` y ejecuta:

```bash
npm run build
npm start
```

`npm start` también inicia ambos servicios. En este modo usa exactamente los puertos configurados; deben estar libres. Si cambias `API_PORT`, actualiza la configuración y vuelve a ejecutar `npm run build` antes de arrancar.

## 7. Datos, respaldo y actualizaciones

SQLite se crea automáticamente en:

```text
backend/data/bitacoras.sqlite
```

Los registros, usuarios, permisos y sesiones se guardan en esa base. Reiniciar la aplicación conserva los datos.

### Respaldar

1. Detén la aplicación con Ctrl+C.
2. Copia la carpeta **`backend/data/` completa** a otra ubicación. Conserva los archivos auxiliares SQLite si existen.
3. Guarda también una copia de tu `.env` si necesitas restaurar la configuración.
4. Vuelve a iniciar la aplicación.

Para restaurar, detén la aplicación, conserva una copia de los datos actuales y repón la carpeta respaldada en `backend/data/`. Después inicia de nuevo.

`.env`, la base, respaldos, dependencias, compilaciones y resultados de pruebas quedan fuera de Git. El repositorio incluye `.env.example` como plantilla.

### Actualizar una instalación clonada

Detén la aplicación y realiza un respaldo antes de actualizar:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
npm run dev
```

Para la versión compilada:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
npm run build
npm start
```

Las migraciones se ejecutan automáticamente al iniciar el backend. Los registros anteriores se conservan y los nuevos campos RFC y tipo de cirugía quedan sin registrar hasta que se capturen. Los registros que todavía no tienen paciente ni horarios aparecen como pendientes de completar y su información original sigue disponible. Los usuarios de la versión inicial conservan su acceso de administrador.

## 8. Problemas frecuentes

| Mensaje o problema | Qué hacer |
| --- | --- |
| `node:sqlite` no existe | Instala Node.js 22.13.0 o superior y verifica `node --version` en esa terminal |
| `pnpm: command not found` | Instala pnpm con el comando del apartado de requisitos y abre una terminal nueva |
| `EADDRINUSE` | Detén las instancias anteriores. En desarrollo, ejecuta el comando de la raíz y usa la URL elegida automáticamente; en modo compilado libera los puertos configurados |
| Next.js no puede adquirir su lock | Ya hay otra instancia del frontend en esta carpeta. Detén esa instancia antes de volver a arrancar |
| No conecta con la API | Revisa la salida de la terminal. Ejecuta `npm run dev` desde la raíz y comprueba que ambos servicios estén activos |
| El correo o la contraseña son incorrectos | Verifica las credenciales y que la cuenta esté activa. Editar `ADMIN_PASSWORD` en `.env` no cambia una cuenta existente |
| No aparece un módulo o una acción | El administrador debe asignar los permisos correspondientes desde Usuarios |
| No se puede eliminar un usuario | Si tiene registros, desactívalo. Tu propia cuenta y el último administrador están protegidos |
| `next start` no encuentra compilación | Ejecuta primero `npm run build` |
| Advertencia de SQLite experimental | Node.js 22 puede mostrarla; no impide el arranque ni las operaciones |

## 9. Pruebas

```bash
npm test
npm run build
```

Para las pruebas de navegador:

```bash
pnpm exec playwright install chromium
npm run test:e2e
```

Las pruebas de API usan Express y SQLite reales, sin abrir puertos TCP. Cubren CRUD, validaciones, búsqueda, filtros, persistencia, migración, autenticación, usuarios, permisos por acción, revocación de sesiones y protección contra escalamiento de privilegios.

Las pruebas de navegador comprueban radioterapia entre **320 y 1440 píxeles**, día y horarios, CSV, usuarios y cuentas limitadas. Usan una base independiente en `.playwright-data/test-3110.sqlite`, compilación separada en `.next-e2e-3110/` y puertos 3110/4110, sin interferir con la aplicación local. Estos puertos deben estar libres; puedes cambiarlos mediante `E2E_WEB_PORT` y `E2E_API_PORT`.

## 10. Estructura y presentación

```text
frontend/app/            Pantalla principal, estilos Tailwind y fuentes locales
frontend/components/     Componentes shadcn/ui, ventanas y módulo de usuarios
frontend/lib/            Cliente de API y comprobación de permisos para la UI
backend/src/             Express, autenticación, permisos y SQLite
backend/data/            Base local, creada automáticamente y excluida de Git
backend/test/            Pruebas de API y permisos
tests/                   Pruebas de navegador y responsive
scripts/run.mjs          Comando único de arranque y compilación
.env.example             Plantilla de configuración
```

Next.js reenvía `/api/*` a Express. El navegador usa el mismo origen; no requiere configurar CORS. Las contraseñas se guardan con scrypt, las sesiones usan cookies HttpOnly y SameSite con duración de ocho horas, y las consultas SQL son parametrizadas.

La UI usa Noto Sans local, guinda `#9b2247`, tinto `#611232`, dorado `#a57f2c` y detalles claros `#e6d194`. Los colores se tomaron de la página 17 de la guía institucional proporcionada durante el desarrollo. El PDF de referencia no es necesario para instalar ni ejecutar la aplicación.

Para agregar componentes shadcn/ui durante el desarrollo:

```bash
cd frontend
pnpm exec shadcn add nombre-del-componente
```
