#!/bin/bash

echo "🔄 Reiniciando base de datos de Atlas..."
echo ""
echo "Este script requiere permisos de Docker."
echo "Si tienes problemas de permisos, ejecuta:"
echo "  sudo bash scripts/ejecutar-reset.sh"
echo ""

# Intentar con docker compose (nueva sintaxis)
if command -v docker &> /dev/null; then
    echo "📦 Deteniendo contenedores..."
    docker compose down -v 2>/dev/null || docker-compose down -v 2>/dev/null || sudo docker compose down -v 2>/dev/null || sudo docker-compose down -v 2>/dev/null
    
    echo "🚀 Reiniciando contenedores..."
    docker compose up -d --build 2>/dev/null || docker-compose up -d --build 2>/dev/null || sudo docker compose up -d --build 2>/dev/null || sudo docker-compose up -d --build 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "⏳ Esperando a que PostgreSQL esté listo (15 segundos)..."
        sleep 15
        
        echo "📝 Ejecutando script de inicialización..."
        docker exec -it atlas_app node scripts/create-user.js 2>/dev/null || \
        sudo docker exec -it atlas_app node scripts/create-user.js 2>/dev/null || \
        docker exec -it atlas_app node scripts/init-db.js 2>/dev/null || \
        sudo docker exec -it atlas_app node scripts/init-db.js 2>/dev/null
        
        echo ""
        echo "✅ Proceso completado!"
        echo ""
        echo "🔍 Verificar usuario creado:"
        echo "   docker exec -it atlas_db psql -U atlas_user -d atlas_metadata -c \"SELECT username FROM users;\""
        echo "   O con sudo si es necesario:"
        echo "   sudo docker exec -it atlas_db psql -U atlas_user -d atlas_metadata -c \"SELECT username FROM users;\""
    else
        echo "❌ Error al reiniciar contenedores"
    fi
else
    echo "❌ Docker no está instalado o no está en el PATH"
fi

