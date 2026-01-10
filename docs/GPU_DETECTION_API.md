# API de Detección de GPUs para FFmpeg

## Descripción General

Esta API permite detectar las tarjetas de video disponibles en el sistema y especificar qué GPU usar para la aceleración por hardware en FFmpeg. Soporta múltiples tipos de aceleración: NVIDIA NVENC, VAAPI (Intel/AMD), Intel QSV y VideoToolbox (macOS).

## Endpoint: Obtener GPUs Disponibles

### `GET /api/hardware/gpus`

Obtiene la lista de todas las tarjetas de video disponibles en el sistema con sus índices y características.

#### Respuesta Exitosa (200 OK)

```json
{
  "gpus": [
    {
      "type": "nvenc",
      "index": 0,
      "name": "NVIDIA GeForce RTX 3080",
      "available": true
    },
    {
      "type": "nvenc",
      "index": 1,
      "name": "NVIDIA GeForce RTX 3090",
      "available": true
    },
    {
      "type": "vaapi",
      "index": 0,
      "name": "Intel UHD Graphics 630",
      "device": "/dev/dri/renderD128",
      "available": true
    },
    {
      "type": "vaapi",
      "index": 1,
      "name": "AMD Radeon RX 6800",
      "device": "/dev/dri/renderD129",
      "available": true
    },
    {
      "type": "qsv",
      "index": 0,
      "name": "Intel Quick Sync Video",
      "available": true
    },
    {
      "type": "videotoolbox",
      "index": 0,
      "name": "VideoToolbox (macOS)",
      "available": true
    }
  ],
  "total": 6,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Campos de la Respuesta

- `gpus`: Array de objetos GPU detectados
  - `type`: Tipo de aceleración (`nvenc`, `vaapi`, `qsv`, `videotoolbox`)
  - `index`: Índice numérico de la GPU (0, 1, 2, etc.)
  - `name`: Nombre descriptivo de la GPU
  - `device`: Ruta del dispositivo (solo para VAAPI)
  - `available`: Boolean indicando si la GPU está disponible para uso
- `total`: Número total de GPUs detectadas
- `timestamp`: Fecha y hora de la detección

#### Tipos de GPU

1. **nvenc**: GPUs NVIDIA con soporte NVENC
2. **vaapi**: Dispositivos VAAPI (Intel/AMD en Linux)
3. **qsv**: Intel Quick Sync Video
4. **videotoolbox**: VideoToolbox (solo macOS)

#### Ejemplo de Uso (JavaScript/Fetch)

```javascript
async function obtenerGPUs() {
  try {
    const response = await fetch('/api/hardware/gpus');
    const data = await response.json();
    
    console.log(`Se encontraron ${data.total} GPUs:`);
    data.gpus.forEach(gpu => {
      console.log(`- ${gpu.name} (${gpu.type}, índice: ${gpu.index})`);
    });
    
    return data.gpus;
  } catch (error) {
    console.error('Error obteniendo GPUs:', error);
    return [];
  }
}
```

#### Ejemplo de Uso (Axios)

```javascript
import axios from 'axios';

