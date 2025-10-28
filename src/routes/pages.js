const express = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = (dataService, logger) => {
  const router = express.Router();

  // GET /api/pages/:siteId - Get all pages for site
  router.get('/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const pages = await dataService.jsonFindByCriteria('pages', { siteId });
      res.json(pages);
    } catch (error) {
      logger.error('Error fetching pages', error);
      res.status(500).json({ error: 'Failed to fetch pages' });
    }
  });

  // POST /api/pages - Create new page
  router.post('/', async (req, res) => {
    try {
      const { siteId, name, title, slug } = req.body;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!name || !title) {
        return res.status(400).json({ error: 'Name and title are required' });
      }

      // Create page object
      const pageId = uuidv4();
      const page = {
        id: pageId,
        siteId,
        name,
        title,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        status: 'draft',
        content: [],
        seo: {
          title: title,
          description: '',
          keywords: []
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: null,
        order: (site.pages || []).length
      };

      const pageUuid = await dataService.add('pages', page);

      // Update site's pages list
      site.pages = site.pages || [];
      site.pages.push(pageId);
      await dataService.remove('sites', siteId);
      site.id = siteId;
      await dataService.add('sites', site);

      logger.info('Page created', { pageId, siteId, pageName: page.name });

      res.status(201).json({
        success: true,
        page: {
          id: pageId,
          ...page,
          pageUuid
        }
      });
    } catch (error) {
      logger.error('Error creating page', error);
      res.status(500).json({ error: 'Failed to create page' });
    }
  });

  // GET /api/pages/:siteId/:pageId - Get single page
  router.get('/:siteId/:pageId', async (req, res) => {
    try {
      const { siteId, pageId } = req.params;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const page = await dataService.getByUuid('pages', pageId);
      if (!page || page.siteId !== siteId) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json(page);
    } catch (error) {
      logger.error('Error fetching page', error);
      res.status(500).json({ error: 'Failed to fetch page' });
    }
  });

  // PUT /api/pages/:pageId - Update page content
  router.put('/:pageId', async (req, res) => {
    try {
      const { pageId } = req.params;
      const { siteId, content, seo, title } = req.body;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const page = await dataService.getByUuid('pages', pageId);
      if (!page || page.siteId !== siteId) {
        return res.status(404).json({ error: 'Page not found' });
      }

      if (content) page.content = content;
      if (seo) page.seo = { ...page.seo, ...seo };
      if (title) page.title = title;
      page.updatedAt = new Date().toISOString();
      page.status = 'draft';

      await dataService.remove('pages', pageId);
      page.id = pageId;
      await dataService.add('pages', page);

      logger.info('Page updated', { pageId });
      res.json({ success: true, page });
    } catch (error) {
      logger.error('Error updating page', error);
      res.status(500).json({ error: 'Failed to update page' });
    }
  });

  // DELETE /api/pages/:pageId - Delete page
  router.delete('/:pageId', async (req, res) => {
    try {
      const { pageId } = req.params;
      const { siteId } = req.body;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const page = await dataService.getByUuid('pages', pageId);
      if (!page || page.siteId !== siteId) {
        return res.status(404).json({ error: 'Page not found' });
      }

      // Remove page
      await dataService.remove('pages', pageId);

      // Update site's pages list
      site.pages = (site.pages || []).filter(id => id !== pageId);
      await dataService.remove('sites', siteId);
      site.id = siteId;
      await dataService.add('sites', site);

      logger.info('Page deleted', { pageId });
      res.json({ success: true, message: 'Page deleted' });
    } catch (error) {
      logger.error('Error deleting page', error);
      res.status(500).json({ error: 'Failed to delete page' });
    }
  });

  return router;
};
