const authService = require('../services/AuthService');
const logger = require('../utils/logger');

class AuthController {
    /**
     * Inicia sesión
     */
    async login(req, res, next) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    error: 'Nombre de usuario y contraseña son requeridos'
                });
            }

            const result = await authService.login(username, password);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Registra un nuevo usuario
     */
    async register(req, res, next) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    error: 'Nombre de usuario y contraseña son requeridos'
                });
            }

            const user = await authService.register(username, password);
            res.status(201).json(user);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Obtiene el perfil del usuario autenticado
     */
    async getProfile(req, res, next) {
        try {
            const user = await authService.getUserById(req.user.id);
            res.json(user);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Cambia la contraseña del usuario autenticado
     */
    async changePassword(req, res, next) {
        try {
            const { oldPassword, newPassword } = req.body;

            if (!oldPassword || !newPassword) {
                return res.status(400).json({
                    error: 'Contraseña actual y nueva contraseña son requeridas'
                });
            }

            await authService.changePassword(req.user.id, oldPassword, newPassword);
            res.json({ message: 'Contraseña actualizada exitosamente' });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Lista todos los usuarios (solo para administradores)
     */
    async listUsers(req, res, next) {
        try {
            const users = await authService.getAllUsers();
            res.json(users);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Obtiene un usuario por ID
     */
    async getUser(req, res, next) {
        try {
            const user = await authService.getUserById(req.params.id);
            res.json(user);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Elimina un usuario
     */
    async deleteUser(req, res, next) {
        try {
            await authService.deleteUser(req.params.id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();