async function obtenerGPUs() {
  try {
    const response = await axios.get('/api/hardware/gpus');
    return response.data.gpus;
  } catch (error) {
    console.error('Error obteniendo GPUs:', error);
    return [];
  }
}
```

## Especificar GPU en un Canal

Para usar una GPU específica en un canal, debes incluir el parámetro `gpu_index` en `ffmpeg_params` al crear o actualizar un canal.

### Parámetro `gpu_index`

- **Tipo**: `number` (entero)
- **Requerido**: No (opcional)
- **Descripción**: Índice de la GPU a usar para aceleración por hardware
- **Valor por defecto**: Si no se especifica, se usa la GPU por defecto del sistema

### Uso en Creación de Canal

#### Ejemplo: Canal con GPU NVIDIA (NVENC)

```json
POST /api/channels
{
  "name": "Mi Canal",
  "input_url": "rtmp://example.com/stream",
  "ffmpeg_params": {
    "video_codec": "h264_nvenc",
    "gpu_index": 0,
    "audio_codec": "aac",
    "video_bitrate": "5000k"
  },
  "outputs": [
    {
      "type": "hls"
    }
  ]
}
```

#### Ejemplo: Canal con GPU VAAPI (Intel/AMD)

```json
POST /api/channels
{
  "name": "Mi Canal VAAPI",
  "input_url": "rtmp://example.com/stream",
  "ffmpeg_params": {
    "video_codec": "h264_vaapi",
    "gpu_index": 0,
    "audio_codec": "aac",
    "video_bitrate": "5000k"
  },
  "outputs": [
    {
      "type": "hls"
    }
  ]
}
```

#### Ejemplo: Canal con Segunda GPU NVIDIA

```json
POST /api/channels
{
  "name": "Canal GPU 1",
  "input_url": "rtmp://example.com/stream",
  "ffmpeg_params": {
    "video_codec": "h264_nvenc",
    "gpu_index": 1,
    "audio_codec": "aac",
    "video_bitrate": "5000k"
  },
  "outputs": [
    {
      "type": "udp",
      "host": "192.168.1.100",
      "port": 5000
    }
  ]
}
```

### Uso en Actualización de Canal

```json
PUT /api/channels/{id}
{
  "ffmpeg_params": {
    "video_codec": "h264_nvenc",
    "gpu_index": 1,
    "audio_codec": "aac"
  }
}
```

## Componente React de Ejemplo

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function GPUSelector({ value, onChange }) {
  const [gpus, setGpus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGPUs() {
      try {
        const response = await axios.get('/api/hardware/gpus');
        setGpus(response.data.gpus);
      } catch (error) {
        console.error('Error obteniendo GPUs:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchGPUs();
  }, []);

  if (loading) {
    return <div>Cargando GPUs...</div>;
  }

  // Agrupar GPUs por tipo
  const gpusByType = gpus.reduce((acc, gpu) => {
    if (!acc[gpu.type]) {
      acc[gpu.type] = [];
    }
    acc[gpu.type].push(gpu);
    return acc;
  }, {});

  return (
    <div>
      <label htmlFor="gpu-select">GPU para aceleración por hardware:</label>
      <select
        id="gpu-select"
        value={value !== undefined ? value : ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : undefined)}
      >
        <option value="">Automático (usar GPU por defecto)</option>
        {Object.entries(gpusByType).map(([type, typeGpus]) => (
          <optgroup key={type} label={type.toUpperCase()}>
            {typeGpus.map((gpu) => (
              <option key={`${gpu.type}-${gpu.index}`} value={gpu.index}>
                {gpu.name} (Índice: {gpu.index})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {value !== undefined && (
        <div className="gpu-info">
          {(() => {
            const selectedGpu = gpus.find(
              (gpu) => gpu.index === value
            );
            return selectedGpu ? (
              <small>
                GPU seleccionada: {selectedGpu.name} ({selectedGpu.type})
              </small>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

export default GPUSelector;
```

## Consideraciones Importantes

### 1. Compatibilidad con Código Existente

- El parámetro `gpu_index` es **opcional**
- Si no se especifica, el sistema usa la GPU por defecto (comportamiento anterior)
- Los canales existentes sin `gpu_index` seguirán funcionando normalmente

### 2. Validación de Índices

- El sistema **no valida** automáticamente que el índice especificado existe
- Es responsabilidad del frontend validar que el índice existe antes de enviarlo
- Si se especifica un índice inválido, FFmpeg puede fallar o usar la GPU por defecto

### 3. Cache de Detección

- Los resultados de detección se cachean por 60 segundos
- Para obtener resultados actualizados, espera al menos 60 segundos entre llamadas
- El cache se puede limpiar reiniciando el servidor

### 4. Tipos de Codec y GPU

- **NVENC**: Requiere `video_codec` con `h264_nvenc` o `hevc_nvenc`
- **VAAPI**: Requiere `video_codec` con `h264_vaapi` o `hevc_vaapi`
- **QSV**: Requiere `video_codec` con `h264_qsv` o `hevc_qsv`
- **VideoToolbox**: Requiere `video_codec` con `h264_videotoolbox` o `hevc_videotoolbox`

### 5. Múltiples GPUs del Mismo Tipo

Si hay múltiples GPUs del mismo tipo (ej: 2 GPUs NVIDIA), puedes especificar cuál usar con `gpu_index`:
- `gpu_index: 0` → Primera GPU
- `gpu_index: 1` → Segunda GPU
- etc.

### 6. Dispositivos VAAPI

Para VAAPI, el sistema mapea automáticamente el índice al dispositivo correcto:
- Índice 0 → `/dev/dri/renderD128`
- Índice 1 → `/dev/dri/renderD129`
- etc.

## Flujo de Trabajo Recomendado

1. **Al cargar el formulario de canal:**
   - Llamar a `GET /api/hardware/gpus` para obtener GPUs disponibles
   - Mostrar selector de GPU en el formulario

2. **Al seleccionar codec de hardware:**
   - Si el usuario selecciona un codec acelerado (ej: `h264_nvenc`), mostrar selector de GPU
   - Filtrar GPUs por tipo según el codec seleccionado

3. **Al crear/actualizar canal:**
   - Incluir `gpu_index` en `ffmpeg_params` si se seleccionó una GPU específica
   - Si no se selecciona GPU, omitir el parámetro para usar la GPU por defecto

