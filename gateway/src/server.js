// Punto de arranque: crea el servidor HTTP con el gateway y lo pone a escuchar.
import http from 'node:http';
import { createGateway } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const { app, attachUpgrade } = createGateway();
const server = http.createServer(app);
attachUpgrade(server);
server.listen(port, () => console.log(`gateway escuchando en :${port}`));
