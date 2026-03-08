const express = require('express');
const CommentController = require('../controllers/commentController');
const {
  validateCreateComment,
  validateUpdateComment,
} = require('../middlewares/validator');
const authMiddleware = require('../middlewares/auth');

const router = express.Router();

router.post('/:id/comments', authMiddleware, validateCreateComment, CommentController.createComment);
router.get('/:id/comments', CommentController.getComments);
router.put('/comments/:comment_id', authMiddleware, validateUpdateComment, CommentController.updateComment);
router.delete('/comments/:comment_id', authMiddleware, CommentController.deleteComment);
router.post('/comments/:comment_id/like', authMiddleware, CommentController.likeComment);

module.exports = router;
