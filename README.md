# Atlas Media Server

Sistema profesional de gestión de streams multimedia basado en FFmpeg, con arquitectura modular y limpia. Diseñado para manejar múltiples streams (UDP, HLS, DVB) de forma independiente con monitoreo automático y logs persistentes.

## 🏗️ Arquitectura

El proyecto sigue una arquitectura en capas con separación clara de responsabilidades:

- **Models**: Modelos de datos con validación
- **Repositories**: Acceso a datos PostgreSQL
- **Services**: Lógica de negocio
- **Managers**: Gestión de procesos FFmpeg y health checks
- **Builders**: Construcción de comandos FFmpeg
- **Controllers**: Controladores de API REST
- **Routes**: Definición de rutas
- **Middleware**: Validación y manejo de errores

## 🚀 Inicio Rápido

### Prerrequisitos

- Docker y Docker Compose
- Node.js 20+ (para desarrollo local)

### Instalación con Docker

```bash
# Construir e iniciar todos los servicios
docker-compose up -d --build

# Ver logs
docker-compose logs -f atlas

# Detener servicios
docker-compose down
```

### Desarrollo Local

```bash
# Instalar dependencias
npm install

# Configurar base de datos (asegúrate de que PostgreSQL esté corriendo)
psql -U atlas_user -d atlas_metadata -f schema.sql

# Iniciar servidor
npm start
```

### Usuario Inicial

Al inicializar la base de datos, se crea automáticamente un usuario inicial:
- **Username**: `atlas`
- **Password**: `atlas123$`

## 📡 API REST - Documentación Completa

### Base URL

```
http://localhost:3000/api
```

### Autenticación

El sistema utiliza **JWT (JSON Web Tokens)** para autenticación. La mayoría de los endpoints requieren autenticación.

#### Cómo usar la autenticación

1. Iniciar sesión para obtener un token
2. Incluir el token en todas las peticiones protegidas usando el header:
   ```
   Authorization: Bearer <token>
   ```

#### Endpoints de Autenticación

##### POST /api/auth/login

Inicia sesión y obtiene un token JWT.

**Request:**
```json
{
  "username": "atlas",
  "password": "atlas123$"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "atlas",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errores:**
- `400`: Faltan username o password
- `401`: Credenciales inválidas

##### POST /api/auth/register

Registra un nuevo usuario.

**Request:**
```json
{
  "username": "nuevo_usuario",
  "password": "contraseña123"
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "nuevo_usuario",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `400`: Faltan datos o contraseña muy corta (< 6 caracteres)
- `409`: El nombre de usuario ya existe

##### GET /api/auth/profile

Obtiene el perfil del usuario autenticado.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "atlas",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `401`: Token inválido o expirado

##### POST /api/auth/change-password

Cambia la contraseña del usuario autenticado.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "oldPassword": "atlas123$",
  "newPassword": "nueva_contraseña123"
}
```

**Response (200 OK):**
```json
{
  "message": "Contraseña actualizada exitosamente"
}
```

**Errores:**
- `400`: Faltan datos o nueva contraseña muy corta
- `401`: Token inválido o contraseña actual incorrecta

##### GET /api/auth/users

Lista todos los usuarios (requiere autenticación).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "atlas",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

##### GET /api/auth/users/:id

Obtiene un usuario por ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "atlas",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

##### DELETE /api/auth/users/:id

Elimina un usuario.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Errores:**
- `404`: Usuario no encontrado

---

### Endpoints de Canales

Todos los endpoints de canales requieren autenticación (excepto que se indique lo contrario).

#### GET /api/channels

Lista todos los canales.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "HBO Latino HD",
    "status": "running",
    "input_url": "udp://@239.1.1.1:5000",
    "ffmpeg_params": {
      "video_codec": "libx264",
      "audio_codec": "aac"
    },
    "outputs": [
      {
        "type": "hls",
        "path": "/usr/src/app/media/channel-id"
      }
    ],
    "auto_restart": true,
    "pid": 12345,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### GET /api/channels/:id

Obtiene un canal específico por ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "HBO Latino HD",
  "status": "running",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": true,
  "pid": 12345,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `404`: Canal no encontrado

#### POST /api/channels

Crea un nuevo canal.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "HBO Latino HD",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac",
    "video_bitrate": "2M",
    "audio_bitrate": "128k"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": true
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "HBO Latino HD",
  "status": "stopped",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac",
    "video_bitrate": "2M",
    "audio_bitrate": "128k"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": true,
  "pid": null,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `400`: Datos inválidos (nombre vacío, URL vacía, sin outputs, etc.)

#### PUT /api/channels/:id

Actualiza un canal existente.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "HBO Latino HD Actualizado",
  "auto_restart": false
}
```

