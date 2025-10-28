'use strict';

const API_BASE_PATH = '/applications/cms/api';

/**
 * Registers backoffice/admin routes (status, feed, sitemaps).
 * @param {Object} app Express application
 * @param {Object} dataStore Data store instance
 * @param {Object} log Logger instance
 */
module.exports = (app, dataStore, log) => {
  const { listRecords, getHomeFeed } = dataStore;

  /**
   * GET BLOG STATUS (health check with statistics)
   */
  app.get(`${API_BASE_PATH}/status`, async (req, res) => {
    try {
       const status = {status: "running"}; 
       res.status(status).json({
            data,
            meta: meta || {}
        });
    } catch (error) {
      log.error('Status endpoint failed', { error: error.message });
      sendError(res, 500, 'STATUS_ERROR', 'Unable to retrieve CMS status.');
    }
  });
};