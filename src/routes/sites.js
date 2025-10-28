const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

module.exports = (dataService, filing, logger, path) => {
  const router = express.Router();

  // GET /api/sites - List all sites for user
  router.get('/', async (req, res) => {
    try {
      const userId = req.user.id;
      const sites = await dataService.jsonFindByCriteria('sites', { ownerId: userId });
      res.json(sites);
    } catch (error) {
      logger.error('Error fetching sites', error);
      res.status(500).json({ error: 'Failed to fetch sites' });
    }
  });

  // POST /api/sites - Create new site
  router.post('/', async (req, res) => {
    try {
      const { name, title, description } = req.body;
      const userId = req.user.id;

      if (!name || !title) {
        return res.status(400).json({ error: 'Name and title are required' });
      }

      // Create site object
      const siteId = uuidv4();
      const site = {
        id: siteId,
        name: name.toLowerCase().replace(/\s+/g, '-'),
        title,
        description,
        ownerId: userId,
        status: 'unpublished',
        pages: [],
        settings: {
          favicon: '',
          logo: '',
          colors: {
            primary: '#007bff',
            secondary: '#6c757d'
          },
          fonts: {
            heading: 'sans-serif',
            body: 'sans-serif'
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save site to dataservice
      const siteUuid = await dataService.add('sites', site);

      // Create unpublished folder
      const siteFolder = path.join(__dirname, '..', '..', 'sites', 'unpublished', site.name);
      if (!fs.existsSync(siteFolder)) {
        fs.mkdirSync(siteFolder, { recursive: true });
      }

      // Create index.html template
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
  <style>
    body {
      font-family: ${site.settings.fonts.body};
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: ${site.settings.fonts.heading};
    }
  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-light bg-light">
    <div class="container">
      <a class="navbar-brand" href="#">${title}</a>
    </div>
  </nav>
  <main class="container my-5">
    <h1>Welcome to ${title}</h1>
    <p>Your site is ready to be customized. Start building!</p>
  </main>
  <footer class="bg-light py-4 text-center">
    <p class="text-muted">&copy; 2024 ${title}. All rights reserved.</p>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;

      fs.writeFileSync(path.join(siteFolder, 'index.html'), indexHtml);

      // Update user's sites list
      const user = await dataService.getByUuid('users', userId);
      user.sites = user.sites || [];
      user.sites.push(siteId);
      await dataService.remove('users', userId);
      user.id = userId;
      await dataService.add('users', user);

      logger.info('Site created', { siteId, siteName: site.name, userId });

      res.status(201).json({
        success: true,
        site: {
          id: siteId,
          ...site,
          siteUuid
        }
      });
    } catch (error) {
      logger.error('Error creating site', error);
      res.status(500).json({ error: 'Failed to create site' });
    }
  });

  // GET /api/sites/:siteId - Get single site
  router.get('/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;
      const site = await dataService.getByUuid('sites', siteId);

      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(site);
    } catch (error) {
      logger.error('Error fetching site', error);
      res.status(500).json({ error: 'Failed to fetch site' });
    }
  });

  // PUT /api/sites/:siteId - Update site
  router.put('/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;
      const { title, description, settings } = req.body;

      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (title) site.title = title;
      if (description) site.description = description;
      if (settings) site.settings = { ...site.settings, ...settings };
      site.updatedAt = new Date().toISOString();

      await dataService.remove('sites', siteId);
      site.id = siteId;
      await dataService.add('sites', site);

      logger.info('Site updated', { siteId });
      res.json({ success: true, site });
    } catch (error) {
      logger.error('Error updating site', error);
      res.status(500).json({ error: 'Failed to update site' });
    }
  });

  // DELETE /api/sites/:siteId - Delete site
  router.delete('/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;
      const site = await dataService.getByUuid('sites', siteId);

      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Delete site folder
      const siteFolder = path.join(
        __dirname, '..', '..', 'sites',
        site.status === 'published' ? 'published' : 'unpublished',
        site.name
      );
      if (fs.existsSync(siteFolder)) {
        fs.rmSync(siteFolder, { recursive: true, force: true });
      }

      // Remove from dataservice
      await dataService.remove('sites', siteId);

      // Update user's sites list
      const user = await dataService.getByUuid('users', req.user.id);
      user.sites = (user.sites || []).filter(id => id !== siteId);
      await dataService.remove('users', req.user.id);
      user.id = req.user.id;
      await dataService.add('users', user);

      logger.info('Site deleted', { siteId });
      res.json({ success: true, message: 'Site deleted' });
    } catch (error) {
      logger.error('Error deleting site', error);
      res.status(500).json({ error: 'Failed to delete site' });
    }
  });

  return router;
};
