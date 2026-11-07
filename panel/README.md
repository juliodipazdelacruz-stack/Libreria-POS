# Panel de la librería

Panel web (React + Vite + Tailwind + Supabase) para el administrador:
inicio de sesión, estados de cuenta, y registro de salones, profesores y productos.

## 1. Preparar Supabase (una sola vez)

1. En el **SQL Editor** ejecuta `panel_vistas.sql`. Crea las vistas con los saldos de cada cuenta.
2. Comprueba que tu usuario administrador existe en **Authentication → Users** y que está enlazado:

   ```sql
   select * from usuarios_acceso;   -- debe aparecer tu usuario con rol 'admin'
   ```

## 2. Configurar el proyecto (Windows + VS Code)

1. Instala **Node.js LTS** desde https://nodejs.org (versión 18 o superior). Comprueba con `node -v` en una terminal nueva.
2. Descomprime el zip en una carpeta normal de Windows, por ejemplo `C:\proyectos\panel-libreria`.
   **No lo uses desde una ruta `\\wsl.localhost\...`**: `npm run dev` falla con rutas de red (UNC).
3. En VS Code: **Archivo → Abrir carpeta** y elige `panel-libreria`. Abre la terminal integrada (**Ctrl + `**).
4. Crea tu archivo de configuración y complétalo:

   ```powershell
   Copy-Item .env.example .env
   ```

   Abre `.env` en VS Code y pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
   El archivo debe llamarse exactamente `.env` (no `.env.txt`).
5. Instala y arranca:

   ```powershell
   npm install
   npm run dev
   ```

6. Abre http://localhost:5173 e inicia sesión con tu correo de administrador.

> Usa la clave **anon public** de Supabase (Project Settings -> API). Nunca pongas la `service_role` en el panel:
> esa clave es solo para el bot.

**Si PowerShell dice "la ejecución de scripts está deshabilitada"** (error de `npm.ps1`), ejecuta una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

o usa `npm.cmd install` y `npm.cmd run dev`, o cambia la terminal de VS Code a **Command Prompt**.

*Alternativa:* si prefieres trabajar en Ubuntu, instala la extensión **WSL** de VS Code, abre la carpeta con "Open Folder in WSL" (por ejemplo `~/panel-libreria`) y usa los mismos comandos `npm`.

## 3. Qué incluye

| Sección | Qué puedes hacer |
|---|---|
| Estados de cuenta | Ver consumos, pagos y saldo de cada salón y profesor; abrir el detalle por mes |
| Salones | Crear, editar, asignar profesor, activar o desactivar |
| Profesores | Crear, editar, asignar salón, activar o desactivar |
| Productos | Crear, editar, cambiar precio (con historial), nombres alternativos para el bot |

Los salones y profesores no se borran: se desactivan, para conservar su historial de cuentas.

## 4. Publicar en Vercel (opcional)

1. Sube el proyecto a GitHub (el archivo `.env` no se sube).
2. En Vercel crea un proyecto desde ese repositorio.
3. En **Settings → Environment Variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
