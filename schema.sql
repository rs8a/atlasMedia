-- Esquema de base de datos para Atlas Media Server

-- Tabla de canales
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'stopped',
    input_url TEXT NOT NULL,
    ffmpeg_params JSONB DEFAULT '{}',
    outputs JSONB NOT NULL DEFAULT '[]',
    auto_restart BOOLEAN DEFAULT true,
    pid INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);
CREATE INDEX IF NOT EXISTS idx_channels_pid ON channels(pid);
CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels(created_at);

-- Tabla de logs de canales
CREATE TABLE IF NOT EXISTS channel_logs (
    id SERIAL PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para logs
CREATE INDEX IF NOT EXISTS idx_channel_logs_channel_id ON channel_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_logs_created_at ON channel_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_channel_logs_level ON channel_logs(level);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para usuarios
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Trigger para actualizar updated_at en usuarios
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

