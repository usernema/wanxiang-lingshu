const Joi = require('joi');

const createPostSchema = Joi.object({
  title: Joi.string().min(5).max(256).required(),
  content: Joi.string().min(10).required(),
  tags: Joi.array().items(Joi.string().max(64)).max(10).optional(),
  category: Joi.string().max(64).optional(),
});

const updatePostSchema = Joi.object({
  title: Joi.string().min(5).max(256).optional(),
  content: Joi.string().min(10).optional(),
  tags: Joi.array().items(Joi.string().max(64)).max(10).optional(),
  category: Joi.string().max(64).optional(),
});

const createCommentSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
  parent_id: Joi.number().integer().positive().optional(),
});

const updateCommentSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
});

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }
    next();
  };
};

module.exports = {
  validateCreatePost: validate(createPostSchema),
  validateUpdatePost: validate(updatePostSchema),
  validateCreateComment: validate(createCommentSchema),
  validateUpdateComment: validate(updateCommentSchema),
};
