const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

module.exports = (filing, dataService, logger) => {
  const router = express.Router();
  const upload = multer({ dest: path.join(__dirname, '..', '..', 'public', 'uploads') });

  // POST /api/media/upload - Upload media file
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const { siteId } = req.body;
      const userId = req.user.id;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Create media record
      const mediaId = uuidv4();
      const filename = `${mediaId}-${req.file.originalname}`;
      const filepath = path.join(siteId, filename);

      // Move uploaded file
      const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', siteId);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const newPath = path.join(uploadDir, filename);
      fs.renameSync(req.file.path, newPath);

      // Save media record to dataservice
      const media = {
        id: mediaId,
        siteId,
        filename: req.file.originalname,
        filepath: `/uploads/${filepath}`,
        size: req.file.size,
        mimetype: req.file.mimetype,
        createdAt: new Date().toISOString()
      };

      const mediaUuid = await dataService.add('media', media);

      logger.info('Media uploaded', { mediaId, filename: req.file.originalname, siteId });

      res.status(201).json({
        success: true,
        media: {
          id: mediaId,
          ...media,
          mediaUuid
        }
      });
    } catch (error) {
      logger.error('Error uploading media', error);
      res.status(500).json({ error: 'Failed to upload media' });
    }
  });

  // GET /api/media/:siteId - Get all media for site
  router.get('/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const media = await dataService.jsonFindByCriteria('media', { siteId });
      res.json(media);
    } catch (error) {
      logger.error('Error fetching media', error);
      res.status(500).json({ error: 'Failed to fetch media' });
    }
  });

  // DELETE /api/media/:mediaId - Delete media
  router.delete('/:mediaId', async (req, res) => {
    try {
      const { mediaId } = req.params;
      const { siteId } = req.body;

      // Verify user owns site
      const site = await dataService.getByUuid('sites', siteId);
      if (!site || site.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const media = await dataService.getByUuid('media', mediaId);
      if (!media || media.siteId !== siteId) {
        return res.status(404).json({ error: 'Media not found' });
      }

      // Delete file
      const uploadDir = path.join(__dirname, '..', '..', 'public');
      const filePath = path.join(uploadDir, media.filepath.substring(1));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Remove from dataservice
      await dataService.remove('media', mediaId);

      logger.info('Media deleted', { mediaId });
      res.json({ success: true, message: 'Media deleted' });
    } catch (error) {
      logger.error('Error deleting media', error);
      res.status(500).json({ error: 'Failed to delete media' });
    }
  });

  return router;
};