## Ejemplo Completo de Formulario

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ChannelForm() {
  const [gpus, setGpus] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    input_url: '',
    video_codec: 'copy',
    gpu_index: undefined,
    audio_codec: 'copy'
  });

  useEffect(() => {
    // Cargar GPUs disponibles
    axios.get('/api/hardware/gpus')
      .then(response => setGpus(response.data.gpus))
      .catch(error => console.error('Error:', error));
  }, []);

  // Filtrar GPUs según el codec seleccionado
  const availableGPUs = gpus.filter(gpu => {
    if (formData.video_codec.includes('nvenc')) {
      return gpu.type === 'nvenc';
    } else if (formData.video_codec.includes('vaapi')) {
      return gpu.type === 'vaapi';
    } else if (formData.video_codec.includes('qsv')) {
      return gpu.type === 'qsv';
    } else if (formData.video_codec.includes('videotoolbox')) {
      return gpu.type === 'videotoolbox';
    }
    return false;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const channelData = {
      name: formData.name,
      input_url: formData.input_url,
      ffmpeg_params: {
        video_codec: formData.video_codec,
        audio_codec: formData.audio_codec,
        ...(formData.gpu_index !== undefined && { gpu_index: formData.gpu_index })
      },
      outputs: [{ type: 'hls' }]
    };

    try {
      await axios.post('/api/channels', channelData);
      alert('Canal creado exitosamente');
    } catch (error) {
      console.error('Error creando canal:', error);
      alert('Error al crear el canal');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Nombre del Canal:</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label>URL de Entrada:</label>
        <input
          type="text"
          value={formData.input_url}
          onChange={(e) => setFormData({ ...formData, input_url: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Codec de Video:</label>
        <select
          value={formData.video_codec}
          onChange={(e) => {
            setFormData({ 
              ...formData, 
              video_codec: e.target.value,
              gpu_index: undefined // Resetear GPU al cambiar codec
            });
          }}
        >
          <option value="copy">Copy (sin transcodificación)</option>
          <option value="libx264">H.264 (Software)</option>
          <option value="h264_nvenc">H.264 NVENC (NVIDIA)</option>
          <option value="h264_vaapi">H.264 VAAPI (Intel/AMD)</option>
          <option value="h264_qsv">H.264 QSV (Intel)</option>
          <option value="h264_videotoolbox">H.264 VideoToolbox (macOS)</option>
        </select>
      </div>

      {availableGPUs.length > 0 && (
        <div>
          <label>GPU (Opcional):</label>
          <select
            value={formData.gpu_index !== undefined ? formData.gpu_index : ''}
            onChange={(e) => setFormData({ 
              ...formData, 
              gpu_index: e.target.value ? parseInt(e.target.value) : undefined 
            })}
          >
            <option value="">Automático (GPU por defecto)</option>
            {availableGPUs.map((gpu) => (
              <option key={`${gpu.type}-${gpu.index}`} value={gpu.index}>
                {gpu.name} (Índice: {gpu.index})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label>Codec de Audio:</label>
        <select
          value={formData.audio_codec}
          onChange={(e) => setFormData({ ...formData, audio_codec: e.target.value })}
        >
          <option value="copy">Copy</option>
          <option value="aac">AAC</option>
        </select>
      </div>

      <button type="submit">Crear Canal</button>
    </form>
  );
}

export default ChannelForm;
```

## Manejo de Errores

### Error al Obtener GPUs

```javascript
try {
  const response = await fetch('/api/hardware/gpus');
  if (!response.ok) {
    throw new Error(`Error HTTP: ${response.status}`);
  }
  const data = await response.json();
  return data.gpus;
} catch (error) {
  console.error('Error obteniendo GPUs:', error);
  // Mostrar mensaje al usuario o usar valores por defecto
  return [];
}
```

### Validación de GPU Seleccionada

```javascript
function validateGPUIndex(gpuIndex, videoCodec, availableGPUs) {
  if (gpuIndex === undefined) {
    return { valid: true }; // GPU opcional
  }

  const compatibleGPUs = availableGPUs.filter(gpu => {
    if (videoCodec.includes('nvenc')) return gpu.type === 'nvenc';
    if (videoCodec.includes('vaapi')) return gpu.type === 'vaapi';
    if (videoCodec.includes('qsv')) return gpu.type === 'qsv';
    if (videoCodec.includes('videotoolbox')) return gpu.type === 'videotoolbox';
    return false;
  });

  const isValid = compatibleGPUs.some(gpu => gpu.index === gpuIndex);
  
  return {
    valid: isValid,
    message: isValid 
      ? null 
      : `El índice de GPU ${gpuIndex} no es compatible con el codec ${videoCodec}`
  };
}
```

## Notas Adicionales

- El endpoint de GPUs puede tardar unos segundos en responder la primera vez (detección inicial)
- Las GPUs se detectan automáticamente al iniciar el servidor
- Si no hay GPUs disponibles, el array `gpus` estará vacío
- El sistema intenta usar aceleración por hardware automáticamente si está disponible, incluso sin especificar `gpu_index`
