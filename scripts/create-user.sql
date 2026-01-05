-- Script para crear el usuario inicial en la tabla users
-- Este script asume que la tabla users ya existe

-- Crear el usuario inicial 'atlas' con contraseña 'atlas123$'
-- Nota: El hash debe generarse con bcrypt, pero aquí está un hash de ejemplo
-- Para generar el hash correcto, ejecutar: node -e "const bcrypt = require('bcrypt'); bcrypt.hash('atlas123$', 10).then(h => console.log(h));"

-- Primero verificar si la tabla existe, si no, crearla
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índice si no existe
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Insertar usuario solo si no existe
-- IMPORTANTE: Este hash es un ejemplo, debe generarse con bcrypt
-- Para obtener el hash correcto, ejecutar el script create-user.js
INSERT INTO users (username, password_hash)
SELECT 'atlas', '$2b$10$placeholder_hash_here'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'atlas');

