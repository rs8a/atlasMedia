#!/bin/bash

# Script para reiniciar la base de datos y crear el usuario inicial

echo "🔄 Reiniciando base de datos de Atlas..."

# Detener contenedores
echo "📦 Deteniendo contenedores..."
docker compose down 2>/dev/null || docker-compose down 2>/dev/null || echo "No se pudieron detener los contenedores (puede que no estén corriendo)"

# Eliminar volumen de PostgreSQL
echo "🗑️  Eliminando datos de PostgreSQL..."
if [ -d "postgres_data" ]; then
    sudo rm -rf postgres_data/ 2>/dev/null || rm -rf postgres_data/ 2>/dev/null
    echo "✅ Volumen eliminado"
else
    echo "ℹ️  No existe el directorio postgres_data"
fi

# Reiniciar contenedores
echo "🚀 Reiniciando contenedores..."
docker compose up -d --build 2>/dev/null || docker-compose up -d --build 2>/dev/null

if [ $? -eq 0 ]; then
    echo "⏳ Esperando a que PostgreSQL esté listo..."
    sleep 5
    
    echo "📝 Ejecutando script de inicialización..."
    docker exec -it atlas_app node scripts/init-db.js 2>/dev/null || \
    docker exec -it atlas_app node scripts/create-user.js 2>/dev/null || \
    echo "⚠️  No se pudo ejecutar el script automáticamente. Ejecuta manualmente:"
    echo "   docker exec -it atlas_app node scripts/create-user.js"
    
    echo ""
    echo "✅ Proceso completado!"
    echo ""
    echo "📊 Verificar logs:"
    echo "   docker compose logs -f atlas"
    echo ""
    echo "🔍 Verificar usuario creado:"
    echo "   docker exec -it atlas_db psql -U atlas_user -d atlas_metadata -c \"SELECT username FROM users;\""
else
    echo "❌ Error al reiniciar contenedores"
    echo "💡 Intenta ejecutar manualmente:"
    echo "   1. docker compose down -v"
    echo "   2. docker compose up -d"
    echo "   3. docker exec -it atlas_app node scripts/create-user.js"
fi