**Nota:** Si el canal está corriendo (`status: "running"`), solo se pueden modificar `name` y `auto_restart`. Para modificar otros campos, primero detén el canal.

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "HBO Latino HD Actualizado",
  "status": "running",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": false,
  "pid": 12345,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T01:00:00.000Z"
}
```

**Errores:**
- `400`: No se puede modificar configuración de un canal en ejecución
- `404`: Canal no encontrado

#### DELETE /api/channels/:id

Elimina un canal. Si está corriendo, lo detiene primero.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Errores:**
- `404`: Canal no encontrado

#### POST /api/channels/:id/start

Inicia el stream de un canal.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "HBO Latino HD",
  "status": "running",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": true,
  "pid": 12345,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `400`: El canal ya está corriendo
- `404`: Canal no encontrado

#### POST /api/channels/:id/stop

Detiene el stream de un canal.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "HBO Latino HD",
  "status": "stopped",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": true,
  "pid": null,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `400`: El canal ya está detenido
- `404`: Canal no encontrado

#### POST /api/channels/:id/restart

Reinicia el stream de un canal (detiene y vuelve a iniciar).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "HBO Latino HD",
  "status": "running",
  "input_url": "udp://@239.1.1.1:5000",
  "ffmpeg_params": {
    "video_codec": "libx264",
    "audio_codec": "aac"
  },
  "outputs": [
    {
      "type": "hls",
      "path": "/usr/src/app/media/channel-id"
    }
  ],
  "auto_restart": true,
  "pid": 12346,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**
- `404`: Canal no encontrado

#### GET /api/channels/:id/status

Obtiene el estado en tiempo real de un canal.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "channel": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "HBO Latino HD",
    "status": "running",
    "input_url": "udp://@239.1.1.1:5000",
    "ffmpeg_params": {
      "video_codec": "libx264",
      "audio_codec": "aac"
    },
    "outputs": [
      {
        "type": "hls",
        "path": "/usr/src/app/media/channel-id"
      }
    ],
    "auto_restart": true,
    "pid": 12345,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "isRunning": true,
  "processInfo": {
    "pid": 12345,
    "cpu": 15.5,
    "memory": 256.8
  }
}
```

#### GET /api/channels/:id/logs

Obtiene los logs de un canal con paginación.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (opcional): Número de logs a retornar (default: 100)
- `offset` (opcional): Número de logs a saltar (default: 0)
- `level` (opcional): Filtrar por nivel (info, warning, error)

**Ejemplo:**
```
GET /api/channels/:id/logs?limit=50&offset=0&level=error
```

**Response (200 OK):**
```json
{
  "logs": [
    {
      "id": 1,
      "channel_id": "550e8400-e29b-41d4-a716-446655440000",
      "level": "info",
      "message": "Stream iniciado correctamente",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### DELETE /api/channels/:id/logs

Elimina todos los logs de un canal.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Errores:**
- `404`: Canal no encontrado

#### GET /api/channels/:id/stats

Obtiene estadísticas completas de un canal.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "channel": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "HBO Latino HD",
    "status": "running",
    "input_url": "udp://@239.1.1.1:5000",
    "ffmpeg_params": {
      "video_codec": "libx264",
      "audio_codec": "aac"
    },
    "outputs": [
      {
        "type": "hls",
        "path": "/usr/src/app/media/channel-id"
      }
    ],
    "auto_restart": true,
    "pid": 12345,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "logs": {
    "total": 150,
    "byLevel": {
      "info": 120,
      "warning": 20,
      "error": 10
    }
  },
  "process": {
    "pid": 12345,
    "cpu": 15.5,
    "memory": 256.8
  }
}
```

---

## 📊 Modelos de Datos

### User (Usuario)

```typescript
interface User {
  id: string;              // UUID
  username: string;         // Nombre de usuario único
  password_hash: string;     // Hash de contraseña (no se expone en API)
  created_at: string;       // ISO 8601 timestamp
  updated_at: string;       // ISO 8601 timestamp
}

// En respuestas API, password_hash no se incluye
interface UserResponse {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}
```

