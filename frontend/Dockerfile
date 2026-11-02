# Imagen del frontend: instala dependencias y sirve la app con el servidor de desarrollo de Vite en el puerto 5173.
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
