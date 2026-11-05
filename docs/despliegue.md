# Despliegue: Render (backend) + Vercel (frontend)

```
Navegador ──► Vercel (React estático)
    │
    └── /api/... y /ws/... ──► Render: minijuegos-gateway ──► minijuegos-sudoku, -buscaminas, -snake,
                                                                -tetris, -asteroids, -blackjack
```

Vercel solo sirve archivos estáticos y no reenvía WebSockets, por eso el navegador habla
directamente con el gateway de Render (la URL se fija con `VITE_API_URL` al compilar).

## 1. Backend en Render

1. Sube el código a GitHub (`git push`). Render despliega la rama `main`.
2. En <https://dashboard.render.com> → **New** → **Blueprint** → elige el repositorio.
   Render lee `render.yaml` y crea los 7 servicios (todos en el plan gratuito, con Docker).
3. Espera a que terminen las compilaciones (las de Java, Kotlin y C# tardan varios minutos).
4. Revisa la URL de cada servicio. Si alguna no es `https://minijuegos-<juego>.onrender.com`
   (Render añade un sufijo si el nombre ya existe), entra en **minijuegos-gateway → Environment**
   y corrige la variable `SUDOKU_URL`, `SNAKE_URL`, etc.
5. Comprueba que vive: `https://minijuegos-gateway.onrender.com/health` → `{"status":"ok"}`.

## 2. Frontend en Vercel

1. En <https://vercel.com/new> → importa el mismo repositorio.
2. **Root Directory**: `frontend`. Vercel detecta Vite (build `npm run build`, salida `dist`).
3. **Environment Variables**: `VITE_API_URL` = la URL del gateway, por ejemplo
   `https://minijuegos-gateway.onrender.com`.
4. **Deploy**. `frontend/vercel.json` hace que rutas como `/juegos/snake` funcionen al recargar.

Si cambias la URL del gateway, vuelve a desplegar en Vercel: la variable se incrusta al compilar.

## Limitaciones del plan gratuito de Render

- Cada servicio se duerme tras 15 minutos sin uso. La primera visita puede tardar ~1 minuto
  y un juego puede mostrar "No se pudo conectar con el servidor" hasta que su servicio despierte;
  basta con pulsar *Reintentar*.
- Hay 750 horas gratis al mes para todos los servicios juntos; como se duermen, para un proyecto
  de clase alcanza.
- 512 MB de RAM por servicio.
