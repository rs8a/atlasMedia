FROM node:20-bookworm

# Instalar FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copiamos los archivos de configuración primero
COPY package*.json ./

# Instalamos las dependencias DENTRO de la imagen
RUN npm install

# Copiamos el resto del código
COPY . .

# Crear directorio de media
RUN mkdir -p /usr/src/app/media

EXPOSE 3000

# Script de inicio que inicializa BD y luego inicia la app
CMD ["sh", "-c", "node scripts/init-db.js && node index.js"]
