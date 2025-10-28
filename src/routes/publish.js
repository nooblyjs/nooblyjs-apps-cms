const express = require('express');
const fs = require('fs');

module.exports = (dataService, logger, path) => {
  const router = express.Router();

  // POST /api/publish/:siteId - Publish site
  router.post('/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;
      const userId = req.user.id;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get all pages for site
      const pages = await dataService.jsonFindByCriteria('pages', { siteId });

      // Get all media for site
      const media = await dataService.jsonFindByCriteria('media', { siteId });

      // Build HTML
      const html = buildSiteHTML(site, pages, media);

      // Create published folder
      const publishedFolder = path.join(
        __dirname, '..', '..', 'sites', 'published', site.name
      );
      if (!fs.existsSync(publishedFolder)) {
        fs.mkdirSync(publishedFolder, { recursive: true });
      }

      // Write index.html
      fs.writeFileSync(path.join(publishedFolder, 'index.html'), html);

      // Copy media files
      const siteMediaFolder = path.join(
        __dirname, '..', '..', 'public', 'uploads', siteId
      );
      if (fs.existsSync(siteMediaFolder)) {
        const mediaFolder = path.join(publishedFolder, 'media');
        if (!fs.existsSync(mediaFolder)) {
          fs.mkdirSync(mediaFolder, { recursive: true });
        }

        const files = fs.readdirSync(siteMediaFolder);
        files.forEach(file => {
          const src = path.join(siteMediaFolder, file);
          const dst = path.join(mediaFolder, file);
          fs.copyFileSync(src, dst);
        });
      }

      // Update site status
      site.status = 'published';
      site.publishedAt = new Date().toISOString();
      site.updatedAt = new Date().toISOString();

      await dataService.remove('sites', siteId);
      site.id = siteId;
      await dataService.add('sites', site);

      // Update all pages to published
      for (const page of pages) {
        page.status = 'published';
        page.publishedAt = new Date().toISOString();
        await dataService.remove('pages', page.id);
        page.id = page.id;
        await dataService.add('pages', page);
      }

      logger.info('Site published', { siteId, siteName: site.name });

      res.json({
        success: true,
        message: 'Site published successfully',
        site: {
          id: siteId,
          name: site.name,
          status: 'published',
          url: `/sites/published/${site.name}`
        }
      });
    } catch (error) {
      logger.error('Error publishing site', error);
      res.status(500).json({ error: 'Failed to publish site' });
    }
  });

  // POST /api/publish/:siteId/unpublish - Unpublish site
  router.post('/:siteId/unpublish', async (req, res) => {
    try {
      const { siteId } = req.params;
      const userId = req.user.id;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Delete published folder
      const publishedFolder = path.join(
        __dirname, '..', '..', 'sites', 'published', site.name
      );
      if (fs.existsSync(publishedFolder)) {
        fs.rmSync(publishedFolder, { recursive: true, force: true });
      }

      // Update site status
      site.status = 'unpublished';
      site.updatedAt = new Date().toISOString();

      await dataService.remove('sites', siteId);
      site.id = siteId;
      await dataService.add('sites', site);

      logger.info('Site unpublished', { siteId });

      res.json({
        success: true,
        message: 'Site unpublished successfully'
      });
    } catch (error) {
      logger.error('Error unpublishing site', error);
      res.status(500).json({ error: 'Failed to unpublish site' });
    }
  });

  return router;
};

// Helper function to build site HTML
function buildSiteHTML(site, pages, media) {
  const homePage = pages.find(p => p.slug === 'home') || pages[0];
  const pageContent = homePage ? buildPageContent(homePage) : '<p>Welcome to ' + site.title + '</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${site.title}</title>
  <meta name="description" content="${site.description || site.title}">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
  <style>
    :root {
      --primary-color: ${site.settings.colors.primary};
      --secondary-color: ${site.settings.colors.secondary};
    }
    body {
      font-family: ${site.settings.fonts.body};
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: ${site.settings.fonts.heading};
      color: var(--primary-color);
    }
    .navbar {
      background-color: var(--primary-color) !important;
    }
    .navbar-brand, .navbar-brand:hover {
      color: white !important;
      font-weight: bold;
    }
    .nav-link {
      color: white !important;
    }
    .nav-link:hover {
      opacity: 0.8;
    }
    main {
      min-height: calc(100vh - 200px);
    }
    footer {
      background-color: #f8f9fa;
      border-top: 1px solid #dee2e6;
      margin-top: 3rem;
    }
    .hero {
      background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
      color: white;
      padding: 4rem 0;
      text-align: center;
    }
  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-dark">
    <div class="container">
      <a class="navbar-brand" href="index.html">${site.title}</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav ms-auto">
          ${pages.map((p, i) => `<li class="nav-item"><a class="nav-link" href="${p.slug === 'home' ? 'index.html' : p.slug + '.html'}">${p.title}</a></li>`).join('')}
        </ul>
      </div>
    </div>
  </nav>

  <main>
    ${pageContent}
  </main>

  <footer class="py-4">
    <div class="container">
      <p class="text-center text-muted mb-0">&copy; ${new Date().getFullYear()} ${site.title}. All rights reserved.</p>
    </div>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

// Helper function to build page content
function buildPageContent(page) {
  if (!page.content || page.content.length === 0) {
    return `<div class="container my-5">
      <h1>${page.title}</h1>
      <p>This page is being built. Check back soon!</p>
    </div>`;
  }

  return `<div class="container my-5">
    <h1>${page.title}</h1>
    <div class="page-content">
      ${page.content.map(block => {
        if (block.type === 'text') {
          return `<p>${block.content}</p>`;
        } else if (block.type === 'heading') {
          return `<h${block.level}>${block.content}</h${block.level}>`;
        } else if (block.type === 'image') {
          return `<img src="${block.src}" alt="${block.alt || ''}" class="img-fluid my-3">`;
        }
        return '';
      }).join('')}
    </div>
  </div>`;
}
