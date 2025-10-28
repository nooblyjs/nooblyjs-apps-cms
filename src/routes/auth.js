const express = require('express');

module.exports = (authservice, logger) => {
  const router = express.Router();

  // POST /auth/register - Create new user
  router.post('/register', async (req, res) => {
    try {
      const { username, email, password, confirmPassword } = req.body;

      // Validation
      if (!username || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Check if user already exists
      const existingUser = await authservice.getUser(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Create user using authservice
      const user = await authservice.createUser({
        username,
        email,
        password,
        role: 'user'
      });

      logger.info('User registered', { username, userId: user.id });

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please login.',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      logger.error('Registration error', error);
      res.status(500).json({ error: error.message || 'Registration failed' });
    }
  });

  // POST /auth/login - Authenticate user
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      // Authenticate using authservice
      const result = await authservice.authenticateUser(username, password);

      if (!result || !result.user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      logger.info('User logged in', { username, userId: result.user.id });

      res.json({
        success: true,
        message: 'Login successful',
        user: result.user,
        session: result.session
      });
    } catch (error) {
      logger.error('Login error', error);
      res.status(500).json({ error: error.message || 'Login failed' });
    }
  });

  // GET /auth/user/:username - Get user by username
  router.get('/user/:username', async (req, res) => {
    try {
      const user = await authservice.getUser(req.params.username);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      logger.error('Error getting user', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // POST /auth/logout - Logout user
  router.post('/logout', async (req, res) => {
    try {
      const token = req.body.token;

      if (token) {
        await authservice.logout(token);
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error', error);
      res.status(500).json({ error: error.message || 'Logout failed' });
    }
  });

  return router;
};
