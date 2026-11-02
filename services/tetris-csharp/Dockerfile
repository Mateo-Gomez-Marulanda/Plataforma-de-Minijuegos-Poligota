# Imagen del servicio Tetris (C# 12 / .NET 8) en dos etapas: compila y publica con el SDK, y ejecuta
# solo con el runtime de ASP.NET sobre Alpine. No hace falta tener .NET instalado. Sirve en el puerto 8004.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
# Primero solo el .csproj, para que la restauración de paquetes quede en caché entre builds.
COPY src/Tetris/Tetris.csproj src/Tetris/
RUN dotnet restore src/Tetris/Tetris.csproj
COPY src/Tetris/ src/Tetris/
RUN dotnet publish src/Tetris/Tetris.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine
# Alpine no trae las bibliotecas de globalización (ICU): el modo invariante evita depender de ellas.
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 \
    PORT=8004
WORKDIR /app
COPY --from=build /out ./
EXPOSE 8004
ENTRYPOINT ["dotnet", "Tetris.dll"]