### Channel (Canal)

```typescript
interface Channel {
  id: string;                    // UUID
  name: string;                   // Nombre del canal
  status: 'running' | 'stopped' | 'error' | 'restarting';
  input_url: string;              // URL de entrada (UDP, HTTP, etc.)
  ffmpeg_params: {                // Parámetros FFmpeg
    [key: string]: any;
  };
  outputs: Output[];              // Array de salidas
  auto_restart: boolean;          // Reinicio automático
  pid: number | null;             // Process ID si está corriendo
  created_at: string;             // ISO 8601 timestamp
  updated_at: string;             // ISO 8601 timestamp
}

interface Output {
  type: 'hls' | 'udp' | 'dvb';
  [key: string]: any;             // Parámetros específicos del tipo
}
```

### ChannelLog (Log de Canal)

```typescript
interface ChannelLog {
  id: number;
  channel_id: string;             // UUID del canal
  level: 'info' | 'warning' | 'error';
  message: string;
  created_at: string;             // ISO 8601 timestamp
}
```

---

## 🔧 Configuración

### Variables de Entorno

- `PORT`: Puerto del servidor (default: 3000)
- `DB_HOST`: Host de PostgreSQL (default: localhost)
- `DB_PORT`: Puerto de PostgreSQL (default: 5432)
- `POSTGRES_USER`: Usuario de PostgreSQL
- `POSTGRES_PASSWORD`: Contraseña de PostgreSQL
- `POSTGRES_DB`: Nombre de la base de datos
- `MEDIA_BASE_PATH`: Ruta base para archivos de media (default: /usr/src/app/media)
- `FFMPEG_PATH`: Ruta al ejecutable FFmpeg (default: ffmpeg)
- `HEALTH_CHECK_INTERVAL`: Intervalo de health checks en ms (default: 30000)
- `MAX_LOG_ENTRIES_PER_CHANNEL`: Máximo de logs por canal (default: 1000)
- `JWT_SECRET`: Secreto para firmar tokens JWT (default: 'atlas_secret_key_change_in_production')
- `JWT_EXIRES_IN`: Tiempo de expiración del token (default: '24h')

### Health Check

El servidor expone un endpoint de health check:

**GET /health**

**Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "Error message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 📊 Tipos de Streams Soportados

### UDP
```json
{
  "type": "udp",
  "host": "192.168.1.100",
  "port": 5000,
  "pkt_size": 1316,
  "buffer_size": 65536,
  "hls_program_index": 2,
  "map_video": true,
  "map_audio": true
}
```

**Parámetros:**
- `host` (requerido): Dirección IP de destino
- `port` (requerido): Puerto UDP de destino
- `pkt_size` (opcional): Tamaño del paquete UDP en bytes (default: sin especificar)
- `buffer_size` (opcional): Tamaño del buffer UDP en bytes (default: sin especificar)
- `hls_program_index` (opcional): Índice del programa/variante HLS a seleccionar cuando el input tiene múltiples programas (0, 1, 2, etc.)
- `map_video` (opcional): Mapear stream de video explícitamente (default: true)
- `map_audio` (opcional): Mapear stream de audio explícitamente (default: true)
- `realtime` (opcional): Usar `-re` para streaming en tiempo real (default: automático - desactivado para HLS, activado para archivos locales)

**Parámetros adicionales en `ffmpeg_params`:**
- `muxrate` (opcional): Tasa de multiplexación para MPEG-TS en bps (default: calculado automáticamente o 10 Mbps)

**Nota importante:** 
- Para que el video funcione correctamente en UDP, se recomienda especificar codecs de transcodificación en `ffmpeg_params` (ej: `libx264` para video y `aac` para audio).
- El parámetro `-re` se desactiva automáticamente para inputs HLS (`.m3u8`, `http://`, `https://`) ya que causa retraso en streams en vivo. Para archivos locales, se activa automáticamente.
- Puedes forzar el comportamiento con `realtime: true` o `realtime: false`.
- El sistema incluye `-muxrate` y `-flush_packets` para compatibilidad con VLC y otros reproductores.

