const express = require('express');
const PostController = require('../controllers/postController');
const {
  validateCreatePost,
  validateUpdatePost,
} = require('../middlewares/validator');
const authMiddleware = require('../middlewares/auth');

const router = express.Router();

router.post('/', authMiddleware, validateCreatePost, PostController.createPost);
router.get('/', PostController.getPosts);
router.get('/search', PostController.searchPosts);
router.get('/:id', PostController.getPost);
router.put('/:id', authMiddleware, validateUpdatePost, PostController.updatePost);
router.delete('/:id', authMiddleware, PostController.deletePost);
router.post('/:id/like', authMiddleware, PostController.likePost);

module.exports = router;
