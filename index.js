const express = require('express');
const path = require('path');
const fs = require('fs');
const serviceRegistry = require('nooblyjs-core');

const app = express();

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Initialize Nooblyjs-core services
serviceRegistry.initialize(app, null, {
  logDir: path.join(__dirname, '.noobly-core', 'logs'),
  dataDir: path.join(__dirname, '.noobly-core', 'data'),
  requireApiKey: false
});

// Get services
const authservice = serviceRegistry.authservice('file', {
  dataDir: path.join(__dirname, '.noobly-core', 'data', 'auth')
});

const dataService = serviceRegistry.dataService('file', {
  dataDir: path.join(__dirname, '.noobly-core', 'data')
});

const logger = serviceRegistry.logger('file', {
  logDir: path.join(__dirname, '.noobly-core', 'logs'),
  filename: 'cms.log'
});

const filing = serviceRegistry.filing('local', {
  dataDir: path.join(__dirname, 'public', 'uploads')
});

const caching = serviceRegistry.cache('memory');

// Authentication middleware - Check for valid session token
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token || req.body.token;

    if (!token) {
      // If it's an API request, return JSON error
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'No authentication token provided' });
      }
      // For page requests, redirect to login
      return res.redirect('/auth/login');
    }

    // Validate session token with authservice
    const session = await authservice.validateSession(token);
    if (!session) {
      // If it's an API request, return JSON error
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      // For page requests, redirect to login
      return res.redirect('/auth/login');
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (error) {
    logger.error('Authentication error', error);
    // If it's an API request, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
    // For page requests, redirect to login
    res.redirect('/auth/login');
  }
};

// Create directories if they don't exist
const dirs = [
  path.join(__dirname, '.noobly-core', 'logs'),
  path.join(__dirname, '.noobly-core', 'data'),
  path.join(__dirname, '.noobly-core', 'data', 'auth'),
  path.join(__dirname, 'public', 'uploads'),
  path.join(__dirname, 'sites', 'published'),
  path.join(__dirname, 'sites', 'unpublished')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Routes
const authRoutes = require('./src/routes/auth')(authservice, logger);
const siteRoutes = require('./src/routes/sites')(dataService, filing, logger, path);
const pageRoutes = require('./src/routes/pages')(dataService, logger);
const mediaRoutes = require('./src/routes/media')(filing, dataService, logger);
const publishRoutes = require('./src/routes/publish')(dataService, logger, path);

// Mount routes
app.use('/auth', authRoutes);
app.use('/api/sites', requireAuth, siteRoutes);
app.use('/api/pages', requireAuth, pageRoutes);
app.use('/api/media', requireAuth, mediaRoutes);
app.use('/api/publish', requireAuth, publishRoutes);

// Dashboard and main views (authentication checked client-side)
app.get('/', (req, res) => {
  res.render('dashboard');
});

app.get('/builder/:siteId', (req, res) => {
  res.render('builder', { siteId: req.params.siteId });
});

app.get('/sites', (req, res) => {
  res.render('sites');
});

app.get('/auth/login', (req, res) => {
  res.render('login', { message: req.query.message || '' });
});

app.get('/auth/register', (req, res) => {
  res.render('register', { message: req.query.message || '' });
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.redirect('/auth/login');
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Application error', err);
  res.status(500).render('error', { error: err.message });
});

// Start server
app.listen(process.env.PORT || 3004, () => {
  logger.info(`CMS application started on port ${process.env.PORT || 3004}`);
  console.log(`🚀 CMS application running at http://localhost:${process.env.PORT || 3004}`);
});

module.exports = app;
