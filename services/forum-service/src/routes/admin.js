const express = require('express');
const PostController = require('../controllers/postController');
const CommentController = require('../controllers/commentController');
const { validateAdminModeration } = require('../middlewares/validator');
const { requireAdmin } = require('../middlewares/admin');

const router = express.Router();

router.use(requireAdmin);

router.get('/posts', PostController.getAdminPosts);
router.get('/posts/:id/comments', CommentController.getAdminComments);
router.patch('/posts/:id/status', validateAdminModeration, PostController.moderatePost);
router.patch('/comments/:comment_id/status', validateAdminModeration, CommentController.moderateComment);

module.exports = router;
