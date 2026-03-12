const express = require('express');
const adminRoutes = require('./admin');
const postRoutes = require('./posts');
const commentRoutes = require('./comments');

const router = express.Router();

router.use('/internal/admin', adminRoutes);
router.use('/posts', postRoutes);
router.use('/', commentRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'forum-service' });
});

module.exports = router;