**Reproducir en VLC:**
1. Abre VLC
2. Ve a `Medio` → `Abrir flujo de red`
3. Ingresa: `udp://@:5000` (reemplaza 5000 con el puerto configurado)
4. O desde la línea de comandos: `vlc udp://@:5000`

### HLS
```json
{
  "type": "hls",
  "hls_time": 2,
  "hls_list_size": 5
}
```

### DVB
```json
{
  "type": "dvb",
  "dvb_device": "/dev/dvb/adapter0/frontend0",
  "dvb_frequency": 498000000
}
```

---

## 🏥 Health Checks

El sistema incluye monitoreo automático que:
- Verifica periódicamente el estado de los procesos FFmpeg
- Detecta procesos zombie o colgados
- Reinicia automáticamente streams con `auto_restart: true`
- Actualiza el estado en la base de datos

---

## 📝 Logs

Los logs de FFmpeg se capturan automáticamente y se almacenan en PostgreSQL:
- Acceso mediante `GET /api/channels/:id/logs`
- Rotación automática cuando se excede el límite
- Filtrado por nivel (info, warning, error)

---

## 🐳 Docker

El proyecto está completamente dockerizado con:
- Servicio de aplicación Node.js
- Servicio PostgreSQL 15
- Servicio Nginx para frontend
- Volúmenes persistentes para datos y media
- Inicialización automática de base de datos

---

## 🔐 Autenticación JWT

### Flujo de Autenticación

1. **Login**: El cliente envía username y password a `/api/auth/login`
2. **Token**: El servidor responde con un token JWT
3. **Peticiones**: El cliente incluye el token en el header `Authorization: Bearer <token>`
4. **Validación**: El servidor valida el token en cada petición protegida
5. **Expiración**: Los tokens expiran después de 24 horas (configurable)

### Ejemplo de Uso en Angular

```typescript
// Servicio de autenticación
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api';
  
  constructor(private http: HttpClient) {}
  
  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, {
      username,
      password
    });
  }
  
  getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }
}

// Interceptor para agregar token automáticamente
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = localStorage.getItem('token');
    
    if (token) {
      const cloned = req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`)
      });
      return next.handle(cloned);
    }
    
    return next.handle(req);
  }
}
```

---

## ⚠️ Manejo de Errores

El servidor retorna errores en formato JSON:

```json
{
  "error": "Mensaje de error descriptivo"
}
```

### Códigos de Estado HTTP

- `200 OK`: Petición exitosa
- `201 Created`: Recurso creado exitosamente
- `204 No Content`: Operación exitosa sin contenido
- `400 Bad Request`: Datos inválidos o faltantes
- `401 Unauthorized`: No autenticado o token inválido
- `404 Not Found`: Recurso no encontrado
- `409 Conflict`: Conflicto (ej: usuario ya existe)
- `500 Internal Server Error`: Error del servidor
- `503 Service Unavailable`: Servicio no disponible (BD desconectada)

### Ejemplo de Manejo de Errores en Angular

```typescript
this.authService.login(username, password).subscribe({
  next: (response) => {
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    this.router.navigate(['/dashboard']);
  },
  error: (error) => {
    if (error.status === 401) {
      this.errorMessage = 'Credenciales inválidas';
    } else if (error.status === 400) {
      this.errorMessage = error.error.error || 'Datos inválidos';
    } else {
      this.errorMessage = 'Error del servidor';
    }
  }
});
```

---

## 🛠️ Desarrollo

### Estructura de Directorios

```
atlas/
├── config/          # Configuración
├── lib/             # Utilidades de BD
├── utils/           # Utilidades generales
├── models/          # Modelos de datos
├── repositories/    # Acceso a datos
├── services/        # Lógica de negocio
├── managers/        # Gestión de procesos
├── builders/        # Construcción de comandos
├── controllers/     # Controladores API
├── routes/          # Rutas REST
├── middleware/      # Middleware Express
└── scripts/         # Scripts de utilidad
```

### CORS

El servidor tiene CORS habilitado por defecto. Para desarrollo local de Angular, asegúrate de configurar el proxy o usar la URL completa del backend.

**Ejemplo de proxy en Angular (proxy.conf.json):**
```json
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "changeOrigin": true
  }
}
```

Luego en `angular.json`:
```json
"serve": {
  "options": {
    "proxyConfig": "proxy.conf.json"
  }
}
```

---

## 📄 Licencia

ISC

## 👥 Autor

Atlas Media Server Team
