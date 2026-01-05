# Instrucciones para Reiniciar la Base de Datos

## Opción 1: Script Automático (Recomendado)

Ejecuta el script que crea todo automáticamente:

```bash
./scripts/reset-db.sh
```

O si necesitas permisos:

```bash
bash scripts/reset-db.sh
```

## Opción 2: Manual con Docker Compose

```bash
# 1. Detener y eliminar volúmenes
docker compose down -v
# O si usas la versión antigua:
docker-compose down -v

# 2. Reiniciar todo
docker compose up -d --build

# 3. Esperar unos segundos y ejecutar el script de inicialización
sleep 5
docker exec -it atlas_app node scripts/create-user.js
```

## Opción 3: Solo Crear el Usuario (si la BD ya existe)

Si la base de datos ya existe pero falta el usuario:

```bash
docker exec -it atlas_app node scripts/create-user.js
```

## Verificar que Funcionó

```bash
# Ver logs del contenedor
docker compose logs atlas | grep -i "usuario\|user\|atlas"

# Verificar en la base de datos
docker exec -it atlas_db psql -U atlas_user -d atlas_metadata -c "SELECT username FROM users;"
```

Deberías ver:
```
 username 
----------
 atlas
```

## Credenciales del Usuario Inicial

- **Username**: `atlas`
- **Password**: `atlas123$`

