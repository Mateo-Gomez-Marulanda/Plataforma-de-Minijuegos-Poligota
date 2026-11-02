# Imagen del servicio Sudoku (no incluye tests): instala FastAPI/uvicorn y sirve la API en el puerto 8001.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY logic ./logic
COPY server ./server
EXPOSE 8001
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8001"]
