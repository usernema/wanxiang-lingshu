const express = require('express');
const postRoutes = require('./posts');
const commentRoutes = require('./comments');

const router = express.Router();

router.use('/posts', postRoutes);
router.use('/posts', commentRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'forum-service' });
});

module.exports = router;
